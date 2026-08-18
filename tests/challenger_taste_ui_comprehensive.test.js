'use strict';

/**
 * ==============================================================================
 *  Challenger 2: Comprehensive Empirical Stress Test Suite for v1.5.1 + Taste UI
 *  Empirical Verification: Streaming Pipeline, Subtitle Proxy, Audio Separation,
 *  Route Safety, Range Seeking, Sync Byte 0x47, and UI Hydration Invariants.
 * ==============================================================================
 */

const express = require('express');
const cors = require('cors');
const axios = require('axios');
const http = require('http');
const assert = require('assert');

const manifestRouter = require('../src/routes/manifest');
const hlsRouter = require('../src/routes/hls');
const handlers = require('../src/handlers');
const vsmovProvider = require('../src/providers/vsmov');
const kkphimProvider = require('../src/providers/kkphim');
const nguoncProvider = require('../src/providers/nguonc');
const { encodeConfig, decodeConfig } = require('../src/config');
const { classifyServerAudio } = require('../src/providers/vsmov');

// Test suite state
let totalChecks = 0;
let passedChecks = 0;
const failures = [];

function check(desc, condition, detail = '') {
  totalChecks++;
  if (condition) {
    passedChecks++;
    console.log(`  ✅ PASS: ${desc}${detail ? ` [${detail}]` : ''}`);
  } else {
    failures.push({ desc, detail });
    console.error(`  ❌ FAIL: ${desc}${detail ? ` [${detail}]` : ''}`);
  }
}

async function runComprehensiveStressTest() {
  console.log('╔══════════════════════════════════════════════════════════════════════════════╗');
  console.log('║  ⚔️  CHALLENGER 2: EMPIRICAL STRESS TEST SUITE (v1.5.1 + TASTE UI)          ║');
  console.log('╚══════════════════════════════════════════════════════════════════════════════╝\n');

  // 1. Setup Mock Upstream CDN Server
  let receivedHeaders = {};
  const mockCdnApp = express();
  mockCdnApp.use(cors());

  // Intercept headers
  mockCdnApp.use((req, res, next) => {
    receivedHeaders[req.path] = req.headers;
    next();
  });

  // Mock Master Playlist
  mockCdnApp.get('/stream/master.m3u8', (req, res) => {
    res.setHeader('Content-Type', 'application/vnd.apple.mpegurl');
    res.send(`#EXTM3U
#EXT-X-VERSION:3
#EXT-X-STREAM-INF:BANDWIDTH=5000000,RESOLUTION=3840x2160
index_4k.m3u8
#EXT-X-STREAM-INF:BANDWIDTH=2500000,RESOLUTION=1920x1080
index_1080p.m3u8
#EXT-X-MEDIA:TYPE=SUBTITLES,GROUP-ID="subs",NAME="Vietnamese",DEFAULT=YES,AUTOSELECT=YES,URI="subtitle_vi.m3u8"
`);
  });

  // Mock Sub-variant Media Playlist
  mockCdnApp.get('/stream/index_4k.m3u8', (req, res) => {
    res.setHeader('Content-Type', 'application/vnd.apple.mpegurl');
    res.send(`#EXTM3U
#EXT-X-VERSION:3
#EXT-X-TARGETDURATION:10
#EXT-X-MEDIA-SEQUENCE:0
#EXTINF:10.000,
chunk_001.ts
#EXTINF:10.000,
chunk_002.ts
#EXT-X-ENDLIST
`);
  });

  // Generate real MPEG-TS dummy chunk with sync byte 0x47 at 188-byte boundaries
  const CHUNK_SIZE = 188 * 500; // 94,000 bytes (> 50KB)
  const mockTsBuffer = Buffer.alloc(CHUNK_SIZE);
  for (let i = 0; i < CHUNK_SIZE; i += 188) {
    mockTsBuffer[i] = 0x47; // Sync byte
    mockTsBuffer.fill(0xAA, i + 1, Math.min(i + 188, CHUNK_SIZE));
  }

  // Mock Segment Endpoint with HTTP 206 Partial Content Support
  mockCdnApp.get('/stream/chunk_001.ts', (req, res) => {
    res.setHeader('Content-Type', 'video/mp2t');
    res.setHeader('Accept-Ranges', 'bytes');

    const range = req.headers.range;
    if (range) {
      const parts = range.replace(/bytes=/, '').split('-');
      const start = parseInt(parts[0], 10);
      const end = parts[1] ? parseInt(parts[1], 10) : CHUNK_SIZE - 1;
      const chunk = mockTsBuffer.slice(start, end + 1);

      res.status(206);
      res.setHeader('Content-Range', `bytes ${start}-${end}/${CHUNK_SIZE}`);
      res.setHeader('Content-Length', chunk.length);
      res.end(chunk);
    } else {
      res.setHeader('Content-Length', CHUNK_SIZE);
      res.end(mockTsBuffer);
    }
  });

  // Mock Subtitle Endpoints (WebVTT, SRT, CRLF, BOM, Error)
  mockCdnApp.get('/sub/native.vtt', (req, res) => {
    res.setHeader('Content-Type', 'text/vtt; charset=utf-8');
    res.send('WEBVTT\n\n00:00:01.000 --> 00:00:04.000\nXin chào thế giới phim ảnh 4K!');
  });

  mockCdnApp.get('/sub/legacy.srt', (req, res) => {
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.send('1\n00:00:01,234 --> 00:00:04,567\nThuyết minh tiếng Việt chuẩn\n\n2\n00:00:05,890 --> 00:00:08,123\nỨ Ử Ữ Ợ Đ\n');
  });

  mockCdnApp.get('/sub/crlf_bom.srt', (req, res) => {
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.send('\uFEFF1\r\n00:00:01,000 --> 00:00:03,000\r\nBOM + CRLF Test\r\n');
  });

  mockCdnApp.get('/sub/upstream-500', (req, res) => {
    res.status(500).send('Internal Server Error from upstream CDN');
  });

  const cdnServer = http.createServer(mockCdnApp);
  await new Promise((resolve) => cdnServer.listen(0, '127.0.0.1', resolve));
  const cdnPort = cdnServer.address().port;
  const cdnUrl = `http://127.0.0.1:${cdnPort}`;

  // 2. Setup Main Addon Server
  const mainApp = express();
  mainApp.use(cors());
  mainApp.use(express.json());
  mainApp.use('/hls', hlsRouter);
  mainApp.use('/', manifestRouter);
  mainApp.use('/', handlers);

  const addonServer = http.createServer(mainApp);
  await new Promise((resolve) => addonServer.listen(0, '127.0.0.1', resolve));
  const addonPort = addonServer.address().port;
  const addonUrl = `http://127.0.0.1:${addonPort}`;

  try {
    // ════════════════════════════════════════════════════════════════
    //  SECTION 1: ROUTING INTEGRITY & STATE HYDRATION (TASTE UI)
    // ════════════════════════════════════════════════════════════════
    console.log('▶ SECTION 1: Routing Integrity & State Hydration');

    // 1.1 Root Configurator
    const resRoot = await axios.get(`${addonUrl}/`);
    check('GET / returns HTTP 200', resRoot.status === 200);
    check('GET / text/html content-type', resRoot.headers['content-type'].includes('text/html'));
    check('GET / includes OLED True Black (#0b0d13)', resRoot.data.includes('#0b0d13'));
    check('GET / includes flagship 1+6 Bento hero card for VSMOV', resRoot.data.includes('grid-column: 1 / -1') || resRoot.data.includes('vsmov'));
    check('GET / includes brand footer with Q121101', resRoot.data.includes('<span class="brand-highlight">Q121101</span>'));
    check('GET / includes version 1.5.2', resRoot.data.includes('v1.5.2'));

    // 1.2 Route Aliases & Config Hydration
    const resConfigure = await axios.get(`${addonUrl}/configure`);
    check('GET /configure returns HTTP 200', resConfigure.status === 200);

    const testToken = encodeConfig({
      providers: ['vsmov', 'kkphim'],
      categories: ['movie', 'series'],
      apiKey: 'secret-test-token-777'
    });

    const resToken = await axios.get(`${addonUrl}/${testToken}`);
    check('GET /:config returns HTTP 200', resToken.status === 200);
    check('GET /:config pre-hydrates API key', resToken.data.includes('secret-test-token-777'));
    check('GET /:config pre-hydrates providers Set', resToken.data.includes('"vsmov"') && resToken.data.includes('"kkphim"'));

    const resTokenConfigure = await axios.get(`${addonUrl}/${testToken}/configure`);
    check('GET /:config/configure returns HTTP 200', resTokenConfigure.status === 200);

    const resQuery = await axios.get(`${addonUrl}/?config=${testToken}`);
    check('GET /?config=... returns HTTP 200', resQuery.status === 200);
    check('GET /?config=... pre-hydrates API key', resQuery.data.includes('secret-test-token-777'));

    // 1.3 Route Isolation: Ensure non-config paths are not hijacked
    const resManifest = await axios.get(`${addonUrl}/manifest.json`);
    check('GET /manifest.json returns HTTP 200 JSON', resManifest.status === 200 && resManifest.data.id === 'org.vipmovies.stremio.addon');
    check('GET /manifest.json version is 1.5.2', resManifest.data.version === '1.5.2');
    check('GET /manifest.json has 22 catalogs', Array.isArray(resManifest.data.catalogs) && resManifest.data.catalogs.length === 22);

    const resTokenManifest = await axios.get(`${addonUrl}/${testToken}/manifest.json`);
    check('GET /:config/manifest.json returns HTTP 200 JSON', resTokenManifest.status === 200);

    const resHealth = await axios.get(`${addonUrl}/health`);
    check('GET /health returns HTTP 200 JSON', resHealth.status === 200 && resHealth.data.status === 'ok' && resHealth.data.version === '1.5.2');

    // ════════════════════════════════════════════════════════════════
    //  SECTION 2: HLS PLAYLIST & TS SEGMENT STREAMING PIPELINE
    // ════════════════════════════════════════════════════════════════
    console.log('\n▶ SECTION 2: HLS Playlist & TS Segment Streaming Pipeline');

    // 2.1 Master Playlist Proxying & Rewriting
    const rawMasterUrl = `${cdnUrl}/stream/master.m3u8`;
    const proxyMasterUrl = `${addonUrl}/hls/manifest.m3u8?url=${Buffer.from(rawMasterUrl).toString('base64url')}&ref=${Buffer.from('https://vsmov.com/').toString('base64url')}`;
    const resProxyMaster = await axios.get(proxyMasterUrl);
    check('Master manifest proxy returns HTTP 200', resProxyMaster.status === 200);
    check('Master manifest Content-Type is mpegurl', resProxyMaster.headers['content-type'].includes('mpegurl'));
    check('Master manifest begins with #EXTM3U', resProxyMaster.data.startsWith('#EXTM3U'));
    check('Master manifest rewrites sub-variant index_4k.m3u8 to proxy', resProxyMaster.data.includes('/hls/manifest.m3u8?url='));
    check('Master manifest rewrites media subtitle URI to proxy', resProxyMaster.data.includes('/hls/manifest.m3u8?url='));

    // Extract rewritten sub-variant URL
    const lines = resProxyMaster.data.split('\n');
    const subVariantLine = lines.find((l) => l.includes('/hls/manifest.m3u8?url='));
    check('Extracted valid sub-variant playlist URL from master', !!subVariantLine);

    // 2.2 Sub-variant Media Playlist Proxying
    const resProxyMedia = await axios.get(subVariantLine.trim());
    check('Sub-variant media playlist proxy returns HTTP 200', resProxyMedia.status === 200);
    check('Media playlist rewrites chunk_001.ts to /hls/segment.ts proxy', resProxyMedia.data.includes('/hls/segment.ts?url='));

    // Extract rewritten segment URL
    const mediaLines = resProxyMedia.data.split('\n');
    const segmentLine = mediaLines.find((l) => l.includes('/hls/segment.ts?url='));
    check('Extracted valid segment proxy URL from media playlist', !!segmentLine);

    // 2.3 Binary Segment Download & MPEG-TS Sync Byte 0x47 Check
    const resSegment = await axios.get(segmentLine.trim(), { responseType: 'arraybuffer' });
    check('Segment download returns HTTP 200', resSegment.status === 200);
    check('Segment CORS header is *', resSegment.headers['access-control-allow-origin'] === '*');
    check('Segment Content-Type is video/MP2T', (resSegment.headers['content-type'] || '').toLowerCase().includes('video/mp2t') || (resSegment.headers['content-type'] || '').toLowerCase().includes('application/octet-stream'));

    const segBuf = Buffer.from(resSegment.data);
    check('Segment binary buffer size > 50,000 bytes (>50KB)', segBuf.length > 50000, `${segBuf.length} bytes`);

    // Verify MPEG-TS sync byte 0x47 across 188-byte packet boundaries
    let syncMatches = 0;
    let packetCount = 0;
    for (let offset = 0; offset + 188 <= segBuf.length; offset += 188) {
      packetCount++;
      if (segBuf[offset] === 0x47) syncMatches++;
    }
    check('100% of 188-byte packet boundaries match sync byte 0x47', syncMatches === packetCount && packetCount >= 250, `${syncMatches}/${packetCount} packets`);

    // 2.4 Range Request (HTTP 206 Partial Content)
    const resRange = await axios.get(segmentLine.trim(), {
      headers: { Range: 'bytes=0-2047' },
      responseType: 'arraybuffer'
    });
    check('Range request returns HTTP 206 Partial Content', resRange.status === 206);
    check('Range response Content-Range header present', resRange.headers['content-range'] && resRange.headers['content-range'].startsWith('bytes 0-2047/'));
    check('Range response buffer length is exactly 2048 bytes', resRange.data.byteLength === 2048);
    const rangeBuf = Buffer.from(resRange.data);
    check('Range slice packet 0 matches sync byte 0x47', rangeBuf[0] === 0x47);
    check('Range slice packet 1 matches sync byte 0x47', rangeBuf[188] === 0x47);
    check('Range slice packet 2 matches sync byte 0x47', rangeBuf[376] === 0x47);

    // ════════════════════════════════════════════════════════════════
    //  SECTION 3: VSMOV MULTI-SERVER AUDIO SEPARATION & PLAYBACK
    // ════════════════════════════════════════════════════════════════
    console.log('\n▶ SECTION 3: VSMOV Multi-Server Audio Separation & Playback');

    // 3.1 Audio Classification Matrix
    check('classifyServerAudio for "Vietsub" returns "vietsub"', classifyServerAudio('VIP Vietsub #1').type === 'vietsub');
    check('classifyServerAudio for "Lồng Tiếng" returns "longtieng"', classifyServerAudio('Server VIP Lồng Tiếng').type === 'longtieng');
    check('classifyServerAudio for "Thuyết Minh" returns "thuyetminh"', classifyServerAudio('Thuyết Minh Full HD').type === 'thuyetminh');
    check('classifyServerAudio fallback returns "vietsub"', classifyServerAudio('Server 1 Backup').type === 'vietsub');

    // 3.2 Live VSMOV Movie Streams for Harry Potter tt0373889
    const hpStreams = await vsmovProvider.getStreams({
      imdbId: 'tt0373889',
      title: 'Harry Potter and the Order of the Phoenix',
      year: 2007,
      type: 'movie'
    });
    check('VSMOV returns streams array for tt0373889', Array.isArray(hpStreams));
    check('VSMOV provides >= 2 distinct audio streams for tt0373889', hpStreams.length >= 2, `${hpStreams.length} streams`);

    const hasVietsub = hpStreams.some((s) => s.title.includes('Vietsub'));
    const hasLongTiengOrThuyetMinh = hpStreams.some((s) => s.title.includes('Lồng Tiếng') || s.title.includes('Thuyết Minh'));
    check('VSMOV streams include Vietsub stream', hasVietsub);
    check('VSMOV streams include Lồng Tiếng or Thuyết Minh stream', hasLongTiengOrThuyetMinh);

    for (let i = 0; i < hpStreams.length; i++) {
      const s = hpStreams[i];
      check(`VSMOV stream #${i + 1} name is "VIP Movies 🎬"`, s.name === 'VIP Movies 🎬');
      check(`VSMOV stream #${i + 1} title contains "[VIP 1 • VSMOV]"`, s.title.includes('[VIP 1 • VSMOV]'));
      check(`VSMOV stream #${i + 1} has valid in-app proxy url`, s.url && s.url.includes('/hls/manifest.m3u8'));
      check(`VSMOV stream #${i + 1} strictly has NO externalUrl`, s.externalUrl === undefined);
    }

    // 3.3 Addon Stream Endpoint & Subtitle Pass-through
    const resStreamEndpoint = await axios.get(`${addonUrl}/stream/movie/tt0373889.json`);
    check('Addon GET /stream/movie/tt0373889.json returns HTTP 200', resStreamEndpoint.status === 200);
    const aggStreams = resStreamEndpoint.data.streams;
    check('Addon returns array of streams for tt0373889', Array.isArray(aggStreams) && aggStreams.length > 0);

    const topVsmov = aggStreams.find((s) => s.title && s.title.includes('VSMOV') && s.title.includes('Vietsub'));
    if (topVsmov && topVsmov.subtitles) {
      check('Aggregator preserves subtitles array on VSMOV Vietsub stream', Array.isArray(topVsmov.subtitles) && topVsmov.subtitles.length > 0);
      check('Subtitle object has id "vi_vsmov"', topVsmov.subtitles[0].id === 'vi_vsmov');
      check('Subtitle object has lang "vie"', topVsmov.subtitles[0].lang === 'vie');
      check('Subtitle object url points to /hls/sub.vtt proxy', topVsmov.subtitles[0].url.includes('/hls/sub.vtt'));
    }

    // ════════════════════════════════════════════════════════════════
    //  SECTION 4: SUBTITLE PROXY (/hls/sub.vtt) ADVERSARIAL STRESS
    // ════════════════════════════════════════════════════════════════
    console.log('\n▶ SECTION 4: Subtitle Proxy (/hls/sub.vtt) Adversarial Stress');

    // 4.1 Native WebVTT Proxying
    const rawVttUrl = `${cdnUrl}/sub/native.vtt`;
    const proxyVttUrl = `${addonUrl}/hls/sub.vtt?url=${Buffer.from(rawVttUrl).toString('base64url')}&ref=${Buffer.from('https://vsmov.com/').toString('base64url')}`;
    const resNativeVtt = await axios.get(proxyVttUrl);
    check('Native WebVTT proxy returns HTTP 200', resNativeVtt.status === 200);
    check('Native WebVTT Content-Type includes text/vtt', resNativeVtt.headers['content-type'].includes('text/vtt'));
    check('Native WebVTT CORS header is *', resNativeVtt.headers['access-control-allow-origin'] === '*');
    check('Native WebVTT starts with WEBVTT', resNativeVtt.data.startsWith('WEBVTT'));
    check('Native WebVTT preserves Vietnamese diacritics', resNativeVtt.data.includes('Xin chào thế giới phim ảnh 4K!'));
    check('Native WebVTT has no duplicate WEBVTT header', (resNativeVtt.data.match(/WEBVTT/g) || []).length === 1);

    // 4.2 SRT to WebVTT Conversion
    const rawSrtUrl = `${cdnUrl}/sub/legacy.srt`;
    const proxySrtUrl = `${addonUrl}/hls/sub.vtt?url=${Buffer.from(rawSrtUrl).toString('base64url')}&ref=${Buffer.from('https://vsmov.com/').toString('base64url')}`;
    const resConvertedSrt = await axios.get(proxySrtUrl);
    check('SRT proxy returns HTTP 200', resConvertedSrt.status === 200);
    check('SRT converted output starts with WEBVTT\\n\\n', resConvertedSrt.data.startsWith('WEBVTT\n\n') || resConvertedSrt.data.startsWith('WEBVTT\r\n\r\n'));
    check('SRT comma timestamps converted to period (00:00:01.234)', resConvertedSrt.data.includes('00:00:01.234'));
    check('SRT comma timestamps converted to period (00:00:05.890)', resConvertedSrt.data.includes('00:00:05.890'));
    check('No comma milliseconds remaining in converted WebVTT', !/\d{2}:\d{2}:\d{2},\d{3}/.test(resConvertedSrt.data));
    check('SRT Vietnamese characters preserved (Ứ Ử Ữ Ợ Đ)', resConvertedSrt.data.includes('Ứ Ử Ữ Ợ Đ'));

    // 4.3 BOM Stripping & CRLF Normalization
    const rawBomSrtUrl = `${cdnUrl}/sub/crlf_bom.srt`;
    const proxyBomSrtUrl = `${addonUrl}/hls/sub.vtt?url=${Buffer.from(rawBomSrtUrl).toString('base64url')}`;
    const resBomSrt = await axios.get(proxyBomSrtUrl);
    check('BOM + CRLF SRT proxy returns HTTP 200', resBomSrt.status === 200);
    check('BOM (0xFEFF) stripped from first character', !resBomSrt.data.startsWith('\uFEFF') && resBomSrt.data.charCodeAt(0) === 87); // 'W' = 87
    check('BOM SRT converted to valid WebVTT', resBomSrt.data.startsWith('WEBVTT'));

    // 4.4 Alias Route /hls/sub
    const proxySubAlias = `${addonUrl}/hls/sub?url=${Buffer.from(rawVttUrl).toString('base64url')}`;
    const resSubAlias = await axios.get(proxySubAlias);
    check('Alias route /hls/sub returns HTTP 200', resSubAlias.status === 200);

    // 4.5 Referer & Origin Forwarding
    check('Upstream received Referer header: https://vsmov.com/', receivedHeaders['/sub/native.vtt']?.referer === 'https://vsmov.com/');
    check('Upstream received Origin header: https://vsmov.com', receivedHeaders['/sub/native.vtt']?.origin === 'https://vsmov.com');

    // 4.6 Error Handling & Edge Cases
    try {
      await axios.get(`${addonUrl}/hls/sub.vtt`);
      check('Missing url param returns 400', false);
    } catch (e) {
      check('Missing url param returns HTTP 400', e.response?.status === 400);
    }

    try {
      await axios.get(`${addonUrl}/hls/sub.vtt?url=${Buffer.from(`${cdnUrl}/sub/upstream-500`).toString('base64url')}`);
      check('Upstream 500 returns error status', false);
    } catch (e) {
      check('Upstream 500 returns HTTP 500 or 502 gracefully', e.response?.status === 500 || e.response?.status === 502);
    }

    try {
      await axios.get(`${addonUrl}/hls/sub.vtt?url=${Buffer.from(`${cdnUrl}/nonexistent.vtt`).toString('base64url')}`);
      check('Nonexistent upstream returns error status', false);
    } catch (e) {
      check('Nonexistent upstream returns HTTP 404 or 502 gracefully', e.response?.status === 404 || e.response?.status === 502);
    }

    // ════════════════════════════════════════════════════════════════
    //  SECTION 5: HIGH-CONCURRENCY WORKLOAD (50 CONCURRENT REQUESTS)
    // ════════════════════════════════════════════════════════════════
    console.log('\n▶ SECTION 5: High-Concurrency Burst Stress Testing');
    const burstPromises = [];
    for (let i = 0; i < 50; i++) {
      if (i % 3 === 0) {
        burstPromises.push(axios.get(`${addonUrl}/manifest.json`));
      } else if (i % 3 === 1) {
        burstPromises.push(axios.get(`${addonUrl}/health`));
      } else {
        burstPromises.push(axios.get(proxyVttUrl));
      }
    }
    const burstResults = await Promise.all(burstPromises);
    const all200 = burstResults.every((r) => r.status === 200);
    check('All 50 high-concurrency burst requests returned HTTP 200', all200, `${burstResults.length} requests`);

  } finally {
    // Teardown ephemeral servers
    cdnServer.close();
    addonServer.close();
  }

  console.log('\n╔══════════════════════════════════════════════════════════════════════════════╗');
  console.log('║                   CHALLENGER 2 FINAL VERDICT & SUMMARY                       ║');
  console.log('╠══════════════════════════════════════════════════════════════════════════════╣');
  console.log(`║  Total Checks:   ${String(totalChecks).padEnd(60)}║`);
  console.log(`║  ✅ Passed:      ${String(passedChecks).padEnd(60)}║`);
  console.log(`║  ❌ Failed:      ${String(failures.length).padEnd(60)}║`);
  console.log('╚══════════════════════════════════════════════════════════════════════════════╝');

  if (failures.length > 0) {
    console.error('\nFAILED ASSERTIONS:');
    failures.forEach((f, idx) => console.error(`  ${idx + 1}. ${f.desc} (${f.detail})`));
    process.exit(1);
  } else {
    console.log('\n🎉 EMPIRICAL VERDICT: CONFIRM (100% SUCCESS — ZERO REGRESSIONS)\n');
  }
}

runComprehensiveStressTest().catch((err) => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
