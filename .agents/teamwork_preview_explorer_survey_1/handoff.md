# Code Audit Report: `src/providers/nguonc.js` & `src/providers/film4k.js`

## 1. Observation

### 1.1 `src/providers/nguonc.js`
- **Stealth Headers & Chrome 131 User-Agent** (`src/providers/nguonc.js:26-37`):
  ```javascript
  const NGUONC_UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

  const NGUONC_HEADERS = {
    'User-Agent': NGUONC_UA,
    'Referer': 'https://phim.nguonc.com/',
    'Origin': 'https://phim.nguonc.com',
    'Accept': 'application/json, text/plain, */*',
    'Sec-Fetch-Dest': 'empty',
    'Sec-Fetch-Mode': 'cors',
    'Sec-Fetch-Site': 'same-origin',
    'Accept-Language': 'vi-VN,vi;q=0.9,en-US;q=0.8',
  };
  ```
  - `User-Agent`: Exactly Chrome 131 on macOS (`Chrome/131.0.0.0`).
  - `Referer`: `'https://phim.nguonc.com/'`.
  - `Origin`: `'https://phim.nguonc.com'`.
  - `Sec-Fetch-Dest`: `'empty'`.
  - `Sec-Fetch-Mode`: `'cors'`.
  - `Sec-Fetch-Site`: `'same-origin'`.
  - Axios client (`http`, line 40-44) is configured with `baseURL: 'https://phim.nguonc.com/api'`, `timeout: 5000`, `headers: NGUONC_HEADERS`.

- **Vercel-to-Render Fallback Routing via `RENDER_BACKEND_URL`** (`src/providers/nguonc.js:46-68`):
  ```javascript
  async function fetchNguonC(endpoint, options = {}) {
    const config = {
      timeout: options.timeout || 5000,
      headers: { ...NGUONC_HEADERS, ...(options.headers || {}) },
      params: options.params,
    };
    try {
      return await http.get(endpoint, config);
    } catch (err) {
      const isForbiddenOrBlocked = err.response?.status === 403 || err.response?.status === 429 || (!err.response && err.code === 'ECONNABORTED');
      const backendProxy = process.env.RENDER_BACKEND_URL;
      if (backendProxy && isForbiddenOrBlocked) {
        try {
          const cleanProxy = backendProxy.replace(/\/+$/, '');
          const target = `${cleanProxy}/api/nguonc-proxy?path=${encodeURIComponent(endpoint)}`;
          return await axios.get(target, { timeout: 6000, headers: NGUONC_HEADERS, params: options.params });
        } catch (proxyErr) {
          // Fall back to throwing original error
        }
      }
      throw err;
    }
  }
  ```
  - Catches 403, 429, or ECONNABORTED network timeouts.
  - Inspects `process.env.RENDER_BACKEND_URL`.
  - Routes request to `${cleanProxy}/api/nguonc-proxy?path=${encodeURIComponent(endpoint)}`.
  - *Observation on Server Route*: A grep across the entire codebase confirms that no route handler for `GET /api/nguonc-proxy` is defined in `src/index.js` or `src/handlers.js`. If the Render service runs this same repository without an external proxy handler, it will return 404 for `/api/nguonc-proxy`.

- **Stream Extraction & Protocol Compliance** (`src/providers/nguonc.js:425-438`):
  ```javascript
  const streamUrl = targetEp.m3u8
    ? `${proxyBase || ''}/hls/manifest.m3u8?url=${encodeBase64(targetEp.m3u8)}&ref=${encodeBase64('https://embed15.streamc.xyz/')}`
    : `${proxyBase || ''}/hls/extract?b64=${encodedEmbed}`;

  // In-App Direct Play (HLS Proxy) — STRICTLY NO externalUrl
  streams.push({
    name: 'VIP Movies 🎬',
    title: `${titleHeader}\n⚡ Server VIP 3 • Phát trực tiếp trong App`,
    url: streamUrl,
    behaviorHints: {
      notSupported: false,
      bingeGroup: `nguonc-${movie.slug || 'stream'}`,
    },
  });
  ```
  - Verified: Every stream object contains `url` pointing to local HLS proxy routes (`/hls/manifest.m3u8` or `/hls/extract`).
  - Verified: `externalUrl` is 100% absent across all return paths in `src/providers/nguonc.js`.
  - Multi-server support handles Vietsub, Thuyết Minh, Lồng Tiếng separately with custom labels (`lines 412-423`).
  - Episode matching uses `matchEpisodeItem(ep, targetEpStr, epNum)` (`line 398`) with 1-based index fallback (`line 402`) and season validation via `isSeasonMatch` (`line 373`).

---

### 1.2 `src/providers/film4k.js`
- **REST API Scraping Endpoints**:
  - `BASE_URL`: `'https://film4k.net'` (`line 36`).
  - `BASE_API`: `'https://film4k.net/api'` (`line 37`).
  - `/api/home` (`lines 101, 188`): Used for `search()` and `getCatalog()` (filtering by `mediaType !== 'tv'` for movies, `mediaType === 'tv'` for series).
  - `/api/title/:slug` (`line 140`): Primary endpoint in `getDetail()` for metadata and episode list.
  - `/api/watch/:slug` (`lines 151, 251, 266`): Fallback endpoint for `getDetail()` and primary stream source lookup for `getStreams()`.

- **4K Stream URL Extraction & In-App Protocol** (`src/providers/film4k.js:283-328`):
  ```javascript
  if (isMovie) {
    streamMasterUrl = watchData.sources?.[0]?.url || movie.hlsUrl;
  } else {
    const targetEpNum = episode != null ? parseInt(episode, 10) : 1;
    const targetSeasonNum = season != null ? parseInt(season, 10) : 1;

    const matchedEp = episodes.find((ep) => {
      const epNum = parseInt(ep.episode, 10);
      const sNum = parseInt(ep.season || 1, 10);
      return epNum === targetEpNum && (season == null || sNum === targetSeasonNum);
    }) || episodes[targetEpNum - 1] || episodes[0];

    if (matchedEp) {
      streamMasterUrl = matchedEp.sources?.[0]?.url;
      episodeLabel = `[Tập ${matchedEp.episode || targetEpNum}] `;
    }
  }

  if (!streamMasterUrl) return [];

  const fullStreamUrl = streamMasterUrl.startsWith('http')
    ? streamMasterUrl
    : `${BASE_URL}${streamMasterUrl}`;

  const b64Url = encodeBase64(fullStreamUrl);
  const b64Ref = encodeBase64(REFERER_HEADER);
  const proxyStreamUrl = `${proxyBase || ''}/hls/manifest.m3u8?url=${b64Url}&ref=${b64Ref}`;

  return [
    {
      name: 'VIP Movies 🎬',
      title: streamTitle,
      url: proxyStreamUrl,
      behaviorHints: {
        notSupported: false,
        bingeGroup: `film4k-${targetSlug || 'stream'}`,
      },
    },
  ];
  ```
  - Relative 4K master playlist path (e.g. `/api/hls/archive/:slug/master.m3u8`) is resolved to `https://film4k.net/api/hls/archive/:slug/master.m3u8`.
  - Base64-encoded URL and Referer are passed to `${proxyBase}/hls/manifest.m3u8`.
  - Verified: Every stream object contains `url`. Zero occurrences of `externalUrl`.

- **Multi-audio / Subtitles & Series Episode Matching**:
  - Film4K master playlists contain multi-audio (Vietsub, Dubbed, 6-channel AAC) and subtitle tracks, passed directly to HLS proxy with `https://film4k.net/` origin/referer headers.
  - Series episode matching provides a 3-tier fallback strategy:
    1. Exact episode number + season number match: `epNum === targetEpNum && (season == null || sNum === targetSeasonNum)`.
    2. 1-based index fallback: `episodes[targetEpNum - 1]`.
    3. First episode fallback: `episodes[0]`.

- **Bugs / Code-Level Flaws Identified in `film4k.js`**:
  1. **Bug in `generateSearchKeywords` invocation** (`src/providers/film4k.js:258`):
     - Code: `const keywords = generateSearchKeywords(queryTitle, targetExtra.aliases);`
     - Function signature in `src/lib/utils.js:323`: `generateSearchKeywords(arg1, arg2, arg3, arg4)` where `arg1` = title (string), `arg2` = originalName (string), `arg3` = aliases (array), `arg4` = season (number).
     - Impact: Passing `targetExtra.aliases` as `arg2` results in `typeof arg2 === 'string'` evaluating to false and `arg3` being `undefined`. Thus `aliases` is dropped and search fallback does not query aliases.
     - Solution: Pass `{ title: queryTitle, aliases: targetExtra.aliases }` or `generateSearchKeywords(queryTitle, '', targetExtra.aliases)`.
  2. **IMDb ID Extraction Missing from Payload Object** (`src/providers/film4k.js:234`):
     - Code: `if (targetId && String(targetId).startsWith('tt')) cleanImdb = ...;`
     - When `getStreams(payload)` is called where `payload` has `{ imdbId: 'tt...', ... }`, `targetId` is set from `type.id || type.slug || ''` which is null/empty for Cinemeta lookups, leaving `cleanImdb` as `null`.
     - Solution: Check `const cleanImdb = targetExtra?.imdbId || (targetId && String(targetId).startsWith('tt') ? String(targetId).split(':')[0] : null);`.
  3. **Unused Imports / Candidate Scoring** (`src/providers/film4k.js:28-29, 263-274`):
     - `scoreMatch` and `isSeasonMatch` are imported from `../lib/utils` but never called in `film4k.js`. The search fallback loop takes the first item that succeeds on `/watch/:slug` instead of sorting by highest matching score.

---

### 1.3 Live Backtest Execution Result
Command executed: `node tests/verify_playback_fix.js`
- Total: **22 PASSED, 0 FAILED**.
- Phase 1 (NguonC Anti-403 Stealth Engine):
  - Catalog (`phim-le`): 10 items fetched (HTTP 200).
  - Detail (`cuu-mon`): Fetched successfully.
  - Search (`avatar`): 10 items returned.
- Phase 2 (FILM4K 4K Ultra HD Provider):
  - Catalog (`4k-movies`): 54 items returned (HTTP 200).
  - Detail (`arcane`): Fetched successfully.
  - Stream extraction (`Arcane S1E1`): Extracted 4K stream with title branding `[VIP 0 • FILM4K] Arcane - 4K Ultra HD (3840x2160) [Tập 1] (HLS Proxy)` routing through `/hls/manifest.m3u8`.
  - In-App protocol invariant verified: `externalUrl === undefined`.

---

## 2. Logic Chain

1. **NguonC Stealth Headers**: Inspection of `src/providers/nguonc.js:26-37` confirms that `NGUONC_UA` matches Chrome 131 macOS, and all five required headers (`Referer`, `Origin`, `Sec-Fetch-Dest`, `Sec-Fetch-Mode`, `Sec-Fetch-Site`) are declared and passed into Axios config.
2. **NguonC Fallback**: Inspection of `fetchNguonC` (`src/providers/nguonc.js:46-68`) confirms that on 403, 429, or ECONNABORTED, `process.env.RENDER_BACKEND_URL` is used to construct a proxy request to `/api/nguonc-proxy`.
3. **NguonC Stream Invariants**: Inspection of `src/providers/nguonc.js:425-438` demonstrates that returned stream objects set `url: streamUrl` (pointing to `/hls/manifest.m3u8` or `/hls/extract`) and omit `externalUrl`.
4. **Film4K REST API**: Inspection of `src/providers/film4k.js:101, 140, 151, 188, 251` confirms usage of `/api/home`, `/api/title/:slug`, and `/api/watch/:slug`.
5. **Film4K 4K Extraction**: Lines 283-328 extract the relative `.m3u8` URL, resolve it against `https://film4k.net`, encode it with base64, and route it through the HLS proxy.
6. **Film4K Series Logic**: Lines 288-302 evaluate season/episode matches with 3-tier fallback.
7. **Film4K Stream Invariants**: Lines 318-327 return objects containing `url: proxyStreamUrl` with no `externalUrl`.
8. **Identified Deficiencies**: Tracing parameter flow in `film4k.js:258` revealed that `targetExtra.aliases` is passed into `arg2` of `generateSearchKeywords`, ignoring aliases due to signature mismatch.

---

## 3. Caveats

1. **Proxy Endpoint on Render**: The Express server codebase in this repository does not declare a handler for `GET /api/nguonc-proxy`. If `RENDER_BACKEND_URL` points to an instance running this exact app, fallback requests will return 404 until `/api/nguonc-proxy` is registered in `src/handlers.js` or `src/routes/`.
2. **Film4K Candidate Selection**: `film4k.js` currently does not rank multi-keyword search candidates with `scoreMatch()`; it picks the first candidate that yields watch data.

---

## 4. Conclusion

1. `src/providers/nguonc.js` **passes all audit requirements**: Chrome 131 UA, all required stealth headers, `RENDER_BACKEND_URL` fallback routing, and strict In-App stream protocol (`url` only, zero `externalUrl`).
2. `src/providers/film4k.js` **passes core audit requirements**: REST API scraping (`/home`, `/title/:slug`, `/watch/:slug`), 4K stream URL extraction via `/hls/manifest.m3u8`, multi-audio/subtitle support, and series episode matching with 100% `url` In-App playback.
3. **Remediation Recommendations for Phase M2**:
   - In `src/providers/film4k.js:258`: Fix `generateSearchKeywords(queryTitle, targetExtra.aliases)` -> `generateSearchKeywords({ title: queryTitle, aliases: targetExtra.aliases })`.
   - In `src/providers/film4k.js:234`: Support `cleanImdb = targetExtra?.imdbId || ...`.
   - In `src/handlers.js` / `src/index.js`: Implement `GET /api/nguonc-proxy` handler so Render can act as a transparent proxy for NguonC API endpoints.

---

## 5. Verification Method

To independently verify these findings:

```bash
# 1. Run live playback and provider verification suite:
node tests/verify_playback_fix.js

# 2. Inspect provider headers and exports:
node -e "
const nguonc = require('./src/providers/nguonc');
const film4k = require('./src/providers/film4k');
console.log('NguonC ID:', nguonc.id);
console.log('FILM4K ID:', film4k.PROVIDER_ID);
"

# 3. Test generateSearchKeywords signature against film4k invocation:
node -e "
const { generateSearchKeywords } = require('./src/lib/utils');
console.log('Positional bug output:', generateSearchKeywords('Arcane', ['Liên Minh Huyền Thoại']));
console.log('Object fix output:', generateSearchKeywords({ title: 'Arcane', aliases: ['Liên Minh Huyền Thoại'] }));
"
```
