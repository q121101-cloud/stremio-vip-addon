# Reviewer 2 Handoff Report: Hotfix v1.5.1 Review & Adversarial Challenge

**Verdict**: **APPROVE**

---

## 1. Observation

A rigorous, independent review and adversarial evaluation of Hotfix v1.5.1 was performed across the codebase and live test endpoints.

### 1.1 VSMOV Multi-Server Audio Separation & Subtitle Proxy (`src/providers/vsmov.js` & `src/routes/hls.js`)
- `src/providers/vsmov.js`:
  - `classifyServerAudio(serverName)` (lines 68–94) inspects server tab names and classifies them into `Vietsub`, `Lồng Tiếng`, and `Thuyết Minh`, generating unique binge groups (`vsmov-vietsub-4k-vip-1`, `vsmov-longtieng-4k-vip-1`, `vsmov-thuyetminh-4k-vip-1`).
  - `resolveEmbedMedia(linkEmbed, linkM3u8)` (lines 99–211) parses player embeds to extract master M3U8 playlists and soft WebVTT/SRT subtitles (`playerOptions.subtitles` and HTML regex matches), resolving relative paths against `embedOrigin`.
  - `getStreams()` (lines 512–595) iterates over all server groups (`episodes`), formats distinct stream objects with titles `[VIP 1 • VSMOV] <AudioLabel> 4K Ultra HD (3840x2160)${epLabel} (HLS Proxy)`, attaches `subtitles: [{ id: 'vi_vsmov', lang: 'vie', url: proxySubUrl }]`, and strictly omits `externalUrl`.
  - For Harry Potter (`tt0373889`), querying streams returned 2 distinct VSMOV stream options (`Vietsub` and `Lồng Tiếng`), with an active WebVTT subtitle proxy link.
- `src/routes/hls.js`:
  - Implements `GET /hls/sub.vtt` and alias `/sub` (lines 375–432) accepting `url`, `b64`, `sub`, `ref`, and `referer`.
  - Upstream request includes `Referer: https://vsmov.com/`, `Origin: https://vsmov.com`, and standard Chrome User-Agent.
  - Returns headers `Content-Type: text/vtt; charset=utf-8`, `Access-Control-Allow-Origin: *`, `Cache-Control: public, max-age=86400`.
  - Strips UTF-8 BOM (`\uFEFF`), normalizes CRLF newlines, converts SRT comma timestamps (`00:00:01,000` -> `00:00:01.000`), and ensures `WEBVTT\n\n` header.

### 1.2 KKPhim Flexible Episode Matcher & Anti-404 Series Playback (`src/providers/kkphim.js`)
- Data container access normalized in `getStreams` (line 388) and `mapDetailMeta` (line 480):
  ```javascript
  const serverData = server.server_data || server.episode_data || server.items || server.episodes || [];
  ```
- Flexible episode matcher `matchEpisodeItem(ep, targetEpStr, targetEpNum)` (lines 65–102) handles:
  - Exact string matches (`"1"`, `"01"`, `"001"`, `"25"`).
  - Vietnamese prefix labels (`"Tập 1"`, `"Tập 01"`, `"Tập 001"`, `"Tập01"`).
  - English labels (`"Episode 1"`, `"EP 01"`).
  - Slugs (`"tap-1"`, `"tap-01"`, `"episode-1"`, `"ep-01"`, `"phim-bo-tap-1"`, `"breaking-bad-1"`).
  - Regex numeric extractions and 1-based index fallback.
- Live test on Breaking Bad `tt0903747:1:1` successfully resolved an active HLS playlist (`http://127.0.0.1:.../hls/manifest.m3u8?url=...`) returning HTTP 200 with `#EXTM3U` manifest (0 occurrences of 404).

### 1.3 TS Segment Download, Sync Byte 0x47 & Range 206 Seeking
- `tests/verify_playback.js` downloaded a real `.ts` video chunk:
  - Downloaded size: 7,447,877 bytes (~7.27 MB), satisfying the $> 50\text{ KB}$ requirement.
  - MPEG-TS sync byte `0x47` confirmed at packet boundary offsets (e.g. index 0 and 188).
  - HTTP Range request (`Range: bytes=0-1023`) returned HTTP 206 Partial Content with 1,024 bytes and `Content-Range: bytes 0-1023/7447877`.

### 1.4 Version Consistency & UI Integrity
- `package.json`: `"version": "1.5.1"`
- `src/manifest.js`: Header comment `(v1.5.1)` and `BASE_MANIFEST.version: '1.5.1'`
- `src/handlers.js`: Header comment `(Engine v1.5.1)`, status badge `v1.5.1`, and footer `VIP Movies Addon v1.5.1 • Powered by <span class="brand-highlight">Q121101</span>`
- `GET /health`: Returns `{ "status": "ok", "version": "1.5.1", ... }`

### 1.5 Code Integrity Audit
- No hardcoded test responses or simulated test fixtures found in `src/`.
- No dummy or facade implementations.
- Real network integration verified with upstream CDNs.

---

## 2. Logic Chain

1. **Audio Variant Usability**: By enumerating all server tabs in `episodes` and tagging each with `classifyServerAudio()`, users can choose between Vietsub, Lồng Tiếng, and Thuyết Minh streams directly in Stremio.
2. **Subtitle Interoperability**: Proxying subtitles via `/hls/sub.vtt` with CORS `Access-Control-Allow-Origin: *` and automatic WebVTT conversion guarantees cross-platform subtitle rendering on Stremio Web, Desktop, and Android TV without browser CORS blocks.
3. **Episode Match Reliability**: KKPhim upstream data structures vary across different series formats. The normalized container lookup and multi-pattern `matchEpisodeItem` ensure episodes resolve directly to media links without returning HTTP 404.
4. **Binary Stream Fidelity**: Traversing variant sub-manifests and verifying real MPEG-TS chunk delivery (> 50KB with sync byte `0x47`) proves end-to-end streaming operability.
5. **System Cohesion**: Synchronous 1.5.1 version updates across all manifests, endpoints, footers, and packages guarantee configuration uniformity.

---

## 3. Caveats

1. **Upstream Network Latency**: Real CDN fetches depend on upstream availability and response times. Timeout handling (5s for providers, 25s for segment streams) prevents unbounded stalls.
2. **Releases Without Soft Subtitles**: If a movie release has only hardcoded subtitles or raw dubbed audio without soft subtitle files, the `subtitles` array is omitted.

---

## 4. Conclusion

**Verdict: APPROVE**

Hotfix v1.5.1 satisfies all functional, architectural, and security requirements outlined in `PROJECT.md` and `ORIGINAL_REQUEST.md`:
- VSMOV multi-server audio tab separation is active and generates $\ge 2$ stream objects on multi-audio releases.
- Subtitle proxy `/hls/sub.vtt` returns HTTP 200, `text/vtt`, CORS `*`, and WebVTT-formatted text.
- KKPhim episode lookup resolves series streams without 404 errors.
- TS segment binary download delivers valid MPEG-TS buffers $> 50\text{ KB}$ with sync byte `0x47` and Range 206 support.
- Version strings are consistently bumped to `1.5.1`.

---

## 5. Verification Method

To independently reproduce and verify all results:

```bash
# 1. Syntax Check
node --check src/index.js src/handlers.js src/manifest.js src/providers/vsmov.js src/providers/kkphim.js src/routes/hls.js

# 2. Comprehensive 7-Phase E2E Playback Verification
node tests/verify_playback.js

# 3. VSMOV Multi-Server & Subtitle Verification
node tests/verify_vsmov_sub_audio.js

# 4. Subtitle Proxy Unit Tests & KKPhim Playback Test
node tests/test_m1_subtitle_proxy.js
node tests/test_kkphim_playback.js

# 5. Core Integration Test Suite
npm test

# 6. Reviewer 2 Adversarial Stress Test Suite
node .agents/reviewer_2/adversarial_audit.js
```

### Verified Test Results Summary:
- `node --check`: **0 errors (Exit code 0)**
- `node tests/verify_playback.js`: **7/7 phases PASSED (100%)**
- `node tests/verify_vsmov_sub_audio.js`: **58/58 assertions PASSED (100%)**
- `node tests/test_m1_subtitle_proxy.js`: **27/27 assertions PASSED (100%)**
- `node tests/test_kkphim_playback.js`: **3/3 test cases PASSED (100%)**
- `npm test`: **50/50 tests PASSED (100%)**
- `node .agents/reviewer_2/adversarial_audit.js`: **45/45 assertions PASSED (100%)**
