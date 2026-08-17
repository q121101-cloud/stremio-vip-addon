## 2026-08-17T15:38:50+07:00

<USER_REQUEST>
You are Worker 2 implementing Milestone 2: HLS Proxy Anti-403 Optimization.
Your working directory is: /Users/quan/.gemini/antigravity/scratch/stremio-nguonc-addon/.agents/worker_m2
The original user request is at: /Users/quan/.gemini/antigravity/scratch/stremio-nguonc-addon/.agents/ORIGINAL_REQUEST.md
The project plan is at: /Users/quan/.gemini/antigravity/scratch/stremio-nguonc-addon/PROJECT.md
The project root is: /Users/quan/.gemini/antigravity/scratch/stremio-nguonc-addon

MANDATORY INTEGRITY WARNING:
DO NOT CHEAT. All implementations must be genuine. DO NOT hardcode test results, create dummy/facade implementations, or circumvent the intended task. A teamwork_preview_auditor will independently verify your work. Integrity violations WILL be detected and your work WILL be rejected.

File Ownership: You exclusively own `src/routes/hls.js`. Do not modify other files in this milestone.

Requirements:
1. Read ORIGINAL_REQUEST.md and PROJECT.md.
2. In `src/routes/hls.js`:
   - Set `HLS_UA` to: `'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36'`
   - Update `SOURCE_REFERERS` to include anti-403 CDN rules for KKPhim and upstream CDNs (`*.kkphimplayer*.com`, `*.phim1280.tv`, `*.phimapi.com`, `phimapi.com`, `kkphim`):
     - `referer: 'https://player.phimapi.com/'`
     - `origin: 'https://player.phimapi.com'`
   - Ensure dynamic `ref` parameter passed from provider is prioritized and respected.
   - Ensure all sub-playlists and `.ts` / media segments under `#EXTINF`, `#EXT-X-STREAM-INF`, `#EXT-X-MEDIA`, `#EXT-X-KEY`, `#EXT-X-MAP` are correctly rewritten to route through `/hls/manifest.m3u8` and `/hls/ts`.
   - Enforce CORS headers (`Access-Control-Allow-Origin: *`, `Access-Control-Allow-Headers: *`, `Access-Control-Allow-Methods: GET, HEAD, OPTIONS`) and MIME types (`application/vnd.apple.mpegurl` for playlists, `video/mp2t` for media segments, `application/octet-stream` for encryption keys).
3. Verify syntax with `node --check src/routes/hls.js` and run existing tests (`node tests/e2e.test.js`).
4. Write handoff report to `/Users/quan/.gemini/antigravity/scratch/stremio-nguonc-addon/.agents/worker_m2/handoff.md`.
5. Send a completion message when done.
</USER_REQUEST>
