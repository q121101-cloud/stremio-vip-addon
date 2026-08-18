# Original User Request

## 2026-08-18T01:34:28Z

<USER_REQUEST>
Hotfix v1.5.1 for Stremio VIP Movies Addon: fully separate VSMOV server audio tabs into distinct streams (`Vietsub`, `Lồng Tiếng`, `Thuyết Minh`), proxy and inject WebVTT/SRT subtitles into Stremio stream objects via `/hls/sub.vtt`, verify multi-server resolution with E2E tests, and deploy to GitHub.

Working directory: `/Users/quan/.gemini/antigravity/scratch/stremio-nguonc-addon`
Integrity mode: development

## Requirements

### R1. VSMOV Multi-Server Audio Separation & Subtitle Extraction (`src/providers/vsmov.js`)
- Inspect and extract all server groups / tabs (`Vietsub`, `Lồng tiếng`, `Thuyết minh`) from VSMOV API and player responses. Do not collapse them into a single raw stream.
- Return distinct, cleanly formatted stream objects:
  - **Vietsub**:
    - `name`: `"VIP Movies 🎬"`
    - `title`: `[VIP 1 • VSMOV] Vietsub 4K Ultra HD (3840x2160) (HLS Proxy)\n⚡ Server VIP Vietsub • vsmov.com`
  - **Lồng Tiếng**:
    - `name`: `"VIP Movies 🎬"`
    - `title`: `[VIP 1 • VSMOV] Lồng Tiếng 4K Ultra HD (3840x2160) (HLS Proxy)\n⚡ Server VIP Lồng Tiếng • vsmov.com`
  - **Thuyết Minh**:
    - `name`: `"VIP Movies 🎬"`
    - `title`: `[VIP 1 • VSMOV] Thuyết Minh 4K Ultra HD (3840x2160) (HLS Proxy)\n⚡ Server VIP Thuyết Minh • vsmov.com`
- Extract WebVTT/SRT subtitle files (if present) from VSMOV player data, route through proxy (`${proxyBase}/hls/sub.vtt?url=${b64Sub}&ref=${b64Ref}`), and attach to stream objects:
  `subtitles: [{ id: 'vi_vsmov', lang: 'vie', url: proxySubUrl }]`.
- Maintain strict In-App stream protocol: include `url`, omit `externalUrl`.

### R2. Subtitle Proxy Endpoint (`src/routes/hls.js`)
- Implement `GET /hls/sub.vtt`:
  - Fetch subtitle files with headers `Referer: https://vsmov.com/`, `Origin: https://vsmov.com`, and standard Chrome User-Agent.
  - Return headers: `Content-Type: text/vtt; charset=utf-8`, `Access-Control-Allow-Origin: *`, `Cache-Control: public, max-age=86400`.
  - Automatically convert SRT to WebVTT format if upstream serves SRT content.

### R3. E2E Multi-Server & Subtitle Verification (`tests/verify_vsmov_sub_audio.js`)
- Automated verification script:
  1. Start local server on an ephemeral port.
  2. Query streams for movies (e.g. Harry Potter `tt0373889`) and series.
  3. Verify presence of at least 2 distinct VSMOV stream options (e.g., Vietsub and Lồng Tiếng / Thuyết Minh).
  4. Fetch `/hls/sub.vtt` if subtitle URL is generated, verify HTTP 200 and valid `WEBVTT` header.
  5. Run full test suite and verify 100% assertions pass.

### R4. Versioning & Deployment
- Preserve Cyber-Glassmorphism UI and glowing brand signature: `VIP Movies Addon v1.5.1 • Powered by <span class="brand-highlight">Q121101</span>`.
- Bump version to `1.5.1` in `package.json`, `src/manifest.js`, and `src/handlers.js`.
- Execute git deployment:
  `git add . && git commit -m "Hotfix v1.5.1: Split VSMOV into distinct Vietsub, Long Tieng & Thuyet Minh 4K streams with Subtitle Proxy" && git push origin main`.

## Acceptance Criteria

### Verification Standards
- [ ] `node tests/verify_vsmov_sub_audio.js` passes with 0 errors and validates distinct Vietsub & Long Tieng / Thuyet Minh stream objects.
- [ ] Subtitle endpoint `/hls/sub.vtt` responds with HTTP 200, `text/vtt`, and CORS `*`.
- [ ] In-app stream objects strictly contain `url` and NO `externalUrl`.
- [ ] `node --check src/index.js` passes with zero errors.
- [ ] `git push origin main` completes successfully.

</USER_REQUEST>

## 2026-08-18T02:21:45Z

<USER_REQUEST>
Hotfix v1.5.1 for Stremio VIP Movies Addon: separate VSMOV server audio tabs into distinct `Vietsub`, `Lồng Tiếng`, `Thuyết Minh` streams with WebVTT subtitle proxy; fix KKPhim HTTP 404 episode-matching bug; run E2E verification with real video segment download (> 50KB); deploy to GitHub.

Working directory: `/Users/quan/.gemini/antigravity/scratch/stremio-nguonc-addon`
Integrity mode: development

## Requirements

### R1. VSMOV Multi-Server Separation & Subtitle Proxy (`src/providers/vsmov.js`, `src/routes/hls.js`)
- Extract all server groups from VSMOV API/player response (`Vietsub`, `Lồng tiếng`, `Thuyết minh`). Return them as independent stream objects with titles:
  - `[VIP 1 • VSMOV] Vietsub 4K Ultra HD (3840x2160) (HLS Proxy)\n⚡ Server VIP Vietsub • vsmov.com`
  - `[VIP 1 • VSMOV] Lồng Tiếng 4K Ultra HD (3840x2160) (HLS Proxy)\n⚡ Server VIP Lồng Tiếng • vsmov.com`
  - `[VIP 1 • VSMOV] Thuyết Minh 4K Ultra HD (3840x2160) (HLS Proxy)\n⚡ Server VIP Thuyết Minh • vsmov.com`
- Extract WebVTT/SRT subtitle files (when present), proxy via `GET /hls/sub.vtt?url=...&ref=...`, and attach as `subtitles: [{ id: 'vi_vsmov', lang: 'vie', url: proxySubUrl }]`.
- `/hls/sub.vtt` must return: `Content-Type: text/vtt; charset=utf-8`, `Access-Control-Allow-Origin: *`, auto-convert SRT to WebVTT.
- All streams must contain `url` and NO `externalUrl`.

### R2. KKPhim 404 Episode-Matching Fix (`src/providers/kkphim.js`)
- Fix episode lookup to flexibly match all variants: `ep.name === String(targetEp)`, zero-padded (`"01"`), Vietnamese label (`"Tập 1"`), and slug suffix (`"-1"`).
- Ensure CDN referer headers are set to valid player origin (e.g. `https://player.phimapi.com/`) to prevent 403/404 from CDN.
- Ensure Base64URL encoding/decoding of m3u8 links preserves all security query parameters intact.

### R3. E2E Verification (`tests/verify_playback.js`)
- Automated test against live upstream:
  1. Harry Potter `tt0373889` must return at least 2 distinct VSMOV stream objects (Vietsub + Lồng Tiếng / Thuyết Minh).
  2. A KKPhim series episode (e.g. `tt0903747:1:1`) must resolve a valid HLS manifest with HTTP 200 (no 404).
  3. Download a real `.ts` segment via `/hls/segment.ts`: verify HTTP 200 / 206, payload > 50KB, MPEG-TS sync byte `0x47`.
- Self-debug loop until 100% pass.

### R4. Versioning & GitHub Deployment
- Update version string to `1.5.1` in `package.json`, `src/manifest.js`, and the footer in `src/handlers.js` (`VIP Movies Addon v1.5.1 • Powered by <span class="brand-highlight">Q121101</span>`).
- `git add . && git commit -m "Hotfix v1.5.1: Swarm verified - Split VSMOV Vietsub/Audio tabs with Subtitle Proxy & Fixed KKPhim 404 episode matching" && git push origin main`.

## Acceptance Criteria

- [ ] VSMOV streams include at least 2 distinct audio-group entries (Vietsub and one of Lồng Tiếng / Thuyết Minh) verified by test script.
- [ ] `/hls/sub.vtt` returns HTTP 200, `text/vtt`, CORS `*`.
- [ ] KKPhim series episode stream resolves to valid HLS manifest (HTTP 200, no 404).
- [ ] Real `.ts` segment download > 50KB with HTTP 200 / 206.
- [ ] `node --check src/index.js` zero errors.
- [ ] `git push origin main` succeeds.

</USER_REQUEST>
