# Handoff Report: HLS Proxy & Streaming Architecture Survey

**Author**: Survey Explorer 1 (HLS Proxy & Streaming Architecture)  
**Date**: 2026-08-18  
**Working Directory**: `/Users/quan/.gemini/antigravity/scratch/stremio-nguonc-addon/.agents/explorer_survey_hls/`  
**Handoff Type**: Soft Handoff (Survey Phase Complete)

---

## 1. Observation

### 1.1 HLS Router Code Structure (`src/routes/hls.js`)
1. **Source Referer Pattern Definitions (`src/routes/hls.js:27-36`)**:
   ```javascript
   const SOURCE_REFERERS = [
     { pattern: /kkphimplayer|phim1280|phimapi\.com|kkphim|opstream|vlcdn/i, referer: 'https://player.phimapi.com/', origin: 'https://player.phimapi.com' },
     { pattern: /vsmov|streamvsmov|p25\.streamvsmov/i,        referer: 'https://vsmov.com/',           origin: 'https://vsmov.com' },
     { pattern: /nguonc\.com/i,                               referer: 'https://phim.nguonc.com/',     origin: 'https://phim.nguonc.com' },
     { pattern: /streamc\.|amass2\.top/i,                     referer: 'https://embed15.streamc.xyz/', origin: 'https://embed15.streamc.xyz' },
     { pattern: /sieutamphim|suutamphim|tvhay/i,              referer: 'https://sieutamphim.pro/',     origin: 'https://sieutamphim.pro' },
     { pattern: /yanhh3d|yan|fbcdn\.cloud|defifa\.com/i,      referer: 'https://yanhh3d.pw/',          origin: 'https://yanhh3d.pw' },
     { pattern: /hh3d|hoathinh3d/i,                           referer: 'https://hh3d.tv/',             origin: 'https://hh3d.tv' },
     { pattern: /clbphimxua|clbpx/i,                          referer: 'https://clbphimxua.info/',     origin: 'https://clbphimxua.info' },
   ];
   ```
2. **Base64URL & Base64 Decoding (`src/routes/hls.js:80-110`)**:
   - `decodeB64(str)` checks `Buffer.from(str, 'base64url')` then `Buffer.from(str, 'base64')`.
   - `resolveParamUrl(val)` handles `http://`, `https://`, `data:`, and Base64-encoded URL strings.
3. **Master & Media Playlist Rewriting (`src/routes/hls.js:180-297`)**:
   - Computes `baseUrl = new URL(targetUrl)`.
   - Master variant tags (`#EXT-X-STREAM-INF`, `#EXT-X-I-FRAME-STREAM-INF`, `#EXT-X-MEDIA`) are rewritten to `${protoHost}/hls/manifest.m3u8?url=${b64Url}&ref=${encodedRef}`.
   - Decryption keys (`#EXT-X-KEY`, `#EXT-X-SESSION-KEY`) are rewritten to `${protoHost}/hls/key?url=${b64Key}&ref=${encodedRef}`.
   - Initialization maps (`#EXT-X-MAP`), parts (`#EXT-X-PART`), and preload hints (`#EXT-X-PRELOAD-HINT`) are rewritten to `${protoHost}/hls/segment.ts?url=${b64Map}&ref=${encodedRef}`.
   - Segment lines (`#EXTINF` followed by URI line) resolve `new URL(t, baseUrl.href).href` and wrap into `${protoHost}/hls/segment.ts?url=${b64Url}&ref=${encodedRef}`.
4. **Segment Proxy Route (`src/routes/hls.js:329-387`)**:
   - Express route handlers on `['/segment.ts', '/ts', '/segment', '/ts-proxy']`.
   - Response headers: `Content-Type: video/MP2T`, `Access-Control-Allow-Origin: *`, `Cache-Control: public, max-age=31536000, immutable`, `Accept-Ranges: bytes`.
   - Upstream request forwards `Range` header and responds with `HTTP 206 Partial Content` when range is requested.
   - Axio config: `responseType: 'stream'`, `timeout: 25000`, `maxRedirects: 5`.

### 1.2 Test Execution Results
- `node tests/challenger_m1_2_deep_hls.test.js`:
  - **104 tests passed, 0 failed (100% PASS)**.
  - Verified 4K (3840x2160), audio/subtitle renditions, relative URL parent resolution (`../parent_segment_1003.ts`), real live stream playback (`cuu-mon`), MPEG-TS 0x47 sync byte, and 30 concurrent load requests.
- `npm test`:
  - **50 tests passed, 0 failed (100% PASS)**.
- `node --check src/index.js`:
  - Syntax check returned exit code 0.

---

## 2. Logic Chain

1. **Premise 1**: Korean and Western movies frequently employ multi-level HLS stream hierarchies where the master manifest points to sub-variant manifests in nested subdirectories (e.g. `/20230929/a3nZqLHv/2000kb/hls/index.m3u8`), and the sub-variant contains relative segment filenames (`gESUP0F0.ts`).
2. **Premise 2**: If the segment URL is resolved against the top-level master manifest instead of the sub-variant manifest, the path is missing intermediate directories (`/2000kb/hls/`), resulting in HTTP 404 on the CDN.
3. **Deduction 1**: In `src/routes/hls.js`, rewriting variant URIs to `/hls/manifest.m3u8?url=${encodeBase64Url(subVariantUrl)}` forces the client to request the sub-variant through the proxy.
4. **Deduction 2**: When the sub-variant is fetched, `baseUrl` is constructed from `targetUrl` (the sub-variant URL), so `new URL(line, baseUrl.href)` resolves relative segments accurately to `https://s1.phim1280.tv/20230929/a3nZqLHv/2000kb/hls/gESUP0F0.ts`.
5. **Deduction 3**: Live empirical test `tests/challenger_m1_2_deep_hls.test.js` successfully downloaded a real 924 KB chunk with 0x47 sync byte via this exact resolution chain, proving zero 404 errors.

---

## 3. Caveats

1. **Upstream CDN Availability**: Real CDN playback tests depend on external network access and live stream uptime on third-party provider servers (`phimapi.com`, `phim1280.tv`, `vsmov.com`, `streamc.xyz`, etc.).
2. **Stream Piping vs ArrayBuffer Memory Consumption**: Streaming via `stream.pipe` is more memory efficient than `responseType: 'arraybuffer'` under high concurrent user load, while `arraybuffer` provides simpler sync byte inspection in tests. The current implementation in `src/routes/hls.js` uses `responseType: 'stream'` with full HTTP 206 Range support.

---

## 4. Conclusion

1. The HLS proxy architecture (`src/routes/hls.js`) is robust, fully implementing multi-level parent resolution, polymorphic Base64 URL decoding, comprehensive Referer/Origin header spoofing for all 6+ providers, AES-128 key proxying, and streaming byte range seeking (HTTP 206).
2. The current implementation passes 100% of integration and deep adversarial test suites (104/104 deep HLS tests + 50/50 integration tests).
3. The remaining work for the milestone involves ensuring downstream providers (STP, CLBPX, YAN) and search algorithms (R2, R3) are integrated with versioning and E2E playback verification (R4, R5).

---

## 5. Verification Method

To independently verify these findings, run:

```bash
# 1. Run HLS deep adversarial test suite (104 assertions)
node tests/challenger_m1_2_deep_hls.test.js

# 2. Run Forensic HLS integrity audit
node tests/forensic_hls_audit.js

# 3. Run full project integration test suite (50 assertions)
npm test

# 4. Check syntax of entry point
node --check src/index.js
```
