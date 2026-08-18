## 2026-08-18T04:42:33Z
You are Explorer M1_2 for Milestone 1 (Provider Upgrades & HLS Routing).
Your working directory is: /Users/quan/.gemini/antigravity/scratch/stremio-nguonc-addon/.agents/teamwork_preview_explorer_m1_2
You MUST read:
- /Users/quan/.gemini/antigravity/scratch/stremio-nguonc-addon/.agents/ORIGINAL_REQUEST.md
- /Users/quan/.gemini/antigravity/scratch/stremio-nguonc-addon/PROJECT.md
- /Users/quan/.gemini/antigravity/scratch/stremio-nguonc-addon/.agents/teamwork_preview_explorer_survey_2/handoff.md

Scope: `src/providers/clbpx.js` and `src/providers/yan.js`
Task:
1. Formulate the exact implementation changes for `src/providers/clbpx.js`:
   - Domain `clbphimxua.info`, `REFERER_HEADER`: `https://clbphimxua.info/`, `Origin`: `https://clbphimxua.info`
   - Brand title: `[VIP 5 • CLBPX] Lồng Tiếng Cổ Điển (HLS Proxy)\n⚡ Server CLBPX • clbphimxua.info`
   - Multi-tier stream extraction + safe `[]`
   - Strict invariants: only `url`, no `externalUrl`, `scoreMatch` from `src/lib/utils.js`.
2. Formulate the exact implementation changes for `src/providers/yan.js`:
   - Domain `yanhh3d.pw`, `REFERER_HEADER`: `https://yanhh3d.pw/`, `Origin`: `https://yanhh3d.pw`
   - Brand title: `[VIP 6 • YAN] 4K/FHD Donghua 3D (HLS Proxy)\n⚡ Server YAN • yanhh3d.pw`
   - Direct live scraping with Base64 `data-obf.pU` / `master.m3u8` extractor + Ophim JSON fallback + safe `[]`
   - Strict invariants: only `url`, no `externalUrl`, `scoreMatch` from `src/lib/utils.js`.
3. Write complete implementation specification to `/Users/quan/.gemini/antigravity/scratch/stremio-nguonc-addon/.agents/teamwork_preview_explorer_m1_2/handoff.md`.

Send completion message to parent when done.
