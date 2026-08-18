# Handoff Report: Survey Explorer 2 (HTML Scrapers & Provider Architecture)

## 1. Observation

1. **Current Codebase Status**:
   - `src/providers/stp.js:276-327`: `getCatalog` currently delegates to `https://phimapi.com/v1/api/quoc-gia/${countrySlug}` rather than scraping `sieutamphim.pro` directly. Post content parsing uses regex to locate `div.episodeGroup` and decode `data-episodes` using XOR 0x2a (`decodeXor0x2a` at line 65).
   - `src/providers/clbpx.js:150-201`: `getCatalog` currently delegates to `https://phimapi.com/v1/api/quoc-gia/hong-kong` or `the-loai/co-trang`. `search` has a Tier 2 HTML scraper (`clbphimxua.info/?s=`), but `getStreams` relies predominantly on `phimapi.com/phim/${cleanSlug}`.
   - `src/providers/yan.js:216-262`: `getCatalog` currently calls `https://phimapi.com/v1/api/danh-sach/hoat-hinh`. `extractYanLiveStreams` at line 95 probes `https://yanhh3d.pw/${slug}/tap-${episodeNum}`, which failed with HTTP 404 for certain slugs in `tests/verify_all_providers_playback.js` because static routes were not fully filtered or episode slugs differ.
   - `package.json:22-26`: Dependencies are `axios: ^1.7.7`, `cors: ^2.8.5`, `express: ^4.21.1`, `node-cache: ^5.1.2`. `cheerio` is currently NOT installed in `package.json` or `node_modules` (`MODULE_NOT_FOUND`).

2. **Live Domain Probing Results**:
   - **STP (`https://sieutamphim.pro`)**:
     * `GET https://sieutamphim.pro/` -> HTTP 200 (length 1,030,144 bytes).
     * Card structure: `<div class="col post-item">` containing `<a href="...html">`, `<img src="...">`, and `<h5 class="post-title..."><a ...>Title</a></h5>`.
     * Post page contains: `<div class="episodeGroup" data-server="fm" data-episodes='[ {"B^^ZY   HSYO\\OZECD IEG O KA_CIDESIF","Full"}, ]'>`.
     * XOR 0x2a decoded: `"B^^ZY   HSYO\\OZECD IEG O KA_CIDESIF"` -> `https://bysevepoin.com/e/akui1icnoycl`.
   - **CLBPX (`https://clbphimxua.info`)**:
     * `GET https://clbphimxua.info/?s=thien+long` -> HTTP 200 (length 178,798 bytes), 20 card matches.
     * Film detail page: `<a href="https://clbphimxua.info/xem-phim-thien-long-bat-bo-kieu-phong-truyen-2/full-sv1.html">Xem phim</a>`.
     * Watch page contains `var halim_cfg = { post_id: 24545, episode_slug: 'full', server: '1', player_url: 'https://clbphimxua.info/wp-content/themes/halimmovies/player.php' }`.
     * `GET https://clbphimxua.info/wp-content/themes/halimmovies/player.php?episode_slug=full&server_id=1&post_id=24545` -> returns `<iframe class="embed-responsive-item" src="https://embed3.streamc.xyz/embed.php?hash=26e0f8e5178611788b36ff0647cdd5b2"></iframe>`.
     * StreamC embed page: contains `<div id="player" data-obf="...">`.
     * Decoded `data-obf` yields `sUb`, and `GET https://embed3.streamc.xyz/${sUb}` returns full M3U8 with 751 segments.
   - **YAN (`https://yanhh3d.pw`)**:
     * `GET https://yanhh3d.pw/search?keysearch=dau+la` -> HTTP 200.
     * Real cards: `dau-la-dai-luc`, `the-gioi-hoan-my`, `tien-nghich`, `pham-nhan-tu-tien`.
     * Episode page `https://yanhh3d.pw/dau-la-dai-luc/tap-263` contains `<div id="sv_LINK4" name="LINK4" data-src="https://scontent-sin2-3-xx.fbcdn.cloud/o1/v/t2/f2/m366/f59c7756-abfe-45e4-956b-94124b2e1e7f.m3u8">`.
     * Fetching `data-src` yields `var cccc = "https://scontent-sin2-3-xx.fbcdn.cloud/stream/m3u8/f59c7756-abfe-45e4-956b-94124b2e1e7f.m3u8"`.
     * Direct M3U8 fetch returns HTTP 200 with media sequence.

3. **Test Suite Baseline**:
   - `npm test` (`node src/test.js`) executed with 50/50 PASS (100%).
   - `node tests/verify_all_providers_playback.js` executed with 44/44 PASS (100%) in 16.27s across all 6 provider clusters.

---

## 2. Logic Chain

1. **Premise**: Requirement R2 mandates true HTML scrapers for STP, CLBPX, and YAN with Cheerio/HTML parsing and a Strict Donghua Guard for YAN.
2. **STP Analysis (Observation 1, 2)**:
   - STP website is active and serves HTML with `div.post-item` cards on category pages and `div.episodeGroup` with XOR 0x2a encoded links on post pages.
   - Implementing direct HTML catalog scraping (`/the-loai/...`) and search query scraping (`/?s=...`) fulfills R2 [A].
3. **CLBPX Analysis (Observation 1, 2)**:
   - CLBPX uses a HalimMovies WordPress theme. The full resolution path from search -> detail -> watch -> `player.php` -> StreamC `data-obf` -> direct M3U8 was empirically verified and produced 751 playable segments.
   - Implementing this 5-step resolver fulfills R2 [B].
4. **YAN Analysis & Strict Guard (Observation 1, 2)**:
   - YAN serves 3D Donghua streams via `fbcdn.cloud` embeds.
   - To prevent false-positive matching for live-action KDrama and US-UK titles (Requirement R2 [C] & R4.4), `isDonghuaOrAnime(title, genres)` must check `genres` for `Animation` and filter non-Donghua titles before running scrapers.
5. **Dependency Strategy (Observation 1)**:
   - `cheerio` is not yet in `package.json`. If worker chooses to use `cheerio`, `npm install cheerio` is required. Alternatively, lightweight balanced-brace JSON extractors and regex DOM parsers can achieve the exact same result with zero external dependencies.

---

## 3. Caveats

1. **Dynamic Content & Server Selectors**: Embed server hosts on STP (`bysevepoin.com`, `short.ink`) and YAN (`fbcdn.cloud`, `abysscdn.com`) occasionally change or rotate CDNs. The Multi-tier architecture (Tier 1 Live Scrape -> Tier 2 Ophim/PhimAPI -> Tier 3 Safe `[]`) must be preserved to guarantee zero crashes and high availability.
2. **Cheerio Package Dependency**: If the implementer adds `cheerio` to `package.json`, ensure `npm install` is run and committed.

---

## 4. Conclusion

1. **STP (`src/providers/stp.js`)**: Scrape `https://sieutamphim.pro/` / `the-loai/` directly for `getCatalog`, search `/?s=...`, and decode `data-episodes` using XOR 0x2a for `getStreams`.
2. **CLBPX (`src/providers/clbpx.js`)**: Scrape `https://clbphimxua.info/` for `getCatalog`, and resolve streams through `player.php` -> StreamC `data-obf` -> direct M3U8 for `getStreams`.
3. **YAN (`src/providers/yan.js`)**: Enforce `isDonghuaOrAnime` at `getStreams` entry (returning `[]` for KDrama/US-UK/Live-action) and scrape `yanhh3d.pw` for Donghua titles.
4. **Resilience**: Maintain Tier 2 fallback to ensure 100% uptime across all 22 catalogs.

---

## 5. Verification Method

To verify these findings and scrapers:
```bash
# 1. Run integration tests (50 tests)
npm test

# 2. Run comprehensive 6-provider E2E playback verification (44 assertions)
node tests/verify_all_providers_playback.js

# 3. Check 22 catalogs routing
node tests/test_routing_and_22_catalogs.js

# 4. Verify syntax
node --check src/providers/stp.js
node --check src/providers/clbpx.js
node --check src/providers/yan.js
```
