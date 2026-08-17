'use strict';

/**
 * ============================================================
 *  VIP Movies Addon — src/providers/kkphim.js
 *  KKPhim Provider Module (100% Official Endpoints: phimapi.com)
 *
 *  Features:
 *  - 5-second axios timeout for high resilience & zero blocking
 *  - Direct IMDb lookup -> fallback Cinemeta title & year search
 *  - Multi-server support: Vietsub, Thuyết Minh, Lồng Tiếng
 *  - R3 Stremio Stream Protocol compliance:
 *    * In-App Direct Play: HLS Proxy (url only, NO externalUrl)
 *    * External Web Browser Play: Embed Player (externalUrl only, NO url)
 * ============================================================
 */

const axios = require('axios');
const { imdbCache, catalogCache, detailCache } = require('../lib/cache');
const { getCachedCinemeta } = require('../lib/cinemeta');

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

/**
 * Similarity and year score matching
 */
function scoreMatch(item, title, year) {
  if (!item || !title) return 0;
  const normalize = (s) =>
    String(s || '')
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^\w\s]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();

  const target = normalize(title);
  const nameNorm = normalize(item.name);
  const originNorm = normalize(item.origin_name);
  const slugNorm = normalize(String(item.slug || '').replace(/-/g, ' '));

  let score = 0;
  if (nameNorm === target || originNorm === target || slugNorm === target) {
    score = 1.0;
  } else if (
    nameNorm.includes(target) ||
    originNorm.includes(target) ||
    target.includes(nameNorm) ||
    target.includes(originNorm)
  ) {
    score = 0.8;
  } else {
    const targetWords = new Set(target.split(' ').filter(Boolean));
    const words = [...new Set([...nameNorm.split(' '), ...originNorm.split(' ')])].filter(Boolean);
    const common = words.filter((w) => targetWords.has(w)).length;
    score = targetWords.size > 0 ? (common / targetWords.size) * 0.7 : 0;
  }

  if (year && item.year) {
    const itemYear = parseInt(item.year, 10);
    const targetYear = parseInt(year, 10);
    if (!isNaN(itemYear) && !isNaN(targetYear)) {
      if (itemYear === targetYear) {
        score += 0.25;
      } else if (Math.abs(itemYear - targetYear) <= 1) {
        score += 0.1;
      } else {
        score -= 0.2;
      }
    }
  }

  return score;
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
  const cacheKey = `kkphim:imdb:${imdbId}`;
  const cached = imdbCache.get(cacheKey);
  if (cached) return cached;

  try {
    const res = await http.get(`/imdb/title/${imdbId}`);
    const movie = res.data?.movie;
    const episodes = res.data?.episodes || movie?.episodes || [];
    if (movie) {
      const result = { movie, episodes };
      imdbCache.set(cacheKey, result, 86400); // 24h
      return result;
    }
  } catch (err) {
    console.warn(`[KKPhim/getByImdb] ${imdbId}: ${err.message}`);
  }
  return null;
}

// ─────────────────────────────────────────────────────────────
//  2. Tìm kiếm phim: search(keyword, limit = 10)
// ─────────────────────────────────────────────────────────────
async function search(keyword, limit = 10) {
  if (!keyword) return [];
  try {
    const res = await http.get('/v1/api/tim-kiem', {
      params: {
        keyword: keyword.trim(),
        limit,
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
    console.error(`[KKPhim/search] keyword="${keyword}":`, err.message);
    return [];
  }
}

// ─────────────────────────────────────────────────────────────
//  3. Chi tiết phim & danh sách tập: getDetail(slug)
// ─────────────────────────────────────────────────────────────
async function getDetail(slug) {
  if (!slug) return null;
  const cleanSlug = slug.replace(/^kkphim[_:]/, '');
  const cacheKey = `kkphim:detail:${cleanSlug}`;
  const cached = detailCache.get(cacheKey);
  if (cached) return cached;

  try {
    const res = await http.get(`/phim/${cleanSlug}`);
    const movie = res.data?.movie;
    const episodes = res.data?.episodes || [];
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
//  4. Danh mục & Bộ lọc Catalog: getCatalog(type, page = 1, extra = {})
// ─────────────────────────────────────────────────────────────
async function getCatalog(type, page = 1, extra = {}) {
  const { search: searchQuery, genre: genreFilter, country: countryFilter } = extra;
  const cacheKey = `kkphim:cat:${type}:${page}:${searchQuery || ''}:${genreFilter || ''}:${countryFilter || ''}`;
  const cached = catalogCache.get(cacheKey);
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
      const res = await http.get(`/v1/api/the-loai/${genreSlug}`, { params: { page } });
      const raw = res.data?.data?.items || [];
      items = raw.map((i) => mapCatalogMeta(i));
      catalogCache.set(cacheKey, items, 300);
      return items;
    }

    // Country filter mode
    if (countryFilter) {
      const countrySlug = String(countryFilter).toLowerCase().trim();
      const res = await http.get(`/v1/api/quoc-gia/${countrySlug}`, { params: { page } });
      const raw = res.data?.data?.items || [];
      items = raw.map((i) => mapCatalogMeta(i));
      catalogCache.set(cacheKey, items, 300);
      return items;
    }

    // New/List endpoints
    if (type === 'phim-moi-cap-nhat' || type === 'latest') {
      const res = await http.get('/danh-sach/phim-moi-cap-nhat', { params: { page } });
      const raw = res.data?.items || [];
      items = raw.map((i) => mapCatalogMeta(i));
    } else {
      let listType = type;
      if (type === 'movie') listType = 'phim-le';
      else if (type === 'series') listType = 'phim-bo';
      else if (type === 'anime') listType = 'hoat-hinh';
      else if (type === 'cinema') listType = 'phim-chieu-rap';
      else if (type === 'tvshows') listType = 'tv-shows';

      const res = await http.get(`/v1/api/danh-sach/${listType}`, { params: { page } });
      const raw = res.data?.data?.items || [];
      items = raw.map((i) => mapCatalogMeta(i, type === 'series' ? 'series' : 'movie'));
    }

    catalogCache.set(cacheKey, items, 300);
    return items;
  } catch (err) {
    console.error(`[KKPhim/getCatalog] type=${type} page=${page}:`, err.message);
    return [];
  }
}

// ─────────────────────────────────────────────────────────────
//  5. Trích xuất Luồng Stream: getStreams({ imdbId, type, title, year, genres, season, episode, slug, proxyBase })
// ─────────────────────────────────────────────────────────────
async function getStreams(arg1, title, type, season, episode, proxyBase) {
  let imdbId = arg1;
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
  }

  // Check cached Cinemeta for year if missing
  if (!year && imdbId) {
    const cachedCine = getCachedCinemeta(type, imdbId);
    if (cachedCine?.year) {
      year = cachedCine.year;
    }
  }

  try {
    let movieData = null;

    // Bước 1: Tra cứu trực tiếp IMDb qua API phimapi
    if (imdbId) {
      movieData = await getByImdb(imdbId);
    }

    // Bước 2: Fallback tra cứu qua slug nếu có
    if (!movieData && slug) {
      movieData = await getDetail(slug);
    }

    // Bước 3: Fallback tìm kiếm theo canonical title & match year
    if (!movieData && title) {
      const searchResults = await search(title, 10);
      if (searchResults.length > 0) {
        let bestItem = null;
        let bestScore = -1;
        for (const item of searchResults) {
          const score = scoreMatch(item, title, year);
          if (score > bestScore) {
            bestScore = score;
            bestItem = item;
          }
        }
        if (bestItem && bestItem.slug && bestScore >= 0.5) {
          movieData = await getDetail(bestItem.slug);
          if (movieData && imdbId) {
            imdbCache.set(`kkphim:imdb:${imdbId}`, movieData, 86400);
          }
        }
      }
    }

    if (!movieData || !movieData.episodes || !movieData.episodes.length) {
      return [];
    }

    const { movie, episodes } = movieData;
    const isMovie = type === 'movie' || movie?.type === 'single' || (episodes.length === 1 && episodes[0]?.server_data?.length === 1);
    const targetEpStr = !isMovie && episode != null ? String(episode).trim() : null;

    const streams = [];
    const baseRef = 'https://phimapi.com/';

    // Bước 4: Duyệt tất cả các server (Vietsub, Thuyết Minh, Lồng Tiếng)
    for (let sIdx = 0; sIdx < episodes.length; sIdx++) {
      const server = episodes[sIdx];
      const rawServerName = server.server_name || `Server #${sIdx + 1}`;
      const cleanServerName = rawServerName.replace(/#/g, '').trim() || `Server ${sIdx + 1}`;
      const serverData = server.server_data || [];

      if (!serverData.length) continue;

      let targetEp = null;
      if (isMovie || targetEpStr === null) {
        targetEp = serverData[0];
      } else {
        // Khớp ep.name == episode hoặc ep.slug == "tap-" + episode hoặc index episode - 1
        targetEp = serverData.find((ep) => {
          if (!ep) return false;
          if (String(ep.name).trim() === targetEpStr) return true;
          if (ep.slug === `tap-${targetEpStr}` || ep.slug === `tap-0${targetEpStr}`) return true;
          if (ep.name && String(ep.name).match(new RegExp(`\\b${targetEpStr}\\b`))) return true;
          return false;
        });

        // Index fallback
        if (!targetEp) {
          const epNum = parseInt(targetEpStr, 10);
          if (!isNaN(epNum) && epNum >= 1 && epNum <= serverData.length) {
            targetEp = serverData[epNum - 1];
          }
        }
      }

      if (!targetEp) continue;

      const epLabel = targetEp.name && String(targetEp.name).toUpperCase() !== 'FULL' ? ` [Tập ${targetEp.name}]` : '';

      // 1. In-App Direct Play (HLS Proxy) — MUST NOT have externalUrl
      if (targetEp.link_m3u8) {
        const streamUrl = proxyBase
          ? `${proxyBase}/hls/manifest.m3u8?url=${encodeBase64(targetEp.link_m3u8)}&ref=${encodeBase64(baseRef)}`
          : targetEp.link_m3u8;

        streams.push({
          name: 'VIP Movies 🎬',
          title: `[VIP • KKPhim] ${cleanServerName}${epLabel} (HLS Proxy)\n⚡ Phát trực tiếp trong App`,
          url: streamUrl,
          behaviorHints: {
            notSupported: false,
            bingeGroup: `kkphim-${movie?.slug || 'stream'}`,
          },
        });
      }

      // 2. External Web Browser Play (Embed Player Fallback) — MUST NOT have url
      if (targetEp.link_embed) {
        streams.push({
          name: 'VIP Movies 🎬',
          title: `[Dự phòng • KKPhim] ${cleanServerName}${epLabel} (Embed Player)\n🌐 Bấm để mở xem ngoài trình duyệt web`,
          externalUrl: targetEp.link_embed,
          behaviorHints: {
            notSupported: false,
            bingeGroup: `kkphim-${movie?.slug || 'stream'}`,
          },
        });
      }
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
      for (const ep of (server.server_data || [])) {
        const epName = ep.name || ep.slug || '1';
        if (!seen.has(epName)) {
          seen.add(epName);
          const epNum = parseInt(epName, 10) || 1;
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
  formatImageUrl,
};
