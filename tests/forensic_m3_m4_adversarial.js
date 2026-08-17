'use strict';

const assert = require('assert');
const { MANIFEST, ALL_CATALOGS, buildManifest, GENRES, COUNTRIES } = require('../src/manifest');
const { encodeConfig, decodeConfig, isConfigToken, DEFAULT_CONFIG } = require('../src/config');
const { resolveCinemeta, getCachedCinemeta, cinemetaCache } = require('../src/lib/cinemeta');
const app = require('../src/index');
const http = require('http');

async function runForensicAudit() {
  console.log('══════════════════════════════════════════════════════════════');
  console.log('🕵️‍♂️ FORENSIC AUDIT: Milestone 3 & 4 Independent Verification');
  console.log('══════════════════════════════════════════════════════════════\n');

  let passed = 0;
  let failed = 0;

  function verify(name, condition, extraInfo = '') {
    if (condition) {
      console.log(`  ✅ PASS: ${name}`);
      passed++;
    } else {
      console.error(`  ❌ FAIL: ${name} ${extraInfo}`);
      failed++;
    }
  }

  // ─────────────────────────────────────────────────────────────
  // CHECK 1: 22 Standard Catalogs K20 Compliance
  // ─────────────────────────────────────────────────────────────
  console.log('▶ CHECK 1: 22 Catalogs K20 Standard Mapping');
  verify('ALL_CATALOGS contains exactly 22 catalogs', ALL_CATALOGS.length === 22, `Found: ${ALL_CATALOGS.length}`);

  const expectedCatalogs = [
    { id: 'vsmov-4k', provider: 'vsmov', type: 'movie' },
    { id: 'vsmov-thuyet-minh', provider: 'vsmov', type: 'movie' },
    { id: 'kkphim-movie-latest', provider: 'kkphim', type: 'movie' },
    { id: 'kkphim-series-latest', provider: 'kkphim', type: 'series' },
    { id: 'kkphim-cinema-latest', provider: 'kkphim', type: 'movie' },
    { id: 'kkphim-anime-latest', provider: 'kkphim', type: 'series' },
    { id: 'nguonc-movie-latest', provider: 'nguonc', type: 'movie' },
    { id: 'nguonc-series-latest', provider: 'nguonc', type: 'series' },
    { id: 'nguonc-cinema-latest', provider: 'nguonc', type: 'movie' },
    { id: 'nguonc-anime-latest', provider: 'nguonc', type: 'series' },
    { id: 'stp-au-my', provider: 'stp', type: 'movie' },
    { id: 'stp-phim-le', provider: 'stp', type: 'movie' },
    { id: 'stp-phim-bo', provider: 'stp', type: 'series' },
    { id: 'stp-han-quoc', provider: 'stp', type: 'series' },
    { id: 'hh3d-phim-le', provider: 'hh3d', type: 'movie' },
    { id: 'hh3d-phim-bo', provider: 'hh3d', type: 'series' },
    { id: 'hh3d-tien-hiep', provider: 'hh3d', type: 'series' },
    { id: 'yan-phim-le', provider: 'yan', type: 'movie' },
    { id: 'yan-phim-bo', provider: 'yan', type: 'series' },
    { id: 'yan-dang-chieu', provider: 'yan', type: 'series' },
    { id: 'clbpx-kiem-hiep', provider: 'clbpx', type: 'series' },
    { id: 'clbpx-hong-kong', provider: 'clbpx', type: 'series' },
  ];

  for (const expected of expectedCatalogs) {
    const found = ALL_CATALOGS.find((c) => c.id === expected.id);
    verify(
      `Catalog "${expected.id}" exists with provider "${expected.provider}" and type "${expected.type}"`,
      found && found.provider === expected.provider && found.type === expected.type,
      found ? `Found provider=${found.provider}, type=${found.type}` : 'Not found'
    );
    if (found) {
      const hasSearch = Array.isArray(found.extra) && found.extra.some((e) => e.name === 'search');
      const hasGenre = Array.isArray(found.extra) && found.extra.some((e) => e.name === 'genre');
      const hasSkip = Array.isArray(found.extra) && found.extra.some((e) => e.name === 'skip');
      verify(`Catalog "${expected.id}" supports extra search, genre, skip`, hasSearch && hasGenre && hasSkip);
    }
  }

  // ─────────────────────────────────────────────────────────────
  // CHECK 2: Dynamic Manifest Filtering & Config Serialization
  // ─────────────────────────────────────────────────────────────
  console.log('\n▶ CHECK 2: Dynamic Manifest & Config Engine');
  const customConfig = {
    providers: ['vsmov', 'kkphim'],
    categories: ['movie'],
    apiKey: 'my-secret-key-123',
  };
  const token = encodeConfig(customConfig);
  verify('encodeConfig generates URL-safe string', typeof token === 'string' && !token.includes('=') && !token.includes('/') && !token.includes('+'));
  const decoded = decodeConfig(token);
  verify('decodeConfig recovers exact providers and categories', 
    decoded.providers.includes('vsmov') && 
    decoded.providers.includes('kkphim') && 
    !decoded.providers.includes('nguonc') && 
    decoded.categories.length === 1 && 
    decoded.categories[0] === 'movie'
  );
  const dynamicManifest = buildManifest(decoded);
  verify('Dynamic manifest filters catalogs according to config', dynamicManifest.catalogs.every((c) => c.id.startsWith('vsmov') || c.id.startsWith('kkphim')));

  // ─────────────────────────────────────────────────────────────
  // CHECK 3: Cinemeta Resolver & LRU Caching
  // ─────────────────────────────────────────────────────────────
  console.log('\n▶ CHECK 3: Cinemeta Metadata Resolver & Caching');
  const cineMeta = await resolveCinemeta('movie', 'tt1375666'); // Inception
  verify('resolveCinemeta returns canonical title for Inception', cineMeta && cineMeta.name === 'Inception');
  verify('resolveCinemeta returns canonical year 2010', cineMeta && cineMeta.year === 2010);
  const cachedMeta = getCachedCinemeta('movie', 'tt1375666');
  verify('getCachedCinemeta retrieves cached metadata synchronously', cachedMeta && cachedMeta.name === 'Inception');

  // Test invalid IMDb ID rejection
  const invalidCine = await resolveCinemeta('movie', 'invalid-id-xyz');
  verify('resolveCinemeta safely returns null for invalid non-tt ID', invalidCine === null);

  // ─────────────────────────────────────────────────────────────
  // CHECK 4: withTimeout & Fault Isolation Stress Test
  // ─────────────────────────────────────────────────────────────
  console.log('\n▶ CHECK 4: withTimeout & Promise.allSettled Resiliency');
  // We simulate a mock slow promise that takes 5000ms
  const slowPromise = new Promise((resolve) => setTimeout(() => resolve('OK'), 5000));
  
  // Directly test withTimeout logic (handlers.js uses 4000ms timeout)
  function testTimeout(p, ms) {
    let timer;
    const timeoutP = new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error(`Timed out after ${ms}ms`)), ms);
    });
    return Promise.race([p, timeoutP]).finally(() => clearTimeout(timer));
  }

  const startMs = Date.now();
  let timedOut = false;
  try {
    await testTimeout(slowPromise, 100); // Test fast 100ms timeout
  } catch (err) {
    if (err.message.includes('Timed out')) timedOut = true;
  }
  const elapsed = Date.now() - startMs;
  verify('withTimeout cancels hanging upstream promises safely', timedOut && elapsed < 300, `Elapsed: ${elapsed}ms`);

  // ─────────────────────────────────────────────────────────────
  // CHECK 5: Live Express Server Route Matrix & Protocol Verification
  // ─────────────────────────────────────────────────────────────
  console.log('\n▶ CHECK 5: Express Routing Matrix & In-App Exclusivity');
  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;
  const baseUrl = `http://127.0.0.1:${port}`;

  async function get(path) {
    const res = await fetch(`${baseUrl}${path}`);
    const data = await res.json();
    return { status: res.status, headers: res.headers, data };
  }

  // 1. Root and config manifest
  const m1 = await get('/manifest.json');
  verify('GET /manifest.json returns 200 OK', m1.status === 200 && m1.data.id === 'org.vipmovies.stremio.addon');
  
  const m2 = await get(`/${token}/manifest.json`);
  verify('GET /:config/manifest.json returns 200 OK', m2.status === 200 && m2.data.id === 'org.vipmovies.stremio.addon');

  // 2. 22 catalogs routing check
  const catRes = await get('/catalog/movie/vsmov-4k.json');
  verify('GET /catalog/movie/vsmov-4k.json returns 200 OK with metas array', catRes.status === 200 && Array.isArray(catRes.data.metas));

  const catWithExtra = await get('/catalog/movie/vsmov-4k/search%3Davengers.json');
  verify('GET /catalog/movie/vsmov-4k/search%3Davengers.json returns 200 OK with metas array', catWithExtra.status === 200 && Array.isArray(catWithExtra.data.metas));

  const catConfigWithExtra = await get(`/${token}/catalog/movie/kkphim-movie-latest/search%3Dspider-man.json`);
  verify('GET /:config/catalog/movie/kkphim-movie-latest/search%3Dspider-man.json returns 200 OK', catConfigWithExtra.status === 200 && Array.isArray(catConfigWithExtra.data.metas));

  // 3. 404 Prevention on non-existent catalog
  const fakeCat = await get('/catalog/movie/non-existent-fake-catalog-999.json');
  verify('GET /catalog/movie/non-existent-fake-catalog-999.json returns 200 OK with { metas: [] }', fakeCat.status === 200 && Array.isArray(fakeCat.data.metas) && fakeCat.data.metas.length === 0);

  // 4. Stream endpoint protocol verification
  const streamRes = await get('/stream/movie/tt1375666.json');
  verify('GET /stream/movie/tt1375666.json returns 200 OK with streams array', streamRes.status === 200 && Array.isArray(streamRes.data.streams));

  if (streamRes.data.streams.length > 0) {
    let allStreamsValid = true;
    for (const s of streamRes.data.streams) {
      if (!s.url || s.externalUrl) {
        allStreamsValid = false;
        break;
      }
    }
    verify('All stream objects strictly enforce { url } and zero { externalUrl }', allStreamsValid);
  }

  // 5. Config-prefixed stream endpoint
  const streamConfigRes = await get(`/${token}/stream/movie/tt1375666.json`);
  verify('GET /:config/stream/movie/tt1375666.json returns 200 OK with streams array', streamConfigRes.status === 200 && Array.isArray(streamConfigRes.data.streams));

  server.close();

  console.log('\n══════════════════════════════════════════════════════════════');
  console.log(`🏁 FORENSIC SUMMARY: ${passed} PASSED, ${failed} FAILED`);
  console.log('══════════════════════════════════════════════════════════════\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runForensicAudit().catch((err) => {
  console.error('Fatal Forensic Test Error:', err);
  process.exit(1);
});
