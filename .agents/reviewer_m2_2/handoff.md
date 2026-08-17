# Milestone 2 Review Report: Multi-Provider Architecture (R2)

**Reviewer**: Reviewer 2 (Roles: Reviewer, Critic)  
**Date**: 2026-08-17T15:33:00Z  
**Verdict**: **APPROVE**  
**Integrity Status**: VERIFIED (No hardcoded test outputs, no facade bypasses, real upstream network requests confirmed)

---

## 1. Observation

### 1.1 Provider Architecture & Resilience
- **VSMOV 4K (`src/providers/vsmov.js`)**:
  - Connects to official API at `https://vsmov.com/api`.
  - Configured with `timeout: 5000` on axios client (`vsmov.js:31`), Chrome 126 User-Agent, and `Referer: https://vsmov.com/`.
  - Implements multi-tier lookup: Slug detail -> Direct IMDb ID search -> TMDB ID search -> Canonical title/alias fuzzy scoring (`scoreMatch`, lines 72-136).
  - Extracts Master 4K Ultra HD streams (`*.streamvsmov.com`) via `resolveMasterPlaylistUrl` and encapsulates into `/hls/manifest.m3u8?url=...&ref=...`.
  - Strict invariant: returns `url` only, zero `externalUrl` (`vsmov.js:530-540`).
- **KKPhim Engine (`src/providers/kkphim.js`)**:
  - Connects to official API `https://phimapi.com` with `timeout: 5000` (`kkphim.js:30`).
  - Supports direct IMDb lookup (`/imdb/title/${imdbId}`), keyword search fallback (`/v1/api/tim-kiem`), and server splitting (Vietsub, Thuyết Minh, Lồng Tiếng).
  - Encapsulates M3U8 streams to `/hls/manifest.m3u8` with Base64URL encoding and `Referer: https://player.phimapi.com/`.
  - Zero `externalUrl` invariant verified (`kkphim.js:435-444`).
- **NguonC Engine (`src/providers/nguonc.js`)**:
  - Connects to `https://phim.nguonc.com/api` with `timeout: 5000` (`nguonc.js:31`).
  - Implements title/alias matching with year scoring, handles Vietsub & Thuyết Minh servers, and routes streams to `/hls/manifest.m3u8` with `Referer: https://embed15.streamc.xyz/`.
  - Zero `externalUrl` invariant verified (`nguonc.js:401-410`).
- **Specialized Providers (`stp.js`, `hh3d.js`, `yan.js`, `clbpx.js`)**:
  - `stp.js`: Specialized for Western Cinema & K-Drama (`suutamphim.org` / `tvhay`).
  - `hh3d.js`: Specialized for 3D Donghua / Chinese Anime (`hh3d.tv`).
  - `yan.js`: Specialized for Ongoing Anime & 3D Donghua (`yanhh3d.org`).
  - `clbpx.js`: Specialized for Classic Kim Dung Wuxia & TVB Hong Kong (`clbphimxua.com`).
  - All 4 specialized providers implement the standard interface (`id`, `label`, `search`, `getDetail`, `getCatalog`, `getStreams`), set 5000ms timeouts, encapsulate M3U8 URLs with respective origin referers, and strictly emit `url`-only streams.

### 1.2 Episode Matching & Regex Safety
- All providers implement robust episode matching logic:
  - Distinguishes movie vs series (`isMovie = (type === 'movie' || movie.type === 'single') && episode == null`).
  - Multi-pattern episode matching: exact name matching (`ep.name === targetEpStr`), prefix matching (`Tập ${targetEpStr}`, `Tập 0${targetEpStr}`), slug matching (`tap-${targetEpStr}`, `tap-0${targetEpStr}`), non-digit stripping (`parseInt(nameStr.replace(/\D+/g, ''), 10) === epNum`), and safe 1-based index fallback (`serverData[epNum - 1]`).
  - Regex safety: `escapeRegExp(targetEpStr)` replaces regex metacharacters `[.*+?^${}()|[\]\\]`.
  - Boundary isolation: `parseInt(targetEpStr, 10) <= 0` gracefully yields `null`, preventing index-0 mismatching or negative index corruption.

### 1.3 Test Suite Execution Results
- `node tests/m2_providers.test.js`: **53/53 PASSED** (0 failures, 0 warnings).
- `node tests/verify_playback.js`: **ALL 6 PHASES PASSED**:
  - Manifest & Route Integrity: PASSED (HTTP 200).
  - Movie Stream Resolution: PASSED (In-App Proxy URL, No `externalUrl`).
  - Series Stream Resolution: PASSED (In-App Proxy URL, No `externalUrl`).
  - M3U8 Full Playlist Rewriter: PASSED (HTTP 200, Sub-variants rewritten to `/hls/manifest.m3u8`).
  - Segment Download: PASSED (HTTP 200, **3,426,676 bytes > 50KB**, MPEG-TS sync byte `0x47` verified).
  - HTTP Range Seeking Support: PASSED (HTTP 206 Partial Content).
- `node tests/e2e.test.js`: **93/93 PASSED** (0 failures, 0 warnings).
- `node tests/m2_challenger_empirical.test.js`: **129/129 PASSED**.
- `node --check src/index.js` (and all files in `src/`): **PASSED** (0 syntax errors).

---

## 2. Logic Chain

1. **Isolation & Resilience**:
   - Every provider client uses `axios.create({ timeout: 5000 })`.
   - Every async method wraps network operations in `try...catch` and returns graceful fallbacks (`[]` or `null`).
   - In `src/handlers.js`, stream resolution aggregates all active providers via `Promise.allSettled()`.
   - Result: Any single upstream failure (404, 500, timeout, DNS error) is completely isolated and cannot block or crash other providers or the aggregator.

2. **Episode Resolution Robustness**:
   - `escapeRegExp` neutralizes arbitrary user input in episode parameters.
   - The multi-stage matching sequence (exact string -> padded string -> slug -> extracted integer -> 1-based index fallback) ensures resilient episode discovery across heterogeneous provider naming schemes while guarding against out-of-bounds errors.

3. **Protocol Compliance & Anti-403**:
   - Upstream HLS streams are rewritten with Base64URL parameters (`url` and `ref`).
   - All streams generated across all 7 providers strictly contain `url` and NO `externalUrl`, preventing external browser redirection and enabling smooth in-app playback on Stremio and Nuvio.

4. **Integrity & Authenticity**:
   - Grep audits confirm no hardcoded mock outputs or facade test intercepts in source code.
   - Verification test downloaded 3.42MB of real MPEG-TS data directly through the proxy, confirming genuine end-to-end operation.

---

## 3. Caveats

- Upstream CDNs for certain third-party providers (e.g. STP / TVHay mirrors) occasionally encounter intermittent network latency or timeouts; however, the 5000ms client timeout and `Promise.allSettled` aggregation architecture ensure that the addon continues serving streams from responsive providers without delay.
- The `tests/empirical_m2_reviewer2.test.js` script is an obsolete artifact from an earlier iteration expecting `/hls/ts` and lowercase `video/mp2t`, which has been superseded by `tests/m2_providers.test.js`, `tests/verify_playback.js`, and `tests/e2e.test.js` aligned with R1/R2 specifications (`/hls/segment.ts` with `video/MP2T`).

---

## 4. Conclusion

The Multi-Provider Architecture (Milestone 2 / R2) meets all functional and non-functional requirements:
- All 7 providers (`vsmov`, `kkphim`, `nguonc`, `stp`, `hh3d`, `yan`, `clbpx`) adhere to the standard provider interface and error isolation specifications.
- Network timeouts, 404/500 errors, and invalid queries are handled gracefully.
- Episode matching is resilient against regex injection and formatting anomalies.
- In-app playback and zero `externalUrl` invariants are strictly upheld.
- All verification test suites execute with 100% success.

**Final Verdict**: **APPROVE**

---

## 5. Verification Method

To independently verify this assessment, execute the following commands:
```bash
# 1. Run M2 Multi-Provider Test Suite
node tests/m2_providers.test.js

# 2. Run Real Binary TS Segment & Playback Verification (Downloads >50KB video chunk)
node tests/verify_playback.js

# 3. Run Complete End-to-End Test Suite
node tests/e2e.test.js

# 4. Run Empirical M2 Challenger Suite
node tests/m2_challenger_empirical.test.js

# 5. Check Syntax Across All Project Files
node --check src/index.js && node --check src/handlers.js && node --check src/routes/hls.js
```
