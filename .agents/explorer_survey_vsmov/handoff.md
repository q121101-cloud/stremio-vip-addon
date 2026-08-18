# Handoff Report — Explorer Survey VSMOV Subtitle & HLS Handling (Hotfix v1.5.2)

**Agent Role:** Explorer  
**Date:** 2026-08-18  
**Working Directory:** `/Users/quan/.gemini/antigravity/scratch/stremio-nguonc-addon/.agents/explorer_survey_vsmov`  
**Milestone:** Hotfix v1.5.2 VSMOV Subtitles & HLS Survey  

---

## 1. Observation

1. **VSMOV Provider Subtitle Extraction:**
   - File: `/Users/quan/.gemini/antigravity/scratch/stremio-nguonc-addon/src/providers/vsmov.js`
   - Lines 99–211 (`resolveEmbedMedia`):
     ```javascript
     const mSub = html.match(/subtitles\s*:\s*(\[[^\]]*\])/i);
     ```
     Resolves embedded WebVTT/SRT subtitle URL from `playerOptions.subtitles` and fallback regex.
   - Lines 582–593 (`getStreams`):
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
     `title: "Tiếng Việt (VSMOV VIP)"` is currently omitted on stream subtitles array. `streamUrl` on line 565 does not yet pass `&sub=${b64Sub}`.

2. **HLS Proxy Router & `/hls/sub.vtt` Subtitle Endpoint:**
   - File: `/Users/quan/.gemini/antigravity/scratch/stremio-nguonc-addon/src/routes/hls.js`
   - Lines 374–432:
     `GET /hls/sub.vtt` and `GET /hls/sub` return `Content-Type: text/vtt; charset=utf-8`, `Access-Control-Allow-Origin: *`, `Cache-Control: public, max-age=86400`. Converts SRT comma timestamps `00:00:00,000` to dot timestamps `00:00:00.000` and prepends `WEBVTT\n\n`.
   - Lines 146–275:
     `GET /hls/manifest.m3u8` rewrites variant stream lines, but does not yet accept `req.query.sub` or inject `#EXT-X-MEDIA:TYPE=SUBTITLES` into Master M3U8.

3. **Live Production API Output:**
   - Command: `node -e '...'` testing `avengers-4-hoi-ket-178544376755563`:
     Resolved `masterPlaylistUrl = 'https://v6.streamvsmov.com/stream/3c499dca-dbf3-44e2-9317-7b69d6af6147/master.m3u8'`
     Resolved `subtitleUrl = 'https://v6.streamvsmov.com/video/3c499dca-dbf3-44e2-9317-7b69d6af6147/subtitle/vie_1785443679677_c0nzvu.vtt'`
   - Testing `/hls/sub.vtt` with live VSMOV subtitle returned HTTP 200, `Content-Type: text/vtt; charset=utf-8`, `Cache-Control: public, max-age=86400`, `Access-Control-Allow-Origin: *`.

---

## 2. Logic Chain

1. **Step 1 (Extraction):** `resolveEmbedMedia` in `src/providers/vsmov.js` fetches `targetEp.link_embed` and extracts the live subtitle URL (`.vtt` / `.srt`) via regex and JSON parsing from `playerOptions.subtitles`.
2. **Step 2 (Stremio Stream Object):** In `getStreams()`, when `subtitleUrl` is present, encode the subtitle URL using Base64URL and attach `subtitles: [{ id: "vi_vsmov", lang: "vie", url: proxySubUrl, title: "Tiếng Việt (VSMOV VIP)" }]`. Append `&sub=${b64Sub}` to the manifest proxy URL (`/hls/manifest.m3u8?url=...&ref=...&sub=...`).
3. **Step 3 (HLS Proxy & Subtitle Delivery):** When a client requests `/hls/sub.vtt?url=...`, `src/routes/hls.js` fetches upstream, removes UTF-8 BOM, normalizes line endings, converts SRT to WebVTT format if needed, and sends `text/vtt; charset=utf-8` with 24-hour caching.
4. **Step 4 (Master M3U8 Playlist Rewrite):** When `/hls/manifest.m3u8` receives `sub` query param, it constructs `proxySubUrl` and injects:
   `#EXT-X-MEDIA:TYPE=SUBTITLES,GROUP-ID="subs",NAME="Tiếng Việt (VSMOV VIP)",DEFAULT=YES,AUTOSELECT=YES,FORCED=NO,LANGUAGE="vie",URI="${proxySubUrl}"`
   at the top of the Master M3U8 and attaches `,SUBTITLES="subs"` to `#EXT-X-STREAM-INF` variants so ExoPlayer, VLC, and Nuvio detect and display subtitles automatically.

---

## 3. Caveats

1. **Third-Party CDN Rate Limiting:** VSMOV embed HTML fetches have a 3-second timeout and 24-hour cache. If VSMOV changes its embed HTML structure in the future, the fallback regex ensures continued extraction.
2. **Media Playlists vs Master Playlists:** For streams that are single media playlists (`#EXTINF` without `#EXT-X-STREAM-INF`), Stremio video players use the `streamObj.subtitles` array for subtitle rendering.

---

## 4. Conclusion

All components required for VSMOV WebVTT/SRT subtitle injection and HLS route handling have been investigated. The necessary implementation points are:
1. `src/providers/vsmov.js`: Add `title: 'Tiếng Việt (VSMOV VIP)'` to `subtitles[0]` and append `&sub=${b64Sub}` to `streamUrl`.
2. `src/routes/hls.js`: Support `sub` query param in `/hls/manifest.m3u8`, inject `#EXT-X-MEDIA:TYPE=SUBTITLES` into Master M3U8, link `SUBTITLES="subs"` on `#EXT-X-STREAM-INF`, and isolate cache keys with `subParam`.
3. `src/handlers.js`: Validate subtitle object fields (`id`, `lang`, `url`, `title`) during aggregation.
4. Version sync: Bump version to `1.5.2` in `package.json` and `src/manifest.js`.

---

## 5. Verification Method

1. **Execute existing verification suite:**
   `node tests/verify_vsmov_sub_audio.js`
   `node tests/verify_playback.js`
2. **Execute Hotfix v1.5.2 E2E test:**
   `node tests/verify_hotfix_vsmov_kkphim.js` (once created by the builder).
3. **Syntax and Static Analysis Check:**
   `node --check src/index.js`
   `node --check src/providers/vsmov.js`
   `node --check src/routes/hls.js`
