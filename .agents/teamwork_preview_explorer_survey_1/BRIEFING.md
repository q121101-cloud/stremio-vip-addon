# BRIEFING — 2026-08-18T04:42:00Z

## Mission
Survey and investigate STP provider (`src/providers/stp.js`, `src/lib/utils.js`) and live site `https://sieutamphim.pro/` for Stremio VIP Movies Addon Engine v1.6.0.

## 🔒 My Identity
- Archetype: explorer
- Roles: survey, investigation, synthesis
- Working directory: /Users/quan/.gemini/antigravity/scratch/stremio-nguonc-addon/.agents/teamwork_preview_explorer_survey_1
- Original parent: 7fe7db36-8ec4-4ad9-bc14-f6fa0b444fae
- Milestone: Engine v1.6.0 Survey Phase

## 🔒 Key Constraints
- Read-only investigation — do NOT implement changes in codebase (write only report/artifacts in working dir).
- Investigate STP provider, live endpoint behavior, headers, slug search/matching, stream extraction, multi-tier fallback, and `utils.js` export/usage.

## Current Parent
- Conversation ID: 7fe7db36-8ec4-4ad9-bc14-f6fa0b444fae
- Updated: 2026-08-18T04:42:00Z

## Investigation State
- **Explored paths**:
  - `src/providers/stp.js`, `src/lib/utils.js`, `src/routes/hls.js`, `src/handlers.js`, `src/providers/vsmov.js`, `src/providers/kkphim.js`, `src/providers/clbpx.js`, `src/providers/yan.js`, `src/providers/hh3d.js`
  - Live site `https://sieutamphim.pro/` endpoints: root, `/wp-json/wp/v2/posts`, `/wp-json/wp/v2/categories`, `/wp-json/wp/v2/tags`, `embed.html`, post HTML SSR.
- **Key findings**:
  - `sieutamphim.pro` is a WordPress 6.x site with REST API (`/wp-json/wp/v2/posts?search=...` and `?slug=...`).
  - Episode data stored in `<div class="episodeGroup" data-server="hx" data-episodes='[ {"<enc_url>","<ep_name>"}, ... ]'>`.
  - Obfuscation key is XOR `0x2a` (42). Embed player uses `https://www.sieutamphim.pro/embed.html?url=...`.
  - `scoreMatch` in `src/lib/utils.js` is exported cleanly and imported by all providers without re-declaration.
  - Zero-regression test suites pass 100% (7/7 and 27/27).
- **Unexplored areas**: None within Explorer 1 scope.

## Key Decisions Made
- Fully documented the WP-JSON REST endpoints, XOR 42 deobfuscation mechanism, HTML SSR fallback, label format specification, and HLS proxy routing for `sieutamphim.pro`.

## Artifact Index
- `.agents/teamwork_preview_explorer_survey_1/handoff.md` — Final 5-component handoff report
- `.agents/teamwork_preview_explorer_survey_1/progress.md` — Progress tracker and heartbeat
