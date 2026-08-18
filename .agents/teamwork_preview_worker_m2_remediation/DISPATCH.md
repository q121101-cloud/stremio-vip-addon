## 2026-08-18T04:09:29Z
You are a Worker agent completing the implementation, versioning, and verification for Hotfix v1.5.2.
Your working directory is: /Users/quan/.gemini/antigravity/scratch/stremio-nguonc-addon/.agents/teamwork_preview_worker_m2_remediation

Read the following files:
- `/Users/quan/.gemini/antigravity/scratch/stremio-nguonc-addon/.agents/ORIGINAL_REQUEST.md`
- `/Users/quan/.gemini/antigravity/scratch/stremio-nguonc-addon/.agents/explorer_survey_kkphim/survey_report.md`
- `/Users/quan/.gemini/antigravity/scratch/stremio-nguonc-addon/.agents/explorer_survey_vsmov/survey_report.md`
- `/Users/quan/.gemini/antigravity/scratch/stremio-nguonc-addon/.agents/teamwork_preview_orchestrator_1/PROJECT.md`

MANDATORY INTEGRITY WARNING:
DO NOT CHEAT. All implementations must be genuine. DO NOT hardcode test results, create dummy/facade implementations, or circumvent the intended task. A teamwork_preview_auditor will independently verify your work. Integrity violations WILL be detected and your work WILL be rejected.

Your tasks:
1. In `src/providers/kkphim.js`:
   - Import `resolveCinemeta` alongside `getCachedCinemeta` from `../lib/cinemeta`.
   - In `getStreams()` (and `getByImdb()` if applicable):
     - Tier 1: Direct lookup by IMDb ID via `https://phimapi.com/imdb/title/:imdbId`.
     - Tier 2: If Tier 1 fails or returns no stream, resolve Cinemeta metadata async via `resolveCinemeta(type, imdbId)` to get canonical name, year, and aliases. Search `/v1/api/tim-kiem?keyword=...` for candidate items across `[meta.name, ...(meta.aliases || [])]`. Score each candidate with `scoreMatch(item, meta.name || q, year, season)`. Pick the best matching candidate (bestScore >= 0.45), fetch details via `getDetail(bestItem.slug)`, cache to `imdbCache.set('kkphim:imdb:' + cleanImdb, movieData, 86400)`, and proceed to stream extraction.
     - Tier 3: If all fail, return safe empty array `[]` (no crash, no 404 stream).
   - Ensure flexible episode matching `matchEpisodeItem` for series: `"1"`, `"01"`, `"Tập 1"`, `"tap-1"`, `"tap-01"`, regex numbers, and 1-based index fallback.
2. In `src/providers/vsmov.js` & `src/routes/hls.js`:
   - Ensure VSMOV subtitle extraction (`.vtt` / `.srt`), proxy URL creation (`/hls/sub.vtt`), `subtitles: [{ id: "vi_vsmov", lang: "vie", url: proxySubUrl, title: "Tiếng Việt (VSMOV VIP)" }]`, and Master M3U8 `#EXT-X-MEDIA:TYPE=SUBTITLES` insertion are 100% compliant.
3. Update version to `"1.5.2"` across:
   - `package.json` (`"version": "1.5.2"`)
   - `src/manifest.js` (`version: '1.5.2'`)
   - `src/handlers.js`, `src/index.js`, `src/config.js` (header / banner version strings)
4. Execute and verify all tests:
   - Run `node --check src/index.js`
   - Run `node --check src/providers/kkphim.js`
   - Run `node --check src/providers/vsmov.js`
   - Run `node --check src/routes/hls.js`
   - Run `node tests/verify_hotfix_vsmov_kkphim.js` (must pass 100% with exit code 0)
   - Run `node tests/verify_playback.js` (must pass 7/7 phases)
   - Run `npm test` (or `node src/test.js`)
5. Git commit & push:
   - Execute: `git add . && git commit -m "Hotfix v1.5.2: Injected VSMOV 4K WebVTT Subtitles into HLS/Stremio & Added KKPhim Smart-Search Fallback against 404" && git push origin main`
6. Write full handoff report to `/Users/quan/.gemini/antigravity/scratch/stremio-nguonc-addon/.agents/teamwork_preview_worker_m2_remediation/handoff.md`.
