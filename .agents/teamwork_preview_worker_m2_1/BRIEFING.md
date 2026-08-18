# BRIEFING — 2026-08-18T03:38:25Z

## Mission
Implement Milestone 2: KKPhim Smart Search Fallback against 404s for Hotfix v1.5.2 in `src/providers/kkphim.js`.

## 🔒 My Identity
- Archetype: worker
- Roles: implementer, qa, specialist
- Working directory: /Users/quan/.gemini/antigravity/scratch/stremio-nguonc-addon/.agents/teamwork_preview_worker_m2_1
- Original parent: 0a580561-bdd3-4e10-9471-a5f9975ae400
- Milestone: Milestone 2: KKPhim Smart Search Fallback against 404s

## 🔒 Key Constraints
- Exclusively own and modify: `src/providers/kkphim.js`
- 3-Tier lookup: Tier 1 (IMDb ID direct lookup via phimapi.com/imdb/title/:imdbId with LRU cache), Tier 2 (Cinemeta metadata + /v1/api/tim-kiem search + scoreMatch scoring + /phim/:slug detail fetch + cache IMDb->slug), Tier 3 (safe empty array []).
- Flexible episode matching `matchEpisodeItem` (exact, zero-padded, "Tập X", "tap-X", regex number extraction, 1-based index fallback).
- Genuine implementation, no cheating or hardcoding test results.

## Current Parent
- Conversation ID: 0a580561-bdd3-4e10-9471-a5f9975ae400
- Updated: 2026-08-18T03:38:25Z

## Task Summary
- **What to build**: Smart search fallback and flexible episode matching for KKPhim provider (`src/providers/kkphim.js`).
- **Success criteria**:
  - `node --check src/providers/kkphim.js` passes.
  - Quick probe on known IMDb IDs (e.g., `tt5095030`, `tt0903747`) yields valid streams without 404.
  - Tests pass with no regressions.
- **Interface contracts**: PROJECT.md
- **Code layout**: `src/providers/kkphim.js`

## Change Tracker
- **Files modified**: [TBD]
- **Build status**: [TBD]
- **Pending issues**: None

## Quality Status
- **Build/test result**: [TBD]
- **Lint status**: [TBD]
- **Tests added/modified**: [TBD]

## Loaded Skills
- None

## Key Decisions Made
- [TBD]

## Artifact Index
- `/Users/quan/.gemini/antigravity/scratch/stremio-nguonc-addon/.agents/teamwork_preview_worker_m2_1/handoff.md`
