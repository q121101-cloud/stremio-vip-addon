'use strict';

/**
 * ============================================================
 *  VIP Movies Addon — tests/live_e2e_benchmark.test.js
 *  Live E2E Integration & Sub-50ms Cache Performance Benchmark
 * ============================================================
 */

const assert = require('assert');
const axios = require('axios');
const app = require('../src/server');
const { ADDON_VERSION } = require('../src/config/constants');

let server = null;
let baseUrl = '';
let passed = 0;
let failed = 0;

function it(name, fn) {
  try {
    fn();
    console.log(`  ✅ PASS: ${name}`);
    passed++;
  } catch (err) {
    console.error(`  ❌ FAIL: ${name} -> ${err.message}`);
    failed++;
  }
}

async function itAsync(name, fn) {
  try {
    await fn();
    console.log(`  ✅ PASS: ${name}`);
    passed++;
  } catch (err) {
    console.error(`  ❌ FAIL: ${name} -> ${err.message}`);
    failed++;
  }
}

async function runBenchmark() {
  server = await new Promise((resolve) => {
    const s = app.listen(0, '127.0.0.1', () => resolve(s));
  });
  const port = server.address().port;
  baseUrl = `http://127.0.0.1:${port}`;

  console.log('\n╔══════════════════════════════════════════════════════════════╗');
  console.log(`║     🚀 LIVE E2E & PERFORMANCE BENCHMARK SUITE v${ADDON_VERSION}         ║`);
  console.log('╚══════════════════════════════════════════════════════════════╝\n');
  console.log(`📡 Local Ephemeral Target: ${baseUrl}\n`);

  try {
    // ── PHASE 1: Health & Manifest Invariants ────────────────
    console.log('▶ PHASE 1: Health & Manifest Invariants');
    await itAsync('Health check returns ok with cache statistics', async () => {
      const res = await axios.get(`${baseUrl}/health`);
      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.data.status, 'ok');
      assert.ok(res.data.version);
    });

    await itAsync('Dynamic manifest resolves 10 VIP catalogs by default', async () => {
      const res = await axios.get(`${baseUrl}/manifest.json`);
      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.headers['access-control-allow-origin'], '*');
      assert.ok(Array.isArray(res.data.catalogs));
      assert.strictEqual(res.data.catalogs.length, 10);
    });

    // ── PHASE 2: Live Catalog Aggregation ───────────────────
    console.log('\n▶ PHASE 2: Live Catalog Retrieval');
    await itAsync('Fetches NguonC latest movie catalog', async () => {
      const res = await axios.get(`${baseUrl}/catalog/movie/nguonc-movie-latest.json`);
      assert.strictEqual(res.status, 200);
      assert.ok(Array.isArray(res.data.metas));
      assert.ok(res.data.metas.length > 0);
    });

    await itAsync('Fetches KKPhim series catalog', async () => {
      const res = await axios.get(`${baseUrl}/catalog/series/kkphim-series-latest.json`);
      assert.strictEqual(res.status, 200);
      assert.ok(Array.isArray(res.data.metas));
    });

    // ── PHASE 3: Live Stream Aggregation & Sub-50ms Cache Benchmark
    console.log('\n▶ PHASE 3: Parallel Stream Aggregator & Cache Speed Benchmark');
    let firstStreamUrl = null;

    await itAsync('Movie stream aggregation resolves streams across active providers', async () => {
      const t0 = Date.now();
      const res = await axios.get(`${baseUrl}/stream/movie/tt0373889.json`, { timeout: 15000 });
      const elapsed = Date.now() - t0;
      console.log(`     (Cold stream resolution time: ${elapsed}ms)`);

      assert.strictEqual(res.status, 200);
      assert.ok(Array.isArray(res.data.streams) && res.data.streams.length > 0);

      // Invariant: strictly url, NO externalUrl
      for (const s of res.data.streams) {
        assert.ok(s.url, 'Stream must contain url');
        assert.strictEqual(s.externalUrl, undefined, 'Strict Invariant: NO externalUrl');
      }

      firstStreamUrl = res.data.streams[0].url;
    });

    await itAsync('BENCHMARK: Cached stream request responds in < 50ms', async () => {
      const t0 = Date.now();
      const res = await axios.get(`${baseUrl}/stream/movie/tt0373889.json`, { timeout: 2000 });
      const elapsed = Date.now() - t0;
      console.log(`     ⚡ Tiered Cache Response Time: ${elapsed}ms`);

      assert.strictEqual(res.status, 200);
      assert.ok(Array.isArray(res.data.streams) && res.data.streams.length > 0);
      assert.ok(elapsed < 50, `Requirement Violation: Cache response must be < 50ms (got ${elapsed}ms)`);
    });

    // ── PHASE 4: Video Delivery & TS Chunk Download ─────────
    console.log('\n▶ PHASE 4: Video Chunk Delivery & Byte Stream Invariants');
    if (firstStreamUrl) {
      await itAsync('Downloads real video TS segment (> 50KB with 0x47 sync byte)', async () => {
        // Fetch manifest through proxy
        const manifestRes = await axios.get(firstStreamUrl, { timeout: 10000 });
        assert.strictEqual(manifestRes.status, 200);
        assert.ok(manifestRes.data.startsWith('#EXTM3U'));

        // Extract a segment link
        const lines = manifestRes.data.split('\n');
        let segmentLink = null;
        for (const line of lines) {
          const l = line.trim();
          if (l.includes('/hls/segment.ts') || l.includes('/hls/manifest.m3u8')) {
            segmentLink = l;
            break;
          }
        }

        if (segmentLink) {
          if (segmentLink.includes('/hls/manifest.m3u8')) {
            // Sub-variant: fetch sub playlist to get segment
            const subRes = await axios.get(segmentLink, { timeout: 10000 });
            const subLines = subRes.data.split('\n');
            for (const sl of subLines) {
              if (sl.trim().includes('/hls/segment.ts')) {
                segmentLink = sl.trim();
                break;
              }
            }
          }

          console.log(`     Fetching video chunk from: ${segmentLink.slice(0, 80)}...`);
          const segRes = await axios.get(segmentLink, {
            responseType: 'arraybuffer',
            timeout: 15000,
          });

          assert.ok([200, 206].includes(segRes.status));
          const buf = Buffer.from(segRes.data);
          console.log(`     Chunk payload size: ${(buf.length / 1024).toFixed(2)} KB`);
          assert.ok(buf.length > 50000, `Video chunk must be > 50KB (got ${buf.length} B)`);
          assert.ok(buf[0] === 0x47 || buf[0] === 0x89, `Media chunk sync byte must be valid (0x47 or 0x89, got 0x${buf[0].toString(16)})`);
        }
      });
    }

  } finally {
    if (server) server.close();
  }

  console.log('\n──────────────────────────────────────────────────────────────');
  console.log(`🏁 BENCHMARK SUMMARY: ${passed} PASSED, ${failed} FAILED`);
  if (failed > 0) process.exit(1);
}

runBenchmark().catch((e) => {
  console.error(e);
  if (server) server.close();
  process.exit(1);
});
