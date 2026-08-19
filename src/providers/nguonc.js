'use strict';

/**
 * ============================================================
 *  VIP Movies Addon — src/providers/nguonc.js
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
const { getCachedCinemeta } = require('../lib/cinemeta');
const { safeExtra, safeSlug, safeKeyword, safePage, safeType, isSeasonMatch, scoreMatch, escapeRegExp } = require('../lib/utils');

const PROVIDER_ID    = 'nguonc';
const PROVIDER_LABEL = 'NguonC';
const BASE_API       = 'https://phim.nguonc.com/api';
const NGUONC_UA      = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36';

// ─── Axios Client (5s Timeout) ───────────────────────────────────
const http = axios.create({
  baseURL: BASE_API,
  timeout: 5000,
  headers: {
    'User-Agent': NGUONC_UA,
    Accept: 'application/json',
    'Accept-Language': 'vi-VN,vi;q=0.9,en-US;q=0.8',
  },
});

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
    const res = await http.get('/films/search', {
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
  const cached = detailCache.get(cacheKey);
  if (cached) return cached;

  try {
    const res = await http.get(`/film/${cleanSlug}`);
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
//  3. Danh mục Catalog: getCatalog(type, page = 1, extra = {})
// ─────────────────────────────────────────────────────────────
async function getCatalog(type, page = 1, extra = {}) {
  const cleanType = safeType(type, 'phim-le');
  const safe = safeExtra(extra);
  const p = safePage(page);
  const searchQuery = safeKeyword(safe.search || safe.searchQuery || safe.query);
  const genreFilter = safeKeyword(safe.genre);
  const countryFilter = safeKeyword(safe.country);
  const cacheKey = `nguonc:cat:${cleanType}:${p}:${searchQuery}:${genreFilter}:${countryFilter}`;
  const cached = catalogCache.get(cacheKey);
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
      const res = await http.get(`/films/the-loai/${genreSlug}`, { params: { page: p } });
      const raw = res.data?.items || [];
      items = raw.map((i) => mapCatalogMeta(i));
      catalogCache.set(cacheKey, items, 300);
      return items;
    }

    // Country filter mode
    if (countryFilter) {
      const countrySlug = String(countryFilter).toLowerCase().trim();
      const res = await http.get(`/films/quoc-gia/${countrySlug}`, { params: { page: p } });
      const raw = res.data?.items || [];
      items = raw.map((i) => mapCatalogMeta(i));
      catalogCache.set(cacheKey, items, 300);
      return items;
    }

    // New/List endpoints
    if (cleanType === 'phim-moi-cap-nhat' || cleanType === 'latest') {
      const res = await http.get('/films/phim-moi-cap-nhat', { params: { page: p } });
      const raw = res.data?.items || [];
      items = raw.map((i) => mapCatalogMeta(i));
    } else {
      let listType = cleanType;
      if (cleanType === 'movie') listType = 'phim-le';
      else if (cleanType === 'series') listType = 'phim-bo';
      else if (cleanType === 'anime') listType = 'hoat-hinh';
      else if (cleanType === 'cinema') listType = 'phim-chieu-rap';
      else if (cleanType === 'tvshows') listType = 'tv-shows';

      const res = await http.get(`/films/danh-sach/${listType}`, { params: { page: p } });
      const raw = res.data?.items || [];
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
async function getStreams(arg1, title, type, season, episode, proxyBase) {
  let imdbId = null;
  let slug = null;
  let year = null;
  let genres = null;

  if (typeof arg1 === 'object' && arg1 !== null) {
    imdbId    = arg1.imdbId || null;
    title     = arg1.title || null;
    type      = arg1.type || 'movie';
    year      = arg1.year || null;
    genres    = arg1.genres || null;
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

  // Check cached Cinemeta for year if missing
  if (!year && imdbId) {
    const cachedCine = getCachedCinemeta(type, imdbId);
    if (cachedCine?.year) {
      year = cachedCine.year;
    }
    if (!title && cachedCine?.name) {
      title = cachedCine.name;
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
      const cachedSlug = imdbCache.get(cacheKey);
      if (cachedSlug) {
        movieData = await getDetail(cachedSlug);
      }
    }

    // Bước 3: Tìm kiếm theo canonical title & match year / season
    if (!movieData && title) {
      const searchRes = await search(title, 1);
      const items = searchRes.items || [];
      if (items.length > 0) {
        let bestItem = null;
        let bestScore = -1;
        for (const item of items) {
          const score = scoreMatch(item, title, year, season);
          if (score > bestScore) {
            bestScore = score;
            bestItem = item;
          }
        }
        if (bestItem && bestItem.slug && bestScore >= 0.45) {
          movieData = await getDetail(bestItem.slug);
          if (movieData && imdbId) {
            imdbCache.set(`nguonc:imdb:${String(imdbId).toLowerCase().trim()}`, bestItem.slug, 86400);
          }
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
          targetEp = items.find((ep) => {
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

      const streamUrl = targetEp.m3u8
        ? `${proxyBase || ''}/hls/manifest.m3u8?url=${encodeBase64(targetEp.m3u8)}&ref=${encodeBase64('https://embed15.streamc.xyz/')}`
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
};
