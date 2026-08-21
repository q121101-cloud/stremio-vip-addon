'use strict';

const BaseProvider = require('./base');
const { PROVIDERS, TIMEOUTS } = require('../config');

// Vietnamese genre slug dictionary for KKPhim
const GENRE_MAP = {
  'Hành Động': 'hanh-dong',
  'Tình Cảm': 'tinh-cam',
  'Hài Hước': 'hai-huoc',
  'Cổ Trang': 'co-trang',
  'Tâm Lý': 'tam-ly',
  'Hình Sự': 'hinh-su',
  'Chiến Tranh': 'chien-tranh',
  'Thể Thao': 'the-thao',
  'Võ Thuật': 'vo-thuat',
  'Viễn Tưởng': 'vien-tuong',
  'Phiêu Lưu': 'phieu-luu',
  'Khoa Học': 'khoa-hoc',
  'Kinh Dị': 'kinh-di',
  'Âm Nhạc': 'am-nhac',
  'Thần Thoại': 'than-thoai',
  'Tài Liệu': 'tai-lieu',
  'Gia Đình': 'gia-dinh',
  'Chính Kịch': 'chinh-kich',
  'Bí Ẩn': 'bi-an',
  'Học Đường': 'hoc-duong',
  'Kinh Điển': 'kinh-dien',
  'Phim 18+': 'phim-18'
};

class KKPhimProvider extends BaseProvider {
  constructor(options = {}) {
    super({
      id: 'kkphim',
      name: 'kkphim',
      displayName: 'KKPhim',
      baseUrl: options.baseUrl || PROVIDERS.KKPHIM.BASE_URL,
      timeout: options.timeout || TIMEOUTS.DEFAULT,
      headers: {
        'Referer': PROVIDERS.KKPHIM.DEFAULT_REFERER,
        'Origin': 'https://player.phimapi.com',
        ...(options.headers || {})
      }
    });
    this.cdnImage = options.cdnImage || PROVIDERS.KKPHIM.CDN_IMAGE;
  }

  /**
   * Normalizes a raw movie item from KKPhim catalog / search API into Stremio Meta format.
   * @param {Object} item
   * @param {string} [fallbackType='movie']
   * @param {string} [cdnDomain]
   * @returns {Object|null}
   */
  normalizeMetaItem(item, fallbackType = 'movie', cdnDomain) {
    if (!item) return null;
    const cdn = cdnDomain || this.cdnImage;
    
    // Type detection: single -> movie, series/hoathinh/tvshows -> series
    let mediaType = fallbackType;
    if (item.type === 'single') {
      mediaType = 'movie';
    } else if (item.type === 'series' || item.type === 'hoathinh' || item.type === 'tvshows') {
      mediaType = 'series';
    }

    const releaseInfoParts = [];
    if (item.quality) releaseInfoParts.push(item.quality);
    if (item.lang) releaseInfoParts.push(item.lang);
    if (item.year) releaseInfoParts.push(item.year);

    const genres = Array.isArray(item.category)
      ? item.category.map(c => (typeof c === 'string' ? c : c.name || c.slug))
      : [];

    return {
      id: this.prefixId(item.slug),
      type: mediaType,
      name: item.name || item.origin_name,
      poster: this.formatImageUrl(item.poster_url, cdn),
      posterShape: 'poster',
      background: this.formatImageUrl(item.thumb_url, cdn),
      description: item.content ? item.content.replace(/<[^>]*>?/gm, '').trim() : (item.description || ''),
      releaseInfo: releaseInfoParts.join(' · ') || (item.year ? String(item.year) : undefined),
      genres,
      year: item.year ? parseInt(item.year, 10) : undefined,
      imdbId: item.imdb?.id || null,
      tmdbId: item.tmdb?.id ? String(item.tmdb.id) : null
    };
  }

  /**
   * Fetch catalog feed for KKPhim with pagination, genre, and search support.
   * @param {string} catalogId
   * @param {Object} [extra] - { genre, search, skip, page, limit }
   * @returns {Promise<{ metas: Array<Object> }>}
   */
  async getCatalog(catalogId, extra = {}) {
    const limit = extra.limit || 20;
    const skip = parseInt(extra.skip || 0, 10);
    const page = extra.page || Math.floor(skip / limit) + 1;

    // Handle search query within catalog
    if (extra.search) {
      return this.search(extra.search, { page, limit });
    }

    // Handle Genre filter
    if (extra.genre) {
      return this.getByGenre(extra.genre, { page, limit });
    }

    // Handle specific catalog categories
    let endpoint = '';
    let isV1 = true;
    let defaultType = 'movie';

    switch (catalogId) {
      case 'kkphim-phim-le':
      case 'kkphim-movie-latest':
      case 'phim-le':
        endpoint = `/v1/api/danh-sach/phim-le?page=${page}&limit=${limit}`;
        defaultType = 'movie';
        break;
      case 'kkphim-phim-bo':
      case 'kkphim-series-latest':
      case 'phim-bo':
        endpoint = `/v1/api/danh-sach/phim-bo?page=${page}&limit=${limit}`;
        defaultType = 'series';
        break;
      case 'kkphim-phim-chieu-rap':
      case 'phim-chieu-rap':
        endpoint = `/v1/api/danh-sach/phim-chieu-rap?page=${page}&limit=${limit}`;
        defaultType = 'movie';
        break;
      case 'kkphim-hoat-hinh':
      case 'hoat-hinh':
        endpoint = `/v1/api/danh-sach/hoat-hinh?page=${page}&limit=${limit}`;
        defaultType = 'series';
        break;
      case 'kkphim-phim-moi':
      case 'kkphim-phim-moi-cap-nhat':
      case 'phim-moi':
      case 'phim-moi-cap-nhat':
      default:
        endpoint = `/danh-sach/phim-moi-cap-nhat?page=${page}`;
        isV1 = false;
        break;
    }

    const data = await this.request(endpoint);
    if (!data) return { metas: [] };

    if (isV1) {
      const items = data?.data?.items || [];
      const cdn = data?.data?.APP_DOMAIN_CDN_IMAGE || this.cdnImage;
      const metas = items.map(item => this.normalizeMetaItem(item, defaultType, cdn)).filter(Boolean);
      return { metas };
    } else {
      // Latest update endpoint format
      const items = data.items || [];
      const metas = items.map(item => this.normalizeMetaItem(item, defaultType, this.cdnImage)).filter(Boolean);
      return { metas };
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
    const limit = extra.limit || 20;
    const page = extra.page || 1;
    const genreSlug = GENRE_MAP[genre] || this.normalizeSlug(genre);
    
    const data = await this.request(`/v1/api/the-loai/${genreSlug}?page=${page}&limit=${limit}`);
    if (data && data.data && Array.isArray(data.data.items)) {
      const cdn = data.data.APP_DOMAIN_CDN_IMAGE || this.cdnImage;
      const metas = data.data.items
        .map(item => this.normalizeMetaItem(item, 'movie', cdn))
        .filter(Boolean);
      return { metas };
    }
    return { metas: [] };
  }

  /**
   * Search KKPhim by title or keyword.
   * @param {string} query
   * @param {string|Object} [typeOrExtra='movie']
   * @returns {Promise<{ metas: Array<Object> }>}
   */
  async search(query, typeOrExtra = 'movie') {
    if (!query || typeof query !== 'string' || !query.trim()) {
      return { metas: [] };
    }
    const type = typeof typeOrExtra === 'string' ? typeOrExtra : (typeOrExtra?.type || 'movie');
    const limit = (typeof typeOrExtra === 'object' && typeOrExtra.limit) || 20;
    const page = (typeof typeOrExtra === 'object' && typeOrExtra.page) || 1;

    const keyword = encodeURIComponent(query.trim());
    const data = await this.request(`/v1/api/tim-kiem?keyword=${keyword}&page=${page}&limit=${limit}`);
    if (data && data.data && Array.isArray(data.data.items)) {
      const cdn = data.data.APP_DOMAIN_CDN_IMAGE || this.cdnImage;
      const metas = data.data.items
        .map(item => this.normalizeMetaItem(item, type, cdn))
        .filter(Boolean);
      return { metas };
    }
    return { metas: [] };
  }

  /**
   * Fetch detailed metadata and video/episode list for Stremio /meta route.
   * @param {string} typeOrId - 'movie' | 'series' or raw ID/slug
   * @param {string} [idMaybe] - Optional ID/slug when type is first arg
   * @returns {Promise<{ meta: Object }>}
   */
  async getDetail(typeOrId, idMaybe) {
    const type = idMaybe !== undefined ? typeOrId : 'movie';
    const id = idMaybe !== undefined ? idMaybe : typeOrId;
    const slug = this.cleanSlug(id);
    if (!slug) return { meta: null };

    const data = await this.request(`/phim/${slug}`);
    if (!data || !data.status || !data.movie) {
      return { meta: null };
    }

    const movie = data.movie;
    const episodes = data.episodes || [];
    const mediaType = movie.type === 'series' || movie.type === 'hoathinh' || movie.type === 'tvshows' ? 'series' : 'movie';

    // Construct videos list for multi-episode series
    const videos = [];
    if (mediaType === 'series' && episodes.length > 0) {
      // Pick first server as canonical index for episodes
      const primaryServer = episodes[0];
      if (primaryServer && Array.isArray(primaryServer.server_data)) {
        primaryServer.server_data.forEach((ep, idx) => {
          const numMatch = ep.name ? ep.name.match(/\d+/) : null;
          const epNum = numMatch ? parseInt(numMatch[0], 10) : idx + 1;
          videos.push({
            id: `kkphim:${movie.slug}:1:${epNum}`,
            title: ep.name || `Tập ${epNum}`,
            season: 1,
            episode: epNum,
            released: movie.modified?.time || new Date().toISOString()
          });
        });
      }
    }

    const meta = {
      id: this.prefixId(movie.slug),
      type: mediaType,
      name: movie.name || movie.origin_name,
      genres: Array.isArray(movie.category) ? movie.category.map(c => (typeof c === 'string' ? c : c.name || c.slug)) : [],
      poster: this.formatImageUrl(movie.poster_url, this.cdnImage),
      posterShape: 'poster',
      background: this.formatImageUrl(movie.thumb_url, this.cdnImage),
      description: movie.content ? movie.content.replace(/<[^>]*>?/gm, '').trim() : '',
      releaseInfo: `${movie.quality || 'FHD'} · ${movie.lang || 'Vietsub'} · ${movie.year || ''}`.trim(),
      year: movie.year ? parseInt(movie.year, 10) : undefined,
      director: Array.isArray(movie.director) ? movie.director : (movie.director ? [movie.director] : []),
      cast: Array.isArray(movie.actor) ? movie.actor : (movie.actor ? [movie.actor] : []),
      runtime: movie.time || '',
      country: Array.isArray(movie.country) ? movie.country.map(c => (typeof c === 'string' ? c : c.name)).join(', ') : '',
      imdbId: movie.imdb?.id || null,
      tmdbId: movie.tmdb?.id ? String(movie.tmdb.id) : null,
      videos: videos.length > 0 ? videos : undefined
    };

    return { meta };
  }

  /**
   * Resolves direct M3U8 streams with proxy wrapping and audio track classification.
   * @param {Object} params
   * @param {string} params.type - 'movie' or 'series'
   * @param {string} [params.id]
   * @param {string} [params.imdbId]
   * @param {string} [params.title]
   * @param {Array<string>} [params.aliases]
   * @param {number} [params.season]
   * @param {number} [params.episode]
   * @param {string} [params.proxyBase]
   * @returns {Promise<Array<Object>>}
   */
  async getStreams({ type = 'movie', id, imdbId, title, aliases = [], season = 1, episode = 1, slug: rawSlug, proxyBase = '' } = {}) {
    let slug = this.cleanSlug(id || rawSlug);
    let targetEpisode = parseInt(episode, 10) || 1;

    // Check if ID contains embedded season/episode (e.g., kkphim:cuu-mon:1:3)
    if (id && id.includes(':')) {
      const se = this.extractSeasonEpisode(id);
      targetEpisode = se.episode;
    }

    // If direct slug is not provided, perform search matching
    if (!slug) {
      const searchTerms = [title, ...aliases].filter(Boolean);
      for (const term of searchTerms) {
        const searchRes = await this.search(term, type);
        if (searchRes.metas && searchRes.metas.length > 0) {
          slug = this.cleanSlug(searchRes.metas[0].id);
          break;
        }
      }
    }

    if (!slug) return [];

    // Fetch movie details & episode servers with bounded STREAM timeout
    const data = await this.request(`/phim/${slug}`, { timeout: TIMEOUTS.STREAM });
    if (!data || !data.status || !data.movie || !Array.isArray(data.episodes)) {
      return [];
    }

    const movie = data.movie;
    const episodes = data.episodes;
    const streams = [];

    // Iterate through all server audio streams (Vietsub, Thuyết Minh, Lồng Tiếng)
    for (let sIdx = 0; sIdx < episodes.length; sIdx++) {
      const server = episodes[sIdx];
      const serverName = server.server_name || `Server ${sIdx + 1}`;
      const serverData = server.server_data || [];

      // Determine audio track label
      let audioTag = 'Vietsub';
      let audioSlug = 'vietsub';
      if (/thuy[ếe]t\s*minh/i.test(serverName)) {
        audioTag = 'Thuyết Minh';
        audioSlug = 'thuyetminh';
      } else if (/l[ồo]ng\s*ti[ếe]ng/i.test(serverName)) {
        audioTag = 'Lồng Tiếng';
        audioSlug = 'longtieng';
      }

      // Find the episode item
      let epItem = null;
      if (type === 'movie' || movie.type === 'single') {
        epItem = serverData.find(e => /full/i.test(e.name || e.slug)) || serverData[0];
      } else {
        // Series: Match exact episode number
        epItem = serverData.find(e => {
          const numMatch = (e.name || e.slug || '').match(/\d+/);
          const num = numMatch ? parseInt(numMatch[0], 10) : null;
          return num === targetEpisode;
        });
        if (!epItem && targetEpisode >= 1 && targetEpisode <= serverData.length) {
          epItem = serverData[targetEpisode - 1];
        }
      }

      if (!epItem) continue;

      // Extract raw M3U8
      let rawM3u8 = epItem.link_m3u8;
      if (!rawM3u8 && epItem.link_embed) {
        const match = epItem.link_embed.match(/url=([^&]+)/);
        if (match) rawM3u8 = decodeURIComponent(match[1]);
      }

      if (!rawM3u8) continue;

      // Build Proxy Stream URL with anti-403 Referer
      const streamUrl = this.buildProxyStreamUrl(
        rawM3u8,
        PROVIDERS.KKPHIM.DEFAULT_REFERER,
        proxyBase,
        'https://player.phimapi.com'
      );

      const quality = movie.quality || 'FHD 1080p';
      const epLabel = epItem.name || (type === 'movie' ? 'Full' : `Tập ${targetEpisode}`);

      streams.push({
        name: `VIP Movies 🎬\n[${quality}] KKPhim`,
        title: `${movie.name} • ${epLabel}\n⚡ ${serverName} (${audioTag}) • Direct HLS`,
        url: streamUrl,
        behaviorHints: {
          notWebReady: false,
          bingeGroup: `kkphim-${audioSlug}-${type === 'movie' ? 'movie' : `ep-${targetEpisode}`}`,
          proxyHeaders: {
            request: {
              'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
              'Referer': PROVIDERS.KKPHIM.DEFAULT_REFERER
            }
          }
        }
      });
    }

    return streams;
  }
}

const kkphimProvider = new KKPhimProvider();

module.exports = {
  KKPhimProvider,
  kkphimProvider,
  GENRE_MAP
};
module.exports.default = KKPhimProvider;
