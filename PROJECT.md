# Project: VIP Movies Stremio Addon Engine v1.7.1 Audit & Live Backtest

## Architecture
- **Language/Runtime**: Node.js (Express, Stremio Addon SDK / HTTP routes)
- **Core Modules**:
  - `src/providers/`: Provider scrapers (`film4k.js`, `vsmov.js`, `kkphim.js`, `nguonc.js`, `stp.js`, `hh3d.js`, `yan.js`, `clbpx.js`)
  - `src/routes/hls.js`: HLS proxy streaming route, stream re-extraction, upstream error handling, m3u8 caching & segment rewriting.
  - `src/config.js`, `src/manifest.js`, `src/handlers.js`: Configuration parsing, addon manifest definitions, catalog/stream/meta request handlers.
  - `src/utils/`: HTTP clients, user agent rotators, cache managers, URL parsers.

## Feature Inventory
| # | Feature | Description | Milestone | Source |
|---|---------|-------------|-----------|--------|
| 1 | NguonC Stealth & Fallback | Verify Chrome 131 UA, stealth headers (Referer, Origin, Sec-Fetch-*), Vercel->Render fallback routing via RENDER_BACKEND_URL; add /api/nguonc-proxy route | M1 / M2 | R1 |
| 2 | Film4K Scraper & 4K streams | Fix generateSearchKeywords signature, cleanImdb extraction, add film4k meta handler and manifest label | M1 / M2 | R1 |
| 3 | HLS Upstream Error Fallback | Verify upstream HTTP >= 400 triggers graceful fallback (302 redirect / re-extraction) instead of 502, m3u8Cache.del() cache purge on failure, fix HTML 200 non-M3U8 caching bug | M1 / M2 | R1, R3 |
| 4 | Provider Registry Consistency | Verify 8 providers across VALID_PROVIDERS, DEFAULT_CONFIG, ALL_PROVIDERS, ALL_CATALOGS (25), ALL_ID_PREFIXES, client JS, and HTML configurator; update legacy test catalog count | M1 / M2 | R1 |
| 5 | Full Matrix Live Backtest | tests/live_backtest_all_providers.js: catalog, streams, proxy URL, m3u8 EXTM3U, .ts chunk >50KB (0x47 or 0x89) >=5/8 providers, markdown matrix | M2 | R2 |
| 6 | Expired/Broken CDN Fallback Test | Simulate expired upstream CDN URL -> response not 502, cache purged | M2 | R3 |
| 7 | Zero Failures & Deploy | npm test passes with 0 failures, git push to origin/main via designated auth URL, no secrets committed, url field only | M3 | R4 |

## Milestones
| # | Name | Scope | Dependencies | Status |
|---|------|-------|-------------|--------|
| M1 | Survey & Source Audit | Audit src/providers/, src/routes/hls.js, src/manifest.js, src/config.js, src/handlers.js for R1 requirements | none | DONE |
| M2 | Remediation, Live Backtest & Fallback | Fix identified bugs in src/, implement & run tests/live_backtest_all_providers.js & fallback tests | M1 | IN_PROGRESS |
| M3 | Test Suite & Git Deployment | Full npm test validation (0 failures), git push to origin/main | M2 | PLANNED |

## Code Layout
- `src/` — Implementation source files
- `tests/` — Test suites and live backtests
- `.agents/` — Agent coordination, briefing, and reports metadata
