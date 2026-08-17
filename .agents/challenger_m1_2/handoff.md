# Handoff Report — Milestone 1 Challenger 2: KKPhim Provider In-App Stream Format

## 1. Observation
- Target File: `src/providers/kkphim.js` (lines 1–491).
- Requirement: Return stream objects strictly formatted for Stremio in-app playback:
  - `name`: `"VIP Movies 🎬"`
  - `title`: `[VIP • KKPhim] ${cleanServerName}${epLabel} Full HD (HLS Proxy)\n⚡ Server VIP • Phát trực tiếp trong App`
  - `url`: `${proxyBase}/hls/manifest.m3u8?url=${encodeBase64(ep.link_m3u8)}&ref=${encodeBase64('https://player.phimapi.com/')}`
  - Strictly omit `externalUrl` so Stremio plays inside the native player.
- Test Suite Executed: `tests/test_kkphim_challenger_m1_2.js` (28 dedicated stress and edge-case empirical test scenarios).
  - Verbatim Output:
    ```
    ============================================================
    🧪 KKPHIM EMPIRICAL CHALLENGER VERIFICATION SUITE
    ============================================================

    --- Suite 1: Movie Streams & Multi-Server Verification ---
      ✅ PASS: Movie with 3 servers (Vietsub #1, Thuyết Minh #2, Lồng Tiếng #3) produces 3 HLS streams with clean titles
      ✅ PASS: Movie with custom episode name "Bản Mở Rộng" formats title label correctly
      ✅ PASS: Movie with episode name already having "Tập" prefix (e.g. "Tập Full HD") does not duplicate "Tập"

    --- Suite 2: Series Streams & Episode Resolution Matrix ---
      ✅ PASS: Series Resolution: Episode 1: exact numeric match name "1"
      ✅ PASS: Series Resolution: Episode 1: string "1" match name "01"
      ✅ PASS: Series Resolution: Episode 2: numeric 2 match name "Tập 2"
      ✅ PASS: Series Resolution: Episode 2: numeric 2 match name "Tập 02"
      ✅ PASS: Series Resolution: Episode 5: numeric 5 match slug "tap-5" with long Vietnamese name "Tập 05: Đại Chiến"
      ✅ PASS: Series Resolution: Episode 12: numeric 12 match extracted digits from "Tập 12 (Tập Cuối)"
      ✅ PASS: Series Resolution: Episode 3: numeric 3 match word boundary regex in "Ep 3 Finale"
      ✅ PASS: Series Resolution: Episode 2: 1-based index fallback when names are purely textual "Chapter Two: The Red Door"
      ✅ PASS: Series multi-server: returns matched episode across all 3 servers
      ✅ PASS: Series (multi-episode) out-of-bounds episode (e.g. ep 999) returns [] gracefully
      ✅ PASS: Series single-item heuristic: 1-episode series with ep 999 triggers isMovie fallback

    --- Suite 3: Empty Server Data & Edge Field Handling ---
      ✅ PASS: Server with empty server_data: [] or null is gracefully skipped
      ✅ PASS: Server with missing or empty link_m3u8 (embed only or empty) is safely skipped
      ✅ PASS: Server with missing or messy server_name falls back to "Server {idx + 1}"

    --- Suite 4: Malformed API Payloads & Fault Resilience ---
      ✅ PASS: Malformed payload handling: null movie and episodes
      ✅ PASS: Malformed payload handling: episodes is non-array string
      ✅ PASS: Malformed payload handling: episodes is empty array
      ✅ PASS: Malformed payload handling: episodes contains null elements
      ✅ PASS: Malformed payload handling: server_data contains null/empty items
      ✅ PASS: Invalid invocation arguments (null, undefined, non-object, empty string) return [] safely

    --- Suite 5: Protocol Invariant Stress & baseRef Strictness ---
      ✅ PASS: Verify baseRef is exactly "https://player.phimapi.com/" across 25 dynamic stream resolutions
      ✅ PASS: Strict NO externalUrl: verify 100 generated streams never have externalUrl property defined

    --- Suite 6: Express Route Integration & Concurrency Stress ---
      ✅ PASS: Express /stream/movie/:id.json resolves KKPhim stream with in-app format
      ✅ PASS: Express /stream/series/:id.json resolves KKPhim series episode stream with in-app format
      ✅ PASS: High-concurrency stress: 50 concurrent KKPhim getStreams requests maintain integrity

    ╔══════════════════════════════════════════════════════════════╗
    ║                   CHALLENGER 2 SUMMARY                       ║
    ╠══════════════════════════════════════════════════════════════╣
    ║  Total Tests Executed: 28                                    ║
    ║  ✅ Passed:             28                                    ║
    ║  ❌ Failed:             0                                     ║
    ╚══════════════════════════════════════════════════════════════╝

    🎉 ALL EMPIRICAL CHALLENGE TESTS PASSED PERFECTLY!
    ```
- Full E2E Test Suite: `node tests/e2e.test.js`
  - 90/90 assertions passed with 0 errors.

## 2. Logic Chain
1. **In-App Direct Play (`url` vs `externalUrl`)**:
   - `src/providers/kkphim.js` (lines 405–416) constructs stream objects with `name: 'VIP Movies 🎬'`, `title`, `url`, and `behaviorHints`.
   - `externalUrl` is never assigned or added to KKPhim stream objects. Verified over 100 dynamic and static stream objects across all test scenarios that `stream.externalUrl === undefined`.
2. **Anti-403 Referer & URL Construction**:
   - `baseRef` is defined as `'https://player.phimapi.com/'` in `src/providers/kkphim.js` (line 364).
   - In `getStreams` (line 406), `streamUrl` incorporates `${encodeBase64(baseRef)}`, producing `&ref=aHR0cHM6Ly9wbGF5ZXIucGhpbWFwaS5jb20v`.
   - Decoded `ref` query parameter on every stream URL strictly equals `'https://player.phimapi.com/'`.
3. **Episode & Movie Resolution Matrix**:
   - For `type: 'movie'` or `movie?.type === 'single'`, index 0 (`serverData[0]`) is selected.
   - For `type: 'series'`, multi-stage matching prioritizes: exact string name match -> exact slug match (`tap-X` / `tap-0X`) -> numeric equivalence from extracted digits (`numFromName === epNum`) -> regex word boundary match (`\b${targetEpStr}\b`) -> 1-based array index fallback (`serverData[epNum - 1]`).
   - Out-of-bounds episode requests on multi-episode series return `[]` cleanly.
4. **Server Name and Title Sanitization**:
   - `cleanServerName` normalizes `#` characters, trims extra whitespace, and provides fallback `Server ${sIdx + 1}` if missing (line 370).
   - `formatEpisodeLabel` formats `[Tập ${trimmed}]` without duplicate prefixes and omits labels for 'Full' or empty names (lines 51–59).
5. **Fault Isolation & Malformed Payload Handling**:
   - Null or missing `server_data`, missing `link_m3u8`, empty `episodes`, or network error responses gracefully resolve to `[]` without throwing uncaught exceptions.

## 3. Caveats
- Line 360 includes `(episodes.length === 1 && episodes[0]?.server_data?.length === 1)` in `isMovie` condition. For an ongoing series where only 1 episode is uploaded, querying an out-of-bounds episode (e.g. ep 999) falls back to serving Episode 1 as a single video. In standard multi-episode series, out-of-bounds requests return `[]` as expected.
- Upstream live calls to `phimapi.com` in sandbox/offline test environments require mock/cached fixtures to avoid network `ENOTFOUND` errors.

## 4. Conclusion
- All requirements of Milestone 1 (`src/providers/kkphim.js`) are empirically verified and strictly conform to the Stremio R3 Stream Protocol specification.
- Under NO circumstance is `externalUrl` returned by KKPhim.
- `baseRef` is accurately encoded as `'https://player.phimapi.com/'` across all stream URLs.
- **VERDICT: APPROVE**.

## 5. Verification Method
To independently verify:
1. Run provider syntax check:
   `node --check src/providers/kkphim.js && node --check src/index.js`
2. Run Challenger 2 empirical test suite:
   `node tests/test_kkphim_challenger_m1_2.js`
3. Run full E2E test suite:
   `node tests/e2e.test.js`
