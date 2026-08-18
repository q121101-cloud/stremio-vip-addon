# Empirical Adversarial Challenge Report: Milestone 1

**Reviewer**: `teamwork_preview_challenger_m1_1` (EMPIRICAL CHALLENGER)  
**Target Files**: `src/routes/hls.js`, `src/handlers.js`  
**Verdict**: `APPROVE`

---

## 1. Observation

1. **Subtitle Proxy Implementation (`src/routes/hls.js:374-432`)**:
   - Routes `/sub.vtt` and `/sub` are mounted with CORS headers (`Access-Control-Allow-Origin: *`) and caching (`Cache-Control: public, max-age=86400`).
   - Resolves target URL from `req.query.url`, `req.query.b64`, or `req.query.sub` via `resolveParamUrl`.
   - Strips UTF-8 BOM (`\uFEFF` / `0xFEFF`) at lines 412-414:
     ```javascript
     if (content.charCodeAt(0) === 0xFEFF || content.startsWith('\uFEFF')) {
       content = content.slice(1);
     }
     ```
   - Normalizes CRLF / CR linebreaks to LF at line 416 (`content.replace(/\r\n/g, '\n').replace(/\r/g, '\n').trim()`).
   - Detects SRT subtitles (`!content.startsWith('WEBVTT')`), converts comma decimal timestamps to dot decimals (`content.replace(/(\d{2}:\d{2}:\d{2}),(\d{3})/g, '$1.$2')`), and prepends `WEBVTT\n\n` header (lines 418-422).
   - Preserves upstream WebVTT styling, `STYLE` blocks, `REGION`, `NOTE`, and cue positioning when `WEBVTT` header is already present without injecting duplicate headers.
   - Forwards upstream error status codes (e.g. 403, 404, 500) and returns 502 Bad Gateway for network/unreachable errors with full CORS headers.

2. **Aggregator Subtitle Pass-Through (`src/handlers.js:954-956`)**:
   - In `handleStream`, stream objects are sanitized while explicitly preserving `subtitles`:
     ```javascript
     if (Array.isArray(item.subtitles)) {
       sanitized.subtitles = item.subtitles;
     }
     delete sanitized.externalUrl;
     ```
   - Stream protocol invariants are maintained (`url` present, `externalUrl` omitted).

3. **Empirical Test Suite Execution (`node .agents/teamwork_preview_challenger_m1_1/stress_test.js`)**:
   - Executed **78 empirical assertions** across 7 test sections:
     - Section 1: URL & Base64 Adversarial Input Handling (16/16 passed)
     - Section 2: Large Subtitle Payloads (>1MB - 4.3MB) & Memory Safety (8/8 passed, heap delta +1.7MB)
     - Section 3: Malformed SRTs, BOM variations, and Formatting (16/16 passed)
     - Section 4: WebVTT Headers with Styling Cues vs Plain SRT (7/7 passed)
     - Section 5: Fast Burst Concurrency & Stress Testing (100 parallel requests in 71ms, 3/3 passed)
     - Section 6: Upstream Error Resilience & HTTP Status Codes (8/8 passed)
     - Section 7: Aggregator Subtitle Pass-Through & Invariants (20/20 passed)
   - Results: **78 Passed, 0 Failed, 0 Warnings (100% Pass)**.

4. **Syntax & Node Validation**:
   - `node --check src/index.js && node --check src/handlers.js && node --check src/routes/hls.js` exited with code 0 (no syntax errors).

---

## 2. Logic Chain

1. **URL Resolution & Parameter Sanitization**:
   - From Observation 1 & 3: `resolveParamUrl` correctly decodes both Base64URL (unpadded) and Standard Base64 (padded), trims leading/trailing whitespace, and handles nested query strings without throwing unhandled exceptions. Empty or missing parameters consistently return HTTP 400 Bad Request.

2. **Conversion Correctness & WebVTT Integrity**:
   - From Observation 1 & 3: Plain SRT subtitles have timestamps converted from `00:00:01,234` to `00:00:01.234` and receive `WEBVTT\n\n`. Subtitles already starting with `WEBVTT` (including those with `STYLE`, `REGION`, and `NOTE` blocks) are left intact without duplicate headers or corrupted styling cues.

3. **BOM & Linebreak Normalization**:
   - From Observation 1 & 3: UTF-8 BOM characters (`\uFEFF`) and Windows CRLF (`\r\n`) are stripped and normalized across both SRT and WebVTT formats.

4. **Memory Safety & High Load Stability**:
   - From Observation 3: Processing a 4.3MB synthetic subtitle payload resulted in a nominal heap increase of only 1.7MB. Under a 100-request concurrent burst, all requests completed in 71ms with 0 dropped sockets or unhandled promise rejections.

5. **Error & Status Code Handling**:
   - From Observation 1 & 3: Upstream 403, 404, and 500 errors are returned cleanly to the client with CORS `*` headers. Network connection failures (such as connection refused) return 502 Bad Gateway gracefully.

6. **Aggregator Integration**:
   - From Observation 2 & 3: `handleStream` in `src/handlers.js` passes through `subtitles` arrays when present on provider streams, preserves `url`, and deletes `externalUrl`.

---

## 3. Caveats

- Milestone 1 tests the subtitle proxy infrastructure (`/hls/sub.vtt`) and aggregator pass-through (`handleStream`). End-to-end extraction of multiple audio tracks and subtitles from VSMOV live streams is scoped for Milestone 2 (`src/providers/vsmov.js`).

---

## 4. Conclusion

**Verdict**: `APPROVE`

The Milestone 1 implementation in `src/routes/hls.js` and `src/handlers.js` meets all architectural, functional, and adversarial requirements. The subtitle proxy is resilient to malformed inputs, handles large payloads safely, executes rapid concurrent bursts reliably, and preserves In-App stream protocol invariants.

---

## 5. Verification Method

To independently execute and verify the empirical adversarial stress test suite:

```bash
# Run the adversarial stress test harness (78 assertions)
node .agents/teamwork_preview_challenger_m1_1/stress_test.js

# Verify JS syntax across modified modules
node --check src/index.js && node --check src/handlers.js && node --check src/routes/hls.js
```

Invalidation conditions: Any failed assertion in `stress_test.js`, memory leak >100MB on large payloads, or unhandled exceptions under concurrency.
