'use strict';

/**
 * ============================================================
 *  VIP Movies Stremio Addon — src/index.js  (Engine v1.5.0)
 *  Entry point chính của server Express
 *
 *  Architecture:
 *    /hls/*          → src/routes/hls.js    (HLS proxy)
 *    /manifest.json  → src/routes/manifest.js (dynamic manifest)
 *    /:config/*      → src/routes/manifest.js (config-prefixed)
 *    /*              → src/handlers.js      (catalog/meta/stream/UI)
 * ============================================================
 */

const express  = require('express');
const cors     = require('cors');
const handlers = require('./handlers');

// ─── Cấu hình ────────────────────────────────────────────────
const PORT = parseInt(process.env.PORT || '7000', 10);
const HOST = process.env.HOST || '0.0.0.0';

// ─── Khởi tạo Express App ─────────────────────────────────────
const app = express();

// ─── Middleware: CORS ─────────────────────────────────────────
app.use(
  cors({
    origin: '*',
    methods: ['GET', 'POST', 'OPTIONS', 'HEAD'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
    credentials: false,
    maxAge: 86400,
  })
);

app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS, HEAD');
  if (req.method === 'OPTIONS') return res.status(204).end();
  next();
});

// ─── Middleware: Parse JSON ───────────────────────────────────
app.use(express.json());

// ─── Middleware: Request logger ───────────────────────────────
app.use((req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    const ms = Date.now() - start;
    console.log(`${new Date().toISOString()} ${req.method} ${req.originalUrl} → ${res.statusCode} (${ms}ms)`);
  });
  next();
});

// ─── Favicon silence ─────────────────────────────────────────
app.get('/favicon.ico', (req, res) => res.status(204).end());

// ─── HLS Proxy Router ────────────────────────────────────────
// Xử lý /hls/extract, /hls/manifest.m3u8, /hls/ts
const hlsRouter = require('./routes/hls');
app.use('/hls', hlsRouter);

// ─── Dynamic Manifest Router ──────────────────────────────────
// Xử lý:
//   GET /manifest.json               (default)
//   GET /manifest.json?config=<token> (query config)
//   GET /:config/manifest.json        (path config)
//   Middleware: /:config/* → decode config → delegate to handlers
const manifestRouter = require('./routes/manifest');
app.use('/', manifestRouter);

// ─── Stremio Addon Routes ─────────────────────────────────────
// GET /             → Configurator Dashboard
// GET /catalog/...  → Catalog handler
// GET /meta/...     → Meta handler
// GET /stream/...   → Stream handler (multi-provider)
// GET /health       → Health check
app.use('/', handlers);

// ─── 404 Handler ─────────────────────────────────────────────
app.use((req, res) => {
  res.status(404).json({ error: 'Endpoint không tồn tại', path: req.path });
});

// ─── Global Error Handler ─────────────────────────────────────
app.use((err, req, res, _next) => {
  console.error('[Global Error]', err);
  res.status(500).json({ error: 'Lỗi server nội bộ', message: err.message });
});

// ─── Khởi động server ─────────────────────────────────────────
let server = null;
if (require.main === module) {
  server = app.listen(PORT, HOST, () => {
    const addonUrl    = `http://localhost:${PORT}`;
    const manifestUrl = `${addonUrl}/manifest.json`;
    const stremioUrl  = `stremio://localhost:${PORT}/manifest.json`;

    console.log('');
    console.log('╔══════════════════════════════════════════════════════╗');
    console.log('║      🎬  VIP Movies Stremio Addon  Engine v1.5.0     ║');
    console.log('╠══════════════════════════════════════════════════════╣');
    console.log(`║  Server:      ${addonUrl.padEnd(39)}║`);
    console.log(`║  Manifest:    ${manifestUrl.padEnd(39)}║`);
    console.log(`║  HLS Proxy:   ${(addonUrl + '/hls/manifest.m3u8').padEnd(39)}║`);
    console.log(`║  Providers:   NguonC | KKPhim | VsMov                ║`);
    console.log('╠══════════════════════════════════════════════════════╣');
    console.log(`║  Deep Link: ${stremioUrl.substring(0, 43)}║`);
    console.log('╚══════════════════════════════════════════════════════╝');
    console.log('');
  });

  // ─── Graceful shutdown ────────────────────────────────────────
  function gracefulShutdown(signal) {
    console.log(`\n[Server] Nhận ${signal}, đang tắt...`);
    if (server) {
      server.close(() => {
        console.log('[Server] Đã tắt server. Tạm biệt! 👋');
        process.exit(0);
      });
    }
    setTimeout(() => { console.error('[Server] Force exit'); process.exit(1); }, 10_000);
  }

  process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
  process.on('SIGINT',  () => gracefulShutdown('SIGINT'));
}

process.on('uncaughtException',   (err)         => console.error('[uncaughtException]', err));
process.on('unhandledRejection',  (reason, p)   => console.error('[unhandledRejection]', reason));

module.exports = app;
