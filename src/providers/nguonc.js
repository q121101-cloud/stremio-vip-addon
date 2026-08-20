'use strict';

const axios = require('axios');
const BaseProvider = require('./base');
const { PROVIDERS, TIMEOUTS } = require('../config');

const NGUONC_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  'Referer': 'https://phim.nguonc.com/',
  'Accept': 'application/json, text/plain, */*'
};

class NguonCProvider extends BaseProvider {
  constructor(options = {}) {
    super({
      id: 'nguonc',
      name: 'nguonc',
      displayName: 'NguonC',
      baseUrl: options.baseUrl || PROVIDERS.NGUONC.BASE_URL,
      timeout: options.timeout || TIMEOUTS.DEFAULT,
      headers: {
        ...NGUONC_HEADERS,
        ...(options.headers || {})
      }
    });
    this.isVercel = !!(process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME);
    this.proxyBackendUrl = process.env.RENDER_BACKEND_URL || process.env.RENDER_EXTERNAL_URL || process.env.PROXY_URL || '';
  }

  /**
   * Safe HTTP request with proactive & reactive Vercel Cloudflare proxy fallback
   * @param {string} endpoint
   * @param {Object} [config]
   * @returns {Promise<any|null>}
   */
  async request(endpoint, config = {}) {
    const url = endpoint.startsWith('http://') || endpoint.startsWith('https://')
      ? endpoint
      : `${this.baseUrl}/${endpoint.replace(/^\/+/, '')}`;
    const headers = { ...this.headers, ...(config.headers || {}) };
    const timeout = config.timeout || this.timeout;

    // Proactive proxy routing on Vercel
    if (this.isVercel && this.proxyBackendUrl && !url.startsWith(this.proxyBackendUrl)) {
      try {
        const proxiedUrl = `${this.proxyBackendUrl}/api/proxy?url=${encodeURIComponent(url)}`;
        const res = await axios.get(proxiedUrl, { headers, timeout });
        return res.data;
      } catch (proxyErr) {
        // Fallback to direct request if proxy fails
      }
    }

    try {
      const res = await axios.get(url, { headers, timeout, ...config });
      return res.data;
    } catch (err) {
      // Reactive fallback: If direct request blocked by Cloudflare (403), retry via proxy
      if (err.response?.status === 403 && this.proxyBackendUrl && !url.startsWith(this.proxyBackendUrl)) {
        try {
          const proxiedUrl = `${this.proxyBackendUrl}/api/proxy?url=${encodeURIComponent(url)}`;
          const res = await axios.get(proxiedUrl, { headers, timeout });
          return res.data;
        } catch (retryErr) {}
      }
      if (err.response?.status === 404 || err.response?.status === 422) {
        return null;
      }
      console.warn(`[NguonC] Request failed for ${endpoint}:`, err.message);
      return null;
    }
  }

  /**
   * Dean Edwards Unpacker for obfuscated JavaScript
   * @param {string} packedCode
   * @returns {string}
   */
  unpackDeanEdwards(packedCode) {
    if (!packedCode || typeof packedCode !== 'string') return '';
    const match = packedCode.match(/eval\(function\(p,a,c,k,e,d\)[\s\S]*?\}\('([\s\S]*?)',(\d+),(\d+),'([\s\S]*?)'\.split\('\|'\)/);
    if (!match) return packedCode;

    let [, p, a, c, k] = match;
    a = parseInt(a, 10);
    c = parseInt(c, 10);
    const keyArray = k.split('|');

    const eFunc = (cVal) => (cVal < a ? '' : eFunc(Math.floor(cVal / a))) + ((cVal = cVal % a) > 35 ? String.fromCharCode(cVal + 29) : cVal.toString(36));

    while (c--) {
      if (keyArray[c]) {
        p = p.replace(new RegExp('\\b' + eFunc(c) + '\\b', 'g'), keyArray[c]);
      }
    }
    return p;
  }

  /**
   * StreamC `data-obf` Base64 JSON & Dean Edwards de-obfuscation engine
   * @param {string} embedUrl
   * @returns {Promise<{ m3u8Url: string, referer: string, origin: string }|null>}
   */
  async extractStreamC(embedUrl) {
    if (!embedUrl) return null;
    try {
      const embedOrigin = new URL(embedUrl).origin;
      const res = await axios.get(embedUrl, {
        headers: {
          'User-Agent': NGUONC_HEADERS['User-Agent'],
          'Referer': 'https://phim.nguonc.com/',
          'Origin': 'https://phim.nguonc.com'
        },
        timeout: 4000
      });

      const html = res.data;
      if (typeof html !== 'string') return null;

      // 1. Primary: data-obf attribute Base64 JSON
      const obfMatch = html.match(/data-obf=["']([^"']+)["']/i);
      if (obfMatch) {
        try {
          const decodedOuter = JSON.parse(Buffer.from(obfMatch[1], 'base64').toString('utf8'));
          if (decodedOuter.sUb) {
            return {
              m3u8Url: `${embedOrigin}/${decodedOuter.sUb}`,
              referer: `${embedOrigin}/`,
              origin: embedOrigin
            };
          }
        } catch (e) {}
      }

      // 2. Fallback: Dean Edwards unpacker
      if (html.includes('eval(function(p,a,c,k,e,d)')) {
        const unpacked = this.unpackDeanEdwards(html);
        const subMatch = unpacked.match(/["'](eyJoIjoi[^"']+)["']/);
        if (subMatch) {
          return {
            m3u8Url: `${embedOrigin}/${subMatch[1]}`,
            referer: `${embedOrigin}/`,
            origin: embedOrigin
          };
        }
        const m3u8Match = unpacked.match(/(https?:\/\/[^"'\s\)]+\.m3u8[^"'\s\)]*)/i);
        if (m3u8Match) {
          return {
            m3u8Url: m3u8Match[1],
            referer: `${embedOrigin}/`,
            origin: embedOrigin
          };
        }
      }

      // 3. Fallback: Direct regex on HTML body
      const directM3u8 = html.match(/(https?:\/\/[^"'\s\)]+\.m3u8[^"'\s\)]*)/i);
      if (directM3u8) {
        return {
          m3u8Url: directM3u8[1],
          referer: `${embedOrigin}/`,
          origin: embedOrigin
        };
      }
    } catch (e) {}

    return null;
  }

  /**
   * Stremio Catalog Feeds with 422 boundary protection
   * @param {string} [catalogId='nguonc-movie-latest']
   * @param {Object} [extra]
   * @returns {Promise<{ metas: Array<Object> }>}
   */
  async getCatalog(catalogId = 'nguonc-movie-latest', extra = {}) {
    const limit = extra.limit || 10;
    const skip = parseInt(extra.skip || 0, 10);
    const page = extra.page || Math.max(1, Math.floor(skip / limit) + 1);
    const search = extra.search ? extra.search.trim() : '';

    if (search) {
      return this.search(search, { page, limit });
    }

    if (extra.genre) {
      return this.getByGenre(extra.genre, { page, limit });
    }

    let endpoint = '/films/phim-moi-cap-nhat';
    if (catalogId === 'nguonc-movie-latest' || catalogId === 'nguonc-phim-le' || catalogId === 'phim-le') {
      endpoint = '/films/danh-sach/phim-le';
    } else if (catalogId === 'nguonc-series-latest' || catalogId === 'nguonc-phim-bo' || catalogId === 'phim-bo') {
      endpoint = '/films/danh-sach/phim-bo';
    } else if (catalogId === 'nguonc-cinema-latest' || catalogId === 'nguonc-phim-chieu-rap' || catalogId === 'phim-chieu-rap') {
      endpoint = '/films/danh-sach/phim-chieu-rap';
    } else if (catalogId === 'nguonc-anime-latest' || catalogId === 'nguonc-hoat-hinh' || catalogId === 'hoat-hinh') {
      endpoint = '/films/danh-sach/hoat-hinh';
    }

    try {
      const data = await this.request(`${endpoint}?page=${page}`);
      const items = data?.items || data?.data?.items || [];

      const metas = items.map((item) => {
        const isSeries = item.total_episodes > 1 || (item.current_episode && item.current_episode !== 'FULL' && item.current_episode !== 'Full');
        return {
          id: this.prefixId(item.slug),
          type: isSeries ? 'series' : 'movie',
          name: item.name || item.original_name,
          poster: item.poster_url || item.thumb_url,
          posterShape: 'poster',
          background: item.thumb_url || item.poster_url,
          description: item.description ? item.description.replace(/<[^>]*>?/gm, '').trim() : `Xem phim ${item.name} trên NguonC`,
          releaseInfo: item.year ? `${item.year} · FHD` : 'FHD',
          genres: Array.isArray(item.category)
            ? item.category.map((c) => (typeof c === 'string' ? c : c.name || c.slug))
            : ['NguonC', 'HD'],
          year: item.year ? parseInt(item.year, 10) : undefined
        };
      });

      return { metas };
    } catch (err) {
      return { metas: [] };
    }
  }

  /**
   * Fetch items filtered by Vietnamese genre
   * @param {string} genre
   * @param {Object} [extra]
   * @returns {Promise<{ metas: Array<Object> }>}
   */
  async getByGenre(genre, extra = {}) {
    if (!genre) return { metas: [] };
    const page = extra.page || 1;
    const genreSlug = this.normalizeSlug(genre);

    try {
      const data = await this.request(`/films/the-loai/${genreSlug}?page=${page}`);
      const items = data?.items || data?.data?.items || [];

      const metas = items.map((item) => {
        const isSeries = item.total_episodes > 1 || (item.current_episode && item.current_episode !== 'FULL' && item.current_episode !== 'Full');
        return {
          id: this.prefixId(item.slug),
          type: isSeries ? 'series' : 'movie',
          name: item.name || item.original_name,
          poster: item.poster_url || item.thumb_url,
          posterShape: 'poster',
          background: item.thumb_url || item.poster_url,
          description: item.description ? item.description.replace(/<[^>]*>?/gm, '').trim() : `Xem phim ${item.name} trên NguonC`,
          releaseInfo: item.year ? `${item.year} · FHD` : 'FHD',
          genres: Array.isArray(item.category)
            ? item.category.map((c) => (typeof c === 'string' ? c : c.name || c.slug))
            : [genre, 'NguonC'],
          year: item.year ? parseInt(item.year, 10) : undefined
        };
      });

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
      const data = await this.request(`/films/search?keyword=${encodeURIComponent(query.trim())}&page=${page}`);
      const items = data?.items || data?.data?.items || [];

      const metas = items.map((item) => {
        const isSeries = item.total_episodes > 1 || (item.current_episode && item.current_episode !== 'FULL' && item.current_episode !== 'Full');
        return {
          id: this.prefixId(item.slug),
          type: isSeries ? 'series' : 'movie',
          name: item.name || item.original_name,
          poster: item.poster_url || item.thumb_url,
          posterShape: 'poster',
          background: item.thumb_url || item.poster_url,
          description: item.description ? item.description.replace(/<[^>]*>?/gm, '').trim() : `Xem phim ${item.name} trên NguonC`,
          releaseInfo: item.year ? String(item.year) : 'HD',
          genres: ['NguonC', 'HD'],
          year: item.year ? parseInt(item.year, 10) : undefined
        };
      });

      return { metas };
    } catch (err) {
      return { metas: [] };
    }
  }

  /**
   * Detail Resolver
   * @param {string} typeOrId
   * @param {string} [idMaybe]
   * @returns {Promise<{ meta: Object, movie?: Object }>}
   */
  async getDetail(typeOrId, idMaybe) {
    const type = idMaybe !== undefined ? typeOrId : 'movie';
    const id = idMaybe !== undefined ? idMaybe : typeOrId;
    const cleanSlug = this.cleanSlug(id);
    if (!cleanSlug) return { meta: null };

    try {
      const data = await this.request(`/film/${cleanSlug}`);
      if (!data || (!data.movie && data.status !== 'success')) {
        return { meta: null };
      }

      const movie = data.movie || data;
      const isSeries = movie.total_episodes > 1 || (movie.current_episode && movie.current_episode !== 'FULL' && movie.current_episode !== 'Full');
      const mediaType = isSeries ? 'series' : type;

      const videos = [];
      if (mediaType === 'series' && Array.isArray(movie.episodes) && movie.episodes.length > 0) {
        const primaryServer = movie.episodes[0];
        const items = primaryServer.items || [];
        items.forEach((ep, idx) => {
          const numMatch = ep.name ? String(ep.name).match(/\d+/) : null;
          const epNum = numMatch ? parseInt(numMatch[0], 10) : idx + 1;
          videos.push({
            id: `nguonc:${movie.slug}:1:${epNum}`,
            title: ep.name ? (ep.name.startsWith('Tập') ? ep.name : `Tập ${ep.name}`) : `Tập ${epNum}`,
            season: 1,
            episode: epNum,
            released: new Date().toISOString()
          });
        });
      }

      const meta = {
        id: this.prefixId(movie.slug),
        type: mediaType,
        name: movie.name || movie.original_name,
        genres: Array.isArray(movie.category) ? movie.category.map((c) => (typeof c === 'string' ? c : c.name || c.slug)) : ['NguonC', 'HD'],
        poster: movie.poster_url || movie.thumb_url,
        posterShape: 'poster',
        background: movie.thumb_url || movie.poster_url,
        description: movie.description ? movie.description.replace(/<[^>]*>?/gm, '').trim() : `Xem phim ${movie.name} trên NguonC`,
        releaseInfo: `${movie.quality || 'FHD'} · ${movie.language || 'Vietsub'} · ${movie.year || ''}`.trim(),
        year: movie.year ? parseInt(movie.year, 10) : undefined,
        director: Array.isArray(movie.director) ? movie.director : (movie.director ? [movie.director] : []),
        cast: Array.isArray(movie.casts) ? movie.casts : (Array.isArray(movie.actor) ? movie.actor : (movie.casts ? [movie.casts] : [])),
        runtime: movie.time || movie.duration || '',
        country: Array.isArray(movie.country) ? movie.country.map((c) => (typeof c === 'string' ? c : c.name)).join(', ') : '',
        videos: videos.length > 0 ? videos : undefined
      };

      return { meta, movie };
    } catch (err) {
      return { meta: null };
    }
  }

  /**
   * Stream Resolver with StreamC De-obfuscation & Anti-403 Proxy
   * @param {Object} params
   * @returns {Promise<Array<Object>>}
   */
  async getStreams({ imdbId, type = 'movie', title, aliases = [], season = 1, episode = 1, id, slug, proxyBase = '' } = {}) {
    const streams = [];
    try {
      let candidateSlugs = [];
      const directSlug = this.cleanSlug(id || slug);
      if (directSlug) candidateSlugs.push(directSlug);

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
        const film = detail?.movie;
        if (!film || !Array.isArray(film.episodes)) continue;

        const isMovie = type === 'movie' || film.total_episodes === 1 || film.current_episode === 'FULL' || film.current_episode === 'Full';

        for (const server of film.episodes) {
          const rawServerName = server.server_name || 'VIP 3';
          const items = server.items || [];
          if (!items.length) continue;

          // Match episode
          let targetEp = null;
          if (isMovie || episode == null) {
            targetEp = items[0];
          } else {
            const epNum = parseInt(episode, 10);
            targetEp = items.find((it) => {
              const nameNum = parseInt(String(it.name).replace(/\D+/g, ''), 10);
              const slugNum = parseInt(String(it.slug).replace(/\D+/g, ''), 10);
              return nameNum === epNum || slugNum === epNum || String(it.name) === String(episode);
            });
            if (!targetEp && !isNaN(epNum) && epNum >= 1 && epNum <= items.length) {
              targetEp = items[epNum - 1];
            }
          }

          if (!targetEp || (!targetEp.embed && !targetEp.m3u8)) continue;

          let finalM3u8 = targetEp.m3u8 || null;
          let referer = 'https://phim.nguonc.com/';
          let origin = 'https://phim.nguonc.com';

          if (targetEp.embed) {
            const extracted = await this.extractStreamC(targetEp.embed);
            if (extracted) {
              finalM3u8 = extracted.m3u8Url;
              referer = extracted.referer;
              origin = extracted.origin;
            } else {
              // Pass embed URL directly into HLS proxy for on-the-fly de-obfuscation
              finalM3u8 = targetEp.embed;
              try {
                const embedOrigin = new URL(targetEp.embed).origin;
                referer = `${embedOrigin}/`;
                origin = embedOrigin;
              } catch (e) {}
            }
          }

          if (!finalM3u8) continue;

          const b64Url = Buffer.from(finalM3u8).toString('base64url');
          const b64Ref = Buffer.from(referer).toString('base64url');
          const b64Origin = Buffer.from(origin).toString('base64url');

          const finalStreamUrl = proxyBase
            ? `${proxyBase}/hls/manifest.m3u8?url=${b64Url}&ref=${b64Ref}&origin=${b64Origin}`
            : finalM3u8;

          const epLabel = targetEp.name ? (targetEp.name.startsWith('Tập') ? targetEp.name : `Tập ${targetEp.name}`) : (isMovie ? 'Full' : `Tập ${episode}`);

          streams.push({
            name: 'VIP Movies 🎬\n[HD 1080p] NguonC',
            title: `${film.name || title} • ${epLabel}\n⚡ ${rawServerName} • Anti-403 Proxy (StreamC)`,
            url: finalStreamUrl,
            behaviorHints: {
              notWebReady: false,
              bingeGroup: `nguonc-hd-vietsub-${isMovie ? 'movie' : `ep-${episode}`}`,
              proxyHeaders: {
                request: {
                  'User-Agent': NGUONC_HEADERS['User-Agent'],
                  'Referer': referer
                }
              }
            }
          });
        }

        if (streams.length > 0) break;
      }
    } catch (err) {
      console.warn('[NguonC getStreams Error]:', err.message);
    }
    return streams;
  }
}

const nguoncProvider = new NguonCProvider();

module.exports = {
  NguonCProvider,
  nguoncProvider
};
module.exports.default = NguonCProvider;
