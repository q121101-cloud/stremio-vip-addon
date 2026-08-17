# Handoff Report — Milestone 1 Challenger 2

**Agent**: teamwork_preview_challenger_m1_2  
**Target Modules**: `src/lib/cinemeta.js`, `src/lib/cache.js`  
**Verdict**: **REJECT** (Requires minor 2-line input normalization fix in `src/lib/cinemeta.js`)

---

## 1. Observation

Empirical testing was conducted using three automated test suites across concurrency, edge cases, input parsing, synchronous cache access, and LRU cache invariants:
- `tests/test_cinemeta_challenger.js` (26 tests)
- `tests/test_cinemeta_deep.js` (15 tests)
- `tests/test_cinemeta_edgecases.js` (Reproduction probe)

### Observed Results & Exact Findings:

#### Finding 1: Uppercase IMDb ID (`TT...`) Fails with HTTP 404
In `src/lib/cinemeta.js`:
```javascript
// Lines 99-103:
const imdbId = String(rawId).split(':')[0].trim();
if (!/^tt\d+/i.test(imdbId)) {
  return null;
}
// Line 115:
const res = await cinemetaClient.get(`/meta/${cleanType}/${imdbId}.json`);
```
- **Observed Behavior**: When `resolveCinemeta('series', 'TT0903747')` or `resolveCinemeta('movie', 'TT1375666')` is executed, the regex `/^tt\d+/i` matches, but `imdbId` retains uppercase `"TT..."`.
- **Error Output**:
  ```
  [Cinemeta] Failed to resolve TT0903747 (series): Request failed with status code 404
  ```
- **Impact**: Upstream Cinemeta API strictly requires lowercase `tt...` paths (`/meta/movie/tt1375666.json`). Uppercase requests fail with 404, returning `null` metadata to `src/handlers.js` line 574 (`title = null`), causing all downstream provider title searches to fail.
- **Cache Key Divergence**: In `getCachedCinemeta` and `resolveCinemeta`, the cache key becomes `cinemeta:movie:TT1375666` instead of `cinemeta:movie:tt1375666`.

#### Finding 2: Unanchored Regex Allows Trailing Garbage / Malformed Inputs
- In `src/lib/cinemeta.js` line 101 and line 163:
  ```javascript
  if (!/^tt\d+/i.test(imdbId))
  ```
- **Observed Behavior**: Because the regex lacks an end-of-string anchor (`$`), inputs such as `tt12345/../path` or `tt1375666; DROP TABLE` evaluate to `true` on the regex test and trigger unnecessary outgoing HTTP requests.

#### Finding 3: Concurrency Performance & Cache Invariants (Verified Strong)
- **Warm Cache Concurrency**: 100 concurrent requests resolved in 1ms (>100,000 req/sec) with zero errors.
- **Cold Cache Concurrency**: 50 concurrent cold requests for `tt1375666` resolved in 196ms.
- **Synchronous Cache Access (`getCachedCinemeta`)**:
  - Successfully returns cached metadata synchronously without network calls.
  - Successfully resolves episode strings (`tt0903747:1:1`, `tt0903747:5:16`) against cached base ID `tt0903747`.
  - Safely returns `null` for negative cache entries (`null` value) and invalid inputs.
- **LRUCache**:
  - Successfully bounded to `maxSize` under 10,000 rapid insertions (9,900 evictions recorded).
  - Exact LRU eviction order verified.
  - TTL expiration and `prune()` functionality verified.
- **Year & Metadata Extraction**:
  - Correctly extracts 4-digit years from numbers (`2010`) and range strings (`"2008–2013"` -> `2008`).

---

## 2. Logic Chain

1. **Step 1 (Input Handling)**: In `src/lib/cinemeta.js` (lines 99-103 and 160-164), `rawId` is split on `:` and trimmed, but `.toLowerCase()` is not called.
2. **Step 2 (Case Sensitivity)**: Cinemeta's HTTP REST routing at `v3-cinemeta.strem.io/meta/${cleanType}/${imdbId}.json` is case-sensitive and returns 404 for uppercase `TT...`.
3. **Step 3 (Downstream Cascade)**: When `resolveCinemeta` receives an uppercase ID from a client or route handler, it throws a 404 and returns `null`. Consequently, `src/handlers.js` fails to resolve `title`, passing `title: null` into KKPhim, NguonC, and VsMov providers, breaking search matching.
4. **Step 4 (Remediation)**: Lowercasing `imdbId` with `String(rawId).split(':')[0].trim().toLowerCase()` and anchoring regex to `/^tt\d+$/` completely fixes both Finding 1 and Finding 2.

---

## 3. Caveats

- Testing against live `v3-cinemeta.strem.io` is subject to external network latency and rate limits. Occasional 5000ms timeouts on upstream Cinemeta can occur under 50+ simultaneous un-coalesced requests.
- The reviewer did NOT modify the implementation code in accordance with review-only constraints.

---

## 4. Conclusion

- **Verdict**: **REJECT**
- **Action Required for Worker**:
  Apply this 2-line fix in `src/lib/cinemeta.js` in both `resolveCinemeta` and `getCachedCinemeta`:
  ```javascript
  // Change line 100-101:
  const imdbId = String(rawId).split(':')[0].trim().toLowerCase();
  if (!/^tt\d+$/.test(imdbId)) {
    return null;
  }

  // Change line 162-163:
  const imdbId = String(rawId).split(':')[0].trim().toLowerCase();
  if (!/^tt\d+$/.test(imdbId)) return null;
  ```

---

## 5. Verification Method

To independently reproduce and verify the fix:

```bash
# 1. Run the edge-case reproduction test:
node tests/test_cinemeta_edgecases.js

# 2. Run the deep test suite:
node tests/test_cinemeta_deep.js

# 3. Run the full challenger test suite:
node tests/test_cinemeta_challenger.js
```
