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

const baseManifest = {
  id: 'community.stremio.vip.vietnam',
  version: '2.0.0',
  name: 'VIP Vietnam Multi-Source (K20)',
  description: 'Tối ưu luồng phát phim 4K/Full HD từ NguonC, KKPhim và VSMOV.',
  resources: ['catalog', 'meta', 'stream'],
  types: ['movie', 'series'],
  catalogs: [
    { type: 'movie', id: 'vip_movies', name: 'VIP Phim Mới' },
    { type: 'series', id: 'vip_series', name: 'VIP Phim Bộ' },
  ],
  behaviorHints: {
    adult: false,
    p2p: false,
    configurable: true,
    configurationRequired: false,
  },
};

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

  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', '*');
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'max-age=300, stale-while-revalidate=600');

  return res.json({
    ...baseManifest,
    description: `Active Sources: ${activeProviders.map((p) => p.toUpperCase()).join(', ')}`,
  });
});

module.exports = router;
