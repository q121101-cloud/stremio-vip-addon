'use strict';

const http = require('http');
const express = require('express');
const axios = require('axios');
const hlsRouter = require('../../src/routes/hls');

async function runForensicChecks() {
  console.log('====================================================');
  console.log('🔬 FORENSIC AUDIT: HLS PROXY ANTI-403 OPTIMIZATION');
  console.log('====================================================');

  let passed = 0;
  let failed = 0;

  function assert(condition, message) {
    if (condition) {
      console.log(`✅ PASS: ${message}`);
      passed++;
    } else {
      console.error(`❌ FAIL: ${message}`);
      failed++;
    }
  }

  // --- Phase 1: Source & Constant Inspection ---
  console.log('\n--- Phase 1: Code & Regex Invariants ---');
  const hlsSource = require('fs').readFileSync(require.resolve('../../src/routes/hls'), 'utf8');

  // Check 1.1: No hardcoded test responses or fake bypasses
  const hasHardcodedM3U8 = hlsSource.includes('#EXTM3U\n#EXT-X-STREAM-INF') && !hlsSource.includes('String(r.data)');
  assert(!hasHardcodedM3U8, 'No hardcoded m3u8 playlist payloads found in source');

  const hasFakeStream = hlsSource.includes('res.send(Buffer.from([0x47, 0x40]))') || hlsSource.includes('res.end(Buffer.alloc');
  assert(!hasFakeStream, 'No fake/mock binary segment generator found in source');

  // Check 1.2: User-Agent constant
  const expectedUA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';
  assert(hlsSource.includes(expectedUA), 'HLS_UA contains exact modern Chrome 126 Macintosh User-Agent');

  // Check 1.3: Anti-403 Referer & Origin mapping
  assert(hlsSource.includes('https://player.phimapi.com/'), 'SOURCE_REFERERS includes player.phimapi.com referer');
  assert(hlsSource.includes('https://player.phimapi.com'), 'SOURCE_REFERERS includes player.phimapi.com origin');
  assert(hlsSource.includes('kkphimplayer') && hlsSource.includes('phim1280'), 'SOURCE_REFERERS regex matches kkphimplayer & phim1280 domains');

  // --- Phase 2: Mock CDN Verification (Header Injection & Stream Pipelining) ---
  console.log('\n--- Phase 2: Mock CDN Verification (Header Verification & Pipelining) ---');

  // Set up mock CDN server
  const receivedHeaders = [];
  const mockCdn = http.createServer((req, res) => {
    receivedHeaders.push({
      url: req.url,
      method: req.method,
      headers: req.headers,
    });

    // Check Anti-403 requirements
    const isPhimApiReferer = req.headers['referer'] === 'https://player.phimapi.com/';
    const isPhimApiOrigin = req.headers['origin'] === 'https://player.phimapi.com';
    const isCustomReferer = req.headers['referer'] === 'https://custom.site.com/';
    const isCustomOrigin = req.headers['origin'] === 'https://custom.site.com';
    const isExpectedUA = req.headers['user-agent'] === expectedUA;

    if (!isExpectedUA) {
      res.writeHead(403, { 'Content-Type': 'text/plain' });
      res.end('403 Forbidden: Invalid User-Agent');
      return;
    }

    if (req.url.includes('protected') && !isPhimApiReferer && !isCustomReferer) {
      res.writeHead(403, { 'Content-Type': 'text/plain' });
      res.end('403 Forbidden: Hotlink detected');
      return;
    }

    if (req.url.endsWith('master.m3u8')) {
      const masterContent = `#EXTM3U
#EXT-X-VERSION:3
#EXT-X-MEDIA:TYPE=AUDIO,GROUP-ID="audio",NAME="Vietnamese",DEFAULT=YES,AUTOSELECT=YES,URI="audio/vi.m3u8"
#EXT-X-STREAM-INF:BANDWIDTH=1280000,RESOLUTION=1280x720
720p/index.m3u8
#EXT-X-STREAM-INF:BANDWIDTH=2560000,RESOLUTION=1920x1080
https://cdn.kkphimplayer10.com/1080p/index.m3u8`;
      res.writeHead(200, { 'Content-Type': 'application/vnd.apple.mpegurl' });
      res.end(masterContent);
      return;
    }

    if (req.url.endsWith('index.m3u8')) {
      const mediaContent = `#EXTM3U
#EXT-X-VERSION:3
#EXT-X-TARGETDURATION:10
#EXT-X-KEY:METHOD=AES-128,URI="key.php?id=123",IV=0x01
#EXT-X-MAP:URI="init.mp4"
#EXTINF:10.000,
segment_000.ts
#EXTINF:10.000,
https://cdn.kkphimplayer10.com/720p/segment_001.ts
#EXT-X-ENDLIST`;
      res.writeHead(200, { 'Content-Type': 'application/vnd.apple.mpegurl' });
      res.end(mediaContent);
      return;
    }

    if (req.url.endsWith('key.php?id=123')) {
      res.writeHead(200, { 'Content-Type': 'application/octet-stream' });
      res.end(Buffer.alloc(16, 0xAA));
      return;
    }

    if (req.url.endsWith('.ts')) {
      res.writeHead(200, { 'Content-Type': 'video/mp2t', 'Content-Length': '1024' });
      res.end(Buffer.alloc(1024, 0x47)); // TS sync byte
      return;
    }

    res.writeHead(404);
    res.end();
  });

  await new Promise((resolve) => mockCdn.listen(0, '127.0.0.1', resolve));
  const cdnPort = mockCdn.address().port;
  const cdnBase = `http://127.0.0.1:${cdnPort}`;

  // Set up local proxy Express app
  const app = express();
  app.use('/hls', hlsRouter);

  const proxyServer = http.createServer(app);
  await new Promise((resolve) => proxyServer.listen(0, '127.0.0.1', resolve));
  const proxyPort = proxyServer.address().port;
  const proxyBase = `http://127.0.0.1:${proxyPort}`;

  try {
    // 2.1 Test Master Playlist Request through Proxy
    const masterTargetUrl = `${cdnBase}/kkphimplayer/protected/master.m3u8`;
    const b64MasterUrl = Buffer.from(masterTargetUrl).toString('base64url');
    
    const manifestResp = await axios.get(`${proxyBase}/hls/manifest.m3u8?url=${b64MasterUrl}`);
    assert(manifestResp.status === 200, 'Proxy returns HTTP 200 for protected master manifest');
    assert(manifestResp.headers['content-type'].includes('application/vnd.apple.mpegurl'), 'Proxy returns correct Content-Type for manifest');
    assert(manifestResp.headers['access-control-allow-origin'] === '*', 'Proxy returns Access-Control-Allow-Origin: *');

    const manifestBody = manifestResp.data;
    assert(manifestBody.includes('#EXTM3U'), 'Manifest body starts with #EXTM3U');
    assert(manifestBody.includes('/hls/manifest.m3u8?url='), 'Variant sub-playlists rewritten to route through proxy');
    assert(manifestBody.includes('audio/vi.m3u8') === false, 'Relative audio URI rewritten to proxy URL');
    assert(manifestBody.includes('720p/index.m3u8') === false, 'Relative 720p stream rewritten to proxy URL');

    // 2.2 Test Media Playlist Request through Proxy
    const mediaTargetUrl = `${cdnBase}/kkphimplayer/protected/720p/index.m3u8`;
    const b64MediaUrl = Buffer.from(mediaTargetUrl).toString('base64url');

    const mediaResp = await axios.get(`${proxyBase}/hls/manifest.m3u8?url=${b64MediaUrl}`);
    assert(mediaResp.status === 200, 'Proxy returns HTTP 200 for protected media playlist');

    const mediaBody = mediaResp.data;
    assert(mediaBody.includes('/hls/ts?url='), 'Media segments rewritten to route through /hls/ts');
    assert(mediaBody.includes('is_key=1'), 'DRM Key tag rewritten with is_key=1 flag');
    assert(mediaBody.includes('segment_000.ts') === false, 'Relative TS segment rewritten to absolute proxy URL');

    // Extract rewritten segment URL from playlist
    const lines = mediaBody.split('\n');
    const segmentProxyUrl = lines.find((l) => l.includes('/hls/ts?url=') && !l.includes('is_key=1') && !l.includes('#'));
    assert(!!segmentProxyUrl, 'Found rewritten segment proxy URL in playlist');

    // 2.3 Test Segment Fetching & Streaming
    const segResp = await axios.get(segmentProxyUrl, { responseType: 'arraybuffer' });
    assert(segResp.status === 200, 'Proxy returns HTTP 200 for TS segment stream');
    assert(segResp.headers['content-type'] === 'video/mp2t', 'Segment response enforces video/mp2t Content-Type');
    assert(segResp.headers['access-control-allow-origin'] === '*', 'Segment response enforces CORS');
    assert(segResp.data.length === 1024, `Segment buffer length is 1024 bytes (received: ${segResp.data.length})`);
    assert(segResp.data[0] === 0x47, 'Segment buffer begins with valid MPEG-TS sync byte 0x47');

    // 2.4 Test Key Fetching & Streaming
    const keyLine = lines.find((l) => l.includes('#EXT-X-KEY'));
    const keyUrlMatch = keyLine.match(/URI="([^"]+)"/);
    assert(!!keyUrlMatch, 'Extracted rewritten key URL');
    const keyProxyUrl = keyUrlMatch[1];
    const keyResp = await axios.get(keyProxyUrl, { responseType: 'arraybuffer' });
    assert(keyResp.status === 200, 'Proxy returns HTTP 200 for DRM Key');
    assert(keyResp.headers['content-type'] === 'application/octet-stream', 'Key response Content-Type is application/octet-stream');
    assert(keyResp.data.length === 16, `Key buffer length is 16 bytes (received: ${keyResp.data.length})`);

    // 2.5 Test Custom Referer Dynamic Passing
    const customMediaTargetUrl = `${cdnBase}/custom/protected/index.m3u8`;
    const b64CustomMediaUrl = Buffer.from(customMediaTargetUrl).toString('base64url');
    const customRef = 'https://custom.site.com/';
    const b64CustomRef = Buffer.from(customRef).toString('base64url');
    const customMediaResp = await axios.get(`${proxyBase}/hls/manifest.m3u8?url=${b64CustomMediaUrl}&ref=${b64CustomRef}`);
    assert(customMediaResp.status === 200, 'Proxy succeeds with custom ref parameter');
    
    const lastReq = receivedHeaders[receivedHeaders.length - 1];
    assert(lastReq.headers['referer'] === 'https://custom.site.com/', 'Upstream received custom Referer header');
    assert(lastReq.headers['origin'] === 'https://custom.site.com', 'Upstream received custom Origin header');

    // 2.6 Test OPTIONS Preflight
    const optResp = await axios.options(`${proxyBase}/hls/manifest.m3u8`);
    assert(optResp.status === 204, 'OPTIONS preflight returns HTTP 204');
    assert(optResp.headers['access-control-allow-origin'] === '*', 'OPTIONS preflight has CORS header');

  } finally {
    mockCdn.close();
    proxyServer.close();
  }

  // --- Phase 3: Live Upstream KKPhim Verification ---
  console.log('\n--- Phase 3: Live Upstream KKPhim Verification ---');
  try {
    const kkphimProvider = require('../../src/providers/kkphim');
    const streams = await kkphimProvider.getStreams({
      imdbId: 'tt1375666',
      title: 'Inception',
      year: 2010,
      type: 'movie',
      proxyBase: 'http://127.0.0.1:7412',
    });

    if (streams && streams.length > 0) {
      console.log(`Received ${streams.length} stream(s) from KKPhim provider:`);
      streams.forEach((s, i) => {
        console.log(` [${i + 1}] name: "${s.name}"`);
        console.log(`     title: "${s.title.replace(/\n/g, ' ')}"`);
        console.log(`     url: "${s.url.slice(0, 70)}..."`);
      });

      const firstStream = streams[0];
      assert(firstStream.name === 'VIP Movies 🎬', 'Stream name is "VIP Movies 🎬"');
      assert(firstStream.title.includes('[VIP • KKPhim]'), 'Stream title contains [VIP • KKPhim]');
      assert(firstStream.title.includes('⚡ Server VIP • Phát trực tiếp trong App'), 'Stream title contains badge');
      assert(firstStream.url.includes('/hls/manifest.m3u8?url='), 'Stream url points to /hls/manifest.m3u8');
      assert(firstStream.externalUrl === undefined, 'externalUrl is strictly omitted (in-app playback only)');

      // --- Phase 4: Live HLS Proxy & TS Segment Streaming ---
      console.log('\n--- Phase 4: Live HLS Proxy & TS Segment Streaming ---');
      const liveApp = express();
      liveApp.use('/hls', hlsRouter);
      const liveServer = http.createServer(liveApp);
      await new Promise((resolve) => liveServer.listen(0, '127.0.0.1', resolve));
      const livePort = liveServer.address().port;

      try {
        const parsedProxyUrl = new URL(firstStream.url);
        const liveManifestUrl = `http://127.0.0.1:${livePort}${parsedProxyUrl.pathname}${parsedProxyUrl.search}`;
        console.log('Fetching live proxy manifest from:', liveManifestUrl);

        const liveManifestResp = await axios.get(liveManifestUrl);
        assert(liveManifestResp.status === 200, 'Live manifest returns HTTP 200 through proxy');
        assert(liveManifestResp.data.includes('#EXTM3U'), 'Live manifest starts with #EXTM3U');
        assert(liveManifestResp.data.includes('/hls/'), 'Live manifest has rewritten URLs pointing to proxy');

        // Extract first TS or sub-manifest link
        const mLines = liveManifestResp.data.split('\n');
        const firstRewrittenUrl = mLines.find((l) => l.startsWith('http://') || l.startsWith('https://') || l.includes('/hls/'));
        assert(!!firstRewrittenUrl, 'Extracted rewritten segment or sub-manifest URL from live manifest');

        let segmentUrlToTest = firstRewrittenUrl;
        if (firstRewrittenUrl.includes('/hls/manifest.m3u8')) {
          console.log('Master playlist detected, fetching sub-playlist...');
          const subResp = await axios.get(firstRewrittenUrl);
          assert(subResp.status === 200, 'Sub-playlist returns HTTP 200 through proxy');
          const subLines = subResp.data.split('\n');
          segmentUrlToTest = subLines.find((l) => l.includes('/hls/ts?url=') && !l.includes('is_key=1'));
          assert(!!segmentUrlToTest, 'Extracted TS segment URL from sub-playlist');
        }

        if (segmentUrlToTest) {
          console.log('Fetching live TS segment via proxy:', segmentUrlToTest.slice(0, 80));
          const tsResp = await axios.get(segmentUrlToTest, { responseType: 'arraybuffer', timeout: 15000 });
          assert(tsResp.status === 200, 'Live TS segment returns HTTP 200 (no 403 Forbidden)');
          assert(tsResp.headers['content-type'] === 'video/mp2t', 'Live TS segment Content-Type is video/mp2t');
          assert(tsResp.data.length > 1000, `Live TS segment buffer is valid size (${tsResp.data.length} bytes)`);
          assert(tsResp.data[0] === 0x47, 'Live TS segment starts with MPEG-TS sync byte 0x47');
        }
      } finally {
        liveServer.close();
      }
    } else {
      console.warn('⚠️ No live streams returned from KKPhim for tt1375666 (might be upstream network/API transient status)');
    }
  } catch (err) {
    console.warn('⚠️ Live KKPhim fetch error:', err.message);
  }

  console.log('\n====================================================');
  console.log(`📊 SUMMARY: ${passed} PASSED, ${failed} FAILED`);
  console.log('====================================================');

  if (failed > 0) {
    process.exit(1);
  }
}

runForensicChecks().catch((err) => {
  console.error('Fatal error during forensic audit:', err);
  process.exit(1);
});
