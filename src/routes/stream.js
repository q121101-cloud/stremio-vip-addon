'use strict';

/**
 * ============================================================
 *  VIP Movies Addon — src/routes/stream.js
 *  Parallel Stream Aggregator with On-the-fly Cinemeta Title Resolver
 * ============================================================
 */

const express = require('express');
const router = express.Router();
const { getCache, setCache } = require('../db/cache');
const { getMediaMapping, upsertMediaMapping } = require('../db/supabase');
const kkphim = require('../providers/kkphim');
const nguonc = require('../providers/nguonc');
const vsmov = require('../providers/vsmov');
const { decodeConfig } = require('../config/compressor');
const { resolveCinemeta } = require('../lib/cinemeta');
const { scoreMatch } = require('../lib/utils');
const { TIMEOUTS, TTL } = require('../config/constants');

// Helper bọc timeout 3000ms cho từng provider
const withTimeout = (promise, ms = 3000, label = 'Provider') => {
  let timer;
  const timeoutPromise = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(`[${label}] Timeout after ${ms}ms`)), ms);
  });
  return Promise.race([promise, timeoutPromise]).finally(() => clearTimeout(timer));
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

function findBestMatchSlug(items, title, year) {
  if (!Array.isArray(items) || items.length === 0 || !title) return null;
  let bestSlug = null;
  let highestScore = 0;

  for (const item of items) {
    if (!item.slug) continue;
    const score1 = scoreMatch(title, item.name, year, item.year);
    const score2 = item.origin_name ? scoreMatch(title, item.origin_name, year, item.year) : 0;
    const score3 = item.original_name ? scoreMatch(title, item.original_name, year, item.year) : 0;
    const maxScore = Math.max(score1, score2, score3);

    if (maxScore > highestScore && maxScore >= 0.4) {
      highestScore = maxScore;
      bestSlug = item.slug;
    }
  }

  return bestSlug || items[0]?.slug || null;
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
  const streamKey = `${id}`;
  const proxyBase = `${req.headers['x-forwarded-proto'] || req.protocol}://${req.headers['x-forwarded-host'] || req.get('host')}`.replace(/\/$/, '');

  try {
    // BƯỚC 1: Kiểm tra Cache L1/L2 (< 50ms)
    const cachedStreams = await getCache(streamKey);
    if (cachedStreams && Array.isArray(cachedStreams) && cachedStreams.length > 0) {
      const elapsed = Date.now() - startTime;
      console.log(`[Stream Aggregator] CACHE HIT (${elapsed}ms) id=${id} streams=${cachedStreams.length}`);
      return sendJSON(res, { streams: cachedStreams });
    }

    // BƯỚC 2: Phân tích ID (Movie: tt1234567 | Series: tt1234567:1:1)
    const parts = id.split(':');
    const imdbId = parts[0];
    const season = parts[1] ? parseInt(parts[1], 10) : 1;
    const episode = parts[2] ? parseInt(parts[2], 10) : 1;

    // Lấy mapping từ Supabase nếu có
    let mapping = null;
    try {
      mapping = await getMediaMapping(imdbId);
    } catch {}

    let canonicalTitle = mapping?.title || null;
    let canonicalYear  = mapping?.year || null;
    let aliases = [];

    // ON-THE-FLY CINEMETA RESOLVER & LIVE SEARCH FALLBACK
    if (imdbId.startsWith('tt')) {
      if (!canonicalTitle || !canonicalYear) {
        try {
          const meta = await resolveCinemeta(imdbId, type);
          if (meta) {
            canonicalTitle = meta.name || meta.title || canonicalTitle;
            canonicalYear  = meta.year || canonicalYear;
            aliases        = meta.aliases || [];
          }
        } catch (cinemetaErr) {
          console.warn(`[Cinemeta Resolver] ${imdbId}:`, cinemetaErr.message);
        }
      }

      // If mapping missing or missing provider slugs, perform parallel search to resolve slugs
      if (canonicalTitle && (!mapping?.slug_kkphim || !mapping?.slug_nguonc || !mapping?.slug_vsmov)) {
        try {
          const [kkSearchRes, nguoncSearchRes, vsmovSearchRes] = await Promise.allSettled([
            !mapping?.slug_kkphim ? kkphim.search(canonicalTitle, 5) : Promise.resolve([]),
            !mapping?.slug_nguonc ? nguonc.search(canonicalTitle, 5) : Promise.resolve([]),
            !mapping?.slug_vsmov ? vsmov.search(canonicalTitle) : Promise.resolve({ items: [] }),
          ]);

          const kkItems = kkSearchRes.status === 'fulfilled' ? kkSearchRes.value : [];
          const nguoncItems = nguoncSearchRes.status === 'fulfilled' ? nguoncSearchRes.value : [];
          const vsmovItems = vsmovSearchRes.status === 'fulfilled' ? (vsmovSearchRes.value?.items || vsmovSearchRes.value || []) : [];

          const resolvedKKSlug = mapping?.slug_kkphim || findBestMatchSlug(kkItems, canonicalTitle, canonicalYear);
          const resolvedNguonCSlug = mapping?.slug_nguonc || findBestMatchSlug(nguoncItems, canonicalTitle, canonicalYear);
          const resolvedVsMovSlug = mapping?.slug_vsmov || findBestMatchSlug(vsmovItems, canonicalTitle, canonicalYear);

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

          // Save newly resolved mapping asynchronously to Supabase
          upsertMediaMapping(mapping).catch(() => {});
        } catch (searchErr) {
          console.warn(`[Parallel Slug Resolver] ${imdbId}:`, searchErr.message);
        }
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

    // BƯỚC 3: Gọi đồng thời 3 Provider Core (Promise.allSettled)
    const queryProviders = [
      // Tier 1: VSMOV (Ưu tiên 4K)
      withTimeout(
        vsmov.getStreams({
          ...queryPayload,
          slug: mapping?.slug_vsmov || null,
        }),
        3000,
        'VSMOV'
      ).then((streams) => {
        if (!Array.isArray(streams)) return [];
        return streams.map((s) => {
          const proxiedUrl = s.url.startsWith('http') && !s.url.includes('/hls/')
            ? `${proxyBase}/hls/manifest.m3u8?url=${encodeB64(s.url)}&ref=${encodeB64('https://vsmov.com/')}`
            : s.url;

          return {
            name: s.name || '[VIP 1 • VSMOV 4K]',
            title: s.title || `[4K Ultra HD] ${s.server || 'Server VIP'} - ${s.quality || '3840x2160'}\n⚡ Tốc độ cao • HLS Proxy`,
            url: proxiedUrl,
            behaviorHints: s.behaviorHints || { notWebReady: false },
            subtitles: s.subtitles || undefined,
          };
        });
      }).catch(() => []),

      // Tier 2: KKPHIM (Full HD / Đa dạng lồng tiếng & Vietsub)
      withTimeout(
        kkphim.getStreams({
          ...queryPayload,
          slug: mapping?.slug_kkphim || null,
        }),
        3000,
        'KKPhim'
      ).then((streams) => {
        if (!Array.isArray(streams)) return [];
        return streams.map((s) => {
          const proxiedUrl = s.url.startsWith('http') && !s.url.includes('/hls/')
            ? `${proxyBase}/hls/manifest.m3u8?url=${encodeB64(s.url)}&ref=${encodeB64('https://player.phimapi.com/')}`
            : s.url;

          return {
            name: s.name || '[VIP 2 • KKPHIM]',
            title: s.title || `[FHD 1080p] ${s.serverName || 'Server VIP'} [Tập ${episode}]\n⚡ Vietsub/Thuyết Minh • HLS Proxy`,
            url: proxiedUrl,
            behaviorHints: s.behaviorHints || { notWebReady: false },
            subtitles: s.subtitles || undefined,
          };
        });
      }).catch(() => []),

      // Tier 3: NGUONC (Dự phòng ổn định cao)
      withTimeout(
        nguonc.getStreams({
          ...queryPayload,
          slug: mapping?.slug_nguonc || null,
        }),
        3000,
        'NguonC'
      ).then((streams) => {
        if (!Array.isArray(streams)) return [];
        return streams.map((s) => {
          const proxiedUrl = s.url.startsWith('http') && !s.url.includes('/hls/')
            ? `${proxyBase}/hls/manifest.m3u8?url=${encodeB64(s.url)}&ref=${encodeB64('https://phim.nguonc.com/')}`
            : s.url;

          return {
            name: s.name || '[VIP 3 • NGUONC]',
            title: s.title || `[FHD 1080p] ${s.serverName || 'Server VIP'} [Tập ${episode}]\n⚡ Dự phòng chất lượng cao • HLS Proxy`,
            url: proxiedUrl,
            behaviorHints: s.behaviorHints || { notWebReady: false },
            subtitles: s.subtitles || undefined,
          };
        });
      }).catch(() => []),
    ];

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
      if (!stream || !stream.url) return false;
      if (seenUrls.has(stream.url)) return false;
      seenUrls.add(stream.url);
      return true;
    });

    // Sort by VIP Priority (4K -> Vietsub -> TM -> LT)
    aggregatedStreams.sort((a, b) => getStreamPriority(a) - getStreamPriority(b));

    const totalElapsed = Date.now() - startTime;
    console.log(`[Stream Aggregator] id=${id} → Total ${aggregatedStreams.length} high-speed streams (${totalElapsed}ms)`);

    // BƯỚC 4: Lưu vào Cache (Series: 4 giờ, Movie: 24 giờ)
    if (aggregatedStreams.length > 0) {
      const ttl = parts.length > 1 ? (TTL?.SERIES || 4 * 3600) : (TTL?.MOVIE || 24 * 3600);
      await setCache(streamKey, aggregatedStreams, ttl);
    }

    return sendJSON(res, { streams: aggregatedStreams });
  } catch (err) {
    console.error('[Stream Aggregator Error]:', err.message);
    return sendJSON(res, { streams: [] });
  }
});

module.exports = router;
