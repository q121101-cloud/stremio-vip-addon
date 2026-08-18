# Execution Plan: Hotfix v1.5.1

## Objectives
1. **R1: VSMOV Multi-Server Audio Separation & Subtitle Proxy**
   - Extract `Vietsub`, `Lồng Tiếng`, `Thuyết Minh` server groups from VSMOV API/player responses.
   - Distinct titles for each server group.
   - Extract WebVTT/SRT subtitles and proxy via `/hls/sub.vtt`.
   - Implement `GET /hls/sub.vtt` endpoint with SRT->WebVTT conversion, CORS `*`, cache headers.
   - Ensure strict In-App stream format (`url` present, `externalUrl` omitted).
2. **R2: KKPhim 404 Episode-Matching Fix**
   - Flexibly match all episode name formats (`"1"`, `"01"`, `"Tập 1"`, `"-1"`).
   - Ensure CDN referer headers are set to valid player origin (`https://player.phimapi.com/`).
   - Preserve Base64URL security query parameters in m3u8 links.
3. **R3: E2E Playback & Video Segment Verification**
   - Update/create comprehensive verification test (`tests/verify_playback.js` or `tests/verify_vsmov_sub_audio.js`).
   - Validate VSMOV multi-stream separation (Vietsub + Lồng Tiếng/Thuyết Minh).
   - Validate KKPhim series episode stream resolves valid HLS manifest (HTTP 200, no 404).
   - Validate real `.ts` segment download (> 50KB, HTTP 200/206, sync byte 0x47).
   - Validate `/hls/sub.vtt` returns HTTP 200, `text/vtt`, CORS `*`.
4. **R4: Versioning & GitHub Deployment**
   - Bump version to `1.5.1` in `package.json`, `src/manifest.js`, `src/handlers.js` (Cyber-Glassmorphism footer).
   - Verify syntax with `node --check src/index.js`.
   - Commit and push to `origin main`.

## Milestones & Workflow
- **Phase 0: Survey & Codebase Exploration** (3 Explorers in parallel)
  - Explorer 1: VSMOV provider (`src/providers/vsmov.js`) and HLS routes (`src/routes/hls.js`) for subtitle proxy & multi-server handling.
  - Explorer 2: KKPhim provider (`src/providers/kkphim.js`) and episode matching / CDN referer handling.
  - Explorer 3: E2E verification tests (`tests/verify_playback.js`, existing test suite), versioning files (`package.json`, `src/manifest.js`, `src/handlers.js`), and git status.
- **Phase 1: Implementation & Iteration**
  - Worker dispatch for R1 + R2 + R4.
  - Reviewer & Challenger & Auditor dispatch.
- **Phase 2: E2E Verification & Audit**
  - Worker / Test runner executes real live tests & segment download checks.
- **Phase 3: Deployment**
  - Git commit & push.
