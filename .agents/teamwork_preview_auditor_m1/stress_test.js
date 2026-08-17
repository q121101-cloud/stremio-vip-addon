'use strict';

const assert = require('assert');
const { LRUCache } = require('../../src/lib/cache');
const { resolveCinemeta, getCachedCinemeta, cinemetaCache } = require('../../src/lib/cinemeta');
const api = require('../../src/api');

async function runStressTests() {
  console.log('=== RUNNING ADVERSARIAL STRESS TESTS ON MILESTONE 1 ===\n');

  // Edge case 1: Malformed rawIds
  console.log('[Stress 1] Malformed inputs to resolveCinemeta & getCachedCinemeta');
  const malformedInputs = [
    null,
    undefined,
    '',
    '   ',
    12345,
    {},
    [],
    'tt',
    'ttabc',
    'nm0000001', // Actor ID, not title ID
    'tt1375666; DROP TABLE films;--',
    '<script>alert(1)</script>',
    'tt'.repeat(1000),
  ];

  for (const input of malformedInputs) {
    const resAsync = await resolveCinemeta('movie', input);
    assert.strictEqual(resAsync, null, `resolveCinemeta should return null for malformed input: ${JSON.stringify(input)}`);
    const resSync = getCachedCinemeta('movie', input);
    assert.strictEqual(resSync, null, `getCachedCinemeta should return null for malformed input: ${JSON.stringify(input)}`);
  }
  console.log('  ✅ Handled all malformed inputs without throwing errors.');

  // Edge case 2: Extreme Cache operations & Concurrency
  console.log('\n[Stress 2] Concurrency & High Load on LRUCache');
  const testCache = new LRUCache(50, 10);
  const tasks = [];
  for (let i = 0; i < 500; i++) {
    tasks.push((async (idx) => {
      const key = `key_${idx % 100}`;
      testCache.set(key, { data: `val_${idx}` });
      const val = testCache.get(key);
      if (val) {
        assert.ok(val.data.startsWith('val_'));
      }
    })(i));
  }
  await Promise.all(tasks);
  assert.ok(testCache.size <= 50, `Cache size ${testCache.size} must never exceed maxSize (50)`);
  console.log(`  ✅ Cache survived 500 concurrent operations, final size=${testCache.size}, evictions=${testCache.stats().evictions}`);

  // Edge case 3: Concurrent resolveCinemeta calls
  console.log('\n[Stress 3] Concurrent live resolution of diverse IMDb IDs');
  const ids = ['tt1375666', 'tt0111161', 'tt0468569', 'tt0068646', 'tt0109830'];
  const results = await Promise.all(ids.map(id => resolveCinemeta('movie', id)));
  assert.strictEqual(results.length, 5);
  results.forEach((r, idx) => {
    assert.ok(r, `ID ${ids[idx]} must resolve`);
    assert.ok(r.name, `Result must have name`);
    console.log(`  -> ${ids[idx]} resolved to "${r.name}" (${r.year})`);
  });
  console.log('  ✅ Concurrent resolution completed cleanly.');

  console.log('\n=== ALL ADVERSARIAL STRESS TESTS PASSED ===');
}

runStressTests().catch(err => {
  console.error('❌ STRESS TEST FAILED:', err);
  process.exit(1);
});
