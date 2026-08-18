'use strict';

/**
 * ============================================================
 *  VIP Movies Addon — src/providers/yan.js (Engine v1.6.0)
 *  YAN Specialized Provider: 3D Donghua & Ongoing Anime
 *  Domain Sources: yanhh3d.pw / yan
 *
 *  Features:
 *  - Standard interface: { id, label, getCatalog, getStreams, search, getDetail }
 *  - Specializes in Ongoing Anime & 3D Donghua (Thế Giới Hoàn Mỹ, Tiên Nghịch, etc.)
 *  - 5-second axios timeout for fault isolation & zero blocking
 *  - Multi-tier stream extraction: Direct live scraping (data-obf.pU / master.m3u8) + Ophim JSON API fallback + safe []
 *  - Strict zero externalUrl invariant (url only, HLS proxy)
 *  - Graceful degradation: all errors return [] safely
 * ============================================================
 */

const axios = require('axios');
const { imdbCache, catalogCache, detailCache } = require('../lib/cache');
const { getCachedCinemeta } = require('../lib/cinemeta');
const { safeExtra, safeSlug, safeKeyword, safePage, safeType, isSeasonMatch, scoreMatch, escapeRegExp } = require('../lib/utils');

const PROVIDER_ID    = 'yan';
const PROVIDER_LABEL = 'YAN • Donghua & Anime';
const REFERER_HEADER = 'https://yanhh3d.pw/';
const YAN_UA         = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';

const http = axios.create({
  timeout: 5000,
  headers: {
    'User-Agent': YAN_UA,
    Accept: 'application/json, text/html, */*',
    Referer: REFERER_HEADER,
    Origin: 'https://yanhh3d.pw',
  },
});

const STATIC_YAN_ROUTES = new Set([
  'moi-cap-nhat', 'hoat-hinh-3d', 'hoat-hinh-2d', 'hoat-hinh-4k', 'hoat-hinh-ai',
  'hoan-thanh', 'dang-chieu', 'phim-le', 'search', 'login', 'register', 'bang-xep-hang',
]);

function encodeBase64(str) {
  if (!str) return '';
  return Buffer.from(str, 'utf8').toString('base64url');
}

function formatEpisodeLabel(epName) {
  if (!epName) return '';
  const trimmed = String(epName).trim();
  if (!trimmed || trimmed.toUpperCase() === 'FULL') return '';
  if (/^tập\b/i.test(trimmed)) {
    return ` [${trimmed}]`;
  }
  return ` [Tập ${trimmed}]`;
}

/**
 * Direct Live Search on yanhh3d.pw
 */
async function searchYanLive(keyword) {
  try {
    const res = await http.get('https://yanhh3d.pw/search', {
      params: { keysearch: keyword },
      timeout: 4000,
    });
    const html = String(res.data || '');
    const itemLinks = [...html.matchAll(/<a[^>]+href="https:\/\/yanhh3d\.pw\/([^"\/]+)"[^>]*title="([^"]*)"/gi)];
    const items = [];
    const seen = new Set();
    for (const m of itemLinks) {
      const slug = m[1];
      const title = m[2];
      if (!slug || STATIC_YAN_ROUTES.has(slug) || seen.has(slug)) continue;
      seen.add(slug);
      items.push({
        name: title,
        origin_name: title,
        slug,
        type: 'series',
      });
    }
    return items;
  } catch (err) {
    console.warn('[YAN/searchYanLive]', err.message);
    return [];
  }
}

/**
 * Extract live HLS stream URLs from yanhh3d.pw episode page
 * Parses data-obf.pU and master.m3u8 from sv_LINK* embeds
 */
async function extractYanLiveStreams(slug, episodeNum = 1) {
  try {
    const epUrl = `https://yanhh3d.pw/${slug}/tap-${episodeNum || 1}`;
    const res = await http.get(epUrl, { timeout: 4000 });
    const html = String(res.data || '');
    const svMatches = [...html.matchAll(/id="sv_([^"]+)"[^>]*name="([^"]+)"[^>]*data-src="([^"]+)"/gi)];
    const streams = [];

    for (const sv of svMatches) {
      const svId = sv[1] || sv[2];
      const dataSrc = sv[3];
      if (!dataSrc || !dataSrc.startsWith('http')) continue;

      try {
        const sRes = await http.get(dataSrc, { timeout: 3500 });
        const sHtml = typeof sRes.data === 'string' ? sRes.data : '';

        // 1. Check data-obf base64 payload
        const obfMatch = sHtml.match(/data-obf="([^"]+)"/);
        if (obfMatch) {
          try {
            const decoded = JSON.parse(Buffer.from(obfMatch[1], 'base64').toString('utf8'));
            if (decoded && decoded.pU && decoded.pU.startsWith('http')) {
              streams.push({ server: svId, url: decoded.pU, label: '4K/FHD Donghua 3D' });
              continue;
            }
          } catch {}
        }

        // 2. Check master.m3u8 or inline stream URL
        const m3u8Match = sHtml.match(/(?:file|m3u8Url|src)\s*[:=]\s*[`"'](https?:\/\/[^`"']+\.m3u8[^`"']*)`?"'/i);
        if (m3u8Match) {
          const cleanUrl = m3u8Match[1].replace(/\$\{storage\}/g, 'drive');
          streams.push({ server: svId, url: cleanUrl, label: '4K/FHD Donghua' });
        }
      } catch {}
    }
    return streams;
  } catch (err) {
    console.warn('[YAN/extractYanLiveStreams]', err.message);
    return [];
  }
}

/**
 * Search YAN Donghua & Anime titles (Multi-tier: live scraping -> Ophim JSON)
 */
async function search(keyword, page = 1) {
  const clean = safeKeyword(keyword);
  const p = safePage(page);
  if (!clean) return [];

  // Tier 1: Live Scraping search
  try {
    const liveItems = await searchYanLive(clean);
    if (liveItems.length > 0) {
      return liveItems.map((it) => ({
        name: it.name,
        origin_name: it.origin_name,
        slug: it.slug,
        year: null,
        type: 'series',
        poster: null,
        quality: '4K/FHD',
        lang: 'Vietsub / Thuyết Minh',
      }));
    }
  } catch (err) {
    console.warn(`[YAN/search-live] "${clean}":`, err.message);
  }

  // Tier 2: Ophim JSON fallback
  try {
    const res = await http.get('https://phimapi.com/v1/api/tim-kiem', {
      params: { keyword: clean, limit: 12, page: p },
    });
    const items = res.data?.data?.items || [];
    return items.map((it) => ({
      name: it.name,
      origin_name: it.origin_name,
      slug: it.slug,
      year: it.year,
      type: it.type || 'series',
      poster: it.poster_url ? (it.poster_url.startsWith('http') ? it.poster_url : `https://phimimg.com/${it.poster_url}`) : null,
      quality: it.quality,
      lang: it.lang,
    }));
  } catch (err) {
    console.warn(`[YAN/search-json] "${clean}":`, err.message);
    return [];
  }
}

/**
 * Get YAN detail
 */
async function getDetail(slug) {
  const cleanSlug = safeSlug(slug, 'yan');
  if (!cleanSlug) return null;
  const cacheKey = `yan:detail:${cleanSlug}`;
  const cached = detailCache.get(cacheKey);
  if (cached) return cached;

  try {
    const res = await http.get(`https://phimapi.com/phim/${cleanSlug}`);
    const movie = res.data?.movie || res.data?.data?.item;
    const episodes = res.data?.episodes || movie?.episodes || [];
    if (movie) {
      const result = { movie, episodes };
      detailCache.set(cacheKey, result, 600);
      return result;
    }
  } catch (err) {
    console.warn(`[YAN/getDetail] "${cleanSlug}":`, err.message);
  }
  return null;
}

/**
 * Get catalog items for YAN
 */
async function getCatalog(type, page = 1, extra = {}) {
  const cleanType = safeType(type, 'hoat-hinh');
  const safe = safeExtra(extra);
  const p = safePage(page);
  const searchQuery = safeKeyword(safe.search || safe.searchQuery || safe.query);
  const cacheKey = `yan:cat:${cleanType}:${p}:${searchQuery || ''}`;
  const cached = catalogCache.get(cacheKey);
  if (cached) return cached;

  try {
    let items = [];
    if (searchQuery) {
      const searchItems = await search(searchQuery, p);
      items = searchItems.map((it) => ({
        id: `yan_${it.slug}`,
        type: 'series',
        name: it.name || it.origin_name,
        poster: it.poster,
        posterShape: 'poster',
        description: `YAN Donghua & Anime • ${it.origin_name || it.name}`,
        releaseInfo: it.year ? String(it.year) : null,
      }));
      catalogCache.set(cacheKey, items, 120);
      return items;
    }

    // Default Donghua & Anime
    const res = await http.get('https://phimapi.com/v1/api/danh-sach/hoat-hinh', { params: { page: p } });
    const raw = res.data?.data?.items || [];
    items = raw.map((it) => ({
      id: `yan_${it.slug}`,
      type: 'series',
      name: it.name || it.origin_name || 'Không rõ tên',
      poster: it.poster_url ? (it.poster_url.startsWith('http') ? it.poster_url : `https://phimimg.com/${it.poster_url}`) : null,
      posterShape: 'poster',
      background: it.thumb_url ? (it.thumb_url.startsWith('http') ? it.thumb_url : `https://phimimg.com/${it.thumb_url}`) : null,
      description: `YAN Donghua & Anime Tuyển Chọn • ${it.origin_name || it.name}`,
      releaseInfo: it.year ? String(it.year) : null,
    }));

    catalogCache.set(cacheKey, items, 300);
    return items;
  } catch (err) {
    console.warn(`[YAN/getCatalog] type=${cleanType} page=${p}:`, err.message);
    return [];
  }
}

/**
 * Get streams for YAN (Multi-tier: Tier 1 Live Scraping -> Tier 2 Ophim JSON -> Tier 3 Safe [])
 */
async function getStreams(arg1, title, type, season, episode, proxyBase) {
  let imdbId  = null;
  let slug    = null;
  let year    = null;

  if (typeof arg1 === 'object' && arg1 !== null) {
    imdbId    = arg1.imdbId || null;
    title     = arg1.title || null;
    type      = arg1.type || 'series';
    year      = arg1.year || null;
    season    = arg1.season != null ? arg1.season : null;
    episode   = arg1.episode != null ? arg1.episode : null;
    slug      = arg1.slug || null;
    proxyBase = arg1.proxyBase || '';
  } else if (typeof arg1 === 'string') {
    if (/^tt\d+/i.test(arg1)) imdbId = arg1;
    else slug = arg1;
    type = type || 'series';
    proxyBase = proxyBase || '';
  }

  if (season != null) {
    const seasonNum = parseInt(season, 10);
    if (isNaN(seasonNum) || seasonNum <= 0 || seasonNum > 1000) return [];
  }
  if (episode != null) {
    const epNum = parseInt(episode, 10);
    if (String(episode).trim().startsWith('-') || (!isNaN(epNum) && epNum <= 0)) return [];
  }

  if (!year && imdbId) {
    const cachedCine = getCachedCinemeta(type, imdbId);
    if (cachedCine?.year) year = cachedCine.year;
    if (!title && cachedCine?.name) title = cachedCine.name;
  }

  const epNumTarget = episode != null ? parseInt(episode, 10) : 1;
  const epLabel = formatEpisodeLabel(episode != null ? String(episode) : '');
  const b64Ref = encodeBase64(REFERER_HEADER);

  try {
    // ══════════════════════════════════════════════════════════════════════════
    //  TIER 1: Direct Live Scraping on yanhh3d.pw
    // ══════════════════════════════════════════════════════════════════════════
    let liveSlug = null;
    if (slug && !slug.startsWith('yan_') && !slug.startsWith('yan:')) {
      liveSlug = slug;
    } else if (title) {
      const liveItems = await searchYanLive(title);
      if (liveItems.length > 0) {
        let bestItem = null;
        let bestScore = -1;
        for (const item of liveItems) {
          const score = scoreMatch(item, title, year, season);
          if (score > bestScore) {
            bestScore = score;
            bestItem = item;
          }
        }
        if (bestItem && bestScore >= 0.45) {
          liveSlug = bestItem.slug;
        }
      }
    }

    if (liveSlug) {
      const liveStreams = await extractYanLiveStreams(liveSlug, isNaN(epNumTarget) || epNumTarget <= 0 ? 1 : epNumTarget);
      if (liveStreams.length > 0) {
        const results = [];
        for (const ls of liveStreams) {
          const titleHeader = `[VIP 6 • YAN] 4K/FHD Donghua 3D${epLabel} (HLS Proxy)`;
          const streamUrl = `${proxyBase || ''}/hls/manifest.m3u8?url=${encodeBase64(ls.url)}&ref=${b64Ref}`;

          // STRICT INVARIANT: url only, NO externalUrl
          results.push({
            name: 'VIP Movies 🎬',
            title: `${titleHeader}\n⚡ Server YAN • yanhh3d.pw`,
            url: streamUrl,
            behaviorHints: {
              notSupported: false,
              bingeGroup: `yan-${liveSlug}`,
            },
          });
        }
        if (results.length > 0) {
          return results;
        }
      }
    }

    // ══════════════════════════════════════════════════════════════════════════
    //  TIER 2: Ophim / PhimAPI JSON Fallback
    // ══════════════════════════════════════════════════════════════════════════
    let movieData = null;

    if (slug && (slug.startsWith('yan_') || slug.startsWith('yan:'))) {
      movieData = await getDetail(slug);
    }

    if (!movieData && imdbId) {
      try {
        const res = await http.get(`https://phimapi.com/imdb/title/${imdbId}`);
        const movie = res.data?.movie || res.data?.data?.item;
        const episodes = res.data?.episodes || movie?.episodes || [];
        if (movie) movieData = { movie, episodes };
      } catch {}
    }

    if (!movieData && title) {
      const searchItems = await search(title, 1);
      if (searchItems.length > 0) {
        let bestItem = null;
        let bestScore = -1;
        for (const item of searchItems) {
          const score = scoreMatch(item, title, year, season);
          if (score > bestScore) {
            bestScore = score;
            bestItem = item;
          }
        }
        if (bestItem && bestItem.slug && bestScore >= 0.45) {
          movieData = await getDetail(bestItem.slug);
          if (movieData && imdbId) {
            imdbCache.set(`yan:imdb:${String(imdbId).toLowerCase().trim()}`, bestItem.slug, 86400);
          }
        }
      }
    }

    if (!movieData || !movieData.episodes || !movieData.episodes.length) {
      return [];
    }

    const { movie, episodes } = movieData;
    const isMovie = (type === 'movie' || movie.type === 'single') && episode == null;
    const targetEpStr = !isMovie && episode != null ? String(episode).trim() : null;

    // Season validation for series
    if (!isMovie && season != null) {
      if (!isSeasonMatch(movie, episodes, season, type)) {
        return [];
      }
    }

    const streams = [];

    for (let sIdx = 0; sIdx < episodes.length; sIdx++) {
      const server = episodes[sIdx];
      const serverData = server.server_data || [];
      if (!serverData.length) continue;

      let targetEp = null;
      if (isMovie || targetEpStr === null) {
        targetEp = serverData[0];
      } else {
        const epNum = parseInt(targetEpStr, 10);
        if (!isNaN(epNum) && epNum <= 0) {
          targetEp = null;
        } else {
          targetEp = serverData.find((ep) => {
            if (!ep) return false;
            const nameStr = String(ep.name || '').trim();
            const slugStr = String(ep.slug || '').trim();
            if (nameStr === targetEpStr || nameStr === `Tập ${targetEpStr}` || nameStr === `Tập 0${targetEpStr}`) return true;
            if (slugStr === `tap-${targetEpStr}` || slugStr === `tap-0${targetEpStr}`) return true;
            if (!isNaN(epNum) && epNum > 0) {
              const numFromName = parseInt(nameStr.replace(/\D+/g, ''), 10);
              if (numFromName === epNum) return true;
              const numFromSlug = parseInt(slugStr.replace(/\D+/g, ''), 10);
              if (numFromSlug === epNum) return true;
            }
            if (nameStr && targetEpStr && !targetEpStr.startsWith('-')) {
              try {
                const re = new RegExp(`(^|[^0-9a-zA-Z])${escapeRegExp(targetEpStr)}([^0-9a-zA-Z]|$)`, 'i');
                if (re.test(nameStr) || re.test(slugStr)) return true;
              } catch {}
            }
            return false;
          });

          if (!targetEp && !isNaN(epNum) && epNum >= 1 && epNum <= serverData.length) {
            targetEp = serverData[epNum - 1];
          }
        }
      }

      if (!targetEp || !targetEp.link_m3u8) continue;

      const fallbackEpLabel = formatEpisodeLabel(targetEp.name);
      const titleHeader = `[VIP 6 • YAN] 4K/FHD Donghua 3D${fallbackEpLabel} (HLS Proxy)`;
      const streamUrl = `${proxyBase || ''}/hls/manifest.m3u8?url=${encodeBase64(targetEp.link_m3u8)}&ref=${b64Ref}`;

      // STRICT INVARIANT: url only, NO externalUrl
      streams.push({
        name: 'VIP Movies 🎬',
        title: `${titleHeader}\n⚡ Server YAN • yanhh3d.pw`,
        url: streamUrl,
        behaviorHints: {
          notSupported: false,
          bingeGroup: `yan-${movie.slug || slug || 'stream'}`,
        },
      });
    }

    return streams;
  } catch (err) {
    console.warn(`[YAN/getStreams] Error:`, err.message);
    return [];
  }
}

module.exports = {
  id: PROVIDER_ID,
  label: PROVIDER_LABEL,
  search,
  getDetail,
  getCatalog,
  getStreams,
};
