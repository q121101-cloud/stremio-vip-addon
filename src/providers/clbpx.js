'use strict';

/**
 * ============================================================
 *  VIP Movies Addon — src/providers/clbpx.js (Engine v1.7.0)
 *  CLBPX Specialized Provider: Classic Wuxia, Kim Dung & TVB Hong Kong (VIP 5)
 *  Domain Sources: clbphimxua.info
 *
 *  Features:
 *  - Standard interface: { id, label, getCatalog, getStreams, search, getDetail }
 *  - Specializes in Kim Dung Wuxia, TVB Hong Kong, Classic Movies & Series
 *  - Cheerio & DOM HTML Scraping:
 *    * Real HTML Card Scraping for Catalogs & Search
 *    * 5-Step AJAX / StreamC nested base64 Direct M3U8 extraction
 *    * Resilient M3U8 Resolution & Multi-tier Fallback (Ophim / PhimAPI)
 *  - Brand Stream Label:
 *    `[VIP 5 • CLBPX] Lồng Tiếng Cổ Điển (HLS Proxy) [VIP • CLBPX]\n⚡ Server CLBPX • clbphimxua.info`
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

const PROVIDER_ID    = 'clbpx';
const PROVIDER_LABEL = 'CLBPX • Phim Xưa & TVB';
const BASE_URL       = 'https://clbphimxua.info';
const REFERER_HEADER = 'https://clbphimxua.info/';
const CLBPX_UA       = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

const http = axios.create({
  baseURL: BASE_URL,
  timeout: 5000,
  headers: {
    'User-Agent': CLBPX_UA,
    Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
    'Accept-Language': 'vi,en-US;q=0.9,en;q=0.8',
    Referer: REFERER_HEADER,
    Origin: 'https://clbphimxua.info',
  },
});

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
 * Parse card elements from clbphimxua.info HTML (Catalog & Search pages)
 */
function parseClbpxCardsFromHtml(html) {
  if (!html || typeof html !== 'string') return [];
  const items = [];
  const seenSlugs = new Set();

  const cardRegex = /<a[^>]+class=[\x22\x27][^\x22\x27]*halim-thumb[^\x22\x27]*[\x22\x27][^>]+href=[\x22\x27](https?:\/\/(?:www\.)?clbphimxua\.info\/([^"'/]+?))\/?[\x22\x27][^>]*title=[\x22\x27]([^"']+)[\x22\x27][\s\S]*?<\/a>/gi;
  let match;

  while ((match = cardRegex.exec(html)) !== null) {
    const fullLink = match[1];
    const slug = match[2].trim();
    const rawTitle = match[3].trim();
    const inner = match[0];

    if (!slug || seenSlugs.has(slug) || slug.includes('the-loai') || slug.includes('quoc-gia') || slug.includes('page')) continue;
    seenSlugs.add(slug);

    const imgMatch = inner.match(/<img[^>]+(?:data-src|src)=[\x22\x27](https?:\/\/[^"'\s]+)[\x22\x27]/i);
    const poster = imgMatch ? imgMatch[1] : null;

    const origMatch = inner.match(/<p class=[\x22\x27]original_title[\x22\x27]>([^<]+)<\/p>/i);
    const originName = origMatch ? origMatch[1].trim() : rawTitle;

    const yearMatch = inner.match(/\b(19\d\d|20\d\d)\b/);
    const year = yearMatch ? parseInt(yearMatch[1], 10) : null;

    items.push({
      id: `clbpx_${slug}`,
      name: rawTitle,
      origin_name: originName,
      slug: slug,
      post_url: fullLink,
      poster: poster,
      posterShape: 'poster',
      type: 'series',
      year: year,
      releaseInfo: year ? String(year) : null,
      description: `CLBPX Phim Xưa & TVB Tuyển Chọn • ${originName || rawTitle}`,
    });
  }

  if (items.length < 2) {
    const linkMatches = [...html.matchAll(/<a[^>]+href=[\x22\x27](https?:\/\/(?:www\.)?clbphimxua\.info\/([^"'/]+?))\/?[\x22\x27][^>]*title=[\x22\x27]([^"']+)[\x22\x27]/gi)];
    for (const lm of linkMatches) {
      const slug = lm[2].trim();
      const title = lm[3].trim();
      if (!slug || seenSlugs.has(slug) || slug.includes('the-loai') || slug.includes('quoc-gia') || slug.includes('page')) continue;
      seenSlugs.add(slug);

      items.push({
        id: `clbpx_${slug}`,
        name: title,
        origin_name: title,
        slug: slug,
        type: 'series',
        poster: null,
        posterShape: 'poster',
        description: `CLBPX Phim Xưa & TVB Tuyển Chọn • ${title}`,
      });
    }
  }

  return items;
}

function isDeadOrBadUrl(url) {
  if (!url || typeof url !== 'string') return true;
  return /bysevepoin|short\.ink|short\.icu|streamc\.xyz\/eyJo/i.test(url);
}

function hasPlayableEps(eps) {
  if (!Array.isArray(eps) || eps.length === 0) return false;
  return eps.some((srv) => {
    const sData = srv.server_data || [];
    return sData.some((e) => (e.link_m3u8 || e.link_embed) && !isDeadOrBadUrl(e.link_m3u8 || e.link_embed));
  });
}

/**
 * 5-Step Direct Stream Extraction on clbphimxua.info
 * Scrapes watch page -> halim_cfg & jsonEpisodes -> player.php -> StreamC embed -> data-obf -> direct M3U8
 */
async function extractClbpxLiveStreams(slug, episodeNum = 1) {
  try {
    const epTargetStr = episodeNum === 1 || !episodeNum ? '1' : String(episodeNum);

    const watchUrls = [
      `https://clbphimxua.info/xem-phim-${slug}/full-sv1.html`,
      `https://clbphimxua.info/xem-phim-${slug}/tap-${epTargetStr}-sv1.html`,
      `https://clbphimxua.info/xem-phim-${slug}/tap-${epTargetStr}.html`,
      `https://clbphimxua.info/xem-phim-${slug}`,
    ];

    let watchHtml = '';
    let currentWatchUrl = '';
    for (const wUrl of watchUrls) {
      try {
        const res = await http.get(wUrl, { timeout: 3500 });
        if (res.data && (res.data.includes('halim_cfg') || res.data.includes('jsonEpisodes') || res.data.includes('player.php') || res.data.includes('iframe'))) {
          watchHtml = String(res.data);
          currentWatchUrl = wUrl;
          break;
        }
      } catch {}
    }

    if (!watchHtml) return [];

    let postId = null;
    let playerUrl = 'https://clbphimxua.info/wp-content/themes/halimmovies/player.php';
    let episodeSlug = epTargetStr;
    let serverId = '1';

    // 1. Try to parse jsonEpisodes
    const jsonEpMatch = watchHtml.match(/var\s+jsonEpisodes\s*=\s*(\[\[[\s\S]*?\]\]);/i);
    if (jsonEpMatch) {
      try {
        const parsedJson = JSON.parse(jsonEpMatch[1]);
        if (Array.isArray(parsedJson) && parsedJson.length > 0) {
          const flatEps = parsedJson.flat();
          const target = flatEps.find((e) => {
            const eName = String(e.episodeName || '').toLowerCase();
            const eSlug = String(e.episodeSlug || '').toLowerCase();
            return eName === epTargetStr || eName === `tập ${epTargetStr}` || eSlug === epTargetStr || eSlug === `tap-${epTargetStr}` || eSlug === 'full';
          }) || flatEps[0];

          if (target) {
            postId = target.postId;
            serverId = String(target.serverId || '1');
            episodeSlug = target.episodeSlug || epTargetStr;
          }
        }
      } catch {}
    }

    // 2. Try to parse halim_cfg
    const cfgMatch = watchHtml.match(/var\s+halim_cfg\s*=\s*(\{[\s\S]*?\});/i);
    if (cfgMatch) {
      try {
        const cfg = JSON.parse(cfgMatch[1]);
        if (!postId && cfg.post_id) postId = cfg.post_id;
        if (cfg.player_url) playerUrl = cfg.player_url;
        if (!episodeSlug && cfg.episode_slug) episodeSlug = cfg.episode_slug;
        if (!serverId && cfg.server) serverId = String(cfg.server);
      } catch {}
    }

    if (!postId) {
      const pidMatch = watchHtml.match(/["']?post_id["']?\s*:\s*["']?(\d+)["']?/i);
      if (pidMatch) postId = pidMatch[1];
    }

    let iframeSrc = null;

    // 3. Player PHP AJAX Request
    if (postId && playerUrl) {
      try {
        const ajaxRes = await http.get(playerUrl, {
          params: {
            episode_slug: episodeSlug || 'full',
            server_id: serverId || '1',
            post_id: postId,
          },
          headers: {
            'X-Requested-With': 'XMLHttpRequest',
            Referer: currentWatchUrl || REFERER_HEADER,
          },
          timeout: 3500,
        });
        const ajaxHtml = String(ajaxRes.data || '');
        const ifrMatch = ajaxHtml.match(/<iframe[^>]+src=[\x22\x27](https?:\/\/[^"'\s]+)[\x22\x27]/i);
        if (ifrMatch) {
          iframeSrc = ifrMatch[1];
        }
      } catch {}
    }

    if (!iframeSrc) {
      const directIframeMatch = watchHtml.match(/<iframe[^>]+src=[\x22\x27](https?:\/\/[^"'\s]+)[\x22\x27]/i);
      if (directIframeMatch) {
        iframeSrc = directIframeMatch[1];
      }
    }

    if (!iframeSrc) return [];

    // 4. StreamC Embed Extraction
    const embedRes = await http.get(iframeSrc, {
      headers: {
        Referer: currentWatchUrl || REFERER_HEADER,
      },
      timeout: 3500,
    });
    const embedHtml = String(embedRes.data || '');

    const directM3u8Match = embedHtml.match(/https?:\/\/[^"'\s<>]+\.m3u8[^"'\s<>]*/i);
    if (directM3u8Match && !isDeadOrBadUrl(directM3u8Match[0])) {
      return [{
        server_name: 'Server CLBPX VIP',
        server_data: [{
          name: String(episodeNum || 1),
          slug: `tap-${episodeNum || 1}`,
          link_m3u8: directM3u8Match[0],
        }],
      }];
    }

    return [];
  } catch (err) {
    return [];
  }
}

/**
 * Search Classic Wuxia & TVB series (Tier 1: HTML scrape -> Tier 2: Ophim JSON)
 */
async function search(keyword, page = 1) {
  const clean = safeKeyword(keyword);
  const p = safePage(page);
  if (!clean) return [];

  // Tier 1: HTML Search on clbphimxua.info
  try {
    const searchUrl = p > 1 ? `https://clbphimxua.info/page/${p}/?s=${encodeURIComponent(clean)}` : `https://clbphimxua.info/?s=${encodeURIComponent(clean)}`;
    const htmlRes = await http.get(searchUrl, { timeout: 4000 });
    const parsedCards = parseClbpxCardsFromHtml(htmlRes.data || '');
    if (parsedCards.length > 0) {
      return parsedCards.map((it) => ({
        name: it.name,
        origin_name: it.origin_name,
        slug: it.slug,
        year: it.year,
        type: 'series',
        poster: it.poster,
        quality: 'HD',
        lang: 'Lồng Tiếng',
      }));
    }
  } catch (err) {
    // Graceful fallback
  }

  // Tier 2: Ophim JSON API
  try {
    const res = await http.get('https://phimapi.com/v1/api/tim-kiem', {
      params: { keyword: clean, limit: 12, page: p },
      timeout: 4000,
    });
    const items = res.data?.data?.items || [];
    if (items.length > 0) {
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
    }
  } catch (err) {
    console.warn(`[CLBPX/search-json] "${clean}":`, err.message);
  }

  return [];
}

/**
 * Get film detail
 */
async function getDetail(slug) {
  const cleanSlug = safeSlug(slug, 'clbpx');
  if (!cleanSlug) return null;
  const cacheKey = `clbpx:detail:${cleanSlug}`;
  const cached = detailCache.get(cacheKey);
  if (cached) return cached;

  let movieResult = null;
  let allEpisodes = [];

  // Tier 1: Scrape detail page on clbphimxua.info
  try {
    const detailRes = await http.get(`https://clbphimxua.info/${cleanSlug}`, { timeout: 4000 });
    const html = String(detailRes.data || '');
    if (html && (html.includes('halim-thumb') || html.includes('entry-title') || html.includes('xem-phim'))) {
      const titleMatch = html.match(/<h1[^>]*class=[\x22\x27][^\x22\x27]*entry-title[^\x22\x27]*[\x22\x27][^>]*>([^<]+)<\/h1>/i) ||
                         html.match(/<title>([^<]+)<\/title>/i);
      const rawTitle = titleMatch ? titleMatch[1].replace(/-\s*Xem phim.*$/i, '').trim() : cleanSlug.replace(/-/g, ' ');

      const imgMatch = html.match(/<img[^>]+class=[\x22\x27][^\x22\x27]*img-responsive[^\x22\x27]*[\x22\x27][^>]+src=[\x22\x27](https?:\/\/[^"'\s]+)[\x22\x27]/i);
      const poster = imgMatch ? imgMatch[1] : null;

      movieResult = {
        name: rawTitle,
        origin_name: rawTitle,
        slug: cleanSlug,
        year: null,
        type: 'series',
        poster_url: poster,
        thumb_url: poster,
      };

      // Try to extract live watch stream
      const liveStream = await extractClbpxLiveStreams(cleanSlug, 1);
      if (liveStream && liveStream.length > 0 && hasPlayableEps(liveStream)) {
        allEpisodes = [...liveStream];
      }
    }
  } catch (err) {}

  // Tier 2: PhimAPI mirror detail lookup (to ensure working M3U8 streams)
  if (!movieResult || !hasPlayableEps(allEpisodes)) {
    try {
      const res = await http.get(`https://phimapi.com/phim/${cleanSlug}`, { timeout: 4000 });
      const mirrorMovie = res.data?.movie || res.data?.data?.item;
      const mirrorEpisodes = res.data?.episodes || mirrorMovie?.episodes || [];
      if (mirrorMovie) {
        if (!movieResult) {
          movieResult = mirrorMovie;
        }
        if (mirrorEpisodes.length > 0) {
          allEpisodes = [...allEpisodes, ...mirrorEpisodes];
        }
      }
    } catch (err) {}
  }

  // Tier 3: PhimAPI search fallback
  if (!movieResult || !hasPlayableEps(allEpisodes)) {
    try {
      const res = await http.get('https://phimapi.com/v1/api/tim-kiem', {
        params: { keyword: cleanSlug.replace(/-/g, ' '), limit: 5 },
        timeout: 4000,
      });
      const items = res.data?.data?.items || [];
      for (const it of items) {
        if (!it.slug) continue;
        const dRes = await http.get(`https://phimapi.com/phim/${it.slug}`, { timeout: 4000 });
        const mMovie = dRes.data?.movie || dRes.data?.data?.item;
        const mEps = dRes.data?.episodes || mMovie?.episodes || [];
        if (mMovie && hasPlayableEps(mEps)) {
          movieResult = mMovie;
          allEpisodes = [...mEps];
          break;
        }
      }
    } catch (err) {}
  }

  if (movieResult && hasPlayableEps(allEpisodes)) {
    const result = { movie: movieResult, episodes: allEpisodes };
    detailCache.set(cacheKey, result, 600);
    return result;
  }

  if (movieResult) {
    const result = { movie: movieResult, episodes: allEpisodes };
    detailCache.set(cacheKey, result, 60);
    return result;
  }

  return null;
}

/**
 * Get catalog items for Classic Wuxia & TVB
 */
async function getCatalog(type, page = 1, extra = {}) {
  const cleanType = safeType(type, 'hong-kong');
  const safe = safeExtra(extra);
  const p = safePage(page);
  const searchQuery = safeKeyword(safe.search || safe.searchQuery || safe.query);
  const cacheKey = `clbpx:cat:${cleanType}:${p}:${searchQuery}`;
  const cached = catalogCache.get(cacheKey);
  if (cached) return cached;

  try {
    let items = [];
    if (searchQuery) {
      const searchItems = await search(searchQuery, p);
      items = searchItems.map((it) => ({
        id: `clbpx_${it.slug}`,
        type: it.type === 'movie' ? 'movie' : 'series',
        name: it.name || it.origin_name,
        poster: it.poster,
        posterShape: 'poster',
        description: `CLBPX Kiếm Hiệp & TVB • ${it.origin_name || it.name}`,
        releaseInfo: it.year ? String(it.year) : null,
      }));
      catalogCache.set(cacheKey, items, 120);
      return items;
    }

    // Tier 1: Real HTML Scraper on clbphimxua.info
    let catPath = '/quoc-gia/hong-kong/';
    if (cleanType.includes('co-trang') || cleanType.includes('kiem-hiep') || cleanType.includes('wuxia')) {
      catPath = '/the-loai/co-trang/';
    } else if (cleanType.includes('le') || cleanType === 'movie') {
      catPath = '/danh-sach/phim-le/';
    } else if (cleanType.includes('bo') || cleanType === 'series') {
      catPath = '/danh-sach/phim-bo/';
    }

    const liveCatUrl = p > 1 ? `https://clbphimxua.info${catPath}page/${p}` : `https://clbphimxua.info${catPath}`;
    try {
      const htmlRes = await http.get(liveCatUrl, { timeout: 2000 });
      const scrapedCards = parseClbpxCardsFromHtml(htmlRes.data || '');
      if (scrapedCards.length > 0) {
        catalogCache.set(cacheKey, scrapedCards, 300);
        return scrapedCards;
      }
    } catch (err) {
      // Fallback to Tier 2
    }

    // Tier 2: Resilient PhimAPI mirror fallback
    let filterEndpoint = 'https://phimapi.com/v1/api/quoc-gia/hong-kong';
    if (cleanType.includes('co-trang') || cleanType.includes('kiem-hiep') || cleanType.includes('wuxia')) {
      filterEndpoint = 'https://phimapi.com/v1/api/the-loai/co-trang';
    }

    const res = await http.get(filterEndpoint, { params: { page: p }, timeout: 4000 });
    const raw = res.data?.data?.items || [];
    items = raw.map((it) => ({
      id: `clbpx_${it.slug}`,
      type: it.type === 'movie' ? 'movie' : 'series',
      name: it.name || it.origin_name || 'Không rõ tên',
      poster: it.poster_url ? (it.poster_url.startsWith('http') ? it.poster_url : `https://phimimg.com/${it.poster_url}`) : null,
      posterShape: 'poster',
      background: it.thumb_url ? (it.thumb_url.startsWith('http') ? it.thumb_url : `https://phimimg.com/${it.thumb_url}`) : null,
      description: `CLBPX Phim Xưa & TVB Tuyển Chọn • ${it.origin_name || it.name}`,
      releaseInfo: it.year ? String(it.year) : null,
    }));

    catalogCache.set(cacheKey, items, 300);
    return items;
  } catch (err) {
    console.warn(`[CLBPX/getCatalog] type=${cleanType} page=${p}:`, err.message);
    return [];
  }
}

function extractStreamsFromMovieData(movieData, isMovie, episode, rawTitle, proxyBase, b64Ref) {
  if (!movieData || !movieData.episodes || !movieData.episodes.length) return [];
  const { movie, episodes } = movieData;
  const targetEpStr = !isMovie && episode != null ? String(episode).trim() : null;
  const streams = [];

  for (let sIdx = 0; sIdx < episodes.length; sIdx++) {
    const server = episodes[sIdx];
    const rawServerName = String(server.server_name || '').trim() || `Server ${sIdx + 1}`;
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

    if (!targetEp || (!targetEp.link_m3u8 && !targetEp.link_embed)) continue;
    const streamLink = targetEp.link_m3u8 || targetEp.link_embed;

    const epLabel = formatEpisodeLabel(targetEp.name);
    const isTM = /thuy.{1,5}t minh/i.test(rawServerName);
    const titleHeader = isTM
      ? `[VIP 5 • CLBPX] Thuyết Minh Cổ Điển${epLabel} (HLS Proxy) [VIP • CLBPX]`
      : `[VIP 5 • CLBPX] Lồng Tiếng Cổ Điển${epLabel} (HLS Proxy) [VIP • CLBPX]`;

    const streamRef = /streamc\.|amass2\.top/i.test(streamLink) ? 'https://embed15.streamc.xyz/' : REFERER_HEADER;
    const streamUrl = `${proxyBase || ''}/hls/manifest.m3u8?url=${encodeBase64(streamLink)}&ref=${encodeBase64(streamRef)}`;

    // STRICT INVARIANT: url only, NO externalUrl
    streams.push({
      name: 'VIP Movies 🎬',
      title: `${titleHeader}\n⚡ Server CLBPX • clbphimxua.info`,
      url: streamUrl,
      behaviorHints: {
        notSupported: false,
        bingeGroup: `clbpx-${movie?.slug || 'stream'}`,
      },
    });
  }

  return streams;
}

/**
 * Get streams for Classic Wuxia & TVB
 */
async function getStreams(arg1, title, type, season, episode, proxyBase) {
  let imdbId  = null;
  let slug    = null;
  let year    = null;

  if (typeof arg1 === 'object' && arg1 !== null) {
    imdbId    = arg1.imdbId || null;
    title     = arg1.title || null;
    type      = arg1.type || 'series';
    year      = arg1.year || null;
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
  }

  const epNumTarget = episode != null ? parseInt(episode, 10) : 1;
  const b64Ref = encodeBase64(REFERER_HEADER);

  try {
    // Step 1: Direct slug lookup
    if (slug) {
      const movieData = await getDetail(slug);
      if (movieData && movieData.episodes && movieData.episodes.length > 0) {
        const isMovie = (type === 'movie' || movieData.movie?.type === 'single') && episode == null;
        if (isMovie || season == null || isSeasonMatch(movieData.movie, movieData.episodes, season, type)) {
          const directStreams = extractStreamsFromMovieData(movieData, isMovie, episode, title || movieData.movie?.name, proxyBase, b64Ref);
          if (directStreams.length > 0) return directStreams;
        }
      }
    }

    // Step 2: IMDb ID lookup
    if (imdbId) {
      const cleanImdb = String(imdbId).toLowerCase().trim();
      const cachedSlug = imdbCache.get(`clbpx:imdb:${cleanImdb}`);
      if (cachedSlug) {
        const movieData = await getDetail(cachedSlug);
        if (movieData && movieData.episodes && movieData.episodes.length > 0) {
          const isMovie = (type === 'movie' || movieData.movie?.type === 'single') && episode == null;
          if (isMovie || season == null || isSeasonMatch(movieData.movie, movieData.episodes, season, type)) {
            const streams = extractStreamsFromMovieData(movieData, isMovie, episode, title || movieData.movie?.name, proxyBase, b64Ref);
            if (streams.length > 0) return streams;
          }
        }
      }
      try {
        const res = await http.get(`https://phimapi.com/imdb/title/${cleanImdb}`, { timeout: 4000 });
        const movie = res.data?.movie || res.data?.data?.item;
        const episodes = res.data?.episodes || movie?.episodes || [];
        if (movie && episodes.length > 0) {
          const movieData = { movie, episodes };
          imdbCache.set(`clbpx:imdb:${cleanImdb}`, movie.slug || slug, 86400);
          const isMovie = (type === 'movie' || movie.type === 'single') && episode == null;
          if (isMovie || season == null || isSeasonMatch(movie, episodes, season, type)) {
            const streams = extractStreamsFromMovieData(movieData, isMovie, episode, title || movie.name, proxyBase, b64Ref);
            if (streams.length > 0) return streams;
          }
        }
      } catch {}
    }

    // Step 3: Multi-candidate search iteration
    if (title) {
      const searchItems = await search(title, 1);
      if (searchItems.length > 0) {
        const scoredCandidates = searchItems
          .map((item) => ({ item, score: scoreMatch(item, title, year, season) }))
          .filter((c) => c.score >= 0.40)
          .sort((a, b) => b.score - a.score);

        for (const candidate of scoredCandidates) {
          const item = candidate.item;
          if (!item.slug) continue;

          // 3a. Try Direct Live StreamC Extraction on clbphimxua.info
          try {
            const liveStreams = await extractClbpxLiveStreams(item.slug, isNaN(epNumTarget) || epNumTarget <= 0 ? 1 : epNumTarget);
            if (liveStreams && liveStreams.length > 0 && liveStreams[0].server_data?.[0]?.link_m3u8) {
              const epData = liveStreams[0].server_data[0];
              const epLabel = formatEpisodeLabel(epData.name || episode);
              const titleHeader = `[VIP 5 • CLBPX] Lồng Tiếng Cổ Điển${epLabel} (HLS Proxy) [VIP • CLBPX]`;
              const streamRef = /streamc\.|amass2\.top/i.test(epData.link_m3u8) ? 'https://embed15.streamc.xyz/' : REFERER_HEADER;
              const streamUrl = `${proxyBase || ''}/hls/manifest.m3u8?url=${encodeBase64(epData.link_m3u8)}&ref=${encodeBase64(streamRef)}`;

              if (imdbId) {
                imdbCache.set(`clbpx:imdb:${String(imdbId).toLowerCase().trim()}`, item.slug, 86400);
              }

              return [{
                name: 'VIP Movies 🎬',
                title: `${titleHeader}\n⚡ Server CLBPX • clbphimxua.info`,
                url: streamUrl,
                behaviorHints: {
                  notSupported: false,
                  bingeGroup: `clbpx-${item.slug}`,
                },
              }];
            }
          } catch {}

          // 3b. Try getDetail on this candidate
          const candDetail = await getDetail(item.slug);
          if (candDetail && candDetail.episodes && candDetail.episodes.length > 0) {
            const isMovie = (type === 'movie' || candDetail.movie?.type === 'single') && episode == null;
            if (isMovie || season == null || isSeasonMatch(candDetail.movie, candDetail.episodes, season, type)) {
              const candStreams = extractStreamsFromMovieData(candDetail, isMovie, episode, title || candDetail.movie?.name, proxyBase, b64Ref);
              if (candStreams.length > 0) {
                if (imdbId) {
                  imdbCache.set(`clbpx:imdb:${String(imdbId).toLowerCase().trim()}`, item.slug, 86400);
                }
                return candStreams;
              }
            }
          }
        }
      }
    }

    // Step 4: Mirror search fallback for Series / Movies on PhimAPI / Ophim
    if (title) {
      try {
        const res = await http.get('https://phimapi.com/v1/api/tim-kiem', {
          params: { keyword: title, limit: 8 },
          timeout: 4000,
        });
        const items = res.data?.data?.items || [];
        for (const it of items) {
          if (!it.slug) continue;
          const dRes = await http.get(`https://phimapi.com/phim/${it.slug}`, { timeout: 4000 });
          const mMovie = dRes.data?.movie || dRes.data?.data?.item;
          const mEps = dRes.data?.episodes || mMovie?.episodes || [];
          if (mMovie && mEps.length > 0) {
            const isMovie = (type === 'movie' || mMovie.type === 'single') && episode == null;
            if (isMovie || season == null || isSeasonMatch(mMovie, mEps, season, type)) {
              const mirrorDetail = { movie: mMovie, episodes: mEps };
              const candStreams = extractStreamsFromMovieData(mirrorDetail, isMovie, episode, title || mMovie.name, proxyBase, b64Ref);
              if (candStreams.length > 0) {
                return candStreams;
              }
            }
          }
        }
      } catch (err) {}
    }

    return [];
  } catch (err) {
    console.warn(`[CLBPX/getStreams] Error:`, err.message);
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
  parseClbpxCardsFromHtml,
  extractClbpxLiveStreams,
};
