# Handoff Report — Milestone 1: KKPhim Provider In-App Stream Format

## 1. Observation
- File under exclusive ownership: `src/providers/kkphim.js` (lines 1–491).
- Requirement: Set `baseRef` to `'https://player.phimapi.com/'`.
- Requirement: Extract `link_m3u8` from `episodes[].server_data[]`.
- Requirement: Accurately resolve episodes: index 0 for movies/single episodes, match `ep.name`, `tap-${episode}`, numeric equivalence, word boundaries, or 1-based index for series.
- Requirement: Format stream objects strictly:
  - `name`: `"VIP Movies 🎬"`
  - `title`: `[VIP • KKPhim] ${server.server_name} [Tập ${ep.name}] Full HD (HLS Proxy)\n⚡ Server VIP • Phát trực tiếp trong App` (handling 'Full' cleanly).
  - `url`: `${proxyBase}/hls/manifest.m3u8?url=${encodeBase64(ep.link_m3u8)}&ref=${encodeBase64('https://player.phimapi.com/')}`
  - Strictly omit `externalUrl` so Stremio plays inside the native player. Remove any embed fallback streams for KKPhim.
- Tool verification commands and verbatim outputs:
  - Command: `node --check src/providers/kkphim.js && node --check src/index.js`
    - Exit code: `0`
    - Stdout/Stderr: Empty (Clean compilation)
  - Command: `node tests/e2e.test.js`
    - Verbatim Output:
      ```
      Total Assertions: 90
      ✅ Passed: 90
      ⚠️ Warnings: 0
      ❌ Failed: 0
      🎉 ALL TEST SUITES PASSED SUCCESSFULLY!
      ```
    - Specific KKPhim Stream verification in Tier 4:
      ```
      Stream #3 (VIP Movies 🎬 - [VIP • KKPhim] Vietsub Full HD (HLS Proxy) ⚡ Server VIP • Phát trực tiếp trong App): Valid In-App HLS Proxy stream (has 'url', no 'externalUrl')
      ```
  - Unit Test Execution on Episode Resolution Matrix:
    - Numeric 1 -> name "1", slug "tap-1": PASS
    - Numeric 1 -> name "01", slug "tap-01": PASS
    - String "1" -> name "Tập 1", slug "tap-1": PASS
    - Numeric 2 -> name "Tập 02", slug "tap-02": PASS
    - Numeric 5 -> exact name "5": PASS
    - String "10" -> slug "tap-10" with name "Tập 10 (End)": PASS
    - Numeric 3 -> name matching word boundary "\b3\b": PASS
    - Non-standard title -> 1-based index fallback (ep 2 -> index 1): PASS
    - Out of bounds (ep 99) -> empty array `[]`: PASS

## 2. Logic Chain
1. **Observation 1 & Requirement**: `src/providers/kkphim.js` must direct all video traffic to the local HLS proxy with the anti-403 referer `https://player.phimapi.com/`.
   - In `src/providers/kkphim.js` (line 364), `baseRef` is defined as `'https://player.phimapi.com/'`.
   - In `getStreams` (lines 405–406), `streamUrl` is constructed as `${proxyBase || ''}/hls/manifest.m3u8?url=${encodeBase64(targetEp.link_m3u8)}&ref=${encodeBase64(baseRef)}`.
   - Base64URL encoding is performed via `Buffer.from(str, 'utf8').toString('base64url')` (lines 46–49), ensuring URL-safe encoding without padding or slash issues.
2. **Observation 2 & Requirement**: Stream title and server name must be clean, branded, and format episode names without duplicate tags or `#` signs.
   - `cleanServerName` cleans `#` and normalizes spaces: `rawServerName.replace(/#/g, '').replace(/\s+/g, ' ').trim() || \`Server \${sIdx + 1}\`` (line 370).
   - `formatEpisodeLabel` (lines 51–59) inspects `targetEp.name`: if empty or `'FULL'`, returns `''`; if already prefixed with `tập`, formats as ` [${trimmed}]`; otherwise returns ` [Tập ${trimmed}]`.
   - Title is assembled as: `\`[VIP • KKPhim] \${cleanServerName}\${epLabel} Full HD (HLS Proxy)\\n⚡ Server VIP • Phát trực tiếp trong App\`` (line 409).
3. **Observation 3 & Requirement**: Stremio Stream Protocol requires native in-app playback with strict exclusivity.
   - Each stream object contains `name: 'VIP Movies 🎬'`, `title`, `url`, `behaviorHints: { notSupported: false, bingeGroup: ... }`.
   - `externalUrl` is strictly omitted from KKPhim stream objects (no embed player fallbacks).
4. **Observation 4 & Requirement**: Episode resolution must handle single movies and multi-episode series accurately.
   - For movies (`isMovie || targetEpStr === null`), index 0 (`serverData[0]`) is selected.
   - For series, multi-stage matching prioritizes: exact string name match -> exact slug match (`tap-X` / `tap-0X`) -> numeric equivalence from extracted digits (`numFromName === epNum`) -> regex word boundary match -> 1-based array index fallback. Out of bounds requests return `[]` without error.

## 3. Caveats
- Upstream network requests to `phimapi.com` in sandbox/offline environments will fail with network lookup errors; all automated test suites and harnesses rely on cached responses, local fixtures, or ephemeral mock servers.
- Other providers (`src/providers/nguonc.js`, `src/providers/vsmov.js`) and routes (`src/routes/hls.js`) are owned by other milestone workers and were not altered.

## 4. Conclusion
- Milestone 1 requirements for `src/providers/kkphim.js` are 100% completed and fully verified.
- All KKPhim streams conform strictly to Stremio In-App HLS Proxy format, encode `baseRef: https://player.phimapi.com/`, extract `link_m3u8`, resolve episode variants seamlessly, and omit `externalUrl`.
- Syntax checks and E2E test suite pass with 0 errors.

## 5. Verification Method
To independently verify Milestone 1:
1. Run syntax check:
   `node --check src/providers/kkphim.js`
2. Run comprehensive E2E test suite (ensure sandbox bypass is enabled for local port listening):
   `node tests/e2e.test.js`
3. Run unit test script to verify movie, series, and episode resolution:
   ```bash
   node -e "
   const assert = require('assert');
   const kkphim = require('./src/providers/kkphim');
   const { FIXTURES } = require('./tests/fixtures');
   const { detailCache } = require('./src/lib/cache');

   (async () => {
     detailCache.set('kkphim:detail:ke-danh-cap-giac-mo', {
       movie: FIXTURES.kkphim.movieDetail.movie,
       episodes: FIXTURES.kkphim.movieDetail.episodes
     });

     const streams = await kkphim.getStreams({
       slug: 'ke-danh-cap-giac-mo',
       type: 'movie',
       proxyBase: 'http://localhost:7000'
     });

     assert.strictEqual(streams.length, 3);
     for (const s of streams) {
       assert.strictEqual(s.name, 'VIP Movies 🎬');
       assert.strictEqual(s.externalUrl, undefined);
       assert(s.url.startsWith('http://localhost:7000/hls/manifest.m3u8?url='));
       assert(s.url.includes('&ref=' + Buffer.from('https://player.phimapi.com/').toString('base64url')));
       assert(!s.title.includes('#'));
     }
     console.log('✅ KKPhim verification successful');
   })();
   "
   ```
