'use strict';

/**
 * ============================================================
 *  VIP Movies Stremio Addon - src/manifest.js  (v1.5.2)
 *  Định nghĩa manifest của addon theo chuẩn Stremio / Nuvio
 *  Hỗ trợ Dynamic Manifest theo config token & đa nguồn (NguonC, KKPhim, VsMov)
 * ============================================================
 */

const { VALID_PROVIDERS, VALID_CATEGORIES, DEFAULT_CONFIG } = require('./config');

/** Danh sách thể loại chuẩn */
const GENRES = [
  { name: 'Hành Động', slug: 'hanh-dong' },
  { name: 'Tình Cảm', slug: 'tinh-cam' },
  { name: 'Hài Hước', slug: 'hai-huoc' },
  { name: 'Cổ Trang', slug: 'co-trang' },
  { name: 'Tâm Lý', slug: 'tam-ly' },
  { name: 'Hình Sự', slug: 'hinh-su' },
  { name: 'Chiến Tranh', slug: 'chien-tranh' },
  { name: 'Thể Thao', slug: 'the-thao' },
  { name: 'Võ Thuật', slug: 'vo-thuat' },
  { name: 'Viễn Tưởng', slug: 'vien-tuong' },
  { name: 'Phiêu Lưu', slug: 'phieu-luu' },
  { name: 'Khoa Học', slug: 'khoa-hoc' },
  { name: 'Kinh Dị', slug: 'kinh-di' },
  { name: 'Âm Nhạc', slug: 'am-nhac' },
  { name: 'Thần Thoại', slug: 'than-thoai' },
  { name: 'Hoạt Hình', slug: 'hoat-hinh' },
  { name: 'Kinh Điển', slug: 'kinh-dien' },
  { name: 'Chính Kịch', slug: 'chinh-kich' },
  { name: 'Gia Đình', slug: 'gia-dinh' },
  { name: 'Bí Ẩn', slug: 'bi-an' },
  { name: 'Giật Gân', slug: 'giat-gan' },
  { name: 'Lãng Mạn', slug: 'lang-man' },
  { name: 'Phim 18+', slug: 'phim-18' },
];

/** Danh sách quốc gia chuẩn */
const COUNTRIES = [
  { name: 'Việt Nam', slug: 'viet-nam' },
  { name: 'Trung Quốc', slug: 'trung-quoc' },
  { name: 'Hàn Quốc', slug: 'han-quoc' },
  { name: 'Nhật Bản', slug: 'nhat-ban' },
  { name: 'Thái Lan', slug: 'thai-lan' },
  { name: 'Mỹ', slug: 'my' },
  { name: 'Anh', slug: 'anh' },
  { name: 'Pháp', slug: 'phap' },
  { name: 'Đức', slug: 'duc' },
  { name: 'Ấn Độ', slug: 'an-do' },
  { name: 'Tây Ban Nha', slug: 'tay-ban-nha' },
  { name: 'Hồng Kông', slug: 'hong-kong' },
  { name: 'Đài Loan', slug: 'dai-loan' },
  { name: 'Indonesia', slug: 'indonesia' },
  { name: 'Philippines', slug: 'philippines' },
];

const GENRE_NAMES = GENRES.map((g) => g.name);

// ─── Catalog Definitions Per Provider (22 K20 Standard Catalogs) ────────────────────────

const ALL_CATALOGS = [
  // ── 1. VSMOV 4K (2 catalogs) ───────────────────────────
  {
    provider: 'vsmov',
    category: 'movie',
    type: 'movie',
    id: 'vsmov-4k',
    name: '🌟 VSMOV • Phim 4K Ultra HD',
    extra: [
      { name: 'search', isRequired: false },
      { name: 'genre', isRequired: false, options: GENRE_NAMES },
      { name: 'skip', isRequired: false },
    ],
    extraSupported: ['search', 'genre', 'skip'],
  },
  {
    provider: 'vsmov',
    category: 'movie',
    type: 'movie',
    id: 'vsmov-thuyet-minh',
    name: '🎙️ VSMOV • Thuyết Minh 4K',
    extra: [
      { name: 'search', isRequired: false },
      { name: 'genre', isRequired: false, options: GENRE_NAMES },
      { name: 'skip', isRequired: false },
    ],
    extraSupported: ['search', 'genre', 'skip'],
  },

  // ── 2. KKPhim (4 catalogs) ─────────────────────────────
  {
    provider: 'kkphim',
    category: 'movie',
    type: 'movie',
    id: 'kkphim-movie-latest',
    name: '🎬 KKPhim • Phim Lẻ Mới',
    extra: [
      { name: 'search', isRequired: false },
      { name: 'genre', isRequired: false, options: GENRE_NAMES },
      { name: 'skip', isRequired: false },
    ],
    extraSupported: ['search', 'genre', 'skip'],
  },
  {
    provider: 'kkphim',
    category: 'series',
    type: 'series',
    id: 'kkphim-series-latest',
    name: '📺 KKPhim • Phim Bộ Mới',
    extra: [
      { name: 'search', isRequired: false },
      { name: 'genre', isRequired: false, options: GENRE_NAMES },
      { name: 'skip', isRequired: false },
    ],
    extraSupported: ['search', 'genre', 'skip'],
  },
  {
    provider: 'kkphim',
    category: 'cinema',
    type: 'movie',
    id: 'kkphim-cinema-latest',
    name: '🍿 KKPhim • Phim Chiếu Rạp',
    extra: [
      { name: 'search', isRequired: false },
      { name: 'genre', isRequired: false, options: GENRE_NAMES },
      { name: 'skip', isRequired: false },
    ],
    extraSupported: ['search', 'genre', 'skip'],
  },
  {
    provider: 'kkphim',
    category: 'anime',
    type: 'series',
    id: 'kkphim-anime-latest',
    name: '🐉 KKPhim • Hoạt Hình & Anime',
    extra: [
      { name: 'search', isRequired: false },
      { name: 'genre', isRequired: false, options: GENRE_NAMES },
      { name: 'skip', isRequired: false },
    ],
    extraSupported: ['search', 'genre', 'skip'],
  },

  // ── 3. NguonC (4 catalogs) ────────────────────────────
  {
    provider: 'nguonc',
    category: 'movie',
    type: 'movie',
    id: 'nguonc-movie-latest',
    name: '🎬 NguonC • Phim Lẻ Mới',
    extra: [
      { name: 'search', isRequired: false },
      { name: 'genre', isRequired: false, options: GENRE_NAMES },
      { name: 'skip', isRequired: false },
    ],
    extraSupported: ['search', 'genre', 'skip'],
  },
  {
    provider: 'nguonc',
    category: 'series',
    type: 'series',
    id: 'nguonc-series-latest',
    name: '📺 NguonC • Phim Bộ Mới',
    extra: [
      { name: 'search', isRequired: false },
      { name: 'genre', isRequired: false, options: GENRE_NAMES },
      { name: 'skip', isRequired: false },
    ],
    extraSupported: ['search', 'genre', 'skip'],
  },
  {
    provider: 'nguonc',
    category: 'cinema',
    type: 'movie',
    id: 'nguonc-cinema-latest',
    name: '🍿 NguonC • Phim Chiếu Rạp',
    extra: [
      { name: 'search', isRequired: false },
      { name: 'genre', isRequired: false, options: GENRE_NAMES },
      { name: 'skip', isRequired: false },
    ],
    extraSupported: ['search', 'genre', 'skip'],
  },
  {
    provider: 'nguonc',
    category: 'anime',
    type: 'series',
    id: 'nguonc-anime-latest',
    name: '🐉 NguonC • Hoạt Hình & Anime',
    extra: [
      { name: 'search', isRequired: false },
      { name: 'genre', isRequired: false, options: GENRE_NAMES },
      { name: 'skip', isRequired: false },
    ],
    extraSupported: ['search', 'genre', 'skip'],
  },

  // ── 4. STP - Sưu Tầm Phim (4 catalogs) ────────────────
  {
    provider: 'stp',
    category: 'movie',
    type: 'movie',
    id: 'stp-au-my',
    name: '🗽 STP • Phim Âu Mỹ Tuyển Chọn',
    extra: [
      { name: 'search', isRequired: false },
      { name: 'genre', isRequired: false, options: GENRE_NAMES },
      { name: 'skip', isRequired: false },
    ],
    extraSupported: ['search', 'genre', 'skip'],
  },
  {
    provider: 'stp',
    category: 'movie',
    type: 'movie',
    id: 'stp-phim-le',
    name: '🎬 STP • Phim Lẻ Đặc Sắc',
    extra: [
      { name: 'search', isRequired: false },
      { name: 'genre', isRequired: false, options: GENRE_NAMES },
      { name: 'skip', isRequired: false },
    ],
    extraSupported: ['search', 'genre', 'skip'],
  },
  {
    provider: 'stp',
    category: 'series',
    type: 'series',
    id: 'stp-phim-bo',
    name: '📺 STP • Phim Bộ Tuyển Chọn',
    extra: [
      { name: 'search', isRequired: false },
      { name: 'genre', isRequired: false, options: GENRE_NAMES },
      { name: 'skip', isRequired: false },
    ],
    extraSupported: ['search', 'genre', 'skip'],
  },
  {
    provider: 'stp',
    category: 'series',
    type: 'series',
    id: 'stp-han-quoc',
    name: '🇰🇷 STP • Phim Hàn Quốc (K-Drama)',
    extra: [
      { name: 'search', isRequired: false },
      { name: 'genre', isRequired: false, options: GENRE_NAMES },
      { name: 'skip', isRequired: false },
    ],
    extraSupported: ['search', 'genre', 'skip'],
  },

  // ── 5. HH3D - Hoạt Hình 3D (3 catalogs) ───────────────
  {
    provider: 'hh3d',
    category: 'movie',
    type: 'movie',
    id: 'hh3d-phim-le',
    name: '🎬 HH3D • Hoạt Hình 3D Phim Lẻ',
    extra: [
      { name: 'search', isRequired: false },
      { name: 'genre', isRequired: false, options: GENRE_NAMES },
      { name: 'skip', isRequired: false },
    ],
    extraSupported: ['search', 'genre', 'skip'],
  },
  {
    provider: 'hh3d',
    category: 'series',
    type: 'series',
    id: 'hh3d-phim-bo',
    name: '📺 HH3D • Hoạt Hình 3D Phim Bộ',
    extra: [
      { name: 'search', isRequired: false },
      { name: 'genre', isRequired: false, options: GENRE_NAMES },
      { name: 'skip', isRequired: false },
    ],
    extraSupported: ['search', 'genre', 'skip'],
  },
  {
    provider: 'hh3d',
    category: 'anime',
    type: 'series',
    id: 'hh3d-tien-hiep',
    name: '⚔️ HH3D • Tiên Hiệp & Huyền Huyễn 3D',
    extra: [
      { name: 'search', isRequired: false },
      { name: 'genre', isRequired: false, options: GENRE_NAMES },
      { name: 'skip', isRequired: false },
    ],
    extraSupported: ['search', 'genre', 'skip'],
  },

  // ── 6. YAN - Donghua & Anime (3 catalogs) ─────────────
  {
    provider: 'yan',
    category: 'movie',
    type: 'movie',
    id: 'yan-phim-le',
    name: '🎬 YAN • Donghua Phim Lẻ',
    extra: [
      { name: 'search', isRequired: false },
      { name: 'genre', isRequired: false, options: GENRE_NAMES },
      { name: 'skip', isRequired: false },
    ],
    extraSupported: ['search', 'genre', 'skip'],
  },
  {
    provider: 'yan',
    category: 'series',
    type: 'series',
    id: 'yan-phim-bo',
    name: '📺 YAN • Donghua Phim Bộ',
    extra: [
      { name: 'search', isRequired: false },
      { name: 'genre', isRequired: false, options: GENRE_NAMES },
      { name: 'skip', isRequired: false },
    ],
    extraSupported: ['search', 'genre', 'skip'],
  },
  {
    provider: 'yan',
    category: 'anime',
    type: 'series',
    id: 'yan-dang-chieu',
    name: '🔥 YAN • Donghua Đang Chiếu',
    extra: [
      { name: 'search', isRequired: false },
      { name: 'genre', isRequired: false, options: GENRE_NAMES },
      { name: 'skip', isRequired: false },
    ],
    extraSupported: ['search', 'genre', 'skip'],
  },

  // ── 7. CLBPX - Câu Lạc Bộ Phim Xưa (2 catalogs) ───────
  {
    provider: 'clbpx',
    category: 'series',
    type: 'series',
    id: 'clbpx-kiem-hiep',
    name: '🗡️ CLBPX • Kiếm Hiệp Kim Dung',
    extra: [
      { name: 'search', isRequired: false },
      { name: 'genre', isRequired: false, options: GENRE_NAMES },
      { name: 'skip', isRequired: false },
    ],
    extraSupported: ['search', 'genre', 'skip'],
  },
  {
    provider: 'clbpx',
    category: 'series',
    type: 'series',
    id: 'clbpx-hong-kong',
    name: '🇭🇰 CLBPX • Phim Hồng Kông / TVB Kinh Điển',
    extra: [
      { name: 'search', isRequired: false },
      { name: 'genre', isRequired: false, options: GENRE_NAMES },
      { name: 'skip', isRequired: false },
    ],
    extraSupported: ['search', 'genre', 'skip'],
  },
];

// ─── Base Manifest Object ─────────────────────────────────────

const ALL_ID_PREFIXES = [
  'vsmov:',
  'vsmov_',
  'kkphim:',
  'kkphim_',
  'nguonc:',
  'nguonc_',
  'stp:',
  'stp_',
  'hh3d:',
  'hh3d_',
  'yan:',
  'yan_',
  'clbpx:',
  'clbpx_',
  'tt',
];

const BASE_MANIFEST = {
  id: 'org.vipmovies.stremio.addon',
  version: '1.5.2',
  name: 'VIP Movies 🎬',
  description:
    'Xem phim Vietsub, thuyết minh chất lượng cao từ Server VIP trực tiếp trên Stremio & Nuvio. Hỗ trợ VSMOV 4K, KKPhim, NguonC, STP, HH3D, YAN, CLBPX & IMDb. Cấu hình 22 Catalog K20 chuẩn quốc tế.',
  logo: 'https://i.imgur.com/3C9XQFP.png',
  resources: [
    'catalog',
    {
      name: 'meta',
      types: ['movie', 'series'],
      idPrefixes: ALL_ID_PREFIXES,
    },
    {
      name: 'stream',
      types: ['movie', 'series'],
      idPrefixes: ALL_ID_PREFIXES,
    },
  ],
  types: ['movie', 'series'],
  idPrefixes: ALL_ID_PREFIXES,
  behaviorHints: {
    adult: false,
    p2p: false,
    configurable: true,
    configurationRequired: false,
  },
};

/**
 * Sinh manifest động dựa trên config của người dùng.
 * @param {object} config - Decoded config object
 * @param {string} [configBaseUrl] - Base URL kèm config token (e.g. "https://host.com/abc123")
 * @returns {object} Stremio-compatible manifest
 */
function buildManifest(config = DEFAULT_CONFIG, configBaseUrl = '') {
  const {
    providers = DEFAULT_CONFIG.providers,
    categories = DEFAULT_CONFIG.categories,
  } = config || {};

  const safeProviders = Array.isArray(providers) && providers.length > 0 ? providers : DEFAULT_CONFIG.providers;
  const safeCategories = Array.isArray(categories) && categories.length > 0 ? categories : DEFAULT_CONFIG.categories;

  // Lọc catalog theo provider + category được chọn
  const filteredCatalogs = ALL_CATALOGS.filter(
    (cat) => safeProviders.includes(cat.provider) && safeCategories.includes(cat.category)
  );

  const catalogs =
    filteredCatalogs.length > 0
      ? filteredCatalogs.map(({ provider: _p, category: _c, ...rest }) => rest)
      : ALL_CATALOGS.filter((c) => safeProviders.includes(c.provider) || c.provider === 'nguonc' || c.provider === 'kkphim')
          .map(({ provider: _p, category: _c, ...rest }) => rest);

  const manifest = {
    ...BASE_MANIFEST,
    catalogs,
  };

  if (configBaseUrl) {
    manifest.behaviorHints = {
      ...manifest.behaviorHints,
      configurationURL: configBaseUrl,
    };
  }

  return manifest;
}

/** Manifest mặc định */
const MANIFEST = buildManifest(DEFAULT_CONFIG);

module.exports = { MANIFEST, GENRES, COUNTRIES, GENRE_NAMES, ALL_CATALOGS, buildManifest, ALL_ID_PREFIXES };
