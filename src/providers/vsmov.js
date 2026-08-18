'use strict';

/**
 * ============================================================
 *  VIP Movies Addon — src/providers/vsmov.js (Engine v1.5.2)
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
const { resolveCinemeta, getCachedCinemeta } = require('../lib/cinemeta');
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
 * Classify server tab name into distinct audio type (Vietsub, Lồng Tiếng, Thuyết Minh)
 */
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

/**
 * Extract master m3u8 playlist URL and WebVTT/SRT subtitle URL from link_embed or link_m3u8
 */
async function resolveEmbedMedia(linkEmbed, linkM3u8) {
  let masterPlaylistUrl = null;
  let subtitleUrl = null;

  if (linkM3u8 && typeof linkM3u8 === 'string' && linkM3u8.startsWith('http')) {
    masterPlaylistUrl = linkM3u8;
  } else if (linkEmbed && typeof linkEmbed === 'string' && linkEmbed.includes('.m3u8')) {
    masterPlaylistUrl = linkEmbed;
  }

  if (!linkEmbed || typeof linkEmbed !== 'string') {
    return { masterPlaylistUrl, subtitleUrl };
  }

  const cacheKey = `vsmov:embed:${linkEmbed}`;
  const cached = imdbCache.get(cacheKey);
  if (cached && typeof cached === 'object' && cached.masterPlaylistUrl) {
    return cached;
  }

  try {
    const res = await http.get(linkEmbed, {
      timeout: 3000,
    });
    const html = String(res.data);
    let embedOrigin = '';
    try {
      embedOrigin = new URL(linkEmbed).origin;
    } catch {}

    // 1. Extract master m3u8 if not already found
    if (!masterPlaylistUrl) {
      // 1a. Check baseUrl + videoHash
      const mBase = html.match(/baseUrl\s*=\s*["'\x27]([^"'\x27]+)["'\x27]/i);
      const mHash = html.match(/videoHash\s*=\s*["'\x27]([^"'\x27]+)["'\x27]/i);
      if (mBase && mHash) {
        masterPlaylistUrl = `${mBase[1]}/stream/${mHash[1]}/master.m3u8`;
      }

      // 1b. Check quote/backtick URL containing .m3u8
      if (!masterPlaylistUrl) {
        const m = html.match(/(?:["`'\x27\s=:(])(https?:\/\/[^"`'\x27\s()]+\.m3u8[^"`'\x27\s()]*)/i);
        if (m && m[1]) {
          masterPlaylistUrl = m[1];
        }
      }
    }

    // 2. Extract subtitles from playerOptions.subtitles / tracks or html
    const mSub = html.match(/(?:subtitles|tracks)\s*:\s*(\[[^\]]*\])/i);
    if (mSub && mSub[1]) {
      try {
        const parsed = JSON.parse(mSub[1]);
        if (Array.isArray(parsed) && parsed.length > 0) {
          const viSub = parsed.find(
            (s) =>
              s &&
              (s.code === 'vie' ||
                s.code === 'vi' ||
                s.lang === 'vie' ||
                s.lang === 'vi' ||
                (s.name && /vie|tiếng việt|viet/i.test(s.name)) ||
                (s.label && /vie|tiếng việt|viet/i.test(s.label)))
          ) || parsed[0];

          if (viSub && (viSub.url || viSub.file || viSub.src)) {
            subtitleUrl = String(viSub.url || viSub.file || viSub.src).trim();
          }
        }
      } catch {
        const mItems = mSub[1].match(/\{[^}]+\}/g) || [];
        for (const itemStr of mItems) {
          const mUrl = itemStr.match(/(?:url|file|src)\s*:\s*["'\x27]([^"'\x27\s]+)["'\x27]/i);
          const isVie = /vie|tiếng việt|viet/i.test(itemStr);
          if (mUrl && mUrl[1]) {
            if (isVie || !subtitleUrl) {
              subtitleUrl = mUrl[1].trim();
              if (isVie) break;
            }
          }
        }
      }
    }

    // 2b. Fallback regex for subtitle file path
    if (!subtitleUrl) {
      const mSubFile = html.match(/["'\x27](https?:\/\/[^"'\x27\s]+\.(?:vtt|srt)[^"'\x27\s]*)["'\x27]/i)
        || html.match(/["'\x27](\/[^"'\x27\s]+\.(?:vtt|srt)[^"'\x27\s]*)["'\x27]/i);
      if (mSubFile && mSubFile[1]) {
        subtitleUrl = mSubFile[1].trim();
      }
    }

    // Resolve relative subtitle URL to absolute URL
    if (subtitleUrl && !subtitleUrl.startsWith('http://') && !subtitleUrl.startsWith('https://')) {
      if (embedOrigin) {
        try {
          subtitleUrl = new URL(subtitleUrl, embedOrigin).href;
        } catch {
          subtitleUrl = `${embedOrigin}${subtitleUrl.startsWith('/') ? '' : '/'}${subtitleUrl}`;
        }
      }
    }
  } catch (err) {
    console.warn(`[VSMOV/resolveEmbedMedia] Embed parse warning for ${linkEmbed}:`, err.message);
  }

  // Fallback pattern for masterPlaylistUrl
  if (!masterPlaylistUrl && linkEmbed) {
    try {
      const u = new URL(linkEmbed);
      const parts = u.pathname.split('/').filter(Boolean);
      const videoHash = parts[parts.length - 1];
      if (videoHash && videoHash.length >= 8) {
        masterPlaylistUrl = `${u.origin}/stream/${videoHash}/master.m3u8`;
      }
    } catch {}
  }

  const result = { masterPlaylistUrl, subtitleUrl };
  if (masterPlaylistUrl) {
    imdbCache.set(cacheKey, result, 86400);
    imdbCache.set(`vsmov:m3u8:${linkEmbed}`, masterPlaylistUrl, 86400);
  }
  return result;
}

async function resolveMasterPlaylistUrl(linkEmbed, linkM3u8) {
  const { masterPlaylistUrl } = await resolveEmbedMedia(linkEmbed, linkM3u8);
  return masterPlaylistUrl;
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

  // Check cached / async Cinemeta for year, title, aliases if missing
  if (imdbId && (!title || !year || aliases.length === 0)) {
    const cachedCine = getCachedCinemeta(type, imdbId);
    if (cachedCine) {
      if (!year && cachedCine.year) year = cachedCine.year;
      if (!title && cachedCine.name) title = cachedCine.name;
      if (Array.isArray(cachedCine.aliases) && cachedCine.aliases.length > 0) {
        aliases = Array.from(new Set([...aliases, ...cachedCine.aliases]));
      }
    } else {
      const meta = await resolveCinemeta(type, imdbId);
      if (meta) {
        if (!year && meta.year) year = meta.year;
        if (!title && meta.name) title = meta.name;
        if (Array.isArray(meta.aliases) && meta.aliases.length > 0) {
          aliases = Array.from(new Set([...aliases, ...meta.aliases]));
        }
      }
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

      const { masterPlaylistUrl, subtitleUrl } = await resolveEmbedMedia(targetEp.link_embed, targetEp.link_m3u8);
      if (!masterPlaylistUrl) continue;

      const b64MasterUrl = encodeBase64(masterPlaylistUrl);
      let streamUrl = `${proxyBase || ''}/hls/manifest.m3u8?url=${b64MasterUrl}&ref=${b64Ref}`;
      if (subtitleUrl) {
        const b64Sub = encodeBase64(subtitleUrl);
        streamUrl += `&sub=${b64Sub}`;
      }
      const epLabel = formatEpisodeLabel(targetEp.name);

      const audioInfo = classifyServerAudio(rawServerName);

      // STRICT INVARIANT: url only, STRICTLY NO externalUrl
      const streamObj = {
        name: 'VIP Movies 🎬',
        title: `[VIP 1 • VSMOV] ${audioInfo.label} 4K Ultra HD (3840x2160)${epLabel} (HLS Proxy)\n⚡ Server VIP ${audioInfo.label} • vsmov.com`,
        url: streamUrl,
        behaviorHints: {
          notWebReady: false,
          notSupported: false,
          bingeGroup: audioInfo.bingeGroup,
        },
      };

      if (subtitleUrl) {
        const b64Sub = encodeBase64(subtitleUrl);
        const proxySubUrl = `${proxyBase || ''}/hls/sub.vtt?url=${b64Sub}&ref=${b64Ref}`;
        streamObj.subtitles = [
          {
            id: 'vi_vsmov',
            lang: 'vie',
            url: proxySubUrl,
            title: 'Tiếng Việt (VSMOV VIP)',
          },
        ];
      }

      streams.push(streamObj);
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
  classifyServerAudio,
  resolveEmbedMedia,
  resolveMasterPlaylistUrl,
};
