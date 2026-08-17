# BRIEFING — 2026-08-17T15:44:00+07:00

## Mission
Implement Milestone 2: HLS Proxy Anti-403 Optimization in `src/routes/hls.js`.

## 🔒 My Identity
- Archetype: worker
- Roles: implementer, qa, specialist
- Working directory: /Users/quan/.gemini/antigravity/scratch/stremio-nguonc-addon/.agents/worker_m2
- Original parent: 5dfdd9a6-b83e-4a88-88a8-6cfe6611dc5c
- Milestone: Milestone 2 (HLS Proxy Anti-403 Optimization)

## 🔒 Key Constraints
- File Ownership: Exclusively own `src/routes/hls.js`. Do not modify other files in this milestone.
- DO NOT CHEAT. Genuine implementations only. Real state and behavior.
- Set HLS_UA to Chrome 126 Mac OS X (`Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36`).
- Update SOURCE_REFERERS to include anti-403 rules for KKPhim and upstream CDNs (`*.kkphimplayer*.com`, `*.phim1280.tv`, `*.phimapi.com`, `phimapi.com`, `kkphim`).
- Ensure dynamic `ref` param passed from provider is prioritized and respected.
- Ensure all sub-playlists and `.ts` / media segments under `#EXTINF`, `#EXT-X-STREAM-INF`, `#EXT-X-MEDIA`, `#EXT-X-KEY`, `#EXT-X-MAP` are correctly rewritten to route through `/hls/manifest.m3u8` and `/hls/ts`.
- Enforce CORS headers and MIME types (`application/vnd.apple.mpegurl`, `video/mp2t`, `application/octet-stream`).

## Current Parent
- Conversation ID: 5dfdd9a6-b83e-4a88-88a8-6cfe6611dc5c
- Updated: 2026-08-17T15:44:00+07:00

## Task Summary
- **What to build**: Anti-403 HLS proxy routing and manifest rewriting in `src/routes/hls.js`
- **Success criteria**: Syntax check passes, unit tests pass, full m3u8 tag rewriting and proper headers
- **Interface contracts**: PROJECT.md § Interface Contracts
- **Code layout**: `src/routes/hls.js`

## Change Tracker
- **Files modified**: `src/routes/hls.js` (Updated HLS_UA, SOURCE_REFERERS, dynamic ref priority, CORS headers, m3u8 tag rewriting for EXT-X-MEDIA / KEY / MAP / PRELOAD-HINT / PART / EXTINF / EXT-X-STREAM-INF)
- **Build status**: `node --check src/routes/hls.js` passed with 0 errors
- **Pending issues**: none

## Quality Status
- **Build/test result**: Pass (syntax validation & E2E/unit verification passed)
- **Lint status**: clean
- **Tests added/modified**: Verified with in-memory HTTP/axios integration tests for manifest rewriting, upstream headers, segment piping, and MIME/CORS enforcement.

## Key Decisions Made
- Prioritized dynamic `ref` query param in `getRefererHeaders` and safely parse origin.
- Supported regex pattern `/kkphimplayer|phim1280|phimapi\.com|kkphim/i` routing to `referer: 'https://player.phimapi.com/'` and `origin: 'https://player.phimapi.com'`.
- Fully mapped `#EXT-X-MEDIA`, `#EXT-X-KEY`, `#EXT-X-SESSION-KEY`, `#EXT-X-MAP`, `#EXT-X-PRELOAD-HINT`, `#EXT-X-PART`, `#EXTINF`, `#EXT-X-STREAM-INF`, and `#EXT-X-I-FRAME-STREAM-INF` to respective `/hls/manifest.m3u8` and `/hls/ts` proxy endpoints with Base64URL encoding.
- Enforced CORS headers and MIME overrides (`application/vnd.apple.mpegurl; charset=utf-8`, `video/mp2t`, `application/octet-stream`).

## Artifact Index
- `.agents/worker_m2/DISPATCH.md` — Dispatch requirements
- `.agents/worker_m2/BRIEFING.md` — Agent state and briefing
- `.agents/worker_m2/progress.md` — Execution progress
- `.agents/worker_m2/handoff.md` — Final handoff report
