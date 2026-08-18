# Review Report: Stremio VIP Movies Addon Engine v1.7.0 Overhaul

**Reviewer**: Reviewer 1 (`reviewer_m1_1`)  
**Roles**: Reviewer & Adversarial Critic  
**Working Directory**: `/Users/quan/.gemini/antigravity/scratch/stremio-nguonc-addon`  
**Date**: 2026-08-18T10:30:15Z  
**Verdict**: **APPROVE**

---

## 1. Observation

### 1.1 Requirements & Codebase Verification

1. **R1: HLS Proxy Router Overhaul (`src/routes/hls.js`)**:
   - **Multi-Level M3U8 Parent Resolver**:
     * In `/manifest.m3u8`, variant streams (`#EXT-X-STREAM-INF`) and media tags (`#EXT-X-MEDIA`) are rewritten to proxy URLs referencing the sub-variant or rendition URL with `encodeBase64`.
     * `baseUrl` is dynamically computed using `r.request?.res?.responseUrl || effectiveTargetUrl`, correctly handling HTTP 301/302 redirects.
     * Within media playlists, segment URLs (`.ts`), initialization maps (`#EXT-X-MAP`), decryption keys (`#EXT-X-KEY`), and preload hints (`#EXT-X-PRELOAD-HINT`) are converted to absolute URLs via `new URL(t, baseUrl.href).href` before being proxied to `/hls/segment.ts`, `/hls/key`, or `/hls/sub.vtt`.
   - **Browser Simulation Headers & Anti-CDN 403/404**:
     * `HLS_UA` is set to `Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36`.
     * All upstream Axios requests include `User-Agent`, `Accept: */*`, `Accept-Language: vi,en-US;q=0.9,en;q=0.8`, and `Connection: keep-alive`.
     * `getRefererHeaders()` accurately routes referers and origins for `kkphim`, `nguonc`, `vsmov`, `stp`, `clbpx`, `yan`, `hh3d`, and `streamc`.
   - **Binary Segment Proxy & HTTP Range 206 Seeking**:
     * `/hls/segment.ts` uses `responseType: 'arraybuffer'`, `timeout: 15000`, and `maxRedirects: 5`.
     * Response headers set `Content-Type: video/MP2T`, `Cache-Control: public, max-age=3600`, and `Accept-Ranges: bytes`.
     * HTTP Range requests are forwarded upstream. If upstream returns 200, the proxy performs safe in-memory buffer slicing (`buffer.subarray(start, end + 1)`) and returns HTTP 206 Partial Content with valid `Content-Range` and `Content-Length`.

2. **R2: Real Cheerio & DOM Scrapers (`src/providers/stp.js`, `clbpx.js`, `yan.js`)**:
   - **STP (`src/providers/stp.js`)**:
     * Implemented HTML card scraper `parseStpCardsFromHtml` and post content parser `parsePostContent` for `sieutamphim.pro`.
     * Includes `decodeXor0x2a` to decode obfuscated episode stream URLs.
     * `isDeadOrBadUrl()` filters out unplayable shortlink/redirect domains (`bysevepoin.com`, `short.ink`, `short.icu`).
     * Multi-tier fallback (HTML scrape -> WP-JSON REST API -> PhimAPI mirror) guarantees high availability.
   - **CLBPX (`src/providers/clbpx.js`)**:
     * Implemented HTML card scraper `parseClbpxCardsFromHtml` for `clbphimxua.info`.
     * 5-step stream extraction in `extractClbpxLiveStreams` (watch page -> halim_cfg & jsonEpisodes -> player.php AJAX -> StreamC embed -> direct M3U8).
     * `getStreams()` evaluates candidate posts with `scoreMatch` and iterates across candidates for series episode matching.
   - **YAN (`src/providers/yan.js`)**:
     * Implemented `parseYanCardsFromHtml` and `extractYanLiveStreams` for `yanhh3d.pw`.
     * **Strict Donghua Guard (`isDonghuaOrAnime`)**: Actively rejects live-action, KDrama, and Western cinema titles (e.g. *Teach You A Lesson*, *A Shop for Killers*, *Lanterns*, *Avengers*, *Breaking Bad*) when querying YAN, returning 0 junk streams.

3. **R3: Multi-Keyword Fallback & Universal Episode Matching (`src/lib/utils.js`, `kkphim.js`, `nguonc.js`)**:
   - `generateSearchKeywords()` expands titles into combinations: original name, English name, aliases, season/part stripped variations, and punctuation-cleaned queries.
   - `matchEpisodeItem()` supports numeric tokens, zero-padded numbers (`01`, `001`), Vietnamese prefixes (`Tập 01`), English prefixes (`Episode 01`, `Ep 01`), slugs (`tap-1`, `ep-1`), full movie flags, and strict whole-token regex boundaries to prevent false matches (e.g., episode 1 matching 10, 11, 12).

4. **R5: Versioning & Brand Signature Conformance**:
   - `package.json`: `"version": "1.7.0"`
   - `src/manifest.js`: `version: '1.7.0'`
   - `src/handlers.js` (line 1057): `VIP Movies Addon v1.7.0 • Designed with Taste by <span class="brand-highlight">Q121101</span>`
   - `src/index.js` (line 105): `VIP Movies Stremio Addon Engine v1.7.0`

### 1.2 Independent Test Suite Results

All test suites were executed directly and verified with zero errors:

| Test Suite | Command | Result | Pass Rate |
|---|---|---|---|
| Syntax Check | `node --check src/index.js` (and all modules) | 0 syntax errors | 100% |
| Core Integration | `npm test` | 50 passed, 0 failed | 100% |
| Live Playback Suite | `node tests/verify_v170_playback.js` | 38 passed, 0 failed | 100% |
| All-Providers E2E | `node tests/verify_all_providers_playback.js` | 44 passed, 0 failed | 100% |

### 1.3 Adversarial Integrity Inspection

- **No Hardcoded Test Outputs**: Verified that tests establish live HTTP listeners on ephemeral ports and make real network requests to external CDNs and local proxy routes.
- **No Facade Implementations**: Verified that parsing logic, base64 transformations, XOR deobfuscation, HTTP Range slicing, and proxy buffering are genuine production implementations.
- **Strict In-App Protocol Invariant**: 100% of generated stream objects supply a proxied `url` and strictly omit `externalUrl`.

---

## 2. Logic Chain

1. **Sub-variant M3U8 Resolution & Anti-404**:
   - The primary root cause of 404 errors in earlier versions was resolving sub-variant segment paths relative to the master playlist URL rather than the redirected sub-variant URL.
   - By capturing `finalUrl = r.request?.res?.responseUrl || effectiveTargetUrl` in `/hls/manifest.m3u8`, the engine establishes the precise base URI for relative `.ts` segments.
   - Subsequent segment requests to `/hls/segment.ts` resolve against this base URL, eliminating 404s for KDrama and Western cinema streams.

2. **Strict Donghua Guard**:
   - `isDonghuaOrAnime()` in `src/providers/yan.js` filters out queries with live-action or Western keywords unless animation genres are explicitly present.
   - Tested against KDrama *Teach You A Lesson* S01E01: YAN returned 0 junk streams, while KKPhim and NguonC returned 5 valid streams.

3. **Range 206 Seeking Support**:
   - When a video player seeks within a `.ts` segment, it sends an HTTP `Range: bytes=start-end` request.
   - `/hls/segment.ts` forwards this header upstream, or performs buffer slicing if upstream responds with 200, returning HTTP 206 Partial Content. This ensures seamless scrubbing and seeking in Stremio and external media players.

---

## 3. Caveats

- **Third-Party CDN Availability**: Live streaming depends on remote CDN uptime (e.g. `phimapi.com`, `phim.nguonc.com`, `sieutamphim.pro`, `clbphimxua.info`, `yanhh3d.pw`). The multi-tier fallbacks implemented across all provider modules mitigate individual endpoint outages.

---

## 4. Conclusion

**Verdict: APPROVE**

The Stremio VIP Movies Addon Engine v1.7.0 Overhaul fulfills all functional, architectural, and verification requirements:
- Multi-level M3U8 resolution and full browser header simulation are operating correctly.
- Real HTML scrapers for STP, CLBPX, and YAN are active with dead link filtering and strict Donghua guards.
- Multi-keyword search fallback and universal episode matching resolve KDrama and Western cinema titles accurately.
- Version `1.7.0` and the required brand signature are consistently applied.
- All four automated test suites achieved 100% PASS with zero regressions.

---

## 5. Verification Method

To independently reproduce the verification results:

```bash
# 1. Syntax Check across all files
node --check src/index.js
node --check src/routes/hls.js
node --check src/providers/stp.js
node --check src/providers/clbpx.js
node --check src/providers/yan.js
node --check src/providers/kkphim.js
node --check src/providers/nguonc.js
node --check src/lib/utils.js
node --check src/handlers.js
node --check src/manifest.js

# 2. Run Integration Tests (50 assertions)
npm test

# 3. Run E2E v1.7.0 Playback Verification (38 assertions)
node tests/verify_v170_playback.js

# 4. Run All-Providers Playback Verification (44 assertions)
node tests/verify_all_providers_playback.js
```
