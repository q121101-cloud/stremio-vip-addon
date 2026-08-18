# Forensic Audit Report: Milestone 1 Deliverables (Engine v1.6.0)

**Work Product**: `src/providers/stp.js`, `src/providers/clbpx.js`, `src/providers/yan.js`, `src/routes/hls.js`  
**Auditor**: `teamwork_preview_auditor_m1_1`  
**Profile**: General Project (Development Mode per `ORIGINAL_REQUEST.md`)  
**Verdict**: **`CLEAN`**

---

## 1. Observation

### 1.1 Direct Source Code Inspections & Prohibited Pattern Checks

1. **`src/providers/stp.js`**:
   - **Domains & Headers** (Lines 40–55):
     - `BASE_URL`: `'https://sieutamphim.pro'`
     - `REFERER_HEADER`: `'https://sieutamphim.pro/'`
     - `Origin`: `'https://sieutamphim.pro'`
   - **XOR 0x2a Deobfuscation Algorithm** (Lines 65–72):
     ```javascript
     function decodeXor0x2a(str, key = 0x2a) {
       if (!str || typeof str !== 'string') return '';
       let out = '';
       for (let i = 0; i < str.length; i++) {
         out += String.fromCharCode(str.charCodeAt(i) ^ key);
       }
       return out;
     }
     ```
     - Verified: Genuine bitwise XOR string transformation. No static mock lookups or hardcoded mapping tables. Tested with ciphertext `B^^ZY\x10\x05\x05YBEX^\x04CDA\x05ufHElS]}\x19`, which correctly resolves to `https://short.ink/_LboFywW3`.
   - **HTML & WP-JSON Multiline Parsing** (Lines 107–159):
     - Function `parsePostContent` performs genuine multiline regex extraction on `episodeGroup`, `data-server`, and `data-episodes` JSON arrays, decoding obfuscated stream URLs dynamically.
   - **Canonical Utility Import** (Lines 29–38):
     - Imports `safeExtra`, `safeSlug`, `safeKeyword`, `safePage`, `safeType`, `isSeasonMatch`, `scoreMatch`, `escapeRegExp` from `../lib/utils`. No duplicate local declaration of `scoreMatch` exists.
   - **Stream Labeling & Invariant Compliance** (Lines 478–494):
     - Title format: `[VIP 4 • STP] ${audio.label}${epLabel} (HLS Proxy)\n⚡ Server STP • sieutamphim.pro`
     - All streams provide `url` pointing to `${proxyBase}/hls/manifest.m3u8?url=...&ref=...`.
     - Zero occurrences of `externalUrl` property.

2. **`src/providers/clbpx.js`**:
   - **Domains & Headers** (Lines 24–37):
     - `REFERER_HEADER`: `'https://clbphimxua.info/'`
     - `Origin`: `'https://clbphimxua.info'`
   - **Multi-Tier Search & Stream Extraction** (Lines 57–120, 206–366):
     - Tier 1: Ophim JSON API (`https://phimapi.com/v1/api/tim-kiem`, `/phim/${slug}`)
     - Tier 2: HTML scraping fallback on `https://clbphimxua.info/?s=${keyword}` parsing `halim-thumb` anchor tags.
     - Tier 3: Safe `[]` degradation on errors.
   - **Canonical Utility Import** (Line 22):
     - Imports canonical helpers including `scoreMatch` from `../lib/utils`. No re-declarations.
   - **Stream Labeling & Invariant Compliance** (Lines 343–359):
     - Title format: `[VIP 5 • CLBPX] Lồng Tiếng Cổ Điển${epLabel} (HLS Proxy)\n⚡ Server CLBPX • clbphimxua.info`
     - All streams route exclusively through `${proxyBase}/hls/manifest.m3u8`.
     - Zero occurrences of `externalUrl`.

3. **`src/providers/yan.js`**:
   - **Domains & Headers** (Lines 24–37):
     - `REFERER_HEADER`: `'https://yanhh3d.pw/'`
     - `Origin`: `'https://yanhh3d.pw'`
   - **Multi-Tier Extraction & Obfuscated Token Extraction** (Lines 59–137, 267–476):
     - Tier 1: Direct live DOM search (`/search?keysearch=...`) and episode scraping (`/${slug}/tap-${ep}`), extracting `data-obf.pU` base64 payload and `master.m3u8` from upstream `fbcdn.cloud`/`defifa.com` sources.
     - Tier 2: Ophim JSON fallback (`/v1/api/tim-kiem`, `/phim/${slug}`).
     - Tier 3: Safe `[]` fallback on failure.
   - **Canonical Utility Import** (Line 22):
     - Imports canonical helpers including `scoreMatch` from `../lib/utils`. No re-declarations.
   - **Stream Labeling & Invariant Compliance** (Lines 337–350, 456–469):
     - Title format: `[VIP 6 • YAN] 4K/FHD Donghua 3D${epLabel} (HLS Proxy)\n⚡ Server YAN • yanhh3d.pw`
     - All streams route exclusively through `${proxyBase}/hls/manifest.m3u8`.
     - Zero occurrences of `externalUrl`.

4. **`src/routes/hls.js`**:
   - **SOURCE_REFERERS Routing & Precedence** (Lines 27–36):
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
     - Verified: Precedence order ensures `/yanhh3d|yan|.../` evaluates before `/hh3d|hoathinh3d/`, preventing regex shadowing for YAN streams while retaining HH3D routing.

### 1.2 Test Execution Results

- **Syntax Checks (`node --check`)**:
  - `src/index.js`, `src/providers/stp.js`, `src/providers/clbpx.js`, `src/providers/yan.js`, `src/routes/hls.js`: **0 errors (Exit Code 0)**.
- **`tests/test_m1_invariants.js`**: **100% PASS (STP XOR, parsePostContent, CLBPX, YAN, 11/11 HLS Referer routes)**.
- **`tests/verify_playback.js`**: **7/7 PASS (100%)**.
- **`tests/verify_hotfix_vsmov_kkphim.js`**: **27/27 PASS (100%)**.
- **`src/test.js`**: **50/50 PASS (100%)**.
- **Auditor Verification Script (`audit_verifier.js`)**: **7/7 Checks PASS (100%)**.

---

## 2. Logic Chain

1. **Premise 1 (Absence of Hardcoded/Fake Outputs)**:
   - Dynamic inspection of all 3 provider modules confirmed that all `search`, `getDetail`, `getCatalog`, and `getStreams` methods execute live HTTP requests using `axios` with 5-second timeouts.
   - Decoders (such as `decodeXor0x2a`) and parsers (such as `parsePostContent` and `extractYanLiveStreams`) use mathematical bitwise logic and DOM/regex extractions without hardcoded outputs.
2. **Premise 2 (Zero Backdoor & Invariant Strictness)**:
   - Across all provider files and proxy routers, no `externalUrl` property is constructed or returned.
   - All streams use the standardized `url` pointing to `${proxyBase}/hls/manifest.m3u8?url=...&ref=...`.
3. **Premise 3 (Canonical Import Enforcement)**:
   - `scoreMatch` and all helper functions are imported directly from `src/lib/utils.js`. No shadowed or mocked functions exist in provider scopes.
4. **Premise 4 (HLS Referer Integrity)**:
   - Upstream domains `sieutamphim.pro`, `clbphimxua.info`, and `yanhh3d.pw` are registered with precise referer headers in `SOURCE_REFERERS`.
   - Shadowing between `yanhh3d` and `hh3d` is prevented by proper array ordering.
5. **Conclusion**:
   - The Milestone 1 deliverable satisfies all integrity criteria and contains zero violations.

---

## 3. Caveats

- **External Network Dependency**: Live scraping endpoints rely on third-party upstream availability. The codebase provides multi-tier fallbacks (live -> JSON mirror -> safe empty array `[]`) and strict 5-second timeouts to ensure total fault isolation.
- **No other caveats.**

---

## 4. Conclusion

**Verdict: `CLEAN`**

The work products for Milestone 1 (`src/providers/stp.js`, `src/providers/clbpx.js`, `src/providers/yan.js`, `src/routes/hls.js`) are authentic, robust, conformant with all user constraints, and completely free of integrity violations, backdoors, hardcoding, and facade implementations.

---

## 5. Verification Method

To independently reproduce the forensic audit results:

```bash
# 1. Run syntax verification on all touched targets
node --check src/index.js
node --check src/providers/stp.js
node --check src/providers/clbpx.js
node --check src/providers/yan.js
node --check src/routes/hls.js

# 2. Run auditor independent verification script
node .agents/teamwork_preview_auditor_m1_1/audit_verifier.js

# 3. Run Milestone 1 invariant test suite
node tests/test_m1_invariants.js

# 4. Run zero-regression test suites
node tests/verify_playback.js
node tests/verify_hotfix_vsmov_kkphim.js
node src/test.js
```
