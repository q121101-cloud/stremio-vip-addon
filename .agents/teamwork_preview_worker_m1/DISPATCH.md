## Milestone 1 Worker Dispatch: Cinemeta Resolver & LRU Cache
Working Directory: /Users/quan/.gemini/antigravity/scratch/stremio-nguonc-addon
Agent Directory: /Users/quan/.gemini/antigravity/scratch/stremio-nguonc-addon/.agents/teamwork_preview_worker_m1
Exclusive Write Ownership: `src/lib/cinemeta.js`, `src/lib/cache.js`, `src/api.js`

References:
- /Users/quan/.gemini/antigravity/scratch/stremio-nguonc-addon/.agents/ORIGINAL_REQUEST.md
- /Users/quan/.gemini/antigravity/scratch/stremio-nguonc-addon/PROJECT.md
- /Users/quan/.gemini/antigravity/scratch/stremio-nguonc-addon/.agents/teamwork_preview_explorer_survey_1/handoff.md

Task:
1. Implement `src/lib/cinemeta.js`:
   - Resolve IMDb IDs (`tt...` or `tt...:season:ep`) via official Cinemeta API (`https://v3-cinemeta.strem.io/meta/${type}/${imdbId.split(':')[0]}.json`).
   - Extract canonical title (`meta.name`), release year (`meta.year` parsed as 4-digit number), `releaseInfo`, `genres`, and `aliases`.
   - Use 5-second axios timeout.
   - Cache Cinemeta metadata in `cinemetaCache` with 24h TTL.
2. Update `src/lib/cache.js`:
   - Instantiate and export `cinemetaCache = new LRUCache(5000, 86400)`.
3. Update `src/api.js`:
   - Connect or delegate `resolveCinemeta` to `src/lib/cinemeta.js`.
4. Verify code with `node --check src/lib/cinemeta.js`, `node --check src/lib/cache.js`, `node --check src/api.js`, and unit probe test.
5. Write detailed handoff report in your agent directory.

MANDATORY INTEGRITY WARNING:
DO NOT CHEAT. All implementations must be genuine. DO NOT hardcode test results, create dummy/facade implementations, or circumvent the intended task. A auditor will independently verify your work. Integrity violations WILL be detected and your work WILL be rejected.
