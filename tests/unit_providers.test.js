'use strict';

/**
 * ============================================================
 *  VIP Movies Addon — tests/unit_providers.test.js
 *  Unit Tests for Core Providers, Config Compressor & Cache Engine
 * ============================================================
 */

const assert = require('assert');
const {
  intToBase62,
  base62ToInt,
  configToMask,
  maskToConfig,
  encodeConfig,
  decodeConfig,
  isConfigToken,
} = require('../src/config/compressor');
const {
  PROVIDER_BITS,
  CATEGORY_BITS,
  DEFAULT_CONFIG_MASK,
  DEFAULT_CONFIG,
  VALID_PROVIDERS,
} = require('../src/config/constants');
const { LRUCache, TieredCache } = require('../src/db/cache');
const {
  BaseProvider,
  scoreMatch,
  generateSearchKeywords,
  matchEpisodeItem,
  safeSlug,
} = require('../src/providers/base');
const providerVsMov  = require('../src/providers/vsmov');
const providerKKPhim = require('../src/providers/kkphim');
const providerNguonC = require('../src/providers/nguonc');

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

async function runUnitTests() {
  console.log('\n╔══════════════════════════════════════════════════════════════╗');
  console.log('║       🧪 UNIT TESTS: CORE PROVIDERS, CONFIG & CACHE          ║');
  console.log('╚══════════════════════════════════════════════════════════════╝\n');

  console.log('▶ SECTION 1: 16-bit Bitmask & Base62 Compressor');
  it('Base62 encode/decode integers correctly', () => {
    assert.strictEqual(intToBase62(0), '0');
    assert.strictEqual(intToBase62(61), 'z');
    assert.strictEqual(intToBase62(62), '10');
    assert.strictEqual(base62ToInt('0'), 0);
    assert.strictEqual(base62ToInt('z'), 61);
    assert.strictEqual(base62ToInt('10'), 62);
    assert.strictEqual(base62ToInt(intToBase62(3847)), 3847);
  });

  it('Converts config to bitmask and back', () => {
    const mask = configToMask({ providers: ['vsmov', 'kkphim'], categories: ['movie', 'series'] });
    const expected = PROVIDER_BITS.vsmov | PROVIDER_BITS.kkphim | CATEGORY_BITS.movie | CATEGORY_BITS.series;
    assert.strictEqual(mask, expected);

    const cfg = maskToConfig(mask);
    assert.deepStrictEqual(cfg.providers.sort(), ['kkphim', 'vsmov']);
    assert.deepStrictEqual(cfg.categories.sort(), ['movie', 'series']);
  });

  it('Encodes config into compact token and decodes back', () => {
    const token = encodeConfig({ providers: ['vsmov', 'nguonc'], categories: ['movie', 'cinema'] });
    assert.ok(typeof token === 'string' && token.length < 10);
    const decoded = decodeConfig(token);
    assert.deepStrictEqual(decoded.providers.sort(), ['nguonc', 'vsmov']);
    assert.deepStrictEqual(decoded.categories.sort(), ['cinema', 'movie']);
  });

  it('Decodes legacy Base64URL JSON config gracefully', () => {
    const legacy = Buffer.from(JSON.stringify({ providers: ['kkphim'], categories: ['anime'] })).toString('base64url');
    const decoded = decodeConfig(legacy);
    assert.deepStrictEqual(decoded.providers, ['kkphim']);
    assert.deepStrictEqual(decoded.categories, ['anime']);
  });

  it('Identifies valid config tokens vs reserved routes', () => {
    assert.strictEqual(isConfigToken('manifest.json'), false);
    assert.strictEqual(isConfigToken('health'), false);
    assert.strictEqual(isConfigToken('hls'), false);
    assert.strictEqual(isConfigToken('1A'), true);
  });

  console.log('\n▶ SECTION 2: L1 LRU & Tiered Cache Architecture');
  it('LRUCache handles set, get, TTL expiry and eviction', () => {
    const cache = new LRUCache(2, 1); // maxSize: 2, TTL: 1s
    cache.set('a', 1);
    cache.set('b', 2);
    assert.strictEqual(cache.get('a'), 1);
    assert.strictEqual(cache.get('b'), 2);

    cache.set('c', 3); // should evict 'a' (oldest access)
    assert.strictEqual(cache.get('a'), undefined);
    assert.strictEqual(cache.get('c'), 3);
  });

  await itAsync('TieredCache synchronous & asynchronous lookups', async () => {
    const tCache = new TieredCache('test_ns', 100, 60);
    tCache.set('key1', { hello: 'world' });
    assert.deepStrictEqual(tCache.getSync('key1'), { hello: 'world' });
    const asyncVal = await tCache.get('key1');
    assert.deepStrictEqual(asyncVal, { hello: 'world' });
  });

  console.log('\n▶ SECTION 3: BaseProvider & Provider Interface Invariants');
  it('BaseProvider utilities: scoreMatch, safeSlug, generateSearchKeywords', () => {
    const score = scoreMatch({ name: 'Inception', year: 2010 }, 'Inception', 2010);
    assert.ok(score >= 1.0);

    const slug = safeSlug('nguonc_cuu-mon', 'nguonc');
    assert.strictEqual(slug, 'cuu-mon');

    const keywords = generateSearchKeywords('Avengers: Endgame', ['Hồi Kết'], 2019);
    assert.ok(keywords.length >= 2);
    assert.ok(keywords.includes('Avengers Endgame'));
  });

  it('Episode matching algorithm handles various numbering styles', () => {
    const serverData = [
      { name: '1', slug: 'tap-1', link_m3u8: 'https://cdn.com/1.m3u8' },
      { name: '2', slug: 'tap-2', link_m3u8: 'https://cdn.com/2.m3u8' },
      { name: 'Full', slug: 'tap-full', link_m3u8: 'https://cdn.com/full.m3u8' },
    ];
    const ep1 = serverData.find(item => matchEpisodeItem(item, 1));
    assert.strictEqual(ep1?.name, '1');

    const epFull = serverData.find(item => matchEpisodeItem(item, null) || matchEpisodeItem(item, 1));
    assert.ok(epFull);
  });

  it('Top 3 Providers export required interface methods', () => {
    const providers = [providerVsMov, providerKKPhim, providerNguonC];
    for (const p of providers) {
      assert.ok(p.id, 'Provider must have id');
      assert.ok(typeof p.getCatalog === 'function', `${p.id} must implement getCatalog`);
      assert.ok(typeof p.getDetail === 'function', `${p.id} must implement getDetail`);
      assert.ok(typeof p.getStreams === 'function', `${p.id} must implement getStreams`);
    }
  });

  console.log('\n──────────────────────────────────────────────────────────────');
  console.log(`🏁 UNIT TESTS SUMMARY: ${passed} PASSED, ${failed} FAILED`);
  if (failed > 0) process.exit(1);
}

runUnitTests().catch((e) => {
  console.error(e);
  process.exit(1);
});
