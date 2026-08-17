## 2026-08-17T15:15:13Z

You are the Multi-Provider Implementation Worker (Milestone 2 Replacement).
Working directory: /Users/quan/.gemini/antigravity/scratch/stremio-nguonc-addon/.agents/worker_m2_providers_2

Read /Users/quan/.gemini/antigravity/scratch/stremio-nguonc-addon/ORIGINAL_REQUEST.md first.
Read the API specifications in /Users/quan/.gemini/antigravity/scratch/stremio-nguonc-addon/.agents/spec_miner_apis/handoff.md.

MANDATORY INTEGRITY WARNING:
DO NOT CHEAT. All implementations must be genuine. DO NOT hardcode test results, create dummy/facade implementations, or circumvent the intended task. A teamwork_preview_auditor will independently verify your work. Integrity violations WILL be detected and your work WILL be rejected.

Your task (Requirement R2):
Implement/Update all modules in `src/providers/`:
1. `src/providers/vsmov.js`:
   - Integrate official API: `https://vsmov.com/api` (`/tim-kiem?keyword=...`, `/phim/:slug`, `/danh-sach/4k`).
   - Direct IMDb / TMDB / Keyword lookup matching.
   - Extract Master 4K Ultra HD (3840x2160) streams from `*.streamvsmov.com` CDN with `Referer: https://vsmov.com/`.
   - Wrap through HLS proxy: `${proxyBase}/hls/manifest.m3u8?url=...&ref=...`.
   - Format stream titles: `[VIP 1 • VSMOV] Master 4K Ultra HD (3840x2160) (HLS Proxy)` and `[VIP 1 • VSMOV] Thuyết Minh Full HD (HLS Proxy)`.
   - STRICT INVARIANT: Remove ALL `externalUrl` fallback properties.
2. `src/providers/kkphim.js`:
   - Official API integration: `https://phimapi.com`.
   - Direct IMDb lookup (`/imdb/title/${imdbId}`) with fallback search (`/v1/api/tim-kiem?keyword=`).
   - Extract Vietsub, Thuyết Minh, Lồng Tiếng servers with HLS proxy wrapping.
   - Format stream titles: `[VIP 2 • KKPhim] Vietsub Full HD (HLS Proxy)` and `[VIP 2 • KKPhim] Thuyết Minh Full HD (HLS Proxy)`.
   - STRICT INVARIANT: Remove ALL `externalUrl` fallback properties.
3. `src/providers/nguonc.js`:
   - Official API: `https://phim.nguonc.com/api`.
   - Extract StreamC embed/m3u8 with `Referer: https://embed15.streamc.xyz/`.
   - Format stream titles: `[VIP 3 • NguonC] Vietsub / Thuyết Minh (HLS Proxy)`.
   - STRICT INVARIANT: Remove ALL `externalUrl` fallback properties.
4. Implement specialized providers:
   - `src/providers/stp.js`: Western Cinema & K-Drama (`suutamphim.org` / `tvhay`).
   - `src/providers/hh3d.js`: 3D Donghua (Perfect World, Swallowed Star, Battle Through the Heavens).
   - `src/providers/yan.js`: 3D Donghua & ongoing anime.
   - `src/providers/clbpx.js`: Classic Wuxia / Kim Dung & TVB.
   - Each specialized provider exports standard interface: `{ id, label, getCatalog, getStreams }` with graceful error handling and zero `externalUrl`.

Verify syntax with `node --check src/providers/*.js`.
Write unit tests for all providers and verify with `node tests/verify_playback.js`.
Write your handoff report to /Users/quan/.gemini/antigravity/scratch/stremio-nguonc-addon/.agents/worker_m2_providers_2/handoff.md and report back when finished.
