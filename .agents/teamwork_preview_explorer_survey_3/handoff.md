# Handoff Report: Architecture, Testing, Versioning & Deployment Survey

## 1. Observation
1. **Test Infrastructure**:
   - `package.json` line 9 defines `"test": "node src/test.js"`.
   - `tests/helpers.js` defines `TestRunner` (lines 15–162) and `startTestServer` (lines 167–174).
   - `tests/helpers.js` line 95 defines `assertStreamProtocol(stream, index)` enforcing that In-App HLS Proxy streams have `url` and strictly NO `externalUrl` (`stream.externalUrl === undefined`).
   - `npm test` runs `src/test.js` which boots an ephemeral Express instance on `app.listen(0)` and passed 50 assertions.
2. **VSMOV Multi-Server & Subtitles**:
   - Querying live VSMOV API with `vsmov.getByImdb('tt0373889')` (Harry Potter and the Order of the Phoenix) returns 2 distinct server groups:
     - `episodes[0].server_name`: `"Vietsub\n                        #1"` with `link_embed`: `"https://v5.streamvsmov.com/video/382f09db-83ff-4d89-9be9-797162d4f2e6"`.
     - `episodes[1].server_name`: `"Lồng tiếng #1"` with `link_embed`: `"https://v5.streamvsmov.com/video/9f623219-003a-4628-a72d-91461d3a1716"`.
   - Scraping the Vietsub embed player HTML returns `playerOptions.subtitles`:
     `[{"name":"vie 1785240078185 txr9be","type":"local","url":"/video/382f09db-83ff-4d89-9be9-797162d4f2e6/subtitle/vie_1785240078185_txr9be.vtt","_inSubtitleFolder":true,"code":"vie"}]`.
   - Fetching `https://v5.streamvsmov.com/video/382f09db-83ff-4d89-9be9-797162d4f2e6/subtitle/vie_1785240078185_txr9be.vtt` with headers `Referer: https://vsmov.com/` returns HTTP 200 with valid `WEBVTT` text.
3. **Current Versioning & UI Branding**:
   - `package.json` line 3: `"version": "1.5.0"`
   - `src/manifest.js` line 387: `version: '1.5.0'`
   - `src/handlers.js` line 314: `Hệ thống Trực tuyến &nbsp;·&nbsp; v1.5.0`
   - `src/handlers.js` line 436: `VIP Movies Addon v1.5.0 &bull; Powered by <span class="brand-highlight">Q121101</span>`
   - `src/index.js` line 105: `console.log('║      🎬  VIP Movies Stremio Addon  Engine v1.5.0     ║');`
4. **Git Repository Status**:
   - `git status` shows branch `main` up to date with `origin/main` (`https://github.com/q121101-cloud/stremio-vip-addon.git`).
   - `git config user.name` is `"NguonC Addon"`, `user.email` is `"addon@nguonc.local"`.

## 2. Logic Chain
1. *From Observation 1*: The test framework relies on standalone Node scripts starting ephemeral servers on port 0 (`app.listen(0)`), executing HTTP requests, asserting protocol compliance using `assertStreamProtocol`, and logging summary results. Therefore, `tests/verify_vsmov_sub_audio.js` should follow this established pattern using `TestRunner` and `startTestServer` (or `app.listen(0)`).
2. *From Observation 2*: VSMOV returns separate server tabs in `episodes` (`Vietsub`, `Lồng tiếng`, and/or `Thuyết minh`). By looping through each server group and parsing embed player HTML for `playerOptions.subtitles`, VSMOV provider can extract both audio streams and subtitle tracks. Subtitle URLs can be routed via `/hls/sub.vtt?url=${b64Sub}&ref=${b64Ref}` and attached to the stream object as `subtitles: [{ id: 'vi_vsmov', lang: 'vie', url: proxySubUrl }]`.
3. *From Observation 3*: Upgrading to v1.5.1 requires modifying `package.json`, `src/manifest.js`, `src/handlers.js`, and `src/index.js`. The brand signature in `src/handlers.js:436` must become `VIP Movies Addon v1.5.1 &bull; Powered by <span class="brand-highlight">Q121101</span>`.
4. *From Observation 4*: Git deployment is ready to execute via `git add . && git commit -m "Hotfix v1.5.1: Split VSMOV into distinct Vietsub, Long Tieng & Thuyet Minh 4K streams with Subtitle Proxy" && git push origin main`.

## 3. Caveats
- Some VSMOV entries might only have 1 audio tab (e.g. only Vietsub) or lack subtitle files. The scraper and parser must gracefully handle empty `playerOptions.subtitles` arrays and fallback cleanly without throwing uncaught errors.
- Network requests to `streamvsmov.com` require proper `Referer: https://vsmov.com/` and Chrome User-Agent headers to avoid HTTP 403.

## 4. Conclusion
The codebase is clean, well-structured, and fully prepared for Hotfix v1.5.1 implementation. The exact requirements for multi-server audio tab separation, subtitle extraction and proxying, E2E test verification (`tests/verify_vsmov_sub_audio.js`), version bumping, UI branding preservation, and git deployment have been verified and documented.

## 5. Verification Method
1. Syntax check:
   `node --check src/index.js && node --check src/manifest.js && node --check src/handlers.js && node --check src/routes/hls.js && node --check src/providers/vsmov.js`
2. Existing integration test suite:
   `npm test`
3. Targeted E2E test execution:
   `node tests/verify_vsmov_sub_audio.js`
4. Inspect analysis artifact:
   `view_file` on `/Users/quan/.gemini/antigravity/scratch/stremio-nguonc-addon/.agents/teamwork_preview_explorer_survey_3/analysis.md`
