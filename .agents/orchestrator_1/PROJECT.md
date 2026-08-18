# Project: Stremio VIP Movies Addon Engine v1.5.0

## Architecture
- **Runtime**: Node.js (Express)
- **Entry point**: `src/index.js`
- **Routing & Handlers**: `src/index.js`, `src/routes/manifest.js`, `src/routes/hls.js`, `src/handlers.js`
- **Configuration & Catalogs**: `src/config.js`, `src/manifest.js` (22 K20 standard catalogs across 7 providers)
- **Metadata Layer**: `src/lib/cinemeta.js` (Cinemeta API with 24h LRU caching & in-flight deduplication)
- **Utility Layer**: `src/lib/utils.js` (Canonical string, matching, season extraction, pagination, scoreMatch helpers)
- **Provider Swarm**:
  - `src/providers/vsmov.js` (VSMOV 4K - Ultra HD & Thuyết Minh, Referer: https://vsmov.com/)
  - `src/providers/kkphim.js` (KKPhim - Vietsub, Thuyết Minh, Lồng Tiếng, Referer: https://phimapi.com/)
  - `src/providers/nguonc.js` (NguonC - Vietsub / Thuyết Minh, Referer: https://embed15.streamc.xyz/)
  - `src/providers/stp.js` (STP - Western Cinema / K-Drama, Referer: https://suutamphim.org/)
  - `src/providers/hh3d.js` (HH3D - 3D Donghua / Xianxia, Referer: https://hh3d.tv/)
  - `src/providers/yan.js` (YAN - Daily Donghua, Referer: https://yanhh3d.org/)
  - `src/providers/clbpx.js` (CLBPX - Classic Wuxia / TVB, Referer: https://clbphimxua.com/)
- **HLS Proxy Engine**: `src/routes/hls.js` (M3U8 playlist rewriting, TS segment proxy with HTTP 206 Range seeking, anti-403 referer spoofing)
- **UI Dashboard**: Cyber-Glassmorphism configurator in `src/handlers.js` with glowing signature: `VIP Movies Addon v1.5.0 • Powered by <span class="brand-highlight">Q121101</span>`

## Feature Inventory
| # | Feature | Description | Milestone | Source |
|---|---------|-------------|-----------|--------|
| 1 | Canonical Utils & Deduplication | Ensure `src/lib/utils.js` exports all canonical helpers; remove duplicate `scoreMatch` and `escapeRegExp` in all 7 providers and import from `../lib/utils.js` | M1 | R1 |
| 2 | Standard Provider Interface | Enforce `getStreams` & `getCatalog` contracts, correct Referer headers, and strictly `url` (in-app HLS Proxy) without `externalUrl` in all 7 providers | M1 | R1 |
| 3 | Fail-Safe Stream Aggregator & Cinemeta | Concurrent `Promise.allSettled()` execution with 4000ms timeouts; Cinemeta resolution with caching and fallback; zero 500 crashes | M2 | R2 |
| 4 | 404 Routing Elimination & 22 Catalogs | Dual route mounting for default and `/:config` paths (`/manifest.json`, `/catalog/...`, `/stream/...`, `/meta/...`); 22 K20 catalogs in `src/manifest.js` & `src/config.js` | M2 | R3 |
| 5 | E2E Playback & Binary Chunk Verification | Automated E2E verification test downloading real video segment (> 50KB, HTTP 200, sync byte 0x47, HTTP 206 range) | M3 | R4 |
| 6 | UI Glassmorphism & Branding | Cyber-Glassmorphism configuration page with glowing signature `VIP Movies Addon v1.5.0 • Powered by <span class="brand-highlight">Q121101</span>` | M4 | R5 |
| 7 | Version 1.5.0 Sync & Git Deployment | Version sync in `package.json`, `manifest.js`, `config.js`; `git add . && git commit -m "..." && git push origin main` | M4 | R5 |

## Milestones
| # | Name | Scope | Dependencies | Status |
|---|------|-------|-------------|--------|
| M1 | Provider Standardization & Deduplication | Refactor `src/providers/*.js` to remove redundant local helper functions (`scoreMatch`, `escapeRegExp`) and import from `src/lib/utils.js`. Verify all 7 providers adhere to stream contract and referer mapping. | none | PLANNED |
| M2 | Aggregator, Routing & Catalogs Verification | Verify fail-safe stream aggregator, Cinemeta resolution, 404 routing elimination across default and `/:config` routes, and 22 standard K20 catalogs. | M1 | PLANNED |
| M3 | E2E Testing Track & Real Playback Verification | Execute full test suite including `tests/verify_playback.js` (ephemeral port, movie & series streams, real TS download >50KB, HTTP 206 range) and `tests/test_routing_and_22_catalogs.js`. | M1, M2 | PLANNED |
| M4 | UI Preservation, Versioning & Git Release | Verify Cyber-Glassmorphism UI, glowing signature, package version 1.5.0 sync, and perform git commit & push. | M3 | PLANNED |
| M5 | Final Gating (Reviewer, Challenger, Forensic Auditor) | Full adversarial review, empirical challenge, and forensic integrity audit. | M4 | PLANNED |

## Interface Contracts
### `src/lib/utils.js` ↔ Providers (`src/providers/*.js`)
- `scoreMatch(item, title, year = null, season = null) -> number`
- `normalizeText(text) -> string`
- `escapeRegExp(str) -> string`
- `safeExtra(extra) -> object`
- `safeSlug(slug) -> string`
- `safeKeyword(keyword) -> string`
- `safePage(page) -> number`
- `extractSeasonNumber(str) -> number | null`
- `isSeasonMatch(title, targetSeason) -> boolean`

### Providers ↔ Handlers (`src/handlers.js`)
- `getStreams({ id, type, season, episode, proxyBase, req, config }) -> Promise<Stream[]>`
- `getCatalog(type, page, extra) -> Promise<{ metas: Meta[], totalPages?: number }>`
- Stream Object: `{ name: string, title: string, url: string, behaviorHints?: object }` (NO `externalUrl`).

## Code Layout
- `src/index.js`: Main Express application and top-level route dispatch.
- `src/config.js`: Default configuration, active providers, and catalog definitions.
- `src/manifest.js`: Stremio manifest generator and 22 K20 standard catalogs.
- `src/handlers.js`: Request handlers for manifest, catalog, meta, stream, and configure UI.
- `src/lib/utils.js`: Canonical utility functions for scoring, text normalization, and parsing.
- `src/lib/cinemeta.js`: Cinemeta API client with LRU caching and in-flight request deduplication.
- `src/routes/hls.js`: HLS proxy router for playlist rewriting and segment streaming.
- `src/routes/manifest.js`: Manifest router.
- `src/providers/`: Provider implementations for VSMOV, KKPhim, NguonC, STP, HH3D, YAN, CLBPX.
- `tests/`: Automated test suites (`verify_playback.js`, `test_routing_and_22_catalogs.js`, `e2e.test.js`, etc.).
