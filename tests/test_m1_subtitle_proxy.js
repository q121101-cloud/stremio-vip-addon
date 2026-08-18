'use strict';

const http = require('http');
const axios = require('axios');
const { TestRunner, startTestServer } = require('./helpers');

async function runM1SubtitleTests() {
  const runner = new TestRunner('M1 Subtitle Proxy & Stream Subtitles Test');

  // 1. Setup Mock Upstream Server for Subtitles
  const mockSrtContent = `1
00:00:01,000 --> 00:00:04,500
Xin chào thế giới!

2
00:00:05,100 --> 00:00:08,900
Đây là phụ đề tiếng Việt.
`;

  const mockVttContent = `WEBVTT

1
00:00:01.000 --> 00:00:04.500
Hello World!

2
00:00:05.100 --> 00:00:08.900
This is an English subtitle.
`;

  let lastUpstreamHeaders = null;

  const upstreamServer = http.createServer((req, res) => {
    lastUpstreamHeaders = req.headers;
    if (req.url.startsWith('/test.srt')) {
      res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end(mockSrtContent);
    } else if (req.url.startsWith('/bom.srt')) {
      res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('\uFEFF' + mockSrtContent);
    } else if (req.url.startsWith('/test.vtt')) {
      res.writeHead(200, { 'Content-Type': 'text/vtt; charset=utf-8' });
      res.end(mockVttContent);
    } else if (req.url.startsWith('/error-404')) {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('Not found');
    } else {
      res.writeHead(200, { 'Content-Type': 'text/plain' });
      res.end('OK');
    }
  });

  await new Promise((resolve) => upstreamServer.listen(0, '127.0.0.1', resolve));
  const upstreamPort = upstreamServer.address().port;
  const upstreamBase = `http://127.0.0.1:${upstreamPort}`;

  // 2. Start Main Addon Test Server
  const testPort = 57123;
  const { server, baseUrl } = await startTestServer(testPort);

  try {
    runner.section('1. Route Aliases & Missing Parameters');

    // Missing URL -> 400
    try {
      await axios.get(`${baseUrl}/hls/sub.vtt`);
      runner.fail('Expected 400 for missing url query param');
    } catch (err) {
      runner.assertEqual(err.response?.status, 400, 'GET /hls/sub.vtt without URL returns 400');
      runner.assertIncludes(err.response?.data, 'Invalid or missing subtitle url', 'Error message matches specification');
    }

    // Missing URL on alias /hls/sub -> 400
    try {
      await axios.get(`${baseUrl}/hls/sub`);
      runner.fail('Expected 400 for missing url on alias /hls/sub');
    } catch (err) {
      runner.assertEqual(err.response?.status, 400, 'GET /hls/sub without URL returns 400');
    }

    // Manifest aliases presence
    try {
      const resManifest = await axios.get(`${baseUrl}/hls/m3u8-proxy`, { validateStatus: () => true });
      runner.assertEqual(resManifest.status, 400, 'GET /hls/m3u8-proxy route alias exists and returns 400 on missing url');
    } catch (err) {
      runner.fail('Route /hls/m3u8-proxy not found', err);
    }

    // Segment aliases presence
    try {
      const resSegment = await axios.get(`${baseUrl}/hls/ts-proxy`, { validateStatus: () => true });
      runner.assertEqual(resSegment.status, 400, 'GET /hls/ts-proxy route alias exists and returns 400 on missing url');
    } catch (err) {
      runner.fail('Route /hls/ts-proxy not found', err);
    }

    runner.section('2. SRT to WebVTT Conversion & Headers');

    const srtUrl = `${upstreamBase}/test.srt`;
    const resSrt = await axios.get(`${baseUrl}/hls/sub.vtt?url=${encodeURIComponent(srtUrl)}&ref=https://vsmov.com/`);

    runner.assertEqual(resSrt.status, 200, 'GET /hls/sub.vtt with valid SRT upstream returns 200');
    runner.assertEqual(resSrt.headers['content-type'], 'text/vtt; charset=utf-8', 'Content-Type is text/vtt; charset=utf-8');
    runner.assertEqual(resSrt.headers['access-control-allow-origin'], '*', 'Access-Control-Allow-Origin is *');
    runner.assertEqual(resSrt.headers['cache-control'], 'public, max-age=86400', 'Cache-Control is public, max-age=86400');
    runner.assert(resSrt.data.startsWith('WEBVTT\n\n'), 'Converted subtitle starts with WEBVTT\\n\\n header');
    runner.assert(resSrt.data.includes('00:00:01.000 --> 00:00:04.500'), 'SRT comma timestamps converted to period format');
    runner.assert(!resSrt.data.includes('00:00:01,000'), 'No comma milliseconds remaining in converted WebVTT');
    runner.assertIncludes(resSrt.data, 'Xin chào thế giới!', 'Subtitle content body preserved');

    // Verify upstream request headers
    runner.assert(lastUpstreamHeaders['user-agent']?.includes('Chrome'), 'Upstream request has Chrome User-Agent');
    runner.assertEqual(lastUpstreamHeaders['referer'], 'https://vsmov.com/', 'Upstream request has Referer: https://vsmov.com/');
    runner.assertEqual(lastUpstreamHeaders['origin'], 'https://vsmov.com', 'Upstream request has Origin: https://vsmov.com');

    runner.section('3. BOM Stripping & Base64 URL Parameters');

    const bomSrtUrl = `${upstreamBase}/bom.srt`;
    const b64Url = Buffer.from(bomSrtUrl).toString('base64url');
    const b64Ref = Buffer.from('https://vsmov.com/movie/test').toString('base64url');

    const resBom = await axios.get(`${baseUrl}/hls/sub.vtt?url=${b64Url}&ref=${b64Ref}`);
    runner.assertEqual(resBom.status, 200, 'Base64 encoded url and ref parameter resolved correctly');
    runner.assert(!resBom.data.startsWith('\uFEFF'), 'UTF-8 BOM stripped cleanly');
    runner.assert(resBom.data.startsWith('WEBVTT\n\n'), 'Starts with WEBVTT\\n\\n after BOM stripping');

    runner.section('4. Direct WebVTT Passthrough');

    const vttUrl = `${upstreamBase}/test.vtt`;
    const resVtt = await axios.get(`${baseUrl}/hls/sub.vtt?sub=${encodeURIComponent(vttUrl)}`);
    runner.assertEqual(resVtt.status, 200, 'Supported query param "sub" returns 200');
    runner.assert(resVtt.data.startsWith('WEBVTT'), 'Native WebVTT remains valid WEBVTT');
    runner.assertIncludes(resVtt.data, 'Hello World!', 'Native WebVTT content preserved');

    runner.section('5. Upstream Error Handling');

    try {
      await axios.get(`${baseUrl}/hls/sub.vtt?url=${encodeURIComponent(upstreamBase + '/error-404')}`);
      runner.fail('Expected 404/502 error on upstream failure');
    } catch (err) {
      runner.assert(err.response?.status >= 400, 'Returns error status code on upstream 404');
    }

    runner.section('6. Stream Subtitle Preservation in handleStream');

    // Query stream endpoint
    const resStream = await axios.get(`${baseUrl}/stream/movie/nguonc:nu-hiep-ruy-bang.json`);
    runner.assertEqual(resStream.status, 200, 'GET /stream returns 200');
    runner.assert(Array.isArray(resStream.data?.streams), 'streams is an array');

    if (resStream.data.streams.length > 0) {
      for (const [idx, s] of resStream.data.streams.entries()) {
        runner.assertStreamProtocol(s, idx);
      }
    }

  } finally {
    server.close();
    upstreamServer.close();
  }

  runner.printSummary();
  if (runner.failed > 0) {
    process.exit(1);
  }
}

runM1SubtitleTests().catch((err) => {
  console.error('Fatal test runner error:', err);
  process.exit(1);
});
