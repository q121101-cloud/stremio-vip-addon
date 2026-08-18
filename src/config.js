'use strict';

/**
 * ============================================================
 *  VIP Movies Stremio Addon - src/config.js  (v1.6.0)
 *  Config Engine: encode/decode user configuration
 *  Dùng Base64URL để an toàn khi nhúng vào URL path segment
 * ============================================================
 */

/** Danh sách provider hợp lệ */
const VALID_PROVIDERS = ['vsmov', 'kkphim', 'nguonc', 'stp', 'hh3d', 'yan', 'clbpx'];

/** Danh sách category hợp lệ */
const VALID_CATEGORIES = ['movie', 'series', 'anime', 'cinema'];

/** Cấu hình mặc định */
const DEFAULT_CONFIG = {
  providers: ['vsmov', 'kkphim', 'nguonc', 'stp', 'hh3d', 'yan', 'clbpx'],
  categories: ['movie', 'series', 'anime', 'cinema'],
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
  if (!encoded) return { ...DEFAULT_CONFIG };
  if (typeof encoded === 'object') {
    const providers = Array.isArray(encoded.providers)
      ? encoded.providers.filter((p) => VALID_PROVIDERS.includes(p))
      : DEFAULT_CONFIG.providers;
    const categories = Array.isArray(encoded.categories)
      ? encoded.categories.filter((c) => VALID_CATEGORIES.includes(c))
      : DEFAULT_CONFIG.categories;
    const apiKey = typeof encoded.apiKey === 'string' ? encoded.apiKey.slice(0, 128) : '';

    return {
      providers: providers.length ? providers : DEFAULT_CONFIG.providers,
      categories: categories.length ? categories : DEFAULT_CONFIG.categories,
      apiKey,
    };
  }

  if (typeof encoded !== 'string') return { ...DEFAULT_CONFIG };
  const trimmed = encoded.trim();
  if (!trimmed) return { ...DEFAULT_CONFIG };

  // 1. Try URLSearchParams (e.g. "providers=vsmov,kkphim&categories=movie,series")
  if (trimmed.includes('=') && !trimmed.startsWith('{') && !trimmed.startsWith('%7B')) {
    try {
      const searchParams = new URLSearchParams(trimmed);
      const provParam = searchParams.get('providers') || searchParams.getAll('providers').join(',');
      const catParam = searchParams.get('categories') || searchParams.getAll('categories').join(',');
      const apiKey = (searchParams.get('apiKey') || searchParams.get('key') || '').slice(0, 128);

      const parsedProviders = provParam ? provParam.split(',').map(p => p.trim()).filter(p => VALID_PROVIDERS.includes(p)) : [];
      const parsedCats = catParam ? catParam.split(',').map(c => c.trim()).filter(c => VALID_CATEGORIES.includes(c)) : [];

      if (parsedProviders.length > 0 || parsedCats.length > 0 || apiKey) {
        return {
          providers: parsedProviders.length ? parsedProviders : DEFAULT_CONFIG.providers,
          categories: parsedCats.length ? parsedCats : DEFAULT_CONFIG.categories,
          apiKey,
        };
      }
    } catch {}
  }

  // 2. Try JSON (direct or URI-encoded)
  try {
    let jsonStr = trimmed;
    if (jsonStr.startsWith('%7B') || jsonStr.includes('%22')) {
      try { jsonStr = decodeURIComponent(jsonStr); } catch {}
    }
    if (jsonStr.startsWith('{') && jsonStr.endsWith('}')) {
      const parsed = JSON.parse(jsonStr);
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
    }
  } catch {}

  // 3. Try Base64URL / Base64 decode
  try {
    let json = Buffer.from(trimmed, 'base64url').toString('utf8');
    if (!json.startsWith('{')) {
      json = Buffer.from(trimmed, 'base64').toString('utf8');
    }
    if (json.startsWith('{')) {
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
    }
  } catch {}

  return { ...DEFAULT_CONFIG };
}

/**
 * Kiểm tra một chuỗi có phải là config token hợp lệ không
 * (dùng để phân biệt route /:config/* với các route thông thường)
 * @param {string} str
 * @returns {boolean}
 */
function isConfigToken(str) {
  if (!str || typeof str !== 'string') return false;
  // Exclude known non-config path segments
  const reserved = ['manifest.json', 'catalog', 'stream', 'meta', 'hls', 'health', 'favicon.ico', 'admin', 'configure'];
  if (reserved.includes(str.toLowerCase())) return false;
  // Config token là base64url có độ dài hợp lý (≥ 10 ký tự) hoặc chuỗi JSON/query
  try {
    const cfg = decodeConfig(str);
    return Boolean(cfg && (Array.isArray(cfg.providers) || Array.isArray(cfg.categories)));
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
