'use strict';

/**
 * ============================================================
 *  VIP Movies Addon — src/lib/utils.js
 *  Shared Utility Functions for Providers:
 *  - Safe Parameter Normalization & Crash Prevention
 *  - Robust Fuzzy Title & Year Matching
 *  - Series Season & Episode Validation
 * ============================================================
 */

/**
 * Safely convert any value to string without throwing on Symbols/Objects
 * @param {any} val
 * @param {string} [defaultVal='']
 * @returns {string}
 */
function safeString(val, defaultVal = '') {
  if (val === null || val === undefined || typeof val === 'symbol') return defaultVal;
  if (typeof val === 'object') return defaultVal;
  try {
    return String(val);
  } catch {
    return defaultVal;
  }
}

/**
 * Safe Catalog Type normalizer
 * @param {any} type
 * @param {string} [defaultType='movie']
 * @returns {string}
 */
function safeType(type, defaultType = 'movie') {
  if (type === null || type === undefined || typeof type === 'symbol') return defaultType;
  if (typeof type === 'object') return defaultType;
  const s = String(type).trim().toLowerCase();
  return s || defaultType;
}

/**
 * Normalize text by removing diacritics, punctuation, extra spaces
 * @param {string|any} str
 * @returns {string}
 */
function normalizeText(str) {
  if (str === null || str === undefined || typeof str === 'boolean' || typeof str === 'symbol') return '';
  if (typeof str === 'object') return '';
  return String(str)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[đĐ]/g, 'd')
    .replace(/[^\w\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Escape RegExp special characters safely
 * @param {string} str
 * @returns {string}
 */
function escapeRegExp(str) {
  if (!str || typeof str === 'symbol' || typeof str === 'object') return '';
  return String(str).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Safe Extra parameter object handler
 * @param {any} extra
 * @returns {Object}
 */
function safeExtra(extra) {
  if (extra && typeof extra === 'object' && !Array.isArray(extra)) {
    return extra;
  }
  return {};
}

/**
 * Safe Slug normalizer
 * @param {any} slug
 * @param {string} [prefix]
 * @returns {string}
 */
function safeSlug(slug, prefix = '') {
  if (slug === null || slug === undefined || typeof slug === 'boolean' || typeof slug === 'symbol') return '';
  if (typeof slug === 'object') return '';
  if (typeof slug === 'number' && isNaN(slug)) return '';
  const str = (typeof slug === 'string' ? slug : String(slug)).trim();
  if (!str) return '';
  if (prefix) {
    const re = new RegExp(`^${escapeRegExp(prefix)}[_:]`, 'i');
    return str.replace(re, '').trim();
  }
  return str;
}

/**
 * Safe Keyword handler
 * @param {any} keyword
 * @returns {string}
 */
function safeKeyword(keyword) {
  if (keyword === null || keyword === undefined || typeof keyword === 'boolean' || typeof keyword === 'symbol') return '';
  if (typeof keyword === 'object') return '';
  if (typeof keyword === 'number' && isNaN(keyword)) return '';
  const str = (typeof keyword === 'string' ? keyword : String(keyword)).trim();
  return str;
}

/**
 * Safe Page number handler
 * @param {any} page
 * @returns {number}
 */
function safePage(page) {
  if (page === null || page === undefined || typeof page === 'symbol') return 1;
  if (typeof page === 'object') return 1;
  const p = parseInt(page, 10);
  return (!isNaN(p) && p >= 1) ? p : 1;
}

/**
 * Extract season number from title / slug / server name
 * @param {string} str
 * @returns {number|null}
 */
function extractSeasonNumber(str) {
  if (!str || typeof str === 'symbol' || typeof str === 'object') return null;
  const s = String(str).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  
  const m = s.match(/(?:phan|season|part|ss|s)\s*(\d+)/i) ||
            s.match(/phan-(\d+)/i) ||
            s.match(/season-(\d+)/i) ||
            s.match(/s(\d+)\s*e\d+/i) ||
            s.match(/ss(\d+)/i);
  if (m && m[1]) {
    const num = parseInt(m[1], 10);
    if (!isNaN(num) && num > 0 && num <= 1000) return num;
  }
  return null;
}

/**
 * Check if the requested season exists in the movie/series data
 * @param {Object} movie
 * @param {Array} episodes
 * @param {number|string|null} requestedSeason
 * @param {string} [type]
 * @returns {boolean}
 */
function isSeasonMatch(movie, episodes, requestedSeason, type = 'series') {
  if (requestedSeason == null) return true;
  
  const sNum = parseInt(requestedSeason, 10);
  if (isNaN(sNum) || sNum <= 0) return false;
  if (sNum > 1000) return false; // Out of bounds seasons like 99999

  // Detect season number from movie entry
  const movieName = movie?.name || movie?.title || '';
  const originName = movie?.origin_name || movie?.original_name || '';
  const slug = movie?.slug || '';
  
  const explicitSeason = extractSeasonNumber(movieName) ||
                        extractSeasonNumber(originName) ||
                        extractSeasonNumber(slug) ||
                        (movie?.season ? parseInt(movie.season, 10) : null);

  if (explicitSeason != null) {
    if (explicitSeason === sNum) return true;
  }

  // Check if any server or episode explicitly matches the requested season
  if (Array.isArray(episodes)) {
    for (const server of episodes) {
      if (!server) continue;
      const sName = server.server_name || '';
      const sSeason = extractSeasonNumber(sName);
      if (sSeason === sNum) return true;

      const items = server.server_data || server.items || [];
      if (Array.isArray(items)) {
        for (const ep of items) {
          if (!ep) continue;
          const epName = ep.name || ep.slug || '';
          const epSeason = extractSeasonNumber(epName);
          if (epSeason === sNum) return true;
        }
      }
    }
  }

  // If no explicit season is found anywhere and requested season is 1, default matches season 1
  if (explicitSeason == null && sNum === 1) {
    return true;
  }

  return false;
}

/**
 * Calculate similarity and year score matching
 * @param {Object} item - Candidate item from search
 * @param {string} title - Target query title
 * @param {number|string|null} year - Target release year
 * @param {number|string|null} [season] - Target series season
 * @returns {number} - Match score between 0.0 and 1.5
 */
function scoreMatch(item, title, year = null, season = null) {
  if (!item || !title) return 0;
  const target = normalizeText(title);
  if (!target || target.length < 2) return 0;

  const nameNorm = normalizeText(item.name || item.title);
  const originNorm = normalizeText(item.origin_name || item.original_name);
  const slugNorm = normalizeText(String(item.slug || '').replace(/[-_]/g, ' '));

  if (nameNorm.length < 2 && originNorm.length < 2 && slugNorm.length < 2) return 0;

  // Exact match
  if (nameNorm === target || originNorm === target || slugNorm === target) {
    let totalScore = 1.0;
    if (year && (item.year || item.releaseInfo)) {
      const itemYear = parseInt(item.year || item.releaseInfo, 10);
      const targetYear = parseInt(year, 10);
      if (!isNaN(targetYear) && !isNaN(itemYear)) {
        if (itemYear === targetYear) totalScore += 0.25;
        else if (Math.abs(itemYear - targetYear) <= 1) totalScore += 0.1;
        else totalScore -= 0.2;
      }
    }
    return Math.max(0, totalScore);
  }

  const targetWords = target.split(' ').filter((w) => w.length >= 2);
  // If target has no words with length >= 2, only exact match is allowed
  if (targetWords.length === 0) {
    return 0;
  }

  let textScore = 0;

  // Substring match only if target has length >= 4 or is a distinct word phrase
  if (
    (target.length >= 4 && (nameNorm.includes(target) || originNorm.includes(target) || slugNorm.includes(target))) ||
    (nameNorm.length >= 4 && target.includes(nameNorm)) ||
    (originNorm.length >= 4 && target.includes(originNorm))
  ) {
    textScore = 0.8;
  } else {
    // Word overlap calculation
    const candidateWords = new Set(
      [...nameNorm.split(' '), ...originNorm.split(' '), ...slugNorm.split(' ')].filter((w) => w.length >= 2)
    );

    if (targetWords.length > 0 && candidateWords.size > 0) {
      const common = targetWords.filter((w) => candidateWords.has(w)).length;
      const ratio = common / targetWords.length;
      if (ratio >= 0.5) {
        textScore = ratio * 0.7;
      }
    }
  }

  if (textScore <= 0) return 0;

  let totalScore = textScore;

  // Year matching bonus / penalty
  if (year && (item.year || item.releaseInfo || item.category)) {
    let itemYear = null;
    if (typeof item.year === 'number') {
      itemYear = item.year;
    } else if (typeof item.year === 'string') {
      const yMatch = item.year.match(/\b(19\d\d|20\d\d)\b/);
      if (yMatch) itemYear = parseInt(yMatch[1], 10);
    }

    const targetYear = parseInt(year, 10);
    if (!isNaN(targetYear) && itemYear && !isNaN(itemYear)) {
      if (itemYear === targetYear) {
        totalScore += 0.25;
      } else if (Math.abs(itemYear - targetYear) <= 1) {
        totalScore += 0.1;
      } else {
        totalScore -= 0.2;
      }
    }
  }

  // Season matching bonus / penalty
  if (season != null) {
    const sNum = parseInt(season, 10);
    if (!isNaN(sNum) && sNum > 0) {
      const itemSeason = extractSeasonNumber(nameNorm) ||
                          extractSeasonNumber(originNorm) ||
                          extractSeasonNumber(slugNorm) ||
                          1;
      if (itemSeason === sNum) {
        totalScore += 0.3;
      } else if (sNum > 1 && itemSeason === 1) {
        totalScore -= 0.25;
      }
    }
  }

  return Math.max(0, totalScore);
}

module.exports = {
  safeString,
  safeType,
  normalizeText,
  escapeRegExp,
  safeExtra,
  safeSlug,
  safeKeyword,
  safePage,
  extractSeasonNumber,
  isSeasonMatch,
  scoreMatch,
};
