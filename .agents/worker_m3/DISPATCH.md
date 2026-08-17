## 2026-08-17T08:52:02Z

You are Worker for Milestone 3: E2E Stream Playback Test & Self-Debug Loop.
Working directory: /Users/quan/.gemini/antigravity/scratch/stremio-nguonc-addon/.agents/worker_m3

Read:
- /Users/quan/.gemini/antigravity/scratch/stremio-nguonc-addon/.agents/ORIGINAL_REQUEST.md
- /Users/quan/.gemini/antigravity/scratch/stremio-nguonc-addon/PROJECT.md
- /Users/quan/.gemini/antigravity/scratch/stremio-nguonc-addon/.agents/explorer_m3_1/handoff.md
- /Users/quan/.gemini/antigravity/scratch/stremio-nguonc-addon/.agents/explorer_m3_2/handoff.md
- /Users/quan/.gemini/antigravity/scratch/stremio-nguonc-addon/.agents/explorer_m3_3/handoff.md
- /Users/quan/.gemini/antigravity/scratch/stremio-nguonc-addon/src/routes/hls.js
- /Users/quan/.gemini/antigravity/scratch/stremio-nguonc-addon/src/providers/kkphim.js
- /Users/quan/.gemini/antigravity/scratch/stremio-nguonc-addon/src/handlers.js

Your Task:
1. Implement `tests/test_kkphim_playback.js` to fulfill all requirements in ORIGINAL_REQUEST.md §R3 and PROJECT.md Milestone 3:
   - Start local addon server on an ephemeral port (`app.listen(0, '127.0.0.1')`).
   - Test Case 1 (Stream Generation): Fetch streams for test slug `cuu-mon` (or fallback active slug if needed), verify `[VIP • KKPhim]` stream with `name === 'VIP Movies 🎬'`, in-app title branding `[VIP • KKPhim] ... Full HD (HLS Proxy)\n⚡ Server VIP • Phát trực tiếp trong App`, `url` pointing to local proxy `${proxyBase}/hls/manifest.m3u8...`, and strictly NO `externalUrl`.
   - Test Case 2 (Manifest Proxy Verification): GET the proxy manifest URL, verify HTTP 200, Content-Type `application/vnd.apple.mpegurl`, CORS `Access-Control-Allow-Origin: *`, `#EXTM3U` tag, and recursively resolve Master/Media playlists to find rewritten `.ts` segment link (`${proxyBase}/hls/ts?...`).
   - Test Case 3 (Segment Playback Verification): GET rewritten `.ts` video segment through proxy, verify HTTP 200 (no 403 Forbidden / 500), CORS `Access-Control-Allow-Origin: *`, Content-Type `video/mp2t`, valid binary video buffer (> 100KB / > 50KB), and MPEG-TS sync byte `0x47` at offset 0.
   - Self-Debug Mandate: If any test case fails, analyze error logs, fix `src/routes/hls.js` or `src/providers/kkphim.js` if necessary, and re-run until all 3 pass 100%.
   - Ephemeral server cleanup in `finally` block, exiting with code 0 on success, 1 on failure.

2. Run and verify the implementation:
   - `node --check tests/test_kkphim_playback.js`
   - `node tests/test_kkphim_playback.js`
   - Run any other test files if appropriate (`node tests/e2e.test.js`, etc.)

3. MANDATORY INTEGRITY WARNING:
DO NOT CHEAT. All implementations must be genuine. DO NOT hardcode test results, create dummy/facade implementations, or circumvent the intended task. A teamwork_preview_auditor will independently verify your work. Integrity violations WILL be detected and your work WILL be rejected.

4. Write your handoff report to `/Users/quan/.gemini/antigravity/scratch/stremio-nguonc-addon/.agents/worker_m3/handoff.md`
Send a message to parent when done.
