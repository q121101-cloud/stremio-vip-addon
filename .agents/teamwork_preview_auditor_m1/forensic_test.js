'use strict';

const assert = require('assert');
const { LRUCache, cinemetaCache } = require('../../src/lib/cache');
const { resolveCinemeta, getCachedCinemeta } = require('../../src/lib/cinemeta');
const api = require('../../src/api');

async function runForensicAudit() {
  console.log('=== STARTING FORENSIC AUDIT ON MILESTONE 1 FILES ===\n');

  // -------------------------------------------------------------
  // TEST 1: LRUCache algorithmic verification
  // -------------------------------------------------------------
  console.log('[Check 1] LRUCache: algorithmic correctness, TTL & eviction');
  const cache = new LRUCache(3, 1); // maxSize=3, defaultTTL=1s

  cache.set('a', 1);
  cache.set('b', 2);
  cache.set('c', 3);
  assert.strictEqual(cache.size, 3, 'Cache size should be 3');
  assert.strictEqual(cache.get('a'), 1, 'Key "a" should be 1');
  assert.strictEqual(cache.get('b'), 2, 'Key "b" should be 2');
  assert.strictEqual(cache.get('c'), 3, 'Key "c" should be 3');

  // Test eviction order: access 'a', then insert 'd'. Since 'a' was accessed, 'b' is the oldest and should be evicted
  cache.get('a'); // 'b' is now LRU
  cache.set('d', 4);
  assert.strictEqual(cache.size, 3, 'Cache size should still be 3 after eviction');
  assert.strictEqual(cache.get('b'), undefined, 'Key "b" should have been evicted');
  assert.strictEqual(cache.get('a'), 1, 'Key "a" should still exist');
  assert.strictEqual(cache.get('c'), 3, 'Key "c" should still exist');
  assert.strictEqual(cache.get('d'), 4, 'Key "d" should exist');

  // Test TTL expiry
  console.log('[Check 1.1] LRUCache: TTL expiration test (sleeping 1100ms)...');
  await new Promise(r => setTimeout(r, 1100));
  assert.strictEqual(cache.get('a'), undefined, 'Key "a" should have expired after 1.1s');
  assert.strictEqual(cache.get('c'), undefined, 'Key "c" should have expired after 1.1s');
  assert.strictEqual(cache.get('d'), undefined, 'Key "d" should have expired after 1.1s');

  // Test prune & stats
  cache.set('x', 10, 10);
  cache.set('y', 20, 0.05); // expires quickly
  await new Promise(r => setTimeout(r, 70));
  const pruned = cache.prune();
  assert.strictEqual(pruned, 1, 'Prune should have removed exactly 1 expired entry ("y")');
  assert.strictEqual(cache.get('x'), 10, 'Key "x" should remain');

  const stats = cache.stats();
  assert.ok(stats.hits > 0, 'Stats should record hits');
  assert.ok(stats.misses > 0, 'Stats should record misses');
  assert.ok(stats.evictions === 1, 'Stats should record 1 eviction');
  console.log('✅ LRUCache algorithmic verification: PASSED');

  // -------------------------------------------------------------
  // TEST 2: Cinemeta Resolver Live Network Verification
  // -------------------------------------------------------------
  console.log('\n[Check 2] Cinemeta Resolver: Live Network Requests');

  // Test 2.1: Inception (Movie)
  console.log('  -> Querying Cinemeta for tt1375666 (Inception)...');
  const t0 = Date.now();
  const inc = await resolveCinemeta('movie', 'tt1375666');
  const d0 = Date.now() - t0;
  console.log(`     Resolved in ${d0}ms:`, inc?.name, `(${inc?.year})`);
  assert.ok(inc, 'Inception must resolve');
  assert.strictEqual(inc.name, 'Inception', 'Canonical name must be Inception');
  assert.strictEqual(inc.year, 2010, 'Year must be 2010');
  assert.strictEqual(inc.type, 'movie', 'Type must be movie');
  assert.ok(Array.isArray(inc.genres) && inc.genres.length > 0, 'Genres must be non-empty array');

  // Test 2.2: Cache hit test
  console.log('  -> Verifying Cache Hit for tt1375666...');
  const tCache = Date.now();
  const incCached = await resolveCinemeta('movie', 'tt1375666');
  const dCache = Date.now() - tCache;
  console.log(`     Cache retrieval in ${dCache}ms`);
  assert.deepStrictEqual(incCached, inc, 'Cached result must equal original');
  assert.ok(dCache < 10, 'Cache hit must be instantaneous (<10ms)');

  // Test 2.3: getCachedCinemeta synchronous method
  const syncCached = getCachedCinemeta('movie', 'tt1375666');
  assert.deepStrictEqual(syncCached, inc, 'getCachedCinemeta must return cached metadata synchronously');

  // Test 2.4: Breaking Bad (Series with episode suffix)
  console.log('  -> Querying Cinemeta for tt0903747:1:1 (Breaking Bad S01E01)...');
  const bb = await resolveCinemeta('series', 'tt0903747:1:1');
  console.log('     Resolved:', bb?.name, `(${bb?.year})`);
  assert.ok(bb, 'Breaking Bad must resolve');
  assert.strictEqual(bb.name, 'Breaking Bad', 'Canonical name must be Breaking Bad');
  assert.strictEqual(bb.year, 2008, 'Year must be 2008');
  assert.strictEqual(bb.type, 'series', 'Type must be series');
  assert.strictEqual(bb.imdbId, 'tt0903747', 'Clean IMDb ID must strip season:ep');

  // Test 2.5: Dynamic / Arbitrary IMDb ID (The Godfather - tt0068646)
  console.log('  -> Querying Cinemeta for arbitrary title tt0068646 (The Godfather)...');
  const gf = await resolveCinemeta('movie', 'tt0068646');
  console.log('     Resolved:', gf?.name, `(${gf?.year})`);
  assert.ok(gf, 'The Godfather must resolve');
  assert.strictEqual(gf.name, 'The Godfather');
  assert.strictEqual(gf.year, 1972);

  // Test 2.6: Another dynamic series (Stranger Things - tt4574334)
  console.log('  -> Querying Cinemeta for arbitrary series tt4574334 (Stranger Things)...');
  const st = await resolveCinemeta('series', 'tt4574334');
  console.log('     Resolved:', st?.name, `(${st?.year})`);
  assert.ok(st, 'Stranger Things must resolve');
  assert.strictEqual(st.name, 'Stranger Things');
  assert.strictEqual(st.year, 2016);

  // Test 2.7: Non-existent / invalid IMDb IDs
  console.log('  -> Querying Cinemeta for invalid & non-existent IDs...');
  const invalid1 = await resolveCinemeta('movie', 'invalid-id-xyz');
  assert.strictEqual(invalid1, null, 'Invalid format must return null');

  const nonExistent = await resolveCinemeta('movie', 'tt9999999999');
  assert.strictEqual(nonExistent, null, 'Non-existent ID must return null');

  console.log('✅ Cinemeta Resolver Live Network Verification: PASSED');

  // -------------------------------------------------------------
  // TEST 3: API module integration verification
  // -------------------------------------------------------------
  console.log('\n[Check 3] API Module Integration');
  assert.strictEqual(typeof api.resolveCinemeta, 'function', 'api.resolveCinemeta must be a function');
  assert.strictEqual(typeof api.findFilmByImdbId, 'function', 'api.findFilmByImdbId must be a function');

  // Test findFilmByImdbId live resolution + NguonC lookup
  console.log('  -> Testing api.findFilmByImdbId("movie", "tt1375666")...');
  const found = await api.findFilmByImdbId('movie', 'tt1375666');
  console.log('     findFilmByImdbId result:', found);
  assert.ok(found, 'Should find NguonC film for Inception');
  assert.ok(found.slug, 'Found object must contain slug');

  console.log('✅ API Module Integration: PASSED');

  console.log('\n=== ALL FORENSIC CHECKS PASSED WITH 100% GENUINE EXECUTION ===');
}

runForensicAudit().catch((err) => {
  console.error('\n❌ FORENSIC AUDIT FAILED:', err);
  process.exit(1);
});
