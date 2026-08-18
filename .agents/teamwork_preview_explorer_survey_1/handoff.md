# Handoff Report — VSMOV Provider Architecture Survey & Plan

**Date:** 2026-08-18  
**Agent:** `teamwork_preview_explorer_survey_1`  
**Task:** Survey VSMOV Provider Architecture, Multi-Server Audio Separation, Subtitle Proxying, and In-App Compliance  
**Working Directory:** `/Users/quan/.gemini/antigravity/scratch/stremio-nguonc-addon/.agents/teamwork_preview_explorer_survey_1`  
**Full Analysis:** `analysis.md`

---

## 1. Observation

1. **VSMOV API Response Structure (`src/providers/vsmov.js:173`)**:
   - Live endpoint `https://vsmov.com/api/phim/:slug` returns `episodes` array holding separate server objects for distinct audio renditions.
   - Server names in live responses contain raw whitespace and linebreaks (e.g. `episodes[0].server_name = "Vietsub\r\n                        #1"`, `episodes[1].server_name = "Lồng tiếng #1"` for `harry-potter-va-menh-lenh-phuong-hoang`).
2. **VSMOV Embed HTML & Subtitles (`src/providers/vsmov.js:83-118`)**:
   - Embed URLs `https://v[2-6].streamvsmov.com/video/:uuid` contain inline script:
     `const playerOptions = { subtitles: [{"name":"vie ...","url":"/video/:uuid/subtitle/vie_....vtt","code":"vie"}], ... };`
     `const baseUrl = "https://v5.streamvsmov.com";`
     `const videoHash = "382f09db-83ff-4d89-9be9-797162d4f2e6";`
   - Subtitle file can be fetched directly or via proxy, returning `Content-Type: text/vtt; charset=utf-8` with `WEBVTT` body.
3. **Current Aggregator Sanitizer Strips Subtitles (`src/handlers.js:944-955`)**:
   - `src/handlers.js` constructs `sanitized = { name, title, url, behaviorHints }` without passing through `item.subtitles`, causing any subtitle tracks attached by providers to be dropped before response delivery.
4. **Current VSMOV Stream Titles (`src/providers/vsmov.js:472-485`)**:
   - Current logic only checks `isTM = /thuy.{1,5}t minh|l.{1,5}ng ti.{1,5}ng/i.test(rawServerName)` and produces generic `[VIP 1 • VSMOV] Master 4K Ultra HD (3840x2160)` or `[VIP 1 • VSMOV] Thuyết Minh Full HD`, collapsing Vietsub, Lồng Tiếng, and Thuyết Minh into non-standard formats.
5. **Existing Routes (`src/routes/hls.js`)**:
   - `src/routes/hls.js` provides `/manifest.m3u8`, `/segment.ts`, `/key`, and `/extract`, but does not yet contain `/hls/sub.vtt` for subtitle proxying with SRT-to-WebVTT conversion.

---

## 2. Logic Chain

1. **Audio Separation**:
   - Based on (1) & (4), parsing `server.server_name` with regex (`/l.{1,5}ng\s*ti.{1,5}ng/i` for Lồng Tiếng, `/thuy.{1,5}t\s*minh/i` for Thuyết Minh, and `/vietsub|ph.{1,5}\s*đ.{1,5}|sub/i` or fallback for Vietsub) allows cleanly categorizing every VSMOV server into distinct streams.
   - Assigning exact titles:
     - Vietsub: `name: "VIP Movies 🎬"`, `title: [VIP 1 • VSMOV] Vietsub 4K Ultra HD (3840x2160)${epLabel} (HLS Proxy)\n⚡ Server VIP Vietsub • vsmov.com`
     - Lồng Tiếng: `name: "VIP Movies 🎬"`, `title: [VIP 1 • VSMOV] Lồng Tiếng 4K Ultra HD (3840x2160)${epLabel} (HLS Proxy)\n⚡ Server VIP Lồng Tiếng • vsmov.com`
     - Thuyết Minh: `name: "VIP Movies 🎬"`, `title: [VIP 1 • VSMOV] Thuyết Minh 4K Ultra HD (3840x2160)${epLabel} (HLS Proxy)\n⚡ Server VIP Thuyết Minh • vsmov.com`
2. **Subtitle Proxying**:
   - Based on (2), parsing `playerOptions.subtitles` from embed HTML yields relative or absolute subtitle paths. Resolving them against `baseUrl` provides the full subtitle URL.
   - Base64url-encoding the subtitle URL and referer produces proxy URL `${proxyBase}/hls/sub.vtt?url=${b64Sub}&ref=${b64Ref}`.
   - Attaching `subtitles: [{ id: 'vi_vsmov', lang: 'vie', url: proxySubUrl }]` to the stream object.
   - Implementing `GET /hls/sub.vtt` in `src/routes/hls.js` with CORS `*`, `Referer: https://vsmov.com/`, `Cache-Control: public, max-age=86400`, and automatic SRT-to-WebVTT conversion ensures smooth subtitle playback in Stremio.
3. **End-to-End Delivery**:
   - Based on (3), modifying `handleStream` in `src/handlers.js` to preserve `sanitized.subtitles = item.subtitles` guarantees subtitles reach the client.
   - Retaining `delete sanitized.externalUrl` and setting `url: streamUrl` enforces strict In-App stream protocol compliance.

---

## 3. Caveats

1. **Dynamic Subtitle Availability**: Not all VSMOV videos have external subtitle files (some dubbed / lồng tiếng movies or Chinese donghua have hardcoded subs). When `playerOptions.subtitles` is empty or absent, `subtitles` property should simply be omitted, which Stremio handles gracefully.
2. **Upstream Subtitle Encoding**: While most VSMOV subtitles are UTF-8 WebVTT, upstream can occasionally serve SRT with Windows-1258 / UTF-8 BOM. The proxy converter cleans BOM and normalizes timestamp delimiters `,` to `.`.

---

## 4. Conclusion

The architecture of VSMOV in `src/providers/vsmov.js`, the HLS proxy router in `src/routes/hls.js`, and the stream aggregator in `src/handlers.js` have been thoroughly analyzed. The separation into distinct `Vietsub`, `Lồng Tiếng`, and `Thuyết Minh` 4K streams with subtitle extraction and proxying is fully specified and ready for implementation.

### Implementation Checklist for Implementer:
1. `src/providers/vsmov.js`:
   - Add `classifyVsmovAudio(serverName, movieLang)`
   - Extract `subtitles` from embed HTML in `resolveVsmovStreamData(linkEmbed, linkM3u8)`
   - Format exact names (`"VIP Movies 🎬"`) and titles per audio type
   - Attach `subtitles: [{ id: 'vi_vsmov', lang: 'vie', url: proxySubUrl }]`
2. `src/routes/hls.js`:
   - Add `GET /hls/sub.vtt` with referer spoofing, CORS `*`, caching, and `srtToVtt` converter
3. `src/handlers.js`:
   - Preserve `sanitized.subtitles = item.subtitles` in `handleStream`
   - Bump version to `1.5.1` in UI footer and handlers
4. `src/manifest.js` & `package.json`:
   - Bump version to `1.5.1`
5. `tests/verify_vsmov_sub_audio.js`:
   - Implement comprehensive E2E test verifying distinct multi-server streams and subtitle proxy response

---

## 5. Verification Method

To independently verify the implementation:
1. Run syntax check: `node --check src/index.js`
2. Run automated test: `node tests/verify_vsmov_sub_audio.js`
3. Run existing test suites: `node src/test.js && node tests/e2e.test.js`
4. Verify HTTP 200, `text/vtt; charset=utf-8`, and `WEBVTT` header from `/hls/sub.vtt`
