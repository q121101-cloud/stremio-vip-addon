## Milestone 2 Challenger 1 Dispatch
Working Directory: /Users/quan/.gemini/antigravity/scratch/stremio-nguonc-addon
Agent Directory: /Users/quan/.gemini/antigravity/scratch/stremio-nguonc-addon/.agents/teamwork_preview_challenger_m2_1
Target Files: `src/providers/kkphim.js`, `src/providers/nguonc.js`, `src/providers/vsmov.js`
Original Request: /Users/quan/.gemini/antigravity/scratch/stremio-nguonc-addon/.agents/ORIGINAL_REQUEST.md

Task:
1. Write and run empirical stress tests against the 3 providers.
2. Test cases:
   - Live/mock queries for movie (`tt1375666` Inception) and series (`tt0903747:1:1`).
   - Strict Stremio stream protocol assertions:
     - HLS Proxy has `url` and NO `externalUrl`.
     - Embed Player has `externalUrl` and NO `url`.
     - Standardized title format check.
   - Fault injection: Mock provider throwing error or timing out >5s -> verify provider returns `[]` without crashing.
3. Provide empirical verdict in handoff.md: **APPROVE** or **REJECT**.
