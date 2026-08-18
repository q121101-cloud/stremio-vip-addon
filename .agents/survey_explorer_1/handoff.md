# Handoff Report: Codebase Architecture & HLS Proxy Investigation

**Agent**: `survey_explorer_1`  
**Working Directory**: `/Users/quan/.gemini/antigravity/scratch/stremio-nguonc-addon/.agents/survey_explorer_1`  
**Target Milestone**: Survey / Requirement R1  
**Date**: 2026-08-18  

---

## 1. Observation

1. **Server Architecture & Entry Points**:
   - `src/index.js` (lines 62–87): Express application mounts `/hls` to `src/routes/hls.js`, root to `src/routes/manifest.js`, and Stremio addon routes to `src/handlers.js`.
   - `src/handlers.js` (lines 1479–1647): Implements `/stream/:type/:id.json`, running providers concurrently with `Promise.allSettled()` and 4000ms timeout. Enforces In-App protocol by removing `externalUrl` (`delete sanitized.externalUrl` at line 1614) and sorting streams: VSMOV 4K (Priority 10) → KKPhim (30/40) → NguonC (50/60) → STP (70) → HH3D (80) → YAN (90) → CLBPX (100).

2. **HLS Proxy Router (`src/routes/hls.js`)**:
   - **Relative Path Resolver** (lines 180–297):
     - `const absUrl = t.startsWith('http') ? t : new URL(t, baseUrl.href).href;` (line 286).
     - Resolves relative URIs in `#EXT-X-STREAM-INF` (line 212), `#EXT-X-MEDIA` (line 234), `#EXT-X-KEY` (line 249), `#EXT-X-MAP` (line 261), `#EXT-X-PRELOAD-HINT` / `#EXT-X-PART` (line 273), and segment lines (line 286).
   - **Base64URL Encoding & Decoding** (lines 81–110):
     - `decodeB64(str)` uses `Buffer.from(str, 'base64url').toString('utf8')` with fallback to `base64` (lines 84–92).
     - `Buffer.from(absUrl).toString('base64url')` is used consistently for rewrites (lines 213, 235, 250, 262, 274, 287, 301).
   - **Dynamic Referer & Origin Headers** (lines 27–67):
     - `getRefererHeaders(targetUrl, refParam)` checks `refParam` first (line 44), then matches against `SOURCE_REFERERS` table (lines 27–36), falling back to `new URL(targetUrl).origin` (line 62).
     - Covers VSMOV (`https://vsmov.com/`), KKPhim (`https://player.phimapi.com/`), NguonC (`https://phim.nguonc.com/`), StreamC (`https://embed15.streamc.xyz/`), STP (`https://sieutamphim.pro/`), YAN (`https://yanhh3d.pw/`), HH3D (`https://hh3d.tv/`), and CLBPX (`https://clbphimxua.info/`).
   - **High-Performance Stream & HTTP Range 206 Seeking** (lines 330–387):
     - `axios({ url: targetUrl, method: 'GET', responseType: 'stream', headers: upstreamHeaders, maxRedirects: 5 })` (lines 354–362).
     - Forwards client `req.headers.range` in `upstreamHeaders['Range']` (lines 349–351).
     - Sets `res.status(upstreamRes.status)` and passes through `Content-Range`, `Content-Length`, `Accept-Ranges` (lines 364–376).
     - Streams binary data with `upstreamRes.data.pipe(res)` (line 378).

3. **Subtitle & Key Proxies**:
   - `GET /hls/sub.vtt` (lines 427–504): Supports `data:` URIs and remote URLs, strips UTF-8 BOM (line 482), converts SRT comma timestamps to dot format (line 489), ensures `WEBVTT` header (line 493), returns `Content-Type: text/vtt; charset=utf-8` and CORS `*`.
   - `GET /hls/key` (lines 390–424): Fetches encryption keys using `responseType: 'arraybuffer'` and returns `application/octet-stream`.

4. **Empirical Test Verification**:
   - Command `node tests/verify_playback.js`: 7/7 Phases PASSED.
     - Phase 2: Harry Potter `tt0373889` returned 2 distinct VSMOV 4K streams (Vietsub + Lồng Tiếng / Thuyết Minh) with `/hls/sub.vtt` subtitle proxy.
     - Phase 4: KKPhim `tt0903747:1:1` resolved active `#EXTM3U` manifest (HTTP 200, no 404).
     - Phase 6: Downloaded real video segment of 7,447,877 bytes (7.27 MB), HTTP 200, Content-Type `video/MP2T`, MPEG-TS sync byte `0x47` verified.
     - Phase 7: Range request `bytes=0-1023` returned HTTP 206 Partial Content, `Content-Range: bytes 0-1023/7447877`, length 1024 bytes.
   - Command `node tests/verify_hotfix_vsmov_kkphim.js`: 27/27 assertions PASSED.
   - Command `node tests/verify_new_providers.js`: 26/26 assertions PASSED.

---

## 2. Logic Chain

1. **Premise 1 (Relative Path Resolution)**:
   - Upstream HLS playlists often contain relative segment URIs (e.g. `segment_001.ts`, `../key.key`, `/stream/master.m3u8`).
   - `src/routes/hls.js` line 286 uses `new URL(t, baseUrl.href).href` with `baseUrl = new URL(targetUrl)`. According to RFC 3986, this correctly resolves root-relative, parent-relative, and same-directory relative paths into canonical absolute URLs before encoding into base64url.

2. **Premise 2 (Base64URL Token Preservation)**:
   - Standard Base64 uses `+`, `/`, and `=` padding which conflict with URL query parameters and get truncated or corrupted.
   - `Buffer.from(str, 'base64url')` is used for all encodes and decodes in `hls.js`, `config.js`, and all providers. This safely preserves security query parameters (`?token=...&sign=...`) without corruption.

3. **Premise 3 (CDN Header Anti-403 Enforcement)**:
   - Upstream CDNs (such as `streamvsmov.com`, `phimapi.com`, `streamc.xyz`, `sieutamphim.pro`, `clbphimxua.info`, `yanhh3d.pw`) validate HTTP `Referer` and `Origin` headers to block hotlinking.
   - The HLS proxy router attaches correct dynamic `Referer` and `Origin` headers extracted from the `ref` query parameter or matching domain rules in `SOURCE_REFERERS`, successfully bypassing 403 Forbidden errors.

4. **Premise 4 (Streaming & Range Seeking 206)**:
   - Video streaming requires low latency (avoiding loading full 10MB–50MB segments in RAM) and fast seeking (HTTP 206 Range requests).
   - `responseType: 'stream'` combined with `.pipe(res)` and Range header forwarding fulfills both criteria with low RAM footprint and smooth seeking.

---

## 3. Caveats

1. **Provider Regex in `SOURCE_REFERERS`**:
   - `SOURCE_REFERERS[0]` for KKPhim currently uses pattern `/kkphimplayer|phim1280|phimapi\.com|kkphim/i`. While KKPhim stream URLs generated by `src/providers/kkphim.js` already embed `&ref=${encodeBase64('https://player.phimapi.com/')}`, adding `opstream|vlcdn` to the regex provides defense-in-depth if `ref` is ever omitted.
2. **Third-Party CDN Liveness**:
   - Upstream third-party CDNs (e.g. `vsmov.com`, `phimapi.com`, `streamc.xyz`) are external services. While tests currently pass against live CDNs and mock public MUX test streams, ISP-level routing or network downtime on external CDNs can cause temporary timeouts, which are properly isolated by the 4000ms timeout per provider.

---

## 4. Conclusion

The architecture of `stremio-nguonc-addon` and the HLS proxy implementation in `src/routes/hls.js` are in full compliance with **Requirement R1**:
- Relative path resolution via `new URL(uri, baseUrl.href).href` is robust and handles all HLS playlist structures (master, variant, media segments, keys, fMP4 maps, preload hints).
- Base64URL encoding/decoding preserves all query parameters and security tokens.
- Dynamic Referer and Origin headers for all 6+ providers (VSMOV, KKPhim, NguonC, STP, CLBPX, YAN, HH3D) prevent 403 CDN errors.
- Stream proxying with `responseType: 'stream'`, `maxRedirects: 5`, and HTTP Range 206 seeking operates reliably and has been empirically validated with >7.4MB chunk downloads.
- In-App protocol compliance (strictly `url`, no `externalUrl`) is enforced globally in `src/handlers.js`.

---

## 5. Verification Method

To independently reproduce and verify this investigation:

```bash
# 1. Syntax Check
node --check src/index.js
node --check src/routes/hls.js
node --check src/handlers.js

# 2. Comprehensive E2E Playback & Seeking Test
node tests/verify_playback.js

# 3. Hotfix & Subtitle Injection Verification
node tests/verify_hotfix_vsmov_kkphim.js

# 4. New Providers (STP, CLBPX, YAN) & Referer Routing Verification
node tests/verify_new_providers.js
```

### Invalidation Conditions
- Any failure in `node tests/verify_playback.js` or `node tests/verify_hotfix_vsmov_kkphim.js`.
- Any stream object returned by `/stream/...` containing `externalUrl`.
- Any segment request to `/hls/segment.ts` failing to return HTTP 200/206 or missing the `0x47` MPEG-TS sync byte.
