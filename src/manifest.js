'use strict';

const { VSMOV_CATALOGS }  = require('./providers/vsmov');
const { KKPHIM_CATALOGS } = require('./providers/kkphim');
const { NGUONC_CATALOGS } = require('./providers/nguonc');

const ALL_CATALOGS = [
  ...VSMOV_CATALOGS,
  ...KKPHIM_CATALOGS,
  ...NGUONC_CATALOGS,
];

const GENRES = [
  'Hành Động', 'Tình Cảm', 'Hài Hước', 'Cổ Trang', 'Tâm Lý',
  'Hình Sự', 'Chiến Tranh', 'Thể Thao', 'Võ Thuật', 'Viễn Tưởng',
  'Phiêu Lưu', 'Khoa Học', 'Kinh Dị', 'Âm Nhạc', 'Thần Thoại',
  'Tài Liệu', 'Gia Đình', 'Chính Kịch', 'Bí Ẩn', 'Học Đường',
  'Kinh Điển', 'Phim 18+'
];

function buildManifest(config = {}) {
  const activeProviders = Array.isArray(config.providers) && config.providers.length > 0
    ? config.providers
    : ['vsmov', 'kkphim', 'nguonc'];

  const activeCategories = Array.isArray(config.categories) && config.categories.length > 0
    ? config.categories
    : ['movie', 'series', 'cinema', 'anime'];

  const filteredCatalogs = ALL_CATALOGS
    .filter(cat => {
      const provId = cat.id.split('-')[0];
      return activeProviders.includes(provId);
    })
    .filter(cat => {
      return activeCategories.includes(cat.category) || activeCategories.includes(cat.type);
    })
    .map(cat => ({
      id: cat.id,
      name: cat.name,
      type: cat.type,
      extra: [
        { name: 'search', isRequired: false },
        { name: 'genre', isRequired: false, options: GENRES },
        { name: 'skip', isRequired: false },
      ],
    }));

  return {
    id: 'community.vipmovies.addon',
    version: '2.0.0',
    name: 'VIP Movies 🎬 (VSMOV 4K + KKPhim + NguonC)',
    description: 'Addon xem phim Đa Nguồn VIP: VSMOV 4K Ultra HD, KKPhim & NguonC Vietsub / Thuyết Minh siêu tốc.',
    resources: ['catalog', 'meta', 'stream'],
    types: ['movie', 'series'],
    idPrefixes: ['tt', 'vsmov', 'kkphim', 'nguonc'],
    catalogs: filteredCatalogs,
    behaviorHints: {
      configurable: true,
      configurationRequired: false,
    },
  };
}

module.exports = {
  ALL_CATALOGS,
  GENRES,
  buildManifest,
};
