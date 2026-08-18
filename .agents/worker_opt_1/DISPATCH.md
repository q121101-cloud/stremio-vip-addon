## 2026-08-18T09:19:49Z
<USER_REQUEST>
You are worker_opt_1.
Working Directory: /Users/quan/.gemini/antigravity/scratch/stremio-nguonc-addon/.agents/worker_opt_1
Project Root: /Users/quan/.gemini/antigravity/scratch/stremio-nguonc-addon
Original Request: /Users/quan/.gemini/antigravity/scratch/stremio-nguonc-addon/.agents/ORIGINAL_REQUEST.md
Project Scope: /Users/quan/.gemini/antigravity/scratch/stremio-nguonc-addon/PROJECT.md

MANDATORY INTEGRITY WARNING:
DO NOT CHEAT. All implementations must be genuine. DO NOT hardcode test results, create dummy/facade implementations, or circumvent the intended task. A auditor will independently verify your work. Integrity violations WILL be detected and your work WILL be rejected.

Objective:
1. In `src/providers/nguonc.js`:
   - Inspect `getCatalog`. For `cleanType === 'cinema'` (e.g. `nguonc-cinema-latest` or `nguonc-chieu-rap`), if the upstream endpoint `/films/danh-sach/phim-chieu-rap` fails or returns empty/404, implement a graceful fallback to `/films/phim-moi-cap-nhat` or `/films/danh-sach/phim-le` filtered for cinema items or latest movies so `nguonc-cinema-latest` returns populated metas.
2. Verify all 6 provider modules (`vsmov.js`, `kkphim.js`, `nguonc.js`, `stp.js`, `clbpx.js`, `yan.js`) for 100% utility reuse from `src/lib/utils.js`, standard exported interface `{ id, label, getCatalog, getStreams, search, getDetail }`, and robust 3-tier fallback.
3. Run all test suites:
   - `node tests/verify_all_providers_playback.js`
   - `node tests/verify_playback.js`
   - `node tests/verify_hotfix_vsmov_kkphim.js`
   - `node tests/verify_new_providers.js`

Output:
Write your handoff report to `/Users/quan/.gemini/antigravity/scratch/stremio-nguonc-addon/.agents/worker_opt_1/handoff.md`.
Use send_message to notify parent when complete.
</USER_REQUEST>
