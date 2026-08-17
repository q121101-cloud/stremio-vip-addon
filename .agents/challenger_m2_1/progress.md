# Progress Log

Last visited: 2026-08-17T15:35:30Z

## Status: Empirical Adversarial Challenge Complete
- Reviewed all 7 providers in `src/providers/` (vsmov, kkphim, nguonc, stp, hh3d, yan, clbpx).
- Executed `node tests/verify_playback.js` -> 100% Pass (3.34 MB TS chunk downloaded, Sync Byte 0x47 confirmed, HTTP Range 206).
- Verified zero `externalUrl` invariant -> 100% of generated stream objects contain only `url` and NO `externalUrl`.
- Designed and ran comprehensive adversarial test suite (`tests/m2_challenger1_comprehensive.test.js`) with 404 tests across edge cases:
  * Negative episode indices
  * Malformed IDs & injection payloads
  * Out-of-bounds series seasons & episodes
  * Non-existent titles & regex bombs
  * Function signature & input sanitization
- Discovered 3 categories of concrete bugs:
  1. Specialized providers (`stp.js`, `hh3d.js`, `yan.js`, `clbpx.js`) lack fuzzy score matching and blindly return `searchItems[0]` when search fallback is triggered for non-existent/bogus titles like `(*+?)`.
  2. Out-of-bounds season requests (e.g. `season=99999`) match shows and return Season 1 Episode 1 rather than empty streams.
  3. TypeError crashes when passing `extra = null` to `getCatalog()` or non-string values to `getDetail()`.
- Created deterministic standalone reproduction script (`tests/reproduce_m2_provider_bugs.js`).
- Verdict: REQUEST_CHANGES.
