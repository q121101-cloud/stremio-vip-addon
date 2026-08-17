'use strict';

/**
 * ============================================================
 *  Adversarial & Empirical Stress Test Suite for HLS Proxy
 *  Milestone 1 — Challenger 1
 *  Target: src/routes/hls.js
 * ============================================================
 */

const express = require('express');
const axios   = require('axios');
const assert  = require('assert');

const hlsRouter = require('../src/routes/hls');

let totalTests = 0;
let passedTests = 0;
let failedTests = 0;
const failures = [];

function recordPass(title) {
  totalTests++;
  passedTests++;
  console.log(`  ✅ [PASS] ${title}`);
}

function recordFail(title, error) {
  totalTests++;
  failedTests++;
  const msg = error && error.message ? error.message : String(error);
  failures.push({ title, error: msg });
  console.error(`  ❌ [FAIL] ${title}: ${msg}`);
}

async function runSuite() {
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('  EMPIRICAL CHALLENGER 1: HLS PROXY & REWRITER STRESS SUITE  ');
  console.log('═══════════════════════════════════════════════════════════════\n');

  // ─── Setup Mock Upstream CDN ──────────────────────────────────
  const mockCdn = express();
  const SEGMENT_SIZE = 131072; // 128 KB
  const mockSegmentBuffer = Buffer.alloc(SEGMENT_SIZE);
  for (let i = 0; i < SEGMENT_SIZE; i += 188) {
    mockSegmentBuffer[i] = 0x47; // TS Sync byte
  }

  // 1. Master playlist endpoint
  mockCdn.get('/cdn/master.m3u8', (req, res) => {
    res.setHeader('Content-Type', 'application/vnd.apple.mpegurl; charset=utf-8');
    res.send(`#EXTM3U
#EXT-X-VERSION:4
#EXT-X-MEDIA:TYPE=AUDIO,GROUP-ID="audio",NAME="Vietnamese",DEFAULT=YES,URI="audio/vi.m3u8"
#EXT-X-MEDIA:TYPE=SUBTITLES,GROUP-ID="subs",NAME="Vietnamese",DEFAULT=YES,URI="https://cdn.example.com/subs/vi.m3u8"
#EXT-X-STREAM-INF:BANDWIDTH=8000000,RESOLUTION=3840x2160,AUDIO="audio",SUBTITLES="subs"
4k/playlist.m3u8?token=xyz&auth=123
#EXT-X-STREAM-INF:BANDWIDTH=4000000,RESOLUTION=1920x1080
https://othercdn.example.com/1080p/index.m3u8
#EXT-X-I-FRAME-STREAM-INF:BANDWIDTH=500000,URI="iframe_4k.m3u8"
`);
  });

  // 2. Media playlist endpoint with AES-128, fMP4 Map, LL-HLS parts, relative and absolute segments
  mockCdn.get('/cdn/4k/playlist.m3u8', (req, res) => {
    res.setHeader('Content-Type', 'application/vnd.apple.mpegurl');
    res.send(`#EXTM3U
#EXT-X-VERSION:7
#EXT-X-TARGETDURATION:10
#EXT-X-MEDIA-SEQUENCE:100
#EXT-X-KEY:METHOD=AES-128,URI="../keys/key_100.key?token=abc",IV=0x1234567890abcdef1234567890abcdef
#EXT-X-SESSION-KEY:METHOD=AES-128,URI="https://cdn.example.com/keys/session.key"
#EXT-X-MAP:URI="init.mp4"
#EXT-X-PART:DURATION=0.5,URI="parts/part0.ts"
#EXT-X-PRELOAD-HINT:TYPE=PART,URI="parts/part1.ts"
#EXTINF:9.009,
seg_100.ts?res=4k&sign=xyz
#EXTINF:9.009,
https://abs-cdn.example.com/video/seg_101.ts
#EXTINF:9.009,
image_disguised_seg.png
#EXT-X-ENDLIST
`);
  });

  // 3. Key endpoint
  mockCdn.get(['/cdn/4k/keys/key_100.key', '/cdn/keys/key_100.key'], (req, res) => {
    res.setHeader('Content-Type', 'application/octet-stream');
    res.setHeader('Content-Length', 16);
    res.send(Buffer.alloc(16, 0xEE));
  });

  // 4. Segment endpoint with HTTP Range handling
  mockCdn.get(['/cdn/4k/seg_100.ts', '/cdn/4k/image_disguised_seg.png', '/cdn/4k/parts/part0.ts', '/cdn/4k/parts/part1.ts', '/cdn/4k/init.mp4'], (req, res) => {
    const rangeHeader = req.headers.range;

    if (rangeHeader) {
      if (rangeHeader.startsWith('bytes=')) {
        const rangesStr = rangeHeader.replace('bytes=', '').trim();

        // Check for multi-range: e.g. "0-99, 200-299"
        if (rangesStr.includes(',')) {
          res.setHeader('Content-Type', 'multipart/byteranges; boundary=3d9dea2a78808');
          res.status(206);
          const parts = rangesStr.split(',').map(r => r.trim());
          let body = '';
          for (const part of parts) {
            const [sStr, eStr] = part.split('-');
            const s = parseInt(sStr, 10);
            const e = eStr ? parseInt(eStr, 10) : SEGMENT_SIZE - 1;
            body += `--3d9dea2a78808\r\nContent-Type: video/MP2T\r\nContent-Range: bytes ${s}-${e}/${SEGMENT_SIZE}\r\n\r\n` +
                    mockSegmentBuffer.subarray(s, e + 1).toString('binary') + '\r\n';
          }
          body += '--3d9dea2a78808--\r\n';
          res.setHeader('Content-Length', Buffer.byteLength(body, 'binary'));
          return res.end(Buffer.from(body, 'binary'));
        }

        // Single range: e.g. "0-1023", "1000-", "-500"
        let start, end;
        if (rangesStr.startsWith('-')) {
          const suffixLen = parseInt(rangesStr.slice(1), 10);
          start = Math.max(0, SEGMENT_SIZE - suffixLen);
          end = SEGMENT_SIZE - 1;
        } else {
          const [sStr, eStr] = rangesStr.split('-');
          start = parseInt(sStr, 10);
          end = eStr ? parseInt(eStr, 10) : SEGMENT_SIZE - 1;
        }

        // Out-of-bounds check
        if (start >= SEGMENT_SIZE || start > end) {
          res.status(416);
          res.setHeader('Content-Range', `bytes */${SEGMENT_SIZE}`);
          return res.send('Requested range not satisfiable');
        }

        end = Math.min(end, SEGMENT_SIZE - 1);
        const chunk = mockSegmentBuffer.subarray(start, end + 1);
        res.status(206);
        res.setHeader('Content-Range', `bytes ${start}-${end}/${SEGMENT_SIZE}`);
        res.setHeader('Content-Length', chunk.length);
        res.setHeader('Accept-Ranges', 'bytes');
        res.setHeader('Content-Type', 'video/MP2T');
        return res.send(chunk);
      }
    }

    res.setHeader('Content-Type', 'video/MP2T');
    res.setHeader('Content-Length', SEGMENT_SIZE);
    res.setHeader('Accept-Ranges', 'bytes');
    res.send(mockSegmentBuffer);
  });

  // Upstream error simulator
  mockCdn.get('/cdn/error/500', (req, res) => res.status(500).send('Internal Server Error'));
  mockCdn.get('/cdn/error/403', (req, res) => res.status(403).send('Forbidden'));
  mockCdn.get('/cdn/error/404', (req, res) => res.status(404).send('Not Found'));

  const cdnServer = await new Promise(resolve => {
    const s = mockCdn.listen(0, '127.0.0.1', () => resolve(s));
  });
  const cdnPort = cdnServer.address().port;
  const cdnBase = `http://127.0.0.1:${cdnPort}`;

  // ─── Setup App Server mounting hlsRouter ──────────────────────
  const app = express();
  app.use('/hls', hlsRouter);

  const proxyServer = await new Promise(resolve => {
    const s = app.listen(0, '127.0.0.1', () => resolve(s));
  });
  const proxyPort = proxyServer.address().port;
  const proxyBase = `http://127.0.0.1:${proxyPort}`;

  console.log(`📡 Mock CDN running on: ${cdnBase}`);
  console.log(`🚀 Proxy Server running on: ${proxyBase}\n`);

  try {
    // ══════════════════════════════════════════════════════════════
    // SUITE 1: HTTP Range Requests on /hls/segment.ts
    // ══════════════════════════════════════════════════════════════
    console.log('-------------------------------------------------------------');
    console.log('SUITE 1: HTTP Range Requests & Seeking on /hls/segment.ts');
    console.log('-------------------------------------------------------------');

    const segUrl = `${cdnBase}/cdn/4k/seg_100.ts`;
    const b64Seg = Buffer.from(segUrl).toString('base64url');

    // 1.1 Partial Range 0-1023
    try {
      const res = await axios.get(`${proxyBase}/hls/segment.ts?url=${b64Seg}`, {
        headers: { Range: 'bytes=0-1023' },
        responseType: 'arraybuffer',
        validateStatus: () => true,
      });
      assert.strictEqual(res.status, 206, `Expected status 206, got ${res.status}`);
      assert.strictEqual(res.headers['content-range'], `bytes 0-1023/${SEGMENT_SIZE}`);
      assert.strictEqual(res.data.byteLength, 1024);
      assert.strictEqual(res.headers['content-type'], 'video/MP2T');
      assert.strictEqual(res.headers['access-control-allow-origin'], '*');
      assert.strictEqual(res.data[0], 0x47, 'Sync byte check');
      recordPass('1.1 Partial range bytes=0-1023 returns 206 and exact 1024 bytes');
    } catch (e) {
      recordFail('1.1 Partial range bytes=0-1023', e);
    }

    // 1.2 Open-ended range bytes=1000-
    try {
      const res = await axios.get(`${proxyBase}/hls/segment.ts?url=${b64Seg}`, {
        headers: { Range: 'bytes=1000-' },
        responseType: 'arraybuffer',
        validateStatus: () => true,
      });
      assert.strictEqual(res.status, 206, `Expected status 206, got ${res.status}`);
      assert.strictEqual(res.headers['content-range'], `bytes 1000-${SEGMENT_SIZE - 1}/${SEGMENT_SIZE}`);
      assert.strictEqual(res.data.byteLength, SEGMENT_SIZE - 1000);
      recordPass('1.2 Open-ended range bytes=1000- returns 206 and remaining payload');
    } catch (e) {
      recordFail('1.2 Open-ended range bytes=1000-', e);
    }

    // 1.3 Suffix range bytes=-500 (last 500 bytes)
    try {
      const res = await axios.get(`${proxyBase}/hls/segment.ts?url=${b64Seg}`, {
        headers: { Range: 'bytes=-500' },
        responseType: 'arraybuffer',
        validateStatus: () => true,
      });
      assert.strictEqual(res.status, 206, `Expected status 206, got ${res.status}`);
      assert.strictEqual(res.headers['content-range'], `bytes ${SEGMENT_SIZE - 500}-${SEGMENT_SIZE - 1}/${SEGMENT_SIZE}`);
      assert.strictEqual(res.data.byteLength, 500);
      recordPass('1.3 Suffix range bytes=-500 returns 206 and last 500 bytes');
    } catch (e) {
      recordFail('1.3 Suffix range bytes=-500', e);
    }

    // 1.4 Single byte range bytes=0-0
    try {
      const res = await axios.get(`${proxyBase}/hls/segment.ts?url=${b64Seg}`, {
        headers: { Range: 'bytes=0-0' },
        responseType: 'arraybuffer',
        validateStatus: () => true,
      });
      assert.strictEqual(res.status, 206, `Expected status 206, got ${res.status}`);
      assert.strictEqual(res.headers['content-range'], `bytes 0-0/${SEGMENT_SIZE}`);
      assert.strictEqual(res.data.byteLength, 1);
      assert.strictEqual(res.data[0], 0x47);
      recordPass('1.4 Single-byte range bytes=0-0 returns 206 and 1 byte');
    } catch (e) {
      recordFail('1.4 Single-byte range bytes=0-0', e);
    }

    // 1.5 Multi-range bytes=0-99, 200-299
    try {
      const res = await axios.get(`${proxyBase}/hls/segment.ts?url=${b64Seg}`, {
        headers: { Range: 'bytes=0-99, 200-299' },
        responseType: 'arraybuffer',
        validateStatus: () => true,
      });
      assert.strictEqual(res.status, 206, `Expected status 206, got ${res.status}`);
      assert.ok(res.data.byteLength > 0, 'Should return multipart payload');
      recordPass('1.5 Multi-range bytes=0-99, 200-299 passes through without hang or error');
    } catch (e) {
      recordFail('1.5 Multi-range bytes=0-99, 200-299', e);
    }

    // 1.6 Out-of-bounds range bytes=500000-600000
    try {
      const res = await axios.get(`${proxyBase}/hls/segment.ts?url=${b64Seg}`, {
        headers: { Range: 'bytes=500000-600000' },
        validateStatus: () => true,
      });
      assert.ok(res.status === 416 || res.status === 502, `Expected status 416 or 502, got ${res.status}`);
      recordPass(`1.6 Out-of-bounds range handled gracefully with status ${res.status}`);
    } catch (e) {
      recordFail('1.6 Out-of-bounds range', e);
    }

    // 1.7 Endpoint aliases /hls/ts and /hls/segment with Range
    try {
      const resTs = await axios.get(`${proxyBase}/hls/ts?url=${b64Seg}`, {
        headers: { Range: 'bytes=0-511' },
        responseType: 'arraybuffer',
        validateStatus: () => true,
      });
      assert.strictEqual(resTs.status, 206);
      assert.strictEqual(resTs.data.byteLength, 512);

      const resSegment = await axios.get(`${proxyBase}/hls/segment?url=${b64Seg}`, {
        headers: { Range: 'bytes=0-511' },
        responseType: 'arraybuffer',
        validateStatus: () => true,
      });
      assert.strictEqual(resSegment.status, 206);
      assert.strictEqual(resSegment.data.byteLength, 512);
      recordPass('1.7 Endpoint aliases /hls/ts and /hls/segment support HTTP Range identically');
    } catch (e) {
      recordFail('1.7 Endpoint aliases Range support', e);
    }

    // ══════════════════════════════════════════════════════════════
    // SUITE 2: Corrupted, Invalid, and Empty Parameter Stress
    // ══════════════════════════════════════════════════════════════
    console.log('\n-------------------------------------------------------------');
    console.log('SUITE 2: Corrupted, Invalid, and Empty Parameters');
    console.log('-------------------------------------------------------------');

    const endpoints = [
      { name: 'manifest.m3u8', path: '/hls/manifest.m3u8' },
      { name: 'segment.ts', path: '/hls/segment.ts' },
      { name: 'key', path: '/hls/key' },
    ];

    // 2.1 Missing URL parameter entirely
    for (const ep of endpoints) {
      try {
        const res = await axios.get(`${proxyBase}${ep.path}`, { validateStatus: () => true });
        assert.strictEqual(res.status, 400, `Expected 400 on ${ep.name} missing URL, got ${res.status}`);
        recordPass(`2.1 Missing URL on ${ep.name} returns HTTP 400 Bad Request`);
      } catch (e) {
        recordFail(`2.1 Missing URL on ${ep.name}`, e);
      }
    }

    // 2.2 Empty URL parameter (?url= or ?url=   )
    for (const ep of endpoints) {
      try {
        const res1 = await axios.get(`${proxyBase}${ep.path}?url=`, { validateStatus: () => true });
        assert.strictEqual(res1.status, 400, `Expected 400 on ${ep.name}?url=, got ${res1.status}`);

        const res2 = await axios.get(`${proxyBase}${ep.path}?url=%20%20%20`, { validateStatus: () => true });
        assert.strictEqual(res2.status, 400, `Expected 400 on ${ep.name}?url=whitespace, got ${res2.status}`);

        const res3 = await axios.get(`${proxyBase}${ep.path}?b64=`, { validateStatus: () => true });
        assert.strictEqual(res3.status, 400, `Expected 400 on ${ep.name}?b64=, got ${res3.status}`);

        recordPass(`2.2 Empty / whitespace URL on ${ep.name} returns HTTP 400 Bad Request`);
      } catch (e) {
        recordFail(`2.2 Empty URL on ${ep.name}`, e);
      }
    }

    // 2.3 Invalid Plain URLs (?url=not-a-url, ?url=ftp://bad, ?url=http://127.0.0.1:59999/unreachable)
    for (const ep of endpoints) {
      try {
        const res1 = await axios.get(`${proxyBase}${ep.path}?url=not-a-valid-url`, { validateStatus: () => true });
        assert.strictEqual(res1.status, 502, `Expected 502 on invalid URL on ${ep.name}, got ${res1.status}`);

        // Connection refused on closed local port (instant ECONNREFUSED)
        const res2 = await axios.get(`${proxyBase}${ep.path}?url=http://127.0.0.1:59999/stream`, {
          validateStatus: () => true,
        });
        assert.strictEqual(res2.status, 502, `Expected 502 on unreachable host on ${ep.name}, got ${res2.status}`);

        recordPass(`2.3 Invalid plain URLs on ${ep.name} return HTTP 502 gracefully`);
      } catch (e) {
        recordFail(`2.3 Invalid plain URLs on ${ep.name}`, e);
      }
    }

    // 2.4 Corrupted / Invalid Base64URL strings
    const corruptedB64s = [
      '%%%invalid_base64url%%%',
      'YWJj',                  // decodes to "abc" (not http URL)
      'SGVsZG8gV29ybGQhIQ==', // decodes to "Hello World!!" (not http URL)
      '--___--',               // invalid base64 chars
    ];

    for (const ep of endpoints) {
      for (const b64 of corruptedB64s) {
        try {
          const res = await axios.get(`${proxyBase}${ep.path}?url=${encodeURIComponent(b64)}`, {
            validateStatus: () => true,
          });
          assert.strictEqual(res.status, 502, `Expected 502 for corrupted b64 "${b64}" on ${ep.name}, got ${res.status}`);
        } catch (e) {
          recordFail(`2.4 Corrupted b64 "${b64}" on ${ep.name}`, e);
        }
      }
      recordPass(`2.4 Corrupted Base64 strings on ${ep.name} return HTTP 502 without crash`);
    }

    // 2.5 Plain unencoded URL parameter support
    try {
      const manifestUrl = `${cdnBase}/cdn/master.m3u8`;
      const resM = await axios.get(`${proxyBase}/hls/manifest.m3u8?url=${encodeURIComponent(manifestUrl)}`, { validateStatus: () => true });
      assert.strictEqual(resM.status, 200);
      assert.ok(resM.data.includes('#EXTM3U'));

      const segUrlPlain = `${cdnBase}/cdn/4k/seg_100.ts`;
      const resS = await axios.get(`${proxyBase}/hls/segment.ts?url=${encodeURIComponent(segUrlPlain)}`, {
        responseType: 'arraybuffer',
        validateStatus: () => true,
      });
      assert.strictEqual(resS.status, 200);
      assert.strictEqual(resS.data.byteLength, SEGMENT_SIZE);

      const keyUrlPlain = `${cdnBase}/cdn/4k/keys/key_100.key`;
      const resK = await axios.get(`${proxyBase}/hls/key?url=${encodeURIComponent(keyUrlPlain)}`, {
        responseType: 'arraybuffer',
        validateStatus: () => true,
      });
      assert.strictEqual(resK.status, 200);
      assert.strictEqual(resK.data.byteLength, 16);

      recordPass('2.5 Plain unencoded URLs correctly resolved across manifest, segment, and key');
    } catch (e) {
      recordFail('2.5 Plain unencoded URLs', e);
    }

    // 2.6 Standard Base64 with padding vs Base64URL
    try {
      const manifestUrl = `${cdnBase}/cdn/master.m3u8`;
      const b64Std = Buffer.from(manifestUrl).toString('base64');
      const b64Url = Buffer.from(manifestUrl).toString('base64url');

      const resStd = await axios.get(`${proxyBase}/hls/manifest.m3u8?url=${encodeURIComponent(b64Std)}`);
      assert.strictEqual(resStd.status, 200);

      const resUrl = await axios.get(`${proxyBase}/hls/manifest.m3u8?url=${encodeURIComponent(b64Url)}`);
      assert.strictEqual(resUrl.status, 200);

      recordPass('2.6 Both Standard Base64 (with padding) and Base64URL decoded correctly');
    } catch (e) {
      recordFail('2.6 Base64 vs Base64URL', e);
    }

    // 2.7 Malformed and corrupted `ref` parameter
    try {
      const manifestUrl = `${cdnBase}/cdn/master.m3u8`;
      const b64M = Buffer.from(manifestUrl).toString('base64url');

      const resGarbageRef = await axios.get(`${proxyBase}/hls/manifest.m3u8?url=${b64M}&ref=%%%garbage_ref%%%`);
      assert.strictEqual(resGarbageRef.status, 200);

      const resNakedRef = await axios.get(`${proxyBase}/hls/manifest.m3u8?url=${b64M}&ref=example.com`);
      assert.strictEqual(resNakedRef.status, 200);

      recordPass('2.7 Malformed and naked domain `ref` parameters handled gracefully without throwing');
    } catch (e) {
      recordFail('2.7 Malformed ref parameter', e);
    }

    // ══════════════════════════════════════════════════════════════
    // SUITE 3: OPTIONS CORS Preflight Requests
    // ══════════════════════════════════════════════════════════════
    console.log('\n-------------------------------------------------------------');
    console.log('SUITE 3: OPTIONS CORS Preflights');
    console.log('-------------------------------------------------------------');

    const corsEndpoints = [
      '/hls/manifest.m3u8',
      '/hls/m3u8',
      '/hls/segment.ts',
      '/hls/ts',
      '/hls/segment',
      '/hls/key',
      '/hls/key.key',
      '/hls/extract',
      '/hls/arbitrary-endpoint',
    ];

    for (const ep of corsEndpoints) {
      try {
        const res = await axios.options(`${proxyBase}${ep}`);
        assert.strictEqual(res.status, 204, `Expected 204 on OPTIONS ${ep}, got ${res.status}`);
        assert.strictEqual(res.headers['access-control-allow-origin'], '*', `CORS origin on ${ep}`);
        assert.strictEqual(res.headers['access-control-allow-headers'], '*', `CORS headers on ${ep}`);
        assert.ok(res.headers['access-control-allow-methods'].includes('GET'), `CORS methods on ${ep}`);
        assert.ok(res.headers['access-control-allow-methods'].includes('OPTIONS'), `CORS methods on ${ep}`);
        recordPass(`3.1 OPTIONS preflight on ${ep} returns 204 with full wildcard CORS headers`);
      } catch (e) {
        recordFail(`3.1 OPTIONS preflight on ${ep}`, e);
      }
    }

    // Check CORS headers on GET error responses (400, 502)
    try {
      const errRes400 = await axios.get(`${proxyBase}/hls/manifest.m3u8`, { validateStatus: () => true });
      assert.strictEqual(errRes400.status, 400);
      assert.strictEqual(errRes400.headers['access-control-allow-origin'], '*');

      const errRes502 = await axios.get(`${proxyBase}/hls/manifest.m3u8?url=not-a-valid-url`, { validateStatus: () => true });
      assert.strictEqual(errRes502.status, 502);
      assert.strictEqual(errRes502.headers['access-control-allow-origin'], '*');
      recordPass('3.2 CORS headers present on 400 and 502 error responses');
    } catch (e) {
      recordFail('3.2 CORS headers on error responses', e);
    }

    // ══════════════════════════════════════════════════════════════
    // SUITE 4: M3U8 Playlist Line-by-Line Rewriting Edge Cases
    // ══════════════════════════════════════════════════════════════
    console.log('\n-------------------------------------------------------------');
    console.log('SUITE 4: Full M3U8 Playlist Rewriting Capabilities');
    console.log('-------------------------------------------------------------');

    const masterUrl = `${cdnBase}/cdn/master.m3u8`;
    const b64Master = Buffer.from(masterUrl).toString('base64url');

    try {
      const res = await axios.get(`${proxyBase}/hls/manifest.m3u8?url=${b64Master}`);
      assert.strictEqual(res.status, 200);
      const lines = res.data.split('\n');

      assert.ok(res.headers['content-type'].includes('application/vnd.apple.mpegurl'));
      assert.ok(res.headers['cache-control'].includes('no-cache'));

      const audioLine = lines.find(l => l.startsWith('#EXT-X-MEDIA:TYPE=AUDIO'));
      assert.ok(audioLine, 'Audio rendition found');
      assert.ok(audioLine.includes(`URI="${proxyBase}/hls/manifest.m3u8?url=`), 'Audio URI rewritten to manifest.m3u8 proxy');

      const subsLine = lines.find(l => l.startsWith('#EXT-X-MEDIA:TYPE=SUBTITLES'));
      assert.ok(subsLine, 'Subtitles rendition found');
      assert.ok(subsLine.includes(`URI="${proxyBase}/hls/manifest.m3u8?url=`), 'Subtitles URI rewritten to manifest.m3u8 proxy');

      const v4kLine = lines.find(l => l.includes('4k/playlist.m3u8') || l.includes('4k%2Fplaylist.m3u8') || (l.includes('/hls/manifest.m3u8?url=') && !l.startsWith('#')));
      assert.ok(v4kLine, 'Variant line rewritten');
      assert.ok(v4kLine.startsWith(`${proxyBase}/hls/manifest.m3u8?url=`), 'Variant URI points to proxy');

      const iframeLine = lines.find(l => l.startsWith('#EXT-X-I-FRAME-STREAM-INF'));
      assert.ok(iframeLine, 'I-Frame line found');
      assert.ok(iframeLine.includes(`URI="${proxyBase}/hls/manifest.m3u8?url=`), 'I-Frame URI rewritten to manifest.m3u8 proxy');

      recordPass('4.1 Master Playlist variants, audio, subs, and I-Frames rewritten with correct proxy URLs');
    } catch (e) {
      recordFail('4.1 Master Playlist rewriting', e);
    }

    // Media Playlist Rewriting
    const variantUrl = `${cdnBase}/cdn/4k/playlist.m3u8`;
    const b64Variant = Buffer.from(variantUrl).toString('base64url');

    try {
      const res = await axios.get(`${proxyBase}/hls/manifest.m3u8?url=${b64Variant}`);
      assert.strictEqual(res.status, 200);
      const body = res.data;
      const lines = body.split('\n');

      const keyLine = lines.find(l => l.startsWith('#EXT-X-KEY'));
      assert.ok(keyLine, '#EXT-X-KEY line found');
      assert.ok(keyLine.includes(`URI="${proxyBase}/hls/key?url=`), '#EXT-X-KEY rewritten to /hls/key');

      const sessionKeyLine = lines.find(l => l.startsWith('#EXT-X-SESSION-KEY'));
      assert.ok(sessionKeyLine, '#EXT-X-SESSION-KEY line found');
      assert.ok(sessionKeyLine.includes(`URI="${proxyBase}/hls/key?url=`), '#EXT-X-SESSION-KEY rewritten to /hls/key');

      const mapLine = lines.find(l => l.startsWith('#EXT-X-MAP'));
      assert.ok(mapLine, '#EXT-X-MAP line found');
      assert.ok(mapLine.includes(`URI="${proxyBase}/hls/segment.ts?url=`), '#EXT-X-MAP rewritten to /hls/segment.ts');

      const partLine = lines.find(l => l.startsWith('#EXT-X-PART'));
      assert.ok(partLine, '#EXT-X-PART line found');
      assert.ok(partLine.includes(`URI="${proxyBase}/hls/segment.ts?url=`), '#EXT-X-PART rewritten to /hls/segment.ts');

      const hintLine = lines.find(l => l.startsWith('#EXT-X-PRELOAD-HINT'));
      assert.ok(hintLine, '#EXT-X-PRELOAD-HINT line found');
      assert.ok(hintLine.includes(`URI="${proxyBase}/hls/segment.ts?url=`), '#EXT-X-PRELOAD-HINT rewritten to /hls/segment.ts');

      const segLines = lines.filter(l => l.startsWith(`${proxyBase}/hls/segment.ts?url=`));
      assert.strictEqual(segLines.length, 3, `Expected 3 segment URIs rewritten, found ${segLines.length}`);

      // Verify relative key resolution with .. path: /cdn/keys/key_100.key?token=abc
      const keyUriMatch = keyLine.match(/URI="([^"]+)"/);
      assert.ok(keyUriMatch, 'Key URI found');
      const decodedKeyUrl = Buffer.from(new URL(keyUriMatch[1]).searchParams.get('url'), 'base64url').toString('utf8');
      assert.strictEqual(decodedKeyUrl, `${cdnBase}/cdn/keys/key_100.key?token=abc`, 'Relative path ../keys/ correctly resolved');

      recordPass('4.2 Media Playlist keys (including relative ../ paths), maps, parts, hints, and segments rewritten correctly');
    } catch (e) {
      recordFail('4.2 Media Playlist rewriting', e);
    }

    // ══════════════════════════════════════════════════════════════
    // SUITE 5: Upstream Failure & Concurrency Stress Test
    // ══════════════════════════════════════════════════════════════
    console.log('\n-------------------------------------------------------------');
    console.log('SUITE 5: Upstream Errors & High Concurrency');
    console.log('-------------------------------------------------------------');

    // Upstream 500, 403, 404
    const errUrls = [
      `${cdnBase}/cdn/error/500`,
      `${cdnBase}/cdn/error/403`,
      `${cdnBase}/cdn/error/404`,
    ];

    for (const url of errUrls) {
      const b64 = Buffer.from(url).toString('base64url');
      try {
        const resM = await axios.get(`${proxyBase}/hls/manifest.m3u8?url=${b64}`, { validateStatus: () => true });
        assert.strictEqual(resM.status, 502, `Manifest expected 502 for upstream error, got ${resM.status}`);

        const resS = await axios.get(`${proxyBase}/hls/segment.ts?url=${b64}`, { validateStatus: () => true });
        assert.strictEqual(resS.status, 502, `Segment expected 502 for upstream error, got ${resS.status}`);

        const resK = await axios.get(`${proxyBase}/hls/key?url=${b64}`, { validateStatus: () => true });
        assert.strictEqual(resK.status, 502, `Key expected 502 for upstream error, got ${resK.status}`);
      } catch (e) {
        recordFail(`5.1 Upstream error handling for ${url}`, e);
      }
    }
    recordPass('5.1 Upstream HTTP 500, 403, 404 errors properly mapped to HTTP 502 Bad Gateway');

    // High Concurrency (100 simultaneous requests)
    try {
      const promises = [];
      for (let i = 0; i < 50; i++) {
        promises.push(axios.get(`${proxyBase}/hls/manifest.m3u8?url=${b64Variant}`));
        promises.push(axios.get(`${proxyBase}/hls/segment.ts?url=${b64Seg}`, {
          headers: { Range: `bytes=${(i * 100) % 5000}-${(i * 100) % 5000 + 500}` },
          responseType: 'arraybuffer',
        }));
      }

      const results = await Promise.all(promises);
      assert.strictEqual(results.length, 100);
      for (let i = 0; i < 100; i += 2) {
        assert.strictEqual(results[i].status, 200);
        assert.strictEqual(results[i + 1].status, 206);
      }
      recordPass('5.2 100 concurrent requests across manifest and range segments processed flawlessly');
    } catch (e) {
      recordFail('5.2 High Concurrency stress test', e);
    }

  } finally {
    cdnServer.close();
    proxyServer.close();
  }

  console.log('\n═══════════════════════════════════════════════════════════════');
  console.log(`  TEST RESULTS: Total: ${totalTests} | Passed: ${passedTests} | Failed: ${failedTests}`);
  console.log('═══════════════════════════════════════════════════════════════\n');

  if (failedTests > 0) {
    console.error('FAILURES SUMMARY:');
    failures.forEach((f, idx) => {
      console.error(`  ${idx + 1}. ${f.title}: ${f.error}`);
    });
    process.exit(1);
  } else {
    console.log('🎉 ALL EMPIRICAL CHALLENGER TESTS PASSED WITH 100% SUCCESS!\n');
    process.exit(0);
  }
}

runSuite().catch(err => {
  console.error('Unhandled test suite error:', err);
  process.exit(1);
});
