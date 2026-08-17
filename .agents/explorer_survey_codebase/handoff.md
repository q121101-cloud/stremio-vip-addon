# Codebase & Architecture Survey Report — VIP Movies Addon Engine v1.5.0

**Working Directory**: `/Users/quan/.gemini/antigravity/scratch/stremio-nguonc-addon`  
**Explorer Agent**: `explorer_survey_codebase`  
**Timestamp**: 2026-08-17T14:56:00Z  

---

## 1. Observation

### 1.1 Repository Structure & Existing Inventory
The codebase is an Express-based Stremio/Nuvio addon at Engine version `1.4.0` with the following active file structure:
- **Root**: `package.json` (v1.4.0), `src/index.js` (Express entry point), `PROJECT.md`, `README.md`, `test_all.js`, `e2e_test.js`.
- **`src/`**:
  - `src/manifest.js` (Defines `BASE_MANIFEST`, `GENRES`, `COUNTRIES`, and `ALL_CATALOGS` — currently only 8 catalogs).
  - `src/config.js` (Base64URL configuration encoder/decoder with `VALID_PROVIDERS = ['nguonc', 'kkphim', 'vsmov']`).
  - `src/handlers.js` (Stream aggregator, catalog/meta router, interactive HTML configurator dashboard).
  - `src/mapper.js` (NguonC parser, title/year normalization, episode parsing, embed extractor).
  - `src/api.js` (NguonC REST client with NodeCache).
  - `src/lib/cinemeta.js` (Cinemeta official metadata resolver + 24h LRUCache).
  - `src/lib/cache.js` (LRUCache memory engine).
- **`src/routes/`**:
  - `src/routes/hls.js` (HLS proxy router: `/hls/manifest.m3u8`, `/hls/extract`, `/hls/ts`).
  - `src/routes/manifest.js` (Dynamic manifest router & `/:config` middleware).
- **`src/providers/`**:
  - `src/providers/kkphim.js` (KKPhim provider querying `https://phimapi.com`).
  - `src/providers/nguonc.js` (NguonC provider querying `https://phim.nguonc.com/api`).
  - `src/providers/vsmov.js` (VsMov web scraper targeting `vsmov.com`, `streamvsmov.com`, `vsmov.net`).
- **`tests/`**:
  - 23 test files present, including `tests/test_kkphim_playback.js`, `tests/e2e.test.js`, `tests/fixtures.js`.
  - **MISSING**: `tests/verify_playback.js` (mandated by R6).

---

### 1.2 Direct Requirement Comparison (R1 through R7)

#### Requirement R1: HLS Proxy Anti-403 & Full Segment Rewriter (`src/routes/hls.js`)
*Observations:*
1. **Segment Route Mismatch**:
   - `src/routes/hls.js:287` exposes `router.get('/ts', ...)` and line 271 rewrites segments to `${protoHost}/hls/ts?url=${b64Url}&ref=${encodedRef}`.
   - Requirement R1 explicitly specifies `/hls/segment.ts` for segment piping and rewriting.
2. **Key Route Mismatch**:
   - `src/routes/hls.js:231` rewrites `#EXT-X-KEY` to `${protoHost}/hls/ts?url=${b64Key}&ref=${encodedRef}&is_key=1`.
   - Requirement R1 mandates dedicated key endpoint: `${baseUrl}/hls/key?url=...&ref=...`.
3. **HTTP Range (206 Partial Content) Support**:
   - `src/routes/hls.js:311-323` executes Axios `GET` without forwarding `req.headers.range` to upstream CDNs.
   - Does not pass HTTP 206 status, `Content-Range`, or `Accept-Ranges: bytes` response headers back to client.
4. **Header Enforcement**:
   - `/hls/manifest.m3u8` (`src/routes/hls.js:161-165`): Sets `Content-Type: application/vnd.apple.mpegurl; charset=utf-8` and CORS, but lacks `Cache-Control: no-cache, no-store`.
   - `/hls/ts` (`src/routes/hls.js:295, 308`): Sets `Content-Type: video/mp2t` (lowercase) and `Cache-Control: public, max-age=86400` instead of `Content-Type: video/MP2T` and `Cache-Control: public, max-age=31536000, immutable`.

#### Requirement R2: Multi-Provider Architecture (`src/providers/`)
*Observations:*
1. **VSMOV 4K Engine (`src/providers/vsmov.js`)**:
   - Lines 25-29 define fallback gateways `https://streamvsmov.com` and `https://vsmov.net` which fail with `ENOTFOUND` during search.
   - Does not integrate official `https://vsmov.com/api` or direct IMDb/TMDB/Keyword lookup.
   - Emits fallback `externalUrl` (`vsmov.js:276`), violating in-app exclusivity.
   - Stream titles are `[VIP • VsMov] Vietsub Full HD (HLS Proxy)` instead of `[VIP 1 • VSMOV] Master 4K Ultra HD (3840x2160) (HLS Proxy)` and `[VIP 1 • VSMOV] Thuyết Minh Full HD (HLS Proxy)`.
2. **KKPhim Engine (`src/providers/kkphim.js`)**:
   - Official API integration with `phimapi.com` and `/imdb/title/${imdbId}` direct lookup is working.
   - Title format (`kkphim.js:410`) is `[VIP • KKPhim] ${cleanServerName}${epLabel} Full HD (HLS Proxy)` instead of `[VIP 2 • KKPhim] Vietsub Full HD (HLS Proxy)` and `[VIP 2 • KKPhim] Thuyết Minh Full HD (HLS Proxy)`.
3. **NguonC Engine (`src/providers/nguonc.js`)**:
   - Emits fallback `externalUrl` streams (`nguonc.js:377`), violating in-app exclusivity.
   - Titles are formatted as `[VIP • NguonC]` instead of `[VIP 3 • NguonC] Vietsub / Thuyết Minh (HLS Proxy)`.
4. **Specialized Providers**:
   - `src/providers/stp.js` (Western Cinema & K-Drama / `suutamphim.org` / `tvhay`) — **MISSING**.
   - `src/providers/hh3d.js` (3D Donghua / Xianxia / Perfect World, Swallowed Star) — **MISSING**.
   - `src/providers/yan.js` (3D Donghua / Ongoing) — **MISSING**.
   - `src/providers/clbpx.js` (Classic Wuxia / Kim Dung & TVB) — **MISSING**.

#### Requirement R3: Routing & Search 404 Prevention (`src/index.js` & `src/routes/manifest.js`)
*Observations:*
1. **Route Prefix Mounting**:
   - Stremio and Nuvio request paths both with `/:config/` and without.
   - `src/routes/manifest.js:141-150` intercepts `/:config` and rewrites `req.url`, but explicit route registrations for `/:config/catalog/:type/:id.json`, `/:config/catalog/:type/:id/:extra.json`, and `/:config/stream/:type/:id.json` are not mounted as primary routes on `handlers.js`.
2. **Extra Parameter Parsing**:
   - `src/handlers.js:48-59` parses `extraParam` by splitting on `&` and `=`, but edge cases with URL-encoded characters (e.g. `search%3DSpider-Man` or mixed query parameters) can bypass extraction.
   - Search requests across global catalogs must fan out across active providers and guarantee HTTP 200 `{ metas: [...] }` without ever returning 404.

#### Requirement R4: 22 Catalogs K20 Standard (`src/manifest.js`)
*Observations:*
1. `src/manifest.js:63-167` defines only 8 catalogs (4 NguonC + 4 KKPhim).
2. Missing 14 standard catalogs:
   - VSMOV (2): `vsmov-4k` (VSMOV • 4K Ultra HD VIP), `vsmov-tm` (VSMOV • Thuyết Minh 4K)
   - KKPhim (4): `kkphim-phim-le`, `kkphim-phim-bo`, `kkphim-phim-rap`, `kkphim-hoat-hinh`
   - NguonC (4): `nguonc-phim-le`, `nguonc-phim-bo`, `nguonc-phim-rap`, `nguonc-phim-moi`
   - STP (4): `stp-au-my`, `stp-phim-le`, `stp-phim-bo`, `stp-han-quoc`
   - HH3D (3): `hh3d-phim-le`, `hh3d-phim-bo`, `hh3d-tien-hiep`
   - YAN (3): `yan-phim-le`, `yan-phim-bo`, `yan-dang-chieu`
   - CLBPX (2): `clbpx-kiem-hiep`, `clbpx-hong-kong`
   Total standard: 2 + 4 + 4 + 4 + 3 + 3 + 2 = 22 catalogs.

#### Requirement R5: Fail-Safe Stream Aggregation & Metadata Resolution (`src/handlers.js`)
*Observations:*
1. `src/lib/cinemeta.js` correctly queries `https://v3-cinemeta.strem.io/meta/${type}/${imdbId}.json` and caches responses for 24h.
2. `src/handlers.js:617-619` calls `Promise.allSettled` but does not enforce a strict 4000ms per-provider `Promise.race` timeout wrapper.
3. Stream sanitization (`src/handlers.js:643-647`) still passes `externalUrl` when present, violating Acceptance Criteria line 84: *"In-app stream objects strictly contain url and NO externalUrl"*.

#### Requirement R6: Mandatory Playback Verification Test (`tests/verify_playback.js`)
*Observations:*
1. `tests/verify_playback.js` does not exist in the repository.
2. Existing `tests/test_kkphim_playback.js` only tests KKPhim single movie `cuu-mon` against `/hls/ts`.

#### Requirement R7: UI Preservation, Versioning & Deployment
*Observations:*
1. `package.json:3` and `src/manifest.js:173` specify version `1.4.0` instead of `1.5.0`.
2. Cyber-Glassmorphism CSS in `src/handlers.js:112-234` is preserved with background aurora orbs, frosted glass cards, and glowing footer signature `VIP Movies Addon v1.4.0 • Powered by <span class="brand-highlight">Q121101</span>`. Version string in header and footer must be updated to `v1.5.0`.

---

## 2. Logic Chain

1. **Premise (R1 HLS Streaming & Black Screen Prevention)**: Stremio/Nuvio video players require direct Range request forwarding (`206 Partial Content`), immutable caching for segment chunks, and rewritten segment URIs matching `/hls/segment.ts` and `/hls/key`.
   - *Direct Evidence*: `src/routes/hls.js` lacks `Range` header forwarding and writes `/hls/ts`. Upstream TS chunks seeking in Stremio triggers playback failure or black screens when Range is ignored.
   - *Inference*: Updating `src/routes/hls.js` to expose `/hls/segment.ts` (with alias `/hls/ts` for backwards compatibility), `/hls/key`, forwarding `req.headers.range`, returning HTTP 206 with `Content-Range`, and setting `video/MP2T` with `Cache-Control: public, max-age=31536000, immutable` directly resolves black screen playback and seeking issues.

2. **Premise (R2 & R5 Multi-Provider & Exclusivity)**: Multi-source aggregation requires all providers to return strictly in-app HLS Proxy streams (`url` only, no `externalUrl`).
   - *Direct Evidence*: `src/providers/vsmov.js:276`, `src/providers/nguonc.js:377`, and `src/handlers.js:643` attach `externalUrl`, causing Stremio to prompt users to open external web browsers instead of playing directly inside the app.
   - *Inference*: Removing `externalUrl` across all providers and standardizing stream title formatting (`[VIP 1 • VSMOV]`, `[VIP 2 • KKPhim]`, `[VIP 3 • NguonC]`, `[VIP 4 • STP]`, `[VIP 5 • HH3D]`, `[VIP 6 • YAN]`, `[VIP 7 • CLBPX]`) ensures 100% compliant in-app playback.

3. **Premise (R3 & R4 Routing & 22 Catalogs)**: Stremio and Nuvio clients issue requests across 22 catalog IDs with and without `/:config/` path prefixes.
   - *Direct Evidence*: `src/manifest.js` currently only defines 8 catalogs. Any request for the other 14 standard catalogs or prefixed catalog searches will hit 404 or empty fallback.
   - *Inference*: Explicitly defining all 22 catalogs in `src/manifest.js`, mounting explicit `/:config/catalog/...`, `/:config/stream/...`, `/:config/meta/...` routes in Express, and wrapping search in a unified provider dispatcher guarantees zero 404 errors.

4. **Premise (R6 & R7 Verification & Quality Assurance)**: Automated verification must execute against real video TS chunks (>50KB) on ephemeral ports.
   - *Direct Evidence*: `node tests/test_kkphim_playback.js` downloaded 946KB with sync byte `0x47`. Creating `tests/verify_playback.js` covering both movie (e.g. Spider-Man / Avengers) and series (e.g. Silo) with `/hls/segment.ts` and Range verification will satisfy R6 and Acceptance Criteria.

---

## 3. Caveats

1. **Upstream Gateway Availability**: Secondary domain gateways for VSMOV (`streamvsmov.com`, `vsmov.net`) are currently unreachable via DNS; provider implementation must prioritize `https://vsmov.com/api` and `https://vsmov.com` with graceful failover.
2. **Specialized Providers Upstream Source**: Specialized providers (`stp`, `hh3d`, `yan`, `clbpx`) should be designed with resilient upstream endpoints, Cinemeta matching, and fallback mechanisms so network fluctuations on individual sources never block stream aggregation.
3. **No Code Modified During Survey**: In strict compliance with read-only investigation mode, no project source code was modified during this survey.

---

## 4. Conclusion & Actionable Implementation Roadmap

The survey reveals a solid, high-performance foundational architecture (Express + LRUCache + Cinemeta resolver) that requires a focused overhaul in 6 concrete areas to achieve full Engine v1.5.0 compliance:

| Milestone / Task | Target Files | Specific Required Actions |
|---|---|---|
| **M1. HLS Proxy & Segment Rewriter** | `src/routes/hls.js` | Implement `/hls/segment.ts` & `/hls/key`; add HTTP Range (206) request forwarding and `Content-Range`; enforce `video/MP2T`, `public, max-age=31536000, immutable`, `Cache-Control: no-cache, no-store` on manifest. |
| **M2. Multi-Provider Architecture** | `src/providers/vsmov.js`, `kkphim.js`, `nguonc.js`, `stp.js`, `hh3d.js`, `yan.js`, `clbpx.js` | Update VSMOV 4K engine; integrate specialized providers; update title badges (`[VIP 1]`, `[VIP 2]`, etc.); eliminate all `externalUrl` properties. |
| **M3. 22 Standard K20 Catalogs** | `src/manifest.js`, `src/config.js` | Define all 22 standard catalogs (VSMOV 2, KKPhim 4, NguonC 4, STP 4, HH3D 3, YAN 3, CLBPX 2); update `VALID_PROVIDERS`. |
| **M4. Routing & 404 Prevention** | `src/index.js`, `src/routes/manifest.js`, `src/handlers.js` | Explicitly mount `/:config/` and root routes; sanitize and robustly parse `extra` parameter for `search=`, `genre=`, `skip=`; add 4000ms provider timeout. |
| **M5. E2E Playback Test Suite** | `tests/verify_playback.js` | Create automated E2E test verifying ephemeral server, movie & series stream resolution, `/hls/manifest.m3u8` rewriting, and `/hls/segment.ts` binary chunk download (>50KB) with HTTP 200/206. |
| **M6. Versioning & UI Polish** | `package.json`, `src/manifest.js`, `src/handlers.js` | Bump version to `1.5.0`; retain Cyber-Glassmorphism UI, update multi-provider selector, and keep glowing signature `VIP Movies Addon v1.5.0 • Powered by <span class="brand-highlight">Q121101</span>`. |

---

## 5. Verification Method

To independently verify the findings and test subsequent fixes:
1. **Syntax Check**:
   ```bash
   node --check src/index.js
   node --check src/**/*.js
   ```
2. **Current KKPhim E2E Benchmark**:
   ```bash
   node tests/test_kkphim_playback.js
   ```
3. **Target Verification Command (once M5 implemented)**:
   ```bash
   node tests/verify_playback.js
   ```
4. **All Test Suites Check**:
   ```bash
   node tests/e2e.test.js
   ```
