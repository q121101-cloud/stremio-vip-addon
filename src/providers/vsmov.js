'use strict';

/**
 * ============================================================
 *  VIP Movies Addon — src/providers/vsmov.js
 *  VSMOV 4K Provider Module (100% Official API: vsmov.com/api)
 * ============================================================
 */

const axios = require('axios');
const BaseProvider = require('./base');
const { imdbCache, catalogCache, detailCache } = require('../lib/cache');
const { resolveCinemeta, getCachedCinemeta } = require('../lib/cinemeta');
const { safeExtra, safeSlug, safeKeyword, safePage, safeType, isSeasonMatch, scoreMatch, escapeRegExp, generateSearchKeywords } = require('../lib/utils');

const PROVIDER_ID    = 'vsmov';
const PROVIDER_LABEL = 'VSMOV 4K';
const BASE_API       = 'https://vsmov.com/api';
const REFERER_HEADER = 'https://vsmov.com/';
const VSMOV_UA       = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

const http = axios.create({
  baseURL: BASE_API,
  timeout: 5000,
  headers: {
    'User-Agent': VSMOV_UA,
    Accept: 'application/json, text/plain, */*',
    'Accept-Language': 'vi-VN,vi;q=0.9,en-US;q=0.8',
    Referer: REFERER_HEADER,
    Origin: 'https://vsmov.com',
  },
});

function encodeBase64(str) {
  if (!str) return '';
  return Buffer.from(str, 'utf8').toString('base64url');
}

function formatImageUrl(url) {
  if (!url) return null;
  if (url.startsWith('http://') || url.startsWith('https://')) return url;
  const clean = url.startsWith('/') ? url.slice(1) : url;
  return `https://vsmov.com/${clean}`;
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

function classifyServerAudio(serverName) {
  const name = String(serverName || '')
    .replace(/[\r\n]+/g, ' ')
    .replace(/#/g, '')
    .replace(/\s+/g, ' ')
    .trim();

  if (/l.{1,5}ng\s*ti.{1,5}ng/i.test(name) || /long\s*tieng/i.test(name)) {
    return {
      type: 'longtieng',
      label: 'Lồng Tiếng',
      bingeGroup: 'vsmov-longtieng-4k-vip-1',
    };
  }
  if (/thuy.{1,5}t\s*minh/i.test(name) || /thuyet\s*minh/i.test(name)) {
    return {
      type: 'thuyetminh',
      label: 'Thuyết Minh',
      bingeGroup: 'vsmov-thuyetminh-4k-vip-1',
    };
  }
  return {
    type: 'vietsub',
    label: 'Vietsub',
    bingeGroup: 'vsmov-vietsub-4k-vip-1',
  };
}

async function resolveEmbedMedia(linkEmbed, linkM3u8) {
  let masterPlaylistUrl = null;
  let subtitleUrl = null;

  if (linkM3u8 && typeof linkM3u8 === 'string' && linkM3u8.includes('.m3u8')) {
    masterPlaylistUrl = linkM3u8;
  } else if (linkEmbed && typeof linkEmbed === 'string' && linkEmbed.includes('.m3u8')) {
    masterPlaylistUrl = linkEmbed;
  }

  if (!linkEmbed || typeof linkEmbed !== 'string') {
    return { masterPlaylistUrl, subtitleUrl };
  }

  const cacheKey = `vsmov:embed:${linkEmbed}`;
  const cached = await imdbCache.get(cacheKey);
  if (cached && typeof cached === 'object' && cached.masterPlaylistUrl) {
    return cached;
  }

  try {
    const res = await http.get(linkEmbed, { timeout: 3000 });
    const html = String(res.data);
    let embedOrigin = '';
    try {
      embedOrigin = new URL(linkEmbed).origin;
    } catch {}

    if (!masterPlaylistUrl) {
      const m3u8Match =
        html.match(/(?:file|source|url|link|src)\s*:\s*["']([^"']+\.m3u8[^"']*)["']/i) ||
        html.match(/["'](https?:\/\/[^"']+\.m3u8[^"']*)["']/i) ||
        html.match(/["'](\/[^"']+\.m3u8[^"']*)["']/i);

      if (m3u8Match && m3u8Match[1]) {
        let rawM3u8 = m3u8Match[1];
        if (rawM3u8.startsWith('//')) {
          masterPlaylistUrl = 'https:' + rawM3u8;
        } else if (rawM3u8.startsWith('/') && embedOrigin) {
          masterPlaylistUrl = embedOrigin + rawM3u8;
        } else {
          masterPlaylistUrl = rawM3u8;
        }
      }
    }

    const subMatch =
      html.match(/(?:tracks|subtitle|sub|track)\s*:\s*\[?[^\]]*?["'](https?:\/\/[^"']+\.(?:vtt|srt)[^"']*)["']/i) ||
      html.match(/["'](https?:\/\/[^"']+\/subtitle\/[^"']+\.(?:vtt|srt)[^"']*)["']/i) ||
      html.match(/(?:file|src)\s*:\s*["'](https?:\/\/[^"']+\.(?:vtt|srt)[^"']*)["']/i);

    if (subMatch && subMatch[1]) {
      subtitleUrl = subMatch[1];
    }

    const result = { masterPlaylistUrl, subtitleUrl };
    if (masterPlaylistUrl) {
      imdbCache.set(cacheKey, result, 86400);
    }
    return result;
  } catch {
    return { masterPlaylistUrl, subtitleUrl };
  }
}

function mapCatalogMeta(item) {
  const type = item.type === 'series' || item.type === 'tvshows' ? 'series' : 'movie';
  const slug = item.slug || '';
  const is4K = item.quality === '4K' || item.quality === 'HD' || true;
  const isTM = /thuyết minh/i.test(item.lang || '') || /thuyet minh/i.test(item.lang || '');

  return {
    id: `vsmov_${slug}`,
    type,
    name: item.name || item.origin_name || 'Không rõ tên',
    poster: formatImageUrl(item.thumb_url || item.poster_url),
    posterShape: 'poster',
    background: formatImageUrl(item.poster_url || item.thumb_url),
    description: item.content || item.description || null,
    releaseInfo: [
      is4K ? '4K Ultra HD' : item.quality || 'HD',
      isTM ? 'Thuyết Minh' : item.lang || 'Vietsub',
      item.year || null,
    ]
      .filter(Boolean)
      .join(' · '),
  };
}

class VSMOVProvider extends BaseProvider {
  constructor() {
    super('vsmov', 'https://vsmov.com');
    this.apiBase = 'https://vsmov.com/api';
  }

  async search(keyword, page = 1) {
    const cleanKeyword = safeKeyword(keyword);
    if (!cleanKeyword) return { items: [], totalPages: 0 };
    try {
      const res = await http.get('/search', {
        params: { q: cleanKeyword, page: safePage(page) },
      });
      return {
        items: res.data?.items || res.data?.data?.items || [],
        totalPages: res.data?.paginate?.total_page || 1,
      };
    } catch (err) {
      console.error(`[VSMOV/search] keyword="${cleanKeyword}":`, err.message);
      return { items: [], totalPages: 0 };
    }
  }

  async getDetail(slug) {
    const cleanSlug = safeSlug(slug, 'vsmov');
    if (!cleanSlug) return null;
    const cacheKey = `vsmov:detail:${cleanSlug}`;
    const cached = await detailCache.get(cacheKey);
    if (cached) return cached;

    try {
      const res = await http.get(`/phim/${cleanSlug}`);
      if (res.data && res.data.movie) {
        const result = {
          movie: res.data.movie,
          episodes: res.data.episodes || [],
        };
        detailCache.set(cacheKey, result, 600);
        return result;
      }
    } catch (err) {
      console.error(`[VSMOV/getDetail] slug="${cleanSlug}":`, err.message);
    }
    return null;
  }

  async getByImdb(imdbId, title = null) {
    if (!imdbId) return null;
    const cleanImdb = String(imdbId).toLowerCase().trim();
    const cacheKey = `vsmov:imdb:${cleanImdb}`;
    const cachedSlug = await imdbCache.get(cacheKey);
    if (cachedSlug) {
      const detail = await this.getDetail(cachedSlug);
      if (detail) return detail;
    }

    try {
      const s1 = await this.search(cleanImdb);
      const items1 = s1.items || [];
      const directMatch = items1.find(
        (it) => it.imdb && String(it.imdb.id || '').toLowerCase().trim() === cleanImdb
      );
      if (directMatch && directMatch.slug) {
        imdbCache.set(cacheKey, directMatch.slug, 86400);
        return await this.getDetail(directMatch.slug);
      }

      if (title) {
        const s2 = await this.search(title);
        const items2 = s2.items || [];
        const titleMatch = items2.find(
          (it) => it.imdb && String(it.imdb.id || '').toLowerCase().trim() === cleanImdb
        );
        if (titleMatch && titleMatch.slug) {
          imdbCache.set(cacheKey, titleMatch.slug, 86400);
          return await this.getDetail(titleMatch.slug);
        }
      }
    } catch (err) {
      console.warn(`[VSMOV/getByImdb] ${cleanImdb}:`, err.message);
    }
    return null;
  }

  async getByTmdb(tmdbId) {
    if (!tmdbId) return null;
    try {
      const s = await this.search(String(tmdbId));
      const items = s.items || [];
      const match = items.find((it) => it.tmdb && String(it.tmdb.id || '') === String(tmdbId));
      if (match && match.slug) {
        return await this.getDetail(match.slug);
      }
    } catch (err) {
      console.warn(`[VSMOV/getByTmdb] ${tmdbId}:`, err.message);
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

    const cleanType = safeType(type, '4k');
    const safe = safeExtra(extra);
    const p = safePage(page);
    const searchQuery = safeKeyword(safe.search || safe.searchQuery || safe.query);
    const genreFilter = safeKeyword(safe.genre);
    const cacheKey = `vsmov:cat:${cleanType}:${p}:${searchQuery}:${genreFilter}`;
    const cached = await catalogCache.get(cacheKey);
    if (cached) return cached;

    try {
      let items = [];

      if (searchQuery) {
        const searchRes = await this.search(searchQuery, p);
        const raw = searchRes.items || [];
        items = raw.map((i) => mapCatalogMeta(i));
        catalogCache.set(cacheKey, items, 120);
        return items;
      }

      let endpoint = '/danh-sach/phim-le';
      if (cleanType === 'series' || cleanType === 'phim-bo' || cleanType === 'phimbo' || cleanType === 'vsmov_phimbo') {
        endpoint = '/danh-sach/phim-bo';
      } else if (cleanType === 'thuyet-minh' || cleanType === 'vsmov-thuyet-minh' || cleanType === 'vsmov_thuyet_minh') {
        endpoint = '/danh-sach/phim-moi-cap-nhat';
      } else if (cleanType === '4k' || cleanType === 'vsmov_4k' || cleanType === 'vsmov-4k' || cleanType === 'movie' || cleanType === 'phim-le' || cleanType === 'phim-moi-cap-nhat') {
        endpoint = '/danh-sach/phim-le';
      }

      const params = { page: p };
      if (genreFilter) params.category = genreFilter;

      const res = await http.get(endpoint, { params });
      const raw = res.data?.items || res.data?.data?.items || [];
      const isSeries = endpoint === '/danh-sach/phim-bo' || cleanType === 'series' || cleanType === 'phim-bo';
      items = raw.map((i) => ({
        ...mapCatalogMeta(i),
        type: isSeries ? 'series' : 'movie',
      }));
      catalogCache.set(cacheKey, items, 300);
      return items;
    } catch (err) {
      console.error(`[VSMOV/getCatalog] type=${cleanType} page=${p}:`, err.message);
      return [];
    }
  }

  async getStreams(arg1, arg2 = 1, arg3 = 1, extraArg4, extraArg5, extraArg6) {
    let imdbId = null;
    let tmdbId = null;
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
      tmdbId = arg1.tmdbId;
      type = arg1.type || 'movie';
      title = arg1.title;
      year = arg1.year;
      season = parseInt(arg1.season, 10) || 1;
      episode = parseInt(arg1.episode, 10) || 1;
      slug = arg1.slug;
      proxyBase = arg1.proxyBase || '';
      aliases = Array.isArray(arg1.aliases) ? arg1.aliases : [];
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
      // 1. Direct API stream attempt if slug/ID given
      if (slug && !proxyBase) {
        try {
          const res = await http.get(`/stream/${slug}?s=${season}&e=${episode}`, {
            timeout: 3000,
          });
          if (res.data && res.data.streams) {
            return res.data.streams.map((s) => ({
              server: s.server || 'VSMOV 4K CDN',
              quality: s.quality || '3840x2160',
              url: s.url,
            }));
          }
        } catch {}
      }

      let movieData = null;

      // 2. Direct Slug
      if (slug) {
        movieData = await this.getDetail(slug);
      }

      // 3. IMDb Lookup
      if (!movieData && imdbId) {
        movieData = await this.getByImdb(imdbId, title);
      }

      // 4. TMDB Lookup
      if (!movieData && tmdbId) {
        movieData = await this.getByTmdb(tmdbId);
      }

      // 5. Keyword Search Match with Aliases
      if (!movieData && (title || aliases.length > 0)) {
        const cleanTitle = String(title || '').trim();
        const allTargetTitles = [cleanTitle, ...aliases].filter(Boolean);
        const searchQueries = generateSearchKeywords({
          title: cleanTitle,
          aliases,
          type,
          season,
          year,
        });

        for (const q of searchQueries) {
          const searchRes = await this.search(q);
          const items = searchRes.items || [];
          if (items.length === 0) continue;

          let bestMatch = null;
          let highestScore = 0;

          for (const item of items) {
            for (const target of allTargetTitles) {
              const score = scoreMatch(target, item.name, year, item.year);
              const origScore = item.origin_name ? scoreMatch(target, item.origin_name, year, item.year) : 0;
              const qScore = scoreMatch(q, item.name, year, item.year);
              const finalScore = Math.max(score, origScore, qScore);

              if (finalScore > highestScore && (finalScore >= 0.35 || finalScore >= 35)) {
                highestScore = finalScore;
                bestMatch = item;
              }
            }
          }

          if (!bestMatch && items.length === 1) {
            bestMatch = items[0];
          }

          if (bestMatch && bestMatch.slug) {
            movieData = await this.getDetail(bestMatch.slug);
            if (movieData && imdbId) {
              imdbCache.set(`vsmov:imdb:${imdbId.toLowerCase().trim()}`, bestMatch.slug, 86400 * 7);
            }
            break;
          }
        }
      }

      if (!movieData || !movieData.episodes || movieData.episodes.length === 0) {
        return [];
      }

      const streams = [];
      const isSeries = type === 'series';
      const targetEpStr = String(episode);

      for (let sIdx = 0; sIdx < movieData.episodes.length; sIdx++) {
        const sGroup = movieData.episodes[sIdx];
        const serverName = sGroup.server_name || `Server VIP ${sIdx + 1}`;
        const audioInfo = classifyServerAudio(serverName);
        const serverData = sGroup.server_data || sGroup.items || [];

        if (serverData.length === 0) continue;

        let matchedEp = null;
        if (isSeries) {
          matchedEp = serverData.find((ep) => {
            const epName = String(ep.name || '').trim();
            const epSlug = String(ep.slug || '').trim();
            return (
              epName === targetEpStr ||
              epName === `0${targetEpStr}` ||
              epName === `Tập ${targetEpStr}` ||
              epName === `Tập 0${targetEpStr}` ||
              epSlug === `tap-${targetEpStr}` ||
              epSlug === `tap-0${targetEpStr}` ||
              epSlug === targetEpStr
            );
          });
          if (!matchedEp && serverData[episode - 1]) {
            matchedEp = serverData[episode - 1];
          }
        } else {
          matchedEp = serverData[0];
        }

        if (!matchedEp) continue;

        const { masterPlaylistUrl, subtitleUrl } = await resolveEmbedMedia(
          matchedEp.link_embed,
          matchedEp.link_m3u8
        );

        if (!masterPlaylistUrl) continue;

        const epBadge = isSeries ? formatEpisodeLabel(matchedEp.name || episode) : '';
        const titleLine1 = `[VIP 1 • VSMOV] ${audioInfo.label} 4K Ultra HD (3840x2160)${epBadge} (HLS Proxy)`;
        const titleLine2 = `⚡ Server VIP ${audioInfo.label} • vsmov.com`;

        const b64Url = encodeBase64(masterPlaylistUrl);
        const b64Ref = encodeBase64(REFERER_HEADER);
        const b64Sub = subtitleUrl ? encodeBase64(subtitleUrl) : '';

        const proxiedUrl = proxyBase
          ? `${proxyBase}/hls/manifest.m3u8?url=${b64Url}&ref=${b64Ref}${b64Sub ? `&sub=${b64Sub}` : ''}`
          : masterPlaylistUrl;

        const streamObj = {
          name: 'VIP Movies 🎬',
          server: `VSMOV 4K (${audioInfo.label})`,
          quality: '3840x2160',
          title: `${titleLine1}\n${titleLine2}`,
          url: proxiedUrl,
          rawUrl: masterPlaylistUrl,
          behaviorHints: {
            notWebReady: false,
            bingeGroup: isSeries ? `${audioInfo.bingeGroup}-ep${episode}` : audioInfo.bingeGroup,
          },
        };

        if (subtitleUrl && proxyBase) {
          streamObj.subtitles = [
            {
              id: 'vi_vsmov',
              lang: 'vie',
              url: `${proxyBase}/hls/sub.vtt?url=${b64Sub}&ref=${b64Ref}`,
              title: 'Tiếng Việt (VSMOV VIP)',
            },
          ];
        }

        streams.push(streamObj);
      }

      return streams;
    } catch (err) {
      console.error('[VSMOV/getStreams] error:', err.message);
      return [];
    }
  }
}

const instance = new VSMOVProvider();

module.exports = instance;
module.exports.VSMOVProvider = VSMOVProvider;
module.exports.getStreams = instance.getStreams.bind(instance);
module.exports.getCatalog = instance.getCatalog.bind(instance);
module.exports.getDetail  = instance.getDetail.bind(instance);
module.exports.search     = instance.search.bind(instance);
module.exports.getByImdb  = instance.getByImdb.bind(instance);
module.exports.getByTmdb  = instance.getByTmdb.bind(instance);
