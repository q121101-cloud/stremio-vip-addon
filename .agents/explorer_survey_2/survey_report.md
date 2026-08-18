# Survey Report: Stremio VIP Movies Addon Engine v1.5.0
**Investigation Focus**: Routing, Route Handlers, Stream Aggregator, Manifest Engine, Cinemeta Resolution, and 22 K20 Standard Catalogs  
**Investigator**: Explorer 2 (Survey Phase)  
**Date**: 2026-08-18  
**Project Root**: `/Users/quan/.gemini/antigravity/scratch/stremio-nguonc-addon`

---

## 1. Executive Summary

A comprehensive investigation into the routing architecture, request handlers, fail-safe stream aggregator, manifest generation, Cinemeta metadata resolution, and 22 standard K20 catalogs was conducted on the Stremio VIP Movies Addon Engine v1.5.0 codebase.

### Key Architectural Strengths:
1. **Zero 404 Addon Routing**: Both default root routes and Base64URL `/:config`-prefixed routes are cleanly mounted for `/manifest.json`, `/catalog/:type/:id.json`, `/catalog/:type/:id/:extra.json`, `/stream/:type/:id.json`, and `/meta/:type/:id.json`.
2. **Fail-Safe Stream Aggregator (`src/handlers.js`)**: Implements true non-blocking concurrency using `Promise.allSettled()` guarded by strict 4000ms timeouts per provider (`withTimeout`), prioritizing streams from VSMOV 4K Ultra HD (VIP 1) down through KKPhim (VIP 2), NguonC (VIP 3), and specialized providers (STP, HH3D, YAN, CLBPX).
3. **Strict Protocol Compliance**: In-app stream objects strictly contain `url` pointing to the local HLS proxy (`/hls/manifest.m3u8?url=...&ref=...`) and strictly exclude `externalUrl`.
4. **Resilient Cinemeta Resolver (`src/lib/cinemeta.js`)**: Resolves IMDb IDs with 24-hour LRU caching, in-flight request deduplication (preventing thundering herd), and multi-field alias/year extraction.
5. **22 K20 Standard Catalogs (`src/manifest.js`)**: 22 standard catalogs spanning all 7 providers are fully defined with support for Vietnamese genres, search, and pagination.

### Identified Improvement & Refactoring Targets:
- **Code Duplication in Providers (`R1`)**: `function scoreMatch` and `function escapeRegExp` are duplicated across all 7 provider files (`vsmov.js`, `kkphim.js`, `nguonc.js`, `stp.js`, `hh3d.js`, `yan.js`, `clbpx.js`) instead of importing strictly from `src/lib/utils.js`.
- **Search Parameter Tolerance in `handleCatalog`**: Enhance handling when `:id` contains `search=` (e.g. `/catalog/movie/search=query.json`) to guarantee search fan-out even when catalog ID is omitted.

---

## 2. Comprehensive Codebase Architecture Inspection

```
stremio-nguonc-addon/
├── src/
│   ├── index.js          # Express server setup, middleware, global error handling
│   ├── handlers.js       # Route handlers: UI dashboard, catalog, meta, stream aggregator
│   ├── manifest.js       # 22 K20 Catalogs definition, manifest builder, genres/countries
│   ├── config.js         # Base64URL config encoder/decoder, validator, defaults
│   ├── api.js            # Axios HTTP client wrapper with caching & metrics
│   ├── mapper.js         # HTML embed scraper, iframe regex extractor, meta mappers
│   ├── lib/
│   │   ├── cache.js      # Memory LRU caches (cinemeta, m3u8, catalog, detail, imdb)
│   │   ├── cinemeta.js   # Cinemeta IMDb resolver (5s timeout, 24h LRU, single-flight)
│   │   └── utils.js      # Canonical shared utilities (scoreMatch, isSeasonMatch, etc.)
│   ├── providers/        # 7 VIP streaming providers
│   │   ├── vsmov.js      # VSMOV 4K Ultra HD Provider
│   │   ├── kkphim.js     # KKPhim Provider
│   │   ├── nguonc.js     # NguonC Provider
│   │   ├── stp.js        # STP (Western Cinema / K-Drama)
│   │   ├── hh3d.js       # HH3D (3D Donghua / Xianxia)
│   │   ├── yan.js        # YAN (Daily Donghua)
│   │   └── clbpx.js      # CLBPX (Classic Wuxia / TVB)
│   └── routes/
│       ├── hls.js        # HLS proxy: playlist rewriter, TS segment pipe, anti-403 headers
│       └── manifest.js   # Dynamic manifest router (root & /:config/)
```

---

## 3. Detailed Investigation Findings

### 3.1 Routing Architecture & 404 Prevention (`src/index.js`, `src/routes/manifest.js`, `src/handlers.js`)

#### Route Mounting Structure in `src/index.js`:
```javascript
app.use('/hls', hlsRouter);        // HLS Proxy (extract, manifest.m3u8, segment.ts)
app.use('/', manifestRouter);      // /manifest.json, /:config/manifest.json
app.use('/', handlers);            // Configurator UI, catalog, meta, stream endpoints
app.use((req, res) => res.status(404).json({ error: 'Endpoint không tồn tại', path: req.path }));
```

#### Complete Endpoint Mapping Table:
| HTTP Method | Route Pattern | Handler | Purpose |
|:---|:---|:---|:---|
| `GET` | `/manifest.json`, `/manifest` | `handleManifest` | Default Stremio manifest |
| `GET` | `/:config/manifest.json`, `/:config/manifest` | `handleConfigManifest` | Configured Stremio manifest |
| `GET` | `/catalog/:type/:id.json`, `/catalog/:type/:id` | `handleCatalog` | Default catalog listing |
| `GET` | `/catalog/:type/:id/:extra.json`, `/catalog/:type/:id/:extra` | `handleCatalog` | Catalog with search / genre / skip |
| `GET` | `/:config/catalog/:type/:id.json`, `/:config/catalog/:type/:id` | `handleCatalog` | Configured catalog listing |
| `GET` | `/:config/catalog/:type/:id/:extra.json`, `/:config/catalog/:type/:id/:extra` | `handleCatalog` | Configured catalog with extra |
| `GET` | `/meta/:type/:id.json`, `/meta/:type/:id` | `handleMeta` | Non-IMDb metadata |
| `GET` | `/:config/meta/:type/:id.json`, `/:config/meta/:type/:id` | `handleMeta` | Configured non-IMDb metadata |
| `GET` | `/stream/:type/:id.json`, `/stream/:type/:id` | `handleStream` | Multi-provider stream aggregator |
| `GET` | `/:config/stream/:type/:id.json`, `/:config/stream/:type/:id` | `handleStream` | Configured stream aggregator |
| `GET` | `/` | inline HTML | Cyber-Glassmorphism Configurator UI |
| `GET` | `/health` | inline JSON | Health check & cache statistics |
| `POST` | `/admin/cache/clear` | inline JSON | Administrative cache flush |

#### Config Engine (`src/config.js`):
- `encodeConfig(config)`: Converts `{ providers: [...], categories: [...], apiKey: "..." }` into URL-safe Base64URL string.
- `decodeConfig(encoded)`: Supports Base64URL, raw JSON, URL-encoded JSON, and URLSearchParams string formats, always falling back safely to `DEFAULT_CONFIG`.
- `isConfigToken(token)`: Distinguishes between reserved endpoints (`manifest.json`, `catalog`, `stream`, `meta`, `hls`, `health`) and valid configuration tokens.

---

### 3.2 Cinemeta Resolution & Metadata Fallback (`src/lib/cinemeta.js`)

#### Resolution Flow:
1. **Input Normalization**: Strips season/episode suffixes from IDs (e.g. `tt0903747:1:1` -> `tt0903747`). Normalizes content type (`movie` vs `series`).
2. **24h LRUCache Check**: Queries `cinemetaCache` (`cinemeta:${cleanType}:${imdbId}`).
3. **Single-Flight Request Deduplication**: Uses `inflightRequests` Map to join concurrent requests for the same ID to the same HTTP promise.
4. **Cinemeta Request**: Axios GET `https://v3-cinemeta.strem.io/meta/${cleanType}/${imdbId}.json` with a 5000ms timeout and custom `User-Agent`.
5. **Metadata Extraction**:
   - `name`: Canonical primary title.
   - `year`: 4-digit release year parsed from `year` or `releaseInfo` via `parseYear()`.
   - `genres`: Array of genre strings parsed via `parseGenres()`.
   - `aliases`: Extracted from `meta.aliases`, `meta.titles`, `meta.alternativeTitles`, and `meta.originalName`.
6. **Error & Fallback Handling**:
   - HTTP 404 / resolution failure caches `null` with 1-hour TTL (`CACHE_TTL_FAILURE = 3600`) to avoid hammering Cinemeta.
   - Failures do not crash or block downstream streams; providers fallback gracefully to direct IMDb API calls (e.g. VSMOV `/api/movie?imdb=${imdbId}`, KKPhim `/imdb/title/${imdbId}`, NguonC).

---

### 3.3 Fail-Safe Stream Aggregator & Concurrency (`src/handlers.js`)

#### Concurrency Implementation:
```javascript
// Provider timeout isolation wrapper
function withTimeout(promise, ms = 4000, label = 'Provider') {
  let timer;
  if (promise && typeof promise.catch === 'function') {
    promise.catch(() => {});
  }
  const timeoutPromise = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms);
  });
  return Promise.race([promise, timeoutPromise]).finally(() => {
    if (timer) clearTimeout(timer);
  });
}
```

```javascript
// Parallel execution in handleStream:
const results = await Promise.allSettled(
  providersToRun.map((provider) =>
    withTimeout(provider.getStreams(payload), 4000, provider.name || provider.id || 'Provider')
  )
);
```

#### Stream Processing Pipeline:
1. **Filtering**: Collects results from `fulfilled` promises containing valid array values.
2. **Stream Sanitization**: Ensures `url` is a valid string, sets `name: 'VIP Movies 🎬'`, creates standard binge groups, and **strictly deletes any `externalUrl`**.
3. **Priority Ranking**:
   - Rank 10: VSMOV 4K Ultra HD (`[VIP 1 • VSMOV] Master 4K Ultra HD (3840x2160)`)
   - Rank 20: VSMOV Thuyết Minh 4K (`[VIP 1 • VSMOV] Thuyết Minh Full HD`)
   - Rank 30: KKPhim Vietsub Full HD (`[VIP 2 • KKPhim] Vietsub Full HD`)
   - Rank 40: KKPhim Thuyết Minh / Lồng Tiếng
   - Rank 50: NguonC Vietsub (`[VIP 3 • NguonC] Vietsub`)
   - Rank 60: NguonC Thuyết Minh
   - Ranks 70-100: Specialized providers (STP, HH3D, YAN, CLBPX)
4. **Deduplication**: Deduplicates streams using normalized target URLs (`normalizeStreamKey`).
5. **Fail-Safe Return**: Always returns HTTP 200 with `{ streams: [...] }`. Even on complete upstream failure, returns HTTP 200 `{ streams: [] }`.

---

### 3.4 22 K20 Standard Catalogs (`src/manifest.js`, `src/config.js`)

All 22 catalogs defined in `ALL_CATALOGS` (`src/manifest.js`):

| # | Provider | Category | Type | Catalog ID | Display Name |
|:---|:---|:---|:---|:---|:---|
| 1 | `vsmov` | `movie` | `movie` | `vsmov-4k` | 🌟 VSMOV • Phim 4K Ultra HD |
| 2 | `vsmov` | `movie` | `movie` | `vsmov-thuyet-minh` | 🎙️ VSMOV • Thuyết Minh 4K |
| 3 | `kkphim` | `movie` | `movie` | `kkphim-movie-latest` | 🎬 KKPhim • Phim Lẻ Mới |
| 4 | `kkphim` | `series` | `series` | `kkphim-series-latest` | 📺 KKPhim • Phim Bộ Mới |
| 5 | `kkphim` | `cinema` | `movie` | `kkphim-cinema-latest` | 🍿 KKPhim • Phim Chiếu Rạp |
| 6 | `kkphim` | `anime` | `series` | `kkphim-anime-latest` | 🐉 KKPhim • Hoạt Hình & Anime |
| 7 | `nguonc` | `movie` | `movie` | `nguonc-movie-latest` | 🎬 NguonC • Phim Lẻ Mới |
| 8 | `nguonc` | `series` | `series` | `nguonc-series-latest` | 📺 NguonC • Phim Bộ Mới |
| 9 | `nguonc` | `cinema` | `movie` | `nguonc-cinema-latest` | 🍿 NguonC • Phim Chiếu Rạp |
| 10 | `nguonc` | `anime` | `series` | `nguonc-anime-latest` | 🐉 NguonC • Hoạt Hình & Anime |
| 11 | `stp` | `movie` | `movie` | `stp-au-my` | 🗽 STP • Phim Âu Mỹ Tuyển Chọn |
| 12 | `stp` | `movie` | `movie` | `stp-phim-le` | 🎬 STP • Phim Lẻ Đặc Sắc |
| 13 | `stp` | `series` | `series` | `stp-phim-bo` | 📺 STP • Phim Bộ Tuyển Chọn |
| 14 | `stp` | `series` | `series` | `stp-han-quoc` | 🇰🇷 STP • Phim Hàn Quốc (K-Drama) |
| 15 | `hh3d` | `movie` | `movie` | `hh3d-phim-le` | 🎬 HH3D • Hoạt Hình 3D Phim Lẻ |
| 16 | `hh3d` | `series` | `series` | `hh3d-phim-bo` | 📺 HH3D • Hoạt Hình 3D Phim Bộ |
| 17 | `hh3d` | `anime` | `series` | `hh3d-tien-hiep` | ⚔️ HH3D • Tiên Hiệp & Huyền Huyễn 3D |
| 18 | `yan` | `movie` | `movie` | `yan-phim-le` | 🎬 YAN • Donghua Phim Lẻ |
| 19 | `yan` | `series` | `series` | `yan-phim-bo` | 📺 YAN • Donghua Phim Bộ |
| 20 | `yan` | `anime` | `series` | `yan-dang-chieu` | 🔥 YAN • Donghua Đang Chiếu |
| 21 | `clbpx` | `series` | `series` | `clbpx-kiem-hiep` | 🗡️ CLBPX • Kiếm Hiệp Kim Dung |
| 22 | `clbpx` | `series` | `series` | `clbpx-hong-kong` | 🇭🇰 CLBPX • Phim Hồng Kông / TVB Kinh Điển |

#### Manifest Filtering & Configuration:
- `buildManifest(config, configUrl)` dynamically filters catalogs matching the enabled `providers` and `categories` in the user's configuration.
- Supports 23 Vietnamese standard genres in `GENRES` and 15 countries in `COUNTRIES`.

---

## 4. Verification & Test Execution Results

| Test Suite | Execution Command | Result | Details |
|:---|:---|:---|:---|
| **Syntax Check** | `node --check src/index.js src/handlers.js src/manifest.js src/config.js src/lib/cinemeta.js src/lib/utils.js` | **100% PASS** | Zero syntax or parse errors across all core files |
| **M3 Routing & 22 Catalogs** | `node tests/test_routing_and_22_catalogs.js` | **64/64 PASS** | Tested all 22 catalogs (root & /:config/), extra parameter parsing, 404 prevention, stream/meta endpoints |
| **E2E Playback & Binary Chunk** | `node tests/verify_playback.js` | **6/6 PHASES PASS** | Real TS segment binary chunk downloaded (3,426,676 bytes > 50KB, sync byte 0x47, HTTP 206 range test) |
| **Integration Suite** | `npm test` (`node src/test.js`) | **50/50 PASS** | Manifest, movie catalog, series catalog, search, genre filter, meta, stream movie/series, health check |

---

## 5. Synthesis & Concrete Recommendations for v1.5.0 Release

1. **R1 Provider Cleanup (`scoreMatch` & `escapeRegExp`)**:
   - `src/lib/utils.js` already exports `scoreMatch`, `escapeRegExp`, `normalizeText`, `safeExtra`, `safeSlug`, `safeKeyword`, `safePage`, `extractSeasonNumber`, `isSeasonMatch`.
   - Remove the local redeclarations of `function scoreMatch` and `function escapeRegExp` from `src/providers/vsmov.js`, `src/providers/kkphim.js`, `src/providers/nguonc.js`, `src/providers/stp.js`, `src/providers/hh3d.js`, `src/providers/yan.js`, `src/providers/clbpx.js`.
   - Import them directly: `const { scoreMatch, escapeRegExp, ... } = require('../lib/utils');`.

2. **Catalog ID Aliasing & Search Tolerance (`src/handlers.js`)**:
   - Ensure `getCatTypeFromCatalogId` and `handleCatalog` seamlessly accept both canonical IDs (`vsmov-4k-sieu-net`, `kkphim-phim-le`, etc.) and short IDs (`vsmov-4k`, `kkphim-movie-latest`).
   - If `:id` contains `search=` (e.g. `/catalog/movie/search=query.json`), extract the search query and treat as generic search fan-out.

3. **Versioning Verification**:
   - Ensure version `1.5.0` is synchronized across `package.json`, `src/manifest.js` (`BASE_MANIFEST.version = '1.5.0'`), and the UI signature.
