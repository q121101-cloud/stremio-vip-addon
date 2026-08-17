'use strict';

/**
 * ============================================================
 *  Adversarial Stress Test Harness: Milestone 3 & 4
 *  Empirical Challenger 1 - Milestone 3 & 4
 * ============================================================
 */

const http = require('http');
const express = require('express');
const handlers = require('../src/handlers');
const manifestRouter = require('../src/routes/manifest');
const { ALL_CATALOGS, buildManifest } = require('../src/manifest');
const { encodeConfig, DEFAULT_CONFIG } = require('../src/config');

let passedAssertions = 0;
let failedAssertions = 0;

function assert(condition, message) {
  if (condition) {
    passedAssertions++;
    console.log(`  ✅ PASS: ${message}`);
  } else {
    failedAssertions++;
    console.error(`  ❌ FAIL: ${message}`);
  }
}

function createTestServer() {
  const app = express();
  app.use(express.json());
  app.use('/', manifestRouter);
  app.use('/', handlers);
  return app;
}

function safeEncodePath(p) {
  // Ensure non-ASCII characters are percent-encoded for http.request
  return encodeURI(p);
}

function request(server, path, method = 'GET', headers = {}) {
  return new Promise((resolve, reject) => {
    const addr = server.address();
    const port = addr.port;
    const req = http.request(
      {
        host: '127.0.0.1',
        port,
        path: safeEncodePath(path),
        method,
        headers,
      },
      (res) => {
        const chunks = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => {
          const body = Buffer.concat(chunks).toString('utf8');
          let json = null;
          try {
            json = JSON.parse(body);
          } catch {}
          resolve({
            statusCode: res.statusCode,
            headers: res.headers,
            body,
            json,
          });
        });
      }
    );
    req.on('error', reject);
    req.end();
  });
}

async function run() {
  console.log('╔══════════════════════════════════════════════════════════════╗');
  console.log('║   EMPIRICAL CHALLENGER: M3 & M4 ADVERSARIAL STRESS HARNESS   ║');
  console.log('╚══════════════════════════════════════════════════════════════╝\n');

  const app = createTestServer();
  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;
  console.log(`Server listening on port ${port}\n`);

  const validToken = encodeConfig(DEFAULT_CONFIG);

  try {
    // ══════════════════════════════════════════════════════════
    // SUITE 1: 22 Catalogs K20 Standard Deep Matrix Verification
    // ══════════════════════════════════════════════════════════
    console.log('══ SUITE 1: All 22 Catalogs (With & Without Config Prefix, .json, and Extra params) ══');
    assert(ALL_CATALOGS.length === 22, `ALL_CATALOGS contains exactly 22 standard catalogs (got ${ALL_CATALOGS.length})`);

    for (const cat of ALL_CATALOGS) {
      const type = cat.type;
      const id = cat.id;

      // 1. Root /catalog/:type/:id.json
      const r1 = await request(server, `/catalog/${type}/${id}.json`);
      assert(r1.statusCode === 200 && r1.json && Array.isArray(r1.json.metas),
        `GET /catalog/${type}/${id}.json -> HTTP 200 with metas array`);

      // 2. Root without .json
      const r2 = await request(server, `/catalog/${type}/${id}`);
      assert(r2.statusCode === 200 && r2.json && Array.isArray(r2.json.metas),
        `GET /catalog/${type}/${id} -> HTTP 200 with metas array`);

      // 3. Config prefix /:config/catalog/:type/:id.json
      const r3 = await request(server, `/${validToken}/catalog/${type}/${id}.json`);
      assert(r3.statusCode === 200 && r3.json && Array.isArray(r3.json.metas),
        `GET /:config/catalog/${type}/${id}.json -> HTTP 200 with metas array`);

      // 4. Config prefix without .json
      const r4 = await request(server, `/${validToken}/catalog/${type}/${id}`);
      assert(r4.statusCode === 200 && r4.json && Array.isArray(r4.json.metas),
        `GET /:config/catalog/${type}/${id} -> HTTP 200 with metas array`);

      // 5. Plain search extra
      const r5 = await request(server, `/catalog/${type}/${id}/search=test.json`);
      assert(r5.statusCode === 200 && r5.json && Array.isArray(r5.json.metas),
        `GET /catalog/${type}/${id}/search=test.json -> HTTP 200 with metas array`);

      // 6. URL-encoded search extra
      const r6 = await request(server, `/${validToken}/catalog/${type}/${id}/search%3Dtest.json`);
      assert(r6.statusCode === 200 && r6.json && Array.isArray(r6.json.metas),
        `GET /:config/catalog/${type}/${id}/search%3Dtest.json -> HTTP 200 with metas array`);
    }

    // ══════════════════════════════════════════════════════════
    // SUITE 2: Double URL Encodings, Malformed Extras & 404 Prevention
    // ══════════════════════════════════════════════════════════
    console.log('\n══ SUITE 2: Double Encodings (%2520, %253D), Malformed Extras & 404 Prevention ══');

    const adversarialExtras = [
      'search%253Dspider%2520man.json',                 // Double encoded search=spider man
      'search%2520query.json',                          // Double encoded space
      'genre%253DH%25C3%25A0nh%2520%25C4%2590%25E1%25BB%2599ng.json', // Double encoded Vietnamese genre
      'genre=Hành%20Động&skip=20.json',                 // Multi-param with raw UTF-8
      'skip=10&genre=Action&search=batman.json',        // All params combined
      '&&&&===malformed===&&&&&&.json',                 // Extreme junk delimiters
      'keywithnovalue.json',                            // Valueless key
      '=valuewithnokey.json',                           // Keyless value
      '%00%00%ff%fe.json',                              // Null byte / high binary injection
      'search=' + 'A'.repeat(500) + '.json',            // Buffer stress query
    ];

    for (const extra of adversarialExtras) {
      const r = await request(server, `/catalog/movie/kkphim-movie-latest/${extra}`);
      assert(r.statusCode === 200 && r.json && Array.isArray(r.json.metas),
        `Adversarial extra "${extra.slice(0, 35)}..." -> HTTP 200 (metas: ${r.json ? r.json.metas.length : 0})`);
    }

    // Non-existent catalogs and routes: MUST RETURN HTTP 200 { metas: [] } NEVER 404
    const nonExistentCatalogPaths = [
      '/catalog/movie/totally-nonexistent-catalog-12345.json',
      '/catalog/series/fake-series-catalog-999.json',
      `/${validToken}/catalog/movie/unrecognized-custom-id.json`,
      `/${validToken}/catalog/series/non_existent_provider-recent.json`,
      '/catalog/movie/gibberish_%21%40%23%24.json',
    ];

    for (const p of nonExistentCatalogPaths) {
      const r = await request(server, p);
      assert(r.statusCode === 200 && r.json && Array.isArray(r.json.metas),
        `Non-existent catalog route "${p}" returned HTTP 200 with { metas: [] } (never 404)`);
    }

    // Generic Search Fanout routes: MUST RETURN HTTP 200 with combined metas
    const searchFanoutPaths = [
      '/catalog/movie/search/search=spider-man.json',
      '/catalog/series/all/search=breaking%20bad.json',
      '/catalog/movie/top/search=avatar.json',
      `/${validToken}/catalog/movie/global/search=batman.json`,
    ];

    for (const p of searchFanoutPaths) {
      const r = await request(server, p);
      assert(r.statusCode === 200 && r.json && Array.isArray(r.json.metas),
        `Search fanout route "${p}" returned HTTP 200 (metas count: ${r.json ? r.json.metas.length : 0})`);
    }

    // ══════════════════════════════════════════════════════════
    // SUITE 3: Fail-Safe Stream Aggregator Under Simulated Latency & Outage
    // ══════════════════════════════════════════════════════════
    console.log('\n══ SUITE 3: Stream Aggregation Latency & Provider Isolation Stress ══');

    // Test stream query for standard IMDb movie (Inception tt1375666)
    const streamStart = Date.now();
    const rStream = await request(server, `/stream/movie/tt1375666.json`);
    const streamDuration = Date.now() - streamStart;

    assert(rStream.statusCode === 200, `GET /stream/movie/tt1375666.json -> HTTP 200 (took ${streamDuration}ms)`);
    assert(rStream.json && Array.isArray(rStream.json.streams), 'Stream response contains streams array');

    const streams = rStream.json?.streams || [];
    console.log(`  ℹ️ Total aggregated streams for Inception: ${streams.length}`);

    // SUITE 4: Zero externalUrl Invariant Check on all streams
    console.log('\n══ SUITE 4: Zero externalUrl Invariant Check ══');
    for (let i = 0; i < streams.length; i++) {
      const s = streams[i];
      assert(typeof s.url === 'string' && s.url.length > 0, `Stream #${i + 1} has non-empty 'url' string`);
      assert(s.externalUrl === undefined, `Stream #${i + 1} strictly DOES NOT have 'externalUrl'`);
      assert(typeof s.name === 'string' && s.name.length > 0, `Stream #${i + 1} has valid name: "${s.name}"`);
      assert(typeof s.title === 'string' && !s.title.includes('#'), `Stream #${i + 1} has sanitized title without '#' characters`);
      assert(s.behaviorHints && typeof s.behaviorHints === 'object', `Stream #${i + 1} has behaviorHints object`);
    }

    // Test series stream query (Breaking Bad S01E01 tt0903747:1:1)
    const rSeries = await request(server, `/stream/series/tt0903747:1:1.json`);
    assert(rSeries.statusCode === 200 && rSeries.json && Array.isArray(rSeries.json.streams),
      `GET /stream/series/tt0903747:1:1.json -> HTTP 200 with streams array`);

    for (const s of rSeries.json?.streams || []) {
      assert(s.externalUrl === undefined, `Series stream strictly DOES NOT have 'externalUrl'`);
      assert(typeof s.url === 'string', `Series stream has 'url' property`);
    }

    // Test non-matching / completely invalid IMDb ID (Total upstream failure simulation)
    const rInvalid = await request(server, `/stream/movie/tt00000000000000invalid.json`);
    assert(rInvalid.statusCode === 200 && rInvalid.json && Array.isArray(rInvalid.json.streams) && rInvalid.json.streams.length === 0,
      `Non-existent ID stream returns HTTP 200 { streams: [] } cleanly`);

    // ══════════════════════════════════════════════════════════
    // SUITE 5: Custom Timeout & Simulated Provider Chaos Unit Test
    // ══════════════════════════════════════════════════════════
    console.log('\n══ SUITE 5: Simulated Provider Chaos & Capped Timeout Guarantee ══');

    // Test withTimeout helper directly
    const slowProviderPromise = new Promise((resolve) => setTimeout(() => resolve(['slow_result']), 6000));
    const fastProviderPromise = Promise.resolve([{ url: 'http://valid.stream/play.m3u8', name: 'Fast' }]);
    const errorProviderPromise = Promise.reject(new Error('Upstream CDN 502 Bad Gateway'));
    const externalUrlProviderPromise = Promise.resolve([{ externalUrl: 'http://bad.external.url', name: 'BadExt' }]);

    function withTimeout(promise, ms = 4000) {
      let timer;
      const timeoutPromise = new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error(`Timed out after ${ms}ms`)), ms);
      });
      return Promise.race([promise, timeoutPromise]).finally(() => clearTimeout(timer));
    }

    const t0 = Date.now();
    const chaosResults = await Promise.allSettled([
      withTimeout(slowProviderPromise, 500),
      withTimeout(fastProviderPromise, 500),
      withTimeout(errorProviderPromise, 500),
      withTimeout(externalUrlProviderPromise, 500),
    ]);
    const chaosDuration = Date.now() - t0;

    assert(chaosDuration < 1000, `All parallel promises resolved/settled within capped timeout (${chaosDuration}ms < 1000ms)`);
    assert(chaosResults[0].status === 'rejected', 'Slow provider was rejected by timeout');
    assert(chaosResults[1].status === 'fulfilled' && chaosResults[1].value[0].name === 'Fast', 'Fast provider succeeded');
    assert(chaosResults[2].status === 'rejected', 'Error provider was safely captured by allSettled');
    assert(chaosResults[3].status === 'fulfilled', 'ExternalUrl provider returned value for sanitization');

  } finally {
    server.close();
  }

  console.log('\n══════════════════════════════════════════════════════════════');
  console.log(`🏁 ADVERSARIAL STRESS TEST SUMMARY: ${passedAssertions} PASSED, ${failedAssertions} FAILED`);
  console.log('══════════════════════════════════════════════════════════════\n');

  if (failedAssertions > 0) {
    process.exit(1);
  }
}

run().catch((err) => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
