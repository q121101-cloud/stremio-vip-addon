'use strict';

/**
 * ============================================================================
 *  Empirical Challenger 2 — Deep Adversarial HLS Proxy & Rewriter Test Suite
 *  File: tests/challenger_m1_2_deep_hls.test.js
 * ============================================================================
 */

const http = require('http');
const express = require('express');
const axios = require('axios');
const crypto = require('crypto');
const hlsRouter = require('../src/routes/hls');

let mockServer;
let mockPort;
let mockBaseUrl;

let proxyServer;
let proxyPort;
let proxyBaseUrl;

// Recorded requests on mock upstream server
const recordedUpstreamRequests = [];

// Helper: decode Base64URL
function decodeBase64Url(str) {
  return Buffer.from(str, 'base64url').toString('utf8');
}

// Test runner statistics
let totalTests = 0;
let passedTests = 0;
let failedTests = 0;
const failureDetails = [];

function assert(condition, message) {
  totalTests++;
  if (!condition) {
    failedTests++;
    failureDetails.push(message);
    console.error(`  ❌ FAIL: ${message}`);
    throw new Error(message);
  } else {
    passedTests++;
    console.log(`  ✅ PASS: ${message}`);
  }
}

async function runTest(name, fn) {
  console.log(`\n▶ [TEST] ${name}`);
  await fn();
}

// Setup Mock Upstream Server & Proxy Server
async function setupServers() {
  // 1. Upstream Mock Server
  const mockApp = express();
  
  mockApp.use((req, res, next) => {
    recordedUpstreamRequests.push({
      path: req.path,
      method: req.method,
      headers: req.headers,
      query: req.query,
    });
    next();
  });

  // Mock Master Playlist with 4K (3840x2160), Audio, Subs, I-Frame
  mockApp.get('/streams/master_4k.m3u8', (req, res) => {
    res.setHeader('Content-Type', 'application/vnd.apple.mpegurl');
    res.send(`#EXTM3U
#EXT-X-VERSION:6
#EXT-X-INDEPENDENT-SEGMENTS

# Audio Renditions
#EXT-X-MEDIA:TYPE=AUDIO,GROUP-ID="audio-main",NAME="Tiếng Việt (Lồng Tiếng)",DEFAULT=YES,AUTOSELECT=YES,LANGUAGE="vie",URI="audio/vie_longtieng.m3u8"
#EXT-X-MEDIA:TYPE=AUDIO,GROUP-ID="audio-main",NAME="Tiếng Việt (Thuyết Minh)",DEFAULT=NO,AUTOSELECT=YES,LANGUAGE="vie",URI="https://upstream.cdn.example.com/audio/vie_thuyetminh.m3u8"
#EXT-X-MEDIA:TYPE=AUDIO,GROUP-ID="audio-main",NAME="English Original",DEFAULT=NO,AUTOSELECT=YES,LANGUAGE="eng",URI="audio/eng.m3u8"

# Subtitle Renditions
#EXT-X-MEDIA:TYPE=SUBTITLES,GROUP-ID="subs",NAME="Vietnamese",DEFAULT=YES,AUTOSELECT=YES,LANGUAGE="vie",URI="subs/vie.m3u8"
#EXT-X-MEDIA:TYPE=SUBTITLES,GROUP-ID="subs",NAME="English",DEFAULT=NO,AUTOSELECT=YES,LANGUAGE="eng",URI="https://upstream.cdn.example.com/subs/eng.m3u8"
#EXT-X-MEDIA:TYPE=CLOSED-CAPTIONS,GROUP-ID="cc",NAME="CC",INSTREAM-ID="CC1",DEFAULT=NO

# Video Variants (including 4K 3840x2160, 1080p, 720p, 480p, 360p)
#EXT-X-STREAM-INF:BANDWIDTH=18000000,AVERAGE-BANDWIDTH=15000000,RESOLUTION=3840x2160,FRAME-RATE=60.000,CODECS="avc1.640033,mp4a.40.2",AUDIO="audio-main",SUBTITLES="subs"
4k_2160p/index.m3u8
#EXT-X-STREAM-INF:BANDWIDTH=9000000,AVERAGE-BANDWIDTH=8000000,RESOLUTION=1920x1080,FRAME-RATE=60.000,CODECS="avc1.64002a,mp4a.40.2",AUDIO="audio-main",SUBTITLES="subs"
1080p/index.m3u8
#EXT-X-STREAM-INF:BANDWIDTH=4500000,RESOLUTION=1280x720,FRAME-RATE=30.000,CODECS="avc1.4d401f,mp4a.40.2",AUDIO="audio-main"
https://upstream.cdn.example.com/streams/720p/index.m3u8
#EXT-X-STREAM-INF:BANDWIDTH=2000000,RESOLUTION=854x480,FRAME-RATE=30.000,CODECS="avc1.4d401f,mp4a.40.2"
480p/index.m3u8?token=secure_abc123
#EXT-X-STREAM-INF:BANDWIDTH=800000,RESOLUTION=640x360
360p_variant

# I-Frame Stream
#EXT-X-I-FRAME-STREAM-INF:BANDWIDTH=1500000,RESOLUTION=3840x2160,URI="4k_2160p/iframe.m3u8"
`);
  });

  // Mock Media Playlist with AES-128 Key, EXT-X-MAP fMP4, Relative Paths, LL-HLS Part/Preload
  mockApp.get('/streams/media_encrypted_fmp4.m3u8', (req, res) => {
    res.setHeader('Content-Type', 'application/vnd.apple.mpegurl');
    res.send(`#EXTM3U
#EXT-X-VERSION:7
#EXT-X-TARGETDURATION:6
#EXT-X-MEDIA-SEQUENCE:1001

# Initialization segment for fMP4
#EXT-X-MAP:URI="init.mp4",BYTERANGE="716@0"

# Decryption Key with IV and unquoted/quoted attributes
#EXT-X-KEY:METHOD=AES-128,URI="keys/aes128.key",IV=0xa1b2c3d4e5f60718293a4b5c6d7e8f90
#EXT-X-SESSION-KEY:METHOD=AES-128,URI="https://upstream.cdn.example.com/keys/session.key"

# Segments with relative, parent, absolute paths & query parameters
#EXTINF:6.000,
segment_1001.ts
#EXTINF:6.000,
subfolder/segment_1002.ts
#EXTINF:6.000,
../parent_segment_1003.ts
#EXTINF:6.000,
/root_segment_1004.ts
#EXTINF:6.000,
https://upstream.cdn.example.com/segments/segment_1005.ts
#EXTINF:6.000,
segment_1006.ts?auth=secret_token&client=vip&timestamp=1723900000

# Key rotation
#EXT-X-KEY:METHOD=AES-128,URI="keys/aes128_part2.key",IV=0x00000000000000000000000000000002
#EXTINF:4.500,
segment_1007.mp4

# Low Latency HLS hints and parts
#EXT-X-PART:DURATION=1.000,URI="part_1008_1.ts",INDEPENDENT=YES
#EXT-X-PART:DURATION=1.000,URI="part_1008_2.ts"
#EXT-X-PRELOAD-HINT:TYPE=PART,URI="part_1008_3.ts"

#EXT-X-ENDLIST
`);
  });

  // Mock AES-128 Key endpoint (16 binary bytes)
  const mockAesKey = crypto.randomBytes(16);
  mockApp.get('/streams/keys/:keyName', (req, res) => {
    res.setHeader('Content-Type', 'application/octet-stream');
    res.setHeader('Content-Length', '16');
    res.send(mockAesKey);
  });

  // Mock Video TS Chunk endpoint (>500KB with 0x47 sync bytes every 188 bytes)
  const mockChunkSize = 256 * 1024; // 256KB
  const mockTsChunk = Buffer.alloc(mockChunkSize);
  for (let i = 0; i < mockChunkSize; i += 188) {
    mockTsChunk[i] = 0x47; // TS Sync byte
    mockTsChunk.fill(0xAA, i + 1, Math.min(i + 188, mockChunkSize));
  }

  mockApp.get([
    '/streams/4k_2160p/:segName',
    '/streams/subfolder/:segName',
    '/streams/:segName',
    '/parent_segment_1003.ts',
    '/root_segment_1004.ts',
    '/streams/segments/:segName'
  ], (req, res) => {
    const range = req.headers.range;
    res.setHeader('Content-Type', 'video/MP2T');
    res.setHeader('Accept-Ranges', 'bytes');

    if (range) {
      const match = range.match(/bytes=(\d+)-(\d*)/);
      if (match) {
        const start = parseInt(match[1], 10);
        const end = match[2] ? parseInt(match[2], 10) : mockChunkSize - 1;
        const chunk = mockTsChunk.subarray(start, end + 1);
        res.status(206);
        res.setHeader('Content-Range', `bytes ${start}-${end}/${mockChunkSize}`);
        res.setHeader('Content-Length', chunk.length);
        return res.send(chunk);
      }
    }

    res.setHeader('Content-Length', mockChunkSize);
    res.send(mockTsChunk);
  });

  // Start Mock Server
  await new Promise((resolve) => {
    mockServer = mockApp.listen(0, '127.0.0.1', () => {
      mockPort = mockServer.address().port;
      mockBaseUrl = `http://127.0.0.1:${mockPort}`;
      resolve();
    });
  });

  // 2. Proxy Server mounting src/routes/hls.js
  const proxyApp = express();
  proxyApp.use('/hls', hlsRouter);

  await new Promise((resolve) => {
    proxyServer = proxyApp.listen(0, '127.0.0.1', () => {
      proxyPort = proxyServer.address().port;
      proxyBaseUrl = `http://127.0.0.1:${proxyPort}`;
      resolve();
    });
  });

  return { mockAesKey, mockTsChunk };
}

async function tearDown() {
  if (mockServer) mockServer.close();
  if (proxyServer) proxyServer.close();
}

async function main() {
  console.log('╔══════════════════════════════════════════════════════════════════════════════╗');
  console.log('║     🧪 EMPIRICAL CHALLENGER 2: ADVERSARIAL HLS REWRITER & PROXY SUITE        ║');
  console.log('╚══════════════════════════════════════════════════════════════════════════════╝');

  const { mockAesKey, mockTsChunk } = await setupServers();
  console.log(`Mock Upstream Server: ${mockBaseUrl}`);
  console.log(`HLS Proxy Server:     ${proxyBaseUrl}`);

  // ──────────────────────────────────────────────────────────────────────────
  // TEST 1: Master Playlist with 4K (3840x2160), Audio, Subs, and I-Frame Inf
  // ──────────────────────────────────────────────────────────────────────────
  await runTest('Master Playlist Rewriting (4K 3840x2160, Audio Renditions, Subtitles, I-Frame)', async () => {
    const upstreamUrl = `${mockBaseUrl}/streams/master_4k.m3u8`;
    const b64Upstream = Buffer.from(upstreamUrl).toString('base64url');
    const customRef = 'https://player.phimapi.com/embed/test';
    const b64Ref = Buffer.from(customRef).toString('base64url');

    const res = await axios.get(`${proxyBaseUrl}/hls/manifest.m3u8?url=${b64Upstream}&ref=${b64Ref}`);

    assert(res.status === 200, 'Master playlist returns HTTP 200');
    assert(res.headers['content-type'].includes('application/vnd.apple.mpegurl'), 'Content-Type is apple mpegurl');
    assert(res.headers['access-control-allow-origin'] === '*', 'CORS Access-Control-Allow-Origin is *');
    assert(res.headers['cache-control'].includes('no-cache'), 'Cache-Control has no-cache');

    const body = res.data;
    const lines = body.split('\n');

    // 1. Check 4K Stream-Inf line and rewritten URI
    const has4kInf = lines.some((l) => l.includes('RESOLUTION=3840x2160'));
    assert(has4kInf, 'Contains 4K resolution tag (RESOLUTION=3840x2160)');

    // 2. Check Audio Renditions rewritten to /hls/manifest.m3u8
    const audioLines = lines.filter((l) => l.startsWith('#EXT-X-MEDIA:TYPE=AUDIO'));
    assert(audioLines.length === 3, 'Found exactly 3 audio rendition tags');

    for (const line of audioLines) {
      assert(line.includes(`URI="${proxyBaseUrl}/hls/manifest.m3u8?url=`), `Audio line rewrites URI to proxy manifest: ${line}`);
      const match = line.match(/url=([^&"]+)/);
      assert(match && match[1], 'Audio line contains valid url query param');
      const decodedTarget = decodeBase64Url(match[1]);
      assert(decodedTarget.startsWith('http'), `Decoded audio target is absolute URL: ${decodedTarget}`);
    }

    // 3. Check Subtitles rewritten to /hls/manifest.m3u8
    const subLines = lines.filter((l) => l.startsWith('#EXT-X-MEDIA:TYPE=SUBTITLES'));
    assert(subLines.length === 2, 'Found exactly 2 subtitle rendition tags');
    for (const line of subLines) {
      assert(line.includes(`URI="${proxyBaseUrl}/hls/manifest.m3u8?url=`), `Subtitle line rewrites URI to proxy manifest: ${line}`);
      const match = line.match(/url=([^&"]+)/);
      const decodedTarget = decodeBase64Url(match[1]);
      assert(decodedTarget.startsWith('http'), `Decoded subtitle target is absolute URL: ${decodedTarget}`);
    }

    // 4. Check CLOSED-CAPTIONS (no URI) preserved without corruption
    const ccLine = lines.find((l) => l.startsWith('#EXT-X-MEDIA:TYPE=CLOSED-CAPTIONS'));
    assert(ccLine && !ccLine.includes('URI='), 'CLOSED-CAPTIONS line without URI is preserved untouched');

    // 5. Check I-Frame Stream Inf rewritten inline
    const iframeLine = lines.find((l) => l.startsWith('#EXT-X-I-FRAME-STREAM-INF'));
    assert(iframeLine && iframeLine.includes(`URI="${proxyBaseUrl}/hls/manifest.m3u8?url=`), `I-Frame line rewrites URI to proxy manifest: ${iframeLine}`);

    // 6. Check all variant URI lines point to /hls/manifest.m3u8
    const variantUris = lines.filter((l) => !l.startsWith('#') && l.trim().length > 0);
    assert(variantUris.length === 5, `Expected 5 variant URI lines, found ${variantUris.length}`);
    for (const uri of variantUris) {
      assert(uri.startsWith(`${proxyBaseUrl}/hls/manifest.m3u8?url=`), `Variant URI points to /hls/manifest.m3u8: ${uri}`);
      const match = uri.match(/url=([^&]+)/);
      const decoded = decodeBase64Url(match[1]);
      assert(decoded.startsWith('http'), `Decoded variant target is absolute URL: ${decoded}`);
    }
  });

  // ──────────────────────────────────────────────────────────────────────────
  // TEST 2: Media Playlist with AES-128 Key, EXT-X-MAP, Relative URLs, LL-HLS
  // ──────────────────────────────────────────────────────────────────────────
  await runTest('Media Playlist Rewriting (AES-128 Keys, EXT-X-MAP, Relative Segments, LL-HLS)', async () => {
    const upstreamUrl = `${mockBaseUrl}/streams/media_encrypted_fmp4.m3u8`;
    const b64Upstream = Buffer.from(upstreamUrl).toString('base64url');

    const res = await axios.get(`${proxyBaseUrl}/hls/manifest.m3u8?url=${b64Upstream}`);
    assert(res.status === 200, 'Media playlist returns HTTP 200');

    const body = res.data;
    const lines = body.split('\n');

    // 1. EXT-X-MAP fMP4 Initialization Segment rewritten to /hls/segment.ts
    const mapLine = lines.find((l) => l.startsWith('#EXT-X-MAP'));
    assert(mapLine, 'Found #EXT-X-MAP line');
    assert(mapLine.includes(`URI="${proxyBaseUrl}/hls/segment.ts?url=`), `EXT-X-MAP rewrites URI to proxy segment: ${mapLine}`);
    assert(mapLine.includes('BYTERANGE="716@0"'), 'EXT-X-MAP preserves BYTERANGE attribute');
    const mapUrlMatch = mapLine.match(/url=([^&"]+)/);
    const decodedMap = decodeBase64Url(mapUrlMatch[1]);
    assert(decodedMap === `${mockBaseUrl}/streams/init.mp4`, `Decoded init segment URL is correct: ${decodedMap}`);

    // 2. EXT-X-KEY rewritten to /hls/key with preserved IV
    const keyLines = lines.filter((l) => l.startsWith('#EXT-X-KEY'));
    assert(keyLines.length === 2, 'Found 2 #EXT-X-KEY lines');
    assert(keyLines[0].includes(`URI="${proxyBaseUrl}/hls/key?url=`), `Key 1 rewrites URI to proxy key: ${keyLines[0]}`);
    assert(keyLines[0].includes('IV=0xa1b2c3d4e5f60718293a4b5c6d7e8f90'), 'Key 1 preserves IV attribute');
    assert(keyLines[0].includes('METHOD=AES-128'), 'Key 1 preserves METHOD=AES-128');

    // 3. EXT-X-SESSION-KEY rewritten to /hls/key
    const sessionKeyLine = lines.find((l) => l.startsWith('#EXT-X-SESSION-KEY'));
    assert(sessionKeyLine && sessionKeyLine.includes(`URI="${proxyBaseUrl}/hls/key?url=`), `Session key rewrites URI to proxy key: ${sessionKeyLine}`);

    // 4. Segment lines rewritten to /hls/segment.ts (checking relative resolution)
    const segLines = lines.filter((l) => !l.startsWith('#') && l.trim().length > 0);
    assert(segLines.length === 7, `Expected 7 segment lines, found ${segLines.length}`);
    
    // Check specific resolution of relative paths
    const decodedSegments = segLines.map((l) => {
      const match = l.match(/url=([^&]+)/);
      return decodeBase64Url(match[1]);
    });

    assert(decodedSegments[0] === `${mockBaseUrl}/streams/segment_1001.ts`, `Relative segment resolved: ${decodedSegments[0]}`);
    assert(decodedSegments[1] === `${mockBaseUrl}/streams/subfolder/segment_1002.ts`, `Subfolder segment resolved: ${decodedSegments[1]}`);
    assert(decodedSegments[2] === `${mockBaseUrl}/parent_segment_1003.ts`, `Parent segment resolved: ${decodedSegments[2]}`);
    assert(decodedSegments[3] === `${mockBaseUrl}/root_segment_1004.ts`, `Root segment resolved: ${decodedSegments[3]}`);
    assert(decodedSegments[4] === `https://upstream.cdn.example.com/segments/segment_1005.ts`, `Absolute segment preserved: ${decodedSegments[4]}`);
    assert(decodedSegments[5].includes('auth=secret_token'), `Query parameter segment preserved: ${decodedSegments[5]}`);

    // 5. LL-HLS EXT-X-PART & EXT-X-PRELOAD-HINT rewritten to /hls/segment.ts
    const partLines = lines.filter((l) => l.startsWith('#EXT-X-PART'));
    assert(partLines.length === 2, 'Found 2 #EXT-X-PART lines');
    for (const part of partLines) {
      assert(part.includes(`URI="${proxyBaseUrl}/hls/segment.ts?url=`), `EXT-X-PART rewrites URI to proxy segment: ${part}`);
    }

    const hintLine = lines.find((l) => l.startsWith('#EXT-X-PRELOAD-HINT'));
    assert(hintLine && hintLine.includes(`URI="${proxyBaseUrl}/hls/segment.ts?url=`), `EXT-X-PRELOAD-HINT rewrites URI to proxy segment: ${hintLine}`);
  });

  // ──────────────────────────────────────────────────────────────────────────
  // TEST 3: Encryption Key Proxying via /hls/key & /hls/key.key
  // ──────────────────────────────────────────────────────────────────────────
  await runTest('Key Proxying (/hls/key and /hls/key.key)', async () => {
    const keyUrl = `${mockBaseUrl}/streams/keys/aes128.key`;
    const b64Key = Buffer.from(keyUrl).toString('base64url');
    const ref = 'https://vsmov.com/watch';
    const b64Ref = Buffer.from(ref).toString('base64url');

    // Test /hls/key
    const resKey = await axios.get(`${proxyBaseUrl}/hls/key?url=${b64Key}&ref=${b64Ref}`, { responseType: 'arraybuffer' });
    assert(resKey.status === 200, '/hls/key returns HTTP 200');
    assert(resKey.headers['content-type'] === 'application/octet-stream', 'Content-Type is octet-stream');
    assert(resKey.headers['cache-control'] === 'no-cache, no-store', 'Cache-Control is no-cache, no-store');
    assert(resKey.headers['access-control-allow-origin'] === '*', 'CORS Access-Control-Allow-Origin is *');
    assert(Buffer.from(resKey.data).equals(mockAesKey), 'Downloaded AES key matches upstream key exactly (16 bytes)');

    // Test alias /hls/key.key
    const resKeyAlias = await axios.get(`${proxyBaseUrl}/hls/key.key?url=${b64Key}&ref=${b64Ref}`, { responseType: 'arraybuffer' });
    assert(resKeyAlias.status === 200, '/hls/key.key alias returns HTTP 200');
    assert(Buffer.from(resKeyAlias.data).equals(mockAesKey), 'Alias key response matches upstream key');
  });

  // ──────────────────────────────────────────────────────────────────────────
  // TEST 4: Full Segment & Range Request Seeking via /hls/segment.ts
  // ──────────────────────────────────────────────────────────────────────────
  await runTest('Segment Proxying (/hls/segment.ts, Range 206, and Aliases)', async () => {
    const segUrl = `${mockBaseUrl}/streams/4k_2160p/segment_001.ts`;
    const b64Seg = Buffer.from(segUrl).toString('base64url');
    const ref = 'https://suutamphim.org/phim/test';
    const b64Ref = Buffer.from(ref).toString('base64url');

    // Full GET request
    const resFull = await axios.get(`${proxyBaseUrl}/hls/segment.ts?url=${b64Seg}&ref=${b64Ref}`, { responseType: 'arraybuffer' });
    assert(resFull.status === 200, 'Full segment returns HTTP 200');
    assert(resFull.headers['content-type'] === 'video/MP2T', 'Content-Type is video/MP2T');
    assert(resFull.headers['cache-control'].includes('public, max-age='), 'Cache-Control has long public cache');
    assert(resFull.headers['access-control-allow-origin'] === '*', 'CORS header is present');
    assert(resFull.data.length === 256 * 1024, `Payload size is 256KB (${resFull.data.length} bytes > 50KB)`);
    assert(resFull.data[0] === 0x47, 'First byte is MPEG-TS sync byte 0x47');

    // Range Request GET
    const resRange = await axios.get(`${proxyBaseUrl}/hls/segment.ts?url=${b64Seg}&ref=${b64Ref}`, {
      headers: { Range: 'bytes=0-1023' },
      responseType: 'arraybuffer',
    });
    assert(resRange.status === 206, 'Range request returns HTTP 206 Partial Content');
    assert(resRange.headers['content-range'] === 'bytes 0-1023/262144', `Content-Range header verified: ${resRange.headers['content-range']}`);
    assert(resRange.data.length === 1024, `Range chunk length is exactly 1024 bytes`);
    assert(resRange.data[0] === 0x47, 'Range chunk sync byte 0x47 verified');

    // Test Aliases /hls/ts and /hls/segment
    const resAliasTs = await axios.get(`${proxyBaseUrl}/hls/ts?url=${b64Seg}`, { responseType: 'arraybuffer' });
    assert(resAliasTs.status === 200, '/hls/ts alias returns HTTP 200');
    assert(resAliasTs.data.length === 256 * 1024, '/hls/ts returns full 256KB segment');

    const resAliasSegment = await axios.get(`${proxyBaseUrl}/hls/segment?url=${b64Seg}`, { responseType: 'arraybuffer' });
    assert(resAliasSegment.status === 200, '/hls/segment alias returns HTTP 200');
  });

  // ──────────────────────────────────────────────────────────────────────────
  // TEST 5: Base64, Base64URL, Plain URL, and Referer Header Variations
  // ──────────────────────────────────────────────────────────────────────────
  await runTest('Encoding Formats & Referer Inference Verification', async () => {
    const rawTarget = `${mockBaseUrl}/streams/segments/test_seg.ts`;
    const b64Url = Buffer.from(rawTarget).toString('base64url');
    const b64Std = Buffer.from(rawTarget).toString('base64');

    // 1. Query using b64 parameter
    const resB64Param = await axios.get(`${proxyBaseUrl}/hls/segment.ts?b64=${b64Url}`);
    assert(resB64Param.status === 200, 'Supports ?b64= query param with base64url');

    // 2. Query using standard Base64 in ?url=
    const resB64Std = await axios.get(`${proxyBaseUrl}/hls/segment.ts?url=${encodeURIComponent(b64Std)}`);
    assert(resB64Std.status === 200, 'Supports standard base64 strings in ?url=');

    // 3. Query using raw plain URL in ?url=
    const resPlainUrl = await axios.get(`${proxyBaseUrl}/hls/segment.ts?url=${encodeURIComponent(rawTarget)}`);
    assert(resPlainUrl.status === 200, 'Supports plain unencoded URL in ?url=');

    // 4. Verify Referer inference from target domain (e.g. kkphimplayer, vsmov, nguonc)
    recordedUpstreamRequests.length = 0; // reset
    await axios.get(`${proxyBaseUrl}/hls/segment.ts?url=${b64Url}&ref=${encodeURIComponent('https://vsmov.com/movie/4k')}`);
    const lastReq = recordedUpstreamRequests[recordedUpstreamRequests.length - 1];
    assert(lastReq.headers['referer'] === 'https://vsmov.com/movie/4k' || lastReq.headers['referer'] === 'https://vsmov.com/movie/4k/', `Referer forwarded correctly: ${lastReq.headers['referer']}`);
    assert(lastReq.headers['origin'] === 'https://vsmov.com', `Origin forwarded correctly: ${lastReq.headers['origin']}`);
  });

  // ──────────────────────────────────────────────────────────────────────────
  // TEST 6: Real Live Stream Resolution & Live Chunk Download via /hls/segment.ts
  // ──────────────────────────────────────────────────────────────────────────
  await runTest('Real Live Stream & Chunk Download (>50KB, MPEG-TS 0x47 Sync, Range 206)', async () => {
    // Obtain real active stream M3U8 from PhimAPI / KKPhim
    const liveApiRes = await axios.get('https://phimapi.com/phim/cuu-mon', { timeout: 10000 });
    assert(liveApiRes.status === 200, 'Fetched live movie metadata from PhimAPI');
    
    const epData = liveApiRes.data?.episodes?.[0]?.server_data?.[0];
    assert(epData && epData.link_m3u8, 'Obtained active live m3u8 URL from API');

    const liveM3u8 = epData.link_m3u8;
    console.log(`  Live M3U8 URL: ${liveM3u8}`);

    const b64Live = Buffer.from(liveM3u8).toString('base64url');
    const b64Ref = Buffer.from('https://player.phimapi.com/').toString('base64url');

    // 1. Fetch live master/media manifest through proxy
    const manifestRes = await axios.get(`${proxyBaseUrl}/hls/manifest.m3u8?url=${b64Live}&ref=${b64Ref}`, { timeout: 15000 });
    assert(manifestRes.status === 200, 'Live manifest returned HTTP 200');
    assert(manifestRes.data.includes('#EXTM3U'), 'Live manifest contains #EXTM3U');

    const lines = manifestRes.data.split('\n').map((l) => l.trim()).filter(Boolean);
    let liveSegmentProxyUrl = lines.find((l) => l.startsWith('http') && (l.includes('/hls/segment.ts') || l.includes('/hls/ts')));

    if (!liveSegmentProxyUrl) {
      const subVariantUrl = lines.find((l) => l.startsWith('http') && l.includes('/hls/manifest.m3u8'));
      assert(subVariantUrl, 'Found sub-variant playlist URL');
      console.log(`  Fetching sub-variant: ${subVariantUrl}`);
      const subRes = await axios.get(subVariantUrl, { timeout: 15000 });
      assert(subRes.status === 200, 'Sub-manifest returned HTTP 200');
      const subLines = subRes.data.split('\n').map((l) => l.trim()).filter(Boolean);
      liveSegmentProxyUrl = subLines.find((l) => l.startsWith('http') && (l.includes('/hls/segment.ts') || l.includes('/hls/ts')));
    }

    assert(liveSegmentProxyUrl, `Resolved live segment proxy URL: ${liveSegmentProxyUrl}`);

    // 2. Download real live video chunk (>50KB)
    const chunkRes = await axios.get(liveSegmentProxyUrl, { responseType: 'arraybuffer', timeout: 25000 });
    assert(chunkRes.status === 200, 'Live video chunk returned HTTP 200');
    assert(chunkRes.headers['access-control-allow-origin'] === '*', 'Live video chunk has CORS *');
    assert(chunkRes.headers['content-type'].toLowerCase().includes('video/mp2t'), 'Live video chunk has video/MP2T Content-Type');

    const liveBuffer = Buffer.from(chunkRes.data);
    const sizeKB = (liveBuffer.length / 1024).toFixed(2);
    console.log(`  📦 Real CDN Segment Size: ${liveBuffer.length} bytes (${sizeKB} KB)`);
    assert(liveBuffer.length > 50000, `Live segment is > 50KB (${liveBuffer.length} bytes)`);

    // 3. Verify MPEG-TS sync byte 0x47 & 188-byte packet boundary
    assert(liveBuffer[0] === 0x47, 'First byte is MPEG-TS sync byte 0x47');
    if (liveBuffer.length >= 189) {
      assert(liveBuffer[188] === 0x47, 'Byte 188 matches MPEG-TS packet boundary sync byte 0x47');
    }

    // 4. Test Range request on real live CDN chunk
    const rangeRes = await axios.get(liveSegmentProxyUrl, {
      headers: { Range: 'bytes=0-1023' },
      responseType: 'arraybuffer',
      timeout: 20000,
      validateStatus: (s) => s >= 200 && s < 400,
    });
    assert(rangeRes.status === 206, 'Live segment Range request returned HTTP 206');
    assert(rangeRes.headers['content-range'].startsWith('bytes 0-1023/'), `Content-Range header verified: ${rangeRes.headers['content-range']}`);
    assert(rangeRes.data.byteLength === 1024, 'Range byte length is exactly 1024 bytes');
    assert(Buffer.from(rangeRes.data)[0] === 0x47, 'Range chunk starts with 0x47 sync byte');
  });

  // ──────────────────────────────────────────────────────────────────────────
  // TEST 7: High Concurrency & Playlist Cache Stress Test
  // ──────────────────────────────────────────────────────────────────────────
  await runTest('High Concurrency & In-Memory Cache Stress Test', async () => {
    const upstreamUrl = `${mockBaseUrl}/streams/master_4k.m3u8`;
    const b64Upstream = Buffer.from(upstreamUrl).toString('base64url');
    
    // Launch 30 concurrent requests for manifest and 30 for segment
    const segUrl = `${mockBaseUrl}/streams/4k_2160p/segment_001.ts`;
    const b64Seg = Buffer.from(segUrl).toString('base64url');

    const manifestPromises = Array.from({ length: 30 }, () =>
      axios.get(`${proxyBaseUrl}/hls/manifest.m3u8?url=${b64Upstream}`)
    );
    const segPromises = Array.from({ length: 30 }, () =>
      axios.get(`${proxyBaseUrl}/hls/segment.ts?url=${b64Seg}`, { responseType: 'arraybuffer' })
    );

    const [manifestResults, segResults] = await Promise.all([
      Promise.all(manifestPromises),
      Promise.all(segPromises),
    ]);

    assert(manifestResults.every((r) => r.status === 200), 'All 30 concurrent manifest requests returned HTTP 200');
    assert(segResults.every((r) => r.status === 200 && r.data.length === 256 * 1024), 'All 30 concurrent segment requests returned HTTP 200 with complete payload');
  });

  // ──────────────────────────────────────────────────────────────────────────
  // TEST 8: Adversarial Error Handling & Boundary Stress Tests
  // ──────────────────────────────────────────────────────────────────────────
  await runTest('Adversarial Error Handling & Boundary Stress Tests', async () => {
    // 1. Missing URL parameter on /hls/manifest.m3u8 -> 400
    try {
      await axios.get(`${proxyBaseUrl}/hls/manifest.m3u8`);
      assert(false, 'Should return 400 for missing url');
    } catch (err) {
      assert(err.response && err.response.status === 400, 'Missing url returns HTTP 400');
    }

    // 2. Missing URL parameter on /hls/segment.ts -> 400
    try {
      await axios.get(`${proxyBaseUrl}/hls/segment.ts`);
      assert(false, 'Should return 400 for missing url on segment');
    } catch (err) {
      assert(err.response && err.response.status === 400, 'Missing url on segment returns HTTP 400');
    }

    // 3. Missing URL parameter on /hls/key -> 400
    try {
      await axios.get(`${proxyBaseUrl}/hls/key`);
      assert(false, 'Should return 400 for missing url on key');
    } catch (err) {
      assert(err.response && err.response.status === 400, 'Missing url on key returns HTTP 400');
    }

    // 4. Non-existent upstream URL -> 502 Bad Gateway
    try {
      const badUrl = 'http://127.0.0.1:59999/nonexistent.m3u8';
      const b64Bad = Buffer.from(badUrl).toString('base64url');
      await axios.get(`${proxyBaseUrl}/hls/manifest.m3u8?url=${b64Bad}`, { timeout: 3000 });
      assert(false, 'Should return 502 for unreachable upstream');
    } catch (err) {
      assert(err.response && err.response.status === 502, 'Unreachable upstream returns HTTP 502 Bad Gateway');
    }

    // 5. Options CORS preflight -> 204
    const optRes = await axios.options(`${proxyBaseUrl}/hls/manifest.m3u8`);
    assert(optRes.status === 204, 'OPTIONS preflight returns HTTP 204');
    assert(optRes.headers['access-control-allow-origin'] === '*', 'Preflight CORS header is *');
  });

  // Tear down servers
  await tearDown();

  console.log('\n╔══════════════════════════════════════════════════════════════════════════════╗');
  console.log(`║ TOTAL TESTS RUN: ${totalTests.toString().padEnd(4)} | PASSED: ${passedTests.toString().padEnd(4)} | FAILED: ${failedTests.toString().padEnd(4)}                ║`);
  if (failedTests === 0) {
    console.log('║ 🏆 ALL ADVERSARIAL CHALLENGE TESTS PASSED (100% EMPIRICAL SUCCESS)          ║');
  } else {
    console.log('║ ⚠️ SOME ADVERSARIAL TESTS FAILED! CHECK DETAILS ABOVE.                      ║');
  }
  console.log('╚══════════════════════════════════════════════════════════════════════════════╝');

  if (failedTests > 0) {
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('Fatal error running tests:', err);
  process.exit(1);
});
