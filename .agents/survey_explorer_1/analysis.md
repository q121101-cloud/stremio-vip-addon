# Detailed Analysis Report: Codebase Architecture & HLS Proxy Investigation

**Author**: `survey_explorer_1`  
**Target Milestone**: Survey / Requirement R1 Investigation  
**Date**: 2026-08-18  
**Project**: Stremio VIP Movies Addon Engine  
**Project Root**: `/Users/quan/.gemini/antigravity/scratch/stremio-nguonc-addon`  

---

## 1. Executive Summary

This investigation analyzed the complete server architecture, routing hierarchy, and HLS proxy implementation in `src/routes/hls.js` alongside associated provider modules and entry points against **Requirement R1** (HLS Proxy 404 fix & dynamic headers, relative path resolver, base64url query params & token preservation, CDN Referer/Origin headers for all providers, responseType stream/arraybuffer, and HTTP Range 206 seek support).

### Key Findings
1. **Server Architecture & Routing**: Express application (`src/index.js`) mounts `/hls` via `src/routes/hls.js`, dynamic manifest via `src/routes/manifest.js`, and Stremio catalog/meta/stream handlers + Cyber-Glassmorphism configurator dashboard via `src/handlers.js`.
2. **Relative Path Resolution**: `src/routes/hls.js` resolves relative paths for media segments, sub-variant playlists, encryption keys (`#EXT-X-KEY`), fMP4 initialization maps (`#EXT-X-MAP`), and low-latency preload hints (`#EXT-X-PRELOAD-HINT` / `#EXT-X-PART`) using `new URL(uri, baseUrl.href).href`.
3. **Base64URL Preservation**: URL encoding/decoding strictly uses `Buffer.from(str, 'base64url')` across `src/routes/hls.js`, `src/config.js`, and all 7 provider modules (`vsmov.js`, `kkphim.js`, `nguonc.js`, `stp.js`, `hh3d.js`, `yan.js`, `clbpx.js`), preserving security parameters (`?token=...&sign=...`).
4. **Dynamic Header Resolution**: Dynamic Referer and Origin resolution is configured for all CDNs (VSMOV, KKPhim, NguonC/StreamC, STP, YAN, HH3D, CLBPX), giving precedence to explicit `&ref=` query parameters before falling back to domain regex patterns or URL origin.
5. **Stream Delivery & HTTP Range 206**: `/hls/segment.ts` operates in `responseType: 'stream'`, forwards client `Range` headers to upstream CDNs, passes through HTTP 206 Partial Content and `Content-Range` headers, and streams payloads without buffering entire chunks in memory.
6. **In-App Invariant**: All providers strictly produce stream objects containing `url` (HLS Proxy) with zero `externalUrl`.

---

## 2. Codebase Architecture & Server Entry Points

The codebase follows a modular separation of concerns:

```
stremio-nguonc-addon/
├── src/
│   ├── index.js              # Server entry point (Express app, CORS, logging, graceful shutdown)
│   ├── handlers.js           # Addon routes (/catalog, /meta, /stream, /health, Configurator UI)
│   ├── manifest.js           # 22 K20 catalog definitions, manifest builder, ID prefixes
│   ├── config.js             # Base64URL user configuration encode/decode & token validation
│   ├── mapper.js             # Metadata mapping & Dean Edwards unpacker / embed extraction
│   ├── routes/
│   │   ├── hls.js            # HLS Proxy router (manifest rewriter, segment streamer, sub/key proxy)
│   │   └── manifest.js       # Dynamic manifest router (/manifest.json, /:config/manifest.json)
│   ├── lib/
│   │   ├── cache.js          # LRUCache with TTL for IMDb, Cinemeta, M3U8, catalogs, details
│   │   ├── cinemeta.js       # Cinemeta IMDb metadata resolver with 24h LRU caching
│   │   └── utils.js          # Canonical helpers (scoreMatch, normalizeText, safeSlug, etc.)
│   └── providers/
│       ├── vsmov.js          # VSMOV 4K provider (VIP 1)
│       ├── kkphim.js         # KKPhim provider (VIP 2)
│       ├── nguonc.js         # NguonC provider (VIP 3)
│       ├── stp.js            # STP provider - Western & K-Drama (VIP 4)
│       ├── hh3d.js           # HH3D provider - 3D Donghua (VIP 5/Specialized)
│       ├── yan.js            # YAN provider - 3D Donghua & Ongoing (VIP 6)
│       └── clbpx.js          # CLBPX provider - Classic Wuxia & TVB (VIP 7)
└── tests/                    # E2E test suites and verification scripts
```

### Route Mounting Hierarchy (`src/index.js` lines 62–87)
1. `/hls` → `src/routes/hls.js` (HLS Proxy router handling `/extract`, `/manifest.m3u8`, `/segment.ts`, `/key`, `/sub.vtt`)
2. `/` → `src/routes/manifest.js` (Handles `/manifest.json`, `/:config/manifest.json`, attach `req.addonConfig`)
3. `/` → `src/handlers.js` (Handles configurator dashboard at `/`, `/catalog/:type/:id`, `/meta/:type/:id`, `/stream/:type/:id`, `/health`)
4. Global 404 JSON handler (`{ error: 'Endpoint không tồn tại', path: req.path }`)
5. Global 500 error handler (`{ error: 'Lỗi server nội bộ', message: err.message }`)

---

## 3. Deep-Dive: HLS Proxy Router (`src/routes/hls.js`)

`src/routes/hls.js` acts as an anti-blocking, anti-403 reverse proxy for HLS live/VOD video streaming.

### 3.1 Endpoint Overview

| Endpoint | Supported Aliases | Primary Responsibility | Upstream Method & Response Type |
|---|---|---|---|
| `GET /hls/extract` | — | Extracts `.m3u8` from iframe embed URL and redirects (302) to `/hls/manifest.m3u8` | HTML scraper / regex / JSON extractor |
| `GET /hls/manifest.m3u8` | `/m3u8`, `/m3u8-proxy` | Fetches upstream m3u8 playlist, parses tags, resolves relative URLs to absolute, rewrites URIs to point back through proxy, injects WebVTT subtitles into Master Playlists | `axios.get(url, { responseType: 'text' })` |
| `GET /hls/segment.ts` | `/ts`, `/segment`, `/ts-proxy` | Proxies video `.ts` binary segments with HTTP Range seeking support (206) | `axios.get(url, { responseType: 'stream' })` + `pipe(res)` |
| `GET /hls/key` | `/key.key` | Proxies AES-128 / SAMPLE-AES decryption keys | `axios.get(url, { responseType: 'arraybuffer' })` |
| `GET /hls/sub.vtt` | `/sub` | Proxies WebVTT/SRT subtitle files, auto-converts SRT format to WebVTT (`00:00:00,000` → `00:00:00.000`), sets `Content-Type: text/vtt; charset=utf-8` | `axios.get(url, { responseType: 'text' })` |
| `OPTIONS *` | — | Handles CORS preflight requests with HTTP 204 | Instant 204 No Content |

---

## 4. Evaluation Against Requirement R1

### 4.1 Relative Path Resolver (`src/routes/hls.js` lines 180–297)

#### Requirement
> Sử dụng `new URL(targetUrl, parentUrl).href` để chuyển đổi toàn bộ URL tương đối của phân đoạn `.ts`, playlist con và key từ upstream thành URL tuyệt đối trước khi bọc proxy.

#### Implementation Analysis
- In `src/routes/hls.js`, the base URL is initialized via `baseUrl = new URL(targetUrl)`.
- **Master Playlist Variant Streams**:
  ```javascript
  if (t.startsWith('#EXT-X-STREAM-INF') || t.startsWith('#EXT-X-I-FRAME-STREAM-INF')) {
    isMasterPlaylist = true;
    isNextSubPlaylist = true;
    if (streamInfLine.includes('URI=')) {
      streamInfLine = streamInfLine.replace(/URI=(?:"([^"]+)"|([^\s,]+))/, (_, qUri, unqUri) => {
        const uri = qUri || unqUri;
        const absUri = uri.startsWith('http') ? uri : new URL(uri, baseUrl.href).href;
        const b64Uri = Buffer.from(absUri).toString('base64url');
        return `URI="${protoHost}/hls/manifest.m3u8?url=${b64Uri}&ref=${encodedRef}"`;
      });
    }
  ```
- **Alternative Renditions / Subtitles / Audio**:
  ```javascript
  if (t.startsWith('#EXT-X-MEDIA') && t.includes('URI=')) {
    const absUri = uri.startsWith('http') ? uri : new URL(uri, baseUrl.href).href;
    const b64Uri = Buffer.from(absUri).toString('base64url');
    if (t.includes('TYPE=SUBTITLES') && (absUri.includes('.vtt') || absUri.includes('.srt'))) {
      return `URI="${protoHost}/hls/sub.vtt?url=${b64Uri}&ref=${encodedRef}"`;
    }
    return `URI="${protoHost}/hls/manifest.m3u8?url=${b64Uri}&ref=${encodedRef}"`;
  }
  ```
- **Encryption Keys**:
  ```javascript
  if ((t.startsWith('#EXT-X-KEY') || t.startsWith('#EXT-X-SESSION-KEY')) && t.includes('URI=')) {
    const absUri = uri.startsWith('http') ? uri : new URL(uri, baseUrl.href).href;
    const b64Key = Buffer.from(absUri).toString('base64url');
    return `URI="${protoHost}/hls/key?url=${b64Key}&ref=${encodedRef}"`;
  }
  ```
- **fMP4 Initialization Segment**:
  ```javascript
  if (t.startsWith('#EXT-X-MAP') && t.includes('URI=')) {
    const absUri = uri.startsWith('http') ? uri : new URL(uri, baseUrl.href).href;
    const b64Map = Buffer.from(absUri).toString('base64url');
    return `URI="${protoHost}/hls/segment.ts?url=${b64Map}&ref=${encodedRef}"`;
  }
  ```
- **Low-Latency HLS Preload & Partial Segments**:
  ```javascript
  if ((t.startsWith('#EXT-X-PRELOAD-HINT') || t.startsWith('#EXT-X-PART')) && t.includes('URI=')) {
    const absUri = uri.startsWith('http') ? uri : new URL(uri, baseUrl.href).href;
    const b64Part = Buffer.from(absUri).toString('base64url');
    return `URI="${protoHost}/hls/segment.ts?url=${b64Part}&ref=${encodedRef}"`;
  }
  ```
- **Media Segments & Sub-Variant URL Lines**:
  ```javascript
  const absUrl = t.startsWith('http') ? t : new URL(t, baseUrl.href).href;
  const b64Url = Buffer.from(absUrl).toString('base64url');
  if (isNextSubPlaylist || absUrl.includes('.m3u8') || absUrl.includes('playlist')) {
    isNextSubPlaylist = false;
    rewrittenLines.push(`${protoHost}/hls/manifest.m3u8?url=${b64Url}&ref=${encodedRef}`);
  } else {
    isNextSegment = false;
    rewrittenLines.push(`${protoHost}/hls/segment.ts?url=${b64Url}&ref=${encodedRef}`);
  }
  ```

**Verdict**: Fully compliant with R1. All URI occurrences and relative path forms (`/chunk.ts`, `../chunk.ts`, `chunk.ts?param=1`) are converted to fully qualified URLs before Base64URL encapsulation.

---

### 4.2 Base64URL Parameter Preservation (`src/routes/hls.js` lines 81–110)

#### Requirement
> Dùng chuẩn `Buffer.from(str, 'base64url')` cho cả encode và decode để tuyệt đối không làm mất các tham số bảo mật (`?token=...&sign=...`).

#### Implementation Analysis
- Decoding in `decodeB64(str)`:
  ```javascript
  function decodeB64(str) {
    if (!str) return null;
    try {
      const decodedUrl = Buffer.from(str, 'base64url').toString('utf8');
      if (decodedUrl && (decodedUrl.startsWith('http://') || decodedUrl.startsWith('https://') || decodedUrl.includes('://'))) {
        return decodedUrl;
      }
      const decodedStd = Buffer.from(str, 'base64').toString('utf8');
      if (decodedStd && (decodedStd.startsWith('http://') || decodedStd.startsWith('https://') || decodedStd.includes('://'))) {
        return decodedStd;
      }
      return decodedUrl || null;
    } catch {
      return null;
    }
  }
  ```
- Encoding in `src/routes/hls.js`:
  ```javascript
  Buffer.from(absUrl).toString('base64url')
  ```
- Parameter resolution in `resolveParamUrl`:
  Supports direct raw HTTP URLs, data URIs, and Base64URL-encoded strings.

**Verdict**: Compliant. The usage of `base64url` avoids URL reserved characters (`+`, `/`, `=`) that get broken by query parameter parsing and intermediate proxies.

---

### 4.3 CDN Referer/Origin Dynamic Header Configuration (`src/routes/hls.js` lines 27–67)

#### Requirement
> - KKPhim / Opstream / Vlcdn / Phim1280: `Referer: https://player.phimapi.com/` (hoặc origin của chính URL video).
> - NguonC: `Referer: https://phim.nguonc.com/`.
> - VSMOV: `Referer: https://vsmov.com/`.
> - STP: `Referer: https://sieutamphim.pro/`.
> - CLBPX: `Referer: https://clbphimxua.info/`.
> - YAN: `Referer: https://yanhh3d.pw/`.

#### Implementation Analysis

In `src/routes/hls.js`:
```javascript
const SOURCE_REFERERS = [
  { pattern: /kkphimplayer|phim1280|phimapi\.com|kkphim/i, referer: 'https://player.phimapi.com/', origin: 'https://player.phimapi.com' },
  { pattern: /vsmov|streamvsmov|p25\.streamvsmov/i,        referer: 'https://vsmov.com/',           origin: 'https://vsmov.com' },
  { pattern: /nguonc\.com/i,                               referer: 'https://phim.nguonc.com/',     origin: 'https://phim.nguonc.com' },
  { pattern: /streamc\.|amass2\.top/i,                     referer: 'https://embed15.streamc.xyz/', origin: 'https://embed15.streamc.xyz' },
  { pattern: /sieutamphim|suutamphim|tvhay/i,              referer: 'https://sieutamphim.pro/',     origin: 'https://sieutamphim.pro' },
  { pattern: /yanhh3d|yan|fbcdn\.cloud|defifa\.com/i,      referer: 'https://yanhh3d.pw/',          origin: 'https://yanhh3d.pw' },
  { pattern: /hh3d|hoathinh3d/i,                           referer: 'https://hh3d.tv/',             origin: 'https://hh3d.tv' },
  { pattern: /clbphimxua|clbpx/i,                          referer: 'https://clbphimxua.info/',     origin: 'https://clbphimxua.info' },
];
```

Resolution Priority:
1. `refParam` (from `?ref=<base64url>`) has top priority.
2. `SOURCE_REFERERS` regex pattern matching on `targetUrl`.
3. Origin fallback (`new URL(targetUrl).origin`).
4. Default referer (`https://phim.nguonc.com/`).

**Observation & Minor Recommendation**:
In `SOURCE_REFERERS[0]`, the regex pattern is `/kkphimplayer|phim1280|phimapi\.com|kkphim/i`. While KKPhim stream URLs generated by `src/providers/kkphim.js` already explicitly include `&ref=${encodeBase64('https://player.phimapi.com/')}`, expanding the regex pattern to `/kkphimplayer|phim1280|phimapi\.com|kkphim|opstream|vlcdn/i` ensures direct segment access without `ref` parameters also matches `https://player.phimapi.com/`.

---

### 4.4 High-Performance Stream Delivery & HTTP Range 206 Seeking (`src/routes/hls.js` lines 330–387)

#### Requirement
> Thiết lập `responseType: 'stream'` / `'arraybuffer'`, `maxRedirects: 5`, hỗ trợ HTTP Range 206 cho playback seek.

#### Implementation Analysis
- **Stream Configuration**:
  ```javascript
  const upstreamRes = await axios({
    url: targetUrl,
    method: 'GET',
    responseType: 'stream',
    headers: upstreamHeaders,
    timeout: 25000,
    maxRedirects: 5,
    validateStatus: (status) => status >= 200 && status < 400,
  });
  ```
- **Range Request Forwarding**:
  ```javascript
  if (req.headers.range) {
    upstreamHeaders['Range'] = req.headers.range;
  }
  ```
- **Header Pass-Through & Response Piping**:
  ```javascript
  res.status(upstreamRes.status);
  if (upstreamRes.headers['content-range']) {
    res.setHeader('Content-Range', upstreamRes.headers['content-range']);
  }
  if (upstreamRes.headers['content-length']) {
    res.setHeader('Content-Length', upstreamRes.headers['content-length']);
  }
  if (upstreamRes.headers['accept-ranges']) {
    res.setHeader('Accept-Ranges', upstreamRes.headers['accept-ranges']);
  } else {
    res.setHeader('Accept-Ranges', 'bytes');
  }
  upstreamRes.data.pipe(res);
  ```

**Empirical Verification**:
- `tests/verify_playback.js` Phase 6 & 7 verified:
  - Video segment download: 7,447,877 bytes (~7.27 MB), HTTP 200, Content-Type `video/MP2T`, MPEG-TS sync byte `0x47` confirmed.
  - HTTP Range seek (bytes=0-1023): HTTP 206 Partial Content, Content-Range `bytes 0-1023/7447877`, length 1024 bytes confirmed.

---

### 4.5 Subtitle Proxying & In-App HLS Subtitle Injection

#### Implementation Analysis
- `/hls/sub.vtt` endpoint fetches subtitle files (either `data:` or remote URL), strips UTF-8 BOM, normalizes line breaks, converts SRT comma timestamps (`00:00:01,000` → `00:00:01.000`), ensures `WEBVTT` header, and serves as `Content-Type: text/vtt; charset=utf-8` with CORS `*`.
- When `&sub=<base64url>` is passed to `/hls/manifest.m3u8`, the master playlist rewriter injects:
  `#EXT-X-MEDIA:TYPE=SUBTITLES,GROUP-ID="subs",NAME="Tiếng Việt (VSMOV VIP)",DEFAULT=YES,AUTOSELECT=YES,FORCED=NO,LANGUAGE="vie",URI="${proxySubUrl}"`
  and binds `SUBTITLES="subs"` to `#EXT-X-STREAM-INF` lines.

---

## 5. Provider-to-HLS Proxy Interconnection Table

| Provider | ID | Referer Header Embedded in Stream URL | Direct M3U8 Extraction | Subtitle Support | In-App Invariant |
|---|---|---|---|---|---|
| **VSMOV 4K** | `vsmov` | `https://vsmov.com/` | `link_embed` / `link_m3u8` resolution (`*.streamvsmov.com`) | WebVTT / SRT via `/hls/sub.vtt` + Master M3U8 injection | `url` only, no `externalUrl` |
| **KKPhim** | `kkphim` | `https://player.phimapi.com/` | `link_m3u8` from `phimapi.com` episodes | — | `url` only, no `externalUrl` |
| **NguonC** | `nguonc` | `https://embed15.streamc.xyz/` | `m3u8` or `/hls/extract?b64=...` | — | `url` only, no `externalUrl` |
| **STP** | `stp` | `https://sieutamphim.pro/` | WP-JSON XOR 0x2a decoded m3u8 / PhimAPI mirror | — | `url` only, no `externalUrl` |
| **CLBPX** | `clbpx` | `https://clbphimxua.info/` | Ophim API m3u8 / HTML scraper | — | `url` only, no `externalUrl` |
| **YAN** | `yan` | `https://yanhh3d.pw/` | `data-obf.pU` / `master.m3u8` / Ophim fallback | — | `url` only, no `externalUrl` |
| **HH3D** | `hh3d` | `https://hh3d.tv/` | `phimapi.com` m3u8 | — | `url` only, no `externalUrl` |

---

## 6. Edge Case Analysis & Hardening Recommendations

1. **`SOURCE_REFERERS` Regex Pattern for KKPhim / Opstream / Vlcdn**:
   - Current: `/kkphimplayer|phim1280|phimapi\.com|kkphim/i`
   - Recommendation: Update to `/kkphimplayer|phim1280|phimapi\.com|kkphim|opstream|vlcdn/i` to explicitly cover standalone opstream/vlcdn CDN segment URLs if accessed without `&ref=`.

2. **M3U8 Parser Next-Line Dispatch Priority**:
   - In `src/routes/hls.js`:
     ```javascript
     if (isNextSubPlaylist || absUrl.includes('.m3u8') || absUrl.includes('playlist')) { ... }
     ```
   - When a media segment (`isNextSegment = true`) happens to contain `playlist` or `.m3u8` in a tracking parameter, it might be classified as a sub-playlist.
   - Recommendation: Prioritize `if (isNextSegment && !isNextSubPlaylist)` before checking `.includes('.m3u8')`.

3. **Reverse Proxy Proto/Host Detection**:
   - `src/routes/hls.js` uses `${req.headers['x-forwarded-proto'] || req.protocol}://${req.headers['x-forwarded-host'] || req.get('host')}`.
   - Verified that `x-forwarded-proto` and `x-forwarded-host` properly handle Cloudflare / Render / Railway SSL termination.

---

## 7. Verification Summary

| Test Suite | Command | Result | Details |
|---|---|---|---|
| **Syntax Verification** | `node --check src/index.js && node --check src/routes/hls.js` | **PASS (0 errors)** | Clean ECMAScript syntax |
| **Playback & Seeking E2E** | `node tests/verify_playback.js` | **PASS (7/7 Phases)** | Manifest v1.6.0, VSMOV 4K 2 audio streams, `/hls/sub.vtt` WebVTT, KKPhim series episode HTTP 200, Sub-variant rewriting, 7.4MB `.ts` chunk download (0x47 sync byte), HTTP 206 Range seek |
| **Hotfix Matrix E2E** | `node tests/verify_hotfix_vsmov_kkphim.js` | **PASS (27/27 Assertions)** | Subtitle endpoint, KKPhim smart search, M3U8 subtitle injection, TS chunk download |
| **New Providers E2E** | `node tests/verify_new_providers.js` | **PASS (26/26 Assertions)** | STP (XOR 0x2a), CLBPX, YAN live scraping, Manifest proxy referers, Range 206 |

---
**Report Status**: Complete & Verified.
