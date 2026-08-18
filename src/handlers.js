'use strict';

/**
 * ============================================================
 *  VIP Movies Addon — src/handlers.js  (Engine v1.7.0)
 *  Stremio Addon Express Route Handlers
 *  - Bộ gom luồng tổng hợp (Stream Aggregator: KKPhim + NguonC + VsMov + STP + CLBPX + YAN)
 *  - Dynamic Catalog & Meta Router
 *  - Interactive Cyber-Glassmorphism Configurator Dashboard
 * ============================================================
 */

const express = require('express');
const router  = express.Router();

const api     = require('./api');
const mapper  = require('./mapper');
const { MANIFEST, GENRES, COUNTRIES, buildManifest } = require('./manifest');
const { decodeConfig, encodeConfig, isConfigToken, DEFAULT_CONFIG, getDefaultToken, VALID_PROVIDERS, VALID_CATEGORIES } = require('./config');
const { imdbCache, catalogCache, detailCache }  = require('./lib/cache');
const { resolveCinemeta } = require('./lib/cinemeta');

// ─── Providers ────────────────────────────────────────────────
const providerVsMov  = require('./providers/vsmov');
const providerKKPhim = require('./providers/kkphim');
const providerNguonC = require('./providers/nguonc');
const providerSTP    = require('./providers/stp');
const providerHH3D   = require('./providers/hh3d');
const providerYAN    = require('./providers/yan');
const providerCLBPX  = require('./providers/clbpx');

const ALL_PROVIDERS = {
  vsmov:  providerVsMov,
  kkphim: providerKKPhim,
  nguonc: providerNguonC,
  stp:    providerSTP,
  hh3d:   providerHH3D,
  yan:    providerYAN,
  clbpx:  providerCLBPX,
};

// ─── Helpers ──────────────────────────────────────────────────
function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function sendJSON(res, data) {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', '*');
  res.setHeader('Cache-Control', 'max-age=300, stale-while-revalidate=600');
  return res.json(data);
}

function sendError(res, statusCode, message) {
  console.error(`[Handler Error] ${message}`);
  res.status(statusCode).json({ error: message });
}

function parseExtra(extraParam) {
  if (!extraParam) return {};
  try {
    let decoded = String(extraParam);
    try { decoded = decodeURIComponent(decoded); } catch {}
    if (decoded.includes('%')) {
      try { decoded = decodeURIComponent(decoded); } catch {}
    }
    const cleaned = decoded.replace(/\.json$/i, '');
    const result = {};
    for (const part of cleaned.split('&')) {
      if (!part) continue;
      const eqIdx = part.indexOf('=');
      if (eqIdx !== -1) {
        let rawKey = part.slice(0, eqIdx).trim();
        let rawVal = part.slice(eqIdx + 1).trim();
        try { rawKey = decodeURIComponent(rawKey); } catch {}
        try { rawVal = decodeURIComponent(rawVal); } catch {}
        if (rawKey) result[rawKey] = rawVal;
      }
    }
    return result;
  } catch { return {}; }
}

function skipToPage(skip) {
  const s = parseInt(skip, 10) || 0;
  return Math.max(1, Math.floor(s / 10) + 1);
}

function getConfig(req) {
  if (req.addonConfig) return req.addonConfig;
  if (req.params && req.params.config) {
    try { return decodeConfig(req.params.config); } catch {}
  }
  if (req.query && req.query.config) {
    try { return decodeConfig(req.query.config); } catch {}
  }
  return DEFAULT_CONFIG;
}

function getProviderFromCatalogId(catalogId) {
  if (!catalogId) return 'nguonc';
  const id = String(catalogId).toLowerCase().trim();
  for (const pid of Object.keys(ALL_PROVIDERS)) {
    if (id.startsWith(pid + '-') || id.startsWith(pid + '_') || id === pid) return pid;
  }
  return 'nguonc';
}

function getCatTypeFromCatalogId(catalogId) {
  if (!catalogId) return 'movie';
  const id = String(catalogId).toLowerCase().trim();

  // 1. VSMOV
  if (id === 'vsmov-4k' || id === 'vsmov-4k-sieu-net') return '4k';
  if (id === 'vsmov-thuyet-minh' || id === 'vsmov-tm') return 'thuyet-minh';

  // 2. KKPhim
  if (id === 'kkphim-movie-latest' || id === 'kkphim-phim-le') return 'movie';
  if (id === 'kkphim-series-latest' || id === 'kkphim-phim-bo') return 'series';
  if (id === 'kkphim-cinema-latest' || id === 'kkphim-chieu-rap') return 'cinema';
  if (id === 'kkphim-anime-latest' || id === 'kkphim-hoat-hinh') return 'anime';

  // 3. NguonC
  if (id === 'nguonc-movie-latest' || id === 'nguonc-phim-le') return 'movie';
  if (id === 'nguonc-series-latest' || id === 'nguonc-phim-bo') return 'series';
  if (id === 'nguonc-cinema-latest' || id === 'nguonc-chieu-rap') return 'cinema';
  if (id === 'nguonc-anime-latest' || id === 'nguonc-moi-cap-nhat') return 'phim-moi-cap-nhat';

  // 4. STP (Sưu Tầm Phim)
  if (id === 'stp-au-my' || id === 'stp-dien-anh-au-my' || id === 'stp-western') return 'au-my';
  if (id === 'stp-han-quoc' || id === 'stp-phim-han-quoc' || id === 'stp-korean') return 'han-quoc';
  if (id === 'stp-phim-le' || id === 'stp-single' || id === 'stp_movies_phimle' || id === 'stp_movies_dacsac') return 'movie';
  if (id === 'stp-phim-bo' || id === 'stp-series' || id === 'stp_series_phimbo') return 'series';

  // 5. HH3D (Hoạt Hình 3D)
  if (id === 'hh3d-phim-le' || id === 'hh3d-single') return 'movie';
  if (id === 'hh3d-phim-bo' || id === 'hh3d-series') return 'series';
  if (id === 'hh3d-tien-hiep' || id === 'hh3d-donghua' || id === 'hh3d-kiem-hiep') return 'tien-hiep';

  // 6. YAN (Donghua)
  if (id === 'yan-phim-le' || id === 'yan-single' || id === 'yan_movies') return 'movie';
  if (id === 'yan-phim-bo' || id === 'yan-series' || id === 'yan_series_3d' || id === 'yan_series_donghua') return 'series';
  if (id === 'yan-dang-chieu' || id === 'yan-ongoing') return 'dang-chieu';

  // 7. CLBPX (Phim Xưa)
  if (id === 'clbpx-kiem-hiep' || id === 'clbpx-kiem-hiep-xua' || id === 'clbpx-wuxia' || id === 'clbpx_series_kiemhiep') return 'kiem-hiep';
  if (id === 'clbpx-hong-kong' || id === 'clbpx-phim-hong-kong' || id === 'clbpx-tvb' || id === 'clbpx_series_tvb') return 'hong-kong';
  if (id === 'clbpx_movies_xua' || id === 'clbpx-phim-le') return 'movie';

  // Generic fallback checks
  if (id.includes('series') || id.includes('phim-bo')) return 'series';
  if (id.includes('single') || id.includes('movie') || id.includes('phim-le')) return 'movie';
  if (id.includes('cinema') || id.includes('chieu-rap')) return 'cinema';
  if (id.includes('anime') || id.includes('hoat-hinh') || id.includes('donghua')) return 'anime';
  if (id.includes('recent') || id.includes('latest') || id.includes('moi-cap-nhat')) return 'latest';

  const parts = id.replace(/_/g, '-').split('-');
  if (parts.length >= 2) return parts.slice(1).join('-');
  return 'movie';
}

function withTimeout(promise, ms = 4500, label = 'Provider') {
  let timer;
  if (promise && typeof promise.catch === 'function') {
    promise.catch(() => {});
  }
  const timeoutPromise = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms);
  });
  return Promise.race([promise, timeoutPromise]).finally(() => {
    if (timer) clearTimeout(timer);
  });
}

// ─────────────────────────────────────────────────────────────
//  ROUTE: GET / & GET /configure & GET /:config & GET /:config/configure
//  → Cyber-Glassmorphism Anti-Slop Configurator Dashboard
// ─────────────────────────────────────────────────────────────
router.get(['/', '/configure', '/:config', '/:config/configure'], (req, res, next) => {
  const token = req.params.config;
  if (token && !isConfigToken(token)) return next();

  // Resolve user config from req.addonConfig, path token, or query param
  let userConfig = DEFAULT_CONFIG;
  if (req.addonConfig) {
    userConfig = req.addonConfig;
  } else if (token) {
    userConfig = decodeConfig(token);
  } else if (req.query && req.query.config) {
    userConfig = decodeConfig(req.query.config);
  }

  const safeProviders = Array.isArray(userConfig.providers) && userConfig.providers.length > 0
    ? userConfig.providers.filter((p) => VALID_PROVIDERS.includes(p))
    : DEFAULT_CONFIG.providers;
  const safeCategories = Array.isArray(userConfig.categories) && userConfig.categories.length > 0
    ? userConfig.categories.filter((c) => VALID_CATEGORIES.includes(c))
    : DEFAULT_CONFIG.categories;
  const safeApiKey = typeof userConfig.apiKey === 'string' ? userConfig.apiKey : '';

  const resolvedConfig = {
    providers: safeProviders.length > 0 ? safeProviders : DEFAULT_CONFIG.providers,
    categories: safeCategories.length > 0 ? safeCategories : DEFAULT_CONFIG.categories,
    apiKey: safeApiKey,
  };

  const host     = req.headers['x-forwarded-host'] || req.headers.host || 'localhost:7000';
  const protocol = req.headers['x-forwarded-proto'] || req.protocol || 'http';
  const baseUrl  = `${protocol}://${host}`;
  const currentToken       = encodeConfig(resolvedConfig);
  const currentManifestUrl = `${baseUrl}/${currentToken}/manifest.json`;
  const stremioUrl         = `stremio://${host}/${currentToken}/manifest.json`;
  const webInstallUrl      = `https://web.stremio.com/#/addons?addon=${encodeURIComponent(currentManifestUrl)}`;

  const isProvActive = (id) => resolvedConfig.providers.includes(id);
  const isCatActive  = (cat) => resolvedConfig.categories.includes(cat);

  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.send(`<!DOCTYPE html>
<html lang="vi" class="dark">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover" />
  <title>VIP Movies 🎬 — Bảng Cấu Hình Addon</title>
  <meta name="description" content="VIP Movies Stremio Addon — Bảng điều khiển cấu hình đa nguồn phim 4K, Vietsub, Thuyết minh chuẩn quốc tế." />
  <meta name="theme-color" content="#0b0d13" />
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  <link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@300;400;500;600;700;800&family=JetBrains+Mono:wght@400;500;600&display=swap" rel="stylesheet" />
  <style>
    :root {
      --bg-oled: #0b0d13;
      --bg-surface: rgba(18, 22, 34, 0.65);
      --bg-surface-hover: rgba(26, 32, 50, 0.85);
      --border-subtle: rgba(255, 255, 255, 0.08);
      --border-hover: rgba(255, 255, 255, 0.18);
      --border-focus: rgba(99, 102, 241, 0.6);
      --text-primary: #f8fafc;
      --text-secondary: #94a3b8;
      --text-muted: #64748b;
      --indigo: #6366f1;
      --indigo-glow: rgba(99, 102, 241, 0.35);
      --pink: #ec4899;
      --pink-glow: rgba(236, 72, 153, 0.35);
      --cyan: #06b6d4;
      --cyan-glow: rgba(6, 182, 212, 0.35);
      --emerald: #10b981;
      --amber: #f59e0b;
      --purple: #8b5cf6;
      --radius-sm: 10px;
      --radius-md: 16px;
      --radius-lg: 24px;
      --radius-full: 9999px;
      --glass-blur: blur(28px);
      --transition-smooth: 0.24s cubic-bezier(0.16, 1, 0.3, 1);
      --spring-physics: 0.35s cubic-bezier(0.34, 1.56, 0.64, 1);
    }
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    html, body {
      background-color: var(--bg-oled);
      color: var(--text-primary);
      font-family: 'Plus Jakarta Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      min-height: 100dvh;
      line-height: 1.5;
      -webkit-font-smoothing: antialiased;
      overflow-x: hidden;
    }
    body {
      padding: 40px 16px 170px;
      position: relative;
    }
    /* Taste-Skill Ambient Aurora Mesh (3 Orbs, 140px Blur & Drift) */
    .ambient-canvas {
      position: fixed;
      inset: 0;
      pointer-events: none;
      z-index: 0;
      overflow: hidden;
    }
    .ambient-orb {
      position: absolute;
      border-radius: 50%;
      filter: blur(140px);
      opacity: 0.28;
      animation: ambientDrift 24s ease-in-out infinite alternate;
      will-change: transform;
    }
    .orb-indigo {
      width: 560px; height: 560px;
      top: -160px; left: -140px;
      background: radial-gradient(circle, #6366f1 0%, #3b82f6 70%, transparent);
      animation-duration: 22s;
    }
    .orb-pink {
      width: 620px; height: 620px;
      bottom: -180px; right: -160px;
      background: radial-gradient(circle, #ec4899 0%, #8b5cf6 65%, transparent);
      opacity: 0.22;
      animation-delay: -7s;
      animation-duration: 28s;
    }
    .orb-cyan {
      width: 440px; height: 440px;
      top: 38%; left: 50%;
      transform: translate(-50%, -50%);
      background: radial-gradient(circle, #06b6d4 0%, #6366f1 65%, transparent);
      opacity: 0.16;
      animation-delay: -14s;
      animation-duration: 20s;
    }
    @keyframes ambientDrift {
      0% { transform: translate(0, 0) scale(1); }
      50% { transform: translate(32px, 48px) scale(1.08); }
      100% { transform: translate(-28px, -24px) scale(0.92); }
    }
    /* Layout Container */
    .layout-wrapper {
      position: relative;
      z-index: 1;
      max-width: 740px;
      margin: 0 auto;
    }
    /* Header Section */
    .hero-header {
      text-align: center;
      margin-bottom: 36px;
    }
    .cinema-emblem {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      position: relative;
      width: 64px; height: 64px;
      background: linear-gradient(135deg, rgba(99, 102, 241, 0.9), rgba(236, 72, 153, 0.9));
      border-radius: 20px;
      font-size: 2rem;
      margin-bottom: 16px;
      box-shadow: 0 12px 32px rgba(99, 102, 241, 0.45), inset 0 1px 0 rgba(255, 255, 255, 0.25);
    }
    .cinema-emblem::after {
      content: '';
      position: absolute;
      inset: -4px;
      border-radius: 24px;
      border: 1.5px solid rgba(99, 102, 241, 0.4);
      animation: emblemPulse 3.5s ease-in-out infinite;
    }
    @keyframes emblemPulse {
      0%, 100% { opacity: 0.4; transform: scale(1); }
      50% { opacity: 0.9; transform: scale(1.05); }
    }
    .hero-title {
      font-size: 2.1rem;
      font-weight: 800;
      letter-spacing: -0.04em;
      line-height: 1.15;
      background: linear-gradient(135deg, #ffffff 0%, #cbd5e1 55%, #c084fc 100%);
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
      margin-bottom: 6px;
    }
    .hero-subtitle {
      font-size: 0.9rem;
      color: var(--text-secondary);
      font-weight: 500;
      letter-spacing: -0.01em;
      margin-bottom: 16px;
    }
    .live-status-pill {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      padding: 6px 16px;
      border-radius: var(--radius-full);
      font-size: 0.78rem;
      font-weight: 600;
      background: rgba(16, 185, 129, 0.1);
      border: 1px solid rgba(16, 185, 129, 0.25);
      color: #34d399;
      box-shadow: 0 4px 16px rgba(16, 185, 129, 0.12);
    }
    .pulse-ping {
      position: relative;
      display: flex;
      width: 8px; height: 8px;
    }
    .pulse-ping span {
      position: absolute;
      inset: 0;
      border-radius: 50%;
      background-color: var(--emerald);
      animation: ping 2s cubic-bezier(0, 0, 0.2, 1) infinite;
      opacity: 0.75;
    }
    .pulse-ping-dot {
      position: relative;
      width: 8px; height: 8px;
      border-radius: 50%;
      background-color: var(--emerald);
    }
    @keyframes ping {
      75%, 100% { transform: scale(2.2); opacity: 0; }
    }
    /* Anti-Slop Glassmorphic Card */
    .taste-card {
      background: var(--bg-surface);
      backdrop-filter: var(--glass-blur);
      -webkit-backdrop-filter: var(--glass-blur);
      border: 1px solid var(--border-subtle);
      border-radius: var(--radius-lg);
      box-shadow: 0 20px 50px -10px rgba(0, 0, 0, 0.75), inset 0 1px 0 rgba(255, 255, 255, 0.08);
      padding: 24px 26px;
      margin-bottom: 20px;
      transition: border-color var(--transition-smooth), box-shadow var(--transition-smooth);
    }
    .taste-card:hover {
      border-color: var(--border-hover);
      box-shadow: 0 24px 60px -10px rgba(0, 0, 0, 0.85), inset 0 1px 0 rgba(255, 255, 255, 0.12);
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
    /* Quick Action Pill Bar */
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
      -webkit-user-select: none;
    }
    .action-pill:hover {
      background: rgba(255, 255, 255, 0.08);
      border-color: var(--border-hover);
      color: var(--text-primary);
      transform: translateY(-1.5px);
    }
    .action-pill:active {
      transform: scale(0.97);
    }
    .action-pill.active {
      background: rgba(99, 102, 241, 0.18);
      border-color: rgba(99, 102, 241, 0.55);
      color: #c7d2fe;
      box-shadow: 0 0 16px rgba(99, 102, 241, 0.25);
    }
    .action-pill.pill-danger:hover {
      background: rgba(239, 68, 68, 0.12);
      border-color: rgba(239, 68, 68, 0.35);
      color: #f87171;
    }
    .pill-divider {
      width: 1px;
      height: 22px;
      background: rgba(255, 255, 255, 0.1);
      margin: 0 2px;
    }
    /* 7 Provider Bento Layout (1 Flagship Hero + 6 Balanced Grid Cards) */
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
      padding: 18px 18px;
      cursor: pointer;
      transition: all var(--transition-smooth);
      position: relative;
      overflow: hidden;
      user-select: none;
      display: flex;
      flex-direction: column;
      justify-content: space-between;
    }
    .provider-card::before {
      content: '';
      position: absolute;
      inset: 0;
      opacity: 0;
      transition: opacity var(--transition-smooth);
      pointer-events: none;
    }
    .provider-card.vsmov::before  { background: radial-gradient(circle at 80% 20%, rgba(6, 182, 212, 0.18), transparent 70%); }
    .provider-card.kkphim::before { background: radial-gradient(circle at 80% 20%, rgba(236, 72, 153, 0.15), transparent 70%); }
    .provider-card.nguonc::before { background: radial-gradient(circle at 80% 20%, rgba(99, 102, 241, 0.15), transparent 70%); }
    .provider-card.stp::before    { background: radial-gradient(circle at 80% 20%, rgba(245, 158, 11, 0.15), transparent 70%); }
    .provider-card.hh3d::before   { background: radial-gradient(circle at 80% 20%, rgba(16, 185, 129, 0.15), transparent 70%); }
    .provider-card.yan::before    { background: radial-gradient(circle at 80% 20%, rgba(236, 72, 153, 0.15), transparent 70%); }
    .provider-card.clbpx::before  { background: radial-gradient(circle at 80% 20%, rgba(139, 92, 246, 0.15), transparent 70%); }
    .provider-card:hover {
      border-color: var(--border-hover);
      transform: translateY(-2px);
      box-shadow: 0 14px 30px rgba(0, 0, 0, 0.4);
    }
    .provider-card:hover::before { opacity: 1; }
    .provider-card.active {
      border-color: rgba(99, 102, 241, 0.5);
      background: rgba(99, 102, 241, 0.04);
      box-shadow: 0 0 0 1px rgba(99, 102, 241, 0.25), 0 16px 36px rgba(0, 0, 0, 0.45);
    }
    .provider-card.active.vsmov  { border-color: rgba(6, 182, 212, 0.6); box-shadow: 0 0 0 1px rgba(6, 182, 212, 0.35), 0 18px 40px rgba(0, 0, 0, 0.5); }
    .provider-card.active.kkphim { border-color: rgba(236, 72, 153, 0.55); box-shadow: 0 0 0 1px rgba(236, 72, 153, 0.25), 0 16px 36px rgba(0, 0, 0, 0.45); }
    .provider-card.active.stp    { border-color: rgba(245, 158, 11, 0.55); box-shadow: 0 0 0 1px rgba(245, 158, 11, 0.25), 0 16px 36px rgba(0, 0, 0, 0.45); }
    .provider-card.active.hh3d   { border-color: rgba(16, 185, 129, 0.55); box-shadow: 0 0 0 1px rgba(16, 185, 129, 0.25), 0 16px 36px rgba(0, 0, 0, 0.45); }
    .provider-card.active.yan    { border-color: rgba(236, 72, 153, 0.55); box-shadow: 0 0 0 1px rgba(236, 72, 153, 0.25), 0 16px 36px rgba(0, 0, 0, 0.45); }
    .provider-card.active.clbpx  { border-color: rgba(139, 92, 246, 0.55); box-shadow: 0 0 0 1px rgba(139, 92, 246, 0.25), 0 16px 36px rgba(0, 0, 0, 0.45); }
    .provider-card.active::before { opacity: 1; }
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
    /* Micro-Interactive Spring Physics Switch Track */
    .switch-track {
      width: 42px; height: 24px;
      background: rgba(255, 255, 255, 0.1);
      border-radius: var(--radius-full);
      position: relative;
      transition: background var(--transition-smooth), border-color var(--transition-smooth), box-shadow var(--transition-smooth);
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
    .provider-card.active .switch-track {
      background: var(--indigo);
      border-color: transparent;
      box-shadow: 0 0 12px var(--indigo-glow);
    }
    .provider-card.active.vsmov  .switch-track { background: var(--cyan); box-shadow: 0 0 14px var(--cyan-glow); }
    .provider-card.active.kkphim .switch-track { background: var(--pink); box-shadow: 0 0 14px var(--pink-glow); }
    .provider-card.active.nguonc .switch-track { background: var(--indigo); box-shadow: 0 0 14px var(--indigo-glow); }
    .provider-card.active.stp    .switch-track { background: var(--amber); box-shadow: 0 0 14px rgba(245, 158, 11, 0.35); }
    .provider-card.active.hh3d   .switch-track { background: var(--emerald); box-shadow: 0 0 14px rgba(16, 185, 129, 0.35); }
    .provider-card.active.yan    .switch-track { background: var(--pink); box-shadow: 0 0 14px var(--pink-glow); }
    .provider-card.active.clbpx  .switch-track { background: var(--purple); box-shadow: 0 0 14px rgba(139, 92, 246, 0.35); }
    .provider-card.active .switch-thumb {
      transform: translateX(18px);
      background: #ffffff;
    }
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
    .tag-row {
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
    }
    .tag-badge {
      font-size: 0.68rem;
      font-weight: 600;
      padding: 3px 8px;
      border-radius: 6px;
      letter-spacing: 0.01em;
    }
    .tag-cyan   { background: rgba(6, 182, 212, 0.15); color: #67e8f9; border: 1px solid rgba(6, 182, 212, 0.25); }
    .tag-pink   { background: rgba(236, 72, 153, 0.15); color: #f9a8d4; border: 1px solid rgba(236, 72, 153, 0.25); }
    .tag-indigo { background: rgba(99, 102, 241, 0.15); color: #c7d2fe; border: 1px solid rgba(99, 102, 241, 0.25); }
    .tag-green  { background: rgba(16, 185, 129, 0.15); color: #6ee7b7; border: 1px solid rgba(16, 185, 129, 0.25); }
    .tag-amber  { background: rgba(245, 158, 11, 0.15); color: #fde68a; border: 1px solid rgba(245, 158, 11, 0.25); }
    .tag-purple { background: rgba(139, 92, 246, 0.15); color: #ddd6fe; border: 1px solid rgba(139, 92, 246, 0.25); }
    /* Manifest URL Card */
    .manifest-box {
      background: rgba(0, 0, 0, 0.5);
      border: 1px dashed rgba(255, 255, 255, 0.15);
      border-radius: var(--radius-md);
      padding: 16px 20px;
      cursor: pointer;
      transition: all var(--transition-smooth);
    }
    .manifest-box:hover {
      border-color: rgba(167, 139, 250, 0.6);
      background: rgba(0, 0, 0, 0.7);
      box-shadow: 0 8px 24px rgba(0, 0, 0, 0.5);
    }
    .manifest-top {
      display: flex;
      align-items: center;
      justify-content: space-between;
      font-size: 0.74rem;
      font-weight: 700;
      color: #a78bfa;
      text-transform: uppercase;
      letter-spacing: 0.08em;
      margin-bottom: 8px;
    }
    .copy-pill-hint {
      font-size: 0.7rem;
      padding: 3px 10px;
      border-radius: var(--radius-full);
      background: rgba(167, 139, 250, 0.15);
      color: #c084fc;
      border: 1px solid rgba(167, 139, 250, 0.3);
    }
    .manifest-url-string {
      font-family: 'JetBrains Mono', Consolas, monospace;
      font-size: 0.8rem;
      color: #e2e8f0;
      word-break: break-all;
      line-height: 1.5;
    }
    /* Brand Signature Footer */
    .taste-footer {
      text-align: center;
      font-size: 0.78rem;
      color: var(--text-muted);
      padding: 24px 0 12px;
      letter-spacing: -0.01em;
    }
    .brand-highlight {
      font-weight: 800;
      background: linear-gradient(135deg, #a855f7 0%, #ec4899 50%, #38bdf8 100%);
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
      filter: drop-shadow(0 0 10px rgba(236, 72, 153, 0.65));
      padding: 0 4px;
      display: inline-block;
      transition: filter var(--transition-smooth), transform var(--transition-smooth);
    }
    .brand-highlight:hover {
      filter: drop-shadow(0 0 16px rgba(56, 189, 248, 0.9));
      transform: scale(1.05);
    }
    /* Floating Action Dock */
    .floating-action-dock {
      position: fixed;
      bottom: 0; left: 0; right: 0;
      z-index: 100;
      padding: 0 16px 24px;
      background: linear-gradient(to top, rgba(11, 13, 19, 0.98) 65%, transparent);
      pointer-events: none;
    }
    .dock-container {
      max-width: 740px;
      margin: 0 auto;
      background: rgba(18, 22, 34, 0.85);
      backdrop-filter: blur(32px);
      -webkit-backdrop-filter: blur(32px);
      border: 1px solid rgba(255, 255, 255, 0.12);
      border-radius: var(--radius-lg);
      padding: 18px 22px;
      box-shadow: 0 -12px 48px rgba(0, 0, 0, 0.7), 0 0 0 1px rgba(255, 255, 255, 0.05);
      pointer-events: auto;
    }
    .dock-status-bar {
      display: flex;
      align-items: center;
      justify-content: space-between;
      flex-wrap: wrap;
      gap: 10px;
      margin-bottom: 14px;
    }
    .dock-status-text {
      font-size: 0.82rem;
      color: var(--text-secondary);
      font-weight: 500;
    }
    .dock-status-text strong {
      color: var(--text-primary);
    }
    .dock-live-tag {
      display: flex;
      align-items: center;
      gap: 6px;
      font-size: 0.76rem;
      color: #34d399;
      font-weight: 600;
    }
    .dock-live-dot {
      width: 6px; height: 6px;
      border-radius: 50%;
      background: var(--emerald);
      box-shadow: 0 0 8px var(--emerald);
    }
    .apikey-container {
      display: flex;
      align-items: center;
      gap: 10px;
      margin-bottom: 14px;
      background: rgba(0, 0, 0, 0.4);
      border: 1px solid var(--border-subtle);
      border-radius: var(--radius-sm);
      padding: 10px 14px;
      transition: border-color var(--transition-smooth), box-shadow var(--transition-smooth);
    }
    .apikey-container:focus-within {
      border-color: var(--border-focus);
      box-shadow: 0 0 0 2px rgba(99, 102, 241, 0.15);
    }
    .apikey-key-icon {
      font-size: 0.95rem;
      color: var(--text-muted);
    }
    .apikey-field {
      flex: 1;
      background: transparent;
      border: none;
      outline: none;
      color: var(--text-primary);
      font-size: 0.85rem;
      font-family: 'JetBrains Mono', Consolas, monospace;
      font-weight: 500;
    }
    .apikey-field::placeholder {
      color: rgba(148, 163, 184, 0.45);
    }
    .cta-button-group {
      display: grid;
      grid-template-columns: 1.2fr 1fr 1fr;
      gap: 10px;
    }
    @media (max-width: 700px) {
      .cta-button-group { grid-template-columns: 1fr; gap: 8px; }
    }
    .cta-btn {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 8px;
      padding: 14px 16px;
      border-radius: var(--radius-md);
      font-weight: 700;
      font-size: 0.88rem;
      text-decoration: none;
      transition: all var(--transition-smooth);
      cursor: pointer;
      border: none;
      font-family: inherit;
      letter-spacing: -0.01em;
      white-space: nowrap;
    }
    .cta-btn-primary {
      background: linear-gradient(135deg, #6366f1 0%, #a855f7 50%, #ec4899 100%);
      color: #ffffff;
      border: 1px solid rgba(255, 255, 255, 0.2);
      box-shadow: 0 8px 28px rgba(99, 102, 241, 0.45);
      position: relative;
      overflow: hidden;
    }
    .cta-btn-primary::after {
      content: '';
      position: absolute;
      top: -50%; left: -50%;
      width: 200%; height: 200%;
      background: linear-gradient(60deg, transparent 30%, rgba(255, 255, 255, 0.18) 50%, transparent 70%);
      transform: rotate(25deg);
      transition: transform 0.65s ease;
    }
    .cta-btn-primary:hover::after {
      transform: rotate(25deg) translate(30%, 30%);
    }
    .cta-btn-primary:hover {
      transform: translateY(-2px);
      box-shadow: 0 14px 36px rgba(99, 102, 241, 0.6);
      filter: brightness(1.06);
    }
    .cta-btn-secondary {
      background: rgba(255, 255, 255, 0.05);
      color: var(--text-primary);
      border: 1px solid var(--border-subtle);
    }
    .cta-btn-secondary:hover {
      background: rgba(255, 255, 255, 0.1);
      border-color: var(--border-hover);
      transform: translateY(-1.5px);
    }
    .cta-btn-copy {
      background: rgba(167, 139, 250, 0.12);
      color: #c084fc;
      border: 1px solid rgba(167, 139, 250, 0.3);
    }
    .cta-btn-copy:hover {
      background: rgba(167, 139, 250, 0.22);
      border-color: rgba(167, 139, 250, 0.5);
      color: #ffffff;
      transform: translateY(-1.5px);
      box-shadow: 0 6px 20px rgba(167, 139, 250, 0.25);
    }
    /* Toast Notification */
    .clipboard-toast {
      position: fixed;
      bottom: 140px;
      left: 50%;
      transform: translateX(-50%) translateY(24px);
      background: rgba(18, 22, 34, 0.95);
      border: 1px solid rgba(52, 211, 153, 0.4);
      color: #34d399;
      backdrop-filter: blur(20px);
      padding: 11px 24px;
      border-radius: var(--radius-full);
      font-size: 0.85rem;
      font-weight: 600;
      box-shadow: 0 14px 36px rgba(0, 0, 0, 0.65);
      display: flex;
      align-items: center;
      gap: 9px;
      opacity: 0;
      pointer-events: none;
      transition: transform 0.32s cubic-bezier(0.34, 1.56, 0.64, 1), opacity 0.28s ease;
      z-index: 200;
      white-space: nowrap;
    }
    .clipboard-toast.show {
      transform: translateX(-50%) translateY(0);
      opacity: 1;
    }
  </style>
</head>
<body>
  <!-- Taste-Skill Ambient Mesh Layer -->
  <div class="ambient-canvas" aria-hidden="true">
    <div class="ambient-orb orb-indigo"></div>
    <div class="ambient-orb orb-pink"></div>
    <div class="ambient-orb orb-cyan"></div>
  </div>

  <div class="layout-wrapper">
    <!-- Hero Header -->
    <header class="hero-header">
      <div class="cinema-emblem" aria-hidden="true">🎬</div>
      <h1 class="hero-title">VIP Movies</h1>
      <p class="hero-subtitle">Stremio &amp; Nuvio Cyber-Addon • Multi-Source 4K Engine</p>
      <div class="live-status-pill">
        <span class="pulse-ping" aria-hidden="true">
          <span></span>
          <div class="pulse-ping-dot"></div>
        </span>
        🟢 Server VIP Core Online &nbsp;·&nbsp; v1.7.0
      </div>
    </header>

    <!-- Quick Actions & Categories -->
    <section class="taste-card">
      <div class="card-header-label">⚡ Thao tác nhanh &amp; Danh mục</div>
      <div class="pill-grid" id="action-pills">
        <button class="action-pill" onclick="selectAll()">⚡ Bật tất cả</button>
        <button class="action-pill pill-danger" onclick="selectNone()">🚫 Tắt tất cả</button>
        <div class="pill-divider" aria-hidden="true"></div>
        <button class="action-pill ${isCatActive('movie') ? 'active' : ''}" id="cat-movie"  onclick="toggleCat('movie')">🎬 Phim Lẻ</button>
        <button class="action-pill ${isCatActive('series') ? 'active' : ''}" id="cat-series" onclick="toggleCat('series')">📺 Phim Bộ</button>
        <button class="action-pill ${isCatActive('cinema') ? 'active' : ''}" id="cat-cinema" onclick="toggleCat('cinema')">🍿 Chiếu Rạp</button>
        <button class="action-pill ${isCatActive('anime') ? 'active' : ''}" id="cat-anime"  onclick="toggleCat('anime')">🐉 Hoạt Hình 3D</button>
      </div>
    </section>

    <!-- 7 Provider Bento Grid (1 + 6 Layout) -->
    <section class="taste-card">
      <div class="card-header-label">🌐 7 Cụm Nguồn Phim VIP (Chuẩn 4K &amp; Audio Độc Lập)</div>
      <div class="provider-grid">
        <!-- VSMOV 4K Flagship Hero Tile -->
        <div class="provider-card vsmov vsmov-hero ${isProvActive('vsmov') ? 'active' : ''}" id="card-vsmov" onclick="toggleProvider('vsmov')" role="checkbox" aria-checked="${isProvActive('vsmov') ? 'true' : 'false'}" tabindex="0">
          <div class="provider-top">
            <div class="provider-icon-badge">🌟</div>
            <div class="switch-track" aria-hidden="true"><div class="switch-thumb"></div></div>
          </div>
          <div>
            <div class="provider-name">VSMOV 4K (Master Engine)</div>
            <div class="provider-desc">vsmov.com — Master 4K Ultra HD, Vietsub, Lồng Tiếng &amp; Thuyết Minh Độc Lập</div>
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
            <div class="switch-track" aria-hidden="true"><div class="switch-thumb"></div></div>
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
            <div class="switch-track" aria-hidden="true"><div class="switch-thumb"></div></div>
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

        <!-- STP -->
        <div class="provider-card stp ${isProvActive('stp') ? 'active' : ''}" id="card-stp" onclick="toggleProvider('stp')" role="checkbox" aria-checked="${isProvActive('stp') ? 'true' : 'false'}" tabindex="0">
          <div class="provider-top">
            <div class="provider-icon-badge">🗽</div>
            <div class="switch-track" aria-hidden="true"><div class="switch-thumb"></div></div>
          </div>
          <div>
            <div class="provider-name">STP (Sưu Tầm Phim)</div>
            <div class="provider-desc">suutamphim.org — Kho Điện Ảnh Âu Mỹ &amp; Phim Bộ Hàn Quốc K-Drama</div>
          </div>
          <div class="tag-row">
            <span class="tag-badge tag-amber">Âu Mỹ Cinema</span>
            <span class="tag-badge tag-pink">K-Drama</span>
          </div>
        </div>

        <!-- HH3D -->
        <div class="provider-card hh3d ${isProvActive('hh3d') ? 'active' : ''}" id="card-hh3d" onclick="toggleProvider('hh3d')" role="checkbox" aria-checked="${isProvActive('hh3d') ? 'true' : 'false'}" tabindex="0">
          <div class="provider-top">
            <div class="provider-icon-badge">⚔️</div>
            <div class="switch-track" aria-hidden="true"><div class="switch-thumb"></div></div>
          </div>
          <div>
            <div class="provider-name">HH3D (Hoạt Hình 3D)</div>
            <div class="provider-desc">hoathinh3d — Tiên Hiệp &amp; Huyền Huyễn (Đấu Phá, Thôn Phệ...)</div>
          </div>
          <div class="tag-row">
            <span class="tag-badge tag-green">3D Donghua</span>
            <span class="tag-badge tag-purple">Tiên Hiệp</span>
          </div>
        </div>

        <!-- YAN -->
        <div class="provider-card yan ${isProvActive('yan') ? 'active' : ''}" id="card-yan" onclick="toggleProvider('yan')" role="checkbox" aria-checked="${isProvActive('yan') ? 'true' : 'false'}" tabindex="0">
          <div class="provider-top">
            <div class="provider-icon-badge">🔥</div>
            <div class="switch-track" aria-hidden="true"><div class="switch-thumb"></div></div>
          </div>
          <div>
            <div class="provider-name">YAN Donghua</div>
            <div class="provider-desc">yandonghua — Donghua &amp; Anime 3D Cập Nhật Theo Ngày</div>
          </div>
          <div class="tag-row">
            <span class="tag-badge tag-pink">Donghua Mới</span>
            <span class="tag-badge tag-green">Tốc Độ Cao</span>
          </div>
        </div>

        <!-- CLBPX -->
        <div class="provider-card clbpx ${isProvActive('clbpx') ? 'active' : ''}" id="card-clbpx" onclick="toggleProvider('clbpx')" role="checkbox" aria-checked="${isProvActive('clbpx') ? 'true' : 'false'}" tabindex="0">
          <div class="provider-top">
            <div class="provider-icon-badge">🗡️</div>
            <div class="switch-track" aria-hidden="true"><div class="switch-thumb"></div></div>
          </div>
          <div>
            <div class="provider-name">CLBPX (Phim Xưa)</div>
            <div class="provider-desc">clbphimxua — Kiếm Hiệp Kim Dung &amp; TVB Hồng Kông Cổ Điển</div>
          </div>
          <div class="tag-row">
            <span class="tag-badge tag-purple">Kim Dung</span>
            <span class="tag-badge tag-amber">TVB Hồng Kông</span>
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
      VIP Movies Addon v1.7.0 • Designed with Taste by <span class="brand-highlight">Q121101</span>
    </footer>
  </div>

  <!-- Floating Action Dock -->
  <div class="floating-action-dock">
    <div class="dock-container">
      <div class="dock-status-bar">
        <div class="dock-status-text">
          Đang bật: <strong id="provider-count">${resolvedConfig.providers.length} nguồn VIP</strong> &nbsp;·&nbsp; <strong id="category-count">${resolvedConfig.categories.length} danh mục</strong>
        </div>
        <div class="dock-live-tag">
          <span class="dock-live-dot"></span>
          Cấu hình tự động đồng bộ
        </div>
      </div>

      <div class="apikey-container">
        <span class="apikey-key-icon">🔑</span>
        <input class="apikey-field" id="apikey-input" type="password" placeholder="API Key riêng tư (tùy chọn)" autocomplete="off" spellcheck="false" value="${escapeHtml(resolvedConfig.apiKey)}" oninput="updateState()" aria-label="API Key" />
      </div>

      <div class="cta-button-group">
        <a class="cta-btn cta-btn-primary" id="stremio-install-btn" href="${stremioUrl}">
          <span>⚡</span> Cài đặt vào Stremio App
        </a>
        <a class="cta-btn cta-btn-secondary" id="web-install-btn" href="${webInstallUrl}" target="_blank" rel="noopener noreferrer">
          <span>🌐</span> Mở trên Stremio Web
        </a>
        <button class="cta-btn cta-btn-copy" id="dock-copy-btn" onclick="copyManifest()">
          <span>📋</span> Sao chép link Manifest
        </button>
      </div>
    </div>
  </div>

  <!-- Toast Notification -->
  <div class="clipboard-toast" id="toast" aria-live="polite">
    <span>✅</span> Đã sao chép link Manifest vào Clipboard!
  </div>

  <script>
    var _baseUrl = window.location.origin;
    var _allProvidersList = ['vsmov', 'kkphim', 'nguonc', 'stp', 'hh3d', 'yan', 'clbpx'];
    var _providers = new Set(${JSON.stringify(resolvedConfig.providers)});
    var _categories = new Set(${JSON.stringify(resolvedConfig.categories)});
    var _apiKey = ${JSON.stringify(resolvedConfig.apiKey)};

    function encodeConfigClient(providers, categories, apiKey) {
      var cfg = {
        providers: Array.from(providers).sort(),
        categories: Array.from(categories).sort(),
        apiKey: apiKey || ''
      };
      try {
        return btoa(unescape(encodeURIComponent(JSON.stringify(cfg))))
          .replace(/\\+/g, '-')
          .replace(/\\//g, '_')
          .replace(/=+$/, '');
      } catch(e) {
        return '';
      }
    }

    function updateState() {
      _apiKey = document.getElementById('apikey-input').value || '';
      var token = encodeConfigClient(_providers, _categories, _apiKey);
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
      _categories = new Set(['movie','series','anime','cinema']);
      _providers = new Set(_allProvidersList);
      _allProvidersList.forEach(function(id) {
        var c = document.getElementById('card-'+id);
        if (c) { c.classList.add('active'); c.setAttribute('aria-checked','true'); }
      });
      updateState();
    }

    function selectNone() {
      _categories = new Set(['movie']);
      _providers = new Set(['vsmov', 'kkphim']);
      _allProvidersList.forEach(function(id) {
        var c = document.getElementById('card-'+id);
        var isActive = (id === 'vsmov' || id === 'kkphim');
        if (c) {
          c.classList.toggle('active', isActive);
          c.setAttribute('aria-checked', isActive ? 'true' : 'false');
        }
      });
      updateState();
    }

    function copyManifest() {
      var url = document.getElementById('manifest-preview').textContent;
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(url).then(showToast).catch(function() { fallbackCopy(url); });
      } else {
        fallbackCopy(url);
      }
    }

    function fallbackCopy(text) {
      var ta = document.createElement('textarea');
      ta.value = text;
      ta.style.cssText = 'position:fixed;opacity:0;pointer-events:none;';
      document.body.appendChild(ta);
      ta.focus();
      ta.select();
      try { document.execCommand('copy'); showToast(); } catch(e) {}
      document.body.removeChild(ta);
    }

    function showToast() {
      var t = document.getElementById('toast');
      if (!t) return;
      t.classList.add('show');
      setTimeout(function() { t.classList.remove('show'); }, 2400);
    }

    document.querySelectorAll('.provider-card').forEach(function(card) {
      card.addEventListener('keydown', function(e) {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          card.click();
        }
      });
    });

    document.getElementById('manifest-box').addEventListener('keydown', function(e) {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        copyManifest();
      }
    });

    updateState();
  </script>

  <!-- Vercel Web Analytics & Speed Insights -->
  <script>
    window.va = window.va || function () { (window.vaq = window.vaq || []).push(arguments); };
    window.si = window.si || function () { (window.siq = window.siq || []).push(arguments); };
  </script>
  <script defer src="/_vercel/insights/script.js"></script>
  <script defer src="/_vercel/speed-insights/script.js"></script>
</body>
</html>`);
});

// ─────────────────────────────────────────────────────────────
//  CATALOG HANDLER & ROUTES
// ─────────────────────────────────────────────────────────────
async function handleCatalog(req, res) {
  const rawId = req.params.id || '';
  const rawType = req.params.type || 'movie';
  const id = rawId.replace(/\.json$/i, '');
  const type = rawType.replace(/\.json$/i, '');
  const extraParam = req.params.extra || '';

  const extra = parseExtra(extraParam);
  const searchQuery = extra.search || req.query.search || null;
  const genreFilter = extra.genre  || req.query.genre  || null;
  const skip        = extra.skip   || req.query.skip   || '0';
  const page        = skipToPage(skip);
  const config      = getConfig(req);

  console.log(`[Catalog] type=${type} id=${id} search=${searchQuery} genre=${genreFilter} page=${page}`);

  try {
    const isGenericSearch = !id || id === 'search' || id === 'all' || id === 'global' || id === 'top';
    const providerId = getProviderFromCatalogId(id);
    const catType    = getCatTypeFromCatalogId(id) || type;
    const provider   = ALL_PROVIDERS[providerId];

    // If search query on generic endpoint or unrecognized catalog, fan out across active providers
    if (searchQuery && (isGenericSearch || !provider)) {
      const activeProviderKeys = (config.providers || []).filter((p) => ALL_PROVIDERS[p]);
      const providersToRun = (activeProviderKeys.length > 0 ? activeProviderKeys : Object.keys(ALL_PROVIDERS))
        .map((k) => ALL_PROVIDERS[k]);

      const results = await Promise.allSettled(
        providersToRun.map((p) =>
          withTimeout(p.getCatalog(catType, page, { search: searchQuery, genre: genreFilter, skip }), 4500, p.name || 'CatalogProvider')
        )
      );

      const combinedMetas = [];
      const seenIds = new Set();
      for (const r of results) {
        if (r.status === 'fulfilled' && Array.isArray(r.value)) {
          for (const item of r.value) {
            if (item && item.id && !seenIds.has(item.id)) {
              seenIds.add(item.id);
              combinedMetas.push({
                ...item,
                type: item.type || type || 'movie',
              });
            }
          }
        }
      }
      return sendJSON(res, { metas: combinedMetas });
    }

    if (!provider) {
      return sendJSON(res, { metas: [] });
    }

    const items = await withTimeout(
      provider.getCatalog(catType, page, { search: searchQuery, genre: genreFilter, skip }),
      4500,
      provider.name || providerId
    ).catch((err) => {
      console.warn(`[Catalog Provider Error] ${providerId}:`, err.message);
      return [];
    });

    const metas = (Array.isArray(items) ? items : []).map((item) => {
      if (!item) return item;
      return {
        ...item,
        type: item.type || type || 'movie',
      };
    });

    return sendJSON(res, { metas });
  } catch (err) {
    console.error(`[Catalog Error]`, err.message);
    return sendJSON(res, { metas: [] });
  }
}

router.get('/catalog/:type/:id/:extra.json', handleCatalog);
router.get('/catalog/:type/:id/:extra', handleCatalog);
router.get('/catalog/:type/:id.json', handleCatalog);
router.get('/catalog/:type/:id', handleCatalog);
router.get('/:config/catalog/:type/:id/:extra.json', handleCatalog);
router.get('/:config/catalog/:type/:id/:extra', handleCatalog);
router.get('/:config/catalog/:type/:id.json', handleCatalog);
router.get('/:config/catalog/:type/:id', handleCatalog);

// ─────────────────────────────────────────────────────────────
//  META HANDLER & ROUTES
// ─────────────────────────────────────────────────────────────
async function handleMeta(req, res) {
  const rawId = req.params.id || '';
  const rawType = req.params.type || 'movie';
  const id = rawId.replace(/\.json$/i, '');
  const type = rawType.replace(/\.json$/i, '');

  if (!id) {
    return sendJSON(res, { meta: null });
  }

  // If IMDb ID, let Cinemeta handle it
  if (/^tt\d+/i.test(id)) {
    console.log(`[Meta] IMDb ID → Cinemeta: ${id}`);
    return sendJSON(res, { meta: null });
  }

  const cacheKey = `meta:${id}`;
  const cached = detailCache.get(cacheKey);
  if (cached) return sendJSON(res, { meta: cached });

  try {
    let meta = null;

    // 1. VSMOV ID
    if (id.startsWith('vsmov:') || id.startsWith('vsmov_')) {
      const slug = id.replace(/^vsmov[_:]/, '');
      const detail = await providerVsMov.getDetail(slug);
      if (detail && detail.movie) {
        meta = {
          id: `vsmov_${slug}`,
          type: detail.movie.type === 'series' ? 'series' : 'movie',
          name: detail.movie.name || detail.movie.origin_name || 'Không rõ tên',
          poster: detail.movie.poster_url || detail.movie.thumb_url,
          background: detail.movie.thumb_url || detail.movie.poster_url,
          description: detail.movie.content ? String(detail.movie.content).replace(/<[^>]+>/g, '') : null,
          year: detail.movie.year || null,
          releaseInfo: detail.movie.year ? String(detail.movie.year) : null,
        };
      }
    }
    // 2. KKPhim ID
    else if (id.startsWith('kkphim:') || id.startsWith('kkphim_')) {
      const slug = id.replace(/^kkphim[_:]/, '');
      const detail = await providerKKPhim.getDetail(slug);
      if (detail && detail.movie) {
        meta = providerKKPhim.mapDetailMeta(detail.movie, detail.episodes, type);
      }
    }
    // 3. NguonC ID
    else if (id.startsWith('nguonc:') || id.startsWith('nguonc_')) {
      const slug = id.replace(/^nguonc[_:]/, '');
      const detail = await providerNguonC.getDetail(slug);
      if (detail && detail.movie) {
        meta = mapper.mapDetailMeta(detail.movie, type);
        meta.id = id;
      }
    }
    // 4. Specialized Providers (STP, HH3D, YAN, CLBPX)
    else if (id.startsWith('stp:') || id.startsWith('stp_')) {
      const slug = id.replace(/^stp[_:]/, '');
      const detail = await providerSTP.getDetail(slug);
      if (detail && detail.movie) {
        meta = providerKKPhim.mapDetailMeta(detail.movie, detail.episodes, type);
        meta.id = `stp_${slug}`;
      }
    }
    else if (id.startsWith('hh3d:') || id.startsWith('hh3d_')) {
      const slug = id.replace(/^hh3d[_:]/, '');
      const detail = await providerHH3D.getDetail(slug);
      if (detail && detail.movie) {
        meta = providerKKPhim.mapDetailMeta(detail.movie, detail.episodes, type);
        meta.id = `hh3d_${slug}`;
      }
    }
    else if (id.startsWith('yan:') || id.startsWith('yan_')) {
      const slug = id.replace(/^yan[_:]/, '');
      const detail = await providerYAN.getDetail(slug);
      if (detail && detail.movie) {
        meta = providerKKPhim.mapDetailMeta(detail.movie, detail.episodes, type);
        meta.id = `yan_${slug}`;
      }
    }
    else if (id.startsWith('clbpx:') || id.startsWith('clbpx_')) {
      const slug = id.replace(/^clbpx[_:]/, '');
      const detail = await providerCLBPX.getDetail(slug);
      if (detail && detail.movie) {
        meta = providerKKPhim.mapDetailMeta(detail.movie, detail.episodes, type);
        meta.id = `clbpx_${slug}`;
      }
    }
    // 5. Fallback generic slug
    else {
      const slug = mapper.extractSlug(id);
      const detail = await providerNguonC.getDetail(slug);
      if (detail && detail.movie) {
        meta = mapper.mapDetailMeta(detail.movie, type);
      } else {
        const kkDetail = await providerKKPhim.getDetail(slug);
        if (kkDetail && kkDetail.movie) {
          meta = providerKKPhim.mapDetailMeta(kkDetail.movie, kkDetail.episodes, type);
        }
      }
    }

    if (meta) {
      detailCache.set(cacheKey, meta, 600);
      return sendJSON(res, { meta });
    }

    return sendJSON(res, { meta: null });
  } catch (err) {
    console.error(`[Meta Error] id=${id}`, err.message);
    return sendJSON(res, { meta: null });
  }
}

router.get('/meta/:type/:id.json', handleMeta);
router.get('/meta/:type/:id', handleMeta);
router.get('/:config/meta/:type/:id.json', handleMeta);
router.get('/:config/meta/:type/:id', handleMeta);

const PROVIDER_ORDER = ['vsmov', 'kkphim', 'nguonc', 'stp', 'hh3d', 'yan', 'clbpx'];

function getStreamPriority(stream) {
  if (!stream) return 999;
  const title = (stream.title || '').toLowerCase();
  const name = (stream.name || '').toLowerCase();
  const text = `${name} ${title}`;

  // Provider rank (VIP 1 VSMOV -> VIP 2 KKPhim -> VIP 3 NguonC -> VIP 4 STP -> VIP 5 CLBPX -> VIP 6 YAN)
  let providerRank = 7;
  if (text.includes('vsmov') || text.includes('vip 1')) providerRank = 1;
  else if (text.includes('kkphim') || text.includes('vip 2')) providerRank = 2;
  else if (text.includes('nguonc') || text.includes('vip 3')) providerRank = 3;
  else if (text.includes('stp') || text.includes('vip 4') || text.includes('sieutamphim') || text.includes('suutamphim')) providerRank = 4;
  else if (text.includes('clbpx') || text.includes('vip 5') || text.includes('clbphimxua')) providerRank = 5;
  else if (text.includes('yan') || text.includes('vip 6') || text.includes('hh3d') || text.includes('yanhh3d') || text.includes('hoathinh3d')) providerRank = 6;

  // Global priority strictly follows: 4K/UHD -> Vietsub -> Thuyết Minh -> Lồng Tiếng
  const is4K = text.includes('4k') || text.includes('ultra hd') || text.includes('3840x2160') || text.includes('uhd');
  const isVietsub = text.includes('vietsub') || text.includes('phụ đề') || text.includes('phu de');
  const isThuyetMinh = text.includes('thuyết minh') || text.includes('thuyet minh') || /\btm\b/.test(text) || text.includes('voiceover');
  const isLongTieng = text.includes('lồng tiếng') || text.includes('long tieng') || /\blt\b/.test(text) || text.includes('dub');

  let bucket = 400; // default / other
  if (is4K) {
    bucket = 0;
  } else if (isVietsub) {
    bucket = 100;
  } else if (isThuyetMinh) {
    bucket = 200;
  } else if (isLongTieng) {
    bucket = 300;
  }

  // Within 4K bucket, sub-sort: 4K Vietsub -> 4K TM -> 4K LT -> 4K Other
  if (is4K) {
    let subAudioOffset = 0;
    if (isVietsub) subAudioOffset = 0;
    else if (isThuyetMinh) subAudioOffset = 1;
    else if (isLongTieng) subAudioOffset = 2;
    else subAudioOffset = 3;
    return bucket + (providerRank * 10) + subAudioOffset;
  }

  return bucket + providerRank;
}

function normalizeStreamKey(stream) {
  if (!stream || !stream.url || typeof stream.url !== 'string') return null;
  const raw = stream.url.trim();
  try {
    const u = new URL(raw);
    const targetUrl = u.searchParams.get('url');
    if (targetUrl) {
      return `target:${targetUrl}`;
    }
    return `url:${raw}`;
  } catch {
    return `url:${raw}`;
  }
}

async function handleStream(req, res) {
  const rawId = req.params.id || '';
  const rawType = req.params.type || 'movie';
  const id = rawId.replace(/\.json$/i, '');
  const type = rawType.replace(/\.json$/i, '');
  const config = getConfig(req);
  const proxyBase = `${req.headers['x-forwarded-proto'] || req.protocol}://${req.headers['x-forwarded-host'] || req.get('host')}`.replace(/\/$/, '');

  console.log(`[Stream Aggregator] type=${type} id=${id} activeProviders=${(config.providers || []).join(',')}`);

  try {
    let imdbId = null;
    let slug = null;
    let season = null;
    let episode = null;
    let title = null;
    let year = null;
    let genres = [];
    let aliases = [];

    // Parse ID
    if (/^tt\d+/i.test(id)) {
      const parts = id.split(':');
      imdbId  = parts[0].toLowerCase();
      season  = parts[1] ? parseInt(parts[1], 10) : null;
      episode = parts[2] ? parseInt(parts[2], 10) : null;

      // Lấy canonical metadata qua Cinemeta (24h LRU cache)
      try {
        const cineMeta = await resolveCinemeta(type, imdbId);
        if (cineMeta) {
          title = cineMeta.name || null;
          year = cineMeta.year || null;
          genres = cineMeta.genres || [];
          aliases = cineMeta.aliases || [];
        }
      } catch (e) {
        console.warn(`[Stream Aggregator] Cinemeta resolve warning for ${imdbId}:`, e.message);
      }
    } else {
      // General non-IMDb ID parsing (e.g., kkphim:slug:1:1, koreandrama:teach-you-a-lesson:1:1, etc.)
      const colonParts = id.split(':');
      if (colonParts.length >= 3 && !isNaN(parseInt(colonParts[colonParts.length - 1], 10)) && !isNaN(parseInt(colonParts[colonParts.length - 2], 10))) {
        episode = parseInt(colonParts[colonParts.length - 1], 10);
        season = parseInt(colonParts[colonParts.length - 2], 10);
        slug = colonParts.slice(0, colonParts.length - 2).join(':').replace(/^(?:kkphim|nguonc|vsmov|stp|hh3d|yan|clbpx|koreandrama|series|movie|custom|phim)[_:]/i, '');
      } else if (id.startsWith('kkphim:') || id.startsWith('kkphim_')) {
        slug = id.replace(/^kkphim[_:]/, '');
      } else if (id.startsWith('nguonc:') || id.startsWith('nguonc_')) {
        slug = id.replace(/^nguonc[_:]/, '');
      } else if (id.startsWith('vsmov:') || id.startsWith('vsmov_')) {
        slug = id.replace(/^vsmov[_:]/, '');
      } else if (id.startsWith('stp:') || id.startsWith('stp_')) {
        slug = id.replace(/^stp[_:]/, '');
      } else if (id.startsWith('hh3d:') || id.startsWith('hh3d_')) {
        slug = id.replace(/^hh3d[_:]/, '');
      } else if (id.startsWith('yan:') || id.startsWith('yan_')) {
        slug = id.replace(/^yan[_:]/, '');
      } else if (id.startsWith('clbpx:') || id.startsWith('clbpx_')) {
        slug = id.replace(/^clbpx[_:]/, '');
      } else {
        slug = id;
      }

      if (!title && slug) {
        const cleanSlugTitle = slug.replace(/^(?:kkphim|nguonc|vsmov|stp|hh3d|yan|clbpx|koreandrama|series|movie|custom|phim)[_:]/i, '')
          .replace(/[-_]/g, ' ')
          .replace(/\s+/g, ' ')
          .trim();
        if (cleanSlugTitle) {
          title = cleanSlugTitle;
          aliases.push(cleanSlugTitle);
        }
      }
    }

    const payload = { imdbId, type, title, year, genres, aliases, season, episode, slug, proxyBase };

    // Lọc danh sách provider theo config người dùng theo thứ tự ưu tiên
    const activeProviderKeys = (config.providers || []).filter((p) => ALL_PROVIDERS[p]);
    const keysToUse = activeProviderKeys.length > 0 ? activeProviderKeys : PROVIDER_ORDER;
    const providersToRun = keysToUse
      .filter((k) => ALL_PROVIDERS[k])
      .map((k) => ALL_PROVIDERS[k]);

    // CHẠY SONG SONG BẤT ĐỒNG BỘ với Promise.allSettled & strict 4500ms timeout per provider
    const results = await Promise.allSettled(
      providersToRun.map((provider) =>
        withTimeout(provider.getStreams(payload), 4500, provider.name || provider.id || 'Provider')
      )
    );

    const mergedStreams = [];
    for (const r of results) {
      if (r.status === 'fulfilled' && Array.isArray(r.value)) {
        for (const item of r.value) {
          if (!item || typeof item !== 'object') continue;
          if (!item.url || typeof item.url !== 'string' || !item.url.trim()) continue;

          // Standardize and sanitize per Stremio Stream Protocol
          const sanitized = {
            name: item.name || 'VIP Movies 🎬',
            title: item.title ? String(item.title).replace(/#/g, '') : 'VIP Server',
            url: String(item.url).trim(),
            behaviorHints: {
              notSupported: false,
              bingeGroup: item.behaviorHints?.bingeGroup || `stream-${slug || imdbId || 'main'}`,
              ...(item.behaviorHints || {}),
            },
          };
          if (Array.isArray(item.subtitles)) {
            sanitized.subtitles = item.subtitles;
          }
          delete sanitized.externalUrl;
          mergedStreams.push(sanitized);
        }
      }
    }

    // Sort streams: 4K/UHD -> Vietsub -> Thuyết Minh -> Lồng Tiếng (sub-sorted by provider rank)
    mergedStreams.sort((a, b) => getStreamPriority(a) - getStreamPriority(b));

    // Deduplicate streams by normalized stream key
    const seenKeys = new Set();
    const uniqueStreams = [];
    for (const stream of mergedStreams) {
      const key = normalizeStreamKey(stream);
      if (key && !seenKeys.has(key)) {
        seenKeys.add(key);
        uniqueStreams.push(stream);
      }
    }

    console.log(`[Stream Aggregator] id=${id} → Total ${uniqueStreams.length} high-speed streams`);

    return sendJSON(res, { streams: uniqueStreams });
  } catch (err) {
    console.error(`[Stream Error] id=${id}`, err.message);
    return sendJSON(res, { streams: [] });
  }
}

router.get('/stream/:type/:id.json', handleStream);
router.get('/stream/:type/:id', handleStream);
router.get('/:config/stream/:type/:id.json', handleStream);
router.get('/:config/stream/:type/:id', handleStream);

// ─── Health check ─────────────────────────────────────────────
router.get('/health', (req, res) => {
  const stats = api.getCacheStats();
  const { imdbCache: ic, m3u8Cache: mc, catalogCache: cc, detailCache: dc } = require('./lib/cache');
  const { isSupabaseReady, isR2Ready } = require('./lib/cloudCache');
  sendJSON(res, {
    status: 'ok',
    version: MANIFEST.version,
    providers: Object.keys(ALL_PROVIDERS),
    cloudEcosystem: {
      supabasePostgreSQL: isSupabaseReady() ? 'connected' : 'fallback_memory',
      cloudflareR2: isR2Ready() ? 'connected' : 'fallback_memory',
    },
    cache: {
      nodeCache: stats,
      imdb:    ic.stats(),
      m3u8:    mc.stats(),
      catalog: cc.stats(),
      detail:  dc.stats(),
    },
    timestamp: new Date().toISOString(),
  });
});

// ─── Cache clear ──────────────────────────────────────────────
router.post('/admin/cache/clear', (req, res) => {
  api.clearCache();
  const { imdbCache: ic, m3u8Cache: mc, catalogCache: cc, detailCache: dc } = require('./lib/cache');
  ic.clear(); mc.clear(); cc.clear(); dc.clear();
  sendJSON(res, { message: 'Tất cả cache đã được xóa (NodeCache + LRU)' });
});

router.getStreamPriority = getStreamPriority;
router.getCatTypeFromCatalogId = getCatTypeFromCatalogId;
router.getProviderFromCatalogId = getProviderFromCatalogId;
router.withTimeout = withTimeout;

module.exports = router;
