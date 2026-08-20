'use strict';

const axios = require('axios');
const BaseProvider = require('./base');
const { PROVIDERS, TIMEOUTS } = require('../config');

const VSMOV_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  'Referer': 'https://vsmov.com/',
  'Origin': 'https://vsmov.com',
  'Accept': 'application/json, text/plain, */*'
};

class VSMOVProvider extends BaseProvider {
  constructor(options = {}) {
    super({
      id: 'vsmov',
      name: 'vsmov',
      displayName: 'VSMOV 4K',
      baseUrl: options.baseUrl || PROVIDERS.VSMOV.BASE_URL,
      timeout: options.timeout || TIMEOUTS.DEFAULT,
      headers: {
        ...VSMOV_HEADERS,
        ...(options.headers || {})
      }
    });
    this.webBaseUrl = 'https://vsmov.com';
  }

  /**
   * Stremio Catalog Resolver
   * @param {string} [catalogId='vsmov-4k']
   * @param {Object} [extra]
   * @returns {Promise<{ metas: Array<Object> }>}
   */
  async getCatalog(catalogId = 'vsmov-4k', extra = {}) {
    const limit = extra.limit || 20;
    const skip = parseInt(extra.skip || 0, 10);
    const page = extra.page || Math.max(1, Math.floor(skip / limit) + 1);
    const search = extra.search ? extra.search.trim() : '';

    if (search) {
      return this.search(search, { page, limit });
    }

    let endpoint = '/danh-sach/phim-moi-cap-nhat';
    if (catalogId === 'vsmov-movie' || catalogId === 'vsmov-phim-le' || catalogId === 'phim-le') {
      endpoint = '/danh-sach/phim-le';
    } else if (catalogId === 'vsmov-series' || catalogId === 'vsmov-phim-bo' || catalogId === 'phim-bo') {
      endpoint = '/danh-sach/phim-bo';
    } else if (catalogId === 'vsmov-cinema' || catalogId === 'vsmov-phim-chieu-rap' || catalogId === 'phim-chieu-rap') {
      endpoint = '/danh-sach/phim-chieu-rap';
    } else if (catalogId === 'hoat-hinh' || catalogId === 'vsmov-hoat-hinh' || catalogId === 'tv-shows') {
      // VSMOV API returns 404 for hoat-hinh; return empty gracefully
      return { metas: [] };
    }

    try {
      const data = await this.request(`${endpoint}?page=${page}&limit=${limit}`);
      const items = data?.items || data?.data?.items || [];

      const metas = items.map((item) => ({
        id: this.prefixId(item.slug),
        type: item.type === 'series' ? 'series' : 'movie',
        name: item.name || item.origin_name,
        poster: item.poster_url || item.thumb_url,
        posterShape: 'poster',
        background: item.thumb_url || item.poster_url,
        description: item.content ? item.content.replace(/<[^>]*>?/gm, '').trim() : `Phim 4K Ultra HD • ${item.name}`,
        releaseInfo: item.year ? `${item.year} · 4K UHD` : '4K Ultra HD',
        genres: Array.isArray(item.category)
          ? item.category.map((c) => (typeof c === 'string' ? c : c.name || c.slug))
          : ['Phim 4K'],
        year: item.year ? parseInt(item.year, 10) : undefined,
        imdbId: item.imdb?.id || null,
        tmdbId: item.tmdb?.id ? String(item.tmdb.id) : null
      }));

      return { metas };
    } catch (err) {
      return { metas: [] };
    }
  }

  /**
   * Search API with empty keyword guard
   * @param {string} query
   * @param {Object} [extra]
   * @returns {Promise<{ metas: Array<Object> }>}
   */
  async search(query, extra = {}) {
    if (!query || typeof query !== 'string' || !query.trim()) {
      return { metas: [] };
    }
    const page = extra.page || 1;
    try {
      const data = await this.request(`/tim-kiem?keyword=${encodeURIComponent(query.trim())}&page=${page}`);
      const items = data?.items || data?.data?.items || [];

      const metas = items.map((item) => ({
        id: this.prefixId(item.slug),
        type: item.type === 'series' ? 'series' : 'movie',
        name: item.name || item.origin_name,
        poster: item.poster_url || item.thumb_url,
        posterShape: 'poster',
        background: item.thumb_url || item.poster_url,
        description: item.content ? item.content.replace(/<[^>]*>?/gm, '').trim() : `Phim 4K Ultra HD • ${item.name}`,
        releaseInfo: item.year ? `${item.year} · 4K UHD` : '4K Ultra HD',
        genres: Array.isArray(item.category)
          ? item.category.map((c) => (typeof c === 'string' ? c : c.name || c.slug))
          : ['Phim 4K'],
        year: item.year ? parseInt(item.year, 10) : undefined,
        imdbId: item.imdb?.id || null,
        tmdbId: item.tmdb?.id ? String(item.tmdb.id) : null
      }));

      return { metas };
    } catch (err) {
      return { metas: [] };
    }
  }

  /**
   * Fetch detailed metadata and video list
   * @param {string} typeOrId
   * @param {string} [idMaybe]
   * @returns {Promise<{ meta: Object, movie?: Object, episodes?: Array }>}
   */
  async getDetail(typeOrId, idMaybe) {
    const type = idMaybe !== undefined ? typeOrId : 'movie';
    const id = idMaybe !== undefined ? idMaybe : typeOrId;
    const cleanSlug = this.cleanSlug(id);
    if (!cleanSlug) return { meta: null };

    try {
      const data = await this.request(`/phim/${cleanSlug}`);
      if (!data || (!data.movie && !data.data?.movie)) {
        return { meta: null };
      }

      const movie = data.movie || data.data.movie;
      const episodes = data.episodes || data.data?.episodes || [];
      const mediaType = movie.type === 'series' ? 'series' : type;

      const videos = [];
      if (mediaType === 'series' && episodes.length > 0) {
        const primaryServer = episodes[0];
        const serverData = primaryServer.server_data || [];
        serverData.forEach((ep, idx) => {
          const numMatch = ep.name ? String(ep.name).match(/\d+/) : null;
          const epNum = numMatch ? parseInt(numMatch[0], 10) : idx + 1;
          videos.push({
            id: `vsmov:${movie.slug}:1:${epNum}`,
            title: ep.name ? (ep.name.startsWith('Tập') ? ep.name : `Tập ${ep.name}`) : `Tập ${epNum}`,
            season: 1,
            episode: epNum,
            released: movie.modified?.time || new Date().toISOString()
          });
        });
      }

      const meta = {
        id: this.prefixId(movie.slug),
        type: mediaType,
        name: movie.name || movie.origin_name,
        genres: Array.isArray(movie.category) ? movie.category.map((c) => (typeof c === 'string' ? c : c.name || c.slug)) : ['Phim 4K'],
        poster: movie.poster_url || movie.thumb_url,
        posterShape: 'poster',
        background: movie.thumb_url || movie.poster_url,
        description: movie.content ? movie.content.replace(/<[^>]*>?/gm, '').trim() : `Phim 4K Ultra HD • ${movie.name}`,
        releaseInfo: `${movie.quality || '4K UHD'} · ${movie.lang || 'Vietsub'} · ${movie.year || ''}`.trim(),
        year: movie.year ? parseInt(movie.year, 10) : undefined,
        director: Array.isArray(movie.director) ? movie.director : (movie.director ? [movie.director] : []),
        cast: Array.isArray(movie.actor) ? movie.actor : (movie.actor ? [movie.actor] : []),
        runtime: movie.time || '',
        country: Array.isArray(movie.country) ? movie.country.map((c) => (typeof c === 'string' ? c : c.name)).join(', ') : '',
        imdbId: movie.imdb?.id || null,
        tmdbId: movie.tmdb?.id ? String(movie.tmdb.id) : null,
        videos: videos.length > 0 ? videos : undefined
      };

      return { meta, movie, episodes };
    } catch (err) {
      return { meta: null };
    }
  }

  /**
   * WebVTT Subtitle Track Extractor
   * @param {string} linkEmbed
   * @returns {Promise<Array<{ id: string, lang: string, url: string }>>}
   */
  async extractSubtitles(linkEmbed) {
    if (!linkEmbed) return [];
    try {
      const res = await axios.get(linkEmbed, {
        headers: VSMOV_HEADERS,
        timeout: 3000
      });
      const match = typeof res.data === 'string' ? res.data.match(/playerOptions\s*=\s*(\{[\s\S]*?\});/) : null;
      if (match) {
        const options = JSON.parse(match[1]);
        const subtitles = options.subtitles || [];
        const embedOrigin = new URL(linkEmbed).origin;

        return subtitles.map((sub) => {
          const subUrl = sub.url.startsWith('http') ? sub.url : `${embedOrigin}${sub.url}`;
          return {
            id: sub.code || 'vie',
            lang: sub.code === 'vie' ? 'Tiếng Việt (VSMOV VIP)' : (sub.name || 'Phụ Đề'),
            url: subUrl
          };
        });
      }
    } catch (e) {}
    return [];
  }

  /**
   * Master HLS 4K Stream Extractor
   * @param {string} linkEmbed
   * @returns {string|null}
   */
  deriveMasterM3u8(linkEmbed) {
    if (!linkEmbed) return null;
    if (linkEmbed.includes('.m3u8')) return linkEmbed;
    const uuidMatch = linkEmbed.match(/\/video\/([a-f0-9-]+)/i);
    if (uuidMatch) {
      const origin = new URL(linkEmbed).origin;
      return `${origin}/stream/${uuidMatch[1]}/master.m3u8`;
    }
    return null;
  }

  /**
   * Stream Resolver with Audio & Subtitle Separation
   * @param {Object} params
   * @returns {Promise<Array<Object>>}
   */
  async getStreams({ imdbId, type = 'movie', title, aliases = [], season = 1, episode = 1, id, slug, proxyBase = '' } = {}) {
    const streams = [];
    try {
      let candidateSlugs = [];
      const directSlug = this.cleanSlug(id || slug);
      if (directSlug) candidateSlugs.push(directSlug);

      // 1. Check direct IMDb search on VSMOV
      if (imdbId) {
        const imdbSearch = await this.search(imdbId);
        for (const meta of imdbSearch.metas || []) {
          if (meta.imdbId === imdbId || meta.id) {
            candidateSlugs.push(this.cleanSlug(meta.id));
          }
        }
      }

      // 2. Add title and aliases candidates
      if (title) {
        candidateSlugs.push(this.normalizeSlug(title));
        const searchRes = await this.search(title);
        for (const meta of (searchRes.metas || []).slice(0, 3)) {
          candidateSlugs.push(this.cleanSlug(meta.id));
        }
      }
      if (Array.isArray(aliases)) {
        for (const alias of aliases) {
          if (alias) candidateSlugs.push(this.normalizeSlug(alias));
        }
      }

      candidateSlugs = Array.from(new Set(candidateSlugs.filter(Boolean)));

      for (const filmSlug of candidateSlugs) {
        const detail = await this.getDetail(type, filmSlug);
        if (!detail || !detail.episodes || !detail.episodes.length) continue;

        const { movie, episodes } = detail;
        const isMovie = type === 'movie' || movie?.type === 'single';

        for (const server of episodes) {
          const rawServerName = server.server_name || 'VIP 1';
          const serverData = server.server_data || [];
          if (!serverData.length) continue;

          // Target episode matching
          let targetEp = null;
          if (isMovie || episode == null) {
            targetEp = serverData[0];
          } else {
            const epNum = parseInt(episode, 10);
            targetEp = serverData.find((ep) => {
              const nameNum = parseInt(String(ep.name).replace(/\D+/g, ''), 10);
              const slugNum = parseInt(String(ep.slug).replace(/\D+/g, ''), 10);
              return nameNum === epNum || slugNum === epNum || String(ep.name) === String(episode);
            });
            if (!targetEp && !isNaN(epNum) && epNum >= 1 && epNum <= serverData.length) {
              targetEp = serverData[epNum - 1];
            }
          }

          if (!targetEp || !targetEp.link_embed) continue;

          // Derive Master 4K M3U8
          const m3u8Url = this.deriveMasterM3u8(targetEp.link_embed) || targetEp.link_embed;
          const subtitles = await this.extractSubtitles(targetEp.link_embed);

          // Audio Classification
          let audioLabel = 'Vietsub';
          let bingeSuffix = 'vietsub';
          if (/thuy[ếe]t\s*minh/i.test(rawServerName)) {
            audioLabel = 'Thuyết Minh';
            bingeSuffix = 'thuyetminh';
          } else if (/l[ồo]ng\s*ti[ếe]ng/i.test(rawServerName)) {
            audioLabel = 'Lồng Tiếng';
            bingeSuffix = 'longtieng';
          }

          const b64Url = Buffer.from(m3u8Url).toString('base64url');
          const b64Ref = Buffer.from('https://vsmov.com/').toString('base64url');
          const b64Origin = Buffer.from('https://vsmov.com').toString('base64url');

          const finalStreamUrl = proxyBase
            ? `${proxyBase}/hls/manifest.m3u8?url=${b64Url}&ref=${b64Ref}&origin=${b64Origin}`
            : m3u8Url;

          // Proxied WebVTT Subtitles
          const proxiedSubs = subtitles.map((sub) => ({
            id: sub.id,
            lang: sub.lang,
            url: proxyBase
              ? `${proxyBase}/hls/sub.vtt?url=${Buffer.from(sub.url).toString('base64url')}&ref=${b64Ref}`
              : sub.url
          }));

          const epLabel = targetEp.name ? (targetEp.name.startsWith('Tập') ? targetEp.name : `Tập ${targetEp.name}`) : (isMovie ? 'Full' : `Tập ${episode}`);

          streams.push({
            name: 'VIP Movies 🎬\n[4K Ultra HD] VSMOV',
            title: `${movie?.name || title} • ${epLabel}\n⚡ 4K UHD (3840x2160) • ${rawServerName} (${audioLabel})`,
            url: finalStreamUrl,
            behaviorHints: {
              notWebReady: false,
              bingeGroup: `vsmov-4k-${bingeSuffix}-${isMovie ? 'movie' : `ep-${episode}`}`,
              proxyHeaders: {
                request: {
                  'User-Agent': VSMOV_HEADERS['User-Agent'],
                  'Referer': VSMOV_HEADERS['Referer']
                }
              }
            },
            subtitles: proxiedSubs.length > 0 ? proxiedSubs : undefined
          });
        }

        if (streams.length > 0) break;
      }
    } catch (err) {
      console.warn('[VSMOV getStreams Error]:', err.message);
    }
    return streams;
  }
}

const vsmovProvider = new VSMOVProvider();

module.exports = {
  VSMOVProvider,
  vsmovProvider
};
module.exports.default = VSMOVProvider;
