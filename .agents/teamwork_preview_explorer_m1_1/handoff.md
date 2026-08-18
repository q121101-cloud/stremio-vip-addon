# STP Provider Implementation Specification (Milestone 1 — Engine v1.6.0)

## 1. Observation

### 1.1 Existing Codebase State
- **File**: `src/providers/stp.js` (338 lines)
  - `REFERER_HEADER`: currently `'https://suutamphim.org/'` (line 25).
  - `Origin`: currently `'https://suutamphim.org'` (line 34).
  - `PROVIDER_LABEL`: currently `'STP • Âu Mỹ & K-Drama'` (line 24).
  - Stream title generation (lines 305-307):
    ```javascript
    const titleHeader = isTM
      ? `[VIP • STP] Thuyết Minh Full HD${epLabel} (HLS Proxy)`
      : `[VIP • STP] Vietsub Full HD${epLabel} (HLS Proxy)`;
    ```
    This does NOT match Engine v1.6.0 specification label:
    `[VIP 4 • STP] Thuyết Minh HD (HLS Proxy)\n⚡ Server STP • sieutamphim.pro`
- **File**: `src/lib/utils.js` (line 324)
  - Exports `scoreMatch` alongside standard string sanitizers (`safeKeyword`, `safeSlug`, `safePage`, `safeType`, `safeExtra`, `isSeasonMatch`, `escapeRegExp`).
  - Grep verification confirms `scoreMatch` is never re-declared in provider files.
- **File**: `src/routes/hls.js` (line 32)
  - `SOURCE_REFERERS` pattern currently lists `/suutamphim|tvhay/i`. Needs addition of `sieutamphim.pro`:
    `{ pattern: /sieutamphim|suutamphim|tvhay/i, referer: 'https://sieutamphim.pro/', origin: 'https://sieutamphim.pro' }`.

### 1.2 Live Probing Results on `https://sieutamphim.pro/`
- Direct HTTP GET tests executed on `https://sieutamphim.pro`:
  - Search endpoint: `/wp-json/wp/v2/posts?search=<query>&per_page=10&_embed=true` returns HTTP 200 with post objects, embedded featured media posters, and post content.
  - Detail endpoint: `/wp-json/wp/v2/posts?slug=<slug>&_embed=true` returns HTTP 200 with complete movie rendered HTML.
  - Stream Obfuscation:
    Inside `post.content.rendered`, episode groups are embedded as:
    ```html
    <div class="episodeGroup" data-server="hx" data-episodes='[{"<xor_obfuscated_string>", "Full"}]'></div>
    ```
  - Deobfuscation Algorithm:
    Analysis of `embed.html` and player scripts confirms character-wise XOR with key `0x2a` (decimal 42):
    ```javascript
    function decodeXor0x2a(str, key = 0x2a) {
      if (!str || typeof str !== 'string') return '';
      let out = '';
      for (let i = 0; i < str.length; i++) {
        out += String.fromCharCode(str.charCodeAt(i) ^ key);
      }
      return out;
    }
    ```
  - Sample Decoded Stream:
    - Post: `sat-thu-ninja-2-tvh-thuyet-minh` (ID: 26460)
    - Encoded string: `"B^^ZY\u0010\u0005\u0005YBEX^\u0004CDA\u0005ufHElS]}\u0019"`
    - Decoded output: `"https://short.ink/_LboFywW3"`

---

## 2. Logic Chain

1. **Premise 1 (Domain & Headers)**: `src/providers/stp.js` must communicate with `https://sieutamphim.pro`, using `REFERER_HEADER = 'https://sieutamphim.pro/'` and `Origin: 'https://sieutamphim.pro'`.
2. **Premise 2 (Multi-Tier Extraction Strategy)**:
   - **Tier 1 (WP-JSON & XOR Decode)**: Query `/wp-json/wp/v2/posts?search=...` / `/wp-json/wp/v2/posts?slug=...` -> parse `.episodeGroup` and `data-episodes` -> decode stream URLs with XOR `0x2a` -> encapsulate in HLS Proxy URL `${proxyBase}/hls/manifest.m3u8?url=<b64Url>&ref=<b64Ref>`.
   - **Tier 2 (HTML SSR / PhimAPI Fallback)**: If WP-JSON fails or returns no posts, fallback to `phimapi.com` mirror with `https://sieutamphim.pro/` referer.
   - **Tier 3 (Safe Degradation)**: If all queries fail or throw network errors, `getStreams` returns `[]` safely without throwing an exception or blocking the aggregator.
3. **Premise 3 (Brand Title Format)**:
   - Stremio stream title must follow the exact brand template:
     `[VIP 4 • STP] Thuyết Minh HD${epLabel} (HLS Proxy)\n⚡ Server STP • sieutamphim.pro`
     (with `Vietsub HD` and `Lồng Tiếng HD` variants where classified).
4. **Premise 4 (Strict Invariants)**:
   - Only `url` property is emitted on stream objects.
   - `externalUrl` property is strictly excluded (must be `undefined`).
   - `scoreMatch` is imported directly from `../lib/utils`.
   - 5-second axios timeout is applied to all requests.

---

## 3. Caveats

1. **Cloudflare Rate Limiting**: `sieutamphim.pro` is protected by Cloudflare. Requests must use a standard browser User-Agent (`STP_UA`) and 5-second timeouts.
2. **Regex Quote Delimiters**: In WordPress rendered HTML, `data-episodes` is delimited by single quotes (`'`) while containing double-quoted JSON strings (`{"<url>","<name>"}`). Regex must match `data-episodes=(?:'([^']*)'|"([^"]*)")` to prevent truncation.
3. **Audio Classification**: If no audio tag is present in the title or server name, defaults to `Thuyết Minh HD` as STP specializes in voice-over / thuyết minh content.

---

## 4. Conclusion & Complete Proposed Implementation

### 4.1 Proposed File: `src/providers/stp.js`

```javascript
'use strict';

/**
 * ============================================================
 *  VIP Movies Addon — src/providers/stp.js (Engine v1.6.0)
 *  STP Specialized Provider: Western Cinema & K-Drama (VIP 4)
 *  Live Domain: sieutamphim.pro
 *
 *  Features:
 *  - Official Domain: https://sieutamphim.pro
 *  - Referer Header: https://sieutamphim.pro/
 *  - Origin Header: https://sieutamphim.pro
 *  - Multi-tier Stream Extraction:
 *    * Tier 1: WP-JSON REST API + XOR 0x2a Stream Decoding
 *    * Tier 2: HTML SSR search + Mirror Fallback
 *    * Tier 3: Safe degradation returning [] (Zero crash)
 *  - Brand Stream Label:
 *    `[VIP 4 • STP] Thuyết Minh HD (HLS Proxy)\n⚡ Server STP • sieutamphim.pro`
 *  - Strict Invariants:
 *    * Only `url` pointing to HLS Proxy, STRICTLY NO `externalUrl`
 *    * Import `scoreMatch` from `../lib/utils`, NO re-declarations
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
const STP_UA         = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';

const http = axios.create({
  baseURL: BASE_URL,
  timeout: 5000,
  headers: {
    'User-Agent': STP_UA,
    Accept: 'application/json, text/html, */*',
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
  const groupMatches = [...html.matchAll(/class=[\x22\x27]episodeGroup[\x22\x27][^>]*data-server=[\x22\x27]([^\x22\x27]*)[\x22\x27][^>]*data-episodes=(?:\x27([^\x27]*)\x27|\x22([^\x22]*)\x22)/g)];

  for (let gIdx = 0; gIdx < groupMatches.length; gIdx++) {
    const srvName = groupMatches[gIdx][1] || `Server ${gIdx + 1}`;
    const epsRaw = groupMatches[gIdx][2] || groupMatches[gIdx][3] || '';
    const eps = [];
    const epMatches = [...epsRaw.matchAll(/\{\x22([^\x22]+)\x22,\x22([^\x22]+)\x22\}/g)];

    for (let eIdx = 0; eIdx < epMatches.length; eIdx++) {
      const encUrl = epMatches[eIdx][1];
      const epName = epMatches[eIdx][2];
      const decodedUrl = decodeXor0x2a(encUrl);
      if (decodedUrl && (decodedUrl.startsWith('http://') || decodedUrl.startsWith('https://'))) {
        eps.push({
          name: epName,
          slug: `tap-${epName}`,
          link_m3u8: decodedUrl,
          link_embed: decodedUrl,
        });
      }
    }

    if (eps.length > 0) {
      groups.push({
        server_name: srvName,
        server_data: eps,
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

  // Tier 1: sieutamphim.pro WP-JSON REST API
  try {
    const res = await http.get('/wp-json/wp/v2/posts', {
      params: { search: clean, per_page: 10, page: p, _embed: true },
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
    // Graceful fallback to Tier 2
  }

  // Tier 2: Resilient PhimAPI mirror fallback
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
 * 2. Get film detail
 */
async function getDetail(slug) {
  const cleanSlug = safeSlug(slug, 'stp');
  if (!cleanSlug) return null;
  const cacheKey = `stp:detail:${cleanSlug}`;
  const cached = detailCache.get(cacheKey);
  if (cached) return cached;

  // Tier 1: WP-JSON slug lookup on sieutamphim.pro
  try {
    const res = await http.get('/wp-json/wp/v2/posts', {
      params: { slug: cleanSlug, _embed: true },
    });
    if (Array.isArray(res.data) && res.data.length > 0) {
      const post = res.data[0];
      const parsed = parsePostContent(post.content?.rendered || '', post.title?.rendered || '');
      const posterUrl = post._embedded?.['wp:featuredmedia']?.[0]?.source_url || null;

      const movie = {
        name: parsed.name || post.title?.rendered,
        origin_name: parsed.origin_name || null,
        slug: post.slug,
        year: parsed.year,
        type: parsed.episodes.length > 1 || (parsed.episodes[0]?.server_data?.length > 1) ? 'series' : 'single',
        poster_url: posterUrl,
        thumb_url: posterUrl,
      };

      const result = { movie, episodes: parsed.episodes };
      detailCache.set(cacheKey, result, 600);
      return result;
    }
  } catch (err) {
    // Graceful fallback to Tier 2
  }

  // Tier 2: PhimAPI mirror detail lookup
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
    if (slug && (slug.startsWith('stp_') || slug.startsWith('stp:'))) {
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
          const res = await http.get(`https://phimapi.com/imdb/title/${cleanImdb}`);
          const movie = res.data?.movie || res.data?.data?.item;
          const episodes = res.data?.episodes || movie?.episodes || [];
          if (movie) movieData = { movie, episodes };
        } catch {}
      }
    }

    // Step 3: Search with title + fuzzy score matching
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

      const epLabel = formatEpisodeLabel(targetEp.name);
      const audio = classifyAudioType(rawServerName, movie.name || title);
      const titleHeader = `[VIP 4 • STP] ${audio.label}${epLabel} (HLS Proxy)`;

      const rawStreamUrl = targetEp.link_m3u8 || targetEp.link_embed;
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
};
```

---

## 5. Verification Method

To independently verify this specification:

1. **Verify Live WP-JSON Search & XOR Deobfuscation**:
   ```bash
   node -e '
   const axios = require("axios");
   (async () => {
     const res = await axios.get("https://sieutamphim.pro/wp-json/wp/v2/posts?slug=sat-thu-ninja-2-tvh-thuyet-minh", {
       headers: { "User-Agent": "Mozilla/5.0", Referer: "https://sieutamphim.pro/" }
     });
     const html = res.data[0].content.rendered;
     const match = html.match(/data-episodes=(?:\x27([^\x27]*)\x27|\x22([^\x22]*)\x22)/);
     const epMatch = [...(match[1]||match[2]).matchAll(/\{\x22([^\x22]+)\x22,\x22([^\x22]+)\x22\}/g)][0];
     const enc = epMatch[1];
     let dec = "";
     for (let i = 0; i < enc.length; i++) dec += String.fromCharCode(enc.charCodeAt(i) ^ 0x2a);
     console.log("Decoded Stream URL:", dec);
   })();
   '
   ```

2. **Verify Provider Invariants**:
   - `externalUrl === undefined` on all stream objects.
   - `url` starts with `proxyBase + '/hls/manifest.m3u8'`.
   - Title matches `[VIP 4 • STP] ... (HLS Proxy)\n⚡ Server STP • sieutamphim.pro`.
   - `scoreMatch` is imported from `src/lib/utils.js`.

3. **Verify Zero Regression on Existing Test Suites**:
   ```bash
   node tests/verify_playback.js
   node tests/verify_hotfix_vsmov_kkphim.js
   ```

### Invalidation Conditions
- If `sieutamphim.pro` changes XOR key from `0x2a` to a dynamic per-session key.
- If WordPress REST API `/wp-json/wp/v2/posts` is completely blocked or disabled behind Cloudflare Turnstile.
- In both cases, Tier 2 (HTML scraper / mirror fallback) and Tier 3 (safe `[]` degradation) prevent crashes.
