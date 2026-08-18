## 2026-08-18T03:38:14Z
<USER_REQUEST>
You are a Worker agent implementing Milestone 1: VSMOV WebVTT/SRT Subtitle Injection & HLS Proxying for Hotfix v1.5.2.
Your working directory is: /Users/quan/.gemini/antigravity/scratch/stremio-nguonc-addon/.agents/teamwork_preview_worker_m1_1

Read the following files:
- `/Users/quan/.gemini/antigravity/scratch/stremio-nguonc-addon/.agents/ORIGINAL_REQUEST.md`
- `/Users/quan/.gemini/antigravity/scratch/stremio-nguonc-addon/.agents/explorer_survey_vsmov/survey_report.md`
- `/Users/quan/.gemini/antigravity/scratch/stremio-nguonc-addon/.agents/teamwork_preview_orchestrator_1/PROJECT.md`

MANDATORY INTEGRITY WARNING:
DO NOT CHEAT. All implementations must be genuine. DO NOT hardcode test results, create dummy/facade implementations, or circumvent the intended task. A teamwork_preview_auditor will independently verify your work. Integrity violations WILL be detected and your work WILL be rejected.

File Ownership: You exclusively own and modify:
- `src/providers/vsmov.js`
- `src/routes/hls.js`

Your tasks:
1. In `src/providers/vsmov.js`:
   - Extract subtitle links (.vtt / .srt) from VSMOV media data in `resolveEmbedMedia()` or API payload.
   - In `getStreams()`, attach `subtitles: [{ id: "vi_vsmov", lang: "vie", url: proxySubUrl, title: "Tiếng Việt (VSMOV VIP)" }]` to the stream object.
   - Pass the subtitle URL as a parameter (e.g. `&sub=${encodeURIComponent(subUrl)}` or base64) to the master M3U8 proxy URL.
2. In `src/routes/hls.js`:
   - Implement/ensure `/hls/sub.vtt` endpoint proxies subtitles with headers: `Content-Type: text/vtt; charset=utf-8`, `Access-Control-Allow-Origin: *`, `Cache-Control: public, max-age=86400`.
   - If the upstream subtitle is SRT (or contains comma timestamps `00:00:00,000`), convert it automatically to valid WebVTT format (replace `,` with `.`, ensure `WEBVTT` header at line 1, strip UTF-8 BOM `\uFEFF`, normalize CRLF).
   - In Master M3U8 handler (`/hls/manifest.m3u8`), check for `sub` query param. When present, inject `#EXT-X-MEDIA:TYPE=SUBTITLES,GROUP-ID="subs",NAME="Tiếng Việt",DEFAULT=YES,AUTOSELECT=YES,FORCED=NO,LANGUAGE="vie",URI="<subProxyUrl>"` at the top of Master M3U8 and append `SUBTITLES="subs"` to `#EXT-X-STREAM-INF` tags. Ensure cache key incorporates `sub`.
3. Verification:
   - Run `node --check src/providers/vsmov.js` and `node --check src/routes/hls.js`.
   - Run existing tests to verify no regressions (`npm test` or `tests/verify_playback.js`).
4. Write your changes summary and test results to `/Users/quan/.gemini/antigravity/scratch/stremio-nguonc-addon/.agents/teamwork_preview_worker_m1_1/handoff.md`.

When complete, send a message to parent summarizing your work.
</USER_REQUEST>
