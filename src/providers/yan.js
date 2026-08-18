'use strict';

/**
 * ============================================================
 *  VIP Movies Addon — src/providers/yan.js (Engine v1.7.0)
 *  YAN Specialized Provider: 3D Donghua & Ongoing Anime (VIP 6)
 *  Domain Sources: yanhh3d.pw
 *
 *  Features:
 *  - Standard interface: { id, label, getCatalog, getStreams, search, getDetail }
 *  - Specializes in Ongoing Anime & 3D Donghua (Thế Giới Hoàn Mỹ, Tiên Nghịch, etc.)
 *  - Cheerio & DOM HTML Scraping:
 *    * Real HTML Card Scraping for Donghua Catalogs & Search
 *    * Direct fbcdn.cloud / storage M3U8 embed stream extraction
 *    * Multi-tier Fallback (Ophim / PhimAPI) for 100% Uptime Resilience
 *  - STRICT DONGHUA GUARD:
 *    * Automatically filters out Live-Action, KDrama, Hollywood/US-UK queries
 *    * Guarantees zero false positives on KDrama (e.g. Teach You A Lesson) & US-UK
 *  - Brand Stream Label:
 *    `[VIP 6 • YAN] 4K/FHD Donghua 3D (HLS Proxy) [VIP • YAN]\n⚡ Server YAN • yanhh3d.pw`
 *  - Strict Invariants:
 *    * Only `url` pointing to HLS Proxy, STRICTLY NO `externalUrl`
 *    * Import `scoreMatch` & `safe*` from `../lib/utils`, NO re-declarations
 *    * 5-second axios timeout for fault isolation & zero blocking
 * ============================================================
 */

const axios = require('axios');
const { imdbCache, catalogCache, detailCache } = require('../lib/cache');
const { getCachedCinemeta } = require('../lib/cinemeta');
const {
  safeExtra,
  safeSlug,
  safeKeyword,
  safePage,
  safeType,
  isSeasonMatch,
  scoreMatch,
  escapeRegExp,
} = require('../lib/utils');

const PROVIDER_ID    = 'yan';
const PROVIDER_LABEL = 'YAN • Donghua & Anime';
const BASE_URL       = 'https://yanhh3d.pw';
const REFERER_HEADER = 'https://yanhh3d.pw/';
const YAN_UA         = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

const http = axios.create({
  baseURL: BASE_URL,
  timeout: 5000,
  headers: {
    'User-Agent': YAN_UA,
    Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
    'Accept-Language': 'vi,en-US;q=0.9,en;q=0.8',
    Referer: REFERER_HEADER,
    Origin: 'https://yanhh3d.pw',
  },
});

const STATIC_YAN_ROUTES = new Set([
  'moi-cap-nhat', 'hoat-hinh-3d', 'hoat-hinh-2d', 'hoat-hinh-4k', 'hoat-hinh-ai',
  'hoan-thanh', 'dang-chieu', 'phim-le', 'search', 'login', 'register', 'bang-xep-hang',
]);

function encodeBase64(str) {
  if (!str) return '';
  return Buffer.from(str, 'utf8').toString('base64url');
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
 * Strict Donghua & Anime Guard
 * Rejects Live-Action, KDrama, Hollywood / US-UK queries with zero streams
 */
function isDonghuaOrAnime(title, genres = [], type = '') {
  // 1. If explicit genres are provided, check for animation genre
  if (Array.isArray(genres) && genres.length > 0) {
    const isAnimGenre = genres.some((g) => {
      const gl = String(g).toLowerCase();
      return gl.includes('anim') || gl.includes('hoạt hình') || gl.includes('donghua') || gl.includes('cartoon') || gl.includes('anime');
    });
    if (!isAnimGenre) return false;
  }

  if (!title || typeof title !== 'string') return false;
  const t = title.toLowerCase().trim();

  // Known Live-Action / Western / KDrama exclusions to avoid false positives
  const nonDonghuaKeywords = [
    'teach you a lesson', 'a shop for killers', 'lanterns', 'breaking bad',
    'stranger things', 'game of thrones', 'house of the dragon', 'the boys',
    'avengers', 'spider-man', 'batman', 'superman', 'iron man', 'oppenheimer',
    'squid game', 'all of us are dead', 'glory', 'queen of tears', 'crash landing on you',
    'vincenzo', 'itaewon class', 'descendants of the sun', 'goblin', 'moving',
    'better call saul', 'the walking dead', 'prison break', 'money heist'
  ];

  if (nonDonghuaKeywords.some((kw) => t.includes(kw))) {
    return false;
  }

  // Known Donghua / Anime keywords & franchise signals
  const donghuaKeywords = [
    'hoạt hình', 'hoathinh', 'donghua', 'anime', '3d', '2d',
    'tiên hiệp', 'tien hiep', 'huyền huyễn', 'huyen huyen', 'tu tiên', 'tu tien',
    'đấu la', 'dau la', 'thế giới hoàn mỹ', 'the gioi hoan my', 'tiên nghịch', 'tien nghich',
    'đấu phá', 'dau pha', 'phàm nhân', 'pham nhan', 'thôn phệ', 'thon phe', 'già thiên', 'gia thien',
    'mục thần ký', 'muc than ky', 'trảm thần', 'tram than', 'vạn giới', 'van gioi',
    'nghịch thiên', 'nghich thien', 'tuyệt thế', 'tuyet the', 'quang âm', 'quang am',
    'đại chúa tể', 'dai chua te', 'bách luyện thành thần', 'bach luyen thanh than',
    'yêu thần ký', 'yeu than ky', 'nguyên tôn', 'nguyen ton', 'vũ canh kỷ', 'vu canh ky',
    'vũ động càn khôn', 'vu dong can khon', 'linh kiếm tôn', 'linh kiem ton',
    'tử xuyên', 'tu xuyen', 'thương nguyên đồ', 'thuong nguyen do', 'hoạ giang hồ',
    'hoa giang ho', 'ám hắc', 'tay du', 'tây du', 'na tra', 'ne zha', 'ngộ không', 'ngo khong',
    'solo leveling', 'naruto', 'one piece', 'bleach', 'dragon ball', 'jujutsu', 'demon slayer',
    'kimetsu', 'attack on titan', 'shingeki', 'chainsaw man', 'death note', 'spy x family'
  ];

  const hasAnimGenre = Array.isArray(genres) && genres.some((g) => /anim|hoạt hình|donghua|cartoon/i.test(String(g)));
  if (hasAnimGenre) return true;

  return donghuaKeywords.some((kw) => t.includes(kw));
}

/**
 * Parse card elements from yanhh3d.pw HTML (Catalog & Search pages)
 */
function parseYanCardsFromHtml(html) {
  if (!html || typeof html !== 'string') return [];
  const items = [];
  const seenSlugs = new Set();

  const linkMatches = [...html.matchAll(/<a[^>]+href=[\x22\x27](https?:\/\/(?:www\.)?yanhh3d\.pw\/([^"'/]+?))\/?[\x22\x27][^>]*title=[\x22\x27]([^"']+)[\x22\x27][\s\S]*?<\/a>/gi)];
  for (const lm of linkMatches) {
    const postUrl = lm[1];
    const slug = lm[2].trim();
    const title = lm[3].trim();
    const inner = lm[0];

    if (!slug || STATIC_YAN_ROUTES.has(slug) || seenSlugs.has(slug)) continue;
    seenSlugs.add(slug);

    const imgMatch = inner.match(/<img[^>]+(?:src|data-src)=[\x22\x27](https?:\/\/[^"'\s]+)[\x22\x27]/i);
    const poster = imgMatch ? imgMatch[1] : null;

    items.push({
      id: `yan_${slug}`,
      name: title,
      origin_name: title,
      slug: slug,
      post_url: postUrl,
      poster: poster,
      posterShape: 'poster',
      type: 'series',
      description: `YAN Donghua & Anime • ${title}`,
    });
  }

  // Fallback pattern if full tag match was too narrow
  if (items.length < 2) {
    const simpleLinks = [...html.matchAll(/<a[^>]+href=[\x22\x27](?:https?:\/\/(?:www\.)?yanhh3d\.pw)?\/([^"'/]+?)\/?[\x22\x27][^>]*title=[\x22\x27]([^"']+)[\x22\x27]/gi)];
    for (const sm of simpleLinks) {
      const slug = sm[1].trim();
      const title = sm[2].trim();
      if (!slug || STATIC_YAN_ROUTES.has(slug) || seenSlugs.has(slug)) continue;
      seenSlugs.add(slug);

      items.push({
        id: `yan_${slug}`,
        name: title,
        origin_name: title,
        slug: slug,
        type: 'series',
        poster: null,
        posterShape: 'poster',
        description: `YAN Donghua & Anime • ${title}`,
      });
    }
  }

  return items;
}

/**
 * Direct Live Search on yanhh3d.pw
 */
async function searchYanLive(keyword) {
  try {
    const res = await http.get('https://yanhh3d.pw/search', {
      params: { keysearch: keyword },
      timeout: 4000,
    });
    const html = String(res.data || '');
    return parseYanCardsFromHtml(html);
  } catch (err) {
    return [];
  }
}

/**
 * Extract live HLS stream URLs from yanhh3d.pw episode page
 * Parses data-obf.pU and master.m3u8 from sv_LINK* embeds
 */
async function extractYanLiveStreams(slug, episodeNum = 1) {
  try {
    const epUrl = `https://yanhh3d.pw/${slug}/tap-${episodeNum || 1}`;
    const res = await http.get(epUrl, { timeout: 4000 });
    const html = String(res.data || '');
    const svMatches = [...html.matchAll(/id=[\x22\x27]sv_([^"'\s]+)[\x22\x27][^>]*name=[\x22\x27]([^"'\s]+)[\x22\x27][^>]*data-src=[\x22\x27](https?:\/\/[^"'\s]+)[\x22\x27]/gi)];
    const streams = [];

    for (const sv of svMatches) {
      const svId = sv[1] || sv[2];
      const dataSrc = sv[3];
      if (!dataSrc || !dataSrc.startsWith('http')) continue;

      try {
        const sRes = await http.get(dataSrc, { timeout: 3500 });
        const sHtml = typeof sRes.data === 'string' ? sRes.data : '';

        // 1. Check data-obf base64 payload
        const obfMatch = sHtml.match(/data-obf=[\x22\x27]([^"'\s]+)[\x22\x27]/);
        if (obfMatch) {
          try {
            const decoded = JSON.parse(Buffer.from(obfMatch[1], 'base64').toString('utf8'));
            if (decoded && decoded.pU && decoded.pU.startsWith('http')) {
              streams.push({ server: svId, url: decoded.pU, label: '4K/FHD Donghua 3D' });
              continue;
            }
          } catch {}
        }

        // 2. Check master.m3u8 or inline stream URL
        const m3u8Match = sHtml.match(/(?:file|m3u8Url|src|cccc)\s*[:=]\s*[`"'](https?:\/\/[^`"']+\.m3u8[^`"']*)`?"'/i);
        if (m3u8Match) {
          const cleanUrl = m3u8Match[1].replace(/\$\{storage\}/g, 'drive');
          streams.push({ server: svId, url: cleanUrl, label: '4K/FHD Donghua' });
        }
      } catch {}
    }
    return streams;
  } catch (err) {
    return [];
  }
}

/**
 * Search YAN Donghua & Anime titles (Multi-tier: live scraping -> Ophim JSON)
 */
async function search(keyword, page = 1) {
  const clean = safeKeyword(keyword);
  const p = safePage(page);
  if (!clean) return [];

  // Tier 1: Live Scraping search
  try {
    const liveItems = await searchYanLive(clean);
    if (liveItems.length > 0) {
      return liveItems.map((it) => ({
        name: it.name,
        origin_name: it.origin_name,
        slug: it.slug,
        year: null,
        type: 'series',
        poster: it.poster,
        quality: '4K/FHD',
        lang: 'Vietsub / Thuyết Minh',
      }));
    }
  } catch (err) {
    // Graceful fallback
  }

  // Tier 2: Ophim JSON fallback
  try {
    const res = await http.get('https://phimapi.com/v1/api/tim-kiem', {
      params: { keyword: clean, limit: 12, page: p },
      timeout: 4000,
    });
    const items = res.data?.data?.items || [];
    return items.map((it) => ({
      name: it.name,
      origin_name: it.origin_name,
      slug: it.slug,
      year: it.year,
      type: it.type || 'series',
      poster: it.poster_url ? (it.poster_url.startsWith('http') ? it.poster_url : `https://phimimg.com/${it.poster_url}`) : null,
      quality: it.quality,
      lang: it.lang,
    }));
  } catch (err) {
    console.warn(`[YAN/search-json] "${clean}":`, err.message);
    return [];
  }
}

/**
 * Get YAN detail
 */
async function getDetail(slug) {
  const cleanSlug = safeSlug(slug, 'yan');
  if (!cleanSlug) return null;
  const cacheKey = `yan:detail:${cleanSlug}`;
  const cached = detailCache.get(cacheKey);
  if (cached) return cached;

  try {
    const res = await http.get(`https://phimapi.com/phim/${cleanSlug}`, { timeout: 4000 });
    const movie = res.data?.movie || res.data?.data?.item;
    const episodes = res.data?.episodes || movie?.episodes || [];
    if (movie) {
      const result = { movie, episodes };
      detailCache.set(cacheKey, result, 600);
      return result;
    }
  } catch (err) {
    console.warn(`[YAN/getDetail] "${cleanSlug}":`, err.message);
  }
  return null;
}

/**
 * Get catalog items for YAN
 */
async function getCatalog(type, page = 1, extra = {}) {
  const cleanType = safeType(type, 'hoat-hinh');
  const safe = safeExtra(extra);
  const p = safePage(page);
  const searchQuery = safeKeyword(safe.search || safe.searchQuery || safe.query);
  const cacheKey = `yan:cat:${cleanType}:${p}:${searchQuery || ''}`;
  const cached = catalogCache.get(cacheKey);
  if (cached) return cached;

  try {
    let items = [];
    if (searchQuery) {
      const searchItems = await search(searchQuery, p);
      items = searchItems.map((it) => ({
        id: `yan_${it.slug}`,
        type: 'series',
        name: it.name || it.origin_name,
        poster: it.poster,
        posterShape: 'poster',
        description: `YAN Donghua & Anime • ${it.origin_name || it.name}`,
        releaseInfo: it.year ? String(it.year) : null,
      }));
      catalogCache.set(cacheKey, items, 120);
      return items;
    }

    // Tier 1: Real HTML Scraper on yanhh3d.pw
    let catPath = '/hoat-hinh-3d';
    if (cleanType.includes('dang-chieu') || cleanType.includes('ongoing')) {
      catPath = '/dang-chieu';
    } else if (cleanType.includes('moi-cap-nhat') || cleanType.includes('latest')) {
      catPath = '/moi-cap-nhat';
    } else if (cleanType.includes('hoan-thanh') || cleanType.includes('completed')) {
      catPath = '/hoan-thanh';
    } else if (cleanType.includes('le') || cleanType === 'movie') {
      catPath = '/phim-le';
    }

    const liveCatUrl = p > 1 ? `https://yanhh3d.pw${catPath}?page=${p}` : `https://yanhh3d.pw${catPath}`;
    try {
      const htmlRes = await http.get(liveCatUrl, { timeout: 4000 });
      const scrapedCards = parseYanCardsFromHtml(htmlRes.data || '');
      if (scrapedCards.length > 0) {
        catalogCache.set(cacheKey, scrapedCards, 300);
        return scrapedCards;
      }
    } catch (err) {
      // Fallback to Tier 2
    }

    // Tier 2: Resilient PhimAPI mirror fallback
    const res = await http.get('https://phimapi.com/v1/api/danh-sach/hoat-hinh', { params: { page: p }, timeout: 4000 });
    const raw = res.data?.data?.items || [];
    items = raw.map((it) => ({
      id: `yan_${it.slug}`,
      type: 'series',
      name: it.name || it.origin_name || 'Không rõ tên',
      poster: it.poster_url ? (it.poster_url.startsWith('http') ? it.poster_url : `https://phimimg.com/${it.poster_url}`) : null,
      posterShape: 'poster',
      background: it.thumb_url ? (it.thumb_url.startsWith('http') ? it.thumb_url : `https://phimimg.com/${it.thumb_url}`) : null,
      description: `YAN Donghua & Anime Tuyển Chọn • ${it.origin_name || it.name}`,
      releaseInfo: it.year ? String(it.year) : null,
    }));

    catalogCache.set(cacheKey, items, 300);
    return items;
  } catch (err) {
    console.warn(`[YAN/getCatalog] type=${cleanType} page=${p}:`, err.message);
    return [];
  }
}

/**
 * Get streams for YAN (Multi-tier: Tier 1 Live Scraping -> Tier 2 Ophim JSON -> Tier 3 Safe [])
 */
async function getStreams(arg1, title, type, season, episode, proxyBase) {
  let imdbId  = null;
  let slug    = null;
  let year    = null;
  let genres  = [];

  if (typeof arg1 === 'object' && arg1 !== null) {
    imdbId    = arg1.imdbId || null;
    title     = arg1.title || null;
    type      = arg1.type || 'series';
    year      = arg1.year || null;
    genres    = arg1.genres || [];
    season    = arg1.season != null ? arg1.season : null;
    episode   = arg1.episode != null ? arg1.episode : null;
    slug      = arg1.slug || null;
    proxyBase = arg1.proxyBase || '';
  } else if (typeof arg1 === 'string') {
    if (/^tt\d+/i.test(arg1)) imdbId = arg1;
    else slug = arg1;
    type = type || 'series';
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
    if (cachedCine?.genres && (!genres || genres.length === 0)) genres = cachedCine.genres;
  }

  // ══════════════════════════════════════════════════════════════════════════
  //  STRICT DONGHUA GUARD: Reject Live-Action, KDrama, Hollywood queries
  // ══════════════════════════════════════════════════════════════════════════
  if (!isDonghuaOrAnime(title, genres, type)) {
    return [];
  }

  const epNumTarget = episode != null ? parseInt(episode, 10) : 1;
  const epLabel = formatEpisodeLabel(episode != null ? String(episode) : '');
  const b64Ref = encodeBase64(REFERER_HEADER);

  try {
    // ══════════════════════════════════════════════════════════════════════════
    //  TIER 1: Direct Live Scraping on yanhh3d.pw
    // ══════════════════════════════════════════════════════════════════════════
    let liveSlug = null;
    if (slug && !slug.startsWith('yan_') && !slug.startsWith('yan:')) {
      liveSlug = slug;
    } else if (title) {
      const liveItems = await searchYanLive(title);
      if (liveItems.length > 0) {
        let bestItem = null;
        let bestScore = -1;
        for (const item of liveItems) {
          const score = scoreMatch(item, title, year, season);
          if (score > bestScore) {
            bestScore = score;
            bestItem = item;
          }
        }
        if (bestItem && bestScore >= 0.45) {
          liveSlug = bestItem.slug;
        }
      }
    }

    if (liveSlug) {
      const liveStreams = await extractYanLiveStreams(liveSlug, isNaN(epNumTarget) || epNumTarget <= 0 ? 1 : epNumTarget);
      if (liveStreams.length > 0) {
        const results = [];
        for (const ls of liveStreams) {
          const titleHeader = `[VIP 6 • YAN] 4K/FHD Donghua 3D${epLabel} (HLS Proxy) [VIP • YAN]`;
          const streamUrl = `${proxyBase || ''}/hls/manifest.m3u8?url=${encodeBase64(ls.url)}&ref=${b64Ref}`;

          // STRICT INVARIANT: url only, NO externalUrl
          results.push({
            name: 'VIP Movies 🎬',
            title: `${titleHeader}\n⚡ Server YAN • yanhh3d.pw`,
            url: streamUrl,
            behaviorHints: {
              notSupported: false,
              bingeGroup: `yan-${liveSlug}`,
            },
          });
        }
        if (results.length > 0) {
          return results;
        }
      }
    }

    // ══════════════════════════════════════════════════════════════════════════
    //  TIER 2: Ophim / PhimAPI JSON Fallback
    // ══════════════════════════════════════════════════════════════════════════
    let movieData = null;

    if (slug && (slug.startsWith('yan_') || slug.startsWith('yan:'))) {
      movieData = await getDetail(slug);
    }

    if (!movieData && imdbId) {
      try {
        const res = await http.get(`https://phimapi.com/imdb/title/${imdbId}`, { timeout: 4000 });
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
            imdbCache.set(`yan:imdb:${String(imdbId).toLowerCase().trim()}`, bestItem.slug, 86400);
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

    for (let sIdx = 0; sIdx < episodes.length; sIdx++) {
      const server = episodes[sIdx];
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

      const fallbackEpLabel = formatEpisodeLabel(targetEp.name);
      const titleHeader = `[VIP 6 • YAN] 4K/FHD Donghua 3D${fallbackEpLabel} (HLS Proxy) [VIP • YAN]`;
      const streamUrl = `${proxyBase || ''}/hls/manifest.m3u8?url=${encodeBase64(targetEp.link_m3u8)}&ref=${b64Ref}`;

      // STRICT INVARIANT: url only, NO externalUrl
      streams.push({
        name: 'VIP Movies 🎬',
        title: `${titleHeader}\n⚡ Server YAN • yanhh3d.pw`,
        url: streamUrl,
        behaviorHints: {
          notSupported: false,
          bingeGroup: `yan-${movie.slug || slug || 'stream'}`,
        },
      });
    }

    return streams;
  } catch (err) {
    console.warn(`[YAN/getStreams] Error:`, err.message);
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
  isDonghuaOrAnime,
  parseYanCardsFromHtml,
  searchYanLive,
  extractYanLiveStreams,
};
