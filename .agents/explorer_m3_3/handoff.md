# Milestone 3 Handoff Report: Version Bump & UI Branding to v1.5.1

**Agent ID**: `explorer_m3_3`  
**Milestone**: Milestone 3 (Version Bump & UI Branding)  
**Target Version**: `1.5.1`  
**Date**: 2026-08-18  

---

## 1. Observations

### 1.1 `package.json`
- **File path**: `/Users/quan/.gemini/antigravity/scratch/stremio-nguonc-addon/package.json`
- **Current content (Lines 1-6)**:
  ```json
  1: {
  2:   "name": "stremio-nguonc-addon",
  3:   "version": "1.5.0",
  4:   "description": "Stremio Addon for NguonC - Xem phim Vietsub, thuyết minh từ phim.nguonc.com",
  5:   "main": "src/index.js",
  ```
- **Observation**: Line 3 contains `"version": "1.5.0"`. It needs to be updated to `"version": "1.5.1"`.

---

### 1.2 `package-lock.json`
- **File path**: `/Users/quan/.gemini/antigravity/scratch/stremio-nguonc-addon/package-lock.json`
- **Current content (Lines 1-11)**:
  ```json
  1: {
  2:   "name": "stremio-nguonc-addon",
  3:   "version": "1.0.0",
  4:   "lockfileVersion": 3,
  5:   "requires": true,
  6:   "packages": {
  7:     "": {
  8:       "name": "stremio-nguonc-addon",
  9:       "version": "1.0.0",
  10:       "license": "MIT",
  ```
- **Observation**: Lines 3 and 9 contain the project version field `"version": "1.0.0"`. Updating both to `"1.5.1"` aligns npm lockfile metadata with `package.json`.

---

### 1.3 `src/manifest.js`
- **File path**: `/Users/quan/.gemini/antigravity/scratch/stremio-nguonc-addon/src/manifest.js`
- **Header comment (Lines 3-8)**:
  ```javascript
  3: /**
  4:  * ============================================================
  5:  *  VIP Movies Stremio Addon - src/manifest.js  (v1.5.0)
  6:  *  Định nghĩa manifest của addon theo chuẩn Stremio / Nuvio
  7:  *  Hỗ trợ Dynamic Manifest theo config token & đa nguồn (NguonC, KKPhim, VsMov)
  8:  * ============================================================
  ```
- **Base Manifest Definition (Lines 385-392)**:
  ```javascript
  385: const BASE_MANIFEST = {
  386:   id: 'org.vipmovies.stremio.addon',
  387:   version: '1.5.0',
  388:   name: 'VIP Movies 🎬',
  389:   description:
  390:     'Xem phim Vietsub, thuyết minh chất lượng cao từ Server VIP trực tiếp trên Stremio & Nuvio. Hỗ trợ VSMOV 4K, KKPhim, NguonC, STP, HH3D, YAN, CLBPX & IMDb. Cấu hình 22 Catalog K20 chuẩn quốc tế.',
  391:   logo: 'https://i.imgur.com/3C9XQFP.png',
  ```
- **Observation**: Line 387 contains `version: '1.5.0'`. This is the authoritative manifest version served to Stremio clients and consumed by `src/handlers.js` in the `/health` endpoint (`src/handlers.js:997`).

---

### 1.4 `src/handlers.js`
- **File path**: `/Users/quan/.gemini/antigravity/scratch/stremio-nguonc-addon/src/handlers.js`
- **Header comment (Line 5)**:
  ```javascript
  5:  *  VIP Movies Addon — src/handlers.js  (Engine v1.5.0)
  ```
- **Live Badge in Configurator Header (Lines 312-316)**:
  ```html
  312:       <div class="live-badge">
  313:         <span class="pulse-dot" aria-hidden="true"></span>
  314:         Hệ thống Trực tuyến &nbsp;·&nbsp; v1.5.0
  315:       </div>
  ```
- **Cyber-Glassmorphism Brand Signature in Footer (Lines 435-437)**:
  ```html
  435:     <div class="footer">
  436:       VIP Movies Addon v1.5.0 &bull; Powered by <span class="brand-highlight">Q121101</span>
  437:     </div>
  ```
- **Health Check Route (Lines 992-998)**:
  ```javascript
  992: router.get('/health', (req, res) => {
  993:   const stats = api.getCacheStats();
  994:   const { imdbCache: ic, m3u8Cache: mc, catalogCache: cc, detailCache: dc } = require('./lib/cache');
  995:   sendJSON(res, {
  996:     status: 'ok',
  997:     version: MANIFEST.version,
  ```
- **Observation**:
  1. Line 314 displays `v1.5.0` in the live badge, which must be updated to `v1.5.1`.
  2. Line 436 displays `VIP Movies Addon v1.5.0 &bull; Powered by <span class="brand-highlight">Q121101</span>`, which must be updated to `VIP Movies Addon v1.5.1 &bull; Powered by <span class="brand-highlight">Q121101</span>` while strictly preserving the glowing signature `<span class="brand-highlight">Q121101</span>`.
  3. The health check route (`router.get('/health')`) reads `MANIFEST.version` dynamically, automatically propagating `1.5.1`.

---

### 1.5 `src/index.js`
- **File path**: `/Users/quan/.gemini/antigravity/scratch/stremio-nguonc-addon/src/index.js`
- **Header comment (Line 5)**:
  ```javascript
  5:  *  VIP Movies Stremio Addon — src/index.js  (Engine v1.5.0)
  ```
- **Startup Console Banner (Lines 103-107)**:
  ```javascript
  103:     console.log('');
  104:     console.log('╔══════════════════════════════════════════════════════╗');
  105:     console.log('║      🎬  VIP Movies Stremio Addon  Engine v1.5.0     ║');
  106:     console.log('╠══════════════════════════════════════════════════════╣');
  ```
- **Observation**: Line 105 contains the startup log banner string `'║      🎬  VIP Movies Stremio Addon  Engine v1.5.0     ║'`. Updating this to `v1.5.1` ensures console outputs reflect the hotfix version.

---

### 1.6 Additional Module Headers
- **`src/config.js:5`**: `*  VIP Movies Stremio Addon - src/config.js  (v1.5.0)`
- **`src/routes/hls.js:5`**: `*  VIP Movies Addon — src/routes/hls.js (Engine v1.5.0)`
- **`src/providers/vsmov.js:5`**: `*  VIP Movies Addon — src/providers/vsmov.js (Engine v1.5.0)`
- **`src/providers/stp.js:5`**: `*  VIP Movies Addon — src/providers/stp.js (Engine v1.5.0)`
- **`src/providers/hh3d.js:5`**: `*  VIP Movies Addon — src/providers/hh3d.js (Engine v1.5.0)`
- **`src/providers/yan.js:5`**: `*  VIP Movies Addon — src/providers/yan.js (Engine v1.5.0)`
- **`src/providers/clbpx.js:5`**: `*  VIP Movies Addon — src/providers/clbpx.js (Engine v1.5.0)`

---

## 2. Logic Chain

1. **Step 1 (Scope Definition & Contract)**:
   - Milestone 3 requires updating all version references from `1.5.0` to `1.5.1` across manifest, package metadata, server entry point, and landing page UI, while preserving the exact branding string: `VIP Movies Addon v1.5.1 • Powered by <span class="brand-highlight">Q121101</span>`.
2. **Step 2 (Runtime Impact Analysis)**:
   - Updating `BASE_MANIFEST.version` in `src/manifest.js:387` automatically updates:
     - `/manifest.json` response `data.version`
     - Dynamic manifests (e.g. `/:config/manifest.json`)
     - `/health` endpoint response `data.version` (`src/handlers.js:997`)
3. **Step 3 (UI & Client Experience Analysis)**:
   - Updating `src/handlers.js:314` and `src/handlers.js:436` updates the live badge and glowing footer on the web configurator without touching any CSS classes, gradients, or scripts.
4. **Step 4 (Test Impact Analysis)**:
   - The primary test suite `tests/verify_vsmov_sub_audio.js` was executed and passed with 60/60 assertions (100%). It has no hardcoded dependency on version `1.5.0`.
   - Legacy tests created in previous development cycles that assert `'1.5.0'` should be updated to `'1.5.1'` to maintain clean test runs across the whole test harness.

---

## 3. Caveats

1. **Legacy Test Hardcoding**: Older test files (e.g., `tests/e2e.test.js:253, 297, 312`, `tests/m3_challenger1_empirical.test.js:449, 450, 477`) contain hardcoded checks for literal string `'1.5.0'`. Updating those test files to `'1.5.1'` is recommended for complete harness clean passes in Milestone 4.
2. **Git Deployment**: Per §R4, final git commit and push (`git push origin main`) will be handled in Milestone 4.

---

## 4. Conclusion & Concrete Recommendations for Worker

The Worker should apply the following precise replacement chunks:

### Replacement Chunk 1: `package.json`
**Target File**: `/Users/quan/.gemini/antigravity/scratch/stremio-nguonc-addon/package.json`  
**Lines**: 2-4  
**TargetContent**:
```json
  "name": "stremio-nguonc-addon",
  "version": "1.5.0",
  "description": "Stremio Addon for NguonC - Xem phim Vietsub, thuyết minh từ phim.nguonc.com",
```
**ReplacementContent**:
```json
  "name": "stremio-nguonc-addon",
  "version": "1.5.1",
  "description": "Stremio Addon for NguonC - Xem phim Vietsub, thuyết minh từ phim.nguonc.com",
```

---

### Replacement Chunk 2: `package-lock.json`
**Target File**: `/Users/quan/.gemini/antigravity/scratch/stremio-nguonc-addon/package-lock.json`  
**Chunk 2a (Lines 2-4)**:
```json
  "name": "stremio-nguonc-addon",
  "version": "1.0.0",
  "lockfileVersion": 3,
```
->
```json
  "name": "stremio-nguonc-addon",
  "version": "1.5.1",
  "lockfileVersion": 3,
```

**Chunk 2b (Lines 7-10)**:
```json
    "": {
      "name": "stremio-nguonc-addon",
      "version": "1.0.0",
      "license": "MIT",
```
->
```json
    "": {
      "name": "stremio-nguonc-addon",
      "version": "1.5.1",
      "license": "MIT",
```

---

### Replacement Chunk 3: `src/manifest.js`
**Target File**: `/Users/quan/.gemini/antigravity/scratch/stremio-nguonc-addon/src/manifest.js`  
**Chunk 3a (Lines 4-6)**:
```javascript
 * ============================================================
 *  VIP Movies Stremio Addon - src/manifest.js  (v1.5.0)
 *  Định nghĩa manifest của addon theo chuẩn Stremio / Nuvio
```
->
```javascript
 * ============================================================
 *  VIP Movies Stremio Addon - src/manifest.js  (v1.5.1)
 *  Định nghĩa manifest của addon theo chuẩn Stremio / Nuvio
```

**Chunk 3b (Lines 385-388)**:
```javascript
const BASE_MANIFEST = {
  id: 'org.vipmovies.stremio.addon',
  version: '1.5.0',
  name: 'VIP Movies 🎬',
```
->
```javascript
const BASE_MANIFEST = {
  id: 'org.vipmovies.stremio.addon',
  version: '1.5.1',
  name: 'VIP Movies 🎬',
```

---

### Replacement Chunk 4: `src/handlers.js`
**Target File**: `/Users/quan/.gemini/antigravity/scratch/stremio-nguonc-addon/src/handlers.js`  
**Chunk 4a (Lines 4-6)**:
```javascript
 * ============================================================
 *  VIP Movies Addon — src/handlers.js  (Engine v1.5.0)
 *  Tập trung toàn bộ logic xử lý:
```
->
```javascript
 * ============================================================
 *  VIP Movies Addon — src/handlers.js  (Engine v1.5.1)
 *  Tập trung toàn bộ logic xử lý:
```

**Chunk 4b (Lines 312-316)**:
```html
      <div class="live-badge">
        <span class="pulse-dot" aria-hidden="true"></span>
        Hệ thống Trực tuyến &nbsp;·&nbsp; v1.5.0
      </div>
```
->
```html
      <div class="live-badge">
        <span class="pulse-dot" aria-hidden="true"></span>
        Hệ thống Trực tuyến &nbsp;·&nbsp; v1.5.1
      </div>
```

**Chunk 4c (Lines 435-437)**:
```html
    <div class="footer">
      VIP Movies Addon v1.5.0 &bull; Powered by <span class="brand-highlight">Q121101</span>
    </div>
```
->
```html
    <div class="footer">
      VIP Movies Addon v1.5.1 &bull; Powered by <span class="brand-highlight">Q121101</span>
    </div>
```

---

### Replacement Chunk 5: `src/index.js`
**Target File**: `/Users/quan/.gemini/antigravity/scratch/stremio-nguonc-addon/src/index.js`  
**Chunk 5a (Lines 4-6)**:
```javascript
 * ============================================================
 *  VIP Movies Stremio Addon — src/index.js  (Engine v1.5.0)
 *  Entry point chính của server Express
```
->
```javascript
 * ============================================================
 *  VIP Movies Stremio Addon — src/index.js  (Engine v1.5.1)
 *  Entry point chính của server Express
```

**Chunk 5b (Lines 104-106)**:
```javascript
    console.log('╔══════════════════════════════════════════════════════╗');
    console.log('║      🎬  VIP Movies Stremio Addon  Engine v1.5.0     ║');
    console.log('╠══════════════════════════════════════════════════════╣');
```
->
```javascript
    console.log('╔══════════════════════════════════════════════════════╗');
    console.log('║      🎬  VIP Movies Stremio Addon  Engine v1.5.1     ║');
    console.log('╠══════════════════════════════════════════════════════╣');
```

---

### Optional Cleanups (Header Comments in Provider/Route modules):
- `src/config.js` Line 5: `(v1.5.0)` -> `(v1.5.1)`
- `src/routes/hls.js` Line 5: `(Engine v1.5.0)` -> `(Engine v1.5.1)`
- `src/providers/vsmov.js` Line 5: `(Engine v1.5.0)` -> `(Engine v1.5.1)`
- `src/providers/stp.js` Line 5: `(Engine v1.5.0)` -> `(Engine v1.5.1)`
- `src/providers/hh3d.js` Line 5: `(Engine v1.5.0)` -> `(Engine v1.5.1)`
- `src/providers/yan.js` Line 5: `(Engine v1.5.0)` -> `(Engine v1.5.1)`
- `src/providers/clbpx.js` Line 5: `(Engine v1.5.0)` -> `(Engine v1.5.1)`

---

## 5. Verification Method

To independently verify after implementation:

1. **Syntax Check**:
   ```bash
   node --check src/index.js
   node --check src/manifest.js
   node --check src/handlers.js
   node --check src/config.js
   node --check src/routes/hls.js
   node --check src/routes/manifest.js
   ```
   **Expected**: Exit code 0 for all files.

2. **Run Comprehensive E2E Test Suite**:
   ```bash
   node tests/verify_vsmov_sub_audio.js
   ```
   **Expected**: 60/60 assertions PASS (100%).

3. **Manifest & UI Endpoint Verification**:
   ```bash
   node -e "
     const manifest = require('./src/manifest').MANIFEST;
     const pkg = require('./package.json');
     console.log('Manifest version:', manifest.version);
     console.log('Package version:', pkg.version);
     if (manifest.version !== '1.5.1' || pkg.version !== '1.5.1') {
       throw new Error('Version mismatch!');
     }
     console.log('✅ Version sync verified: 1.5.1');
   "
   ```

4. **Invalidation Conditions**:
   - Any failure in `node --check`.
   - Manifest returning a version other than `1.5.1`.
   - UI landing page missing `<span class="brand-highlight">Q121101</span>` or displaying `v1.5.0`.
