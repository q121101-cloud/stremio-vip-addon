# BRIEFING — 2026-08-17T08:27:00Z

## Mission
Implement Milestone 1: KKPhim Provider In-App Stream Format in `src/providers/kkphim.js`.

## 🔒 My Identity
- Archetype: worker
- Roles: implementer, qa, specialist
- Working directory: /Users/quan/.gemini/antigravity/scratch/stremio-nguonc-addon/.agents/worker_m1
- Original parent: 5dfdd9a6-b83e-4a88-88a8-6cfe6611dc5c
- Milestone: Milestone 1 - KKPhim Provider In-App Stream Format

## 🔒 Key Constraints
- File Ownership: Exclusively own `src/providers/kkphim.js`. Do not modify other files in this milestone.
- Base referer for KKPhim set to 'https://player.phimapi.com/'.
- Stream title format strictly: `[VIP • KKPhim] ${server.server_name} [Tập ${ep.name}] Full HD (HLS Proxy)\n⚡ Server VIP • Phát trực tiếp trong App` (handling 'Full' or episode name cleanly).
- Stream URL: `${proxyBase}/hls/manifest.m3u8?url=${encodeBase64(ep.link_m3u8)}&ref=${encodeBase64('https://player.phimapi.com/')}`.
- Strictly omit `externalUrl` so Stremio plays inside native player. Remove embed fallback streams for KKPhim.
- Real implementations only. No cheating or hardcoding test results.

## Current Parent
- Conversation ID: 5dfdd9a6-b83e-4a88-88a8-6cfe6611dc5c
- Updated: 2026-08-17T08:27:00Z

## Task Summary
- **What to build**: Update `src/providers/kkphim.js` to format KKPhim streams for native in-app HLS playback via HLS proxy with baseRef `https://player.phimapi.com/`, clean episode name handling, and removal of embed fallback streams.
- **Success criteria**: All stream objects returned by `kkphim.js` have `url` (no `externalUrl`), correct title, `name: 'VIP Movies 🎬'`, correct baseRef in url param, syntax check passes, and tests verify correct stream generation.
- **Interface contracts**: PROJECT.md § Interface Contracts
- **Code layout**: PROJECT.md § Code Layout

## Key Decisions Made
- `baseRef`: `'https://player.phimapi.com/'`
- Stream name: `'VIP Movies 🎬'`
- Clean episode title formatting:
  * If `ep.name` is 'Full' (or empty/movie with 'Full'): `[VIP • KKPhim] ${cleanServerName} Full HD (HLS Proxy)\n⚡ Server VIP • Phát trực tiếp trong App`
  * If `ep.name` is 'Tập XX' (or 'XX'): `[VIP • KKPhim] ${cleanServerName} [Tập XX] Full HD (HLS Proxy)\n⚡ Server VIP • Phát trực tiếp trong App`
- Omit embed fallback (`externalUrl`) for KKPhim so Stremio always uses native player.

## Artifact Index
- `src/providers/kkphim.js` — KKPhim stream extractor & metadata provider
- `.agents/worker_m1/handoff.md` — Handoff report

## Change Tracker
- **Files modified**: `src/providers/kkphim.js`
- **Build status**: Pending
- **Pending issues**: None

## Quality Status
- **Build/test result**: In progress
- **Lint status**: Clean
- **Tests added/modified**: Verification tests run
