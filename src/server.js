'use strict';

/**
 * ============================================================
 *  VIP Movies Addon — src/server.js (Engine v1.8.0 Enterprise)
 *  Express Application Instance (Vercel Serverless & Render)
 * ============================================================
 */

require('dotenv').config();
const express = require('express');
const cors = require('cors');

const hlsRouter = require('./routes/hls');
const manifestRouter = require('./routes/manifest');
const catalogRouter = require('./routes/catalog');
const metaRouter = require('./routes/meta');
const streamRouter = require('./routes/stream');
const { handleNguonCProxy } = require('./workers/indexer');
const { decodeConfig, encodeConfig, isConfigToken, getDefaultToken } = require('./config/compressor');
const { ADDON_VERSION, DEFAULT_CONFIG } = require('./config/constants');
const { catalogCache, metaCache, streamCache, imdbCache } = require('./db/cache');
const supabaseDb = require('./db/supabase');

const app = express();

// ─── Middleware: CORS ─────────────────────────────────────────
app.use(
  cors({
    origin: '*',
    methods: ['GET', 'POST', 'OPTIONS', 'HEAD'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Range'],
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

// ─── Middleware: Request Logger ───────────────────────────────
app.use((req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    const ms = Date.now() - start;
    if (!req.originalUrl.startsWith('/health') && !req.originalUrl.startsWith('/favicon')) {
      console.log(`${new Date().toISOString()} ${req.method} ${req.originalUrl} → ${res.statusCode} (${ms}ms)`);
    }
  });
  next();
});

// ─── Favicon silence ─────────────────────────────────────────
app.get('/favicon.ico', (req, res) => res.status(204).end());

// ─── Health Check Endpoint ───────────────────────────────────
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    addon: 'VIP Movies Stremio Addon',
    version: ADDON_VERSION,
    database: {
      supabaseReady: supabaseDb.isReady(),
    },
    cache: {
      catalog: catalogCache.stats,
      meta: metaCache.stats,
      stream: streamCache.stats,
      imdb: imdbCache.stats,
    },
    uptimeSeconds: Math.floor(process.uptime()),
    timestamp: new Date().toISOString(),
  });
});

// ─── NguonC Stealth Proxy Forwarding ──────────────────────────
app.get(['/proxy/nguonc', '/api/nguonc-proxy'], handleNguonCProxy);

// ─── Mount HLS Proxy ─────────────────────────────────────────
app.use('/hls', hlsRouter);

// ─── Mount Stremio Addon Routes ──────────────────────────────
app.use('/', manifestRouter);
app.use('/', catalogRouter);
app.use('/', metaRouter);
app.use('/', streamRouter);

// ─── Configurator Dashboard UI (OLED True Black Glassmorphism)
function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function renderConfiguratorHtml(req, res) {
  const host     = req.headers['x-forwarded-host'] || req.headers.host || 'localhost:7000';
  const protocol = req.headers['x-forwarded-proto'] || req.protocol || 'http';
  const baseUrl  = `${protocol}://${host}`;

  let configToken = req.params.config || req.query.config || null;
  let resolvedConfig = DEFAULT_CONFIG;

  if (configToken && isConfigToken(configToken)) {
    resolvedConfig = decodeConfig(configToken);
  } else {
    configToken = encodeConfig(DEFAULT_CONFIG);
  }

  const currentManifestUrl = `${baseUrl}/${configToken}/manifest.json`;
  const stremioUrl = baseUrl.replace(/^https?:\/\//, 'stremio://') + `/${configToken}/manifest.json`;
  const webInstallUrl = `https://web.stremio.com/#/addons?addon=${encodeURIComponent(currentManifestUrl)}`;

  const isProvActive = (p) => resolvedConfig.providers.includes(p);
  const isCatActive  = (c) => resolvedConfig.categories.includes(c);

  const html = `<!DOCTYPE html>
<html lang="vi">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>VIP Movies 🎬 — Stremio &amp; Nuvio VIP Addon</title>
  <meta name="description" content="Stremio VIP Movies Addon — Xem phim Vietsub, Thuyết Minh 4K Ultra HD &amp; Full HD trực tiếp từ VSMOV, KKPhim, NguonC" />
  <link rel="icon" href="https://i.imgur.com/3C9XQFP.png" />
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  <link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&family=JetBrains+Mono:wght@400;500;600&display=swap" rel="stylesheet" />
  <style>
    :root {
      --bg-base: #07090e;
      --bg-surface: #0e121a;
      --border-subtle: rgba(255, 255, 255, 0.08);
      --border-hover: rgba(255, 255, 255, 0.16);
      --text-primary: #f8fafc;
      --text-secondary: #94a3b8;
      --text-muted: #64748b;
      --cyan: #06b6d4;
      --cyan-glow: rgba(6, 182, 212, 0.35);
      --pink: #ec4899;
      --pink-glow: rgba(236, 72, 153, 0.35);
      --indigo: #6366f1;
      --indigo-glow: rgba(99, 102, 241, 0.35);
      --radius-lg: 20px;
      --radius-md: 14px;
      --radius-full: 9999px;
      --transition-smooth: 0.25s cubic-bezier(0.16, 1, 0.3, 1);
      --spring-physics: 0.4s cubic-bezier(0.34, 1.56, 0.64, 1);
    }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      background-color: var(--bg-base);
      color: var(--text-primary);
      font-family: 'Plus Jakarta Sans', -apple-system, BlinkMacSystemFont, sans-serif;
      min-height: 100vh;
      display: flex;
      flex-direction: column;
      align-items: center;
      padding: 40px 20px 120px;
      overflow-x: hidden;
      position: relative;
    }
    /* Ambient Aurora Glow */
    body::before {
      content: '';
      position: fixed;
      top: -15%; left: 50%;
      transform: translateX(-50%);
      width: 700px; height: 450px;
      background: radial-gradient(ellipse at center, rgba(99, 102, 241, 0.18), rgba(6, 182, 212, 0.12), transparent 70%);
      filter: blur(80px);
      pointer-events: none;
      z-index: 0;
    }
    .taste-container {
      width: 100%;
      max-width: 860px;
      display: flex;
      flex-direction: column;
      gap: 24px;
      position: relative;
      z-index: 1;
    }
    /* Header Card */
    .header-card {
      background: var(--bg-surface);
      border: 1px solid var(--border-subtle);
      border-radius: var(--radius-lg);
      padding: 32px 28px;
      display: flex;
      align-items: center;
      gap: 24px;
      box-shadow: 0 20px 40px rgba(0, 0, 0, 0.6);
      backdrop-filter: blur(24px);
    }
    .header-logo-badge {
      width: 76px; height: 76px;
      border-radius: 20px;
      background: linear-gradient(135deg, rgba(99, 102, 241, 0.2), rgba(6, 182, 212, 0.2));
      border: 1px solid rgba(255, 255, 255, 0.15);
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 2.4rem;
      box-shadow: 0 0 30px rgba(99, 102, 241, 0.35);
      flex-shrink: 0;
    }
    .header-title-group {
      display: flex;
      flex-direction: column;
      gap: 6px;
    }
    .title-row {
      display: flex;
      align-items: center;
      gap: 12px;
      flex-wrap: wrap;
    }
    h1 {
      font-size: 1.75rem;
      font-weight: 800;
      letter-spacing: -0.03em;
      background: linear-gradient(135deg, #ffffff 30%, #cbd5e1 100%);
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
    }
    .version-pill {
      font-family: 'JetBrains Mono', monospace;
      font-size: 0.75rem;
      font-weight: 600;
      padding: 4px 10px;
      border-radius: var(--radius-full);
      background: rgba(99, 102, 241, 0.15);
      border: 1px solid rgba(99, 102, 241, 0.35);
      color: #a5b4fc;
    }
    .live-status-pill {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      font-size: 0.75rem;
      font-weight: 600;
      padding: 4px 12px;
      border-radius: var(--radius-full);
      background: rgba(16, 185, 129, 0.12);
      border: 1px solid rgba(16, 185, 129, 0.3);
      color: #6ee7b7;
    }
    .status-dot {
      width: 7px; height: 7px;
      border-radius: 50%;
      background: #10b981;
      box-shadow: 0 0 10px #10b981;
      animation: pulse-dot 2s infinite ease-in-out;
    }
    @keyframes pulse-dot {
      0%, 100% { transform: scale(1); opacity: 1; }
      50% { transform: scale(1.3); opacity: 0.6; }
    }
    .header-desc {
      font-size: 0.88rem;
      color: var(--text-secondary);
      line-height: 1.5;
    }
    /* Bento Grid Card */
    .taste-card {
      background: var(--bg-surface);
      border: 1px solid var(--border-subtle);
      border-radius: var(--radius-lg);
      padding: 26px;
      box-shadow: 0 16px 36px rgba(0, 0, 0, 0.5);
    }
    .card-header-label {
      font-size: 0.75rem;
      font-weight: 700;
      color: var(--text-muted);
      text-transform: uppercase;
      letter-spacing: 0.09em;
      margin-bottom: 16px;
      display: flex;
      align-items: center;
      gap: 10px;
    }
    .card-header-label::after {
      content: '';
      flex: 1;
      height: 1px;
      background: linear-gradient(90deg, rgba(255, 255, 255, 0.1), transparent);
    }
    /* Action Pills */
    .pill-grid {
      display: flex;
      flex-wrap: wrap;
      gap: 10px;
      align-items: center;
    }
    .action-pill {
      display: inline-flex;
      align-items: center;
      gap: 7px;
      padding: 8px 16px;
      border-radius: var(--radius-full);
      font-size: 0.84rem;
      font-weight: 600;
      font-family: inherit;
      border: 1px solid var(--border-subtle);
      background: rgba(255, 255, 255, 0.035);
      color: var(--text-secondary);
      cursor: pointer;
      transition: all var(--transition-smooth);
      user-select: none;
    }
    .action-pill:hover {
      background: rgba(255, 255, 255, 0.08);
      border-color: var(--border-hover);
      color: var(--text-primary);
      transform: translateY(-1.5px);
    }
    .action-pill.active {
      background: rgba(99, 102, 241, 0.18);
      border-color: rgba(99, 102, 241, 0.55);
      color: #c7d2fe;
      box-shadow: 0 0 16px rgba(99, 102, 241, 0.25);
    }
    .pill-divider {
      width: 1px; height: 22px;
      background: rgba(255, 255, 255, 0.1);
      margin: 0 2px;
    }
    /* 3 Provider Grid */
    .provider-grid {
      display: grid;
      grid-template-columns: repeat(2, 1fr);
      gap: 14px;
    }
    .provider-card.vsmov-hero {
      grid-column: 1 / -1;
      background: radial-gradient(circle at 90% 15%, rgba(6, 182, 212, 0.12), rgba(255, 255, 255, 0.025) 60%);
      border: 1px solid rgba(6, 182, 212, 0.25);
    }
    @media (max-width: 580px) {
      .provider-grid { grid-template-columns: 1fr; }
      .provider-card.vsmov-hero { grid-column: auto; }
    }
    .provider-card {
      background: rgba(255, 255, 255, 0.025);
      border: 1px solid var(--border-subtle);
      border-radius: var(--radius-md);
      padding: 18px;
      cursor: pointer;
      transition: all var(--transition-smooth);
      display: flex;
      flex-direction: column;
      justify-content: space-between;
    }
    .provider-card:hover {
      border-color: var(--border-hover);
      transform: translateY(-2px);
      box-shadow: 0 14px 30px rgba(0, 0, 0, 0.4);
    }
    .provider-card.active {
      border-color: rgba(99, 102, 241, 0.5);
      background: rgba(99, 102, 241, 0.04);
      box-shadow: 0 0 0 1px rgba(99, 102, 241, 0.25), 0 16px 36px rgba(0, 0, 0, 0.45);
    }
    .provider-card.active.vsmov  { border-color: rgba(6, 182, 212, 0.6); box-shadow: 0 0 0 1px rgba(6, 182, 212, 0.35), 0 18px 40px rgba(0, 0, 0, 0.5); }
    .provider-card.active.kkphim { border-color: rgba(236, 72, 153, 0.55); box-shadow: 0 0 0 1px rgba(236, 72, 153, 0.25), 0 16px 36px rgba(0, 0, 0, 0.45); }
    .provider-card.active.nguonc { border-color: rgba(99, 102, 241, 0.55); box-shadow: 0 0 0 1px rgba(99, 102, 241, 0.25), 0 16px 36px rgba(0, 0, 0, 0.45); }
    .provider-top {
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-bottom: 12px;
    }
    .provider-icon-badge {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 40px; height: 40px;
      border-radius: 12px;
      background: rgba(255, 255, 255, 0.05);
      border: 1px solid rgba(255, 255, 255, 0.08);
      font-size: 1.35rem;
    }
    .switch-track {
      width: 42px; height: 24px;
      background: rgba(255, 255, 255, 0.1);
      border-radius: var(--radius-full);
      position: relative;
      transition: all var(--transition-smooth);
      border: 1px solid rgba(255, 255, 255, 0.12);
      flex-shrink: 0;
    }
    .switch-thumb {
      position: absolute;
      top: 2px; left: 2px;
      width: 18px; height: 18px;
      background: rgba(255, 255, 255, 0.5);
      border-radius: 50%;
      transition: transform var(--spring-physics), background var(--transition-smooth);
    }
    .provider-card.active .switch-track { background: var(--indigo); border-color: transparent; }
    .provider-card.active.vsmov  .switch-track { background: var(--cyan); box-shadow: 0 0 14px var(--cyan-glow); }
    .provider-card.active.kkphim .switch-track { background: var(--pink); box-shadow: 0 0 14px var(--pink-glow); }
    .provider-card.active.nguonc .switch-track { background: var(--indigo); box-shadow: 0 0 14px var(--indigo-glow); }
    .provider-card.active .switch-thumb { transform: translateX(18px); background: #ffffff; }
    .provider-name {
      font-size: 1.02rem;
      font-weight: 700;
      letter-spacing: -0.02em;
      color: var(--text-primary);
      margin-bottom: 4px;
    }
    .provider-desc {
      font-size: 0.76rem;
      color: var(--text-secondary);
      line-height: 1.45;
      margin-bottom: 12px;
    }
    .tag-row { display: flex; flex-wrap: wrap; gap: 6px; }
    .tag-badge {
      font-size: 0.68rem;
      font-weight: 600;
      padding: 3px 8px;
      border-radius: 6px;
    }
    .tag-cyan   { background: rgba(6, 182, 212, 0.15); color: #67e8f9; border: 1px solid rgba(6, 182, 212, 0.25); }
    .tag-pink   { background: rgba(236, 72, 153, 0.15); color: #f472b6; border: 1px solid rgba(236, 72, 153, 0.25); }
    .tag-indigo { background: rgba(99, 102, 241, 0.15); color: #a5b4fc; border: 1px solid rgba(99, 102, 241, 0.25); }
    .tag-green  { background: rgba(16, 185, 129, 0.15); color: #6ee7b7; border: 1px solid rgba(16, 185, 129, 0.25); }
    .tag-amber  { background: rgba(245, 158, 11, 0.15); color: #fcd34d; border: 1px solid rgba(245, 158, 11, 0.25); }
    /* Manifest Box */
    .manifest-box {
      background: rgba(0, 0, 0, 0.35);
      border: 1px dashed rgba(255, 255, 255, 0.15);
      border-radius: var(--radius-md);
      padding: 16px;
      cursor: pointer;
      transition: all var(--transition-smooth);
    }
    .manifest-box:hover {
      border-color: rgba(99, 102, 241, 0.5);
      background: rgba(99, 102, 241, 0.05);
    }
    .manifest-top {
      display: flex;
      justify-content: space-between;
      align-items: center;
      font-size: 0.75rem;
      font-weight: 700;
      color: var(--text-muted);
      text-transform: uppercase;
      letter-spacing: 0.05em;
      margin-bottom: 8px;
    }
    .copy-pill-hint {
      color: #818cf8;
      font-size: 0.72rem;
    }
    .manifest-url-string {
      font-family: 'JetBrains Mono', monospace;
      font-size: 0.82rem;
      color: #93c5fd;
      word-break: break-all;
      line-height: 1.4;
    }
    /* Brand Signature Footer */
    .taste-footer {
      text-align: center;
      font-size: 0.8rem;
      color: var(--text-muted);
      padding: 16px 0;
    }
    .brand-highlight {
      font-weight: 700;
      color: #f8fafc;
      text-shadow: 0 0 12px rgba(255, 255, 255, 0.3);
    }
    /* Floating Action Dock */
    .floating-action-dock {
      position: fixed;
      bottom: 20px;
      left: 50%;
      transform: translateX(-50%);
      width: calc(100% - 40px);
      max-width: 860px;
      z-index: 100;
    }
    .dock-container {
      background: rgba(14, 18, 26, 0.88);
      border: 1px solid rgba(255, 255, 255, 0.12);
      border-radius: var(--radius-lg);
      padding: 14px 20px;
      box-shadow: 0 20px 45px rgba(0, 0, 0, 0.7);
      backdrop-filter: blur(28px);
      display: flex;
      flex-direction: column;
      gap: 12px;
    }
    .dock-status-bar {
      display: flex;
      justify-content: space-between;
      align-items: center;
      font-size: 0.82rem;
      color: var(--text-secondary);
    }
    .dock-status-bar strong { color: var(--text-primary); }
    .cta-button-group {
      display: flex;
      gap: 10px;
    }
    @media (max-width: 640px) {
      .cta-button-group { flex-direction: column; }
    }
    .cta-btn {
      flex: 1;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 8px;
      padding: 12px 18px;
      border-radius: var(--radius-md);
      font-size: 0.9rem;
      font-weight: 700;
      font-family: inherit;
      text-decoration: none;
      cursor: pointer;
      transition: all var(--transition-smooth);
      border: none;
      user-select: none;
    }
    .cta-btn-primary {
      background: linear-gradient(135deg, #6366f1, #06b6d4);
      color: #ffffff;
      box-shadow: 0 8px 20px rgba(99, 102, 241, 0.35);
    }
    .cta-btn-primary:hover {
      transform: translateY(-2px);
      box-shadow: 0 12px 28px rgba(99, 102, 241, 0.5);
    }
    .cta-btn-secondary {
      background: rgba(255, 255, 255, 0.06);
      border: 1px solid var(--border-subtle);
      color: var(--text-primary);
    }
    .cta-btn-secondary:hover {
      background: rgba(255, 255, 255, 0.12);
      transform: translateY(-2px);
    }
    .cta-btn-copy {
      background: rgba(255, 255, 255, 0.06);
      border: 1px solid var(--border-subtle);
      color: var(--text-secondary);
    }
    .cta-btn-copy:hover {
      background: rgba(255, 255, 255, 0.12);
      color: var(--text-primary);
      transform: translateY(-2px);
    }
    /* Toast */
    .clipboard-toast {
      position: fixed;
      top: 24px;
      left: 50%;
      transform: translateX(-50%) translateY(-100px);
      background: rgba(16, 185, 129, 0.95);
      color: #ffffff;
      padding: 12px 24px;
      border-radius: var(--radius-full);
      font-size: 0.88rem;
      font-weight: 600;
      box-shadow: 0 10px 30px rgba(16, 185, 129, 0.4);
      backdrop-filter: blur(16px);
      z-index: 999;
      transition: transform 0.4s cubic-bezier(0.16, 1, 0.3, 1);
      display: flex;
      align-items: center;
      gap: 8px;
    }
    .clipboard-toast.show {
      transform: translateX(-50%) translateY(0);
    }
  </style>
</head>
<body>
  <div class="taste-container">
    <!-- Header Card -->
    <header class="header-card">
      <div class="header-logo-badge" aria-hidden="true">🎬</div>
      <div class="header-title-group">
        <div class="title-row">
          <h1>VIP Movies</h1>
          <span class="version-pill">v${ADDON_VERSION}</span>
          <span class="live-status-pill"><span class="status-dot"></span> Core Online</span>
        </div>
        <p class="header-desc">Hệ thống tổng hợp phim tốc độ cao chuẩn 4K &amp; Full HD cho Stremio &amp; Nuvio. Hỗ trợ phụ đề tiếng Việt &amp; phát trực tiếp trong ứng dụng.</p>
      </div>
    </header>

    <!-- Quick Action Bar -->
    <section class="taste-card">
      <div class="card-header-label">⚡ Thao tác nhanh &amp; Danh mục</div>
      <div class="pill-grid" id="action-pills">
        <button class="action-pill" onclick="selectAll()">⚡ Bật tất cả</button>
        <button class="action-pill" onclick="selectNone()">🚫 Tắt tất cả</button>
        <div class="pill-divider" aria-hidden="true"></div>
        <button class="action-pill ${isCatActive('movie') ? 'active' : ''}" id="cat-movie" onclick="toggleCat('movie')">🎬 Phim Lẻ</button>
        <button class="action-pill ${isCatActive('series') ? 'active' : ''}" id="cat-series" onclick="toggleCat('series')">📺 Phim Bộ</button>
        <button class="action-pill ${isCatActive('cinema') ? 'active' : ''}" id="cat-cinema" onclick="toggleCat('cinema')">🍿 Chiếu Rạp</button>
        <button class="action-pill ${isCatActive('anime') ? 'active' : ''}" id="cat-anime" onclick="toggleCat('anime')">🐉 Hoạt Hình &amp; Anime</button>
      </div>
    </section>

    <!-- 3 Provider Bento Grid -->
    <section class="taste-card">
      <div class="card-header-label">🌐 3 Cụm Nguồn Phim VIP (Chuẩn 4K Ultra HD &amp; Audio Độc Lập)</div>
      <div class="provider-grid">
        <!-- VSMOV 4K Flagship Hero Tile -->
        <div class="provider-card vsmov vsmov-hero ${isProvActive('vsmov') ? 'active' : ''}" id="card-vsmov" onclick="toggleProvider('vsmov')" role="checkbox" aria-checked="${isProvActive('vsmov') ? 'true' : 'false'}" tabindex="0">
          <div class="provider-top">
            <div class="provider-icon-badge">🌟</div>
            <div class="switch-track"><div class="switch-thumb"></div></div>
          </div>
          <div>
            <div class="provider-name">VSMOV 4K (Master Engine)</div>
            <div class="provider-desc">vsmov.com — Master 4K Ultra HD (3840x2160), Vietsub, Lồng Tiếng &amp; Thuyết Minh Độc Lập</div>
          </div>
          <div class="tag-row">
            <span class="tag-badge tag-cyan">Master 4K</span>
            <span class="tag-badge tag-green">Đa Server Audio</span>
            <span class="tag-badge tag-cyan">CDN VIP</span>
            <span class="tag-badge tag-indigo">WebVTT Subtitles</span>
          </div>
        </div>

        <!-- KKPhim -->
        <div class="provider-card kkphim ${isProvActive('kkphim') ? 'active' : ''}" id="card-kkphim" onclick="toggleProvider('kkphim')" role="checkbox" aria-checked="${isProvActive('kkphim') ? 'true' : 'false'}" tabindex="0">
          <div class="provider-top">
            <div class="provider-icon-badge">🔮</div>
            <div class="switch-track"><div class="switch-thumb"></div></div>
          </div>
          <div>
            <div class="provider-name">KKPhim</div>
            <div class="provider-desc">phimapi.com — Cụm máy chủ ổn định &amp; Tra cứu IMDb Direct</div>
          </div>
          <div class="tag-row">
            <span class="tag-badge tag-pink">Vietsub</span>
            <span class="tag-badge tag-amber">Full HD</span>
            <span class="tag-badge tag-pink">IMDb Direct</span>
          </div>
        </div>

        <!-- NguonC -->
        <div class="provider-card nguonc ${isProvActive('nguonc') ? 'active' : ''}" id="card-nguonc" onclick="toggleProvider('nguonc')" role="checkbox" aria-checked="${isProvActive('nguonc') ? 'true' : 'false'}" tabindex="0">
          <div class="provider-top">
            <div class="provider-icon-badge">🎞️</div>
            <div class="switch-track"><div class="switch-thumb"></div></div>
          </div>
          <div>
            <div class="provider-name">NguonC</div>
            <div class="provider-desc">phim.nguonc.com — Proxy StreamC vượt chặn ISP &amp; Thuyết Minh</div>
          </div>
          <div class="tag-row">
            <span class="tag-badge tag-indigo">StreamC</span>
            <span class="tag-badge tag-green">Thuyết Minh</span>
            <span class="tag-badge tag-indigo">IMDb</span>
          </div>
        </div>
      </div>
    </section>

    <!-- Manifest URL Card -->
    <section class="taste-card">
      <div class="card-header-label">🔗 Liên Kết Cài Đặt Cá Nhân Hóa</div>
      <div class="manifest-box" id="manifest-box" onclick="copyManifest()" role="button" tabindex="0" title="Bấm để sao chép link Manifest">
        <div class="manifest-top">
          <span>Manifest URL</span>
          <span class="copy-pill-hint">📋 Bấm để Sao Chép</span>
        </div>
        <div class="manifest-url-string" id="manifest-preview">${currentManifestUrl}</div>
      </div>
    </section>

    <!-- Brand Signature Footer -->
    <footer class="taste-footer">
      VIP Movies Addon v${ADDON_VERSION} • Designed with Taste by <span class="brand-highlight">Q121101</span>
    </footer>
  </div>

  <!-- Floating Action Dock -->
  <div class="floating-action-dock">
    <div class="dock-container">
      <div class="dock-status-bar">
        <div>
          Đang bật: <strong id="provider-count">${resolvedConfig.providers.length} nguồn VIP</strong> &nbsp;·&nbsp; <strong id="category-count">${resolvedConfig.categories.length} danh mục</strong>
        </div>
        <div style="color: #10b981; font-weight: 600; font-size: 0.78rem;">
          ⚡ Cấu hình tự động đồng bộ
        </div>
      </div>

      <div class="cta-button-group">
        <a class="cta-btn cta-btn-primary" id="stremio-install-btn" href="${stremioUrl}">
          <span>⚡</span> Cài đặt vào Stremio App
        </a>
        <a class="cta-btn cta-btn-secondary" id="web-install-btn" href="${webInstallUrl}" target="_blank" rel="noopener noreferrer">
          <span>🌐</span> Mở trên Stremio Web
        </a>
        <button class="cta-btn cta-btn-copy" id="dock-copy-btn" onclick="copyManifest()">
          <span>📋</span> Sao chép link
        </button>
      </div>
    </div>
  </div>

  <!-- Toast -->
  <div class="clipboard-toast" id="toast">
    <span>✅</span> Đã sao chép link Manifest vào Clipboard!
  </div>

  <script>
    var _baseUrl = window.location.origin;
    var _allProvidersList = ['vsmov', 'kkphim', 'nguonc'];
    var _providers = new Set(${JSON.stringify(resolvedConfig.providers)});
    var _categories = new Set(${JSON.stringify(resolvedConfig.categories)});

    function intToBase62(num) {
      if (num === 0) return '0';
      var chars = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';
      var n = Math.floor(Math.abs(num));
      var res = '';
      while (n > 0) {
        res = chars[n % 62] + res;
        n = Math.floor(n / 62);
      }
      return res;
    }

    function encodeConfigClient(providers, categories) {
      var provBits = { vsmov: 1, kkphim: 2, nguonc: 4 };
      var catBits  = { movie: 256, series: 512, anime: 1024, cinema: 2048 };
      var mask = 0;
      providers.forEach(function(p) { if (provBits[p]) mask |= provBits[p]; });
      categories.forEach(function(c) { if (catBits[c]) mask |= catBits[c]; });
      if ((mask & 0x00FF) === 0) mask |= 7;
      if ((mask & 0xFF00) === 0) mask |= 3840;
      return intToBase62(mask);
    }

    function updateState() {
      var token = encodeConfigClient(_providers, _categories);
      var manifestUrl = _baseUrl + '/' + token + '/manifest.json';
      var stremioDeep = _baseUrl.replace(/^https?:\\/\\//, 'stremio://') + '/' + token + '/manifest.json';
      var webUrl = 'https://web.stremio.com/#/addons?addon=' + encodeURIComponent(manifestUrl);

      document.getElementById('manifest-preview').textContent = manifestUrl;
      document.getElementById('stremio-install-btn').href = stremioDeep;
      document.getElementById('web-install-btn').href = webUrl;
      document.getElementById('provider-count').textContent = _providers.size + ' nguồn VIP';
      document.getElementById('category-count').textContent = _categories.size + ' danh mục';

      ['movie','series','anime','cinema'].forEach(function(c) {
        var el = document.getElementById('cat-' + c);
        if (el) el.classList.toggle('active', _categories.has(c));
      });
    }

    function toggleCat(cat) {
      if (_categories.has(cat)) {
        if (_categories.size > 1) _categories.delete(cat);
      } else {
        _categories.add(cat);
      }
      updateState();
    }

    function toggleProvider(id) {
      var card = document.getElementById('card-' + id);
      if (!card) return;
      if (_providers.has(id)) {
        if (_providers.size > 1) {
          _providers.delete(id);
          card.classList.remove('active');
          card.setAttribute('aria-checked','false');
        }
      } else {
        _providers.add(id);
        card.classList.add('active');
        card.setAttribute('aria-checked','true');
      }
      updateState();
    }

    function selectAll() {
      _allProvidersList.forEach(function(p) {
        _providers.add(p);
        var c = document.getElementById('card-' + p);
        if (c) { c.classList.add('active'); c.setAttribute('aria-checked','true'); }
      });
      ['movie','series','anime','cinema'].forEach(function(cat) { _categories.add(cat); });
      updateState();
    }

    function selectNone() {
      _providers.clear();
      _providers.add('nguonc');
      _allProvidersList.forEach(function(p) {
        var c = document.getElementById('card-' + p);
        if (c) {
          c.classList.toggle('active', p === 'nguonc');
          c.setAttribute('aria-checked', p === 'nguonc' ? 'true' : 'false');
        }
      });
      _categories.clear();
      _categories.add('movie');
      updateState();
    }

    function copyManifest() {
      var text = document.getElementById('manifest-preview').textContent;
      navigator.clipboard.writeText(text).then(function() {
        var toast = document.getElementById('toast');
        toast.classList.add('show');
        setTimeout(function() { toast.classList.remove('show'); }, 2500);
      });
    }
  </script>
</body>
</html>`;

  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', 'max-age=300, stale-while-revalidate=600');
  res.send(html);
}

app.get(['/', '/configure', '/:config/configure'], renderConfiguratorHtml);
app.get('/:config', (req, res, next) => {
  if (isConfigToken(req.params.config)) {
    return renderConfiguratorHtml(req, res);
  }
  next();
});

// ─── 404 Handler ─────────────────────────────────────────────
app.use((req, res) => {
  res.status(404).json({ error: 'Endpoint không tồn tại', path: req.path });
});

// ─── Global Error Handler ─────────────────────────────────────
app.use((err, req, res, _next) => {
  console.error('[Global Server Error]', err);
  res.status(500).json({ error: 'Lỗi server nội bộ', message: err.message });
});

module.exports = app;
