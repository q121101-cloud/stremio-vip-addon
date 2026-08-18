# Independent Review & Adversarial Verification Report — Milestone 1

## 1. Observation
- **Inspected Files**:
  - `src/routes/hls.js`:
    - Subtitle endpoint `router.get(['/sub.vtt', '/sub'], ...)` implemented at line 375.
    - CORS headers (`Access-Control-Allow-Origin: *`, `Access-Control-Allow-Headers: *`, `Access-Control-Allow-Methods: GET, HEAD, OPTIONS`), `Content-Type: text/vtt; charset=utf-8`, and `Cache-Control: public, max-age=86400` are explicitly set.
    - Parameter extraction supports `url`, `b64`, `sub` and `ref`, `referer` via `resolveParamUrl`. Returns HTTP 400 with `'Invalid or missing subtitle url'` if invalid or missing.
    - Anti-403 request headers: `User-Agent: HLS_UA` (Chrome 126 Mac UA), `Referer` (defaults to `https://vsmov.com/`), `Origin` (defaults to `https://vsmov.com`).
    - Strips UTF-8 BOM (`\uFEFF`), normalizes line endings (`\r\n` / `\r` -> `\n`), converts SRT millisecond comma delimiters (`00:00:01,000` -> `00:00:01.000`) and prepends `WEBVTT\n\n` header if not already WebVTT.
    - Upstream errors (HTTP 4xx/5xx) are forwarded with corresponding status codes.
    - Manifest and segment route aliases updated: `router.get(['/manifest.m3u8', '/m3u8', '/m3u8-proxy'], ...)` and `router.get(['/segment.ts', '/ts', '/segment', '/ts-proxy'], ...)`.
  - `src/handlers.js`:
    - In `handleStream` (lines 954-957), `subtitles` array is preserved: `if (Array.isArray(item.subtitles)) { sanitized.subtitles = item.subtitles; }`.
    - Strict In-App protocol compliance enforced: `delete sanitized.externalUrl` and `url: String(item.url).trim()`.
  - `tests/test_m1_subtitle_proxy.js`:
    - 27 distinct assertions covering routes, headers, BOM stripping, SRT-to-VTT conversion, direct VTT passthrough, Base64URL/Base64 parameters, error status codes, and stream object protocol compliance.
- **Verification Commands Executed**:
  - `node --check src/routes/hls.js`: Exit Code 0.
  - `node --check src/handlers.js`: Exit Code 0.
  - `node --check src/index.js`: Exit Code 0.
  - `node tests/test_m1_subtitle_proxy.js`: 27/27 assertions passed (Exit Code 0).
  - `npm test`: 50/50 test cases passed (Exit Code 0).
  - Custom adversarial stress script (BOM, Unicode diacritics, CRLF linebreaks, Base64URL vs Standard Base64 parameters): All assertions passed.
- **Integrity Assessment**:
  - Zero hardcoded responses or bypass facades.
  - Genuine HTTP fetching, stream sanitization, and regex-based SRT parsing.
  - No integrity violations detected.

## 2. Logic Chain
1. **Interface Contract Verification**:
   - `GET /hls/sub.vtt` meets all requirements outlined in `PROJECT.md § Interface Contracts`:
     - Query parameters `url`, `b64`, `sub`, `ref`, `referer` are parsed correctly via `resolveParamUrl`.
     - Response headers `Content-Type: text/vtt; charset=utf-8`, `Access-Control-Allow-Origin: *`, `Cache-Control: public, max-age=86400` are guaranteed.
     - Body is guaranteed valid WebVTT starting with `WEBVTT`.
2. **SRT-to-WebVTT Conversion Logic**:
   - Stripping UTF-8 BOM (`\uFEFF`) before checking `content.startsWith('WEBVTT')` prevents false positives when converting BOM-prefixed SRT or passing through BOM-prefixed WebVTT.
   - Normalizing linebreaks ensures consistent timestamp replacement across UNIX, Windows, and legacy Mac line endings.
   - Comma-to-dot timestamp conversion properly converts SRT cues into valid WebVTT cues.
3. **Aggregator Pass-Through Protocol**:
   - `handleStream` in `src/handlers.js` sanitizes stream objects from providers. Preserving `subtitles` array allows M2 VSMOV provider to attach subtitle tracks that flow seamlessly to Stremio clients.
   - Deleting `externalUrl` and ensuring `url` is always trimmed strings prevents Stremio from falling back to external browser opening.

## 3. Caveats
- No caveats. Milestone 1 implementation is completely self-contained, adheres strictly to project conventions, and introduces zero regressions to existing providers (NguonC, KKPhim, etc.).

## 4. Conclusion
**Verdict**: `APPROVE`

Milestone 1 satisfies 100% of the functional, interface, and quality criteria specified in `PROJECT.md` and `ORIGINAL_REQUEST.md`. The implementation is robust, well-tested, and ready for Milestone 2 provider integration.

## 5. Verification Method
To independently reproduce and verify this review:
```bash
node --check src/routes/hls.js
node --check src/handlers.js
node --check src/index.js
node tests/test_m1_subtitle_proxy.js
npm test
```
All commands must exit with code 0.
