# Handoff Report: Explorer 3 Survey for Engine v1.6.0 Upgrade

**Target File**: `/Users/quan/.gemini/antigravity/scratch/stremio-nguonc-addon/.agents/teamwork_preview_explorer_survey_3/handoff.md`  
**Date**: 2026-08-18T11:40:00+07:00  
**Agent**: Explorer 3 (Survey & Investigation)

---

## 1. Observation

Direct empirical observations from examining codebase files and running test suites:

### 1.1 `src/routes/hls.js` — Referer Routing & Proxied TS Headers
- **File Location**: `/Users/quan/.gemini/antigravity/scratch/stremio-nguonc-addon/src/routes/hls.js`
- **Lines 27–36**: `SOURCE_REFERERS` array definition:
  ```javascript
  const SOURCE_REFERERS = [
    { pattern: /kkphimplayer|phim1280|phimapi\.com|kkphim/i, referer: 'https://player.phimapi.com/', origin: 'https://player.phimapi.com' },
    { pattern: /vsmov|streamvsmov|p25\.streamvsmov/i,        referer: 'https://vsmov.com/',           origin: 'https://vsmov.com' },
    { pattern: /nguonc\.com/i,                               referer: 'https://phim.nguonc.com/',     origin: 'https://phim.nguonc.com' },
    { pattern: /streamc\.|amass2\.top/i,                     referer: 'https://embed15.streamc.xyz/', origin: 'https://embed15.streamc.xyz' },
    { pattern: /suutamphim|tvhay/i,                          referer: 'https://suutamphim.org/',      origin: 'https://suutamphim.org' },
    { pattern: /hh3d|hoathinh3d/i,                           referer: 'https://hh3d.tv/',             origin: 'https://hh3d.tv' },
    { pattern: /yanhh3d|yan/i,                               referer: 'https://yanhh3d.org/',         origin: 'https://yanhh3d.org' },
    { pattern: /clbphimxua|clbpx/i,                          referer: 'https://clbphimxua.com/',      origin: 'https://clbphimxua.com' },
  ];
  ```
- **Referer Resolution Mechanism** (`getRefererHeaders`, lines 43–67):
  - Line 44: If `refParam` query parameter is passed (`?ref=...`), it is decoded and used directly with its derived origin: `const origin = new URL(parsedRef).origin; return { referer: parsedRef, origin };`.
  - Lines 55–59: If `refParam` is absent, it iterates over `SOURCE_REFERERS` matching against `targetUrl` via `src.pattern.test(targetUrl)`.
  - Lines 61–66: Fallback extracts `new URL(targetUrl).origin` or `DEFAULT_REFERER = 'https://phim.nguonc.com/'`.
- **Manifest Rewriter** (`/manifest.m3u8`, lines 146–327):
  - Line 156: Computes `const { referer: refererUrl, origin } = getRefererHeaders(targetUrl, refParam);`.
  - Line 183: Encodes referer: `const encodedRef = Buffer.from(refererUrl).toString('base64url');`.
  - Line 296: Rewrites segment URIs: `${protoHost}/hls/segment.ts?url=${b64Url}&ref=${encodedRef}`.
  - Also rewrites sub-playlists (line 291), audio/subtitles (line 237), encryption keys (line 251), and fMP4 init maps (line 263).
- **Segment Proxy** (`/segment.ts`, lines 330–387):
  - Lines 339–346: Calls `getRefererHeaders(targetUrl, refParam)` and creates `upstreamHeaders`:
    ```javascript
    const upstreamHeaders = {
      'User-Agent': HLS_UA,
      Referer: refererUrl,
      Origin: origin,
      Accept: '*/*',
    };
    if (req.headers.range) upstreamHeaders['Range'] = req.headers.range;
    ```
  - Lines 354–363: Makes upstream stream request using `axios` with `upstreamHeaders`.

### 1.2 Required Updates for the 3 New Domains in `SOURCE_REFERERS`
1. **STP**: `suutamphim.org` → `sieutamphim.pro`
   - Old: `{ pattern: /suutamphim|tvhay/i, referer: 'https://suutamphim.org/', origin: 'https://suutamphim.org' }`
   - New: `{ pattern: /sieutamphim|suutamphim|tvhay/i, referer: 'https://sieutamphim.pro/', origin: 'https://sieutamphim.pro' }`
2. **CLBPX**: `clbphimxua.com` → `clbphimxua.info`
   - Old: `{ pattern: /clbphimxua|clbpx/i, referer: 'https://clbphimxua.com/', origin: 'https://clbphimxua.com' }`
   - New: `{ pattern: /clbphimxua|clbpx/i, referer: 'https://clbphimxua.info/', origin: 'https://clbphimxua.info' }`
3. **YAN**: `yanhh3d.org` → `yanhh3d.pw`
   - Old: `{ pattern: /yanhh3d|yan/i, referer: 'https://yanhh3d.org/', origin: 'https://yanhh3d.org' }`
   - New: `{ pattern: /yanhh3d|yan/i, referer: 'https://yanhh3d.pw/', origin: 'https://yanhh3d.pw' }`

---

### 1.3 Test Suite Baseline Status & Requirements

#### A. Existing Test Suites Execution Status
- Command: `node tests/verify_playback.js`
  - Result: **7/7 PASS (100% Success)** in 4.61s (Exit Code 0).
  - Phases checked: Manifest/Catalogs, Harry Potter VSMOV Multi-Server Audio, Subtitle Proxy (`/hls/sub.vtt`), KKPhim Series Episode Anti-404, M3U8 Sub-Variant Rewriting, Segment Binary Download (>50KB, sync byte 0x47), HTTP Range 206 Seeking.
- Command: `node tests/verify_hotfix_vsmov_kkphim.js`
  - Result: **27/27 Assertions PASS (100% Success)** in 3.85s (Exit Code 0).
  - Phases checked: `/hls/sub.vtt` endpoint validation & SRT→WebVTT auto-conversion, KKPhim Smart Search fallback (Avengers 3 tt5095030), KKPhim series episode matching, M3U8 subtitle injection, public Mux TS segment download.
- Command: `node src/test.js`
  - Result: **50/50 Assertions PASS (100% Success)** in 1.4s (Exit Code 0).
- Command: `node --check src/index.js`
  - Result: **Exit Code 0 (No syntax errors)**.

#### B. Architectural Requirements for New Test Suite: `tests/verify_new_providers.js`
1. **Server Lifecycle Management**:
   - Start Express app dynamically on ephemeral port 0 (`app.listen(0, '127.0.0.1')`).
   - Clean shutdown in `finally` block to prevent orphaned listening sockets.
2. **Phase 1 — Server & Manifest Health Check**:
   - `GET /health` returns HTTP 200 with `{ status: 'ok', version: '1.6.0' }` and provider list containing `stp`, `clbpx`, `yan`.
   - `GET /manifest.json` returns HTTP 200 with catalogs array including catalogs from `stp`, `clbpx`, `yan`.
3. **Phase 2 — Direct Provider Search & Stream Invariant Checks**:
   - Test `stp.getCatalog()`, `stp.search()`, `stp.getStreams()`.
   - Test `clbpx.getCatalog()`, `clbpx.search()`, `clbpx.getStreams()`.
   - Test `yan.getCatalog()`, `yan.search()`, `yan.getStreams()`.
   - Verify every stream:
     - `name === 'VIP Movies 🎬'`
     - `url` routes via `/hls/manifest.m3u8`
     - `externalUrl === undefined` and `!('externalUrl' in stream)` (STRICT In-App Direct Play invariant)
     - Branded stream title contains provider indicator:
       - STP: `[VIP 4 • STP] ... \n⚡ Server STP • sieutamphim.pro`
       - CLBPX: `[VIP 5 • CLBPX] ... \n⚡ Server CLBPX • clbphimxua.info`
       - YAN: `[VIP 6 • YAN] ... \n⚡ Server YAN • yanhh3d.pw`
4. **Phase 3 — Manifest Proxy Route Verification (`/hls/manifest.m3u8`)**:
   - Request proxied m3u8 for resolved provider stream URL (with fallback public Mux stream).
   - Assert HTTP 200, Content-Type `application/vnd.apple.mpegurl` (or plain text), body starts with `#EXTM3U`.
   - Assert all child segment URLs rewritten to `/hls/segment.ts?url=...&ref=...`.
5. **Phase 4 — Stream Aggregator Safety (`/:config/stream/:type/:id.json` & `/stream/:type/:id.json`)**:
   - Request movie stream (`/default/stream/movie/tt0373889.json`) and series stream (`/default/stream/series/tt0903747:1:1.json`).
   - Assert HTTP 200, does not throw/crash, returns `{ streams: [...] }`.
6. **Phase 5 — TS Segment Download & Binary Inspection (`/hls/segment.ts`)**:
   - Request `.ts` segment URL resolved from Phase 3.
   - Assert HTTP 200 (or 206).
   - Assert downloaded buffer size > 10,000 bytes (>10KB).
   - Assert MPEG-TS sync byte `0x47` is present (at offset 0 or packet boundaries).
7. **Phase 6 — HTTP Range 206 Support**:
   - Send `Range: bytes=0-1023` to `/hls/segment.ts`.
   - Assert HTTP 206, `Content-Range` header present, buffer length is 1024 bytes.

---

### 1.4 Version Bump Locations

| File Path | Exact Line(s) | Current Content | Proposed Content (v1.6.0) |
|---|---|---|---|
| `package.json` | Line 3 | `"version": "1.5.2"` | `"version": "1.6.0"` |
| `src/manifest.js` | Line 5 | `* VIP Movies Stremio Addon - src/manifest.js (v1.5.2)` | `* VIP Movies Stremio Addon - src/manifest.js (v1.6.0)` |
| `src/manifest.js` | Line 387 | `version: '1.5.2',` | `version: '1.6.0',` |
| `src/handlers.js` | Line 5 | `* VIP Movies Addon — src/handlers.js (Engine v1.5.2)` | `* VIP Movies Addon — src/handlers.js (Engine v1.6.0)` |
| `src/handlers.js` | Line 881 | `🟢 Server VIP Core Online &nbsp;·&nbsp; v1.5.2` | `🟢 Server VIP Core Online &nbsp;·&nbsp; v1.6.0` |
| `src/handlers.js` | Line 1035 | `VIP Movies Addon v1.5.2 • Designed with Taste by <span class="brand-highlight">Q121101</span>` | `VIP Movies Addon v1.6.0 • Designed with Taste by <span class="brand-highlight">Q121101</span>` |
| `src/index.js` | Line 5 | `* VIP Movies Stremio Addon — src/index.js (Engine v1.5.2)` | `* VIP Movies Stremio Addon — src/index.js (Engine v1.6.0)` |
| `src/index.js` | Line 105 | `║ 🎬 VIP Movies Stremio Addon Engine v1.5.2 ║` | `║ 🎬 VIP Movies Stremio Addon Engine v1.6.0 ║` |
| `src/config.js` | Line 5 | `* VIP Movies Stremio Addon - src/config.js (v1.5.2)` | `* VIP Movies Stremio Addon - src/config.js (v1.6.0)` |
| `src/routes/hls.js` | Line 5 | `* VIP Movies Addon — src/routes/hls.js (Engine v1.5.2)` | `* VIP Movies Addon — src/routes/hls.js (Engine v1.6.0)` |

---

## 2. Logic Chain

1. **Premise 1**: The new provider domains are `sieutamphim.pro` (STP), `clbphimxua.info` (CLBPX), and `yanhh3d.pw` (YAN).
2. **Premise 2**: When streams are generated by these providers, their `.m3u8` manifests and `.ts` video chunks are routed through `/hls/manifest.m3u8` and `/hls/segment.ts`. Upstream CDNs for these domains require exact `Referer` and `Origin` headers to avoid HTTP 403 Forbidden.
3. **Inference 1**: `src/routes/hls.js` injects `Referer` headers based on `ref` parameter or matching `targetUrl` against `SOURCE_REFERERS`. Updating `SOURCE_REFERERS` ensures that even when a sub-segment or direct query lacks an explicit `refParam`, the proxy router correctly matches the new domains and injects the proper upstream headers.
4. **Premise 3**: The addon architecture requires zero regressions on existing providers (`vsmov`, `kkphim`, `nguonc`).
5. **Inference 2**: Existing test suites `verify_playback.js` (7/7) and `verify_hotfix_vsmov_kkphim.js` (27/27) already pass 100% and must continue to pass 100% post-implementation.
6. **Premise 4**: Testing the 3 new providers requires end-to-end confirmation of server startup, provider stream parsing, manifest proxy rewriting, aggregator fault isolation, and binary segment download.
7. **Inference 3**: `tests/verify_new_providers.js` must implement full E2E lifecycle validation against all 3 providers and core endpoints without depending on external manual setup.
8. **Premise 5**: Version 1.6.0 release requires exact branding synchronization across manifest metadata, health check, package manifest, and HTML UI.
9. **Inference 4**: Changing the 10 identified locations guarantees that `GET /manifest.json`, `GET /health`, `GET /`, and `package.json` return `1.6.0` consistently.

---

## 3. Caveats

1. **Live Upstream Availability**: The live servers of `sieutamphim.pro`, `clbphimxua.info`, and `yanhh3d.pw` are external 3rd-party services that may experience temporary network outages or ISP blocking. In `tests/verify_new_providers.js`, tests should verify direct provider stream extraction when live, and provide robust fallback verification (e.g. public Mux HLS stream or mock provider structure) so tests remain deterministic in CI/isolated environments while strictly asserting provider output invariants (`name`, `url`, `no externalUrl`, `title branding`).
2. **No modifications made yet**: Per Explorer role instructions, this investigation was conducted in strict read-only mode without mutating application source files or test scripts.

---

## 4. Conclusion

1. **HLS Proxy Router (`src/routes/hls.js`)**:
   - `SOURCE_REFERERS` is the central mapping for Referer & Origin injection in segment and manifest proxies.
   - 3 entries need updating to support `sieutamphim.pro`, `clbphimxua.info`, and `yanhh3d.pw`.
2. **Zero Regression Baseline**:
   - `tests/verify_playback.js` passes 7/7.
   - `tests/verify_hotfix_vsmov_kkphim.js` passes 27/27.
   - `src/test.js` passes 50/50.
3. **New Test Suite Plan (`tests/verify_new_providers.js`)**:
   - Ephemeral server setup with 6 distinct phases covering health/manifest, STP/CLBPX/YAN stream contracts, HLS manifest proxy rewriting, aggregator fault tolerance, TS segment download (>10KB, 0x47 sync byte), and Range 206 seeking.
4. **Version Bump Plan**:
   - 10 exact line locations documented across `package.json`, `src/manifest.js`, `src/handlers.js`, `src/index.js`, `src/config.js`, `src/routes/hls.js`.

---

## 5. Verification Method

To independently verify all findings in this survey:

1. **Verify Existing Tests**:
   ```bash
   node tests/verify_playback.js
   node tests/verify_hotfix_vsmov_kkphim.js
   node src/test.js
   ```
   *Expected*: 7/7, 27/27, and 50/50 PASS with exit code 0.

2. **Verify Syntax of Surveyed Core Files**:
   ```bash
   node --check src/routes/hls.js
   node --check src/manifest.js
   node --check src/handlers.js
   node --check src/index.js
   node --check src/config.js
   ```
   *Expected*: Exit code 0 for all files.

3. **Verify Version Bump Targets**:
   Inspect line 3 of `package.json`, line 387 of `src/manifest.js`, and lines 881 & 1035 of `src/handlers.js`.
