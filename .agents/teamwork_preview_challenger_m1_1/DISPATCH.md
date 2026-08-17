## Milestone 1 Challenger 1 Dispatch
Working Directory: /Users/quan/.gemini/antigravity/scratch/stremio-nguonc-addon
Agent Directory: /Users/quan/.gemini/antigravity/scratch/stremio-nguonc-addon/.agents/teamwork_preview_challenger_m1_1
Target Module: `src/lib/cinemeta.js` and `src/lib/cache.js`
Original Request: /Users/quan/.gemini/antigravity/scratch/stremio-nguonc-addon/.agents/ORIGINAL_REQUEST.md

Task:
1. Write and execute empirical test harness to stress-test `src/lib/cinemeta.js` and `cinemetaCache`.
2. Test cases:
   - Live Cinemeta resolution on movie (`tt1375666` -> Inception, 2010), series (`tt0903747:1:1` -> Breaking Bad, 2008).
   - Cache hit/miss timing and LRU eviction under load.
   - Fault injection: Invalid IMDb ID, simulated network timeout/failure.
3. Provide an empirical verdict in handoff.md: **APPROVE** or **REJECT**.
