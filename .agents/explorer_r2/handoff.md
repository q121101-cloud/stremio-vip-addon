# Milestone R2 Handoff Report: Fail-Safe Stream Aggregator & Metadata Resolution

## 1. Observation

### 1.1 Canonical Cinemeta Metadata Resolution (`src/lib/cinemeta.js`, `src/handlers.js`)
- **Cinemeta Client & Base URL** (`src/lib/cinemeta.js:19, 24-31`):
  ```javascript
  const CINEMETA_BASE_URL = 'https://v3-cinemeta.strem.io';
  const CINEMETA_TIMEOUT  = 5000; // 5 seconds
  const CACHE_TTL_SUCCESS = 86400; // 24 hours
  const CACHE_TTL_FAILURE = 3600;  // 1 hour for missing meta

  const cinemetaClient = axios.create({
    baseURL: CINEMETA_BASE_URL,
    timeout: CINEMETA_TIMEOUT,
    headers: {
      'User-Agent': 'Mozilla/5.0 (compatible; StremioVIPAddon/1.4; +https://github.com)',
      Accept: 'application/json',
    },
  });
  ```
- **Metadata Fetching Endpoint & In-Flight Deduplication** (`src/lib/cinemeta.js:122-130`):
  ```javascript
  if (inflightRequests.has(cacheKey)) {
    return inflightRequests.get(cacheKey);
  }
  ...
  const res = await cinemetaClient.get(`/meta/${cleanType}/${imdbId}.json`);
  const meta = res.data?.meta;
  ```
- **IMDb Resolution Trigger in Stream Handler** (`src/handlers.js:843-860`):
  ```javascript
  if (/^tt\d+/i.test(id)) {
    const parts = id.split(':');
    imdbId  = parts[0].toLowerCase();
    season  = parts[1] ? parseInt(parts[1], 10) : null;
    episode = parts[2] ? parseInt(parts[2], 10) : null;

    // Lấy canonical metadata qua Cinemeta (24h LRU cache)
    try {
      const cineMeta = await resolveCinemeta(type, imdbId);
      if (cineMeta) {
        title = cineMeta.name || null;
        year = cineMeta.year || null;
        genres = cineMeta.genres || [];
        aliases = cineMeta.aliases || [];
      }
    } catch (e) {
      console.warn(`[Stream Aggregator] Cinemeta resolve warning for ${imdbId}:`, e.message);
    }
  }
  ```
- **Synchronous Cache Access** (`src/lib/cinemeta.js:180-188`):
  ```javascript
  function getCachedCinemeta(type, rawId) {
    if (!rawId) return null;
    const imdbId = String(rawId).split(':')[0].trim().toLowerCase();
    if (!/^tt\d+$/i.test(imdbId)) return null;

    const cleanType = (type === 'series' || type === 'tv') ? 'series' : 'movie';
    const cacheKey = `cinemeta:${cleanType}:${imdbId}`;
    return cinemetaCache.get(cacheKey) || null;
  }
  ```
  Imported and utilized in `src/providers/vsmov.js:20, 341-349` and `src/providers/kkphim.js:20, 278-285`.

### 1.2 Concurrent Provider Dispatch with 4000ms Timeout (`src/handlers.js`)
- **Timeout Wrapper Function** (`src/handlers.js:137-148`):
  ```javascript
  function withTimeout(promise, ms = 4000, label = 'Provider') {
    let timer;
    if (promise && typeof promise.catch === 'function') {
      promise.catch(() => {});
    }
    const timeoutPromise = new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms);
    });
    return Promise.race([promise, timeoutPromise]).finally(() => {
      if (timer) clearTimeout(timer);
    });
  }
  ```
- **Concurrent Execution with `Promise.allSettled()`** (`src/handlers.js:923-935`):
  ```javascript
  const activeProviderKeys = (config.providers || []).filter((p) => ALL_PROVIDERS[p]);
  const keysToUse = activeProviderKeys.length > 0 ? activeProviderKeys : PROVIDER_ORDER;
  const providersToRun = keysToUse
    .filter((k) => ALL_PROVIDERS[k])
    .map((k) => ALL_PROVIDERS[k]);

  // CHẠY SONG SONG BẤT ĐỒNG BỘ với Promise.allSettled & strict 4000ms timeout per provider
  const results = await Promise.allSettled(
    providersToRun.map((provider) =>
      withTimeout(provider.getStreams(payload), 4000, provider.name || provider.id || 'Provider')
    )
  );
  ```

### 1.3 Safe Filtering, Protocol Conformance & Fault Isolation (`src/handlers.js`)
- **Stream Sanitization & In-App Exclusivity** (`src/handlers.js:936-958`):
  ```javascript
  const mergedStreams = [];
  for (const r of results) {
    if (r.status === 'fulfilled' && Array.isArray(r.value)) {
      for (const item of r.value) {
        if (!item || typeof item !== 'object') continue;
        if (!item.url || typeof item.url !== 'string' || !item.url.trim()) continue;

        // Standardize and sanitize per Stremio Stream Protocol
        const sanitized = {
          name: item.name || 'VIP Movies 🎬',
          title: item.title ? String(item.title).replace(/#/g, '') : 'VIP Server',
          url: String(item.url).trim(),
          behaviorHints: {
            notSupported: false,
            bingeGroup: item.behaviorHints?.bingeGroup || `stream-${slug || imdbId || 'main'}`,
            ...(item.behaviorHints || {}),
          },
        };
        delete sanitized.externalUrl;
        mergedStreams.push(sanitized);
      }
    }
  }
  ```
- **Priority Ranking & Deduplication** (`src/handlers.js:778-805, 960-972`):
  Streams are sorted by `getStreamPriority(stream)` (VIP 1 VSMOV 4K → VIP 1 VSMOV TM → VIP 2 KKPhim Vietsub → VIP 2 KKPhim TM → VIP 3 NguonC → Specialized Providers STP/HH3D/YAN/CLBPX) and deduplicated via `normalizeStreamKey(stream)`.
- **Guaranteed HTTP 200 Return** (`src/handlers.js:43-49, 976-980`):
  ```javascript
  return sendJSON(res, { streams: uniqueStreams });
  ...
  } catch (err) {
    console.error(`[Stream Error] id=${id}`, err.message);
    return sendJSON(res, { streams: [] });
  }
  ```
- **All Stream Route Variants Registered** (`src/handlers.js:983-986`):
  - `GET /stream/:type/:id.json`
  - `GET /stream/:type/:id`
  - `GET /:config/stream/:type/:id.json`
  - `GET /:config/stream/:type/:id`

### 1.4 Test Suite Execution Results
- `node tests/cinemeta_challenger.test.js`: **16/16 passed** (0 failed)
- `node tests/m4_aggregator_empirical.test.js`: **15/15 passed** (0 failed)
- `node tests/reviewer2_m4_adversarial.test.js`: **5/5 passed** (0 failed)
- `node tests/test_cinemeta_deep.js`: **15/15 passed** (0 failed)
- `node tests/test_cinemeta_edgecases.js`: **Passed**
- `node tests/verify_playback.js`: **Passed** (Downloaded 3,426,676 bytes TS segment > 50KB with sync byte 0x47 and HTTP 200/206)
- `node tests/e2e.test.js`: **89/89 passed** (0 failed)
- `npm test`: **50/50 passed** (0 failed)
- `node --check` across `src/index.js`, `src/handlers.js`, `src/lib/cinemeta.js`, `src/lib/cache.js`, `src/lib/utils.js`, and all 7 providers: **0 syntax errors**.

---

## 2. Logic Chain

1. **Premise 1 (Cinemeta Metadata Resolution)**:
   - `src/handlers.js` detects IMDb IDs (`/^tt\d+/i`) and calls `resolveCinemeta(type, imdbId)`.
   - `src/lib/cinemeta.js` queries `https://v3-cinemeta.strem.io/meta/${cleanType}/${imdbId}.json` with a 5000ms timeout.
   - It extracts canonical title, 4-digit release year, genres, and aliases, caching results in `cinemetaCache` for 24 hours (86,400s).
   - In-flight request deduplication (`inflightRequests`) ensures multiple concurrent queries for the same uncached title trigger only one upstream HTTP call.
   - Downstream providers access cached metadata via `getCachedCinemeta()` without performing redundant network calls.
   - **Conclusion 1**: Canonical IMDb metadata resolution via Cinemeta API is fully implemented, performant, and resilient against API latency/outages.

2. **Premise 2 (Concurrent Provider Execution & Strict 4000ms Timeout)**:
   - `src/handlers.js` evaluates active providers based on user configuration (`config.providers`) or defaults to `PROVIDER_ORDER`.
   - Each provider invocation `provider.getStreams(payload)` is wrapped with `withTimeout(..., 4000, ...)`.
   - All provider promises are awaited via `Promise.allSettled()`.
   - `withTimeout` attaches `promise.catch(() => {})` so any delayed rejection after timeout does not produce unhandled promise rejections.
   - Empirical test `tests/m4_aggregator_empirical.test.js` verified that a slow provider taking 4500ms+ is capped at ~4000ms without blocking fast providers or throwing unhandled errors.
   - **Conclusion 2**: Provider execution is fully concurrent, isolated, and strictly bound to the 4000ms timeout per provider.

3. **Premise 3 (Fail-Safe Response & Edge-Case Handling)**:
   - All exceptions (malformed IDs, invalid slugs, provider 404/500 HTTP errors, network timeouts) are caught at provider level, promise settling level, and handler level.
   - In every failure or empty scenario, `handleStream` executes `sendJSON(res, { streams: [] })` or returns the sanitized subset of successful streams.
   - `sendJSON` sets HTTP status 200, CORS `*`, Content-Type `application/json; charset=utf-8`, and Cache-Control headers.
   - `tests/m4_aggregator_empirical.test.js` Section 3 and `tests/e2e.test.js` Tier 3 confirmed that non-existent IDs, malformed slugs, and total upstream provider outages always return HTTP 200 `{ streams: [] }` without server crash.
   - **Conclusion 3**: Fail-safe stream aggregation is robust and guarantees HTTP 200 responses under all edge conditions.

4. **Premise 4 (In-App Stream Object Conformance)**:
   - All 7 providers generate stream URLs formatted for the internal HLS Proxy (`/hls/manifest.m3u8?url=...&ref=...`).
   - `src/handlers.js:954` explicitly executes `delete sanitized.externalUrl;` as a fail-safe invariant before aggregating streams.
   - E2E tests assert `s.externalUrl === undefined` and `typeof s.url === 'string'` for 100% of generated stream objects.
   - **Conclusion 4**: Stream objects strictly contain in-app `url` and strictly omit `externalUrl`.

---

## 3. Caveats
- **No caveats.** The implementation in `src/handlers.js`, `src/lib/cinemeta.js`, `src/lib/cache.js`, and `src/providers/*.js` satisfies all requirements of Milestone R2 without defects or regressions.

---

## 4. Conclusion
Milestone R2 (Fail-Safe Stream Aggregator & Metadata Resolution) is **100% complete and fully verified**:
1. Canonical IMDb metadata resolution via Cinemeta API is operational with 24-hour LRU caching and single-flight concurrency deduplication.
2. Active providers are queried concurrently via `Promise.allSettled()` with a strict 4000ms per-provider timeout.
3. Stream aggregator filters valid streams and guarantees HTTP 200 `{ streams: [...] }` across all edge cases (malformed IDs, timeouts, provider outages).
4. Stream objects strictly adhere to the in-app streaming protocol with valid `url` and no `externalUrl`.

---

## 5. Verification Method

To independently verify this assessment, execute the following commands in the project root:

```bash
# 1. Syntax check on core modules
node --check src/handlers.js
node --check src/lib/cinemeta.js
node --check src/lib/cache.js

# 2. Cinemeta Challenger Test Suite
node tests/cinemeta_challenger.test.js

# 3. Stream Aggregator Empirical Test Suite
node tests/m4_aggregator_empirical.test.js

# 4. Deep Adversarial Cinemeta & Cache Tests
node tests/reviewer2_m4_adversarial.test.js
node tests/test_cinemeta_deep.js
node tests/test_cinemeta_edgecases.js

# 5. Full End-to-End & Playback Verification
node tests/verify_playback.js
node tests/e2e.test.js
npm test
```

### Invalidation Conditions
- If any stream endpoint (`/stream/:type/:id.json` or `/:config/stream/:type/:id.json`) returns non-200 or throws an unhandled rejection when provided with malformed IDs, failing providers, or timed-out requests.
- If any stream object returned to Stremio contains `externalUrl` or lacks `url`.
- If Cinemeta requests block for > 5000ms or provider queries block for > 4000ms.
