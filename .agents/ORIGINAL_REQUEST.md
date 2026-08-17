# Original User Request

## Initial Request — 2026-08-17T03:16:15Z

Fix IMDb title lookup with Cinemeta resolver, activate 3 providers (KKPhim, NguonC, VsMov) with independent error handling & 5s timeouts, and standardize Stremio Protocol streams (in-app `url` for HLS Proxy vs `externalUrl` for Embed Player).

Working directory: `/Users/quan/.gemini/antigravity/scratch/stremio-nguonc-addon`
Integrity mode: development

## Requirements

### R1. Cinemeta Title Resolver (`src/lib/cinemeta.js`)
- Resolve IMDb IDs (`tt...` or `tt...:season:ep`) via official Cinemeta API (`https://v3-cinemeta.strem.io/meta/${type}/${imdbId.split(':')[0]}.json`).
- Extract canonical title (`meta.name`), release year (`meta.year`), genres, and alternative names.
- Pass resolved canonical title & year to all 3 providers for 100% accurate search matching.
- Cache Cinemeta metadata in `LRUCache` (TTL: 24h).

### R2. Robust Multi-Provider Isolation (`src/providers/`)
- Wrap provider logic in individual `try...catch` blocks with 5-second axios timeouts so failure in one source never blocks or degrades other sources.
- **KKPhim** (`src/providers/kkphim.js`): Try direct IMDb lookup (`/imdb/title/${imdbId}`) -> fallback to Cinemeta title search (`/v1/api/tim-kiem?keyword=...`) -> match year/slug -> return all servers (Vietsub, Thuyết Minh, Lồng Tiếng).
- **NguonC** (`src/providers/nguonc.js`): Search with Cinemeta title (`/films/search?keyword=...`) -> return Vietsub & Thuyết Minh.
- **VSMOV** (`src/providers/vsmov.js`): Robust multi-gateway scraper, extract 1080p `master.m3u8` stream.

### R3. Standardize Stremio Stream Protocol (`src/handlers.js`)
- **In-App Direct Play (HLS Proxy)**:
  - Property: `url: "${baseUrl}/hls/manifest.m3u8?url=${b64Url}&ref=${b64Ref}"`
  - Title: `[VIP • ${Provider}] ${ServerName} (HLS Proxy)\n⚡ Phát trực tiếp trong App`
- **External Web Browser Play (Embed Player Fallback)**:
  - Property: `externalUrl: "${linkEmbed}"` (MUST NOT contain `url` property).
  - Title: `[Dự phòng • ${Provider}] ${ServerName} (Embed Player)\n🌐 Bấm để mở xem ngoài trình duyệt web`

### R4. Versioning & Deploy
- Retain Cyber-Glassmorphism UI and glowing brand footer: `VIP Movies Addon v1.4.0 • Powered by <span class="brand-highlight">Q121101</span>`.
- Version: `1.4.0` in `package.json` and `manifest.js`.
- Verify with `node --check src/index.js`.
- Deploy: `git add . && git commit -m "Fix v1.4.0: Cinemeta IMDb title resolution, activate KKPhim/VsMov, separate in-app HLS vs externalUrl Embed" && git push origin main`.

## Acceptance Criteria

### Stream & Resolver Verification
- [ ] Querying `/stream/movie/tt1375666.json` (Inception) resolves title via Cinemeta, returns active streams from KKPhim, NguonC, and VsMov.
- [ ] Streams with HLS Proxy have `url` and NO `externalUrl`.
- [ ] Streams with Embed Player have `externalUrl` and NO `url`.
- [ ] If one provider times out or throws an error, the remaining providers still return their streams without crashing the response.
- [ ] `node --check src/index.js` passes with zero errors.
