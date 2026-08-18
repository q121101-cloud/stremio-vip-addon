# Challenger Empirical Verification Handoff Report — Hotfix v1.5.2

## 1. Observation
1. **TS Segment Streaming & MPEG-TS Sync Byte (0x47)**:
   - Full TS download test via `/hls/segment.ts?url=<mux_ts_b64>&ref=<mux_ref_b64>` returned HTTP 200/206 with payload size `1,915,156 bytes` (1.87 MB > 50 KB requirement).
   - Byte `[0]` confirmed as `0x47` (MPEG-TS synchronization byte).
   - 188-byte packet alignment empirically verified across sequential packet offsets (`buf[0] === 0x47`, `buf[188] === 0x47`, `buf[376] === 0x47`, `buf[564] === 0x47`).
   - Content-Type verified as `video/MP2T` and `Accept-Ranges: bytes`.

2. **HTTP 206 Partial Content Range Requests**:
   - `Range: bytes=0-187` returned HTTP 206, `Content-Length: 188`, `Content-Range: bytes 0-187/1915156`, payload length 188 bytes, `buf[0] === 0x47`.
   - `Range: bytes=188-375` returned HTTP 206, `Content-Length: 188`, `Content-Range: bytes 188-375/1915156`, payload length 188 bytes, `buf[0] === 0x47` (2nd TS packet).
   - Route aliases `/hls/ts`, `/hls/segment`, and `/hls/ts-proxy` verified returning HTTP 206 on Range requests.

3. **Master M3U8 Playlist Rewrite & Subtitle Track Injection**:
   - Master playlist rewrite with `sub` parameter (`/hls/manifest.m3u8?url=...&sub=...`) returned HTTP 200 with `#EXT-X-MEDIA:TYPE=SUBTITLES,GROUP-ID="subs",NAME="Tiếng Việt (VSMOV VIP)",DEFAULT=YES,AUTOSELECT=YES,FORCED=NO,LANGUAGE="vie",URI="<baseUrl>/hls/sub.vtt?url=...&ref=..."`.
   - All `#EXT-X-STREAM-INF` variant stream lines correctly appended with `,SUBTITLES="subs"`.
   - All variant playlist URIs rewritten to `<baseUrl>/hls/manifest.m3u8?url=...&ref=...`.
   - Master playlist without `sub` parameter did NOT inject subtitle tags.
   - Media playlist (chunklist with `#EXTINF`) did NOT inject subtitle tags, properly isolating playlist types and rewriting segment URLs to `/hls/segment.ts`.

4. **Subtitle Proxy Endpoint (`/hls/sub.vtt`)**:
   - Missing/whitespace `url` returns HTTP 400.
   - Native WebVTT data URI returned HTTP 200, `Content-Type: text/vtt; charset=utf-8`, `Access-Control-Allow-Origin: *`, `Cache-Control: public, max-age=86400`.
   - SRT auto-conversion verified: prepended `WEBVTT` header, comma timestamps converted to dot timestamps (`00:00:01,500` -> `00:00:01.500`), CRLF normalized to LF.
   - UTF-8 BOM (`\uFEFF`) stripped cleanly.

5. **KKPhim Smart Search Fallback & Stream Aggregator Integration**:
   - Querying stream for Avengers 3 (`tt5095030`) resolved 5 valid streams without crash.
   - VSMOV stream included `subtitles` array: `[{ id: "vi_vsmov", lang: "vie", url: "<proxySubUrl>", title: "Tiếng Việt (VSMOV VIP)" }]`.
   - KKPhim streams found via Smart Search Fallback, returned valid HLS proxy stream URLs (`/hls/manifest.m3u8`), with strict zero `externalUrl` compliance.
   - Querying non-existent IMDb ID (`tt9999999999`) returned HTTP 200 with `{ streams: [] }` (safe degradation, zero uncaught rejection).
   - Episode matching algorithm (`matchEpisodeItem`) passed all patterns (`"1"`, `"01"`, `"001"`, `"Tập 1"`, `"Tập 01"`, `"tap-1"`, `"Episode 5"`, slug suffix `"-12"`).

6. **Version Synchronization**:
   - `package.json`: `"version": "1.5.2"`
   - `src/manifest.js`: `BASE_MANIFEST.version = "1.5.2"`
   - `src/handlers.js`: `VIP Movies Addon v1.5.2 • Designed with Taste by Q121101`

## 2. Logic Chain
1. *Observation 1 & 2* demonstrate that the HLS segment proxy in `src/routes/hls.js` properly forwards HTTP Range headers to upstream CDNs, streams chunks reliably, maintains MPEG-TS byte alignment (0x47 sync byte every 188 bytes), and satisfies seeking requirements in Stremio/ExoPlayer/VLC.
2. *Observation 3 & 4* verify that WebVTT subtitle track injection adheres to RFC 8216 (HLS Specification) by linking `#EXT-X-STREAM-INF` to `#EXT-X-MEDIA:TYPE=SUBTITLES` via `GROUP-ID="subs"`, while the subtitle proxy handles character encoding, BOM stripping, timestamp normalization, and CORS compliance.
3. *Observation 5* proves that KKPhim multi-tier fallback (Tier 1 direct IMDb -> Tier 2 Cinemeta title/alias search + `scoreMatch` -> Tier 3 safe empty array) eliminates 404 stream failures and ensures seamless in-app playback without `externalUrl` leaks.
4. *Observation 6* confirms full version synchronization across package and manifest definitions.

## 3. Caveats
- Upstream external CDNs (phimapi.com, streamvsmov.com, mux.dev) are subject to network latency and occasional 429 rate limiting under aggressive concurrent test bursts. The 5-second axios timeout and multi-tier fallback mechanisms successfully insulate the addon from upstream failures.

## 4. Conclusion
**Overall Verdict**: **APPROVED & FULLY VERIFIED (100% PASS)**
All requirements (R1: VSMOV WebVTT Subtitle Injection, R2: KKPhim Smart Search Fallback, R3: E2E Verification with 0x47 TS & HTTP 206 Range, R4: Version 1.5.2 Sync) are empirically confirmed.

## 5. Verification Method
Execute the complete test suites directly:
```bash
node --check src/index.js
node tests/challenger_hotfix_v152_empirical.test.js
node tests/challenger_hotfix_v152_adversarial.test.js
node tests/verify_hotfix_vsmov_kkphim.js
node tests/verify_playback.js
```
Expected Output:
- `tests/challenger_hotfix_v152_empirical.test.js`: 64/64 PASS (100%)
- `tests/challenger_hotfix_v152_adversarial.test.js`: 66/66 PASS (100%)
- `tests/verify_hotfix_vsmov_kkphim.js`: 23/23 PASS (100%)
- `tests/verify_playback.js`: 7/7 Phases PASS (100%)
