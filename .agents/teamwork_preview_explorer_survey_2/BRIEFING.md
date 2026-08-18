# BRIEFING — 2026-08-18T17:18:30Z

## Mission
Conduct a detailed code audit of `src/routes/hls.js` and related stream proxying logic focusing on upstream >= 400 error handling, cache purging, segment proxying & rewriting, and potential 502/crash scenarios.

## 🔒 My Identity
- Archetype: explorer
- Roles: read-only investigation, code audit, synthesis, structured handoff reporting
- Working directory: /Users/quan/.gemini/antigravity/scratch/stremio-nguonc-addon/.agents/teamwork_preview_explorer_survey_2
- Original parent: cdcbc7a1-f5e9-482f-bf54-d9f2d980736c
- Milestone: HLS Proxy & Stream Logic Code Audit

## 🔒 Key Constraints
- Read-only investigation — do NOT implement / modify source code
- Files for content delivery, messages for coordination
- Deliver 5-component handoff report (Observation, Logic Chain, Caveats, Conclusion, Verification Method) in handoff.md
- Update progress.md and BRIEFING.md

## Current Parent
- Conversation ID: cdcbc7a1-f5e9-482f-bf54-d9f2d980736c
- Updated: 2026-08-18T17:18:30Z

## Investigation State
- **Explored paths**:
  - `src/routes/hls.js` (Lines 1-591: /extract, /manifest.m3u8, /segment.ts, /key, /sub.vtt, getRefererHeaders, resolveParamUrl)
  - `src/lib/cache.js` & `src/lib/cloudCache.js` (LRUCache, HybridCache, m3u8Cache instance)
  - `src/mapper.js` (extractM3u8FromEmbed, buildStreams)
  - `src/handlers.js` (Stream Aggregator, getStreamPriority, handleStream)
  - `src/providers/*.js` (film4k, vsmov, kkphim, nguonc, stp, hh3d, yan, clbpx)
  - `src/manifest.js` & `src/config.js`
  - `tests/hls_challenger_empirical.test.js`, `tests/forensic_hls_audit.js`
- **Key findings**:
  1. Upstream HTTP >= 400 in `/manifest.m3u8` is caught via axios error handling, purges cache via `m3u8Cache.del(cacheKey)`, and gracefully redirects via `res.redirect(302, targetUrl)` if targetUrl is a valid http(s) URL.
  2. Edge case bug: If upstream CDN returns HTTP 200 with HTML (e.g. Cloudflare challenge/block page) and de-embedding fails, `/manifest.m3u8` treats HTML lines as TS segment URLs, caches the corrupted manifest in `m3u8Cache` for 300s, and serves it with `Content-Type: application/vnd.apple.mpegurl`.
  3. Inconsistent 302 fallback in `/segment.ts` (lines 464-466), `/key` (lines 504-505), and `/extract` (lines 140-151), which return HTTP 502 instead of self-healing 302 redirect.
  4. Header forwarding & Anti-403 logic: `SOURCE_REFERERS` supports all 8 providers with accurate Referer and Origin headers; Range 206 seeking is supported with upstream forwarding and local buffer-slicing fallback.
  5. `extractM3u8FromEmbed(targetUrl, refererUrl)` in `src/routes/hls.js:198` passes 2 arguments, but `src/mapper.js:280` only takes 1 argument and hardcodes `Referer: 'https://phim.nguonc.com/'`.
- **Unexplored areas**: None. Code audit of `src/routes/hls.js` and all related modules is complete.

## Key Decisions Made
- Verified all 5 endpoints in `src/routes/hls.js` empirically via live Express test servers.

## Artifact Index
- `/Users/quan/.gemini/antigravity/scratch/stremio-nguonc-addon/.agents/teamwork_preview_explorer_survey_2/DISPATCH.md` — Inbound dispatch record
- `/Users/quan/.gemini/antigravity/scratch/stremio-nguonc-addon/.agents/teamwork_preview_explorer_survey_2/BRIEFING.md` — Situational awareness
- `/Users/quan/.gemini/antigravity/scratch/stremio-nguonc-addon/.agents/teamwork_preview_explorer_survey_2/progress.md` — Liveness & step tracking
- `/Users/quan/.gemini/antigravity/scratch/stremio-nguonc-addon/.agents/teamwork_preview_explorer_survey_2/handoff.md` — Comprehensive Handoff Report
