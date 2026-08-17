# Project: Stremio KKPhim In-App Playback Optimization & E2E Verified HLS Proxy

## Architecture
- **Provider Layer (`src/providers/kkphim.js`)**: Resolves IMDb IDs and movie/series slugs to direct `link_m3u8` streams. Emits Stremio in-app stream objects pointing to the local HLS proxy with Base64URL-encoded stream and referer URLs. Strictly omits `externalUrl` fallback streams.
- **Proxy Layer (`src/routes/hls.js`)**: Express sub-router mounted at `/hls`. Intercepts manifest (`/manifest.m3u8`) and segment (`/ts`) requests, injecting upstream anti-403 headers (`Referer: https://player.phimapi.com/`, `Origin: https://player.phimapi.com`, Chrome 126 Macintosh `User-Agent`). Rewrites m3u8 playlists so all sub-manifests and TS media chunks route through the proxy with CORS (`*`) and MIME type (`application/vnd.apple.mpegurl` / `video/mp2t`) enforcement.
- **Routing & Handlers (`src/index.js`, `src/handlers.js`)**: Express application lifecycle, dynamic configuration, Stremio catalog and stream aggregation.
- **E2E Test & Verification (`tests/test_kkphim_playback.js`, `tests/e2e.test.js`)**: Automated test runner executing on ephemeral ports, validating stream generation, manifest rewriting, and binary segment delivery without 403 Forbidden errors.

## Code Layout
- `src/providers/kkphim.js` — KKPhim stream extractor & formatter (Owned by M1 - COMPLETE)
- `src/routes/hls.js` — HLS proxy manifest rewriter & segment streamer (Owned by M2 - COMPLETE)
- `tests/test_kkphim_playback.js` — E2E playback test & self-debug loop (Owned by M3 - COMPLETE)
- `src/index.js` — Server entry point & route registration

## Feature Inventory
| # | Feature | Description | Milestone | Source |
|---|---------|-------------|-----------|--------|
| 1 | KKPhim link_m3u8 Extraction & Episode Matching | Accurately extract link_m3u8 and resolve single movie (index 0) or series (ep.name / tap-X) | M1 | ORIGINAL_REQUEST §R1 |
| 2 | In-App Stream Format & Exclusivity | Name 'VIP Movies 🎬', title format `[VIP • KKPhim] ${server} [Tập ${ep}] Full HD (HLS Proxy)\n⚡ Server VIP • Phát trực tiếp trong App`, url with base64 encoded stream & ref, strictly omit externalUrl | M1 | ORIGINAL_REQUEST §R1 |
| 3 | Anti-403 Upstream Headers | Inject Referer: https://player.phimapi.com/, Origin: https://player.phimapi.com, modern Chrome 126 Mac User-Agent | M2 | ORIGINAL_REQUEST §R2 |
| 4 | Playlist & Media Segment Proxy Rewriting | Rewrite sub-playlists and .ts segments to route through proxy, bypass CDN hotlink protection (*.kkphimplayer*.com, *.phim1280.tv, etc.) | M2 | ORIGINAL_REQUEST §R2 |
| 5 | CORS & MIME Type Enforcement | Enforce Access-Control-Allow-Origin: *, video/mp2t, application/vnd.apple.mpegurl | M2 | ORIGINAL_REQUEST §R2 |
| 6 | E2E Playback Test Harness | Automated test script on ephemeral port verifying Test Cases 1, 2, and 3 | M3 | ORIGINAL_REQUEST §R3 |
| 7 | Self-Debug Loop & Verification | Validate all 3 test cases pass 100%, verify binary TS buffer > 100KB without 403 | M3 | ORIGINAL_REQUEST §R3 |
| 8 | Syntax Check & Git Deployment | node --check src/index.js, pass all test suites, commit & push to GitHub origin main | M4 | ORIGINAL_REQUEST §R4 |

## Milestones
| # | Name | Scope | Dependencies | Status |
|---|------|-------|-------------|--------|
| 1 | KKPhim Provider In-App Stream Format | `src/providers/kkphim.js` | none | DONE |
| 2 | HLS Proxy Anti-403 Optimization | `src/routes/hls.js` | none | DONE |
| 3 | E2E Stream Playback Test & Self-Debug Loop | `tests/test_kkphim_playback.js` | M1, M2 | DONE |
| 4 | Verification & Git Deployment | Full repo, git commit & push | M1, M2, M3 | DONE |

## Interface Contracts
### KKPhim Provider ↔ HLS Proxy
- Stream URL: `${proxyBase}/hls/manifest.m3u8?url=${encodeBase64(ep.link_m3u8)}&ref=${encodeBase64('https://player.phimapi.com/')}`
- Proxy Base: `http://localhost:${PORT}` or `http://127.0.0.1:${PORT}` or `https://${DOMAIN}`
- Encoding: Base64URL string (`Buffer.from(url, 'utf8').toString('base64url')`)
- Referer: Default referer for KKPhim is `https://player.phimapi.com/`

### HLS Proxy ↔ Upstream CDNs & Stremio Player
- Upstream Referer: `https://player.phimapi.com/`
- Upstream Origin: `https://player.phimapi.com`
- User-Agent: `Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36`
- Downstream Content-Type: `application/vnd.apple.mpegurl; charset=utf-8` (playlists), `video/mp2t` (media segments)
- CORS: `Access-Control-Allow-Origin: *`, `Access-Control-Allow-Headers: *`
