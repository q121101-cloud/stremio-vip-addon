# Milestone 2 (Multi-Provider Architecture R2) — Challenger 1 Handoff Report

## 1. Observation

Direct empirical observations from executing tests against all 7 providers (`src/providers/vsmov.js`, `src/providers/kkphim.js`, `src/providers/nguonc.js`, `src/providers/stp.js`, `src/providers/hh3d.js`, `src/providers/yan.js`, `src/providers/clbpx.js`) and `tests/verify_playback.js`:

### 1.1 Live Playback & Anti-403 Stream Delivery
Command: `node tests/verify_playback.js`
Result: Exited with code 0.
- Manifest and route verification: HTTP 200 OK.
- In-app stream resolution: Movie (`kkphim:cuu-mon`) & Series (`tt0903747:1:1`).
- M3U8 Master & Variant playlist rewriting to `/hls/manifest.m3u8` and `/hls/segment.ts`: HTTP 200 OK.
- Binary TS Segment Download: Downloaded **3,426,676 bytes (3.34 MB)** with HTTP 200, Content-Type `video/MP2T`, and confirmed MPEG-TS sync byte `0x47` at boundary 188.
- HTTP Range Request: HTTP 206 Partial Content for bytes 0-1023 (1024 bytes).

### 1.2 Zero `externalUrl` Invariant
Across 404 test assertions in `tests/m2_challenger1_comprehensive.test.js` and all real media queries across all 7 providers:
- **100% of stream objects strictly emit `url` and ZERO `externalUrl`**.
- In every stream object `s`, `s.externalUrl === undefined` and `'externalUrl' in s === false`.

### 1.3 Negative Episode Index Handling
- When querying `episode = -1`, `-10`, `"-1"`, `"-999"`: all 7 providers correctly evaluate `if (!isNaN(epNum) && epNum <= 0) targetEp = null;` and return `[]` streams without throwing or accidentally serving episode 1.

### 1.4 Identified Vulnerabilities & Failures (43 / 404 tests failed)

#### Vulnerability A: Blind Search Fallback in Specialized Providers (`stp.js`, `hh3d.js`, `yan.js`, `clbpx.js`)
- Code locations:
  * `src/providers/stp.js:214-222`
  * `src/providers/hh3d.js:200-207`
  * `src/providers/yan.js:200-207`
  * `src/providers/clbpx.js:205-212`
- Code snippet in all 4 providers:
  ```javascript
  if (!movieData && title) {
    const searchItems = await search(title, 1);
    if (searchItems.length > 0) {
      const best = searchItems[0];
      if (best && best.slug) {
        movieData = await getDetail(best.slug);
      }
    }
  }
  ```
- **Observed Behavior**: When querying an adversarial, non-existent, or out-of-domain title (e.g. `title = '(*+?)'`), the upstream API returns whatever default/unrelated search items it has. Unlike `vsmov.js` (which uses `scoreMatch` and requires score >= 0.45) and `kkphim.js` / `nguonc.js` (which require score >= 0.5), `stp.js`, `hh3d.js`, `yan.js`, and `clbpx.js` blindly accept `searchItems[0]` without checking similarity, and return streams for completely unrelated media.
- Reproduction: Running `node tests/reproduce_m2_provider_bugs.js` returned 1 stream each from STP, HH3D, YAN, and CLBPX for `title = '(*+?)'`.

#### Vulnerability B: Out-of-Bounds & Negative Season Queries Matching Season 1
- Code locations:
  * `src/providers/kkphim.js:329-331`
  * `src/providers/nguonc.js:289-296`
  * `src/providers/stp.js:205-212`
  * `src/providers/hh3d.js:191-198`
  * `src/providers/yan.js:191-198`
  * `src/providers/clbpx.js:196-203`
  * `src/providers/vsmov.js:421-424`
- **Observed Behavior**: When a series is requested by IMDb ID (e.g. `tt0903747` Breaking Bad) with `season = 99999` and `episode = 1`, `getByImdb` resolves the series entry and filters only `episode = 1`. Because the season number is not validated against the entry (many Vietnamese APIs host seasons as separate entries or only season 1), the provider returns Season 1 Episode 1 rather than rejecting the out-of-bounds season with `[]`.

#### Vulnerability C: Unhandled Null / Non-String TypeError Exceptions
- Code locations:
  * `src/providers/vsmov.js:323`, `kkphim.js:225`, `nguonc.js:188`, `stp.js:115`, `hh3d.js:113`, `yan.js:113`, `clbpx.js:114`
    ```javascript
    async function getCatalog(type, page = 1, extra = {}) {
      const { search: searchQuery, genre: genreFilter } = extra;
    ```
    When called with explicit `null` (e.g. `getCatalog('4k', 1, null)`), JS default argument `extra = {}` is not triggered, throwing:
    `TypeError: Cannot destructure property 'search' of 'extra' as it is null.`
  * `src/providers/kkphim.js:202`, `nguonc.js:166`, `stp.js:92`, `hh3d.js:91`, `yan.js:91`, `clbpx.js:92`
    ```javascript
    async function getDetail(slug) {
      if (!slug) return null;
      const cleanSlug = slug.replace(/^kkphim[_:]/, '');
    ```
    When called with a non-string value (e.g. `123`, `false`, `{}`), `slug.replace` throws:
    `TypeError: slug.replace is not a function.`

---

## 2. Logic Chain

1. **Premise 1**: Providers must operate resiliently as isolated units. An adversarial input or search query for a non-existent title must never serve streams for an unrelated movie.
2. **From Observation 1.4 (Vulnerability A)**: `stp.js`, `hh3d.js`, `yan.js`, and `clbpx.js` do not calculate title similarity scores when falling back to title search. They directly take `searchItems[0]`. Thus, any query with a non-existent or adversarial title causes the provider to return stream URLs for whatever first item the upstream search endpoint returned.
3. **From Observation 1.4 (Vulnerability B)**: When `season` is passed (e.g. season 99999), providers perform direct IMDb lookup and extract episode `1` without checking if the season exists on the resolved entry, serving wrong season data.
4. **From Observation 1.4 (Vulnerability C)**: Passing `extra = null` or non-string parameters causes uncaught `TypeError` crashes in `getCatalog` and `getDetail`.
5. **Conclusion**: While R6 live playback, M3U8/TS segment proxying, and the zero `externalUrl` invariant are fully working, the 4 specialized providers lack title similarity matching, season validation is missing, and input destructuring throws on `null`. Therefore, changes are requested.

---

## 3. Caveats

- In `src/handlers.js`, provider queries are wrapped in `Promise.allSettled()`, which prevents provider-level crashes from breaking the global Express server. However, individual provider functions should remain internally safe when invoked directly or via CLI/test runners.
- The zero `externalUrl` invariant and live binary TS chunk delivery (>50KB with HTTP 200 & sync byte 0x47) are 100% verified and operating properly.

---

## 4. Conclusion & Verdict

**Verdict**: **`REQUEST_CHANGES`**

### Required Action Items:
1. **Implement `scoreMatch` in Specialized Providers**:
   In `stp.js`, `hh3d.js`, `yan.js`, and `clbpx.js`, implement similarity score matching (requiring `score >= 0.45` or `0.5`) before selecting `bestItem` from search results, matching the robust behavior in `vsmov.js` and `kkphim.js`.
2. **Add Safe Destructuring & Type Guards**:
   In `getCatalog`, use `const { search: searchQuery, genre: genreFilter } = extra || {};`.
   In `getDetail`, add `if (!slug || typeof slug !== 'string') return null;`.
   In `search`, ensure string conversion and type guards before calling `.trim()`.
3. **Validate Series Season Matching**:
   In `getStreams`, verify that requested season indices are validated against series metadata before serving episode streams.

---

## 5. Verification Method

To independently reproduce all observations and verify the reported findings:

```bash
# 1. Run Live Playback Verification (R6)
node tests/verify_playback.js

# 2. Run Standalone Bug Reproduction Script (Empirical Proof of Vulnerabilities A, B, C)
node tests/reproduce_m2_provider_bugs.js

# 3. Run Comprehensive 404-Assertion Adversarial Test Suite
node tests/m2_challenger1_comprehensive.test.js
```

### Invalidation Conditions:
- If `node tests/reproduce_m2_provider_bugs.js` returns 0 streams for bogus titles like `(*+?)`, Vulnerability A is resolved.
- If `vsmov.getCatalog('4k', 1, null)` and `kkphim.getDetail(123)` return arrays/null without throwing TypeError, Vulnerability C is resolved.
