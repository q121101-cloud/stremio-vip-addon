# HLS Proxy & KKPhim In-App Playback Investigation Report

## 1. Observation

### 1.1 Architecture & Server Routing
- **Entry point (`src/index.js:63-83`)**:
  - Express server registers middleware in exact order: CORS (`*`), body parser, logger, `/favicon.ico`.
  - HLS Router is mounted at `/hls` via `app.use('/hls', hlsRouter)`.
  - Dynamic Manifest Router mounted at `/` via `app.use('/', manifestRouter)` (handles `/manifest.json` and `/:config/*`).
  - Stremio Addon Handlers mounted at `/` via `app.use('/', handlers)` (handles `/catalog`, `/meta`, `/stream`, `/health`, `/`).
- **HLS Proxy Router Endpoints (`src/routes/hls.js`)**:
  - `GET /hls/extract?embed=<embed_url>` (lines 113–137): Lazy extraction for iframe embed pages (NguonC), extracts stream URL via `extractM3u8FromEmbed` and performs 302 redirect to `/hls/manifest.m3u8`.
  - `GET /hls/manifest.m3u8` / `GET /hls/m3u8` (lines 143–237): Master and media playlist rewriter. Accepts `url` or `b64` parameter, plus `ref` or `referer` parameter.
  - `GET /hls/ts` (lines 243–285): Binary segment streaming proxy. Accepts `url` or `b64` parameter, plus `ref` or `referer`, plus `is_key=1` for encryption keys.
  - `OPTIONS *` (lines 104–107): Handles preflight requests with HTTP 204.

### 1.2 Playlist Rewriting Mechanics (`src/routes/hls.js:163-237`)
- Incoming playlist is fetched with upstream headers: `User-Agent: HLS_UA`, `Referer: refererUrl`, `Origin: origin`.
- Upstream playlist text is parsed line-by-line:
  - `#EXT-X-STREAM-INF` / `#EXT-X-I-FRAME-STREAM-INF`: Marks subsequent line as sub-playlist (`isNextSubPlaylist = true`).
  - `#EXTINF`: Marks subsequent line as media segment (`isNextSegment = true`).
  - Attribute rewrites with regex replacement:
    - `#EXT-X-MEDIA:...URI="([^"]+)"`: Rewritten to `/hls/manifest.m3u8?b64=${b64Uri}&ref=${encodedRef}`.
    - `#EXT-X-KEY:...URI="([^"]+)"`: Rewritten to `/hls/ts?b64=${b64Key}&ref=${encodedRef}&is_key=1`.
    - `#EXT-X-MAP:...URI="([^"]+)"`: Rewritten to `/hls/ts?b64=${b64Map}&ref=${encodedRef}`.
  - Non-comment URI lines:
    - Relative URLs (e.g. `2000kb/hls/index.m3u8` or `segment_001.ts`) are resolved to absolute URLs against `baseUrl` (`new URL(t, baseUrl.href).href`).
    - Encoded as Base64URL string (`b64Url`).
    - If `isNextSubPlaylist` is true OR URL contains `.m3u8` / `playlist` -> routed to `${protoHost}/hls/manifest.m3u8?b64=${b64Url}&ref=${encodedRef}`.
    - Otherwise -> routed to `${protoHost}/hls/ts?b64=${b64Url}&ref=${encodedRef}`.
- Rewritten playlist is cached in `m3u8Cache` (`cacheKey = 'm3u8:' + targetUrl`).

### 1.3 Segment Streaming & MIME Handling (`src/routes/hls.js:243-285`)
- Segments are streamed via Axios `responseType: 'stream'` and piped (`r.data.pipe(res)`).
- Response headers set:
  - CORS: `Access-Control-Allow-Origin: *`, `Access-Control-Allow-Headers: *`, `Access-Control-Allow-Methods: GET, HEAD, OPTIONS`.
  - Cache: `Cache-Control: public, max-age=86400`.
  - Content-Type override:
    - Media segments: strictly set to `video/mp2t` (preventing CDNs from spoofing segments as `image/png` or `application/octet-stream`).
    - AES keys: set to `application/octet-stream`.
- Playlists (`/hls/manifest.m3u8`): `Content-Type: application/vnd.apple.mpegurl; charset=utf-8`.

### 1.4 Upstream Headers & CDN Domains
- **Current `SOURCE_REFERERS` mapping in `src/routes/hls.js:35-41`**:
  ```javascript
  const SOURCE_REFERERS = [
    { pattern: /nguonc\.com/i,     referer: 'https://phim.nguonc.com/',   origin: 'https://phim.nguonc.com' },
    { pattern: /phimapi\.com/i,    referer: 'https://phimapi.com/',       origin: 'https://phimapi.com' },
    { pattern: /kkphim/i,          referer: 'https://kkphim.vip/',        origin: 'https://kkphim.vip' },
    { pattern: /vsmov|streamvs/i,  referer: 'https://vsmov.com/',         origin: 'https://vsmov.com' },
    { pattern: /streamc\./i,       referer: 'https://streamc.online/',    origin: 'https://streamc.online' },
  ];
  ```
- **Observed KKPhim CDN domains in live API probe**:
  - `v7.kkphimplayer7.com` (matched by `/kkphim/i` but erroneously assigned `referer: https://kkphim.vip/` instead of `https://player.phimapi.com/`).
  - `s1.phim1280.tv` (not matched by any pattern; falls back to default origin).
  - `s1.phimapi.com` (matched by `/phimapi\.com/i` but assigned `https://phimapi.com/` without `player.` subdomain).
- **Current `src/providers/kkphim.js:347`**:
  `const baseRef = 'https://phimapi.com/';` (uses `https://phimapi.com/` instead of `https://player.phimapi.com/`).
- **Current `src/providers/kkphim.js:401-412`**:
  Still pushes an external embed fallback stream with `externalUrl: targetEp.link_embed`.
- **Current `HLS_UA` in `src/routes/hls.js:29`**:
  Uses older Chrome 122 Windows UA string instead of Chrome 126 Macintosh UA.

### 1.5 Live Playback Verification
- Executed real E2E probe on title `cuu-mon`:
  - Fetching `/stream/movie/kkphim_cuu-mon.json` generated proxy URL: `http://localhost:7892/hls/manifest.m3u8?url=...`.
  - Fetching Master Manifest returned HTTP 200 with `#EXT-X-STREAM-INF` and rewritten sub-manifest URL.
  - Fetching Media Manifest returned HTTP 200 with 3,331 lines and rewritten TS segments (`/hls/ts?b64=...`).
  - Fetching TS Segment returned HTTP 200, `video/mp2t` header, 946,204 bytes, with verified MPEG-TS sync byte `0x47`.

---

## 2. Logic Chain

```
[Observation 1.4 & 1.5] KKPhim CDNs use player.phimapi.com as expected Referer/Origin
       │
       ├─► Observation: src/routes/hls.js SOURCE_REFERERS maps phimapi.com -> https://phimapi.com/
       │                and kkphim -> https://kkphim.vip/
       │                and lacks explicit patterns for *.kkphimplayer*.com and phim1280.tv
       │
       ├─► Observation: src/providers/kkphim.js encodes baseRef as 'https://phimapi.com/'
       │                instead of 'https://player.phimapi.com/'
       │
       ├─► Observation: src/providers/kkphim.js outputs embed stream with externalUrl
       │                violating R1 requirement to strictly omit externalUrl for KKPhim
       │
       ▼
[Conclusion] Optimization requires:
 1. Update src/routes/hls.js:
    - Set HLS_UA to Chrome 126 Mac User-Agent
    - Update SOURCE_REFERERS to map /phimapi|kkphimplayer|kkphim|phim1280/i -> Referer: 'https://player.phimapi.com/', Origin: 'https://player.phimapi.com'
 2. Update src/providers/kkphim.js:
    - Set baseRef = 'https://player.phimapi.com/'
    - Format stream title per R1: `[VIP • KKPhim] ${cleanServerName} [Tập ${epLabel}] Full HD (HLS Proxy)\n⚡ Server VIP • Phát trực tiếp trong App`
    - Strictly omit externalUrl (do not output embed stream for KKPhim)
 3. Create tests/test_kkphim_playback.js covering all 3 test cases in R3.
```

---

## 3. Caveats

1. **Ephemeral Server Port Binding**: When creating test scripts, `src/index.js` listens immediately upon require. Test scripts must assign `process.env.PORT = <test_port>` before `require('../src/index.js')` to avoid port collisions with the default port 7000.
2. **Network Mode in Tests**: Local test runner needs `BypassSandbox: true` when running `run_command` in this environment so Node.js can bind to local sockets and resolve DNS for upstream provider APIs.
3. **Obfuscated Segment Extensions**: Some CDNs deliver TS chunks as `.png` or query-parameterized URLs. The proxy already handles this correctly by rewriting all non-m3u8 lines under `#EXTINF` to `/hls/ts` and enforcing `Content-Type: video/mp2t`.

---

## 4. Conclusion & Concrete Action Plan

### 4.1 Changes for `src/providers/kkphim.js` (Requirement R1)
1. Set `baseRef = 'https://player.phimapi.com/'`.
2. Format `title` strictly per R1:
   - For movie / single episode: `[VIP • KKPhim] ${cleanServerName} [Tập Full] Full HD (HLS Proxy)\n⚡ Server VIP • Phát trực tiếp trong App` (or `[Tập ${ep.name}]`).
   - For series: `[VIP • KKPhim] ${cleanServerName} [Tập ${ep.name}] Full HD (HLS Proxy)\n⚡ Server VIP • Phát trực tiếp trong App`.
3. URL: `${proxyBase}/hls/manifest.m3u8?url=${encodeBase64(targetEp.link_m3u8)}&ref=${encodeBase64('https://player.phimapi.com/')}`.
4. Remove/omit `externalUrl` embed fallback streams completely so KKPhim streams are 100% in-app direct play.

### 4.2 Changes for `src/routes/hls.js` (Requirement R2)
1. Update `HLS_UA`:
   `const HLS_UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';`
2. Update `SOURCE_REFERERS`:
   Include `/phimapi|kkphimplayer|kkphim|phim1280/i` with `referer: 'https://player.phimapi.com/'` and `origin: 'https://player.phimapi.com'`.
3. Ensure CORS (`Access-Control-Allow-Origin: *`, `Access-Control-Allow-Headers: *`) and MIME types (`application/vnd.apple.mpegurl`, `video/mp2t`, `application/octet-stream`) remain strictly enforced.

### 4.3 Implementation for `tests/test_kkphim_playback.js` (Requirement R3)
Create self-contained test script implementing:
- **Test Case 1**: Fetch stream list for `cuu-mon` (or `tt...` / `kkphim_cuu-mon`), verify `[VIP • KKPhim]` stream exists with valid `url` and NO `externalUrl`.
- **Test Case 2**: GET proxy manifest URL, verify HTTP 200, `#EXTM3U` header, and presence of rewritten sub-manifest or `/hls/ts` links.
- **Test Case 3**: GET rewritten `/hls/ts` video segment, verify HTTP 200, `video/mp2t` Content-Type, non-empty buffer (> 100KB), and MPEG-TS sync byte (`0x47`).

---

## 5. Verification Method

To independently verify the implementation:

1. **Syntax validation**:
   ```bash
   node --check src/index.js
   node --check src/routes/hls.js
   node --check src/providers/kkphim.js
   ```

2. **Playback test suite**:
   ```bash
   node tests/test_kkphim_playback.js
   ```
   Expectation: All 3 test cases pass with 0 errors.

3. **Full regression suite**:
   ```bash
   node tests/e2e.test.js
   ```
   Expectation: 94+ assertions pass with 0 failures.
