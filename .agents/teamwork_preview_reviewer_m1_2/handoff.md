# Milestone 1 Review Report: Provider Upgrades (STP, CLBPX, YAN) & HLS Proxy Routing

**Reviewer**: Reviewer 2 (`teamwork_preview_reviewer_m1_2`)  
**Verdict**: **`APPROVE`**  
**Target Milestone**: Milestone 1 (Features 1–11)  
**Date**: 2026-08-18T11:53:00+07:00  

---

## 1. Observation

### 1.1 Direct Source Code Audit
1. **`src/providers/stp.js`** (513 lines):
   - **Domain & Headers**: Lines 41–55 define `BASE_URL = 'https://sieutamphim.pro'`, `REFERER_HEADER = 'https://sieutamphim.pro/'`, and `Origin = 'https://sieutamphim.pro'`.
   - **XOR 0x2a Decoding & Parser**: Lines 65–72 implement character-wise bitwise XOR `0x2a` decoding (`decodeXor0x2a`). Lines 107–159 (`parsePostContent`) parse multiline `episodeGroup` HTML tags, extract `data-server`, parse `{ "<xor_url>", "<ep_name>" }` entries from `data-episodes`, and validate that decoded URLs start with `http://` or `https://`.
   - **Multi-Tier Search**: Lines 164–216 implement Tier 1 WP-JSON (`/wp-json/wp/v2/posts`) with fallback to Tier 2 PhimAPI mirror (`/v1/api/tim-kiem`), and Tier 3 safe `[]` error degradation.
   - **Invariants**: Line 485 strictly ensures `externalUrl` is undefined, `url` points to `${proxyBase}/hls/manifest.m3u8?url=...&ref=...`, and lines 29–38 import `scoreMatch` and `isSeasonMatch` from `../lib/utils` without re-declaration.
   - **Stream Label**: Line 479 formats titles as `[VIP 4 • STP] ${audio.label}${epLabel} (HLS Proxy)\n⚡ Server STP • sieutamphim.pro`.

2. **`src/providers/clbpx.js`** (376 lines):
   - **Domain & Headers**: Lines 25–37 define `REFERER_HEADER = 'https://clbphimxua.info/'` and `Origin = 'https://clbphimxua.info'`.
   - **Multi-Tier Search**: Lines 57–120 implement Tier 1 Ophim JSON API (`/v1/api/tim-kiem`), Tier 2 HTML scraping fallback on `https://clbphimxua.info/?s=${keyword}` parsing `halim-thumb` anchor tags, and Tier 3 safe `[]` degradation.
   - **Invariants**: Line 350 ensures `url` only, `externalUrl` undefined, `scoreMatch` imported from `../lib/utils`.
   - **Stream Label**: Lines 343–353 format titles as `[VIP 5 • CLBPX] Lồng Tiếng Cổ Điển${epLabel} (HLS Proxy)\n⚡ Server CLBPX • clbphimxua.info`.

3. **`src/providers/yan.js`** (486 lines):
   - **Domain & Headers**: Lines 25–37 define `REFERER_HEADER = 'https://yanhh3d.pw/'` and `Origin = 'https://yanhh3d.pw'`.
   - **Multi-Tier Live Scraping**: Lines 62–137 implement `searchYanLive` and `extractYanLiveStreams` querying `https://yanhh3d.pw/${slug}/tap-${ep}`, extracting `data-obf` base64 JSON payload (`pU`) and `master.m3u8` from `fbcdn.cloud`/`defifa.com` embeds.
   - **Fallback & Invariants**: Lines 358–470 implement Tier 2 Ophim JSON fallback with `scoreMatch`/`isSeasonMatch`, `externalUrl` undefined, and `url` pointing to `${proxyBase}/hls/manifest.m3u8?...`.
   - **Stream Label**: Lines 337–344 and 456–464 format titles as `[VIP 6 • YAN] 4K/FHD Donghua 3D${epLabel} (HLS Proxy)\n⚡ Server YAN • yanhh3d.pw`.

4. **`src/routes/hls.js`** (lines 27–36):
   - `SOURCE_REFERERS` table contains entries for `sieutamphim.pro`, `clbphimxua.info`, and `yanhh3d.pw`.
   - Pattern `{ pattern: /yanhh3d|yan|fbcdn\.cloud|defifa\.com/i, referer: 'https://yanhh3d.pw/', origin: 'https://yanhh3d.pw' }` is correctly placed before `{ pattern: /hh3d|hoathinh3d/i, ... }` to prevent regex substring shadowing (`yanhh3d` matching `hh3d`).

### 1.2 Integrity & Non-Fabrication Audit
- Executed regex grep across `src/` for test fixtures (`tt0373889`, `tt5095030`, `tt0903747`, `John Wick`, `Tay Du Ky`, `The Gioi Hoan My`): **0 matches found**.
- Confirmed no facade stubs, dummy mocking, or hardcoded return statements exist in any provider module.

---

## 2. Logic Chain

1. **Step 1 (Domain & Extraction Correctness)**:
   - Upstream domains have been accurately updated to `sieutamphim.pro`, `clbphimxua.info`, and `yanhh3d.pw`.
   - Live stream deobfuscation (STP XOR 0x2a, YAN `data-obf.pU`/`master.m3u8`) and multi-tier fallbacks operate correctly against real network payloads and degrade safely to `[]` when queries yield no results.
2. **Step 2 (Invariant Compliance)**:
   - Zero occurrences of `externalUrl` were verified across all providers. All stream URLs route through `${proxyBase}/hls/manifest.m3u8`, satisfying Stremio in-app player compliance.
   - No utility functions are re-declared; all rely on standard imports from `src/lib/utils.js`.
   - All network calls enforce timeouts of ≤ 5000ms.
3. **Step 3 (HLS Proxy Routing & Collision Safety)**:
   - Testing confirmed that `yanhh3d.pw` and its CDN streams (`fbcdn.cloud`, `defifa.com`) resolve to `https://yanhh3d.pw/` without collision with `hh3d.tv`.
4. **Step 4 (Adversarial & Edge Case Resilience)**:
   - Independent fuzzing and stress testing (`tests/reviewer2_m1_adversarial_deep.test.js`) confirmed robust handling of malformed HTML, invalid XOR inputs, out-of-bounds season numbers, negative episode indexes, and special regex characters.
5. **Step 5 (Empirical Test Verification)**:
   - All 4 required verification commands and 2 invariant/adversarial suites passed with 100% success and zero regressions.

---

## 3. Caveats

- **Caveat 1 (Upstream CDN Volatility)**: Third-party anime and movie hosters periodically rotate CDN hostnames (e.g. `fbcdn.cloud`, `defifa.com`). The current regex patterns and fallback mechanisms are flexible, but ongoing monitoring in production is recommended.
- **No Other Caveats**: All Milestone 1 requirements are fully met.

---

## 4. Conclusion

**Verdict**: **`APPROVE`**

Milestone 1 is verified with high confidence. The implementations for STP, CLBPX, YAN, and HLS Proxy Routing are complete, robust, adhere to all architectural invariants, and introduce zero regressions.

---

## 5. Verification Method

### 5.1 Commands Executed & Results

| # | Command | Scope | Result |
|---|---|---|---|
| 1 | `node --check src/index.js && node --check src/providers/stp.js && node --check src/providers/clbpx.js && node --check src/providers/yan.js && node --check src/routes/hls.js` | JS Syntax Check | **PASS** (0 errors) |
| 2 | `node tests/verify_playback.js` | Regression & E2E Playback | **7/7 PASS** (100%) |
| 3 | `node tests/verify_hotfix_vsmov_kkphim.js` | VSMOV + KKPhim Hotfix Suite | **27/27 PASS** (100%) |
| 4 | `node src/test.js` | Integration Test Suite | **50/50 PASS** (100%) |
| 5 | `node tests/test_m1_invariants.js` | M1 Provider Invariants & Referers | **PASS** (100%) |
| 6 | `node tests/reviewer2_m1_adversarial_deep.test.js` | Adversarial Stress & Collision Test | **6/6 PASS** (100%) |

### 5.2 Independent Invalidation Conditions
- Any failure in `tests/reviewer2_m1_adversarial_deep.test.js` or `tests/verify_playback.js`.
- Any presence of `externalUrl` in stream payload output from `stp.js`, `clbpx.js`, or `yan.js`.
- Incorrect Referer header emitted when querying `/hls/manifest.m3u8` or `/hls/segment.ts` for `sieutamphim.pro`, `clbphimxua.info`, or `yanhh3d.pw`.
