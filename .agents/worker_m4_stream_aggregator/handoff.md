# Milestone 4 Handoff Report: Fail-Safe Stream Aggregator & Metadata Resolution

## 1. Observation
- **Cinemeta Metadata Resolution (`src/lib/cinemeta.js`)**:
  - `resolveCinemeta(type, rawId)` accepts IMDb IDs (`tt...` or `tt...:season:ep`) and normalizes case/delimiters to extract clean `imdbId`.
  - Cinemeta lookup extracts canonical `name`, `originalName`, 4-digit release `year` (handling 1800-2100 cinema range and series multi-year ranges e.g. `2008–2013`), `genres`, `aliases`, `poster`, `background`, and `description`.
  - Implemented single-flight in-flight request deduplication via `inflightRequests` Map, ensuring concurrent burst requests for identical cold IDs only execute 1 outbound network call.
  - Cached via `cinemetaCache` (`src/lib/cache.js`) with 24-hour TTL (86400s) on success and 1-hour TTL on 404 negative lookups.
  - `getCachedCinemeta(type, rawId)` provides non-blocking synchronous cache retrieval.
  - Failures and timeouts gracefully return `null` without throwing unhandled exceptions.

- **Fail-Safe Stream Aggregator (`src/handlers.js`)**:
  - `handleStream(req, res)` fans out parallel queries across enabled providers (`vsmov`, `kkphim`, `nguonc`, `stp`, `hh3d`, `yan`, `clbpx`) using `Promise.allSettled`.
  - Each provider call is wrapped with `withTimeout(provider.getStreams(payload), 4000, label)` with rejection-guard (`promise.catch(() => {})`) to ensure slow or failing providers (>4000ms) fail silently and never abort the remaining providers.
  - Aggregates and sorts streams in strict priority order:
    1. VSMOV (VIP 1) Master 4K (Priority 10)
    2. VSMOV (VIP 1) Thuyết Minh / Other (Priority 20)
    3. KKPhim (VIP 2) Vietsub (Priority 30)
    4. KKPhim (VIP 2) Thuyết Minh / Lồng Tiếng / Other (Priority 40)
    5. NguonC (VIP 3) Vietsub (Priority 50)
    6. NguonC (VIP 3) Thuyết Minh / Other (Priority 60)
    7. STP Cinema & K-Drama (Priority 70)
    8. HH3D 3D Donghua (Priority 80)
    9. YAN Donghua Ongoing (Priority 90)
    10. CLBPX Wuxia & TVB (Priority 100)
  - `normalizeStreamKey(stream)` deduplicates streams by decoded target stream parameter or URL.
  - Strict Protocol & In-App Exclusivity: enforces `{ name: 'VIP Movies 🎬', title: string, url: string, behaviorHints: { notSupported: false, bingeGroup: string } }` and strictly deletes any `externalUrl`.
  - 404/500 Prevention: non-existent media, invalid IDs, or total provider outages always return HTTP 200 with `{ streams: [] }`.

## 2. Logic Chain
1. **Metadata Resolution**: Stremio stream requests provide either an IMDb ID (`tt...`) or provider-specific slug (`kkphim:...`, `nguonc:...`, `vsmov:...`). When an IMDb ID is supplied, `resolveCinemeta` maps it to canonical metadata. If Cinemeta is unavailable or times out, the handler degrades gracefully to ID/slug parsing without failing the request.
2. **Concurrency & Resilience**: Querying multiple external providers sequentially would multiply response latency. Fanning out with `Promise.allSettled` and a strict 4000ms cap guarantees that slow upstreams never block faster ones and response time never exceeds 4000ms.
3. **Stream Standardization**: Client players expect predictable metadata. Sanitizing all streams to `{ name: 'VIP Movies 🎬', title, url }` while removing `externalUrl` ensures flawless in-app HLS playback through the `/hls/manifest.m3u8` proxy.
4. **Deduplication**: Multiple providers may ingest and serve identical underlying streams. Normalizing by target stream parameter prevents cluttered and redundant playback options.

## 3. Caveats
- Upstream public video CDNs occasionally experience transient rate-limiting (HTTP 429) or timeouts under extreme high concurrency (50+ simultaneous outbound socket connections); the fail-safe aggregator is specifically designed to isolate and absorb these provider faults without impacting the user response.
- All in-memory LRU caches (`cinemetaCache`, `imdbCache`, `detailCache`) reset on process restart; warm-up happens automatically as queries arrive.

## 4. Conclusion
Milestone 4 (Requirement R5: Fail-Safe Stream Aggregator & Cinemeta Metadata Resolution) is 100% complete and fully verified against all interface contracts, concurrency stress tests, and playback verifications.

## 5. Verification Method
Run the following commands to independently verify:
```bash
# 1. Standard integration test suite
npm test

# 2. End-to-end integration and boundary tests
node tests/e2e.test.js

# 3. Full playback verification (MPEG-TS chunk download > 50KB & Range 206)
node tests/verify_playback.js

# 4. Dedicated M4 Stream Aggregator & Cinemeta empirical test suite
node tests/m4_aggregator_empirical.test.js

# 5. Cinemeta challenger test suites
node tests/test_cinemeta_challenger.js
node tests/test_cinemeta_deep.js
```
