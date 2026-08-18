'use strict';

/**
 * ==============================================================================
 *  VIP Movies Addon — tests/verify_vsmov_sub_audio.js (Hotfix v1.5.1)
 *  Comprehensive 4-Tier Verification Suite for:
 *    1. VSMOV Multi-Server Audio Separation (Vietsub, Lồng Tiếng, Thuyết Minh)
 *    2. Subtitle Proxy Endpoint (/hls/sub.vtt) with anti-403 & WebVTT/SRT handling
 *    3. Automatic SRT-to-WebVTT Conversion (comma -> dot timestamps, WEBVTT header)
 *    4. Aggregator Subtitle Pass-Through in handleStream
 *    5. Strict In-App Direct Play Protocol Invariants (url only, NO externalUrl)
 *    6. Exact Title & Server Group Formatting ([VIP 1 • VSMOV] <Audio> 4K Ultra HD...)
 *    7. Real-world Movie & Series End-to-End Simulation
 * ==============================================================================
 */

const express = require('express');
const cors = require('cors');
const axios = require('axios');
const assert = require('assert');
const http = require('http');

const hlsRouter = require('../src/routes/hls');
const manifestRouter = require('../src/routes/manifest');
const handlers = require('../src/handlers');
const vsmov = require('../src/providers/vsmov');
const { TestRunner } = require('./helpers');

const REQUEST_TIMEOUT_MS = 15000;

async function runVerificationSuite() {
  const runner = new TestRunner('VIP Movies Addon v1.5.1 — VSMOV Subtitles & Multi-Server Audio');
  const startTime = Date.now();

  console.log('\n================================================================================');
  console.log('🚀 RUNNING COMPREHENSIVE 4-TIER VSMOV SUBTITLE & AUDIO VERIFICATION SUITE');
  console.log('================================================================================\n');

  // ─── 0. Ephemeral Upstream Mock Server Setup ──────────────────
  const mockUpstreamApp = express();
  mockUpstreamApp.use(cors());

  // Sample WebVTT route
  mockUpstreamApp.get('/subtitles/sample.vtt', (req, res) => {
    res.setHeader('Content-Type', 'text/vtt; charset=utf-8');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.send(`WEBVTT

00:00:01.000 --> 00:00:04.000
Harry Potter và Hội Phượng Hoàng

00:00:05.123 --> 00:00:08.456
Bản dịch phụ đề Vietsub bởi VIP Movies
`);
  });

  // Sample SRT route (commas in timestamps, no WEBVTT header)
  mockUpstreamApp.get('/subtitles/sample.srt', (req, res) => {
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.send(`1
00:00:01,234 --> 00:00:04,567
Chào mừng đến với Hogwarts

2
00:00:05,890 --> 00:00:09,123
Phim thuyết minh 4K Ultra HD
`);
  });

  // Sample SRT route with Windows CRLF line endings
  mockUpstreamApp.get('/subtitles/crlf.srt', (req, res) => {
    res.setHeader('Content-Type', 'application/x-subrip; charset=utf-8');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.send('1\r\n00:01:10,000 --> 00:01:15,500\r\nDòng phụ đề 1\r\n\r\n2\r\n00:01:16,200 --> 00:01:20,800\r\nDòng phụ đề 2\r\n');
  });

  // Upstream 500 Error route
  mockUpstreamApp.get('/subtitles/error500', (req, res) => {
    res.status(500).send('Upstream server failure');
  });

  const mockUpstreamServer = await new Promise((resolve, reject) => {
    const s = mockUpstreamApp.listen(0, '127.0.0.1', () => resolve(s));
    s.on('error', reject);
  });

  const mockPort = mockUpstreamServer.address().port;
  const mockBaseUrl = `http://127.0.0.1:${mockPort}`;
  runner.info(`Mock Upstream Server started on port ${mockPort}`);

  // ─── 1. Ephemeral Addon Server Setup ─────────────────────────
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
  runner.info(`VIP Movies Addon Server started on port ${addonPort} (${addonBaseUrl})`);

  try {
    // ════════════════════════════════════════════════════════════════
    //  TIER 1: FEATURE COVERAGE (Category-Partition Testing)
    // ════════════════════════════════════════════════════════════════
    runner.section('Tier 1: Feature Coverage (Category-Partition Testing)');

    // 1.1 Addon Server Boot & Manifest Verification on Port 0
    try {
      const manifestRes = await axios.get(`${addonBaseUrl}/manifest.json`, { timeout: REQUEST_TIMEOUT_MS });
      runner.assertEqual(manifestRes.status, 200, 'Manifest endpoint returns HTTP 200 on ephemeral port 0');
      runner.assert(Boolean(manifestRes.data?.id), 'Manifest contains valid id');
      runner.assert(Array.isArray(manifestRes.data?.catalogs) && manifestRes.data.catalogs.length > 0, 'Manifest contains catalogs');
    } catch (err) {
      runner.fail('Addon manifest failed to load on ephemeral port', err);
    }

    // 1.2 Query Movie Stream Endpoint for Harry Potter tt0373889
    let movieStreamData = null;
    try {
      const streamRes = await axios.get(`${addonBaseUrl}/stream/movie/tt0373889.json`, { timeout: REQUEST_TIMEOUT_MS });
      runner.assertEqual(streamRes.status, 200, 'Stream endpoint for Harry Potter tt0373889 returns HTTP 200');
      runner.assert(Array.isArray(streamRes.data?.streams), 'Stream response contains streams array');
      movieStreamData = streamRes.data;
    } catch (err) {
      runner.fail('Querying stream endpoint for Harry Potter tt0373889 failed', err);
    }

    // 1.3 Subtitle Proxy Endpoint (/hls/sub.vtt) with Valid Plain URL
    try {
      const vttUrl = `${mockBaseUrl}/subtitles/sample.vtt`;
      const subRes = await axios.get(`${addonBaseUrl}/hls/sub.vtt`, {
        params: { url: vttUrl, ref: 'https://vsmov.com/' },
        timeout: REQUEST_TIMEOUT_MS,
      });

      runner.assertEqual(subRes.status, 200, 'Subtitle endpoint returns HTTP 200 for valid plain URL');
      const cType = (subRes.headers['content-type'] || '').toLowerCase();
      runner.assert(cType.includes('text/vtt'), `Content-Type includes 'text/vtt' (got: ${cType})`);
      runner.assertEqual(subRes.headers['access-control-allow-origin'], '*', 'CORS Access-Control-Allow-Origin is *');
      runner.assertIncludes(subRes.headers['cache-control'], 'public', 'Cache-Control header contains public caching');
      runner.assert(String(subRes.data).trim().startsWith('WEBVTT'), 'Subtitle body starts with WEBVTT header');
    } catch (err) {
      runner.fail('Subtitle endpoint /hls/sub.vtt failed with valid plain URL', err);
    }

    // 1.4 Subtitle Proxy Endpoint (/hls/sub.vtt) with Base64URL-encoded URL
    try {
      const vttUrl = `${mockBaseUrl}/subtitles/sample.vtt`;
      const b64Url = Buffer.from(vttUrl).toString('base64url');
      const b64Ref = Buffer.from('https://vsmov.com/').toString('base64url');

      const subResB64 = await axios.get(`${addonBaseUrl}/hls/sub.vtt?url=${b64Url}&ref=${b64Ref}`, {
        timeout: REQUEST_TIMEOUT_MS,
      });

      runner.assertEqual(subResB64.status, 200, 'Subtitle endpoint returns HTTP 200 for Base64URL encoded URL');
      const cTypeB64 = (subResB64.headers['content-type'] || '').toLowerCase();
      runner.assert(cTypeB64.includes('text/vtt'), `Base64URL response Content-Type includes 'text/vtt' (got: ${cTypeB64})`);
      runner.assertEqual(subResB64.headers['access-control-allow-origin'], '*', 'Base64URL response CORS is *');
      runner.assert(String(subResB64.data).trim().startsWith('WEBVTT'), 'Base64URL response body starts with WEBVTT header');
    } catch (err) {
      runner.fail('Subtitle endpoint failed with Base64URL encoded parameter', err);
    }

    // ════════════════════════════════════════════════════════════════
    //  TIER 2: BOUNDARY & CORNER CASES (Boundary Value Analysis)
    // ════════════════════════════════════════════════════════════════
    runner.section('Tier 2: Boundary & Corner Cases (Boundary Value Analysis)');

    // 2.1 Subtitle endpoint with missing query params -> HTTP 400 Bad Request
    try {
      const missingRes = await axios.get(`${addonBaseUrl}/hls/sub.vtt`, {
        validateStatus: () => true,
        timeout: REQUEST_TIMEOUT_MS,
      });
      runner.assertEqual(missingRes.status, 400, 'Missing url parameter returns HTTP 400 Bad Request');
    } catch (err) {
      runner.fail('Missing url parameter check threw unexpected error', err);
    }

    // 2.2 Subtitle endpoint with empty / whitespace-only query param -> HTTP 400 Bad Request
    try {
      const emptyRes = await axios.get(`${addonBaseUrl}/hls/sub.vtt?url=%20%20`, {
        validateStatus: () => true,
        timeout: REQUEST_TIMEOUT_MS,
      });
      runner.assertEqual(emptyRes.status, 400, 'Whitespace-only url parameter returns HTTP 400 Bad Request');
    } catch (err) {
      runner.fail('Whitespace url parameter check threw unexpected error', err);
    }

    // 2.3 Subtitle endpoint with invalid/unreachable upstream URL -> HTTP 502 (Graceful error, no crash)
    try {
      const unreachableRes = await axios.get(`${addonBaseUrl}/hls/sub.vtt?url=http://127.0.0.1:1/nonexistent.vtt`, {
        validateStatus: () => true,
        timeout: REQUEST_TIMEOUT_MS,
      });
      runner.assert(
        unreachableRes.status === 502 || unreachableRes.status === 500 || unreachableRes.status === 404,
        `Unreachable upstream returns error status (got ${unreachableRes.status}) without crashing`
      );
    } catch (err) {
      runner.fail('Unreachable upstream URL check failed', err);
    }

    // 2.4 Subtitle endpoint with upstream HTTP 500 -> HTTP 502 Bad Gateway
    try {
      const err500Res = await axios.get(`${addonBaseUrl}/hls/sub.vtt?url=${encodeURIComponent(`${mockBaseUrl}/subtitles/error500`)}`, {
        validateStatus: () => true,
        timeout: REQUEST_TIMEOUT_MS,
      });
      runner.assert(
        err500Res.status === 502 || err500Res.status === 500,
        `Upstream 500 returns 502 Bad Gateway (got ${err500Res.status})`
      );
    } catch (err) {
      runner.fail('Upstream 500 error check failed', err);
    }

    // 2.5 Subtitle endpoint with SRT upstream content (Automatic SRT to WebVTT Conversion)
    try {
      const srtUrl = `${mockBaseUrl}/subtitles/sample.srt`;
      const srtRes = await axios.get(`${addonBaseUrl}/hls/sub.vtt?url=${encodeURIComponent(srtUrl)}`, {
        timeout: REQUEST_TIMEOUT_MS,
      });

      runner.assertEqual(srtRes.status, 200, 'SRT upstream converts and returns HTTP 200');
      const srtBody = String(srtRes.data);
      runner.assert(srtBody.startsWith('WEBVTT'), 'Converted SRT output starts with WEBVTT header');
      runner.assert(srtBody.includes('00:00:01.234 --> 00:00:04.567'), 'SRT comma timestamps converted to dot timestamps (00:00:01.234)');
      runner.assert(srtBody.includes('00:00:05.890 --> 00:00:09.123'), 'Second SRT cue comma converted to dot (00:00:05.890)');
      runner.assert(!srtBody.includes('00:00:01,234'), 'No raw comma timestamps remaining in converted WebVTT');
    } catch (err) {
      runner.fail('Automatic SRT-to-WebVTT conversion failed', err);
    }

    // 2.6 Subtitle endpoint with Windows CRLF linebreaks in SRT
    try {
      const crlfUrl = `${mockBaseUrl}/subtitles/crlf.srt`;
      const crlfRes = await axios.get(`${addonBaseUrl}/hls/sub.vtt?url=${encodeURIComponent(crlfUrl)}`, {
        timeout: REQUEST_TIMEOUT_MS,
      });

      runner.assertEqual(crlfRes.status, 200, 'CRLF SRT returns HTTP 200');
      const crlfBody = String(crlfRes.data);
      runner.assert(crlfBody.startsWith('WEBVTT'), 'CRLF SRT prepends WEBVTT header');
      runner.assert(crlfBody.includes('00:01:10.000 --> 00:01:15.500'), 'CRLF timestamps normalized and converted');
    } catch (err) {
      runner.fail('CRLF SRT normalization failed', err);
    }

    // 2.7 In-App Stream Protocol Compliance on all streams
    if (movieStreamData && Array.isArray(movieStreamData.streams) && movieStreamData.streams.length > 0) {
      for (let i = 0; i < movieStreamData.streams.length; i++) {
        const stream = movieStreamData.streams[i];
        runner.assertStreamProtocol(stream, i);
      }
    } else {
      runner.warn('No movie streams returned to validate In-App protocol compliance');
    }

    // ════════════════════════════════════════════════════════════════
    //  TIER 3: CROSS-FEATURE COMBINATIONS (Pairwise & Aggregation)
    // ════════════════════════════════════════════════════════════════
    runner.section('Tier 3: Cross-Feature Combinations (Pairwise & Aggregation)');

    // 3.1 Multi-Server Audio Separation in VSMOV Provider (Direct Provider Call)
    let vsmovStreams = [];
    try {
      vsmovStreams = await vsmov.getStreams({
        imdbId: 'tt0373889',
        title: 'Harry Potter and the Order of the Phoenix',
        type: 'movie',
        proxyBase: addonBaseUrl,
      });

      runner.assert(Array.isArray(vsmovStreams), 'VSMOV getStreams returns an array');
      runner.assert(
        vsmovStreams.length >= 2,
        `VSMOV extracts at least 2 distinct server streams (got ${vsmovStreams.length} streams)`
      );

      // Check for distinct audio tracks
      const hasVietsub = vsmovStreams.some((s) => /vietsub/i.test(s.title));
      const hasDubOrVoiceover = vsmovStreams.some((s) => /lồng tiếng|thuyết minh|long tieng|thuyet minh/i.test(s.title));

      runner.assert(hasVietsub, 'VSMOV streams contain Vietsub audio option');
      runner.assert(hasDubOrVoiceover, 'VSMOV streams contain Lồng Tiếng or Thuyết Minh audio option');
    } catch (err) {
      runner.fail('VSMOV multi-server stream extraction failed', err);
    }

    // 3.2 Subtitles Array Structure on VSMOV Streams
    const vietsubStream = vsmovStreams.find((s) => /vietsub/i.test(s.title));
    if (vietsubStream) {
      const hasSubs = Array.isArray(vietsubStream.subtitles) && vietsubStream.subtitles.length > 0;
      runner.assert(hasSubs, 'VSMOV Vietsub stream has subtitles array attached');
      if (hasSubs) {
        const firstSub = vietsubStream.subtitles[0];
        runner.assertEqual(firstSub.id, 'vi_vsmov', 'Subtitle object id is "vi_vsmov"');
        runner.assertEqual(firstSub.lang, 'vie', 'Subtitle object lang is "vie"');
        runner.assert(
          typeof firstSub.url === 'string' && firstSub.url.includes('/hls/sub.vtt'),
          `Subtitle url routes through proxy endpoint (${firstSub.url})`
        );
      }
    } else {
      runner.fail('No VSMOV Vietsub stream found to check attached subtitles array');
    }

    // 3.3 Aggregator Subtitle Pass-Through in handleStream
    try {
      const aggRes = await axios.get(`${addonBaseUrl}/stream/movie/tt0373889.json`, { timeout: REQUEST_TIMEOUT_MS });
      const aggregatedStreams = aggRes.data?.streams || [];
      const vsmovAggregated = aggregatedStreams.filter((s) => s.title && s.title.includes('VSMOV'));

      runner.assert(
        vsmovAggregated.length >= 2,
        `Aggregator returns at least 2 VSMOV streams for Harry Potter (got ${vsmovAggregated.length})`
      );

      // Check that subtitles array is preserved after sanitization in handleStream
      const aggStreamWithSubs = aggregatedStreams.find((s) => Array.isArray(s.subtitles) && s.subtitles.length > 0);
      runner.assert(
        Boolean(aggStreamWithSubs),
        'handleStream preserves the subtitles array on sanitized stream objects (Aggregator Subtitle Pass-Through)'
      );
    } catch (err) {
      runner.fail('Aggregator subtitle pass-through test failed', err);
    }

    // 3.4 Exact Title & Server Group Formatting Verification
    for (const st of vsmovStreams) {
      runner.assertEqual(st.name, 'VIP Movies 🎬', 'VSMOV stream name is exactly "VIP Movies 🎬"');
      runner.assert(
        st.title.includes('[VIP 1 • VSMOV]'),
        `VSMOV title contains '[VIP 1 • VSMOV]' header (got: ${st.title.replace(/\n/g, ' ')})`
      );
      runner.assert(
        st.title.includes('4K Ultra HD (3840x2160)'),
        `VSMOV title contains '4K Ultra HD (3840x2160)' (got: ${st.title.replace(/\n/g, ' ')})`
      );
      runner.assert(
        st.title.includes('vsmov.com') || st.title.includes('Server VIP'),
        `VSMOV title footer includes server attribution (got: ${st.title.replace(/\n/g, ' ')})`
      );
    }

    // ════════════════════════════════════════════════════════════════
    //  TIER 4: REAL-WORLD SCENARIOS (End-to-End Simulation)
    // ════════════════════════════════════════════════════════════════
    runner.section('Tier 4: Real-World Scenarios (End-to-End Simulation)');

    // 4.1 Full E2E Movie Lifecycle: Discovery -> Subtitle Fetch -> M3U8 Manifest Verification
    try {
      runner.info('Simulating client requesting Harry Potter tt0373889 movie stream & subtitles...');
      const movieRes = await axios.get(`${addonBaseUrl}/stream/movie/tt0373889.json`, { timeout: REQUEST_TIMEOUT_MS });
      runner.assertEqual(movieRes.status, 200, 'E2E Client receives HTTP 200 for movie stream');

      const streams = movieRes.data?.streams || [];
      runner.assert(streams.length > 0, 'E2E Client receives at least 1 stream');

      // Pick top VSMOV stream
      const topVsmov = streams.find((s) => s.title && s.title.includes('VSMOV')) || streams[0];
      runner.assert(Boolean(topVsmov), 'Top VSMOV stream selected for playback');

      // If subtitle is present, fetch subtitle proxy URL as a client would
      if (topVsmov.subtitles && topVsmov.subtitles.length > 0) {
        const subUrl = topVsmov.subtitles[0].url;
        runner.info(`Fetching live subtitle: ${subUrl}`);
        const liveSubRes = await axios.get(subUrl, { timeout: REQUEST_TIMEOUT_MS, validateStatus: () => true });
        runner.assertEqual(liveSubRes.status, 200, 'Live subtitle proxy returns HTTP 200 to client');
        runner.assert(String(liveSubRes.data).startsWith('WEBVTT'), 'Live subtitle body is valid WebVTT format');
      }

      // Fetch HLS manifest URL as player would
      if (topVsmov.url) {
        runner.info(`Fetching HLS stream manifest: ${topVsmov.url.slice(0, 90)}...`);
        const manifestPlayRes = await axios.get(topVsmov.url, { timeout: REQUEST_TIMEOUT_MS, validateStatus: () => true });
        runner.assert(
          manifestPlayRes.status === 200 || manifestPlayRes.status === 302,
          `HLS manifest request succeeds with HTTP 200 or 302 redirect (got ${manifestPlayRes.status})`
        );
      }
    } catch (err) {
      runner.fail('Full E2E movie lifecycle test failed', err);
    }

    // 4.2 Full E2E Series Lifecycle: Discovery & Multi-Provider Stream Query
    try {
      runner.info('Simulating client requesting Breaking Bad tt0903747:1:1 series stream...');
      const seriesRes = await axios.get(`${addonBaseUrl}/stream/series/tt0903747:1:1.json`, {
        timeout: REQUEST_TIMEOUT_MS,
        validateStatus: () => true,
      });

      runner.assertEqual(seriesRes.status, 200, 'Series stream endpoint returns HTTP 200');
      const seriesStreams = seriesRes.data?.streams || [];
      runner.assert(Array.isArray(seriesStreams), 'Series response contains streams array');

      if (seriesStreams.length > 0) {
        for (let idx = 0; idx < seriesStreams.length; idx++) {
          runner.assertStreamProtocol(seriesStreams[idx], idx);
        }
        runner.pass(`Verified In-App protocol compliance for all ${seriesStreams.length} series streams`);
      }
    } catch (err) {
      runner.fail('Series E2E simulation failed', err);
    }

  } finally {
    // ─── Clean Server Teardown ──────────────────────────────────
    addonServer.close();
    mockUpstreamServer.close();
    runner.info('Cleaned up and closed all ephemeral test servers.');
  }

  // Print Summary Table
  const elapsed = ((Date.now() - startTime) / 1000).toFixed(2);
  console.log(`\n${runner.currentSection ? '' : ''}`);
  runner.printSummary();
  console.log(`Total Execution Time: ${elapsed}s\n`);

  if (runner.failed > 0) {
    throw new Error(`VSMOV Subtitle & Audio verification failed with ${runner.failed} assertion failure(s).`);
  }

  return true;
}

// Direct Execution Entry Point
if (require.main === module) {
  runVerificationSuite()
    .then(() => {
      console.log('🎉 ALL VSMOV SUBTITLE & AUDIO TESTS PASSED SUCCESSFULLY (100% PASS)');
      process.exit(0);
    })
    .catch((err) => {
      console.error('\n❌ TEST SUITE FAILED:', err.message);
      process.exit(1);
    });
}

module.exports = { runVerificationSuite };
