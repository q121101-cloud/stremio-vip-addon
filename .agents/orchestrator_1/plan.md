# Project Plan — VIP Movies Stremio Addon Audit, Backtest & Deploy

## Objective
Audit all 8 providers, verify HLS proxy fallback resilience, run full matrix live backtest against real CDN streams, fix any discovered issues, ensure 100% test pass rate, and push to origin/main via designated git protocol.

## Milestones & Work Breakdown
- **Phase 0: Survey & Code Audit (R1)**
  - Dispatch 3 parallel Explorers:
    1. Explorer 1: Audit `src/providers/nguonc.js` (stealth headers, Chrome 131 UA, Vercel-to-Render fallback routing via `RENDER_BACKEND_URL`) and `src/providers/film4k.js` (REST API scraping, 4K m3u8 extraction, multi-audio/subtitles, episode matching).
    2. Explorer 2: Audit `src/routes/hls.js` (upstream >= 400 error graceful fallback with 302/re-extraction, broken cache purge via `m3u8Cache.del(cacheKey)`).
    3. Explorer 3: Audit `src/manifest.js`, `src/config.js`, `src/handlers.js`, and HTML configurator across all 8 providers (`film4k`, `vsmov`, `kkphim`, `nguonc`, `stp`, `hh3d`, `yan`, `clbpx`) for `VALID_PROVIDERS`, `DEFAULT_CONFIG.providers`, `ALL_PROVIDERS`, `ALL_CATALOGS`, `ALL_ID_PREFIXES`, `_allProvidersList`, and UI grid.
- **Phase 1: Remediation & Verification of Core Engine (R1, R4)**
  - Synthesize explorer audit findings.
  - Worker fixes any discrepancies / edge cases in `src/`.
  - Reviewer & Auditor gate verification.
- **Phase 2: Live Matrix Backtest & Fallback Simulation (R2, R3)**
  - Worker builds and executes `tests/live_backtest_all_providers.js` and fallback simulation test.
  - Verify all 8 providers for catalog, streams, proxy URL, m3u8 `#EXTM3U`, and .ts segment download (>50KB, byte 0x47 or 0x89) for >= 5/8 providers.
  - Verify fallback behavior on broken/expired upstream CDN without 502 Bad Gateway and with cache purge.
- **Phase 3: Final Test Suite & Git Deployment (R4)**
  - Worker runs full `npm test` ensuring 0 failures.
  - Worker executes git push protocol.
  - Challenger & Forensic Auditor verify integrity.
- **Phase 4: Synthesis & Final Reporting**
  - Synthesize results, status matrix table, and report to parent.
