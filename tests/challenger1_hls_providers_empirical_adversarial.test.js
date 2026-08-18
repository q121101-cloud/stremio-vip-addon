'use strict';

/**
 * ============================================================================
 *  VIP Movies Addon — Challenger 1 Adversarial & Empirical Stress Test Suite
 *  Target:
 *    1. HLS Proxy Route (src/routes/hls.js)
 *    2. Provider Stream Invariants across ALL 8 Providers (src/providers/*.js)
 *    3. Stream Aggregator Route (src/handlers.js)
 * ============================================================================
 */

const http = require('http');
const express = require('express');
const axios = require('axios');
const assert = require('assert');

const hlsRouter = require('../src/routes/hls');
const handlers = require('../src/handlers');
const { m3u8Cache, detailCache, catalogCache } = require('../src/lib/cache');
const { ALL_PROVIDERS } = require('../src/providers');

// Provider modules
const film4k = require('../src/providers/film4k');
const vsmov = require('../src/providers/vsmov');
const kkphim = require('../src/providers/kkphim');
const nguonc = require('../src/providers/nguonc');
const stp = require('../src/providers/stp');
const hh3d = require('../src/providers/hh3d');
const yan = require('../src/providers/yan');
const clbpx = require('../src/providers/clbpx');

let testServer = null;
let testServerPort = 0;
let testBaseUrl = '';

let mockUpstreamServer = null;
let mockUpstreamPort = 0;
let mockUpstreamBase = '';

let totalTests = 0;
let passedTests = 0;
let failedTests = 0;
const failures = [];

function pass(name, detail = '') {
  totalTests++;
  passedTests++;
  console.log(`  ✅ PASS: [${totalTests}] ${name} ${detail ? '(' + detail + ')' : ''}`);
}

function fail(name, err) {
  totalTests++;
  failedTests++;
  console.error(`  ❌ FAIL: [${totalTests}] ${name}`);
  console.error(`     Error: ${err.message}`);
  failures.push({ name, error: err.message, stack: err.stack });
}

function encodeB64(str) {
  if (!str) return '';
  return Buffer.from(str, 'utf8').toString('base64url');
}

/**
 * Setup test servers
 */
async function setupServers() {
  // 1. Mock Upstream Server simulating various CDN behaviors (200 HTML, 403, 404, 500, Range 206, chunk streams)
  const mockApp = express();
  
  // Return HTML block page with HTTP 200
  mockApp.get('/mock/html-block-200', (req, res) => {
    res.status(200).set('Content-Type', 'text/html').send(`
      <!DOCTYPE html>
      <html>
        <head><title>Cloudflare DDoS Protection / 403 Access Denied</title></head>
        <body>
          <h1>Access Blocked</h1>
          <p>Please solve the captcha to proceed.</p>
        </body>
      </html>
    `);
  });

  // Return 403 Forbidden
  mockApp.get('/mock/forbidden-403', (req, res) => {
    res.status(403).send('Forbidden: CDN Anti-Hotlink Protection');
  });

  // Return 404 Not Found
  mockApp.get('/mock/not-found-404', (req, res) => {
    res.status(404).send('Not Found: Media expired');
  });

  // Return 500 Internal Server Error
  mockApp.get('/mock/server-error-500', (req, res) => {
    res.status(500).send('Internal CDN Error');
  });

  // Return Valid Master M3U8
  mockApp.get('/mock/valid-master.m3u8', (req, res) => {
    res.status(200).set('Content-Type', 'application/vnd.apple.mpegurl').send(
`#EXTM3U
#EXT-X-VERSION:3
#EXT-X-STREAM-INF:BANDWIDTH=3000000,RESOLUTION=1920x1080
media.m3u8
#EXT-X-STREAM-INF:BANDWIDTH=1500000,RESOLUTION=1280x720
media_720.m3u8
`
    );
  });

  // Return Valid Media M3U8
  mockApp.get('/mock/media.m3u8', (req, res) => {
    res.status(200).set('Content-Type', 'application/vnd.apple.mpegurl').send(
`#EXTM3U
#EXT-X-VERSION:3
#EXT-X-TARGETDURATION:10
#EXT-X-MEDIA-SEQUENCE:0
#EXT-X-KEY:METHOD=AES-128,URI="enc.key",IV=0x00000000000000000000000000000001
#EXTINF:10.0,
segment0.ts
#EXTINF:10.0,
segment1.ts
#EXT-X-ENDLIST
`
    );
  });

  // Return .ts segment buffer
  const sampleTsBuffer = Buffer.alloc(100 * 1024); // 100 KB
  sampleTsBuffer[0] = 0x47; // MPEG-TS Sync byte
  for (let i = 1; i < sampleTsBuffer.length; i++) {
    sampleTsBuffer[i] = (i % 256);
  }

  // Segment with standard 200 / Range 206
  mockApp.get('/mock/segment0.ts', (req, res) => {
    const range = req.headers.range;
    res.set('Accept-Ranges', 'bytes');
    res.set('Content-Type', 'video/MP2T');

    if (range) {
      const match = range.match(/bytes=(\d+)-(\d*)/);
      if (match) {
        const start = parseInt(match[1], 10);
        let end = match[2] ? parseInt(match[2], 10) : sampleTsBuffer.length - 1;
        if (end >= sampleTsBuffer.length) end = sampleTsBuffer.length - 1;
        const slice = sampleTsBuffer.subarray(start, end + 1);
        res.status(206);
        res.set('Content-Range', `bytes ${start}-${end}/${sampleTsBuffer.length}`);
        res.set('Content-Length', String(slice.length));
        return res.send(slice);
      }
    }

    res.status(200).set('Content-Length', String(sampleTsBuffer.length)).send(sampleTsBuffer);
  });

  // Segment that ignores range and returns 200 (to test local buffer slicing in proxy)
  mockApp.get('/mock/segment-no-range-200.ts', (req, res) => {
    res.status(200)
      .set('Content-Type', 'video/MP2T')
      .set('Content-Length', String(sampleTsBuffer.length))
      .send(sampleTsBuffer);
  });

  // Decryption Key
  mockApp.get('/mock/enc.key', (req, res) => {
    const keyBuf = Buffer.alloc(16, 0xAA);
    res.status(200).set('Content-Type', 'application/octet-stream').send(keyBuf);
  });

  // WebVTT Subtitle
  mockApp.get('/mock/sub.vtt', (req, res) => {
    res.status(200).set('Content-Type', 'text/vtt').send(
`WEBVTT

00:00:01.000 --> 00:00:04.000
Xin chào Việt Nam!
`
    );
  });

  // SRT Subtitle (with comma timestamps to test conversion)
  mockApp.get('/mock/sub.srt', (req, res) => {
    res.status(200).set('Content-Type', 'text/plain').send(
`1
00:00:01,000 --> 00:00:04,000
Xin chào Việt Nam SRT!
`
    );
  });

  mockUpstreamServer = http.createServer(mockApp);
  await new Promise((resolve) => {
    mockUpstreamServer.listen(0, '127.0.0.1', () => {
      mockUpstreamPort = mockUpstreamServer.address().port;
      mockUpstreamBase = `http://127.0.0.1:${mockUpstreamPort}`;
      resolve();
    });
  });

  // 2. Main Test Server mounting HLS Router & Handlers
  const app = express();
  app.use('/hls', hlsRouter);
  app.use('/', handlers);

  testServer = http.createServer(app);
  await new Promise((resolve) => {
    testServer.listen(0, '127.0.0.1', () => {
      testServerPort = testServer.address().port;
      testBaseUrl = `http://127.0.0.1:${testServerPort}`;
      resolve();
    });
  });
}

/**
 * Teardown servers
 */
async function teardownServers() {
  if (testServer) {
    await new Promise((resolve) => testServer.close(resolve));
  }
  if (mockUpstreamServer) {
    await new Promise((resolve) => mockUpstreamServer.close(resolve));
  }
}

/**
 * Suite 1: HLS Proxy Error Handling, Fallback, and Cache Invalidation
 */
async function runHlsProxyErrorTests() {
  console.log('\n============================================================');
  console.log('▶ SUITE 1: HLS Proxy Error Handling, 302 Fallback & Cache Purge');
  console.log('============================================================');

  // Test 1.1: Invalid / Unreachable Upstream Domain (DNS failure)
  {
    const targetUrl = 'https://nonexistent-dns-error-12345.domain.xyz/playlist.m3u8';
    const b64 = encodeB64(targetUrl);
    const cacheKey = `m3u8:${testBaseUrl}:${targetUrl}:`;

    // Ensure cache starts empty
    m3u8Cache.del(cacheKey);

    const res = await axios.get(`${testBaseUrl}/hls/manifest.m3u8?url=${b64}`, {
      maxRedirects: 0,
      validateStatus: () => true,
    });

    try {
      assert.strictEqual(res.status, 302, `Expected 302 redirect fallback, got ${res.status}`);
      assert.strictEqual(res.headers.location, targetUrl, `Redirect location should be targetUrl`);
      assert.strictEqual(m3u8Cache.get(cacheKey), undefined, 'Cache must be empty / purged on DNS failure');
      pass('1.1 Unreachable DNS domain -> 302 fallback redirect & cache purged');
    } catch (e) {
      fail('1.1 Unreachable DNS domain', e);
    }
  }

  // Test 1.2: Upstream HTTP 403 Forbidden
  {
    const targetUrl = `${mockUpstreamBase}/mock/forbidden-403`;
    const b64 = encodeB64(targetUrl);
    const cacheKey = `m3u8:${testBaseUrl}:${targetUrl}:`;

    m3u8Cache.del(cacheKey);

    const res = await axios.get(`${testBaseUrl}/hls/manifest.m3u8?url=${b64}`, {
      maxRedirects: 0,
      validateStatus: () => true,
    });

    try {
      assert.strictEqual(res.status, 302, `Expected 302 redirect fallback, got ${res.status}`);
      assert.strictEqual(res.headers.location, targetUrl, `Redirect location should be targetUrl`);
      assert.strictEqual(m3u8Cache.get(cacheKey), undefined, 'Cache must be empty / purged on 403');
      pass('1.2 Upstream HTTP 403 -> 302 fallback redirect & cache purged');
    } catch (e) {
      fail('1.2 Upstream HTTP 403', e);
    }
  }

  // Test 1.3: Upstream HTTP 404 Not Found
  {
    const targetUrl = `${mockUpstreamBase}/mock/not-found-404`;
    const b64 = encodeB64(targetUrl);
    const cacheKey = `m3u8:${testBaseUrl}:${targetUrl}:`;

    m3u8Cache.del(cacheKey);

    const res = await axios.get(`${testBaseUrl}/hls/manifest.m3u8?url=${b64}`, {
      maxRedirects: 0,
      validateStatus: () => true,
    });

    try {
      assert.strictEqual(res.status, 302, `Expected 302 redirect fallback, got ${res.status}`);
      assert.strictEqual(res.headers.location, targetUrl, `Redirect location should be targetUrl`);
      assert.strictEqual(m3u8Cache.get(cacheKey), undefined, 'Cache must be empty / purged on 404');
      pass('1.3 Upstream HTTP 404 -> 302 fallback redirect & cache purged');
    } catch (e) {
      fail('1.3 Upstream HTTP 404', e);
    }
  }

  // Test 1.4: Upstream HTTP 500 Server Error
  {
    const targetUrl = `${mockUpstreamBase}/mock/server-error-500`;
    const b64 = encodeB64(targetUrl);
    const cacheKey = `m3u8:${testBaseUrl}:${targetUrl}:`;

    m3u8Cache.del(cacheKey);

    const res = await axios.get(`${testBaseUrl}/hls/manifest.m3u8?url=${b64}`, {
      maxRedirects: 0,
      validateStatus: () => true,
    });

    try {
      assert.strictEqual(res.status, 302, `Expected 302 redirect fallback, got ${res.status}`);
      assert.strictEqual(res.headers.location, targetUrl, `Redirect location should be targetUrl`);
      assert.strictEqual(m3u8Cache.get(cacheKey), undefined, 'Cache must be empty / purged on 500');
      pass('1.4 Upstream HTTP 500 -> 302 fallback redirect & cache purged');
    } catch (e) {
      fail('1.4 Upstream HTTP 500', e);
    }
  }

  // Test 1.5: Upstream returning HTTP 200 with HTML Block Page (non-M3U8)
  {
    const targetUrl = `${mockUpstreamBase}/mock/html-block-200`;
    const b64 = encodeB64(targetUrl);
    const cacheKey = `m3u8:${testBaseUrl}:${targetUrl}:`;

    m3u8Cache.del(cacheKey);

    const res = await axios.get(`${testBaseUrl}/hls/manifest.m3u8?url=${b64}`, {
      maxRedirects: 0,
      validateStatus: () => true,
    });

    try {
      // Must NOT return 200 with HTML as an m3u8 playlist, must fallback to 302 redirect to original target
      assert.strictEqual(res.status, 302, `Expected 302 redirect fallback for HTML block page, got ${res.status}`);
      assert.strictEqual(res.headers.location, targetUrl, `Redirect location should be targetUrl`);
      assert.strictEqual(m3u8Cache.get(cacheKey), undefined, 'HTML block page must NEVER be cached in m3u8Cache');
      pass('1.5 Upstream HTTP 200 HTML block page -> 302 fallback redirect & NEVER cached in m3u8Cache');
    } catch (e) {
      fail('1.5 Upstream HTTP 200 HTML block page', e);
    }
  }

  // Test 1.6: Repeated request to broken URL confirms cache remains unpolluted
  {
    const targetUrl = `${mockUpstreamBase}/mock/html-block-200`;
    const b64 = encodeB64(targetUrl);
    const cacheKey = `m3u8:${testBaseUrl}:${targetUrl}:`;

    const res2 = await axios.get(`${testBaseUrl}/hls/manifest.m3u8?url=${b64}`, {
      maxRedirects: 0,
      validateStatus: () => true,
    });

    try {
      assert.strictEqual(res2.status, 302, `Second call must also be 302 redirect`);
      assert.strictEqual(m3u8Cache.get(cacheKey), undefined, 'Cache must still be unpolluted after repeated calls');
      pass('1.6 Repeated request to broken URL -> Cache remains unpolluted (no stale poison)');
    } catch (e) {
      fail('1.6 Repeated request to broken URL', e);
    }
  }

  // Test 1.7: Segment error fallback (/hls/segment.ts on 404)
  {
    const targetUrl = `${mockUpstreamBase}/mock/nonexistent_segment.ts`;
    const b64 = encodeB64(targetUrl);

    const res = await axios.get(`${testBaseUrl}/hls/segment.ts?url=${b64}`, {
      maxRedirects: 0,
      validateStatus: () => true,
    });

    try {
      assert.strictEqual(res.status, 302, `Expected 302 fallback redirect on segment error, got ${res.status}`);
      assert.strictEqual(res.headers.location, targetUrl);
      pass('1.7 Segment 404 -> 302 fallback redirect to upstream targetUrl');
    } catch (e) {
      fail('1.7 Segment 404', e);
    }
  }

  // Test 1.8: Key error fallback (/hls/key on 404)
  {
    const targetUrl = `${mockUpstreamBase}/mock/nonexistent_key.key`;
    const b64 = encodeB64(targetUrl);

    const res = await axios.get(`${testBaseUrl}/hls/key?url=${b64}`, {
      maxRedirects: 0,
      validateStatus: () => true,
    });

    try {
      assert.strictEqual(res.status, 302, `Expected 302 fallback redirect on key error, got ${res.status}`);
      assert.strictEqual(res.headers.location, targetUrl);
      pass('1.8 Key 404 -> 302 fallback redirect to upstream targetUrl');
    } catch (e) {
      fail('1.8 Key 404', e);
    }
  }

  // Test 1.9: Extract error fallback (/hls/extract on invalid embed)
  {
    const targetUrl = 'https://nonexistent-embed-error-site.xyz/embed/99999';
    const b64 = encodeB64(targetUrl);

    const res = await axios.get(`${testBaseUrl}/hls/extract?url=${b64}`, {
      maxRedirects: 0,
      validateStatus: () => true,
    });

    try {
      assert.strictEqual(res.status, 302, `Expected 302 fallback redirect on extract error, got ${res.status}`);
      assert.strictEqual(res.headers.location, targetUrl);
      pass('1.9 Extract error -> 302 fallback redirect to original embed targetUrl');
    } catch (e) {
      fail('1.9 Extract error', e);
    }
  }
}

/**
 * Suite 2: Parameter Validation, Malformed Inputs & Security Boundaries
 */
async function runParameterAdversarialTests() {
  console.log('\n============================================================');
  console.log('▶ SUITE 2: Parameter Validation, Malformed Inputs & Edge Cases');
  console.log('============================================================');

  // Test 2.1: Missing 'url' and 'b64' parameter on /hls/manifest.m3u8
  {
    const res = await axios.get(`${testBaseUrl}/hls/manifest.m3u8`, {
      validateStatus: () => true,
    });
    try {
      assert.strictEqual(res.status, 400, `Expected 400 Bad Request for missing url, got ${res.status}`);
      pass('2.1 Missing url/b64 query param -> HTTP 400 Bad Request');
    } catch (e) {
      fail('2.1 Missing url/b64 query param', e);
    }
  }

  // Test 2.2: Empty string 'url=' parameter
  {
    const res = await axios.get(`${testBaseUrl}/hls/manifest.m3u8?url=`, {
      validateStatus: () => true,
    });
    try {
      assert.strictEqual(res.status, 400, `Expected 400 Bad Request for empty url param, got ${res.status}`);
      pass('2.2 Empty url param -> HTTP 400 Bad Request');
    } catch (e) {
      fail('2.2 Empty url param', e);
    }
  }

  // Test 2.3: Malformed base64 characters (e.g. non-ascii, invalid symbols)
  {
    const res = await axios.get(`${testBaseUrl}/hls/manifest.m3u8?url=@@@invalid-b64-symbols$$$`, {
      maxRedirects: 0,
      validateStatus: () => true,
    });
    try {
      // Should either return 400, 302, or 502 gracefully without uncaught crash
      assert.ok([400, 302, 502].includes(res.status), `Expected graceful status 400/302/502, got ${res.status}`);
      pass('2.3 Malformed Base64 string handled safely without process crash', `Status: ${res.status}`);
    } catch (e) {
      fail('2.3 Malformed Base64 string', e);
    }
  }

  // Test 2.4: Missing 'url' on /hls/segment.ts
  {
    const res = await axios.get(`${testBaseUrl}/hls/segment.ts`, {
      validateStatus: () => true,
    });
    try {
      assert.strictEqual(res.status, 400, `Expected 400 for missing segment url, got ${res.status}`);
      pass('2.4 Missing segment url -> HTTP 400 Bad Request');
    } catch (e) {
      fail('2.4 Missing segment url', e);
    }
  }

  // Test 2.5: Missing 'url' on /hls/key
  {
    const res = await axios.get(`${testBaseUrl}/hls/key`, {
      validateStatus: () => true,
    });
    try {
      assert.strictEqual(res.status, 400, `Expected 400 for missing key url, got ${res.status}`);
      pass('2.5 Missing key url -> HTTP 400 Bad Request');
    } catch (e) {
      fail('2.5 Missing key url', e);
    }
  }

  // Test 2.6: Missing 'url' on /hls/sub.vtt
  {
    const res = await axios.get(`${testBaseUrl}/hls/sub.vtt`, {
      validateStatus: () => true,
    });
    try {
      assert.strictEqual(res.status, 400, `Expected 400 for missing subtitle url, got ${res.status}`);
      pass('2.6 Missing sub.vtt url -> HTTP 400 Bad Request');
    } catch (e) {
      fail('2.6 Missing sub.vtt url', e);
    }
  }

  // Test 2.7: Subtitle data: URI parsing & WEBVTT normalization
  {
    const sampleVttData = 'data:text/vtt;base64,' + Buffer.from('WEBVTT\n\n00:00:01.000 --> 00:00:02.000\nHello').toString('base64');
    const res = await axios.get(`${testBaseUrl}/hls/sub.vtt?url=${encodeURIComponent(sampleVttData)}`, {
      validateStatus: () => true,
    });
    try {
      assert.strictEqual(res.status, 200, `Expected 200 for data: subtitle, got ${res.status}`);
      assert.ok(String(res.data).startsWith('WEBVTT'), 'Subtitle data URI must decode to WEBVTT');
      pass('2.7 Data URI subtitle decoding and header formatting');
    } catch (e) {
      fail('2.7 Data URI subtitle decoding', e);
    }
  }

  // Test 2.8: Subtitle SRT-to-VTT auto-conversion (comma timestamps to dot timestamps)
  {
    const targetUrl = `${mockUpstreamBase}/mock/sub.srt`;
    const b64 = encodeB64(targetUrl);
    const res = await axios.get(`${testBaseUrl}/hls/sub.vtt?url=${b64}`, {
      validateStatus: () => true,
    });
    try {
      assert.strictEqual(res.status, 200, `Expected 200 for SRT subtitle fetch, got ${res.status}`);
      assert.ok(String(res.data).startsWith('WEBVTT'), 'Must prepend WEBVTT header');
      assert.ok(String(res.data).includes('00:00:01.000 --> 00:00:04.000'), 'Must convert comma timestamps to dot');
      pass('2.8 SRT to WebVTT timestamp normalization (comma to dot)');
    } catch (e) {
      fail('2.8 SRT to WebVTT timestamp normalization', e);
    }
  }

  // Test 2.9: OPTIONS CORS Preflight
  {
    const res = await axios({
      url: `${testBaseUrl}/hls/manifest.m3u8`,
      method: 'OPTIONS',
      validateStatus: () => true,
    });
    try {
      assert.strictEqual(res.status, 204, `Expected 204 No Content for OPTIONS, got ${res.status}`);
      assert.strictEqual(res.headers['access-control-allow-origin'], '*', 'CORS Allow-Origin should be *');
      pass('2.9 OPTIONS CORS Preflight -> HTTP 204 and Access-Control-Allow-Origin: *');
    } catch (e) {
      fail('2.9 OPTIONS CORS Preflight', e);
    }
  }
}

/**
 * Suite 3: Range Header Seeking & High Concurrency Stress
 */
async function runRangeAndConcurrencyTests() {
  console.log('\n============================================================');
  console.log('▶ SUITE 3: Range Header Seeking & High Concurrency Stress');
  console.log('============================================================');

  // Test 3.1: Upstream supporting Range 206
  {
    const targetUrl = `${mockUpstreamBase}/mock/segment0.ts`;
    const b64 = encodeB64(targetUrl);

    const res = await axios.get(`${testBaseUrl}/hls/segment.ts?url=${b64}`, {
      headers: { Range: 'bytes=0-1023' },
      responseType: 'arraybuffer',
      validateStatus: () => true,
    });

    try {
      assert.strictEqual(res.status, 206, `Expected HTTP 206 Partial Content, got ${res.status}`);
      assert.strictEqual(res.data.length, 1024, `Expected 1024 bytes slice, got ${res.data.length}`);
      assert.strictEqual(res.headers['content-range'], `bytes 0-1023/102400`);
      assert.strictEqual(res.data[0], 0x47, 'First byte must match MPEG-TS sync byte 0x47');
      pass('3.1 HTTP Range seeking with upstream 206 forwarding (bytes=0-1023)');
    } catch (e) {
      fail('3.1 HTTP Range seeking upstream 206', e);
    }
  }

  // Test 3.2: Upstream returning 200, Proxy local buffer slicing
  {
    const targetUrl = `${mockUpstreamBase}/mock/segment-no-range-200.ts`;
    const b64 = encodeB64(targetUrl);

    const res = await axios.get(`${testBaseUrl}/hls/segment.ts?url=${b64}`, {
      headers: { Range: 'bytes=500-1499' },
      responseType: 'arraybuffer',
      validateStatus: () => true,
    });

    try {
      assert.strictEqual(res.status, 206, `Expected HTTP 206 from local buffer slice, got ${res.status}`);
      assert.strictEqual(res.data.length, 1000, `Expected 1000 bytes slice, got ${res.data.length}`);
      assert.strictEqual(res.headers['content-range'], `bytes 500-1499/102400`);
      pass('3.2 HTTP Range seeking when upstream returns 200 (Local buffer slicing)');
    } catch (e) {
      fail('3.2 HTTP Range local buffer slicing', e);
    }
  }

  // Test 3.3: Open-ended Range (bytes=100000-)
  {
    const targetUrl = `${mockUpstreamBase}/mock/segment-no-range-200.ts`;
    const b64 = encodeB64(targetUrl);

    const res = await axios.get(`${testBaseUrl}/hls/segment.ts?url=${b64}`, {
      headers: { Range: 'bytes=100000-' },
      responseType: 'arraybuffer',
      validateStatus: () => true,
    });

    try {
      assert.strictEqual(res.status, 206, `Expected HTTP 206 for open-ended range, got ${res.status}`);
      assert.strictEqual(res.data.length, 2400, `Expected remaining 2400 bytes, got ${res.data.length}`);
      pass('3.3 Open-ended Range seeking (bytes=100000-)');
    } catch (e) {
      fail('3.3 Open-ended Range seeking', e);
    }
  }

  // Test 3.4: Decryption Key Proxy (/hls/key)
  {
    const targetUrl = `${mockUpstreamBase}/mock/enc.key`;
    const b64 = encodeB64(targetUrl);

    const res = await axios.get(`${testBaseUrl}/hls/key?url=${b64}`, {
      responseType: 'arraybuffer',
      validateStatus: () => true,
    });

    try {
      assert.strictEqual(res.status, 200, `Expected HTTP 200 for key proxy, got ${res.status}`);
      assert.strictEqual(res.data.length, 16, `Expected 16-byte AES key, got ${res.data.length}`);
      assert.strictEqual(res.data[0], 0xAA, 'Key content byte matched');
      pass('3.4 Decryption Key Proxy (/hls/key) returns correct binary payload');
    } catch (e) {
      fail('3.4 Decryption Key Proxy', e);
    }
  }

  // Test 3.5: Master Playlist and Media Playlist Rewriting & In-Memory Caching
  {
    const targetUrl = `${mockUpstreamBase}/mock/valid-master.m3u8`;
    const b64 = encodeB64(targetUrl);

    const res = await axios.get(`${testBaseUrl}/hls/manifest.m3u8?url=${b64}`);
    try {
      assert.strictEqual(res.status, 200);
      assert.ok(res.data.includes('#EXTM3U'), 'Manifest must include #EXTM3U');
      assert.ok(res.data.includes(`${testBaseUrl}/hls/manifest.m3u8?url=`), 'Sub-playlists rewritten to proxy');

      // Second fetch should hit cache
      const resCached = await axios.get(`${testBaseUrl}/hls/manifest.m3u8?url=${b64}`);
      assert.strictEqual(resCached.status, 200);
      assert.strictEqual(resCached.data, res.data, 'Cached manifest matches original rewritten data');
      pass('3.5 Master playlist rewriting & cache hit verification');
    } catch (e) {
      fail('3.5 Master playlist rewriting & cache hit', e);
    }
  }

  // Test 3.6: High Concurrency Stress Test (60 parallel requests)
  {
    const targetM3u8 = `${mockUpstreamBase}/mock/media.m3u8`;
    const b64M3u8 = encodeB64(targetM3u8);
    const targetSegment = `${mockUpstreamBase}/mock/segment0.ts`;
    const b64Segment = encodeB64(targetSegment);

    const promises = [];
    for (let i = 0; i < 30; i++) {
      promises.push(axios.get(`${testBaseUrl}/hls/manifest.m3u8?url=${b64M3u8}`, { validateStatus: () => true }));
      promises.push(axios.get(`${testBaseUrl}/hls/segment.ts?url=${b64Segment}`, { headers: { Range: `bytes=${i * 100}-${i * 100 + 500}` }, validateStatus: () => true }));
    }

    const results = await Promise.allSettled(promises);
    const allSuccessful = results.every((r) => r.status === 'fulfilled' && (r.value.status === 200 || r.value.status === 206));

    try {
      assert.ok(allSuccessful, `All 60 concurrent requests must succeed. Success count: ${results.filter(r => r.status === 'fulfilled' && (r.value.status === 200 || r.value.status === 206)).length}/60`);
      pass('3.6 Concurrency Stress Test: 60 parallel mixed M3U8 + Range Segment requests', '100% Succeeded');
    } catch (e) {
      fail('3.6 Concurrency Stress Test', e);
    }
  }
}

/**
 * Suite 4: Strict Provider Stream Invariant Verification (ALL 8 PROVIDERS)
 * Invariant: Every returned stream MUST have `url` and NEVER `externalUrl`.
 */
async function runAllProvidersStreamInvariantTests() {
  console.log('\n============================================================');
  console.log('▶ SUITE 4: Provider Stream Invariants (8/8 Providers - Zero externalUrl)');
  console.log('============================================================');

  const providers = [
    { name: 'FILM4K (VIP 0)', mod: film4k, id: 'film4k', sampleMovieSlug: 'nguoi-nhen-khoi-dau-moi-2012', sampleSeriesSlug: 'pham-nhan-tu-tien-2020' },
    { name: 'VSMOV (VIP 1)', mod: vsmov, id: 'vsmov', sampleMovieSlug: 'alien-romulus-2024', sampleSeriesSlug: 'house-of-the-dragon-season-2-2024' },
    { name: 'KKPhim (VIP 2)', mod: kkphim, id: 'kkphim', sampleMovieSlug: 'nguoi-nhen-du-hanh-vu-tru-nhen', sampleSeriesSlug: 'tay-du-ky-1986' },
    { name: 'NguonC (VIP 3)', mod: nguonc, id: 'nguonc', sampleMovieSlug: 'nu-hiep-ruy-bang', sampleSeriesSlug: 'pham-nhan-tu-tien' },
    { name: 'STP (VIP 4)', mod: stp, id: 'stp', sampleMovieSlug: 'interstellar', sampleSeriesSlug: 'breaking-bad-season-1' },
    { name: 'HH3D (VIP)', mod: hh3d, id: 'hh3d', sampleMovieSlug: 'dau-pha-thuong-khung-dac-biet-3', sampleSeriesSlug: 'dau-pha-thuong-khung-phan-5' },
    { name: 'YAN (VIP 6)', mod: yan, id: 'yan', sampleMovieSlug: 'dau-la-dai-luc-1', sampleSeriesSlug: 'dau-la-dai-luc-2-tuyet-the-duong-mon' },
    { name: 'CLBPX (VIP 5)', mod: clbpx, id: 'clbpx', sampleMovieSlug: 'than-dieu-dai-hiep-1995', sampleSeriesSlug: 'thien-long-bat-bo-1997' },
  ];

  for (const p of providers) {
    // Test Provider getStreams directly for Movie
    try {
      const streams = await p.mod.getStreams({
        type: 'movie',
        id: `${p.id}_${p.sampleMovieSlug}`,
        slug: p.sampleMovieSlug,
        title: p.sampleMovieSlug.replace(/-/g, ' '),
        proxyBase: testBaseUrl,
      });

      assert.ok(Array.isArray(streams), `${p.name} getStreams must return an array`);
      
      for (const s of streams) {
        assert.ok(s.url && typeof s.url === 'string', `${p.name} stream must have non-empty 'url'`);
        assert.strictEqual(s.externalUrl, undefined, `VIOLATION: ${p.name} stream contains forbidden 'externalUrl': ${s.externalUrl}`);
        if (s.subtitles && Array.isArray(s.subtitles)) {
          for (const sub of s.subtitles) {
            assert.ok(sub.url, `${p.name} subtitle must have 'url'`);
            assert.strictEqual(sub.externalUrl, undefined, `${p.name} subtitle has forbidden 'externalUrl'`);
          }
        }
      }

      pass(`4.${providers.indexOf(p) * 2 + 1} ${p.name} [Movie] Stream Invariant: 'url' present, 'externalUrl' ABSENT (0 violations in ${streams.length} streams)`);
    } catch (e) {
      fail(`4.${providers.indexOf(p) * 2 + 1} ${p.name} [Movie] Stream Invariant`, e);
    }

    // Test Provider getStreams directly for Series
    try {
      const streams = await p.mod.getStreams({
        type: 'series',
        id: `${p.id}_${p.sampleSeriesSlug}:1:1`,
        slug: p.sampleSeriesSlug,
        title: p.sampleSeriesSlug.replace(/-/g, ' '),
        season: 1,
        episode: 1,
        proxyBase: testBaseUrl,
      });

      assert.ok(Array.isArray(streams), `${p.name} getStreams series must return an array`);

      for (const s of streams) {
        assert.ok(s.url && typeof s.url === 'string', `${p.name} series stream must have non-empty 'url'`);
        assert.strictEqual(s.externalUrl, undefined, `VIOLATION: ${p.name} series stream contains forbidden 'externalUrl': ${s.externalUrl}`);
      }

      pass(`4.${providers.indexOf(p) * 2 + 2} ${p.name} [Series] Stream Invariant: 'url' present, 'externalUrl' ABSENT (0 violations in ${streams.length} streams)`);
    } catch (e) {
      fail(`4.${providers.indexOf(p) * 2 + 2} ${p.name} [Series] Stream Invariant`, e);
    }
  }
}

/**
 * Suite 5: Stream Aggregator Route End-to-End Verification (/stream/:type/:id.json)
 */
async function runStreamAggregatorRouteTests() {
  console.log('\n============================================================');
  console.log('▶ SUITE 5: Stream Aggregator End-to-End Route Invariant Verification');
  console.log('============================================================');

  const testIds = [
    { type: 'movie', id: 'nguonc:nu-hiep-ruy-bang' },
    { type: 'series', id: 'nguonc:pham-nhan-tu-tien:0:1' },
    { type: 'movie', id: 'tt0111161' }, // Shawshank Redemption IMDb
  ];

  for (let i = 0; i < testIds.length; i++) {
    const item = testIds[i];
    try {
      const res = await axios.get(`${testBaseUrl}/stream/${item.type}/${encodeURIComponent(item.id)}.json`, {
        validateStatus: () => true,
      });

      assert.strictEqual(res.status, 200, `Expected HTTP 200 from stream aggregator, got ${res.status}`);
      assert.ok(res.data && Array.isArray(res.data.streams), 'Response must have streams array');

      for (const s of res.data.streams) {
        assert.ok(s.url && typeof s.url === 'string', `Aggregator stream must have url`);
        assert.strictEqual(s.externalUrl, undefined, `VIOLATION in aggregator output: externalUrl found on ${s.title}`);
        assert.ok(s.url.startsWith(testBaseUrl) || s.url.startsWith('http'), `Stream url must be valid URL: ${s.url}`);
      }

      pass(`5.${i + 1} Stream Aggregator Route for ${item.id} -> ${res.data.streams.length} streams, 100% 'url' only, 0 'externalUrl'`);
    } catch (e) {
      fail(`5.${i + 1} Stream Aggregator Route for ${item.id}`, e);
    }
  }
}

/**
 * Main Runner
 */
async function main() {
  console.log('================================================================');
  console.log('🧪 CHALLENGER 1: ADVERSARIAL EMPIRICAL TEST SUITE (Engine v1.7.1)');
  console.log('================================================================');

  const startTime = Date.now();
  try {
    await setupServers();
    await runHlsProxyErrorTests();
    await runParameterAdversarialTests();
    await runRangeAndConcurrencyTests();
    await runAllProvidersStreamInvariantTests();
    await runStreamAggregatorRouteTests();
  } catch (err) {
    console.error('Fatal Test Suite Error:', err);
    failedTests++;
  } finally {
    await teardownServers();
  }

  const durationSec = ((Date.now() - startTime) / 1000).toFixed(2);

  console.log('\n================================================================');
  console.log('📊 CHALLENGER 1 ADVERSARIAL TEST RESULTS:');
  console.log(`   Total Tests:  ${totalTests}`);
  console.log(`   Passed Tests: ${passedTests}`);
  console.log(`   Failed Tests: ${failedTests}`);
  console.log(`   Duration:     ${durationSec}s`);
  console.log('================================================================');

  if (failedTests > 0) {
    console.error(`\n❌ ${failedTests} TEST(S) FAILED:`);
    failures.forEach((f, idx) => {
      console.error(`  ${idx + 1}. ${f.name}: ${f.error}`);
    });
    process.exit(1);
  } else {
    console.log('\n🎉 ALL ADVERSARIAL & STRESS TESTS PASSED EMPIRICALLY WITH 0 FAILURES!');
    process.exit(0);
  }
}

main();
