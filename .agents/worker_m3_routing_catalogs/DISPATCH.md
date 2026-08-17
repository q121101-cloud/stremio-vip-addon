# DISPATCH

## 2026-08-18T03:09:41+07:00
You are the Milestone 3 Worker for Routing, 404 Prevention & 22 Catalogs K20 Standard.
Your working directory is: /Users/quan/.gemini/antigravity/scratch/stremio-nguonc-addon/.agents/worker_m3_routing_catalogs

Read ORIGINAL_REQUEST.md at /Users/quan/.gemini/antigravity/scratch/stremio-nguonc-addon/ORIGINAL_REQUEST.md and PROJECT.md at /Users/quan/.gemini/antigravity/scratch/stremio-nguonc-addon/.agents/orchestrator/PROJECT.md.

MANDATORY INTEGRITY WARNING:
DO NOT CHEAT. All implementations must be genuine. DO NOT hardcode test results, create dummy/facade implementations, or circumvent the intended task. A teamwork_preview_auditor will independently verify your work. Integrity violations WILL be detected and your work WILL be rejected.

Your task (Requirements R3 & R4):
1. **Explicit Routing & Stremio Protocol Conformance** (`src/index.js`, `src/routes/manifest.js`):
   - Ensure Express router handles all Stremio routes both WITH and WITHOUT `/:config/` prefix:
     - `/manifest.json` and `/:config/manifest.json`
     - `/catalog/:type/:id.json` and `/:config/catalog/:type/:id.json`
     - `/catalog/:type/:id/:extra.json` and `/:config/catalog/:type/:id/:extra.json`
     - `/stream/:type/:id.json` and `/:config/stream/:type/:id.json`
     - `/meta/:type/:id.json` and `/:config/meta/:type/:id.json`
   - Ensure `/:config` param is safely parsed (e.g. Base64 JSON or URLSearchParams) and passed to handlers.
   - Robust `extra` parameter parser: handle URL-encoded `search=...`, `genre=...`, `skip=...`, and path params without crashing or 404ing.

2. **22 Catalogs K20 Standard** (`src/manifest.js`, `src/config.js`):
   - Configure all 22 standard K20 catalogs in `src/manifest.js` (spanning movies & series across VSMOV, KKPhim, NguonC, STP, HH3D, YAN, CLBPX, Cinema, Kdrama, Anime, Donghua, US/UK, etc.).
   - Support catalog searching and filtering in catalog handlers (`src/handlers.js` or dedicated catalog router).
   - When Stremio searches via catalog search extra (`search=...`), search across enabled providers and return matching `{ metas: [...] }`. If none match, return `{ metas: [] }` (HTTP 200, NEVER 404).

3. **Configurator Integration** (`src/config.js`, `src/handlers.js`):
   - Ensure user config options support enabling/disabling providers and catalogs cleanly.

Write ownership:
- `src/index.js`
- `src/routes/manifest.js`
- `src/manifest.js`
- `src/config.js`
- `src/handlers.js` (catalog handling & routing integration)
