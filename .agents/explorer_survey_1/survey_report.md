# Survey Report: Provider Ecosystem & Utility Functions (Stremio VIP Movies Addon Engine v1.5.0)

**Author**: Explorer Survey 1  
**Timestamp**: 2026-08-18T00:56:45Z  
**Project Path**: `/Users/quan/.gemini/antigravity/scratch/stremio-nguonc-addon`  
**Mission**: Comprehensive survey and architectural audit of `src/lib/utils.js`, all 7 providers (`vsmov.js`, `kkphim.js`, `nguonc.js`, `stp.js`, `hh3d.js`, `yan.js`, `clbpx.js`), helper deduplication, provider contracts, CDN referers, title formats, and in-app HLS proxy compliance.

---

## 1. Executive Summary

A forensic inspection of `src/lib/utils.js`, `src/providers/*.js`, `src/routes/hls.js`, `src/handlers.js`, `src/manifest.js`, and `tests/verify_playback.js` was conducted.

### Key Observations:
1. **`src/lib/utils.js` Completeness**:
   Exports all 11 canonical helpers required by R1: `safeString`, `safeType`, `normalizeText`, `escapeRegExp`, `safeExtra`, `safeSlug`, `safeKeyword`, `safePage`, `extractSeasonNumber`, `isSeasonMatch`, and `scoreMatch`.
2. **Duplicate Functions in Providers**:
   Redundant local declarations of `scoreMatch` and `escapeRegExp` are present in ALL 7 provider files:
   - `src/providers/vsmov.js` (lines 48–51: `escapeRegExp`, lines 73–143: `scoreMatch`)
   - `src/providers/kkphim.js` (lines 52–55: `escapeRegExp`, lines 70–140: `scoreMatch`)
   - `src/providers/nguonc.js` (lines 44–47: `escapeRegExp`, lines 52–122: `scoreMatch`)
   - `src/providers/stp.js` (lines 43–46: `escapeRegExp`, lines 61–131: `scoreMatch`)
   - `src/providers/hh3d.js` (lines 43–46: `escapeRegExp`, lines 61–131: `scoreMatch`)
   - `src/providers/yan.js` (lines 43–46: `escapeRegExp`, lines 61–131: `scoreMatch`)
   - `src/providers/clbpx.js` (lines 43–46: `escapeRegExp`, lines 61–131: `scoreMatch`)
   All 7 provider files currently import `{ safeExtra, safeSlug, safeKeyword, safePage, safeType, isSeasonMatch }` from `../lib/utils.js`, but define `scoreMatch` and `escapeRegExp` locally instead of importing them.
3. **Standard Contract Compliance**:
   All 7 providers adhere to the standard interface:
   - `getStreams(payload)` (supports both unified payload `{ imdbId, type, title, year, genres, season, episode, slug, proxyBase }` and positional arguments `(arg1, title, type, season, episode, proxyBase)`).
   - `getCatalog(type, page, extra)` (processes catalog requests with search queries, genre filters, and pagination).
   - `search(keyword, page/limit)`
   - `getDetail(slug)`
4. **Stream Extraction & Referer Encapsulation**:
   - `url` property is strictly used for In-App Direct Play with HLS Proxy (`/hls/manifest.m3u8?url=...&ref=...`).
   - `externalUrl` property is strictly omitted from all stream objects.
   - Upstream CDN referer headers are properly mapped in `src/routes/hls.js` and in each provider module.
5. **E2E Playback Verification**:
   `node tests/verify_playback.js` was executed and confirmed passing 100%, downloading a real 3,426,676 bytes (~3.35 MB) `.ts` chunk with HTTP 200, valid MPEG-TS sync byte `0x47`, and HTTP 206 range seeking support.

---

## 2. Utility Functions Audit (`src/lib/utils.js`)

`src/lib/utils.js` (326 lines) implements crash-resilient helper functions:

| Function | Signature | Purpose | Exported in utils.js |
| :--- | :--- | :--- | :---: |
| `safeString` | `(val, defaultVal = '')` | Converts any type to string safely (ignores Objects/Symbols) | ✅ |
| `safeType` | `(type, defaultType = 'movie')` | Normalizes content types (`movie`, `series`, `anime`, etc.) | ✅ |
| `normalizeText` | `(str)` | Removes Vietnamese diacritics, special chars, normalizes spaces | ✅ |
| `escapeRegExp` | `(str)` | Escapes regex metacharacters (`.*+?^${}()|[\]\`) safely | ✅ |
| `safeExtra` | `(extra)` | Validates extra parameters object | ✅ |
| `safeSlug` | `(slug, prefix = '')` | Strips provider prefix (`vsmov:`, `kkphim:`, etc.) | ✅ |
| `safeKeyword` | `(keyword)` | Sanitizes search keywords | ✅ |
| `safePage` | `(page)` | Parses 1-indexed integer page numbers | ✅ |
| `extractSeasonNumber` | `(str)` | Extracts season number from titles, slugs, or server names | ✅ |
| `isSeasonMatch` | `(movie, episodes, requestedSeason, type)` | Validates if series contains the requested season | ✅ |
| `scoreMatch` | `(item, title, year, season)` | Calculates title similarity (0.0 to 1.5) with year/season weighting | ✅ |

### Evaluation:
`src/lib/utils.js` is complete, robust, and exports all required functions.

---

## 3. Provider Ecosystem Survey (7 Providers)

### Summary Matrix

| Provider Module | Provider ID & Label | Base API / Sources | CDN Referer Header | Duplicate `scoreMatch` Lines | Duplicate `escapeRegExp` Lines | Stream Title Format |
| :--- | :--- | :--- | :--- | :---: | :---: | :--- |
| `vsmov.js` | `vsmov` / VSMOV 4K | `https://vsmov.com/api` | `https://vsmov.com/` | Lines 73–143 | Lines 48–51 | `[VIP 1 • VSMOV] Master 4K Ultra HD (3840x2160)` / `[VIP 1 • VSMOV] Thuyết Minh Full HD` |
| `kkphim.js` | `kkphim` / KKPhim | `https://phimapi.com` | `https://player.phimapi.com/` / `https://phimapi.com/` | Lines 70–140 | Lines 52–55 | `[VIP 2 • KKPhim] Vietsub Full HD` / `[VIP 2 • KKPhim] Thuyết Minh Full HD` / `[VIP 2 • KKPhim] Lồng Tiếng Full HD` |
| `nguonc.js` | `nguonc` / NguonC | `https://phim.nguonc.com/api` | `https://embed15.streamc.xyz/` | Lines 52–122 | Lines 44–47 | `[VIP 3 • NguonC] Vietsub Full HD` / `[VIP 3 • NguonC] Thuyết Minh Full HD` / `[VIP 3 • NguonC] Lồng Tiếng Full HD` |
| `stp.js` | `stp` / STP • Âu Mỹ & K-Drama | `https://suutamphim.org` / `phimapi.com` | `https://suutamphim.org/` | Lines 61–131 | Lines 43–46 | `[VIP • STP] Vietsub Full HD` / `[VIP • STP] Thuyết Minh Full HD` |
| `hh3d.js` | `hh3d` / HH3D • 3D Donghua | `https://hh3d.tv` / `phimapi.com` | `https://hh3d.tv/` | Lines 61–131 | Lines 43–46 | `[VIP • HH3D] 3D Donghua Full HD` / `[VIP • HH3D] Thuyết Minh Full HD` |
| `yan.js` | `yan` / YAN • Donghua & Anime | `https://yanhh3d.org` / `phimapi.com` | `https://yanhh3d.org/` | Lines 61–131 | Lines 43–46 | `[VIP • YAN] Vietsub Full HD` / `[VIP • YAN] Thuyết Minh Full HD` |
| `clbpx.js` | `clbpx` / CLBPX • Phim Xưa & TVB | `https://clbphimxua.com` / `phimapi.com` | `https://clbphimxua.com/` | Lines 61–131 | Lines 43–46 | `[VIP • CLBPX] Lồng Tiếng TVB / Kim Dung` / `[VIP • CLBPX] Thuyết Minh Full HD` |

---

## 4. Deep Provider Inspection

### 4.1. VSMOV 4K (`src/providers/vsmov.js`)
- **API Endpoints**: `https://vsmov.com/api/movie?imdb=...`, `/tim-kiem`, `/phim/:slug`, `/danh-sach/4k`, `/danh-sach/thuyet-minh`.
- **Master Playlist Resolution**: Extracts `.m3u8` from `link_m3u8` or fetches `link_embed` and parses `baseUrl` + `videoHash` or regex pattern.
- **Titles**:
  - `[VIP 1 • VSMOV] Master 4K Ultra HD (3840x2160)${epLabel} (HLS Proxy)`
  - `[VIP 1 • VSMOV] Thuyết Minh Full HD${epLabel} (HLS Proxy)`
- **Stream Invariant**: Returns `{ name: 'VIP Movies 🎬', title, url, behaviorHints }` with strict absence of `externalUrl`.
- **Duplicate definitions**:
  - `escapeRegExp` on lines 48–51.
  - `scoreMatch` on lines 73–143.
- **Recommended Action**: Update import from `../lib/utils` to include `{ scoreMatch, escapeRegExp }` and remove duplicate function declarations.

### 4.2. KKPhim (`src/providers/kkphim.js`)
- **API Endpoints**: `https://phimapi.com/imdb/title/:imdbId`, `/v1/api/tim-kiem`, `/phim/:slug`, `/v1/api/danh-sach/:type`.
- **Server Support**: Vietsub, Thuyết Minh, Lồng Tiếng.
- **Titles**:
  - `[VIP 2 • KKPhim] Vietsub Full HD${epLabel} (HLS Proxy)`
  - `[VIP 2 • KKPhim] Thuyết Minh Full HD${epLabel} (HLS Proxy)`
  - `[VIP 2 • KKPhim] Lồng Tiếng Full HD${epLabel} (HLS Proxy)`
- **Stream Invariant**: Validated in-app HLS Proxy URL format with `externalUrl` omitted.
- **Duplicate definitions**:
  - `escapeRegExp` on lines 52–55.
  - `scoreMatch` on lines 70–140.
- **Recommended Action**: Update import to include `{ scoreMatch, escapeRegExp }` from `../lib/utils.js`.

### 4.3. NguonC (`src/providers/nguonc.js`)
- **API Endpoints**: `https://phim.nguonc.com/api/films/search`, `/film/:slug`, `/films/danh-sach/:type`.
- **Stream Extraction**: Supports direct `m3u8` with Referer `https://embed15.streamc.xyz/` and fallback to `/hls/extract?b64=...`.
- **Titles**:
  - `[VIP 3 • NguonC] Vietsub Full HD${epLabel} (HLS Proxy)`
  - `[VIP 3 • NguonC] Thuyết Minh Full HD${epLabel} (HLS Proxy)`
  - `[VIP 3 • NguonC] Lồng Tiếng Full HD${epLabel} (HLS Proxy)`
- **Duplicate definitions**:
  - `escapeRegExp` on lines 44–47.
  - `scoreMatch` on lines 52–122.
- **Recommended Action**: Update import to include `{ scoreMatch, escapeRegExp }` from `../lib/utils.js`.

### 4.4. Specialized Providers (`stp.js`, `hh3d.js`, `yan.js`, `clbpx.js`)
- **STP (`stp.js`)**: Hollywood/Western & K-Drama selection. Referer: `https://suutamphim.org/`.
  - Duplicates: `escapeRegExp` (lines 43–46), `scoreMatch` (lines 61–131).
- **HH3D (`hh3d.js`)**: 3D Donghua / Tiên Hiệp. Referer: `https://hh3d.tv/`.
  - Duplicates: `escapeRegExp` (lines 43–46), `scoreMatch` (lines 61–131).
- **YAN (`yan.js`)**: Donghua & Ongoing Anime. Referer: `https://yanhh3d.org/`.
  - Duplicates: `escapeRegExp` (lines 43–46), `scoreMatch` (lines 61–131).
- **CLBPX (`clbpx.js`)**: Classic Wuxia Kim Dung & TVB Hong Kong. Referer: `https://clbphimxua.com/`.
  - Duplicates: `escapeRegExp` (lines 43–46), `scoreMatch` (lines 61–131).

---

## 5. Aggregator & Invariant Verification (`src/handlers.js`, `src/routes/hls.js`)

1. **Cinemeta Metadata Resolution**:
   - `src/handlers.js` lines 849–860 resolve canonical metadata using Cinemeta API (`resolveCinemeta(type, imdbId)`), cached for 24h via `LRUCache`.
2. **Concurrent Aggregation**:
   - Lines 929–935 query active providers concurrently via `Promise.allSettled()` with a 4000ms timeout per provider (`withTimeout()`).
3. **Protocol Invariant Sanitization**:
   - Lines 944–956 explicitly sanitize stream objects and execute `delete sanitized.externalUrl` to ensure strict zero-externalUrl compliance.
4. **HLS Proxy Router (`src/routes/hls.js`)**:
   - Handles `/hls/manifest.m3u8`, `/hls/segment.ts`, `/hls/key`, and `/hls/extract`.
   - Supports sub-variant playlist rewriting, full segment URL rewriting, decryption key proxying, and HTTP 206 range header forwarding.

---

## 6. Actionable Implementation Recommendations for Downstream Builders

1. **Provider Deduplication**:
   In all 7 provider files (`src/providers/vsmov.js`, `src/providers/kkphim.js`, `src/providers/nguonc.js`, `src/providers/stp.js`, `src/providers/hh3d.js`, `src/providers/yan.js`, `src/providers/clbpx.js`):
   - Replace local `scoreMatch` and `escapeRegExp` function declarations with imports from `../lib/utils.js`:
     ```javascript
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
     ```
2. **Catalog & Search Route Verification**:
   Verify that all 22 K20 standard catalogs declared in `src/manifest.js` map to correct provider queries in `src/handlers.js` and respond with HTTP 200 `{ metas: [...] }`.
3. **Playback Verification**:
   Keep `tests/verify_playback.js` as the benchmark test suite to ensure no regression in video playback (> 50KB segment download, HTTP 200/206).
