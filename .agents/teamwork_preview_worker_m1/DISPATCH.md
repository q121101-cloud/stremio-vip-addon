## 2026-08-18T04:47:53Z

You are the Worker for Milestone 1: Provider Upgrades (STP, CLBPX, YAN) & HLS Proxy Routing.
Your working directory is: /Users/quan/.gemini/antigravity/scratch/stremio-nguonc-addon/.agents/teamwork_preview_worker_m1

You MUST read the following files before making changes:
- /Users/quan/.gemini/antigravity/scratch/stremio-nguonc-addon/.agents/ORIGINAL_REQUEST.md
- /Users/quan/.gemini/antigravity/scratch/stremio-nguonc-addon/PROJECT.md
- /Users/quan/.gemini/antigravity/scratch/stremio-nguonc-addon/.agents/teamwork_preview_explorer_m1_1/handoff.md
- /Users/quan/.gemini/antigravity/scratch/stremio-nguonc-addon/.agents/teamwork_preview_explorer_m1_2/handoff.md
- /Users/quan/.gemini/antigravity/scratch/stremio-nguonc-addon/.agents/teamwork_preview_explorer_m1_3/handoff.md

You own exclusively:
- `src/providers/stp.js`
- `src/providers/clbpx.js`
- `src/providers/yan.js`
- `src/routes/hls.js`

Tasks:
1. Implement all updates to `src/providers/stp.js` per M1_1 handoff (domain: `https://sieutamphim.pro`, referer headers, label `[VIP 4 • STP] Thuyết Minh HD (HLS Proxy)\n⚡ Server STP • sieutamphim.pro`, multi-tier extraction with XOR 0x2a decode and safe fallback, strict invariants: only `url`, no `externalUrl`, `scoreMatch` imported from `src/lib/utils.js`).
2. Implement all updates to `src/providers/clbpx.js` per M1_2 handoff (domain: `https://clbphimxua.info`, referer headers, label `[VIP 5 • CLBPX] Lồng Tiếng Cổ Điển (HLS Proxy)\n⚡ Server CLBPX • clbphimxua.info`, multi-tier extraction + safe fallback, strict invariants: only `url`, no `externalUrl`, `scoreMatch` imported from `src/lib/utils.js`).
3. Implement all updates to `src/providers/yan.js` per M1_2 handoff (domain: `https://yanhh3d.pw`, referer headers, label `[VIP 6 • YAN] 4K/FHD Donghua 3D (HLS Proxy)\n⚡ Server YAN • yanhh3d.pw`, multi-tier extraction with live scraping `data-obf.pU`/`master.m3u8` + Ophim fallback + safe `[]`, strict invariants: only `url`, no `externalUrl`, `scoreMatch` imported from `src/lib/utils.js`).
4. Implement all updates to `src/routes/hls.js` per M1_3 handoff (add `SOURCE_REFERERS` entries for `sieutamphim.pro`, `clbphimxua.info`, `yanhh3d.pw`/`fbcdn.cloud`/`defifa.com` ensuring order priority before `hh3d`).
5. Run build/syntax check and test verification commands:
   - `node --check src/index.js`
   - `node --check src/providers/stp.js`
   - `node --check src/providers/clbpx.js`
   - `node --check src/providers/yan.js`
   - `node --check src/routes/hls.js`
   - `node tests/verify_playback.js` (must PASS 7/7)
   - `node tests/verify_hotfix_vsmov_kkphim.js` (must PASS 27/27)
   - `node src/test.js`
6. Write your handoff report to `/Users/quan/.gemini/antigravity/scratch/stremio-nguonc-addon/.agents/teamwork_preview_worker_m1/handoff.md`.
