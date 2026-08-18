# Milestone 2 Adversarial Challenger Report — VSMOV 4K Multi-Server & Subtitles

**Agent**: `teamwork_preview_challenger_m2_1`  
**Verdict**: `APPROVE`  
**Target Module**: `src/providers/vsmov.js`  
**Date**: 2026-08-18  

---

## 1. Observation

Direct empirical observations and execution results:

1. **Official & Test Suites Verification**:
   - `node tests/verify_vsmov_sub_audio.js` ran 62 assertions on ephemeral port and passed **62/62 (100%)** in 4.59s:
     - Harry Potter (`tt0373889`) resolved 2 distinct VSMOV streams: Vietsub and Lồng Tiếng.
     - Live subtitle proxy fetch returned HTTP 200 with valid `WEBVTT` header.
     - In-App protocol compliance (`url` present, `externalUrl` omitted) verified across all streams.
   - `node tests/test_m1_subtitle_proxy.js` passed **26/26 (100%)** assertions verifying `/hls/sub.vtt` routing, base64 encoding/decoding, SRT-to-WebVTT conversion, and UTF-8 BOM stripping.

2. **Dedicated Empirical Adversarial Test Suite** (`.agents/teamwork_preview_challenger_m2_1/test_adversarial_vsmov.js`):
   - Executed **93 adversarial assertions** across 5 distinct test suites, achieving **93/93 (100%) pass rate**:
     - **Suite 1 (Server Audio Classification)**: Tested 17 audio name variations including standard titles, uppercase, ASCII unaccented, multi-line dirty whitespace (`"  Vietsub\n #1  "`, `"\t\r\nLồng tiếng\r\n\t#1\t"`, `"Thuyết \t\t minh \n\n #2"`), hash symbols (`#1`, `#10`), empty string `""`, `null`, `undefined`, and unknown labels. All 17 mapped correctly to their respective audio type (`vietsub`, `longtieng`, `thuyetminh`), label (`Vietsub`, `Lồng Tiếng`, `Thuyết Minh`), and binge group (`vsmov-vietsub-4k-vip-1`, `vsmov-longtieng-4k-vip-1`, `vsmov-thuyetminh-4k-vip-1`).
     - **Suite 2 (Embed HTML & Subtitle Scraping Resiliency)**: Tested 12 embed variations with an ephemeral Express mock server:
       1. Standard embed HTML with `playerOptions.subtitles` and relative URL (`/video/.../subtitle/...vtt`) → Extracted master m3u8 and resolved absolute subtitle URL against embed origin.
       2. Absolute CDN subtitle URL (`https://cdn.vsmov.com/subtitles/vietnamese.vtt`) → Preserved untouched.
       3. Relative subtitle URL without leading slash (`subtitles/relative_no_slash.vtt`) → Resolved correctly against embed origin.
       4. Regex fallback on raw `<track src="/subtitles/fallback-viet.vtt">` without `playerOptions` → Successfully extracted subtitle.
       5. Malformed JSON with syntax errors in `playerOptions` → Gracefully recovered without crashing and extracted `baseUrl + videoHash` stream.
       6. Empty `subtitles: []` (common in dubbed/voiceover tracks) → Yielded `subtitleUrl = null` without error.
       7. Multi-language subtitles array (`["eng", "fra", "vie"]`) → Correctly prioritized Vietnamese (`vie`/`vi`/`tiếng việt`) over foreign tracks.
       8. Upstream HTTP 500 error → Handled gracefully with fallback to pathname `videoHash`.
       9. Upstream HTTP 404 error → Handled gracefully with fallback to pathname `videoHash`.
       10. Direct `link_m3u8` string bypass → Immediate resolution without scraping.
       11. Null / empty string inputs → Returned `{ masterPlaylistUrl: null, subtitleUrl: null }` without throwing.
     - **Suite 3 (Real-World Catalog Queries)**:
       - Multi-server movie Harry Potter `tt0373889`: 2 streams (Vietsub + Lồng Tiếng), valid subtitles on Vietsub, correct binge groups.
       - Spider-Man No Way Home `tt10872600`: 2 streams, valid In-App protocol.
       - Breaking Bad `tt0903747:1:1`: Extracted series streams with formatted episode badge (`[Tập 1]`).
     - **Suite 4 (Synthetic Edge Cases & Invariants)**:
       - Single-server movie fixture: Returns exactly 1 stream with `bingeGroup: "vsmov-vietsub-4k-vip-1"` and stripped `[Full]` episode label.
       - Triple-server movie fixture (Vietsub, Lồng Tiếng, Thuyết Minh): Returns 3 streams with isolated binge groups (`vsmov-vietsub-4k-vip-1`, `vsmov-longtieng-4k-vip-1`, `vsmov-thuyetminh-4k-vip-1`).
       - Empty `server_data: []` fixture: Safely skipped.
       - Series out-of-range episode (`episode: 999`), negative episode (`episode: -5`), and regex bomb (`episode: "(((a+)+)+)+$"`) → Handled gracefully, returning empty array `[]` without freezing the event loop.
     - **Suite 5 (Subtitle URL Encoding & Invariants)**:
       - Verified Base64URL lossless encoding and round-trip decoding for proxy subtitle URLs and referer headers.

---

## 2. Logic Chain

1. **Audio Classification Invariant** (Obs. 2, Suite 1):
   - `classifyServerAudio` in `src/providers/vsmov.js:68-94` cleans incoming server names using `.replace(/[\r\n]+/g, ' ').replace(/#/g, '').replace(/\s+/g, ' ').trim()`.
   - Diacritic-tolerant regex matches both accented and unaccented variations (`/l.{1,5}ng\s*ti.{1,5}ng/i`, `/long\s*tieng/i`, `/thuy.{1,5}t\s*minh/i`, `/thuyet\s*minh/i`) and defaults safely to `Vietsub`.
   - Assigns isolated `bingeGroup` values (`vsmov-vietsub-4k-vip-1`, `vsmov-longtieng-4k-vip-1`, `vsmov-thuyetminh-4k-vip-1`) ensuring Stremio's auto-play does not jump across different audio versions.

2. **Embed HTML & Subtitle Resolution Resilience** (Obs. 2, Suite 2):
   - `resolveEmbedMedia` in `src/providers/vsmov.js:99-211` unifies embed fetching, caching with a 24-hour TTL in `imdbCache`, and multi-tier regex/JSON parsing.
   - Handles relative URLs via `new URL(subtitleUrl, embedOrigin).href` with a string concatenation fallback.
   - Robustly handles empty subtitles arrays, malformed JSON, and network errors without unhandled rejections.

3. **Multi-Server vs Single-Server Stream Generation** (Obs. 1, Obs. 2, Suites 3 & 4):
   - `getStreams` iterates over all elements in `episodes` array, finding matching episode entries for each server tab.
   - Single-server movies yield 1 stream; multi-server movies yield separate, clearly labeled streams (`[VIP 1 • VSMOV] <Audio> 4K Ultra HD (3840x2160)`).
   - All streams satisfy the strict In-App Direct Play protocol: `url` is present, `externalUrl` is strictly undefined.

---

## 3. Caveats

- **External Upstream APIs**: In tests hitting third-party live servers (KKPhim/Ophim/STP), upstream rate limiting (HTTP 429) can occur when flooded. However, VSMOV 4K's official API (`vsmov.com/api`) and embed CDN (`v5.streamvsmov.com`) executed reliably with 100% success.
- **Empty Subtitles on Dubbed Tracks**: As designed, dubbed or voiceover streams lacking subtitle files omit the `subtitles` property to prevent players from requesting blank tracks.

---

## 4. Conclusion

The Milestone 2 implementation in `src/providers/vsmov.js` successfully satisfies all functional, architectural, and adversarial requirements:
- Server audio tabs are accurately classified into distinct streams (`Vietsub`, `Lồng Tiếng`, `Thuyết Minh`).
- Subtitle URLs are extracted, resolved to absolute CDN paths, and routed through `/hls/sub.vtt`.
- In-App Direct Play protocol invariants (`url` present, `externalUrl` omitted) are strictly preserved across 100% of streams.
- Adversarial tests against dirty server names, malformed embed payloads, relative/absolute URLs, and regex attacks all passed with zero errors.

**Final Verdict**: **`APPROVE`**

---

## 5. Verification Method

To independently verify these results:

```bash
# 1. Run official VSMOV verification suite (62 assertions)
node tests/verify_vsmov_sub_audio.js

# 2. Run subtitle proxy route suite (26 assertions)
node tests/test_m1_subtitle_proxy.js

# 3. Run dedicated adversarial challenger stress harness (93 assertions)
node .agents/teamwork_preview_challenger_m2_1/test_adversarial_vsmov.js
```

**Invalidation Conditions**:
- Any assertion failure in `tests/verify_vsmov_sub_audio.js` or `test_adversarial_vsmov.js`.
- Any stream object missing `url` or containing `externalUrl`.
- Any unhandled exception during embed HTML scraping or audio classification.
