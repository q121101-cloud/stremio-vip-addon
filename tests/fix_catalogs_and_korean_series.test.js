'use strict';

const axios = require('axios');
const app = require('../src/server');

let server = null;
let baseUrl = '';

describe('Fix Catalogs and Korean Series Verification Suite (R1, R2, R3)', () => {
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

  // Test 1: Manifest contains all 5 catalog IDs and proper idPrefixes (Requirement R1)
  it('Test 1: GET /manifest.json -> response body contains all 5 catalog IDs and idPrefixes', async () => {
    const res = await axios.get(`${baseUrl}/manifest.json`, { timeout: 5000 });
    expect(res.status).toBe(200);
    expect(Array.isArray(res.data?.catalogs)).toBe(true);
    expect(res.data.catalogs.length).toBe(5);

    // Verify idPrefixes
    expect(res.data.idPrefixes).toBeDefined();
    expect(res.data.idPrefixes).toEqual(expect.arrayContaining(['tt', 'kkphim_', 'nguonc_', 'vsmov_']));

    // Verify resources
    expect(res.data.resources).toEqual(expect.arrayContaining(['catalog', 'meta', 'stream']));

    const catalogIds = res.data.catalogs.map((c) => c.id);
    expect(catalogIds).toEqual(
      expect.arrayContaining([
        'kkphim_phimmoi',
        'kkphim_phimbo',
        'nguonc_phimmoi',
        'nguonc_phimbo',
        'vsmov_4k',
      ])
    );

    // Verify types
    const kkPhimMoi = res.data.catalogs.find((c) => c.id === 'kkphim_phimmoi');
    expect(kkPhimMoi?.type).toBe('movie');

    const kkPhimBo = res.data.catalogs.find((c) => c.id === 'kkphim_phimbo');
    expect(kkPhimBo?.type).toBe('series');

    const nguonCPhimMoi = res.data.catalogs.find((c) => c.id === 'nguonc_phimmoi');
    expect(nguonCPhimMoi?.type).toBe('movie');

    const nguonCPhimBo = res.data.catalogs.find((c) => c.id === 'nguonc_phimbo');
    expect(nguonCPhimBo?.type).toBe('series');

    const vsmov4K = res.data.catalogs.find((c) => c.id === 'vsmov_4k');
    expect(vsmov4K?.type).toBe('movie');
  });

  // Test 2: KKPhim Series Catalog returns valid metas (Requirement R2)
  it('Test 2: GET /catalog/series/kkphim_phimbo.json -> HTTP 200, metas is a non-empty array with name and poster', async () => {
    const res = await axios.get(`${baseUrl}/catalog/series/kkphim_phimbo.json`, { timeout: 10000 });
    expect(res.status).toBe(200);
    expect(Array.isArray(res.data?.metas)).toBe(true);
    expect(res.data.metas.length).toBeGreaterThan(0);

    const first = res.data.metas[0];
    expect(first.id).toBeDefined();
    expect(first.name).toBeDefined();
    expect(typeof first.name).toBe('string');
    expect(first.name.length).toBeGreaterThan(0);
    expect(first.type).toBe('series');
    expect(first.poster).toBeDefined();
    expect(typeof first.poster).toBe('string');
    expect(first.poster.startsWith('http')).toBe(true);
  });

  // Additional Catalog checks (NguonC and VSMOV 4K)
  it('Additional: GET /catalog/movie/vsmov_4k.json -> HTTP 200, metas is a non-empty array', async () => {
    const res = await axios.get(`${baseUrl}/catalog/movie/vsmov_4k.json`, { timeout: 10000 });
    expect(res.status).toBe(200);
    expect(Array.isArray(res.data?.metas)).toBe(true);
    expect(res.data.metas.length).toBeGreaterThan(0);

    const first = res.data.metas[0];
    expect(first.id).toBeDefined();
    expect(first.name).toBeDefined();
    expect(first.poster).toBeDefined();
  });

  it('Additional: GET /catalog/movie/nguonc_phimmoi.json -> HTTP 200, metas is a non-empty array', async () => {
    const res = await axios.get(`${baseUrl}/catalog/movie/nguonc_phimmoi.json`, { timeout: 10000 });
    expect(res.status).toBe(200);
    expect(Array.isArray(res.data?.metas)).toBe(true);
    expect(res.data.metas.length).toBeGreaterThan(0);
  });

  it('Additional: GET /catalog/series/nguonc_phimbo.json -> HTTP 200, metas items have type series', async () => {
    const res = await axios.get(`${baseUrl}/catalog/series/nguonc_phimbo.json`, { timeout: 10000 });
    expect(res.status).toBe(200);
    expect(Array.isArray(res.data?.metas)).toBe(true);
    expect(res.data.metas.length).toBeGreaterThan(0);
    expect(res.data.metas[0].type).toBe('series');
  });

  // Test 3: Korean series tt7458054:1:1 returns streams from KKPhim or NguonC (Requirement R3)
  it('Test 3: GET /stream/series/tt7458054:1:1.json -> HTTP 200, streams array has >= 1 item from KKPhim or NguonC', async () => {
    const res = await axios.get(`${baseUrl}/stream/series/tt7458054:1:1.json`, { timeout: 20000 });
    expect(res.status).toBe(200);
    expect(Array.isArray(res.data?.streams)).toBe(true);
    expect(res.data.streams.length).toBeGreaterThanOrEqual(1);

    const stream = res.data.streams[0];
    expect(stream.url).toBeDefined();
    expect(stream.url).toContain('/hls/manifest.m3u8');
    expect(stream.externalUrl).toBeUndefined();

    // Verify stream source attribution
    const hasKKPhimOrNguonC = res.data.streams.some(
      (s) =>
        (s.name && (s.name.includes('KKPhim') || s.name.includes('KKPHIM') || s.name.includes('NguonC') || s.name.includes('NGUONC'))) ||
        (s.title && (s.title.includes('KKPhim') || s.title.includes('KKPHIM') || s.title.includes('NguonC') || s.title.includes('NGUONC')))
    );
    expect(hasKKPhimOrNguonC).toBe(true);
  });

  // Test 4: Provider catalog ID resolution (kkphim_cuu-mon)
  it('Test 4: GET /stream/movie/kkphim_cuu-mon.json -> HTTP 200, streams array returned', async () => {
    const res = await axios.get(`${baseUrl}/stream/movie/kkphim_cuu-mon.json`, { timeout: 15000 });
    expect(res.status).toBe(200);
    expect(Array.isArray(res.data?.streams)).toBe(true);
    expect(res.data.streams.length).toBeGreaterThan(0);
    expect(res.data.streams[0].url).toContain('/hls/manifest.m3u8');
  });

  // Test 5: Provider catalog ID resolution (nguonc_cuu-mon)
  it('Test 5: GET /stream/movie/nguonc_cuu-mon.json -> HTTP 200, streams array returned', async () => {
    const res = await axios.get(`${baseUrl}/stream/movie/nguonc_cuu-mon.json`, { timeout: 15000 });
    expect(res.status).toBe(200);
    expect(Array.isArray(res.data?.streams)).toBe(true);
    expect(res.data.streams.length).toBeGreaterThan(0);
    expect(res.data.streams[0].url).toContain('/hls/manifest.m3u8');
  });

  // Bitmask Manifest tests
  it('Bitmask: GET /c/2/manifest.json -> returns 2 KKPhim catalogs', async () => {
    const res = await axios.get(`${baseUrl}/c/2/manifest.json`, { timeout: 5000 });
    expect(res.status).toBe(200);
    expect(Array.isArray(res.data?.catalogs)).toBe(true);
    expect(res.data.catalogs.length).toBe(2);
    expect(res.data.catalogs.map((c) => c.id)).toEqual(['kkphim_phimmoi', 'kkphim_phimbo']);
  });

  it('Bitmask: GET /c/7/manifest.json -> returns all 5 catalogs', async () => {
    const res = await axios.get(`${baseUrl}/c/7/manifest.json`, { timeout: 5000 });
    expect(res.status).toBe(200);
    expect(res.data.catalogs.length).toBe(5);
  });
});
