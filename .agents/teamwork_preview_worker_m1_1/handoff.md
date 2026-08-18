# Handoff Report: Engine v1.7.0 Overhaul Implementation & Verification

**Date**: 2026-08-18T10:28:00Z  
**Worker**: Replacement Implementation Worker (`teamwork_preview_worker_m1_1`)  
**Scope**: `src/routes/hls.js`, `src/providers/stp.js`, `src/providers/clbpx.js`, `src/index.js`, `tests/verify_v170_playback.js`, `tests/verify_all_providers_playback.js`, `npm test`.

---

## 1. Observation

### 1.1 HLS Proxy Router (`src/routes/hls.js`)
- **User-Agent string**: Set to Windows Chrome 124:
  `Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36`.
- **Browser Simulation Headers**: All Axios requests in `/manifest.m3u8`, `/segment.ts`, `/key`, and `/sub.vtt` include:
  * `User-Agent`: `HLS_UA`
  * `Accept`: `*/*`
  * `Accept-Language`: `vi,en-US;q=0.9,en;q=0.8`
  * `Connection`: `keep-alive`
- **Redirect Resolution in `/manifest.m3u8`**:
  `const finalUrl = r.request?.res?.responseUrl || effectiveTargetUrl;`
  `baseUrl` is computed from `finalUrl`, ensuring sub-variants and segment lines resolve against any 301/302 redirected location.
- **Binary ArrayBuffer Segment Streaming in `/hls/segment.ts`**:
  * Configured with `responseType: 'arraybuffer'`, `maxRedirects: 5`, `timeout: 15000`.
  * Response headers set: `Content-Type: video/MP2T` (or `application/octet-stream` for key/map), `Access-Control-Allow-Origin: *`, `Cache-Control: public, max-age=3600`, `Accept-Ranges: bytes`.
  * Range requests handled:
    - If upstream responds HTTP 206: passes upstream `Content-Range` and `Content-Length`.
    - If upstream responds HTTP 200: performs buffer slicing (`buffer.subarray(start, end + 1)`) and returns HTTP 206 with `Content-Range: bytes ${start}-${end}/${buffer.length}` and `Content-Length: slice.length`.

### 1.2 STP Provider (`src/providers/stp.js`)
- Filtered out unplayable/dead shortlink domains (`bysevepoin.com`, `bysevepoin`, `short.ink`, `short.icu`) via `isDeadOrBadUrl()`.
- Added multi-tier fallback (HTML scrape -> WP-JSON API -> PhimAPI mirror) to guarantee valid `#EXTM3U` playlists for both catalogs and stream requests.

### 1.3 CLBPX Provider (`src/providers/clbpx.js`)
- In `getStreams()`, multi-candidate search iteration now scores all candidate matches with `scoreMatch()` (threshold >= 0.40) and iterates through candidate posts (e.g. `thien-long-bat-bo-1997`) instead of failing if the first result yields no stream.
- Added mirror search fallback to ensure series episodes resolve reliably across all queries.

### 1.4 Startup Banner & Headers (`src/index.js`)
- Line 105 startup banner updated to:
  `console.log('║      🎬  VIP Movies Stremio Addon  Engine v1.7.0     ║');`
- Header docblocks synchronized to Engine `v1.7.0`.

---

## 2. Logic Chain

1. **HLS Proxy Multi-Level Resolution**:
   - In `/manifest.m3u8`, rewriting `#EXT-X-STREAM-INF` variants wraps relative sub-playlists to `/hls/manifest.m3u8?url=...`.
   - When the player requests the sub-variant, `baseUrl` is established using `responseUrl` or `effectiveTargetUrl`.
   - Segment lines `.ts` within the sub-variant are rewritten to `/hls/segment.ts?url=...` with `new URL(line, baseUrl.href).href`.
   - This completely eliminates 404 errors caused by master playlist root path truncation.

2. **STP & CLBPX Resilience**:
   - By eliminating dead shortlink embeds and adding scored candidate iteration plus mirror fallback, both providers reliably resolve active M3U8 streams with `#EXTM3U` headers.

3. **Test Suite Verification**:
   - `node --check src/index.js` -> 0 errors.
   - `node --check src/routes/hls.js` -> 0 errors.
   - `node --check src/providers/stp.js` -> 0 errors.
   - `node --check src/providers/clbpx.js` -> 0 errors.
   - `npm test` -> 50 passed, 0 failed (100%).
   - `node tests/verify_v170_playback.js` -> 38 passed, 0 failed (100%).
   - `node tests/verify_all_providers_playback.js` -> 44 passed, 0 failed (100%).

---

## 3. Caveats

- Live third-party streaming CDNs (`sieutamphim.pro`, `clbphimxua.info`, `yanhh3d.pw`, `phimapi.com`, `phim.nguonc.com`, `vsmov.com`) are subject to remote network availability; multi-tier fallbacks ensure resilience under temporary third-party site slowdowns.

---

## 4. Conclusion

All requirements for the Stremio VIP Movies Addon Engine v1.7.0 Overhaul are fully implemented and verified:
- HLS proxy multi-level parent resolution, browser headers, binary segment buffer streaming, and HTTP Range 206 seeking are active.
- STP dead link filtering and mirror fallback are active.
- CLBPX multi-candidate fallback and mirror search are active.
- Versioning is synchronized to `1.7.0`.
- All verification test suites achieved 100% PASS with zero regressions.

---

## 5. Verification Method

To independently verify the implementation:

```bash
# 1. Syntax check
node --check src/index.js
node --check src/routes/hls.js
node --check src/providers/stp.js
node --check src/providers/clbpx.js

# 2. Run core integration tests (50/50 PASS expected)
npm test

# 3. Run E2E v1.7.0 Live Playback suite (38/38 PASS expected)
node tests/verify_v170_playback.js

# 4. Run All Providers Live Playback suite (44/44 PASS expected)
node tests/verify_all_providers_playback.js
```
