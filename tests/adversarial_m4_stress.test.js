'use strict';

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
const { cache, flushCache } = require('../src/db/cache');
const { parseConfig, encodeConfig, DEFAULT_CONFIG } = require('../src/manifest');
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

describe('Milestone M4 Adversarial & Concurrency Stress Test Suite', () => {

  beforeEach(() => {
    flushCache();
    vi.restoreAllMocks();
    CIRCUIT_BREAKER.reset();
  });

  afterEach(() => {
    flushCache();
    vi.restoreAllMocks();
  });

  // ==========================================
  // SECTION 1: Hostile Config String & Fuzzing
  // ==========================================
  describe('1. Hostile Config String & Fuzzing Resilience', () => {

    it('1.1 should handle SQL injection, XSS, and directory traversal tokens gracefully', () => {
      const hostileTokens = [
        "' OR '1'='1",
        '<script>alert("xss")</script>',
        '../../../../etc/passwd',
        '\\x00\\x00\\x00',
        'null',
        'undefined',
        '{"providers":["../../etc"]}',
        'eyJwcm92aWRlcnMiOiA8c2NyaXB0PmFsZXJ0KDEpPC9zY3JpcHQ+fQ=='
      ];

      for (const token of hostileTokens) {
        const parsed = parseConfig(token);
        expect(parsed).toBeDefined();
        expect(Array.isArray(parsed.providers)).toBe(true);
        expect(Array.isArray(parsed.categories)).toBe(true);
      }
    });

    it('1.2 should handle massive base64 config payloads (>100KB) without crashing or timing out', () => {
      const largeObj = {
        providers: Array(1000).fill('kkphim'),
        categories: Array(1000).fill('phim-le'),
        garbage: 'x'.repeat(100000)
      };

      const largeToken = Buffer.from(JSON.stringify(largeObj)).toString('base64url');
      const parsed = parseConfig(largeToken);
      expect(parsed).toBeDefined();
      expect(parsed.providers).toBeDefined();
    });
  });

  // ==========================================
  // SECTION 2: Concurrency & Race Condition Resilience
  // ==========================================
  describe('2. Concurrency & High-Throughput Stream Requests', () => {

    it('2.1 should handle 50 concurrent stream resolution requests with deduplication and 0 errors', async () => {
      vi.spyOn(cinemetaService, 'getMetadataForMatcher').mockResolvedValue({
        imdbId: 'tt1375666',
        type: 'movie',
        title: 'Inception',
        vietnameseTitle: 'Kẻ Đánh Cắp Giấc Mơ',
        aliases: [],
        year: 2010
      });

      vi.spyOn(vsmovProvider, 'getStreams').mockResolvedValue([
        { name: '[4K Ultra HD] VSMOV', title: 'Inception 4K', url: 'http://vsmov.com/stream.m3u8' }
      ]);
      vi.spyOn(kkphimProvider, 'getStreams').mockResolvedValue([
        { name: '[1080p FHD] KKPhim', title: 'Inception 1080p', url: 'http://kkphim.com/stream.m3u8' }
      ]);
      vi.spyOn(nguoncProvider, 'getStreams').mockResolvedValue([
        { name: '[HD 1080p] NguonC', title: 'Inception StreamC', url: 'http://nguonc.com/stream.m3u8' }
      ]);

      const requests = Array.from({ length: 50 }, () => {
        const { req, res } = createMockReqRes({
          params: { type: 'movie', id: 'tt1375666.json' }
        });
        return handleStream(req, res).then(() => res);
      });

      const responses = await Promise.all(requests);
      for (const res of responses) {
        expect(res.statusCode).toBe(200);
        expect(res.body.streams.length).toBe(3);
        expect(res.body.streams[0].name).toContain('4K Ultra HD');
      }
    });
  });

  // ==========================================
  // SECTION 3: Stream Quality Sorting Stress
  // ==========================================
  describe('3. Stream Ranking Sorting Stability & Diversity Stress', () => {

    it('3.1 should deterministically rank 100 heterogeneous stream objects', () => {
      const qualities = ['4K UHD', '1080p FHD', '720p HD', 'SD 480p'];
      const providers = ['VSMOV', 'KKPhim', 'NguonC'];
      const audios = ['Vietsub', 'Thuyết Minh', 'Lồng Tiếng'];

      const mockStreams = [];
      for (let i = 0; i < 100; i++) {
        const q = qualities[i % qualities.length];
        const p = providers[i % providers.length];
        const a = audios[i % audios.length];
        mockStreams.push({
          name: `VIP Movies 🎬\n[${q}] ${p}`,
          title: `Movie Title • Ep ${i}\n⚡ Server (${a})`,
          url: `http://stream.test/${i}.m3u8`,
          subtitles: i % 3 === 0 ? [{ id: 'vie', url: 'sub.vtt' }] : undefined
        });
      }

      const ranked = rankStreams(mockStreams, 'vietsub');
      expect(ranked.length).toBe(100);

      // Top stream should be 4K Vietsub
      expect(ranked[0].name).toContain('4K');
      expect(ranked[0].title).toContain('Vietsub');
    });
  });

  // ==========================================
  // SECTION 4: Extreme ID Parsing & Edge Cases
  // ==========================================
  describe('4. Extreme & Malformed ID Routing Stress', () => {

    it('4.1 should handle deeply nested colon compound IDs safely', async () => {
      const weirdIds = [
        'tt1234567:1:2:3:4:5.json',
        'kkphim:cuu:mon:extra:1:2.json',
        'vsmov::::1:1.json',
        'tt-invalid-id-format:999999:999999.json'
      ];

      for (const rawId of weirdIds) {
        const { req, res } = createMockReqRes({
          params: { type: 'series', id: rawId }
        });
        await handleStream(req, res);
        expect(res.statusCode).toBe(200);
        expect(res.body).toBeDefined();
        expect(Array.isArray(res.body.streams)).toBe(true);
      }
    });

    it('4.2 should handle complete upstream crash without unhandled exceptions', async () => {
      vi.spyOn(cinemetaService, 'getMetadataForMatcher').mockRejectedValue(new Error('Cinemeta Crash'));
      vi.spyOn(vsmovProvider, 'getStreams').mockRejectedValue(new Error('VSMOV Crash'));
      vi.spyOn(kkphimProvider, 'getStreams').mockRejectedValue(new Error('KKPhim Crash'));
      vi.spyOn(nguoncProvider, 'getStreams').mockRejectedValue(new Error('NguonC Crash'));

      const { req, res } = createMockReqRes({
        params: { type: 'movie', id: 'tt0000001.json' }
      });

      await handleStream(req, res);
      expect(res.statusCode).toBe(200);
      expect(res.body).toEqual({ streams: [] });
    });
  });
});
