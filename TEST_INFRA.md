# Test Infrastructure & Methodology Specification (VIP Movies Addon v1.5.1)

This document establishes the comprehensive 4-tier testing infrastructure, test matrices, and verification methodologies for the **VIP Movies Stremio Addon Hotfix v1.5.1**.

---

## 1. Quality Architecture & 4-Tier Test Framework

The VIP Movies Addon is a high-availability streaming proxy and metadata aggregation service for Stremio and Nuvio clients. Testing is structured into 4 systematic tiers covering functional correctness, adversarial boundary values, cross-module interactions, and live real-world streaming lifecycles:

```
┌────────────────────────────────────────────────────────────────────────┐
│                   VIP MOVIES v1.5.1 TEST SUITE                         │
├────────────────────────────────────────────────────────────────────────┤
│ Tier 1: Feature Coverage (Category-Partition Testing)                 │
│         - Subtitle Proxy Endpoint (/hls/sub.vtt)                       │
│         - Base64URL & Plain URL Referer/Origin Handling               │
│         - VSMOV Multi-Server Audio Stream Resolution (tt0373889)       │
│         - In-App Protocol Invariants (url vs externalUrl)              │
│         - Dynamic Manifest, Catalogs, Meta & Health Endpoints          │
├────────────────────────────────────────────────────────────────────────┤
│ Tier 2: Boundary & Corner Cases (Boundary Value Analysis - BVA)        │
│         - Missing & Whitespace-only Subtitle Query Params (HTTP 400)   │
│         - Invalid / Unreachable Upstream Subtitle URLs (HTTP 502)      │
│         - Automatic SRT-to-WebVTT Conversion (Comma->Dot Timestamps)   │
│         - Strict In-App Protocol Invariants across all streams         │
│         - Special Characters, Diacritics & Malformed Base64 Strings    │
├────────────────────────────────────────────────────────────────────────┤
│ Tier 3: Cross-Feature Combinations (Pairwise & Aggregation)            │
│         - Multi-Server Audio Track Separation (Vietsub, LT, TM)        │
│         - Subtitles Array Schema ({ id, lang, url }) Attachment        │
│         - Aggregator Subtitle Field Pass-Through in handleStream       │
│         - Exact Title & Server Group Formatting Verification           │
│         - Multi-Provider Timeout & Fault Isolation                     │
├────────────────────────────────────────────────────────────────────────┤
│ Tier 4: Real-World Scenarios & Workload Stress                         │
│         - End-to-End Movie Discovery & Playback (Harry Potter tt0373889│
│         - End-to-End Subtitle Retrieval & WebVTT Body Validation       │
│         - Multi-Season TV Series Stream & Episode Discovery            │
│         - M3U8 Playlist Traversal & MPEG-TS Stream Integrity           │
│         - High-Concurrency Burst & 24h LRUCache Hit Latency Stress     │
└────────────────────────────────────────────────────────────────────────┘
```

---

## 2. Tier 1: Feature Coverage (Category-Partition Testing)

Category-Partition systematically divides each module's input domain into equivalence classes and tests canonical behavior:

### 2.1 Subtitle Proxy Endpoint `/hls/sub.vtt` (`src/routes/hls.js`)
- **Route Specification**: `GET /hls/sub.vtt?url=<b64Sub>&ref=<b64Ref>` (supports `url`, `b64`, `sub` query keys).
- **Equivalence Classes**:
  - `EC-SUB-1`: Valid WebVTT upstream URL (plain HTTP/HTTPS) → proxies upstream file, sets `Content-Type: text/vtt; charset=utf-8`, `Access-Control-Allow-Origin: *`, `Cache-Control: public, max-age=86400`.
  - `EC-SUB-2`: Valid Base64URL-encoded upstream URL → decodes URL correctly, injects anti-403 headers (`Referer: https://vsmov.com/`, `Origin: https://vsmov.com`, Chrome User-Agent), returns WebVTT body.
  - `EC-SUB-3`: Dynamic Referer parameter → extracts upstream origin and passes matching `Referer` and `Origin` headers.

### 2.2 VSMOV Multi-Server Audio Stream Resolution (`src/providers/vsmov.js`)
- **Equivalence Classes**:
  - `EC-VSMOV-1`: Movie Query (Harry Potter `tt0373889` / `harry-potter-va-menh-lenh-phuong-hoang`) → parses all server tabs from `episodes` array without collapsing into one stream.
  - `EC-VSMOV-2`: Embed Player Scraper → extracts `playerOptions.subtitles`, constructs proxy URL, and attaches `subtitles: [{ id: 'vi_vsmov', lang: 'vie', url: proxySubUrl }]`.
  - `EC-VSMOV-3`: Stream Protocol Compliance → every stream object strictly has `url` and NO `externalUrl`.

### 2.3 Addon Handlers & Manifest (`src/handlers.js`, `src/manifest.js`)
- **Equivalence Classes**:
  - `EC-HAND-1`: `GET /manifest.json` → returns valid Stremio v1.5.1 manifest.
  - `EC-HAND-2`: `GET /stream/:type/:id.json` → aggregates streams across active providers, preserves `subtitles` array, sanitizes fields, sorts 4K VIP streams to top priority.

---

## 3. Tier 2: Boundary & Corner Cases (Boundary Value Analysis)

| ID | Boundary Category | Test Input | Expected Behavior |
|---|---|---|---|
| `BVA-SUB-1` | Missing Query Parameter | `GET /hls/sub.vtt` | Returns HTTP 400 Bad Request (`Missing subtitle URL`) |
| `BVA-SUB-2` | Empty / Whitespace Query | `GET /hls/sub.vtt?url=%20%20` | Returns HTTP 400 Bad Request |
| `BVA-SUB-3` | Unreachable Upstream | `GET /hls/sub.vtt?url=http://127.0.0.1:1/nonexistent.vtt` | Returns HTTP 502 Bad Gateway gracefully (no crash) |
| `BVA-SUB-4` | Upstream 404/500 | `GET /hls/sub.vtt?url=https://example.com/missing.vtt` | Returns HTTP 502 Bad Gateway |
| `BVA-SRT-1` | SRT Comma Timestamps | `00:00:01,000 --> 00:00:04,500\nHello World` | Converts commas to dots (`00:00:01.000 --> 00:00:04.500`) |
| `BVA-SRT-2` | SRT Missing WEBVTT Header | Standard SRT without `WEBVTT` header | Prepends `WEBVTT\n\n` header, sets `text/vtt` Content-Type |
| `BVA-SRT-3` | CRLF Windows Linebreaks | `\r\n` line endings in SRT/VTT file | Normalized to standard `\n` linebreaks |
| `BVA-PROT-1`| In-App Stream Protocol | Every stream object from `handleStream` | `url` is non-empty string; `'externalUrl' in stream === false` |
| `BVA-B64-1` | Base64URL vs Standard Base64 | `url` encoded with `-` and `_` vs `+` and `/` | Decoded successfully by URL resolver |

---

## 4. Tier 3: Cross-Feature Combinations (Pairwise & Aggregation Matrix)

| Matrix # | VSMOV Server Group | Subtitle Status | Handler Sanitization | Expected Result |
|---|---|---|---|---|
| `PAIR-1` | Vietsub | WebVTT Present in Embed | Preserves `subtitles` array | 1 Vietsub 4K stream with `subtitles: [{ id: 'vi_vsmov', lang: 'vie', url: ... }]` |
| `PAIR-2` | Lồng Tiếng | No Subtitle (Audio Dubbed) | Omit / Empty Subtitles | 1 Lồng Tiếng 4K stream, 0 subtitles attached |
| `PAIR-3` | Thuyết Minh | WebVTT Present in Embed | Preserves `subtitles` array | 1 Thuyết Minh 4K stream with `subtitles` attached |
| `PAIR-4` | Vietsub + Lồng Tiếng | Vietsub has subs, LT does not | Parallel multi-server | 2 distinct streams with distinct titles and audio tags |
| `PAIR-5` | Provider Timeout | VSMOV times out (>4s) | Promise.allSettled isolation | KKPhim & NguonC streams returned; no 500 error |

---

## 5. Tier 4: Real-World Scenarios & Workload Stress

1. **Scenario 1: Global Blockbuster Multi-Server Audio Discovery (Harry Potter `tt0373889`)**:
   - Resolves canonical metadata for Harry Potter and the Order of the Phoenix.
   - Extracts at least 2 distinct VSMOV audio streams (`Vietsub` and `Lồng Tiếng` / `Thuyết Minh`).
   - Validates exact title formatting: `[VIP 1 • VSMOV] <Audio> 4K Ultra HD (3840x2160) (HLS Proxy)\n⚡ Server VIP <Audio> • vsmov.com`.
2. **Scenario 2: End-to-End Subtitle Fetch & Header Integrity**:
   - Extracts proxy subtitle URL from stream object: `/hls/sub.vtt?url=...&ref=...`.
   - Sends HTTP GET request to subtitle proxy endpoint.
   - Validates HTTP 200, `Content-Type: text/vtt; charset=utf-8`, CORS `*`, and `WEBVTT` body header.
3. **Scenario 3: Multi-Season Series Episode Discovery**:
   - Queries series streams (e.g. Breaking Bad `tt0903747:1:1` or active series catalog).
   - Validates episode labels `[Tập 1]` and binge group tagging.
4. **Scenario 4: High-Concurrency Burst & Cache Stress**:
   - Fires concurrent requests to stream endpoints, validating sub-millisecond LRUCache hits and zero memory leak.

---

## 6. Feature Coverage Inventory

| # | Feature Description | Milestone | Covered in Test File | Tiers Covered |
|---|---------------------|-----------|----------------------|---------------|
| 1 | Subtitle Proxy Endpoint `/hls/sub.vtt` | M1 | `tests/verify_vsmov_sub_audio.js` | Tier 1, 2, 4 |
| 2 | SRT to WebVTT Auto-Conversion | M1 | `tests/verify_vsmov_sub_audio.js` | Tier 2 |
| 3 | Aggregator Subtitle Pass-Through | M1 | `tests/verify_vsmov_sub_audio.js`, `tests/e2e.test.js` | Tier 1, 3 |
| 4 | VSMOV Multi-Server Audio Separation | M2 | `tests/verify_vsmov_sub_audio.js` | Tier 1, 3, 4 |
| 5 | VSMOV Stream Title & Name Formatting | M2 | `tests/verify_vsmov_sub_audio.js` | Tier 3 |
| 6 | VSMOV Subtitle Extraction & Attachment | M2 | `tests/verify_vsmov_sub_audio.js` | Tier 1, 3, 4 |
| 7 | In-App Stream Protocol Compliance (`url` only) | M2 | `tests/verify_vsmov_sub_audio.js`, `tests/verify_playback.js` | Tier 1, 2, 3 |
| 8 | UI Branding & Version Bumping (v1.5.1) | M3 | `tests/verify_playback.js`, `tests/e2e.test.js` | Tier 1 |
| 9 | E2E Testing Suite (`tests/verify_vsmov_sub_audio.js`) | M-E2E / M4 | `tests/verify_vsmov_sub_audio.js` | Tier 1, 2, 3, 4 |
| 10| Git Deployment & Main Branch Verification | M4 | Deployment audit & git verification | Operational |

---

## 7. Test Suite Index & Invocation Commands

All test suites are self-contained and run on ephemeral Express instances on port 0:

```bash
# 1. Run VSMOV Subtitle & Multi-Server Audio E2E Test Suite (Hotfix v1.5.1 Target)
node tests/verify_vsmov_sub_audio.js

# 2. Run Mandatory Playback & Binary MPEG-TS Verification Test
node tests/verify_playback.js

# 3. Run Full System 4-Tier E2E Regression Suite
node tests/e2e.test.js

# 4. Run Multi-Provider Integration Suite
node tests/m2_providers.test.js
```

### Exit Codes:
- `0`: All assertions passed successfully.
- `1`: One or more assertions failed (with full failure diagnostics printed).
