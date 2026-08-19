'use strict';

/**
 * ============================================================
 *  VIP Movies Addon — src/routes/manifest.js
 *  Stremio Manifest Router with 16-bit Bitmask & Base62 Support
 * ============================================================
 */

const express = require('express');
const router  = express.Router();

const {
  ADDON_ID,
  ADDON_NAME,
  ADDON_VERSION,
  ADDON_DESCRIPTION,
  ADDON_LOGO,
  ALL_CATALOGS,
  ALL_ID_PREFIXES,
  VALID_PROVIDERS,
  DEFAULT_CONFIG,
} = require('../config/constants');

const { decodeConfig, isConfigToken } = require('../config/compressor');

function sendJSON(res, data) {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', '*');
  res.setHeader('Cache-Control', 'max-age=300, stale-while-revalidate=600');
  return res.json(data);
}

const BASE_MANIFEST = {
  id: ADDON_ID,
  version: ADDON_VERSION,
  name: ADDON_NAME,
  description: ADDON_DESCRIPTION,
  logo: ADDON_LOGO,
  resources: [
    'catalog',
    {
      name: 'meta',
      types: ['movie', 'series'],
      idPrefixes: ALL_ID_PREFIXES,
    },
    {
      name: 'stream',
      types: ['movie', 'series'],
      idPrefixes: ALL_ID_PREFIXES,
    },
  ],
  types: ['movie', 'series'],
  idPrefixes: ALL_ID_PREFIXES,
  behaviorHints: {
    adult: false,
    p2p: false,
    configurable: true,
    configurationRequired: false,
  },
};

/**
 * Build dynamic manifest based on config
 * @param {object} config
 * @param {string} [configUrl]
 * @returns {object}
 */
function buildManifest(config = DEFAULT_CONFIG, configUrl = '') {
  const safeProviders = Array.isArray(config?.providers) && config.providers.length > 0
    ? config.providers
    : DEFAULT_CONFIG.providers;
  const safeCategories = Array.isArray(config?.categories) && config.categories.length > 0
    ? config.categories
    : DEFAULT_CONFIG.categories;

  const filteredCatalogs = ALL_CATALOGS.filter(
    (cat) => safeProviders.includes(cat.provider) && safeCategories.includes(cat.category)
  );

  const catalogs = filteredCatalogs.length > 0
    ? filteredCatalogs.map(({ provider: _p, category: _c, ...rest }) => rest)
    : ALL_CATALOGS.map(({ provider: _p, category: _c, ...rest }) => rest);

  const manifest = {
    ...BASE_MANIFEST,
    catalogs,
  };

  if (configUrl) {
    manifest.behaviorHints = {
      ...manifest.behaviorHints,
      configurationURL: configUrl,
    };
  }

  return manifest;
}

function buildDescription(config) {
  const { providers = [], categories = [] } = config || {};
  const providerLabels = {
    vsmov:  'VSMOV 4K',
    kkphim: 'KKPhim',
    nguonc: 'NguonC',
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

// ─────────────────────────────────────────────────────────────
// GET /manifest.json & GET /manifest
// ─────────────────────────────────────────────────────────────
function handleManifest(req, res) {
  const host     = req.headers['x-forwarded-host'] || req.headers.host || 'localhost:7000';
  const protocol = req.headers['x-forwarded-proto'] || req.protocol || 'http';
  const baseUrl  = `${protocol}://${host}`;
  const configUrl = `${baseUrl}/`;

  const configQuery = req.query.config || null;
  if (configQuery) {
    const config = decodeConfig(configQuery);
    const manifest = buildManifest(config, configUrl);
    manifest.description = buildDescription(config);
    return sendJSON(res, manifest);
  }

  const manifest = buildManifest(DEFAULT_CONFIG, configUrl);
  return sendJSON(res, manifest);
}

router.get('/manifest.json', handleManifest);
router.get('/manifest', handleManifest);

// ─────────────────────────────────────────────────────────────
// GET /:config/manifest.json & GET /:config/manifest
// ─────────────────────────────────────────────────────────────
function handleConfigManifest(req, res) {
  const token    = req.params.config;
  const host     = req.headers['x-forwarded-host'] || req.headers.host || 'localhost:7000';
  const protocol = req.headers['x-forwarded-proto'] || req.protocol || 'http';
  const baseUrl  = `${protocol}://${host}`;
  const configUrl = `${baseUrl}/`;

  if (!isConfigToken(token)) {
    const manifest = buildManifest(DEFAULT_CONFIG, configUrl);
    return sendJSON(res, manifest);
  }

  const config = decodeConfig(token);
  const manifest = buildManifest(config, configUrl);
  manifest.description = buildDescription(config);
  return sendJSON(res, manifest);
}

router.get('/:config/manifest.json', handleConfigManifest);
router.get('/:config/manifest', handleConfigManifest);

// ─────────────────────────────────────────────────────────────
// Middleware: attach decoded config to req when /:config is present
// ─────────────────────────────────────────────────────────────
router.use('/:config', (req, res, next) => {
  const token = req.params.config;
  if (!isConfigToken(token)) return next();

  req.addonConfig = decodeConfig(token);
  req.configToken = token;
  next();
});

module.exports = router;
module.exports.buildManifest = buildManifest;
module.exports.BASE_MANIFEST = BASE_MANIFEST;
