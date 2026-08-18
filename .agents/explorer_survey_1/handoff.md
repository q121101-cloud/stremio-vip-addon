# Handoff Report: Provider Ecosystem & Utility Functions Survey

**Agent**: Explorer Survey 1  
**Timestamp**: 2026-08-18T00:56:55Z  
**Working Directory**: `/Users/quan/.gemini/antigravity/scratch/stremio-nguonc-addon/.agents/explorer_survey_1`  
**Handoff Type**: Hard (Task Complete)

---

## 1. Observation

1. **`src/lib/utils.js` Exports**:
   - Lines 313–325 export:
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
   - Matches all canonical helper functions required by R1.

2. **Duplicate Function Declarations in Providers**:
   - `src/providers/vsmov.js`:
     - Line 21: `const { safeExtra, safeSlug, safeKeyword, safePage, safeType, isSeasonMatch } = require('../lib/utils');`
     - Lines 48–51: Duplicate local `escapeRegExp(str)`
     - Lines 73–143: Duplicate local `scoreMatch(item, title, year = null, season = null)`
   - `src/providers/kkphim.js`:
     - Line 20: `const { safeExtra, safeSlug, safeKeyword, safePage, safeType, isSeasonMatch } = require('../lib/utils');`
     - Lines 52–55: Duplicate local `escapeRegExp(str)`
     - Lines 70–140: Duplicate local `scoreMatch(item, title, year = null, season = null)`
   - `src/providers/nguonc.js`:
     - Line 21: `const { safeExtra, safeSlug, safeKeyword, safePage, safeType, isSeasonMatch } = require('../lib/utils');`
     - Lines 44–47: Duplicate local `escapeRegExp(str)`
     - Lines 52–122: Duplicate local `scoreMatch(item, title, year = null, season = null)`
   - `src/providers/stp.js`:
     - Line 21: `const { safeExtra, safeSlug, safeKeyword, safePage, safeType, isSeasonMatch } = require('../lib/utils');`
     - Lines 43–46: Duplicate local `escapeRegExp(str)`
     - Lines 61–131: Duplicate local `scoreMatch(item, title, year = null, season = null)`
   - `src/providers/hh3d.js`:
     - Line 21: `const { safeExtra, safeSlug, safeKeyword, safePage, safeType, isSeasonMatch } = require('../lib/utils');`
     - Lines 43–46: Duplicate local `escapeRegExp(str)`
     - Lines 61–131: Duplicate local `scoreMatch(item, title, year = null, season = null)`
   - `src/providers/yan.js`:
     - Line 21: `const { safeExtra, safeSlug, safeKeyword, safePage, safeType, isSeasonMatch } = require('../lib/utils');`
     - Lines 43–46: Duplicate local `escapeRegExp(str)`
     - Lines 61–131: Duplicate local `scoreMatch(item, title, year = null, season = null)`
   - `src/providers/clbpx.js`:
     - Line 21: `const { safeExtra, safeSlug, safeKeyword, safePage, safeType, isSeasonMatch } = require('../lib/utils');`
     - Lines 43–46: Duplicate local `escapeRegExp(str)`
     - Lines 61–131: Duplicate local `scoreMatch(item, title, year = null, season = null)`

3. **Standard Provider Interface**:
   All 7 provider files export:
   - `getStreams(payload)` & `getStreams(arg1, title, type, season, episode, proxyBase)`
   - `getCatalog(type, page = 1, extra = {})`
   - `search(keyword, page/limit)`
   - `getDetail(slug)`
   - `id`, `label`

4. **Stream Extraction & Referer Headers**:
   - VSMOV 4K: `Referer: https://vsmov.com/` (resolves master playlist via `resolveMasterPlaylistUrl`)
   - KKPhim: `Referer: https://player.phimapi.com/` (or `https://phimapi.com/`)
   - NguonC: `Referer: https://embed15.streamc.xyz/`
   - STP: `Referer: https://suutamphim.org/`
   - HH3D: `Referer: https://hh3d.tv/`
   - YAN: `Referer: https://yanhh3d.org/`
   - CLBPX: `Referer: https://clbphimxua.com/`
   - All streams omit `externalUrl` and encode target URLs into `${proxyBase}/hls/manifest.m3u8?url=...&ref=...`.

5. **Test Command Execution**:
   - `node --check src/index.js` & all modules passed with exit code 0.
   - `node tests/verify_playback.js` passed 100% (downloaded real 3.35 MB `.ts` segment with HTTP 200, MPEG-TS sync byte `0x47`, and HTTP 206 range test).

---

## 2. Logic Chain

1. **Premise**: R1 requires `src/lib/utils.js` to export canonical helper functions and remove duplicate function declarations in provider files, importing them strictly from `../lib/utils.js`.
2. **Analysis**:
   - Inspection of `src/lib/utils.js` confirms that `scoreMatch`, `normalizeText`, `escapeRegExp`, `safeExtra`, `safeSlug`, `safeKeyword`, `safePage`, `extractSeasonNumber`, and `isSeasonMatch` are fully implemented and exported.
   - Inspection of each provider file shows that `scoreMatch` and `escapeRegExp` are redundantly declared in `vsmov.js`, `kkphim.js`, `nguonc.js`, `stp.js`, `hh3d.js`, `yan.js`, and `clbpx.js`.
3. **Inference**:
   - Deduplication across all 7 providers can be achieved cleanly by importing `scoreMatch` and `escapeRegExp` from `../lib/utils.js` and removing the local function declarations.
   - The stream object structure, HLS proxy encapsulation, and title formatting across all 7 providers are fully compliant with R1 and Stremio Stream Protocol requirements.

---

## 3. Caveats

- Upstream CDN domains occasionally update their anti-hotlinking tokens or sub-domains (e.g. `s1.streamvsmov.com` vs `p24.streamvsmov.com` or `embed15.streamc.xyz`), but the dynamic regex patterns in `src/routes/hls.js` (`SOURCE_REFERERS`) correctly handle these domains.
- No other caveats found.

---

## 4. Conclusion

The provider ecosystem and utility layer are well-architected, stable, and functionally sound. The only refactoring needed for R1 compliance is the removal of the duplicate `scoreMatch` and `escapeRegExp` function declarations across all 7 provider files and importing them from `src/lib/utils.js`.

---

## 5. Verification Method

To verify these findings independently, run the following commands in the project root:

```bash
# 1. Syntax check all source and provider files
node --check src/index.js
node --check src/lib/utils.js
node --check src/providers/vsmov.js
node --check src/providers/kkphim.js
node --check src/providers/nguonc.js
node --check src/providers/stp.js
node --check src/providers/hh3d.js
node --check src/providers/yan.js
node --check src/providers/clbpx.js

# 2. Run the full E2E playback verification suite
node tests/verify_playback.js

# 3. View survey report
cat .agents/explorer_survey_1/survey_report.md
```
