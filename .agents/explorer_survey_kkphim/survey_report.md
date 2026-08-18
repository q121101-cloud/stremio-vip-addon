# KKPhim Smart Search Fallback Survey Report (Hotfix v1.5.2)

**Addon**: VIP Movies Stremio Addon  
**Target Module**: `src/providers/kkphim.js`  
**Related Modules**: `src/lib/cinemeta.js`, `src/lib/utils.js`, `src/lib/cache.js`, `src/handlers.js`, `src/routes/hls.js`  
**Date**: 2026-08-18  
**Author**: Explorer Agent (`explorer_survey_kkphim`)  

---

## 1. Executive Summary

KKPhim (`phimapi.com`) is a core high-speed provider (VIP 2) in the VIP Movies Stremio Addon. During production usage, stream resolution for certain IMDb IDs (e.g., *Inception* `tt1375666`, *Breaking Bad* `tt0903747`, *The Batman* `tt1877830`, *Dune* `tt1160419`) resulted in 0 streams or 404 lookup failures.

This investigation identified the root causes, formulated the complete 3-Tier lookup fallback architecture, mapped the series episode matching heuristics, and validated the integration with Cinemeta metadata and `scoreMatch` fuzzy scoring.

---

## 2. Root Cause Analysis: Why 404s & Stream Resolution Failures Occur

### 2.1. Upstream IMDb Endpoint Limitation (`/imdb/title/:imdbId`)
- The official KKPhim API endpoint `https://phimapi.com/imdb/title/:imdbId` only indexes a subset of Western cinema and television titles.
- **Empirical Evidence**:
  - `tt9362722` (*Spider-Man: Across the Spider-Verse*) -> Returns HTTP 200 `{ status: true, movie: { name: "Người Nhện: Du Hành Vũ Trụ Nhện" } }`.
  - `tt1375666` (*Inception*) -> Returns HTTP 404 `{ status: false, msg: "hmmm!" }`.
  - `tt0903747` (*Breaking Bad*) -> Returns HTTP 404 `{ status: false, msg: "hmmm!" }`.
  - `tt0944947` (*Game of Thrones*) -> Returns HTTP 404 `{ status: false, msg: "hmmm!" }`.
  - `tt1877830` (*The Batman*) -> Returns HTTP 404 `{ status: false, msg: "hmmm!" }`.
  - `tt1160419` (*Dune*) -> Returns HTTP 404 `{ status: false, msg: "hmmm!" }`.
- **Finding**: Despite returning 404 on the direct IMDb route, all of these movies/series exist in KKPhim under their Vietnamese and English titles via `/v1/api/tim-kiem` (e.g. *Kẻ Đánh Cắp Giấc Mơ* `ke-danh-cap-giac-mo` for Inception).

### 2.2. Synchronous Cinemeta Cache Dependency Bug in `src/providers/kkphim.js`
- In `src/providers/kkphim.js` (lines 320–328):
  ```javascript
  if (!year && imdbId) {
    const cachedCine = getCachedCinemeta(type, imdbId);
    if (cachedCine?.year) year = cachedCine.year;
    if (!title && cachedCine?.name) title = cachedCine.name;
  }
  ```
- **Bug**: `getCachedCinemeta` only checks synchronous memory cache. If `getStreams` is called directly (in tests or when `title` was not pre-resolved), `getCachedCinemeta` returns `null`.
- Consequently, `title` remains `null`. When Tier 1 (`getByImdb`) fails with 404, Tier 2 search fallback (`if (!movieData && title)`) is completely skipped, returning 0 streams.

### 2.3. Single Query & Alias Blindspot
- In `kkphim.js`, the search fallback only searched a single `title` query, ignoring `aliases` and `originalName` returned by Cinemeta.
- In contrast, `vsmov.js` iterates over `[title, ...aliases]`, which significantly increases hit rate for localized titles.

### 2.4. Cache Key Inconsistency
- `getByImdb` checks `imdbCache.get('kkphim:imdb:' + cleanImdb)` where `cleanImdb` is lowercased and trimmed.
- Step 3 previously saved to `imdbCache.set('kkphim:imdb:' + imdbId, movieData, 86400)`, risking key mismatch if `imdbId` contained uppercase letters or trailing colons.

---

## 3. 3-Tier Lookup Architecture

The robust stream resolution pipeline for `src/providers/kkphim.js` operates across three distinct tiers:

```
                      ┌────────────────────────────────────────┐
                      │    Incoming Request: { imdbId, ... }   │
                      └──────────────────┬─────────────────────┘
                                         │
                                         ▼
                 ┌──────────────────────────────────────────────────┐
                 │  Tier 1: Direct IMDb Lookup (phimapi.com/imdb)   │
                 └──────────────┬───────────────────┬───────────────┘
                                │ Hit (HTTP 200)    │ Miss (HTTP 404 / null)
                                ▼                   ▼
                        ┌──────────────┐    ┌──────────────────────────────┐
                        │ Return Stream│    │ Asynchronous Cinemeta Lookup │
                        └──────────────┘    │ (resolveCinemeta: name/year) │
                                            └──────────────┬───────────────┘
                                                           │
                                                           ▼
                                            ┌──────────────────────────────┐
                                            │ Tier 2: Smart Search Fallback│
                                            │ (/v1/api/tim-kiem + score)   │
                                            └──────────────┬───────────────┘
                                                           │
                                             ┌─────────────┴─────────────┐
                                             │ Match >= 0.45             │ Miss
                                             ▼                           ▼
                                    ┌──────────────────┐       ┌─────────────────┐
                                    │ Cache to LRU     │       │ Tier 3: Return  │
                                    │ Return Streams   │       │ Safe Empty []   │
                                    └──────────────────┘       └─────────────────┘
```

### 3.1. Tier 1: Direct IMDb ID Resolution (`getByImdb`)
1. **Cache Inspection**: Check `imdbCache.get('kkphim:imdb:' + cleanImdb)`. If cached, return immediately.
2. **Upstream Request**: `GET https://phimapi.com/imdb/title/${cleanImdb}` with 5-second timeout and custom User-Agent.
3. **Validation**: Check for `res.data.movie` and `res.data.episodes` array.
4. **Cache Storage**: Store successful result in `imdbCache` with 24-hour TTL (86,400s).

### 3.2. Tier 2: Cinemeta Metadata Enrichment + Smart Search Fallback
1. **Metadata Resolution**:
   - If `!title` or `!year`, check `getCachedCinemeta(type, imdbId)`.
   - If still null, call `await resolveCinemeta(type, imdbId)` to fetch canonical title, 4-digit release year, and aliases.
2. **Search Fan-out**:
   - Construct queries array: `const searchQueries = [title, ...(aliases || [])].filter(Boolean)`.
   - Execute `GET https://phimapi.com/v1/api/tim-kiem?keyword=${encodeURIComponent(query)}&limit=10`.
3. **Fuzzy Scoring (`scoreMatch`)**:
   - Calculate score for each candidate item using `scoreMatch(item, targetTitle, targetYear, targetSeason)`.
   - Scoring algorithm accounts for:
     - Exact string equality (score = 1.0)
     - Substring inclusion (score = 0.8)
     - Word overlap Jaccard ratio (score = ratio * 0.7)
     - Release year match (+0.25 exact, +0.1 if +/- 1 year, -0.2 mismatch penalty)
     - Season match for series (+0.3 if extracted season matches, -0.25 penalty if mismatched)
   - Early break if `bestScore >= 0.70` (high confidence match).
4. **Detail Fetching**:
   - If `bestItem && bestItem.slug && bestScore >= 0.45`, call `await getDetail(bestItem.slug)`.
   - Write back to `imdbCache.set('kkphim:imdb:' + cleanImdb, movieData, 86400)` so future requests hit Tier 1.

### 3.3. Tier 3: Graceful Degradation (Safe `[]`)
- If no item matches the threshold, or the detail object contains no valid playable M3U8 links:
- Return `[]` immediately.
- Never throw unhandled exceptions, never block the aggregator, and never emit fake streams that lead to HTTP 404/502.

---

## 4. Episode Matching Algorithm for Series

### 4.1. Upstream Data Format
KKPhim organizes series episodes into servers (e.g. `Vietsub`, `Thuyết Minh`, `Lồng Tiếng`), where each server contains `server_data`:
```json
{
  "name": "Tập 01",
  "slug": "tap-01",
  "filename": "Trò Chơi Vương Quyền (Phần 1) - Game Of Thrones - Tập 01",
  "link_m3u8": "https://s3.phim1280.tv/.../index.m3u8",
  "link_embed": "https://player.phimapi.com/player/?url=..."
}
```

Common variations observed in KKPhim:
- `name: "1"`, `slug: "1"`
- `name: "01"`, `slug: "01"`
- `name: "Tập 1"`, `slug: "tap-1"`
- `name: "Tập 01"`, `slug: "tap-01"`
- `name: "Tập 001"`, `slug: "tap-001"`
- `name: "Episode 1"`, `slug: "episode-1"`
- `name: "Tập 1 (Vietsub)"`, `slug: "tap-1-vietsub"`

### 4.2. Matching Implementation (`matchEpisodeItem`)
The function `matchEpisodeItem(ep, targetEpStr, targetEpNum)` evaluates candidate items through sequential matching passes:

```javascript
function matchEpisodeItem(ep, targetEpStr, targetEpNum) {
  if (!ep) return false;
  const nameStr = String(ep.name || '').trim();
  const slugStr = String(ep.slug || '').trim();
  const pad2 = !isNaN(targetEpNum) && targetEpNum > 0 ? String(targetEpNum).padStart(2, '0') : targetEpStr;
  const pad3 = !isNaN(targetEpNum) && targetEpNum > 0 ? String(targetEpNum).padStart(3, '0') : targetEpStr;

  // Pass 1: Direct Name Equality
  if (nameStr === targetEpStr || nameStr === pad2 || nameStr === pad3) return true;
  if (nameStr === `Tập ${targetEpStr}` || nameStr === `Tập ${pad2}` || nameStr === `Tập ${pad3}`) return true;
  if (nameStr === `Tập${targetEpStr}` || nameStr === `Tập${pad2}` || nameStr === `Tập${pad3}`) return true;
  if (nameStr.toLowerCase() === `episode ${targetEpStr}` || nameStr.toLowerCase() === `ep ${pad2}`) return true;

  // Pass 2: Slug Equality & Suffix Patterns
  if (slugStr === targetEpStr || slugStr === pad2 || slugStr === pad3) return true;
  if (slugStr === `tap-${targetEpStr}` || slugStr === `tap-${pad2}` || slugStr === `tap-${pad3}`) return true;
  if (slugStr === `episode-${targetEpStr}` || slugStr === `ep-${targetEpStr}` || slugStr === `ep-${pad2}`) return true;
  if (slugStr.endsWith(`-${targetEpStr}`) || slugStr.endsWith(`-${pad2}`) || slugStr.endsWith(`-${pad3}`)) return true;
  if (slugStr.endsWith(`-tap-${targetEpStr}`) || slugStr.endsWith(`-tap-${pad2}`)) return true;

  // Pass 3: Regex Number Extraction
  if (!isNaN(targetEpNum) && targetEpNum > 0) {
    const nameMatch = nameStr.match(/(?:tập|tap|ep|episode)\s*(\d+)/i) || nameStr.match(/\b(\d+)\b/);
    if (nameMatch && parseInt(nameMatch[1], 10) === targetEpNum) return true;

    const slugMatch = slugStr.match(/(?:tap|ep|episode)[-_](\d+)/i) || slugStr.match(/[-_](\d+)$/);
    if (slugMatch && parseInt(slugMatch[1], 10) === targetEpNum) return true;
  }

  // Pass 4: Word Boundary Fallback
  if (nameStr && targetEpStr && !targetEpStr.startsWith('-')) {
    try {
      const re = new RegExp(`(^|[^0-9a-zA-Z])${escapeRegExp(targetEpStr)}([^0-9a-zA-Z]|$)`, 'i');
      if (re.test(nameStr) || re.test(slugStr)) return true;
    } catch {}
  }
  return false;
}
```

### 4.3. Index Fallback (Pass 5)
If `matchEpisodeItem` returns `false` across all items, and `epNum >= 1 && epNum <= serverData.length`, the engine safely falls back to 1-based index mapping:
```javascript
if (!targetEp && !isNaN(epNum) && epNum >= 1 && epNum <= serverData.length) {
  targetEp = serverData[epNum - 1];
}
```

---

## 5. Summary of Required Modifications in `src/providers/kkphim.js`

| File | Location | Change Description |
|------|----------|-------------------|
| `src/providers/kkphim.js` | Line 19 | Import `{ resolveCinemeta, getCachedCinemeta }` from `../lib/cinemeta` |
| `src/providers/kkphim.js` | Lines 290–328 | Extract `aliases` from `arg1.aliases` and perform `await resolveCinemeta(type, imdbId)` if `title` or `year` are absent |
| `src/providers/kkphim.js` | Lines 344–363 | Expand search fallback to iterate over `[title, ...aliases]`, apply `scoreMatch` with early exit on score >= 0.70, and normalize cache key on `imdbCache.set` |
| `src/providers/kkphim.js` | Lines 413–436 | Maintain strict zero `externalUrl` invariant and encapsulate stream in `/hls/manifest.m3u8` proxy with `https://player.phimapi.com/` referer |

---

## 6. Verification Test Scenarios for Hotfix v1.5.2

1. **Movie IMDb Fallback Test**:
   - Query `tt1375666` (*Inception*).
   - Assert: Tier 1 misses -> Tier 2 searches "Inception" -> Matches `ke-danh-cap-giac-mo` -> Returns HTTP 200 M3U8 stream without 404.
2. **Series Episode Matching Test**:
   - Query `tt0903747:1:1` (*Breaking Bad S1E1*).
   - Assert: Matches Episode 1 (`name: "Tập 1"`, `slug: "tap-1"`) -> Returns valid HLS proxy stream.
   - Query `tt0944947:1:1` (*Game of Thrones S1E1*).
   - Assert: Matches Episode 1 (`name: "Tập 01"`, `slug: "tap-01"`) -> Returns valid HLS proxy stream.
3. **Invalid / Non-Existent IMDb ID Test**:
   - Query `tt0000000000`.
   - Assert: Returns `[]` safely without throwing or sending 404 stream.
