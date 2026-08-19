'use strict';

/**
 * ============================================================
 *  VIP Movies Addon — src/routes/stream.js
 *  Parallel Stream Aggregator (< 50ms on Cache, Promise.allSettled)
 * ============================================================
 */

const express = require('express');
const router  = express.Router();

const providerVsMov  = require('../providers/vsmov');
const providerKKPhim = require('../providers/kkphim');
const providerNguonC = require('../providers/nguonc');
const { streamCache } = require('../db/cache');
const { decodeConfig } = require('../config/compressor');
const { resolveCinemeta } = require('../lib/cinemeta');
const { TIMEOUT, TTL } = require('../config/constants');

const ALL_PROVIDERS = {
  vsmov:  providerVsMov,
  kkphim: providerKKPhim,
  nguonc: providerNguonC,
};

const PROVIDER_ORDER = ['vsmov', 'kkphim', 'nguonc'];

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

function withTimeout(promise, ms, label = 'Provider') {
  let timer;
  const timeoutPromise = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(`[${label}] Timeout after ${ms}ms`)), ms);
  });
  return Promise.race([promise, timeoutPromise]).finally(() => clearTimeout(timer));
}

function getStreamPriority(stream) {
  if (!stream) return 999;
  const title = (stream.title || '').toLowerCase();
  const name  = (stream.name || '').toLowerCase();
  const text  = `${name} ${title}`;

  // Provider rank (VIP 1 VSMOV -> VIP 2 KKPhim -> VIP 3 NguonC)
  let providerRank = 4;
  if (text.includes('vsmov') || text.includes('vip 1')) providerRank = 1;
  else if (text.includes('kkphim') || text.includes('vip 2')) providerRank = 2;
  else if (text.includes('nguonc') || text.includes('vip 3')) providerRank = 3;

  // Global priority strictly follows: 4K/UHD -> Vietsub -> Thuyết Minh -> Lồng Tiếng
  const is4K         = text.includes('4k') || text.includes('ultra hd') || text.includes('3840x2160') || text.includes('uhd');
  const isVietsub    = text.includes('vietsub') || text.includes('phụ đề') || text.includes('phu de');
  const isThuyetMinh = text.includes('thuyết minh') || text.includes('thuyet minh') || /\btm\b/.test(text) || text.includes('voiceover');
  const isLongTieng  = text.includes('lồng tiếng') || text.includes('long tieng') || /\blt\b/.test(text) || text.includes('dub');

  let bucket = 400; // default / other
  if (is4K) {
    bucket = 0;
  } else if (isVietsub) {
    bucket = 100;
  } else if (isThuyetMinh) {
    bucket = 200;
  } else if (isLongTieng) {
    bucket = 300;
  }

  // Within 4K bucket, sub-sort: 4K Vietsub -> 4K TM -> 4K LT -> 4K Other
  if (is4K) {
    let subAudioOffset = 0;
    if (isVietsub) subAudioOffset = 0;
    else if (isThuyetMinh) subAudioOffset = 1;
    else if (isLongTieng) subAudioOffset = 2;
    else subAudioOffset = 3;
    return bucket + (providerRank * 10) + subAudioOffset;
  }

  return bucket + providerRank;
}

function normalizeStreamKey(stream) {
  if (!stream || !stream.url || typeof stream.url !== 'string') return null;
  const raw = stream.url.trim();
  try {
    const u = new URL(raw);
    const targetUrl = u.searchParams.get('url');
    if (targetUrl) {
      return `target:${targetUrl}`;
    }
    return `url:${raw}`;
  } catch {
    return `url:${raw}`;
  }
}

async function handleStream(req, res) {
  const startTime = Date.now();
  const rawId   = req.params.id || '';
  const rawType = req.params.type || 'movie';
  const id      = rawId.replace(/\.json$/i, '');
  const type    = rawType.replace(/\.json$/i, '');
  const config  = getConfig(req);
  const proxyBase = `${req.headers['x-forwarded-proto'] || req.protocol}://${req.headers['x-forwarded-host'] || req.get('host')}`.replace(/\/$/, '');

  const provMaskKey = (config.providers || []).sort().join(',');
  const cacheKey = `stream:${type}:${id}:${provMaskKey}`;

  // 1. Instant Tiered Cache Hit (<50ms on cache)
  const cachedStreams = await streamCache.get(cacheKey);
  if (cachedStreams && Array.isArray(cachedStreams) && cachedStreams.length > 0) {
    const elapsed = Date.now() - startTime;
    console.log(`[Stream Aggregator] CACHE HIT (${elapsed}ms) id=${id} streams=${cachedStreams.length}`);
    return sendJSON(res, { streams: cachedStreams });
  }

  console.log(`[Stream Aggregator] type=${type} id=${id} activeProviders=${provMaskKey}`);

  try {
    let imdbId = null;
    let slug = null;
    let season = null;
    let episode = null;
    let title = null;
    let year = null;
    let genres = [];
    let aliases = [];

    // Parse ID
    if (/^tt\d+/i.test(id)) {
      const parts = id.split(':');
      imdbId  = parts[0].toLowerCase();
      season  = parts[1] ? parseInt(parts[1], 10) : null;
      episode = parts[2] ? parseInt(parts[2], 10) : null;

      try {
        const cineMeta = await resolveCinemeta(type, imdbId);
        if (cineMeta) {
          title = cineMeta.name || null;
          year = cineMeta.year || null;
          genres = cineMeta.genres || [];
          aliases = cineMeta.aliases || [];
        }
      } catch (e) {
        console.warn(`[Stream Aggregator] Cinemeta resolve warning for ${imdbId}:`, e.message);
      }
    } else {
      const colonParts = id.split(':');
      if (colonParts.length >= 3 && !isNaN(parseInt(colonParts[colonParts.length - 1], 10)) && !isNaN(parseInt(colonParts[colonParts.length - 2], 10))) {
        episode = parseInt(colonParts[colonParts.length - 1], 10);
        season = parseInt(colonParts[colonParts.length - 2], 10);
        slug = colonParts.slice(0, colonParts.length - 2).join(':').replace(/^(?:kkphim|nguonc|vsmov|koreandrama|series|movie|custom|phim)[_:]/i, '');
      } else if (id.startsWith('kkphim:') || id.startsWith('kkphim_')) {
        slug = id.replace(/^kkphim[_:]/, '');
      } else if (id.startsWith('nguonc:') || id.startsWith('nguonc_')) {
        slug = id.replace(/^nguonc[_:]/, '');
      } else if (id.startsWith('vsmov:') || id.startsWith('vsmov_')) {
        slug = id.replace(/^vsmov[_:]/, '');
      } else {
        slug = id;
      }

      if (!title && slug) {
        const cleanSlugTitle = slug
          .replace(/^(?:kkphim|nguonc|vsmov|koreandrama|series|movie|custom|phim)[_:]/i, '')
          .replace(/[-_]/g, ' ')
          .replace(/\s+/g, ' ')
          .trim();
        if (cleanSlugTitle) {
          title = cleanSlugTitle;
          aliases.push(cleanSlugTitle);
        }
      }
    }

    const payload = { imdbId, type, title, year, genres, aliases, season, episode, slug, proxyBase };

    // Active providers
    const activeProviderKeys = (config.providers || []).filter((p) => ALL_PROVIDERS[p]);
    const keysToUse = activeProviderKeys.length > 0 ? activeProviderKeys : PROVIDER_ORDER;
    const providersToRun = keysToUse
      .filter((k) => ALL_PROVIDERS[k])
      .map((k) => ALL_PROVIDERS[k]);

    // PARALLEL EXECUTION with Promise.allSettled & TIMEOUT.PROVIDER
    const results = await Promise.allSettled(
      providersToRun.map((provider) =>
        withTimeout(provider.getStreams(payload), TIMEOUT.PROVIDER, provider.name || provider.id || 'Provider')
      )
    );

    const mergedStreams = [];
    for (const r of results) {
      if (r.status === 'fulfilled' && Array.isArray(r.value)) {
        for (const item of r.value) {
          if (!item || typeof item !== 'object') continue;
          if (!item.url || typeof item.url !== 'string' || !item.url.trim()) continue;

          // Standardize per Stremio Stream Protocol (Strictly url, NO externalUrl)
          const sanitized = {
            name: item.name || 'VIP Movies 🎬',
            title: item.title ? String(item.title).replace(/#/g, '') : 'VIP Server',
            url: String(item.url).trim(),
            behaviorHints: {
              notSupported: false,
              ...(item.behaviorHints || {}),
            },
          };

          if (Array.isArray(item.subtitles) && item.subtitles.length > 0) {
            sanitized.subtitles = item.subtitles;
          }

          mergedStreams.push(sanitized);
        }
      }
    }

    // Deduplication & Priority Sorting
    const seen = new Set();
    const uniqueStreams = [];
    for (const stream of mergedStreams) {
      const key = normalizeStreamKey(stream);
      if (!key || seen.has(key)) continue;
      seen.add(key);
      uniqueStreams.push(stream);
    }

    uniqueStreams.sort((a, b) => getStreamPriority(a) - getStreamPriority(b));

    // Cache streams if non-empty
    if (uniqueStreams.length > 0) {
      streamCache.set(cacheKey, uniqueStreams, TTL.STREAM);
    }

    const elapsed = Date.now() - startTime;
    console.log(`[Stream Aggregator] id=${id} → Total ${uniqueStreams.length} high-speed streams (${elapsed}ms)`);
    return sendJSON(res, { streams: uniqueStreams });
  } catch (err) {
    console.error(`[Stream Error] id=${id}:`, err.message);
    return sendJSON(res, { streams: [] });
  }
}

// ─── Route Registration ───────────────────────────────────────
router.get('/stream/:type/:id.json', handleStream);
router.get('/stream/:type/:id', handleStream);
router.get('/:config/stream/:type/:id.json', handleStream);
router.get('/:config/stream/:type/:id', handleStream);

module.exports = router;
