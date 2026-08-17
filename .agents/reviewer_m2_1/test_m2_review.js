'use strict';

/**
 * ============================================================
 *  Reviewer 1 Comprehensive M2 Validation Test Harness
 *  Validates all aspects of Requirement R2 (HLS Proxy Anti-403)
 * ============================================================
 */

const express = require('express');
const axios = require('axios');
const http = require('http');
const assert = require('assert');

const hlsRouter = require('../../src/routes/hls');

async function main() {
  console.log('=== Starting Reviewer 1 M2 Validation ===\n');

  let passed = 0;
  let failed = 0;

  function test(desc, fn) {
    try {
      fn();
      console.log(`  ✅ PASS: ${desc}`);
      passed++;
    } catch (e) {
      console.error(`  ❌ FAIL: ${desc}`);
      console.error(`     ${e.message}`);
      failed++;
    }
  }

  async function asyncTest(desc, fn) {
    try {
      await fn();
      console.log(`  ✅ PASS: ${desc}`);
      passed++;
    } catch (e) {
      console.error(`  ❌ FAIL: ${desc}`);
      console.error(`     ${e.message}`);
      failed++;
    }
  }

  // ─────────────────────────────────────────────────────────────
  // 1. Mock Server Setup for Intercepting & Validating Requests
  // ─────────────────────────────────────────────────────────────
  let lastUpstreamRequest = null;
  const mockUpstream = http.createServer((req, res) => {
    lastUpstreamRequest = {
      url: req.url,
      method: req.method,
      headers: req.headers,
    };

    if (req.url.endsWith('/master.m3u8')) {
      const masterContent = `#EXTM3U
#EXT-X-VERSION:3
#EXT-X-MEDIA:TYPE=AUDIO,GROUP-ID="audio",NAME="Vietnamese",DEFAULT=YES,AUTOSELECT=YES,URI="audio/vi.m3u8"
#EXT-X-STREAM-INF:BANDWIDTH=2149280,RESOLUTION=1280x720,AUDIO="audio"
720p/playlist.m3u8
#EXT-X-STREAM-INF:BANDWIDTH=5000000,RESOLUTION=1920x1080,AUDIO="audio"
https://cdn.kkphimplayer.com/hls/1080p/playlist.m3u8
`;
      res.writeHead(200, { 'Content-Type': 'application/vnd.apple.mpegurl' });
      res.end(masterContent);
      return;
    }

    if (req.url.endsWith('/playlist.m3u8')) {
      const mediaContent = `#EXTM3U
#EXT-X-VERSION:3
#EXT-X-TARGETDURATION:10
#EXT-X-KEY:METHOD=AES-128,URI="enc.key",IV=0x0123456789abcdef0123456789abcdef
#EXT-X-MAP:URI="init.mp4"
#EXTINF:9.000,
segment001.ts?token=xyz123
#EXTINF:9.000,
https://cdn.kkphimplayer.com/hls/720p/segment002.ts
#EXT-X-PRELOAD-HINT:TYPE=PART,URI="part001.mp4"
#EXT-X-PART:DURATION=1.000,URI="part002.mp4"
#EXT-X-ENDLIST
`;
      res.writeHead(200, { 'Content-Type': 'application/vnd.apple.mpegurl' });
      res.end(mediaContent);
      return;
    }

    if (req.url.endsWith('enc.key')) {
      res.writeHead(200, { 'Content-Type': 'application/octet-stream' });
      res.end(Buffer.from([0x00, 0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07, 0x08, 0x09, 0x0a, 0x0b, 0x0c, 0x0d, 0x0e, 0x0f]));
      return;
    }

    if (req.url.includes('.ts') || req.url.includes('.mp4')) {
      // Check Anti-403 simulation: If referer is missing or wrong, return 403 Forbidden
      const referer = req.headers['referer'];
      if (!referer || (!referer.includes('phimapi.com') && !referer.includes('nguonc.com') && !referer.includes('vsmov.com') && !referer.includes('streamc.online') && !referer.includes('custom-ref.com'))) {
        res.writeHead(403, { 'Content-Type': 'text/plain' });
        res.end('403 Forbidden - Hotlink Protection Active');
        return;
      }
      res.writeHead(200, {
        'Content-Type': 'video/mp2t',
        'Content-Length': '1024',
      });
      res.end(Buffer.alloc(1024, 0x47)); // TS sync byte 0x47
      return;
    }

    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('Not Found');
  });

  const MOCK_PORT = 7891;
  await new Promise((resolve) => mockUpstream.listen(MOCK_PORT, '127.0.0.1', resolve));

  // ─────────────────────────────────────────────────────────────
  // 2. Local Express App Mounting HLS Router
  // ─────────────────────────────────────────────────────────────
  const app = express();
  app.use('/hls', hlsRouter);
  const APP_PORT = 7892;
  const appServer = http.createServer(app);
  await new Promise((resolve) => appServer.listen(APP_PORT, '127.0.0.1', resolve));

  const proxyBase = `http://127.0.0.1:${APP_PORT}`;
  const upstreamBase = `http://127.0.0.1:${MOCK_PORT}`;

  try {
    // ═════════════════════════════════════════════════════════════
    // TEST GROUP 1: Anti-403 Headers Verification (R2 §1)
    // ═════════════════════════════════════════════════════════════
    console.log('\n--- Test Group 1: Upstream Anti-403 Headers ---');

    await asyncTest('Manifest request propagates Chrome 126 Mac User-Agent', async () => {
      const manifestUrl = `${proxyBase}/hls/manifest.m3u8?url=${Buffer.from(`${upstreamBase}/master.m3u8`).toString('base64url')}&ref=${Buffer.from('https://player.phimapi.com/').toString('base64url')}`;
      const res = await axios.get(manifestUrl);
      assert.strictEqual(res.status, 200);
      assert(lastUpstreamRequest !== null);
      assert.strictEqual(
        lastUpstreamRequest.headers['user-agent'],
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
        'User-Agent must match Chrome 126 Mac'
      );
    });

    await asyncTest('Manifest request propagates Referer: https://player.phimapi.com/ and Origin: https://player.phimapi.com', async () => {
      const manifestUrl = `${proxyBase}/hls/manifest.m3u8?url=${Buffer.from(`${upstreamBase}/master.m3u8`).toString('base64url')}&ref=${Buffer.from('https://player.phimapi.com/').toString('base64url')}`;
      const res = await axios.get(manifestUrl);
      assert.strictEqual(res.status, 200);
      assert.strictEqual(lastUpstreamRequest.headers['referer'], 'https://player.phimapi.com/');
      assert.strictEqual(lastUpstreamRequest.headers['origin'], 'https://player.phimapi.com');
    });

    await asyncTest('Segment request propagates Referer and Origin for KKPhim', async () => {
      const segUrl = `${proxyBase}/hls/ts?url=${Buffer.from(`${upstreamBase}/segment001.ts`).toString('base64url')}&ref=${Buffer.from('https://player.phimapi.com/').toString('base64url')}`;
      const res = await axios.get(segUrl);
      assert.strictEqual(res.status, 200);
      assert.strictEqual(lastUpstreamRequest.headers['referer'], 'https://player.phimapi.com/');
      assert.strictEqual(lastUpstreamRequest.headers['origin'], 'https://player.phimapi.com');
      assert.strictEqual(
        lastUpstreamRequest.headers['user-agent'],
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36'
      );
    });

    await asyncTest('Dynamic custom referer propagation without schema prefix', async () => {
      const segUrl = `${proxyBase}/hls/ts?url=${Buffer.from(`${upstreamBase}/segment001.ts`).toString('base64url')}&ref=${Buffer.from('custom-ref.com/player').toString('base64url')}`;
      const res = await axios.get(segUrl);
      assert.strictEqual(res.status, 200);
      assert.strictEqual(lastUpstreamRequest.headers['referer'], 'https://custom-ref.com/player');
      assert.strictEqual(lastUpstreamRequest.headers['origin'], 'https://custom-ref.com');
    });

    await asyncTest('Pattern matching fallback: kkphimplayer domain without explicit ref param', async () => {
      const segUrl = `${proxyBase}/hls/ts?url=${Buffer.from('http://127.0.0.1:' + MOCK_PORT + '/cdn.kkphimplayer.com/segment001.ts').toString('base64url')}`;
      const res = await axios.get(segUrl);
      assert.strictEqual(res.status, 200);
      assert.strictEqual(lastUpstreamRequest.headers['referer'], 'https://player.phimapi.com/');
      assert.strictEqual(lastUpstreamRequest.headers['origin'], 'https://player.phimapi.com');
    });

    await asyncTest('Pattern matching fallback: nguonc.com domain without explicit ref param', async () => {
      const segUrl = `${proxyBase}/hls/ts?url=${Buffer.from('http://127.0.0.1:' + MOCK_PORT + '/phim.nguonc.com/segment001.ts').toString('base64url')}`;
      const res = await axios.get(segUrl);
      assert.strictEqual(res.status, 200);
      assert.strictEqual(lastUpstreamRequest.headers['referer'], 'https://phim.nguonc.com/');
      assert.strictEqual(lastUpstreamRequest.headers['origin'], 'https://phim.nguonc.com');
    });

    // ═════════════════════════════════════════════════════════════
    // TEST GROUP 2: Playlist Rewriting Logic (R2 §2)
    // ═════════════════════════════════════════════════════════════
    console.log('\n--- Test Group 2: Playlist Rewriting Logic ---');

    await asyncTest('Master Playlist: Rewrites #EXT-X-STREAM-INF relative sub-playlists to /hls/manifest.m3u8', async () => {
      const masterUrl = `${proxyBase}/hls/manifest.m3u8?url=${Buffer.from(`${upstreamBase}/master.m3u8`).toString('base64url')}&ref=${Buffer.from('https://player.phimapi.com/').toString('base64url')}`;
      const res = await axios.get(masterUrl);
      assert.strictEqual(res.status, 200);
      const lines = res.data.split('\n');
      const streamInfIndex = lines.findIndex((l) => l.startsWith('#EXT-X-STREAM-INF:BANDWIDTH=2149280'));
      assert(streamInfIndex !== -1, 'Must contain first EXT-X-STREAM-INF');
      const rewrittenSub = lines[streamInfIndex + 1];
      assert(rewrittenSub.startsWith('http://127.0.0.1:7892/hls/manifest.m3u8?url='), `Expected proxy URL, got ${rewrittenSub}`);
      
      // Decode the URL inside the rewritten parameter
      const u = new URL(rewrittenSub);
      const decodedTarget = Buffer.from(u.searchParams.get('url'), 'base64url').toString('utf8');
      assert.strictEqual(decodedTarget, `${upstreamBase}/720p/playlist.m3u8`, 'Relative subplaylist resolved against baseUrl');
    });

    await asyncTest('Master Playlist: Rewrites #EXT-X-STREAM-INF absolute sub-playlists to /hls/manifest.m3u8', async () => {
      const masterUrl = `${proxyBase}/hls/manifest.m3u8?url=${Buffer.from(`${upstreamBase}/master.m3u8`).toString('base64url')}&ref=${Buffer.from('https://player.phimapi.com/').toString('base64url')}`;
      const res = await axios.get(masterUrl);
      const lines = res.data.split('\n');
      const streamInfIndex = lines.findIndex((l) => l.startsWith('#EXT-X-STREAM-INF:BANDWIDTH=5000000'));
      const rewrittenSub = lines[streamInfIndex + 1];
      assert(rewrittenSub.startsWith('http://127.0.0.1:7892/hls/manifest.m3u8?url='), `Expected proxy URL, got ${rewrittenSub}`);
      const u = new URL(rewrittenSub);
      const decodedTarget = Buffer.from(u.searchParams.get('url'), 'base64url').toString('utf8');
      assert.strictEqual(decodedTarget, 'https://cdn.kkphimplayer.com/hls/1080p/playlist.m3u8');
    });

    await asyncTest('Master Playlist: Rewrites #EXT-X-MEDIA URI attribute to /hls/manifest.m3u8', async () => {
      const masterUrl = `${proxyBase}/hls/manifest.m3u8?url=${Buffer.from(`${upstreamBase}/master.m3u8`).toString('base64url')}&ref=${Buffer.from('https://player.phimapi.com/').toString('base64url')}`;
      const res = await axios.get(masterUrl);
      const mediaLine = res.data.split('\n').find((l) => l.startsWith('#EXT-X-MEDIA:TYPE=AUDIO'));
      assert(mediaLine !== undefined);
      assert(mediaLine.includes('URI="http://127.0.0.1:7892/hls/manifest.m3u8?url='), `Media line rewritten with proxy: ${mediaLine}`);
    });

    await asyncTest('Media Playlist: Rewrites relative and absolute TS segments to /hls/ts', async () => {
      const mediaUrl = `${proxyBase}/hls/manifest.m3u8?url=${Buffer.from(`${upstreamBase}/playlist.m3u8`).toString('base64url')}&ref=${Buffer.from('https://player.phimapi.com/').toString('base64url')}`;
      const res = await axios.get(mediaUrl);
      assert.strictEqual(res.status, 200);
      const lines = res.data.split('\n');
      
      // Segment 1 (relative)
      const extinf1 = lines.findIndex((l) => l.startsWith('#EXTINF:9.000,'));
      const seg1 = lines[extinf1 + 1];
      assert(seg1.startsWith('http://127.0.0.1:7892/hls/ts?url='), `Segment 1 must route through /hls/ts: ${seg1}`);
      const u1 = new URL(seg1);
      const decoded1 = Buffer.from(u1.searchParams.get('url'), 'base64url').toString('utf8');
      assert.strictEqual(decoded1, `${upstreamBase}/segment001.ts?token=xyz123`);

      // Segment 2 (absolute)
      const seg2 = lines[extinf1 + 3];
      assert(seg2.startsWith('http://127.0.0.1:7892/hls/ts?url='), `Segment 2 must route through /hls/ts: ${seg2}`);
      const u2 = new URL(seg2);
      const decoded2 = Buffer.from(u2.searchParams.get('url'), 'base64url').toString('utf8');
      assert.strictEqual(decoded2, 'https://cdn.kkphimplayer.com/hls/720p/segment002.ts');
    });

    await asyncTest('Media Playlist: Rewrites #EXT-X-KEY with is_key=1 flag', async () => {
      const mediaUrl = `${proxyBase}/hls/manifest.m3u8?url=${Buffer.from(`${upstreamBase}/playlist.m3u8`).toString('base64url')}&ref=${Buffer.from('https://player.phimapi.com/').toString('base64url')}`;
      const res = await axios.get(mediaUrl);
      const keyLine = res.data.split('\n').find((l) => l.startsWith('#EXT-X-KEY'));
      assert(keyLine !== undefined);
      assert(keyLine.includes('is_key=1'), `Key line must contain is_key=1 flag: ${keyLine}`);
      assert(keyLine.includes('URI="http://127.0.0.1:7892/hls/ts?url='), `Key line URI rewritten: ${keyLine}`);
    });

    await asyncTest('Media Playlist: Rewrites #EXT-X-MAP, #EXT-X-PRELOAD-HINT, #EXT-X-PART', async () => {
      const mediaUrl = `${proxyBase}/hls/manifest.m3u8?url=${Buffer.from(`${upstreamBase}/playlist.m3u8`).toString('base64url')}&ref=${Buffer.from('https://player.phimapi.com/').toString('base64url')}`;
      const res = await axios.get(mediaUrl);
      const mapLine = res.data.split('\n').find((l) => l.startsWith('#EXT-X-MAP'));
      assert(mapLine && mapLine.includes('URI="http://127.0.0.1:7892/hls/ts?url='), `Map line rewritten: ${mapLine}`);

      const hintLine = res.data.split('\n').find((l) => l.startsWith('#EXT-X-PRELOAD-HINT'));
      assert(hintLine && hintLine.includes('URI="http://127.0.0.1:7892/hls/ts?url='), `Hint line rewritten: ${hintLine}`);

      const partLine = res.data.split('\n').find((l) => l.startsWith('#EXT-X-PART'));
      assert(partLine && partLine.includes('URI="http://127.0.0.1:7892/hls/ts?url='), `Part line rewritten: ${partLine}`);
    });

    // ═════════════════════════════════════════════════════════════
    // TEST GROUP 3: CORS & MIME Types Enforcement (R2 §3)
    // ═════════════════════════════════════════════════════════════
    console.log('\n--- Test Group 3: CORS & MIME Types Enforcement ---');

    await asyncTest('OPTIONS preflight returns 204 with CORS headers', async () => {
      const res = await axios.options(`${proxyBase}/hls/manifest.m3u8`);
      assert.strictEqual(res.status, 204);
      assert.strictEqual(res.headers['access-control-allow-origin'], '*');
      assert.strictEqual(res.headers['access-control-allow-headers'], '*');
      assert.strictEqual(res.headers['access-control-allow-methods'], 'GET, HEAD, OPTIONS');
    });

    await asyncTest('Manifest response sets Content-Type: application/vnd.apple.mpegurl; charset=utf-8', async () => {
      const manifestUrl = `${proxyBase}/hls/manifest.m3u8?url=${Buffer.from(`${upstreamBase}/master.m3u8`).toString('base64url')}&ref=${Buffer.from('https://player.phimapi.com/').toString('base64url')}`;
      const res = await axios.get(manifestUrl);
      assert.strictEqual(res.headers['content-type'], 'application/vnd.apple.mpegurl; charset=utf-8');
      assert.strictEqual(res.headers['access-control-allow-origin'], '*');
    });

    await asyncTest('TS Segment response sets Content-Type: video/mp2t', async () => {
      const segUrl = `${proxyBase}/hls/ts?url=${Buffer.from(`${upstreamBase}/segment001.ts`).toString('base64url')}&ref=${Buffer.from('https://player.phimapi.com/').toString('base64url')}`;
      const res = await axios.get(segUrl, { responseType: 'arraybuffer' });
      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.headers['content-type'], 'video/mp2t');
      assert.strictEqual(res.headers['access-control-allow-origin'], '*');
      assert.strictEqual(res.data.length, 1024);
      assert.strictEqual(res.data[0], 0x47, 'Valid MPEG-TS sync byte');
    });

    await asyncTest('DRM Key response with is_key=1 sets Content-Type: application/octet-stream', async () => {
      const keyUrl = `${proxyBase}/hls/ts?url=${Buffer.from(`${upstreamBase}/enc.key`).toString('base64url')}&ref=${Buffer.from('https://player.phimapi.com/').toString('base64url')}&is_key=1`;
      const res = await axios.get(keyUrl, { responseType: 'arraybuffer' });
      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.headers['content-type'], 'application/octet-stream');
      assert.strictEqual(res.headers['access-control-allow-origin'], '*');
      assert.strictEqual(res.data.length, 16);
    });

    // ═════════════════════════════════════════════════════════════
    // TEST GROUP 4: Edge Cases & Adversarial Stress Tests
    // ═════════════════════════════════════════════════════════════
    console.log('\n--- Test Group 4: Edge Cases & Adversarial Tests ---');

    await asyncTest('Manifest with missing url param returns 400 Bad Request', async () => {
      try {
        await axios.get(`${proxyBase}/hls/manifest.m3u8`);
        assert.fail('Should have returned 400');
      } catch (err) {
        assert.strictEqual(err.response.status, 400);
        assert.strictEqual(err.response.headers['access-control-allow-origin'], '*');
      }
    });

    await asyncTest('Segment with missing url param returns 400 Bad Request', async () => {
      try {
        await axios.get(`${proxyBase}/hls/ts`);
        assert.fail('Should have returned 400');
      } catch (err) {
        assert.strictEqual(err.response.status, 400);
        assert.strictEqual(err.response.headers['access-control-allow-origin'], '*');
      }
    });

    await asyncTest('Standard Base64 (with +, /) and Base64URL (with -, _) decoding support', async () => {
      const standardB64 = Buffer.from(`${upstreamBase}/segment001.ts`).toString('base64');
      const segUrl = `${proxyBase}/hls/ts?url=${encodeURIComponent(standardB64)}&ref=${Buffer.from('https://player.phimapi.com/').toString('base64')}`;
      const res = await axios.get(segUrl);
      assert.strictEqual(res.status, 200);
    });

    await asyncTest('Raw URL parameter support (without base64 encoding)', async () => {
      const rawUrl = `${upstreamBase}/segment001.ts`;
      const segUrl = `${proxyBase}/hls/ts?url=${encodeURIComponent(rawUrl)}&ref=https://player.phimapi.com/`;
      const res = await axios.get(segUrl);
      assert.strictEqual(res.status, 200);
    });

    await asyncTest('Aliases route /hls/m3u8 supported', async () => {
      const manifestUrl = `${proxyBase}/hls/m3u8?url=${Buffer.from(`${upstreamBase}/master.m3u8`).toString('base64url')}&ref=${Buffer.from('https://player.phimapi.com/').toString('base64url')}`;
      const res = await axios.get(manifestUrl);
      assert.strictEqual(res.status, 200);
    });

    await asyncTest('Upstream 404 or connection failure returns 502 with CORS header', async () => {
      const brokenUrl = `${proxyBase}/hls/manifest.m3u8?url=${Buffer.from('http://127.0.0.1:9999/broken.m3u8').toString('base64url')}`;
      try {
        await axios.get(brokenUrl);
        assert.fail('Should have failed with 502');
      } catch (err) {
        assert.strictEqual(err.response.status, 502);
        assert.strictEqual(err.response.headers['access-control-allow-origin'], '*');
      }
    });

  } finally {
    await new Promise((resolve) => mockUpstream.close(resolve));
    await new Promise((resolve) => appServer.close(resolve));
  }

  console.log('\n=============================================');
  console.log(`Reviewer 1 Test Summary: ${passed} passed, ${failed} failed`);
  console.log('=============================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('Fatal test runner error:', err);
  process.exit(1);
});
