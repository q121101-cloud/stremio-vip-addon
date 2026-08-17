# Milestone 2 Reviewer 2 Report: HLS Proxy Anti-403 Optimization

**Verdict**: `APPROVE`

---

## 1. Observation

### 1.1 Source Code Verification (`src/routes/hls.js`)
- **Anti-403 User-Agent (`HLS_UA`)**: Line 29:
  `const HLS_UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';`
- **`SOURCE_REFERERS` Mapping**: Lines 35-40:
  ```javascript
  const SOURCE_REFERERS = [
    { pattern: /kkphimplayer|phim1280|phimapi\.com|kkphim/i, referer: 'https://player.phimapi.com/', origin: 'https://player.phimapi.com' },
    { pattern: /nguonc\.com/i,                               referer: 'https://phim.nguonc.com/',     origin: 'https://phim.nguonc.com' },
    { pattern: /vsmov|streamvs/i,                            referer: 'https://vsmov.com/',           origin: 'https://vsmov.com' },
    { pattern: /streamc\./i,                                 referer: 'https://streamc.online/',      origin: 'https://streamc.online' },
  ];
  ```
- **Dynamic Referer Resolution (`getRefererHeaders`)**: Lines 47-74 prioritize `refParam` with protocol fallback (`https://`), extract origin via `new URL(parsedRef).origin`, and fall back to regex matching on `targetUrl`, target URL origin, or `DEFAULT_REFERER`.
- **Parameter Parsing & Base64 Decoding (`resolveParamUrl`, `decodeB64`)**: Lines 88-118 decode Base64URL and standard Base64, falling back to raw URLs gracefully without exceptions on malformed strings.
- **M3U8 Tag Rewriter**: Lines 203-272 comprehensively rewrite:
  - Master playlist sub-manifests (`#EXT-X-STREAM-INF`, `#EXT-X-I-FRAME-STREAM-INF`, `#EXT-X-MEDIA` URI) to `/hls/manifest.m3u8?url=...&ref=...`.
  - Media playlist segments (`#EXTINF` URIs, `#EXT-X-MAP`, `#EXT-X-PRELOAD-HINT`, `#EXT-X-PART`) to `/hls/ts?url=...&ref=...`.
  - Encryption keys (`#EXT-X-KEY`, `#EXT-X-SESSION-KEY`) to `/hls/ts?url=...&ref=...&is_key=1`.
  - Relative URLs converted to absolute URLs via `new URL(uri, baseUrl.href).href`.
  - Upstream referer token encoded and propagated as `ref` parameter across all child URLs.
- **Segment Streaming & Headers (`/ts`)**: Lines 287-338 enforce CORS (`Access-Control-Allow-Origin: *`), MIME types (`video/mp2t` or `application/octet-stream`), cache header (`Cache-Control: public, max-age=86400`), forward upstream `Content-Length`, stream binary data via `r.data.pipe(res)`, and handle stream errors.
- **Caching & Error Handling**: Lines 173-179 utilize `m3u8Cache` LRU Cache (max 500 entries, 600s TTL) for rewritten manifests. Missing URLs return HTTP 400; upstream 404/500 errors and timeouts return HTTP 502 without crashing the process.

### 1.2 Empirical Test Execution & Results
1. **Syntax Checks**:
   - `node --check src/routes/hls.js` → Code 0 (Pass).
   - `node --check src/index.js` → Code 0 (Pass).
   - `node --check src/providers/kkphim.js` → Code 0 (Pass).
2. **Milestone 2 Reviewer Test Suite (`tests/empirical_m2_reviewer2.test.js`)**:
   - Total: 15/15 Passed (0 Failed).
   - Group 1 (Anti-403 Upstream Headers & Dynamic Ref): 3/3 passed.
   - Group 2 (Playlist Rewriter & Routing): 2/2 passed.
   - Group 3 (Segment Streaming, CORS & MIME Types): 3/3 passed.
   - Group 4 (Error Handling & Cache Management): 4/4 passed.
   - Group 5 (Adversarial Edge Cases): 3/3 passed.
3. **Live KKPhim Playback Probe (`tests/test_live_kkphim_proxy.js`)**:
   - Stream resolution: `slug: "cuu-mon"` resolved stream with URL `.../hls/manifest.m3u8?url=...&ref=...` and strictly NO `externalUrl`.
   - Master manifest: HTTP 200, valid `#EXTM3U`, rewritten `#EXT-X-STREAM-INF`.
   - Sub-manifest: HTTP 200, rewritten `#EXTINF` segment URLs.
   - Real TS segment: HTTP 200, `video/mp2t`, CORS `*`, non-empty binary payload `946,204 bytes` (>900 KB).
4. **Project Regression Tests**:
   - `tests/e2e.test.js` → 90/90 Passed (0 Failed).
   - `tests/test_kkphim_challenger_m1_2.js` → 28/28 Passed (0 Failed).
   - `tests/empirical_m2_challenger.test.js` → 8/8 Passed (0 Failed).

---

## 2. Logic Chain

1. **Anti-403 Header Bypass**:
   - Observation: Upstream CDNs (`*.kkphimplayer*.com`, `*.phim1280.tv`, `*.phimapi.com`) reject requests missing valid player Referers with HTTP 403 Forbidden.
   - Deduction: Injecting `Referer: https://player.phimapi.com/`, `Origin: https://player.phimapi.com`, and macOS Chrome 126 `User-Agent` allows transparent access to both playlist manifests and video chunks. Verified empirically with mock server and live KKPhim CDN.
2. **Dynamic Referer Priority & Source Fallbacks**:
   - Observation: KKPhim sends `ref=...` in query parameters. Other providers or direct links may omit `ref`.
   - Deduction: `getRefererHeaders` prioritizes query `refParam`, decodes Base64URL/raw formats, normalizes protocol, and seamlessly falls back to `SOURCE_REFERERS` domain pattern matching when `ref` is absent.
3. **Playlist & Segment Rewriting**:
   - Observation: Nested sub-playlists, audio tracks, DRM keys, and video segments contain relative or absolute URLs that would bypass the proxy if left unmodified.
   - Deduction: The tag rewriter resolves all URLs to absolute paths, preserves the referer token via `ref`, and routes playlists to `/hls/manifest.m3u8` and media/keys/maps to `/hls/ts`, preventing any client leakage or direct 403 failures.
4. **CORS & MIME Compliance**:
   - Observation: Native Stremio player requires standard `video/mp2t` MIME type and open CORS headers.
   - Deduction: `setCorsHeaders` and explicit Content-Type headers on `/manifest.m3u8` and `/ts` guarantee player compatibility even when CDNs mask TS segments as images.
5. **No Integrity Violations Detected**:
   - Verified that implementation contains genuine logic, real streaming pipelines, genuine cache management, and no hardcoded test responses.

---

## 3. Caveats

- Upstream CDN domains could change over time; however, the regex pattern `/kkphimplayer|phim1280|phimapi\.com|kkphim/i` covers existing domains, and the dynamic `ref` query parameter propagation ensures that provider-supplied referers take precedence regardless of future domain additions.
- No other caveats.

---

## 4. Conclusion

Milestone 2 implementation in `src/routes/hls.js` fully satisfies Requirement R2 of `ORIGINAL_REQUEST.md` and `PROJECT.md`. The HLS proxy correctly injects anti-403 headers, dynamically propagates referers, completely rewrites master/media playlists and DRM keys, enforces CORS and standard MIME types, and handles errors resiliently.

**Verdict: `APPROVE`**

---

## 5. Verification Method

To independently reproduce the verification results:

```bash
# 1. Syntax checks
node --check src/routes/hls.js
node --check src/index.js
node --check src/providers/kkphim.js

# 2. Run Reviewer 2 Empirical Test Suite (15 test cases)
node tests/empirical_m2_reviewer2.test.js

# 3. Run Live KKPhim Stream Playback Probe
node tests/test_live_kkphim_proxy.js

# 4. Run full project test suite
node tests/e2e.test.js
node tests/test_kkphim_challenger_m1_2.js
node tests/empirical_m2_challenger.test.js
```
