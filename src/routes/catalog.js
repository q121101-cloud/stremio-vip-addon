'use strict';

/**
 * ============================================================
 *  VIP Movies Addon — src/routes/catalog.js
 *  Stremio Catalog Router with Multi-Provider Fallback & Live Search
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

function getProviderFromCatalogId(catalogId) {
  if (!catalogId) return 'kkphim';
  const id = String(catalogId).toLowerCase().trim();
  if (id.startsWith('vsmov')) return 'vsmov';
  if (id.startsWith('kkphim')) return 'kkphim';
  if (id.startsWith('nguonc')) return 'nguonc';
  return 'kkphim';
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
  if (cachedMetas && Array.isArray(cachedMetas) && cachedMetas.length > 0) {
    return sendJSON(res, { metas: cachedMetas });
  }

  // Live Multi-Provider Search
  if (search) {
    try {
      const searchTasks = [
        providerKKPhim.search(search, 10),
        providerNguonC.search(search, 10),
        providerVsMov.search(search, 1),
      ];

      const searchResults = await Promise.allSettled(searchTasks);
      let mergedMetas = [];
      const seenSlugs = new Set();

      searchResults.forEach((resItem) => {
        if (resItem.status === 'fulfilled' && Array.isArray(resItem.value)) {
          resItem.value.forEach((item) => {
            if (!item.slug || seenSlugs.has(item.slug)) return;
            seenSlugs.add(item.slug);

            mergedMetas.push({
              id: item.id || `vip_${item.slug}`,
              type: item.type === 'series' || item.type === 'tvshows' ? 'series' : 'movie',
              name: item.name || item.origin_name || 'VIP Movie',
              poster: item.poster_url || item.thumb_url || null,
              posterShape: 'poster',
              background: item.poster_url || item.thumb_url || null,
              description: item.description || null,
              releaseInfo: [item.quality, item.lang || item.language, item.year].filter(Boolean).join(' · '),
            });
          });
        }
      });

      catalogCache.set(cacheKey, mergedMetas, TTL.CATALOG || 300);
      return sendJSON(res, { metas: mergedMetas });
    } catch (err) {
      console.error(`[Catalog Search Error] query=${search}:`, err.message);
      return sendJSON(res, { metas: [] });
    }
  }

  // VIP Aggregated Catalogs (vip_movies / vip_series)
  if (catalogId === 'vip_movies' || catalogId === 'vip_series') {
    try {
      const targetType = catalogId === 'vip_series' ? 'series' : 'movie';
      const [kkRes, nguonRes, vsmovRes] = await Promise.allSettled([
        providerKKPhim.getCatalog(targetType, 'kkphim-latest', extra, page),
        providerNguonC.getCatalog(targetType, 'nguonc-latest', extra, page),
        providerVsMov.getCatalog(targetType, 'vsmov-latest', extra, page),
      ]);

      let mergedMetas = [];
      const seenNames = new Set();

      [kkRes, nguonRes, vsmovRes].forEach((r) => {
        if (r.status === 'fulfilled' && Array.isArray(r.value)) {
          r.value.forEach((meta) => {
            const cleanName = (meta.name || '').toLowerCase().trim();
            if (cleanName && !seenNames.has(cleanName)) {
              seenNames.add(cleanName);
              mergedMetas.push(meta);
            }
          });
        }
      });

      if (mergedMetas.length > 0) {
        catalogCache.set(cacheKey, mergedMetas, TTL.CATALOG || 300);
        return sendJSON(res, { metas: mergedMetas });
      }
    } catch (err) {
      console.warn(`[VIP Catalog Fallback] ${catalogId}:`, err.message);
    }
  }

  // Specific Provider Catalogs
  const provKey = getProviderFromCatalogId(catalogId);
  const catType = getCatTypeFromCatalogId(catalogId);
  const primaryProvider = ALL_PROVIDERS[provKey] || providerKKPhim;

  try {
    let metas = await primaryProvider.getCatalog(catType, catalogId, extra, page);
    
    // Resilient Fallback to other providers if empty
    if (!Array.isArray(metas) || metas.length === 0) {
      const fallbackProviders = [providerKKPhim, providerNguonC, providerVsMov].filter((p) => p !== primaryProvider);
      for (const fallback of fallbackProviders) {
        try {
          const altMetas = await fallback.getCatalog(catType, catalogId, extra, page);
          if (Array.isArray(altMetas) && altMetas.length > 0) {
            metas = altMetas;
            break;
          }
        } catch {}
      }
    }

    const finalMetas = Array.isArray(metas) ? metas : [];
    catalogCache.set(cacheKey, finalMetas, TTL.CATALOG || 300);
    return sendJSON(res, { metas: finalMetas });
  } catch (err) {
    console.error(`[Catalog Error] id=${catalogId}:`, err.message);
    return sendJSON(res, { metas: [] });
  }
}

// ─── Route Registration ───────────────────────────────────────
const CATALOG_ROUTES = [
  '/catalog/:type/:id.json',
  '/catalog/:type/:id/:extra.json',
  '/catalog/:type/:id',
  '/catalog/:type/:id/:extra',
  '/c/:bitmask/catalog/:type/:id.json',
  '/c/:bitmask/catalog/:type/:id/:extra.json',
  '/:config/catalog/:type/:id.json',
  '/:config/catalog/:type/:id/:extra.json',
  '/:config/catalog/:type/:id',
  '/:config/catalog/:type/:id/:extra',
];

router.get(CATALOG_ROUTES, handleCatalog);

module.exports = router;
