'use strict';

/**
 * ============================================================
 *  Adversarial & Empirical Reviewer Test Suite for Milestone 2
 *  Testing src/routes/hls.js against Requirement R2 & Edge Cases
 * ============================================================
 */

const http = require('http');
const express = require('express');
const axios = require('axios');
const assert = require('assert');
const hlsRouter = require('../src/routes/hls');
const { m3u8Cache } = require('../src/lib/cache');

// Setup mock upstream server and local test server
let mockUpstreamServer;
let mockUpstreamPort;
let mockUpstreamBase;

let appServer;
let appPort;
let appBase;

const receivedUpstreamRequests = [];

async function startServers() {
  // 1. Mock Upstream CDN Server
  const mockApp = express();
  
  mockApp.use((req, res, next) => {
    receivedUpstreamRequests.push({
      path: req.path,
      method: req.method,
      headers: req.headers,
      query: req.query,
    });
    next();
  });

  // Master playlist mock
  mockApp.get('/master.m3u8', (req, res) => {
    const referer = req.headers['referer'];
    const origin = req.headers['origin'];
    const ua = req.headers['user-agent'];

    // Require anti-403 check
    if (!referer || !referer.includes('phimapi.com')) {
      return res.status(403).send('403 Forbidden - Hotlinking not allowed');
    }

    res.setHeader('Content-Type', 'application/vnd.apple.mpegurl');
    res.send(`#EXTM3U
#EXT-X-VERSION:3
#EXT-X-STREAM-INF:BANDWIDTH=1400000,RESOLUTION=1280x720
720p.m3u8
#EXT-X-STREAM-INF:BANDWIDTH=2800000,RESOLUTION=1920x1080
https://mockcdn.kkphimplayer1.com/1080p.m3u8
#EXT-X-MEDIA:TYPE=AUDIO,GROUP-ID="audio",NAME="English",DEFAULT=YES,URI="audio/eng.m3u8"
#EXT-X-I-FRAME-STREAM-INF:BANDWIDTH=86000,URI="iframe.m3u8"
`);
  });

  // Media playlist mock
  mockApp.get('/720p.m3u8', (req, res) => {
    res.setHeader('Content-Type', 'application/vnd.apple.mpegurl');
    res.send(`#EXTM3U
#EXT-X-VERSION:3
#EXT-X-TARGETDURATION:10
#EXT-X-MEDIA-SEQUENCE:0
#EXT-X-KEY:METHOD=AES-128,URI="enc.key",IV=0x1234567890abcdef1234567890abcdef
#EXT-X-MAP:URI="init.mp4"
#EXTINF:10.000,
segment0.ts
#EXTINF:10.000,
https://mockcdn.kkphimplayer1.com/segment1.ts
#EXT-X-PART:DURATION=1.0,URI="part0.mp4"
#EXT-X-PRELOAD-HINT:TYPE=PART,URI="preload.mp4"
#EXT-X-ENDLIST
`);
  });

  // Key mock
  mockApp.get('/enc.key', (req, res) => {
    res.setHeader('Content-Type', 'application/octet-stream');
    res.send(Buffer.from([0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07, 0x08, 0x09, 0x0a, 0x0b, 0x0c, 0x0d, 0x0e, 0x0f, 0x10]));
  });

  // Segment mock
  mockApp.get('/segment0.ts', (req, res) => {
    const referer = req.headers['referer'];
    if (!referer || !referer.includes('phimapi.com')) {
      return res.status(403).send('403 Forbidden - Segments protected');
    }
    res.setHeader('Content-Type', 'video/mp2t');
    res.setHeader('Content-Length', '1024');
    const fakeTs = Buffer.alloc(1024, 0x47); // Standard MPEG-TS sync byte 0x47
    res.send(fakeTs);
  });

  mockApp.get('/404.m3u8', (req, res) => res.status(404).send('Not Found'));
  mockApp.get('/500.m3u8', (req, res) => res.status(500).send('Internal Server Error'));
  mockApp.get('/slow.ts', (req, res) => {
    // Delay response to test timeout
    setTimeout(() => {
      res.setHeader('Content-Type', 'video/mp2t');
      res.send(Buffer.alloc(512, 0x47));
    }, 2000);
  });

  mockUpstreamServer = await new Promise((resolve) => {
    const s = mockApp.listen(0, '127.0.0.1', () => resolve(s));
  });
  mockUpstreamPort = mockUpstreamServer.address().port;
  mockUpstreamBase = `http://127.0.0.1:${mockUpstreamPort}`;

  // 2. App Server mounting hlsRouter
  const testApp = express();
  testApp.use('/hls', hlsRouter);

  appServer = await new Promise((resolve) => {
    const s = testApp.listen(0, '127.0.0.1', () => resolve(s));
  });
  appPort = appServer.address().port;
  appBase = `http://127.0.0.1:${appPort}`;
}

async function stopServers() {
  if (appServer) await new Promise((r) => appServer.close(r));
  if (mockUpstreamServer) await new Promise((r) => mockUpstreamServer.close(r));
}

function b64url(str) {
  return Buffer.from(str, 'utf8').toString('base64url');
}

async function runTests() {
  console.log('🚀 Starting Milestone 2 Independent Review Test Suite...');
  await startServers();

  let passed = 0;
  let total = 0;

  async function test(name, fn) {
    total++;
    try {
      await fn();
      console.log(`  ✅ PASS: ${name}`);
      passed++;
    } catch (err) {
      console.error(`  ❌ FAIL: ${name}`);
      console.error('    Error:', err.message);
    }
  }

  // --- Group 1: Anti-403 Upstream Headers & Referer Priority ---
  console.log('\n--- Group 1: Anti-403 Upstream Headers & Dynamic Ref ---');

  await test('Dynamic ref parameter is forwarded to upstream CDN', async () => {
    receivedUpstreamRequests.length = 0;
    const targetUrl = `${mockUpstreamBase}/master.m3u8`;
    const customRef = 'https://player.phimapi.com/';
    const proxyUrl = `${appBase}/hls/manifest.m3u8?url=${b64url(targetUrl)}&ref=${b64url(customRef)}`;

    const res = await axios.get(proxyUrl);
    assert.strictEqual(res.status, 200);

    const upstreamReq = receivedUpstreamRequests.find((r) => r.path === '/master.m3u8');
    assert.ok(upstreamReq, 'Upstream received request');
    assert.strictEqual(upstreamReq.headers['referer'], 'https://player.phimapi.com/');
    assert.strictEqual(upstreamReq.headers['origin'], 'https://player.phimapi.com');
    assert.strictEqual(upstreamReq.headers['user-agent'], 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36');
  });

  await test('Pattern fallback when ref is omitted (kkphim pattern)', async () => {
    receivedUpstreamRequests.length = 0;
    // URL with kkphim pattern
    const targetUrl = `${mockUpstreamBase}/master.m3u8?domain=kkphimplayer.com`;
    const proxyUrl = `${appBase}/hls/manifest.m3u8?url=${encodeURIComponent(targetUrl)}`;

    const res = await axios.get(proxyUrl);
    assert.strictEqual(res.status, 200);

    const upstreamReq = receivedUpstreamRequests.find((r) => r.path === '/master.m3u8');
    assert.ok(upstreamReq);
    assert.strictEqual(upstreamReq.headers['referer'], 'https://player.phimapi.com/');
    assert.strictEqual(upstreamReq.headers['origin'], 'https://player.phimapi.com');
  });

  await test('Ref with domain without protocol (e.g. player.phimapi.com) prepends https://', async () => {
    receivedUpstreamRequests.length = 0;
    const targetUrl = `${mockUpstreamBase}/master.m3u8?t=protocol_test`;
    const customRef = 'player.phimapi.com';
    const proxyUrl = `${appBase}/hls/manifest.m3u8?url=${b64url(targetUrl)}&ref=${b64url(customRef)}`;

    const res = await axios.get(proxyUrl);
    assert.strictEqual(res.status, 200);

    const upstreamReq = receivedUpstreamRequests.find((r) => r.path === '/master.m3u8');
    assert.ok(upstreamReq);
    assert.strictEqual(upstreamReq.headers['referer'], 'https://player.phimapi.com');
    assert.strictEqual(upstreamReq.headers['origin'], 'https://player.phimapi.com');
  });

  // --- Group 2: Playlist Rewriter & Sub-manifest / Segment Routing ---
  console.log('\n--- Group 2: Playlist Rewriter & Sub-manifest / Segment Routing ---');

  await test('Master playlist rewrites relative & absolute sub-playlists and media', async () => {
    const targetUrl = `${mockUpstreamBase}/master.m3u8?t=rewrite_master`;
    const customRef = 'https://player.phimapi.com/';
    const proxyUrl = `${appBase}/hls/manifest.m3u8?url=${b64url(targetUrl)}&ref=${b64url(customRef)}`;

    const res = await axios.get(proxyUrl);
    const body = res.data;

    assert.ok(body.includes('#EXTM3U'));
    assert.ok(body.includes('#EXT-X-STREAM-INF:BANDWIDTH=1400000'));
    // Check relative sub-playlist rewritten to /hls/manifest.m3u8
    assert.ok(body.includes(`${appBase}/hls/manifest.m3u8?url=`));
    // Check absolute sub-playlist rewritten to /hls/manifest.m3u8
    assert.ok(body.includes('https://mockcdn.kkphimplayer1.com/1080p.m3u8') === false, 'Raw URL must be replaced');
    // Check #EXT-X-MEDIA rewritten
    assert.ok(body.includes('URI="http://127.0.0.1:'), 'EXT-X-MEDIA URI rewritten');
    // Check ref is preserved
    assert.ok(body.includes(`&ref=${b64url('https://player.phimapi.com/')}`));
  });

  await test('Media playlist rewrites TS segments, keys, MAP, PRELOAD-HINT, PART', async () => {
    const targetUrl = `${mockUpstreamBase}/720p.m3u8?t=rewrite_media`;
    const customRef = 'https://player.phimapi.com/';
    const proxyUrl = `${appBase}/hls/manifest.m3u8?url=${b64url(targetUrl)}&ref=${b64url(customRef)}`;

    const res = await axios.get(proxyUrl);
    const body = res.data;

    assert.ok(body.includes('#EXTINF:10.000'));
    // Check TS segments route to /hls/ts
    assert.ok(body.includes(`${appBase}/hls/ts?url=`));
    // Check KEY routes to /hls/ts with is_key=1
    assert.ok(body.includes('is_key=1'));
    // Check MAP routes to /hls/ts
    assert.ok(body.includes('#EXT-X-MAP:URI="http'));
    // Check PART routes to /hls/ts
    assert.ok(body.includes('#EXT-X-PART:DURATION=1.0,URI="http'));
    // Check PRELOAD-HINT routes to /hls/ts
    assert.ok(body.includes('#EXT-X-PRELOAD-HINT:TYPE=PART,URI="http'));
  });

  // --- Group 3: Segment Streaming, CORS & MIME Types ---
  console.log('\n--- Group 3: Segment Streaming, CORS & MIME Types ---');

  await test('Segment streaming returns 200, CORS, and video/mp2t Content-Type', async () => {
    receivedUpstreamRequests.length = 0;
    const segUrl = `${mockUpstreamBase}/segment0.ts`;
    const ref = 'https://player.phimapi.com/';
    const proxyUrl = `${appBase}/hls/ts?url=${b64url(segUrl)}&ref=${b64url(ref)}`;

    const res = await axios.get(proxyUrl, { responseType: 'arraybuffer' });
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.headers['access-control-allow-origin'], '*');
    assert.strictEqual(res.headers['content-type'], 'video/mp2t');
    assert.strictEqual(res.headers['cache-control'], 'public, max-age=86400');
    assert.strictEqual(res.data.length, 1024);
    assert.strictEqual(res.data[0], 0x47, 'TS sync byte');

    const upstreamReq = receivedUpstreamRequests.find((r) => r.path === '/segment0.ts');
    assert.ok(upstreamReq);
    assert.strictEqual(upstreamReq.headers['referer'], 'https://player.phimapi.com/');
  });

  await test('Encryption key streaming returns application/octet-stream', async () => {
    const keyUrl = `${mockUpstreamBase}/enc.key`;
    const ref = 'https://player.phimapi.com/';
    const proxyUrl = `${appBase}/hls/ts?url=${b64url(keyUrl)}&ref=${b64url(ref)}&is_key=1`;

    const res = await axios.get(proxyUrl, { responseType: 'arraybuffer' });
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.headers['content-type'], 'application/octet-stream');
    assert.strictEqual(res.data.length, 16);
  });

  await test('OPTIONS preflight responds 204 with CORS headers', async () => {
    const res = await axios({
      method: 'OPTIONS',
      url: `${appBase}/hls/manifest.m3u8`,
    });
    assert.strictEqual(res.status, 204);
    assert.strictEqual(res.headers['access-control-allow-origin'], '*');
    assert.strictEqual(res.headers['access-control-allow-methods'], 'GET, HEAD, OPTIONS');
  });

  // --- Group 4: Error Handling & Cache Management ---
  console.log('\n--- Group 4: Error Handling & Cache Management ---');

  await test('Missing url returns 400 Bad Request', async () => {
    try {
      await axios.get(`${appBase}/hls/manifest.m3u8`);
      assert.fail('Should fail');
    } catch (err) {
      assert.strictEqual(err.response.status, 400);
      assert.ok(err.response.data.includes('Missing url'));
    }

    try {
      await axios.get(`${appBase}/hls/ts`);
      assert.fail('Should fail');
    } catch (err) {
      assert.strictEqual(err.response.status, 400);
      assert.ok(err.response.data.includes('Missing url'));
    }
  });

  await test('Upstream 404 returns 502 Bad Gateway', async () => {
    try {
      await axios.get(`${appBase}/hls/manifest.m3u8?url=${b64url(mockUpstreamBase + '/404.m3u8')}`);
      assert.fail('Should fail');
    } catch (err) {
      assert.strictEqual(err.response.status, 502);
      assert.ok(err.response.data.includes('HLS Proxy Error'));
    }
  });

  await test('Upstream 500 returns 502 Bad Gateway', async () => {
    try {
      await axios.get(`${appBase}/hls/manifest.m3u8?url=${b64url(mockUpstreamBase + '/500.m3u8')}`);
      assert.fail('Should fail');
    } catch (err) {
      assert.strictEqual(err.response.status, 502);
    }
  });

  await test('M3U8 Cache hit returns cached content without second upstream request', async () => {
    receivedUpstreamRequests.length = 0;
    const targetUrl = `${mockUpstreamBase}/master.m3u8?t=cache_test`;
    const proxyUrl = `${appBase}/hls/manifest.m3u8?url=${b64url(targetUrl)}&ref=${b64url('https://player.phimapi.com/')}`;

    // Request 1: Cache Miss
    const res1 = await axios.get(proxyUrl);
    assert.strictEqual(res1.status, 200);
    const count1 = receivedUpstreamRequests.filter((r) => r.path === '/master.m3u8' && r.query.t === 'cache_test').length;
    assert.strictEqual(count1, 1);

    // Request 2: Cache Hit
    const res2 = await axios.get(proxyUrl);
    assert.strictEqual(res2.status, 200);
    const count2 = receivedUpstreamRequests.filter((r) => r.path === '/master.m3u8' && r.query.t === 'cache_test').length;
    assert.strictEqual(count2, 1, 'Should not have made a second upstream request');
    assert.strictEqual(res2.data, res1.data);
  });

  // --- Group 5: Adversarial Edge Cases ---
  console.log('\n--- Group 5: Adversarial Edge Cases ---');

  await test('Malformed Base64URL string handled gracefully without crash', async () => {
    const res = await axios.get(`${appBase}/hls/manifest.m3u8?url=!!!invalid_base64_string@@@`, {
      validateStatus: () => true,
    });
    // Should return 502 because resolveParamUrl falls back to raw string which is not a valid URL
    assert.ok(res.status === 502 || res.status === 400);
  });

  await test('Raw unencoded HTTP/HTTPS URL accepted as url query parameter', async () => {
    const rawUrl = `${mockUpstreamBase}/master.m3u8?t=raw_url_test`;
    const proxyUrl = `${appBase}/hls/manifest.m3u8?url=${encodeURIComponent(rawUrl)}&ref=${encodeURIComponent('https://player.phimapi.com/')}`;

    const res = await axios.get(proxyUrl);
    assert.strictEqual(res.status, 200);
    assert.ok(res.data.includes('#EXTM3U'));
  });

  await test('Standard Base64 (with +, /, =) decoded correctly alongside Base64URL', async () => {
    const targetUrl = `${mockUpstreamBase}/master.m3u8?t=std_b64`;
    const stdB64 = Buffer.from(targetUrl, 'utf8').toString('base64');
    const proxyUrl = `${appBase}/hls/manifest.m3u8?url=${encodeURIComponent(stdB64)}&ref=${b64url('https://player.phimapi.com/')}`;

    const res = await axios.get(proxyUrl);
    assert.strictEqual(res.status, 200);
  });

  await stopServers();

  console.log(`\n========================================`);
  console.log(`Reviewer 2 Test Execution: ${passed}/${total} passed`);
  console.log(`========================================\n`);

  if (passed !== total) {
    process.exit(1);
  }
}

runTests().catch((e) => {
  console.error('Fatal test error:', e);
  process.exit(1);
});
