## 2026-08-17T14:52:27Z
You are a Provider APIs Spec Miner.
Working directory: /Users/quan/.gemini/antigravity/scratch/stremio-nguonc-addon/.agents/spec_miner_apis

Read /Users/quan/.gemini/antigravity/scratch/stremio-nguonc-addon/ORIGINAL_REQUEST.md first.
Investigate the provider APIs and stream requirements specified in R2:
1. VSMOV 4K Engine (https://vsmov.com/api, streamvsmov.com CDN, headers, IMDb/TMDB lookup, stream title formatting).
2. KKPhim Engine (https://phimapi.com, IMDb lookup /imdb/title/${imdbId}, fallback search, Vietsub/TM/LT servers).
3. NguonC Engine (https://phim.nguonc.com/api, StreamC embed/m3u8, Referer: https://embed15.streamc.xyz/).
4. Specialized providers: STP (suutamphim.org / tvhay), HH3D & YAN (3D Donghua), CLBPX (Classic Wuxia & TVB).
5. Cinemeta API for canonical metadata resolution (https://v3-cinemeta.strem.io/meta/${type}/${imdbId}.json).

Verify live API responses if needed or detail exact contract specifications, data structures, and edge cases.
Write your complete specification report to /Users/quan/.gemini/antigravity/scratch/stremio-nguonc-addon/.agents/spec_miner_apis/handoff.md and report back when finished.
