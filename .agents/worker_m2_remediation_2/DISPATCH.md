## 2026-08-18T02:53:14+07:00
You are Worker M2 Remediation.
Your working directory: /Users/quan/.gemini/antigravity/scratch/stremio-nguonc-addon/.agents/worker_m2_remediation_2
Authoritative User Request: /Users/quan/.gemini/antigravity/scratch/stremio-nguonc-addon/ORIGINAL_REQUEST.md
Scope: /Users/quan/.gemini/antigravity/scratch/stremio-nguonc-addon/.agents/orchestrator/PROJECT.md
Predecessor Gate / Challenger Report: /Users/quan/.gemini/antigravity/scratch/stremio-nguonc-addon/.agents/challenger_m2_1/handoff.md

MANDATORY INTEGRITY WARNING:
DO NOT CHEAT. All implementations must be genuine. DO NOT hardcode test results, create dummy/facade implementations, or circumvent the intended task. A teamwork_preview_auditor will independently verify your work. Integrity violations WILL be detected and your work WILL be rejected.

Exclusive write ownership:
- `src/providers/vsmov.js`
- `src/providers/kkphim.js`
- `src/providers/nguonc.js`
- `src/providers/stp.js`
- `src/providers/hh3d.js`
- `src/providers/yan.js`
- `src/providers/clbpx.js`

Tasks:
1. Fix Blind Search Fallback in specialized providers (`src/providers/stp.js`, `src/providers/hh3d.js`, `src/providers/yan.js`, `src/providers/clbpx.js`):
   - Add title similarity matching (like `scoreMatch` in `vsmov.js`/`kkphim.js` requiring similarity score >= 0.45 or 0.5) before accepting search results as a match. Reject adversarial / non-matching titles (e.g. `(*+?)`).
2. Fix Season bounds check across all providers:
   - When a series is requested with a season number (e.g. `season = 99999` or negative / out-of-bounds season), validate that the media item actually corresponds to the requested season. If the season does not exist or cannot be verified, do not blindly serve Season 1 Episode 1. Return `[]`.
3. Fix Parameter defaults & type guards across all providers:
   - In `getCatalog(type, page = 1, extra = {})`: safely handle `extra` when passed as `null` or non-object (e.g. `const { search: searchQuery, genre: genreFilter } = extra || {};`).
   - In `getDetail(slug)` and `search(query)`: add safe type guards (e.g. `if (!slug || typeof slug !== 'string') return null;`, convert numbers to strings or handle non-string gracefully without throwing TypeError).
4. Run verification commands:
   - `node tests/reproduce_m2_provider_bugs.js`
   - `node tests/m2_challenger1_comprehensive.test.js`
   - `node tests/verify_playback.js`
   - Ensure all 3 commands exit with code 0 and 100% tests pass.
