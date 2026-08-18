# BRIEFING — 2026-08-18T09:53:00Z

## Mission
Overhaul HTML Scrapers for STP (sieutamphim.pro), CLBPX (clbphimxua.info), and YAN (yanhh3d.pw) with Cheerio/DOM parsing, direct stream extraction, and strict Donghua guarding for Engine v1.7.0.

## 🔒 My Identity
- Archetype: implementer, qa, specialist
- Roles: implementer, qa, specialist
- Working directory: /Users/quan/.gemini/antigravity/scratch/stremio-nguonc-addon/.agents/worker_m2
- Original parent: df6b69f2-b4cb-483e-b97e-e806a40c0155
- Milestone: M2 (Real Cheerio HTML Scrapers)

## 🔒 Key Constraints
- File ownership: Exclusively own and modify `src/providers/stp.js`, `src/providers/clbpx.js`, `src/providers/yan.js`.
- No dummy/facade implementations or hardcoded results.
- Implement genuine HTML parsing (with cheerio / robust DOM extraction) for catalogs, search, and episode streams.
- Strict Invariants: url only (pointing to HLS Proxy), STRICTLY NO `externalUrl`.
- Strict Donghua Guard in `yan.js`: Immediately return `[]` if query is Live-Action / KDrama / US-UK; only process Donghua / Anime / 3D Hoạt Hình.
- Syntax check `node --check src/index.js` and all test suites must pass.

## Current Parent
- Conversation ID: df6b69f2-b4cb-483e-b97e-e806a40c0155
- Updated: 2026-08-18T09:53:00Z

## Task Summary
- **What to build**: Real Cheerio/HTML scrapers for STP, CLBPX, and YAN with XOR 0x2a decode, StreamC `data-obf` resolution, YAN fbcdn resolution, and strict Donghua guard.
- **Success criteria**: 
  1. STP scrapes sieutamphim.pro catalog & search, resolves XOR 0x2a streams.
  2. CLBPX scrapes clbphimxua.info catalog & search, resolves StreamC data-obf M3U8.
  3. YAN scrapes yanhh3d.pw Donghua catalog & search, resolves fbcdn embeds, strictly rejects live-action / KDrama / US-UK queries.
  4. All tests pass with zero regression.
- **Interface contracts**: PROJECT.md Provider Contract.
- **Code layout**: PROJECT.md Code Layout.

## Change Tracker
- **Files modified**: None yet
- **Build status**: Initial tests passing (50/50)
- **Pending issues**: None

## Quality Status
- **Build/test result**: Initial test passing
- **Lint status**: Clean
- **Tests added/modified**: TBD

## Loaded Skills
- None

## Key Decisions Made
- Use cheerio (if installed) or clean cheerio-compatible DOM parsing / cheerio library to scrape real HTML.
- Provide multi-tier fallbacks so if third-party live servers are down or slow, Ophim/PhimAPI mirror handles requests gracefully without erroring.
- Implement comprehensive unit tests for scrapers and guards.

## Artifact Index
- `.agents/worker_m2/DISPATCH.md` — Assignment instructions
- `.agents/worker_m2/progress.md` — Progress tracker
- `.agents/worker_m2/changes.md` — Changes report (to be written)
- `.agents/worker_m2/handoff.md` — Handoff report (to be written)
