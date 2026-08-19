'use strict';

/**
 * ============================================================
 *  Adversarial Manifest & Catalog Stress Test Suite
 *  Challenger 1 Empirical Verification Harness
 * ============================================================
 */

const axios = require('axios');
const app = require('../src/server');

let server = null;
let baseUrl = '';

const http = axios.create({
  validateStatus: () => true, // Don't throw on any HTTP status
  timeout: 15000,
});

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

describe('Challenger 1: Manifest Matrix Stress Tests', () => {
  // 1. Root /manifest.json
  it('Root /manifest.json declares all 5 catalog shelves and valid Stremio metadata', async () => {
    const res = await http.get(`${baseUrl}/manifest.json`);
    expect(res.status).toBe(200);
    expect(res.headers['access-control-allow-origin']).toBe('*');
    expect(res.headers['content-type']).toContain('application/json');

    const manifest = res.data;
    expect(manifest.id).toBe('community.stremio.vip.vietnam');
    expect(manifest.version).toBeDefined();
    expect(manifest.name).toBeDefined();
    expect(manifest.resources).toEqual(expect.arrayContaining(['catalog', 'meta', 'stream']));
    expect(manifest.types).toEqual(expect.arrayContaining(['movie', 'series']));
    expect(Array.isArray(manifest.catalogs)).toBe(true);
    expect(manifest.catalogs.length).toBe(5);

    const catalogMap = new Map(manifest.catalogs.map((c) => [c.id, c]));
    expect(catalogMap.has('kkphim_phimmoi')).toBe(true);
    expect(catalogMap.get('kkphim_phimmoi').type).toBe('movie');
    expect(catalogMap.get('kkphim_phimmoi').name).toBe('KKPhim • Mới Cập Nhật');

    expect(catalogMap.has('kkphim_phimbo')).toBe(true);
    expect(catalogMap.get('kkphim_phimbo').type).toBe('series');
    expect(catalogMap.get('kkphim_phimbo').name).toBe('KKPhim • Phim Bộ');

    expect(catalogMap.has('nguonc_phimmoi')).toBe(true);
    expect(catalogMap.get('nguonc_phimmoi').type).toBe('movie');
    expect(catalogMap.get('nguonc_phimmoi').name).toBe('NguonC • Mới Cập Nhật');

    expect(catalogMap.has('nguonc_phimbo')).toBe(true);
    expect(catalogMap.get('nguonc_phimbo').type).toBe('series');
    expect(catalogMap.get('nguonc_phimbo').name).toBe('NguonC • Phim Bộ');

    expect(catalogMap.has('vsmov_4k')).toBe(true);
    expect(catalogMap.get('vsmov_4k').type).toBe('movie');
    expect(catalogMap.get('vsmov_4k').name).toBe('VSMOV • Phim 4K VIP');

    // Verify extra fields per Stremio spec
    manifest.catalogs.forEach((cat) => {
      expect(cat.id).toBeDefined();
      expect(['movie', 'series']).toContain(cat.type);
      expect(Array.isArray(cat.extra)).toBe(true);
      expect(cat.extra.some((e) => e.name === 'search')).toBe(true);
      expect(cat.extra.some((e) => e.name === 'genre')).toBe(true);
      expect(cat.extra.some((e) => e.name === 'skip')).toBe(true);
    });
  });

  // 2. Bitmask 7 (/c/7/manifest.json -> all 3 providers -> 5 catalogs)
  it('GET /c/7/manifest.json returns all 5 catalog shelves', async () => {
    const res = await http.get(`${baseUrl}/c/7/manifest.json`);
    expect(res.status).toBe(200);
    expect(res.data.catalogs.length).toBe(5);
    const ids = res.data.catalogs.map((c) => c.id);
    expect(ids).toEqual(['kkphim_phimmoi', 'kkphim_phimbo', 'nguonc_phimmoi', 'nguonc_phimbo', 'vsmov_4k']);
  });

  // 3. Bitmask 1 (/c/1/manifest.json -> NguonC only -> 2 catalogs)
  it('GET /c/1/manifest.json returns 2 NguonC catalogs', async () => {
    const res = await http.get(`${baseUrl}/c/1/manifest.json`);
    expect(res.status).toBe(200);
    expect(res.data.catalogs.length).toBe(2);
    const ids = res.data.catalogs.map((c) => c.id);
    expect(ids).toEqual(['nguonc_phimmoi', 'nguonc_phimbo']);
    expect(res.data.catalogs.find((c) => c.id === 'nguonc_phimmoi').type).toBe('movie');
    expect(res.data.catalogs.find((c) => c.id === 'nguonc_phimbo').type).toBe('series');
  });

  // 4. Bitmask 2 (/c/2/manifest.json -> KKPhim only -> 2 catalogs)
  it('GET /c/2/manifest.json returns 2 KKPhim catalogs', async () => {
    const res = await http.get(`${baseUrl}/c/2/manifest.json`);
    expect(res.status).toBe(200);
    expect(res.data.catalogs.length).toBe(2);
    const ids = res.data.catalogs.map((c) => c.id);
    expect(ids).toEqual(['kkphim_phimmoi', 'kkphim_phimbo']);
    expect(res.data.catalogs.find((c) => c.id === 'kkphim_phimmoi').type).toBe('movie');
    expect(res.data.catalogs.find((c) => c.id === 'kkphim_phimbo').type).toBe('series');
  });

  // 5. Bitmask 4 (/c/4/manifest.json -> VSMOV only -> 1 catalog)
  it('GET /c/4/manifest.json returns 1 VSMOV 4K catalog', async () => {
    const res = await http.get(`${baseUrl}/c/4/manifest.json`);
    expect(res.status).toBe(200);
    expect(res.data.catalogs.length).toBe(1);
    expect(res.data.catalogs[0].id).toBe('vsmov_4k');
    expect(res.data.catalogs[0].type).toBe('movie');
  });

  // 6. Bitmask 3 (/c/3/manifest.json -> NguonC + KKPhim -> 4 catalogs)
  it('GET /c/3/manifest.json returns 4 catalogs (KKPhim + NguonC)', async () => {
    const res = await http.get(`${baseUrl}/c/3/manifest.json`);
    expect(res.status).toBe(200);
    expect(res.data.catalogs.length).toBe(4);
    const ids = res.data.catalogs.map((c) => c.id);
    expect(ids).toEqual(['kkphim_phimmoi', 'kkphim_phimbo', 'nguonc_phimmoi', 'nguonc_phimbo']);
  });

  // 7. Bitmask 0 (/c/0/manifest.json -> fallback to all providers)
  it('GET /c/0/manifest.json falls back safely to default all 5 catalogs', async () => {
    const res = await http.get(`${baseUrl}/c/0/manifest.json`);
    expect(res.status).toBe(200);
    expect(res.data.catalogs.length).toBe(5);
  });

  // 8. Invalid bitmask token (/c/invalid/manifest.json -> fallback safely)
  it('GET /c/invalid/manifest.json falls back safely to default all 5 catalogs', async () => {
    const res = await http.get(`${baseUrl}/c/invalid/manifest.json`);
    expect(res.status).toBe(200);
    expect(res.data.catalogs.length).toBe(5);
  });
});

describe('Challenger 1: All 5 Catalog Shelves Live Tests', () => {
  // Shelf 1: KKPhim Latest Movies
  it('Shelf 1: GET /catalog/movie/kkphim_phimmoi.json returns HTTP 200 with movie metas', async () => {
    const res = await http.get(`${baseUrl}/catalog/movie/kkphim_phimmoi.json`);
    expect(res.status).toBe(200);
    expect(res.headers['access-control-allow-origin']).toBe('*');
    expect(Array.isArray(res.data?.metas)).toBe(true);
    expect(res.data.metas.length).toBeGreaterThan(0);

    const first = res.data.metas[0];
    expect(first.id).toMatch(/^kkphim_/);
    expect(first.type).toBe('movie');
    expect(typeof first.name).toBe('string');
    expect(first.name.length).toBeGreaterThan(0);
    expect(typeof first.poster).toBe('string');
    expect(first.poster.startsWith('http')).toBe(true);
  });

  // Shelf 2: KKPhim Series
  it('Shelf 2: GET /catalog/series/kkphim_phimbo.json returns HTTP 200 with series metas', async () => {
    const res = await http.get(`${baseUrl}/catalog/series/kkphim_phimbo.json`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.data?.metas)).toBe(true);
    expect(res.data.metas.length).toBeGreaterThan(0);

    const first = res.data.metas[0];
    expect(first.id).toMatch(/^kkphim_/);
    expect(first.type).toBe('series');
    expect(typeof first.name).toBe('string');
    expect(first.name.length).toBeGreaterThan(0);
    expect(typeof first.poster).toBe('string');
    expect(first.poster.startsWith('http')).toBe(true);
  });

  // Shelf 3: NguonC Latest Movies
  it('Shelf 3: GET /catalog/movie/nguonc_phimmoi.json returns HTTP 200 with movie metas', async () => {
    const res = await http.get(`${baseUrl}/catalog/movie/nguonc_phimmoi.json`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.data?.metas)).toBe(true);
    expect(res.data.metas.length).toBeGreaterThan(0);

    const first = res.data.metas[0];
    expect(first.id).toMatch(/^nguonc_/);
    expect(first.type).toBe('movie');
    expect(typeof first.name).toBe('string');
    expect(first.name.length).toBeGreaterThan(0);
    expect(typeof first.poster).toBe('string');
    expect(first.poster.startsWith('http')).toBe(true);
  });

  // Shelf 4: NguonC Series
  it('Shelf 4: GET /catalog/series/nguonc_phimbo.json returns HTTP 200 with series metas', async () => {
    const res = await http.get(`${baseUrl}/catalog/series/nguonc_phimbo.json`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.data?.metas)).toBe(true);
    expect(res.data.metas.length).toBeGreaterThan(0);

    const first = res.data.metas[0];
    expect(first.id).toMatch(/^nguonc_/);
    expect(first.type).toBe('series');
    expect(typeof first.name).toBe('string');
    expect(first.name.length).toBeGreaterThan(0);
    expect(typeof first.poster).toBe('string');
    expect(first.poster.startsWith('http')).toBe(true);
  });

  // Shelf 5: VSMOV 4K Movies
  it('Shelf 5: GET /catalog/movie/vsmov_4k.json returns HTTP 200 with 4K movie metas', async () => {
    const res = await http.get(`${baseUrl}/catalog/movie/vsmov_4k.json`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.data?.metas)).toBe(true);
    expect(res.data.metas.length).toBeGreaterThan(0);

    const first = res.data.metas[0];
    expect(first.id).toMatch(/^vsmov_/);
    expect(first.type).toBe('movie');
    expect(typeof first.name).toBe('string');
    expect(first.name.length).toBeGreaterThan(0);
    expect(typeof first.poster).toBe('string');
    expect(first.poster.startsWith('http')).toBe(true);
  });
});

describe('Challenger 1: Extras, Pagination, Filters & Bitmask Isolation', () => {
  // Extras 1: Skip & Genre on KKPhim
  it('GET /catalog/movie/kkphim_phimmoi/skip=20&genre=Action.json returns HTTP 200 with non-empty metas', async () => {
    const res = await http.get(`${baseUrl}/catalog/movie/kkphim_phimmoi/skip=20&genre=Action.json`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.data?.metas)).toBe(true);
    expect(res.data.metas.length).toBeGreaterThan(0);
  });

  // Extras 2: Skip on NguonC Series
  it('GET /catalog/series/nguonc_phimbo/skip=10.json returns HTTP 200 with non-empty metas', async () => {
    const res = await http.get(`${baseUrl}/catalog/series/nguonc_phimbo/skip=10.json`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.data?.metas)).toBe(true);
    expect(res.data.metas.length).toBeGreaterThan(0);
    expect(res.data.metas[0].type).toBe('series');
  });

  // Extras 3: Search extra on KKPhim
  it('GET /catalog/movie/kkphim_phimmoi/search=Batman.json returns search results', async () => {
    const res = await http.get(`${baseUrl}/catalog/movie/kkphim_phimmoi/search=Batman.json`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.data?.metas)).toBe(true);
    expect(res.data.metas.length).toBeGreaterThan(0);
    const hasMatch = res.data.metas.some(
      (m) => m.name.toLowerCase().includes('batman') || m.id.includes('batman')
    );
    expect(hasMatch).toBe(true);
  });

  // Extras 4: Pagination check: page 1 vs page 2 difference
  it('Pagination: skip=0 vs skip=20 returns different items on KKPhim', async () => {
    const p1 = await http.get(`${baseUrl}/catalog/movie/kkphim_phimmoi/skip=0.json`);
    const p2 = await http.get(`${baseUrl}/catalog/movie/kkphim_phimmoi/skip=20.json`);
    expect(p1.status).toBe(200);
    expect(p2.status).toBe(200);
    expect(p1.data.metas.length).toBeGreaterThan(0);
    expect(p2.data.metas.length).toBeGreaterThan(0);
    expect(p1.data.metas[0].id).not.toBe(p2.data.metas[0].id);
  });

  // Bitmask Provider Isolation:
  // When requesting /c/2/catalog/movie/nguonc_phimmoi.json (KKPhim only bitmask), NguonC catalog should return { metas: [] }
  it('Bitmask Isolation: /c/2/catalog/movie/nguonc_phimmoi.json returns { metas: [] } when NguonC is disabled', async () => {
    const res = await http.get(`${baseUrl}/c/2/catalog/movie/nguonc_phimmoi.json`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.data?.metas)).toBe(true);
    expect(res.data.metas.length).toBe(0);
  });

  // Bitmask Allowed:
  // When requesting /c/1/catalog/movie/nguonc_phimmoi.json (NguonC bitmask), returns metas
  it('Bitmask Allowed: /c/1/catalog/movie/nguonc_phimmoi.json returns metas when NguonC is enabled', async () => {
    const res = await http.get(`${baseUrl}/c/1/catalog/movie/nguonc_phimmoi.json`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.data?.metas)).toBe(true);
    expect(res.data.metas.length).toBeGreaterThan(0);
  });
});

describe('Challenger 1: Error Resilience & Adversarial Malformed Requests', () => {
  it('Non-existent catalog ID returns HTTP 200 with empty metas or graceful fallback without crashing', async () => {
    const res = await http.get(`${baseUrl}/catalog/movie/non_existent_catalog_99999.json`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.data?.metas)).toBe(true);
  });

  it('Malformed extra parameter (corrupted query string) does not crash server', async () => {
    const res = await http.get(`${baseUrl}/catalog/movie/kkphim_phimmoi/%20%20%20%20%20.json`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.data?.metas)).toBe(true);
  });

  it('Extremely large skip parameter handled gracefully', async () => {
    const res = await http.get(`${baseUrl}/catalog/movie/kkphim_phimmoi/skip=999999.json`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.data?.metas)).toBe(true);
  });

  it('Negative skip parameter handled gracefully without throwing', async () => {
    const res = await http.get(`${baseUrl}/catalog/movie/kkphim_phimmoi/skip=-20.json`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.data?.metas)).toBe(true);
    expect(res.data.metas.length).toBeGreaterThan(0);
  });

  it('Request without .json extension handled gracefully', async () => {
    const res = await http.get(`${baseUrl}/catalog/movie/kkphim_phimmoi`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.data?.metas)).toBe(true);
    expect(res.data.metas.length).toBeGreaterThan(0);
  });
});
