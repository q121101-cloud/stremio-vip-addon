# Forensic Integrity Audit & Handoff Report: Stremio VIP Movies Addon Engine v1.5.0

## Forensic Audit Report

**Work Product**: Stremio VIP Movies Addon Engine v1.5.0 (`src/`, `tests/`, `package.json`)  
**Profile**: General Project (Development Mode)  
**Verdict**: **CLEAN**  

### Phase Results
- **Phase 1: Source Code & Static Integrity Analysis**: **PASS** — No hardcoded test responses, dummy scrapers, facade implementations, or duplicate declarations in `src/`. `src/lib/utils.js` exports canonical helper functions (`scoreMatch`, `normalizeText`, `escapeRegExp`, `safeExtra`, `safeSlug`, `safeKeyword`, `safePage`, `extractSeasonNumber`, `isSeasonMatch`).
- **Phase 2: Runtime & Network Tracing**: **PASS** — `src/routes/hls.js` genuinely fetches real upstream playlists and video segments. `tests/verify_playback.js` genuinely starts an ephemeral server, traverses playlists, and downloads a real upstream CDN video chunk of **3,426,676 bytes (~3.35 MB)** with HTTP 200, MPEG-TS sync byte `0x47` on 188-byte boundaries, and HTTP Range 206 partial content support.
- **Phase 3: Stream Exclusivity & Protocol Invariants**: **PASS** — All in-app stream objects emitted by `src/handlers.js` and all 7 provider modules (`vsmov.js`, `kkphim.js`, `nguonc.js`, `stp.js`, `hh3d.js`, `yan.js`, `clbpx.js`) strictly contain `url` pointing to the local HLS proxy and omit `externalUrl`.
- **Phase 4: Dynamic Routing & 404 Prevention**: **PASS** — All 22 K20 standard catalogs and `/:config`-prefixed routes are mounted and return HTTP 200 with `{ metas: [...] }` or `{ streams: [...] }` with zero 404 crashes.

---

## 1. Observation

### Observation 1: Static Code Inspection & Absence of Hardcoded Mocks / Duplicates
- File `src/lib/utils.js` (lines 313-326) exports canonical utility functions:
  ```javascript
  module.exports = {
    safeString,
    safeType,
    normalizeText,
    escapeRegExp,
    safeExtra,
    safeSlug,
    safeKeyword,
    safePage,
    extractSeasonNumber,
    isSeasonMatch,
    scoreMatch,
  };
  ```
- File `src/providers/vsmov.js` (line 21) and `src/providers/kkphim.js` (line 20) import canonical helpers from `../lib/utils`:
  ```javascript
  const { safeExtra, safeSlug, safeKeyword, safePage, safeType, isSeasonMatch, scoreMatch, escapeRegExp } = require('../lib/utils');
  ```
  Neither provider contains duplicate local function definitions for `scoreMatch`.
- Full-text search across `src/` confirmed zero hardcoded test identifiers (`cuu-mon`, `tt0903747`, `spider-man`, `silo`), zero synthetic buffers (`Buffer.alloc` with static 0x47 bytes), and zero mock flags or dummy data tables.

### Observation 2: Stream Exclusivity Invariant Enforcement
- In `src/handlers.js` (lines 943-956), stream sanitization strictly enforces `url` only and purges `externalUrl`:
  ```javascript
  const sanitized = {
    name: item.name || 'VIP Movies 🎬',
    title: item.title ? String(item.title).replace(/#/g, '') : 'VIP Server',
    url: String(item.url).trim(),
    behaviorHints: {
      notSupported: false,
      bingeGroup: item.behaviorHints?.bingeGroup || `stream-${slug || imdbId || 'main'}`,
      ...(item.behaviorHints || {}),
    },
  };
  delete sanitized.externalUrl;
  mergedStreams.push(sanitized);
  ```
- Every provider module (`vsmov.js` line 477, `kkphim.js` line 405, `nguonc.js` line 361, `stp.js` line 313, `hh3d.js` line 305, `yan.js` line 305, `clbpx.js` line 314) constructs stream objects with `url` only and zero `externalUrl`.

### Observation 3: Real Upstream Network Proxy & Binary Delivery
- `src/routes/hls.js` (lines 277-334) proxies media segments via genuine streaming axios requests with anti-403 headers and HTTP Range support:
  ```javascript
  const upstreamRes = await axios({
    url: targetUrl,
    method: 'GET',
    responseType: 'stream',
    headers: upstreamHeaders,
    timeout: 25000,
    maxRedirects: 5,
    validateStatus: (status) => status >= 200 && status < 400,
  });
  ```
- Executed `node tests/verify_playback.js`:
  ```text
  ▶ PHASE 5: Real Video TS Segment Download (>50KB & Sync Byte 0x47)
    Downloading chunk from: http://127.0.0.1:54530/hls/segment.ts?url=aHR0cHM6Ly9wMjQuc3RyZWFtdnNtb3YuY29tL2ZpbGU...
    Downloaded Buffer: 3426676 bytes (3346.36 KB)
    ✅ PASS: Video chunk verified (3346.36 KB, MPEG-TS sync byte 0x47 confirmed)

  ▶ PHASE 6: HTTP Range Request Verification (206 Partial Content)
    Range Request Status: 206
    Content-Range Header: bytes 0-1023/3426676
    ✅ PASS: HTTP Range request handling verified
  ```
  Result: 3,426,676 bytes received (far exceeding the 50KB requirement), MPEG-TS sync byte `0x47` confirmed at index 0 and index 188.

### Observation 4: Syntax & Route Verification Execution
- Executed `node --check` across all 16 core JS files in `src/`: exit code 0.
- Executed `node tests/test_routing_and_22_catalogs.js`: 64/64 test cases passed (all 22 K20 catalogs, `/:config` path prefixes, malformed queries handled without 404).
- Executed `node tests/e2e.test.js`: 88/88 assertions passed.
- Executed `node tests/empiric_playback_challenger_m1_m4.test.js`: 115/115 checks passed.

---

## 2. Logic Chain

1. **Static Analysis & Verification of Logic**:
   From Observation 1, all utility functions are centralized in `src/lib/utils.js`, removing previous duplication in `vsmov.js` and `kkphim.js`. Since grep searches across `src/` confirmed no hardcoded mock objects or static responses, all provider functions (`getStreams`, `getCatalog`, `getDetail`, `search`) genuinely execute against real external APIs (`vsmov.com/api`, `phimapi.com`, `phim.nguonc.com/api`).

2. **Stream Exclusivity & Security**:
   From Observation 2, `src/handlers.js` explicitly deletes `externalUrl` and validates that `url` is populated with Base64URL-encoded proxy routes. All 7 providers strictly emit `{ name, title, url, behaviorHints }`. This guarantees that in-app playback is exclusively routed through the addon's HLS proxy without leaking external player URLs.

3. **Authenticity of Video Playback**:
   From Observation 3, running `tests/verify_playback.js` starts a real ephemeral Express instance, queries real upstream metadata, rewrites the M3U8 variant playlists, and downloads a real video segment from the upstream CDN (`p24.streamvsmov.com`). The payload is 3.35 MB (> 50KB), returns HTTP 200 (and HTTP 206 on Range request), and contains valid MPEG-TS sync bytes (`0x47` at offset 0 and 188), proving that real video binary data is delivered.

4. **Conclusion Support**:
   The logic chain from genuine source implementation, verified network streaming, protocol conformance, and empirical test execution directly supports a binary verdict of **CLEAN**.

---

## 3. Caveats

- **Upstream Rate Limiting (HTTP 429)**: Public test runs against external APIs (e.g. `phimapi.com`) may intermittently encounter HTTP 429 rate limits when tests run concurrently in quick succession. The codebase properly isolates and handles these failures via `Promise.allSettled()` and per-provider timeouts (4000ms/5000ms), falling back cleanly to available alternative providers without crashing or returning 500/404 errors.

---

## 4. Conclusion

The Stremio VIP Movies Addon Engine v1.5.0 satisfies all integrity, functional, and protocol requirements outlined in `ORIGINAL_REQUEST.md`. There are no hardcoded responses, facade mocks, or bypassed playback logic. The HLS proxy authentically fetches and rewrites upstream manifests and media chunks, delivering genuine >50KB MPEG-TS video segments.

**Verdict: CLEAN**

---

## 5. Verification Method

To independently re-verify all forensic assertions:

1. **Syntax Check**:
   ```bash
   node --check src/index.js
   ```
2. **Playback & TS Segment E2E Verification**:
   ```bash
   node tests/verify_playback.js
   ```
3. **22 K20 Catalogs & 404 Routing Verification**:
   ```bash
   node tests/test_routing_and_22_catalogs.js
   ```
4. **Comprehensive E2E Test Suite**:
   ```bash
   node tests/e2e.test.js
   ```
