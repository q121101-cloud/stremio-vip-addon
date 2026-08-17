'use strict';

/**
 * ============================================================
 *  VIP Movies Stremio Addon - src/manifest.js  (v1.4.0)
 *  Định nghĩa manifest của addon theo chuẩn Stremio / Nuvio
 *  Hỗ trợ Dynamic Manifest theo config token
 * ============================================================
 */

const { VALID_PROVIDERS, VALID_CATEGORIES, DEFAULT_CONFIG } = require('./config');

/** Danh sách thể loại & slug tương ứng trên NguonC */
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

/** Danh sách quốc gia & slug tương ứng trên NguonC */
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

// ─── Catalog Definitions Per Provider ────────────────────────

/**
 * Tất cả catalog có thể có, được đánh dấu provider + category
 */
const ALL_CATALOGS = [
  // ── NguonC ──────────────────────────────────────────────
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
    category: 'anime',
    type: 'series',
    id: 'nguonc-anime-latest',
    name: '🐉 NguonC • Hoạt Hình & Anime',
    extra: [
      { name: 'search', isRequired: false },
      { name: 'skip', isRequired: false },
    ],
    extraSupported: ['search', 'skip'],
  },
  {
    provider: 'nguonc',
    category: 'cinema',
    type: 'movie',
    id: 'nguonc-cinema-latest',
    name: '🍿 NguonC • Phim Chiếu Rạp',
    extra: [
      { name: 'search', isRequired: false },
      { name: 'skip', isRequired: false },
    ],
    extraSupported: ['search', 'skip'],
  },
];

// ─── Base Manifest Object ─────────────────────────────────────

const BASE_MANIFEST = {
  id: 'org.vipmovies.stremio.addon',
  version: '1.4.0',
  name: 'VIP Movies 🎬',
  description:
    'Xem phim Vietsub, thuyết minh chất lượng cao từ Server VIP trực tiếp trên Stremio & Nuvio. Hỗ trợ phim lẻ, phim bộ & IMDb. Cấu hình đa nguồn linh hoạt.',
  logo: 'https://i.imgur.com/3C9XQFP.png',
  resources: [
    'catalog',
    {
      name: 'meta',
      types: ['movie', 'series'],
      idPrefixes: ['nguonc:'],
    },
    {
      name: 'stream',
      types: ['movie', 'series'],
      idPrefixes: ['nguonc:', 'tt'],
    },
  ],
  types: ['movie', 'series'],
  idPrefixes: ['nguonc:', 'tt'],
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
  const { providers, categories } = config;

  // Lọc catalog theo provider + category được chọn
  const filteredCatalogs = ALL_CATALOGS.filter(
    (cat) => providers.includes(cat.provider) && categories.includes(cat.category)
  );

  // Nếu không có catalog nào khớp, trả về catalogs mặc định (NguonC movie+series)
  const catalogs =
    filteredCatalogs.length > 0
      ? filteredCatalogs.map(({ provider: _p, category: _c, ...rest }) => rest)
      : ALL_CATALOGS.filter((c) => c.provider === 'nguonc' && ['movie', 'series'].includes(c.category))
          .map(({ provider: _p, category: _c, ...rest }) => rest);

  const manifest = {
    ...BASE_MANIFEST,
    catalogs,
  };

  // Nếu có configBaseUrl, bổ sung configurationURL cho Stremio
  if (configBaseUrl) {
    manifest.behaviorHints = {
      ...manifest.behaviorHints,
      configurationURL: configBaseUrl,
    };
  }

  return manifest;
}

/** Manifest mặc định (đầy đủ tất cả catalog NguonC) */
const MANIFEST = buildManifest(DEFAULT_CONFIG);

module.exports = { MANIFEST, GENRES, COUNTRIES, GENRE_NAMES, ALL_CATALOGS, buildManifest };
