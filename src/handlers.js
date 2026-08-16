'use strict';

/**
 * ============================================================
 *  NguonC Stremio Addon - src/handlers.js
 *  Express route handlers cho các Stremio endpoint:
 *    - GET /manifest.json
 *    - GET /catalog/:type/:id/:extra?.json
 *    - GET /meta/:type/:id.json
 *    - GET /stream/:type/:id.json
 * ============================================================
 */

const express = require('express');
const router = express.Router();

const api = require('./api');
const mapper = require('./mapper');
const { MANIFEST, GENRES, COUNTRIES } = require('./manifest');

// ─────────────────────────────────────────────────────────────
//  HELPER: Resolve IMDb ID → streams từ NguonC
// ─────────────────────────────────────────────────────────────
/**
 * Khi Stremio gửi request stream với IMDb ID (tt...) thay vì nguonc:...
 * Flow:
 *   1. Gọi Cinemeta lấy tên phim tiếng Anh
 *   2. Tìm kiếm NguonC bằng tên đó
 *   3. Lấy detail + trả về streams
 *
 * Format ID:
 *   - Movie:  tt1234567
 *   - Series: tt1234567:1:5  (tt:season:episode)
 *
 * @param {string} type - 'movie' | 'series'
 * @param {string} id   - IMDb ID (với hoặc không có :season:ep)
 * @returns {Promise<Array>}
 */
async function resolveImdbStream(type, id, req) {
  // Parse: tt1234567  hoặc  tt1234567:1:5
  const parts = id.split(':');
  const imdbId  = parts[0];               // tt1234567
  const season  = parts[1] ? parseInt(parts[1], 10) : null;
  const episode = parts[2] ? parseInt(parts[2], 10) : null;

  console.log(`[IMDb Stream] ${imdbId} s=${season} e=${episode}`);

  // 1. Tìm slug NguonC tương ứng
  const match = await api.findFilmByImdbId(type, imdbId);
  if (!match) {
    console.warn(`[IMDb Stream] Không tìm được phim cho ${imdbId}`);
    return [];
  }

  // 2. Lấy detail
  const data = await api.getFilmDetail(match.slug);
  if (!data?.movie) {
    console.warn(`[IMDb Stream] Không lấy được detail: ${match.slug}`);
    return [];
  }

  const movie = data.movie;

  // 3. Xác định tên tập
  let epName = null;
  if (type === 'series' && episode !== null) {
    // Thử tìm theo số tập thuần; NguonC đánh số tập theo episode trong season tổng
    epName = String(episode);
  }

  const proxyBase = `${req?.protocol || 'https'}://${req?.get?.('x-forwarded-host') || req?.get?.('host') || ''}`.replace(/\/$/, '');
  const streams = mapper.buildStreams(movie, epName, proxyBase);
  console.log(`[IMDb Stream] ${imdbId} → "${match.name}" → ${streams.length} streams (ep=${epName})`);
  return streams;
}

// ─── Helper: Chuẩn hoá response JSON ─────────────────────────
function sendJSON(res, data) {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', '*');
  res.setHeader('Cache-Control', 'max-age=300, stale-while-revalidate=600');
  return res.json(data);
}

// ─── Helper: Error response ───────────────────────────────────
function sendError(res, statusCode, message) {
  console.error(`[Handler Error] ${message}`);
  res.status(statusCode).json({ error: message });
}

// ─── Helper: Parse extra params từ URL path ───────────────────
/**
 * Stremio truyền extra dưới dạng URL-encoded JSON trong path
 * Ví dụ: /catalog/movie/nguonc-movie-latest/search=action.json
 * Hoặc: /catalog/movie/nguonc-movie-latest/genre=H%C3%A0nh%20%C4%90%E1%BB%99ng&skip=0.json
 * @param {string} extraParam - Chuỗi extra từ params
 */
function parseExtra(extraParam) {
  if (!extraParam) return {};
  try {
    // Bỏ đuôi .json nếu có
    const cleaned = extraParam.replace(/\.json$/, '');
    const result = {};
    for (const part of cleaned.split('&')) {
      const [key, ...valParts] = part.split('=');
      if (key) {
        result[decodeURIComponent(key)] = decodeURIComponent(
          valParts.join('=')
        );
      }
    }
    return result;
  } catch (e) {
    return {};
  }
}

/**
 * Tính page từ skip
 * Stremio dùng skip=0, skip=100, skip=200 (mỗi page 100 items)
 * NguonC dùng page=1, 2, 3 (mỗi page 10 items)
 * → page = Math.floor(skip / 10) + 1
 */
function skipToPage(skip) {
  const s = parseInt(skip, 10) || 0;
  return Math.floor(s / 10) + 1;
}

/**
 * Tìm slug thể loại từ tên thể loại
 */
function findGenreSlug(genreName) {
  const g = GENRES.find(
    (genre) =>
      genre.name.toLowerCase() === genreName.toLowerCase() ||
      genre.slug === genreName.toLowerCase()
  );
  return g ? g.slug : null;
}

/**
 * Lọc danh sách phim theo type (movie hoặc series)
 * @param {Array} items
 * @param {string} type - 'movie' | 'series'
 */
function filterByType(items, type) {
  return items.filter((item) => {
    const detectedType = mapper.detectType(item);
    return detectedType === type;
  });
}

// ─────────────────────────────────────────────────────────────
//  ROUTE: /manifest.json
// ─────────────────────────────────────────────────────────────
router.get('/manifest.json', (req, res) => {
  console.log('[Manifest] Request received');
  sendJSON(res, MANIFEST);
});

// ─────────────────────────────────────────────────────────────
//  ROUTE: /catalog/:type/:id.json
//  ROUTE: /catalog/:type/:id/:extra.json
// ─────────────────────────────────────────────────────────────
router.get(
  ['/catalog/:type/:id/:extra.json', '/catalog/:type/:id.json'],
  async (req, res) => {
    const { type, id, extra: extraParam } = req.params;
    const extra = parseExtra(extraParam);

    const searchQuery = extra.search || req.query.search || null;
    const genreFilter = extra.genre || req.query.genre || null;
    const skip = extra.skip || req.query.skip || '0';
    const page = skipToPage(skip);

    console.log(
      `[Catalog] type=${type} id=${id} search=${searchQuery} genre=${genreFilter} page=${page}`
    );

    try {
      let items = [];

      // ── Chế độ tìm kiếm ──────────────────────────────────
      if (searchQuery) {
        const data = await api.searchFilms(searchQuery, page);
        const rawItems = data.items || [];
        items = filterByType(rawItems, type).map((item) =>
          mapper.mapCatalogItem(item, type)
        );
      }
      // ── Chế độ lọc theo thể loại ─────────────────────────
      else if (genreFilter) {
        const genreSlug = findGenreSlug(genreFilter);
        if (!genreSlug) {
          return sendJSON(res, { metas: [] });
        }
        const data = await api.getFilmsByGenre(genreSlug, page);
        const rawItems = data.items || [];
        items = filterByType(rawItems, type).map((item) =>
          mapper.mapCatalogItem(item, type)
        );
      }
      // ── Chế độ mặc định: phim mới nhất ───────────────────
      else {
        const listSlug = type === 'movie' ? 'phim-le' : 'phim-bo';
        const pagePromises = [
          api.getFilmsByList(listSlug, page).catch(() => api.getLatestFilms(page)),
          api.getFilmsByList(listSlug, page + 1).catch(() => api.getLatestFilms(page + 1)),
        ];

        const results = await Promise.allSettled(pagePromises);
        let collected = [];

        for (const result of results) {
          if (result.status === 'fulfilled') {
            const rawItems = result.value.items || [];
            collected.push(...rawItems);
          }
        }

        items = collected.slice(0, 20).map((item) =>
          mapper.mapCatalogItem(item, type)
        );
      }

      sendJSON(res, { metas: items });
    } catch (err) {
      console.error(`[Catalog Error]`, err.message);
      // Trả về mảng rỗng thay vì lỗi để Stremio không crash
      sendJSON(res, { metas: [] });
    }
  }
);

// ─────────────────────────────────────────────────────────────
//  ROUTE: /meta/:type/:id.json
// ─────────────────────────────────────────────────────────────
router.get('/meta/:type/:id.json', async (req, res) => {
  const { type, id } = req.params;

  // Stremio gửi IMDb ID tt... vào meta — trả về null để Cinemeta xử lý
  if (/^tt\d+/i.test(id)) {
    console.log(`[Meta] IMDb ID được chuyển sang Cinemeta: ${id}`);
    return sendJSON(res, { meta: null });
  }

  const slug = mapper.extractSlug(id);

  console.log(`[Meta] type=${type} id=${id} slug=${slug}`);

  if (!slug) {
    return sendJSON(res, { meta: null });
  }

  try {
    const data = await api.getFilmDetail(slug);

    if (!data || !data.movie) {
      return sendJSON(res, { meta: null });
    }

    const meta = mapper.mapDetailMeta(data.movie, type);
    sendJSON(res, { meta });
  } catch (err) {
    console.error(`[Meta Error] slug=${slug}`, err.message);
    sendJSON(res, { meta: null });
  }
});

// ─────────────────────────────────────────────────────────────
//  ROUTE: /stream/:type/:id.json
//  Hỗ trợ 2 loại ID:
//    - nguonc:{slug}[:{serverIdx}:{epName}]  → native NguonC
//    - tt{digits}[:{season}:{ep}]             → IMDb ID (Cinemeta)
// ─────────────────────────────────────────────────────────────
router.get('/stream/:type/:id.json', async (req, res) => {
  const { type, id } = req.params;

  console.log(`[Stream] type=${type} id=${id}`);

  try {
    // ── Nhánh 1: IMDb ID (tt...) ─────────────────────────────
    if (/^tt\d+/i.test(id)) {
      const streams = await resolveImdbStream(type, id, req);
      return sendJSON(res, { streams });
    }

    // ── Nhánh 2: Native nguonc: ID ───────────────────────────
    const parsed = mapper.parseStreamId(id);
    const { slug, epName } = parsed;

    if (!slug) {
      return sendError(res, 400, 'ID stream không hợp lệ');
    }

    const data = await api.getFilmDetail(slug);

    if (!data || !data.movie) {
      return sendError(res, 404, `Không tìm thấy phim: ${slug}`);
    }

    // Phim lẻ: luôn lấy tập đầu (FULL)
    const targetEpName = type === 'movie' ? null : epName;
    const proxyBase    = `${req.headers['x-forwarded-proto'] || req.protocol}://${req.headers['x-forwarded-host'] || req.get('host')}`.replace(/\/$/, '');
    const streams      = mapper.buildStreams(data.movie, targetEpName, proxyBase);

    if (!streams.length) {
      console.warn(`[Stream] Không có stream cho slug=${slug} ep=${epName}`);
    }

    sendJSON(res, { streams });
  } catch (err) {
    console.error(`[Stream Error] id=${id}`, err.message);
    sendJSON(res, { streams: [] });
  }
});

// ─────────────────────────────────────────────────────────────
router.get('/', (req, res) => {
  const host = req.headers['x-forwarded-host'] || req.headers.host || 'localhost:7000';
  const protocol = req.headers['x-forwarded-proto'] || req.protocol || 'http';
  const baseUrl = `${protocol}://${host}`;
  const manifestUrl = `${baseUrl}/manifest.json`;
  // Stremio deep link: thay thế http(s):// bằng stremio://
  const stremioUrl = `stremio://${host}/manifest.json`;
  // Web Stremio install URL
  const webInstallUrl = `https://web.stremio.com/#/addons?addon=${encodeURIComponent(manifestUrl)}`;

  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.send(`<!DOCTYPE html>
<html lang="vi">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>VIP Movies 🎬 — Stremio & Nuvio Addon</title>
  <meta name="description" content="Xem phim Vietsub, thuyết minh chất lượng cao từ Server VIP trực tiếp trên Stremio & Nuvio. Hỗ trợ phim lẻ, phim bộ & IMDb." />
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  <link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@300;400;500;600;700;800&display=swap" rel="stylesheet" />
  <style>
    :root {
      --primary: #6366f1;
      --accent: #ec4899;
      --secondary: #8b5cf6;
      --cyan: #06b6d4;
      --bg: #07080d;
      --card-bg: rgba(255, 255, 255, 0.03);
      --card-border: rgba(255, 255, 255, 0.08);
      --text-main: #f8fafc;
      --text-muted: #94a3b8;
    }

    * { box-sizing: border-box; margin: 0; padding: 0; }

    body {
      font-family: 'Plus Jakarta Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background-color: var(--bg);
      color: var(--text-main);
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 24px 16px;
      position: relative;
      overflow-x: hidden;
      -webkit-font-smoothing: antialiased;
    }

    /* Ambient Aurora Glows */
    .aurora-bg {
      position: fixed;
      top: 0; left: 0; right: 0; bottom: 0;
      pointer-events: none;
      z-index: 0;
      overflow: hidden;
    }

    .aurora-orb {
      position: absolute;
      border-radius: 50%;
      filter: blur(100px);
      opacity: 0.35;
      animation: floatAurora 18s ease-in-out infinite alternate;
    }

    .orb-1 {
      width: 480px; height: 480px;
      top: -120px; left: -100px;
      background: radial-gradient(circle, #6366f1, #3b82f6);
    }

    .orb-2 {
      width: 520px; height: 520px;
      bottom: -150px; right: -120px;
      background: radial-gradient(circle, #ec4899, #8b5cf6);
      animation-delay: -5s;
    }

    .orb-3 {
      width: 380px; height: 380px;
      top: 40%; left: 50%;
      transform: translate(-50%, -50%);
      background: radial-gradient(circle, #06b6d4, #6366f1);
      opacity: 0.2;
      animation-delay: -10s;
    }

    @keyframes floatAurora {
      0% { transform: translate(0, 0) scale(1); }
      50% { transform: translate(30px, 40px) scale(1.08); }
      100% { transform: translate(-30px, -20px) scale(0.95); }
    }

    /* Central Glass Card */
    .card {
      position: relative;
      z-index: 1;
      background: var(--card-bg);
      backdrop-filter: blur(28px);
      -webkit-backdrop-filter: blur(28px);
      border: 1px solid var(--card-border);
      border-radius: 24px;
      padding: 44px 36px;
      max-width: 640px;
      width: 100%;
      text-align: center;
      box-shadow: 0 30px 60px rgba(0, 0, 0, 0.7), inset 0 1px 0 rgba(255, 255, 255, 0.1);
      transition: border-color 0.3s ease;
    }

    .card:hover {
      border-color: rgba(255, 255, 255, 0.14);
    }

    /* Logo & Glow */
    .logo-wrapper {
      position: relative;
      display: inline-block;
      margin-bottom: 20px;
    }

    .logo-halo {
      position: absolute;
      top: 50%; left: 50%;
      transform: translate(-50%, -50%);
      width: 90px; height: 90px;
      background: radial-gradient(circle, rgba(99, 102, 241, 0.4), transparent 70%);
      border-radius: 50%;
      filter: blur(14px);
    }

    .logo-icon {
      position: relative;
      font-size: 3.6rem;
      line-height: 1;
      display: block;
      filter: drop-shadow(0 8px 16px rgba(0,0,0,0.5));
    }

    /* Typography */
    h1 {
      font-size: 2.3rem;
      font-weight: 800;
      letter-spacing: -0.03em;
      margin-bottom: 10px;
      background: linear-gradient(135deg, #ffffff 0%, #cbd5e1 50%, #c084fc 100%);
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
    }

    .subtitle {
      color: var(--text-muted);
      font-size: 1rem;
      line-height: 1.6;
      font-weight: 400;
      margin-bottom: 24px;
    }

    .subtitle strong {
      color: #e2e8f0;
      font-weight: 600;
    }

    /* Server Status Badge */
    .status-badge {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      padding: 6px 16px;
      border-radius: 9999px;
      font-size: 0.82rem;
      font-weight: 600;
      background: rgba(34, 197, 94, 0.1);
      border: 1px solid rgba(34, 197, 94, 0.25);
      color: #4ade80;
      margin-bottom: 28px;
    }

    .pulse-dot {
      width: 8px; height: 8px;
      background-color: #22c55e;
      border-radius: 50%;
      box-shadow: 0 0 0 0 rgba(34, 197, 94, 0.7);
      animation: pulseGreen 2s infinite;
    }

    @keyframes pulseGreen {
      0% { box-shadow: 0 0 0 0 rgba(34, 197, 94, 0.7); }
      70% { box-shadow: 0 0 0 7px rgba(34, 197, 94, 0); }
      100% { box-shadow: 0 0 0 0 rgba(34, 197, 94, 0); }
    }

    /* Button Group */
    .btn-group {
      display: flex;
      flex-direction: column;
      gap: 12px;
      margin-bottom: 24px;
    }

    .btn {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 10px;
      padding: 15px 28px;
      border-radius: 14px;
      font-weight: 700;
      font-size: 1.02rem;
      text-decoration: none;
      transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1);
      cursor: pointer;
    }

    .btn-primary {
      background: linear-gradient(135deg, #6366f1 0%, #a855f7 50%, #ec4899 100%);
      color: #fff;
      border: 1px solid rgba(255, 255, 255, 0.2);
      box-shadow: 0 10px 25px rgba(99, 102, 241, 0.4);
    }

    .btn-primary:hover {
      transform: translateY(-2px) scale(1.01);
      box-shadow: 0 15px 35px rgba(99, 102, 241, 0.55);
      filter: brightness(1.08);
    }

    .btn-secondary {
      background: rgba(255, 255, 255, 0.04);
      color: #e2e8f0;
      border: 1px solid rgba(255, 255, 255, 0.12);
      box-shadow: 0 4px 16px rgba(0, 0, 0, 0.3);
    }

    .btn-secondary:hover {
      background: rgba(255, 255, 255, 0.08);
      border-color: rgba(255, 255, 255, 0.25);
      transform: translateY(-1px);
      color: #fff;
    }

    /* Smart Manifest URL Box */
    .manifest-box {
      background: rgba(0, 0, 0, 0.4);
      border: 1px dashed rgba(255, 255, 255, 0.16);
      border-radius: 12px;
      padding: 14px 18px;
      margin-bottom: 28px;
      text-align: left;
      cursor: pointer;
      position: relative;
      transition: all 0.2s ease;
    }

    .manifest-box:hover {
      border-color: rgba(167, 139, 250, 0.6);
      background: rgba(0, 0, 0, 0.55);
    }

    .manifest-label {
      display: flex;
      justify-content: space-between;
      align-items: center;
      font-size: 0.78rem;
      font-weight: 600;
      color: #a78bfa;
      margin-bottom: 6px;
      text-transform: uppercase;
      letter-spacing: 0.04em;
    }

    .manifest-value {
      font-family: 'JetBrains Mono', Consolas, Monaco, monospace;
      font-size: 0.84rem;
      color: #cbd5e1;
      word-break: break-all;
      line-height: 1.4;
    }

    .copy-badge {
      font-size: 0.72rem;
      padding: 2px 8px;
      border-radius: 6px;
      background: rgba(167, 139, 250, 0.15);
      color: #c084fc;
      font-weight: 500;
    }

    /* Floating Toast */
    .toast {
      position: fixed;
      bottom: 28px;
      left: 50%;
      transform: translateX(-50%) translateY(100px);
      background: rgba(15, 23, 42, 0.95);
      border: 1px solid rgba(34, 197, 94, 0.4);
      color: #4ade80;
      backdrop-filter: blur(16px);
      padding: 12px 24px;
      border-radius: 9999px;
      font-size: 0.9rem;
      font-weight: 600;
      box-shadow: 0 16px 36px rgba(0, 0, 0, 0.6);
      display: flex;
      align-items: center;
      gap: 8px;
      opacity: 0;
      pointer-events: none;
      transition: all 0.35s cubic-bezier(0.34, 1.56, 0.64, 1);
      z-index: 100;
    }

    .toast.show {
      transform: translateX(-50%) translateY(0);
      opacity: 1;
    }

    .divider {
      height: 1px;
      background: linear-gradient(90deg, transparent, rgba(255, 255, 255, 0.1), transparent);
      margin: 28px 0;
    }

    /* Feature Grid (8 Mini-Cards) */
    .features-title {
      font-size: 0.82rem;
      font-weight: 700;
      color: var(--text-muted);
      text-transform: uppercase;
      letter-spacing: 0.08em;
      margin-bottom: 16px;
      text-align: left;
    }

    .features-grid {
      display: grid;
      grid-template-columns: repeat(2, 1fr);
      gap: 10px;
    }

    @media (min-width: 520px) {
      .features-grid {
        grid-template-columns: repeat(2, 1fr);
      }
    }

    .feature-card {
      background: rgba(255, 255, 255, 0.02);
      border: 1px solid rgba(255, 255, 255, 0.05);
      border-radius: 12px;
      padding: 12px 14px;
      text-align: left;
      transition: all 0.2s ease;
    }

    .feature-card:hover {
      background: rgba(255, 255, 255, 0.05);
      border-color: rgba(255, 255, 255, 0.12);
      transform: translateY(-1px);
    }

    .feature-head {
      display: flex;
      align-items: center;
      gap: 8px;
      font-size: 0.88rem;
      font-weight: 700;
      color: #f1f5f9;
      margin-bottom: 3px;
    }

    .feature-desc {
      font-size: 0.75rem;
      color: var(--text-muted);
      line-height: 1.35;
    }

    /* Footer */
    .footer {
      margin-top: 24px;
      font-size: 0.76rem;
      color: rgba(148, 163, 184, 0.6);
    }
  </style>
</head>
<body>
  <!-- Ambient Aurora Background Elements -->
  <div class="aurora-bg">
    <div class="aurora-orb orb-1"></div>
    <div class="aurora-orb orb-2"></div>
    <div class="aurora-orb orb-3"></div>
  </div>

  <!-- Central Glassmorphism Card -->
  <main class="card">
    <div class="logo-wrapper">
      <div class="logo-halo"></div>
      <span class="logo-icon">🎬</span>
    </div>

    <h1>VIP Movies Addon</h1>
    <p class="subtitle">
      Xem phim Vietsub & Thuyết minh tốc độ cao từ <strong>Server VIP</strong><br/>
      trực tiếp trên Stremio, Nuvio và mọi nền tảng trình phát HLS.
    </p>

    <div class="status-badge">
      <div class="pulse-dot"></div>
      <span>Hệ thống Trực tuyến • v1.3.8</span>
    </div>

    <!-- Call to Action Buttons -->
    <div class="btn-group">
      <a class="btn btn-primary" href="${stremioUrl}" id="stremio-install-btn">
        <span>⚡</span> Cài đặt vào Stremio App
      </a>
      <a class="btn btn-secondary" href="${webInstallUrl}" target="_blank" rel="noopener">
        <span>🌐</span> Mở trên Stremio Web
      </a>
    </div>

    <!-- Manifest URL Copy Box -->
    <div class="manifest-box" onclick="copyManifest()" title="Bấm để sao chép liên kết">
      <div class="manifest-label">
        <span>Manifest URL</span>
        <span class="copy-badge">📋 Bấm để Copy</span>
      </div>
      <div class="manifest-value">${manifestUrl}</div>
    </div>

    <div class="divider"></div>

    <!-- 8 Features Grid -->
    <div class="features-title">Tính năng & Công nghệ nổi bật</div>
    <div class="features-grid">
      <div class="feature-card">
        <div class="feature-head"><span>🎥</span> Phim Lẻ Vietsub</div>
        <div class="feature-desc">Bom tấn chiếu rạp, Hollywood Full HD.</div>
      </div>
      <div class="feature-card">
        <div class="feature-head"><span>📺</span> Phim Bộ Đa Tập</div>
        <div class="feature-desc">K-Drama, Cổ trang Trung Quốc, US Series.</div>
      </div>
      <div class="feature-card">
        <div class="feature-head"><span>⚡</span> HLS Proxy Tốc độ cao</div>
        <div class="feature-desc">Stream trực tiếp không giới hạn băng thông.</div>
      </div>
      <div class="feature-card">
        <div class="feature-head"><span>🍿</span> Hoạt Hình & Anime</div>
        <div class="feature-desc">Kho Anime Nhật Bản, Hoạt hình 3D trọn bộ.</div>
      </div>
      <div class="feature-card">
        <div class="feature-head"><span>🎬</span> Khớp TMDb & IMDb</div>
        <div class="feature-desc">Nhận diện thông minh qua Cinemeta Catalog.</div>
      </div>
      <div class="feature-card">
        <div class="feature-head"><span>🔄</span> Cơ chế Stream Kép</div>
        <div class="feature-desc">Tự động điều hướng HLS Proxy & Embed Player.</div>
      </div>
      <div class="feature-card">
        <div class="feature-head"><span>📱</span> Đa nền tảng</div>
        <div class="feature-desc">Tương thích Stremio v4, Nuvio, Android TV.</div>
      </div>
      <div class="feature-card">
        <div class="feature-head"><span>🌐</span> CORS Mở & Cache 24h</div>
        <div class="feature-desc">Tải dữ liệu siêu tốc, độ trễ tiệm cận 0ms.</div>
      </div>
    </div>

    <div class="footer">
      VIP Movies Addon v1.3.8 • Powered by Q121101
    </div>
  </main>

  <!-- Notification Toast -->
  <div class="toast" id="copy-toast">
    <span>✨</span> Đã sao chép liên kết vào Clipboard!
  </div>

  <script>
    // Client-side guard: đảm bảo deep link stremio:// luôn chuẩn xác theo origin hiện tại
    (function() {
      var btn = document.getElementById('stremio-install-btn');
      if (btn) {
        var origin = window.location.origin.replace(/^https?:\\/\\//, 'stremio://');
        btn.href = origin + '/manifest.json';
      }
    })();

    function copyManifest() {
      var url = window.location.origin + '/manifest.json';
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(url).then(showToast).catch(function() { fallbackCopy(url); });
      } else {
        fallbackCopy(url);
      }
    }

    function fallbackCopy(text) {
      var ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.focus(); ta.select();
      try { document.execCommand('copy'); showToast(); } catch(e) {}
      document.body.removeChild(ta);
    }

    function showToast() {
      var t = document.getElementById('copy-toast');
      if (t) {
        t.classList.add('show');
        setTimeout(function() { t.classList.remove('show'); }, 2200);
      }
    }
  </script>
</body>
</html>`);
});

// ─── Health check ─────────────────────────────────────────────
router.get('/health', (req, res) => {
  const stats = api.getCacheStats();
  sendJSON(res, {
    status: 'ok',
    version: MANIFEST.version,
    cache: stats,
    timestamp: new Date().toISOString(),
  });
});

// ─── Cache clear (admin) ──────────────────────────────────────
router.post('/admin/cache/clear', (req, res) => {
  api.clearCache();
  sendJSON(res, { message: 'Cache đã được xóa' });
});

module.exports = router;
