'use strict';

const axios = require('axios');
const { catalogCache, detailCache } = require('../lib/cache');

const BASE_URL = 'https://phimapi.com';

const KKPHIM_CATALOGS = [
  { id: 'kkphim-movie-latest',  name: '🎬 KKPhim • Phim Lẻ Mới',        type: 'movie',  category: 'movie' },
  { id: 'kkphim-series-latest', name: '📺 KKPhim • Phim Bộ Mới',        type: 'series', category: 'series' },
  { id: 'kkphim-cinema-latest', name: '🍿 KKPhim • Phim Chiếu Rạp',     type: 'movie',  category: 'cinema' },
  { id: 'kkphim-anime-latest',  name: '🐉 KKPhim • Hoạt Hình & Anime',  type: 'series', category: 'anime' },
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
  const cacheKey = `kkphim:cat:${catType}:${page}:${extra.search || ''}`;
  const cached = catalogCache.get(cacheKey);
  if (cached) return cached;

  try {
    let url = `${BASE_URL}/danh-sach/phim-moi-cap-nhat?page=${page}`;
    if (catType === 'series') url = `${BASE_URL}/v1/api/danh-sach/phim-bo?page=${page}`;
    if (catType === 'movie')  url = `${BASE_URL}/v1/api/danh-sach/phim-le?page=${page}`;
    if (catType === 'anime')  url = `${BASE_URL}/v1/api/danh-sach/hoat-hinh?page=${page}`;

    if (extra.search) {
      url = `${BASE_URL}/v1/api/tim-kiem?keyword=${encodeURIComponent(extra.search)}&page=${page}`;
    }

    const res = await axios.get(url, { timeout: 4500 });
    const items = res.data?.data?.items || res.data?.items || [];
    const imageDomain = res.data?.data?.APP_DOMAIN_CDN_IMAGE || 'https://phimimg.com';

    const metas = items.map((item) => {
      const poster = item.poster_url?.startsWith('http')
        ? item.poster_url
        : `${imageDomain}/${item.poster_url}`;
      return {
        id: `kkphim_${item.slug}`,
        type: item.type === 'series' ? 'series' : 'movie',
        name: item.name || item.origin_name,
        poster,
        background: poster,
        description: `Xem phim ${item.name} (${item.year || ''}) Full HD trên KKPhim`,
        releaseInfo: String(item.year || ''),
        genres: Array.isArray(item.category) ? item.category.map(c => c.name) : ['Phim HD'],
      };
    });

    catalogCache.set(cacheKey, metas);
    return metas;
  } catch (err) {
    return [];
  }
}

async function getDetail(slug) {
  if (!slug) return null;
  const cleanSlug = slug.replace(/^kkphim[_:]/, '');
  const cacheKey = `kkphim:detail:${cleanSlug}`;
  const cached = detailCache.get(cacheKey);
  if (cached) return cached;

  try {
    const res = await axios.get(`${BASE_URL}/phim/${cleanSlug}`, { timeout: 4500 });
    const movie = res.data?.movie;
    const episodes = res.data?.episodes || [];
    if (movie) {
      const data = { ...movie, episodes };
      detailCache.set(cacheKey, data);
      return data;
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
    if (slug) slugsToTry.push(slug.replace(/^kkphim[_:]/, ''));
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
        const serverData = server.server_data || [];
        for (const ep of serverData) {
          let match = false;
          if (type === 'series' && (season || episode)) {
            const epNum = parseInt(ep.name, 10) || parseInt(ep.slug, 10);
            if (epNum === parseInt(episode, 10)) match = true;
          } else {
            match = true;
          }

          if (match && ep.link_m3u8) {
            const serverName = server.server_name || 'VIP 2';
            const streamUrl = proxyBase
              ? `${proxyBase}/hls/stream.m3u8?url=${encodeURIComponent(ep.link_m3u8)}`
              : ep.link_m3u8;

            streams.push({
              name: `VIP Movies 🎬 [VIP 2 • KKPhim] Vietsub Full HD`,
              title: `⚡ Server ${serverName} • Phát trực tiếp trong App\n🎬 Tập: ${ep.name || 'Full'} • Chất lượng: Full HD 1080p`,
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
  name: 'kkphim',
  KKPHIM_CATALOGS,
  getCatalog,
  getDetail,
  getStreams,
};
