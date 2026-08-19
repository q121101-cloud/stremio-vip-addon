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
  if (!extra) return {};
  if (typeof extra === 'object' && !Array.isArray(extra)) {
    return extra;
  }
  if (typeof extra === 'string') {
    const result = {};
    const clean = extra.trim().replace(/^\?/, '').replace(/\.json$/i, '');
    if (!clean) return {};
    try {
      const sp = new URLSearchParams(clean);
      for (const [k, v] of sp.entries()) {
        result[k] = v;
      }
      return result;
    } catch {
      clean.split('&').forEach((part) => {
        const [k, v] = part.split('=');
        if (k) result[decodeURIComponent(k)] = v ? decodeURIComponent(v) : '';
      });
      return result;
    }
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
function scoreMatch(arg1, arg2, arg3 = null, arg4 = null) {
  if (!arg1 || !arg2) return 0;

  let item = null;
  let title = '';
  let year = arg3;
  let season = arg4;

  if (typeof arg1 === 'object' && arg1 !== null) {
    item = arg1;
    title = typeof arg2 === 'string' ? arg2 : (arg2?.name || arg2?.title || '');
  } else if (typeof arg2 === 'object' && arg2 !== null) {
    item = arg2;
    title = typeof arg1 === 'string' ? arg1 : (arg1?.name || arg1?.title || '');
  } else if (typeof arg1 === 'string' && typeof arg2 === 'string') {
    title = arg1;
    item = { name: arg2 };
    if (arg4) item.year = arg4;
  } else {
    return 0;
  }

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

/**
 * Generate prioritized list of search keyword variations
 * Supports positional args: (title, originalName, aliases, season)
 * or object arg: ({ title, originalName, aliases, season })
 * @param {string|Object} [arg1]
 * @param {string} [arg2]
 * @param {string[]} [arg3]
 * @param {number|string|null} [arg4]
 * @returns {string[]}
 */
function generateSearchKeywords(arg1, arg2, arg3, arg4) {
  let title = '';
  let originalName = '';
  let aliases = [];
  let season = null;

  if (typeof arg1 === 'object' && arg1 !== null && !Array.isArray(arg1)) {
    title = typeof arg1.title === 'string' ? arg1.title : (typeof arg1.name === 'string' ? arg1.name : '');
    originalName = typeof arg1.originalName === 'string' ? arg1.originalName : (typeof arg1.origin_name === 'string' ? arg1.origin_name : (typeof arg1.original_name === 'string' ? arg1.original_name : ''));
    aliases = Array.isArray(arg1.aliases) ? arg1.aliases : (typeof arg1.aliases === 'string' ? [arg1.aliases] : []);
    season = arg1.season != null ? arg1.season : null;
  } else if (typeof arg1 === 'string') {
    title = arg1;
    originalName = typeof arg2 === 'string' ? arg2 : '';
    aliases = Array.isArray(arg3) ? arg3 : (typeof arg3 === 'string' ? [arg3] : []);
    season = arg4 != null ? arg4 : null;
  }

  const rawCandidates = [];
  if (title && typeof title === 'string') rawCandidates.push(title);
  if (originalName && typeof originalName === 'string') rawCandidates.push(originalName);
  if (Array.isArray(aliases)) {
    for (const a of aliases) {
      if (a && typeof a === 'string') rawCandidates.push(a);
    }
  }

  const candidates = new Set();

  for (const raw of rawCandidates) {
    if (!raw || typeof raw !== 'string') continue;
    const trimmed = raw.trim();
    if (!trimmed || trimmed.length < 2) continue;

    // 1. Direct title / alias / original name
    candidates.add(trimmed);

    // 2. Title without trailing 4-digit year (e.g. "Inception (2010)" -> "Inception")
    const withoutYear = trimmed
      .replace(/\s*[\(\[]\s*(?:19\d\d|20\d\d)\s*[\)\]]\s*$/g, '')
      .replace(/\s*[\(\[]\s*(?:19\d\d|20\d\d)\s*-\s*(?:19\d\d|20\d\d)?\s*[\)\]]\s*$/g, '')
      .replace(/\s+\b(19\d\d|20\d\d)\b\s*$/g, '')
      .trim();
    if (withoutYear && withoutYear.length >= 2) {
      candidates.add(withoutYear);
    }

    // 3. Strip Season / Part / Phần / Chapter / Episode indicators
    // e.g. "Lanterns Season 1" -> "Lanterns", "A Shop for Killers (Phần 1)" -> "A Shop for Killers"
    const baseForSeason = withoutYear || trimmed;
    const withoutSeason = baseForSeason
      .replace(/\s*[\(\[]\s*(?:season|phần|phan|part|ss|p|chương|chuong)\s*\d+\s*[\)\]]/gi, '')
      .replace(/\s*[\(\[]\s*(?:season|phần|phan|part|ss|p|chương|chuong)\s*(?:I|II|III|IV|V|VI|VII|VIII|IX|X)\s*[\)\]]/gi, '')
      .replace(/\b(?:season|phần|phan|part|ss)\s*\d+\b/gi, '')
      .replace(/\b(?:season|phần|phan|part|ss)\s*(?:I|II|III|IV|V|VI|VII|VIII|IX|X)\b/gi, '')
      .replace(/\bS\d{1,2}(?:E\d{1,2})?\b/gi, '')
      .replace(/\bP\d{1,2}\b/gi, '')
      .replace(/\b(?:season|phần|phan|part|ss)\b/gi, '')
      .replace(/\s+/g, ' ')
      .trim();
    if (withoutSeason && withoutSeason.length >= 2) {
      candidates.add(withoutSeason);
    }

    // 4. Clean special characters & punctuation (e.g. "9-1-1" -> "9 1 1", "Spider-Man: No Way Home" -> "Spider-Man No Way Home")
    const cleanPunctuation = trimmed
      .replace(/[:_–—/\\|.,]/g, ' ')
      .replace(/[-]/g, ' ')
      .replace(/[()[\]{}"'“”‘’`]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    if (cleanPunctuation && cleanPunctuation.length >= 2) {
      candidates.add(cleanPunctuation);
    }

    // 5. Combination: withoutSeason + clean punctuation
    if (withoutSeason && withoutSeason !== trimmed) {
      const cleanSeasonPunct = withoutSeason
        .replace(/[:_–—/\\|.,]/g, ' ')
        .replace(/[-]/g, ' ')
        .replace(/[()[\]{}"'“”‘’`]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
      if (cleanSeasonPunct && cleanSeasonPunct.length >= 2) {
        candidates.add(cleanSeasonPunct);
      }
    }
  }

  return Array.from(candidates).filter((s) => s && s.length >= 2);
}

/**
 * Universal episode matcher across all providers
 * Supports:
 * - Direct numeric equality (1, 01, 001)
 * - Vietnamese prefixes ("Tập 1", "Tập 01", "Tap 1", "Tap 01", "Tập01")
 * - English prefixes ("Episode 1", "Episode 01", "Ep 1", "Ep. 1", "Ep.01", "E01")
 * - Slug patterns ("tap-1", "tap-01", "episode-1", "ep-1", suffix "-1", "-01")
 * - Full / Trọn bộ single movie representations
 * - Regex whole-token extraction
 * - Guards against false matches (e.g., Ep 1 matching Ep 10, 11, 12)
 *
 * @param {Object} ep - Server episode item object ({ name, slug, filename, ... })
 * @param {string|number|null} targetEpStr - Target episode string or number (e.g. "1", 1)
 * @param {number|string|null} [targetEpNum] - Target episode number (e.g. 1)
 * @returns {boolean}
 */
function matchEpisodeItem(ep, targetEpStr, targetEpNum) {
  if (!ep || typeof ep !== 'object') return false;

  let targetStr = '';
  let targetNum = null;

  if (typeof targetEpStr === 'number') {
    targetNum = targetEpStr;
    targetStr = String(targetEpStr);
  } else if (typeof targetEpStr === 'string') {
    targetStr = targetEpStr.trim();
    const parsed = parseInt(targetStr, 10);
    if (!isNaN(parsed)) {
      targetNum = parsed;
    }
  }

  if (targetEpNum !== undefined && targetEpNum !== null) {
    const p = typeof targetEpNum === 'number' ? targetEpNum : parseInt(String(targetEpNum), 10);
    if (!isNaN(p)) {
      targetNum = p;
      if (!targetStr) targetStr = String(p);
    }
  }

  // If negative or out of bounds (<= 0)
  if (targetStr.startsWith('-') || (targetNum !== null && targetNum <= 0)) {
    return false;
  }

  const nameStr = String(ep.name || '').trim();
  const slugStr = String(ep.slug || '').trim();
  const filenameStr = String(ep.filename || '').trim();

  const nameUpper = nameStr.toUpperCase();
  const slugLower = slugStr.toLowerCase();

  // Full / Single movie check
  if (nameUpper === 'FULL' || slugLower === 'full' || nameUpper === 'TRỌN BỘ' || slugLower === 'tron-bo') {
    if (targetNum === 1 || targetStr === '1' || targetStr === '01' || targetStr === '001' || targetStr.toLowerCase() === 'full') {
      return true;
    }
  }

  if (!targetStr && targetNum === null) return false;

  const str = targetStr;
  const pad2 = targetNum !== null && targetNum > 0 ? String(targetNum).padStart(2, '0') : str;
  const pad3 = targetNum !== null && targetNum > 0 ? String(targetNum).padStart(3, '0') : str;

  // 1. Direct Equality Check on name or slug
  if (nameStr === str || nameStr === pad2 || nameStr === pad3) return true;
  if (slugStr === str || slugStr === pad2 || slugStr === pad3) return true;

  // 2. Vietnamese Prefix "Tập X" / "Tap X"
  if (nameStr === `Tập ${str}` || nameStr === `Tập ${pad2}` || nameStr === `Tập ${pad3}`) return true;
  if (nameStr === `Tập${str}` || nameStr === `Tập${pad2}` || nameStr === `Tập${pad3}`) return true;
  if (nameStr === `Tap ${str}` || nameStr === `Tap ${pad2}` || nameStr === `Tap ${pad3}`) return true;
  if (nameStr === `Tap${str}` || nameStr === `Tap${pad2}` || nameStr === `Tap${pad3}`) return true;

  // 3. English Prefix "Episode X" / "Ep X"
  const nameLower = nameStr.toLowerCase();
  if (nameLower === `episode ${str}` || nameLower === `episode ${pad2}` || nameLower === `episode ${pad3}`) return true;
  if (nameLower === `episode${str}` || nameLower === `episode${pad2}` || nameLower === `episode${pad3}`) return true;
  if (nameLower === `ep ${str}` || nameLower === `ep ${pad2}` || nameLower === `ep ${pad3}`) return true;
  if (nameLower === `ep.${str}` || nameLower === `ep.${pad2}` || nameLower === `ep.${pad3}`) return true;
  if (nameLower === `ep${str}` || nameLower === `ep${pad2}` || nameLower === `ep${pad3}`) return true;

  // 4. Slug Patterns ("tap-1", "tap-01", "episode-1", "ep-1", suffix "-1", "-01", "-tap-1")
  if (slugLower === `tap-${str}` || slugLower === `tap-${pad2}` || slugLower === `tap-${pad3}`) return true;
  if (slugLower === `tap${str}` || slugLower === `tap${pad2}` || slugLower === `tap${pad3}`) return true;
  if (slugLower === `episode-${str}` || slugLower === `episode-${pad2}` || slugLower === `episode-${pad3}`) return true;
  if (slugLower === `ep-${str}` || slugLower === `ep-${pad2}` || slugLower === `ep-${pad3}`) return true;
  if (slugLower === `ep${str}` || slugLower === `ep${pad2}` || slugLower === `ep${pad3}`) return true;

  // Suffix with boundary
  if (slugLower.endsWith(`-${str}`) || slugLower.endsWith(`-${pad2}`) || slugLower.endsWith(`-${pad3}`)) return true;
  if (slugLower.endsWith(`_${str}`) || slugLower.endsWith(`_${pad2}`) || slugLower.endsWith(`_${pad3}`)) return true;
  if (slugLower.endsWith(`-tap-${str}`) || slugLower.endsWith(`-tap-${pad2}`) || slugLower.endsWith(`-tap-${pad3}`)) return true;

  // 5. Numeric Regex Extraction with strict token boundaries
  if (targetNum !== null && targetNum > 0) {
    const nameMatch = nameStr.match(/(?:tập|tap|episode|ep|e|t)\.?\s*(\d+)\b/i);
    if (nameMatch && parseInt(nameMatch[1], 10) === targetNum) return true;

    const standaloneMatch = nameStr.match(/^\s*(\d+)\s*$/);
    if (standaloneMatch && parseInt(standaloneMatch[1], 10) === targetNum) return true;

    const slugMatch = slugLower.match(/(?:tap|episode|ep|e)[-_]?(\d+)\b/i) || slugLower.match(/[-_](\d+)$/);
    if (slugMatch && parseInt(slugMatch[1], 10) === targetNum) return true;

    if (filenameStr) {
      const fileMatch = filenameStr.match(/(?:tập|tap|episode|ep|e)\.?\s*(\d+)\b/i);
      if (fileMatch && parseInt(fileMatch[1], 10) === targetNum) return true;
    }
  }

  // 6. Word boundary fallback avoiding false positive on numbers like 10, 11, 12 matching 1
  if (nameStr && str && !str.startsWith('-')) {
    try {
      const re = new RegExp(`(?<!\\d)${escapeRegExp(str)}(?!\\d)`, 'i');
      const rePad2 = new RegExp(`(?<!\\d)${escapeRegExp(pad2)}(?!\\d)`, 'i');
      if (re.test(nameStr) || rePad2.test(nameStr)) {
        const m = nameStr.match(/(?:tập|tap|ep|episode)\s*(\d+)/i);
        if (m) {
          if (parseInt(m[1], 10) === targetNum) return true;
          return false;
        }
        return true;
      }
    } catch {}
  }

  return false;
}

/**
 * Check if query is Donghua / Anime related
 * @param {string} title
 * @param {string[]} [genres]
 * @param {string} [type]
 * @returns {boolean}
 */
function isDonghuaQuery(title, genres = [], type = 'series') {
  const ANIMATION_GENRES = new Set([
    'animation', 'hoạt hình', 'hoat-hinh', 'hoat hinh',
    'anime', 'donghua', '3d', 'hoạt hình 3d', 'hoat hinh 3d'
  ]);

  const normGenres = (Array.isArray(genres) ? genres : []).map((g) => String(g).toLowerCase().trim());
  const hasAnimation = normGenres.some((g) => ANIMATION_GENRES.has(g));
  if (hasAnimation) return true;

  const text = String(title || '').toLowerCase();
  if (/donghua|hoạt hình|hoat hinh|anime|3d/i.test(text)) return true;

  return false;
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
  generateSearchKeywords,
  matchEpisodeItem,
  isDonghuaQuery,
};
