'use strict';

const axios = require('axios');
const { catalogCache, detailCache } = require('../lib/cache');

const BASE_URL = 'https://phim.nguonc.com';

const NGUONC_CATALOGS = [
  { id: 'nguonc-movie-latest',  name: '🎬 NguonC • Phim Lẻ Mới',        type: 'movie',  category: 'movie' },
  { id: 'nguonc-series-latest', name: '📺 NguonC • Phim Bộ Mới',        type: 'series', category: 'series' },
  { id: 'nguonc-cinema-latest', name: '🍿 NguonC • Phim Chiếu Rạp',     type: 'movie',  category: 'cinema' },
  { id: 'nguonc-anime-latest',  name: '🐉 NguonC • Hoạt Hình & Anime',  type: 'series', category: 'anime' },
];

function normalizeSlug(str) {
  if (!str) return '';
  return str
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-');
}

async function getCatalog(catType = 'movie', page = 1, extra = {}) {
  const cacheKey = `nguonc:cat:${catType}:${page}:${extra.search || ''}`;
  const cached = catalogCache.get(cacheKey);
  if (cached) return cached;

  try {
    let url = `${BASE_URL}/api/films/phim-moi-cap-nhat?page=${page}`;
    if (catType === 'series') url = `${BASE_URL}/api/films/danh-sach/phim-bo?page=${page}`;
    if (catType === 'movie')  url = `${BASE_URL}/api/films/danh-sach/phim-le?page=${page}`;
    if (catType === 'anime')  url = `${BASE_URL}/api/films/danh-sach/hoat-hinh?page=${page}`;

    if (extra.search) {
      url = `${BASE_URL}/api/films/search?keyword=${encodeURIComponent(extra.search)}&page=${page}`;
    }

    const res = await axios.get(url, { timeout: 4500 });
    const items = res.data?.items || res.data?.data?.items || [];

    const metas = items.map((item) => ({
      id: `nguonc_${item.slug}`,
      type: item.type === 'series' ? 'series' : 'movie',
      name: item.name || item.original_name,
      poster: item.poster_url || item.thumb_url,
      background: item.poster_url || item.thumb_url,
      description: item.description || `Xem phim ${item.name} Full HD trên NguonC`,
      releaseInfo: String(item.year || ''),
      genres: Array.isArray(item.categories) ? item.categories.map(c => c.name) : ['Phim HD'],
    }));

    catalogCache.set(cacheKey, metas);
    return metas;
  } catch (err) {
    return [];
  }
}

async function getDetail(slug) {
  if (!slug) return null;
  const cleanSlug = slug.replace(/^nguonc[_:]/, '');
  const cacheKey = `nguonc:detail:${cleanSlug}`;
  const cached = detailCache.get(cacheKey);
  if (cached) return cached;

  try {
    const res = await axios.get(`${BASE_URL}/api/film/${cleanSlug}`, { timeout: 4500 });
    const film = res.data?.movie || res.data?.data?.item || res.data?.item;
    if (film) {
      detailCache.set(cacheKey, film);
      return film;
    }
    return null;
  } catch (err) {
    return null;
  }
}

async function getStreams({ imdbId, type, title, aliases = [], season, episode, slug, proxyBase = '' }) {
  const streams = [];
  try {
    let slugsToTry = [];
    if (slug) slugsToTry.push(slug.replace(/^nguonc[_:]/, ''));
    if (title) slugsToTry.push(normalizeSlug(title));
    if (Array.isArray(aliases)) {
      for (const a of aliases) {
        if (a) slugsToTry.push(normalizeSlug(a));
      }
    }
    slugsToTry = Array.from(new Set(slugsToTry.filter(Boolean)));

    for (const testSlug of slugsToTry) {
      const film = await getDetail(testSlug);
      if (!film || !Array.isArray(film.episodes)) continue;

      for (const server of film.episodes) {
        const serverName = server.server_name || 'VIP 3';
        const items = server.items || server.server_data || [];

        for (const ep of items) {
          let match = false;
          if (type === 'series' && (season || episode)) {
            const epNum = parseInt(ep.name, 10) || parseInt(ep.slug, 10);
            if (epNum === parseInt(episode, 10)) match = true;
          } else {
            match = true;
          }

          if (match && ep.m3u8) {
            const streamUrl = proxyBase
              ? `${proxyBase}/hls/stream.m3u8?url=${encodeURIComponent(ep.m3u8)}`
              : ep.m3u8;

            streams.push({
              name: `VIP Movies 🎬 [VIP 3 • NguonC] Vietsub & Thuyết Minh`,
              title: `⚡ Server ${serverName} • Phát trực tiếp trong App\n📺 Tập: ${ep.name || 'Full'} • StreamC High-Speed`,
              url: streamUrl,
              behaviorHints: {
                notWebReady: false,
              },
            });
          }
        }
      }

      if (streams.length > 0) break;
    }
  } catch (err) {}
  return streams;
}

module.exports = {
  name: 'nguonc',
  NGUONC_CATALOGS,
  getCatalog,
  getDetail,
  getStreams,
};
