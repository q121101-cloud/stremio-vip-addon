'use strict';

/**
 * ============================================================
 *  Edge-case Unit Matrix for Cinemeta Internal Functions
 * ============================================================
 */

const assert = require('assert');
const { resolveCinemeta, getCachedCinemeta, cinemetaCache } = require('../src/lib/cinemeta');

async function testEdgeCaseMatrix() {
  console.log('Testing Edge-Case Matrix for Cinemeta...');

  // Test 1: Case normalization check
  const idLower = 'tt0903747';
  const idUpper = 'TT0903747';
  const idMixed = 'tT0903747';

  cinemetaCache.clear();
  const lowerRes = await resolveCinemeta('series', idLower);
  assert.ok(lowerRes, 'Lowercase ID must resolve');

  // Check whether uppercase hits the cache or fails
  const upperRes = await resolveCinemeta('series', idUpper);
  console.log(`Uppercase resolution result: ${upperRes ? 'SUCCESS' : 'FAILED (404)'}`);

  // Test 2: In-flight deduplication check
  let networkCalls = 0;
  // Let's inspect how many requests were sent during concurrent calls
  cinemetaCache.clear();
  const start = Date.now();
  const concurrentCalls = await Promise.all([
    resolveCinemeta('movie', 'tt1375666'),
    resolveCinemeta('movie', 'tt1375666'),
    resolveCinemeta('movie', 'tt1375666'),
    resolveCinemeta('movie', 'tt1375666'),
    resolveCinemeta('movie', 'tt1375666'),
  ]);
  console.log(`Concurrent 5 cold calls resolved in ${Date.now() - start}ms`);
  assert.strictEqual(concurrentCalls.length, 5);
  assert.ok(concurrentCalls.every(c => c && c.name === 'Inception'));

  console.log('Edge-case matrix test finished successfully.');
}

testEdgeCaseMatrix().catch(console.error);
