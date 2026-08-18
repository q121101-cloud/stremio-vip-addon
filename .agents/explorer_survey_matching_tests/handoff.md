# Handoff Report: Survey Explorer 3 (Search Matching & E2E Test Infrastructure)

**Agent ID**: `explorer_survey_matching_tests`  
**Milestone**: `survey_and_analysis`  
**Working Directory**: `/Users/quan/.gemini/antigravity/scratch/stremio-nguonc-addon/.agents/explorer_survey_matching_tests/`  
**Parent Conversation ID**: `df6b69f2-b4cb-483e-b97e-e806a40c0155`

---

## 1. Observation

1. **Provider Search Logic**:
   - `src/providers/nguonc.js:281`: `const searchRes = await search(title, 1);` only queries a single raw `title` string. It ignores `aliases`, `originalName`, and stripped season keywords.
   - `src/providers/kkphim.js:359`: Queries `[cleanTitle, titleWithoutYear, ...aliases]` but does not strip season strings (e.g. `Season 1`, `Phần 1`) or clean punctuation (e.g. `9-1-1` -> `9 1 1`).
   - Upstream API probe results:
     * `https://phimapi.com/v1/api/tim-kiem?keyword=Teach%20You%20A%20Lesson` returns `[ { name: 'Bài Học Đáng Đời', slug: 'bai-hoc-dang-doi', year: 2026 } ]`.
     * `https://phim.nguonc.com/api/films/search?keyword=Teach%20You%20A%20Lesson` returns `[ { name: 'Bài Học Đáng Đời', slug: 'bai-hoc-dang-doi' } ]`.
     * `https://phimapi.com/v1/api/tim-kiem?keyword=A%20Shop%20for%20Killers` returns `Cửa Hàng Sát Thủ (Phần 1)` and `(Phần 2)`.
     * `https://phim.nguonc.com/api/films/search?keyword=Lanterns` returns `Lực lượng Lanterns (Phần 1)` (`luc-luong-lanterns-phan-1`).

2. **Episode Matching Logic**:
   - KKPhim episode detail format: `name: "Tập 01"`, `slug: "tap-01"`.
   - NguonC episode detail format: `name: "1"`, `slug: "tap-1"`.
   - `src/providers/kkphim.js:66-102`: Inlines `matchEpisodeItem(ep, targetEpStr, targetEpNum)` supporting pad2/pad3 and prefix checks.
   - `src/providers/nguonc.js:340-360`, `src/providers/stp.js:448-472`, `src/providers/clbpx.js:312-336`, `src/providers/yan.js:426-450`, `src/providers/hh3d.js:268-292`: All contain separate inlined matchers that do not import from a centralized utility.

3. **HLS Multi-Level Playlist & Segment Download**:
   - KKPhim master playlist for *Teach You A Lesson* (`mMUnxegG/index.m3u8`) contains `#EXT-X-STREAM-INF` with relative sub-variant `3500kb/hls/index.m3u8`.
   - Inside sub-variant `3500kb/hls/index.m3u8`, segment lines are relative: `FqAOJI2h.ts`, `bpfTwEiu.ts`.
   - Resolving against the sub-variant URL (`https://v7.kkphimplayer7.com/20260605/mMUnxegG/3500kb/hls/FqAOJI2h.ts`) yields HTTP 200 and 426,196 bytes with sync byte `0x47`. Resolving against the master URL gives 404.

4. **YAN False Positive Risk**:
   - `src/providers/yan.js`: Searches yanhh3d.pw and PhimAPI without checking whether the content is live-action.
   - If Cinemeta passes aliases (e.g. `["Bài Học Đáng Đời"]`), a title overlap would cause YAN to return Donghua 3D streams for real-life Korean/Hollywood series.

5. **Existing Test Infrastructure & Version Strings**:
   - `package.json:3`: `"version": "1.6.2"`
   - `src/manifest.js:387`: `version: '1.6.2'`
   - `src/handlers.js:1057`: `VIP Movies Addon v1.6.2 • Designed with Taste by <span class="brand-highlight">Q121101</span>`
   - `tests/verify_all_providers_playback.js` passes 44/44 assertions in 17.34s.
   - `npm test` (`src/test.js`) passes 50/50 assertions.
   - `node --check` passes with zero errors on all files in `src/`.

---

## 2. Logic Chain

1. **Premise**: When users request KDrama or Western series on Stremio (e.g. `tt0903747:1:1`, `tt30825313:1:1`), Cinemeta provides English titles (`"Teach You a Lesson"`, `"A Shop for Killers"`), Vietnamese aliases (`"Bài Học Đáng Đời"`, `"Cửa Hàng Sát Thủ"`), and genre classifications (`["Drama", "Crime"]`).
2. **Step 1 (Multi-Keyword Fallback)**: Because upstream Vietnamese streaming APIs index films under various localized names and season formats, searching only `title` (as NguonC currently does) results in missing streams. By generating an ordered fallback array:
   - Priority 1: Exact English title / original name
   - Priority 2: Vietnamese title / aliases from Cinemeta
   - Priority 3: Stripped season strings (e.g. removing `Season 1`, `Phần 1`, `P1`)
   - Priority 4: Stripped punctuation/special characters (e.g. `9-1-1` -> `9 1 1`, `Spider-Man: No Way Home` -> `Spider-Man No Way Home`)
   and iterating with `scoreMatch >= 0.45`, both KKPhim and NguonC achieve reliable KDrama/US-UK stream resolution.
3. **Step 2 (Universal Episode Matching)**: Because different providers represent episode 1 as `"1"`, `"01"`, `"Tập 01"`, `"tap-1"`, `"Full"`, or `"Episode 1"`, centralizing `matchEpisodeItem` in `src/lib/utils.js` and importing it across all providers eliminates matching mismatches.
4. **Step 3 (YAN False Positive Elimination)**: By checking `isLiveActionNonDonghua(title, genres, aliases)` at the entry point of `yan.getStreams`, live-action KDrama / Hollywood titles are filtered out immediately (`return []`), preserving Donghua purity.
5. **Step 4 (Test Suite Alignment)**: Implementing `tests/verify_v170_playback.js` as an ephemeral-port E2E test verifying catalog endpoints (`stp_movies_phimle`, `clbpx_series_tvb`), KDrama/US-UK stream resolution, M3U8 proxy delivery, 2 consecutive `.ts` segments (>100KB, sync `0x47`), and YAN guard guarantees zero regressions for v1.7.0.

---

## 3. Caveats

1. **External API Availability**: Upstream video CDNs (`v7.kkphimplayer7.com`, `amass11.top`, `sieutamphim.pro`, `clbphimxua.info`) are live third-party services. Network timeouts during E2E testing are mitigated by 5-second axios timeouts and 2-attempt retries.
2. **Cheerio Dependency**: Cheerio is specified in Requirement R2 for HTML scraping of STP/CLBPX. It is currently not in `package.json` dependencies. Implementers must either install `cheerio` or provide regex-based HTML parsers with graceful fallbacks.

---

## 4. Conclusion

1. Implement `generateSearchKeywords` and centralized `matchEpisodeItem` in `src/lib/utils.js`.
2. Update `src/providers/nguonc.js` and `src/providers/kkphim.js` to consume `generateSearchKeywords` for multi-keyword search.
3. Apply `isLiveActionNonDonghua` guard to `src/providers/yan.js`.
4. Create `tests/verify_v170_playback.js` covering all 5 verification phases.
5. Synchronize version string to `1.7.0` in `package.json`, `src/manifest.js`, `src/handlers.js`, and `src/routes/hls.js`.

---

## 5. Verification Method

### 5.1 Verification Commands
1. **Syntax Check**:
   ```bash
   node --check src/index.js && node --check src/handlers.js && node --check src/manifest.js && node --check src/routes/hls.js && node --check src/lib/utils.js
   ```
2. **Existing Unit & Integration Suite**:
   ```bash
   npm test
   ```
   *Expected*: 50/50 PASS.
3. **Comprehensive Provider Playback Suite**:
   ```bash
   node tests/verify_all_providers_playback.js
   ```
   *Expected*: 44/44 PASS (100% assertions).
4. **Target v1.7.0 E2E Playback Suite**:
   ```bash
   node tests/verify_v170_playback.js
   ```
   *Expected*: 100% PASS across STP/CLBPX catalogs, KDrama/US-UK streams, 2 consecutive `.ts` segments (>100KB, sync byte 0x47), and YAN false positive guard.

### 5.2 Files to Inspect
- `src/lib/utils.js`: Check for `generateSearchKeywords` and `matchEpisodeItem` exports.
- `src/providers/nguonc.js`: Check for multi-keyword search loop.
- `src/providers/yan.js`: Check for `isLiveActionNonDonghua` guard at start of `getStreams`.
- `tests/verify_v170_playback.js`: Check for 5 verification phases.
- `package.json`, `src/manifest.js`, `src/handlers.js`: Check for `1.7.0` version strings and brand signature.
