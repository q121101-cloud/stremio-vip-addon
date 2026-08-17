# E2E Test Infra: VIP Movies Addon Engine v1.5.0

## Test Philosophy
- Opaque-box, requirement-driven E2E verification.
- Validates real video streaming via live HLS proxy, Range requests, and binary TS download (>50KB).
- Tests must pass independently on an ephemeral server instance (port 0).

## Feature Inventory
| # | Feature | Source | Tier 1 | Tier 2 | Tier 3 | Tier 4 |
|---|---------|--------|:------:|:------:|:------:|:------:|
| 1 | Manifest Route (`/manifest.json`, `/:config/manifest.json`) | R3, R4 | 5 | 5 | ✓ | ✓ |
| 2 | Catalog Routes (22 K20 catalogs) | R3, R4 | 5 | 5 | ✓ | ✓ |
| 3 | Search Endpoint (fan-out, zero 404) | R3 | 5 | 5 | ✓ | ✓ |
| 4 | Stream Aggregator (movie & series) | R5 | 5 | 5 | ✓ | ✓ |
| 5 | In-App Stream Exclusivity (no externalUrl) | R2, R5 | 5 | 5 | ✓ | ✓ |
| 6 | HLS Manifest Proxy & Rewriting | R1 | 5 | 5 | ✓ | ✓ |
| 7 | HLS Segment TS Download (>50KB, 0x47 sync byte) | R1, R6 | 5 | 5 | ✓ | ✓ |
| 8 | HLS Range Request (206 Partial Content) | R1, R6 | 5 | 5 | ✓ | ✓ |
| 9 | Multi-Provider Stream Formatting (VIP 1..7) | R2 | 5 | 5 | ✓ | ✓ |
| 10 | Decryption Key Proxy (`/hls/key`) | R1 | 5 | 5 | ✓ | ✓ |

## Test Architecture
- Test runner: `node tests/verify_playback.js` and `node tests/e2e.test.js`
- Test cases:
  - Ephemeral Express instance startup on port 0.
  - Verification of all 22 catalog IDs.
  - Search query across providers.
  - Stream query for movie and series.
  - Full line-by-line manifest inspection.
  - Binary chunk download and MPEG-TS byte validation.
  - Range header request validation (206 status, 1024 bytes payload).
  - Clean server shutdown in `finally`.
