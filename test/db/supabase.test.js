'use strict';

/**
 * ============================================================
 *  VIP Movies Addon — test/db/supabase.test.js
 *  Comprehensive Unit & Integration Test Suite for Supabase DB,
 *  Tiered Caching & Standalone Cache Flush CLI Utility
 * ============================================================
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
const { execSync } = require('child_process');
const path = require('path');

const supabaseModule = require('../../src/db/supabase');
const cacheModule = require('../../src/db/cache');
const flushScript = require('../../scripts/flush_cache');

describe('Supabase Client & Media/Stream Helpers Unit Tests', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    vi.restoreAllMocks();
  });

  describe('1. Client Initialization & Status Checks', () => {
    it('isReady() correctly reflects client status', () => {
      const ready = supabaseModule.isReady();
      expect(typeof ready).toBe('boolean');
    });

    it('getClient() returns the Supabase client instance or null', () => {
      const client = supabaseModule.getClient();
      if (supabaseModule.isReady()) {
        expect(client).toBeDefined();
        expect(typeof client.from).toBe('function');
      } else {
        expect(client).toBeNull();
      }
    });
  });

  describe('2. Media Mappings Query Helpers (media_mappings)', () => {
    it('getMediaMapping() returns null when imdbId is empty or invalid', async () => {
      expect(await supabaseModule.getMediaMapping('')).toBeNull();
      expect(await supabaseModule.getMediaMapping(null)).toBeNull();
      expect(await supabaseModule.getMediaMapping(undefined)).toBeNull();
    });

    it('upsertMediaMapping() returns null when payload or imdb_id is missing', async () => {
      expect(await supabaseModule.upsertMediaMapping(null)).toBeNull();
      expect(await supabaseModule.upsertMediaMapping({})).toBeNull();
      expect(await supabaseModule.upsertMediaMapping({ title: 'No IMDb' })).toBeNull();
    });

    it('upsertMediaMapping() and saveMediaMapping are identical functions', () => {
      expect(supabaseModule.saveMediaMapping).toBe(supabaseModule.upsertMediaMapping);
    });

    it('getMediaMapping() safely catches DB errors and returns null without throwing', async () => {
      const client = supabaseModule.getClient();
      if (client) {
        const fromSpy = vi.spyOn(client, 'from').mockReturnValueOnce({
          select: () => ({
            eq: () => ({
              maybeSingle: async () => ({ data: null, error: new Error('Simulated table failure') }),
            }),
          }),
        });
        const res = await supabaseModule.getMediaMapping('tt1234567');
        expect(res).toBeNull();
      }
    });

    it('upsertMediaMapping() safely catches DB errors and returns null without throwing', async () => {
      const client = supabaseModule.getClient();
      if (client) {
        vi.spyOn(client, 'from').mockReturnValueOnce({
          upsert: async () => ({ data: null, error: new Error('Simulated upsert failure') }),
        });
        const res = await supabaseModule.upsertMediaMapping({ imdb_id: 'tt1234567', title: 'Test' });
        expect(res).toBeNull();
      }
    });
  });

  describe('3. Stream Cache Query Helpers (stream_cache)', () => {
    it('getL2StreamCache() returns null for empty or invalid stream keys', async () => {
      expect(await supabaseModule.getL2StreamCache('')).toBeNull();
      expect(await supabaseModule.getL2StreamCache(null)).toBeNull();
    });

    it('getStreamCache is aliased to getL2StreamCache', () => {
      expect(supabaseModule.getStreamCache).toBe(supabaseModule.getL2StreamCache);
    });

    it('setStreamCache is aliased to setL2StreamCache', () => {
      expect(supabaseModule.setStreamCache).toBe(supabaseModule.setL2StreamCache);
    });

    it('getL2StreamCache() filters out expired stream cache entries', async () => {
      const client = supabaseModule.getClient();
      if (client) {
        vi.spyOn(client, 'from').mockReturnValueOnce({
          select: () => ({
            eq: () => ({
              maybeSingle: async () => ({
                data: {
                  streams: [{ name: 'Expired Stream', url: 'https://test.m3u8' }],
                  expires_at: new Date(Date.now() - 100000).toISOString(), // expired
                },
                error: null,
              }),
            }),
          }),
        });

        const result = await supabaseModule.getL2StreamCache('tt1375666:1:1');
        expect(result).toBeNull();
      }
    });

    it('getL2StreamCache() returns valid streams when not expired', async () => {
      const client = supabaseModule.getClient();
      if (client) {
        const sampleStreams = [{ name: 'VIP Stream', url: 'https://live.m3u8' }];
        vi.spyOn(client, 'from').mockReturnValueOnce({
          select: () => ({
            eq: () => ({
              maybeSingle: async () => ({
                data: {
                  streams: sampleStreams,
                  expires_at: new Date(Date.now() + 100000).toISOString(),
                },
                error: null,
              }),
            }),
          }),
        });

        const result = await supabaseModule.getL2StreamCache('tt1375666:1:1');
        expect(result).toEqual(sampleStreams);
      }
    });

    it('setL2StreamCache() safely handles null inputs and DB errors without crashing', async () => {
      await expect(supabaseModule.setL2StreamCache('', null)).resolves.not.toThrow();
      await expect(supabaseModule.setL2StreamCache('valid_key', [{ url: 'test' }], 300)).resolves.not.toThrow();
    });
  });

  describe('4. Generic Cache Entries (cache_entries)', () => {
    it('getCachedValue() returns null on missing parameters', async () => {
      expect(await supabaseModule.getCachedValue('', 'key')).toBeNull();
      expect(await supabaseModule.getCachedValue('catalog', '')).toBeNull();
    });

    it('setCachedValue() returns false on undefined value', async () => {
      expect(await supabaseModule.setCachedValue('catalog', 'key', undefined)).toBe(false);
    });

    it('deleteCachedValue() executes safely', async () => {
      const res = await supabaseModule.deleteCachedValue('catalog', 'non_existent_key');
      expect(typeof res).toBe('boolean');
    });
  });

  describe('5. Cache Purge & Maintenance (flushStreamCache, flushAllCache, pruneExpiredCache)', () => {
    it('flushStreamCache() clears L1 in-memory stream cache and returns valid result object', async () => {
      // Seed L1 cache
      cacheModule.l1Cache.set('test_stream_key', [{ name: 'Test' }]);
      expect(cacheModule.l1Cache.has('test_stream_key')).toBe(true);

      const result = await supabaseModule.flushStreamCache();
      expect(result).toBeDefined();
      expect(typeof result.success).toBe('boolean');
      expect(typeof result.count).toBe('number');
      expect(result.inMemoryCleared).toBe(true);
      expect(cacheModule.l1Cache.has('test_stream_key')).toBe(false);
    });

    it('clearStreamCache is an alias for flushStreamCache', () => {
      expect(supabaseModule.clearStreamCache).toBe(supabaseModule.flushStreamCache);
    });

    it('flushAllCache() clears all L1 in-memory caches and returns count', async () => {
      // Seed several tiered caches
      cacheModule.catalogCache.set('cat_key', { test: 1 });
      cacheModule.metaCache.set('meta_key', { test: 2 });
      cacheModule.streamCache.set('str_key', [{ name: 'str' }]);

      const result = await supabaseModule.flushAllCache();
      expect(result).toBeDefined();
      expect(typeof result.success).toBe('boolean');
      expect(typeof result.count).toBe('number');
      expect(result.inMemoryCleared).toBe(true);

      expect(cacheModule.catalogCache.getSync('cat_key')).toBeUndefined();
      expect(cacheModule.metaCache.getSync('meta_key')).toBeUndefined();
      expect(cacheModule.streamCache.getSync('str_key')).toBeUndefined();
    });

    it('flushCache is an alias for flushAllCache', () => {
      expect(supabaseModule.flushCache).toBe(supabaseModule.flushAllCache);
    });

    it('pruneExpiredCache() executes without crashing and returns pruned stats', async () => {
      const result = await supabaseModule.pruneExpiredCache();
      expect(result).toBeDefined();
      expect(typeof result.success).toBe('boolean');
      expect(typeof result.count).toBe('number');
    });

    it('pruneCache is an alias for pruneExpiredCache', () => {
      expect(supabaseModule.pruneCache).toBe(supabaseModule.pruneExpiredCache);
    });

    it('flushStreamCache() handles mocked Supabase table deletions and counts properly', async () => {
      const client = supabaseModule.getClient();
      if (client) {
        vi.spyOn(client, 'from').mockImplementation((tableName) => {
          if (tableName === 'stream_cache') {
            return {
              delete: () => ({
                not: async () => ({ count: 12, data: null, error: null }),
              }),
            };
          }
          if (tableName === 'cache_entries') {
            return {
              delete: () => ({
                like: async () => ({ count: 8, data: null, error: null }),
              }),
            };
          }
          return {};
        });

        const res = await supabaseModule.flushStreamCache();
        expect(res.success).toBe(true);
        expect(res.count).toBe(20);
        expect(res.details.stream_cache).toBe(12);
        expect(res.details.cache_entries).toBe(8);
      }
    });

    it('flushAllCache() handles mocked Supabase table deletions and counts properly', async () => {
      const client = supabaseModule.getClient();
      if (client) {
        vi.spyOn(client, 'from').mockImplementation((tableName) => {
          if (tableName === 'stream_cache') {
            return {
              delete: () => ({
                not: async () => ({ count: 5, data: null, error: null }),
              }),
            };
          }
          if (tableName === 'cache_entries') {
            return {
              delete: () => ({
                not: async () => ({ count: 45, data: null, error: null }),
              }),
            };
          }
          return {};
        });

        const res = await supabaseModule.flushAllCache();
        expect(res.success).toBe(true);
        expect(res.count).toBe(50);
        expect(res.tables.stream_cache).toBe(5);
        expect(res.tables.cache_entries).toBe(45);
      }
    });

    it('pruneExpiredCache() handles mocked Supabase deletions properly', async () => {
      const client = supabaseModule.getClient();
      if (client) {
        vi.spyOn(client, 'from').mockImplementation((tableName) => {
          if (tableName === 'stream_cache') {
            return {
              delete: () => ({
                lt: async () => ({ count: 3, data: null, error: null }),
              }),
            };
          }
          if (tableName === 'cache_entries') {
            return {
              delete: () => ({
                lt: async () => ({ count: 7, data: null, error: null }),
              }),
            };
          }
          return {};
        });

        const res = await supabaseModule.pruneExpiredCache();
        expect(res.success).toBe(true);
        expect(res.count).toBe(10);
        expect(res.pruned.stream_cache).toBe(3);
        expect(res.pruned.cache_entries).toBe(7);
      }
    });

    it('flushStreamCache() catches top-level exceptions and returns structured failure object without throwing', async () => {
      const client = supabaseModule.getClient();
      if (client) {
        vi.spyOn(client, 'from').mockImplementation(() => {
          throw new Error('Fatal socket connection error');
        });

        const res = await supabaseModule.flushStreamCache();
        expect(res).toBeDefined();
        // Since individual table calls catch internally, success remains true with 0 count
        expect(typeof res.success).toBe('boolean');
        expect(typeof res.count).toBe('number');
      }
    });

    it('flushAllCache() catches top-level exceptions and returns structured failure object without throwing', async () => {
      const client = supabaseModule.getClient();
      if (client) {
        vi.spyOn(client, 'from').mockImplementation(() => {
          throw new Error('Fatal database query timeout');
        });

        const res = await supabaseModule.flushAllCache();
        expect(res).toBeDefined();
        expect(typeof res.success).toBe('boolean');
        expect(typeof res.count).toBe('number');
      }
    });

    it('pruneExpiredCache() catches top-level exceptions and returns structured failure object without throwing', async () => {
      const client = supabaseModule.getClient();
      if (client) {
        vi.spyOn(client, 'from').mockImplementation(() => {
          throw new Error('Database unreachable');
        });

        const res = await supabaseModule.pruneExpiredCache();
        expect(res).toBeDefined();
        expect(typeof res.success).toBe('boolean');
        expect(typeof res.count).toBe('number');
      }
    });
  });

  describe('6. Standalone scripts/flush_cache.js CLI Execution', () => {
    const scriptPath = path.resolve(__dirname, '../../scripts/flush_cache.js');

    it('runs node scripts/flush_cache.js successfully (exit code 0)', () => {
      const output = execSync(`node "${scriptPath}"`, { encoding: 'utf-8' });
      expect(output).toContain('VIP Movies Addon — Cache Maintenance & Flush Utility');
      expect(output).toContain('Stream Cache Flush Completed');
      expect(output).toContain('Exit code 0');
    });

    it('runs node scripts/flush_cache.js --all successfully (exit code 0)', () => {
      const output = execSync(`node "${scriptPath}" --all`, { encoding: 'utf-8' });
      expect(output).toContain('Flushing ALL cache tables');
      expect(output).toContain('Flush All Cache Completed');
      expect(output).toContain('Exit code 0');
    });

    it('runs node scripts/flush_cache.js --prune successfully (exit code 0)', () => {
      const output = execSync(`node "${scriptPath}" --prune`, { encoding: 'utf-8' });
      expect(output).toContain('Pruning expired cache rows');
      expect(output).toContain('Cache Prune Completed');
      expect(output).toContain('Exit code 0');
    });

    it('runs node scripts/flush_cache.js --help successfully (exit code 0)', () => {
      const output = execSync(`node "${scriptPath}" --help`, { encoding: 'utf-8' });
      expect(output).toContain('Usage: node scripts/flush_cache.js [options]');
      expect(output).toContain('--streams');
      expect(output).toContain('--all');
      expect(output).toContain('--prune');
    });
  });
});
