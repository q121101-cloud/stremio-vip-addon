# Exploration Survey Report: KKPhim Provider, Stream Formatting & HLS Proxy Architecture

## 1. Observation

### 1.1 Provider Interface & Codebase Layout
- **Provider Directory**: `src/providers/`
  - `src/providers/kkphim.js` (487 lines): KKPhim provider interacting with `https://phimapi.com`.
  - `src/providers/nguonc.js` (404 lines): NguonC provider interacting with `https://phim.nguonc.com/api`.
  - `src/providers/vsmov.js` (299 lines): Multi-gateway scraper provider (`vsmov.com`, `streamvsmov.com`, `vsmov.net`).
  *(Note: `ophim.js` is not present in `src/providers/`; the active providers in the codebase are `kkphim`, `nguonc`, and `vsmov`).*
- **Common Interface Contract**:
  - `id`: Provider ID string (`'kkphim'`, `'nguonc'`, `'vsmov'`).
  - `label`: Provider display name (`'KKPhim'`, `'NguonC'`, `'VsMov'`).
  - `getCatalog(type, page, extra)`: Returns catalog metadata items for Stremio discovery.
  - `getStreams(payload)`: Primary stream resolution function supporting single object payload `{ imdbId, type, title, year, genres, aliases, season, episode, slug, proxyBase }` or positional arguments `(arg1, title, type, season, episode, proxyBase)`.
- **Aggregator Orchestration** (`src/handlers.js:546-658`):
  - In `/stream/:type/:id.json`, the aggregator resolves Cinemeta metadata for IMDb IDs (`tt...`), filters enabled providers based on user configuration token, executes provider calls concurrently via `Promise.allSettled()`, and enforces Stremio stream exclusivity (sanitizing and ensuring strict isolation between `url` vs `externalUrl`).

### 1.2 KKPhim Implementation Details (`src/providers/kkphim.js`)
- **Upstream Endpoints**:
  - Base API: `https://phimapi.com` (Axios client timeout configured to 5000ms at line 31).
  - Image CDN: `https://phimimg.com` (line 25).
  - Lookup endpoints:
    - Direct IMDb ID lookup: `GET /imdb/title/${imdbId}` (lines 138-145).
    - Slug detail lookup: `GET /phim/${cleanSlug}` (lines 194-201).
    - Search by title: `GET /v1/api/tim-kiem?keyword=${keyword}&limit=${limit}` (lines 158-164).
- **Episode & Stream Extraction**:
  - Structure: `res.data.episodes` is an array of server objects (e.g. `server_name: "Vietsub #1"`, `server_data: [...]`).
  - In `server_data[]`, each episode item provides:
    ```json
    {
      "name": "Full",
      "slug": "full",
      "filename": "Cửu Môn - Nine Gates - 2021 - HD - Vietsub - Full",
      "link_embed": "https://player.phimapi.com/player/?url=https://s1.phim1280.tv/20230929/a3nZqLHv/index.m3u8",
      "link_m3u8": "https://s1.phim1280.tv/20230929/a3nZqLHv/index.m3u8"
    }
    ```
  - Direct `link_m3u8` is available directly in the API response without needing scraping or lazy HTML unpackers.
- **Movie vs Series Resolution Logic** (`src/providers/kkphim.js:343-378`):
  - `isMovie = type === 'movie' || movie?.type === 'single' || (episodes.length === 1 && episodes[0]?.server_data?.length === 1)`
  - Movie / Single episode: selects `serverData[0]`.
  - Series episode resolution:
    - Matches `ep.name === targetEpStr` (e.g. `ep.name === '1'`).
    - Matches `ep.slug === 'tap-' + targetEpStr` or `'tap-0' + targetEpStr`.
    - Matches regex word boundary `\b${targetEpStr}\b`.
    - Fallback to 1-based index `serverData[epNum - 1]`.
- **Current Stream Output Formatting** (`src/providers/kkphim.js:385-412`):
  - HLS Stream (In-App Direct Play):
    - `name`: `'VIP Movies 🎬'`
    - `title`: `[VIP • KKPhim] ${cleanServerName}${epLabel} (HLS Proxy)\n⚡ Phát trực tiếp trong App`
    - `url`: `${proxyBase}/hls/manifest.m3u8?url=${encodeBase64(targetEp.link_m3u8)}&ref=${encodeBase64(baseRef)}`
    - `baseRef`: `'https://phimapi.com/'` (line 347)
  - Embed Fallback Stream (lines 402-412):
    - Generates stream object with `externalUrl: targetEp.link_embed` and `title: [Dự phòng • KKPhim] ... (Embed Player)...`.
    - **Gap identified**: User requirements R1 and Acceptance Criteria specifically require omitting `externalUrl` completely so Stremio plays inside the native player ("KKPhim streams contain `url` and NO `externalUrl`").

### 1.3 Base64 Encoding & Proxy Architecture (`src/routes/hls.js`, `src/mapper.js`, `src/config.js`)
- **Base64URL Format**:
  - Consistent use of `Buffer.from(str, 'utf8').toString('base64url')` across all files:
    - `src/providers/kkphim.js:49`
    - `src/providers/nguonc.js:41`
    - `src/providers/vsmov.js:258-259`
    - `src/mapper.js:135`
    - `src/config.js:45`
    - `src/routes/hls.js:87, 127-128, 176, 196, 203, 210, 219`
- **Proxy Endpoints in `src/routes/hls.js`**:
  - `GET /hls/extract`: Lazy embed parser (used by NguonC), unpacks HTML/data-obf and redirects to `/hls/manifest.m3u8`.
  - `GET /hls/manifest.m3u8`: Fetches upstream m3u8 with injected `Referer`, `Origin`, `User-Agent`. Parses playlist and rewrites sub-playlists (`/hls/manifest.m3u8?b64=...&ref=...`) and media segments (`/hls/ts?b64=...&ref=...`).
  - `GET /hls/ts`: Streams binary video chunks with `Content-Type: video/mp2t` and upstream anti-hotlink headers.
- **Anti-403 CDN Referer & Origin Mapping** (`src/routes/hls.js:29-71`):
  - Current User-Agent: `HLS_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36'`
  - Current `SOURCE_REFERERS`:
    - `phimapi.com` -> `referer: 'https://phimapi.com/'`, `origin: 'https://phimapi.com'`
    - `kkphim` -> `referer: 'https://kkphim.vip/'`, `origin: 'https://kkphim.vip'`
  - **Gap identified**: Requirement R2 specifies anti-403 headers:
    - `Referer: https://player.phimapi.com/`
    - `Origin: https://player.phimapi.com`
    - `User-Agent: Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36`

### 1.4 Live Empirical Probe of KKPhim `cuu-mon`
- Live probe against `https://phimapi.com/phim/cuu-mon` and addon proxy:
  - Stream metadata: `Movie: Cửu Môn`, `Type: single`, `Server: Vietsub`, `link_m3u8: https://s1.phim1280.tv/20230929/a3nZqLHv/index.m3u8`.
  - Upstream manifest fetch via proxy returned HTTP 200 `#EXTM3U` and successfully rewritten sub-playlist links.
  - Sub-playlist fetch via proxy returned HTTP 200 `#EXTM3U` with rewritten `.ts` segment links.
  - Segment fetch via proxy returned HTTP 200 with `Content-Type: video/mp2t` and 946,204 bytes valid binary video buffer.

---

## 2. Logic Chain

1. **KKPhim Provider Structure**:
   - `src/providers/kkphim.js` already contains direct API lookups, IMDb resolution, Cinemeta scoring fallback, and episode parsing.
   - However, the stream object generation in lines 385-412 currently adds both an HLS proxy stream and an Embed player stream with `externalUrl`.
   - To satisfy Requirement R1 ("Strictly omit `externalUrl` so Stremio plays inside the native player") and Acceptance Criteria ("KKPhim streams contain `url` and NO `externalUrl`"), lines 402-412 producing `externalUrl` must be removed from `kkphim.js`.
   - In addition, the stream title in `kkphim.js:392` should be formatted to include `Full HD (HLS Proxy)` and `⚡ Server VIP • Phát trực tiếp trong App`, and `baseRef` updated to `'https://player.phimapi.com/'`.

2. **HLS Proxy Anti-403 Optimization**:
   - In `src/routes/hls.js`, upstream CDN hotlink protection checks `Referer` (`https://player.phimapi.com/`), `Origin` (`https://player.phimapi.com`), and modern browser `User-Agent`.
   - Updating `HLS_UA` in `src/routes/hls.js:29` to Chrome 126 on macOS and expanding `SOURCE_REFERERS` to map `phimapi.com`, `phim1280.tv`, `kkphimplayer`, and `kkphim` to `https://player.phimapi.com/` ensures all upstream playlist and segment requests bypass CDN 403 hotlink blocks.

3. **End-to-End Test Suite**:
   - `tests/test_kkphim_playback.js` is currently not present in the repository.
   - An automated script executing Test Case 1 (stream generation for `cuu-mon` or valid slug), Test Case 2 (proxy manifest retrieval and rewrite validation), and Test Case 3 (binary TS segment fetch and buffer length check) needs to be created to fulfill R3 and acceptance testing.

---

## 3. Caveats

- **Sandbox Network Constraints**: In restricted sandbox mode without `BypassSandbox`, outbound TCP sockets to localhost ephemeral ports can trigger `AggregateError: connect EPERM`. Live server tests should run with appropriate socket permissions or `BypassSandbox: true` during execution.
- **Provider Differences**: NguonC provides embed URLs requiring `/hls/extract`, whereas KKPhim provides direct `link_m3u8` requiring `/hls/manifest.m3u8`. Both route through `src/routes/hls.js`.
- **Other Providers**: NguonC and VsMov intentionally retain embed fallback options; only KKPhim is requested to strictly omit `externalUrl` for 100% in-app playback per R1.

---

## 4. Conclusion

The codebase is well-structured and highly modular. The following concise changes are identified for implementation:
1. **`src/providers/kkphim.js`**:
   - Update `baseRef` to `'https://player.phimapi.com/'`.
   - Update stream title format to: `[VIP • KKPhim] ${server.server_name} [Tập ${targetEp.name}] Full HD (HLS Proxy)\n⚡ Server VIP • Phát trực tiếp trong App` (handling 'FULL' vs episode numbers cleanly).
   - Omit the `link_embed` stream completely, ensuring KKPhim outputs only `url` streams with NO `externalUrl`.
2. **`src/routes/hls.js`**:
   - Update `HLS_UA` to macOS Chrome 126.
   - Update `SOURCE_REFERERS` for KKPhim / phimapi / phim1280 / kkphimplayer to `Referer: https://player.phimapi.com/` and `Origin: https://player.phimapi.com`.
3. **`tests/test_kkphim_playback.js`**:
   - Implement the 3-tier automated playback test script verifying stream formatting, manifest rewriting, and non-empty TS binary segment delivery.

---

## 5. Verification Method

To independently verify all findings:
1. **Syntax Check**:
   ```bash
   node --check src/index.js
   node --check src/providers/kkphim.js
   node --check src/routes/hls.js
   ```
2. **Inspect Provider Stream Output**:
   ```bash
   node -e 'const kk = require("./src/providers/kkphim"); kk.getStreams({ slug: "cuu-mon", type: "movie", proxyBase: "http://localhost:7000" }).then(console.log);'
   ```
3. **Inspect HLS Proxy Route & Referer Mapping**:
   Check `src/routes/hls.js` lines 29-71 and lines 180-285.
4. **Run Deep Cinemeta and Unit Suites**:
   ```bash
   node tests/test_cinemeta_deep.js
   ```
