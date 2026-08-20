'use strict';

const axios = require('axios');
const { TIMEOUTS } = require('../config');

class BaseProvider {
  /**
   * @param {Object} options
   * @param {string} [options.id] - Unique provider identifier ('kkphim', 'vsmov', 'nguonc')
   * @param {string} [options.name] - Provider identifier or name
   * @param {string} [options.displayName] - Human readable name ('KKPhim', 'VSMOV 4K', 'NguonC')
   * @param {string} options.baseUrl - Base API URL
   * @param {number} [options.timeout] - Request timeout in ms
   * @param {Object} [options.headers] - Default HTTP headers
   */
  constructor({ id, name, displayName, baseUrl, timeout = TIMEOUTS.DEFAULT, headers = {} } = {}) {
    this.id = id || name || 'base';
    this.name = name || this.id;
    this.displayName = displayName || this.name;
    this.baseUrl = (baseUrl || '').replace(/\/+$/, '');
    this.timeout = timeout;
    this.headers = {
      'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
      'Accept': 'application/json, text/plain, */*',
      ...headers
    };

    this.client = axios.create({
      baseURL: this.baseUrl || undefined,
      timeout: this.timeout,
      headers: this.headers
    });
  }

  /**
   * Clean provider prefix from ID to get the pure slug.
   * e.g., "kkphim_cuu-mon" -> "cuu-mon", "kkphim:cuu-mon:1:2" -> "cuu-mon"
   * @param {string} id
   * @returns {string}
   */
  cleanSlug(id) {
    if (!id || typeof id !== 'string') return '';
    let clean = id.trim();
    const prefixRegex = new RegExp(`^(${this.id}|${this.name}|kkphim|vsmov|nguonc)[:_]`, 'i');
    clean = clean.replace(prefixRegex, '');
    if (clean.includes(':')) {
      clean = clean.split(':')[0];
    }
    return clean.trim();
  }

  /**
   * Add provider prefix namespace to a slug.
   * @param {string} slug
   * @returns {string}
   */
  prefixId(slug) {
    if (!slug) return '';
    const clean = this.cleanSlug(slug);
    return `${this.id}_${clean}`;
  }

  /**
   * Helper to normalize Vietnamese search keywords and titles to slug format
   * @param {string} str
   * @returns {string}
   */
  normalizeSlug(str) {
    if (!str || typeof str !== 'string') return '';
    return str
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/đ/g, 'd')
      .replace(/[^a-z0-9\s-]/g, '')
      .trim()
      .replace(/\s+/g, '-');
  }

  /**
   * Safely formats and resolves relative image URLs.
   * @param {string} url
   * @param {string} [cdnBase]
   * @returns {string|undefined}
   */
  formatImageUrl(url, cdnBase) {
    if (!url || typeof url !== 'string') return undefined;
    if (url.startsWith('http://') || url.startsWith('https://')) return url;
    const base = (cdnBase || this.baseUrl || '').replace(/\/+$/, '');
    const cleanPath = url.replace(/^\/+/, '');
    return `${base}/${cleanPath}`;
  }

  /**
   * Extract season and episode numbers from compound IDs or strings.
   * Handles "tt1234567:1:5", "kkphim:slug:1:5", "Tập 05", "Ep 5", "S01E05"
   * @param {string} str
   * @returns {{ season: number, episode: number }}
   */
  extractSeasonEpisode(str) {
    if (!str || typeof str !== 'string') return { season: 1, episode: 1 };
    
    // Pattern 1: id format ":season:episode"
    const colonParts = str.split(':');
    if (colonParts.length >= 3) {
      const s = parseInt(colonParts[colonParts.length - 2], 10);
      const e = parseInt(colonParts[colonParts.length - 1], 10);
      if (!isNaN(s) && !isNaN(e)) {
        return { season: s, episode: e };
      }
    }

    // Pattern 2: S01E05 / s1e5
    const seMatch = str.match(/s(\d+)\s*e(\d+)/i);
    if (seMatch) {
      return { season: parseInt(seMatch[1], 10), episode: parseInt(seMatch[2], 10) };
    }

    // Pattern 3: Tập 5 / Ep 5 / Tap 5 / 5
    const epMatch = str.match(/(?:tập|ep|tap|episode)\s*(\d+)/i) || str.match(/^(\d+)$/);
    if (epMatch) {
      return { season: 1, episode: parseInt(epMatch[1], 10) };
    }

    return { season: 1, episode: 1 };
  }

  /**
   * Helper to build a standard Anti-403 HLS Proxy URL for video streams.
   * @param {string} streamUrl - Target M3U8 URL
   * @param {string} [referer] - Upstream Referer header
   * @param {string} [proxyBase] - Public Proxy Base URL
   * @param {string} [origin] - Upstream Origin header
   * @param {string} [subUrl] - Optional VTT Subtitle URL
   * @returns {string}
   */
  buildProxyStreamUrl(streamUrl, referer, proxyBase = '', origin, subUrl) {
    if (!streamUrl) return '';
    if (!proxyBase) return streamUrl;
    const b64Url = Buffer.from(streamUrl).toString('base64url');
    const b64Ref = referer ? Buffer.from(referer).toString('base64url') : '';
    let result = `${proxyBase}/hls/manifest.m3u8?url=${b64Url}&ref=${b64Ref}`;
    if (origin) {
      result += `&origin=${Buffer.from(origin).toString('base64url')}`;
    }
    if (subUrl) {
      result += `&sub=${Buffer.from(subUrl).toString('base64url')}`;
    }
    return result;
  }

  /**
   * Safe HTTP GET wrapper with bounded timeout and fail-soft error handling.
   * @param {string} endpoint
   * @param {import('axios').AxiosRequestConfig} [config]
   * @returns {Promise<any|null>}
   */
  async request(endpoint, config = {}) {
    try {
      const url = endpoint.startsWith('http://') || endpoint.startsWith('https://')
        ? endpoint
        : `${this.baseUrl}/${endpoint.replace(/^\/+/, '')}`;
      const response = await axios.get(url, {
        timeout: this.timeout,
        headers: this.headers,
        ...config
      });
      return response.data;
    } catch (err) {
      if (err.response?.status === 404) {
        return null;
      }
      console.warn(`[${this.displayName}] Request failed for ${endpoint}:`, err.message);
      return null;
    }
  }

  /**
   * @param {string} catalogId
   * @param {Object} [extra] - { genre, search, skip }
   * @returns {Promise<{ metas: Array<Object> }>}
   */
  async getCatalog(catalogId, extra = {}) {
    throw new Error(`getCatalog() must be implemented by ${this.constructor.name}`);
  }

  /**
   * @param {string} type - 'movie' or 'series'
   * @param {string} id - Provider ID or slug
   * @returns {Promise<{ meta: Object }>}
   */
  async getDetail(type, id) {
    throw new Error(`getDetail() must be implemented by ${this.constructor.name}`);
  }

  /**
   * @param {Object} params
   * @param {string} params.type - 'movie' or 'series'
   * @param {string} [params.id] - Media ID / slug
   * @param {string} [params.imdbId] - International IMDb ID
   * @param {string} [params.title] - Media Title
   * @param {Array<string>} [params.aliases] - Alternate titles
   * @param {number} [params.season] - Target Season (for series)
   * @param {number} [params.episode] - Target Episode (for series)
   * @param {string} [params.proxyBase] - Public Addon URL for HLS Proxy
   * @returns {Promise<Array<Object>>}
   */
  async getStreams(params) {
    throw new Error(`getStreams() must be implemented by ${this.constructor.name}`);
  }

  /**
   * @param {string} query
   * @param {string|Object} [typeOrExtra]
   * @returns {Promise<{ metas: Array<Object> }>}
   */
  async search(query, typeOrExtra) {
    throw new Error(`search() must be implemented by ${this.constructor.name}`);
  }
}

module.exports = BaseProvider;
module.exports.BaseProvider = BaseProvider;
