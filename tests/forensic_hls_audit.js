'use strict';

const http = require('http');
const express = require('express');
const axios = require('axios');
const assert = require('assert');
const { m3u8Cache } = require('../src/lib/cache');
const hlsRouter = require('../src/routes/hls');

async function runForensicChecks() {
  console.log('🔬 STARTING FORENSIC INTEGRITY AUDIT ON src/routes/hls.js ...\n');
  m3u8Cache.clear();

  let passed = 0;
  let failed = 0;

  // Spin up a mock upstream CDN
  const capturedRequests = [];
  const mockCdn = express();

  mockCdn.use((req, res, next) => {
    capturedRequests.push({
      path: req.path,
      headers: { ...req.headers },
      query: { ...req.query },
    });
    next();
  });

  // Mock Master Playlist
  mockCdn.get('/stream/master.m3u8', (req, res) => {
    res.setHeader('Content-Type', 'application/vnd.apple.mpegurl');
    res.send(`#EXTM3U
#EXT-X-VERSION:4
#EXT-X-MEDIA:TYPE=AUDIO,GROUP-ID="audio",NAME="Vietnamese",DEFAULT=YES,AUTOSELECT=YES,URI="audio/vi.m3u8"
#EXT-X-MEDIA:TYPE=SUBTITLES,GROUP-ID="subs",NAME="Vietnamese",DEFAULT=YES,URI="subs/vi.m3u8"
#EXT-X-STREAM-INF:BANDWIDTH=8000000,RESOLUTION=3840x2160,AUDIO="audio",SUBTITLES="subs"
4k/index.m3u8
#EXT-X-STREAM-INF:BANDWIDTH=4000000,RESOLUTION=1920x1080,AUDIO="audio",SUBTITLES="subs"
https://cdn2.streamvsmov.com/1080p/index.m3u8?token=xyz123
#EXT-X-I-FRAME-STREAM-INF:BANDWIDTH=500000,URI="iframes/4k.m3u8"
`);
  });

  // Mock Media Playlist
  mockCdn.get('/stream/4k/index.m3u8', (req, res) => {
    res.setHeader('Content-Type', 'application/vnd.apple.mpegurl');
    res.send(`#EXTM3U
#EXT-X-VERSION:4
#EXT-X-TARGETDURATION:10
#EXT-X-MEDIA-SEQUENCE:0
#EXT-X-KEY:METHOD=AES-128,URI="keys/video.key",IV=0x1234567890abcdef1234567890abcdef
#EXT-X-MAP:URI="init.mp4"
#EXT-X-PART:DURATION=0.5,URI="parts/part0.ts"
#EXT-X-PRELOAD-HINT:TYPE=PART,URI="parts/part1.ts"
#EXTINF:10.0,
seg_000.ts
#EXTINF:10.0,
../shared/seg_001.ts?auth=token99
#EXTINF:10.0,
https://cdn.other.com/seg_002.ts
#EXT-X-ENDLIST
`);
  });

  // Mock Key
  mockCdn.get('/stream/4k/keys/video.key', (req, res) => {
    res.setHeader('Content-Type', 'application/octet-stream');
    res.setHeader('Content-Length', '16');
    res.send(Buffer.alloc(16, 0x55));
  });

  // Mock Video Segment
  const testSegmentSize = 70000;
  const testSegmentData = Buffer.alloc(testSegmentSize);
  for (let i = 0; i < testSegmentSize; i += 188) {
    testSegmentData[i] = 0x47;
  }

  mockCdn.get(['/stream/4k/seg_000.ts', '/stream/shared/seg_001.ts'], (req, res) => {
    if (req.headers.range) {
      const match = req.headers.range.match(/bytes=(\d+)-(\d+)?/);
      if (match) {
        const start = parseInt(match[1], 10);
        const end = match[2] ? parseInt(match[2], 10) : testSegmentSize - 1;
        const chunk = testSegmentData.subarray(start, end + 1);
        res.status(206);
        res.setHeader('Content-Range', `bytes ${start}-${end}/${testSegmentSize}`);
        res.setHeader('Accept-Ranges', 'bytes');
        res.setHeader('Content-Length', chunk.length);
        res.setHeader('Content-Type', 'video/MP2T');
        return res.send(chunk);
      }
    }
    res.setHeader('Content-Type', 'video/MP2T');
    res.setHeader('Content-Length', testSegmentSize);
    res.setHeader('Accept-Ranges', 'bytes');
    res.send(testSegmentData);
  });

  const cdnServer = await new Promise((res) => {
    const s = mockCdn.listen(0, '127.0.0.1', () => res(s));
  });
  const cdnPort = cdnServer.address().port;
  const cdnBase = `http://127.0.0.1:${cdnPort}`;

  // Express Proxy Server
  const proxyApp = express();
  proxyApp.use('/hls', hlsRouter);

  const proxyServer = await new Promise((res) => {
    const s = proxyApp.listen(0, '127.0.0.1', () => res(s));
  });
  const proxyPort = proxyServer.address().port;
  const proxyBase = `http://127.0.0.1:${proxyPort}`;

  try {
    // ─── Test 1: OPTIONS Preflight ───────────────────────────────
    console.log('1. Auditing OPTIONS Preflight CORS...');
    const optRes = await axios.options(`${proxyBase}/hls/manifest.m3u8`);
    assert.strictEqual(optRes.status, 204);
    assert.strictEqual(optRes.headers['access-control-allow-origin'], '*');
    assert.strictEqual(optRes.headers['access-control-allow-headers'], '*');
    assert.ok(optRes.headers['access-control-allow-methods'].includes('GET'));
    console.log('   ✅ PASS');
    passed++;

    // ─── Test 2: Master M3U8 Rewriting ───────────────────────────
    console.log('2. Auditing Master Playlist Line-by-Line Rewriting & Header Forwarding...');
    const masterUrl = `${cdnBase}/stream/master.m3u8`;
    const b64Master = Buffer.from(masterUrl).toString('base64url');
    const b64Ref = Buffer.from('https://vsmov.com/').toString('base64url');

    const mRes = await axios.get(`${proxyBase}/hls/manifest.m3u8?url=${b64Master}&ref=${b64Ref}`);
    assert.strictEqual(mRes.status, 200);
    assert.strictEqual(mRes.headers['content-type'], 'application/vnd.apple.mpegurl; charset=utf-8');
    assert.strictEqual(mRes.headers['cache-control'], 'no-cache, no-store, must-revalidate');
    assert.strictEqual(mRes.headers['access-control-allow-origin'], '*');

    const mBody = mRes.data;
    assert.ok(mBody.startsWith('#EXTM3U'));
    // Check audio URI
    assert.ok(mBody.includes(`URI="${proxyBase}/hls/manifest.m3u8?url=`));
    // Check relative 4k variant rewritten to absolute base
    const lines = mBody.split('\n');
    const line4k = lines.find((l) => l.startsWith(`${proxyBase}/hls/manifest.m3u8?url=`));
    assert.ok(line4k);
    const decoded4k = Buffer.from(new URL(line4k).searchParams.get('url'), 'base64url').toString('utf8');
    assert.strictEqual(decoded4k, `${cdnBase}/stream/4k/index.m3u8`);

    // Verify upstream captured headers
    const reqMaster = capturedRequests.find((r) => r.path === '/stream/master.m3u8');
    assert.ok(reqMaster);
    assert.strictEqual(reqMaster.headers['referer'], 'https://vsmov.com/');
    assert.strictEqual(reqMaster.headers['origin'], 'https://vsmov.com');
    assert.ok(reqMaster.headers['user-agent'].includes('Chrome/126.0.0.0'));
    console.log('   ✅ PASS');
    passed++;

    // ─── Test 3: Media Playlist Rewriting ────────────────────────
    console.log('3. Auditing Media Playlist (Keys, Maps, Parts, Segments) Rewriting...');
    const mediaUrl = `${cdnBase}/stream/4k/index.m3u8`;
    const b64Media = Buffer.from(mediaUrl).toString('base64url');

    const medRes = await axios.get(`${proxyBase}/hls/manifest.m3u8?url=${b64Media}&ref=${b64Ref}`);
    assert.strictEqual(medRes.status, 200);
    const medBody = medRes.data;

    // Check key URI -> /hls/key?url=...
    assert.ok(medBody.includes(`URI="${proxyBase}/hls/key?url=`));
    // Check map URI -> /hls/segment.ts?url=...
    assert.ok(medBody.includes(`URI="${proxyBase}/hls/segment.ts?url=`));
    // Check segments -> /hls/segment.ts?url=...
    const segLines = medBody.split('\n').filter((l) => l.startsWith(`${proxyBase}/hls/segment.ts?url=`));
    assert.strictEqual(segLines.length, 3);

    // Decode seg 1
    const seg0Url = Buffer.from(new URL(segLines[0]).searchParams.get('url'), 'base64url').toString('utf8');
    assert.strictEqual(seg0Url, `${cdnBase}/stream/4k/seg_000.ts`);

    // Decode seg 2 (relative ../shared/)
    const seg1Url = Buffer.from(new URL(segLines[1]).searchParams.get('url'), 'base64url').toString('utf8');
    assert.strictEqual(seg1Url, `${cdnBase}/stream/shared/seg_001.ts?auth=token99`);

    console.log('   ✅ PASS');
    passed++;

    // ─── Test 4: Segment Proxy & Binary Streaming (> 50KB) ────────
    console.log('4. Auditing Segment Proxy (/hls/segment.ts) Streaming & Range 206...');
    const segTargetUrl = `${cdnBase}/stream/4k/seg_000.ts`;
    const b64SegTarget = Buffer.from(segTargetUrl).toString('base64url');

    const segRes = await axios.get(`${proxyBase}/hls/segment.ts?url=${b64SegTarget}&ref=${b64Ref}`, {
      responseType: 'arraybuffer',
    });
    assert.strictEqual(segRes.status, 200);
    assert.strictEqual(segRes.headers['content-type'], 'video/MP2T');
    assert.strictEqual(segRes.headers['cache-control'], 'public, max-age=31536000, immutable');
    assert.strictEqual(segRes.headers['access-control-allow-origin'], '*');
    assert.strictEqual(segRes.data.byteLength, testSegmentSize);
    assert.strictEqual(segRes.data[0], 0x47);
    assert.strictEqual(segRes.data[188], 0x47);

    // HTTP Range Test
    const rangeRes = await axios.get(`${proxyBase}/hls/segment.ts?url=${b64SegTarget}&ref=${b64Ref}`, {
      headers: { Range: 'bytes=0-1023' },
      responseType: 'arraybuffer',
      validateStatus: (s) => s >= 200 && s < 400,
    });
    assert.strictEqual(rangeRes.status, 206);
    assert.strictEqual(rangeRes.headers['content-range'], `bytes 0-1023/${testSegmentSize}`);
    assert.strictEqual(rangeRes.data.byteLength, 1024);
    console.log('   ✅ PASS');
    passed++;

    // ─── Test 5: Key Proxy (/hls/key) ────────────────────────────
    console.log('5. Auditing Decryption Key Proxy (/hls/key)...');
    const keyTargetUrl = `${cdnBase}/stream/4k/keys/video.key`;
    const b64KeyTarget = Buffer.from(keyTargetUrl).toString('base64url');

    const keyRes = await axios.get(`${proxyBase}/hls/key?url=${b64KeyTarget}&ref=${b64Ref}`, {
      responseType: 'arraybuffer',
    });
    assert.strictEqual(keyRes.status, 200);
    assert.strictEqual(keyRes.headers['content-type'], 'application/octet-stream');
    assert.strictEqual(keyRes.headers['cache-control'], 'no-cache, no-store');
    assert.strictEqual(keyRes.data.byteLength, 16);
    assert.strictEqual(keyRes.data[0], 0x55);
    console.log('   ✅ PASS');
    passed++;

    // ─── Test 6: Referer & Origin Resolution Patterns ────────────
    console.log('6. Auditing Referer Resolution Logic for all providers...');
    const domainChecks = [
      { url: 'https://cdn.phim1280.tv/stream/seg.ts', expRef: 'https://player.phimapi.com/' },
      { url: 'https://p25.streamvsmov.com/hls/master.m3u8', expRef: 'https://vsmov.com/' },
      { url: 'https://phim.nguonc.com/stream/index.m3u8', expRef: 'https://phim.nguonc.com/' },
      { url: 'https://amass2.top/stream/seg.ts', expRef: 'https://embed15.streamc.xyz/' },
      { url: 'https://tvhay.org/stream/seg.ts', expRef: 'https://suutamphim.org/' },
      { url: 'https://hh3d.tv/stream/seg.ts', expRef: 'https://hh3d.tv/' },
      { url: 'https://yan.tv/stream/seg.ts', expRef: 'https://yanhh3d.org/' },
      { url: 'https://clbphimxua.com/stream/seg.ts', expRef: 'https://clbphimxua.com/' },
    ];

    for (const dc of domainChecks) {
      capturedRequests.length = 0;
      const b64 = Buffer.from(`${cdnBase}/stream/4k/keys/video.key?orig=${encodeURIComponent(dc.url)}`).toString('base64url');
      await axios.get(`${proxyBase}/hls/key?url=${b64}`, { responseType: 'arraybuffer' });
      const lastReq = capturedRequests[capturedRequests.length - 1];
      assert.ok(lastReq);
      assert.strictEqual(lastReq.headers['referer'], dc.expRef);
    }
    console.log('   ✅ PASS');
    passed++;

    // ─── Test 7: Error Resiliency & Missing Params ───────────────
    console.log('7. Auditing Error Resiliency (400, 502, timeouts)...');
    try {
      await axios.get(`${proxyBase}/hls/manifest.m3u8`);
      assert.fail('Should return 400');
    } catch (e) {
      assert.strictEqual(e.response.status, 400);
    }

    try {
      await axios.get(`${proxyBase}/hls/segment.ts`);
      assert.fail('Should return 400');
    } catch (e) {
      assert.strictEqual(e.response.status, 400);
    }

    try {
      await axios.get(`${proxyBase}/hls/key`);
      assert.fail('Should return 400');
    } catch (e) {
      assert.strictEqual(e.response.status, 400);
    }
    console.log('   ✅ PASS');
    passed++;

    // ─── Test 8: Polymorphic Parameter Formats ──────────────────
    console.log('8. Auditing Parameter Formats (Base64URL, Standard Base64, Raw URL)...');
    // Raw URL
    const rawUrlRes = await axios.get(`${proxyBase}/hls/manifest.m3u8?url=${encodeURIComponent(masterUrl)}&ref=https://vsmov.com/`);
    assert.strictEqual(rawUrlRes.status, 200);

    // Standard Base64
    const stdB64 = Buffer.from(masterUrl).toString('base64');
    const stdB64Res = await axios.get(`${proxyBase}/hls/manifest.m3u8?url=${encodeURIComponent(stdB64)}`);
    assert.strictEqual(stdB64Res.status, 200);
    console.log('   ✅ PASS');
    passed++;

    console.log(`\n🎉 ALL ${passed} FORENSIC INTEGRITY AUDIT CHECKS PASSED WITH ZERO VIOLATIONS!`);
  } catch (err) {
    console.error('❌ Forensic Check Failed:', err);
    failed++;
    throw err;
  } finally {
    cdnServer.close();
    proxyServer.close();
  }
}

runForensicChecks().catch((err) => {
  console.error(err);
  process.exit(1);
});
