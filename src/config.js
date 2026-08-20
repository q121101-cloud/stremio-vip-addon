'use strict';

/**
 * ============================================================
 *  VIP Movies Addon — src/config.js
 *  Clean Configuration for 3 Core Providers: VSMOV, KKPhim, NguonC
 * ============================================================
 */

const VALID_PROVIDERS = ['vsmov', 'kkphim', 'nguonc'];
const VALID_CATEGORIES = ['movie', 'series', 'cinema', 'anime'];

const DEFAULT_CONFIG = {
  providers: ['vsmov', 'kkphim', 'nguonc'],
  categories: ['movie', 'series', 'cinema', 'anime'],
  apiKey: '',
};

function encodeConfig(config) {
  try {
    const jsonStr = JSON.stringify({
      providers: Array.isArray(config.providers) ? config.providers.filter(p => VALID_PROVIDERS.includes(p)) : DEFAULT_CONFIG.providers,
      categories: Array.isArray(config.categories) ? config.categories.filter(c => VALID_CATEGORIES.includes(c)) : DEFAULT_CONFIG.categories,
      apiKey: typeof config.apiKey === 'string' ? config.apiKey : '',
    });
    return Buffer.from(jsonStr).toString('base64url');
  } catch (e) {
    return '';
  }
}

function decodeConfig(token) {
  if (!token) return { ...DEFAULT_CONFIG };
  try {
    const raw = Buffer.from(token, 'base64url').toString('utf8');
    const parsed = JSON.parse(raw);
    return {
      providers: Array.isArray(parsed.providers) && parsed.providers.length > 0
        ? parsed.providers.filter(p => VALID_PROVIDERS.includes(p))
        : DEFAULT_CONFIG.providers,
      categories: Array.isArray(parsed.categories) && parsed.categories.length > 0
        ? parsed.categories.filter(c => VALID_CATEGORIES.includes(c))
        : DEFAULT_CONFIG.categories,
      apiKey: typeof parsed.apiKey === 'string' ? parsed.apiKey : '',
    };
  } catch (e) {
    return { ...DEFAULT_CONFIG };
  }
}

function isConfigToken(str) {
  if (!str || typeof str !== 'string') return false;
  if (str.includes('.json') || str === 'manifest' || str === 'configure' || str === 'catalog' || str === 'stream' || str === 'meta') return false;
  return /^[A-Za-z0-9_-]{10,}$/.test(str);
}

function getDefaultToken() {
  return encodeConfig(DEFAULT_CONFIG);
}

module.exports = {
  VALID_PROVIDERS,
  VALID_CATEGORIES,
  DEFAULT_CONFIG,
  encodeConfig,
  decodeConfig,
  isConfigToken,
  getDefaultToken,
};
