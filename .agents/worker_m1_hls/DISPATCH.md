## 2026-08-17T14:57:18Z
You are the HLS Proxy Implementation Worker (Milestone 1).
Working directory: /Users/quan/.gemini/antigravity/scratch/stremio-nguonc-addon/.agents/worker_m1_hls

Read /Users/quan/.gemini/antigravity/scratch/stremio-nguonc-addon/ORIGINAL_REQUEST.md first.
Read the blueprint in /Users/quan/.gemini/antigravity/scratch/stremio-nguonc-addon/.agents/explorer_hls_tests/handoff.md.

MANDATORY INTEGRITY WARNING:
DO NOT CHEAT. All implementations must be genuine. DO NOT hardcode test results, create dummy/facade implementations, or circumvent the intended task. A teamwork_preview_auditor will independently verify your work. Integrity violations WILL be detected and your work WILL be rejected.

Your task (Requirement R1):
Implement/Update src/routes/hls.js:
1. /hls/manifest.m3u8:
   - Accept Base64URL-encoded 'url' and 'ref' query parameters (also support plain and standard base64).
   - Line-by-line rewrite of Master Playlists (#EXT-X-STREAM-INF, #EXT-X-I-FRAME-STREAM-INF, #EXT-X-MEDIA) rewriting sub-variants to /hls/manifest.m3u8.
   - Line-by-line rewrite of Media Playlists:
     - #EXT-X-KEY to /hls/key?url=...&ref=...
     - #EXT-X-MAP, #EXT-X-PART, and segment URI lines to /hls/segment.ts?url=...&ref=...
   - Enforce headers: Content-Type: application/vnd.apple.mpegurl; charset=utf-8, Access-Control-Allow-Origin: *, Cache-Control: no-cache, no-store, must-revalidate.
2. /hls/segment.ts (and aliases /ts, /segment):
   - Pipe raw binary TS chunks from upstream CDN.
   - Support HTTP Range requests (206 Partial Content), forward Range header upstream, pass Content-Range, Content-Length, and Accept-Ranges back to client.
   - Enforce headers: Content-Type: video/MP2T, Access-Control-Allow-Origin: *, Cache-Control: public, max-age=31536000, immutable.
3. /hls/key (and alias /key.key):
   - Proxy AES decryption key files with upstream Referer, Content-Type: application/octet-stream, Cache-Control: no-cache, no-store.
4. /hls/extract:
   - Redirect to /hls/manifest.m3u8 with Base64URL params.

Verify syntax with `node --check src/routes/hls.js`.
Write your handoff report to /Users/quan/.gemini/antigravity/scratch/stremio-nguonc-addon/.agents/worker_m1_hls/handoff.md and report back when finished.
