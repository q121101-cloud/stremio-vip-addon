# Project: Stremio Vietnamese Multi-Provider Addon (NguonC, KKPhim, VSMOV)

## Architecture
- **Framework**: Express.js web server deploying to Vercel Serverless and Render container.
- **Data Flow**:
  - Client request -> `src/routes/stream.js` -> Multi-provider query (`Promise.allSettled` across KKPhim, NguonC, VSMOV) -> Title/Episode matching -> Stream formatting/Deduplication/Prioritization -> Response.
  - Media stream requests -> `src/routes/hls.js` -> Anti-403 dynamic header injection -> Stream extraction & Playlist rewrite -> Chunk proxying.
  - Caching -> L1 in-memory `LRUCache` + L2 Supabase persistent store (`src/db/supabase.js`) -> Managed via `scripts/flush_cache.js`.
- **Core Modules**:
  - `src/providers/nguonc.js`: NguonC API client, Vercel detection, Render proxy fallback, exponential backoff.
  - `src/providers/kkphim.js`: KKPhim API client & stream extractor.
  - `src/providers/vsmov.js`: VSMOV API client & 4K stream extractor.
  - `src/mapper.js`: Stream mapper, embed extraction, `data-obf` base64/packer decoders.
  - `src/routes/hls.js`: HLS reverse proxy & anti-403 playlist rewriter.
  - `src/routes/stream.js`: Stremio stream aggregation endpoint.
  - `src/db/supabase.js`: Database client and cache layer with silent failure handling.
  - `scripts/flush_cache.js`: Standalone script for cache invalidation.

## Feature Inventory
| # | Feature | Description | Milestone | Source |
|---|---------|-------------|-----------|--------|
| 1 | NguonC Vercel Proxy Routing | Detect Vercel environment and force proxy via Render to avoid Cloudflare 403 WAF blocking AWS IPs | M1 | ORIGINAL_REQUEST §R1 |
| 2 | NguonC Retry with Exponential Backoff | Resilient retry with backoff for transient 429/502/503 network errors | M1 | ORIGINAL_REQUEST §R1 |
| 3 | StreamC `data-obf` Payload Decoding | Robust decoding of `<div id="player" data-obf="...">` containing base64 m3u8 streams | M2 | ORIGINAL_REQUEST §R2 |
| 4 | StreamC Anti-403 HLS Proxying | Dynamic Referer/Origin header matching and M3U8 chunk rewriting for streamc.xyz | M2 | ORIGINAL_REQUEST §R2 |
| 5 | Standalone Cache Flush Script | `scripts/flush_cache.js` executable via `node scripts/flush_cache.js` | M3 | ORIGINAL_REQUEST §R3 |
| 6 | Supabase Cache Resiliency | Silent failure handling and flush helpers in `src/db/supabase.js` | M3 | ORIGINAL_REQUEST §R3 |
| 7 | Multi-Provider Aggregation & Episode Matching | Concurrent queries across KKPhim, NguonC, VSMOV and accurate episode/season matching | M4 | ORIGINAL_REQUEST §R4 |
| 8 | Comprehensive Test Suite & Verification | 100% passing Vitest suite (83+ tests across 7 files), syntax checks, flush script run, git sync | M5 | ORIGINAL_REQUEST §R5 |

## Milestones
| # | Name | Scope | Dependencies | Status |
|---|------|-------|-------------|--------|
| 1 | M1: NguonC Proxy & Backoff | `src/providers/nguonc.js`, `test/providers/nguonc.test.js` | none | DONE |
| 2 | M2: StreamC M3U8 & Anti-403 Proxy | `src/routes/hls.js`, `src/mapper.js`, `test/routes/hls.test.js`, `test/mapper.test.js` | none | DONE |
| 3 | M3: Cache Flush & Supabase Resiliency | `scripts/flush_cache.js`, `src/db/supabase.js`, `test/db/supabase.test.js` | none | DONE |
| 4 | M4: Multi-Provider Aggregation & Episodes | `src/routes/stream.js`, `test/routes/stream.test.js` | M1, M2 | PLANNED |
| 5 | M5: E2E Verification & Git Sync | Full test suite execution, syntax checks, cache flush run, git commit & push | M1, M2, M3, M4 | PLANNED |

## Interface Contracts
### `src/providers/nguonc.js`
- `fetchWithFallback(path, options)`: Resolves proxy URLs (`PROXY_URL`, `RENDER_EXTERNAL_URL`, `RENDER_BACKEND_URL`, `RENDER_URL`). If running on Vercel (`process.env.VERCEL === '1'` or `process.env.VERCEL_ENV`), directly routes through proxy. Implements exponential backoff on retries.
- Provider Interface: `search(query)`, `getDetail(slug)`, `getStreams(slug, episodeNumber)`.

### `src/mapper.js` & `src/routes/hls.js`
- `extractM3u8FromEmbed(embedUrl, html)`: Decodes `data-obf` base64 payload `{sUb, hD}`, unpacks packed scripts, extracts `.m3u8` or streaming tokens.
- HLS Proxy `/hls/proxy?url=...&referer=...`: Dynamically supplies origin/referer headers, rewrites playlists, streams chunks.

### `src/db/supabase.js` & `scripts/flush_cache.js`
- `flushStreamCache()`: Purges stale stream mappings/cache from Supabase and L1 cache. Returns `{ success: boolean, count: number }` with silent try/catch error tolerance.
- `flushAllCache()`: Purges all cached tables.
- `node scripts/flush_cache.js`: Standalone CLI execution.

### `src/routes/stream.js`
- Multi-provider aggregator: Queries VSMOV, KKPhim, and NguonC concurrently with bounded 3000ms timeouts. Accurately maps IMDb/prefix/slug IDs and filters episodes.

## Code Layout
- `src/`
  - `index.js`: Application entry point.
  - `mapper.js`: Stream format mapping & embed unpacking.
  - `routes/`
    - `stream.js`: Stremio `/stream/:type/:id.json` route.
    - `hls.js`: Reverse proxy `/hls/proxy` route.
  - `providers/`
    - `nguonc.js`: NguonC provider client.
    - `kkphim.js`: KKPhim provider client.
    - `vsmov.js`: VSMOV provider client.
  - `db/`
    - `supabase.js`: Supabase client and cache helpers.
- `scripts/`
  - `flush_cache.js`: Cache purge CLI script.
- `test/`
  - `providers/nguonc.test.js`
  - `providers/kkphim.test.js`
  - `providers/vsmov.test.js`
  - `routes/stream.test.js`
  - `routes/hls.test.js`
  - `mapper.test.js`
  - `db/supabase.test.js`
