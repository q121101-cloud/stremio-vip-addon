# Milestone 1 Adversarial Review Report: Cinemeta Resolver & LRU Cache

- **Reviewer**: Milestone 1 Reviewer 2 (Critic & Reviewer)
- **Verdict**: **APPROVE**
- **Overall Risk Assessment**: LOW

---

## 1. Observation

Direct observations and test results for `src/lib/cinemeta.js`, `src/lib/cache.js`, and `src/api.js`:

1. **Syntax & Integrity Checks**:
   - `node --check src/lib/cinemeta.js` → Exit code 0 (No syntax errors).
   - `node --check src/lib/cache.js` → Exit code 0 (No syntax errors).
   - `node --check src/api.js` → Exit code 0 (No syntax errors).
   - Integrity Inspection: Verified no mock facades, fake responses, or shortcut bypasses are embedded in source code. Code communicates with official endpoint `https://v3-cinemeta.strem.io` and project `LRUCache`.

2. **Resolution & Metadata Parsing**:
   - Movie query (`tt1375666` - Inception):
     - Output: `{ imdbId: 'tt1375666', type: 'movie', name: 'Inception', originalName: 'Inception', year: 2010, releaseInfo: '2010', genres: ['Action', 'Adventure', 'Sci-Fi'], aliases: [], poster: 'https://...', background: 'https://...', description: '...' }`
     - `year` is extracted as a 4-digit integer (`2010`).
   - Series query with Season/Episode ID (`tt0903747:1:1` - Breaking Bad):
     - Sanitized ID: `'tt0903747'` (stripped `:1:1`).
     - Output: `{ imdbId: 'tt0903747', type: 'series', name: 'Breaking Bad', year: 2008, releaseInfo: '2008–2013', genres: ['Crime', 'Drama', 'Thriller'] }`
     - Start year correctly extracted from range (`2008`), while preserving full string in `releaseInfo` (`'2008–2013'`).
   - Type alias normalization: `resolveCinemeta("tv", "tt0944947:1:1")` correctly queries `series` endpoint for Game of Thrones and extracts `year: 2011`.

3. **Error Handling & 404/500 Resilience**:
   - Non-existent ID (`tt000000001` / 404):
     - Returns `null`.
     - Negative caching confirmed: stored `null` in `cinemetaCache` with 1-hour TTL (`CACHE_TTL_FAILURE = 3600`).
     - Subsequent synchronous call `getCachedCinemeta("movie", "tt000000001")` returns `null` without issuing an HTTP request.
   - HTTP 500 / 503 / Network Timeout / Malformed Body:
     - Caught in `catch (err)` block, logs warning, returns `null` safely without unhandled promise rejections or crashing the process.
     - Not negatively cached, allowing immediate retry when upstream recovers.
   - Invalid raw ID inputs (`null`, `undefined`, `""`, `"abc"`, `"123"`, `"nguonc:123"`, `"tt:1:1"`):
     - Guarded by regex `/^tt\d+/i`, immediately returning `null` without network calls or cache pollution.

4. **Memory Safety & LRU Eviction**:
   - Tested writing 10,000 unique keys into `cinemetaCache` (max capacity 5,000).
   - Final `cinemetaCache.size` was exactly 5,000 entries (oldest 5,000 evicted).
   - Eviction count in `stats()` reported exactly 5,000 evictions.
   - Background interval `setInterval(..., 5*60*1000).unref()` runs periodic pruning without blocking process termination.

5. **Downstream API Integration (`src/api.js`)**:
   - `api.resolveCinemeta` properly delegates to `src/lib/cinemeta.js`.
   - `api.findFilmByImdbId("movie", "tt1375666")` resolves Inception via Cinemeta, matches NguonC film `"Kẻ Đánh Cắp Giấc Mơ"` (`ke-danh-cap-giac-mo`) with similarity score `1.00`.

---

## 2. Logic Chain

1. **R1 Compliance**:
   - `ORIGINAL_REQUEST.md` §R1 and `PROJECT.md` M1 require official Cinemeta resolution, 5s timeout, 4-digit release year extraction, genres/aliases parsing, and 24h LRU caching.
   - Observations 1, 2, and 4 confirm that `src/lib/cinemeta.js` and `src/lib/cache.js` completely satisfy these requirements.

2. **Error & Memory Resilience**:
   - Adversarial stress tests (Observation 3 & 4) demonstrate that unexpected inputs, upstream network failures (timeouts, 500, non-JSON bodies), and 404 responses are handled gracefully with appropriate negative caching for 404s and transparent recovery for transient errors.
   - The memory footprint is strictly bounded by `LRUCache.maxSize = 5000` with automated 5-minute unreferenced eviction sweeps.

3. **Contract Conformance**:
   - The return shape of `resolveCinemeta` matches the interface contract specified in `PROJECT.md` §1 (`imdbId`, `type`, `name`, `year`, `releaseInfo`, `genres`, `aliases`).

---

## 3. Adversarial Findings & Challenges

### Minor Edge Case 1: Case Sensitivity in Cinemeta HTTP Endpoints
- **Location**: `src/lib/cinemeta.js:100-101`
- **Description**: `rawId.split(':')[0].trim()` does not lowercase the ID. While the regex `/^tt\d+/i` allows uppercase `TT1375666`, sending `TT1375666` in the URL to Cinemeta causes a 404 on Cinemeta's CDN because their URL paths are case-sensitive.
- **Severity**: Low / Minor (Stremio natively passes lowercase `tt...`).
- **Recommendation**: In a future refactor, use `String(rawId).split(':')[0].trim().toLowerCase()`.

### Minor Edge Case 2: Case Sensitivity in Content Type Parameter
- **Location**: `src/lib/cinemeta.js:105`
- **Description**: `const cleanType = (type === 'series' || type === 'tv') ? 'series' : 'movie';` strictly checks exact lowercase strings. Passing `'Series'` or `'TV'` defaults to `'movie'`.
- **Severity**: Low / Minor (Stremio passes lowercase `movie` / `series`).
- **Recommendation**: In a future refactor, use `const cleanType = (type && /^(series|tv)$/i.test(type)) ? 'series' : 'movie';`.

---

## 4. Caveats

- Downstream provider adaptations (`src/providers/kkphim.js`, `src/providers/nguonc.js`, `src/providers/vsmov.js`) and stream protocol standardization in `src/handlers.js` are allocated to Milestones 2 and 3 and were not altered during Milestone 1.
- Testing live Cinemeta endpoints requires active network access.

---

## 5. Conclusion

**Verdict**: **APPROVE**

The Milestone 1 deliverable (`src/lib/cinemeta.js`, `src/lib/cache.js`, and `src/api.js`) is robust, well-structured, memory-safe, and passes all functional and adversarial criteria. It is ready for Milestone 2 (Multi-Provider Isolation).

---

## 6. Verification Method

To independently verify all findings and adversarial tests:

```bash
# 1. Syntax Check
node --check src/lib/cinemeta.js
node --check src/lib/cache.js
node --check src/api.js

# 2. Comprehensive Test Suite
node -e '
const assert = require("assert");
const { resolveCinemeta, getCachedCinemeta, cinemetaCache } = require("./src/lib/cinemeta");
const { LRUCache } = require("./src/lib/cache");
const api = require("./src/api");

(async () => {
  // Movie verification
  const movie = await resolveCinemeta("movie", "tt1375666");
  assert.strictEqual(movie.imdbId, "tt1375666");
  assert.strictEqual(movie.name, "Inception");
  assert.strictEqual(movie.year, 2010);
  assert(Array.isArray(movie.genres));

  // Sync Cache Lookup
  assert.deepStrictEqual(getCachedCinemeta("movie", "tt1375666"), movie);

  // Series with S:E notation
  const series = await resolveCinemeta("series", "tt0903747:1:1");
  assert.strictEqual(series.imdbId, "tt0903747");
  assert.strictEqual(series.name, "Breaking Bad");
  assert.strictEqual(series.year, 2008);
  assert.strictEqual(series.releaseInfo, "2008–2013");

  // LRU Eviction Bound
  const cache = new LRUCache(3, 60);
  cache.set("1", 1); cache.set("2", 2); cache.set("3", 3);
  cache.get("1"); // MRU order: 2, 3, 1
  cache.set("4", 4); // Evicts 2
  assert.strictEqual(cache.get("2"), undefined);
  assert.strictEqual(cache.get("1"), 1);

  // api.js delegation
  const apiMovie = await api.resolveCinemeta("movie", "tt1375666");
  assert.strictEqual(apiMovie.name, "Inception");

  console.log("Milestone 1 Verification PASSED! ✅");
})();
'
```
