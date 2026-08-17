## 2026-08-17T15:37:16Z
Apply fixes to `src/providers/` (specifically `stp.js`, `hh3d.js`, `yan.js`, `clbpx.js`, `kkphim.js`, `nguonc.js`, `vsmov.js` as needed):
1. Fuzzy Title Similarity Check:
   In `stp.js`, `hh3d.js`, `yan.js`, `clbpx.js` (and any other provider doing title search fallbacks), ensure when searching by title (fallback for IMDb lookup), the returned item matches the query title with reasonable fuzzy similarity (or substring/word overlap), rather than blindly taking the first search result regardless of title relevance.
2. Out-of-bounds Season Check:
   When resolving series streams for a specific `season` (e.g. `season=99999` or `season=2` when only season 1 exists), verify that the requested season actually exists in the provider's episode list. If the season does not exist, return `[]` instead of incorrectly falling back to Season 1 Episode 1.
3. Safe Default Parameters:
   Ensure `getCatalog(type, catalogId, extra = {})` and `getDetail(slug)` handle null/undefined `extra`, non-string `slug` (use `String(slug || '')`), and unexpected inputs without throwing TypeErrors.

Write ownership:
- `src/providers/stp.js`
- `src/providers/hh3d.js`
- `src/providers/yan.js`
- `src/providers/clbpx.js`
- `src/providers/kkphim.js`
- `src/providers/nguonc.js`
- `src/providers/vsmov.js`
- (and helper if needed in `src/lib/utils.js` or within providers)

Verification:
- Run existing test suites: `node tests/m2_challenger1_comprehensive.test.js` and `node tests/verify_playback.js` (or any other provider test scripts in `tests/`).
- Document all test commands and execution results.

Deliver handoff.md in /Users/quan/.gemini/antigravity/scratch/stremio-nguonc-addon/.agents/worker_m2_remediation/handoff.md and send message to orchestrator.
