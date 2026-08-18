'use strict';

/**
 * ============================================================
 *  VIP Movies Addon — src/providers/film4k.js (Engine v1.7.0)
 *  VIP 4K Provider: https://film4k.net/
 *
 *  Features:
 *  - Official REST API: /api/home, /api/title/:slug, /api/watch/:slug
 *  - Direct 4K Ultra HD (3840x2160) & 1080p Full HD master.m3u8 extraction
 *  - Vietnamese & English multilingual title matching
 *  - Built-in multi-audio (Vietsub, Dubbed, Original 6ch AAC)
 *  - R3 Stremio Stream Protocol compliance:
 *    * In-App Direct Play: HLS Proxy (url only, strictly NO externalUrl)
 * ============================================================
 */

const axios = require('axios');
const { imdbCache, catalogCache, detailCache } = require('../lib/cache');
const { resolveCinemeta, getCachedCinemeta } = require('../lib/cinemeta');
const {
  safeExtra,
  safeSlug,
  safeKeyword,
  safePage,
  safeType,
  isSeasonMatch,
  scoreMatch,
  escapeRegExp,
  generateSearchKeywords,
  matchEpisodeItem,
} = require('../lib/utils');

const PROVIDER_ID    = 'film4k';
const PROVIDER_LABEL = 'FILM4K';
const BASE_URL       = 'https://film4k.net';
const BASE_API       = 'https://film4k.net/api';
const REFERER_HEADER = 'https://film4k.net/';

const FILM4K_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  'Referer': REFERER_HEADER,
  'Origin': BASE_URL,
  'Accept': 'application/json, text/plain, */*',
  'Accept-Language': 'vi-VN,vi;q=0.9,en-US;q=0.8',
};

const http = axios.create({
  baseURL: BASE_API,
  timeout: 5000,
  headers: FILM4K_HEADERS,
});

function encodeBase64(str) {
  if (!str) return '';
  return Buffer.from(str, 'utf8').toString('base64url');
}

function mapCatalogMeta(item, forceType = null) {
  const isSeries = item.mediaType === 'tv' || forceType === 'series';
  const type = isSeries ? 'series' : 'movie';
  const slug = item.slug || '';
  const titleVi = item.title?.vi || item.title?.en || item.name || 'Không rõ tên';
  const titleEn = item.title?.en;

  const poster = item.poster?.vi || item.poster?.en || item.poster || null;
  const backdrop = item.backdrop || null;
  const year = item.year ? String(item.year) : null;

  const badgeParts = ['4K Ultra HD'];
  if (item.score) badgeParts.push(`★ ${item.score.toFixed(1)}`);
  if (year) badgeParts.push(year);

  return {
    id: `film4k_${slug}`,
    type,
    name: titleVi,
    origin_name: titleEn || titleVi,
    poster,
    posterShape: 'poster',
    background: backdrop,
    description: item.overview?.vi || item.overview?.en || `Phim 4K VIP trên film4k.net • ${titleVi}`,
    releaseInfo: badgeParts.join(' · '),
  };
}

// ─────────────────────────────────────────────────────────────
//  1. Search: search(keyword, page = 1)
// ─────────────────────────────────────────────────────────────
async function search(keyword, page = 1) {
  const cleanKeyword = safeKeyword(keyword);
  const p = safePage(page);
  if (!cleanKeyword) return { items: [] };

  const cacheKey = `film4k:search:${cleanKeyword}:${p}`;
  const cached = catalogCache.get(cacheKey);
  if (cached) return cached;

  try {
    // Fetch home list pages to find matching titles
    const res = await http.get('/home', { params: { page: p } });
    const allList = [...(res.data?.list || []), ...(res.data?.top || [])];

    const kwLower = cleanKeyword.toLowerCase();
    const matched = allList.filter((it) => {
      if (!it) return false;
      const titleVi = (it.title?.vi || '').toLowerCase();
      const titleEn = (it.title?.en || '').toLowerCase();
      const searchField = (it.search || '').toLowerCase();
      const slugStr = (it.slug || '').toLowerCase();

      return (
        titleVi.includes(kwLower) ||
        titleEn.includes(kwLower) ||
        searchField.includes(kwLower) ||
        slugStr.includes(kwLower)
      );
    });

    const result = { items: matched };
    catalogCache.set(cacheKey, result, 180);
    return result;
  } catch (err) {
    console.error(`[FILM4K/search] keyword="${cleanKeyword}":`, err.message);
    return { items: [] };
  }
}

// ─────────────────────────────────────────────────────────────
//  2. Detail: getDetail(slug)
// ─────────────────────────────────────────────────────────────
async function getDetail(slug) {
  const cleanSlug = safeSlug(slug, 'film4k');
  if (!cleanSlug) return null;
  const cacheKey = `film4k:detail:${cleanSlug}`;
  const cached = detailCache.get(cacheKey);
  if (cached) return cached;

  try {
    const res = await http.get(`/title/${encodeURIComponent(cleanSlug)}`);
    const movie = res.data?.movie;
    if (movie) {
      const episodes = res.data?.episodes || [];
      const result = { movie, episodes };
      detailCache.set(cacheKey, result, 600); // 10 mins
      return result;
    }
  } catch (err) {
    // Try watch endpoint as fallback for detail
    try {
      const wRes = await http.get(`/watch/${encodeURIComponent(cleanSlug)}`);
      const movie = wRes.data?.movie;
      if (movie) {
        const episodes = wRes.data?.episodes || [];
        const result = { movie, episodes };
        detailCache.set(cacheKey, result, 600);
        return result;
      }
    } catch {}
    console.error(`[FILM4K/getDetail] slug="${cleanSlug}":`, err.message);
  }
  return null;
}

// ─────────────────────────────────────────────────────────────
//  3. Catalog: getCatalog(type, page = 1, extra = {})
// ─────────────────────────────────────────────────────────────
async function getCatalog(type, page = 1, extra = {}) {
  const cleanType = safeType(type, '4k-movies');
  const safe = safeExtra(extra);
  const p = safePage(page);
  const searchQuery = safeKeyword(safe.search || safe.searchQuery || safe.query);
  const cacheKey = `film4k:cat:${cleanType}:${p}:${searchQuery}`;
  const cached = catalogCache.get(cacheKey);
  if (cached) return cached;

  try {
    let items = [];

    if (searchQuery) {
      const searchRes = await search(searchQuery, p);
      const raw = searchRes.items || [];
      items = raw.map((i) => mapCatalogMeta(i));
      catalogCache.set(cacheKey, items, 120);
      return items;
    }

    const res = await http.get('/home', { params: { page: p } });
    const rawList = res.data?.list || [];
    const topList = p === 1 ? res.data?.top || [] : [];
    const combined = [...topList, ...rawList];

    // Filter by type
    if (cleanType === '4k-movies' || cleanType === 'movie' || cleanType === 'phim-le') {
      items = combined.filter((i) => i.mediaType !== 'tv').map((i) => mapCatalogMeta(i, 'movie'));
    } else if (cleanType === '4k-series' || cleanType === 'series' || cleanType === 'phim-bo') {
      items = combined.filter((i) => i.mediaType === 'tv').map((i) => mapCatalogMeta(i, 'series'));
    } else {
      // 4K Cinema / Featured
      items = combined.map((i) => mapCatalogMeta(i));
    }

    catalogCache.set(cacheKey, items, 300);
    return items;
  } catch (err) {
    console.error(`[FILM4K/getCatalog] type=${cleanType} page=${p}:`, err.message);
    return [];
  }
}

// ─────────────────────────────────────────────────────────────
//  4. Stream Aggregation: getStreams(payload)
// ─────────────────────────────────────────────────────────────
async function getStreams(type, id, extra = {}, req = null) {
  let targetType = type;
  let targetId = id;
  let targetExtra = extra;

  if (typeof type === 'object' && type !== null) {
    targetType = type.type || 'movie';
    targetId = type.id || type.slug || '';
    targetExtra = type;
  }

  const { season, episode, title: propTitle, year: propYear, slug: propSlug, proxyBase } = targetExtra || {};

  try {
    let cleanImdb = null;
    let targetSlug = propSlug ? safeSlug(propSlug, 'film4k') : null;
    let queryTitle = propTitle || null;
    let queryYear = propYear || null;

    if (targetId && String(targetId).startsWith('tt')) {
      cleanImdb = String(targetId).split(':')[0];
    } else if (targetId && String(targetId).startsWith('film4k_')) {
      targetSlug = safeSlug(targetId.replace(/^film4k_/, ''), 'film4k');
    }

    if (cleanImdb) {
      const cachedCine = getCachedCinemeta(targetType, cleanImdb);
      if (cachedCine) {
        if (!queryTitle && cachedCine.name) queryTitle = cachedCine.name;
        if (!queryYear && cachedCine.year) queryYear = cachedCine.year;
      }
    }

    // Step 1: Direct watch lookup if targetSlug exists
    let watchData = null;
    if (targetSlug) {
      try {
        const res = await http.get(`/watch/${encodeURIComponent(targetSlug)}`);
        if (res.data?.movie) watchData = res.data;
      } catch {}
    }

    // Step 2: Multi-keyword search fallback if no direct watchData
    if (!watchData && queryTitle) {
      const keywords = generateSearchKeywords(queryTitle, targetExtra.aliases);
      for (const kw of keywords) {
        if (watchData) break;
        const searchRes = await search(kw, 1);
        const candidates = searchRes.items || [];
        for (const cand of candidates) {
          if (!cand.slug) continue;
          try {
            const wRes = await http.get(`/watch/${encodeURIComponent(cand.slug)}`);
            if (wRes.data?.movie) {
              watchData = wRes.data;
              targetSlug = cand.slug;
              break;
            }
          } catch {}
        }
      }
    }

    if (!watchData || !watchData.movie) return [];

    const movie = watchData.movie;
    const episodes = watchData.episodes || [];
    const isMovie = targetType === 'movie' || movie.mediaType !== 'tv';

    let streamMasterUrl = null;
    let episodeLabel = '';

    if (isMovie) {
      streamMasterUrl = watchData.sources?.[0]?.url || movie.hlsUrl;
    } else {
      const targetEpNum = episode != null ? parseInt(episode, 10) : 1;
      const targetSeasonNum = season != null ? parseInt(season, 10) : 1;

      const matchedEp = episodes.find((ep) => {
        const epNum = parseInt(ep.episode, 10);
        const sNum = parseInt(ep.season || 1, 10);
        return epNum === targetEpNum && (season == null || sNum === targetSeasonNum);
      }) || episodes[targetEpNum - 1] || episodes[0];

      if (matchedEp) {
        streamMasterUrl = matchedEp.sources?.[0]?.url;
        episodeLabel = `[Tập ${matchedEp.episode || targetEpNum}] `;
      }
    }

    if (!streamMasterUrl) return [];

    const fullStreamUrl = streamMasterUrl.startsWith('http')
      ? streamMasterUrl
      : `${BASE_URL}${streamMasterUrl}`;

    const b64Url = encodeBase64(fullStreamUrl);
    const b64Ref = encodeBase64(REFERER_HEADER);
    const proxyStreamUrl = `${proxyBase || ''}/hls/manifest.m3u8?url=${b64Url}&ref=${b64Ref}`;

    const movieTitleVi = movie.title?.vi || movie.title?.en || queryTitle || '4K Ultra HD';
    const streamTitle = `[VIP 0 • FILM4K] ${movieTitleVi} - 4K Ultra HD (3840x2160) ${episodeLabel}(HLS Proxy)\n⚡ Server VIP 4K • film4k.net`;

    return [
      {
        name: 'VIP Movies 🎬',
        title: streamTitle,
        url: proxyStreamUrl,
        behaviorHints: {
          notSupported: false,
          bingeGroup: `film4k-${targetSlug || 'stream'}`,
        },
      },
    ];
  } catch (err) {
    console.error('[FILM4K/getStreams]', err.message);
    return [];
  }
}

module.exports = {
  PROVIDER_ID,
  PROVIDER_LABEL,
  BASE_URL,
  BASE_API,
  search,
  getDetail,
  getCatalog,
  getStreams,
};
