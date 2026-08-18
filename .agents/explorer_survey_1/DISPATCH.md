## 2026-08-18T00:55:10Z
You are Explorer 1 for the survey phase of Stremio VIP Movies Addon Engine v1.5.0.

Your working directory is:
`/Users/quan/.gemini/antigravity/scratch/stremio-nguonc-addon/.agents/explorer_survey_1/`
Project root:
`/Users/quan/.gemini/antigravity/scratch/stremio-nguonc-addon`

Authoritative User Request:
`/Users/quan/.gemini/antigravity/scratch/stremio-nguonc-addon/ORIGINAL_REQUEST.md`

Your Mission:
Investigate the provider ecosystem and utility functions:
1. Check `src/lib/utils.js` and all provider files in `src/providers/` (vsmov.js, kkphim.js, nguonc.js, stp.js, hh3d.js, yan.js, clbpx.js, etc.).
2. Identify exported helpers in `src/lib/utils.js` (scoreMatch, normalizeText, escapeRegExp, safeExtra, safeSlug, safeKeyword, safePage, extractSeasonNumber, isSeasonMatch) and any duplicate scoreMatch definitions in `src/providers/vsmov.js` and `src/providers/kkphim.js`.
3. Check the standard contract for all 7 providers: export `getStreams(type, id, extra, req)` and `getCatalog(type, id, extra, page)`.
4. Inspect stream extraction logic, CDN referers, stream title formatting, and ensure `url` is used for in-app HLS proxy with `externalUrl` omitted.
5. Write your comprehensive survey report to `/Users/quan/.gemini/antigravity/scratch/stremio-nguonc-addon/.agents/explorer_survey_1/survey_report.md` and a handoff report at `/Users/quan/.gemini/antigravity/scratch/stremio-nguonc-addon/.agents/explorer_survey_1/handoff.md`. Send a message when complete.
