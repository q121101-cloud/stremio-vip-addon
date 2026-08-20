'use strict';

// 1. Known Asian Drama and Top Hollywood Localized Titles Dictionary
const KNOWN_TITLE_LOCALIZATIONS = {
  // Korean / Asian Dramas
  'tt7458054':  { vi: 'Khi Nàng Say Giấc', en: 'While You Were Sleeping', year: 2017 },
  'tt26450613': { vi: 'Cửa Hàng Sát Thủ', en: 'A Shop for Killers', year: 2024 },
  'tt1442437':  { vi: 'Hạ Cánh Nơi Anh', en: 'Crash Landing on You', year: 2019 },
  'tt10730822': { vi: 'Hạ Cánh Nơi Anh', en: 'Crash Landing on You', year: 2019 },
  'tt8075192':  { vi: 'Thế Giới Hôn Nhân', en: 'The World of the Married', year: 2020 },
  'tt11198330': { vi: 'Ngôi Trường Xác Sống', en: 'All of Us Are Dead', year: 2022 },
  'tt10986410': { vi: 'Hẹn Hò Chốn Công Sở', en: 'Business Proposal', year: 2022 },
  'tt14828136': { vi: 'Luật Sư Kỳ Lạ Woo Young Woo', en: 'Extraordinary Attorney Woo', year: 2022 },
  'tt15447432': { vi: 'Vinh Quang Trong Thù Hận', en: 'The Glory', year: 2022 },
  'tt15326988': { vi: 'Vinh Quang Trong Thù Hận', en: 'The Glory', year: 2022 },
  'tt13303666': { vi: 'Khách Sạn Vương Giả', en: 'King the Land', year: 2023 },
  'tt27074082': { vi: 'Nữ Hoàng Nước Mắt', en: 'Queen of Tears', year: 2024 },
  'tt15494274': { vi: 'Tài Xế Taxi 2', en: 'Taxi Driver 2', year: 2023 },
  'tt11449830': { vi: 'Tầng Lớp Itaewon', en: 'Itaewon Class', year: 2020 },
  'tt21209876': { vi: 'Tôi Thăng Cấp Một Mình', en: 'Solo Leveling', year: 2024 },
  'tt2560140':  { vi: 'Đại Chiến Titan', en: 'Attack on Titan', year: 2013 },

  // Global & Hollywood Blockbusters
  'tt1375666':  { vi: 'Kẻ Đánh Cắp Giấc Mơ', en: 'Inception', year: 2010 },
  'tt10872600': { vi: 'Người Nhện: Không Còn Nhà', en: 'Spider-Man: No Way Home', year: 2021 },
  'tt0944947':  { vi: 'Trò Chơi Vương Quyền', en: 'Game of Thrones', year: 2011 },
  'tt4574334':  { vi: 'Cậu Bé Mất Tích', en: 'Stranger Things', year: 2016 },
  'tt1190634':  { vi: 'The Boys', en: 'The Boys', year: 2019 },
  'tt1630029':  { vi: 'Avatar: Dòng Chảy Của Nước', en: 'Avatar: The Way of Water', year: 2022 },
  'tt0373889':  { vi: 'Harry Potter và Tên Tù Nhân Ngục Azkaban', en: 'Harry Potter and the Prisoner of Azkaban', year: 2004 }
};

// 2. Roman Numeral Translation Map
const ROMAN_MAP = {
  i: 1, ii: 2, iii: 3, iv: 4, v: 5, vi: 6, vii: 7, viii: 8, ix: 9, x: 10,
  xi: 11, xii: 12, xiii: 13, xiv: 14, xv: 15, xvi: 16, xvii: 17, xviii: 18, xix: 19, xx: 20
};

// 3. Common Vietnamese Noise Words & Stopwords (sorted descending by length in cleaner)
const VIETNAMESE_STOPWORDS = [
  'phim chieu rap', 'phim truyen hinh', 'phim rap',
  'thuyet minh', 'thuyetminh', 'long tieng', 'longtieng', 'viet sub', 'vietsub', 'subviet',
  'xem phim', 'hoat hinh', 'phu de', 'tron bo', 'tap full', 'full hd', 'ban dep', 'ban cam',
  'tv show', 'tv series', 'anime', 'phim', 'xem', 'full', 'hd', 'fhd', '4k', 'uhd', 'bluray',
  'cam', 'raw'
];

/**
 * Strips Vietnamese diacritics, tone marks, and special typographical characters.
 * Maps đ/Đ -> d/D.
 * @param {string} str
 * @returns {string}
 */
function stripDiacritics(str) {
  if (!str || typeof str !== 'string') return '';
  return str
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[đĐ]/g, (m) => (m === 'Đ' ? 'D' : 'd'))
    .replace(/[–—]/g, '-')
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'");
}

/**
 * Converts Roman numerals in titles to Arabic numbers.
 * Context-aware for 'I' to avoid replacing English pronouns like 'I Am Legend'.
 * @param {string} str
 * @returns {string}
 */
function convertRomanNumerals(str) {
  if (!str || typeof str !== 'string') return '';
  // Convert 'I' when preceded by season/part/episode keywords
  let result = str.replace(/(?<=\b(?:phần|phan|mùa|mua|season|part|tập|tap|vol|chapter|ep|ss|p)[:\s\-_]+)i\b/gi, '1');
  // Convert 'I' after title delimiters (colon, dash)
  result = result.replace(/(?<=[:\-–—]\s*)i\b/gi, '1');
  // Convert Roman numerals II through XX
  result = result.replace(/\b(x{0,2}(?:ix|iv|v?i{2,3}|vi|v|x))\b/gi, (match) => {
    const lower = match.toLowerCase();
    return ROMAN_MAP[lower] !== undefined ? String(ROMAN_MAP[lower]) : match;
  });
  return result;
}

/**
 * Normalizes title into a clean URL-friendly slug.
 * @param {string} str
 * @returns {string}
 */
function normalizeTitle(str) {
  if (!str || typeof str !== 'string') return '';
  const noDiacritics = stripDiacritics(str);
  const withArabic = convertRomanNumerals(noDiacritics);
  return withArabic
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, ' ')
    .trim()
    .replace(/\s+/g, '-');
}

/**
 * Cleans keywords for provider search API queries by stripping noise words, punctuation, and release years.
 * @param {string} rawTitle
 * @returns {string}
 */
function cleanSearchKeywords(rawTitle) {
  if (!rawTitle || typeof rawTitle !== 'string') return '';
  let cleaned = stripDiacritics(rawTitle);
  cleaned = convertRomanNumerals(cleaned);
  cleaned = cleaned.replace(/[\(\[\{]\s*(?:19|20)\d{2}\s*[\)\]\}]/g, ' ');
  cleaned = cleaned.replace(/\b(?:19|20)\d{2}\b/g, ' ');
  cleaned = cleaned.replace(/[:\-–—!?'"()[\]{}_/\\&+,.~@#$%^*;]/g, ' ').toLowerCase();

  const sortedStopwords = [...VIETNAMESE_STOPWORDS].sort((a, b) => b.length - a.length);
  for (const sw of sortedStopwords) {
    const swRegex = new RegExp(`\\b${sw}\\b`, 'gi');
    cleaned = cleaned.replace(swRegex, ' ');
  }

  return cleaned.replace(/\s+/g, ' ').trim();
}

/**
 * Generates search query candidate variants from Cinemeta metadata and static dictionary.
 * @param {Object} cinemetaMeta
 * @returns {string[]}
 */
function generateSearchVariants(cinemetaMeta) {
  if (!cinemetaMeta) return [];
  const variants = new Set();

  const imdbId = cinemetaMeta.id || cinemetaMeta.imdb_id || cinemetaMeta.imdbId;
  if (imdbId && KNOWN_TITLE_LOCALIZATIONS[imdbId]) {
    const loc = KNOWN_TITLE_LOCALIZATIONS[imdbId];
    if (loc.vi) variants.add(loc.vi);
    if (loc.en) variants.add(loc.en);
  }

  const name = cinemetaMeta.name || cinemetaMeta.title;
  if (name) {
    variants.add(name);
    const cleaned = cleanSearchKeywords(name);
    if (cleaned && cleaned !== name) variants.add(cleaned);

    const stripped = stripDiacritics(name);
    if (stripped && stripped !== name) variants.add(stripped);
  }

  if (Array.isArray(cinemetaMeta.aliases)) {
    for (const alias of cinemetaMeta.aliases) {
      if (alias) {
        variants.add(alias);
        const cleanAlias = cleanSearchKeywords(alias);
        if (cleanAlias) variants.add(cleanAlias);
      }
    }
  }

  return Array.from(variants).filter(Boolean);
}

/**
 * Levenshtein Distance calculation
 * @param {string} s1
 * @param {string} s2
 * @returns {number}
 */
function levenshteinDistance(s1, s2) {
  if (s1 === s2) return 0;
  if (!s1.length) return s2.length;
  if (!s2.length) return s1.length;

  const row = Array(s2.length + 1).fill(0).map((_, i) => i);
  for (let i = 0; i < s1.length; i++) {
    let prev = i + 1;
    for (let j = 0; j < s2.length; j++) {
      const val = s1[i] === s2[j] ? row[j] : Math.min(row[j], prev, row[j + 1]) + 1;
      row[j] = prev;
      prev = val;
    }
    row[s2.length] = prev;
  }
  return row[s2.length];
}

/**
 * Normalized Levenshtein similarity (0.0 to 1.0)
 * @param {string} s1
 * @param {string} s2
 * @returns {number}
 */
function normalizedLevenshtein(s1, s2) {
  const maxLen = Math.max(s1.length, s2.length);
  if (maxLen === 0) return 1.0;
  return 1 - levenshteinDistance(s1, s2) / maxLen;
}

/**
 * Bigram generator for Sørensen–Dice
 * @param {string} str
 * @returns {Map<string, number>}
 */
function getBigrams(str) {
  const bigrams = new Map();
  for (let i = 0; i < str.length - 1; i++) {
    const bg = str.slice(i, i + 2);
    bigrams.set(bg, (bigrams.get(bg) || 0) + 1);
  }
  return bigrams;
}

/**
 * Sørensen–Dice Coefficient (Bigram similarity, 0.0 to 1.0)
 * @param {string} s1
 * @param {string} s2
 * @returns {number}
 */
function diceCoefficient(s1, s2) {
  if (s1 === s2) return 1.0;
  if (!s1 || !s2 || s1.length < 2 || s2.length < 2) return 0.0;

  const bg1 = getBigrams(s1);
  const bg2 = getBigrams(s2);

  let intersection = 0;
  let total1 = 0;
  let total2 = 0;

  for (const count of bg1.values()) total1 += count;
  for (const count of bg2.values()) total2 += count;

  for (const [bg, count1] of bg1.entries()) {
    if (bg2.has(bg)) {
      intersection += Math.min(count1, bg2.get(bg));
    }
  }

  return (2 * intersection) / (total1 + total2);
}

/**
 * Word tokenizer
 * @param {string} str
 * @returns {string[]}
 */
function tokenizeWords(str) {
  return stripDiacritics(str)
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(Boolean);
}

/**
 * Token Set Ratio (Fuzzy subset matching, 0.0 to 1.0)
 * @param {string} s1
 * @param {string} s2
 * @returns {number}
 */
function tokenSetRatio(s1, s2) {
  const t1 = tokenizeWords(s1);
  const t2 = tokenizeWords(s2);
  if (!t1.length || !t2.length) return 0.0;

  const set1 = new Set(t1);
  const set2 = new Set(t2);

  const intersection = Array.from(set1).filter((x) => set2.has(x)).sort();
  const diff1 = Array.from(set1).filter((x) => !set2.has(x)).sort();
  const diff2 = Array.from(set2).filter((x) => !set1.has(x)).sort();

  const strInter = intersection.join(' ');
  const str1 = [...intersection, ...diff1].join(' ');
  const str2 = [...intersection, ...diff2].join(' ');

  if (!intersection.length) {
    return diceCoefficient(str1, str2);
  }

  // If one set is a subset of the other, intersection equals that set
  if (set1.size === intersection.length || set2.size === intersection.length) {
    return 1.0;
  }

  const sInter1 = diceCoefficient(strInter, str1);
  const sInter2 = diceCoefficient(strInter, str2);
  const s12 = diceCoefficient(str1, str2);

  return Math.max(sInter1, sInter2, s12);
}

/**
 * Calculates max title similarity across Token Set Ratio, Dice Coefficient, and Levenshtein.
 * @param {string} titleA
 * @param {string} titleB
 * @returns {number}
 */
function calculateTitleSimilarity(titleA, titleB) {
  if (!titleA || !titleB) return 0.0;
  const a = normalizeTitle(titleA);
  const b = normalizeTitle(titleB);
  if (a === b) return 1.0;

  const dice = diceCoefficient(a, b);
  const tokenSet = tokenSetRatio(titleA, titleB);
  const lev = normalizedLevenshtein(a, b);

  return Math.max(tokenSet, dice, lev);
}

/**
 * Parses Vietnamese and international episode and season strings.
 * Supports: "Tập 5", "Tap 05", "Phần 2 - Tập 3", "S01E05", "Tập Full", "Tập Đặc Biệt", "Tập 1 - 2"
 * @param {string|Object} input
 * @returns {{ season: number, episode: number, isSpecial: boolean, isFull: boolean, rangeEnd?: number }}
 */
function parseEpisodeNumber(input) {
  const defaultResult = { season: 1, episode: 1, isSpecial: false, isFull: false };
  if (!input) return defaultResult;

  const raw = typeof input === 'object' ? (input.name || input.slug || input.title || '') : String(input);
  const s = stripDiacritics(raw).trim();
  if (!s) return defaultResult;

  // 1. Full movie / episode
  if (/\bfull\b/i.test(s)) {
    return { season: 1, episode: 1, isSpecial: false, isFull: true };
  }

  // 2. Special / OVA / Extras
  if (/dac biet|special|sp|ova|ngoai truyen/i.test(s)) {
    const spMatch = s.match(/(?:sp|dac biet|special|ova|ngoai truyen)\s*(\d+)/i);
    return { season: 0, episode: spMatch ? parseInt(spMatch[1], 10) : 1, isSpecial: true, isFull: false };
  }

  // 3. Compound Season & Episode: "Phần 2 - Tập 3", "Mua 1 Tap 5", "Season 2 Ep 3", "P2 T3"
  const compMatch = s.match(/(?:phan|mua|season|ss|p)\s*(\d+)[\s\-_:,|]+(?:tap|ep|episode|t)\s*(\d+)/i);
  if (compMatch) {
    return { season: parseInt(compMatch[1], 10), episode: parseInt(compMatch[2], 10), isSpecial: false, isFull: false };
  }

  // 4. Standard SxxExx: "S01E05", "s2e10"
  const seMatch = s.match(/s(\d+)\s*e(\d+)/i);
  if (seMatch) {
    return { season: parseInt(seMatch[1], 10), episode: parseInt(seMatch[2], 10), isSpecial: false, isFull: false };
  }

  // 5. Episode Range: "Tập 1 - 2", "Ep 01-03"
  const rangeMatch = s.match(/(?:tap|ep|episode|t)\s*(\d+)\s*[-+–]\s*(\d+)/i);
  if (rangeMatch) {
    return { season: 1, episode: parseInt(rangeMatch[1], 10), rangeEnd: parseInt(rangeMatch[2], 10), isSpecial: false, isFull: false };
  }

  // 6. Simple Episode: "Tập 5", "Ep. 05", "Tap 10"
  const epMatch = s.match(/(?:tap|ep|episode|t|e)\.?\s*(\d+)/i);
  if (epMatch) {
    return { season: 1, episode: parseInt(epMatch[1], 10), isSpecial: false, isFull: false };
  }

  // 7. Standalone Digit: "05", "5"
  const digitMatch = s.match(/^(\d+)$/) || s.match(/\b(\d+)\b/);
  if (digitMatch) {
    return { season: 1, episode: parseInt(digitMatch[1], 10), isSpecial: false, isFull: false };
  }

  return defaultResult;
}

/**
 * Locates matching server item from provider episode list.
 * @param {Array<Object>} serverData
 * @param {number} [targetSeason=1]
 * @param {number} [targetEpisode=1]
 * @param {string} [mediaType='movie']
 * @returns {Object|null}
 */
function findTargetEpisodeItem(serverData, targetSeason = 1, targetEpisode = 1, mediaType = 'movie') {
  if (!Array.isArray(serverData) || serverData.length === 0) return null;

  if (mediaType === 'movie') {
    return serverData.find((ep) => /\bfull\b/i.test(ep.name || ep.slug || '')) || serverData[0];
  }

  const parsedItems = serverData.map((item, index) => ({
    item,
    index,
    parsed: parseEpisodeNumber(item)
  }));

  // 1. Exact season + episode match
  const exact = parsedItems.find((p) => p.parsed.season === targetSeason && p.parsed.episode === targetEpisode);
  if (exact) return exact.item;

  // 2. Episode-only match
  const epOnly = parsedItems.find((p) => p.parsed.episode === targetEpisode);
  if (epOnly) return epOnly.item;

  // 3. Multi-episode range match
  const range = parsedItems.find((p) => p.parsed.rangeEnd && targetEpisode >= p.parsed.episode && targetEpisode <= p.parsed.rangeEnd);
  if (range) return range.item;

  // 4. Safe 1-based index fallback
  if (targetEpisode >= 1 && targetEpisode <= serverData.length) {
    return serverData[targetEpisode - 1];
  }

  return serverData[0] || null;
}

/**
 * Scores a single provider catalog candidate against Cinemeta metadata.
 * @param {Object} cinemetaMeta
 * @param {Object} candidate
 * @returns {number} Confidence score between 0.0 and 1.0
 */
function scoreCandidate(cinemetaMeta, candidate) {
  if (!cinemetaMeta || !candidate) return 0.0;

  // 1. Direct IMDb ID match boost
  const cinemetaImdb = cinemetaMeta.id || cinemetaMeta.imdb_id || cinemetaMeta.imdbId;
  if (cinemetaImdb && (candidate.imdbId === cinemetaImdb || candidate.imdb?.id === cinemetaImdb)) {
    return 1.0;
  }

  // 2. Multi-variant title similarity
  const searchVariants = generateSearchVariants(cinemetaMeta);
  const candidateTitles = [candidate.name, candidate.origin_name, candidate.original_name, candidate.slug].filter(Boolean);

  let bestSim = 0.0;
  for (const variant of searchVariants) {
    for (const candTitle of candidateTitles) {
      const sim = calculateTitleSimilarity(variant, candTitle);
      if (sim > bestSim) bestSim = sim;
    }
  }

  let finalScore = bestSim;

  // 3. Year adjustment (+0.05 exact, +0.02 delta 1, penalty for delta >= 2)
  const cYear = parseInt(cinemetaMeta.year || cinemetaMeta.releaseInfo, 10);
  const candYear = parseInt(candidate.year, 10);
  if (!isNaN(cYear) && !isNaN(candYear)) {
    const diff = Math.abs(cYear - candYear);
    if (diff === 0) finalScore += 0.05;
    else if (diff === 1) finalScore += 0.02;
    else finalScore -= Math.min(0.3, 0.1 * (diff - 1));
  }

  // 4. Media type compatibility check
  const cType = cinemetaMeta.type;
  const candType = candidate.type;
  if (cType && candType) {
    const isCMovie = cType === 'movie';
    const isCandMovie = candType === 'movie' || candType === 'single';
    if (isCMovie !== isCandMovie) {
      finalScore -= 0.40;
    }
  }

  return Math.max(0.0, Math.min(1.0, finalScore));
}

/**
 * Finds the best candidate matching Cinemeta metadata from a list of search results.
 * @param {Object} cinemetaMeta
 * @param {Array<Object>} metas
 * @param {number} [threshold=0.70]
 * @returns {{ meta: Object, score: number }|null}
 */
function findBestMatch(cinemetaMeta, metas, threshold = 0.70) {
  if (!Array.isArray(metas) || metas.length === 0) return null;

  let bestCandidate = null;
  let highestScore = 0.0;

  for (const meta of metas) {
    const score = scoreCandidate(cinemetaMeta, meta);
    if (score > highestScore) {
      highestScore = score;
      bestCandidate = meta;
    }
  }

  return highestScore >= threshold ? { meta: bestCandidate, score: highestScore } : null;
}

module.exports = {
  KNOWN_TITLE_LOCALIZATIONS,
  ROMAN_MAP,
  VIETNAMESE_STOPWORDS,
  stripDiacritics,
  convertRomanNumerals,
  normalizeTitle,
  cleanSearchKeywords,
  generateSearchVariants,
  levenshteinDistance,
  normalizedLevenshtein,
  diceCoefficient,
  tokenizeWords,
  tokenSetRatio,
  calculateTitleSimilarity,
  parseEpisodeNumber,
  findTargetEpisodeItem,
  scoreCandidate,
  findBestMatch
};
