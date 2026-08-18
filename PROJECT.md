# Project: Stremio VIP Movies Addon Engine v1.7.0 Overhaul

## Architecture
Stremio VIP Movies Addon provides multi-provider aggregation for Vietnamese, Korean, US-UK, and Asian content, backed by an intelligent HLS proxy for playlist rewriting and segment streaming.

```
                    ┌──────────────────────────────────────────────┐
                    │           Stremio Client / Web Player        │
                    └───────┬───────────────────────────────▲──────┘
                            │ (1) /manifest.json            │
                            │ (2) /catalog/...              │ (4) Playback stream
                            │ (3) /stream/...               │
                            ▼                               │
                    ┌───────────────────────────────────────┴──────┐
                    │     VIP Movies Addon Server (Express.js)     │
                    │   - Manifest & Handlers (v1.7.0)             │
                    │   - Stream Aggregator & Keyword Matcher      │
                    └───────┬───────────────────────────────▲──────┘
                            │                               │
            ┌───────────────┴───────────────┐               │
            ▼                               ▼               │
    ┌───────────────┐               ┌───────────────┐       │
    │ API Providers │               │ HTML Scrapers │       │
    │  - KKPhim     │               │  - STP        │       │
    │  - NguonC     │               │  - CLBPX      │       │
    │  - VSMOV      │               │  - YAN (Guard)│       │
    │  - Phim1280   │               └───────┬───────┘       │
    └───────┬───────┘                       │               │
            │                               │               │
            └───────────────┬───────────────┘               │
                            │ Direct M3U8                   │
                            ▼                               │
                    ┌───────────────────────────────┐       │
                    │     HLS Proxy Router (hls.js) │       │
                    │  - Multi-level M3U8 Resolver  ├───────┘
                    │  - Segment Proxy (/segment.ts)│
                    │  - Dynamic Referer/Origin     │
                    └───────────────────────────────┘
```

## Feature Inventory
| # | Feature | Description | Milestone | Source |
|---|---------|-------------|-----------|--------|
| F1 | Multi-Level M3U8 Parent Resolver | Rewrites master & sub-variant playlists to proxy URL and resolves relative segments against sub-variant baseUrl | M1 | ORIGINAL_REQUEST §R1 |
| F2 | Browser Header & Referer Spoofing | Dynamically injects Referer/Origin headers per provider (KKPhim, NguonC, VSMOV, STP, CLBPX, YAN) | M1 | ORIGINAL_REQUEST §R1 |
| F3 | Binary Segment Proxying | Streams `.ts` segments with `responseType: stream`/`arraybuffer`, HTTP 206 range seeking, Content-Type `video/MP2T` | M1 | ORIGINAL_REQUEST §R1 |
| F4 | STP HTML Scraper | Scrapes catalog and search results from `sieutamphim.pro`, resolves player XOR encoded stream links | M2 | ORIGINAL_REQUEST §R2 |
| F5 | CLBPX HTML Scraper | Scrapes catalog and search results from `clbphimxua.info`, resolves StreamC `data-obf` direct M3U8 | M2 | ORIGINAL_REQUEST §R2 |
| F6 | YAN Donghua Scraper & Guard | Scrapes `yanhh3d.pw` Donghua streams and strictly guards against live-action/KDrama/US-UK false positives | M2 | ORIGINAL_REQUEST §R2 |
| F7 | Multi-Keyword Search Fallback | Generates multi-keyword queries (original name, Vietnamese name, season/part stripped, special chars removed) | M3 | ORIGINAL_REQUEST §R3 |
| F8 | Flexible Episode Normalization | Accurately matches episode numbers across formats (`1`, `01`, `001`, `Tập 01`, `tap-1`, `Full`) | M3 | ORIGINAL_REQUEST §R3 |
| F9 | E2E Playback Verification Test Suite | Automated test suite `tests/verify_v170_playback.js` verifying catalogs, streams, TS sync byte 0x47, buffer >100KB, YAN guard | M4 | ORIGINAL_REQUEST §R4 |
| F10 | Regression & All-Provider Test Suite | Comprehensive testing of all providers via `verify_all_providers_playback.js` and `npm test` | M4 | ORIGINAL_REQUEST §R4 |
| F11 | Version Bump v1.7.0 & Brand Signature | Synchronize version `1.7.0` across `package.json`, `src/manifest.js`, and `src/handlers.js` with author signature | M5 | ORIGINAL_REQUEST §R5 |
| F12 | Git Commit & Deployment | Commit and push v1.7.0 overhaul to repository with clean git history | M5 | ORIGINAL_REQUEST §R5 |

## Milestones
| # | Name | Scope | Dependencies | Status |
|---|------|-------|-------------|--------|
| M1 | HLS Proxy Overhaul | `src/routes/hls.js`, multi-level resolution, binary segment proxy, referer spoofing | None | DONE |
| M2 | Real Cheerio HTML Scrapers | `src/providers/stp.js`, `src/providers/clbpx.js`, `src/providers/yan.js` with strict Donghua guard | M1 | PLANNED |
| M3 | Multi-Keyword Fallback & Episode Normalization | `src/lib/utils.js`, `src/providers/kkphim.js`, `src/providers/nguonc.js` search & episode matching | M1 | PLANNED |
| M4 | E2E Playback Verification Test Suite | `tests/verify_v170_playback.js`, `tests/verify_all_providers_playback.js`, regression validation | M2, M3 | PLANNED |
| M5 | Versioning v1.7.0, Brand Signature & Deploy | `package.json`, `src/manifest.js`, `src/handlers.js`, Git commit & push | M4 | PLANNED |

## Interface Contracts

### Provider Contract (`src/providers/*.js`)
- `getCatalog(type, id, extra)`: Returns `Promise<Array<{ id: string, name: string, type: 'movie'|'series', poster: string, description?: string }>>`
- `getStreams(type, id, meta)`: Returns `Promise<Array<{ name: string, title: string, url: string, behaviorHints?: object }>>`
- `getDetail(slug)`: Returns `Promise<object>` containing episode list and metadata.

### Utility Contract (`src/lib/utils.js`)
- `generateSearchKeywords(title, originalName, aliases)`: Returns `Array<string>` ordered from most specific to broadest fallback.
- `matchEpisodeItem(serverItem, targetEpNumber)`: Returns `boolean`.
- `isDonghuaQuery(title, genres, type)`: Returns `boolean`.

### HLS Proxy Contract (`src/routes/hls.js`)
- `GET /hls/manifest.m3u8?url=<base64>&ref=<base64>`: Returns rewritten M3U8 manifest (`application/vnd.apple.mpegurl`).
- `GET /hls/segment.ts?url=<base64>&ref=<base64>`: Streams binary TS chunk (`video/MP2T`, HTTP 200/206).
- `GET /hls/key?url=<base64>&ref=<base64>`: Proxies encryption keys (`application/octet-stream`).

## Code Layout
- `src/`
  - `index.js` — Main Express server bootstrap
  - `manifest.js` — Stremio addon manifest configuration (v1.7.0)
  - `handlers.js` — Stremio addon route handlers (manifest, catalog, stream, configure)
  - `routes/`
    - `hls.js` — Multi-level HLS proxy router & segment streamer
  - `providers/`
    - `index.js` — Aggregator & provider coordinator
    - `kkphim.js` — KKPhim API provider with multi-keyword search
    - `nguonc.js` — NguonC API provider with multi-keyword search
    - `vsmov.js` — VSMOV API provider
    - `phim1280.js` — Phim1280 API provider
    - `stp.js` — SieuTamPhim HTML scraper
    - `clbpx.js` — CLB Phim Xua HTML scraper
    - `yan.js` — YAN Donghua scraper with strict live-action filter
  - `lib/`
    - `utils.js` — Shared normalization, multi-keyword generator, episode matching
- `tests/`
  - `verify_v170_playback.js` — E2E Playback verification test suite for v1.7.0
  - `verify_all_providers_playback.js` — All-provider playback verification
  - `challenger_m1_2_deep_hls.test.js` — Deep HLS adversarial test suite
  - `forensic_hls_audit.js` — Forensic HLS integrity audit
