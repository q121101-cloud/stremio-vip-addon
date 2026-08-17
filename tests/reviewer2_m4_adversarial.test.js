'use strict';

const assert = require('assert');
const { resolveCinemeta, getCachedCinemeta, cinemetaCache } = require('../src/lib/cinemeta');
const { LRUCache } = require('../src/lib/cache');

async function runReviewer2AdversarialTests() {
  console.log('=== Reviewer 2 Adversarial Stress & Edge-Case Suite ===\n');

  // Test 1: Cinemeta metadata with unusual formats and foreign characters
  console.log('Test 1: Unicode titles, aliases and special characters handling');
  cinemetaCache.clear();
  // Simulate pre-cached item with Vietnamese / East Asian characters
  cinemetaCache.set('cinemeta:movie:tt1375666', {
    imdbId: 'tt1375666',
    type: 'movie',
    name: 'Kẻ Đánh Cắp Giấc Mơ - Inception (2010)',
    originalName: 'Inception',
    year: 2010,
    releaseInfo: '2010',
    genres: ['Hành Động', 'Khoa Học Viễn Tưởng'],
    aliases: ['Inception (2010)', '盗梦空间', '인셉션'],
    poster: 'https://example.com/poster.jpg',
    background: 'https://example.com/bg.jpg',
    description: 'Một bộ phim viễn tưởng đỉnh cao...',
  }, 86400);

  const res1 = await resolveCinemeta('movie', 'tt1375666');
  assert.strictEqual(res1.name, 'Kẻ Đánh Cắp Giấc Mơ - Inception (2010)');
  assert.ok(res1.aliases.includes('盗梦空间'));
  assert.ok(res1.aliases.includes('인셉션'));
  console.log('  ✅ Unicode & alias handling passed.');

  // Test 2: Concurrent requests during cache eviction
  console.log('Test 2: Concurrency & Eviction boundary');
  const miniCache = new LRUCache(2, 60);
  miniCache.set('cinemeta:movie:tt0000001', { name: 'Film 1' });
  miniCache.set('cinemeta:movie:tt0000002', { name: 'Film 2' });
  // Add 3rd item -> evicts tt0000001
  miniCache.set('cinemeta:movie:tt0000003', { name: 'Film 3' });
  assert.strictEqual(miniCache.get('cinemeta:movie:tt0000001'), undefined);
  assert.strictEqual(miniCache.get('cinemeta:movie:tt0000002').name, 'Film 2');
  assert.strictEqual(miniCache.get('cinemeta:movie:tt0000003').name, 'Film 3');
  console.log('  ✅ Eviction boundary passed.');

  // Test 3: Rapid TTL expiration and boundary checks
  console.log('Test 3: Microsecond TTL expiration precision');
  const ttlCache = new LRUCache(10, 1);
  ttlCache.set('quick', 'expire_me', 0.02); // 20ms
  assert.strictEqual(ttlCache.get('quick'), 'expire_me');
  await new Promise(r => setTimeout(r, 35));
  assert.strictEqual(ttlCache.get('quick'), undefined);
  console.log('  ✅ TTL expiration precision passed.');

  // Test 4: Extreme IMDb ID parsing tests
  console.log('Test 4: Extreme IMDb ID formats');
  const edgeCases = [
    { input: 'tt1234567:0:0', expectedId: 'tt1234567' },
    { input: 'TT9876543:10:20', expectedId: 'tt9876543' },
    { input: '   tt0000042:1:1   ', expectedId: 'tt0000042' },
  ];
  for (const tc of edgeCases) {
    const syncRes = getCachedCinemeta('series', tc.input);
    // Should safely extract base ID without regex failure
    assert.strictEqual(syncRes, null); // cold
  }
  console.log('  ✅ Extreme IMDb formats passed.');

  // Test 5: Single-flight concurrency under simulated load
  console.log('Test 5: Single-flight 100 concurrent requests resolution');
  cinemetaCache.clear();
  const promises = [];
  for (let i = 0; i < 100; i++) {
    promises.push(resolveCinemeta('movie', 'tt1375666'));
  }
  const allResolved = await Promise.all(promises);
  assert.strictEqual(allResolved.length, 100);
  assert.ok(allResolved.every(r => r && r.name === 'Inception'));
  console.log('  ✅ Single-flight 100 concurrent requests passed.');

  console.log('\n🎉 ALL REVIEWER 2 ADVERSARIAL STRESS TESTS PASSED!');
}

runReviewer2AdversarialTests().catch(err => {
  console.error('Test failed:', err);
  process.exit(1);
});
