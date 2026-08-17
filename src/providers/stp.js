'use strict';

/**
 * ============================================================
 *  VIP Movies Addon — src/providers/stp.js (Engine v1.5.0)
 *  STP Specialized Provider: Western Cinema & K-Drama
 *  Domain Sources: suutamphim.org / tvhay
 *
 *  Features:
 *  - Standard interface: { id, label, getCatalog, getStreams, search, getDetail }
 *  - Specializes in Hollywood/Western cinema & Korean Drama (K-Drama)
 *  - 5-second axios timeout for high resilience & zero blocking
 *  - Strict zero externalUrl invariant (url only, HLS proxy)
 *  - Graceful degradation: all errors return [] safely
 * ============================================================
 */

const axios = require('axios');
const { imdbCache, catalogCache, detailCache } = require('../lib/cache');
const { getCachedCinemeta } = require('../lib/cinemeta');
const { safeExtra, safeSlug, safeKeyword, safePage, safeType, isSeasonMatch } = require('../lib/utils');

const PROVIDER_ID    = 'stp';
const PROVIDER_LABEL = 'STP • Âu Mỹ & K-Drama';
const REFERER_HEADER = 'https://suutamphim.org/';
const STP_UA         = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';

const http = axios.create({
  timeout: 5000,
  headers: {
    'User-Agent': STP_UA,
    Accept: 'application/json, text/html, */*',
    Referer: REFERER_HEADER,
    Origin: 'https://suutamphim.org',
  },
});

function encodeBase64(str) {
  if (!str) return '';
  return Buffer.from(str, 'utf8').toString('base64url');
}

function escapeRegExp(str) {
  if (!str) return '';
  return String(str).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function formatEpisodeLabel(epName) {
  if (!epName) return '';
  const trimmed = String(epName).trim();
  if (!trimmed || trimmed.toUpperCase() === 'FULL') return '';
  if (/^tập\b/i.test(trimmed)) {
    return ` [${trimmed}]`;
  }
  return ` [Tập ${trimmed}]`;
}

/**
 * Similarity and year score matching
 */
function scoreMatch(item, title, year = null, season = null) {
  if (!item || !title) return 0;
  const normalize = (s) =>
    String(s || '')
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[đĐ]/g, 'd')
      .replace(/[^\w\s]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();

  const target = normalize(title);
  if (!target || target.length < 2) return 0;

  const nameNorm = normalize(item.name || item.title);
  const originNorm = normalize(item.origin_name || item.original_name);
  const slugNorm = normalize(String(item.slug || '').replace(/[-_]/g, ' '));

  let score = 0;
  if (nameNorm === target || originNorm === target || slugNorm === target) {
    score = 1.0;
  } else if (
    (target.length >= 4 && (` ${nameNorm} `.includes(` ${target} `) || ` ${originNorm} `.includes(` ${target} `) || ` ${slugNorm} `.includes(` ${target} `))) ||
    (nameNorm.length >= 4 && ` ${target} `.includes(` ${nameNorm} `)) ||
    (originNorm.length >= 4 && ` ${target} `.includes(` ${originNorm} `))
  ) {
    score = 0.8;
  } else {
    const targetWords = new Set(target.split(' ').filter((w) => w.length > 1));
    const candidateWords = new Set([...nameNorm.split(' '), ...originNorm.split(' '), ...slugNorm.split(' ')].filter((w) => w.length > 1));
    if (targetWords.size > 0 && candidateWords.size > 0) {
      const common = [...targetWords].filter((w) => candidateWords.has(w)).length;
      const ratio = common / targetWords.size;
      if (ratio >= 0.45) {
        score = ratio * 0.7;
      }
    }
  }

  if (score <= 0) return 0;

  if (year && (item.year || item.releaseInfo)) {
    let itemYear = null;
    if (typeof item.year === 'number') itemYear = item.year;
    else if (typeof item.year === 'string') {
      const ym = item.year.match(/\b(19\d\d|20\d\d)\b/);
      if (ym) itemYear = parseInt(ym[1], 10);
    }
    const targetYear = parseInt(year, 10);
    if (!isNaN(targetYear) && itemYear && !isNaN(itemYear)) {
      if (itemYear === targetYear) score += 0.25;
      else if (Math.abs(itemYear - targetYear) <= 1) score += 0.1;
      else score -= 0.2;
    }
  }

  if (season != null) {
    const sNum = parseInt(season, 10);
    if (!isNaN(sNum) && sNum > 0) {
      const sm = nameNorm.match(/\b(?:phan|season|part|ss)\s*(\d+)\b/) ||
                 originNorm.match(/\b(?:phan|season|part|ss)\s*(\d+)\b/) ||
                 slugNorm.match(/\b(?:phan|season|part|ss)\s*(\d+)\b/);
      const itemSeason = sm ? parseInt(sm[1], 10) : 1;
      if (itemSeason === sNum) score += 0.3;
      else if (sNum > 1 && itemSeason === 1) score -= 0.25;
    }
  }

  return Math.max(0, score);
}

/**
 * Search STP repository / mirrors
 */
async function search(keyword, page = 1) {
  const clean = safeKeyword(keyword);
  const p = safePage(page);
  if (!clean) return [];

  try {
    const res = await http.get('https://phimapi.com/v1/api/tim-kiem', {
      params: { keyword: clean, limit: 12, page: p },
    });
    const items = res.data?.data?.items || [];
    return items.map((it) => ({
      name: it.name,
      origin_name: it.origin_name,
      slug: it.slug,
      year: it.year,
      type: it.type,
      poster: it.poster_url ? (it.poster_url.startsWith('http') ? it.poster_url : `https://phimimg.com/${it.poster_url}`) : null,
      quality: it.quality,
      lang: it.lang,
    }));
  } catch (err) {
    console.warn(`[STP/search] "${clean}":`, err.message);
    return [];
  }
}

/**
 * Get film detail
 */
async function getDetail(slug) {
  const cleanSlug = safeSlug(slug, 'stp');
  if (!cleanSlug) return null;
  const cacheKey = `stp:detail:${cleanSlug}`;
  const cached = detailCache.get(cacheKey);
  if (cached) return cached;

  try {
    const res = await http.get(`https://phimapi.com/phim/${cleanSlug}`);
    const movie = res.data?.movie || res.data?.data?.item;
    const episodes = res.data?.episodes || movie?.episodes || [];
    if (movie) {
      const result = { movie, episodes };
      detailCache.set(cacheKey, result, 600);
      return result;
    }
  } catch (err) {
    console.warn(`[STP/getDetail] "${cleanSlug}":`, err.message);
  }
  return null;
}

/**
 * Get catalog items for Western Cinema & K-Drama
 */
async function getCatalog(type, page = 1, extra = {}) {
  const cleanType = safeType(type, 'au-my');
  const safe = safeExtra(extra);
  const p = safePage(page);
  const searchQuery = safeKeyword(safe.search || safe.searchQuery || safe.query);
  const cacheKey = `stp:cat:${cleanType}:${p}:${searchQuery}`;
  const cached = catalogCache.get(cacheKey);
  if (cached) return cached;

  try {
    let items = [];
    if (searchQuery) {
      const searchItems = await search(searchQuery, p);
      items = searchItems.map((it) => ({
        id: `stp_${it.slug}`,
        type: it.type === 'series' ? 'series' : 'movie',
        name: it.name || it.origin_name,
        poster: it.poster,
        posterShape: 'poster',
        description: `STP Western & K-Drama • ${it.origin_name || it.name}`,
        releaseInfo: it.year ? String(it.year) : null,
      }));
      catalogCache.set(cacheKey, items, 120);
      return items;
    }

    // Default Western Cinema (Âu Mỹ) or K-Drama (Hàn Quốc)
    let countrySlug = 'au-my';
    if (cleanType.includes('han') || cleanType.includes('korea') || cleanType.includes('k-drama')) {
      countrySlug = 'han-quoc';
    }

    const res = await http.get(`https://phimapi.com/v1/api/quoc-gia/${countrySlug}`, { params: { page: p } });
    const raw = res.data?.data?.items || [];
    items = raw.map((it) => ({
      id: `stp_${it.slug}`,
      type: it.type === 'series' ? 'series' : 'movie',
      name: it.name || it.origin_name || 'Không rõ tên',
      poster: it.poster_url ? (it.poster_url.startsWith('http') ? it.poster_url : `https://phimimg.com/${it.poster_url}`) : null,
      posterShape: 'poster',
      background: it.thumb_url ? (it.thumb_url.startsWith('http') ? it.thumb_url : `https://phimimg.com/${it.thumb_url}`) : null,
      description: `STP Special Edition • ${it.origin_name || it.name}`,
      releaseInfo: it.year ? String(it.year) : null,
    }));

    catalogCache.set(cacheKey, items, 300);
    return items;
  } catch (err) {
    console.warn(`[STP/getCatalog] type=${cleanType} page=${p}:`, err.message);
    return [];
  }
}

/**
 * Get streams for Western Cinema & K-Drama
 */
async function getStreams(arg1, title, type, season, episode, proxyBase) {
  let imdbId  = null;
  let slug    = null;
  let year    = null;
  let genres  = [];

  if (typeof arg1 === 'object' && arg1 !== null) {
    imdbId    = arg1.imdbId || null;
    title     = arg1.title || null;
    type      = arg1.type || 'movie';
    year      = arg1.year || null;
    genres    = arg1.genres || [];
    season    = arg1.season != null ? arg1.season : null;
    episode   = arg1.episode != null ? arg1.episode : null;
    slug      = arg1.slug || null;
    proxyBase = arg1.proxyBase || '';
  } else if (typeof arg1 === 'string') {
    if (/^tt\d+/i.test(arg1)) imdbId = arg1;
    else slug = arg1;
    type = type || 'movie';
    proxyBase = proxyBase || '';
  }

  if (season != null) {
    const seasonNum = parseInt(season, 10);
    if (isNaN(seasonNum) || seasonNum <= 0 || seasonNum > 1000) return [];
  }
  if (episode != null) {
    const epNum = parseInt(episode, 10);
    if (String(episode).trim().startsWith('-') || (!isNaN(epNum) && epNum <= 0)) return [];
  }

  if (!year && imdbId) {
    const cachedCine = getCachedCinemeta(type, imdbId);
    if (cachedCine?.year) year = cachedCine.year;
    if (!title && cachedCine?.name) title = cachedCine.name;
  }

  try {
    let movieData = null;

    if (slug && (slug.startsWith('stp_') || slug.startsWith('stp:'))) {
      movieData = await getDetail(slug);
    }

    if (!movieData && imdbId) {
      const cleanImdb = String(imdbId).toLowerCase().trim();
      try {
        const res = await http.get(`https://phimapi.com/imdb/title/${cleanImdb}`);
        const movie = res.data?.movie || res.data?.data?.item;
        const episodes = res.data?.episodes || movie?.episodes || [];
        if (movie) movieData = { movie, episodes };
      } catch {}
    }

    if (!movieData && title) {
      const searchItems = await search(title, 1);
      if (searchItems.length > 0) {
        let bestItem = null;
        let bestScore = -1;
        for (const item of searchItems) {
          const score = scoreMatch(item, title, year, season);
          if (score > bestScore) {
            bestScore = score;
            bestItem = item;
          }
        }
        if (bestItem && bestItem.slug && bestScore >= 0.45) {
          movieData = await getDetail(bestItem.slug);
          if (movieData && imdbId) {
            imdbCache.set(`stp:imdb:${String(imdbId).toLowerCase().trim()}`, bestItem.slug, 86400);
          }
        }
      }
    }

    if (!movieData || !movieData.episodes || !movieData.episodes.length) {
      return [];
    }

    const { movie, episodes } = movieData;
    const isMovie = (type === 'movie' || movie.type === 'single') && episode == null;
    const targetEpStr = !isMovie && episode != null ? String(episode).trim() : null;

    // Season validation for series
    if (!isMovie && season != null) {
      if (!isSeasonMatch(movie, episodes, season, type)) {
        return [];
      }
    }
    const streams = [];
    const b64Ref = encodeBase64(REFERER_HEADER);

    for (let sIdx = 0; sIdx < episodes.length; sIdx++) {
      const server = episodes[sIdx];
      const rawServerName = String(server.server_name || '').trim() || `Server ${sIdx + 1}`;
      const cleanServerName = rawServerName.replace(/[\r\n#]+/g, ' ').replace(/\s+/g, ' ').trim() || `Server ${sIdx + 1}`;
      const serverData = server.server_data || [];
      if (!serverData.length) continue;

      let targetEp = null;
      if (isMovie || targetEpStr === null) {
        targetEp = serverData[0];
      } else {
        const epNum = parseInt(targetEpStr, 10);
        if (!isNaN(epNum) && epNum <= 0) {
          targetEp = null;
        } else {
          targetEp = serverData.find((ep) => {
            if (!ep) return false;
            const nameStr = String(ep.name || '').trim();
            const slugStr = String(ep.slug || '').trim();
            if (nameStr === targetEpStr || nameStr === `Tập ${targetEpStr}` || nameStr === `Tập 0${targetEpStr}`) return true;
            if (slugStr === `tap-${targetEpStr}` || slugStr === `tap-0${targetEpStr}`) return true;
            if (!isNaN(epNum) && epNum > 0) {
              const numFromName = parseInt(nameStr.replace(/\D+/g, ''), 10);
              if (numFromName === epNum) return true;
              const numFromSlug = parseInt(slugStr.replace(/\D+/g, ''), 10);
              if (numFromSlug === epNum) return true;
            }
            if (nameStr && targetEpStr && !targetEpStr.startsWith('-')) {
              try {
                const re = new RegExp(`(^|[^0-9a-zA-Z])${escapeRegExp(targetEpStr)}([^0-9a-zA-Z]|$)`, 'i');
                if (re.test(nameStr) || re.test(slugStr)) return true;
              } catch {}
            }
            return false;
          });

          if (!targetEp && !isNaN(epNum) && epNum >= 1 && epNum <= serverData.length) {
            targetEp = serverData[epNum - 1];
          }
        }
      }

      if (!targetEp || !targetEp.link_m3u8) continue;

      const epLabel = formatEpisodeLabel(targetEp.name);
      const isTM = /thuy.{1,5}t minh|l.{1,5}ng ti.{1,5}ng/i.test(rawServerName);
      const titleHeader = isTM
        ? `[VIP • STP] Thuyết Minh Full HD${epLabel} (HLS Proxy)`
        : `[VIP • STP] Vietsub Full HD${epLabel} (HLS Proxy)`;

      const streamUrl = `${proxyBase || ''}/hls/manifest.m3u8?url=${encodeBase64(targetEp.link_m3u8)}&ref=${b64Ref}`;

      // STRICT INVARIANT: url only, NO externalUrl
      streams.push({
        name: 'VIP Movies 🎬',
        title: `${titleHeader}\n⚡ Server STP • Âu Mỹ & K-Drama Tuyển Chọn`,
        url: streamUrl,
        behaviorHints: {
          notSupported: false,
          bingeGroup: `stp-${movie.slug || slug || 'stream'}`,
        },
      });
    }

    return streams;
  } catch (err) {
    console.warn(`[STP/getStreams] Error:`, err.message);
    return [];
  }
}

module.exports = {
  id: PROVIDER_ID,
  label: PROVIDER_LABEL,
  search,
  getDetail,
  getCatalog,
  getStreams,
};
