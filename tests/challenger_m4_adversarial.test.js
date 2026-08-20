'use strict';

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
const http = require('http');
const app = require('../src/index');
const { cache, flushCache } = require('../src/db/cache');
const { parseConfig, encodeConfig, getManifest, DEFAULT_CONFIG } = require('../src/manifest');
const {
  handleStream,
  rankStreams,
  scoreStreamQuality,
  resolveImdbStreams,
  resolveDirectStreams,
  resolveRawSlugStreams,
  fetchWithTimeout
} = require('../src/routes/stream');
const { kkphimProvider } = require('../src/providers/kkphim');
const { vsmovProvider } = require('../src/providers/vsmov');
const { nguoncProvider } = require('../src/providers/nguonc');
const { cinemetaService } = require('../src/services/cinemeta');
const { CIRCUIT_BREAKER } = require('../src/db/supabase');
const { getProxyBase } = require('../src/config');
const { encodeBase64Url, decodeBase64Url, computeBitmask } = require('../src/public/js/app');
const { generateQRCodeCanvas } = require('../src/public/js/qr-modal');

// Pure Node.js zero-dependency HTTP test helper
async function makeRequest(expressApp, path, options = {}) {
  return new Promise((resolve, reject) => {
    const server = expressApp.listen(0, '127.0.0.1', async () => {
      try {
        const port = server.address().port;
        const res = await fetch(`http://127.0.0.1:${port}${path}`, {
          method: options.method || 'GET',
          headers: options.headers || {}
        });
        const contentType = res.headers.get('content-type') || '';
        let body = null;
        let text = '';
        if (contentType.includes('application/json')) {
          body = await res.json();
        } else {
          text = await res.text();
        }
        server.close(() => {
          resolve({
            status: res.status,
            statusCode: res.status,
            headers: Object.fromEntries(res.headers.entries()),
            body,
            text
          });
        });
      } catch (err) {
        server.close(() => reject(err));
      }
    });
  });
}

function createMockReqRes({ params = {}, query = {}, path = '/', headers = {} } = {}) {
  const req = {
    params,
    query,
    path,
    headers: { host: 'localhost:7000', ...headers },
    protocol: 'http',
    get: (h) => req.headers[h.toLowerCase()]
  };

  const res = {
    statusCode: 200,
    headers: {},
    body: null,
    setHeader(key, val) {
      this.headers[key.toLowerCase()] = val;
      return this;
    },
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(data) {
      this.body = data;
      return this;
    }
  };

  return { req, res };
}

describe('Adversarial Challenger Test Suite: Milestone M4 Hardening', () => {

  beforeEach(() => {
    flushCache();
    vi.restoreAllMocks();
    CIRCUIT_BREAKER.reset();
  });

  afterEach(() => {
    flushCache();
    vi.restoreAllMocks();
  });

  // =========================================================================
  // 1. ADVERSARIAL ID FUZZING ON STREAM ROUTE
  // =========================================================================
  describe('1. Adversarial ID Fuzzing on stream.js', () => {

    it('1.1 should handle malformed compound IMDb IDs (ttNaN:abc:xyz, tt0:NaN:undefined) gracefully', async () => {
      vi.spyOn(cinemetaService, 'getMetadataForMatcher').mockResolvedValue(null);
      vi.spyOn(vsmovProvider, 'getStreams').mockResolvedValue([]);
      vi.spyOn(kkphimProvider, 'getStreams').mockResolvedValue([]);
      vi.spyOn(nguoncProvider, 'getStreams').mockResolvedValue([]);

      const hostileIds = [
        'ttNaN:abc:xyz',
        'tt0000000:NaN:undefined',
        'tt12345:null:null',
        'tt12345:-10:-20',
        'tt12345:1e10:1e10',
        'tt12345:9999999999999999999999999999:9999999999999999999999999999',
        'tt12345:0:0',
        'tt12345:1:2:3:4:5:6:7:8:9:10',
        'tt-invalid-format:season1:ep1'
      ];

      for (const id of hostileIds) {
        const { req, res } = createMockReqRes({
          params: { type: 'series', id: `${id}.json` }
        });
        await handleStream(req, res);
        expect(res.statusCode).toBe(200);
        expect(res.body).toBeDefined();
        expect(Array.isArray(res.body.streams)).toBe(true);
      }
    });

    it('1.2 should handle empty and whitespace-only IDs gracefully', async () => {
      const emptyIds = ['', ' ', '   ', '.json', '  .json'];

      for (const id of emptyIds) {
        const { req, res } = createMockReqRes({
          params: { type: 'movie', id }
        });
        await handleStream(req, res);
        expect(res.statusCode).toBe(200);
        expect(res.body).toEqual({ streams: [] });
      }
    });

    it('1.3 should handle non-existent IMDb IDs without errors', async () => {
      vi.spyOn(cinemetaService, 'getMetadataForMatcher').mockResolvedValue(null);

      const { req, res } = createMockReqRes({
        params: { type: 'movie', id: 'tt99999999999999999999.json' }
      });
      await handleStream(req, res);
      expect(res.statusCode).toBe(200);
      expect(res.body).toEqual({ streams: [] });
    });

    it('1.4 should handle special characters, path traversal, and XSS injection in ID parameter', async () => {
      vi.spyOn(cinemetaService, 'getMetadataForMatcher').mockResolvedValue(null);
      vi.spyOn(vsmovProvider, 'getStreams').mockResolvedValue([]);
      vi.spyOn(kkphimProvider, 'getStreams').mockResolvedValue([]);
      vi.spyOn(nguoncProvider, 'getStreams').mockResolvedValue([]);

      const dangerousIds = [
        '../../../../etc/passwd',
        '<script>alert("xss")</script>',
        'tt1234567\x00nullbyte',
        'tt1234567/..%2f..%2f',
        'tt12345:🔥:🍿',
        'tt12345;\x00DROP TABLE streams;',
        'kkphim:slug/../../etc/shadow'
      ];

      for (const id of dangerousIds) {
        const { req, res } = createMockReqRes({
          params: { type: 'movie', id: `${id}.json` }
        });
        await handleStream(req, res);
        expect(res.statusCode).toBe(200);
        expect(res.body).toBeDefined();
        expect(Array.isArray(res.body.streams)).toBe(true);
      }
    });

    it('1.5 should handle corrupted provider prefixes (colon prefix bugs)', async () => {
      vi.spyOn(vsmovProvider, 'getStreams').mockResolvedValue([]);
      vi.spyOn(kkphimProvider, 'getStreams').mockResolvedValue([]);
      vi.spyOn(nguoncProvider, 'getStreams').mockResolvedValue([]);

      const corruptPrefixes = [
        'kkphim:',
        'vsmov:',
        'nguonc:',
        'kkphim:::',
        'vsmov:undefined:NaN',
        'nguonc:[object Object]',
        'kkphim_undefined',
        'vsmov:null:null',
        'nguonc:0:0'
      ];

      for (const rawId of corruptPrefixes) {
        const { req, res } = createMockReqRes({
          params: { type: 'movie', id: `${rawId}.json` }
        });
        await handleStream(req, res);
        expect(res.statusCode).toBe(200);
        expect(res.body).toBeDefined();
        expect(Array.isArray(res.body.streams)).toBe(true);
      }
    });

    it('1.6 should cascade unknown provider prefixes to raw slug resolver', async () => {
      const spyNguonc = vi.spyOn(nguoncProvider, 'getStreams').mockResolvedValue([]);
      const spyKkphim = vi.spyOn(kkphimProvider, 'getStreams').mockResolvedValue([]);
      const spyVsmov = vi.spyOn(vsmovProvider, 'getStreams').mockResolvedValue([]);

      const { req, res } = createMockReqRes({
        params: { type: 'movie', id: 'netflix:stranger-things.json' }
      });
      await handleStream(req, res);
      expect(res.statusCode).toBe(200);
      expect(res.body).toEqual({ streams: [] });
      expect(spyNguonc).toHaveBeenCalled();
      expect(spyKkphim).toHaveBeenCalled();
      expect(spyVsmov).toHaveBeenCalled();
    });

    it('1.7 should handle extremely long raw slug (10,000 characters)', async () => {
      vi.spyOn(vsmovProvider, 'getStreams').mockResolvedValue([]);
      vi.spyOn(kkphimProvider, 'getStreams').mockResolvedValue([]);
      vi.spyOn(nguoncProvider, 'getStreams').mockResolvedValue([]);

      const hugeSlug = 'long-slug-' + 'a'.repeat(10000);
      const { req, res } = createMockReqRes({
        params: { type: 'movie', id: `${hugeSlug}.json` }
      });
      await handleStream(req, res);
      expect(res.statusCode).toBe(200);
      expect(res.body).toEqual({ streams: [] });
    });
  });

  // =========================================================================
  // 2. HOSTILE CONFIG TOKENS & PROTOTYPE POLLUTION
  // =========================================================================
  describe('2. Hostile Config Tokens & Prototype Pollution', () => {

    it('2.1 should defend against prototype pollution payloads in config', () => {
      const pollutionObj = JSON.parse('{"__proto__":{"polluted":true},"constructor":{"prototype":{"admin":true}}}');
      const token = Buffer.from(JSON.stringify(pollutionObj)).toString('base64url');

      const parsed = parseConfig(token);
      expect(parsed).toBeDefined();
      expect(Object.prototype.polluted).toBeUndefined();
      expect(Object.prototype.admin).toBeUndefined();
      expect(Array.isArray(parsed.providers)).toBe(true);
      expect(Array.isArray(parsed.categories)).toBe(true);
    });

    it('2.2 should handle corrupted base64url strings with invalid characters or bad padding', () => {
      const corruptedTokens = [
        '!!!invalid-base64!!!',
        '==badpadding==',
        'abc==',
        '~@#$%^&*()_+',
        'A',
        'AA',
        'AAA',
        '%00%00%00',
        'undefined',
        'null'
      ];

      for (const token of corruptedTokens) {
        const parsed = parseConfig(token);
        expect(parsed).toEqual(DEFAULT_CONFIG);
      }
    });

    it('2.3 should handle type confusion in config JSON fields', () => {
      const typeConfusions = [
        { providers: 12345, categories: 'invalid' },
        { providers: null, categories: undefined },
        { providers: {}, categories: false },
        { providers: [null, undefined, 123, true, {}] },
        { preferredAudio: { attack: 'vector' }, proxyQuality: [1, 2, 3] },
        { providers: [] } // empty providers array should fallback to defaults
      ];

      for (const obj of typeConfusions) {
        const token = Buffer.from(JSON.stringify(obj)).toString('base64url');
        const parsed = parseConfig(token);
        expect(parsed).toBeDefined();
        expect(Array.isArray(parsed.providers)).toBe(true);
        expect(Array.isArray(parsed.categories)).toBe(true);
      }
    });

    it('2.4 should handle extreme bitmask numbers (0, -1, 65535, NaN, floating point)', () => {
      const bitmaskInputs = ['0', '-1', '65535', '999999999', '123.456', 'NaN', '0007'];

      for (const input of bitmaskInputs) {
        const parsed = parseConfig(input);
        expect(parsed).toBeDefined();
        expect(Array.isArray(parsed.providers)).toBe(true);
        expect(Array.isArray(parsed.categories)).toBe(true);
      }
    });

    it('2.5 should generate valid manifest with filtered catalogs from config token', () => {
      const customConfig = {
        providers: ['vsmov'],
        categories: ['phim-le']
      };
      const token = encodeConfig(customConfig);
      const manifest = getManifest(token);

      expect(manifest.id).toBeDefined();
      expect(manifest.name).toContain('VSMOV 4K');
      expect(manifest.catalogs.every(c => c.id.startsWith('vsmov'))).toBe(true);
    });
  });

  // =========================================================================
  // 3. PROVIDER TIMEOUTS & NETWORK ERROR RESILIENCE
  // =========================================================================
  describe('3. Provider Timeouts & Network Error Resilience', () => {

    it('3.1 should return empty streams gracefully when all providers fail or throw', async () => {
      vi.spyOn(cinemetaService, 'getMetadataForMatcher').mockResolvedValue({
        imdbId: 'tt1375666',
        type: 'movie',
        title: 'Inception'
      });

      vi.spyOn(vsmovProvider, 'getStreams').mockRejectedValue(new Error('VSMOV 503 Service Unavailable'));
      vi.spyOn(kkphimProvider, 'getStreams').mockRejectedValue(new Error('KKPhim 502 Bad Gateway'));
      vi.spyOn(nguoncProvider, 'getStreams').mockRejectedValue(new Error('NguonC 403 Forbidden'));

      const { req, res } = createMockReqRes({
        params: { type: 'movie', id: 'tt1375666.json' }
      });

      await handleStream(req, res);
      expect(res.statusCode).toBe(200);
      expect(res.body).toEqual({ streams: [] });
    });

    it('3.2 fetchWithTimeout should abort hanging promises and resolve empty array within timeoutMs', async () => {
      const hangingPromise = new Promise(() => {}); // Never resolves
      const start = Date.now();
      const result = await fetchWithTimeout(hangingPromise, 50);
      const elapsed = Date.now() - start;

      expect(result).toEqual([]);
      expect(elapsed).toBeGreaterThanOrEqual(40);
      expect(elapsed).toBeLessThan(300);
    });

    it('3.3 should isolate failing providers and return streams from surviving providers', async () => {
      vi.spyOn(cinemetaService, 'getMetadataForMatcher').mockResolvedValue({
        imdbId: 'tt1375666',
        type: 'movie',
        title: 'Inception'
      });

      // VSMOV fails with error
      vi.spyOn(vsmovProvider, 'getStreams').mockRejectedValue(new Error('VSMOV ECONNRESET'));
      // KKPhim hangs forever
      vi.spyOn(kkphimProvider, 'getStreams').mockImplementation(() => new Promise(() => {}));
      // NguonC succeeds
      vi.spyOn(nguoncProvider, 'getStreams').mockResolvedValue([
        { name: '[HD 1080p] NguonC', title: 'Inception StreamC', url: 'http://nguonc.com/stream.m3u8' }
      ]);

      const { req, res } = createMockReqRes({
        params: { type: 'movie', id: 'tt1375666.json' }
      });

      await handleStream(req, res);
      expect(res.statusCode).toBe(200);
      expect(res.body.streams.length).toBe(1);
      expect(res.body.streams[0].name).toContain('NguonC');
    });

    it('3.4 should handle providers throwing non-Error primitives (strings, numbers, null)', async () => {
      vi.spyOn(cinemetaService, 'getMetadataForMatcher').mockResolvedValue({
        imdbId: 'tt1375666',
        type: 'movie',
        title: 'Inception'
      });

      vi.spyOn(vsmovProvider, 'getStreams').mockRejectedValue('String rejection');
      vi.spyOn(kkphimProvider, 'getStreams').mockRejectedValue(null);
      vi.spyOn(nguoncProvider, 'getStreams').mockRejectedValue(12345);

      const { req, res } = createMockReqRes({
        params: { type: 'movie', id: 'tt1375666.json' }
      });

      await handleStream(req, res);
      expect(res.statusCode).toBe(200);
      expect(res.body).toEqual({ streams: [] });
    });

    it('3.5 should handle providers returning non-array or malformed stream objects without crashing ranking', () => {
      const corruptStreams = [
        null,
        undefined,
        'string instead of stream',
        12345,
        {},
        { name: null, title: undefined, url: 'http://valid.url' },
        { name: '4K Stream', title: 'Test 4K Vietsub', url: 'http://4k.url' }
      ];

      const scored = scoreStreamQuality(null);
      expect(scored).toBe(0);

      const ranked = rankStreams(corruptStreams, 'vietsub');
      expect(Array.isArray(ranked)).toBe(true);
      expect(ranked.length).toBe(corruptStreams.length);
      // Top stream should be the valid 4K one
      expect(ranked[0].name).toBe('4K Stream');
    });
  });

  // =========================================================================
  // 4. ANTI-403 PROXY STREAM URL REWRITING & ROUTING
  // =========================================================================
  describe('4. Anti-403 Proxy Stream URL Rewriting & Endpoints', () => {

    it('4.1 getProxyBase should dynamically resolve host from request headers', () => {
      const mockReq = {
        headers: {
          'x-forwarded-proto': 'https',
          'x-forwarded-host': 'custom-domain.com:8443'
        },
        protocol: 'http'
      };
      const base = getProxyBase(mockReq);
      expect(base).toBe('https://custom-domain.com:8443');
    });

    it('4.2 NguonC getStreams should wrap stream URL with proxyBase for protected StreamC links', async () => {
      vi.spyOn(nguoncProvider, 'getDetail').mockResolvedValue({
        movie: {
          slug: 'cuu-mon',
          name: 'Cửu Môn',
          total_episodes: 1,
          episodes: [
            {
              server_name: 'VIP 3',
              items: [
                {
                  name: 'Full',
                  m3u8: 'https://protected-streamc.cdn/cuu-mon.m3u8'
                }
              ]
            }
          ]
        }
      });

      const streams = await nguoncProvider.getStreams({
        type: 'movie',
        id: 'cuu-mon',
        slug: 'cuu-mon',
        proxyBase: 'http://localhost:7000'
      });

      expect(streams.length).toBe(1);
      expect(streams[0].url).toContain('http://localhost:7000/hls/manifest.m3u8?url=');
      expect(streams[0].name).toContain('NguonC');
    });

    it('4.3 Express app should route all stream endpoint variants with CORS headers', async () => {
      vi.spyOn(cinemetaService, 'getMetadataForMatcher').mockResolvedValue(null);
      vi.spyOn(vsmovProvider, 'getStreams').mockResolvedValue([]);
      vi.spyOn(kkphimProvider, 'getStreams').mockResolvedValue([]);
      vi.spyOn(nguoncProvider, 'getStreams').mockResolvedValue([]);

      const endpoints = [
        '/stream/movie/tt1375666.json',
        '/stream/movie/tt1375666',
        '/default/stream/movie/tt1375666.json',
        '/c/default/stream/movie/tt1375666.json'
      ];

      for (const ep of endpoints) {
        const res = await makeRequest(app, ep);
        expect(res.statusCode).toBe(200);
        expect(res.headers['access-control-allow-origin']).toBe('*');
        expect(res.body).toHaveProperty('streams');
      }
    });

    it('4.4 Fallback 404 handler should return empty JSON for Stremio endpoints', async () => {
      const resCatalog = await makeRequest(app, '/api/unmatched/catalog/movie.json');
      expect(resCatalog.statusCode).toBe(200);
      expect(resCatalog.body).toEqual({ metas: [] });

      const resStream = await makeRequest(app, '/api/unmatched/stream/test.json');
      expect(resStream.statusCode).toBe(200);
      expect(resStream.body).toEqual({ streams: [] });

      const resMeta = await makeRequest(app, '/api/unmatched/meta/test.json');
      expect(resMeta.statusCode).toBe(200);
      expect(resMeta.body).toEqual({ meta: null });
    });
  });

  // =========================================================================
  // 5. CYBER-GLASSMORPHISM DASHBOARD UI & CLIENT UTILS
  // =========================================================================
  describe('5. Cyber-Glassmorphism Dashboard UI & Client Utilities', () => {

    it('5.1 encodeBase64Url and decodeBase64Url should be strictly isomorphic', () => {
      const stateObj = {
        providers: ['vsmov', 'kkphim'],
        categories: ['phim-le', 'hoat-hinh'],
        proxyQuality: '1080p',
        preferredAudio: 'thuyet-minh'
      };

      const token = encodeBase64Url(stateObj);
      expect(token).toBeDefined();
      expect(token).not.toContain('+');
      expect(token).not.toContain('/');
      expect(token).not.toContain('=');

      const decoded = decodeBase64Url(token);
      expect(decoded).toEqual(stateObj);
    });

    it('5.2 computeBitmask should produce correct bitmask flags for providers & categories', () => {
      const bitmask = computeBitmask();
      // default: nguonc(1) + kkphim(2) + vsmov(4) + phim-le(8) + phim-bo(16) + hoat-hinh(32) + phim-chieu-rap(64) + phim-moi(128)
      expect(bitmask).toBe(255);
    });

    it('5.3 generateQRCodeCanvas should render modules without crashing on mock canvas', () => {
      const fillRectCalls = [];
      const mockCanvas = {
        width: 220,
        height: 220,
        getContext: () => ({
          fillStyle: '#000000',
          fillRect: (x, y, w, h) => fillRectCalls.push({ x, y, w, h })
        })
      };

      expect(() => {
        generateQRCodeCanvas('https://addon.domain/c/token/manifest.json', mockCanvas);
      }).not.toThrow();

      expect(fillRectCalls.length).toBeGreaterThan(50);
    });

    it('5.4 Express app should serve dashboard HTML for root, /configure, and /c/:config', async () => {
      const endpoints = ['/', '/configure', '/c/test-token', '/test-token/configure'];

      for (const ep of endpoints) {
        const res = await makeRequest(app, ep);
        expect(res.statusCode).toBe(200);
        expect(res.headers['content-type']).toContain('text/html');
        expect(res.text).toContain('VIP Movies Stremio Addon');
        expect(res.text).toContain('obsidian-space');
      }
    });

    it('5.5 Health check endpoint should return 200 OK with server uptime', async () => {
      const res = await makeRequest(app, '/health');
      expect(res.statusCode).toBe(200);
      expect(res.body.status).toBe('ok');
      expect(res.body.version).toBe('2.0.0');
      expect(typeof res.body.uptime).toBe('number');
    });
  });
});
