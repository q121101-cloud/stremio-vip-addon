# BRIEFING — 2026-08-17T08:25:30Z

## Mission
Survey HLS proxy implementation in `stremio-nguonc-addon`, specifically `src/routes/hls.js`, server setup, playlist rewriting, segment streaming, upstream headers, CDN domain handling, CORS, and MIME types.

## 🔒 My Identity
- Archetype: explorer
- Roles: investigation, synthesis
- Working directory: /Users/quan/.gemini/antigravity/scratch/stremio-nguonc-addon/.agents/explorer_survey_2
- Original parent: 5dfdd9a6-b83e-4a88-88a8-6cfe6611dc5c
- Milestone: initial_project_survey

## 🔒 Key Constraints
- Read-only investigation — do NOT implement
- Communicate via send_message to parent (id: 5dfdd9a6-b83e-4a88-88a8-6cfe6611dc5c)
- Write artifacts only to /Users/quan/.gemini/antigravity/scratch/stremio-nguonc-addon/.agents/explorer_survey_2

## Current Parent
- Conversation ID: 5dfdd9a6-b83e-4a88-88a8-6cfe6611dc5c
- Updated: 2026-08-17T08:25:30Z

## Investigation State
- **Explored paths**:
  - `src/index.js` — Server initialization, middleware, routing setup
  - `src/routes/hls.js` — HLS proxy endpoints (`/extract`, `/manifest.m3u8`, `/ts`), playlist rewriter, segment pipe, header resolution
  - `src/providers/kkphim.js` — KKPhim stream formatting, URL generation, episode matching
  - `src/providers/nguonc.js` & `src/providers/vsmov.js` — Provider stream generation
  - `src/handlers.js` — Stream aggregator, provider execution, protocol sanitization
  - `src/mapper.js` — Embed HTML extractor, regex patterns, base64 helpers
  - `tests/e2e.test.js`, `tests/helpers.js`, `tests/fixtures.js` — Test framework and fixtures
- **Key findings**:
  1. HLS Proxy successfully handles master/sub-playlist rewriting and TS segment streaming with `video/mp2t` MIME override.
  2. Live CDNs for KKPhim include `v7.kkphimplayer7.com`, `s1.phim1280.tv`, and `s1.phimapi.com`.
  3. `SOURCE_REFERERS` in `src/routes/hls.js` lacks comprehensive matching for `kkphimplayer` and `phim1280` domains, and maps `phimapi.com` to `https://phimapi.com/` instead of `https://player.phimapi.com/`.
  4. `src/providers/kkphim.js` uses `baseRef = 'https://phimapi.com/'` instead of `'https://player.phimapi.com/'` and still generates `externalUrl` fallback streams.
  5. Tested cuu-mon and tan-thuoc playback end-to-end; verified 100% working stream extraction, master/media playlist rewriting, and 200 OK MPEG-TS segment delivery with sync byte 0x47.
- **Unexplored areas**: None for survey scope.

## Key Decisions Made
- Validated empirical playback of real KKPhim streams using `BypassSandbox: true`.
- Documented complete architecture and exact delta needed for R1, R2, R3, R4.

## Artifact Index
- DISPATCH.md — Dispatch log
- BRIEFING.md — Context memory
- progress.md — Heartbeat and status
- handoff.md — Comprehensive Handoff Report
