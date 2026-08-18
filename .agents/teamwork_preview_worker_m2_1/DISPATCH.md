## 2026-08-18T03:38:14Z

You are a Worker agent implementing Milestone 2: KKPhim Smart Search Fallback against 404s for Hotfix v1.5.2.
Your working directory is: /Users/quan/.gemini/antigravity/scratch/stremio-nguonc-addon/.agents/teamwork_preview_worker_m2_1

Read the following files:
- `/Users/quan/.gemini/antigravity/scratch/stremio-nguonc-addon/.agents/ORIGINAL_REQUEST.md`
- `/Users/quan/.gemini/antigravity/scratch/stremio-nguonc-addon/.agents/explorer_survey_kkphim/survey_report.md`
- `/Users/quan/.gemini/antigravity/scratch/stremio-nguonc-addon/.agents/teamwork_preview_orchestrator_1/PROJECT.md`

MANDATORY INTEGRITY WARNING:
DO NOT CHEAT. All implementations must be genuine. DO NOT hardcode test results, create dummy/facade implementations, or circumvent the intended task. A teamwork_preview_auditor will independently verify your work. Integrity violations WILL be detected and your work WILL be rejected.

File Ownership: You exclusively own and modify:
- `src/providers/kkphim.js`

Your tasks:
1. In `src/providers/kkphim.js`:
   - Implement the 3-Tier lookup mechanism:
     - **Tier 1**: Direct lookup by IMDb ID via `https://phimapi.com/imdb/title/:imdbId`. Cache successful movie detail in LRU cache.
     - **Tier 2**: If Tier 1 fails (HTTP 404, error, or no stream), asynchronously resolve Cinemeta metadata via `resolveCinemeta(imdbId)` to get Vietnamese/English titles and aliases. Search `/v1/api/tim-kiem?keyword=...` for candidate slugs, compute match score with `scoreMatch`, pick the best matching slug (score >= 0.45, early break at >= 0.70), fetch details via `/phim/:slug`, cache the IMDb -> slug mapping, and return the streams.
     - **Tier 3**: If all lookups fail, return safe empty array `[]` (zero crash, zero 404 stream).
   - Implement flexible episode matching `matchEpisodeItem` for series supporting:
     - Exact number matching (`"1"`), zero-padding (`"01"`), `"Tập 1"`, `"tap-1"`, `"tap-01"`, regex number extraction, and 1-based index fallback.
2. Verification:
   - Run `node --check src/providers/kkphim.js`.
   - Run quick probe on known IMDb IDs (e.g. `tt5095030` Avengers Infinity War, `tt0903747` Breaking Bad) to verify streams are returned without 404.
   - Run existing tests to verify no regressions.
3. Write your changes summary and test results to `/Users/quan/.gemini/antigravity/scratch/stremio-nguonc-addon/.agents/teamwork_preview_worker_m2_1/handoff.md`.

When complete, send a message to parent summarizing your work.
