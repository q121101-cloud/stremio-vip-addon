# Handoff Report: Milestone 1 HLS Proxy Anti-403 & Full Segment Rewriter (R1)

**Agent**: HLS Proxy Implementation Worker (Milestone 1)  
**Working Directory**: `/Users/quan/.gemini/antigravity/scratch/stremio-nguonc-addon/.agents/worker_m1_hls`  
**Date**: 2026-08-17  
**Target Requirement**: R1 (HLS Proxy Anti-403 & Full Segment Rewriter in `src/routes/hls.js`)  

---

## 1. Observation

1. **`src/routes/hls.js` Implementation**:
   - Implemented `/hls/manifest.m3u8` (and `/m3u8`) with full line-by-line rewriting:
     - Master Playlist tags (`#EXT-X-STREAM-INF`, `#EXT-X-I-FRAME-STREAM-INF`, `#EXT-X-MEDIA`) rewritten to `/hls/manifest.m3u8?url=...&ref=...`.
     - Media Playlist tags (`#EXT-X-KEY` / `#EXT-X-SESSION-KEY`) rewritten to `/hls/key?url=...&ref=...`.
     - `#EXT-X-MAP`, `#EXT-X-PART`, `#EXT-X-PRELOAD-HINT` and all segment URI lines (TS, fMP4, .html, .png, etc.) rewritten to `/hls/segment.ts?url=...&ref=...`.
     - Response headers enforced: `Content-Type: application/vnd.apple.mpegurl; charset=utf-8`, `Access-Control-Allow-Origin: *`, `Cache-Control: no-cache, no-store, must-revalidate`.
   - Implemented `/hls/segment.ts` (and aliases `/ts`, `/segment`):
     - Pipes binary TS video chunks from upstream CDNs.
     - Supports HTTP Range requests (`206 Partial Content`), forwards `Range` header to upstream, and passes `Content-Range`, `Content-Length`, and `Accept-Ranges: bytes` back to the client.
     - Response headers enforced: `Content-Type: video/MP2T`, `Access-Control-Allow-Origin: *`, `Cache-Control: public, max-age=31536000, immutable`.
   - Implemented `/hls/key` (and alias `/key.key`):
     - Proxies decryption keys with upstream Referer and Origin headers.
     - Response headers enforced: `Content-Type: application/octet-stream`, `Access-Control-Allow-Origin: *`, `Cache-Control: no-cache, no-store`.
   - Implemented `/hls/extract`:
     - Extracts M3U8 from embed URLs via `extractM3u8FromEmbed()` and 302 redirects to `/hls/manifest.m3u8` with Base64URL-encoded parameters.
   - Comprehensive Referer/Origin resolver `getRefererHeaders()` supporting KKPhim, VSMOV, NguonC, StreamC/Amass2, Suutamphim/TVHay, HH3D, YAN, CLBPX, and dynamic `ref` overrides.
   - Robust decoding `resolveParamUrl()` supporting Base64URL, standard Base64, and plain raw URLs.

2. **Test Executions & Results**:
   - `node --check src/routes/hls.js`: Exit Code 0 (clean syntax).
   - `node tests/test_hls_worker_m1.js`: 6/6 tests passed (OPTIONS preflight, Master playlist rewriting, Media playlist rewriting, 64KB video segment download with `video/MP2T` & sync byte `0x47`, HTTP 206 Range request, AES key proxying).
   - `node tests/test_live_kkphim_proxy.js`: 100% PASS (946,204 bytes live segment download with HTTP 200).
   - `node tests/test_kkphim_playback.js`: 3/3 test cases passed (Stream generation, manifest proxying, segment binary delivery >50KB with `0x47` sync byte).
   - `node tests/challenger_m1_adversarial.test.js`: 23/23 tests passed.

---

## 2. Logic Chain

1. **Parameter Parsing & Anti-403 Headers**:
   - Query parameter `url` (or `b64`) and `ref` (or `referer`) are parsed with `resolveParamUrl()`, which safely inspects whether input is already a valid URL or Base64URL/standard Base64.
   - `getRefererHeaders()` determines the exact upstream `Referer` and `Origin` required to prevent HTTP 403 Forbidden hotlink blocks across all target streaming providers.

2. **Playlist Traversal & Rewriting**:
   - Lines in M3U8 playlists are parsed line by line.
   - Master Playlists: Sub-manifests and variant tracks (video, audio, subtitles) are resolved to absolute URLs against `baseUrl` and rewritten to `/hls/manifest.m3u8?url=...&ref=...`.
   - Media Playlists: Decryption keys are routed to `/hls/key?url=...&ref=...`, while initialization maps (`#EXT-X-MAP`), low-latency parts (`#EXT-X-PART`), and segment URIs are routed to `/hls/segment.ts?url=...&ref=...`.

3. **Binary Streaming & Seeking Support**:
   - For `/hls/segment.ts`, client `Range` headers are forwarded upstream via axios with `validateStatus: (s) => s >= 200 && s < 400`.
   - The upstream HTTP status (e.g. 206 Partial Content or 200 OK) is preserved, along with `Content-Range`, `Content-Length`, and `Accept-Ranges: bytes`.
   - Streams are piped directly via `upstreamRes.data.pipe(res)` for optimal throughput and zero memory overhead.

---

## 3. Caveats

1. **Upstream CDN Latency**:
   - Live stream segment fetching depends on upstream network speed; timeouts are set to 15s for manifests and 25s for segment chunk pipes.
2. **Upstream Obfuscation**:
   - Some CDNs disguise MPEG-TS packets as `.png` or `.html`. Serving them with `Content-Type: video/MP2T` guarantees native demuxer playback in Stremio/ExoPlayer/VLC.

---

## 4. Conclusion

- Requirement R1 (`src/routes/hls.js`) has been fully implemented, adhering to all specifications: `/hls/manifest.m3u8`, `/hls/segment.ts`, `/hls/key`, `/hls/extract`, Range request handling, Base64URL encoding, and strict CORS/MIME headers.
- All syntax checks and test suites pass 100%.

---

## 5. Verification Method

To independently verify:
```bash
# 1. Syntax check
node --check src/routes/hls.js

# 2. Run Worker M1 unit test suite
node tests/test_hls_worker_m1.js

# 3. Run Live E2E playback tests
node tests/test_live_kkphim_proxy.js
node tests/test_kkphim_playback.js
```
