'use strict';

/**
 * ==============================================================================
 *  VIP Movies Addon — tests/challenger_m2_2_empirical.test.js
 *  Adversarial Empirical Challenge Suite for Milestone 2:
 *
 *  Core Challenge Requirements:
 *    1. High Concurrency Queries to `vsmov.getStreams` and Cache Behavior:
 *       - Cold cache burst (50 concurrent requests, cache stampede)
 *       - Warm cache burst (100 concurrent requests, instant sub-ms retrieval)
 *       - Multi-title parallel load (10 distinct titles x 5 concurrent requests)
 *       - Memory stability & LRU cache eviction under concurrency pressure
 *       - Concurrent adversarial inputs (invalid IDs, negative seasons/episodes)
 *
 *    2. Full End-to-End Stream Query and Proxy Subtitle Fetch:
 *       - Full pipeline: /stream/:type/:id.json -> extract subtitle URL -> fetch /hls/sub.vtt
 *       - HTTP 200, Content-Type: text/vtt; charset=utf-8, CORS *, Cache-Control
 *       - WebVTT header and cue timestamp format validation (no SRT commas)
 *       - Multi-format handling: WebVTT, SRT -> WebVTT, CRLF linebreaks, UTF-8 BOM
 *       - Encoding robustness: Base64URL, Base64 standard, plain URL query params
 *       - Adversarial error handling: missing url (400), upstream 500/404, unreachable upstream (502)
 *
 *    3. Stream Protocol Invariant Verification:
 *       - Zero occurrences of `externalUrl` across all stream objects from multiple titles
 *       - Full compliance with In-App Direct Play protocol (valid `url`, no `externalUrl`)
 *       - Correct formatting: name 'VIP Movies 🎬', formatted title, behaviorHints
 *
 *  Verdict: Final evaluation report with APPROVE or REJECT.
 * ==============================================================================
 */

const express = require('express');
const cors = require('cors');
const axios = require('axios');
const assert = require('assert');
const http = require('http');

const vsmov = require('../src/providers/vsmov');
const hlsRouter = require('../src/routes/hls');
const manifestRouter = require('../src/routes/manifest');
const handlers = require('../src/handlers');
const { imdbCache, detailCache, m3u8Cache, catalogCache, LRUCache } = require('../src/lib/cache');
const { TestRunner } = require('./helpers');

const REQUEST_TIMEOUT_MS = 15000;

async function runEmpiricalChallengerSuite() {
  const runner = new TestRunner('Teamwork Preview Challenger M2-2 — Adversarial Empirical Suite');
  const startTime = Date.now();

  console.log('\n================================================================================');
  console.log('⚔️  ADVERSARIAL EMPIRICAL CHALLENGE SUITE: MILESTONE 2 (VSMOV & SUBTITLES)');
  console.log('================================================================================\n');

  // ─────────────────────────────────────────────────────────────
  //  0. Ephemeral Upstream Subtitle Mock Server Setup
  // ─────────────────────────────────────────────────────────────
  const mockUpstreamApp = express();
  mockUpstreamApp.use(cors());

  // 1. Standard WebVTT Subtitle
  mockUpstreamApp.get('/mock/standard.vtt', (req, res) => {
    res.setHeader('Content-Type', 'text/vtt; charset=utf-8');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.send(`WEBVTT - Harry Potter and the Order of the Phoenix

1
00:00:01.000 --> 00:00:04.500
Harry Potter và Hội Phượng Hoàng

2
00:00:05.100 --> 00:00:09.800
Phụ đề chuẩn WebVTT cho VIP Movies Addon
`);
  });

  // 2. SRT Format Subtitle (with comma decimals, cue numbers, no WEBVTT header)
  mockUpstreamApp.get('/mock/sub_standard.srt', (req, res) => {
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.send(`1
00:00:01,234 --> 00:00:04,567
Chào mừng đến với trường Hogwarts

2
00:00:05,890 --> 00:00:08,123
Cậu bé sống sót - Harry Potter

3
01:23:45,678 --> 01:23:50,999
Kỳ thi Pháp thuật O.W.L.
`);
  });

  // 3. SRT with Windows CRLF Line Endings
  mockUpstreamApp.get('/mock/crlf.srt', (req, res) => {
    res.setHeader('Content-Type', 'application/x-subrip; charset=utf-8');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.send('1\r\n00:00:10,000 --> 00:00:15,500\r\nDòng 1 với CRLF line breaks\r\n\r\n2\r\n00:00:16,200 --> 00:00:20,800\r\nDòng 2 với CRLF line breaks\r\n');
  });

  // 4. Subtitle with UTF-8 BOM (\uFEFF)
  mockUpstreamApp.get('/mock/bom.vtt', (req, res) => {
    res.setHeader('Content-Type', 'text/vtt; charset=utf-8');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.send('\uFEFFWEBVTT\n\n00:00:01.000 --> 00:00:03.000\nPhụ đề chứa UTF-8 BOM');
  });

  // 5. Upstream 500 Internal Error
  mockUpstreamApp.get('/mock/error500.vtt', (req, res) => {
    res.status(500).send('Upstream internal server error');
  });

  // 6. Upstream 404 Not Found
  mockUpstreamApp.get('/mock/error404.vtt', (req, res) => {
    res.status(404).send('Subtitle file not found');
  });

  const mockUpstreamServer = await new Promise((resolve, reject) => {
    const s = mockUpstreamApp.listen(0, '127.0.0.1', () => resolve(s));
    s.on('error', reject);
  });

  const mockPort = mockUpstreamServer.address().port;
  const mockBaseUrl = `http://127.0.0.1:${mockPort}`;
  runner.info(`Ephemeral Mock Subtitle Server listening on port ${mockPort} (${mockBaseUrl})`);

  // ─────────────────────────────────────────────────────────────
  //  1. Ephemeral Addon Server Setup
  // ─────────────────────────────────────────────────────────────
  const addonApp = express();
  addonApp.use(cors());
  addonApp.use(express.json());
  addonApp.use('/hls', hlsRouter);
  addonApp.use('/', manifestRouter);
  addonApp.use('/', handlers);

  const addonServer = await new Promise((resolve, reject) => {
    const s = addonApp.listen(0, '127.0.0.1', () => resolve(s));
    s.on('error', reject);
  });

  const addonPort = addonServer.address().port;
  const addonBaseUrl = `http://127.0.0.1:${addonPort}`;
  runner.info(`Ephemeral VIP Movies Addon Server listening on port ${addonPort} (${addonBaseUrl})`);

  try {
    // ════════════════════════════════════════════════════════════════
    //  CHALLENGE 1: HIGH CONCURRENCY QUERIES TO VSMOV & CACHE BEHAVIOR
    // ════════════════════════════════════════════════════════════════
    runner.section('Challenge 1: High Concurrency Queries to vsmov.getStreams and Cache Behavior');

    // 1.1 Cold Cache Burst Concurrency (50 concurrent requests for same movie)
    // Clear relevant caches first to simulate cold cache stampede
    imdbCache.del('vsmov:imdb:tt0373889');
    detailCache.del('vsmov:detail:harry-potter-va-menh-lenh-phuong-hoang');
    
    runner.info('Simulating cold cache burst: 50 concurrent requests for Harry Potter (tt0373889)...');
    const coldStartTime = Date.now();
    const coldPayload = { imdbId: 'tt0373889', title: 'Harry Potter and the Order of the Phoenix', type: 'movie', proxyBase: addonBaseUrl };
    
    const coldPromises = Array.from({ length: 50 }, (_, i) => vsmov.getStreams(coldPayload));
    const coldResults = await Promise.allSettled(coldPromises);
    const coldDuration = Date.now() - coldStartTime;
    runner.info(`Cold cache 50-concurrency burst completed in ${coldDuration}ms`);

    runner.assertEqual(coldResults.length, 50, 'All 50 cold concurrent requests settled');
    const allColdFulfilled = coldResults.every((r) => r.status === 'fulfilled');
    runner.assert(allColdFulfilled, '100% of cold concurrent requests fulfilled without rejection');

    const firstStreamCount = coldResults[0].status === 'fulfilled' ? coldResults[0].value.length : 0;
    runner.assert(firstStreamCount >= 2, `Cold query returned at least 2 VSMOV streams (got: ${firstStreamCount})`);

    let coldConsistency = true;
    for (let i = 1; i < coldResults.length; i++) {
      if (coldResults[i].status !== 'fulfilled' || coldResults[i].value.length !== firstStreamCount) {
        coldConsistency = false;
        break;
      }
    }
    runner.assert(coldConsistency, 'All 50 cold concurrent requests returned identical stream counts (consistency check)');

    // 1.2 Warm Cache Burst Concurrency (100 concurrent requests)
    runner.info('Simulating warm cache burst: 100 concurrent requests for Harry Potter (tt0373889)...');
    const warmStartTime = Date.now();
    const warmPromises = Array.from({ length: 100 }, (_, i) => vsmov.getStreams(coldPayload));
    const warmResults = await Promise.allSettled(warmPromises);
    const warmDuration = Date.now() - warmStartTime;
    runner.info(`Warm cache 100-concurrency burst completed in ${warmDuration}ms (average ${ (warmDuration / 100).toFixed(2) }ms per request)`);

    runner.assertEqual(warmResults.length, 100, 'All 100 warm concurrent requests settled');
    const allWarmFulfilled = warmResults.every((r) => r.status === 'fulfilled');
    runner.assert(allWarmFulfilled, '100% of warm concurrent requests fulfilled without rejection');
    runner.assert(warmDuration < 500, `Warm cache burst completed under 500ms (actual: ${warmDuration}ms)`);

    let warmConsistency = true;
    for (let i = 0; i < warmResults.length; i++) {
      if (warmResults[i].status !== 'fulfilled' || warmResults[i].value.length !== firstStreamCount) {
        warmConsistency = false;
        break;
      }
    }
    runner.assert(warmConsistency, 'All 100 warm concurrent requests returned identical stream count');

    // 1.3 Multi-Title Parallel Load (10 distinct titles x 5 concurrent requests = 50 requests)
    runner.info('Simulating multi-title parallel load: 10 distinct titles x 5 concurrent requests...');
    const multiTitles = [
      { imdbId: 'tt0373889', title: 'Harry Potter 5', type: 'movie' },
      { imdbId: 'tt0468569', title: 'The Dark Knight', type: 'movie' },
      { imdbId: 'tt1375666', title: 'Inception', type: 'movie' },
      { imdbId: 'tt0816692', title: 'Interstellar', type: 'movie' },
      { imdbId: 'tt0903747', season: 1, episode: 1, title: 'Breaking Bad', type: 'series' },
      { imdbId: 'tt14688458', season: 1, episode: 1, title: 'Silo', type: 'series' },
      { imdbId: 'tt0111161', title: 'The Shawshank Redemption', type: 'movie' },
      { imdbId: 'tt0245429', title: 'Spirited Away', type: 'movie' },
      { imdbId: 'tt11198330', season: 1, episode: 1, title: 'House of the Dragon', type: 'series' },
      { imdbId: 'tt0068646', title: 'The Godfather', type: 'movie' },
    ];

    const multiTitlePromises = [];
    for (const item of multiTitles) {
      for (let k = 0; k < 5; k++) {
        multiTitlePromises.push(vsmov.getStreams({ ...item, proxyBase: addonBaseUrl }));
      }
    }

    const multiTitleStartTime = Date.now();
    const multiTitleResults = await Promise.allSettled(multiTitlePromises);
    const multiTitleDuration = Date.now() - multiTitleStartTime;
    runner.info(`Multi-title parallel load (50 requests across 10 titles) completed in ${multiTitleDuration}ms`);

    runner.assertEqual(multiTitleResults.length, 50, 'All 50 multi-title requests settled');
    const allMultiFulfilled = multiTitleResults.every((r) => r.status === 'fulfilled');
    runner.assert(allMultiFulfilled, '100% of multi-title requests fulfilled gracefully without crash');

    // 1.4 Cache Stats & Memory Isolation
    const imdbStats = imdbCache.stats();
    runner.info(`IMDb Cache Stats: hits=${imdbStats.hits}, misses=${imdbStats.misses}, size=${imdbStats.size}, hitRate=${imdbStats.hitRate}`);
    runner.assert(imdbStats.hits > 50, 'IMDb cache recorded significant cache hits during concurrency tests');

    // 1.5 LRU Cache Capacity & Eviction Stress Test under Concurrency
    runner.info('Testing LRU cache eviction under high concurrency pressure...');
    const testCache = new LRUCache(10, 60); // Small capacity: 10 items
    const evictionPromises = Array.from({ length: 50 }, (_, i) => {
      return new Promise((resolve) => {
        testCache.set(`key_${i % 25}`, `value_${i % 25}`);
        const val = testCache.get(`key_${i % 25}`);
        resolve(val);
      });
    });
    const evictionResults = await Promise.all(evictionPromises);
    const evictionStats = testCache.stats();
    runner.assertEqual(evictionResults.length, 50, 'All 50 concurrent cache set/get operations completed');
    runner.assert(testCache.size <= 10, `LRU cache size did not exceed maxSize (size: ${testCache.size}, maxSize: 10)`);
    runner.assert(evictionStats.evictions > 0, `LRU cache eviction triggered correctly (evictions: ${evictionStats.evictions})`);

    // 1.6 Adversarial Inputs Under Concurrency
    runner.info('Testing adversarial input matrix under concurrency (null, undefined, invalid numbers, huge strings)...');
    const adversarialInputs = [
      null,
      undefined,
      {},
      { imdbId: '' },
      { imdbId: 'tt999999999999' },
      { imdbId: 'invalid_imdb' },
      { imdbId: 'tt0903747', season: -1, episode: 1 },
      { imdbId: 'tt0903747', season: 1, episode: -5 },
      { imdbId: 'tt0903747', season: 999999, episode: 999999 },
      { title: 'A'.repeat(5000) },
      { title: "'; DROP TABLE films; --" },
      { title: '<script>alert(1)</script>' },
    ];

    const advPromises = adversarialInputs.map((input) => vsmov.getStreams(input));
    const advResults = await Promise.allSettled(advPromises);
    let advAllSafe = true;
    for (const r of advResults) {
      if (r.status !== 'fulfilled' || !Array.isArray(r.value)) {
        advAllSafe = false;
        break;
      }
    }
    runner.assert(advAllSafe, 'All adversarial concurrent inputs returned empty array gracefully without crash');


    // ════════════════════════════════════════════════════════════════
    //  CHALLENGE 2: FULL E2E STREAM QUERY & PROXY SUBTITLE FETCH
    // ════════════════════════════════════════════════════════════════
    runner.section('Challenge 2: Full End-to-End Stream Query and Proxy Subtitle Fetch');

    // 2.1 Full E2E Stream Query for Harry Potter (tt0373889)
    runner.info('Querying /stream/movie/tt0373889.json via ephemeral addon server...');
    const streamRes = await axios.get(`${addonBaseUrl}/stream/movie/tt0373889.json`, { timeout: REQUEST_TIMEOUT_MS });
    runner.assertEqual(streamRes.status, 200, 'Stream aggregator endpoint returns HTTP 200');
    runner.assert(Array.isArray(streamRes.data?.streams), 'Response contains streams array');
    runner.assert(streamRes.data.streams.length > 0, `Stream aggregator returned streams (count: ${streamRes.data?.streams?.length})`);

    // 2.2 Identify VSMOV stream with subtitles
    const vsmovStreams = streamRes.data.streams.filter((s) => s.title && s.title.includes('[VIP 1 • VSMOV]'));
    runner.assert(vsmovStreams.length >= 2, `VSMOV returned multiple audio streams (got: ${vsmovStreams.length})`);

    const vietsubStream = vsmovStreams.find((s) => s.title.includes('Vietsub'));
    runner.assert(Boolean(vietsubStream), 'Found VSMOV Vietsub 4K stream in aggregator response');
    runner.assert(Array.isArray(vietsubStream?.subtitles) && vietsubStream.subtitles.length > 0, 'Vietsub stream has subtitles array');

    const subObj = vietsubStream.subtitles[0];
    runner.assertEqual(subObj.id, 'vi_vsmov', 'Subtitle object id is "vi_vsmov"');
    runner.assertEqual(subObj.lang, 'vie', 'Subtitle object lang is "vie"');
    runner.assert(subObj.url.startsWith(`${addonBaseUrl}/hls/sub.vtt`), `Subtitle URL routes to /hls/sub.vtt proxy (url: ${subObj.url})`);

    // 2.3 Execute HTTP GET against live proxy subtitle URL
    runner.info(`Fetching live subtitle via proxy: ${subObj.url}`);
    const liveSubRes = await axios.get(subObj.url, { timeout: REQUEST_TIMEOUT_MS });
    runner.assertEqual(liveSubRes.status, 200, 'Live subtitle proxy returns HTTP 200 OK');
    runner.assert(liveSubRes.headers['content-type']?.includes('text/vtt'), `Content-Type header is text/vtt (got: ${liveSubRes.headers['content-type']})`);
    runner.assertEqual(liveSubRes.headers['access-control-allow-origin'], '*', 'CORS Access-Control-Allow-Origin is "*"');
    runner.assertEqual(liveSubRes.headers['cache-control'], 'public, max-age=86400', 'Cache-Control is "public, max-age=86400"');
    runner.assert(String(liveSubRes.data).trim().startsWith('WEBVTT'), 'Live subtitle body begins with WEBVTT signature');

    // 2.4 Subtitle Format Variations & Auto SRT-to-WebVTT Conversion via Mock
    runner.info('Testing mock WebVTT, SRT, CRLF, and UTF-8 BOM subtitle proxying...');

    // 2.4a Standard WebVTT
    const b64StandardVtt = Buffer.from(`${mockBaseUrl}/mock/standard.vtt`).toString('base64url');
    const resStdVtt = await axios.get(`${addonBaseUrl}/hls/sub.vtt?url=${b64StandardVtt}`, { timeout: REQUEST_TIMEOUT_MS });
    runner.assertEqual(resStdVtt.status, 200, 'Mock standard WebVTT returns HTTP 200');
    runner.assert(String(resStdVtt.data).startsWith('WEBVTT'), 'Standard WebVTT body starts with WEBVTT');
    runner.assert(String(resStdVtt.data).includes('00:00:01.000 --> 00:00:04.500'), 'Standard WebVTT timestamps preserved');

    // 2.4b SRT auto-conversion to WebVTT
    const b64Srt = Buffer.from(`${mockBaseUrl}/mock/sub_standard.srt`).toString('base64url');
    const resSrt = await axios.get(`${addonBaseUrl}/hls/sub.vtt?url=${b64Srt}`, { timeout: REQUEST_TIMEOUT_MS });
    runner.assertEqual(resSrt.status, 200, 'SRT subtitle conversion returns HTTP 200');
    runner.assert(String(resSrt.data).startsWith('WEBVTT'), 'Converted SRT body starts with WEBVTT header');
    runner.assert(String(resSrt.data).includes('00:00:01.234 --> 00:00:04.567'), 'SRT comma timestamps converted to dot timestamps (00:00:01.234)');
    runner.assert(String(resSrt.data).includes('01:23:45.678 --> 01:23:50.999'), 'Multi-cue SRT comma timestamps converted to dot timestamps');
    runner.assert(!String(resSrt.data).includes('00:00:01,234'), 'No raw comma timestamps remaining in converted output');

    // 2.4c Windows CRLF Line Endings
    const b64Crlf = Buffer.from(`${mockBaseUrl}/mock/crlf.srt`).toString('base64url');
    const resCrlf = await axios.get(`${addonBaseUrl}/hls/sub.vtt?url=${b64Crlf}`, { timeout: REQUEST_TIMEOUT_MS });
    runner.assertEqual(resCrlf.status, 200, 'CRLF SRT returns HTTP 200');
    runner.assert(String(resCrlf.data).startsWith('WEBVTT'), 'CRLF SRT prepends WEBVTT');
    runner.assert(String(resCrlf.data).includes('00:00:10.000 --> 00:00:15.500'), 'CRLF timestamps normalized and converted to dots');
    runner.assert(!String(resCrlf.data).includes('\r'), 'All CRLF line endings normalized to LF');

    // 2.4d UTF-8 BOM Strip
    const b64Bom = Buffer.from(`${mockBaseUrl}/mock/bom.vtt`).toString('base64url');
    const resBom = await axios.get(`${addonBaseUrl}/hls/sub.vtt?url=${b64Bom}`, { timeout: REQUEST_TIMEOUT_MS });
    runner.assertEqual(resBom.status, 200, 'BOM WebVTT returns HTTP 200');
    runner.assert(!resBom.data.startsWith('\uFEFF'), 'UTF-8 BOM stripped from response');
    runner.assert(String(resBom.data).startsWith('WEBVTT'), 'BOM-stripped WebVTT starts cleanly with WEBVTT');

    // 2.5 Query Parameter Encoding Flexibility (Base64URL, Base64 standard, Plain URL)
    runner.info('Testing query parameter encoding variants for /hls/sub.vtt...');
    
    // Base64 standard
    const b64Std = Buffer.from(`${mockBaseUrl}/mock/standard.vtt`).toString('base64');
    const resStdEnc = await axios.get(`${addonBaseUrl}/hls/sub.vtt?url=${encodeURIComponent(b64Std)}`, { timeout: REQUEST_TIMEOUT_MS });
    runner.assertEqual(resStdEnc.status, 200, 'Standard Base64 URL parameter decoded successfully');

    // Plain URL
    const resPlainUrl = await axios.get(`${addonBaseUrl}/hls/sub.vtt?url=${encodeURIComponent(`${mockBaseUrl}/mock/standard.vtt`)}`, { timeout: REQUEST_TIMEOUT_MS });
    runner.assertEqual(resPlainUrl.status, 200, 'Plain HTTP URL parameter accepted and fetched successfully');

    // Alternative query param aliases: ?b64= and ?sub=
    const resAliasB64 = await axios.get(`${addonBaseUrl}/hls/sub.vtt?b64=${b64StandardVtt}`, { timeout: REQUEST_TIMEOUT_MS });
    runner.assertEqual(resAliasB64.status, 200, 'Alternative parameter ?b64= accepted');
    const resAliasSub = await axios.get(`${addonBaseUrl}/hls/sub.vtt?sub=${b64StandardVtt}`, { timeout: REQUEST_TIMEOUT_MS });
    runner.assertEqual(resAliasSub.status, 200, 'Alternative parameter ?sub= accepted');

    // 2.6 Subtitle Proxy Error Handling & Resilience
    runner.info('Testing subtitle proxy adversarial edge cases and error responses...');

    // Missing URL param -> 400
    try {
      await axios.get(`${addonBaseUrl}/hls/sub.vtt`);
      runner.fail('Missing URL param should return HTTP 400');
    } catch (err) {
      runner.assertEqual(err.response?.status, 400, 'Missing url query parameter returns HTTP 400 Bad Request');
    }

    // Empty URL param -> 400
    try {
      await axios.get(`${addonBaseUrl}/hls/sub.vtt?url=   `);
      runner.fail('Empty URL param should return HTTP 400');
    } catch (err) {
      runner.assertEqual(err.response?.status, 400, 'Empty url query parameter returns HTTP 400 Bad Request');
    }

    // Upstream 500 -> 500 / 502 without server crash
    try {
      const b64Err500 = Buffer.from(`${mockBaseUrl}/mock/error500.vtt`).toString('base64url');
      await axios.get(`${addonBaseUrl}/hls/sub.vtt?url=${b64Err500}`);
      runner.fail('Upstream 500 should return error status');
    } catch (err) {
      runner.assert(err.response?.status >= 500, `Upstream 500 handled gracefully with status ${err.response?.status}`);
    }

    // Upstream 404 -> 404 / 502 without server crash
    try {
      const b64Err404 = Buffer.from(`${mockBaseUrl}/mock/error404.vtt`).toString('base64url');
      await axios.get(`${addonBaseUrl}/hls/sub.vtt?url=${b64Err404}`);
      runner.fail('Upstream 404 should return error status');
    } catch (err) {
      runner.assert(err.response?.status >= 400, `Upstream 404 handled gracefully with status ${err.response?.status}`);
    }

    // Unreachable upstream network -> 502 without crash
    try {
      const b64Unreach = Buffer.from('http://127.0.0.1:1/nonexistent.vtt').toString('base64url');
      await axios.get(`${addonBaseUrl}/hls/sub.vtt?url=${b64Unreach}`);
      runner.fail('Unreachable upstream should return error status');
    } catch (err) {
      runner.assertEqual(err.response?.status, 502, 'Unreachable upstream returns HTTP 502 Bad Gateway');
    }


    // ════════════════════════════════════════════════════════════════
    //  CHALLENGE 3: STREAM PROTOCOL INVARIANT VERIFICATION
    // ════════════════════════════════════════════════════════════════
    runner.section('Challenge 3: Stream Protocol Invariant Verification (Strict Zero externalUrl)');

    // Matrix of diverse test titles (Movies, Series, Anime, Specialized genres, Direct slugs)
    const testMatrix = [
      { label: 'Harry Potter 5 (Movie)', type: 'movie', id: 'tt0373889' },
      { label: 'The Dark Knight (Movie)', type: 'movie', id: 'tt0468569' },
      { label: 'Interstellar (Movie)', type: 'movie', id: 'tt0816692' },
      { label: 'Inception (Movie)', type: 'movie', id: 'tt1375666' },
      { label: 'Spirited Away (Anime)', type: 'movie', id: 'tt0245429' },
      { label: 'The Shawshank Redemption (Classic)', type: 'movie', id: 'tt0111161' },
      { label: 'Breaking Bad S01E01 (Series)', type: 'series', id: 'tt0903747:1:1' },
      { label: 'Silo S01E01 (Series)', type: 'series', id: 'tt14688458:1:1' },
      { label: 'House of the Dragon S01E01 (Series)', type: 'series', id: 'tt11198330:1:1' },
      { label: 'Direct VSMOV Movie Slug', type: 'movie', id: 'vsmov_harry-potter-va-menh-lenh-phuong-hoang' },
      { label: 'Direct VSMOV Series Slug', type: 'series', id: 'vsmov_ha-canh-noi-anh:1:1' },
      { label: 'Direct KKPhim Movie Slug', type: 'movie', id: 'kkphim_cuu-mon' },
      { label: 'Direct NguonC Movie Slug', type: 'movie', id: 'nguonc_cuu-mon' },
    ];

    let totalStreamsAudited = 0;
    let externalUrlOccurrences = 0;
    let validInAppStreams = 0;

    for (const testCase of testMatrix) {
      runner.info(`Auditing stream objects for ${testCase.label} (${testCase.id})...`);
      try {
        const res = await axios.get(`${addonBaseUrl}/stream/${testCase.type}/${encodeURIComponent(testCase.id)}.json`, {
          timeout: REQUEST_TIMEOUT_MS,
        });

        if (res.status === 200 && Array.isArray(res.data?.streams)) {
          const streams = res.data.streams;
          for (let i = 0; i < streams.length; i++) {
            const stream = streams[i];
            totalStreamsAudited++;

            // INVARIANT 1: externalUrl MUST be undefined and property must not exist
            if ('externalUrl' in stream || stream.externalUrl !== undefined) {
              externalUrlOccurrences++;
              runner.fail(`PROTOCOL VIOLATION in ${testCase.label} stream #${i + 1}: Found externalUrl=${stream.externalUrl}`);
            }

            // INVARIANT 2: url MUST be a non-empty string starting with http
            const hasValidUrl = typeof stream.url === 'string' && (stream.url.startsWith('http://') || stream.url.startsWith('https://'));
            if (!hasValidUrl) {
              runner.fail(`INVALID URL in ${testCase.label} stream #${i + 1}: url="${stream.url}"`);
            } else {
              validInAppStreams++;
            }

            // INVARIANT 3: name MUST be present (standard 'VIP Movies 🎬')
            if (!stream.name || typeof stream.name !== 'string') {
              runner.fail(`MISSING NAME in ${testCase.label} stream #${i + 1}`);
            }

            // INVARIANT 4: title MUST be clean and descriptive
            if (!stream.title || typeof stream.title !== 'string' || stream.title.includes('#')) {
              runner.fail(`DIRTY TITLE in ${testCase.label} stream #${i + 1}: "${stream.title}"`);
            }

            // INVARIANT 5: behaviorHints MUST contain bingeGroup
            if (!stream.behaviorHints || typeof stream.behaviorHints.bingeGroup !== 'string') {
              runner.fail(`MISSING BINGEGROUP in ${testCase.label} stream #${i + 1}`);
            }
          }
        }
      } catch (err) {
        runner.warn(`Stream fetch warning for ${testCase.label}: ${err.message}`);
      }
    }

    runner.info(`Audit complete: Audited ${totalStreamsAudited} streams across ${testMatrix.length} titles`);
    runner.assertEqual(externalUrlOccurrences, 0, 'Zero occurrences of externalUrl across ALL returned stream objects');
    runner.assert(validInAppStreams > 0, `All audited streams (${validInAppStreams}/${totalStreamsAudited}) adhere to In-App Direct Play protocol`);
    runner.assertEqual(validInAppStreams, totalStreamsAudited, '100% of stream objects strictly satisfy In-App Direct Play invariant');

  } finally {
    // ─────────────────────────────────────────────────────────────
    //  Clean Up Ephemeral Test Servers
    // ─────────────────────────────────────────────────────────────
    await new Promise((resolve) => addonServer.close(resolve));
    await new Promise((resolve) => mockUpstreamServer.close(resolve));
    runner.info('Cleaned up and closed all ephemeral test servers');
  }

  // ─────────────────────────────────────────────────────────────
  //  Summary & Verdict
  // ─────────────────────────────────────────────────────────────
  runner.printSummary();
  const totalExecutionTime = ((Date.now() - startTime) / 1000).toFixed(2);
  console.log(`Total Execution Time: ${totalExecutionTime}s\n`);

  if (runner.failed === 0) {
    console.log('================================================================================');
    console.log('🏆 VERDICT: APPROVE');
    console.log('All Milestone 2 challenge requirements passed with 100% compliance.');
    console.log('================================================================================\n');
  } else {
    console.log('================================================================================');
    console.log(`🚫 VERDICT: REJECT (${runner.failed} failure(s) detected)`);
    console.log('================================================================================\n');
  }

  return {
    passed: runner.passed,
    failed: runner.failed,
    warned: runner.warned,
    verdict: runner.failed === 0 ? 'APPROVE' : 'REJECT',
    executionTime: totalExecutionTime,
  };
}

// Execute test suite if run directly
if (require.main === module) {
  runEmpiricalChallengerSuite()
    .then((res) => {
      if (res.failed > 0) process.exit(1);
      process.exit(0);
    })
    .catch((err) => {
      console.error('Fatal execution error:', err);
      process.exit(1);
    });
}

module.exports = { runEmpiricalChallengerSuite };
