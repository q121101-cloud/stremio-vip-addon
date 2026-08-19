'use strict';

/**
 * ============================================================
 *  VIP Movies Addon — src/config/constants.js
 *  Central Constants, Bitmask Flags, TTLs & Catalog Definitions
 * ============================================================
 */

const ADDON_ID = 'org.vipmovies.stremio.addon';
const ADDON_NAME = 'VIP Movies 🎬';
const ADDON_VERSION = '1.8.0';
const ADDON_DESCRIPTION =
  'Xem phim Vietsub, thuyết minh chất lượng cao từ Server VIP trực tiếp trên Stremio & Nuvio. Hỗ trợ VSMOV 4K, KKPhim, NguonC & IMDb.';
const ADDON_LOGO = 'https://i.imgur.com/3C9XQFP.png';

// ─── 1. Provider & Category IDs ───────────────────────────────
const ALL_PROVIDERS = ['nguonc', 'kkphim', 'vsmov'];
const VALID_PROVIDERS = ['nguonc', 'kkphim', 'vsmov'];
const VALID_CATEGORIES = ['movie', 'series', 'anime', 'cinema'];

// ─── 2. 16-Bit Bitmask Specifications ─────────────────────────
// Lower 8 bits (0-7): Provider flags
const PROVIDER_BITS = {
  nguonc: 1 << 0, // Bit 0 (1)
  kkphim: 1 << 1, // Bit 1 (2)
  vsmov:  1 << 2, // Bit 2 (4)
};

const DEFAULT_BITMASK = 7; // 1 | 2 | 4 = 7

// Upper 8 bits (8-15): Category flags
const CATEGORY_BITS = {
  movie:  1 << 8,  // 0x0100 (256)
  series: 1 << 9,  // 0x0200 (512)
  anime:  1 << 10, // 0x0400 (1024)
  cinema: 1 << 11, // 0x0800 (2048)
};

const DEFAULT_PROVIDER_MASK = PROVIDER_BITS.nguonc | PROVIDER_BITS.kkphim | PROVIDER_BITS.vsmov; // 7
const DEFAULT_CATEGORY_MASK = CATEGORY_BITS.movie | CATEGORY_BITS.series | CATEGORY_BITS.anime | CATEGORY_BITS.cinema; // 3840 (0x0F00)
const DEFAULT_CONFIG_MASK = DEFAULT_PROVIDER_MASK | DEFAULT_CATEGORY_MASK; // 3847

const DEFAULT_CONFIG = {
  providers: ['nguonc', 'kkphim', 'vsmov'],
  categories: ['movie', 'series', 'anime', 'cinema'],
  apiKey: '',
};

// ─── 3. Cache TTLs (Seconds / MS) ─────────────────────────────
const TTL = {
  SERIES: 4 * 3600,           // 4 hours (14400s)
  MOVIE: 24 * 3600,           // 24 hours (86400s)
  L1_RAM: 10 * 60 * 1000,     // 10 minutes (600000ms)
  MEMORY_DEFAULT: 300,        // 5 phút
  CATALOG: 300,               // 5 phút
  DETAIL: 1800,               // 30 phút
  META: 3600,                 // 1 giờ
  STREAM: 600,                // 10 phút
  CINEMETA: 86400,            // 24 giờ
  IMDB_MAPPING: 86400 * 7,    // 7 ngày
  HLS_MANIFEST: 180,          // 3 phút
  SUBTITLE: 86400,            // 24 giờ
};

// ─── 4. HTTP Timeouts (Milliseconds) ──────────────────────────
const TIMEOUTS = {
  PROVIDER_QUERY: 3000, // Strict 3000ms
  HTTP_FETCH: 5000,
  PROVIDER: 3000,
  CINEMETA: 3000,
  HLS_MANIFEST: 6000,
  HLS_SEGMENT: 15000,
  DB_QUERY: 2000,
};

const TIMEOUT = TIMEOUTS;

// ─── 5. Standard User Agent & Headers ─────────────────────────
const USER_AGENT_CHROME =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

const HLS_REFERERS = [
  { pattern: /kkphimplayer|phim1280|phimapi\.com|kkphim|opstream|vlcdn/i, referer: 'https://player.phimapi.com/', origin: 'https://player.phimapi.com' },
  { pattern: /vsmov|streamvsmov|p25\.streamvsmov/i,                       referer: 'https://vsmov.com/',           origin: 'https://vsmov.com' },
  { pattern: /nguonc\.com/i,                                              referer: 'https://phim.nguonc.com/',     origin: 'https://phim.nguonc.com' },
  { pattern: /streamc\.|amass2\.top/i,                                    referer: 'https://embed15.streamc.xyz/', origin: 'https://embed15.streamc.xyz' },
];

// ─── 6. Genres & Countries ────────────────────────────────────
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

// ─── 7. Standard 10 VIP Catalogs ──────────────────────────────
const ALL_CATALOGS = [
  // ── VSMOV 4K (2 catalogs) ───────────────────────────
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

  // ── KKPhim (4 catalogs) ─────────────────────────────
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

  // ── NguonC (4 catalogs) ────────────────────────────
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
];

const CORE_CATALOGS = [
  {
    provider: 'kkphim',
    type: 'movie',
    id: 'kkphim_phimmoi',
    name: 'KKPhim • Mới Cập Nhật',
  },
  {
    provider: 'kkphim',
    type: 'series',
    id: 'kkphim_phimbo',
    name: 'KKPhim • Phim Bộ',
  },
  {
    provider: 'nguonc',
    type: 'movie',
    id: 'nguonc_phimmoi',
    name: 'NguonC • Mới Cập Nhật',
  },
  {
    provider: 'nguonc',
    type: 'series',
    id: 'nguonc_phimbo',
    name: 'NguonC • Phim Bộ',
  },
  {
    provider: 'vsmov',
    type: 'movie',
    id: 'vsmov_4k',
    name: 'VSMOV • Phim 4K VIP',
  },
];

const ALL_ID_PREFIXES = [
  'vsmov:',
  'vsmov_',
  'kkphim:',
  'kkphim_',
  'nguonc:',
  'nguonc_',
  'tt',
];

module.exports = {
  ADDON_ID,
  ADDON_NAME,
  ADDON_VERSION,
  ADDON_DESCRIPTION,
  ADDON_LOGO,
  ALL_PROVIDERS,
  VALID_PROVIDERS,
  VALID_CATEGORIES,
  PROVIDER_BITS,
  DEFAULT_BITMASK,
  CATEGORY_BITS,
  DEFAULT_PROVIDER_MASK,
  DEFAULT_CATEGORY_MASK,
  DEFAULT_CONFIG_MASK,
  DEFAULT_CONFIG,
  TTL,
  TIMEOUTS,
  TIMEOUT,
  USER_AGENT_CHROME,
  HLS_REFERERS,
  GENRES,
  COUNTRIES,
  GENRE_NAMES,
  ALL_CATALOGS,
  CORE_CATALOGS,
  ALL_ID_PREFIXES,
};
