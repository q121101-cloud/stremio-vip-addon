## 2026-08-18T17:15:43Z
Conduct a detailed code audit of `src/providers/nguonc.js` and `src/providers/film4k.js` in `/Users/quan/.gemini/antigravity/scratch/stremio-nguonc-addon/`.

Requirements to inspect:
1. `src/providers/nguonc.js`:
   - Verify stealth request headers: Chrome 131 UA, `Referer: https://phim.nguonc.com/`, `Origin`, `Sec-Fetch-Dest`, `Sec-Fetch-Mode`, `Sec-Fetch-Site`.
   - Verify Vercel-to-Render fallback routing via `RENDER_BACKEND_URL` env var inside `fetchNguonC()` when running on Vercel or when NguonC blocks requests.
   - Check stream extraction and ensure all streams use 'url' (HLS proxy), never 'externalUrl'.
2. `src/providers/film4k.js`:
   - Verify Film4K REST API scraping (`/api/home`, `/api/title/:slug`, `/api/watch/:slug`).
   - Verify 4K stream URL extraction (`/api/hls/archive/:slug/master.m3u8`).
   - Verify multi-audio/subtitle handling and episode matching logic for series (season/episode number extraction, fallback).
   - Check if any streams use 'externalUrl' vs 'url'.
