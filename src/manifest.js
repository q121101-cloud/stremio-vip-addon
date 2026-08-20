'use strict';

const { MANIFEST: MANIFEST_CONSTANTS } = require('./config');

// Standard Vietnamese Genre List for Catalog Filters
const GENRES = [
  'Hành Động', 'Tình Cảm', 'Hài Hước', 'Cổ Trang', 'Tâm Lý',
  'Hình Sự', 'Chiến Tranh', 'Thể Thao', 'Võ Thuật', 'Viễn Tưởng',
  'Phiêu Lưu', 'Khoa Học', 'Kinh Dị', 'Âm Nhạc', 'Thần Thoại',
  'Tài Liệu', 'Gia Đình', 'Chính Kịch', 'Bí Ẩn', 'Học Đường', 'Kinh Điển'
];

// All Available Catalog Definitions
const ALL_CATALOGS = [
  // VSMOV 4K Catalogs
  {
    id: 'vsmov-4k',
    name: '🌟 VSMOV • Phim 4K Ultra HD',
    type: 'movie',
    provider: 'vsmov',
    category: 'phim-le',
    extra: [
      { name: 'search', isRequired: false },
      { name: 'genre', isRequired: false, options: GENRES },
      { name: 'skip', isRequired: false }
    ]
  },
  {
    id: 'vsmov-phim-bo',
    name: '📺 VSMOV • Phim Bộ',
    type: 'series',
    provider: 'vsmov',
    category: 'phim-bo',
    extra: [
      { name: 'search', isRequired: false },
      { name: 'genre', isRequired: false, options: GENRES },
      { name: 'skip', isRequired: false }
    ]
  },
  {
    id: 'vsmov-phim-le',
    name: '🎬 VSMOV • Phim Lẻ',
    type: 'movie',
    provider: 'vsmov',
    category: 'phim-le',
    extra: [
      { name: 'search', isRequired: false },
      { name: 'genre', isRequired: false, options: GENRES },
      { name: 'skip', isRequired: false }
    ]
  },
  {
    id: 'vsmov-phim-chieu-rap',
    name: '🍿 VSMOV • Phim Chiếu Rạp',
    type: 'movie',
    provider: 'vsmov',
    category: 'phim-chieu-rap',
    extra: [
      { name: 'search', isRequired: false },
      { name: 'genre', isRequired: false, options: GENRES },
      { name: 'skip', isRequired: false }
    ]
  },

  // KKPhim Catalogs
  {
    id: 'kkphim-phim-moi',
    name: '🔥 KKPhim • Phim Mới Cập Nhật',
    type: 'movie',
    provider: 'kkphim',
    category: 'phim-moi',
    extra: [
      { name: 'search', isRequired: false },
      { name: 'genre', isRequired: false, options: GENRES },
      { name: 'skip', isRequired: false }
    ]
  },
  {
    id: 'kkphim-phim-le',
    name: '🎬 KKPhim • Phim Lẻ',
    type: 'movie',
    provider: 'kkphim',
    category: 'phim-le',
    extra: [
      { name: 'search', isRequired: false },
      { name: 'genre', isRequired: false, options: GENRES },
      { name: 'skip', isRequired: false }
    ]
  },
  {
    id: 'kkphim-phim-bo',
    name: '📺 KKPhim • Phim Bộ',
    type: 'series',
    provider: 'kkphim',
    category: 'phim-bo',
    extra: [
      { name: 'search', isRequired: false },
      { name: 'genre', isRequired: false, options: GENRES },
      { name: 'skip', isRequired: false }
    ]
  },
  {
    id: 'kkphim-hoat-hinh',
    name: '🌸 KKPhim • Hoạt Hình / Anime',
    type: 'series',
    provider: 'kkphim',
    category: 'hoat-hinh',
    extra: [
      { name: 'search', isRequired: false },
      { name: 'genre', isRequired: false, options: GENRES },
      { name: 'skip', isRequired: false }
    ]
  },
  {
    id: 'kkphim-phim-chieu-rap',
    name: '🍿 KKPhim • Phim Chiếu Rạp',
    type: 'movie',
    provider: 'kkphim',
    category: 'phim-chieu-rap',
    extra: [
      { name: 'search', isRequired: false },
      { name: 'genre', isRequired: false, options: GENRES },
      { name: 'skip', isRequired: false }
    ]
  },

  // NguonC Catalogs
  {
    id: 'nguonc-phim-moi',
    name: '🔥 NguonC • Phim Mới Cập Nhật',
    type: 'movie',
    provider: 'nguonc',
    category: 'phim-moi',
    extra: [
      { name: 'search', isRequired: false },
      { name: 'genre', isRequired: false, options: GENRES },
      { name: 'skip', isRequired: false }
    ]
  },
  {
    id: 'nguonc-phim-le',
    name: '🎬 NguonC • Phim Lẻ',
    type: 'movie',
    provider: 'nguonc',
    category: 'phim-le',
    extra: [
      { name: 'search', isRequired: false },
      { name: 'genre', isRequired: false, options: GENRES },
      { name: 'skip', isRequired: false }
    ]
  },
  {
    id: 'nguonc-phim-bo',
    name: '📺 NguonC • Phim Bộ',
    type: 'series',
    provider: 'nguonc',
    category: 'phim-bo',
    extra: [
      { name: 'search', isRequired: false },
      { name: 'genre', isRequired: false, options: GENRES },
      { name: 'skip', isRequired: false }
    ]
  },
  {
    id: 'nguonc-hoat-hinh',
    name: '🌸 NguonC • Hoạt Hình',
    type: 'series',
    provider: 'nguonc',
    category: 'hoat-hinh',
    extra: [
      { name: 'search', isRequired: false },
      { name: 'genre', isRequired: false, options: GENRES },
      { name: 'skip', isRequired: false }
    ]
  },
  {
    id: 'nguonc-phim-chieu-rap',
    name: '🍿 NguonC • Phim Chiếu Rạp',
    type: 'movie',
    provider: 'nguonc',
    category: 'phim-chieu-rap',
    extra: [
      { name: 'search', isRequired: false },
      { name: 'genre', isRequired: false, options: GENRES },
      { name: 'skip', isRequired: false }
    ]
  }
];

const DEFAULT_CONFIG = {
  providers: ['vsmov', 'kkphim', 'nguonc'],
  categories: ['phim-moi', 'phim-le', 'phim-bo', 'hoat-hinh', 'phim-chieu-rap'],
  proxyQuality: 'auto',
  preferredAudio: 'vietsub'
};

/**
 * Parses user configuration string (Base64URL JSON or Bitmask)
 * @param {string} [configStr]
 * @returns {object} Normalized configuration object
 */
function parseConfig(configStr) {
  if (!configStr || configStr === 'default') {
    return { ...DEFAULT_CONFIG };
  }

  // Strip leading/trailing slashes or .json
  const raw = configStr.replace(/^\/+|\/+$/g, '').replace(/\.json$/, '');

  // 1. Bitmask numeric parse (e.g. "127", "7", "3847")
  if (/^\d+$/.test(raw)) {
    const mask = parseInt(raw, 10);
    const providers = [];
    if (mask & 1) providers.push('nguonc');
    if (mask & 2) providers.push('kkphim');
    if (mask & 4) providers.push('vsmov');

    const categories = [];
    if (mask & 8 || mask & 256) categories.push('phim-le');
    if (mask & 16 || mask & 512) categories.push('phim-bo');
    if (mask & 32 || mask & 1024) categories.push('hoat-hinh');
    if (mask & 64 || mask & 2048) categories.push('phim-chieu-rap');
    if (mask & 128) categories.push('phim-moi');

    // If only provider bits were provided (mask <= 7) or no categories specified
    if (categories.length === 0) {
      categories.push('phim-moi', 'phim-le', 'phim-bo', 'hoat-hinh', 'phim-chieu-rap');
    }

    return {
      providers: providers.length > 0 ? providers : DEFAULT_CONFIG.providers,
      categories: categories.length > 0 ? categories : DEFAULT_CONFIG.categories,
      proxyQuality: 'auto',
      preferredAudio: 'vietsub'
    };
  }

  // 2. Base64URL JSON string parse
  try {
    let b64 = raw.replace(/-/g, '+').replace(/_/g, '/');
    while (b64.length % 4) b64 += '=';
    const jsonStr = Buffer.from(b64, 'base64').toString('utf8');
    const parsed = JSON.parse(jsonStr);

    return {
      providers: Array.isArray(parsed.providers) && parsed.providers.length > 0
        ? parsed.providers
        : DEFAULT_CONFIG.providers,
      categories: Array.isArray(parsed.categories) && parsed.categories.length > 0
        ? parsed.categories
        : DEFAULT_CONFIG.categories,
      proxyQuality: parsed.proxyQuality || 'auto',
      preferredAudio: parsed.preferredAudio || 'vietsub'
    };
  } catch (err) {
    // Graceful fallback to default config
    return { ...DEFAULT_CONFIG };
  }
}

/**
 * Encodes configuration object to Base64URL JSON token
 * @param {object} configObj
 * @returns {string} Base64URL string
 */
function encodeConfig(configObj) {
  const json = JSON.stringify(configObj || DEFAULT_CONFIG);
  return Buffer.from(json, 'utf8')
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

/**
 * Generates dynamic Stremio Manifest based on configuration
 * @param {string} [configStr]
 * @returns {object} Stremio v4 Manifest object
 */
function getManifest(configStr) {
  const userConfig = parseConfig(configStr);

  // Filter catalogs based on active providers and categories
  const activeCatalogs = ALL_CATALOGS.filter(cat => {
    const providerMatch = userConfig.providers.includes(cat.provider);
    const categoryMatch = userConfig.categories.includes(cat.category);
    return providerMatch && categoryMatch;
  }).map(({ provider, category, ...rest }) => rest); // strip internal metadata

  // Format provider names for manifest title
  const providerNames = [];
  if (userConfig.providers.includes('vsmov')) providerNames.push('VSMOV 4K');
  if (userConfig.providers.includes('kkphim')) providerNames.push('KKPhim');
  if (userConfig.providers.includes('nguonc')) providerNames.push('NguonC');
  const providerTitle = providerNames.length > 0 ? providerNames.join(' + ') : 'Đa Nguồn VIP';

  return {
    id: MANIFEST_CONSTANTS?.ID || 'community.vipmovies.addon',
    version: MANIFEST_CONSTANTS?.VERSION || '2.0.0',
    name: `VIP Movies 🎬 (${providerTitle})`,
    description: MANIFEST_CONSTANTS?.DESCRIPTION || 'Addon xem phim Đa Nguồn VIP: VSMOV 4K Ultra HD, KKPhim & NguonC Vietsub / Thuyết Minh siêu tốc.',
    resources: ['catalog', 'meta', 'stream'],
    types: ['movie', 'series'],
    idPrefixes: ['tt', 'vsmov:', 'vsmov_', 'kkphim:', 'kkphim_', 'nguonc:', 'nguonc_'],
    catalogs: activeCatalogs,
    behaviorHints: {
      configurable: true,
      configurationRequired: false
    }
  };
}

module.exports = {
  getManifest,
  manifest: getManifest(),
  parseConfig,
  encodeConfig,
  GENRES,
  ALL_CATALOGS,
  DEFAULT_CONFIG
};
