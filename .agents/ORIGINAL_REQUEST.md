# Original User Request

## 2026-08-17T08:21:14Z

<USER_REQUEST>
Optimize in-app HLS playback for KKPhim provider with anti-403 CDN headers and build an end-to-end stream test & self-debug loop ensuring 100% verified playback.

Working directory: `/Users/quan/.gemini/antigravity/scratch/stremio-nguonc-addon`
Integrity mode: development

## Requirements

### R1. KKPhim In-App Stream Format (`src/providers/kkphim.js`)
- Extract `link_m3u8` from `episodes[].server_data[]`.
- Accurately resolve episodes: index 0 for movies, match `ep.name` or `tap-${episode}` for series.
- Return Stream objects strictly formatted for Stremio in-app playback:
  - `name`: `"VIP Movies 🎬"`
  - `title`: `[VIP • KKPhim] ${server.server_name} [Tập ${ep.name}] Full HD (HLS Proxy)\n⚡ Server VIP • Phát trực tiếp trong App`
  - `url`: `${proxyBase}/hls/manifest.m3u8?url=${encodeBase64(ep.link_m3u8)}&ref=${encodeBase64('https://player.phimapi.com/')}`
  - Strictly omit `externalUrl` so Stremio plays inside the native player.

### R2. HLS Proxy Anti-403 Optimization (`src/routes/hls.js`)
- Bypass CDN hotlink protection (`*.kkphimplayer*.com` etc.):
  - Inject upstream headers on playlist & segment requests:
    - `Referer: https://player.phimapi.com/`
    - `Origin: https://player.phimapi.com`
    - `User-Agent: Mozilla/5 visual Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36`
  - Rewrite playlist contents so all sub-playlists and `.ts` / media segments route through the internal proxy.
  - Enforce CORS headers (`Access-Control-Allow-Origin: *`, `Access-Control-Allow-Headers: *`) and MIME types (`application/vnd.apple.mpegurl` / `video/mp2t`).

### R3. End-to-End Stream Test & Self-Debug Loop (`tests/test_kkphim_playback.js`)
- Implement an automated E2E test script:
  - Start local addon server on an ephemeral port.
  - **Test Case 1 (Stream Generation)**: Fetch streams for test slug `cuu-mon` (or equivalent valid title), verify `[VIP • KKPhim]` stream with `url` exists.
  - **Test Case 2 (Manifest Proxy Verification)**: GET the proxy manifest URL, verify HTTP 200, `#EXTM3U` tag, and rewritten `.ts` segment links.
  - **Test Case 3 (Segment Playback Verification)**: GET a rewritten `.ts` video segment through proxy, verify HTTP 200 (no 403 Forbidden / 500) and valid binary video buffer.
- **Self-Debug Mandate**: If any test case fails, analyze error logs, fix `src/routes/hls.js` or `src/providers/kkphim.js`, and re-run until all 3 pass 100%.

### R4. Verification & Git Deployment
- Run `node --check src/index.js` and all test suites.
- Commit & push to GitHub:
  `git add . && git commit -m "Fix & Verify: 100% In-App Playback for KKPhim with E2E verified HLS Proxy" && git push origin main`

## Acceptance Criteria

### Playback & Test Suite
- [ ] `node tests/test_kkphim_playback.js` passes all 3 test cases with 0 errors.
- [ ] Real TS segment fetch returns HTTP 200 with non-empty `video/mp2t` buffer without 403 Forbidden.
- [ ] KKPhim streams contain `url` and NO `externalUrl`.
- [ ] `node --check src/index.js` passes without syntax errors.

</USER_REQUEST>
