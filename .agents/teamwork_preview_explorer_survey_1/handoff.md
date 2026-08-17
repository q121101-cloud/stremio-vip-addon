# Survey Explorer 1 Handoff Report: Architecture & Cinemeta Resolver (R1)

## 1. Observation

### 1.1 Architecture & Entry Points
- **Entry Point**: `src/index.js` (Lines 1–131)
  - Express server initializing on `PORT` (default: 7000, HOST: `0.0.0.0`).
  - Middleware stack:
    - CORS handling with permissive wildcard headers (Lines 28–44).
    - JSON body parser (Line 47) and request duration logger (Lines 50–57).
  - Routing layout:
    - `/hls/*` → `src/routes/hls.js` (HLS Proxy: `/hls/extract`, `/hls/manifest.m3u8`, `/hls/ts`)
    - `/manifest.json`, `/:config/manifest.json`, `/:config/*` → `src/routes/manifest.js`
    - `/`, `/catalog/*`, `/meta/*`, `/stream/*`, `/health`, `/admin/cache/clear` → `src/handlers.js`
- **Module Layout**:
  - `src/config.js` (Lines 1–119): Base64URL encode/decode of user configuration (`providers`, `categories`, `apiKey`).
  - `src/manifest.js` (Lines 1–240): Defines base manifest (`org.vipmovies.stremio.addon` v1.4.0) and dynamic catalog generator for Stremio/Nuvio.
  - `src/handlers.js` (Lines 1–654):
    - GET `/`: Cyber-Glassmorphism Configurator Dashboard (HTML/CSS).
    - GET `/catalog/:type/:id.json`: Dispatches to provider catalog handlers.
    - GET `/meta/:type/:id.json`: Returns film meta (skips `tt...` to let Cinemeta handle client-side).
    - GET `/stream/:type/:id.json`: Aggregates streams across active providers via `Promise.allSettled`.
  - `src/mapper.js` (Lines 1–368): Metadata transformation, Dean Edwards P.A.C.K.E.R unpacker (`unpackDeanEdwards`), and regex string matching.
  - `src/lib/cache.js` (Lines 1–183): Zero-dependency in-memory `LRUCache` class using JS `Map` (order preservation, max size eviction, TTL expiration, periodic 5m pruning). Pre-instantiates `imdbCache`, `m3u8Cache`, `catalogCache`, `detailCache`.
  - `src/providers/`:
    - `kkphim.js` (Lines 1–416): KKPhim provider (`https://phimapi.com`).
    - `nguonc.js` (Lines 1–314): NguonC provider (`https://phim.nguonc.com/api`).
    - `vsmov.js` (Lines 1–247): VsMov scraper provider (`https://vsmov.com`).
  - `src/routes/`:
    - `hls.js` (Lines 1–288): HLS playlist rewriting and segment proxying.
    - `manifest.js` (Lines 1–153): Dynamic manifest resolution and token prefix middleware.

### 1.2 Existing Cinemeta Resolver & Caching Implementation
- **Current File State**: `src/lib/cinemeta.js` does **NOT** exist in the repository.
- **Current Resolver Logic**:
  - Located in `src/api.js` (Lines 48–55, 147–171):
    ```javascript
    const cinemetaClient = axios.create({
      baseURL: 'https://v3-cinemeta.strem.io',
      timeout: CINEMETA_TIMEOUT, // 8000ms
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; StremioVIPAddon/1.1)', Accept: 'application/json' },
    });

    async function resolveCinemeta(type, imdbId) {
      const key = `cinemeta:${type}:${imdbId}`;
      const cached = cache.get(key);
      if (cached !== undefined) return cached;
      try {
        const res = await cinemetaClient.get(`/meta/${type}/${imdbId}.json`);
        const meta = res.data?.meta;
        if (!meta) { cache.set(key, null, CACHE_TTL.cinemeta); return null; }
        const info = { name: meta.name || null, year: meta.year || null, originalName: meta.name || null };
        cache.set(key, info, CACHE_TTL.cinemeta);
        return info;
      } catch (err) { ... }
    }
    ```
- **Stream Handler Invocations** in `src/handlers.js` (Lines 565–575, 598):
  ```javascript
  if (/^tt\d+/i.test(id)) {
    const parts = id.split(':');
    imdbId  = parts[0];
    season  = parts[1] ? parseInt(parts[1], 10) : null;
    episode = parts[2] ? parseInt(parts[2], 10) : null;

    try {
      const cineMeta = await api.resolveCinemeta(type, imdbId);
      title = cineMeta?.name || null;
    } catch {}
  }
  const payload = { imdbId, type, title, season, episode, slug, proxyBase };
  ```
- **Current Caching Discrepancy**:
  - `src/api.js` uses `node-cache` (npm package) with `CACHE_TTL.cinemeta = 3600` (1 hour).
  - R1 specifies: Cache Cinemeta metadata in `LRUCache` (TTL: 24h).
  - `src/lib/cache.js` has a custom `LRUCache` class, but it is not currently utilized for Cinemeta metadata.

### 1.3 Cinemeta Official API Response Structure (Live Probed)
- Target Endpoint: `https://v3-cinemeta.strem.io/meta/${type}/${imdbId.split(':')[0]}.json`
- Movie response (`tt1375666` - Inception):
  - `meta.name`: `"Inception"`
  - `meta.year`: `"2010"` (string)
  - `meta.releaseInfo`: `"2010"`
  - `meta.genres` / `meta.genre`: `["Action", "Adventure", "Sci-Fi"]`
  - `meta.type`: `"movie"`
- Series response (`tt0903747` - Breaking Bad):
  - `meta.name`: `"Breaking Bad"`
  - `meta.year`: `"2008–2013"` (string range)
  - `meta.releaseInfo`: `"2008–2013"`
  - `meta.genres` / `meta.genre`: `["Crime", "Drama", "Thriller"]`
  - `meta.type`: `"series"`

### 1.4 Dependencies in `package.json`
- Installed in `node_modules`:
  - `axios`: `^1.7.7`
  - `cors`: `^2.8.5`
  - `express`: `^4.21.1`
  - `node-cache`: `^5.1.2`
- `lru-cache` (npm package): Not present in `node_modules`. However, `src/lib/cache.js` contains a complete, battle-tested `LRUCache` implementation without external dependencies.

---

## 2. Logic Chain

1. **R1 Requirement Analysis**:
   - R1 explicitly requires:
     - Creation of `src/lib/cinemeta.js`.
     - Resolution of IMDb IDs (stripping `:season:ep` via `imdbId.split(':')[0]`).
     - Extraction of canonical title (`meta.name`), release year (`meta.year`), genres (`meta.genres`/`meta.genre`), and alternative names.
     - 24-hour LRUCache persistence.
     - Passing resolved title & year to all 3 providers for search matching.
2. **Current Shortcomings**:
   - `src/lib/cinemeta.js` is absent; logic is conflated within `src/api.js`.
   - `src/handlers.js` only extracts `title` from `cineMeta` and discards `year`, `genres`, and `aliases`.
   - `payload` dispatched to providers omits `year`, making year-based disambiguation impossible in KKPhim and NguonC search fallbacks.
   - Cache TTL in `api.js` is 1 hour on `node-cache` instead of 24h on `LRUCache`.
3. **Synthesis of Required Changes**:
   - Implement `src/lib/cinemeta.js` with 5s axios timeout, 24h LRUCache instance (either exported from `src/lib/cache.js` or instantiated in `cinemeta.js`), and normalization of release year to a 4-digit integer/string.
   - Update `src/handlers.js` to import `src/lib/cinemeta.js`, resolve metadata, and construct an enriched payload containing `{ imdbId, type, title, year, genres, aliases, season, episode, slug, proxyBase }`.
   - Export `cinemetaCache` in `src/lib/cache.js` and include it in `/health` and `/admin/cache/clear` endpoints.

---

## 3. Caveats

1. **Year Formatting Variation in Cinemeta**:
   - Movies return `meta.year` as `"2010"` (or number `2010`).
   - Series return `meta.year` or `meta.releaseInfo` as `"2008–2013"` or `"2020-"`.
   - *Resolution*: Resolver must parse start year with regex `/\b(19\d\d|20\d\d)\b/` to provide a numeric `year` (e.g. `2008`) while preserving raw `releaseInfo`.
2. **Alternative Titles / Aliases**:
   - Cinemeta does not consistently return `meta.aliases`.
   - *Resolution*: Provide `aliases: meta.aliases || []`, and fallback gracefully if undefined.
3. **LRU Cache Implementation Choice**:
   - Using the project's built-in `LRUCache` from `src/lib/cache.js` avoids adding extra npm dependencies and integrates cleanly with existing cache pruning and stats reporting.

---

## 4. Conclusion & Interface Contracts

### 4.1 Interface Contract for `src/lib/cinemeta.js`

```javascript
/**
 * @typedef {Object} CinemetaMeta
 * @property {string} imdbId - Clean IMDb ID (e.g. "tt1375666")
 * @property {'movie'|'series'} type - Content type
 * @property {string} name - Canonical title (e.g. "Inception")
 * @property {number|null} year - 4-digit release start year (e.g. 2010)
 * @property {string|null} releaseInfo - Full release string (e.g. "2008–2013")
 * @property {string[]} genres - Array of genre strings
 * @property {string[]} aliases - Array of alternative names
 * @property {string|null} poster - Poster image URL
 * @property {string|null} background - Background banner URL
 * @property {string|null} description - Synopsis
 */

/**
 * Resolve IMDb ID to canonical metadata via Cinemeta API with 24h LRUCache
 * @param {'movie'|'series'} type
 * @param {string} rawId - e.g. "tt1375666" or "tt0903747:1:1"
 * @returns {Promise<CinemetaMeta|null>}
 */
async function resolveCinemeta(type, rawId);

/**
 * Get cached metadata without making network call
 * @param {'movie'|'series'} type
 * @param {string} rawId
 * @returns {CinemetaMeta|null}
 */
function getCachedCinemeta(type, rawId);

module.exports = {
  resolveCinemeta,
  getCachedCinemeta,
  cinemetaCache,
};
```

### 4.2 Required Modifications Summary Table

| File | Proposed Change | Purpose |
|---|---|---|
| `src/lib/cache.js` | Add `cinemetaCache = new LRUCache(5000, 86400)` and export | 24h LRU caching for Cinemeta metadata |
| `src/lib/cinemeta.js` | Create new module resolving Cinemeta with 5s timeout & LRU cache | Dedicated R1 resolver module |
| `src/handlers.js` | Use `cinemeta.resolveCinemeta`, enrich payload with `title`, `year`, `genres`, `aliases` | Pass canonical meta to all providers |
| `src/api.js` | Delegate `resolveCinemeta` to `src/lib/cinemeta.js` or keep for backward compatibility | Eliminate redundant code & sync cache |

---

## 5. Verification Method

1. **Syntax Check**:
   ```bash
   node --check src/index.js
   node --check src/handlers.js
   node --check src/lib/cinemeta.js
   node --check src/lib/cache.js
   ```
2. **Direct Cinemeta Resolver Unit Probe**:
   ```bash
   node -e '
   const { resolveCinemeta } = require("./src/lib/cinemeta");
   (async () => {
     const movie = await resolveCinemeta("movie", "tt1375666");
     console.log("Movie:", movie);
     const series = await resolveCinemeta("series", "tt0903747:1:1");
     console.log("Series:", series);
   })();
   '
   ```
3. **Full Stream Aggregator E2E Test**:
   ```bash
   curl -s http://localhost:7000/stream/movie/tt1375666.json | jq .
   ```
   Verify that response returns active streams from KKPhim, NguonC, and VsMov matching "Inception" (2010).
