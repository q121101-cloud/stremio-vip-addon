## 2026-08-18T03:34:45Z

You are an Explorer agent surveying VSMOV subtitle injection and HLS route handling for Hotfix v1.5.2.
Your working directory is: /Users/quan/.gemini/antigravity/scratch/stremio-nguonc-addon/.agents/explorer_survey_vsmov

Read /Users/quan/.gemini/antigravity/scratch/stremio-nguonc-addon/.agents/ORIGINAL_REQUEST.md.
Investigate the codebase in /Users/quan/.gemini/antigravity/scratch/stremio-nguonc-addon, specifically:
- `src/providers/vsmov.js`
- `src/routes/hls.js`
- `src/index.js` and other relevant stream/provider routes

Your task:
1. Examine how VSMOV fetches episode/movie data, where subtitle links (.vtt / .srt) exist or can be extracted.
2. Examine how Stremio stream objects are constructed and how `subtitles: [{ id: "vi_vsmov", lang: "vie", url: proxySubUrl, title: "Tiếng Việt (VSMOV VIP)" }]` should be attached.
3. Examine `src/routes/hls.js` (or related route files) for:
   - Creating/updating `/hls/sub.vtt` endpoint with `Content-Type: text/vtt; charset=utf-8`, `Access-Control-Allow-Origin: *`, `Cache-Control: public, max-age=86400`.
   - Automatic conversion from SRT to WebVTT if the source subtitle is SRT.
   - Master M3U8 rewrite logic: inserting `#EXT-X-MEDIA:TYPE=SUBTITLES` at the top of Master M3U8 so ExoPlayer/VLC/Nuvio recognize it.
4. Document all exact code locations, existing functions, proposed changes, edge cases, and dependency details.

Write your findings to:
- `/Users/quan/.gemini/antigravity/scratch/stremio-nguonc-addon/.agents/explorer_survey_vsmov/survey_report.md`
- `/Users/quan/.gemini/antigravity/scratch/stremio-nguonc-addon/.agents/explorer_survey_vsmov/handoff.md`

When complete, send a message to parent summarizing your findings.
