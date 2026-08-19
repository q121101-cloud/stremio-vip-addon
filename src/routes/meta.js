'use strict';

/**
 * ============================================================
 *  VIP Movies Addon — src/routes/meta.js
 *  Stremio Metadata Resolver (Cinemeta + DB Mapping + Providers)
 * ============================================================
 */

const express = require('express');
const router  = express.Router();

const providerVsMov  = require('../providers/vsmov');
const providerKKPhim = require('../providers/kkphim');
const providerNguonC = require('../providers/nguonc');
const mapper         = require('../mapper');
const { metaCache, detailCache, cinemetaCache } = require('../db/cache');
const { resolveCinemeta } = require('../lib/cinemeta');
const { TTL } = require('../config/constants');

function sendJSON(res, data) {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', '*');
  res.setHeader('Cache-Control', 'max-age=600, stale-while-revalidate=1200');
  return res.json(data);
}

async function handleMeta(req, res) {
  const rawId   = req.params.id || '';
  const rawType = req.params.type || 'movie';
  const id      = rawId.replace(/\.json$/i, '');
  const type    = rawType.replace(/\.json$/i, '');

  const cacheKey = `meta:${type}:${id}`;
  const cachedMeta = await metaCache.get(cacheKey);
  if (cachedMeta) {
    return sendJSON(res, { meta: cachedMeta });
  }

  try {
    let meta = null;

    // 1. IMDb ID (tt...) -> Resolve canonical metadata from Cinemeta
    if (/^tt\d+/i.test(id)) {
      const cleanImdb = id.split(':')[0].toLowerCase();
      const cineMeta = await resolveCinemeta(type, cleanImdb);
      if (cineMeta) {
        meta = cineMeta;
        meta.id = id;
      }
    }
    // 2. VSMOV ID
    else if (id.startsWith('vsmov:') || id.startsWith('vsmov_')) {
      const slug = id.replace(/^vsmov[_:]/, '');
      const detail = await providerVsMov.getDetail(slug);
      if (detail && detail.movie) {
        meta = {
          id,
          type: type || 'movie',
          name: detail.movie.name || detail.movie.title,
          poster: detail.movie.poster || detail.movie.thumb,
          background: detail.movie.background || detail.movie.poster,
          description: detail.movie.description || detail.movie.content,
          releaseInfo: detail.movie.year ? String(detail.movie.year) : null,
        };
      }
    }
    // 3. KKPhim ID
    else if (id.startsWith('kkphim:') || id.startsWith('kkphim_')) {
      const slug = id.replace(/^kkphim[_:]/, '');
      const detail = await providerKKPhim.getDetail(slug);
      if (detail && detail.movie) {
        meta = providerKKPhim.mapDetailMeta(detail.movie, detail.episodes, type);
      }
    }
    // 4. NguonC ID
    else if (id.startsWith('nguonc:') || id.startsWith('nguonc_')) {
      const slug = id.replace(/^nguonc[_:]/, '');
      const detail = await providerNguonC.getDetail(slug);
      if (detail && detail.movie) {
        meta = mapper.mapDetailMeta(detail.movie, type);
        meta.id = id;
      }
    }
    // 5. Fallback generic slug lookup
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
      metaCache.set(cacheKey, meta, TTL.META);
      return sendJSON(res, { meta });
    }

    return sendJSON(res, { meta: null });
  } catch (err) {
    console.error(`[Meta Error] id=${id}:`, err.message);
    return sendJSON(res, { meta: null });
  }
}

// ─── Route Registration ───────────────────────────────────────
router.get('/meta/:type/:id.json', handleMeta);
router.get('/meta/:type/:id', handleMeta);
router.get('/:config/meta/:type/:id.json', handleMeta);
router.get('/:config/meta/:type/:id', handleMeta);

module.exports = router;
