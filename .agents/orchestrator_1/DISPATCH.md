## 2026-08-18T00:54:52Z
You are the Project Orchestrator for the complete overhaul and production-ready release of Stremio VIP Movies Addon Engine v1.5.0.

Your working directory is:
`/Users/quan/.gemini/antigravity/scratch/stremio-nguonc-addon/.agents/orchestrator_1/`
Project root:
`/Users/quan/.gemini/antigravity/scratch/stremio-nguonc-addon`

The authoritative user request is saved in `/Users/quan/.gemini/antigravity/scratch/stremio-nguonc-addon/ORIGINAL_REQUEST.md`.

Mission Details & Requirements:
1. R1. Provider Standardization & Conflict Resolution (src/lib/utils.js, src/providers/*.js):
   - Ensure src/lib/utils.js exports canonical helper functions: scoreMatch, normalizeText, escapeRegExp, safeExtra, safeSlug, safeKeyword, safePage, extractSeasonNumber, isSeasonMatch.
   - Remove any duplicate scoreMatch declarations in src/providers/vsmov.js and src/providers/kkphim.js, importing strictly from ../lib/utils.js.
   - Standardize all 7 provider modules (vsmov.js, kkphim.js, nguonc.js, stp.js, hh3d.js, yan.js, clbpx.js) to export getStreams(type, id, extra, req) and getCatalog(type, id, extra, page).
   - VSMOV 4K (vsmov.js): Direct IMDb lookup and keyword search. Extract Master 4K Ultra HD (3840x2160) stream from *.streamvsmov.com with Referer: https://vsmov.com/. Titles: [VIP 1 • VSMOV] Master 4K Ultra HD (HLS Proxy) and [VIP 1 • VSMOV] Thuyết Minh Full HD (HLS Proxy).
   - KKPhim (kkphim.js): Official API (https://phimapi.com). Direct IMDb /imdb/title/${imdbId} with fallback /v1/api/tim-kiem?keyword=. Extract Vietsub, Thuyết Minh, Lồng Tiếng servers with Referer: https://phimapi.com/. Titles: [VIP 2 • KKPhim] Vietsub Full HD (HLS Proxy) and [VIP 2 • KKPhim] Thuyết Minh Full HD (HLS Proxy).
   - NguonC (nguonc.js): API https://phim.nguonc.com/api. Endpoints /films/search?keyword= and /film/{slug}. Bóc tách iframe StreamC with Referer: https://embed15.streamc.xyz/. Title: [VIP 3 • NguonC] Vietsub / Thuyết Minh (HLS Proxy).
   - Specialized Providers (stp.js, hh3d.js, yan.js, clbpx.js): STP (Western Cinema/K-Drama), HH3D (3D Donghua / Xianxia), YAN (Daily Donghua), CLBPX (Classic Wuxia/TVB).
   - Enforce strictly `url` for in-app HLS Proxy and omit `externalUrl`.

2. R2. Fail-Safe Stream Aggregator & Metadata Resolution (src/handlers.js):
   - Resolve canonical IMDb metadata using Cinemeta API (https://v3-cinemeta.strem.io/meta/${type}/${imdbId}.json).
   - Query active providers concurrently via Promise.allSettled() with a 4000ms timeout per provider.
   - Filter valid streams and always return HTTP 200 { streams: [...] } without crashing.

3. R3. 404 Routing Elimination & 22 Catalogs K20 Standard (src/index.js, src/manifest.js, src/config.js):
   - Mount explicit routes for both default and /:config-prefixed paths:
     GET /manifest.json, GET /:config/manifest.json
     GET /catalog/:type/:id.json, GET /catalog/:type/:id/:extra.json
     GET /:config/catalog/:type/:id.json, GET /:config/catalog/:type/:id/:extra.json
     GET /stream/:type/:id.json, GET /:config/stream/:type/:id.json
     GET /meta/:type/:id.json, GET /:config/meta/:type/:id.json
   - Safely parse extra parameter (e.g., search=... / skip=...). On search, query active providers in parallel and return { metas: [...] } with HTTP 200 (never 404).
   - Declare all 22 K20 standard catalogs in src/manifest.js & src/config.js.

4. R4. Mandatory Real Video Segment Playback Test (tests/verify_playback.js):
   - Automated E2E verification test:
     1. Start local server on ephemeral port.
     2. Request streams for movie (e.g. Spider-Man / Avengers) and series (e.g. Silo).
     3. Verify streams returned from VSMOV 4K, KKPhim, and NguonC.
     4. Fetch /hls/manifest.m3u8, verify #EXTM3U and rewriting of TS segments to /hls/segment.ts.
     5. Download a real video segment /hls/segment.ts from upstream CDN through proxy: verify HTTP 200 (or 206) and binary payload > 50KB.
     6. Self-debug loop: if any test fails, diagnose and fix code until 100% passing.

5. R5. UI Preservation, Versioning & Deployment:
   - Preserve Cyber-Glassmorphism UI with glowing signature: `VIP Movies Addon v1.5.0 • Powered by <span class="brand-highlight">Q121101</span>`.
   - Sync version 1.5.0 in package.json and manifest.js.
   - Execute git commit & push:
     `git add . && git commit -m "Engine v1.5.0: Production-Ready 7-Source Swarm with 22 Catalogs & E2E Verified 4K Playback via Teamwork Preview" && git push origin main`.

Acceptance Criteria:
- `node tests/verify_playback.js` passes all tests and downloads a real .ts segment (> 50KB) with HTTP 200.
- All catalog and search endpoints return HTTP 200 { metas: [...] } without 404 errors.
- In-app stream objects strictly contain url and NO externalUrl.
- `node --check src/index.js` passes with zero errors.
- `git push origin main` completes successfully.
