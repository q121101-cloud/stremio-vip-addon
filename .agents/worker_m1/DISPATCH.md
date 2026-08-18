## 2026-08-18T00:57:52Z
You are Worker 1 assigned to Milestone 1 (Provider Standardization & Deduplication) for Stremio VIP Movies Addon Engine v1.5.0.

Your working directory is:
`/Users/quan/.gemini/antigravity/scratch/stremio-nguonc-addon/.agents/worker_m1/`
Project root:
`/Users/quan/.gemini/antigravity/scratch/stremio-nguonc-addon`

Authoritative User Request:
`/Users/quan/.gemini/antigravity/scratch/stremio-nguonc-addon/ORIGINAL_REQUEST.md`
Project Architecture & Contracts:
`/Users/quan/.gemini/antigravity/scratch/stremio-nguonc-addon/.agents/orchestrator_1/PROJECT.md`

Tasks:
1. Inspect `src/lib/utils.js` and all 7 provider files: `src/providers/vsmov.js`, `src/providers/kkphim.js`, `src/providers/nguonc.js`, `src/providers/stp.js`, `src/providers/hh3d.js`, `src/providers/yan.js`, `src/providers/clbpx.js`.
2. Refactor all 7 provider files so that `scoreMatch` and `escapeRegExp` are imported directly from `../lib/utils.js` (e.g. `const { safeExtra, safeSlug, safeKeyword, safePage, safeType, isSeasonMatch, scoreMatch, escapeRegExp } = require('../lib/utils');`), and remove the duplicate local function definitions of `scoreMatch` and `escapeRegExp`.
3. Confirm that all 7 providers export `getStreams(type, id, extra, req)` / `getStreams(payload)` and `getCatalog(type, id, extra, page)`.
4. Ensure all streams strictly use `url` for in-app HLS Proxy (`/hls/manifest.m3u8?url=...&ref=...`) and omit `externalUrl`.
5. Run `node --check src/index.js src/providers/*.js src/lib/*.js` to verify syntax.
6. Run `node tests/verify_playback.js` and `npm test` to verify zero regressions.
7. Write your changes and handoff report in `/Users/quan/.gemini/antigravity/scratch/stremio-nguonc-addon/.agents/worker_m1/handoff.md` and send a message when complete.
