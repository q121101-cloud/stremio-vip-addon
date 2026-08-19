'use strict';

/**
 * ============================================================
 *  VIP Movies Addon — src/routes/stream.js
 *  Parallel Stream Aggregator with Multi-ID Resolution
 *  Supports IMDb IDs (tt...), Provider IDs (kkphim_*, nguonc_*, vsmov_*),
 *  and Raw Slugs with Vietnamese Title Localization Fallback
 * ============================================================
 */

const express = require('express');
const router = express.Router();
const dbCache = require('../db/cache');
const supabaseDb = require('../db/supabase');
const kkphim = require('../providers/kkphim');
const nguonc = require('../providers/nguonc');
const vsmov = require('../providers/vsmov');
const { decodeBitmask, decodeConfig } = require('../config/compressor');
const cinemeta = require('../lib/cinemeta');
const { scoreMatch, generateSearchKeywords } = require('../lib/utils');
const { TIMEOUTS, TTL } = require('../config/constants');

// Known Asian/Korean series & prominent title dictionary for instant high-accuracy localization
const KNOWN_TITLE_LOCALIZATIONS = {
  tt7458054: {
    title: 'While You Were Sleeping',
    year: 2017,
    type: 'series',
    aliases: ['Khi Nàng Say Giấc', 'While You Were Sleeping', '당신이 잠든 사이에', 'Dangsin-i Jamdeun Saie'],
  },
  tt26450613: {
    title: 'A Shop for Killers',
    year: 2024,
    type: 'series',
    aliases: ['Cửa Hàng Sát Thủ', 'Killereui Syopingmol', '킬러들의 쇼핑몰'],
  },
  tt10730822: {
    title: 'Crash Landing on You',
    year: 2019,
    type: 'series',
    aliases: ['Hạ Cánh Nơi Anh', 'Sarangui Bulsichak', '사랑의 불시착'],
  },
  tt11449830: {
    title: 'Itaewon Class',
    year: 2020,
    type: 'series',
    aliases: ['Tầng Lớp Itaewon', 'Itaewon Keullasseu', '이태원 클라쓰'],
  },
  tt15326988: {
    title: 'The Glory',
    year: 2022,
    type: 'series',
    aliases: ['Vinh Quang Trong Thù Hận', 'Deo Geullori', '더 글로리'],
  },
  tt10919420: {
    title: 'Squid Game',
    year: 2021,
    type: 'series',
    aliases: ['Trò Chơi Con Mực', 'Ojing-eo Geim', '오징어 게임'],
  },
  tt0373889: {
    title: 'Harry Potter and the Prisoner of Azkaban',
    year: 2004,
    type: 'movie',
    aliases: ['Harry Potter và Tên Tù Nhân Ngục Azkaban'],
  },
  tt34809853: {
    title: 'Teach You a Lesson',
    year: 2024,
    type: 'series',
    aliases: ['Bài Học Đáng Đời', 'Dạy Cho Mày Bài Học', 'Teach You a Lesson', '참교육', 'True Education'],
  },
  tt1375666: {
    title: 'Inception',
    year: 2010,
    type: 'movie',
    aliases: ['Kẻ Đánh Cắp Giấc Mơ'],
  },
};

// Helper bọc timeout 3000ms cho từng provider
const withTimeout = (promise, ms = 3000, label = 'Provider') => {
  let timer;
  const timeoutPromise = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(`[${label}] Timeout after ${ms}ms`)), ms);
  });
  return Promise.race([Promise.resolve(promise), timeoutPromise]).finally(() => clearTimeout(timer));
};

function encodeB64(str) {
  if (!str) return '';
  return Buffer.from(str, 'utf8').toString('base64url');
}

function sendJSON(res, data) {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', '*');
  res.setHeader('Cache-Control', 'max-age=300, stale-while-revalidate=600');
  return res.json(data);
}

function getStreamPriority(stream) {
  if (!stream) return 999;
  const title = (stream.title || '').toLowerCase();
  const name  = (stream.name || '').toLowerCase();
  const text  = `${name} ${title}`;

  let providerRank = 4;
  if (text.includes('vsmov') || text.includes('vip 1')) providerRank = 1;
  else if (text.includes('kkphim') || text.includes('vip 2')) providerRank = 2;
  else if (text.includes('nguonc') || text.includes('vip 3')) providerRank = 3;

  const is4K         = text.includes('4k') || text.includes('ultra hd') || text.includes('3840x2160') || text.includes('uhd');
  const isVietsub    = text.includes('vietsub') || text.includes('phụ đề') || text.includes('phu de');
  const isThuyetMinh = text.includes('thuyết minh') || text.includes('thuyet minh') || /\btm\b/.test(text) || text.includes('voiceover');
  const isLongTieng  = text.includes('lồng tiếng') || text.includes('long tieng') || /\blt\b/.test(text) || text.includes('dub');

  let bucket = 400;
  if (is4K) bucket = 0;
  else if (isVietsub) bucket = 100;
  else if (isThuyetMinh) bucket = 200;
  else if (isLongTieng) bucket = 300;

  if (is4K) {
    let subAudioOffset = 0;
    if (isVietsub) subAudioOffset = 0;
    else if (isThuyetMinh) subAudioOffset = 1;
    else if (isLongTieng) subAudioOffset = 2;
    else subAudioOffset = 3;
    return bucket + (providerRank * 10) + subAudioOffset;
  }

  return bucket + providerRank;
}

function findBestMatchSlug(items, title, year, targetType = 'movie', season = 1) {
  if (!Array.isArray(items) || items.length === 0 || !title) return null;
  let bestSlug = null;
  let highestScore = -1;

  for (const item of items) {
    if (!item.slug) continue;
    let score = scoreMatch(item, title, year, season);
    if (item.origin_name) {
      const origScore = scoreMatch({ ...item, name: item.origin_name }, title, year, season);
      score = Math.max(score, origScore);
    }
    if (item.original_name) {
      const origScore = scoreMatch({ ...item, name: item.original_name }, title, year, season);
      score = Math.max(score, origScore);
    }

    const itemIsSeries = item.type === 'series' || item.type === 'hoathinh' || item.type === 'tvshows';
    if (targetType === 'series') {
      if (itemIsSeries) score += 0.2;
      else if (item.type === 'single' || item.type === 'movie') score -= 0.3;
    } else if (targetType === 'movie') {
      if (!itemIsSeries) score += 0.1;
      else score -= 0.2;
    }

    if (score > highestScore && score >= 0.35) {
      highestScore = score;
      bestSlug = item.slug;
    }
  }

  if (bestSlug) return bestSlug;
  if (items.length === 1 && items[0]?.slug) return items[0].slug;
  return null;
}

async function searchProviderWithKeywords(provider, keywords, limit = 5) {
  const combined = [];
  const seenSlugs = new Set();

  for (const kw of keywords) {
    if (!kw) continue;
    try {
      const res = await provider.search(kw, limit);
      const items = Array.isArray(res) ? res : (res?.items || res?.data?.items || []);
      for (const it of items) {
        if (it?.slug && !seenSlugs.has(it.slug)) {
          seenSlugs.add(it.slug);
          combined.push(it);
        }
      }
    } catch {}
  }
  return combined;
}

const STREAM_ROUTES = [
  '/stream/:type/:id.json',
  '/c/:bitmask/stream/:type/:id.json',
  '/:config/stream/:type/:id.json',
];

router.get(STREAM_ROUTES, async (req, res) => {
  const startTime = Date.now();
  const rawId   = req.params.id || '';
  const rawType = req.params.type || 'movie';
  const id      = rawId.replace(/\.json$/i, '');
  const type    = rawType.replace(/\.json$/i, '');
  const proxyBase = `${req.headers['x-forwarded-proto'] || req.protocol}://${req.headers['x-forwarded-host'] || req.get('host')}`.replace(/\/$/, '');

  try {
    // Active providers from bitmask or token
    let activeProviders = ['nguonc', 'kkphim', 'vsmov'];
    const token = req.params.bitmask || req.params.config;
    if (token) {
      if (/^\d+$/.test(token)) {
        activeProviders = decodeBitmask(token);
      } else {
        const cfg = decodeConfig(token);
        if (cfg?.providers && cfg.providers.length > 0) {
          activeProviders = cfg.providers;
        }
      }
    }
    if (!Array.isArray(activeProviders) || activeProviders.length === 0) {
      activeProviders = ['nguonc', 'kkphim', 'vsmov'];
    }

    const provKey = activeProviders.slice().sort().join(',');
    const streamKey = `stream:${provKey}:${type}:${id}`;

    // BƯỚC 1: Kiểm tra Cache L1/L2 (< 50ms)
    const cachedStreams = await dbCache.getCache(streamKey);
    if (cachedStreams && Array.isArray(cachedStreams) && cachedStreams.length > 0) {
      const elapsed = Date.now() - startTime;
      console.log(`[Stream Aggregator] CACHE HIT (${elapsed}ms) id=${id} streams=${cachedStreams.length}`);
      return sendJSON(res, { streams: cachedStreams });
    }

    // BƯỚC 2: Phân tích ID đa định dạng (IMDb, Catalog Prefix, Raw Slug)
    let rawSlug = null;
    let providerHint = null;
    let imdbId = null;
    let season = 1;
    let episode = 1;

    if (id.startsWith('tt')) {
      const parts = id.split(':');
      imdbId = parts[0];
      season = parts[1] ? (parseInt(parts[1], 10) || 1) : 1;
      episode = parts[2] ? (parseInt(parts[2], 10) || 1) : 1;
    } else if (id.startsWith('kkphim_') || id.startsWith('kkphim:')) {
      providerHint = 'kkphim';
      const rest = id.replace(/^kkphim[_:]/, '');
      const parts = rest.split(':');
      rawSlug = parts[0];
      if (parts.length >= 3) {
        season = parseInt(parts[1], 10) || 1;
        episode = parseInt(parts[2], 10) || 1;
      } else if (parts.length === 2) {
        episode = parseInt(parts[1], 10) || 1;
      }
    } else if (id.startsWith('nguonc_') || id.startsWith('nguonc:')) {
      providerHint = 'nguonc';
      const rest = id.replace(/^nguonc[_:]/, '');
      const parts = rest.split(':');
      rawSlug = parts[0];
      if (parts.length >= 3) {
        // Format nguonc_slug:sIdx:epName
        const rawEp = decodeURIComponent(parts[2]);
        const numMatch = rawEp.match(/\d+/);
        episode = numMatch ? (parseInt(numMatch[0], 10) || 1) : (parseInt(rawEp, 10) || 1);
        season = parseInt(parts[1], 10) || 1;
      } else if (parts.length === 2) {
        const rawEp = decodeURIComponent(parts[1]);
        const numMatch = rawEp.match(/\d+/);
        episode = numMatch ? (parseInt(numMatch[0], 10) || 1) : (parseInt(rawEp, 10) || 1);
      }
    } else if (id.startsWith('vsmov_') || id.startsWith('vsmov:')) {
      providerHint = 'vsmov';
      const rest = id.replace(/^vsmov[_:]/, '');
      const parts = rest.split(':');
      rawSlug = parts[0];
      if (parts.length >= 3) {
        season = parseInt(parts[1], 10) || 1;
        episode = parseInt(parts[2], 10) || 1;
      } else if (parts.length === 2) {
        episode = parseInt(parts[1], 10) || 1;
      }
    } else {
      const parts = id.split(':');
      rawSlug = parts[0];
      if (parts.length >= 3) {
        season = parseInt(parts[1], 10) || 1;
        episode = parseInt(parts[2], 10) || 1;
      } else if (parts.length === 2) {
        episode = parseInt(parts[1], 10) || 1;
      }
    }

    // Lấy mapping từ Supabase nếu có
    let mapping = null;
    if (imdbId) {
      try {
        mapping = await supabaseDb.getMediaMapping(imdbId);
      } catch {}
    }

    let canonicalTitle = mapping?.title || null;
    let canonicalYear  = mapping?.year || null;
    let aliases = [];

    let resolvedKKSlug = mapping?.slug_kkphim || (providerHint === 'kkphim' ? rawSlug : null);
    let resolvedNguonCSlug = mapping?.slug_nguonc || (providerHint === 'nguonc' ? rawSlug : null);
    let resolvedVsMovSlug = mapping?.slug_vsmov || (providerHint === 'vsmov' ? rawSlug : null);

    // Xử lý tra cứu chi tiết từ Catalog Slug nếu có
    if (rawSlug) {
      if (providerHint === 'kkphim' || !canonicalTitle) {
        try {
          const kkDetail = await kkphim.getDetail(rawSlug);
          if (kkDetail?.movie) {
            canonicalTitle = canonicalTitle || kkDetail.movie.name || kkDetail.movie.origin_name;
            canonicalYear  = canonicalYear || kkDetail.movie.year;
            resolvedKKSlug = rawSlug;
          }
        } catch {}
      }
      if (providerHint === 'nguonc' || (!canonicalTitle && !resolvedKKSlug)) {
        try {
          const nguonDetail = await nguonc.getDetail(rawSlug);
          if (nguonDetail?.movie) {
            canonicalTitle = canonicalTitle || nguonDetail.movie.name || nguonDetail.movie.original_name;
            canonicalYear  = canonicalYear || nguonDetail.movie.year;
            resolvedNguonCSlug = rawSlug;
          }
        } catch {}
      }
      if (providerHint === 'vsmov' || (!canonicalTitle && !resolvedKKSlug && !resolvedNguonCSlug)) {
        try {
          const vsmovDetail = await vsmov.getDetail(rawSlug);
          if (vsmovDetail?.movie) {
            canonicalTitle = canonicalTitle || vsmovDetail.movie.name || vsmovDetail.movie.title;
            canonicalYear  = canonicalYear || vsmovDetail.movie.year;
            resolvedVsMovSlug = rawSlug;
          }
        } catch {}
      }
    }

    // ON-THE-FLY CINEMETA & SMART TITLE LOCALIZATION RESOLVER CHO IMDB ID
    if (imdbId && imdbId.startsWith('tt')) {
      const cleanImdb = imdbId.toLowerCase().trim();
      const known = KNOWN_TITLE_LOCALIZATIONS[cleanImdb];

      if (known) {
        if (!canonicalTitle) canonicalTitle = known.title;
        if (!canonicalYear) canonicalYear = known.year;
        if (Array.isArray(known.aliases)) {
          aliases = Array.from(new Set([...aliases, ...known.aliases]));
        }
      }

      if (!canonicalTitle || !canonicalYear) {
        try {
          const meta = await cinemeta.resolveCinemeta(type, imdbId);
          if (meta) {
            canonicalTitle = meta.name || meta.title || canonicalTitle;
            canonicalYear  = meta.year || canonicalYear;
            if (Array.isArray(meta.aliases) && meta.aliases.length > 0) {
              aliases = Array.from(new Set([...aliases, ...meta.aliases]));
            }
          }
        } catch (cinemetaErr) {
          console.warn(`[Cinemeta Resolver] ${imdbId}:`, cinemetaErr.message);
        }
      }
    }

    // Nếu có canonicalTitle mà còn thiếu slug của các provider active -> Tìm kiếm song song
    if (canonicalTitle && (!resolvedKKSlug || !resolvedNguonCSlug || !resolvedVsMovSlug)) {
      try {
        const searchKeywords = generateSearchKeywords({
          title: canonicalTitle,
          aliases,
          season,
          year: canonicalYear,
        });

        const [kkSearchRes, nguoncSearchRes, vsmovSearchRes] = await Promise.allSettled([
          !resolvedKKSlug && activeProviders.includes('kkphim')
            ? searchProviderWithKeywords(kkphim, searchKeywords, 5)
            : Promise.resolve([]),
          !resolvedNguonCSlug && activeProviders.includes('nguonc')
            ? searchProviderWithKeywords(nguonc, searchKeywords, 5)
            : Promise.resolve([]),
          !resolvedVsMovSlug && activeProviders.includes('vsmov')
            ? searchProviderWithKeywords(vsmov, searchKeywords, 5)
            : Promise.resolve([]),
        ]);

        const kkItems = kkSearchRes.status === 'fulfilled' ? kkSearchRes.value : [];
        const nguoncItems = nguoncSearchRes.status === 'fulfilled' ? nguoncSearchRes.value : [];
        const vsmovItems = vsmovSearchRes.status === 'fulfilled' ? (vsmovSearchRes.value?.items || vsmovSearchRes.value || []) : [];

        if (!resolvedKKSlug) resolvedKKSlug = findBestMatchSlug(kkItems, canonicalTitle, canonicalYear, type, season);
        if (!resolvedNguonCSlug) resolvedNguonCSlug = findBestMatchSlug(nguoncItems, canonicalTitle, canonicalYear, type, season);
        if (!resolvedVsMovSlug) resolvedVsMovSlug = findBestMatchSlug(vsmovItems, canonicalTitle, canonicalYear, type, season);

        if (imdbId) {
          mapping = {
            ...(mapping || {}),
            imdb_id: imdbId,
            type,
            title: canonicalTitle,
            year: canonicalYear,
            slug_kkphim: resolvedKKSlug,
            slug_nguonc: resolvedNguonCSlug,
            slug_vsmov: resolvedVsMovSlug,
          };
          supabaseDb.upsertMediaMapping(mapping).catch(() => {});
        }
      } catch (searchErr) {
        console.warn(`[Parallel Slug Resolver] ${id}:`, searchErr.message);
      }
    }

    const queryPayload = {
      imdbId,
      type,
      title: canonicalTitle,
      year: canonicalYear,
      season,
      episode,
      aliases,
      proxyBase,
    };

    // BƯỚC 3: Gọi đồng thời các Provider Core được bật (Promise.allSettled)
    const queryProviders = [];

    // Tier 1: VSMOV (Ưu tiên 4K)
    if (activeProviders.includes('vsmov')) {
      queryProviders.push(
        withTimeout(
          vsmov.getStreams({
            ...queryPayload,
            slug: resolvedVsMovSlug || (providerHint === 'vsmov' ? rawSlug : null),
          }),
          3000,
          'VSMOV'
        ).then((streams) => {
          if (!Array.isArray(streams)) return [];
          return streams.map((s) => {
            const proxiedUrl = s.url && s.url.startsWith('http') && !s.url.includes('/hls/')
              ? `${proxyBase}/hls/manifest.m3u8?url=${encodeB64(s.url)}&ref=${encodeB64('https://vsmov.com/')}`
              : s.url;

            const streamObj = {
              name: s.name || '[VIP 1 • VSMOV 4K]',
              title: s.title || `[4K Ultra HD] ${s.server || 'Server VIP'} - ${s.quality || '3840x2160'}\n⚡ Tốc độ cao • HLS Proxy`,
              behaviorHints: s.behaviorHints || { notWebReady: false },
              subtitles: s.subtitles || undefined,
            };

            if (proxiedUrl) {
              streamObj.url = proxiedUrl;
            } else if (s.externalUrl) {
              streamObj.externalUrl = s.externalUrl;
            }

            return streamObj;
          });
        }).catch(() => [])
      );
    }

    // Tier 2: KKPHIM (Full HD / Đa dạng lồng tiếng & Vietsub)
    if (activeProviders.includes('kkphim')) {
      queryProviders.push(
        withTimeout(
          kkphim.getStreams({
            ...queryPayload,
            slug: resolvedKKSlug || (providerHint === 'kkphim' ? rawSlug : null),
          }),
          3000,
          'KKPhim'
        ).then((streams) => {
          if (!Array.isArray(streams)) return [];
          return streams.map((s) => {
            const proxiedUrl = s.url && s.url.startsWith('http') && !s.url.includes('/hls/')
              ? `${proxyBase}/hls/manifest.m3u8?url=${encodeB64(s.url)}&ref=${encodeB64('https://player.phimapi.com/')}`
              : s.url;

            const streamObj = {
              name: s.name || '[VIP 2 • KKPHIM]',
              title: s.title || `[FHD 1080p] ${s.serverName || 'Server VIP'} [Tập ${episode}]\n⚡ Vietsub/Thuyết Minh • HLS Proxy`,
              behaviorHints: s.behaviorHints || { notWebReady: false },
              subtitles: s.subtitles || undefined,
            };

            if (proxiedUrl) {
              streamObj.url = proxiedUrl;
            } else if (s.externalUrl) {
              streamObj.externalUrl = s.externalUrl;
            }

            return streamObj;
          });
        }).catch(() => [])
      );
    }

    // Tier 3: NGUONC (Dự phòng ổn định cao)
    if (activeProviders.includes('nguonc')) {
      queryProviders.push(
        withTimeout(
          nguonc.getStreams({
            ...queryPayload,
            slug: resolvedNguonCSlug || (providerHint === 'nguonc' ? rawSlug : null),
          }),
          3000,
          'NguonC'
        ).then((streams) => {
          if (!Array.isArray(streams)) return [];
          return streams.map((s) => {
            const proxiedUrl = s.url && s.url.startsWith('http') && !s.url.includes('/hls/')
              ? `${proxyBase}/hls/manifest.m3u8?url=${encodeB64(s.url)}&ref=${encodeB64('https://phim.nguonc.com/')}`
              : s.url;

            const streamObj = {
              name: s.name || '[VIP 3 • NGUONC]',
              title: s.title || `[FHD 1080p] ${s.serverName || 'Server VIP'} [Tập ${episode}]\n⚡ Dự phòng chất lượng cao • HLS Proxy`,
              behaviorHints: s.behaviorHints || { notWebReady: false },
              subtitles: s.subtitles || undefined,
            };

            if (proxiedUrl) {
              streamObj.url = proxiedUrl;
            } else if (s.externalUrl) {
              streamObj.externalUrl = s.externalUrl;
            }

            return streamObj;
          });
        }).catch(() => [])
      );
    }

    const results = await Promise.allSettled(queryProviders);
    let aggregatedStreams = [];

    results.forEach((resItem) => {
      if (resItem.status === 'fulfilled' && Array.isArray(resItem.value)) {
        aggregatedStreams = aggregatedStreams.concat(resItem.value);
      }
    });

    // Deduplicate streams
    const seenUrls = new Set();
    aggregatedStreams = aggregatedStreams.filter((stream) => {
      if (!stream) return false;
      const key = stream.url || stream.externalUrl;
      if (!key) return false;
      if (seenUrls.has(key)) return false;
      seenUrls.add(key);
      return true;
    });

    // Sort by VIP Priority (4K -> Vietsub -> TM -> LT)
    aggregatedStreams.sort((a, b) => getStreamPriority(a) - getStreamPriority(b));

    const totalElapsed = Date.now() - startTime;
    console.log(`[Stream Aggregator] id=${id} → Total ${aggregatedStreams.length} high-speed streams (${totalElapsed}ms)`);

    // BƯỚC 4: Lưu vào Cache (Series: 4 giờ, Movie: 24 giờ)
    if (aggregatedStreams.length > 0) {
      const isSeriesItem = type === 'series' || id.includes(':');
      const ttl = isSeriesItem ? (TTL?.SERIES || 4 * 3600) : (TTL?.MOVIE || 24 * 3600);
      await dbCache.setCache(streamKey, aggregatedStreams, ttl);
    }

    return sendJSON(res, { streams: aggregatedStreams });
  } catch (err) {
    console.error('[Stream Aggregator Error]:', err.message);
    return sendJSON(res, { streams: [] });
  }
});

module.exports = router;
