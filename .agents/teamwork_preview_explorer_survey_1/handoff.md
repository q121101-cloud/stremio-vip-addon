# STP Provider & Live Site Investigation Report — Engine v1.6.0

## 1. Observation

### 1.1 Current Codebase State

#### `src/providers/stp.js`
- **Domain & Headers**:
  - `REFERER_HEADER`: currently set to `'https://suutamphim.org/'` (line 25).
  - `Origin`: currently set to `'https://suutamphim.org'` (line 35).
  - `PROVIDER_LABEL`: currently `'STP • Âu Mỹ & K-Drama'` (line 24).
- **Internal Implementation**:
  - `search(keyword, page)`: Calls `https://phimapi.com/v1/api/tim-kiem` (lines 62-64).
  - `getDetail(slug)`: Calls `https://phimapi.com/phim/${cleanSlug}` (lines 93-95).
  - `getCatalog(type, page, extra)`: Calls `https://phimapi.com/v1/api/quoc-gia/${countrySlug}` (lines 142-143).
  - `getStreams(payload)`: Extracts `targetEp.link_m3u8` and builds stream title:
    ```javascript
    const titleHeader = isTM
      ? `[VIP • STP] Thuyết Minh Full HD${epLabel} (HLS Proxy)`
      : `[VIP • STP] Vietsub Full HD${epLabel} (HLS Proxy)`;
    ```
  - Missing the v1.6.0 specification label:
    `[VIP 4 • STP] Thuyết Minh HD (HLS Proxy)\n⚡ Server STP • sieutamphim.pro`

#### `src/lib/utils.js`
- Exports `scoreMatch` at line 324:
  ```javascript
  module.exports = {
    safeString,
    safeType,
    normalizeText,
    escapeRegExp,
    safeExtra,
    safeSlug,
    safeKeyword,
    safePage,
    extractSeasonNumber,
    isSeasonMatch,
    scoreMatch,
  };
  ```
- Grep across all provider files confirms that `scoreMatch` is imported from `../lib/utils` and **never re-declared** in any provider.

#### `src/routes/hls.js`
- `SOURCE_REFERERS` currently has:
  ```javascript
  { pattern: /suutamphim|tvhay/i, referer: 'https://suutamphim.org/', origin: 'https://suutamphim.org' },
  ```
  Requires addition/update for `sieutamphim.pro`:
  ```javascript
  { pattern: /sieutamphim|suutamphim|tvhay/i, referer: 'https://sieutamphim.pro/', origin: 'https://sieutamphim.pro' },
  ```

---

### 1.2 Live Site Probing: `https://sieutamphim.pro/`

Direct HTTP probe to `https://sieutamphim.pro/` executed:
- **Server**: Cloudflare protected (`server: cloudflare`, `cf-cache-status: DYNAMIC`).
- **Platform**: WordPress 6.x with Flatsome Theme and custom video streaming plugins.
- **Root Status**: HTTP 200 OK (Data length: ~1,031,154 bytes).

#### Endpoint Matrix & Capabilities

| Endpoint | Method | Purpose | Response Format | Status / Sample Result |
| :--- | :--- | :--- | :--- | :--- |
| `https://sieutamphim.pro/wp-json/wp/v2/posts?search=<q>&per_page=10` | GET | Search movie/series posts | JSON Array of Post Objects | **200 OK** — Returns posts matching titles (`spider-man`, `ninja`, `avatar`, `conan`) |
| `https://sieutamphim.pro/wp-json/wp/v2/posts?slug=<slug>` | GET | Exact post lookup by slug | JSON Array | **200 OK** — Returns target post by slug (e.g. `sat-thu-ninja-2-tvh-thuyet-minh`) |
| `https://sieutamphim.pro/wp-json/wp/v2/posts/<id>` | GET | Lookup post by WordPress ID | JSON Object | **200 OK** — Returns full post detail |
| `https://sieutamphim.pro/?s=<q>` | GET | HTML SSR search fallback | HTML | **200 OK** — Search results page with links to `/<year>/<month>/<slug>.html` |
| `https://sieutamphim.pro/embed.html?url=<base64>` | GET | Player embed page | HTML + JWPlayer / iframe | **200 OK** — Embed script decodes XOR `0x2a` and mounts player |

#### Post Content Structure & Stream Encryption
In `post.content.rendered`:
```html
<div class="list-play">
  <span class="episode-list" id="episode-list"></span>
  <div id="mytick">
    <div class="episodeGroup"
      data-server="hx"
      data-episodes='[
        {"B^^ZY   YBEX^ CDA ZZhx \~]l","Full"},
      ]'>
    </div>
  </div>
</div>
```

#### Obfuscation & Player Deobfuscation Algorithm
1. The episode URLs inside `data-episodes` are encoded using character-wise **XOR with key `0x2a` (decimal 42)**.
2. In the browser / player script (`embed.html` and `stp_script11.js`):
   ```javascript
   function decodeXorAndBase64(m, key = 0x2a) {
     const o = atob(m);
     let l = '';
     for (let k = 0; k < o.length; k++) {
       l += String.fromCharCode(o.charCodeAt(k) ^ key);
     }
     return l;
   }
   ```
3. Base stream target destinations after XOR decode:
   - `B^^ZY   YBEX^ CDA ...` -> `https://short.ink/...` or `https://player.abyssplayer.com/...` or `https://abysscdn.com/...` or direct `.m3u8` links.
   - Embed script performs alias rewrite:
     ```javascript
     replaceShortInkUrl: D.replace(/https?:\/\/(short\.ink|short\.icu|abyssplayer\.com|player\.abyssplayer\.com|play\.abyssplayer\.com)\//g, 'https://abysscdn.com/')
     ```
   - If direct `.m3u8` is found, JWPlayer initializes playback; otherwise it loads an iframe embed.

---

## 2. Logic Chain

1. **Premise 1**: Stremio VIP Movies Addon requires STP provider (`src/providers/stp.js`) to point to the live domain `sieutamphim.pro`, properly using `https://sieutamphim.pro/` as `Referer` and `https://sieutamphim.pro` as `Origin`.
2. **Premise 2**: The live site `https://sieutamphim.pro/` exposes standard REST endpoints at `/wp-json/wp/v2/posts` that return movie metadata and encrypted episode lists via `data-episodes`.
3. **Premise 3**: Title search via `/wp-json/wp/v2/posts?search=${keyword}` accurately matches Vietnamese and English movie titles (e.g., `spider-man` -> `nguoi-nhen-tro-ve-nha-vtv-thuyet-minh`, `conan` -> `tham-tu-conan-movie-...`).
4. **Premise 4**: For stream extraction, the multi-tier strategy ensures zero-crash operation:
   - **Tier 1 (WP-JSON & XOR Decode)**: Query `sieutamphim.pro/wp-json/wp/v2/posts` -> decode `data-episodes` with XOR 42 -> extract `.m3u8` / embed links -> route through `/hls/manifest.m3u8?url=...&ref=...`.
   - **Tier 2 (HTML SSR / PhimAPI Fallback)**: If WP-JSON fails or has no streams, scrape HTML SSR `/?s=...` and/or fallback to `phimapi.com` mirror with `https://sieutamphim.pro/` referer.
   - **Tier 3 (Safe Degradation)**: If all extraction attempts fail, `getStreams` returns `[]` safely without throwing an unhandled exception or blocking the aggregator.
5. **Premise 5**: Stremio Stream Protocol requires exact label formatting:
   `[VIP 4 • STP] Thuyết Minh HD (HLS Proxy)\n⚡ Server STP • sieutamphim.pro`
   (or Vietsub / Lồng Tiếng variants with episode identifier, e.g. `[VIP 4 • STP] Thuyết Minh HD [Tập 1] (HLS Proxy)\n⚡ Server STP • sieutamphim.pro`).
6. **Premise 6**: Strict invariant: No `externalUrl` property may be emitted in stream objects; only `url` pointing to the HLS proxy is allowed.

---

## 3. Caveats

1. **Third-Party Video Hosts**: Video hosts behind `sieutamphim.pro` (such as `abysscdn.com`, `short.ink`, `Hydrax`) may periodically rotate domain names, IP blocks, or require dynamic session tokens. The multi-tier fallback (Tier 1 WP-JSON -> Tier 2 HTML Scraping / Mirror Fallback -> Tier 3 Safe `[]`) ensures resilience.
2. **Cloudflare Rate Limiting**: `sieutamphim.pro` is protected by Cloudflare. Requests must maintain standard browser User-Agent headers (`STP_UA`) and 5-second axios timeouts with graceful error catching.
3. **Catalog Country Slugs**: On `sieutamphim.pro`, categories are organized by server types (`hx`, `ok`, `vk`, `sp`) or `tat-ca-phim` rather than country endpoints; catalog queries should either query category IDs/tags or leverage the search/post list endpoints with fallback.

---

## 4. Conclusion

The STP provider investigation is complete with the following design specifications established for implementation:
1. **Domain & Headers**:
   - `REFERER_HEADER = 'https://sieutamphim.pro/'`
   - `Origin = 'https://sieutamphim.pro'`
   - `BASE_URL = 'https://sieutamphim.pro'`
2. **Stream Labeling**:
   - `[VIP 4 • STP] Thuyết Minh HD${epLabel} (HLS Proxy)\n⚡ Server STP • sieutamphim.pro`
   - `[VIP 4 • STP] Vietsub HD${epLabel} (HLS Proxy)\n⚡ Server STP • sieutamphim.pro`
   - `[VIP 4 • STP] Lồng Tiếng HD${epLabel} (HLS Proxy)\n⚡ Server STP • sieutamphim.pro`
3. **Stream Extraction Multi-Tier Strategy**:
   - Primary: `/wp-json/wp/v2/posts?search=...` + `/wp-json/wp/v2/posts?slug=...` + XOR `0x2a` decoding.
   - Secondary Fallback: HTML SSR scraping `/?s=...` / mirror endpoint.
   - Tertiary: Safe `[]` return on any failure.
4. **HLS Proxy Router Routing**:
   - In `src/routes/hls.js`: Add pattern `{ pattern: /sieutamphim|suutamphim|tvhay/i, referer: 'https://sieutamphim.pro/', origin: 'https://sieutamphim.pro' }`.
5. **Utils Verification**:
   - `scoreMatch` is properly exported from `src/lib/utils.js` and imported cleanly without re-declarations.

---

## 5. Verification Method

To independently verify these findings:

1. **Test Live Site Connectivity & WP-JSON API**:
   ```bash
   node -e "
   const axios = require('axios');
   axios.get('https://sieutamphim.pro/wp-json/wp/v2/posts?search=ninja&per_page=3', {
     headers: { 'User-Agent': 'Mozilla/5.0' }
   }).then(r => console.log('WP-JSON Status:', r.status, 'Count:', r.data.length));
   "
   ```

2. **Verify `scoreMatch` Usage Across Codebase**:
   ```bash
   grep -rn "scoreMatch" src/
   ```

3. **Verify Zero Regression on Existing Suites**:
   ```bash
   node tests/verify_playback.js
   node tests/verify_hotfix_vsmov_kkphim.js
   ```
