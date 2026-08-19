'use strict';

/**
 * ============================================================
 *  VIP Movies Addon — src/providers/nguonc.js (Engine v1.6.0)
 *  NguonC Provider Module (100% Official Endpoints: phim.nguonc.com/api)
 *
 *  Features:
 *  - 5-second axios timeout for high resilience & zero blocking
 *  - Cinemeta title & year search matching
 *  - Multi-server support: Vietsub & Thuyết Minh
 *  - R3 Stremio Stream Protocol compliance:
 *    * In-App Direct Play: HLS Proxy (url only, strictly NO externalUrl)
 * ============================================================
 */

const axios = require('axios');
const mapper = require('../mapper');
const { imdbCache, catalogCache, detailCache } = require('../lib/cache');
const { resolveCinemeta, getCachedCinemeta } = require('../lib/cinemeta');
const { safeExtra, safeSlug, safeKeyword, safePage, safeType, isSeasonMatch, scoreMatch, escapeRegExp, generateSearchKeywords, matchEpisodeItem } = require('../lib/utils');

const PROVIDER_ID    = 'nguonc';
const PROVIDER_LABEL = 'NguonC';
const BASE_API       = 'https://phim.nguonc.com/api';
const NGUONC_UA      = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

const NGUONC_HEADERS = {
  'User-Agent': NGUONC_UA,
  'Referer': 'https://phim.nguonc.com/',
  'Origin': 'https://phim.nguonc.com',
  'Accept': 'application/json, text/plain, */*',
  'Sec-Fetch-Dest': 'empty',
  'Sec-Fetch-Mode': 'cors',
  'Sec-Fetch-Site': 'same-origin',
  'Accept-Language': 'vi-VN,vi;q=0.9,en-US;q=0.8',
};

// ─── Axios Client (5s Timeout) with Stealth Engine ──────────────
const http = axios.create({
  baseURL: BASE_API,
  timeout: 5000,
  headers: NGUONC_HEADERS,
});

async function fetchNguonC(endpoint, options = {}) {
  const config = {
    timeout: options.timeout || 5000,
    headers: { ...NGUONC_HEADERS, ...(options.headers || {}) },
    params: options.params,
  };
  try {
    return await http.get(endpoint, config);
  } catch (err) {
    const isForbiddenOrBlocked = err.response?.status === 403 || err.response?.status === 429 || (!err.response && err.code === 'ECONNABORTED');
    const backendProxy = process.env.RENDER_BACKEND_URL;
    if (backendProxy && isForbiddenOrBlocked) {
      try {
        const cleanProxy = backendProxy.replace(/\/+$/, '');
        const cleanEndpoint = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;
        const fullNguonCUrl = `https://phim.nguonc.com/api${cleanEndpoint}`;
        // Support Render proxy format: /proxy/nguonc?url=...
        const target = `${cleanProxy}/proxy/nguonc?url=${encodeURIComponent(fullNguonCUrl)}`;
        return await axios.get(target, { timeout: 7000, headers: NGUONC_HEADERS, params: options.params });
      } catch (proxyErr) {
        // Fall back to throwing original error
      }
    }
    throw err;
  }
}

function encodeBase64(str) {
  if (!str) return '';
  return Buffer.from(str, 'utf8').toString('base64url');
}

function mapCatalogMeta(item, forceType = null) {
  const type = forceType || mapper.detectType(item);
  const slug = item.slug || '';
  const badgeParts = [];
  if (item.quality) badgeParts.push(item.quality);
  if (item.language) badgeParts.push(item.language);
  if (item.current_episode && item.current_episode !== 'FULL') {
    badgeParts.push(item.current_episode);
  }

  return {
    id: `nguonc_${slug}`,
    type,
    name: item.name || item.original_name || 'Không rõ tên',
    poster: item.thumb_url || item.poster_url || null,
    posterShape: 'poster',
    background: item.poster_url || item.thumb_url || null,
    description: item.description || null,
    releaseInfo: badgeParts.length > 0 ? badgeParts.join(' · ') : null,
  };
}

// ─────────────────────────────────────────────────────────────
//  1. Tìm kiếm phim: search(keyword, page = 1)
// ─────────────────────────────────────────────────────────────
async function search(keyword, page = 1) {
  const cleanKeyword = safeKeyword(keyword);
  const p = safePage(page);
  if (!cleanKeyword) return { items: [] };

  try {
    const res = await fetchNguonC('/films/search', {
      params: {
        keyword: cleanKeyword,
        page: p,
      },
    });
    return res.data || { items: [] };
  } catch (err) {
    console.error(`[NguonC/search] keyword="${cleanKeyword}":`, err.message);
    return { items: [] };
  }
}

// ─────────────────────────────────────────────────────────────
//  2. Chi tiết phim & tập: getDetail(slug)
// ─────────────────────────────────────────────────────────────
async function getDetail(slug) {
  const cleanSlug = safeSlug(slug, 'nguonc');
  if (!cleanSlug) return null;
  const cacheKey = `nguonc:detail:${cleanSlug}`;
  const cached = await detailCache.get(cacheKey);
  if (cached) return cached;

  try {
    const res = await fetchNguonC(`/film/${cleanSlug}`);
    const movie = res.data?.movie;
    if (movie) {
      const result = { movie, episodes: movie.episodes || [] };
      detailCache.set(cacheKey, result, 600); // 10 minutes
      return result;
    }
  } catch (err) {
    console.error(`[NguonC/getDetail] slug="${cleanSlug}":`, err.message);
  }
  return null;
}

// ─────────────────────────────────────────────────────────────
//  3. Danh mục Catalog: getCatalog(type, id/page, extra, page)
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
  const cacheKey = `nguonc:cat:${cleanType}:${p}:${searchQuery}:${genreFilter}:${countryFilter}`;
  const cached = await catalogCache.get(cacheKey);
  if (cached) return cached;

  try {
    let items = [];

    // Search mode
    if (searchQuery) {
      const searchRes = await search(searchQuery, p);
      const raw = searchRes.items || [];
      items = raw.map((i) => mapCatalogMeta(i));
      catalogCache.set(cacheKey, items, 120);
      return items;
    }

    // Genre filter mode
    if (genreFilter) {
      const genreSlug = String(genreFilter).toLowerCase().trim();
      const res = await fetchNguonC(`/films/the-loai/${genreSlug}`, { params: { page: p } });
      const raw = res.data?.items || [];
      items = raw.map((i) => mapCatalogMeta(i));
      catalogCache.set(cacheKey, items, 300);
      return items;
    }

    // Country filter mode
    if (countryFilter) {
      const countrySlug = String(countryFilter).toLowerCase().trim();
      const res = await fetchNguonC(`/films/quoc-gia/${countrySlug}`, { params: { page: p } });
      const raw = res.data?.items || [];
      items = raw.map((i) => mapCatalogMeta(i));
      catalogCache.set(cacheKey, items, 300);
      return items;
    }

    // New/List endpoints
    if (cleanType === 'phim-moi-cap-nhat' || cleanType === 'latest') {
      const res = await fetchNguonC('/films/phim-moi-cap-nhat', { params: { page: p } });
      const raw = res.data?.items || [];
      items = raw.map((i) => mapCatalogMeta(i));
    } else {
      let listType = cleanType;
      if (cleanType === 'movie' || cleanType === 'phim-le') listType = 'phim-le';
      else if (cleanType === 'series' || cleanType === 'phim-bo') listType = 'phim-bo';
      else if (cleanType === 'anime' || cleanType === 'hoat-hinh') listType = 'hoat-hinh';
      else if (cleanType === 'cinema' || cleanType === 'phim-chieu-rap' || cleanType.includes('cinema') || cleanType.includes('chieu-rap')) listType = 'phim-chieu-rap';
      else if (cleanType === 'tvshows' || cleanType === 'tv-shows') listType = 'tv-shows';

      let raw = [];
      const isCinema = cleanType === 'cinema' || listType === 'phim-chieu-rap';

      try {
        const res = await fetchNguonC(`/films/danh-sach/${listType}`, { params: { page: p } });
        raw = res.data?.items || [];
      } catch (listErr) {
        if (isCinema) {
          // Graceful fallback for cinema catalog: try phim-le, then phim-moi-cap-nhat
          try {
            const fallbackRes = await fetchNguonC('/films/danh-sach/phim-le', { params: { page: p } });
            raw = fallbackRes.data?.items || [];
          } catch {
            const fallbackRes2 = await fetchNguonC('/films/phim-moi-cap-nhat', { params: { page: p } });
            raw = fallbackRes2.data?.items || [];
          }
        } else {
          throw listErr;
        }
      }

      if (isCinema && raw.length === 0) {
        try {
          const fallbackRes = await fetchNguonC('/films/danh-sach/phim-le', { params: { page: p } });
          raw = fallbackRes.data?.items || [];
        } catch {
          const fallbackRes2 = await fetchNguonC('/films/phim-moi-cap-nhat', { params: { page: p } });
          raw = fallbackRes2.data?.items || [];
        }
      }

      items = raw.map((i) => mapCatalogMeta(i, cleanType === 'series' ? 'series' : 'movie'));
    }

    catalogCache.set(cacheKey, items, 300);
    return items;
  } catch (err) {
    console.error(`[NguonC/getCatalog] type=${cleanType} page=${p}:`, err.message);
    return [];
  }
}

// ─────────────────────────────────────────────────────────────
//  4. Trích xuất Luồng Stream: getStreams({ imdbId, type, title, year, genres, season, episode, slug, proxyBase })
// ─────────────────────────────────────────────────────────────
//  4. Trích xuất Luồng Stream: getStreams({ imdbId, type, title, year, genres, season, episode, slug, proxyBase })
// ─────────────────────────────────────────────────────────────
async function getStreams(arg1, title, type, season, episode, proxyBase) {
  let imdbId  = null;
  let slug    = null;
  let year    = null;
  let genres  = null;
  let aliases = [];

  if (typeof arg1 === 'object' && arg1 !== null) {
    imdbId    = arg1.imdbId || null;
    title     = arg1.title || null;
    type      = arg1.type || 'movie';
    year      = arg1.year || null;
    genres    = arg1.genres || null;
    aliases   = Array.isArray(arg1.aliases) ? arg1.aliases : [];
    season    = arg1.season != null ? arg1.season : null;
    episode   = arg1.episode != null ? arg1.episode : null;
    slug      = arg1.slug || null;
    proxyBase = arg1.proxyBase || '';
  } else if (typeof arg1 === 'string') {
    if (/^tt\d+/i.test(arg1)) {
      imdbId = arg1;
    } else {
      slug = arg1;
    }
    type = type || 'movie';
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

    // Bước 1: Tra cứu qua slug nếu có
    if (slug) {
      movieData = await getDetail(slug);
    }

    // Bước 2: Tra cứu qua IMDb ID đã cache
    if (!movieData && imdbId) {
      const cleanImdb = String(imdbId).toLowerCase().trim();
      const cacheKey = `nguonc:imdb:${cleanImdb}`;
      const cachedSlug = await imdbCache.get(cacheKey);
      if (cachedSlug) {
        movieData = await getDetail(cachedSlug);
      }
    }

    // Bước 3: Multi-Keyword Search Fallback (Cinemeta title, aliases, normalized keywords)
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
        const searchRes = await search(q, 1);
        const items = searchRes.items || [];
        for (const item of items) {
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
          imdbCache.set(`nguonc:imdb:${String(imdbId).toLowerCase().trim()}`, bestItem.slug, 86400);
        }
      }
    }

    if (!movieData || !movieData.movie) {
      return [];
    }

    const { movie } = movieData;
    const episodes = movie.episodes || movieData.episodes || [];
    if (!episodes.length) return [];

    const isMovie = (type === 'movie' || mapper.detectType(movie) === 'movie') && episode == null;
    const targetEpStr = !isMovie && episode != null ? String(episode).trim() : null;

    // Season validation for series
    if (!isMovie && season != null) {
      if (!isSeasonMatch(movie, episodes, season, type)) {
        return [];
      }
    }

    const streams = [];

    // Duyệt mảng episodes qua tất cả server (Vietsub, Thuyết Minh, v.v.)
    for (let sIdx = 0; sIdx < episodes.length; sIdx++) {
      const server = episodes[sIdx];
      const rawServerName = String(server.server_name || '').trim() || `Server ${sIdx + 1}`;
      const cleanServerName = rawServerName.replace(/[\r\n#]+/g, ' ').replace(/\s+/g, ' ').trim() || `Server ${sIdx + 1}`;
      const items = server.items || [];

      if (!items.length) continue;

      let targetEp = null;
      if (isMovie || targetEpStr === null) {
        targetEp = items[0];
      } else {
        const epNum = parseInt(targetEpStr, 10);
        if (!isNaN(epNum) && epNum <= 0) {
          targetEp = null;
        } else {
          // Universal Episode Matcher
          targetEp = items.find((ep) => matchEpisodeItem(ep, targetEpStr, epNum));

          // Index fallback (1-based)
          if (!targetEp && !isNaN(epNum) && epNum >= 1 && epNum <= items.length) {
            targetEp = items[epNum - 1];
          }
        }
      }

      if (!targetEp || !targetEp.embed) continue;

      const epLabel = targetEp.name && String(targetEp.name).toUpperCase() !== 'FULL' ? ` [Tập ${targetEp.name}]` : '';
      const encodedEmbed = encodeBase64(targetEp.embed);

      const isTM = /thuy.{1,5}t minh/i.test(cleanServerName);
      const isLT = /l.{1,5}ng ti.{1,5}ng/i.test(cleanServerName);
      const isVS = /vietsub/i.test(cleanServerName);

      let titleHeader = `[VIP 3 • NguonC] ${cleanServerName}${epLabel} (HLS Proxy)`;
      if (isTM) {
        titleHeader = `[VIP 3 • NguonC] Thuyết Minh Full HD${epLabel} (HLS Proxy)`;
      } else if (isLT) {
        titleHeader = `[VIP 3 • NguonC] Lồng Tiếng Full HD${epLabel} (HLS Proxy)`;
      } else if (isVS) {
        titleHeader = `[VIP 3 • NguonC] Vietsub Full HD${epLabel} (HLS Proxy)`;
      }

      let embedOrigin = 'https://embed15.streamc.xyz/';
      try {
        if (targetEp.embed) embedOrigin = `${new URL(targetEp.embed).origin}/`;
        else if (targetEp.m3u8) embedOrigin = `${new URL(targetEp.m3u8).origin}/`;
      } catch {}

      const streamUrl = targetEp.m3u8
        ? `${proxyBase || ''}/hls/manifest.m3u8?url=${encodeBase64(targetEp.m3u8)}&ref=${encodeBase64(embedOrigin)}`
        : `${proxyBase || ''}/hls/extract?b64=${encodedEmbed}`;

      // In-App Direct Play (HLS Proxy) — STRICTLY NO externalUrl
      streams.push({
        name: 'VIP Movies 🎬',
        title: `${titleHeader}\n⚡ Server VIP 3 • Phát trực tiếp trong App`,
        url: streamUrl,
        behaviorHints: {
          notSupported: false,
          bingeGroup: `nguonc-${movie.slug || 'stream'}`,
        },
      });
    }

    return streams;
  } catch (err) {
    console.error(`[NguonC/getStreams] Error:`, err.message);
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
  mapCatalogMeta,
  matchEpisodeItem,
};
