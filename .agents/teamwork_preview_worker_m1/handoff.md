# Milestone 1 Handoff Report: Provider Upgrades (STP, CLBPX, YAN) & HLS Proxy Routing (Engine v1.6.0)

**Author**: Worker M1 (`teamwork_preview_worker_m1`)  
**Date**: 2026-08-18T11:50:00+07:00  
**Scope**: `src/providers/stp.js`, `src/providers/clbpx.js`, `src/providers/yan.js`, `src/routes/hls.js`

---

## 1. Observation

### 1.1 Files Modified and Line Details
1. **`src/providers/stp.js`** (596 lines):
   - **Domain & Headers** (lines 126–139):
     - `BASE_URL`: `'https://sieutamphim.pro'`
     - `REFERER_HEADER`: `'https://sieutamphim.pro/'`
     - `Origin`: `'https://sieutamphim.pro'`
   - **XOR 0x2a Deobfuscation & Robust Multiline HTML Parser** (lines 149–239):
     - Function `decodeXor0x2a(str, key = 0x2a)` decodes character-wise XOR obfuscated stream URLs (e.g., `"B^^ZY..."` -> `"https://short.ink/_LboFywW3"`).
     - Function `parsePostContent(html, postTitle)` parses multiline `episodeGroup` HTML tags, extracts `data-server`, and parses `{ "<xor_url>", "<ep_name>" }` entries from `data-episodes`.
   - **Stream Extraction & Labeling** (lines 412–581):
     - Stream title format: `[VIP 4 • STP] ${audio.label}${epLabel} (HLS Proxy)\n⚡ Server STP • sieutamphim.pro`
     - Multi-tier search: Tier 1 WP-JSON (`/wp-json/wp/v2/posts`) -> Tier 2 PhimAPI mirror -> Tier 3 safe `[]`.
   - **Invariants**:
     - `externalUrl` is undefined (strictly prohibited).
     - `url` points to `${proxyBase}/hls/manifest.m3u8?url=${encodeBase64(streamUrl)}&ref=${b64Ref}`.
     - `scoreMatch` is imported directly from `../lib/utils`.

2. **`src/providers/clbpx.js`** (517 lines):
   - **Domain & Headers** (lines 166–177):
     - `REFERER_HEADER`: `'https://clbphimxua.info/'`
     - `Origin`: `'https://clbphimxua.info'`
   - **Multi-Tier Search & Extraction** (lines 197–260, 346–507):
     - Tier 1: Ophim JSON API (`/v1/api/tim-kiem`, `/phim/${slug}`)
     - Tier 2: HTML scrape fallback on `https://clbphimxua.info/?s=${keyword}` parsing `halim-thumb` cards.
     - Tier 3: Safe `[]` degradation on errors.
   - **Stream Labeling & Invariants** (lines 481–500):
     - Stream title format: `[VIP 5 • CLBPX] Lồng Tiếng Cổ Điển${epLabel} (HLS Proxy)\n⚡ Server CLBPX • clbphimxua.info`
     - `externalUrl` is undefined (strictly prohibited).
     - `url` points to `${proxyBase}/hls/manifest.m3u8?url=...&ref=...`.
     - `scoreMatch` imported from `../lib/utils`.

3. **`src/providers/yan.js`** (1009 lines):
   - **Domain & Headers** (lines 549–560):
     - `REFERER_HEADER`: `'https://yanhh3d.pw/'`
     - `Origin`: `'https://yanhh3d.pw'`
   - **Multi-Tier Live Scraping & Extraction** (lines 583–660, 790–999):
     - Tier 1: Direct live scraping on `https://yanhh3d.pw/search` and `/${slug}/tap-${ep}` parsing `sv_LINK*` embeds for base64 `data-obf.pU` and `master.m3u8` URLs.
     - Tier 2: Ophim JSON fallback (`/v1/api/tim-kiem`, `/phim/${slug}`).
     - Tier 3: Safe `[]` degradation on errors.
   - **Stream Labeling & Invariants** (lines 860–874, 978–992):
     - Stream title format: `[VIP 6 • YAN] 4K/FHD Donghua 3D${epLabel} (HLS Proxy)\n⚡ Server YAN • yanhh3d.pw`
     - `externalUrl` is undefined (strictly prohibited).
     - `url` points to `${proxyBase}/hls/manifest.m3u8?url=...&ref=...`.
     - `scoreMatch` imported from `../lib/utils`.

4. **`src/routes/hls.js`** (lines 27–36):
   - Updated `SOURCE_REFERERS` table:
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
   - Placed `yanhh3d|yan|fbcdn\.cloud|defifa\.com` before `hh3d|hoathinh3d` to resolve the substring collision where `yanhh3d` matches `hh3d`.

---

## 2. Logic Chain

1. **Premise 1 (Domain Migration & Specification)**:
   - Upstream domains for STP (`suutamphim.org` -> `sieutamphim.pro`), CLBPX (`clbphimxua.com` -> `clbphimxua.info`), and YAN (`yanhh3d.org` -> `yanhh3d.pw`) have changed.
   - Provider modules must use live endpoints with corresponding `Referer` and `Origin` headers.
2. **Premise 2 (Stream Extraction Strategies)**:
   - STP uses WordPress REST API + XOR `0x2a` decoding for embedded player links, falling back to mirror endpoints.
   - CLBPX uses classic Ophim endpoints with direct HTML search card scraping fallback.
   - YAN uses live DOM scraping for `data-obf.pU` and `master.m3u8` from `fbcdn.cloud`/`defifa.com` sources with Ophim fallback.
   - All network calls apply a 5000ms timeout with safe `[]` error trapping, preventing aggregator freezes.
3. **Premise 3 (In-App Stremio Player Compatibility)**:
   - Omitting `externalUrl` and routing all playback exclusively through `${proxyBase}/hls/manifest.m3u8` ensures native in-app playback across desktop, Android TV, and Web without triggering external browser prompts.
4. **Premise 4 (HLS Referer Route Ordering)**:
   - Because `yanhh3d` contains `hh3d`, ordering `yanhh3d` ahead of `hh3d` in `SOURCE_REFERERS` guarantees correct referer injection (`https://yanhh3d.pw/`) for YAN CDN segments while preserving `https://hh3d.tv/` for HH3D.
5. **Conclusion**:
   - All Milestone 1 requirements and interface contracts are fulfilled with zero regression across all test suites.

---

## 3. Caveats

- **Upstream CDN Dynamic Tokens**: YAN live stream URLs (`pU`) embed timestamped auth tokens (`?t=<hash>.<timestamp>`). Because `getStreams()` generates fresh URLs on user request, tokens are valid at playback time.
- **Third-Party CDN Variations**: Upstream CDNs for STP/YAN occasionally serve segment binaries with image headers (e.g. `.png` wrappers containing MPEG-TS payloads). The HLS Proxy router correctly pipes binary streams and forward Range headers to support seek operations.
- **No Other Caveats**: All changes are self-contained in the 4 designated files.

---

## 4. Conclusion

Milestone 1 is complete:
- `src/providers/stp.js`, `src/providers/clbpx.js`, `src/providers/yan.js`, and `src/routes/hls.js` have been upgraded to Engine v1.6.0 specifications.
- All brand labels, domains, headers, multi-tier extraction strategies, and strict invariants (`url` only, zero `externalUrl`, `scoreMatch` import) are active.
- All syntax checks pass, and 100% of integration and regression tests pass without errors.

---

## 5. Verification Method

### 5.1 Verification Commands
Execute the following verification commands from the project root:

```bash
# 1. Syntax checks
node --check src/index.js
node --check src/providers/stp.js
node --check src/providers/clbpx.js
node --check src/providers/yan.js
node --check src/routes/hls.js

# 2. Invariant & Provider Unit Suite
node tests/test_m1_invariants.js

# 3. Existing Verification & Regression Test Suites
node tests/verify_playback.js
node tests/verify_hotfix_vsmov_kkphim.js
node src/test.js
```

### 5.2 Verification Results Summary
- `node --check` across all 5 files: **0 errors (PASS)**
- `tests/test_m1_invariants.js`: **100% PASS (STP, CLBPX, YAN, HLS Referers)**
- `tests/verify_playback.js`: **7/7 PASS (100%)**
- `tests/verify_hotfix_vsmov_kkphim.js`: **27/27 PASS (100%)**
- `src/test.js`: **50/50 PASS (100%)**
