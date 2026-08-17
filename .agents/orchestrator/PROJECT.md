# Project: VIP Movies Addon Engine v1.5.0

## Architecture
- **Framework**: Node.js, Express, Axios, Stremio Addon SDK protocol.
- **Entry Point**: `src/index.js` (Express server, middleware, route mounting).
- **Core Modules**:
  - `src/routes/hls.js`: HLS Proxy router (`/hls/manifest.m3u8`, `/hls/segment.ts`, `/hls/key`, `/hls/extract`). [DONE]
  - `src/routes/manifest.js`: Manifest and prefix routing middleware (`/:config/manifest.json`, `/:config/...`).
  - `src/manifest.js`: Catalog declarations (22 standard K20 catalogs) and addon metadata.
  - `src/config.js`: Configuration serializer and provider options.
  - `src/handlers.js`: Stream aggregator, catalog resolution, meta handler, configurator UI.
  - `src/lib/cinemeta.js`: Cinemeta official metadata resolver + 24h LRU cache.
  - `src/lib/cache.js`: In-memory LRU cache instances.
  - `src/providers/`: Modular provider scrapers/APIs (`vsmov.js`, `kkphim.js`, `nguonc.js`, `stp.js`, `hh3d.js`, `yan.js`, `clbpx.js`).
  - `tests/`: Automated E2E verification test suite (`tests/verify_playback.js`, `tests/e2e.test.js`). [DONE]

## Feature Inventory
| # | Feature | Description | Milestone | Source |
|---|---------|-------------|-----------|--------|
| 1 | HLS Manifest Rewriter | Rewrite line-by-line master & media playlists with Base64URL encoding | M1 (DONE) | R1 |
| 2 | HLS Segment Streaming | Pipe TS binary chunks with HTTP Range 206, video/MP2T, immutable cache | M1 (DONE) | R1 |
| 3 | HLS Key Proxying | Proxy decryption keys with upstream Referer & application/octet-stream | M1 (DONE) | R1 |
| 4 | VSMOV 4K Engine | Official API lookup, Master 4K M3U8 extraction, CDN headers, `[VIP 1 • VSMOV]` | M2 | R2 |
| 5 | KKPhim Engine | IMDb direct lookup + search fallback, multi-server audio, `[VIP 2 • KKPhim]` | M2 | R2 |
| 6 | NguonC Engine | StreamC obfuscation decoder, embed resolver, `[VIP 3 • NguonC]` | M2 | R2 |
| 7 | Specialized Providers | STP (cinema/Kdrama), HH3D (Donghua), YAN (Donghua), CLBPX (Wuxia/TVB) | M2 | R2 |
| 8 | In-App Stream Exclusivity | Strictly `url` only, no `externalUrl` in in-app stream objects | M2 | R2, R5 |
| 9 | Explicit Route Mounting | Support routes with & without `/:config/` for catalog, stream, meta | M3 | R3 |
| 10 | Search 404 Prevention | Robust `extra` parameter parser, provider search fan-out, return `{ metas: [] }` | M3 | R3 |
| 11 | 22 Catalogs K20 Standard | Define all 22 standard catalogs in manifest and config | M3 | R4 |
| 12 | Fail-Safe Stream Aggregator | Cinemeta metadata resolver, parallel provider queries, 4000ms timeout | M4 | R5 |
| 13 | Mandatory Playback Test | Automated E2E test downloading >50KB TS chunk with HTTP 200/206 | M5 (DONE) | R6 |
| 14 | UI & Versioning | Preserve Cyber-Glassmorphism UI, glowing brand signature, bump 1.5.0, git push | M6 | R7 |

## Milestones
| # | Name | Scope | Dependencies | Status |
|---|------|-------|-------------|--------|
| M1 | HLS Proxy & Segment Rewriter | `src/routes/hls.js`, `src/mapper.js` | None | **DONE** |
| M2 | Multi-Provider Engine Architecture | `src/providers/` (`vsmov`, `kkphim`, `nguonc`, `stp`, `hh3d`, `yan`, `clbpx`) | M1 | **DONE** |
| M3 | Routing, 404 Prevention & 22 Catalogs | `src/index.js`, `src/routes/manifest.js`, `src/manifest.js`, `src/config.js` | M2 | **DONE** |
| M4 | Fail-Safe Stream Aggregator | `src/handlers.js`, `src/lib/cinemeta.js` | M1, M2, M3 | **DONE** |
| M5 | E2E Playback Test Suite | `tests/verify_playback.js`, `tests/e2e.test.js` | M1, M2, M3, M4 | IN_PROGRESS |
| M6 | UI, Versioning & Deployment | `package.json`, `src/handlers.js`, `src/manifest.js`, git push | M5 | IN_PROGRESS |


## Interface Contracts
### Provider Contract (`src/providers/*.js`)
- `id`: string (e.g. `'vsmov'`, `'kkphim'`, `'nguonc'`, `'stp'`, `'hh3d'`, `'yan'`, `'clbpx'`)
- `label`: string (e.g. `'VSMOV 4K'`, `'KKPhim'`, etc.)
- `getCatalog(type, catalogId, extra)`: `Promise<Array<{ id, name, type, poster, description }>>`
- `getStreams(type, id, userConfig)`: `Promise<Array<{ name: 'VIP Movies 🎬', title: string, url: string }>>`
- Invariant: Streams MUST NOT contain `externalUrl`.

### HLS Proxy Contract (`src/routes/hls.js`)
- `/hls/manifest.m3u8?url=...&ref=...`: Base64URL encoded parameters, returns rewritten M3U8.
- `/hls/segment.ts?url=...&ref=...`: Returns binary `video/MP2T` with HTTP Range (206) support.
- `/hls/key?url=...&ref=...`: Returns binary `application/octet-stream` decryption key.
