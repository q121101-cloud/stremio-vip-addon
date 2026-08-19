'use strict';

/**
 * ============================================================
 *  VIP Movies Addon — src/handlers.js  (Engine v1.5.2)
 *  Stremio Addon Express Route Handlers
 *  - Bộ gom luồng tổng hợp (Stream Aggregator: KKPhim + NguonC + VsMov)
 *  - Dynamic Catalog & Meta Router
 *  - Interactive Cyber-Glassmorphism Configurator Dashboard
 * ============================================================
 */

const express = require('express');
const router  = express.Router();

const api     = require('./api');
const mapper  = require('./mapper');
const { MANIFEST, GENRES, COUNTRIES, buildManifest } = require('./manifest');
const { decodeConfig, encodeConfig, isConfigToken, DEFAULT_CONFIG, getDefaultToken, VALID_PROVIDERS, VALID_CATEGORIES } = require('./config');
const { imdbCache, catalogCache, detailCache }  = require('./lib/cache');
const { resolveCinemeta } = require('./lib/cinemeta');
const { renderDashboard } = require('./dashboard');

// ─── Providers ────────────────────────────────────────────────
const providerVsMov  = require('./providers/vsmov');
const providerKKPhim = require('./providers/kkphim');
const providerNguonC = require('./providers/nguonc');
const providerSports = require('./providers/sports');

const ALL_PROVIDERS = {
  vsmov:  providerVsMov,
  kkphim: providerKKPhim,
  nguonc: providerNguonC,
  sports: providerSports,
};

// ─── Helpers ──────────────────────────────────────────────────
function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function sendJSON(res, data) {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', '*');
  res.setHeader('Cache-Control', 'max-age=300, stale-while-revalidate=600');
  return res.json(data);
}

function sendError(res, statusCode, message) {
  console.error(`[Handler Error] ${message}`);
  res.status(statusCode).json({ error: message });
}

function parseExtra(extraParam) {
  if (!extraParam) return {};
  try {
    let decoded = String(extraParam);
    try { decoded = decodeURIComponent(decoded); } catch {}
    if (decoded.includes('%')) {
      try { decoded = decodeURIComponent(decoded); } catch {}
    }
    const cleaned = decoded.replace(/\.json$/i, '');
    const result = {};
    for (const part of cleaned.split('&')) {
      if (!part) continue;
      const eqIdx = part.indexOf('=');
      if (eqIdx !== -1) {
        let rawKey = part.slice(0, eqIdx).trim();
        let rawVal = part.slice(eqIdx + 1).trim();
        try { rawKey = decodeURIComponent(rawKey); } catch {}
        try { rawVal = decodeURIComponent(rawVal); } catch {}
        if (rawKey) result[rawKey] = rawVal;
      }
    }
    return result;
  } catch { return {}; }
}

function skipToPage(skip) {
  const s = parseInt(skip, 10) || 0;
  return Math.max(1, Math.floor(s / 10) + 1);
}

function getConfig(req) {
  if (req.addonConfig) return req.addonConfig;
  if (req.params && req.params.config) {
    try { return decodeConfig(req.params.config); } catch {}
  }
  if (req.query && req.query.config) {
    try { return decodeConfig(req.query.config); } catch {}
  }
  return DEFAULT_CONFIG;
}

function getProviderFromCatalogId(catalogId) {
  if (!catalogId) return 'nguonc';
  const id = String(catalogId).toLowerCase().trim();
  for (const pid of Object.keys(ALL_PROVIDERS)) {
    if (id.startsWith(pid + '-') || id.startsWith(pid + '_') || id === pid) return pid;
  }
  return 'nguonc';
}

function getCatTypeFromCatalogId(catalogId) {
  if (!catalogId) return 'movie';
  const id = String(catalogId).toLowerCase().trim();

  // Specific mappings for all 22 standard catalogs + aliases
  if (id === 'vsmov-4k') return '4k';
  if (id === 'vsmov-thuyet-minh' || id === 'vsmov-tm') return 'thuyet-minh';
  if (id === 'stp-au-my' || id === 'stp-western') return 'au-my';
  if (id === 'stp-han-quoc' || id === 'stp-korean') return 'han-quoc';
  if (id === 'stp-phim-le' || id === 'stp-single') return 'movie';
  if (id === 'stp-phim-bo' || id === 'stp-series') return 'series';
  if (id === 'hh3d-phim-le' || id === 'hh3d-single') return 'movie';
  if (id === 'hh3d-phim-bo' || id === 'hh3d-series') return 'series';
  if (id === 'hh3d-tien-hiep' || id === 'hh3d-donghua') return 'tien-hiep';
  if (id === 'yan-phim-le' || id === 'yan-single') return 'movie';
  if (id === 'yan-phim-bo' || id === 'yan-series') return 'series';
  if (id === 'yan-dang-chieu' || id === 'yan-ongoing') return 'dang-chieu';
  if (id === 'clbpx-kiem-hiep' || id === 'clbpx-wuxia') return 'kiem-hiep';
  if (id === 'clbpx-hong-kong' || id === 'clbpx-tvb') return 'hong-kong';

  if (id.includes('series') || id.includes('phim-bo')) return 'series';
  if (id.includes('single') || id.includes('movie') || id.includes('phim-le')) return 'movie';
  if (id.includes('cinema') || id.includes('chieu-rap')) return 'cinema';
  if (id.includes('anime') || id.includes('hoat-hinh') || id.includes('donghua')) return 'anime';
  if (id.includes('recent') || id.includes('latest')) return 'latest';

  const parts = id.replace(/_/g, '-').split('-');
  if (parts.length >= 2) return parts.slice(1).join('-');
  return 'movie';
}

function withTimeout(promise, ms = 4000, label = 'Provider') {
  let timer;
  if (promise && typeof promise.catch === 'function') {
    promise.catch(() => {});
  }
  const timeoutPromise = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms);
  });
  return Promise.race([promise, timeoutPromise]).finally(() => {
    if (timer) clearTimeout(timer);
  });
}

// ─────────────────────────────────────────────────────────────
//  ROUTE: GET / & GET /configure & GET /:config & GET /:config/configure
//  → Cyber-Glassmorphism Anti-Slop Configurator Dashboard
// ─────────────────────────────────────────────────────────────
router.get(['/', '/configure', '/:config', '/:config/configure'], (req, res, next) => {
  const token = req.params.config;
  if (token && !isConfigToken(token)) return next();

  // Resolve user config from req.addonConfig, path token, or query param
  let userConfig = DEFAULT_CONFIG;
  if (req.addonConfig) {
    userConfig = req.addonConfig;
  } else if (token) {
    userConfig = decodeConfig(token);
  } else if (req.query && req.query.config) {
    userConfig = decodeConfig(req.query.config);
  }

  const safeProviders = Array.isArray(userConfig.providers) && userConfig.providers.length > 0
    ? userConfig.providers.filter((p) => VALID_PROVIDERS.includes(p))
    : DEFAULT_CONFIG.providers;
  const safeCategories = Array.isArray(userConfig.categories) && userConfig.categories.length > 0
    ? userConfig.categories.filter((c) => VALID_CATEGORIES.includes(c))
    : DEFAULT_CONFIG.categories;
  const safeApiKey = typeof userConfig.apiKey === 'string' ? userConfig.apiKey : '';

  const resolvedConfig = {
    providers: safeProviders.length > 0 ? safeProviders : DEFAULT_CONFIG.providers,
    categories: safeCategories.length > 0 ? safeCategories : DEFAULT_CONFIG.categories,
    apiKey: safeApiKey,
  };

  const host     = req.headers['x-forwarded-host'] || req.headers.host || 'localhost:7000';
  const protocol = req.headers['x-forwarded-proto'] || req.protocol || 'http';
  const baseUrl  = `${protocol}://${host}`;
  const currentToken       = encodeConfig(resolvedConfig);
  const currentManifestUrl = `${baseUrl}/${currentToken}/manifest.json`;
  const stremioUrl         = `stremio://${host}/${currentToken}/manifest.json`;
  const webInstallUrl      = `https://web.stremio.com/#/addons?addon=${encodeURIComponent(currentManifestUrl)}`;

  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  return res.send(renderDashboard({
    resolvedConfig,
    baseUrl,
    currentToken,
    currentManifestUrl,
    stremioUrl,
    webInstallUrl,
  }));
});

// ─────────────────────────────────────────────────────────────
//  CATALOG HANDLER & ROUTES
// ─────────────────────────────────────────────────────────────
async function handleCatalog(req, res) {
  const rawId = req.params.id || '';
  const rawType = req.params.type || 'movie';
  const id = rawId.replace(/\.json$/i, '');
  const type = rawType.replace(/\.json$/i, '');
  const extraParam = req.params.extra || '';

  const extra = parseExtra(extraParam);
  const searchQuery = extra.search || req.query.search || null;
  const genreFilter = extra.genre  || req.query.genre  || null;
  const skip        = extra.skip   || req.query.skip   || '0';
  const page        = skipToPage(skip);
  const config      = getConfig(req);

  console.log(`[Catalog] type=${type} id=${id} search=${searchQuery} genre=${genreFilter} page=${page}`);

  try {
    if (type === 'tv' || id === 'sports-live' || id.startsWith('sports')) {
      const metas = await providerSports.getCatalog(type, page, { search: searchQuery, genre: genreFilter, skip });
      return sendJSON(res, { metas });
    }

    const isGenericSearch = !id || id === 'search' || id === 'all' || id === 'global' || id === 'top';
    const providerId = getProviderFromCatalogId(id);
    const catType    = getCatTypeFromCatalogId(id) || type;
    const provider   = ALL_PROVIDERS[providerId];

    // If search query on generic endpoint or unrecognized catalog, fan out across active providers
    if (searchQuery && (isGenericSearch || !provider)) {
      const activeProviderKeys = (config.providers || []).filter((p) => ALL_PROVIDERS[p]);
      const providersToRun = (activeProviderKeys.length > 0 ? activeProviderKeys : Object.keys(ALL_PROVIDERS))
        .map((k) => ALL_PROVIDERS[k]);

      const results = await Promise.allSettled(
        providersToRun.map((p) =>
          withTimeout(p.getCatalog(catType, page, { search: searchQuery, genre: genreFilter, skip }), 4000, p.name || 'CatalogProvider')
        )
      );

      const combinedMetas = [];
      const seenIds = new Set();
      for (const r of results) {
        if (r.status === 'fulfilled' && Array.isArray(r.value)) {
          for (const item of r.value) {
            if (item && item.id && !seenIds.has(item.id)) {
              seenIds.add(item.id);
              combinedMetas.push({
                ...item,
                type: item.type || type || 'movie',
              });
            }
          }
        }
      }
      return sendJSON(res, { metas: combinedMetas });
    }

    if (!provider) {
      return sendJSON(res, { metas: [] });
    }

    const items = await withTimeout(
      provider.getCatalog(catType, page, { search: searchQuery, genre: genreFilter, skip }),
      4000,
      provider.name || providerId
    ).catch((err) => {
      console.warn(`[Catalog Provider Error] ${providerId}:`, err.message);
      return [];
    });

    const metas = (Array.isArray(items) ? items : []).map((item) => {
      if (!item) return item;
      return {
        ...item,
        type: item.type || type || 'movie',
      };
    });

    return sendJSON(res, { metas });
  } catch (err) {
    console.error(`[Catalog Error]`, err.message);
    return sendJSON(res, { metas: [] });
  }
}

router.get('/catalog/:type/:id/:extra.json', handleCatalog);
router.get('/catalog/:type/:id/:extra', handleCatalog);
router.get('/catalog/:type/:id.json', handleCatalog);
router.get('/catalog/:type/:id', handleCatalog);
router.get('/:config/catalog/:type/:id/:extra.json', handleCatalog);
router.get('/:config/catalog/:type/:id/:extra', handleCatalog);
router.get('/:config/catalog/:type/:id.json', handleCatalog);
router.get('/:config/catalog/:type/:id', handleCatalog);

// ─────────────────────────────────────────────────────────────
//  META HANDLER & ROUTES
// ─────────────────────────────────────────────────────────────
async function handleMeta(req, res) {
  const rawId = req.params.id || '';
  const rawType = req.params.type || 'movie';
  const id = rawId.replace(/\.json$/i, '');
  const type = rawType.replace(/\.json$/i, '');

  if (!id) {
    return sendJSON(res, { meta: null });
  }

  // If IMDb ID, let Cinemeta handle it
  if (/^tt\d+/i.test(id)) {
    console.log(`[Meta] IMDb ID → Cinemeta: ${id}`);
    return sendJSON(res, { meta: null });
  }

  const cacheKey = `meta:${id}`;
  const cached = detailCache.get(cacheKey);
  if (cached) return sendJSON(res, { meta: cached });

  try {
    let meta = null;

    // 1. VSMOV ID
    if (id.startsWith('vsmov:') || id.startsWith('vsmov_')) {
      const slug = id.replace(/^vsmov[_:]/, '');
      const detail = await providerVsMov.getDetail(slug);
      if (detail && detail.movie) {
        meta = {
          id: `vsmov_${slug}`,
          type: detail.movie.type === 'series' ? 'series' : 'movie',
          name: detail.movie.name || detail.movie.origin_name || 'Không rõ tên',
          poster: detail.movie.poster_url || detail.movie.thumb_url,
          background: detail.movie.thumb_url || detail.movie.poster_url,
          description: detail.movie.content ? String(detail.movie.content).replace(/<[^>]+>/g, '') : null,
          year: detail.movie.year || null,
          releaseInfo: detail.movie.year ? String(detail.movie.year) : null,
        };
      }
    }
    // 2. KKPhim ID
    else if (id.startsWith('kkphim:') || id.startsWith('kkphim_')) {
      const slug = id.replace(/^kkphim[_:]/, '');
      const detail = await providerKKPhim.getDetail(slug);
      if (detail && detail.movie) {
        meta = providerKKPhim.mapDetailMeta(detail.movie, detail.episodes, type);
      }
    }
    // 3. NguonC ID
    else if (id.startsWith('nguonc:') || id.startsWith('nguonc_')) {
      const slug = id.replace(/^nguonc[_:]/, '');
      const detail = await providerNguonC.getDetail(slug);
      if (detail && detail.movie) {
        meta = mapper.mapDetailMeta(detail.movie, type);
        meta.id = id;
      }
    }
    // 4. Sports ID
    else if (id.startsWith('sports:') || id.startsWith('sports_') || type === 'tv') {
      const detail = await providerSports.getDetail(id);
      if (detail && detail.movie) {
        meta = detail.movie;
      }
    }
    // 5. Fallback generic slug
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
      detailCache.set(cacheKey, meta, 600);
      return sendJSON(res, { meta });
    }

    return sendJSON(res, { meta: null });
  } catch (err) {
    console.error(`[Meta Error] id=${id}`, err.message);
    return sendJSON(res, { meta: null });
  }
}

router.get('/meta/:type/:id.json', handleMeta);
router.get('/meta/:type/:id', handleMeta);
router.get('/:config/meta/:type/:id.json', handleMeta);
router.get('/:config/meta/:type/:id', handleMeta);

const PROVIDER_ORDER = ['vsmov', 'kkphim', 'nguonc', 'sports'];

function getStreamPriority(stream) {
  if (!stream) return 200;
  const title = (stream.title || '').toLowerCase();
  const name = (stream.name || '').toLowerCase();
  const combined = `${name} ${title}`;

  // 1. VSMOV 4K Ultra HD (VIP 1)
  if (combined.includes('vsmov') && (combined.includes('4k') || combined.includes('ultra hd') || combined.includes('3840x2160'))) return 10;
  // 2. VSMOV Thuyết Minh / Other (VIP 1)
  if (combined.includes('vsmov') || combined.includes('vip 1')) return 20;
  // 3. KKPhim Vietsub (VIP 2)
  if ((combined.includes('kkphim') || combined.includes('vip 2')) && combined.includes('vietsub')) return 30;
  // 4. KKPhim Thuyết Minh / Lồng Tiếng / Other (VIP 2)
  if (combined.includes('kkphim') || combined.includes('vip 2')) return 40;
  // 5. NguonC Vietsub (VIP 3)
  if ((combined.includes('nguonc') || combined.includes('vip 3')) && combined.includes('vietsub')) return 50;
  // 6. NguonC Thuyết Minh / Other (VIP 3)
  if (combined.includes('nguonc') || combined.includes('vip 3')) return 60;
  // 7. Sports Live
  if (combined.includes('sports') || combined.includes('thể thao') || combined.includes('xôi lạc') || combined.includes('soco')) return 70;
  return 200;
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
  const rawId = req.params.id || '';
  const rawType = req.params.type || 'movie';
  const id = rawId.replace(/\.json$/i, '');
  const type = rawType.replace(/\.json$/i, '');
  const config = getConfig(req);
  const proxyBase = `${req.headers['x-forwarded-proto'] || req.protocol}://${req.headers['x-forwarded-host'] || req.get('host')}`.replace(/\/$/, '');

  console.log(`[Stream Aggregator] type=${type} id=${id} activeProviders=${(config.providers || []).join(',')}`);

  try {
    if (id.startsWith('sports:') || id.startsWith('sports_') || type === 'tv') {
      const streams = await providerSports.getStreams(id);
      return sendJSON(res, { streams });
    }

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

      // Lấy canonical metadata qua Cinemeta (24h LRU cache)
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
    } else if (id.startsWith('kkphim:') || id.startsWith('kkphim_')) {
      const withoutPrefix = id.replace(/^kkphim[_:]/, '');
      const parts = withoutPrefix.split(':');
      slug = parts[0];
      if (parts.length >= 3) {
        season = parseInt(parts[1], 10);
        episode = parseInt(parts[2], 10);
      }
    } else if (id.startsWith('nguonc:') || id.startsWith('nguonc_')) {
      const withoutPrefix = id.replace(/^nguonc[_:]/, '');
      const parts = withoutPrefix.split(':');
      slug = parts[0];
      if (parts.length >= 3) {
        episode = parts.slice(2).join(':');
      }
    } else if (id.startsWith('vsmov:') || id.startsWith('vsmov_')) {
      const withoutPrefix = id.replace(/^vsmov[_:]/, '');
      const parts = withoutPrefix.split(':');
      slug = parts[0];
      if (parts.length >= 3) {
        season = parseInt(parts[1], 10);
        episode = parseInt(parts[2], 10);
      }
    } else {
      slug = id;
    }

    const payload = { imdbId, type, title, year, genres, aliases, season, episode, slug, proxyBase };

    // Lọc danh sách provider theo config người dùng theo thứ tự ưu tiên
    const activeProviderKeys = (config.providers || []).filter((p) => ALL_PROVIDERS[p]);
    const keysToUse = activeProviderKeys.length > 0 ? activeProviderKeys : PROVIDER_ORDER;
    const providersToRun = keysToUse
      .filter((k) => ALL_PROVIDERS[k])
      .map((k) => ALL_PROVIDERS[k]);

    // CHẠY SONG SONG BẤT ĐỒNG BỘ với Promise.allSettled & strict 4000ms timeout per provider
    const results = await Promise.allSettled(
      providersToRun.map((provider) =>
        withTimeout(provider.getStreams(payload), 4000, provider.name || provider.id || 'Provider')
      )
    );

    const mergedStreams = [];
    for (const r of results) {
      if (r.status === 'fulfilled' && Array.isArray(r.value)) {
        for (const item of r.value) {
          if (!item || typeof item !== 'object') continue;
          if (!item.url || typeof item.url !== 'string' || !item.url.trim()) continue;

          // Standardize and sanitize per Stremio Stream Protocol
          const sanitized = {
            name: item.name || 'VIP Movies 🎬',
            title: item.title ? String(item.title).replace(/#/g, '') : 'VIP Server',
            url: String(item.url).trim(),
            behaviorHints: {
              notSupported: false,
              bingeGroup: item.behaviorHints?.bingeGroup || `stream-${slug || imdbId || 'main'}`,
              ...(item.behaviorHints || {}),
            },
          };
          if (Array.isArray(item.subtitles)) {
            sanitized.subtitles = item.subtitles;
          }
          delete sanitized.externalUrl;
          mergedStreams.push(sanitized);
        }
      }
    }

    // Sort streams: VSMOV 4K -> KKPhim -> NguonC -> Specialized
    mergedStreams.sort((a, b) => getStreamPriority(a) - getStreamPriority(b));

    // Deduplicate streams by normalized stream key
    const seenKeys = new Set();
    const uniqueStreams = [];
    for (const stream of mergedStreams) {
      const key = normalizeStreamKey(stream);
      if (key && !seenKeys.has(key)) {
        seenKeys.add(key);
        uniqueStreams.push(stream);
      }
    }

    console.log(`[Stream Aggregator] id=${id} → Total ${uniqueStreams.length} high-speed streams`);

    return sendJSON(res, { streams: uniqueStreams });
  } catch (err) {
    console.error(`[Stream Error] id=${id}`, err.message);
    return sendJSON(res, { streams: [] });
  }
}

router.get('/stream/:type/:id.json', handleStream);
router.get('/stream/:type/:id', handleStream);
router.get('/:config/stream/:type/:id.json', handleStream);
router.get('/:config/stream/:type/:id', handleStream);

// ─── Health check ─────────────────────────────────────────────
router.get('/health', (req, res) => {
  const stats = api.getCacheStats();
  const { imdbCache: ic, m3u8Cache: mc, catalogCache: cc, detailCache: dc } = require('./lib/cache');
  sendJSON(res, {
    status: 'ok',
    version: MANIFEST.version,
    providers: Object.keys(ALL_PROVIDERS),
    cache: {
      nodeCache: stats,
      imdb:    ic.stats(),
      m3u8:    mc.stats(),
      catalog: cc.stats(),
      detail:  dc.stats(),
    },
    timestamp: new Date().toISOString(),
  });
});

// ─── Cache clear ──────────────────────────────────────────────
router.post('/admin/cache/clear', (req, res) => {
  api.clearCache();
  const { imdbCache: ic, m3u8Cache: mc, catalogCache: cc, detailCache: dc } = require('./lib/cache');
  ic.clear(); mc.clear(); cc.clear(); dc.clear();
  sendJSON(res, { message: 'Tất cả cache đã được xóa (NodeCache + LRU)' });
});

module.exports = router;
