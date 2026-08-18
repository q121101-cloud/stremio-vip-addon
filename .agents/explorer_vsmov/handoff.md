# Handoff Report: VSMOV Multi-Server Audio Separation & Subtitle Proxy (Hotfix v1.5.1)

## 1. Observation

### 1.1 VSMOV API and Server Group Data Structure
- **API Base**: `https://vsmov.com/api`
- **Detail Endpoint**: `GET https://vsmov.com/api/phim/:slug` (`src/providers/vsmov.js:262-283`)
  - Returns `{ movie: { name, slug, type, ... }, episodes: [ ... ] }`.
  - The `episodes` array contains separate server group objects representing audio tracks and servers:
    - Example from live VSMOV API for *Harry Potter and the Order of the Phoenix* (`slug: harry-potter-va-menh-lenh-phuong-hoang`, `imdb: tt0373889`):
      - `episodes[0].server_name`: `"Vietsub\r\n #1"` -> contains `server_data: [{ name: 'Full', slug: 'tap-full', link_embed: 'https://v5.streamvsmov.com/video/382f09db-83ff-4d89-9be9-797162d4f2e6' }]`
      - `episodes[1].server_name`: `"Lồng tiếng #1"` -> contains `server_data: [{ name: 'Full', slug: 'tap-full', link_embed: 'https://v5.streamvsmov.com/video/9f623219-003a-4628-a72d-91461d3a1716' }]`
    - Other movies in catalog (e.g. *Spider-Man: No Way Home*, *Twilight of the Warriors: Walled In*) contain `"Thuyết minh #1"` or `"Vietsub 4K"` server tabs.

### 1.2 Server Audio Classification
- In `src/providers/vsmov.js:68-94`, `classifyServerAudio(serverName)` inspects `serverName`:
  - Matches `/l.{1,5}ng\s*ti.{1,5}ng/i` or `/long\s*tieng/i` -> `{ type: 'longtieng', label: 'Lồng Tiếng', bingeGroup: 'vsmov-longtieng-4k-vip-1' }`
  - Matches `/thuy.{1,5}t\s*minh/i` or `/thuyet\s*minh/i` -> `{ type: 'thuyetminh', label: 'Thuyết Minh', bingeGroup: 'vsmov-thuyetminh-4k-vip-1' }`
  - Default fallback -> `{ type: 'vietsub', label: 'Vietsub', bingeGroup: 'vsmov-vietsub-4k-vip-1' }`

### 1.3 Subtitle Extraction from Embed Player
- In `src/providers/vsmov.js:99-211`, `resolveEmbedMedia(linkEmbed, linkM3u8)`:
  - Fetches the embed HTML page from `link_embed` with a 3000ms timeout and VSMOV headers.
  - Extracts the embedded JavaScript object:
    `subtitles: [{"name":"vie 1785240078185 txr9be","type":"local","url":"/video/382f09db-83ff-4d89-9be9-797162d4f2e6/subtitle/vie_1785240078185_txr9be.vtt","_inSubtitleFolder":true,"code":"vie"}, ...]`
  - Resolves relative URLs (`/video/.../subtitle/...vtt`) to absolute URLs using the embed page origin (`https://v5.streamvsmov.com`).
  - Fallback regex handles inline subtitle paths (`.vtt` or `.srt`).

### 1.4 Stream Object Generation & Protocol Compliance
- In `src/providers/vsmov.js:571-594`:
  - Vietsub Stream:
    - `name`: `'VIP Movies 🎬'`
    - `title`: `[VIP 1 • VSMOV] Vietsub 4K Ultra HD (3840x2160)${epLabel} (HLS Proxy)\n⚡ Server VIP Vietsub • vsmov.com`
    - `url`: `${proxyBase}/hls/manifest.m3u8?url=${b64MasterUrl}&ref=${b64Ref}`
    - `behaviorHints`: `{ notWebReady: false, notSupported: false, bingeGroup: 'vsmov-vietsub-4k-vip-1' }`
    - `subtitles`: `[{ id: 'vi_vsmov', lang: 'vie', url: '${proxyBase}/hls/sub.vtt?url=${b64Sub}&ref=${b64Ref}' }]`
  - Lồng Tiếng Stream:
    - `name`: `'VIP Movies 🎬'`
    - `title`: `[VIP 1 • VSMOV] Lồng Tiếng 4K Ultra HD (3840x2160)${epLabel} (HLS Proxy)\n⚡ Server VIP Lồng Tiếng • vsmov.com`
    - `url`: `${proxyBase}/hls/manifest.m3u8?url=${b64MasterUrl}&ref=${b64Ref}`
    - `behaviorHints`: `{ notWebReady: false, notSupported: false, bingeGroup: 'vsmov-longtieng-4k-vip-1' }`
  - Thuyết Minh Stream:
    - `name`: `'VIP Movies 🎬'`
    - `title`: `[VIP 1 • VSMOV] Thuyết Minh 4K Ultra HD (3840x2160)${epLabel} (HLS Proxy)\n⚡ Server VIP Thuyết Minh • vsmov.com`
    - `url`: `${proxyBase}/hls/manifest.m3u8?url=${b64MasterUrl}&ref=${b64Ref}`
    - `behaviorHints`: `{ notWebReady: false, notSupported: false, bingeGroup: 'vsmov-thuyetminh-4k-vip-1' }`
  - **In-App Direct Play Invariant**: Every stream object strictly has `url` and `delete sanitized.externalUrl` is enforced in `src/handlers.js:957`.

### 1.5 Subtitle Proxy Route (`src/routes/hls.js`)
- Route: `GET /hls/sub.vtt` (and alias `/sub`) (`src/routes/hls.js:374-432`)
  - Parameters accepted: `url`, `b64`, `sub`, with optional `ref`/`referer`. Supports plain text or Base64URL encoding.
  - Upstream headers: `Referer: https://vsmov.com/`, `Origin: https://vsmov.com`, Chrome User-Agent.
  - Response headers: `Content-Type: text/vtt; charset=utf-8`, `Access-Control-Allow-Origin: *`, `Cache-Control: public, max-age=86400`.
  - Processing: Strips UTF-8 BOM (`\uFEFF` / `0xFEFF`), normalizes line endings (`\r\n` -> `\n`), and automatically converts SRT timestamps (`00:00:01,000` -> `00:00:01.000`) and prepends `WEBVTT\n\n`.

---

## 2. Logic Chain

1. **Server Group Identification**: VSMOV provides distinct video sources per audio tab in the `episodes` array returned by `/phim/:slug`. By iterating over every server entry in `episodes` rather than taking only `episodes[0]`, `vsmov.js` captures all available audio variants (`Vietsub`, `Lồng Tiếng`, `Thuyết Minh`).
2. **Audio Classification & Binge Group Isolation**: By regex-matching the Vietnamese server names (including accent variations and whitespace/newline artifacts), `classifyServerAudio` assigns the accurate label and a distinct `bingeGroup` (`vsmov-vietsub-4k-vip-1`, `vsmov-longtieng-4k-vip-1`, `vsmov-thuyetminh-4k-vip-1`). This guarantees that Stremio's auto-play continues within the same audio track across episodes.
3. **Player Embed Parsing & Subtitle Extraction**: The embed page contains JSON configurations with subtitle tracks. When `playerOptions.subtitles` contains a Vietnamese track (`code: 'vie'`), `resolveEmbedMedia` extracts and normalizes the URL.
4. **Anti-CORS & Anti-403 Proxying**: Upstream subtitle and HLS files require `Referer: https://vsmov.com/` and `Origin: https://vsmov.com`. Proxying subtitles via `/hls/sub.vtt` with Base64URL-encoded target parameters and setting `Access-Control-Allow-Origin: *` ensures Stremio web and mobile clients load subtitles without CORS rejections.
5. **SRT-to-WebVTT Conversion**: Stremio expects valid WebVTT format (`WEBVTT` header and period timestamp separators). Auto-detecting non-WebVTT content and converting comma timestamps ensures 100% subtitle renderer compatibility.

---

## 3. Caveats

1. **Subtitles Availability**: Not all VSMOV titles have separate subtitle files (some releases have hardcoded subtitles or audio dubs without soft subs). When `subtitleUrl` is null, the `subtitles` array is omitted cleanly from the stream object.
2. **VSMOV IMDb Mapping vs Title Search**: On VSMOV API, some movies (e.g. Harry Potter franchise) have specific IMDb IDs mapped (`tt0373889` -> *Harry Potter và Mệnh Lệnh Phượng Hoàng* / *Order of the Phoenix*). If IMDb ID direct search returns nothing, the fallback title/alias search with year/season scoring resolves the correct detail slug.
3. **Embed Domain Fluctuations**: VSMOV uses dynamic embed subdomains (`v5.streamvsmov.com`, `v14.streamvsmov.com`, `p25.streamvsmov.com`). The proxy resolves relative URLs against the embed origin and uses generic origin detection in `src/routes/hls.js:29`.

---

## 4. Conclusion

- The implementation in `src/providers/vsmov.js` and `src/routes/hls.js` fully satisfies all R1 and R2 requirements of Hotfix v1.5.1.
- Multi-server separation correctly produces distinct `Vietsub`, `Lồng Tiếng`, and `Thuyết Minh` 4K stream objects with the exact required title headers and binge groups.
- WebVTT/SRT subtitles are extracted from the embed player, proxied via `GET /hls/sub.vtt`, and injected into Stremio stream objects.
- All streams adhere to the strict In-App Direct Play protocol (`url` included, `externalUrl` omitted).

---

## 5. Verification Method

### Automated Test Commands
1. **Subtitle Proxy & Stream Subtitles Unit/Integration Tests**:
   ```bash
   node tests/test_m1_subtitle_proxy.js
   ```
   *Expected*: 27/27 assertions pass with 0 failures.

2. **Core Integration Test Suite**:
   ```bash
   npm test
   ```
   *Expected*: 50/50 assertions pass with 0 failures.

3. **Live VSMOV Multi-Server & Subtitle Verification**:
   ```bash
   node -e '
   const vsmov = require("./src/providers/vsmov");
   (async () => {
     const streams = await vsmov.getStreams({
       imdbId: "tt0373889",
       title: "Harry Potter and the Order of the Phoenix",
       type: "movie",
       proxyBase: "http://localhost:7000"
     });
     console.log("Stream count:", streams.length);
     console.log(JSON.stringify(streams, null, 2));
     if (streams.length < 2) throw new Error("Expected at least 2 distinct audio streams");
   })();'
   ```
   *Expected*: Returns 2 distinct streams (Vietsub with proxied subtitle and Lồng Tiếng).
