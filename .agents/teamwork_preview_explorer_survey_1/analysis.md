# VSMOV Provider Architecture Investigation & Audio/Subtitle Separation Analysis

**Date:** 2026-08-18  
**Investigator:** `teamwork_preview_explorer_survey_1`  
**Target Files:**  
- `src/providers/vsmov.js`
- `src/routes/hls.js`
- `src/handlers.js`
- `src/lib/utils.js`
- `tests/verify_vsmov_sub_audio.js`

---

## Executive Summary

This investigation analyzed the VSMOV provider architecture in the Stremio VIP Movies Addon codebase to support **Hotfix v1.5.1**. We empirically examined live API endpoints (`https://vsmov.com/api/phim/:slug`), player embed HTML responses (`https://v[2-6].streamvsmov.com/video/:uuid`), subtitle extraction mechanics, and In-App stream protocol compliance.

### Key Discoveries:
1. **Server Group Structure**: VSMOV API returns an `episodes` array where each element represents an audio/server tab (`Vietsub`, `Lồng tiếng`, `Thuyết minh`). In live responses, `server.server_name` frequently contains unnormalized whitespace and newlines (e.g. `"Vietsub\r\n                        #1"`).
2. **Distinct 4K Stream Generation**: Instead of collapsing or conflating server tabs into generic names, each server tab must be categorized into **Vietsub**, **Lồng Tiếng**, or **Thuyết Minh** and mapped to its exact required stream `name` (`"VIP Movies 🎬"`) and `title` template.
3. **Subtitle Extraction & Proxying**: VSMOV embed HTML contains inline `playerOptions.subtitles` array (e.g. `[{"name":"vie ...","url":"/video/:uuid/subtitle/vie_....vtt","code":"vie"}]`). These relative/absolute subtitle URLs must be resolved against `baseUrl`, proxied via `GET /hls/sub.vtt?url=${b64Sub}&ref=${b64Ref}`, and attached to stream objects as `subtitles: [{ id: 'vi_vsmov', lang: 'vie', url: proxySubUrl }]`.
4. **Stream Sanitizer Fix**: In `src/handlers.js` line 944, the current stream sanitizer strips unknown fields when constructing the `sanitized` stream object. It must be updated to pass through `item.subtitles` so subtitle tracks reach the Stremio client.
5. **In-App Protocol Invariant**: All stream objects must strictly include `url` (pointing to the HLS proxy manifest) and omit `externalUrl` completely.

---

## 1. VSMOV API & Player Response Structure

### 1.1 API Response (`GET https://vsmov.com/api/phim/:slug`)

When querying movie details via `https://vsmov.com/api/phim/:slug` (e.g., `harry-potter-va-menh-lenh-phuong-hoang` or `ke-cap-giac-mo`), the JSON payload is structured as follows:

```json
{
  "status": "success",
  "movie": {
    "_id": 43915,
    "name": "Harry Potter và Mệnh Lệnh Phượng Hoàng",
    "origin_name": "Harry Potter and the Order of the Phoenix",
    "slug": "harry-potter-va-menh-lenh-phuong-hoang",
    "type": "single",
    "lang": "Vietsub",
    "year": 2007,
    "poster_url": "https://vsmov.com/storage/images/...",
    "thumb_url": "https://vsmov.com/storage/images/...",
    "imdb": { "id": "tt0373889" },
    "tmdb": { "id": "675" }
  },
  "episodes": [
    {
      "server_name": "Vietsub\r\n                        #1",
      "server_data": [
        {
          "name": "Full",
          "slug": "tap-full",
          "filename": "Full",
          "link_embed": "https://v5.streamvsmov.com/video/382f09db-83ff-4d89-9be9-797162d4f2e6"
        }
      ]
    },
    {
      "server_name": "Lồng tiếng #1",
      "server_data": [
        {
          "name": "Full",
          "slug": "tap-full",
          "filename": "Full",
          "link_embed": "https://v5.streamvsmov.com/video/9f623219-003a-4628-a72d-91461d3a1716"
        }
      ]
    }
  ]
}
```

### 1.2 Player Embed HTML Response (`GET link_embed`)

When fetching `link_embed` (`https://v[2-6].streamvsmov.com/video/:uuid`), the returned HTML contains inline script execution blocks:

```html
<script>
    const playerOptions = {
        logo: "",
        subtitles: [
            {
                "name": "vie 1785240078185 txr9be",
                "type": "local",
                "url": "/video/382f09db-83ff-4d89-9be9-797162d4f2e6/subtitle/vie_1785240078185_txr9be.vtt",
                "_inSubtitleFolder": true,
                "code": "vie"
            },
            {
                "name": "eng 1785240078193 wwa5ps",
                "type": "local",
                "url": "/video/382f09db-83ff-4d89-9be9-797162d4f2e6/subtitle/eng_1785240078193_wwa5ps.vtt",
                "_inSubtitleFolder": true,
                "code": "eng"
            }
        ],
        audios: [],
        thumb: "",
        linkVast: "",
        skipOffset: "5",
        enableSignedUrl: false,
        signedMasterUrl: "",
        volume: 100,
        mute: false,
        segmentCdnHosts: ["p25.streamvsmov.com"]
    };

    const baseUrl = "https://v5.streamvsmov.com";
    const videoHash = "382f09db-83ff-4d89-9be9-797162d4f2e6";

    let playerSource = playerOptions.signedMasterUrl;
    if (!playerOptions.enableSignedUrl || !playerSource) {
        playerSource = baseUrl + '/stream/' + videoHash + '/master.m3u8';
    }
    window.videoSrc = playerSource;
</script>
```

---

## 2. Detailed Technical Breakdown by Investigation Points

### Question 1: Server Groups & Audio Tab Classification

In VSMOV data, the `episodes` array holds all available servers. Each server represents a distinct audio stream (e.g. Vietsub, Lồng Tiếng, Thuyết Minh).

#### Robust Server Audio Classification Logic:
```javascript
function classifyVsmovAudio(serverName, movieLang = '') {
  const norm = String(serverName || '')
    .replace(/[\r\n]+/g, ' ')
    .replace(/#/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();

  const isLT = /l.{1,5}ng\s*ti.{1,5}ng|dub/i.test(norm);
  const isTM = /thuy.{1,5}t\s*minh|voiceover/i.test(norm);
  const isVS = /vietsub|ph.{1,5}\s*đ.{1,5}|sub/i.test(norm);

  if (isLT) return 'lt'; // Lồng Tiếng
  if (isTM) return 'tm'; // Thuyết Minh
  if (isVS) return 'vs'; // Vietsub

  // Fallback to movie.lang if serverName is ambiguous (e.g. "Server 1")
  const mNorm = String(movieLang || '').toLowerCase();
  if (/l.{1,5}ng\s*ti.{1,5}ng/i.test(mNorm)) return 'lt';
  if (/thuy.{1,5}t\s*minh/i.test(mNorm)) return 'tm';
  return 'vs'; // Default to Vietsub
}
```

---

### Question 2: Separation into Distinct Stream Objects & Exact Titles

Each server in `episodes` must generate its own distinct stream object.

#### Exact Stream Naming & Title Formatting Specifications:
1. **Common Name**:
   - `name: "VIP Movies 🎬"`
2. **Vietsub Stream**:
   - `title`: `[VIP 1 • VSMOV] Vietsub 4K Ultra HD (3840x2160)${epLabel} (HLS Proxy)\n⚡ Server VIP Vietsub • vsmov.com`
3. **Lồng Tiếng Stream**:
   - `title`: `[VIP 1 • VSMOV] Lồng Tiếng 4K Ultra HD (3840x2160)${epLabel} (HLS Proxy)\n⚡ Server VIP Lồng Tiếng • vsmov.com`
4. **Thuyết Minh Stream**:
   - `title`: `[VIP 1 • VSMOV] Thuyết Minh 4K Ultra HD (3840x2160)${epLabel} (HLS Proxy)\n⚡ Server VIP Thuyết Minh • vsmov.com`

*(Note: For movies, `${epLabel}` is `""`, producing the exact required titles from R1).*

#### Title Generator Implementation:
```javascript
let titleHeader = '';
let serverFooter = '';

if (audioType === 'lt') {
  titleHeader = `[VIP 1 • VSMOV] Lồng Tiếng 4K Ultra HD (3840x2160)${epLabel} (HLS Proxy)`;
  serverFooter = '⚡ Server VIP Lồng Tiếng • vsmov.com';
} else if (audioType === 'tm') {
  titleHeader = `[VIP 1 • VSMOV] Thuyết Minh 4K Ultra HD (3840x2160)${epLabel} (HLS Proxy)`;
  serverFooter = '⚡ Server VIP Thuyết Minh • vsmov.com';
} else {
  titleHeader = `[VIP 1 • VSMOV] Vietsub 4K Ultra HD (3840x2160)${epLabel} (HLS Proxy)`;
  serverFooter = '⚡ Server VIP Vietsub • vsmov.com';
}

const streamObj = {
  name: 'VIP Movies 🎬',
  title: `${titleHeader}\n${serverFooter}`,
  url: streamUrl,
  behaviorHints: {
    notSupported: false,
    bingeGroup: `vsmov-${movie.slug || slug || 'stream'}`,
  },
};
```

---

### Question 3: Subtitle Extraction & Routing via `/hls/sub.vtt`

#### 3.1 Embed Parser for M3U8 + Subtitles
We extend `resolveMasterPlaylistUrl` into `resolveVsmovStreamData(linkEmbed, linkM3u8)`:

```javascript
async function resolveVsmovStreamData(linkEmbed, linkM3u8) {
  let masterPlaylistUrl = linkM3u8 && typeof linkM3u8 === 'string' && linkM3u8.startsWith('http')
    ? linkM3u8
    : null;
  let subtitleUrl = null;

  if (!linkEmbed || typeof linkEmbed !== 'string') {
    return { masterPlaylistUrl, subtitleUrl };
  }

  try {
    const res = await http.get(linkEmbed, { timeout: 3500 });
    const html = String(res.data);

    let baseUrl = '';
    const mBase = html.match(/baseUrl\s*=\s*["'\x27]([^"'\x27]+)["'\x27]/i);
    if (mBase) {
      baseUrl = mBase[1];
    } else {
      try { baseUrl = new URL(linkEmbed).origin; } catch {}
    }

    // 1. Resolve Master M3U8
    if (!masterPlaylistUrl) {
      const mHash = html.match(/videoHash\s*=\s*["'\x27]([^"'\x27]+)["'\x27]/i);
      if (mBase && mHash) {
        masterPlaylistUrl = `${mBase[1]}/stream/${mHash[1]}/master.m3u8`;
      } else {
        const m = html.match(/(?:["`'\x27\s=:(])(https?:\/\/[^"`'\x27\s()]+\.m3u8[^"`'\x27\s()]*)/i);
        if (m && m[1]) masterPlaylistUrl = m[1];
      }
    }

    // 2. Extract Subtitles from playerOptions.subtitles
    const mSub = html.match(/subtitles\s*:\s*(\[[^\]]*\])/i);
    if (mSub) {
      try {
        const parsed = JSON.parse(mSub[1]);
        if (Array.isArray(parsed) && parsed.length > 0) {
          // Prefer Vietnamese subtitle ('vie' / 'vi' / 'vietnamese')
          const viSub = parsed.find(s => s && (s.code === 'vie' || /vie|viet/i.test(s.name || '')));
          const targetSub = viSub || parsed[0];
          if (targetSub && targetSub.url) {
            const rawSubUrl = targetSub.url.trim();
            subtitleUrl = rawSubUrl.startsWith('http')
              ? rawSubUrl
              : (baseUrl ? `${baseUrl}${rawSubUrl.startsWith('/') ? '' : '/'}${rawSubUrl}` : rawSubUrl);
          }
        }
      } catch (err) {
        console.warn('[VSMOV/resolveVsmovStreamData] Subtitle JSON parse error:', err.message);
      }
    }
  } catch (err) {
    console.warn(`[VSMOV/resolveVsmovStreamData] Embed fetch error:`, err.message);
  }

  return { masterPlaylistUrl, subtitleUrl };
}
```

#### 3.2 Subtitle Object Attachment
When `subtitleUrl` is extracted:
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

#### 3.3 Subtitle Proxy Endpoint (`src/routes/hls.js`)
Add route `GET /hls/sub.vtt` (and alias `/sub.vtt`):
- Accepts `url` and `ref` query params.
- Fetches upstream subtitle with headers:
  - `User-Agent`: Chrome User Agent
  - `Referer: https://vsmov.com/`
  - `Origin: https://vsmov.com`
- Responds with:
  - `Content-Type: text/vtt; charset=utf-8`
  - `Access-Control-Allow-Origin: *`
  - `Cache-Control: public, max-age=86400`
- Converts SRT to WebVTT if format is SRT:
  ```javascript
  function srtToVtt(rawText) {
    if (!rawText) return 'WEBVTT\n\n';
    let clean = String(rawText).replace(/^\uFEFF/, '').trim();
    if (clean.startsWith('WEBVTT')) return clean;
    const vtt = clean
      .replace(/\r\n/g, '\n')
      .replace(/\r/g, '\n')
      .replace(/(\d{2}:\d{2}:\d{2}),(\d{3})/g, '$1.$2')
      .replace(/(\d{2}:\d{2}),(\d{3})/g, '00:$1.$2');
    return `WEBVTT\n\n${vtt}`;
  }
  ```

#### 3.4 Stream Aggregator Pass-Through (`src/handlers.js`)
Update `handleStream` in `src/handlers.js` (line 944):
```javascript
const sanitized = {
  name: item.name || 'VIP Movies 🎬',
  title: item.title ? String(item.title).replace(/#/g, '') : 'VIP Server',
  url: String(item.url).trim(),
  behaviorHints: {
    notSupported: false,
    bingeGroup: item.behaviorHints?.bingeGroup || `stream-${slug || imdbId || 'main'}`,
    ...(item.behaviorHints || {}),
  },
};
if (item.subtitles && Array.isArray(item.subtitles) && item.subtitles.length > 0) {
  sanitized.subtitles = item.subtitles;
}
delete sanitized.externalUrl;
mergedStreams.push(sanitized);
```

---

### Question 4: In-App Protocol Compliance

To guarantee In-App streaming across Stremio Android, iOS, Windows, macOS, Android TV, and Web:
1. `url` must always be a direct playback URL (the Addon's HLS proxy manifest URL `http://.../hls/manifest.m3u8?url=...&ref=...`).
2. `externalUrl` must be completely omitted/deleted from the JSON response.
3. Every test in `verify_vsmov_sub_audio.js` and `e2e.test.js` should assert:
   - `typeof stream.url === 'string' && stream.url.startsWith('http')`
   - `stream.externalUrl === undefined`

---

## 3. Impact Assessment on Dependents & Existing Test Suite

| File | Change Required | Impact / Risk |
|---|---|---|
| `src/providers/vsmov.js` | Audio classification, exact 4K titles, subtitle extraction | High impact on VSMOV streams; 0 breaking changes to other providers |
| `src/routes/hls.js` | Add `/sub.vtt` endpoint with SRT-to-VTT conversion | Safe, non-interfering additive route |
| `src/handlers.js` | Preserve `subtitles` array in stream aggregator sanitizer; bump version to `1.5.1` | Preserves subtitle metadata across all streams |
| `src/manifest.js` | Bump version to `1.5.1` | Standard version bump |
| `package.json` | Bump version to `1.5.1` | Standard version bump |
| `tests/verify_vsmov_sub_audio.js` | New dedicated E2E test suite for multi-server audio & subtitle proxy | Validates all requirements |
| `tests/e2e.test.js` | Update version check & title assertions to v1.5.1 | Ensures 100% test pass rate |

---

## 4. Verification Plan

1. **New Automated Verification Script (`tests/verify_vsmov_sub_audio.js`)**:
   - Boots express server on dynamic ephemeral port (e.g. `0` or `7432`).
   - Requests streams for `tt0373889` (Harry Potter and the Order of the Phoenix).
   - Asserts at least 2 distinct VSMOV streams:
     - Vietsub stream with exact title `[VIP 1 • VSMOV] Vietsub 4K Ultra HD (3840x2160) (HLS Proxy)\n⚡ Server VIP Vietsub • vsmov.com`
     - Lồng Tiếng stream with exact title `[VIP 1 • VSMOV] Lồng Tiếng 4K Ultra HD (3840x2160) (HLS Proxy)\n⚡ Server VIP Lồng Tiếng • vsmov.com`
   - Validates `subtitles` array on Vietsub stream: `[{ id: 'vi_vsmov', lang: 'vie', url: 'http://.../hls/sub.vtt?url=...&ref=...' }]`.
   - Requests `GET /hls/sub.vtt?...`, verifying HTTP 200, `Content-Type: text/vtt; charset=utf-8`, and `WEBVTT` body header.
   - Asserts `stream.url` exists and `stream.externalUrl` is undefined on all streams.
2. **Full Regression Test**:
   - Run `node src/test.js`
   - Run `node tests/e2e.test.js`
   - Run `node --check src/index.js`
   - Run `node tests/verify_vsmov_sub_audio.js`
