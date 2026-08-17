# Milestone 2 Adversarial Review Report: Multi-Provider Isolation & Stream Protocol Adherence

**Reviewer:** Milestone 2 Reviewer 2 (reviewer & adversarial critic)  
**Date:** 2026-08-17  
**Working Directory:** `/Users/quan/.gemini/antigravity/scratch/stremio-nguonc-addon`  
**Target Files Reviewed:**
- `src/providers/kkphim.js`
- `src/providers/nguonc.js`
- `src/providers/vsmov.js`

**Overall Verdict:** **REQUEST_CHANGES**

---

## 1. Observation

Direct code analysis and empirical execution revealed the following observations:

### 1.1 Observation 1: Runtime TypeError on `mapper.extractYear` in `src/providers/nguonc.js` (Critical)
- **Location**: `src/providers/nguonc.js:81`
  ```javascript
  // Check year
  let itemYear = mapper.extractYear(item.category);
  ```
- **Referenced Module**: `src/mapper.js:48` and `src/mapper.js:355-367`
  ```javascript
  function extractYear(category) { ... }
  ...
  module.exports = {
    makeId,
    extractSlug,
    detectType,
    mapCatalogItem,
    mapDetailMeta,
    buildStreams,
    extractM3u8FromEmbed,
    parseStreamId,
    formatEpisodeTitle,
    buildVideos,
    scoreSimilarity,
  };
  ```
- **Execution Command**:
  ```bash
  node -e "const mapper = require('./src/mapper'); console.log(typeof mapper.extractYear);"
  ```
- **Observed Result**:
  `mapper.extractYear type: undefined`
- **Error Trigger**: When NguonC performs title search fallback (`nguonc.getStreams({ title: 'Inception', year: 2010 })`), `scoreMatch` invokes `mapper.extractYear(item.category)`, throwing `TypeError: mapper.extractYear is not a function`. This causes `getStreams` to abort the search loop and return `[]`.

### 1.2 Observation 2: Runtime TypeError on `mapper.unpackDeanEdwards` in `src/providers/vsmov.js` (Major)
- **Location**: `src/providers/vsmov.js:21` and `src/providers/vsmov.js:182`
  ```javascript
  const { unpackDeanEdwards } = require('../mapper');
  ...
  if (embedHtml.includes('eval(function(p,a,c,k,e,')) {
    const unpacked = unpackDeanEdwards(embedHtml);
  ```
- **Referenced Module**: `src/mapper.js:163` and `src/mapper.js:355-367`
  `unpackDeanEdwards` is defined in `src/mapper.js:163` but **omitted** from `module.exports`.
- **Execution Command**:
  ```bash
  node -e "const mapper = require('./src/mapper'); console.log(typeof mapper.unpackDeanEdwards);"
  ```
- **Observed Result**:
  `mapper.unpackDeanEdwards type: undefined`
- **Error Trigger**: When VsMov encounters an embed page protected by Dean Edwards P.A.C.K.E.R encoding, calling `unpackDeanEdwards(embedHtml)` throws `TypeError: unpackDeanEdwards is not a function`.

### 1.3 Observation 3: Verified Correct Implementations
- **5-Second Timeout Isolation**:
  - `src/providers/kkphim.js:31`: `timeout: 5000`
  - `src/providers/nguonc.js:31`: `timeout: 5000`
  - `src/providers/vsmov.js:34`: `timeout: 5000`
  - All providers wrap stream extraction in `try...catch` blocks and return `[]` gracefully on network errors (`ENOTFOUND`, `ETIMEDOUT`, 5xx).
- **R3 Protocol Stream Exclusivity**:
  - HLS Proxy items have `url` and **NO** `externalUrl` (`assert.strictEqual(item.externalUrl, undefined)`).
  - Embed Player items have `externalUrl` and **NO** `url` (`assert.strictEqual(item.url, undefined)`).
  - Title strings conform to `[VIP • Provider] ... (HLS Proxy)\n⚡ Phát trực tiếp trong App` and `[Dự phòng • Provider] ... (Embed Player)\n🌐 Bấm để mở xem ngoài trình duyệt web`.
- **Series Episode Parsing**:
  - Successfully handles integers (`1`), strings (`"02"`), regex word boundaries (`\b1\b`), and index fallbacks.
- **Integrity Verification**:
  - No hardcoded IDs or fabricated test mocks were detected in source code.

---

## 2. Logic Chain

1. **Failure of Cinemeta Search Fallback in NguonC**:
   - `PROJECT.md` §2 and `ORIGINAL_REQUEST.md` §R2 require NguonC to search by canonical Cinemeta title and match release year.
   - When `nguonc.getStreams` executes Step 3 (search by title), `scoreMatch` is invoked on each search candidate item.
   - `scoreMatch` attempts `mapper.extractYear(item.category)` (line 81). Because `mapper.js` does not export `extractYear`, `mapper.extractYear` is `undefined`.
   - Calling `undefined(...)` throws a `TypeError`.
   - The top-level `try...catch` in `nguonc.getStreams` catches this error, logs `[NguonC/getStreams] Error: mapper.extractYear is not a function`, and immediately returns `[]`.
   - **Consequence**: NguonC title-based stream resolution fails 100% of the time when cache is cold.

2. **Failure of Dean Edwards Unpacking in VsMov**:
   - `PROJECT.md` §2 and `ORIGINAL_REQUEST.md` §R2 specify that VsMov must support robust scraping including Dean Edwards P.A.C.K.E.R unpacking.
   - `src/providers/vsmov.js` imports `{ unpackDeanEdwards }` from `../mapper`.
   - Because `mapper.js` does not export `unpackDeanEdwards`, the imported identifier is `undefined`.
   - Calling `unpackDeanEdwards(embedHtml)` inside `extractFromFilmPage` throws `TypeError: unpackDeanEdwards is not a function`.
   - **Consequence**: Any stream protected by packed JS fails extraction.

3. **Why Upstream Unit Tests Passed**:
   - The unit test in `teamwork_preview_worker_m2/handoff.md` manually seeded `imdbCache.set('nguonc:imdb:tt1375666', 'inception')` and `detailCache.set(...)`.
   - As a result, the test followed Step 2 (cached slug lookup) and never exercised Step 3 (`search` -> `scoreMatch` -> `mapper.extractYear`), masking the broken dependency.

---

## 3. Caveats

- **Sandbox Offline Environment**: Direct HTTP requests to live domains (`phimapi.com`, `phim.nguonc.com`, `vsmov.com`) return `ENOTFOUND` due to sandbox network isolation. All testing was conducted via internal unit/contract tests, mock payloads, and code execution.
- **Upstream Module Boundaries**: `src/mapper.js` is an existing module in `src/`. Exporting `extractYear` and `unpackDeanEdwards` in `src/mapper.js` or implementing them locally in `src/providers/` will completely resolve both findings.

---

## 4. Conclusion

- **Verdict**: **REQUEST_CHANGES**
- **Actionable Fix Instructions**:
  1. **Fix Finding 1**: In `src/mapper.js`, add `extractYear` (and optionally `findCategoryGroup`, `extractGenres`, `extractCountry`) to `module.exports`, OR implement `extractYear` as a local helper within `src/providers/nguonc.js`.
  2. **Fix Finding 2**: In `src/mapper.js`, add `unpackDeanEdwards` to `module.exports`.
  3. **Re-run Full Adversarial Test Suite** to confirm cold-cache title search matching succeeds on NguonC and Dean Edwards unpacking succeeds on VsMov.

---

## 5. Verification Method

To independently verify these findings, run:

```bash
# 1. Verify missing exports
node -e "
const mapper = require('./src/mapper');
console.log('mapper.extractYear:', typeof mapper.extractYear);
console.log('mapper.unpackDeanEdwards:', typeof mapper.unpackDeanEdwards);
"

# 2. Verify NguonC cold-cache search crash
node -e "
const nguonc = require('./src/providers/nguonc');
nguonc.getStreams({ title: 'Inception', type: 'movie', year: 2010, proxyBase: 'http://localhost' })
  .then((streams) => console.log('Streams returned:', streams.length))
  .catch((err) => console.error('Caught error:', err));
"
```
