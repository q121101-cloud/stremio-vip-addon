# Challenger 1 Empirical & Adversarial Handoff Report — Engine v1.7.0 Overhaul

**Verdict**: **APPROVE**  
**Timestamp**: 2026-08-18T10:33:00Z  
**Agent**: `challenger_1` (Critic & Domain Specialist)  
**Project**: Stremio VIP Movies Addon Engine v1.7.0  

---

## 1. Observation

Direct empirical execution of tests across the codebase produced the following observations:

### 1.1 Syntax and Baseline Verification
- **Syntax Check**:
  - Command: `node --check src/index.js`
  - Output: Exit code 0 (no syntax errors).
- **Official v1.7.0 Playback Verification**:
  - Command: `node tests/verify_v170_playback.js`
  - Results: **38/38 assertions passed (100%)**
  - Key results:
    * `GET /default/catalog/movie/stp-phim-le.json` → HTTP 200 (18 metas)
    * `GET /default/catalog/series/clbpx-hong-kong.json` → HTTP 200 (10 metas)
    * `GET /default/catalog/series/yan-dang-chieu.json` → HTTP 200 (28 metas)
    * `GET /default/stream/series/koreandrama:teach-you-a-lesson:1:1.json` → HTTP 200 (5 active streams, 0 YAN junk streams)
    * `GET /default/stream/series/koreandrama:a-shop-for-killers:1:1.json` → HTTP 200 (4 active streams)
    * `GET /default/stream/movie/tt5095030.json` (Avengers 3) → HTTP 200 (5 active streams)
    * Multi-level HLS sub-variant traversal succeeded to `3500kb/hls/index.m3u8` with 802 rewritten TS segments.
    * TS Segment 1 download: 416.2 KB (> 100KB), HTTP 200, `byte[0] = 0x47`.
    * TS Segment 2 download: 919.4 KB (> 100KB), HTTP 200, `byte[0] = 0x47`.
    * HTTP Range 206 seeking on live segment: HTTP 206, `Content-Range: bytes 0-1023/426196`, exactly 1024 bytes buffer.
- **Comprehensive All-Providers Verification**:
  - Command: `node tests/verify_all_providers_playback.js`
  - Results: **44/44 assertions passed (100%)**
  - All 22 catalogs returned HTTP 200.
  - All 6 provider clusters (VSMOV 4K, KKPhim FHD, NguonC FHD, STP Cinema, CLBPX Wuxia, YAN Donghua) verified with live segment downloads > 100KB and `0x47` sync byte.
- **Integration Test Suite**:
  - Command: `npm test` (`node src/test.js`)
  - Results: **50/50 test cases passed (100%)**

### 1.2 Dedicated Adversarial Stress Testing
- Command: `node tests/challenger_v170_empirical_stress.test.js`
- Results: **133/133 assertions passed (100%)**
  1. **HLS Proxy Multi-Level Rewriting & Slicing (`src/routes/hls.js`)**:
     - Master playlist rewriting bakes variants into `/hls/manifest.m3u8`, subtitles into `/hls/sub.vtt`, keys into `/hls/key`.
     - Sub-variant relative paths (`segment_000.ts`, `../segments/segment_001.ts`, `/root_segment_002.ts`) resolved to absolute URLs against sub-variant baseUrl.
     - Local buffer Range 206 chunk slicing (`bytes=0-99`, `bytes=100-199`) returns HTTP 206 with valid `Content-Range` and preserved `0x47` sync byte.
     - Response headers confirmed: `Content-Type: video/MP2T`, `Cache-Control: public, max-age=3600`, `Accept-Ranges: bytes`, `Access-Control-Allow-Origin: *`.
     - Subtitle proxy converts SRT comma timestamps (`00:00:01,000` -> `00:00:01.000`), adds `WEBVTT` header, strips UTF-8 BOM, and preserves Vietnamese Unicode diacritics.
  2. **Provider Scrapers (`src/providers/stp.js`, `src/providers/clbpx.js`, `src/providers/yan.js`)**:
     - STP XOR 0x2a decode correctly decrypts obfuscated stream strings and handles null/empty safely.
     - STP HTML card parsing and `episodeGroup` parsing verified.
     - CLBPX HTML card parsing (`halim-thumb`) verified.
     - YAN HTML card parsing with `STATIC_YAN_ROUTES` filtering (`moi-cap-nhat`, etc.) verified.
  3. **Strict Donghua Guard (`src/providers/yan.js`)**:
     - 12 KDrama titles (*Teach You A Lesson*, *A Shop for Killers*, *Crash Landing on You*, *Squid Game*, *The Glory*, *Queen of Tears*, *Vincenzo*, *Itaewon Class*, *Descendants of the Sun*, *Goblin*, *Moving*, *All of Us Are Dead*) rejected (returns `false`).
     - 12 Hollywood/US-UK titles (*Lanterns*, *Avengers: Endgame*, *Breaking Bad*, *Oppenheimer*, *Stranger Things*, *Game of Thrones*, *House of the Dragon*, *The Boys*, *Better Call Saul*, *The Walking Dead*, *Prison Break*, *Money Heist*) rejected (returns `false`).
     - 15 true Donghua/Anime titles (*Thế Giới Hoàn Mỹ*, *Tiên Nghịch*, *Đấu La Đại Lục*, *Đấu Phá Thương Khung*, *Phàm Nhân Tu Tiên*, *Thôn Phệ Tinh Không*, *Già Thiên*, *Mục Thần Ký*, *Trảm Thần*, *Solo Leveling*, *One Piece*, *Naruto*, *Jujutsu Kaisen*, *Demon Slayer*, *Attack on Titan*) accepted (returns `true`).
     - Empirical calls to `yan.getStreams(...)` for *Teach You A Lesson*, *A Shop for Killers*, and *Avengers* returned 0 streams (`[]`).
  4. **Multi-Keyword Fallback & Universal Episode Matcher (`src/lib/utils.js`)**:
     - `generateSearchKeywords` correctly strips season markers (*Season 1*, *Phần 1*, *P1*), strips 4-digit release years (*Inception (2010)* -> *Inception*), and normalizes punctuation (*9-1-1* -> *9 1 1*).
     - `matchEpisodeItem` strictly guards against false-positive multi-digit overlaps: Ep 1 does NOT match Ep 10, 11, 12, 100, 21; Ep 2 does NOT match Ep 20, 22.
     - True-positive episode matching passed across 13 variations (`1`, `01`, `Tập 1`, `Tập 01`, `Tap 1`, `Episode 1`, `Ep 1`, `E01`, `Full`, `Trọn Bộ`).
     - Negative and zero episode numbers (`-1`, `0`, `-99`) safely rejected.
  5. **In-App Stream Protocol Invariants**:
     - All live streams contain valid `url` (pointing to `/hls/manifest.m3u8`), strictly zero `externalUrl` (`undefined`), and official brand name `VIP Movies 🎬`.

### 1.3 Full Regression Challenge Suite
- Command: `node tests/challenger1_v162_adversarial_empirical.test.js`
- Results: **127/127 assertions passed (100%)**
- 50 simultaneous parallel burst requests handled with 0 socket drops or crashes.
- MPEG-TS sync byte `0x47` confirmed across 50 consecutive 188-byte packets on real downloaded stream chunks (1.87 MB).

---

## 2. Logic Chain

1. **R1 HLS Proxy Multi-Level Resolving & Range 206 Integrity**:
   - Observations in Section 1.1, 1.2, 1.3, and Phase 3/4 show that master manifests rewrite variant URLs into `/hls/manifest.m3u8`, sub-variants correctly resolve relative `.ts` segments using the sub-variant URL as `baseUrl`, and Range 206 slicing functions locally when upstream responds with HTTP 200 or 206.
   - Therefore, the 404 sub-variant resolution issue for KDrama / US-UK streams is completely resolved.

2. **R2 HTML Cheerio Scrapers for STP, CLBPX, and YAN**:
   - Observations in Section 2 show that `src/providers/stp.js` correctly parses sieutamphim.pro HTML cards, decodes XOR 0x2a strings, and extracts playable streams.
   - `src/providers/clbpx.js` parses clbphimxua.info HTML cards and executes stream extraction.
   - `src/providers/yan.js` parses yanhh3d.pw cards and filters static navigation routes.
   - Therefore, all three new provider modules are functioning according to specifications.

3. **R3 Strict Donghua Guard & Multi-Keyword Matching**:
   - Observations in Section 3 and Section 4 confirm that `isDonghuaOrAnime` and `yan.getStreams` reject KDrama and US-UK queries (returning 0 streams), preventing wrong Donghua stream assignment.
   - Multi-keyword generation strips seasons, years, and punctuation, while `matchEpisodeItem` avoids multi-digit false positive collisions (e.g. Ep 1 matching Ep 10, 100).
   - Therefore, KDrama and Western stream search and episode resolution are robust and clean.

4. **Zero Regression across All Tests**:
   - With 392 total assertions passing (38 in `verify_v170_playback.js`, 44 in `verify_all_providers_playback.js`, 50 in `npm test`, 133 in `challenger_v170_empirical_stress.test.js`, 127 in `challenger1_v162_adversarial_empirical.test.js`), there are 0 regression failures.

---

## 3. Caveats

- Upstream CDN endpoints (e.g., `phimapi.com`, `vsmov.com`, `sieutamphim.pro`) may experience transient rate limiting (HTTP 429) during extremely rapid bursts (e.g. 50 parallel requests). The addon's graceful fallback handles this cleanly by falling back across provider tiers without crashing the Express process.
- No other caveats.

---

## 4. Conclusion

**Verdict: APPROVE**

Engine v1.7.0 has successfully resolved all playback, HLS sub-variant 404, provider scraping, Strict Donghua Guard, and multi-keyword episode matching requirements with 100% empirical pass rate across 392 automated assertions.

---

## 5. Verification Method

To independently verify the empirical results:

```bash
# 1. Syntax Check
node --check src/index.js

# 2. Official Engine v1.7.0 Live Playback Verification Suite
node tests/verify_v170_playback.js

# 3. Comprehensive All-Providers Playback Suite
node tests/verify_all_providers_playback.js

# 4. Standard Integration Test Suite
npm test

# 5. Challenger 1 Empirical & Adversarial Stress Test Suite
node tests/challenger_v170_empirical_stress.test.js

# 6. Full Adversarial Regression Suite
node tests/challenger1_v162_adversarial_empirical.test.js
```
