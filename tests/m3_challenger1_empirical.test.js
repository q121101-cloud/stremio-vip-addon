'use strict';

/**
 * ============================================================================
 *  VIP Movies Addon v1.4.0 — Milestone 3 Challenger 1 Empirical Test Suite
 *
 *  Adversarial Verification Suite for:
 *    1. Stream Protocol Separation (Mutual Exclusivity: url vs externalUrl)
 *    2. Multi-Provider Error Isolation & Fault Injection
 *    3. Case-Insensitivity & ID Formats (TT1375666, tt1375666, tt0903747:1:1, etc.)
 *    4. Title Formatting & Hash (#) Stripping
 *    5. End-to-End Route Invocation & Invariant Verifications
 * ============================================================================
 */

const assert = require('assert');
const { TestRunner } = require('./helpers');
const { FIXTURES } = require('./fixtures');
const { imdbCache, detailCache, catalogCache } = require('../src/lib/cache');
const { resolveCinemeta, getCachedCinemeta, cinemetaCache } = require('../src/lib/cinemeta');

const kkphim = require('../src/providers/kkphim');
const nguonc = require('../src/providers/nguonc');
const vsmov  = require('../src/providers/vsmov');
const handlers = require('../src/handlers');
const mapper = require('../src/mapper');
const { DEFAULT_CONFIG, encodeConfig, decodeConfig } = require('../src/config');
const { MANIFEST } = require('../src/manifest');
const packageJson = require('../package.json');

const runner = new TestRunner('Challenger 1 — Milestone 3 Empirical & Adversarial Gate Verification');

// Helper to create mock Express Req/Res for router testing
function createMockReqRes(params, query = {}, addonConfig = null, protocol = 'http', host = 'localhost:7000') {
  const req = {
    params,
    query,
    addonConfig: addonConfig !== undefined ? addonConfig : { providers: ['nguonc', 'kkphim', 'vsmov'], categories: ['movie', 'series'] },
    protocol,
    headers: { host },
    get: (h) => (h.toLowerCase() === 'host' ? host : undefined),
  };
  let responseData = null;
  let statusCode = 200;
  const headers = {};
  const res = {
    setHeader: (k, v) => { headers[k.toLowerCase()] = v; },
    getHeader: (k) => headers[k.toLowerCase()],
    status: (code) => { statusCode = code; return res; },
    json: (data) => { responseData = data; return res; },
    send: (data) => { responseData = data; return res; },
  };
  return { req, res, getResult: () => ({ statusCode, responseData, headers }) };
}

// Find Express stream handler
const streamRouteLayer = handlers.stack.find((l) => l.route && l.route.path === '/stream/:type/:id.json');
if (!streamRouteLayer) {
  throw new Error('Route /stream/:type/:id.json is not registered in handlers');
}
const streamHandlerFn = streamRouteLayer.route.stack[0].handle;

async function runM3ChallengerSuite() {
  console.log('╔═════════════════════════════════════════════════════════════════════════════╗');
  console.log('║  ⚔️  CHALLENGER 1: MILESTONE 3 EMPIRICAL & ADVERSARIAL VERIFICATION SUITE   ║');
  console.log('║  Stream Protocol | Error Isolation | ID Casing | Title Standardization      ║');
  console.log('╚═════════════════════════════════════════════════════════════════════════════╝\n');

  // Reset caches
  imdbCache.clear();
  detailCache.clear();
  catalogCache.clear();
  cinemetaCache.clear();

  // ════════════════════════════════════════════════════════════════
  //  GATE 1: STREAM PROTOCOL SEPARATION (url vs externalUrl)
  // ════════════════════════════════════════════════════════════════
  runner.section('Gate 1: Stream Protocol Separation & Strict Exclusivity');

  // Populate mock data for KKPhim, NguonC, and VsMov
  cinemetaCache.set('cinemeta:movie:tt1375666', {
    imdbId: 'tt1375666',
    type: 'movie',
    name: 'Inception',
    year: 2010,
    genres: ['Action', 'Sci-Fi'],
    aliases: ['Inception (2010)'],
  }, 86400);

  imdbCache.set('kkphim:imdb:tt1375666', FIXTURES.kkphim.movieDetail, 86400);
  imdbCache.set('nguonc:imdb:tt1375666', 'ke-danh-cap-giac-mo', 86400);
  detailCache.set('nguonc:detail:ke-danh-cap-giac-mo', FIXTURES.nguonc.movieDetail, 86400);

  // Invoke aggregated stream endpoint
  const { req: req1, res: res1, getResult: getRes1 } = createMockReqRes(
    { type: 'movie', id: 'tt1375666' },
    {},
    { providers: ['nguonc', 'kkphim', 'vsmov'], categories: ['movie', 'series'] }
  );
  await streamHandlerFn(req1, res1);
  const result1 = getRes1();

  runner.assertEqual(result1.statusCode, 200, 'Aggregator responds with HTTP 200');
  runner.assert(result1.responseData && Array.isArray(result1.responseData.streams), 'Response contains streams array');
  runner.assert(result1.responseData.streams.length > 0, `Streams returned: ${result1.responseData.streams.length}`);

  const allStreams = result1.responseData.streams;
  let hlsProxyCount = 0;
  let embedPlayerCount = 0;

  allStreams.forEach((stream, idx) => {
    const streamLabel = `Aggregated Stream #${idx + 1} (${stream.title.replace(/\n/g, ' ')})`;

    // Check mutual exclusivity
    const hasUrl = typeof stream.url === 'string' && stream.url.trim().length > 0;
    const hasExternalUrl = typeof stream.externalUrl === 'string' && stream.externalUrl.trim().length > 0;

    runner.assert(!(hasUrl && hasExternalUrl), `${streamLabel} MUST NOT contain both 'url' and 'externalUrl'`);
    runner.assert(hasUrl || hasExternalUrl, `${streamLabel} MUST contain either 'url' or 'externalUrl'`);

    if (hasUrl) {
      hlsProxyCount++;
      runner.assert(!('externalUrl' in stream), `${streamLabel} (HLS Proxy) must NOT have 'externalUrl' property key`);
      runner.assert(stream.url.startsWith('http://localhost:7000/hls/'), `${streamLabel} url must route to /hls/ proxy endpoint`);
      runner.assert(stream.title.includes('(HLS Proxy)'), `${streamLabel} title must contain '(HLS Proxy)' badge`);
      runner.assert(stream.title.includes('⚡ Phát trực tiếp trong App'), `${streamLabel} title must contain in-app playback label`);
    } else if (hasExternalUrl) {
      embedPlayerCount++;
      runner.assert(!('url' in stream), `${streamLabel} (Embed Player) must NOT have 'url' property key`);
      runner.assert(stream.externalUrl.startsWith('http'), `${streamLabel} externalUrl must be a valid HTTP(S) URL`);
      runner.assert(stream.title.includes('(Embed Player)'), `${streamLabel} title must contain '(Embed Player)' badge`);
      runner.assert(stream.title.includes('🌐 Bấm để mở xem ngoài trình duyệt web'), `${streamLabel} title must contain browser fallback label`);
    }

    // Standard behaviorHints and branding
    runner.assertEqual(stream.name, 'VIP Movies 🎬', `${streamLabel} name branding`);
    runner.assert(stream.behaviorHints && stream.behaviorHints.notSupported === false, `${streamLabel} behaviorHints.notSupported is false`);
    runner.assert(typeof stream.behaviorHints.bingeGroup === 'string' && stream.behaviorHints.bingeGroup.length > 0, `${streamLabel} bingeGroup is non-empty`);
  });

  runner.assert(hlsProxyCount > 0, `Generated ${hlsProxyCount} HLS Proxy streams`);
  runner.assert(embedPlayerCount > 0, `Generated ${embedPlayerCount} Embed Player streams`);

  // Direct provider testing for mutual exclusivity
  const kkDirect = await kkphim.getStreams({ imdbId: 'tt1375666', type: 'movie', proxyBase: 'http://localhost:7000' });
  kkDirect.forEach((s, idx) => runner.assertStreamProtocol(s, idx));

  const ncDirect = await nguonc.getStreams({ imdbId: 'tt1375666', type: 'movie', proxyBase: 'http://localhost:7000' });
  ncDirect.forEach((s, idx) => runner.assertStreamProtocol(s, idx));


  // ════════════════════════════════════════════════════════════════
  //  GATE 2: ERROR ISOLATION & FAULT INJECTION
  // ════════════════════════════════════════════════════════════════
  runner.section('Gate 2: Multi-Provider Error Isolation & Fault Injection');

  // Test 2.1: Inject a failing mock provider that throws synchronous Error
  console.log('  --- Subtest 2.1: Synchronous Exception Isolation ---');
  const originalKKGetStreams = kkphim.getStreams;
  try {
    kkphim.getStreams = async () => {
      throw new Error('CRITICAL_PROVIDER_EXPLOSION: KKPhim API is down!');
    };

    const { req: reqFail, res: resFail, getResult: getResFail } = createMockReqRes(
      { type: 'movie', id: 'tt1375666' },
      {},
      { providers: ['nguonc', 'kkphim'], categories: ['movie', 'series'] }
    );

    await streamHandlerFn(reqFail, resFail);
    const failResult = getResFail();

    runner.assertEqual(failResult.statusCode, 200, 'Endpoint returns HTTP 200 despite KKPhim exploding');
    runner.assert(Array.isArray(failResult.responseData.streams), 'Streams array is returned');
    runner.assert(failResult.responseData.streams.length > 0, 'Surviving NguonC provider still returns its streams');
    failResult.responseData.streams.forEach((s) => {
      runner.assert(s.title.includes('NguonC'), 'Streams belong to surviving provider NguonC');
      runner.assert(!s.title.includes('KKPhim'), 'No broken KKPhim streams present');
    });
  } finally {
    kkphim.getStreams = originalKKGetStreams;
  }

  // Test 2.2: Inject asynchronous Promise rejection (ETIMEDOUT / ECONNREFUSED)
  console.log('\n  --- Subtest 2.2: Async Promise Rejection Isolation ---');
  const originalNCGetStreams = nguonc.getStreams;
  try {
    nguonc.getStreams = () => Promise.reject(new Error('ETIMEDOUT: Connection to phim.nguonc.com timed out'));

    const { req: reqReject, res: resReject, getResult: getResReject } = createMockReqRes(
      { type: 'movie', id: 'tt1375666' },
      {},
      { providers: ['nguonc', 'kkphim'], categories: ['movie', 'series'] }
    );

    await streamHandlerFn(reqReject, resReject);
    const rejectResult = getResReject();

    runner.assertEqual(rejectResult.statusCode, 200, 'Endpoint returns HTTP 200 despite NguonC async rejection');
    runner.assert(Array.isArray(rejectResult.responseData.streams), 'Streams array is returned');
    runner.assert(rejectResult.responseData.streams.length > 0, 'Surviving KKPhim provider still returns its streams');
    rejectResult.responseData.streams.forEach((s) => {
      runner.assert(s.title.includes('KKPhim'), 'Streams belong to surviving provider KKPhim');
    });
  } finally {
    nguonc.getStreams = originalNCGetStreams;
  }

  // Test 2.3: Provider returning corrupted objects (null, numbers, strings, broken objects)
  console.log('\n  --- Subtest 2.3: Malformed Provider Output Sanitization ---');
  try {
    kkphim.getStreams = async () => [
      null,
      undefined,
      'invalid_string',
      12345,
      {},
      { title: 'Incomplete object without URLs' },
      {
        name: 'Dual Prop Leak',
        title: 'Corrupted Stream #1',
        url: 'http://localhost:7000/hls/test.m3u8',
        externalUrl: 'https://leak.example.com/embed', // Injected dual-property attack
      },
    ];

    const { req: reqCorrupt, res: resCorrupt, getResult: getResCorrupt } = createMockReqRes(
      { type: 'movie', id: 'tt1375666' },
      {},
      { providers: ['kkphim'], categories: ['movie', 'series'] }
    );

    await streamHandlerFn(reqCorrupt, resCorrupt);
    const corruptResult = getResCorrupt();

    runner.assertEqual(corruptResult.statusCode, 200, 'Endpoint returns HTTP 200 when provider returns corrupted items');
    runner.assert(Array.isArray(corruptResult.responseData.streams), 'Streams array returned');
    runner.assertEqual(corruptResult.responseData.streams.length, 1, 'Only the single valid/sanitized stream is included');

    const sanitizedDual = corruptResult.responseData.streams[0];
    runner.assert(sanitizedDual.url && !('externalUrl' in sanitizedDual), 'Aggregator strictly stripped externalUrl on dual-property leak');
    runner.assert(!sanitizedDual.title.includes('#'), 'Aggregator stripped "#" from corrupted stream title');
  } finally {
    kkphim.getStreams = originalKKGetStreams;
  }

  // Test 2.4: All providers failing simultaneously
  console.log('\n  --- Subtest 2.4: Complete Failure Degradation ---');
  const originalVSGetStreams = vsmov.getStreams;
  try {
    kkphim.getStreams = async () => { throw new Error('KKPhim down'); };
    nguonc.getStreams = async () => { throw new Error('NguonC down'); };
    vsmov.getStreams  = async () => { throw new Error('VsMov down'); };

    const { req: reqAllFail, res: resAllFail, getResult: getResAllFail } = createMockReqRes(
      { type: 'movie', id: 'tt1375666' },
      {},
      { providers: ['nguonc', 'kkphim', 'vsmov'], categories: ['movie', 'series'] }
    );

    await streamHandlerFn(reqAllFail, resAllFail);
    const allFailResult = getResAllFail();

    runner.assertEqual(allFailResult.statusCode, 200, 'All-providers failing still returns HTTP 200 with { streams: [] }');
    runner.assert(Array.isArray(allFailResult.responseData.streams) && allFailResult.responseData.streams.length === 0, 'Returns empty array safely');
  } finally {
    kkphim.getStreams = originalKKGetStreams;
    nguonc.getStreams = originalNCGetStreams;
    vsmov.getStreams  = originalVSGetStreams;
  }


  // ════════════════════════════════════════════════════════════════
  //  GATE 3: CASE INSENSITIVITY & ID FORMATS
  // ════════════════════════════════════════════════════════════════
  runner.section('Gate 3: Case-Insensitivity & Diverse ID Formats');

  cinemetaCache.clear();
  imdbCache.clear();
  detailCache.clear();

  // Setup fixtures
  cinemetaCache.set('cinemeta:movie:tt1375666', {
    imdbId: 'tt1375666',
    type: 'movie',
    name: 'Inception',
    year: 2010,
    genres: ['Action'],
    aliases: [],
  }, 86400);

  cinemetaCache.set('cinemeta:series:tt0903747', {
    imdbId: 'tt0903747',
    type: 'series',
    name: 'Breaking Bad',
    year: 2008,
    genres: ['Crime', 'Drama'],
    aliases: [],
  }, 86400);

  imdbCache.set('kkphim:imdb:tt1375666', FIXTURES.kkphim.movieDetail, 86400);
  imdbCache.set('kkphim:imdb:tt0903747', FIXTURES.kkphim.seriesDetail, 86400);

  // 3.1 Test resolveCinemeta casing
  const cineLower = await resolveCinemeta('movie', 'tt1375666');
  const cineUpper = await resolveCinemeta('movie', 'TT1375666');
  const cineMixed = await resolveCinemeta('movie', 'Tt1375666');
  runner.assert(cineLower && cineUpper && cineMixed, 'resolveCinemeta succeeds regardless of case');
  runner.assertEqual(cineUpper.imdbId, 'tt1375666', 'resolveCinemeta normalizes uppercase TT1375666 to lowercase tt1375666');
  runner.assertEqual(cineUpper.name, 'Inception', 'resolveCinemeta retrieves cached Inception for TT1375666');

  // 3.2 Test getCachedCinemeta casing
  const cachedUpper = getCachedCinemeta('movie', 'TT1375666');
  runner.assert(cachedUpper !== null, 'getCachedCinemeta works for uppercase TT1375666');
  runner.assertEqual(cachedUpper.name, 'Inception', 'getCachedCinemeta returns correct name for TT1375666');

  // 3.3 Test uppercase TT1375666 via /stream/:type/:id.json
  const { req: reqUpper, res: resUpper, getResult: getResUpper } = createMockReqRes({ type: 'movie', id: 'TT1375666' });
  await streamHandlerFn(reqUpper, resUpper);
  const upperResult = getResUpper();
  runner.assertEqual(upperResult.statusCode, 200, 'Uppercase TT1375666 returns HTTP 200');
  runner.assert(upperResult.responseData.streams.length > 0, `Uppercase TT1375666 returns ${upperResult.responseData.streams.length} streams`);

  // 3.4 Test series ID formats: tt0903747:1:1
  const { req: reqSeries1, res: resSeries1, getResult: getResSeries1 } = createMockReqRes({ type: 'series', id: 'tt0903747:1:1' });
  await streamHandlerFn(reqSeries1, resSeries1);
  const series1Result = getResSeries1();
  runner.assertEqual(series1Result.statusCode, 200, 'Series ID tt0903747:1:1 returns HTTP 200');
  runner.assert(series1Result.responseData.streams.length > 0, `Series ID tt0903747:1:1 returns ${series1Result.responseData.streams.length} streams`);
  runner.assert(series1Result.responseData.streams.some((s) => s.title.includes('[Tập 1]')), 'Stream titles for ep 1 include [Tập 1]');

  // 3.5 Test uppercase series ID: TT0903747:1:2
  const { req: reqSeries2, res: resSeries2, getResult: getResSeries2 } = createMockReqRes({ type: 'series', id: 'TT0903747:1:2' });
  await streamHandlerFn(reqSeries2, resSeries2);
  const series2Result = getResSeries2();
  runner.assertEqual(series2Result.statusCode, 200, 'Uppercase Series ID TT0903747:1:2 returns HTTP 200');
  runner.assert(series2Result.responseData.streams.length > 0, `Uppercase Series ID TT0903747:1:2 returns ${series2Result.responseData.streams.length} streams`);
  runner.assert(series2Result.responseData.streams.some((s) => s.title.includes('[Tập 2]')), 'Stream titles for ep 2 include [Tập 2]');

  // 3.6 Test Provider Specific ID formats (kkphim:slug, nguonc_slug:1:1)
  detailCache.set('kkphim:detail:ke-danh-cap-giac-mo', FIXTURES.kkphim.movieDetail, 86400);
  const { req: reqKkSlug, res: resKkSlug, getResult: getResKkSlug } = createMockReqRes(
    { type: 'movie', id: 'kkphim:ke-danh-cap-giac-mo' },
    {},
    { providers: ['kkphim'], categories: ['movie', 'series'] }
  );
  await streamHandlerFn(reqKkSlug, resKkSlug);
  const kkSlugResult = getResKkSlug();
  runner.assertEqual(kkSlugResult.statusCode, 200, 'Provider ID kkphim:ke-danh-cap-giac-mo returns HTTP 200');
  runner.assert(kkSlugResult.responseData.streams.length > 0, 'kkphim:ke-danh-cap-giac-mo returns streams');

  detailCache.set('nguonc:detail:ke-danh-cap-giac-mo', FIXTURES.nguonc.movieDetail, 86400);
  const { req: reqNcSlug, res: resNcSlug, getResult: getResNcSlug } = createMockReqRes(
    { type: 'movie', id: 'nguonc_ke-danh-cap-giac-mo' },
    {},
    { providers: ['nguonc'], categories: ['movie', 'series'] }
  );
  await streamHandlerFn(reqNcSlug, resNcSlug);
  const ncSlugResult = getResNcSlug();
  runner.assertEqual(ncSlugResult.statusCode, 200, 'Provider ID nguonc_ke-danh-cap-giac-mo returns HTTP 200');
  runner.assert(ncSlugResult.responseData.streams.length > 0, 'nguonc_ke-danh-cap-giac-mo returns streams');


  // ════════════════════════════════════════════════════════════════
  //  GATE 4: TITLE FORMATTING & HASH (#) STRIPPING
  // ════════════════════════════════════════════════════════════════
  runner.section('Gate 4: Title Formatting & Hash (#) Stripping');

  // Test fixture with raw server names containing '#'
  detailCache.set('kkphim:detail:hash-test', {
    movie: { slug: 'hash-test', name: 'Hash Test Film', type: 'single' },
    episodes: [
      {
        server_name: 'Vietsub #1 - VIP #99',
        server_data: [
          { name: 'Full', slug: 'full', link_m3u8: 'https://cdn.example.com/hls.m3u8', link_embed: 'https://embed.example.com/hash' },
        ],
      },
      {
        server_name: 'Thuyết Minh #2',
        server_data: [
          { name: 'Full', slug: 'full', link_m3u8: 'https://cdn.example.com/hls2.m3u8', link_embed: 'https://embed.example.com/hash2' },
        ],
      },
    ],
  }, 86400);

  const hashStreamsKk = await kkphim.getStreams({
    slug: 'hash-test',
    type: 'movie',
    proxyBase: 'http://localhost:7000',
  });

  runner.assert(hashStreamsKk.length === 4, `Hash test generated 4 streams`);
  hashStreamsKk.forEach((s, idx) => {
    runner.assert(!s.title.includes('#'), `Direct KKPhim Stream #${idx + 1} must not contain '#': "${s.title}"`);
  });

  // Test via Aggregator endpoint with KKPhim
  const { req: reqHash, res: resHash, getResult: getResHash } = createMockReqRes(
    { type: 'movie', id: 'kkphim:hash-test' },
    {},
    { providers: ['kkphim'], categories: ['movie', 'series'] }
  );
  await streamHandlerFn(reqHash, resHash);
  const hashAggResult = getResHash();

  runner.assertEqual(hashAggResult.statusCode, 200, 'Aggregator returns HTTP 200 for hash-test');
  hashAggResult.responseData.streams.forEach((s, idx) => {
    runner.assert(!s.title.includes('#'), `Aggregated Stream #${idx + 1} must not contain '#': "${s.title}"`);

    // Verify standardized prefixes
    if (s.url) {
      runner.assert(s.title.startsWith('[VIP • KKPhim]'), `HLS stream starts with '[VIP • KKPhim]': "${s.title}"`);
      runner.assert(s.title.endsWith('(HLS Proxy)\n⚡ Phát trực tiếp trong App'), `HLS stream ends with standard direct play badge`);
    } else if (s.externalUrl) {
      runner.assert(s.title.startsWith('[Dự phòng • KKPhim]'), `Embed stream starts with '[Dự phòng • KKPhim]': "${s.title}"`);
      runner.assert(s.title.endsWith('(Embed Player)\n🌐 Bấm để mở xem ngoài trình duyệt web'), `Embed stream ends with standard embed badge`);
    }
  });

  // Check NguonC title format isolation
  const { req: reqNcTitle, res: resNcTitle, getResult: getResNcTitle } = createMockReqRes(
    { type: 'movie', id: 'nguonc:ke-danh-cap-giac-mo' },
    {},
    { providers: ['nguonc'], categories: ['movie', 'series'] }
  );
  await streamHandlerFn(reqNcTitle, resNcTitle);
  const ncTitleResult = getResNcTitle();

  ncTitleResult.responseData.streams.forEach((s, idx) => {
    runner.assert(!s.title.includes('#'), `NguonC Aggregated Stream #${idx + 1} must not contain '#': "${s.title}"`);
    if (s.url) {
      runner.assert(s.title.startsWith('[VIP • NguonC]'), `NguonC HLS stream starts with '[VIP • NguonC]': "${s.title}"`);
      runner.assert(s.title.includes('(HLS Proxy)\n⚡ Phát trực tiếp trong App'), `NguonC HLS stream has badge`);
    } else if (s.externalUrl) {
      runner.assert(s.title.startsWith('[Dự phòng • NguonC]'), `NguonC Embed stream starts with '[Dự phòng • NguonC]': "${s.title}"`);
      runner.assert(s.title.includes('(Embed Player)\n🌐 Bấm để mở xem ngoài trình duyệt web'), `NguonC Embed stream has badge`);
    }
  });


  // ════════════════════════════════════════════════════════════════
  //  GATE 5: CONFIG, MANIFEST & VERSIONING INTEGRITY
  // ════════════════════════════════════════════════════════════════
  runner.section('Gate 5: Configuration, Manifest & Versioning Integrity');

  runner.assertEqual(packageJson.version, '1.4.0', 'package.json version is 1.4.0');
  runner.assertEqual(MANIFEST.version, '1.4.0', 'MANIFEST.version is 1.4.0');
  runner.assertEqual(JSON.stringify(DEFAULT_CONFIG.providers), JSON.stringify(['nguonc', 'kkphim', 'vsmov']), 'DEFAULT_CONFIG.providers activates all 3 providers');

  // Verify UI route
  const uiRouteLayer = handlers.stack.find((l) => l.route && l.route.path === '/');
  runner.assert(uiRouteLayer !== undefined, 'Route / is registered');
  if (uiRouteLayer) {
    const uiHandler = uiRouteLayer.route.stack[0].handle;
    const { req: uiReq, res: uiRes, getResult: getUiRes } = createMockReqRes({});
    await uiHandler(uiReq, uiRes);
    const uiResult = getUiRes();
    runner.assertEqual(uiResult.statusCode, 200, 'UI route returns HTTP 200');
    runner.assert(typeof uiResult.responseData === 'string', 'UI route returns HTML string');
    runner.assert(uiResult.responseData.includes('VIP Movies Addon v1.4.0'), 'UI contains "VIP Movies Addon v1.4.0"');
    runner.assert(uiResult.responseData.includes('<span class="brand-highlight">Q121101</span>'), 'UI contains brand footer "<span class="brand-highlight">Q121101</span>"');
  }

  // Verify Health check route
  const healthRouteLayer = handlers.stack.find((l) => l.route && l.route.path === '/health');
  runner.assert(healthRouteLayer !== undefined, 'Route /health is registered');
  if (healthRouteLayer) {
    const healthHandler = healthRouteLayer.route.stack[0].handle;
    const { req: hReq, res: hRes, getResult: getHRes } = createMockReqRes({});
    await healthHandler(hReq, hRes);
    const hResult = getHRes();
    runner.assertEqual(hResult.statusCode, 200, '/health returns HTTP 200');
    runner.assertEqual(hResult.responseData.status, 'ok', '/health status is "ok"');
    runner.assertEqual(hResult.responseData.version, '1.4.0', '/health version is 1.4.0');
  }


  // ════════════════════════════════════════════════════════════════
  //  VERDICT & SUMMARY
  // ════════════════════════════════════════════════════════════════
  runner.printSummary();

  const isApproved = runner.failed === 0;
  console.log('================================================================');
  console.log(`🏁 CHALLENGER 1 M3 VERDICT: ${isApproved ? '✅ APPROVE' : '❌ REJECT'}`);
  console.log(`Passed: ${runner.passed}/${runner.passed + runner.failed} assertions (Failures: ${runner.failed})`);
  console.log('================================================================\n');

  return { isApproved, runner };
}

if (require.main === module) {
  runM3ChallengerSuite()
    .then(({ isApproved }) => {
      if (!isApproved) process.exit(1);
    })
    .catch((err) => {
      console.error('Fatal test error:', err);
      process.exit(1);
    });
}

module.exports = { runM3ChallengerSuite };
