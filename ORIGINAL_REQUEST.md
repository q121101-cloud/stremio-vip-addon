# Original User Request

## 2026-08-20T17:05:08Z

Build an enterprise-grade, high-performance Stremio & Nuvio Addon in Node.js/Express aggregating 3 major Vietnamese video providers (KKPhim, VSMOV 4K, NguonC) with seamless IMDb mapping, anti-403 HLS streaming proxy, Supabase caching, and a futuristic Cyber-Glassmorphism Configurator Dashboard.

Working directory: /Users/quan/.gemini/antigravity/scratch/stremio-nguonc-addon
Integrity mode: development

## Requirements

### R1. Multi-Provider Stream Resolvers & Catalog Feeds
Implement modular API clients and stream extractors for the 3 core providers:
- **KKPhim** (`phimapi.com`): Catalogs for Phim Lẻ, Phim Bộ, Chiếu Rạp, Hoạt Hình/Anime, with direct m3u8 stream resolution.
- **VSMOV 4K** (`api.vsmov.com`): 4K Ultra HD (3840x2160) streams, WebVTT subtitle tracks, and Thuyết Minh / Lồng Tiếng audio tracks.
- **NguonC** (`phim.nguonc.com`): StreamC CDN catalog feeds, episode resolution, and fallback mechanism.

### R2. Anti-403 HLS Streaming Reverse Proxy & M3U8 Rewriter
Implement a robust HLS streaming proxy (`/hls/stream.m3u8`) with custom header forwarding (`Referer`, `User-Agent`, `Origin`) to completely bypass 403 Forbidden errors from upstream CDNs (NguonC StreamC) and ensure smooth video playback on Smart TVs and mobile devices.

### R3. Universal IMDb / Cinemeta Metadata Matcher
Integrate Cinemeta resolver to map international IMDb IDs (`tt...`) and Vietnamese titles/aliases to corresponding provider slugs with season & episode matching.

### R4. Database Caching & Cloud Infrastructure
Connect Supabase PostgreSQL for caching resolved stream URLs and IMDb mappings with in-memory TTL caching (NodeCache). Ensure zero-error deployment compatibility on Vercel Serverless and Render.

### R5. Taste-Skill Cyber-Glassmorphism Configurator Dashboard
Provide an interactive web configuration dashboard featuring:
- Obsidian space background with animated Aurora mesh.
- Spring physics toggles for active providers and content categories.
- Real-time live Stremio stream list simulator.
- 1-Click QR Code Modal for Smart TV / Apple TV / Android TV installation and manifest copy.

## Acceptance Criteria

### Stream & Catalog Validation
- [ ] `GET /manifest.json` returns valid Stremio Addon manifest with catalogs for all active providers.
- [ ] `GET /catalog/:type/:id.json` returns structured metadata arrays matching Stremio protocol specifications.
- [ ] `GET /stream/:type/:id.json` returns high-speed m3u8 playback streams with clear quality tags (4K UHD, 1080p FHD, Vietsub, Thuyết minh).
- [ ] Upstream 403 Forbidden protected links (NguonC) play successfully via the internal HLS Proxy.

### Configurator Dashboard Validation
- [ ] `GET /` serves the futuristic Cyber-Glassmorphism dashboard with responsive mobile/desktop layout.
- [ ] Dynamic base64url token updates in real time when toggling providers and categories.
- [ ] QR code generator generates working Stremio deep links for instant Smart TV installation.

### System Stability & Test Suite
- [ ] All automated unit & integration tests pass with zero syntax or runtime errors (`node --check src/index.js`).

## Follow-up — 2026-08-20T17:58:58Z

Continue and complete the enterprise-grade Stremio & Nuvio Addon build in Node.js/Express aggregating 3 major Vietnamese video providers (KKPhim, VSMOV 4K, NguonC) with seamless IMDb mapping, anti-403 HLS streaming proxy, Supabase caching, and a futuristic Cyber-Glassmorphism Configurator Dashboard.

Working directory: /Users/quan/.gemini/antigravity/scratch/stremio-nguonc-addon
Integrity mode: development

Current State:
- M1 (Providers & Catalogs: KKPhim, VSMOV 4K, NguonC): COMPLETED & VERIFIED.
- M2 (Anti-403 HLS Streaming Proxy in src/routes/hls.js): COMPLETED & VERIFIED.
- M3 (Cinemeta IMDb Matching & Supabase PostgreSQL Caching): COMPLETED & VERIFIED.
- Test Suite: 401/401 tests passing.

Remaining Tasks:
- M4 (Taste-Skill Cyber-Glassmorphism Dashboard UI in src/public or dashboard renderer):
  - Obsidian Space background with Aurora mesh.
  - Spring physics toggles for active providers and categories.
  - Real-time live Stremio stream list simulator.
  - QR Code Modal for Smart TV / Android TV installation and manifest copy.
  - Dynamic base64url config token generation.
- M5 (Server Integration, Routing & End-to-End Victory Audit):
  - Ensure `src/index.js` boots cleanly, serves the dashboard, routes manifest, catalog, meta, stream, and HLS proxy.
  - Verify all 5 test tiers pass with 0 errors.
  - Push commit to GitHub repository main branch.

