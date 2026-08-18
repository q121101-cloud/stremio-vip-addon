'use strict';

/**
 * ============================================================
 *  VIP Movies Addon — src/providers/stp.js (Engine v1.7.0)
 *  STP Specialized Provider: Western Cinema & K-Drama (VIP 4)
 *  Live Domain: sieutamphim.pro
 *
 *  Features:
 *  - Official Domain: https://sieutamphim.pro
 *  - Referer Header: https://sieutamphim.pro/
 *  - Origin Header: https://sieutamphim.pro
 *  - Cheerio & DOM HTML Scraping:
 *    * Real HTML Card Scraping for Catalogs & Search
 *    * HTML Episode Group parsing & XOR 0x2a Stream Deobfuscation
 *    * Resilient M3U8 Resolution & Multi-tier Fallback (Ophim / PhimAPI)
 *  - Brand Stream Label:
 *    `[VIP 4 • STP] Thuyết Minh HD (HLS Proxy) [VIP • STP]\n⚡ Server STP • sieutamphim.pro`
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

const PROVIDER_ID    = 'stp';
const PROVIDER_LABEL = 'STP • sieutamphim.pro';
const BASE_URL       = 'https://sieutamphim.pro';
const REFERER_HEADER = 'https://sieutamphim.pro/';
const STP_UA         = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

const http = axios.create({
  baseURL: BASE_URL,
  timeout: 5000,
  headers: {
    'User-Agent': STP_UA,
    Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
    'Accept-Language': 'vi,en-US;q=0.9,en;q=0.8',
    Referer: REFERER_HEADER,
    Origin: 'https://sieutamphim.pro',
  },
});

function encodeBase64(str) {
  if (!str) return '';
  return Buffer.from(str, 'utf8').toString('base64url');
}

/**
 * Decode XOR 0x2a obfuscated stream strings from sieutamphim.pro
 */
function decodeXor0x2a(str, key = 0x2a) {
  if (!str || typeof str !== 'string') return '';
  let out = '';
  for (let i = 0; i < str.length; i++) {
    out += String.fromCharCode(str.charCodeAt(i) ^ key);
  }
  return out;
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

function classifyAudioType(rawServerName, titleName = '') {
  const combined = `${rawServerName || ''} ${titleName || ''}`;
  if (/long\s*tieng|l.{1,5}ng\s*ti.{1,5}ng/i.test(combined)) {
    return {
      label: 'Lồng Tiếng HD',
      audioKey: 'longtieng',
    };
  }
  if (/vietsub|phu\s*de|ph\u1EE5\s*\u0111\u1EC1/i.test(combined)) {
    return {
      label: 'Vietsub HD',
      audioKey: 'vietsub',
    };
  }
  return {
    label: 'Thuyết Minh HD',
    audioKey: 'thuyetminh',
  };
}

/**
 * Parse card elements from sieutamphim.pro HTML (Catalog & Search pages)
 */
function parseStpCardsFromHtml(html) {
  if (!html || typeof html !== 'string') return [];
  const items = [];
  const seenSlugs = new Set();

  const cardRegex = /<div[^>]*class=[\x22\x27][^\x22\x27]*post-item[^\x22\x27]*[\x22\x27][\s\S]*?<\/div>\s*<\/div>\s*<\/div>/gi;
  const cardMatches = html.match(cardRegex) || [];

  for (const block of cardMatches) {
    const linkMatch = block.match(/href=[\x22\x27](https?:\/\/(?:www\.)?sieutamphim\.pro\/[^"'\s]+)[\x22\x27]/i);
    const postUrl = linkMatch ? linkMatch[1] : null;
    if (!postUrl || postUrl.includes('/the-loai/') || postUrl.includes('/category/') || postUrl.includes('/page/')) continue;

    const slugMatch = postUrl.match(/\/([^/]+?)(?:\.html)?\/?$/);
    const slug = slugMatch ? slugMatch[1].replace(/\.html$/, '') : null;
    if (!slug || seenSlugs.has(slug)) continue;
    seenSlugs.add(slug);

    const titleMatch = block.match(/<h5[^>]*class=[\x22\x27][^\x22\x27]*post-title[^\x22\x27]*[\x22\x27][^>]*>\s*<a[^>]*>([^<]+)<\/a>/i) ||
                       block.match(/aria-label=[\x22\x27]([^"']+)[\x22\x27]/i) ||
                       block.match(/title=[\x22\x27]([^"']+)[\x22\x27]/i);
    const rawTitle = titleMatch ? titleMatch[1].trim() : slug.replace(/-/g, ' ');

    const imgMatch = block.match(/<img[^>]+(?:data-src|src)=[\x22\x27](https?:\/\/[^"'\s]+)[\x22\x27]/i);
    const poster = imgMatch ? imgMatch[1] : null;

    const yearMatch = block.match(/\b(19\d\d|20\d\d)\b/);
    const year = yearMatch ? parseInt(yearMatch[1], 10) : null;

    const cleanTitle = rawTitle.replace(/\s*&#8211;.*$/i, '').replace(/\s*-\s*Status:.*$/i, '').trim();

    items.push({
      id: `stp_${slug}`,
      name: cleanTitle || rawTitle,
      origin_name: cleanTitle || rawTitle,
      slug: slug,
      post_url: postUrl,
      poster: poster,
      posterShape: 'poster',
      type: 'movie',
      year: year,
      releaseInfo: year ? String(year) : null,
      description: `STP Western & K-Drama • ${cleanTitle || rawTitle}`,
    });
  }

  if (items.length < 2) {
    const linkMatches = [...html.matchAll(/<a[^>]+href=[\x22\x27](https?:\/\/(?:www\.)?sieutamphim\.pro\/\d{4}\/\d{2}\/([^"'/]+?)(?:\.html)?[\x22\x27])[^>]*>([\s\S]*?)<\/a>/gi)];
    for (const lm of linkMatches) {
      const postUrl = lm[1];
      const slug = lm[2];
      if (!slug || seenSlugs.has(slug)) continue;
      seenSlugs.add(slug);

      const inner = lm[3];
      const imgMatch = inner.match(/<img[^>]+(?:src|data-src)=[\x22\x27]([^"']+)[\x22\x27]/i);
      const poster = imgMatch ? imgMatch[1] : null;
      const titleMatch = inner.match(/<h\d[^>]*>([^<]+)<\/h\d>/i) || lm[0].match(/title=[\x22\x27]([^"']+)[\x22\x27]/i);
      const title = titleMatch ? titleMatch[1].trim() : slug.replace(/-/g, ' ');

      items.push({
        id: `stp_${slug}`,
        name: title,
        origin_name: title,
        slug: slug,
        post_url: postUrl,
        poster: poster,
        posterShape: 'poster',
        type: 'movie',
        description: `STP Western & K-Drama • ${title}`,
      });
    }
  }

  return items;
}

/**
 * Helper to check for dead / unplayable embed & shortlink domains
 */
function isDeadOrBadUrl(url) {
  if (!url || typeof url !== 'string') return true;
  const lower = url.toLowerCase();
  return lower.includes('short.icu') || lower.includes('short.ink') || lower.includes('bysevepoin.com') || lower.includes('bysevepoin');
}

/**
 * Parse WordPress rendered HTML content into structured movie & episode groups
 */
function parsePostContent(html, postTitle = '') {
  if (!html || typeof html !== 'string') return { name: postTitle, origin_name: null, year: null, episodes: [] };

  const nameMatch = html.match(/Tên Phim\s*:\s*([^<\r\n]+)/i);
  const originMatch = html.match(/Tựa Gốc\s*:\s*([^<\r\n]+)/i);
  const yearMatch = (originMatch ? originMatch[1] : html).match(/\b(19\d\d|20\d\d)\b/) || postTitle.match(/\b(19\d\d|20\d\d)\b/);

  const cleanName = nameMatch ? nameMatch[1].trim() : postTitle.replace(/\s*&#8211;.*$/i, '').replace(/\s*-\s*Status:.*$/i, '').trim();
  const cleanOrigin = originMatch ? originMatch[1].replace(/\(\d{4}\)/, '').trim() : null;
  const parsedYear = yearMatch ? parseInt(yearMatch[1], 10) : null;

  const groups = [];
  const divMatches = [...html.matchAll(/<div[^>]*class=[\x22\x27][^\x22\x27]*episodeGroup[^\x22\x27]*[\x22\x27][^>]*>/gis)];

  for (let gIdx = 0; gIdx < divMatches.length; gIdx++) {
    const divTag = divMatches[gIdx][0];
    const srvMatch = divTag.match(/data-server=[\x22\x27]([^\x22\x27]*)[\x22\x27]/i);
    const srvName = srvMatch ? srvMatch[1].trim() : `Server ${gIdx + 1}`;

    const epsAttrMatch = divTag.match(/data-episodes=(?:\x27([\s\S]*?)\x27|\x22([\s\S]*?)\x22)/i);
    const epsRaw = epsAttrMatch ? (epsAttrMatch[1] || epsAttrMatch[2] || '') : '';
    const eps = [];
    const epMatches = [...epsRaw.matchAll(/\{\s*[\x22\x27]([^\x22\x27]+)[\x22\x27]\s*,\s*[\x22\x27]([^\x22\x27]+)[\x22\x27]\s*\}/g)];

    for (let eIdx = 0; eIdx < epMatches.length; eIdx++) {
      const encUrl = epMatches[eIdx][1].trim();
      const epName = epMatches[eIdx][2].trim();
      const decodedUrl = decodeXor0x2a(encUrl);
      if (decodedUrl && (decodedUrl.startsWith('http://') || decodedUrl.startsWith('https://'))) {
        // Exclude unresolvable / expired shortlink domains
        if (!isDeadOrBadUrl(decodedUrl)) {
          eps.push({
            name: epName,
            slug: `tap-${epName}`,
            link_m3u8: decodedUrl,
            link_embed: decodedUrl,
          });
        }
      }
    }

    if (eps.length > 0) {
      groups.push({
        server_name: srvName,
        server_data: eps,
      });
    }
  }

  if (groups.length === 0) {
    const iframeMatch = html.match(/<iframe[^>]+src=[\x22\x27](https?:\/\/[^"'\s]+)[\x22\x27]/i);
    if (iframeMatch && !isDeadOrBadUrl(iframeMatch[1])) {
      groups.push({
        server_name: 'Server VIP',
        server_data: [{
          name: 'Full',
          slug: 'full',
          link_m3u8: iframeMatch[1],
          link_embed: iframeMatch[1],
        }],
      });
    }
  }

  return {
    name: cleanName,
    origin_name: cleanOrigin,
    year: parsedYear,
    episodes: groups,
  };
}

/**
 * 1. Search STP repository & mirrors
 */
async function search(keyword, page = 1) {
  const clean = safeKeyword(keyword);
  const p = safePage(page);
  if (!clean) return [];

  // Tier 1: sieutamphim.pro HTML Search Scraper
  try {
    const searchUrl = p > 1 ? `https://sieutamphim.pro/page/${p}/?s=${encodeURIComponent(clean)}` : `https://sieutamphim.pro/?s=${encodeURIComponent(clean)}`;
    const htmlRes = await http.get(searchUrl, { timeout: 4000 });
    const parsedCards = parseStpCardsFromHtml(htmlRes.data || '');
    if (parsedCards.length > 0) {
      return parsedCards.map((it) => ({
        name: it.name,
        origin_name: it.origin_name,
        slug: it.slug,
        year: it.year,
        type: it.type || 'movie',
        poster: it.poster,
        quality: 'HD',
        lang: 'Thuyết Minh',
        post_url: it.post_url,
      }));
    }
  } catch (err) {
    // Graceful fallback
  }

  // Tier 2: sieutamphim.pro WP-JSON REST API
  try {
    const res = await http.get('/wp-json/wp/v2/posts', {
      params: { search: clean, per_page: 10, page: p, _embed: true },
      timeout: 4000,
    });
    const posts = Array.isArray(res.data) ? res.data : [];
    if (posts.length > 0) {
      return posts.map((post) => {
        const parsed = parsePostContent(post.content?.rendered || '', post.title?.rendered || '');
        const posterUrl = post._embedded?.['wp:featuredmedia']?.[0]?.source_url || null;
        return {
          name: parsed.name || post.title?.rendered,
          origin_name: parsed.origin_name || null,
          slug: post.slug,
          year: parsed.year,
          type: parsed.episodes.length > 1 || (parsed.episodes[0]?.server_data?.length > 1) ? 'series' : 'movie',
          poster: posterUrl,
          quality: 'HD',
          lang: 'Thuyết Minh',
          id: post.id,
        };
      });
    }
  } catch (err) {
    // Graceful fallback
  }

  // Tier 3: Resilient PhimAPI mirror fallback
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
 * 2. Get film detail
 */
async function getDetail(slug) {
  const cleanSlug = safeSlug(slug, 'stp');
  if (!cleanSlug) return null;
  const cacheKey = `stp:detail:${cleanSlug}`;
  const cached = detailCache.get(cacheKey);
  if (cached) return cached;

  let movieResult = null;
  let allEpisodes = [];

  const hasPlayableEps = (eps) => {
    if (!Array.isArray(eps) || eps.length === 0) return false;
    return eps.some((srv) => {
      const sData = srv.server_data || [];
      return sData.some((e) => (e.link_m3u8 || e.link_embed) && !isDeadOrBadUrl(e.link_m3u8 || e.link_embed));
    });
  };

  // Tier 1: HTML Post Page Scraping on sieutamphim.pro
  try {
    const directRes = await http.get(`https://sieutamphim.pro/${cleanSlug}.html`, { timeout: 4000 }).catch(() => null);
    const htmlData = directRes?.data || '';
    if (htmlData && htmlData.includes('episodeGroup')) {
      const parsed = parsePostContent(htmlData, cleanSlug.replace(/-/g, ' '));
      if (parsed.episodes && hasPlayableEps(parsed.episodes)) {
        movieResult = {
          name: parsed.name || cleanSlug.replace(/-/g, ' '),
          origin_name: parsed.origin_name || null,
          slug: cleanSlug,
          year: parsed.year,
          type: parsed.episodes.length > 1 || (parsed.episodes[0]?.server_data?.length > 1) ? 'series' : 'single',
          poster_url: null,
          thumb_url: null,
        };
        allEpisodes = [...parsed.episodes];
      }
    }
  } catch (err) {}

  // Tier 2: WP-JSON slug lookup
  if (!movieResult || !hasPlayableEps(allEpisodes)) {
    try {
      const res = await http.get('/wp-json/wp/v2/posts', {
        params: { slug: cleanSlug, _embed: true },
        timeout: 4000,
      });
      if (Array.isArray(res.data) && res.data.length > 0) {
        const post = res.data[0];
        const parsed = parsePostContent(post.content?.rendered || '', post.title?.rendered || '');
        if (parsed.episodes && hasPlayableEps(parsed.episodes)) {
          const posterUrl = post._embedded?.['wp:featuredmedia']?.[0]?.source_url || null;

          movieResult = {
            name: parsed.name || post.title?.rendered,
            origin_name: parsed.origin_name || null,
            slug: post.slug,
            year: parsed.year,
            type: parsed.episodes.length > 1 || (parsed.episodes[0]?.server_data?.length > 1) ? 'series' : 'single',
            poster_url: posterUrl,
            thumb_url: posterUrl,
          };
          allEpisodes = [...parsed.episodes];
        }
      }
    } catch (err) {}
  }

  // Tier 3: PhimAPI mirror detail lookup (to ensure working M3U8 streams)
  if (!movieResult || !hasPlayableEps(allEpisodes)) {
    try {
      const res = await http.get(`https://phimapi.com/phim/${cleanSlug}`, { timeout: 4000 });
      const mirrorMovie = res.data?.movie || res.data?.data?.item;
      const mirrorEpisodes = res.data?.episodes || mirrorMovie?.episodes || [];
      if (mirrorMovie && hasPlayableEps(mirrorEpisodes)) {
        movieResult = mirrorMovie;
        allEpisodes = [...mirrorEpisodes];
      }
    } catch (err) {}
  }

  // Tier 4: PhimAPI keyword search fallback
  if (!movieResult || !hasPlayableEps(allEpisodes)) {
    try {
      const searchRes = await http.get('https://phimapi.com/v1/api/tim-kiem', {
        params: { keyword: cleanSlug.replace(/-/g, ' '), limit: 5 },
        timeout: 4000,
      });
      const sItems = searchRes.data?.data?.items || [];
      for (const sItem of sItems) {
        if (!sItem.slug) continue;
        const dRes = await http.get(`https://phimapi.com/phim/${sItem.slug}`, { timeout: 4000 });
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

  if (movieResult && allEpisodes.length > 0) {
    const result = { movie: movieResult, episodes: allEpisodes };
    detailCache.set(cacheKey, result, 600);
    return result;
  }

  return null;
}

/**
 * 3. Get catalog items for Western Cinema & K-Drama
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

    // Tier 1: Real HTML Scraper on sieutamphim.pro category pages
    let categoryPath = '/the-loai/phim-au-my/';
    if (cleanType.includes('han') || cleanType.includes('korea') || cleanType.includes('k-drama')) {
      categoryPath = '/the-loai/phim-han-quoc/';
    } else if (cleanType.includes('bo') || cleanType === 'series') {
      categoryPath = '/the-loai/phim-bo/';
    } else if (cleanType.includes('le') || cleanType === 'movie') {
      categoryPath = '/the-loai/phim-le/';
    }

    const liveCatUrl = p > 1 ? `https://sieutamphim.pro${categoryPath}page/${p}/` : `https://sieutamphim.pro${categoryPath}`;
    try {
      const htmlRes = await http.get(liveCatUrl, { timeout: 4000 });
      const scrapedCards = parseStpCardsFromHtml(htmlRes.data || '');
      if (scrapedCards.length > 0) {
        catalogCache.set(cacheKey, scrapedCards, 300);
        return scrapedCards;
      }
    } catch (err) {
      // Fallback to Tier 2
    }

    // Tier 2: Resilient PhimAPI mirror fallback
    let countrySlug = 'au-my';
    if (cleanType.includes('han') || cleanType.includes('korea') || cleanType.includes('k-drama')) {
      countrySlug = 'han-quoc';
    }

    const res = await http.get(`https://phimapi.com/v1/api/quoc-gia/${countrySlug}`, { params: { page: p }, timeout: 4000 });
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
 * 4. Get streams for Western Cinema & K-Drama (VIP 4 STP)
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

    // Step 1: Lookup via slug
    if (slug) {
      movieData = await getDetail(slug);
    }

    // Step 2: Lookup via IMDb ID (cached or API)
    if (!movieData && imdbId) {
      const cleanImdb = String(imdbId).toLowerCase().trim();
      const cachedSlug = imdbCache.get(`stp:imdb:${cleanImdb}`);
      if (cachedSlug) {
        movieData = await getDetail(cachedSlug);
      }
      if (!movieData) {
        try {
          const res = await http.get(`https://phimapi.com/imdb/title/${cleanImdb}`, { timeout: 4000 });
          const movie = res.data?.movie || res.data?.data?.item;
          const episodes = res.data?.episodes || movie?.episodes || [];
          if (movie) {
            movieData = { movie, episodes };
            imdbCache.set(`stp:imdb:${cleanImdb}`, movie.slug || slug, 86400);
          }
        } catch {}
      }
    }

    // Step 3: Search with title + multi-candidate iteration
    if (!movieData && title) {
      const searchItems = await search(title, 1);
      if (searchItems.length > 0) {
        const sorted = [...searchItems].sort((a, b) => scoreMatch(b, title, year, season) - scoreMatch(a, title, year, season));
        for (const item of sorted) {
          if (scoreMatch(item, title, year, season) < 0.40) continue;
          const detail = await getDetail(item.slug);
          if (detail && detail.episodes && detail.episodes.length > 0) {
            movieData = detail;
            if (imdbId) {
              imdbCache.set(`stp:imdb:${String(imdbId).toLowerCase().trim()}`, item.slug, 86400);
            }
            break;
          }
        }
      }
    }

    const streams = [];
    const b64Ref = encodeBase64(REFERER_HEADER);
    const isMovie = (type === 'movie' || movieData?.movie?.type === 'single') && episode == null;
    const targetEpStr = !isMovie && episode != null ? String(episode).trim() : null;

    if (movieData && movieData.episodes && movieData.episodes.length > 0) {
      const { movie, episodes } = movieData;

      // Season validation for series
      if (isMovie || season == null || isSeasonMatch(movie, episodes, season, type)) {
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

          const rawStreamUrl = targetEp.link_m3u8 || targetEp.link_embed;
          if (!rawStreamUrl || isDeadOrBadUrl(rawStreamUrl)) continue;

          const epLabel = formatEpisodeLabel(targetEp.name);
          const audio = classifyAudioType(rawServerName, movie.name || title);
          const titleHeader = `[VIP 4 • STP] ${audio.label}${epLabel} (HLS Proxy) [VIP • STP]`;
          const streamUrl = `${proxyBase || ''}/hls/manifest.m3u8?url=${encodeBase64(rawStreamUrl)}&ref=${b64Ref}`;

          // STRICT INVARIANT: url only, STRICTLY NO externalUrl
          streams.push({
            name: 'VIP Movies 🎬',
            title: `${titleHeader}\n⚡ Server STP • sieutamphim.pro`,
            url: streamUrl,
            behaviorHints: {
              notSupported: false,
              bingeGroup: `stp-${movie.slug || slug || 'stream'}`,
            },
          });
        }
      }
    }

    // Step 5: Mirror fallback if no playable streams found
    if (streams.length === 0 && (title || slug)) {
      const query = title || String(slug).replace(/^stp[_:]/, '').replace(/-/g, ' ');
      try {
        const sRes = await http.get('https://phimapi.com/v1/api/tim-kiem', {
          params: { keyword: query, limit: 5 },
          timeout: 4000,
        });
        const sItems = sRes.data?.data?.items || [];
        for (const sItem of sItems) {
          if (!sItem.slug) continue;
          const dRes = await http.get(`https://phimapi.com/phim/${sItem.slug}`, { timeout: 4000 });
          const mMovie = dRes.data?.movie || dRes.data?.data?.item;
          const mEps = dRes.data?.episodes || mMovie?.episodes || [];
          if (mMovie && mEps.length > 0) {
            const isMovieFallback = (type === 'movie' || mMovie.type === 'single') && episode == null;
            if (isMovieFallback || season == null || isSeasonMatch(mMovie, mEps, season, type)) {
              for (let sIdx = 0; sIdx < mEps.length; sIdx++) {
                const server = mEps[sIdx];
                const rawServerName = String(server.server_name || '').trim() || `Server ${sIdx + 1}`;
                const serverData = server.server_data || [];
                if (!serverData.length) continue;

                let targetEp = isMovieFallback || targetEpStr === null ? serverData[0] : serverData.find((ep) => {
                  const nameStr = String(ep.name || '').trim();
                  const slugStr = String(ep.slug || '').trim();
                  if (nameStr === targetEpStr || nameStr === `Tập ${targetEpStr}` || nameStr === `Tập 0${targetEpStr}`) return true;
                  if (slugStr === `tap-${targetEpStr}` || slugStr === `tap-0${targetEpStr}`) return true;
                  return false;
                }) || serverData[0];

                if (!targetEp || !targetEp.link_m3u8 || isDeadOrBadUrl(targetEp.link_m3u8)) continue;

                const epLabel = formatEpisodeLabel(targetEp.name);
                const audio = classifyAudioType(rawServerName, mMovie.name || title);
                const titleHeader = `[VIP 4 • STP] ${audio.label}${epLabel} (HLS Proxy) [VIP • STP]`;
                const streamUrl = `${proxyBase || ''}/hls/manifest.m3u8?url=${encodeBase64(targetEp.link_m3u8)}&ref=${b64Ref}`;

                streams.push({
                  name: 'VIP Movies 🎬',
                  title: `${titleHeader}\n⚡ Server STP • sieutamphim.pro`,
                  url: streamUrl,
                  behaviorHints: {
                    notSupported: false,
                    bingeGroup: `stp-${mMovie.slug || slug || 'stream'}`,
                  },
                });
              }
              if (streams.length > 0) break;
            }
          }
        }
      } catch (err) {}
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
  decodeXor0x2a,
  parsePostContent,
  parseStpCardsFromHtml,
};
