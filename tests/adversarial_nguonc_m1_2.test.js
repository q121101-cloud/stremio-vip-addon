'use strict';

/**
 * ============================================================
 *  VIP Movies Addon — tests/adversarial_nguonc_m1_2.test.js
 *  Exhaustive Adversarial Challenge & Verification Test Suite
 *  Target: src/providers/nguonc.js (Milestone M1 / R1)
 * ============================================================
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
const axios = require('axios');
const nguonc = require('../src/providers/nguonc');
const { detailCache, imdbCache, catalogCache } = require('../src/lib/cache');
const {
  NguonCProvider,
  getProxyBase,
  isVercelEnvironment,
  resolveProxyUrls,
  isRetryableError,
  requestWithRetry,
  NGUONC_HEADERS,
} = nguonc;

describe('Adversarial M1_2 Challenge: NguonC Provider Integration & Robustness', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    vi.restoreAllMocks();
    process.env = { ...originalEnv };
    delete process.env.PROXY_URL;
    delete process.env.RENDER_EXTERNAL_URL;
    delete process.env.RENDER_BACKEND_URL;
    delete process.env.RENDER_URL;
    delete process.env.VERCEL;
    delete process.env.VERCEL_ENV;
    delete process.env.NOW_REGION;
    delete process.env.AWS_LAMBDA_FUNCTION_NAME;
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    vi.restoreAllMocks();
  });

  // ==========================================================
  // SECTION 1: SEARCH ADVERSARIAL & FALLBACK SCENARIOS
  // ==========================================================
  describe('1. search() Adversarial & Fallback Scenarios', () => {
    it('1.1 Direct 403 Forbidden -> Fast Fallback to Proxy without direct retry', async () => {
      process.env.PROXY_URL = 'https://proxy.render.com';
      const provider = new NguonCProvider();

      const searchPayload = {
        items: [
          { name: 'Phim 403 Fallback', slug: 'phim-403-fallback', quality: 'FHD', year: 2024 },
        ],
      };

      const getSpy = vi.spyOn(axios, 'get').mockImplementation(async (url) => {
        if (url.startsWith('https://phim.nguonc.com')) {
          const err = new Error('Cloudflare 403 Blocked');
          err.response = { status: 403 };
          throw err;
        }
        if (url.startsWith('https://proxy.render.com')) {
          return { status: 200, data: searchPayload };
        }
        throw new Error(`Unexpected URL: ${url}`);
      });

      const results = await provider.search('fallback-test', 5);
      expect(results).toHaveLength(1);
      expect(results[0].slug).toBe('phim-403-fallback');
      expect(getSpy).toHaveBeenCalledTimes(2); // 1 direct attempt (no retry), 1 proxy attempt
    });

    it('1.2 Direct 429 Rate Limit -> Retries direct with backoff, then falls back to proxy', async () => {
      process.env.PROXY_URL = 'https://proxy.render.com';
      const provider = new NguonCProvider();

      const searchPayload = {
        items: [{ name: 'Recovered via Proxy', slug: 'recovered-via-proxy', year: 2024 }],
      };

      let directCalls = 0;
      let proxyCalls = 0;

      vi.spyOn(axios, 'get').mockImplementation(async (url) => {
        if (url.startsWith('https://phim.nguonc.com')) {
          directCalls++;
          const err = new Error('Rate Limited');
          err.response = { status: 429 };
          throw err;
        }
        if (url.startsWith('https://proxy.render.com')) {
          proxyCalls++;
          return { status: 200, data: searchPayload };
        }
        throw new Error(`Unexpected URL: ${url}`);
      });

      const results = await provider.search('rate-limit-test', 5);
      expect(results).toHaveLength(1);
      expect(results[0].slug).toBe('recovered-via-proxy');
      expect(directCalls).toBe(3); // 1 initial + 2 retries
      expect(proxyCalls).toBe(1);
    });

    it('1.3 Direct ECONNABORTED timeout -> Retries direct with backoff, then falls back to proxy', async () => {
      process.env.PROXY_URL = 'https://proxy.render.com';
      const provider = new NguonCProvider();

      const searchPayload = {
        items: [{ name: 'Timeout Fallback Movie', slug: 'timeout-fallback-movie', year: 2024 }],
      };

      let directCalls = 0;
      let proxyCalls = 0;

      vi.spyOn(axios, 'get').mockImplementation(async (url) => {
        if (url.startsWith('https://phim.nguonc.com')) {
          directCalls++;
          const err = new Error('timeout of 3500ms exceeded');
          err.code = 'ECONNABORTED';
          throw err;
        }
        if (url.startsWith('https://proxy.render.com')) {
          proxyCalls++;
          return { status: 200, data: searchPayload };
        }
        throw new Error(`Unexpected URL: ${url}`);
      });

      const results = await provider.search('timeout-test', 5);
      expect(results).toHaveLength(1);
      expect(results[0].slug).toBe('timeout-fallback-movie');
      expect(directCalls).toBe(3); // 1 initial + 2 retries
      expect(proxyCalls).toBe(1);
    });

    it('1.4 Vercel Environment Proactive Proxy Forcing -> Bypasses direct fetch completely', async () => {
      process.env.VERCEL = '1';
      process.env.PROXY_URL = 'https://render-cluster.net';
      const provider = new NguonCProvider();

      const searchPayload = {
        items: [{ name: 'Vercel Fast Path', slug: 'vercel-fast-path', year: 2024 }],
      };

      const getSpy = vi.spyOn(axios, 'get').mockImplementation(async (url) => {
        if (url.startsWith('https://phim.nguonc.com')) {
          throw new Error('DIRECT CALL MUST NOT BE EXECUTED ON VERCEL');
        }
        if (url.startsWith('https://render-cluster.net')) {
          return { status: 200, data: searchPayload };
        }
        throw new Error(`Unexpected URL: ${url}`);
      });

      const results = await provider.search('fast-path', 5);
      expect(results).toHaveLength(1);
      expect(results[0].name).toBe('Vercel Fast Path');
      expect(getSpy).toHaveBeenCalledTimes(1);
      expect(getSpy.mock.calls[0][0]).toContain('https://render-cluster.net/api/proxy/nguonc');
    });

    it('1.5 Total Outage (Direct + All 3 Proxy Routes fail) -> Returns empty array gracefully', async () => {
      process.env.PROXY_URL = 'https://failing-proxy.com';
      const provider = new NguonCProvider();

      vi.spyOn(axios, 'get').mockRejectedValue(new Error('Total Network Failure'));

      const results = await provider.search('complete-blackout', 5);
      expect(results).toEqual([]);
    });

    it('1.6 Keyword sanitation and limits handling', async () => {
      const provider = new NguonCProvider();
      expect(await provider.search(null)).toEqual([]);
      expect(await provider.search(undefined)).toEqual([]);
      expect(await provider.search('')).toEqual([]);
      expect(await provider.search('   ')).toEqual([]);

      vi.spyOn(axios, 'get').mockResolvedValue({
        status: 200,
        data: {
          items: Array.from({ length: 20 }, (_, i) => ({
            name: `Movie ${i + 1}`,
            slug: `movie-${i + 1}`,
          })),
        },
      });

      const limited1 = await provider.search('movie', 3);
      expect(limited1).toHaveLength(3);

      const limited2 = await provider.search('movie', 1);
      expect(limited2).toHaveLength(1);
    });
  });

  // ==========================================================
  // SECTION 2: DETAIL ADVERSARIAL & CACHE SCENARIOS
  // ==========================================================
  describe('2. getDetail() Adversarial & Cache Scenarios', () => {
    it('2.1 Retrieves detail and populates L1 cache with TTL', async () => {
      const provider = new NguonCProvider();
      const mockMovie = {
        name: 'Chi Tiết Đầy Đủ',
        slug: 'chi-tiet-day-du',
        episodes: [
          {
            server_name: 'VIP NguonC',
            items: [{ name: '1', slug: 'tap-1', m3u8_url: 'https://cdn.com/1.m3u8' }],
          },
        ],
      };

      const getSpy = vi.spyOn(axios, 'get').mockResolvedValueOnce({
        status: 200,
        data: { status: 'success', movie: mockMovie },
      });

      const detail1 = await provider.getDetail('chi-tiet-day-du');
      expect(detail1).toBeDefined();
      expect(detail1.name).toBe('Chi Tiết Đầy Đủ');
      expect(getSpy).toHaveBeenCalledTimes(1);

      // Second call should hit L1 detailCache without making network request
      const detail2 = await provider.getDetail('chi-tiet-day-du');
      expect(detail2).toEqual(detail1);
      expect(getSpy).toHaveBeenCalledTimes(1);
    });

    it('2.2 Strips nguonc_ and nguonc: prefix safely via safeSlug', async () => {
      const provider = new NguonCProvider();
      const mockMovie = {
        name: 'Prefix Stripped Movie',
        slug: 'stripped-movie',
        episodes: [],
      };

      const getSpy = vi.spyOn(axios, 'get').mockResolvedValueOnce({
        status: 200,
        data: { status: 'success', movie: mockMovie },
      });

      const detail = await provider.getDetail('nguonc_stripped-movie');
      expect(detail.slug).toBe('stripped-movie');
      expect(getSpy.mock.calls[0][0]).toContain('/api/film/stripped-movie');
    });

    it('2.3 Direct ETIMEDOUT / ECONNABORTED -> falls back to proxy for detail', async () => {
      process.env.PROXY_URL = 'https://backup-proxy.com';
      const provider = new NguonCProvider();
      const mockMovie = { name: 'Timeout Fallback', slug: 'timeout-fallback', episodes: [] };

      vi.spyOn(axios, 'get').mockImplementation(async (url) => {
        if (url.startsWith('https://phim.nguonc.com')) {
          const err = new Error('timeout of 3500ms exceeded');
          err.code = 'ECONNABORTED';
          throw err;
        }
        if (url.startsWith('https://backup-proxy.com')) {
          return { status: 200, data: { movie: mockMovie } };
        }
        throw new Error(`Unexpected URL: ${url}`);
      });

      const detail = await provider.getDetail('timeout-fallback');
      expect(detail.name).toBe('Timeout Fallback');
    });

    it('2.4 Invalid slug or missing movie data returns null safely', async () => {
      const provider = new NguonCProvider();
      expect(await provider.getDetail('')).toBeNull();
      expect(await provider.getDetail(null)).toBeNull();

      vi.spyOn(axios, 'get').mockResolvedValueOnce({
        status: 200,
        data: { status: 'error', message: 'Movie not found' },
      });

      const detail = await provider.getDetail('non-existent-slug');
      expect(detail).toBeNull();
    });
  });

  // ==========================================================
  // SECTION 3: STREAMS GENERATION, PROXY WRAPPING & EPISODE MATCHING
  // ==========================================================
  describe('3. getStreams() Stream Aggregation & Episode Matching', () => {
    it('3.1 Generates correct HLS proxy URLs with base64url encoding and streamc referer', async () => {
      const provider = new NguonCProvider();
      vi.spyOn(provider, 'getDetail').mockResolvedValueOnce({
        name: 'Inception',
        slug: 'inception',
        episodes: [
          {
            server_name: 'Server VIP 1',
            items: [{ name: 'Full', slug: 'tap-full', m3u8_url: 'https://streamc.xyz/hls/inception.m3u8' }],
          },
          {
            server_name: 'Server VIP 2 (Backup)',
            items: [{ name: 'Full', slug: 'tap-full', m3u8_url: 'https://streamc.xyz/hls/inception_backup.m3u8' }],
          },
        ],
      });

      const proxyBase = 'https://addon-render.onrender.com';
      const streams = await provider.getStreams({
        slug: 'inception',
        type: 'movie',
        proxyBase,
      });

      expect(streams).toHaveLength(2);

      const s1 = streams[0];
      expect(s1.name).toBe('VIP Movies 🎬');
      expect(s1.serverName).toBe('Server VIP 1');
      expect(s1.title).toContain('[VIP 3 • NguonC] Server VIP 1');
      expect(s1.title).toContain('⚡ Server NguonC • Phát trực tiếp trong App');
      expect(s1.quality).toBe('1080p');
      expect(s1.rawUrl).toBe('https://streamc.xyz/hls/inception.m3u8');
      expect(s1.behaviorHints.notWebReady).toBe(false);
      expect(s1.behaviorHints.bingeGroup).toBe('nguonc-servervip1');

      // Verify URL format
      expect(s1.url.startsWith(`${proxyBase}/hls/manifest.m3u8?url=`)).toBe(true);
      const urlObj = new URL(s1.url);
      const decodedTarget = Buffer.from(urlObj.searchParams.get('url'), 'base64url').toString('utf8');
      const decodedRef = Buffer.from(urlObj.searchParams.get('ref'), 'base64url').toString('utf8');

      expect(decodedTarget).toBe('https://streamc.xyz/hls/inception.m3u8');
      expect(decodedRef).toBe('https://embed15.streamc.xyz/');
    });

    it('3.2 Returns raw stream URL when proxyBase is not provided', async () => {
      const provider = new NguonCProvider();
      vi.spyOn(provider, 'getDetail').mockResolvedValueOnce({
        name: 'Direct Stream Movie',
        slug: 'direct-stream',
        episodes: [
          {
            server_name: 'Server Direct',
            items: [{ name: 'Full', slug: 'tap-full', m3u8_url: 'https://streamc.xyz/direct.m3u8' }],
          },
        ],
      });

      const streams = await provider.getStreams({
        slug: 'direct-stream',
        type: 'movie',
        proxyBase: '',
      });

      expect(streams).toHaveLength(1);
      expect(streams[0].url).toBe('https://streamc.xyz/direct.m3u8');
      expect(streams[0].rawUrl).toBe('https://streamc.xyz/direct.m3u8');
    });

    it('3.3 Resolves series episodes matching various naming styles', async () => {
      const provider = new NguonCProvider();
      const mockDetail = {
        name: 'Korean Drama Series',
        slug: 'kdrama-series',
        episodes: [
          {
            server_name: 'Server Vietsub',
            items: [
              { name: '1', slug: 'tap-1', m3u8_url: 'https://cdn.com/ep1.m3u8' },
              { name: 'Tập 02', slug: 'tap-02', m3u8_url: 'https://cdn.com/ep2.m3u8' },
              { name: 'Tập 3 - Thuyết Minh', slug: 'tap-3', m3u8_url: 'https://cdn.com/ep3.m3u8' },
              { name: '04', slug: 'tap-04', m3u8_url: 'https://cdn.com/ep4.m3u8' },
            ],
          },
        ],
      };

      vi.spyOn(provider, 'getDetail').mockResolvedValue(mockDetail);

      // Episode 2
      const streamsEp2 = await provider.getStreams({ slug: 'kdrama-series', type: 'series', season: 1, episode: 2 });
      expect(streamsEp2[0].rawUrl).toBe('https://cdn.com/ep2.m3u8');
      expect(streamsEp2[0].title).toContain('Tập 02');

      // Episode 3
      const streamsEp3 = await provider.getStreams({ slug: 'kdrama-series', type: 'series', season: 1, episode: 3 });
      expect(streamsEp3[0].rawUrl).toBe('https://cdn.com/ep3.m3u8');

      // Episode 4
      const streamsEp4 = await provider.getStreams({ slug: 'kdrama-series', type: 'series', season: 1, episode: 4 });
      expect(streamsEp4[0].rawUrl).toBe('https://cdn.com/ep4.m3u8');
    });

    it('3.4 Positional argument support (backwards compatibility)', async () => {
      const provider = new NguonCProvider();
      vi.spyOn(provider, 'getDetail').mockResolvedValueOnce({
        name: 'Positional Movie',
        slug: 'pos-movie',
        episodes: [
          {
            server_name: 'Pos Server',
            items: [{ name: 'Full', slug: 'full', m3u8_url: 'https://cdn.com/pos.m3u8' }],
          },
        ],
      });

      const streams = await provider.getStreams('pos-movie', 1, 1, 'https://proxy.addon.com');
      expect(streams).toHaveLength(1);
      expect(streams[0].url).toContain('https://proxy.addon.com/hls/manifest.m3u8');
    });

    it('3.5 IMDb search fallback resolution and caching', async () => {
      const provider = new NguonCProvider();
      const imdbId = 'tt1234567';

      // 1. Search returns candidate
      vi.spyOn(provider, 'search').mockResolvedValueOnce([
        { name: 'Avatar: Dòng Chảy Của Nước', original_name: 'Avatar: The Way of Water', slug: 'avatar-2', year: 2022 },
      ]);

      // 2. getDetail returns details
      vi.spyOn(provider, 'getDetail').mockResolvedValueOnce({
        name: 'Avatar: The Way of Water',
        slug: 'avatar-2',
        episodes: [
          {
            server_name: 'VIP NguonC',
            items: [{ name: 'Full', slug: 'full', m3u8_url: 'https://streamc.xyz/avatar2.m3u8' }],
          },
        ],
      });

      const streams = await provider.getStreams({
        imdbId,
        title: 'Avatar: The Way of Water',
        aliases: ['Avatar 2', 'Avatar: Dòng Chảy Của Nước'],
        year: 2022,
        type: 'movie',
      });

      expect(streams).toHaveLength(1);
      expect(streams[0].rawUrl).toBe('https://streamc.xyz/avatar2.m3u8');

      // Verify IMDb cache populated
      const cachedSlug = await imdbCache.get(`nguonc:imdb:${imdbId}`);
      expect(cachedSlug).toBe('avatar-2');
    });
  });

  // ==========================================================
  // SECTION 4: TIMEOUT BOUNDS & RETRY BACKOFF INVARIANTS
  // ==========================================================
  describe('4. Timeout Bounds & Retry Policies', () => {
    it('4.1 Default timeouts adhere to specification limits (3.5s direct, 5.0s proxy)', async () => {
      const provider = new NguonCProvider();
      let capturedConfig = null;

      vi.spyOn(axios, 'get').mockImplementation(async (url, config) => {
        capturedConfig = config;
        return { status: 200, data: { status: 'success' } };
      });

      // Direct call
      await provider.fetchWithFallback('film/timeout-spec-check');
      expect(capturedConfig.timeout).toBe(3500);

      // Proxy call
      process.env.VERCEL = '1';
      process.env.PROXY_URL = 'https://proxy.domain.com';
      await provider.fetchWithFallback('film/timeout-spec-check');
      expect(capturedConfig.timeout).toBe(5000);
    });

    it('4.2 Non-retryable errors (400, 401, 404) fail fast on first attempt', async () => {
      const provider = new NguonCProvider();
      const getSpy = vi.spyOn(axios, 'get').mockImplementation(async () => {
        const err = new Error('Resource Not Found');
        err.response = { status: 404 };
        throw err;
      });

      await expect(
        provider.fetchWithFallback('film/unknown-film-404', { retries: 3 })
      ).rejects.toThrow('Resource Not Found');

      expect(getSpy).toHaveBeenCalledTimes(1); // No retries for 404
    });

    it('4.3 Cloudflare 403 Forbidden does NOT retry on direct; immediately falls back to proxy', async () => {
      process.env.PROXY_URL = 'https://proxy-fast-fallback.com';
      const provider = new NguonCProvider();

      let directCalls = 0;
      let proxyCalls = 0;

      vi.spyOn(axios, 'get').mockImplementation(async (url) => {
        if (url.startsWith('https://phim.nguonc.com')) {
          directCalls++;
          const err = new Error('Cloudflare Block');
          err.response = { status: 403 };
          throw err;
        }
        if (url.startsWith('https://proxy-fast-fallback.com')) {
          proxyCalls++;
          return { status: 200, data: { status: 'success', movie: { name: 'Fast 403 Fallback' } } };
        }
        throw new Error(`Unexpected URL: ${url}`);
      });

      const res = await provider.fetchWithFallback('film/fast-403', { retries: 3 });
      expect(res.movie.name).toBe('Fast 403 Fallback');
      expect(directCalls).toBe(1); // EXACTLY 1 call (no retry on 403)
      expect(proxyCalls).toBe(1);
    });

    it('4.4 Exponential backoff delay calculation correctness', async () => {
      const delays = [];
      const mockSleep = (ms) => {
        delays.push(ms);
        return Promise.resolve();
      };

      let attempt = 0;
      const fn = vi.fn(async () => {
        attempt++;
        if (attempt <= 3) {
          const err = new Error('500 Internal Server Error');
          err.response = { status: 500 };
          throw err;
        }
        return 'SUCCESS';
      });

      const result = await requestWithRetry(fn, {
        retries: 3,
        baseDelay: 200,
        factor: 2,
        maxDelay: 2000,
        sleepFn: mockSleep,
      });

      expect(result).toBe('SUCCESS');
      expect(delays).toEqual([200, 400, 800]); // 200 * 2^0, 200 * 2^1, 200 * 2^2
    });
  });
});
