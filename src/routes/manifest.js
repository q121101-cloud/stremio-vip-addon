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
  const { providers = [], categories = [] } = config || {};
  const providerLabels = {
    film4k: 'FILM4K',
    vsmov:  'VSMOV 4K',
    kkphim: 'KKPhim',
    nguonc: 'NguonC',
    stp:    'STP',
    hh3d:   'HH3D',
    yan:    'YAN',
    clbpx:  'CLBPX',
  };
  const catLabels = {
    movie:  'Phim Lẻ',
    series: 'Phim Bộ',
    anime:  'Hoạt Hình',
    cinema: 'Chiếu Rạp',
  };

  const provStr = (Array.isArray(providers) ? providers : [])
    .filter((p) => VALID_PROVIDERS.includes(p))
    .map((p) => providerLabels[p] || p)
    .join(' • ');

  const catStr = (Array.isArray(categories) ? categories : [])
    .map((c) => catLabels[c] || c)
    .join(', ');

  return `Đang bật: ${provStr || 'Tất cả nguồn'} — ${catStr || 'Tất cả danh mục'}. Xem phim Vietsub & Thuyết Minh trên Stremio / Nuvio.`;
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
//  GET /manifest.json & GET /manifest
//  GET /manifest.json?config=<token>&key=<apiKey>
// ─────────────────────────────────────────────────────────────
function handleManifest(req, res) {
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
}

router.get('/manifest.json', handleManifest);
router.get('/manifest', handleManifest);

// ─────────────────────────────────────────────────────────────
//  GET /:config/manifest.json & GET /:config/manifest
// ─────────────────────────────────────────────────────────────
function handleConfigManifest(req, res) {
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

  sendJSON(res, manifest);
}

router.get('/:config/manifest.json', handleConfigManifest);
router.get('/:config/manifest', handleConfigManifest);

// ─────────────────────────────────────────────────────────────
//  Middleware: attach decoded config to req when /:config is present
// ─────────────────────────────────────────────────────────────
router.use('/:config', (req, res, next) => {
  const token = req.params.config;
  if (!isConfigToken(token)) return next();

  req.addonConfig = decodeConfig(token);
  req.configToken = token;
  next();
});

module.exports = router;
