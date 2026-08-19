'use strict';

/**
 * ============================================================
 *  VIP Movies Addon — src/providers/kkphim.js (Engine v1.6.0)
 *  KKPhim Provider Module (100% Official Endpoints: phimapi.com)
 *
 *  Features:
 *  - 5-second axios timeout for high resilience & zero blocking
 *  - Direct IMDb lookup -> fallback Cinemeta title & year search
 *  - Multi-server support: Vietsub, Thuyết Minh, Lồng Tiếng
 *  - R3 Stremio Stream Protocol compliance:
 *    * In-App Direct Play: HLS Proxy (url only, strictly NO externalUrl)
 * ============================================================
 */

const axios = require('axios');
const { imdbCache, catalogCache, detailCache } = require('../lib/cache');
const { resolveCinemeta, getCachedCinemeta } = require('../lib/cinemeta');
const { safeExtra, safeSlug, safeKeyword, safePage, safeType, isSeasonMatch, scoreMatch, escapeRegExp, generateSearchKeywords, matchEpisodeItem } = require('../lib/utils');

const PROVIDER_ID    = 'kkphim';
const PROVIDER_LABEL = 'KKPhim';
const BASE_API       = 'https://phimapi.com';
const IMAGE_CDN      = 'https://phimimg.com';
const KK_UA          = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36';

// ─── Axios Client (5s Timeout) ───────────────────────────────────
const http = axios.create({
  baseURL: BASE_API,
  timeout: 5000,
  headers: {
    'User-Agent': KK_UA,
    Accept: 'application/json',
    'Accept-Language': 'vi-VN,vi;q=0.9,en-US;q=0.8',
  },
});

// ─── Helpers ────────────────────────────────────────────────────
function formatImageUrl(url) {
  if (!url) return null;
  if (url.startsWith('http://') || url.startsWith('https://')) return url;
  const clean = url.startsWith('/') ? url.slice(1) : url;
  return `${IMAGE_CDN}/${clean}`;
}

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



function mapCatalogMeta(item, forceType = null) {
  const isSeries = item.type === 'series' || item.type === 'hoathinh' || item.type === 'tvshows';
  const type = forceType || (isSeries ? 'series' : 'movie');
  const badgeParts = [];
  if (item.quality) badgeParts.push(item.quality);
  if (item.lang) badgeParts.push(item.lang);
  if (item.episode_current && item.episode_current.toUpperCase() !== 'FULL') {
    badgeParts.push(item.episode_current);
  }

  const slug = item.slug || '';
  return {
    id: `kkphim_${slug}`,
    type,
    name: item.name || item.origin_name || 'Không rõ tên',
    poster: formatImageUrl(item.poster_url || item.thumb_url),
    posterShape: 'poster',
    background: formatImageUrl(item.thumb_url || item.poster_url),
    description: item.content ? String(item.content).replace(/<[^>]+>/g, '').slice(0, 300) : null,
    releaseInfo: badgeParts.length > 0 ? badgeParts.join(' · ') : (item.year ? String(item.year) : null),
  };
}

// ─────────────────────────────────────────────────────────────
//  1. Tra cứu theo IMDb ID: getByImdb(imdbId)
// ─────────────────────────────────────────────────────────────
async function getByImdb(imdbId) {
  if (!imdbId) return null;
  const cleanImdb = String(imdbId).toLowerCase().trim();
  if (!cleanImdb) return null;
  const cacheKey = `kkphim:imdb:${cleanImdb}`;
  const cached = await imdbCache.get(cacheKey);
  if (cached) return cached;

  try {
    const res = await http.get(`/imdb/title/${cleanImdb}`);
    const movie = res.data?.movie || res.data?.data?.item;
    const episodes = res.data?.episodes || movie?.episodes || res.data?.data?.item?.episodes || [];
    if (movie) {
      const result = { movie, episodes };
      imdbCache.set(cacheKey, result, 86400); // 24h
      return result;
    }
  } catch (err) {
    console.warn(`[KKPhim/getByImdb] ${cleanImdb}: ${err.message}`);
  }
  return null;
}

// ─────────────────────────────────────────────────────────────
//  2. Tìm kiếm phim: search(keyword, limit = 10)
// ─────────────────────────────────────────────────────────────
async function search(keyword, limit = 5) {
  const cleanKeyword = safeKeyword(keyword);
  if (!cleanKeyword) return [];
  try {
    const res = await http.get('/v1/api/tim-kiem', {
      params: {
        keyword: cleanKeyword,
        limit: Math.max(1, parseInt(limit, 10) || 5),
      },
    });
    const items = res.data?.data?.items || [];
    return items.map((item) => ({
      name: item.name,
      origin_name: item.origin_name,
      slug: item.slug,
      year: item.year,
      poster_url: formatImageUrl(item.poster_url),
      thumb_url: formatImageUrl(item.thumb_url),
      type: item.type,
      quality: item.quality,
      lang: item.lang,
      episode_current: item.episode_current,
    }));
  } catch (err) {
    console.error(`[KKPhim/search] keyword="${cleanKeyword}":`, err.message);
    return [];
  }
}

// ─────────────────────────────────────────────────────────────
//  3. Chi tiết phim & danh sách tập: getDetail(slug)
// ─────────────────────────────────────────────────────────────
async function getDetail(slug) {
  const cleanSlug = safeSlug(slug, 'kkphim');
  if (!cleanSlug) return null;
  const cacheKey = `kkphim:detail:${cleanSlug}`;
  const cached = await detailCache.get(cacheKey);
  if (cached) return cached;

  try {
    const res = await http.get(`/phim/${cleanSlug}`);
    const movie = res.data?.movie || res.data?.data?.item;
    const episodes = res.data?.episodes || movie?.episodes || res.data?.data?.item?.episodes || [];
    if (movie) {
      const result = { movie, episodes };
      detailCache.set(cacheKey, result, 600); // 10 minutes
      return result;
    }
  } catch (err) {
    console.error(`[KKPhim/getDetail] slug="${cleanSlug}":`, err.message);
  }
  return null;
}

// ─────────────────────────────────────────────────────────────
//  4. Danh mục & Bộ lọc Catalog: getCatalog(type, id/page, extra, page)
// ─────────────────────────────────────────────────────────────
async function getCatalog(type, arg2 = 1, arg3 = {}, arg4 = 1) {
  let catalogId = null;
  let page = 1;
  let extra = {};

  if (typeof arg2 === 'string' && isNaN(Number(arg2))) {
    catalogId = arg2;
    extra = typeof arg3 === 'object' ? arg3 : {};
    page = typeof arg4 === 'number' ? arg4 : parseInt(arg4, 10) || 1;
  } else {
    page = typeof arg2 === 'number' ? arg2 : parseInt(arg2, 10) || 1;
    extra = typeof arg3 === 'object' ? arg3 : {};
  }

  const cleanType = safeType(type, 'phim-le');
  const safe = safeExtra(extra);
  const p = safePage(page);
  const searchQuery = safeKeyword(safe.search || safe.searchQuery || safe.query);
  const genreFilter = safeKeyword(safe.genre);
  const countryFilter = safeKeyword(safe.country);
  const cacheKey = `kkphim:cat:${cleanType}:${p}:${searchQuery}:${genreFilter}:${countryFilter}`;
  const cached = await catalogCache.get(cacheKey);
  if (cached) return cached;

  try {
    let items = [];

    // Search mode
    if (searchQuery) {
      const searchItems = await search(searchQuery, 20);
      items = searchItems.map((i) => mapCatalogMeta(i));
      catalogCache.set(cacheKey, items, 120);
      return items;
    }

    // Genre filter mode
    if (genreFilter) {
      const genreSlug = String(genreFilter).toLowerCase().trim();
      const res = await http.get(`/v1/api/the-loai/${genreSlug}`, { params: { page: p } });
      const raw = res.data?.data?.items || [];
      items = raw.map((i) => mapCatalogMeta(i));
      catalogCache.set(cacheKey, items, 300);
      return items;
    }

    // Country filter mode
    if (countryFilter) {
      const countrySlug = String(countryFilter).toLowerCase().trim();
      const res = await http.get(`/v1/api/quoc-gia/${countrySlug}`, { params: { page: p } });
      const raw = res.data?.data?.items || [];
      items = raw.map((i) => mapCatalogMeta(i));
      catalogCache.set(cacheKey, items, 300);
      return items;
    }

    // New/List endpoints
    if (cleanType === 'phim-moi-cap-nhat' || cleanType === 'latest' || cleanType === 'phimmoi' || cleanType === 'kkphim_phimmoi') {
      const res = await http.get('/danh-sach/phim-moi-cap-nhat', { params: { page: p } });
      const raw = res.data?.items || [];
      items = raw.map((i) => mapCatalogMeta(i, 'movie'));
    } else {
      let listType = cleanType;
      if (cleanType === 'movie' || cleanType === 'phim-le' || cleanType === 'phimle') listType = 'phim-le';
      else if (cleanType === 'series' || cleanType === 'phim-bo' || cleanType === 'phimbo' || cleanType === 'kkphim_phimbo') listType = 'phim-bo';
      else if (cleanType === 'anime' || cleanType === 'hoat-hinh') listType = 'hoat-hinh';
      else if (cleanType === 'cinema' || cleanType === 'phim-chieu-rap') listType = 'phim-chieu-rap';
      else if (cleanType === 'tvshows' || cleanType === 'tv-shows') listType = 'tv-shows';

      const res = await http.get(`/v1/api/danh-sach/${listType}`, { params: { page: p } });
      const raw = res.data?.data?.items || [];
      const isSeriesCategory = listType === 'phim-bo' || listType === 'hoat-hinh' || listType === 'tv-shows';
      items = raw.map((i) => mapCatalogMeta(i, isSeriesCategory ? 'series' : 'movie'));
    }

    catalogCache.set(cacheKey, items, 300);
    return items;
  } catch (err) {
    console.error(`[KKPhim/getCatalog] type=${cleanType} page=${p}:`, err.message);
    return [];
  }
}

// ─────────────────────────────────────────────────────────────
//  5. Trích xuất Luồng Stream: getStreams({ imdbId, type, title, year, genres, season, episode, slug, proxyBase })
// ─────────────────────────────────────────────────────────────
async function getStreams(arg1, arg2, arg3, arg4, arg5, arg6) {
  let imdbId  = null;
  let slug    = null;
  let title   = null;
  let type    = 'movie';
  let year    = null;
  let genres  = null;
  let aliases = [];
  let season  = 1;
  let episode = 1;
  let proxyBase = '';

  if (typeof arg1 === 'object' && arg1 !== null) {
    imdbId    = arg1.imdbId || null;
    title     = arg1.title || null;
    type      = arg1.type || 'movie';
    year      = arg1.year || null;
    genres    = arg1.genres || null;
    aliases   = Array.isArray(arg1.aliases) ? arg1.aliases : [];
    season    = arg1.season != null ? (parseInt(arg1.season, 10) || 1) : 1;
    episode   = arg1.episode != null ? (parseInt(arg1.episode, 10) || 1) : 1;
    slug      = arg1.slug || null;
    proxyBase = arg1.proxyBase || '';
  } else if (typeof arg1 === 'string') {
    if (/^tt\d+/i.test(arg1)) {
      imdbId = arg1;
      if (typeof arg2 === 'string') {
        title = arg2;
        type = typeof arg3 === 'string' ? arg3 : 'movie';
        season = parseInt(arg4, 10) || 1;
        episode = parseInt(arg5, 10) || 1;
        proxyBase = arg6 || '';
      } else {
        season = parseInt(arg2, 10) || 1;
        episode = parseInt(arg3, 10) || 1;
        proxyBase = arg4 || '';
      }
    } else {
      slug = arg1;
      season = parseInt(arg2, 10) || 1;
      episode = parseInt(arg3, 10) || 1;
      proxyBase = arg4 || '';
    }
  }

  // Resolve Cinemeta metadata (name, year, aliases) if missing
  if (imdbId && (!title || !year || aliases.length === 0)) {
    const cachedCine = getCachedCinemeta(type, imdbId);
    if (cachedCine) {
      if (!year && cachedCine.year) year = cachedCine.year;
      if (!title && cachedCine.name) title = cachedCine.name;
      if (Array.isArray(cachedCine.aliases) && cachedCine.aliases.length > 0) {
        aliases = Array.from(new Set([...aliases, ...cachedCine.aliases]));
      }
    } else {
      const meta = await resolveCinemeta(type, imdbId);
      if (meta) {
        if (!year && meta.year) year = meta.year;
        if (!title && meta.name) title = meta.name;
        if (Array.isArray(meta.aliases) && meta.aliases.length > 0) {
          aliases = Array.from(new Set([...aliases, ...meta.aliases]));
        }
      }
    }
  }

  try {
    let movieData = null;

    // ─── Tier 1: Direct IMDb lookup via phimapi.com/imdb/title/:id ───
    if (imdbId) {
      movieData = await getByImdb(imdbId);
    }

    // ─── Tier 1b: Fallback lookup via slug if available ──────────────
    if (!movieData && slug) {
      movieData = await getDetail(slug);
    }

    // ─── Tier 2: Smart Search Fallback (Cinemeta title & aliases + scoreMatch) ──
    if (!movieData && (title || aliases.length > 0)) {
      const cleanTitle = title ? String(title).trim() : '';
      const searchQueries = generateSearchKeywords({
        title: cleanTitle,
        originalName: null,
        aliases,
        season,
      });

      let bestItem = null;
      let bestScore = -1;

      for (const q of searchQueries) {
        if (!q) continue;
        const results = await search(q, 10);
        for (const item of results) {
          const score = scoreMatch(item, cleanTitle || q, year, season);
          if (score > bestScore) {
            bestScore = score;
            bestItem = item;
          }
        }
        if (bestScore >= 0.70) break; // High confidence match early exit
      }

      if (bestItem && bestItem.slug && bestScore >= 0.45) {
        movieData = await getDetail(bestItem.slug);
        if (movieData && imdbId) {
          const cleanImdb = String(imdbId).toLowerCase().trim();
          imdbCache.set('kkphim:imdb:' + cleanImdb, movieData, 86400);
        }
      }
    }

    // ─── Tier 3: Safe degradation (safe empty array if all tiers fail) ───
    if (!movieData || !movieData.episodes || !movieData.episodes.length) {
      return [];
    }

    const { movie, episodes } = movieData;
    const isMovie = (type === 'movie' || movie?.type === 'single') && episode == null;
    const targetEpStr = !isMovie && episode != null ? String(episode).trim() : null;

    // Season validation for series
    if (!isMovie && season != null) {
      if (!isSeasonMatch(movie, episodes, season, type)) {
        return [];
      }
    }

    const streams = [];
    const baseRef = 'https://player.phimapi.com/';

    // Duyệt tất cả các server (Vietsub, Thuyết Minh, Lồng Tiếng)
    for (let sIdx = 0; sIdx < episodes.length; sIdx++) {
      const server = episodes[sIdx];
      const rawServerName = String(server.server_name || '').trim() || `Server ${sIdx + 1}`;
      const cleanServerName = rawServerName.replace(/[\r\n#]+/g, ' ').replace(/\s+/g, ' ').trim() || `Server ${sIdx + 1}`;
      const serverData = server.server_data || server.episode_data || server.items || server.episodes || [];

      if (!serverData.length) continue;

      let targetEp = null;
      if (isMovie || targetEpStr === null) {
        targetEp = serverData[0];
      } else {
        const epNum = parseInt(targetEpStr, 10);
        if (!isNaN(epNum) && epNum <= 0) {
          targetEp = null;
        } else {
          // Khớp linh hoạt: name, slug, zero-pad, Tập N, tap-N, regex, index fallback
          targetEp = serverData.find((ep) => matchEpisodeItem(ep, targetEpStr, epNum));

          // Index fallback (1-based)
          if (!targetEp && !isNaN(epNum) && epNum >= 1 && epNum <= serverData.length) {
            targetEp = serverData[epNum - 1];
          }
        }
      }

      if (!targetEp || !targetEp.link_m3u8) continue;

      const epLabel = formatEpisodeLabel(targetEp.name);
      const streamUrl = `${proxyBase || ''}/hls/manifest.m3u8?url=${encodeBase64(targetEp.link_m3u8)}&ref=${encodeBase64(baseRef)}`;

      const isTM = /thuy.{1,5}t minh/i.test(cleanServerName);
      const isLT = /l.{1,5}ng ti.{1,5}ng/i.test(cleanServerName);
      const isVS = /vietsub/i.test(cleanServerName);

      let titleHeader = `[VIP 2 • KKPhim] ${cleanServerName}${epLabel} Full HD (HLS Proxy)`;
      if (isTM) {
        titleHeader = `[VIP 2 • KKPhim] Thuyết Minh Full HD${epLabel} (HLS Proxy)`;
      } else if (isLT) {
        titleHeader = `[VIP 2 • KKPhim] Lồng Tiếng Full HD${epLabel} (HLS Proxy)`;
      } else if (isVS) {
        titleHeader = `[VIP 2 • KKPhim] Vietsub Full HD${epLabel} (HLS Proxy)`;
      }

      streams.push({
        name: 'VIP Movies 🎬',
        title: `${titleHeader}\n⚡ Server VIP 2 • Phát trực tiếp trong App`,
        url: streamUrl,
        behaviorHints: {
          notSupported: false,
          bingeGroup: `kkphim-${movie?.slug || slug || 'stream'}`,
        },
      });
    }

    return streams;
  } catch (err) {
    console.error(`[KKPhim/getStreams] Error:`, err.message);
    return [];
  }
}

// ─── Format Detail Meta for Stremio ─────────────────────────────
function mapDetailMeta(movie, episodes = [], forceType = null) {
  const isSeries = movie.type === 'series' || movie.type === 'hoathinh' || movie.type === 'tvshows';
  const type = forceType || (isSeries ? 'series' : 'movie');
  const id = `kkphim_${movie.slug}`;

  const genres = Array.isArray(movie.category)
    ? movie.category.map((c) => c.name || c)
    : [];
  const country = Array.isArray(movie.country)
    ? movie.country.map((c) => c.name || c).join(', ')
    : null;

  const meta = {
    id,
    type,
    name: movie.name || movie.origin_name || 'Không rõ tên',
    poster: formatImageUrl(movie.poster_url || movie.thumb_url),
    posterShape: 'poster',
    background: formatImageUrl(movie.thumb_url || movie.poster_url),
    description: movie.content ? String(movie.content).replace(/<[^>]+>/g, '') : null,
    director: Array.isArray(movie.director) ? movie.director : (movie.director ? [movie.director] : []),
    cast: Array.isArray(movie.actor) ? movie.actor : (movie.actor ? movie.actor.split(',').map((s) => s.trim()) : []),
    genres,
    runtime: movie.time || null,
    country: country || null,
    year: movie.year || null,
    releaseInfo: movie.year ? String(movie.year) : null,
  };

  if (type === 'series' && episodes && episodes.length) {
    const videos = [];
    const seen = new Set();
    for (const server of episodes) {
      for (const ep of (server.server_data || server.episode_data || server.items || server.episodes || [])) {
        const epName = ep.name || ep.slug || '1';
        if (!seen.has(epName)) {
          seen.add(epName);
          const epMatch = String(epName).match(/\d+/);
          const epNum = epMatch ? parseInt(epMatch[0], 10) : (parseInt(epName, 10) || 1);
          videos.push({
            id: `kkphim_${movie.slug}:1:${epNum}`,
            title: `Tập ${epName}`,
            season: 1,
            episode: epNum,
          });
        }
      }
    }
    meta.videos = videos;
  }

  return meta;
}

module.exports = {
  id: PROVIDER_ID,
  label: PROVIDER_LABEL,
  getByImdb,
  search,
  getDetail,
  getCatalog,
  getStreams,
  mapDetailMeta,
  matchEpisodeItem,
  formatImageUrl,
};
