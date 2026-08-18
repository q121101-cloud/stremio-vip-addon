# VSMOV Subtitle Injection & HLS Route Handling Survey Report (Hotfix v1.5.2)

**Author:** Explorer Agent  
**Date:** 2026-08-18  
**Scope:** Investigation of VSMOV 4K subtitle extraction, Stremio stream protocol subtitle structure, `/hls/sub.vtt` proxy endpoint, and HLS Master M3U8 `#EXT-X-MEDIA:TYPE=SUBTITLES` playlist rewriting in `stremio-nguonc-addon`.

---

## 1. Executive Summary

This survey provides a complete technical analysis of VSMOV WebVTT/SRT subtitle extraction and HLS proxy stream handling for Hotfix v1.5.2. It details the exact code paths, data structures, network protocols, edge cases, and concrete code changes required to:
1. Extract Vietnamese subtitle links (`.vtt` and `.srt`) from VSMOV embed players (`vsmov.com` / `*.streamvsmov.com`).
2. Attach fully-formed `subtitles: [{ id: "vi_vsmov", lang: "vie", url: proxySubUrl, title: "Tiếng Việt (VSMOV VIP)" }]` arrays to Stremio stream objects.
3. Proxy and convert subtitles through `/hls/sub.vtt` with full CORS (`*`), HTTP caching (`max-age=86400`), BOM stripping, and SRT-to-WebVTT timestamp normalization (`00:00:00,000` -> `00:00:00.000`).
4. Rewrite Master M3U8 manifests (`/hls/manifest.m3u8`) with `#EXT-X-MEDIA:TYPE=SUBTITLES` tags and `SUBTITLES="subs"` attributes for automatic player detection in ExoPlayer, VLC, Nuvio, and Stremio.

---

## 2. VSMOV Episode & Subtitle Extraction Analysis (`src/providers/vsmov.js`)

### 2.1 API Endpoints & Data Model
- **Base API URL:** `https://vsmov.com/api`
- **Search Endpoint:** `GET /tim-kiem?keyword={keyword}&page={page}`
- **Detail Endpoint:** `GET /phim/{slug}`
  - Returns `{ movie: { name, slug, year, type, ... }, episodes: [ ... ] }`
- **Episode Structure (`movieData.episodes`):**
  - Array of server groups representing audio options (`Vietsub #1`, `Lồng Tiếng #1`, `Thuyết Minh #1`).
  - Each server object contains `server_data` array with items:
    ```json
    {
      "name": "Full",
      "slug": "tap-full",
      "filename": "Full",
      "link_embed": "https://v6.streamvsmov.com/video/3c499dca-dbf3-44e2-9317-7b69d6af6147",
      "link_m3u8": ""
    }
    ```

### 2.2 Subtitle Extraction Architecture (`resolveEmbedMedia`)
- **Location:** `src/providers/vsmov.js` lines 99–211.
- **Workflow:**
  1. Performs HTTP GET to `targetEp.link_embed` with `Referer: https://vsmov.com/` and 3000ms timeout.
  2. Inspects HTML response body for subtitle links:
     - **Primary:** `playerOptions.subtitles` JSON array regex: `/subtitles\s*:\s*(\[[^\]]*\])/i`. Matches entries with `code: "vie"|"vi"`, `lang: "vie"|"vi"`, or name matching `/vie|tiếng việt|viet/i`.
     - **Fallback 1:** Direct regex matching `.vtt` / `.srt` URLs:
       `/(?:["'\x27])(https?:\/\/[^"'\x27\s]+\.(?:vtt|srt)[^"'\x27\s]*)(?:["'\x27])/i`
     - **Fallback 2:** Relative subtitle paths `/(?:["'\x27])(\/[^"'\x27\s]+\.(?:vtt|srt)[^"'\x27\s]*)(?:["'\x27])/i`, resolved using `new URL(subtitleUrl, embedOrigin).href`.
  3. Caches resolved `{ masterPlaylistUrl, subtitleUrl }` in `imdbCache` (`vsmov:embed:{linkEmbed}`) for 86,400s (24h).

### 2.3 Live Empirical Verification
Empirical testing on VSMOV production endpoint:
- **Film:** *Avengers: Endgame* (`avengers-4-hoi-ket-178544376755563`)
  - `masterPlaylistUrl`: `https://v6.streamvsmov.com/stream/3c499dca-dbf3-44e2-9317-7b69d6af6147/master.m3u8`
  - `subtitleUrl`: `https://v6.streamvsmov.com/video/3c499dca-dbf3-44e2-9317-7b69d6af6147/subtitle/vie_1785443679677_c0nzvu.vtt`
- **Subtitle file content:** Returns HTTP 200, `Content-Type: text/vtt; charset=utf-8`, valid WebVTT cue payload.

---

## 3. Stremio Stream Object & Subtitle Protocol Structure

### 3.1 Requirements for Stremio Stream Objects
Per Stremio Addon Protocol specification and Hotfix v1.5.2 R1 requirement:
```json
{
  "name": "VIP Movies 🎬",
  "title": "[VIP 1 • VSMOV] Vietsub 4K Ultra HD (3840x2160) (HLS Proxy)\n⚡ Server VIP Vietsub • vsmov.com",
  "url": "http://localhost:7000/hls/manifest.m3u8?url={b64MasterUrl}&ref={b64Ref}&sub={b64Sub}",
  "behaviorHints": {
    "notWebReady": false,
    "notSupported": false,
    "bingeGroup": "vsmov-vietsub-4k-vip-1"
  },
  "subtitles": [
    {
      "id": "vi_vsmov",
      "lang": "vie",
      "url": "http://localhost:7000/hls/sub.vtt?url={b64Sub}&ref={b64Ref}",
      "title": "Tiếng Việt (VSMOV VIP)"
    }
  ]
}
```

### 3.2 Findings & Gaps in Current Code
1. **`src/providers/vsmov.js` (lines 582–593):**
   - Current:
     ```javascript
     if (subtitleUrl) {
       const b64Sub = encodeBase64(subtitleUrl);
       const proxySubUrl = `${proxyBase || ''}/hls/sub.vtt?url=${b64Sub}&ref=${b64Ref}`;
       streamObj.subtitles = [
         {
           id: 'vi_vsmov',
           lang: 'vie',
           url: proxySubUrl,
         },
       ];
     }
     ```
   - **Gap:** Missing `title: 'Tiếng Việt (VSMOV VIP)'` in the subtitle object.
   - **Gap:** `streamUrl` (`/hls/manifest.m3u8`) does not append `&sub=${b64Sub}` to facilitate downstream HLS master playlist rewrite.
2. **`src/handlers.js` (lines 1600–1615):**
   - Correctly passes `sanitized.subtitles = item.subtitles;` to the JSON response.
   - Robustness improvement: Ensure subtitle array objects strictly conform to `{ id, lang, url, title }`.

---

## 4. Subtitle Proxy Endpoint `/hls/sub.vtt` (`src/routes/hls.js`)

### 4.1 Route Specification
- **Routes:** `GET /hls/sub.vtt` and alias `GET /hls/sub`
- **Supported Parameters:** `url`, `b64`, `sub`, `ref`, `referer` (plain URL, standard Base64, and Base64URL)
- **Response Headers:**
  - `Content-Type: text/vtt; charset=utf-8`
  - `Access-Control-Allow-Origin: *`
  - `Access-Control-Allow-Headers: *`
  - `Access-Control-Allow-Methods: GET, HEAD, OPTIONS`
  - `Cache-Control: public, max-age=86400`

### 4.2 SRT-to-WebVTT Conversion Pipeline
1. **Fetch upstream:** Uses Axios with custom `HLS_UA` and `Referer` (`https://vsmov.com/` or dynamic `ref`).
2. **BOM stripping:** `if (content.charCodeAt(0) === 0xFEFF || content.startsWith('\uFEFF')) content = content.slice(1);`
3. **CRLF normalization:** `content = content.replace(/\r\n/g, '\n').replace(/\r/g, '\n').trim();`
4. **SRT format detection & conversion:**
   ```javascript
   if (!content.startsWith('WEBVTT')) {
     const convertedTimestamps = content.replace(/(\d{2}:\d{2}:\d{2}),(\d{3})/g, '$1.$2');
     content = `WEBVTT\n\n${convertedTimestamps}`;
   }
   ```
5. **Direct Data URI handling:** If `targetUrl` is a `data:` URI (e.g. in test mocks), parses base64/plain payload without network round-trip.

---

## 5. Master M3U8 Subtitle Playlist Rewriter (`src/routes/hls.js`)

### 5.1 RFC 8216 & Player Compatibility
Modern video players (ExoPlayer on Android TV / Google TV, VLC Player on PC/Mac, Nuvio Player on iOS/macOS, AVPlayer, and hls.js in web browsers) discover subtitles in HLS streams through Master Playlist `#EXT-X-MEDIA:TYPE=SUBTITLES` tags:

```m3u8
#EXTM3U
#EXT-X-VERSION:3
#EXT-X-MEDIA:TYPE=SUBTITLES,GROUP-ID="subs",NAME="Tiếng Việt (VSMOV VIP)",DEFAULT=YES,AUTOSELECT=YES,FORCED=NO,LANGUAGE="vie",URI="http://localhost:7000/hls/sub.vtt?url=...&ref=..."
#EXT-X-STREAM-INF:BANDWIDTH=12000000,RESOLUTION=3840x2160,SUBTITLES="subs"
http://localhost:7000/hls/manifest.m3u8?url=...
```

### 5.2 Required Rewriter Logic in `GET /hls/manifest.m3u8`
1. **Parameter parsing:** Extract `subParam = resolveParamUrl(req.query.sub || req.query.subtitle || req.query.sub_url)`.
2. **Cache key isolation:** Key must be `m3u8:${protoHost}:${targetUrl}:${subParam || ''}` to avoid collision between streams with and without subtitles.
3. **Master playlist rewrite step:**
   - When rewriting lines:
     - Check if stream contains `#EXT-X-STREAM-INF` (Master Playlist) or only `#EXTINF` (Media Playlist).
     - If `subParam` is present, construct proxy subtitle URI:
       `const proxySubUri = "${protoHost}/hls/sub.vtt?url=${encodeBase64(subUrl)}&ref=${encodedRef}";`
     - Inject tag:
       `#EXT-X-MEDIA:TYPE=SUBTITLES,GROUP-ID="subs",NAME="Tiếng Việt (VSMOV VIP)",DEFAULT=YES,AUTOSELECT=YES,FORCED=NO,LANGUAGE="vie",URI="${proxySubUri}"`
       immediately after `#EXTM3U` or `#EXT-X-VERSION`.
     - Append `,SUBTITLES="subs"` to any `#EXT-X-STREAM-INF` line missing the `SUBTITLES=` attribute.
   - For existing upstream `#EXT-X-MEDIA` tags:
     - If `t.includes('TYPE=SUBTITLES')` and URI ends in `.vtt` / `.srt`, rewrite to `${protoHost}/hls/sub.vtt?url=${b64Uri}&ref=${encodedRef}`.
     - If URI ends in `.m3u8`, rewrite to `${protoHost}/hls/manifest.m3u8?url=${b64Uri}&ref=${encodedRef}`.

---

## 6. Exact File Locations & Proposed Changes Summary

| Component | File | Lines | Proposed Change |
|---|---|---|---|
| **VSMOV Subtitle Object** | `src/providers/vsmov.js` | 565, 582–593 | 1. Append `&sub=${b64Sub}` to `streamUrl`<br>2. Add `title: "Tiếng Việt (VSMOV VIP)"` to `subtitles[0]` |
| **HLS Master M3U8 Subtitle Injection** | `src/routes/hls.js` | 146–275 | 1. Parse `req.query.sub`<br>2. Include `subParam` in `m3u8Cache` key<br>3. Inject `#EXT-X-MEDIA:TYPE=SUBTITLES` at top of Master M3U8<br>4. Link `#EXT-X-STREAM-INF` with `SUBTITLES="subs"` |
| **Subtitle Proxy Robustness** | `src/routes/hls.js` | 374–432 | Support `data:` URI decoding and maintain `text/vtt; charset=utf-8` + `Cache-Control: public, max-age=86400` |
| **Aggregator Stream Sanitizer** | `src/handlers.js` | 1600–1616 | Standardize subtitle objects: `{ id, lang, url, title }` |
| **Version & Manifest** | `package.json`, `src/manifest.js` | `version` | Update to `"1.5.2"` |

---

## 7. Edge Cases & Resilience Strategy

1. **Missing Subtitles on Upstream:** If VSMOV does not have subtitles for a specific server (e.g. Lồng Tiếng), `subtitleUrl` is null. `streamObj.subtitles` is omitted cleanly; no broken subtitle tracks or 404 URLs are injected.
2. **Obfuscated / Non-Standard SRT:** Handles comma timestamps, Windows CRLF (`\r\n`), Mac CR (`\r`), and UTF-8 BOM characters.
3. **Player Headers & CORS:** `/hls/sub.vtt` and `/hls/manifest.m3u8` set `Access-Control-Allow-Origin: *` to prevent CORS blocking on Stremio Web and third-party WebVTT parsers.
4. **Timeout Isolation:** VSMOV provider has a 5s Axios timeout; embed resolution has 3s timeout. If VSMOV embed parsing is slow or fails, provider continues without blocking other providers (KKPhim, NguonC).
