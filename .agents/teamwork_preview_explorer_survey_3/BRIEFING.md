# BRIEFING — 2026-08-18T11:40:00+07:00

## Mission
Survey codebase for v1.6.0 release: HLS routing/referer handling, existing & new test suites, and version bump locations.

## 🔒 My Identity
- Archetype: Explorer
- Roles: Survey & Investigation
- Working directory: /Users/quan/.gemini/antigravity/scratch/stremio-nguonc-addon/.agents/teamwork_preview_explorer_survey_3
- Original parent: 7fe7db36-8ec4-4ad9-bc14-f6fa0b444fae
- Milestone: v1.6.0 Survey

## 🔒 Key Constraints
- Read-only investigation — do NOT implement
- Survey `src/routes/hls.js`, test suites, version bump locations
- Follow Handoff Protocol (5 components)

## Current Parent
- Conversation ID: 7fe7db36-8ec4-4ad9-bc14-f6fa0b444fae
- Updated: not yet

## Investigation State
- **Explored paths**:
  - `src/routes/hls.js`: analyzed `SOURCE_REFERERS`, `getRefererHeaders`, manifest & segment proxy header forwarding.
  - `src/providers/stp.js`, `src/providers/clbpx.js`, `src/providers/yan.js`: reviewed referer constants and stream generation logic.
  - `tests/verify_playback.js`: validated 7/7 passing assertions.
  - `tests/verify_hotfix_vsmov_kkphim.js`: validated 27/27 passing assertions.
  - `tests/helpers.js`, `tests/m2_providers.test.js`, `src/test.js`: evaluated test runner patterns and E2E requirements.
  - `package.json`, `src/manifest.js`, `src/handlers.js`, `src/index.js`, `src/config.js`: located all version bump spots.
- **Key findings**:
  - `SOURCE_REFERERS` in `src/routes/hls.js` requires mapping updates for `sieutamphim.pro`, `clbphimxua.info`, and `yanhh3d.pw`.
  - Referer header injection operates via `getRefererHeaders` in both manifest and segment proxies with fallback to `SOURCE_REFERERS` matching against `targetUrl`.
  - Existing test suites `verify_playback.js` (7/7) and `verify_hotfix_vsmov_kkphim.js` (27/27) currently pass 100% and will serve as zero-regression gates.
  - `tests/verify_new_providers.js` requirements clearly defined: server lifecycle, provider catalogs/streams, manifest rewriting, aggregator route safety, binary TS chunk download (>10KB, sync byte 0x47), and HTTP range 206 checks.
  - Version bump locations precisely identified across `package.json`, `src/manifest.js`, `src/handlers.js` (live status pill + brand footer), and helper file headers.
- **Unexplored areas**: None within Explorer 3 scope.

## Key Decisions Made
- Fully cataloged all file paths, exact line numbers, and code structures needed for implementation and test construction.

## Artifact Index
- `/Users/quan/.gemini/antigravity/scratch/stremio-nguonc-addon/.agents/teamwork_preview_explorer_survey_3/handoff.md` — 5-component survey handoff report.
