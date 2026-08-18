## 2026-08-18T17:19:16Z
Worker M2 assigned tasks:
1. Fixes in src/:
   - src/providers/film4k.js: fix generateSearchKeywords call and IMDb ID extraction in getStreams.
   - src/routes/manifest.js: add film4k: 'FILM4K' to providerLabels in buildDescription().
   - src/handlers.js: add explicit else if for film4k in handleMeta; add /api/nguonc-proxy route support in src/handlers.js / src/index.js if needed.
   - src/routes/hls.js: purge cache if rawManifestData does not contain #EXTM3U (return 302 redirect fallback to targetUrl or non-crash error); add self-healing 302 fallback in /hls/segment.ts, /hls/key, /hls/extract.
   - src/mapper.js: extractM3u8FromEmbed(embedUrl, customReferer) accepts customReferer.
   - tests/verify_all_providers_playback.js: update catalog count assertion from 22 to 25.
2. Create and execute tests/live_backtest_all_providers.js with real HTTP calls via local test server (app.listen(0)):
   - 8 providers: film4k, vsmov, kkphim, nguonc, stp, hh3d, yan, clbpx.
   - Catalog >= 1, getStreams proxy URLs, .m3u8 check (#EXTM3U), .ts chunk download (>50KB, 0x47 or 0x89), at least 5/8 chunk pass.
   - Markdown status matrix output.
3. Fallback verification (R3): test expired/broken upstream CDN URL through HLS proxy -> response NOT 502 (302 or non-crash error), cache purged.
4. Full test suite (npm test) 0 failures.
5. Write handoff.md and send_message to parent.
