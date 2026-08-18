# Technical Investigation Report: Configurator UI & Handlers Architecture

**Date**: 2026-08-18  
**Subject**: Stremio VIP Movies Addon — Configurator HTML/CSS/JS Implementation & Cyber-Glassmorphism Overhaul Architecture  
**Author**: Explorer Agent (`explorer_handlers_ui_1`)  
**Target Codebase**: `src/handlers.js`, `src/routes/manifest.js`, `src/config.js`, `src/manifest.js`

---

## 1. Executive Summary

This report provides an in-depth architectural and code-level investigation of the VIP Movies Stremio Addon Configurator/Landing Page. It examines the current HTML/CSS/JS generation logic in `src/handlers.js`, route routing in Express, state management, and the concrete engineering steps required to transform the interface into a world-class **Cyber-Glassmorphism** experience adhering to **Taste-Skill Anti-Slop Design Standards**.

### Key Findings:
1. **Single-File Inline HTML Generation**: The entire landing page and configurator dashboard is rendered as an inline template literal in `src/handlers.js` (lines 153–558).
2. **Missing `GET /:config` UI Route**: While `src/routes/manifest.js` handles `/:config/manifest.json` and `src/handlers.js` handles `/:config/catalog`, `/:config/meta`, `/:config/stream`, neither file provides a `GET /:config` HTML handler. Requesting `GET /:config` returns a 404 error instead of loading the configurator with preloaded settings.
3. **Taste-Skill Anti-Slop Upgrade Opportunities**:
   - Palette upgrade to **OLED True Black** (`#0b0d13`) paired with dynamic multi-layer aurora ambient glow (`#6366f1`, `#ec4899`, `#06b6d4`, `#8b5cf6`).
   - Glass surfaces with delicate 1px borders (`rgba(255, 255, 255, 0.08)`), multi-layered backdrop blur (32px+), and inner specular highlights (`inset 0 1px 0 rgba(255, 255, 255, 0.12)`).
   - Brand signature modernization: `VIP Movies Addon v1.5.1 • Designed with Taste by <span class="brand-highlight">Q121101</span>`.
   - Floating action dock enhancement with shimmer light effect on hover and 3 primary actions (Stremio App deep link, Stremio Web, and direct Manifest Copy).
   - Real-time prehydration support for existing user configs.

---

## 2. Codebase Architecture & Route Flow

```
HTTP Request
     │
     ├── GET /hls/* ─────────────────► src/routes/hls.js (HLS & Subtitle Proxy)
     │
     ├── GET /manifest.json ─────────► src/routes/manifest.js (Dynamic Manifest)
     ├── GET /:config/manifest.json ──► src/routes/manifest.js
     │
     ├── GET / ──────────────────────► src/handlers.js (HTML Configurator Dashboard)
     ├── GET /:config ───────────────► [MISSING: Needs route in src/handlers.js]
     ├── GET /catalog/* ─────────────► src/handlers.js (Multi-Provider Catalog Engine)
     ├── GET /meta/* ────────────────► src/handlers.js (Metadata Resolvers & Cinemeta)
     └── GET /stream/* ──────────────► src/handlers.js (Aggregator: VSMOV + KKPhim + NguonC + STP + HH3D + YAN + CLBPX)
```

### Route Handlers Analysis:
- `src/index.js` (lines 64–83):
  ```javascript
  app.use('/hls', hlsRouter);
  app.use('/', manifestRouter);
  app.use('/', handlers);
  ```
- `src/routes/manifest.js` (lines 80–153):
  - `GET /manifest.json` & `GET /manifest`
  - `GET /:config/manifest.json` & `GET /:config/manifest`
  - Middleware `router.use('/:config', (req, res, next) => { ... next(); })`
- `src/handlers.js` (lines 153–558):
  - `router.get('/', (req, res) => { ... })`
  - `router.get('/catalog/:type/:id/:extra.json', handleCatalog)`
  - `router.get('/:config/catalog/:type/:id/:extra.json', handleCatalog)`
  - `router.get('/stream/:type/:id.json', handleStream)`
  - `router.get('/:config/stream/:type/:id.json', handleStream)`

---

## 3. Detailed Component-by-Component Investigation of Current UI

### 3.1 Header, Live Status Indicators & Badges
- **Location**: `src/handlers.js` lines 213–223, 304–316.
- **Current HTML Structure**:
  ```html
  <header class="header">
    <div class="logo-wrap">
      <div class="logo-cinema" aria-hidden="true">🎬</div>
      <div class="logo-text">
        <h1>VIP Movies</h1>
        <div class="tagline">Stremio &amp; Nuvio Addon</div>
      </div>
    </div>
    <div class="live-badge">
      <span class="pulse-dot" aria-hidden="true"></span>
      Hệ thống Trực tuyến &nbsp;·&nbsp; v1.5.1
    </div>
  </header>
  ```
- **Styling**:
  - `.logo-cinema`: 56x56px, linear-gradient `#6366f1` to `#ec4899`, border-radius 16px, drop shadow `0 8px 24px rgba(99,102,241,0.5)`.
  - `.live-badge`: Green badge with `background: rgba(34,197,94,0.1)`, `border: 1px solid rgba(34,197,94,0.22)`, `.pulse-dot` with `@keyframes blink`.
- **Target Overhaul (R2)**:
  - Add glowing neon cinema badge with animated multi-layer radial gradient aura.
  - Update status text to `🟢 Server VIP Core Online · v1.5.1` with smooth breathing dot animation.

---

### 3.2 Quick Action Toolbar & Category Selector
- **Location**: `src/handlers.js` lines 228–234, 318–330.
- **Current HTML Structure**:
  ```html
  <div class="glass-card">
    <div class="section-label">⚡ Thao tác nhanh &amp; Danh mục</div>
    <div class="pill-group" id="action-pills">
      <button class="pill action-pill" onclick="selectAll()">⚡ Bật tất cả</button>
      <button class="pill action-pill danger-pill" onclick="selectNone()">🚫 Tắt tất cả</button>
      <div style="width:1px;background:rgba(255,255,255,0.08);margin:0 4px;height:auto;align-self:stretch;border-radius:1px;"></div>
      <button class="pill" id="cat-movie"  onclick="toggleCat('movie')">🎬 Phim Lẻ</button>
      <button class="pill" id="cat-series" onclick="toggleCat('series')">📺 Phim Bộ</button>
      <button class="pill" id="cat-anime"  onclick="toggleCat('anime')">🐉 Hoạt Hình</button>
      <button class="pill" id="cat-cinema" onclick="toggleCat('cinema')">🍿 Chiếu Rạp</button>
    </div>
  </div>
  ```
- **Target Overhaul (R2)**:
  - Standardize category pill labels: `[⚡ Bật tất cả]`, `[🚫 Tắt tất cả]`, `[🎬 Phim Lẻ]`, `[📺 Phim Bộ]`, `[🍿 Chiếu Rạp]`, `[🐉 Hoạt Hình 3D]`.
  - Implement smooth micro-spring transitions, tactile active glowing borders (`box-shadow: 0 0 16px rgba(99, 102, 241, 0.35)`), and active neon backdrops.

---

### 3.3 Provider Grid & Provider Cards (7 Clusters)
- **Location**: `src/handlers.js` lines 235–264, 331–422.
- **Current Structure**:
  - CSS Grid: `grid-template-columns: repeat(3, 1fr); gap: 12px;`
  - 7 Cards:
    1. `vsmov`: `VSMOV 4K` (vsmov.com — Master 4K Ultra HD & Thuyết Minh, Badges: `Master 4K`, `Thuyết Minh`, `CDN VIP`)
    2. `kkphim`: `KKPhim` (phimapi.com — Đa máy chủ & Kho phim mở rộng, Badges: `Vietsub`, `Full HD`, `IMDb Direct`)
    3. `nguonc`: `NguonC` (phim.nguonc.com — StreamC Vietsub & Thuyết Minh, Badges: `StreamC`, `Thuyết Minh`, `IMDb`)
    4. `stp`: `STP` (suutamphim.org — Âu Mỹ Tuyển Chọn & K-Drama, Badges: `Âu Mỹ Cinema`, `K-Drama`)
    5. `hh3d`: `HH3D` (hoathinh3d — Hoạt Hình 3D Trung Quốc & Tiên Hiệp, Badges: `3D Donghua`, `Tiên Hiệp`)
    6. `yan`: `YAN` (yandonghua — Donghua & Anime Đang Chiếu, Badges: `Donghua Mới`, `Tốc Độ Cao`)
    7. `clbpx`: `CLBPX` (clbphimxua — Kiếm Hiệp Kim Dung & TVB Kinh Điển, Badges: `Kim Dung`, `TVB Hồng Kông`)
  - Switch Component: `.toggle-track` with sliding `::after` toggle dot (`transition: transform 0.22s cubic-bezier(0.34,1.56,0.64,1)`).
- **Target Overhaul (R2)**:
  - Custom aura ambient gradient overlays per provider (`radial-gradient(circle at 20% 20%, ...)`).
  - Tactile micro-interactions on toggle with smooth bouncy toggle switch track.
  - Hover elevation with subtle border illumination.

---

### 3.4 Manifest URL Box & Floating Action Dock
- **Location**: `src/handlers.js` lines 265–287, 424–456.
- **Current HTML Structure**:
  ```html
  <div class="glass-card">
    <div class="section-label">🔗 Link Manifest cá nhân hóa</div>
    <div class="url-box" id="url-box" onclick="copyManifest()" role="button" tabindex="0" title="Bấm để sao chép">
      <div class="url-label">
        <span>Manifest URL</span>
        <span class="url-copy-hint">📋 Bấm để Copy</span>
      </div>
      <div class="url-value" id="manifest-preview">${defaultManifestUrl}</div>
    </div>
  </div>
  ```
  ```html
  <div class="floating-dock">
    <div class="dock-inner">
      <div class="status-bar">
        <div class="status-text">Đang bật: <strong id="provider-count">7 nguồn</strong> &nbsp;·&nbsp; <strong id="category-count">4 danh mục</strong></div>
        <div class="status-indicator"><span class="dot"></span>Config đã cập nhật</div>
      </div>
      <div class="apikey-row">
        <span class="apikey-icon">🔑</span>
        <input class="apikey-input" id="apikey-input" type="password" placeholder="API Key riêng (tùy chọn)" autocomplete="off" spellcheck="false" oninput="updateState()" aria-label="API Key riêng tư" />
      </div>
      <div class="btn-group">
        <a class="btn btn-primary" id="stremio-install-btn" href="${stremioUrl}"><span aria-hidden="true">⚡</span> Cài đặt vào Stremio App</a>
        <a class="btn btn-secondary" id="web-install-btn" href="${webInstallUrl}" target="_blank" rel="noopener noreferrer"><span aria-hidden="true">🌐</span> Mở trên Stremio Web</a>
      </div>
    </div>
  </div>
  ```
- **Target Overhaul (R2)**:
  - Add gradient shimmer light sweep effect on hover for `.btn-primary`.
  - Add 3rd CTA button directly in the floating dock: `📋 Sao chép link Manifest`.
  - Frosted glass container with high-density backdrop blur (`backdrop-filter: blur(28px)`).

---

### 3.5 Brand Signature & Footer
- **Location**: `src/handlers.js` lines 291–293, 435–438.
- **Current HTML**:
  ```html
  <div class="footer">
    VIP Movies Addon v1.5.1 • Powered by <span class="brand-highlight">Q121101</span>
  </div>
  ```
- **Target Requirement (R1, R4)**:
  ```html
  <div class="footer">
    VIP Movies Addon v1.5.1 • Designed with Taste by <span class="brand-highlight">Q121101</span>
  </div>
  ```
  - Maintain the glowing multi-stop gradient signature (`#a855f7` -> `#ec4899` -> `#38bdf8`) with glowing filter drop-shadow and hover micro-interaction.

---

### 3.6 Client-Side Script Logic & State Management
- **Location**: `src/handlers.js` lines 459–555.
- **State Logic**:
  - `_providers`: `Set` containing active provider strings (`vsmov`, `kkphim`, `nguonc`, `stp`, `hh3d`, `yan`, `clbpx`).
  - `_categories`: `Set` containing active category strings (`movie`, `series`, `anime`, `cinema`).
  - `_apiKey`: Custom API key string.
- **Config Encoding**:
  - Base64URL encoding via client-side `btoa` with URL-safe character replacements.
- **Reactive Update `updateState()`**:
  - Encodes state to token.
  - Updates `#manifest-preview`, `#stremio-install-btn`, `#web-install-btn`.
  - Updates counters `#provider-count` and `#category-count`.
  - Syncs `.active` CSS classes across pills and provider cards.
- **Clipboard & Toast**:
  - Modern `navigator.clipboard.writeText` with fallback to `document.execCommand('copy')`.
  - Animated `.toast` notification.

---

## 4. Gap Analysis & Taste-Skill Overhaul Matrix

| Domain | Current State | Required Taste-Skill State | Implementation Strategy |
|---|---|---|---|
| **Base Theme & Palette** | `#07080d` background, basic orbs | OLED True Black `#0b0d13` + Aurora mesh glow (`#6366f1`, `#ec4899`, `#06b6d4`, `#8b5cf6`) | Update CSS variables and aurora gradients |
| **Glassmorphism Spec** | `rgba(255,255,255,0.028)`, 1px border | 1px border `rgba(255, 255, 255, 0.08)`, 32px backdrop blur, specular inner light `inset 0 1px 0 rgba(255,255,255,0.12)`, deep elevation shadow | Overhaul `.glass-card` and `.dock-inner` CSS rules |
| **Route Support** | Only `GET /` | Support `GET /`, `GET /:config`, `GET /configure`, `GET /:config/configure` | Add unified handler in `src/handlers.js` with server-side config prehydration |
| **Prehydration** | Hardcoded initial state in client JS | Server parses `req.params.config` or `req.query.config` and injects initial active sets | Inject `window.__INITIAL_CONFIG__` in HTML template |
| **Pill Toolbar** | Basic pill list | Active neon glow ring, smooth micro-animation, exact labels per R2 | Update HTML pill buttons and CSS `.pill.active` styles |
| **Action Dock** | 2 CTA buttons | 3 CTA buttons (`⚡ Cài đặt Stremio App`, `🌐 Mở Stremio Web`, `📋 Sao chép link`), gradient shimmer effect | Add 3rd button and `@keyframes shimmer` sweep |
| **Brand Signature** | `Powered by Q121101` | `Designed with Taste by <span class="brand-highlight">Q121101</span>` | Update footer HTML |
| **Responsiveness** | Minimal breakpoints (480px, 520px) | Complete mobile (375px+ with iOS safe area), tablet (2-col), desktop (3-col), TV/D-Pad navigation support | Enhanced media queries and focus-visible styling |

---

## 5. Architectural Recommendations for Implementation

### 5.1 Route Consolidation in `src/handlers.js`
Create a helper function `renderConfigurator(req, res)`:
```javascript
function renderConfigurator(req, res) {
  const host     = req.headers['x-forwarded-host'] || req.headers.host || 'localhost:7000';
  const protocol = req.headers['x-forwarded-proto'] || req.protocol || 'http';
  const baseUrl  = `${protocol}://${host}`;
  
  // Resolve initial config from path param, query param, or default
  const configToken = req.params.config || req.query.config || null;
  const config = configToken && isConfigToken(configToken) ? decodeConfig(configToken) : DEFAULT_CONFIG;
  const token = encodeConfig(config);
  
  // ... render HTML with preloaded config state
}

router.get('/', renderConfigurator);
router.get('/configure', renderConfigurator);
router.get('/:config', (req, res, next) => {
  if (isConfigToken(req.params.config)) {
    return renderConfigurator(req, res);
  }
  next();
});
router.get('/:config/configure', renderConfigurator);
```

### 5.2 Client-Side Prehydration
In the HTML `<script>` block:
```html
<script>
  var _initialConfig = ${JSON.stringify(config)};
  var _baseUrl = window.location.origin;
  var _allProvidersList = ['vsmov', 'kkphim', 'nguonc', 'stp', 'hh3d', 'yan', 'clbpx'];
  var _providers = new Set(_initialConfig.providers || _allProvidersList);
  var _categories = new Set(_initialConfig.categories || ['movie', 'series', 'anime', 'cinema']);
  var _apiKey = _initialConfig.apiKey || '';
  // ...
</script>
```

### 5.3 Shimmer Action Button Effect
```css
.btn-primary {
  position: relative;
  overflow: hidden;
  background: linear-gradient(135deg, #6366f1 0%, #a855f7 50%, #ec4899 100%);
}
.btn-primary::after {
  content: '';
  position: absolute;
  top: -50%;
  left: -50%;
  width: 200%;
  height: 200%;
  background: linear-gradient(
    60deg,
    transparent 30%,
    rgba(255, 255, 255, 0.25) 50%,
    transparent 70%
  );
  transform: translateX(-100%) rotate(25deg);
  transition: transform 0.65s ease;
}
.btn-primary:hover::after {
  transform: translateX(100%) rotate(25deg);
}
```

---

## 6. Conclusion

The existing configurator in `src/handlers.js` provides a solid functional baseline (7 providers, 4 category groups, Base64URL encoding). Overhauling it to meet Taste-Skill Anti-Slop standards will involve:
1. Adding server-side `GET /:config` and prehydration support.
2. Elevating visual styling with True OLED Black `#0b0d13`, multi-layered backdrop blur (32px+), and glowing 1px borders.
3. Upgrading the floating action dock with 3 buttons and hover shimmer effects.
4. Modernizing the footer signature to `Designed with Taste by Q121101`.
5. Ensuring 100% responsiveness and zero regressions on existing backend routes (`/manifest.json`, `/catalog/...`, `/stream/...`, `/hls/...`).
