## 2026-08-18T10:25:51Z
You are the Replacement Implementation Worker for the Stremio VIP Movies Addon Engine v1.7.0 Overhaul.

Working directory: /Users/quan/.gemini/antigravity/scratch/stremio-nguonc-addon
Your agent directory: /Users/quan/.gemini/antigravity/scratch/stremio-nguonc-addon/.agents/teamwork_preview_worker_m1_1
Original request file: /Users/quan/.gemini/antigravity/scratch/stremio-nguonc-addon/.agents/ORIGINAL_REQUEST.md
Scope document: /Users/quan/.gemini/antigravity/scratch/stremio-nguonc-addon/.agents/PROJECT.md

Read ORIGINAL_REQUEST.md and the survey reports from:
- /Users/quan/.gemini/antigravity/scratch/stremio-nguonc-addon/.agents/teamwork_preview_explorer_survey_1/handoff.md
- /Users/quan/.gemini/antigravity/scratch/stremio-nguonc-addon/.agents/teamwork_preview_explorer_survey_2/handoff.md
- /Users/quan/.gemini/antigravity/scratch/stremio-nguonc-addon/.agents/teamwork_preview_explorer_survey_3/handoff.md

MANDATORY INTEGRITY WARNING:
DO NOT CHEAT. All implementations must be genuine. DO NOT hardcode test results, create dummy/facade implementations, or circumvent the intended task. A teamwork_preview_auditor will independently verify your work. Integrity violations WILL be detected and your work WILL be rejected.

Your Tasks:
1. `src/routes/hls.js`:
   - Set User-Agent to Windows Chrome 124:
     `Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36`
   - Include default browser simulation headers in all Axios requests:
     * `User-Agent`: HLS_UA
     * `Accept`: `*/*`
     * `Accept-Language`: `vi,en-US;q=0.9,en;q=0.8`
     * `Connection`: `keep-alive`
   - In `/manifest.m3u8`: Support `responseUrl` on redirects (`const finalUrl = r.request?.res?.responseUrl || effectiveTargetUrl;`) when establishing `baseUrl`.
   - In `/hls/segment.ts`:
     * Set `responseType: 'arraybuffer'`, `maxRedirects: 5`, `timeout: 15000`.
     * Set response headers: `Content-Type: video/MP2T` (or `application/octet-stream` for key), `Access-Control-Allow-Origin: *`, `Cache-Control: public, max-age=3600`.
     * Correctly handle Range requests with buffer slicing and return HTTP 206 with `Content-Range: bytes ${start}-${end}/${buffer.length}` and `Content-Length`.

2. `src/providers/stp.js`:
   - In `parsePostContent` / `getStreams`, filter out dead shortlinks (`bysevepoin.com`, `short.ink`, `short.icu`) when extracting M3U8, or ensure fallback to mirror streams so that M3U8 bodies always contain valid `#EXTM3U` headers.

3. `src/providers/clbpx.js`:
   - In `getStreams`, if the highest-scoring candidate search match returns no stream (`liveStreams.length === 0`), iterate through the remaining candidate matches from `search(title)` (e.g. `thien-long-bat-bo-1997`) instead of failing immediately. Also ensure mirror search fallback so series episodes resolve reliably.

4. `src/index.js`:
   - Update startup banner on line 105:
     `console.log('║      🎬  VIP Movies Stremio Addon  Engine v1.7.0     ║');`
   - Update file header comments to `v1.7.0`.

5. Verification & Testing:
   - Run:
     * `node --check src/index.js`
     * `node --check src/routes/hls.js`
     * `node --check src/providers/stp.js`
     * `node --check src/providers/clbpx.js`
     * `node tests/verify_v170_playback.js` (Must be 100% PASS)
     * `node tests/verify_all_providers_playback.js` (Must be 100% PASS)
     * `npm test` (Must be 50/50 PASS)
   - If any test fails, fix the code and re-test until 100% pass.

6. Handoff:
   Write your handoff report to `/Users/quan/.gemini/antigravity/scratch/stremio-nguonc-addon/.agents/teamwork_preview_worker_m1_1/handoff.md` and send a completion message to parent.
