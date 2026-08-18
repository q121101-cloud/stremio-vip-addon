# Code Audit Report: `src/routes/hls.js` & Stream Proxying Architecture

**Date**: 2026-08-18  
**Author**: Explorer Subagent 2 (Teamwork Explorer)  
**Target Repository**: `/Users/quan/.gemini/antigravity/scratch/stremio-nguonc-addon`  
**Target Module**: `src/routes/hls.js` and associated streaming/caching logic (`src/lib/cache.js`, `src/mapper.js`, `src/providers/*.js`)

---

## 1. Observation

Direct observations from inspection of `src/routes/hls.js` (Engine v1.7.0) and supporting modules:

### A. Upstream HTTP >= 400 Error Handling & Cache Purging
1. **`/hls/manifest.m3u8` (`src/routes/hls.js:169-174, 369-383`)**:
   - Cache key construction:
     ```javascript
     const cacheKey = `m3u8:${protoHost}:${targetUrl}:${subParam || ''}`;
     const cached = m3u8Cache.get(cacheKey);
     if (cached) {
       return res.send(cached);
     }
     ```
   - On upstream fetch error (HTTP >= 400 or network timeout/failure):
     ```javascript
     } catch (err) {
       console.error('[HLS/manifest]', err.message, targetUrl.slice(0, 80));
       // Purge dead/broken cache entries
       m3u8Cache.del(cacheKey);

       if (!res.headersSent) {
         // Self-healing fallback: allow external players to resolve directly if targetUrl is valid
         if (targetUrl && (targetUrl.startsWith('http://') || targetUrl.startsWith('https://'))) {
           try {
             return res.redirect(302, targetUrl);
           } catch {}
         }
         res.status(502).send('HLS Proxy Error: ' + err.message);
       }
     }
     ```
   - **Empirical observation**: When upstream returns 403, 404, or 500, `m3u8Cache.del(cacheKey)` is called immediately, and the proxy returns a `302 Found` redirect to `targetUrl` rather than a `502 Bad Gateway`.

2. **`/hls/segment.ts` (`src/routes/hls.js:413-466`)**:
   - Upstream segment fetch validates status `< 400`:
     ```javascript
     validateStatus: (status) => status >= 200 && status < 400,
     ```
   - On error:
     ```javascript
     } catch (err) {
       console.error('[HLS/segment]', err.message, targetUrl.slice(0, 80));
       if (!res.headersSent) res.status(502).send('HLS Segment Error');
     }
     ```
   - **Observation**: When an upstream video segment request fails, it responds with `502 Bad Gateway` without a 302 redirect fallback.

3. **`/hls/key` (`src/routes/hls.js:502-506`)**:
   - On key fetch error:
     ```javascript
     } catch (err) {
       console.error('[HLS/key]', err.message, targetUrl.slice(0, 80));
       if (!res.headersSent) res.status(502).send('Key proxy error');
     }
     ```

4. **`/hls/extract` (`src/routes/hls.js:136-152`)**:
   - On extraction failure:
     ```javascript
     const result = await extractM3u8FromEmbed(embedUrl);
     if (!result || !result.m3u8Url) {
       console.warn('[HLS/extract] Could not extract m3u8 from:', embedUrl.slice(0, 80));
       return res.status(502).send('Could not extract stream URL from embed');
     }
     ...
     } catch (err) {
       console.error('[HLS/extract]', err.message);
       if (!res.headersSent) res.status(502).send('Extract error: ' + err.message);
     }
     ```

---

### B. Segment Proxying & Manifest Rewriting Logic
1. **Header Forwarding & Stealth Injection (`src/routes/hls.js:25-77`)**:
   - User-Agent: `HLS_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'`
   - Provider Domain Referers (`SOURCE_REFERERS`):
     - `kkphimplayer|phim1280|phimapi.com|kkphim|opstream|vlcdn` → `https://player.phimapi.com/`
     - `vsmov|streamvsmov|p25.streamvsmov` → `https://vsmov.com/`
     - `nguonc.com` → `https://phim.nguonc.com/`
     - `streamc.|amass2.top` → `https://embed15.streamc.xyz/`
     - `film4k.net|film4k` → `https://film4k.net/`
     - `sieutamphim|suutamphim|tvhay` → `https://sieutamphim.pro/`
     - `yanhh3d|yan|fbcdn.cloud|defifa.com` → `https://yanhh3d.pw/`
     - `hh3d|hoathinh3d` → `https://hh3d.tv/`
     - `clbphimxua|clbpx` → `https://clbphimxua.info/`
   - Default Referer fallback: `https://phim.nguonc.com/`.

2. **HTTP Range & 206 Partial Content Forwarding (`src/routes/hls.js:409-454`)**:
   - Proxies incoming `Range` header to upstream CDN.
   - If upstream returns 206, forwards `Content-Range`, `Content-Length`, and partial buffer.
   - If upstream returns 200 (ignoring Range), performs local buffer slicing fallback:
     ```javascript
     const rangeMatch = req.headers.range.match(/bytes=(\d+)-(\d*)/);
     if (rangeMatch) {
       const start = parseInt(rangeMatch[1], 10);
       let end = rangeMatch[2] ? parseInt(rangeMatch[2], 10) : buffer.length - 1;
       if (isNaN(end) || end >= buffer.length) end = buffer.length - 1;
       if (start <= end && start < buffer.length) {
         const slice = buffer.subarray(start, end + 1);
         res.status(206);
         res.setHeader('Content-Range', `bytes ${start}-${end}/${buffer.length}`);
         res.setHeader('Content-Length', slice.length);
         return res.send(slice);
       }
     }
     ```

3. **HLS Protocol Tag Rewriting (`src/routes/hls.js:246-343`)**:
   - Master Playlists (`#EXT-X-STREAM-INF`, `#EXT-X-I-FRAME-STREAM-INF`): rewrites variant stream URIs to `/hls/manifest.m3u8?url=...&ref=...`.
   - Renditions (`#EXT-X-MEDIA`): rewrites audio and subtitle URIs to `/hls/manifest.m3u8` or `/hls/sub.vtt`.
   - Decryption Keys (`#EXT-X-KEY`, `#EXT-X-SESSION-KEY`): rewrites key URIs to `/hls/key?url=...&ref=...`.
   - Initialization Segments (`#EXT-X-MAP`): rewrites init MP4 URIs to `/hls/segment.ts?url=...&ref=...`.
   - Low-Latency Partial Segments (`#EXT-X-PART`, `#EXT-X-PRELOAD-HINT`): rewrites part URIs to `/hls/segment.ts?url=...&ref=...`.
   - Media Segments (non-comment URI lines): rewrites `.ts` or media URLs to `/hls/segment.ts?url=...&ref=...`.
   - Subtitle Injection (`src/routes/hls.js:345-364`): dynamically inserts `#EXT-X-MEDIA:TYPE=SUBTITLES...` into master playlist when `subParam` is provided and not already present.

4. **Parameter Decoding (`src/routes/hls.js:88-120`)**:
   - `resolveParamUrl` and `decodeB64`: supports Base64URL, standard Base64, and plaintext HTTP(S)/Data URLs.

---

### C. Specific Edge Cases and Bugs Observed

1. **Bug 1: HTML 200 Response Cached as Corrupted M3U8 Playlist (`src/routes/hls.js:196-234, 367`)**:
   - When upstream returns HTTP 200 with an HTML block page (e.g. Cloudflare captcha, maintenance HTML, or expired session) and `extractM3u8FromEmbed` fails:
   - `rawManifestData` remains the HTML string.
   - The code does not reject or throw on `!rawManifestData.includes('#EXTM3U')`.
   - Instead, it loops over each HTML line, wraps them into `/hls/segment.ts?url=<b64_html_line>`, saves this to `m3u8Cache.set(cacheKey, rewritten, 300)`, and returns HTTP 200 with `application/vnd.apple.mpegurl`.
   - **Empirical test proof**: Verified via live mock server — HTML 200 returned a corrupted manifest that was saved to cache.

2. **Bug 2: `extractM3u8FromEmbed` Function Signature Mismatch (`src/routes/hls.js:198` vs `src/mapper.js:280`)**:
   - `src/routes/hls.js:198` calls `extractM3u8FromEmbed(targetUrl, refererUrl)`.
   - `src/mapper.js:280` is declared as `async function extractM3u8FromEmbed(embedUrl)` (taking only 1 argument) and line 294 hardcodes `Referer: 'https://phim.nguonc.com/'`.
   - Custom referers passed from other CDNs (e.g. StreamC, VsMov, Film4K) are ignored by `mapper.js`.

3. **Inconsistency: Missing 302 Fallback in `/hls/segment.ts`, `/hls/key`, and `/hls/extract`**:
   - `/hls/manifest.m3u8` has self-healing `res.redirect(302, targetUrl)`.
   - `/hls/segment.ts`, `/hls/key`, and `/hls/extract` return HTTP 502 instead of redirecting the player to the upstream URL.

---

## 2. Logic Chain

1. **From Observation A1 & A2**:
   - In `/hls/manifest.m3u8`, any HTTP status >= 400 from upstream axios throws an error, invoking the catch block.
   - Inside the catch block, `m3u8Cache.del(cacheKey)` executes, removing any stale entry from the LRU cache.
   - Then `res.redirect(302, targetUrl)` executes if `targetUrl` is an HTTP(S) URL.
   - Therefore, Requirement 1 (m3u8 fallback + cache purge) is implemented for `/hls/manifest.m3u8`.
2. **From Observation A2 & C3**:
   - In `/hls/segment.ts`, when axios fails (e.g. HTTP >= 400 or timeout), it returns `res.status(502).send('HLS Segment Error')`.
   - While video segments are not cached in `m3u8Cache` (they stream directly), returning 502 instead of 302 redirect prevents players that support redirect following from recovering from proxy stalls.
3. **From Observation C1**:
   - When an upstream server returns HTTP 200 with an HTML error page, axios considers it a successful request.
   - The de-embed block attempts `extractM3u8FromEmbed(targetUrl, refererUrl)`.
   - If extraction fails, `rawManifestData` remains non-M3U8 text.
   - Without an explicit `#EXTM3U` guard prior to caching, the handler treats the HTML lines as segment lines, stores the invalid manifest in `m3u8Cache` for 300 seconds, and responds with HTTP 200.
   - Any client repeating the request within 5 minutes receives the cached corrupt manifest without triggering the upstream retry or fallback redirect.
4. **From Observation B1 & B2**:
   - `SOURCE_REFERERS` covers all 8 providers (FILM4K, VSMOV, KKPhim, NguonC, STP, HH3D, YAN, CLBPX) and their respective streaming CDNs.
   - HTTP 206 Range headers are forwarded and supplemented with local buffer slicing, ensuring universal seek capability across all clients.

---

## 3. Caveats

1. **Upstream IP Binding**: Some CDNs bind segment playback to client IP. If a player receives a 302 redirect from the proxy, the direct request originates from the client's IP, which might fail if the token was issued for the server IP (or vice-versa). However, for public/semi-public CDNs (PhimApi, StreamC, VsMov), 302 fallback provides superior resilience.
2. **Vercel / Serverless Environment**: In serverless environments, `protoHost` must rely on `x-forwarded-proto` and `x-forwarded-host`. This is correctly handled at `src/routes/hls.js:167`.
3. **No Code Modification**: In accordance with the Explorer subagent constraints, no modifications to `src/` files were made.

---

## 4. Conclusion

1. **Requirement 1 (Upstream >= 400 & Cache Purge)**:
   - **PASS**: `/hls/manifest.m3u8` purges broken cache via `m3u8Cache.del(cacheKey)` and returns `302 Found` fallback redirect to `targetUrl`.
   - **REMEDIATION NEEDED**:
     - Handle HTTP 200 HTML error responses: If `!rawManifestData.includes('#EXTM3U')` after embed extraction, throw an error to invoke `m3u8Cache.del(cacheKey)` and trigger the 302 redirect fallback instead of caching corrupt HTML.
     - Add `res.redirect(302, targetUrl)` fallback in `/hls/segment.ts` and `/hls/key` catch blocks to eliminate 502 responses during segment proxying.

2. **Requirement 2 (Segment Proxying & Rewriting)**:
   - **PASS**: Full HLS specification coverage (master variants, audio/sub renditions, AES-128 keys, fMP4 init maps, low-latency preload hints/parts, byte ranges).
   - **PASS**: HTTP 206 Range seek support with upstream proxying + local slicing fallback.
   - **PASS**: Stealth headers and Referer routing for all 8 providers.

3. **Requirement 3 (Bugs & Crash Scenarios)**:
   - Identified 3 specific issues:
     1. HTML 200 caching bug in `/manifest.m3u8`.
     2. Hardcoded 502 in `/segment.ts`, `/key`, `/extract` catch blocks instead of 302 redirect fallback.
     3. `extractM3u8FromEmbed(embedUrl, customReferer)` argument mismatch in `src/mapper.js:280`.

---

## 5. Verification Method

To independently verify these findings, execute the following reproduction commands:

1. **Verify 403 Fallback & Cache Purging on `/manifest.m3u8`**:
   ```bash
   node -e '
   const express = require("express");
   const axios = require("axios");
   const hlsRouter = require("./src/routes/hls");
   const { m3u8Cache } = require("./src/lib/cache");

   async function test() {
     const mock = express();
     mock.get("/broken.m3u8", (req, res) => res.status(403).send("Forbidden"));
     const cdn = await new Promise(r => { const s = mock.listen(0, "127.0.0.1", () => r(s)); });
     const targetUrl = `http://127.0.0.1:${cdn.address().port}/broken.m3u8`;

     const app = express();
     app.use("/hls", hlsRouter);
     const srv = await new Promise(r => { const s = app.listen(0, "127.0.0.1", () => r(s)); });
     const b64 = Buffer.from(targetUrl).toString("base64url");

     const res = await axios.get(`http://127.0.0.1:${srv.address().port}/hls/manifest.m3u8?url=${b64}`, {
       maxRedirects: 0,
       validateStatus: s => true
     });
     console.log("Status:", res.status, "Location:", res.headers.location);
     console.log("Cached?:", m3u8Cache.get(`m3u8:http://127.0.0.1:${srv.address().port}:${targetUrl}:`) !== undefined);
     cdn.close(); srv.close();
   }
   test();
   '
   ```
   *Expected output*: `Status: 302 Location: <targetUrl>`, `Cached?: false`.

2. **Verify HTML 200 Caching Vulnerability**:
   ```bash
   node -e '
   const express = require("express");
   const axios = require("axios");
   const hlsRouter = require("./src/routes/hls");
   const { m3u8Cache } = require("./src/lib/cache");

   async function test() {
     const mock = express();
     mock.get("/html200.m3u8", (req, res) => res.setHeader("Content-Type", "text/html").send("<html>Error</html>"));
     const cdn = await new Promise(r => { const s = mock.listen(0, "127.0.0.1", () => r(s)); });
     const targetUrl = `http://127.0.0.1:${cdn.address().port}/html200.m3u8`;

     const app = express();
     app.use("/hls", hlsRouter);
     const srv = await new Promise(r => { const s = app.listen(0, "127.0.0.1", () => r(s)); });
     const b64 = Buffer.from(targetUrl).toString("base64url");

     const res = await axios.get(`http://127.0.0.1:${srv.address().port}/hls/manifest.m3u8?url=${b64}`);
     console.log("Status:", res.status);
     console.log("Cached?:", m3u8Cache.get(`m3u8:http://127.0.0.1:${srv.address().port}:${targetUrl}:`) !== undefined);
     cdn.close(); srv.close();
   }
   test();
   '
   ```

3. **Run Existing Test Suite**:
   ```bash
   npm test
   ```
