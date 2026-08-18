# Challenger 1 Verification & Adversarial Report: Milestone 1

**Reviewer**: Challenger 1 (`teamwork_preview_challenger_m1_1`)  
**Verdict**: **`APPROVE`**  
**Date**: 2026-08-18T11:54:00+07:00  
**Scope**: Provider Upgrades (`src/providers/stp.js`, `src/providers/clbpx.js`, `src/providers/yan.js`) & HLS Proxy Routing (`src/routes/hls.js`)

---

## 1. Observation

Direct empirical evidence obtained by executing tests, inspecting code, and running live test servers:

### 1.1 Source Code and Invariants Verification
1. **`src/providers/stp.js`**:
   - `BASE_URL`: `'https://sieutamphim.pro'` (Line 42)
   - `REFERER_HEADER`: `'https://sieutamphim.pro/'` (Line 43)
   - `Origin`: `'https://sieutamphim.pro'` (Line 53)
   - Stream Labeling: `[VIP 4 • STP] ${audio.label}${epLabel} (HLS Proxy)\n⚡ Server STP • sieutamphim.pro` (Lines 479, 487)
   - `name`: `'VIP Movies 🎬'` (Line 486)
   - `url`: `${proxyBase || ''}/hls/manifest.m3u8?url=${encodeBase64(rawStreamUrl)}&ref=${b64Ref}` (Line 482)
   - `externalUrl`: strictly omitted / undefined across the file (0 matches).
   - `scoreMatch`: imported from `../lib/utils` (Line 36), zero duplicate function definitions.
   - Obfuscation Decoder: `decodeXor0x2a` (Lines 65–72) accurately decodes XOR `0x2a` string payloads into valid `.m3u8` or embed URLs.

2. **`src/providers/clbpx.js`**:
   - `REFERER_HEADER`: `'https://clbphimxua.info/'` (Line 26)
   - `Origin`: `'https://clbphimxua.info'` (Line 35)
   - Stream Labeling: `[VIP 5 • CLBPX] ${isTM ? 'Thuyết Minh' : 'Lồng Tiếng'} Cổ Điển${epLabel} (HLS Proxy)\n⚡ Server CLBPX • clbphimxua.info` (Lines 344–353)
   - `name`: `'VIP Movies 🎬'` (Line 351)
   - `url`: `${proxyBase || ''}/hls/manifest.m3u8?url=${encodeBase64(targetEp.link_m3u8)}&ref=${b64Ref}` (Line 347)
   - `externalUrl`: strictly omitted / undefined (0 matches).
   - `scoreMatch`: imported from `../lib/utils` (Line 22).

3. **`src/providers/yan.js`**:
   - `REFERER_HEADER`: `'https://yanhh3d.pw/'` (Line 26)
   - `Origin`: `'https://yanhh3d.pw'` (Line 36)
   - Stream Labeling: `[VIP 6 • YAN] 4K/FHD Donghua 3D${epLabel} (HLS Proxy)\n⚡ Server YAN • yanhh3d.pw` (Lines 456, 462)
   - `name`: `'VIP Movies 🎬'` (Line 461)
   - `url`: `${proxyBase || ''}/hls/manifest.m3u8?url=${encodeBase64(targetEp.link_m3u8)}&ref=${b64Ref}` (Line 457)
   - `externalUrl`: strictly omitted / undefined (0 matches).
   - `scoreMatch`: imported from `../lib/utils` (Line 22).

4. **`src/routes/hls.js` (HLS Proxy Referer Table)**:
   - `SOURCE_REFERERS` entries:
     ```javascript
     { pattern: /kkphimplayer|phim1280|phimapi\.com|kkphim/i, referer: 'https://player.phimapi.com/', origin: 'https://player.phimapi.com' },
     { pattern: /vsmov|streamvsmov|p25\.streamvsmov/i,        referer: 'https://vsmov.com/',           origin: 'https://vsmov.com' },
     { pattern: /nguonc\.com/i,                               referer: 'https://phim.nguonc.com/',     origin: 'https://phim.nguonc.com' },
     { pattern: /streamc\.|amass2\.top/i,                     referer: 'https://embed15.streamc.xyz/', origin: 'https://embed15.streamc.xyz' },
     { pattern: /sieutamphim|suutamphim|tvhay/i,              referer: 'https://sieutamphim.pro/',     origin: 'https://sieutamphim.pro' },
     { pattern: /yanhh3d|yan|fbcdn\.cloud|defifa\.com/i,      referer: 'https://yanhh3d.pw/',          origin: 'https://yanhh3d.pw' },
     { pattern: /hh3d|hoathinh3d/i,                           referer: 'https://hh3d.tv/',             origin: 'https://hh3d.tv' },
     { pattern: /clbphimxua|clbpx/i,                          referer: 'https://clbphimxua.info/',     origin: 'https://clbphimxua.info' },
     ```
   - Pattern ordering puts `yanhh3d|yan|fbcdn\.cloud|defifa\.com` ahead of `hh3d|hoathinh3d`, eliminating substring collision between `yanhh3d` and `hh3d`.

### 1.2 Empirical Test Execution Outputs
- **Syntax Check (`node --check`)**:
  - `src/index.js`, `src/handlers.js`, `src/manifest.js`, `src/routes/hls.js`, `src/providers/stp.js`, `src/providers/clbpx.js`, `src/providers/yan.js`: **0 syntax errors**.
- **Adversarial Stress Harness (`tests/challenger_m1_1_empirical_adversarial.js`)**:
  - Referer Resolution & Zero Collision: **24/24 PASS**
  - STP Stress & Invariant Tests: **6/6 PASS** (empty query, special chars `<script>`, XOR decoding, live query `John Wick`)
  - CLBPX Stress & Invariant Tests: **4/4 PASS** (empty query, SQL injection attempt, live query `Tay Du Ky` Ep 1)
  - YAN Stress & Invariant Tests: **4/4 PASS** (empty query, XSS strings, live query `The Gioi Hoan My` Ep 282)
  - Addon Server Lifecycle & Aggregator: **6/6 PASS** (`/manifest.json`, stream aggregator for movie & series, missing param 400 guards)
  - Total: **44/44 PASS (100%)**
- **Regression Suite 1 (`tests/verify_playback.js`)**:
  - **7/7 PASS (100%)** — VSMOV multi-audio separation, subtitle proxy, KKPhim anti-404, M3U8 rewriting, real TS segment download (`7.44 MB`, sync byte `0x47`), HTTP Range 206 partial content.
- **Regression Suite 2 (`tests/verify_hotfix_vsmov_kkphim.js`)**:
  - **27/27 PASS (100%)** — Subtitle endpoints, KKPhim smart search fallback, KKPhim series episode matching, M3U8 subtitle injection, TS segment binary download.
- **Addon Integration Suite (`src/test.js`)**:
  - **50/50 PASS (100%)** — Manifest, catalogs, meta, streams, health check.

---

## 2. Logic Chain

1. **Step 1 (Interface and Contract Conformance)**:
   - The original specification mandates that STP, CLBPX, and YAN providers operate on updated domains (`sieutamphim.pro`, `clbphimxua.info`, `yanhh3d.pw`) with proper `Referer` and `Origin` headers.
   - Inspection of `stp.js`, `clbpx.js`, and `yan.js` verifies that all target domains, headers, and stream labels match the required branding exactly.
2. **Step 2 (In-App Stremio Invariant Preservation)**:
   - For in-app Stremio playback, `externalUrl` must be absent and `url` must point to `${proxyBase}/hls/manifest.m3u8`.
   - In all stress tests (live queries for "John Wick", "Tay Du Ky", "The Gioi Hoan My"), `externalUrl` was verified strictly `undefined` and `url` strictly used the HLS Proxy route.
3. **Step 3 (Adversarial Collision & Robustness Testing)**:
   - Because regex matching against URL strings can suffer from collision (specifically `yanhh3d` containing `hh3d`), `SOURCE_REFERERS` was subjected to adversarial test vectors for both YAN CDNs (`fbcdn.cloud`, `defifa.com`, `yanhh3d.pw`) and HH3D CDNs (`hh3d.tv`, `hoathinh3d.com`).
   - Every domain resolved to its correct referer and origin with zero collision.
4. **Step 4 (Fault Isolation & Graceful Degradation)**:
   - Injected adversarial inputs (empty keywords, null IDs, negative episode numbers, malformed HTML, non-existent titles) all degraded gracefully into empty arrays `[]` or HTTP 200 `{ streams: [] }` without unhandled rejections or server crashes.
5. **Step 5 (Zero Regression)**:
   - All pre-existing test suites for VSMOV, KKPhim, NguonC, and HLS proxying continue to pass at 100% success rate.
6. **Conclusion**:
   - Milestone 1 implementation is completely verified, robust against edge cases, and ready for integration.

---

## 3. Caveats

- **External Upstream Uptime**: Providers rely on third-party live servers (`sieutamphim.pro`, `clbphimxua.info`, `yanhh3d.pw`). If an upstream server experiences downtime, the provider safely falls back to secondary tiers (PhimAPI mirrors) or gracefully returns `[]` within 5000ms.
- **Dynamic CDN Tokens**: YAN live streams include time-limited tokens (`?t=...`). Since URLs are generated on-the-fly per Stremio stream request, playback works seamlessly.
- **No other caveats**: Code is clean, modular, and adheres to all project rules.

---

## 4. Conclusion

**Verdict: `APPROVE`**

Milestone 1 satisfies all requirements:
1. Updated domains and request headers for STP (`sieutamphim.pro`), CLBPX (`clbphimxua.info`), and YAN (`yanhh3d.pw`).
2. Multi-tier stream extraction with resilient fallback and XOR `0x2a` decoding.
3. Strict invariants enforced (`url` only, zero `externalUrl`, `scoreMatch` imported from `src/lib/utils.js`).
4. HLS Proxy Referer routing updated with zero collision.
5. 100% pass across all empirical stress and regression test suites.

---

## 5. Verification Method

To independently reproduce the verification results:

```bash
# 1. Syntax Check
node --check src/index.js
node --check src/providers/stp.js
node --check src/providers/clbpx.js
node --check src/providers/yan.js
node --check src/routes/hls.js

# 2. Challenger Empirical Adversarial Stress Suite (44 assertions)
node tests/challenger_m1_1_empirical_adversarial.js

# 3. Provider Invariant & Referer Unit Suite
node tests/test_m1_invariants.js

# 4. Hotfix & Playback Regression Test Suites
node tests/verify_playback.js
node tests/verify_hotfix_vsmov_kkphim.js

# 5. Core Integration Suite (50 assertions)
node src/test.js
```
