# BRIEFING — 2026-08-17T14:56:15Z

## Mission
Probe and document complete specification of all Provider APIs (VSMOV, KKPhim, NguonC, STP, HH3D, YAN, CLBPX) and Cinemeta API for Stremio addon integration, detailing endpoints, data structures, stream URLs, CDN headers, error behaviors, and edge cases.

## 🔒 My Identity
- Archetype: Specification Miner
- Roles: Provider APIs Spec Miner
- Working directory: /Users/quan/.gemini/antigravity/scratch/stremio-nguonc-addon/.agents/spec_miner_apis
- Original parent: 16f3f43b-5ffd-45ef-8c8d-b97bd3b2f2fc
- Milestone: Provider APIs Specification Discovery (Completed)

## 🔒 Key Constraints
- Probe all assigned and discovered provider APIs thoroughly.
- Do NOT implement anything — read-only spec mining and probing.
- Include Features Discovered table and Edge Cases table.
- Produce 5-component handoff report (Observation, Logic Chain, Caveats, Conclusion, Verification Method).

## Current Parent
- Conversation ID: 16f3f43b-5ffd-45ef-8c8d-b97bd3b2f2fc
- Updated: 2026-08-17T14:56:15Z

## Task Summary
- **What was probed**:
  1. VSMOV 4K Engine: `https://vsmov.com/api` (search, movie detail, 4k catalog, master M3U8 extraction on `https://v5.streamvsmov.com/stream/${videoHash}/master.m3u8`, CDN Referer `https://vsmov.com/`, MIME override `video/MP2T`, title format `[VIP 1 • VSMOV] Master 4K Ultra HD (3840x2160) (HLS Proxy)` and `[VIP 1 • VSMOV] Thuyết Minh Full HD (HLS Proxy)`).
  2. KKPhim Engine: `https://phimapi.com` (direct `/imdb/title/${imdbId}`, fallback `/v1/api/tim-kiem`, Vietsub/TM/LT server extraction, Referer `https://player.phimapi.com/`, title formats `[VIP 2 • KKPhim] Vietsub Full HD (HLS Proxy)` and `[VIP 2 • KKPhim] Thuyết Minh Full HD (HLS Proxy)`).
  3. NguonC Engine: `https://phim.nguonc.com/api` (search, detail, StreamC `data-obf` decoding, Referer `https://embed15.streamc.xyz/`, title format `[VIP 3 • NguonC] Vietsub / Thuyết Minh (HLS Proxy)`).
  4. Specialized Providers: STP, HH3D, YAN, CLBPX standard provider contracts and graceful degradation.
  5. Cinemeta API: `https://v3-cinemeta.strem.io/meta/${type}/${imdbId}.json` for canonical metadata and year extraction with 24h LRU caching.
  6. HLS Proxy Anti-403: `/hls/manifest.m3u8`, `/hls/segment.ts` (with Range 206 support), `/hls/key`.

## Key Decisions Made
- Fully documented all API contracts, CDN headers, stream title patterns, and edge case behaviors in `handoff.md`.

## Artifact Index
- `.agents/spec_miner_apis/handoff.md` — Final 5-component handoff specification report
- `.agents/spec_miner_apis/progress.md` — Liveness and progress tracking
