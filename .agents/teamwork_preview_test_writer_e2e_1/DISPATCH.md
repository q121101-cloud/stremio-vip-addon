## 2026-08-17T03:20:11Z
## E2E Test Writer Dispatch
Working Directory: /Users/quan/.gemini/antigravity/scratch/stremio-nguonc-addon
Agent Directory: /Users/quan/.gemini/antigravity/scratch/stremio-nguonc-addon/.agents/teamwork_preview_test_writer_e2e_1
References:
- /Users/quan/.gemini/antigravity/scratch/stremio-nguonc-addon/.agents/ORIGINAL_REQUEST.md
- /Users/quan/.gemini/antigravity/scratch/stremio-nguonc-addon/PROJECT.md

Task:
1. Design and implement a comprehensive opaque-box E2E test suite in `tests/e2e.test.js` (or runner script).
2. Create `TEST_INFRA.md` covering Tiers 1-4:
   - Tier 1: Feature Coverage (Cinemeta resolver, LRUCache, KKPhim, NguonC, VsMov, HLS proxy format, Embed player format, multi-provider error isolation, health/manifest endpoints, UI versioning).
   - Tier 2: Boundary & Corner Cases (invalid IMDb IDs, timeouts, malformed responses, series ep parsing, missing years, special characters).
   - Tier 3: Cross-Feature Combinations (Simulated provider failures while others succeed, series vs movie resolution, etc.).
   - Tier 4: Real-World Scenarios (Inception `tt1375666`, Breaking Bad `tt0903747`, anime, standalone titles).
3. Ensure tests assert Stremio protocol exclusivity:
   - In-app HLS Proxy streams have `url` and NO `externalUrl`.
   - Embed Player streams have `externalUrl` and NO `url`.
   - Titles match `[VIP • ...]` and `[Dự phòng • ...]`.
4. Ensure test runner can be executed cleanly (e.g. `node tests/e2e.test.js` or `npm test`).
5. Publish `TEST_READY.md` upon completion and write handoff report.
