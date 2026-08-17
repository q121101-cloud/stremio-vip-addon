# Milestone 2 Challenger 2 Empirical Verification Report

## Final Verdict: REJECT ❌

---

## 1. Observation

### Observation 1.1: Runtime `TypeError: mapper.extractYear is not a function` in NguonC
- **File**: `src/mapper.js` (lines 48-54, 355-367) vs `src/providers/nguonc.js` (line 81)
- **Code in `src/mapper.js`**:
  ```javascript
  // Line 48:
  function extractYear(category) {
    if (!category) return null;
    const g = findCategoryGroup(category, 'Năm');
    if (!g || !g.list || !g.list.length) return null;
    const year = parseInt(g.list[0].name, 10);
    return isNaN(year) ? null : year;
  }
  // Line 355-367 (module.exports):
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
  Notice `extractYear` is omitted from `module.exports`.
- **Code in `src/providers/nguonc.js`**:
  ```javascript
  // Line 81 in scoreMatch():
  let itemYear = mapper.extractYear(item.category);
  ```
- **Empirical Execution Command**:
  ```bash
  node -e "const mapper = require('./src/mapper'); console.log('extractYear:', typeof mapper.extractYear);"
  ```
- **Result Output**:
  ```
  extractYear: undefined
  ```
- **Runtime Error during Stream Aggregation (`GET /stream/movie/tt1375666.json`)**:
  ```
  [Stream Aggregator] type=movie id=tt1375666 activeProviders=nguonc
  [NguonC/getStreams] Error: mapper.extractYear is not a function
  [Stream Aggregator] id=tt1375666 → Total 0 high-speed streams
  ```

---

### Observation 1.2: Missing export `unpackDeanEdwards` in `src/mapper.js`
- **File**: `src/mapper.js` (lines 163-190, 355-367) vs `src/providers/vsmov.js` (lines 21, 181-182)
- **Code in `src/providers/vsmov.js`**:
  ```javascript
  // Line 21:
  const { unpackDeanEdwards } = require('../mapper');
  // Line 181-182:
  if (embedHtml.includes('eval(function(p,a,c,k,e,')) {
    const unpacked = unpackDeanEdwards(embedHtml);
  ```
- **Empirical Execution Command**:
  ```bash
  node -e "const mapper = require('./src/mapper'); console.log('unpackDeanEdwards:', typeof mapper.unpackDeanEdwards);"
  ```
- **Result Output**:
  ```
  unpackDeanEdwards: undefined
  ```

---

### Observation 1.3: `DEFAULT_CONFIG.providers` defaults only to `['nguonc']`
- **File**: `src/config.js` (lines 18-22) vs `src/handlers.js` (lines 601-604) vs `ORIGINAL_REQUEST.md` (R2 & Acceptance Criteria)
- **Code in `src/config.js`**:
  ```javascript
  const DEFAULT_CONFIG = {
    providers: ['nguonc'],
    categories: ['movie', 'series'],
    apiKey: '',
  };
  ```
- **Impact in `src/handlers.js`**:
  ```javascript
  const activeProviderKeys = config.providers.filter((p) => ALL_PROVIDERS[p]);
  const providersToRun = (activeProviderKeys.length > 0 ? activeProviderKeys : ['nguonc', 'kkphim', 'vsmov'])
    .map((k) => ALL_PROVIDERS[k]);
  ```
  Because `config.providers` is `['nguonc']`, `activeProviderKeys` evaluates to `['nguonc']`. Only NguonC is executed on default `/stream/movie/tt1375666.json` requests; KKPhim and VsMov are excluded unless custom query tokens are provided.
- **Requirement in `ORIGINAL_REQUEST.md` Acceptance Criteria**:
  > "Querying `/stream/movie/tt1375666.json` (Inception) resolves title via Cinemeta, returns active streams from KKPhim, NguonC, and VsMov."

---

### Observation 1.4: Verified Robust Components
1. **Year Matching & Disambiguation**:
   - `scoreMatch` in KKPhim (`src/providers/kkphim.js`: lines 55-103) and NguonC (`src/providers/nguonc.js`: lines 47-113) applies +0.25 bonus for exact year, +0.1 for ±1 year, and -0.2 penalty for year mismatch.
   - Disambiguation between same-title films (e.g. *Dune* 1984 vs 2021, *Spider-Man* 2002 vs 2017) accurately routes to the correct slug without false-positive collisions.
2. **Episode Variation Matching**:
   - Tested variations (`1`, `01`, `Tập 1`, `Tập 02`, `tap-1`, `tap-01`, `Full`, word-boundary regexes `\bX\b`, and 1-based index fallbacks) correctly resolve to the intended episode. Out-of-bounds episode requests return `[]` gracefully.
3. **Server Name Formatting**:
   - Both KKPhim and NguonC clean server names using `.replace(/#/g, '').trim()`, correctly formatting `Vietsub 1`, `Thuyết Minh 2`, `Lồng Tiếng 3` without `#` artifacts.
4. **Stream Protocol Compliance**:
   - In-App HLS Proxy streams contain valid `url` and strictly omit `externalUrl`.
   - Embed Player fallback streams contain valid `externalUrl` and strictly omit `url`.
   - Standard branding `VIP Movies 🎬` and `behaviorHints: { notSupported: false, bingeGroup: ... }` are properly populated.
5. **Provider Error Isolation**:
   - Axios client timeout is set to 5000ms across all providers.
   - Provider failures are caught and handled via `Promise.allSettled` in the Aggregator.

---

## 2. Logic Chain

1. **Step 1 (Observation 1.1)**: `src/mapper.js` implements `extractYear`, but fails to export it in `module.exports`.
2. **Step 2 (Observation 1.1)**: `src/providers/nguonc.js` relies on `mapper.extractYear(item.category)` inside `scoreMatch`. When any title search query (such as Inception or Breaking Bad) runs, `scoreMatch` throws `TypeError: mapper.extractYear is not a function`.
3. **Step 3 (Observation 1.1)**: `nguonc.getStreams` catches this exception and returns `[]` (0 streams). NguonC is completely disabled for title searches.
4. **Step 4 (Observation 1.2)**: `src/providers/vsmov.js` imports `unpackDeanEdwards` from `../mapper`, which is also omitted from `module.exports`, causing a runtime TypeError when decoding packed embed scripts.
5. **Step 5 (Observation 1.3)**: `DEFAULT_CONFIG.providers` is configured as `['nguonc']` rather than `['nguonc', 'kkphim', 'vsmov']`. Consequently, default stream queries to `/stream/movie/tt1375666.json` only attempt NguonC (which fails per Step 3) and ignore KKPhim and VsMov, resulting in 0 total streams returned.
6. **Step 6 (Empirical Simulation in `tests/verification_simulation.test.js`)**: When `mapper.extractYear`, `mapper.unpackDeanEdwards`, and `DEFAULT_CONFIG.providers = ['nguonc', 'kkphim', 'vsmov']` are patched in memory, `/stream/movie/tt1375666.json` immediately succeeds and aggregates 4 active streams across KKPhim and NguonC.
7. **Conclusion**: The implementation contains two critical/high bugs preventing multi-provider stream delivery and Acceptance Criteria fulfillment, requiring a **REJECT** verdict.

---

## 3. Caveats

- Upstream gateways for VsMov (`streamvsmov.com`, `vsmov.net`) intermittently encounter DNS resolution errors in certain test environments, but VsMov gracefully catches these and returns `[]` without disrupting KKPhim and NguonC.
- No other caveats.

---

## 4. Conclusion

**Verdict: REJECT ❌**

### Actionable Fix Instructions for Worker:
1. **`src/mapper.js`**: Add `extractYear` and `unpackDeanEdwards` (and any other helpers) to `module.exports`:
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
     extractYear,
     unpackDeanEdwards,
   };
   ```
2. **`src/config.js`**: Update `DEFAULT_CONFIG.providers` to activate all 3 providers by default:
   ```javascript
   const DEFAULT_CONFIG = {
     providers: ['nguonc', 'kkphim', 'vsmov'],
     categories: ['movie', 'series'],
     apiKey: '',
   };
   ```

---

## 5. Verification Method

To independently reproduce the failures and verify the fixes:

1. Run the empirical challenger test harness:
   ```bash
   node tests/empirical_m2_challenger.test.js
   ```
   *Expected Current Output*: 2 PASSED, 6 FAILED (`mapper.extractYear is not a function`, `DEFAULT_CONFIG.providers` missing `kkphim`).

2. Run the proof-of-fix simulation script:
   ```bash
   node tests/verification_simulation.test.js
   ```
   *Expected Output*: PASS with 4 aggregated high-speed streams for Inception (`tt1375666`).

3. Verify Live Stream Query:
   ```bash
   curl -s http://localhost:7000/stream/movie/tt1375666.json | jq .
   ```
