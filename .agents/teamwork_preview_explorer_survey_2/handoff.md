# Provider Architecture & Gap Analysis Report (KKPhim, NguonC, VsMov)

**Author:** Survey Explorer 2  
**Date:** 2026-08-17  
**Scope:** `src/providers/` (`kkphim.js`, `nguonc.js`, `vsmov.js`), `src/handlers.js`, `src/routes/hls.js`, `src/mapper.js`, `src/api.js`  
**Reference Document:** `.agents/ORIGINAL_REQUEST.md` (Requirement R2, R3)

---

## 1. Observation

Direct investigation of the codebase revealed the following file locations, line numbers, structures, and behaviors:

### 1.1 Provider Configurations & Endpoints

| Provider | File Path | Axios Base URL | Configured Timeout | Primary Endpoints |
| :--- | :--- | :--- | :--- | :--- |
| **KKPhim** | `src/providers/kkphim.js:24-37` | `https://phimapi.com` | `12000ms` (12s) | • `GET /imdb/title/${imdbId}`<br>• `GET /v1/api/tim-kiem?keyword=...&limit=...`<br>• `GET /phim/${slug}`<br>• `GET /danh-sach/phim-moi-cap-nhat?page=...`<br>• `GET /v1/api/the-loai/${genre}?page=...`<br>• `GET /v1/api/quoc-gia/${country}?page=...`<br>• `GET /v1/api/danh-sach/${type}?page=...` |
| **NguonC** | `src/providers/nguonc.js:25-37` | `https://phim.nguonc.com/api` | `12000ms` (12s) | • `GET /films/search?keyword=...&page=...`<br>• `GET /film/${slug}`<br>• `GET /films/phim-moi-cap-nhat?page=...`<br>• `GET /films/the-loai/${genre}?page=...`<br>• `GET /films/quoc-gia/${country}?page=...`<br>• `GET /films/danh-sach/${type}?page=...` |
| **VsMov** | `src/providers/vsmov.js:24-35` | `https://vsmov.com` | `12000ms` (12s) | • `GET /?s=${encodeURIComponent(title)}`<br>• `GET ${filmPageUrl}` (HTML scrape)<br>• `GET ${embedUrl}` (HTML & JS unpack) |

### 1.2 Current Provider Implementations

#### A. KKPhim (`src/providers/kkphim.js`)
- **Imdb Lookup (`lines 78-98`)**: `getByImdb(imdbId)` calls `/imdb/title/${imdbId}`. Caches in `imdbCache` (`kkphim:imdb:${imdbId}`) for 86,400s (24h).
- **Search (`lines 103-129`)**: `search(keyword, limit = 10)` calls `/v1/api/tim-kiem`. Maps `items` returning `{ name, origin_name, slug, year, quality, lang, ... }`.
- **Detail (`lines 134-155`)**: `getDetail(slug)` calls `/phim/${cleanSlug}`. Caches in `detailCache` for 600s (10m).
- **Stream Generation (`lines 226-349`)**:
  - `getStreams(arg1, title, type, season, episode, proxyBase)`:
    - Step 1: Direct IMDb `getByImdb(imdbId)`
    - Step 2: Slug fallback `getDetail(slug)`
    - Step 3: Title fallback `search(title, 5)` -> selects `searchResults[0]` without year matching or title similarity check (`lines 253-263`).
    - Loops over `episodes` array (each server object contains `server_name` and `server_data` array).
    - Matches episode by `targetEpStr` (`ep.name`, `ep.slug === 'tap-...'`, or index fallback).
    - Generates HLS Proxy (`lines 313-327`):
      `url: "${proxyBase}/hls/manifest.m3u8?url=${encodeBase64(targetEp.link_m3u8)}&ref=${encodeBase64(baseRef)}"`
      `title: "[VIP 2 • KKPhim] ${cleanServerName}${epLabel} Full HD (HLS Proxy)\\n⚡ Server VIP • Ổn định 100%"`
    - Generates Embed (`lines 330-341`):
      `url: targetEp.link_embed`
      `externalUrl: targetEp.link_embed`  *(Violation: has both `url` and `externalUrl`)*
      `title: "[VIP 2 • KKPhim] ${cleanServerName}${epLabel} Full HD\\n📺 Embed Player (Dự phòng)"`

#### B. NguonC (`src/providers/nguonc.js`)
- **Search (`lines 69-84`)**: `search(keyword, page = 1)` calls `/films/search`.
- **Detail (`lines 88-107`)**: `getDetail(slug)` calls `/film/${cleanSlug}`. Caches in `detailCache` for 600s.
- **Stream Generation (`lines 179-303`)**:
  - `getStreams(arg1, title, type, season, episode, proxyBase)`:
    - Step 1: Slug lookup `getDetail(slug)`.
    - Step 2: IMDb lookup via `api.findFilmByImdbId(type, imdbId)`.
    - Step 3: Title fallback via `search(title, 1)`.
    - Loops over `movie.episodes` array (each server object contains `server_name`, e.g., "Server #1 - Vietsub", "Server #2 - Thuyết Minh", and `items` array).
    - Matches episode by `targetEpStr` or index.
    - Generates HLS Proxy (`lines 273-283`):
      `url: "${proxyBase}/hls/extract?b64=${encodedEmbed}"`
      `title: "[VIP 1 • NguonC] ${serverName}${epLabel} Full HD (HLS Proxy)\\n⚡ Server VIP • StreamC Proxy"`
    - Generates Embed (`lines 286-295`):
      `url: targetEp.embed`
      `externalUrl: targetEp.embed`  *(Violation: has both `url` and `externalUrl`)*
      `title: "[VIP 1 • NguonC] ${serverName}${epLabel} Full HD\\n📺 Embed Player (Dự phòng)"`

#### C. VsMov (`src/providers/vsmov.js`)
- **Search & Scraper (`lines 80-156`)**:
  - `searchFilm(title)`: GET `https://vsmov.com/?s=${encodeURIComponent(title)}`. Regex match on HTML links.
  - `extractFromFilmPage(pageUrl, referer)`: GET `pageUrl` -> extract iframe / embed URL -> GET `embedUrl` -> scan m3u8 regex / `unpackDeanEdwards` -> return `{ m3u8Url, embedHost }`.
- **Stream Generation (`lines 172-239`)**:
  - `getStreams(arg1, ...)`:
    - Caches page URL in `imdbCache` (`vsmov:${imdbId}`) for 24h.
    - Resolves `searchFilm(title)` -> `extractFromFilmPage(pageUrl)`.
    - Generates HLS Proxy (`lines 213-222`):
      `url: "${proxyBase}/hls/manifest.m3u8?b64=${b64}&ref=${b64Ref}"`
      `name: PROVIDER_LABEL` ("VsMov ⚡")
      `title: "🇻🇳 Vietsub\\n🔄 HLS Proxy"`  *(Violation: does not match R3 standard format)*
    - Generates Direct HLS (`lines 225-230`):
      `url: m3u8Url`
      `title: "🇻🇳 Vietsub\\n🌐 Direct HLS"`

### 1.3 Aggregation & Route Handler (`src/handlers.js`)
- In `src/handlers.js:550-624`:
  - IMDb ID resolution (`lines 565-575`) calls `api.resolveCinemeta(type, imdbId)`.
  - Providers executed via `Promise.allSettled(providersToRun.map((provider) => provider.getStreams(payload)))`.
  - Results merged into `mergedStreams`.

---

## 2. Gap Analysis vs. Requirements R2 & R3

| Requirement Item | R2 / R3 Specification | Current Implementation | Gap / Defect Status |
| :--- | :--- | :--- | :--- |
| **Timeout Policy** | Strict 5s (`5000ms`) axios timeout per request & provider isolation | `12000ms` (12s) configured in all 3 providers (`kkphim.js:31`, `nguonc.js:31`, `vsmov.js:28`) | ❌ **DEFECT**: 12s timeout can delay responses up to 12-36s if upstream endpoints hang |
| **KKPhim Lookup Hierarchy** | Direct IMDb lookup (`/imdb/title/${imdbId}`) → fallback Cinemeta title search (`/v1/api/tim-kiem?keyword=...`) → match year/slug → all servers (Vietsub, Thuyết Minh, Lồng Tiếng) | Direct IMDb works, but fallback search blindly takes `searchResults[0]` without year/slug validation. | ⚠️ **GAP**: Needs canonical title + year matching on search fallback |
| **NguonC Search & Servers** | Search with Cinemeta title (`/films/search?keyword=...`) → return Vietsub & Thuyết Minh | Currently queries via `api.findFilmByImdbId` or `search(title, 1)`. | ⚠️ **GAP**: Must accept canonical title & year from Cinemeta resolver, filter/rank match, return Vietsub & Thuyết Minh servers |
| **VsMov Multi-Gateway Scraper** | Robust multi-gateway scraper, extract 1080p `master.m3u8` stream | Single domain `https://vsmov.com`, 12s timeout, basic regex scan. | ⚠️ **GAP**: 5s timeout enforcement, gateway fallback resilience, 1080p `master.m3u8` stream extraction |
| **Stremio Protocol: In-App HLS Proxy** | `url: "${baseUrl}/hls/manifest.m3u8?url=${b64Url}&ref=${b64Ref}"`<br>Title: `[VIP • ${Provider}] ${ServerName} (HLS Proxy)\n⚡ Phát trực tiếp trong App`<br>**MUST NOT** have `externalUrl` | • KKPhim: uses `[VIP 2 • KKPhim]`<br>• NguonC: uses `/hls/extract?b64=...` (lazy extractor)<br>• VsMov: uses `🇻🇳 Vietsub\n🔄 HLS Proxy` | ❌ **DEFECT**: Inconsistent naming across all 3 providers |
| **Stremio Protocol: Embed Player Fallback** | `externalUrl: "${linkEmbed}"`<br>**MUST NOT** contain `url` property.<br>Title: `[Dự phòng • ${Provider}] ${ServerName} (Embed Player)\n🌐 Bấm để mở xem ngoài trình duyệt web` | Both KKPhim (`line 334`) and NguonC (`line 289`) set `url: targetEp.embed` AND `externalUrl: targetEp.embed`. | ❌ **CRITICAL DEFECT**: Setting `url` on Embed Player streams causes Stremio to attempt native playback on an HTML embed URL, resulting in player errors |

---

## 3. Logic Chain

```
[Observation: KKPhim & NguonC embed stream objects define both url and externalUrl]
  │
  ├─► Stremio Stream Specification: If `url` is present, the client treats the stream as a direct video stream (MP4/HLS).
  │   When `url` points to an HTML iframe (phim.nguonc.com/api/embed or phimapi.com embed), Stremio video player fails with decode error.
  │
  └─► Inference: Removing `url` and keeping ONLY `externalUrl` on embed fallbacks is strictly required for Stremio to open the system browser.

[Observation: Axios instance timeout is set to 12000ms across kkphim.js, nguonc.js, vsmov.js]
  │
  ├─► Aggregator executes providers in parallel with Promise.allSettled.
  ├─► If one provider's upstream CDN hangs (e.g. vsmov.com or phimapi.com), the request blocks for up to 12-24 seconds before completing.
  │
  └─► Inference: Reducing axios timeout to 5000ms (5s) per request, and wrapping each provider execution with an isolated try/catch and abort controller/timeout, guarantees fast response under 5s even with failing upstream CDNs.

[Observation: VsMov performs search -> film page -> embed page -> m3u8 scan sequentially]
  │
  ├─► Total worst-case latency with 12s timeout = 36 seconds.
  ├─► With 5s timeout per request and parallel gateway racing or 5s total budget, VsMov will gracefully degrade without degrading KKPhim or NguonC.
  │
  └─► Inference: VsMov must have strict 5s timeout and fail gracefully to [] on any network or parsing issue.
```

---

## 4. Provider Interface & Stream Contract Specification

### 4.1 Common Provider Input Interface

All providers (`src/providers/*.js`) must adhere to this standardized input payload:

```javascript
/**
 * @param {Object} params
 * @param {string|null} params.imdbId    - IMDb ID (e.g. 'tt1375666')
 * @param {string}      params.type      - 'movie' | 'series'
 * @param {string|null} params.title     - Canonical title from Cinemeta (e.g. 'Inception')
 * @param {number|null} params.year      - Release year from Cinemeta (e.g. 2010)
 * @param {number|null} params.season    - Season number (for series, 1-indexed)
 * @param {number|string|null} params.episode - Episode number/string (for series)
 * @param {string|null} params.slug      - Provider-specific slug (if known)
 * @param {string}      params.proxyBase - Server base URL (e.g. 'http://localhost:7000')
 * @returns {Promise<Array<StreamItem>>}
 */
async function getStreams({ imdbId, type, title, year, season, episode, slug, proxyBase })
```

### 4.2 Standardized Output Stream Contracts (R3 Compliance)

#### 1. In-App Direct Play (HLS Proxy)
```javascript
{
  name: 'VIP Movies 🎬',
  title: `[VIP • ${providerLabel}] ${serverName}${epBadge} (HLS Proxy)\n⚡ Phát trực tiếp trong App`,
  url: `${proxyBase}/hls/manifest.m3u8?url=${encodeBase64(m3u8Url)}&ref=${encodeBase64(referer)}`,
  behaviorHints: {
    notSupported: false,
    bingeGroup: `${providerId}-${slug || 'stream'}`
  }
}
```
*Note for NguonC lazy extractor:* If resolving via `/hls/extract`, format is `${proxyBase}/hls/extract?b64=${encodeBase64(embedUrl)}` with the same Title and `url` property.

#### 2. External Web Browser Play (Embed Player Fallback)
```javascript
{
  name: 'VIP Movies 🎬',
  title: `[Dự phòng • ${providerLabel}] ${serverName}${epBadge} (Embed Player)\n🌐 Bấm để mở xem ngoài trình duyệt web`,
  externalUrl: embedUrl, // MUST NOT HAVE `url` PROPERTY!
  behaviorHints: {
    notSupported: false,
    bingeGroup: `${providerId}-${slug || 'stream'}`
  }
}
```

---

## 5. Detailed Change Plan per Provider

### 5.1 KKPhim (`src/providers/kkphim.js`)
1. **Axios Timeout**: Update `http` timeout from `12000` to `5000` ms.
2. **Search Matching with Cinemeta**:
   - In `getStreams`: After `getByImdb` returns null, call `search(title, 5)`.
   - Score/match search results against canonical `title` and `year` from Cinemeta to pick the exact matching item.
3. **All Servers Support**:
   - Loop over all items in `episodes` (`Vietsub`, `Thuyết Minh`, `Lồng Tiếng`).
   - Clean server names: `Vietsub #1`, `Thuyết Minh #1`, `Lồng Tiếng #1`.
4. **Stream Protocol Fix**:
   - HLS Proxy title: `[VIP • KKPhim] ${serverName}${epLabel} (HLS Proxy)\n⚡ Phát trực tiếp trong App` (with `url`).
   - Embed Player: Remove `url` property, set only `externalUrl`.
   - Embed title: `[Dự phòng • KKPhim] ${serverName}${epLabel} (Embed Player)\n🌐 Bấm để mở xem ngoài trình duyệt web`.

### 5.2 NguonC (`src/providers/nguonc.js`)
1. **Axios Timeout**: Update `http` timeout from `12000` to `5000` ms.
2. **Cinemeta Title Lookup**:
   - In `getStreams`: Use canonical `title` & `year` to search `/films/search?keyword=${encodeURIComponent(title)}`.
   - Match year & title to select the target movie slug.
3. **Servers Support**:
   - Return both `Server #1 (Vietsub)` and `Server #2 (Thuyết Minh)` servers.
4. **Stream Protocol Fix**:
   - HLS Proxy title: `[VIP • NguonC] ${serverName}${epLabel} (HLS Proxy)\n⚡ Phát trực tiếp trong App` (with `url`).
   - Embed Player: Remove `url` property, set only `externalUrl`.
   - Embed title: `[Dự phòng • NguonC] ${serverName}${epLabel} (Embed Player)\n🌐 Bấm để mở xem ngoài trình duyệt web`.

### 5.3 VsMov (`src/providers/vsmov.js`)
1. **Axios Timeout**: Update `http` timeout from `12000` to `5000` ms.
2. **Multi-Gateway Scraper Resilience**:
   - Support gateway list (e.g. `https://vsmov.com`, `https://streamvsmov.com`, `https://vsmov.net`) with fast fallback.
   - Robust `scanM3u8` for `master.m3u8` and 1080p stream URL extraction.
3. **Stream Protocol Fix**:
   - HLS Proxy title: `[VIP • VsMov] Vietsub Full HD (HLS Proxy)\n⚡ Phát trực tiếp trong App` (with `url`).
   - Embed / Direct fallback formatted to standard protocol.
4. **Isolation**:
   - Complete try/catch wrapping returning `[]` within 5s under any failure condition.

---

## 6. Caveats

- **Sandbox Network Isolation**: In offline/sandboxed development test environments, external domain DNS lookups (`v3-cinemeta.strem.io`, `phimapi.com`, `phim.nguonc.com`, `vsmov.com`) return `ENOTFOUND`. Unit and integration test mocks should be utilized for CI validation.
- **Provider HTML Structure Variations**: VsMov relies on scraping HTML. If the DOM structure of `vsmov.com` changes, regex scanning requires fallback patterns (`data-src`, `iframe`, `player.init`, P.A.C.K.E.R).
- **Episode Key Parsing**: Some series on NguonC/KKPhim use `tap-01` vs `1` vs `tap-full`. Robust episode number extraction regex (`parseEpNumber`) is necessary.

---

## 7. Conclusion

1. All 3 providers are functional in architecture but require specific alignment to satisfy R2 and R3:
   - Timeout reduction from 12s to 5s across all axios instances.
   - Separation of `url` (in-app HLS Proxy) and `externalUrl` (browser embed player without `url`).
   - Title string unification (`[VIP • Provider] ...` and `[Dự phòng • Provider] ...`).
   - Enhanced Cinemeta title/year search matching on KKPhim and NguonC.
   - Multi-gateway and 1080p master m3u8 resilience on VsMov.
2. The aggregator in `src/handlers.js` using `Promise.allSettled` is well-architected to guarantee multi-source resilience once providers adhere to the 5s timeout and standardized stream interface.

---

## 8. Verification Method

To verify provider compliance after implementation:

1. **Syntax Check**:
   ```bash
   node --check src/index.js
   node --check src/handlers.js
   node --check src/providers/kkphim.js
   node --check src/providers/nguonc.js
   node --check src/providers/vsmov.js
   ```
2. **Stream Contract & Timeout Verification**:
   - Query `/stream/movie/tt1375666.json` (Inception).
   - Verify every stream object:
     - If `url` exists, `externalUrl` is `undefined` (HLS Proxy).
     - If `externalUrl` exists, `url` is `undefined` (Embed Player).
     - Title strings follow `[VIP • ...]` and `[Dự phòng • ...]`.
   - Simulate a down provider / invalid host to ensure the endpoint returns remaining provider streams in `< 5.5s` without error.
3. **Integration Test Suite**:
   ```bash
   npm test
   ```
