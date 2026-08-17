'use strict';

/**
 * ==============================================================================
 *  VIP Movies Addon — tests/test_hls_adversarial_m1_2.js
 *  Adversarial & Stress-Testing Test Suite for HLS Proxy (Reviewer 2 - Milestone 1)
 * ==============================================================================
 */

const http = require('http');
const express = require('express');
const axios = require('axios');
const assert = require('assert');

const hlsRouter = require('../src/routes/hls');

async function runAdversarialTests() {
  console.log('🧪 Starting Adversarial & Stress Testing for HLS Proxy (src/routes/hls.js)...\n');

  // Track upstream request headers
  const receivedUpstreamHeaders = [];

  // Mock Upstream CDN Server
  const mockCdn = express();

  mockCdn.use((req, res, next) => {
    receivedUpstreamHeaders.push({
      path: req.path,
      headers: req.headers,
    });
    next();
  });

  // 1. Complex Master Playlist with Audio, Subtitles, I-Frames, unquoted URIs, relative & absolute paths
  mockCdn.get('/complex-master.m3u8', (req, res) => {
    res.setHeader('Content-Type', 'application/vnd.apple.mpegurl');
    res.send(`#EXTM3U
#EXT-X-VERSION:6
#EXT-X-INDEPENDENT-SEGMENTS

# Audio Renditions
#EXT-X-MEDIA:TYPE=AUDIO,GROUP-ID="audio-main",NAME="Vietnamese Vietsub",DEFAULT=YES,AUTOSELECT=YES,LANGUAGE="vi",URI="audio/vietsub.m3u8"
#EXT-X-MEDIA:TYPE=AUDIO,GROUP-ID="audio-main",NAME="English Original",DEFAULT=NO,AUTOSELECT=YES,LANGUAGE="en",URI="https://external-audio-cdn.com/audio/en.m3u8"

# Subtitle Renditions
#EXT-X-MEDIA:TYPE=SUBTITLES,GROUP-ID="subs",NAME="Vietnamese",DEFAULT=YES,AUTOSELECT=YES,FORCED=NO,LANGUAGE="vi",URI="subs/vi.m3u8"

# 4K Variant Stream
#EXT-X-STREAM-INF:BANDWIDTH=15000000,AVERAGE-BANDWIDTH=12000000,RESOLUTION=3840x2160,FRAME-RATE=60.000,CODECS="avc1.640033,mp4a.40.2",AUDIO="audio-main",SUBTITLES="subs"
variant_4k/index.m3u8

# 1080p Variant Stream with unquoted URI in STREAM-INF (edge case)
#EXT-X-STREAM-INF:BANDWIDTH=5000000,RESOLUTION=1920x1080,URI=variant_1080p.m3u8

# 720p Variant Stream (relative path with dot-slash and query parameters)
#EXT-X-STREAM-INF:BANDWIDTH=2500000,RESOLUTION=1280x720
./variant_720p.m3u8?token=secure123&expire=99999999

# Absolute Variant Stream
#EXT-X-STREAM-INF:BANDWIDTH=1000000,RESOLUTION=854x480
https://alt-cdn.example.com/hls/variant_480p.m3u8

# I-Frame Stream
#EXT-X-I-FRAME-STREAM-INF:BANDWIDTH=600000,URI="iframe_4k.m3u8"
`);
  });

  // 2. Complex Media Playlist with Encrypted Keys, fMP4 Map, LL-HLS Parts, Disguised Extensions, Discontinuities
  mockCdn.get('/variant_4k/index.m3u8', (req, res) => {
    res.setHeader('Content-Type', 'application/vnd.apple.mpegurl');
    res.send(`#EXTM3U
#EXT-X-VERSION:7
#EXT-X-TARGETDURATION:6
#EXT-X-MEDIA-SEQUENCE:1001
#EXT-X-DISCONTINUITY-SEQUENCE:5

# Encryption Keys (AES-128 and SESSION-KEY)
#EXT-X-KEY:METHOD=AES-128,URI="../keys/aes128.key",IV=0x0123456789ABCDEF0123456789ABCDEF
#EXT-X-SESSION-KEY:METHOD=AES-128,URI="https://secure-auth.example.com/keys/session.key"

# fMP4 Map header
#EXT-X-MAP:URI="../init.mp4"

# LL-HLS Part & Preload
#EXT-X-PART:DURATION=0.5,URI="parts/part_1001_0.ts"
#EXT-X-PRELOAD-HINT:TYPE=PART,URI="parts/part_1001_1.ts"

# Discontinuity
#EXT-X-DISCONTINUITY
#EXT-X-PROGRAM-DATE-TIME:2026-08-17T15:00:00.000Z

#EXTINF:5.005,
seg_1001.ts
#EXTINF:5.005,
../seg_1002.ts?sig=abc&exp=123
#EXTINF:5.005,
https://cdn-edge.example.com/seg_1003.ts
#EXTINF:5.005,
disguised_segment_1004.png
#EXTINF:5.005,
custom_chunk_1005.bin?auth=token99
#EXT-X-ENDLIST
`);
  });

  // 3. AES-128 Key endpoint
  mockCdn.get('/keys/aes128.key', (req, res) => {
    res.setHeader('Content-Type', 'application/octet-stream');
    const key = Buffer.from([
      0x00, 0x11, 0x22, 0x33, 0x44, 0x55, 0x66, 0x77,
      0x88, 0x99, 0xAA, 0xBB, 0xCC, 0xDD, 0xEE, 0xFF,
    ]);
    res.send(key);
  });

  // 4. Large TS Segment generator (128 KB with sync bytes and Range support)
  mockCdn.get(['/seg_1001.ts', '/disguised_segment_1004.png', '/custom_chunk_1005.bin'], (req, res) => {
    const totalSize = 131072; // 128KB
    const mockData = Buffer.alloc(totalSize);
    for (let i = 0; i < totalSize; i += 188) {
      mockData[i] = 0x47; // Sync byte
      mockData[i + 1] = 0x40; // Payload unit start indicator
      mockData[i + 2] = 0x00; // PID
      mockData[i + 3] = 0x10; // Adaptation field control + continuity counter
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

  // 5. Error simulation routes
  mockCdn.get('/error-500.ts', (req, res) => {
    res.status(500).send('Upstream CDN Internal Error');
  });

  mockCdn.get('/error-404.m3u8', (req, res) => {
    res.status(404).send('Upstream Manifest Not Found');
  });

  const cdnServer = await new Promise((resolve) => {
    const s = mockCdn.listen(0, '127.0.0.1', () => resolve(s));
  });
  const cdnPort = cdnServer.address().port;
  const cdnBase = `http://127.0.0.1:${cdnPort}`;

  // Start Proxy App Server
  const app = express();
  app.use('/hls', hlsRouter);

  const proxyServer = await new Promise((resolve) => {
    const s = app.listen(0, '127.0.0.1', () => resolve(s));
  });
  const proxyPort = proxyServer.address().port;
  const proxyBase = `http://127.0.0.1:${proxyPort}`;

  try {
    // ════════════════════════════════════════════════════════════
    // TEST 1: Referer Headers & CDN Source Matching Matrix
    // ════════════════════════════════════════════════════════════
    console.log('1. Testing Referer & Origin Spoofing Matrix...');

    // Test KKPhim CDN
    receivedUpstreamHeaders.length = 0;
    const kkUrl = `${cdnBase}/kkphimplayer/playlist.m3u8`;
    await axios.get(`${proxyBase}/hls/manifest.m3u8?url=${Buffer.from(kkUrl).toString('base64url')}`).catch(() => {});
    let lastHeader = receivedUpstreamHeaders.find((h) => h.path.includes('kkphimplayer'));
    assert.strictEqual(lastHeader?.headers['referer'], 'https://player.phimapi.com/', 'KKPhim referer must be https://player.phimapi.com/');
    assert.strictEqual(lastHeader?.headers['origin'], 'https://player.phimapi.com', 'KKPhim origin must be https://player.phimapi.com');

    // Test VSMOV CDN
    receivedUpstreamHeaders.length = 0;
    const vsmovUrl = `${cdnBase}/streamvsmov/index.m3u8`;
    await axios.get(`${proxyBase}/hls/manifest.m3u8?url=${Buffer.from(vsmovUrl).toString('base64url')}`).catch(() => {});
    lastHeader = receivedUpstreamHeaders.find((h) => h.path.includes('streamvsmov'));
    assert.strictEqual(lastHeader?.headers['referer'], 'https://vsmov.com/', 'VSMOV referer must be https://vsmov.com/');

    // Test StreamC CDN
    receivedUpstreamHeaders.length = 0;
    const streamcUrl = `${cdnBase}/streamc.xyz/index.m3u8`;
    await axios.get(`${proxyBase}/hls/manifest.m3u8?url=${Buffer.from(streamcUrl).toString('base64url')}`).catch(() => {});
    lastHeader = receivedUpstreamHeaders.find((h) => h.path.includes('streamc.xyz'));
    assert.strictEqual(lastHeader?.headers['referer'], 'https://embed15.streamc.xyz/', 'StreamC referer must be https://embed15.streamc.xyz/');

    // Test Dynamic refParam override
    receivedUpstreamHeaders.length = 0;
    const customRef = 'https://custom-portal.org/embed/123';
    const b64CustomRef = Buffer.from(customRef).toString('base64url');
    await axios.get(`${proxyBase}/hls/manifest.m3u8?url=${Buffer.from(`${cdnBase}/custom/index.m3u8`).toString('base64url')}&ref=${b64CustomRef}`).catch(() => {});
    lastHeader = receivedUpstreamHeaders.find((h) => h.path.includes('custom'));
    assert.strictEqual(lastHeader?.headers['origin'], 'https://custom-portal.org', 'Dynamic refParam origin must match custom-portal.org');
    console.log('   ✅ PASS: Referer and Origin spoofing verified across all providers');

    // ════════════════════════════════════════════════════════════
    // TEST 2: Complex Master M3U8 Rewriting
    // ════════════════════════════════════════════════════════════
    console.log('2. Testing Complex Master M3U8 Rewriting (Audio, Subs, I-Frames, 4K)...');
    const masterUrl = `${cdnBase}/complex-master.m3u8`;
    const b64Master = Buffer.from(masterUrl).toString('base64url');
    const b64Ref = Buffer.from('https://vsmov.com/').toString('base64url');

    const mRes = await axios.get(`${proxyBase}/hls/manifest.m3u8?url=${b64Master}&ref=${b64Ref}`);
    assert.strictEqual(mRes.status, 200);
    const mBody = mRes.data;

    // Check Audio Rewriting
    assert.ok(mBody.includes('TYPE=AUDIO'), 'Audio tags must be present');
    assert.ok(mBody.includes('audio/vietsub.m3u8') === false, 'Relative audio URI must be rewritten');
    assert.ok(mBody.includes(`${proxyBase}/hls/manifest.m3u8?url=`), 'Audio URI must route to /hls/manifest.m3u8');

    // Check Subtitle Rewriting
    assert.ok(mBody.includes('TYPE=SUBTITLES'), 'Subtitle tags must be present');
    assert.ok(mBody.includes('subs/vi.m3u8') === false, 'Relative sub URI must be rewritten');

    // Check Variant Stream URLs
    assert.ok(mBody.includes('RESOLUTION=3840x2160'), '4K resolution must be preserved');
    assert.ok(mBody.includes(`${proxyBase}/hls/manifest.m3u8?url=`), 'Variant URLs must route to /hls/manifest.m3u8');

    // Check I-Frame stream
    assert.ok(mBody.includes('#EXT-X-I-FRAME-STREAM-INF'), 'I-Frame stream tag preserved');
    console.log('   ✅ PASS: Complex Master M3U8 rewritten accurately with all renditions');

    // ════════════════════════════════════════════════════════════
    // TEST 3: Complex Media M3U8 Rewriting
    // ════════════════════════════════════════════════════════════
    console.log('3. Testing Complex Media M3U8 Rewriting (Keys, Maps, Parts, Disguised)...');
    const variantUrl = `${cdnBase}/variant_4k/index.m3u8`;
    const b64Variant = Buffer.from(variantUrl).toString('base64url');

    const vRes = await axios.get(`${proxyBase}/hls/manifest.m3u8?url=${b64Variant}&ref=${b64Ref}`);
    assert.strictEqual(vRes.status, 200);
    const vBody = vRes.data;

    // Verify EXT-X-KEY rewritten to /hls/key
    assert.ok(vBody.includes(`${proxyBase}/hls/key?url=`), 'EXT-X-KEY must route to /hls/key');
    assert.ok(vBody.includes('METHOD=AES-128'), 'AES-128 method preserved');
    assert.ok(vBody.includes('IV=0x0123456789ABCDEF0123456789ABCDEF'), 'IV preserved');

    // Verify EXT-X-MAP rewritten to /hls/segment.ts
    assert.ok(vBody.includes('#EXT-X-MAP:URI="http'), 'EXT-X-MAP must be rewritten to proxy segment');
    assert.ok(vBody.includes('/hls/segment.ts?url='), 'EXT-X-MAP routes through /hls/segment.ts');

    // Verify LL-HLS EXT-X-PART & PRELOAD-HINT
    assert.ok(vBody.includes('#EXT-X-PART:DURATION=0.5,URI="http'), 'EXT-X-PART rewritten to proxy');
    assert.ok(vBody.includes('#EXT-X-PRELOAD-HINT:TYPE=PART,URI="http'), 'PRELOAD-HINT rewritten to proxy');

    // Verify Disguised Segment Extensions (.png and .bin)
    assert.ok(vBody.includes('/hls/segment.ts?url='), 'Disguised .png and .bin chunks rewritten to /hls/segment.ts');
    assert.ok(vBody.includes('#EXT-X-DISCONTINUITY'), 'DISCONTINUITY tag preserved');
    console.log('   ✅ PASS: Complex Media M3U8 rewritten accurately (Keys, Maps, Parts, Disguised extensions)');

    // ════════════════════════════════════════════════════════════
    // TEST 4: Binary AES-128 Key Verification (/hls/key)
    // ════════════════════════════════════════════════════════════
    console.log('4. Testing Key Proxy (/hls/key) Binary Integrity...');
    const keyUrl = `${cdnBase}/keys/aes128.key`;
    const b64Key = Buffer.from(keyUrl).toString('base64url');

    const keyRes = await axios.get(`${proxyBase}/hls/key?url=${b64Key}&ref=${b64Ref}`, { responseType: 'arraybuffer' });
    assert.strictEqual(keyRes.status, 200);
    assert.strictEqual(keyRes.headers['content-type'], 'application/octet-stream');
    assert.strictEqual(keyRes.data.byteLength, 16);

    const expectedKey = Buffer.from([0x00, 0x11, 0x22, 0x33, 0x44, 0x55, 0x66, 0x77, 0x88, 0x99, 0xAA, 0xBB, 0xCC, 0xDD, 0xEE, 0xFF]);
    assert.deepStrictEqual(Buffer.from(keyRes.data), expectedKey, 'Key binary payload must match upstream byte-for-byte');
    console.log('   ✅ PASS: Key proxied with exact 16-byte AES-128 payload');

    // ════════════════════════════════════════════════════════════
    // TEST 5: Video Chunk Binary Download (>50KB, Sync Bytes)
    // ════════════════════════════════════════════════════════════
    console.log('5. Testing Segment Binary Download (>50KB, 188-byte alignment)...');
    const segUrl = `${cdnBase}/seg_1001.ts`;
    const b64Seg = Buffer.from(segUrl).toString('base64url');

    const segRes = await axios.get(`${proxyBase}/hls/segment.ts?url=${b64Seg}&ref=${b64Ref}`, { responseType: 'arraybuffer' });
    assert.strictEqual(segRes.status, 200);
    assert.strictEqual(segRes.headers['content-type'], 'video/MP2T');
    assert.strictEqual(segRes.headers['cache-control'], 'public, max-age=31536000, immutable');
    assert.strictEqual(segRes.data.byteLength, 131072);

    const segBuf = Buffer.from(segRes.data);
    assert.strictEqual(segBuf[0], 0x47, 'Byte 0 must be 0x47 sync byte');
    assert.strictEqual(segBuf[188], 0x47, 'Byte 188 must be 0x47 sync byte');
    assert.strictEqual(segBuf[376], 0x47, 'Byte 376 must be 0x47 sync byte');
    console.log(`   ✅ PASS: Downloaded ${segBuf.length} bytes (128 KB) with valid 188-byte packet sync`);

    // ════════════════════════════════════════════════════════════
    // TEST 6: HTTP Range Requests (206 Partial Content)
    // ════════════════════════════════════════════════════════════
    console.log('6. Testing HTTP Range 206 Partial Content Forwarding...');
    const r1 = await axios.get(`${proxyBase}/hls/segment.ts?url=${b64Seg}&ref=${b64Ref}`, {
      headers: { Range: 'bytes=0-2047' },
      responseType: 'arraybuffer',
      validateStatus: (s) => s < 400,
    });
    assert.strictEqual(r1.status, 206);
    assert.strictEqual(r1.headers['content-range'], 'bytes 0-2047/131072');
    assert.strictEqual(r1.data.byteLength, 2048);

    const r2 = await axios.get(`${proxyBase}/hls/segment.ts?url=${b64Seg}&ref=${b64Ref}`, {
      headers: { Range: 'bytes=65536-131071' },
      responseType: 'arraybuffer',
      validateStatus: (s) => s < 400,
    });
    assert.strictEqual(r2.status, 206);
    assert.strictEqual(r2.headers['content-range'], 'bytes 65536-131071/131072');
    assert.strictEqual(r2.data.byteLength, 65536);
    console.log('   ✅ PASS: HTTP Range 206 Partial Content validated across offsets');

    // ════════════════════════════════════════════════════════════
    // TEST 7: Robust Error Handling & Non-Crashing Invariants
    // ════════════════════════════════════════════════════════════
    console.log('7. Testing Error Handling & Invariants...');

    // Missing URL param -> 400
    const errRes1 = await axios.get(`${proxyBase}/hls/manifest.m3u8`, { validateStatus: () => true });
    assert.strictEqual(errRes1.status, 400, 'Missing url must return 400');

    const errRes2 = await axios.get(`${proxyBase}/hls/segment.ts`, { validateStatus: () => true });
    assert.strictEqual(errRes2.status, 400, 'Missing url in segment must return 400');

    // Upstream 404 in manifest -> 502
    const errRes3 = await axios.get(`${proxyBase}/hls/manifest.m3u8?url=${Buffer.from(`${cdnBase}/error-404.m3u8`).toString('base64url')}`, { validateStatus: () => true });
    assert.strictEqual(errRes3.status, 502, 'Upstream 404 must return 502 proxy error');

    // Upstream 500 in segment -> 502
    const errRes4 = await axios.get(`${proxyBase}/hls/segment.ts?url=${Buffer.from(`${cdnBase}/error-500.ts`).toString('base64url')}`, { validateStatus: () => true });
    assert.strictEqual(errRes4.status, 502, 'Upstream 500 must return 502 proxy error');

    console.log('   ✅ PASS: Error conditions handled gracefully without unhandled exceptions');

    console.log('\n🎉 ALL ADVERSARIAL STRESS TESTS COMPLETED SUCCESSFULLY!');
    return true;
  } finally {
    cdnServer.close();
    proxyServer.close();
  }
}

runAdversarialTests().catch((err) => {
  console.error('❌ Adversarial Test Failed:', err);
  process.exit(1);
});
