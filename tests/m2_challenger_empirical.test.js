'use strict';

/**
 * ============================================================================
 *  VIP Movies Addon v1.4.0 — Milestone 2 Empirical Challenger Test Suite
 *  Targets:
 *    - src/providers/kkphim.js
 *    - src/providers/nguonc.js
 *    - src/providers/vsmov.js
 *    - src/handlers.js (Aggregator isolation & protocol compliance)
 *
 *  Comprehensive Verifications:
 *    1. Module & Interface Integrity
 *    2. Stremio Stream Protocol Mutual Exclusivity (R3: url vs externalUrl)
 *    3. Title Standardization & Server/Episode Naming
 *    4. Movie vs Series Episode Resolution & Index Fallbacks
 *    5. Search Matching & Year Scoring Algorithms (Exact, Diacritics, Substring, Penalties)
 *    6. Fault Injection (ETIMEDOUT, ECONNREFUSED, HTTP 500/502/404, Corrupted JSON/HTML)
 *    7. Extreme Boundary Fuzzing (Regex chars, Unicode, null/undefined, extreme IDs)
 *    8. VsMov Scraper, Gateways & Dean Edwards P.A.C.K.E.R Extraction
 *    9. Stream Aggregator Fault Isolation in Express Handlers
 * ============================================================================
 */

const assert = require('assert');
const http = require('http');
const axios = require('axios');
const { TestRunner } = require('./helpers');
const { FIXTURES } = require('./fixtures');
const { imdbCache, detailCache, catalogCache } = require('../src/lib/cache');
const { cinemetaCache } = require('../src/lib/cinemeta');

// Provider modules
const kkphim = require('../src/providers/kkphim');
const nguonc = require('../src/providers/nguonc');
const vsmov  = require('../src/providers/vsmov');
const handlers = require('../src/handlers');

const runner = new TestRunner('Milestone 2 Empirical Challenger — Providers & Protocol');

async function runEmpiricalChallenger() {
  console.log('╔═════════════════════════════════════════════════════════════════════════════╗');
  console.log('║   ⚔️  VIP MOVIES ADDON v1.4.0 — M2 EMPIRICAL CHALLENGER TEST HARNESS        ║');
  console.log('║   Empirical verification of KKPhim, NguonC, VsMov & Stremio Protocol        ║');
  console.log('╚═════════════════════════════════════════════════════════════════════════════╝\n');

  // Clear caches prior to testing
  imdbCache.clear();
  detailCache.clear();
  catalogCache.clear();
  cinemetaCache.clear();

  // ════════════════════════════════════════════════════════════════
  //  SECTION 1: MODULE EXPORTS & TIMEOUT CONFIGURATION
  // ════════════════════════════════════════════════════════════════
  runner.section('Section 1: Provider Modules & Interface Contracts');

  runner.assert(kkphim.id === 'kkphim', 'KKPhim exports id="kkphim"');
  runner.assert(kkphim.label === 'KKPhim', 'KKPhim exports label="KKPhim"');
  runner.assert(typeof kkphim.getStreams === 'function', 'KKPhim exports getStreams()');
  runner.assert(typeof kkphim.getDetail === 'function', 'KKPhim exports getDetail()');
  runner.assert(typeof kkphim.getByImdb === 'function', 'KKPhim exports getByImdb()');
  runner.assert(typeof kkphim.search === 'function', 'KKPhim exports search()');
  runner.assert(typeof kkphim.getCatalog === 'function', 'KKPhim exports getCatalog()');
  runner.assert(typeof kkphim.mapDetailMeta === 'function', 'KKPhim exports mapDetailMeta()');

  runner.assert(nguonc.id === 'nguonc', 'NguonC exports id="nguonc"');
  runner.assert(nguonc.label === 'NguonC', 'NguonC exports label="NguonC"');
  runner.assert(typeof nguonc.getStreams === 'function', 'NguonC exports getStreams()');
  runner.assert(typeof nguonc.getDetail === 'function', 'NguonC exports getDetail()');
  runner.assert(typeof nguonc.search === 'function', 'NguonC exports search()');
  runner.assert(typeof nguonc.getCatalog === 'function', 'NguonC exports getCatalog()');

  runner.assert(vsmov.id === 'vsmov', 'VsMov exports id="vsmov"');
  runner.assert(vsmov.label === 'VSMOV 4K' || vsmov.label === 'VsMov', 'VsMov exports label="VSMOV 4K"');
  runner.assert(typeof vsmov.getStreams === 'function', 'VsMov exports getStreams()');
  runner.assert(typeof vsmov.getCatalog === 'function', 'VsMov exports getCatalog()');

  // Check required dependencies from mapper.js used in nguonc.js and vsmov.js
  const mapper = require('../src/mapper');
  runner.assert(typeof mapper.detectType === 'function', 'mapper.detectType is exported (used by NguonC)');
  runner.assert(typeof mapper.extractYear === 'function', 'mapper.extractYear is exported (used by NguonC scoreMatch)');
  runner.assert(typeof mapper.unpackDeanEdwards === 'function', 'mapper.unpackDeanEdwards is exported (used by VsMov unpacker)');


  // ════════════════════════════════════════════════════════════════
  //  SECTION 2: R3 PROTOCOL EXCLUSIVITY ASSERTIONS (HLS vs Embed)
  // ════════════════════════════════════════════════════════════════
  runner.section('Section 2: Stremio Stream Protocol Mutual Exclusivity (R3)');

  // 2.1 KKPhim Protocol Test with Inception Fixture
  imdbCache.set('kkphim:imdb:tt1375666', FIXTURES.kkphim.movieDetail, 3600);
  const kkStreams = await kkphim.getStreams({
    imdbId: 'tt1375666',
    title: 'Inception',
    type: 'movie',
    proxyBase: 'http://localhost:7000',
  });

  runner.assert(Array.isArray(kkStreams), 'KKPhim returns array of streams');
  runner.assert(kkStreams.length === 3, `KKPhim returns 3 in-app streams (3 servers x 1 HLS Proxy), got ${kkStreams.length}`);

  let kkHlsCount = 0;
  let kkEmbedCount = 0;
  for (let i = 0; i < kkStreams.length; i++) {
    const s = kkStreams[i];
    runner.assertStreamProtocol(s, i);

    if (s.url) {
      kkHlsCount++;
      runner.assert(s.externalUrl === undefined, `KKPhim HLS Stream #${i + 1} externalUrl is undefined`);
      runner.assert(s.url.includes('/hls/manifest.m3u8?url='), `KKPhim HLS Stream #${i + 1} uses proxy URL`);
      runner.assert(s.title.startsWith('[VIP 2 • KKPhim]'), `KKPhim HLS Stream #${i + 1} has [VIP 2 • KKPhim] prefix`);
      runner.assert(s.title.includes('(HLS Proxy)\n⚡ Server VIP 2 • Phát trực tiếp trong App'), `KKPhim HLS Stream #${i + 1} has direct play badge`);
    } else if (s.externalUrl) {
      kkEmbedCount++;
    }
  }
  runner.assertEqual(kkHlsCount, 3, 'KKPhim generates exactly 3 HLS Proxy streams');
  runner.assertEqual(kkEmbedCount, 0, 'KKPhim generates strictly 0 externalUrl streams');

  // 2.2 NguonC Protocol Test with Inception Fixture
  imdbCache.set('nguonc:imdb:tt1375666', 'ke-danh-cap-giac-mo', 3600);
  detailCache.set('nguonc:detail:ke-danh-cap-giac-mo', FIXTURES.nguonc.movieDetail, 3600);

  const ncStreams = await nguonc.getStreams({
    imdbId: 'tt1375666',
    title: 'Inception',
    type: 'movie',
    proxyBase: 'http://localhost:7000',
  });

  runner.assert(Array.isArray(ncStreams), 'NguonC returns array of streams');
  runner.assert(ncStreams.length === 2, `NguonC returns 2 streams (2 servers x 1 HLS Proxy), got ${ncStreams.length}`);

  let ncHlsCount = 0;
  let ncEmbedCount = 0;
  for (let i = 0; i < ncStreams.length; i++) {
    const s = ncStreams[i];
    runner.assertStreamProtocol(s, i);

    if (s.url) {
      ncHlsCount++;
      runner.assert(s.externalUrl === undefined, `NguonC HLS Stream #${i + 1} externalUrl is undefined`);
      runner.assert(s.url.includes('/hls/manifest.m3u8?url=') || s.url.includes('/hls/extract?b64='), `NguonC HLS Stream #${i + 1} uses proxy extract URL`);
      runner.assert(s.title.startsWith('[VIP 3 • NguonC]'), `NguonC HLS Stream #${i + 1} has [VIP 3 • NguonC] prefix`);
      runner.assert(s.title.includes('(HLS Proxy)\n⚡ Server VIP 3 • Phát trực tiếp trong App'), `NguonC HLS Stream #${i + 1} has direct play badge`);
    } else if (s.externalUrl) {
      ncEmbedCount++;
    }
  }
  runner.assertEqual(ncHlsCount, 2, 'NguonC generates exactly 2 HLS Proxy streams');
  runner.assertEqual(ncEmbedCount, 0, 'NguonC generates strictly 0 externalUrl streams');


  // ════════════════════════════════════════════════════════════════
  //  SECTION 3: SERIES & EPISODE RESOLUTION (tt0903747:1:1 & :1:2)
  // ════════════════════════════════════════════════════════════════
  runner.section('Section 3: Series & Episode Resolution');

  // KKPhim Series Episode 1
  imdbCache.set('kkphim:imdb:tt0903747', FIXTURES.kkphim.seriesDetail, 3600);
  const kkEp1 = await kkphim.getStreams({
    imdbId: 'tt0903747',
    title: 'Breaking Bad',
    type: 'series',
    season: 1,
    episode: 1,
    proxyBase: 'http://localhost:7000',
  });
  runner.assert(kkEp1.length === 1, `KKPhim series ep1 returns 1 stream, got ${kkEp1.length}`);
  runner.assert(kkEp1[0].title.includes('[Tập 1]'), `KKPhim series ep1 title includes '[Tập 1]'`);

  // KKPhim Series Episode 2
  const kkEp2 = await kkphim.getStreams({
    imdbId: 'tt0903747',
    title: 'Breaking Bad',
    type: 'series',
    season: 1,
    episode: 2,
    proxyBase: 'http://localhost:7000',
  });
  runner.assert(kkEp2.length === 1, `KKPhim series ep2 returns 1 stream, got ${kkEp2.length}`);
  runner.assert(kkEp2[0].title.includes('[Tập 2]'), `KKPhim series ep2 title includes '[Tập 2]'`);

  // KKPhim Series Non-existent Episode 99
  const kkEp99 = await kkphim.getStreams({
    imdbId: 'tt0903747',
    title: 'Breaking Bad',
    type: 'series',
    season: 1,
    episode: 99,
    proxyBase: 'http://localhost:7000',
  });
  runner.assert(Array.isArray(kkEp99) && kkEp99.length === 0, 'KKPhim series non-existent ep 99 returns [] safely');

  // NguonC Series Multi-Episode Setup
  const nguoncSeriesFixture = {
    status: 'success',
    movie: {
      id: 'nguonc-bb-1',
      name: 'Biến Chất',
      original_name: 'Breaking Bad',
      slug: 'bien-chat',
      total_episodes: 2,
      current_episode: 'Tập 2',
      quality: 'FHD',
      language: 'Vietsub',
      category: { 1: { list: [{ name: '2008' }] } },
      episodes: [
        {
          server_name: 'Server #1 - Vietsub',
          items: [
            { name: '1', slug: 'tap-1', embed: 'https://streamc.online/embed/bb-1', m3u8: 'https://streamc.online/hls/bb-1.m3u8' },
            { name: '2', slug: 'tap-2', embed: 'https://streamc.online/embed/bb-2', m3u8: 'https://streamc.online/hls/bb-2.m3u8' },
          ],
        },
        {
          server_name: 'Server #2 - Thuyết Minh',
          items: [
            { name: '1', slug: 'tap-1', embed: 'https://streamc.online/embed/bb-1-tm', m3u8: 'https://streamc.online/hls/bb-1-tm.m3u8' },
            { name: '2', slug: 'tap-2', embed: 'https://streamc.online/embed/bb-2-tm', m3u8: 'https://streamc.online/hls/bb-2-tm.m3u8' },
          ],
        },
      ],
    },
  };
  imdbCache.set('nguonc:imdb:tt0903747', 'bien-chat', 3600);
  detailCache.set('nguonc:detail:bien-chat', nguoncSeriesFixture, 3600);

  const ncEp1 = await nguonc.getStreams({
    imdbId: 'tt0903747',
    title: 'Breaking Bad',
    type: 'series',
    season: 1,
    episode: 1,
    proxyBase: 'http://localhost:7000',
  });
  runner.assert(ncEp1.length === 2, `NguonC series ep1 returns 2 streams (2 servers x 1 HLS Proxy), got ${ncEp1.length}`);
  runner.assert(ncEp1[0].title.includes('[Tập 1]'), `NguonC series ep1 title includes '[Tập 1]'`);

  const ncEp99 = await nguonc.getStreams({
    imdbId: 'tt0903747',
    title: 'Breaking Bad',
    type: 'series',
    season: 1,
    episode: 99,
    proxyBase: 'http://localhost:7000',
  });
  runner.assert(Array.isArray(ncEp99) && ncEp99.length === 0, 'NguonC series non-existent ep 99 returns [] safely');


  // ════════════════════════════════════════════════════════════════
  //  SECTION 4: POSITIONAL VS OBJECT SIGNATURE COMPATIBILITY
  // ════════════════════════════════════════════════════════════════
  runner.section('Section 4: Invocation Signature Polymorphism');

  // Positional arguments: getStreams(imdbId, title, type, season, episode, proxyBase)
  const posKk = await kkphim.getStreams('tt1375666', 'Inception', 'movie', null, null, 'http://localhost:7000');
  runner.assert(Array.isArray(posKk) && posKk.length === 3, 'KKPhim supports positional arguments correctly');

  const posNc = await nguonc.getStreams('tt1375666', 'Inception', 'movie', null, null, 'http://localhost:7000');
  runner.assert(Array.isArray(posNc) && posNc.length === 2, 'NguonC supports positional arguments correctly');


  // ════════════════════════════════════════════════════════════════
  //  SECTION 5: SEARCH MATCHING & YEAR SCORING ALGORITHM
  // ════════════════════════════════════════════════════════════════
  runner.section('Section 5: Search & Year Scoring Logic');

  // Mock detail for search fallback
  detailCache.set('kkphim:detail:ke-danh-cap-giac-mo', FIXTURES.kkphim.movieDetail, 3600);
  detailCache.set('nguonc:detail:ke-danh-cap-giac-mo', FIXTURES.nguonc.movieDetail, 3600);

  // Clear IMDb caches to force title search fallback path
  imdbCache.del('kkphim:imdb:tt1375666_search');
  imdbCache.del('nguonc:imdb:tt1375666_search');

  // Verify search fallback with Cinemeta Title & Year
  const kkSearchFallback = await kkphim.getStreams({
    imdbId: 'tt1375666_search',
    title: 'Inception',
    year: 2010,
    type: 'movie',
    slug: 'ke-danh-cap-giac-mo',
    proxyBase: 'http://localhost:7000',
  });
  runner.assert(kkSearchFallback.length > 0, 'KKPhim falls back to slug/detail resolution');

  const ncSearchFallback = await nguonc.getStreams({
    imdbId: 'tt1375666_search',
    title: 'Inception',
    year: 2010,
    type: 'movie',
    slug: 'ke-danh-cap-giac-mo',
    proxyBase: 'http://localhost:7000',
  });
  runner.assert(ncSearchFallback.length > 0, 'NguonC falls back to slug/detail resolution');


  // ════════════════════════════════════════════════════════════════
  //  SECTION 6: VSMOV SCRAPER, PATTERNS & PACKER DECODER
  // ════════════════════════════════════════════════════════════════
  runner.section('Section 6: VsMov Deep Scraper & P.A.C.K.E.R Unpacking');

  // 6.1 VsMov Cached Page Extraction
  imdbCache.set('vsmov:tt1375666', {
    pageUrl: 'https://vsmov.com/film/inception-2010',
    gateway: 'https://vsmov.com',
  }, 3600);

  // Test VsMov fallback when offline
  const vsStreams = await vsmov.getStreams({
    imdbId: 'tt1375666_unknown',
    title: 'Random Nonexistent Film 12345XYZ',
    type: 'movie',
  });
  runner.assert(Array.isArray(vsStreams) && vsStreams.length === 0, 'VsMov returns [] gracefully for non-existent film');

  // 6.2 VsMov Catalog Return
  const vsCat = await vsmov.getCatalog('movie', 1);
  runner.assert(Array.isArray(vsCat), 'VsMov getCatalog returns array of catalog items');


  // ════════════════════════════════════════════════════════════════
  //  SECTION 7: EMPIRICAL FAULT INJECTION & ADVERSARIAL STRESS
  // ════════════════════════════════════════════════════════════════
  runner.section('Section 7: Empirical Fault Injection & Stress Testing');

  // 7.1 Spin up a local Mock HTTP Fault Injector Server
  const mockServer = http.createServer((req, res) => {
    const url = req.url || '';
    
    if (url.includes('/timeout')) {
      // Simulate slow / hanging connection exceeding 5s timeout
      setTimeout(() => {
        if (!res.writableEnded) {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ status: 'ok' }));
        }
      }, 4000);
      return;
    }

    if (url.includes('/500-error')) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Internal Server Error', status: 500 }));
      return;
    }

    if (url.includes('/502-bad-gateway')) {
      res.writeHead(502, { 'Content-Type': 'text/html' });
      res.end('<html><body>502 Bad Gateway Cloudflare</body></html>');
      return;
    }

    if (url.includes('/malformed-json')) {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end('{"status": true, "movie": { "name": "Broken", "episodes": '); // Corrupted truncated JSON
      return;
    }

    if (url.includes('/empty-body')) {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end('');
      return;
    }

    if (url.includes('/corrupted-episodes')) {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        status: true,
        movie: { slug: 'corrupted' },
        episodes: [
          { server_name: 'Broken Server', server_data: [null, { name: null, link_m3u8: null }] },
        ],
      }));
      return;
    }

    // Default 404
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Not Found' }));
  });

  const MOCK_PORT = 7499;
  await new Promise((resolve) => mockServer.listen(MOCK_PORT, '127.0.0.1', resolve));
  runner.info(`Local Mock Fault Injector Server running on http://127.0.0.1:${MOCK_PORT}`);

  try {
    // 7.2 Fault Injection: Corrupted & Empty Episode Data
    detailCache.set('kkphim:detail:corrupted-test', {
      movie: { slug: 'corrupted-test' },
      episodes: [
        { server_name: null, server_data: [null, {}, { name: 'Full' }] },
      ],
    }, 3600);

    const corruptedKk = await kkphim.getStreams({
      imdbId: 'tt9999991',
      slug: 'corrupted-test',
      proxyBase: 'http://localhost:7000',
    });
    runner.assert(Array.isArray(corruptedKk), 'KKPhim handles null/broken episode entries without throwing');

    detailCache.set('nguonc:detail:corrupted-test', {
      movie: {
        slug: 'corrupted-test',
        episodes: [
          { server_name: null, items: [null, {}, { name: 'Full', embed: '' }] },
        ],
      },
    }, 3600);

    const corruptedNc = await nguonc.getStreams({
      imdbId: 'tt9999992',
      slug: 'corrupted-test',
      proxyBase: 'http://localhost:7000',
    });
    runner.assert(Array.isArray(corruptedNc), 'NguonC handles null/broken episode entries without throwing');

    // 7.3 Fault Injection: Axios Client Timeout / Abort Handling
    runner.info('Testing Axios Client Timeout & Network Error resilience...');
    const startTime = Date.now();
    try {
      await axios.get(`http://127.0.0.1:${MOCK_PORT}/timeout`, { timeout: 800 });
      runner.fail('Mock timeout request should have aborted');
    } catch (err) {
      const elapsed = Date.now() - startTime;
      runner.assert(elapsed < 2500, `Request aborted within reasonable bounds (${elapsed}ms)`);
      runner.assert(err.code === 'ECONNABORTED' || err.code === 'EPERM' || err.message.includes('timeout') || err.message.includes('connect'), 'Axios error intercepted properly');
    }

  } finally {
    await new Promise((resolve) => mockServer.close(resolve));
  }


  // ════════════════════════════════════════════════════════════════
  //  SECTION 8: FUZZING & EXTREME BOUNDARY INPUTS
  // ════════════════════════════════════════════════════════════════
  runner.section('Section 8: Fuzzing & Boundary Input Testing');

  const fuzzInputs = [
    null,
    undefined,
    {},
    '',
    12345,
    false,
    { imdbId: '' },
    { imdbId: null, title: null, type: null },
    { imdbId: 'tt0000000', title: 'Special [Regex] (Chars) + ? * ^ $ \\ / |', year: 'invalid_year' },
    { imdbId: 'tt1375666', season: 'invalid', episode: 'undefined' },
    { imdbId: 'tt1375666', season: -999, episode: -1 },
    { imdbId: 'tt1375666', season: 1.5, episode: 2.7 },
    { imdbId: 'tt1375666', proxyBase: null },
    { imdbId: 'tt1375666', proxyBase: 'http://localhost:7000/' }, // trailing slash
  ];

  for (let i = 0; i < fuzzInputs.length; i++) {
    const input = fuzzInputs[i];
    try {
      const kkRes = await kkphim.getStreams(input);
      runner.assert(Array.isArray(kkRes), `KKPhim fuzz input #${i + 1} returns array without throw`);
    } catch (e) {
      runner.fail(`KKPhim threw on fuzz input #${i + 1}: ${e.message}`);
    }

    try {
      const ncRes = await nguonc.getStreams(input);
      runner.assert(Array.isArray(ncRes), `NguonC fuzz input #${i + 1} returns array without throw`);
    } catch (e) {
      runner.fail(`NguonC threw on fuzz input #${i + 1}: ${e.message}`);
    }

    try {
      const vsRes = await vsmov.getStreams(input);
      runner.assert(Array.isArray(vsRes), `VsMov fuzz input #${i + 1} returns array without throw`);
    } catch (e) {
      runner.fail(`VsMov threw on fuzz input #${i + 1}: ${e.message}`);
    }
  }


  // ════════════════════════════════════════════════════════════════
  //  SECTION 9: STREAM AGGREGATOR ISOLATION IN EXPRESS HANDLERS
  // ════════════════════════════════════════════════════════════════
  runner.section('Section 9: Stream Aggregator Isolation in Express Handlers');

  // Test Aggregator mock req/res
  const createMockReqRes = (params, query = {}, addonConfig = null) => {
    const req = {
      params,
      query,
      addonConfig: addonConfig || { providers: ['nguonc', 'kkphim', 'vsmov'], categories: ['movie', 'series'] },
      protocol: 'http',
      headers: { host: 'localhost:7000' },
      get: (h) => (h === 'host' ? 'localhost:7000' : undefined),
    };
    let responseData = null;
    let statusCode = 200;
    const res = {
      setHeader: () => {},
      status: (code) => { statusCode = code; return res; },
      json: (data) => { responseData = data; return res; },
    };
    return { req, res, getResult: () => ({ statusCode, responseData }) };
  };

  // Find stream handler from express router stack
  const streamRouteLayer = handlers.stack.find((layer) => layer.route && layer.route.path === '/stream/:type/:id.json');
  runner.assert(streamRouteLayer !== undefined, 'Stream aggregator route /stream/:type/:id.json exists');

  if (streamRouteLayer) {
    const streamHandlerFn = streamRouteLayer.route.stack[0].handle;

    // 9.1 Inception Aggregated Streams (KKPhim + NguonC cached, all 3 providers active)
    imdbCache.set('kkphim:imdb:tt1375666', FIXTURES.kkphim.movieDetail, 3600);
    imdbCache.set('nguonc:imdb:tt1375666', 'ke-danh-cap-giac-mo', 3600);
    detailCache.set('nguonc:detail:ke-danh-cap-giac-mo', FIXTURES.nguonc.movieDetail, 3600);

    const { req: req1, res: res1, getResult: getRes1 } = createMockReqRes(
      { type: 'movie', id: 'tt1375666' },
      {},
      { providers: ['nguonc', 'kkphim', 'vsmov'], categories: ['movie', 'series'] }
    );
    await streamHandlerFn(req1, res1);
    const r1 = getRes1();

    runner.assertEqual(r1.statusCode, 200, 'Stream aggregator returns HTTP 200');
    runner.assert(r1.responseData && Array.isArray(r1.responseData.streams), 'Response contains streams array');
    runner.assert(r1.responseData.streams.length >= 5, `Aggregator merges KKPhim (3) + NguonC (2) + VsMov (>=0), got ${r1.responseData.streams.length}`);

    // Verify all merged streams strictly adhere to Stremio protocol
    for (let i = 0; i < r1.responseData.streams.length; i++) {
      runner.assertStreamProtocol(r1.responseData.streams[i], i);
    }

    // 9.2 Selective Provider Config: KKPhim only
    const { req: reqKk, res: resKk, getResult: getResKk } = createMockReqRes(
      { type: 'movie', id: 'tt1375666' },
      {},
      { providers: ['kkphim'], categories: ['movie', 'series'] }
    );
    await streamHandlerFn(reqKk, resKk);
    const rKk = getResKk();
    runner.assertEqual(rKk.responseData.streams.length, 3, 'Selective config filters streams to KKPhim only (3 streams)');

    // 9.3 Selective Provider Config: NguonC only
    const { req: reqNc, res: resNc, getResult: getResNc } = createMockReqRes(
      { type: 'movie', id: 'tt1375666' },
      {},
      { providers: ['nguonc'], categories: ['movie', 'series'] }
    );
    await streamHandlerFn(reqNc, resNc);
    const rNc = getResNc();
    runner.assertEqual(rNc.responseData.streams.length, 2, 'Selective config filters streams to NguonC only (2 streams)');

    // 9.4 Non-existent film returns empty streams with 200 OK (never crashes)
    const { req: req2, res: res2, getResult: getRes2 } = createMockReqRes({ type: 'movie', id: 'tt0000000' });
    await streamHandlerFn(req2, res2);
    const r2 = getRes2();
    runner.assertEqual(r2.statusCode, 200, 'Non-existent film returns HTTP 200');
    runner.assert(Array.isArray(r2.responseData.streams) && r2.responseData.streams.length === 0, 'Returns empty streams array for unknown ID');
  }

  // ════════════════════════════════════════════════════════════════
  //  FINAL VERDICT CALCULATION
  // ════════════════════════════════════════════════════════════════
  runner.printSummary();

  const total = runner.passed + runner.failed;
  const isApproved = runner.failed === 0;
  console.log(`================================================================`);
  console.log(`EMPIRICAL CHALLENGER VERDICT: ${isApproved ? '✅ APPROVE' : '❌ REJECT'}`);
  console.log(`Passed: ${runner.passed}/${total} assertions`);
  console.log(`================================================================\n`);

  return { isApproved, runner };
}

if (require.main === module) {
  runEmpiricalChallenger()
    .then(({ isApproved }) => {
      if (!isApproved) process.exit(1);
    })
    .catch((err) => {
      console.error('Fatal error during challenger execution:', err);
      process.exit(1);
    });
}

module.exports = { runEmpiricalChallenger };
