'use strict';

/**
 * ============================================================
 *  VIP Movies Addon — src/providers/base.js
 *  Base Provider Class & Resilient HTTP Client
 * ============================================================
 */

const axios = require('axios');
const { USER_AGENT_CHROME, TIMEOUTS } = require('../config/constants');
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
   * @param {string} name - Provider Name or ID
   * @param {string} [baseUrl=''] - Base API URL
   */
  constructor(name, baseUrl = '') {
    if (arguments.length >= 3) {
      this.id = arguments[0];
      this.name = arguments[1];
      this.baseUrl = arguments[2];
    } else {
      this.name = name;
      this.id = String(name || '').toLowerCase();
      this.baseUrl = baseUrl;
    }
    this.timeout = TIMEOUTS?.HTTP_FETCH || 5000;
  }

  async fetch(url, options = {}) {
    const targetUrl = (this.baseUrl && typeof url === 'string' && !url.startsWith('http'))
      ? `${this.baseUrl.replace(/\/$/, '')}/${url.replace(/^\//, '')}`
      : url;

    const response = await axios({
      url: targetUrl,
      timeout: options.timeout || 4000,
      headers: {
        'User-Agent': USER_AGENT_CHROME,
        ...(options.headers || {}),
      },
      ...options,
    });
    return response.data;
  }

  async getStreams(identifier, season = 1, episode = 1) {
    throw new Error(`getStreams() not implemented for provider ${this.name}`);
  }

  async getCatalog(type, id, extra, page = 1) {
    throw new Error(`getCatalog() not implemented for provider ${this.name}`);
  }

  async getDetail(slug) {
    throw new Error(`getDetail() not implemented for provider ${this.name}`);
  }

  // Common utilities helper methods
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
}

BaseProvider.scoreMatch = scoreMatch;
BaseProvider.normalizeText = normalizeText;
BaseProvider.escapeRegExp = escapeRegExp;
BaseProvider.safeSlug = safeSlug;
BaseProvider.safeKeyword = safeKeyword;
BaseProvider.safePage = safePage;
BaseProvider.generateSearchKeywords = generateSearchKeywords;
BaseProvider.matchEpisodeItem = matchEpisodeItem;

module.exports = BaseProvider;
