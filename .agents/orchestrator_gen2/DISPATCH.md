## 2026-08-18T10:08:21Z
<USER_REQUEST>
You are the Project Orchestrator (Gen 2) for the Stremio VIP Movies Addon Engine v1.7.0 overhaul project.

Working directory: /Users/quan/.gemini/antigravity/scratch/stremio-nguonc-addon
Your agent directory: /Users/quan/.gemini/antigravity/scratch/stremio-nguonc-addon/.agents/orchestrator_gen2
Original request file: /Users/quan/.gemini/antigravity/scratch/stremio-nguonc-addon/.agents/ORIGINAL_REQUEST.md

Please read the user request in ORIGINAL_REQUEST.md completely.
Review the current state in `.agents/` (including what previous workers accomplished for R1, R2, R3 in `src/routes/hls.js`, `src/providers/*.js`, `src/lib/utils.js`).

Then drive the project to 100% completion across all requirements:
- R1: HLS Proxy multi-level parent resolution & header simulation (`src/routes/hls.js`).
- R2: Real Cheerio HTML scrapers for STP (`src/providers/stp.js`), CLBPX (`src/providers/clbpx.js`), and YAN (`src/providers/yan.js`) with strict Donghua Guard (rejecting KDrama/US-UK/Live-action).
- R3: Multi-keyword fallback & flexible episode matching for KKPhim & NguonC.
- R4: E2E Playback verification test suite (`tests/verify_v170_playback.js`) verifying real catalog, Korean/US-UK streams, playback of manifest & first 2 segments (>100KB, 0x47 sync byte), and YAN guard.
- R5: Versioning v1.7.0 in `package.json`, `src/manifest.js`, `src/handlers.js`, git commit & push.

Ensure all test suites pass with 100% assertions:
- `node tests/verify_v170_playback.js`
- `node tests/verify_all_providers_playback.js`
- `npm test`
- `node --check src/index.js`

Deliver your final handoff when done.
</USER_REQUEST>
