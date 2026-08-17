'use strict';

/**
 * =========================================================================
 * Empirical Test Harness & Adversarial Stress Suite for Cinemeta & Cache
 * Module under test: src/lib/cinemeta.js & src/lib/cache.js
 * =========================================================================
 */

const assert = require('assert');
const axios = require('axios');
const { LRUCache } = require('../src/lib/cache');

// Mock data store for Cinemeta API
const MOCK_CINEMETA_DB = {
  'movie:tt1375666': {
    meta: {
      id: 'tt1375666',
      type: 'movie',
      name: 'Inception',
      year: '2010',
      releaseInfo: '2010',
      genres: ['Action', 'Adventure', 'Sci-Fi'],
      aliases: ['Inception 2010', 'El Origen'],
      poster: 'https://images.metahub.space/poster/medium/tt1375666/img.jpg',
      background: 'https://images.metahub.space/background/medium/tt1375666/img.jpg',
      description: 'A thief who steals corporate secrets through dream-sharing technology...'
    }
  },
  'series:tt0903747': {
    meta: {
      id: 'tt0903747',
      type: 'series',
      name: 'Breaking Bad',
      year: 2008,
      releaseInfo: '2008–2013',
      genres: ['Crime', 'Drama', 'Thriller'],
      aliases: [],
      poster: 'https://images.metahub.space/poster/medium/tt0903747/img.jpg',
      background: 'https://images.metahub.space/background/medium/tt0903747/img.jpg',
      description: 'A chemistry teacher diagnosed with inoperable lung cancer...'
    }
  },
  'movie:tt0499549': {
    meta: {
      id: 'tt0499549',
      type: 'movie',
      name: 'Avatar',
      year: '2009',
      releaseInfo: '2009',
      genres: ['Action', 'Adventure', 'Fantasy', 'Sci-Fi'],
      aliases: ['Avatar 2009'],
      poster: 'https://images.metahub.space/poster/medium/tt0499549/img.jpg',
    }
  },
  'movie:tt0816692': {
    meta: {
      id: 'tt0816692',
      type: 'movie',
      name: 'Interstellar',
      year: '2014',
      releaseInfo: '2014',
      genres: ['Adventure', 'Drama', 'Sci-Fi'],
      aliases: [],
    }
  },
  'movie:tt9999994': {
    // Variations in genre / aliases format
    meta: {
      id: 'tt9999994',
      type: 'movie',
      name: 'Format Variation Film',
      year: null,
      releaseInfo: 'Released in 2021 worldwide',
      genre: 'SingleGenre',
      aliases: 'SingleAlias'
    }
  },
  'movie:tt9999995': {
    // Meta without name
    meta: {
      id: 'tt9999995',
      type: 'movie',
      year: 2022
    }
  },
  'movie:tt9999996': {
    // Empty meta object
    meta: null
  }
};

let networkCallCount = 0;
const recordedRequests = [];

// Intercept Axios requests globally on prototype
const originalRequest = axios.Axios.prototype.request;
axios.Axios.prototype.request = async function(configOrUrl, maybeConfig) {
  const config = typeof configOrUrl === 'string' ? { url: configOrUrl, ...(maybeConfig || {}) } : (configOrUrl || {});
  const url = config.url || '';
  
  networkCallCount++;
  recordedRequests.push({ url, method: config.method || 'get', headers: config.headers, timestamp: Date.now() });

  // Simulate network latency (2ms)
  await new Promise(r => setTimeout(r, 2));

  // Match /meta/:type/:id.json
  const match = url.match(/\/meta\/(movie|series)\/(tt\d+)\.json/);
  if (!match) {
    const err = new Error(`Request failed with status code 404`);
    err.response = { status: 404, statusText: 'Not Found', data: { error: 'Not found' } };
    throw err;
  }

  const type = match[1];
  const imdbId = match[2];
  const key = `${type}:${imdbId}`;

  // Fault simulation triggers
  if (imdbId === 'tt9999998') {
    const err = new Error('Request failed with status code 500');
    err.response = { status: 500, statusText: 'Internal Server Error' };
    throw err;
  }

  if (imdbId === 'tt9999997') {
    const err = new Error('timeout of 5000ms exceeded');
    err.code = 'ECONNABORTED';
    throw err;
  }

  if (imdbId === 'tt00000000000') {
    const err = new Error('Request failed with status code 404');
    err.response = { status: 404, statusText: 'Not Found' };
    throw err;
  }

  if (MOCK_CINEMETA_DB[key]) {
    return {
      status: 200,
      statusText: 'OK',
      data: MOCK_CINEMETA_DB[key],
      headers: {},
      config,
    };
  }

  // Not in DB -> 404
  const err = new Error('Request failed with status code 404');
  err.response = { status: 404, statusText: 'Not Found' };
  throw err;
};

// Now import target module after mocking axios
const { resolveCinemeta, getCachedCinemeta, cinemetaCache } = require('../src/lib/cinemeta');

const testResults = [];

function record(name, passed, details, durationMs) {
  testResults.push({ name, passed, details, durationMs });
  const icon = passed ? '✅ PASS' : '❌ FAIL';
  console.log(`[${icon}] ${name} (${durationMs}ms)`);
  if (!passed) {
    console.error(`       Error: ${details}`);
  } else if (details) {
    console.log(`       Info: ${details}`);
  }
}

async function runTest(name, fn) {
  const start = Date.now();
  try {
    const details = await fn();
    const duration = Date.now() - start;
    record(name, true, details || '', duration);
  } catch (err) {
    const duration = Date.now() - start;
    record(name, false, err.message + (err.stack ? `\n${err.stack}` : ''), duration);
  }
}

async function runAllTests() {
  console.log('================================================================');
  console.log('  CHALLENGER SUITE: src/lib/cinemeta.js & cinemetaCache');
  console.log('================================================================\n');

  cinemetaCache.clear();
  networkCallCount = 0;
  recordedRequests.length = 0;

  // -------------------------------------------------------------
  // Test 1: Cinemeta Movie Resolution (tt1375666 -> Inception, 2010)
  // -------------------------------------------------------------
  await runTest('Test 1: Movie Resolution (tt1375666: Inception)', async () => {
    const meta = await resolveCinemeta('movie', 'tt1375666');
    assert(meta !== null, 'Expected meta to be non-null');
    assert.strictEqual(meta.imdbId, 'tt1375666');
    assert.strictEqual(meta.type, 'movie');
    assert.strictEqual(meta.name, 'Inception');
    assert.strictEqual(meta.year, 2010);
    assert.deepStrictEqual(meta.genres, ['Action', 'Adventure', 'Sci-Fi']);
    assert.deepStrictEqual(meta.aliases, ['Inception 2010', 'El Origen']);
    assert(meta.poster && meta.poster.startsWith('https://'));
    assert(meta.background && meta.background.startsWith('https://'));
    assert(meta.description && meta.description.length > 10);
    return `Resolved: "${meta.name}" (${meta.year}), Genres: [${meta.genres.join(', ')}]`;
  });

  // -------------------------------------------------------------
  // Test 2: Cinemeta Series Resolution (tt0903747:1:1 -> Breaking Bad, 2008)
  // -------------------------------------------------------------
  await runTest('Test 2: Series Resolution with Season:Ep (tt0903747:1:1: Breaking Bad)', async () => {
    const meta = await resolveCinemeta('series', 'tt0903747:1:1');
    assert(meta !== null, 'Expected meta to be non-null');
    assert.strictEqual(meta.imdbId, 'tt0903747');
    assert.strictEqual(meta.type, 'series');
    assert.strictEqual(meta.name, 'Breaking Bad');
    assert.strictEqual(meta.year, 2008);
    assert.strictEqual(meta.releaseInfo, '2008–2013');
    assert.deepStrictEqual(meta.genres, ['Crime', 'Drama', 'Thriller']);
    return `Resolved: "${meta.name}" (${meta.year}), releaseInfo: "${meta.releaseInfo}"`;
  });

  // -------------------------------------------------------------
  // Test 3: Endpoint & HTTP Header Construction
  // -------------------------------------------------------------
  await runTest('Test 3: HTTP Endpoint & Request URL Verification', async () => {
    assert(recordedRequests.length >= 2, 'Expected recorded HTTP requests');
    const movieReq = recordedRequests.find(r => r.url.includes('tt1375666'));
    const seriesReq = recordedRequests.find(r => r.url.includes('tt0903747'));

    assert(movieReq, 'Movie request was not recorded');
    assert.strictEqual(movieReq.url, '/meta/movie/tt1375666.json');

    assert(seriesReq, 'Series request was not recorded');
    assert.strictEqual(seriesReq.url, '/meta/series/tt0903747.json');

    return `URLs correctly formatted: ${movieReq.url}, ${seriesReq.url}`;
  });

  // -------------------------------------------------------------
  // Test 4: Type Normalization ('tv' -> 'series', default 'movie')
  // -------------------------------------------------------------
  await runTest('Test 4: Type Normalization ("tv" -> "series")', async () => {
    cinemetaCache.clear();
    const meta = await resolveCinemeta('tv', 'tt0903747');
    assert(meta !== null);
    assert.strictEqual(meta.type, 'series');

    const metaMovie = await resolveCinemeta('unknown_type', 'tt1375666');
    assert(metaMovie !== null);
    assert.strictEqual(metaMovie.type, 'movie');

    return `Normalized 'tv' -> 'series' and 'unknown_type' -> 'movie'`;
  });

  // -------------------------------------------------------------
  // Test 5: Cache Hit & Zero Network Call on Repeat
  // -------------------------------------------------------------
  await runTest('Test 5: Cache Hit Latency & Zero Network Overhead', async () => {
    const key = 'tt1375666';
    const callsBefore = networkCallCount;

    const start = process.hrtime.bigint();
    const cached = await resolveCinemeta('movie', key);
    const end = process.hrtime.bigint();
    const elapsedUs = Number(end - start) / 1000;

    const callsAfter = networkCallCount;
    assert.strictEqual(callsAfter, callsBefore, 'Cache hit must NOT make any network call');
    assert.strictEqual(cached.name, 'Inception');
    assert(elapsedUs < 1000, `Cache hit took ${elapsedUs.toFixed(2)}µs (< 1000µs)`);

    return `Cache hit verified: 0 network calls, latency: ${elapsedUs.toFixed(2)}µs`;
  });

  // -------------------------------------------------------------
  // Test 6: Synchronous getCachedCinemeta API
  // -------------------------------------------------------------
  await runTest('Test 6: Synchronous getCachedCinemeta API', async () => {
    const movie = getCachedCinemeta('movie', 'tt1375666');
    assert(movie !== null);
    assert.strictEqual(movie.name, 'Inception');

    const series = getCachedCinemeta('series', 'tt0903747:3:10');
    assert(series !== null);
    assert.strictEqual(series.name, 'Breaking Bad');

    const uncached = getCachedCinemeta('movie', 'tt1111111');
    assert.strictEqual(uncached, null);

    return `Sync getter correctly returned cached items and null for uncached`;
  });

  // -------------------------------------------------------------
  // Test 7: Negative Caching on 404 (Cached as null)
  // -------------------------------------------------------------
  await runTest('Test 7: Negative Caching for 404 Responses', async () => {
    const nonExistentId = 'tt00000000000';
    const callsBefore = networkCallCount;

    const firstResult = await resolveCinemeta('movie', nonExistentId);
    assert.strictEqual(firstResult, null);
    assert.strictEqual(networkCallCount, callsBefore + 1, 'First call should hit network');

    // Second call should hit negative cache and NOT make network call
    const secondResult = await resolveCinemeta('movie', nonExistentId);
    assert.strictEqual(secondResult, null);
    assert.strictEqual(networkCallCount, callsBefore + 1, 'Second call must hit negative cache (no network)');

    // Synchronous getter should also return null
    const syncRes = getCachedCinemeta('movie', nonExistentId);
    assert.strictEqual(syncRes, null);

    return `404 cached as negative entry; repeat calls avoided network`;
  });

  // -------------------------------------------------------------
  // Test 8: Transient Error Resilience (500 & Timeout NOT permanently cached)
  // -------------------------------------------------------------
  await runTest('Test 8: Transient Error Resilience (500 / Timeout)', async () => {
    // 500 error on tt9999998
    const res500 = await resolveCinemeta('movie', 'tt9999998');
    assert.strictEqual(res500, null, '500 error should return null without crashing');
    
    // Check it is NOT cached
    const cached500 = cinemetaCache.get('cinemeta:movie:tt9999998');
    assert.strictEqual(cached500, undefined, '500 error must NOT be cached');

    // Timeout on tt9999997
    const resTimeout = await resolveCinemeta('movie', 'tt9999997');
    assert.strictEqual(resTimeout, null, 'Timeout should return null without crashing');
    
    const cachedTimeout = cinemetaCache.get('cinemeta:movie:tt9999997');
    assert.strictEqual(cachedTimeout, undefined, 'Timeout must NOT be cached');

    return `Transient 500/Timeout returned null gracefully without polluting cache`;
  });

  // -------------------------------------------------------------
  // Test 9: Robust Parsing of Format Variations (single strings, releaseInfo regex)
  // -------------------------------------------------------------
  await runTest('Test 9: Format Variations & Regex Year Parsing', async () => {
    const meta = await resolveCinemeta('movie', 'tt9999994');
    assert(meta !== null);
    assert.strictEqual(meta.name, 'Format Variation Film');
    assert.strictEqual(meta.year, 2021, 'Should extract 2021 from releaseInfo');
    assert.deepStrictEqual(meta.genres, ['SingleGenre']);
    assert.deepStrictEqual(meta.aliases, ['SingleAlias']);

    return `Single string genres/aliases & embedded year in releaseInfo parsed accurately`;
  });

  // -------------------------------------------------------------
  // Test 10: Empty or Missing Meta Handled Gracefully
  // -------------------------------------------------------------
  await runTest('Test 10: Empty / Incomplete Meta Payload', async () => {
    const noName = await resolveCinemeta('movie', 'tt9999995');
    assert.strictEqual(noName, null, 'Meta without name should resolve to null');

    const nullMeta = await resolveCinemeta('movie', 'tt9999996');
    assert.strictEqual(nullMeta, null, 'Null meta should resolve to null');

    return `Missing name and null meta payload safely handled`;
  });

  // -------------------------------------------------------------
  // Test 11: Fault Injection — Input Fuzzing & Malformed IDs
  // -------------------------------------------------------------
  await runTest('Test 11: Input Fuzzing & Boundary Values', async () => {
    const fuzzedInputs = [
      '', '   ', null, undefined, '1234567', 'tt', 'tt-invalid', 'invalid_tt123',
      'ttabcdef', 'tt', 'tt 1234', 'tt!@#$', 'tt\n1234', {}
    ];

    for (const input of fuzzedInputs) {
      const res = await resolveCinemeta('movie', input);
      assert.strictEqual(res, null, `Input "${String(input)}" should return null`);
      const syncRes = getCachedCinemeta('movie', input);
      assert.strictEqual(syncRes, null, `Sync input "${String(input)}" should return null`);
    }

    return `All ${fuzzedInputs.length} fuzzed inputs rejected safely with 0 exceptions`;
  });

  // -------------------------------------------------------------
  // Test 12: LRU Cache Capacity & Eviction Stress (10,000 items on 5,000 capacity)
  // -------------------------------------------------------------
  await runTest('Test 12: LRU Cache Eviction Stress (10,000 items)', async () => {
    const stressCache = new LRUCache(5000, 86400);

    for (let i = 1; i <= 10000; i++) {
      stressCache.set(`key_${i}`, { val: i });
    }

    assert.strictEqual(stressCache.size, 5000, `Expected cache size 5000, got ${stressCache.size}`);
    
    // First 5,000 should be evicted
    assert.strictEqual(stressCache.get('key_1'), undefined);
    assert.strictEqual(stressCache.get('key_5000'), undefined);

    // Last 5,000 must exist
    assert(stressCache.get('key_5001') !== undefined);
    assert(stressCache.get('key_10000') !== undefined);

    const stats = stressCache.stats();
    assert.strictEqual(stats.evictions, 5000);
    assert.strictEqual(stats.maxSize, 5000);

    return `Strict capacity cap 5000 enforced; 5000 oldest keys evicted cleanly. Evictions: ${stats.evictions}`;
  });

  // -------------------------------------------------------------
  // Test 13: LRU Access Ordering & MRU Promotion
  // -------------------------------------------------------------
  await runTest('Test 13: LRU Access Ordering & MRU Promotion', async () => {
    const cache = new LRUCache(3, 3600);
    cache.set('k1', 'v1');
    cache.set('k2', 'v2');
    cache.set('k3', 'v3');

    // Access k1 (promotes k1 from oldest to newest)
    assert.strictEqual(cache.get('k1'), 'v1');

    // Add k4 (should evict k2, which is now the oldest)
    cache.set('k4', 'v4');

    assert.strictEqual(cache.get('k2'), undefined, 'k2 should have been evicted');
    assert.strictEqual(cache.get('k1'), 'v1', 'k1 should still exist because it was accessed');
    assert.strictEqual(cache.get('k3'), 'v3');
    assert.strictEqual(cache.get('k4'), 'v4');

    return `MRU promotion validated: accessing k1 saved it from eviction`;
  });

  // -------------------------------------------------------------
  // Test 14: Cache TTL Expiration & Auto-Prune
  // -------------------------------------------------------------
  await runTest('Test 14: Cache TTL Expiration & Pruning', async () => {
    const ttlCache = new LRUCache(100, 1);
    ttlCache.set('temp_key_1', 'val1', 0.2); // 200ms TTL
    ttlCache.set('temp_key_2', 'val2', 0.2);
    ttlCache.set('persist_key', 'val3', 2.0); // 2s TTL

    // Immediate
    assert.strictEqual(ttlCache.get('temp_key_1'), 'val1');

    // Wait 300ms
    await new Promise(r => setTimeout(r, 300));

    // get() expired returns undefined
    assert.strictEqual(ttlCache.get('temp_key_1'), undefined);
    assert.strictEqual(ttlCache.get('persist_key'), 'val3');

    // Prune remaining expired entry
    const pruned = ttlCache.prune();
    assert.strictEqual(pruned, 1, `Expected 1 entry pruned, got ${pruned}`);

    return `TTL expiration on get() and bulk prune() fully operational`;
  });

  // -------------------------------------------------------------
  // Test 15: Concurrency Stampede Test (100 parallel requests)
  // -------------------------------------------------------------
  await runTest('Test 15: High Concurrency Stampede (100 parallel requests)', async () => {
    cinemetaCache.clear();
    const id = 'tt0816692'; // Interstellar
    const promises = Array.from({ length: 100 }, () => resolveCinemeta('movie', id));

    const results = await Promise.all(promises);
    assert.strictEqual(results.length, 100);

    for (const r of results) {
      assert(r !== null);
      assert.strictEqual(r.name, 'Interstellar');
      assert.strictEqual(r.year, 2014);
    }

    return `100 parallel requests resolved flawlessly with 0 data races`;
  });

  // -------------------------------------------------------------
  // Test 16: PROJECT.md Contract Compliance
  // -------------------------------------------------------------
  await runTest('Test 16: PROJECT.md Contract Field Verification', async () => {
    const meta = await resolveCinemeta('movie', 'tt0499549'); // Avatar
    assert(meta !== null);

    const requiredContractKeys = [
      'imdbId', 'type', 'name', 'year', 'releaseInfo', 'genres', 'aliases'
    ];

    for (const k of requiredContractKeys) {
      assert(k in meta, `Missing contract property: ${k}`);
    }

    assert.strictEqual(typeof meta.imdbId, 'string');
    assert.strictEqual(typeof meta.type, 'string');
    assert.strictEqual(typeof meta.name, 'string');
    assert.strictEqual(typeof meta.year, 'number');
    assert(Array.isArray(meta.genres));
    assert(Array.isArray(meta.aliases));

    return `All 7 contract properties present and strictly typed`;
  });

  console.log('\n================================================================');
  console.log('  CHALLENGER SUITE SUMMARY');
  console.log('================================================================');

  const total = testResults.length;
  const passed = testResults.filter(r => r.passed).length;
  const failed = total - passed;

  console.log(`Total Tests:  ${total}`);
  console.log(`Passed:       ${passed}`);
  console.log(`Failed:       ${failed}`);
  console.log(`Verdict:      ${failed === 0 ? 'APPROVE' : 'REJECT'}`);
  console.log('================================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runAllTests().catch(err => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
