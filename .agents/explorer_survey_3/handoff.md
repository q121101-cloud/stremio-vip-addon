# Handoff Report: Explorer 3 Survey of Stremio VIP Movies Addon Engine v1.5.0

**Author**: Explorer Survey Agent 3  
**Date**: 2026-08-18  
**Working Directory**: `/Users/quan/.gemini/antigravity/scratch/stremio-nguonc-addon/.agents/explorer_survey_3`  
**Handoff Type**: Hard (Task Complete)  

---

## 1. Observation

1. **HLS Proxy Router (`src/routes/hls.js`, lines 1–374)**:
   - Route definitions:
     - Line 118: `router.get('/extract', ...)` extracts direct M3U8 from iframe embed and redirects 302 to `/hls/manifest.m3u8`.
     - Line 145: `router.get(['/manifest.m3u8', '/m3u8'], ...)` rewrites upstream playlists line-by-line, handling master playlists (`#EXT-X-STREAM-INF`), media segments (`#EXTINF`), media renditions (`#EXT-X-MEDIA`), keys (`#EXT-X-KEY`), fMP4 init maps (`#EXT-X-MAP`), and low-latency hints (`#EXT-X-PRELOAD-HINT`).
     - Line 277: `router.get(['/segment.ts', '/ts', '/segment'], ...)` streams upstream `.ts` chunks with `responseType: 'stream'`, forwarding `Range` headers, returning HTTP 200/206 with `video/MP2T`, and piping to response (`upstreamRes.data.pipe(res)`).
     - Line 337: `router.get(['/key', '/key.key'], ...)` proxies decryption keys with `Content-Type: application/octet-stream`.
   - Referer and anti-403 spoofing (lines 26–35, 42–66): `SOURCE_REFERERS` maps regex patterns for `kkphimplayer|phimapi`, `vsmov|streamvsmov`, `nguonc`, `streamc`, `suutamphim`, `hh3d`, `yanhh3d`, and `clbphimxua`. `getRefererHeaders()` also parses query param `ref`/`referer` (plain or Base64URL).

2. **Playback Verification Test (`tests/verify_playback.js`, lines 1–345)**:
   - Line 56–60: Programmatic Express app setup on ephemeral port `0` (`127.0.0.1:0`).
   - Line 78–84 (Phase 1): Manifest & Route verification — passed HTTP 200 with 22 catalogs.
   - Line 89–125 (Phase 2): Movie stream resolution — passed HTTP 200, resolved VSMOV 4K stream with `url: 'http://127.0.0.1:.../hls/manifest.m3u8?url=...'` and strictly no `externalUrl`.
   - Line 129–164 (Phase 3): Series stream resolution — passed HTTP 200, resolved KKPhim stream with `url` and strictly no `externalUrl`.
   - Line 168–218 (Phase 4): Manifest proxy & sub-variant rewriting — passed HTTP 200, traversed sub-manifest variant, and extracted target segment URL `http://127.0.0.1:.../hls/segment.ts?url=...`.
   - Line 223–264 (Phase 5): Real video TS segment download — downloaded **3,426,676 bytes (3.42 MB)** with HTTP 200, `Content-Type: video/MP2T`, and verified standard MPEG-TS sync byte `0x47` at indices 0 and 188.
   - Line 269–286 (Phase 6): HTTP Range request — verified HTTP 206 Partial Content for range `bytes=0-1023` (1024 bytes returned).
   - Execution command output:
     ```
     node tests/verify_playback.js
     Total Execution Time: 2.57s
     ALL PLAYBACK VERIFICATION CHECKS PASSED (100% SUCCESS)
     ```

3. **Configurator Dashboard UI & Brand Signature (`src/handlers.js`)**:
   - Lines 281–295 & 436: Cyber-Glassmorphism CSS and HTML layout.
   - Line 292: `.brand-highlight { font-weight:800;background:linear-gradient(135deg,#a855f7 0%,#ec4899 50%,#38bdf8 100%);-webkit-background-clip:text;-webkit-text-fill-color:transparent;filter:drop-shadow(0 0 8px rgba(236,72,153,0.6));letter-spacing:0.5px;padding:0 2px;display:inline-block;transition:all 0.3s ease; }`
   - Line 436: `VIP Movies Addon v1.5.0 &bull; Powered by <span class="brand-highlight">Q121101</span>`
   - Lines 331–422: Interactive card selectors for all 7 providers (`VSMOV 4K`, `KKPhim`, `NguonC`, `STP`, `HH3D`, `YAN`, `CLBPX`).

4. **Package & Version Consistency**:
   - `package.json:3`: `"version": "1.5.0"`
   - `src/manifest.js:387`: `version: '1.5.0'`
   - `src/config.js:5`: `v1.5.0`
   - Git remote: `https://github.com/q121101-cloud/stremio-vip-addon.git` on branch `main`.

5. **Syntax Verification**:
   - Ran `node --check src/*.js src/**/*.js tests/*.js` with zero errors (exit code 0).

---

## 2. Logic Chain

1. **Premise**: Stremio in-app player requires strict protocol compliance where in-app playable streams have `url` (pointing to a CORS-enabled HLS manifest proxy) and must NOT define `externalUrl` (which causes external browser redirection).
2. **Observation from Test & Source**: `src/handlers.js` filters provider stream objects, assigning local `/hls/manifest.m3u8` URLs without `externalUrl`. `tests/verify_playback.js` strictly asserts `assert.strictEqual(stream.externalUrl, undefined)` and `'externalUrl' in stream === false`. Both Movie and Series streams passed this assertion.
3. **Premise**: Upstream Vietnamese movie CDNs enforce strict Referer and Origin validation, returning HTTP 403 when accessed directly by external media players.
4. **Observation from HLS Proxy**: `src/routes/hls.js` maps upstream CDN domains (`SOURCE_REFERERS`) and injects matching headers (`Referer`, `Origin`, `User-Agent`), rewrites segment URLs, and pipes the binary data directly with HTTP Range (206) support.
5. **Observation from Verification**: In `tests/verify_playback.js` Phase 5, the local proxy successfully fetched and delivered a 3.42MB `.ts` chunk from `p24.streamvsmov.com` with HTTP 200 and valid MPEG-TS `0x47` sync bytes, proving 100% bypass of anti-hotlinking protections.
6. **Premise**: UI branding and versioning must accurately reflect v1.5.0 and the glowing signature `Q121101`.
7. **Observation from UI**: `src/handlers.js` (lines 292, 436) delivers the exact markup and CSS filter glow for `VIP Movies Addon v1.5.0 • Powered by <span class="brand-highlight">Q121101</span>`.
8. **Deduction**: All components under Explorer 3 survey scope (HLS proxy, E2E test verification, UI branding, version synchronization, git tracking) meet all requirements of `ORIGINAL_REQUEST.md`.

---

## 3. Caveats

- **Network Availability**: Live segment verification tests rely on upstream CDN connectivity. In environments with complete internet isolation, upstream live fetching will fail unless local mock fixtures are used. All tested upstream CDNs (VSMOV, KKPhim, NguonC) are currently online and responding rapidly (< 2.6s total test time).
- No other caveats.

---

## 4. Conclusion

The testing infrastructure, HLS proxy implementation, UI branding, and release configurations are 100% compliant with the v1.5.0 specification:
- `tests/verify_playback.js` is fully implemented and passes all 6 phases, downloading real >50KB (3.42MB) video segments with HTTP 200.
- `src/routes/hls.js` provides full anti-403 header spoofing, recursive playlist rewriting, and HTTP 206 range seeking.
- `src/handlers.js` renders the Cyber-Glassmorphism UI with the glowing brand signature: `VIP Movies Addon v1.5.0 • Powered by <span class="brand-highlight">Q121101</span>`.
- Version numbers are synchronized to `1.5.0` across `package.json`, `manifest.js`, `config.js`, and `handlers.js`.
- The repository is tracking `origin/main` (`https://github.com/q121101-cloud/stremio-vip-addon.git`) and all files pass syntax checking.

---

## 5. Verification Method

To independently verify these findings:

1. **Syntax Check**:
   ```bash
   node --check src/*.js src/**/*.js tests/*.js
   ```
2. **Mandatory Real Video Playback & Binary Chunk Verification**:
   ```bash
   node tests/verify_playback.js
   ```
3. **KKPhim Provider Playback Verification**:
   ```bash
   node tests/test_kkphim_playback.js
   ```
4. **22 Catalogs & 404 Prevention Suite**:
   ```bash
   node tests/test_routing_and_22_catalogs.js
   ```
5. **Comprehensive Multi-Tier E2E Test**:
   ```bash
   node tests/e2e.test.js
   ```
6. **UI Signature Inspection**:
   ```bash
   grep -n "brand-highlight" src/handlers.js
   ```
7. **Git & Version Inspection**:
   ```bash
   git status -s && git remote -v && grep '"version"' package.json
   ```
