'use strict';

/**
 * ============================================================
 *  VIP Movies Stremio Addon - src/config.js  (v1.4.0)
 *  Config Engine: encode/decode user configuration
 *  Dùng Base64URL để an toàn khi nhúng vào URL path segment
 * ============================================================
 */

/** Danh sách provider hợp lệ */
const VALID_PROVIDERS = ['nguonc', 'kkphim', 'vsmov'];

/** Danh sách category hợp lệ */
const VALID_CATEGORIES = ['movie', 'series', 'anime', 'cinema'];

/** Cấu hình mặc định */
const DEFAULT_CONFIG = {
  providers: ['nguonc', 'kkphim', 'vsmov'],
  categories: ['movie', 'series'],
  apiKey: '',
};

/**
 * Encode config object → base64url string (URL-safe, no padding issues)
 * @param {object} config
 * @returns {string}
 */
function encodeConfig(config) {
  try {
    const safeConfig = {
      providers: Array.isArray(config.providers)
        ? config.providers.filter((p) => VALID_PROVIDERS.includes(p))
        : DEFAULT_CONFIG.providers,
      categories: Array.isArray(config.categories)
        ? config.categories.filter((c) => VALID_CATEGORIES.includes(c))
        : DEFAULT_CONFIG.categories,
      apiKey: typeof config.apiKey === 'string' ? config.apiKey.slice(0, 128) : '',
    };

    // Ensure at least one provider & category
    if (!safeConfig.providers.length) safeConfig.providers = DEFAULT_CONFIG.providers;
    if (!safeConfig.categories.length) safeConfig.categories = DEFAULT_CONFIG.categories;

    return Buffer.from(JSON.stringify(safeConfig), 'utf8').toString('base64url');
  } catch {
    return Buffer.from(JSON.stringify(DEFAULT_CONFIG), 'utf8').toString('base64url');
  }
}

/**
 * Decode base64url string → config object (with validation & fallback)
 * @param {string} encoded
 * @returns {{ providers: string[], categories: string[], apiKey: string }}
 */
function decodeConfig(encoded) {
  if (!encoded || typeof encoded !== 'string') return { ...DEFAULT_CONFIG };
  try {
    const json = Buffer.from(encoded, 'base64url').toString('utf8');
    const parsed = JSON.parse(json);

    const providers = Array.isArray(parsed.providers)
      ? parsed.providers.filter((p) => VALID_PROVIDERS.includes(p))
      : DEFAULT_CONFIG.providers;
    const categories = Array.isArray(parsed.categories)
      ? parsed.categories.filter((c) => VALID_CATEGORIES.includes(c))
      : DEFAULT_CONFIG.categories;
    const apiKey = typeof parsed.apiKey === 'string' ? parsed.apiKey.slice(0, 128) : '';

    return {
      providers: providers.length ? providers : DEFAULT_CONFIG.providers,
      categories: categories.length ? categories : DEFAULT_CONFIG.categories,
      apiKey,
    };
  } catch {
    return { ...DEFAULT_CONFIG };
  }
}

/**
 * Kiểm tra một chuỗi có phải là config token hợp lệ không
 * (dùng để phân biệt route /:config/* với các route thông thường)
 * @param {string} str
 * @returns {boolean}
 */
function isConfigToken(str) {
  if (!str || typeof str !== 'string') return false;
  // Config token là base64url có độ dài hợp lý (≥ 20 ký tự)
  if (str.length < 20) return false;
  // Chỉ chứa ký tự base64url
  if (!/^[A-Za-z0-9_-]+$/.test(str)) return false;
  // Thử decode
  try {
    const json = Buffer.from(str, 'base64url').toString('utf8');
    const obj = JSON.parse(json);
    return Array.isArray(obj.providers) || Array.isArray(obj.categories);
  } catch {
    return false;
  }
}

/**
 * Tạo DEFAULT_CONFIG token (encode một lần)
 * @returns {string}
 */
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
