# Project: Stremio VIP Movies Addon Engine v1.6.2

## Architecture
- **Server Entry**: `src/index.js` (Express app mounting `/hls` proxy, root `/manifest.json`, and `/catalog`, `/stream`, `/meta` handlers).
- **Manifest**: `src/manifest.js` (22 active catalogs across 6 provider clusters: VSMOV, KKPhim, NguonC, STP, CLBPX, YAN).
- **Handlers**: `src/handlers.js` (Catalog routing, parallel 6-provider stream aggregation via `Promise.allSettled` with 4500ms timeout, stream sorting: 4K/UHD -> Vietsub -> Thuyết Minh -> Lồng Tiếng, in-app stream protocol sanitizer).
- **HLS Proxy Router**: `src/routes/hls.js` (Relative URI resolution with RFC 3986 `new URL(uri, base)`, base64url token preservation, dynamic Referer/Origin headers per CDN, streaming responseType with Range 206 seeking support, WebVTT subtitle conversion).
- **Provider Modules**: `src/providers/` (`vsmov.js`, `kkphim.js`, `nguonc.js`, `stp.js`, `clbpx.js`, `yan.js`, `hh3d.js`) exporting standard interface `{ id, label, getCatalog, getStreams, search, getDetail }`.
- **Shared Utilities**: `src/lib/utils.js` (scoring, slugging, keywords, season matching, normalization).
- **Test Infrastructure**: `tests/` (`verify_all_providers_playback.js`, `verify_playback.js`, `verify_hotfix_vsmov_kkphim.js`, `verify_new_providers.js`, `challenger1_v162_adversarial_empirical.test.js`, `challenger2_v162_aggregator_stress.test.js`).

## Code Layout
- `package.json` — Root configuration and version string (`1.6.2`)
- `src/index.js` — Server startup, route binding, error handling
- `src/manifest.js` — Addon manifest, 22 catalogs, genre definitions, idPrefixes (`1.6.2`)
- `src/handlers.js` — Catalog routing, stream aggregation, metadata resolution, landing page HTML (`1.6.2`)
- `src/routes/hls.js` — HLS proxy, manifest rewrite, segment streaming, WebVTT subtitles
- `src/routes/manifest.js` — Manifest route handler
- `src/config.js` — Configuration loader & environment variables
- `src/lib/utils.js` — Canonical text and string matching utilities
- `src/providers/` — Provider adapters for 6+ upstream streaming sources
- `tests/` — Automated verification and regression test suites

## Feature Inventory
| # | Feature | Description | Milestone | Source |
|---|---------|-------------|-----------|--------|
| 1 | HLS Proxy Relative URL Resolver | Resolve relative segment, key, and playlist URIs via `new URL()` | M1 | R1 |
| 2 | Base64URL Encoding & Token Safety | Use `base64url` for parameters and tokens without truncation | M1 | R1 |
| 3 | Dynamic CDN Referer/Origin Headers | Configure specific Referer/Origin for KKPhim, NguonC, VSMOV, STP, CLBPX, YAN | M1 | R1 |
| 4 | Streamed Segment & HTTP Range 206 | `responseType: 'stream'`, maxRedirects: 5, Range seek support | M1 | R1 |
| 5 | 22 Manifest Catalogs | Define 22 catalogs across 6 providers with skip/genre/search extra options | M2 | R2 |
| 6 | Catalog Routing & Alias Dispatch | Map all catalog IDs and aliases to correct providers | M3 | R3 |
| 7 | 6-Provider Parallel Stream Aggregation | `Promise.allSettled()` with 4500ms timeout per provider | M3 | R3 |
| 8 | Stream Quality & Audio Sorting | Sort streams: 4K/UHD -> Vietsub -> Thuyết Minh -> Lồng Tiếng -> Provider Rank | M3 | R3 |
| 9 | Strict In-App Stream Protocol | Ensure stream objects have valid `url` (HLS proxy) and no `externalUrl` | M3 | R3 |
| 10 | Provider Interface & Utility Standardization | Standard `{ id, label, getCatalog, getStreams, search, getDetail }`, reuse `src/lib/utils.js` | M4 | R4 |
| 11 | 3-Tier Fallback Mechanism | Multi-level episode matching and graceful `[]` return on missing sources | M4 | R4 |
| 12 | Comprehensive E2E Playback Test Suite | `tests/verify_all_providers_playback.js` testing all 22 catalogs and 6 providers (>100KB TS chunk with 0x47 sync byte) | M5 | R5 |
| 13 | Zero-Regression Suite Pass | Pass `verify_playback.js`, `verify_hotfix_vsmov_kkphim.js`, `verify_new_providers.js` 100% | M5 | R5 |
| 14 | Version Sync & Signature | Bump to `1.6.2` in `package.json`, `src/manifest.js`, `src/handlers.js` | M6 | R6 |
| 15 | Git Commit & Push | Commit with standard message and push to GitHub repository | M6 | R6 |

## Milestones
| # | Name | Scope | Dependencies | Status |
|---|------|-------|-------------|--------|
| M1 | HLS Proxy & Dynamic Headers | `src/routes/hls.js` refinement (regex defense-in-depth, Range seek) | None | DONE |
| M2 | Manifest Catalogs (22 Catalogs) | `src/manifest.js` verification and catalog configuration | None | DONE |
| M3 | Routing & 6-Provider Stream Aggregator | `src/handlers.js` (4500ms timeout, 4-tier sort, alias routing) | M1, M2 | DONE |
| M4 | Provider Standardization & 3-Tier Fallback | `src/providers/*.js` compliance with standard interface and utilities | None | DONE |
| M5 | E2E Playback & Regression Hardening | `tests/verify_all_providers_playback.js` + full test suite pass | M1, M2, M3, M4 | DONE |
| M6 | Versioning & Deployment | Version `1.6.2` synchronization, git commit & push | M5 | IN_PROGRESS |

## Interface Contracts
### Provider Interface (`src/providers/*.js`)
- `id`: `string`
- `label`: `string`
- `getCatalog({ type, id, extra, page })`: `Promise<{ metas: Array<Meta> }>`
- `getStreams({ type, id })`: `Promise<Array<Stream>>`
- `search(query, type)`: `Promise<Array<Meta>>`
- `getDetail(id, type)`: `Promise<Meta>`

### Stream Object Contract (`src/handlers.js` -> Stremio)
- `name`: `string` (formatted `[VIP N • BRAND] Audio/Quality (HLS Proxy)`)
- `title`: `string` (details, server host, episode info)
- `url`: `string` (proxied `/hls/manifest.m3u8?url=...&ref=...`)
- `behaviorHints`: `{ notWebReady: false, headers: { ... } }`
- Strict exclusion: `externalUrl` MUST NOT be present.
