# Handoff Report: HLS Proxy Referer Routing Specification (Engine v1.6.0)

**Target File**: `/Users/quan/.gemini/antigravity/scratch/stremio-nguonc-addon/.agents/teamwork_preview_explorer_m1_3/handoff.md`  
**Date**: 2026-08-18T11:45:00+07:00  
**Agent**: Explorer M1_3 (Milestone 1 — Provider Upgrades & HLS Routing)  
**Scope**: `src/routes/hls.js` (HLS Proxy Router & Header Injection)

---

## 1. Observation

Direct empirical observations from inspecting `src/routes/hls.js`, provider implementations, and running the test suites:

### 1.1 `src/routes/hls.js` — Current State
- **File Location**: `/Users/quan/.gemini/antigravity/scratch/stremio-nguonc-addon/src/routes/hls.js`
- **Lines 27–36** currently define `SOURCE_REFERERS`:
  ```javascript
  const SOURCE_REFERERS = [
    { pattern: /kkphimplayer|phim1280|phimapi\.com|kkphim/i, referer: 'https://player.phimapi.com/', origin: 'https://player.phimapi.com' },
    { pattern: /vsmov|streamvsmov|p25\.streamvsmov/i,        referer: 'https://vsmov.com/',           origin: 'https://vsmov.com' },
    { pattern: /nguonc\.com/i,                               referer: 'https://phim.nguonc.com/',     origin: 'https://phim.nguonc.com' },
    { pattern: /streamc\.|amass2\.top/i,                     referer: 'https://embed15.streamc.xyz/', origin: 'https://embed15.streamc.xyz' },
    { pattern: /suutamphim|tvhay/i,                          referer: 'https://suutamphim.org/',      origin: 'https://suutamphim.org' },
    { pattern: /hh3d|hoathinh3d/i,                           referer: 'https://hh3d.tv/',             origin: 'https://hh3d.tv' },
    { pattern: /yanhh3d|yan/i,                               referer: 'https://yanhh3d.org/',         origin: 'https://yanhh3d.org' },
    { pattern: /clbphimxua|clbpx/i,                          referer: 'https://clbphimxua.com/',      origin: 'https://clbphimxua.com' },
  ];
  ```

### 1.2 Referer & Origin Resolution Mechanism (`getRefererHeaders`, lines 43–67)
- **Step 1 (Dynamic Query Override)**: If `refParam` (`req.query.ref` or `req.query.referer`) is present:
  ```javascript
  if (refParam) {
    try {
      let parsedRef = refParam.trim();
      if (!parsedRef.startsWith('http://') && !parsedRef.startsWith('https://')) {
        parsedRef = `https://${parsedRef}`;
      }
      const origin = new URL(parsedRef).origin;
      return { referer: parsedRef, origin };
    } catch {}
  }
  ```
- **Step 2 (Pattern Table Fallback)**: If `refParam` is absent, iterates linearly through `SOURCE_REFERERS`:
  ```javascript
  for (const src of SOURCE_REFERERS) {
    if (src.pattern.test(targetUrl)) {
      return { referer: src.referer, origin: src.origin };
    }
  }
  ```
- **Step 3 (Generic URL Fallback)**: If no pattern matches:
  ```javascript
  try {
    const origin = new URL(targetUrl).origin;
    return { referer: `${origin}/`, origin };
  } catch {
    return { referer: DEFAULT_REFERER, origin: 'https://phim.nguonc.com' };
  }
  ```

### 1.3 Critical Finding: Substring Collision between `yanhh3d` and `hh3d`
Empirical testing revealed:
- `yanhh3d.pw` contains the substring `hh3d`.
- In the original array order, `hh3d` (`/hh3d|hoathinh3d/i`) appeared **before** `yanhh3d` (`/yanhh3d|yan/i`).
- When testing a URL like `https://yanhh3d.pw/stream/master.m3u8` without a query `refParam`, `/hh3d|hoathinh3d/i.test('https://yanhh3d.pw/...')` evaluates to `true`, mistakenly injecting `Referer: https://hh3d.tv/` instead of `https://yanhh3d.pw/`.
- **Solution**: Placing the `yanhh3d` pattern **before** `hh3d` ensures `yanhh3d` URLs match the YAN provider entry first.

### 1.4 Test Suite Baseline Verification
- Command: `node tests/verify_playback.js && node tests/verify_hotfix_vsmov_kkphim.js && node src/test.js`
- Results:
  - `verify_playback.js`: **7/7 PASS (100%)**
  - `verify_hotfix_vsmov_kkphim.js`: **27/27 PASS (100%)**
  - `src/test.js`: **50/50 PASS (100%)**

---

## 2. Logic Chain

1. **Premise 1 (Domain Updates)**:
   - STP provider migrated from `suutamphim.org` to `sieutamphim.pro`.
   - CLBPX provider migrated from `clbphimxua.com` to `clbphimxua.info`.
   - YAN provider migrated from `yanhh3d.org` to `yanhh3d.pw`, with streams served from `yanhh3d.pw`, `fbcdn.cloud` (`scontent-*.fbcdn.cloud`), and `defifa.com`.
2. **Premise 2 (Anti-403 Proxy Protection)**:
   - Upstream CDNs for these providers require valid `Referer` and `Origin` headers to authorize segment downloads and prevent HTTP 403 Forbidden responses.
   - While `manifest.m3u8` rewrites segment URLs with explicit `&ref=${encodedRef}`, direct segment queries, edge proxies, or test tools without `refParam` rely directly on `SOURCE_REFERERS` pattern matching.
3. **Inference 1 (Pattern Mapping)**:
   - `sieutamphim.pro` (STP) mapping:
     `{ pattern: /sieutamphim|suutamphim|tvhay/i, referer: 'https://sieutamphim.pro/', origin: 'https://sieutamphim.pro' }`
   - `clbphimxua.info` (CLBPX) mapping:
     `{ pattern: /clbphimxua|clbpx/i, referer: 'https://clbphimxua.info/', origin: 'https://clbphimxua.info' }`
   - `yanhh3d.pw`, `fbcdn.cloud`, `defifa.com` (YAN) mapping:
     `{ pattern: /yanhh3d|yan|fbcdn\.cloud|defifa\.com/i, referer: 'https://yanhh3d.pw/', origin: 'https://yanhh3d.pw' }`
4. **Inference 2 (Array Precedence & Non-Regression)**:
   - Placing `yanhh3d|yan|fbcdn\.cloud|defifa\.com` before `hh3d|hoathinh3d` eliminates the substring false-positive match, while preserving 100% accurate matching for `hh3d.tv` and `hoathinh3d.com`.
   - Retaining existing entries for `kkphim`, `vsmov`, `nguonc`, `streamc`, and `hh3d` guarantees zero regression across all existing providers and test suites.

---

## 3. Caveats

1. **Third-Party CDN Domain Evolution**: Upstream streaming sources for YAN or STP may add additional CDN mirrors over time (e.g. `abysscdn.com` for STP, or other storage subdomains for YAN). Because providers pass explicit `&ref=${encodeBase64(REFERER_HEADER)}` in their `getStreams()` URLs, `getRefererHeaders()` will primarily use the decoded `refParam`. `SOURCE_REFERERS` serves as the robust fallback safety net.
2. **Strict Read-Only Enforcement**: This specification provides the complete diff and implementation instructions. Per explorer role constraints, source code edits in `src/routes/hls.js` will be applied during the worker phase.

---

## 4. Conclusion & Complete Implementation Specification

### 4.1 Exact Code Changes for `src/routes/hls.js`

#### Location: `src/routes/hls.js`, Lines 27–36

**Before**:
```javascript
const SOURCE_REFERERS = [
  { pattern: /kkphimplayer|phim1280|phimapi\.com|kkphim/i, referer: 'https://player.phimapi.com/', origin: 'https://player.phimapi.com' },
  { pattern: /vsmov|streamvsmov|p25\.streamvsmov/i,        referer: 'https://vsmov.com/',           origin: 'https://vsmov.com' },
  { pattern: /nguonc\.com/i,                               referer: 'https://phim.nguonc.com/',     origin: 'https://phim.nguonc.com' },
  { pattern: /streamc\.|amass2\.top/i,                     referer: 'https://embed15.streamc.xyz/', origin: 'https://embed15.streamc.xyz' },
  { pattern: /suutamphim|tvhay/i,                          referer: 'https://suutamphim.org/',      origin: 'https://suutamphim.org' },
  { pattern: /hh3d|hoathinh3d/i,                           referer: 'https://hh3d.tv/',             origin: 'https://hh3d.tv' },
  { pattern: /yanhh3d|yan/i,                               referer: 'https://yanhh3d.org/',         origin: 'https://yanhh3d.org' },
  { pattern: /clbphimxua|clbpx/i,                          referer: 'https://clbphimxua.com/',      origin: 'https://clbphimxua.com' },
];
```

**After**:
```javascript
const SOURCE_REFERERS = [
  { pattern: /kkphimplayer|phim1280|phimapi\.com|kkphim/i, referer: 'https://player.phimapi.com/', origin: 'https://player.phimapi.com' },
  { pattern: /vsmov|streamvsmov|p25\.streamvsmov/i,        referer: 'https://vsmov.com/',           origin: 'https://vsmov.com' },
  { pattern: /nguonc\.com/i,                               referer: 'https://phim.nguonc.com/',     origin: 'https://phim.nguonc.com' },
  { pattern: /streamc\.|amass2\.top/i,                     referer: 'https://embed15.streamc.xyz/', origin: 'https://embed15.streamc.xyz' },
  { pattern: /sieutamphim|suutamphim|tvhay/i,              referer: 'https://sieutamphim.pro/',     origin: 'https://sieutamphim.pro' },
  { pattern: /yanhh3d|yan|fbcdn\.cloud|defifa\.com/i,      referer: 'https://yanhh3d.pw/',          origin: 'https://yanhh3d.pw' },
  { pattern: /hh3d|hoathinh3d/i,                           referer: 'https://hh3d.tv/',             origin: 'https://hh3d.tv' },
  { pattern: /clbphimxua|clbpx/i,                          referer: 'https://clbphimxua.info/',     origin: 'https://clbphimxua.info' },
];
```

### 4.2 Pattern Verification Matrix

| Target URL | Query `ref` | Expected Referer | Expected Origin | Match Reason |
|---|---|---|---|---|
| `https://sieutamphim.pro/stream/master.m3u8` | none | `https://sieutamphim.pro/` | `https://sieutamphim.pro` | Matches `/sieutamphim/i` in STP rule |
| `https://suutamphim.org/stream/video.ts` | none | `https://sieutamphim.pro/` | `https://sieutamphim.pro` | Backward compatibility with legacy STP |
| `https://clbphimxua.info/tay-du-ky/index.m3u8` | none | `https://clbphimxua.info/` | `https://clbphimxua.info` | Matches `/clbphimxua/i` in CLBPX rule |
| `https://clbphimxua.com/vod/123.m3u8` | none | `https://clbphimxua.info/` | `https://clbphimxua.info` | Backward compatibility with legacy CLBPX |
| `https://yanhh3d.pw/stream/master.m3u8` | none | `https://yanhh3d.pw/` | `https://yanhh3d.pw` | Matches `/yanhh3d/i` before `hh3d` |
| `https://scontent-sin2-9-xx.fbcdn.cloud/.../seg.ts` | none | `https://yanhh3d.pw/` | `https://yanhh3d.pw` | Matches `/fbcdn\.cloud/i` in YAN rule |
| `https://defifa.com/video/stream.m3u8` | none | `https://yanhh3d.pw/` | `https://yanhh3d.pw` | Matches `/defifa\.com/i` in YAN rule |
| `https://hh3d.tv/video/1.m3u8` | none | `https://hh3d.tv/` | `https://hh3d.tv` | Matches `/hh3d/i` in HH3D rule |
| `https://hoathinh3d.com/video/1.m3u8` | none | `https://hh3d.tv/` | `https://hh3d.tv` | Matches `/hoathinh3d/i` in HH3D rule |
| `https://player.phimapi.com/123/manifest.m3u8` | none | `https://player.phimapi.com/` | `https://player.phimapi.com` | Existing KKPhim rule preserved |
| `https://vsmov.com/hls/test.m3u8` | none | `https://vsmov.com/` | `https://vsmov.com` | Existing VSMOV rule preserved |
| `https://phim.nguonc.com/stream.m3u8` | none | `https://phim.nguonc.com/` | `https://phim.nguonc.com` | Existing NguonC rule preserved |
| `https://embed15.streamc.xyz/stream.m3u8` | none | `https://embed15.streamc.xyz/` | `https://embed15.streamc.xyz` | Existing StreamC rule preserved |
| `https://custom-cdn.com/seg.ts` | `https://custom.org/` | `https://custom.org/` | `https://custom.org` | Query parameter override priority |

---

## 5. Verification Method

To independently verify this specification:

1. **Syntax Check**:
   ```bash
   node --check src/routes/hls.js
   ```

2. **Automated Unit Verification of `SOURCE_REFERERS` Routing Logic**:
   ```bash
   node -e "
   const SOURCE_REFERERS = [
     { pattern: /kkphimplayer|phim1280|phimapi\.com|kkphim/i, referer: 'https://player.phimapi.com/', origin: 'https://player.phimapi.com' },
     { pattern: /vsmov|streamvsmov|p25\.streamvsmov/i,        referer: 'https://vsmov.com/',           origin: 'https://vsmov.com' },
     { pattern: /nguonc\.com/i,                               referer: 'https://phim.nguonc.com/',     origin: 'https://phim.nguonc.com' },
     { pattern: /streamc\.|amass2\.top/i,                     referer: 'https://embed15.streamc.xyz/', origin: 'https://embed15.streamc.xyz' },
     { pattern: /sieutamphim|suutamphim|tvhay/i,              referer: 'https://sieutamphim.pro/',     origin: 'https://sieutamphim.pro' },
     { pattern: /yanhh3d|yan|fbcdn\.cloud|defifa\.com/i,      referer: 'https://yanhh3d.pw/',          origin: 'https://yanhh3d.pw' },
     { pattern: /hh3d|hoathinh3d/i,                           referer: 'https://hh3d.tv/',             origin: 'https://hh3d.tv' },
     { pattern: /clbphimxua|clbpx/i,                          referer: 'https://clbphimxua.info/',     origin: 'https://clbphimxua.info' },
   ];

   function getRefererHeaders(targetUrl, refParam) {
     if (refParam) {
       try {
         let parsedRef = refParam.trim();
         if (!parsedRef.startsWith('http://') && !parsedRef.startsWith('https://')) parsedRef = 'https://' + parsedRef;
         return { referer: parsedRef, origin: new URL(parsedRef).origin };
       } catch {}
     }
     for (const src of SOURCE_REFERERS) {
       if (src.pattern.test(targetUrl)) return { referer: src.referer, origin: src.origin };
     }
     try {
       const origin = new URL(targetUrl).origin;
       return { referer: origin + '/', origin };
     } catch {
       return { referer: 'https://phim.nguonc.com/', origin: 'https://phim.nguonc.com' };
     }
   }

   const tests = [
     ['https://sieutamphim.pro/v.m3u8', null, 'https://sieutamphim.pro/'],
     ['https://clbphimxua.info/v.m3u8', null, 'https://clbphimxua.info/'],
     ['https://yanhh3d.pw/v.m3u8', null, 'https://yanhh3d.pw/'],
     ['https://scontent.fbcdn.cloud/v.ts', null, 'https://yanhh3d.pw/'],
     ['https://defifa.com/v.m3u8', null, 'https://yanhh3d.pw/'],
     ['https://hh3d.tv/v.m3u8', null, 'https://hh3d.tv/'],
     ['https://vsmov.com/v.m3u8', null, 'https://vsmov.com/'],
     ['https://player.phimapi.com/v.m3u8', null, 'https://player.phimapi.com/'],
     ['https://phim.nguonc.com/v.m3u8', null, 'https://phim.nguonc.com/'],
     ['https://custom.com/v.ts', 'https://custom.com/play', 'https://custom.com/play'],
   ];

   let allPass = true;
   for (const [url, ref, expected] of tests) {
     const actual = getRefererHeaders(url, ref).referer;
     const ok = actual === expected;
     console.log((ok ? '✅' : '❌') + ' ' + url + ' => ' + actual);
     if (!ok) allPass = false;
   }
   if (!allPass) process.exit(1);
   console.log('🎉 100% ROUTING TESTS PASSED!');
   "
   ```

3. **Regression Test Suites Execution**:
   ```bash
   node tests/verify_playback.js
   node tests/verify_hotfix_vsmov_kkphim.js
   node src/test.js
   ```
   *Expected*: All 3 test suites exit with code 0 (7/7, 27/27, 50/50 PASS).
