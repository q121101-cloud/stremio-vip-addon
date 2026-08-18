# BRIEFING — 2026-08-18T11:44:00+07:00

## Mission
Formulate exact implementation changes for `src/routes/hls.js` (HLS Proxy Referer routing) supporting STP, CLBPX, YAN while preserving zero regression for existing providers.

## 🔒 My Identity
- Archetype: explorer
- Roles: investigation, synthesis
- Working directory: /Users/quan/.gemini/antigravity/scratch/stremio-nguonc-addon/.agents/teamwork_preview_explorer_m1_3
- Original parent: 7fe7db36-8ec4-4ad9-bc14-f6fa0b444fae
- Milestone: M1_3 (Provider Upgrades & HLS Routing - HLS Routes)

## 🔒 Key Constraints
- Read-only investigation — do NOT implement directly in src/
- Target scope: `src/routes/hls.js`
- Ensure header injection logic preserves existing behavior and zero regression for `vsmov`, `kkphim`, `nguonc`, `hh3d`
- Produce 5-component handoff report

## Current Parent
- Conversation ID: 7fe7db36-8ec4-4ad9-bc14-f6fa0b444fae
- Updated: 2026-08-18T11:44:00+07:00

## Investigation State
- **Explored paths**:
  - `src/routes/hls.js` (Lines 1–507)
  - `src/index.js` (Router mounting)
  - `tests/verify_playback.js`, `tests/verify_hotfix_vsmov_kkphim.js`, `src/test.js`
  - Survey reports 1, 2, 3
- **Key findings**:
  - `SOURCE_REFERERS` in `src/routes/hls.js` needs pattern updates for `sieutamphim.pro`, `clbphimxua.info`, and `yanhh3d.pw`/`fbcdn.cloud`/`defifa.com`.
  - Discovered critical substring overlap: `yanhh3d.pw` contains `hh3d`. Positioned `yanhh3d` rule before `hh3d` to avoid false-positive referer injection when `refParam` is absent.
  - Zero regression verified across 7/7 + 27/27 + 50/50 baseline tests.
- **Unexplored areas**: None for M1_3 scope.

## Key Decisions Made
- Fully specified `SOURCE_REFERERS` replacement array with precise precedence ordering and domain patterns.
- Tested and verified pattern matching with comprehensive test matrix.

## Artifact Index
- DISPATCH.md — incoming dispatch instructions
- progress.md — liveness heartbeat
- handoff.md — complete 5-component implementation specification for `src/routes/hls.js`
