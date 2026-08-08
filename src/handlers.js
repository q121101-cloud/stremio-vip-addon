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
        // Fetch 3 pages concurrently để đảm bảo đủ items sau khi lọc theo type
        const pagePromises = [
          api.getLatestFilms(page),
          api.getLatestFilms(page + 1),
          api.getLatestFilms(page + 2),
        ];

        const results = await Promise.allSettled(pagePromises);
        let collected = [];

        for (const result of results) {
          if (result.status === 'fulfilled') {
            const rawItems = result.value.items || [];
            const filtered = filterByType(rawItems, type);
            collected.push(...filtered);
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
  const slug = mapper.extractSlug(id);

  console.log(`[Meta] type=${type} id=${id} slug=${slug}`);

  if (!slug) {
    return sendError(res, 400, 'ID không hợp lệ');
  }

  try {
    const data = await api.getFilmDetail(slug);

    if (!data || !data.movie) {
      return sendError(res, 404, `Không tìm thấy phim: ${slug}`);
    }

    const meta = mapper.mapDetailMeta(data.movie, type);
    sendJSON(res, { meta });
  } catch (err) {
    console.error(`[Meta Error] slug=${slug}`, err.message);
    sendError(res, 500, `Lỗi lấy thông tin phim: ${err.message}`);
  }
});

// ─────────────────────────────────────────────────────────────
//  ROUTE: /stream/:type/:id.json
// ─────────────────────────────────────────────────────────────
router.get('/stream/:type/:id.json', async (req, res) => {
  const { type, id } = req.params;

  console.log(`[Stream] type=${type} id=${id}`);

  // Parse stream ID
  const parsed = mapper.parseStreamId(id);
  const { slug, serverIdx, epName } = parsed;

  if (!slug) {
    return sendError(res, 400, 'ID stream không hợp lệ');
  }

  try {
    const data = await api.getFilmDetail(slug);

    if (!data || !data.movie) {
      return sendError(res, 404, `Không tìm thấy phim: ${slug}`);
    }

    const movie = data.movie;

    // Xác định tên tập cần lấy
    let targetEpName = epName;

    if (type === 'movie') {
      // Phim lẻ: luôn lấy tập đầu (FULL)
      targetEpName = null;
    }

    const streams = mapper.buildStreams(movie, targetEpName);

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
//  ROUTE: / (trang chủ addon)
// ─────────────────────────────────────────────────────────────
router.get('/', (req, res) => {
  const host = req.headers.host || 'localhost:7000';
  const protocol = req.headers['x-forwarded-proto'] || req.protocol || 'http';
  const baseUrl = `${protocol}://${host}`;

  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.send(`<!DOCTYPE html>
<html lang="vi">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>NguonC Stremio Addon</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
      background: linear-gradient(135deg, #0f0c29, #302b63, #24243e);
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      color: #fff;
    }
    .card {
      background: rgba(255,255,255,0.07);
      backdrop-filter: blur(12px);
      border: 1px solid rgba(255,255,255,0.15);
      border-radius: 20px;
      padding: 48px 40px;
      max-width: 540px;
      width: 90%;
      text-align: center;
      box-shadow: 0 25px 50px rgba(0,0,0,0.5);
    }
    .logo { font-size: 4rem; margin-bottom: 16px; }
    h1 { font-size: 2rem; font-weight: 700; margin-bottom: 8px; }
    .subtitle {
      color: rgba(255,255,255,0.65);
      margin-bottom: 32px;
      font-size: 0.95rem;
      line-height: 1.5;
    }
    .badge {
      display: inline-block;
      padding: 4px 12px;
      border-radius: 20px;
      font-size: 0.8rem;
      font-weight: 600;
      background: rgba(99,102,241,0.3);
      border: 1px solid rgba(99,102,241,0.5);
      margin-bottom: 24px;
    }
    .install-btn {
      display: inline-block;
      padding: 14px 32px;
      background: linear-gradient(135deg, #6366f1, #8b5cf6);
      color: #fff;
      text-decoration: none;
      border-radius: 12px;
      font-weight: 600;
      font-size: 1rem;
      transition: transform 0.2s, box-shadow 0.2s;
      box-shadow: 0 8px 20px rgba(99,102,241,0.4);
      margin-bottom: 16px;
      display: block;
    }
    .install-btn:hover {
      transform: translateY(-2px);
      box-shadow: 0 12px 28px rgba(99,102,241,0.5);
    }
    .manifest-url {
      background: rgba(0,0,0,0.3);
      border: 1px solid rgba(255,255,255,0.1);
      border-radius: 8px;
      padding: 12px 16px;
      font-size: 0.8rem;
      word-break: break-all;
      color: rgba(255,255,255,0.7);
      margin-top: 16px;
      text-align: left;
    }
    .manifest-url span { color: #a78bfa; font-weight: 600; }
    .features {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 12px;
      margin-top: 28px;
      text-align: left;
    }
    .feature {
      background: rgba(255,255,255,0.05);
      border-radius: 10px;
      padding: 12px;
      font-size: 0.85rem;
    }
    .feature .icon { margin-right: 6px; }
    .divider { height: 1px; background: rgba(255,255,255,0.1); margin: 24px 0; }
  </style>
</head>
<body>
  <div class="card">
    <div class="logo">🎬</div>
    <h1>NguonC Addon</h1>
    <p class="subtitle">
      Xem phim Vietsub, thuyết minh chất lượng cao<br/>
      từ <strong>phim.nguonc.com</strong> trực tiếp trên Stremio & Nuvio
    </p>
    <div class="badge">✅ Tương thích Stremio v4 & Nuvio App</div>

    <a class="install-btn" href="stremio://addon/install/${baseUrl}/manifest.json">
      ⚡ Cài đặt vào Stremio
    </a>

    <div class="manifest-url">
      <span>Manifest URL:</span><br/>
      ${baseUrl}/manifest.json
    </div>

    <div class="divider"></div>

    <div class="features">
      <div class="feature"><span class="icon">🎥</span>Phim Lẻ Vietsub</div>
      <div class="feature"><span class="icon">📺</span>Phim Bộ Đa Tập</div>
      <div class="feature"><span class="icon">🔍</span>Tìm Kiếm Nhanh</div>
      <div class="feature"><span class="icon">🏷️</span>Lọc Theo Thể Loại</div>
      <div class="feature"><span class="icon">🌐</span>CORS Full Support</div>
      <div class="feature"><span class="icon">⚡</span>Cache Thông Minh</div>
    </div>
  </div>
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
