# BRIEFING — 2026-08-18T04:42:00Z

## Mission
Survey and audit CLBPX (clbphimxua.info) and YAN (yanhh3d.pw) providers for Stremio VIP Movies Addon Engine v1.6.0.

## 🔒 My Identity
- Archetype: Teamwork explorer
- Roles: survey, reverse-engineering, api analysis, stream extraction investigation
- Working directory: /Users/quan/.gemini/antigravity/scratch/stremio-nguonc-addon/.agents/teamwork_preview_explorer_survey_2
- Original parent: 7fe7db36-8ec4-4ad9-bc14-f6fa0b444fae
- Milestone: Engine v1.6.0 Provider Survey

## 🔒 Key Constraints
- Read-only investigation — do NOT implement production changes in this phase
- Invariants: No externalUrl (url only), scoreMatch imported from src/lib/utils.js, multi-tier fallback (JSON -> HTML -> safe []), HLS proxy routing

## Current Parent
- Conversation ID: 7fe7db36-8ec4-4ad9-bc14-f6fa0b444fae
- Updated: 2026-08-18T04:42:00Z

## Investigation State
- **Explored paths**:
  - `src/providers/clbpx.js`, `src/providers/yan.js`, `src/providers/hh3d.js`, `src/providers/vsmov.js`
  - `src/routes/hls.js`, `src/handlers.js`, `src/manifest.js`, `src/lib/utils.js`
  - Live HTTP probing on `https://clbphimxua.info/` and `https://yanhh3d.pw/`
  - Stream extractor decoding for YAN `data-obf` base64 (`pU` plain m3u8 playlist) and `fbcdn.cloud` embeds
  - TS segment inspection and sync byte verification
- **Key findings**:
  - `clbphimxua.info`: WordPress / HalimMovies theme, search via `/?s=keyword`, images / dataset aligned with PhimAPI / Ophim Hong Kong / Co Trang. Referer `https://clbphimxua.info/`, Origin `https://clbphimxua.info`.
  - `yanhh3d.pw`: Laravel framework, search endpoint `GET https://yanhh3d.pw/search?keysearch=keyword`, episode page `/<slug>/tap-<ep>`. Server buttons `id="sv_LINK1..6"` with `data-src` on `fbcdn.cloud`. Base64 `data-obf` contains unencrypted `#EXTM3U` playlist (`pU`). Referer `https://yanhh3d.pw/`, Origin `https://yanhh3d.pw`.
- **Unexplored areas**: None for survey scope.

## Key Decisions Made
- Structured 5-component handoff report detailing exact search endpoints, regex patterns, base64 payload decoders, stream label formatting, and HLS proxy referer configurations.

## Artifact Index
- `.agents/teamwork_preview_explorer_survey_2/handoff.md` — 5-component comprehensive investigation report
- `.agents/teamwork_preview_explorer_survey_2/progress.md` — Liveness and task execution progress
- `.agents/teamwork_preview_explorer_survey_2/DISPATCH.md` — Dispatch log
