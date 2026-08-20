'use strict';

const express = require('express');
const router = express.Router();

const { decodeConfig, encodeConfig, isConfigToken, DEFAULT_CONFIG } = require('./config');
const { buildManifest } = require('./manifest');
const { renderDashboard } = require('./dashboard');
const { resolveCinemeta } = require('./lib/cinemeta');
const { streamCache } = require('./lib/cache');

const providerVsmov  = require('./providers/vsmov');
const providerKkphim = require('./providers/kkphim');
const providerNguonc = require('./providers/nguonc');

const PROVIDERS = {
  vsmov:  providerVsmov,
  kkphim: providerKkphim,
  nguonc: providerNguonc,
};

function sendJSON(res, data) {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', '*');
  res.setHeader('Cache-Control', 'max-age=1800, public');
  return res.json(data);
}

function parseExtra(extraStr) {
  if (!extraStr) return {};
  const clean = extraStr.replace(/\.json$/i, '');
  const pairs = clean.split('&');
  const result = {};
  for (const pair of pairs) {
    const [k, v] = pair.split('=');
    if (k && v) {
      result[k] = decodeURIComponent(v);
    }
  }
  return result;
}

function getConfig(req) {
  const token = req.params.config;
  if (isConfigToken(token)) {
    return decodeConfig(token);
  }
  return { ...DEFAULT_CONFIG };
}

// ─────────────────────────────────────────────────────────────
// DASHBOARD ROUTE
// ─────────────────────────────────────────────────────────────
router.get(['/', '/configure', '/:config', '/:config/configure'], (req, res, next) => {
  const rawParam = req.params.config;
  if (rawParam && (rawParam.endsWith('.json') || rawParam === 'manifest.json' || rawParam === 'hls')) {
    return next();
  }

  const userConfig = getConfig(req);
  const host     = req.headers['x-forwarded-host'] || req.headers.host || 'localhost:7000';
  const protocol = req.headers['x-forwarded-proto'] || req.protocol || 'http';
  const baseUrl  = `${protocol}://${host}`;
  const currentToken       = encodeConfig(userConfig);
  const currentManifestUrl = `${baseUrl}/${currentToken}/manifest.json`;
  const stremioUrl         = `stremio://${host}/${currentToken}/manifest.json`;
  const webInstallUrl      = `https://web.stremio.com/#/addons?addon=${encodeURIComponent(currentManifestUrl)}`;

  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  return res.send(renderDashboard({
    resolvedConfig: userConfig,
    baseUrl,
    currentToken,
    currentManifestUrl,
    stremioUrl,
    webInstallUrl,
  }));
});

// ─────────────────────────────────────────────────────────────
// MANIFEST ROUTE
// ─────────────────────────────────────────────────────────────
router.get(['/manifest.json', '/:config/manifest.json'], (req, res) => {
  const config = getConfig(req);
  const manifest = buildManifest(config);
  return sendJSON(res, manifest);
});

// ─────────────────────────────────────────────────────────────
// CATALOG ROUTE
// ─────────────────────────────────────────────────────────────
async function handleCatalog(req, res) {
  const rawId = req.params.id || '';
  const rawType = req.params.type || 'movie';
  const id = rawId.replace(/\.json$/i, '');
  const type = rawType.replace(/\.json$/i, '');
  const extraParam = req.params.extra || '';

  const extra = parseExtra(extraParam);
  const skip = extra.skip || req.query.skip || '0';
  const page = Math.floor(parseInt(skip, 10) / 20) + 1;
  const config = getConfig(req);

  const provPrefix = id.split('-')[0]; // 'vsmov', 'kkphim', 'nguonc'
  const provider = PROVIDERS[provPrefix] || PROVIDERS.kkphim;
  const catType = id.split('-')[1] || 'movie';

  try {
    const metas = await provider.getCatalog(catType, page, extra);
    return sendJSON(res, { metas });
  } catch (err) {
    return sendJSON(res, { metas: [] });
  }
}

router.get('/catalog/:type/:id.json', handleCatalog);
router.get('/catalog/:type/:id/:extra.json', handleCatalog);
router.get('/:config/catalog/:type/:id.json', handleCatalog);
router.get('/:config/catalog/:type/:id/:extra.json', handleCatalog);

// ─────────────────────────────────────────────────────────────
// STREAM ROUTE (MULTI-PROVIDER AGGREGATOR)
// ─────────────────────────────────────────────────────────────
async function handleStream(req, res) {
  const rawId = req.params.id || '';
  const rawType = req.params.type || 'movie';
  const id = rawId.replace(/\.json$/i, '');
  const type = rawType.replace(/\.json$/i, '');
  const config = getConfig(req);

  const cacheKey = `stream:${config.providers.join(',')}:${type}:${id}`;
  const cached = streamCache.get(cacheKey);
  if (cached) return sendJSON(res, { streams: cached });

  const host     = req.headers['x-forwarded-host'] || req.headers.host || 'localhost:7000';
  const protocol = req.headers['x-forwarded-proto'] || req.protocol || 'http';
  const proxyBase = `${protocol}://${host}`;

  let parsed = { imdbId: null, type, season: null, episode: null, slug: null, title: null, aliases: [] };

  if (id.startsWith('tt')) {
    const parts = id.split(':');
    parsed.imdbId = parts[0];
    parsed.season = parts[1] ? parseInt(parts[1], 10) : null;
    parsed.episode = parts[2] ? parseInt(parts[2], 10) : null;
    if (parsed.season || parsed.episode) parsed.type = 'series';

    const cinemeta = await resolveCinemeta(parsed.imdbId, parsed.type);
    if (cinemeta) {
      parsed.title = cinemeta.title;
      parsed.aliases = cinemeta.aliases;
    }
  } else {
    parsed.slug = id;
    const cleanSlug = id.replace(/^(vsmov|kkphim|nguonc)[_:]/, '');
    parsed.title = cleanSlug.replace(/-/g, ' ');
  }

  const activeProviders = config.providers || ['vsmov', 'kkphim', 'nguonc'];
  const promises = [];

  for (const provId of activeProviders) {
    const prov = PROVIDERS[provId];
    if (prov && typeof prov.getStreams === 'function') {
      promises.push(
        prov.getStreams({
          imdbId: parsed.imdbId,
          type: parsed.type,
          title: parsed.title,
          aliases: parsed.aliases,
          season: parsed.season,
          episode: parsed.episode,
          slug: parsed.slug,
          proxyBase,
        }).catch(() => [])
      );
    }
  }

  const results = await Promise.all(promises);
  const allStreams = results.flat().filter(Boolean);

  streamCache.set(cacheKey, allStreams);
  return sendJSON(res, { streams: allStreams });
}

router.get('/stream/:type/:id.json', handleStream);
router.get('/:config/stream/:type/:id.json', handleStream);

// ─────────────────────────────────────────────────────────────
// HLS PROXY REDIRECTOR
// ─────────────────────────────────────────────────────────────
router.get('/hls/stream.m3u8', (req, res) => {
  const targetUrl = req.query.url;
  if (!targetUrl) return res.status(400).send('Missing URL');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', '*');
  return res.redirect(302, targetUrl);
});

module.exports = router;
