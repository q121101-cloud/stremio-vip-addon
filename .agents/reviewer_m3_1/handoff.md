# Milestone 3 Review & Adversarial Challenge Report: E2E Stream Playback Test & Self-Debug Loop

## Review Summary

**Verdict**: **APPROVE**

---

## 1. Observation

### 1.1 Direct Code Inspection
1. **`tests/test_kkphim_playback.js`**:
   - **Ephemeral Port & Server Isolation** (Lines 58–73): Initializes Express instance, attaches `/hls` and standard handlers, and binds to `app.listen(0, '127.0.0.1')`. Resolves dynamic `port` and sets `proxyBase = 'http://127.0.0.1:${port}'`.
   - **Test Case 1 (Stream Generation & R1 Protocol Compliance)** (Lines 80–155):
     - Resolves streams for slug `cuu-mon` via `kkphim.getStreams({ slug: 'cuu-mon', type: 'movie', proxyBase })` and `GET ${proxyBase}/stream/movie/kkphim:cuu-mon.json`.
     - Includes catalog fallback in case the upstream slug changes dynamically.
     - Asserts `name === 'VIP Movies 🎬'`.
     - Asserts `title` contains `[VIP • KKPhim]`, `Full HD (HLS Proxy)`, `⚡ Server VIP • Phát trực tiếp trong App`, and does NOT contain `#`.
     - Asserts `url.startsWith('${proxyBase}/hls/manifest.m3u8')`.
     - Asserts `externalUrl === undefined` and `!('externalUrl' in targetStream)` (strictly native in-app playback).
     - Asserts `behaviorHints.notSupported === false` and `typeof behaviorHints.bingeGroup === 'string'`.
   - **Test Case 2 (Manifest Proxy Verification & Anti-403 Rewriting)** (Lines 157–224):
     - Performs HTTP GET on `stream.url`.
     - Verifies HTTP 200, Content-Type `application/vnd.apple.mpegurl; charset=utf-8`, and CORS `Access-Control-Allow-Origin: *`.
     - Verifies `#EXTM3U` tag exists in manifest body.
     - Recursively parses Master vs Media playlists, traversing sub-manifest variants (e.g. `2000kb/hls/index.m3u8`) to extract rewritten `.ts` segment URL (`${proxyBase}/hls/ts?url=...`).
   - **Test Case 3 (Segment Playback & MPEG-TS Binary Delivery Verification)** (Lines 226–282):
     - Performs HTTP GET on resolved segment URL with `responseType: 'arraybuffer'`.
     - Verifies HTTP status is 200 (explicitly not 403, 500, 502).
     - Verifies Content-Type is `video/mp2t` or `application/octet-stream`, and CORS header `Access-Control-Allow-Origin: *`.
     - Verifies binary buffer length > 50,000 bytes.
     - Validates MPEG-TS sync byte `0x47` at offset 0 (`buffer[0] === 0x47`) and packet boundary offset 188 (`buffer[188] === 0x47`).
   - **Self-Debug Mandate & Cleanup** (Lines 297–330):
     - Diagnostic catch block logs failing test stage, error message, HTTP status code, response headers, response preview, and specific remediation hints.
     - Server teardown is guaranteed via `finally { server.close(); }`.
     - CLI execution handles exit codes properly (`process.exit(0)` on pass, `process.exit(1)` on error).
     - Module exports `{ runKKPhimPlaybackE2E }` for programmatic execution.

### 1.2 Empirical Verification Execution
1. **Direct CLI Execution**: `node tests/test_kkphim_playback.js`
   - Result: Exited with code `0` in ~0.96s.
   - Output summary:
     - Ephemeral port allocated: `57382`
     - Test Case 1: Stream generation verified (`name: 'VIP Movies 🎬'`, `hasExternalUrl: false`)
     - Test Case 2: Manifest proxy verified (HTTP 200, `#EXTM3U`, CORS `*`, Sub-manifest traversal to `/hls/ts`)
     - Test Case 3: Segment delivery verified (HTTP 200, `946,204` bytes / ~924 KB, MPEG-TS sync byte `0x47` at offset 0 and 188)
     - Server teardown executed cleanly without hanging.
2. **Programmatic Execution**: `node -e 'const { runKKPhimPlaybackE2E } = require("./tests/test_kkphim_playback"); runKKPhimPlaybackE2E()'`
   - Result: Resolved cleanly with code `0`.
3. **Syntax Checks**: `node --check src/index.js && node --check src/routes/hls.js && node --check src/providers/kkphim.js && node --check tests/test_kkphim_playback.js`
   - Result: 0 syntax errors.
4. **Regression Suite Execution**:
   - `node tests/e2e.test.js`: 90/90 assertions passed.
   - `node tests/m3_verification.test.js`: 39/39 assertions passed.
   - `node tests/test_live_kkphim_proxy.js`: 100% passed.

---

## 2. Logic Chain

1. **Integrity & Authenticity Check**:
   - *Claim*: The test runs genuine live E2E verification without hardcoded mock data.
   - *Verification*: The test binds to a real network port, queries live upstream API endpoints (`phimapi.com`), proxies real CDN streams (`s1.phim1280.tv`), downloads ~924 KB of actual video chunk data, and checks binary packet sync bytes `0x47`.
   - *Assessment*: Genuine verification; no facade or mocked shortcuts found.

2. **R3 Specification Conformance**:
   - *Requirement*: Ephemeral port server startup.
     - *Verified*: Uses `app.listen(0, '127.0.0.1')` and `server.address().port`.
   - *Requirement*: Test Case 1 (Stream Generation for `cuu-mon` verifying `[VIP • KKPhim]` and `url`).
     - *Verified*: Asserts provider stream, endpoint aggregator stream, title format, URL structure, and absence of `externalUrl`.
   - *Requirement*: Test Case 2 (Manifest Proxy Verification for HTTP 200, `#EXTM3U`, rewritten `.ts` segment links).
     - *Verified*: Master and sub-manifest traversal correctly tested.
   - *Requirement*: Test Case 3 (Segment Playback Verification for HTTP 200 without 403, and valid binary video buffer).
     - *Verified*: Tested with binary buffer length and MPEG-TS sync byte validation.
   - *Requirement*: Self-Debug diagnostic logging on failure and clean teardown.
     - *Verified*: Comprehensive error reporter with troubleshooting hints and `server.close()` in `finally`.

3. **Adversarial Stress-Testing**:
   - *Port Leaks*: Server is closed in `finally` block regardless of pass or fail.
   - *Hung Connections*: Explicit 25-second timeout on all axios requests prevents indefinitely blocked runner.
   - *Master / Variant Playlists*: Loop handles both flat media playlists and multi-bitrate master playlists containing `#EXT-X-STREAM-INF` variants.

---

## 3. Caveats

- **Upstream Network Latency**: Because the test fetches real live CDN streams from Vietnamese CDNs, upstream network blips could potentially cause transient slowdowns. The test mitigates this by applying a 25-second timeout and a catalog fallback mechanism if the test slug is temporarily modified upstream.

---

## 4. Conclusion

- `tests/test_kkphim_playback.js` completely satisfies all requirements defined in `ORIGINAL_REQUEST.md §R3` and `PROJECT.md` Milestone 3.
- No integrity violations, shortcuts, or facades were identified.
- Ephemeral port lifecycle and cleanup operate flawlessly.
- **Verdict: APPROVE**.

---

## 5. Verification Method

To independently verify this review verdict:

1. **Run Syntax Check**:
   ```bash
   node --check tests/test_kkphim_playback.js
   ```

2. **Run E2E Playback Test**:
   ```bash
   node tests/test_kkphim_playback.js
   ```
   *Expected Output*: Exit code `0`, all 3 test cases pass with green output, ~924 KB MPEG-TS binary buffer validated.

3. **Run Regression Suites**:
   ```bash
   node tests/e2e.test.js
   node tests/m3_verification.test.js
   node tests/test_live_kkphim_proxy.js
   ```
   *Expected Output*: All assertions pass with 0 failures.
