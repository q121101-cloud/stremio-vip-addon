# Investigation Report — Engine v1.7.0 Overhaul: HLS Proxy (R1) & E2E Verification Suites (R4)

- **Date**: 2026-08-18
- **Explorer**: Explorer 1 (`teamwork_preview_explorer_survey_1`)
- **Target Scope**: 
  - Requirement R1: HLS Proxy multi-level parent resolution & browser header simulation (`src/routes/hls.js`)
  - Requirement R4: E2E Playback verification test suite (`tests/verify_v170_playback.js` & `tests/verify_all_providers_playback.js`)

---

## 1. Observation

### 1.1. Codebase Inspection: `src/routes/hls.js`

1. **Multi-Level M3U8 Resolution**:
   - Master Playlist parsing (`src/routes/hls.js:232-249`):
     ```javascript
     if (t.startsWith('#EXT-X-STREAM-INF') || t.startsWith('#EXT-X-I-FRAME-STREAM-INF')) {
       isMasterPlaylist = true;
       isNextSubPlaylist = true;
       isNextSegment = false;
       ...
       if (streamInfLine.includes('URI=')) {
         streamInfLine = streamInfLine.replace(/URI=(?:"([^"]+)"|([^\s,]+))/, (_, qUri, unqUri) => {
           const uri = qUri || unqUri;
           const absUri = uri.startsWith('http') ? uri : new URL(uri, baseUrl.href).href;
           const b64Uri = Buffer.from(absUri).toString('base64url');
           return `URI="${protoHost}/hls/manifest.m3u8?url=${b64Uri}&ref=${encodedRef}"`;
         });
       }
       rewrittenLines.push(streamInfLine);
       continue;
     }
     ```
   - Variant Playlist line rewriting (`src/routes/hls.js:317-328`):
     ```javascript
     const absUrl = t.startsWith('http') ? t : new URL(t, baseUrl.href).href;
     const b64Url = Buffer.from(absUrl).toString('base64url');

     if (isNextSubPlaylist || absUrl.includes('.m3u8') || absUrl.includes('playlist')) {
       isNextSubPlaylist = false;
       rewrittenLines.push(`${protoHost}/hls/manifest.m3u8?url=${b64Url}&ref=${encodedRef}`);
       continue;
     }

     isNextSegment = false;
     rewrittenLines.push(`${protoHost}/hls/segment.ts?url=${b64Url}&ref=${encodedRef}`);
     ```
   - Sub-variant request handling: When a player requests `/hls/manifest.m3u8?url=${b64Url}&ref=${encodedRef}`, `targetUrl` is decoded to the sub-variant's absolute URL (`src/routes/hls.js:151`). `baseUrl` is computed as `new URL(effectiveTargetUrl)` (`src/routes/hls.js:211`). When `.ts` segments (e.g. `segment_01.ts` or relative paths) appear in the sub-variant manifest, `new URL(t, baseUrl.href).href` resolves against the sub-variant URL.

2. **Browser Simulation Headers**:
   - Current constant in `src/routes/hls.js:25`:
     ```javascript
     const HLS_UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';
     ```
   - Headers in Axios requests (`src/routes/hls.js:170-175, 372-377, 437-442, 498-503`):
     ```javascript
     headers: {
       'User-Agent': HLS_UA,
       Referer: refererUrl,
       Origin: origin,
       Accept: '*/*',
     }
     ```
   - Observation: `Accept-Language: vi,en-US;q=0.9,en;q=0.8` and `Connection: keep-alive` are missing from Axios requests. The User-Agent string is Mac Chrome 126 instead of the specified Windows Chrome 124 (`Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36`).

3. **Dynamic Referer & Origin Mapping**:
   - `SOURCE_REFERERS` table in `src/routes/hls.js:27-36`:
     * KKPhim / Opstream / Vlcdn / Phim1280: `referer: 'https://player.phimapi.com/', origin: 'https://player.phimapi.com'`
     * VSMOV: `referer: 'https://vsmov.com/', origin: 'https://vsmov.com'`
     * NguonC: `referer: 'https://phim.nguonc.com/', origin: 'https://phim.nguonc.com'`
     * StreamC: `referer: 'https://embed15.streamc.xyz/', origin: 'https://embed15.streamc.xyz'`
     * STP: `referer: 'https://sieutamphim.pro/', origin: 'https://sieutamphim.pro'`
     * YAN: `referer: 'https://yanhh3d.pw/', origin: 'https://yanhh3d.pw'`
     * HH3D: `referer: 'https://hh3d.tv/', origin: 'https://hh3d.tv'`
     * CLBPX: `referer: 'https://clbphimxua.info/', origin: 'https://clbphimxua.info'`
   - Function `getRefererHeaders(targetUrl, refParam)` in `src/routes/hls.js:43-67` correctly prioritizes `refParam` and falls back to regex patterns and target URL origin.

4. **Binary Safe Loading (`/hls/segment.ts`)**:
   - `src/routes/hls.js:363-364, 385-393`:
     ```javascript
     res.setHeader('Content-Type', req.query.is_key ? 'application/octet-stream' : 'video/MP2T');
     res.setHeader('Cache-Control', req.query.is_key ? 'no-cache, no-store' : 'public, max-age=31536000, immutable');
     ...
     const upstreamRes = await axios({
       url: targetUrl,
       method: 'GET',
       responseType: 'stream',
       headers: upstreamHeaders,
       timeout: 25000,
       maxRedirects: 5,
       validateStatus: (status) => status >= 200 && status < 400,
     });
     ```
   - Observation: `responseType` is currently `'stream'` with `timeout: 25000` and `Cache-Control: public, max-age=31536000, immutable`. R1 specifies `responseType: 'arraybuffer'`, `timeout: 15000`, `maxRedirects: 5`, and `Cache-Control: public, max-age=3600`.

---

### 1.2. Test Execution Observations

1. **Execution of `node tests/verify_v170_playback.js`**:
   - Command: `node tests/verify_v170_playback.js`
   - Exit code: `0`
   - Total Assertions: **38 Passed / 0 Failed**
   - Output summary:
     * Phase 1 (Catalogs): STP (`stp-phim-le` → 18 metas), CLBPX (`clbpx-hong-kong` → 10 metas), YAN (`yan-dang-chieu` → 28 metas).
     * Phase 2 (KDrama & US-UK): *Teach You A Lesson* (5 streams, 0 from YAN), *A Shop for Killers* (4 streams), *Avengers 3* (5 streams).
     * Phase 3 (Live Playback): Traversed Master to Sub-variant M3U8 (802 segments), Segment 1 (416.2 KB, sync byte `0x47`), Segment 2 (919.4 KB, sync byte `0x47`).
     * Phase 4 (Seeking): HTTP Range `bytes=0-1023` → HTTP 206 Partial Content, `Content-Range: bytes 0-1023/426196`, 1024 bytes buffer.

2. **Execution of `node tests/verify_all_providers_playback.js`**:
   - Command: `node tests/verify_all_providers_playback.js`
   - Exit code: `1`
   - Result: **39 Passed / 2 Failed**
   - Failures observed:
     * `Provider STP (Sưu Tầm Phim): M3U8 body must contain #EXTM3U header`
     * `Provider CLBPX (Phim Xưa & TVB): Must find CLBPX stream for Thiên Long Bát Bộ`

3. **Execution of `npm test` (`src/test.js`)**:
   - Command: `npm test`
   - Exit code: `0`
   - Result: **50 Passed / 0 Failed**

4. **Syntax verification**:
   - `node --check src/index.js` → Exit code `0` (Clean).

---

## 2. Logic Chain

1. **Why Multi-Level M3U8 works for KDrama/US-UK in `verify_v170_playback.js`**:
   - When KKPhim/NguonC streams return master playlists (e.g. `https://v7.kkphimplayer7.com/20260605/mMUnxegG/index.m3u8`), `src/routes/hls.js` rewrites the variant line `3500kb/hls/index.m3u8` to `/hls/manifest.m3u8?url=...`.
   - When Stremio player requests this sub-variant, `src/routes/hls.js` fetches `https://v7.kkphimplayer7.com/20260605/mMUnxegG/3500kb/hls/index.m3u8` and sets `baseUrl` to that URL.
   - The segments (e.g. `FqAOJI2h.ts`) are rewritten to `/hls/segment.ts?url=...` with `https://v7.kkphimplayer7.com/20260605/mMUnxegG/3500kb/hls/FqAOJI2h.ts`.
   - This prevents the 404 error where segments were previously resolved relative to the master playlist root instead of the sub-variant directory.

2. **Root Cause of STP failure in `verify_all_providers_playback.js`**:
   - In `tests/verify_all_providers_playback.js:290-305`, the test queries `stpProvider.getCatalog('au-my', 1)` and tries to get streams for each item.
   - `stpProvider.getCatalog('au-my', 1)` returned items like `stp_cuoc-chien-sinh-tu-ii`.
   - In `src/providers/stp.js:356`, `getDetail(slug)` attempts `http.get('https://sieutamphim.pro/' + cleanSlug + '.html')`. On `sieutamphim.pro`, article URLs include year and month paths (`/YYYY/MM/slug.html`), causing direct slug lookups to return 404.
   - Because `getDetail` failed, the test suite fell back to `stpProvider.search('Avatar', 1)`.
   - `stpProvider.search` scraped the live HTML of `sieutamphim.pro` and decoded XOR-obfuscated episode URLs.
   - The decoded URL for *Avatar* was `https://bysevepoin.com/e/akui1icnoycl` (an embed SPA player) and `https://short.ink/...` (an expired/dead shortlink domain).
   - When `/hls/manifest.m3u8` received `bysevepoin.com`, it received HTML rather than M3U8. `extractM3u8FromEmbed` failed to extract a stream from `bysevepoin.com`, causing the proxy to return raw HTML and triggering the failure: `M3U8 body must contain #EXTM3U header`.

3. **Root Cause of CLBPX failure in `verify_all_providers_playback.js`**:
   - In `tests/verify_all_providers_playback.js:315-323`, the test requests streams for series `Thiên Long Bát Bộ` (Season 1, Episode 1).
   - `clbpxProvider.search('Thiên Long Bát Bộ', 1)` returned 8 items (e.g. `thien-long-bat-bo-kieu-phong-truyen-2`, `thien-long-bat-bo-1997`, `thien-long-bat-bo-2003`, etc.).
   - `scoreMatch` assigned all of them an identical score of `1.1` because all item titles start with `"Thiên Long Bát Bộ"` and no specific year was provided in the query.
   - In `src/providers/clbpx.js:579-586`, the search loop picked only the first item (`thien-long-bat-bo-kieu-phong-truyen-2`).
   - `extractClbpxLiveStreams('thien-long-bat-bo-kieu-phong-truyen-2', 1)` returned `[]` because that specific post on `clbphimxua.info` is empty/broken.
   - The provider immediately returned `[]` without attempting subsequent high-scoring candidate items (such as `thien-long-bat-bo-1997`, which has a live working stream).

---

## 3. Gap Analysis

| Requirement Item | Expected (per Specification) | Current Implementation | Status |
| :--- | :--- | :--- | :--- |
| **R1: Multi-level Parent Resolution** | Master playlist wraps sub-variant to `/hls/manifest.m3u8?url=...&ref=...`, sub-variant uses sub-variant URL as `baseUrl` for segments | Implemented in `src/routes/hls.js:232-249, 317-328` | **COMPLETE & VERIFIED** |
| **R1: Redirect ResponseUrl Handling** | Handle 301/302 redirects when resolving relative M3U8 / TS paths | Currently resolves relative to `targetUrl` rather than `r.request?.res?.responseUrl` | **MINOR GAP** |
| **R1: Browser Simulation UA** | `Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36` | Uses Mac Chrome 126 (`src/routes/hls.js:25`) | **GAP** |
| **R1: Browser Headers** | `Accept: */*`, `Accept-Language: vi,en-US;q=0.9,en;q=0.8`, `Connection: keep-alive` | `Accept-Language` and `Connection: keep-alive` missing in `hls.js` requests | **GAP** |
| **R1: Referer / Origin Mapping** | Dynamic mapping for KKPhim, Opstream, Vlcdn, Phim1280, NguonC, VSMOV, STP, CLBPX, YAN | Fully declared in `SOURCE_REFERERS` table | **COMPLETE & VERIFIED** |
| **R1: `/hls/segment.ts` Configuration** | `responseType: 'arraybuffer'`, `maxRedirects: 5`, `timeout: 15000`, `Cache-Control: public, max-age=3600` | Currently uses `responseType: 'stream'`, `timeout: 25000`, `max-age=31536000` | **GAP** |
| **R4: `verify_v170_playback.js`** | 100% assertions PASS across Catalogs, KDrama/US-UK, Playback (>100KB, 0x47 sync), YAN Guard | 38/38 assertions PASS | **COMPLETE & VERIFIED** |
| **R4: `verify_all_providers_playback.js`** | 100% assertions PASS across all 6 provider clusters | 39/41 PASS (STP and CLBPX failures in stream resolution) | **GAP (Needs Fix)** |

---

## 4. Conclusion

- **R1 Assessment**: The multi-level M3U8 parent resolution logic is functionally working and successfully resolves sub-variants and video segments without 404 errors (verified with live KKPhim and NguonC streams). However, `src/routes/hls.js` requires updating to match the exact browser header simulation specs (`User-Agent`, `Accept-Language`, `Connection: keep-alive`) and the binary buffer segment loading configuration (`responseType: 'arraybuffer'`, `timeout: 15000`, `Cache-Control: public, max-age=3600`).
- **R4 Assessment**: `tests/verify_v170_playback.js` is fully working (38/38 assertions pass). `tests/verify_all_providers_playback.js` has 2 edge-case failures in STP and CLBPX stream candidate matching that must be addressed by Worker to reach 100% PASS across the entire verification matrix.

---

## 5. Verification Method

To independently reproduce and verify these findings:

```bash
# 1. Run the v1.7.0 E2E Playback test suite (Expected: 38/38 PASS)
node tests/verify_v170_playback.js

# 2. Run the 6-provider comprehensive verification suite (Expected: 39/41 PASS, highlighting STP and CLBPX gaps)
node tests/verify_all_providers_playback.js

# 3. Run the core integration test suite (Expected: 50/50 PASS)
npm test

# 4. Check syntax
node --check src/index.js
node --check src/routes/hls.js
```

---

## 6. Concrete Recommendations for Worker

### Recommendation 1 (for `src/routes/hls.js`):
1. **Update User-Agent & Default Request Headers**:
   ```javascript
   const HLS_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

   const DEFAULT_HEADERS = {
     'User-Agent': HLS_UA,
     'Accept': '*/*',
     'Accept-Language': 'vi,en-US;q=0.9,en;q=0.8',
     'Connection': 'keep-alive',
   };
   ```
2. **Use `responseUrl` on Redirects**:
   In `/manifest.m3u8`:
   ```javascript
   const finalUrl = r.request?.res?.responseUrl || effectiveTargetUrl;
   let baseUrl;
   try { baseUrl = new URL(finalUrl); } catch { return res.send(rawManifestData); }
   ```
3. **Align `/hls/segment.ts` Delivery**:
   Update `responseType: 'arraybuffer'`, `timeout: 15000`, `maxRedirects: 5`, and set `res.setHeader('Cache-Control', 'public, max-age=3600')`. Handle Range requests with buffer slicing (`buffer.subarray(start, end + 1)`) and HTTP 206 with `Content-Range`.

### Recommendation 2 (for `src/providers/stp.js` & `src/providers/clbpx.js`):
1. **STP Provider (`src/providers/stp.js`)**:
   - Filter out dead / unplayable embed domains (e.g. `bysevepoin.com`, `short.ink`, `short.icu`) when parsing `episodeGroup`.
   - In `getDetail` / `getStreams`, when direct HTML scrape does not yield working direct `.m3u8` streams, fallback to PhimAPI/Ophim mirror search by title.
2. **CLBPX Provider (`src/providers/clbpx.js`)**:
   - In `getStreams`, if the highest-scoring search match returns no stream (`liveStreams.length === 0`), iterate through the remaining candidate matches from `search(title)` (e.g. `thien-long-bat-bo-1997`) instead of failing immediately.
