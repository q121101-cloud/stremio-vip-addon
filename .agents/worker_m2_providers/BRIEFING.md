# BRIEFING — 2026-08-17T15:05:00Z

## Mission
Implement/Update all modules in `src/providers/` (VSMOV, KKPhim, NguonC, STP, HH3D, YAN, CLBPX) per Requirement R2: official APIs, 4K CDN / stream extraction, standard interface `{ id, label, getCatalog, getStreams }`, HLS proxy wrapping, strict zero `externalUrl` invariant, syntax verification, and test suites.

## 🔒 My Identity
- Archetype: Implementer & QA
- Roles: implementer, qa, specialist
- Working directory: /Users/quan/.gemini/antigravity/scratch/stremio-nguonc-addon/.agents/worker_m2_providers
- Original parent: 16f3f43b-5ffd-45ef-8c8d-b97bd3b2f2fc
- Milestone: Milestone 2 (Multi-Provider Architecture)

## 🔒 Key Constraints
- STRICT INVARIANT: Remove ALL `externalUrl` fallback properties from all stream objects returned by providers. In-app streams must contain `url` only.
- Implement genuine logic — DO NOT CHEAT, no fake/dummy implementations.
- Standard interface across all providers: `{ id, label, getCatalog, getStreams }`.
- Verify syntax with `node --check src/providers/*.js`.
- Write unit tests for all providers and verify with `node tests/verify_playback.js`.

## Current Parent
- Conversation ID: 16f3f43b-5ffd-45ef-8c8d-b97bd3b2f2fc
- Updated: 2026-08-17T15:05:00Z

## Task Summary
- **What to build**:
  1. `src/providers/vsmov.js`: Official API integration (`https://vsmov.com/api`), direct IMDb/TMDB/keyword lookup, master 4K extraction from `*.streamvsmov.com` with `Referer: https://vsmov.com/`, HLS proxy wrapping, VIP titles `[VIP 1 • VSMOV] Master 4K Ultra HD (3840x2160) (HLS Proxy)` / `[VIP 1 • VSMOV] Thuyết Minh Full HD (HLS Proxy)`, remove all `externalUrl`.
  2. `src/providers/kkphim.js`: Official API (`https://phimapi.com`), direct IMDb lookup (`/imdb/title/${imdbId}`) + fallback search, Vietsub / Thuyết Minh / Lồng Tiếng servers, titles `[VIP 2 • KKPhim] Vietsub Full HD (HLS Proxy)` / `[VIP 2 • KKPhim] Thuyết Minh Full HD (HLS Proxy)`, remove all `externalUrl`.
  3. `src/providers/nguonc.js`: Official API (`https://phim.nguonc.com/api`), extract StreamC embed/m3u8 with `Referer: https://embed15.streamc.xyz/`, title `[VIP 3 • NguonC] Vietsub / Thuyết Minh (HLS Proxy)`, remove all `externalUrl`.
  4. Specialized providers:
     - `src/providers/stp.js`: Western Cinema & K-Drama (`suutamphim.org` / `tvhay`).
     - `src/providers/hh3d.js`: 3D Donghua (Perfect World, Swallowed Star, Battle Through the Heavens).
     - `src/providers/yan.js`: 3D Donghua & ongoing anime.
     - `src/providers/clbpx.js`: Classic Wuxia / Kim Dung & TVB.
     Each provider exports `{ id, label, getCatalog, getStreams }` with graceful error handling and zero `externalUrl`.
  5. Comprehensive test suite for all providers & verify with `node tests/verify_playback.js`.
- **Success criteria**: All providers implemented, syntax check passes, zero `externalUrl` in-app streams, all tests pass.

## Key Decisions Made
- Use official APIs discovered in `spec_miner_apis/handoff.md` with base64url HLS proxy encapsulation.
- Ensure all 7 providers export standard interface `{ id, label, getCatalog, getStreams }`.

## Artifact Index
- `.agents/worker_m2_providers/DISPATCH.md` — Dispatch requirements
- `.agents/worker_m2_providers/BRIEFING.md` — Agent state & mission
- `src/providers/vsmov.js` — VSMOV 4K Engine
- `src/providers/kkphim.js` — KKPhim Engine
- `src/providers/nguonc.js` — NguonC Engine
- `src/providers/stp.js` — STP Specialized Provider
- `src/providers/hh3d.js` — HH3D Specialized Provider
- `src/providers/yan.js` — YAN Specialized Provider
- `src/providers/clbpx.js` — CLBPX Specialized Provider
