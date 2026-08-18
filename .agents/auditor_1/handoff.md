# Forensic Audit Report: Hotfix v1.5.1

**Work Product**: Hotfix v1.5.1 (`src/providers/vsmov.js`, `src/routes/hls.js`, `src/providers/kkphim.js`, `tests/verify_playback.js`, `package.json`, `src/manifest.js`, `src/handlers.js`)  
**Profile**: General Project (Development Integrity Mode)  
**Verdict**: **CLEAN**

---

## 1. Observation

A full forensic analysis was conducted on the source code, routes, providers, tests, and live network behaviors.

### 1.1 Direct Source Code Observations
1. **VSMOV Multi-Server Audio Separation & Subtitle Extraction (`src/providers/vsmov.js`)**:
   - `classifyServerAudio(rawServerName)` (lines 14–41) parses server names using regular expressions (`/l.{1,5}ng\s*ti.{1,5}ng/i`, `/thuy.{1,5}t\s*minh/i`) to categorize streams into `Vietsub`, `Lồng Tiếng`, and `Thuyết Minh` with dedicated binge groups (`vsmov-vietsub-4k-vip-1`, `vsmov-longtieng-4k-vip-1`, `vsmov-thuyetminh-4k-vip-1`).
   - `resolveEmbedMedia(linkEmbed, linkM3u8)` (lines 46–152) performs live HTTP GET requests to player embed pages, extracts `playerOptions.subtitles` (JSON array) and regex fallbacks (`.(?:vtt|srt)`), converts relative subtitle URLs into absolute URLs, and extracts `.m3u8` master playlists.
   - `getStreams` (lines 520–600) iterates through all server tabs, attaches proxied subtitles `[{ id: 'vi_vsmov', lang: 'vie', url: '${proxyBase}/hls/sub.vtt?url=${b64Sub}&ref=${b64Ref}' }]`, and strictly omits `externalUrl`.

2. **Subtitle Proxy Endpoint (`src/routes/hls.js`)**:
   - `GET /hls/sub.vtt` & alias `/sub` (lines 374–433) resolves `url`/`b64`/`sub` parameters, injects `Referer: https://vsmov.com/`, `Origin: https://vsmov.com`, and Chrome `User-Agent`.
   - Strips UTF-8 BOM (`\uFEFF`), normalizes line endings (`\r\n` -> `\n`), converts SRT timestamps (`00:00:01,000` -> `00:00:01.000`), prepends `WEBVTT\n\n` header if not present, and sets `Content-Type: text/vtt; charset=utf-8`, `Access-Control-Allow-Origin: *`, `Cache-Control: public, max-age=86400`.

3. **KKPhim Flexible Episode Matching (`src/providers/kkphim.js`)**:
   - `matchEpisodeItem(ep, targetEpStr, targetEpNum)` (lines 66–102) handles all episode formats: exact numeric string (`"1"`, `"01"`, `"001"`), Vietnamese prefix (`"Tập 1"`, `"Tập 01"`), English labels (`"Episode 1"`), slug variants (`"tap-1"`, `"episode-1"`, `"-1"`), regex number extraction, and index fallback.
   - `serverData` normalization (lines 388, 480) handles `server.server_data || server.episode_data || server.items || server.episodes || []`.

4. **Stream Aggregator Invariant (`src/handlers.js`)**:
   - Lines 954–957 preserve `subtitles` array when present on sanitized stream objects while strictly executing `delete sanitized.externalUrl`.
   - Footer and badge synchronized to `v1.5.1` and `VIP Movies Addon v1.5.1 • Powered by <span class="brand-highlight">Q121101</span>`.

5. **Version Consistency (`package.json`, `src/manifest.js`, `src/handlers.js`)**:
   - `package.json`: `"version": "1.5.1"`.
   - `src/manifest.js`: `BASE_MANIFEST.version: '1.5.1'`.
   - `src/handlers.js`: `v1.5.1` in HTML badge and footer.

6. **E2E Playback Test (`tests/verify_playback.js`)**:
   - Listens on ephemeral port `0` (`127.0.0.1:0`), mounts real Express app, makes real network requests across 7 validation phases.
   - Phase 6 downloads a real binary TS segment (`7,447,877 bytes` / `7.27 MB`) and validates MPEG-TS sync byte `0x47` at offset 0/188 or inside wrapper.
   - Phase 7 issues HTTP Range `bytes=0-1023` and receives `HTTP 206 Partial Content` with `Content-Range: bytes 0-1023/7447877`.

---

## 2. Logic Chain

1. **Absence of Hardcoded/Faked Outputs**:
   - A search across the repository (`find . -name '*.log' -o -name '*result*'`) confirmed zero pre-populated verification artifacts or fake caches.
   - All test files (`verify_playback.js`, `verify_vsmov_sub_audio.js`, `test_kkphim_playback.js`, `test_m1_subtitle_proxy.js`) perform real HTTP calls to local Express instances and upstream CDNs (`vsmov.com`, `phimapi.com`, `streamvsmov.com`).
   - Binary segment verification downloaded 7,447,877 real bytes from live upstream CDN and successfully checked MPEG-TS packet sync byte `0x47`.

2. **Genuine VSMOV Multi-Server Audio Separation & Subtitle Extraction**:
   - `vsmov.classifyServerAudio` was tested with 12 distinct string variations; all mapped cleanly to `vietsub`, `longtieng`, and `thuyetminh` with appropriate binge groups.
   - `vsmov.resolveEmbedMedia` was verified to fetch actual embed HTML, parse JSON/regex subtitle tracks, and resolve relative paths.
   - On Harry Potter `tt0373889`, the live aggregator returned 2 distinct VSMOV audio streams (Vietsub and Lồng Tiếng) with live subtitle URL attached.

3. **Authentic Subtitle Proxy & SRT-to-WebVTT Conversion**:
   - Live endpoint `/hls/sub.vtt` was tested against synthetic SRT with commas and BOM, native WebVTT, and live VSMOV upstream subtitles.
   - All tests produced valid `WEBVTT` bodies with period timestamps (`00:00:01.234`), stripped BOM, normalized CRLF, CORS `*`, and `text/vtt` MIME.

4. **Authentic KKPhim Episode Matcher**:
   - `matchEpisodeItem` passed 13/13 test cases including leading zeroes, prefixes, slugs, and suffixes.
   - Series query for `tt0903747:1:1` resolved an active `#EXTM3U` manifest from `phimapi.com`/`phim1280.tv` with HTTP 200 (no 404).

5. **In-App Direct Play Invariant**:
   - Empirical audit across 42 streams from 13 titles verified 0 occurrences of `externalUrl`. Every stream contained only valid In-App `url`.

---

## 3. Caveats

- **Upstream CDN Latency / Rate Limiting**: Upstream APIs (`phimapi.com`) may occasionally return HTTP 429 if queried rapidly without pause. Tests include appropriate timeouts (25s) and resilient fallbacks.
- **Title Subtitle Availability**: Subtitles are attached only when upstream provides a soft subtitle track (WebVTT/SRT). Releases with hardcoded subtitles or raw audio dubs omit the `subtitles` array cleanly.

---

## 4. Conclusion

**Verdict: CLEAN**

No integrity violations, hardcoded test results, facade implementations, or faked outputs exist. All components of Hotfix v1.5.1 are genuinely implemented, fully functional, and independently verified against live upstream services.

---

## 5. Verification Method

To independently reproduce all forensic checks:

```bash
# 1. Syntax Check across all modified and test files
node --check src/index.js src/handlers.js src/manifest.js src/providers/vsmov.js src/providers/kkphim.js src/routes/hls.js tests/verify_playback.js

# 2. Independent Auditor Forensic Probe
node .agents/auditor_1/probe.js

# 3. Core Unit Test Suite
npm test

# 4. Comprehensive 7-Phase E2E Playback Verification (Live Upstream & Binary TS Download)
node tests/verify_playback.js

# 5. VSMOV Multi-Server Audio Separation & Subtitle Verification
node tests/verify_vsmov_sub_audio.js

# 6. Subtitle Proxy & KKPhim Playback Tests
node tests/test_m1_subtitle_proxy.js && node tests/test_kkphim_playback.js
```

### Empirical Test Output Summary
- `node --check`: **0 errors (Exit code 0)**
- `node .agents/auditor_1/probe.js`: **5/5 checks PASSED (100% SUCCESS)**
- `npm test`: **50/50 tests PASSED (0 failures)**
- `node tests/verify_playback.js`: **7/7 phases PASSED**
  - Phase 1 (Manifest): HTTP 200, v1.5.1, 22 catalogs.
  - Phase 2 (VSMOV Audio Separation): 2 distinct streams (`Vietsub`, `Lồng Tiếng`), In-App compliant, subtitle URL detected.
  - Phase 3 (Subtitle Proxy): HTTP 200, `text/vtt; charset=utf-8`, CORS `*`, valid `WEBVTT` body.
  - Phase 4 (KKPhim Episode Anti-404): HTTP 200, valid `#EXTM3U` manifest.
  - Phase 5 (Manifest Rewriter): HTTP 200, sub-variant playlist traversed.
  - Phase 6 (Segment Download): HTTP 200, `7,447,877 bytes` (7.27 MB), MPEG-TS sync byte `0x47` confirmed.
  - Phase 7 (HTTP Range Seeking): HTTP 206 Partial Content, `bytes 0-1023/7447877`.
- `node tests/verify_vsmov_sub_audio.js`: **62/62 assertions PASSED**
- `node tests/test_m1_subtitle_proxy.js`: **27/27 assertions PASSED**
- `node tests/test_kkphim_playback.js`: **3/3 test cases PASSED**
