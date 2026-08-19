'use strict';

/**
 * ============================================================
 *  VIP Movies Addon — src/providers/base.js
 *  Base Provider Class & Resilient HTTP Client
 * ============================================================
 */

const axios = require('axios');
const { USER_AGENT_CHROME, TIMEOUT } = require('../config/constants');
const {
  scoreMatch,
  normalizeText,
  escapeRegExp,
  safeExtra,
  safeSlug,
  safeKeyword,
  safePage,
  extractSeasonNumber,
  isSeasonMatch,
  generateSearchKeywords,
  matchEpisodeItem,
} = require('../lib/utils');

class BaseProvider {
  /**
   * @param {string} id - Provider ID (e.g. 'vsmov', 'kkphim', 'nguonc')
   * @param {string} name - Human readable name
   * @param {string} baseUrl - Base API URL
   */
  constructor(id, name, baseUrl) {
    this.id = id;
    this.name = name;
    this.baseUrl = baseUrl;
    this.timeout = TIMEOUT.PROVIDER;

    // Resilient HTTP Client Instance
    this.http = axios.create({
      baseURL: this.baseUrl,
      timeout: this.timeout,
      headers: {
        'User-Agent': USER_AGENT_CHROME,
        'Accept': 'application/json, text/plain, */*',
        'Accept-Language': 'vi-VN,vi;q=0.9,en-US;q=0.8,en;q=0.7',
      },
      maxRedirects: 5,
    });
  }

  // Common utilities available to all subclasses
  normalize(str) {
    return normalizeText(str);
  }

  score(targetTitle, candidateTitle, targetYear, candidateYear) {
    return scoreMatch(targetTitle, candidateTitle, targetYear, candidateYear);
  }

  generateKeywords(title, aliases, year) {
    return generateSearchKeywords(title, aliases, year);
  }

  matchEpisode(serverData, targetEp) {
    return matchEpisodeItem(serverData, targetEp);
  }

  /**
   * Fetch with custom timeout & retry
   * @param {string} url
   * @param {object} [config={}]
   * @returns {Promise<any>}
   */
  async request(url, config = {}) {
    try {
      const res = await this.http.get(url, {
        timeout: this.timeout,
        ...config,
      });
      return res.data;
    } catch (err) {
      const status = err.response ? err.response.status : 'ERR';
      console.warn(`[${this.name}] Request failed (${status}): ${url} — ${err.message}`);
      throw err;
    }
  }

  /**
   * Subclasses must implement getCatalog
   */
  async getCatalog(type, id, extra, page = 1) {
    throw new Error(`[${this.name}] getCatalog not implemented`);
  }

  /**
   * Subclasses must implement getDetail
   */
  async getDetail(slug) {
    throw new Error(`[${this.name}] getDetail not implemented`);
  }

  /**
   * Subclasses must implement getStreams
   */
  async getStreams(payload) {
    throw new Error(`[${this.name}] getStreams not implemented`);
  }

  /**
   * Subclasses must implement search
   */
  async search(keyword, type) {
    throw new Error(`[${this.name}] search not implemented`);
  }
}

module.exports = {
  BaseProvider,
  scoreMatch,
  normalizeText,
  escapeRegExp,
  safeExtra,
  safeSlug,
  safeKeyword,
  safePage,
  extractSeasonNumber,
  isSeasonMatch,
  generateSearchKeywords,
  matchEpisodeItem,
};
