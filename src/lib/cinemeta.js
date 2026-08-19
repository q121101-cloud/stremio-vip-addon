'use strict';

/**
 * ============================================================
 *  VIP Movies Addon — src/lib/cinemeta.js
 *  Official Cinemeta IMDb Metadata Resolver & 24h LRU Caching
 *
 *  Features:
 *  - Resolves IMDb IDs (tt... or tt...:season:ep) via Cinemeta API
 *  - Extracts canonical title, 4-digit release year, genres, aliases
 *  - 5-second axios timeout for resilience
 *  - In-memory LRUCache persistence with 24-hour TTL
 * ============================================================
 */

const axios = require('axios');
const { cinemetaCache } = require('./cache');

const CINEMETA_BASE_URL = 'https://v3-cinemeta.strem.io';
const CINEMETA_TIMEOUT  = 5000; // 5 seconds
const CACHE_TTL_SUCCESS = 86400; // 24 hours
const CACHE_TTL_FAILURE = 3600;  // 1 hour for missing meta

const cinemetaClient = axios.create({
  baseURL: CINEMETA_BASE_URL,
  timeout: CINEMETA_TIMEOUT,
  headers: {
    'User-Agent': 'Mozilla/5.0 (compatible; StremioVIPAddon/1.4; +https://github.com)',
    Accept: 'application/json',
  },
});

const inflightRequests = new Map();

/**
 * Parse a 4-digit numeric year from year string or releaseInfo
 * @param {string|number} yearVal
 * @param {string} [releaseInfoVal]
 * @returns {number|null}
 */
function parseYear(yearVal, releaseInfoVal) {
  if (typeof yearVal === 'number' && yearVal >= 1800 && yearVal <= 2100) {
    return yearVal;
  }
  const raw = [yearVal, releaseInfoVal].filter(Boolean).join(' ');
  const match = raw.match(/\b((?:18|19|20|21)\d{2})\b/);
  if (match) {
    const y = parseInt(match[1], 10);
    if (y >= 1800 && y <= 2100) return y;
  }
  return null;
}

/**
 * Extract genres array safely
 * @param {Object} meta
 * @returns {string[]}
 */
function parseGenres(meta) {
  if (!meta) return [];
  if (Array.isArray(meta.genres)) return meta.genres.map(g => String(g).trim()).filter(Boolean);
  if (Array.isArray(meta.genre)) return meta.genre.map(g => String(g).trim()).filter(Boolean);
  if (typeof meta.genre === 'string' && meta.genre.trim()) return [meta.genre.trim()];
  return [];
}

/**
 * Extract aliases array safely
 * @param {Object} meta
 * @returns {string[]}
 */
function parseAliases(meta) {
  if (!meta) return [];
  const list = [];
  if (Array.isArray(meta.aliases)) list.push(...meta.aliases);
  if (Array.isArray(meta.titles)) list.push(...meta.titles);
  if (Array.isArray(meta.alternativeTitles)) list.push(...meta.alternativeTitles);
  if (typeof meta.aliases === 'string') list.push(meta.aliases);
  if (typeof meta.originalName === 'string' && meta.originalName !== meta.name) list.push(meta.originalName);
  return Array.from(new Set(list.map(a => String(a).trim()).filter(Boolean)));
}

/**
 * @typedef {Object} CinemetaMeta
 * @property {string} imdbId - Clean IMDb ID (e.g. 'tt1375666')
 * @property {'movie'|'series'} type - Content type
 * @property {string} name - Canonical title (e.g. 'Inception')
 * @property {string} originalName - Original title
 * @property {number|null} year - 4-digit release start year (e.g. 2010)
 * @property {string|null} releaseInfo - Full release string (e.g. '2008–2013')
 * @property {string[]} genres - Array of genre strings
 * @property {string[]} aliases - Array of alternative names
 * @property {string|null} poster - Poster image URL
 * @property {string|null} background - Background banner URL
 * @property {string|null} description - Synopsis
 */

const KNOWN_TITLE_LOCALIZATIONS = {
  tt7458054: {
    title: 'Khi Nàng Say Giấc',
    year: 2017,
    aliases: ['While You Were Sleeping', '당신이 잠든 사이에', 'Dangsin-i Jamdeun Saie', 'Dangsin i Jamdeun Saie'],
  },
  tt34809853: {
    title: 'Dạy Cho Em Một Bài Học',
    year: 2025,
    aliases: ['Teach You a Lesson', 'Dạy Em Một Bài Học', 'Day Cho Em Mot Bai Hoc'],
  },
  tt26450613: {
    title: 'Cửa Hàng Sát Thủ',
    year: 2024,
    aliases: ['A Shop for Killers', '킬러들의 쇼핑몰', 'Killereuideului Syopingmol', 'Shop for Killers'],
  },
  tt10919420: {
    title: 'Trò Chơi Con Mực',
    year: 2021,
    aliases: ['Squid Game', '오징어 게임', 'Ojing-eo Geim', 'Tro Choi Con Muc'],
  },
  tt1375666: {
    title: 'Inception',
    year: 2010,
    aliases: ['Kẻ Đánh Cắp Giấc Mơ', 'Ke Danh Cap Giac Mo'],
  },
  tt0373889: {
    title: 'Harry Potter and the Order of the Phoenix',
    year: 2007,
    aliases: ['Harry Potter và Hội Phượng Hoàng', 'Harry Potter 5'],
  },
};

/**
 * Resolve IMDb ID to canonical metadata via Cinemeta API with 24h LRUCache
 * @param {'movie'|'series'} type
 * @param {string} rawId - e.g. 'tt1375666' or 'tt0903747:1:1'
 * @returns {Promise<CinemetaMeta|null>}
 */
async function resolveCinemeta(type, rawId) {
  if (!rawId) return null;

  // Clean IMDb ID (strip season/episode)
  const imdbId = String(rawId).split(':')[0].trim().toLowerCase();
  if (!/^tt\d+$/i.test(imdbId)) {
    return null;
  }

  const cleanType = (type === 'series' || type === 'tv') ? 'series' : 'movie';
  const cacheKey = `cinemeta:${cleanType}:${imdbId}`;

  // Check LRU Cache first
  const cached = cinemetaCache.get(cacheKey);
  if (cached !== undefined) {
    return cached;
  }

  // Single-flight deduplication: return existing in-flight promise if available
  if (inflightRequests.has(cacheKey)) {
    return inflightRequests.get(cacheKey);
  }

  const promise = (async () => {
    try {
      let meta = null;
      try {
        const res = await cinemetaClient.get(`/meta/${cleanType}/${imdbId}.json`);
        meta = res.data?.meta;
      } catch {}

      const known = KNOWN_TITLE_LOCALIZATIONS[imdbId];

      if (!meta && !known) {
        cinemetaCache.set(cacheKey, null, CACHE_TTL_FAILURE);
        return null;
      }

      const parsedYear = known?.year || parseYear(meta?.year, meta?.releaseInfo);
      const releaseInfo = meta?.releaseInfo ? String(meta.releaseInfo) : (parsedYear ? String(parsedYear) : null);
      const genres = parseGenres(meta);
      const rawAliases = parseAliases(meta);
      const combinedAliases = Array.from(new Set([...(known?.aliases || []), ...rawAliases]));

      const result = {
        imdbId,
        type: cleanType,
        name: known?.title || String(meta?.name || '').trim(),
        originalName: String(meta?.originalName || meta?.name || known?.title || '').trim(),
        year: parsedYear,
        releaseInfo,
        genres,
        aliases: combinedAliases,
        poster: meta?.poster || null,
        background: meta?.background || null,
        description: meta?.description || null,
      };

      // Cache resolved metadata for 24h
      cinemetaCache.set(cacheKey, result, CACHE_TTL_SUCCESS);
      return result;
    } catch (err) {
      console.warn(`[Cinemeta] Failed to resolve ${imdbId} (${cleanType}): ${err.message}`);
      if (err.response && err.response.status === 404) {
        cinemetaCache.set(cacheKey, null, CACHE_TTL_FAILURE);
      }
      return null;
    } finally {
      inflightRequests.delete(cacheKey);
    }
  })();

  inflightRequests.set(cacheKey, promise);
  return promise;
}

/**
 * Get cached metadata synchronously without network call
 * @param {'movie'|'series'} type
 * @param {string} rawId
 * @returns {CinemetaMeta|null}
 */
function getCachedCinemeta(type, rawId) {
  if (!rawId) return null;
  const imdbId = String(rawId).split(':')[0].trim().toLowerCase();
  if (!/^tt\d+$/i.test(imdbId)) return null;

  const cleanType = (type === 'series' || type === 'tv') ? 'series' : 'movie';
  const cacheKey = `cinemeta:${cleanType}:${imdbId}`;
  return cinemetaCache.get(cacheKey) || null;
}

module.exports = {
  resolveCinemeta,
  getCachedCinemeta,
  cinemetaCache,
};
