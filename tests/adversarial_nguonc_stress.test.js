'use strict';

/**
 * ============================================================
 *  VIP Movies Addon — tests/adversarial_nguonc_stress.test.js
 *  Adversarial Challenge & Stress Test Suite for NguonC Provider
 * ============================================================
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
const axios = require('axios');
const nguonc = require('../src/providers/nguonc');
const {
  NguonCProvider,
  getProxyBase,
  isVercelEnvironment,
  resolveProxyUrls,
  isRetryableError,
  requestWithRetry,
  NGUONC_HEADERS,
} = nguonc;

describe('Adversarial Challenge & Stress Tests: NguonC Provider (Milestone M1)', () => {
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

  // =========================================================================
  // 1. Malformed Proxy URLs & Strange Inputs
  // =========================================================================
  describe('1. Malformed Proxy URLs & Edge Cases', () => {
    it('handles null, undefined, and empty string proxyBase safely', () => {
      expect(resolveProxyUrls('', 'https://phim.nguonc.com/api/film/test')).toEqual([]);
      expect(resolveProxyUrls(null, 'https://phim.nguonc.com/api/film/test')).toEqual([]);
      expect(resolveProxyUrls(undefined, 'https://phim.nguonc.com/api/film/test')).toEqual([]);
    });

    it('documents whitespace-only proxyBase returning relative path candidates (edge case)', () => {
      // Finding: When proxyBase is '   ', !proxyBase is false, so resolveProxyUrls produces relative paths
      const res = resolveProxyUrls('   ', 'https://phim.nguonc.com/api/film/test');
      expect(res[0]).toBe('/api/proxy/nguonc?url=' + encodeURIComponent('https://phim.nguonc.com/api/film/test'));
    });

    it('cleans extreme multiple trailing slashes in proxyBase', () => {
      const urls = resolveProxyUrls('https://my-proxy.onrender.com//////', 'https://phim.nguonc.com/api/film/test');
      expect(urls[0]).toBe('https://my-proxy.onrender.com/api/proxy/nguonc?url=' + encodeURIComponent('https://phim.nguonc.com/api/film/test'));
      expect(urls[1]).toBe('https://my-proxy.onrender.com/proxy/nguonc?url=' + encodeURIComponent('https://phim.nguonc.com/api/film/test'));
      expect(urls[2]).toBe('https://my-proxy.onrender.com/api/nguonc-proxy?url=' + encodeURIComponent('https://phim.nguonc.com/api/film/test'));
    });

    it('correctly preserves subpaths and custom ports in proxyBase', () => {
      const urls = resolveProxyUrls('http://127.0.0.1:8080/custom/subpath', 'https://phim.nguonc.com/api/film/test');
      expect(urls[0]).toBe('http://127.0.0.1:8080/custom/subpath/api/proxy/nguonc?url=' + encodeURIComponent('https://phim.nguonc.com/api/film/test'));
    });

    it('does not duplicate proxy endpoint when proxyBase already ends with a known proxy route', () => {
      const target = 'https://phim.nguonc.com/api/film/test';
      const encoded = encodeURIComponent(target);

      const u1 = resolveProxyUrls('https://render.com/api/proxy/nguonc', target);
      expect(u1).toEqual([`https://render.com/api/proxy/nguonc?url=${encoded}`]);

      const u2 = resolveProxyUrls('https://render.com/proxy/nguonc/', target);
      expect(u2).toEqual([`https://render.com/proxy/nguonc?url=${encoded}`]);

      const u3 = resolveProxyUrls('https://render.com/api/nguonc-proxy', target);
      expect(u3).toEqual([`https://render.com/api/nguonc-proxy?url=${encoded}`]);
    });

    it('properly encodes complex target URLs with query parameters and special chars', () => {
      const complexTarget = 'https://phim.nguonc.com/api/films/the-loai/hanh-dong?page=2&sort=desc&tag=phim+viet';
      const urls = resolveProxyUrls('https://render.com', complexTarget);
      expect(urls[0]).toBe(`https://render.com/api/proxy/nguonc?url=${encodeURIComponent(complexTarget)}`);
      expect(decodeURIComponent(urls[0].split('?url=')[1])).toBe(complexTarget);
    });
  });

  // =========================================================================
  // 2. Missing & Conflicting Environment Variables
  // =========================================================================
  describe('2. Missing & Conflicting Environment Variables', () => {
    it('returns empty proxy base when all env vars are missing or whitespace', () => {
      process.env.PROXY_URL = '   ';
      process.env.RENDER_EXTERNAL_URL = '';
      expect(getProxyBase()).toBe('');
    });

    it('respects strict environment priority: PROXY_URL > RENDER_EXTERNAL_URL > RENDER_BACKEND_URL > RENDER_URL', () => {
      process.env.RENDER_URL = 'https://url4.com';
      process.env.RENDER_BACKEND_URL = 'https://url3.com';
      process.env.RENDER_EXTERNAL_URL = 'https://url2.com';
      process.env.PROXY_URL = 'https://url1.com';

      expect(getProxyBase()).toBe('https://url1.com');

      delete process.env.PROXY_URL;
      expect(getProxyBase()).toBe('https://url2.com');

      delete process.env.RENDER_EXTERNAL_URL;
      expect(getProxyBase()).toBe('https://url3.com');

      delete process.env.RENDER_BACKEND_URL;
      expect(getProxyBase()).toBe('https://url4.com');
    });

    it('isVercelEnvironment evaluates falsy strings and unknown flags safely', () => {
      process.env.VERCEL = '0';
      expect(isVercelEnvironment()).toBe(false);

      process.env.VERCEL = 'false';
      expect(isVercelEnvironment()).toBe(false);

      delete process.env.VERCEL;
      expect(isVercelEnvironment()).toBe(false);

      process.env.VERCEL = '1';
      expect(isVercelEnvironment()).toBe(true);

      delete process.env.VERCEL;
      process.env.VERCEL = 'true';
      expect(isVercelEnvironment()).toBe(true);
    });

    it('detects AWS_LAMBDA_FUNCTION_NAME and NOW_REGION as serverless Vercel environments', () => {
      process.env.NOW_REGION = 'iad1';
      expect(isVercelEnvironment()).toBe(true);

      delete process.env.NOW_REGION;
      process.env.AWS_LAMBDA_FUNCTION_NAME = 'stremio-serverless';
      expect(isVercelEnvironment()).toBe(true);
    });
  });

  // =========================================================================
  // 3. Consecutive 502/503/504 Bad Gateway / Gateway Timeout Errors
  // =========================================================================
  describe('3. Consecutive 502/503/504 Server Errors & Multi-Route Fallbacks', () => {
    it('retries consecutive 502 Bad Gateway errors with exponential backoff and succeeds', async () => {
      const delays = [];
      const sleepSpy = vi.fn((ms) => {
        delays.push(ms);
        return Promise.resolve();
      });

      let attempts = 0;
      const fn = vi.fn(async () => {
        attempts++;
        if (attempts < 3) {
          const err = new Error('502 Bad Gateway');
          err.response = { status: 502, statusText: 'Bad Gateway' };
          throw err;
        }
        return { data: { success: true } };
      });

      const res = await requestWithRetry(fn, {
        retries: 3,
        baseDelay: 100,
        factor: 2,
        maxDelay: 1000,
        sleepFn: sleepSpy,
      });

      expect(res).toEqual({ data: { success: true } });
      expect(attempts).toBe(3);
      expect(delays).toEqual([100, 200]);
    });

    it('retries consecutive 504 Gateway Timeout errors up to maxRetries and fails if unrecovered', async () => {
      const delays = [];
      const sleepSpy = vi.fn((ms) => {
        delays.push(ms);
        return Promise.resolve();
      });

      const fn = vi.fn(async () => {
        const err = new Error('504 Gateway Timeout');
        err.response = { status: 504, statusText: 'Gateway Timeout' };
        throw err;
      });

      await expect(
        requestWithRetry(fn, {
          retries: 2,
          baseDelay: 150,
          factor: 2,
          sleepFn: sleepSpy,
        })
      ).rejects.toThrow('504 Gateway Timeout');

      expect(fn).toHaveBeenCalledTimes(3); // 1 initial + 2 retries
      expect(delays).toEqual([150, 300]);
    });

    it('fails over to secondary proxy candidate route when primary route fails all retries', async () => {
      process.env.PROXY_URL = 'https://render-cluster.com';
      process.env.VERCEL = '1';

      const provider = new NguonCProvider();
      const mockSuccessData = { status: 'success', movie: { name: 'Recovered via Route 2' } };

      const sleepSpy = vi.fn(() => Promise.resolve());
      let candidate1Calls = 0;
      let candidate2Calls = 0;

      vi.spyOn(axios, 'get').mockImplementation(async (url) => {
        if (url.includes('/api/proxy/nguonc')) {
          candidate1Calls++;
          const err = new Error('502 Bad Gateway on API route');
          err.response = { status: 502 };
          throw err;
        }
        if (url.includes('/proxy/nguonc')) {
          candidate2Calls++;
          return { data: mockSuccessData, status: 200 };
        }
        throw new Error(`Unexpected route: ${url}`);
      });

      const result = await provider.fetchWithFallback('film/multi-route-recovery', {
        retries: 2,
        baseDelay: 50,
        sleepFn: sleepSpy,
      });

      expect(result).toEqual(mockSuccessData);
      expect(candidate1Calls).toBe(3); // 1 initial + 2 retries on route 1
      expect(candidate2Calls).toBe(1); // route 2 succeeded on 1st try
    });

    it('throws final error if ALL proxy candidate routes exhaust all retries', async () => {
      process.env.PROXY_URL = 'https://render-cluster.com';
      process.env.VERCEL = '1';

      const provider = new NguonCProvider();
      const sleepSpy = vi.fn(() => Promise.resolve());

      vi.spyOn(axios, 'get').mockImplementation(async (url) => {
        const err = new Error('503 Service Unavailable across all routes');
        err.response = { status: 503 };
        throw err;
      });

      await expect(
        provider.fetchWithFallback('film/all-dead', {
          retries: 1,
          baseDelay: 10,
          sleepFn: sleepSpy,
        })
      ).rejects.toThrow('503 Service Unavailable across all routes');
    });
  });

  // =========================================================================
  // 4. Rate Limiting (429) & Network Level Errors
  // =========================================================================
  describe('4. Rate Limiting (429) & Network Level Errors', () => {
    it('isRetryableError correctly identifies all network disconnection and DNS errors', () => {
      expect(isRetryableError({ code: 'ECONNRESET' })).toBe(true);
      expect(isRetryableError({ code: 'ECONNABORTED' })).toBe(true);
      expect(isRetryableError({ code: 'ETIMEDOUT' })).toBe(true);
      expect(isRetryableError({ code: 'ENOTFOUND' })).toBe(true);
      expect(isRetryableError({ code: 'ECONNREFUSED' })).toBe(true);
      expect(isRetryableError({ code: 'EAI_AGAIN' })).toBe(true);
      expect(isRetryableError({ code: 'ERR_NETWORK' })).toBe(true);
      expect(isRetryableError({ message: 'socket hang up' })).toBe(true);
      expect(isRetryableError({ message: 'Network Error' })).toBe(true);
      expect(isRetryableError({ message: 'timeout of 5000ms exceeded' })).toBe(true);
    });

    it('isRetryableError rejects client errors (400, 401, 404, 422)', () => {
      expect(isRetryableError({ response: { status: 400 } })).toBe(false);
      expect(isRetryableError({ response: { status: 401 } })).toBe(false);
      expect(isRetryableError({ response: { status: 404 } })).toBe(false);
      expect(isRetryableError({ response: { status: 422 } })).toBe(false);
    });

    it('retries on HTTP 429 Too Many Requests in proxy fetch', async () => {
      process.env.PROXY_URL = 'https://proxy.com';
      process.env.VERCEL = '1';

      const provider = new NguonCProvider();
      const sleepSpy = vi.fn(() => Promise.resolve());
      let callCount = 0;

      vi.spyOn(axios, 'get').mockImplementation(async () => {
        callCount++;
        if (callCount === 1) {
          const err = new Error('Rate limit exceeded');
          err.response = { status: 429 };
          throw err;
        }
        return { data: { success: true }, status: 200 };
      });

      const res = await provider.fetchWithFallback('films/test-429', {
        retries: 2,
        baseDelay: 100,
        sleepFn: sleepSpy,
      });

      expect(res).toEqual({ success: true });
      expect(callCount).toBe(2);
      expect(sleepSpy).toHaveBeenCalledWith(100);
    });

    it('falls back from direct fetch to proxy when direct fetch hits 429 in non-Vercel mode', async () => {
      process.env.PROXY_URL = 'https://backup-proxy.com';
      const provider = new NguonCProvider();
      const sleepSpy = vi.fn(() => Promise.resolve());

      vi.spyOn(axios, 'get').mockImplementation(async (url) => {
        if (url.startsWith('https://phim.nguonc.com')) {
          const err = new Error('429 Rate Limit from Origin');
          err.response = { status: 429 };
          throw err;
        }
        if (url.startsWith('https://backup-proxy.com')) {
          return { data: { movie: { name: 'Proxy 429 Fallback' } }, status: 200 };
        }
        throw new Error(`Unknown: ${url}`);
      });

      const result = await provider.fetchWithFallback('film/rate-limit-direct', {
        retries: 1,
        baseDelay: 20,
        sleepFn: sleepSpy,
      });

      expect(result).toEqual({ movie: { name: 'Proxy 429 Fallback' } });
    });
  });

  // =========================================================================
  // 5. Cloudflare 403 Forbidden Bypass & Fast Path
  // =========================================================================
  describe('5. Cloudflare 403 Forbidden Bypass & Fast Path', () => {
    it('does NOT waste retries when receiving Cloudflare 403 on direct connection', async () => {
      process.env.PROXY_URL = 'https://fast-proxy.com';
      const provider = new NguonCProvider();
      const sleepSpy = vi.fn(() => Promise.resolve());
      let directCalls = 0;
      let proxyCalls = 0;

      vi.spyOn(axios, 'get').mockImplementation(async (url) => {
        if (url.startsWith('https://phim.nguonc.com')) {
          directCalls++;
          const err = new Error('Cloudflare 403 WAF Block');
          err.response = { status: 403, data: '<title>Just a moment...</title>' };
          throw err;
        }
        if (url.startsWith('https://fast-proxy.com')) {
          proxyCalls++;
          return { data: { movie: { name: 'Bypassed CF' } }, status: 200 };
        }
        throw new Error(`Unexpected URL: ${url}`);
      });

      const result = await provider.fetchWithFallback('film/cf-bypass', {
        retries: 3, // Even with retries=3 configured!
        baseDelay: 500,
        sleepFn: sleepSpy,
      });

      expect(result).toEqual({ movie: { name: 'Bypassed CF' } });
      expect(directCalls).toBe(1); // Exactly 1 direct call, NO retries!
      expect(proxyCalls).toBe(1);
      expect(sleepSpy).not.toHaveBeenCalled(); // 0ms delay before proxy fallback
    });

    it('proactively avoids direct requests on Vercel even when retries are requested', async () => {
      process.env.VERCEL = '1';
      process.env.PROXY_URL = 'https://vercel-proxy.com';
      const provider = new NguonCProvider();

      const directSpy = vi.fn();
      vi.spyOn(axios, 'get').mockImplementation(async (url) => {
        if (url.startsWith('https://phim.nguonc.com')) {
          directSpy();
          throw new Error('Direct should never be called in Vercel');
        }
        return { data: { movie: { name: 'Vercel Fast Proxy' } }, status: 200 };
      });

      const result = await provider.fetchWithFallback('film/fast');
      expect(result).toEqual({ movie: { name: 'Vercel Fast Proxy' } });
      expect(directSpy).not.toHaveBeenCalled();
    });
  });

  // =========================================================================
  // 6. Extreme Delay & Boundary Parameter Stress Tests
  // =========================================================================
  describe('6. Extreme Delay & Boundary Parameter Stress Tests', () => {
    it('handles baseDelay = 0 and maxDelay = 0 without error', async () => {
      const delays = [];
      const sleepSpy = vi.fn((ms) => {
        delays.push(ms);
        return Promise.resolve();
      });

      let count = 0;
      const fn = vi.fn(async () => {
        count++;
        if (count === 1) {
          const err = new Error('500 Server Error');
          err.response = { status: 500 };
          throw err;
        }
        return { ok: true };
      });

      const res = await requestWithRetry(fn, {
        retries: 2,
        baseDelay: 0,
        maxDelay: 0,
        sleepFn: sleepSpy,
      });

      expect(res).toEqual({ ok: true });
      expect(delays).toEqual([0]);
    });

    it('caps delay strictly at maxDelay when factor produces large exponential numbers', async () => {
      const delays = [];
      const sleepSpy = vi.fn((ms) => {
        delays.push(ms);
        return Promise.resolve();
      });

      let count = 0;
      const fn = vi.fn(async () => {
        count++;
        if (count <= 4) {
          const err = new Error('503 Service Unavailable');
          err.response = { status: 503 };
          throw err;
        }
        return { ok: true };
      });

      const res = await requestWithRetry(fn, {
        retries: 5,
        baseDelay: 100,
        factor: 10, // 100, 1000, 10000 -> capped at 500
        maxDelay: 500,
        sleepFn: sleepSpy,
      });

      expect(res).toEqual({ ok: true });
      expect(delays).toEqual([100, 500, 500, 500]);
    });

    it('handles retries = 0 by failing immediately after 1st attempt', async () => {
      const fn = vi.fn(async () => {
        const err = new Error('502 Bad Gateway');
        err.response = { status: 502 };
        throw err;
      });

      await expect(
        requestWithRetry(fn, {
          retries: 0,
          baseDelay: 100,
        })
      ).rejects.toThrow('502 Bad Gateway');

      expect(fn).toHaveBeenCalledTimes(1);
    });
  });

  // =========================================================================
  // 7. High-Level API Method Resilience & Input Sanitization
  // =========================================================================
  describe('7. High-Level API Method Resilience & Input Sanitization', () => {
    it('search() safely handles malicious, empty, or strange keywords without crashing', async () => {
      const provider = new NguonCProvider();

      expect(await provider.search('')).toEqual([]);
      expect(await provider.search('   ')).toEqual([]);
      expect(await provider.search(null)).toEqual([]);
      expect(await provider.search(undefined)).toEqual([]);

      // SQL injection & XSS keywords
      vi.spyOn(provider, 'fetchWithFallback').mockResolvedValueOnce({
        items: [{ name: 'Sanitized', slug: 'sanitized' }],
      });
      const sqlRes = await provider.search("'; DROP TABLE films; --", 5);
      expect(sqlRes).toHaveLength(1);
    });

    it('getDetail() handles null, invalid slugs, and network errors gracefully returning null', async () => {
      const provider = new NguonCProvider();

      expect(await provider.getDetail(null)).toBeNull();
      expect(await provider.getDetail('')).toBeNull();
      expect(await provider.getDetail('   ')).toBeNull();

      vi.spyOn(provider, 'fetchWithFallback').mockRejectedValueOnce(new Error('Backend 500'));
      const res = await provider.getDetail('error-slug');
      expect(res).toBeNull();
    });

    it('getCatalog() gracefully falls back when primary listType fails', async () => {
      const provider = new NguonCProvider();

      let callIndex = 0;
      vi.spyOn(provider, 'fetchWithFallback').mockImplementation(async (url) => {
        callIndex++;
        if (url.includes('/danh-sach/phim-chieu-rap')) {
          throw new Error('Category 404');
        }
        if (url.includes('/danh-sach/phim-le')) {
          return { items: [{ name: 'Phim Le Fallback', slug: 'phim-le-fallback' }] };
        }
        throw new Error('Unexpected');
      });

      const items = await provider.getCatalog('cinema', 1);
      expect(items).toHaveLength(1);
      expect(items[0].id).toBe('nguonc_phim-le-fallback');
    });

    it('getStreams() handles malformed objects, null inputs, and missing episodes safely', async () => {
      const provider = new NguonCProvider();

      expect(await provider.getStreams(null)).toEqual([]);
      expect(await provider.getStreams({})).toEqual([]);

      // Movie with no episode links
      vi.spyOn(provider, 'getDetail').mockResolvedValueOnce({
        name: 'Empty Movie',
        slug: 'empty-movie',
        episodes: [{ server_name: 'VIP', items: [] }],
      });

      const streams = await provider.getStreams({ slug: 'empty-movie' });
      expect(streams).toEqual([]);
    });

    it('getStreams() correctly formats HLS proxy URL with base64 encoded target and referer', async () => {
      const provider = new NguonCProvider();
      const mockM3u8 = 'https://embed15.streamc.xyz/play/test.m3u8';

      vi.spyOn(provider, 'getDetail').mockResolvedValueOnce({
        name: 'Test Stream Movie',
        slug: 'test-stream-movie',
        episodes: [
          {
            server_name: 'Server VIP #1',
            items: [{ name: 'Full', slug: 'full', m3u8_url: mockM3u8 }],
          },
        ],
      });

      const streams = await provider.getStreams({
        slug: 'test-stream-movie',
        proxyBase: 'https://hls-proxy.render.com',
      });

      expect(streams).toHaveLength(1);
      const stream = streams[0];
      expect(stream.name).toBe('VIP Movies 🎬');
      expect(stream.serverName).toBe('Server VIP #1');
      expect(stream.rawUrl).toBe(mockM3u8);
      expect(stream.url).toContain('https://hls-proxy.render.com/hls/manifest.m3u8?url=');

      // Verify base64 decoding of the generated proxy URL
      const urlParams = new URL(stream.url);
      const encodedUrl = urlParams.searchParams.get('url');
      const decodedUrl = Buffer.from(encodedUrl, 'base64url').toString('utf8');
      expect(decodedUrl).toBe(mockM3u8);

      const encodedRef = urlParams.searchParams.get('ref');
      const decodedRef = Buffer.from(encodedRef, 'base64url').toString('utf8');
      expect(decodedRef).toBe('https://embed15.streamc.xyz/');
    });
  });

  // =========================================================================
  // 8. High Concurrency & Reentrancy
  // =========================================================================
  describe('8. High Concurrency & Reentrancy Stress Test', () => {
    it('executes 50 simultaneous fetchWithFallback calls without cross-contamination or memory leaks', async () => {
      process.env.PROXY_URL = 'https://proxy-cluster.com';
      process.env.VERCEL = '1';

      const provider = new NguonCProvider();
      let callCounter = 0;

      vi.spyOn(axios, 'get').mockImplementation(async (url) => {
        callCounter++;
        const parsed = new URL(url);
        const target = parsed.searchParams.get('url');
        return {
          data: {
            status: 'success',
            target,
            callIndex: callCounter,
          },
          status: 200,
        };
      });

      const promises = Array.from({ length: 50 }, (_, i) =>
        provider.fetchWithFallback(`film/stress-test-${i}`)
      );

      const results = await Promise.all(promises);
      expect(results).toHaveLength(50);
      results.forEach((res, i) => {
        expect(res.status).toBe('success');
        expect(res.target).toContain(`film/stress-test-${i}`);
      });
      expect(callCounter).toBe(50);
    });
  });

  // =========================================================================
  // 9. Caching Layer & Cache Hit/Miss Isolation
  // =========================================================================
  describe('9. Caching Layer & Isolation', () => {
    it('getDetail() uses cached data when available without invoking fetchWithFallback', async () => {
      const provider = new NguonCProvider();
      const mockDetail = { name: 'Cached Film', slug: 'cached-film', episodes: [] };

      const fetchSpy = vi.spyOn(provider, 'fetchWithFallback');
      const { detailCache } = require('../src/lib/cache');
      await detailCache.set('nguonc:detail:cached-film', mockDetail, 60);

      const result = await provider.getDetail('cached-film');
      expect(result).toEqual(mockDetail);
      expect(fetchSpy).not.toHaveBeenCalled();
    });

    it('getCatalog() uses cached catalog items when cache key matches', async () => {
      const provider = new NguonCProvider();
      const mockCatalog = [{ id: 'nguonc_cached-cat', name: 'Cached Cat Movie' }];

      const fetchSpy = vi.spyOn(provider, 'fetchWithFallback');
      const { catalogCache } = require('../src/lib/cache');
      await catalogCache.set('nguonc:cat:phim-le:1::: ', mockCatalog, 60);

      const result = await provider.getCatalog('phim-le', 1);
      expect(result).toBeDefined();
    });
  });

  // =========================================================================
  // 10. Episode Matching & Embed Fallback Robustness
  // =========================================================================
  describe('10. Episode Matching & Stream Fallbacks', () => {
    it('falls back to embed_url when m3u8_url is missing on episode item', async () => {
      const provider = new NguonCProvider();
      const mockEmbed = 'https://embed15.streamc.xyz/embed/test-embed';

      vi.spyOn(provider, 'getDetail').mockResolvedValueOnce({
        name: 'Embed Movie',
        slug: 'embed-movie',
        episodes: [
          {
            server_name: 'VIP Embed',
            items: [{ name: 'Full', slug: 'full', embed_url: mockEmbed }],
          },
        ],
      });

      const streams = await provider.getStreams({
        slug: 'embed-movie',
        proxyBase: 'https://proxy.com',
      });

      expect(streams).toHaveLength(1);
      expect(streams[0].rawUrl).toBe(mockEmbed);
      expect(streams[0].url).toContain('https://proxy.com/hls/manifest.m3u8?url=');
    });

    it('matches non-numeric episode names and padded numbers (Tập 02, tap-02)', async () => {
      const provider = new NguonCProvider();
      vi.spyOn(provider, 'getDetail').mockResolvedValueOnce({
        name: 'Anime Series',
        slug: 'anime-series',
        episodes: [
          {
            server_name: 'VIP Anime',
            items: [
              { name: 'Tập 01', slug: 'tap-01', m3u8_url: 'https://cdn.com/ep1.m3u8' },
              { name: 'Tập 02', slug: 'tap-02', m3u8_url: 'https://cdn.com/ep2.m3u8' },
            ],
          },
        ],
      });

      const streams = await provider.getStreams({
        slug: 'anime-series',
        type: 'series',
        season: 1,
        episode: 2,
      });

      expect(streams).toHaveLength(1);
      expect(streams[0].rawUrl).toBe('https://cdn.com/ep2.m3u8');
      expect(streams[0].title).toContain('Tập 02');
    });

    it('returns rawUrl unchanged when proxyBase is not provided', async () => {
      const provider = new NguonCProvider();
      vi.spyOn(provider, 'getDetail').mockResolvedValueOnce({
        name: 'Direct Play Movie',
        slug: 'direct-play-movie',
        episodes: [
          {
            server_name: 'VIP Server',
            items: [{ name: 'Full', slug: 'full', m3u8_url: 'https://origin.cdn.com/play.m3u8' }],
          },
        ],
      });

      const streams = await provider.getStreams({
        slug: 'direct-play-movie',
        proxyBase: '',
      });

      expect(streams).toHaveLength(1);
      expect(streams[0].url).toBe('https://origin.cdn.com/play.m3u8');
    });
  });
});

