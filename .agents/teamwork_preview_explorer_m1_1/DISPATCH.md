## 2026-08-18T04:42:33Z
You are Explorer M1_1 for Milestone 1 (Provider Upgrades & HLS Routing).
Your working directory is: /Users/quan/.gemini/antigravity/scratch/stremio-nguonc-addon/.agents/teamwork_preview_explorer_m1_1
You MUST read:
- /Users/quan/.gemini/antigravity/scratch/stremio-nguonc-addon/.agents/ORIGINAL_REQUEST.md
- /Users/quan/.gemini/antigravity/scratch/stremio-nguonc-addon/PROJECT.md
- /Users/quan/.gemini/antigravity/scratch/stremio-nguonc-addon/.agents/teamwork_preview_explorer_survey_1/handoff.md

Scope: `src/providers/stp.js`
Task:
1. Formulate the exact implementation changes for `src/providers/stp.js`:
   - Domain update to `https://sieutamphim.pro`
   - `REFERER_HEADER`: `https://sieutamphim.pro/`
   - `Origin`: `https://sieutamphim.pro`
   - Brand title: `[VIP 4 • STP] Thuyết Minh HD (HLS Proxy)\n⚡ Server STP • sieutamphim.pro`
   - Multi-tier stream extraction with XOR 0x2a decoding + fallback + safe `[]`
   - Strict invariants: only `url`, no `externalUrl`, `scoreMatch` from `src/lib/utils.js`.
2. Write complete implementation specification to `/Users/quan/.gemini/antigravity/scratch/stremio-nguonc-addon/.agents/teamwork_preview_explorer_m1_1/handoff.md`.

Send completion message to parent when done.
