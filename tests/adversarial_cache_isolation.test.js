'use strict';

const axios = require('axios');
const app = require('../src/server');
const { encodeConfig } = require('../src/config/compressor');

let server = null;
let baseUrl = '';

describe('Adversarial Cross-Profile Stream Cache Isolation Harness', () => {
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

  it('Test Matrix A: Full Suite -> Single Providers (KKPhim, NguonC, VSMOV) -> Dual Providers', async () => {
    const mediaId = 'tt1375666'; // Inception

    // 1. Query Full Suite
    const resFull = await axios.get(`${baseUrl}/stream/movie/${mediaId}.json`, { timeout: 25000 });
    expect(resFull.status).toBe(200);
    expect(Array.isArray(resFull.data.streams)).toBe(true);
    const fullCount = resFull.data.streams.length;
    expect(fullCount).toBeGreaterThanOrEqual(1);

    // 2. Query KKPhim only (/c/2/...)
    const startKK = Date.now();
    const resKK = await axios.get(`${baseUrl}/c/2/stream/movie/${mediaId}.json`, { timeout: 25000 });
    const elapsedKK = Date.now() - startKK;
    expect(resKK.status).toBe(200);
    expect(Array.isArray(resKK.data.streams)).toBe(true);
    for (const s of resKK.data.streams) {
      const text = `${s.name || ''} ${s.title || ''}`;
      expect(text).not.toContain('NguonC');
      expect(text).not.toContain('NGUONC');
      expect(text).not.toContain('VSMOV');
      expect(text).not.toContain('VIP 1');
      expect(text).not.toContain('VIP 3');
    }

    // 3. Query KKPhim again -> should be a fast CACHE HIT (< 50ms) with IDENTICAL results
    const startKK2 = Date.now();
    const resKK2 = await axios.get(`${baseUrl}/c/2/stream/movie/${mediaId}.json`, { timeout: 5000 });
    const elapsedKK2 = Date.now() - startKK2;
    expect(resKK2.status).toBe(200);
    expect(elapsedKK2).toBeLessThan(100);
    expect(resKK2.data.streams).toEqual(resKK.data.streams);

    // 4. Query NguonC only (/c/1/...)
    const resNguonC = await axios.get(`${baseUrl}/c/1/stream/movie/${mediaId}.json`, { timeout: 25000 });
    expect(resNguonC.status).toBe(200);
    expect(Array.isArray(resNguonC.data.streams)).toBe(true);
    for (const s of resNguonC.data.streams) {
      const text = `${s.name || ''} ${s.title || ''}`;
      expect(text).not.toContain('KKPhim');
      expect(text).not.toContain('KKPHIM');
      expect(text).not.toContain('VSMOV');
      expect(text).not.toContain('VIP 1');
      expect(text).not.toContain('VIP 2');
    }

    // 5. Query VSMOV only (/c/4/...)
    const resVSMOV = await axios.get(`${baseUrl}/c/4/stream/movie/${mediaId}.json`, { timeout: 25000 });
    expect(resVSMOV.status).toBe(200);
    expect(Array.isArray(resVSMOV.data.streams)).toBe(true);
    for (const s of resVSMOV.data.streams) {
      const text = `${s.name || ''} ${s.title || ''}`;
      expect(text).not.toContain('KKPhim');
      expect(text).not.toContain('KKPHIM');
      expect(text).not.toContain('NguonC');
      expect(text).not.toContain('NGUONC');
      expect(text).not.toContain('VIP 2');
      expect(text).not.toContain('VIP 3');
    }

    // 6. Query Dual: NguonC + KKPhim (/c/3/...)
    const resDual = await axios.get(`${baseUrl}/c/3/stream/movie/${mediaId}.json`, { timeout: 25000 });
    expect(resDual.status).toBe(200);
    expect(Array.isArray(resDual.data.streams)).toBe(true);
    for (const s of resDual.data.streams) {
      const text = `${s.name || ''} ${s.title || ''}`;
      expect(text).not.toContain('VSMOV');
      expect(text).not.toContain('VIP 1');
    }

    // 7. Verify Full Suite Cache Hit is still intact and not corrupted by single provider queries
    const startFull2 = Date.now();
    const resFull2 = await axios.get(`${baseUrl}/stream/movie/${mediaId}.json`, { timeout: 5000 });
    const elapsedFull2 = Date.now() - startFull2;
    expect(resFull2.status).toBe(200);
    expect(elapsedFull2).toBeLessThan(100);
    expect(resFull2.data.streams).toEqual(resFull.data.streams);
  });

  it('Test Matrix B: Reverse Order (Single Provider First -> Full Suite Second)', async () => {
    // Test on Series: tt7458054:1:1
    const seriesId = 'tt7458054:1:1';

    // 1. Query KKPhim ONLY first
    const resKK = await axios.get(`${baseUrl}/c/2/stream/series/${seriesId}.json`, { timeout: 25000 });
    expect(resKK.status).toBe(200);
    expect(Array.isArray(resKK.data.streams)).toBe(true);
    for (const s of resKK.data.streams) {
      const text = `${s.name || ''} ${s.title || ''}`;
      expect(text).not.toContain('NguonC');
      expect(text).not.toContain('VSMOV');
    }

    // 2. Query Full Suite (/stream/...) second -> MUST NOT return the cached KKPhim-only response!
    const resFull = await axios.get(`${baseUrl}/stream/series/${seriesId}.json`, { timeout: 25000 });
    expect(resFull.status).toBe(200);
    expect(Array.isArray(resFull.data.streams)).toBe(true);
    // Should aggregate from active providers (KKPhim + NguonC + VSMOV)
    const hasNguonC = resFull.data.streams.some((s) => {
      const text = `${s.name || ''} ${s.title || ''}`;
      return text.includes('NguonC') || text.includes('VIP 3');
    });
    // While You Were Sleeping is indexed on NguonC
    expect(hasNguonC).toBe(true);
  });

  it('Test Matrix C: Config Token Parameter Isolation (/:config/stream/...)', async () => {
    const mediaId = 'tt1375666';

    const tokenKK = encodeConfig({ providers: ['kkphim'] });
    const tokenNguonC = encodeConfig({ providers: ['nguonc'] });

    const resTokenKK = await axios.get(`${baseUrl}/${tokenKK}/stream/movie/${mediaId}.json`, { timeout: 25000 });
    expect(resTokenKK.status).toBe(200);
    for (const s of resTokenKK.data.streams) {
      const text = `${s.name || ''} ${s.title || ''}`;
      expect(text).not.toContain('NguonC');
      expect(text).not.toContain('VSMOV');
    }

    const resTokenNguonC = await axios.get(`${baseUrl}/${tokenNguonC}/stream/movie/${mediaId}.json`, { timeout: 25000 });
    expect(resTokenNguonC.status).toBe(200);
    for (const s of resTokenNguonC.data.streams) {
      const text = `${s.name || ''} ${s.title || ''}`;
      expect(text).not.toContain('KKPhim');
      expect(text).not.toContain('VSMOV');
    }
  });
});
