'use strict';

/**
 * ============================================================
 *  Empirical Challenger Test Suite for Cinemeta & Cache
 *  Target: src/lib/cinemeta.js, src/lib/cache.js
 * ============================================================
 */

const assert = require('assert');
const { resolveCinemeta, getCachedCinemeta, cinemetaCache } = require('../src/lib/cinemeta');
const { LRUCache, imdbCache, m3u8Cache } = require('../src/lib/cache');

const results = {
  total: 0,
  passed: 0,
  failed: 0,
  errors: [],
};

async function test(name, fn) {
  results.total++;
  try {
    const res = fn();
    if (res && typeof res.then === 'function') {
      await res;
    }
    results.passed++;
    console.log(`  ✅ [PASS] ${name}`);
  } catch (err) {
    results.failed++;
    results.errors.push({ name, error: err.message, stack: err.stack });
    console.error(`  ❌ [FAIL] ${name}: ${err.message}`);
  }
}

async function runTestSuite() {
  console.log('╔════════════════════════════════════════════════════════════════╗');
  console.log('║  ⚔️  CINEMETA & LRU CACHE EMPIRICAL CHALLENGER TEST SUITE      ║');
  console.log('╚════════════════════════════════════════════════════════════════╝\n');

  // ============================================================
  // Section 1: LRUCache Core & Edge-Case Unit Tests
  // ============================================================
  console.log('▶ [1/7] Testing LRUCache Core Mechanics & Boundaries...');

  await test('LRUCache: Basic set, get, size, and has behavior', () => {
    const cache = new LRUCache(3, 60);
    cache.set('a', 1);
    cache.set('b', 2);
    assert.strictEqual(cache.get('a'), 1);
    assert.strictEqual(cache.get('b'), 2);
    assert.strictEqual(cache.get('c'), undefined);
    assert.strictEqual(cache.size, 2);
  });

  await test('LRUCache: Eviction of least recently used item on capacity overflow', () => {
    const cache = new LRUCache(3, 60);
    cache.set('a', 1);
    cache.set('b', 2);
    cache.set('c', 3);
    // Access 'a' so 'b' becomes the oldest
    cache.get('a');
    // Insert 'd', which should evict 'b'
    cache.set('d', 4);

    assert.strictEqual(cache.get('b'), undefined, 'b should have been evicted');
    assert.strictEqual(cache.get('a'), 1, 'a was accessed and should survive');
    assert.strictEqual(cache.get('c'), 3, 'c should survive');
    assert.strictEqual(cache.get('d'), 4, 'd should exist');
    assert.strictEqual(cache.size, 3);
  });

  await test('LRUCache: Updating existing key reorders LRU position without unnecessary eviction', () => {
    const cache = new LRUCache(2, 60);
    cache.set('k1', 'v1');
    cache.set('k2', 'v2');
    // Update k1
    cache.set('k1', 'v1_updated');
    // Insert k3 -> should evict k2, not k1
    cache.set('k3', 'v3');

    assert.strictEqual(cache.get('k1'), 'v1_updated');
    assert.strictEqual(cache.get('k2'), undefined, 'k2 should have been evicted');
    assert.strictEqual(cache.get('k3'), 'v3');
    assert.strictEqual(cache.size, 2);
  });

  await test('LRUCache: TTL expiration works synchronously on get()', async () => {
    const cache = new LRUCache(10, 1); // 1 second TTL
    cache.set('temp', 'val', 0.05); // 50ms TTL
    assert.strictEqual(cache.get('temp'), 'val');
    await new Promise(r => setTimeout(r, 70));
    assert.strictEqual(cache.get('temp'), undefined, 'Expired key should return undefined');
  });

  await test('LRUCache: Negative caching (storing null) distinguishes from cache miss (undefined)', () => {
    const cache = new LRUCache(10, 60);
    cache.set('missing_key', null);
    assert.strictEqual(cache.get('missing_key'), null);
    assert.strictEqual(cache.get('non_existent'), undefined);
    assert.strictEqual(cache.get('missing_key') !== undefined, true);
  });

  await test('LRUCache: prune() removes expired entries without touching active entries', async () => {
    const cache = new LRUCache(10, 60);
    cache.set('exp1', 'val1', 0.05); // 50ms
    cache.set('exp2', 'val2', 0.05); // 50ms
    cache.set('live1', 'val3', 60); // 60s
    await new Promise(r => setTimeout(r, 70));

    const prunedCount = cache.prune();
    assert.strictEqual(prunedCount, 2, 'prune() should remove 2 expired entries');
    assert.strictEqual(cache.get('exp1'), undefined);
    assert.strictEqual(cache.get('exp2'), undefined);
    assert.strictEqual(cache.get('live1'), 'val3');
    assert.strictEqual(cache.size, 1);
  });

  await test('LRUCache: High volume insertions (10,000 items on maxSize=100) maintain exact bounds', () => {
    const cache = new LRUCache(100, 60);
    for (let i = 0; i < 10000; i++) {
      cache.set(`key_${i}`, i);
    }
    assert.strictEqual(cache.size, 100, 'Size must not exceed maxSize');
    const stats = cache.stats();
    assert.strictEqual(stats.evictions, 9900, 'Must record exact evictions');
    // Old keys should be gone, latest 100 keys present
    assert.strictEqual(cache.get('key_0'), undefined);
    assert.strictEqual(cache.get('key_9999'), 9999);
    assert.strictEqual(cache.get('key_9900'), 9900);
  });

  // ============================================================
  // Section 2: Year Parsing Edge Cases
  // ============================================================
  console.log('\n▶ [2/7] Testing Year Extraction Logic & Edge Cases...');

  await test('Year Parsing: Normal numbers and string years (Inception 2010)', async () => {
    cinemetaCache.clear();
    const m1 = await resolveCinemeta('movie', 'tt1375666');
    assert.ok(m1, 'Inception should resolve');
    assert.strictEqual(m1.year, 2010);
    assert.strictEqual(typeof m1.year, 'number');
  });

  await test('Year Parsing: Series year range strings (e.g. Breaking Bad 2008-2013)', async () => {
    const s1 = await resolveCinemeta('series', 'tt0903747');
    assert.ok(s1, 'Breaking Bad should resolve');
    assert.strictEqual(s1.year, 2008, 'Should extract start year 2008');
    assert.ok(s1.releaseInfo, 'Should have releaseInfo');
  });

  await test('Year Parsing: Series episode with season:episode suffix (tt0903747:1:1)', async () => {
    const s1Ep = await resolveCinemeta('series', 'tt0903747:1:1');
    assert.ok(s1Ep, 'Breaking Bad S01E01 should resolve');
    assert.strictEqual(s1Ep.imdbId, 'tt0903747', 'Clean imdbId must strip :1:1');
    assert.strictEqual(s1Ep.year, 2008);
  });

  await test('Year Parsing: Boundary early cinema (Carmencita 1894)', async () => {
    const ancient = await resolveCinemeta('movie', 'tt0000001');
    if (ancient) {
      assert.strictEqual(ancient.year, 1894);
      assert.strictEqual(ancient.imdbId, 'tt0000001');
    }
  });

  // ============================================================
  // Section 3: IMDb ID Variations & Malformed Input Handling
  // ============================================================
  console.log('\n▶ [3/7] Testing IMDb ID Variations & Input Sanitization...');

  await test('Input Sanitization: Null, undefined, empty string, number, object', async () => {
    assert.strictEqual(await resolveCinemeta('movie', null), null);
    assert.strictEqual(await resolveCinemeta('movie', undefined), null);
    assert.strictEqual(await resolveCinemeta('movie', ''), null);
    assert.strictEqual(await resolveCinemeta('movie', 12345), null);
    assert.strictEqual(await resolveCinemeta('movie', {}), null);
    assert.strictEqual(await resolveCinemeta('movie', []), null);
  });

  await test('Input Sanitization: Invalid prefixes or malformed IDs', async () => {
    assert.strictEqual(await resolveCinemeta('movie', 'kphim:12345'), null);
    assert.strictEqual(await resolveCinemeta('movie', 'nguonc:avatar'), null);
    assert.strictEqual(await resolveCinemeta('movie', 'tt'), null);
    assert.strictEqual(await resolveCinemeta('movie', 'ttabc'), null);
    assert.strictEqual(await resolveCinemeta('movie', 'https://imdb.com/title/tt1375666'), null);
  });

  await test('Input Sanitization: Colon variations & Deep nesting', async () => {
    const res1 = await resolveCinemeta('series', 'tt0903747:5:16:extra');
    assert.ok(res1);
    assert.strictEqual(res1.imdbId, 'tt0903747');

    const res2 = await resolveCinemeta('movie', 'tt1375666:::');
    assert.ok(res2);
    assert.strictEqual(res2.imdbId, 'tt1375666');
  });

  await test('Input Sanitization: Uppercase TT prefix', async () => {
    const resUpper = await resolveCinemeta('movie', 'TT1375666');
    assert.ok(resUpper);
    assert.strictEqual(resUpper.name, 'Inception');
  });

  await test('Input Sanitization: Type fallbacks (tv -> series, invalid -> movie)', async () => {
    const resTv = await resolveCinemeta('tv', 'tt0903747');
    assert.ok(resTv);
    assert.strictEqual(resTv.type, 'series');

    const resOther = await resolveCinemeta('unknown_type', 'tt1375666');
    assert.ok(resOther);
    assert.strictEqual(resOther.type, 'movie');
  });

  // ============================================================
  // Section 4: Synchronous Cache Access (getCachedCinemeta)
  // ============================================================
  console.log('\n▶ [4/7] Testing Synchronous Cache Access (getCachedCinemeta)...');

  await test('getCachedCinemeta: Cold cache returns null without making network calls', () => {
    cinemetaCache.clear();
    const result = getCachedCinemeta('movie', 'tt1375666');
    assert.strictEqual(result, null);
  });

  await test('getCachedCinemeta: Invalid inputs return null safely', () => {
    assert.strictEqual(getCachedCinemeta('movie', null), null);
    assert.strictEqual(getCachedCinemeta('movie', ''), null);
    assert.strictEqual(getCachedCinemeta('movie', 'invalid'), null);
    assert.strictEqual(getCachedCinemeta('movie', {}), null);
  });

  await test('getCachedCinemeta: Returns cached item immediately after resolveCinemeta', async () => {
    cinemetaCache.clear();
    const resolved = await resolveCinemeta('movie', 'tt1375666');
    assert.ok(resolved);

    const sync1 = getCachedCinemeta('movie', 'tt1375666');
    assert.deepStrictEqual(sync1, resolved, 'Synchronous retrieval must return exact resolved object');

    // Episode variation should also match the same movie/series ID cache
    const syncEp = getCachedCinemeta('movie', 'tt1375666:1:1');
    assert.deepStrictEqual(syncEp, resolved, 'Synchronous retrieval with episode string should match base ID');
  });

  await test('getCachedCinemeta: Negative cache hit returns null safely', async () => {
    cinemetaCache.set('cinemeta:movie:tt999999999', null, 3600);
    const syncNegative = getCachedCinemeta('movie', 'tt999999999');
    assert.strictEqual(syncNegative, null);
  });

  // ============================================================
  // Section 5: Concurrency Stress Testing
  // ============================================================
  console.log('\n▶ [5/7] Running Concurrency Stress Tests (50+ Concurrent Requests)...');

  await test('Concurrency Stress: 50 concurrent requests for identical Cold Movie ID', async () => {
    cinemetaCache.clear();
    const t0 = Date.now();
    const promises = [];
    for (let i = 0; i < 50; i++) {
      promises.push(resolveCinemeta('movie', 'tt1375666'));
    }
    const results = await Promise.all(promises);
    const elapsed = Date.now() - t0;

    assert.strictEqual(results.length, 50);
    for (const r of results) {
      assert.ok(r, 'Every concurrent request must resolve successfully');
      assert.strictEqual(r.name, 'Inception');
      assert.strictEqual(r.year, 2010);
    }
    console.log(`    ↳ 50 concurrent cold requests resolved in ${elapsed}ms`);
  });

  await test('Concurrency Stress: 50 concurrent requests for series episode variations (Cold cache)', async () => {
    cinemetaCache.clear();
    const t0 = Date.now();
    const promises = [];
    for (let i = 0; i < 50; i++) {
      const ep = (i % 10) + 1;
      promises.push(resolveCinemeta('series', `tt0903747:1:${ep}`));
    }
    const results = await Promise.all(promises);
    const elapsed = Date.now() - t0;

    assert.strictEqual(results.length, 50);
    for (const r of results) {
      assert.ok(r);
      assert.strictEqual(r.name, 'Breaking Bad');
      assert.strictEqual(r.year, 2008);
      assert.strictEqual(r.imdbId, 'tt0903747');
    }
    console.log(`    ↳ 50 concurrent series episode requests resolved in ${elapsed}ms`);
  });

  await test('Concurrency Stress: 50 concurrent requests for 50 distinct IMDb IDs', async () => {
    cinemetaCache.clear();
    const testIds = [
      'tt1375666', 'tt0111161', 'tt0068646', 'tt0468569', 'tt0109830',
      'tt0137523', 'tt0133093', 'tt0167260', 'tt0110912', 'tt0120737',
      'tt0108052', 'tt0076759', 'tt0080684', 'tt0086190', 'tt0245429',
      'tt0816692', 'tt0050083', 'tt0114709', 'tt0073486', 'tt0317248',
      'tt0060196', 'tt0102926', 'tt0110357', 'tt0110413', 'tt0120815',
      'tt0167261', 'tt0253474', 'tt0338013', 'tt0361748', 'tt0372784',
      'tt0407887', 'tt0416449', 'tt0434409', 'tt0468569', 'tt0477348',
      'tt0482571', 'tt0770828', 'tt0848228', 'tt0892791', 'tt0944947',
      'tt0993846', 'tt1130884', 'tt1201607', 'tt1345836', 'tt1375666',
      'tt1431045', 'tt1517268', 'tt1523967', 'tt1630029', 'tt1853728'
    ];

    const t0 = Date.now();
    const promises = testIds.map(id => resolveCinemeta('movie', id));
    const res = await Promise.all(promises);
    const elapsed = Date.now() - t0;

    const successful = res.filter(Boolean);
    console.log(`    ↳ 50 distinct IMDb IDs resolved: ${successful.length}/50 in ${elapsed}ms`);
    assert.ok(successful.length >= 45, 'At least 90% of popular movie IDs should resolve on live Cinemeta');
  });

  await test('Concurrency Stress: 100 concurrent requests with mixed Warm Cache Hits & Misses', async () => {
    // Pre-populate Inception & Breaking Bad
    await resolveCinemeta('movie', 'tt1375666');
    await resolveCinemeta('series', 'tt0903747');

    const t0 = Date.now();
    const tasks = [];
    for (let i = 0; i < 100; i++) {
      if (i % 3 === 0) {
        tasks.push(resolveCinemeta('movie', 'tt1375666')); // Hit
      } else if (i % 3 === 1) {
        tasks.push(resolveCinemeta('series', `tt0903747:${(i % 5) + 1}:1`)); // Hit
      } else {
        tasks.push(resolveCinemeta('movie', 'tt0111161')); // Shawshank
      }
    }
    const results = await Promise.all(tasks);
    const elapsed = Date.now() - t0;

    assert.strictEqual(results.length, 100);
    assert.ok(results.every(r => r !== null));
    console.log(`    ↳ 100 mixed burst requests completed in ${elapsed}ms`);
  });

  // ============================================================
  // Section 6: Non-existent / 404 & Negative Cache Verification
  // ============================================================
  console.log('\n▶ [6/7] Testing Non-existent IDs & Negative Caching...');

  await test('Negative Caching: Non-existent IMDb ID returns null and caches negative result', async () => {
    const fakeId = 'tt999999888';
    cinemetaCache.del(`cinemeta:movie:${fakeId}`);

    const t0 = Date.now();
    const firstCall = await resolveCinemeta('movie', fakeId);
    const firstElapsed = Date.now() - t0;
    assert.strictEqual(firstCall, null, 'Non-existent ID must return null');

    // Second call should hit the negative cache instantly (< 20ms)
    const t1 = Date.now();
    const secondCall = await resolveCinemeta('movie', fakeId);
    const secondElapsed = Date.now() - t1;
    assert.strictEqual(secondCall, null, 'Second call must return null');
    assert.ok(secondElapsed < 20, `Second call must be instant from cache (took ${secondElapsed}ms)`);
  });

  // ============================================================
  // Section 7: Output Structure & Contract Verification
  // ============================================================
  console.log('\n▶ [7/7] Testing Cinemeta Output Schema & Metadata Contract...');

  await test('Schema Contract: Full metadata verification for Movie and Series', async () => {
    const movie = await resolveCinemeta('movie', 'tt1375666');
    assert.ok(movie);
    assert.strictEqual(typeof movie.imdbId, 'string');
    assert.strictEqual(typeof movie.type, 'string');
    assert.strictEqual(typeof movie.name, 'string');
    assert.strictEqual(typeof movie.year, 'number');
    assert.ok(Array.isArray(movie.genres), 'genres must be an Array');
    assert.ok(Array.isArray(movie.aliases), 'aliases must be an Array');
    assert.ok(movie.genres.length > 0, 'Inception must have genres');

    const series = await resolveCinemeta('series', 'tt0903747');
    assert.ok(series);
    assert.strictEqual(series.type, 'series');
    assert.strictEqual(series.name, 'Breaking Bad');
    assert.strictEqual(series.year, 2008);
    assert.ok(Array.isArray(series.genres));
    assert.ok(series.genres.includes('Crime') || series.genres.includes('Drama'));
  });

  // ============================================================
  // Final Summary
  // ============================================================
  console.log('\n════════════════════════════════════════════════════════════════');
  console.log(`🏁 TEST EXECUTION COMPLETE: ${results.passed}/${results.total} PASSED (${results.failed} FAILED)`);
  console.log('════════════════════════════════════════════════════════════════\n');

  if (results.failed > 0) {
    console.error('Failed Tests:');
    results.errors.forEach(e => console.error(` - ${e.name}: ${e.error}`));
    process.exit(1);
  } else {
    console.log('🎉 ALL CHALLENGER EMPIRICAL TESTS PASSED SATISFACTORILY.');
    process.exit(0);
  }
}

runTestSuite().catch(err => {
  console.error('FATAL UNCAUGHT RUNNER ERROR:', err);
  process.exit(1);
});
