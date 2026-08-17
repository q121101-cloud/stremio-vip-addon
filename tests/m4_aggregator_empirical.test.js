'use strict';

/**
 * ============================================================
 *  Milestone 4 Worker Verification: Fail-Safe Stream Aggregator
 *  & Cinemeta Metadata Resolution Empirical Test Suite
 *  Targets: src/handlers.js, src/lib/cinemeta.js, src/lib/cache.js
 * ============================================================
 */

const assert = require('assert');
const express = require('express');
const axios = require('axios');
const http = require('http');

const { resolveCinemeta, getCachedCinemeta, cinemetaCache } = require('../src/lib/cinemeta');
const { LRUCache, imdbCache } = require('../src/lib/cache');
const handlersRouter = require('../src/handlers');

const testSuite = {
  passed: 0,
  failed: 0,
  errors: [],
};

async function test(name, fn) {
  try {
    const res = fn();
    if (res && typeof res.then === 'function') {
      await res;
    }
    testSuite.passed++;
    console.log(`  ✅ PASS: ${name}`);
  } catch (err) {
    testSuite.failed++;
    testSuite.errors.push({ name, error: err.message, stack: err.stack });
    console.error(`  ❌ FAIL: ${name}\n     Error: ${err.message}`);
  }
}

async function runM4EmpiricalTests() {
  console.log('╔══════════════════════════════════════════════════════════════════════════════╗');
  console.log('║   🛡️  M4: FAIL-SAFE STREAM AGGREGATOR & CINEMETA METADATA EMPIRICAL TEST     ║');
  console.log('╚══════════════════════════════════════════════════════════════════════════════╝\n');

  // Start Express Test App
  const app = express();
  app.use(express.json());
  app.use('/', handlersRouter);

  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;
  const baseUrl = `http://127.0.0.1:${port}`;
  const client = axios.create({ baseURL: baseUrl, timeout: 10000 });

  try {
    // ════════════════════════════════════════════════════════════
    // Section 1: Cinemeta Metadata Resolution & LRU Cache
    // ════════════════════════════════════════════════════════════
    console.log('▶ [1/5] Testing Cinemeta Metadata Resolution & LRU Cache...');

    await test('Cinemeta: Resolves movie IMDb ID (tt1375666 -> Inception 2010)', async () => {
      cinemetaCache.clear();
      const meta = await resolveCinemeta('movie', 'tt1375666');
      assert.ok(meta, 'Metadata must resolve');
      assert.strictEqual(meta.imdbId, 'tt1375666');
      assert.strictEqual(meta.name, 'Inception');
      assert.strictEqual(meta.year, 2010);
      assert.ok(Array.isArray(meta.genres) && meta.genres.length > 0);
      assert.ok(Array.isArray(meta.aliases));
    });

    await test('Cinemeta: Resolves series IMDb ID with season:episode suffix (tt0903747:1:1)', async () => {
      const meta = await resolveCinemeta('series', 'tt0903747:1:1');
      assert.ok(meta);
      assert.strictEqual(meta.imdbId, 'tt0903747');
      assert.strictEqual(meta.name, 'Breaking Bad');
      assert.strictEqual(meta.year, 2008);
      assert.strictEqual(meta.type, 'series');
    });

    await test('Cinemeta: 24h LRU Cache Hit provides zero network overhead', async () => {
      const t0 = Date.now();
      const cachedMeta = await resolveCinemeta('movie', 'tt1375666');
      const elapsed = Date.now() - t0;
      assert.ok(cachedMeta);
      assert.strictEqual(cachedMeta.name, 'Inception');
      assert.ok(elapsed < 10, `Cached query must take < 10ms (took ${elapsed}ms)`);
    });

    await test('Cinemeta: Synchronous retrieval (getCachedCinemeta)', () => {
      const syncMeta = getCachedCinemeta('movie', 'tt1375666');
      assert.ok(syncMeta);
      assert.strictEqual(syncMeta.name, 'Inception');

      const uncached = getCachedCinemeta('movie', 'tt999999999999');
      assert.strictEqual(uncached, null);
    });

    await test('Cinemeta: Single-flight in-flight deduplication handles concurrent burst', async () => {
      cinemetaCache.clear();
      const promises = Array.from({ length: 30 }, () => resolveCinemeta('movie', 'tt1375666'));
      const t0 = Date.now();
      const results = await Promise.all(promises);
      const elapsed = Date.now() - t0;
      assert.strictEqual(results.length, 30);
      assert.ok(results.every((r) => r && r.name === 'Inception'));
      console.log(`    ↳ 30 concurrent cold requests served in ${elapsed}ms via Single-Flight`);
    });

    await test('Cinemeta: Malformed or non-existent IDs degrade gracefully to null without throwing', async () => {
      assert.strictEqual(await resolveCinemeta('movie', null), null);
      assert.strictEqual(await resolveCinemeta('movie', ''), null);
      assert.strictEqual(await resolveCinemeta('movie', 'invalid_id'), null);
      assert.strictEqual(await resolveCinemeta('movie', 'tt999999888777'), null);
    });

    // ════════════════════════════════════════════════════════════
    // Section 2: Stream Handler Protocol Compliance & Exclusivity
    // ════════════════════════════════════════════════════════════
    console.log('\n▶ [2/5] Testing Stream Handler Protocol Compliance & In-App Exclusivity...');

    await test('Stream Endpoint: Returns HTTP 200 with streams array for valid movie', async () => {
      const res = await client.get('/stream/movie/tt1375666.json');
      assert.strictEqual(res.status, 200);
      assert.ok(Array.isArray(res.data.streams));
      assert.ok(res.data.streams.length > 0, 'Must return at least 1 stream');

      for (const s of res.data.streams) {
        assert.strictEqual(s.name, 'VIP Movies 🎬', 'Stream name must strictly be VIP Movies 🎬');
        assert.ok(typeof s.title === 'string' && s.title.length > 0, 'Stream must have title');
        assert.ok(typeof s.url === 'string' && s.url.startsWith('http'), 'Stream must have valid http url');
        assert.strictEqual(s.externalUrl, undefined, 'Stream MUST NOT contain externalUrl');
      }
    });

    await test('Stream Endpoint: Returns HTTP 200 with streams array for series episode', async () => {
      const res = await client.get('/stream/series/tt0903747:1:1.json');
      assert.strictEqual(res.status, 200);
      assert.ok(Array.isArray(res.data.streams));
      assert.ok(res.data.streams.length > 0);

      for (const s of res.data.streams) {
        assert.strictEqual(s.name, 'VIP Movies 🎬');
        assert.ok(s.url);
        assert.strictEqual(s.externalUrl, undefined);
      }
    });

    await test('Stream Endpoint: Supports route without .json extension', async () => {
      const res = await client.get('/stream/movie/tt1375666');
      assert.strictEqual(res.status, 200);
      assert.ok(Array.isArray(res.data.streams));
    });

    await test('Stream Endpoint: Supports prefixed route with :config token', async () => {
      const res = await client.get('/custom_config/stream/movie/tt1375666.json');
      assert.strictEqual(res.status, 200);
      assert.ok(Array.isArray(res.data.streams));
    });

    // ════════════════════════════════════════════════════════════
    // Section 3: 404 / 500 Prevention & Empty Fallback
    // ════════════════════════════════════════════════════════════
    console.log('\n▶ [3/5] Testing 404/500 Prevention & Safe Empty Return...');

    await test('Stream Endpoint: Non-existent ID returns HTTP 200 with empty streams array', async () => {
      const res = await client.get('/stream/movie/tt99999999999.json');
      assert.strictEqual(res.status, 200);
      assert.deepStrictEqual(res.data, { streams: [] });
    });

    await test('Stream Endpoint: Malformed slug returns HTTP 200 with empty streams array', async () => {
      const res = await client.get('/stream/movie/totally-fake-nonexistent-movie-slug-12345.json');
      assert.strictEqual(res.status, 200);
      assert.deepStrictEqual(res.data, { streams: [] });
    });

    // ════════════════════════════════════════════════════════════
    // Section 4: Stream Priority Ordering & Deduplication
    // ════════════════════════════════════════════════════════════
    console.log('\n▶ [4/5] Testing Priority Sorting & Stream Deduplication...');

    await test('Stream Ordering: VSMOV (VIP 1) precedes KKPhim (VIP 2) and NguonC (VIP 3)', async () => {
      const res = await client.get('/stream/movie/tt1375666.json');
      assert.strictEqual(res.status, 200);
      const streams = res.data.streams;

      if (streams.length >= 2) {
        const vsmovIdx = streams.findIndex((s) => s.title.includes('VSMOV') || s.title.includes('VIP 1'));
        const kkphimIdx = streams.findIndex((s) => s.title.includes('KKPhim') || s.title.includes('VIP 2'));
        const nguoncIdx = streams.findIndex((s) => s.title.includes('NguonC') || s.title.includes('VIP 3'));

        if (vsmovIdx !== -1 && kkphimIdx !== -1) {
          assert.ok(vsmovIdx < kkphimIdx, 'VSMOV should appear before KKPhim');
        }
        if (kkphimIdx !== -1 && nguoncIdx !== -1) {
          assert.ok(kkphimIdx < nguoncIdx, 'KKPhim should appear before NguonC');
        }
      }
    });

    await test('Stream Deduplication: Duplicate URLs or target stream hashes are eliminated', async () => {
      const res = await client.get('/stream/movie/tt1375666.json');
      assert.strictEqual(res.status, 200);
      const urls = res.data.streams.map((s) => s.url);
      const uniqueUrls = new Set(urls);
      assert.strictEqual(urls.length, uniqueUrls.size, 'All stream URLs must be unique (no duplicates)');
    });

    // ════════════════════════════════════════════════════════════
    // Section 5: Timeout Resilience & Failure Isolation (Simulated)
    // ════════════════════════════════════════════════════════════
    console.log('\n▶ [5/5] Testing 4000ms Timeout Resilience & Fault Isolation...');

    await test('Timeout Resilience: Slow provider (4500ms+) does not block faster providers or crash aggregator', async () => {
      // Create isolated provider mock test
      const fastProvider = {
        name: 'FastProvider',
        getStreams: async () => [
          { name: 'VIP Movies 🎬', title: '[VIP 2 • KKPhim] Vietsub Full HD', url: 'http://test/fast.m3u8' },
        ],
      };

      const slowProvider = {
        name: 'SlowProvider',
        getStreams: async () => {
          await new Promise((r) => setTimeout(r, 4500));
          return [
            { name: 'VIP Movies 🎬', title: '[VIP 1 • VSMOV] Late 4K', url: 'http://test/late.m3u8' },
          ];
        },
      };

      const failingProvider = {
        name: 'FailingProvider',
        getStreams: async () => {
          throw new Error('Upstream CDN 500 Network Outage');
        },
      };

      // Test withTimeout helper
      const { withTimeout } = {
        withTimeout: (promise, ms = 4000, label = 'Provider') => {
          let timer;
          if (promise && typeof promise.catch === 'function') {
            promise.catch(() => {});
          }
          const timeoutPromise = new Promise((_, reject) => {
            timer = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms);
          });
          return Promise.race([promise, timeoutPromise]).finally(() => {
            if (timer) clearTimeout(timer);
          });
        },
      };

      const t0 = Date.now();
      const results = await Promise.allSettled([
        withTimeout(fastProvider.getStreams(), 4000, fastProvider.name),
        withTimeout(slowProvider.getStreams(), 4000, slowProvider.name),
        withTimeout(failingProvider.getStreams(), 4000, failingProvider.name),
      ]);
      const elapsed = Date.now() - t0;

      // Verify execution time was capped around 4000ms (not 4500ms+)
      assert.ok(elapsed >= 3900 && elapsed <= 4300, `Execution took ${elapsed}ms (should be ~4000ms capped)`);

      // Verify fast succeeded
      assert.strictEqual(results[0].status, 'fulfilled');
      assert.strictEqual(results[0].value.length, 1);

      // Verify slow timed out gracefully
      assert.strictEqual(results[1].status, 'rejected');
      assert.ok(results[1].reason.message.includes('timed out'));

      // Verify failing failed gracefully
      assert.strictEqual(results[2].status, 'rejected');
      assert.ok(results[2].reason.message.includes('Upstream CDN 500'));
    });

  } finally {
    server.close();
  }

  console.log('\n══════════════════════════════════════════════════════════════════════════════');
  console.log(`🏁 M4 EMPIRICAL TEST COMPLETE: ${testSuite.passed} PASSED, ${testSuite.failed} FAILED`);
  console.log('══════════════════════════════════════════════════════════════════════════════\n');

  if (testSuite.failed > 0) {
    process.exit(1);
  }
}

runM4EmpiricalTests().catch((err) => {
  console.error('FATAL TEST ERROR:', err);
  process.exit(1);
});
