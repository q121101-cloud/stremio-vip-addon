# Project: Stremio VIP Movies Addon Engine v1.6.0 Upgrade

## Architecture
- **Framework & Engine**: Express.js Stremio v2 Addon Engine with integrated HLS Proxy rewriter.
- **Providers Directory**: `src/providers/` (`stp.js`, `clbpx.js`, `yan.js`, `vsmov.js`, `kkphim.js`, `nguonc.js`, `hh3d.js`).
- **HLS Proxy Router**: `src/routes/hls.js` handling manifest rewriting (`/manifest.m3u8`), segment streaming with Range 206 (`/segment.ts`), AES key resolution (`/key`), and subtitle proxy (`/sub.vtt`).
- **Handlers & Manifest**: `src/handlers.js`, `src/manifest.js`, `src/index.js`.
- **E2E Test Suites**: `tests/verify_new_providers.js`, `tests/verify_playback.js`, `tests/verify_hotfix_vsmov_kkphim.js`, `src/test.js`.

## Feature Inventory
| # | Feature | Description | Milestone | Source |
|---|---|---|---|---|
| 1 | STP Domain & Header Update | Update `src/providers/stp.js` with `sieutamphim.pro` domain, `Referer: https://sieutamphim.pro/`, `Origin: https://sieutamphim.pro` | M1 | Survey 1 |
| 2 | STP Multi-Tier Extraction | WP-JSON search + XOR `0x2a` decoding with HTML / mirror fallback and safe `[]` | M1 | Survey 1 |
| 3 | STP Stream Labeling | Exact brand format `[VIP 4 • STP] Thuyết Minh HD (HLS Proxy)\n⚡ Server STP • sieutamphim.pro` | M1 | Survey 1 |
| 4 | CLBPX Domain & Header Update | Update `src/providers/clbpx.js` with `clbphimxua.info`, `Referer: https://clbphimxua.info/`, `Origin: https://clbphimxua.info` | M1 | Survey 2 |
| 5 | CLBPX Multi-Tier Extraction | Classic TVB/Wuxia Ophim endpoints + HTML search fallback and safe `[]` | M1 | Survey 2 |
| 6 | CLBPX Stream Labeling | Exact brand format `[VIP 5 • CLBPX] Lồng Tiếng Cổ Điển (HLS Proxy)\n⚡ Server CLBPX • clbphimxua.info` | M1 | Survey 2 |
| 7 | YAN Domain & Header Update | Update `src/providers/yan.js` with `yanhh3d.pw`, `Referer: https://yanhh3d.pw/`, `Origin: https://yanhh3d.pw` | M1 | Survey 2 |
| 8 | YAN Multi-Tier Extraction | Direct live scraping (`data-obf.pU` / `master.m3u8`) + Ophim JSON fallback and safe `[]` | M1 | Survey 2 |
| 9 | YAN Stream Labeling | Exact brand format `[VIP 6 • YAN] 4K/FHD Donghua 3D (HLS Proxy)\n⚡ Server YAN • yanhh3d.pw` | M1 | Survey 2 |
| 10 | HLS Proxy Referer Routing | Update `SOURCE_REFERERS` in `src/routes/hls.js` for `sieutamphim.pro`, `clbphimxua.info`, and `yanhh3d.pw` | M1 | Survey 3 |
| 11 | Provider Invariants Enforcement | Zero `externalUrl`, only `url` (HLS Proxy), import `scoreMatch` from `src/lib/utils.js` | M1 | Survey 1, 2 |
| 12 | E2E Test Suite Creation | Create `tests/verify_new_providers.js` covering server lifecycle, health, manifest, streams, proxy rewriting, segment sync byte `0x47` | M2 | Survey 3 |
| 13 | Zero-Regression Verification | Verify 7/7 on `verify_playback.js` and 27/27 on `verify_hotfix_vsmov_kkphim.js` | M2 | Survey 3 |
| 14 | Version Bump v1.6.0 | Bump version to `1.6.0` in `package.json`, `src/manifest.js`, `src/handlers.js`, `src/index.js`, `src/config.js`, `src/routes/hls.js` | M3 | Survey 3 |
| 15 | Git Deployment | Commit and push to GitHub repository with token per instructions | M3 | User Request |

## Milestones
| # | Name | Scope | Dependencies | Status |
|---|---|---|---|---|
| M1 | Provider Upgrades & HLS Routing | Features 1-11: `src/providers/stp.js`, `src/providers/clbpx.js`, `src/providers/yan.js`, `src/routes/hls.js` | none | DONE |
| M2 | E2E Verification & Zero Regression | Features 12-13: `tests/verify_new_providers.js`, running full regression suites | M1 | DONE |
| M3 | Version Bump & Git Deploy | Features 14-15: Version string updates, Git commit & push | M2 | IN_PROGRESS |

## Interface Contracts
### Provider Contract (`stp`, `clbpx`, `yan` -> `src/handlers.js`)
- Must export: `{ id: string, label: string, search(keyword, page), getDetail(slug), getCatalog(type, page, extra), getStreams(payload) }`
- `getStreams(payload)` input: `{ type, id, season, episode, proxyBase }`
- `getStreams(payload)` output: `Array<{ name: 'VIP Movies 🎬', title: string, url: string, behaviorHints: object }>`
- Invariants: `externalUrl` MUST NOT be set or present. `url` must point to `${proxyBase}/hls/manifest.m3u8?...`.

### HLS Proxy Contract (`src/routes/hls.js` ↔ Providers & Clients)
- Manifest URL: `/hls/manifest.m3u8?url=<base64url>&ref=<base64url>` -> returns HTTP 200 `#EXTM3U` with rewritten segment URLs.
- Segment URL: `/hls/segment.ts?url=<base64url>&ref=<base64url>` -> returns HTTP 200/206 video/MP2T binary with MPEG-TS sync byte `0x47`.

## Code Layout
- `src/providers/stp.js`: STP Provider (sieutamphim.pro)
- `src/providers/clbpx.js`: CLBPX Provider (clbphimxua.info)
- `src/providers/yan.js`: YAN Provider (yanhh3d.pw)
- `src/routes/hls.js`: HLS Proxy Router & Referer Routing
- `src/lib/utils.js`: Shared matching and normalization utilities
- `src/handlers.js`: Addon request routing & HTML UI
- `src/manifest.js`: Stremio addon manifest descriptor
- `tests/verify_new_providers.js`: E2E verification test suite for M1-M3
