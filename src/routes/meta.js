'use strict';

const express = require('express');
const router = express.Router();
const axios = require('axios');
const { cache } = require('../db/cache');
const { kkphimProvider } = require('../providers/kkphim');
const { vsmovProvider } = require('../providers/vsmov');
const { nguoncProvider } = require('../providers/nguonc');
const { PROVIDERS } = require('../config');

const CINEMETA_URL = `${PROVIDERS.CINEMETA?.BASE_URL || 'https://v3-cinemeta.strem.io'}/meta`;

/**
 * Core Meta Controller Logic
 */
async function handleMeta(req, res) {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 'public, max-age=600'); // 10 minutes

  try {
    const type = req.params.type; // "movie" | "series"
    const rawId = (req.params.id || '').replace(/\.json$/, '');

    if (!rawId) {
      return res.json({ meta: null });
    }

    // Check L1 Cache
    const cacheKey = `meta:${type}:${rawId}`;
    const cached = cache.get(cacheKey);
    if (cached) {
      return res.json(cached);
    }

    let metaDetail = null;

    // 1. Cinemeta / IMDb ID resolution (tt...)
    if (rawId.startsWith('tt')) {
      metaDetail = await resolveCinemetaMeta(type, rawId);
    }
    // 2. KKPhim slug (kkphim_... or kkphim:...)
    else if (rawId.startsWith('kkphim_') || rawId.startsWith('kkphim:')) {
      const slug = rawId.replace(/^kkphim[_:]/, '');
      const detail = await kkphimProvider.getDetail(type, slug);
      metaDetail = (detail && 'meta' in detail) ? detail.meta : (detail || null);
    }
    // 3. VSMOV slug (vsmov_... or vsmov:...)
    else if (rawId.startsWith('vsmov_') || rawId.startsWith('vsmov:')) {
      const slug = rawId.replace(/^vsmov[_:]/, '');
      const detail = await vsmovProvider.getDetail(type, slug);
      metaDetail = (detail && 'meta' in detail) ? detail.meta : (detail || null);
    }
    // 4. NguonC slug (nguonc_... or nguonc:...)
    else if (rawId.startsWith('nguonc_') || rawId.startsWith('nguonc:')) {
      const slug = rawId.replace(/^nguonc[_:]/, '');
      const detail = await nguoncProvider.getDetail(type, slug);
      metaDetail = (detail && 'meta' in detail) ? detail.meta : (detail || null);
    }
    // 5. Fallback raw slug cascade
    else {
      metaDetail = await resolveRawSlugMeta(type, rawId);
    }

    if (!metaDetail) {
      return res.json({ meta: null });
    }

    const sanitizeUrl = (url) => {
      if (!url || typeof url !== 'string') return '';
      const trimmed = url.trim();
      if (!trimmed) return '';
      if (trimmed.startsWith('//')) return `https:${trimmed}`;
      if (trimmed.startsWith('http://')) return `https://${trimmed.slice(7)}`;
      if (trimmed.startsWith('/')) return `https://phim.nguonc.com${trimmed}`;
      return trimmed;
    };

    const sanitizedMeta = { ...metaDetail };
    if (sanitizedMeta.poster) sanitizedMeta.poster = sanitizeUrl(sanitizedMeta.poster);
    if (sanitizedMeta.background) sanitizedMeta.background = sanitizeUrl(sanitizedMeta.background);
    if (sanitizedMeta.poster_url) sanitizedMeta.poster_url = sanitizeUrl(sanitizedMeta.poster_url);
    if (sanitizedMeta.thumb_url) sanitizedMeta.thumb_url = sanitizeUrl(sanitizedMeta.thumb_url);

    const payload = { meta: sanitizedMeta };
    cache.set(cacheKey, payload, 600); // 10 min TTL
    return res.json(payload);

  } catch (err) {
    console.error(`[Meta Route Error] ${err.message}`);
    return res.json({ meta: null });
  }
}

/**
 * Fetches Cinemeta metadata for IMDb IDs
 * @param {string} type
 * @param {string} imdbId
 * @returns {Promise<Object|null>}
 */
async function resolveCinemetaMeta(type, imdbId) {
  try {
    const resp = await axios.get(`${CINEMETA_URL}/${type}/${imdbId}.json`, { timeout: 4000 });
    if (resp.data && resp.data.meta) {
      return resp.data.meta;
    }
  } catch (err) {
    console.warn(`[Cinemeta Lookup Failed] ${imdbId}: ${err.message}`);
  }
  return null;
}

/**
 * Attempts raw slug lookup across providers in priority order
 * @param {string} type
 * @param {string} slug
 * @returns {Promise<Object|null>}
 */
async function resolveRawSlugMeta(type, slug) {
  // Try VSMOV first
  try {
    const vsmovDetail = await vsmovProvider.getDetail(type, slug);
    const vsmovMeta = (vsmovDetail && 'meta' in vsmovDetail) ? vsmovDetail.meta : vsmovDetail;
    if (vsmovMeta) return vsmovMeta;
  } catch (_) {}

  // Try KKPhim second
  try {
    const kkDetail = await kkphimProvider.getDetail(type, slug);
    const kkMeta = (kkDetail && 'meta' in kkDetail) ? kkDetail.meta : kkDetail;
    if (kkMeta) return kkMeta;
  } catch (_) {}

  // Try NguonC third
  try {
    const nguoncDetail = await nguoncProvider.getDetail(type, slug);
    const nguoncMeta = (nguoncDetail && 'meta' in nguoncDetail) ? nguoncDetail.meta : nguoncDetail;
    if (nguoncMeta) return nguoncMeta;
  } catch (_) {}

  return null;
}

// Route Registrations
router.get('/meta/:type/:id.json', handleMeta);
router.get('/:config/meta/:type/:id.json', handleMeta);
router.get('/c/:config/meta/:type/:id.json', handleMeta);

module.exports = router;
module.exports.handleMeta = handleMeta;
module.exports.resolveCinemetaMeta = resolveCinemetaMeta;
module.exports.resolveRawSlugMeta = resolveRawSlugMeta;
