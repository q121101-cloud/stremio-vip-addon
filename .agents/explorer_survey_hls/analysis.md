# Comprehensive Analysis Report: HLS Proxy & Streaming Architecture

**Author**: Survey Explorer 1 (HLS Proxy & Streaming Architecture)  
**Date**: 2026-08-18  
**Scope**: `src/routes/hls.js`, `src/lib/utils.js`, `src/mapper.js`, and provider stream generation across all providers (`kkphim`, `nguonc`, `vsmov`, `stp`, `clbpx`, `yan`).

---

## 1. Executive Summary

The HLS proxy architecture in `src/routes/hls.js` serves as the central streaming gateway for the VIP Movies Stremio Addon. Its primary function is to bypass upstream CDN restrictions (403 Forbidden, CORS origin blocks, hotlinking defenses, and missing Range request support) by:
1. Acting as an intermediary that dynamically proxies and rewrites HLS Master and Media playlists (`/hls/manifest.m3u8`).
2. Forwarding segment requests (`/hls/segment.ts`) with spoofed browser headers, HTTP Range header propagation (HTTP 206 Partial Content), and MPEG-TS binary validation.
3. Managing AES-128 decryption key requests (`/hls/key`) and subtitle track proxies (`/hls/sub.vtt`).
4. Resolving multi-level URL hierarchies so that nested sub-variant playlists and relative segment URLs resolve accurately against their parent `baseUrl`, eliminating 404 Not Found errors on Korean, US-UK, and Asian CDNs.

---

## 2. Architecture & Playlist Parsing / Rewriting Pipeline (`src/routes/hls.js`)

### 2.1 Multi-Level M3U8 Parent Resolver Mechanics
HLS streams typically have two hierarchical playlist tiers:
1. **Master Playlist (Variant Stream Manifest)**: Contains `#EXT-X-STREAM-INF`, `#EXT-X-I-FRAME-STREAM-INF`, and `#EXT-X-MEDIA` tags referencing multiple quality variants (e.g., 4K 2160p, 1080p, 720p), audio renditions, and subtitle playlists.
2. **Media Playlist (Sub-variant Segment Manifest)**: Contains `#EXTINF`, `#EXT-X-KEY`, `#EXT-X-MAP`, `#EXT-X-PART`, and `#EXT-X-PRELOAD-HINT` tags referencing individual `.ts` / `.mp4` chunks and encryption keys.

#### Codebase Implementation (`src/routes/hls.js:180-297`):
- **Base URL Extraction**:
  ```javascript
  let baseUrl;
  try { baseUrl = new URL(targetUrl); } catch { return res.send(r.data); }
  ```
- **Master Playlist Tag Detection**:
  - `#EXT-X-STREAM-INF` / `#EXT-X-I-FRAME-STREAM-INF` (lines 201–219):
    Sets `isMasterPlaylist = true`, `isNextSubPlaylist = true`, and rewrites `URI="..."` tags if present.
  - `#EXT-X-MEDIA` (lines 229–243):
    Rewrites audio and subtitle rendition URIs to `${protoHost}/hls/manifest.m3u8` (or `/hls/sub.vtt` for `.vtt`/`.srt`).
- **Media Playlist Tag Detection**:
  - `#EXTINF` (lines 221–227):
    Sets `isNextSegment = true`, `isNextSubPlaylist = false`.
  - `#EXT-X-KEY` / `#EXT-X-SESSION-KEY` (lines 245–255):
    Rewrites encryption key URI to `${protoHost}/hls/key?url=${b64Key}&ref=${encodedRef}` while preserving `METHOD`, `IV`, and key format.
  - `#EXT-X-MAP` (lines 257–267):
    Rewrites initialization segment URI (for fMP4) to `${protoHost}/hls/segment.ts?url=${b64Map}&ref=${encodedRef}`.
  - `#EXT-X-PART` / `#EXT-X-PRELOAD-HINT` (lines 269–279):
    Rewrites Low-Latency HLS partial chunks to `${protoHost}/hls/segment.ts?url=${b64Part}&ref=${encodedRef}`.
- **URI Line Parsing & Parent URL Resolution** (lines 285–297):
  ```javascript
  const absUrl = t.startsWith('http') ? t : new URL(t, baseUrl.href).href;
  const b64Url = Buffer.from(absUrl).toString('base64url');

  if (isNextSubPlaylist || absUrl.includes('.m3u8') || absUrl.includes('playlist')) {
    isNextSubPlaylist = false;
    rewrittenLines.push(`${protoHost}/hls/manifest.m3u8?url=${b64Url}&ref=${encodedRef}`);
    continue;
  }

  isNextSegment = false;
  rewrittenLines.push(`${protoHost}/hls/segment.ts?url=${b64Url}&ref=${encodedRef}`);
  ```

#### Why Multi-Level Resolution Solves 404 Errors:
When a master playlist at `http://cdn.example.com/movie/master.m3u8` references a sub-variant `sub/1080p.m3u8`, the master rewriter rewrites the variant line to `/hls/manifest.m3u8?url=base64(http://cdn.example.com/movie/sub/1080p.m3u8)`.
When the player subsequently fetches that sub-variant manifest, `targetUrl` becomes `http://cdn.example.com/movie/sub/1080p.m3u8`. Its `baseUrl` is `http://cdn.example.com/movie/sub/1080p.m3u8`.
When the sub-variant contains relative segment lines like `segment_001.ts` or `../shared/seg_002.ts`, `new URL(t, baseUrl.href)` resolves relative to `http://cdn.example.com/movie/sub/`, resulting in `http://cdn.example.com/movie/sub/segment_001.ts` and `http://cdn.example.com/movie/shared/seg_002.ts`. This prevents 404 errors that would occur if resolved against the master playlist root.

---

## 3. Base64 Encoding / Decoding & Parameter Handling

### 3.1 Functions in `src/routes/hls.js` (lines 80-110):
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

function resolveParamUrl(val) {
  if (!val || typeof val !== 'string') return null;
  const trimmed = val.trim();
  if (!trimmed) return null;
  if (trimmed.startsWith('http://') || trimmed.startsWith('https://') || trimmed.startsWith('data:')) return trimmed;
  const decoded = decodeB64(trimmed);
  if (decoded) {
    const trimmedDecoded = decoded.trim();
    if (!trimmedDecoded) return null;
    return trimmedDecoded;
  }
  return trimmed;
}
```

### 3.2 Robustness Analysis:
- **Polymorphic Parameter Acceptance**: Accepts raw URLs (`http://...`, `https://...`, `data:...`), Base64URL-encoded strings (`Buffer.from(url).toString('base64url')`), and Standard Base64 (`base64`).
- **Query Parameter Aliases**:
  - URL parameter checked across `req.query.url`, `req.query.b64`, `req.query.embed`.
  - Subtitle parameter checked across `req.query.sub`, `req.query.subtitle`, `req.query.sub_url`.
  - Referer parameter checked across `req.query.ref`, `req.query.referer`.
- **Base64 Encoding across Providers**:
  - `src/providers/kkphim.js`: `Buffer.from(str, 'utf8').toString('base64url')`
  - `src/providers/nguonc.js`: `Buffer.from(str, 'utf8').toString('base64url')`
  - `src/providers/vsmov.js`: `Buffer.from(str, 'utf8').toString('base64url')`
  - `src/providers/stp.js`: `Buffer.from(str, 'utf8').toString('base64url')`
  - `src/providers/clbpx.js`: `Buffer.from(str, 'utf8').toString('base64url')`
  - `src/providers/yan.js`: `Buffer.from(str, 'utf8').toString('base64url')`
  - `src/mapper.js`: `Buffer.from(str, 'utf8').toString('base64url')`

---

## 4. Referer & Origin Header Spoofing Architecture

To prevent CDN 403 Forbidden responses, the proxy spoofing layer dynamically computes the exact upstream headers required by each content delivery network.

### 4.1 Provider Header Mapping Table (`src/routes/hls.js:27-36`):

| Provider | Target URL Regex Pattern | Spoofed `Referer` | Spoofed `Origin` |
| :--- | :--- | :--- | :--- |
| **KKPhim / Opstream / Vlcdn / Phim1280** | `/kkphimplayer\|phim1280\|phimapi\.com\|kkphim\|opstream\|vlcdn/i` | `https://player.phimapi.com/` | `https://player.phimapi.com` |
| **VSMOV 4K** | `/vsmov\|streamvsmov\|p25\.streamvsmov/i` | `https://vsmov.com/` | `https://vsmov.com` |
| **NguonC Official** | `/nguonc\.com/i` | `https://phim.nguonc.com/` | `https://phim.nguonc.com` |
| **StreamC / Amass2 (NguonC CDN)** | `/streamc\.\|amass2\.top/i` | `https://embed15.streamc.xyz/` | `https://embed15.streamc.xyz` |
| **STP (Sieutamphim / Suutamphim / TVHay)** | `/sieutamphim\|suutamphim\|tvhay/i` | `https://sieutamphim.pro/` | `https://sieutamphim.pro` |
| **YAN (Yanhh3d / FBCDN Cloud / Defifa)** | `/yanhh3d\|yan\|fbcdn\.cloud\|defifa\.com/i` | `https://yanhh3d.pw/` | `https://yanhh3d.pw` |
| **HH3D (Hoathinh3d)** | `/hh3d\|hoathinh3d/i` | `https://hh3d.tv/` | `https://hh3d.tv` |
| **CLBPX (CLB Phim Xưa)** | `/clbphimxua\|clbpx/i` | `https://clbphimxua.info/` | `https://clbphimxua.info` |
| **Default Fallback** | Fallback to URL's origin or default | `${new URL(targetUrl).origin}/` | `${new URL(targetUrl).origin}` |

### 4.2 Dynamic Header Resolution Logic (`src/routes/hls.js:43-67`):
```javascript
function getRefererHeaders(targetUrl, refParam) {
  if (refParam) {
    try {
      let parsedRef = refParam.trim();
      if (!parsedRef.startsWith('http://') && !parsedRef.startsWith('https://')) {
        parsedRef = `https://${parsedRef}`;
      }
      const origin = new URL(parsedRef).origin;
      return { referer: parsedRef, origin };
    } catch {}
  }

  for (const src of SOURCE_REFERERS) {
    if (src.pattern.test(targetUrl)) {
      return { referer: src.referer, origin: src.origin };
    }
  }

  try {
    const origin = new URL(targetUrl).origin;
    return { referer: `${origin}/`, origin };
  } catch {
    return { referer: DEFAULT_REFERER, origin: 'https://phim.nguonc.com' };
  }
}
```

### 4.3 Browser Headers for Axios Requests:
- `User-Agent`: Desktop Chrome (`Mozilla/5.0 ... Chrome/126.0.0.0 Safari/537.36`)
- `Accept`: `*/*`
- `Accept-Language`: `vi,en-US;q=0.9,en;q=0.8` (or `vi-VN,vi;q=0.9,en-US;q=0.8`)
- `Connection`: `keep-alive`

---

## 5. Binary Response Handling & Video Segment Streaming (`/hls/segment.ts`)

### 5.1 Route Details (`src/routes/hls.js:329-387`):
- **Routes & Aliases**: `/segment.ts`, `/ts`, `/segment`, `/ts-proxy`.
- **Response Headers**:
  - `Content-Type`: `video/MP2T` (or `application/octet-stream` if `is_key` is requested).
  - `Access-Control-Allow-Origin`: `*` (Full CORS compliance).
  - `Cache-Control`: `public, max-age=31536000, immutable` (or `public, max-age=3600`).
  - `Accept-Ranges`: `bytes`.
  - `Content-Range` & `Content-Length`: Forwarded from upstream response.

### 5.2 Stream Piping vs ArrayBuffer:
- **Current Streaming Implementation**:
  - Uses `responseType: 'stream'` with `upstreamRes.data.pipe(res)`.
  - `timeout: 25000`, `maxRedirects: 5`.
  - Supports HTTP Range requests directly: If the player sends `Range: bytes=0-1023`, the Range header is forwarded upstream. Upstream responds with `HTTP 206 Partial Content`, and the chunk stream is piped back to the player with matching `Content-Range`.
- **ArrayBuffer Variant (as mentioned in R1 specification)**:
  - If configured as `responseType: 'arraybuffer'`, `axios` buffers the entire segment into memory before returning `Buffer.from(r.data)`.
  - `stream.pipe` is highly efficient for high-throughput video streaming because it maintains low memory overhead on the Node.js server under concurrent playback.
  - In either case, the first byte of MPEG-TS chunks is verified to be `0x47` (TS Sync byte), and subsequent 188-byte packet boundaries also align with `0x47`.

---

## 6. Empirical Test Verification

### 6.1 Executed Test Suites:
1. `tests/challenger_m1_2_deep_hls.test.js`:
   - **Result**: `104 / 104 assertions PASS (100% SUCCESS)`.
   - Verified 4K (3840x2160) master playlist rewriting, audio renditions, subtitle tracks, I-Frame streams.
   - Verified AES-128 decryption keys and session keys.
   - Verified fMP4 initialization maps (`#EXT-X-MAP`) and Low-Latency HLS parts (`#EXT-X-PART`, `#EXT-X-PRELOAD-HINT`).
   - Verified relative path parent resolution (`../parent_segment_1003.ts`, `subfolder/segment_1002.ts`, `/root_segment_1004.ts`).
   - Verified real live segment download from CDN (`cuu-mon`), MPEG-TS sync byte `0x47`, chunk size > 900KB, and Range 206 Partial Content seeking.
   - Verified 30 concurrent manifest & segment requests under load.
   - Verified 400/502 error boundaries and OPTIONS CORS preflight (204).
2. `npm test` (`src/test.js`):
   - **Result**: `50 / 50 test assertions PASS (100% SUCCESS)`.
3. `node --check src/index.js`:
   - **Result**: Syntax check passed with 0 errors.

---

## 7. Recommendations for Engine v1.7.0

1. **Keep Multi-Level Resolution Strict**: Ensure all sub-variant playlists pass the encoded `ref` parameter and that relative segment lines always resolve against the sub-variant manifest's URL.
2. **Consistent Referer Table**: The `SOURCE_REFERERS` table in `src/routes/hls.js` already covers all required domains (`player.phimapi.com`, `vsmov.com`, `phim.nguonc.com`, `embed15.streamc.xyz`, `sieutamphim.pro`, `clbphimxua.info`, `yanhh3d.pw`, `hh3d.tv`). Ensure all providers consistently pass their respective base referer URL in the stream generation methods.
3. **Stream Pipeline Stability**: The stream piping mechanism in `/hls/segment.ts` with Range request forwarding and fallback headers provides high performance and seek accuracy across Stremio clients (Web, Desktop, Android, Android TV).
