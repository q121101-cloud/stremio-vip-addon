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
 *    * In-App Direct Play: HLS Proxy (url only, NO externalUrl)
 *    * External Web Browser Play: Embed Player (externalUrl only, NO url)
 * ============================================================
 */

const axios = require('axios');
const mapper = require('../mapper');
const { imdbCache, catalogCache, detailCache } = require('../lib/cache');
const { getCachedCinemeta } = require('../lib/cinemeta');

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

/**
 * Similarity and year score matching
 */
function scoreMatch(item, title, year, type) {
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
  const originNorm = normalize(item.original_name);
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

  // Check year
  let itemYear = mapper.extractYear(item.category);
  if (!itemYear && item.name) {
    const m = String(item.name).match(/\b(19\d\d|20\d\d)\b/);
    if (m) itemYear = parseInt(m[1], 10);
  }
  if (!itemYear && item.original_name) {
    const m = String(item.original_name).match(/\b(19\d\d|20\d\d)\b/);
    if (m) itemYear = parseInt(m[1], 10);
  }

  if (year && itemYear) {
    const targetYear = parseInt(year, 10);
    if (!isNaN(targetYear)) {
      if (itemYear === targetYear) {
        score += 0.25;
      } else if (Math.abs(itemYear - targetYear) <= 1) {
        score += 0.1;
      } else {
        score -= 0.2;
      }
    }
  }

  // Type check bonus
  if (type) {
    const itemType = mapper.detectType(item);
    if (itemType === type) {
      score += 0.1;
    }
  }

  return score;
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
//  4. Trích xuất Luồng Stream: getStreams({ imdbId, type, title, year, genres, season, episode, slug, proxyBase })
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

    // Bước 1: Tra cứu qua slug nếu có
    if (slug) {
      movieData = await getDetail(slug);
    }

    // Bước 2: Tra cứu qua IMDb ID đã cache
    if (!movieData && imdbId) {
      const cacheKey = `nguonc:imdb:${imdbId}`;
      const cachedSlug = imdbCache.get(cacheKey);
      if (cachedSlug) {
        movieData = await getDetail(cachedSlug);
      }
    }

    // Bước 3: Tìm kiếm theo canonical title & match year
    if (!movieData && title) {
      const searchRes = await search(title, 1);
      const items = searchRes.items || [];
      if (items.length > 0) {
        let bestItem = null;
        let bestScore = -1;
        for (const item of items) {
          const score = scoreMatch(item, title, year, type);
          if (score > bestScore) {
            bestScore = score;
            bestItem = item;
          }
        }
        if (bestItem && bestItem.slug && bestScore >= 0.5) {
          movieData = await getDetail(bestItem.slug);
          if (movieData && imdbId) {
            imdbCache.set(`nguonc:imdb:${imdbId}`, bestItem.slug, 86400);
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

    const isMovie = type === 'movie' || mapper.detectType(movie) === 'movie';
    const targetEpStr = !isMovie && episode != null ? String(episode).trim() : null;

    const streams = [];

    // Duyệt mảng episodes qua tất cả server (Vietsub, Thuyết Minh, v.v.)
    for (let sIdx = 0; sIdx < episodes.length; sIdx++) {
      const server = episodes[sIdx];
      const rawServerName = server.server_name || `Server #${sIdx + 1}`;
      const cleanServerName = rawServerName.replace(/#/g, '').trim() || `Server ${sIdx + 1}`;
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

      const epLabel = targetEp.name && String(targetEp.name).toUpperCase() !== 'FULL' ? ` [Tập ${targetEp.name}]` : '';
      const encodedEmbed = encodeBase64(targetEp.embed);

      // 1. In-App Direct Play (HLS Proxy) — MUST NOT have externalUrl
      if (proxyBase) {
        streams.push({
          name: 'VIP Movies 🎬',
          title: `[VIP • NguonC] ${cleanServerName}${epLabel} (HLS Proxy)\n⚡ Phát trực tiếp trong App`,
          url: `${proxyBase}/hls/extract?b64=${encodedEmbed}`,
          behaviorHints: {
            notSupported: false,
            bingeGroup: `nguonc-${movie.slug || 'stream'}`,
          },
        });
      }

      // 2. External Web Browser Play (Embed Player Fallback) — MUST NOT have url
      streams.push({
        name: 'VIP Movies 🎬',
        title: `[Dự phòng • NguonC] ${cleanServerName}${epLabel} (Embed Player)\n🌐 Bấm để mở xem ngoài trình duyệt web`,
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
