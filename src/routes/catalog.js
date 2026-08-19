'use strict';

/**
 * ============================================================
 *  VIP Movies Addon — src/routes/catalog.js
 *  Stremio Catalog Router with Tiered Caching (L1/L2)
 * ============================================================
 */

const express = require('express');
const router  = express.Router();

const providerVsMov  = require('../providers/vsmov');
const providerKKPhim = require('../providers/kkphim');
const providerNguonC = require('../providers/nguonc');
const { catalogCache } = require('../db/cache');
const { decodeConfig } = require('../config/compressor');
const { safeExtra, safeSlug, safeKeyword, safePage } = require('../lib/utils');
const { TTL } = require('../config/constants');

const ALL_PROVIDERS = {
  vsmov:  providerVsMov,
  kkphim: providerKKPhim,
  nguonc: providerNguonC,
};

function sendJSON(res, data) {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', '*');
  res.setHeader('Cache-Control', 'max-age=300, stale-while-revalidate=600');
  return res.json(data);
}

function getConfig(req) {
  if (req.addonConfig) return req.addonConfig;
  if (req.params.config) return decodeConfig(req.params.config);
  if (req.query.config) return decodeConfig(req.query.config);
  return decodeConfig(null);
}

function getProviderFromCatalogId(catalogId) {
  if (!catalogId) return 'nguonc';
  const id = String(catalogId).toLowerCase().trim();
  if (id.startsWith('vsmov')) return 'vsmov';
  if (id.startsWith('kkphim')) return 'kkphim';
  if (id.startsWith('nguonc')) return 'nguonc';
  return 'nguonc';
}

function getCatTypeFromCatalogId(catalogId) {
  if (!catalogId) return 'movie';
  const id = String(catalogId).toLowerCase().trim();

  // VSMOV
  if (id === 'vsmov-4k' || id === 'vsmov-4k-sieu-net') return '4k';
  if (id === 'vsmov-thuyet-minh' || id === 'vsmov-tm') return 'thuyet-minh';

  // KKPhim
  if (id === 'kkphim-movie-latest' || id === 'kkphim-phim-le') return 'movie';
  if (id === 'kkphim-series-latest' || id === 'kkphim-phim-bo') return 'series';
  if (id === 'kkphim-cinema-latest' || id === 'kkphim-chieu-rap') return 'cinema';
  if (id === 'kkphim-anime-latest' || id === 'kkphim-hoat-hinh') return 'anime';

  // NguonC
  if (id === 'nguonc-movie-latest' || id === 'nguonc-phim-le') return 'movie';
  if (id === 'nguonc-series-latest' || id === 'nguonc-phim-bo') return 'series';
  if (id === 'nguonc-cinema-latest' || id === 'nguonc-chieu-rap') return 'cinema';
  if (id === 'nguonc-anime-latest' || id === 'nguonc-moi-cap-nhat') return 'phim-moi-cap-nhat';

  if (id.includes('series') || id.includes('phim-bo')) return 'series';
  if (id.includes('single') || id.includes('movie') || id.includes('phim-le')) return 'movie';
  if (id.includes('cinema') || id.includes('chieu-rap')) return 'cinema';
  if (id.includes('anime') || id.includes('hoat-hinh')) return 'anime';

  const parts = id.replace(/_/g, '-').split('-');
  if (parts.length >= 2) return parts.slice(1).join('-');
  return 'movie';
}

async function handleCatalog(req, res) {
  const rawId    = req.params.id || '';
  const rawType  = req.params.type || 'movie';
  const extraRaw = req.params.extra || '';

  const catalogId = rawId.replace(/\.json$/i, '');
  const type      = rawType.replace(/\.json$/i, '');
  const extra     = safeExtra(extraRaw.replace(/\.json$/i, ''));

  const search = extra.search ? safeKeyword(extra.search) : null;
  const genre  = extra.genre ? String(extra.genre).trim() : null;
  const skip   = extra.skip ? Math.max(0, parseInt(extra.skip, 10) || 0) : 0;
  const page   = Math.floor(skip / 20) + 1;

  console.log(`[Catalog] type=${type} id=${catalogId} search=${search} genre=${genre} page=${page}`);

  // Tiered Cache Key
  const cacheKey = `cat:${catalogId}:${type}:${page}:${search || ''}:${genre || ''}`;
  const cachedMetas = await catalogCache.get(cacheKey);
  if (cachedMetas) {
    return sendJSON(res, { metas: cachedMetas });
  }

  const provKey = getProviderFromCatalogId(catalogId);
  const catType = getCatTypeFromCatalogId(catalogId);
  const provider = ALL_PROVIDERS[provKey] || providerNguonC;

  try {
    const metas = await provider.getCatalog(catType, catalogId, extra, page);
    const finalMetas = Array.isArray(metas) ? metas : [];

    // Cache result
    catalogCache.set(cacheKey, finalMetas, TTL.CATALOG);
    return sendJSON(res, { metas: finalMetas });
  } catch (err) {
    console.error(`[Catalog Error] id=${catalogId}:`, err.message);
    return sendJSON(res, { metas: [] });
  }
}

// ─── Route Registration ───────────────────────────────────────
router.get('/catalog/:type/:id.json', handleCatalog);
router.get('/catalog/:type/:id/:extra.json', handleCatalog);
router.get('/catalog/:type/:id', handleCatalog);
router.get('/catalog/:type/:id/:extra', handleCatalog);

router.get('/:config/catalog/:type/:id.json', handleCatalog);
router.get('/:config/catalog/:type/:id/:extra.json', handleCatalog);
router.get('/:config/catalog/:type/:id', handleCatalog);
router.get('/:config/catalog/:type/:id/:extra', handleCatalog);

module.exports = router;
