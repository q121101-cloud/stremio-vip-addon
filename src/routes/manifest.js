'use strict';

/**
 * ============================================================
 *  VIP Movies Addon — src/routes/manifest.js
 *  Dynamic Manifest Router — hỗ trợ 2 format URL:
 *    1. GET /:config/manifest.json  (Base64URL token)
 *    2. GET /manifest.json?config=  (Query string)
 * ============================================================
 */

const express = require('express');
const router  = express.Router();

const { MANIFEST, buildManifest } = require('../manifest');
const { decodeConfig, isConfigToken, VALID_PROVIDERS } = require('../config');

// ─── Helper ────────────────────────────────────────────────────
function sendJSON(res, data) {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', '*');
  res.setHeader('Cache-Control', 'max-age=300, stale-while-revalidate=600');
  return res.json(data);
}

/**
 * Tạo description động theo config
 */
function buildDescription(config) {
  const { providers, categories } = config;
  const providerLabels = {
    nguonc: 'NguonC',
    kkphim: 'KKPhim',
    vsmov:  'VsMov',
  };
  const catLabels = {
    movie:  'Phim Lẻ',
    series: 'Phim Bộ',
    anime:  'Hoạt Hình',
    cinema: 'Chiếu Rạp',
  };

  const provStr = providers
    .filter((p) => VALID_PROVIDERS.includes(p))
    .map((p) => providerLabels[p] || p)
    .join(' • ');

  const catStr = categories
    .map((c) => catLabels[c] || c)
    .join(', ');

  return `Đang bật: ${provStr} — ${catStr}. Xem phim Vietsub & Thuyết Minh trên Stremio / Nuvio.`;
}

/**
 * Giải mã config từ token hoặc query string
 * @param {string|null} token - Base64URL token
 * @param {string|null} query - query param ?config=
 * @returns {{ config, isDefault }}
 */
function resolveConfig(token, query) {
  if (token && isConfigToken(token)) {
    return { config: decodeConfig(token), isDefault: false };
  }
  if (query) {
    try {
      const decoded = decodeConfig(query);
      return { config: decoded, isDefault: false };
    } catch {}
  }
  return { config: null, isDefault: true };
}

// ─────────────────────────────────────────────────────────────
//  GET /manifest.json
//  GET /manifest.json?config=<token>&key=<apiKey>
// ─────────────────────────────────────────────────────────────
router.get('/manifest.json', (req, res) => {
  const host     = req.headers['x-forwarded-host'] || req.headers.host || 'localhost:7000';
  const protocol = req.headers['x-forwarded-proto'] || req.protocol || 'http';
  const baseUrl  = `${protocol}://${host}`;
  const configUrl = `${baseUrl}/`;

  const configQuery = req.query.config || null;
  const { config, isDefault } = resolveConfig(null, configQuery);

  if (isDefault) {
    console.log('[Manifest] Default manifest');
    const manifest = {
      ...MANIFEST,
      behaviorHints: {
        ...MANIFEST.behaviorHints,
        configurationURL: configUrl,
      },
    };
    return sendJSON(res, manifest);
  }

  console.log(`[Manifest] Query config: providers=${config.providers.join(',')} cats=${config.categories.join(',')}`);
  const manifest = buildManifest(config, configUrl);
  manifest.description = buildDescription(config);
  sendJSON(res, manifest);
});

// ─────────────────────────────────────────────────────────────
//  GET /:config/manifest.json  (Base64URL token)
// ─────────────────────────────────────────────────────────────
router.get('/:config/manifest.json', (req, res) => {
  const token    = req.params.config;
  const host     = req.headers['x-forwarded-host'] || req.headers.host || 'localhost:7000';
  const protocol = req.headers['x-forwarded-proto'] || req.protocol || 'http';
  const baseUrl  = `${protocol}://${host}`;
  const configUrl = `${baseUrl}/`;

  const { config, isDefault } = resolveConfig(token, null);

  if (isDefault) {
    console.log(`[Manifest] Invalid token "${token.slice(0, 20)}..." — returning default`);
    return sendJSON(res, {
      ...MANIFEST,
      behaviorHints: { ...MANIFEST.behaviorHints, configurationURL: configUrl },
    });
  }

  console.log(`[Manifest] Token config: providers=${config.providers.join(',')} cats=${config.categories.join(',')}`);
  const manifest = buildManifest(config, configUrl);
  manifest.description = buildDescription(config);

  // Bổ sung prefix-based stream/catalog URLs cho Stremio
  // Stremio sẽ tự prepend /:config vào mọi request
  sendJSON(res, manifest);
});

// ─────────────────────────────────────────────────────────────
//  GET /:config/catalog/:type/:id.json  — proxy to handlers
//  GET /:config/stream/:type/:id.json
//  GET /:config/meta/:type/:id.json
//  Middleware: attach decoded config to req then delegate
// ─────────────────────────────────────────────────────────────
router.use('/:config', (req, res, next) => {
  const token = req.params.config;
  if (!isConfigToken(token)) return next();

  req.addonConfig = decodeConfig(token);
  req.configToken = token;
  // Strip the config prefix from URL so downstream handlers see /catalog/..., etc.
  req.url = req.url.replace(/^\/[^/]+/, '') || '/';
  next();
});

module.exports = router;
