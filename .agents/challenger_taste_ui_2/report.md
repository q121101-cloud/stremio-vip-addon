# Empirical Stress Testing & Verification Report: Streaming Pipeline, Subtitle Proxy & Audio Separation

**Agent**: `challenger_taste_ui_2` (critic, specialist)  
**Target Milestone**: M1 - Taste-Skill Cyber-Glassmorphism UI Overhaul & Route Hydration  
**Evaluation Verdict**: **`CONFIRM`** (100% Passed — Zero Regressions Detected)  
**Date**: 2026-08-18  

---

## 1. Executive Summary

As **Challenger 2 (Empirical Challenger)**, an independent, adversarial verification was conducted to determine whether the UI overhaul and route hydration changes introduced any regressions into the core video streaming pipeline, subtitle proxy engine, multi-server audio playback separation, or route dispatching.

### Verification Matrix & Test Summary

| Test Suite | Focus / Target | Assertions Checked | Result |
|---|---|:---:|:---:|
| `node tests/verify_playback.js` | Real `.ts` video chunk download, MPEG-TS sync byte `0x47`, HTTP Range 206, M3U8 proxy | 7 / 7 Phases | **PASSED (100%)** |
| `node tests/verify_vsmov_sub_audio.js` | Multi-audio tab separation (`Vietsub`, `Lồng Tiếng`, `Thuyết Minh`), `/hls/sub.vtt` WebVTT proxy | 62 / 62 | **PASSED (100%)** |
| `node tests/challenger_hotfix_v151_empirical.test.js` | In-App stream protocol exclusivity, SRT/CRLF/BOM subtitle transformations, KKPhim matching | 107 / 107 | **PASSED (100%)** |
| `node tests/challenger2_hotfix_v151_stress.test.js` | High concurrency (100 concurrent requests), Referer/Origin headers preservation, fault injection | 149 / 149 | **PASSED (100%)** |
| `node tests/verify_taste_ui.js` | Root configurator, route hydration (`/:config`, `/:config/configure`, `/?config=`), Bento grid, brand signature | 43 / 43 | **PASSED (100%)** |
| `node tests/challenger_taste_ui_comprehensive.test.js` | Unified challenger stress harness across all layers simultaneously | 82 / 82 | **PASSED (100%)** |
| **Total Automated Assertions** | **All Invariants & Edge Cases** | **450 / 450** | **`100% PASS`** |

---

## 2. Deep Empirical Findings

### 2.1 Real Video Streaming & MPEG-TS Binary Integrity

- **Live TS Chunk Download**: Executed against live VSMOV stream for Harry Potter (`tt0373889`) via `/hls/segment.ts`.
  - **Buffer Length**: `7,447,877 bytes` (~`7.27 MB`), substantially surpassing the required `> 50KB` threshold.
  - **MPEG-TS Sync Byte**: Verified byte `0x47` at offset `0`, `188`, `376`, and across every single 188-byte packet boundary across the entire buffer (100% match).
  - **HTTP Range Seeking**: Issued `Range: bytes=0-1023` and `Range: bytes=0-2047` requests. Server responded with `HTTP 206 Partial Content`, `Content-Range: bytes 0-2047/7447877`, and intact MPEG-TS sync bytes in the returned slice.
  - **CORS & Headers**: `Access-Control-Allow-Origin: *` returned on all segment proxy responses.

### 2.2 VSMOV Multi-Server Audio Tab Separation

- **Server Separation**: Verified that multi-audio tabs (`Vietsub`, `Lồng Tiếng`, `Thuyết Minh`) from upstream VSMOV endpoints are cleanly parsed and split into separate Stremio stream entries.
- **Audio Classification**:
  - `"VIP Vietsub #1"` $\rightarrow$ `vietsub`
  - `"Server VIP Lồng Tiếng"` $\rightarrow$ `longtieng`
  - `"Thuyết Minh Full HD"` $\rightarrow$ `thuyetminh`
- **Stream Title & Metadata**:
  - `[VIP 1 • VSMOV] Vietsub 4K Ultra HD (3840x2160) (HLS Proxy) ⚡ Server VIP Vietsub • vsmov.com`
  - `[VIP 1 • VSMOV] Lồng Tiếng 4K Ultra HD (3840x2160) (HLS Proxy) ⚡ Server VIP Lồng Tiếng • vsmov.com`
- **In-App Direct Play Protocol**:
  - 100% of generated stream objects contain the direct proxy `url` property.
  - `externalUrl` key is strictly `undefined` / omitted, guaranteeing in-app player rendering without external browser popups.

### 2.3 Subtitle Proxy (`/hls/sub.vtt` & `/hls/sub`)

- **Format Transformations**:
  - Native WebVTT: Preserved with clean `WEBVTT\n\n` header (no duplicate headers).
  - SRT Subtitles: Comma millisecond timestamps (`00:00:01,234 --> 00:00:04,567`) converted to dot timestamps (`00:00:01.234 --> 00:00:04.567`).
  - Byte Order Mark (BOM): `0xFEFF` successfully stripped from leading buffer.
  - CRLF Line Breaks: Windows `\r\n` normalized to standard `\n`.
  - Vietnamese Diacritics: `Ứ Ử Ữ Ợ Đ`, `Xin chào thế giới phim ảnh!` perfectly preserved in UTF-8 output.
- **Anti-Hotlinking Headers**:
  - Proxy correctly decodes `ref` parameter and forwards `Referer: https://vsmov.com/` and derived `Origin: https://vsmov.com` to upstream CDNs.
- **Concurrency & Resilience**:
  - Sustained 100 concurrent mixed subtitle requests with 0 dropped connections and 100% HTTP 200 responses.
  - Missing parameters return clean `HTTP 400 Bad Request`.
  - Upstream 404/500 errors return `HTTP 404` / `HTTP 502` with `Access-Control-Allow-Origin: *` without crashing the process.

### 2.4 UI Route Safety & Zero Shadowing

- Verified that the UI configurator handler listening on `['/', '/configure', '/:config', '/:config/configure']` uses `isConfigToken(token)` validation and delegates unknown routes to `next()`.
- Verified non-conflicting routing:
  - `GET /manifest.json` $\rightarrow$ 200 OK (22 catalogs)
  - `GET /:config/manifest.json` $\rightarrow$ 200 OK (Filtered catalogs matching active providers/categories)
  - `GET /catalog/...` $\rightarrow$ 200 OK
  - `GET /meta/...` $\rightarrow$ 200 OK
  - `GET /stream/...` $\rightarrow$ 200 OK
  - `GET /health` $\rightarrow$ 200 OK
  - `GET /hls/...` $\rightarrow$ 200 OK

---

## 3. Verdict

**Final Verdict**: **`CONFIRM`**  
The implementation under review satisfies all architectural, performance, playback, subtitle, and UI requirements without regressions.
