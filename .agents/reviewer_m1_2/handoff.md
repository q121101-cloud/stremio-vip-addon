# Reviewer & Adversarial Critic Handoff Report: Engine v1.7.0 Overhaul

**Reviewer**: Reviewer 2 (`reviewer_m1_2`)  
**Role**: Reviewer & Adversarial Critic  
**Date**: 2026-08-18T10:31:00Z  
**Verdict**: **APPROVE**

---

## 1. Observation

### 1.1 HLS Proxy Router (`src/routes/hls.js`)
- **Multi-Level M3U8 Parent Resolver**:
  * Line 224: `const finalUrl = r.request?.res?.responseUrl || effectiveTargetUrl;`
  * Line 226: `baseUrl = new URL(finalUrl);`
  * Line 257 & 331: Relative paths within variant playlists resolve against `baseUrl.href`.
  * Variant sub-playlists are wrapped into `/hls/manifest.m3u8?url=${b64Uri}&ref=${encodedRef}`.
  * Segment lines `.ts` are wrapped into `/hls/segment.ts?url=${b64Url}&ref=${encodedRef}`.
- **Browser Simulation Headers & Anti-403 Mapping**:
  * `HLS_UA` configured as Windows Chrome 124 (`Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36`).
  * Default headers include `Accept: */*`, `Accept-Language: vi,en-US;q=0.9,en;q=0.8`, `Connection: keep-alive`.
  * Dynamic Referer and Origin mapping in `SOURCE_REFERERS` covering KKPhim/Opstream/PhimAPI, NguonC, VSMOV, STP, CLBPX, YAN, and StreamC.
- **Binary ArrayBuffer Segment Proxy & HTTP Range 206 (`/hls/segment.ts`)**:
  * Configured with `responseType: 'arraybuffer'`, `maxRedirects: 5`, `timeout: 15000`.
  * Headers set: `Content-Type: video/MP2T`, `Access-Control-Allow-Origin: *`, `Cache-Control: public, max-age=3600`, `Accept-Ranges: bytes`.
  * Handled upstream HTTP 206 transparently and implemented local buffer slicing fallback (`buffer.subarray(start, end + 1)`) for HTTP 200 responses to satisfy Range requests.

### 1.2 Provider Scrapers & Hardening (`src/providers/`)
- **STP (`src/providers/stp.js`)**:
  * Real Cheerio HTML card parser `parseStpCardsFromHtml` and post content parser `parsePostContent` with XOR 0x2a stream deobfuscation (`decodeXor0x2a`).
  * Dead/unplayable shortlink filtering (`isDeadOrBadUrl`) excluding `short.icu`, `short.ink`, `bysevepoin`.
  * Multi-tier fallback (Live HTML -> WP-JSON API -> PhimAPI mirror).
- **CLBPX (`src/providers/clbpx.js`)**:
  * Real HTML card parser `parseClbpxCardsFromHtml` and 5-step live stream extractor `extractClbpxLiveStreams` for player.php / StreamC embeds.
  * Scored candidate search iteration (`scoreMatch >= 0.40`) and mirror fallback.
- **YAN (`src/providers/yan.js`)**:
  * Real HTML card parser `parseYanCardsFromHtml` and live stream extractor `extractYanLiveStreams` decoding `data-obf` base64 payloads.
  * **Strict Donghua Guard (`isDonghuaOrAnime`)**: Blocks Live-Action, KDrama, and Western/Hollywood titles (e.g. *Teach You A Lesson*, *A Shop for Killers*, *Breaking Bad*, *Avengers*) returning 0 streams.

### 1.3 Search & Episode Matching (`src/lib/utils.js`, `src/providers/kkphim.js`, `src/providers/nguonc.js`)
- `generateSearchKeywords`: Strips trailing release years, `Season X` / `Phần X` / `Part X` tokens, and punctuation to generate clean multi-keyword fallbacks.
- `matchEpisodeItem`: Universal episode matcher handling numeric tokens, Vietnamese prefixes (`Tập 1`, `Tập 01`), English prefixes (`Episode 1`, `Ep 1`), slugs (`tap-1`, `episode-1`), and strict boundary checks against false-positive multi-digit overlaps.

### 1.4 Versioning & Signature
- Synchronized version `1.7.0` across `package.json`, `src/manifest.js`, `src/handlers.js`, `src/index.js`.
- Footer signature in `src/handlers.js` matches:
  `VIP Movies Addon v1.7.0 • Designed with Taste by <span class="brand-highlight">Q121101</span>`.

### 1.5 Independent Verification Executions
- `node --check src/index.js ...`: Syntax check passed on all files with 0 errors.
- `node tests/verify_v170_playback.js`: **38/38 Passed (100%)**, 0 Failed.
- `node tests/verify_all_providers_playback.js`: **44/44 Passed (100%)**, 0 Failed.
- `npm test`: **50/50 Passed (100%)**, 0 Failed.

---

## 2. Logic Chain

1. **Integrity & Authenticity Check**:
   - Source files contain genuine parsing and network logic with no mocked return values, hardcoded test results, or facade stubs.
   - All tests run against live ephemeral HTTP Express servers on port 0, performing real network calls and parsing real binary MPEG-TS chunks.

2. **Resolution of 404 HLS Sub-Variant Defect**:
   - Using `finalUrl` from `r.request?.res?.responseUrl || effectiveTargetUrl` guarantees that relative `.m3u8` and `.ts` lines resolve correctly against redirected CDN URLs rather than the initial proxy request path.
   - Live segment download in `verify_v170_playback.js` and `verify_all_providers_playback.js` proved that segments are downloaded successfully with buffer size > 100KB and MPEG-TS sync byte `0x47`.

3. **Strict Donghua Guard Validation**:
   - `isDonghuaOrAnime` in `src/providers/yan.js` correctly prevents false positive matches on Korean/Western series like *Teach You A Lesson*, returning 0 streams.

4. **Zero Regression & Protocol Compliance**:
   - All streams adhere to the strict In-App HLS Proxy requirement (`url` pointing to `/hls/`, no `externalUrl`).
   - 22 K20 standard catalogs return HTTP 200.

---

## 3. Caveats

- Live third-party streaming hosts and scrapers rely on remote HTML DOM structures; multi-tier fallbacks (HTML -> REST -> mirror) provide redundancy against upstream HTML layout modifications.
- No other caveats identified.

---

## 4. Conclusion

**Verdict: APPROVE**

The implementation of Engine v1.7.0 Overhaul strictly satisfies all requirements:
1. Multi-level M3U8 URL resolution and full browser header simulation active in `src/routes/hls.js`.
2. HTML Cheerio scrapers and stream deobfuscation active in `src/providers/stp.js`, `src/providers/clbpx.js`, `src/providers/yan.js`.
3. Strict Donghua Guard in `src/providers/yan.js` successfully blocks KDrama and Hollywood false positives.
4. Multi-keyword search fallback and universal episode matching active in `src/lib/utils.js`, `src/providers/kkphim.js`, and `src/providers/nguonc.js`.
5. Version `1.7.0` and brand signature synchronized.
6. 100% test pass rate achieved across all test suites (`verify_v170_playback.js`, `verify_all_providers_playback.js`, `npm test`).

---

## 5. Verification Method

To independently reproduce the verification results:

```bash
# 1. Syntax Check
node --check src/index.js
node --check src/routes/hls.js
node --check src/providers/stp.js
node --check src/providers/clbpx.js
node --check src/providers/yan.js
node --check src/providers/kkphim.js
node --check src/providers/nguonc.js
node --check src/lib/utils.js

# 2. Integration Tests (50/50 PASS expected)
npm test

# 3. E2E v1.7.0 Live Playback Verification Suite (38/38 PASS expected)
node tests/verify_v170_playback.js

# 4. Comprehensive 6-Provider Playback Suite (44/44 PASS expected)
node tests/verify_all_providers_playback.js
```
