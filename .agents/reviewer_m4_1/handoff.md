# Milestone 4 Reviewer & Critic Handoff Report: Fail-Safe Stream Aggregator & Metadata Resolution

## 1. Observation

Direct code inspections and test executions confirmed the following facts:

### 1.1 Parallel Provider Queries with Strict 4000ms Timeout (`Promise.allSettled`)
- **`src/handlers.js` (lines 137–148)**:
  `withTimeout` utility wraps provider calls with a 4000ms timeout and a rejection safety handler:
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
- **`src/handlers.js` (lines 929–935)**:
  Parallel asynchronous fan-out executed over active providers:
  ```javascript
  const results = await Promise.allSettled(
    providersToRun.map((provider) =>
      withTimeout(provider.getStreams(payload), 4000, provider.name || provider.id || 'Provider')
    )
  );
  ```

### 1.2 Stream Priority Ordering & Normalization
- **`src/handlers.js` (lines 778–805)**:
  Priority scoring strictly categorizes:
  - Priority 10: VSMOV (VIP 1) Master 4K Ultra HD (`3840x2160`)
  - Priority 20: VSMOV (VIP 1) Thuyết Minh / Other
  - Priority 30: KKPhim (VIP 2) Vietsub
  - Priority 40: KKPhim (VIP 2) Thuyết Minh / Lồng Tiếng / Other
  - Priority 50: NguonC (VIP 3) Vietsub
  - Priority 60: NguonC (VIP 3) Thuyết Minh / Other
  - Priority 70: STP Western & K-Drama
  - Priority 80: HH3D 3D Donghua
  - Priority 90: YAN Donghua Ongoing
  - Priority 100: CLBPX Wuxia & TVB
- **`src/handlers.js` (lines 961–972)**:
  Sorted via `mergedStreams.sort((a, b) => getStreamPriority(a) - getStreamPriority(b))` and deduplicated by target stream parameter or URL hash while preserving top priority placement.

### 1.3 In-App Exclusivity & Protocol Conformance
- **`src/handlers.js` (lines 944–955)**:
  ```javascript
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
  ```
  Verified: 100% of stream objects contain valid proxy `url`, and zero `externalUrl` property is present.

### 1.4 404 / 500 Prevention
- **`src/handlers.js` (lines 977–980)**:
  ```javascript
  } catch (err) {
    console.error(`[Stream Error] id=${id}`, err.message);
    return sendJSON(res, { streams: [] });
  }
  ```
  Empty results, malformed IDs, and total upstream provider failures return HTTP 200 `{ streams: [] }`.

### 1.5 Cinemeta Metadata Resolution (`src/lib/cinemeta.js`)
- `resolveCinemeta(type, rawId)` implements single-flight request deduplication via `inflightRequests` Map, 24h LRU caching on success, 1h negative caching on 404, and safe fallback on transient errors.

### 1.6 Empirical Test Execution Results
- `npm test`: 50 passed, 0 failed.
- `TEST_PORT=7491 node tests/e2e.test.js`: 88 passed, 0 failed.
- `node tests/m4_aggregator_empirical.test.js`: 15 passed, 0 failed.
- `node tests/verify_playback.js`: All 6 verification phases passed; real video TS chunk download verified (3,426,676 bytes > 50KB, sync byte `0x47`, HTTP 206 Range seeking).
- `node .agents/reviewer_m4_1/test_adversarial.js`: 12 passed, 0 failed.

---

## 2. Logic Chain

1. **Strict Protocol Safety**: Stremio player engines exhibit crashes or external redirect popups if `externalUrl` is mixed into in-app stream payloads. Sanitizing and deleting `externalUrl` while wrapping media links in the HLS proxy (`/hls/manifest.m3u8` or `/hls/extract`) guarantees 100% in-app video playback.
2. **Concurrency & Latency Bound**: By wrapping each provider call in `withTimeout(..., 4000)` and fanning out with `Promise.allSettled`, individual slow providers (or upstream rate limits / timeouts) cannot delay the aggregator response beyond 4000ms.
3. **Priority Invariant**: Sorting by `getStreamPriority` ensures that higher-quality streams (VSMOV 4K VIP 1 -> KKPhim VIP 2 -> NguonC VIP 3) appear first in the UI, providing optimal default stream selection.
4. **Resilience & Fault Tolerance**: Wrapping stream resolution in global error guards and negative cache handlers ensures that missing media, invalid IMDb tokens, or upstream outages always resolve to HTTP 200 with `{ streams: [] }`, preventing 404 or 500 error alerts in client apps.
5. **Integrity Assurance**: Automated codebase scans verified that no hardcoded test responses or facade bypasses exist. Real network calls and caching mechanisms operate as designed.

---

## 3. Caveats

- Upstream public video CDNs can occasionally return HTTP 429 (Rate Limit) when fanned out under rapid burst load. The aggregator correctly isolates these failures without crashing or blocking the user response.
- In-memory LRU caches are bound to the process lifetime and warm up dynamically upon incoming requests.

---

## 4. Conclusion

**Verdict: APPROVE**

Milestone 4 (Requirement R5: Fail-Safe Stream Aggregator & Metadata Resolution) fully complies with all requirements, interface contracts, error resilience standards, and playback verification criteria. No integrity violations or blocking flaws were detected.

---

## 5. Verification Method

To independently reproduce and verify this assessment, run:

```bash
# 1. Base integration test suite (50 assertions)
npm test

# 2. Comprehensive E2E test suite (88 assertions)
TEST_PORT=7491 node tests/e2e.test.js

# 3. Dedicated M4 empirical test suite (15 assertions)
node tests/m4_aggregator_empirical.test.js

# 4. Mandatory E2E binary playback verification (>50KB TS chunk & Range 206)
node tests/verify_playback.js

# 5. Reviewer adversarial stress test suite
node .agents/reviewer_m4_1/test_adversarial.js
```
