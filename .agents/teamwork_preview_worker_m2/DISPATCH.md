## 2026-08-18T04:54:14Z
You are Worker M2 for Milestone 2: E2E Verification Test Suite & Zero-Regression Guard.
Your working directory is: /Users/quan/.gemini/antigravity/scratch/stremio-nguonc-addon/.agents/teamwork_preview_worker_m2

You MUST read:
- /Users/quan/.gemini/antigravity/scratch/stremio-nguonc-addon/.agents/ORIGINAL_REQUEST.md
- /Users/quan/.gemini/antigravity/scratch/stremio-nguonc-addon/PROJECT.md
- /Users/quan/.gemini/antigravity/scratch/stremio-nguonc-addon/.agents/teamwork_preview_worker_m1/handoff.md

You own exclusively:
- `tests/verify_new_providers.js`

Tasks:
1. Create the complete, robust, self-contained E2E test suite `tests/verify_new_providers.js` that tests all requirements in R3 of `ORIGINAL_REQUEST.md`:
   - Phase 1: Server startup on ephemeral port (port 0), clean shutdown in `finally` block, verify `/health` and `/manifest.json`.
   - Phase 2: Direct provider extraction checks for STP (`sieutamphim.pro`), CLBPX (`clbphimxua.info`), and YAN (`yanhh3d.pw`):
     - Check `getCatalog()`, `search()`, `getStreams()`
     - Verify stream properties: `name === 'VIP Movies 🎬'`, `url` points to `/hls/manifest.m3u8`, `externalUrl === undefined`, title matches branding (`[VIP 4 • STP] ... \n⚡ Server STP • sieutamphim.pro`, `[VIP 5 • CLBPX] ... \n⚡ Server CLBPX • clbphimxua.info`, `[VIP 6 • YAN] ... \n⚡ Server YAN • yanhh3d.pw`).
   - Phase 3: Manifest Proxy Route Verification (`/hls/manifest.m3u8`): HTTP 200, Content-Type `application/vnd.apple.mpegurl` (or text/plain), body starts with `#EXTM3U`, segment lines rewritten to `/hls/segment.ts?url=...&ref=...`.
   - Phase 4: Stream Aggregator Safety (`/default/stream/movie/tt0373889.json`, `/default/stream/series/tt0903747:1:1.json`): HTTP 200, no crashes.
   - Phase 5: TS Segment Download & MPEG-TS Binary Inspection (`/hls/segment.ts`): HTTP 200/206, size > 10,000 bytes (>10KB), sync byte `0x47` at offset 0 or packet boundary.
   - Phase 6: HTTP Range 206 Seeking Support: `Range: bytes=0-1023` returns HTTP 206, `Content-Range` header, length 1024 bytes.
   - Robustness: If live provider upstream CDN is unavailable during CI/test run, fallback gracefully to validating public Mux HLS test stream while strictly asserting provider output invariants.
2. Run test execution commands:
   - `node tests/verify_new_providers.js` (must pass 100% with exit code 0)
   - `node tests/verify_playback.js` (must pass 7/7)
   - `node tests/verify_hotfix_vsmov_kkphim.js` (must pass 27/27)
   - `node src/test.js` (must pass 50/50)
3. Write your handoff report to `/Users/quan/.gemini/antigravity/scratch/stremio-nguonc-addon/.agents/teamwork_preview_worker_m2/handoff.md`.
