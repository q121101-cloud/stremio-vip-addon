## Milestone 2 Forensic Auditor Dispatch
Working Directory: /Users/quan/.gemini/antigravity/scratch/stremio-nguonc-addon
Agent Directory: /Users/quan/.gemini/antigravity/scratch/stremio-nguonc-addon/.agents/teamwork_preview_auditor_m2
Target Files: `src/providers/kkphim.js`, `src/providers/nguonc.js`, `src/providers/vsmov.js`
Original Request: /Users/quan/.gemini/antigravity/scratch/stremio-nguonc-addon/.agents/ORIGINAL_REQUEST.md

Task:
1. Conduct forensic integrity inspection on Milestone 2 provider implementations:
   - Check for hardcoded responses or bypasses for specific test IDs.
   - Verify genuine HTTP calls to provider APIs (`https://phimapi.com`, `https://phim.nguonc.com/api`, `https://vsmov.com`).
   - Verify genuine score matching, stream extraction, and timeout handling.
2. Provide a binary verdict in handoff.md: **CLEAN** or **INTEGRITY VIOLATION**.
