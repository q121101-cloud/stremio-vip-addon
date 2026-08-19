'use strict';

const axios = require('axios');
const app = require('../src/server');

let server = null;
let baseUrl = '';

describe('Challenger 2: Adversarial Stream Resolution & IMDb Stress Test Suite', () => {
  beforeAll(async () => {
    server = await new Promise((resolve) => {
      const s = app.listen(0, '127.0.0.1', () => resolve(s));
    });
    const port = server.address().port;
    baseUrl = `http://127.0.0.1:${port}`;
  });

  afterAll(async () => {
    if (server) {
      await new Promise((resolve) => server.close(resolve));
    }
  });

  // =========================================================================
  // 1. KOREAN SERIES STREAM RESOLUTION (Khi Nàng Say Giấc - S1E1, S1E2, etc.)
  // =========================================================================
  describe('1. Korean Series Stream Resolution (tt7458054: While You Were Sleeping / Khi Nàng Say Giấc)', () => {
    it('1.1 Resolve S1E1: GET /stream/series/tt7458054:1:1.json -> returns valid HLS streams', async () => {
      const res = await axios.get(`${baseUrl}/stream/series/tt7458054:1:1.json`, { timeout: 25000 });
      expect(res.status).toBe(200);
      expect(Array.isArray(res.data?.streams)).toBe(true);
      expect(res.data.streams.length).toBeGreaterThanOrEqual(1);

      for (const s of res.data.streams) {
        expect(s.url || s.externalUrl).toBeDefined();
        if (s.url) {
          expect(s.url).toContain('/hls/manifest.m3u8');
          expect(s.externalUrl).toBeUndefined();
        }
        if (s.externalUrl) {
          expect(s.url).toBeUndefined();
        }
      }
    });

    it('1.2 Resolve S1E2: GET /stream/series/tt7458054:1:2.json -> returns valid HLS streams for Episode 2', async () => {
      const res = await axios.get(`${baseUrl}/stream/series/tt7458054:1:2.json`, { timeout: 25000 });
      expect(res.status).toBe(200);
      expect(Array.isArray(res.data?.streams)).toBe(true);
      expect(res.data.streams.length).toBeGreaterThanOrEqual(1);

      for (const s of res.data.streams) {
        if (s.url) {
          expect(s.url).toContain('/hls/manifest.m3u8');
          expect(s.externalUrl).toBeUndefined();
        }
        if (s.externalUrl) {
          expect(s.url).toBeUndefined();
        }
      }
    });

    it('1.3 Check stream title metadata mentions episode 2 or proper server tags', async () => {
      const res = await axios.get(`${baseUrl}/stream/series/tt7458054:1:2.json`, { timeout: 25000 });
      expect(res.status).toBe(200);
      const streams = res.data.streams;
      expect(streams.length).toBeGreaterThan(0);

      // Check that at least one stream title contains episode info or server name
      const hasProperTitle = streams.some((s) => s.title && (s.title.includes('Tập 2') || s.title.includes('2') || s.title.includes('KKPhim') || s.title.includes('NguonC')));
      expect(hasProperTitle).toBe(true);
    });
  });

  // =========================================================================
  // 2. OTHER SERIES & MOVIES IMDB QUERIES
  // =========================================================================
  describe('2. Multi-Title IMDb Resolution (Movies & Other Series)', () => {
    it('2.1 Movie: Inception (tt1375666)', async () => {
      const res = await axios.get(`${baseUrl}/stream/movie/tt1375666.json`, { timeout: 25000 });
      expect(res.status).toBe(200);
      expect(Array.isArray(res.data?.streams)).toBe(true);
      expect(res.data.streams.length).toBeGreaterThanOrEqual(1);

      const s = res.data.streams[0];
      expect(s.url).toContain('/hls/manifest.m3u8');
      expect(s.externalUrl).toBeUndefined();
    });

    it('2.2 Movie: Harry Potter (tt0373889)', async () => {
      const res = await axios.get(`${baseUrl}/stream/movie/tt0373889.json`, { timeout: 25000 });
      expect(res.status).toBe(200);
      expect(Array.isArray(res.data?.streams)).toBe(true);
      expect(res.data.streams.length).toBeGreaterThanOrEqual(1);
    });

    it('2.3 Series: A Shop for Killers S1E1 (tt26450613:1:1)', async () => {
      const res = await axios.get(`${baseUrl}/stream/series/tt26450613:1:1.json`, { timeout: 25000 });
      expect(res.status).toBe(200);
      expect(Array.isArray(res.data?.streams)).toBe(true);
      // Even if not indexed in all providers, response must be HTTP 200 with array
      if (res.data.streams.length > 0) {
        expect(res.data.streams[0].url).toContain('/hls/manifest.m3u8');
      }
    });

    it('2.4 Series: Squid Game S1E1 (tt10919420:1:1)', async () => {
      const res = await axios.get(`${baseUrl}/stream/series/tt10919420:1:1.json`, { timeout: 25000 });
      expect(res.status).toBe(200);
      expect(Array.isArray(res.data?.streams)).toBe(true);
      if (res.data.streams.length > 0) {
        expect(res.data.streams[0].url).toContain('/hls/manifest.m3u8');
      }
    });
  });

  // =========================================================================
  // 3. STREAM FORMAT & PROTOCOL COMPLIANCE
  // =========================================================================
  describe('3. Stream Format & Protocol Invariants', () => {
    it('3.1 All HLS proxy streams must have url containing /hls/manifest.m3u8 and NO externalUrl', async () => {
      const res = await axios.get(`${baseUrl}/stream/series/tt7458054:1:1.json`, { timeout: 25000 });
      expect(res.status).toBe(200);
      for (const stream of res.data.streams) {
        if (stream.url) {
          expect(stream.url).toMatch(/\/hls\/manifest\.m3u8\?url=[A-Za-z0-9_-]+/);
          expect(stream.externalUrl).toBeUndefined();
        }
        if (stream.externalUrl) {
          expect(stream.url).toBeUndefined();
        }
      }
    });

    it('3.2 Stream response headers must include proper CORS and cache headers', async () => {
      const res = await axios.get(`${baseUrl}/stream/series/tt7458054:1:1.json`, { timeout: 25000 });
      expect(res.headers['access-control-allow-origin']).toBe('*');
      expect(res.headers['content-type']).toContain('application/json');
    });

    it('3.3 Second request hits cache and returns instantly (<100ms)', async () => {
      const start = Date.now();
      const res = await axios.get(`${baseUrl}/stream/series/tt7458054:1:1.json`, { timeout: 5000 });
      const elapsed = Date.now() - start;
      expect(res.status).toBe(200);
      expect(res.data.streams.length).toBeGreaterThanOrEqual(1);
      expect(elapsed).toBeLessThan(100);
    });
  });

  // =========================================================================
  // 4. ADVERSARIAL EDGE-CASES, INVALID QUERIES & INJECTION RESILIENCE
  // =========================================================================
  describe('4. Adversarial Edge Cases & Invalid Queries', () => {
    it('4.1 Non-existent IMDb ID: tt0000000 -> HTTP 200, { streams: [] } without crash', async () => {
      const res = await axios.get(`${baseUrl}/stream/movie/tt0000000.json`, { timeout: 15000 });
      expect(res.status).toBe(200);
      expect(res.data).toEqual({ streams: [] });
    });

    it('4.2 Non-existent Series episode: tt0000000:999:999 -> HTTP 200, { streams: [] }', async () => {
      const res = await axios.get(`${baseUrl}/stream/series/tt0000000:999:999.json`, { timeout: 15000 });
      expect(res.status).toBe(200);
      expect(res.data).toEqual({ streams: [] });
    });

    it('4.3 Malformed colon string: tt7458054: (trailing colon) -> HTTP 200 without crash', async () => {
      const res = await axios.get(`${baseUrl}/stream/series/tt7458054:.json`, { timeout: 20000 });
      expect(res.status).toBe(200);
      expect(Array.isArray(res.data?.streams)).toBe(true);
    });

    it('4.4 Malformed colon string: tt7458054:abc:xyz (alphabetic season/episode) -> HTTP 200 without crash', async () => {
      const res = await axios.get(`${baseUrl}/stream/series/tt7458054:abc:xyz.json`, { timeout: 20000 });
      expect(res.status).toBe(200);
      expect(Array.isArray(res.data?.streams)).toBe(true);
    });

    it('4.5 Negative / Zero episode numbers: tt7458054:1:-1 and tt7458054:0:0 -> HTTP 200 without crash', async () => {
      const res1 = await axios.get(`${baseUrl}/stream/series/tt7458054:1:-1.json`, { timeout: 20000 });
      expect(res1.status).toBe(200);
      expect(Array.isArray(res1.data?.streams)).toBe(true);

      const res2 = await axios.get(`${baseUrl}/stream/series/tt7458054:0:0.json`, { timeout: 20000 });
      expect(res2.status).toBe(200);
      expect(Array.isArray(res2.data?.streams)).toBe(true);
    });

    it('4.6 Out-of-bounds episode: tt7458054:1:99999 -> HTTP 200, empty or graceful streams', async () => {
      const res = await axios.get(`${baseUrl}/stream/series/tt7458054:1:99999.json`, { timeout: 20000 });
      expect(res.status).toBe(200);
      expect(Array.isArray(res.data?.streams)).toBe(true);
    });

    it('4.7 Malformed empty colons: ::: -> HTTP 200, { streams: [] } without crash', async () => {
      const res = await axios.get(`${baseUrl}/stream/series/:::.json`, { timeout: 10000 });
      expect(res.status).toBe(200);
      expect(Array.isArray(res.data?.streams)).toBe(true);
    });

    it('4.8 SQL injection attempt in IMDb parameter -> handled safely, HTTP 200', async () => {
      const maliciousId = encodeURIComponent("tt7458054' OR '1'='1; DROP TABLE media_mappings; --");
      const res = await axios.get(`${baseUrl}/stream/movie/${maliciousId}.json`, { timeout: 10000 });
      expect(res.status).toBe(200);
      expect(Array.isArray(res.data?.streams)).toBe(true);
    });

    it('4.9 XSS / HTML injection attempt in stream parameter -> handled safely', async () => {
      const xssId = encodeURIComponent('tt<script>alert("xss")</script>:1:1');
      const res = await axios.get(`${baseUrl}/stream/series/${xssId}.json`, { timeout: 10000 });
      expect(res.status).toBe(200);
      expect(Array.isArray(res.data?.streams)).toBe(true);
    });
  });

  // =========================================================================
  // 5. BITMASK & PROVIDER ISOLATION VIA STREAM ENDPOINT
  // =========================================================================
  describe('5. Bitmask Stream Filtering', () => {
    it('5.1 Bitmask 2 (KKPhim only) -> only KKPhim streams returned', async () => {
      const res = await axios.get(`${baseUrl}/c/2/stream/series/tt7458054:1:1.json`, { timeout: 20000 });
      expect(res.status).toBe(200);
      expect(Array.isArray(res.data?.streams)).toBe(true);
      for (const s of res.data.streams) {
        const titleAndName = `${s.name || ''} ${s.title || ''}`;
        expect(titleAndName).not.toContain('NguonC');
        expect(titleAndName).not.toContain('NGUONC');
        expect(titleAndName).not.toContain('VSMOV');
      }
    });

    it('5.2 Bitmask 1 (NguonC only) -> only NguonC streams returned', async () => {
      const res = await axios.get(`${baseUrl}/c/1/stream/series/tt7458054:1:1.json`, { timeout: 20000 });
      expect(res.status).toBe(200);
      expect(Array.isArray(res.data?.streams)).toBe(true);
      for (const s of res.data.streams) {
        const titleAndName = `${s.name || ''} ${s.title || ''}`;
        expect(titleAndName).not.toContain('KKPhim');
        expect(titleAndName).not.toContain('KKPHIM');
        expect(titleAndName).not.toContain('VSMOV');
      }
    });

    it('5.3 Bitmask 4 (VSMOV only) -> only VSMOV streams returned', async () => {
      const res = await axios.get(`${baseUrl}/c/4/stream/movie/tt1375666.json`, { timeout: 20000 });
      expect(res.status).toBe(200);
      expect(Array.isArray(res.data?.streams)).toBe(true);
      for (const s of res.data.streams) {
        const titleAndName = `${s.name || ''} ${s.title || ''}`;
        expect(titleAndName).not.toContain('KKPhim');
        expect(titleAndName).not.toContain('KKPHIM');
        expect(titleAndName).not.toContain('NguonC');
        expect(titleAndName).not.toContain('NGUONC');
      }
    });

    it('5.4 Bitmask 7 (All 3) -> aggregated streams from all available providers', async () => {
      const res = await axios.get(`${baseUrl}/c/7/stream/series/tt7458054:1:1.json`, { timeout: 20000 });
      expect(res.status).toBe(200);
      expect(Array.isArray(res.data?.streams)).toBe(true);
      expect(res.data.streams.length).toBeGreaterThanOrEqual(1);
    });

    it('5.5 Cross-profile cache isolation: querying all providers does not pollute provider-isolated cache', async () => {
      // 1. Query full suite
      const resAll = await axios.get(`${baseUrl}/stream/movie/tt1375666.json`, { timeout: 20000 });
      expect(resAll.status).toBe(200);

      // 2. Query KKPhim only
      const resKK = await axios.get(`${baseUrl}/c/2/stream/movie/tt1375666.json`, { timeout: 20000 });
      expect(resKK.status).toBe(200);
      for (const s of resKK.data.streams) {
        const text = `${s.name || ''} ${s.title || ''}`;
        expect(text).not.toContain('NguonC');
        expect(text).not.toContain('NGUONC');
        expect(text).not.toContain('VSMOV');
      }

      // 3. Query NguonC only
      const resNguonC = await axios.get(`${baseUrl}/c/1/stream/movie/tt1375666.json`, { timeout: 20000 });
      expect(resNguonC.status).toBe(200);
      for (const s of resNguonC.data.streams) {
        const text = `${s.name || ''} ${s.title || ''}`;
        expect(text).not.toContain('KKPhim');
        expect(text).not.toContain('KKPHIM');
        expect(text).not.toContain('VSMOV');
      }
    });

    it('5.6 Invalid bitmask /c/invalid -> gracefully defaults to all providers', async () => {
      const res = await axios.get(`${baseUrl}/c/invalid/stream/series/tt7458054:1:1.json`, { timeout: 20000 });
      expect(res.status).toBe(200);
      expect(Array.isArray(res.data?.streams)).toBe(true);
    });
  });

  // =========================================================================
  // 6. CONCURRENT HIGH LOAD STRESS
  // =========================================================================
  describe('6. Concurrency & High Load Resilience', () => {
    it('6.1 10 concurrent requests to diverse stream endpoints resolve with 100% 200 OK', async () => {
      const endpoints = [
        '/stream/series/tt7458054:1:1.json',
        '/stream/series/tt7458054:1:2.json',
        '/stream/movie/tt1375666.json',
        '/stream/movie/tt0373889.json',
        '/c/2/stream/series/tt7458054:1:1.json',
        '/c/1/stream/series/tt7458054:1:1.json',
        '/c/4/stream/series/tt7458054:1:1.json',
        '/stream/series/tt0000000:1:1.json',
        '/stream/movie/tt0000000.json',
        '/c/7/stream/movie/tt1375666.json',
        '/stream/series/tt7458054:1:1.json',
      ];

      const results = await Promise.allSettled(
        endpoints.map((ep) => axios.get(`${baseUrl}${ep}`, { timeout: 25000 }))
      );

      for (let i = 0; i < results.length; i++) {
        const r = results[i];
        expect(r.status).toBe('fulfilled');
        if (r.status === 'fulfilled') {
          expect(r.value.status).toBe(200);
          expect(Array.isArray(r.value.data?.streams)).toBe(true);
        }
      }
    });
  });
});
