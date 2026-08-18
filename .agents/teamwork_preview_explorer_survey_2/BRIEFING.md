# BRIEFING — 2026-08-18T01:36:45Z

## Mission
Investigate HLS routes and proxying in `src/routes/hls.js`, `src/index.js`, and related files for Hotfix v1.5.1 subtitle proxy and stream separation.

## 🔒 My Identity
- Archetype: explorer
- Roles: investigation, survey
- Working directory: /Users/quan/.gemini/antigravity/scratch/stremio-nguonc-addon/.agents/teamwork_preview_explorer_survey_2
- Original parent: cbf03e27-0cd9-44c3-b074-91f636153881
- Milestone: Survey 2 - HLS & Subtitle Proxy Architecture

## 🔒 Key Constraints
- Read-only investigation — do NOT implement
- Analyze existing routes in `src/routes/hls.js` (`/extract`, `/manifest.m3u8`, `/segment.ts`, `/key`)
- Analyze requirements for `GET /hls/sub.vtt` endpoint (parameters, headers, SRT->WebVTT conversion)
- Trace `proxyBase` construction and propagation across handlers and providers

## Current Parent
- Conversation ID: cbf03e27-0cd9-44c3-b074-91f636153881
- Updated: 2026-08-18T01:36:45Z

## Investigation State
- **Explored paths**:
  - `src/routes/hls.js`: Inspected router structure, CORS handling, regex rewriting for M3U8 variants/segments/keys/maps/parts, segment proxying with Range 206, key proxying.
  - `src/index.js`: Inspected Express setup, middleware ordering, mount points (`/hls`, `/`, handlers).
  - `src/handlers.js`: Inspected stream aggregation, Cinemeta lookup, `proxyBase` extraction from `x-forwarded-*` or `protocol/host`, stream sorting & deduplication.
  - `src/providers/vsmov.js`: Inspected VSMOV API, player HTML structure, embed parsing, server data, stream formatting.
  - `src/mapper.js`: Inspected NguonC embed extractor and stream builder.
  - `tests/*`: Inspected existing test suites (`test.js`, `test_all.js`, `tests/hls_challenger_empirical.test.js`).
  - Live VSMOV API & Embed probing: Tested `https://vsmov.com/api/tim-kiem`, `https://vsmov.com/api/phim/*`, and `https://v5.streamvsmov.com/video/*` for subtitle extraction and server tabs.
- **Key findings**:
  - Existing HLS routes in `src/routes/hls.js` are `/extract`, `['/manifest.m3u8', '/m3u8']`, `['/segment.ts', '/ts', '/segment']`, and `['/key', '/key.key']`.
  - VSMOV provides distinct server tabs (`Vietsub`, `Lồng tiếng`, `Thuyết minh`) and embeds contain playerOptions with WebVTT subtitles in `subtitles: [...]`.
  - `GET /hls/sub.vtt` requires fetching upstream subtitle files with anti-403 headers (`Referer: https://vsmov.com/`, `Origin: https://vsmov.com`, `User-Agent: HLS_UA`), returning CORS `*`, `Content-Type: text/vtt; charset=utf-8`, `Cache-Control: public, max-age=86400`, and converting SRT timestamps/headers to WebVTT format when necessary.
  - `proxyBase` is constructed dynamically in `handleStream` via `${proto}://${host}` and passed down to each provider via `payload.proxyBase`.
- **Unexplored areas**: None for this survey scope.

## Key Decisions Made
- Fully documented the HLS route architecture, subtitle proxy requirements, SRT->WebVTT parser algorithm, and proxyBase lifecycle.

## Artifact Index
- `/Users/quan/.gemini/antigravity/scratch/stremio-nguonc-addon/.agents/teamwork_preview_explorer_survey_2/analysis.md` — Detailed technical analysis report
- `/Users/quan/.gemini/antigravity/scratch/stremio-nguonc-addon/.agents/teamwork_preview_explorer_survey_2/handoff.md` — 5-component handoff report
