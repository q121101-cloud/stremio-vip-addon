'use strict';

/**
 * ============================================================
 *  NguonC Stremio Addon - src/manifest.js
 *  Định nghĩa manifest của addon theo chuẩn Stremio / Nuvio
 * ============================================================
 */

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

const MANIFEST = {
  id: 'org.nguonc.stremio.addon',
  version: '1.3.6',
  name: 'VIP Movies 🎬',
  description:
    'Xem phim Vietsub, thuyết minh chất lượng cao từ Server VIP trực tiếp trên Stremio & Nuvio. Hỗ trợ phim lẻ, phim bộ & IMDb.',
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
    configurable: false,
    configurationRequired: false,
  },
  catalogs: [
    // ─── PHIM LẺ ────────────────────────────────────────────
    {
      type: 'movie',
      id: 'nguonc-movie-latest',
      name: 'NguonC - Phim Lẻ Mới',
      extra: [
        { name: 'search', isRequired: false },
        { name: 'genre', isRequired: false, options: GENRE_NAMES },
        { name: 'skip', isRequired: false },
      ],
      extraSupported: ['search', 'genre', 'skip'],
    },
    // ─── PHIM BỘ ────────────────────────────────────────────
    {
      type: 'series',
      id: 'nguonc-series-latest',
      name: 'NguonC - Phim Bộ Mới',
      extra: [
        { name: 'search', isRequired: false },
        { name: 'genre', isRequired: false, options: GENRE_NAMES },
        { name: 'skip', isRequired: false },
      ],
      extraSupported: ['search', 'genre', 'skip'],
    },
  ],
};

module.exports = { MANIFEST, GENRES, COUNTRIES, GENRE_NAMES };
