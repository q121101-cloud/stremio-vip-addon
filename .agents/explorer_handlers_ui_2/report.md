# Comprehensive Investigation Report: Configurator UI & Handlers Architecture

**Agent**: `explorer_handlers_ui_2`  
**Date**: 2026-08-18  
**Scope**: `src/handlers.js`, `src/routes/manifest.js`, `src/config.js`, `src/manifest.js`, `src/index.js`, `.skills/taste-skill`  
**Target**: Transform VIP Movies Stremio Addon Landing Page / Configurator into a world-class Cyber-Glassmorphism UI following Taste-Skill Anti-Slop Design Standards.

---

## 1. Executive Summary

This investigation analyzed the frontend HTML/CSS/JS generation and route handling within `src/handlers.js` and associated files (`src/routes/manifest.js`, `src/config.js`, `src/manifest.js`, `src/index.js`). 

### Key Discoveries & Findings:
1. **Routing Gap (`GET /:config` returns 404)**: While `GET /` successfully renders the Configurator HTML (HTTP 200), requests to `GET /:config` (e.g. `GET /eyJwcm92aWRlcnMiOlsidnNtb3YiXX0/`) and `GET /:config/configure` return **HTTP 404 JSON errors**. This happens because `src/routes/manifest.js` only terminates on `/:config/manifest.json` and delegates to `src/handlers.js`, but `handlers.js` only matches `['/', '/configure']` and not `['/', '/configure', '/:config', '/:config/configure']`.
2. **Static Client Hydration Gap**: The HTML generator in `handlers.js` always initializes client state with the hardcoded default 7 providers and 4 categories (`getDefaultToken()`), ignoring any `req.addonConfig` or config token present in the request path/query. When users open a custom configuration URL from Stremio or a saved link, the UI does not pre-populate their saved choices.
3. **Bento Grid Cell Balancing Opportunity**: The current 7-provider grid uses a simple 2-column grid (`repeat(2, 1fr)`), which leaves an unbalanced odd card (the 7th card `CLBPX` occupies only 1 column, creating an empty gap). Under Taste-Skill Bento guidelines (Rule 4.7), featuring the flagship provider **VSMOV 4K (Master 4K + Multi-Server Audio)** as a full-width featured hero tile (`col-span-2` / `grid-column: 1 / -1`) followed by a balanced 2×3 grid (6 cards) creates a rhythmic, visually stunning 1 + 6 = 7 Bento architecture.
4. **Taste-Skill Anti-Slop Compliance**: The design system requirements (OLED `#0b0d13`, 3-orb dynamic ambient aurora glow `#6366f1` / `#ec4899` / `#06b6d4`, frosted glass cards with `backdrop-filter: blur(28px+)`, spring-physics pill switches, glowing brand signature `Designed with Taste by Q121101`, and shimmer floating action dock) are thoroughly defined and ready for clean, maintainable integration.

---

## 2. Codebase Architecture & File Mapping

```
stremio-nguonc-addon/
├── src/
│   ├── index.js          # Entry point, Express setup, router mounting
│   ├── routes/
│   │   ├── manifest.js   # Dynamic manifest generator & /:config middleware
│   │   └── hls.js        # HLS proxy, m3u8 rewriter, /hls/sub.vtt subtitle proxy
│   ├── handlers.js       # Catalog/Meta/Stream handlers + Configurator HTML Generator
│   ├── config.js         # Base64URL encode/decode, VALID_PROVIDERS, VALID_CATEGORIES
│   ├── manifest.js       # Stremio manifest definitions, 22 standard K20 catalogs
│   └── providers/        # 7 providers: vsmov, kkphim, nguonc, stp, hh3d, yan, clbpx
└── .skills/taste-skill/  # Taste-Skill Anti-Slop Design Guidelines
```

### Route Wiring Flow:
```
Request: GET / or GET /:config
  ↓
Express app.use('/', manifestRouter)
  ├── matches /manifest.json → returns manifest
  ├── matches /:config/manifest.json → returns dynamic manifest
  └── router.use('/:config') → decodes token, attaches req.addonConfig, calls next()
  ↓
Express app.use('/', handlers)
  └── router.get(['/', '/configure']) → [Currently fails to match /:config!]
```

---

## 3. Detailed Component Breakdown

### 3.1 Header & Live Status Indicators
* **Emblem**: `🎬` enclosed in a 64×64 rounded neon container (`rgba(99, 102, 241, 0.9)` to `rgba(236, 72, 153, 0.9)`) with pulsating ambient border (`emblemPulse`).
* **Title & Subtitle**: 
  - Title: `VIP Movies` with fluid gradient typography (`linear-gradient(135deg, #ffffff, #cbd5e1, #c084fc)`).
  - Subtitle: `Stremio & Nuvio Cyber-Addon • Multi-Source 4K Engine`.
* **Live Status Pill**:
  - Requirements (R2): `🟢 Server VIP Core Online · v1.5.1` (or `Hệ thống Trực tuyến · v1.5.1`).
  - Active pulsing green radar indicator (`.pulse-ping` with `@keyframes ping`).

### 3.2 Quick Action Toolbar & Category Switchers
* **Interactive Pills**:
  - `[⚡ Bật tất cả]`: Enables all 7 providers and all 4 categories.
  - `[🚫 Tắt tất cả]`: Resets to minimum core set (`movie` category, `vsmov` & `kkphim` providers).
  - Category Pills: `[🎬 Phim Lẻ]`, `[📺 Phim Bộ]`, `[🐉 Hoạt Hình 3D]`, `[🍿 Chiếu Rạp]`.
* **Micro-interactions**:
  - Tactile feedback: `:hover { transform: translateY(-1.5px); }`, `:active { transform: scale(0.97); }`.
  - Active state: glowing border (`rgba(99, 102, 241, 0.55)`), background highlight (`rgba(99, 102, 241, 0.18)`), box shadow (`0 0 16px rgba(99, 102, 241, 0.25)`).

### 3.3 7 Provider Bento Cards & Switch Tracks
* **7 Providers Specification**:
  1. **VSMOV 4K** (`vsmov`): Master 4K Ultra HD, Vietsub, Lồng Tiếng & Thuyết Minh. Badges: `Master 4K`, `Đa Server Audio`, `CDN VIP`.
  2. **KKPhim** (`kkphim`): Cụm máy chủ ổn định & Tra cứu IMDb Direct. Badges: `Vietsub`, `Full HD`, `IMDb Direct`.
  3. **NguonC** (`nguonc`): Proxy StreamC vượt chặn ISP & Thuyết Minh. Badges: `StreamC`, `Thuyết Minh`, `IMDb`.
  4. **STP** (`stp`): Kho Điện Ảnh Âu Mỹ & Phim Bộ Hàn Quốc K-Drama. Badges: `Âu Mỹ Cinema`, `K-Drama`.
  5. **HH3D** (`hh3d`): Tiên Hiệp & Huyền Huyễn (Đấu Phá, Thôn Phệ...). Badges: `3D Donghua`, `Tiên Hiệp`.
  6. **YAN** (`yan`): Donghua & Anime 3D Cập Nhật Theo Ngày. Badges: `Donghua Mới`, `Tốc Độ Cao`.
  7. **CLBPX** (`clbpx`): Kiếm Hiệp Kim Dung & TVB Hồng Kông Cổ Điển. Badges: `Kim Dung`, `TVB Hồng Kông`.
* **Switch Mechanics**:
  - Track: 42×24px pill with smooth background color transition.
  - Thumb: 18×18px white circle moving with spring physics (`0.35s cubic-bezier(0.34, 1.56, 0.64, 1)`).
  - Accessibility: `role="checkbox"`, `aria-checked="true"`, `tabindex="0"`, keyboard support (`Space` / `Enter`).

### 3.4 Floating Action Dock & Manifest Deep-Links
* **Frosted Glass Floating Dock**:
  - `position: fixed; bottom: 0; left: 0; right: 0; z-index: 100`.
  - Multi-layer backdrop blur (`blur(32px)`), dark slate glass (`rgba(18, 22, 34, 0.85)`), subtle 1px border.
  - Live status indicator: `Đang kích hoạt: X nguồn VIP · Y danh mục`.
  - Optional API Key input with password masking and focus ring.
  - Actions:
    1. **Primary Button (`.cta-btn-primary`)**: `⚡ Cài đặt vào Stremio App` (`stremio://${host}/${token}/manifest.json`) with continuous light sheen shimmer.
    2. **Secondary Button (`.cta-btn-secondary`)**: `🌐 Mở Stremio Web` (`https://web.stremio.com/#/addons?addon=...`).
* **Manifest Link Card**:
  - Dotted border glass container displaying real-time updated manifest URL.
  - One-click copy with Clipboard API + textarea fallback + animated Toast notification (`.clipboard-toast`).

### 3.5 Signature Footer
* Strict brand requirement:
  `VIP Movies Addon v1.5.1 • Designed with Taste by <span class="brand-highlight">Q121101</span>`
  with vivid rainbow/neon glowing gradient on `Q121101`.

---

## 4. Empirical Route & Defect Analysis

### Defect 1: HTTP 404 on `GET /:config` and `GET /:config/configure`
* **Observation**:
  Running `fetch("http://127.0.0.1:<PORT>/<TOKEN>")` returns:
  `HTTP/1.1 404 Not Found` with `{ error: "Endpoint không tồn tại", path: "/<TOKEN>" }`.
* **Cause**:
  In `src/handlers.js`:
  ```javascript
  // Line 153 in src/handlers.js:
  router.get(['/', '/configure'], (req, res) => { ... });
  ```
  This only matches `/` and `/configure`. When a request is made to `/:config` or `/:config/configure`, Express routes it to `handlers.js` with `req.url` set to the token path segment, which fails to match `['/', '/configure']`.
* **Fix Specification**:
  Update route definition in `src/handlers.js`:
  ```javascript
  router.get(['/', '/configure', '/:config', '/:config/configure'], (req, res, next) => {
    const token = req.params.config;
    if (token && !isConfigToken(token)) return next();
    // Resolve initial config from req.addonConfig || decodeConfig(token) || decodeConfig(req.query.config) || DEFAULT_CONFIG
    ...
  });
  ```

### Defect 2: Server-to-Client State Hydration
* **Observation**:
  The HTML template currently hardcodes:
  ```javascript
  var _providers = new Set(['vsmov', 'kkphim', 'nguonc', 'stp', 'hh3d', 'yan', 'clbpx']);
  var _categories = new Set(['movie', 'series', 'anime', 'cinema']);
  ```
  If a user opens a personalized configuration link `http://example.com/eyJwcm92aWRlcnMiOlsidnNtb3YiXX0=`, the server must extract the active providers/categories from the token, pre-render the active classes in the HTML cards, and serialize the initial state into the inline `<script>`.

---

## 5. Taste-Skill Anti-Slop Design Guidelines Checklist

| Guideline | Requirement | Implementation Status / Plan |
|---|---|---|
| **Background** | OLED True Black `#0b0d13` + Deep Slate | Implemented via CSS variable `--bg-oled: #0b0d13` |
| **Ambient Glow** | 3-Orb Aurora Mesh (`#6366f1`, `#ec4899`, `#06b6d4`) | Implemented with `@keyframes ambientDrift` (24s alternate) |
| **Glassmorphism** | Multi-layer blur (`28px+`), `1px` border `rgba(255,255,255,0.08)` | Implemented with inset lighting highlight `inset 0 1px 0 rgba(255,255,255,0.08)` |
| **Typography** | Plus Jakarta Sans + JetBrains Mono, tight tracking | Loaded via Google Fonts preconnect, fluid scaling |
| **Bento Rhythm** | Featured Hero Card + Balanced Grid (1 + 6 layout) | VSMOV 4K featured full-width card, 6 balanced 2-col tiles |
| **Viewport Safety** | `min-h-[100dvh]`, bottom padding 170px for Dock | No layout jump on mobile Safari/Chrome address bar collapse |
| **Micro-Interactions**| Tactile push on `:active`, spring switch track | Cubic-bezier physics on switch thumbs & pills |
| **Brand Signature**| `VIP Movies Addon v1.5.1 • Designed with Taste by Q121101` | Glowing neon gradient text on `Q121101` |

---

## 6. Implementation Blueprint for Implementer Agent

### Step 1: Update Route Matching in `src/handlers.js`
Modify line 153 to support all root and config paths:
```javascript
router.get(['/', '/configure', '/:config', '/:config/configure'], (req, res, next) => {
  const token = req.params.config;
  if (token && !isConfigToken(token)) return next();

  // Resolve config
  let userConfig = DEFAULT_CONFIG;
  if (req.addonConfig) {
    userConfig = req.addonConfig;
  } else if (token) {
    userConfig = decodeConfig(token);
  } else if (req.query && req.query.config) {
    userConfig = decodeConfig(req.query.config);
  }
  
  const currentToken = encodeConfig(userConfig);
  ...
```

### Step 2: Hydrate Initial State in HTML & Script
In the HTML template:
- Pre-render `active` class on provider cards only if `userConfig.providers.includes(id)`.
- Pre-render `active` class on category pills only if `userConfig.categories.includes(cat)`.
- Pre-populate API key if `userConfig.apiKey` is present.
- Inject initial config into client script:
  ```javascript
  var _providers = new Set(${JSON.stringify(userConfig.providers)});
  var _categories = new Set(${JSON.stringify(userConfig.categories)});
  var _apiKey = ${JSON.stringify(userConfig.apiKey || '')};
  ```

### Step 3: Enhance VSMOV 4K Featured Bento Card
Make VSMOV 4K span 2 columns on desktop (`grid-column: 1 / -1`), with an exclusive "⭐ Flagship 4K Engine" badge, creating a 1 + 6 balanced grid that strictly adheres to Taste-Skill Bento design rules.

### Step 4: Verification Suite
- Verify `GET /` -> HTTP 200 text/html
- Verify `GET /:config` -> HTTP 200 text/html with pre-selected state
- Verify `GET /:config/configure` -> HTTP 200 text/html
- Verify `node tests/verify_playback.js` -> 100% pass (All 7 phases pass)
- Verify `node --check src/index.js` -> 0 syntax errors
