## 2026-08-17T10:37:16Z
Milestone 3 (Stream Protocol Standardization & Aggregation) of stremio-nguonc-addon.
Tasks:
1. `src/mapper.js`: Export all helper functions (extractYear, unpackDeanEdwards, cleanTitle, toSlug, extractSeasonEpisode, isM3u8Url, normalizeServerName, encodeBase64, decodeBase64). Ensure extractYear and unpackDeanEdwards logic.
2. `src/config.js`: Ensure DEFAULT_CONFIG.providers = ['nguonc', 'kkphim', 'vsmov'].
3. `src/lib/cinemeta.js`: Ensure rawId.toLowerCase(), regex /^tt\d+$/i, 5000ms timeout, 24h LRUCache.
4. `src/handlers.js`: Enforce stream aggregation via cinemeta.resolveCinemeta, Promise.allSettled with isolated 5s timeouts for all active providers, standardize stream items per R3 (in-app url vs externalUrl, behaviorHints, isolated error handling), retain Cyber-Glassmorphism UI.
5. `package.json` & `src/manifest.js`: Version 1.4.0.
6. Verification: node --check src/index.js, node tests/e2e.test.js.
