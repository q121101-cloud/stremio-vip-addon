'use strict';

/**
 * ============================================================
 *  VIP Movies Addon — src/providers/nguonc.js
 *  NguonC Provider: getCatalog() + getStreams()
 *  Dùng api.js hiện có + imdbCache để tăng tốc
 * ============================================================
 */

const api    = require('../api');
const mapper = require('../mapper');
const { imdbCache } = require('../lib/cache');

const PROVIDER_ID    = 'nguonc';
const PROVIDER_LABEL = 'NguonC 🎞️';

// ─── Slug mapping per catalog type ─────────────────────────────
const LIST_SLUG_MAP = {
  movie:  'phim-le',
  series: 'phim-bo',
  anime:  null,   // dùng genre route
  cinema: 'phim-chieu-rap',
};

const GENRE_SLUG_MAP = {
  anime: 'hoat-hinh',
};

// ─────────────────────────────────────────────────────────────
/**
 * Lấy danh sách phim theo danh mục
 * @param {string} type     - 'movie' | 'series' | 'anime' | 'cinema'
 * @param {number} [page=1]
 * @param {object} [extra]  - { search, genre, skip }
 * @returns {Promise<Array>} Stremio meta array
 */
async function getCatalog(type, page = 1, extra = {}) {
  try {
    const { search, genre } = extra;

    // ── Search mode ──────────────────────────────────────────
    if (search) {
      const data = await api.searchFilms(search, page);
      const items = (data.items || []).filter(
        (item) => mapper.detectType(item) === (type === 'anime' || type === 'cinema' ? 'movie' : type)
      );
      return items.map((item) => mapper.mapCatalogItem(item, type === 'anime' || type === 'cinema' ? 'movie' : type));
    }

    // ── Genre filter ─────────────────────────────────────────
    if (genre) {
      const genres = require('../manifest').GENRES;
      const genreObj = genres.find(
        (g) => g.name.toLowerCase() === genre.toLowerCase() || g.slug === genre.toLowerCase()
      );
      if (!genreObj) return [];
      const data = await api.getFilmsByGenre(genreObj.slug, page);
      return (data.items || []).map((item) => mapper.mapCatalogItem(item));
    }

    // ── Category/List mode ───────────────────────────────────
    const stremioType = (type === 'anime' || type === 'cinema') ? 'movie' : type;

    if (GENRE_SLUG_MAP[type]) {
      // Anime → by genre
      const data = await api.getFilmsByGenre(GENRE_SLUG_MAP[type], page);
      return (data.items || []).map((item) => mapper.mapCatalogItem(item, stremioType));
    }

    const listSlug = LIST_SLUG_MAP[type];
    if (listSlug) {
      const [r1, r2] = await Promise.allSettled([
        api.getFilmsByList(listSlug, page),
        api.getFilmsByList(listSlug, page + 1),
      ]);
      let collected = [];
      if (r1.status === 'fulfilled') collected.push(...(r1.value.items || []));
      if (r2.status === 'fulfilled') collected.push(...(r2.value.items || []));
      return collected.slice(0, 20).map((item) => mapper.mapCatalogItem(item, stremioType));
    }

    // Fallback: latest
    const data = await api.getLatestFilms(page);
    return (data.items || [])
      .filter((item) => mapper.detectType(item) === stremioType)
      .map((item) => mapper.mapCatalogItem(item, stremioType));

  } catch (err) {
    console.error(`[NguonC/getCatalog] type=${type} page=${page}`, err.message);
    return [];
  }
}

// ─────────────────────────────────────────────────────────────
/**
 * Lấy streams cho một phim/tập
 * @param {string} imdbId   - e.g. 'tt1234567'
 * @param {string} title    - Tên phim (fallback search)
 * @param {string} type     - 'movie' | 'series'
 * @param {number|null} season
 * @param {number|null} episode
 * @param {string} proxyBase - Base URL của addon server
 * @returns {Promise<Array>} Stremio stream array
 */
async function getStreams(imdbId, title, type, season, episode, proxyBase) {
  try {
    // 1. Check IMDb cache
    let slug = imdbCache.get(`nguonc:${imdbId}`);
    let filmName = null;

    if (!slug) {
      const match = await api.findFilmByImdbId(type, imdbId);
      if (!match) {
        console.warn(`[NguonC/getStreams] No match for ${imdbId}`);
        return [];
      }
      slug = match.slug;
      filmName = match.name;
      imdbCache.set(`nguonc:${imdbId}`, slug, 86400); // Cache 24h
      console.log(`[NguonC/getStreams] IMDb ${imdbId} → "${filmName}" (${slug}) [FRESH]`);
    } else {
      console.log(`[NguonC/getStreams] IMDb ${imdbId} → slug="${slug}" [CACHE]`);
    }

    // 2. Get film detail
    const data = await api.getFilmDetail(slug);
    if (!data?.movie) return [];

    // 3. Build streams
    const epName = (type === 'series' && episode != null) ? String(episode) : null;
    const streams = mapper.buildStreams(data.movie, epName, proxyBase);

    // Tag streams với provider label
    return streams.map((s) => ({
      ...s,
      name: PROVIDER_LABEL,
    }));

  } catch (err) {
    console.error(`[NguonC/getStreams] imdbId=${imdbId}`, err.message);
    return [];
  }
}

module.exports = {
  id:           PROVIDER_ID,
  label:        PROVIDER_LABEL,
  getCatalog,
  getStreams,
};
