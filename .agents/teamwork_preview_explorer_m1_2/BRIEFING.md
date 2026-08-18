# BRIEFING — 2026-08-18T04:45:00Z

## Mission
Formulate exact implementation specifications and diffs for `src/providers/clbpx.js` and `src/providers/yan.js` for Milestone 1 (Provider Upgrades & HLS Routing).

## 🔒 My Identity
- Archetype: explorer
- Roles: [explorer, synthesis]
- Working directory: /Users/quan/.gemini/antigravity/scratch/stremio-nguonc-addon/.agents/teamwork_preview_explorer_m1_2
- Original parent: 7fe7db36-8ec4-4ad9-bc14-f6fa0b444fae
- Milestone: Milestone 1 (Provider Upgrades & HLS Routing)

## 🔒 Key Constraints
- Read-only investigation — do NOT implement directly in src/
- Follow Handoff Protocol (5 components: Observation, Logic Chain, Caveats, Conclusion, Verification Method)
- Multi-tier stream extraction with proxy routing
- Strict invariants: only `url`, no `externalUrl`, `scoreMatch` from `src/lib/utils.js`, brand titles, safe `[]` fallback

## Current Parent
- Conversation ID: 7fe7db36-8ec4-4ad9-bc14-f6fa0b444fae
- Updated: 2026-08-18T04:45:00Z

## Investigation State
- **Explored paths**: `src/providers/clbpx.js`, `src/providers/yan.js`, `src/providers/stp.js`, `src/lib/utils.js`, `src/routes/hls.js`, `src/handlers.js`, `tests/verify_playback.js`, `tests/verify_hotfix_vsmov_kkphim.js`, live endpoints on `https://clbphimxua.info/` and `https://yanhh3d.pw/`.
- **Key findings**:
  1. CLBPX: `clbphimxua.info` is active (HTTP 200). Uses WordPress HalimMovies theme with Ophim data sync. HTML search at `/?s=<keyword>` parses `<article>` and `<a class="halim-thumb">`. Standard stream title is `[VIP 5 • CLBPX] Lồng Tiếng Cổ Điển (HLS Proxy)\n⚡ Server CLBPX • clbphimxua.info`.
  2. YAN: `yanhh3d.pw` is active (HTTP 200). Live search at `/search?keysearch=<keyword>`. Direct scraping of episode page `/tap-<ep>` yields `sv_LINK*` buttons with `data-src` pointing to `fbcdn.cloud`. Base64 decoding of `data-obf` yields unencrypted `pU` playlist; direct JWPlayer embed yields `master.m3u8?storage=drive`. TS segment fetch verified (5.46 MB with MPEG-TS sync byte at offset 271). Ophim JSON API serves as secondary fallback. Safe `[]` fallback on failure. Standard stream title is `[VIP 6 • YAN] 4K/FHD Donghua 3D (HLS Proxy)\n⚡ Server YAN • yanhh3d.pw`.
  3. Strict Invariants: Zero `externalUrl` (only `url`), import `scoreMatch` from `src/lib/utils.js`.
- **Unexplored areas**: None within scope of M1_2 (`clbpx.js` & `yan.js`).

## Key Decisions Made
- Architected multi-tier scraper for `yan.js`: Tier 1 (live scraping `yanhh3d.pw` -> `data-obf.pU` / `master.m3u8`), Tier 2 (Ophim JSON fallback `phimapi.com`), Tier 3 (safe `[]`).
- Architected multi-tier scraper for `clbpx.js`: Tier 1 (Ophim JSON API `phimapi.com`), Tier 2 (HTML search fallback on `clbphimxua.info/?s=`), Tier 3 (safe `[]`).
- Standardized stream labels, bingeGroups, and HLS proxy encoding across both providers.

## Artifact Index
- DISPATCH.md — Dispatch log
- BRIEFING.md — Working memory
- progress.md — Heartbeat and progress log
- handoff.md — Final handoff report with complete code specifications and diffs
