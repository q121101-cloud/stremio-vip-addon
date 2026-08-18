# Project: VIP Movies Stremio Addon Engine v1.7.0 Overhaul

## Architecture
- Backend: Express.js Stremio v2 / Stremio Web compliant Addon.
- Frontend: Single-page Cyber-Glassmorphism Configurator (`/`, `/configure`, `/:config`, `/:config/configure`) following Taste-Skill Anti-Slop Design Standards.
- Token Pipeline: Bidirectional Base64URL serialization between frontend configurator state and backend route middleware (`/:config/*`).
- Streaming: In-App HLS proxy & WebVTT subtitle proxy engine supporting 7 provider clusters, multi-level M3U8 parent resolution, dynamic CDN Referer/Origin bypass, binary arraybuffer segment caching, and HTTP Range 206 streaming.
- Providers: 7 provider modules (`vsmov`, `kkphim`, `nguonc`, `stp`, `hh3d`, `yan`, `clbpx`) with strict Donghua Guard in `yan.js` and multi-keyword search fallback in `kkphim.js` / `nguonc.js`.

## Code Layout
- `src/handlers.js`: HTML Configurator template, Landing page generator, Catalog/Meta/Stream handlers, and Route Handlers.
- `src/routes/manifest.js`: Dynamic manifest routing and `/:config` token middleware.
- `src/routes/hls.js`: HLS manifest rewriter, multi-level baseUrl resolver, browser header simulation, binary segment proxy (`/hls/segment.ts`), AES key proxy (`/hls/key`), and WebVTT subtitle proxy (`/hls/sub.vtt`).
- `src/config.js`: Configuration parser, validator, Base64URL encoder/decoder, `DEFAULT_CONFIG`.
- `src/manifest.js`: Stremio addon manifest specifications and 22 standard K20 catalogs.
- `src/lib/utils.js`: Search keyword generation (`generateSearchKeywords`), episode matching (`matchEpisodeItem`), title matching (`scoreMatch`), and string cleaners.
- `src/lib/cinemeta.js`: Canonical Cinemeta IMDb resolver with LRU cache.
- `src/providers/`: 7 provider modules (`vsmov`, `kkphim`, `nguonc`, `stp`, `hh3d`, `yan`, `clbpx`).
- `tests/`: Automated E2E verification suites (`verify_v170_playback.js`, `verify_all_providers_playback.js`, `verify_playback.js`, etc.).

## Feature Inventory
| # | Feature | Description | Milestone | Source |
|---|---------|-------------|-----------|--------|
| 1 | Multi-Level M3U8 Parent Resolver | Rewrite Master to sub-variant manifests and resolve segment paths relative to sub-variant baseUrl in `src/routes/hls.js` | M1 | ORIGINAL_REQUEST §R1 |
| 2 | Full Browser Header Simulation | Windows Chrome 124 UA, Accept-Language, Connection keep-alive, and dynamic Referer/Origin mapping in `src/routes/hls.js` | M1 | ORIGINAL_REQUEST §R1 |
| 3 | Safe Binary Segment Proxy | `/hls/segment.ts` with `responseType: 'arraybuffer'`, `timeout: 15000`, `maxRedirects: 5`, `video/MP2T`, `Cache-Control: public, max-age=3600`, HTTP Range 206 support | M1 | ORIGINAL_REQUEST §R1 |
| 4 | STP Cheerio HTML Scraper & Stream Extractor | Scrape `sieutamphim.pro` catalog and search, XOR 0x2a decode, filter dead shortlinks, direct M3U8 extraction in `src/providers/stp.js` | M2 | ORIGINAL_REQUEST §R2 |
| 5 | CLBPX HTML Scraper & Multi-Candidate Stream Extractor | Scrape `clbphimxua.info` catalog and search, StreamC deobfuscation, multi-candidate fallback for series in `src/providers/clbpx.js` | M2 | ORIGINAL_REQUEST §R2 |
| 6 | YAN HTML Scraper & Strict Donghua Guard | Scrape `yanhh3d.pw` catalog and search, fbcdn embed deobfuscation, strict rejection of KDrama/US-UK/Live-action in `src/providers/yan.js` | M2 | ORIGINAL_REQUEST §R2 |
| 7 | Multi-Keyword Fallback | Original title, Vietnamese aliases, season/part stripped variations in `src/lib/utils.js`, `src/providers/kkphim.js`, `src/providers/nguonc.js` | M3 | ORIGINAL_REQUEST §R3 |
| 8 | Flexible & Strict Episode Matcher | Universal episode token matching with strict false-positive guards against multi-digit overlaps in `src/lib/utils.js` | M3 | ORIGINAL_REQUEST §R3 |
| 9 | E2E Playback Verification Test Suite | Verify Catalogs, KDrama/US-UK streams, Manifest HTTP 200, first 2 segments >100KB with sync byte 0x47, YAN Guard in `tests/verify_v170_playback.js` | M4 | ORIGINAL_REQUEST §R4 |
| 10 | Comprehensive All-Providers Test Suite | Verify 100% assertions across all 6 provider clusters in `tests/verify_all_providers_playback.js` | M4 | ORIGINAL_REQUEST §R4 |
| 11 | Versioning v1.7.0 & Brand Signature | Version `1.7.0` across `package.json`, `src/manifest.js`, `src/handlers.js`, `src/index.js` with signature `VIP Movies Addon v1.7.0 • Designed with Taste by <span class="brand-highlight">Q121101</span>` | M5 | ORIGINAL_REQUEST §R5 |
| 12 | Git Deployment | Commit and push to GitHub repository with PAT authentication and clean remote restoration | M5 | ORIGINAL_REQUEST §R5 |

## Milestones
| # | Name | Scope | Dependencies | Status |
|---|------|-------|-------------|--------|
| M1 | HLS Proxy Overhaul & Header Simulation | Refine `src/routes/hls.js` with Windows Chrome 124 UA, complete browser headers, binary arraybuffer segment proxy & Range support | none | DONE |
| M2 | Real Cheerio Scrapers & Provider Hardening | Refine `src/providers/stp.js`, `src/providers/clbpx.js`, `src/providers/yan.js` (dead link filtering, multi-candidate search fallback, strict Donghua Guard) | M1 | DONE |
| M3 | Multi-Keyword & Episode Matching Integrity | Verify `src/lib/utils.js`, `src/providers/kkphim.js`, `src/providers/nguonc.js` search fallback & episode matching | M1 | DONE |
| M4 | E2E Playback Verification & Zero Regression | Execute and achieve 100% PASS on `tests/verify_v170_playback.js`, `tests/verify_all_providers_playback.js`, `npm test` | M2, M3 | DONE |
| M5 | Versioning v1.7.0, Forensic Audit & Git Deployment | Sync version 1.7.0 in `src/index.js`, run independent Forensic Audit (`teamwork_preview_auditor`), git commit & push to `main` | M4 | DONE |

## Interface Contracts
### Client ↔ Server Config Token
- Client: JSON `{ providers: [...], categories: [...], apiKey: "..." }` -> Base64URL string token without padding.
- Server: Decodes Base64URL token in `decodeConfig(token)` into `{ providers, categories, apiKey }` matching `VALID_PROVIDERS` and `VALID_CATEGORIES`.
- Routes: `GET /:config` serves configurator pre-hydrated with `req.addonConfig`. `GET /:config/manifest.json` serves filtered manifest.
