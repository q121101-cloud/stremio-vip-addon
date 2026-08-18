# Project: VIP Movies Stremio Addon Taste-Skill UI Overhaul

## Architecture
- Backend: Express.js Stremio v2 / Stremio Web compliant Addon.
- Frontend: Single-page Cyber-Glassmorphism Configurator (`/`, `/configure`, `/:config`, `/:config/configure`) following Taste-Skill Anti-Slop Design Standards.
- Token Pipeline: Bidirectional Base64URL serialization between frontend configurator state and backend route middleware (`/:config/*`).
- Streaming: In-App HLS proxy & WebVTT subtitle proxy engine supporting 7 provider clusters and multi-server audio streams.

## Code Layout
- `src/handlers.js`: HTML Configurator template, Landing page generator, Catalog/Meta/Stream handlers, and Route Handlers.
- `src/routes/manifest.js`: Dynamic manifest routing and `/:config` token middleware.
- `src/routes/hls.js`: HLS manifest rewriter, AES key proxy, segment proxy, and WebVTT subtitle proxy (`/hls/sub.vtt`).
- `src/config.js`: Configuration parser, validator, Base64URL encoder/decoder, `DEFAULT_CONFIG`.
- `src/manifest.js`: Stremio addon manifest specifications and 22 standard K20 catalogs.
- `src/providers/`: 7 provider modules (`vsmov`, `kkphim`, `nguonc`, `stp`, `hh3d`, `yan`, `clbpx`).
- `.skills/taste-skill/`: Taste-Skill Anti-Slop UI guidelines and specifications.
- `tests/`: Automated E2E verification suites (`verify_playback.js`, `verify_vsmov_sub_audio.js`, `verify_taste_ui.js`, challenger suites).

## Feature Inventory
| # | Feature | Description | Milestone | Source |
|---|---------|-------------|-----------|--------|
| 1 | Taste-Skill Anti-Slop Palette | OLED `#0b0d13` background, deep slate surfaces, 3-orb ambient aurora drift (`#6366f1`, `#ec4899`, `#06b6d4`) | M1 | survey |
| 2 | Glassmorphism & Refraction | Multi-layer backdrop blur (28px+), 1px borders (`rgba(255,255,255,0.08)`), top edge lighting | M1 | survey |
| 3 | Fluid Typography Hierarchy | Plus Jakarta Sans font stack, tight tracking, gradient title text, JetBrains Mono code tags | M1 | survey |
| 4 | 7 Provider Bento Layout | 1 Featured Flagship Hero (VSMOV 4K) + 6 Balanced Grid cards (KKPhim, NguonC, STP, HH3D, YAN, CLBPX) | M1 | survey |
| 5 | Quick Action Pill Toolbar | Batch switches (`[⚡ Bật tất cả]`, `[🚫 Tắt tất cả]`) and 4 Category Pills (`[🎬 Phim Lẻ]`, `[📺 Phim Bộ]`, `[🐉 Hoạt Hình 3D]`, `[🍿 Chiếu Rạp]`) | M1 | survey |
| 6 | Spring-Physics Micro-Switches | 42×24px pill tracks, 18px thumb with `cubic-bezier(0.34, 1.56, 0.64, 1)` spring motion | M1 | survey |
| 7 | Floating Action Dock | Frosted glass dock with live sync status (`Đang kích hoạt: X nguồn · Y danh mục`), shimmer CTA buttons, Stremio App/Web deep links | M1 | survey |
| 8 | Personalized Manifest Card | Real-time URL generator with 1-click clipboard copy and animated toast alert | M1 | survey |
| 9 | Brand Signature Footer | `VIP Movies Addon v1.5.1 • Designed with Taste by <span class="brand-highlight">Q121101</span>` | M1 | survey |
| 10 | Route Matching & Hydration | Support `['/', '/configure', '/:config', '/:config/configure']` and pre-populate saved user choices from config token | M1 | survey |
| 11 | Responsive Viewports | Mobile (375px+), tablet, desktop, and widescreen layout with safe viewport padding (`min-h-[100dvh]`) | M1 | survey |
| 12 | E2E Playback & Verification | Verify `node tests/verify_playback.js`, verify `GET /` and `GET /:config` HTML, TS segment download > 50KB | M2 | survey |
| 13 | Forensic Integrity Audit | Systematic checks against cheating, dummy facades, and hardcoded values | M3 | survey |
| 14 | Versioning & Git Deployment | Verify v1.5.1 across files and `git push origin main` | M4 | survey |

## Milestones
| # | Name | Scope | Dependencies | Status |
|---|------|-------|-------------|--------|
| M1 | Taste UI Overhaul & Hydration | Implement Taste-Skill Anti-Slop UI, Bento Grid, Spring Switches, Floating Dock & `/:config` hydration in `src/handlers.js` | none | DONE |
| M2 | E2E & Visual Verification | Automated test suite execution (`verify_playback.js`, `verify_vsmov_sub_audio.js`, UI route verification) | M1 | DONE |
| M3 | Forensic Integrity Audit | Independent audit by `teamwork_preview_auditor` | M2 | DONE |
| M4 | Versioning & GitHub Deployment | Version check (1.5.1), Git commit & Push | M3 | IN_PROGRESS |

## Interface Contracts
### Client ↔ Server Config Token
- Client: JSON `{ providers: [...], categories: [...], apiKey: "..." }` -> Base64URL string token without padding.
- Server: Decodes Base64URL token in `decodeConfig(token)` into `{ providers, categories, apiKey }` matching `VALID_PROVIDERS` and `VALID_CATEGORIES`.
- Routes: `GET /:config` serves configurator pre-hydrated with `req.addonConfig`. `GET /:config/manifest.json` serves filtered manifest.
