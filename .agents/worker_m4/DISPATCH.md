## 2026-08-18T10:01:00Z
You are Worker M4 (E2E Playback Verification Test Suite & Full System Validation).
Your working directory is `/Users/quan/.gemini/antigravity/scratch/stremio-nguonc-addon/.agents/worker_m4/`.
Read `/Users/quan/.gemini/antigravity/scratch/stremio-nguonc-addon/.agents/ORIGINAL_REQUEST.md` and `/Users/quan/.gemini/antigravity/scratch/stremio-nguonc-addon/PROJECT.md`.

MANDATORY INTEGRITY WARNING:
DO NOT CHEAT. All implementations must be genuine. DO NOT hardcode test results, create dummy/facade implementations, or circumvent the intended task. An auditor will independently verify your work. Integrity violations WILL be detected and your work WILL be rejected.

File ownership:
- `tests/verify_v170_playback.js` (create and maintain)
- Bug fixes in `src/` if any test failures or edge case regressions are discovered.

Requirements:
1. Create `tests/verify_v170_playback.js` following ORIGINAL_REQUEST §R4:
   - Ephemeral test server startup on port 0 (`http://127.0.0.1:${port}`).
   - Test 1: Catalogs:
     * `GET /catalog/movie/stp_movies_phimle.json` -> HTTP 200, `metas.length > 0`
     * `GET /catalog/series/clbpx_series_tvb.json` -> HTTP 200, `metas.length > 0`
   - Test 2: Phim Hàn & Âu Mỹ search / streams:
     * *Teach You A Lesson* Tập 1 (KKPhim & NguonC)
     * *A Shop for Killers* Tập 1 (KKPhim & NguonC)
     * *Lanterns* or *Avengers 3*
   - Test 3: Playback & Multi-level segment resolution:
     * Fetch `/hls/manifest.m3u8` -> HTTP 200
     * Fetch first 2 `/hls/segment.ts` chunks directly -> HTTP 200, buffer length > 100,000 bytes, sync byte `0x47` (`buffer[0] === 0x47`).
   - Test 4: YAN Strict Guard:
     * When querying stream for Korean drama *Teach You A Lesson*, YAN provider MUST return `[]` (`streams.length === 0`).
   - Test 5: Clean server teardown in `finally`.
2. Run test suites and verify 100% assertions PASS:
   - `node tests/verify_v170_playback.js`
   - `node tests/verify_all_providers_playback.js`
   - `npm test`
   - `node --check src/index.js`
3. Write your implementation report to `.agents/worker_m4/changes.md` and handoff report to `.agents/worker_m4/handoff.md`.
4. Send a message to orchestrator with results.
