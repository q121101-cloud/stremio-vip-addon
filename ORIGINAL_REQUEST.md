# Original User Request

## 2026-08-17T14:51:29Z

Comprehensive overhaul of Stremio VIP Movies Addon Engine v1.5.0: fix all HTTP 404 search/catalog routes, resolve black screen playback issues via full HLS playlist and segment rewriter (`/hls/segment.ts` with Range support and `/hls/key`), integrate VSMOV 4K API + KKPhim + NguonC + specialized providers (STP, HH3D, YAN, CLBPX), configure 22 standard K20 catalogs, and enforce E2E verification of real >50KB video TS chunk downloads with HTTP 200.

Working directory: `/Users/quan/.gemini/antigravity/scratch/stremio-nguonc-addon`
Integrity mode: development

## Requirements

### R1. HLS Proxy Anti-403 & Full Segment Rewriter (`src/routes/hls.js`)
- **`/hls/manifest.m3u8`**:
  - Accept Base64URL-encoded `url` and `ref` parameters.
  - Fetch upstream M3U8 with upstream origin headers (`Referer`, `Origin`, Chrome 126 User-Agent).
  - Parse and rewrite M3U8 content line-by-line:
    - Master Playlists (`#EXT-X-STREAM-INF` up to 4K 3840x2160): rewrite all sub-variant playlist URIs to `/hls/manifest.m3u8?url=...&ref=...`.
    - Media Playlists (`#EXTINF` & `#EXT-X-KEY`):
      - Rewrite encryption keys: `#EXT-X-KEY:METHOD=...,URI="${baseUrl}/hls/key?url=...&ref=..."`.
      - Rewrite all segment URIs (relative and absolute) to `/hls/segment.ts?url=...&ref=...`.
    - Enforce response headers: `Content-Type: application/vnd.apple.mpegurl; charset=utf-8`, `Access-Control-Allow-Origin: *`, `Cache-Control: no-cache, no-store`.
- **`/hls/segment.ts`**:
  - Pipe raw binary TS video chunks directly from upstream CDN.
  - Support HTTP Range requests (`206 Partial Content`) for smooth playback seeking.
  - Enforce response headers: `Content-Type: video/MP2T`, `Access-Control-Allow-Origin: *`, `Cache-Control: public, max-age=31536000, immutable`.
- **`/hls/key`**:
  - Proxy decryption key files with upstream `Referer` headers.

### R2. Multi-Provider Architecture (`src/providers/`)
- **VSMOV 4K Engine (`src/providers/vsmov.js`)**:
  - Official API integration (`https://vsmov.com/api` per documentation).
  - Direct IMDb / TMDB / Keyword lookup.
  - Extract Master 4K Ultra HD (3840x2160) streams from `*.streamvsmov.com` CDN with `Referer: https://vsmov.com/`.
  - Format titles: `[VIP 1 • VSMOV] Master 4K Ultra HD (3840x2160) (HLS Proxy)` and `[VIP 1 • VSMOV] Thuyết Minh Full HD (HLS Proxy)`.
- **KKPhim Engine (`src/providers/kkphim.js`)**:
  - Official API integration (`https://phimapi.com`).
  - Direct IMDb lookup (`/imdb/title/${imdbId}`) with fallback search (`/v1/api/tim-kiem?keyword=`).
  - Extract Vietsub, Thuyết Minh, Lồng Tiếng servers.
  - Format titles: `[VIP 2 • KKPhim] Vietsub Full HD (HLS Proxy)` and `[VIP 2 • KKPhim] Thuyết Minh Full HD (HLS Proxy)`.
- **NguonC Engine (`src/providers/nguonc.js`)**:
  - Official API (`https://phim.nguonc.com/api`).
  - Extract StreamC embed/m3u8 with `Referer: https://embed15.streamc.xyz/`.
  - Format titles: `[VIP 3 • NguonC] Vietsub / Thuyết Minh (HLS Proxy)`.
- **Specialized Providers (`src/providers/stp.js`, `hh3d.js`, `yan.js`, `clbpx.js`)**:
  - `stp.js`: Western Cinema & K-Drama (`suutamphim.org` / `tvhay`).
  - `hh3d.js` & `yan.js`: 3D Donghua / Xianxia (Perfect World, Swallowed Star, Battle Through the Heavens).
  - `clbpx.js`: Classic Wuxia / Kim Dung & TVB.

### R3. Routing & Search 404 Prevention (`src/index.js` & `src/routes/manifest.js`)
- Explicitly declare and mount all Stremio/Nuvio catalog and stream routes with and without `/:config/`:
  - `GET /manifest.json`, `GET /:config/manifest.json`
  - `GET /catalog/:type/:id.json`, `GET /catalog/:type/:id/:extra.json`
  - `GET /:config/catalog/:type/:id.json`, `GET /:config/catalog/:type/:id/:extra.json`
  - `GET /stream/:type/:id.json`, `GET /:config/stream/:type/:id.json`
- Safely parse `extra` parameter for `search=...` and `skip=...`.
- Search requests must fan out across active providers and return HTTP 200 `{ metas: [...] }` (never 404).

### R4. 22 Catalogs K20 Standard (`src/manifest.js`)
- Define all 22 standard catalogs (VSMOV 4K/TM, KKPhim Phim Lẻ/Bộ/Rạp/Hoạt Hình, NguonC Phim Lẻ/Bộ/Rạp/Mới, STP Âu Mỹ/Lẻ/Bộ/Hàn Quốc, HH3D Lẻ/Bộ/Tiên Hiệp, YAN Lẻ/Bộ/Đang Chiếu, CLBPX Kiếm Hiệp/Hồng Kông).

### R5. Fail-Safe Stream Aggregation & Metadata Resolution (`src/handlers.js`)
- Resolve canonical IMDb metadata using Cinemeta API (`https://v3-cinemeta.strem.io/meta/${type}/${imdbId}.json`).
- Query all active providers in parallel with `Promise.allSettled` and 4000ms timeout per provider.
- Always return HTTP 200 `{ streams: [...] }`.

### R6. Mandatory Playback Verification Test (`tests/verify_playback.js`)
- Automated E2E verification test:
  1. Start local server on ephemeral port.
  2. Request streams for movie (e.g. Spider-Man / Avengers) and series (e.g. Silo).
  3. Fetch `/hls/manifest.m3u8`, verify `#EXTM3U` and rewriting of TS segments to `/hls/segment.ts`.
  4. Perform real HTTP GET on `/hls/segment.ts`: verify HTTP 200 (or 206) and binary payload > 50KB.
  5. Self-debug loop: if any step fails, diagnose and fix code until 100% pass.

### R7. UI Preservation, Versioning & Deployment
- Retain Cyber-Glassmorphism UI with glowing signature: `VIP Movies Addon v1.5.0 • Powered by <span class="brand-highlight">Q121101</span>`.
- Bump version to `1.5.0` in `package.json` and `manifest.js`.
- Git commit & push to `main`: `git add . && git commit -m "Engine v1.5.0: Verified 4K VSMOV API, KKPhim, NguonC integration with Full TS Chunk Rewriter & Zero-Error Playback" && git push origin main`.

## Acceptance Criteria

### Verification Standards
- [ ] `node tests/verify_playback.js` executes and downloads a real video `.ts` segment (> 50KB) with HTTP 200 OK.
- [ ] All catalog and search endpoints return HTTP 200 `{ metas: [...] }` without 404 errors.
- [ ] In-app stream objects strictly contain `url` and NO `externalUrl`.
- [ ] `node --check src/index.js` passes without syntax errors.
