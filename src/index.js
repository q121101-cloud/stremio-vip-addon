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

// ─── Favicon: tắt log 404 rác do trình duyệt tự gọi ──────────
app.get('/favicon.ico', (req, res) => res.status(204).end());

// ─── HLS Proxy Engine ─────────────────────────────────────
// /hls/m3u8?url=<encoded>&referer=<encoded>  → Playlist rewrite proxy
// /hls/ts?url=<encoded>&referer=<encoded>    → Segment pipe proxy
const axios = require('axios');

const HLS_UA     = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36';
const HLS_DEFREF = 'https://phim.nguonc.com/';
const { extractM3u8FromEmbed } = require('./mapper');
const mapper = require('./mapper');

/**
 * /hls/extract?embed=<encoded_embed_url> | ?b64=<base64url>
 * Lazy extraction endpoint: fetch embed → extract m3u8 → proxy via /hls/manifest.m3u8
 * Uses Base64URL Safe encoding to eliminate any URL mangling or Apache 404 issues.
 */
app.get('/hls/extract', async (req, res) => {
  let embedUrl = req.query.embed;
  if (req.query.b64) {
    try { embedUrl = Buffer.from(req.query.b64, 'base64url').toString('utf8'); } catch {}
  }
  if (!embedUrl) return res.status(400).send('Missing embed url');

  const protoHost = `${req.headers['x-forwarded-proto'] || req.protocol}://${req.headers['x-forwarded-host'] || req.get('host')}`;

  try {
    const result = await mapper.extractM3u8FromEmbed(embedUrl);
    if (!result) {
      console.warn('[HLS/extract] Could not extract m3u8 from:', embedUrl.slice(0, 80));
      return res.status(502).send('Could not extract stream URL from embed');
    }

    const { m3u8Url } = result;
    const b64M3u8 = Buffer.from(m3u8Url).toString('base64url');
    const b64Ref  = Buffer.from(embedUrl).toString('base64url');

    // Redirect to our /hls/manifest.m3u8 proxy using base64url parameters
    const proxyUrl = `${protoHost}/hls/manifest.m3u8?b64=${b64M3u8}&ref=${b64Ref}`;
    console.log(`[HLS/extract] ${embedUrl.slice(0, 60)} → ${m3u8Url.slice(0, 60)}`);
    res.redirect(302, proxyUrl);
  } catch (err) {
    console.error('[HLS/extract]', err.message);
    if (!res.headersSent) res.status(502).send('Extract error: ' + err.message);
  }
});

app.get(['/hls/manifest.m3u8', '/hls/m3u8'], async (req, res) => {
  let targetUrl = req.query.url;
  if (req.query.b64) {
    try { targetUrl = Buffer.from(req.query.b64, 'base64url').toString('utf8'); } catch {}
  }
  if (!targetUrl) return res.status(400).send('Missing url');

  let refererUrl = HLS_DEFREF;
  if (req.query.ref) {
    try { refererUrl = Buffer.from(req.query.ref, 'base64url').toString('utf8'); } catch {}
  } else if (req.query.referer) {
    try { refererUrl = decodeURIComponent(req.query.referer); } catch { refererUrl = req.query.referer; }
  }

  let origin = HLS_DEFREF.replace(/\/$/, '');
  try { origin = new URL(refererUrl).origin; } catch {}

  const protoHost = `${req.headers['x-forwarded-proto'] || req.protocol}://${req.headers['x-forwarded-host'] || req.get('host')}`;

  try {
    const r = await axios({
      url: targetUrl,
      method: 'GET',
      responseType: 'text',
      headers: { 'User-Agent': HLS_UA, Referer: refererUrl, Origin: origin },
      timeout: 15000,
      maxRedirects: 5,
    });

    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Headers', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
    res.setHeader('Content-Type', 'application/vnd.apple.mpegurl; charset=utf-8');

    let baseUrl;
    try { baseUrl = new URL(targetUrl); } catch { return res.send(r.data); }

    // Preserve full hash referer encoded as base64url
    const encodedRef = Buffer.from(refererUrl).toString('base64url');

    const rewritten = String(r.data).split('\n').map((line) => {
      const t = line.trim();
      if (!t || t.startsWith('#')) {
        if (t.startsWith('#EXT-X-KEY') && t.includes('URI=')) {
          return t.replace(/URI="([^"]+)"/, (_, uri) => {
            const absUri = uri.startsWith('http') ? uri : new URL(uri, baseUrl.href).href;
            const b64Key = Buffer.from(absUri).toString('base64url');
            return `URI="${protoHost}/hls/ts?b64=${b64Key}&ref=${encodedRef}&is_key=1"`;
          });
        }
        if (t.startsWith('#EXT-X-MAP') && t.includes('URI=')) {
          return t.replace(/URI="([^"]+)"/, (_, uri) => {
            const absUri = uri.startsWith('http') ? uri : new URL(uri, baseUrl.href).href;
            const b64Map = Buffer.from(absUri).toString('base64url');
            return `URI="${protoHost}/hls/ts?b64=${b64Map}&ref=${encodedRef}"`;
          });
        }
        return line;
      }

      // Segment or Sub-playlist URI
      const absUrl = t.startsWith('http') ? t : new URL(t, baseUrl.href).href;
      const b64Url = Buffer.from(absUrl).toString('base64url');

      if (absUrl.includes('.m3u8')) {
        return `${protoHost}/hls/manifest.m3u8?b64=${b64Url}&ref=${encodedRef}`;
      }
      return `${protoHost}/hls/ts?b64=${b64Url}&ref=${encodedRef}`;
    }).join('\n');

    res.send(rewritten);
  } catch (err) {
    console.error('[HLS/manifest]', err.message, targetUrl.slice(0, 80));
    if (!res.headersSent) res.status(502).send('HLS Proxy Error: ' + err.message);
  }
});

app.get('/hls/ts', async (req, res) => {
  let targetUrl = req.query.url;
  if (req.query.b64) {
    try { targetUrl = Buffer.from(req.query.b64, 'base64url').toString('utf8'); } catch {}
  }
  if (!targetUrl) return res.status(400).send('Missing url');

  let refererUrl = null;
  if (req.query.ref) {
    try { refererUrl = Buffer.from(req.query.ref, 'base64url').toString('utf8'); } catch {}
  } else if (req.query.referer) {
    try { refererUrl = decodeURIComponent(req.query.referer); } catch { refererUrl = req.query.referer; }
  }
  if (!refererUrl) {
    try { refererUrl = new URL(targetUrl).origin + '/'; } catch { refererUrl = HLS_DEFREF; }
  }

  let origin = refererUrl.replace(/\/$/, '');
  try { origin = new URL(refererUrl).origin; } catch {}

  try {
    const r = await axios({
      url: targetUrl,
      method: 'GET',
      responseType: 'stream',
      headers: {
        'User-Agent': HLS_UA,
        Referer: refererUrl,
        Origin: origin,
      },
      timeout: 25000,
      maxRedirects: 5,
    });

    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Headers', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
    res.setHeader('Cache-Control', 'public, max-age=86400');

    // BẮT BUỘC ghi đè Content-Type thành video/mp2t (tránh MIME image/png từ CDN làm đen màn hình)
    const isKey = req.query.is_key === '1' || targetUrl.includes('.key');
    if (isKey) {
      res.setHeader('Content-Type', 'application/octet-stream');
    } else {
      res.setHeader('Content-Type', 'video/mp2t');
    }

    if (r.headers['content-length']) res.setHeader('Content-Length', r.headers['content-length']);

    r.data.pipe(res);
    r.data.on('error', (e) => {
      console.error('[HLS/ts] Stream error:', e.message);
      if (!res.headersSent) res.status(502).end();
    });
  } catch (err) {
    console.error('[HLS/ts]', err.message, targetUrl.slice(0, 80));
    if (!res.headersSent) res.status(502).send('HLS Segment Error');
  }
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
  const addonUrl   = `http://localhost:${PORT}`;
  const manifestUrl = `${addonUrl}/manifest.json`;
  const stremioUrl  = `stremio://localhost:${PORT}/manifest.json`;

  console.log('');
  console.log('╔══════════════════════════════════════════════════════╗');
  console.log('║        🎬  VIP Movies Stremio Addon  v1.3.5          ║');
  console.log('╠══════════════════════════════════════════════════════╣');
  console.log(`║  Server:    ${addonUrl.padEnd(41)}║`);
  console.log(`║  Manifest:  ${manifestUrl.padEnd(41)}║`);
  console.log(`║  HLS Proxy: ${(addonUrl + '/hls/manifest.m3u8').padEnd(41)}║`);
  console.log('╠══════════════════════════════════════════════════════╣');
  console.log('║  Deep Link Cài đặt:                                  ║');
  console.log(`║  ${stremioUrl.substring(0, 52)}║`);
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
