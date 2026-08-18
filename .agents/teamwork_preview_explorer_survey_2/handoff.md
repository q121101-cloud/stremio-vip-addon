# Handoff Report — Survey 2: HLS Routes, Subtitle Proxy & Multi-Server Audio Architecture

## 1. Observation

### 1.1 HLS Routing & Proxy Mechanism
- **Router Location**: `src/routes/hls.js`, mounted at `/hls` in `src/index.js` (line 64-65: `const hlsRouter = require('./routes/hls'); app.use('/hls', hlsRouter);`).
- **Existing Routes**:
  - `GET /extract` (`src/routes/hls.js:118`): Resolves embed page asynchronously and 302-redirects to `/hls/manifest.m3u8`.
  - `GET /manifest.m3u8`, `GET /m3u8` (`src/routes/hls.js:145`): Rewrites master and media playlists, key URIs, segment URIs, sub-playlists, and sets `Content-Type: application/vnd.apple.mpegurl; charset=utf-8`, `Cache-Control: no-cache, no-store, must-revalidate`.
  - `GET /segment.ts`, `GET /ts`, `GET /segment` (`src/routes/hls.js:277`): Streams TS segments with HTTP 206 `Range` header forwarding, `Content-Type: video/MP2T`, and `Cache-Control: public, max-age=31536000, immutable`.
  - `GET /key`, `GET /key.key` (`src/routes/hls.js:337`): Proxies AES-128 keys as `application/octet-stream`.
- **Anti-403 Headers**: `getRefererHeaders(targetUrl, refParam)` in `src/routes/hls.js:42-66` maps VSMOV patterns (`/vsmov|streamvsmov|p25\.streamvsmov/i`) to `Referer: https://vsmov.com/`, `Origin: https://vsmov.com`.
- **Parameter Resolution**: `resolveParamUrl(val)` in `src/routes/hls.js:100-109` handles plain URLs, Base64URL, and standard Base64.

### 1.2 Subtitle Discovery & Upstream Format
- **VSMOV Embed Probing (`https://v5.streamvsmov.com/video/382f09db-83ff-4d89-9be9-797162d4f2e6`)**:
  - Script 4 contains:
    ```javascript
    const playerOptions = {
        logo: "",
        subtitles: [{"name":"vie 1785240078185 txr9be","type":"local","url":"/video/382f09db-83ff-4d89-9be9-797162d4f2e6/subtitle/vie_1785240078185_txr9be.vtt","_inSubtitleFolder":true,"code":"vie"},{"name":"eng 1785240078193 wwa5ps","type":"local","url":"/video/382f09db-83ff-4d89-9be9-797162d4f2e6/subtitle/eng_1785240078193_wwa5ps.vtt","_inSubtitleFolder":true,"code":"eng"}],
        ...
    };
    ```
  - Direct fetch of `https://v5.streamvsmov.com/video/382f09db-83ff-4d89-9be9-797162d4f2e6/subtitle/vie_1785240078185_txr9be.vtt` returned HTTP 200 with `Content-Type: text/vtt; charset=utf-8` and body starting with `WEBVTT`.

### 1.3 ProxyBase Construction & Propagation
- **Extraction**: In `src/handlers.js:828`:
  ```javascript
  const proxyBase = `${req.headers['x-forwarded-proto'] || req.protocol}://${req.headers['x-forwarded-host'] || req.get('host')}`.replace(/\/$/, '');
  ```
- **Propagation**: Passed to providers via `payload.proxyBase` in `src/handlers.js:920` and `provider.getStreams(payload)`.
- **Usage in Providers**: Used to construct stream URLs (`${proxyBase}/hls/manifest.m3u8?url=...&ref=...`) and subtitle URLs (`${proxyBase}/hls/sub.vtt?url=...&ref=...`).
- **Usage in Router**: In `src/routes/hls.js:155`, `protoHost` is constructed similarly to rewrite child M3U8 lines.

---

## 2. Logic Chain

1. **Step 1 — Subtitle Endpoint Requirement**:
   Per R2 in `ORIGINAL_REQUEST.md`, `src/routes/hls.js` needs an endpoint `GET /sub.vtt` that receives `url` (and optional `ref`), fetches upstream subtitle files with `Referer: https://vsmov.com/`, `Origin: https://vsmov.com`, `User-Agent: HLS_UA`, and returns headers `Content-Type: text/vtt; charset=utf-8`, CORS `*`, and `Cache-Control: public, max-age=86400`.
2. **Step 2 — SRT to WebVTT Conversion**:
   Upstream subtitles may be provided in either WebVTT format (starting with `WEBVTT`) or SRT format (timestamps delimited by comma `00:00:00,000` without a `WEBVTT` header). A conversion utility (`convertSrtToVtt`) strips BOM, replaces comma timestamp decimals with periods (`$1.$2`), normalizes line breaks, and prepends `WEBVTT\n\n` when absent.
3. **Step 3 — Multi-Server Separation in VSMOV**:
   Empirical testing of `https://vsmov.com/api/phim/<slug>` demonstrated that movies (e.g. Harry Potter `tt0373889`) contain multiple server groups (`Vietsub #1`, `Lồng tiếng #1`, `Thuyết minh #1`). Instead of generic server headers, `src/providers/vsmov.js` must classify each server:
   - `/vietsub/i` -> Vietsub stream title format
   - `/l.{1,5}ng ti.{1,5}ng/i` -> Lồng Tiếng stream title format
   - `/thuy.{1,5}t minh/i` -> Thuyết Minh stream title format
4. **Step 4 — Subtitle Attachment in Stream Objects**:
   When parsing the player embed HTML, extract `playerOptions.subtitles` (or regex `subtitles:\s*(\[[^\]]+\])`). If a Vietnamese subtitle URL exists, resolve its absolute URL, wrap it in `${proxyBase}/hls/sub.vtt?url=${encodeBase64(absUrl)}&ref=${encodeBase64('https://vsmov.com/')}`, and attach `subtitles: [{ id: 'vi_vsmov', lang: 'vie', url: proxySubUrl }]` to the stream object.
5. **Step 5 — Preservation of Invariants**:
   Strictly maintain `url` on all stream objects and ensure `externalUrl` is omitted to preserve the In-App Direct Play protocol.

---

## 3. Caveats

- **Caveat 1 — Subtitle availability**: Not all VSMOV titles or audio tracks have external subtitles (e.g. Lồng Tiếng streams have hardcoded or dubbed audio with no separate subtitle track). The subtitle field should be conditionally attached only when a subtitle URL is discovered.
- **Caveat 2 — Upstream character encoding**: Some legacy Vietnamese SRT subtitles may use UTF-8 or Windows-1258 encoding. Standardizing on UTF-8 string decoding handles modern upstream sources seamlessly.
- **No further caveats.**

---

## 4. Conclusion

1. Implement `GET /hls/sub.vtt` in `src/routes/hls.js` with parameter resolution, anti-403 upstream headers, SRT-to-WebVTT parsing, CORS `*`, `text/vtt`, and 86400s caching.
2. Add route aliases `['/manifest.m3u8', '/m3u8', '/m3u8-proxy']` and `['/segment.ts', '/ts', '/segment', '/ts-proxy']` in `src/routes/hls.js`.
3. Update `src/providers/vsmov.js` to extract all server tabs (`Vietsub`, `Lồng Tiếng`, `Thuyết Minh`), extract WebVTT/SRT subtitles from player embed options, and return distinct stream objects with attached `subtitles` array.
4. Ensure `handleStream` in `src/handlers.js` passes through the `subtitles` property and prioritizes VSMOV separated streams (brackets 10-20).

---

## 5. Verification Method

To independently verify the architecture and behavior:
1. Run syntax verification:
   ```bash
   node --check src/index.js
   node --check src/routes/hls.js
   node --check src/providers/vsmov.js
   node --check src/handlers.js
   ```
2. Run standard integration tests:
   ```bash
   npm test
   ```
3. Run E2E multi-server & subtitle verification (once implemented):
   ```bash
   node tests/verify_vsmov_sub_audio.js
   ```
4. Query subtitle endpoint directly:
   ```bash
   curl -I "http://localhost:7000/hls/sub.vtt?url=aHR0cHM6Ly92NS5zdHJlYW12c21vdi5jb20vdmlkZW8vMzgyZjA5ZGItODNmZi00ZDg5LTliZTktNzk3MTYyZDRmMmU2L3N1YnRpdGxlL3ZpZV8xNzg1MjQwMDc4MTg1X3R4cjliZS52dHQ"
   ```
   Verify HTTP 200, `Content-Type: text/vtt; charset=utf-8`, and `Access-Control-Allow-Origin: *`.
