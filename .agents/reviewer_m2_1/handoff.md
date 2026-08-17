# Milestone 2 Review Report (Multi-Provider Architecture R2)

**Reviewer**: Reviewer 1 (Roles: Reviewer, Critic)  
**Date**: 2026-08-17T15:33:30Z  
**Verdict**: **APPROVE**

---

## 1. Observation

Direct observations from codebase inspection, syntax validation, test execution, and adversarial analysis:

### 1.1 Provider Implementations & Architecture
- **VSMOV 4K Engine (`src/providers/vsmov.js`)**:
  - Official API integration: `https://vsmov.com/api` (Line 24: `const BASE_API = 'https://vsmov.com/api';`).
  - Request headers: `Referer: https://vsmov.com/`, `Origin: https://vsmov.com`, Chrome 126 User-Agent (Lines 25–39).
  - Timeout: 5000ms axios timeout configured (Line 31).
  - Resolution paths: Slug detail (`getDetail`), Direct IMDb lookup (`getByImdb`), TMDB lookup (`getByTmdb`), Canonical title + alias search (`search`) with score & year matching (Lines 413–455).
  - Master M3U8 extraction (`resolveMasterPlaylistUrl`): Extracts `.m3u8` from embed HTML (baseUrl + videoHash regex, quoted `.m3u8` regex, and URL hash fallback) (Lines 141–192).
  - Stream title formatting: `[VIP 1 • VSMOV] Master 4K Ultra HD (3840x2160)${epLabel} (HLS Proxy)` and `[VIP 1 • VSMOV] Thuyết Minh Full HD${epLabel} (HLS Proxy)` (Lines 526–534).
  - Stream object construction: Contains `url` routed through `${proxyBase}/hls/manifest.m3u8?url=...&ref=...`. Strictly NO `externalUrl` property (Lines 531–539).

- **KKPhim Engine (`src/providers/kkphim.js`)**:
  - Official API: `https://phimapi.com` (Line 23: `const BASE_API = 'https://phimapi.com';`).
  - Direct IMDb lookup: `https://phimapi.com/imdb/title/${imdbId}` (Lines 145–164).
  - Fallback search: `https://phimapi.com/v1/api/tim-kiem?keyword=...` (Lines 169–195).
  - Multi-server support: Vietsub, Thuyết Minh, Lồng Tiếng classification (Lines 422–434).
  - Stream title formatting: `[VIP 2 • KKPhim] Vietsub Full HD${epLabel} (HLS Proxy)`, `[VIP 2 • KKPhim] Thuyết Minh Full HD${epLabel} (HLS Proxy)`, `[VIP 2 • KKPhim] Lồng Tiếng Full HD${epLabel} (HLS Proxy)` (Lines 426–434).
  - Stream object construction: Contains `url` only, strictly NO `externalUrl` property (Lines 435–444). 5000ms timeout configured (Line 30).

- **NguonC Engine (`src/providers/nguonc.js`)**:
  - Official API: `https://phim.nguonc.com/api` (Line 25: `const BASE_API = 'https://phim.nguonc.com/api';`).
  - Stream extraction with Referer: `https://embed15.streamc.xyz/` (Line 397).
  - Stream title formatting: `[VIP 3 • NguonC] Vietsub Full HD${epLabel} (HLS Proxy)`, `[VIP 3 • NguonC] Thuyết Minh Full HD${epLabel} (HLS Proxy)`, `[VIP 3 • NguonC] Lồng Tiếng Full HD${epLabel} (HLS Proxy)` (Lines 387–395).
  - Stream object construction: Contains `url` only, strictly NO `externalUrl` property (Lines 401–410). 5000ms timeout configured (Line 31).

- **Specialized Providers (`src/providers/stp.js`, `src/providers/hh3d.js`, `src/providers/yan.js`, `src/providers/clbpx.js`)**:
  - `stp.js`: Western Cinema & K-Drama. Title: `[VIP • STP] Vietsub Full HD${epLabel} (HLS Proxy)` / `[VIP • STP] Thuyết Minh Full HD...` (Lines 280–283).
  - `hh3d.js`: 3D Donghua / Chinese Anime. Title: `[VIP • HH3D] 3D Donghua Full HD${epLabel} (HLS Proxy)` / `[VIP • HH3D] Thuyết Minh Full HD...` (Lines 265–268).
  - `yan.js`: Donghua & Ongoing Anime. Title: `[VIP • YAN] Vietsub Full HD${epLabel} (HLS Proxy)` / `[VIP • YAN] Thuyết Minh Full HD...` (Lines 265–268).
  - `clbpx.js`: Classic Wuxia, Kim Dung & TVB. Title: `[VIP • CLBPX] Lồng Tiếng TVB / Kim Dung${epLabel} (HLS Proxy)` / `[VIP • CLBPX] Thuyết Minh Full HD...` (Lines 272–276).
  - All 4 specialized providers implement standard interface: `{ id, label, getCatalog, getStreams, search, getDetail }`.
  - All 4 configure 5000ms timeout and enforce strict zero `externalUrl`.

### 1.2 Verification Command Executions
1. **Syntax Check**:
   - Command: `node --check src/providers/*.js`
   - Result: Exit code `0` (clean, zero syntax errors).

2. **M2 Providers Unit & Adversarial Test Suite**:
   - Command: `node tests/m2_providers.test.js`
   - Result: Exit code `0` (`🏁 M2 TEST RESULTS: 53 / 53 PASSED`).
   - Covered: Standard interface compliance, VSMOV 4K engine extraction, KKPhim IMDb & multi-server extraction, NguonC extraction, STP/HH3D/YAN/CLBPX specialized catalogs & streams, graceful error handling on 404/422/invalid inputs, invocation signature polymorphism (object and positional arguments), ReDoS regex bomb resilience, comprehensive zero-externalUrl invariant.

3. **Mandatory Playback Verification Test (R6)**:
   - Command: `node tests/verify_playback.js`
   - Result: Exit code `0` (`🎉 ALL PLAYBACK VERIFICATION CHECKS PASSED (100% SUCCESS)`).
   - Real binary TS chunk download: `3,426,676 bytes (3346.36 KB)` with HTTP 200 and valid MPEG-TS sync byte `0x47`.
   - HTTP Range seeking requests: HTTP 206 Partial Content verified.

4. **Comprehensive E2E Test Suite**:
   - Command: `node tests/e2e.test.js`
   - Result: Exit code `0` (`🏁 Total Assertions: 92, Passed: 92, Failed: 0`).

5. **Empirical Challenger Test**:
   - Command: `node tests/m2_challenger_empirical.test.js`
   - Result: Exit code `0` (`🏁 Passed: 129/129 assertions`).

6. **Integrity Violation Scan**:
   - Checked for hardcoded movie titles ("Spider-Man", "Inception", "Breaking Bad") or test IMDb IDs ("tt10872600", "tt0903747") in `src/providers/*.js` -> ZERO hardcoded fixtures. Real network APIs are called dynamically.
   - Checked for `externalUrl` properties emitted by providers -> ZERO `externalUrl` found.

---

## 2. Logic Chain

1. **Interface & Naming Conformity**:
   - Observation 1.1 shows exact VIP label prefixes:
     - `[VIP 1 • VSMOV]`
     - `[VIP 2 • KKPhim]`
     - `[VIP 3 • NguonC]`
     - `[VIP • STP]`
     - `[VIP • HH3D]`
     - `[VIP • YAN]`
     - `[VIP • CLBPX]`
   - Every provider formats titles using these exact prefixes, followed by quality/audio tags (`Master 4K Ultra HD (3840x2160)`, `Vietsub Full HD`, `Thuyết Minh Full HD`, `Lồng Tiếng TVB / Kim Dung`), episode labels `[Tập X]`, and `(HLS Proxy)`.

2. **Strict Invariant: Zero `externalUrl`**:
   - Requirement R2 & R3 specify that stream objects for in-app playback must contain only `url` (pointing to the HLS proxy) and must strictly avoid `externalUrl` (which forces Stremio to open an external web browser instead of direct playback).
   - In `src/providers/*.js`, all returned stream objects include `url` and omit `externalUrl`.
   - In `src/handlers.js` (lines 733–741), the stream aggregator explicitly purges `externalUrl` if `url` is present (`delete sanitized.externalUrl`).
   - Verified across 53 unit tests in `tests/m2_providers.test.js` and 129 tests in `tests/m2_challenger_empirical.test.js` with `assert.strictEqual(s.externalUrl, undefined)` and `assert.ok(!('externalUrl' in s))`.

3. **Fault Isolation & Resilience**:
   - Each provider configures a dedicated axios instance with `timeout: 5000` to prevent hanging upstream connections from stalling the aggregator.
   - Episode string parsing uses `escapeRegExp` to protect against ReDoS regex injection attacks.
   - Fallback to 1-based index handles non-standard Vietnamese episode numbering formats.
   - All async methods wrap downstream network calls in `try/catch` and return `[]` / `null` without throwing unhandled exceptions.

4. **Integrity & Real Data Verification**:
   - All 7 providers query genuine remote endpoints (`vsmov.com/api`, `phimapi.com`, `phim.nguonc.com/api`, etc.).
   - Live E2E playback test (`verify_playback.js`) resolved real streams and downloaded a live 3.34MB `.ts` chunk with confirmed sync byte `0x47`.

---

## 3. Caveats

- **Third-Party Upstream Rate Limits**: Upstream servers (`phimapi.com`, `phim.nguonc.com`) may occasionally return HTTP 429 during intense rapid-fire burst testing. The providers handle this gracefully by returning `[]` without crashing the addon.
- **Provider Aggregator Filtering**: If a user customizes their addon configuration to disable specific providers, the aggregator in `handlers.js` respects `config.providers`. When default or all active, all 7 providers run concurrently via `Promise.allSettled`.

---

## 4. Conclusion

All requirements for Milestone 2 (Multi-Provider Architecture R2) have been thoroughly inspected, validated, and verified:
1. **VSMOV 4K Engine (`vsmov.js`)**: Implemented with official API, 4K stream extraction, and correct proxy URL formatting.
2. **KKPhim Engine (`kkphim.js`)**: Implemented with direct IMDb lookup, fallback search, and multi-server extraction (Vietsub/TM/LT).
3. **NguonC Engine (`nguonc.js`)**: Implemented with official API, StreamC extraction, and anti-403 referer headers.
4. **Specialized Providers (`stp.js`, `hh3d.js`, `yan.js`, `clbpx.js`)**: Implemented with standard interfaces and safe error boundaries.
5. **VIP Naming Conventions**: 100% compliant with specified prefixes (`[VIP 1 • VSMOV]`, `[VIP 2 • KKPhim]`, `[VIP 3 • NguonC]`, `[VIP • STP]`, `[VIP • HH3D]`, `[VIP • YAN]`, `[VIP • CLBPX]`).
6. **Strict Invariant**: Zero `externalUrl` properties across all stream objects.
7. **All test suites pass**: Syntax checks, provider test harness (53/53), live playback verification (100%), and empirical challenger tests (129/129).

**Verdict**: **APPROVE**

---

## 5. Verification Method

To independently verify this review:

1. **Syntax Check**:
   ```bash
   node --check src/providers/*.js
   ```
   *Expected: Exit code 0, no syntax errors.*

2. **Provider Test Suite**:
   ```bash
   node tests/m2_providers.test.js
   ```
   *Expected: 53/53 tests pass.*

3. **Live Playback & Binary TS Verification**:
   ```bash
   node tests/verify_playback.js
   ```
   *Expected: All 6 phases pass, downloading >50KB TS segment with HTTP 200 and sync byte 0x47.*

4. **Empirical Challenger Suite**:
   ```bash
   node tests/m2_challenger_empirical.test.js
   ```
   *Expected: 129/129 assertions pass.*

5. **Examine Source Code**:
   - Inspect `src/providers/vsmov.js`, `src/providers/kkphim.js`, `src/providers/nguonc.js`, `src/providers/stp.js`, `src/providers/hh3d.js`, `src/providers/yan.js`, `src/providers/clbpx.js`.
   - Verify that all stream objects output `url` only and zero `externalUrl`.
