## 2026-08-18T03:22:47+07:00
You are the Milestone 4 Worker for Fail-Safe Stream Aggregator & Metadata Resolution.
Your working directory is: /Users/quan/.gemini/antigravity/scratch/stremio-nguonc-addon/.agents/worker_m4_stream_aggregator

Read ORIGINAL_REQUEST.md at /Users/quan/.gemini/antigravity/scratch/stremio-nguonc-addon/ORIGINAL_REQUEST.md and PROJECT.md at /Users/quan/.gemini/antigravity/scratch/stremio-nguonc-addon/.agents/orchestrator/PROJECT.md.

MANDATORY INTEGRITY WARNING:
DO NOT CHEAT. All implementations must be genuine. DO NOT hardcode test results, create dummy/facade implementations, or circumvent the intended task. A teamwork_preview_auditor will independently verify your work. Integrity violations WILL be detected and your work WILL be rejected.

Your task (Requirement R5):
1. **Cinemeta Metadata Resolution** (`src/lib/cinemeta.js` & `src/handlers.js`):
   - Resolve IMDb IDs (`tt...`) into title, year, season, episode, and alias/Vietnamese titles.
   - Cache results in a 24-hour LRU cache (`src/lib/cache.js`).
   - If Cinemeta lookup fails or times out, degrade gracefully to parsing ID or fallback without crashing.

2. **Fail-Safe Stream Aggregator** (`src/handlers.js`):
   - Fan out parallel stream requests to all enabled providers (`vsmov`, `kkphim`, `nguonc`, `stp`, `hh3d`, `yan`, `clbpx`).
   - Wrap each provider call with a strict **4000ms timeout** (e.g. `Promise.race` with timer or timeout wrapper) and `Promise.allSettled` so that any slow, errored, or timed-out provider fails silently and never blocks or aborts the remaining providers.
   - Aggregate streams in priority order: VSMOV (VIP 1) -> KKPhim (VIP 2) -> NguonC (VIP 3) -> STP -> HH3D -> YAN -> CLBPX.
   - Deduplicate streams by URL or normalized server name.
   - Strict Protocol & In-App Exclusivity: Ensure all stream objects have `{ name: 'VIP Movies 🎬', title: string, url: string }` and ZERO `externalUrl`.
   - 404/500 Prevention: If 0 streams are found or all providers fail, return HTTP 200 with `{ streams: [] }`.

Write ownership:
- `src/handlers.js`
- `src/lib/cinemeta.js`
- `src/lib/cache.js`

Verification:
- Run tests:
  - `npm test`
  - `node tests/e2e.test.js`
  - `node tests/verify_playback.js`
  - Any aggregator / concurrency / timeout test scripts in `tests/`
- Verify that simulated slow providers (4000ms+) do not delay the overall response beyond the timeout and do not crash the aggregator.

Deliver handoff.md in `/Users/quan/.gemini/antigravity/scratch/stremio-nguonc-addon/.agents/worker_m4_stream_aggregator/handoff.md` and send a message back when completed.
