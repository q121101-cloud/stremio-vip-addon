# BRIEFING — 2026-08-17T03:24:40Z

## Mission
Enhance KKPhim, NguonC, and VsMov providers with 5-second timeouts, isolated error handling, Cinemeta canonical title/year search matching, and R3-compliant Stremio stream formatting (HLS Proxy `url` vs Embed Player `externalUrl`).

## 🔒 My Identity
- Archetype: implementer
- Roles: implementer, qa, specialist
- Working directory: /Users/quan/.gemini/antigravity/scratch/stremio-nguonc-addon/.agents/teamwork_preview_worker_m2
- Original parent: 681a8264-75a0-4d5c-84e1-8e78b180494b
- Milestone: M2: Multi-Provider Isolation

## 🔒 Key Constraints
- Exclusive Write Ownership: `src/providers/kkphim.js`, `src/providers/nguonc.js`, `src/providers/vsmov.js`.
- DO NOT CHEAT: Genuine implementation, no hardcoded test results.
- Set strict 5-second axios timeouts (`timeout: 5000`) and wrap in isolated `try...catch` returning `[]` on error.
- Standardize stream format per R3:
  - In-App Direct Play (HLS Proxy): has `url`, NO `externalUrl`.
  - External Browser Play (Embed Player): has `externalUrl`, NO `url`.

## Current Parent
- Conversation ID: 681a8264-75a0-4d5c-84e1-8e78b180494b
- Updated: 2026-08-17T03:24:40Z

## Task Summary
- **What to build**: 
  - `src/providers/kkphim.js`: 5s timeout, direct IMDb lookup -> fallback Cinemeta title & year search -> return all servers (Vietsub, Thuyet Minh, Long Tieng) -> R3 stream formatting.
  - `src/providers/nguonc.js`: 5s timeout, Cinemeta title & year search -> return Vietsub & Thuyet Minh servers -> R3 stream formatting.
  - `src/providers/vsmov.js`: Multi-gateway scraper with 5s timeout -> extract 1080p master.m3u8 stream -> R3 stream formatting.
- **Success criteria**:
  - All 3 provider modules pass `node --check`.
  - `getStreams` returns R3 compliant stream objects (`url` without `externalUrl` vs `externalUrl` without `url`).
  - Failures in one provider gracefully return `[]` without throwing or stalling.
- **Interface contracts**: PROJECT.md § Interface Contracts
- **Code layout**: PROJECT.md § Code Layout

## Change Tracker
- **Files modified**:
  - `src/providers/kkphim.js`: Updated with 5s timeout, Cinemeta title & year matching, all servers (Vietsub, Thuyet Minh, Long Tieng), R3 stream protocol format.
  - `src/providers/nguonc.js`: Updated with 5s timeout, Cinemeta title & year matching, Vietsub & Thuyet Minh servers, R3 stream protocol format.
  - `src/providers/vsmov.js`: Updated with 5s timeout, multi-gateway scraper, 1080p master.m3u8 stream extraction, R3 stream protocol format, graceful degradation.
- **Build status**: PASS (`node --check` passes on all files, unit verification passes 5/5)
- **Pending issues**: none

## Quality Status
- **Build/test result**: All syntax and test suites pass
- **Lint status**: clean
- **Tests added/modified**: Verified with empirical test harness covering offline isolation, timeout enforcement, multi-server handling, and R3 protocol exclusivity

## Key Decisions Made
- Used `timeout: 5000` on all provider axios instances.
- Enforced strict mutual exclusivity: HLS Proxy streams include `url` (no `externalUrl`), while Embed Player fallback streams include `externalUrl` (no `url`).
- Implemented robust `scoreMatch` in KKPhim and NguonC taking into account canonical name, origin_name, slug, and release year.
- Provided multi-gateway fallback list on VsMov (`https://vsmov.com`, `https://streamvsmov.com`, `https://vsmov.net`) and 1080p master.m3u8 prioritization.

## Artifact Index
- `.agents/teamwork_preview_worker_m2/handoff.md` — Final handoff report
