# Test Infrastructure & Methodology Specification (VIP Movies Addon v1.4.0)

This document establishes the comprehensive 4-tier testing infrastructure, test matrices, and verification methodologies for the **VIP Movies Stremio Addon Engine v1.4.0**.

---

## 1. Quality Architecture & 4-Tier Test Framework

The VIP Movies Addon is a high-availability streaming proxy and metadata aggregation service for Stremio/Nuvio. Testing is organized into 4 systematic tiers:

```
┌────────────────────────────────────────────────────────────────────────┐
│                        VIP MOVIES TEST SUITE                           │
├────────────────────────────────────────────────────────────────────────┤
│ Tier 1: Feature Coverage (Category-Partition Testing)                 │
│         - Cinemeta Resolver & LRUCache                                 │
│         - KKPhim, NguonC, VsMov Providers                              │
│         - Stream Protocol Exclusivity (HLS Proxy vs Embed Player)      │
│         - Multi-Provider Error & Timeout Isolation                     │
│         - Manifest, Catalogs, Meta, HLS Proxy, Health, UI Branding     │
├────────────────────────────────────────────────────────────────────────┤
│ Tier 2: Boundary & Corner Cases (Boundary Value Analysis - BVA)        │
│         - Malformed & Non-IMDb IDs, Missing Prefixes                   │
│         - Year Parsing Extremes (1895–2099, Multi-Year Series)         │
│         - Episode / Season Number Boundaries (0, 1, 999, Negatives)    │
│         - Unicode, Vietnamese Diacritics & Special Query Characters    │
│         - LRUCache Eviction & Max Capacity Stress                      │
│         - Config Token Malformations & Fallbacks                       │
├────────────────────────────────────────────────────────────────────────┤
│ Tier 3: Cross-Feature Combinations (Pairwise Matrix)                   │
│         - Provider Status Combinations (Success / Timeout / Error)     │
│         - Content Type × Filter Combinations                           │
│         - Stream Protocol Exclusivity across all generated streams     │
├────────────────────────────────────────────────────────────────────────┤
│ Tier 4: Real-World Scenarios & Workload Stress                         │
│         - Real Blockbuster Resolution (Inception tt1375666)            │
│         - Multi-Season TV Series (Breaking Bad tt0903747)              │
│         - Vietnamese / Asian Drama & Anime Catalog Workflows           │
│         - High-Concurrency Burst & 24h LRUCache Hit Latency Stress     │
│         - M3U8 Playlist Parsing & MPEG-TS Stream Integrity             │
└────────────────────────────────────────────────────────────────────────┘
```

---

## 2. Tier 1: Feature Coverage (Category-Partition Testing)

Category-Partition systematically divides each module's input domain into equivalence classes and tests the canonical behavior.

### 2.1 Cinemeta Official Resolver (`src/lib/cinemeta.js`)
- **Equivalence Classes**:
  - `EC-CINE-1`: Valid Movie IMDb ID (`tt1375666`) → canonical title (`Inception`), 4-digit release year (`2010`), genres array, aliases array.
  - `EC-CINE-2`: Valid Series IMDb ID (`tt0903747` / `tt0903747:1:1`) → canonical title (`Breaking Bad`), start year (`2008`), `releaseInfo` (`2008–2013`).
  - `EC-CINE-3`: Non-IMDb ID (`nguonc:slug`, `custom-id`) → returns `null` immediately without network call.
  - `EC-CINE-4`: Missing/404 IMDb ID (`tt0000000`) → returns `null` gracefully with failure caching.

### 2.2 24-Hour LRU Caching (`src/lib/cache.js` & `cinemetaCache`)
- **Equivalence Classes**:
  - `EC-CACHE-1`: Cache Miss on initial query → fetches from upstream, saves to cache with 24h (86,400s) TTL.
  - `EC-CACHE-2`: Cache Hit on subsequent queries → returns cached object synchronously with zero upstream latency.
  - `EC-CACHE-3`: Cache Stats & Pruning → `stats()` accurately tracks `hits`, `misses`, `size`, `evictions`, and `hitRate`.

### 2.3 Provider Search Matching & Resolution
- **KKPhim** (`src/providers/kkphim.js`):
  - Direct IMDb lookup via `/imdb/title/${imdbId}`.
  - Fallback search via `/v1/api/tim-kiem?keyword=${title}` matching year and slug.
  - Generates streams across all available servers (Vietsub, Thuyết Minh, Lồng Tiếng).
- **NguonC** (`src/providers/nguonc.js`):
  - Keyword search via `/films/search?keyword=${title}` with year verification.
  - Returns Vietsub and Thuyết Minh server streams.
- **VsMov** (`src/providers/vsmov.js`):
  - Multi-gateway fallback scraper extracting 1080p `master.m3u8`.
  - Graceful degradation returning `[]` on scraper failure.

### 2.4 Stremio Protocol Stream Exclusivity (`src/handlers.js`)
Stremio and Nuvio clients enforce strict schema exclusivity:
- **In-App Direct Play (HLS Proxy)**:
  - MUST contain `url` pointing to `${proxyBase}/hls/manifest.m3u8?...` (or `/hls/extract?...`).
  - **MUST NOT** contain `externalUrl` (`stream.externalUrl === undefined`).
  - Title standard format: `[VIP • ${Provider}] ${ServerName} (HLS Proxy)\n⚡ Phát trực tiếp trong App`.
- **External Web Browser Play (Embed Player)**:
  - MUST contain `externalUrl` pointing to `${linkEmbed}`.
  - **MUST NOT** contain `url` (`stream.url === undefined`).
  - Title standard format: `[Dự phòng • ${Provider}] ${ServerName} (Embed Player)\n🌐 Bấm để mở xem ngoài trình duyệt web`.

### 2.5 Multi-Provider Error & Timeout Isolation
- Concurrency orchestrator via `Promise.allSettled`.
- 5-second axios timeout guard per provider.
- Failure/timeout in Provider A (e.g. KKPhim) must NEVER abort or degrade responses from Provider B (NguonC) or Provider C (VsMov).
- If all providers fail, endpoint returns `{ streams: [] }` with HTTP 200 (never HTTP 500).

### 2.6 Route & Middleware Verification
- `GET /manifest.json`: Returns valid Stremio v1.4.0 manifest declaring `resources`, `types`, `catalogs`, and `idPrefixes`.
- `GET /:config/manifest.json`: Decodes Base64URL configuration token and filters catalogs/providers accordingly.
- `GET /catalog/:type/:id.json`: Returns catalog metadata items with proper poster/thumbnail URLs.
- `GET /meta/:type/:id.json`: Returns detailed film metadata, episodes, and cast.
- `GET /hls/manifest.m3u8`: Rewrites playlists with CORS headers (`Access-Control-Allow-Origin: *`).
- `GET /hls/ts`: Streams MPEG-TS video with `Content-Type: video/mp2t`.
- `GET /health`: Returns status `ok`, version `1.4.0`, active providers, and cache metrics.
- `GET /`: Renders Cyber-Glassmorphism UI with brand footer `VIP Movies Addon v1.4.0 • Powered by <span class="brand-highlight">Q121101</span>`.

---

## 3. Tier 2: Boundary & Corner Cases (Boundary Value Analysis)

| ID | Boundary Category | Test Input | Expected Behavior |
|---|---|---|---|
| `BVA-ID-1` | IMDb ID Prefix | `tt` (missing digits) | Returns `null`, no upstream call |
| `BVA-ID-2` | Non-IMDb ID | `kodi:12345`, `custom_id` | Skips Cinemeta, delegates to slug |
| `BVA-ID-3` | Series ID Delimiters | `tt0903747:1:1`, `tt0903747:10:25` | Extracts clean IMDb ID `tt0903747`, season `10`, episode `25` |
| `BVA-YEAR-1` | Boundary Year Min | `"1895"` (First cinema film) | Parsed as integer `1895` |
| `BVA-YEAR-2` | Boundary Year Max | `"2099"` | Parsed as integer `2099` |
| `BVA-YEAR-3` | Multi-Year Series Range | `"2008–2013"` | Extracts start year `2008`, preserves releaseInfo |
| `BVA-YEAR-4` | Missing / Empty Year | `null`, `""`, `"TBA"` | `year` is `null`, does not throw |
| `BVA-UNICODE-1`| Vietnamese Diacritics | `"Tà Đạo Thành Thần"`, `"Huyết Chiến"` | Correctly URL-encoded in search queries |
| `BVA-UNICODE-2`| Special Characters | `"Fast & Furious: Tokyo Drift (2006)"` | Sanitized search query, special characters escaped |
| `BVA-CACHE-1`| Max Capacity Eviction | Insert 5,001 items into 5,000 LRUCache | 1st item evicted, size maintained at 5,000 |
| `BVA-CACHE-2`| TTL Expiration | Query expired entry after TTL | Returns `undefined`, increment miss count |
| `BVA-CONFIG-1`| Corrupted Base64 Token | `GET /invalid_token_!@#/manifest.json`| Falls back to `DEFAULT_CONFIG` |

---

## 4. Tier 3: Cross-Feature Combinations (Pairwise Testing)

Testing interactions between provider statuses and content configurations:

| Matrix # | KKPhim Status | NguonC Status | VsMov Status | Target Type | Expected Stream Result |
|---|---|---|---|---|---|
| `PAIR-1` | 🟢 Success (2 streams) | 🟢 Success (2 streams) | 🟢 Success (1 stream) | Movie | 5 total streams aggregated, 100% protocol exclusive |
| `PAIR-2` | 🔴 Error (500) | 🟢 Success (2 streams) | 🟢 Success (1 stream) | Movie | 3 total streams returned without 500 error |
| `PAIR-3` | ⏱️ Timeout (>5s) | 🟢 Success (2 streams) | 🔴 Error (404) | Series | 2 NguonC streams returned within 5.5s timeout window |
| `PAIR-4` | 🔴 Error | 🔴 Error | 🔴 Error | Movie | 0 streams returned (`{ streams: [] }`), HTTP 200 |
| `PAIR-5` | 🟢 Success | 🔴 Skipped (Config) | 🔴 Skipped (Config) | Series | Filtered to KKPhim streams only |

---

## 5. Tier 4: Real-World Scenarios & Workload Stress

1. **Scenario 1: Global Blockbuster Resolution (Inception `tt1375666`)**
   - Resolves canonical title `Inception` (2010) via Cinemeta.
   - Searches all 3 active providers.
   - Asserts HLS Proxy streams have `url` (and NO `externalUrl`) and Embed streams have `externalUrl` (and NO `url`).
2. **Scenario 2: Multi-Season Series Episode Play (Breaking Bad `tt0903747:1:1`)**
   - Resolves canonical title `Breaking Bad` (2008) via Cinemeta.
   - Identifies Season 1 Episode 1 across provider catalogs.
3. **Scenario 3: Asian Cinema & Anime Workflows**
   - Resolves and verifies streams for anime (`one-piece`, `sayonara-lara`) and historical drama (`hoa-khai-cam-tu`).
4. **Scenario 4: High-Concurrency Burst & 24h LRUCache Verification**
   - Fires 25 concurrent requests to `/stream/movie/tt1375666.json`.
   - Validates that subsequent requests are served instantly from LRUCache with 100% data consistency.
5. **Scenario 5: HLS Playlist & Segment Streamability**
   - Verifies `/hls/manifest.m3u8` rewrites child playlist/TS segments correctly with CORS and MIME overrides (`video/mp2t`).

---

## 6. Execution Command & Automation

The entire 4-tier test suite is automated and executable with standard Node.js without external runner dependencies:

```bash
# Run complete E2E test suite
node tests/e2e.test.js
```

### Exit Codes:
- `0`: All test tiers passed successfully.
- `1`: One or more test assertions failed (with detailed failure diagnostics printed).
