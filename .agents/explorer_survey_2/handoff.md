# Handoff Report: Explorer 2 Survey Phase (v1.5.0)

## 1. Observation

Direct observations from the investigation of `stremio-nguonc-addon`:

1. **Routing & Express Setup (`src/index.js` lines 64-88)**:
   - `app.use('/hls', hlsRouter)` mounts the HLS proxy router.
   - `app.use('/', manifestRouter)` mounts the dynamic manifest router (`GET /manifest.json`, `GET /:config/manifest.json`).
   - `app.use('/', handlers)` mounts the catalog, meta, stream, and UI route handlers.
   - Explicit routes are declared for both unconfigured and `/:config`-prefixed paths in `src/handlers.js`:
     - Lines 643-650: `/catalog/:type/:id/:extra.json`, `/catalog/:type/:id.json`, `/:config/catalog/:type/:id/:extra.json`, `/:config/catalog/:type/:id.json`
     - Lines 771-774: `/meta/:type/:id.json`, `/:config/meta/:type/:id.json`
     - Lines 983-986: `/stream/:type/:id.json`, `/:config/stream/:type/:id.json`

2. **Cinemeta Resolution (`src/lib/cinemeta.js` lines 16-172, `src/handlers.js` lines 843-860)**:
   - Uses `axios.create({ baseURL: 'https://v3-cinemeta.strem.io', timeout: 5000 })`.
   - Caches successful resolutions in `cinemetaCache` (LRU) for 24h (`CACHE_TTL_SUCCESS = 86400`) and negative results (404) for 1h (`CACHE_TTL_FAILURE = 3600`).
   - Uses `inflightRequests` Map for single-flight deduplication.
   - Parses canonical name, 4-digit release year (`parseYear`), genres (`parseGenres`), and aliases (`parseAliases`).
   - Fallback behavior: Catch block returns `null` safely without throwing, allowing providers to fall back to direct IMDb lookup (`/api/movie?imdb=...` or `/imdb/title/...`).

3. **Concurrency & Stream Aggregator (`src/handlers.js` lines 137-148, 922-980)**:
   - Timeout isolation helper `withTimeout(promise, 4000, label)` implements `Promise.race([promise, timeoutPromise])` with `clearTimeout` in `.finally()`.
   - `handleStream` executes all active configured providers concurrently using `Promise.allSettled(providersToRun.map(p => withTimeout(p.getStreams(payload), 4000, ...)))`.
   - Results are sanitized: `externalUrl` is explicitly deleted (`delete sanitized.externalUrl`), `url` is preserved, priority sorted (VSMOV 4K rank 10 -> KKPhim rank 30 -> NguonC rank 50 -> Specialized rank 70-100), and deduplicated via `normalizeStreamKey`.
   - Always returns HTTP 200 `{ streams: [...] }` (or `{ streams: [] }` on error).

4. **22 K20 Standard Catalogs (`src/manifest.js` lines 63-363, `src/config.js` lines 12-23)**:
   - `ALL_CATALOGS` in `src/manifest.js` declares exactly 22 catalogs:
     - 2 VSMOV catalogs (`vsmov-4k`, `vsmov-thuyet-minh`)
     - 4 KKPhim catalogs (`kkphim-movie-latest`, `kkphim-series-latest`, `kkphim-cinema-latest`, `kkphim-anime-latest`)
     - 4 NguonC catalogs (`nguonc-movie-latest`, `nguonc-series-latest`, `nguonc-cinema-latest`, `nguonc-anime-latest`)
     - 4 STP catalogs (`stp-au-my`, `stp-phim-le`, `stp-phim-bo`, `stp-han-quoc`)
     - 3 HH3D catalogs (`hh3d-phim-le`, `hh3d-phim-bo`, `hh3d-tien-hiep`)
     - 3 YAN catalogs (`yan-phim-le`, `yan-phim-bo`, `yan-dang-chieu`)
     - 2 CLBPX catalogs (`clbpx-kiem-hiep`, `clbpx-hong-kong`)
   - `DEFAULT_CONFIG` in `src/config.js` includes all 7 providers (`vsmov`, `kkphim`, `nguonc`, `stp`, `hh3d`, `yan`, `clbpx`) and all 4 categories (`movie`, `series`, `anime`, `cinema`).

5. **Code Duplication Finding (`grep_search` results)**:
   - `function scoreMatch` is declared locally in 8 files: `src/lib/utils.js:212`, `src/providers/vsmov.js:73`, `src/providers/kkphim.js:70`, `src/providers/nguonc.js:52`, `src/providers/stp.js:52`, `src/providers/hh3d.js:52`, `src/providers/yan.js:52`, `src/providers/clbpx.js:52`.
   - `function escapeRegExp` is declared locally in 8 files: `src/lib/utils.js:65`, `src/providers/vsmov.js:48`, `src/providers/kkphim.js:52`, `src/providers/nguonc.js:44`, `src/providers/stp.js:44`, `src/providers/hh3d.js:44`, `src/providers/yan.js:44`, `src/providers/clbpx.js:44`.

6. **Empirical Test Runs**:
   - `node --check src/index.js src/handlers.js src/manifest.js src/config.js src/lib/cinemeta.js src/lib/utils.js`: Exited code 0 (Syntax valid).
   - `node tests/test_routing_and_22_catalogs.js`: 64 passed, 0 failed.
   - `node tests/verify_playback.js`: All 6 phases passed (manifest check, movie stream, series stream, playlist rewriting, 3.4MB video segment download with sync byte 0x47, HTTP 206 range request).
   - `npm test`: 50 passed, 0 failed.

---

## 2. Logic Chain

1. **Routing Verification (From Observation 1 & 6)**:
   - The dual route registration (default root and `/:config` prefix) in `src/routes/manifest.js` and `src/handlers.js` ensures that both standard Stremio installations and customized token installations resolve without 404s.
   - Empirical validation across 64 endpoint variations confirmed 100% reachability.

2. **Cinemeta & Metadata Resilience (From Observation 2 & 6)**:
   - The 3-tier resolution architecture (LRU cache -> In-flight dedup -> Axios with 5s timeout -> Fallback negative cache) provides protection against upstream Cinemeta rate-limiting or downtime.
   - The stream aggregator never fails if Cinemeta fails, as providers fall back to direct IMDb ID API querying.

3. **Concurrency & Stream Quality (From Observation 3 & 6)**:
   - `Promise.allSettled()` combined with `withTimeout(..., 4000)` ensures that a lagging provider cannot delay the stream response beyond 4 seconds.
   - Stream ranking correctly orders 4K streams first, followed by HD Vietsub and Thuyết Minh.
   - The strict deletion of `externalUrl` satisfies the Stremio in-app player contract.

4. **Catalog Completeness (From Observation 4 & 6)**:
   - All 22 catalogs across 7 providers are operational and return valid Stremio metadata.
   - Filtering via `buildManifest(config)` correctly limits catalogs to enabled providers and categories.

5. **Code Consolidation Recommendation (From Observation 5)**:
   - All 7 providers duplicate `scoreMatch` and `escapeRegExp`. `src/lib/utils.js` already exports standard implementations.
   - Consolidating imports in `src/providers/*.js` satisfies R1 requirement and prevents logic divergence.

---

## 3. Caveats

- **External Upstream APIs**: Upstream third-party streaming APIs (`vsmov.com`, `phimapi.com`, `phim.nguonc.com`, `suutamphim.org`, `hoathinh3d`, `yandonghua`, `clbphimxua`) are external dependencies. While timeouts and fail-safes are active, availability of specific third-party streams depends on their server status.
- **Search Query Formatting**: Search queries in Stremio usually follow `/catalog/:type/:id/search=:query.json`. If a client sends `/catalog/:type/search=:query.json` without `:id`, handlers should treat `:id` as extra to ensure 100% fault-tolerance.

---

## 4. Conclusion

The core routing, handlers, stream aggregator, Cinemeta resolution, and 22 standard K20 catalogs in Stremio VIP Movies Addon v1.5.0 are architecturally sound, thoroughly tested, and ready for production deployment. The only remaining maintenance item is consolidating the duplicated `scoreMatch` and `escapeRegExp` helper functions in the 7 provider files to strictly import from `src/lib/utils.js`.

---

## 5. Verification Method

To independently verify all findings:

1. **Syntax Integrity**:
   ```bash
   node --check src/index.js src/handlers.js src/manifest.js src/config.js src/lib/cinemeta.js src/lib/utils.js
   ```
2. **22 Catalogs & 404 Routing Verification**:
   ```bash
   node tests/test_routing_and_22_catalogs.js
   ```
3. **Real Video Playback & Binary Chunk Verification**:
   ```bash
   node tests/verify_playback.js
   ```
4. **Integration Test Suite**:
   ```bash
   npm test
   ```
5. **Inspect Generated Survey Report**:
   ```bash
   cat .agents/explorer_survey_2/survey_report.md
   ```
