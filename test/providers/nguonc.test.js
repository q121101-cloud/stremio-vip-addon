'use strict';

/**
 * ============================================================
 *  VIP Movies Addon — test/providers/nguonc.test.js
 *  Unit & Regression Tests for NguonC Provider
 * ============================================================
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
const axios = require('axios');
const nguonc = require('../../src/providers/nguonc');
const {
  NguonCProvider,
  getProxyBase,
  isVercelEnvironment,
  resolveProxyUrls,
  isRetryableError,
  requestWithRetry,
  NGUONC_HEADERS,
} = nguonc;

describe('NguonC Provider: Proxy Resolution, Vercel Detection, Retry & Fallbacks', () => {
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

  describe('1. Proxy Base & URL Resolution', () => {
    it('resolves PROXY_URL with highest priority', () => {
      process.env.PROXY_URL = 'https://proxy1.example.com/';
      process.env.RENDER_EXTERNAL_URL = 'https://proxy2.example.com/';
      expect(getProxyBase()).toBe('https://proxy1.example.com');
    });

    it('falls back across RENDER_EXTERNAL_URL, RENDER_BACKEND_URL, and RENDER_URL', () => {
      process.env.RENDER_EXTERNAL_URL = 'https://render-ext.com///';
      expect(getProxyBase()).toBe('https://render-ext.com');

      delete process.env.RENDER_EXTERNAL_URL;
      process.env.RENDER_BACKEND_URL = 'https://render-backend.com';
      expect(getProxyBase()).toBe('https://render-backend.com');

      delete process.env.RENDER_BACKEND_URL;
      process.env.RENDER_URL = 'https://render-fallback.com/';
      expect(getProxyBase()).toBe('https://render-fallback.com');
    });

    it('returns empty string when no proxy env var is defined', () => {
      expect(getProxyBase()).toBe('');
    });

    it('generates candidate proxy URLs properly', () => {
      const targetUrl = 'https://phim.nguonc.com/api/film/cuu-mon';
      const encoded = encodeURIComponent(targetUrl);
      const urls = resolveProxyUrls('https://proxy.render.com', targetUrl);

      expect(urls).toEqual([
        `https://proxy.render.com/api/proxy/nguonc?url=${encoded}`,
        `https://proxy.render.com/proxy/nguonc?url=${encoded}`,
        `https://proxy.render.com/api/nguonc-proxy?url=${encoded}`,
      ]);
    });

    it('handles proxy URL that already includes proxy path', () => {
      const targetUrl = 'https://phim.nguonc.com/api/film/cuu-mon';
      const encoded = encodeURIComponent(targetUrl);
      const urls = resolveProxyUrls('https://proxy.render.com/api/proxy/nguonc', targetUrl);

      expect(urls).toEqual([`https://proxy.render.com/api/proxy/nguonc?url=${encoded}`]);
    });
  });

  describe('2. Vercel Environment Detection & Proactive Proxy Forcing', () => {
    it('detects VERCEL=1', () => {
      process.env.VERCEL = '1';
      expect(isVercelEnvironment()).toBe(true);
    });

    it('detects VERCEL_ENV=production or preview', () => {
      process.env.VERCEL_ENV = 'production';
      expect(isVercelEnvironment()).toBe(true);
    });

    it('detects NOW_REGION or AWS_LAMBDA_FUNCTION_NAME', () => {
      process.env.AWS_LAMBDA_FUNCTION_NAME = 'index-fn';
      expect(isVercelEnvironment()).toBe(true);
    });

    it('returns false for local / non-Vercel environment', () => {
      expect(isVercelEnvironment()).toBe(false);
    });

    it('proactively forces proxy in Vercel environment without direct fetch attempt', async () => {
      process.env.VERCEL = '1';
      process.env.PROXY_URL = 'https://render-proxy.com';

      const provider = new NguonCProvider();
      const mockData = { status: 'success', movie: { name: 'Test Movie', slug: 'test-movie' } };

      const getSpy = vi.spyOn(axios, 'get').mockImplementation(async (url) => {
        if (url.startsWith('https://render-proxy.com')) {
          return { data: mockData, status: 200 };
        }
        throw new Error('Direct fetch should NOT be called in Vercel mode');
      });

      const result = await provider.fetchWithFallback('https://phim.nguonc.com/api/film/test-movie');
      expect(result).toEqual(mockData);
      expect(getSpy).toHaveBeenCalledTimes(1);
      expect(getSpy.mock.calls[0][0]).toContain('https://render-proxy.com/api/proxy/nguonc');
    });
  });

  describe('3. Exponential Backoff & Retry Logic', () => {
    it('identifies retryable HTTP status codes and network errors', () => {
      expect(isRetryableError({ response: { status: 429 } })).toBe(true);
      expect(isRetryableError({ response: { status: 500 } })).toBe(true);
      expect(isRetryableError({ response: { status: 502 } })).toBe(true);
      expect(isRetryableError({ response: { status: 503 } })).toBe(true);
      expect(isRetryableError({ response: { status: 504 } })).toBe(true);
      expect(isRetryableError({ code: 'ECONNRESET' })).toBe(true);
      expect(isRetryableError({ code: 'ECONNABORTED' })).toBe(true);
      expect(isRetryableError({ code: 'ETIMEDOUT' })).toBe(true);
      expect(isRetryableError({ code: 'ENOTFOUND' })).toBe(true);
      expect(isRetryableError({ code: 'ECONNREFUSED' })).toBe(true);
      expect(isRetryableError({ message: 'timeout of 3500ms exceeded' })).toBe(true);

      // Non-retryable errors
      expect(isRetryableError({ response: { status: 404 } })).toBe(false);
      expect(isRetryableError({ response: { status: 400 } })).toBe(false);
      expect(isRetryableError(null)).toBe(false);
    });

    it('retries with exponential backoff on transient errors and succeeds on retry', async () => {
      const delays = [];
      const mockSleep = (ms) => {
        delays.push(ms);
        return Promise.resolve();
      };

      let callCount = 0;
      const fn = vi.fn(async (attempt) => {
        callCount++;
        if (callCount <= 2) {
          const err = new Error('Gateway Timeout');
          err.response = { status: 504 };
          throw err;
        }
        return { success: true };
      });

      const res = await requestWithRetry(fn, {
        retries: 3,
        baseDelay: 100,
        factor: 2,
        maxDelay: 1000,
        sleepFn: mockSleep,
      });

      expect(res).toEqual({ success: true });
      expect(callCount).toBe(3);
      expect(delays).toEqual([100, 200]);
    });

    it('throws error after exhausting max retries', async () => {
      const delays = [];
      const mockSleep = (ms) => {
        delays.push(ms);
        return Promise.resolve();
      };

      const fn = vi.fn(async () => {
        const err = new Error('Service Unavailable');
        err.response = { status: 503 };
        throw err;
      });

      await expect(
        requestWithRetry(fn, {
          retries: 2,
          baseDelay: 50,
          factor: 2,
          sleepFn: mockSleep,
        })
      ).rejects.toThrow('Service Unavailable');

      expect(fn).toHaveBeenCalledTimes(3); // 1 initial + 2 retries
      expect(delays).toEqual([50, 100]);
    });

    it('does not retry non-retryable errors', async () => {
      const fn = vi.fn(async () => {
        const err = new Error('Not Found');
        err.response = { status: 404 };
        throw err;
      });

      await expect(requestWithRetry(fn, { retries: 3 })).rejects.toThrow('Not Found');
      expect(fn).toHaveBeenCalledTimes(1);
    });
  });

  describe('4. Direct Connection & Cloudflare 403 Fallback in Non-Vercel Environments', () => {
    it('executes direct fetch successfully in non-Vercel environment', async () => {
      const provider = new NguonCProvider();
      const mockData = { status: 'success', items: [{ name: 'Movie 1', slug: 'movie-1' }] };

      const getSpy = vi.spyOn(axios, 'get').mockResolvedValueOnce({
        data: mockData,
        status: 200,
      });

      const result = await provider.fetchWithFallback('films/search?keyword=test');
      expect(result).toEqual(mockData);
      expect(getSpy).toHaveBeenCalledTimes(1);
      expect(getSpy.mock.calls[0][0]).toBe('https://phim.nguonc.com/api/films/search?keyword=test');
    });

    it('falls back to Render proxy immediately when direct request returns Cloudflare 403', async () => {
      process.env.RENDER_BACKEND_URL = 'https://render-backup.com';
      const provider = new NguonCProvider();
      const mockData = { status: 'success', movie: { name: 'Cloudflare Bypass Movie' } };

      const getSpy = vi.spyOn(axios, 'get').mockImplementation(async (url) => {
        if (url.startsWith('https://phim.nguonc.com')) {
          const err = new Error('Request failed with status code 403');
          err.response = { status: 403, data: 'Cloudflare WAF Block' };
          throw err;
        }
        if (url.startsWith('https://render-backup.com')) {
          return { data: mockData, status: 200 };
        }
        throw new Error(`Unexpected URL: ${url}`);
      });

      const result = await provider.fetchWithFallback('film/cf-test');
      expect(result).toEqual(mockData);
      expect(getSpy).toHaveBeenCalledTimes(2);
      expect(getSpy.mock.calls[0][0]).toBe('https://phim.nguonc.com/api/film/cf-test');
      expect(getSpy.mock.calls[1][0]).toContain('https://render-backup.com/api/proxy/nguonc');
    });

    it('falls back to second candidate proxy endpoint if primary returns 404', async () => {
      process.env.PROXY_URL = 'https://proxy-server.com';
      process.env.VERCEL = '1';
      const provider = new NguonCProvider();
      const mockData = { status: 'success', movie: { name: 'Secondary Proxy Success' } };

      const getSpy = vi.spyOn(axios, 'get').mockImplementation(async (url) => {
        if (url.includes('/api/proxy/nguonc')) {
          const err = new Error('Route not found');
          err.response = { status: 404 };
          throw err;
        }
        if (url.includes('/proxy/nguonc')) {
          return { data: mockData, status: 200 };
        }
        throw new Error(`Unexpected URL: ${url}`);
      });

      const result = await provider.fetchWithFallback('film/route-fallback');
      expect(result).toEqual(mockData);
      expect(getSpy).toHaveBeenCalledTimes(2);
    });

    it('rethrows error when direct connection fails and no proxy is configured', async () => {
      const provider = new NguonCProvider();
      vi.spyOn(axios, 'get').mockRejectedValueOnce(new Error('Network error'));

      await expect(
        provider.fetchWithFallback('film/fail', { retries: 0 })
      ).rejects.toThrow('Network error');
    });
  });

  describe('5. High-Level Provider Methods & Stream Contracts', () => {
    it('search() parses results safely and handles errors gracefully', async () => {
      const provider = new NguonCProvider();
      vi.spyOn(provider, 'fetchWithFallback').mockResolvedValueOnce({
        items: [
          { name: 'Phim A', slug: 'phim-a', quality: 'HD', year: 2024 },
          { name: 'Phim B', slug: 'phim-b', quality: 'FHD', year: 2023 },
        ],
      });

      const results = await provider.search('Phim', 2);
      expect(results).toHaveLength(2);
      expect(results[0].name).toBe('Phim A');
      expect(results[0].slug).toBe('phim-a');

      // Empty keyword
      const emptyResults = await provider.search('');
      expect(emptyResults).toEqual([]);
    });

    it('getDetail() retrieves movie data and formats episode structure', async () => {
      const provider = new NguonCProvider();
      vi.spyOn(provider, 'fetchWithFallback').mockResolvedValueOnce({
        status: 'success',
        movie: {
          name: 'Phim Chi Tiết',
          slug: 'phim-chi-tiet',
          episodes: [{ server_name: 'VIP 1', items: [{ name: '1', slug: 'tap-1', m3u8_url: 'https://cdn.com/1.m3u8' }] }],
        },
      });

      const detail = await provider.getDetail('phim-chi-tiet');
      expect(detail).toBeDefined();
      expect(detail.name).toBe('Phim Chi Tiết');
      expect(detail.episodes).toHaveLength(1);
    });

    it('getStreams() builds valid Stremio streams with HLS proxy base and bingeGroup', async () => {
      const provider = new NguonCProvider();
      vi.spyOn(provider, 'getDetail').mockResolvedValueOnce({
        name: 'Series Demo',
        slug: 'series-demo',
        episodes: [
          {
            server_name: 'Server #1',
            items: [
              { name: '1', slug: 'tap-1', m3u8_url: 'https://streamc.xyz/s1e1.m3u8' },
              { name: '2', slug: 'tap-2', m3u8_url: 'https://streamc.xyz/s1e2.m3u8' },
            ],
          },
        ],
      });

      const streams = await provider.getStreams({
        slug: 'series-demo',
        type: 'series',
        season: 1,
        episode: 2,
        proxyBase: 'https://addon-proxy.com',
      });

      expect(streams).toHaveLength(1);
      expect(streams[0].name).toBe('VIP Movies 🎬');
      expect(streams[0].serverName).toBe('Server #1');
      expect(streams[0].title).toContain('Tập 2');
      expect(streams[0].url).toContain('https://addon-proxy.com/hls/manifest.m3u8');
      expect(streams[0].behaviorHints.bingeGroup).toBe('nguonc-server1');
    });
  });
});
