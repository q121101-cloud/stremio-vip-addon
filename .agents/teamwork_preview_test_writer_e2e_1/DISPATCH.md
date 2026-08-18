## 2026-08-18T01:37:36Z
You are teamwork_preview_test_writer_e2e_1.
Your working directory is: /Users/quan/.gemini/antigravity/scratch/stremio-nguonc-addon/.agents/teamwork_preview_test_writer_e2e_1
Original User Request file: /Users/quan/.gemini/antigravity/scratch/stremio-nguonc-addon/.agents/ORIGINAL_REQUEST.md
Project specification: /Users/quan/.gemini/antigravity/scratch/stremio-nguonc-addon/PROJECT.md

Read /Users/quan/.gemini/antigravity/scratch/stremio-nguonc-addon/.agents/ORIGINAL_REQUEST.md and /Users/quan/.gemini/antigravity/scratch/stremio-nguonc-addon/PROJECT.md.
You own the E2E Testing Track.

Your tasks:
1. Create `/Users/quan/.gemini/antigravity/scratch/stremio-nguonc-addon/TEST_INFRA.md` at project root documenting test architecture, methodology (Tiers 1-4), and feature coverage inventory.
2. Implement `/Users/quan/.gemini/antigravity/scratch/stremio-nguonc-addon/tests/verify_vsmov_sub_audio.js` using the standalone test framework (`tests/helpers.js` TestRunner or `startTestServer` / ephemeral port `app.listen(0)`).
   Ensure comprehensive coverage across 4 tiers:
   - **Tier 1 (Feature Coverage)**:
     - Boot ephemeral server on port 0.
     - Query stream endpoint for movies (Harry Potter tt0373889).
     - Query subtitle endpoint `/hls/sub.vtt` with valid base64 subtitle url.
     - Validate HTTP 200, `Content-Type: text/vtt; charset=utf-8`, and CORS `*`.
     - Validate `WEBVTT` body header.
   - **Tier 2 (Boundary & Corner Cases)**:
     - Subtitle endpoint with missing query params (returns 400 Bad Request).
     - Subtitle endpoint with invalid/unreachable upstream URL.
     - Subtitle endpoint with SRT upstream content (verifies automatic conversion to WebVTT format with comma->dot timestamps).
     - In-App protocol compliance verification: every stream object strictly has `url` and NO `externalUrl`.
   - **Tier 3 (Cross-Feature Combinations)**:
     - Multi-server extraction: verify stream list contains distinct audio tracks (`Vietsub` and `Lồng Tiếng` / `Thuyết Minh`).
     - Subtitles array structure: verify `subtitles: [{ id: 'vi_vsmov', lang: 'vie', url: ... }]` is attached to applicable streams and preserved through `handleStream`.
     - Exact title formatting checks for each server group.
   - **Tier 4 (Real-World Scenarios)**:
     - Full end-to-end simulation of movie and series stream discovery and subtitle retrieval.
3. Publish `/Users/quan/.gemini/antigravity/scratch/stremio-nguonc-addon/TEST_READY.md` at project root when the test suite script and infrastructure are ready.

Run tests using `node tests/verify_vsmov_sub_audio.js` to verify that your test script is syntactically sound and ready.
Write your handoff report to `/Users/quan/.gemini/antigravity/scratch/stremio-nguonc-addon/.agents/teamwork_preview_test_writer_e2e_1/handoff.md` and send a message to parent when done.
