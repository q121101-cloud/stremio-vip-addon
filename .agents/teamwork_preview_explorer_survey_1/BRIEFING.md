# BRIEFING — 2026-08-18T01:37:00Z

## Mission
Investigate VSMOV provider architecture in `src/providers/vsmov.js` and related files regarding server tab separation (Vietsub, Lồng tiếng, Thuyết minh), VIP naming conventions, subtitle proxying, and In-App protocol compliance.

## 🔒 My Identity
- Archetype: Teamwork explorer
- Roles: survey, investigation, synthesis
- Working directory: /Users/quan/.gemini/antigravity/scratch/stremio-nguonc-addon/.agents/teamwork_preview_explorer_survey_1
- Original parent: cbf03e27-0cd9-44c3-b074-91f636153881
- Milestone: VSMOV Provider Architecture Investigation

## 🔒 Key Constraints
- Read-only investigation — do NOT implement
- Analyze server groups/tabs structure in VSMOV responses
- Analyze exact stream naming and title formatting
- Analyze subtitle routing to /hls/sub.vtt
- Ensure In-App protocol compliance (url present, externalUrl omitted)

## Current Parent
- Conversation ID: cbf03e27-0cd9-44c3-b074-91f636153881
- Updated: 2026-08-18T01:37:00Z

## Investigation State
- **Explored paths**: `src/providers/vsmov.js`, `src/routes/hls.js`, `src/handlers.js`, `src/manifest.js`, `src/config.js`, `tests/fixtures.js`, `tests/e2e.test.js`, live VSMOV API and player embed endpoints (`vsmov.com/api`, `streamvsmov.com`).
- **Key findings**:
  1. VSMOV returns an `episodes` array containing audio tabs with unnormalized `server_name` (e.g. `"Vietsub\r\n #1"`, `"Lồng tiếng #1"`).
  2. Subtitles are located in embed HTML's `playerOptions.subtitles` array and need resolution to absolute URLs.
  3. `src/handlers.js` line 944 currently drops `subtitles` unless `sanitized.subtitles = item.subtitles` is added.
  4. Stream titles must precisely follow the required Vietsub, Lồng Tiếng, and Thuyết Minh 4K format with `name: "VIP Movies 🎬"`.
  5. `GET /hls/sub.vtt` endpoint with Referer spoofing and SRT-to-VTT converter is required in `src/routes/hls.js`.
- **Unexplored areas**: None for this survey milestone.

## Key Decisions Made
- Fully documented 4-part architectural analysis in `analysis.md` and synthesized into 5-component `handoff.md`.

## Artifact Index
- `/Users/quan/.gemini/antigravity/scratch/stremio-nguonc-addon/.agents/teamwork_preview_explorer_survey_1/analysis.md` — Detailed analysis
- `/Users/quan/.gemini/antigravity/scratch/stremio-nguonc-addon/.agents/teamwork_preview_explorer_survey_1/handoff.md` — 5-component handoff report
- `/Users/quan/.gemini/antigravity/scratch/stremio-nguonc-addon/.agents/teamwork_preview_explorer_survey_1/progress.md` — Progress heartbeat
