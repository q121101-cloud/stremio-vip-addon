## 2026-08-18T01:42:49Z

<USER_REQUEST>
You are teamwork_preview_worker_m2_1.
Your working directory is: /Users/quan/.gemini/antigravity/scratch/stremio-nguonc-addon/.agents/teamwork_preview_worker_m2_1
Original User Request file: /Users/quan/.gemini/antigravity/scratch/stremio-nguonc-addon/.agents/ORIGINAL_REQUEST.md
Project specification: /Users/quan/.gemini/antigravity/scratch/stremio-nguonc-addon/PROJECT.md

Read /Users/quan/.gemini/antigravity/scratch/stremio-nguonc-addon/.agents/ORIGINAL_REQUEST.md and /Users/quan/.gemini/antigravity/scratch/stremio-nguonc-addon/PROJECT.md.

MANDATORY INTEGRITY WARNING:
DO NOT CHEAT. All implementations must be genuine. DO NOT hardcode test results, create dummy/facade implementations, or circumvent the intended task. A teamwork_preview_auditor will independently verify your work. Integrity violations WILL be detected and your work WILL be rejected.

Milestone 2 Scope & File Ownership:
- You exclusively own:
  `src/providers/vsmov.js`

Requirements to implement:
1. Inspect and extract all server groups / tabs (`Vietsub`, `Lồng Tiếng`, `Thuyết Minh`) from VSMOV API `episodes` responses.
   - Do NOT collapse them into a single raw stream.
   - Classify each server tab accurately using robust regex (e.g. `/l.{1,5}ng\s*ti.{1,5}ng/i` for Lồng Tiếng, `/thuy.{1,5}t\s*minh/i` for Thuyết Minh, and `/vietsub|ph.{1,5}\s*đ.{1,5}|sub/i` or default for Vietsub).
2. Format distinct stream objects with exact names and titles per R1:
   - **Vietsub**:
     - `name`: `"VIP Movies 🎬"`
     - `title`: `[VIP 1 • VSMOV] Vietsub 4K Ultra HD (3840x2160)${epLabel} (HLS Proxy)\n⚡ Server VIP Vietsub • vsmov.com`
     - `behaviorHints.bingeGroup`: `"vsmov-vietsub-4k-vip-1"`
   - **Lồng Tiếng**:
     - `name`: `"VIP Movies 🎬"`
     - `title`: `[VIP 1 • VSMOV] Lồng Tiếng 4K Ultra HD (3840x2160)${epLabel} (HLS Proxy)\n⚡ Server VIP Lồng Tiếng • vsmov.com`
     - `behaviorHints.bingeGroup`: `"vsmov-longtieng-4k-vip-1"`
   - **Thuyết Minh**:
     - `name`: `"VIP Movies 🎬"`
     - `title`: `[VIP 1 • VSMOV] Thuyết Minh 4K Ultra HD (3840x2160)${epLabel} (HLS Proxy)\n⚡ Server VIP Thuyết Minh • vsmov.com`
     - `behaviorHints.bingeGroup`: `"vsmov-thuyetminh-4k-vip-1"`
3. Scrape / extract WebVTT/SRT subtitle files from embed player HTML (`playerOptions.subtitles` or regex):
   - Resolve relative subtitle URLs to absolute URLs using the embed server base URL.
   - If subtitle URL is found, route through proxy: `${proxyBase}/hls/sub.vtt?url=${b64Sub}&ref=${b64Ref}` (or plain URL parameters if helper encodes it).
   - Attach `subtitles: [{ id: 'vi_vsmov', lang: 'vie', url: proxySubUrl }]` to the stream object.
   - If no subtitles exist (e.g. dubbed/hardcoded), omit or handle gracefully.
4. Maintain strict In-App stream protocol: `url` present (pointing to `${proxyBase}/hls/manifest.m3u8?...`), `externalUrl` omitted/undefined.

Verification commands:
- `node --check src/providers/vsmov.js`
- `node --check src/index.js`
- `node tests/verify_vsmov_sub_audio.js`
- `npm test`

Write your report to `/Users/quan/.gemini/antigravity/scratch/stremio-nguonc-addon/.agents/teamwork_preview_worker_m2_1/handoff.md` and send a message to parent when completed.
</USER_REQUEST>
