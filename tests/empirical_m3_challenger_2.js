'use strict';

/**
 * ==============================================================================
 *  Challenger 2 Empirical & Adversarial Test Suite for Milestone 3 Gate (Extended)
 *
 *  Focus areas:
 *  1. src/mapper.js: Adversarial stress test of extractYear, unpackDeanEdwards,
 *     toSlug, cleanTitle, isM3u8Url, encodeBase64/decodeBase64, extractSeasonEpisode,
 *     normalizeServerName, scoreSimilarity.
 *  2. src/lib/cinemeta.js & src/lib/cache.js: Concurrency stress test, LRU
 *     cache eviction at limit, TTL expiry behavior, malformed/404 handling.
 *  3. src/routes/hls.js: Playlist rewriter with relative vs absolute URLs,
 *     query parameters, base64 referrer handling, CORS & MIME headers.
 *  4. src/handlers.js: Stream Aggregator error isolation, protocol exclusivity
 *     sanitization, config provider filtering.
 * ==============================================================================
 */

const assert = require('assert');
const axios = require('axios');
const mapper = require('../src/mapper');
const { LRUCache, cinemetaCache, m3u8Cache, imdbCache, detailCache } = require('../src/lib/cache');
const { resolveCinemeta, getCachedCinemeta } = require('../src/lib/cinemeta');
const hlsRouter = require('../src/routes/hls');
const handlersRouter = require('../src/handlers');

let totalTests = 0;
let passedTests = 0;
let failedTests = 0;
const failureDetails = [];

function runSyncTest(name, fn) {
  totalTests++;
  try {
    fn();
    passedTests++;
    console.log(`  [PASS] ${name}`);
  } catch (err) {
    failedTests++;
    console.error(`  [FAIL] ${name}\n         Error: ${err.message}`);
    failureDetails.push({ name, error: err.message, stack: err.stack });
  }
}

async function runAsyncTest(name, fn) {
  totalTests++;
  try {
    await fn();
    passedTests++;
    console.log(`  [PASS] ${name}`);
  } catch (err) {
    failedTests++;
    console.error(`  [FAIL] ${name}\n         Error: ${err.message}`);
    failureDetails.push({ name, error: err.message, stack: err.stack });
  }
}

function createMockContext(query = {}, headers = {}, params = {}) {
  const resHeaders = {};
  let statusCode = 200;
  let responseBody = null;
  let redirectUrl = null;

  const req = {
    params,
    query,
    headers: {
      'x-forwarded-host': 'localhost:7000',
      'x-forwarded-proto': 'http',
      ...headers,
    },
    protocol: 'http',
    get: (h) => headers[h.toLowerCase()] || (h === 'host' ? 'localhost:7000' : undefined),
  };

  const res = {
    headersSent: false,
    setHeader: (k, v) => { resHeaders[k.toLowerCase()] = v; },
    status: (code) => { statusCode = code; return res; },
    send: (body) => { responseBody = body; res.headersSent = true; return res; },
    json: (body) => { responseBody = body; res.headersSent = true; return res; },
    redirect: (code, url) => {
      if (typeof code === 'string') { url = code; code = 302; }
      statusCode = code;
      redirectUrl = url;
      res.headersSent = true;
      return res;
    },
    end: () => { res.headersSent = true; return res; },
  };

  return {
    req,
    res,
    getResult: () => ({
      statusCode,
      headers: resHeaders,
      body: responseBody,
      redirectUrl,
    }),
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// SUITE 1: src/mapper.js Adversarial Testing
// ─────────────────────────────────────────────────────────────────────────────
async function suite1Mapper() {
  console.log('\n================================================================');
  console.log('  SUITE 1: src/mapper.js Adversarial & Stress Testing');
  console.log('================================================================\n');

  // --- 1.1 extractYear ---
  console.log('--- 1.1 mapper.extractYear ---');

  runSyncTest('extractYear: numeric boundary values (1800 to 2100)', () => {
    assert.strictEqual(mapper.extractYear(1800), 1800, 'Lower bound 1800');
    assert.strictEqual(mapper.extractYear(2024), 2024, 'Current year 2024');
    assert.strictEqual(mapper.extractYear(2100), 2100, 'Upper bound 2100');
  });

  runSyncTest('extractYear: out-of-range and invalid numbers return null', () => {
    assert.strictEqual(mapper.extractYear(1799), null, 'Below lower bound 1799');
    assert.strictEqual(mapper.extractYear(2101), null, 'Above upper bound 2101');
    assert.strictEqual(mapper.extractYear(-2024), null, 'Negative number');
    assert.strictEqual(mapper.extractYear(0), null, 'Zero');
    assert.strictEqual(mapper.extractYear(NaN), null, 'NaN');
    assert.strictEqual(mapper.extractYear(Infinity), null, 'Infinity');
    assert.strictEqual(mapper.extractYear(-Infinity), null, '-Infinity');
  });

  runSyncTest('extractYear: strings with single 4-digit years', () => {
    assert.strictEqual(mapper.extractYear('1994'), 1994);
    assert.strictEqual(mapper.extractYear('2010'), 2010);
    assert.strictEqual(mapper.extractYear('  2025  '), 2025);
    assert.strictEqual(mapper.extractYear('Film (2023) 1080p'), 2023);
  });

  runSyncTest('extractYear: multi-year strings and ranges (extracts first valid year)', () => {
    assert.strictEqual(mapper.extractYear('2008–2013'), 2008, 'En-dash series range');
    assert.strictEqual(mapper.extractYear('2008-2013'), 2008, 'Hyphen series range');
    assert.strictEqual(mapper.extractYear('1999/2000'), 1999, 'Slash range');
    assert.strictEqual(mapper.extractYear('Released in 1995, remastered in 2020'), 1995, 'Multi-year sentence');
  });

  runSyncTest('extractYear: complex string dates (ISO, timestamps, titles)', () => {
    assert.strictEqual(mapper.extractYear('2024-05-12T00:00:00.000Z'), 2024, 'ISO Date string');
    assert.strictEqual(mapper.extractYear('2001: A Space Odyssey'), 2001, 'Title starting with year');
    assert.strictEqual(mapper.extractYear('Blade Runner 2049'), 2049, 'Title ending with year');
    assert.strictEqual(mapper.extractYear('Cyberpunk 2077: Edgerunners'), 2077, 'Title with 2077');
    assert.strictEqual(mapper.extractYear('Năm phát hành: 2021'), 2021, 'Vietnamese text with year');
  });

  runSyncTest('extractYear: strings with invalid years or non-year numbers return null', () => {
    assert.strictEqual(mapper.extractYear('Resolution 1080p 60fps'), null, '1080 resolution is not year');
    assert.strictEqual(mapper.extractYear('Top 500 Movies'), null, '500 is not year');
    assert.strictEqual(mapper.extractYear('Year 1750'), null, '1750 is out of bounds');
    assert.strictEqual(mapper.extractYear('Year 3000'), null, '3000 is out of bounds');
    assert.strictEqual(mapper.extractYear('No numbers here'), null, 'No numbers');
    assert.strictEqual(mapper.extractYear(''), null, 'Empty string');
    assert.strictEqual(mapper.extractYear('   '), null, 'Whitespace string');
  });

  runSyncTest('extractYear: structured NguonC category object', () => {
    const validNguonC = {
      '1': { group: { name: 'Định dạng' }, list: [{ name: 'Phim lẻ' }] },
      '2': { group: { name: 'Năm' }, list: [{ name: '2022' }] },
    };
    assert.strictEqual(mapper.extractYear(validNguonC), 2022);

    const emptyListNguonC = {
      '1': { group: { name: 'Năm' }, list: [] },
    };
    assert.strictEqual(mapper.extractYear(emptyListNguonC), null);

    const invalidYearNguonC = {
      '1': { group: { name: 'Năm' }, list: [{ name: 'Không xác định' }] },
    };
    assert.strictEqual(mapper.extractYear(invalidYearNguonC), null);
  });

  runSyncTest('extractYear: object with year, releaseInfo, or name properties', () => {
    assert.strictEqual(mapper.extractYear({ year: 2020 }), 2020);
    assert.strictEqual(mapper.extractYear({ year: '2021' }), 2021);
    assert.strictEqual(mapper.extractYear({ releaseInfo: '2015–2018' }), 2015);
    assert.strictEqual(mapper.extractYear({ name: 'The Matrix (1999)' }), 1999);
    assert.strictEqual(mapper.extractYear({ year: { year: 2023 } }), 2023, 'Nested year object');
    assert.strictEqual(mapper.extractYear({}), null, 'Empty object');
    assert.strictEqual(mapper.extractYear({ year: null }), null, 'Null year property');
    assert.strictEqual(mapper.extractYear(Object.create(null)), null, 'Prototype-less object');
  });

  runSyncTest('extractYear: edge-case primitives (null, undefined, bool, symbols, functions)', () => {
    assert.strictEqual(mapper.extractYear(null), null);
    assert.strictEqual(mapper.extractYear(undefined), null);
    assert.strictEqual(mapper.extractYear(true), null);
    assert.strictEqual(mapper.extractYear(false), null);
    assert.strictEqual(mapper.extractYear(Symbol('2020')), null);
    assert.strictEqual(mapper.extractYear(() => 2020), null);
    assert.strictEqual(mapper.extractYear([]), null);
  });

  // --- 1.2 unpackDeanEdwards ---
  console.log('\n--- 1.2 mapper.unpackDeanEdwards ---');

  runSyncTest('unpackDeanEdwards: standard base62 encoded packer script', () => {
    const packed = `eval(function(p,a,c,k,e,d){e=function(c){return c.toString(36)};if(!''.replace(/^/,String)){while(c--){d[c.toString(a)]=k[c]||c.toString(a)}k=[function(e){return d[e]}];e=function(){return'\\\\w+'};c=1};while(c--){if(k[c]){p=p.replace(new RegExp('\\\\b'+e(c)+'\\\\b','g'),k[c])}}return p}('0 1=2;',3,3,'var|foo|10'.split('|'),0,{}))`;
    const unpacked = mapper.unpackDeanEdwards(packed);
    assert(unpacked !== null, 'Unpacked output must not be null');
    assert(unpacked.includes('var foo=10;'), `Expected 'var foo=10;', got: ${unpacked}`);
  });

  runSyncTest('unpackDeanEdwards: high radix (62) with alphanumeric symbols & video URL', () => {
    const payload = '4 0="5://6.7/8/9.1";1.2(0);3.a("b");';
    const symtab = 'streamUrl|console|log|player|const|https|cdn|example|live|master|play|ready';
    const packed = `eval(function(p,a,c,k,e,d){e=function(c){return(c<a?'':e(parseInt(c/a)))+((c=c%a)>35?String.fromCharCode(c+29):c.toString(36))};if(!''.replace(/^/,String)){while(c--){d[e(c)]=k[c]||e(c)}k=[function(e){return d[e]}];e=function(){return'\\\\w+'};c=1};while(c--){if(k[c]){p=p.replace(new RegExp('\\\\b'+e(c)+'\\\\b','g'),k[c])}}return p}('${payload}',62,12,'${symtab}'.split('|'),0,{}))`;

    const unpacked = mapper.unpackDeanEdwards(packed);
    assert(unpacked !== null, 'Unpacked must not be null');
    assert(unpacked.includes('https://cdn.example/live/master.log') || unpacked.includes('https://cdn.example/live/master'), `Unpacked result: ${unpacked}`);
    assert(unpacked.includes('player.play("ready")') || unpacked.includes('player.play'), `Unpacked result: ${unpacked}`);
  });

  runSyncTest('unpackDeanEdwards: parameter name variant (function(p,a,c,k,e,r))', () => {
    const packed = `eval(function(p,a,c,k,e,r){return p}('0 1=2;',3,3,'let|x|99'.split('|')))`;
    const unpacked = mapper.unpackDeanEdwards(packed);
    assert(unpacked !== null, 'Should support `r` parameter');
    assert(unpacked.includes('let x=99;'), `Expected 'let x=99;', got: ${unpacked}`);
  });

  runSyncTest('unpackDeanEdwards: non-packer scripts and invalid inputs return null without crashing', () => {
    assert.strictEqual(mapper.unpackDeanEdwards('function normalJs() { return 123; }'), null);
    assert.strictEqual(mapper.unpackDeanEdwards('var x = "eval(function() {})";'), null);
    assert.strictEqual(mapper.unpackDeanEdwards(''), null);
    assert.strictEqual(mapper.unpackDeanEdwards(null), null);
    assert.strictEqual(mapper.unpackDeanEdwards(undefined), null);
    assert.strictEqual(mapper.unpackDeanEdwards(12345), null);
    assert.strictEqual(mapper.unpackDeanEdwards({}), null);
    assert.strictEqual(mapper.unpackDeanEdwards('eval(function(p,a,c,k,e,d){malformed}('), null);
  });

  // --- 1.3 toSlug ---
  console.log('\n--- 1.3 mapper.toSlug ---');

  runSyncTest('toSlug: Vietnamese diacritics with compound tone marks', () => {
    assert.strictEqual(mapper.toSlug('Tà Đạo Thành Thần'), 'ta-dao-thanh-than');
    assert.strictEqual(mapper.toSlug('Người Đàn Ông Thép (2013)'), 'nguoi-dan-ong-thep-2013');
    assert.strictEqual(mapper.toSlug('ĐỒNG CHÍ & ĐỒNG ĐỘI'), 'dong-chi-dong-doi');
    assert.strictEqual(mapper.toSlug('Hà Nội Mùa Vắng Những Cơn Mưa'), 'ha-noi-mua-vang-nhung-con-mua');
    assert.strictEqual(mapper.toSlug('ắ ằ ẳ ẵ ặ ê ế ề ể ễ ệ ô ố ồ ổ ỗ ộ ư ứ ừ ử ữ ự'), 'a-a-a-a-a-e-e-e-e-e-e-o-o-o-o-o-o-u-u-u-u-u-u');
  });

  runSyncTest('toSlug: special symbols, emojis, and boundary hyphens', () => {
    assert.strictEqual(mapper.toSlug('  ---Spider-Man: No Way Home (2021) [1080p] @VIP! ---  '), 'spider-man-no-way-home-2021-1080p-vip');
    assert.strictEqual(mapper.toSlug('Test---with----multiple------dashes'), 'test-with-multiple-dashes');
    assert.strictEqual(mapper.toSlug('Special #$%^&*()_+ Characters'), 'special-characters');
    assert.strictEqual(mapper.toSlug('Movie 🎬 2024 ⚡ VIP'), 'movie-2024-vip');
  });

  runSyncTest('toSlug: non-string and empty inputs return empty string', () => {
    assert.strictEqual(mapper.toSlug(''), '');
    assert.strictEqual(mapper.toSlug(null), '');
    assert.strictEqual(mapper.toSlug(undefined), '');
    assert.strictEqual(mapper.toSlug(12345), '');
    assert.strictEqual(mapper.toSlug({}), '');
  });

  // --- 1.4 cleanTitle ---
  console.log('\n--- 1.4 mapper.cleanTitle ---');

  runSyncTest('cleanTitle: removes brackets, years, and clean delimiters', () => {
    assert.strictEqual(mapper.cleanTitle('Inception (2010) [1080p]'), 'Inception');
    assert.strictEqual(mapper.cleanTitle('Breaking Bad (2008-2013) [Vietsub + Thuyết Minh]'), 'Breaking Bad');
    assert.strictEqual(mapper.cleanTitle('Spider-Man: Homecoming_2017.HD [1080p]'), 'Spider Man Homecoming HD');
    assert.strictEqual(mapper.cleanTitle('Phim Mới (2020) (Vietsub) [Thuyết Minh] [1080p]'), 'Phim Mới');
  });

  runSyncTest('cleanTitle: handles null, undefined, empty, and non-strings safely', () => {
    assert.strictEqual(mapper.cleanTitle(''), '');
    assert.strictEqual(mapper.cleanTitle(null), '');
    assert.strictEqual(mapper.cleanTitle(undefined), '');
    assert.strictEqual(mapper.cleanTitle(12345), '');
  });

  // --- 1.5 isM3u8Url ---
  console.log('\n--- 1.5 mapper.isM3u8Url ---');

  runSyncTest('isM3u8Url: valid HLS stream indicators', () => {
    assert.strictEqual(mapper.isM3u8Url('https://example.com/master.m3u8'), true);
    assert.strictEqual(mapper.isM3u8Url('https://example.com/master.m3u8?token=xyz&expires=123'), true);
    assert.strictEqual(mapper.isM3u8Url('https://example.com/hls/live/stream/chunk.ts'), true);
    assert.strictEqual(mapper.isM3u8Url('https://example.com/playlist/720p'), true);
    assert.strictEqual(mapper.isM3u8Url('http://127.0.0.1:8080/manifest.m3u8'), true);
  });

  runSyncTest('isM3u8Url: non-HLS URLs, empty, and invalid inputs', () => {
    assert.strictEqual(mapper.isM3u8Url('https://example.com/video.mp4'), false);
    assert.strictEqual(mapper.isM3u8Url('https://example.com/video.mkv'), false);
    assert.strictEqual(mapper.isM3u8Url('https://example.com/embed/player?id=123'), false);
    assert.strictEqual(mapper.isM3u8Url(''), false);
    assert.strictEqual(mapper.isM3u8Url(null), false);
    assert.strictEqual(mapper.isM3u8Url(undefined), false);
    assert.strictEqual(mapper.isM3u8Url(12345), false);
  });

  // --- 1.6 encodeBase64 / decodeBase64 ---
  console.log('\n--- 1.6 mapper.encodeBase64 & decodeBase64 ---');

  runSyncTest('encodeBase64 / decodeBase64: URL-safe encoding & lossless round-trip', () => {
    const complexUrls = [
      'https://phim.nguonc.com/embed/test?v=1&lang=vi&token=a+b/c==',
      'https://cdn.example.com/master.m3u8?sig=123_456-789~xyz',
      'https://phimapi.com/phim/kẻ-đánh-cắp-giấc-mơ (2010)?type=full',
      'Plain string without special chars',
      '{"json":"data","nested":{"array":[1,2,3]}}',
    ];

    for (const url of complexUrls) {
      const encoded = mapper.encodeBase64(url);
      assert(!encoded.includes('+'), `Base64URL must not contain '+': ${encoded}`);
      assert(!encoded.includes('/'), `Base64URL must not contain '/': ${encoded}`);
      assert(!encoded.includes('='), `Base64URL must not contain '=' padding: ${encoded}`);

      const decoded = mapper.decodeBase64(encoded);
      assert.strictEqual(decoded, url, `Round-trip mismatch for "${url}"`);
    }
  });

  runSyncTest('encodeBase64 / decodeBase64: handles empty, null, undefined, and corrupt base64', () => {
    assert.strictEqual(mapper.encodeBase64(''), '');
    assert.strictEqual(mapper.encodeBase64(null), '');
    assert.strictEqual(mapper.encodeBase64(undefined), '');

    assert.strictEqual(mapper.decodeBase64(''), '');
    assert.strictEqual(mapper.decodeBase64(null), '');
    assert.strictEqual(mapper.decodeBase64(undefined), '');
  });

  // --- 1.7 Helper Functions (extractSeasonEpisode, normalizeServerName, scoreSimilarity) ---
  console.log('\n--- 1.7 mapper helper utilities ---');

  runSyncTest('extractSeasonEpisode: parses diverse series notations', () => {
    assert.deepStrictEqual(mapper.extractSeasonEpisode('S03E14'), { season: 3, episode: 14 });
    assert.deepStrictEqual(mapper.extractSeasonEpisode('Season 2 Episode 09'), { season: 2, episode: 9 });
    assert.deepStrictEqual(mapper.extractSeasonEpisode('Tập 12'), { season: 1, episode: 12 });
    assert.deepStrictEqual(mapper.extractSeasonEpisode('Ep 25'), { season: 1, episode: 25 });
    assert.deepStrictEqual(mapper.extractSeasonEpisode('Tập 0'), { season: 1, episode: 0 });
    assert.deepStrictEqual(mapper.extractSeasonEpisode('Full Movie'), { season: null, episode: null });
    assert.deepStrictEqual(mapper.extractSeasonEpisode(null), { season: null, episode: null });
  });

  runSyncTest('normalizeServerName: strips # and handles fallbacks', () => {
    assert.strictEqual(mapper.normalizeServerName('Vietsub #1'), 'Vietsub 1');
    assert.strictEqual(mapper.normalizeServerName('### VIP Server ###'), 'VIP Server');
    assert.strictEqual(mapper.normalizeServerName(''), 'Server 1');
    assert.strictEqual(mapper.normalizeServerName(null, 'Custom Default'), 'Custom Default');
  });

  runSyncTest('scoreSimilarity: accurately scores title similarity', () => {
    assert.strictEqual(mapper.scoreSimilarity('Inception', 'Inception'), 1);
    assert.strictEqual(mapper.scoreSimilarity('', 'Inception'), 0);
    assert.strictEqual(mapper.scoreSimilarity('A', 'B'), 0);
    assert(mapper.scoreSimilarity('Spider-Man', 'Spider-Man 2') > 0.5);
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// SUITE 2: src/lib/cinemeta.js & LRU Cache Concurrency and Expiry
// ─────────────────────────────────────────────────────────────────────────────
async function suite2CinemetaAndCache() {
  console.log('\n================================================================');
  console.log('  SUITE 2: src/lib/cinemeta.js & LRUCache Concurrency / Expiry');
  console.log('================================================================\n');

  // --- 2.1 LRUCache Mechanics ---
  console.log('--- 2.1 LRUCache Mechanics ---');

  runSyncTest('LRUCache: strict capacity limit and LRU eviction order', () => {
    const cache = new LRUCache(3, 300);

    cache.set('a', 'alpha');
    cache.set('b', 'beta');
    cache.set('c', 'gamma');
    assert.strictEqual(cache.size, 3);

    // Access 'a' so 'b' becomes oldest (LRU)
    assert.strictEqual(cache.get('a'), 'alpha');

    // Insert 'd' -> 'b' should be evicted
    cache.set('d', 'delta');
    assert.strictEqual(cache.size, 3, 'Cache size should stay at maxSize');
    assert.strictEqual(cache.get('b'), undefined, 'Key "b" must be evicted');
    assert.strictEqual(cache.get('a'), 'alpha', 'Key "a" must remain');
    assert.strictEqual(cache.get('c'), 'gamma', 'Key "c" must remain');
    assert.strictEqual(cache.get('d'), 'delta', 'Key "d" must remain');

    const stats = cache.stats();
    assert.strictEqual(stats.evictions, 1, 'Evictions counter must be 1');
  });

  runSyncTest('LRUCache: re-inserting existing key updates value & refreshes LRU position without eviction', () => {
    const cache = new LRUCache(2, 300);
    cache.set('k1', 'val1');
    cache.set('k2', 'val2');

    // Update k1
    cache.set('k1', 'val1_updated');
    assert.strictEqual(cache.size, 2);

    // Insert k3 -> k2 should be evicted because k1 was refreshed
    cache.set('k3', 'val3');
    assert.strictEqual(cache.get('k2'), undefined, 'k2 should be evicted');
    assert.strictEqual(cache.get('k1'), 'val1_updated', 'k1 should be preserved');
    assert.strictEqual(cache.get('k3'), 'val3', 'k3 should be preserved');
  });

  await runAsyncTest('LRUCache: TTL expiry and prune() cleanup', async () => {
    const cache = new LRUCache(10, 1);

    // Set item with 50ms TTL
    cache.set('quick', 'fast_value', 0.05); // 50ms
    cache.set('slow', 'slow_value', 10);    // 10 seconds

    assert.strictEqual(cache.get('quick'), 'fast_value', 'Immediate get should hit');
    assert.strictEqual(cache.get('slow'), 'slow_value', 'Immediate get should hit');

    // Wait 70ms
    await new Promise((r) => setTimeout(r, 70));

    assert.strictEqual(cache.get('quick'), undefined, 'Expired item should return undefined on get()');
    assert.strictEqual(cache.get('slow'), 'slow_value', 'Non-expired item should still be present');

    // Test prune()
    cache.set('expired1', 'v1', 0.01);
    cache.set('expired2', 'v2', 0.01);
    await new Promise((r) => setTimeout(r, 20));

    const prunedCount = cache.prune();
    assert.strictEqual(prunedCount, 2, 'prune() should remove exactly 2 expired items');
    assert.strictEqual(cache.get('slow'), 'slow_value', 'Active item survives prune()');
  });

  runSyncTest('LRUCache: stats tracking (hits, misses, hitRate)', () => {
    const cache = new LRUCache(5, 60);
    cache.set('x', 100);

    cache.get('x'); // hit
    cache.get('x'); // hit
    cache.get('y'); // miss
    cache.get('z'); // miss

    const stats = cache.stats();
    assert.strictEqual(stats.hits, 2);
    assert.strictEqual(stats.misses, 2);
    assert.strictEqual(stats.hitRate, '50.0%');
  });

  // --- 2.2 Cinemeta Resolver Concurrency & ID Normalization ---
  console.log('\n--- 2.2 Cinemeta Resolver Stress & Normalization ---');

  await runAsyncTest('resolveCinemeta: normalizes uppercase, strips season/episode, and uses cache', async () => {
    cinemetaCache.clear();

    const mockMeta = {
      imdbId: 'tt1375666',
      type: 'movie',
      name: 'Inception',
      originalName: 'Inception',
      year: 2010,
      releaseInfo: '2010',
      genres: ['Action', 'Sci-Fi'],
      aliases: ['Inception (2010)'],
      poster: 'https://example.com/poster.jpg',
      background: 'https://example.com/bg.jpg',
      description: 'Dream within a dream',
    };

    // Pre-populate cache
    cinemetaCache.set('cinemeta:movie:tt1375666', mockMeta, 86400);

    // Test variations of ID format
    const res1 = await resolveCinemeta('movie', 'tt1375666');
    const res2 = await resolveCinemeta('movie', 'TT1375666');
    const res3 = await resolveCinemeta('movie', '  TT1375666:1:5  ');

    assert.deepStrictEqual(res1, mockMeta);
    assert.deepStrictEqual(res2, mockMeta);
    assert.deepStrictEqual(res3, mockMeta);

    // Test sync getCachedCinemeta
    assert.deepStrictEqual(getCachedCinemeta('movie', 'TT1375666'), mockMeta);
    assert.deepStrictEqual(getCachedCinemeta('movie', 'tt1375666:1:1'), mockMeta);
    assert.strictEqual(getCachedCinemeta('movie', 'invalid_id'), null);
  });

  await runAsyncTest('resolveCinemeta: rejects malformed IDs gracefully without API call', async () => {
    const invalidIds = ['tt', 'ttABC', 'movie-12345', 'nguonc:ke-danh-cap', '', null, undefined, 12345];
    for (const id of invalidIds) {
      const res = await resolveCinemeta('movie', id);
      assert.strictEqual(res, null, `Invalid ID "${id}" must resolve to null`);
    }
  });

  await runAsyncTest('resolveCinemeta: massive concurrency stress test (250 concurrent requests)', async () => {
    cinemetaCache.clear();

    // Populate a set of cached entries
    for (let i = 1; i <= 50; i++) {
      const id = `tt${String(i).padStart(7, '0')}`;
      cinemetaCache.set(`cinemeta:movie:${id}`, {
        imdbId: id,
        type: 'movie',
        name: `Movie ${i}`,
        year: 2000 + (i % 25),
        genres: ['Drama'],
        aliases: [],
      }, 86400);
    }

    const concurrentCalls = [];
    // 250 requests: 200 hits on cached items with varying case and season/ep suffixes, 50 invalid IDs
    for (let j = 0; j < 200; j++) {
      const idNum = (j % 50) + 1;
      const rawId = j % 2 === 0
        ? `TT${String(idNum).padStart(7, '0')}:${(j % 5) + 1}:${(j % 10) + 1}`
        : `tt${String(idNum).padStart(7, '0')}`;
      concurrentCalls.push(resolveCinemeta('movie', rawId));
    }
    for (let k = 0; k < 50; k++) {
      concurrentCalls.push(resolveCinemeta('movie', `invalid_${k}`));
    }

    const results = await Promise.all(concurrentCalls);
    assert.strictEqual(results.length, 250);

    // Verify first 200 resolved successfully
    for (let j = 0; j < 200; j++) {
      const idNum = (j % 50) + 1;
      const expectedId = `tt${String(idNum).padStart(7, '0')}`;
      assert(results[j] !== null, `Request #${j} failed`);
      assert.strictEqual(results[j].imdbId, expectedId);
      assert.strictEqual(results[j].name, `Movie ${idNum}`);
    }

    // Verify last 50 returned null
    for (let k = 200; k < 250; k++) {
      assert.strictEqual(results[k], null);
    }
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// SUITE 3: src/routes/hls.js Playlist Rewriter & Proxy Testing
// ─────────────────────────────────────────────────────────────────────────────
async function suite3HlsProxy() {
  console.log('\n================================================================');
  console.log('  SUITE 3: src/routes/hls.js Playlist Rewriter & Proxy Testing');
  console.log('================================================================\n');

  function findRouteHandler(router, path, method = 'get') {
    for (const layer of router.stack) {
      if (layer.route) {
        const routePath = layer.route.path;
        const matchesPath = Array.isArray(routePath)
          ? routePath.includes(path)
          : routePath === path;
        if (matchesPath && layer.route.methods[method.toLowerCase()]) {
          return layer.route.stack[0].handle;
        }
      }
    }
    return null;
  }

  const manifestHandler = findRouteHandler(hlsRouter, '/manifest.m3u8');
  const extractHandler = findRouteHandler(hlsRouter, '/extract');
  const tsHandler = findRouteHandler(hlsRouter, '/ts');

  assert(typeof manifestHandler === 'function', 'manifestHandler found');
  assert(typeof extractHandler === 'function', 'extractHandler found');
  assert(typeof tsHandler === 'function', 'tsHandler found');

  const originalAdapter = axios.defaults.adapter;

  // --- 3.1 Master Playlist Rewriter ---
  console.log('--- 3.1 Master Playlist Rewriter ---');

  await runAsyncTest('manifest.m3u8: rewrites relative and absolute sub-playlists with proxy URL', async () => {
    m3u8Cache.clear();

    const mockMasterM3u8 = `#EXTM3U
#EXT-X-VERSION:3
#EXT-X-STREAM-INF:BANDWIDTH=1280000,RESOLUTION=1920x1080
1080p/index.m3u8
#EXT-X-STREAM-INF:BANDWIDTH=800000,RESOLUTION=1280x720
/720p/index.m3u8
#EXT-X-STREAM-INF:BANDWIDTH=400000
https://cdn2.example.com/480p/index.m3u8?token=xyz
#EXT-X-MEDIA:TYPE=AUDIO,GROUP-ID="audio",NAME="English",DEFAULT=YES,URI="audio/eng.m3u8"
`;

    let capturedHeaders = null;
    axios.defaults.adapter = async (config) => {
      capturedHeaders = config.headers;
      return {
        data: mockMasterM3u8,
        status: 200,
        statusText: 'OK',
        headers: { 'content-type': 'application/vnd.apple.mpegurl' },
        config,
      };
    };

    try {
      const proxyTargetUrl = 'https://cdn.example.com/live/master.m3u8';
      const b64Target = mapper.encodeBase64(proxyTargetUrl);
      const b64Ref = mapper.encodeBase64('https://phim.nguonc.com/');

      const { req, res, getResult } = createMockContext({
        b64: b64Target,
        ref: b64Ref,
      });

      await manifestHandler(req, res);
      const result = getResult();

      assert.strictEqual(result.statusCode, 200);
      assert.strictEqual(result.headers['access-control-allow-origin'], '*');
      assert(result.headers['content-type'].includes('application/vnd.apple.mpegurl'));
      assert.strictEqual(capturedHeaders['Referer'], 'https://phim.nguonc.com/');

      const lines = result.body.split('\n');

      // Check relative sub-playlist 1: "1080p/index.m3u8"
      const line1080 = lines.find((l) => l.includes('/hls/manifest.m3u8') && !l.startsWith('#'));
      assert(line1080, 'Must have rewritten sub-playlist line');
      const u1 = new URL(line1080);
      const decodedTarget1 = mapper.decodeBase64(u1.searchParams.get('b64'));
      assert.strictEqual(decodedTarget1, 'https://cdn.example.com/live/1080p/index.m3u8', 'Relative 1080p URL must resolve against master.m3u8 base');

      // Check root-relative sub-playlist: "/720p/index.m3u8"
      const line720 = lines.filter((l) => l.includes('/hls/manifest.m3u8') && !l.startsWith('#'))[1];
      assert(line720, 'Must have rewritten /720p line');
      const u2 = new URL(line720);
      const decodedTarget2 = mapper.decodeBase64(u2.searchParams.get('b64'));
      assert.strictEqual(decodedTarget2, 'https://cdn.example.com/720p/index.m3u8', 'Root-relative /720p URL must resolve against origin');

      // Check absolute sub-playlist: "https://cdn2.example.com/480p/index.m3u8?token=xyz"
      const line480 = lines.filter((l) => l.includes('/hls/manifest.m3u8') && !l.startsWith('#'))[2];
      assert(line480, 'Must have rewritten 480p line');
      const u3 = new URL(line480);
      const decodedTarget3 = mapper.decodeBase64(u3.searchParams.get('b64'));
      assert.strictEqual(decodedTarget3, 'https://cdn2.example.com/480p/index.m3u8?token=xyz', 'Absolute URL & query params preserved');

      // Check #EXT-X-MEDIA URI
      const mediaLine = lines.find((l) => l.startsWith('#EXT-X-MEDIA'));
      assert(mediaLine, 'Must include #EXT-X-MEDIA line');
      const mediaMatch = mediaLine.match(/URI="([^"]+)"/);
      assert(mediaMatch, 'EXT-X-MEDIA must have URI attribute');
      const mediaUrl = new URL(mediaMatch[1]);
      const decodedMediaTarget = mapper.decodeBase64(mediaUrl.searchParams.get('b64'));
      assert.strictEqual(decodedMediaTarget, 'https://cdn.example.com/live/audio/eng.m3u8', 'Audio URI must resolve against master.m3u8 base');
    } finally {
      axios.defaults.adapter = originalAdapter;
    }
  });

  // --- 3.2 Media Playlist (Segments, Key, Map) Rewriter ---
  console.log('\n--- 3.2 Media Playlist & Segments Rewriter ---');

  await runAsyncTest('manifest.m3u8: rewrites segments, AES-128 keys, and init maps to /hls/ts proxy', async () => {
    m3u8Cache.clear();

    const mockMediaM3u8 = `#EXTM3U
#EXT-X-VERSION:3
#EXT-X-TARGETDURATION:10
#EXT-X-KEY:METHOD=AES-128,URI="keys/key.php?id=123"
#EXT-X-MAP:URI="init.mp4"
#EXTINF:9.009,
segment_001.ts
#EXTINF:9.009,
../segments/segment_002.ts?key=abc&sig=123
#EXTINF:9.009,
https://cdn.example.com/media/segment_003.ts
#EXT-X-ENDLIST
`;

    axios.defaults.adapter = async (config) => {
      return {
        data: mockMediaM3u8,
        status: 200,
        statusText: 'OK',
        headers: { 'content-type': 'application/vnd.apple.mpegurl' },
        config,
      };
    };

    try {
      const mediaUrl = 'https://cdn.example.com/live/1080p/index.m3u8';
      const b64MediaUrl = mapper.encodeBase64(mediaUrl);

      const { req, res, getResult } = createMockContext({ b64: b64MediaUrl });
      await manifestHandler(req, res);
      const result = getResult();

      assert.strictEqual(result.statusCode, 200);
      const lines = result.body.split('\n');

      // Check AES key line
      const keyLine = lines.find((l) => l.startsWith('#EXT-X-KEY'));
      assert(keyLine, 'Must have #EXT-X-KEY');
      const keyMatch = keyLine.match(/URI="([^"]+)"/);
      assert(keyMatch, 'Key must have URI');
      const keyUrl = new URL(keyMatch[1]);
      assert(keyUrl.pathname.includes('/hls/ts'), 'Key URI must point to /hls/ts');
      assert.strictEqual(keyUrl.searchParams.get('is_key'), '1', 'Key URI must include is_key=1');
      const decodedKey = mapper.decodeBase64(keyUrl.searchParams.get('b64'));
      assert.strictEqual(decodedKey, 'https://cdn.example.com/live/1080p/keys/key.php?id=123');

      // Check Map line
      const mapLine = lines.find((l) => l.startsWith('#EXT-X-MAP'));
      assert(mapLine, 'Must have #EXT-X-MAP');
      const mapMatch = mapLine.match(/URI="([^"]+)"/);
      assert(mapMatch, 'Map must have URI');
      const mapUrl = new URL(mapMatch[1]);
      assert(mapUrl.pathname.includes('/hls/ts'), 'Map URI must point to /hls/ts');
      const decodedMap = mapper.decodeBase64(mapUrl.searchParams.get('b64'));
      assert.strictEqual(decodedMap, 'https://cdn.example.com/live/1080p/init.mp4');

      // Check segment lines
      const segLines = lines.filter((l) => l.includes('/hls/ts') && !l.startsWith('#'));
      assert.strictEqual(segLines.length, 3, 'Must have 3 rewritten segment lines');

      // Segment 1: "segment_001.ts"
      const uSeg1 = new URL(segLines[0]);
      assert.strictEqual(mapper.decodeBase64(uSeg1.searchParams.get('b64')), 'https://cdn.example.com/live/1080p/segment_001.ts');

      // Segment 2: "../segments/segment_002.ts?key=abc&sig=123"
      const uSeg2 = new URL(segLines[1]);
      assert.strictEqual(mapper.decodeBase64(uSeg2.searchParams.get('b64')), 'https://cdn.example.com/live/segments/segment_002.ts?key=abc&sig=123');

      // Segment 3: "https://cdn.example.com/media/segment_003.ts"
      const uSeg3 = new URL(segLines[2]);
      assert.strictEqual(mapper.decodeBase64(uSeg3.searchParams.get('b64')), 'https://cdn.example.com/media/segment_003.ts');
    } finally {
      axios.defaults.adapter = originalAdapter;
    }
  });

  // --- 3.3 Segment Proxy Streaming & Headers ---
  console.log('\n--- 3.3 Segment Proxy Streaming & Headers ---');

  await runAsyncTest('GET /hls/ts: streams segment binary data with video/mp2t and CORS', async () => {
    let pipedToRes = false;

    axios.defaults.adapter = async (config) => {
      return {
        data: {
          pipe: (destination) => {
            pipedToRes = true;
            destination.end();
          },
          on: () => {},
        },
        status: 200,
        statusText: 'OK',
        headers: { 'content-length': '188' },
        config,
      };
    };

    try {
      const segUrl = 'https://cdn.example.com/segment_001.ts';
      const b64Seg = mapper.encodeBase64(segUrl);

      const { req, res, getResult } = createMockContext({ b64: b64Seg });
      await tsHandler(req, res);
      const result = getResult();

      assert(pipedToRes, 'Data stream was piped to response');
      assert.strictEqual(result.headers['access-control-allow-origin'], '*');
      assert.strictEqual(result.headers['content-type'], 'video/mp2t');
      assert.strictEqual(result.headers['content-length'], '188');
    } finally {
      axios.defaults.adapter = originalAdapter;
    }
  });

  await runAsyncTest('GET /hls/ts: streams encryption key with application/octet-stream', async () => {
    let pipedToRes = false;

    axios.defaults.adapter = async (config) => {
      return {
        data: {
          pipe: (destination) => {
            pipedToRes = true;
            destination.end();
          },
          on: () => {},
        },
        status: 200,
        statusText: 'OK',
        headers: { 'content-length': '16' },
        config,
      };
    };

    try {
      const keyUrl = 'https://cdn.example.com/keys/key.php?id=123';
      const b64Key = mapper.encodeBase64(keyUrl);

      const { req, res, getResult } = createMockContext({ b64: b64Key, is_key: '1' });
      await tsHandler(req, res);
      const result = getResult();

      assert(pipedToRes, 'Key stream was piped to response');
      assert.strictEqual(result.headers['access-control-allow-origin'], '*');
      assert.strictEqual(result.headers['content-type'], 'application/octet-stream');
    } finally {
      axios.defaults.adapter = originalAdapter;
    }
  });

  // --- 3.4 Referrer and Domain Detection ---
  console.log('\n--- 3.4 Referrer & Domain Mapping ---');

  await runAsyncTest('manifest.m3u8: automatically maps referrers based on upstream domain', async () => {
    const testDomains = [
      { url: 'https://phim.nguonc.com/live/1.m3u8', expectedRef: 'https://phim.nguonc.com/' },
      { url: 'https://phimapi.com/hls/master.m3u8', expectedRef: 'https://phimapi.com/' },
      { url: 'https://kkphim.vip/streams/test.m3u8', expectedRef: 'https://kkphim.vip/' },
      { url: 'https://vsmov.com/media/master.m3u8', expectedRef: 'https://vsmov.com/' },
      { url: 'https://streamc.online/live.m3u8', expectedRef: 'https://streamc.online/' },
    ];

    for (const testCase of testDomains) {
      m3u8Cache.clear();
      let sentReferer = null;

      axios.defaults.adapter = async (config) => {
        sentReferer = config.headers['Referer'];
        return {
          data: '#EXTM3U\n#EXT-X-VERSION:3\n#EXT-X-TARGETDURATION:10\n#EXTINF:10,\nseg.ts\n',
          status: 200,
          statusText: 'OK',
          headers: { 'content-type': 'application/vnd.apple.mpegurl' },
          config,
        };
      };

      try {
        const { req, res } = createMockContext({ b64: mapper.encodeBase64(testCase.url) });
        await manifestHandler(req, res);
        assert.strictEqual(sentReferer, testCase.expectedRef, `Domain ${testCase.url} referer check`);
      } finally {
        axios.defaults.adapter = originalAdapter;
      }
    }
  });

  // --- 3.5 Error Handling & Edge Cases ---
  console.log('\n--- 3.5 HLS Route Error Handling ---');

  await runAsyncTest('GET /hls/manifest.m3u8: missing parameter returns 400', async () => {
    const { req, res, getResult } = createMockContext({});
    await manifestHandler(req, res);
    const result = getResult();
    assert.strictEqual(result.statusCode, 400);
  });

  await runAsyncTest('GET /hls/ts: missing parameter returns 400', async () => {
    const { req, res, getResult } = createMockContext({});
    await tsHandler(req, res);
    const result = getResult();
    assert.strictEqual(result.statusCode, 400);
  });

  await runAsyncTest('GET /hls/manifest.m3u8: upstream 404 returns 502 gracefully', async () => {
    axios.defaults.adapter = async (config) => {
      const err = new Error('Request failed with status code 404');
      err.response = { status: 404 };
      throw err;
    };

    try {
      const nonExistent = 'https://cdn.example.com/not_found.m3u8';
      const b64 = mapper.encodeBase64(nonExistent);
      const { req, res, getResult } = createMockContext({ b64 });
      await manifestHandler(req, res);
      const result = getResult();
      assert.strictEqual(result.statusCode, 502);
    } finally {
      axios.defaults.adapter = originalAdapter;
    }
  });

  await runAsyncTest('GET /hls/extract: missing embed param returns 400', async () => {
    const { req, res, getResult } = createMockContext({});
    await extractHandler(req, res);
    const result = getResult();
    assert.strictEqual(result.statusCode, 400);
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// SUITE 4: src/handlers.js Stream Aggregator & Protocol Exclusivity
// ─────────────────────────────────────────────────────────────────────────────
async function suite4StreamAggregator() {
  console.log('\n================================================================');
  console.log('  SUITE 4: src/handlers.js Stream Aggregator & Protocol Exclusivity');
  console.log('================================================================\n');

  function findRouteHandler(router, path, method = 'get') {
    for (const layer of router.stack) {
      if (layer.route) {
        const routePath = layer.route.path;
        const matchesPath = Array.isArray(routePath)
          ? routePath.includes(path)
          : routePath === path;
        if (matchesPath && layer.route.methods[method.toLowerCase()]) {
          return layer.route.stack[0].handle;
        }
      }
    }
    return null;
  }

  const streamHandler = findRouteHandler(handlersRouter, '/stream/:type/:id.json');
  assert(typeof streamHandler === 'function', 'streamHandler found in handlersRouter');

  await runAsyncTest('Stream Aggregator: sanitizes streams and enforces R3 protocol exclusivity', async () => {
    // Seed cinemetaCache
    cinemetaCache.set('cinemeta:movie:tt1375666', {
      imdbId: 'tt1375666',
      type: 'movie',
      name: 'Inception',
      year: 2010,
      genres: ['Action', 'Sci-Fi'],
      aliases: [],
    }, 86400);

    // Seed KKPhim cache
    imdbCache.set('kkphim:imdb:tt1375666', {
      movie: { name: 'Inception', slug: 'inception', year: 2010, type: 'single' },
      episodes: [
        {
          server_name: 'Vietsub #1',
          server_data: [{ name: 'Full', slug: 'full', link_m3u8: 'https://cdn.kkphim.com/inc.m3u8', link_embed: 'https://embed.kkphim.com/inc' }],
        },
      ],
    }, 86400);

    // Seed NguonC cache
    imdbCache.set('nguonc:imdb:tt1375666', 'ke-danh-cap-giac-mo', 86400);
    detailCache.set('nguonc:detail:ke-danh-cap-giac-mo', {
      movie: {
        name: 'Kẻ Đánh Cắp Giấc Mơ',
        original_name: 'Inception',
        slug: 'ke-danh-cap-giac-mo',
        episodes: [
          {
            server_name: 'Server #1 - Vietsub',
            items: [{ name: 'Full', slug: 'full', embed: 'https://embed.nguonc.com/inc' }],
          },
        ],
      },
    }, 86400);

    const { req, res, getResult } = createMockContext(
      {},
      { host: 'localhost:7000' },
      { type: 'movie', id: 'tt1375666' }
    );
    req.addonConfig = { providers: ['nguonc', 'kkphim', 'vsmov'] };

    await streamHandler(req, res);
    const result = getResult();

    assert.strictEqual(result.statusCode, 200);
    assert(result.body && Array.isArray(result.body.streams));
    assert(result.body.streams.length >= 4, `Expected at least 4 streams, got ${result.body.streams.length}`);

    for (let i = 0; i < result.body.streams.length; i++) {
      const s = result.body.streams[i];
      assert.strictEqual(s.name, 'VIP Movies 🎬', `Stream #${i} name branding`);
      assert(!s.title.includes('#'), `Stream #${i} title must not contain '#'`);

      if (s.url) {
        assert.strictEqual(s.externalUrl, undefined, `Stream #${i} is HLS Proxy: externalUrl MUST be undefined`);
        assert(s.url.startsWith('http://localhost:7000/hls/'), `Stream #${i} url points to proxy`);
      } else if (s.externalUrl) {
        assert.strictEqual(s.url, undefined, `Stream #${i} is Embed Player: url MUST be undefined`);
        assert(s.externalUrl.startsWith('http'), `Stream #${i} externalUrl is valid HTTP URL`);
      } else {
        assert.fail(`Stream #${i} has neither url nor externalUrl`);
      }

      assert(s.behaviorHints && s.behaviorHints.notSupported === false);
      assert(typeof s.behaviorHints.bingeGroup === 'string');
    }
  });

  await runAsyncTest('Stream Aggregator: provider error isolation returns HTTP 200 with empty array on invalid ID', async () => {
    const { req, res, getResult } = createMockContext(
      {},
      { host: 'localhost:7000' },
      { type: 'movie', id: 'tt9999999_nonexistent' }
    );
    req.addonConfig = { providers: ['nguonc', 'kkphim', 'vsmov'] };

    await streamHandler(req, res);
    const result = getResult();

    assert.strictEqual(result.statusCode, 200);
    assert(result.body && Array.isArray(result.body.streams) && result.body.streams.length === 0);
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// RUN ALL SUITES
// ─────────────────────────────────────────────────────────────────────────────
async function runAll() {
  console.log('╔══════════════════════════════════════════════════════════════════╗');
  console.log('║   CHALLENGER 2 EMPIRICAL ADVERSARIAL TEST SUITE (MILESTONE 3)    ║');
  console.log('╚══════════════════════════════════════════════════════════════════╝');

  await suite1Mapper();
  await suite2CinemetaAndCache();
  await suite3HlsProxy();
  await suite4StreamAggregator();

  console.log('\n══════════════════════════════════════════════════════════════════');
  console.log(`🏁 CHALLENGER 2 EMPIRICAL VERDICT SUMMARY:`);
  console.log(`   Total Tests:  ${totalTests}`);
  console.log(`   Passed:       ${passedTests} ✅`);
  console.log(`   Failed:       ${failedTests} ${failedTests > 0 ? '❌' : ''}`);
  console.log('══════════════════════════════════════════════════════════════════\n');

  if (failedTests > 0) {
    console.error('Failure Details:');
    console.error(JSON.stringify(failureDetails, null, 2));
    process.exit(1);
  }
}

runAll().catch((err) => {
  console.error('Fatal Runner Error:', err);
  process.exit(1);
});
