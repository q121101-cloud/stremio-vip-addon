# Handoff Report — Milestone 1 (teamwork_preview_worker_m1_1)

## 1. Observation
- **Scope Assigned**: Implement subtitle proxy endpoint `/sub.vtt` in `src/routes/hls.js`, route aliases `['/manifest.m3u8', '/m3u8', '/m3u8-proxy']` and `['/segment.ts', '/ts', '/segment', '/ts-proxy']`, and aggregator subtitle pass-through in `src/handlers.js`.
- **Files Modified**:
  - `src/routes/hls.js`:
    - Updated manifest router: `router.get(['/manifest.m3u8', '/m3u8', '/m3u8-proxy'], ...)` (line 145).
    - Updated segment router: `router.get(['/segment.ts', '/ts', '/segment', '/ts-proxy'], ...)` (line 277).
    - Added subtitle router: `router.get(['/sub.vtt', '/sub'], ...)` (line 372).
  - `src/handlers.js`:
    - In `handleStream`, added preservation check:
      ```javascript
      if (Array.isArray(item.subtitles)) {
        sanitized.subtitles = item.subtitles;
      }
      delete sanitized.externalUrl;
      ```
  - `tests/test_m1_subtitle_proxy.js`:
    - Added dedicated test suite verifying 27 assertions for subtitle proxying, SRT-to-WebVTT conversion, UTF-8 BOM stripping, Base64/plain parameter decoding, error forwarding, route aliases, and stream protocol compliance.
- **Verification Outputs**:
  - `node --check src/routes/hls.js`: Exit Code 0 (0 errors).
  - `node --check src/handlers.js`: Exit Code 0 (0 errors).
  - `node --check src/index.js`: Exit Code 0 (0 errors).
  - `npm test`: 50/50 test cases passed (Exit code 0).
  - `node tests/test_m1_subtitle_proxy.js`: 27/27 assertions passed (Exit code 0).

## 2. Logic Chain
1. **Subtitle Endpoint Requirements**:
   - The subtitle route `/sub.vtt` (and alias `/sub`) extracts `url` / `b64` / `sub` and `ref` / `referer` using `resolveParamUrl`.
   - Missing or empty target URL immediately yields HTTP 400 Bad Request with `'Invalid or missing subtitle url'`.
   - Upstream fetch uses standard anti-403 browser headers: `User-Agent: HLS_UA`, `Referer: referer` (defaults to `https://vsmov.com/`), and `Origin: origin` (defaults to `https://vsmov.com`).
   - Content processing strips UTF-8 BOM (`\uFEFF`), normalizes line endings (`\r\n` -> `\n`), and checks if the body starts with `WEBVTT`.
   - If upstream serves SubRip (SRT) format, regex `replace(/(\d{2}:\d{2}:\d{2}),(\d{3})/g, '$1.$2')` converts millisecond delimiters from comma to period, and prepends `WEBVTT\n\n`.
   - Required response headers (`Content-Type: text/vtt; charset=utf-8`, `Access-Control-Allow-Origin: *`, `Cache-Control: public, max-age=86400`) are attached and the WebVTT body is sent.
2. **Aggregator Pass-Through Requirements**:
   - In `src/handlers.js`, stream sanitization in `handleStream` previously dropped `item.subtitles`.
   - Adding `if (Array.isArray(item.subtitles)) { sanitized.subtitles = item.subtitles; }` ensures any subtitle tracks extracted by upstream providers (such as VSMOV in M2) are retained in the response payload.
   - Strict In-App direct play protocol is maintained by enforcing `sanitized.url = String(item.url).trim()` and `delete sanitized.externalUrl`.

## 3. Caveats
- `src/providers/vsmov.js` subtitle extraction and multi-server audio separation are scheduled under Milestone 2 (M2) file ownership. Milestone 1 lays the complete foundational HTTP proxy, converter, and aggregator pass-through pipeline ready for M2 provider integration.

## 4. Conclusion
Milestone 1 is complete and fully verified. The subtitle proxy endpoint `/hls/sub.vtt` with automatic SRT-to-WebVTT conversion, CORS headers, route aliases, and the aggregator subtitle pass-through in `handleStream` are fully operational and passing 100% of integration checks without any regressions.

## 5. Verification Method
Run the following commands to independently verify all changes:
```bash
node --check src/routes/hls.js
node --check src/handlers.js
node --check src/index.js
node tests/test_m1_subtitle_proxy.js
npm test
```
All commands should exit with code 0.
