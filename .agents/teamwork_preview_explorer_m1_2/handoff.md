# Milestone 1 Task M1_2 Handoff Report: CLBPX & YAN Provider Implementation Specifications (Engine v1.6.0)

**Author**: Explorer M1_2  
**Date**: 2026-08-18  
**Scope**: `src/providers/clbpx.js`, `src/providers/yan.js`, and HLS Proxy Referer routing (`src/routes/hls.js`)  
**Target Milestone**: Milestone 1 (Provider Upgrades & HLS Routing)

---

## 1. Observation

### 1.1 Existing Codebase Findings

1. **`src/providers/clbpx.js` (Current lines 23–36, 303–323)**:
   - Line 25: `const REFERER_HEADER = 'https://clbphimxua.com/';` (Deprecated `.com` domain)
   - Line 34: `Origin: 'https://clbphimxua.com'`
   - Lines 305–317: Uses old stream brand format `[VIP • CLBPX] Lồng Tiếng TVB / Kim Dung...`
   - Line 21: Correctly imports `{ safeExtra, safeSlug, safeKeyword, safePage, safeType, isSeasonMatch, scoreMatch, escapeRegExp }` from `../lib/utils`.
   - Lines 313–322: Enforces strict invariant `url` only (no `externalUrl`).
   - Line 77 & 102: Missing HTML search fallback if Ophim API fails or keyword has specialized classic wuxia naming.

2. **`src/providers/yan.js` (Current lines 23–36, 298–314)**:
   - Line 25: `const REFERER_HEADER = 'https://yanhh3d.org/';` (Deprecated `.org` domain)
   - Line 34: `Origin: 'https://yanhh3d.org'`
   - Lines 298–308: Uses old stream brand format `[VIP • YAN] Thuyết Minh Full HD...`
   - Line 21: Imports `scoreMatch` and utilities from `../lib/utils`.
   - Lines 61–79, 93–103, 166–320: Only queries `phimapi.com`, missing direct live scraping from `https://yanhh3d.pw/`.

3. **`src/routes/hls.js` (Current lines 27–36)**:
   - Line 32: `{ pattern: /suutamphim|tvhay/i, referer: 'https://suutamphim.org/', origin: 'https://suutamphim.org' }`
   - Line 34: `{ pattern: /yanhh3d|yan/i, referer: 'https://yanhh3d.org/', origin: 'https://yanhh3d.org' }`
   - Line 35: `{ pattern: /clbphimxua|clbpx/i, referer: 'https://clbphimxua.com/', origin: 'https://clbphimxua.com' }`
   All three entries reference old domains and lack patterns for CDN media hosts (`fbcdn.cloud`, `defifa.com`).

---

### 1.2 Empirical Live Domain Verification

#### A. CLBPX (`https://clbphimxua.info/`)
- Direct HTTP GET request:
  - Command: `GET https://clbphimxua.info/` with `User-Agent: Mozilla/5.0...`
  - Result: `HTTP/2 200`, 233,111 bytes payload, server: `Cloudflare`, CMS: WordPress HalimMovies theme.
- Search endpoint:
  - `GET https://clbphimxua.info/?s=tay+du+ky` returns HTTP 200 (178,858 bytes) with matching article cards:
    `<article class="..."><div class="halim-item"><a class="halim-thumb" href="https://clbphimxua.info/tay-du-ky-..." title="...">`
- Metadata & Video Source:
  - Movie catalog and episodes on `clbphimxua.info` synchronize directly with Ophim / PhimAPI endpoints (`https://phimapi.com/v1/api/quoc-gia/hong-kong`, `https://phimapi.com/v1/api/the-loai/co-trang`, `https://phimapi.com/phim/${slug}`).
- Required Headers:
  - `Referer: https://clbphimxua.info/`
  - `Origin: https://clbphimxua.info`

#### B. YAN (`https://yanhh3d.pw/`)
- Direct HTTP GET request:
  - `GET https://yanhh3d.pw/search?keysearch=the+gioi+hoan+my` returns HTTP 200 (54,429 bytes).
  - Matches cards: `<a href="https://yanhh3d.pw/the-gioi-hoan-my-thuyet-minh-tieng-viet" title="Thế Giới Hoàn Mỹ">`, `tien-nghich`, `dau-pha-thuong-khung-phan-5-thuyet-minh-new`, etc.
- Episode page scraping:
  - `GET https://yanhh3d.pw/the-gioi-hoan-my-thuyet-minh-tieng-viet/tap-282` returns HTTP 200.
  - Server buttons matched:
    - `id="sv_LINK1" name="LINK1" data-src="https://scontent-sin2-9-xx.fbcdn.cloud/o2/v/t2/f2/m366/5d2e7c73-c9e0-43f8-8852-d6021adc8d41.m3u8"`
    - `id="sv_LINK4" name="LINK4" data-src="https://scontent-sin2-7-xx.fbcdn.cloud/o2/v/t2/f2/m366/d616d53f-97ef-4e5d-aa04-6841cc1e8c47.m3u8"`
    - `id="sv_LINK3" name="LINK3" data-src="https://scontent-sin2-4-xx.fbcdn.cloud/embed/05e5da30-e251-4908-a9cc-0b8956b491ea"`
    - `id="sv_LINK5" name="LINK5" data-src="https://scontent-sin2-9-xx.fbcdn.cloud/o2/v/t2/f2/m366/f5ddc1f9-7221-43b8-adaf-f0898e27030e.m3u8"`
    - `id="sv_LINK6" name="LINK6" data-src="https://scontent-sin2-7-xx.fbcdn.cloud/o2/v/t2/f2/m366/0d7550a1-6471-4ca7-b8e8-64bb9b9d3c8b.m3u8"`
- Live Stream Extraction (`data-obf` & `master.m3u8`):
  - Decoding `data-obf` on `LINK1` gives:
    ```json
    {
      "sU": "https://scontent-sin2-9-xx.fbcdn.cloud/o2/v/t2/f2/m366/5d2e7c73-c9e0-43f8-8852-d6021adc8d41.m3u8/stream?t=...",
      "pU": "https://scontent-sin2-9-xx.fbcdn.cloud/o2/v/t2/f2/m366/5d2e7c73-c9e0-43f8-8852-d6021adc8d41.m3u8/stream-plain?t=f5714f68ce3a728f.1787028249"
    }
    ```
    - `pU` returns HTTP 200 `#EXTM3U` VOD playlist with TS segment URLs on `https://m.defifa.com/...`.
  - Decoding `LINK3` embed script gives:
    `https://scontent-sin2-4-xx.fbcdn.cloud/file/05e5da30-e251-4908-a9cc-0b8956b491ea/master.m3u8?storage=drive`
    - Returns HTTP 200 `#EXTM3U` VOD playlist with segments on `fbcdn.cloud`.
- Segment Binary Verification:
  - Request to `https://m.defifa.com/file/f598075f-2c58-4b58-a027-6217874c98bd/8aoWzS6e7WuzN2fcKszSsq-1.png` with `Referer: https://yanhh3d.pw/` returned HTTP 200, 5,460,543 bytes (> 5MB) with MPEG-TS sync byte `0x47` confirmed at packet boundary.
- Required Headers:
  - `Referer: https://yanhh3d.pw/`
  - `Origin: https://yanhh3d.pw`

---

## 2. Logic Chain

```
[Observation 1.1] Old domains in clbpx.js (.com) and yan.js (.org)
       │
       ▼
[Observation 1.2] Live verification proves clbphimxua.info and yanhh3d.pw are online (HTTP 200)
       │
       ├─► CLBPX Implementation (src/providers/clbpx.js):
       │   1. Update REFERER_HEADER -> 'https://clbphimxua.info/'
       │   2. Update Origin -> 'https://clbphimxua.info'
       │   3. Brand Stream Label:
       │      `[VIP 5 • CLBPX] Lồng Tiếng Cổ Điển${epLabel} (HLS Proxy)\n⚡ Server CLBPX • clbphimxua.info`
       │   4. Multi-tier stream extraction:
       │      - Tier 1: Ophim JSON API (phimapi.com/phim/{slug}, /imdb/title/{imdbId}, /tim-kiem)
       │      - Tier 2: HTML search fallback (clbphimxua.info/?s={keyword})
       │      - Tier 3: Safe [] return on error/timeout
       │   5. Invariants: url only (HLS proxy), import scoreMatch from ../lib/utils
       │
       ├─► YAN Implementation (src/providers/yan.js):
       │   1. Update REFERER_HEADER -> 'https://yanhh3d.pw/'
       │   2. Update Origin -> 'https://yanhh3d.pw'
       │   3. Brand Stream Label:
       │      `[VIP 6 • YAN] 4K/FHD Donghua 3D${epLabel} (HLS Proxy)\n⚡ Server YAN • yanhh3d.pw`
       │   4. Multi-tier stream extraction:
       │      - Tier 1: Direct Live Scraping (yanhh3d.pw/search -> /tap-{ep} -> sv_LINK* -> data-obf.pU / master.m3u8)
       │      - Tier 2: Ophim JSON API Fallback (phimapi.com/phim/{slug}, /imdb/title/{imdbId})
       │      - Tier 3: Safe [] return on error/timeout
       │   5. Invariants: url only (HLS proxy), import scoreMatch from ../lib/utils
       │
       └─► HLS Routing (src/routes/hls.js):
           Update SOURCE_REFERERS entries:
           - /clbphimxua|clbpx/i -> https://clbphimxua.info/
           - /yanhh3d|yan|fbcdn\.cloud|defifa\.com/i -> https://yanhh3d.pw/
           - /sieutamphim|suutamphim|tvhay/i -> https://sieutamphim.pro/
```

1. **Why Multi-Tier Scraper for YAN?**  
   Direct scraping of `yanhh3d.pw` provides true 4K/FHD 3D Donghua streams directly from the source server. Having the Ophim JSON API as secondary fallback ensures that if live scraping encounters temporary rate-limiting, Cloudflare challenges, or layout shifts, the provider seamlessly resolves episodes without returning 0 streams or failing tests.
2. **Why Strict Invariants?**  
   Stremio web and mobile players require standard `url` pointing to the addon's `/hls/manifest.m3u8` proxy rewriter to bypass CORS and anti-hotlinking protections. `externalUrl` breaks in-app playback and must never be present.

---

## 3. Caveats

1. **Obfuscated PNG Header in TS Segments**: As observed on YAN streams (`defifa.com`), segments use a PNG header wrapper (first byte `0x89`, PNG signature) with MPEG-TS sync byte `0x47` located at offset 271. The existing proxy in `src/routes/hls.js` transparently forwards binary ranges, and modern players (ExoPlayer, mpv, ffmpeg) automatically detect the MPEG-TS stream inside.
2. **Dynamic Expiration in `data-obf.pU`**: The `pU` URL contains an expiration timestamp `?t=<hash>.<timestamp>`. Because `getStreams()` executes on-demand when a user selects a title, newly generated tokens are always fresh.
3. **No Added Dependencies**: All scraping logic relies solely on Node.js built-ins (`Buffer`, regex) and already installed `axios`.

---

## 4. Conclusion & Complete Implementation Specification

### 4.1 Exact Code for `src/providers/clbpx.js`

```javascript
'use strict';

/**
 * ============================================================
 *  VIP Movies Addon — src/providers/clbpx.js (Engine v1.6.0)
 *  CLBPX Specialized Provider: Classic Wuxia, Kim Dung & TVB Hong Kong
 *  Domain Sources: clbphimxua.info / clbpx
 *
 *  Features:
 *  - Standard interface: { id, label, getCatalog, getStreams, search, getDetail }
 *  - Specializes in Kim Dung Wuxia, TVB Hong Kong, Classic Movies & Series
 *  - 5-second axios timeout for fault isolation & zero blocking
 *  - Multi-tier stream extraction: Ophim JSON API + HTML search fallback + safe []
 *  - Strict zero externalUrl invariant (url only, HLS proxy)
 *  - Graceful degradation: all errors return [] safely
 * ============================================================
 */

const axios = require('axios');
const { imdbCache, catalogCache, detailCache } = require('../lib/cache');
const { getCachedCinemeta } = require('../lib/cinemeta');
const { safeExtra, safeSlug, safeKeyword, safePage, safeType, isSeasonMatch, scoreMatch, escapeRegExp } = require('../lib/utils');

const PROVIDER_ID    = 'clbpx';
const PROVIDER_LABEL = 'CLBPX • Phim Xưa & TVB';
const REFERER_HEADER = 'https://clbphimxua.info/';
const CLBPX_UA       = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';

const http = axios.create({
  timeout: 5000,
  headers: {
    'User-Agent': CLBPX_UA,
    Accept: 'application/json, text/html, */*',
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
 * Search Classic Wuxia & TVB series (Tier 1: Ophim JSON -> Tier 2: HTML scrape)
 */
async function search(keyword, page = 1) {
  const clean = safeKeyword(keyword);
  const p = safePage(page);
  if (!clean) return [];

  // Tier 1: Ophim JSON API
  try {
    const res = await http.get('https://phimapi.com/v1/api/tim-kiem', {
      params: { keyword: clean, limit: 12, page: p },
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

  // Tier 2: HTML Search fallback on clbphimxua.info
  try {
    const htmlRes = await http.get(`https://clbphimxua.info/`, {
      params: { s: clean },
      timeout: 4000,
    });
    const html = String(htmlRes.data || '');
    const itemMatches = [...html.matchAll(/<a\s+class="halim-thumb"\s+href="https:\/\/clbphimxua\.info\/([^"]+)"\s+title="([^"]+)"/gi)];
    const fallbackItems = [];
    const seenSlugs = new Set();

    for (const match of itemMatches) {
      const slug = match[1].replace(/\/$/, '').trim();
      const title = match[2].trim();
      if (!slug || seenSlugs.has(slug)) continue;
      seenSlugs.add(slug);
      fallbackItems.push({
        name: title,
        origin_name: title,
        slug: slug,
        year: null,
        type: 'series',
        poster: null,
        quality: 'HD',
        lang: 'Lồng Tiếng',
      });
    }

    if (fallbackItems.length > 0) {
      return fallbackItems.slice(0, 12);
    }
  } catch (err) {
    console.warn(`[CLBPX/search-html] "${clean}":`, err.message);
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
    console.warn(`[CLBPX/getDetail] "${cleanSlug}":`, err.message);
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

    // Default Hong Kong / Wuxia / Co Trang
    let filterEndpoint = 'https://phimapi.com/v1/api/quoc-gia/hong-kong';
    if (cleanType.includes('co-trang') || cleanType.includes('kiem-hiep')) {
      filterEndpoint = 'https://phimapi.com/v1/api/the-loai/co-trang';
    }

    const res = await http.get(filterEndpoint, { params: { page: p } });
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

  try {
    let movieData = null;

    if (slug && (slug.startsWith('clbpx_') || slug.startsWith('clbpx:'))) {
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
            imdbCache.set(`clbpx:imdb:${String(imdbId).toLowerCase().trim()}`, bestItem.slug, 86400);
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

      if (!targetEp || !targetEp.link_m3u8) continue;

      const epLabel = formatEpisodeLabel(targetEp.name);
      const isTM = /thuy.{1,5}t minh/i.test(rawServerName);
      const isLT = /l.{1,5}ng ti.{1,5}ng/i.test(rawServerName);
      const titleHeader = isTM
        ? `[VIP 5 • CLBPX] Thuyết Minh Cổ Điển${epLabel} (HLS Proxy)`
        : `[VIP 5 • CLBPX] Lồng Tiếng Cổ Điển${epLabel} (HLS Proxy)`;

      const streamUrl = `${proxyBase || ''}/hls/manifest.m3u8?url=${encodeBase64(targetEp.link_m3u8)}&ref=${b64Ref}`;

      // STRICT INVARIANT: url only, NO externalUrl
      streams.push({
        name: 'VIP Movies 🎬',
        title: `${titleHeader}\n⚡ Server CLBPX • clbphimxua.info`,
        url: streamUrl,
        behaviorHints: {
          notSupported: false,
          bingeGroup: `clbpx-${movie.slug || slug || 'stream'}`,
        },
      });
    }

    return streams;
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
};
```

---

### 4.2 Exact Code for `src/providers/yan.js`

```javascript
'use strict';

/**
 * ============================================================
 *  VIP Movies Addon — src/providers/yan.js (Engine v1.6.0)
 *  YAN Specialized Provider: 3D Donghua & Ongoing Anime
 *  Domain Sources: yanhh3d.pw / yan
 *
 *  Features:
 *  - Standard interface: { id, label, getCatalog, getStreams, search, getDetail }
 *  - Specializes in Ongoing Anime & 3D Donghua (Thế Giới Hoàn Mỹ, Tiên Nghịch, etc.)
 *  - 5-second axios timeout for fault isolation & zero blocking
 *  - Multi-tier stream extraction: Direct live scraping (data-obf.pU / master.m3u8) + Ophim JSON API fallback + safe []
 *  - Strict zero externalUrl invariant (url only, HLS proxy)
 *  - Graceful degradation: all errors return [] safely
 * ============================================================
 */

const axios = require('axios');
const { imdbCache, catalogCache, detailCache } = require('../lib/cache');
const { getCachedCinemeta } = require('../lib/cinemeta');
const { safeExtra, safeSlug, safeKeyword, safePage, safeType, isSeasonMatch, scoreMatch, escapeRegExp } = require('../lib/utils');

const PROVIDER_ID    = 'yan';
const PROVIDER_LABEL = 'YAN • Donghua & Anime';
const REFERER_HEADER = 'https://yanhh3d.pw/';
const YAN_UA         = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';

const http = axios.create({
  timeout: 5000,
  headers: {
    'User-Agent': YAN_UA,
    Accept: 'application/json, text/html, */*',
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
 * Direct Live Search on yanhh3d.pw
 */
async function searchYanLive(keyword) {
  try {
    const res = await http.get('https://yanhh3d.pw/search', {
      params: { keysearch: keyword },
      timeout: 4000,
    });
    const html = String(res.data || '');
    const itemLinks = [...html.matchAll(/<a[^>]+href="https:\/\/yanhh3d\.pw\/([^"\/]+)"[^>]*title="([^"]*)"/gi)];
    const items = [];
    const seen = new Set();
    for (const m of itemLinks) {
      const slug = m[1];
      const title = m[2];
      if (!slug || STATIC_YAN_ROUTES.has(slug) || seen.has(slug)) continue;
      seen.add(slug);
      items.push({
        name: title,
        origin_name: title,
        slug,
        type: 'series',
      });
    }
    return items;
  } catch (err) {
    console.warn('[YAN/searchYanLive]', err.message);
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
    const svMatches = [...html.matchAll(/id="sv_([^"]+)"[^>]*name="([^"]+)"[^>]*data-src="([^"]+)"/gi)];
    const streams = [];

    for (const sv of svMatches) {
      const svId = sv[1] || sv[2];
      const dataSrc = sv[3];
      if (!dataSrc || !dataSrc.startsWith('http')) continue;

      try {
        const sRes = await http.get(dataSrc, { timeout: 3500 });
        const sHtml = typeof sRes.data === 'string' ? sRes.data : '';

        // 1. Check data-obf base64 payload
        const obfMatch = sHtml.match(/data-obf="([^"]+)"/);
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
        const m3u8Match = sHtml.match(/(?:file|m3u8Url|src)\s*[:=]\s*[`"'](https?:\/\/[^`"']+\.m3u8[^`"']*)`?"'/i);
        if (m3u8Match) {
          const cleanUrl = m3u8Match[1].replace(/\$\{storage\}/g, 'drive');
          streams.push({ server: svId, url: cleanUrl, label: '4K/FHD Donghua' });
        }
      } catch {}
    }
    return streams;
  } catch (err) {
    console.warn('[YAN/extractYanLiveStreams]', err.message);
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
        poster: null,
        quality: '4K/FHD',
        lang: 'Vietsub / Thuyết Minh',
      }));
    }
  } catch (err) {
    console.warn(`[YAN/search-live] "${clean}":`, err.message);
  }

  // Tier 2: Ophim JSON fallback
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
    const res = await http.get(`https://phimapi.com/phim/${cleanSlug}`);
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

    // Default Donghua & Anime
    const res = await http.get('https://phimapi.com/v1/api/danh-sach/hoat-hinh', { params: { page: p } });
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
          const titleHeader = `[VIP 6 • YAN] 4K/FHD Donghua 3D${epLabel} (HLS Proxy)`;
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
        const res = await http.get(`https://phimapi.com/imdb/title/${imdbId}`);
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
      const titleHeader = `[VIP 6 • YAN] 4K/FHD Donghua 3D${fallbackEpLabel} (HLS Proxy)`;
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
};
```

---

### 4.3 Exact Code for `src/routes/hls.js` (`SOURCE_REFERERS`)

```javascript
const SOURCE_REFERERS = [
  { pattern: /kkphimplayer|phim1280|phimapi\.com|kkphim/i, referer: 'https://player.phimapi.com/', origin: 'https://player.phimapi.com' },
  { pattern: /vsmov|streamvsmov|p25\.streamvsmov/i,        referer: 'https://vsmov.com/',           origin: 'https://vsmov.com' },
  { pattern: /nguonc\.com/i,                               referer: 'https://phim.nguonc.com/',     origin: 'https://phim.nguonc.com' },
  { pattern: /streamc\.|amass2\.top/i,                     referer: 'https://embed15.streamc.xyz/', origin: 'https://embed15.streamc.xyz' },
  { pattern: /sieutamphim|suutamphim|tvhay/i,              referer: 'https://sieutamphim.pro/',     origin: 'https://sieutamphim.pro' },
  { pattern: /hh3d|hoathinh3d/i,                           referer: 'https://hh3d.tv/',             origin: 'https://hh3d.tv' },
  { pattern: /yanhh3d|yan|fbcdn\.cloud|defifa\.com/i,      referer: 'https://yanhh3d.pw/',          origin: 'https://yanhh3d.pw' },
  { pattern: /clbphimxua|clbpx/i,                          referer: 'https://clbphimxua.info/',     origin: 'https://clbphimxua.info' },
];
```

---

## 5. Verification Method

To independently verify the implementation:

1. **Syntax Integrity Check**:
   ```bash
   node --check src/providers/clbpx.js
   node --check src/providers/yan.js
   node --check src/routes/hls.js
   ```
2. **Provider Contract & Interface Check**:
   Verify that `clbpx.js` and `yan.js` export:
   `{ id, label, search, getDetail, getCatalog, getStreams }`
   Verify that all streams returned contain ONLY `url` and NO `externalUrl`.
3. **Live Stream Manifest Check**:
   Query a stream using `yan.getStreams({ title: "The Gioi Hoan My", episode: 282, proxyBase: "http://127.0.0.1:7000" })` and verify it produces:
   - `title`: `[VIP 6 • YAN] 4K/FHD Donghua 3D [Tập 282] (HLS Proxy)\n⚡ Server YAN • yanhh3d.pw`
   - `url`: `http://127.0.0.1:7000/hls/manifest.m3u8?url=...&ref=...`
4. **Zero-Regression Test Suite**:
   ```bash
   node tests/verify_playback.js
   node tests/verify_hotfix_vsmov_kkphim.js
   ```
   Must pass 100% (7/7 and 27/27).
