## 2026-08-18T03:34:45Z

You are an Explorer agent surveying KKPhim Smart Search Fallback for Hotfix v1.5.2.
Your working directory is: /Users/quan/.gemini/antigravity/scratch/stremio-nguonc-addon/.agents/explorer_survey_kkphim

Read /Users/quan/.gemini/antigravity/scratch/stremio-nguonc-addon/.agents/ORIGINAL_REQUEST.md.
Investigate the codebase in /Users/quan/.gemini/antigravity/scratch/stremio-nguonc-addon, specifically:
- `src/providers/kkphim.js`
- `src/providers/` (check other providers like ophim, phimmoi, nguonc, etc. to see how search/matching is done)
- `src/utils/` (or any string matching / scoreMatch / helper functions)

Your task:
1. Analyze KKPhim's current stream resolution logic and identify why 404 errors happen (e.g. IMDb ID lookup failure or slug mismatch).
2. Detail the 3-tier lookup mechanism required:
   - Tier 1: Direct lookup by IMDb ID.
   - Tier 2: Search by movie title via Cinemeta (`/v1/api/tim-kiem?keyword=...`), score match with `scoreMatch`, pick highest matching slug.
   - Tier 3: If all fail, return safe empty array `[]` without crashing or sending 404 stream.
3. Analyze episode matching algorithm for series: `"1"`, `"01"`, `"Tập 1"`, `tap-1`, `tap-01`.
4. Document all existing helper functions, required changes, edge cases, and dependency details.

Write your findings to:
- `/Users/quan/.gemini/antigravity/scratch/stremio-nguonc-addon/.agents/explorer_survey_kkphim/survey_report.md`
- `/Users/quan/.gemini/antigravity/scratch/stremio-nguonc-addon/.agents/explorer_survey_kkphim/handoff.md`

When complete, send a message to parent summarizing your findings.
