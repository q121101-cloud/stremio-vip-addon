'use strict';

const http = require('http');
const express = require('express');
const axios = require('axios');
const assert = require('assert');
const hlsRouter = require('../src/routes/hls');

async function runAdversarialTests() {
  console.log('⚔️  STARTING REVIEWER 1 ADVERSARIAL STRESS TEST FOR M1 (src/routes/hls.js)...');

  let passed = 0;
  let failed = 0;

  // Mock CDN Server
  const mockCdn = express();
  let receivedCdnHeaders = {};

  mockCdn.use((req, res, next) => {
    receivedCdnHeaders[req.path] = req.headers;
    next();
  });

  // 1. Complex Master Playlist with mixed quoted/unquoted URIs, comments, 4K resolution
  mockCdn.get('/complex_master.m3u8', (req, res) => {
    res.setHeader('Content-Type', 'application/vnd.apple.mpegurl');
    res.send(`#EXTM3U
#EXT-X-VERSION:7
#EXT-X-INDEPENDENT-SEGMENTS
#EXT-X-MEDIA:TYPE=AUDIO,GROUP-ID="audio-aac",NAME="English",DEFAULT=YES,AUTOSELECT=YES,URI="audio/en.m3u8"
#EXT-X-MEDIA:TYPE=AUDIO,GROUP-ID="audio-aac",NAME="Vietnamese",DEFAULT=NO,AUTOSELECT=YES,URI=audio/vi.m3u8
#EXT-X-MEDIA:TYPE=SUBTITLES,GROUP-ID="subs",NAME="Vietnamese",DEFAULT=YES,URI="subs/vi.vtt"
#EXT-X-STREAM-INF:BANDWIDTH=15000000,AVERAGE-BANDWIDTH=12000000,RESOLUTION=3840x2160,FRAME-RATE=60.000,CODECS="avc1.640033,mp4a.40.2",AUDIO="audio-aac",SUBTITLES="subs"
4k/index.m3u8
#EXT-X-STREAM-INF:BANDWIDTH=8000000,RESOLUTION=1920x1080,AUDIO="audio-aac",SUBTITLES="subs"
https://cdn2.example.com/1080p/index.m3u8
#EXT-X-I-FRAME-STREAM-INF:BANDWIDTH=800000,URI="iframes/4k.m3u8"
`);
  });

  // 2. Complex Media Playlist with encryption keys, fMP4 init map, LL-HLS parts, relative paths, disguised TS chunks
  mockCdn.get('/4k/index.m3u8', (req, res) => {
    res.setHeader('Content-Type', 'application/vnd.apple.mpegurl');
    res.send(`#EXTM3U
#EXT-X-VERSION:7
#EXT-X-TARGETDURATION:6
#EXT-X-MEDIA-SEQUENCE:100
#EXT-X-KEY:METHOD=AES-128,URI="../keys/enc_1.key",IV=0x0123456789ABCDEF0123456789ABCDEF
#EXT-X-MAP:URI="init.mp4",BYTERANGE="720@0"
#EXTINF:6.000,
seg_100.ts?token=sec_abc123&expire=999999
#EXTINF:6.000,
../shared/seg_101.png
#EXT-X-KEY:METHOD=AES-128,URI="https://auth.example.com/keys/enc_2.key",IV=0x0123456789ABCDEF0123456789ABCDEF
#EXTINF:6.000,
https://cdn-edge.example.com/chunks/seg_102.bin
#EXT-X-PART:DURATION=0.5,URI="parts/part_103_0.ts"
#EXT-X-PRELOAD-HINT:TYPE=PART,URI="parts/part_103_1.ts"
#EXT-X-ENDLIST
`);
  });

  // 3. Key endpoint
  mockCdn.get('/keys/enc_1.key', (req, res) => {
    res.setHeader('Content-Type', 'application/octet-stream');
    res.setHeader('Content-Length', '16');
    res.send(Buffer.from('0123456789ABCDEF'));
  });

  // 4. Binary Segment endpoint
  mockCdn.get(['/4k/seg_100.ts', '/shared/seg_101.png', '/4k/init.mp4', '/4k/parts/part_103_0.ts'], (req, res) => {
    const totalSize = 100000; // ~100KB
    const data = Buffer.alloc(totalSize);
    for (let i = 0; i < totalSize; i += 188) {
      data[i] = 0x47;
    }

    if (req.headers.range) {
      const match = req.headers.range.match(/bytes=(\d+)-(\d+)?/);
      if (match) {
        const start = parseInt(match[1], 10);
        const end = match[2] ? parseInt(match[2], 10) : totalSize - 1;
        const chunk = data.subarray(start, end + 1);
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
    res.send(data);
  });

  const cdnServer = await new Promise((resolve) => {
    const s = mockCdn.listen(0, '127.0.0.1', () => resolve(s));
  });
  const cdnPort = cdnServer.address().port;
  const cdnBase = `http://127.0.0.1:${cdnPort}`;

  // Proxy App
  const app = express();
  app.use('/hls', hlsRouter);

  const proxyServer = await new Promise((resolve) => {
    const s = app.listen(0, '127.0.0.1', () => resolve(s));
  });
  const proxyPort = proxyServer.address().port;
  const proxyBase = `http://127.0.0.1:${proxyPort}`;

  async function testCase(desc, fn) {
    try {
      await fn();
      console.log(`  ✅ PASS: ${desc}`);
      passed++;
    } catch (e) {
      console.error(`  ❌ FAIL: ${desc}`);
      console.error(`     Error: ${e.message}`);
      failed++;
    }
  }

  try {
    // Test 1: Complex Master Playlist Rewriting (Audio, Subtitles, 4K, i-Frames, Referer)
    await testCase('Master Playlist rewrites 4K variant, absolute variant, quoted & unquoted audio/subs, and i-frames', async () => {
      const masterUrl = `${cdnBase}/complex_master.m3u8`;
      const b64Url = Buffer.from(masterUrl).toString('base64url');
      const b64Ref = Buffer.from('https://vsmov.com/').toString('base64url');

      const res = await axios.get(`${proxyBase}/hls/manifest.m3u8?url=${b64Url}&ref=${b64Ref}`);
      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.headers['content-type'], 'application/vnd.apple.mpegurl; charset=utf-8');
      assert.strictEqual(res.headers['cache-control'], 'no-cache, no-store, must-revalidate');
      assert.strictEqual(res.headers['access-control-allow-origin'], '*');

      const lines = res.data.split('\n');
      
      // Audio English (quoted)
      const audioEn = lines.find(l => l.includes('NAME="English"'));
      assert.ok(audioEn.includes(`${proxyBase}/hls/manifest.m3u8?url=`));
      const audioEnUrl = Buffer.from(new URL(audioEn.match(/URI="([^"]+)"/)[1]).searchParams.get('url'), 'base64url').toString('utf8');
      assert.strictEqual(audioEnUrl, `${cdnBase}/audio/en.m3u8`);

      // Audio Vietnamese (unquoted in original)
      const audioVi = lines.find(l => l.includes('NAME="Vietnamese"'));
      assert.ok(audioVi.includes(`${proxyBase}/hls/manifest.m3u8?url=`));
      const audioViUrl = Buffer.from(new URL(audioVi.match(/URI="([^"]+)"/)[1]).searchParams.get('url'), 'base64url').toString('utf8');
      assert.strictEqual(audioViUrl, `${cdnBase}/audio/vi.m3u8`);

      // Subtitles
      const subsVi = lines.find(l => l.includes('NAME="Vietnamese"') && l.includes('SUBTITLES'));
      assert.ok(subsVi.includes(`${proxyBase}/hls/manifest.m3u8?url=`));

      // 4K Variant
      const idx4k = lines.findIndex(l => l.includes('RESOLUTION=3840x2160'));
      const line4k = lines[idx4k + 1];
      assert.ok(line4k.startsWith(`${proxyBase}/hls/manifest.m3u8?url=`));
      const url4k = Buffer.from(new URL(line4k).searchParams.get('url'), 'base64url').toString('utf8');
      assert.strictEqual(url4k, `${cdnBase}/4k/index.m3u8`);

      // Absolute 1080p variant
      const idx1080 = lines.findIndex(l => l.includes('RESOLUTION=1920x1080'));
      const line1080 = lines[idx1080 + 1];
      assert.ok(line1080.startsWith(`${proxyBase}/hls/manifest.m3u8?url=`));
      const url1080 = Buffer.from(new URL(line1080).searchParams.get('url'), 'base64url').toString('utf8');
      assert.strictEqual(url1080, 'https://cdn2.example.com/1080p/index.m3u8');
    });

    // Test 2: Media Sub-Playlist with Relative paths, Disguised extensions, Keys, fMP4 Map, LL-HLS
    await testCase('Media Playlist rewrites relative paths, disguised chunks, key URIs to /hls/key, maps and parts to /hls/segment.ts', async () => {
      const subUrl = `${cdnBase}/4k/index.m3u8`;
      const b64Sub = Buffer.from(subUrl).toString('base64url');
      const b64Ref = Buffer.from('https://vsmov.com/').toString('base64url');

      const res = await axios.get(`${proxyBase}/hls/manifest.m3u8?url=${b64Sub}&ref=${b64Ref}`);
      assert.strictEqual(res.status, 200);

      const body = res.data;
      const lines = body.split('\n');

      // Key 1: relative ../keys/enc_1.key
      const key1Match = body.match(/#EXT-X-KEY:METHOD=AES-128,URI="([^"]+)"/);
      assert.ok(key1Match, 'Key 1 found');
      assert.ok(key1Match[1].startsWith(`${proxyBase}/hls/key?url=`));
      const key1Decoded = Buffer.from(new URL(key1Match[1]).searchParams.get('url'), 'base64url').toString('utf8');
      assert.strictEqual(key1Decoded, `${cdnBase}/keys/enc_1.key`);

      // MAP: init.mp4
      const mapMatch = body.match(/#EXT-X-MAP:URI="([^"]+)"/);
      assert.ok(mapMatch, 'Map found');
      assert.ok(mapMatch[1].startsWith(`${proxyBase}/hls/segment.ts?url=`));
      const mapDecoded = Buffer.from(new URL(mapMatch[1]).searchParams.get('url'), 'base64url').toString('utf8');
      assert.strictEqual(mapDecoded, `${cdnBase}/4k/init.mp4`);

      // Seg 100 with query tokens
      const seg100 = lines.find(l => {
        if (!l.startsWith(`${proxyBase}/hls/segment.ts?url=`)) return false;
        const dec = Buffer.from(new URL(l).searchParams.get('url'), 'base64url').toString('utf8');
        return dec.includes('seg_100.ts');
      });
      assert.ok(seg100, 'seg_100.ts rewritten');
      const seg100Decoded = Buffer.from(new URL(seg100).searchParams.get('url'), 'base64url').toString('utf8');
      assert.strictEqual(seg100Decoded, `${cdnBase}/4k/seg_100.ts?token=sec_abc123&expire=999999`);

      // Seg 101 with relative path and .png disguised extension
      const seg101 = lines.find(l => {
        if (!l.startsWith(`${proxyBase}/hls/segment.ts?url=`)) return false;
        const dec = Buffer.from(new URL(l).searchParams.get('url'), 'base64url').toString('utf8');
        return dec.includes('seg_101.png');
      });
      assert.ok(seg101, 'seg_101.png rewritten');
      const seg101Decoded = Buffer.from(new URL(seg101).searchParams.get('url'), 'base64url').toString('utf8');
      assert.strictEqual(seg101Decoded, `${cdnBase}/shared/seg_101.png`);

      // PART and PRELOAD-HINT
      const partMatch = body.match(/#EXT-X-PART:DURATION=0.5,URI="([^"]+)"/);
      assert.ok(partMatch, 'Part found');
      assert.ok(partMatch[1].startsWith(`${proxyBase}/hls/segment.ts?url=`));
      const partDecoded = Buffer.from(new URL(partMatch[1]).searchParams.get('url'), 'base64url').toString('utf8');
      assert.strictEqual(partDecoded, `${cdnBase}/4k/parts/part_103_0.ts`);

      const hintMatch = body.match(/#EXT-X-PRELOAD-HINT:TYPE=PART,URI="([^"]+)"/);
      assert.ok(hintMatch, 'Hint found');
      assert.ok(hintMatch[1].startsWith(`${proxyBase}/hls/segment.ts?url=`));
    });

    // Test 3: Segment delivery with 100KB binary data and MPEG-TS sync byte
    await testCase('/hls/segment.ts delivers binary data (>50KB) with video/MP2T and immutable cache', async () => {
      const segUrl = `${cdnBase}/4k/seg_100.ts`;
      const b64Seg = Buffer.from(segUrl).toString('base64url');
      const b64Ref = Buffer.from('https://vsmov.com/').toString('base64url');

      const res = await axios.get(`${proxyBase}/hls/segment.ts?url=${b64Seg}&ref=${b64Ref}`, {
        responseType: 'arraybuffer',
      });
      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.headers['content-type'], 'video/MP2T');
      assert.strictEqual(res.headers['cache-control'], 'public, max-age=31536000, immutable');
      assert.strictEqual(res.headers['access-control-allow-origin'], '*');
      assert.strictEqual(res.headers['accept-ranges'], 'bytes');

      const buf = Buffer.from(res.data);
      assert.strictEqual(buf.length, 100000);
      assert.strictEqual(buf[0], 0x47);
      assert.strictEqual(buf[188], 0x47);
      assert.strictEqual(buf[376], 0x47);
    });

    // Test 4: HTTP Range Request Forwarding (206 Partial Content)
    await testCase('/hls/segment.ts forwards Range header and returns 206 Partial Content', async () => {
      const segUrl = `${cdnBase}/4k/seg_100.ts`;
      const b64Seg = Buffer.from(segUrl).toString('base64url');

      const res = await axios.get(`${proxyBase}/hls/segment.ts?url=${b64Seg}`, {
        headers: { Range: 'bytes=500-1499' },
        responseType: 'arraybuffer',
        validateStatus: (s) => s >= 200 && s < 400,
      });

      assert.strictEqual(res.status, 206);
      assert.strictEqual(res.headers['content-range'], 'bytes 500-1499/100000');
      assert.strictEqual(res.headers['content-length'], '1000');
      assert.strictEqual(res.data.byteLength, 1000);
    });

    // Test 5: Key proxying via /hls/key
    await testCase('/hls/key proxies decryption keys with application/octet-stream and upstream referer', async () => {
      const keyUrl = `${cdnBase}/keys/enc_1.key`;
      const b64Key = Buffer.from(keyUrl).toString('base64url');
      const b64Ref = Buffer.from('https://vsmov.com/').toString('base64url');

      const res = await axios.get(`${proxyBase}/hls/key?url=${b64Key}&ref=${b64Ref}`, {
        responseType: 'arraybuffer',
      });
      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.headers['content-type'], 'application/octet-stream');
      assert.strictEqual(res.headers['cache-control'], 'no-cache, no-store');
      assert.strictEqual(res.headers['access-control-allow-origin'], '*');
      assert.strictEqual(res.data.byteLength, 16);
      assert.strictEqual(Buffer.from(res.data).toString('utf8'), '0123456789ABCDEF');

      // Verify upstream received referer
      assert.strictEqual(receivedCdnHeaders['/keys/enc_1.key']['referer'], 'https://vsmov.com/');
    });

    // Test 6: Standard Base64, Base64URL, and Plaintext URL compatibility
    await testCase('Accepts Base64URL, Standard Base64, and plain URLs', async () => {
      const target = `${cdnBase}/complex_master.m3u8`;
      const b64Url = Buffer.from(target).toString('base64url');
      const b64Std = Buffer.from(target).toString('base64');

      const r1 = await axios.get(`${proxyBase}/hls/manifest.m3u8?url=${b64Url}`);
      assert.strictEqual(r1.status, 200);

      const r2 = await axios.get(`${proxyBase}/hls/manifest.m3u8?url=${encodeURIComponent(b64Std)}`);
      assert.strictEqual(r2.status, 200);

      const r3 = await axios.get(`${proxyBase}/hls/manifest.m3u8?url=${encodeURIComponent(target)}`);
      assert.strictEqual(r3.status, 200);
    });

    // Test 7: Reverse proxy header forwarding (x-forwarded-proto and x-forwarded-host)
    await testCase('Generates proxy URLs using x-forwarded-proto and x-forwarded-host headers', async () => {
      const target = `${cdnBase}/complex_master.m3u8`;
      const b64 = Buffer.from(target).toString('base64url');

      const res = await axios.get(`${proxyBase}/hls/manifest.m3u8?url=${b64}`, {
        headers: {
          'x-forwarded-proto': 'https',
          'x-forwarded-host': 'stream.myaddon.vip',
        },
      });
      assert.strictEqual(res.status, 200);
      assert.ok(res.data.includes('https://stream.myaddon.vip/hls/manifest.m3u8?url='));
    });

    // Test 8: Error handling & resiliency
    await testCase('Returns 400 when url is missing, 502 on invalid/unreachable upstream', async () => {
      try {
        await axios.get(`${proxyBase}/hls/manifest.m3u8`);
        assert.fail('Should have failed with 400');
      } catch (err) {
        assert.strictEqual(err.response.status, 400);
      }

      try {
        await axios.get(`${proxyBase}/hls/segment.ts`);
        assert.fail('Should have failed with 400');
      } catch (err) {
        assert.strictEqual(err.response.status, 400);
      }

      try {
        await axios.get(`${proxyBase}/hls/key`);
        assert.fail('Should have failed with 400');
      } catch (err) {
        assert.strictEqual(err.response.status, 400);
      }

      const badB64 = Buffer.from('http://127.0.0.1:19999/non_existent.m3u8').toString('base64url');
      try {
        await axios.get(`${proxyBase}/hls/manifest.m3u8?url=${badB64}`);
        assert.fail('Should have failed with 502');
      } catch (err) {
        assert.strictEqual(err.response.status, 502);
      }
    });

  } finally {
    cdnServer.close();
    proxyServer.close();
  }

  console.log(`\n📊 ADVERSARIAL STRESS TEST SUMMARY: ${passed} PASSED, ${failed} FAILED\n`);
  if (failed > 0) {
    process.exit(1);
  }
}

runAdversarialTests().catch((e) => {
  console.error('Fatal test error:', e);
  process.exit(1);
});
