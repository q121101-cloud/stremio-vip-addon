# Survey Report: Test Infrastructure, Ephemeral Server Lifecycle, KKPhim Playback & Git Environment

## 1. Observation

### 1.1 Existing Test Files & Test Infrastructure
Direct inspection of the repository revealed the following test files and test suites:
- **`tests/e2e.test.js`** (Lines 1–492): Comprehensive 4-tier test suite (Feature Coverage, Boundary Value Analysis, Pairwise Matrix, High-Concurrency Burst Stress) using `tests/helpers.js` and `tests/fixtures.js`.
- **`tests/helpers.js`** (Lines 1–187): Exports `TestRunner` (custom assertion/reporting engine with ANSI formatting) and `startTestServer(port)` (Lines 167–174).
- **`tests/fixtures.js`** (Lines 1–199): Fixtures for Cinemeta (Inception, Breaking Bad, One Piece), KKPhim (`movieDetail`, `seriesDetail`), NguonC (`movieDetail`), and VsMov.
- **`tests/provider_challenger.test.js`** (Lines 1–821): Milestone 2 test harness covering year matching, episode variation resolution, server name formatting, protocol exclusivity, and ephemeral server startup.
- **`tests/cinemeta_challenger.test.js`**, **`tests/test_cinemeta_deep.js`**, **`tests/test_cinemeta_edgecases.js`**: Deep test suites for Cinemeta resolution and LRUCache.
- **`tests/m2_challenger_empirical.test.js`**, **`tests/m3_challenger1_empirical.test.js`**, **`tests/m3_verification.test.js`**, **`tests/empirical_m3_challenger_2.js`**, **`tests/verification_simulation.test.js`**: Empirical verification harnesses for multi-provider and proxy sub-modules.
- **`src/test.js`** (Lines 1–255): Basic integration test suite (`npm test`) checking endpoints against `http://localhost:${PORT || 7000}`.
- **`test_all.js`** (Lines 1–91): E2E test script testing manifest, movies, series, anime, cổ trang endpoints.

### 1.2 Addon Server Architecture & Ephemeral Port Lifecycle
Direct inspection of `src/index.js` (Lines 1–131):
- `src/index.js` creates an Express app, attaches CORS middleware, request logging, `/hls` route (`src/routes/hls.js`), dynamic manifest route (`src/routes/manifest.js`), and Stremio handlers (`src/handlers.js`).
- Line 21: `const PORT = parseInt(process.env.PORT || '7000', 10);`
- Line 96: `const server = app.listen(PORT, HOST, () => { ... });` executes immediately upon module loading.
- Line 130: `module.exports = app;` exports the Express app instance.

**Ephemeral Port Startup Patterns Observed in Codebase:**
1. Pattern A (Direct ephemeral Express instance, as seen in `tests/provider_challenger.test.js:733-742`):
   ```javascript
   const express = require('express');
   const cors = require('cors');
   const hlsRouter = require('../src/routes/hls');
   const manifestRouter = require('../src/routes/manifest');
   const handlers = require('../src/handlers');

   const app = express();
   app.use(cors());
   app.use(express.json());
   app.use('/hls', hlsRouter);
   app.use('/', manifestRouter);
   app.use('/', handlers);

   const server = await new Promise((resolve, reject) => {
     const s = app.listen(0, '127.0.0.1', () => resolve(s));
     s.on('error', reject);
   });
   const port = server.address().port;
   const baseUrl = `http://127.0.0.1:${port}`;
   ```
2. Pattern B (Environment Variable `PORT=0` before `require('../src/index.js')`):
   When `process.env.PORT = '0'` is set before `src/index.js` is imported, Node binds to port `0` (ephemeral). However, `src/index.js` currently does not export the `server` handle directly (only `app`), making `server.address().port` or `server.close()` accessible only if `server` is attached to `app` (e.g. `app._server = server` or if the test spins up its own ephemeral listener).

### 1.3 Requirements & Live Empirical Probing for `tests/test_kkphim_playback.js`
Direct probing of KKPhim API (`https://phimapi.com/phim/cuu-mon`) and HLS streaming pipeline:
- **Upstream KKPhim Response for `cuu-mon`**:
  - `status`: `true`
  - `movie.name`: `"Cửu Môn"`
  - `episodes[0].server_name`: `"Vietsub"`
  - `episodes[0].server_data[0].link_m3u8`: `"https://s1.phim1280.tv/20230929/a3nZqLHv/index.m3u8"`
  - `episodes[0].server_data[0].link_embed`: `"https://player.phimapi.com/player/?url=https://s1.phim1280.tv/20230929/a3nZqLHv/index.m3u8"`
- **Live Empirical Stream & Segment Execution**:
  - `GET /stream/movie/kkphim_cuu-mon.json` on ephemeral port returned 2 KKPhim streams.
  - Test Case 1 stream: Title `[VIP • KKPhim] Vietsub (HLS Proxy)\n⚡ Phát trực tiếp trong App`, `url: http://127.0.0.1:PORT/hls/manifest.m3u8?url=...&ref=...`, `externalUrl: undefined`.
  - Test Case 2 Manifest Fetch: `GET /hls/manifest.m3u8?...` returned HTTP 200, `#EXTM3U`, and rewritten sub-playlist `http://127.0.0.1:PORT/hls/manifest.m3u8?b64=...&ref=...`. Sub-playlist returned HTTP 200 and rewritten segment links `http://127.0.0.1:PORT/hls/ts?b64=...&ref=...`.
  - Test Case 3 Segment Fetch: `GET /hls/ts?b64=...&ref=...` returned HTTP 200, `Content-Type: video/mp2t`, `byteLength: 946204` bytes (0.9 MB valid binary TS segment) with zero 403 Forbidden errors.

### 1.4 Git Repository Status & Syntax Checks
- **Git Branch & Remote**:
  - Branch: `main` (up to date with `origin/main`).
  - Remote: `origin https://github.com/q121101-cloud/stremio-vip-addon.git`.
- **Syntax Check (`node --check`)**:
  - `node --check src/index.js` → Exit 0 (Valid syntax).
  - `node --check src/handlers.js` → Exit 0 (Valid syntax).
  - `node --check src/routes/hls.js` → Exit 0 (Valid syntax).
  - `node --check src/routes/manifest.js` → Exit 0 (Valid syntax).
  - `node --check src/providers/kkphim.js` → Exit 0 (Valid syntax).
  - `node --check src/providers/nguonc.js` → Exit 0 (Valid syntax).
  - `node --check src/providers/vsmov.js` → Exit 0 (Valid syntax).

---

## 2. Logic Chain

1. **Test Infrastructure Analysis (from §1.1)**:
   The project has rich test patterns in `tests/e2e.test.js` and `tests/provider_challenger.test.js`. The test helper `TestRunner` in `tests/helpers.js` provides clean test grouping, assertion tracking, and failure summaries. Reusing `TestRunner` or building a standalone, self-contained test runner in `tests/test_kkphim_playback.js` ensures compatibility with `node tests/test_kkphim_playback.js`.

2. **Ephemeral Port Architecture (from §1.2)**:
   Hardcoded ports (e.g. 7000, 7412) are prone to `EADDRINUSE` conflicts during parallel testing or CI runs. Starting the server via `app.listen(0, '127.0.0.1')` lets the OS allocate a random free port dynamically, guaranteeing test isolation and zero port collision. The base URL `http://127.0.0.1:${server.address().port}` is then passed as `proxyBase` in stream requests.

3. **KKPhim In-App Playback Optimization Requirements (from §1.3 and ORIGINAL_REQUEST.md)**:
   - In `src/providers/kkphim.js`: Stream objects must strictly include `url` (`${proxyBase}/hls/manifest.m3u8?url=${encodeBase64(ep.link_m3u8)}&ref=${encodeBase64('https://player.phimapi.com/')}`) and omit `externalUrl`.
   - In `src/routes/hls.js`: Must inject `Referer: https://player.phimapi.com/`, `Origin: https://player.phimapi.com`, and `User-Agent: Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36` to guarantee anti-403 bypass for CDN hotlink protection across upstream CDNs (`*.phim1280.tv`, `*.kkphimplayer*.com`, `*.phimapi.com`).
   - In `tests/test_kkphim_playback.js`: All 3 test cases (Stream generation for `cuu-mon`, manifest proxy verification, segment binary playback verification) can be fully executed and verified end-to-end.

4. **Self-Debug & Verification Mandate (from §1.3 & §1.4)**:
   All source code passes `node --check`. Live probing demonstrated that the end-to-end stream generation -> manifest rewrite -> segment binary download works with HTTP 200.

---

## 3. Caveats

1. **Network Connectivity**: Upstream API calls (`phimapi.com` and `s1.phim1280.tv`) require outbound internet access (`BypassSandbox: true` in the tool runner environment). If running in an offline or heavily sandboxed environment, fallback to fixture or mocked axios calls should be considered if live network is unreachable.
2. **Dynamic CDN Domain Variations**: While `cuu-mon` currently uses `s1.phim1280.tv`, other KKPhim titles may use other CDN hostnames (`*.kkphimplayer*.com`, `s2.phimapi.com`). Ensuring `src/routes/hls.js` respects `ref` query parameter dynamically covers all such domains.

---

## 4. Conclusion

- The codebase is syntactically sound and ready for implementing `tests/test_kkphim_playback.js` and tuning `src/providers/kkphim.js` / `src/routes/hls.js`.
- Ephemeral port startup programmatically via `app.listen(0)` is verified to work cleanly without port collisions.
- The 3 required test cases for `tests/test_kkphim_playback.js` have been mapped and empirically validated against live upstream endpoints (`cuu-mon`).
- Git repository is on branch `main` tracking `origin https://github.com/q121101-cloud/stremio-vip-addon.git`.

---

## 5. Verification Method

To independently verify these findings:
1. Check syntax on all source files:
   ```bash
   node --check src/index.js
   node --check src/providers/kkphim.js
   node --check src/routes/hls.js
   ```
2. Verify git status and remote:
   ```bash
   git status
   git remote -v
   ```
3. Run existing test suite:
   ```bash
   node tests/e2e.test.js
   ```
4. Verify KKPhim playback script once created:
   ```bash
   node tests/test_kkphim_playback.js
   ```
