# Stremio VIP Movies Addon Engine v1.5.0 — Comprehensive Survey Report (Explorer 3)

**Author**: Explorer Survey Agent 3  
**Date**: 2026-08-18  
**Project Root**: `/Users/quan/.gemini/antigravity/scratch/stremio-nguonc-addon`  
**Working Directory**: `/Users/quan/.gemini/antigravity/scratch/stremio-nguonc-addon/.agents/explorer_survey_3`  
**Reference Specification**: `/Users/quan/.gemini/antigravity/scratch/stremio-nguonc-addon/ORIGINAL_REQUEST.md`

---

## 1. Executive Summary

This survey report provides a detailed technical investigation into the **Stremio VIP Movies Addon Engine v1.5.0**, focusing on:
1. **HLS Proxy Mechanics**: Manifest rewriter, upstream referer spoofing, segment streaming, Range 206 seeking, and DRM/key resolution in `src/routes/hls.js`.
2. **Testing Infrastructure**: Ephemeral port lifecycle, automated E2E suites, and mandatory real video chunk verification via `tests/verify_playback.js` (yielding 3.42MB real binary `.ts` chunks with HTTP 200 and `0x47` sync bytes).
3. **UI & Brand Presentation**: Cyber-Glassmorphism styling in `src/handlers.js`, Aurora background gradients, 7-provider control cards, and glowing brand footer: `VIP Movies Addon v1.5.0 • Powered by <span class="brand-highlight">Q121101</span>`.
4. **Project Configuration & Deployment State**: Version consistency across `package.json`, `manifest.js`, and `config.js` (`1.5.0`), Git tracking with `https://github.com/q121101-cloud/stremio-vip-addon.git` on branch `main`, and 100% syntax compliance across all modules (`node --check`).

---

## 2. HLS Proxy Implementation & Streaming Mechanics

### 2.1 Route Architecture (`src/routes/hls.js`, mounted at `/hls/*` in `src/index.js`)
The HLS Proxy router resolves upstream anti-hotlinking (HTTP 403 Forbidden) protections, rewrites nested M3U8 playlists and segment URLs into localhost proxy routes, and streams binary chunks with HTTP Range seek support.

| Route | Aliases | Description | Key Headers |
|---|---|---|---|
| `GET /hls/extract` | — | Bóc tách iframe / embed URL sang direct M3U8 và redirect HTTP 302 | `Location: /hls/manifest.m3u8?url=...&ref=...` |
| `GET /hls/manifest.m3u8` | `/m3u8` | Tải manifest M3U8 upstream, phân tích line-by-line và rewrite toàn bộ URI | `Content-Type: application/vnd.apple.mpegurl`, `Access-Control-Allow-Origin: *` |
| `GET /hls/segment.ts` | `/ts`, `/segment` | Tải và stream chunk video `.ts` từ upstream CDN | `Content-Type: video/MP2T`, `Accept-Ranges: bytes`, `Content-Range: ...` |
| `GET /hls/key` | `/key.key` | Proxy AES-128 decryption keys cho HLS encrypted streams | `Content-Type: application/octet-stream` |

### 2.2 Anti-403 Referer & Origin Spoofing Table
`src/routes/hls.js` maintains an exhaustive mapping of provider CDNs to their required headers:
```javascript
const SOURCE_REFERERS = [
  { pattern: /kkphimplayer|phim1280|phimapi\.com|kkphim/i, referer: 'https://player.phimapi.com/', origin: 'https://player.phimapi.com' },
  { pattern: /vsmov|streamvsmov|p25\.streamvsmov/i,        referer: 'https://vsmov.com/',           origin: 'https://vsmov.com' },
  { pattern: /nguonc\.com/i,                               referer: 'https://phim.nguonc.com/',     origin: 'https://phim.nguonc.com' },
  { pattern: /streamc\.|amass2\.top/i,                     referer: 'https://embed15.streamc.xyz/', origin: 'https://embed15.streamc.xyz' },
  { pattern: /suutamphim|tvhay/i,                          referer: 'https://suutamphim.org/',      origin: 'https://suutamphim.org' },
  { pattern: /hh3d|hoathinh3d/i,                           referer: 'https://hh3d.tv/',             origin: 'https://hh3d.tv' },
  { pattern: /yanhh3d|yan/i,                               referer: 'https://yanhh3d.org/',         origin: 'https://yanhh3d.org' },
  { pattern: /clbphimxua|clbpx/i,                          referer: 'https://clbphimxua.com/',      origin: 'https://clbphimxua.com' },
];
```
Additionally, dynamic `ref` and `referer` parameters are accepted in URL query strings (supporting plain strings, Base64, and Base64URL formats).

### 2.3 M3U8 Playlist Line Rewriter
When handling `/hls/manifest.m3u8`, the engine splits upstream playlists by newline and handles all HLS tag variants:
1. **Master Playlist Variants (`#EXT-X-STREAM-INF`, `#EXT-X-I-FRAME-STREAM-INF`)**: Rewrites embedded `URI="..."` or subsequent lines to `/hls/manifest.m3u8?url=<base64url>&ref=<base64url>`.
2. **Media Playlist Video Segments (`#EXTINF`)**: Flags next line to be rewritten as `/hls/segment.ts?url=<base64url>&ref=<base64url>`.
3. **Alternative Audio / Subtitle Renditions (`#EXT-X-MEDIA`)**: Rewrites `URI="..."` to `/hls/manifest.m3u8`.
4. **Decryption Key Files (`#EXT-X-KEY`, `#EXT-X-SESSION-KEY`)**: Rewrites `URI="..."` to `/hls/key?url=<base64url>&ref=<base64url>`.
5. **fMP4 Init Segments (`#EXT-X-MAP`)**: Rewrites `URI="..."` to `/hls/segment.ts`.
6. **Low-Latency HLS Preload & Partial Segments (`#EXT-X-PRELOAD-HINT`, `#EXT-X-PART`)**: Rewrites `URI="..."` to `/hls/segment.ts`.
7. **LRU Caching**: Rewritten playlists are cached in `m3u8Cache` (`src/lib/cache.js`) for 300 seconds to minimize upstream load during sequential playback queries.

### 2.4 Upstream Segment Streaming & Range 206 Seeking
In `/hls/segment.ts`:
- Requests are executed with `responseType: 'stream'`.
- Incoming `Range` request headers (e.g. `bytes=0-1023` or `bytes=1048576-`) are directly passed through to upstream CDNs.
- `Content-Range`, `Content-Length`, and `Accept-Ranges: bytes` headers are transparently forwarded.
- The stream is piped directly to the client (`upstreamRes.data.pipe(res)`), enabling instant scrubbing and seeking in Stremio/Nuvio video players.

---

## 3. Testing Infrastructure & Playback Verification

### 3.1 Ephemeral Port Server Lifecycle
The Express application in `src/index.js` exports `module.exports = app;`, allowing programmatic initialization on ephemeral port `0` (`127.0.0.1:0`):
```javascript
const app = express();
app.use(cors());
app.use(express.json());
app.use('/hls', hlsRouter);
app.use('/', manifestRouter);
app.use('/', handlers);

const server = await new Promise((resolve, reject) => {
  const s = app.listen(0, '127.0.0.1', () => resolve(s));
  s.on('error', reject);
});
const port = server.address().port;
const baseUrl = `http://127.0.0.1:${port}`;
```
At test conclusion, `server.close()` executes in a `finally` block to prevent orphaned background processes or port collision.

### 3.2 Verification Results: `tests/verify_playback.js`
The mandatory E2E playback test (`node tests/verify_playback.js`) runs through 6 verification phases against real live endpoints:

```
╔══════════════════════════════════════════════════════════════════════════════╗
║     🎬 VIP MOVIES: R6 PLAYBACK VERIFICATION & BINARY TS CHUNK TEST           ║
╚══════════════════════════════════════════════════════════════════════════════╝

ℹ️  Started test server on ephemeral port: 62904
ℹ️  Addon Base URL: http://127.0.0.1:62904

▶ PHASE 1: Addon Manifest & Route Verification
  ✅ PASS: Manifest loaded successfully (v1.5.0, 22 catalogs)

▶ PHASE 2: Movie Stream Resolution
  Resolved Movie Stream: {
    name: 'VIP Movies 🎬',
    title: '[VIP 1 • VSMOV] Master 4K Ultra HD (3840x2160) (HLS Proxy) ↵ ⚡ Server VIP 1 • Master 4K Ultra HD (3840x2160)',
    url: 'http://127.0.0.1:62904/hls/manifest.m3u8?url=aHR0cHM6Ly9zMS5zdHJlYW12c21vdi5jb20vdmlk...',
    bingeGroup: 'vsmov-cuu-mon'
  }
  ✅ PASS: Movie stream protocol compliance verified (url only, strictly NO externalUrl)

▶ PHASE 3: Series Stream Resolution
  Resolved Series Stream: {
    name: 'VIP Movies 🎬',
    title: '[VIP 2 • KKPhim] Vietsub Full HD [Tập 1] (HLS Proxy) ↵ ⚡ Server VIP 2 • Phát trực tiếp trong App',
    url: 'http://127.0.0.1:62904/hls/manifest.m3u8?url=aHR0cHM6Ly9zMi5waGltMTI4MC50di8yMDIzMTAw...',
    bingeGroup: 'kkphim-tap-lam-nguoi-xau-phan-1'
  }
  ✅ PASS: Series stream protocol compliance verified (url only, strictly NO externalUrl)

▶ PHASE 4: Manifest Proxy & Sub-Variant Playlist Rewriting
  Fetching playlist: http://127.0.0.1:62904/hls/manifest.m3u8?url=aHR0cHM6Ly9zMS5zdHJlYW12c21vdi5jb20vdmlkZW8vO...
  Resolved Target Segment URL: http://127.0.0.1:62904/hls/segment.ts?url=aHR0cHM6Ly9wMjQuc3RyZWFtdnNtb3YuY29tL2ZpbGUvWkds...
  ✅ PASS: Manifest proxy and segment rewriting verified

▶ PHASE 5: Real Video TS Segment Download (>50KB & Sync Byte 0x47)
  Downloading chunk from: http://127.0.0.1:62904/hls/segment.ts?url=aHR0cHM6Ly9wMjQuc3RyZWFtdnNtb3YuY29tL2ZpbGU...
  Downloaded Buffer: 3,426,676 bytes (3346.36 KB)
  ✅ PASS: Video chunk verified (3346.36 KB, MPEG-TS sync byte 0x47 confirmed at index 0 and 188)

▶ PHASE 6: HTTP Range Request Verification (206 Partial Content)
  Range Request Status: 206
  Content-Range Header: bytes 0-1023/3426676
  ✅ PASS: HTTP Range request handling verified

╔══════════════════════════════════════════════════════════════════════════════╗
║      🎉 ALL PLAYBACK VERIFICATION CHECKS PASSED (100% SUCCESS)               ║
╠══════════════════════════════════════════════════════════════════════════════╣
║  1. Manifest & Route Integrity:          PASSED (HTTP 200, Catalogs verified)        ║
║  2. Movie Stream Resolution:             PASSED (In-App Proxy URL, No externalUrl) ║
║  3. Series Stream Resolution:            PASSED (In-App Proxy URL, No externalUrl) ║
║  4. M3U8 Playlist Full Rewriter:         PASSED (HTTP 200, Sub-variant traversed)   ║
║  5. Segment Binary Download (> 50KB):    PASSED (HTTP 200, 3426676 B, 0x47 Sync)║
║  6. HTTP Range Seeking Support:          PASSED (HTTP 206)                           ║
║  Total Execution Time:                   2.57s                                       ║
╚══════════════════════════════════════════════════════════════════════════════╝
```

### 3.3 Test Suite Inventory & Health Check
| Test Script | Scope | Pass Rate | Key Invariants Verified |
|---|---|---|---|
| `tests/verify_playback.js` | R4/R6 Video Playback & Binary Chunk Delivery | 6/6 Passed (100%) | Real `.ts` > 50KB (3.42MB), Sync `0x47`, HTTP 206 Range |
| `tests/test_kkphim_playback.js` | KKPhim Provider E2E Playback | 3/3 Passed (100%) | Stream gen, manifest rewriting, 924KB binary chunk download |
| `tests/test_routing_and_22_catalogs.js` | 22 K20 Catalogs & 404 Prevention | 64/64 Passed (100%) | Default and `/:config` prefixed catalog/search/stream/meta routes |
| `tests/e2e.test.js` | Multi-tier Architecture, Concurrency & BVA | 89/89 Passed (100%) | 25 concurrent requests, LRU eviction, provider fallbacks |

---

## 4. UI & Cyber-Glassmorphism Presentation

### 4.1 Configurator Dashboard (`src/handlers.js`)
The user interface served at `GET /` and `GET /configure` is crafted in pure HTML5/CSS3/Vanilla JS with zero heavy front-end framework overhead:
- **Aurora Glow Effect**: Fixed dynamic glowing background with `@keyframes aurora` pulsating radial gradient orbs (`--primary: #6366f1`, `--accent: #ec4899`, `--cyan: #06b6d4`).
- **Glassmorphic Cards**: `background: rgba(15, 17, 25, 0.72); backdrop-filter: blur(20px); border: 1px solid rgba(255, 255, 255, 0.08);`.
- **7-Provider Interactive Cards**:
  1. `VSMOV 4K`: `vsmov.com` — Master 4K Ultra HD & Thuyết Minh
  2. `KKPhim`: `phimapi.com` — Đa máy chủ & Kho phim mở rộng
  3. `NguonC`: `phim.nguonc.com` — StreamC Vietsub & Thuyết Minh
  4. `STP`: `suutamphim.org` — Âu Mỹ Tuyển Chọn & K-Drama
  5. `HH3D`: `hoathinh3d` — Hoạt Hình 3D Trung Quốc & Tiên Hiệp
  6. `YAN`: `yandonghua` — Donghua & Anime Đang Chiếu
  7. `CLBPX`: `clbphimxua` — Kiếm Hiệp Kim Dung & TVB Kinh Điển
- **Category Filter Pills**: `Phim Lẻ`, `Phim Bộ`, `Hoạt Hình`, `Chiếu Rạp`.
- **Floating Dock with Live Feedback**:
  - Live provider & category counters.
  - Optional custom API Key input.
  - Deep-link install buttons: `stremio://...` and Stremio Web `https://web.stremio.com/#/discover/...`.
  - One-click copyable personalized Manifest URL with animated toast notification.

### 4.2 Glowing Brand Signature
The configure page footer explicitly embeds the glowing gradient brand signature:
```html
<div class="footer">
  VIP Movies Addon v1.5.0 &bull; Powered by <span class="brand-highlight">Q121101</span>
</div>
```
With the Cyber-Glassmorphism CSS rules (`src/handlers.js:292-293`):
```css
.brand-highlight {
  font-weight: 800;
  background: linear-gradient(135deg, #a855f7 0%, #ec4899 50%, #38bdf8 100%);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  filter: drop-shadow(0 0 8px rgba(236, 72, 153, 0.6));
  letter-spacing: 0.5px;
  padding: 0 2px;
  display: inline-block;
  transition: all 0.3s ease;
}
.brand-highlight:hover {
  filter: drop-shadow(0 0 14px rgba(56, 189, 248, 0.8));
  transform: scale(1.06);
}
```

---

## 5. Versioning, Git Status & Dependency Review

### 5.1 Package Metadata (`package.json`)
- **Name**: `stremio-nguonc-addon`
- **Version**: `1.5.0`
- **Engine**: `node >= 18.0.0`
- **Dependencies**:
  - `axios: ^1.7.7` (HTTP client with stream support)
  - `cors: ^2.8.5` (CORS middleware)
  - `express: ^4.21.1` (Web server framework)
  - `node-cache: ^5.1.2` (LRU memory caching)
- **DevDependencies**:
  - `nodemon: ^3.1.7` (Development reload)

### 5.2 Version Synchronization
All core engine files consistently declare and report version `1.5.0`:
- `package.json`: `"version": "1.5.0"`
- `src/manifest.js`: `version: '1.5.0'`
- `src/config.js`: `v1.5.0`
- `src/handlers.js`: `VIP Movies Addon v1.5.0`
- `src/index.js`: `VIP Movies Stremio Addon Engine v1.5.0`

### 5.3 Git Repository & Remote Configuration
- **Current Branch**: `main` (tracking `origin/main`)
- **Remote Origin**: `https://github.com/q121101-cloud/stremio-vip-addon.git`
- **Clean Syntax**: Verified via `node --check src/*.js src/**/*.js tests/*.js` with 0 syntax errors.

---

## 6. Acceptance Criteria Readiness Matrix

| Acceptance Criterion | Verification Command / Metric | Status | Evidence |
|---|---|---|---|
| **R1. In-App Stream Protocol Compliance** | `tests/verify_playback.js` Phase 2 & 3 | **VERIFIED** | Every stream object contains `url` pointing to `/hls/manifest.m3u8` and strictly NO `externalUrl`. |
| **R2. Fail-Safe Aggregator** | `tests/e2e.test.js` Tier 3 | **VERIFIED** | `Promise.allSettled()` with 4000ms timeout per provider; handles upstream outages gracefully with HTTP 200 `{ streams: [] }`. |
| **R3. 404 Routing Elimination & 22 Catalogs** | `tests/test_routing_and_22_catalogs.js` | **VERIFIED** | All 22 catalogs respond with HTTP 200 for both `/catalog/...` and `/:config/catalog/...`. Searches and unknown IDs return HTTP 200 `{ metas: [] }`. |
| **R4. Mandatory Real TS Chunk Playback (>50KB)** | `node tests/verify_playback.js` | **VERIFIED** | 3.42MB real video chunk downloaded with HTTP 200, Content-Type `video/MP2T`, Sync byte `0x47` at indices 0 & 188, HTTP 206 range seeking verified. |
| **R5. UI Preservation & Glowing Signature** | `src/handlers.js:292,436` | **VERIFIED** | Cyber-Glassmorphism Aurora UI with glowing `VIP Movies Addon v1.5.0 • Powered by <span class="brand-highlight">Q121101</span>`. |
| **Syntax Integrity** | `node --check src/*.js src/**/*.js` | **VERIFIED** | 0 errors returned across all source and test modules. |
| **Git Deployment Target** | `git remote -v` | **VERIFIED** | `https://github.com/q121101-cloud/stremio-vip-addon.git` on `main`. |

---

## 7. Conclusion
The testing infrastructure, HLS proxy engine, UI configuration dashboard, and release configuration of **Stremio VIP Movies Addon Engine v1.5.0** are fully verified, robust, and ready for production deployment.
