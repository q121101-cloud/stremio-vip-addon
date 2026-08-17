'use strict';

/**
 * ==============================================================================
 *  VIP Movies Addon — tests/test_m3_routing_404_adversarial.js
 *  Challenger 1 Empirical Stress Test Suite for Milestone 3:
 *  Adversarial Routing, 404 Prevention, & 22 Catalogs K20 Standard
 * ==============================================================================
 */

const http = require('http');
const axios = require('axios');
const app = require('../src/index');
const { ALL_CATALOGS, MANIFEST } = require('../src/manifest');
const { encodeConfig, DEFAULT_CONFIG } = require('../src/config');

const GREEN  = '\x1b[32m';
const RED    = '\x1b[31m';
const CYAN   = '\x1b[36m';
const YELLOW = '\x1b[33m';
const BOLD   = '\x1b[1m';
const RESET  = '\x1b[0m';
const GRAY   = '\x1b[90m';

class ChallengerRunner {
  constructor() {
    this.passed = 0;
    this.failed = 0;
    this.failures = [];
  }

  pass(msg) {
    console.log(`  ${GREEN}✅ PASS:${RESET} ${msg}`);
    this.passed++;
  }

  fail(msg, err) {
    const errorStr = err ? (err.message || String(err)) : '';
    console.log(`  ${RED}❌ FAIL:${RESET} ${msg}`);
    if (errorStr) console.log(`     ${GRAY}${errorStr}${RESET}`);
    this.failed++;
    this.failures.push({ msg, err: errorStr });
  }

  assert(cond, msg, err) {
    if (cond) {
      this.pass(msg);
      return true;
    } else {
      this.fail(msg, err || new Error('Assertion failed: condition evaluated to false'));
      return false;
    }
  }
}

async function runSuite() {
  const runner = new ChallengerRunner();
  const startTime = Date.now();

  console.log(`\n${BOLD}${CYAN}╔══════════════════════════════════════════════════════════════════════════════╗${RESET}`);
  console.log(`${BOLD}${CYAN}║     ⚔️  CHALLENGER 1: M3 ROUTING & 404 PREVENTION ADVERSARIAL STRESS SUITE   ║${RESET}`);
  console.log(`${BOLD}${CYAN}║     Adversarial Routes | Malformed Tokens | 22 Catalogs | 404 Prevention    ║${RESET}`);
  console.log(`${BOLD}${CYAN}╚══════════════════════════════════════════════════════════════════════════════╝${RESET}\n`);

  // Start ephemeral server
  const server = http.createServer(app);
  await new Promise((resolve, reject) => {
    server.listen(0, '127.0.0.1', () => resolve());
    server.on('error', reject);
  });

  const port = server.address().port;
  const baseUrl = `http://127.0.0.1:${port}`;
  console.log(`${GRAY}ℹ️  Test Server online at:${RESET} ${BOLD}${baseUrl}${RESET}\n`);

  const client = axios.create({
    baseURL: baseUrl,
    timeout: 25000,
    validateStatus: () => true, // Don't throw on non-2xx status codes
  });

  const validToken = encodeConfig(DEFAULT_CONFIG);

  try {
    // ══════════════════════════════════════════════════════════════════════════
    //  SECTION 1: MANIFEST 22 CATALOGS & ADVERSARIAL ROUTE RESOLUTION
    // ══════════════════════════════════════════════════════════════════════════
    console.log(`${BOLD}${CYAN}══ SECTION 1: Manifest 22 Catalogs & Adversarial Route Resolution ══${RESET}`);

    // 1.1 Standard /manifest.json
    const r1 = await client.get('/manifest.json');
    runner.assert(r1.status === 200, 'GET /manifest.json returns HTTP 200');
    runner.assert(r1.headers['access-control-allow-origin'] === '*', 'GET /manifest.json has Access-Control-Allow-Origin: *');
    runner.assert(r1.data && typeof r1.data === 'object', 'GET /manifest.json returns JSON object');
    runner.assert(r1.data.id === 'org.vipmovies.stremio.addon', 'GET /manifest.json has correct addon ID');
    runner.assert(Array.isArray(r1.data.catalogs), 'GET /manifest.json catalogs is an array');
    runner.assert(r1.data.catalogs.length === 22, `GET /manifest.json contains exactly 22 catalogs (got ${r1.data.catalogs.length})`);

    // Verify all 22 catalog IDs are present in manifest
    const expectedCatalogIds = ALL_CATALOGS.map(c => c.id);
    const actualCatalogIds = (r1.data.catalogs || []).map(c => c.id);
    const missingCatalogs = expectedCatalogIds.filter(id => !actualCatalogIds.includes(id));
    runner.assert(missingCatalogs.length === 0, `All 22 standard catalog IDs present in /manifest.json (missing: ${missingCatalogs.join(', ') || 'none'})`);

    // Verify resources & idPrefixes
    runner.assert(Array.isArray(r1.data.idPrefixes) && r1.data.idPrefixes.includes('tt'), 'idPrefixes includes "tt" for IMDb lookup');
    runner.assert(r1.data.idPrefixes.includes('kkphim:'), 'idPrefixes includes "kkphim:"');
    runner.assert(r1.data.idPrefixes.includes('vsmov:'), 'idPrefixes includes "vsmov:"');
    runner.assert(r1.data.idPrefixes.includes('nguonc:'), 'idPrefixes includes "nguonc:"');
    runner.assert(r1.data.idPrefixes.includes('stp:'), 'idPrefixes includes "stp:"');
    runner.assert(r1.data.idPrefixes.includes('hh3d:'), 'idPrefixes includes "hh3d:"');
    runner.assert(r1.data.idPrefixes.includes('yan:'), 'idPrefixes includes "yan:"');
    runner.assert(r1.data.idPrefixes.includes('clbpx:'), 'idPrefixes includes "clbpx:"');

    // 1.2 Adversarial Manifest Routes (must return HTTP 200 with valid fallback manifest)
    const adversarialManifestRoutes = [
      `/${validToken}/manifest.json`,
      '/%20/manifest.json',
      '/undefined/manifest.json',
      '/null/manifest.json',
      '/[object%20Object]/manifest.json',
      '/%7B%7D/manifest.json',
      '/%2520/manifest.json',
      '/manifest.json?config=undefined',
      '/manifest.json?config=null',
      '/manifest.json?config=%20',
      '/manifest.json?config={}',
      '/manifest.json?config=%7B%22providers%22%3A%5B%22nonexistent_prov%22%5D%7D',
    ];

    for (const route of adversarialManifestRoutes) {
      const res = await client.get(route);
      runner.assert(
        res.status === 200,
        `Adversarial route GET ${route} → HTTP 200 (status: ${res.status})`
      );
      runner.assert(
        res.data && res.data.id === 'org.vipmovies.stremio.addon' && Array.isArray(res.data.catalogs),
        `Adversarial route GET ${route} → returns valid Stremio manifest with catalogs`
      );
    }

    // ══════════════════════════════════════════════════════════════════════════
    //  SECTION 2: CATALOG ROUTING & 404 PREVENTION ADVERSARIAL SUITE
    // ══════════════════════════════════════════════════════════════════════════
    console.log(`\n${BOLD}${CYAN}══ SECTION 2: Catalog Routing & 404 Prevention Adversarial Probing ══${RESET}`);

    // 2.1 All 22 Catalogs Direct Invocation (Root and :config prefixed)
    console.log(`  ${BOLD}▶ Testing all 22 Catalogs with and without /:config/ ...${RESET}`);
    for (const cat of ALL_CATALOGS) {
      const rootUrl = `/catalog/${cat.type}/${cat.id}.json`;
      const configUrl = `/${validToken}/catalog/${cat.type}/${cat.id}.json`;

      const [resRoot, resConfig] = await Promise.all([
        client.get(rootUrl),
        client.get(configUrl),
      ]);

      runner.assert(
        resRoot.status === 200 && resRoot.data && Array.isArray(resRoot.data.metas),
        `GET ${rootUrl} → HTTP 200 with { metas: [...] } (length: ${resRoot.data?.metas?.length ?? 'N/A'})`
      );

      runner.assert(
        resConfig.status === 200 && resConfig.data && Array.isArray(resConfig.data.metas),
        `GET ${configUrl} → HTTP 200 with { metas: [...] } (length: ${resConfig.data?.metas?.length ?? 'N/A'})`
      );
    }

    // 2.2 Malformed & Adversarial Catalog Routes (404 Prevention)
    console.log(`\n  ${BOLD}▶ Testing malformed and adversarial catalog routes...${RESET}`);
    const adversarialCatalogRoutes = [
      '/catalog/movie/nonexistent.json',
      '/catalog/series/nonexistent.json',
      '/catalog/movie/nonexistent/search=test.json',
      '/catalog/movie/nonexistent/genre=Action.json',
      '/catalog/movie/nonexistent/skip=50.json',
      '/catalog/movie/nonexistent/search%3Dtest.json',
      '/catalog/movie/nonexistent/search=test&skip=100.json',
      '/catalog/movie/nonexistent/&&&&===malformed===&&&.json',
      `/${validToken}/catalog/movie/nonexistent.json`,
      `/${validToken}/catalog/movie/nonexistent/search=test.json`,
      `/${validToken}/catalog/movie/nonexistent/skip=50.json`,
      `/${validToken}/catalog/movie/nonexistent/search%3Dtest.json`,
      '/%20/catalog/movie/nonexistent/skip=50.json',
      '/undefined/catalog/movie/nonexistent/skip=50.json',
      '/null/catalog/movie/nonexistent/skip=50.json',
      '/[object%20Object]/catalog/movie/nonexistent/skip=50.json',
      '/%7B%7D/catalog/movie/nonexistent/skip=50.json',
      '/%20/catalog/movie/kkphim-movie-latest.json',
      '/undefined/catalog/movie/kkphim-movie-latest.json',
      '/catalog/unknown_type/kkphim-movie-latest.json',
      '/catalog/movie/kkphim-movie-latest/search=.json',
      '/catalog/movie/kkphim-movie-latest/genre=.json',
      '/catalog/movie/kkphim-movie-latest/skip=abc.json',
      '/catalog/movie/kkphim-movie-latest/skip=-1.json',
      '/catalog/movie/kkphim-movie-latest/skip=9999999999.json',
      '/catalog/movie/kkphim-movie-latest/search=%20%20%20.json',
      '/catalog/movie/kkphim-movie-latest/search=%F0%9F%94%A5%F0%9F%9A%80.json',
      '/catalog/movie/kkphim-movie-latest/genre=%E1%BA%A2o%20Ma%20Canada.json',
      '/catalog/movie/kkphim-movie-latest/search=%27%20OR%201%3D1%20--.json',
      '/catalog/movie/kkphim-movie-latest/search=%3Cscript%3Ealert(1)%3C%2Fscript%3E.json',
      '/catalog/movie/kkphim-movie-latest/search=' + 'a'.repeat(500) + '.json',
    ];

    for (const route of adversarialCatalogRoutes) {
      const res = await client.get(route);
      const is200 = res.status === 200;
      const hasMetasArray = res.data && Array.isArray(res.data.metas);
      runner.assert(
        is200 && hasMetasArray,
        `Catalog 404 Prevention: GET ${route.slice(0, 70)}${route.length > 70 ? '...' : ''} → HTTP ${res.status} { metas: Array(${res.data?.metas?.length ?? 0}) }`
      );
    }

    // ══════════════════════════════════════════════════════════════════════════
    //  SECTION 3: META ROUTING & 404 PREVENTION ADVERSARIAL SUITE
    // ══════════════════════════════════════════════════════════════════════════
    console.log(`\n${BOLD}${CYAN}══ SECTION 3: Meta Routing & 404 Prevention Adversarial Probing ══${RESET}`);

    const adversarialMetaRoutes = [
      '/meta/movie/invalid:id.json',
      '/meta/series/invalid:id.json',
      '/meta/movie/nonexistent-slug-xyz123.json',
      '/meta/movie/kkphim:nonexistent-slug-xyz123.json',
      '/meta/movie/nguonc:nonexistent-slug-xyz123.json',
      '/meta/movie/vsmov:nonexistent-slug-xyz123.json',
      '/meta/movie/stp:nonexistent-slug-xyz123.json',
      '/meta/movie/hh3d:nonexistent-slug-xyz123.json',
      '/meta/movie/yan:nonexistent-slug-xyz123.json',
      '/meta/movie/clbpx:nonexistent-slug-xyz123.json',
      '/meta/movie/tt9999999999.json',
      '/meta/movie/invalid%3Aid.json',
      '/meta/movie/%20.json',
      '/meta/movie/undefined.json',
      '/meta/movie/null.json',
      '/meta/movie/%27%20OR%201%3D1%20--.json',
      '/meta/movie/%3Cscript%3Ealert(1)%3C%2Fscript%3E.json',
      `/${validToken}/meta/movie/invalid:id.json`,
      `/${validToken}/meta/movie/nonexistent-slug-xyz123.json`,
      '/%20/meta/movie/invalid:id.json',
      '/undefined/meta/movie/invalid:id.json',
      '/null/meta/movie/invalid:id.json',
      '/[object%20Object]/meta/movie/invalid:id.json',
      '/%7B%7D/meta/movie/invalid:id.json',
      '/meta/movie/nguonc:nu-hiep-ruy-bang.json', // Valid item
      `/${validToken}/meta/movie/nguonc:nu-hiep-ruy-bang.json`, // Valid item config
    ];

    for (const route of adversarialMetaRoutes) {
      const res = await client.get(route);
      const is200 = res.status === 200;
      const hasMetaProp = res.data && ('meta' in res.data);
      runner.assert(
        is200 && hasMetaProp,
        `Meta 404 Prevention: GET ${route} → HTTP ${res.status} (meta: ${res.data?.meta ? res.data.meta.name || 'Object' : 'null'})`
      );
    }

    // ══════════════════════════════════════════════════════════════════════════
    //  SECTION 4: STREAM ROUTING & 404 PREVENTION ADVERSARIAL SUITE
    // ══════════════════════════════════════════════════════════════════════════
    console.log(`\n${BOLD}${CYAN}══ SECTION 4: Stream Routing & 404 Prevention Adversarial Probing ══${RESET}`);

    const adversarialStreamRoutes = [
      '/stream/movie/invalid:id.json',
      '/stream/series/invalid:1:1.json',
      '/stream/movie/nonexistent-slug-xyz123.json',
      '/stream/movie/kkphim:nonexistent-slug-xyz123.json',
      '/stream/series/kkphim:nonexistent-slug-xyz123:1:1.json',
      '/stream/movie/nguonc:nonexistent-slug-xyz123.json',
      '/stream/movie/vsmov:nonexistent-slug-xyz123.json',
      '/stream/movie/stp:nonexistent-slug-xyz123.json',
      '/stream/movie/hh3d:nonexistent-slug-xyz123.json',
      '/stream/movie/yan:nonexistent-slug-xyz123.json',
      '/stream/movie/clbpx:nonexistent-slug-xyz123.json',
      '/stream/movie/tt9999999999.json',
      '/stream/series/tt9999999999:1:1.json',
      '/stream/series/invalid%3A1%3A1.json',
      '/stream/movie/%20.json',
      '/stream/movie/undefined.json',
      '/stream/movie/null.json',
      '/stream/movie/%27%20OR%201%3D1%20--.json',
      '/stream/movie/%3Cscript%3Ealert(1)%3C%2Fscript%3E.json',
      `/${validToken}/stream/series/invalid:1:1.json`,
      `/${validToken}/stream/movie/nonexistent.json`,
      '/%20/stream/series/invalid:1:1.json',
      '/undefined/stream/series/invalid:1:1.json',
      '/null/stream/series/invalid:1:1.json',
      '/[object%20Object]/stream/series/invalid:1:1.json',
      '/%7B%7D/stream/series/invalid:1:1.json',
    ];

    for (const route of adversarialStreamRoutes) {
      const res = await client.get(route);
      const is200 = res.status === 200;
      const hasStreamsArray = res.data && Array.isArray(res.data.streams);
      runner.assert(
        is200 && hasStreamsArray,
        `Stream 404 Prevention: GET ${route} → HTTP ${res.status} { streams: Array(${res.data?.streams?.length ?? 0}) }`
      );
    }

    // ══════════════════════════════════════════════════════════════════════════
    //  SECTION 5: LIVE STREAM RESOLUTION & IN-APP PLAYBACK INVARIANTS
    // ══════════════════════════════════════════════════════════════════════════
    console.log(`\n${BOLD}${CYAN}══ SECTION 5: Live Stream Aggregator & Protocol Invariants ══${RESET}`);

    const validStreamRoutes = [
      '/stream/movie/nguonc:nu-hiep-ruy-bang.json',
      `/${validToken}/stream/movie/nguonc:nu-hiep-ruy-bang.json`,
    ];

    for (const route of validStreamRoutes) {
      const res = await client.get(route);
      runner.assert(res.status === 200, `GET ${route} → HTTP 200`);
      runner.assert(Array.isArray(res.data.streams) && res.data.streams.length > 0, `GET ${route} returned streams (count: ${res.data?.streams?.length})`);

      for (let i = 0; i < (res.data.streams || []).length; i++) {
        const stream = res.data.streams[i];
        runner.assert(typeof stream.name === 'string', `Stream #${i + 1} has name string`);
        runner.assert(typeof stream.title === 'string' && !stream.title.includes('#'), `Stream #${i + 1} has sanitized title without '#'`);
        runner.assert(stream.url && !stream.externalUrl, `Stream #${i + 1} has url and NO externalUrl`);
        runner.assert(!('externalUrl' in stream), `Stream #${i + 1} has no externalUrl property`);
      }
    }

    // ══════════════════════════════════════════════════════════════════════════
    //  SECTION 6: CONFIGURATOR DASHBOARD & STATIC ROUTES
    // ══════════════════════════════════════════════════════════════════════════
    console.log(`\n${BOLD}${CYAN}══ SECTION 6: Configurator Dashboard & Static Route Invariants ══${RESET}`);

    const resDash = await client.get('/');
    runner.assert(resDash.status === 200, 'GET / returns HTTP 200');
    runner.assert(typeof resDash.data === 'string' && resDash.data.includes('VIP Movies'), 'GET / HTML includes "VIP Movies"');
    runner.assert(resDash.data.includes('Q121101'), 'GET / HTML includes brand signature "Q121101"');
    runner.assert(resDash.data.includes('vsmov') && resDash.data.includes('kkphim') && resDash.data.includes('nguonc') && resDash.data.includes('stp') && resDash.data.includes('hh3d') && resDash.data.includes('yan') && resDash.data.includes('clbpx'), 'GET / HTML includes all 7 provider options');

    const resHealth = await client.get('/health');
    runner.assert(resHealth.status === 200, 'GET /health returns HTTP 200');
    runner.assert(resHealth.data && resHealth.data.status === 'ok', 'GET /health returns status: ok');

  } finally {
    server.close();
  }

  const duration = ((Date.now() - startTime) / 1000).toFixed(2);
  console.log(`\n${BOLD}${CYAN}══════════════════════════════════════════════════════════════════════════════${RESET}`);
  console.log(`${BOLD}${CYAN}🏁 CHALLENGER 1 M3 SUITE SUMMARY: ${runner.passed} PASSED, ${runner.failed} FAILED (${duration}s)${RESET}`);
  console.log(`${BOLD}${CYAN}══════════════════════════════════════════════════════════════════════════════${RESET}\n`);

  if (runner.failed > 0) {
    console.error(`${RED}FAILURES DETECTED:${RESET}`);
    for (const f of runner.failures) {
      console.error(`  - ${f.msg}: ${f.err}`);
    }
    process.exit(1);
  }
}

runSuite().catch((err) => {
  console.error('[Fatal Error]', err);
  process.exit(1);
});
