# BRIEFING — 2026-08-18T09:52:30Z

## Mission
Investigate HTML Cheerio Scrapers & Provider Architecture for STP, CLBPX, YAN, and base provider classes to guide implementation for v1.7.0.

## 🔒 My Identity
- Archetype: explorer
- Roles: survey, code_analysis
- Working directory: /Users/quan/.gemini/antigravity/scratch/stremio-nguonc-addon/.agents/explorer_survey_providers
- Original parent: df6b69f2-b4cb-483e-b97e-e806a40c0155
- Milestone: survey_providers

## 🔒 Key Constraints
- Read-only investigation — do NOT implement
- Analyze STP (sieutamphim.pro), CLBPX (clbphimxua.info), YAN (yanhh3d.pw)
- Check getCatalog and getStreams implementations vs requirements
- Analyze real HTML structure scraping with cheerio and axios
- Check strict Donghua-only guard on YAN

## Current Parent
- Conversation ID: df6b69f2-b4cb-483e-b97e-e806a40c0155
- Updated: 2026-08-18T09:52:30Z

## Investigation State
- **Explored paths**:
  - `src/providers/stp.js`, `src/providers/clbpx.js`, `src/providers/yan.js`, `src/providers/vsmov.js`, `src/providers/kkphim.js`, `src/providers/nguonc.js`
  - `src/handlers.js`, `src/manifest.js`, `src/routes/hls.js`, `package.json`
  - Live HTTP endpoints on `https://sieutamphim.pro`, `https://clbphimxua.info`, `https://yanhh3d.pw`
- **Key findings**:
  - STP: WordPress SSR with `div.post-item` cards, `div.episodeGroup` with XOR 0x2a decoded data-episodes.
  - CLBPX: HalimMovies theme with 5-step stream pipeline (`clbphimxua.info` -> watch -> `player.php` -> StreamC `data-obf` -> direct M3U8 with 750+ segments).
  - YAN: 3D Donghua scraper with `fbcdn.cloud` embeds + Strict Donghua Guard (`isDonghuaOrAnime` checking `genres` and keywords to filter KDrama/US-UK).
  - Cheerio is not in `package.json`/`node_modules`; can be added or parsed via robust DOM/regex parser.
- **Unexplored areas**: None for provider survey.

## Key Decisions Made
- Documented exact DOM selectors, XOR 0x2a decoder, StreamC base64 pipeline, and Strict Donghua Guard logic in `analysis.md` and `handoff.md`.

## Artifact Index
- `.agents/explorer_survey_providers/DISPATCH.md`
- `.agents/explorer_survey_providers/BRIEFING.md`
- `.agents/explorer_survey_providers/progress.md`
- `.agents/explorer_survey_providers/analysis.md`
- `.agents/explorer_survey_providers/handoff.md`
