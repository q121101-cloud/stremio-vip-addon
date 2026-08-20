'use strict';

const axios = require('axios');
const { catalogCache, detailCache } = require('../lib/cache');

const BASE_URL = 'https://api.vsmov.com';

const VSMOV_CATALOGS = [
  { id: 'vsmov-4k', name: '🌟 VSMOV • Phim 4K Ultra HD', type: 'movie', category: '4k' },
  { id: 'vsmov-thuyet-minh', name: '🎙️ VSMOV • Thuyết Minh 4K', type: 'movie', category: 'thuyet-minh' },
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

async function getCatalog(catType = '4k', page = 1, extra = {}) {
  const cacheKey = `vsmov:cat:${catType}:${page}:${extra.search || ''}`;
  const cached = catalogCache.get(cacheKey);
  if (cached) return cached;

  try {
    let url = `${BASE_URL}/api/films?page=${page}`;
    if (catType === 'thuyet-minh') {
      url += '&audio=thuyet-minh';
    }
    if (extra.search) {
      url += `&keyword=${encodeURIComponent(extra.search)}`;
    }

    const res = await axios.get(url, { timeout: 4500 });
    const items = res.data?.data?.items || res.data?.items || [];

    const metas = items.map((item) => ({
      id: `vsmov_${item.slug}`,
      type: item.type === 'series' ? 'series' : 'movie',
      name: item.name || item.title || item.origin_name,
      poster: item.poster_url || item.thumb_url,
      background: item.banner_url || item.poster_url,
      description: item.content || `Phim 4K ${item.name}`,
      releaseInfo: String(item.year || ''),
      genres: Array.isArray(item.category) ? item.category.map(c => c.name) : ['Phim 4K'],
    }));

    catalogCache.set(cacheKey, metas);
    return metas;
  } catch (err) {
    return [];
  }
}

async function getDetail(slug) {
  if (!slug) return null;
  const cleanSlug = slug.replace(/^vsmov[_:]/, '');
  const cacheKey = `vsmov:detail:${cleanSlug}`;
  const cached = detailCache.get(cacheKey);
  if (cached) return cached;

  try {
    const res = await axios.get(`${BASE_URL}/api/film/${cleanSlug}`, { timeout: 4500 });
    const film = res.data?.data?.item || res.data?.item || res.data?.data;
    if (film) {
      detailCache.set(cacheKey, film);
      return film;
    }
    return null;
  } catch (err) {
    return null;
  }
}

async function getStreams({ imdbId, type, title, season, episode, slug, proxyBase = '' }) {
  const streams = [];
  try {
    let filmSlug = slug;
    if (!filmSlug && title) {
      filmSlug = normalizeSlug(title);
    }
    if (!filmSlug) return [];

    const film = await getDetail(filmSlug);
    if (!film) return [];

    const episodes = film.episodes || [];
    for (const server of episodes) {
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
          const is4K = film.quality === '4K' || String(film.name).includes('4K');
          const qualityBadge = is4K ? '4K Ultra HD (3840x2160)' : 'Full HD 1080p';
          const serverName = server.server_name || 'VIP 1';

          const streamUrl = proxyBase
            ? `${proxyBase}/hls/stream.m3u8?url=${encodeURIComponent(ep.link_m3u8)}`
            : ep.link_m3u8;

          streams.push({
            name: `VIP Movies 🎬 [VIP 1 • VSMOV] ${serverName} ${qualityBadge}`,
            title: `⚡ Server ${serverName} • vsmov.com • ${ep.name || 'Tập Full'}\n🌟 Độ phân giải: ${qualityBadge}`,
            url: streamUrl,
            behaviorHints: {
              notWebReady: false,
              proxyHeaders: {
                request: {
                  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                  'Referer': 'https://vsmov.com/',
                },
              },
            },
          });
        }
      }
    }
  } catch (err) {}
  return streams;
}

module.exports = {
  name: 'vsmov',
  VSMOV_CATALOGS,
  getCatalog,
  getDetail,
  getStreams,
};
