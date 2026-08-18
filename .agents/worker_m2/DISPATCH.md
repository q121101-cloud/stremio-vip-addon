## 2026-08-18T09:52:50Z
You are Worker M2 (Real Cheerio HTML Scrapers for STP, CLBPX, YAN).
Your working directory is `/Users/quan/.gemini/antigravity/scratch/stremio-nguonc-addon/.agents/worker_m2/`.
Read `/Users/quan/.gemini/antigravity/scratch/stremio-nguonc-addon/.agents/ORIGINAL_REQUEST.md` and `/Users/quan/.gemini/antigravity/scratch/stremio-nguonc-addon/PROJECT.md`.
Read Explorer 2 analysis at `/Users/quan/.gemini/antigravity/scratch/stremio-nguonc-addon/.agents/explorer_survey_providers/analysis.md`.

MANDATORY INTEGRITY WARNING:
DO NOT CHEAT. All implementations must be genuine. DO NOT hardcode test results, create dummy/facade implementations, or circumvent the intended task. An auditor will independently verify your work. Integrity violations WILL be detected and your work WILL be rejected.

File ownership:
You exclusively own and modify:
- `src/providers/stp.js`
- `src/providers/clbpx.js`
- `src/providers/yan.js`

Requirements to implement:
1. `src/providers/stp.js` (sieutamphim.pro):
   - `getCatalog(type, id, extra)`: Fetch HTML from `https://sieutamphim.pro/` or category pages, parse card items (`div.col.post-item` or similar) with poster, title, slug/url, returning Stremio meta format.
   - `getStreams(type, id, meta)`: Search via `https://sieutamphim.pro/?s=${encodeURIComponent(cleanTitle)}`, fetch episode page, extract stream links via XOR 0x2a decode / player iframe / script.
2. `src/providers/clbpx.js` (clbphimxua.info):
   - `getCatalog(type, id, extra)`: Scrape TVB/Costume drama catalog from `https://clbphimxua.info/`.
   - `getStreams(type, id, meta)`: Search, scrape episode page, extract direct M3U8 (StreamC `data-obf` resolution / player.php AJAX).
3. `src/providers/yan.js` (yanhh3d.pw):
   - `getCatalog(type, id, extra)`: Scrape Donghua homepage / categories from `https://yanhh3d.pw/`.
   - `getStreams(type, id, meta)`: Search and extract episode M3U8 from `fbcdn.cloud` embeds.
   - **STRICT GUARD**: Check genre/title. If the request is for Live-Action (phim người đóng), KDrama, Hollywood/US-UK, IMMEDIATELY return `[]` (zero streams). Only process queries matching Donghua/Hoạt hình 3D/Anime.
4. Run syntax check (`node --check src/index.js`) and tests (`npm test`).
5. Write your implementation report to `.agents/worker_m2/changes.md` and handoff report to `.agents/worker_m2/handoff.md`.
6. Send a message to orchestrator when complete.
