# BRIEFING — 2026-08-17T22:28:45+07:00

## Mission
Implement/Update all stream provider modules in `src/providers/` (VSMOV, KKPhim, NguonC, STP, HH3D, YAN, CLBPX) meeting Requirement R2, strict HLS proxy formatting, zero externalUrl invariant, full unit test suite, and playback verification.

## 🔒 My Identity
- Archetype: worker
- Roles: implementer, qa, specialist
- Working directory: /Users/quan/.gemini/antigravity/scratch/stremio-nguonc-addon/.agents/worker_m2_providers_2
- Original parent: 16f3f43b-5ffd-45ef-8c8d-b97bd3b2f2fc
- Milestone: Milestone 2 (Multi-Provider Implementation)

## 🔒 Key Constraints
- Genuine implementation, no cheating or hardcoded dummy responses.
- Implement official APIs and matching logic.
- STRICT INVARIANT: Remove ALL `externalUrl` fallback properties.
- Wrap streams through HLS proxy format `${proxyBase}/hls/manifest.m3u8?url=...&ref=...` where referer/header proxying is needed.
- Export standard interface `{ id, label, getCatalog, getStreams }` across all providers.
- Pass syntax check `node --check src/providers/*.js` and test verification `node tests/verify_playback.js`.

## Current Parent
- Conversation ID: 16f3f43b-5ffd-45ef-8c8d-b97bd3b2f2fc
- Updated: 2026-08-17T22:28:45+07:00

## Task Summary
- **What to build**: Full implementation of all 7 providers (`vsmov.js`, `kkphim.js`, `nguonc.js`, `stp.js`, `hh3d.js`, `yan.js`, `clbpx.js`) and tests.
- **Success criteria**: All providers implemented, correctly typed/syntax-checked, properly formatted stream URLs and titles, verified with test suite.
- **Interface contracts**: Standard provider interface `{ id, label, getCatalog, getStreams }`.

## Key Decisions Made
- Maintained strict Stremio in-app player protocol exclusivity (`url` only, 0 `externalUrl` fallback properties across all 7 providers).
- Implemented `escapeRegExp` and safe delimiter-based regex matching `(^|[^0-9a-zA-Z])targetEp([^0-9a-zA-Z]|$)` across all 7 providers to prevent adversarial regex bombs and protect against out-of-bounds/negative episode bugs.
- Formatted VIP badges uniformly:
  - VSMOV: `[VIP 1 • VSMOV] Master 4K Ultra HD (3840x2160)${epLabel} (HLS Proxy)`
  - KKPhim: `[VIP 2 • KKPhim] Vietsub Full HD${epLabel} (HLS Proxy)` / `[VIP 2 • KKPhim] Thuyết Minh Full HD${epLabel} (HLS Proxy)`
  - NguonC: `[VIP 3 • NguonC] Vietsub Full HD${epLabel} (HLS Proxy)` / `[VIP 3 • NguonC] Thuyết Minh Full HD${epLabel} (HLS Proxy)`
  - STP: `[VIP • STP] Vietsub Full HD${epLabel} (HLS Proxy)`
  - HH3D: `[VIP • HH3D] 3D Donghua Full HD${epLabel} (HLS Proxy)`
  - YAN: `[VIP • YAN] Vietsub Full HD${epLabel} (HLS Proxy)`
  - CLBPX: `[VIP • CLBPX] Lồng Tiếng TVB / Kim Dung${epLabel} (HLS Proxy)`

## Change Tracker
- **Files modified**:
  - `src/providers/vsmov.js`: Added escapeRegExp, regex delimiter matching, out-of-bounds check.
  - `src/providers/kkphim.js`: Added escapeRegExp, regex delimiter matching, out-of-bounds check, clean server names.
  - `src/providers/nguonc.js`: Added escapeRegExp, regex delimiter matching, out-of-bounds check, clean server names.
  - `src/providers/stp.js`: Added escapeRegExp, regex delimiter matching, out-of-bounds check, clean server names.
  - `src/providers/hh3d.js`: Added escapeRegExp, regex delimiter matching, out-of-bounds check, clean server names.
  - `src/providers/yan.js`: Added escapeRegExp, regex delimiter matching, out-of-bounds check, clean server names.
  - `src/providers/clbpx.js`: Added escapeRegExp, regex delimiter matching, out-of-bounds check, clean server names.
  - `src/index.js`: Safe server listen condition (`require.main === module`).
  - `src/test.js`: Ephemeral server auto-launch, updated v1.5.0 manifest and resource structure assertions.
  - `tests/m2_providers.test.js`: Added 9 comprehensive test suites (53 assertions).
- **Build status**: PASS (100%)
- **Pending issues**: None

## Quality Status
- **Build/test result**:
  - `node --check src/providers/*.js`: PASS (0 errors)
  - `node tests/m2_providers.test.js`: PASS (53 / 53 passed)
  - `node tests/verify_playback.js`: PASS (6 / 6 phases passed, 3.42MB binary chunk verified)
  - `npm test`: PASS (50 / 50 passed)
  - `node tests/challenger_m1_adversarial.test.js`: PASS (23 / 23 passed)
  - `node tests/m2_challenger2_hls_empirical.test.js`: PASS (18 / 18 passed)
  - `node tests/challenger_m3_2_concurrency_and_edge.test.js`: PASS (17 / 17 passed)
  - `node tests/empirical_m2_reviewer2.test.js`: PASS (15 / 15 passed)
- **Lint status**: Clean
- **Tests added/modified**: `tests/m2_providers.test.js` updated with 53 comprehensive unit and integration tests.

## Loaded Skills
- None
