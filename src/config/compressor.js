'use strict';

/**
 * ============================================================
 *  VIP Movies Addon — src/config/compressor.js
 *  16-bit Bitmask & Base62 Config Engine with Zero-Downtime Fallback
 * ============================================================
 */

const {
  VALID_PROVIDERS,
  VALID_CATEGORIES,
  PROVIDER_BITS,
  CATEGORY_BITS,
  DEFAULT_PROVIDER_MASK,
  DEFAULT_CATEGORY_MASK,
  DEFAULT_CONFIG_MASK,
  DEFAULT_CONFIG,
} = require('./constants');

const BASE62_CHARS = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';

/**
 * Convert integer to Base62 string
 * @param {number} num
 * @returns {string}
 */
function intToBase62(num) {
  if (num === 0) return '0';
  let n = Math.floor(Math.abs(num));
  let result = '';
  while (n > 0) {
    result = BASE62_CHARS[n % 62] + result;
    n = Math.floor(n / 62);
  }
  return result;
}

/**
 * Convert Base62 string to integer
 * @param {string} str
 * @returns {number}
 */
function base62ToInt(str) {
  if (!str || typeof str !== 'string') return 0;
  let result = 0;
  for (let i = 0; i < str.length; i++) {
    const idx = BASE62_CHARS.indexOf(str[i]);
    if (idx === -1) return 0; // invalid char
    result = result * 62 + idx;
  }
  return result;
}

/**
 * Convert config object ({ providers, categories }) to 16-bit mask
 * @param {object} config
 * @returns {number}
 */
function configToMask(config = {}) {
  let mask = 0;

  const providers = Array.isArray(config.providers) ? config.providers : DEFAULT_CONFIG.providers;
  const categories = Array.isArray(config.categories) ? config.categories : DEFAULT_CONFIG.categories;

  for (const p of providers) {
    if (PROVIDER_BITS[p]) mask |= PROVIDER_BITS[p];
  }
  for (const c of categories) {
    if (CATEGORY_BITS[c]) mask |= CATEGORY_BITS[c];
  }

  // If none selected, fallback to defaults
  if ((mask & 0x00FF) === 0) mask |= DEFAULT_PROVIDER_MASK;
  if ((mask & 0xFF00) === 0) mask |= DEFAULT_CATEGORY_MASK;

  return mask;
}

/**
 * Convert 16-bit mask to config object
 * @param {number} mask
 * @param {string} [apiKey='']
 * @returns {{ providers: string[], categories: string[], apiKey: string }}
 */
function maskToConfig(mask, apiKey = '') {
  let safeMask = typeof mask === 'number' && !isNaN(mask) && mask > 0 ? mask : DEFAULT_CONFIG_MASK;

  const providers = [];
  for (const [p, bit] of Object.entries(PROVIDER_BITS)) {
    if ((safeMask & bit) !== 0) providers.push(p);
  }

  const categories = [];
  for (const [c, bit] of Object.entries(CATEGORY_BITS)) {
    if ((safeMask & bit) !== 0) categories.push(c);
  }

  return {
    providers: providers.length > 0 ? providers : [...DEFAULT_CONFIG.providers],
    categories: categories.length > 0 ? categories : [...DEFAULT_CONFIG.categories],
    apiKey: typeof apiKey === 'string' ? apiKey.slice(0, 128) : '',
  };
}

/**
 * Encode config object to compact Base62/Bitmask token
 * @param {object} config
 * @returns {string}
 */
function encodeConfig(config) {
  if (!config) return intToBase62(DEFAULT_CONFIG_MASK);
  try {
    const mask = configToMask(config);
    const maskStr = intToBase62(mask);
    const apiKey = typeof config.apiKey === 'string' ? config.apiKey.trim() : '';

    if (apiKey) {
      // Encode apiKey in Base64URL and append with dot
      const b64Key = Buffer.from(apiKey, 'utf8').toString('base64url');
      return `${maskStr}.${b64Key}`;
    }

    return maskStr;
  } catch {
    return intToBase62(DEFAULT_CONFIG_MASK);
  }
}

/**
 * Decode token (Base62 bitmask, Base64URL JSON, URL params, or raw JSON) into config object
 * @param {string|object} input
 * @returns {{ providers: string[], categories: string[], apiKey: string }}
 */
function decodeConfig(input) {
  if (!input) return { ...DEFAULT_CONFIG };
  if (typeof input === 'object') {
    const providers = Array.isArray(input.providers)
      ? input.providers.filter((p) => VALID_PROVIDERS.includes(p))
      : DEFAULT_CONFIG.providers;
    const categories = Array.isArray(input.categories)
      ? input.categories.filter((c) => VALID_CATEGORIES.includes(c))
      : DEFAULT_CONFIG.categories;
    const apiKey = typeof input.apiKey === 'string' ? input.apiKey.slice(0, 128) : '';

    return {
      providers: providers.length ? providers : DEFAULT_CONFIG.providers,
      categories: categories.length ? categories : DEFAULT_CONFIG.categories,
      apiKey,
    };
  }

  if (typeof input !== 'string') return { ...DEFAULT_CONFIG };
  const trimmed = input.trim();
  if (!trimmed) return { ...DEFAULT_CONFIG };

  // 1. Bitmask Base62 Check (e.g. "1A", "3847", "1A.a2V5" where mask part is <= 4 chars)
  const dotIdx = trimmed.indexOf('.');
  const maskPart = dotIdx !== -1 ? trimmed.slice(0, dotIdx) : trimmed;
  const keyPart  = dotIdx !== -1 ? trimmed.slice(dotIdx + 1) : '';

  if (maskPart.length <= 4 && /^[0-9A-Za-z]+$/.test(maskPart)) {
    const mask = base62ToInt(maskPart);
    if (mask > 0 && mask <= 65535) {
      let apiKey = '';
      if (keyPart) {
        try {
          apiKey = Buffer.from(keyPart, 'base64url').toString('utf8');
        } catch {
          apiKey = keyPart;
        }
      }
      return maskToConfig(mask, apiKey);
    }
  }

  // 2. URLSearchParams fallback (e.g. "providers=vsmov,kkphim&categories=movie")
  if (trimmed.includes('=') && !trimmed.startsWith('{') && !trimmed.startsWith('%7B')) {
    try {
      const searchParams = new URLSearchParams(trimmed);
      const provParam = searchParams.get('providers') || searchParams.getAll('providers').join(',');
      const catParam  = searchParams.get('categories') || searchParams.getAll('categories').join(',');
      const apiKey    = (searchParams.get('apiKey') || searchParams.get('key') || '').slice(0, 128);

      const parsedProviders = provParam ? provParam.split(',').map(p => p.trim()).filter(p => VALID_PROVIDERS.includes(p)) : [];
      const parsedCats      = catParam ? catParam.split(',').map(c => c.trim()).filter(c => VALID_CATEGORIES.includes(c)) : [];

      if (parsedProviders.length > 0 || parsedCats.length > 0 || apiKey) {
        return {
          providers: parsedProviders.length ? parsedProviders : DEFAULT_CONFIG.providers,
          categories: parsedCats.length ? parsedCats : DEFAULT_CONFIG.categories,
          apiKey,
        };
      }
    } catch {}
  }

  // 3. Raw / URL-encoded JSON
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

  // 4. Base64URL / Base64 JSON fallback
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
 * Check if a route path segment is a valid config token
 * @param {string} str
 * @returns {boolean}
 */
function isConfigToken(str) {
  if (!str || typeof str !== 'string') return false;
  const reserved = [
    'manifest.json',
    'manifest',
    'catalog',
    'stream',
    'meta',
    'hls',
    'health',
    'favicon.ico',
    'admin',
    'configure',
    'proxy',
    'api',
  ];
  if (reserved.includes(str.toLowerCase())) return false;

  try {
    const cfg = decodeConfig(str);
    return Boolean(cfg && (Array.isArray(cfg.providers) || Array.isArray(cfg.categories)));
  } catch {
    return false;
  }
}

function getDefaultToken() {
  return encodeConfig(DEFAULT_CONFIG);
}

module.exports = {
  intToBase62,
  base62ToInt,
  configToMask,
  maskToConfig,
  encodeConfig,
  decodeConfig,
  isConfigToken,
  getDefaultToken,
};
