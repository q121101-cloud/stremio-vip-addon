'use strict';

const axios = require('axios');
const { cache } = require('../db/cache');
const { PROVIDERS, TIMEOUTS, CACHE_TTL } = require('../config');

// Static high-accuracy dictionary for Asian Dramas and films not reliably indexed in Cinemeta
const KNOWN_TITLE_LOCALIZATIONS = {
  // Korean / Asian Dramas
  'tt7458054':  { vi: 'Khi Nàng Say Giấc', en: 'While You Were Sleeping', year: 2017, type: 'series' },
  'tt26450613': { vi: 'Cửa Hàng Sát Thủ', en: 'A Shop for Killers', year: 2024, type: 'series' },
  'tt1442437':  { vi: 'Hạ Cánh Nơi Anh', en: 'Crash Landing on You', year: 2019, type: 'series' },
  'tt10730822': { vi: 'Hạ Cánh Nơi Anh', en: 'Crash Landing on You', year: 2019, type: 'series' },
  'tt8075192':  { vi: 'Thế Giới Hôn Nhân', en: 'The World of the Married', year: 2020, type: 'series' },
  'tt11198330': { vi: 'Ngôi Trường Xác Sống', en: 'All of Us Are Dead', year: 2022, type: 'series' },
  'tt10986410': { vi: 'Hẹn Hò Chốn Công Sở', en: 'Business Proposal', year: 2022, type: 'series' },
  'tt14828136': { vi: 'Luật Sư Kỳ Lạ Woo Young Woo', en: 'Extraordinary Attorney Woo', year: 2022, type: 'series' },
  'tt15447432': { vi: 'Vinh Quang Trong Thù Hận', en: 'The Glory', year: 2022, type: 'series' },
  'tt15326988': { vi: 'Vinh Quang Trong Thù Hận', en: 'The Glory', year: 2022, type: 'series' },
  'tt10919420': { vi: 'Trò Chơi Con Mực', en: 'Squid Game', year: 2021, type: 'series' },
  'tt13303666': { vi: 'Khách Sạn Vương Giả', en: 'King the Land', year: 2023, type: 'series' },
  'tt27074082': { vi: 'Nữ Hoàng Nước Mắt', en: 'Queen of Tears', year: 2024, type: 'series' },
  'tt15494274': { vi: 'Tài Xế Taxi 2', en: 'Taxi Driver 2', year: 2023, type: 'series' },
  'tt11449830': { vi: 'Tầng Lớp Itaewon', en: 'Itaewon Class', year: 2020, type: 'series' },
  'tt21209876': { vi: 'Tôi Thăng Cấp Một Mình', en: 'Solo Leveling', year: 2024, type: 'series' },
  'tt2560140':  { vi: 'Đại Chiến Titan', en: 'Attack on Titan', year: 2013, type: 'series' },

  // Global & Hollywood Blockbusters
  'tt1375666':  { vi: 'Kẻ Đánh Cắp Giấc Mơ', en: 'Inception', year: 2010, type: 'movie' },
  'tt10872600': { vi: 'Người Nhện: Không Còn Nhà', en: 'Spider-Man: No Way Home', year: 2021, type: 'movie' },
  'tt0944947':  { vi: 'Trò Chơi Vương Quyền', en: 'Game of Thrones', year: 2011, type: 'series' },
  'tt4574334':  { vi: 'Cậu Bé Mất Tích', en: 'Stranger Things', year: 2016, type: 'series' },
  'tt1190634':  { vi: 'The Boys', en: 'The Boys', year: 2019, type: 'series' },
  'tt1630029':  { vi: 'Avatar: Dòng Chảy Của Nước', en: 'Avatar: The Way of Water', year: 2022, type: 'movie' },
  'tt0373889':  { vi: 'Harry Potter và Tên Tù Nhân Ngục Azkaban', en: 'Harry Potter and the Prisoner of Azkaban', year: 2004, type: 'movie' }
};

class CinemetaService {
  constructor(options = {}) {
    this.baseUrl = (options.baseUrl || PROVIDERS.CINEMETA?.BASE_URL || 'https://v3-cinemeta.strem.io').replace(/\/+$/, '');
    this.timeout = options.timeout || TIMEOUTS.CINEMETA || 4000;
    this.inFlight = new Map();
  }

  /**
   * Deconstructs raw Stremio ID into component parts.
   * Handles: "tt1375666", "tt7458054:1:5", "tt7458054:2"
   * @param {string} rawId
   * @param {string} [defaultType='movie']
   * @returns {{ imdbId: string, type: string, season: number, episode: number, isCompound: boolean }|null}
   */
  parseId(rawId, defaultType = 'movie') {
    if (!rawId || typeof rawId !== 'string') return null;
    const clean = rawId.replace(/\.json$/, '').trim();
    if (!clean.startsWith('tt')) return null;

    const parts = clean.split(':');
    const imdbId = parts[0];
    let season = 1;
    let episode = 1;
    let isCompound = false;

    if (parts.length >= 3) {
      const s = parseInt(parts[1], 10);
      const e = parseInt(parts[2], 10);
      if (!isNaN(s) && !isNaN(e)) {
        season = Math.max(1, s);
        episode = Math.max(1, e);
        isCompound = true;
      }
    } else if (parts.length === 2) {
      const e = parseInt(parts[1], 10);
      if (!isNaN(e)) {
        episode = Math.max(1, e);
        isCompound = true;
      }
    }

    const type = isCompound ? 'series' : (defaultType || 'movie');
    return { imdbId, type, season, episode, isCompound };
  }

  /**
   * Extracts clean 4-digit release year from various metadata fields.
   * @param {Object} rawMeta
   * @returns {number|undefined}
   */
  extractYear(rawMeta) {
    if (!rawMeta) return undefined;
    if (typeof rawMeta.year === 'number' && !isNaN(rawMeta.year)) return rawMeta.year;
    const yearCandidates = [rawMeta.year, rawMeta.releaseInfo, rawMeta.released, rawMeta.first_aired];
    for (const cand of yearCandidates) {
      if (typeof cand === 'string') {
        const m = cand.match(/\b(19\d{2}|20\d{2})\b/);
        if (m) return parseInt(m[1], 10);
      }
    }
    return undefined;
  }

  /**
   * Normalizes genres into string array.
   * @param {Object} rawMeta
   * @returns {string[]}
   */
  extractGenres(rawMeta) {
    if (!rawMeta) return [];
    if (Array.isArray(rawMeta.genres)) return rawMeta.genres.filter(Boolean);
    if (Array.isArray(rawMeta.genre)) return rawMeta.genre.filter(Boolean);
    if (typeof rawMeta.genre === 'string') {
      return rawMeta.genre.split(',').map(g => g.trim()).filter(Boolean);
    }
    return [];
  }

  /**
   * Normalizes IMDb rating to float.
   * @param {Object} rawMeta
   * @returns {number|null}
   */
  extractRating(rawMeta) {
    if (!rawMeta || rawMeta.imdbRating === undefined || rawMeta.imdbRating === null) return null;
    const parsed = parseFloat(rawMeta.imdbRating);
    return isNaN(parsed) ? null : parsed;
  }

  /**
   * Resolves full Stremio Meta object for an IMDb ID.
   * Order: L1 Cache -> Single-flight Upstream Cinemeta -> Static Dict Fallback.
   * @param {string} type - 'movie' | 'series'
   * @param {string} rawId - 'tt1375666' or 'tt7458054:1:5'
   * @returns {Promise<Object|null>}
   */
  async getMeta(type, rawId) {
    const parsed = this.parseId(rawId, type);
    if (!parsed) return null;

    const mediaType = parsed.type || type || 'movie';
    const imdbId = parsed.imdbId;
    const cacheKey = `cinemeta:meta:${mediaType}:${imdbId}`;

    // 1. L1 Memory Cache
    const cached = cache.get(cacheKey);
    if (cached) return cached;

    // Single-flight deduplication
    if (this.inFlight.has(cacheKey)) {
      return this.inFlight.get(cacheKey);
    }

    const fetchPromise = (async () => {
      let resultMeta = null;

      // 2. Fetch Upstream Cinemeta API
      try {
        const resp = await axios.get(`${this.baseUrl}/meta/${mediaType}/${imdbId}.json`, {
          timeout: this.timeout,
          headers: {
            'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko)',
            'Accept': 'application/json'
          },
          maxRedirects: 5
        });

        if (resp.data && resp.data.meta && resp.data.meta.name) {
          const raw = resp.data.meta;
          resultMeta = {
            id: raw.id || imdbId,
            type: raw.type || mediaType,
            name: raw.name,
            year: this.extractYear(raw),
            releaseInfo: raw.releaseInfo || (raw.year ? String(raw.year) : undefined),
            genres: this.extractGenres(raw),
            imdbRating: this.extractRating(raw),
            description: raw.description || raw.overview || '',
            poster: raw.poster || '',
            background: raw.background || '',
            logo: raw.logo || '',
            runtime: raw.runtime || '',
            director: Array.isArray(raw.director) ? raw.director : (raw.director ? [raw.director] : []),
            cast: Array.isArray(raw.cast) ? raw.cast : (raw.cast ? [raw.cast] : []),
            aliases: Array.isArray(raw.aliases) ? raw.aliases : [],
            videos: Array.isArray(raw.videos) ? raw.videos : undefined
          };
        }
      } catch (err) {
        // Soft fail on network / 404 / 500
      }

      // 3. Static Dictionary Fallback (if Cinemeta is down or returns empty/null)
      if (!resultMeta && KNOWN_TITLE_LOCALIZATIONS[imdbId]) {
        const entry = KNOWN_TITLE_LOCALIZATIONS[imdbId];
        resultMeta = {
          id: imdbId,
          type: entry.type || mediaType,
          name: entry.en,
          year: entry.year,
          releaseInfo: String(entry.year),
          genres: [],
          imdbRating: null,
          aliases: [entry.vi],
          description: `Phim ${entry.vi} (${entry.en})`
        };
      }

      // Populate L1 cache if found
      if (resultMeta) {
        cache.set(cacheKey, resultMeta, CACHE_TTL.MEMORY_CINEMETA || 86400);
      }

      return resultMeta;
    })().finally(() => {
      this.inFlight.delete(cacheKey);
    });

    this.inFlight.set(cacheKey, fetchPromise);
    return fetchPromise;
  }

  /**
   * Resolves search keywords, title, aliases, and episode targets for Stream Matcher.
   * @param {string} type - 'movie' | 'series'
   * @param {string} rawId - 'tt1375666' or 'tt7458054:1:5'
   * @returns {Promise<Object|null>}
   */
  async getMetadataForMatcher(type, rawId) {
    const parsed = this.parseId(rawId, type);
    if (!parsed) return null;

    const meta = await this.getMeta(parsed.type, parsed.imdbId);
    const staticEntry = KNOWN_TITLE_LOCALIZATIONS[parsed.imdbId];

    const aliases = new Set();
    if (meta?.aliases && Array.isArray(meta.aliases)) {
      meta.aliases.forEach(a => a && aliases.add(a));
    }
    if (staticEntry?.vi) aliases.add(staticEntry.vi);
    if (staticEntry?.en) aliases.add(staticEntry.en);

    const title = meta?.name || staticEntry?.en || parsed.imdbId.replace(/^tt/, '');
    const year = meta?.year || staticEntry?.year;
    const genres = meta?.genres || [];
    const imdbRating = meta?.imdbRating !== undefined ? meta.imdbRating : null;

    return {
      imdbId: parsed.imdbId,
      type: parsed.type,
      title,
      vietnameseTitle: staticEntry?.vi,
      year,
      aliases: Array.from(aliases),
      genres,
      imdbRating,
      season: parsed.season,
      episode: parsed.episode
    };
  }
}

const cinemetaService = new CinemetaService();

module.exports = {
  CinemetaService,
  cinemetaService,
  KNOWN_TITLE_LOCALIZATIONS
};
