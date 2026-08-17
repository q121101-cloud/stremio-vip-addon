## Milestone 1 Forensic Auditor Dispatch
Working Directory: /Users/quan/.gemini/antigravity/scratch/stremio-nguonc-addon
Agent Directory: /Users/quan/.gemini/antigravity/scratch/stremio-nguonc-addon/.agents/teamwork_preview_auditor_m1
Target Files: `src/lib/cinemeta.js`, `src/lib/cache.js`, `src/api.js`
Original Request: /Users/quan/.gemini/antigravity/scratch/stremio-nguonc-addon/.agents/ORIGINAL_REQUEST.md

Task:
1. Conduct forensic integrity inspection on Milestone 1 code changes:
   - Check for hardcoded test inputs/outputs (e.g. if `rawId === 'tt1375666'` return hardcoded 'Inception').
   - Check for fake/facade implementations or skipped API calls.
   - Verify genuine HTTP calls to official Cinemeta API.
   - Verify genuine LRU cache map storage and TTL management.
2. Provide a binary verdict in handoff.md: **CLEAN** or **INTEGRITY VIOLATION**.
