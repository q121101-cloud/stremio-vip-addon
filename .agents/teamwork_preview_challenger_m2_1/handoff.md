# Milestone 2 Challenger 1 Handoff Report: Empirical Stress Testing & Protocol Verification

**Agent:** Challenger 1 (`teamwork_preview_challenger_m2_1`)  
**Target Files:** `src/providers/kkphim.js`, `src/providers/nguonc.js`, `src/providers/vsmov.js`  
**Test Suite:** `tests/m2_challenger_empirical.test.js`  
**Verdict:** ❌ **REJECT** (Action Required: Export `extractYear` and `unpackDeanEdwards` in `src/mapper.js`)

---

## 1. Observation

Empirical testing across 152 rigorous test assertions in `tests/m2_challenger_empirical.test.js` revealed the following verified behaviors:

### 1.1 Verified Strengths & Passing Contracts (150/152 Assertions Passed)
- **Stremio Protocol Exclusivity (R3)**:
  - **HLS Proxy**: Verified in `src/providers/kkphim.js` (lines 384–399) and `src/providers/nguonc.js` (lines 363–375). Every generated HLS stream contains a valid `url` (`/hls/manifest.m3u8` or `/hls/extract?b64=...`) and strictly omits `externalUrl` (`externalUrl === undefined`).
  - **Embed Player**: Verified in `src/providers/kkphim.js` (lines 401–412) and `src/providers/nguonc.js` (lines 376–386). Every Embed Player stream contains a valid `externalUrl` and strictly omits `url` (`url === undefined`).
  - **Standardized Titles**: All stream titles strictly follow `[VIP • ${Provider}] ${ServerName}${epLabel} (HLS Proxy)\n⚡ Phát trực tiếp trong App` and `[Dự phòng • ${Provider}] ${ServerName}${epLabel} (Embed Player)\n🌐 Bấm để mở xem ngoài trình duyệt web`.
- **5-Second Axios Timeouts (R2)**:
  - All 3 providers configure `timeout: 5000` on their axios client instances (`kkphim.js:31`, `nguonc.js:31`, `vsmov.js:34`).
- **Series & Movie Episode Matching**:
  - Movie (`tt1375666`) resolves all server streams.
  - Series (`tt0903747:1:1` and `tt0903747:1:2`) matches episode "1" and "2" respectively with `[Tập 1]` / `[Tập 2]` labels.
  - Non-existent episodes (e.g. episode 99) return `[]` cleanly without throwing.
- **Fuzzing & Fault Injection**:
  - 14 adversarial fuzz payloads (`null`, `undefined`, `{}`, `""`, special regex characters `[.*?^$]`, negative/float seasons, malformed proxyBase) were passed to `getStreams()`; all 3 providers gracefully handled these without crashing.
  - Corrupted and partial episode objects (`[null, {}, { name: null, link_m3u8: null }]`) returned valid streams or `[]` safely.
  - The Express stream aggregator (`src/handlers.js:550–624`) cleanly handled provider rejections and applied selective configuration filtering (`providers: ['kkphim']` -> 6 streams, `providers: ['nguonc']` -> 4 streams, all 3 -> 10 streams).

### 1.2 Identified Critical Defects (2/152 Assertions Failed)
During deep contract dependency testing, two unexported dependencies in `src/mapper.js` were empirically discovered:

1. **`src/providers/nguonc.js:81` — `mapper.extractYear is not a function`**:
   - `src/providers/nguonc.js` (line 19) imports `const mapper = require('../mapper');`.
   - In `scoreMatch` (line 81): `let itemYear = mapper.extractYear(item.category);`.
   - In `src/mapper.js`, `function extractYear(category)` is defined at line 48, but is **NOT** included in `module.exports` (lines 355–367).
   - **Verbatim Error**: `TypeError: mapper.extractYear is not a function`.
   - **Impact**: When `nguonc.getStreams()` falls back to title search for titles not already cached by IMDb ID, `scoreMatch` throws this TypeError. `getStreams()` catches the error, logs `[NguonC/getStreams] Error: mapper.extractYear is not a function`, and returns `[]`. As a result, title-based search resolution in NguonC completely fails.

2. **`src/providers/vsmov.js:21` — `unpackDeanEdwards is not a function`**:
   - `src/providers/vsmov.js` (line 21) imports `const { unpackDeanEdwards } = require('../mapper');`.
   - In `extractFromFilmPage` (line 182): `const unpacked = unpackDeanEdwards(embedHtml);`.
   - In `src/mapper.js`, `function unpackDeanEdwards(packed)` is defined at line 163, but is **NOT** included in `module.exports` (lines 355–367).
   - **Verbatim Error**: `TypeError: unpackDeanEdwards is not a function`.
   - **Impact**: Any VsMov embed player protected by Dean Edwards P.A.C.K.E.R encoding fails to unpack, preventing stream extraction from packed player pages.

---

## 2. Logic Chain

1. **Premise 1**: `src/providers/nguonc.js` line 81 relies on `mapper.extractYear()` to extract 4-digit release years from NguonC search results to compute the title similarity score `scoreMatch()`.
2. **Premise 2**: `src/mapper.js` does not export `extractYear` in `module.exports`. Therefore, `mapper.extractYear` evaluates to `undefined`.
3. **Observation 1**: Executing `mapper.extractYear(...)` triggers `TypeError: mapper.extractYear is not a function`.
4. **Premise 3**: In `src/providers/nguonc.js`, line 303 wraps the search matching loop inside `try...catch`. When `scoreMatch` throws, the entire title search fallback is aborted, and `getStreams()` returns `[]`.
5. **Premise 4**: `src/providers/vsmov.js` line 21 requires `{ unpackDeanEdwards }` from `../mapper`. Because `src/mapper.js` does not export it, `unpackDeanEdwards` is `undefined`, breaking P.A.C.K.E.R stream decoding at line 182.
6. **Inference**: While provider isolation and stream protocol exclusivity (R3) are implemented correctly, NguonC's title search fallback and VsMov's packer decoding are non-functional in runtime due to missing exports in `src/mapper.js`.

---

## 3. Caveats

- **Sandbox Network Constraints**: In offline/sandboxed execution, outbound HTTP requests to external domains (`phimapi.com`, `phim.nguonc.com`, `vsmov.com`) fail with `ENOTFOUND`. Provider functions successfully handle this by returning `[]`.
- **Scope Boundary**: As a challenger agent under review-only constraints, implementation code is not modified directly. The remediation is straightforward (exporting `extractYear` and `unpackDeanEdwards` in `src/mapper.js` or declaring them locally in the provider modules).

---

## 4. Conclusion

- **Verdict:** ❌ **REJECT**
- **Rationale**: `src/providers/nguonc.js` and `src/providers/vsmov.js` have broken runtime dependencies on unexported functions in `src/mapper.js` (`extractYear` and `unpackDeanEdwards`).
- **Required Fix**:
  In `src/mapper.js` `module.exports`, add `extractYear` and `unpackDeanEdwards`:
  ```javascript
  module.exports = {
    makeId,
    extractSlug,
    detectType,
    extractYear,          // <-- ADD THIS
    unpackDeanEdwards,    // <-- ADD THIS
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
  Once exported, all 152/152 tests in `tests/m2_challenger_empirical.test.js` will pass, and Milestone 2 will achieve a clean **APPROVE**.

---

## 5. Verification Method

Run the empirical challenger test harness:
```bash
node tests/m2_challenger_empirical.test.js
```

Inspect specific dependency export status:
```bash
node -e "
const mapper = require('./src/mapper');
console.log('mapper.extractYear:', typeof mapper.extractYear);
console.log('mapper.unpackDeanEdwards:', typeof mapper.unpackDeanEdwards);
"
```
*(Expected: both should be `"function"`, currently `"undefined"`).*

Run syntax checks:
```bash
node --check src/providers/kkphim.js
node --check src/providers/nguonc.js
node --check src/providers/vsmov.js
```
