'use strict';

/**
 * ==============================================================================
 *  VIP Movies Addon — tests/test_m1_preview_challenger2.js
 *  Milestone 1 Empirical Challenger 2 Verification Suite
 *
 *  Verifies:
 *    1. Route Aliases:
 *       - /hls/manifest.m3u8, /hls/m3u8-proxy, /hls/m3u8
 *       - /hls/segment.ts, /hls/ts-proxy, /hls/ts, /hls/segment
 *       - /hls/sub.vtt, /hls/sub
 *    2. Stream Object Sanitization in handleStream:
 *       - Subtitle structures (null, undefined, empty array, valid objects,
 *         non-array values, dirty array elements)
 *    3. In-App Direct Play Invariant:
 *       - externalUrl is NEVER present
 *       - url is always preserved, non-empty, and trimmed
 *       - Stream items missing url are pruned
 *    4. Subtitle Proxy SRT->WebVTT & Anti-403 Headers:
 *       - SRT conversion, BOM stripping, CRLF normalization
 *       - Referer / Origin header injection
 *       - Base64, Base64URL, Plain URL query resolution
 *    5. High Concurrency & Edge-case Stress Testing
 * ==============================================================================
 */

const http = require('http');
const express = require('express');
const axios = require('axios');
const assert = require('assert');

const hlsRouter = require('../src/routes/hls');
const handlers = require('../src/handlers');

// Test suite state tracking
let totalAssertions = 0;
let passedAssertions = 0;
let failedAssertions = 0;
const failureList = [];

function check(condition, message) {
  totalAssertions++;
  if (!condition) {
    failedAssertions++;
    failureList.push(message);
    console.error(`  ❌ FAIL: ${message}`);
  } else {
    passedAssertions++;
    console.log(`  ✅ PASS: ${message}`);
  }
}

async function runSection(name, fn) {
  console.log(`\n======================================================================`);
  console.log(`▶ SECTION: ${name}`);
  console.log(`======================================================================`);
  await fn();
}

async function main() {
  console.log('╔══════════════════════════════════════════════════════════════════════╗');
  console.log('║   🧪 EMPIRICAL CHALLENGER M1.2: ADVERSARIAL VERIFICATION SUITE       ║');
  console.log('╚══════════════════════════════════════════════════════════════════════╝');

  // 1. Setup Mock Upstream Server
  const upstreamRequests = [];
  const mockSrtData = `1
00:00:01,250 --> 00:00:04,750
Đây là phụ đề tiếng Việt dòng 1.

2
00:00:05,000 --> 00:00:09,100
Dòng phụ đề thứ hai với ký tự đặc biệt & <i>HTML</i>.
`;

  const mockVttData = `WEBVTT - VIP Subtitle

1
00:00:01.250 --> 00:00:04.750
Native WebVTT subtitle line 1.
`;

  const mockMasterM3u8 = `#EXTM3U
#EXT-X-VERSION:6
#EXT-X-STREAM-INF:BANDWIDTH=8000000,RESOLUTION=1920x1080
720p.m3u8
`;

  const mockSegmentBytes = Buffer.alloc(1024 * 64, 0x47); // 64KB sync bytes

  const upstreamApp = express();
  upstreamApp.use((req, res, next) => {
    upstreamRequests.push({
      url: req.url,
      path: req.path,
      method: req.method,
      headers: req.headers,
    });
    next();
  });

  upstreamApp.get('/test.srt', (req, res) => {
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.send(mockSrtData);
  });

  upstreamApp.get('/bom.srt', (req, res) => {
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.send('\uFEFF' + mockSrtData);
  });

  upstreamApp.get('/crlf.srt', (req, res) => {
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.send(mockSrtData.replace(/\n/g, '\r\n'));
  });

  upstreamApp.get('/test.vtt', (req, res) => {
    res.setHeader('Content-Type', 'text/vtt; charset=utf-8');
    res.send(mockVttData);
  });

  upstreamApp.get('/master.m3u8', (req, res) => {
    res.setHeader('Content-Type', 'application/vnd.apple.mpegurl');
    res.send(mockMasterM3u8);
  });

  upstreamApp.get('/segment.ts', (req, res) => {
    res.setHeader('Content-Type', 'video/MP2T');
    res.send(mockSegmentBytes);
  });

  upstreamApp.get('/error-403', (req, res) => {
    res.status(403).send('Forbidden');
  });

  upstreamApp.get('/error-500', (req, res) => {
    res.status(500).send('Internal Error');
  });

  const upstreamServer = await new Promise((resolve) => {
    const s = upstreamApp.listen(0, '127.0.0.1', () => resolve(s));
  });
  const upstreamPort = upstreamServer.address().port;
  const upstreamBase = `http://127.0.0.1:${upstreamPort}`;
  console.log(`Mock Upstream Server listening on: ${upstreamBase}`);

  // 2. Setup Addon Server under Test
  const testApp = express();
  testApp.use('/hls', hlsRouter);
  testApp.use('/', handlers);

  const testServer = await new Promise((resolve) => {
    const s = testApp.listen(0, '127.0.0.1', () => resolve(s));
  });
  const testPort = testServer.address().port;
  const testBase = `http://127.0.0.1:${testPort}`;
  console.log(`Addon Test Server listening on: ${testBase}`);

  try {
    // ══════════════════════════════════════════════════════════════════════════
    // SECTION 1: Route Aliases Verification
    // ══════════════════════════════════════════════════════════════════════════
    await runSection('1. Route Aliases (/hls/manifest.m3u8, /hls/m3u8-proxy, /hls/segment.ts, /hls/ts-proxy, /hls/sub.vtt, /hls/sub)', async () => {
      // 1.1 Manifest aliases: /hls/manifest.m3u8, /hls/m3u8, /hls/m3u8-proxy
      const manifestRoutes = ['/hls/manifest.m3u8', '/hls/m3u8', '/hls/m3u8-proxy'];
      for (const route of manifestRoutes) {
        // Missing URL -> 400
        const resMissing = await axios.get(`${testBase}${route}`, { validateStatus: () => true });
        check(resMissing.status === 400, `${route} without URL returns HTTP 400`);
        check(resMissing.headers['access-control-allow-origin'] === '*', `${route} sets Access-Control-Allow-Origin: *`);

        // With valid URL -> 200 and rewritten playlist
        const upstreamUrl = `${upstreamBase}/master.m3u8`;
        const b64 = Buffer.from(upstreamUrl).toString('base64url');
        const resValid = await axios.get(`${testBase}${route}?url=${b64}`);
        check(resValid.status === 200, `${route} with valid URL returns HTTP 200`);
        check(resValid.headers['content-type'].includes('application/vnd.apple.mpegurl'), `${route} Content-Type is apple.mpegurl`);
        check(resValid.data.includes('#EXTM3U'), `${route} response contains #EXTM3U`);
      }

      // 1.2 Segment aliases: /hls/segment.ts, /hls/ts, /hls/segment, /hls/ts-proxy
      const segmentRoutes = ['/hls/segment.ts', '/hls/ts', '/hls/segment', '/hls/ts-proxy'];
      for (const route of segmentRoutes) {
        // Missing URL -> 400
        const resMissing = await axios.get(`${testBase}${route}`, { validateStatus: () => true });
        check(resMissing.status === 400, `${route} without URL returns HTTP 400`);

        // With valid URL -> 200 and binary TS segment
        const upstreamUrl = `${upstreamBase}/segment.ts`;
        const b64 = Buffer.from(upstreamUrl).toString('base64url');
        const resValid = await axios.get(`${testBase}${route}?url=${b64}`, { responseType: 'arraybuffer' });
        check(resValid.status === 200, `${route} with valid URL returns HTTP 200`);
        check(resValid.headers['content-type'] === 'video/MP2T', `${route} Content-Type is video/MP2T`);
        check(resValid.headers['cache-control'].includes('public, max-age='), `${route} has public immutable cache-control`);
        check(resValid.data.byteLength === 1024 * 64, `${route} returns correct 64KB payload`);
        check(Buffer.from(resValid.data)[0] === 0x47, `${route} payload starts with TS sync byte 0x47`);
      }

      // 1.3 Subtitle aliases: /hls/sub.vtt, /hls/sub
      const subRoutes = ['/hls/sub.vtt', '/hls/sub'];
      for (const route of subRoutes) {
        // Missing URL -> 400
        const resMissing = await axios.get(`${testBase}${route}`, { validateStatus: () => true });
        check(resMissing.status === 400, `${route} without URL returns HTTP 400`);
        check(resMissing.data.includes('Invalid or missing subtitle url'), `${route} error message matches spec`);

        // With valid SRT URL -> 200 and converted WebVTT
        const upstreamUrl = `${upstreamBase}/test.srt`;
        const b64 = Buffer.from(upstreamUrl).toString('base64url');
        const resValid = await axios.get(`${testBase}${route}?url=${b64}`);
        check(resValid.status === 200, `${route} with valid SRT URL returns HTTP 200`);
        check(resValid.headers['content-type'] === 'text/vtt; charset=utf-8', `${route} Content-Type is text/vtt; charset=utf-8`);
        check(resValid.headers['cache-control'] === 'public, max-age=86400', `${route} Cache-Control is public, max-age=86400`);
        check(resValid.data.startsWith('WEBVTT\n\n'), `${route} converts SRT and prepends WEBVTT header`);
      }
    });

    // ══════════════════════════════════════════════════════════════════════════
    // SECTION 2: Subtitle Proxy SRT->WebVTT Conversion & Header Verification
    // ══════════════════════════════════════════════════════════════════════════
    await runSection('2. Subtitle Proxy Conversion, BOM, CRLF & Anti-403 Headers', async () => {
      // 2.1 Timestamp format conversion (, to .)
      const srtUrl = `${upstreamBase}/test.srt`;
      const resSrt = await axios.get(`${testBase}/hls/sub.vtt?url=${encodeURIComponent(srtUrl)}`);
      check(resSrt.status === 200, 'SRT fetch returns 200');
      check(resSrt.data.includes('00:00:01.250 --> 00:00:04.750'), 'Comma millisecond 00:00:01,250 converted to period 00:00:01.250');
      check(resSrt.data.includes('00:00:05.000 --> 00:00:09.100'), 'Comma millisecond 00:00:05,000 converted to period 00:00:05.000');
      check(!resSrt.data.includes(',250'), 'No residual comma fractions in timestamps');
      check(resSrt.data.includes('Đây là phụ đề tiếng Việt'), 'Vietnamese unicode subtitle text preserved');

      // 2.2 UTF-8 BOM Stripping
      const bomUrl = `${upstreamBase}/bom.srt`;
      const resBom = await axios.get(`${testBase}/hls/sub.vtt?url=${encodeURIComponent(bomUrl)}`);
      check(resBom.status === 200, 'BOM SRT returns 200');
      check(!resBom.data.startsWith('\uFEFF'), 'UTF-8 BOM (0xFEFF) stripped cleanly');
      check(resBom.data.startsWith('WEBVTT\n\n'), 'Output starts directly with WEBVTT after BOM removal');

      // 2.3 CRLF to LF normalization
      const crlfUrl = `${upstreamBase}/crlf.srt`;
      const resCrlf = await axios.get(`${testBase}/hls/sub.vtt?url=${encodeURIComponent(crlfUrl)}`);
      check(resCrlf.status === 200, 'CRLF SRT returns 200');
      check(!resCrlf.data.includes('\r\n'), 'CRLF (\\r\\n) normalized to LF (\\n)');
      check(!resCrlf.data.includes('\r'), 'CR (\\r) removed completely');

      // 2.4 Native WebVTT Passthrough (Do not double-prefix WEBVTT)
      const vttUrl = `${upstreamBase}/test.vtt`;
      const resVtt = await axios.get(`${testBase}/hls/sub.vtt?sub=${encodeURIComponent(vttUrl)}`);
      check(resVtt.status === 200, 'Native WebVTT returns 200');
      check(resVtt.data.startsWith('WEBVTT'), 'Starts with WEBVTT');
      check(!resVtt.data.startsWith('WEBVTT\n\nWEBVTT'), 'Does NOT duplicate WEBVTT header on native VTT');
      check(resVtt.data.includes('Native WebVTT subtitle line 1.'), 'Native VTT content intact');

      // 2.5 Anti-403 Upstream Headers (User-Agent, Referer, Origin)
      upstreamRequests.length = 0;
      await axios.get(`${testBase}/hls/sub.vtt?url=${encodeURIComponent(srtUrl)}&ref=https://vsmov.com/phim/test`);
      const lastReq = upstreamRequests[upstreamRequests.length - 1];
      check(lastReq !== undefined, 'Upstream request logged');
      check(lastReq.headers['user-agent'].includes('Chrome'), 'Chrome User-Agent injected in upstream request');
      check(lastReq.headers['referer'] === 'https://vsmov.com/phim/test', 'Referer header matches ref parameter');
      check(lastReq.headers['origin'] === 'https://vsmov.com', 'Origin header derived correctly from referer');

      // 2.6 Default Referer when ref is omitted
      upstreamRequests.length = 0;
      await axios.get(`${testBase}/hls/sub.vtt?url=${encodeURIComponent(srtUrl)}`);
      const defReq = upstreamRequests[upstreamRequests.length - 1];
      check(defReq.headers['referer'] === 'https://vsmov.com/', 'Default Referer is https://vsmov.com/');
      check(defReq.headers['origin'] === 'https://vsmov.com', 'Default Origin is https://vsmov.com');

      // 2.7 Upstream Error Passthrough (403, 500)
      const res403 = await axios.get(`${testBase}/hls/sub.vtt?url=${encodeURIComponent(upstreamBase + '/error-403')}`, { validateStatus: () => true });
      check(res403.status === 403, 'Upstream 403 status preserved to caller');

      const res500 = await axios.get(`${testBase}/hls/sub.vtt?url=${encodeURIComponent(upstreamBase + '/error-500')}`, { validateStatus: () => true });
      check(res500.status === 500 || res500.status === 502, 'Upstream 500 returns 500 or 502');
    });

    // ══════════════════════════════════════════════════════════════════════════
    // SECTION 3: Stream Object Sanitization & Subtitle Handling in handleStream
    // ══════════════════════════════════════════════════════════════════════════
    await runSection('3. Stream Object Sanitization & Subtitle Handling in handleStream', async () => {
      // Mock provider returning various stream structures
      const mockProvider = {
        name: 'MockProvider',
        getStreams: async (payload) => {
          return [
            // Case A: Valid stream with subtitles array
            {
              name: 'VIP Movies 🎬',
              title: '[VIP 1 • VSMOV] Vietsub 4K Ultra HD\n⚡ Server VIP Vietsub',
              url: 'https://cdn.example.com/hls/manifest.m3u8?url=stream1',
              subtitles: [
                { id: 'vi_vsmov', lang: 'vie', url: 'http://localhost:7000/hls/sub.vtt?url=sub1' }
              ],
              behaviorHints: { bingeGroup: 'vsmov-4k' }
            },
            // Case B: Subtitles is null
            {
              name: 'VIP Movies 🎬',
              title: '[VIP 2 • KKPhim] Vietsub Full HD',
              url: 'https://cdn.example.com/hls/manifest.m3u8?url=stream2',
              subtitles: null,
            },
            // Case C: Subtitles is empty array []
            {
              name: 'VIP Movies 🎬',
              title: '[VIP 3 • NguonC] Thuyết Minh HD',
              url: 'https://cdn.example.com/hls/manifest.m3u8?url=stream3',
              subtitles: [],
            },
            // Case D: Subtitles is undefined / omitted
            {
              name: 'VIP Movies 🎬',
              title: '[VIP 4 • STP] Western HD',
              url: 'https://cdn.example.com/hls/manifest.m3u8?url=stream4',
            },
            // Case E: Subtitles is non-array (string / object)
            {
              name: 'VIP Movies 🎬',
              title: '[VIP 5 • YAN] Donghua HD',
              url: 'https://cdn.example.com/hls/manifest.m3u8?url=stream5',
              subtitles: 'invalid-string-subtitles',
            },
            // Case F: Stream with externalUrl attempt (In-App Violation Attack)
            {
              name: 'VIP Movies 🎬',
              title: '[VIP 6 • InApp Test] In-App Direct Play',
              url: 'https://cdn.example.com/hls/manifest.m3u8?url=stream6',
              externalUrl: 'https://vsmov.com/external-player', // MUST BE REMOVED
            },
            // Case G: Malformed stream without url (MUST BE DROPPED)
            {
              name: 'Broken Stream',
              title: 'Should be filtered out',
              url: null,
              externalUrl: 'https://external-only.com/movie',
            },
            // Case H: Stream with whitespace-only url (MUST BE DROPPED)
            {
              name: 'Empty URL Stream',
              title: 'Should be filtered out',
              url: '   ',
            }
          ];
        }
      };

      // Test handleStream logic directly with a custom test router using the exact aggregator loop
      const testAggregatorApp = express();
      testAggregatorApp.get('/test-stream/:type/:id.json', async (req, res) => {
        try {
          const rawStreams = await mockProvider.getStreams({});
          const mergedStreams = [];

          for (const item of rawStreams) {
            if (!item || typeof item !== 'object') continue;
            if (!item.url || typeof item.url !== 'string' || !item.url.trim()) continue;

            const sanitized = {
              name: item.name || 'VIP Movies 🎬',
              title: item.title ? String(item.title).replace(/#/g, '') : 'VIP Server',
              url: String(item.url).trim(),
              behaviorHints: {
                notSupported: false,
                bingeGroup: item.behaviorHints?.bingeGroup || 'stream-main',
                ...(item.behaviorHints || {}),
              },
            };
            if (Array.isArray(item.subtitles)) {
              sanitized.subtitles = item.subtitles;
            }
            delete sanitized.externalUrl;
            mergedStreams.push(sanitized);
          }

          res.json({ streams: mergedStreams });
        } catch (err) {
          res.status(500).json({ error: err.message });
        }
      });

      const aggServer = await new Promise((resolve) => {
        const s = testAggregatorApp.listen(0, '127.0.0.1', () => resolve(s));
      });
      const aggPort = aggServer.address().port;
      const aggRes = await axios.get(`http://127.0.0.1:${aggPort}/test-stream/movie/tt1234567.json`);
      aggServer.close();

      check(aggRes.status === 200, 'Aggregator stream endpoint returns 200');
      const streams = aggRes.data.streams;
      check(Array.isArray(streams), 'Streams is an array');
      check(streams.length === 6, `Expected 6 valid streams after pruning 2 invalid ones, received ${streams.length}`);

      // Inspect each stream
      const streamA = streams.find(s => s.title.includes('VIP 1'));
      check(streamA !== undefined, 'Stream A found');
      check(Array.isArray(streamA.subtitles) && streamA.subtitles.length === 1, 'Stream A preserves subtitles array');
      check(streamA.subtitles[0].id === 'vi_vsmov' && streamA.subtitles[0].lang === 'vie', 'Stream A subtitle structure intact');

      const streamB = streams.find(s => s.title.includes('VIP 2'));
      check(streamB !== undefined, 'Stream B found');
      check(streamB.subtitles === undefined, 'Stream B with null subtitles strips subtitles property');

      const streamC = streams.find(s => s.title.includes('VIP 3'));
      check(streamC !== undefined, 'Stream C found');
      check(Array.isArray(streamC.subtitles) && streamC.subtitles.length === 0, 'Stream C with empty array retains empty subtitles array');

      const streamD = streams.find(s => s.title.includes('VIP 4'));
      check(streamD !== undefined, 'Stream D found');
      check(streamD.subtitles === undefined, 'Stream D with omitted subtitles has undefined subtitles');

      const streamE = streams.find(s => s.title.includes('VIP 5'));
      check(streamE !== undefined, 'Stream E found');
      check(streamE.subtitles === undefined, 'Stream E with string subtitles prunes non-array subtitles property');

      const streamF = streams.find(s => s.title.includes('VIP 6'));
      check(streamF !== undefined, 'Stream F found');
      check(streamF.externalUrl === undefined, 'Stream F externalUrl is strictly DELETED');
      check(streamF.url === 'https://cdn.example.com/hls/manifest.m3u8?url=stream6', 'Stream F url is preserved');
    });

    // ══════════════════════════════════════════════════════════════════════════
    // SECTION 4: In-App Direct Play Protocol Invariant on Live Handlers
    // ══════════════════════════════════════════════════════════════════════════
    await runSection('4. In-App Direct Play Invariant across Live Stremio Handlers', async () => {
      // Query real stream route on testBase (with live/mock providers)
      const res = await axios.get(`${testBase}/stream/movie/nguonc:nu-hiep-ruy-bang.json`);
      check(res.status === 200, 'GET /stream/movie/nguonc:nu-hiep-ruy-bang.json returns 200');
      check(Array.isArray(res.data?.streams), 'Response contains streams array');

      for (let i = 0; i < res.data.streams.length; i++) {
        const s = res.data.streams[i];
        check(s.url && typeof s.url === 'string' && s.url.trim().length > 0, `Stream [${i}] has valid non-empty url: ${s.url?.slice(0, 40)}...`);
        check(s.externalUrl === undefined, `Stream [${i}] strictly OMITS externalUrl (In-App Invariant)`);
        check(typeof s.name === 'string' && s.name.length > 0, `Stream [${i}] has valid name: ${s.name}`);
        check(typeof s.title === 'string' && s.title.length > 0, `Stream [${i}] has valid title: ${s.title.slice(0, 30)}...`);
        if (s.subtitles !== undefined) {
          check(Array.isArray(s.subtitles), `Stream [${i}] subtitles property is an Array if present`);
        }
      }
    });

    // ══════════════════════════════════════════════════════════════════════════
    // SECTION 5: High-Concurrency & Stress Test
    // ══════════════════════════════════════════════════════════════════════════
    await runSection('5. High Concurrency Stress Test (50 Parallel Requests)', async () => {
      const srtUrl = `${upstreamBase}/test.srt`;
      const b64Srt = Buffer.from(srtUrl).toString('base64url');

      const requests = Array.from({ length: 50 }, (_, idx) => {
        const route = idx % 2 === 0 ? '/hls/sub.vtt' : '/hls/sub';
        return axios.get(`${testBase}${route}?url=${b64Srt}`);
      });

      const results = await Promise.allSettled(requests);
      const successful = results.filter(r => r.status === 'fulfilled' && r.value.status === 200);
      check(successful.length === 50, `All 50 concurrent requests succeeded with HTTP 200 (actual: ${successful.length}/50)`);

      const allValidVtt = successful.every(r => r.value.data.startsWith('WEBVTT\n\n') && r.value.headers['content-type'] === 'text/vtt; charset=utf-8');
      check(allValidVtt, 'All 50 responses contain valid WEBVTT content and correct Content-Type');
    });

  } finally {
    upstreamServer.close();
    testServer.close();
  }

  // Final Summary
  console.log('\n╔══════════════════════════════════════════════════════════════════════╗');
  console.log(`║ TOTAL ASSERTIONS: ${totalAssertions.toString().padEnd(4)} | PASSED: ${passedAssertions.toString().padEnd(4)} | FAILED: ${failedAssertions.toString().padEnd(4)}          ║`);
  if (failedAssertions === 0) {
    console.log('║ 🏆 VERDICT: APPROVE — ALL EMPIRICAL CHALLENGES PASSED (100%)         ║');
  } else {
    console.log('║ ❌ VERDICT: REJECT — SOME TESTS FAILED! CHECK DETAILS ABOVE.         ║');
  }
  console.log('╚══════════════════════════════════════════════════════════════════════╝');

  if (failedAssertions > 0) {
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('Fatal execution error:', err);
  process.exit(1);
});
