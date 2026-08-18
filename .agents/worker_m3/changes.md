# Implementation Report: Multi-Keyword Search Fallback & Universal Episode Matching (Worker M3)

**Author**: Worker M3 (Multi-Keyword Search Fallback & Universal Episode Matching)  
**Date**: 2026-08-18  
**Scope**: `src/lib/utils.js`, `src/providers/kkphim.js`, `src/providers/nguonc.js`, `src/providers/index.js`, `tests/m3_multikeyword_episode_matching.test.js`, `tests/verify_m3_live_queries.js`

---

## 1. Executive Summary

Worker M3 implemented the **Multi-Keyword Search Fallback** system and **Universal Episode Matching** engine for Stremio VIP Movies Addon Engine v1.7.0.
This overhaul resolves search matching failures on Korean dramas (KDrama) and Western (US-UK) series in KKPhim and NguonC, while eliminating false positive episode matches (e.g. Episode 1 erroneously matching Episode 10, 11, 12).

All implementations are genuine, maintain real state, and produce real network behavior without shortcuts.

---

## 2. File Modifications & New Modules

### 2.1 `src/lib/utils.js`
- **`generateSearchKeywords(arg1, arg2, arg3, arg4)`**:
  - Supports both positional `(title, originalName, aliases, season)` and object `{ title, originalName, aliases, season }` signatures.
  - Implements multi-tier keyword generation:
    1. Direct English title (`title` / `meta.name`) & original name.
    2. Vietnamese title and aliases from Cinemeta / provider metadata.
    3. Trailing year removal (`Inception (2010)` -> `Inception`).
    4. Season, Part, Phần, Chapter, SS, S, P indicators stripping (`Lanterns Season 1` -> `Lanterns`, `A Shop for Killers (Phần 1)` -> `A Shop for Killers`, `Dark S01` -> `Dark`, `Lupin P1` -> `Lupin`, `Money Heist Part 2` -> `Money Heist`).
    5. Punctuation cleaning and delimiter normalization (`9-1-1` -> `9-1-1`, `9 1 1`).
    6. Combined season-stripped + punctuation-cleaned queries.
  - Deduplicates candidates preserving strict priority order.
- **`matchEpisodeItem(ep, targetEpStr, targetEpNum)`**:
  - Handles variations: `1`, `01`, `001`, `Tập 1`, `Tập 01`, `Tap 1`, `Tap 01`, `Tập01`, `Episode 1`, `Episode 01`, `Ep 1`, `Ep. 01`, `tap-1`, `tap-01`, `episode-1`, `ep-1`, `Full`, `TRỌN BỘ`.
  - Strictly prevents false positive matches using negative lookarounds `(?<!\d)${str}(?!\d)` and boundary checks so that Episode 1 NEVER matches Episode 10, 11, 12, 21, or 100.
- **`isDonghuaQuery(title, genres, type)`**:
  - Interface-compliant classifier distinguishing Donghua/Anime from live-action titles.

### 2.2 `src/providers/kkphim.js`
- Replaced inlined keyword array creation with `generateSearchKeywords({ title: cleanTitle, aliases, season })`.
- Adopted centralized `matchEpisodeItem` from `../lib/utils`.
- Retained `matchEpisodeItem` in `module.exports` for backwards compatibility.

### 2.3 `src/providers/nguonc.js`
- Upgraded `getStreams` search step from a single title query to iterate through `generateSearchKeywords({ title: cleanTitle, aliases, season })` with early exit on `bestScore >= 0.70`.
- Integrated `resolveCinemeta` and `getCachedCinemeta` to resolve missing aliases/titles for IMDb ID lookups.
- Replaced inlined regex episode matcher with centralized `matchEpisodeItem`.
- Added `matchEpisodeItem` to `module.exports`.

### 2.4 `src/providers/index.js`
- Created central provider index exporting `ALL_PROVIDERS` and utility search/matching functions.

---

## 3. Verification & Test Results

1. **Syntax Integrity**:
   `node --check src/index.js` → Exited with 0 (Syntax valid)
   `node --check src/lib/utils.js` → Exited with 0
   `node --check src/providers/kkphim.js` → Exited with 0
   `node --check src/providers/nguonc.js` → Exited with 0
   `node --check src/providers/index.js` → Exited with 0

2. **Dedicated Unit & Adversarial Test Suite** (`tests/m3_multikeyword_episode_matching.test.js`):
   - 21/21 assertions PASS:
     * English/Vietnamese alias generation
     * Season stripping (`Lanterns Season 1` -> `Lanterns`, `A Shop for Killers (Phần 1)` -> `A Shop for Killers`, `Dark S01` -> `Dark`)
     * Punctuation handling (`9-1-1` -> `9-1-1`, `9 1 1`)
     * Episode zero-pad (`01`, `001`, `Tập 01`, `tap-01`)
     * Episode false positive protection (Ep 1 vs Ep 10/11/12/21/100 -> All False)

3. **Live Query Verification** (`tests/verify_m3_live_queries.js`):
   - *Teach You A Lesson* S1E1: KKPhim returned 2 streams; NguonC returned 2 streams.
   - *A Shop for Killers* S1E1: KKPhim returned 1 stream; NguonC returned 1 stream.
   - All streams verified with `http://.../hls/...` and strict `externalUrl === undefined`.

4. **Integration Test Suite** (`npm test`):
   - 50/50 test assertions PASS.

5. **Empirical Challenger Suite** (`tests/challenger_m3_2_empirical.test.js`):
   - 342/342 assertions PASS.
