## 2026-08-18T02:53:04Z
You are the Worker agent responsible for implementing Milestone 1: Taste-Skill Cyber-Glassmorphism UI Overhaul & Route Hydration.

Working directory for your metadata and reports: /Users/quan/.gemini/antigravity/scratch/stremio-nguonc-addon/.agents/worker_taste_ui_1
Authoritative User Request: /Users/quan/.gemini/antigravity/scratch/stremio-nguonc-addon/.agents/ORIGINAL_REQUEST.md
Project Specifications: /Users/quan/.gemini/antigravity/scratch/stremio-nguonc-addon/.agents/PROJECT.md

Explorer Reports to read:
- Design specifications: /Users/quan/.gemini/antigravity/scratch/stremio-nguonc-addon/.agents/explorer_taste_guidelines_2/report.md
- Clusters & Routes specifications: /Users/quan/.gemini/antigravity/scratch/stremio-nguonc-addon/.agents/explorer_clusters_routes_2/report.md
- Handlers & UI blueprint: /Users/quan/.gemini/antigravity/scratch/stremio-nguonc-addon/.agents/explorer_handlers_ui_2/report.md

MANDATORY INTEGRITY WARNING:
DO NOT CHEAT. All implementations must be genuine. DO NOT hardcode test results, create dummy/facade implementations, or circumvent the intended task. A teamwork_preview_auditor will independently verify your work. Integrity violations WILL be detected and your work WILL be rejected.

Your implementation tasks:
1. Implement the world-class Cyber-Glassmorphism Configurator / Landing page in `src/handlers.js` (and related files) strictly following Taste-Skill Anti-Slop Design Standards:
   - Palette: OLED True Black (`#0b0d13`), deep slate cards (`rgba(18, 22, 34, 0.65)`), 3-orb dynamic aurora ambient mesh glow (`#6366f1` Indigo, `#ec4899` Pink, `#06b6d4` Cyan) with 140px blur and drift animation.
   - Glassmorphism: Multi-layer backdrop blur (28px - 32px), 1px hairline borders (`rgba(255, 255, 255, 0.08)`), top edge lighting refraction (`inset 0 1px 0 rgba(255, 255, 255, 0.08)`).
   - Typography: Font scale using `Plus Jakarta Sans` / `Inter` / `SF Pro Display`, tight tracking, gradient title text, `JetBrains Mono` for code/tokens.
   - Header: Glowing neon cinema badge (`🎬`) with breathing pulse animation (`emblemPulse`), real-time live status pill indicator (`🟢 Server VIP Core Online · v1.5.1`).
   - Quick Action Toolbar: Smooth pill buttons (`[⚡ Bật tất cả]`, `[🚫 Tắt tất cả]`, `[🎬 Phim Lẻ]`, `[📺 Phim Bộ]`, `[🍿 Chiếu Rạp]`, `[🐉 Hoạt Hình 3D]`).
   - 7 Provider Bento layout: 1 Featured Flagship Hero tile (VSMOV 4K) spanning full width on desktop + 6 balanced grid tiles (KKPhim, NguonC, STP, HH3D, YAN, CLBPX).
   - Micro-interactions: Spring-physics micro-switches (`cubic-bezier(0.34, 1.56, 0.64, 1)`) with provider-specific glowing aura on toggle.
   - Floating Action Dock: Frosted glass floating dock (`backdrop-filter: blur(32px)`), live status counter (`Đang bật: X nguồn · Y danh mục`), API key input, and quick action buttons ("⚡ Cài đặt vào Stremio App", "🌐 Mở trên Stremio Web", "📋 Sao chép link Manifest") with shimmer light sweep hover effect.
   - Personalized Manifest Card: Real-time manifest URL generation, 1-click copy with toast alert.
   - Exact signature footer: `VIP Movies Addon v1.5.1 • Designed with Taste by <span class="brand-highlight">Q121101</span>`.
   - Route Matching & Hydration: Ensure route in `src/handlers.js` matches `['/', '/configure', '/:config', '/:config/configure']`, extracts `req.addonConfig` or token, and hydrates initial state in HTML cards and inline client JavaScript.
   - Versioning: Ensure version `1.5.1` is maintained across `package.json`, `src/manifest.js`, and `src/handlers.js`.
2. Verification & Testing:
   - Run `node --check src/index.js` and ensure 0 syntax errors.
   - Run `node tests/verify_playback.js` and ensure all phases pass.
   - Run `node tests/verify_vsmov_sub_audio.js` and ensure all assertions pass.
   - Test `GET /` and `GET /:config` (e.g. via local request or script) to verify HTTP 200 and valid HTML response.
3. Write `report.md` and `handoff.md` in `/Users/quan/.gemini/antigravity/scratch/stremio-nguonc-addon/.agents/worker_taste_ui_1/`.
4. Send a completion message back to parent with summary and file path.
