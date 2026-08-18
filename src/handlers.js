'use strict';

/**
 * ============================================================
 *  VIP Movies Addon — src/handlers.js  (Engine v1.5.1)
 *  Stremio Addon Express Route Handlers
 *  - Bộ gom luồng tổng hợp (Stream Aggregator: KKPhim + NguonC + VsMov)
 *  - Dynamic Catalog & Meta Router
 *  - Interactive Cyber-Glassmorphism Configurator Dashboard
 * ============================================================
 */

const express = require('express');
const router  = express.Router();

const api     = require('./api');
const mapper  = require('./mapper');
const { MANIFEST, GENRES, COUNTRIES, buildManifest } = require('./manifest');
const { decodeConfig, encodeConfig, isConfigToken, DEFAULT_CONFIG, getDefaultToken } = require('./config');
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

  // Specific mappings for all 22 standard catalogs + aliases
  if (id === 'vsmov-4k') return '4k';
  if (id === 'vsmov-thuyet-minh' || id === 'vsmov-tm') return 'thuyet-minh';
  if (id === 'stp-au-my' || id === 'stp-western') return 'au-my';
  if (id === 'stp-han-quoc' || id === 'stp-korean') return 'han-quoc';
  if (id === 'stp-phim-le' || id === 'stp-single') return 'movie';
  if (id === 'stp-phim-bo' || id === 'stp-series') return 'series';
  if (id === 'hh3d-phim-le' || id === 'hh3d-single') return 'movie';
  if (id === 'hh3d-phim-bo' || id === 'hh3d-series') return 'series';
  if (id === 'hh3d-tien-hiep' || id === 'hh3d-donghua') return 'tien-hiep';
  if (id === 'yan-phim-le' || id === 'yan-single') return 'movie';
  if (id === 'yan-phim-bo' || id === 'yan-series') return 'series';
  if (id === 'yan-dang-chieu' || id === 'yan-ongoing') return 'dang-chieu';
  if (id === 'clbpx-kiem-hiep' || id === 'clbpx-wuxia') return 'kiem-hiep';
  if (id === 'clbpx-hong-kong' || id === 'clbpx-tvb') return 'hong-kong';

  if (id.includes('series') || id.includes('phim-bo')) return 'series';
  if (id.includes('single') || id.includes('movie') || id.includes('phim-le')) return 'movie';
  if (id.includes('cinema') || id.includes('chieu-rap')) return 'cinema';
  if (id.includes('anime') || id.includes('hoat-hinh') || id.includes('donghua')) return 'anime';
  if (id.includes('recent') || id.includes('latest')) return 'latest';

  const parts = id.replace(/_/g, '-').split('-');
  if (parts.length >= 2) return parts.slice(1).join('-');
  return 'movie';
}

function withTimeout(promise, ms = 4000, label = 'Provider') {
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
//  ROUTE: GET / → Interactive Configurator Dashboard
// ─────────────────────────────────────────────────────────────
router.get('/', (req, res) => {
  const host     = req.headers['x-forwarded-host'] || req.headers.host || 'localhost:7000';
  const protocol = req.headers['x-forwarded-proto'] || req.protocol || 'http';
  const baseUrl  = `${protocol}://${host}`;
  const defaultToken       = getDefaultToken();
  const defaultManifestUrl = `${baseUrl}/${defaultToken}/manifest.json`;
  const stremioUrl         = `stremio://${host}/${defaultToken}/manifest.json`;
  const webInstallUrl      = `https://web.stremio.com/#/addons?addon=${encodeURIComponent(defaultManifestUrl)}`;

  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.send(`<!DOCTYPE html>
<html lang="vi">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>VIP Movies 🎬 — Cấu Hình Addon</title>
  <meta name="description" content="Cấu hình VIP Movies Stremio Addon — chọn nguồn phim, danh mục, và tạo link cài đặt cá nhân hóa." />
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  <link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:ital,wght@0,300;0,400;0,500;0,600;0,700;0,800;1,400&display=swap" rel="stylesheet" />
  <style>
    :root {
      --bg: #07080d;
      --card-bg: rgba(255, 255, 255, 0.028);
      --card-bg-hover: rgba(255, 255, 255, 0.05);
      --card-border: rgba(255, 255, 255, 0.07);
      --card-border-hover: rgba(255, 255, 255, 0.16);
      --text: #f1f5f9;
      --text-muted: #94a3b8;
      --text-dim: rgba(148, 163, 184, 0.55);
      --primary: #6366f1;
      --accent: #ec4899;
      --secondary: #8b5cf6;
      --cyan: #06b6d4;
      --green: #22c55e;
      --radius-card: 20px;
      --radius-btn: 12px;
      --radius-pill: 9999px;
      --blur: blur(28px);
      --shadow-card: 0 20px 50px rgba(0,0,0,0.65), inset 0 1px 0 rgba(255,255,255,0.07);
      --transition: 0.22s cubic-bezier(0.4,0,0.2,1);
    }
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: 'Plus Jakarta Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      background: var(--bg);
      color: var(--text);
      min-height: 100vh;
      padding: 32px 16px 160px;
      position: relative;
      overflow-x: hidden;
      -webkit-font-smoothing: antialiased;
    }
    .aurora { position:fixed;inset:0;pointer-events:none;z-index:0;overflow:hidden; }
    .orb { position:absolute;border-radius:50%;filter:blur(110px);animation:drift 22s ease-in-out infinite alternate; }
    .orb-1 { width:520px;height:520px;top:-130px;left:-160px;background:radial-gradient(circle,#6366f1,#3b82f6 60%,transparent);opacity:0.32;animation-duration:20s; }
    .orb-2 { width:600px;height:600px;bottom:-180px;right:-160px;background:radial-gradient(circle,#ec4899,#8b5cf6 55%,transparent);opacity:0.28;animation-delay:-8s;animation-duration:26s; }
    .orb-3 { width:420px;height:420px;top:35%;left:55%;transform:translate(-50%,-50%);background:radial-gradient(circle,#06b6d4,#6366f1 60%,transparent);opacity:0.18;animation-delay:-14s;animation-duration:18s; }
    @keyframes drift { 0%{transform:translate(0,0) scale(1)}40%{transform:translate(28px,45px) scale(1.07)}100%{transform:translate(-25px,-18px) scale(0.94)} }
    .container { position:relative;z-index:1;max-width:700px;margin:0 auto; }
    .header { text-align:center;margin-bottom:32px; }
    .logo-wrap { display:inline-flex;align-items:center;justify-content:center;gap:14px;margin-bottom:16px; }
    .logo-cinema { position:relative;width:56px;height:56px;background:linear-gradient(135deg,#6366f1,#ec4899);border-radius:16px;display:flex;align-items:center;justify-content:center;font-size:1.8rem;box-shadow:0 8px 24px rgba(99,102,241,0.5),0 0 0 1px rgba(255,255,255,0.1);flex-shrink:0; }
    .logo-cinema::after { content:'';position:absolute;inset:-3px;border-radius:20px;border:1.5px solid rgba(99,102,241,0.4);animation:logoPulse 3s ease infinite; }
    @keyframes logoPulse { 0%,100%{opacity:0.5;transform:scale(1)}50%{opacity:1;transform:scale(1.04)} }
    .logo-text { text-align:left; }
    .logo-text h1 { font-size:1.7rem;font-weight:800;letter-spacing:-0.03em;background:linear-gradient(135deg,#ffffff 0%,#cbd5e1 40%,#c084fc 100%);-webkit-background-clip:text;-webkit-text-fill-color:transparent;line-height:1.1; }
    .logo-text .tagline { font-size:0.8rem;color:var(--text-muted);font-weight:400;margin-top:2px; }
    .live-badge { display:inline-flex;align-items:center;gap:7px;padding:5px 14px;border-radius:var(--radius-pill);font-size:0.78rem;font-weight:600;background:rgba(34,197,94,0.1);border:1px solid rgba(34,197,94,0.22);color:#4ade80; }
    .pulse-dot { width:7px;height:7px;background:#22c55e;border-radius:50%;animation:blink 2s ease infinite;flex-shrink:0; }
    @keyframes blink { 0%,100%{box-shadow:0 0 0 0 rgba(34,197,94,0.6)}50%{box-shadow:0 0 0 6px rgba(34,197,94,0)} }
    .glass-card { background:var(--card-bg);backdrop-filter:var(--blur);-webkit-backdrop-filter:var(--blur);border:1px solid var(--card-border);border-radius:var(--radius-card);box-shadow:var(--shadow-card);padding:24px;margin-bottom:16px;transition:border-color var(--transition); }
    .glass-card:hover { border-color:var(--card-border-hover); }
    .section-label { font-size:0.72rem;font-weight:700;color:var(--text-dim);text-transform:uppercase;letter-spacing:0.1em;margin-bottom:14px;display:flex;align-items:center;gap:8px; }
    .section-label::after { content:'';flex:1;height:1px;background:linear-gradient(90deg,rgba(255,255,255,0.08),transparent); }
    .pill-group { display:flex;flex-wrap:wrap;gap:8px; }
    .pill { display:inline-flex;align-items:center;gap:6px;padding:7px 15px;border-radius:var(--radius-pill);font-size:0.82rem;font-weight:600;border:1px solid rgba(255,255,255,0.1);background:rgba(255,255,255,0.04);color:var(--text-muted);cursor:pointer;transition:all var(--transition);user-select:none;-webkit-user-select:none; }
    .pill:hover { background:rgba(255,255,255,0.08);border-color:rgba(255,255,255,0.2);color:var(--text);transform:translateY(-1px); }
    .pill.active { background:rgba(99,102,241,0.18);border-color:rgba(99,102,241,0.5);color:#a5b4fc;box-shadow:0 0 12px rgba(99,102,241,0.25); }
    .pill.action-pill { background:rgba(255,255,255,0.04);border-color:rgba(255,255,255,0.12);color:var(--text-muted); }
    .pill.action-pill:hover { background:rgba(255,255,255,0.1);color:var(--text); }
    .pill.danger-pill:hover { background:rgba(239,68,68,0.12);border-color:rgba(239,68,68,0.35);color:#f87171; }
    .provider-grid { display:grid;grid-template-columns:repeat(3,1fr);gap:12px; }
    @media (max-width:480px) { .provider-grid { grid-template-columns:1fr; } }
    .provider-card { background:rgba(255,255,255,0.025);border:1px solid rgba(255,255,255,0.07);border-radius:16px;padding:18px 16px;cursor:pointer;transition:all var(--transition);position:relative;overflow:hidden;user-select:none; }
    .provider-card::before { content:'';position:absolute;inset:0;opacity:0;transition:opacity 0.3s; }
    .provider-card.nguonc::before { background:radial-gradient(circle at 30% 30%,rgba(99,102,241,0.12),transparent 70%); }
    .provider-card.kkphim::before { background:radial-gradient(circle at 30% 30%,rgba(236,72,153,0.1),transparent 70%); }
    .provider-card.vsmov::before  { background:radial-gradient(circle at 30% 30%,rgba(6,182,212,0.1),transparent 70%); }
    .provider-card:hover { border-color:rgba(255,255,255,0.18);transform:translateY(-2px);box-shadow:0 12px 28px rgba(0,0,0,0.35); }
    .provider-card:hover::before { opacity:1; }
    .provider-card.active { border-color:rgba(99,102,241,0.45);box-shadow:0 0 0 1px rgba(99,102,241,0.2),0 12px 28px rgba(0,0,0,0.4); }
    .provider-card.active.kkphim { border-color:rgba(236,72,153,0.45);box-shadow:0 0 0 1px rgba(236,72,153,0.2),0 12px 28px rgba(0,0,0,0.4); }
    .provider-card.active.vsmov  { border-color:rgba(6,182,212,0.45);box-shadow:0 0 0 1px rgba(6,182,212,0.2),0 12px 28px rgba(0,0,0,0.4); }
    .provider-card.active::before { opacity:1; }
    .provider-top { display:flex;align-items:flex-start;justify-content:space-between;margin-bottom:12px; }
    .provider-icon { font-size:1.5rem;line-height:1; }
    .toggle-track { width:38px;height:20px;background:rgba(255,255,255,0.1);border-radius:var(--radius-pill);position:relative;transition:background 0.22s;flex-shrink:0;border:1px solid rgba(255,255,255,0.1); }
    .toggle-track::after { content:'';position:absolute;top:2px;left:2px;width:14px;height:14px;background:rgba(255,255,255,0.5);border-radius:50%;transition:transform 0.22s cubic-bezier(0.34,1.56,0.64,1),background 0.22s; }
    .provider-card.active .toggle-track { background:var(--primary);border-color:transparent;box-shadow:0 0 10px rgba(99,102,241,0.5); }
    .provider-card.active.kkphim .toggle-track { background:var(--accent);box-shadow:0 0 10px rgba(236,72,153,0.5); }
    .provider-card.active.vsmov  .toggle-track { background:var(--cyan);box-shadow:0 0 10px rgba(6,182,212,0.5); }
    .provider-card.active .toggle-track::after { transform:translateX(18px);background:#fff; }
    .provider-name { font-size:0.95rem;font-weight:700;color:var(--text);margin-bottom:4px; }
    .provider-desc { font-size:0.72rem;color:var(--text-muted);line-height:1.4; }
    .badge-row { display:flex;flex-wrap:wrap;gap:5px;margin-top:10px; }
    .badge { font-size:0.65rem;font-weight:600;padding:2px 7px;border-radius:5px;letter-spacing:0.02em; }
    .badge-purple { background:rgba(139,92,246,0.2);color:#c4b5fd; }
    .badge-pink   { background:rgba(236,72,153,0.2);color:#f9a8d4; }
    .badge-cyan   { background:rgba(6,182,212,0.2);color:#67e8f9; }
    .badge-green  { background:rgba(34,197,94,0.2);color:#86efac; }
    .badge-amber  { background:rgba(245,158,11,0.2);color:#fcd34d; }
    .url-box { background:rgba(0,0,0,0.45);border:1px dashed rgba(255,255,255,0.12);border-radius:12px;padding:14px 16px;cursor:pointer;transition:all var(--transition); }
    .url-box:hover { border-color:rgba(167,139,250,0.55);background:rgba(0,0,0,0.6); }
    .url-label { display:flex;justify-content:space-between;align-items:center;font-size:0.72rem;font-weight:700;color:#a78bfa;text-transform:uppercase;letter-spacing:0.07em;margin-bottom:7px; }
    .url-copy-hint { font-size:0.68rem;padding:2px 8px;border-radius:5px;background:rgba(167,139,250,0.12);color:#c084fc;font-weight:500; }
    .url-value { font-family:'JetBrains Mono','Fira Code',Consolas,monospace;font-size:0.78rem;color:#cbd5e1;word-break:break-all;line-height:1.5; }
    .btn-group { display:flex;flex-direction:column;gap:10px; }
    .btn { display:flex;align-items:center;justify-content:center;gap:9px;padding:14px 24px;border-radius:var(--radius-btn);font-weight:700;font-size:0.95rem;text-decoration:none;transition:all var(--transition);cursor:pointer;border:none;font-family:inherit;letter-spacing:-0.01em; }
    .btn-primary { background:linear-gradient(135deg,#6366f1 0%,#a855f7 50%,#ec4899 100%);color:#fff;border:1px solid rgba(255,255,255,0.18);box-shadow:0 8px 24px rgba(99,102,241,0.4); }
    .btn-primary:hover { transform:translateY(-2px) scale(1.008);box-shadow:0 14px 32px rgba(99,102,241,0.55);filter:brightness(1.06); }
    .btn-secondary { background:rgba(255,255,255,0.04);color:#e2e8f0;border:1px solid rgba(255,255,255,0.12); }
    .btn-secondary:hover { background:rgba(255,255,255,0.09);border-color:rgba(255,255,255,0.24);transform:translateY(-1px);color:#fff; }
    .status-bar { display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:10px;margin-bottom:16px; }
    .status-text { font-size:0.8rem;color:var(--text-muted);font-weight:500; }
    .status-text strong { color:var(--text); }
    .status-indicator { display:flex;align-items:center;gap:6px;font-size:0.75rem;color:#4ade80;font-weight:600; }
    .status-indicator .dot { width:6px;height:6px;background:#22c55e;border-radius:50%;animation:blink 2s ease infinite; }
    .floating-dock { position:fixed;bottom:0;left:0;right:0;z-index:100;padding:0 16px 24px;background:linear-gradient(to top,rgba(7,8,13,0.98) 60%,transparent); }
    .dock-inner { max-width:700px;margin:0 auto;background:rgba(15,17,25,0.82);backdrop-filter:blur(24px);-webkit-backdrop-filter:blur(24px);border:1px solid rgba(255,255,255,0.09);border-radius:18px;padding:16px 20px;box-shadow:0 -8px 40px rgba(0,0,0,0.6),0 0 0 1px rgba(255,255,255,0.04); }
    .apikey-row { display:flex;align-items:center;gap:10px;margin-bottom:14px;background:rgba(0,0,0,0.35);border:1px solid rgba(255,255,255,0.08);border-radius:10px;padding:9px 14px;transition:border-color var(--transition); }
    .apikey-row:focus-within { border-color:rgba(99,102,241,0.45);box-shadow:0 0 0 2px rgba(99,102,241,0.12); }
    .apikey-icon { font-size:0.95rem;flex-shrink:0;color:var(--text-muted); }
    .apikey-input { flex:1;background:transparent;border:none;outline:none;color:var(--text);font-size:0.85rem;font-family:'JetBrains Mono',Consolas,monospace;font-weight:500; }
    .apikey-input::placeholder { color:rgba(148,163,184,0.45); }
    .toast { position:fixed;bottom:130px;left:50%;transform:translateX(-50%) translateY(20px);background:rgba(15,23,42,0.96);border:1px solid rgba(34,197,94,0.35);color:#4ade80;backdrop-filter:blur(16px);padding:10px 22px;border-radius:var(--radius-pill);font-size:0.85rem;font-weight:600;box-shadow:0 12px 32px rgba(0,0,0,0.6);display:flex;align-items:center;gap:8px;opacity:0;pointer-events:none;transition:all 0.32s cubic-bezier(0.34,1.56,0.64,1);z-index:200;white-space:nowrap; }
    .toast.show { transform:translateX(-50%) translateY(0);opacity:1; }
    .divider { height:1px;background:linear-gradient(90deg,transparent,rgba(255,255,255,0.07),transparent);margin:20px 0; }
    .footer { text-align:center;font-size:0.74rem;color:var(--text-dim);padding:12px 0 4px; }
    .brand-highlight { font-weight:800;background:linear-gradient(135deg,#a855f7 0%,#ec4899 50%,#38bdf8 100%);-webkit-background-clip:text;-webkit-text-fill-color:transparent;filter:drop-shadow(0 0 8px rgba(236,72,153,0.6));letter-spacing:0.5px;padding:0 2px;display:inline-block;transition:all 0.3s ease; }
    .brand-highlight:hover { filter:drop-shadow(0 0 14px rgba(56,189,248,0.8));transform:scale(1.06); }
    @media (max-width:520px) { body{padding:20px 12px 160px}.glass-card{padding:18px}.dock-inner{padding:14px 16px} }
  </style>
</head>
<body>
  <div class="aurora" aria-hidden="true">
    <div class="orb orb-1"></div>
    <div class="orb orb-2"></div>
    <div class="orb orb-3"></div>
  </div>
  <div class="container">
    <header class="header">
      <div class="logo-wrap">
        <div class="logo-cinema" aria-hidden="true">🎬</div>
        <div class="logo-text">
          <h1>VIP Movies</h1>
          <div class="tagline">Stremio &amp; Nuvio Addon</div>
        </div>
      </div>
      <div class="live-badge">
        <span class="pulse-dot" aria-hidden="true"></span>
        Hệ thống Trực tuyến &nbsp;·&nbsp; v1.5.1
      </div>
    </header>

    <div class="glass-card">
      <div class="section-label">⚡ Thao tác nhanh &amp; Danh mục</div>
      <div class="pill-group" id="action-pills">
        <button class="pill action-pill" onclick="selectAll()">⚡ Bật tất cả</button>
        <button class="pill action-pill danger-pill" onclick="selectNone()">🚫 Tắt tất cả</button>
        <div style="width:1px;background:rgba(255,255,255,0.08);margin:0 4px;height:auto;align-self:stretch;border-radius:1px;"></div>
        <button class="pill" id="cat-movie"  onclick="toggleCat('movie')">🎬 Phim Lẻ</button>
        <button class="pill" id="cat-series" onclick="toggleCat('series')">📺 Phim Bộ</button>
        <button class="pill" id="cat-anime"  onclick="toggleCat('anime')">🐉 Hoạt Hình</button>
        <button class="pill" id="cat-cinema" onclick="toggleCat('cinema')">🍿 Chiếu Rạp</button>
      </div>
    </div>

    <div class="glass-card">
      <div class="section-label">🌐 Chọn nguồn phim (7 Nguồn VIP)</div>
      <div class="provider-grid">
        <div class="provider-card vsmov active" id="card-vsmov" onclick="toggleProvider('vsmov')" role="checkbox" aria-checked="true" tabindex="0">
          <div class="provider-top">
            <div class="provider-icon">🌟</div>
            <div class="toggle-track" aria-hidden="true"></div>
          </div>
          <div class="provider-name">VSMOV 4K</div>
          <div class="provider-desc">vsmov.com — Master 4K Ultra HD &amp; Thuyết Minh</div>
          <div class="badge-row">
            <span class="badge badge-cyan">Master 4K</span>
            <span class="badge badge-green">Thuyết Minh</span>
            <span class="badge badge-cyan">CDN VIP</span>
          </div>
        </div>
        <div class="provider-card kkphim active" id="card-kkphim" onclick="toggleProvider('kkphim')" role="checkbox" aria-checked="true" tabindex="0">
          <div class="provider-top">
            <div class="provider-icon">🔮</div>
            <div class="toggle-track" aria-hidden="true"></div>
          </div>
          <div class="provider-name">KKPhim</div>
          <div class="provider-desc">phimapi.com — Đa máy chủ &amp; Kho phim mở rộng</div>
          <div class="badge-row">
            <span class="badge badge-pink">Vietsub</span>
            <span class="badge badge-amber">Full HD</span>
            <span class="badge badge-pink">IMDb Direct</span>
          </div>
        </div>
        <div class="provider-card nguonc active" id="card-nguonc" onclick="toggleProvider('nguonc')" role="checkbox" aria-checked="true" tabindex="0">
          <div class="provider-top">
            <div class="provider-icon">🎞️</div>
            <div class="toggle-track" aria-hidden="true"></div>
          </div>
          <div class="provider-name">NguonC</div>
          <div class="provider-desc">phim.nguonc.com — StreamC Vietsub &amp; Thuyết Minh</div>
          <div class="badge-row">
            <span class="badge badge-purple">StreamC</span>
            <span class="badge badge-green">Thuyết Minh</span>
            <span class="badge badge-purple">IMDb</span>
          </div>
        </div>
        <div class="provider-card stp active" id="card-stp" onclick="toggleProvider('stp')" role="checkbox" aria-checked="true" tabindex="0">
          <div class="provider-top">
            <div class="provider-icon">🗽</div>
            <div class="toggle-track" aria-hidden="true"></div>
          </div>
          <div class="provider-name">STP</div>
          <div class="provider-desc">suutamphim.org — Âu Mỹ Tuyển Chọn &amp; K-Drama</div>
          <div class="badge-row">
            <span class="badge badge-amber">Âu Mỹ Cinema</span>
            <span class="badge badge-pink">K-Drama</span>
          </div>
        </div>
        <div class="provider-card hh3d active" id="card-hh3d" onclick="toggleProvider('hh3d')" role="checkbox" aria-checked="true" tabindex="0">
          <div class="provider-top">
            <div class="provider-icon">⚔️</div>
            <div class="toggle-track" aria-hidden="true"></div>
          </div>
          <div class="provider-name">HH3D</div>
          <div class="provider-desc">hoathinh3d — Hoạt Hình 3D Trung Quốc &amp; Tiên Hiệp</div>
          <div class="badge-row">
            <span class="badge badge-cyan">3D Donghua</span>
            <span class="badge badge-purple">Tiên Hiệp</span>
          </div>
        </div>
        <div class="provider-card yan active" id="card-yan" onclick="toggleProvider('yan')" role="checkbox" aria-checked="true" tabindex="0">
          <div class="provider-top">
            <div class="provider-icon">🔥</div>
            <div class="toggle-track" aria-hidden="true"></div>
          </div>
          <div class="provider-name">YAN</div>
          <div class="provider-desc">yandonghua — Donghua &amp; Anime Đang Chiếu</div>
          <div class="badge-row">
            <span class="badge badge-pink">Donghua Mới</span>
            <span class="badge badge-green">Tốc Độ Cao</span>
          </div>
        </div>
        <div class="provider-card clbpx active" id="card-clbpx" onclick="toggleProvider('clbpx')" role="checkbox" aria-checked="true" tabindex="0">
          <div class="provider-top">
            <div class="provider-icon">🗡️</div>
            <div class="toggle-track" aria-hidden="true"></div>
          </div>
          <div class="provider-name">CLBPX</div>
          <div class="provider-desc">clbphimxua — Kiếm Hiệp Kim Dung &amp; TVB Kinh Điển</div>
          <div class="badge-row">
            <span class="badge badge-purple">Kim Dung</span>
            <span class="badge badge-amber">TVB Hồng Kông</span>
          </div>
        </div>
      </div>
    </div>

    <div class="glass-card">
      <div class="section-label">🔗 Link Manifest cá nhân hóa</div>
      <div class="url-box" id="url-box" onclick="copyManifest()" role="button" tabindex="0" title="Bấm để sao chép">
        <div class="url-label">
          <span>Manifest URL</span>
          <span class="url-copy-hint">📋 Bấm để Copy</span>
        </div>
        <div class="url-value" id="manifest-preview">${defaultManifestUrl}</div>
      </div>
    </div>

    <div class="footer">
      VIP Movies Addon v1.5.1 • Powered by <span class="brand-highlight">Q121101</span>
    </div>
  </div>

  <div class="floating-dock">
    <div class="dock-inner">
      <div class="status-bar">
        <div class="status-text">Đang bật: <strong id="provider-count">7 nguồn</strong> &nbsp;·&nbsp; <strong id="category-count">4 danh mục</strong></div>
        <div class="status-indicator"><span class="dot"></span>Config đã cập nhật</div>
      </div>
      <div class="apikey-row">
        <span class="apikey-icon">🔑</span>
        <input class="apikey-input" id="apikey-input" type="password" placeholder="API Key riêng (tùy chọn)" autocomplete="off" spellcheck="false" oninput="updateState()" aria-label="API Key riêng tư" />
      </div>
      <div class="btn-group">
        <a class="btn btn-primary" id="stremio-install-btn" href="${stremioUrl}"><span aria-hidden="true">⚡</span> Cài đặt vào Stremio App</a>
        <a class="btn btn-secondary" id="web-install-btn" href="${webInstallUrl}" target="_blank" rel="noopener noreferrer"><span aria-hidden="true">🌐</span> Mở trên Stremio Web</a>
      </div>
    </div>
  </div>

  <div class="toast" id="toast" aria-live="polite"><span aria-hidden="true">✅</span> Đã sao chép vào Clipboard!</div>

  <script>
    var _baseUrl = window.location.origin;
    var _allProvidersList = ['vsmov', 'kkphim', 'nguonc', 'stp', 'hh3d', 'yan', 'clbpx'];
    var _providers = new Set(['vsmov', 'kkphim', 'nguonc', 'stp', 'hh3d', 'yan', 'clbpx']);
    var _categories = new Set(['movie', 'series', 'anime', 'cinema']);
    var _apiKey = '';

    function encodeConfigClient(providers, categories, apiKey) {
      var cfg = { providers: Array.from(providers).sort(), categories: Array.from(categories).sort(), apiKey: apiKey || '' };
      try {
        return btoa(unescape(encodeURIComponent(JSON.stringify(cfg)))).replace(/\\+/g,'-').replace(/\\//g,'_').replace(/=+$/,'');
      } catch(e) { return ''; }
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
      document.getElementById('provider-count').textContent = _providers.size + ' nguồn';
      document.getElementById('category-count').textContent = _categories.size + ' danh mục';
      ['movie','series','anime','cinema'].forEach(function(c) {
        var el = document.getElementById('cat-' + c);
        if (el) el.classList.toggle('active', _categories.has(c));
      });
    }

    function toggleCat(cat) {
      if (_categories.has(cat)) { if (_categories.size > 1) _categories.delete(cat); }
      else _categories.add(cat);
      updateState();
    }

    function toggleProvider(id) {
      var card = document.getElementById('card-' + id);
      if (!card) return;
      if (_providers.has(id)) {
        if (_providers.size > 1) { _providers.delete(id); card.classList.remove('active'); card.setAttribute('aria-checked','false'); }
      } else {
        _providers.add(id); card.classList.add('active'); card.setAttribute('aria-checked','true');
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
      _categories = new Set(['movie']); _providers = new Set(['vsmov', 'kkphim']);
      _allProvidersList.forEach(function(id) {
        var c = document.getElementById('card-'+id);
        var isActive = (id === 'vsmov' || id === 'kkphim');
        if (c) { c.classList.toggle('active', isActive); c.setAttribute('aria-checked', isActive ? 'true' : 'false'); }
      });
      updateState();
    }

    function copyManifest() {
      var url = document.getElementById('manifest-preview').textContent;
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(url).then(showToast).catch(function() { fallbackCopy(url); });
      } else { fallbackCopy(url); }
    }

    function fallbackCopy(text) {
      var ta = document.createElement('textarea'); ta.value = text;
      ta.style.cssText = 'position:fixed;opacity:0;pointer-events:none;';
      document.body.appendChild(ta); ta.focus(); ta.select();
      try { document.execCommand('copy'); showToast(); } catch(e) {}
      document.body.removeChild(ta);
    }

    function showToast() {
      var t = document.getElementById('toast'); if (!t) return;
      t.classList.add('show'); setTimeout(function() { t.classList.remove('show'); }, 2400);
    }

    document.querySelectorAll('.provider-card').forEach(function(card) {
      card.addEventListener('keydown', function(e) { if (e.key==='Enter'||e.key===' ') { e.preventDefault(); card.click(); } });
    });
    document.getElementById('url-box').addEventListener('keydown', function(e) {
      if (e.key==='Enter'||e.key===' ') { e.preventDefault(); copyManifest(); }
    });

    updateState();
  </script>
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
          withTimeout(p.getCatalog(catType, page, { search: searchQuery, genre: genreFilter, skip }), 4000, p.name || 'CatalogProvider')
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
      4000,
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
  if (!stream) return 200;
  const title = (stream.title || '').toLowerCase();
  const name = (stream.name || '').toLowerCase();
  const combined = `${name} ${title}`;

  // 1. VSMOV 4K Ultra HD (VIP 1)
  if (combined.includes('vsmov') && (combined.includes('4k') || combined.includes('ultra hd') || combined.includes('3840x2160'))) return 10;
  // 2. VSMOV Thuyết Minh / Other (VIP 1)
  if (combined.includes('vsmov') || combined.includes('vip 1')) return 20;
  // 3. KKPhim Vietsub (VIP 2)
  if ((combined.includes('kkphim') || combined.includes('vip 2')) && combined.includes('vietsub')) return 30;
  // 4. KKPhim Thuyết Minh / Lồng Tiếng / Other (VIP 2)
  if (combined.includes('kkphim') || combined.includes('vip 2')) return 40;
  // 5. NguonC Vietsub (VIP 3)
  if ((combined.includes('nguonc') || combined.includes('vip 3')) && combined.includes('vietsub')) return 50;
  // 6. NguonC Thuyết Minh / Other (VIP 3)
  if (combined.includes('nguonc') || combined.includes('vip 3')) return 60;
  // 7. STP (Western & K-Drama)
  if (combined.includes('stp') || combined.includes('suutamphim')) return 70;
  // 8. HH3D (3D Donghua)
  if (combined.includes('hh3d') || combined.includes('hoathinh3d')) return 80;
  // 9. YAN (Donghua Ongoing)
  if (combined.includes('yan') || combined.includes('yandonghua')) return 90;
  // 10. CLBPX (Wuxia & TVB)
  if (combined.includes('clbpx') || combined.includes('clbphimxua')) return 100;
  return 200;
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
    } else if (id.startsWith('kkphim:') || id.startsWith('kkphim_')) {
      const withoutPrefix = id.replace(/^kkphim[_:]/, '');
      const parts = withoutPrefix.split(':');
      slug = parts[0];
      if (parts.length >= 3) {
        season = parseInt(parts[1], 10);
        episode = parseInt(parts[2], 10);
      }
    } else if (id.startsWith('nguonc:') || id.startsWith('nguonc_')) {
      const withoutPrefix = id.replace(/^nguonc[_:]/, '');
      const parts = withoutPrefix.split(':');
      slug = parts[0];
      if (parts.length >= 3) {
        episode = parts.slice(2).join(':');
      }
    } else if (id.startsWith('vsmov:') || id.startsWith('vsmov_')) {
      const withoutPrefix = id.replace(/^vsmov[_:]/, '');
      const parts = withoutPrefix.split(':');
      slug = parts[0];
      if (parts.length >= 3) {
        season = parseInt(parts[1], 10);
        episode = parseInt(parts[2], 10);
      }
    } else if (id.startsWith('stp:') || id.startsWith('stp_')) {
      const withoutPrefix = id.replace(/^stp[_:]/, '');
      const parts = withoutPrefix.split(':');
      slug = parts[0];
      if (parts.length >= 3) {
        season = parseInt(parts[1], 10);
        episode = parseInt(parts[2], 10);
      }
    } else if (id.startsWith('hh3d:') || id.startsWith('hh3d_')) {
      const withoutPrefix = id.replace(/^hh3d[_:]/, '');
      const parts = withoutPrefix.split(':');
      slug = parts[0];
      if (parts.length >= 3) {
        season = parseInt(parts[1], 10);
        episode = parseInt(parts[2], 10);
      }
    } else if (id.startsWith('yan:') || id.startsWith('yan_')) {
      const withoutPrefix = id.replace(/^yan[_:]/, '');
      const parts = withoutPrefix.split(':');
      slug = parts[0];
      if (parts.length >= 3) {
        season = parseInt(parts[1], 10);
        episode = parseInt(parts[2], 10);
      }
    } else if (id.startsWith('clbpx:') || id.startsWith('clbpx_')) {
      const withoutPrefix = id.replace(/^clbpx[_:]/, '');
      const parts = withoutPrefix.split(':');
      slug = parts[0];
      if (parts.length >= 3) {
        season = parseInt(parts[1], 10);
        episode = parseInt(parts[2], 10);
      }
    } else {
      slug = id;
    }

    const payload = { imdbId, type, title, year, genres, aliases, season, episode, slug, proxyBase };

    // Lọc danh sách provider theo config người dùng theo thứ tự ưu tiên
    const activeProviderKeys = (config.providers || []).filter((p) => ALL_PROVIDERS[p]);
    const keysToUse = activeProviderKeys.length > 0 ? activeProviderKeys : PROVIDER_ORDER;
    const providersToRun = keysToUse
      .filter((k) => ALL_PROVIDERS[k])
      .map((k) => ALL_PROVIDERS[k]);

    // CHẠY SONG SONG BẤT ĐỒNG BỘ với Promise.allSettled & strict 4000ms timeout per provider
    const results = await Promise.allSettled(
      providersToRun.map((provider) =>
        withTimeout(provider.getStreams(payload), 4000, provider.name || provider.id || 'Provider')
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

    // Sort streams: VSMOV 4K -> KKPhim -> NguonC -> Specialized
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
  sendJSON(res, {
    status: 'ok',
    version: MANIFEST.version,
    providers: Object.keys(ALL_PROVIDERS),
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

module.exports = router;
