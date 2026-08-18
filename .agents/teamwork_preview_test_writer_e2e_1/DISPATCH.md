## 2026-08-18T03:38:14Z

<USER_REQUEST>
You are a Test Writer agent building the E2E Hotfix verification test suite for Stremio VIP Movies Addon Hotfix v1.5.2.
Your working directory is: /Users/quan/.gemini/antigravity/scratch/stremio-nguonc-addon/.agents/teamwork_preview_test_writer_e2e_1

Read the following requirement documents:
- `/Users/quan/.gemini/antigravity/scratch/stremio-nguonc-addon/.agents/ORIGINAL_REQUEST.md`
- `/Users/quan/.gemini/antigravity/scratch/stremio-nguonc-addon/.agents/explorer_survey_e2e_deploy/survey_report.md`
- `/Users/quan/.gemini/antigravity/scratch/stremio-nguonc-addon/.agents/teamwork_preview_orchestrator_1/PROJECT.md`

Your tasks:
1. Create `tests/verify_hotfix_vsmov_kkphim.js` containing comprehensive automated tests for the 3 required cases:
   - **Case 1 (Avengers 3 - `tt5095030`)**:
     - VSMOV stream contains a valid `subtitles` array with `{ id: "vi_vsmov", lang: "vie", url: ..., title: "Tiếng Việt (VSMOV VIP)" }`.
     - Requesting the `/hls/sub.vtt` endpoint returns HTTP 200, `Content-Type: text/vtt; charset=utf-8`, `Access-Control-Allow-Origin: *`, `Cache-Control: public, max-age=86400`, and response body starts with `WEBVTT`.
     - KKPhim falls back to search and returns a valid M3U8 stream (HTTP 200, `#EXTM3U`, not 404).
   - **Case 2 (KKPhim TV series Episode 1 - `tt0903747:1:1` or `tt0944947:1:1`)**:
     - Accurately matches Episode 1 M3U8 stream via `/hls/manifest.m3u8` returning HTTP 200 and `#EXTM3U` header.
   - **Case 3 (Real TS segment download)**:
     - Downloads an actual `.ts` segment chunk (>50KB) via `/hls/segment.ts` (or direct/proxied TS segment).
     - Confirms HTTP 200/206 status, payload size > 50KB, and MPEG-TS sync byte `0x47` (`buffer[0] === 0x47`).
   - Implement ephemeral server startup on port `0` and guaranteed clean server teardown in `finally` blocks.
   - Print clear structured test progress and exit with code 0 on pass, non-zero on failure.
2. Create `TEST_INFRA.md` and `TEST_READY.md` in the project root documenting the test suite, test commands, tiers, and verification criteria.
3. Test your script by running `node tests/verify_hotfix_vsmov_kkphim.js` (note: implementation may still be in progress, so document initial baseline run).
4. Write your handoff report to `/Users/quan/.gemini/antigravity/scratch/stremio-nguonc-addon/.agents/teamwork_preview_test_writer_e2e_1/handoff.md`.

When complete, send a message to parent summarizing what was created.
</USER_REQUEST>
