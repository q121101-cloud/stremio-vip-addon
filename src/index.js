'use strict';

/**
 * ============================================================
 *  NguonC Stremio Addon - src/index.js
 *  Entry point chính của server Express
 *
 *  Chạy: node src/index.js
 *  Dev:  nodemon src/index.js
 * ============================================================
 */

const express = require('express');
const cors = require('cors');
const handlers = require('./handlers');

// ─── Cấu hình ────────────────────────────────────────────────
const PORT = parseInt(process.env.PORT || '7000', 10);
const HOST = process.env.HOST || '0.0.0.0';

// ─── Khởi tạo Express App ─────────────────────────────────────
const app = express();

// ─── Middleware: CORS (bắt buộc cho Stremio & Nuvio) ─────────
app.use(
  cors({
    origin: '*',
    methods: ['GET', 'POST', 'OPTIONS', 'HEAD'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
    credentials: false,
    maxAge: 86400, // 24h preflight cache
  })
);

// Bắt buộc thêm header CORS thủ công để đảm bảo tương thích 100%
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS, HEAD');

  // Preflight request
  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }
  next();
});

// ─── Middleware: Parse JSON body ──────────────────────────────
app.use(express.json());

// ─── Middleware: Request logger ───────────────────────────────
app.use((req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    const duration = Date.now() - start;
    console.log(
      `${new Date().toISOString()} ${req.method} ${req.originalUrl} → ${res.statusCode} (${duration}ms)`
    );
  });
  next();
});

// ─── Routes ───────────────────────────────────────────────────
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
const server = app.listen(PORT, HOST, () => {
  const addonUrl = `http://localhost:${PORT}`;
  const manifestUrl = `${addonUrl}/manifest.json`;
  const stremioUrl = `stremio://addon/install/${manifestUrl}`;

  console.log('');
  console.log('╔══════════════════════════════════════════════════════╗');
  console.log('║          🎬  NguonC Stremio Addon v1.0.0             ║');
  console.log('╠══════════════════════════════════════════════════════╣');
  console.log(`║  Server:    ${addonUrl.padEnd(41)}║`);
  console.log(`║  Manifest:  ${manifestUrl.padEnd(41)}║`);
  console.log('╠══════════════════════════════════════════════════════╣');
  console.log('║  Cách cài đặt:                                       ║');
  console.log('║  1. Mở Stremio → Addon → Community Addons           ║');
  console.log('║  2. Paste URL manifest vào ô tìm kiếm               ║');
  console.log('║  3. Hoặc dùng lệnh:                                  ║');
  console.log(`║     ${stremioUrl.substring(0, 49)}║`);
  console.log('╚══════════════════════════════════════════════════════╝');
  console.log('');
});

// ─── Graceful shutdown ────────────────────────────────────────
function gracefulShutdown(signal) {
  console.log(`\n[Server] Nhận tín hiệu ${signal}, đang tắt server...`);
  server.close(() => {
    console.log('[Server] Đã tắt server. Tạm biệt! 👋');
    process.exit(0);
  });

  // Force exit sau 10 giây nếu server không close được
  setTimeout(() => {
    console.error('[Server] Force exit sau timeout');
    process.exit(1);
  }, 10_000);
}

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

// Xử lý uncaught exceptions để server không crash
process.on('uncaughtException', (err) => {
  console.error('[uncaughtException]', err);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('[unhandledRejection] at:', promise, 'reason:', reason);
});

module.exports = app; // Export để testing
