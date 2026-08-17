# Orchestrator Soft Handoff (Generation 1 -> Generation 2)

## Milestone State
- **Milestone 1 (Cinemeta Resolver & LRU Cache)**: **DONE (Gate Passed)**
  - `src/lib/cinemeta.js` implemented with 5s timeout and 24h LRUCache.
  - `src/lib/cache.js` exports `cinemetaCache = new LRUCache(5000, 86400)`.
  - `src/api.js` delegates to `src/lib/cinemeta.js`.
  - Minor refinement noted by Challenger 2: lowercase `rawId.toLowerCase()` and regex `/^tt\d+$/i` in `src/lib/cinemeta.js`.
- **Milestone 2 (Multi-Provider Isolation & R3 Formatting)**: **IN_PROGRESS / REMEDIATION REQUIRED**
  - Worker implemented `src/providers/kkphim.js`, `src/providers/nguonc.js`, `src/providers/vsmov.js`.
  - Gate checks (Reviewers 1 & 2, Challengers 1 & 2, Auditor) detected the following specific defect:
    - `src/mapper.js` defines `extractYear` and `unpackDeanEdwards` but does not include them in `module.exports`.
    - Consequently, `src/providers/nguonc.js:81` throws `TypeError: mapper.extractYear is not a function` during Cinemeta title search matching, and `src/providers/vsmov.js` receives `undefined` for `unpackDeanEdwards`.
    - `DEFAULT_CONFIG.providers` in `src/config.js` is `['nguonc']` instead of activating all 3 `['nguonc', 'kkphim', 'vsmov']`.
- **Milestone 3 (Stream Protocol Standardization & Aggregation)**: **READY FOR DISPATCH**
  - Scope: `src/handlers.js`, `src/routes/hls.js`, `src/mapper.js`, `src/config.js`.
  - Export `extractYear` and `unpackDeanEdwards` in `src/mapper.js`.
  - Update `DEFAULT_CONFIG.providers` to `['nguonc', 'kkphim', 'vsmov']` in `src/config.js`.
  - Lowercase `imdbId` and anchor regex in `src/lib/cinemeta.js`.
  - Enforce stream protocol formatting in `src/handlers.js` and `src/routes/hls.js`.
- **Milestone 4 (Final Acceptance Verification & Git Deploy)**: **PENDING M3 COMPLETION**
  - E2E Test Suite (`tests/e2e.test.js`, `TEST_INFRA.md`, `TEST_READY.md`) is ready.
  - Cyber-Glassmorphism UI and glowing brand footer verified.
  - Run full E2E test suite (`node tests/e2e.test.js`), verify `node --check src/index.js`, execute Git commit and push per R4.

## Active Subagents
- All 16 subagents of Generation 1 have completed their runs and are idle.

## Pending Decisions & Blockers
- None. The defect is precisely identified with known 2-line fixes in `src/mapper.js` and `src/config.js`.

## Remaining Work for Successor
1. Spawn a Worker for Milestone 3 (with write ownership on `src/mapper.js`, `src/config.js`, `src/handlers.js`, `src/routes/hls.js`, `src/lib/cinemeta.js`) to:
   - Export `extractYear` and `unpackDeanEdwards` in `src/mapper.js`.
   - Update `DEFAULT_CONFIG.providers = ['nguonc', 'kkphim', 'vsmov']` in `src/config.js`.
   - Normalize `rawId.toLowerCase()` in `src/lib/cinemeta.js`.
   - Update `src/handlers.js` to enrich provider payload with `{ imdbId, type, title, year, genres, aliases, season, episode, slug, proxyBase }` and sanitize stream items.
2. Run Gate Verification on Milestone 3 & Providers (Reviewers, Challengers, Forensic Auditor).
3. Execute Phase 1 Final Milestone: Run `node tests/e2e.test.js` to ensure 100% tests pass.
4. Execute Phase 2 Adversarial Coverage Hardening with Challengers.
5. Deploy: Run `node --check src/index.js`, `git add .`, `git commit -m "Fix v1.4.0: Cinemeta IMDb title resolution, activate KKPhim/VsMov, separate in-app HLS vs externalUrl Embed"`, `git push origin main`.
6. Send final report to parent `568e28d2-38d3-4b3d-add8-947ab8473326`.

## Key Artifacts
- `/Users/quan/.gemini/antigravity/scratch/stremio-nguonc-addon/.agents/ORIGINAL_REQUEST.md`
- `/Users/quan/.gemini/antigravity/scratch/stremio-nguonc-addon/PROJECT.md`
- `/Users/quan/.gemini/antigravity/scratch/stremio-nguonc-addon/TEST_INFRA.md`
- `/Users/quan/.gemini/antigravity/scratch/stremio-nguonc-addon/TEST_READY.md`
- `/Users/quan/.gemini/antigravity/scratch/stremio-nguonc-addon/.agents/orchestrator/GATE_STATUS.md`
- `/Users/quan/.gemini/antigravity/scratch/stremio-nguonc-addon/.agents/teamwork_preview_worker_m1/handoff.md`
- `/Users/quan/.gemini/antigravity/scratch/stremio-nguonc-addon/.agents/teamwork_preview_worker_m2/handoff.md`
- `/Users/quan/.gemini/antigravity/scratch/stremio-nguonc-addon/.agents/teamwork_preview_auditor_m2/handoff.md`
