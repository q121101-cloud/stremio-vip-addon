'use strict';

const express = require('express');
const router = express.Router();
const { parseConfig } = require('../manifest');
const { cache } = require('../db/cache');
const { kkphimProvider } = require('../providers/kkphim');
const { vsmovProvider } = require('../providers/vsmov');
const { nguoncProvider } = require('../providers/nguonc');

/**
 * Converts Vietnamese text to URL-safe ASCII slug
 * e.g. "Hành Động" -> "hanh-dong"
 * @param {string} text
 * @returns {string}
 */
function slugify(text) {
  if (!text) return '';
  return text
    .toString()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/đ/g, 'd')
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-');
}

/**
 * Strips HTML tags and unescapes entities
 * @param {string} html
 * @returns {string}
 */
function cleanDescription(html) {
  if (!html) return '';
  return html
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .trim();
}

/**
 * Normalizes poster/backdrop image URLs:
 * - http:// → https://
 * - relative paths → prefixed with providerBaseUrl
 * @param {string} url
 * @param {string} [providerBaseUrl='']
 * @returns {string}
 */
function sanitizePosterUrl(url, providerBaseUrl = '') {
  if (!url || typeof url !== 'string') return '';
  const trimmed = url.trim();
  if (!trimmed) return '';
  // Relative path: prefix with provider base domain
  if (trimmed.startsWith('/')) {
    try {
      const base = providerBaseUrl ? new URL(providerBaseUrl).origin : 'https://phim.nguonc.com';
      return `${base}${trimmed}`;
    } catch (_) {
      return trimmed;
    }
  }
  // Protocol-relative
  if (trimmed.startsWith('//')) return `https:${trimmed}`;
  // http → https
  if (trimmed.startsWith('http://')) return `https://${trimmed.slice(7)}`;
  return trimmed;
}

/**
 * Parses Stremio extra parameters (e.g. genre=Hành Động&skip=20)
 * @param {string} extraStr
 * @returns {Object}
 */
function parseExtra(extraStr) {
  if (!extraStr) return {};
  const cleanStr = extraStr.replace(/\.json$/, '');
  const params = {};
  const searchParams = new URLSearchParams(cleanStr);
  
  for (const [key, value] of searchParams.entries()) {
    params[key] = decodeURIComponent(value);
  }
  return params;
}

/**
 * Core Catalog Controller Logic
 */
async function handleCatalog(req, res) {
  // Set Stremio standard headers
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 'public, max-age=300'); // 5 minutes

  try {
    const configParam = req.params.config || req.query.config || null;
    const type = req.params.type; // "movie" | "series"
    const id = (req.params.id || '').replace(/\.json$/, '');
    const extraStr = req.params.extra || '';
    const extra = parseExtra(extraStr);

    const userConfig = parseConfig(configParam);
    const search = extra.search ? extra.search.trim() : null;
    const genre = extra.genre ? extra.genre.trim() : null;
    const skip = parseInt(extra.skip, 10) || 0;
    const page = Math.max(1, Math.floor(skip / 20) + 1);

    // Cache key construction
    const cacheKey = `catalog:${encodeURIComponent(configParam || 'default')}:${type}:${id}:${genre || ''}:${search || ''}:${page}`;
    const cached = cache.get(cacheKey);
    if (cached) {
      return res.json(cached);
    }

    let metas = [];

    // Dispatch based on Catalog ID prefix
    if (id.startsWith('kkphim')) {
      if (!userConfig.providers.includes('kkphim')) {
        return res.json({ metas: [] });
      }
      metas = await resolveKkphimCatalog(id, type, genre, search, page);
    } else if (id.startsWith('vsmov')) {
      if (!userConfig.providers.includes('vsmov')) {
        return res.json({ metas: [] });
      }
      metas = await resolveVsmovCatalog(id, type, genre, search, page);
    } else if (id.startsWith('nguonc')) {
      if (!userConfig.providers.includes('nguonc')) {
        return res.json({ metas: [] });
      }
      metas = await resolveNguoncCatalog(id, type, genre, search, page);
    }

    const sanitizedMetas = (metas || []).map((m) => {
      const item = { ...m };
      if (item.poster) item.poster = sanitizePosterUrl(item.poster);
      if (item.background) item.background = sanitizePosterUrl(item.background);
      if (item.description) item.description = cleanDescription(item.description);
      return item;
    });

    const payload = { metas: sanitizedMetas };
    cache.set(cacheKey, payload, 300); // 5 min TTL
    return res.json(payload);

  } catch (err) {
    console.error(`[Catalog Route Error] ${err.message}`);
    // Always return HTTP 200 with empty metas on error to prevent Stremio UI crashing
    return res.json({ metas: [] });
  }
}

/**
 * KKPhim Catalog Resolver
 */
async function resolveKkphimCatalog(id, type, genre, search, page) {
  if (search) {
    const res = await kkphimProvider.search(search, { page, limit: 20 });
    return res.metas || [];
  }

  if (genre) {
    const res = await kkphimProvider.getByGenre(genre, { page, limit: 20 });
    return res.metas || [];
  }

  const res = await kkphimProvider.getCatalog(id, { page, limit: 20 });
  return res.metas || [];
}

/**
 * VSMOV Catalog Resolver
 */
async function resolveVsmovCatalog(id, type, genre, search, page) {
  if (search) {
    const res = await vsmovProvider.search(search, { page });
    return res.metas || [];
  }

  const res = await vsmovProvider.getCatalog(id, { page });
  return res.metas || [];
}

/**
 * NguonC Catalog Resolver
 */
async function resolveNguoncCatalog(id, type, genre, search, page) {
  if (search) {
    const res = await nguoncProvider.search(search, { page });
    return res.metas || [];
  }

  if (genre) {
    const res = await nguoncProvider.getByGenre(genre, { page });
    return res.metas || [];
  }

  const res = await nguoncProvider.getCatalog(id, { page });
  return res.metas || [];
}

// Route Registrations (Standard, Config-prefixed & Short aliases)
router.get('/catalog/:type/:id.json', handleCatalog);
router.get('/catalog/:type/:id/:extra.json', handleCatalog);
router.get('/:config/catalog/:type/:id.json', handleCatalog);
router.get('/:config/catalog/:type/:id/:extra.json', handleCatalog);
router.get('/c/:config/catalog/:type/:id.json', handleCatalog);
router.get('/c/:config/catalog/:type/:id/:extra.json', handleCatalog);

module.exports = router;
module.exports.handleCatalog = handleCatalog;
module.exports.parseExtra = parseExtra;
module.exports.slugify = slugify;
module.exports.cleanDescription = cleanDescription;
