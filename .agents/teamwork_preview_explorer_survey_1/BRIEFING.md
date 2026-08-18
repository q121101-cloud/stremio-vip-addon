# BRIEFING — 2026-08-18T17:18:00Z

## Mission
Conduct a detailed code audit of `src/providers/nguonc.js` and `src/providers/film4k.js`.

## 🔒 My Identity
- Archetype: explorer
- Roles: investigator, synthesizer
- Working directory: /Users/quan/.gemini/antigravity/scratch/stremio-nguonc-addon/.agents/teamwork_preview_explorer_survey_1
- Original parent: cdcbc7a1-f5e9-482f-bf54-d9f2d980736c
- Milestone: audit_providers

## 🔒 Key Constraints
- Read-only investigation — do NOT implement / modify source code files
- Audit requirements for nguonc.js and film4k.js

## Current Parent
- Conversation ID: cdcbc7a1-f5e9-482f-bf54-d9f2d980736c
- Updated: 2026-08-18T17:18:00Z

## Investigation State
- **Explored paths**: `src/providers/nguonc.js`, `src/providers/film4k.js`, `src/lib/utils.js`, `src/index.js`, `src/handlers.js`, `src/routes/hls.js`, `tests/verify_playback_fix.js`
- **Key findings**:
  - `src/providers/nguonc.js` correctly implements Chrome 131 UA, all required stealth headers (`Referer`, `Origin`, `Sec-Fetch-Dest`, `Sec-Fetch-Mode`, `Sec-Fetch-Site`), and Vercel-to-Render fallback routing via `RENDER_BACKEND_URL`. All streams use `url` (HLS proxy) and omit `externalUrl`.
  - Missing server route: Express app in repo does not define `GET /api/nguonc-proxy` if Render runs the same codebase.
  - `src/providers/film4k.js` correctly calls `/api/home`, `/api/title/:slug`, `/api/watch/:slug`, extracts 4K stream URLs to HLS proxy (`/hls/manifest.m3u8`), handles multi-audio/subtitles via master m3u8, and provides 3-tier series episode matching. All streams strictly use `url`, no `externalUrl`.
  - Bug in `film4k.js:258`: `generateSearchKeywords(queryTitle, targetExtra.aliases)` passes aliases array as 2nd arg (`originalName`), dropping aliases.
  - Minor issue in `film4k.js:234`: `cleanImdb` extraction misses `targetExtra.imdbId`.
  - Unused imports: `scoreMatch` and `isSeasonMatch` imported in `film4k.js` but not utilized during candidate ranking.
- **Unexplored areas**: None for provider scope.

## Key Decisions Made
- Confirmed compliance of both providers with Stremio In-App streaming protocol (100% `url`, zero `externalUrl`).
- Identified 3 bugs/improvements in `film4k.js` and 1 architectural note in `nguonc.js`.

## Artifact Index
- /Users/quan/.gemini/antigravity/scratch/stremio-nguonc-addon/.agents/teamwork_preview_explorer_survey_1/handoff.md — Final audit report
