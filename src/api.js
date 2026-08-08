'use strict';

/**
 * ============================================================
 *  NguonC Stremio Addon - src/api.js
 *  Lớp truy cập REST API của phim.nguonc.com
 *  - Tích hợp timeout, retry, và memory cache
 * ============================================================
 */

const axios = require('axios');
const NodeCache = require('node-cache');

// ─── Cấu hình ────────────────────────────────────────────────
const BASE_URL = 'https://phim.nguonc.com/api';
const REQUEST_TIMEOUT = 12_000; // 12 giây
const MAX_RETRIES = 2;

// ─── Cache Configuration ─────────────────────────────────────
// TTL tính bằng giây
const cache = new NodeCache({
  stdTTL: 300,          // 5 phút cho catalog
  checkperiod: 60,       // Dọn dẹp mỗi 60 giây
  useClones: false,      // Tăng hiệu suất, tránh clone object
});

const CACHE_TTL = {
  catalog: 300,          // 5 phút
  detail: 600,           // 10 phút
  search: 120,           // 2 phút
};

// ─── Axios instance ──────────────────────────────────────────
const httpClient = axios.create({
  baseURL: BASE_URL,
  timeout: REQUEST_TIMEOUT,
  headers: {
    'User-Agent':
      'Mozilla/5.0 (compatible; StremioNguonCAddon/1.0; +https://github.com)',
    Accept: 'application/json',
    'Accept-Language': 'vi-VN,vi;q=0.9,en-US;q=0.8',
  },
});

/**
 * Gọi API với cơ chế retry đơn giản
 * @param {string} path - Đường dẫn API (không kèm base URL)
 * @param {object} params - Query params
 * @param {number} retries - Số lần retry còn lại
 */
async function fetchAPI(path, params = {}, retries = MAX_RETRIES) {
  try {
    const response = await httpClient.get(path, { params });
    return response.data;
  } catch (err) {
    if (retries > 0 && isRetriableError(err)) {
      console.warn(
        `[NguonC API] Lỗi ${err.message} → thử lại (còn ${retries} lần): ${path}`
      );
      await sleep(1000);
      return fetchAPI(path, params, retries - 1);
    }
    throw err;
  }
}

/** Kiểm tra lỗi có thể retry không */
function isRetriableError(err) {
  if (!err.response) return true; // Network error, timeout
  const status = err.response.status;
  return status === 429 || status >= 500;
}

/** Helper: ngủ ms milli-giây */
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ─── Các hàm API chính ───────────────────────────────────────

/**
 * Lấy danh sách phim mới cập nhật
 * @param {number} page
 */
async function getLatestFilms(page = 1) {
  const cacheKey = `latest:${page}`;
  const cached = cache.get(cacheKey);
  if (cached) return cached;

  const data = await fetchAPI('/films/phim-moi-cap-nhat', { page });
  cache.set(cacheKey, data, CACHE_TTL.catalog);
  return data;
}

/**
 * Lấy danh sách phim theo thể loại
 * @param {string} genreSlug - Slug thể loại (vd: 'hanh-dong')
 * @param {number} page
 */
async function getFilmsByGenre(genreSlug, page = 1) {
  const cacheKey = `genre:${genreSlug}:${page}`;
  const cached = cache.get(cacheKey);
  if (cached) return cached;

  const data = await fetchAPI(`/films/the-loai/${genreSlug}`, { page });
  cache.set(cacheKey, data, CACHE_TTL.catalog);
  return data;
}

/**
 * Lấy danh sách phim theo quốc gia
 * @param {string} countrySlug - Slug quốc gia (vd: 'han-quoc')
 * @param {number} page
 */
async function getFilmsByCountry(countrySlug, page = 1) {
  const cacheKey = `country:${countrySlug}:${page}`;
  const cached = cache.get(cacheKey);
  if (cached) return cached;

  const data = await fetchAPI(`/films/quoc-gia/${countrySlug}`, { page });
  cache.set(cacheKey, data, CACHE_TTL.catalog);
  return data;
}

/**
 * Tìm kiếm phim theo từ khóa
 * @param {string} keyword
 * @param {number} page
 */
async function searchFilms(keyword, page = 1) {
  const cacheKey = `search:${keyword.toLowerCase()}:${page}`;
  const cached = cache.get(cacheKey);
  if (cached) return cached;

  const data = await fetchAPI('/films/search', { keyword, page });
  cache.set(cacheKey, data, CACHE_TTL.search);
  return data;
}

/**
 * Lấy chi tiết phim (bao gồm danh sách tập)
 * @param {string} slug - Slug phim
 */
async function getFilmDetail(slug) {
  const cacheKey = `detail:${slug}`;
  const cached = cache.get(cacheKey);
  if (cached) return cached;

  const data = await fetchAPI(`/film/${slug}`);
  cache.set(cacheKey, data, CACHE_TTL.detail);
  return data;
}

/**
 * Lấy thống kê cache (debug)
 */
function getCacheStats() {
  return cache.getStats();
}

/**
 * Xóa toàn bộ cache (admin use)
 */
function clearCache() {
  cache.flushAll();
}

module.exports = {
  getLatestFilms,
  getFilmsByGenre,
  getFilmsByCountry,
  searchFilms,
  getFilmDetail,
  getCacheStats,
  clearCache,
};
