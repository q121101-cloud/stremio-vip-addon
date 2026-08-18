# Comprehensive Investigation & Survey Report: Providers, Utils, Test Suites & Versioning (R4, R5, R6)

**Agent**: `survey_explorer_3`  
**Timestamp**: 2026-08-18T16:12:00+07:00  
**Project Root**: `/Users/quan/.gemini/antigravity/scratch/stremio-nguonc-addon`  
**Reference Document**: `.agents/ORIGINAL_REQUEST.md` (Engine v1.6.2 Upgrade Package)

---

## 1. Executive Summary

This report presents a thorough investigation into the 6 provider modules in `src/providers/` (`vsmov.js`, `kkphim.js`, `nguonc.js`, `stp.js`, `clbpx.js`, `yan.js`), shared utility helpers in `src/lib/utils.js`, existing test suites in `tests/` and root, and versioning/deployment requirements (R4, R5, R6).

### Key Takeaways:
1. **R4 (Standard Provider Interface & Utility Reuse)**:
   - All 6 providers export the standard interface: `{ id, label, getCatalog, getStreams, search, getDetail }`.
   - All 6 providers strictly import canonical utility functions from `src/lib/utils.js` without any duplicate declarations.
   - All 6 providers enforce the strict In-App stream invariant (`url` only, strictly `delete externalUrl`).
   - 3-tier fallback mechanisms (IMDb lookup / direct slug -> fuzzy title & season/episode search -> graceful empty array `[]`) are in place.
2. **R5 (E2E Continuous Playback Test Suite)**:
   - Existing test suites (`tests/verify_playback.js`, `tests/verify_new_providers.js`, `tests/verify_hotfix_vsmov_kkphim.js`) pass 100%.
   - The required unified test `tests/verify_all_providers_playback.js` does NOT exist yet and needs to be created.
   - Live stream and video segment download verified across all 6 sources:
     * **VSMOV**: Master M3U8 HTTP 200, WebVTT subtitle proxy HTTP 200, TS/PNG binary chunk (7.4 MB).
     * **KKPhim**: M3U8 HTTP 200, sub-variant playlist HTTP 200, TS segment > 100KB (353 KB, 0x47 sync byte).
     * **NguonC**: M3U8 HTTP 200, TS segment > 100KB (3.7 MB, 0x47 sync byte).
     * **STP**: M3U8 HTTP 200, sub-variant playlist HTTP 200, TS segment > 100KB (0x47 sync byte).
     * **CLBPX**: M3U8 HTTP 200, sub-variant playlist HTTP 200, TS segment > 100KB (3.1 MB, 0x47 sync byte).
     * **YAN**: M3U8 HTTP 200, sub-variant playlist HTTP 200, TS segment > 100KB (596 KB, 0x47 sync byte).
3. **R6 (Versioning, Brand Signature & Deploy)**:
   - Version sync required to `1.6.2` across `package.json`, `src/manifest.js`, and `src/handlers.js`.
   - Git commit & push target verified.

---

## 2. Deep Dive: Provider Modules (`src/providers/*.js`)

| Provider File | Provider ID | Brand Label | Exported Interface | Upstream Referer Header | Stream Type & Features |
|---|---|---|---|---|---|
| `src/providers/vsmov.js` | `vsmov` | `VSMOV 4K` | `id, label, getCatalog, getStreams, search, getDetail, getByImdb, getByTmdb, classifyServerAudio, resolveEmbedMedia, resolveMasterPlaylistUrl` | `https://vsmov.com/` | 4K Ultra HD (3840x2160), Multi-server audio tabs (Vietsub, Lồng Tiếng, Thuyết Minh), WebVTT subtitle proxy `/hls/sub.vtt` |
| `src/providers/kkphim.js` | `kkphim` | `KKPhim` | `id, label, getByImdb, search, getDetail, getCatalog, getStreams, mapDetailMeta, matchEpisodeItem, formatImageUrl` | `https://player.phimapi.com/` | Vietsub, Thuyết Minh, Lồng Tiếng Full HD. Flexible episode matcher `matchEpisodeItem` (`"1"`, `"01"`, `"Tập 1"`, `tap-1`, etc.) |
| `src/providers/nguonc.js` | `nguonc` | `NguonC` | `id, label, search, getDetail, getCatalog, getStreams, mapCatalogMeta` | `https://phim.nguonc.com/`, `https://embed15.streamc.xyz/` | Vietsub, Thuyết Minh Full HD, `/hls/extract` dynamic iframe bóc tách, direct m3u8 encapsulation |
| `src/providers/stp.js` | `stp` | `STP • sieutamphim.pro` | `id, label, search, getDetail, getCatalog, getStreams, decodeXor0x2a, parsePostContent` | `https://sieutamphim.pro/` | Western Cinema & K-Drama, XOR 0x2a string deobfuscation, WP-JSON / HTML SSR parsing |
| `src/providers/clbpx.js` | `clbpx` | `CLBPX • Phim Xưa & TVB` | `id, label, search, getDetail, getCatalog, getStreams` | `https://clbphimxua.info/` | Classic Wuxia & TVB Hong Kong, Ophim API + clbphimxua.info HTML fallback |
| `src/providers/yan.js` | `yan` | `YAN • Donghua & Anime` | `id, label, search, getDetail, getCatalog, getStreams` | `https://yanhh3d.pw/` | 3D Donghua & Ongoing Anime, Live scraping `data-obf.pU` / `master.m3u8` + Ophim JSON fallback |

### Detailed Provider Verification Findings:

1. **VSMOV (`vsmov.js`)**:
   - `getStreams()` takes payload `{ imdbId, type, title, year, season, episode, slug, proxyBase }`.
   - Extracts Vietsub and dubbed/voiceover streams correctly. On Harry Potter (`tt0373889`), returns 2 distinct streams with subtitle proxy URL attached.
   - Zero duplicate `scoreMatch` declaration; imports strictly from `../lib/utils`.

2. **KKPhim (`kkphim.js`)**:
   - `getByImdb` and `search` fallback correctly implemented.
   - `matchEpisodeItem` accommodates all episode formats (`nameStr === targetEpStr`, `Tập 1`, `tap-1`, zero padded `01`, `001`).
   - Referer header configured to `https://player.phimapi.com/` across all proxy requests.

3. **NguonC (`nguonc.js`)**:
   - `getStreams()` correctly extracts m3u8 or embed URL and proxies through `/hls/extract` or `/hls/manifest.m3u8`.
   - `getCatalog()` handles movies, series, anime. For cinema (`phim-chieu-rap`), if upstream returns 404, it degrades gracefully returning `[]` without throwing exceptions.

4. **STP (`stp.js`)**:
   - `decodeXor0x2a()` decodes obfuscated links from `sieutamphim.pro`.
   - `parsePostContent()` extracts multi-server data from HTML `episodeGroup` containers.
   - Correctly integrates with `../lib/utils` for text scoring and season validation.

5. **CLBPX (`clbpx.js`)**:
   - Multi-tier search: Ophim JSON API -> `clbphimxua.info` HTML search.
   - Streams properly tagged with `[VIP 5 • CLBPX]` branding and routed through HLS proxy.

6. **YAN (`yan.js`)**:
   - Multi-tier search: `searchYanLive` -> Ophim JSON API.
   - *Observation & Fix Note*: In `getStreams()`, when `searchYanLive` finds live slugs from `yanhh3d.pw` whose live stream extraction fails or is 404, Tier 2 should ensure searching Ophim API directly by title so `getDetail()` receives a valid Ophim slug.

---

## 3. Shared Utility Library (`src/lib/utils.js`)

`src/lib/utils.js` exports 11 canonical functions:
1. `safeString(val, defaultVal)`: Prevents crashes from symbols or unexpected object structures.
2. `safeType(type, defaultType)`: Normalizes catalog/stream type (`movie`, `series`).
3. `normalizeText(str)`: Removes Vietnamese diacritics, special symbols, and extra whitespace.
4. `escapeRegExp(str)`: Escapes special characters for regular expressions safely.
5. `safeExtra(extra)`: Normalizes extra parameter objects.
6. `safeSlug(slug, prefix)`: Strips prefix tags (`vsmov:`, `kkphim:`, `nguonc:`, `stp:`, `clbpx:`, `yan:`) cleanly.
7. `safeKeyword(keyword)`: Sanitizes query strings.
8. `safePage(page)`: Sanitizes pagination numbers (>= 1).
9. `extractSeasonNumber(str)`: Extracts season index from title/slug patterns (`phần 2`, `season 3`, `s04e01`).
10. `isSeasonMatch(movie, episodes, requestedSeason, type)`: Validates series season alignment.
11. `scoreMatch(item, title, year, season)`: Deterministic fuzzy match scoring between 0.0 and 1.5 with year and season bonuses/penalties.

**Audit Result**: 100% utility reuse across all 6 providers. No duplicate helper functions exist in `src/providers/`.

---

## 4. Test Infrastructure & Verification Analysis

### Existing Test Suites:
| Test File | Purpose | Status | Assertion Count / Result |
|---|---|---|---|
| `tests/verify_playback.js` | E2E playback, VSMOV audio separation, Subtitle proxy, Range 206 | PASS | 7/7 phases PASS (100%) |
| `tests/verify_new_providers.js` | STP, CLBPX, YAN provider interfaces, M3U8 proxy, TS segment download | PASS | 26/26 checks PASS (100%) |
| `tests/verify_hotfix_vsmov_kkphim.js` | Subtitle proxy endpoint, KKPhim search fallback, M3U8 injection | PASS | 27/27 assertions PASS (100%) |
| `src/test.js` | Unit test suite for API endpoints | PASS | PASS |

### Missing Test Suite required by R5:
- File to create: `tests/verify_all_providers_playback.js`
- Test Plan:
  1. **Phase 1: Catalog Health Check (22 Catalogs)**:
     - Verify all 22 catalogs across all 6 provider clusters return HTTP 200 + `metas` array.
  2. **Phase 2: Live Stream Resolution & M3U8 Proxy for all 6 Providers**:
     - VSMOV: Movie `tt0373889` -> Master M3U8 HTTP 200 + WebVTT Subtitle proxy `/hls/sub.vtt` HTTP 200.
     - KKPhim: Series `tt0903747:1:1` -> M3U8 HTTP 200 + TS Segment > 100KB with sync byte `0x47`.
     - NguonC: Movie `nguonc_munich-bo-vuc-chien-tranh` -> Extract/M3U8 HTTP 200 + TS Segment > 100KB with sync byte `0x47`.
     - STP: Movie `stp_oppenheimer` -> M3U8 HTTP 200 + TS Segment > 100KB with sync byte `0x47`.
     - CLBPX: Series `clbpx_anh-hung-xa-dieu:1:1` -> M3U8 HTTP 200 + TS Segment > 100KB with sync byte `0x47`.
     - YAN: Series `yan_the-gioi-hoan-my:1:1` -> M3U8 HTTP 200 + TS Segment > 100KB with sync byte `0x47`.
  3. **Phase 3: MPEG-TS Binary & Size Invariants**:
     - Verify binary download status HTTP 200/206.
     - Verify byteLength > 100,000 bytes (> 100KB).
     - Verify MPEG-TS sync byte `0x47` at offset 0 (or valid wrapper for VSMOV).
  4. **Phase 4: HTTP Range Seeking Verification**:
     - Verify Range request `bytes=0-1023` returns HTTP 206 with `Content-Range` header.

---

## 5. Versioning & Deployment Gap Analysis (R6)

| Target Location | Current Value | Required Value (R6) | Action Required |
|---|---|---|---|
| `package.json` | `"version": "1.6.0"` | `"version": "1.6.2"` | Update `"version"` to `"1.6.2"` |
| `src/manifest.js` (line 5 & line 387) | `version: '1.6.0'` | `version: '1.6.2'` | Update manifest version to `'1.6.2'` |
| `src/handlers.js` (line 5) | `Engine v1.6.0` | `Engine v1.6.2` | Update header comment to `Engine v1.6.2` |
| `src/handlers.js` (line 881) | `v1.6.0` | `v1.6.2` | Update live status badge to `v1.6.2` |
| `src/handlers.js` (line 1035) | `VIP Movies Addon v1.6.0` | `VIP Movies Addon v1.6.2` | Update footer signature: `VIP Movies Addon v1.6.2 • Designed with Taste by <span class="brand-highlight">Q121101</span>` |

### Git Deployment Command (per R6):
```bash
git remote set-url origin https://<GITHUB_TOKEN>@github.com/q121101-cloud/stremio-vip-addon.git
git add . && git commit -m "Engine v1.6.2: Fully Verified Playback for all 6 Providers (VSMOV, KKPhim, NguonC, STP, CLBPX, YAN) with 22 Active Catalogs"
git push origin main
git remote set-url origin https://github.com/q121101-cloud/stremio-vip-addon.git
```

---

## 6. Recommendations for Implementation & Verification Teams

1. **Create `tests/verify_all_providers_playback.js`**: Implement the 4-phase unified verification suite covering all 6 providers with strict TS chunk > 100KB and sync byte 0x47 assertions.
2. **Refine YAN Tier 2 search fallback**: In `src/providers/yan.js`, ensure that if live scraping fails or live slugs do not resolve on PhimAPI, it performs an Ophim keyword search directly so detail lookup succeeds.
3. **Synchronize version string to `1.6.2`**: Update `package.json`, `src/manifest.js`, and `src/handlers.js`.
4. **Execute complete regression test run**:
   - `node tests/verify_all_providers_playback.js` (New test)
   - `node tests/verify_playback.js` (Existing)
   - `node tests/verify_hotfix_vsmov_kkphim.js` (Existing)
   - `node tests/verify_new_providers.js` (Existing)
   - `node --check src/index.js`
