# Quality Review & Adversarial Challenge Report — Milestone 1: KKPhim Provider In-App Stream Format

## Review Summary

**Verdict**: `APPROVE`

The implementation of `src/providers/kkphim.js` adheres strictly to Requirement R1, the Project Specification (`PROJECT.md`), and the Stremio Addon Protocol. No integrity violations, shortcuts, facade implementations, or hardcoded bypasses were found.

---

## 1. Observation
- Target File Reviewed: `src/providers/kkphim.js` (491 lines total).
- Extraction & Encoding:
  - `encodeBase64`: Defined on lines 46–49 using `Buffer.from(str, 'utf8').toString('base64url')`, generating standard URL-safe Base64 without query-breaking characters.
  - `baseRef`: Hardcoded to `'https://player.phimapi.com/'` on line 364 for anti-403 CDN upstream authorization.
  - Stream URL construction: Line 406 builds `${proxyBase || ''}/hls/manifest.m3u8?url=${encodeBase64(targetEp.link_m3u8)}&ref=${encodeBase64(baseRef)}`.
- Episode Resolution Logic:
  - Lines 360–401: For movies (`isMovie || targetEpStr === null`), selects `serverData[0]`.
  - For series, applies multi-stage resolution matching `nameStr === targetEpStr`, `nameStr === 'Tập ' + targetEpStr`, `nameStr === 'Tập 0' + targetEpStr`, `slugStr === 'tap-' + targetEpStr`, `slugStr === 'tap-0' + targetEpStr`, numeric digit extraction (`replace(/\D+/g, '')`), word boundary regex (`\b${targetEpStr}\b`), and 1-based index fallback (`serverData[epNum - 1]`). Out-of-bounds requests safely return `[]`.
- Stream Formatting:
  - Stream name: Exactly `'VIP Movies 🎬'` (line 409).
  - Stream title: Formatted as `[VIP • KKPhim] ${cleanServerName}${epLabel} Full HD (HLS Proxy)\n⚡ Server VIP • Phát trực tiếp trong App` (line 410).
  - Server label normalization: Strips `#` symbols and excess whitespace (`rawServerName.replace(/#/g, '').replace(/\s+/g, ' ').trim()`, line 370).
  - Episode label normalization: `formatEpisodeLabel` (lines 51–59) safely omits `[Tập ...]` if episode name is `'FULL'`, empty, or null, and prevents duplicate `Tập` prefixes.
  - Protocol exclusivity: `externalUrl` is strictly undefined and omitted from all KKPhim stream objects.
- Tool & Test Verifications:
  - Syntax check: `node --check src/providers/kkphim.js && node --check src/index.js` exited 0 with 0 errors.
  - Full E2E suite: `node tests/e2e.test.js` passed 90/90 assertions with 0 failures and 0 warnings.
  - Adversarial stress tests: 5/5 custom test suites passed including URL-safe base64 encoding, movie stream format, series episode resolution matrix, corrupt/malformed payload resilience, and legacy parameter compatibility.

---

## 2. Logic Chain
1. **Observation**: R1 mandates extracting `link_m3u8` from `episodes[].server_data[]` and formatting for the internal HLS proxy with base referer `https://player.phimapi.com/`.
   - **Inference**: In `src/providers/kkphim.js`, `getStreams` iterates through each `episodes` server entry, validates `targetEp.link_m3u8`, encodes both the stream URL and `https://player.phimapi.com/` into Base64URL, and generates the URL `/hls/manifest.m3u8?url=...&ref=...`.
2. **Observation**: R1 mandates accurate episode resolution for both single movies and multi-episode series.
   - **Inference**: Single movies detect `type === 'movie'`, `movie.type === 'single'`, or single-server/single-ep structure, reliably retrieving `serverData[0]`. Series episode lookup handles numeric inputs, string inputs, zero-padded strings, slugs, and falls back to index within array bounds, returning empty arrays for out-of-bounds queries without throwing.
3. **Observation**: R1 requires branding as `"VIP Movies 🎬"`, clean titles without `#` symbols, clean handling of "Full", and strict omission of `externalUrl`.
   - **Inference**: `cleanServerName` normalizes server tags (e.g., `Vietsub #1` -> `Vietsub 1`), `formatEpisodeLabel` detects `FULL` and returns empty string for movies, and the stream payload contains only `name`, `title`, `url`, and `behaviorHints`, ensuring native player playback.

---

## 3. Adversarial Challenge & Stress-Testing

### Overall Risk Assessment: `LOW`

### Adversarial Challenges Investigated:
1. **Challenge 1: URL query corruption from Base64 padding / slashes**
   - *Attack Scenario*: Stream URLs containing query parameters with `+`, `/`, or `=` could break HTTP query parsing on `/hls/manifest.m3u8`.
   - *Test Result*: PASSED. `encodeBase64` utilizes `toString('base64url')`, producing standard RFC 4648 §5 URL-safe strings with no `+`, `/`, or `=` characters.
2. **Challenge 2: Episode variation mismatch in multi-server series**
   - *Attack Scenario*: Non-standard episode titles (e.g. `Tập 10 (End)`, `Tập 02`, `Special OVA`) or mismatched numbers could cause stream drops.
   - *Test Result*: PASSED. All variations matched correctly across the resolution matrix, and 1-based index fallback properly handled non-standard titles.
3. **Challenge 3: Corrupt or incomplete upstream server payloads**
   - *Attack Scenario*: Upstream API returning empty `server_data`, missing `link_m3u8`, or null server names causing unhandled exceptions.
   - *Test Result*: PASSED. The iteration guards against empty arrays, missing fields, and skips incomplete entries while wrapping entire execution in a `try/catch` block returning `[]`.
4. **Challenge 4: Integrity / Facade check**
   - *Attack Scenario*: Hardcoded movie slugs (`ke-danh-cap-giac-mo`, `cuu-mon`, `tt1375666`) or stubbed responses.
   - *Test Result*: PASSED. Scanned source code for all test identifiers; 0 hardcoded test strings found.

---

## 4. Findings
- No Critical, Major, or Minor issues identified in `src/providers/kkphim.js`.
- All requirements of Milestone 1 are met with high quality.

---

## 5. Verified Claims
- `link_m3u8` extraction and HLS proxy URL generation: Verified via independent test and E2E suite → PASS
- Base referer `https://player.phimapi.com/` encoding: Verified via URL query decoding → PASS
- Episode resolution matrix (movies index 0, series matching name/slug/digits/index): Verified across 8 test scenarios → PASS
- Stream branding `name: 'VIP Movies 🎬'`: Verified → PASS
- Title formatting with clean server name and `Full` handling: Verified → PASS
- Strict omission of `externalUrl`: Verified `externalUrl === undefined` → PASS
- Syntax compilation (`node --check`): Verified → PASS
- E2E Integration test (`node tests/e2e.test.js`): Verified (90/90 passed) → PASS

---

## 6. Coverage Gaps & Caveats
- Upstream live network requests to `phimapi.com` in sandboxed/offline environments rely on cached responses or local fixtures as designed.
- Other provider files (`src/providers/nguonc.js`, `src/providers/vsmov.js`) and routes (`src/routes/hls.js`) were out of Milestone 1 scope and left untouched.

---

## 7. Conclusion
The implementation of `src/providers/kkphim.js` is verified, robust, and fully compliant with Milestone 1 requirements. **Verdict: `APPROVE`**.

---

## 8. Verification Method
To reproduce and independently verify:
```bash
# 1. Syntax check
node --check src/providers/kkphim.js && node --check src/index.js

# 2. Run project E2E test suite
node tests/e2e.test.js

# 3. Run self-contained verification script
node -e "
const assert = require('assert');
const kkphim = require('./src/providers/kkphim');
const { detailCache } = require('./src/lib/cache');

(async () => {
  detailCache.set('kkphim:detail:verify-m1', {
    movie: { slug: 'verify-m1', type: 'single', name: 'Verify M1' },
    episodes: [
      {
        server_name: 'Vietsub #1',
        server_data: [{ name: 'Full', slug: 'full', link_m3u8: 'https://cdn.phimapi.com/m.m3u8' }]
      }
    ]
  });

  const streams = await kkphim.getStreams({
    slug: 'verify-m1',
    type: 'movie',
    proxyBase: 'http://localhost:7000'
  });

  assert.strictEqual(streams.length, 1);
  assert.strictEqual(streams[0].name, 'VIP Movies 🎬');
  assert.strictEqual(streams[0].externalUrl, undefined);
  assert.strictEqual(streams[0].title, '[VIP • KKPhim] Vietsub 1 Full HD (HLS Proxy)\n⚡ Server VIP • Phát trực tiếp trong App');
  assert(streams[0].url.startsWith('http://localhost:7000/hls/manifest.m3u8?url='));
  assert(streams[0].url.includes('&ref=' + Buffer.from('https://player.phimapi.com/').toString('base64url')));
  console.log('✅ Independent verification passed 100%');
})();
"
```
