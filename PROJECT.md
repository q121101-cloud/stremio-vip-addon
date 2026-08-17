# Project: Stremio VIP Addon v1.4.0 (Cinemeta Resolver, Multi-Provider Isolation, Protocol Standardization)

## Architecture
- **Framework**: Express.js (Node.js)
- **Primary Routes**:
  - `GET /` — Cyber-Glassmorphism Configurator Dashboard
  - `GET /manifest.json`, `GET /:config/manifest.json` — Dynamic Stremio/Nuvio manifest
  - `GET /catalog/:type/:id.json` — Multi-provider catalog browsing
  - `GET /meta/:type/:id.json` — Metadata resolution
  - `GET /stream/:type/:id.json` — Multi-provider stream aggregation & protocol enforcement
  - `GET /hls/*` — HLS Proxy & dynamic playlist/segment rewriting
  - `GET /health`, `GET /admin/cache/clear` — System health & LRU cache operations
- **Data Flow**:
  1. Client sends `/stream/:type/:id.json` (e.g. `/stream/movie/tt1375666.json`).
  2. If ID is IMDb ID (`tt...`), `src/lib/cinemeta.js` resolves canonical metadata (`name`, `year`, `genres`, `aliases`) using official Cinemeta API with 24h LRUCache.
  3. `src/handlers.js` dispatches enriched payload to active providers (`KKPhim`, `NguonC`, `VsMov`) concurrently with isolated 5s timeouts.
  4. Providers perform direct IMDb or canonical title/year search matching and generate stream items.
  5. `src/handlers.js` aggregates and standardizes streams:
     - In-App Direct Play (HLS Proxy): has `url` and NO `externalUrl`.
     - External Browser Play (Embed Player): has `externalUrl` and NO `url`.
  6. Response returns standardized Stremio JSON payload.

## Feature Inventory
| # | Feature | Description | Milestone | Source |
|---|---------|-------------|-----------|--------|
| 1 | Cinemeta Resolver Module | `src/lib/cinemeta.js` resolving official Cinemeta API with 5s timeout, parsing canonical title, 4-digit release year, genres, and aliases | M1 | ORIGINAL_REQUEST §R1 |
| 2 | 24h LRU Caching | Dedicated `cinemetaCache` in `src/lib/cache.js` with 24h TTL and 5000 item capacity | M1 | ORIGINAL_REQUEST §R1 |
| 3 | KKPhim Provider Enhancement | 5s timeout, direct IMDb lookup -> fallback Cinemeta title & year search -> all servers (Vietsub, ThuyetMinh, LongTieng) | M2 | ORIGINAL_REQUEST §R2 |
| 4 | NguonC Provider Enhancement | 5s timeout, Cinemeta title & year search -> Vietsub & ThuyetMinh servers | M2 | ORIGINAL_REQUEST §R2 |
| 5 | VsMov Multi-Gateway Scraper | 5s timeout, multi-gateway fallback resilience, 1080p master.m3u8 stream extraction, error isolation | M2 | ORIGINAL_REQUEST §R2 |
| 6 | In-App HLS Proxy Protocol | `url: "${baseUrl}/hls/manifest.m3u8?url=${b64Url}&ref=${b64Ref}"` and NO `externalUrl`, standardized title format | M3 | ORIGINAL_REQUEST §R3 |
| 7 | Embed Player Protocol | `externalUrl: "${linkEmbed}"` and NO `url`, standardized title format | M3 | ORIGINAL_REQUEST §R3 |
| 8 | Multi-Provider Error Isolation | Isolated `try...catch` and 5s timeout guard ensuring failing/timing out providers never block or crash the response | M3 | ORIGINAL_REQUEST §R2, §R3 |
| 9 | Versioning & Cyber-Glassmorphism UI | Retain UI with glowing brand footer `VIP Movies Addon v1.4.0 • Powered by <span class="brand-highlight">Q121101</span>`, package.json & manifest v1.4.0 | M4 | ORIGINAL_REQUEST §R4 |
| 10 | Git Deployment | Full verification, `node --check src/index.js`, git commit & push to origin main | M4 | ORIGINAL_REQUEST §R4 |

## Milestones
| # | Name | Scope | Dependencies | Status |
|---|------|-------|-------------|--------|
| 1 | M1: Cinemeta Resolver & LRU Cache | Implement `src/lib/cinemeta.js`, export `cinemetaCache` in `src/lib/cache.js`, update `src/api.js` | none | DONE |
| 2 | M2: Multi-Provider Isolation | Update `src/providers/kkphim.js`, `src/providers/nguonc.js`, `src/providers/vsmov.js` with 5s timeouts and Cinemeta title/year search matching | M1 | DONE |
| 3 | M3: Stream Protocol Standardization & Aggregation | Update `src/handlers.js` and `src/routes/hls.js` to strictly enforce `url` vs `externalUrl` exclusivity, title formatting, and aggregator isolation | M1, M2 | DONE |
| 4 | M4: Final Verification, UI Validation & Deploy | Run E2E test suite, verify UI & version 1.4.0, node --check, git commit & push | M1, M2, M3, E2E | IN_PROGRESS |


## Interface Contracts

### 1. Cinemeta Resolver Contract (`src/lib/cinemeta.js`)
```javascript
/**
 * @param {'movie'|'series'} type
 * @param {string} rawId - e.g. 'tt1375666' or 'tt0903747:1:1'
 * @returns {Promise<{
 *   imdbId: string,
 *   type: 'movie'|'series',
 *   name: string,
 *   year: number|null,
 *   releaseInfo: string|null,
 *   genres: string[],
 *   aliases: string[]
 * }|null>}
 */
async function resolveCinemeta(type, rawId);
```

### 2. Provider Invocation Contract (`src/providers/*.js`)
```javascript
/**
 * @param {Object} params
 * @param {string|null} params.imdbId - IMDb ID (e.g. 'tt1375666')
 * @param {'movie'|'series'} params.type - Content type
 * @param {string|null} params.title - Canonical title from Cinemeta (e.g. 'Inception')
 * @param {number|null} params.year - Release year from Cinemeta (e.g. 2010)
 * @param {string[]} [params.genres] - Genres from Cinemeta
 * @param {number|null} [params.season] - Season number
 * @param {number|string|null} [params.episode] - Episode number
 * @param {string|null} [params.slug] - Provider slug (if known)
 * @param {string} params.proxyBase - Base URL for HLS proxy
 * @returns {Promise<Array<StreamItem>>}
 */
async function getStreams({ imdbId, type, title, year, genres, season, episode, slug, proxyBase });
```

### 3. Stream Item Stremio Protocol Contract
- **In-App Direct Play (HLS Proxy)**:
  ```javascript
  {
    name: 'VIP Movies 🎬',
    title: '[VIP • ' + providerLabel + '] ' + serverName + ' (HLS Proxy)\n⚡ Phát trực tiếp trong App',
    url: proxyBase + '/hls/manifest.m3u8?url=' + encodeBase64(m3u8Url) + '&ref=' + encodeBase64(referer),
    behaviorHints: { notSupported: false, bingeGroup: providerId + '-' + (slug || 'stream') }
  }
  // MUST NOT HAVE externalUrl property!
  ```
- **External Browser Play (Embed Player)**:
  ```javascript
  {
    name: 'VIP Movies 🎬',
    title: '[Dự phòng • ' + providerLabel + '] ' + serverName + ' (Embed Player)\n🌐 Bấm để mở xem ngoài trình duyệt web',
    externalUrl: linkEmbed,
    behaviorHints: { notSupported: false, bingeGroup: providerId + '-' + (slug || 'stream') }
  }
  // MUST NOT HAVE url property!
  ```

## Code Layout
- `src/index.js` — Main Express server & middleware
- `src/handlers.js` — Core router, stream aggregator & UI configurator dashboard
- `src/manifest.js` — Stremio manifest definitions & dynamic catalog builder
- `src/api.js` — Central API layer & legacy compatibility
- `src/config.js` — Base64URL configuration encoder/decoder
- `src/mapper.js` — Utilities, unpacker, string cleaners
- `src/lib/cache.js` — In-memory LRUCache instances
- `src/lib/cinemeta.js` — Cinemeta official resolver & 24h caching
- `src/providers/kkphim.js` — KKPhim API provider
- `src/providers/nguonc.js` — NguonC API provider
- `src/providers/vsmov.js` — VsMov scraper provider
- `src/routes/hls.js` — HLS proxy, m3u8 playlist rewriter & TS streamer
- `src/routes/manifest.js` — Dynamic manifest token handler
- `test/` or `tests/` — E2E opaque-box test suites
