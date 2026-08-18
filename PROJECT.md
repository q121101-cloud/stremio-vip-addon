# Project: Stremio VIP Movies Addon — Hotfix v1.5.1

## Architecture
- **Framework**: Express.js server providing Stremio Addon Protocol v2 endpoints (`/manifest.json`, `/catalog/...`, `/meta/...`, `/stream/...`, `/health`, `/configure`).
- **Proxy Engine**: Dedicated HLS streaming router (`/hls/manifest.m3u8`, `/hls/sub-manifest.m3u8`, `/hls/segment.ts`, `/hls/sub.vtt`) handling upstream header injection (Origin/Referer anti-hotlinking), CORS headers (`*`), URI rewriting, and subtitle translation/proxying.
- **Provider Architecture**:
  - `src/providers/vsmov.js`: VIP 1 Provider extracting multi-server audio variants (Vietsub, Lồng Tiếng, Thuyết Minh) and embed player subtitles.
  - `src/providers/kkphim.js`: VIP 2 Provider resolving movie and series episodes with flexible episode matchers and CDN referer injection.
  - `src/providers/ophim.js`, `src/providers/nguonc.js`: VIP 3 & VIP 4 Providers.

## Feature Inventory
| # | Feature | Description | Milestone | Source |
|---|---------|-------------|-----------|--------|
| 1 | VSMOV Multi-Server Audio Separation | Separate server groups into Vietsub, Lồng Tiếng, Thuyết Minh streams with distinct titles | M1 | ORIGINAL_REQUEST §R1 |
| 2 | Subtitle Extraction & Injection | Extract WebVTT/SRT from VSMOV embed player and attach `subtitles` array to stream object | M1 | ORIGINAL_REQUEST §R1 |
| 3 | Subtitle Proxy Endpoint | `GET /hls/sub.vtt` route returning WebVTT format, CORS `*`, stripping BOM, converting SRT | M1 | ORIGINAL_REQUEST §R1 |
| 4 | Strict In-App Protocol | Ensure `url` exists on all streams and `externalUrl` is omitted | M1 | ORIGINAL_REQUEST §R1 |
| 5 | KKPhim Flexible Episode Matcher | Support `ep.name === String(targetEp)`, zero-padded (`"01"`), Vietnamese label (`"Tập 1"`), slug suffix (`"-1"`) | M2 | ORIGINAL_REQUEST §R2 |
| 6 | KKPhim Data Container Normalization | Support `server_data`, `episode_data`, `items`, `episodes` arrays | M2 | ORIGINAL_REQUEST §R2 |
| 7 | KKPhim CDN Referer Preservation | Ensure `https://player.phimapi.com/` referer/origin headers and Base64URL security param preservation | M2 | ORIGINAL_REQUEST §R2 |
| 8 | E2E Playback Test Suite | Upgrade `tests/verify_playback.js` to 7-phase E2E test verifying VSMOV, KKPhim, Subtitles, TS download | M3 | ORIGINAL_REQUEST §R3 |
| 9 | Live TS Segment Download & Sync Byte | Download real video chunk > 50KB with HTTP 200/206 and validate MPEG-TS sync byte `0x47` | M3 | ORIGINAL_REQUEST §R3 |
| 10 | Version Bump to 1.5.1 | Update version to `1.5.1` in `package.json`, `src/manifest.js`, and `src/handlers.js` (Cyber-Glassmorphism footer) | M4 | ORIGINAL_REQUEST §R4 |
| 11 | GitHub Deployment | Git commit and push to `origin main` | M4 | ORIGINAL_REQUEST §R4 |

## Milestones
| # | Name | Scope | Dependencies | Status |
|---|------|-------|-------------|--------|
| 1 | M1: VSMOV Audio Separation & Subtitle Proxy | `src/providers/vsmov.js`, `src/routes/hls.js` | none | DONE |
| 2 | M2: KKPhim 404 Episode Matching Fix | `src/providers/kkphim.js` | none | DONE |
| 3 | M3: E2E Playback & Binary Verification | `tests/verify_playback.js` | M1, M2 | DONE |
| 4 | M4: Versioning & GitHub Deployment | `package.json`, `src/manifest.js`, `src/handlers.js`, Git | M1, M2, M3 | IN_PROGRESS |

## Interface Contracts
### VSMOV Stream Object Contract
```javascript
{
  name: 'VIP Movies 🎬',
  title: '[VIP 1 • VSMOV] <AudioLabel> 4K Ultra HD (3840x2160) (HLS Proxy)\n⚡ Server VIP <AudioLabel> • vsmov.com',
  url: '<proxyBase>/hls/manifest.m3u8?url=<b64Url>&ref=<b64Ref>',
  behaviorHints: { notWebReady: false, notSupported: false, bingeGroup: 'vsmov-<audioTag>-4k-vip-1' },
  subtitles: [ { id: 'vi_vsmov', lang: 'vie', url: '<proxyBase>/hls/sub.vtt?url=<b64Sub>&ref=<b64Ref>' } ]
}
```

### Subtitle Proxy Route Contract
- **Endpoint**: `GET /hls/sub.vtt`
- **Query Params**: `url`, `b64`, `sub`, `ref`, `referer` (plaintext or Base64URL)
- **Response Headers**: `Content-Type: text/vtt; charset=utf-8`, `Access-Control-Allow-Origin: *`, `Cache-Control: public, max-age=86400`
- **Transformation**: Strip BOM, convert SRT timestamps (`00:00:01,000` -> `00:00:01.000`), ensure `WEBVTT\n\n` header.

### KKPhim Episode Matcher Contract
```javascript
matchEpisodeItem(ep, targetEpStr, targetEpNum) -> boolean
```
Must match exact string, pad2 (`"01"`), pad3 (`"001"`), `"Tập 1"`, `"Tập 01"`, `"tap-1"`, `"episode-1"`, slug suffix `"-1"`, regex match `targetEpNum`.

## Code Layout
- `src/providers/vsmov.js`: VSMOV provider implementation (owned exclusively by M1 Worker)
- `src/routes/hls.js`: HLS and Subtitle proxy route (owned exclusively by M1 Worker)
- `src/providers/kkphim.js`: KKPhim provider implementation (owned exclusively by M2 Worker)
- `tests/verify_playback.js`: E2E verification test suite (owned exclusively by M3 Worker)
- `package.json`, `src/manifest.js`, `src/handlers.js`: Versioning files (owned exclusively by M4 Worker)
