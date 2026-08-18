# Handoff Report: Detailed Code Audit of Provider Registrations, Manifest, Config, Handlers, and UI Grid

**Agent**: Explorer 3
**Working Directory**: `/Users/quan/.gemini/antigravity/scratch/stremio-nguonc-addon/.agents/teamwork_preview_explorer_survey_3/`
**Target Commit / Version**: VIP Movies Addon Engine v1.7.1
**Date**: 2026-08-19

---

## 1. Observation

### A. Provider Registration Across All 8 Required Checkpoints

1. **`VALID_PROVIDERS` in `src/config.js:12`**:
   - Quote: `const VALID_PROVIDERS = ['film4k', 'vsmov', 'kkphim', 'nguonc', 'stp', 'hh3d', 'yan', 'clbpx'];`
   - Verified: All 8 providers present in canonical order.

2. **`DEFAULT_CONFIG.providers` in `src/config.js:19`**:
   - Quote: `providers: ['film4k', 'vsmov', 'kkphim', 'nguonc', 'stp', 'hh3d', 'yan', 'clbpx'],`
   - Verified: All 8 providers enabled by default.

3. **`ALL_PROVIDERS` object in `src/handlers.js:33-42` & `src/providers/index.js:20-29`**:
   - In `src/handlers.js:33-42`:
     ```javascript
     const ALL_PROVIDERS = {
       film4k: providerFilm4K,
       vsmov:  providerVsMov,
       kkphim: providerKKPhim,
       nguonc: providerNguonC,
       stp:    providerSTP,
       hh3d:   providerHH3D,
       yan:    providerYAN,
       clbpx:  providerCLBPX,
     };
     ```
   - In `src/providers/index.js:20-29`:
     ```javascript
     const ALL_PROVIDERS = {
       film4k,
       vsmov,
       kkphim,
       nguonc,
       stp,
       hh3d,
       yan,
       clbpx,
     };
     ```
   - Verified: All 8 provider modules imported and correctly registered.

4. **`ALL_CATALOGS` array in `src/manifest.js:63-404`**:
   - `film4k` (3 catalogs, lines 65-103): `film4k-4k-movies`, `film4k-4k-series`, `film4k-chieu-rap`
   - `vsmov` (2 catalogs, lines 106-131): `vsmov-4k`, `vsmov-thuyet-minh`
   - `kkphim` (4 catalogs, lines 134-185): `kkphim-movie-latest`, `kkphim-series-latest`, `kkphim-cinema-latest`, `kkphim-anime-latest`
   - `nguonc` (4 catalogs, lines 188-239): `nguonc-movie-latest`, `nguonc-series-latest`, `nguonc-cinema-latest`, `nguonc-anime-latest`
   - `stp` (4 catalogs, lines 242-293): `stp-au-my`, `stp-phim-le`, `stp-phim-bo`, `stp-han-quoc`
   - `hh3d` (3 catalogs, lines 296-334): `hh3d-phim-le`, `hh3d-phim-bo`, `hh3d-tien-hiep`
   - `yan` (3 catalogs, lines 337-375): `yan-phim-le`, `yan-phim-bo`, `yan-dang-chieu`
   - `clbpx` (2 catalogs, lines 378-403): `clbpx-kiem-hiep`, `clbpx-hong-kong`
   - Total: Exactly **25 catalogs** representing all 8 providers.

5. **`ALL_ID_PREFIXES` array in `src/manifest.js:408-426`**:
   - Quote (`src/manifest.js:408-426`):
     ```javascript
     const ALL_ID_PREFIXES = [
       'film4k:',
       'film4k_',
       'vsmov:',
       'vsmov_',
       'kkphim:',
       'kkphim_',
       'nguonc:',
       'nguonc_',
       'stp:',
       'stp_',
       'hh3d:',
       'hh3d_',
       'yan:',
       'yan_',
       'clbpx:',
       'clbpx_',
       'tt',
     ];
     ```
   - Referenced in `BASE_MANIFEST.resources` (meta, stream) and `BASE_MANIFEST.idPrefixes`.
   - Verified: All 8 providers covered with both colon `:` and underscore `_` prefixes + IMDb `tt`.

6. **`_allProvidersList` client-side JS variable in `src/handlers.js:1125`**:
   - Quote: `var _allProvidersList = ['film4k', 'vsmov', 'kkphim', 'nguonc', 'stp', 'hh3d', 'yan', 'clbpx'];`
   - Utilized in client UI functions `selectAll()` (line 1193) and `selectNone()` (line 1204).

7. **Provider Card HTML in Configurator Bento Grid (`src/handlers.js:931-1065`)**:
   - Section header: `🌐 8 Cụm Nguồn Phim VIP (Chuẩn 4K Ultra HD & Audio Độc Lập)` (line 930)
   - `card-film4k`: Lines 933-948 (`💎 FILM4K (VIP Ultra HD Engine)`)
   - `card-vsmov`: Lines 951-966 (`🌟 VSMOV 4K (Master Engine)`)
   - `card-kkphim`: Lines 969-983 (`🔮 KKPhim`)
   - `card-nguonc`: Lines 985-1000 (`🎞️ NguonC`)
   - `card-stp`: Lines 1003-1016 (`🗽 STP (Sưu Tầm Phim)`)
   - `card-hh3d`: Lines 1019-1032 (`⚔️ HH3D (Hoạt Hình 3D)`)
   - `card-yan`: Lines 1035-1048 (`🔥 YAN Donghua`)
   - `card-clbpx`: Lines 1051-1064 (`🗡️ CLBPX (Phim Xưa)`)
   - Verified: Full keyboard accessibility (`tabindex="0"`, `role="checkbox"`, `aria-checked`), toggle functions, and micro-interactive styling present.

---

### B. Routing Correctness in `src/handlers.js` and Providers

1. **Catalog Resolution & Routing**:
   - `getProviderFromCatalogId(catalogId)` (`src/handlers.js:109-116`): Iterates over `Object.keys(ALL_PROVIDERS)` and checks prefix matching.
   - `getCatTypeFromCatalogId(catalogId)` (`src/handlers.js:118-174`): Correctly translates 25 catalog IDs into standard types across all 8 providers (`4k-movies`, `4k-series`, `cinema`, `4k`, `thuyet-minh`, `movie`, `series`, `anime`, `au-my`, `han-quoc`, `tien-hiep`, `dang-chieu`, `kiem-hiep`, `hong-kong`).
   - `handleCatalog` (`src/handlers.js:1275-1353`): Safely executes `provider.getCatalog()` with 4500ms timeout (`withTimeout`) and handles generic search fan-out across active providers.

2. **Meta Resolution & Routing**:
   - `handleMeta` (`src/handlers.js:1367-1481`):
     - IMDb IDs (`tt\d+`) delegated to Cinemeta (lines 1378-1381).
     - Dedicated handlers for `vsmov:`/`vsmov_`, `kkphim:`/`kkphim_`, `nguonc:`/`nguonc_`, `stp:`/`stp_`, `hh3d:`/`hh3d_`, `yan:`/`yan_`, `clbpx:`/`clbpx_`.
     - Observation: `film4k:` / `film4k_` currently relies on Cinemeta or fallback rather than a dedicated `else if (id.startsWith('film4k:'))` branch.

3. **Stream Resolution & Routing**:
   - `handleStream` (`src/handlers.js:1551-1693`):
     - Correctly strips prefixes for all 8 providers (lines 1596-1615).
     - Gathers metadata from Cinemeta for IMDb IDs (`resolveCinemeta`).
     - Gathers active providers from user configuration (`config.providers`), defaulting to `PROVIDER_ORDER`.
     - Executes provider queries concurrently via `Promise.allSettled` and per-provider 4500ms timeout (`withTimeout`).
     - Priority sorting: 4K/UHD (0) -> Vietsub (100) -> Thuyết Minh (200) -> Lồng Tiếng (300) sub-sorted by provider rank (FILM4K VIP 0 -> VSMOV VIP 1 -> KKPhim VIP 2 -> NguonC VIP 3 -> STP VIP 4 -> CLBPX VIP 5 -> YAN VIP 6).
     - Normalizes and deduplicates streams via `normalizeStreamKey` (lines 1536-1549).

---

### C. Stream `url` Invariant & `externalUrl` Prohibition

Every provider implementation and the aggregator enforce In-App Direct Play:
- **`src/handlers.js:1650-1667`**:
  - Drops items missing `url`: `if (!item.url || typeof item.url !== 'string' || !item.url.trim()) continue;`
  - Explicit sanitizer deletion: `delete sanitized.externalUrl;`
- **`src/providers/film4k.js:317-327`**: Returns HLS Proxy `url: proxyStreamUrl`, no `externalUrl`.
- **`src/providers/vsmov.js:598-622`**: Returns HLS Proxy `url: streamUrl`, no `externalUrl`.
- **`src/providers/kkphim.js:414-423`**: Returns HLS Proxy `url: streamUrl`, no `externalUrl`.
- **`src/providers/nguonc.js:430-438`**: Returns HLS Proxy `url: streamUrl`, no `externalUrl`.
- **`src/providers/stp.js:692-751`**: Returns HLS Proxy `url: streamUrl`, no `externalUrl`.
- **`src/providers/hh3d.js:305-314`**: Returns HLS Proxy `url: streamUrl`, no `externalUrl`.
- **`src/providers/yan.js:493-620`**: Returns HLS Proxy `url: streamUrl`, no `externalUrl`.
- **`src/providers/clbpx.js:578-755`**: Returns HLS Proxy `url: streamUrl`, no `externalUrl`.

---

## 2. Logic Chain

1. **Premise 1**: All 8 providers must be consistently registered across configuration, manifest, handler routing, client JS, and HTML configurator.
   - *Evidence*: `VALID_PROVIDERS` (`src/config.js:12`), `DEFAULT_CONFIG.providers` (`src/config.js:19`), `ALL_PROVIDERS` (`src/handlers.js:33` & `src/providers/index.js:20`), `ALL_CATALOGS` (`src/manifest.js:63`), `ALL_ID_PREFIXES` (`src/manifest.js:408`), `_allProvidersList` (`src/handlers.js:1125`), and the 8 HTML cards (`src/handlers.js:933-1064`) all contain exactly the 8 providers (`film4k`, `vsmov`, `kkphim`, `nguonc`, `stp`, `hh3d`, `yan`, `clbpx`).
2. **Premise 2**: Routing logic must correctly handle catalog lookup, meta lookup, and stream aggregation for all 8 providers.
   - *Evidence*: `getProviderFromCatalogId`, `getCatTypeFromCatalogId`, `handleCatalog`, and `handleStream` in `src/handlers.js` successfully parse all provider catalog IDs and prefix types.
3. **Premise 3**: Stremio Stream Protocol requires in-app direct play using the `url` property with zero occurrences of `externalUrl`.
   - *Evidence*: All 8 provider modules in `src/providers/*.js` return objects with `url` and omit `externalUrl`. Furthermore, `src/handlers.js:1666` explicitly invokes `delete sanitized.externalUrl`.

---

## 3. Caveats & Observations for Subsequent Milestones (M2 Remediation)

1. **`src/routes/manifest.js` Label Map**:
   - In `src/routes/manifest.js:32-40`, `providerLabels` inside `buildDescription()` maps 7 providers (`vsmov`, `kkphim`, `nguonc`, `stp`, `hh3d`, `yan`, `clbpx`) and omits `film4k: 'FILM4K'`. While it falls back to the key `'film4k'`, adding the explicit label will ensure consistent uppercase formatting.
2. **`handleMeta` symmetry for `film4k`**:
   - In `src/handlers.js:1388-1470`, adding an explicit `else if (id.startsWith('film4k:') || id.startsWith('film4k_'))` branch to call `providerFilm4K.getDetail(slug)` will provide full symmetry with the other 7 provider branches.
3. **Legacy test suite catalog count**:
   - `tests/verify_all_providers_playback.js:187` asserts `manifestRes.data.catalogs.length === 22`, which was the count prior to the addition of `film4k` (3 catalogs: total 25). Updating this test to expect 25 catalogs will allow the legacy suite to pass cleanly.

---

## 4. Conclusion

- **Registry Consistency**: Verified 100% across all 8 checkpoints (`VALID_PROVIDERS`, `DEFAULT_CONFIG.providers`, `ALL_PROVIDERS`, `ALL_CATALOGS` [25 catalogs], `ALL_ID_PREFIXES`, `_allProvidersList`, and 8 HTML configurator cards).
- **Routing**: Catalog, Meta, and Stream handlers correctly route requests to all 8 providers with resilient timeouts and fallback mechanisms.
- **Stream Invariant**: All 8 providers strictly produce `url` streams with 0 instances of `externalUrl`.

---

## 5. Verification Method

To independently verify these findings:

```bash
# 1. Run integration test suite
npm test

# 2. Run empirical stress and UI tests
node tests/challenger_v170_empirical_stress.test.js
node tests/challenger1_taste_ui_adversarial.test.js
node tests/challenger_taste_ui_comprehensive.test.js

# 3. Inspect provider declaration consistency
grep -n "VALID_PROVIDERS" src/config.js
grep -n "ALL_PROVIDERS" src/providers/index.js src/handlers.js
grep -n "ALL_ID_PREFIXES" src/manifest.js
grep -n "_allProvidersList" src/handlers.js
```
