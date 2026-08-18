## 2026-08-18T02:29:29Z
You are the Implementation Worker for Hotfix v1.5.1.

Working directory: /Users/quan/.gemini/antigravity/scratch/stremio-nguonc-addon/.agents/worker_hotfix
PROJECT scope file: /Users/quan/.gemini/antigravity/scratch/stremio-nguonc-addon/PROJECT.md
Original user request: /Users/quan/.gemini/antigravity/scratch/stremio-nguonc-addon/.agents/ORIGINAL_REQUEST.md

Explorer handoffs to review:
- Explorer 1 (VSMOV): /Users/quan/.gemini/antigravity/scratch/stremio-nguonc-addon/.agents/explorer_vsmov/handoff.md
- Explorer 2 (KKPhim): /Users/quan/.gemini/antigravity/scratch/stremio-nguonc-addon/.agents/explorer_kkphim/handoff.md
- Explorer 3 (E2E & Versioning): /Users/quan/.gemini/antigravity/scratch/stremio-nguonc-addon/.agents/explorer_e2e_deploy/handoff.md

MANDATORY INTEGRITY WARNING:
DO NOT CHEAT. All implementations must be genuine. DO NOT hardcode test results, create dummy/facade implementations, or circumvent the intended task. A teamwork_preview_auditor will independently verify your work. Integrity violations WILL be detected and your work WILL be rejected.

File ownership:
You have exclusive write ownership of:
- `src/providers/vsmov.js`
- `src/routes/hls.js`
- `src/providers/kkphim.js`
- `tests/verify_playback.js`
- `package.json`
- `src/manifest.js`
- `src/handlers.js`

Tasks to execute:
1. Ensure `src/providers/vsmov.js` and `src/routes/hls.js` implement full VSMOV multi-server separation (`Vietsub`, `Lồng Tiếng`, `Thuyết Minh`), subtitle extraction from embed player, and `/hls/sub.vtt` proxy endpoint with WebVTT/SRT conversion and CORS `*`. Enforce strict In-App stream protocol (include `url`, omit `externalUrl`).
2. Update `src/providers/kkphim.js` with normalized episode container access (`server.server_data || server.episode_data || server.items || server.episodes || []`) and flexible episode matching (`matchEpisodeItem` supporting exact name, zero-padded `01`/`001`, `Tập 1`, `Tập 01`, `tap-1`, `episode-1`, slug suffix `-1`, regex number extraction, and index fallback). Ensure CDN referer headers (`https://player.phimapi.com/`) and Base64URL parameters are preserved intact.
3. Update `tests/verify_playback.js` with the complete 7-phase E2E verification test specified in Explorer 3's handoff (verifying Harry Potter `tt0373889` >= 2 streams, `/hls/sub.vtt` subtitle proxy, KKPhim `tt0903747:1:1` anti-404 check, real .ts segment download > 50KB with sync byte 0x47, and HTTP Range 206 partial content).
4. Update version to `1.5.1` in:
   - `package.json` ("version": "1.5.1")
   - `src/manifest.js` (header comment & `version: '1.5.1'`)
   - `src/handlers.js` (header comment, status subtitle, and footer `VIP Movies Addon v1.5.1 • Powered by <span class="brand-highlight">Q121101</span>`)
5. Execute verification commands:
   - `node --check src/index.js src/handlers.js src/manifest.js src/providers/vsmov.js src/providers/kkphim.js src/routes/hls.js`
   - `node tests/verify_playback.js`
   - `npm test`
6. Write full completion report to `/Users/quan/.gemini/antigravity/scratch/stremio-nguonc-addon/.agents/worker_hotfix/handoff.md` and send message back with test results.
