## 2026-08-18T09:52:50Z

<USER_REQUEST>
You are Worker M3 (Multi-Keyword Search Fallback & Universal Episode Matching).
Your working directory is `/Users/quan/.gemini/antigravity/scratch/stremio-nguonc-addon/.agents/worker_m3/`.
Read `/Users/quan/.gemini/antigravity/scratch/stremio-nguonc-addon/.agents/ORIGINAL_REQUEST.md` and `/Users/quan/.gemini/antigravity/scratch/stremio-nguonc-addon/PROJECT.md`.
Read Explorer 3 analysis at `/Users/quan/.gemini/antigravity/scratch/stremio-nguonc-addon/.agents/explorer_survey_matching_tests/analysis.md`.

MANDATORY INTEGRITY WARNING:
DO NOT CHEAT. All implementations must be genuine. DO NOT hardcode test results, create dummy/facade implementations, or circumvent the intended task. An auditor will independently verify your work. Integrity violations WILL be detected and your work WILL be rejected.

File ownership:
You exclusively own and modify:
- `src/lib/utils.js` (or create if needed, or update existing utility files)
- `src/providers/kkphim.js`
- `src/providers/nguonc.js`
- `src/providers/index.js` (if coordinating multi-keyword search across providers)

Requirements to implement:
1. Multi-Keyword Fallback in `generateSearchKeywords(title, originalName, aliases)`:
   - Try 1: Original English name (`meta.name` / `title`)
   - Try 2: Vietnamese name (if present in title, aliases, or alternative titles)
   - Try 3: Normalized title with all season indicators (`Season 1`, `Phần 9`, `P1`, `S01`, etc.) and special characters stripped.
   - For example: *Teach You A Lesson*, *A Shop for Killers*, *Lanterns*, *9-1-1*, *Avengers 3*.
2. Universal Episode Matching in `matchEpisodeItem(serverItem, targetEpNumber)`:
   - Match numbers accurately across `1`, `01`, `001`, `Tập 01`, `tap-1`, `episode-1`, and `Full`.
   - Prevent false matches (e.g. Episode 1 matching Episode 10/11/12).
3. Apply these multi-keyword search routines in `src/providers/kkphim.js` and `src/providers/nguonc.js` so that Korean & Western dramas find matching streams reliably.
4. Run syntax check (`node --check src/index.js`) and tests (`npm test`).
5. Write your implementation report to `.agents/worker_m3/changes.md` and handoff report to `.agents/worker_m3/handoff.md`.
6. Send a message to orchestrator when complete.
</USER_REQUEST>
