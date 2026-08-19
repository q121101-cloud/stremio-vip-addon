'use strict';

/**
 * ============================================================
 *  VIP Movies Addon — src/providers/nguonc.js
 *  NguonC Provider Module with Stealth Headers & Render Proxy Fallback
 * ============================================================
 */

const axios = require('axios');
const BaseProvider = require('./base');
const mapper = require('../mapper');
const { imdbCache, catalogCache, detailCache } = require('../lib/cache');
const { resolveCinemeta, getCachedCinemeta } = require('../lib/cinemeta');
const {
  safeExtra,
  safeSlug,
  safeKeyword,
  safePage,
  safeType,
  isSeasonMatch,
  scoreMatch,
  escapeRegExp,
  generateSearchKeywords,
  matchEpisodeItem,
} = require('../lib/utils');

const NGUONC_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  'Accept': 'application/json, text/plain, */*',
  'Accept-Language': 'vi-VN,vi;q=0.9,en-US;q=0.8',
  'Referer': 'https://phim.nguonc.com/',
};

function encodeBase64(str) {
  if (!str) return '';
  return Buffer.from(str, 'utf8').toString('base64url');
}

const RETRYABLE_STATUS_CODES = new Set([429, 500, 502, 503, 504]);
const RETRYABLE_ERROR_CODES = new Set([
  'ECONNRESET',
  'ECONNABORTED',
  'ETIMEDOUT',
  'ENOTFOUND',
  'ECONNREFUSED',
  'EAI_AGAIN',
  'ERR_NETWORK',
]);

function isRetryableError(err) {
  if (!err) return false;
  const status = err.response?.status;
  if (status && RETRYABLE_STATUS_CODES.has(status)) return true;
  if (err.code && RETRYABLE_ERROR_CODES.has(err.code)) return true;
  if (err.message && (
    err.message.includes('timeout') ||
    err.message.includes('Network Error') ||
    err.message.includes('socket hang up') ||
    err.message.includes('ECONNRESET') ||
    err.message.includes('ETIMEDOUT')
  )) {
    return true;
  }
  return false;
}

function getProxyBase() {
  const raw = process.env.PROXY_URL ||
              process.env.RENDER_EXTERNAL_URL ||
              process.env.RENDER_BACKEND_URL ||
              process.env.RENDER_URL ||
              '';
  return raw ? raw.trim().replace(/\/+$/, '') : '';
}

function isVercelEnvironment() {
  return Boolean(
    process.env.VERCEL === '1' ||
    process.env.VERCEL === 'true' ||
    process.env.VERCEL_ENV ||
    process.env.NOW_REGION ||
    process.env.AWS_LAMBDA_FUNCTION_NAME
  );
}

function resolveProxyUrls(proxyBase, targetUrl) {
  if (!proxyBase) return [];
  const cleanProxy = proxyBase.trim().replace(/\/+$/, '');
  const encoded = encodeURIComponent(targetUrl);
  if (
    cleanProxy.endsWith('/proxy/nguonc') ||
    cleanProxy.endsWith('/api/proxy/nguonc') ||
    cleanProxy.endsWith('/api/nguonc-proxy')
  ) {
    return [`${cleanProxy}?url=${encoded}`];
  }
  return [
    `${cleanProxy}/api/proxy/nguonc?url=${encoded}`,
    `${cleanProxy}/proxy/nguonc?url=${encoded}`,
    `${cleanProxy}/api/nguonc-proxy?url=${encoded}`,
  ];
}

async function requestWithRetry(requestFn, {
  retries = 2,
  baseDelay = 200,
  factor = 2,
  maxDelay = 2000,
  shouldRetry = isRetryableError,
  sleepFn = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
} = {}) {
  let attempt = 0;
  while (true) {
    try {
      return await requestFn(attempt);
    } catch (err) {
      if (attempt >= retries || !shouldRetry(err, attempt)) {
        throw err;
      }
      const backoff = Math.min(baseDelay * Math.pow(factor, attempt), maxDelay);
      await sleepFn(backoff);
      attempt++;
    }
  }
}

function mapCatalogMeta(item, forceType = null) {
  const type = forceType || mapper.detectType(item);
  const slug = item.slug || '';
  const badgeParts = [];
  if (item.quality) badgeParts.push(item.quality);
  if (item.language) badgeParts.push(item.language);
  if (item.current_episode && item.current_episode !== 'FULL') {
    badgeParts.push(item.current_episode);
  }

  return {
    id: `nguonc_${slug}`,
    type,
    name: item.name || item.original_name || 'Không rõ tên',
    poster: item.thumb_url || item.poster_url || null,
    posterShape: 'poster',
    background: item.poster_url || item.thumb_url || null,
    description: item.description || null,
    releaseInfo: badgeParts.length > 0 ? badgeParts.join(' · ') : null,
  };
}

class NguonCProvider extends BaseProvider {
  constructor() {
    super('nguonc', 'https://phim.nguonc.com');
    this.apiBase = 'https://phim.nguonc.com/api';
  }

  async fetchViaProxy(targetUrl, proxyBase, options = {}) {
    const proxyUrls = resolveProxyUrls(proxyBase, targetUrl);
    if (proxyUrls.length === 0) {
      throw new Error(`[NguonC] No valid proxy URL resolved for target: ${targetUrl}`);
    }

    const retries = options.retries !== undefined
      ? options.retries
      : (options.maxRetries !== undefined ? options.maxRetries : 2);
    const retryDelay = options.retryDelay || options.baseDelay || 200;
    const factor = options.retryFactor || 2;
    const maxDelay = options.maxRetryDelay || 2000;
    const proxyTimeout = options.proxyTimeout || options.timeout || 5000;
    const sleepFn = options.sleepFn;

    let lastError = null;

    for (const proxyUrl of proxyUrls) {
      try {
        return await requestWithRetry(
          async () => {
            const res = await axios.get(proxyUrl, {
              headers: { ...NGUONC_HEADERS, ...(options.headers || {}) },
              timeout: proxyTimeout,
              params: options.params,
            });
            return res.data;
          },
          {
            retries,
            baseDelay: retryDelay,
            factor,
            maxDelay,
            shouldRetry: isRetryableError,
            sleepFn,
          }
        );
      } catch (err) {
        lastError = err;
        if (err.response?.status === 404) {
          continue;
        }
        continue;
      }
    }

    throw lastError || new Error(`[NguonC] Proxy request failed for: ${targetUrl}`);
  }

  async fetchWithFallback(url, options = {}) {
    const targetUrl = (this.baseUrl && typeof url === 'string' && !url.startsWith('http'))
      ? `${this.apiBase.replace(/\/$/, '')}/${url.replace(/^\/?(api\/)?/, '')}`
      : url;

    const proxyBase = options.proxyBase || getProxyBase();
    const isVercel = options.isVercel !== undefined ? options.isVercel : isVercelEnvironment();
    const forceProxy = options.forceProxy !== undefined ? options.forceProxy : (isVercel && Boolean(proxyBase));

    // 1. Proactive Proxy on Vercel Serverless environment
    if (forceProxy && proxyBase) {
      try {
        return await this.fetchViaProxy(targetUrl, proxyBase, options);
      } catch (proxyErr) {
        if (options.fallbackToDirectOnProxyFailure) {
          try {
            const res = await axios.get(targetUrl, {
              headers: { ...NGUONC_HEADERS, ...(options.headers || {}) },
              timeout: options.timeout || 3500,
              params: options.params,
            });
            return res.data;
          } catch {}
        }
        throw proxyErr;
      }
    }

    // 2. Direct connection with retry and fallback to proxy if blocked/failed
    const retries = options.retries !== undefined
      ? options.retries
      : (options.maxRetries !== undefined ? options.maxRetries : 2);
    const retryDelay = options.retryDelay || options.baseDelay || 200;
    const factor = options.retryFactor || 2;
    const maxDelay = options.maxRetryDelay || 2000;
    const timeout = options.timeout || 3500;
    const sleepFn = options.sleepFn;

    try {
      return await requestWithRetry(
        async () => {
          const res = await axios.get(targetUrl, {
            headers: { ...NGUONC_HEADERS, ...(options.headers || {}) },
            timeout,
            params: options.params,
          });
          return res.data;
        },
        {
          retries,
          baseDelay: retryDelay,
          factor,
          maxDelay,
          shouldRetry: (err) => {
            // Do not retry Cloudflare 403 directly — fast fallback to proxy
            if (err.response?.status === 403) return false;
            return isRetryableError(err);
          },
          sleepFn,
        }
      );
    } catch (err) {
      const isForbiddenOrBlocked =
        err.response?.status === 403 ||
        err.response?.status === 429 ||
        err.code === 'ECONNABORTED' ||
        (!err.response && (err.code === 'ENOTFOUND' || err.code === 'ECONNREFUSED' || err.code === 'ETIMEDOUT'));

      if (isForbiddenOrBlocked && proxyBase) {
        return await this.fetchViaProxy(targetUrl, proxyBase, options);
      }
      throw err;
    }
  }

  async search(keyword, limit = 5) {
    const cleanKeyword = safeKeyword(keyword);
    if (!cleanKeyword) return [];
    try {
      const data = await this.fetchWithFallback(`${this.apiBase}/films/search`, {
        params: { keyword: cleanKeyword },
      });
      const items = data?.items || [];
      return items.slice(0, Math.max(1, limit)).map((item) => ({
        name: item.name,
        original_name: item.original_name,
        slug: item.slug,
        current_episode: item.current_episode,
        quality: item.quality,
        language: item.language,
        year: item.year,
        poster_url: item.poster_url,
        thumb_url: item.thumb_url,
        description: item.description,
      }));
    } catch (err) {
      console.error(`[NguonC/search] keyword="${cleanKeyword}":`, err.message);
      return [];
    }
  }

  async getDetail(slug) {
    const cleanSlug = safeSlug(slug, 'nguonc');
    if (!cleanSlug) return null;
    const cacheKey = `nguonc:detail:${cleanSlug}`;
    const cached = await detailCache.get(cacheKey);
    if (cached) return cached;

    try {
      const data = await this.fetchWithFallback(`${this.apiBase}/film/${cleanSlug}`);
      const movie = data?.movie;
      if (movie) {
        const result = {
          ...movie,
          movie,
          episodes: movie.episodes || [],
        };
        detailCache.set(cacheKey, result, 600);
        return result;
      }
    } catch (err) {
      console.error(`[NguonC/getDetail] slug="${cleanSlug}":`, err.message);
    }
    return null;
  }

  async getCatalog(type, arg2 = 1, arg3 = {}, arg4 = 1) {
    let catalogId = null;
    let page = 1;
    let extra = {};

    if (typeof arg2 === 'string' && isNaN(Number(arg2))) {
      catalogId = arg2;
      extra = typeof arg3 === 'object' ? arg3 : {};
      page = typeof arg4 === 'number' ? arg4 : parseInt(arg4, 10) || 1;
    } else {
      page = typeof arg2 === 'number' ? arg2 : parseInt(arg2, 10) || 1;
      extra = typeof arg3 === 'object' ? arg3 : {};
    }

    const cleanType = safeType(type, 'phim-le');
    const safe = safeExtra(extra);
    const p = safePage(page);
    const searchQuery = safeKeyword(safe.search || safe.searchQuery || safe.query);
    const genreFilter = safeKeyword(safe.genre);
    const countryFilter = safeKeyword(safe.country);
    const cacheKey = `nguonc:cat:${cleanType}:${p}:${searchQuery}:${genreFilter}:${countryFilter}`;
    const cached = await catalogCache.get(cacheKey);
    if (cached) return cached;

    try {
      let items = [];

      if (searchQuery) {
        const searchItems = await this.search(searchQuery, 20);
        items = searchItems.map((i) => mapCatalogMeta(i));
        catalogCache.set(cacheKey, items, 300);
        return items;
      }

      if (genreFilter) {
        const genreSlug = String(genreFilter).toLowerCase().trim();
        const data = await this.fetchWithFallback(`${this.apiBase}/films/the-loai/${genreSlug}`, {
          params: { page: p },
        });
        const raw = data?.items || [];
        items = raw.map((i) => mapCatalogMeta(i));
        catalogCache.set(cacheKey, items, 300);
        return items;
      }

      if (countryFilter) {
        const countrySlug = String(countryFilter).toLowerCase().trim();
        const data = await this.fetchWithFallback(`${this.apiBase}/films/quoc-gia/${countrySlug}`, {
          params: { page: p },
        });
        const raw = data?.items || [];
        items = raw.map((i) => mapCatalogMeta(i));
        catalogCache.set(cacheKey, items, 300);
        return items;
      }

      if (cleanType === 'phim-moi-cap-nhat' || cleanType === 'latest' || cleanType === 'phimmoi' || cleanType === 'nguonc_phimmoi') {
        const data = await this.fetchWithFallback(`${this.apiBase}/films/phim-moi-cap-nhat`, {
          params: { page: p },
        });
        const raw = data?.items || [];
        items = raw.map((i) => mapCatalogMeta(i, 'movie'));
      } else {
        let listType = cleanType;
        if (cleanType === 'movie' || cleanType === 'phim-le' || cleanType === 'phimle') listType = 'phim-le';
        else if (cleanType === 'series' || cleanType === 'phim-bo' || cleanType === 'phimbo' || cleanType === 'nguonc_phimbo') listType = 'phim-bo';
        else if (cleanType === 'anime' || cleanType === 'hoat-hinh') listType = 'hoat-hinh';
        else if (cleanType === 'cinema' || cleanType === 'phim-chieu-rap' || cleanType.includes('cinema') || cleanType.includes('chieu-rap')) listType = 'phim-chieu-rap';
        else if (cleanType === 'tvshows' || cleanType === 'tv-shows') listType = 'tv-shows';

        let raw = [];
        try {
          const data = await this.fetchWithFallback(`${this.apiBase}/films/danh-sach/${listType}`, {
            params: { page: p },
          });
          raw = data?.items || [];
        } catch {
          try {
            const fallbackData = await this.fetchWithFallback(`${this.apiBase}/films/danh-sach/phim-le`, {
              params: { page: p },
            });
            raw = fallbackData?.items || [];
          } catch {
            const fallbackData2 = await this.fetchWithFallback(`${this.apiBase}/films/phim-moi-cap-nhat`, {
              params: { page: p },
            });
            raw = fallbackData2?.items || [];
          }
        }

        const isSeriesCategory = listType === 'phim-bo' || listType === 'hoat-hinh' || listType === 'tv-shows';
        items = raw.map((i) => mapCatalogMeta(i, isSeriesCategory ? 'series' : 'movie'));
      }

      catalogCache.set(cacheKey, items, 300);
      return items;
    } catch (err) {
      console.error(`[NguonC/getCatalog] type=${cleanType} page=${p}:`, err.message);
      return [];
    }
  }

  async getStreams(arg1, arg2 = 1, arg3 = 1, extraArg4, extraArg5, extraArg6) {
    let imdbId = null;
    let type = 'movie';
    let title = null;
    let year = null;
    let season = 1;
    let episode = 1;
    let slug = null;
    let proxyBase = '';
    let aliases = [];

    if (typeof arg1 === 'object' && arg1 !== null) {
      imdbId = arg1.imdbId || arg1.id;
      type = arg1.type || 'movie';
      title = arg1.title;
      year = arg1.year;
      aliases = arg1.aliases || [];
      season = parseInt(arg1.season, 10) || 1;
      episode = parseInt(arg1.episode, 10) || 1;
      slug = arg1.slug;
      proxyBase = arg1.proxyBase || '';
    } else {
      const firstStr = String(arg1 || '');
      if (firstStr.startsWith('tt')) {
        imdbId = firstStr;
        title = typeof arg2 === 'string' ? arg2 : null;
        type = typeof arg3 === 'string' ? arg3 : 'movie';
        season = parseInt(extraArg4, 10) || 1;
        episode = parseInt(extraArg5, 10) || 1;
        proxyBase = extraArg6 || '';
      } else {
        slug = firstStr;
        season = parseInt(arg2, 10) || 1;
        episode = parseInt(arg3, 10) || 1;
        proxyBase = extraArg4 || '';
      }
    }

    try {
      let movieData = null;

      // 1. Direct Slug
      if (slug) {
        movieData = await this.getDetail(slug);
      }

      // 2. IMDb Cache lookup
      if (!movieData && imdbId) {
        const cleanImdb = String(imdbId).toLowerCase().trim();
        const cacheKey = `nguonc:imdb:${cleanImdb}`;
        const cachedSlug = await imdbCache.get(cacheKey);
        if (cachedSlug) {
          movieData = await this.getDetail(cachedSlug);
        }
      }

      // 3. Search Fallback (Cinemeta title resolution)
      if (!movieData && (title || aliases.length > 0)) {
        const cleanTitle = title ? String(title).trim() : '';
        const searchQueries = generateSearchKeywords({
          title: cleanTitle,
          aliases,
          type,
          season,
          year,
        });

        const allTargetTitles = [cleanTitle, ...aliases].filter(Boolean);

        for (const query of searchQueries) {
          const results = await this.search(query, 10);
          if (results && results.length > 0) {
            let bestMatch = null;
            let highestScore = 0;

            for (const item of results) {
              for (const target of allTargetTitles) {
                const score = scoreMatch(target, item.name, year, item.year);
                const origScore = item.original_name ? scoreMatch(target, item.original_name, year, item.year) : 0;
                const queryScore = scoreMatch(query, item.name, year, item.year);
                const finalScore = Math.max(score, origScore, queryScore);

                if (finalScore > highestScore && (finalScore >= 0.35 || finalScore >= 35)) {
                  highestScore = finalScore;
                  bestMatch = item;
                }
              }
            }

            if (!bestMatch && results.length === 1) {
              bestMatch = results[0];
            }

            if (bestMatch && bestMatch.slug) {
              movieData = await this.getDetail(bestMatch.slug);
              if (movieData && imdbId) {
                const cleanImdb = String(imdbId).toLowerCase().trim();
                imdbCache.set(`nguonc:imdb:${cleanImdb}`, bestMatch.slug, 86400 * 7);
              }
              break;
            }
          }
        }
      }

      if (!movieData || !movieData.episodes) return [];

      const streams = [];
      const isSeries = type === 'series' || (movieData.episodes && movieData.episodes.some((e) => (e.items || []).length > 1));
      const targetEpStr = String(episode);

      for (const server of movieData.episodes) {
        const serverName = server.server_name || 'VIP NguonC';
        const items = server.items || [];
        if (items.length === 0) continue;

        let matchedEp = null;
        if (isSeries) {
          matchedEp = matchEpisodeItem(items, targetEpStr);
          if (!matchedEp) {
            matchedEp = items.find((ep) => {
              const epName = String(ep.name || '').trim();
              const epSlug = String(ep.slug || '').trim();
              return (
                epName === targetEpStr ||
                epName === `0${targetEpStr}` ||
                epName === `Tập ${targetEpStr}` ||
                epName === `Tập 0${targetEpStr}` ||
                epSlug === `tap-${targetEpStr}` ||
                epSlug === `tap-0${targetEpStr}` ||
                epName.startsWith(targetEpStr) ||
                epSlug.startsWith(`tap-${targetEpStr}`)
              );
            }) || (episode > 0 && episode <= items.length ? items[episode - 1] : items[0]);
          }
        } else {
          matchedEp = items[0];
        }

        if (!matchedEp) continue;

        const rawM3u8 = matchedEp.m3u8_url || matchedEp.m3u8 || matchedEp.link_m3u8 || '';
        const rawEmbed = matchedEp.embed_url || matchedEp.embed || matchedEp.link_embed || '';
        let videoUrl = rawM3u8 || rawEmbed;
        if (!videoUrl) continue;

        let streamReferer = 'https://embed15.streamc.xyz/';

        // Auto de-embed StreamC embed URLs to direct M3U8 if rawM3u8 is not directly provided
        if (!rawM3u8 && rawEmbed && typeof rawEmbed === 'string' && (rawEmbed.includes('streamc') || rawEmbed.includes('embed.php'))) {
          try {
            const extracted = await mapper.extractM3u8FromEmbed(rawEmbed);
            if (extracted && extracted.m3u8Url) {
              videoUrl = extracted.m3u8Url;
              streamReferer = extracted.embedHost ? `${extracted.embedHost}/` : streamReferer;
            }
          } catch {}
        }

        const epBadge = isSeries ? ` [Tập ${matchedEp.name || episode}]` : '';
        const proxiedUrl = proxyBase
          ? `${proxyBase}/hls/manifest.m3u8?url=${encodeBase64(videoUrl)}&ref=${encodeBase64(streamReferer)}`
          : videoUrl;

        streams.push({
          name: 'VIP Movies 🎬',
          serverName,
          title: `[VIP 3 • NguonC] ${serverName}${epBadge} Full HD (HLS Proxy)\n⚡ Server NguonC • Phát trực tiếp trong App`,
          url: proxiedUrl,
          rawUrl: videoUrl,
          quality: '1080p',
          behaviorHints: {
            notWebReady: false,
            bingeGroup: `nguonc-${serverName.toLowerCase().replace(/[^a-z0-9]/g, '')}`,
          },
        });
      }

      return streams;
    } catch (err) {
      console.error('[NguonC/getStreams] error:', err.message);
      return [];
    }
  }
}

const instance = new NguonCProvider();

module.exports = instance;
module.exports.NguonCProvider = NguonCProvider;
module.exports.getStreams = instance.getStreams.bind(instance);
module.exports.getCatalog = instance.getCatalog.bind(instance);
module.exports.getDetail  = instance.getDetail.bind(instance);
module.exports.search     = instance.search.bind(instance);
module.exports.fetchWithFallback = instance.fetchWithFallback.bind(instance);
module.exports.getProxyBase = getProxyBase;
module.exports.isVercelEnvironment = isVercelEnvironment;
module.exports.resolveProxyUrls = resolveProxyUrls;
module.exports.isRetryableError = isRetryableError;
module.exports.requestWithRetry = requestWithRetry;
module.exports.NGUONC_HEADERS = NGUONC_HEADERS;
