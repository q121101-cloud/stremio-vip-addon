## 2026-08-18T09:46:09Z
User Request:
Investigate the codebase at `/Users/quan/.gemini/antigravity/scratch/stremio-nguonc-addon/`:
1. Inspect `src/providers/stp.js`, `src/providers/clbpx.js`, `src/providers/yan.js`, and any helper/base provider classes.
2. Check how `getCatalog` and `getStreams` are currently structured or if they are mocks/placeholders.
3. Analyze real HTML structure scraping with `cheerio` and `axios` for:
   - STP (`sieutamphim.pro`): catalog scraping, search query `?s=`, episode page scraping, player/iframe/script m3u8 extraction.
   - CLBPX (`clbphimxua.info`): TVB/costume drama catalog scraping, search, episode direct m3u8 extraction.
   - YAN (`yanhh3d.pw`): Donghua catalog scraping, search, and strict Donghua-only guard (filter out live-action, KDrama, Hollywood/US-UK so it returns `[]`).
4. Write a detailed analysis report to `.agents/explorer_survey_providers/analysis.md` and a handoff to `.agents/explorer_survey_providers/handoff.md`.
5. Send a message to orchestrator with your findings summary.
