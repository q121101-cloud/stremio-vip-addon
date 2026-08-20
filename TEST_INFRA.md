# Test Infrastructure & Methodology Specification (TEST_INFRA.md)

## Executive Summary
This document defines the formal quality assurance methodology, architectural test harness design, test tier topology, and verification protocols for `stremio-nguonc-addon` — an enterprise-grade Stremio v4 & Nuvio Addon aggregating Vietnamese streaming providers (KKPhim, VSMOV 4K, NguonC) with anti-403 HLS proxying, Cinemeta IMDb mapping, Supabase caching, and Cyber-Glassmorphism UI.

---

## 1. Testing Methodologies & Design Principles

### 1.1 Category-Partition Method
The Category-Partition method decomposes the functional input space of each module into independent categories, identifies distinct equivalence classes (partitions), and constructs tests covering all valid and boundary combinations.

| Domain / Component | Input Category | Equivalence Partitions |
|---|---|---|
| **Provider Selection** | Active Provider Bitmask | `{none: 0, nguonc_only: 1, kkphim_only: 2, vsmov_only: 4, all: 7, custom: 3,5,6}` |
| **Catalog Requests** | Media Type & Category | `{movie: ['phim-le', 'phim-chieu-rap'], series: ['phim-bo', 'hoat-hinh', 'tv-shows']}` |
| **Catalog Pagination** | `skip` Parameter | `{initial: 0, first_page: 20, nth_page: 100, extreme: 10000, invalid: -20, NaN}` |
| **IMDb / Cinemeta** | ID Format | `{canonical_movie: 'tt1375666', canonical_series: 'tt7458054:1:1', unmapped: 'tt9999999', malformed: 'invalid_id'}` |
| **Episode Matching** | Series Episode Key | `{vietnamese_std: 'Tập 1', padded: '01', alt_tag: 'Vietsub 01', raw_num: '1', edge: 'Tập 01 (End)', out_of_range: '99'}` |
| **Anti-403 Proxy** | Target Upstream CDN | `{streamc: '*.streamc.xyz', phimapi: 'vlcdn.net', vsmov: 'streamvsmov.com', generic: 'other.cdn.com'}` |
| **HTTP Range Seeking**| Byte Range Header | `{full: 'bytes=0-', subrange: 'bytes=100-500', end_only: 'bytes=-500', invalid: 'bytes=500-100', out_of_bounds: 'bytes=999999-'}` |
| **Cache Tiering** | Storage Target | `{L1_hit: RAM, L1_miss_L2_hit: Supabase, L1_miss_L2_miss: Upstream, offline_db: L1_only}` |
| **UI Configurator** | Token Format | `{bitmask: '127', base62: 'Zz', base64url_json: 'eyJwcm92aWRlcnMiOlsi...']', empty: ''}` |

---

### 1.2 Boundary Value Analysis (BVA)
BVA tests the edge conditions where algorithmic and structural bugs concentrate:
1. **Numeric Boundaries**:
   - Page calculation: `skip=0` ($\to$ page 1), `skip=19` ($\to$ page 1), `skip=20` ($\to$ page 2).
   - Bitmask ranges: `0` (no features), `127` (all 7 features), `3847` (extended bitmask), `65535` (boundary uint16).
   - Season/Episode numbering: Season 1 Episode 1 ($\min$), Episode 0 ($\text{special}$), Episode 100+ ($\text{long-running anime}$).
2. **String & Payload Boundaries**:
   - Zero-length strings (`""`), single-character queries (`"a"`), multi-byte UTF-8 Vietnamese diacritics (`"Cửu Môn"`, `"Phàm Nhân Tu Tiên"`).
   - Punctuation-dense titles (`"Taxi Driver 2: Special Edition - The Beginning"`).
   - Malformed base64url padding and illegal characters (`"??invalid=="`).
3. **Network & Protocol Boundaries**:
   - Upstream HTTP status codes: `200 OK`, `206 Partial Content`, `403 Forbidden` (WAF block), `404 Not Found`, `422 Unprocessable Entity`, `500/502/504 Gateway Error`.
   - Latency thresholds: Immediate responses (<50ms), borderline responses (2900ms), timeout cutoff (3000ms threshold for circuit breakers).
4. **Buffer & Stream Boundaries**:
   - Zero-byte files, 1-byte chunks, oversized segments (>50MB), sliced buffer ranges (`buffer.subarray(start, end + 1)`).

---

### 1.3 Pairwise Combinatorial Testing
Pairwise testing systematically validates multi-variable interactions across orthogonal axes to catch unforeseen integration failures:
- **Axis 1 (Providers)**: KKPhim $\times$ VSMOV $\times$ NguonC ($2^3 = 8$ states).
- **Axis 2 (Categories)**: Phim Lẻ $\times$ Phim Bộ $\times$ Hoạt Hình $\times$ Chiếu Rạp ($2^4 = 16$ states).
- **Axis 3 (Audio Modes)**: Vietsub $\times$ Thuyết Minh $\times$ Lồng Tiếng.
- **Axis 4 (Stream Format)**: Direct M3U8 $\times$ Proxied M3U8 with dynamic Referer/Origin $\times$ AES-128 Encrypted $\times$ WebVTT Subtitle Injection.
- **Axis 5 (Config Transports)**: Query Parameter $\times$ Base64URL Path $\times$ Bitmask Path $\times$ Default Fallback.

---

### 1.4 Real-World Workloads (Scenario-Based E2E Testing)
Simulates end-to-end user journeys replicating realistic client applications (Stremio Desktop v4, Stremio Web, Stremio Android TV, Nuvio):
1. **Onboarding & Configuration Workflow**: User accesses dashboard $\to$ configures custom provider bitmask $\to$ generates TV installation QR Code $\to$ verifies generated manifest URL.
2. **Catalog Browsing & Search Workflow**: User opens Stremio $\to$ fetches manifest $\to$ queries categorical feeds $\to$ pages through results $\to$ executes keyword search $\to$ inspects metadata cards.
3. **Single Movie Instant Playback**: User clicks IMDb movie $\to$ resolves Cinemeta metadata $\to$ dispatches concurrent multi-provider queries $\to$ prioritizes 4K UHD VIP streams $\to$ fetches rewritten M3U8 manifest $\to$ streams binary video chunks through anti-403 reverse proxy with HTTP 206 seeking.
4. **Binge-Watching Series Progression**: User starts Season 1 Episode 1 $\to$ verifies episode matching and stream quality $\to$ advances sequentially to Episode 2 $\to$ validates `bingeGroup` continuity and audio stream selection.
5. **Anti-WAF Failover & Resiliency**: Protected upstream CDN returns 403 Forbidden $\to$ proxy auto-injects dynamic spoofed Referer/Origin headers $\to$ Serverless environment detects AWS IP and automatically routes via Render backend fallback.
6. **Tiered Caching & Offline DB Lifecycle**: Initial stream request hits cold database $\to$ populates L1 RAM + L2 Supabase $\to$ subsequent requests return in <5ms $\to$ DB connection dropped $\to$ system degrades gracefully to L1 in-memory mode without throwing exceptions $\to$ admin executes `scripts/flush_cache.js`.

---

## 2. Test Architecture & Directory Topology

```
stremio-nguonc-addon/
├── tests/
│   ├── tier1_features.test.js       # Tier 1: Feature Coverage (>=5 tests per feature, 11 feature areas)
│   ├── tier2_boundaries.test.js     # Tier 2: Boundary Value Analysis, Edge Cases & Error Handling
│   ├── tier3_combinations.test.js   # Tier 3: Pairwise Combinatorial & Cross-Provider Permutations
│   ├── tier4_workloads.test.js      # Tier 4: Realistic Real-World End-to-End User Journeys
│   └── fixtures/                    # Mined upstream responses, M3U8 manifests, and sample payloads
├── TEST_INFRA.md                    # This document
└── TEST_READY.md                    # Test execution summary, matrix, and runner commands
```

---

## 3. Feature Coverage Matrix (Tier 1 Breakdown)

Every feature in the `PROJECT.md` Feature Inventory is verified by at least 5 dedicated unit/contract tests in `tier1_features.test.js`:

| # | Feature Area | Key Test Behaviors Verified (>= 5 Tests) |
|---|---|---|
| 1 | **KKPhim Provider** | (1) Catalog fetch (`phim-le`, `phim-bo`), (2) Pagination limit, (3) Keyword search, (4) Movie detail mapping, (5) Direct M3U8 stream resolution & poster CDN prefixing. |
| 2 | **VSMOV 4K Provider** | (1) 4K catalog listing, (2) Search with IMDb/TMDB ID mapping, (3) Movie detail parsing, (4) Master M3U8 extraction from UUID, (5) WebVTT subtitle track extraction & multi-audio classification (Vietsub, Thuyết Minh, Lồng Tiếng). |
| 3 | **NguonC Provider** | (1) Phim mới/categorical feeds, (2) Search API, (3) Detail & StreamC embed parsing, (4) `data-obf` Base64 JSON de-obfuscation (`sUb`, `hD`), (5) Proactive Vercel proxy fallback & retry. |
| 4 | **Manifest Generator** | (1) Valid Stremio v4 schema, (2) Config-aware provider filtering, (3) Config-aware category filtering, (4) ID prefix declarations (`tt`, `kkphim:`, `vsmov:`, `nguonc:`), (5) Configurable behaviorHints. |
| 5 | **Catalog Router** | (1) `/catalog/:type/:id.json` routing, (2) Pagination skip calculation (`skip=20` $\to$ `page=2`), (3) Genre extra parameter filtering, (4) Search query handling, (5) Empty catalog graceful array return. |
| 6 | **Meta Router** | (1) Movie metadata mapping, (2) Series `videos` array generation with season/episode numbers, (3) Poster/background image normalization, (4) 404 response on non-existent items, (5) Config token forwarding. |
| 7 | **Stream Aggregator** | (1) Movie stream aggregation across 3 providers, (2) Series episode-specific stream resolution, (3) Quality priority ordering (4K UHD $\to$ FHD $\to$ HD), (4) Audio separation & bingeGroup tagging, (5) WebVTT subtitle track attachment. |
| 8 | **Anti-403 HLS Proxy** | (1) Dynamic Referer/Origin header calculation for StreamC/KKPhim/VSMOV, (2) Master playlist rewriting (`/hls/manifest.m3u8`), (3) Segment URL rewriting (`/hls/segment.ts`), (4) AES-128 decryption key rewriting (`/hls/key`), (5) Subtitle track injection into master playlist. |
| 9 | **Cinemeta & Matcher** | (1) Cinemeta IMDb metadata resolution (`tt...`), (2) Known Asian Drama title dictionary mapping, (3) Bigram title similarity scoring, (4) Series season/episode regex parser (`Tập 1`, `01`, `Ep 1`), (5) Multi-keyword search expansion. |
| 10 | **Caching & Resiliency**| (1) L1 NodeCache in-memory hit/miss lifecycle, (2) L2 Supabase PostgreSQL caching, (3) Graceful offline degradation when DB unconfigured, (4) `flushStreamCache` & `flushAllCache` operations, (5) `scripts/flush_cache.js` CLI execution. |
| 11 | **Dashboard UI & Config**| (1) `GET /` HTML delivery with Cyber-Glassmorphism structure, (2) Base64URL and 16-bit bitmask encoder/decoder, (3) Spring-physics toggle state mapping, (4) Live stream simulator rendering logic, (5) Offline QR code installation generator. |

---

## 4. Test Execution & Reporting

- **Test Framework**: Vitest `v4.x` (native ESM + CJS support, high concurrency, zero setup overhead).
- **Run Command**:
  ```bash
  npx vitest run
  ```
- **Isolated Tier Runs**:
  ```bash
  npx vitest run tests/tier1_features.test.js
  npx vitest run tests/tier2_boundaries.test.js
  npx vitest run tests/tier3_combinations.test.js
  npx vitest run tests/tier4_workloads.test.js
  ```
- **Readiness Metric**: 100% Pass Rate across all 4 Tiers with zero syntax or unhandled rejection errors.
