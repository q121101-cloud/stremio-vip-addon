# Soft Handoff — Orchestrator 1 (Gen 1) -> Successor (Gen 2)

## 1. Observation
### Completed Work
- **Survey Phase**: 3 parallel Explorers probed codebase and live endpoints for `sieutamphim.pro` (WordPress REST API + XOR 0x2a decode), `clbphimxua.info` (Ophim + HTML search), `yanhh3d.pw` (direct live scraping with `data-obf.pU` and `master.m3u8` from `fbcdn.cloud`), HLS Proxy routing in `src/routes/hls.js`, and existing test suites.
- **Milestone 1 (DONE & GATE PASSED)**:
  - `src/providers/stp.js`: Updated to `https://sieutamphim.pro`, referer headers, label `[VIP 4 • STP] Thuyết Minh HD (HLS Proxy)\n⚡ Server STP • sieutamphim.pro`, XOR 0x2a decoding, multi-tier fallback, zero `externalUrl`, `scoreMatch` import.
  - `src/providers/clbpx.js`: Updated to `https://clbphimxua.info`, referer headers, label `[VIP 5 • CLBPX] Lồng Tiếng Cổ Điển (HLS Proxy)\n⚡ Server CLBPX • clbphimxua.info`, multi-tier fallback, zero `externalUrl`, `scoreMatch` import.
  - `src/providers/yan.js`: Updated to `https://yanhh3d.pw`, referer headers, label `[VIP 6 • YAN] 4K/FHD Donghua 3D (HLS Proxy)\n⚡ Server YAN • yanhh3d.pw`, live stream scraping + Ophim fallback, zero `externalUrl`, `scoreMatch` import.
  - `src/routes/hls.js`: `SOURCE_REFERERS` updated with `sieutamphim.pro`, `clbphimxua.info`, and `yanhh3d.pw` (with priority order before `hh3d`).
  - Passed all Reviews (2/2 APPROVE), Challenges (2/2 APPROVE), and Forensic Audit (CLEAN).
- **Milestone 2 (DONE & GATE PASSED)**:
  - Created `tests/verify_new_providers.js` covering all 6 phases: Server lifecycle (port 0), Provider checks (STP, CLBPX, YAN), Manifest proxy route rewriting, Stream aggregator safety, TS segment binary inspection (size > 10KB, sync byte 0x47), Range 206 seeking.
  - Passed 26/26 assertions. Zero regressions: `tests/verify_playback.js` (7/7 PASS), `tests/verify_hotfix_vsmov_kkphim.js` (27/27 PASS), `src/test.js` (50/50 PASS).
  - Passed all Reviews (2/2 APPROVE), Challenges (2/2 APPROVE), and Forensic Audit (CLEAN).

---

## 2. Logic Chain & Milestone State
- Milestone 1: **DONE** (Gate PASS)
- Milestone 2: **DONE** (Gate PASS)
- Milestone 3: **IN_PROGRESS / PLANNED** (Version Bump & Git Deploy)

### Remaining Work for Milestone 3
1. **Version Bump to `1.6.0`**:
   - `package.json`: `"version": "1.6.0"`
   - `src/manifest.js`: `version: '1.6.0'` and docstring comment
   - `src/handlers.js`: footer string `VIP Movies Addon v1.6.0 • Designed with Taste by <span class="brand-highlight">Q121101</span>` and header badge `v1.6.0`
   - `src/index.js`, `src/config.js`, `src/routes/hls.js`: version comments if applicable
2. **Execute Full Verification**:
   - `node --check src/index.js`
   - `node tests/verify_new_providers.js` (must PASS 100%)
   - `node tests/verify_playback.js` (must PASS 7/7)
   - `node tests/verify_hotfix_vsmov_kkphim.js` (must PASS 27/27)
   - `node src/test.js` (must PASS 50/50)
3. **GitHub Deployment**:
   ```bash
   git remote set-url origin https://<GITHUB_TOKEN>@github.com/q121101-cloud/stremio-vip-addon.git
   git add . && git commit -m "Engine v1.6.0: Updated STP/CLBPX/YAN domains + HLS Proxy routing + E2E tests + Zero-Regression Guard"
   git push origin main
   git remote set-url origin https://github.com/q121101-cloud/stremio-vip-addon.git
   ```
4. **Final Verification & Parent Notification**:
   - Verify push success and report completion to parent (`d620d435-7bc5-411f-9cdf-e91d2c308e36`).

---

## 3. Caveats & Invariants
- Do not write source code or run commands directly — delegate M3 implementation/git operations to a Worker, followed by Reviewer / Auditor verification.
- Parent Conversation ID for reporting: `d620d435-7bc5-411f-9cdf-e91d2c308e36`.
- Keep BRIEFING.md and progress.md up to date.

---

## 4. Key Artifacts
- `/Users/quan/.gemini/antigravity/scratch/stremio-nguonc-addon/.agents/ORIGINAL_REQUEST.md`
- `/Users/quan/.gemini/antigravity/scratch/stremio-nguonc-addon/PROJECT.md`
- `/Users/quan/.gemini/antigravity/scratch/stremio-nguonc-addon/.agents/orchestrator_1/GATE_STATUS.md`
- `/Users/quan/.gemini/antigravity/scratch/stremio-nguonc-addon/.agents/orchestrator_1/progress.md`
- `/Users/quan/.gemini/antigravity/scratch/stremio-nguonc-addon/.agents/orchestrator_1/BRIEFING.md`
