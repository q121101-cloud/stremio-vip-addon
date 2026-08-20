# Project: Enterprise Vietnamese Multi-Provider Stremio & Nuvio Addon

## Architecture
Modular Node.js / Express architecture designed for high-performance Stremio v4 & Nuvio addon aggregation, anti-403 stream proxying, Cinemeta IMDb mapping, Supabase caching, and Cyber-Glassmorphism UI.

```
                  ┌────────────────────────────────────────┐
                  │   Stremio / Nuvio App / Web Browser    │
                  └──────────────────┬─────────────────────┘
                                     │
                 ┌───────────────────▼───────────────────┐
                 │          Express 4.x Router           │
                 │  - /manifest.json (Stremio v4)        │
                 │  - /catalog/:type/:id.json            │
                 │  - /meta/:type/:id.json               │
                 │  - /stream/:type/:id.json             │
                 │  - /hls/manifest.m3u8 & /hls/segment  │
                 │  - / (Cyber-Glassmorphism Dashboard)  │
                 └─────────┬───────────────────┬─────────┘
                           │                   │
         ┌─────────────────▼────────┐  ┌───────▼─────────────────┐
         │   Provider Aggregators   │  │   Anti-403 HLS Proxy    │
         │  - KKPhim (phimapi.com)  │  │  - M3U8 Tag Rewriter    │
         │  - VSMOV (api.vsmov.com) │  │  - Referer/Origin Spoof │
         │  - NguonC (phim.nguonc)  │  │  - Range 206 Support    │
         └─────────┬────────────────┘  └─────────────────────────┘
                   │
         ┌─────────▼─────────────────────────────────────┐
         │       Resolver, Matcher & Cache Layer         │
         │  - Cinemeta IMDb Resolver (tt... -> Slug)     │
         │  - In-Memory NodeCache (L1 RAM)               │
         │  - Supabase PostgreSQL (L2 Cloud DB)          │
         └───────────────────────────────────────────────┘
```

## Feature Inventory
| # | Feature | Description | Milestone | Source |
|---|---------|-------------|-----------|--------|
| 1 | KKPhim Catalogs | Catalogs for Phim Lẻ, Phim Bộ, Chiếu Rạp, Hoạt Hình, Phim Mới | M1 (DONE) | Survey |
| 2 | KKPhim Search & Detail | Full movie/series metadata and episode listing | M1 (DONE) | Survey |
| 3 | KKPhim Stream Extractor | Direct M3U8 stream extraction with quality tags | M1 (DONE) | Survey |
| 4 | VSMOV 4K Catalogs & Search | 4K Ultra HD catalog feeds and search with IMDb/TMDB tags | M1 (DONE) | Survey |
| 5 | VSMOV 4K Stream Extractor | Master HLS 4K resolution, WebVTT subtitles, audio track separation | M1 (DONE) | Survey |
| 6 | NguonC Feeds & Fallback | Phim Mới, Phim Lẻ, Phim Bộ feeds with proactive Vercel proxy fallback | M1 (DONE) | Survey |
| 7 | NguonC StreamC De-obfuscation | `data-obf` Base64 JSON parsing (`sUb`, `hD`) & Dean Edwards unpacker | M1 (DONE) | Survey |
| 8 | Anti-403 HLS Reverse Proxy | `/hls/manifest.m3u8` & `/hls/segment.ts` stream proxy with spoofed headers | M2 | Survey |
| 9 | M3U8 Manifest Rewriter | Segment URL rewrite to proxy endpoints with relative/absolute resolution | M2 | Survey |
| 10 | HTTP Range 206 Streaming | Byte-range header support for smooth seeking on Smart TVs | M2 | Survey |
| 11 | Universal Cinemeta Matcher | IMDb ID (`tt...`) to Vietnamese provider slug and title matcher | M3 | Survey |
| 12 | Series Episode/Season Matcher | Robust episode and season number matching across all 3 providers | M3 | Survey |
| 13 | Multi-Tier Caching (L1/L2) | In-memory NodeCache (L1) + Supabase PostgreSQL (L2) with auto-failover | M3 | Survey |
| 14 | Cache Maintenance Scripts | `scripts/flush_cache.js` CLI utility for manual pruning and cache flush | M3 | Survey |
| 15 | Cyber-Glassmorphism Dashboard | Obsidian background, animated Aurora mesh, Cyberpunk neon aesthetic | M4 | Survey |
| 16 | Spring Physics Toggles | Interactive toggles for providers & categories with physics transitions | M4 | Survey |
| 17 | Live Stream Simulator | Real-time preview of Stremio stream cards based on user configuration | M4 | Survey |
| 18 | Dynamic Base64URL Config | Real-time configuration token generator and URL builder | M4 | Survey |
| 19 | 1-Click QR Code Modal | Multi-platform TV installation QR code generator and deep-link launcher | M4 | Survey |
| 20 | Dual Cloud Deployment | Serverless (Vercel) and Container (Render) production readiness | M4 | Survey |
| 21 | E2E Test Suite (Tiers 1-4) | Comprehensive opaque-box and integration test suite in Vitest | E2E Track (DONE) | Survey |
| 22 | Adversarial Hardening (Tier 5) | White-box stress testing, edge-case validation, forensic verification | M5 | Survey |

## Milestones
| # | Name | Scope | Dependencies | Status |
|---|------|-------|-------------|--------|
| E2E | E2E Test Suite Track | Design test infra (`TEST_INFRA.md`), build Tiers 1-4 test suite, publish `TEST_READY.md` | none | DONE |
| M1 | Multi-Provider Resolvers & Catalogs | Implement KKPhim, VSMOV 4K, NguonC clients, manifest, catalog, and meta routes | none | DONE |
| M2 | Anti-403 HLS Streaming Proxy | Implement `/hls/manifest.m3u8`, `/hls/segment.ts`, M3U8 rewriter, Range 206, header spoofing | M1 | DONE |
| M3 | Cinemeta Matcher & Supabase Caching | Universal IMDb mapping, series season/episode matcher, Supabase DB & NodeCache L1/L2 | M1 | DONE |
| M4 | Cyber-Glassmorphism Dashboard | Obsidian Aurora UI, spring toggles, live stream simulator, QR code modal, base64url config | M1, M2, M3 | IN_PROGRESS |
| M5 | Full E2E Verification & Hardening | Execute 100% E2E test suite (Tiers 1-4), Tier 5 adversarial stress testing, syntax check | M1-M4, E2E | PLANNED |

## Interface Contracts

### 1. Provider Interface Contract (`src/providers/base.js`)
All providers (`KKPhimProvider`, `VSMOVProvider`, `NguonCProvider`) extend `BaseProvider` and expose:
- `getCatalog(catalogId, extra = {}) -> Promise<{ metas: Array<StremioMeta> }>`
- `getDetail(type, id) -> Promise<{ meta: StremioMetaDetail }>`
- `getStreams(type, id, extra = {}) -> Promise<Array<StremioStream>>`
- `search(query, type) -> Promise<{ metas: Array<StremioMeta> }>`

### 2. Stream Resolution Contract
Every stream object returned by providers / stream route must follow the Stremio v4 specification:
```javascript
{
  name: "[VIP 1 • KKPhim] 1080p FHD (Vietsub)",
  title: "Tập 1 • Server VIP\n⚡ Phát trực tiếp siêu tốc",
  url: "https://.../hls/manifest.m3u8?url=...&ref=...", // or direct m3u8
  behaviorHints: {
    notWebReady: false,
    bingeGroup: "kkphim-tap-1",
    proxyHeaders: {
      request: {
        "User-Agent": "Mozilla/5.0...",
        "Referer": "https://..."
      }
    }
  }
}
```

### 3. HLS Proxy Contract (`src/routes/hls.js`)
- `GET /hls/manifest.m3u8?url={b64Url}&ref={b64Ref}&origin={b64Origin}`
  - Fetches target M3U8 manifest.
  - Rewrites URI tags (`#EXT-X-STREAM-INF`, segment lines, `#EXT-X-KEY:URI="..."`) to route through `/hls/segment.ts` or `/hls/manifest.m3u8`.
- `GET /hls/segment.ts?url={b64Url}&ref={b64Ref}&origin={b64Origin}`
  - Streams binary video segment with header forwarding and HTTP 206 Range support.

### 4. Config Token Contract
- Configuration format: Base64URL encoded JSON string or bitmask:
  `{ providers: ["kkphim", "vsmov", "nguonc"], categories: ["phim-le", "phim-bo", "hoat-hinh", "phim-chieu-rap"] }`
- URL pattern: `/:config/manifest.json`, `/:config/catalog/:type/:id.json`, `/:config/stream/:type/:id.json`.

## Code Layout
```
stremio-nguonc-addon/
├── src/
│   ├── index.js             # Express server bootstrap & middleware
│   ├── manifest.js          # Stremio Addon manifest generator (static & config-aware)
│   ├── config.js            # Environment variables & runtime constants
│   ├── providers/
│   │   ├── base.js          # BaseProvider class definition
│   │   ├── kkphim.js        # KKPhim API client & stream resolver
│   │   ├── vsmov.js         # VSMOV 4K API client & stream resolver
│   │   └── nguonc.js        # NguonC API client, StreamC deobfuscator & fallback
│   ├── routes/
│   │   ├── catalog.js       # /catalog route handler
│   │   ├── meta.js          # /meta route handler
│   │   ├── stream.js        # /stream multi-provider aggregator
│   │   └── hls.js           # Anti-403 HLS proxy & M3U8 rewriter
│   ├── services/
│   │   ├── cinemeta.js      # Cinemeta IMDb metadata resolver
│   │   └── matcher.js       # Title, slug & season/episode matcher
│   ├── db/
│   │   ├── cache.js         # In-memory NodeCache (L1)
│   │   └── supabase.js      # Supabase PostgreSQL client (L2) & resilience
│   └── public/
│       ├── index.html       # Cyber-Glassmorphism Configurator Dashboard
│       ├── css/
│       │   └── style.css    # Obsidian Aurora styles & Glassmorphism tokens
│       └── js/
│           ├── app.js       # Dashboard logic, spring toggles, live stream simulator
│           └── qr-modal.js  # QR Code generator & TV install modal
├── scripts/
│   └── flush_cache.js       # CLI cache management utility
├── tests/
│   ├── tier1_features.test.js
│   ├── tier2_boundaries.test.js
│   ├── tier3_combinations.test.js
│   ├── tier4_workloads.test.js
│   ├── tier5_adversarial.test.js
│   ├── unit_m1_providers.test.js
│   └── adversarial_m1_stress.test.js
├── package.json
├── vercel.json
├── render.yaml
├── ORIGINAL_REQUEST.md
├── PROJECT.md
├── TEST_INFRA.md
└── TEST_READY.md
```
