# Challenge & Verification Handoff Report — Hotfix v1.5.1

**Agent**: `challenger_1` (Critic & Specialist)  
**Project**: Stremio VIP Movies Addon Engine v1.5.1  
**Timestamp**: 2026-08-18T02:36:00Z  
**Verdict**: **APPROVE**

---

## 1. Observation

Direct empirical execution of adversarial test suites and integration verification was performed on live local instances with ephemeral port binding:

### 1.1 `node --check` (Syntax Verification)
```bash
node --check src/index.js src/handlers.js src/manifest.js src/providers/vsmov.js src/providers/kkphim.js src/routes/hls.js
```
- **Exit code**: `0` (Zero syntax errors across all core and provider modules).

### 1.2 `npm test` (Core Integration Suite)
- **Result**: `50 passed, 0 failed` (100% PASS).
- Verified manifest routes, 22 catalogs, search query filters, metadata retrieval for movies and series, stream generation, and `/health` returning version `1.5.1`.

### 1.3 `node tests/verify_playback.js` (E2E Playback & Subtitle Verification)
- **Result**: `7/7 phases PASSED (100% SUCCESS)`.
  - **Phase 1 (Manifest & Route Integrity)**: `GET /manifest.json` returned HTTP 200 with version `1.5.1` and 22 declared catalogs.
  - **Phase 2 (Harry Potter `tt0373889` VSMOV Multi-Server Audio Separation)**: Resolved 2 distinct VSMOV streams (`Vietsub` and `Lồng Tiếng`), distinct binge groups (`vsmov-vietsub-4k-vip-1`, `vsmov-longtieng-4k-vip-1`), and attached subtitle proxy URL `http://127.0.0.1:58287/hls/sub.vtt?url=...`.
  - **Phase 3 (Subtitle Proxy Endpoint `/hls/sub.vtt`)**: Fetched live subtitle; verified HTTP 200, `Content-Type: text/vtt; charset=utf-8`, CORS `Access-Control-Allow-Origin: *`, and body starting with `WEBVTT`.
  - **Phase 4 (KKPhim Series Anti-404 `tt0903747:1:1`)**: Returned HTTP 200 with 2 high-speed streams, manifest proxy URL returning HTTP 200 `#EXTM3U` playlist with zero 404s.
  - **Phase 5 (M3U8 Master & Sub-Variant Rewriting)**: Fetched master playlist, traversed sub-variant playlist, verified `#EXTM3U` and rewritten segment URL `http://127.0.0.1:58287/hls/segment.ts?url=...`.
  - **Phase 6 (Real Binary Video Segment Download)**: Downloaded TS segment of **7,447,877 bytes (~7.27 MB > 50KB)**; MPEG-TS sync byte `0x47` confirmed across 188-byte packet boundaries.
  - **Phase 7 (HTTP Range Seeking)**: `Range: bytes=0-1023` returned **HTTP 206 Partial Content** with header `Content-Range: bytes 0-1023/7447877`.

### 1.4 `node tests/verify_vsmov_sub_audio.js` & `node tests/test_m1_subtitle_proxy.js`
- **Result**: `61/61 assertions passed` and `26/26 assertions passed`.
- Verified SRT to WebVTT comma-to-period timestamp conversions (`00:00:01,000` -> `00:00:01.000`), UTF-8 BOM stripping (`\uFEFF`), CRLF normalization, route aliases (`/hls/sub`, `/hls/sub.vtt`), parameter aliases (`url`, `b64`, `sub`), and upstream 404/500 forwarding.

### 1.5 `node tests/challenger_hotfix_v151_empirical.test.js` (Adversarial Stress Harness)
- **Result**: `107/107 checks PASSED (100% SUCCESS)`.
  - **Phase 1 (Manifest & Health Integrity)**: Version `1.5.1`, 22 catalogs, CORS `*`.
  - **Phase 2 (VSMOV Audio Separation & Live Subtitle Fetch)**: Harry Potter `tt0373889` resolved 2 audio options (Vietsub & Lồng Tiếng) with distinct binge groups, valid `subtitles` array with proxied `/hls/sub.vtt` URL, and live WebVTT delivery with CORS `*`.
  - **Phase 3 (KKPhim Flexible Episode Matching & Anti-404 Series)**:
    - 15/15 unit matrix tests on `kkphim.matchEpisodeItem()` passed (exact numbers, zero pads `01`/`001`, labels `Tập 1`/`Tập 01`/`Episode 1`/`EP 01`, slug suffixes `-1`/`-01`, regex extractions `Tập 15`, negative/null safety).
    - Breaking Bad `tt0903747:1:1` returned HTTP 200, 2 active streams, `#EXTM3U` manifest (no 404).
    - Game of Thrones `tt0944947:1:1` returned HTTP 200, 2 active streams, valid proxy URLs.
  - **Phase 4 (Live Binary TS Chunk Download)**:
    - VSMOV segment (7,447,877 bytes > 50KB) verified with `0x47` sync byte at 188-byte boundaries.
    - KKPhim standard TS segment (946,204 bytes > 50KB) verified with `0x47` sync byte at offset 0, 188, 376.
  - **Phase 5 (HTTP Range Seeking 206)**: Both VSMOV and KKPhim TS segments returned HTTP 206 Partial Content with exact 2048-byte slices and verified `0x47` sync bytes.
  - **Phase 6 (Adversarial Subtitle Proxy Stress)**: Raw SRT conversion, CRLF normalization, UTF-8 BOM stripping, Native WebVTT passthrough, Base64URL decoding, Vietnamese Unicode character preservation, missing URL HTTP 400 validation with CORS `*`, and upstream 404/500 status forwarding.
  - **Phase 7 (High-Concurrency Burst Stress)**: 25 concurrent requests across manifest, health, and subtitle proxy completed with 100% HTTP 200.
  - **Phase 8 (In-App Stream Protocol Invariant)**: 100% of emitted stream objects have `typeof url === 'string'`, `'externalUrl' in stream === false`, `stream.externalUrl === undefined`, and `behaviorHints.notSupported === false`.

---

## 2. Logic Chain

1. **Audio Track Separation**:
   - `src/providers/vsmov.js` traverses all server group tabs in `movieData.episodes` and classifies their audio track via `classifyServerAudio()`.
   - By assigning distinct `bingeGroup` identifiers (`vsmov-vietsub-4k-vip-1`, `vsmov-longtieng-4k-vip-1`, `vsmov-thuyetminh-4k-vip-1`), Stremio treats them as independent audio options without cross-stream collision.
   - For Vietsub streams, `resolveEmbedMedia` extracts WebVTT/SRT subtitle files, resolves relative paths, and provides a CORS-enabled proxy URL via `/hls/sub.vtt`.

2. **Subtitle Proxying & Sanitization**:
   - `src/routes/hls.js` implements `/hls/sub.vtt` and alias `/sub`.
   - Upstream headers inject `Referer: https://vsmov.com/` and `Origin: https://vsmov.com` to prevent 403 CDN blocks.
   - Response sanitization strips UTF-8 BOM (`\uFEFF`), normalizes line endings (`\r\n` -> `\n`), converts comma timestamps (`00:00:01,000` -> `00:00:01.000`), and guarantees the `WEBVTT\n\n` header with CORS `Access-Control-Allow-Origin: *`.

3. **KKPhim Anti-404 Episode Matching**:
   - Upstream KKPhim responses vary across `server_data`, `episode_data`, `items`, and `episodes`, with episode labels varying between `"1"`, `"01"`, `"Tập 1"`, `"tap-01"`, and `"ep-1"`.
   - Normalizing container access and employing `matchEpisodeItem()` resolves any requested episode number to its true upstream media link, completely eliminating 404 stream resolution failures.

4. **In-App Direct Play Exclusivity**:
   - All emitted stream objects declare `url` routing through the local `/hls/manifest.m3u8` proxy and strictly omit `externalUrl`.
   - Binary video downloads confirm real MPEG-TS data (> 50KB with sync byte `0x47`) and Range 206 seeking support.

5. **Version Consistency**:
   - Synchronous update to `1.5.1` across `package.json`, `src/manifest.js`, `src/handlers.js`, and test suites ensures complete alignment across manifests, health endpoints, and UI banners.

---

## 3. Caveats

1. **Live Upstream Rate Limiting**: Under rapid burst testing against upstream endpoints (`phimapi.com`), Cloudflare rate limiting (HTTP 429) may occasionally occur. The aggregator's 5s timeout and fallback cache isolate individual provider issues without crashing the addon.
2. **Releases Without Soft Subtitles**: If an upstream movie release only provides hardcoded subtitles or Vietnamese dubbing without a soft subtitle track, the stream cleanly omits the `subtitles` property rather than proxying a null URL.

---

## 4. Conclusion

**Verdict: APPROVE**

Hotfix v1.5.1 satisfies all functional, architectural, and adversarial requirements:
- VSMOV multi-server audio separation and `/hls/sub.vtt` subtitle proxy are operational and verified on live streams.
- KKPhim flexible episode matching and container normalization prevent 404 errors across series.
- All streams strictly adhere to In-App Direct Play protocol (`url` only, NO `externalUrl`).
- Real MPEG-TS chunk download (> 50KB, `0x47` sync byte) and HTTP Range 206 seeking verified.
- 100% pass rate across all unit, integration, playback, and adversarial test suites.

---

## 5. Verification Method

To independently execute and verify Hotfix v1.5.1:

```bash
# 1. Syntax Check across all core files
node --check src/index.js src/handlers.js src/manifest.js src/providers/vsmov.js src/providers/kkphim.js src/routes/hls.js

# 2. Core Integration Test Suite
npm test

# 3. 7-Phase E2E Playback & Subtitle Verification
node tests/verify_playback.js

# 4. VSMOV Audio & Subtitle Unit Suite
node tests/verify_vsmov_sub_audio.js && node tests/test_m1_subtitle_proxy.js

# 5. Comprehensive Challenger Empirical & Adversarial Test Suite (107 checks)
node tests/challenger_hotfix_v151_empirical.test.js
```

