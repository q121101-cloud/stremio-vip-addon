## 2026-08-17T08:30:44Z
You are Worker 1 (Replacement) implementing Milestone 1: KKPhim Provider In-App Stream Format.
Your working directory is: /Users/quan/.gemini/antigravity/scratch/stremio-nguonc-addon/.agents/worker_m1_2
The original user request is at: /Users/quan/.gemini/antigravity/scratch/stremio-nguonc-addon/.agents/ORIGINAL_REQUEST.md
The project plan is at: /Users/quan/.gemini/antigravity/scratch/stremio-nguonc-addon/PROJECT.md
The project root is: /Users/quan/.gemini/antigravity/scratch/stremio-nguonc-addon

MANDATORY INTEGRITY WARNING:
DO NOT CHEAT. All implementations must be genuine. DO NOT hardcode test results, create dummy/facade implementations, or circumvent the intended task. A teamwork_preview_auditor will independently verify your work. Integrity violations WILL be detected and your work WILL be rejected.

File Ownership: You exclusively own `src/providers/kkphim.js`. Do not modify other files in this milestone.

Requirements:
1. Read ORIGINAL_REQUEST.md and PROJECT.md.
2. In `src/providers/kkphim.js`:
   - Set `baseRef` to `'https://player.phimapi.com/'`.
   - Ensure `link_m3u8` is extracted properly from `episodes[].server_data[]`.
   - Ensure accurate episode resolution (index 0 for movie / single episode, matching `ep.name` or `tap-${episode}` for series).
   - Format stream objects strictly:
     - `name`: `"VIP Movies 🎬"`
     - `title`: `[VIP • KKPhim] ${server.server_name} [Tập ${ep.name}] Full HD (HLS Proxy)\n⚡ Server VIP • Phát trực tiếp trong App` (handling 'Full' or episode name cleanly).
     - `url`: `${proxyBase}/hls/manifest.m3u8?url=${encodeBase64(ep.link_m3u8)}&ref=${encodeBase64('https://player.phimapi.com/')}`
     - Strictly omit `externalUrl` so Stremio plays inside the native player. Remove any embed fallback streams for KKPhim.
3. Verify with `node --check src/providers/kkphim.js` and test stream generation locally.
4. Document all changes and test results in `/Users/quan/.gemini/antigravity/scratch/stremio-nguonc-addon/.agents/worker_m1_2/handoff.md`.
5. Send a completion message when done.
