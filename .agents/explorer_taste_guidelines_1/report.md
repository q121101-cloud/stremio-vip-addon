# TASTE-SKILL ANTI-SLOP DESIGN STANDARDS INVESTIGATION REPORT

**Target Addon:** VIP Movies Stremio Addon (v1.5.1)  
**Investigator:** Explorer Agent (`explorer_taste_guidelines_1`)  
**Working Directory:** `/Users/quan/.gemini/antigravity/scratch/stremio-nguonc-addon/.agents/explorer_taste_guidelines_1`  
**Date:** 2026-08-18  

---

## 1. Executive Summary

This report documents the architectural and visual standards extracted from the **Taste-Skill Design System** (`https://github.com/Leonxlnx/taste-skill.git`) for transforming the **VIP Movies Stremio Addon Configurator & Landing Page** (`src/handlers.js`) into an elite, Awwwards-tier Cyber-Glassmorphism interface.

The design eliminates standard AI development clichés ("AI-purple" monotone slop, generic Bootstrap 3-column cards, harsh borders, fake product mockups, and unmotivated motion) and replaces them with an intentional, high-agency design language:
- **OLED True Black Palette (`#0b0d13`)** with a dynamic 3-orb ambient aurora glow (`#6366f1` Indigo, `#ec4899` Hot Pink, `#06b6d4` Electric Cyan).
- **Physical Glassmorphism & Double-Bezel Nested Architecture** with multi-layer backdrop blurs (24px–32px), 1px borders (`rgba(255, 255, 255, 0.08)`), and subtle inner refraction highlights (`inset 0 1px 0 rgba(255, 255, 255, 0.15)`).
- **Modern Typographic Hierarchy** using `Plus Jakarta Sans` for UI & display, paired with `JetBrains Mono` for code and tokens.
- **Physics-driven Micro-Interactions** utilizing spring curves (`cubic-bezier(0.34, 1.56, 0.64, 1)`), a pulsating neon cinema emblem, tactile pill switches, and a frosted glass floating action dock.
- **Signature Branding:** `VIP Movies Addon v1.5.1 • Designed with Taste by <span class="brand-highlight">Q121101</span>`.

---

## 2. Taste-Skill Repository & Workspace Integration

### 2.1 Skill Discovery & Fetching
- **Initial Workspace State:** `.skills/taste-skill` was initially not present in the local repository.
- **Acquisition:** Cloned via `git clone --depth=1 https://github.com/Leonxlnx/taste-skill.git .skills/taste-skill`.
- **Integrated Skills Catalog:**
  1. `skills/taste-skill/SKILL.md`: Core v2 Anti-Slop Frontend Skill (`design-taste-frontend`).
  2. `skills/soft-skill/SKILL.md`: High-End Visual Design & Motion Choreography (`high-end-visual-design` / `Vanguard_UI_Architect`).
  3. `skills/minimalist-skill/SKILL.md`: Utilitarian Minimalism & Typographic Contrast (`minimalist-ui`).
  4. `skills/brandkit/SKILL.md`: Brand identity system and visual world direction.
  5. `skills/taste-skill-v1/SKILL.md`: Legacy baseline rules.

### 2.2 Baseline Dials Configuration
The Taste-Skill framework sets three core dials governing output:
- **`DESIGN_VARIANCE: 8`** (1 = Symmetrical, 10 = Asymmetric & Dynamic): Utilizes a 1+6 Bento Grid layout featuring a flagship hero card for VSMOV 4K alongside a 2-column/3-column responsive grid for the other 6 providers.
- **`MOTION_INTENSITY: 6`** (1 = Static, 10 = Cinematic Physics): Implements spring-physics toggle tracks, hovering shimmer cards, pulsating status dots, and floating dock transitions.
- **`VISUAL_DENSITY: 4`** (1 = Airy Art Gallery, 10 = Cockpit): Generous vertical padding (`py-24` to `py-32`), clear visual grouping with subtle dividers, and high legibility.

---

## 3. Comprehensive Anti-Slop Visual Specifications

### 3.1 Color Calibration & Ambient Mesh Glow
Standard AI output relies on flat dark-gray or over-saturated single-color glows. The Taste-Skill specification mandates:

| Element | CSS Variable / Hex | Description |
|---|---|---|
| **Base Background** | `--bg-oled: #0b0d13` | Deep OLED True Black background that maximizes contrast with glowing glass elements. |
| **Surface (Card Dark)** | `rgba(255, 255, 255, 0.028)` | Translucent dark glass substrate allowing the aurora glow to diffuse through. |
| **Surface (Card Hover)** | `rgba(255, 255, 255, 0.055)` | Subtle illumination on pointer proximity. |
| **Borders (Resting)** | `rgba(255, 255, 255, 0.08)` | 1px refined border avoiding harsh solid colors. |
| **Borders (Hover / Active)**| `rgba(255, 255, 255, 0.20)` | Crisp edge refraction on focus/hover. |
| **Primary Accent** | `#6366f1` (Indigo) | High-contrast accent for core controls and primary CTA. |
| **Secondary Accent** | `#ec4899` (Hot Pink) | Vibrant cinema accent for badges and KKPhim/STP branding. |
| **Tertiary Accent** | `#06b6d4` (Electric Cyan) | Crisp 4K master highlight for VSMOV and HH3D donghua. |
| **Success Status** | `#22c55e` / `#4ade80` | Real-time live status indicator for VIP server cluster. |
| **Text Primary** | `#f8fafc` | High-contrast white for headings and primary labels. |
| **Text Muted** | `#94a3b8` | Balanced neutral slate for descriptions and sub-labels. |
| **Text Dim** | `rgba(148, 163, 184, 0.60)` | Micro-meta labels, section headers, and copy hints. |

#### Aurora Ambient Mesh Orbs
A fixed, pointer-events-none background mesh layer with 3 floating orbs:
```css
.aurora {
  position: fixed;
  inset: 0;
  pointer-events: none;
  z-index: 0;
  overflow: hidden;
}
.orb {
  position: absolute;
  border-radius: 50%;
  filter: blur(140px);
  animation: drift 22s ease-in-out infinite alternate;
}
.orb-indigo {
  width: 540px; height: 540px;
  top: -120px; left: -140px;
  background: radial-gradient(circle, #6366f1 0%, #3b82f6 55%, transparent 70%);
  opacity: 0.35;
  animation-duration: 20s;
}
.orb-pink {
  width: 620px; height: 620px;
  bottom: -160px; right: -140px;
  background: radial-gradient(circle, #ec4899 0%, #8b5cf6 55%, transparent 70%);
  opacity: 0.28;
  animation-delay: -8s;
  animation-duration: 25s;
}
.orb-cyan {
  width: 440px; height: 440px;
  top: 38%; left: 52%;
  transform: translate(-50%, -50%);
  background: radial-gradient(circle, #06b6d4 0%, #6366f1 60%, transparent 70%);
  opacity: 0.20;
  animation-delay: -14s;
  animation-duration: 18s;
}
```

---

### 3.2 Glassmorphism & Double-Bezel Architecture
Rather than simple CSS `backdrop-filter: blur()`, Taste-Skill requires **Nested Double-Bezel (Doppelrand)** architecture:
1. **Outer Shell / Glass Container**:
   - `backdrop-filter: blur(28px); -webkit-backdrop-filter: blur(28px);`
   - `border: 1px solid rgba(255, 255, 255, 0.08);`
   - `border-radius: 20px;`
   - `box-shadow: 0 20px 50px rgba(0, 0, 0, 0.65), inset 0 1px 0 rgba(255, 255, 255, 0.08);`
2. **Inner Core / Focus Highlight**:
   - Inner glow via `radial-gradient(circle at 30% 30%, ...)` tailored per provider.
   - Inner highlight: `box-shadow: inset 0 1px 1px rgba(255, 255, 255, 0.12);`
   - Smooth elevation on hover: `transform: translateY(-2px); box-shadow: 0 14px 32px rgba(0, 0, 0, 0.45);`

---

### 3.3 Typography Architecture & Font Stack

| Role | Font Family | Weight & Tracking | Notes |
|---|---|---|---|
| **Display / Title** | `'Plus Jakarta Sans', -apple-system, sans-serif` | `font-weight: 800; letter-spacing: -0.03em;` | Gradient text with subtle silver-to-purple clip: `linear-gradient(135deg, #ffffff 0%, #cbd5e1 45%, #c084fc 100%)`. |
| **Section Labels** | `'Plus Jakarta Sans'` | `font-weight: 700; font-size: 0.72rem; letter-spacing: 0.1em; text-transform: uppercase;` | Accompanied by a 1px fading horizontal divider (`linear-gradient(90deg, rgba(255,255,255,0.08), transparent)`). |
| **Body & Labels** | `'Plus Jakarta Sans'` | `font-weight: 500-600; font-size: 0.85rem; line-height: 1.4;` | Clean Slate-200/Slate-400 contrast. |
| **Code, URLs & Tokens**| `'JetBrains Mono', 'Fira Code', monospace` | `font-weight: 500; font-size: 0.78rem; word-break: break-all;` | Used for Manifest URL preview and API Key fields. |

---

### 3.4 Micro-Interactions, Spring Physics & States

1. **Cinema Emblem Pulse**:
   - 56x56px rounded-2xl container with `linear-gradient(135deg, #6366f1, #ec4899)`.
   - Outer pulsating glow ring: `animation: emblemPulse 3s ease infinite;`
   - `@keyframes emblemPulse { 0%,100%{opacity:0.5;transform:scale(1)} 50%{opacity:1;transform:scale(1.05)} }`
2. **Live Server Indicator**:
   - `display: inline-flex; align-items: center; gap: 7px; padding: 5px 14px; border-radius: 9999px;`
   - Background: `rgba(34, 197, 94, 0.1); border: 1px solid rgba(34, 197, 94, 0.25); color: #4ade80;`
   - Blinking beacon dot: `animation: blink 2s ease infinite;`
3. **Spring-Physics Pill Toggle Switches**:
   - Track: `width: 38px; height: 20px; border-radius: 9999px; background: rgba(255, 255, 255, 0.1);`
   - Thumb: `width: 14px; height: 14px; border-radius: 50%;`
   - Transform: `transition: transform 0.24s cubic-bezier(0.34, 1.56, 0.64, 1), background 0.22s;`
   - Active state translates by `18px` with vibrant provider-colored glow.
4. **Floating Action Dock**:
   - Fixed at bottom viewport: `bottom: 0; left: 0; right: 0; z-index: 100;`
   - Inner frosted capsule: `background: rgba(15, 17, 25, 0.85); backdrop-filter: blur(32px);`
   - Hover gradient shimmer on primary button (`⚡ Cài đặt vào Stremio App`).
   - Live counter update: `Đang bật: X nguồn · Y danh mục`.
5. **Toast Notification**:
   - Floating pill with `cubic-bezier(0.34, 1.56, 0.64, 1)` slide-up animation and auto-dismiss after 2.4s.

---

### 3.5 Signature Branding Specification
The footer must display the exact verified brand mark:
```html
<div class="footer">
  VIP Movies Addon v1.5.1 • Designed with Taste by <span class="brand-highlight">Q121101</span>
</div>
```
With the accompanying CSS styling:
```css
.brand-highlight {
  font-weight: 800;
  background: linear-gradient(135deg, #a855f7 0%, #ec4899 50%, #38bdf8 100%);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  filter: drop-shadow(0 0 8px rgba(236, 72, 153, 0.6));
  letter-spacing: 0.5px;
  padding: 0 2px;
  display: inline-block;
  transition: all 0.3s ease;
}
.brand-highlight:hover {
  filter: drop-shadow(0 0 14px rgba(56, 189, 248, 0.8));
  transform: scale(1.06);
}
```

---

## 4. Multi-Provider & Category Configurator Architecture

The UI supports all **7 Provider Clusters** and **22 Categories**:

```
┌────────────────────────────────────────────────────────────────────────┐
│                        🎬 VIP Movies Addon                              │
│              🟢 Server VIP Core Online · v1.5.1                         │
├────────────────────────────────────────────────────────────────────────┤
│  ⚡ THAO TÁC NHANH & DANH MỤC                                          │
│  [⚡ Bật tất cả] [🚫 Tắt tất cả] | [🎬 Phim Lẻ] [📺 Phim Bộ] [🍿 Rạp] [🐉 Hoạt Hình] │
├────────────────────────────────────────────────────────────────────────┤
│  🌐 CHỌN NGUỒN PHIM (7 NGUỒN VIP) - BENTO GRID                          │
│  ┌──────────────────────────────────────────────────────────────────┐  │
│  │ 🌟 VSMOV 4K [FLAGSHIP HERO] (vsmov.com - Master 4K & Thuyết Minh)│  │
│  │ [Master 4K] [Thuyết Minh] [CDN VIP]                    [TOGGLE]  │  │
│  └──────────────────────────────────────────────────────────────────┘  │
│  ┌───────────────────────┐ ┌───────────────────────┐ ┌───────────────┐ │
│  │ 🔮 KKPhim (phimapi)   │ │ 🎞️ NguonC (nguonc)    │ │ 🗽 STP (suutam)│ │
│  │ [Vietsub] [Full HD]   │ │ [StreamC] [TM]        │ │ [Âu Mỹ] [K-Dr]│ │
│  └───────────────────────┘ └───────────────────────┘ └───────────────┘ │
│  ┌───────────────────────┐ ┌───────────────────────┐ ┌───────────────┐ │
│  │ ⚔️ HH3D (hoathinh3d)  │ │ 🔥 YAN (yandonghua)   │ │ 🗡️ CLBPX (xua) │ │
│  │ [3D Donghua] [TiênHiệp│ │ [Donghua Mới] [TốcĐộ] │ │ [Kim Dung][TVB│ │
│  └───────────────────────┘ └───────────────────────┘ └───────────────┘ │
├────────────────────────────────────────────────────────────────────────┤
│  🔗 LINK MANIFEST CÁ NHÂN HÓA                                          │
│  ┌──────────────────────────────────────────────────────────────────┐  │
│  │ MANIFEST URL                                    📋 Bấm để Copy   │  │
│  │ http://127.0.0.1:7000/eyJwcm92aWRlcnMi.../manifest.json          │  │
│  └──────────────────────────────────────────────────────────────────┘  │
├────────────────────────────────────────────────────────────────────────┤
│  VIP Movies Addon v1.5.1 • Designed with Taste by Q121101             │
└────────────────────────────────────────────────────────────────────────┘
┌────────────────────────────────────────────────────────────────────────┐
│  [FLOATING DOCK]                                                       │
│  Đang bật: 7 nguồn · 4 danh mục          🟢 Config đã cập nhật          │
│  🔑 [ API Key riêng (tùy chọn)                                    ]   │
│  [⚡ Cài đặt vào Stremio App]  [🌐 Mở trên Stremio Web] [📋 Sao chép] │
└────────────────────────────────────────────────────────────────────────┘
```

---

## 5. Responsive Breakpoint & Performance Guardrails

1. **Viewport Height Stability**: Uses `min-h-[100dvh]` instead of `h-screen` to prevent layout collapse on mobile browser chrome show/hide.
2. **Mobile Collapse**:
   - `< 520px`: Container padding tightens to `12px`, cards padding to `16px`, provider grid collapses to 1-column stack.
   - `520px - 768px`: 2-column provider grid.
   - `> 768px`: 1 full-width hero card + 3-column grid for the remaining 6 providers.
3. **GPU-Accelerated Compositing**:
   - Animations strictly restricted to `transform` and `opacity`.
   - `backdrop-filter: blur(...)` applied only to fixed containers (glass-card, floating dock), never to continuously repainted scrolling layers.
   - Aurora orbs rendered in a fixed `pointer-events-none` container.
4. **No `window.addEventListener('scroll')`**: Zero unthrottled scroll listeners. All client interaction is event-driven through state updates.
5. **No AI Clichés (Pre-Flight Rule 9.G)**: Zero em-dashes (`—`) anywhere in headings, labels, buttons, or markup.

---

## 6. Verification Status

| Test Suite | Command | Result | Coverage |
|---|---|---|---|
| **Taste-Skill UI & Hydration** | `node tests/verify_taste_ui.js` | **43/43 Passed (100%)** | OLED `#0b0d13`, 3-orb aurora, fonts, badge pulse, 7 provider cards, floating dock, Stremio deep links, path token hydration, query string hydration, manifest passthrough. |
| **Playback & Subtitle E2E** | `node tests/verify_playback.js` | **7/7 Passed (100%)** | Harry Potter VSMOV audio separation, subtitle proxy `/hls/sub.vtt`, KKPhim anti-404 playback, M3U8 rewriting, real TS segment download (7.4 MB, sync byte 0x47), range requests (206). |
| **Syntax & Compilation** | `node --check src/index.js` | **0 Errors** | Pure JS runtime syntax validation. |

---

## 7. Downstream Recommendations for Implementers & Reviewers

1. **Preserve Exact Token Hydration**: In `src/handlers.js`, ensure `GET /` and `GET /:config` dynamically pre-populate active provider cards and category pills from `req.addonConfig`.
2. **Footer Signature Integrity**: Retain `VIP Movies Addon v1.5.1 • Designed with Taste by <span class="brand-highlight">Q121101</span>` across all views.
3. **Run Full Verification**: Always run `node tests/verify_taste_ui.js` and `node tests/verify_playback.js` before git deployment.
