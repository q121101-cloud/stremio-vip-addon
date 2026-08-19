'use strict';

/**
 * ============================================================
 *  VIP Movies Addon — test/adversarial_challenger_m23_1.test.js
 *  Empirical Adversarial Challenge & Stress Test Suite
 *  Role: Challenger M23_1 (Critic / Specialist)
 *
 *  Challenge Dimensions:
 *  1. StreamC M3U8 Extraction & Data-Obf Decoder (src/mapper.js):
 *     - Corrupted Base64 payloads (garbage, truncated, null bytes, non-base64)
 *     - Missing keys & unexpected schema types (array, primitives, empty, invalid types)
 *     - Malformed JSON payloads & multi-attribute collisions
 *     - Recursive & malformed Dean Edwards P.A.C.K.E.R scripts (invalid radix, count, ReDoS)
 *     - Fallback regex scanner under heavy load & escaped slashes
 *  2. HLS Proxy Anti-403 & Range Chunk Boundary Handling (src/routes/hls.js):
 *     - Domain anti-403 header matrix (StreamC, KKPhim, VSMOV, NguonC, Custom Ref)
 *     - HTTP Range Request 206 chunk boundary tests (1MB segment, boundaries, open ranges, out of bounds)
 *     - Upstream 200 local slicing vs Upstream 206 passthrough
 *     - Playlist & Key & Subtitle Rewriter edge cases
 *  3. Supabase Cache Flush Resiliency (src/db/supabase.js & scripts/flush_cache.js):
 *     - Mocked down database (ECONNREFUSED, network timeouts, unhandled errors)
 *     - Unapplied schema & missing tables (PGRST205 schema cache errors, partial missing tables)
 *     - Guaranteed L1 cache purge across all failure modes
 *     - Standalone CLI execution exit code 0 under broken environments
 * ============================================================
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from 'vitest';
const http = require('http');
const axios = require('axios');
const { execSync } = require('child_process');
const path = require('path');

const mapper = require('../src/mapper');
const hlsRoute = require('../src/routes/hls');
const app = require('../src/server');
const supabaseModule = require('../src/db/supabase');
const cacheModule = require('../src/db/cache');
const flushScript = require('../scripts/flush_cache');

let appServer = null;
let appBaseUrl = '';

let mockUpstreamServer = null;
let mockUpstreamPort = 0;
let mockUpstreamBaseUrl = '';

// Ephemeral 1MB TS buffer for Range chunk boundary testing
const TS_1MB_SIZE = 1000000;
const ts1MbBuffer = Buffer.alloc(TS_1MB_SIZE);
for (let i = 0; i < TS_1MB_SIZE; i++) {
  ts1MbBuffer[i] = i % 256;
}

describe('Challenger M23_1: Adversarial Stress Test Suite', () => {
  beforeAll(async () => {
    // 1. Start Addon App Server on Ephemeral Port
    appServer = await new Promise((resolve) => {
      const s = app.listen(0, '127.0.0.1', () => resolve(s));
    });
    const port = appServer.address().port;
    appBaseUrl = `http://127.0.0.1:${port}`;

    // 2. Start Mock Upstream CDN Server on Ephemeral Port
    mockUpstreamServer = http.createServer((req, res) => {
      const parsed = new URL(req.url, `http://127.0.0.1:${mockUpstreamPort}`);

      if (parsed.pathname === '/stream/1mb.ts') {
        const range = req.headers.range;
        if (range && req.headers['x-mock-upstream-206'] === '1') {
          // Mock upstream native 206
          const match = range.match(/bytes=(\d+)-(\d*)/);
          if (match) {
            const start = parseInt(match[1], 10);
            let end = match[2] ? parseInt(match[2], 10) : TS_1MB_SIZE - 1;
            if (isNaN(end) || end >= TS_1MB_SIZE) end = TS_1MB_SIZE - 1;
            const slice = ts1MbBuffer.subarray(start, end + 1);
            res.writeHead(206, {
              'Content-Type': 'video/MP2T',
              'Content-Range': `bytes ${start}-${end}/${TS_1MB_SIZE}`,
              'Content-Length': slice.length,
              'Accept-Ranges': 'bytes',
            });
            return res.end(slice);
          }
        }

        // Default upstream returns HTTP 200 (forcing local proxy slicing)
        res.writeHead(200, {
          'Content-Type': 'video/MP2T',
          'Content-Length': TS_1MB_SIZE,
          'Accept-Ranges': 'bytes',
        });
        return res.end(ts1MbBuffer);
      }

      if (parsed.pathname === '/stream/zero-length.ts') {
        res.writeHead(200, {
          'Content-Type': 'video/MP2T',
          'Content-Length': 0,
        });
        return res.end(Buffer.alloc(0));
      }

      if (parsed.pathname === '/embed/corrupted-obf.html') {
        res.writeHead(200, { 'Content-Type': 'text/html' });
        return res.end(`<html><body><div id="player" data-obf="!!!NOT-VALID-BASE64!!!"></div></body></html>`);
      }

      if (parsed.pathname === '/embed/valid-streamc.html') {
        const payload = Buffer.from(JSON.stringify({ sUb: 'hls/video.m3u8', hD: 'hash123' })).toString('base64');
        res.writeHead(200, { 'Content-Type': 'text/html' });
        return res.end(`<html><body><div id="player" data-obf="${payload}"></div></body></html>`);
      }

      if (parsed.pathname === '/embed/nested-packed.html') {
        // Packed script that decodes to another packed script or video URL
        res.writeHead(200, { 'Content-Type': 'text/html' });
        return res.end(`<html><body><script>eval(function(p,a,c,k,e,d){e=function(c){return c.toString(36)};if(!''.replace(/^/,String)){while(c--){d[c.toString(a)]=k[c]||c.toString(a)}k=[function(e){return d[e]}];e=function(){return'\\\\w+'};c=1};while(c--){if(k[c]){p=p.replace(new RegExp('\\\\b'+e(c)+'\\\\b','g'),k[c])}}return p}('4 3="1://2.0/5.6";',7,7,'com|https|cdn|videoUrl|var|playlist|m3u8'.split('|'),0,{}))</script></body></html>`);
      }

      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('Not Found');
    });

    await new Promise((resolve) => {
      mockUpstreamServer.listen(0, '127.0.0.1', () => {
        mockUpstreamPort = mockUpstreamServer.address().port;
        mockUpstreamBaseUrl = `http://127.0.0.1:${mockUpstreamPort}`;
        resolve();
      });
    });
  });

  afterAll(async () => {
    if (appServer) await new Promise((r) => appServer.close(r));
    if (mockUpstreamServer) await new Promise((r) => mockUpstreamServer.close(r));
  });

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // =========================================================================
  // CHALLENGE 1: StreamC M3U8 Extraction & Data-Obf Decoder in src/mapper.js
  // =========================================================================
  describe('Challenge 1: StreamC Extraction & data-obf Decoder Stress Tests', () => {
    it('1.1 decodeBase64 handles corrupted, garbage, null-byte, and malformed base64 without throwing', () => {
      const corruptedInputs = [
        null,
        undefined,
        '',
        '   ',
        '!@#$%^&*()_+{}|:"<>?',
        'dGVzdA',               // unpadded standard base64
        'dGVzdA===',            // excessive padding
        '///',
        '==',
        'aHR0cDovL2V4YW1wbGUuY29t', // non-JSON valid base64 ("http://example.com")
        Buffer.from('\x00\x00\x00\x01\x02').toString('base64'),
        'a'.repeat(100000),      // 100KB repetitive string
      ];

      for (const input of corruptedInputs) {
        expect(() => {
          const res = mapper.decodeBase64(input);
          expect(typeof res).toBe('string');
        }).not.toThrow();
      }
    });

    it('1.2 resolveParamUrl safely resolves plain, base64, base64url, and corrupted parameters', () => {
      expect(mapper.resolveParamUrl('https://example.com/live.m3u8')).toBe('https://example.com/live.m3u8');
      expect(mapper.resolveParamUrl('http://example.com/live.m3u8')).toBe('http://example.com/live.m3u8');
      expect(mapper.resolveParamUrl('data:text/vtt;base64,V0VCVlRUCg==')).toBe('data:text/vtt;base64,V0VCVlRUCg==');

      const b64Url = Buffer.from('https://cdn.test/stream.m3u8').toString('base64url');
      expect(mapper.resolveParamUrl(b64Url)).toBe('https://cdn.test/stream.m3u8');

      const b64Std = Buffer.from('https://cdn.test/standard.m3u8').toString('base64');
      expect(mapper.resolveParamUrl(b64Std)).toBe('https://cdn.test/standard.m3u8');

      // Malformed / Non-URL base64 fallback
      expect(mapper.resolveParamUrl(null)).toBeNull();
      expect(mapper.resolveParamUrl('')).toBeNull();
      expect(mapper.resolveParamUrl('   ')).toBeNull();
      expect(mapper.resolveParamUrl('plain-unencoded-slug')).toBe('plain-unencoded-slug');
    });

    it('1.3 extractM3u8FromEmbed handles missing keys & invalid JSON schemas in data-obf', async () => {
      const axiosGetSpy = vi.spyOn(axios, 'get');

      const testCases = [
        { payload: '{}', expectedM3u8: null },
        { payload: JSON.stringify({ other: 'value' }), expectedM3u8: null },
        { payload: JSON.stringify({ sUb: 12345 }), expectedM3u8: null },
        { payload: JSON.stringify({ sUb: {} }), expectedM3u8: null },
        { payload: JSON.stringify({ sUb: [] }), expectedM3u8: null },
        { payload: JSON.stringify([1, 2, 3]), expectedM3u8: null },
        { payload: 'true', expectedM3u8: null },
        { payload: '12345', expectedM3u8: null },
        { payload: JSON.stringify({ sUb: 'video.m3u8' }), expectedM3u8: 'https://embed.streamc.xyz/video.m3u8' },
        { payload: JSON.stringify({ sUb: '/video.m3u8' }), expectedM3u8: 'https://embed.streamc.xyz/video.m3u8' },
        { payload: JSON.stringify({ m3u8: 'https://cdn.direct.com/master.m3u8' }), expectedM3u8: 'https://cdn.direct.com/master.m3u8' },
        { payload: JSON.stringify({ url: 'https://cdn.direct.com/url.m3u8' }), expectedM3u8: 'https://cdn.direct.com/url.m3u8' },
        { payload: JSON.stringify({ file: 'https://cdn.direct.com/file.m3u8' }), expectedM3u8: 'https://cdn.direct.com/file.m3u8' },
        { payload: JSON.stringify({ hD: 'hash_999' }), expectedM3u8: 'https://embed.streamc.xyz/stream/hash_999/master.m3u8' },
      ];

      for (const tc of testCases) {
        const b64 = Buffer.from(tc.payload).toString('base64');
        axiosGetSpy.mockResolvedValueOnce({
          data: `<div id="player" data-obf="${b64}"></div>`,
          status: 200,
        });

        const res = await mapper.extractM3u8FromEmbed('https://embed.streamc.xyz/embed.php?id=123');
        if (tc.expectedM3u8) {
          expect(res).not.toBeNull();
          expect(res.m3u8Url).toBe(tc.expectedM3u8);
        } else {
          expect(res).toBeNull();
        }
      }
    });

    it('1.4 extractM3u8FromEmbed handles malformed JSON and syntax errors in data-obf', async () => {
      const axiosGetSpy = vi.spyOn(axios, 'get');

      const malformedPayloads = [
        '{ "sUb": "missing_quote }',
        '{ sUb: invalid_unquoted }',
        'undefined',
        '{"sUb": NaN}',
        '{"sUb": [}',
        '',
      ];

      for (const badJson of malformedPayloads) {
        const b64 = Buffer.from(badJson).toString('base64');
        axiosGetSpy.mockResolvedValueOnce({
          data: `<div id="player" data-obf="${b64}"></div>`,
          status: 200,
        });

        const res = await mapper.extractM3u8FromEmbed('https://embed.streamc.xyz/embed.php?id=bad');
        expect(res).toBeNull();
      }
    });

    it('1.5 unpackDeanEdwards handles invalid radix, corrupted symtabs, and malformed expressions', () => {
      expect(mapper.unpackDeanEdwards('')).toBeNull();
      expect(mapper.unpackDeanEdwards(null)).toBeNull();
      expect(mapper.unpackDeanEdwards(undefined)).toBeNull();
      expect(mapper.unpackDeanEdwards('not packed')).toBeNull();

      // Radix = 1 (invalid, must be 2..62)
      const invalidRadix1 = `eval(function(p,a,c,k,e,d){return p}('foo',1,1,'foo'.split('|')))`;
      expect(mapper.unpackDeanEdwards(invalidRadix1)).toBeNull();

      // Radix = 70 (invalid, exceeds 62)
      const invalidRadix70 = `eval(function(p,a,c,k,e,d){return p}('foo',70,1,'foo'.split('|')))`;
      expect(mapper.unpackDeanEdwards(invalidRadix70)).toBeNull();

      // Count NaN
      const nanCount = `eval(function(p,a,c,k,e,d){return p}('foo',10,NaN,'foo'.split('|')))`;
      expect(mapper.unpackDeanEdwards(nanCount)).toBeNull();

      // Valid Dean Edwards unpacking
      const validPacked = `eval(function(p,a,c,k,e,d){e=function(c){return c.toString(36)};if(!''.replace(/^/,String)){while(c--){d[c.toString(a)]=k[c]||c.toString(a)}k=[function(e){return d[e]}];e=function(){return'\\\\w+'};c=1};while(c--){if(k[c]){p=p.replace(new RegExp('\\\\b'+e(c)+'\\\\b','g'),k[c])}}return p}('4 3="1://2.0/5.6";',7,7,'com|https|cdn|videoUrl|var|playlist|m3u8'.split('|'),0,{}))`;
      const unpacked = mapper.unpackDeanEdwards(validPacked);
      expect(unpacked).toBeDefined();
      expect(unpacked).toContain('https://cdn.com/playlist.m3u8');
    });

    it('1.6 extractM3u8FromEmbed succeeds via live mock server with packed scripts and direct m3u8', async () => {
      // Direct m3u8 link
      const direct = await mapper.extractM3u8FromEmbed('https://cdn.example.com/hls/master.m3u8');
      expect(direct).toEqual({
        m3u8Url: 'https://cdn.example.com/hls/master.m3u8',
        embedHost: 'https://cdn.example.com',
      });

      // Valid StreamC embed page
      const streamc = await mapper.extractM3u8FromEmbed(`${mockUpstreamBaseUrl}/embed/valid-streamc.html`);
      expect(streamc).not.toBeNull();
      expect(streamc.m3u8Url).toBe(`${mockUpstreamBaseUrl}/hls/video.m3u8`);

      // Packed JS embed page
      const packed = await mapper.extractM3u8FromEmbed(`${mockUpstreamBaseUrl}/embed/nested-packed.html`);
      expect(packed).not.toBeNull();
      expect(packed.m3u8Url).toBe('https://cdn.com/playlist.m3u8');

      // Corrupted obf fallback
      const corrupted = await mapper.extractM3u8FromEmbed(`${mockUpstreamBaseUrl}/embed/corrupted-obf.html`);
      expect(corrupted).toBeNull();
    });

    it('1.7 prototype pollution payloads in data-obf are safely handled without polluting Object.prototype', async () => {
      const axiosGetSpy = vi.spyOn(axios, 'get');
      const maliciousJson = JSON.stringify({
        __proto__: { isAdmin: true },
        constructor: { prototype: { isEvil: true } },
        sUb: 'safe-video.m3u8',
      });
      const b64 = Buffer.from(maliciousJson).toString('base64');
      axiosGetSpy.mockResolvedValueOnce({
        data: `<div id="player" data-obf="${b64}"></div>`,
        status: 200,
      });

      const res = await mapper.extractM3u8FromEmbed('https://embed.streamc.xyz/embed.php?id=proto');
      expect(res).not.toBeNull();
      expect(res.m3u8Url).toBe('https://embed.streamc.xyz/safe-video.m3u8');
      expect(({}).isAdmin).toBeUndefined();
      expect(({}).isEvil).toBeUndefined();
    });

    it('1.8 ReDoS stress test: 1MB of repetitive regex backtrack patterns does not stall execution', async () => {
      const axiosGetSpy = vi.spyOn(axios, 'get');
      // Create 1MB of pathological repetitive string that could trigger catastrophic backtracking if regex is vulnerable
      const pathologicalHtml = '<div>' + 'baseUrl = "https://cdn.example.com/unclosed_string_repeat '.repeat(20000) + '</div>';
      axiosGetSpy.mockResolvedValueOnce({
        data: pathologicalHtml,
        status: 200,
      });

      const t0 = Date.now();
      const res = await mapper.extractM3u8FromEmbed('https://embed.streamc.xyz/embed.php?id=redos');
      const elapsed = Date.now() - t0;
      expect(res).toBeNull();
      expect(elapsed).toBeLessThan(1500); // Must resolve in < 1.5 seconds without hanging
    });

    it('1.9 buildStreams and formatEpisodeTitle handle edge cases and null/undefined values safely', () => {
      expect(mapper.formatEpisodeTitle(null)).toBe('Tập không xác định');
      expect(mapper.formatEpisodeTitle(undefined)).toBe('Tập không xác định');
      expect(mapper.formatEpisodeTitle('')).toBe('Tập không xác định');
      expect(mapper.formatEpisodeTitle('FULL')).toBe('📽️ Full Movie');
      expect(mapper.formatEpisodeTitle('full')).toBe('📽️ Full Movie');
      expect(mapper.formatEpisodeTitle('10')).toBe('Tập 10');
      expect(mapper.formatEpisodeTitle('10 (Tập cuối)')).toBe('Tập 10');
      expect(mapper.formatEpisodeTitle('Đặc biệt')).toBe('Tập Đặc biệt');

      // Empty / corrupted movie object
      expect(mapper.buildStreams({}, null)).toEqual([]);
      expect(mapper.buildStreams({ episodes: null }, null)).toEqual([]);
      expect(mapper.buildStreams({ episodes: [] }, null)).toEqual([]);

      const mockMovie = {
        slug: 'test-movie',
        episodes: [
          {
            server_name: 'Vietsub #1',
            items: [{ name: '1', slug: 'tap-1', embed: 'https://embed.streamc.xyz/1' }],
          },
        ],
      };
      const streams = mapper.buildStreams(mockMovie, '1', 'https://proxy.example.com');
      expect(streams.length).toBe(2); // HLS Proxy + Embed Player
      expect(streams[0].url).toContain('https://proxy.example.com/hls/extract?embed=');
      expect(streams[1].url).toBe('https://embed.streamc.xyz/1');
    });
  });

  // =========================================================================
  // CHALLENGE 2: HLS Proxy Anti-403 & Range Request Chunk Boundary Tests
  // =========================================================================
  describe('Challenge 2: HLS Proxy Anti-403 & Range Request Stress Tests', () => {
    it('2.1 getRefererHeaders generates correct anti-403 headers across all provider domains', () => {
      // StreamC / Amass2
      const sc1 = hlsRoute.getRefererHeaders('https://embed14.streamc.xyz/stream/abc/master.m3u8');
      expect(sc1.referer).toBe('https://embed14.streamc.xyz/');
      expect(sc1.origin).toBe('https://embed14.streamc.xyz');

      const sc2 = hlsRoute.getRefererHeaders('https://s1.amass2.top/hls/test.m3u8');
      expect(sc2.referer).toBe('https://s1.amass2.top/');
      expect(sc2.origin).toBe('https://s1.amass2.top');

      // KKPhim / PhimApi / VLcdn
      const kk1 = hlsRoute.getRefererHeaders('https://s1.phim1280.tv/2024/stream.m3u8');
      expect(kk1.referer).toBe('https://player.phimapi.com/');
      expect(kk1.origin).toBe('https://player.phimapi.com');

      const kk2 = hlsRoute.getRefererHeaders('https://sv.vlcdn.net/hls/video.m3u8');
      expect(kk2.referer).toBe('https://player.phimapi.com/');
      expect(kk2.origin).toBe('https://player.phimapi.com');

      // VSMOV
      const vs1 = hlsRoute.getRefererHeaders('https://streamvsmov.xyz/stream/123/master.m3u8');
      expect(vs1.referer).toBe('https://vsmov.com/');
      expect(vs1.origin).toBe('https://vsmov.com');

      // Custom ref override
      const custom1 = hlsRoute.getRefererHeaders('https://unknown-cdn.net/video.m3u8', 'https://custom-referer.vn/watch');
      expect(custom1.referer).toBe('https://custom-referer.vn/watch');
      expect(custom1.origin).toBe('https://custom-referer.vn');

      // Protocol-less ref parameter
      const custom2 = hlsRoute.getRefererHeaders('https://unknown-cdn.net/video.m3u8', 'sub.domain.vn');
      expect(custom2.referer).toBe('https://sub.domain.vn');
      expect(custom2.origin).toBe('https://sub.domain.vn');
    });

    it('2.2 Range requests on /hls/segment.ts accurately slice chunks at arbitrary byte boundaries', async () => {
      const b64Url = Buffer.from(`${mockUpstreamBaseUrl}/stream/1mb.ts`).toString('base64url');

      // Test Case A: Standard first 1KB chunk (bytes=0-1023)
      const resA = await axios.get(`${appBaseUrl}/hls/segment.ts?url=${b64Url}`, {
        headers: { Range: 'bytes=0-1023' },
        responseType: 'arraybuffer',
      });
      expect(resA.status).toBe(206);
      expect(resA.headers['content-range']).toBe(`bytes 0-1023/${TS_1MB_SIZE}`);
      expect(resA.headers['content-length']).toBe('1024');
      const bufA = Buffer.from(resA.data);
      expect(bufA.length).toBe(1024);
      expect(bufA.equals(ts1MbBuffer.subarray(0, 1024))).toBe(true);

      // Test Case B: Mid-stream 100-byte slice (bytes=500000-500099)
      const resB = await axios.get(`${appBaseUrl}/hls/segment.ts?url=${b64Url}`, {
        headers: { Range: 'bytes=500000-500099' },
        responseType: 'arraybuffer',
      });
      expect(resB.status).toBe(206);
      expect(resB.headers['content-range']).toBe(`bytes 500000-500099/${TS_1MB_SIZE}`);
      expect(resB.headers['content-length']).toBe('100');
      const bufB = Buffer.from(resB.data);
      expect(bufB.length).toBe(100);
      expect(bufB.equals(ts1MbBuffer.subarray(500000, 500100))).toBe(true);

      // Test Case C: Single first byte (bytes=0-0)
      const resC = await axios.get(`${appBaseUrl}/hls/segment.ts?url=${b64Url}`, {
        headers: { Range: 'bytes=0-0' },
        responseType: 'arraybuffer',
      });
      expect(resC.status).toBe(206);
      expect(resC.headers['content-range']).toBe(`bytes 0-0/${TS_1MB_SIZE}`);
      expect(resC.headers['content-length']).toBe('1');
      expect(Buffer.from(resC.data)[0]).toBe(ts1MbBuffer[0]);

      // Test Case D: Single last byte (bytes=999999-999999)
      const resD = await axios.get(`${appBaseUrl}/hls/segment.ts?url=${b64Url}`, {
        headers: { Range: `bytes=${TS_1MB_SIZE - 1}-${TS_1MB_SIZE - 1}` },
        responseType: 'arraybuffer',
      });
      expect(resD.status).toBe(206);
      expect(resD.headers['content-range']).toBe(`bytes ${TS_1MB_SIZE - 1}-${TS_1MB_SIZE - 1}/${TS_1MB_SIZE}`);
      expect(resD.headers['content-length']).toBe('1');
      expect(Buffer.from(resD.data)[0]).toBe(ts1MbBuffer[TS_1MB_SIZE - 1]);

      // Test Case E: Open-ended range (bytes=999900-)
      const resE = await axios.get(`${appBaseUrl}/hls/segment.ts?url=${b64Url}`, {
        headers: { Range: 'bytes=999900-' },
        responseType: 'arraybuffer',
      });
      expect(resE.status).toBe(206);
      expect(resE.headers['content-range']).toBe(`bytes 999900-${TS_1MB_SIZE - 1}/${TS_1MB_SIZE}`);
      expect(resE.headers['content-length']).toBe('100');
      expect(Buffer.from(resE.data).equals(ts1MbBuffer.subarray(999900, TS_1MB_SIZE))).toBe(true);

      // Test Case F: End index exceeding buffer size (bytes=999950-5000000)
      const resF = await axios.get(`${appBaseUrl}/hls/segment.ts?url=${b64Url}`, {
        headers: { Range: 'bytes=999950-5000000' },
        responseType: 'arraybuffer',
      });
      expect(resF.status).toBe(206);
      expect(resF.headers['content-range']).toBe(`bytes 999950-${TS_1MB_SIZE - 1}/${TS_1MB_SIZE}`);
      expect(resF.headers['content-length']).toBe('50');
      expect(Buffer.from(resF.data).equals(ts1MbBuffer.subarray(999950, TS_1MB_SIZE))).toBe(true);
    });

    it('2.3 Range requests pass through upstream native 206 responses cleanly', async () => {
      const b64Url = Buffer.from(`${mockUpstreamBaseUrl}/stream/1mb.ts`).toString('base64url');

      const res = await axios.get(`${appBaseUrl}/hls/segment.ts?url=${b64Url}`, {
        headers: {
          Range: 'bytes=0-499',
          'x-mock-upstream-206': '1',
        },
        responseType: 'arraybuffer',
      });

      expect(res.status).toBe(206);
      expect(res.headers['content-range']).toBe(`bytes 0-499/${TS_1MB_SIZE}`);
      expect(res.headers['content-length']).toBe('500');
      expect(Buffer.from(res.data).length).toBe(500);
    });

    it('2.4 Range requests handle out-of-bounds, inverted, and malformed ranges gracefully without crashing', async () => {
      const b64Url = Buffer.from(`${mockUpstreamBaseUrl}/stream/1mb.ts`).toString('base64url');

      // Inverted range (start > end): should safely fallback to 200 without process crash
      const resInverted = await axios.get(`${appBaseUrl}/hls/segment.ts?url=${b64Url}`, {
        headers: { Range: 'bytes=500-200' },
        responseType: 'arraybuffer',
      });
      expect(resInverted.status).toBe(200);
      expect(Buffer.from(resInverted.data).length).toBe(TS_1MB_SIZE);

      // Malformed range string: fallback to 200 full content
      const resMalformed = await axios.get(`${appBaseUrl}/hls/segment.ts?url=${b64Url}`, {
        headers: { Range: 'bytes=invalid-range' },
        responseType: 'arraybuffer',
      });
      expect(resMalformed.status).toBe(200);
      expect(Buffer.from(resMalformed.data).length).toBe(TS_1MB_SIZE);
    });

    it('2.5 Subtitle proxy converts data: URIs, WEBVTT and SRT comma timestamps reliably', async () => {
      // Test SRT timestamp conversion via data: URI
      const srtContent = '1\n00:00:01,000 --> 00:00:04,500\nXin chào thế giới';
      const dataUri = `data:text/plain;base64,${Buffer.from(srtContent).toString('base64')}`;

      const res = await axios.get(`${appBaseUrl}/hls/sub.vtt?url=${encodeURIComponent(dataUri)}`);
      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toContain('text/vtt');
      expect(res.data).toContain('WEBVTT');
      expect(res.data).toContain('00:00:01.000 --> 00:00:04.500');
      expect(res.data).toContain('Xin chào thế giới');
    });

    it('2.6 Missing / invalid URL parameters on HLS endpoints return 400 Bad Request', async () => {
      await expect(axios.get(`${appBaseUrl}/hls/extract`)).rejects.toThrow(/400/);
      await expect(axios.get(`${appBaseUrl}/hls/manifest.m3u8`)).rejects.toThrow(/400/);
      await expect(axios.get(`${appBaseUrl}/hls/segment.ts`)).rejects.toThrow(/400/);
      await expect(axios.get(`${appBaseUrl}/hls/key`)).rejects.toThrow(/400/);
      await expect(axios.get(`${appBaseUrl}/hls/sub.vtt`)).rejects.toThrow(/400/);
    });

    it('2.7 CORS headers and OPTIONS preflight requests respond with 204 No Content and allow all origins', async () => {
      const optionsRes = await axios({
        method: 'OPTIONS',
        url: `${appBaseUrl}/hls/manifest.m3u8`,
      });
      expect(optionsRes.status).toBe(204);
      expect(optionsRes.headers['access-control-allow-origin']).toBe('*');
      expect(optionsRes.headers['access-control-allow-methods']).toContain('GET');
    });

    it('2.8 Range requests on 0-byte (zero length) segments resolve safely without out-of-bound errors', async () => {
      const b64Url = Buffer.from(`${mockUpstreamBaseUrl}/stream/zero-length.ts`).toString('base64url');
      const res = await axios.get(`${appBaseUrl}/hls/segment.ts?url=${b64Url}`, {
        headers: { Range: 'bytes=0-0' },
        responseType: 'arraybuffer',
      });
      expect(res.status).toBe(200);
      expect(Buffer.from(res.data).length).toBe(0);
    });
  });

  // =========================================================================
  // CHALLENGE 3: Supabase Cache Flush Resiliency
  // =========================================================================
  describe('Challenge 3: Supabase Cache Flush Resiliency Stress Tests', () => {
    it('3.1 flushStreamCache guarantees L1 cache clearance even when Supabase throws ECONNREFUSED', async () => {
      // Seed L1 memory cache
      cacheModule.l1Cache.set('stream:test_1', { streams: ['test1'] });
      cacheModule.streamCache.set('stream:test_2', { streams: ['test2'] });
      expect(cacheModule.l1Cache.has('stream:test_1')).toBe(true);
      expect(cacheModule.streamCache.getSync('stream:test_2')).toBeDefined();

      const client = supabaseModule.getClient();
      if (client) {
        // Mock connection refused
        vi.spyOn(client, 'from').mockImplementation(() => {
          throw new Error('connect ECONNREFUSED 127.0.0.1:5432');
        });
      }

      const result = await supabaseModule.flushStreamCache();
      expect(result).toBeDefined();
      expect(result.inMemoryCleared).toBe(true);
      expect(cacheModule.l1Cache.has('stream:test_1')).toBe(false);
      expect(cacheModule.streamCache.getSync('stream:test_2')).toBeUndefined();
    });

    it('3.2 flushAllCache handles unapplied schema errors (PGRST205 / table missing) gracefully', async () => {
      // Seed tiered caches
      cacheModule.l1Cache.set('test', '1');
      cacheModule.catalogCache.set('test', '2');
      cacheModule.hlsManifestCache.set('test', '3');

      const client = supabaseModule.getClient();
      if (client) {
        vi.spyOn(client, 'from').mockImplementation((table) => {
          if (table === 'stream_cache') {
            return {
              delete: () => ({
                not: async () => ({
                  data: null,
                  count: 0,
                  error: { message: "Could not find the table 'public.stream_cache' in the schema cache", code: 'PGRST205' },
                }),
              }),
            };
          }
          if (table === 'cache_entries') {
            return {
              delete: () => ({
                not: async () => ({
                  data: [{ key: 'entry1' }, { key: 'entry2' }],
                  count: 2,
                  error: null,
                }),
              }),
            };
          }
          return { delete: () => ({ not: async () => ({ data: [], count: 0 }) }) };
        });
      }

      const res = await supabaseModule.flushAllCache();
      expect(res.success).toBe(true);
      expect(res.inMemoryCleared).toBe(true);
      if (client) {
        expect(res.tables.stream_cache).toBe(0);
        expect(res.tables.cache_entries).toBe(2);
        expect(res.count).toBe(2);
      }
      expect(cacheModule.l1Cache.has('test')).toBe(false);
      expect(cacheModule.catalogCache.getSync('test')).toBeUndefined();
      expect(cacheModule.hlsManifestCache.getSync('test')).toBeUndefined();
    });

    it('3.3 pruneExpiredCache catches unexpected rejection without crashing', async () => {
      const client = supabaseModule.getClient();
      if (client) {
        vi.spyOn(client, 'from').mockImplementation(() => {
          return {
            delete: () => ({
              lt: async () => {
                throw new Error('Database server crashed unexpectedly');
              },
            }),
          };
        });
      }

      const res = await supabaseModule.pruneExpiredCache();
      expect(res).toBeDefined();
      // Should return structured response rather than unhandled rejection
      expect(typeof res.success).toBe('boolean');
    });

    it('3.4 scripts/flush_cache.js CLI exits with code 0 under broken DB env & all CLI flag variations', () => {
      const scriptPath = path.resolve(__dirname, '../scripts/flush_cache.js');

      // Test Default
      const outDefault = execSync(`node "${scriptPath}"`, {
        env: { ...process.env, SUPABASE_URL: 'http://127.0.0.1:59999', SUPABASE_KEY: 'invalid_key' },
        encoding: 'utf8',
      });
      expect(outDefault).toContain('Exit code 0');

      // Test --all
      const outAll = execSync(`node "${scriptPath}" --all`, {
        env: { ...process.env, SUPABASE_URL: 'http://127.0.0.1:59999', SUPABASE_KEY: 'invalid_key' },
        encoding: 'utf8',
      });
      expect(outAll).toContain('Flush All Cache Completed');

      // Test --prune
      const outPrune = execSync(`node "${scriptPath}" --prune`, {
        env: { ...process.env, SUPABASE_URL: 'http://127.0.0.1:59999', SUPABASE_KEY: 'invalid_key' },
        encoding: 'utf8',
      });
      expect(outPrune).toContain('Cache Prune Completed');

      // Test --help
      const outHelp = execSync(`node "${scriptPath}" --help`, {
        encoding: 'utf8',
      });
      expect(outHelp).toContain('Usage: node scripts/flush_cache.js');
    });

    it('3.5 High concurrency: 20 concurrent flushStreamCache calls resolve cleanly without race conditions', async () => {
      const promises = [];
      for (let i = 0; i < 20; i++) {
        cacheModule.l1Cache.set(`key_${i}`, `val_${i}`);
        promises.push(supabaseModule.flushStreamCache());
      }
      const results = await Promise.all(promises);
      expect(results.length).toBe(20);
      for (const r of results) {
        expect(r.success).toBe(true);
      }
      expect(cacheModule.l1Cache.size).toBe(0);
    });

    it('3.6 Key-value and stream cache helpers handle network partition errors gracefully', async () => {
      const client = supabaseModule.getClient();
      if (client) {
        vi.spyOn(client, 'from').mockImplementation(() => ({
          select: () => ({
            eq: () => ({
              gt: () => ({
                maybeSingle: async () => ({ data: null, error: new Error('PostgREST connection lost') }),
              }),
              maybeSingle: async () => ({ data: null, error: new Error('PostgREST connection lost') }),
            }),
          }),
          upsert: async () => ({ data: null, error: new Error('PostgREST connection lost') }),
          delete: () => ({
            eq: async () => ({ error: new Error('PostgREST connection lost') }),
          }),
        }));
      }

      // getCachedValue should return null on error
      expect(await supabaseModule.getCachedValue('catalog', 'movie:123')).toBeNull();
      // setCachedValue should return false on error
      expect(await supabaseModule.setCachedValue('catalog', 'movie:123', { test: true })).toBe(false);
      // deleteCachedValue should return false on error
      expect(await supabaseModule.deleteCachedValue('catalog', 'movie:123')).toBe(false);
      // getL2StreamCache should return null on error
      expect(await supabaseModule.getL2StreamCache('tt1234567:1:1')).toBeNull();
    });
  });
});
