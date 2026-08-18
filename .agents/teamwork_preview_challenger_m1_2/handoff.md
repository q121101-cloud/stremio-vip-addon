# Milestone 1 Challenger 2 Empirical Verification Report

**Author**: Challenger 2 (`teamwork_preview_challenger_m1_2`)  
**Timestamp**: 2026-08-18T04:53:30Z  
**Verdict**: **APPROVE**

---

## 1. Observation

Direct empirical observations from testing and code inspections across all Milestone 1 components:

### 1.1 Provider Codebase Observations
1. **STP (`src/providers/stp.js`)**:
   - `BASE_URL`: `'https://sieutamphim.pro'` (line 42).
   - `REFERER_HEADER`: `'https://sieutamphim.pro/'` (line 43), `Origin`: `'https://sieutamphim.pro'` (line 53).
   - `decodeXor0x2a(str, key = 0x2a)` (lines 65–72): Successfully decodes standard XOR 0x2a encoded stream URLs (e.g., `"B^^ZY..."` -> `"https://short.ink/_LboFywW3"`), and cleanly handles null, undefined, numbers, and empty strings by returning `''`.
   - `parsePostContent(html, postTitle)` (lines 107–159): Accurately extracts `name`, `origin_name`, `year`, and parses multiline `episodeGroup` HTML tags with single/double quoted `data-episodes` arrays.
   - Stream label (line 479–487): Produces `[VIP 4 • STP] ${audio.label}${epLabel} (HLS Proxy)\n⚡ Server STP • sieutamphim.pro`.
   - `scoreMatch` is imported from `../lib/utils` (line 36) with zero redeclaration.
   - Strictly `url` only, `externalUrl` is undefined on all stream objects.

2. **CLBPX (`src/providers/clbpx.js`)**:
   - `REFERER_HEADER`: `'https://clbphimxua.info/'` (line 26), `Origin`: `'https://clbphimxua.info'` (line 35).
   - `search(keyword, page)` (lines 57–120): Implements multi-tier fallback (Tier 1: Ophim JSON API -> Tier 2: HTML scrape fallback on `clbphimxua.info` -> Tier 3: safe `[]`).
   - Stream label (line 343–353): Produces `[VIP 5 • CLBPX] Lồng Tiếng Cổ Điển${epLabel} (HLS Proxy)\n⚡ Server CLBPX • clbphimxua.info`.
   - `scoreMatch` imported from `../lib/utils` (line 22). Zero `externalUrl`.

3. **YAN (`src/providers/yan.js`)**:
   - `REFERER_HEADER`: `'https://yanhh3d.pw/'` (line 26), `Origin`: `'https://yanhh3d.pw'` (line 35).
   - `searchYanLive` & `extractYanLiveStreams` (lines 62–137): Live scraping extracts base64 encoded `data-obf.pU` payloads and `master.m3u8` stream URLs from `fbcdn.cloud`/`defifa.com` sources with Ophim JSON API fallback.
   - Stream label (lines 337–344, 456–463): Produces `[VIP 6 • YAN] 4K/FHD Donghua 3D${epLabel} (HLS Proxy)\n⚡ Server YAN • yanhh3d.pw`.
   - `scoreMatch` imported from `../lib/utils` (line 22). Zero `externalUrl`.

4. **HLS Proxy Router (`src/routes/hls.js`)**:
   - `SOURCE_REFERERS` table (lines 27–36):
     ```javascript
     const SOURCE_REFERERS = [
       { pattern: /kkphimplayer|phim1280|phimapi\.com|kkphim/i, referer: 'https://player.phimapi.com/', origin: 'https://player.phimapi.com' },
       { pattern: /vsmov|streamvsmov|p25\.streamvsmov/i,        referer: 'https://vsmov.com/',           origin: 'https://vsmov.com' },
       { pattern: /nguonc\.com/i,                               referer: 'https://phim.nguonc.com/',     origin: 'https://phim.nguonc.com' },
       { pattern: /streamc\.|amass2\.top/i,                     referer: 'https://embed15.streamc.xyz/', origin: 'https://embed15.streamc.xyz' },
       { pattern: /sieutamphim|suutamphim|tvhay/i,              referer: 'https://sieutamphim.pro/',     origin: 'https://sieutamphim.pro' },
       { pattern: /yanhh3d|yan|fbcdn\.cloud|defifa\.com/i,      referer: 'https://yanhh3d.pw/',          origin: 'https://yanhh3d.pw' },
       { pattern: /hh3d|hoathinh3d/i,                           referer: 'https://hh3d.tv/',             origin: 'https://hh3d.tv' },
       { pattern: /clbphimxua|clbpx/i,                          referer: 'https://clbphimxua.info/',     origin: 'https://clbphimxua.info' },
     ];
     ```
   - Ordering places `yanhh3d` before `hh3d`, correctly preventing substring pattern collision.

### 1.2 Test Execution Results
- **Deep Empirical Challenger Test Suite (`tests/challenger_m1_2_deep_empirical.test.js`)**:
  - `95/95` assertions passed (**100% PASS**).
- **Invariant Test Suite (`tests/test_m1_invariants.js`)**:
  - All unit invariants passed (**100% PASS**).
- **Regression Suite 1 (`tests/verify_playback.js`)**:
  - `7/7` phases passed (**100% PASS**).
- **Regression Suite 2 (`tests/verify_hotfix_vsmov_kkphim.js`)**:
  - `27/27` assertions passed (**100% PASS**).
- **Integration Test Suite (`src/test.js`)**:
  - `50/50` assertions passed (**100% PASS**).
- **Syntax Check (`node --check`)**:
  - 0 errors across `src/index.js`, `src/providers/stp.js`, `src/providers/clbpx.js`, `src/providers/yan.js`, `src/routes/hls.js`.

---

## 2. Logic Chain

1. **Premise 1 (Domain Migration & Specification Conformance)**:
   - STP, CLBPX, and YAN have been upgraded to their live domains (`sieutamphim.pro`, `clbphimxua.info`, `yanhh3d.pw`) and matching `Referer`/`Origin` headers.
   - Brand labels match the exact required templates with corresponding server descriptions.
2. **Premise 2 (Stream Extraction Robustness & Fault Isolation)**:
   - STP correctly decodes XOR `0x2a` stream URLs and multiline post content.
   - CLBPX gracefully falls back to HTML card parsing when the JSON API is unreachable or yields no results.
   - YAN successfully extracts live Donghua streams via base64 `data-obf` decoding and `master.m3u8` pattern matching.
   - Simulated network errors (404, 500, timeouts) across all 3 providers cleanly resolve to `[]` or `null` without unhandled rejections or crashing the stream aggregator.
3. **Premise 3 (Strict Invariants & Stremio In-App Player Compatibility)**:
   - All returned streams across STP, CLBPX, and YAN contain valid `url` strings routed through `${proxyBase}/hls/manifest.m3u8` with Base64URL-encoded stream and referer parameters.
   - `externalUrl` is strictly undefined across 100% of stream outputs.
   - No utility functions (like `scoreMatch`) are redeclared; they are imported cleanly from `src/lib/utils.js`.
4. **Premise 4 (HLS Referer Routing & Stream Rewriting)**:
   - The HLS router table correctly assigns upstream referers for `sieutamphim.pro`, `clbphimxua.info`, `yanhh3d.pw`, `fbcdn.cloud`, and `defifa.com`.
   - Pattern ordering avoids substring collisions between `yanhh3d` and `hh3d`.
   - Proxied TS segments verify HTTP 200/206 streaming and valid MPEG-TS sync byte `0x47`.
5. **Conclusion**:
   - The implementation satisfies all Milestone 1 requirements with complete regression safety.

---

## 3. Caveats

- **Upstream Dynamic CDN Expiry**: Upstream streaming links (especially for live YAN Donghua) contain signed expiry timestamps. Because links are dynamically resolved upon user stream request, they remain fresh during playback sessions.
- **No Other Caveats**: All tests pass deterministically.

---

## 4. Conclusion

**Verdict**: **APPROVE**

Milestone 1 satisfies all functional, architectural, invariant, and regression requirements:
- Provider upgrades for STP, CLBPX, and YAN are verified.
- HLS proxy referer routing is accurate and order-safe.
- Zero `externalUrl` invariant is 100% enforced.
- Fault tolerance under upstream failure modes is verified.
- Zero regressions across existing Hotfix v1.5.2 playback and subtitle suites.

---

## 5. Verification Method

To independently reproduce and verify all results:

```bash
# 1. Syntax check across all affected targets
node --check src/index.js
node --check src/providers/stp.js
node --check src/providers/clbpx.js
node --check src/providers/yan.js
node --check src/routes/hls.js

# 2. Run Deep Empirical Adversarial Verification Suite
node tests/challenger_m1_2_deep_empirical.test.js

# 3. Run Milestone 1 Invariants Suite
node tests/test_m1_invariants.js

# 4. Run Existing Regression Suites
node tests/verify_playback.js
node tests/verify_hotfix_vsmov_kkphim.js
node src/test.js
```

### Invalidation Conditions
- Any occurrence of `externalUrl` in stream objects returned by STP, CLBPX, or YAN.
- Any unhandled exception thrown during upstream network 404/500/timeout responses.
- Any failure in the regression suites (`verify_playback.js`, `verify_hotfix_vsmov_kkphim.js`).
