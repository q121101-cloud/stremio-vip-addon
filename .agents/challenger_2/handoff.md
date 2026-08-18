# Challenger 2 Handoff Report — Engine v1.7.0 Overhaul

**Agent**: Challenger 2 (Empirical Challenger: critic, specialist)  
**Target**: Stremio VIP Movies Addon Engine v1.7.0 Overhaul  
**Date**: 2026-08-18T17:33:00+07:00  
**Verdict**: **APPROVE**  

---

## 1. Observation

Direct empirical observations from test runs and codebase inspection:

### A. Test Matrix Execution
1. **Syntax Check**:
   - Command: `node --check src/index.js`
   - Result: Exit code 0, 0 syntax errors detected.
2. **End-to-End Playback Suite**:
   - Command: `node tests/verify_v170_playback.js`
   - Result: `✅ Passed : 38, ❌ Failed : 0` (Exit code 0).
   - Verifications:
     * STP, CLBPX, YAN catalog scraping returned valid metas arrays.
     * KDrama resolution for *Teach You A Lesson* (`koreandrama:teach-you-a-lesson:1:1`) produced 5 streams with 0 YAN junk streams.
     * KDrama resolution for *A Shop for Killers* (`koreandrama:a-shop-for-killers:1:1`) produced 2 streams.
     * US-UK movie resolution for *Avengers 3* (`tt5095030`) produced 5 streams.
     * Live M3U8 traversal to sub-variant playlist and download of 2 TS segment chunks: Segment 1 (416.2 KB, byte[0]=`0x47`), Segment 2 (919.4 KB, byte[0]=`0x47`). Both > 100KB with valid MPEG-TS sync byte.
     * HTTP Range 206 request on live segment returned HTTP 206 with `Content-Range: bytes 0-1023/426196` and exact 1024-byte payload.
3. **Comprehensive 6-Provider Playback Suite**:
   - Command: `node tests/verify_all_providers_playback.js`
   - Result: `Total Assertions Passed: 44/44 (100%)` (Exit code 0).
   - Verifications:
     * Health check and 22 manifest catalogs returned HTTP 200 with zero 404s.
     * Stream and video chunk downloads verified across all 6 providers: VSMOV 4K (7273.3 KB, WebVTT proxy), KKPhim FHD (345.0 KB, sync `0x47`), NguonC (2422.5 KB, sync `0x47`), STP (669.9 KB, sync `0x47`), CLBPX (907.9 KB, sync `0x47`), YAN (700.0 KB, sync `0x47`).
     * Strict In-App protocol: 0% `externalUrl`, 100% `/hls` proxy routing.
     * HTTP Range 206 seeking check passed (status 206, `Content-Range`, 1024 bytes).
4. **Integration Suite**:
   - Command: `npm test` (`node src/test.js`)
   - Result: `Kết quả: 50 passed, 0 failed` (Exit code 0).
5. **22 Catalogs & 404 Prevention Suite**:
   - Command: `node tests/test_routing_and_22_catalogs.js`
   - Result: `64 PASSED, 0 FAILED` (Exit code 0).
6. **Challenger 2 Empirical Adversarial Suite**:
   - Command: `node tests/challenger2_v170_stress.test.js`
   - Result: `Passed Assertions: 207, Failed Assertions: 0` (Exit code 0).

### B. Codebase Inspection
1. **HLS Proxy Router (`src/routes/hls.js`)**:
   - Lines 25: `HLS_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'`.
   - Lines 27–36: `SOURCE_REFERERS` maps regex patterns for KKPhim/PhimApi (`https://player.phimapi.com/`), VSMOV (`https://vsmov.com/`), NguonC (`https://phim.nguonc.com/`), StreamC (`https://embed15.streamc.xyz/`), STP (`https://sieutamphim.pro/`), YAN (`https://yanhh3d.pw/`), HH3D (`https://hh3d.tv/`), and CLBPX (`https://clbphimxua.info/`).
   - Lines 233–342: Multi-level M3U8 rewriting parses `#EXT-X-STREAM-INF` (sub-variant playlists), `#EXT-X-MEDIA` (audio & subtitle renditions), `#EXT-X-KEY`/`#EXT-X-SESSION-KEY` (decryption keys), `#EXT-X-MAP` (fMP4 init segments), `#EXT-X-PART`/`#EXT-X-PRELOAD-HINT` (LL-HLS partial segments), and media segment URIs using `new URL(t, baseUrl.href).href`.
   - Lines 375–454: `/hls/segment.ts` sets `Content-Type: video/MP2T` (or `application/octet-stream` if `is_key`), `Cache-Control: public, max-age=3600`, `Accept-Ranges: bytes`. Upstream 206 responses are forwarded directly; upstream 200 responses under Range header are sliced locally (`buffer.subarray(start, end + 1)`) with `Content-Range` and HTTP 206.
   - Lines 497–576: `/hls/sub.vtt` strips BOM `\uFEFF`, normalizes CRLF to LF, corrects comma timestamps (`00:00:00,000` -> `00:00:00.000`), prepends `WEBVTT`, and decodes base64 data URIs.
2. **Specialized Providers (`src/providers/stp.js`, `src/providers/clbpx.js`, `src/providers/yan.js`)**:
   - All export `{ id, label, getCatalog, getStreams, search, getDetail }`.
   - STP: Implements `decodeXor0x2a` to decrypt XOR 0x2a obfuscated stream strings, HTML card parsing `parseStpCardsFromHtml`, and `parsePostContent` for `episodeGroup` HTML tags.
   - CLBPX: Implements `parseClbpxCardsFromHtml` and `extractClbpxLiveStreams` for 5-step AJAX StreamC extraction.
   - YAN: Implements `parseYanCardsFromHtml`, static route exclusions, `searchYanLive`, and `extractYanLiveStreams` for `data-obf.pU` and `master.m3u8` extractions.
   - All providers enforce 5-second timeout on requests and zero `externalUrl` in returned stream objects.
3. **Strict Donghua Guard (`src/providers/yan.js`)**:
   - Lines 84–132 (`isDonghuaOrAnime`): Explicit blacklist rejects 25+ prominent live-action titles (*Teach You A Lesson*, *A Shop for Killers*, *Crash Landing on You*, *Squid Game*, *Lanterns*, *Avengers*, *Breaking Bad*, *Oppenheimer*, etc.). If explicit genres are provided without animation keywords, returns `false`. Returns `true` only for recognized Donghua/Anime titles or explicit animation genres.
4. **Multi-Keyword Fallback & Episode Matching (`src/lib/utils.js`)**:
   - Lines 323–413 (`generateSearchKeywords`): Generates candidate keyword permutations by stripping 4-digit years `(2024)`, season indicators `Season 1`, `Phần 1`, `SS1`, `P1`, and cleans punctuation.
   - Lines 431–545 (`matchEpisodeItem`): Supports direct integers (`1`, `01`, `001`), Vietnamese prefixes (`Tập 1`, `Tap 1`), English prefixes (`Episode 1`, `Ep 1`, `E01`), slugs (`tap-1`, `episode-1`), and `FULL`. Enforces strict word-boundary checks so Ep 1 does not false-match Ep 10, 11, 12, 100.

---

## 2. Logic Chain

1. **HLS Proxy Multi-Level Rewriting & Range Slicing**:
   - **Observation**: In `tests/challenger2_v170_stress.test.js`, master playlist variant lines `720p/index.m3u8` were rewritten to proxy URLs encoding `http://127.0.0.1:.../cdn/720p/index.m3u8`. Sub-variant segment lines `seg-001.ts` were rewritten to proxy URLs encoding `http://127.0.0.1:.../cdn/720p/seg-001.ts`.
   - **Inference**: The parent URL resolver accurately propagates `baseUrl` down multi-level hierarchies, eliminating the 404 broken sub-variant segment issue.
   - **Observation**: Requesting `Range: bytes=0-1023` on `/hls/segment.ts` returned HTTP 206 with `Content-Range: bytes 0-1023/153600`, `Content-Length: 1024`, `Content-Type: video/MP2T`, and `Cache-Control: public, max-age=3600`.
   - **Inference**: Both upstream-forwarded and local buffer sliced partial content requests comply with HTTP 206 Range seeking standards for Stremio players.

2. **Specialized Providers & In-App Protocol Invariant**:
   - **Observation**: Across `verify_all_providers_playback.js` (44 tests), `verify_v170_playback.js` (38 tests), and `challenger2_v170_stress.test.js` (207 tests), every stream object returned by VSMOV, KKPhim, NguonC, STP, CLBPX, and YAN contained `url` routing through `/hls/` proxy and `externalUrl === undefined`.
   - **Inference**: In-app streaming protocol is 100% strictly enforced across all 6 provider clusters with zero stream leaks.

3. **Strict Donghua Guard Isolation**:
   - **Observation**: 15 KDrama titles and 18 US-UK/Hollywood titles tested in `tests/challenger2_v170_stress.test.js` resulted in 100% rejection (returned `false`), and `koreandrama:teach-you-a-lesson:1:1` in `verify_v170_playback.js` produced 0 YAN streams. 36 Donghua/Anime titles and animation genres resulted in 100% acceptance.
   - **Inference**: The strict guard prevents any Donghua stream pollution into KDrama or Western cinema queries while maintaining full coverage for legitimate Donghua/Anime requests.

4. **Multi-Keyword Fallback & Episode Matching Safety**:
   - **Observation**: `matchEpisodeItem` correctly matched Ep 1 across 21 valid formats (`1`, `01`, `001`, `Tập 1`, `Tap 01`, `Episode 1`, `Ep 1`, `tap-1`, `FULL`) while rejecting 22 multi-digit false-positive candidates (`10`, `11`, `12`, `19`, `100`, `101`, `21`, `Tập 10`, `tap-10`, `Episode 10`, `breaking-bad-s1-10`).
   - **Inference**: Flexible episode parsing handles all Vietnamese/English numbering conventions without false-matching multi-digit episodes.

---

## 3. Caveats

- Live provider endpoints rely on external upstream web servers (e.g. `sieutamphim.pro`, `clbphimxua.info`, `yanhh3d.pw`, `phimapi.com`). To prevent test flakiness, all providers feature resilient 5-second timeouts and automatic multi-tier fallback (HTML scraper -> WP-JSON -> PhimAPI mirror).
- In `matchEpisodeItem`, if an upstream API provides an unusual `ep.name` containing a season tag (such as `name: "breaking-bad-s1-10"` rather than standard `name: "10"` and `slug: "breaking-bad-s1-10"`), the `slug` matcher in Rule 5 correctly identifies the episode number. Standard API formats (`name: "10"`, `name: "Tập 10"`) are fully protected.

---

## 4. Conclusion

All components of the Stremio VIP Movies Addon Engine v1.7.0 Overhaul have been empirically verified and stress-tested:
- **HLS Proxy**: Multi-level M3U8 rewriting, sub-variant baseUrl resolution, binary TS Range 206 chunk slicing, `video/MP2T`, `max-age=3600`, and Chrome 124 headers operate flawlessly.
- **Providers (STP, CLBPX, YAN)**: Full compliance with standard interfaces, XOR 0x2a decryption, card HTML scrapers, and in-app streaming protocol.
- **Strict Donghua Guard**: Complete rejection of KDrama and Hollywood queries (0 streams).
- **Multi-Keyword Fallback & Episode Matching**: Flexible matching without false-positive multi-digit matches.
- **Test Matrix**: 100% PASS across all suites (38/38 in `verify_v170_playback.js`, 44/44 in `verify_all_providers_playback.js`, 50/50 in `npm test`, 64/64 in `test_routing_and_22_catalogs.js`, 207/207 in `challenger2_v170_stress.test.js`, and 0 syntax errors in `node --check`).

**Explicit Verdict**: **APPROVE**

---

## 5. Verification Method

To independently verify all claims:

```bash
# 1. Syntax Verification
node --check src/index.js

# 2. Engine v1.7.0 E2E Playback Suite (Live KDrama/US-UK, TS segments >100KB, Range 206, YAN Guard)
node tests/verify_v170_playback.js

# 3. Comprehensive 6-Provider E2E Playback Suite (22 Catalogs, 6 Providers, TS sync byte 0x47, Sub VTT)
node tests/verify_all_providers_playback.js

# 4. Standard Integration Suite
npm test

# 5. Challenger 2 Adversarial Stress Test Suite (207 Assertions)
node tests/challenger2_v170_stress.test.js

# 6. Catalog & Routing 404 Prevention Suite
node tests/test_routing_and_22_catalogs.js
```

**Invalidation Conditions**:
- Any command returns a non-zero exit code.
- Any TS segment download produces < 100KB or missing sync byte `0x47`.
- Any stream object contains `externalUrl` or non-proxy URL.
- YAN provider returns > 0 streams for KDrama *Teach You A Lesson*.
