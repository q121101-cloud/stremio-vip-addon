# Forensic Audit Handoff Report — Milestone 2 Providers

## 1. Observation

A forensic integrity inspection and empirical verification were conducted on `src/providers/kkphim.js`, `src/providers/nguonc.js`, and `src/providers/vsmov.js`.

### 1.1 Source Code & Anti-Cheating Analysis
- **Zero hardcoded test strings**: Checked `src/providers/kkphim.js`, `src/providers/nguonc.js`, `src/providers/vsmov.js` for test IMDb IDs (`tt1375666`, `tt0903747`, `tt0499549`, `tt0816692`, `tt0388629`). None were found.
- **Genuine HTTP Endpoints**:
  - `kkphim.js`: Communicates with `https://phimapi.com` via axios client configured with 5000ms timeout.
  - `nguonc.js`: Communicates with `https://phim.nguonc.com/api` via axios client configured with 5000ms timeout.
  - `vsmov.js`: Communicates with gateways `https://vsmov.com`, `https://streamvsmov.com`, `https://vsmov.net` via axios client with 5000ms timeout.
- **Protocol Compliance (R3)**:
  - HLS Proxy streams provide `url` and omit `externalUrl`.
  - Embed Player streams provide `externalUrl` and omit `url`.

### 1.2 Empirical Failure & Broken Runtime Dependencies
Empirical test execution revealed a critical runtime breakdown in `src/providers/nguonc.js` and `src/providers/vsmov.js`:

1. **`src/providers/nguonc.js` Line 81**:
   ```javascript
   let itemYear = mapper.extractYear(item.category);
   ```
   However, `src/mapper.js` does not export `extractYear` in `module.exports` (line 356).
   - Execution of `nguonc.getStreams({ title: 'Inception', year: 2010, type: 'movie' })` invokes `scoreMatch()`, throwing:
     ```
     [NguonC/getStreams] Error: mapper.extractYear is not a function
     ```
   - As a result, any uncached title-based stream resolution on NguonC silently crashes inside `try...catch` and returns `[]` (0 streams).

2. **`src/providers/vsmov.js` Line 21 & Line 182**:
   ```javascript
   const { unpackDeanEdwards } = require('../mapper');
   ...
   const unpacked = unpackDeanEdwards(embedHtml);
   ```
   However, `src/mapper.js` does not export `unpackDeanEdwards` in `module.exports` (line 356).
   - Any execution path requiring Dean Edwards unpacking throws `TypeError: unpackDeanEdwards is not a function`.

3. **Masked Test Execution in `tests/e2e.test.js`**:
   - `tests/e2e.test.js` line 421 only checked `runner.assert(Array.isArray(streamRes.data.streams))` without asserting `streamRes.data.streams.length > 0`, allowing the NguonC runtime TypeError and 0-stream response to pass silently without triggering a test runner failure.

---

## 2. Logic Chain

1. **Requirement R1 & R2**: Canonical titles & years resolved from Cinemeta must be passed to all 3 providers for search matching and stream retrieval.
2. **Observation**: When `nguonc.getStreams` executes search matching with the resolved title and year, it executes `mapper.extractYear(item.category)`.
3. **Observation**: `mapper.extractYear` is undefined because `src/mapper.js` does not export `extractYear`.
4. **Deduction**: `nguonc.getStreams` throws `TypeError: mapper.extractYear is not a function`, aborting candidate scoring and returning an empty stream array (`[]`).
5. **Observation**: `vsmov.js` imports non-exported `unpackDeanEdwards` from `../mapper`, causing runtime `TypeError` when unpacking obfuscated streams.
6. **Deduction**: The work product violates Phase 2 Check 5 (Output Verification) and contains broken module export contracts that prevent functional execution of the target deliverables.

---

## 3. Caveats

- `src/providers/kkphim.js` is fully functional and clean of integrity violations.
- No intentional malicious backdoors or hardcoded bypasses were detected; the violation stems from unexported helper dependencies between `src/mapper.js` and `src/providers/{nguonc.js, vsmov.js}` combined with silent catch blocks and loose test assertions.

---

## 4. Conclusion

**Verdict: INTEGRITY VIOLATION**

The work product fails forensic behavioral verification due to broken runtime dependencies in `src/providers/nguonc.js` (`mapper.extractYear is not a function`) and `src/providers/vsmov.js` (`unpackDeanEdwards is not a function`), causing NguonC to fail stream extraction on all title searches.

### Required Remediations:
1. In `src/mapper.js`: Export `extractYear` and `unpackDeanEdwards` (or embed `extractYear` directly within `src/providers/nguonc.js`).
2. In `tests/e2e.test.js`: Update stream assertions to verify that active streams are actually returned (`length > 0`) for valid queries like Inception (`tt1375666`).

---

## 5. Verification Method

To independently reproduce and verify:
```bash
# 1. Run live uncached NguonC test
node -e "
const nguonc = require('./src/providers/nguonc');
nguonc.getStreams({ type: 'movie', title: 'Inception', year: 2010, proxyBase: 'http://localhost:7000' })
  .then(s => console.log('Streams count:', s.length));
"
# Observed: [NguonC/getStreams] Error: mapper.extractYear is not a function -> Streams count: 0

# 2. Check exported keys of src/mapper.js
node -e "console.log(Object.keys(require('./src/mapper')))"
# Observed: extractYear and unpackDeanEdwards are missing from exports
```
