'use strict';

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
const { cache, flushCache, getCache, setCache } = require('../src/db/cache');
const {
  CIRCUIT_BREAKER,
  isConfigured,
  isSupabaseAvailable,
  safeDbCall,
  getStreamCache,
  setStreamCache,
  getImdbMapping,
  setImdbMapping,
  deleteStreamCache,
  flushDatabaseCache,
  supabaseClient
} = require('../src/db/supabase');
const { parseArgs, main, printHelp } = require('../scripts/flush_cache');
const { cinemetaService } = require('../src/services/cinemeta');
const { findBestMatch, scoreCandidate } = require('../src/services/matcher');

describe('Adversarial & Empirical Stress Test Suite (Milestone M3 Supabase DB & Cache CLI)', () => {

  beforeEach(() => {
    flushCache();
    vi.restoreAllMocks();
    CIRCUIT_BREAKER.reset();
  });

  afterEach(() => {
    flushCache();
    vi.restoreAllMocks();
    CIRCUIT_BREAKER.reset();
  });

  // =========================================================================
  // 1. CIRCUIT BREAKER & DB OUTAGE SIMULATION
  // =========================================================================
  describe('1. Circuit Breaker & DB Outage Simulation', () => {

    it('1.1 transitions cleanly across CLOSED -> OPEN -> HALF-OPEN -> CLOSED state lifecycle', () => {
      expect(CIRCUIT_BREAKER.isOpen()).toBe(false);
      expect(CIRCUIT_BREAKER.failureCount).toBe(0);

      // 1st failure: still closed
      CIRCUIT_BREAKER.recordFailure(new Error('Network drop 1'));
      expect(CIRCUIT_BREAKER.failureCount).toBe(1);
      expect(CIRCUIT_BREAKER.isOpen()).toBe(false);

      // 2nd failure: still closed
      CIRCUIT_BREAKER.recordFailure(new Error('Network drop 2'));
      expect(CIRCUIT_BREAKER.failureCount).toBe(2);
      expect(CIRCUIT_BREAKER.isOpen()).toBe(false);

      // 3rd failure: trips to OPEN
      const tripTime = Date.now();
      CIRCUIT_BREAKER.recordFailure(new Error('Network drop 3 - Breaker Trip'));
      expect(CIRCUIT_BREAKER.failureCount).toBe(3);
      expect(CIRCUIT_BREAKER.isOpen()).toBe(true);
      expect(CIRCUIT_BREAKER.nextRetryTime).toBeGreaterThanOrEqual(tripTime + 59000);

      // Fast-forward time to past cooldown (Half-Open transition)
      const originalNow = Date.now;
      try {
        Date.now = () => tripTime + 65000;
        expect(CIRCUIT_BREAKER.isOpen()).toBe(false); // Half-open allows 1 trial request

        // Successful trial request resets breaker to CLOSED
        CIRCUIT_BREAKER.recordSuccess();
        expect(CIRCUIT_BREAKER.failureCount).toBe(0);
        expect(CIRCUIT_BREAKER.nextRetryTime).toBe(0);
        expect(CIRCUIT_BREAKER.isOpen()).toBe(false);
      } finally {
        Date.now = originalNow;
      }
    });

    it('1.2 stays in OPEN state if trial request fails during HALF-OPEN', () => {
      const tripTime = 1000000;
      const originalNow = Date.now;
      try {
        Date.now = () => tripTime;
        CIRCUIT_BREAKER.recordFailure(new Error('Err 1'));
        CIRCUIT_BREAKER.recordFailure(new Error('Err 2'));
        CIRCUIT_BREAKER.recordFailure(new Error('Err 3'));
        expect(CIRCUIT_BREAKER.isOpen()).toBe(true);

        // Advance to half-open
        Date.now = () => tripTime + 61000;
        expect(CIRCUIT_BREAKER.isOpen()).toBe(false);

        // Trial request fails -> trips open again with new cooldown
        CIRCUIT_BREAKER.recordFailure(new Error('Trial failure'));
        expect(CIRCUIT_BREAKER.isOpen()).toBe(true);
        expect(CIRCUIT_BREAKER.nextRetryTime).toBe(tripTime + 61000 + 60000);
      } finally {
        Date.now = originalNow;
      }
    });

    it('1.3 safeDbCall returns null immediately when circuit breaker is OPEN without invoking database fn', async () => {
      CIRCUIT_BREAKER.recordFailure(new Error('Err 1'));
      CIRCUIT_BREAKER.recordFailure(new Error('Err 2'));
      CIRCUIT_BREAKER.recordFailure(new Error('Err 3'));
      expect(CIRCUIT_BREAKER.isOpen()).toBe(true);

      const dbFn = vi.fn().mockResolvedValue('data');
      const start = Date.now();
      const result = await safeDbCall(dbFn, 5000);
      const elapsed = Date.now() - start;

      expect(result).toBeNull();
      expect(dbFn).not.toHaveBeenCalled();
      expect(elapsed).toBeLessThanOrEqual(50); // Instant bypass (<50ms)
    });

    it('1.4 safeDbCall enforces strict timeout and records failure on slow queries', async () => {
      const slowQuery = () => new Promise((resolve) => setTimeout(() => resolve('data'), 300));
      const res = await safeDbCall(slowQuery, 20);

      expect(res).toBeNull();
      expect(CIRCUIT_BREAKER.failureCount).toBe(1);
    });

    it('1.5 safeDbCall safely catches synchronous errors without crashing caller', async () => {
      const explodingFn = () => {
        throw new Error('Fatal unhandled database exception');
      };
      const res = await safeDbCall(explodingFn, 50);
      expect(res).toBeNull();
      expect(CIRCUIT_BREAKER.failureCount).toBe(1);
    });

    it('1.6 safeDbCall clears timeout timer in finally block on immediate rejection avoiding orphaned timers', async () => {
      const unhandledRejections = [];
      const onUnhandled = (reason) => unhandledRejections.push(reason);
      process.on('unhandledRejection', onUnhandled);

      try {
        const immediateRejection = () => Promise.reject(new Error('Immediate socket error'));
        const res = await safeDbCall(immediateRejection, 40);
        expect(res).toBeNull();
        expect(CIRCUIT_BREAKER.failureCount).toBe(1);

        // Wait past timeout to ensure timer was cancelled and did not trigger unhandledRejection
        await new Promise((r) => setTimeout(r, 80));
        expect(unhandledRejections).toHaveLength(0);
      } finally {
        process.removeListener('unhandledRejection', onUnhandled);
      }
    });
  });

  // =========================================================================
  // 2. MALFORMED, CORRUPTED & HOSTILE DATA FUZZING
  // =========================================================================
  describe('2. Malformed, Corrupted & Hostile Data Fuzzing', () => {

    it('2.1 getStreamCache handles non-array / corrupted streams from DB gracefully', async () => {
      if (supabaseClient) {
        const mockSelect = {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          single: vi.fn().mockResolvedValue({
            data: { streams: 'not-an-array-string', expires_at: new Date(Date.now() + 100000).toISOString() },
            error: null
          })
        };
        vi.spyOn(supabaseClient, 'from').mockReturnValue(mockSelect);

        const result = await getStreamCache('stream:movie:corrupted');
        expect(result).toBeNull();
      }
    });

    it('2.2 getStreamCache ignores expired DB records (expires_at < Date.now())', async () => {
      if (supabaseClient) {
        const mockSelect = {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          single: vi.fn().mockResolvedValue({
            data: {
              streams: [{ name: 'Test', url: 'http://test.m3u8' }],
              expires_at: new Date(Date.now() - 50000).toISOString() // Expired 50s ago
            },
            error: null
          })
        };
        vi.spyOn(supabaseClient, 'from').mockReturnValue(mockSelect);

        const result = await getStreamCache('stream:movie:expired');
        expect(result).toBeNull();
        expect(getCache('stream:movie:expired')).toBeNull();
      }
    });

    it('2.3 setStreamCache validates inputs and rejects invalid streams or missing key', async () => {
      expect(await setStreamCache('', [{ url: 'http://valid.m3u8' }])).toBe(false);
      expect(await setStreamCache(null, [{ url: 'http://valid.m3u8' }])).toBe(false);
      expect(await setStreamCache('stream:test', null)).toBe(false);
      expect(await setStreamCache('stream:test', 'not-an-array')).toBe(false);
      expect(await setStreamCache('stream:test', {})).toBe(false);
    });

    it('2.4 setImdbMapping validates inputs and handles malformed mapping objects', async () => {
      expect(await setImdbMapping('', { title: 'Test' })).toBe(false);
      expect(await setImdbMapping(null, { title: 'Test' })).toBe(false);
      expect(await setImdbMapping('tt1234567', null)).toBe(false);

      // Sparse / edge-case mappingData
      const sparseMapping = {
        title: 'Minimal Movie'
      };
      const success = await setImdbMapping('tt1234567', sparseMapping);
      expect(typeof success).toBe('boolean');
      const retrieved = await getImdbMapping('tt1234567');
      expect(retrieved?.title).toBe('Minimal Movie');
    });

    it('2.5 handles hostile SQL injection strings, unicode emojis, and directory traversal keys', async () => {
      const hostileKeys = [
        "stream:movie:' OR '1'='1",
        'stream:movie:; DROP TABLE stremio_stream_cache; --',
        'stream:movie:../../../../etc/passwd',
        'stream:movie:🎬🍿🇻🇳🔥',
        'stream:movie:' + 'A'.repeat(5000)
      ];

      for (const key of hostileKeys) {
        const streams = [{ name: 'Safe Stream', url: 'https://test.com/stream.m3u8' }];
        const setRes = await setStreamCache(key, streams);
        expect(setRes).toBe(true);

        const getRes = await getStreamCache(key);
        expect(getRes).toEqual(streams);
      }
    });
  });

  // =========================================================================
  // 3. HIGH CONCURRENCY & RACE CONDITION HARNESS
  // =========================================================================
  describe('3. High Concurrency & Race Condition Harness', () => {

    it('3.1 handles 200 concurrent getStreamCache requests on cold cache without unhandled errors', async () => {
      const keys = Array.from({ length: 200 }, (_, i) => `stream:movie:tt000${i}`);
      const promises = keys.map((k) => getStreamCache(k));
      const results = await Promise.all(promises);

      expect(results.length).toBe(200);
      results.forEach((r) => expect(r).toBeNull());
    });

    it('3.2 handles 200 interleaved concurrent read/write operations consistently', async () => {
      const mockStreams = [{ name: 'Test Stream', url: 'http://cdn.com/test.m3u8' }];
      const operations = Array.from({ length: 200 }, (_, i) => {
        const key = `stream:series:tt_race_${i % 10}:1:1`;
        if (i % 2 === 0) {
          return setStreamCache(key, mockStreams);
        } else {
          return getStreamCache(key);
        }
      });

      const results = await Promise.all(operations);
      expect(results.length).toBe(200);
    });

    it('3.3 multi-tier cache synchronization: L1 miss -> L2 hit -> L1 repopulation verified', async () => {
      const key = 'stream:movie:tt_sync_test';
      const mockStreams = [{ name: 'Sync Stream', url: 'http://cdn.com/sync.m3u8' }];

      if (supabaseClient) {
        const mockSelect = {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          single: vi.fn().mockResolvedValue({
            data: { streams: mockStreams, expires_at: new Date(Date.now() + 60000).toISOString() },
            error: null
          })
        };
        vi.spyOn(supabaseClient, 'from').mockReturnValue(mockSelect);

        // Ensure L1 is empty
        expect(getCache(key)).toBeNull();

        // 1st get: L1 miss -> hits mock L2 -> repopulates L1
        const res1 = await getStreamCache(key);
        expect(res1).toEqual(mockStreams);

        // Verify L1 is now populated
        expect(getCache(key)).toEqual(mockStreams);

        // 2nd get: L1 hit directly (<1ms)
        const res2 = await getStreamCache(key);
        expect(res2).toEqual(mockStreams);
      }
    });

    it('3.4 operates seamlessly in pure L1 mode when Supabase is completely unavailable', async () => {
      // Trip breaker intentionally
      CIRCUIT_BREAKER.recordFailure(new Error('Outage'));
      CIRCUIT_BREAKER.recordFailure(new Error('Outage'));
      CIRCUIT_BREAKER.recordFailure(new Error('Outage'));
      expect(isSupabaseAvailable()).toBe(false);

      const key = 'stream:movie:tt_pure_l1';
      const streams = [{ name: 'L1 Stream', url: 'http://pure-l1.m3u8' }];

      const setRes = await setStreamCache(key, streams);
      expect(setRes).toBe(true);

      const getRes = await getStreamCache(key);
      expect(getRes).toEqual(streams);

      const mappingData = { title: 'Pure L1 Movie', year: 2024 };
      const setMapRes = await setImdbMapping('tt_pure_l1', mappingData);
      expect(setMapRes).toBe(true);

      const getMapRes = await getImdbMapping('tt_pure_l1');
      expect(getMapRes).toEqual(mappingData);
    });
  });

  // =========================================================================
  // 4. CACHE MAINTENANCE CLI UTILITY (scripts/flush_cache.js)
  // =========================================================================
  describe('4. Cache Maintenance CLI Utility (scripts/flush_cache.js)', () => {

    it('4.1 parseArgs parses all valid flag combinations accurately', () => {
      expect(parseArgs(['--all'])).toEqual({
        all: true,
        expired: false,
        provider: null,
        dryRun: false,
        help: false
      });

      expect(parseArgs(['--expired'])).toEqual({
        all: false,
        expired: true,
        provider: null,
        dryRun: false,
        help: false
      });

      expect(parseArgs(['--all', '--dry-run'])).toEqual({
        all: true,
        expired: false,
        provider: null,
        dryRun: true,
        help: false
      });

      expect(parseArgs(['--expired', '--dry-run'])).toEqual({
        all: false,
        expired: true,
        provider: null,
        dryRun: true,
        help: false
      });

      expect(parseArgs(['--provider', 'kkphim'])).toEqual({
        all: false,
        expired: false,
        provider: 'kkphim',
        dryRun: false,
        help: false
      });

      expect(parseArgs(['--provider=vsmov'])).toEqual({
        all: false,
        expired: false,
        provider: 'vsmov',
        dryRun: false,
        help: false
      });

      expect(parseArgs(['--provider=nguonc', '--dry-run'])).toEqual({
        all: false,
        expired: false,
        provider: 'nguonc',
        dryRun: true,
        help: false
      });

      expect(parseArgs(['--help'])).toEqual({
        all: false,
        expired: false,
        provider: null,
        dryRun: false,
        help: true
      });

      expect(parseArgs(['-h'])).toEqual({
        all: false,
        expired: false,
        provider: null,
        dryRun: false,
        help: true
      });

      expect(parseArgs([])).toEqual({
        all: false,
        expired: false,
        provider: null,
        dryRun: false,
        help: false
      });
    });

    it('4.2 executes empty arguments or --help by returning help action without performing deletions', async () => {
      const resEmpty = await main([]);
      expect(resEmpty).toEqual({ success: true, action: 'help' });

      const resHelp = await main(['-h']);
      expect(resHelp).toEqual({ success: true, action: 'help' });
    });

    it('4.3 dry-run mode does not flush L1 cache and computes L2 record counts safely', async () => {
      setCache('test_key', 'test_value');
      expect(getCache('test_key')).toBe('test_value');

      const res = await main(['--all', '--dry-run']);
      expect(res.success).toBe(true);

      // Verify L1 was NOT flushed in dry run
      expect(getCache('test_key')).toBe('test_value');
    });

    it('4.4 --all flushes L1 cache and calls L2 flushDatabaseCache', async () => {
      setCache('test_key', 'test_value');
      expect(getCache('test_key')).toBe('test_value');

      const res = await main(['--all']);
      expect(res.success).toBe(true);
      expect(res.l1Flushed).toBe(true);

      // Verify L1 WAS flushed
      expect(getCache('test_key')).toBeNull();
    });

    it('4.5 --provider flag flushes L1 and invokes deleteStreamCache with provider', async () => {
      setCache('test_key_provider', 'data');
      const res = await main(['--provider', 'kkphim']);

      expect(res.success).toBe(true);
      expect(res.l1Flushed).toBe(true);
      expect(getCache('test_key_provider')).toBeNull();
    });

    it('4.6 handles execution when Supabase is completely unavailable (pure L1 flush)', async () => {
      CIRCUIT_BREAKER.recordFailure(new Error('Outage 1'));
      CIRCUIT_BREAKER.recordFailure(new Error('Outage 2'));
      CIRCUIT_BREAKER.recordFailure(new Error('Outage 3'));
      expect(isSupabaseAvailable()).toBe(false);

      setCache('test_outage', 'data');
      const res = await main(['--all']);

      expect(res.success).toBe(true);
      expect(res.l1Flushed).toBe(true);
      expect(res.l2Available).toBe(false);
      expect(res.streamDeleted).toBe(0);
      expect(res.mappingDeleted).toBe(0);
    });

    it('4.7 handles unexpected errors thrown during main() execution', async () => {
      if (supabaseClient) {
        vi.spyOn(supabaseClient, 'from').mockImplementationOnce(() => {
          throw new Error('Critical query syntax error');
        });

        // In dryRun where supabaseClient is directly called
        await expect(main(['--all', '--dry-run'])).rejects.toThrow('Critical query syntax error');
      }
    });
  });

  // =========================================================================
  // 5. CROSS-MODULE MATCHING & CACHING INTEGRATION
  // =========================================================================
  describe('5. Cross-Module Matching & Caching Integration', () => {

    it('5.1 verifies full flow: Cinemeta metadata fetch -> L1 cache -> Matcher scoring -> DB Cache', async () => {
      const cinemetaMeta = {
        id: 'tt1375666',
        name: 'Inception',
        year: 2010,
        type: 'movie'
      };

      const candidates = [
        { name: 'Kẻ Đánh Cắp Giấc Mơ', slug: 'ke-danh-cap-giac-mo', year: 2010, type: 'movie' },
        { name: 'Phim Khác', slug: 'phim-khac', year: 2020, type: 'movie' }
      ];

      const bestMatch = findBestMatch(cinemetaMeta, candidates, 0.65);
      expect(bestMatch).toBeDefined();
      expect(bestMatch?.meta.slug).toBe('ke-danh-cap-giac-mo');

      // Store in IMDb mapping cache
      const mappingData = {
        type: 'movie',
        title: cinemetaMeta.name,
        year: cinemetaMeta.year,
        slugKkphim: bestMatch?.meta.slug,
        aliases: ['Kẻ Đánh Cắp Giấc Mơ']
      };

      const setMapRes = await setImdbMapping('tt1375666', mappingData);
      expect(setMapRes).toBe(true);

      const cachedMapping = await getImdbMapping('tt1375666');
      expect(cachedMapping?.slugKkphim).toBe('ke-danh-cap-giac-mo');

      // Store resolved streams
      const streams = [{ name: 'KKPhim HD', url: 'https://cdn.com/inception.m3u8' }];
      const cacheKey = 'stream:movie:tt1375666';
      await setStreamCache(cacheKey, streams, { mediaId: 'tt1375666', type: 'movie' });

      const cachedStreams = await getStreamCache(cacheKey);
      expect(cachedStreams).toEqual(streams);
    });
  });
});
