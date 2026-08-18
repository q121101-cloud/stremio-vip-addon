'use strict';

/**
 * ============================================================
 *  VIP Movies Addon — src/providers/vsmov.js (Engine v1.5.0)
 *  VSMOV 4K Provider Module (100% Official API: vsmov.com/api)
 *
 *  Features:
 *  - Official API: https://vsmov.com/api
 *  - Direct IMDb / TMDB lookup & fuzzy keyword title + year matching
 *  - Master 4K Ultra HD (3840x2160) stream extraction from *.streamvsmov.com
 *  - Anti-403 HLS Proxy encapsulation (Referer: https://vsmov.com/)
 *  - Strict zero externalUrl invariant on all stream objects
 *  - 5-second axios timeout for fault isolation & zero blocking
 * ============================================================
 */

const axios = require('axios');
const { imdbCache, catalogCache, detailCache } = require('../lib/cache');
const { getCachedCinemeta } = require('../lib/cinemeta');
const { safeExtra, safeSlug, safeKeyword, safePage, safeType, isSeasonMatch, scoreMatch, escapeRegExp } = require('../lib/utils');

const PROVIDER_ID    = 'vsmov';
const PROVIDER_LABEL = 'VSMOV 4K';
const BASE_API       = 'https://vsmov.com/api';
const REFERER_HEADER = 'https://vsmov.com/';
const VSMOV_UA       = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';

// ─── Axios Client (5s Timeout) ───────────────────────────────────
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

// ─── Helpers ────────────────────────────────────────────────────
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

/**
 * Extract master m3u8 playlist URL from link_embed or link_m3u8
 */
async function resolveMasterPlaylistUrl(linkEmbed, linkM3u8) {
  if (linkM3u8 && typeof linkM3u8 === 'string' && linkM3u8.startsWith('http')) {
    return linkM3u8;
  }
  if (!linkEmbed || typeof linkEmbed !== 'string') return null;

  if (linkEmbed.includes('.m3u8')) {
    return linkEmbed;
  }

  const cacheKey = `vsmov:m3u8:${linkEmbed}`;
  const cached = imdbCache.get(cacheKey);
  if (cached) return cached;

  try {
    const res = await http.get(linkEmbed, {
      timeout: 3000,
    });
    const html = String(res.data);

    // 1. Check baseUrl + videoHash
    const mBase = html.match(/baseUrl\s*=\s*["'\x27]([^"'\x27]+)["'\x27]/i);
    const mHash = html.match(/videoHash\s*=\s*["'\x27]([^"'\x27]+)["'\x27]/i);
    if (mBase && mHash) {
      const resolved = `${mBase[1]}/stream/${mHash[1]}/master.m3u8`;
      imdbCache.set(cacheKey, resolved, 86400);
      return resolved;
    }

    // 2. Check backtick or quote URL containing .m3u8
    const m = html.match(/(?:["`'\x27\s=:(])(https?:\/\/[^"`'\x27\s()]+\.m3u8[^"`'\x27\s()]*)/i);
    if (m && m[1]) {
      const resolved = m[1];
      imdbCache.set(cacheKey, resolved, 86400);
      return resolved;
    }
  } catch (err) {
    console.warn(`[VSMOV/resolveMasterPlaylistUrl] Embed parse warning for ${linkEmbed}:`, err.message);
  }

  // Fallback pattern
  try {
    const u = new URL(linkEmbed);
    const parts = u.pathname.split('/').filter(Boolean);
    const videoHash = parts[parts.length - 1];
    if (videoHash && videoHash.length >= 8) {
      return `${u.origin}/stream/${videoHash}/master.m3u8`;
    }
  } catch {}

  return null;
}

function mapCatalogMeta(item, forceType = null) {
  const isSeries = item.type === 'series' || item.type === 'tvshows';
  const type = forceType || (isSeries ? 'series' : 'movie');
  const slug = item.slug || '';
  const badgeParts = ['4K Ultra HD'];
  if (item.year) badgeParts.push(String(item.year));

  return {
    id: `vsmov_${slug}`,
    type,
    name: item.name || item.origin_name || 'Không rõ tên',
    poster: formatImageUrl(item.poster_url || item.thumb_url),
    posterShape: 'poster',
    background: formatImageUrl(item.thumb_url || item.poster_url),
    description: item.content ? String(item.content).replace(/<[^>]+>/g, '').slice(0, 300) : null,
    releaseInfo: badgeParts.join(' · '),
  };
}

// ─────────────────────────────────────────────────────────────
//  1. Tìm kiếm phim: search(keyword, page = 1)
// ─────────────────────────────────────────────────────────────
async function search(keyword, page = 1) {
  const cleanKeyword = safeKeyword(keyword);
  const p = safePage(page);
  if (!cleanKeyword) return { items: [] };

  try {
    const res = await http.get('/tim-kiem', {
      params: {
        keyword: cleanKeyword,
        page: p,
      },
    });
    return res.data || { items: [] };
  } catch (err) {
    console.error(`[VSMOV/search] keyword="${cleanKeyword}":`, err.message);
    return { items: [] };
  }
}

// ─────────────────────────────────────────────────────────────
//  2. Chi tiết phim: getDetail(slug)
// ─────────────────────────────────────────────────────────────
async function getDetail(slug) {
  const cleanSlug = safeSlug(slug, 'vsmov');
  if (!cleanSlug) return null;
  const cacheKey = `vsmov:detail:${cleanSlug}`;
  const cached = detailCache.get(cacheKey);
  if (cached) return cached;

  try {
    const res = await http.get(`/phim/${cleanSlug}`);
    if (res.data && res.data.movie) {
      const result = {
        movie: res.data.movie,
        episodes: res.data.episodes || [],
      };
      detailCache.set(cacheKey, result, 600); // Cache 10 mins
      return result;
    }
  } catch (err) {
    console.error(`[VSMOV/getDetail] slug="${cleanSlug}":`, err.message);
  }
  return null;
}

// ─────────────────────────────────────────────────────────────
//  3. Tra cứu theo IMDb ID / TMDB ID
// ─────────────────────────────────────────────────────────────
async function getByImdb(imdbId, title = null) {
  if (!imdbId) return null;
  const cleanImdb = String(imdbId).toLowerCase().trim();
  const cacheKey = `vsmov:imdb:${cleanImdb}`;
  const cachedSlug = imdbCache.get(cacheKey);
  if (cachedSlug) {
    const detail = await getDetail(cachedSlug);
    if (detail) return detail;
  }

  try {
    // 1. Try search with IMDb ID directly
    const s1 = await search(cleanImdb);
    const items1 = s1.items || [];
    const directMatch = items1.find(
      (it) => it.imdb && String(it.imdb.id || '').toLowerCase().trim() === cleanImdb
    );
    if (directMatch && directMatch.slug) {
      imdbCache.set(cacheKey, directMatch.slug, 86400);
      return await getDetail(directMatch.slug);
    }

    // 2. If title given, search title and check item.imdb.id
    if (title) {
      const s2 = await search(title);
      const items2 = s2.items || [];
      const titleMatch = items2.find(
        (it) => it.imdb && String(it.imdb.id || '').toLowerCase().trim() === cleanImdb
      );
      if (titleMatch && titleMatch.slug) {
        imdbCache.set(cacheKey, titleMatch.slug, 86400);
        return await getDetail(titleMatch.slug);
      }
    }
  } catch (err) {
    console.warn(`[VSMOV/getByImdb] ${cleanImdb}:`, err.message);
  }
  return null;
}

async function getByTmdb(tmdbId) {
  if (!tmdbId) return null;
  try {
    const s = await search(String(tmdbId));
    const items = s.items || [];
    const match = items.find((it) => it.tmdb && String(it.tmdb.id || '') === String(tmdbId));
    if (match && match.slug) {
      return await getDetail(match.slug);
    }
  } catch (err) {
    console.warn(`[VSMOV/getByTmdb] ${tmdbId}:`, err.message);
  }
  return null;
}

// ─────────────────────────────────────────────────────────────
//  4. Danh mục & Catalog: getCatalog(type, page = 1, extra = {})
// ─────────────────────────────────────────────────────────────
async function getCatalog(type, page = 1, extra = {}) {
  const cleanType = safeType(type, '4k');
  const safe = safeExtra(extra);
  const p = safePage(page);
  const searchQuery = safeKeyword(safe.search || safe.searchQuery || safe.query);
  const genreFilter = safeKeyword(safe.genre);
  const cacheKey = `vsmov:cat:${cleanType}:${p}:${searchQuery}:${genreFilter}`;
  const cached = catalogCache.get(cacheKey);
  if (cached) return cached;

  try {
    let items = [];

    // 1. Search mode
    if (searchQuery) {
      const searchRes = await search(searchQuery, p);
      const raw = searchRes.items || [];
      items = raw.map((i) => mapCatalogMeta(i));
      catalogCache.set(cacheKey, items, 120);
      return items;
    }

    // 2. List endpoints
    let endpoint = '/danh-sach/4k';

    if (cleanType.includes('4k') || cleanType === 'vsmov-4k') {
      endpoint = '/danh-sach/4k';
    } else if (cleanType.includes('tm') || cleanType.includes('thuyet-minh')) {
      endpoint = '/danh-sach/thuyet-minh';
    } else if (cleanType === 'movie' || cleanType === 'phim-le') {
      endpoint = '/danh-sach/phim-le';
    } else if (cleanType === 'series' || cleanType === 'phim-bo') {
      endpoint = '/danh-sach/phim-bo';
    } else if (cleanType === 'latest' || cleanType === 'phim-moi-cap-nhat') {
      endpoint = '/danh-sach/phim-moi-cap-nhat';
    }

    const res = await http.get(endpoint, { params: { page: p } });
    const raw = res.data?.items || res.data?.data?.items || [];
    items = raw.map((i) => mapCatalogMeta(i));

    catalogCache.set(cacheKey, items, 300);
    return items;
  } catch (err) {
    console.error(`[VSMOV/getCatalog] type=${cleanType} page=${p}:`, err.message);
    return [];
  }
}

// ─────────────────────────────────────────────────────────────
//  5. Trích xuất Luồng Stream: getStreams(payload)
// ─────────────────────────────────────────────────────────────
async function getStreams(arg1, title, type, season, episode, proxyBase) {
  let imdbId  = null;
  let tmdbId  = null;
  let slug    = null;
  let year    = null;
  let genres  = null;
  let aliases = [];

  if (typeof arg1 === 'object' && arg1 !== null) {
    imdbId    = arg1.imdbId || null;
    tmdbId    = arg1.tmdbId || null;
    title     = arg1.title || null;
    type      = arg1.type || 'movie';
    year      = arg1.year || null;
    genres    = arg1.genres || null;
    aliases   = Array.isArray(arg1.aliases) ? arg1.aliases : [];
    season    = arg1.season != null ? arg1.season : null;
    episode   = arg1.episode != null ? arg1.episode : null;
    slug      = arg1.slug || null;
    proxyBase = arg1.proxyBase || '';
  } else if (typeof arg1 === 'string') {
    if (/^tt\d+/i.test(arg1)) {
      imdbId = arg1;
    } else {
      slug = arg1;
    }
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

  // Check cached Cinemeta for year if missing
  if (!year && imdbId) {
    const cachedCine = getCachedCinemeta(type, imdbId);
    if (cachedCine?.year) {
      year = cachedCine.year;
    }
    if (!title && cachedCine?.name) {
      title = cachedCine.name;
    }
  }

  try {
    let movieData = null;

    // Bước 1: Tra cứu qua slug nếu có
    if (slug) {
      movieData = await getDetail(slug);
    }

    // Bước 2: Tra cứu trực tiếp IMDb ID
    if (!movieData && imdbId) {
      movieData = await getByImdb(imdbId, title);
    }

    // Bước 3: Tra cứu TMDB ID
    if (!movieData && tmdbId) {
      movieData = await getByTmdb(tmdbId);
    }

    // Bước 4: Fallback tìm kiếm theo canonical title & aliases + match year / season
    if (!movieData && (title || aliases.length > 0)) {
      const searchQueries = [title, ...aliases].filter(Boolean);
      let bestItem = null;
      let bestScore = -1;

      for (const q of searchQueries) {
        const searchRes = await search(q, 1);
        const items = searchRes.items || [];
        for (const item of items) {
          const score = scoreMatch(item, title || q, year, season);
          if (score > bestScore) {
            bestScore = score;
            bestItem = item;
          }
        }
        if (bestScore >= 0.7) break; // High confidence match
      }

      if (bestItem && bestItem.slug && bestScore >= 0.45) {
        movieData = await getDetail(bestItem.slug);
        if (movieData && imdbId) {
          imdbCache.set(`vsmov:imdb:${imdbId.toLowerCase()}`, bestItem.slug, 86400);
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

    // Duyệt qua tất cả các server của VSMOV (Vietsub, Thuyết Minh, Lồng Tiếng, 4K)
    for (let sIdx = 0; sIdx < episodes.length; sIdx++) {
      const server = episodes[sIdx];
      const rawServerName = String(server.server_name || `Server ${sIdx + 1}`)
        .replace(/[\r\n]+/g, ' ')
        .replace(/#/g, '')
        .replace(/\s+/g, ' ')
        .trim();

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

          // 1-based index fallback
          if (!targetEp && !isNaN(epNum) && epNum >= 1 && epNum <= serverData.length) {
            targetEp = serverData[epNum - 1];
          }
        }
      }

      if (!targetEp) continue;

      const masterPlaylistUrl = await resolveMasterPlaylistUrl(targetEp.link_embed, targetEp.link_m3u8);
      if (!masterPlaylistUrl) continue;

      const b64MasterUrl = encodeBase64(masterPlaylistUrl);
      const streamUrl = `${proxyBase || ''}/hls/manifest.m3u8?url=${b64MasterUrl}&ref=${b64Ref}`;
      const epLabel = formatEpisodeLabel(targetEp.name);

      const isTM = /thuy.{1,5}t minh|l.{1,5}ng ti.{1,5}ng/i.test(rawServerName);
      let titleHeader = isTM
        ? `[VIP 1 • VSMOV] Thuyết Minh Full HD${epLabel} (HLS Proxy)`
        : `[VIP 1 • VSMOV] Master 4K Ultra HD (3840x2160)${epLabel} (HLS Proxy)`;

      // STRICT INVARIANT: url only, STRICTLY NO externalUrl
      streams.push({
        name: 'VIP Movies 🎬',
        title: `${titleHeader}\n⚡ Server VIP 1 • Master 4K Ultra HD (3840x2160)`,
        url: streamUrl,
        behaviorHints: {
          notSupported: false,
          bingeGroup: `vsmov-${movie.slug || slug || 'stream'}`,
        },
      });
    }

    return streams;
  } catch (err) {
    console.error(`[VSMOV/getStreams] ${imdbId || title || slug} — error:`, err.message);
    return [];
  }
}

module.exports = {
  id: PROVIDER_ID,
  label: PROVIDER_LABEL,
  search,
  getDetail,
  getByImdb,
  getByTmdb,
  getCatalog,
  getStreams,
};
