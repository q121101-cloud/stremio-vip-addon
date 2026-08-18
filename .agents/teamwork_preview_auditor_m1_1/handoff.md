# Forensic Integrity Audit Report — Hotfix v1.5.2

**Work Product**: Stremio VIP Movies Addon — Hotfix v1.5.2 (`src/providers/vsmov.js`, `src/routes/hls.js`, `src/providers/kkphim.js`, `src/index.js`, `src/handlers.js`, `src/manifest.js`, `package.json`, `tests/verify_hotfix_vsmov_kkphim.js`)
**Integrity Mode**: `development` (per `ORIGINAL_REQUEST.md`)
**Verdict**: `CLEAN`

---

## 1. Observation

Direct empirical observations made during the forensic audit across static source code analysis, live network execution, and stress testing:

### 1.1 Static Source Code Analysis & Prohibited Patterns Scan
- **Hardcoded Test Outputs**: Grep search across `src/` for test IMDb IDs (`tt5095030`, `tt0903747`, `tt0373889`) returned **0 matches** in executable code (only standard JSDoc parameter documentation examples in `src/lib/cinemeta.js:85,101` and `src/api.js:166`).
- **Mock/Fake/Stub Objects**: Grep searches for `fakeStream`, `mock`, `stub`, `dummy`, `return <constant>` returned **0 matches** in `src/`.
- **Pre-populated Result Artifacts**: Zero pre-populated test output logs or fabricated attestations found.
- **Strict In-App Protocol Enforcement**:
  - `src/handlers.js:1614`: `delete sanitized.externalUrl;` guarantees no `externalUrl` leaks.
  - `src/providers/vsmov.js:598-620`: Returns stream objects with `url` routing via `/hls/manifest.m3u8` and attached `subtitles` array with `id: "vi_vsmov"`, `lang: "vie"`, and title `"Tiếng Việt (VSMOV VIP)"`.
  - `src/providers/kkphim.js:450-458`: Returns stream objects with `url` routing via `/hls/manifest.m3u8` and no `externalUrl`.

### 1.2 Subtitle Extraction & Subtitle Proxy (`/hls/sub.vtt`)
- **VSMOV Subtitle Extraction**:
  - `src/providers/vsmov.js:148-181` extracts subtitles from `playerOptions.subtitles` / `tracks` JSON array as well as regex fallback parsing for relative and absolute `.vtt` / `.srt` URLs.
  - Direct execution with live Harry Potter media (`tt0373889`) extracted real Vietnamese subtitle URL:
    `https://v5.streamvsmov.com/video/382f09db-83ff-4d89-9be9-797162d4f2e6/subtitle/vie_1785240078185_txr9be.vtt`
- **Subtitle Proxy (`/hls/sub.vtt`)**:
  - `src/routes/hls.js:427-504`:
    - Handles both `data:` URIs and remote HTTP upstream fetches with `Referer: https://vsmov.com/`.
    - Strips UTF-8 BOM (`\uFEFF`).
    - Normalizes CRLF/CR to LF (`\n`).
    - Converts comma-delimited SRT timestamps (`00:00:01,000` -> `00:00:01.000`).
    - Prepends `WEBVTT\n\n` header when missing.
    - Sets `Content-Type: text/vtt; charset=utf-8`, `Access-Control-Allow-Origin: *`, and `Cache-Control: public, max-age=86400`.
  - Live fetching of the VSMOV subtitle via `/hls/sub.vtt` returned HTTP 200 with full Vietnamese WebVTT content.

### 1.3 KKPhim Smart Search Fallback & Episode Matching
- **Multi-Tier Fallback Mechanism (`src/providers/kkphim.js:345-389`)**:
  - **Tier 1**: Direct IMDb ID lookup via `https://phimapi.com/imdb/title/:imdbId`.
  - **Tier 2**: Smart search fallback resolving title & aliases via Cinemeta (`resolveCinemeta`), querying `https://phimapi.com/v1/api/tim-kiem?keyword=...`, scoring matches via `scoreMatch(item, title, year, season)`, and selecting the highest scoring slug (`bestScore >= 0.45`).
  - **Tier 3**: Safe degradation returning empty array `[]` when no match is found (zero crashes, zero 404 stream URLs).
- **Flexible Episode Matching (`src/providers/kkphim.js:66-102`)**:
  - Validated matching across `"1"`, `"01"`, `"001"`, `"Tập 1"`, `"Tập 01"`, `"tap-1"`, `"tap-01"`, `"episode-1"`, `ep-1`, and 1-based index fallback.
- **Empirical Execution**:
  - KKPhim for Avengers 3 (`tt5095030`) successfully retrieved 2 active HLS streams via `phimapi.com` without hardcoding.

### 1.4 Master M3U8 Subtitle Tag Injection & TS Segment Proxy
- **Master M3U8 Rewriting (`src/routes/hls.js:300-318`)**:
  - Injects `#EXT-X-MEDIA:TYPE=SUBTITLES,GROUP-ID="subs",NAME="Tiếng Việt (VSMOV VIP)",DEFAULT=YES,AUTOSELECT=YES,FORCED=NO,LANGUAGE="vie",URI="/hls/sub.vtt?url=...&ref=..."` immediately after `#EXTM3U` or `#EXT-X-VERSION`.
  - Appends `,SUBTITLES="subs"` to `#EXT-X-STREAM-INF` lines.
- **TS Segment Streaming (`src/routes/hls.js:330-387`)**:
  - Successfully streamed public Mux TS segment (`1.9 MB > 50 KB`).
  - First byte verified as MPEG-TS sync byte `0x47`.
  - HTTP Range header verified: `Range: bytes=0-511` returned HTTP 206 Partial Content with exactly 512 bytes payload.

### 1.5 Test Suite Execution Results
- `tests/verify_hotfix_vsmov_kkphim.js`: **26/26 assertions PASSED (100% success)**.
- Independent auditor test suite `.agents/teamwork_preview_auditor_m1_1/forensic_check.js`: **26/26 checks PASSED (100% success)**.
- `node --check` syntax verification: 8/8 files passed with 0 errors.

---

## 2. Logic Chain

1. **Premise 1**: Under Development Mode integrity rules, a work product is rejected if it contains hardcoded test results, facade/stub implementations that fake outputs without real computation, or fabricated verification logs.
2. **Observation Step 1**: Static source code scanning across all affected files (`src/providers/vsmov.js`, `src/routes/hls.js`, `src/providers/kkphim.js`, `src/index.js`, `src/handlers.js`) confirmed 0 hardcoded test conditionals, 0 fake streams, and 0 dummy facades.
3. **Observation Step 2**: Live behavioral execution confirmed that VSMOV subtitle extraction connects to real upstream servers, parses HTML/JS player configurations, and proxies subtitles through `/hls/sub.vtt` with valid WebVTT formatting.
4. **Observation Step 3**: Empirical validation confirmed that KKPhim executes real 3-tier fallback lookups (IMDb direct -> Cinemeta title search + `scoreMatch` -> safe `[]` degradation) and matches episodes across multiple naming variations.
5. **Observation Step 4**: Master M3U8 rewriting was directly tested and verified to parse playlist structures, rewrite variant URIs, and inject `#EXT-X-MEDIA:TYPE=SUBTITLES` tags for automatic ExoPlayer/VLC detection.
6. **Observation Step 5**: Binary TS streaming was independently executed and proven to stream genuine MPEG-TS data (>50KB, sync byte `0x47`, HTTP 206 Range support).
7. **Conclusion Step**: Because all 5 forensic requirements operate authentically with genuine network and parsing logic and zero prohibited shortcuts, the work product is rated `CLEAN`.

---

## 3. Caveats

- **Upstream Rate Limiting**: Remote upstream APIs (e.g. `phimapi.com`) may intermittently return HTTP 429 if bombarded with excessive rapid requests during automated testing. The addon implements a 5-second Axios timeout and Tier 3 safe empty array `[]` return to prevent server blocking or crashing during upstream transient rate limits.
- No other caveats.

---

## 4. Conclusion

Hotfix v1.5.2 is a **GENUINE, AUTHENTIC IMPLEMENTATION** that fully satisfies all requirements R1, R2, R3, and R4 of `ORIGINAL_REQUEST.md`.

- **Verdict**: `CLEAN`
- **Integrity Violations Found**: 0
- **Recommendation**: Accept Hotfix v1.5.2 for release.

---

## 5. Verification Method

To independently verify this audit:

```bash
# 1. Syntax check all source and test files
node --check src/index.js
node --check src/routes/hls.js
node --check src/providers/vsmov.js
node --check src/providers/kkphim.js
node --check tests/verify_hotfix_vsmov_kkphim.js

# 2. Run the official hotfix verification suite
node tests/verify_hotfix_vsmov_kkphim.js

# 3. Run the independent auditor forensic suite
node .agents/teamwork_preview_auditor_m1_1/forensic_check.js
```
