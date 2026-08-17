## 2026-08-17T15:04:43Z
Task (Requirement R2):
Implement/Update all modules in `src/providers/`:
1. `src/providers/vsmov.js`
2. `src/providers/kkphim.js`
3. `src/providers/nguonc.js`
4. Specialized providers:
   - `src/providers/stp.js`
   - `src/providers/hh3d.js`
   - `src/providers/yan.js`
   - `src/providers/clbpx.js`
All providers must export standard interface: `{ id, label, getCatalog, getStreams }` with graceful error handling and zero `externalUrl` (STRICT INVARIANT: No `externalUrl` fallback properties anywhere).
Wrap streams through HLS proxy: `${proxyBase}/hls/manifest.m3u8?url=...&ref=...`.
Verify syntax with `node --check src/providers/*.js`.
Write unit tests for all providers and verify with `node tests/verify_playback.js`.
Write handoff report to `.agents/worker_m2_providers/handoff.md`.
