'use strict';

/**
 * ============================================================
 *  VIP Movies Addon — src/config/compressor.js
 *  Bitmask & Base62 Config Engine with Zero-Downtime Fallback
 * ============================================================
 */

// Định nghĩa từng Bit tương ứng với Provider
const PROVIDER_BITS = {
  nguonc: 1 << 0, // Bit 0 (1)
  kkphim: 1 << 1, // Bit 1 (2)
  vsmov:  1 << 2, // Bit 2 (4)
};

const ALL_PROVIDERS = ['nguonc', 'kkphim', 'vsmov'];
const DEFAULT_BITMASK = 7; // 1 | 2 | 4 = 7 (Bật cả 3 nguồn)

const CATEGORY_BITS = {
  movie:  1 << 8,  // 0x0100 (256)
  series: 1 << 9,  // 0x0200 (512)
  anime:  1 << 10, // 0x0400 (1024)
  cinema: 1 << 11, // 0x0800 (2048)
};

const DEFAULT_CATEGORY_MASK = CATEGORY_BITS.movie | CATEGORY_BITS.series | CATEGORY_BITS.anime | CATEGORY_BITS.cinema; // 3840
const DEFAULT_CONFIG_MASK = DEFAULT_BITMASK | DEFAULT_CATEGORY_MASK; // 3847

const DEFAULT_CONFIG = {
  providers: ['nguonc', 'kkphim', 'vsmov'],
  categories: ['movie', 'series', 'anime', 'cinema'],
  apiKey: '',
};

const BASE62_CHARS = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';

/**
 * Mã hóa danh sách providers thành Bitmask Integer
 * @param {Array<string>} activeProviders 
 * @returns {number} bitmask
 */
function encodeBitmask(activeProviders = []) {
  if (!Array.isArray(activeProviders) || activeProviders.length === 0) {
    return DEFAULT_BITMASK;
  }
  let mask = 0;
  activeProviders.forEach((p) => {
    if (p && PROVIDER_BITS[p.toLowerCase()]) {
      mask |= PROVIDER_BITS[p.toLowerCase()];
    }
  });
  return mask || DEFAULT_BITMASK;
}

/**
 * Giải mã Bitmask Integer thành danh sách Providers
 * @param {string|number} maskValue 
 * @returns {Array<string>} activeProviders
 */
function decodeBitmask(maskValue) {
  const mask = parseInt(maskValue, 10);
  if (isNaN(mask) || mask <= 0) return [...ALL_PROVIDERS];

  const enabled = [];
  Object.keys(PROVIDER_BITS).forEach((provider) => {
    if ((mask & PROVIDER_BITS[provider]) !== 0) {
      enabled.push(provider);
    }
  });
  return enabled.length > 0 ? enabled : [...ALL_PROVIDERS];
}

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
    if (idx === -1) return 0;
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
    if (p && PROVIDER_BITS[p.toLowerCase()]) mask |= PROVIDER_BITS[p.toLowerCase()];
  }
  for (const c of categories) {
    if (c && CATEGORY_BITS[c.toLowerCase()]) mask |= CATEGORY_BITS[c.toLowerCase()];
  }

  if ((mask & 0x00FF) === 0) mask |= DEFAULT_BITMASK;
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
    apiKey: apiKey || '',
  };
}

/**
 * Encode config object to compact URL string
 * Format: "<Base62Mask>" or "<Base62Mask>_<ApiKey>"
 * @param {object} config
 * @returns {string}
 */
function encodeConfig(config = {}) {
  const mask = configToMask(config);
  const maskStr = intToBase62(mask);
  const apiKey = (config.apiKey || '').trim();

  if (apiKey) {
    const safeKey = Buffer.from(apiKey, 'utf8').toString('base64url');
    return `${maskStr}_${safeKey}`;
  }
  return maskStr;
}

/**
 * Decode config token with fallback support
 * @param {string} token
 * @returns {{ providers: string[], categories: string[], apiKey: string }}
 */
function decodeConfig(token) {
  if (!token || typeof token !== 'string') {
    return { ...DEFAULT_CONFIG };
  }

  const clean = token.trim();
  if (!clean || clean === 'default' || clean === 'all') {
    return { ...DEFAULT_CONFIG };
  }

  // 1. Bitmask numeric route format (e.g. /c/7/... or raw number)
  if (/^\d+$/.test(clean)) {
    const val = parseInt(clean, 10);
    if (val > 0 && val <= 7) {
      return {
        providers: decodeBitmask(val),
        categories: [...DEFAULT_CONFIG.categories],
        apiKey: '',
      };
    }
  }

  // 2. Base62 Token format (e.g. "1A" or "1A_a2V5...")
  if (/^[0-9A-Za-z]+(_[0-9A-Za-z_-]+)?$/.test(clean)) {
    const parts = clean.split('_');
    const maskPart = parts[0];
    const keyPart = parts[1] || '';

    if (maskPart.length <= 4) {
      const maskInt = base62ToInt(maskPart);
      let apiKey = '';
      if (keyPart) {
        try {
          apiKey = Buffer.from(keyPart, 'base64url').toString('utf8');
        } catch {
          apiKey = keyPart;
        }
      }
      return maskToConfig(maskInt, apiKey);
    }
  }

  // 3. Backward Compatibility: Legacy Base64URL JSON config
  try {
    const jsonStr = Buffer.from(clean, 'base64url').toString('utf8');
    if (jsonStr.startsWith('{') && jsonStr.endsWith('}')) {
      const parsed = JSON.parse(jsonStr);
      return {
        providers: Array.isArray(parsed.providers) && parsed.providers.length > 0 ? parsed.providers : [...DEFAULT_CONFIG.providers],
        categories: Array.isArray(parsed.categories) && parsed.categories.length > 0 ? parsed.categories : [...DEFAULT_CONFIG.categories],
        apiKey: parsed.apiKey || '',
      };
    }
  } catch {}

  return { ...DEFAULT_CONFIG };
}

function isValidConfigToken(str) {
  if (!str || typeof str !== 'string') return false;
  const reserved = new Set([
    'manifest.json',
    'catalog',
    'stream',
    'meta',
    'hls',
    'proxy',
    'health',
    'favicon.ico',
    'robots.txt',
    'sitemap.xml',
    'c',
  ]);
  if (reserved.has(str.toLowerCase())) return false;
  return /^[0-9A-Za-z_-]+$/.test(str);
}

module.exports = {
  PROVIDER_BITS,
  ALL_PROVIDERS,
  DEFAULT_BITMASK,
  encodeBitmask,
  decodeBitmask,
  intToBase62,
  base62ToInt,
  configToMask,
  maskToConfig,
  encodeConfig,
  decodeConfig,
  isValidConfigToken,
  isConfigToken: isValidConfigToken,
};
