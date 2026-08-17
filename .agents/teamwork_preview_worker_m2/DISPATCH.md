## Milestone 2 Worker Dispatch: Robust Multi-Provider Isolation
Working Directory: /Users/quan/.gemini/antigravity/scratch/stremio-nguonc-addon
Agent Directory: /Users/quan/.gemini/antigravity/scratch/stremio-nguonc-addon/.agents/teamwork_preview_worker_m2
Exclusive Write Ownership: `src/providers/kkphim.js`, `src/providers/nguonc.js`, `src/providers/vsmov.js`

References:
- /Users/quan/.gemini/antigravity/scratch/stremio-nguonc-addon/.agents/ORIGINAL_REQUEST.md
- /Users/quan/.gemini/antigravity/scratch/stremio-nguonc-addon/PROJECT.md
- /Users/quan/.gemini/antigravity/scratch/stremio-nguonc-addon/.agents/teamwork_preview_explorer_survey_2/handoff.md
- /Users/quan/.gemini/antigravity/scratch/stremio-nguonc-addon/src/lib/cinemeta.js

Task:
1. Wrap all provider logic in individual `try...catch` blocks with strict 5-second axios timeouts (`timeout: 5000`) so failure/timeout in one source never blocks or crashes other sources. Return `[]` gracefully on errors.
2. **KKPhim** (`src/providers/kkphim.js`):
   - Try direct IMDb lookup (`/imdb/title/${imdbId}`) -> fallback to Cinemeta canonical title search (`/v1/api/tim-kiem?keyword=...`) -> match canonical year & slug.
   - Return all available servers (Vietsub, Thuyết Minh, Lồng Tiếng).
   - Format stream titles per R3:
     - HLS Proxy: `[VIP • KKPhim] ${cleanServerName}${epLabel} (HLS Proxy)\n⚡ Phát trực tiếp trong App` (with `url`, NO `externalUrl`).
     - Embed Player: `[Dự phòng • KKPhim] ${cleanServerName}${epLabel} (Embed Player)\n🌐 Bấm để mở xem ngoài trình duyệt web` (with `externalUrl`, NO `url`).
3. **NguonC** (`src/providers/nguonc.js`):
   - Search with Cinemeta canonical title (`/films/search?keyword=...`) -> match year/title -> return both Vietsub & Thuyết Minh servers.
   - Format stream titles per R3:
     - HLS Proxy: `[VIP • NguonC] ${serverName}${epLabel} (HLS Proxy)\n⚡ Phát trực tiếp trong App` (with `url`, NO `externalUrl`).
     - Embed Player: `[Dự phòng • NguonC] ${serverName}${epLabel} (Embed Player)\n🌐 Bấm để mở xem ngoài trình duyệt web` (with `externalUrl`, NO `url`).
4. **VSMOV** (`src/providers/vsmov.js`):
   - Multi-gateway scraper (`https://vsmov.com`, `https://streamvsmov.com`, `https://vsmov.net`) with 5s timeout.
   - Extract 1080p `master.m3u8` stream.
   - Format stream titles per R3:
     - HLS Proxy: `[VIP • VsMov] Vietsub Full HD (HLS Proxy)\n⚡ Phát trực tiếp trong App` (with `url: "${proxyBase}/hls/manifest.m3u8?url=${b64Url}&ref=${b64Ref}"`, NO `externalUrl`).
     - Embed Player (if any): `[Dự phòng • VsMov] ... (Embed Player)\n🌐 Bấm để mở xem ngoài trình duyệt web` (with `externalUrl`, NO `url`).
5. Verify syntax with `node --check src/providers/kkphim.js`, `node --check src/providers/nguonc.js`, `node --check src/providers/vsmov.js`.
6. Write handoff report in `.agents/teamwork_preview_worker_m2/handoff.md`.

MANDATORY INTEGRITY WARNING:
DO NOT CHEAT. All implementations must be genuine. DO NOT hardcode test results, create dummy/facade implementations, or circumvent the intended task. A auditor will independently verify your work. Integrity violations WILL be detected and your work WILL be rejected.
