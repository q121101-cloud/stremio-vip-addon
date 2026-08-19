'use strict';

/**
 * ============================================================
 *  VIP Movies Addon — src/routes/manifest.js
 *  Stremio Manifest Router with 16-bit Bitmask & Base62 Support
 * ============================================================
 */

const express = require('express');
const router  = express.Router();
const { decodeBitmask, decodeConfig } = require('../config/compressor');

const CATALOG_DEFINITIONS = [
  {
    provider: 'kkphim',
    type: 'movie',
    id: 'kkphim_phimmoi',
    name: 'KKPhim • Mới Cập Nhật',
    extra: [
      { name: 'search', isRequired: false },
      { name: 'genre', isRequired: false },
      { name: 'skip', isRequired: false },
    ],
    extraSupported: ['search', 'genre', 'skip'],
  },
  {
    provider: 'kkphim',
    type: 'series',
    id: 'kkphim_phimbo',
    name: 'KKPhim • Phim Bộ',
    extra: [
      { name: 'search', isRequired: false },
      { name: 'genre', isRequired: false },
      { name: 'skip', isRequired: false },
    ],
    extraSupported: ['search', 'genre', 'skip'],
  },
  {
    provider: 'nguonc',
    type: 'movie',
    id: 'nguonc_phimmoi',
    name: 'NguonC • Mới Cập Nhật',
    extra: [
      { name: 'search', isRequired: false },
      { name: 'genre', isRequired: false },
      { name: 'skip', isRequired: false },
    ],
    extraSupported: ['search', 'genre', 'skip'],
  },
  {
    provider: 'nguonc',
    type: 'series',
    id: 'nguonc_phimbo',
    name: 'NguonC • Phim Bộ',
    extra: [
      { name: 'search', isRequired: false },
      { name: 'genre', isRequired: false },
      { name: 'skip', isRequired: false },
    ],
    extraSupported: ['search', 'genre', 'skip'],
  },
  {
    provider: 'vsmov',
    type: 'movie',
    id: 'vsmov_4k',
    name: 'VSMOV • Phim 4K VIP',
    extra: [
      { name: 'search', isRequired: false },
      { name: 'genre', isRequired: false },
      { name: 'skip', isRequired: false },
    ],
    extraSupported: ['search', 'genre', 'skip'],
  },
];

const BASE_MANIFEST = {
  id: 'community.stremio.vip.vietnam',
  version: '2.0.0',
  name: 'VIP Vietnam Multi-Source (K20)',
  description: 'Tối ưu luồng phát phim 4K/Full HD từ NguonC, KKPhim và VSMOV.',
  resources: ['catalog', 'meta', 'stream'],
  types: ['movie', 'series'],
  idPrefixes: ['tt', 'kkphim_', 'nguonc_', 'vsmov_'],
  catalogs: CATALOG_DEFINITIONS.map(({ provider, ...cat }) => cat),
  behaviorHints: {
    adult: false,
    p2p: false,
    configurable: true,
    configurationRequired: false,
  },
};

function buildManifest(config = {}) {
  const activeProviders =
    config && Array.isArray(config.providers) && config.providers.length > 0
      ? config.providers.map((p) => String(p).toLowerCase())
      : ['nguonc', 'kkphim', 'vsmov'];

  const filteredCatalogs = CATALOG_DEFINITIONS
    .filter((c) => activeProviders.includes(c.provider.toLowerCase()))
    .map(({ provider, ...cat }) => cat);

  return {
    ...BASE_MANIFEST,
    catalogs: filteredCatalogs.length > 0 ? filteredCatalogs : BASE_MANIFEST.catalogs,
    description: `Active Sources: ${activeProviders.map((p) => p.toUpperCase()).join(', ')}`,
  };
}

const MANIFEST_ROUTES = [
  '/manifest.json',
  '/c/:bitmask/manifest.json',
  '/:config/manifest.json',
];

router.get(MANIFEST_ROUTES, (req, res) => {
  let activeProviders = ['nguonc', 'kkphim', 'vsmov'];
  const token = req.params.bitmask || req.params.config;

  if (token) {
    if (/^\d+$/.test(token)) {
      activeProviders = decodeBitmask(token);
    } else {
      const cfg = decodeConfig(token);
      if (cfg?.providers && cfg.providers.length > 0) {
        activeProviders = cfg.providers;
      }
    }
  }

  if (!Array.isArray(activeProviders) || activeProviders.length === 0) {
    activeProviders = ['nguonc', 'kkphim', 'vsmov'];
  }

  const manifest = buildManifest({ providers: activeProviders });

  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', '*');
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'max-age=300, stale-while-revalidate=600');

  return res.json(manifest);
});

module.exports = router;
module.exports.buildManifest = buildManifest;
module.exports.BASE_MANIFEST = BASE_MANIFEST;
module.exports.CATALOG_DEFINITIONS = CATALOG_DEFINITIONS;
