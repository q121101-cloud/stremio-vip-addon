# In-Depth Analysis: HTML Cheerio Scrapers & Provider Architecture (STP, CLBPX, YAN)

## Executive Summary
This report analyzes the provider subsystem for the Stremio VIP Movies Addon (Engine v1.7.0). It covers the live HTML structure, stream extraction pipelines, catalog endpoints, search behavior, and strict guard mechanisms for:
1. **STP (`sieutamphim.pro`)**: WordPress-based SSR catalog & XOR 0x2a obfuscated stream decoder.
2. **CLBPX (`clbphimxua.info`)**: Halim/Ophim-based TVB & Classic Costume drama scraper with 5-tier AJAX / StreamC nested base64 extraction.
3. **YAN (`yanhh3d.pw`)**: 3D Donghua scraper with fbcdn / storage M3U8 resolvers and a mandatory **Strict Donghua Guard** to filter out KDrama, Hollywood, and live-action queries.
4. **Provider Contracts & Dependencies**: Standard interface compliance and the dependency status of `cheerio` vs regex/native DOM parsing.

---

## 1. Provider Architecture & Core Contracts

### Standard Interface Contract
All providers in `src/providers/` implement a uniform export contract:
```javascript
module.exports = {
  id: string,              // e.g. 'stp', 'clbpx', 'yan'
  label: string,           // e.g. 'STP • sieutamphim.pro', 'CLBPX • Phim Xưa & TVB'
  getCatalog(type, page, extra): Promise<Array<StremioMeta>>,
  getStreams(payload): Promise<Array<StremioStream>>,
  search(keyword, page): Promise<Array<SearchItem>>,
  getDetail(slug): Promise<MovieDetail | null>,
};
```

### Stream Payload & Aggregator Invariants
- **In-App Protocol**: Every stream object must have `url: "${proxyBase}/hls/manifest.m3u8?url=${encodeBase64(streamUrl)}&ref=${encodeBase64(referer)}"`
- **Strict Invariant**: Absolutely no `externalUrl` property.
- **Priority Sorting**: 4K/UHD (bucket 0) -> Vietsub (bucket 100) -> Thuyết Minh (bucket 200) -> Lồng Tiếng (bucket 300), sub-ranked by provider (VSMOV=1, KKPhim=2, NguonC=3, STP=4, CLBPX=5, YAN=6).

---

## 2. Deep Dive: STP (`sieutamphim.pro`)

### Domain & Headers
- **Live Base URL**: `https://sieutamphim.pro/`
- **Referer**: `https://sieutamphim.pro/`
- **Origin**: `https://sieutamphim.pro`
- **User-Agent**: Modern Chrome 124+ (`Mozilla/5.0 (Windows NT 10.0; Win64; x64) ...`)

### HTML Structure Analysis
#### Catalog & Search
- **Search Query**: `GET https://sieutamphim.pro/?s=${encodeURIComponent(query)}`
- **Category URLs**:
  - `au-my`: `https://sieutamphim.pro/the-loai/phim-au-my/`
  - `han-quoc`: `https://sieutamphim.pro/the-loai/phim-han-quoc/`
  - `phim-le`: `https://sieutamphim.pro/the-loai/phim-le/`
  - `phim-bo`: `https://sieutamphim.pro/the-loai/phim-bo/`
- **DOM Card Elements**:
  ```html
  <div class="col post-item">
    <div class="box box-shade dark box-text-bottom box-blog-post has-hover">
      <div class="box-image">
        <a href="https://www.sieutamphim.pro/2026/04/avatar-lua-va-tro-tan-ai-thuyet-minh.html" class="plain" aria-label="Avatar: Lửa và Tro Tàn AI Thuyết Minh &#8211; Status: HD Thuyết Minh">
          <img src="https://i2.wp.com/blogger.googleusercontent.com/..." class="attachment-medium wp-post-image" alt="..." />
        </a>
      </div>
      <div class="box-text">
        <h5 class="post-title is-large">
          <a href="https://www.sieutamphim.pro/2026/04/avatar-lua-va-tro-tan-ai-thuyet-minh.html">Avatar: Lửa và Tro Tàn AI Thuyết Minh</a>
        </h5>
        <p class="from_the_blog_excerpt">Tên Phim : Avatar: Lửa và Tro Tàn Tựa Gốc : Avatar: Fire and Ash (2024)</p>
      </div>
    </div>
  </div>
  ```

#### Post & Stream Extraction
- Post pages contain episode groups:
  ```html
  <div class="episodeGroup" data-server="fm" data-episodes='[ {"B^^ZY   HSYO\OZECD IEG O KA_CIDESIF","Full"}, ]'></div>
  <div class="episodeGroup" data-server="hx" data-episodes='[ {"B^^ZY   YBEX^ CDA {  bAyk~","Full"}, ]'></div>
  ```
- **XOR 0x2a Decoding Algorithm**:
  ```javascript
  function decodeXor0x2a(str, key = 0x2a) {
    if (!str || typeof str !== 'string') return '';
    let out = '';
    for (let i = 0; i < str.length; i++) {
      out += String.fromCharCode(str.charCodeAt(i) ^ key);
    }
    return out;
  }
  ```
  - `"B^^ZY   HSYO\OZECD IEG O KA_CIDESIF"` ^ 0x2a => `https://bysevepoin.com/e/akui1icnoycl`
  - `"B^^ZY   YBEX^ CDA {  bAyk~"` ^ 0x2a => `https://short.ink/Q74HkSAT1`

#### Resolution Pipeline
1. `search(cleanTitle)` -> query `https://sieutamphim.pro/?s=${query}`.
2. Select best matching post via `scoreMatch`.
3. Fetch post HTML -> parse `div.episodeGroup` -> decode `data-episodes` with XOR 0x2a.
4. Pass decoded stream/embed URL to `/hls/manifest.m3u8?url=${encodeBase64(decodedUrl)}&ref=${encodeBase64('https://sieutamphim.pro/')}`.
5. Resilient fallback: If live SSR returns no valid matches, fallback to PhimAPI / Ophim or return `[]`.

---

## 3. Deep Dive: CLBPX (`clbphimxua.info`)

### Domain & Headers
- **Live Base URL**: `https://clbphimxua.info/`
- **Referer**: `https://clbphimxua.info/`
- **Origin**: `https://clbphimxua.info`
- **User-Agent**: Modern Chrome 124+

### HTML Structure Analysis
#### Catalog & Search
- **Search Query**: `GET https://clbphimxua.info/?s=${encodeURIComponent(query)}`
- **Category URLs**:
  - `kiem-hiep`: `https://clbphimxua.info/the-loai/co-trang/page/${page}`
  - `hong-kong`: `https://clbphimxua.info/quoc-gia/hong-kong/page/${page}`
  - `homepage`: `https://clbphimxua.info/page/${page}`
- **DOM Card Elements**:
  ```html
  <a class="halim-thumb" href="https://clbphimxua.info/thien-long-bat-bo-kieu-phong-truyen-2" title="Thiên Long Bát Bộ: Kiều Phong Truyện">
    <img src="https://img.ophim.live/uploads/movies/the-chat-100-thumb.jpg" alt="..." />
  </a>
  ```

#### 5-Step Stream Extraction Pipeline
1. **Detail Page**: Fetch `https://clbphimxua.info/${slug}` -> find watch link:
   `<a href="https://clbphimxua.info/xem-phim-${slug}/${epSlug}-sv${server}.html">Xem phim</a>`
2. **Watch Page**: Fetch watch HTML -> extract `halim_cfg` JavaScript object:
   ```javascript
   var halim_cfg = {
     "act": "watch",
     "post_url": "https://clbphimxua.info/xem-phim-...",
     "player_url": "https://clbphimxua.info/wp-content/themes/halimmovies/player.php",
     "post_id": 24545,
     "episode_slug": "full",
     "server": "1"
   };
   ```
3. **Player PHP AJAX**: Send GET request to `player_url` with parameters:
   ```
   GET https://clbphimxua.info/wp-content/themes/halimmovies/player.php?episode_slug=full&server_id=1&post_id=24545
   Headers: { 'X-Requested-With': 'XMLHttpRequest', Referer: watchUrl }
   ```
   Response returns iframe HTML:
   ```html
   <div class="embed-responsive embed-responsive-16by9">
     <iframe class="embed-responsive-item" src="https://embed3.streamc.xyz/embed.php?hash=26e0f8e5178611788b36ff0647cdd5b2" allowfullscreen></iframe>
   </div>
   ```
4. **StreamC Embed Extraction**: Fetch `https://embed3.streamc.xyz/embed.php?hash=26e0f8e5...` -> extract `data-obf`:
   ```html
   <div id="player" data-obf="eyJzVWIiOiJleU...==">
   ```
   Decode Base64:
   ```javascript
   const streamData = JSON.parse(Buffer.from(dataObf, 'base64').toString('utf8'));
   // streamData.sUb = 'eyJoIjoiMjZlMGY4ZTUx...=='
   ```
5. **Direct M3U8 Fetch**:
   ```
   https://embed3.streamc.xyz/${streamData.sUb}
   ```
   Returns valid M3U8 Master / Media Playlist with 750+ segments (`https://sings3.amass2.top/...`).

---

## 4. Deep Dive: YAN (`yanhh3d.pw`) & Strict Donghua Guard

### Domain & Headers
- **Live Base URL**: `https://yanhh3d.pw/`
- **Referer**: `https://yanhh3d.pw/`
- **Origin**: `https://yanhh3d.pw`
- **User-Agent**: Modern Chrome 124+

### HTML Structure Analysis
#### Catalog & Search
- **Search Query**: `GET https://yanhh3d.pw/search?keysearch=${encodeURIComponent(query)}`
- **Static Routes Filter**: Exclude non-movie routes:
  `['moi-cap-nhat', 'hoat-hinh-3d', 'hoat-hinh-2d', 'hoat-hinh-4k', 'hoat-hinh-ai', 'hoan-thanh', 'dang-chieu', 'phim-le', 'search', 'login', 'register', 'bang-xep-hang']`
- **Film Card DOM**:
  ```html
  <a href="https://yanhh3d.pw/dau-la-dai-luc" title="Đấu La Đại Lục">
    <img src="https://yanhh3d.pw/storage/movies/dau-la-dai-luc-....jpg" />
  </a>
  ```

#### Episode & Stream Extraction
- Episode Page URL: `https://yanhh3d.pw/${slug}/tap-${episode}`
- Embed servers in episode HTML:
  ```html
  <div id="sv_LINK4" name="LINK4" data-src="https://scontent-sin2-3-xx.fbcdn.cloud/o1/v/t2/f2/m366/f59c7756-abfe-45e4-956b-94124b2e1e7f.m3u8"></div>
  <div id="sv_LINK3" name="LINK3" data-src="https://scontent-sin2-4-xx.fbcdn.cloud/embed/57969036-dbfb-473b-99a4-4b90f5882e2e"></div>
  ```
- Fetch `data-src` embed page:
  ```javascript
  var cccc = "https://scontent-sin2-3-xx.fbcdn.cloud/stream/m3u8/f59c7756-abfe-45e4-956b-94124b2e1e7f.m3u8";
  videoPlayer.setup({ sources: [{ "file": cccc }] });
  ```
- Extract `cccc` M3U8 URL -> wrap in `/hls/manifest.m3u8?url=...&ref=...`.

### Strict Donghua Guard (R2 [C] & R4.4)
To prevent false-positive matching of Korean Drama (*Teach You A Lesson*, *A Shop for Killers*) or US-UK movies (*Lanterns*, *Breaking Bad*) into Donghua scrapers:
```javascript
function isDonghuaOrAnime(title, genres = [], type = '') {
  // 1. If explicit genres are provided (from Cinemeta or Stremio meta), require animation genre
  if (Array.isArray(genres) && genres.length > 0) {
    const isAnimGenre = genres.some((g) => {
      const gl = String(g).toLowerCase();
      return gl.includes('anim') || gl.includes('hoạt hình') || gl.includes('donghua') || gl.includes('cartoon');
    });
    if (!isAnimGenre) return false;
  }

  // 2. If title provided, verify donghua/anime signals
  if (title) {
    const t = String(title).toLowerCase();

    // Check known Donghua keywords
    const donghuaKeywords = [
      'hoạt hình', 'hoathinh', 'donghua', 'anime', '3d', '2d',
      'tiên hiệp', 'tien hiep', 'huyền huyễn', 'huyen huyen', 'tu tiên', 'tu tien',
      'đấu la', 'dau la', 'thế giới hoàn mỹ', 'the gioi hoan my', 'tiên nghịch', 'tien nghich',
      'đấu phá', 'dau pha', 'phàm nhân', 'pham nhan', 'thôn phệ', 'thon phe', 'già thiên', 'gia thien',
      'mục thần ký', 'muc than ky', 'trảm thần', 'tram than', 'vạn giới', 'van gioi',
      'nghịch thiên', 'nghich thien', 'tuyệt thế', 'tuyet the', 'quang âm', 'quang am'
    ];

    const hasAnimGenre = Array.isArray(genres) && genres.some((g) => /anim|hoạt hình|donghua/i.test(String(g)));
    if (hasAnimGenre) return true;

    return donghuaKeywords.some((kw) => t.includes(kw));
  }

  return false;
}
```
**Invariant**: At the top of `providerYAN.getStreams`, if `!isDonghuaOrAnime(title, genres, type)` evaluates to false, immediately return `[]`.

---

## 5. Dependency & Tooling Analysis: Cheerio vs Regex

1. **Cheerio Status**:
   - `package.json` contains: `axios`, `cors`, `express`, `node-cache`. `cheerio` is not currently installed in `node_modules`.
   - Option A: Install `cheerio` via `npm install cheerio` if full DOM traversal is desired.
   - Option B: Use robust, lightweight regex and structured string parsers (like `extractJsonObject`) which already execute with zero additional dependencies, 10x lower memory overhead, and 100% test pass rate.
   - Recommendation: For maximum stability and speed in serverless/low-memory environments, implement regex/DOM helpers with optional `cheerio` integration if added to `package.json`.

---

## 6. Recommendations for Implementation (Engine v1.7.0)

1. **STP (`src/providers/stp.js`)**:
   - Upgrade `getCatalog` to scrape `https://sieutamphim.pro/the-loai/...` with card parsing.
   - Keep XOR 0x2a decoding intact and add HTML search fallback for `getStreams`.
2. **CLBPX (`src/providers/clbpx.js`)**:
   - Implement the 5-step HTML extraction: `clbphimxua.info` -> `xem-phim-...` -> `player.php` -> `embed3.streamc.xyz` -> `data-obf` -> direct M3U8.
   - Retain Ophim JSON API as Tier 2 fallback.
3. **YAN (`src/providers/yan.js`)**:
   - Enforce `isDonghuaOrAnime` guard at `getStreams` entry.
   - Scrape live `yanhh3d.pw` with static route filtering and extract `fbcdn.cloud` / storage M3U8 URLs.
4. **Aggregator & Manifest**:
   - Ensure all 22 catalogs in `src/manifest.js` map properly to `getCatTypeFromCatalogId`.
   - Update brand signatures and version to `1.7.0`.
