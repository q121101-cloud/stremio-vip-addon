# BRIEFING — 2026-08-18T10:14:30Z

## Mission
Investigate R2: Real Cheerio HTML scrapers for STP (src/providers/stp.js), CLBPX (src/providers/clbpx.js), and YAN (src/providers/yan.js) with strict Donghua Guard for Engine v1.7.0 Overhaul.

## 🔒 My Identity
- Archetype: Teamwork Explorer
- Roles: Investigator, Synthesizer
- Working directory: /Users/quan/.gemini/antigravity/scratch/stremio-nguonc-addon/.agents/teamwork_preview_explorer_survey_2
- Original parent: 7bb95c3e-55dc-40cb-90e7-52ca16df1cd4
- Milestone: Engine v1.7.0 Overhaul - R2 Survey

## 🔒 Key Constraints
- Read-only investigation — do NOT implement production changes in src/
- Analysis and report in .agents/teamwork_preview_explorer_survey_2/
- Follow 5-Component Handoff Protocol

## Current Parent
- Conversation ID: 7bb95c3e-55dc-40cb-90e7-52ca16df1cd4
- Updated: 2026-08-18T10:14:30Z

## Investigation State
- **Explored paths**: `src/providers/stp.js`, `src/providers/clbpx.js`, `src/providers/yan.js`, `src/providers/index.js`, `src/handlers.js`, `src/manifest.js`, `tests/verify_v170_playback.js`, `tests/verify_all_providers_playback.js`, live network endpoints for STP, CLBPX, and YAN.
- **Key findings**:
  1. STP (`sieutamphim.pro`): Real HTML card scraper parses 18-24 cards for categories (`/the-loai/phim-le/`, `/the-loai/phim-au-my/`). Search scrapes `/?s=...` successfully. XOR 0x2a decoding extracts streams from `episodeGroup`. Gaps: shortlink domain handling (`short.ink`), raw title sanitization from post HTML.
  2. CLBPX (`clbphimxua.info`): Real HTML card scraper parses 10-20 cards from `/quoc-gia/hong-kong/` and `/the-loai/co-trang/`. Search `/?s=...` works. Live stream extraction requires calling `player.php` with `{ post_id, server_id, episode_slug }` which gives StreamC embed (`embed3.streamc.xyz`). Gaps: Season 1 matching on movie search results, fallback to PhimAPI wuxia catalog when live search returns standalone movies.
  3. YAN (`yanhh3d.pw`): Real HTML card scraper parses 15-28 cards from `/hoat-hinh-3d`, `/dang-chieu`. Strict Donghua Guard (`isDonghuaOrAnime`) 100% blocks live-action, KDrama, and Hollywood queries (*Teach You A Lesson*, *A Shop for Killers*, *Lanterns* -> 0 streams). Live stream extraction decodes `fbcdn.cloud` embeds into direct `stream-plain` M3U8 URLs.
- **Unexplored areas**: None, full survey complete across all 3 providers.

## Key Decisions Made
- Fully audited STP, CLBPX, and YAN live behaviors, code paths, test suites, and edge cases.

## Artifact Index
- DISPATCH.md — Initial dispatch instructions
- BRIEFING.md — Persistent memory
- progress.md — Liveness heartbeat
- test_survey.js — Live provider survey script
- inspect_pages.js — Watch page inspection script
- debug_clbpx.js — CLBPX player flow debug script
- debug_player.js — CLBPX player endpoint debug script
- debug_yan.js — YAN embed and M3U8 extraction script
- test_yan_detail.js — YAN episode link discovery script
- handoff.md — Final 5-component handoff report
