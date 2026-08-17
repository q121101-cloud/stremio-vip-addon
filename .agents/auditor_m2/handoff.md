# Forensic Audit Report: Milestone 2 (HLS Proxy Anti-403 Optimization)

**Work Product**: `src/routes/hls.js`  
**Profile**: General Project (Integrity Mode: `development`)  
**Verdict**: `CLEAN`

---

## 1. Observation

### 1.1 Source Code Inspection
- **File Checked**: `src/routes/hls.js` (341 lines)
- **Syntax Check**: `node --check src/routes/hls.js` and `node --check src/index.js` exited with status code `0`.
- **User-Agent Invariant (Line 29)**:
  `const HLS_UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';`
- **Referer Mapping (Lines 35–40)**:
  - Pattern `/kkphimplayer|phim1280|phimapi\.com|kkphim/i` correctly maps to Referer `https://player.phimapi.com/` and Origin `https://player.phimapi.com`.
  - Supports NguonC, VsMov, and StreamC provider domains as well.
- **Dynamic Referer Resolution (`getRefererHeaders`, Lines 47–74)**:
  - Prioritizes custom `ref` query parameter if supplied, normalizes scheme, and derives `origin`.
  - Falls back to pattern matching and URL origin detection.
- **CORS & MIME Configuration**:
  - Sets `Access-Control-Allow-Origin: *`, `Access-Control-Allow-Headers: *`, `Access-Control-Allow-Methods: GET, HEAD, OPTIONS`.
  - OPTIONS preflight handler (`router.options('*')`) responds with `204`.
  - `/manifest.m3u8` sets `Content-Type: application/vnd.apple.mpegurl; charset=utf-8`.
  - `/ts` sets `Content-Type: video/mp2t` (or `application/octet-stream` if `is_key=1`).
- **Tag Rewriter Engine (Lines 199–273)**:
  - Master playlist tags (`#EXT-X-STREAM-INF`, `#EXT-X-I-FRAME-STREAM-INF`, `#EXT-X-MEDIA`) rewrite child URI lines and attribute URIs to `/hls/manifest.m3u8?url=...&ref=...`.
  - Media playlist tags (`#EXTINF`, `#EXT-X-KEY`, `#EXT-X-SESSION-KEY`, `#EXT-X-MAP`, `#EXT-X-PRELOAD-HINT`, `#EXT-X-PART`) rewrite segment and key URIs to `/hls/ts?url=...&ref=...`.
  - Preserves base URL hierarchy using `new URL(uri, baseUrl.href).href` and encodes parameters in `base64url`.

### 1.2 Empirical Test Execution
- **Empirical Test Script**: `.agents/auditor_m2/test_forensic_m2.js`
- **Test Summary**: 47 total assertions, 47 passed, 0 failed.
- **Empirical Observations**:
  1. *Anti-Cheat Detection*: No hardcoded m3u8 playlists or mock video buffers found in source.
  2. *Mock CDN Verification*: Under strict mock CDN rejecting non-matching headers, proxy successfully forwarded `User-Agent`, `Referer`, and `Origin`, receiving HTTP 200 and streaming binary buffers.
  3. *Live Manifest Rewrite*: Live stream from KKPhim was parsed, master playlist resolved, and sub-manifest rewritten with proxy routes.
  4. *Live Binary TS Segment Delivery*: Proxied request to live upstream CDN segment (`https://s5.phim1280.tv/...`) succeeded with `HTTP 200`, `Content-Type: video/mp2t`, buffer size `828,516 bytes` (828 KB), and starting byte `0x47` (standard MPEG-TS sync byte).

---

## 2. Logic Chain

1. **Step 1 — Integrity Check**: Inspection of `src/routes/hls.js` verified that all endpoints (`/extract`, `/manifest.m3u8`, `/ts`) use authentic Axios network calls (`responseType: 'text'` and `responseType: 'stream'`) and true stream pipelining (`r.data.pipe(res)`). There are no hardcoded responses, facade mocks, or fabricated bypass mechanisms.
2. **Step 2 — Anti-403 Compliance**: The user request specified that KKPhim streams require `Referer: https://player.phimapi.com/`, `Origin: https://player.phimapi.com`, and a modern macOS Chrome 126 User-Agent. Both the static regex mapping in `SOURCE_REFERERS` and dynamic `ref` handling in `getRefererHeaders` satisfy this requirement on every manifest and segment fetch.
3. **Step 3 — Complete HLS Grammar Coverage**: Master playlists, sub-playlists, AES-128 DRM keys, initialization maps (`#EXT-X-MAP`), and TS segments are systematically rewritten. Relative URLs are resolved against the upstream playlist's base URL, ensuring nested CDN paths resolve accurately without 404/403 breaks.
4. **Step 4 — Real-World Verification**: Independent execution against a live KKPhim stream demonstrated end-to-end functionality: live manifest parsing and retrieval of an 828 KB MPEG-TS video segment without 403 Forbidden errors.

---

## 3. Caveats

- Upstream CDNs occasionally rotate CDN domains (e.g. `s1` to `s10.phim1280.tv`); the regex `/kkphimplayer|phim1280|phimapi\.com|kkphim/i` combined with the dynamic `&ref=` parameter passed from `src/providers/kkphim.js` ensures robust future-proofing without requiring code modifications.
- No caveats regarding file boundaries; only `src/routes/hls.js` was modified by worker M2.

---

## 4. Conclusion

**Verdict: `CLEAN`**

The implementation in `src/routes/hls.js` is an authentic, robust, and fully compliant solution for Milestone 2. All anti-403 CDN bypass requirements, CORS headers, MIME types, and HLS manifest rewriting specifications are satisfied with zero integrity violations.

---

## 5. Verification Method

To independently reproduce the forensic verification:

```bash
# 1. Syntax check
node --check src/routes/hls.js
node --check src/index.js

# 2. Run the empirical forensic test suite (47 assertions)
node .agents/auditor_m2/test_forensic_m2.js

# 3. Run the overall project test suite
node tests/e2e.test.js
```
