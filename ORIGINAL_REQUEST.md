# Original User Request

## Initial Request — 2026-08-19T05:07:23Z

Resolve production Vercel 403 Cloudflare IP blocking for NguonC, purge stale/dirty stream cache in Supabase, and ensure multi-provider streams (KKPhim, NguonC, VSMOV) return completely and reliably for movies and series.

Key Deliverables:
1. R1: Force Render Proxy for NguonC on Vercel Serverless (src/providers/nguonc.js) with exponential backoff retry.
2. R2: StreamC M3U8 Extraction & Anti-403 Proxy Routing (src/routes/hls.js & src/mapper.js) decoding data-obf payload.
3. R3: Standalone Supabase/L1 cache flush script (scripts/flush_cache.js & src/db/supabase.js) with silent failure tolerance.
4. R4: Multi-provider stream aggregation & series episode matching (src/routes/stream.js).
5. Full Verification: Run `npx vitest run` (100% passing across all 7 test files / 83+ tests), `node --check src/index.js`, `node scripts/flush_cache.js`, and git commit & push to `main`.
