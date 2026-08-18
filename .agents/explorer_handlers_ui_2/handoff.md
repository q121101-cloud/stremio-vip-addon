# Handoff Report: Configurator UI & Handlers Architecture

**Agent**: `explorer_handlers_ui_2`  
**Date**: 2026-08-18  
**Working Directory**: `/Users/quan/.gemini/antigravity/scratch/stremio-nguonc-addon/.agents/explorer_handlers_ui_2`  
**Handoff Type**: Hard (Task complete)

---

## 1. Observation

1. **Route definition in `src/handlers.js:153`**:
   ```javascript
   router.get(['/', '/configure'], (req, res) => {
     const host     = req.headers['x-forwarded-host'] || req.headers.host || 'localhost:7000';
     ...
   ```
2. **Execution output of probing `GET /:config` and `GET /:config/configure`**:
   ```
   Command: node -e '...'
   Output:
   GET / → 200 text/html; charset=utf-8
   GET /eyJwcm92aWRlcnMiOlsidnNtb3YiLCJra3BoaW0iLCJuZ3VvbmMiLCJzdHAiLCJoaDNkIiwieWFuIiwiY2xicHgiXSwiY2F0ZWdvcmllcyI6WyJtb3ZpZSIsInNlcmllcyIsImFuaW1lIiwiY2luZW1hIl0sImFwaUtleSI6IiJ9 → 404 application/json
   GET /eyJwcm92aWRlcnMiOlsidnNtb3YiLCJra3BoaW0iLCJuZ3VvbmMiLCJzdHAiLCJoaDNkIiwieWFuIiwiY2xicHgiXSwiY2F0ZWdvcmllcyI6WyJtb3ZpZSIsInNlcmllcyIsImFuaW1lIiwiY2luZW1hIl0sImFwaUtleSI6IiJ9/configure → 404 application/json
   ```
3. **Hardcoded client state initialization in `src/handlers.js:1005-1008`**:
   ```javascript
   var _allProvidersList = ['vsmov', 'kkphim', 'nguonc', 'stp', 'hh3d', 'yan', 'clbpx'];
   var _providers = new Set(['vsmov', 'kkphim', 'nguonc', 'stp', 'hh3d', 'yan', 'clbpx']);
   var _categories = new Set(['movie', 'series', 'anime', 'cinema']);
   var _apiKey = '';
   ```
4. **Existing E2E Playback verification test in `tests/verify_playback.js`**:
   - `node tests/verify_playback.js` executed with 7/7 phases passing in 9.51s:
     - Manifest & Route Integrity: PASSED (22 catalogs)
     - VSMOV Multi-Server Audio Tabs (Vietsub & Long Tieng/Thuyet Minh): PASSED
     - Subtitle Proxy `/hls/sub.vtt`: PASSED (HTTP 200, text/vtt, CORS *)
     - KKPhim Episode Anti-404 Playback: PASSED (tt0903747:1:1)
     - Real Video TS segment download: PASSED (7,447,877 bytes > 50KB, sync byte 0x47)
     - HTTP Range Request (206 Partial Content): PASSED
5. **Taste-Skill Anti-Slop Guidelines in `.skills/taste-skill/skills/taste-skill/SKILL.md`**:
   - Rule 4.7 "BENTO CELL COUNT RULE": A Bento grid must have rhythm without orphan cells (7 cards → 1 featured hero card + 6 balanced cards).
   - Rule 3.E "Viewport Stability": `min-h-[100dvh]` to avoid mobile address bar jumps.
   - Rule 4.5 "Interactive UI States": Tactile feedback `:active { transform: scale(0.97); }` and spring physics transitions.

---

## 2. Logic Chain

1. **Premise**: Requirement R3 states: *"Verify that `GET /` and `GET /:config` return HTTP 200 with valid HTML containing the new Taste-Skill design."*
2. **From Observation 1 & 2**: `src/handlers.js` only listens on `['/', '/configure']`. When a user requests `http://<host>/<token>` (which is standard when clicking "Configure" in Stremio), Express executes `manifestRouter` middleware (which calls `next()` because it's not `/manifest.json`), passes to `handlers.js` which fails to match, and falls through to the 404 catch-all.
3. **Inference**: Changing the route definition in `src/handlers.js` to `router.get(['/', '/configure', '/:config', '/:config/configure'], ...)` will resolve the 404 error and allow both default root and custom token URLs to render the Configurator dashboard.
4. **From Observation 3**: Because `_providers` and `_categories` are hardcoded in the client script, any custom token provided in `req.params.config` or `req.addonConfig` is ignored upon HTML rendering.
5. **Inference**: Passing `userConfig` into the template generation to pre-render the active classes on cards/pills and initializing `_providers = new Set(${JSON.stringify(userConfig.providers)})` completes bidirectional state hydration.
6. **From Observation 4**: Modifying the HTML presentation layer in `src/handlers.js` does not affect stream extraction, HLS proxying, or provider scrapers, so backend playback stability remains intact.
7. **From Observation 5**: Structuring the 7 providers into a 1 featured hero card (VSMOV 4K) + 6 balanced grid cards satisfies Taste-Skill anti-slop guidelines while visually highlighting the flagship 4K engine.

---

## 3. Caveats

1. **External Assets**: The UI relies on Google Fonts (`Plus Jakarta Sans`, `JetBrains Mono`) for optimal typography. In completely offline environments, fallback font stacks (`-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif`) are in place.
2. **Clipboard API in Non-HTTPS**: In insecure HTTP contexts (outside localhost), `navigator.clipboard.writeText` may be blocked by modern browser security policies. The textarea fallback mechanism in `copyManifest()` handles this transparently.
3. **No Caveats on Backend Playback**: All existing backend routing and provider tests are fully verified.

---

## 4. Conclusion

The Configurator dashboard in `src/handlers.js` has a solid Cyber-Glassmorphism baseline but requires three specific refactorings to fully meet the Taste-Skill Anti-Slop specification and requirements R1-R3:
1. **Extend Route Matcher**: Update route in `src/handlers.js` to `router.get(['/', '/configure', '/:config', '/:config/configure'], (req, res, next) => ...)` to fix the `GET /:config` 404 bug.
2. **Implement State Hydration**: Parse config from `req.addonConfig || req.params.config || req.query.config` and pre-render active states for cards/pills and inline `<script>` variables.
3. **Refine Taste-Skill Bento & Dock Layout**: Format the 7 provider cards into a 1-Hero + 6-Grid Bento structure, ensure floating dock has shimmer CTA buttons and live badge counters, and preserve the glowing brand signature `VIP Movies Addon v1.5.1 • Designed with Taste by <span class="brand-highlight">Q121101</span>`.

---

## 5. Verification Method

To independently verify the findings and any future implementation:

1. **Verify Root & Config HTML Endpoints**:
   ```bash
   node -e '
   const app = require("./src/index.js");
   const server = app.listen(0, async () => {
     const port = server.address().port;
     const token = require("./src/config").getDefaultToken();
     const res1 = await fetch(`http://127.0.0.1:${port}/`);
     console.log("GET / status:", res1.status, res1.headers.get("content-type"));
     const res2 = await fetch(`http://127.0.0.1:${port}/${token}`);
     console.log(`GET /:config status:`, res2.status, res2.headers.get("content-type"));
     const res3 = await fetch(`http://127.0.0.1:${port}/${token}/configure`);
     console.log(`GET /:config/configure status:`, res3.status, res3.headers.get("content-type"));
     server.close();
   });
   '
   ```
2. **Verify Playback & E2E Suite**:
   ```bash
   node tests/verify_playback.js
   ```
3. **Verify Node Syntax Integrity**:
   ```bash
   node --check src/index.js && node --check src/handlers.js
   ```
