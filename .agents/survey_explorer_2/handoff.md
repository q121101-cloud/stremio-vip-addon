# Handoff Report — Survey Explorer 2: Manifest & Handlers Investigation

**Agent:** `survey_explorer_2`  
**Parent Agent:** `parent` (`9690458b-e1e2-43b3-aca3-2dded3ba2878`)  
**Timestamp:** 2026-08-18T16:09:40+07:00  
**Status:** Complete (Hard Handoff)  
**Deliverable File:** `/Users/quan/.gemini/antigravity/scratch/stremio-nguonc-addon/.agents/survey_explorer_2/analysis.md`

---

## 1. Observation

1. **Manifest Catalogs & Configuration (`src/manifest.js`)**:
   - `ALL_CATALOGS` array at `src/manifest.js:63-363` contains exactly 22 catalog definitions across 7 provider modules:
     * VSMOV (2): `vsmov-4k`, `vsmov-thuyet-minh` (lines 65-90)
     * KKPhim (4): `kkphim-movie-latest`, `kkphim-series-latest`, `kkphim-cinema-latest`, `kkphim-anime-latest` (lines 93-144)
     * NguonC (4): `nguonc-movie-latest`, `nguonc-series-latest`, `nguonc-cinema-latest`, `nguonc-anime-latest` (lines 147-198)
     * STP (4): `stp-au-my`, `stp-phim-le`, `stp-phim-bo`, `stp-han-quoc` (lines 201-252)
     * HH3D (3): `hh3d-phim-le`, `hh3d-phim-bo`, `hh3d-tien-hiep` (lines 255-293)
     * YAN (3): `yan-phim-le`, `yan-phim-bo`, `yan-dang-chieu` (lines 296-334)
     * CLBPX (2): `clbpx-kiem-hiep`, `clbpx-hong-kong` (lines 337-362)
   - Every catalog specifies `extra: [{ name: 'search', isRequired: false }, { name: 'genre', isRequired: false, options: GENRE_NAMES }, { name: 'skip', isRequired: false }]` and `extraSupported: ['search', 'genre', 'skip']`.
   - `BASE_MANIFEST.version` at `src/manifest.js:387` is currently `'1.6.0'`, whereas Requirement R6 specifies `'1.6.2'`.
   - `BASE_MANIFEST.idPrefixes` at `src/manifest.js:367-383` lists `['vsmov:', 'vsmov_', 'kkphim:', 'kkphim_', 'nguonc:', 'nguonc_', 'stp:', 'stp_', 'hh3d:', 'hh3d_', 'yan:', 'yan_', 'clbpx:', 'clbpx_', 'tt']`.

2. **Catalog Routing Logic (`src/handlers.js`)**:
   - `getProviderFromCatalogId` at `src/handlers.js:107-114`:
     ```javascript
     function getProviderFromCatalogId(catalogId) {
       if (!catalogId) return 'nguonc';
       const id = String(catalogId).toLowerCase().trim();
       for (const pid of Object.keys(ALL_PROVIDERS)) {
         if (id.startsWith(pid + '-') || id.startsWith(pid + '_') || id === pid) return pid;
       }
       return 'nguonc';
     }
     ```
   - `getCatTypeFromCatalogId` at `src/handlers.js:116-145` handles aliases like `vsmov-tm`, `stp-western`, `clbpx-wuxia`, `clbpx-tvb`, `yan-ongoing`, but is missing direct mapping for R2 alias names such as `vsmov-4k-sieu-net`, `stp-dien-anh-au-my`, `clbpx-kiem-hiep-xua`, `clbpx_series_tvb`, `yan_series_donghua`, `nguonc-moi-cap-nhat`.
   - Timeout in `handleCatalog` at `src/handlers.js:1250, 1278` is `4000ms`.

3. **Stream Aggregation Logic (`src/handlers.js`)**:
   - Concurrency: `Promise.allSettled` is used across all active providers at `src/handlers.js:1587-1591`.
   - Timeout: `withTimeout(provider.getStreams(payload), 4000, ...)` is `4000ms`, whereas R3 specifies `4500ms`.
   - Priority sorting: `getStreamPriority` at `src/handlers.js:1435-1462` sorts primarily by Provider (VSMOV -> KKPhim -> NguonC -> STP -> HH3D -> YAN -> CLBPX). R3 requires global sorting by quality/audio: **4K/UHD -> Vietsub -> Thuyết Minh -> Lồng Tiếng**.
   - Stream titles: All 6 providers output standardized titles with brand headers (`[VIP 1 • VSMOV]`, `[VIP 2 • KKPhim]`, `[VIP 3 • NguonC]`, `[VIP 4 • STP]`, `[VIP 5 • CLBPX]`, `[VIP 6 • YAN]`).
   - In-App protocol: `sanitized.url` points to `/hls/manifest.m3u8`, `delete sanitized.externalUrl` at line 1614 ensures zero `externalUrl`.

4. **Test Suite Verification**:
   - Executed `node tests/verify_playback.js` -> 7/7 Phases PASSED (100%).
   - Executed `node tests/verify_hotfix_vsmov_kkphim.js` -> 27/27 assertions PASSED (100%).
   - Executed `node tests/verify_new_providers.js` -> 26/26 checks PASSED (100%).
   - Executed `node --check src/index.js && node --check src/manifest.js && node --check src/handlers.js` -> Clean syntax (0 exit code).

---

## 2. Logic Chain

1. **From Observation 1 & 2 to Catalog Integrity**:
   - `ALL_CATALOGS` has 22 items covering all 6 provider clusters (VSMOV, KKPhim, NguonC, STP, CLBPX, YAN+HH3D).
   - Because users may access catalogs via either canonical IDs or alternative IDs mentioned in R2 (e.g. `vsmov-4k-sieu-net`, `stp-dien-anh-au-my`, `clbpx-kiem-hiep-xua`), adding exhaustive mapping in `getCatTypeFromCatalogId` guarantees zero 404s for any catalog URL requested.

2. **From Observation 3 to Stream Priority Ordering**:
   - R3 requires the user to see: 4K/UHD streams first, then Vietsub streams, then Thuyết Minh, then Lồng Tiếng.
   - The current `getStreamPriority` calculates score by provider first (e.g., KKPhim Vietsub gets score 30, but NguonC 4K if any or other provider's Vietsub gets 50/70).
   - By adopting a 2-tier scoring function: `bucket (100 for 4K/UHD, 200 for Vietsub, 300 for TM, 400 for LT) + providerRank (1..6)`, the resulting stream array will strictly follow `4K/UHD -> Vietsub -> Thuyết Minh -> Lồng Tiếng` while preserving provider preference within each audio category.

3. **From Observation 3 to Timeout Standardization**:
   - `withTimeout` uses 4000ms in `handleCatalog` and `handleStream`. Updating both to `4500ms` aligns precisely with R3 without impacting fast-responding providers.

---

## 3. Caveats

- **YAN vs HH3D Provider Modules**: In `src/providers/`, `yan.js` and `hh3d.js` exist as separate modules totaling 6 catalogs (3 YAN + 3 HH3D). In R2, they are grouped under the YANHH3D cluster. Keeping both active in `ALL_PROVIDERS` and `ALL_CATALOGS` satisfies the 22 catalog count and ensures 100% coverage of Donghua 3D sources.
- No other caveats.

---

## 4. Conclusion

- `src/manifest.js` and `src/handlers.js` are structurally solid and pass 100% of existing regression test suites.
- The 4 necessary refinements to achieve 100% compliance with R2, R3, and R6 are:
  1. Bump version string to `1.6.2` in `package.json`, `src/manifest.js`, `src/handlers.js`.
  2. Increase timeout to `4500ms` in `handleCatalog` and `handleStream`.
  3. Update `getStreamPriority` to prioritize `4K/UHD -> Vietsub -> Thuyết Minh -> Lồng Tiếng`.
  4. Enrich `getCatTypeFromCatalogId` with all R2 alias catalog IDs.

---

## 5. Verification Method

To independently verify all observations and conclusions:
1. Check syntax of all modified files:
   ```bash
   node --check src/index.js && node --check src/manifest.js && node --check src/handlers.js
   ```
2. Run playback verification suite:
   ```bash
   node tests/verify_playback.js
   ```
3. Run hotfix regression suite:
   ```bash
   node tests/verify_hotfix_vsmov_kkphim.js
   ```
4. Run new providers verification suite:
   ```bash
   node tests/verify_new_providers.js
   ```
5. Invalidation conditions: Any test failure in the commands above or any stream containing `externalUrl`.
