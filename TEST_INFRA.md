# E2E Test Infra: Stremio VIP Movies Addon Engine v1.6.2

## Test Philosophy
- Opaque-box, requirement-driven end-to-end verification.
- Validates live playback delivery: Master/Variant M3U8 playlists (HTTP 200, `#EXTM3U`), WebVTT subtitles, and real video segment chunks (.ts > 100KB with MPEG-TS sync byte `0x47`).
- Validates all 22 manifest catalogs across 6 provider clusters returning HTTP 200 with non-empty `metas`.

## Feature Inventory & Test Coverage Matrix
| # | Feature | Source (Requirement) | Tier 1 (Feature) | Tier 2 (Boundary) | Tier 3 (Cross-Provider) | Tier 4 (Real-World) |
|---|---------|---------------------|:----------------:|:-----------------:|:-----------------------:|:-------------------:|
| 1 | VSMOV 4K Stream & Subtitles | R1, R3, R4, R5 | 5 | 5 | ✓ | ✓ |
| 2 | KKPhim FHD Stream & TS Segments | R1, R3, R4, R5 | 5 | 5 | ✓ | ✓ |
| 3 | NguonC FHD Stream & TS Segments | R1, R3, R4, R5 | 5 | 5 | ✓ | ✓ |
| 4 | STP Stream & TS Segments | R1, R3, R4, R5 | 5 | 5 | ✓ | ✓ |
| 5 | CLBPX Stream & TS Segments | R1, R3, R4, R5 | 5 | 5 | ✓ | ✓ |
| 6 | YAN Donghua 3D Stream & TS Segments | R1, R3, R4, R5 | 5 | 5 | ✓ | ✓ |
| 7 | 22 Manifest Catalogs | R2, R5 | 22 | 5 | ✓ | ✓ |
| 8 | HLS Proxy Range 206 Seeking | R1, R5 | 5 | 5 | ✓ | ✓ |
| 9 | Stream Sorting & Aggregation | R3 | 5 | 5 | ✓ | ✓ |

## Test Architecture
- **Unified E2E Playback Suite**: `tests/verify_all_providers_playback.js`
  - Tests all 22 catalogs via `/catalog/:type/:id.json`
  - Tests stream resolution across all 6 providers via `/stream/:type/:id.json`
  - Fetches proxied master/variant `.m3u8` playlists and parses segment URLs
  - Downloads actual `.ts` segment chunks (>100KB) and inspects byte 0 for `0x47` sync byte
  - Verifies WebVTT subtitle conversions and HTTP Range 206 byte-seeking
- **Playback & Seeking Suite**: `tests/verify_playback.js` (7 phases)
- **Hotfix & Subtitle Suite**: `tests/verify_hotfix_vsmov_kkphim.js` (27 assertions)
- **New Providers Suite**: `tests/verify_new_providers.js` (26 checks)
- **Pass/Fail Semantics**: All suites exit code 0 on complete pass, non-zero on any failure.
