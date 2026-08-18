# Forensic Integrity Audit Report — Milestone 1

**Work Product**: `src/routes/hls.js` and `src/handlers.js` (Milestone 1 Implementation)  
**Integrity Mode**: Development (per `ORIGINAL_REQUEST.md`)  
**Verdict**: **`CLEAN`**

---

## 1. Observation

### Source Code Analysis
- **`src/routes/hls.js`** (lines 375–432):
  - Route registration: `router.get(['/sub.vtt', '/sub'], async (req, res) => { ... })`.
  - Header setup: `setCorsHeaders(res)` (`Access-Control-Allow-Origin: *`, `Access-Control-Allow-Headers: *`, `Access-Control-Allow-Methods: GET, HEAD, OPTIONS`), `Content-Type: text/vtt; charset=utf-8`, and `Cache-Control: public, max-age=86400`.
  - Parameter decoding: resolves URL via `resolveParamUrl(req.query.url || req.query.b64 || req.query.sub)` supporting plain HTTP URLs and Base64/Base64URL encodings.
  - Anti-403 HTTP fetch: uses `axios` with `User-Agent: HLS_UA` (Chrome 126), dynamic `Referer` (`req.query.ref` or fallback `https://vsmov.com/`), and dynamically calculated `Origin` header.
  - SRT to WebVTT transformation:
    - Strips UTF-8 BOM (`0xFEFF` / `\uFEFF`).
    - Normalizes CRLF and CR linebreaks (`content.replace(/\r\n/g, '\n').replace(/\r/g, '\n').trim()`).
    - Converts SRT millisecond comma delimiters to dot format: `content.replace(/(\d{2}:\d{2}:\d{2}),(\d{3})/g, '$1.$2')`.
    - Prepends `WEBVTT\n\n` header if not already native WebVTT.
    - Preserves native WebVTT intact without double-prefixing.
    - Error handling: catches upstream errors and returns appropriate HTTP status codes (e.g. 403, 404, 500, 502) without uncaught exceptions or server crashes.
  - Route aliases: `/manifest.m3u8`, `/m3u8`, `/m3u8-proxy` (line 146) and `/segment.ts`, `/ts`, `/segment`, `/ts-proxy` (line 278) registered.

- **`src/handlers.js`** (lines 944–959):
  - Subtitle pass-through:
    ```javascript
    if (Array.isArray(item.subtitles)) {
      sanitized.subtitles = item.subtitles;
    }
    delete sanitized.externalUrl;
    ```
  - In-App protocol compliance: deletes `externalUrl` property from all stream objects, enforces valid non-empty `url`, and preserves `subtitles` array when present while filtering invalid non-array formats.

### Forensic Checks & Empirical Executions

1. **Hardcoded Test String & Facade Detection**:
   - Grep search for test strings (e.g. `mockSrtContent`, `Xin chào thế giới`, `57123`, `test.srt`) in `src/` yielded 0 matches.
   - Code inspection confirmed all proxy logic performs dynamic HTTP calls, dynamic regex conversions, and dynamic parameter resolution.

2. **Pre-populated Artifact Detection**:
   - `find . -name '*.log' -o -name '*result*' -o -name '*output*'` returned 0 pre-populated result files.

3. **Syntax & Independent Behavioral Execution**:
   - `node --check src/routes/hls.js && node --check src/handlers.js && node --check src/index.js` passed with 0 errors.
   - `node tests/test_m1_subtitle_proxy.js`: 27/27 assertions PASSED (100%).
   - `node tests/test_m1_preview_challenger2.js`: 103/103 assertions PASSED (100%), including 50 parallel concurrent requests and adversarial edge cases.

---

## 2. Logic Chain

1. **Observation 1**: `src/routes/hls.js` implements `/hls/sub.vtt` and `/hls/sub` with dynamic `axios` HTTP fetching, dynamic Referer/Origin calculation, UTF-8 BOM stripping, CRLF normalization, and regex timestamp conversion `(\d{2}:\d{2}:\d{2}),(\d{3}) -> $1.$2`.
2. **Observation 2**: `src/handlers.js` explicitly preserves `item.subtitles` on stream objects when it is an array and strictly deletes `externalUrl`, guaranteeing In-App direct play protocol integrity.
3. **Observation 3**: Empirical execution across 130+ assertions (covering route aliases, SRT conversion, BOM stripping, native WebVTT passthrough, upstream error propagation, concurrency, and In-App protocol checks) passed with 100% success.
4. **Observation 4**: Forensic checks for hardcoding, facades, pre-populated logs, and mock evasions showed zero integrity violations.
5. **Inference**: Milestone 1 implementation is genuine, complete, robust, and free of shortcuts or integrity violations under Development mode constraints.

---

## 3. Caveats

- **Upstream VSMOV Provider Scraping (Milestone 2 Scope)**: Milestone 1 implements the Subtitle Proxy endpoint (`/hls/sub.vtt`) and Aggregator pass-through in `src/handlers.js`. The scraping and attachment of subtitles from live VSMOV embed players (`src/providers/vsmov.js`) is designated for Milestone 2.

---

## 4. Conclusion

**Verdict: `CLEAN`**

The Milestone 1 work product satisfies all forensic integrity checks:
- No hardcoded test responses or strings.
- No facade or stubbed proxy logic.
- Genuine HTTP fetching with anti-403 headers and timeout safety.
- Authentic SRT to WebVTT conversion with BOM handling and timestamp normalization.
- Strict compliance with Stremio In-App streaming protocol (`url` present, `externalUrl` deleted, `subtitles` preserved).

---

## 5. Verification Method

Run the following commands to independently verify the audit findings:

```bash
# 1. Syntax check
node --check src/routes/hls.js
node --check src/handlers.js
node --check src/index.js

# 2. Run M1 Subtitle Proxy verification suite
node tests/test_m1_subtitle_proxy.js

# 3. Run Adversarial M1 Challenger verification suite
node tests/test_m1_preview_challenger2.js
```
