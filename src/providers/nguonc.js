'use strict';

/**
 * ============================================================
 *  VIP Movies Addon — src/providers/nguonc.js
 *  Mô-đun NguonC chuẩn đặc tả API phim.nguonc.com/api (100% Official Endpoints)
 *
 *  Endpoints:
 *    - Tim kiem:    GET https://phim.nguonc.com/api/films/search?keyword=${kw}&page=${page}
 *    - Chi tiet:    GET https://phim.nguonc.com/api/film/${slug}
 *    - Moi cap nhat:GET https://phim.nguonc.com/api/films/phim-moi-cap-nhat?page=${page}
 *    - Danh sach:   GET https://phim.nguonc.com/api/films/danh-sach/${type}?page=${page}
 *    - The loai:    GET https://phim.nguonc.com/api/films/the-loai/${genreSlug}?page=${page}
 *    - Quoc gia:    GET https://phim.nguonc.com/api/films/quoc-gia/${countrySlug}?page=${page}
 * ============================================================
 */

const axios = require('axios');
const api   = require('../api');
const mapper = require('../mapper');
const { imdbCache, catalogCache, detailCache } = require('../lib/cache');

const PROVIDER_ID    = 'nguonc';
const PROVIDER_LABEL = 'VIP 1 • NguonC';
const BASE_API       = 'https://phim.nguonc.com/api';
const NGUONC_UA      = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36';

// ─── Axios Client ───────────────────────────────────────────────
const http = axios.create({
  baseURL: BASE_API,
  timeout: 12000,
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
  if (!keyword) return { items: [] };
  try {
    const res = await http.get('/films/search', {
      params: {
        keyword: keyword.trim(),
        page,
      },
    });
    return res.data || { items: [] };
  } catch (err) {
    console.error(`[NguonC/search] keyword="${keyword}":`, err.message);
    return { items: [] };
  }
}

// ─────────────────────────────────────────────────────────────
//  2. Chi tiết phim & tập: getDetail(slug)
// ─────────────────────────────────────────────────────────────
async function getDetail(slug) {
  if (!slug) return null;
  const cleanSlug = slug.replace(/^nguonc[_:]/, '');
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
  const { search: searchQuery, genre: genreFilter, country: countryFilter } = extra;
  const cacheKey = `nguonc:cat:${type}:${page}:${searchQuery || ''}:${genreFilter || ''}:${countryFilter || ''}`;
  const cached = catalogCache.get(cacheKey);
  if (cached) return cached;

  try {
    let items = [];

    // Search mode
    if (searchQuery) {
      const searchRes = await search(searchQuery, page);
      const raw = searchRes.items || [];
      items = raw.map((i) => mapCatalogMeta(i));
      catalogCache.set(cacheKey, items, 120);
      return items;
    }

    // Genre filter mode
    if (genreFilter) {
      const genreSlug = String(genreFilter).toLowerCase().trim();
      const res = await http.get(`/films/the-loai/${genreSlug}`, { params: { page } });
      const raw = res.data?.items || [];
      items = raw.map((i) => mapCatalogMeta(i));
      catalogCache.set(cacheKey, items, 300);
      return items;
    }

    // Country filter mode
    if (countryFilter) {
      const countrySlug = String(countryFilter).toLowerCase().trim();
      const res = await http.get(`/films/quoc-gia/${countrySlug}`, { params: { page } });
      const raw = res.data?.items || [];
      items = raw.map((i) => mapCatalogMeta(i));
      catalogCache.set(cacheKey, items, 300);
      return items;
    }

    // New/List endpoints
    if (type === 'phim-moi-cap-nhat' || type === 'latest') {
      const res = await http.get('/films/phim-moi-cap-nhat', { params: { page } });
      const raw = res.data?.items || [];
      items = raw.map((i) => mapCatalogMeta(i));
    } else {
      let listType = type;
      if (type === 'movie') listType = 'phim-le';
      else if (type === 'series') listType = 'phim-bo';
      else if (type === 'anime') listType = 'hoat-hinh';
      else if (type === 'cinema') listType = 'phim-chieu-rap';
      else if (type === 'tvshows') listType = 'tv-shows';

      const res = await http.get(`/films/danh-sach/${listType}`, { params: { page } });
      const raw = res.data?.items || [];
      items = raw.map((i) => mapCatalogMeta(i, type === 'series' ? 'series' : 'movie'));
    }

    catalogCache.set(cacheKey, items, 300);
    return items;
  } catch (err) {
    console.error(`[NguonC/getCatalog] type=${type} page=${page}:`, err.message);
    return [];
  }
}

// ─────────────────────────────────────────────────────────────
//  4. Trích xuất Luồng Stream: getStreams({ imdbId, type, title, season, episode, slug, proxyBase })
// ─────────────────────────────────────────────────────────────
async function getStreams(arg1, title, type, season, episode, proxyBase) {
  let imdbId = arg1;
  let slug = null;
  if (typeof arg1 === 'object' && arg1 !== null) {
    imdbId    = arg1.imdbId;
    title     = arg1.title;
    type      = arg1.type;
    season    = arg1.season;
    episode   = arg1.episode;
    slug      = arg1.slug;
    proxyBase = arg1.proxyBase;
  }
  try {
    let movieData = null;

    // Bước 1: Tra cứu qua slug nếu có
    if (slug) {
      movieData = await getDetail(slug);
    }

    // Tra cứu qua IMDb ID
    if (!movieData && imdbId) {
      const cacheKey = `nguonc:imdb:${imdbId}`;
      let cachedSlug = imdbCache.get(cacheKey);

      if (!cachedSlug) {
        const match = await api.findFilmByImdbId(type, imdbId);
        if (match && match.slug) {
          cachedSlug = match.slug;
          imdbCache.set(cacheKey, cachedSlug, 86400); // 24h
        }
      }

      if (cachedSlug) {
        movieData = await getDetail(cachedSlug);
      }
    }

    // Fallback: Tìm kiếm theo title
    if (!movieData && title) {
      const searchRes = await search(title, 1);
      const items = searchRes.items || [];
      if (items.length > 0 && items[0].slug) {
        movieData = await getDetail(items[0].slug);
      }
    }

    if (!movieData || !movieData.movie) {
      return [];
    }

    const { movie } = movieData;
    const episodes = movie.episodes || [];
    if (!episodes.length) return [];

    const isMovie = type === 'movie' || mapper.detectType(movie) === 'movie';
    const targetEpStr = !isMovie && episode != null ? String(episode) : null;

    const streams = [];

    // Duyệt mảng episodes qua các server (Vietsub, Thuyết Minh)
    for (let sIdx = 0; sIdx < episodes.length; sIdx++) {
      const server = episodes[sIdx];
      const serverName = server.server_name || `Server ${sIdx + 1}`;
      const items = server.items || [];

      if (!items.length) continue;

      let targetEp = null;
      if (isMovie || targetEpStr === null) {
        targetEp = items[0];
      } else {
        targetEp = items.find((ep) => {
          if (!ep) return false;
          if (String(ep.name).trim() === targetEpStr) return true;
          if (ep.slug === `tap-${targetEpStr}` || ep.slug === `tap-0${targetEpStr}`) return true;
          if (ep.name && String(ep.name).match(new RegExp(`\\b${targetEpStr}\\b`))) return true;
          return false;
        });

        if (!targetEp) {
          const epNum = parseInt(targetEpStr, 10);
          if (!isNaN(epNum) && epNum >= 1 && epNum <= items.length) {
            targetEp = items[epNum - 1];
          }
        }
      }

      if (!targetEp || !targetEp.embed) continue;

      const epLabel = targetEp.name && targetEp.name.toUpperCase() !== 'FULL' ? ` [Tập ${targetEp.name}]` : '';
      const encodedEmbed = encodeBase64(targetEp.embed);

      // 1. HLS Proxy Stream (Lazy extraction từ iframe StreamC)
      if (proxyBase) {
        streams.push({
          name: 'VIP Movies 🎬',
          title: `[VIP 1 • NguonC] ${serverName}${epLabel} Full HD (HLS Proxy)\n⚡ Server VIP • StreamC Proxy`,
          url: `${proxyBase}/hls/extract?b64=${encodedEmbed}`,
          behaviorHints: {
            notSupported: false,
            bingeGroup: `nguonc-${movie.slug || 'stream'}`,
          },
        });
      }

      // 2. Embed Player Fallback
      streams.push({
        name: 'VIP Movies 🎬',
        title: `[VIP 1 • NguonC] ${serverName}${epLabel} Full HD\n📺 Embed Player (Dự phòng)`,
        url: targetEp.embed,
        externalUrl: targetEp.embed,
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
