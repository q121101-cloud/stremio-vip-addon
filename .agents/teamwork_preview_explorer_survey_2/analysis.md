# Detailed Technical Investigation: HLS Routes, Subtitle Proxy & Stream Architecture

## Executive Summary
This report analyzes the HLS proxy architecture, the requirements for the new `GET /hls/sub.vtt` subtitle proxy endpoint, the lifecycle of `proxyBase` across Express routes and provider modules, and the integration of separated multi-server audio streams (`Vietsub`, `Lồng Tiếng`, `Thuyết Minh`) for VSMOV in Hotfix v1.5.1.

---

## 1. Current HLS Routes in `src/routes/hls.js`

### 1.1 Architecture & Express Mount Point
- **Mount Point**: In `src/index.js` (line 64-65):
  ```javascript
  const hlsRouter = require('./routes/hls');
  app.use('/hls', hlsRouter);
  ```
  All endpoints defined in `src/routes/hls.js` are prefixed with `/hls/`.

- **CORS Handling**:
  - Global CORS middleware and custom header setter in `src/index.js` (lines 28-44).
  - OPTIONS preflight handler in `src/routes/hls.js` (lines 112-115) returning status `204`.
  - Dedicated `setCorsHeaders(res)` utility function setting:
    ```javascript
    res.setHeader('Access-Control-Allow-Origin',  '*');
    res.setHeader('Access-Control-Allow-Headers', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
    ```

### 1.2 Parameter Resolution & Anti-403 Header Generation
- **Parameter Resolution (`resolveParamUrl`)**:
  - Accepts raw URL strings, Base64URL-encoded strings, or standard Base64-encoded strings (`req.query.url`, `req.query.b64`, `req.query.embed`).
  - Decodes base64url/base64 via `Buffer.from(str, 'base64url')` / `Buffer.from(str, 'base64')` and validates protocol prefix (`http://`, `https://`).
- **Anti-403 Header Generation (`getRefererHeaders`)**:
  - Matches target URLs against known upstream provider patterns:
    - KKPhim CDNs (`/kkphimplayer|phim1280|phimapi\.com|kkphim/i`) -> `Referer: https://player.phimapi.com/`, `Origin: https://player.phimapi.com`
    - VSMOV CDNs (`/vsmov|streamvsmov|p25\.streamvsmov/i`) -> `Referer: https://vsmov.com/`, `Origin: https://vsmov.com`
    - NguonC (`/nguonc\.com/i`) -> `Referer: https://phim.nguonc.com/`, `Origin: https://phim.nguonc.com`
    - StreamC (`/streamc\.|amass2\.top/i`) -> `Referer: https://embed15.streamc.xyz/`, `Origin: https://embed15.streamc.xyz`
    - Suutamphim/TVHay (`/suutamphim|tvhay/i`) -> `Referer: https://suutamphim.org/`, `Origin: https://suutamphim.org`
    - HH3D (`/hh3d|hoathinh3d/i`) -> `Referer: https://hh3d.tv/`, `Origin: https://hh3d.tv`
    - YAN (`/yanhh3d|yan/i`) -> `Referer: https://yanhh3d.org/`, `Origin: https://yanhh3d.org`
    - CLBPX (`/clbphimxua|clbpx/i`) -> `Referer: https://clbphimxua.com/`, `Origin: https://clbphimxua.com`
  - Dynamic `ref` / `referer` query parameter overrides upstream detection if provided.
  - User-Agent used is standard Chrome macOS (`HLS_UA`).

### 1.3 Breakdown of Existing Endpoints

| Endpoint Route | Aliases | Method | Description |
|---|---|---|---|
| `/hls/extract` | N/A | GET | Asynchronously parses embed URLs (NguonC/StreamC) at play-time via `extractM3u8FromEmbed`, returning a 302 redirect to `/hls/manifest.m3u8`. |
| `/hls/manifest.m3u8` | `/hls/m3u8` | GET | Fetches upstream M3U8 playlists, rewrites all child playlist/variant/audio/subtitle/segment/key URIs to route back through this proxy, caches for 300s in `m3u8Cache`. |
| `/hls/segment.ts` | `/hls/ts`, `/hls/segment` | GET | Streams upstream `.ts` / `.m4s` video segments, forwarding HTTP `Range` headers to support seeking with HTTP 206 Partial Content and setting `Cache-Control: public, max-age=31536000, immutable`. |
| `/hls/key` | `/hls/key.key` | GET | Fetches AES-128 decryption keys and forwards as `application/octet-stream` with `Cache-Control: no-cache, no-store`. |

*Note on `/hls/m3u8-proxy` and `/hls/ts-proxy`*: The canonical manifest route is `/hls/manifest.m3u8` and the canonical segment route is `/hls/segment.ts`. Route aliases `['/manifest.m3u8', '/m3u8', '/m3u8-proxy']` and `['/segment.ts', '/ts', '/segment', '/ts-proxy']` can be co-registered to ensure complete backward compatibility.

---

## 2. Requirements for `GET /hls/sub.vtt` Endpoint

### 2.1 Endpoint Specification
- **Route**: `router.get(['/sub.vtt', '/sub', '/subtitle.vtt'], ...)` inside `src/routes/hls.js`.
- **Full Path**: `GET /hls/sub.vtt`.

### 2.2 Query Parameters
- `url` (or `b64`, `sub`): Target upstream subtitle URL (either plain URL or Base64/Base64URL encoded).
- `ref` (or `referer`): Optional referer string or Base64/Base64URL encoded referer.
- Validation: If `targetUrl` cannot be resolved via `resolveParamUrl(req.query.url || req.query.b64 || req.query.sub)`, respond with HTTP 400 (`Missing url`).

### 2.3 Upstream Subtitle Fetching
- **Headers Sent Upstream**:
  ```javascript
  const { referer: refererUrl, origin } = getRefererHeaders(targetUrl, refParam);
  const upstreamHeaders = {
    'User-Agent': HLS_UA,
    Referer: refererUrl || 'https://vsmov.com/',
    Origin: origin || 'https://vsmov.com',
    Accept: '*/*',
  };
  ```
- **Axios Configuration**:
  - `method: 'GET'`
  - `responseType: 'text'`
  - `timeout: 15000` (15 seconds)
  - `maxRedirects: 5`
  - `validateStatus: (status) => status >= 200 && status < 400`

### 2.4 Response Headers
- `Content-Type: text/vtt; charset=utf-8`
- `Access-Control-Allow-Origin: *`
- `Access-Control-Allow-Headers: *`
- `Access-Control-Allow-Methods: GET, HEAD, OPTIONS`
- `Cache-Control: public, max-age=86400` (24 hours caching per R2)

### 2.5 SRT to WebVTT Detection and Conversion Logic
When upstream serves subtitle files, they may be formatted as either WebVTT (`.vtt`) or SubRip (`.srt`).

```javascript
/**
 * Convert SRT content to valid WebVTT format
 * - Handles BOM (\uFEFF)
 * - Normalizes line endings (\r\n -> \n)
 * - Converts comma timestamps to period timestamps (00:01:23,456 -> 00:01:23.456)
 * - Ensures WEBVTT header is present at the beginning
 */
function convertSrtToVtt(content) {
  if (!content || typeof content !== 'string') {
    return 'WEBVTT\n\n';
  }

  // 1. Strip UTF-8 Byte Order Mark (BOM)
  let clean = content.replace(/^\uFEFF/, '').trim();

  // 2. If already valid WebVTT, return directly (or normalized)
  if (clean.startsWith('WEBVTT')) {
    return clean;
  }

  // 3. Normalize CRLF to LF
  clean = clean.replace(/\r\n|\r/g, '\n');

  // 4. Convert SRT comma timestamp format: 00:01:20,123 --> 00:01:23,456
  clean = clean.replace(/(\d{2}:\d{2}:\d{2}),(\d{3})/g, '$1.$2');
  clean = clean.replace(/(\d{1,2}:\d{2}:\d{2}),(\d{3})/g, '$1.$2');
  clean = clean.replace(/(\d{2}:\d{2}),(\d{3})/g, '$1.$2');

  // 5. Prepend WEBVTT header
  return 'WEBVTT\n\n' + clean;
}
```

---

## 3. How `proxyBase` is Determined & Propagated

### 3.1 Determination in `src/handlers.js`
When Stremio requests stream options via `GET /stream/:type/:id.json`:
1. `handleStream(req, res)` extracts host and protocol taking reverse-proxy headers into account:
   ```javascript
   const proto = req.headers['x-forwarded-proto'] || req.protocol || 'http';
   const host  = req.headers['x-forwarded-host']  || req.get('host') || 'localhost:7000';
   const proxyBase = `${proto}://${host}`.replace(/\/$/, '');
   ```
2. Edge cases handled:
   - Trailing slashes stripped (`replace(/\/$/, '')`) to prevent double slashes.
   - Works behind reverse proxies (Nginx, Cloudflare, Render, Fly.io, Vercel) where `x-forwarded-proto` is `https`.
   - Works in local integration tests where `req.get('host')` is `127.0.0.1:<ephemeralPort>`.

### 3.2 Propagation to Providers
`proxyBase` is included in the query `payload`:
```javascript
const payload = { imdbId, type, title, year, genres, aliases, season, episode, slug, proxyBase };
```
Then each provider's `getStreams(payload)` receives `proxyBase`:
- `src/providers/vsmov.js`: Constructs stream URLs as `${proxyBase}/hls/manifest.m3u8?url=...&ref=...` and subtitle URLs as `${proxyBase}/hls/sub.vtt?url=...&ref=...`.
- `src/providers/kkphim.js`: Constructs stream URLs as `${proxyBase}/hls/manifest.m3u8?url=...&ref=...`.
- `src/providers/nguonc.js`: Constructs stream URLs as `${proxyBase}/hls/extract?embed=...`.
- `src/providers/stp.js`, `hh3d.js`, `yan.js`, `clbpx.js`: Construct stream URLs using `proxyBase`.

### 3.3 Playlist Rewriting in `src/routes/hls.js`
Inside `src/routes/hls.js` (`/manifest.m3u8`), `protoHost` is reconstructed from the incoming playlist request:
```javascript
const protoHost = `${req.headers['x-forwarded-proto'] || req.protocol}://${req.headers['x-forwarded-host'] || req.get('host')}`;
```
Every variant URI (`#EXT-X-STREAM-INF`), media rendition (`#EXT-X-MEDIA`), segment URI (`#EXTINF`), decryption key (`#EXT-X-KEY`), and init map (`#EXT-X-MAP`) is rewritten with `${protoHost}/hls/...`.

---

## 4. VSMOV Multi-Server Audio Separation & Subtitle Extraction

### 4.1 Empirical Findings from VSMOV API & Player Embeds
- **API Server Tabs**:
  - `GET https://vsmov.com/api/phim/<slug>` returns an `episodes` array where each element is a server group:
    - `Vietsub\r\n #1` or `Vietsub 4K`
    - `Lồng tiếng #1`
    - `Thuyết minh #1`
- **Embed Player Parsing**:
  - Fetching `link_embed` (`https://v5.streamvsmov.com/video/<videoHash>`) contains:
    - `baseUrl` & `videoHash` -> master playlist `${baseUrl}/stream/${videoHash}/master.m3u8`.
    - `playerOptions.subtitles`: JSON array containing WebVTT subtitle files (e.g. `{"name":"vie ...","url":"/video/.../subtitle/vie_....vtt","code":"vie"}`).
- **Audio Classification**:
  - Server names matching `/l.{1,5}ng ti.{1,5}ng/i` -> **Lồng Tiếng**
  - Server names matching `/thuy.{1,5}t minh/i` -> **Thuyết Minh**
  - All other servers / matching `/vietsub/i` -> **Vietsub**

### 4.2 Stream Object Specifications per R1
1. **Vietsub**:
   - `name`: `'VIP Movies 🎬'`
   - `title`: `[VIP 1 • VSMOV] Vietsub 4K Ultra HD (3840x2160)${epLabel} (HLS Proxy)\n⚡ Server VIP Vietsub • vsmov.com`
   - `url`: `${proxyBase}/hls/manifest.m3u8?url=${b64MasterUrl}&ref=${b64Ref}`
   - `subtitles`: `[{ id: 'vi_vsmov', lang: 'vie', url: `${proxyBase}/hls/sub.vtt?url=${b64Sub}&ref=${b64Ref}` }]` (if subtitle track present)
2. **Lồng Tiếng**:
   - `name`: `'VIP Movies 🎬'`
   - `title`: `[VIP 1 • VSMOV] Lồng Tiếng 4K Ultra HD (3840x2160)${epLabel} (HLS Proxy)\n⚡ Server VIP Lồng Tiếng • vsmov.com`
   - `url`: `${proxyBase}/hls/manifest.m3u8?url=${b64MasterUrl}&ref=${b64Ref}`
3. **Thuyết Minh**:
   - `name`: `'VIP Movies 🎬'`
   - `title`: `[VIP 1 • VSMOV] Thuyết Minh 4K Ultra HD (3840x2160)${epLabel} (HLS Proxy)\n⚡ Server VIP Thuyết Minh • vsmov.com`
   - `url`: `${proxyBase}/hls/manifest.m3u8?url=${b64MasterUrl}&ref=${b64Ref}`
4. **Strict Invariant**:
   - Every stream object contains `url` and `behaviorHints`.
   - Strictly omit `externalUrl` (in-app direct playback protocol).

---

## 5. Architectural Recommendations for Implementation

1. **In `src/routes/hls.js`**:
   - Add `router.get(['/sub.vtt', '/sub', '/subtitle.vtt'], async (req, res) => { ... })`.
   - Implement `convertSrtToVtt` helper for automatic SRT-to-WebVTT transformation.
   - Return required headers (`Content-Type: text/vtt; charset=utf-8`, `Cache-Control: public, max-age=86400`, CORS `*`).
   - Add route aliases `/m3u8-proxy` and `/ts-proxy` to manifest and segment handlers.

2. **In `src/providers/vsmov.js`**:
   - Enhance `resolveMasterPlaylistUrl` (or create `resolvePlayerMediaData`) to extract both `m3u8Url` and `subtitleUrl` from `link_embed` HTML in a single fetch.
   - Cache `subtitleUrl` alongside `m3u8Url` in `imdbCache` to eliminate redundant HTTP round-trips.
   - Iterate across all server entries in `episodes` without collapsing them, categorizing them into `Vietsub`, `Lồng Tiếng`, and `Thuyết Minh`.
   - Construct proxy subtitle URLs using `${proxyBase}/hls/sub.vtt?url=${b64Sub}&ref=${b64Ref}` and attach `subtitles: [{ id: 'vi_vsmov', lang: 'vie', url: proxySubUrl }]`.

3. **In `src/handlers.js`**:
   - Update stream prioritization in `getStreamPriority` so VSMOV Vietsub, Lồng Tiếng, and Thuyết Minh streams cleanly occupy priority brackets 10, 11, 12 ahead of KKPhim (30) and NguonC (50).
   - Ensure `subtitles` array in stream objects is preserved when sanitizing stream objects in `handleStream`.

4. **In `tests/verify_vsmov_sub_audio.js`**:
   - Stand up an ephemeral test server.
   - Query stream endpoints for Harry Potter (`tt0373889`) and series.
   - Assert >= 2 distinct VSMOV stream options (`Vietsub` and `Lồng Tiếng` / `Thuyết Minh`).
   - Fetch `/hls/sub.vtt` with subtitle proxy URL and verify HTTP 200, CORS `*`, and `WEBVTT` header.
   - Verify `externalUrl` is undefined across all stream objects.
