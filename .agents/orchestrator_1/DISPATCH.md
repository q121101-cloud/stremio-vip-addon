## 2026-08-19T00:14:57+07:00
You are the Project Orchestrator for the VIP Movies Stremio Addon task.
Working Directory: /Users/quan/.gemini/antigravity/scratch/stremio-nguonc-addon
Agent Working Directory: /Users/quan/.gemini/antigravity/scratch/stremio-nguonc-addon/.agents/orchestrator_1/
Path to Original Request: /Users/quan/.gemini/antigravity/scratch/stremio-nguonc-addon/.agents/ORIGINAL_REQUEST.md

Mission:
Conduct a comprehensive, adversarial code audit and real-world stream backtest across all 8 providers of the VIP Movies Stremio Addon (Engine v1.7.1) committed at 615cb72. Fix any bugs found, then push verified code to origin/main.

Requirements:
1. R1. Code Review & Architectural Audit:
   - src/providers/nguonc.js: Verify stealth request headers (Chrome 131 UA, Referer: https://phim.nguonc.com/, Origin, Sec-Fetch-Dest, Sec-Fetch-Mode, Sec-Fetch-Site), and Vercel-to-Render fallback routing via RENDER_BACKEND_URL env var inside fetchNguonC().
   - src/providers/film4k.js: Verify Film4K REST API scraping (/api/home, /api/title/:slug, /api/watch/:slug), 4K stream URL extraction (/api/hls/archive/:slug/master.m3u8), multi-audio/subtitle handling, and episode matching logic for series.
   - src/routes/hls.js: Verify that upstream HTTP >= 400 errors trigger graceful fallback (direct 302 redirect or re-extraction) instead of returning 502 Bad Gateway; verify broken cache purge via m3u8Cache.del(cacheKey) is called on failure.
   - src/manifest.js, src/config.js, src/handlers.js: Confirm all 8 providers (film4k, vsmov, kkphim, nguonc, stp, hh3d, yan, clbpx) are correctly declared in VALID_PROVIDERS, DEFAULT_CONFIG.providers, ALL_PROVIDERS object, ALL_CATALOGS array, ALL_ID_PREFIXES array, _allProvidersList client-side JS variable, and provider card HTML in the Configurator grid.
2. R2. Full Matrix Live Backtest (8/8 Providers):
   Create and execute tests/live_backtest_all_providers.js with real HTTP calls via local test server (app.listen(0)):
   - getCatalog() >= 1 item
   - getStreams() with known working slug/title -> proxy URL
   - Fetch .m3u8 manifest -> HTTP 200, '#EXTM3U'
   - Fetch at least 1 .ts video segment -> HTTP 200, size > 50 KB, first byte 0x47 or 0x89
   - At least 5 of 8 providers successfully download real .ts chunk > 50 KB.
   - Print Markdown Status Matrix table: Provider | Catalog | Stream Resolution | Chunk Download | Health
3. R3. Fallback Verification:
   Simulate expired/broken upstream CDN URL through local HLS proxy -> response NOT 502 (302 or non-crash error), cache purged (second call does not return cached broken result).
4. R4. Fix & Deploy:
   - Fix all bugs/edge cases found in source files.
   - npm test must pass with 0 failures.
   - Git push protocol:
     git remote set-url origin https://<TOKEN>@github.com/q121101-cloud/stremio-vip-addon.git
     git push origin main
     git remote set-url origin https://github.com/q121101-cloud/stremio-vip-addon.git
   - DO NOT commit .env or credentials.
   - All streams MUST use 'url' field (HLS Proxy). externalUrl is strictly forbidden.
