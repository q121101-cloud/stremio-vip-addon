'use strict';

/**
 * ==============================================================================
 *  VIP Movies Addon — tests/test_routing_and_22_catalogs.js
 *  Milestone 3 Test Suite: 22 Standard K20 Catalogs, Explicit Routing & 404 Prevention
 * ==============================================================================
 */

const express = require('express');
const axios = require('axios');
const assert = require('assert');

const app = require('../src/index');
const { ALL_CATALOGS, MANIFEST, buildManifest } = require('../src/manifest');
const { encodeConfig, decodeConfig, DEFAULT_CONFIG, VALID_PROVIDERS, VALID_CATEGORIES } = require('../src/config');

const GREEN = '\x1b[32m';
const RED = '\x1b[31m';
const CYAN = '\x1b[36m';
const BOLD = '\x1b[1m';
const RESET = '\x1b[0m';

let passed = 0;
let failed = 0;
const failures = [];

function pass(desc) {
  console.log(`  ${GREEN}✅ PASS:${RESET} ${desc}`);
  passed++;
}

function fail(desc, err) {
  const errMsg = err ? (err.message || String(err)) : 'Assertion failed';
  console.error(`  ${RED}❌ FAIL:${RESET} ${desc}`);
  console.error(`     ${errMsg}`);
  failed++;
  failures.push({ desc, errMsg });
}

async function runTestSuite() {
  console.log(`\n${BOLD}${CYAN}╔══════════════════════════════════════════════════════════════════════════════╗${RESET}`);
  console.log(`${BOLD}${CYAN}║   🎬 M3 TEST SUITE: 22 CATALOGS K20 STANDARD & 404 ROUTING PREVENTION        ║${RESET}`);
  console.log(`${BOLD}${CYAN}╚══════════════════════════════════════════════════════════════════════════════╝${RESET}\n`);

  // 1. Start Server on Ephemeral Port
  const server = await new Promise((resolve, reject) => {
    const s = app.listen(0, '127.0.0.1', () => resolve(s));
    s.on('error', reject);
  });
  const port = server.address().port;
  const baseUrl = `http://127.0.0.1:${port}`;
  const client = axios.create({ baseURL: baseUrl, timeout: 20000, validateStatus: () => true });

  const testConfigToken = encodeConfig({
    providers: ['vsmov', 'kkphim', 'nguonc'],
    categories: ['movie', 'series'],
  });

  try {
    // ══════════════════════════════════════════════════════════════════════════
    //  SECTION 1: 22 Standard K20 Catalogs Inventory & Manifest Verification
    // ══════════════════════════════════════════════════════════════════════════
    console.log(`${BOLD}══ SECTION 1: 22 Standard K20 Catalogs Inventory & Manifest ══${RESET}`);

    try {
      assert.strictEqual(ALL_CATALOGS.length, 22, `ALL_CATALOGS must contain exactly 22 catalogs (got ${ALL_CATALOGS.length})`);
      pass(`ALL_CATALOGS contains 22 catalogs`);
    } catch (e) { fail(`ALL_CATALOGS count`, e); }

    try {
      assert.strictEqual(MANIFEST.catalogs.length, 22, `Default MANIFEST.catalogs must contain 22 catalogs (got ${MANIFEST.catalogs.length})`);
      pass(`Default MANIFEST has 22 catalogs`);
    } catch (e) { fail(`Default MANIFEST catalogs count`, e); }

    // Test GET /manifest.json
    const rootManifestRes = await client.get('/manifest.json');
    try {
      assert.strictEqual(rootManifestRes.status, 200);
      assert(Array.isArray(rootManifestRes.data.catalogs));
      assert.strictEqual(rootManifestRes.data.catalogs.length, 22);
      pass(`GET /manifest.json returns HTTP 200 with 22 catalogs`);
    } catch (e) { fail(`GET /manifest.json`, e); }

    // Test GET /:config/manifest.json
    const configManifestRes = await client.get(`/${testConfigToken}/manifest.json`);
    try {
      assert.strictEqual(configManifestRes.status, 200);
      assert(Array.isArray(configManifestRes.data.catalogs));
      // Providers: vsmov (2), kkphim (2), nguonc (2) = 6 catalogs for movie+series
      assert.strictEqual(configManifestRes.data.catalogs.length, 6);
      pass(`GET /:config/manifest.json returns HTTP 200 with filtered catalogs (6)`);
    } catch (e) { fail(`GET /:config/manifest.json`, e); }

    // ══════════════════════════════════════════════════════════════════════════
    //  SECTION 2: All 22 Catalogs Accessible via Root and /:config/ Routes
    // ══════════════════════════════════════════════════════════════════════════
    console.log(`\n${BOLD}══ SECTION 2: All 22 Catalogs Endpoint Reachability (Root & /:config/) ══${RESET}`);

    for (const cat of ALL_CATALOGS) {
      // Root catalog endpoint
      const rootUrl = `/catalog/${cat.type}/${cat.id}.json`;
      const rootRes = await client.get(rootUrl);
      try {
        assert.strictEqual(rootRes.status, 200, `Root catalog ${rootUrl} returned status ${rootRes.status}`);
        assert(Array.isArray(rootRes.data.metas), `Response must contain metas array`);
        pass(`GET ${rootUrl} → HTTP 200 OK (${rootRes.data.metas.length} items)`);
      } catch (e) { fail(`GET ${rootUrl}`, e); }

      // Config-prefixed catalog endpoint
      const confUrl = `/${testConfigToken}/catalog/${cat.type}/${cat.id}.json`;
      const confRes = await client.get(confUrl);
      try {
        assert.strictEqual(confRes.status, 200, `Config-prefixed catalog ${confUrl} returned status ${confRes.status}`);
        assert(Array.isArray(confRes.data.metas), `Response must contain metas array`);
        pass(`GET ${confUrl} → HTTP 200 OK (${confRes.data.metas.length} items)`);
      } catch (e) { fail(`GET ${confUrl}`, e); }
    }

    // ══════════════════════════════════════════════════════════════════════════
    //  SECTION 3: Extra Parameter Parsing & 404 Prevention
    // ══════════════════════════════════════════════════════════════════════════
    console.log(`\n${BOLD}══ SECTION 3: Extra Parameter Parsing & 404 Prevention ══${RESET}`);

    const extraTestCases = [
      { name: 'Plain search parameter', url: '/catalog/movie/kkphim-movie-latest/search=batman.json' },
      { name: 'URL-encoded search parameter', url: '/catalog/movie/kkphim-movie-latest/search%3Dspider-man.json' },
      { name: 'URL-encoded Vietnamese genre', url: '/catalog/movie/nguonc-movie-latest/genre%3DH%C3%A0nh%20%C4%90%E1%BB%99ng.json' },
      { name: 'Multi-parameter (genre + skip)', url: '/catalog/movie/kkphim-movie-latest/genre=Action&skip=10.json' },
      { name: 'Config-prefixed URL-encoded search', url: `/${testConfigToken}/catalog/movie/vsmov-4k/search%3Davengers.json` },
      { name: 'Config-prefixed plain search', url: `/${testConfigToken}/catalog/series/stp-phim-bo/search=drama.json` },
      { name: 'Non-existent catalog ID (404 Prevention)', url: '/catalog/movie/totally-nonexistent-catalog-12345.json' },
      { name: 'Non-existent search query with 0 results', url: '/catalog/movie/kkphim-movie-latest/search=xyzzyxyzzyimpossiblequery123.json' },
      { name: 'Malformed extra parameters', url: '/catalog/movie/kkphim-movie-latest/&&&&===malformed===&&&.json' },
    ];

    for (const tc of extraTestCases) {
      const res = await client.get(tc.url);
      try {
        assert.strictEqual(res.status, 200, `Expected HTTP 200, got ${res.status} for ${tc.url}`);
        assert(Array.isArray(res.data.metas), `Expected metas array for ${tc.url}`);
        pass(`${tc.name}: GET ${tc.url} → HTTP 200 (metas: ${res.data.metas.length})`);
      } catch (e) { fail(`${tc.name}: GET ${tc.url}`, e); }
    }

    // ══════════════════════════════════════════════════════════════════════════
    //  SECTION 4: Meta & Stream Endpoints (Root & /:config/)
    // ══════════════════════════════════════════════════════════════════════════
    console.log(`\n${BOLD}══ SECTION 4: Meta & Stream Endpoints with/without /:config/ ══${RESET}`);

    // Meta root
    const metaRoot = await client.get('/meta/movie/nguonc:nu-hiep-ruy-bang.json');
    try {
      assert.strictEqual(metaRoot.status, 200);
      assert(metaRoot.data && typeof metaRoot.data === 'object');
      pass(`GET /meta/movie/nguonc:nu-hiep-ruy-bang.json → HTTP 200`);
    } catch (e) { fail(`GET /meta/... root`, e); }

    // Meta config-prefixed
    const metaConf = await client.get(`/${testConfigToken}/meta/movie/nguonc:nu-hiep-ruy-bang.json`);
    try {
      assert.strictEqual(metaConf.status, 200);
      assert(metaConf.data && typeof metaConf.data === 'object');
      pass(`GET /:config/meta/movie/nguonc:nu-hiep-ruy-bang.json → HTTP 200`);
    } catch (e) { fail(`GET /:config/meta/...`, e); }

    // Meta non-existent (never 404)
    const metaNonExistent = await client.get('/meta/movie/unknown_movie_xyz123.json');
    try {
      assert.strictEqual(metaNonExistent.status, 200);
      assert.strictEqual(metaNonExistent.data.meta, null);
      pass(`GET /meta/... for unknown ID → HTTP 200 { meta: null }`);
    } catch (e) { fail(`GET /meta/... unknown ID`, e); }

    // Stream root
    const streamRoot = await client.get('/stream/movie/tt1375666.json');
    try {
      assert.strictEqual(streamRoot.status, 200);
      assert(Array.isArray(streamRoot.data.streams));
      pass(`GET /stream/movie/tt1375666.json → HTTP 200 (${streamRoot.data.streams.length} streams)`);
    } catch (e) { fail(`GET /stream/... root`, e); }

    // Stream config-prefixed
    const streamConf = await client.get(`/${testConfigToken}/stream/movie/tt1375666.json`);
    try {
      assert.strictEqual(streamConf.status, 200);
      assert(Array.isArray(streamConf.data.streams));
      pass(`GET /:config/stream/movie/tt1375666.json → HTTP 200 (${streamConf.data.streams.length} streams)`);
    } catch (e) { fail(`GET /:config/stream/...`, e); }

    // Stream unknown ID (never 404)
    const streamUnknown = await client.get('/stream/movie/tt0000000unknown.json');
    try {
      assert.strictEqual(streamUnknown.status, 200);
      assert(Array.isArray(streamUnknown.data.streams));
      pass(`GET /stream/... for non-matching ID → HTTP 200 { streams: [] }`);
    } catch (e) { fail(`GET /stream/... unknown ID`, e); }

    // ══════════════════════════════════════════════════════════════════════════
    //  SECTION 5: Configurator Dashboard
    // ══════════════════════════════════════════════════════════════════════════
    console.log(`\n${BOLD}══ SECTION 5: Configurator Dashboard HTML Verification ══${RESET}`);

    const uiRes = await client.get('/');
    try {
      assert.strictEqual(uiRes.status, 200);
      assert(uiRes.data.includes('VIP Movies'));
      assert(uiRes.data.includes('VSMOV 4K'));
      assert(uiRes.data.includes('KKPhim'));
      assert(uiRes.data.includes('NguonC'));
      assert(uiRes.data.includes('STP'));
      assert(uiRes.data.includes('HH3D'));
      assert(uiRes.data.includes('YAN'));
      assert(uiRes.data.includes('CLBPX'));
      assert(uiRes.data.includes('Q121101'));
      pass(`GET / (Configurator UI) renders all 7 providers and brand signature`);
    } catch (e) { fail(`Configurator UI check`, e); }

  } finally {
    await new Promise((resolve) => server.close(resolve));
  }

  console.log(`\n${BOLD}══════════════════════════════════════════════════════════════${RESET}`);
  console.log(`${BOLD}🏁 M3 TEST SUITE SUMMARY: ${GREEN}${passed} PASSED${RESET}, ${failed > 0 ? RED + failed + ' FAILED' : GREEN + '0 FAILED'}${RESET}`);
  console.log(`${BOLD}══════════════════════════════════════════════════════════════${RESET}\n`);

  if (failed > 0) {
    process.exit(1);
  }
}

runTestSuite().catch((err) => {
  console.error('Fatal error running M3 test suite:', err);
  process.exit(1);
});
