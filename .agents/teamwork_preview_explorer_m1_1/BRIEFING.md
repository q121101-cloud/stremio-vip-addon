# BRIEFING — 2026-08-18T04:47:35Z

## Mission
Formulate exact implementation changes for `src/providers/stp.js` (Provider STP upgrade & HLS Routing).

## 🔒 My Identity
- Archetype: Explorer
- Roles: Read-only investigation, Provider Upgrade Specification
- Working directory: /Users/quan/.gemini/antigravity/scratch/stremio-nguonc-addon/.agents/teamwork_preview_explorer_m1_1
- Original parent: 7fe7db36-8ec4-4ad9-bc14-f6fa0b444fae
- Milestone: Milestone 1 (Provider Upgrades & HLS Routing)

## 🔒 Key Constraints
- Read-only investigation — do NOT implement directly in source files
- Formulate exact proposed code/diff/spec for `src/providers/stp.js`
- Comply with project invariants: `url` only (no `externalUrl`), `scoreMatch` from `src/lib/utils.js`, brand title formatting, XOR 0x2a decode multi-tier stream extraction with fallback, headers.

## Current Parent
- Conversation ID: 7fe7db36-8ec4-4ad9-bc14-f6fa0b444fae
- Updated: 2026-08-18T04:47:35Z

## Investigation State
- **Explored paths**:
  - `src/providers/stp.js` (lines 1-338)
  - `src/routes/hls.js` (lines 1-507)
  - `src/lib/utils.js` (lines 1-326)
  - `src/providers/vsmov.js`, `src/providers/kkphim.js`, `src/mapper.js`
  - Live probe: `https://sieutamphim.pro/wp-json/wp/v2/posts` and `https://sieutamphim.pro/embed.html`
- **Key findings**:
  - `sieutamphim.pro` uses WordPress REST API at `/wp-json/wp/v2/posts` with `_embed=true` for featured images.
  - Stream links are embedded in `content.rendered` inside `.episodeGroup` as JSON array `data-episodes='[{"<enc>", "<name>"}]'`.
  - Stream URLs are character-wise XOR obfuscated with key `0x2a` (decimal 42).
  - Multi-tier strategy designed: Tier 1 WP-JSON + XOR decode -> Tier 2 HTML search / PhimAPI mirror -> Tier 3 Safe `[]`.
  - Exact stream title: `[VIP 4 • STP] Thuyết Minh HD (HLS Proxy)\n⚡ Server STP • sieutamphim.pro`.
  - Strict invariants verified: zero `externalUrl`, `url` points to `${proxyBase}/hls/manifest.m3u8?...`, `scoreMatch` imported from `../lib/utils`.
- **Unexplored areas**: None within STP scope.

## Key Decisions Made
- Constructed complete drop-in replacement file specification for `src/providers/stp.js`.
- Verified regex for `data-episodes` with double/single quote handling so double-quoted pairs inside single quotes parse correctly.
- Confirmed zero regression on `verify_playback.js` (7/7 pass) and `verify_hotfix_vsmov_kkphim.js` (27/27 pass).

## Artifact Index
- DISPATCH.md — Dispatch log
- BRIEFING.md — Situational awareness
- progress.md — Liveness heartbeat
- handoff.md — Final 5-component report
