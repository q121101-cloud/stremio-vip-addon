# Milestone 1 (HLS Proxy & Full Segment Rewriter R1) — Reviewer 2 Report

## 1. Observation

Direct inspection of `src/routes/hls.js`, `ORIGINAL_REQUEST.md`, and execution of verification and stress tests revealed the following:

- **Source Code Verification (`src/routes/hls.js`)**:
  - `getRefererHeaders()` (lines 42–66) maps domain regex patterns to appropriate upstream `Referer` and `Origin` headers for KKPhim (`https://player.phimapi.com/`), VsMov (`https://vsmov.com/`), NguonC (`https://phim.nguonc.com/`), StreamC (`https://embed15.streamc.xyz/`), and specialized providers (Suutamphim, HH3D, YAN, CLBPX). Dynamic `ref` query parameters are normalized and prioritized.
  - `/hls/manifest.m3u8` (lines 145–274) processes Master and Media playlists line-by-line:
    - Rewrites variant streams (`#EXT-X-STREAM-INF` up to 4K, `#EXT-X-I-FRAME-STREAM-INF`) and rendition playlists (`#EXT-X-MEDIA:TYPE=AUDIO/SUBTITLES`) to `/hls/manifest.m3u8?url=...&ref=...`.
    - Rewrites AES-128 encryption key tags (`#EXT-X-KEY` and `#EXT-X-SESSION-KEY`) to dedicated endpoint `/hls/key?url=...&ref=...`.
    - Rewrites initialization maps (`#EXT-X-MAP`), low-latency parts (`#EXT-X-PART`, `#EXT-X-PRELOAD-HINT`), and standard TS segments (`#EXTINF` followed by `.ts`, `.png`, `.bin`, or query strings) to `/hls/segment.ts?url=...&ref=...`.
    - Sets mandatory response headers: `Content-Type: application/vnd.apple.mpegurl; charset=utf-8`, `Access-Control-Allow-Origin: *`, `Cache-Control: no-cache, no-store, must-revalidate`.
    - Implements LRU caching via `m3u8Cache` (TTL 300s) to minimize redundant upstream requests.
  - `/hls/segment.ts` (lines 276–334):
    - Passes `Range` header from incoming request to upstream CDN when present.
    - Streams raw binary data via Axios `responseType: 'stream'` piped directly to `res`.
    - Propagates HTTP status code (`200 OK` or `206 Partial Content`) and forwards `Content-Range`, `Content-Length`, and `Accept-Ranges`.
    - Sets `Content-Type: video/MP2T`, `Access-Control-Allow-Origin: *`, and `Cache-Control: public, max-age=31536000, immutable`.
    - Implements stream error event listener `upstreamRes.data.on('error')` and global try/catch returning `HTTP 502` on upstream failures.
  - `/hls/key` (lines 336–371): Proxies raw decryption key byte arrays (`application/octet-stream`) with upstream origin/referer headers.
  - `/hls/extract` (lines 118–142): Resolves embed URLs to m3u8 playlists via `extractM3u8FromEmbed()` and issues HTTP 302 redirect to `/hls/manifest.m3u8`.

- **Test Execution Results**:
  - `node tests/test_hls_worker_m1.js`: Passed 6/6 test suites (OPTIONS Preflight, Master M3U8 Rewriting, Media M3U8 Rewriting, Segment Proxying >50KB & sync byte 0x47, HTTP Range 206, Key Proxying).
  - `node tests/verify_playback.js`: Passed all 6 phases cleanly in 4.14s:
    - Phase 1: Manifest integrity check passed.
    - Phase 2 & 3: Movie and series stream resolution strictly compliant (in-app `/hls/` URLs, zero `externalUrl`).
    - Phase 4: Full M3U8 traversal and variant rewriting verified.
    - Phase 5: Real live video TS segment (946,204 bytes / 924 KB) downloaded with HTTP 200 and MPEG-TS sync byte `0x47` confirmed at 188-byte intervals.
    - Phase 6: HTTP Range request returned HTTP 206 Partial Content with 1024 bytes.
  - Adversarial Test Suite `tests/test_hls_adversarial_m1_2.js`: Passed 7/7 stress tests covering audio/sub renditions, unquoted URIs, relative dot segments (`../`), disguised image segments (`.png`, `.bin`), exact 16-byte AES-128 key binary delivery, multi-range seeking (`0-2047`, `65536-131071`), and upstream error simulations (400 on missing params, 502 on upstream 404/500).

- **Integrity Assessment**:
  - Zero hardcoded test values, dummy stubs, or fake mocks in `src/routes/hls.js`.
  - Genuine binary chunk downloads and real stream forwarding verified against live upstream CDNs.

## 2. Logic Chain

1. **Anti-403 Referer Spoofing**: `getRefererHeaders()` validates dynamic `ref` overrides and checks regex patterns against target URLs before falling back to target origin. This satisfies anti-hotlinking requirements across KKPhim, VsMov, NguonC, StreamC, and other CDNs.
2. **M3U8 Tag Parsing & RFC 8216 Compliance**: Line-by-line parsing accurately isolates `#EXT-X-STREAM-INF`, `#EXT-X-MEDIA`, `#EXT-X-KEY`, `#EXT-X-MAP`, and `#EXTINF` tags. All relative URLs (`./`, `../`, `/`) are correctly resolved against `baseUrl.href` into absolute URLs prior to Base64URL encoding, preventing 404 errors during client segment resolution.
3. **Range Seeking & Binary Delivery**: `/hls/segment.ts` forwards `req.headers.range`, enabling standard video players (ExoPlayer, AVPlayer, VLC, browser HLS.js) to perform byte-range seeks with `206 Partial Content`.
4. **Streaming Error Handling**: Catching network errors and attaching stream error handlers (`upstreamRes.data.on('error')`) prevents unhandled rejections and process termination during upstream timeouts or aborted client connections.

## 3. Caveats

- Upstream CDN URLs occasionally undergo domain rotation. The regex patterns in `SOURCE_REFERERS` cover current known domains, and dynamic `refParam` provides runtime extensibility.
- External embed providers (e.g. legacy NguonC embed hosts) can experience intermittent external latency or rate limiting, but the proxy layer handles errors with clean HTTP 502 responses.

## 4. Conclusion

**Verdict: APPROVE**

The implementation in `src/routes/hls.js` fully satisfies all Milestone 1 (R1) requirements:
- Anti-403 Referer & Origin spoofing across all major CDNs.
- Complete M3U8 rewriting for Master Playlists (4K, audio, subtitles), Media Playlists (AES-128 keys, fMP4 maps, LL-HLS parts, segments).
- Range 206 seeking support with proper header propagation.
- Robust error handling and zero integrity violations.

## 5. Verification Method

To independently verify these findings:

```bash
# 1. Run Worker M1 unit tests
node tests/test_hls_worker_m1.js

# 2. Run adversarial stress testing suite
node tests/test_hls_adversarial_m1_2.js

# 3. Run mandatory R6 E2E playback verification (live >50KB TS segment download with HTTP 200 & Range 206)
node tests/verify_playback.js

# 4. Syntax validation
node --check src/routes/hls.js
```
