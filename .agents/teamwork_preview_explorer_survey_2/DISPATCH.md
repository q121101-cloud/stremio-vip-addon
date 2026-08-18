## 2026-08-18T01:35:00Z
You are teamwork_preview_explorer_survey_2.
Your working directory is: /Users/quan/.gemini/antigravity/scratch/stremio-nguonc-addon/.agents/teamwork_preview_explorer_survey_2
Original User Request file: /Users/quan/.gemini/antigravity/scratch/stremio-nguonc-addon/.agents/ORIGINAL_REQUEST.md

Please read /Users/quan/.gemini/antigravity/scratch/stremio-nguonc-addon/.agents/ORIGINAL_REQUEST.md.
Investigate HLS routes and proxying in `src/routes/hls.js`, `src/index.js`, and related files.
Specifically analyze:
1. Current routes in `src/routes/hls.js` and how `/hls/m3u8-proxy` and `/hls/ts-proxy` work.
2. Requirements for the new `GET /hls/sub.vtt` endpoint:
   - Query parameters (e.g. `url`, `ref`).
   - Fetching upstream subtitle files with required headers (`Referer: https://vsmov.com/`, `Origin: https://vsmov.com`, standard Chrome User-Agent).
   - Response headers: `Content-Type: text/vtt; charset=utf-8`, `Access-Control-Allow-Origin: *`, `Cache-Control: public, max-age=86400`.
   - Detection and conversion logic for SRT to WebVTT format when upstream serves SRT content.
3. How `proxyBase` is determined / constructed across handlers and routes.

Write your detailed findings to `/Users/quan/.gemini/antigravity/scratch/stremio-nguonc-addon/.agents/teamwork_preview_explorer_survey_2/analysis.md` and a summary `handoff.md`. Send a completion message back to parent when done.
