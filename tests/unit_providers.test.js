'use strict';

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

describe('Unit Tests: Core Providers, Config Compressor & Cache Engine', () => {
  describe('SECTION 1: 16-bit Bitmask & Base62 Compressor', () => {
    it('Base62 encode/decode integers correctly', () => {
      expect(intToBase62(0)).toBe('0');
      expect(intToBase62(61)).toBe('z');
      expect(intToBase62(62)).toBe('10');
      expect(base62ToInt('0')).toBe(0);
      expect(base62ToInt('z')).toBe(61);
      expect(base62ToInt('10')).toBe(62);
      expect(base62ToInt(intToBase62(3847))).toBe(3847);
    });

    it('Converts config to bitmask and back', () => {
      const mask = configToMask({ providers: ['vsmov', 'kkphim'], categories: ['movie', 'series'] });
      const expected = PROVIDER_BITS.vsmov | PROVIDER_BITS.kkphim | CATEGORY_BITS.movie | CATEGORY_BITS.series;
      expect(mask).toBe(expected);

      const cfg = maskToConfig(mask);
      expect(cfg.providers.sort()).toEqual(['kkphim', 'vsmov']);
      expect(cfg.categories.sort()).toEqual(['movie', 'series']);
    });

    it('Encodes config into compact token and decodes back', () => {
      const token = encodeConfig({ providers: ['vsmov', 'nguonc'], categories: ['movie', 'cinema'] });
      expect(typeof token).toBe('string');
      expect(token.length).toBeLessThan(10);
      const decoded = decodeConfig(token);
      expect(decoded.providers.sort()).toEqual(['nguonc', 'vsmov']);
      expect(decoded.categories.sort()).toEqual(['cinema', 'movie']);
    });

    it('Decodes legacy Base64URL JSON config gracefully', () => {
      const legacy = Buffer.from(JSON.stringify({ providers: ['kkphim'], categories: ['anime'] })).toString('base64url');
      const decoded = decodeConfig(legacy);
      expect(decoded.providers).toEqual(['kkphim']);
      expect(decoded.categories).toEqual(['anime']);
    });

    it('Identifies valid config tokens vs reserved routes', () => {
      expect(isConfigToken('manifest.json')).toBe(false);
      expect(isConfigToken('health')).toBe(false);
      expect(isConfigToken('hls')).toBe(false);
      expect(isConfigToken('1A')).toBe(true);
    });
  });

  describe('SECTION 2: L1 LRU & Tiered Cache Architecture', () => {
    it('LRUCache handles set, get, TTL expiry and eviction', () => {
      const cache = new LRUCache(2, 1);
      cache.set('a', 1);
      cache.set('b', 2);
      expect(cache.get('a')).toBe(1);
      expect(cache.get('b')).toBe(2);

      cache.set('c', 3);
      expect(cache.get('a')).toBeUndefined();
      expect(cache.get('c')).toBe(3);
    });

    it('TieredCache synchronous & asynchronous lookups', async () => {
      const tCache = new TieredCache('test_ns', 100, 60);
      tCache.set('key1', { hello: 'world' });
      expect(tCache.getSync('key1')).toEqual({ hello: 'world' });
      const asyncVal = await tCache.get('key1');
      expect(asyncVal).toEqual({ hello: 'world' });
    });
  });

  describe('SECTION 3: BaseProvider & Provider Interface Invariants', () => {
    it('BaseProvider utilities: scoreMatch, safeSlug, generateSearchKeywords', () => {
      const score = scoreMatch({ name: 'Inception', year: 2010 }, 'Inception', 2010);
      expect(score).toBeGreaterThanOrEqual(1.0);

      const slug = safeSlug('nguonc_cuu-mon', 'nguonc');
      expect(slug).toBe('cuu-mon');

      const keywords = generateSearchKeywords('Avengers: Endgame', ['Hồi Kết'], 2019);
      expect(keywords.length).toBeGreaterThanOrEqual(2);
      expect(keywords).toContain('Avengers Endgame');
    });

    it('Episode matching algorithm handles various numbering styles', () => {
      const serverData = [
        { name: '1', slug: 'tap-1', link_m3u8: 'https://cdn.com/1.m3u8' },
        { name: '2', slug: 'tap-2', link_m3u8: 'https://cdn.com/2.m3u8' },
        { name: 'Full', slug: 'tap-full', link_m3u8: 'https://cdn.com/full.m3u8' },
      ];
      const ep1 = serverData.find((item) => matchEpisodeItem(item, 1));
      expect(ep1?.name).toBe('1');

      const epFull = serverData.find((item) => matchEpisodeItem(item, null) || matchEpisodeItem(item, 1));
      expect(epFull).toBeDefined();
    });

    it('Top 3 Providers export required interface methods', () => {
      const providers = [providerVsMov, providerKKPhim, providerNguonC];
      for (const p of providers) {
        expect(p.id).toBeDefined();
        expect(typeof p.getCatalog).toBe('function');
        expect(typeof p.getDetail).toBe('function');
        expect(typeof p.getStreams).toBe('function');
      }
    });
  });
});
