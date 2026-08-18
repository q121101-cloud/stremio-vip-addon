## 2026-08-18T01:37:36Z
You are teamwork_preview_worker_m1_1.
Your working directory is: /Users/quan/.gemini/antigravity/scratch/stremio-nguonc-addon/.agents/teamwork_preview_worker_m1_1
Original User Request file: /Users/quan/.gemini/antigravity/scratch/stremio-nguonc-addon/.agents/ORIGINAL_REQUEST.md
Project specification: /Users/quan/.gemini/antigravity/scratch/stremio-nguonc-addon/PROJECT.md

Read /Users/quan/.gemini/antigravity/scratch/stremio-nguonc-addon/.agents/ORIGINAL_REQUEST.md and /Users/quan/.gemini/antigravity/scratch/stremio-nguonc-addon/PROJECT.md.

MANDATORY INTEGRITY WARNING:
DO NOT CHEAT. All implementations must be genuine. DO NOT hardcode test results, create dummy/facade implementations, or circumvent the intended task. A teamwork_preview_auditor will independently verify your work. Integrity violations WILL be detected and your work WILL be rejected.

Milestone 1 Scope & File Ownership:
- You exclusively own:
  1. `src/routes/hls.js`
  2. `src/handlers.js` (preserve `subtitles` in sanitized stream objects in `handleStream`)

Requirements to implement:
1. In `src/routes/hls.js`:
   - Implement `GET /sub.vtt` (and alias `/sub` if appropriate):
     - Extract `url` (or `b64`, `sub`) and `ref` (or `referer`) using `resolveParamUrl(req.query.url)` and `resolveParamUrl(req.query.ref)`.
     - If URL is missing, return HTTP 400 `Invalid or missing subtitle url`.
     - Fetch upstream subtitle with headers:
       `Referer: refParam || 'https://vsmov.com/'`, `Origin: 'https://vsmov.com'`, `User-Agent: HLS_UA`.
     - Handle response:
       - If upstream status >= 400, return error.
       - Clean / convert content: strip BOM (`\uFEFF`), normalize CRLF to LF.
       - If content is SRT format (does not start with `WEBVTT`), convert SRT to WebVTT:
         - Replace timestamp format `00:00:00,000` with `00:00:00.000` (`/(\d{2}:\d{2}:\d{2}),(\d{3})/g, '$1.$2'`).
         - Ensure leading `WEBVTT\n\n`.
       - Set response headers:
         - `Content-Type: text/vtt; charset=utf-8`
         - `Access-Control-Allow-Origin: *`
         - `Cache-Control: public, max-age=86400`
       - Send the WebVTT content.
   - Ensure route aliases `['/manifest.m3u8', '/m3u8', '/m3u8-proxy']` and `['/segment.ts', '/ts', '/segment', '/ts-proxy']` are present.
2. In `src/handlers.js`:
   - In `handleStream`, ensure `sanitized.subtitles = item.subtitles` is preserved when `item.subtitles` is an array so subtitle tracks are passed to Stremio clients.
   - Maintain strict In-App stream protocol: `sanitized.url = item.url`, `delete sanitized.externalUrl`.

Verification commands:
- `node --check src/routes/hls.js`
- `node --check src/handlers.js`
- `node --check src/index.js`
- `npm test`

Write your implementation report to `/Users/quan/.gemini/antigravity/scratch/stremio-nguonc-addon/.agents/teamwork_preview_worker_m1_1/handoff.md` and send a message to parent when completed.
