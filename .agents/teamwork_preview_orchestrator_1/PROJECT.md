# Project: Stremio NguonC Addon - Hotfix v1.5.2

## Architecture
- **Stremio Addon Core**: Node.js / Express server exposing `/manifest.json`, `/stream/:type/:id.json`, and `/hls/*` proxy endpoints.
- **Provider Layer**:
  - `src/providers/vsmov.js`: VSMOV VIP 4K stream provider with WebVTT/SRT subtitle extraction and proxy injection.
  - `src/providers/kkphim.js`: KKPhim provider with 3-tier smart search fallback against 404s and flexible episode matching.
- **HLS Proxy Layer**:
  - `src/routes/hls.js`: Master playlist rewriting with `#EXT-X-MEDIA:TYPE=SUBTITLES` injection, TS segment streaming, and `/hls/sub.vtt` WebVTT/SRT conversion proxy.
- **Testing & Verification Layer**:
  - `tests/verify_hotfix_vsmov_kkphim.js`: Comprehensive 3-case E2E test verifying VSMOV subtitle proxy, KKPhim search fallback, episode matching, and TS segment byte integrity.

## Feature Inventory
| # | Feature | Description | Milestone | Source |
|---|---------|-------------|-----------|--------|
| 1 | VSMOV Subtitle Extraction & Stremio Attachment | Extract .vtt/.srt and attach subtitles array with lang "vie" and title "Tiếng Việt (VSMOV VIP)" | M1 (VSMOV) | R1 |
| 2 | Subtitle Proxy Endpoint `/hls/sub.vtt` | Proxy subtitles with CORS, text/vtt, caching, and auto SRT-to-WebVTT conversion | M1 (VSMOV) | R1 |
| 3 | Master M3U8 Subtitle Injection | Inject `#EXT-X-MEDIA:TYPE=SUBTITLES` into Master M3U8 for ExoPlayer/VLC/Nuvio | M1 (VSMOV) | R1 |
| 4 | KKPhim 3-Tier Lookup (IMDb -> Search -> Empty) | Direct IMDb -> Cinemeta search fallback with fuzzy scoreMatch -> Safe `[]` | M2 (KKPhim) | R2 |
| 5 | KKPhim Flexible Episode Matching | Match series episodes across formats: "1", "01", "Tập 1", "tap-1", "tap-01" | M2 (KKPhim) | R2 |
| 6 | E2E Test Suite (`verify_hotfix_vsmov_kkphim.js`) | Test 3 real cases: Avengers 3, KKPhim Series Ep 1, TS Segment >50KB (0x47 byte) | M0 (Test Track) & M3 (Final) | R3 |
| 7 | Versioning (v1.5.2) & GitHub Push | Bump version to 1.5.2 in package.json & src/manifest.js, git commit & push to origin main | M3 (Deploy) | R4 |

## Milestones
| # | Name | Scope | Dependencies | Status |
|---|------|-------|-------------|--------|
| M0 | E2E Testing Track | Design & implement `tests/verify_hotfix_vsmov_kkphim.js` and `TEST_READY.md` | Survey | IN_PROGRESS |
| M1 | VSMOV Subtitle Injection & Proxy | Update `src/providers/vsmov.js` and `src/routes/hls.js` | Survey | PLANNED |
| M2 | KKPhim Smart Search Fallback | Update `src/providers/kkphim.js` with 3-tier lookup and episode matching | Survey | PLANNED |
| M3 | Final Verification & GitHub Push | Run 100% E2E tests, update version to 1.5.2, git commit and push | M0, M1, M2 | PLANNED |

## Code Layout
- `src/providers/vsmov.js` (Owned by M1 Worker)
- `src/routes/hls.js` (Owned by M1 Worker)
- `src/providers/kkphim.js` (Owned by M2 Worker)
- `tests/verify_hotfix_vsmov_kkphim.js` (Owned by M0 Test Writer / M3 Worker)
- `package.json`, `src/manifest.js`, `src/handlers.js`, `src/index.js` (Owned by M3 Worker)
