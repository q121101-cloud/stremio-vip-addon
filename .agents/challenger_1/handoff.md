# Challenger 1 Empirical Challenge & Adversarial Verification Report (Engine v1.6.2)

**Target**: VIP Movies Stremio Addon Engine v1.6.2  
**Date**: 2026-08-18T09:28:43Z  
**Verdict**: **`APPROVE`**

---

## 1. Observation

Empirical testing was executed across four primary adversarial challenge dimensions targeting the Engine v1.6.2 implementation:

### 1.1 Test Execution Commands & Outputs

#### A. Comprehensive Regression Suite Execution
1. `node tests/verify_all_providers_playback.js`:
   - **Result**: `44/44 (100%)` assertions passed in `16.89s`.
   - Verified 22 manifest catalogs across 6 provider clusters (VSMOV 4K, KKPhim, NguonC, STP, CLBPX, YAN).
   - Real video segments downloaded for all 6 providers (>100KB, MPEG-TS sync byte `0x47` confirmed).
   - HTTP Range 206 partial content verified (`Content-Range: bytes 0-1023/716844`).

2. `node tests/verify_playback.js`:
   - **Result**: `7/7 Phases PASSED (100%)` in `5.69s`.
   - VSMOV Harry Potter `tt0373889` audio separation (Vietsub + Multi-Audio) verified.
   - KKPhim Breaking Bad `tt0903747:1:1` anti-404 playback verified.
   - Real video chunk downloaded: `7,447,877 bytes` (7.27 MB), sync byte `0x47` verified.

3. `node tests/verify_hotfix_vsmov_kkphim.js`:
   - **Result**: `24/24 assertions PASSED (100%)`.

4. `node tests/verify_new_providers.js`:
   - **Result**: `26/26 checks PASSED (100%)` in `7.66s`.
   - STP (`sieutamphim.pro`), CLBPX (`clbphimxua.info`), YAN (`yanhh3d.pw`) providers verified.

#### B. Dedicated Empirical Adversarial Challenge Suite (`tests/challenger1_v162_adversarial_empirical.test.js`)
- **Result**: `127/127 (100%)` assertions passed in `37.53s`.
- Specific targets tested:

1. **Target 1: Catalog Edge Cases & 22 Catalog Stress Tests (64 Assertions)**:
   - *22 Manifest Catalogs*: All 22 catalogs in `ALL_CATALOGS` (`src/manifest.js:63-363`) responded with HTTP 200 and non-empty `metas` arrays conforming to Stremio meta schema (`id`, `name`, `type`, `poster`).
   - *Unknown & Non-Existent Catalog IDs (13 tests)*: IDs such as `unknown-catalog-12345`, `invalid_cluster_foo`, `kkphim-nonexistent-cat`, `nguonc-invalid-id`, `stp-fake-single`, `yan-unknown-donghua`, `clbpx-nonexistent-sub`, `---`, `___`, `null`, `undefined`, `!@#$%^&*()`, `select*from*movies` returned HTTP 200 with `{ metas: [] }` without server exceptions (`src/handlers.js:1294-1296`).
   - *Empty & Malformed Query Parameters (9 tests)*: `search=`, `genre=`, `skip=`, `search=&genre=&skip=`, `%20&%20`, `&&&&`, `invalid_no_equal_sign`, `=value_without_key`, Thai Unicode queries returned HTTP 200.
   - *Boundary Skip Values (9 tests)*: Negative skips (`skip=-1`, `skip=-999999`) normalized to page 1 (`src/handlers.js:91-94`), large skips (`skip=99999999`) converted to page 10000000 cleanly, non-numeric (`skip=abc`, `skip=NaN`, `skip=15.5`, `skip=1e5`) handled safely.
   - *Hostile Genre Names Across Catalogs (10 tests)*: `Phim 18+`, `Hành Động`, `Kinh Dị`, Vietnamese Unicode with diacritics, SQL injection payload `'; DROP TABLE movies; --`, XSS payload `<script>alert("xss")</script>`, and 500-char string returned HTTP 200 without SQL or injection errors.

2. **Target 2: Stream Edge Cases & Adversarial Invariants (37 Assertions)**:
   - *Malformed & Hostile Stream IDs (19 tests)*: `tt`, `tt_invalid`, `tt9999999999999`, `tt0000000`, `::::`, `vsmov:`, `kkphim:`, `nguonc:`, `stp:`, `yan:`, `clbpx:`, `hh3d:`, `undefined`, `null`, `tt01234<script>`, `tt01234' OR 1=1--`, 500-char IDs returned HTTP 200 with safe `{ streams: [] }` arrays (`src/handlers.js:1527-1678`).
   - *Missing & Irregular Episode Numbers (11 tests)*: `tt0903747:1`, `tt0903747::`, `tt0903747:0:0`, `tt0903747:-1:-1`, `tt0903747:9999:9999`, `kkphim:breaking-bad:`, `vsmov:harry-potter:1`, `clbpx:thien-long-bat-bo:1`, `yan:dau-la-dai-luc:1` resolved gracefully with HTTP 200.
   - *Unsupported Media Types (6 tests)*: `/stream/other/`, `/stream/audio/`, `/stream/tv/`, `/stream/channel/`, `/stream/radio/`, `/stream/custom_xyz/` returned HTTP 200 `{ streams: [] }`.
   - *Concurrency Burst (50 Parallel Requests)*: 50 concurrent requests simultaneously dispatched against mixed valid and hostile endpoints; all 50 completed with HTTP 200, zero socket dropouts, zero uncaught rejections. Upstream 429 and timeouts were caught within the per-provider 4500ms limit (`src/handlers.js:169-180`).
   - *Strict In-App Stream Protocol*: All emitted stream objects contain a valid proxied `url` and strictly omit `externalUrl` (`src/handlers.js:1652`).

3. **Target 3: HLS Proxy Resilience & Subtitle Parsing (23 Assertions)**:
   - *Base64URL Resilience (9 tests)*: Empty URL returned HTTP 400 (`src/routes/hls.js:152`). Malformed characters (`???!!!`, `!@#$%^&*()`, plain numbers `12345`, `javascript:`, HTML data URIs) returned HTTP 502 without crashing the Express process. Base64URL, standard Base64, and raw unencoded URLs returned HTTP 200.
   - *Relative Path Resolution in M3U8 Rewriting (7 tests)*:
     - Parent directory traversal (`../segments/segment_parent_01.ts` -> `http://127.0.0.1:port/video/segments/segment_parent_01.ts`) resolved correctly via `new URL(t, baseUrl.href)`.
     - Current directory (`./current_segment_02.ts`), root-relative (`/root/relative/segment_03.ts`), and query strings (`?token=secure123&sign=abc`) preserved and encoded into base64url.
     - `#EXT-X-KEY` rewritten to `/hls/key?url=...`.
     - `#EXT-X-MAP` init segment rewritten to `/hls/segment.ts?url=...`.
     - `#EXT-X-MEDIA` subtitles rewritten to `/hls/sub.vtt?url=...`.
   - *HTTP Range Header Boundaries (4 tests)*:
     - `bytes=0-0`: HTTP 206, Content-Range `bytes 0-0/1915156`, exactly 1 byte returned.
     - `bytes=100-200`: HTTP 206, Content-Range `bytes 100-200/1915156`, exactly 101 bytes returned.
     - `bytes=0-1023`: HTTP 206, Content-Range `bytes 0-1023/1915156`, exactly 1024 bytes returned.
     - `bytes=invalid-range`: Handled safely without server error.
   - *Subtitle VTT Parsing (/hls/sub.vtt) (3 tests)*:
     - Raw SRT converted to WebVTT format, comma timestamps `00:00:01,000` converted to dot format `00:00:01.000` (`src/routes/hls.js:489`).
     - UTF-8 BOM (`\uFEFF`) stripped cleanly (`src/routes/hls.js:482-484`).
     - Vietnamese Unicode diacritics (`Ă, Â, Đ, Ê, Ô, Ơ, Ư, ắ, ằ, ẳ, ẵ, ặ, ấ, ầ, ổ, ỡ, ự, ỹ`) preserved intact.
     - Headers `Content-Type: text/vtt; charset=utf-8` and `Access-Control-Allow-Origin: *` verified.

4. **Target 4: MPEG-TS Chunk Download & Binary Verification (3 Assertions)**:
   - Full TS chunk downloaded via `/hls/segment.ts`: `1,915,156 bytes` (1.87 MB > 100 KB threshold).
   - Sync byte `0x47` verified at packet boundaries: offset 0 (`0x47`), 188 (`0x47`), 376 (`0x47`), 564 (`0x47`), 752 (`0x47`).
   - 50 consecutive 188-byte packet periodicity checked and confirmed 50/50.

---

## 2. Logic Chain

1. **Catalog Integrity & Resilience**:
   - `src/manifest.js` defines 22 catalogs across 6 clusters with extra parameters `['search', 'genre', 'skip']`.
   - `src/handlers.js:handleCatalog` resolves providers via `getProviderFromCatalogId` and routes type via `getCatTypeFromCatalogId`.
   - When an unrecognized catalog ID, hostile query, or out-of-bounds skip is passed, the handler safely falls back to `{ metas: [] }` without unhandled exceptions or 500 status codes.
   - All 22 active catalogs returned valid non-empty arrays with correct Stremio metadata.

2. **Stream Aggregator Isolation & Safety**:
   - `src/handlers.js:handleStream` parses IDs, fetches Cinemeta metadata, and wraps all 6 provider promises in `withTimeout(p.getStreams(), 4500)`.
   - Handled via `Promise.allSettled()`, ensuring any individual provider network error, rate limit (HTTP 429), or timeout does not block or fail the aggregate response.
   - All stream objects are sanitized: `url` points to `/hls/manifest.m3u8`, `behaviorHints` populated, and `externalUrl` explicitly deleted.

3. **HLS Proxy Correctness & RFC 3986 Compliance**:
   - `src/routes/hls.js` uses `new URL(t, baseUrl.href).href` to resolve all relative paths (`../`, `./`, `/`, subdirectories) to absolute URLs before base64url encoding.
   - Decryption keys (`#EXT-X-KEY`), init maps (`#EXT-X-MAP`), audio/subtitles (`#EXT-X-MEDIA`), and video chunks (`#EXTINF`) are rewritten to their dedicated endpoints (`/hls/key`, `/hls/segment.ts`, `/hls/sub.vtt`, `/hls/manifest.m3u8`).
   - Partial content requests correctly forward upstream `Range` headers and stream responses with `status: 206` and `Content-Range`.

4. **MPEG-TS Binary Compliance**:
   - Live chunk downloads verified payload size > 100KB and confirmed MPEG-TS transport stream framing with synchronization byte `0x47` aligned at 188-byte intervals.

---

## 3. Caveats

- Upstream CDN latency or third-party rate limits (HTTP 429) can occasionally occur when firing high-frequency burst requests (e.g. 50 parallel requests). The addon handles this gracefully via provider isolation (`Promise.allSettled`) and fallback `[]`.
- External live streams require active internet connectivity. All tests were executed and verified against live upstream servers and mock servers on ephemeral ports.

---

## 4. Conclusion

The Engine v1.6.2 implementation is **fully verified, resilient, and robust** across all catalog edge cases, stream aggregation invariants, HLS proxy relative URL rewrites, Range 206 seeking, WebVTT subtitle conversions, and MPEG-TS binary segment downloads.

Definitive Verdict: **`APPROVE`**

---

## 5. Verification Method

To independently verify the empirical results:

```bash
# 1. Run the Engine v1.6.2 Adversarial Challenge Suite (127 Assertions)
node tests/challenger1_v162_adversarial_empirical.test.js

# 2. Run the Comprehensive Provider Playback Suite (44 Assertions)
node tests/verify_all_providers_playback.js

# 3. Run Hotfix & Regression Suites
node tests/verify_playback.js
node tests/verify_hotfix_vsmov_kkphim.js
node tests/verify_new_providers.js
```
