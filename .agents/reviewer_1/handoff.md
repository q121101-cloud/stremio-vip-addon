# Reviewer 1 Handoff Report: Quality & Adversarial Review of Hotfix v1.5.1

## 1. Observation

Direct code inspections, syntax validations, and empirical test executions were performed across all modified files and subsystems in `/Users/quan/.gemini/antigravity/scratch/stremio-nguonc-addon`:

### 1.1 Code Inspection Findings

1. **`src/providers/vsmov.js` (Multi-Server Audio Separation & Subtitle Extraction)**:
   - Lines 68–94: `classifyServerAudio(serverName)` cleanly distinguishes audio types (`longtieng`, `thuyetminh`, `vietsub`), assigning proper labels (`"Lồng Tiếng"`, `"Thuyết Minh"`, `"Vietsub"`) and distinct binge groups (`vsmov-longtieng-4k-vip-1`, `vsmov-thuyetminh-4k-vip-1`, `vsmov-vietsub-4k-vip-1`).
   - Lines 512–595: The provider iterates across all server tabs (`episodes[sIdx]`) rather than collapsing them into a single stream.
   - Lines 99–211: `resolveEmbedMedia` extracts master playlists and WebVTT/SRT subtitles from player embed configurations and HTML payloads, converting relative subtitle paths to absolute URLs.
   - Lines 570–593: Stream objects strictly enforce the In-App Direct Play protocol: `url` is present, and `externalUrl` is omitted. If soft subtitles exist, they are attached as `subtitles: [{ id: 'vi_vsmov', lang: 'vie', url: proxySubUrl }]`.
   - Engine header updated to `(Engine v1.5.1)` at line 5.

2. **`src/routes/hls.js` (Subtitle Proxy & HLS Rewriter)**:
   - Lines 375–432: Implements `GET /hls/sub.vtt` (and alias `/sub`), supporting `url`, `b64`, `sub`, `ref`, and `referer` parameters.
   - Lines 377–378: Response headers strictly set `Content-Type: text/vtt; charset=utf-8` and `Cache-Control: public, max-age=86400`.
   - Lines 386–393: Upstream headers inject `Referer: https://vsmov.com/` and `Origin: https://vsmov.com` with Chrome User-Agent.
   - Lines 411–423: Content processing cleanly strips UTF-8 BOM (`0xFEFF`), normalizes CRLF line endings to LF, converts SRT timestamp commas (`00:00:01,000` -> `00:00:01.000`), and prepends `WEBVTT\n\n` header if missing.
   - Engine header updated to `(Engine v1.5.1)` at line 5.

3. **`src/providers/kkphim.js` (Container Normalization & Flexible Episode Matcher)**:
   - Line 388 & Line 480: Episode containers are normalized across `server.server_data || server.episode_data || server.items || server.episodes || []`.
   - Lines 66–102: `matchEpisodeItem(ep, targetEpStr, targetEpNum)` flexibly resolves exact string matches (`"1"`), zero-padded variants (`"01"`, `"001"`), Vietnamese prefixes (`"Tập 1"`, `"Tập 01"`), English labels (`"Episode 1"`), slug variants (`"tap-1"`, `"episode-1"`, `"-1"`), numeric regex extraction, and fallback index positioning (`serverData[epNum - 1]`).
   - Line 381: CDN Referer header is set to `https://player.phimapi.com/` and preserved via Base64URL encoding without token corruption.
   - Engine header updated to `(Engine v1.5.1)` at line 5.

4. **`package.json`, `src/manifest.js`, `src/handlers.js` (Synchronous Versioning & Branding)**:
   - `package.json`: `"version": "1.5.1"` at line 3.
   - `src/manifest.js`: `version: '1.5.1'` at line 387.
   - `src/handlers.js`: Status badge `Hệ thống Trực tuyến &nbsp;·&nbsp; v1.5.1` at line 314; footer branding `VIP Movies Addon v1.5.1 • Powered by <span class="brand-highlight">Q121101</span>` at line 436.

5. **`tests/verify_playback.js` (7-Phase E2E Test Suite)**:
   - Phase 1: Addon Manifest & Route Verification (v1.5.1, 22 catalogs).
   - Phase 2: Harry Potter `tt0373889` VSMOV Multi-Server Audio Separation ($\ge 2$ streams, Vietsub + Lồng Tiếng / Thuyết Minh, In-App stream protocol check, subtitle URL detection).
   - Phase 3: Subtitle Proxy Endpoint (`/hls/sub.vtt`) Verification (HTTP 200, `text/vtt`, CORS `*`, `WEBVTT` body header).
   - Phase 4: KKPhim Series Episode (`tt0903747:1:1`) Anti-404 Playback Check (HTTP 200, `#EXTM3U` manifest, no 404).
   - Phase 5: Manifest Proxy & Sub-Variant Playlist Rewriting (HTTP 200, sub-variant traversal, `/hls/segment.ts` rewriting).
   - Phase 6: Real Binary TS Segment Download ($> 50\text{ KB}$, HTTP 200, MPEG-TS sync byte `0x47` verified at packet boundaries).
   - Phase 7: HTTP Range Request Verification (HTTP 206 Partial Content, 1024 bytes).

### 1.2 Empirical Verification Results

1. **Syntax Check**:
   ```bash
   node --check src/index.js src/handlers.js src/manifest.js src/providers/vsmov.js src/providers/kkphim.js src/routes/hls.js
   ```
   - **Result**: Exit code 0, 0 syntax errors.

2. **E2E Playback Test (`tests/verify_playback.js`)**:
   ```bash
   node tests/verify_playback.js
   ```
   - **Result**: 7/7 Phases Passed (100% Success).
   - Phase 1 (Manifest): HTTP 200, 22 catalogs, version 1.5.1.
   - Phase 2 (VSMOV Audio Separation): 2 distinct VSMOV streams returned for `tt0373889` (Vietsub + Thuyết Minh), In-App stream protocol validated (`externalUrl` absent), subtitle URL generated.
   - Phase 3 (Subtitle Proxy): Live subtitle URL fetched, HTTP 200, `Content-Type: text/vtt; charset=utf-8`, CORS `*`, valid `WEBVTT` header.
   - Phase 4 (KKPhim Series Anti-404): `tt0903747:1:1` resolved active `#EXTM3U` manifest with HTTP 200 (No 404).
   - Phase 5 (Playlist Rewriting): Rewrote master & variant playlists to `/hls/segment.ts` proxy URLs.
   - Phase 6 (Segment Download): Downloaded real video segment of 7,447,877 bytes ($7,273.32\text{ KB} > 50\text{ KB}$) with confirmed MPEG-TS sync byte `0x47` at boundary 188.
   - Phase 7 (HTTP Range Seeking): Range `bytes=0-1023` returned HTTP 206 Partial Content with exactly 1024 bytes.

3. **Core Integration Test Suite (`npm test`)**:
   ```bash
   npm test
   ```
   - **Result**: 50/50 tests passed, 0 failures.

4. **Empirical Adversarial & Challenger Suites**:
   - `node tests/test_adversarial_m2.js`: 4/4 test suites passed.
   - `node tests/challenger_m2_2_empirical.test.js`: 56/56 assertions passed (audited 42 stream objects across 13 titles; 0 occurrences of `externalUrl`).
   - `node tests/test_m1_preview_challenger2.js`: 103/103 assertions passed (including 50 parallel requests concurrency stress test).

### 1.3 Adversarial Integrity Check
- **Hardcoding Check**: No hardcoded test responses or static facade URLs in source files. All stream resolution is dynamically derived from upstream API calls.
- **Dummy/Facade Check**: Real parser logic for SRT/WebVTT conversion, BOM removal, regex audio classification, and M3U8 proxy line rewriting is fully operational.
- **Shortcuts / Bypass Check**: None.
- **Fabricated Outputs Check**: None. All outputs verified live against live servers.

---

## 2. Logic Chain

1. **Requirement R1 (VSMOV Audio Separation & Subtitles)**: Observation §1.1.1 and §1.2.2 demonstrate that `src/providers/vsmov.js` extracts all server tabs from VSMOV API, correctly categorizes them into Vietsub, Lồng Tiếng, and Thuyết Minh, attaches `/hls/sub.vtt` subtitle descriptors when available, and strictly adheres to the In-App stream protocol (`url` present, `externalUrl` omitted).
2. **Requirement R2 (Subtitle Proxy Endpoint)**: Observation §1.1.2 and §1.2.4 demonstrate that `/hls/sub.vtt` successfully decodes parameters, proxies upstream subtitles with anti-hotlinking headers, converts SRT to WebVTT, strips BOMs, and sets standard caching and CORS headers.
3. **Requirement R3 (KKPhim 404 Fix & Container Normalization)**: Observation §1.1.3 and §1.2.2 demonstrate that `matchEpisodeItem` and multi-container fallback prevent 404 errors for series episodes across diverse naming schemes.
4. **Requirement R4 (E2E Test Suite & TS Sync Byte)**: Observation §1.1.5 and §1.2.2 demonstrate that `tests/verify_playback.js` reliably validates manifest integrity, audio separation, subtitle proxying, anti-404 playback, sub-variant rewriting, binary chunk delivery (>50KB with `0x47` sync byte), and HTTP 206 range seeking.
5. **Requirement R5 (Versioning & UI Footer)**: Observation §1.1.4 demonstrates that version strings and Cyber-Glassmorphism branding signatures (`VIP Movies Addon v1.5.1 • Powered by <span class="brand-highlight">Q121101</span>`) are synchronized across all manifest, handler, and package files.

---

## 3. Caveats

- **Transient Upstream Rate Limiting**: If automated test suites are executed in rapid parallel succession against `phimapi.com`, upstream may occasionally return HTTP 429 rate limit responses. The provider handles this gracefully via 5-second timeouts and fallback mechanisms.
- **Dynamic Upstream Subtitle Availability**: Movies lacking soft subtitle tracks upstream will omit the `subtitles` array on their stream object, which complies with the Stremio protocol.

---

## 4. Conclusion

**Verdict: APPROVE**

Hotfix v1.5.1 satisfies 100% of functional requirements, architectural invariants, security constraints, and adversarial test criteria with zero integrity violations. The codebase is clean, well-tested, and ready for deployment.

---

## 5. Verification Method

To independently reproduce the complete verification of Hotfix v1.5.1:

```bash
# 1. Syntax Check
node --check src/index.js src/handlers.js src/manifest.js src/providers/vsmov.js src/providers/kkphim.js src/routes/hls.js

# 2. Comprehensive 7-Phase E2E Playback Verification
node tests/verify_playback.js

# 3. Core Integration Test Suite
npm test

# 4. Adversarial & Subtitle Verification Suites
node tests/test_adversarial_m2.js
node tests/test_m1_preview_challenger2.js
node tests/challenger_m2_2_empirical.test.js
```

### Invalidation Conditions:
- Any failure in `node --check` syntax check.
- `tests/verify_playback.js` failing any of the 7 phases.
- Any stream object containing `externalUrl`.
- Missing or malformed version string (`1.5.1`) or brand signature (`Q121101`).
