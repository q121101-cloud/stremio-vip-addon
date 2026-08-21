'use strict';

const express = require('express');
const router = express.Router();

const { parseConfig } = require('../manifest');
const { getProxyBase, TIMEOUTS } = require('../config');
const { cache } = require('../db/cache');
const { getStreamCache, setStreamCache, getImdbMapping, setImdbMapping } = require('../db/supabase');
const { cinemetaService } = require('../services/cinemeta');
const { generateSearchVariants, findBestMatch } = require('../services/matcher');
const { kkphimProvider } = require('../providers/kkphim');
const { vsmovProvider } = require('../providers/vsmov');
const { nguoncProvider } = require('../providers/nguonc');

// Provider Client Registry
const PROVIDER_MAP = {
  vsmov: vsmovProvider,
  kkphim: kkphimProvider,
  nguonc: nguoncProvider
};

/**
 * Wraps a promise with strict timeout protection and safe fail-soft fallback.
 * @template T
 * @param {Promise<T>} promise
 * @param {number} [timeoutMs=2500]
 * @returns {Promise<T|Array>}
 */
async function fetchWithTimeout(promise, timeoutMs = 2500) {
  let timer;
  const timeoutPromise = new Promise((resolve) => {
    timer = setTimeout(() => resolve([]), timeoutMs);
    if (typeof timer?.unref === 'function') timer.unref();
  });

  try {
    const result = await Promise.race([promise, timeoutPromise]);
    return Array.isArray(result) ? result : [];
  } catch (err) {
    console.warn(`[Stream Aggregator] Provider fetch error: ${err.message}`);
    return [];
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/**
 * Computes stream quality and preference score for sorting.
 * @param {Object} stream
 * @param {string} [preferredAudio='vietsub']
 * @returns {number}
 */
function scoreStreamQuality(stream, preferredAudio = 'vietsub') {
  if (!stream) return 0;
  let score = 0;
  const text = `${stream.name || ''} ${stream.title || ''}`.toLowerCase();

  // 1. Quality Tier (4K UHD > 1080p FHD > 720p HD > SD)
  if (text.includes('4k') || text.includes('uhd') || text.includes('2160p') || text.includes('ultra hd')) {
    score += 1000;
  } else if (text.includes('1080p') || text.includes('fhd') || text.includes('full hd')) {
    score += 800;
  } else if (text.includes('720p') || text.includes('hd')) {
    score += 600;
  } else {
    score += 400;
  }

  // 2. Audio Preference Bonus
  const pref = (preferredAudio || 'vietsub').toLowerCase();
  if (pref === 'vietsub' && (text.includes('vietsub') || text.includes('phụ đề') || text.includes('subviet'))) {
    score += 100;
  } else if ((pref === 'thuyetminh' || pref === 'thuyet-minh') && (text.includes('thuyết minh') || text.includes('thuyet minh') || text.includes('thuyetminh'))) {
    score += 100;
  } else if ((pref === 'longtieng' || pref === 'long-tieng') && (text.includes('lồng tiếng') || text.includes('long tieng') || text.includes('longtieng'))) {
    score += 100;
  }

  // 3. Provider priority score
  if (text.includes('vsmov')) score += 30;
  else if (text.includes('kkphim')) score += 20;
  else if (text.includes('nguonc')) score += 10;

  // 4. WebVTT Subtitles Bonus
  if (Array.isArray(stream.subtitles) && stream.subtitles.length > 0) {
    score += 50;
  }

  return score;
}

/**
 * Sorts and ranks streams by score descending
 * @param {Array<Object>} streams
 * @param {string} [preferredAudio='vietsub']
 * @returns {Array<Object>}
 */
function rankStreams(streams, preferredAudio = 'vietsub') {
  if (!Array.isArray(streams) || streams.length === 0) return [];
  return [...streams].sort((a, b) => scoreStreamQuality(b, preferredAudio) - scoreStreamQuality(a, preferredAudio));
}

/**
 * Resolves streams for international IMDb IDs (tt... or tt...:season:episode)
 * @param {string} rawId
 * @param {string} type
 * @param {Object} userConfig
 * @param {string} proxyBase
 * @returns {Promise<Array<Object>>}
 */
async function resolveImdbStreams(rawId, type, userConfig, proxyBase) {
  const parsed = cinemetaService.parseId(rawId, type);
  if (!parsed) return [];

  const { imdbId, type: mediaType, season, episode } = parsed;
  const activeProviders = userConfig.providers || ['vsmov', 'kkphim', 'nguonc'];
  const activeKey = [...activeProviders].sort().join('-');
  const cacheKey = `stream:imdb:${activeKey}:${imdbId}:${mediaType}:${season}:${episode}`;

  // 1. Check L1 / L2 Stream Cache
  const cachedStreams = await getStreamCache(cacheKey);
  if (cachedStreams && Array.isArray(cachedStreams) && cachedStreams.length > 0) {
    return cachedStreams;
  }

  // 2. Check Existing IMDb Mappings
  const mapping = (await getImdbMapping(imdbId)) || {};
  let updatedMapping = false;

  // 3. Resolve Cinemeta Metadata
  const cinemetaMeta = await cinemetaService.getMetadataForMatcher(mediaType, rawId);

  // 4. Query Active Providers in Parallel
  const fetchPromises = activeProviders.map(async (providerName) => {
    const provider = PROVIDER_MAP[providerName];
    if (!provider) return [];

    try {
      const slugKey = `slug_${providerName}`;
      let targetSlug = mapping[slugKey] || mapping[`slug${providerName.charAt(0).toUpperCase() + providerName.slice(1)}`];

      // If no mapped slug, perform title/alias search & fuzzy match
      if (!targetSlug && cinemetaMeta) {
        const searchVariants = generateSearchVariants(cinemetaMeta);
        let bestCandidate = null;

        for (const variant of searchVariants.slice(0, 3)) {
          const searchRes = await provider.search(variant, mediaType);
          const metas = searchRes?.metas || [];
          if (metas.length > 0) {
            const match = findBestMatch(cinemetaMeta, metas, 0.60);
            if (match && (!bestCandidate || match.score > bestCandidate.score)) {
              bestCandidate = match;
              if (match.score >= 0.90) break;
            }
          }
        }

        if (bestCandidate && bestCandidate.meta) {
          targetSlug = provider.cleanSlug(bestCandidate.meta.id);
          mapping[slugKey] = targetSlug;
          updatedMapping = true;
        }
      }

      // Fetch streams from provider
      const streams = await fetchWithTimeout(
        provider.getStreams({
          type: mediaType,
          id: targetSlug,
          slug: targetSlug,
          imdbId,
          title: cinemetaMeta?.title,
          aliases: cinemetaMeta?.aliases,
          season,
          episode,
          proxyBase
        }),
        TIMEOUTS.STREAM || 2500
      );

      return streams || [];
    } catch (err) {
      console.warn(`[Stream Aggregator] Error resolving ${providerName} for ${imdbId}:`, err.message);
      return [];
    }
  });

  const settled = await Promise.allSettled(fetchPromises);
  const allStreams = settled.flatMap((r) => (r.status === 'fulfilled' && Array.isArray(r.value) ? r.value : []));

  // Persist updated mapping asynchronously
  if (updatedMapping) {
    setImdbMapping(imdbId, {
      type: mediaType,
      title: cinemetaMeta?.title || mapping.title || '',
      year: cinemetaMeta?.year || mapping.year,
      slugKkphim: mapping.slug_kkphim || mapping.slugKkphim,
      slugVsmov: mapping.slug_vsmov || mapping.slugVsmov,
      slugNguonc: mapping.slug_nguonc || mapping.slugNguonc,
      aliases: cinemetaMeta?.aliases || []
    }).catch(() => {});
  }

  // Sort streams by quality score and audio preference
  const sortedStreams = rankStreams(allStreams, userConfig.preferredAudio);

  // Populate L1 and L2 cache
  if (sortedStreams.length > 0) {
    await setStreamCache(cacheKey, sortedStreams, { mediaId: rawId, type: mediaType, provider: 'all' });
  }

  return sortedStreams;
}

/**
 * Resolves streams for direct provider IDs (kkphim:*, vsmov:*, nguonc:*)
 * @param {string} rawId
 * @param {string} type
 * @param {Object} userConfig
 * @param {string} proxyBase
 * @returns {Promise<Array<Object>>}
 */
async function resolveDirectStreams(rawId, type, userConfig, proxyBase) {
  let providerName = null;
  if (rawId.startsWith('kkphim:') || rawId.startsWith('kkphim_')) {
    providerName = 'kkphim';
  } else if (rawId.startsWith('vsmov:') || rawId.startsWith('vsmov_')) {
    providerName = 'vsmov';
  } else if (rawId.startsWith('nguonc:') || rawId.startsWith('nguonc_')) {
    providerName = 'nguonc';
  }

  if (!providerName) {
    return resolveRawSlugStreams(rawId, type, userConfig, proxyBase);
  }

  const activeProviders = userConfig.providers || ['vsmov', 'kkphim', 'nguonc'];
  if (!activeProviders.includes(providerName)) {
    return [];
  }

  const provider = PROVIDER_MAP[providerName];
  if (!provider) return [];

  const slug = provider.cleanSlug(rawId);
  const se = provider.extractSeasonEpisode(rawId);
  const season = se.season || 1;
  const episode = se.episode || 1;

  const cacheKey = `stream:direct:${providerName}:${slug}:${type}:${season}:${episode}`;
  const cached = await getStreamCache(cacheKey);
  if (cached && Array.isArray(cached) && cached.length > 0) {
    return rankStreams(cached, userConfig.preferredAudio);
  }

  const streams = await fetchWithTimeout(
    provider.getStreams({
      type,
      id: rawId,
      slug,
      season,
      episode,
      proxyBase
    }),
    TIMEOUTS.STREAM || 2500
  );

  const sortedStreams = rankStreams(streams, userConfig.preferredAudio);

  if (Array.isArray(sortedStreams) && sortedStreams.length > 0) {
    await setStreamCache(cacheKey, sortedStreams, { mediaId: rawId, type, provider: providerName });
  }

  return sortedStreams || [];
}

/**
 * Resolves streams for raw unrecognized slugs across active providers
 * @param {string} rawSlug
 * @param {string} type
 * @param {Object} userConfig
 * @param {string} proxyBase
 * @returns {Promise<Array<Object>>}
 */
async function resolveRawSlugStreams(rawSlug, type, userConfig, proxyBase) {
  const activeProviders = userConfig.providers || ['vsmov', 'kkphim', 'nguonc'];
  const cacheKey = `stream:raw:${activeProviders.sort().join('-')}:${rawSlug}:${type}`;
  const cached = await getStreamCache(cacheKey);
  if (cached && Array.isArray(cached) && cached.length > 0) {
    return rankStreams(cached, userConfig.preferredAudio);
  }

  const tasks = activeProviders.map(async (pName) => {
    const provider = PROVIDER_MAP[pName];
    if (!provider) return [];
    try {
      const streams = await fetchWithTimeout(
        provider.getStreams({
          type,
          id: rawSlug,
          slug: rawSlug,
          season: 1,
          episode: 1,
          proxyBase
        }),
        TIMEOUTS.STREAM || 2500
      );
      return streams || [];
    } catch (_) {
      return [];
    }
  });

  const results = await Promise.allSettled(tasks);
  const allStreams = results.flatMap((r) => (r.status === 'fulfilled' && Array.isArray(r.value) ? r.value : []));
  const sortedStreams = rankStreams(allStreams, userConfig.preferredAudio);

  if (sortedStreams.length > 0) {
    await setStreamCache(cacheKey, sortedStreams, { mediaId: rawSlug, type, provider: 'all' });
  }

  return sortedStreams;
}

/**
 * Main Controller for /stream/:type/:id.json
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 */
async function handleStream(req, res) {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, Range, X-Requested-With');
  res.setHeader('Cache-Control', 'public, max-age=300, stale-while-revalidate=600');

  try {
    const configParam = req.params.config || req.query.config || null;
    const type = req.params.type || 'movie';
    const rawId = (req.params.id || '').replace(/\.json$/, '');

    if (!rawId) {
      return res.json({ streams: [] });
    }

    const userConfig = parseConfig(configParam);
    const proxyBase = getProxyBase(req);
    const cacheKey = `stream:${encodeURIComponent(configParam || 'default')}:${type}:${rawId}`;

    // 1. Check L1 Cache
    const l1Cached = cache.get(cacheKey);
    if (l1Cached && Array.isArray(l1Cached.streams)) {
      return res.json(l1Cached);
    }

    // 2. Check L2 Database Cache
    const dbCached = await getStreamCache(cacheKey);
    if (dbCached && Array.isArray(dbCached) && dbCached.length > 0) {
      const ranked = rankStreams(dbCached, userConfig.preferredAudio);
      cache.set(cacheKey, { streams: ranked }, 300);
      return res.json({ streams: ranked });
    }

    let streams = [];

    if (rawId.startsWith('tt')) {
      streams = await resolveImdbStreams(rawId, type, userConfig, proxyBase);
    } else {
      streams = await resolveDirectStreams(rawId, type, userConfig, proxyBase);
    }

    const sortedStreams = rankStreams(streams, userConfig.preferredAudio);
    const payload = { streams: sortedStreams || [] };

    // Save to L1 cache
    cache.set(cacheKey, payload, 300);

    return res.json(payload);
  } catch (err) {
    console.error(`[Stream Route Error] ${err.message}`);
    return res.json({ streams: [] });
  }
}

// Route Registrations (Supports standard, config-prefixed, short aliases)
router.get('/stream/:type/:id.json', handleStream);
router.get('/stream/:type/:id', handleStream);
router.get('/:config/stream/:type/:id.json', handleStream);
router.get('/:config/stream/:type/:id', handleStream);
router.get('/c/:config/stream/:type/:id.json', handleStream);
router.get('/c/:config/stream/:type/:id', handleStream);

module.exports = router;
module.exports.router = router;
module.exports.default = router;

// Export controller & helpers for testing
module.exports.handleStream = handleStream;
module.exports.resolveImdbStreams = resolveImdbStreams;
module.exports.resolveDirectStreams = resolveDirectStreams;
module.exports.resolveRawSlugStreams = resolveRawSlugStreams;
module.exports.scoreStreamQuality = scoreStreamQuality;
module.exports.rankStreams = rankStreams;
module.exports.sortStreams = rankStreams;
module.exports.fetchWithTimeout = fetchWithTimeout;
