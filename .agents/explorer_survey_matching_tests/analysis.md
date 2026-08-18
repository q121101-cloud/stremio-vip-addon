# Detailed Technical Analysis: Search Matching, Multi-Keyword Fallback & E2E Test Infrastructure (Engine v1.7.0)

**Author**: Survey Explorer 3 (Search Matching & E2E Test Infrastructure)  
**Date**: 2026-08-18  
**Scope**: `src/providers/*`, `src/lib/*`, `src/routes/hls.js`, `src/handlers.js`, `src/manifest.js`, `tests/*`, `package.json`

---

## 1. Executive Summary

This investigation analyzed the search matching pipeline, multi-keyword fallback mechanisms, episode matching robustness, existing and target test infrastructures, and versioning alignment across the Stremio VIP Movies Addon repository for the Engine v1.7.0 overhaul.

Key findings:
1. **Multi-Keyword Search Fallback**: `src/providers/nguonc.js` only searches a single raw `title` string and completely omits Cinemeta aliases, original titles, or season-stripped queries. While `kkphim.js` has partial fallback, a unified multi-keyword generator in `src/lib/utils.js` is required to guarantee reliable search matching for KDrama (e.g. *Teach You A Lesson* -> *Bài Học Đáng Đời*, *A Shop for Killers* -> *Cửa Hàng Sát Thủ*) and Western series (e.g. *Lanterns* -> *Lực Lượng Lanterns*, *9-1-1* -> *9 1 1*).
2. **Flexible Episode Matching**: Episode matching code is currently duplicated across providers with inconsistent regexes. NguonC, STP, CLBPX, and YAN lack edge-case handling for zero-padded formats (`01`, `001`), prefix variations (`Tập 01`, `Episode 1`, `Ep. 1`, `tap-01`), and single-item `Full` / `Trọn Bộ` movies. Centralizing `matchEpisodeItem` into `src/lib/utils.js` solves this uniformly.
3. **YAN False Positive Guard**: YAN (yanhh3d.pw / Donghua 3D) requires a strict genre/title filter guard. If Cinemeta passes aliases or keywords for live-action KDrama / Hollywood titles, YAN must immediately short-circuit (`return []`) to prevent injecting Donghua anime streams into live-action series.
4. **HLS Multi-Level Sub-variant & Segment Resolution**: Sub-variant playlists (e.g. `3500kb/hls/index.m3u8`) introduce nested directory structures. Segments like `FqAOJI2h.ts` must resolve against the sub-variant's own URL (`new URL(segmentLine, subVariantUrl).href`), not the parent playlist.
5. **E2E Playback Verification Test Suite (`tests/verify_v170_playback.js`)**: A comprehensive test suite is required to validate 5 core pillars: Catalog endpoints (`stp_movies_phimle`, `clbpx_series_tvb`), KDrama/US-UK stream resolution, M3U8 proxy delivery, 2 consecutive `.ts` segment downloads with buffer > 100KB and sync byte `0x47`, and the YAN false positive guard.
6. **Versioning Sync**: Alignment to `1.7.0` across `package.json`, `src/manifest.js`, `src/handlers.js` (brand signature `VIP Movies Addon v1.7.0 • Designed with Taste by <span class="brand-highlight">Q121101</span>`), and related test suites.

---

## 2. Search & Episode Matching Architecture Across Providers

### 2.1 Provider-by-Provider Search & Matching Audit

| Provider | File | Search Pipeline | Score Matcher | Episode Matching Logic | Deficiencies Identified |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **KKPhim** | `src/providers/kkphim.js` | 1. `getByImdb`<br>2. `getDetail(slug)`<br>3. `search(cleanTitle)` + `search(titleWithoutYear)` + `search(aliases)` | `scoreMatch` in `src/lib/utils.js` (thresholds: 0.70 break, 0.45 select) | `matchEpisodeItem` (inlined in kkphim.js:66-102) | Does not strip complex season strings (e.g. `Phần 1`, `Season 2`) or punctuation (`9-1-1` -> `9 1 1`). |
| **NguonC** | `src/providers/nguonc.js` | 1. `getDetail(slug)`<br>2. `cachedSlug`<br>3. `search(title)` (ONLY 1 query!) | `scoreMatch` | Inlined simplified regex (lines 340-360) | **Critical**: Does NOT search aliases, original titles, or stripped keywords. Inlined episode matcher misses pad3 and various prefix forms. |
| **VSMOV 4K**| `src/providers/vsmov.js` | 1. `slug`<br>2. `getByImdb`<br>3. `getByTmdb`<br>4. `search(title)` + `search(aliases)` | `scoreMatch` | Inlined custom matcher (lines 554-578) | Inlined episode matcher duplicate. |
| **STP** | `src/providers/stp.js` | 1. `slug`<br>2. `getByImdb`<br>3. `search(title)` (WP-JSON + PhimAPI) | `scoreMatch` | Inlined custom matcher (lines 448-472) | Inlined episode matcher duplicate; search only uses `title`. |
| **CLBPX** | `src/providers/clbpx.js` | 1. `slug`<br>2. `getByImdb`<br>3. `search(title)` (PhimAPI + HTML) | `scoreMatch` | Inlined custom matcher (lines 312-336) | Inlined episode matcher duplicate; search only uses `title`. |
| **YAN** | `src/providers/yan.js` | 1. `slug`<br>2. `searchYanLive(title)`<br>3. `search(title)` | `scoreMatch` | Inlined custom matcher (lines 426-450) | **Critical**: Lacks Live-Action / KDrama guard; can match false positive anime titles on shared keywords. |
| **HH3D** | `src/providers/hh3d.js` | 1. `slug`<br>2. `getByImdb`<br>3. `search(title)` | `scoreMatch` | Inlined custom matcher (lines 268-292) | Inlined episode matcher duplicate. |

---

## 3. Multi-Keyword Fallback Requirements & Proposed Design

### 3.1 Problem Analysis
When a request enters the stream aggregator (`src/handlers.js:1517` `handleStream`), Cinemeta resolves canonical metadata:
- `cineMeta.name` (e.g., `"Teach You a Lesson"`, `"A Shop for Killers"`, `"Lanterns"`, `"9-1-1: Lone Star"`)
- `cineMeta.originalName`
- `cineMeta.aliases` (e.g., `["Bài Học Đáng Đời"]`, `["Cửa Hàng Sát Thủ"]`)
- `cineMeta.year`
- `cineMeta.genres`

Currently, NguonC (`src/providers/nguonc.js:281`) only executes:
```javascript
const searchRes = await search(title, 1);
```
If `title` is `"Teach You a Lesson"`, NguonC's API search on `phim.nguonc.com/api/films/search?keyword=Teach%20You%20A%20Lesson` returns:
```json
{
  "status": "success",
  "items": [
    {
      "name": "Bài Học Đáng Đời",
      "slug": "bai-hoc-dang-doi",
      "original_name": "Teach You a Lesson"
    }
  ]
}
```
However, if NguonC's database only indexed the Vietnamese title `"Bài Học Đáng Đời"`, or if the Cinemeta title is `"A Shop for Killers Season 1"` or `"Lanterns: Season 1"`, the single query fails.

### 3.2 Unified Multi-Keyword Generator Specification

In `src/lib/utils.js`, export `generateSearchKeywords({ title, originalName, aliases, season })`:

```javascript
/**
 * Generate prioritized list of search keyword variations
 * @param {Object} params
 * @param {string} [params.title]
 * @param {string} [params.originalName]
 * @param {string[]} [params.aliases]
 * @param {number|string|null} [params.season]
 * @returns {string[]}
 */
function generateSearchKeywords({ title = '', originalName = '', aliases = [], season = null } = {}) {
  const rawList = [
    title,
    originalName,
    ...(Array.isArray(aliases) ? aliases : []),
  ];

  const candidates = new Set();

  for (const raw of rawList) {
    if (!raw || typeof raw !== 'string') continue;
    const trimmed = raw.trim();
    if (!trimmed || trimmed.length < 2) continue;

    // 1. Direct title / alias
    candidates.add(trimmed);

    // 2. Title without trailing 4-digit year (e.g., "Inception (2010)" -> "Inception")
    const withoutYear = trimmed.replace(/\s*\(?\b(19\d\d|20\d\d)\b\)?\s*$/g, '').trim();
    if (withoutYear && withoutYear.length >= 2) {
      candidates.add(withoutYear);
    }

    // 3. Strip Season / Part / Phần / Chapter indicators
    // e.g. "Lanterns Season 1" -> "Lanterns", "A Shop for Killers (Phần 1)" -> "A Shop for Killers"
    const withoutSeason = trimmed
      .replace(/\s*\(?\b(?:season|phần|phan|part|ss|p|chương|chuong)\s*\d+\b\)?/gi, '')
      .replace(/\s*\(?\b(?:season|phần|phan|part|ss|p)\b\)?/gi, '')
      .replace(/\s*\(?\bS\d{1,2}(?:E\d{1,2})?\b\)?/gi, '')
      .trim();
    if (withoutSeason && withoutSeason.length >= 2) {
      candidates.add(withoutSeason);
    }

    // 4. Clean special characters and punctuation (e.g. "9-1-1" -> "9 1 1", "Spider-Man: No Way Home" -> "Spider-Man No Way Home")
    const cleanPunctuation = trimmed
      .replace(/[:_–—/\\|]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    if (cleanPunctuation && cleanPunctuation.length >= 2) {
      candidates.add(cleanPunctuation);
    }

    // 5. Combination: without season + clean punctuation
    if (withoutSeason) {
      const cleanSeasonPunct = withoutSeason
        .replace(/[:_–—/\\|]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
      if (cleanSeasonPunct && cleanSeasonPunct.length >= 2) {
        candidates.add(cleanSeasonPunct);
      }
    }
  }

  return Array.from(candidates).filter(Boolean);
}
```

---

## 4. Flexible Episode Matching Architecture

### 4.1 Variations Observed in Upstream Providers

| Format | Source Example | Provider Encountered | Target Resolution |
| :--- | :--- | :--- | :--- |
| **Number string** | `name: "1"`, `slug: "tap-1"` | NguonC (`bai-hoc-dang-doi`) | `targetEpNum === 1` |
| **Zero-padded** | `name: "Tập 01"`, `slug: "tap-01"` | KKPhim (`bai-hoc-dang-doi`) | `targetEpNum === 1` |
| **Full / Movie** | `name: "Full"`, `slug: "full"` | KKPhim / NguonC single items | `targetEpNum === 1` or movie |
| **Prefix with space**| `name: "Tập 1"`, `slug: "tap-1"` | STP / CLBPX | `targetEpNum === 1` |
| **Slug suffix** | `slug: "bai-hoc-dang-doi-tap-01"`| YAN / CLBPX | `targetEpNum === 1` |
| **English prefix** | `name: "Episode 1"`, `slug: "episode-1"`| VSMOV / TMDB | `targetEpNum === 1` |
| **Filename parsing**| `filename: "... - Tập 01"` | KKPhim | `targetEpNum === 1` |

### 4.2 Standardized `matchEpisodeItem` Specification (to reside in `src/lib/utils.js`)

```javascript
/**
 * Universal episode matcher across all providers
 * @param {Object} ep - Server episode item object
 * @param {string|null} targetEpStr - Target episode string (e.g. "1")
 * @param {number|null} targetEpNum - Target episode numeric (e.g. 1)
 * @returns {boolean}
 */
function matchEpisodeItem(ep, targetEpStr, targetEpNum) {
  if (!ep) return false;
  const nameStr = String(ep.name || '').trim();
  const slugStr = String(ep.slug || '').trim();
  const filenameStr = String(ep.filename || '').trim();

  // Single movie / full item check
  if (nameStr.toUpperCase() === 'FULL' || slugStr.toLowerCase() === 'full') {
    if (targetEpNum === 1 || targetEpStr === '1' || targetEpStr === '01') return true;
  }

  const str = targetEpStr ? String(targetEpStr).trim() : (targetEpNum ? String(targetEpNum) : '');
  if (!str) return false;

  const pad2 = !isNaN(targetEpNum) && targetEpNum > 0 ? String(targetEpNum).padStart(2, '0') : str;
  const pad3 = !isNaN(targetEpNum) && targetEpNum > 0 ? String(targetEpNum).padStart(3, '0') : str;

  // 1. Direct Equality Check
  if (nameStr === str || nameStr === pad2 || nameStr === pad3) return true;
  if (slugStr === str || slugStr === pad2 || slugStr === pad3) return true;

  // 2. Vietnamese Prefix "Tập X" / "Tap X"
  if (nameStr === `Tập ${str}` || nameStr === `Tập ${pad2}` || nameStr === `Tập ${pad3}`) return true;
  if (nameStr === `Tập${str}` || nameStr === `Tập${pad2}` || nameStr === `Tập${pad3}`) return true;
  if (nameStr === `Tap ${str}` || nameStr === `Tap ${pad2}`) return true;

  // 3. English Prefix "Episode X" / "Ep X"
  const nameLower = nameStr.toLowerCase();
  if (nameLower === `episode ${str}` || nameLower === `episode ${pad2}` || nameLower === `ep ${str}` || nameLower === `ep ${pad2}`) return true;
  if (nameLower === `ep.${str}` || nameLower === `ep.${pad2}` || nameLower === `ep${str}` || nameLower === `ep${pad2}`) return true;

  // 4. Slug Patterns ("tap-1", "tap-01", "episode-1", suffix "-1", "-01")
  if (slugStr === `tap-${str}` || slugStr === `tap-${pad2}` || slugStr === `tap-${pad3}`) return true;
  if (slugStr === `episode-${str}` || slugStr === `episode-${pad2}` || slugStr === `ep-${str}` || slugStr === `ep-${pad2}`) return true;
  if (slugStr.endsWith(`-${str}`) || slugStr.endsWith(`-${pad2}`) || slugStr.endsWith(`-${pad3}`)) return true;
  if (slugStr.endsWith(`-tap-${str}`) || slugStr.endsWith(`-tap-${pad2}`)) return true;

  // 5. Numeric Regex Extraction from name, slug, filename
  if (!isNaN(targetEpNum) && targetEpNum > 0) {
    const nameMatch = nameStr.match(/(?:tập|tap|ep|episode|t)\s*(\d+)/i) || nameStr.match(/\b(\d+)\b/);
    if (nameMatch && parseInt(nameMatch[1], 10) === targetEpNum) return true;

    const slugMatch = slugStr.match(/(?:tap|ep|episode)[-_](\d+)/i) || slugStr.match(/[-_](\d+)$/);
    if (slugMatch && parseInt(slugMatch[1], 10) === targetEpNum) return true;

    if (filenameStr) {
      const fileMatch = filenameStr.match(/(?:tập|tap|ep|episode)\s*(\d+)/i);
      if (fileMatch && parseInt(fileMatch[1], 10) === targetEpNum) return true;
    }
  }

  // 6. Word boundary regex fallback
  if (nameStr && str && !str.startsWith('-')) {
    try {
      const re = new RegExp(`(^|[^0-9a-zA-Z])${escapeRegExp(str)}([^0-9a-zA-Z]|$)`, 'i');
      if (re.test(nameStr) || re.test(slugStr)) return true;
    } catch {}
  }

  return false;
}
```

---

## 5. YAN Strict False Positive Guard Analysis

### 5.1 Problem Statement
YAN (`src/providers/yan.js`) specializes exclusively in Chinese 3D Donghua and anime. However, when Cinemeta passes non-anime requests (such as Korean KDramas like *Teach You A Lesson*, *A Shop for Killers*, or Hollywood series like *Lanterns*, *Breaking Bad*, *Harry Potter*):
- If YAN searches PhimAPI or searches with aliases, it risks matching title substrings or generic IDs and returning animated Donghua streams for real-life human films.

### 5.2 Strict Content Filter Guard Specification

In `src/providers/yan.js`:

```javascript
const LIVE_ACTION_GENRES = new Set([
  'drama', 'chính kịch', 'chinh-kich',
  'crime', 'hình sự', 'hinh-su',
  'romance', 'tình cảm', 'tinh-cam', 'lãng mạn',
  'war', 'chiến tranh', 'chien-tranh',
  'history', 'lịch sử', 'lich-su',
  'western', 'âu mỹ', 'au-my',
  'k-drama', 'kdrama', 'hàn quốc', 'han-quoc',
  'reality-tv', 'talk-show', 'biography'
]);

const ANIMATION_GENRES = new Set([
  'animation', 'hoạt hình', 'hoat-hinh',
  'anime', 'donghua', '3d', 'hoạt hình 3d'
]);

function isLiveActionNonDonghua(title, genres = [], aliases = []) {
  const normGenres = (Array.isArray(genres) ? genres : []).map(g => String(g).toLowerCase().trim());
  const hasAnimationGenre = normGenres.some(g => ANIMATION_GENRES.has(g));

  if (!hasAnimationGenre && normGenres.length > 0) {
    const hasLiveActionGenre = normGenres.some(g => LIVE_ACTION_GENRES.has(g));
    if (hasLiveActionGenre) {
      return true; // Strictly live-action!
    }
  }

  const combinedText = `${title || ''} ${(aliases || []).join(' ')}`.toLowerCase();
  if (/k-drama|kdrama|live-action|người đóng|tv series/i.test(combinedText) && !/donghua|hoạt hình|anime|3d/i.test(combinedText)) {
    return true;
  }

  return false;
}
```

At the top of `yan.getStreams(arg1, ...)`:
```javascript
if (isLiveActionNonDonghua(title, genres, aliases)) {
  console.log(`[YAN Guard] Skipping non-animation live-action query: "${title}"`);
  return [];
}
```

---

## 6. E2E Playback Verification Test Suite Design (`tests/verify_v170_playback.js`)

### 6.1 Requirements Mapping

| Section | Target Requirement | Assertions & Invariants |
| :--- | :--- | :--- |
| **Phase 1: Addon Health & Manifest** | Addon lifecycle & endpoints | - Ephemeral server startup on port 0<br>- `GET /health` -> HTTP 200, `status: "ok"`, `version: "1.7.0"`<br>- `GET /manifest.json` -> HTTP 200, `version: "1.7.0"`, 22 catalogs declared. |
| **Phase 2: STP & CLBPX Catalog Endpoints** | R4 #1 (Catalog Verification) | - `GET /catalog/movie/stp_movies_phimle.json` (or `stp-phim-le`) -> HTTP 200, `metas.length > 0`<br>- `GET /catalog/series/clbpx_series_tvb.json` (or `clbpx-hong-kong`) -> HTTP 200, `metas.length > 0`<br>- Metas schema validation (id, name, type, poster). |
| **Phase 3: KDrama & US-UK Playback Verification** | R4 #2 & R4 #3 (KDrama & US-UK Streams) | - *Teach You A Lesson* S1E1: KKPhim & NguonC both resolve streams.<br>- *A Shop for Killers* S1E1: KKPhim & NguonC both resolve streams.<br>- *Lanterns* S1E1: Stream resolved.<br>- In-App protocol invariant: `url` only, strictly `externalUrl === undefined`. |
| **Phase 4: Real TS Video Chunk & 2-Segment Buffer Checks** | R4 #3 (Binary Playback & TS Segments) | - Proxied M3U8 (`/hls/manifest.m3u8`) returns HTTP 200 and `#EXTM3U`.<br>- Sub-variant traversal parses correctly.<br>- **Fetch 2 consecutive `.ts` segments** for each verified stream.<br>- Each segment returns HTTP 200/206 with `Buffer.length >= 100,000` bytes (>100KB) and MPEG-TS sync byte `0x47`. |
| **Phase 5: YAN False Positive Guard Verification** | R4 #4 (Strict YAN Guard) | - When querying `yan.getStreams` for *Teach You A Lesson* or *A Shop for Killers*, YAN returns exactly `[]` (`streams.length === 0`). |
| **Phase 6: HTTP Range 206 Seeking Check** | Seeking support | - Request `Range: bytes=0-1023` on segment returns HTTP 206 with `Content-Range` header and exactly 1024 bytes. |

---

## 7. Versioning & Brand Signature Audit

Target Version: `1.7.0`

| File | Current Value | Target Value | Line Number / Context |
| :--- | :--- | :--- | :--- |
| `package.json` | `"version": "1.6.2"` | `"version": "1.7.0"` | Line 3 |
| `src/manifest.js` | `version: '1.6.2'` | `version: '1.7.0'` | Line 5 (comment), Line 387 (`BASE_MANIFEST.version`) |
| `src/handlers.js` | `Engine v1.6.2` / `v1.6.2` | `Engine v1.7.0` / `VIP Movies Addon v1.7.0 • Designed with Taste by <span class="brand-highlight">Q121101</span>` | Line 5 (comment), Line 1057 (footer HTML) |
| `src/routes/hls.js` | `Engine v1.6.2` | `Engine v1.7.0` | Line 5 (comment) |
| `PROJECT.md` | `Engine v1.6.2` | `Engine v1.7.0` | Header & tables |
| Test files | Various `1.6.2` assertions | Update to `1.7.0` assertions | `tests/verify_all_providers_playback.js`, `tests/verify_v170_playback.js` |

---

## 8. Summary of Action Items for Implementation Phase

1. **`src/lib/utils.js`**:
   - Add and export `generateSearchKeywords({ title, originalName, aliases, season })`.
   - Add and export centralized `matchEpisodeItem(ep, targetEpStr, targetEpNum)`.
2. **`src/providers/nguonc.js`**:
   - Update `getStreams` to use `generateSearchKeywords` to iterate through multi-keyword fallback queries.
   - Replace inlined episode finding with `matchEpisodeItem`.
3. **`src/providers/kkphim.js`, `vsmov.js`, `stp.js`, `clbpx.js`, `hh3d.js`**:
   - Update episode finding to use shared `matchEpisodeItem` from `../lib/utils`.
   - In `src/providers/yan.js`, implement `isLiveActionNonDonghua` guard at the top of `getStreams`.
4. **`tests/verify_v170_playback.js`**:
   - Create the comprehensive v1.7.0 test suite covering Catalogs, KDrama/US-UK playback, 2 consecutive .ts segments > 100KB with 0x47 sync byte, and YAN guard.
5. **Versioning**:
   - Bump version to `1.7.0` across `package.json`, `src/manifest.js`, `src/handlers.js`, `src/routes/hls.js`.
