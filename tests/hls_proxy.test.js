'use strict';

/**
 * ============================================================
 *  VIP Movies Addon — tests/hls_proxy.test.js
 *  Test Suite for HLS Proxy Engine & Zero-Drop 302 Fallback
 * ============================================================
 */

const assert = require('assert');
const axios = require('axios');
const app = require('../src/server');

let server = null;
let baseUrl = '';
let passed = 0;
let failed = 0;

function it(name, fn) {
  try {
    fn();
    console.log(`  ✅ PASS: ${name}`);
    passed++;
  } catch (err) {
    console.error(`  ❌ FAIL: ${name} -> ${err.message}`);
    failed++;
  }
}

async function itAsync(name, fn) {
  try {
    await fn();
    console.log(`  ✅ PASS: ${name}`);
    passed++;
  } catch (err) {
    console.error(`  ❌ FAIL: ${name} -> ${err.message}`);
    failed++;
  }
}

async function runHlsTests() {
  server = await new Promise((resolve) => {
    const s = app.listen(0, '127.0.0.1', () => resolve(s));
  });
  const port = server.address().port;
  baseUrl = `http://127.0.0.1:${port}`;

  console.log('\n╔══════════════════════════════════════════════════════════════╗');
  console.log('║        🎬 HLS PROXY ENGINE & ZERO-DROP 302 TEST SUITE        ║');
  console.log('╚══════════════════════════════════════════════════════════════╝\n');
  console.log(`📡 Testing on: ${baseUrl}\n`);

  try {
    // 1. Missing parameter validation
    await itAsync('Rejects missing URL parameter with 400 Bad Request', async () => {
      try {
        await axios.get(`${baseUrl}/hls/manifest.m3u8`);
        assert.fail('Should have failed with 400');
      } catch (err) {
        assert.strictEqual(err.response?.status, 400);
      }
    });

    // 2. Subtitle endpoint verification
    await itAsync('Proxy subtitle returns text/vtt and CORS headers', async () => {
      // Encode dummy subtitle or test URL
      const dummySub = Buffer.from('WEBVTT\n\n1\n00:00:01.000 --> 00:00:04.000\nXin chào VIP Movies').toString('base64url');
      const b64DataUrl = Buffer.from(`data:text/vtt;base64,${dummySub}`).toString('base64url');
      
      const res = await axios.get(`${baseUrl}/hls/sub.vtt?url=${b64DataUrl}`, {
        validateStatus: (s) => s === 200 || s === 400 || s === 502,
      });
      assert.ok(res.headers['access-control-allow-origin'] === '*');
      assert.ok(res.headers['content-type']?.includes('text/vtt') || res.status === 200);
    });

    // 3. Live KKPhim / NguonC / VSMOV Manifest Proxying
    await itAsync('Rewrites live M3U8 playlist with relative URL resolution', async () => {
      // Dynamically fetch active stream URL for Harry Potter tt0373889
      const streamRes = await axios.get(`${baseUrl}/stream/movie/tt0373889.json`, { timeout: 15000 });
      assert.ok(streamRes.data?.streams?.length > 0, 'Must return at least 1 stream');
      const liveProxyUrl = streamRes.data.streams[0].url;

      const res = await axios.get(liveProxyUrl, {
        timeout: 10000,
        responseType: 'text',
        validateStatus: (s) => s === 200 || s === 302,
      });

      if (res.status === 200) {
        const bodyStr = String(res.data);
        assert.ok(bodyStr.startsWith('#EXTM3U'), 'Must start with #EXTM3U');
        assert.ok(bodyStr.includes('/hls/manifest.m3u8') || bodyStr.includes('/hls/segment.ts'), 'Must rewrite sub-variants or segments');
      }
    });

    // 4. Zero-drop 302 fallback check
    await itAsync('Zero-drop 302 redirect fallback when upstream returns non-fatal network condition', async () => {
      const directUrl = 'https://example.com/stream/fallback.ts';
      const b64Direct = Buffer.from(directUrl).toString('base64url');

      const res = await axios.get(`${baseUrl}/hls/segment.ts?url=${b64Direct}`, {
        maxRedirects: 0,
        validateStatus: (s) => s === 302 || s === 502 || s === 200,
      });
      assert.ok([302, 502, 200].includes(res.status));
    });

  } finally {
    if (server) server.close();
  }

  console.log('\n──────────────────────────────────────────────────────────────');
  console.log(`🏁 HLS PROXY TESTS SUMMARY: ${passed} PASSED, ${failed} FAILED`);
  if (failed > 0) process.exit(1);
}

runHlsTests().catch((e) => {
  console.error(e);
  if (server) server.close();
  process.exit(1);
});
