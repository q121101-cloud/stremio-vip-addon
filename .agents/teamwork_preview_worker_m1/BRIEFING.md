# BRIEFING — 2026-08-18T11:50:00+07:00

## Mission
Implement updates to STP, CLBPX, and YAN providers and HLS proxy routing for Milestone 1 (Engine v1.6.0) ensuring strict invariants and zero regression.

## 🔒 My Identity
- Archetype: worker
- Roles: implementer, qa, specialist
- Working directory: /Users/quan/.gemini/antigravity/scratch/stremio-nguonc-addon/.agents/teamwork_preview_worker_m1
- Original parent: 7fe7db36-8ec4-4ad9-bc14-f6fa0b444fae
- Milestone: M1 - Provider Upgrades & HLS Routing

## 🔒 Key Constraints
- Exclusive ownership: `src/providers/stp.js`, `src/providers/clbpx.js`, `src/providers/yan.js`, `src/routes/hls.js`
- No `externalUrl` in any stream object (only `url` pointing to HLS proxy)
- Import `scoreMatch` from `src/lib/utils.js` (no re-declaration)
- Stream labels must match exact brand format
- Zero regression: `verify_playback.js` 7/7 PASS, `verify_hotfix_vsmov_kkphim.js` 27/27 PASS, `src/test.js` PASS

## Current Parent
- Conversation ID: 7fe7db36-8ec4-4ad9-bc14-f6fa0b444fae
- Updated: 2026-08-18T11:50:00+07:00

## Task Summary
- **What to build**: Update `src/providers/stp.js`, `src/providers/clbpx.js`, `src/providers/yan.js`, and `src/routes/hls.js` per M1 explorer specifications.
- **Success criteria**: All provider syntax checks pass, HLS routing checks pass, all regression tests pass (7/7, 27/27, 50/50).
- **Interface contracts**: PROJECT.md § Interface Contracts
- **Code layout**: PROJECT.md § Code Layout

## Key Decisions Made
- `stp.js`: Integrated WP-JSON search + robust multiline regex HTML parsing for `data-episodes` with XOR 0x2a decoding, fallback to PhimAPI, safe `[]` return, brand label `[VIP 4 • STP] Thuyết Minh HD (HLS Proxy)\n⚡ Server STP • sieutamphim.pro`.
- `clbpx.js`: Updated to `https://clbphimxua.info`, integrated Ophim API + HTML search scraping fallback, safe `[]` return, brand label `[VIP 5 • CLBPX] Lồng Tiếng Cổ Điển (HLS Proxy)\n⚡ Server CLBPX • clbphimxua.info`.
- `yan.js`: Updated to `https://yanhh3d.pw`, integrated Tier 1 direct live scraping (`data-obf.pU`/`master.m3u8`) + Tier 2 Ophim fallback + Tier 3 safe `[]` return, brand label `[VIP 6 • YAN] 4K/FHD Donghua 3D (HLS Proxy)\n⚡ Server YAN • yanhh3d.pw`.
- `src/routes/hls.js`: Added routing entries for `sieutamphim.pro`, `clbphimxua.info`, and `yanhh3d.pw`/`fbcdn.cloud`/`defifa.com` with precedence before `hh3d|hoathinh3d`.

## Artifact Index
- `.agents/teamwork_preview_worker_m1/DISPATCH.md` — Assignment dispatch
- `.agents/teamwork_preview_worker_m1/BRIEFING.md` — Agent briefing & situational memory
- `.agents/teamwork_preview_worker_m1/progress.md` — Liveness heartbeat & task tracking
- `.agents/teamwork_preview_worker_m1/handoff.md` — Final handoff report
- `tests/test_m1_invariants.js` — Unit & invariant test suite for M1

## Change Tracker
- **Files modified**:
  - `src/providers/stp.js`: Upgraded to Engine v1.6.0 with sieutamphim.pro domain, XOR 0x2a deobfuscation, multi-tier extraction, VIP 4 brand label.
  - `src/providers/clbpx.js`: Upgraded to Engine v1.6.0 with clbphimxua.info domain, HTML scrape fallback, VIP 5 brand label.
  - `src/providers/yan.js`: Upgraded to Engine v1.6.0 with yanhh3d.pw domain, live stream scraping (data-obf.pU/master.m3u8), VIP 6 brand label.
  - `src/routes/hls.js`: Updated SOURCE_REFERERS for new provider domains with precedence ordering.
- **Build status**: PASS (all syntax checks and regression tests pass 100%)
- **Pending issues**: none

## Quality Status
- **Build/test result**: PASS (7/7 playback, 27/27 hotfix, 50/50 integration, 11/11 M1 invariant tests)
- **Lint status**: 0 violations
- **Tests added/modified**: `tests/test_m1_invariants.js`
