# Milestone 2 Review Report: HLS Proxy Anti-403 Optimization

**Verdict**: `APPROVE`

---

## 1. Observation

### Codebase & Implementation Inspection
- **Target File**: `/Users/quan/.gemini/antigravity/scratch/stremio-nguonc-addon/src/routes/hls.js`
- **Anti-403 User-Agent (`HLS_UA`)**: Line 29 is configured with exact macOS Chrome 126 user agent:
  `'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36'`
- **Referer Mapping (`SOURCE_REFERERS`)**: Lines 35-40 accurately map CDN host patterns (`/kkphimplayer|phim1280|phimapi\.com|kkphim/i`, `/nguonc\.com/i`, `/vsmov|streamvs/i`, `/streamc\./i`) to their required upstream Referer and Origin URLs (`https://player.phimapi.com/` / `https://player.phimapi.com`).
- **Dynamic Referer Propagation (`getRefererHeaders`)**: Lines 47-58 prioritize the incoming `ref` query parameter (with protocol fallback) and automatically compute `new URL(parsedRef).origin`.
- **CORS & Preflight (`setCorsHeaders`, `router.options('*')`)**: Lines 79-83 and 120-124 enforce `Access-Control-Allow-Origin: *`, `Access-Control-Allow-Headers: *`, `Access-Control-Allow-Methods: GET, HEAD, OPTIONS` on all responses, errors, and preflight requests.
- **MIME Types**:
  - Manifests (`/manifest.m3u8`, `/m3u8`): `application/vnd.apple.mpegurl; charset=utf-8` (Line 163)
  - Video Segments (`/ts`): `video/mp2t` (Line 294)
  - DRM Encryption Keys (`is_key=1` or `.key`): `application/octet-stream` (Lines 292, 306)
- **HLS M3U8 Tag Rewriting Engine**: Lines 199-273 rewrite:
  - Master Playlists (`#EXT-X-STREAM-INF`, `#EXT-X-I-FRAME-STREAM-INF`, `#EXT-X-MEDIA`) to `/hls/manifest.m3u8?url=...&ref=...`
  - Media Segments (`#EXTINF`, relative and absolute TS URIs) to `/hls/ts?url=...&ref=...`
  - DRM Keys (`#EXT-X-KEY`, `#EXT-X-SESSION-KEY`) to `/hls/ts?url=...&ref=...&is_key=1`
  - Fragmented MP4 (`#EXT-X-MAP`, `#EXT-X-PRELOAD-HINT`, `#EXT-X-PART`) to `/hls/ts?url=...&ref=...`
- **Stream Piping & Error Interception**: Lines 329-333 pipe incoming streams (`r.data.pipe(res)`) and bind `r.data.on('error', ...)` to prevent unhandled stream aborts.

### Empirical Validation Results
1. **Syntax Validation**:
   - `node --check src/routes/hls.js` → Exited with code 0 (Pass)
   - `node --check src/index.js` → Exited with code 0 (Pass)
2. **Automated Review Test Suite (`test_m2_review.js` - 22 Test Cases)**:
   - Group 1 (Anti-403 Headers): User-Agent propagation, Referer/Origin injection, dynamic ref parameter handling, pattern matching fallback → 6/6 PASS
   - Group 2 (Playlist Rewriting): Master playlist sub-manifests, audio/subtitle media tags, TS segments, encryption keys with `is_key=1`, fMP4 maps & preload hints → 7/7 PASS
   - Group 3 (CORS & MIME Types): OPTIONS preflight 204, mpegurl charset, video/mp2t segment, octet-stream key → 4/4 PASS
   - Group 4 (Edge Cases & Faults): Missing url params (400), standard Base64 & Base64URL decoding, raw URL parameters, aliases (`/hls/m3u8`), upstream failures (502) → 5/5 PASS
   - Overall: 22 passed, 0 failed (100% Pass)
3. **Live Real-World CDN Playback Test (`test_live_kkphim.js`)**:
   - Resolved `cuu-mon` from live KKPhim API (`https://s1.phim1280.tv/20230929/a3nZqLHv/index.m3u8`).
   - Requested manifest via local proxy → HTTP 200 `application/vnd.apple.mpegurl; charset=utf-8`, CORS `*`.
   - Downloaded live TS video segment via proxy → HTTP 200 `video/mp2t`, `946,204 bytes` (>946 KB), verified first byte is `0x47` (MPEG-TS sync byte). 0 HTTP 403 Forbidden errors.

---

## 2. Logic Chain

1. *Observation 1 (Anti-403 Header Configuration)*: CDN servers (`*.kkphimplayer*.com`, `*.phim1280.tv`, `*.phimapi.com`) reject requests missing the official web player Referer or using automated/non-browser User-Agents. Line 29 (`HLS_UA`) and lines 35-40 (`SOURCE_REFERERS`) correctly emulate a full macOS Chrome 126 browser navigating from `https://player.phimapi.com/`.
2. *Observation 2 (Dynamic `ref` Parameter & Origin Derivation)*: KKPhim provider passes Base64URL-encoded stream and referer URLs. The proxy decodes the `ref` param, extracts the origin, and sends both `Referer` and `Origin` headers upstream, preventing anti-hotlinking triggers across all endpoints.
3. *Observation 3 (Full Tag & Sub-Manifest Rewriting)*: In nested HLS streaming, players make subsequent requests based on URIs present in the downloaded playlist. Rewriting all master tags (`#EXT-X-STREAM-INF`, `#EXT-X-MEDIA`), media tags (`#EXTINF`), initialization maps (`#EXT-X-MAP`), and DRM keys (`#EXT-X-KEY`) ensures that all player requests route through the proxy with anti-403 headers intact.
4. *Observation 4 (CORS & MIME Overrides)*: Native Stremio and web players enforce strict CORS policies and media type validation. Overriding upstream headers with `Access-Control-Allow-Origin: *` and `video/mp2t` / `application/vnd.apple.mpegurl; charset=utf-8` guarantees smooth playback across Stremio Desktop, Android, iOS, and Web players.
5. *Observation 5 (Empirical Verification & Integrity)*: Empirical testing confirmed 0 integrity violations, no dummy or hardcoded responses, robust error handling (502 on upstream outages, 400 on malformed input), and verified real-world live CDN segment streaming.

---

## 3. Caveats

- **Upstream CDN Domain Evolution**: If upstream CDNs introduce entirely new domain patterns without passing a `ref` parameter, regexes in `SOURCE_REFERERS` would need updating. However, because providers (such as KKPhim in M1) explicitly pass `ref=${encodeBase64('https://player.phimapi.com/')}` in the query string, dynamic resolution protects against future domain changes.
- **Scope Discipline**: Review was strictly non-invasive; no implementation files were modified during review.

---

## 4. Conclusion

Milestone 2 implementation in `src/routes/hls.js` fully satisfies all criteria of Requirement R2:
- ✅ Anti-403 CDN bypass headers (`Referer: https://player.phimapi.com/`, `Origin: https://player.phimapi.com`, Chrome 126 Mac `User-Agent`).
- ✅ Complete playlist rewriting (`.ts`, `#EXT-X-KEY`, `#EXT-X-MAP`, `#EXT-X-MEDIA`, `#EXT-X-STREAM-INF`, `#EXT-X-PRELOAD-HINT`, `#EXT-X-PART`).
- ✅ Full CORS (`*`) and strict MIME type enforcement (`application/vnd.apple.mpegurl; charset=utf-8`, `video/mp2t`, `application/octet-stream`).
- ✅ 0 Integrity violations; verified live CDN streaming with valid binary TS buffer (>946 KB) and MPEG-TS sync byte `0x47`.

**Final Verdict**: `APPROVE`

---

## 5. Verification Method

To independently reproduce and verify this review:
1. **Syntax Check**:
   ```bash
   node --check src/routes/hls.js
   node --check src/index.js
   ```
2. **Automated Unit & Adversarial Test Suite**:
   ```bash
   node .agents/reviewer_m2_1/test_m2_review.js
   ```
3. **Live Real-World KKPhim CDN Verification**:
   ```bash
   node .agents/reviewer_m2_1/test_live_kkphim.js
   ```
