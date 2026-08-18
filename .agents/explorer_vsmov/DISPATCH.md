## 2026-08-18T02:23:25Z

You are an Explorer investigating the VSMOV Multi-Server Audio Separation & Subtitle Proxy requirements for Hotfix v1.5.1.

Working directory: /Users/quan/.gemini/antigravity/scratch/stremio-nguonc-addon/.agents/explorer_vsmov
Scope:
1. Read /Users/quan/.gemini/antigravity/scratch/stremio-nguonc-addon/.agents/ORIGINAL_REQUEST.md (specifically ## 2026-08-18T02:21:45Z).
2. Investigate src/providers/vsmov.js, src/routes/hls.js, src/routes/stream.js, and any helper files.
3. Map out:
   - How VSMOV currently fetches player/server data and how server groups (Vietsub, Lồng tiếng, Thuyết minh) are structured in API/HTML/player responses.
   - How to return distinct, cleanly formatted stream objects for Vietsub, Lồng Tiếng, and Thuyết Minh per R1 requirements:
     - Vietsub: [VIP 1 • VSMOV] Vietsub 4K Ultra HD (3840x2160) (HLS Proxy)\n⚡ Server VIP Vietsub • vsmov.com
     - Lồng Tiếng: [VIP 1 • VSMOV] Lồng Tiếng 4K Ultra HD (3840x2160) (HLS Proxy)\n⚡ Server VIP Lồng Tiếng • vsmov.com
     - Thuyết Minh: [VIP 1 • VSMOV] Thuyết Minh 4K Ultra HD (3840x2160) (HLS Proxy)\n⚡ Server VIP Thuyết Minh • vsmov.com
   - How WebVTT/SRT subtitles are extracted from VSMOV player data, routed via proxy `${proxyBase}/hls/sub.vtt?url=${b64Sub}&ref=${b64Ref}`, and attached as `subtitles: [{ id: 'vi_vsmov', lang: 'vie', url: proxySubUrl }]`.
   - How `GET /hls/sub.vtt` should be implemented in src/routes/hls.js (fetching with Referer/Origin headers, returning Content-Type: text/vtt; charset=utf-8, CORS *, cache-control, and automatic SRT to WebVTT conversion).
   - Ensure strict In-App stream protocol: include `url`, omit `externalUrl`.
4. Write your full report to /Users/quan/.gemini/antigravity/scratch/stremio-nguonc-addon/.agents/explorer_vsmov/handoff.md and send a summary message back.

## 2026-08-18T02:28:34Z

**Context**: Survey Phase for Hotfix v1.5.1
**Content**: Please complete your investigation of VSMOV multi-server separation & subtitle proxy, write your handoff report to /Users/quan/.gemini/antigravity/scratch/stremio-nguonc-addon/.agents/explorer_vsmov/handoff.md, and send your summary message back.
**Action**: Finish writing handoff.md and send message back.
