# Milestone 2 Review & Adversarial Stress Handoff Report

**Reviewer:** Milestone 2 Reviewer 1 (reviewer, critic)  
**Date:** 2026-08-17  
**Working Directory:** `/Users/quan/.gemini/antigravity/scratch/stremio-nguonc-addon`  
**Review Target Files:** `src/providers/kkphim.js`, `src/providers/nguonc.js`, `src/providers/vsmov.js`  
**Verdict:** **REQUEST_CHANGES**

---

## 1. Observation

Direct code analysis, static inspection, and empirical fault-injection testing revealed the following observations:

### 1.1 Syntax & Baseline Execution
- `node --check src/providers/kkphim.js`: Exited 0 (No syntax errors).
- `node --check src/providers/nguonc.js`: Exited 0 (No syntax errors).
- `node --check src/providers/vsmov.js`: Exited 0 (No syntax errors).
- `node --check src/index.js`: Exited 0 (No syntax errors).
- `node tests/cinemeta_challenger.test.js`: All 16 tests passed (100%).

### 1.2 Observation: Broken Import in `src/providers/nguonc.js` (Critical Finding 1)
- In `src/providers/nguonc.js:81`, the `scoreMatch` function executes:
  ```javascript
  let itemYear = mapper.extractYear(item.category);
  ```
- In `src/mapper.js:48-54`, `extractYear(category)` is defined, but `src/mapper.js:355-367` does NOT export `extractYear`:
  ```javascript
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
- Executing `node -e "console.log(typeof require('./src/mapper').extractYear)"` outputs `undefined`.
- When `nguonc.getStreams({ title: 'Inception', year: 2010, type: 'movie' })` runs with search results, `scoreMatch()` throws:
  ```
  [NguonC/getStreams] Error: mapper.extractYear is not a function
  ```
  The error is caught by the provider's `try...catch` and returns an empty array `[]`. Consequently, NguonC search matching via Cinemeta canonical title & release year fails completely.

### 1.3 Observation: Broken Import in `src/providers/vsmov.js` (Critical Finding 2)
- In `src/providers/vsmov.js:21`, the file imports:
  ```javascript
  const { unpackDeanEdwards } = require('../mapper');
  ```
- In `src/providers/vsmov.js:181-185`, when an obfuscated embed player script is encountered, it executes:
  ```javascript
  if (embedHtml.includes('eval(function(p,a,c,k,e,')) {
    const unpacked = unpackDeanEdwards(embedHtml);
    ...
  }
  ```
- In `src/mapper.js:163-190`, `unpackDeanEdwards(packed)` is defined, but it is NOT exported in `src/mapper.js:355-367`.
- Executing `node -e "console.log(typeof require('./src/mapper').unpackDeanEdwards)"` outputs `undefined`.
- When `vsmov.extractFromFilmPage` encounters Dean Edwards packed JavaScript, calling `unpackDeanEdwards` throws:
  ```
  [VsMov] extractFromFilmPage failed: unpackDeanEdwards is not a function
  ```
  resulting in failure to extract the `1080p` stream from packed players.

### 1.4 Verified Passing Requirements
- **5s Timeout**: Configured via `timeout: 5000` in axios instances for `kkphim.js:31`, `nguonc.js:31`, and `vsmov.js:34`.
- **Top-Level Error Isolation**: All three providers wrap `getStreams` in `try...catch` and safely return `[]` on error or timeout without crashing the aggregator.
- **KKPhim**: Direct IMDb lookup (`/imdb/title/${imdbId}`) -> fallback Cinemeta canonical title & year search -> all servers (Vietsub, Thuyết Minh, Lồng Tiếng) verified working.
- **R3 Stremio Stream Protocol Exclusivity**:
  - HLS Proxy items have `url` and NO `externalUrl`.
  - Embed Player items have `externalUrl` and NO `url`.
  - Titles follow `[VIP • ${Provider}] ...` and `[Dự phòng • ${Provider}] ...` correctly.

---

## 2. Logic Chain

1. **Premise 1 (R2 Contract)**: The R2 requirement dictates that `nguonc.js` must search with Cinemeta title & year to match and return Vietsub & Thuyết Minh streams, and `vsmov.js` must extract streams from embed pages using multi-pattern scanning and unpacker support.
2. **Premise 2 (Runtime Failure)**:
   - In `src/providers/nguonc.js:81`, `scoreMatch` calls `mapper.extractYear(item.category)`.
   - Because `extractYear` is not in `src/mapper.js` exports, `mapper.extractYear` evaluates to `undefined`.
   - In JavaScript, invoking an `undefined` property as a function triggers a fatal `TypeError`.
   - When triggered, `nguonc.js:390` catches the exception and returns `[]`, causing zero streams to be returned for any title-matched search.
3. **Premise 3 (Unpacker Failure)**:
   - In `src/providers/vsmov.js:21`, `const { unpackDeanEdwards } = require('../mapper')` assigns `undefined` to `unpackDeanEdwards`.
   - Invoking `unpackDeanEdwards(embedHtml)` inside `vsmov.js:182` triggers `TypeError: unpackDeanEdwards is not a function`, preventing stream extraction for any packed embed player.
4. **Deduction**: Because two of the three providers fail at runtime under standard operational flows due to missing module exports in `src/mapper.js`, Milestone 2 deliverables cannot be approved until these export references are resolved.

---

## 3. Caveats

- In the sandboxed local environment without live internet connectivity, external API domains (`phimapi.com`, `phim.nguonc.com`, `vsmov.com`) return DNS lookup errors (`ENOTFOUND`), which all three providers gracefully catch and handle by returning `[]`.
- The TypeErrors were verified via deterministic unit tests with mocked Axios responses.

---

## 4. Conclusion

- **Verdict**: **REQUEST_CHANGES**
- **Action Items for Worker**:
  1. **Fix `src/mapper.js` exports**: Add `extractYear` and `unpackDeanEdwards` to `module.exports` in `src/mapper.js`.
  2. **Verify `src/providers/nguonc.js`**: Verify that `scoreMatch` successfully computes year bonus without throwing `TypeError: mapper.extractYear is not a function`.
  3. **Verify `src/providers/vsmov.js`**: Verify that `unpackDeanEdwards` is a callable function when imported by `vsmov.js`.
  4. **Run Full Test Suite**: Confirm that `node tests/e2e.test.js` passes with 0 logged TypeErrors.

---

## 5. Verification Method

To verify the defects and validate the fixes:

1. **Verify missing exports currently**:
   ```bash
   node -e "
   const mapper = require('./src/mapper');
   console.log('extractYear:', typeof mapper.extractYear); // Currently 'undefined' -> should be 'function'
   console.log('unpackDeanEdwards:', typeof mapper.unpackDeanEdwards); // Currently 'undefined' -> should be 'function'
   "
   ```

2. **Verify NguonC search matching execution**:
   ```bash
   node -e "
   const axios = require('axios');
   const originalRequest = axios.Axios.prototype.request;
   axios.Axios.prototype.request = async function(configOrUrl, maybeConfig) {
     const config = typeof configOrUrl === 'string' ? { url: configOrUrl, ...(maybeConfig || {}) } : (configOrUrl || {});
     const url = config.url || '';
     if (url.includes('/films/search')) {
       return {
         status: 200,
         data: {
           items: [{
             name: 'Kẻ Đánh Cắp Giấc Mơ',
             original_name: 'Inception',
             slug: 'ke-danh-cap-giac-mo',
             category: { '1': { group: { name: 'Năm' }, list: [{ name: '2010' }] } }
           }]
         }
       };
     }
     if (url.includes('/film/ke-danh-cap-giac-mo')) {
       return {
         status: 200,
         data: {
           movie: {
             slug: 'ke-danh-cap-giac-mo',
             episodes: [{ server_name: 'Server #1 - Vietsub', items: [{ name: 'Full', embed: 'https://phim.nguonc.com/embed/1' }] }]
           }
         }
       };
     }
     return originalRequest.call(this, configOrUrl, maybeConfig);
   };

   const nguonc = require('./src/providers/nguonc');
   nguonc.getStreams({ title: 'Inception', year: 2010, type: 'movie', proxyBase: 'http://localhost:7000' })
     .then(streams => {
       console.log('NguonC streams count:', streams.length);
       if (streams.length === 2) console.log('✅ NguonC Search Matching PASSED');
       else console.error('❌ NguonC Search Matching FAILED');
     });
   "
   ```
