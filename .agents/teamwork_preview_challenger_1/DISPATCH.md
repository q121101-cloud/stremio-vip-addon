## 2026-08-18T17:31:32Z
Adversarially challenge and stress-test the HLS proxy route (`src/routes/hls.js`) and provider stream resolution across all 8 providers:
1. Write and execute stress/adversarial test scripts:
   - Test invalid/broken upstream CDN URLs -> verify response is 302 redirect fallback or graceful non-502 error, and cache is purged (`m3u8Cache.get(...) === undefined`).
   - Test upstream returning HTTP 200 with HTML error/block page -> verify it is NEVER cached as a valid m3u8 playlist and cache is purged.
   - Test malformed base64 params, missing parameters, and unsupported paths.
   - Test concurrent requests and Range header seeking on `.ts` segments.
2. Verify all streams returned by all 8 providers use `url` and NEVER `externalUrl`.
3. Report your findings and verdict (`APPROVE` or `REQUEST_CHANGES`).
