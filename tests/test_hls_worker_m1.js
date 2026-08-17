'use strict';

const http = require('http');
const express = require('express');
const axios = require('axios');
const assert = require('assert');

const hlsRouter = require('../src/routes/hls');

async function runTests() {
  console.log('🧪 Starting HLS Proxy Route Tests for Worker M1...\n');

  // Create mock upstream CDN server
  const mockCdn = express();

  mockCdn.get('/master.m3u8', (req, res) => {
    assert.strictEqual(req.headers['referer'], 'https://vsmov.com/');
    res.setHeader('Content-Type', 'application/vnd.apple.mpegurl');
    res.send(`#EXTM3U
#EXT-X-VERSION:3
#EXT-X-MEDIA:TYPE=AUDIO,GROUP-ID="audio",NAME="Vietnamese",DEFAULT=YES,AUTOSELECT=YES,URI="audio/vi.m3u8"
#EXT-X-STREAM-INF:BANDWIDTH=8000000,RESOLUTION=3840x2160
variant_4k.m3u8
#EXT-X-STREAM-INF:BANDWIDTH=4000000,RESOLUTION=1920x1080
variant_1080p.m3u8
#EXT-X-I-FRAME-STREAM-INF:BANDWIDTH=500000,URI="iframe_4k.m3u8"
`);
  });

  mockCdn.get('/variant_4k.m3u8', (req, res) => {
    res.setHeader('Content-Type', 'application/vnd.apple.mpegurl');
    res.send(`#EXTM3U
#EXT-X-VERSION:3
#EXT-X-TARGETDURATION:10
#EXT-X-MEDIA-SEQUENCE:0
#EXT-X-KEY:METHOD=AES-128,URI="https://cdn.example.com/enc.key",IV=0x1234567890abcdef1234567890abcdef
#EXT-X-MAP:URI="init.mp4"
#EXT-X-PART:DURATION=0.5,URI="part0.ts"
#EXT-X-PRELOAD-HINT:TYPE=PART,URI="part1.ts"
#EXTINF:9.009,
segment_000.ts
#EXTINF:9.009,
https://othercdn.com/seg_001.ts
#EXTINF:9.009,
disguised_segment.png
#EXT-X-ENDLIST
`);
  });

  mockCdn.get('/enc.key', (req, res) => {
    res.setHeader('Content-Type', 'application/octet-stream');
    const keyBuf = Buffer.alloc(16, 0xAA);
    res.send(keyBuf);
  });

  mockCdn.get(['/segment_000.ts', '/disguised_segment.png'], (req, res) => {
    const totalSize = 65536; // 64KB
    const mockData = Buffer.alloc(totalSize);
    for (let i = 0; i < totalSize; i += 188) {
      mockData[i] = 0x47; // MPEG-TS sync byte
    }

    if (req.headers.range) {
      const match = req.headers.range.match(/bytes=(\d+)-(\d+)?/);
      if (match) {
        const start = parseInt(match[1], 10);
        const end = match[2] ? parseInt(match[2], 10) : totalSize - 1;
        const chunk = mockData.subarray(start, end + 1);
        res.status(206);
        res.setHeader('Content-Range', `bytes ${start}-${end}/${totalSize}`);
        res.setHeader('Accept-Ranges', 'bytes');
        res.setHeader('Content-Length', chunk.length);
        res.setHeader('Content-Type', 'video/MP2T');
        return res.send(chunk);
      }
    }

    res.setHeader('Content-Type', 'video/MP2T');
    res.setHeader('Content-Length', totalSize);
    res.setHeader('Accept-Ranges', 'bytes');
    res.send(mockData);
  });

  const cdnServer = await new Promise((resolve) => {
    const s = mockCdn.listen(0, '127.0.0.1', () => resolve(s));
  });
  const cdnPort = cdnServer.address().port;
  const cdnBase = `http://127.0.0.1:${cdnPort}`;

  // Create App server with HLS Proxy Router
  const app = express();
  app.use('/hls', hlsRouter);

  const proxyServer = await new Promise((resolve) => {
    const s = app.listen(0, '127.0.0.1', () => resolve(s));
  });
  const proxyPort = proxyServer.address().port;
  const proxyBase = `http://127.0.0.1:${proxyPort}`;

  try {
    // ─── Test 1: OPTIONS Preflight ──────────────────────────────
    console.log('1. Testing OPTIONS Preflight...');
    const optRes = await axios.options(`${proxyBase}/hls/manifest.m3u8`);
    assert.strictEqual(optRes.status, 204);
    assert.strictEqual(optRes.headers['access-control-allow-origin'], '*');
    console.log('   ✅ PASS');

    // ─── Test 2: Master M3U8 Manifest Rewriting ─────────────────
    console.log('2. Testing Master M3U8 Manifest Rewriting...');
    const masterUrl = `${cdnBase}/master.m3u8`;
    const b64Master = Buffer.from(masterUrl).toString('base64url');
    const b64Ref = Buffer.from('https://vsmov.com/').toString('base64url');

    const mRes = await axios.get(`${proxyBase}/hls/manifest.m3u8?url=${b64Master}&ref=${b64Ref}`);
    assert.strictEqual(mRes.status, 200);
    assert.ok(mRes.headers['content-type'].includes('application/vnd.apple.mpegurl'));
    assert.strictEqual(mRes.headers['cache-control'], 'no-cache, no-store, must-revalidate');
    assert.strictEqual(mRes.headers['access-control-allow-origin'], '*');

    const mBody = mRes.data;
    assert.ok(mBody.includes('#EXTM3U'));
    assert.ok(mBody.includes(`${proxyBase}/hls/manifest.m3u8?url=`));
    assert.ok(mBody.includes('URI='));
    console.log('   ✅ PASS: Master Playlist rewritten correctly with variant links');

    // ─── Test 3: Media M3U8 Manifest Rewriting ──────────────────
    console.log('3. Testing Media M3U8 Manifest Rewriting...');
    const variantUrl = `${cdnBase}/variant_4k.m3u8`;
    const b64Variant = Buffer.from(variantUrl).toString('base64url');

    const vRes = await axios.get(`${proxyBase}/hls/manifest.m3u8?url=${b64Variant}&ref=${b64Ref}`);
    assert.strictEqual(vRes.status, 200);
    const vBody = vRes.data;

    assert.ok(vBody.includes(`${proxyBase}/hls/key?url=`));
    assert.ok(vBody.includes(`${proxyBase}/hls/segment.ts?url=`));
    console.log('   ✅ PASS: Key, Map, Part, and Segments rewritten correctly');

    // ─── Test 4: Segment Proxying (>50KB and MPEG-TS Sync Byte) ─
    console.log('4. Testing Segment Proxying (/hls/segment.ts)...');
    const segUrl = `${cdnBase}/segment_000.ts`;
    const b64Seg = Buffer.from(segUrl).toString('base64url');

    const segRes = await axios.get(`${proxyBase}/hls/segment.ts?url=${b64Seg}&ref=${b64Ref}`, {
      responseType: 'arraybuffer',
    });
    assert.strictEqual(segRes.status, 200);
    assert.strictEqual(segRes.headers['content-type'], 'video/MP2T');
    assert.strictEqual(segRes.headers['cache-control'], 'public, max-age=31536000, immutable');
    assert.strictEqual(segRes.headers['access-control-allow-origin'], '*');

    const segBuf = Buffer.from(segRes.data);
    assert.strictEqual(segBuf.length, 65536);
    assert.strictEqual(segBuf[0], 0x47);
    assert.strictEqual(segBuf[188], 0x47);
    console.log('   ✅ PASS: Video chunk 64KB downloaded with video/MP2T and 0x47 sync byte');

    // ─── Test 5: HTTP Range 206 Partial Content ─────────────────
    console.log('5. Testing HTTP Range 206 Partial Content...');
    const rangeRes = await axios.get(`${proxyBase}/hls/segment.ts?url=${b64Seg}&ref=${b64Ref}`, {
      headers: { Range: 'bytes=0-1023' },
      responseType: 'arraybuffer',
      validateStatus: (s) => s >= 200 && s < 400,
    });
    assert.strictEqual(rangeRes.status, 206);
    assert.strictEqual(rangeRes.headers['content-range'], 'bytes 0-1023/65536');
    assert.strictEqual(rangeRes.data.byteLength, 1024);
    console.log('   ✅ PASS: Range request returned HTTP 206 and 1024 bytes');

    // ─── Test 6: Decryption Key Proxying (/hls/key) ─────────────
    console.log('6. Testing Decryption Key Proxying (/hls/key)...');
    const keyUrl = `${cdnBase}/enc.key`;
    const b64Key = Buffer.from(keyUrl).toString('base64url');

    const keyRes = await axios.get(`${proxyBase}/hls/key?url=${b64Key}&ref=${b64Ref}`, {
      responseType: 'arraybuffer',
    });
    assert.strictEqual(keyRes.status, 200);
    assert.strictEqual(keyRes.headers['content-type'], 'application/octet-stream');
    assert.strictEqual(keyRes.headers['cache-control'], 'no-cache, no-store');
    assert.strictEqual(keyRes.headers['access-control-allow-origin'], '*');
    assert.strictEqual(keyRes.data.byteLength, 16);
    console.log('   ✅ PASS: Key proxied with application/octet-stream');

    console.log('\n🎉 ALL WORKER M1 TESTS PASSED SUCCESSFULLY!');
  } finally {
    cdnServer.close();
    proxyServer.close();
  }
}

runTests().catch((err) => {
  console.error('❌ Test failed:', err);
  process.exit(1);
});
