'use strict';

const assert = require('assert');
const vsmov = require('../src/providers/vsmov');
const { imdbCache } = require('../src/lib/cache');

async function testAdversarial() {
  console.log('--- Adversarial Test 1: classifyServerAudio robustness ---');
  const testCases = [
    { input: null, expectedType: 'vietsub', expectedLabel: 'Vietsub' },
    { input: undefined, expectedType: 'vietsub', expectedLabel: 'Vietsub' },
    { input: '', expectedType: 'vietsub', expectedLabel: 'Vietsub' },
    { input: '   ', expectedType: 'vietsub', expectedLabel: 'Vietsub' },
    { input: 'Vietsub\n #1', expectedType: 'vietsub', expectedLabel: 'Vietsub' },
    { input: 'Lồng tiếng #1', expectedType: 'longtieng', expectedLabel: 'Lồng Tiếng' },
    { input: 'LỒNG TIẾNG', expectedType: 'longtieng', expectedLabel: 'Lồng Tiếng' },
    { input: 'Long Tieng VIP', expectedType: 'longtieng', expectedLabel: 'Lồng Tiếng' },
    { input: 'Thuyết minh #2', expectedType: 'thuyetminh', expectedLabel: 'Thuyết Minh' },
    { input: 'THUYẾT MINH #1', expectedType: 'thuyetminh', expectedLabel: 'Thuyết Minh' },
    { input: 'Thuyet Minh HD', expectedType: 'thuyetminh', expectedLabel: 'Thuyết Minh' },
    { input: 'Server VIP 1', expectedType: 'vietsub', expectedLabel: 'Vietsub' },
  ];

  for (const tc of testCases) {
    const res = vsmov.classifyServerAudio(tc.input);
    assert.strictEqual(res.type, tc.expectedType, `Failed for input "${tc.input}": expected type ${tc.expectedType}, got ${res.type}`);
    assert.strictEqual(res.label, tc.expectedLabel, `Failed for input "${tc.input}": expected label ${tc.expectedLabel}, got ${res.label}`);
    assert.ok(res.bingeGroup.startsWith('vsmov-'), `BingeGroup should start with vsmov-: got ${res.bingeGroup}`);
  }
  console.log('✅ classifyServerAudio passed all 12 test cases');

  console.log('--- Adversarial Test 2: Cache Integration ---');
  const testEmbedUrl = 'https://v5.streamvsmov.com/video/test-cache-hash/embed';
  const mockCacheValue = {
    masterPlaylistUrl: 'https://v5.streamvsmov.com/stream/test-cache-hash/master.m3u8',
    subtitleUrl: 'https://v5.streamvsmov.com/video/test-cache-hash/subtitle/vie_test.vtt',
  };
  imdbCache.set(`vsmov:embed:${testEmbedUrl}`, mockCacheValue, 60);

  const cachedRes = await vsmov.resolveEmbedMedia(testEmbedUrl, null);
  assert.strictEqual(cachedRes.masterPlaylistUrl, mockCacheValue.masterPlaylistUrl);
  assert.strictEqual(cachedRes.subtitleUrl, mockCacheValue.subtitleUrl);
  console.log('✅ Cache integration successfully short-circuits network calls');

  console.log('--- Adversarial Test 3: Fallback when embed subtitles are absent ---');
  const noSubEmbedUrl = 'https://v5.streamvsmov.com/video/test-no-sub/embed';
  imdbCache.set(`vsmov:embed:${noSubEmbedUrl}`, {
    masterPlaylistUrl: 'https://v5.streamvsmov.com/stream/test-no-sub/master.m3u8',
    subtitleUrl: null,
  }, 60);

  const noSubRes = await vsmov.resolveEmbedMedia(noSubEmbedUrl, null);
  assert.strictEqual(noSubRes.subtitleUrl, null);
  console.log('✅ Fallback when subtitle is absent correctly returns null subtitleUrl');

  console.log('--- Adversarial Test 4: Zero externalUrl guarantee on empty / invalid inputs ---');
  const emptyStreams = await vsmov.getStreams({});
  assert.ok(Array.isArray(emptyStreams));
  assert.strictEqual(emptyStreams.length, 0);

  const invalidStreams = await vsmov.getStreams({
    imdbId: 'tt99999999999_invalid',
    title: 'Non-existent title 12345!@#$%',
    type: 'movie',
    proxyBase: 'http://localhost:7000',
  });
  assert.ok(Array.isArray(invalidStreams));
  for (const s of invalidStreams) {
    assert.strictEqual(s.externalUrl, undefined);
    assert.ok(!('externalUrl' in s));
  }
  console.log('✅ Zero externalUrl invariant strictly maintained across empty and invalid calls');

  console.log('\n🎉 ALL ADVERSARIAL REVIEW CHECKS PASSED');
}

testAdversarial().catch((err) => {
  console.error('❌ Adversarial test failed:', err);
  process.exit(1);
});
