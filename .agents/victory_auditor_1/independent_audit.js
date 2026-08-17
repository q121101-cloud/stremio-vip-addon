'use strict';

/**
 * ============================================================
 *  VICTORY AUDITOR INDEPENDENT VERIFICATION SUITE
 *  Location: .agents/victory_auditor_1/independent_audit.js
 * ============================================================
 */

const http = require('http');
const express = require('express');
const axios = require('axios');
const path = require('path');

const PROJECT_ROOT = path.resolve(__dirname, '../..');

// Load target modules
const { resolveCinemeta, getCachedCinemeta, cinemetaCache } = require(`${PROJECT_ROOT}/src/lib/cinemeta`);
const { LRUCache, imdbCache, catalogCache, detailCache } = require(`${PROJECT_ROOT}/src/lib/cache`);
const providerKKPhim = require(`${PROJECT_ROOT}/src/providers/kkphim`);
const providerNguonC = require(`${PROJECT_ROOT}/src/providers/nguonc`);
const providerVsMov  = require(`${PROJECT_ROOT}/src/providers/vsmov`);
const mapper = require(`${PROJECT_ROOT}/src/mapper`);
const { encodeConfig, decodeConfig, isConfigToken, DEFAULT_CONFIG } = require(`${PROJECT_ROOT}/src/config`);
const { MANIFEST, buildManifest } = require(`${PROJECT_ROOT}/src/manifest`);
const handlers = require(`${PROJECT_ROOT}/src/handlers`);
const manifestRouter = require(`${PROJECT_ROOT}/src/routes/manifest`);
const hlsRouter = require(`${PROJECT_ROOT}/src/routes/hls`);

let passedCount = 0;
let failedCount = 0;
const failures = [];

function assert(condition, message, details = null) {
  if (condition) {
    passedCount++;
    console.log(`  ✅ PASS: ${message}`);
  } else {
    failedCount++;
    failures.push({ message, details });
    console.error(`  ❌ FAIL: ${message}`);
    if (details) console.error(`     Details:`, details);
  }
}

async function runAudit() {
  console.log('\n╔══════════════════════════════════════════════════════════════════════╗');
  console.log('║   VICTORY AUDITOR INDEPENDENT VERIFICATION SUITE (ENGINE v1.4.0)     ║');
  console.log('╚══════════════════════════════════════════════════════════════════════╝\n');

  // =========================================================================
  // CHECK 1: Versioning & Brand Integrity (R4)
  // =========================================================================
  console.log('--- CHECK 1: Versioning & UI / Brand Integrity ---');
  const pkg = require(`${PROJECT_ROOT}/package.json`);
  assert(pkg.version === '1.4.0', `package.json version is 1.4.0 (got ${pkg.version})`);
  assert(MANIFEST.version === '1.4.0', `src/manifest.js version is 1.4.0 (got ${MANIFEST.version})`);
  assert(MANIFEST.name === 'VIP Movies 🎬', `MANIFEST name is 'VIP Movies 🎬' (got ${MANIFEST.name})`);
  assert(Array.isArray(MANIFEST.idPrefixes) && MANIFEST.idPrefixes.includes('tt'), `MANIFEST idPrefixes contains 'tt'`);

  // =========================================================================
  // CHECK 2: Cinemeta Metadata Resolver (R1)
  // =========================================================================
  console.log('\n--- CHECK 2: Cinemeta Metadata Resolver (Live & Unit) ---');
  cinemetaCache.clear();

  // Test Movie: Inception
  const inception = await resolveCinemeta('movie', 'tt1375666');
  assert(inception !== null, 'Cinemeta resolved tt1375666 (Inception)');
  if (inception) {
    assert(inception.imdbId === 'tt1375666', `Resolved IMDb ID is tt1375666 (got ${inception.imdbId})`);
    assert(inception.name === 'Inception', `Resolved canonical name is 'Inception' (got ${inception.name})`);
    assert(inception.year === 2010, `Resolved release year is 2010 (got ${inception.year})`);
    assert(Array.isArray(inception.genres) && inception.genres.length > 0, `Resolved genres is non-empty array: ${JSON.stringify(inception.genres)}`);
  }

  // Test Cache persistence
  const cachedInception = getCachedCinemeta('movie', 'tt1375666');
  assert(cachedInception !== null && cachedInception.name === 'Inception', 'getCachedCinemeta returned cached Inception without network call');

  // Test Series: Breaking Bad with season:ep delimiter
  const breakingBad = await resolveCinemeta('series', 'tt0903747:1:1');
  assert(breakingBad !== null, 'Cinemeta resolved tt0903747:1:1 (Breaking Bad)');
  if (breakingBad) {
    assert(breakingBad.imdbId === 'tt0903747', `Cleaned IMDb ID stripped :1:1 to tt0903747 (got ${breakingBad.imdbId})`);
    assert(breakingBad.name.includes('Breaking Bad'), `Resolved canonical name is 'Breaking Bad' (got ${breakingBad.name})`);
    assert(breakingBad.year === 2008, `Resolved start year is 2008 (got ${breakingBad.year})`);
  }

  // Test Edge Cases: non-existent / invalid IDs
  const invalid1 = await resolveCinemeta('movie', 'invalid_id');
  assert(invalid1 === null, 'resolveCinemeta returns null for invalid non-tt ID');
  const invalid2 = await resolveCinemeta('movie', 'tt');
  assert(invalid2 === null, 'resolveCinemeta returns null for "tt" with no digits');

  // =========================================================================
  // CHECK 3: Multi-Provider Stream Extraction & Isolation (R2)
  // =========================================================================
  console.log('\n--- CHECK 3: Provider Stream Extraction & Protocol Exclusivity ---');

  // Test KKPhim direct
  const kkStreams = await providerKKPhim.getStreams({
    imdbId: 'tt1375666',
    type: 'movie',
    title: 'Inception',
    year: 2010,
    proxyBase: 'http://localhost:7099',
  });
  assert(Array.isArray(kkStreams), 'KKPhim getStreams returns array');
  assert(kkStreams.length > 0, `KKPhim returned ${kkStreams.length} stream(s) for Inception`);
  
  for (const s of kkStreams) {
    if (s.url) {
      assert(s.externalUrl === undefined, `KKPhim In-App stream has url and NO externalUrl: ${s.title}`);
      assert(s.title.includes('(HLS Proxy)') && s.title.includes('VIP • KKPhim'), `KKPhim In-App title format correct: ${s.title.split('\n')[0]}`);
    } else if (s.externalUrl) {
      assert(s.url === undefined, `KKPhim Embed stream has externalUrl and NO url: ${s.title}`);
      assert(s.title.includes('(Embed Player)') && s.title.includes('Dự phòng • KKPhim'), `KKPhim Embed title format correct: ${s.title.split('\n')[0]}`);
    } else {
      assert(false, `Stream item has neither url nor externalUrl!`);
    }
  }

  // Test NguonC direct
  const nguoncStreams = await providerNguonC.getStreams({
    imdbId: 'tt1375666',
    type: 'movie',
    title: 'Inception',
    year: 2010,
    proxyBase: 'http://localhost:7099',
  });
  assert(Array.isArray(nguoncStreams), 'NguonC getStreams returns array');
  assert(nguoncStreams.length > 0, `NguonC returned ${nguoncStreams.length} stream(s) for Inception`);
  
  for (const s of nguoncStreams) {
    if (s.url) {
      assert(s.externalUrl === undefined, `NguonC In-App stream has url and NO externalUrl: ${s.title}`);
      assert(s.title.includes('(HLS Proxy)') && s.title.includes('VIP • NguonC'), `NguonC In-App title format correct: ${s.title.split('\n')[0]}`);
    } else if (s.externalUrl) {
      assert(s.url === undefined, `NguonC Embed stream has externalUrl and NO url: ${s.title}`);
      assert(s.title.includes('(Embed Player)') && s.title.includes('Dự phòng • NguonC'), `NguonC Embed title format correct: ${s.title.split('\n')[0]}`);
    } else {
      assert(false, `Stream item has neither url nor externalUrl!`);
    }
  }

  // Test VsMov error isolation & graceful degradation
  const vsmovStreams = await providerVsMov.getStreams({
    imdbId: 'tt1375666',
    type: 'movie',
    title: 'Inception',
    year: 2010,
    proxyBase: 'http://localhost:7099',
  });
  assert(Array.isArray(vsmovStreams), 'VsMov getStreams gracefully returned array without throwing');

  // =========================================================================
  // CHECK 4: Live HTTP Server & Endpoint Verification (R3, R4)
  // =========================================================================
  console.log('\n--- CHECK 4: Live HTTP Server Endpoint Verification ---');

  const app = express();
  app.use('/hls', hlsRouter);
  app.use('/', manifestRouter);
  app.use('/', handlers);

  const TEST_PORT = 7099;
  const server = await new Promise((resolve) => {
    const s = app.listen(TEST_PORT, '127.0.0.1', () => resolve(s));
  });

  const client = axios.create({
    baseURL: `http://127.0.0.1:${TEST_PORT}`,
    timeout: 10000,
    validateStatus: () => true,
  });

  try {
    // 4.1 Dashboard UI
    const resUI = await client.get('/');
    assert(resUI.status === 200, `GET / returned HTTP 200 (got ${resUI.status})`);
    assert(resUI.data.includes('VIP Movies Addon v1.4.0'), 'GET / HTML contains "VIP Movies Addon v1.4.0"');
    assert(resUI.data.includes('Powered by <span class="brand-highlight">Q121101</span>'), 'GET / HTML contains brand footer "Powered by <span class="brand-highlight">Q121101</span>"');

    // 4.2 Manifest
    const resManifest = await client.get('/manifest.json');
    assert(resManifest.status === 200, `GET /manifest.json returned HTTP 200 (got ${resManifest.status})`);
    assert(resManifest.data.version === '1.4.0', `Manifest version is 1.4.0 (got ${resManifest.data.version})`);
    assert(Array.isArray(resManifest.data.catalogs) && resManifest.data.catalogs.length > 0, `Manifest catalogs array is populated (${resManifest.data.catalogs.length} catalogs)`);

    // 4.3 Config-Prefixed Manifest
    const token = encodeConfig({ providers: ['kkphim'], categories: ['movie'] });
    const resConfigManifest = await client.get(`/${token}/manifest.json`);
    assert(resConfigManifest.status === 200, `GET /:config/manifest.json returned HTTP 200`);
    assert(resConfigManifest.data.catalogs.every(c => c.id.startsWith('kkphim-')), `Config filtered catalogs to KKPhim only`);

    // 4.4 Inception Stream Aggregation
    const resInception = await client.get('/stream/movie/tt1375666.json');
    assert(resInception.status === 200, `GET /stream/movie/tt1375666.json returned HTTP 200 (got ${resInception.status})`);
    assert(Array.isArray(resInception.data.streams), 'Inception stream response contains "streams" array');
    assert(resInception.data.streams.length >= 2, `Inception returned ${resInception.data.streams.length} aggregated stream(s)`);

    for (const [idx, s] of resInception.data.streams.entries()) {
      assert(!s.title.includes('#'), `Stream #${idx + 1} title stripped '#' characters: "${s.title}"`);
      if (s.url) {
        assert(s.externalUrl === undefined, `Stream #${idx + 1} HLS Proxy has 'url' and NO 'externalUrl'`);
        assert(s.title.includes('(HLS Proxy)') && s.title.includes('⚡ Phát trực tiếp trong App'), `Stream #${idx + 1} has proper in-app title & badge`);
      } else if (s.externalUrl) {
        assert(s.url === undefined, `Stream #${idx + 1} Embed has 'externalUrl' and NO 'url'`);
        assert(s.title.includes('(Embed Player)') && s.title.includes('🌐 Bấm để mở xem ngoài trình duyệt web'), `Stream #${idx + 1} has proper embed title & badge`);
      } else {
        assert(false, `Stream #${idx + 1} invalid stream protocol (no url and no externalUrl)`);
      }
    }

    // 4.5 Series Stream Aggregation (Breaking Bad S01E01)
    const resSeries = await client.get('/stream/series/tt0903747:1:1.json');
    assert(resSeries.status === 200, `GET /stream/series/tt0903747:1:1.json returned HTTP 200 (got ${resSeries.status})`);
    assert(Array.isArray(resSeries.data.streams), 'Series stream response contains "streams" array');
    assert(resSeries.data.streams.length >= 2, `Series S01E01 returned ${resSeries.data.streams.length} aggregated stream(s)`);

    // 4.6 Health Check & Cache Operations
    const resHealth = await client.get('/health');
    assert(resHealth.status === 200, `GET /health returned HTTP 200`);
    assert(resHealth.data.status === 'ok', `Health status is 'ok'`);
    assert(resHealth.data.version === '1.4.0', `Health version is 1.4.0`);

    const resClear = await client.post('/admin/cache/clear');
    assert(resClear.status === 200, `POST /admin/cache/clear returned HTTP 200`);

  } finally {
    server.close();
  }

  // =========================================================================
  // SUMMARY
  // =========================================================================
  console.log('\n╔══════════════════════════════════════════════════════════════════════╗');
  console.log(`║   AUDIT RESULTS:  ${passedCount} PASSED  |  ${failedCount} FAILED                          ║`);
  console.log('╚══════════════════════════════════════════════════════════════════════╝\n');

  if (failedCount > 0) {
    console.error('FAILED ASSERTIONS:');
    for (const f of failures) {
      console.error(`- ${f.message}`);
    }
    process.exit(1);
  } else {
    console.log('🌟 ALL INDEPENDENT VICTORY AUDIT CHECKS PASSED WITH 100% SUCCESS!\n');
    process.exit(0);
  }
}

runAudit().catch((err) => {
  console.error('Fatal audit failure:', err);
  process.exit(1);
});
