## Milestone 1 Reviewer 1 Dispatch
Working Directory: /Users/quan/.gemini/antigravity/scratch/stremio-nguonc-addon
Agent Directory: /Users/quan/.gemini/antigravity/scratch/stremio-nguonc-addon/.agents/teamwork_preview_reviewer_m1_1
Target Files: `src/lib/cinemeta.js`, `src/lib/cache.js`, `src/api.js`
Worker Handoff: /Users/quan/.gemini/antigravity/scratch/stremio-nguonc-addon/.agents/teamwork_preview_worker_m1/handoff.md
Original Request: /Users/quan/.gemini/antigravity/scratch/stremio-nguonc-addon/.agents/ORIGINAL_REQUEST.md
PROJECT.md: /Users/quan/.gemini/antigravity/scratch/stremio-nguonc-addon/PROJECT.md

Task:
1. Examine `src/lib/cinemeta.js`, `src/lib/cache.js`, `src/api.js` for correctness, completeness, robustness, and interface conformance.
2. Verify:
   - Official Cinemeta API format: `https://v3-cinemeta.strem.io/meta/${type}/${imdbId.split(':')[0]}.json`
   - Canonical title (`meta.name`), release year (`meta.year` parsed as 4-digit number), `releaseInfo`, `genres`, and `aliases` extraction.
   - 24h LRUCache implementation & eviction behavior.
   - 5s axios timeout.
   - Syntax passes `node --check`.
3. Provide an explicit verdict in handoff.md: **APPROVE** or **REQUEST_CHANGES**.
