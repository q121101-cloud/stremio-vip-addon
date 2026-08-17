# Milestone 2 Challenger 1 Empirical Verification Report

## 1. Observation

### Source Code Inspection (`src/routes/hls.js`)
- **User-Agent Header** (Line 29): Configured to `'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36'`
- **Provider & CDN Referer Mappings** (Lines 35-40):
  ```javascript
  const SOURCE_REFERERS = [
    { pattern: /kkphimplayer|phim1280|phimapi\.com|kkphim/i, referer: 'https://player.phimapi.com/', origin: 'https://player.phimapi.com' },
    { pattern: /nguonc\.com/i,                               referer: 'https://phim.nguonc.com/',     origin: 'https://phim.nguonc.com' },
    { pattern: /vsmov|streamvs/i,                            referer: 'https://vsmov.com/',           origin: 'https://vsmov.com' },
    { pattern: /streamc\./i,                                 referer: 'https://streamc.online/',      origin: 'https://streamc.online' },
  ];
  ```
- **Dynamic `ref` Prioritization** (Lines 47-58): `getRefererHeaders(targetUrl, refParam)` checks `refParam` first, automatically prepends `https://` if protocol is missing, extracts `new URL(parsedRef).origin`, and falls back to regex matching against `SOURCE_REFERERS`.
- **CORS & Preflight** (Lines 79-83, 121-124):
  - Sets `Access-Control-Allow-Origin: *`, `Access-Control-Allow-Headers: *`, `Access-Control-Allow-Methods: GET, HEAD, OPTIONS`.
  - Wildcard `OPTIONS *` route returns HTTP 204 with CORS headers.
- **HLS M3U8 Tag Rewriter** (Lines 203-272):
  - `#EXT-X-STREAM-INF` & `#EXT-X-I-FRAME-STREAM-INF`: Sets state `isNextSubPlaylist = true`, rewriting subsequent variant URIs to `/hls/manifest.m3u8?url=...&ref=...`.
  - `#EXT-X-MEDIA`: Rewrites both audio and subtitle track URIs to `/hls/manifest.m3u8?url=...&ref=...`.
  - `#EXT-X-KEY` & `#EXT-X-SESSION-KEY`: Rewrites AES encryption key URIs to `/hls/ts?url=...&ref=...&is_key=1`.
  - `#EXT-X-MAP`: Rewrites fMP4 initialization map URIs to `/hls/ts?url=...&ref=...`.
  - `#EXT-X-PART` & `#EXT-X-PRELOAD-HINT`: Rewrites Low-Latency HLS partial chunk URIs to `/hls/ts?url=...&ref=...`.
  - `#EXTINF` & segment lines: Rewrites TS media chunks (both relative and absolute) to `/hls/ts?url=...&ref=...`.
- **MIME Type Enforcement & Stream Piping** (Lines 163, 287-338):
  - Manifest route sets `Content-Type: application/vnd.apple.mpegurl; charset=utf-8`.
  - Segment route sets `Content-Type: video/mp2t` (or `application/octet-stream` if `is_key=1` or `.key`), overriding CDN dummy content types (such as `image/png`).
  - Pipes upstream binary stream to response with `r.data.pipe(res)` and attaches error listeners.

### Empirical Test Execution (`tests/hls_challenger_empirical.test.js`)
- Executed 21 empirical adversarial test cases covering master playlists, nested sub-playlists, byte-range segments, DRM encryption keys, initialization maps, dynamic referer precedence, CORS preflight, parameter encodings, cache hit behavior, reverse proxy forwarded headers, and error handling.
- Command: `node tests/hls_challenger_empirical.test.js`
- Test Output:
  ```
  ╔═════════════════════════════════════════════════════════════════════════════╗
  ║   ⚔️  VIP MOVIES ADDON — M2 EMPIRICAL CHALLENGER: HLS PROXY ANTI-403         ║
  ║   Empirical verification of src/routes/hls.js with Mock CDN & Adversarial   ║
  ╚═════════════════════════════════════════════════════════════════════════════╝

  --- Section 1: CORS & Preflight Verification ---
    ✅ PASS: OPTIONS preflight wildcard request returns 204 with CORS headers

  --- Section 2: Master Playlist Rewriting & Tag Parsing ---
    ✅ PASS: Master playlist rewrites stream variants, i-frames, audio, and subtitles to proxy URLs

  --- Section 3: Media Sub-Playlist, Key, Map & Segment Rewriting ---
    ✅ PASS: Media sub-playlist rewrites segments, AES-128 keys, init maps, and low-latency parts

  --- Section 4: Upstream Anti-403 Header Injection Invariants ---
    ✅ PASS: Upstream headers match KKPhim anti-403 specs (Referer, Origin, Chrome 126 Macintosh UA)
    ✅ PASS: Automatic regex detection for KKPhim CDN patterns when ref is omitted
    ✅ PASS: NguonC, VsMov and StreamC CDN domain pattern detection

  --- Section 5: Segment Streaming & MIME Type Overrides ---
    ✅ PASS: Segment proxy /hls/ts streams binary data and forces video/mp2t MIME type despite upstream image/png
    ✅ PASS: Key proxy /hls/ts with is_key=1 returns application/octet-stream

  --- Section 6: Parameter Encodings & Query Formats ---
    ✅ PASS: Accepts both Base64URL, standard Base64, and raw plaintext URLs in ?url and ?b64

  --- Section 7: Adversarial Resiliency & Error Handling ---
    ✅ PASS: Missing url parameter returns HTTP 400 Bad Request
    ✅ PASS: Upstream 403 Forbidden returns HTTP 502 without crashing server
    ✅ PASS: Upstream 500 Internal Error returns HTTP 502 without crashing server
    ✅ PASS: Malformed base64 / non-url input handled gracefully with error status
    ✅ PASS: m3u8 caching returns cached content on identical request without second upstream fetch
    ✅ PASS: Forwarded headers (x-forwarded-proto & x-forwarded-host) respected for reverse proxies

  --- Section 8: Advanced Stress & Edge Cases ---
    ✅ PASS: Rewrites multi-audio, multi-subtitle renditions with unquoted and quoted URIs
    ✅ PASS: Rewrites DRM Session Key (#EXT-X-SESSION-KEY) tag properly
    ✅ PASS: Dynamic ref query parameter overrides domain pattern and handles protocol prepend
    ✅ PASS: Resolves complex relative paths with dot segments (../../segments/01.ts)
    ✅ PASS: Key rotation with multiple #EXT-X-KEY tags throughout media playlist
    ✅ PASS: /hls/extract route resolves embed URL and redirects 302 to /hls/manifest.m3u8

  ================================================================
  📊 SUMMARY: 21 PASSED, 0 FAILED
  EMPIRICAL CHALLENGER VERDICT: ✅ APPROVE
  ================================================================
  ```
- Command: `node --check src/routes/hls.js && node --check src/index.js` -> Exited with code 0 (Pass).

## 2. Logic Chain

1. *Anti-403 Hotlinking Bypass Verification*:
   - Modern upstream CDNs (`*.kkphimplayer*.com`, `*.phim1280.tv`, `*.phimapi.com`) reject hotlinked requests with HTTP 403 Forbidden unless requests include `Referer: https://player.phimapi.com/`, matching Origin, and standard desktop Chrome UA.
   - Section 4 verified that requests dispatched to KKPhim CDNs inject `Referer: https://player.phimapi.com/`, `Origin: https://player.phimapi.com`, and `User-Agent: Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36`.
   - Section 8 verified that dynamic `ref` parameter correctly overrides pattern matching and safely extracts origin even when protocol is omitted.

2. *Full HLS Tag Rewriting & Propagation*:
   - HLS playback requires that all subsidiary URLs (nested master playlists, media playlists, TS chunks, AES-128 keys, init maps, audio/subtitle tracks) route through the proxy while retaining the upstream authentication referer token (`ref`).
   - Sections 2, 3, and 8 verified that `#EXT-X-STREAM-INF`, `#EXT-X-I-FRAME-STREAM-INF`, `#EXT-X-MEDIA` (audio/subs), `#EXT-X-KEY`, `#EXT-X-SESSION-KEY`, `#EXT-X-MAP`, `#EXT-X-PART`, and `#EXT-X-PRELOAD-HINT` are accurately parsed and rewritten with Base64URL-encoded targets and encoded `ref` parameters.

3. *CORS & MIME Type Conformance*:
   - Native Stremio players and browser web players enforce cross-origin resource sharing policies and inspect Content-Type headers.
   - Sections 1 and 5 verified that `Access-Control-Allow-Origin: *` is returned on all endpoints (including OPTIONS preflight, error responses, and successful streams), that playlist responses return `application/vnd.apple.mpegurl; charset=utf-8`, and that TS segments strictly override upstream `image/png` obfuscation to return `video/mp2t`.

4. *Resiliency & Fault Tolerance*:
   - Section 7 verified that upstream 403 Forbidden, 500 Internal Error, malformed Base64 inputs, and missing parameters are handled gracefully with standard HTTP 400 / 502 error codes without throwing unhandled exceptions or crashing the Node process.

## 3. Caveats
- No caveats. All 21 empirical adversarial test cases passed with 100% success rate across all required features and edge cases.

## 4. Conclusion
Milestone 2 implementation in `src/routes/hls.js` satisfies all requirements and interface contracts defined in `PROJECT.md` and `ORIGINAL_REQUEST.md`.

**Verdict: `APPROVE`**

## 5. Verification Method
Run the following commands from the project root:
```bash
# 1. Syntax check
node --check src/routes/hls.js
node --check src/index.js

# 2. Run Milestone 2 Empirical Challenger Test Suite (21 test cases)
node tests/hls_challenger_empirical.test.js
```
