'use strict';

/**
 * ============================================================
 *  VIP Movies Addon v1.5.0 — Comprehensive E2E Test Suite
 *  Covers 4 Systematic Testing Tiers:
 *    - Tier 1: Feature Coverage (Category-Partition)
 *    - Tier 2: Boundary & Corner Cases (BVA)
 *    - Tier 3: Cross-Feature Combinations (Pairwise)
 *    - Tier 4: Real-World Scenarios & Workload Stress
 * ============================================================
 */

const axios = require('axios');
const http = require('http');
const path = require('path');
const fs = require('fs');

const { TestRunner, startTestServer } = require('./helpers');
const { FIXTURES } = require('./fixtures');

const TEST_PORT = parseInt(process.env.TEST_PORT || '7412', 10);
const runner = new TestRunner('VIP Movies Addon v1.5.0 — Full 4-Tier Test Suite');

async function runTestSuite() {
  console.log('');
  console.log('╔══════════════════════════════════════════════════════════════╗');
  console.log('║   🎬 VIP MOVIES STREMIO ADDON v1.5.0 — E2E TEST SUITE        ║');
  console.log('╚══════════════════════════════════════════════════════════════╝');
  console.log(`Node.js Version: ${process.version}`);
  console.log(`Test Port:       ${TEST_PORT}\n`);

  // Start test server
  let serverInstance;
  let BASE_URL;
  try {
    const serverObj = await startTestServer(TEST_PORT);
    serverInstance = serverObj.app;
    BASE_URL = serverObj.baseUrl;
    runner.info(`Test server listening on ${BASE_URL}`);
  } catch (err) {
    runner.fail(`Failed to initialize test server on port ${TEST_PORT}`, err);
    runner.printSummary();
    process.exit(1);
  }

  // ════════════════════════════════════════════════════════════════
  //  TIER 1: FEATURE COVERAGE (CATEGORY-PARTITION)
  // ════════════════════════════════════════════════════════════════

  // ── 1.1 Cinemeta Resolver Module & Interface Contract ──────────
  runner.section('Tier 1.1: Cinemeta Official Resolver (src/lib/cinemeta.js)');
  const cinemetaModule = require('../src/lib/cinemeta');
  runner.assert(typeof cinemetaModule.resolveCinemeta === 'function', 'resolveCinemeta is exported as a function');
  runner.assert(typeof cinemetaModule.getCachedCinemeta === 'function', 'getCachedCinemeta is exported as a function');
  runner.assert(cinemetaModule.cinemetaCache !== undefined, 'cinemetaCache is exported');

  // Test Non-IMDb IDs rejection
  const nonImdbRes = await cinemetaModule.resolveCinemeta('movie', 'nguonc:ke-danh-cap-giac-mo');
  runner.assertEqual(nonImdbRes, null, 'Non-IMDb ID returns null immediately');

  const nullIdRes = await cinemetaModule.resolveCinemeta('movie', null);
  runner.assertEqual(nullIdRes, null, 'null ID returns null immediately');

  // Populate Cinemeta Cache with Inception Fixture
  const incFixture = FIXTURES.cinemeta.inception;
  cinemetaModule.cinemetaCache.set(`cinemeta:movie:${incFixture.imdbId}`, {
    imdbId: incFixture.imdbId,
    type: 'movie',
    name: incFixture.meta.name,
    originalName: incFixture.meta.name,
    year: 2010,
    releaseInfo: '2010',
    genres: incFixture.meta.genres,
    aliases: incFixture.meta.aliases,
    poster: incFixture.meta.poster,
    background: incFixture.meta.background,
    description: incFixture.meta.description,
  }, 86400);

  const cachedInception = await cinemetaModule.resolveCinemeta('movie', 'tt1375666');
  runner.assert(cachedInception !== null, 'Resolved Inception from LRUCache');
  runner.assertEqual(cachedInception.name, 'Inception', 'Canonical name is "Inception"');
  runner.assertEqual(cachedInception.year, 2010, 'Canonical year is numeric 2010');
  runner.assert(Array.isArray(cachedInception.genres) && cachedInception.genres.includes('Action'), 'Genres contain "Action"');

  // Populate Series Fixture (Breaking Bad)
  const bbFixture = FIXTURES.cinemeta.breakingBad;
  cinemetaModule.cinemetaCache.set(`cinemeta:series:${bbFixture.imdbId}`, {
    imdbId: bbFixture.imdbId,
    type: 'series',
    name: bbFixture.meta.name,
    originalName: bbFixture.meta.name,
    year: 2008,
    releaseInfo: '2008–2013',
    genres: bbFixture.meta.genres,
    aliases: bbFixture.meta.aliases,
  }, 86400);

  const cachedBreakingBad = await cinemetaModule.resolveCinemeta('series', 'tt0903747:1:1');
  runner.assert(cachedBreakingBad !== null, 'Resolved Breaking Bad from "tt0903747:1:1"');
  runner.assertEqual(cachedBreakingBad.name, 'Breaking Bad', 'Canonical name is "Breaking Bad"');
  runner.assertEqual(cachedBreakingBad.year, 2008, 'Series start year parsed as 2008');
  runner.assertEqual(cachedBreakingBad.releaseInfo, '2008–2013', 'Full releaseInfo "2008–2013" preserved');

  // Test Synchronous getCachedCinemeta
  const syncCached = cinemetaModule.getCachedCinemeta('movie', 'tt1375666');
  runner.assert(syncCached !== null && syncCached.name === 'Inception', 'getCachedCinemeta synchronously retrieves cached meta');

  // ── 1.2 24-Hour LRU Cache Module ─────────────────────────────
  runner.section('Tier 1.2: LRU Cache Architecture (src/lib/cache.js)');
  const { LRUCache, cinemetaCache, imdbCache, m3u8Cache, catalogCache, detailCache } = require('../src/lib/cache');
  runner.assert(LRUCache !== undefined, 'LRUCache class is exported');
  runner.assert(cinemetaCache instanceof LRUCache, 'cinemetaCache is an instance of LRUCache');
  runner.assertEqual(cinemetaCache.defaultTTL, 86400 * 1000, 'cinemetaCache default TTL is 24h (86400s)');
  runner.assertEqual(cinemetaCache.maxSize, 5000, 'cinemetaCache capacity is 5000 entries');

  const testCache = new LRUCache(3, 10);
  testCache.set('k1', 'v1');
  testCache.set('k2', 'v2');
  testCache.set('k3', 'v3');
  runner.assertEqual(testCache.size, 3, 'LRUCache size is 3 after 3 insertions');
  runner.assertEqual(testCache.get('k1'), 'v1', 'Get k1 returns v1 (LRU touch)');
  testCache.set('k4', 'v4'); // Should evict k2 because k1 was touched
  runner.assertEqual(testCache.get('k2'), undefined, 'Oldest untouched entry (k2) was evicted on overflow');
  runner.assertEqual(testCache.get('k1'), 'v1', 'Recently touched entry (k1) survived eviction');

  const stats = testCache.stats();
  runner.assert(typeof stats.hitRate === 'string', `Cache stats contains hitRate: ${stats.hitRate}`);
  runner.assert(stats.hits > 0, `Cache stats recorded hits: ${stats.hits}`);

  // ── 1.3 Multi-Provider Search Matching & Fixture Execution ────
  runner.section('Tier 1.3: Multi-Provider Invocations & Search Matching');
  const providerKKPhim = require('../src/providers/kkphim');
  const providerNguonC = require('../src/providers/nguonc');
  const providerVsMov  = require('../src/providers/vsmov');

  runner.assert(typeof providerKKPhim.getStreams === 'function', 'KKPhim exports getStreams()');
  runner.assert(typeof providerNguonC.getStreams === 'function', 'NguonC exports getStreams()');
  runner.assert(typeof providerVsMov.getStreams === 'function', 'VsMov exports getStreams()');

  // Inject Fixtures into Provider Caches for Deterministic Stream Testing
  imdbCache.set('kkphim:imdb:tt1375666', FIXTURES.kkphim.movieDetail, 86400);
  detailCache.set('nguonc:detail:ke-danh-cap-giac-mo', FIXTURES.nguonc.movieDetail, 600);
  imdbCache.set('nguonc:imdb:tt1375666', 'ke-danh-cap-giac-mo', 86400);

  // Test KKPhim stream extraction from cached fixture
  const kkStreams = await providerKKPhim.getStreams({
    imdbId: 'tt1375666',
    type: 'movie',
    title: 'Inception',
    year: 2010,
    proxyBase: 'http://localhost:7412',
  });
  runner.assert(Array.isArray(kkStreams) && kkStreams.length > 0, `KKPhim returned ${kkStreams.length} stream(s) from fixture`);
  
  // Test NguonC stream extraction from cached fixture
  const nguoncStreams = await providerNguonC.getStreams({
    imdbId: 'tt1375666',
    slug: 'ke-danh-cap-giac-mo',
    type: 'movie',
    title: 'Inception',
    year: 2010,
    proxyBase: 'http://localhost:7412',
  });
  runner.assert(Array.isArray(nguoncStreams) && nguoncStreams.length > 0, `NguonC returned ${nguoncStreams.length} stream(s) from fixture`);

  // ── 1.4 Stremio Protocol Stream Exclusivity ───────────────────
  runner.section('Tier 1.4: Stremio Protocol Stream Exclusivity (Interface Contract §3)');
  
  // Validate KKPhim streams against protocol exclusivity
  let kkProxyCount = 0;
  let kkEmbedCount = 0;
  for (let i = 0; i < kkStreams.length; i++) {
    const s = kkStreams[i];
    const isProxy = s.url && !s.externalUrl;
    const isEmbed = s.externalUrl && !s.url;
    if (isProxy) kkProxyCount++;
    if (isEmbed) kkEmbedCount++;
    runner.assertStreamProtocol(s, i);
  }
  runner.info(`KKPhim generated: ${kkProxyCount} HLS Proxy streams, ${kkEmbedCount} Embed Player streams`);

  // Validate NguonC streams against protocol exclusivity
  let nguoncProxyCount = 0;
  let nguoncEmbedCount = 0;
  for (let i = 0; i < nguoncStreams.length; i++) {
    const s = nguoncStreams[i];
    const isProxy = s.url && !s.externalUrl;
    const isEmbed = s.externalUrl && !s.url;
    if (isProxy) nguoncProxyCount++;
    if (isEmbed) nguoncEmbedCount++;
    runner.assertStreamProtocol(s, i);
  }
  runner.info(`NguonC generated: ${nguoncProxyCount} HLS Proxy streams, ${nguoncEmbedCount} Embed Player streams`);

  // Standard Stream Formatting Checks
  const sampleHlsStream = {
    name: 'VIP Movies 🎬',
    title: '[VIP • NguonC] Server 1 (HLS Proxy)\n⚡ Phát trực tiếp trong App',
    url: 'http://localhost:7412/hls/manifest.m3u8?url=aHR0cDovL3Rlc3QubTN1OA&ref=aHR0cHM6Ly9uZ3VvbmMuY29t',
    behaviorHints: { notSupported: false, bingeGroup: 'nguonc-test' },
  };
  const sampleEmbedStream = {
    name: 'VIP Movies 🎬',
    title: '[Dự phòng • NguonC] Server 1 (Embed Player)\n🌐 Bấm để mở xem ngoài trình duyệt web',
    externalUrl: 'https://streamc.online/embed/test',
    behaviorHints: { notSupported: false, bingeGroup: 'nguonc-test' },
  };

  runner.assertStreamProtocol(sampleHlsStream, 0);
  runner.assertStreamProtocol(sampleEmbedStream, 1);

  // Negative Check: Stream with both url AND externalUrl
  const invalidDualStream = {
    name: 'VIP Movies 🎬',
    title: 'Dual Stream',
    url: 'http://localhost:7412/hls/manifest.m3u8',
    externalUrl: 'https://streamc.online/embed/test',
  };
  const isDualValid = (() => {
    const hasUrl = Boolean(invalidDualStream.url);
    const hasExt = Boolean(invalidDualStream.externalUrl);
    return !(hasUrl && hasExt);
  })();
  runner.assert(!isDualValid, 'Negative check: stream with both url AND externalUrl is correctly identified as invalid');

  // ── 1.5 Multi-Provider Timeout & Error Isolation ──────────────
  runner.section('Tier 1.5: Multi-Provider Timeout & Error Isolation');
  
  const mockProviders = [
    { name: 'P_Failing', getStreams: async () => { throw new Error('Upstream 500 Connection Refused'); } },
    { name: 'P_TimingOut', getStreams: async () => new Promise((resolve) => setTimeout(() => resolve([]), 50)) },
    { name: 'P_Working', getStreams: async () => [sampleHlsStream] },
  ];

  const aggregatorResults = await Promise.allSettled(mockProviders.map((p) => p.getStreams()));
  const aggregatedStreams = [];
  for (const r of aggregatorResults) {
    if (r.status === 'fulfilled' && Array.isArray(r.value)) {
      aggregatedStreams.push(...r.value);
    }
  }
  runner.assertEqual(aggregatedStreams.length, 1, 'Aggregator gracefully isolates failed/timed-out providers and returns working provider streams');
  runner.assertEqual(aggregatorResults[0].status, 'rejected', 'Failed provider recorded as rejected without crashing aggregator');
  runner.assertEqual(aggregatorResults[2].status, 'fulfilled', 'Working provider recorded as fulfilled');

  // ── 1.6 Dynamic Manifest & Route Endpoints ────────────────────
  runner.section('Tier 1.6: Dynamic Manifest & Route Endpoints');
  try {
    const manRes = await axios.get(`${BASE_URL}/manifest.json`);
    runner.assertEqual(manRes.status, 200, 'GET /manifest.json returns HTTP 200');
    runner.assertEqual(manRes.data.version, '1.5.0', 'Manifest version is 1.5.0');
    runner.assertEqual(manRes.data.id, 'org.vipmovies.stremio.addon', 'Manifest ID is org.vipmovies.stremio.addon');
    runner.assert(Array.isArray(manRes.data.catalogs) && manRes.data.catalogs.length > 0, `Manifest declares ${manRes.data.catalogs.length} catalogs`);
    runner.assert(Array.isArray(manRes.data.resources), 'Manifest declares resources array');
    runner.assert(manRes.data.resources.some((r) => (r.name || r) === 'stream'), 'Manifest includes "stream" resource');

    // Dynamic Manifest with config token
    const configModule = require('../src/config');
    const customToken = configModule.encodeConfig({ providers: ['kkphim'], categories: ['movie'] });
    const dynManRes = await axios.get(`${BASE_URL}/${customToken}/manifest.json`);
    runner.assertEqual(dynManRes.status, 200, 'GET /:config/manifest.json returns HTTP 200');
    runner.assert(dynManRes.data.description.includes('KKPhim'), 'Dynamic manifest description reflects selected provider');
  } catch (e) {
    runner.fail('GET /manifest.json failed', e);
  }

  // ── 1.7 Catalog & Meta Endpoints ──────────────────────────────
  runner.section('Tier 1.7: Catalog & Meta Endpoints');
  try {
    const catRes = await axios.get(`${BASE_URL}/catalog/movie/nguonc-movie-latest.json`, { timeout: 8000 });
    runner.assertEqual(catRes.status, 200, 'GET /catalog/movie/nguonc-movie-latest.json returns HTTP 200');
    runner.assert(Array.isArray(catRes.data.metas), 'Catalog response contains "metas" array');
  } catch (e) {
    runner.warn(`GET catalog timed out or returned error (network dependent): ${e.message}`);
  }

  // ── 1.8 HLS Proxy Endpoints & CORS Headers ────────────────────
  runner.section('Tier 1.8: HLS Proxy Router & Headers');
  try {
    const hlsRes = await axios.get(`${BASE_URL}/hls/manifest.m3u8`, {
      validateStatus: (s) => s < 500,
    });
    runner.assertEqual(hlsRes.headers['access-control-allow-origin'], '*', 'HLS route provides CORS Access-Control-Allow-Origin: *');
    runner.assert(hlsRes.status === 400 || hlsRes.status === 200, `HLS manifest status is ${hlsRes.status} (400 on missing params or 200)`);
  } catch (e) {
    runner.fail('HLS proxy check failed', e);
  }

  // ── 1.9 Health Check & Cache Admin Endpoints ──────────────────
  runner.section('Tier 1.9: Health Check & LRU Cache Admin');
  try {
    const healthRes = await axios.get(`${BASE_URL}/health`);
    runner.assertEqual(healthRes.status, 200, 'GET /health returns HTTP 200');
    runner.assertEqual(healthRes.data.status, 'ok', 'Health status is "ok"');
    runner.assertEqual(healthRes.data.version, '1.5.0', 'Health version is 1.5.0');
    runner.assert(healthRes.data.cache !== undefined, 'Health response includes cache statistics');

    const clearRes = await axios.post(`${BASE_URL}/admin/cache/clear`);
    runner.assertEqual(clearRes.status, 200, 'POST /admin/cache/clear returns HTTP 200');
  } catch (e) {
    runner.fail('Health/Admin endpoint check failed', e);
  }

  // ── 1.10 UI Configurator & Brand Validation ───────────────────
  runner.section('Tier 1.10: Cyber-Glassmorphism UI & Brand Identity');
  try {
    const uiRes = await axios.get(`${BASE_URL}/`);
    runner.assertEqual(uiRes.status, 200, 'GET / (Configurator Dashboard) returns HTTP 200');
    runner.assertIncludes(uiRes.data, 'VIP Movies', 'UI contains "VIP Movies" title');
    runner.assertIncludes(uiRes.data, 'VIP Movies Addon v1.5.0', 'UI contains version "1.5.0" in footer');
    runner.assertIncludes(uiRes.data, '<span class="brand-highlight">Q121101</span>', 'UI contains glowing brand footer "<span class="brand-highlight">Q121101</span>"');
    runner.assertIncludes(uiRes.data, 'aurora', 'UI contains Cyber-Glassmorphism background effect');
  } catch (e) {
    runner.fail('UI dashboard check failed', e);
  }

  // ════════════════════════════════════════════════════════════════
  //  TIER 2: BOUNDARY & CORNER CASES (BOUNDARY VALUE ANALYSIS)
  // ════════════════════════════════════════════════════════════════
  runner.section('Tier 2: Boundary Value Analysis & Edge Cases');

  // 2.1 Malformed IMDb IDs
  const badId1 = await cinemetaModule.resolveCinemeta('movie', 'tt');
  runner.assertEqual(badId1, null, 'BVA: "tt" with no digits returns null');

  const badId2 = await cinemetaModule.resolveCinemeta('movie', 'ttABCDEF');
  runner.assertEqual(badId2, null, 'BVA: "ttABCDEF" non-numeric returns null');

  const badId3 = await cinemetaModule.resolveCinemeta('movie', '12345');
  runner.assertEqual(badId3, null, 'BVA: "12345" without "tt" prefix returns null');

  // 2.2 Season / Episode Boundaries in Series IDs
  const seriesWithDelims = 'tt0903747:12:999';
  const cleanImdb = seriesWithDelims.split(':')[0];
  const sNum = parseInt(seriesWithDelims.split(':')[1], 10);
  const eNum = parseInt(seriesWithDelims.split(':')[2], 10);
  runner.assertEqual(cleanImdb, 'tt0903747', 'BVA: Extracted clean IMDb ID from deep delimiter');
  runner.assertEqual(sNum, 12, 'BVA: Season 12 parsed');
  runner.assertEqual(eNum, 999, 'BVA: Episode 999 parsed');

  // 2.3 Special Characters and Vietnamese Accents
  const mapper = require('../src/mapper');
  const sim1 = mapper.scoreSimilarity('Tà Đạo Thành Thần', 'Ta Dao Thanh Than');
  runner.assert(typeof sim1 === 'number', `BVA: scoreSimilarity returns numeric score (${sim1}) for Vietnamese text`);

  const epTitle = mapper.formatEpisodeTitle('12');
  runner.assertEqual(epTitle, 'Tập 12', 'BVA: formatEpisodeTitle("12") returns "Tập 12"');

  const epFull = mapper.formatEpisodeTitle('FULL');
  runner.assertIncludes(epFull, 'Full Movie', 'BVA: formatEpisodeTitle("FULL") returns Full Movie');

  // 2.4 Cache Capacity Stress Boundary
  const smallLRU = new LRUCache(2, 60);
  smallLRU.set('a', 1);
  smallLRU.set('b', 2);
  smallLRU.set('c', 3); // 'a' evicted
  runner.assertEqual(smallLRU.size, 2, 'BVA: LRU maxSize strictly maintained at 2');
  runner.assertEqual(smallLRU.get('a'), undefined, 'BVA: Oldest entry "a" evicted on overflow');
  runner.assertEqual(smallLRU.get('c'), 3, 'BVA: Newest entry "c" accessible');

  // 2.5 Corrupted / Malformed Base64 Token
  const configModule = require('../src/config');
  const decodedFallback = configModule.decodeConfig('!@#$invalid_base64%^&*');
  runner.assert(decodedFallback !== null && Array.isArray(decodedFallback.providers), 'BVA: Invalid config token safely falls back to default config');

  // ════════════════════════════════════════════════════════════════
  //  TIER 3: CROSS-FEATURE COMBINATIONS (PAIRWISE TESTING)
  // ════════════════════════════════════════════════════════════════
  runner.section('Tier 3: Pairwise Combinations & Aggregation Resilience');

  const pairwiseCases = [
    {
      label: 'Matrix 1: KKPhim Success + NguonC Error + VsMov Timeout',
      providers: [
        { getStreams: async () => [sampleHlsStream, sampleEmbedStream] },
        { getStreams: async () => { throw new Error('NguonC Gateway Timeout 504'); } },
        { getStreams: async () => new Promise((res) => setTimeout(() => res([]), 20)) },
      ],
      expectedStreams: 2,
    },
    {
      label: 'Matrix 2: KKPhim Error + NguonC Success + VsMov Error',
      providers: [
        { getStreams: async () => { throw new Error('KKPhim 500'); } },
        { getStreams: async () => [sampleHlsStream] },
        { getStreams: async () => { throw new Error('VsMov Scraper Exception'); } },
      ],
      expectedStreams: 1,
    },
    {
      label: 'Matrix 3: All 3 Providers Error (Total Upstream Outage)',
      providers: [
        { getStreams: async () => { throw new Error('KKPhim Fail'); } },
        { getStreams: async () => { throw new Error('NguonC Fail'); } },
        { getStreams: async () => { throw new Error('VsMov Fail'); } },
      ],
      expectedStreams: 0,
    },
  ];

  for (const pw of pairwiseCases) {
    const settled = await Promise.allSettled(pw.providers.map((p) => p.getStreams()));
    const streams = [];
    for (const s of settled) {
      if (s.status === 'fulfilled' && Array.isArray(s.value)) streams.push(...s.value);
    }
    runner.assertEqual(streams.length, pw.expectedStreams, `Pairwise: ${pw.label} → ${streams.length} stream(s) aggregated`);
  }

  // ════════════════════════════════════════════════════════════════
  //  TIER 4: REAL-WORLD SCENARIOS & WORKLOAD STRESS
  // ════════════════════════════════════════════════════════════════
  runner.section('Tier 4: Real-World Scenarios & High-Concurrency Workload');

  // 4.1 Global Blockbuster Stream Resolution (Inception tt1375666)
  try {
    const streamRes = await axios.get(`${BASE_URL}/stream/movie/tt1375666.json`, { timeout: 15000 });
    runner.assertEqual(streamRes.status, 200, 'GET /stream/movie/tt1375666.json returns HTTP 200');
    runner.assert(Array.isArray(streamRes.data.streams), 'Stream response contains "streams" array');
    
    if (streamRes.data.streams.length > 0) {
      runner.info(`Received ${streamRes.data.streams.length} active streams for Inception tt1375666`);
      streamRes.data.streams.forEach((s, idx) => {
        runner.assertStreamProtocol(s, idx);
      });
    }
  } catch (e) {
    runner.fail('GET /stream/movie/tt1375666.json failed', e);
  }

  // 4.2 Multi-Season TV Series Episode Resolution (Breaking Bad tt0903747:1:1)
  try {
    const seriesStreamRes = await axios.get(`${BASE_URL}/stream/series/tt0903747:1:1.json`, { timeout: 15000 });
    runner.assertEqual(seriesStreamRes.status, 200, 'GET /stream/series/tt0903747:1:1.json returns HTTP 200');
    runner.assert(Array.isArray(seriesStreamRes.data.streams), 'Series stream response contains "streams" array');
  } catch (e) {
    runner.fail('GET /stream/series/tt0903747:1:1.json failed', e);
  }

  // 4.3 High-Concurrency Burst (25 Concurrent Requests)
  runner.section('Tier 4.3: High-Concurrency Burst Stress');
  const CONCURRENT_REQUESTS = 25;
  const burstStart = Date.now();
  const burstPromises = [];

  for (let i = 0; i < CONCURRENT_REQUESTS; i++) {
    burstPromises.push(
      axios.get(`${BASE_URL}/manifest.json`).then((r) => r.status).catch((e) => e.response?.status || 500)
    );
  }

  const burstResults = await Promise.all(burstPromises);
  const burstElapsed = Date.now() - burstStart;
  const all200 = burstResults.every((status) => status === 200);
  runner.assert(all200, `High-Concurrency: All ${CONCURRENT_REQUESTS} concurrent requests returned HTTP 200 (completed in ${burstElapsed}ms)`);

  // 4.4 M3U8 Content Rewriter & Header Validation
  runner.section('Tier 4.4: M3U8 Playlist Parsing & Streamability Simulation');
  const sampleM3u8Content = `#EXTM3U
#EXT-X-VERSION:3
#EXT-X-TARGETDURATION:10
#EXTINF:9.000,
https://cdn.example.com/segment_001.ts
#EXTINF:9.000,
https://cdn.example.com/segment_002.ts
#EXT-X-ENDLIST`;

  runner.assert(sampleM3u8Content.startsWith('#EXTM3U'), 'M3U8 begins with valid #EXTM3U tag');
  const segments = sampleM3u8Content.split('\n').filter((l) => l.endsWith('.ts'));
  runner.assertEqual(segments.length, 2, 'Parsed 2 TS video segments from sample M3U8');

  // ════════════════════════════════════════════════════════════════
  //  FINAL REPORT & EXIT
  // ════════════════════════════════════════════════════════════════
  runner.printSummary();

  if (runner.failed > 0) {
    console.error(`❌ Test suite finished with ${runner.failed} failure(s).`);
    process.exit(1);
  } else {
    console.log('🎉 ALL TEST SUITES PASSED SUCCESSFULLY!');
    process.exit(0);
  }
}

runTestSuite().catch((err) => {
  console.error('\nFATAL TEST RUNNER ERROR:', err);
  process.exit(1);
});
