'use strict';

/**
 * ============================================================
 *  NguonC Stremio Addon - src/api.js
 *  Lớp truy cập REST API của nguồn phim
 *  - Tích hợp timeout, retry, và memory cache
 *  - Hỗ trợ resolve IMDb ID → tên phim qua Cinemeta
 * ============================================================
 */

const axios = require('axios');
const NodeCache = require('node-cache');

// ─── Cấu hình ────────────────────────────────────────────────
const BASE_URL    = 'https://phim.nguonc.com/api';
const REQUEST_TIMEOUT      = 12_000; // 12 giây
const CINEMETA_TIMEOUT     =  8_000; // 8 giây — Cinemeta nhanh hơn
const MAX_RETRIES          = 2;

// ─── Cache Configuration ─────────────────────────────────────
const cache = new NodeCache({
  stdTTL: 300,       // 5 phút default
  checkperiod: 60,   // Dọn dẹp mỗi 60 giây
  useClones: false,  // Tăng hiệu suất
});

const CACHE_TTL = {
  catalog:  300,   // 5 phút
  detail:   600,   // 10 phút
  search:   120,   // 2 phút
  cinemeta: 3600,  // 1 giờ — meta IMDb thay đổi ít
  imdbMap:  1800,  // 30 phút — kết quả map IMDb → slug
};

// ─── Axios: NguonC client ─────────────────────────────────────
const httpClient = axios.create({
  baseURL: BASE_URL,
  timeout: REQUEST_TIMEOUT,
  headers: {
    'User-Agent': 'Mozilla/5.0 (compatible; StremioVIPAddon/1.1; +https://github.com)',
    Accept: 'application/json',
    'Accept-Language': 'vi-VN,vi;q=0.9,en-US;q=0.8',
  },
});

// ─── Axios: Cinemeta client (external) ───────────────────────
const cinemetaClient = axios.create({
  baseURL: 'https://v3-cinemeta.strem.io',
  timeout: CINEMETA_TIMEOUT,
  headers: {
    'User-Agent': 'Mozilla/5.0 (compatible; StremioVIPAddon/1.1)',
    Accept: 'application/json',
  },
});

// ─── Helpers ─────────────────────────────────────────────────

/** Gọi API NguonC với retry */
async function fetchAPI(path, params = {}, retries = MAX_RETRIES) {
  try {
    const response = await httpClient.get(path, { params });
    return response.data;
  } catch (err) {
    if (retries > 0 && isRetriableError(err)) {
      console.warn(`[VIP API] Lỗi → thử lại (còn ${retries}): ${path}`);
      await sleep(1000);
      return fetchAPI(path, params, retries - 1);
    }
    throw err;
  }
}

function isRetriableError(err) {
  if (!err.response) return true;
  return err.response.status === 429 || err.response.status >= 500;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ─── NguonC API Functions ─────────────────────────────────────

async function getLatestFilms(page = 1) {
  const key = `latest:${page}`;
  const cached = cache.get(key);
  if (cached) return cached;
  const data = await fetchAPI('/films/phim-moi-cap-nhat', { page });
  cache.set(key, data, CACHE_TTL.catalog);
  return data;
}

async function getFilmsByGenre(genreSlug, page = 1) {
  const key = `genre:${genreSlug}:${page}`;
  const cached = cache.get(key);
  if (cached) return cached;
  const data = await fetchAPI(`/films/the-loai/${genreSlug}`, { page });
  cache.set(key, data, CACHE_TTL.catalog);
  return data;
}

async function getFilmsByCountry(countrySlug, page = 1) {
  const key = `country:${countrySlug}:${page}`;
  const cached = cache.get(key);
  if (cached) return cached;
  const data = await fetchAPI(`/films/quoc-gia/${countrySlug}`, { page });
  cache.set(key, data, CACHE_TTL.catalog);
  return data;
}

async function searchFilms(keyword, page = 1) {
  const key = `search:${keyword.toLowerCase()}:${page}`;
  const cached = cache.get(key);
  if (cached) return cached;
  const data = await fetchAPI('/films/search', { keyword, page });
  cache.set(key, data, CACHE_TTL.search);
  return data;
}

async function getFilmDetail(slug) {
  const key = `detail:${slug}`;
  const cached = cache.get(key);
  if (cached) return cached;
  const data = await fetchAPI(`/film/${slug}`);
  cache.set(key, data, CACHE_TTL.detail);
  return data;
}

// ─── IMDb Resolution Functions ────────────────────────────────

/**
 * Lấy thông tin phim từ IMDb ID qua Cinemeta API
 * @param {string} type  - 'movie' | 'series'
 * @param {string} imdbId - e.g. 'tt1234567'
 * @returns {{ name, year, originalName } | null}
 */
async function resolveCinemeta(type, imdbId) {
  const key = `cinemeta:${type}:${imdbId}`;
  const cached = cache.get(key);
  if (cached !== undefined) return cached;

  try {
    const res = await cinemetaClient.get(`/meta/${type}/${imdbId}.json`);
    const meta = res.data?.meta;
    if (!meta) {
      cache.set(key, null, CACHE_TTL.cinemeta);
      return null;
    }
    const info = {
      name: meta.name || null,
      year: meta.year || null,
      originalName: meta.name || null,
    };
    cache.set(key, info, CACHE_TTL.cinemeta);
    return info;
  } catch (err) {
    console.warn(`[Cinemeta] Không lấy được meta cho ${imdbId}: ${err.message}`);
    cache.set(key, null, CACHE_TTL.cinemeta);
    return null;
  }
}

/**
 * Tính điểm similarity giữa tên phim NguonC và tên tìm kiếm.
 * Trả về số từ 0 (không khớp) đến 1 (khớp hoàn hảo).
 * @param {string} a - Chuỗi từ NguonC (có thể là tên tiếng Việt)
 * @param {string} b - Chuỗi tìm kiếm (tên IMDb tiếng Anh)
 */
function scoreSimilarity(a, b) {
  const normalize = (s) =>
    s.toLowerCase()
      .replace(/[^\w\s]/g, ' ')  // bỏ dấu câu
      .replace(/\s+/g, ' ')
      .trim();

  const na = normalize(a);
  const nb = normalize(b);

  // Khớp chính xác
  if (na === nb) return 1.0;
  // Một chuỗi chứa chuỗi kia
  if (na.includes(nb) || nb.includes(na)) return 0.8;

  // Đếm số từ chung
  const wordsA = new Set(na.split(' '));
  const wordsB = nb.split(' ');
  const common = wordsB.filter((w) => wordsA.has(w)).length;
  if (wordsB.length === 0) return 0;
  return common / wordsB.length;
}

/**
 * Tìm slug phim trên NguonC tốt nhất khớp với IMDb ID.
 * Chiến lược: tìm kiếm bằng tên tiếng Anh, chọn kết quả có score cao nhất
 * và năm phát hành gần nhất.
 *
 * @param {string} type     - 'movie' | 'series'
 * @param {string} imdbId   - e.g. 'tt1234567'
 * @returns {{ slug, name } | null}
 */
async function findFilmByImdbId(type, imdbId) {
  const key = `imdbmap:${type}:${imdbId}`;
  const cached = cache.get(key);
  if (cached !== undefined) return cached;

  // 1. Lấy tên từ Cinemeta
  const cineMeta = await resolveCinemeta(type, imdbId);
  if (!cineMeta || !cineMeta.name) {
    console.warn(`[IMDb] Không tìm được metadata cho ${imdbId}`);
    cache.set(key, null, CACHE_TTL.imdbMap);
    return null;
  }

  const { name, year } = cineMeta;
  console.log(`[IMDb] Resolve ${imdbId} → "${name}" (${year})`);

  // 2. Tìm kiếm trên NguonC
  let bestSlug = null;
  let bestScore = -1;

  // Thử tìm bằng tên gốc tiếng Anh
  const searchData = await searchFilms(name, 1).catch(() => ({ items: [] }));
  const items = searchData.items || [];

  for (const item of items) {
    // Chỉ xét đúng type (movie / series)
    const { detectType } = require('./mapper');
    if (detectType(item) !== type) continue;

    // Tính score từ cả tên VN và original_name
    const scoreA = scoreSimilarity(item.name || '', name);
    const scoreB = scoreSimilarity(item.original_name || '', name);
    let score = Math.max(scoreA, scoreB);

    // Bonus nếu năm phát hành khớp
    if (year && item.name && item.name.includes(String(year))) {
      score += 0.1;
    }

    if (score > bestScore) {
      bestScore = score;
      bestSlug = { slug: item.slug, name: item.name };
    }
  }

  // Ngưỡng tối thiểu để chấp nhận kết quả
  const MIN_MATCH_SCORE = 0.65;
  if (!bestSlug || bestScore < MIN_MATCH_SCORE) {
    console.warn(`[IMDb] Score quá thấp (${bestScore.toFixed(2)}) cho "${name}" — bỏ qua`);
    cache.set(key, null, CACHE_TTL.imdbMap);
    return null;
  }

  console.log(`[IMDb] Best match score=${bestScore.toFixed(2)} → "${bestSlug.name}" (${bestSlug.slug})`);
  cache.set(key, bestSlug, CACHE_TTL.imdbMap);
  return bestSlug;
}

// ─── Cache Utilities ─────────────────────────────────────────

function getCacheStats() {
  return cache.getStats();
}

function clearCache() {
  cache.flushAll();
}

module.exports = {
  getLatestFilms,
  getFilmsByGenre,
  getFilmsByCountry,
  searchFilms,
  getFilmDetail,
  resolveCinemeta,
  findFilmByImdbId,
  getCacheStats,
  clearCache,
};
