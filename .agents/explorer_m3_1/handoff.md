# Milestone 3 Investigation Report: Version Bump & UI Branding to v1.5.1

## 1. Observation

Direct code inspection of the repository located all occurrences of version strings and UI branding elements:

### 1.1 `package.json`
- **Path**: `/Users/quan/.gemini/antigravity/scratch/stremio-nguonc-addon/package.json`
- **Line 3**: `"version": "1.5.0",`
- **Context**: Root package descriptor for Node.js / npm.

### 1.2 `src/manifest.js`
- **Path**: `/Users/quan/.gemini/antigravity/scratch/stremio-nguonc-addon/src/manifest.js`
- **Line 5**: ` *  VIP Movies Stremio Addon - src/manifest.js  (v1.5.0)`
- **Line 387**: `  version: '1.5.0',` inside `BASE_MANIFEST` object.
- **Context**: The `version` property is exported via `BASE_MANIFEST` and served to Stremio clients when requesting `/manifest.json` and `/:config/manifest.json`.

### 1.3 `src/handlers.js` (UI Configurator Dashboard & Route Handlers)
- **Path**: `/Users/quan/.gemini/antigravity/scratch/stremio-nguonc-addon/src/handlers.js`
- **Line 5**: ` *  VIP Movies Addon — src/handlers.js  (Engine v1.5.0)`
- **Line 314**:
  ```html
        <div class="live-badge">
          <span class="pulse-dot" aria-hidden="true"></span>
          Hệ thống Trực tuyến &nbsp;·&nbsp; v1.5.0
        </div>
  ```
- **Line 436**:
  ```html
      <div class="footer">
        VIP Movies Addon v1.5.0 &bull; Powered by <span class="brand-highlight">Q121101</span>
      </div>
  ```
- **Styling Preservation**:
  - The Cyber-Glassmorphism CSS design system is defined in lines 174–295 of `src/handlers.js`:
    - `.aurora` / `.orb` (lines 206–211): Glowing floating blur orbs.
    - `.glass-card` (line 224): Translucent card with `backdrop-filter: blur(28px)`.
    - `.brand-highlight` (lines 292–293):
      ```css
      .brand-highlight { font-weight:800;background:linear-gradient(135deg,#a855f7 0%,#ec4899 50%,#38bdf8 100%);-webkit-background-clip:text;-webkit-text-fill-color:transparent;filter:drop-shadow(0 0 8px rgba(236,72,153,0.6));letter-spacing:0.5px;padding:0 2px;display:inline-block;transition:all 0.3s ease; }
      .brand-highlight:hover { filter:drop-shadow(0 0 14px rgba(56,189,248,0.8));transform:scale(1.06); }
      ```
    - `.pulse-dot` (lines 222–223): Animated green blinking status light.

### 1.4 `src/index.js` (Server Entry & Startup Banner)
- **Path**: `/Users/quan/.gemini/antigravity/scratch/stremio-nguonc-addon/src/index.js`
- **Line 5**: ` *  VIP Movies Stremio Addon — src/index.js  (Engine v1.5.0)`
- **Line 105**:
  ```javascript
      console.log('╔══════════════════════════════════════════════════════╗');
      console.log('║      🎬  VIP Movies Stremio Addon  Engine v1.5.0     ║');
      console.log('╠══════════════════════════════════════════════════════╣');
  ```

### 1.5 Supporting Module Headers
- `src/config.js:5`: `* VIP Movies Stremio Addon - src/config.js (v1.5.0)`
- `src/routes/hls.js:5`: `* VIP Movies Addon — src/routes/hls.js (Engine v1.5.0)`
- `src/providers/vsmov.js:5`: `* VIP Movies Addon — src/providers/vsmov.js (Engine v1.5.0)`
- `src/providers/yan.js:5`: `* VIP Movies Addon — src/providers/yan.js (Engine v1.5.0)`
- `src/providers/clbpx.js:5`: `* VIP Movies Addon — src/providers/clbpx.js (Engine v1.5.0)`
- `src/providers/stp.js:5`: `* VIP Movies Addon — src/providers/stp.js (Engine v1.5.0)`
- `src/providers/hh3d.js:5`: `* VIP Movies Addon — src/providers/hh3d.js (Engine v1.5.0)`

### 1.6 Existing Test Suites Asserting Version Strings
- `tests/e2e.test.js:253`: `runner.assertEqual(manRes.data.version, '1.5.0', 'Manifest version is 1.5.0');`
- `tests/e2e.test.js:297`: `runner.assertEqual(healthRes.data.version, '1.5.0', 'Health version is 1.5.0');`
- `tests/e2e.test.js:312`: `runner.assertIncludes(uiRes.data, 'VIP Movies Addon v1.5.0', 'UI contains version "1.5.0" in footer');`
- `tests/m3_verification.test.js:204`: `assert.strictEqual(packageJson.version, '1.5.0');`
- `tests/m3_verification.test.js:208`: `assert.strictEqual(MANIFEST.version, '1.5.0');`
- `tests/m3_challenger1_empirical.test.js:449-477`: Asserts `1.5.0` on packageJson, MANIFEST, UI string, and /health.
- `tests/empiric_playback_challenger_m1_m4.test.js:92`: Asserts `1.5.0` on manifest.
- `tests/adversarial_reviewer2_comprehensive.js:335-336`: Asserts `1.5.0` on package.json & manifest.js.

---

## 2. Logic Chain

1. **R4 Alignment**: Milestone 3 requires bumping the project version to `1.5.1` across the core manifests, config files, startup banners, and UI landing pages while preserving the Cyber-Glassmorphism UI layout and glowing brand footer (`VIP Movies Addon v1.5.1 • Powered by <span class="brand-highlight">Q121101</span>` or `&bull;`).
2. **Consistency Across Consumers**:
   - `BASE_MANIFEST.version` in `src/manifest.js` directly sets `res.json().version` on `/manifest.json`, `/:config/manifest.json`, and `/health`.
   - `package.json` represents the npm module version.
   - `src/handlers.js` renders the HTML landing page on `GET /` displaying the version in both the `.live-badge` (header) and `.footer`.
   - `src/index.js` prints the startup CLI banner to stdout.
3. **Preserving UI Structure**:
   - In `src/handlers.js:314`, only the version string `v1.5.0` is changed to `v1.5.1`.
   - In `src/handlers.js:436`, `v1.5.0` is changed to `v1.5.1`, retaining `&bull; Powered by <span class="brand-highlight">Q121101</span>`.
   - No CSS rules or HTML structure are altered.
4. **Test Suite Alignment**:
   - Existing test files that asserted hardcoded `'1.5.0'` should be updated to `'1.5.1'` so that all comprehensive test suites (`tests/e2e.test.js`, `tests/m3_verification.test.js`, etc.) pass with 100% assertions.

---

## 3. Caveats

- **Test Suite Updates**: Existing regression tests in `tests/` check for exact version equality (`'1.5.0'`). When the Worker bumps the source code to `'1.5.1'`, these test assertions must also be updated to `'1.5.1'` to prevent false negative test failures.
- **Dynamic Manifests**: `src/routes/manifest.js` dynamically builds manifests using `buildManifest` from `src/manifest.js`. No changes to `src/routes/manifest.js` logic are needed since it automatically inherits `BASE_MANIFEST.version`.
- **Health Endpoint**: `GET /health` returns `version: MANIFEST.version`, so updating `src/manifest.js` automatically propagates the new version to `/health`.

---

## 4. Conclusion & Worker Instructions

The Worker should apply the following modifications:

### Step 1: Update `package.json`
```diff
--- a/package.json
+++ b/package.json
@@ -3,1 +3,1 @@
-  "version": "1.5.0",
+  "version": "1.5.1",
```

### Step 2: Update `src/manifest.js`
```diff
--- a/src/manifest.js
+++ b/src/manifest.js
@@ -5,1 +5,1 @@
- *  VIP Movies Stremio Addon - src/manifest.js  (v1.5.0)
+ *  VIP Movies Stremio Addon - src/manifest.js  (v1.5.1)
@@ -387,1 +387,1 @@
-  version: '1.5.0',
+  version: '1.5.1',
```

### Step 3: Update `src/handlers.js`
```diff
--- a/src/handlers.js
+++ b/src/handlers.js
@@ -5,1 +5,1 @@
- *  VIP Movies Addon — src/handlers.js  (Engine v1.5.0)
+ *  VIP Movies Addon — src/handlers.js  (Engine v1.5.1)
@@ -314,1 +314,1 @@
-        Hệ thống Trực tuyến &nbsp;·&nbsp; v1.5.0
+        Hệ thống Trực tuyến &nbsp;·&nbsp; v1.5.1
@@ -436,1 +436,1 @@
-      VIP Movies Addon v1.5.0 &bull; Powered by <span class="brand-highlight">Q121101</span>
+      VIP Movies Addon v1.5.1 &bull; Powered by <span class="brand-highlight">Q121101</span>
```

### Step 4: Update `src/index.js`
```diff
--- a/src/index.js
+++ b/src/index.js
@@ -5,1 +5,1 @@
- *  VIP Movies Stremio Addon — src/index.js  (Engine v1.5.0)
+ *  VIP Movies Stremio Addon — src/index.js  (Engine v1.5.1)
@@ -105,1 +105,1 @@
-    console.log('║      🎬  VIP Movies Stremio Addon  Engine v1.5.0     ║');
+    console.log('║      🎬  VIP Movies Stremio Addon  Engine v1.5.1     ║');
```

### Step 5: Update Supporting Headers (Optional but recommended)
- `src/config.js:5`: `(v1.5.1)`
- `src/routes/hls.js:5`: `(Engine v1.5.1)`
- `src/providers/vsmov.js:5`: `(Engine v1.5.1)`
- `src/providers/yan.js:5`: `(Engine v1.5.1)`
- `src/providers/clbpx.js:5`: `(Engine v1.5.1)`
- `src/providers/stp.js:5`: `(Engine v1.5.1)`
- `src/providers/hh3d.js:5`: `(Engine v1.5.1)`

### Step 6: Update Version Assertions in Test Files
- `tests/e2e.test.js`: lines 5, 23, 28, 253, 297, 312 (`1.5.0` -> `1.5.1`)
- `tests/m3_verification.test.js`: lines 203–208 (`1.5.0` -> `1.5.1`)
- `tests/m3_challenger1_empirical.test.js`: lines 449, 450, 463, 477 (`1.5.0` -> `1.5.1`)
- `tests/empiric_playback_challenger_m1_m4.test.js`: lines 6, 92 (`1.5.0` -> `1.5.1`)
- `tests/adversarial_reviewer2_comprehensive.js`: lines 6, 61, 335, 336 (`1.5.0` -> `1.5.1`)

---

## 5. Verification Method

To independently verify the changes once applied:

1. **Syntax Check**:
   ```bash
   node --check src/index.js && node --check src/handlers.js && node --check src/manifest.js
   ```
2. **Verify Version Property via Node**:
   ```bash
   node -e "const pkg = require('./package.json'); const { MANIFEST } = require('./src/manifest'); console.log('pkg:', pkg.version, 'manifest:', MANIFEST.version); if (pkg.version !== '1.5.1' || MANIFEST.version !== '1.5.1') process.exit(1);"
   ```
3. **Verify UI Branding Strings via Express Execution**:
   ```bash
   node -e "const handlers = require('./src/handlers'); const express = require('express'); const app = express(); app.use('/', handlers); const s = app.listen(0, async () => { const axios = require('axios'); const res = await axios.get('http://127.0.0.1:' + s.address().port); s.close(); const html = res.data; if (!html.includes('VIP Movies Addon v1.5.1') || !html.includes('<span class=\"brand-highlight\">Q121101</span>')) { console.error('Branding check failed'); process.exit(1); } console.log('✅ UI Branding Verified Successfully'); });"
   ```
4. **Execute Core E2E Suite**:
   ```bash
   node tests/verify_vsmov_sub_audio.js
   ```
