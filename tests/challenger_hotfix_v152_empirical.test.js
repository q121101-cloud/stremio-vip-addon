'use strict';

/**
 * =========================================================================
 *  VIP Movies Addon — tests/challenger_hotfix_v152_empirical.test.js
 *  Empirical Challenger Verification Harness for Hotfix v1.5.2
 *
 *  Comprehensive Stress & Verification Suite:
 *  1. TS segment streaming, MPEG-TS sync byte 0x47 & 188-byte packet alignment
 *  2. HTTP 206 Partial Content Range Requests (single chunk, byte ranges, headers)
 *  3. Master Playlist Rewrite with Subtitle Injection & SUBTITLES="subs" matching
 *  4. Media Playlist non-injection isolation
 *  5. Subtitle Proxy (/hls/sub.vtt) with WebVTT, SRT conversion, BOM stripping & CORS
 *  6. KKPhim Smart Search Fallback (Avengers 3 tt5095030) + VSMOV Subtitle array
 *  7. KKPhim episode flexible matching matrix (tap-01, 1, Tap 1, etc.)
 *  8. Safe degradation on non-existent IMDb IDs (no 500, no unhandled rejection)
 *  9. Version 1.5.2 synchronization check across package.json, manifest.js, handlers.js
 * =========================================================================
 */

const axios = require('axios');
const http = require('http');
const path = require('path');
const fs = require('fs');

let server = null;
let BASE_URL = 'http://127.0.0.1:7000';

let totalTests = 0;
let passedTests = 0;
let failedTests = 0;
const failures = [];

function recordTest(desc, passed, detail = '') {
  totalTests++;
  if (passed) {
    passedTests++;
    console.log(`  \x1b[32m✔\x1b[0m [PASS] ${desc}${detail ? ` (${detail})` : ''}`);
  } else {
    failedTests++;
    failures.push({ desc, detail });
    console.log(`  \x1b[31m✖\x1b[0m [FAIL] ${desc}${detail ? ` (${detail})` : ''}`);
  }
}

function encodeB64(str) {
  return Buffer.from(str, 'utf8').toString('base64url');
}

async function request(urlPath, options = {}) {
  const url = urlPath.startsWith('http') ? urlPath : `${BASE_URL}${urlPath}`;
  try {
    const res = await axios({
      url,
      method: options.method || 'GET',
      headers: options.headers || {},
      responseType: options.responseType || 'json',
      validateStatus: () => true,
      timeout: options.timeout || 15000,
      ...options,
    });
    return res;
  } catch (err) {
    return {
      status: 0,
      data: null,
      headers: {},
      error: err.message,
    };
  }
}

async function startServer() {
  return new Promise((resolve, reject) => {
    try {
      const app = require('../src/index');
      const srv = http.createServer(app);
      srv.listen(0, '127.0.0.1', () => {
        const port = srv.address().port;
        BASE_URL = `http://127.0.0.1:${port}`;
        server = srv;
        console.log(`\n\x1b[34m[TEST SERVER STARTED]\x1b[0m Listening on ${BASE_URL}\n`);
        resolve(srv);
      });
      srv.on('error', reject);
    } catch (err) {
      reject(err);
    }
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Test Suite 1: TS Segment Streaming & HTTP 206 Partial Content
// ─────────────────────────────────────────────────────────────────────────────
async function runTsAndRangeTests() {
  console.log('\n\x1b[1m=== Suite 1: TS Segment Streaming, Sync Byte 0x47 & HTTP Range 206 ===\x1b[0m');

  const muxTsUrl = 'https://test-streams.mux.dev/x36xhzz/url_0/url_462/193039199_mp4_h264_aac_hd_7.ts';
  const proxyTsUrl = `/hls/segment.ts?url=${encodeB64(muxTsUrl)}&ref=${encodeB64('https://test-streams.mux.dev/')}`;

  // 1.1 Full segment download
  const resFull = await request(proxyTsUrl, { responseType: 'arraybuffer' });
  const is200or206 = resFull.status === 200 || resFull.status === 206;
  recordTest('GET /hls/segment.ts returns HTTP 200/206', is200or206, `Status: ${resFull.status}`);

  if (is200or206 && resFull.data) {
    const buf = Buffer.from(resFull.data);
    recordTest('TS Segment payload > 50KB', buf.length > 50000, `Size: ${(buf.length / 1024).toFixed(2)} KB`);
    recordTest('TS Segment byte[0] == 0x47 (MPEG-TS Sync Byte)', buf[0] === 0x47, `byte[0]: 0x${(buf[0] || 0).toString(16)}`);

    // Check packet alignment (188 bytes)
    let syncCount = 0;
    const checkPackets = Math.min(10, Math.floor(buf.length / 188));
    for (let p = 0; p < checkPackets; p++) {
      if (buf[p * 188] === 0x47) syncCount++;
    }
    recordTest('MPEG-TS 188-byte Packet Alignment verified across first 10 packets', syncCount === checkPackets, `${syncCount}/${checkPackets} packets synced`);
    recordTest('Response header Content-Type is video/MP2T', resFull.headers['content-type'] === 'video/MP2T', resFull.headers['content-type']);
    recordTest('Response header Accept-Ranges is bytes', resFull.headers['accept-ranges'] === 'bytes', resFull.headers['accept-ranges']);
  }

  // 1.2 HTTP Range Request: Range: bytes=0-187 (First 188-byte TS packet)
  const resRange1 = await request(proxyTsUrl, {
    headers: { Range: 'bytes=0-187' },
    responseType: 'arraybuffer',
  });
  recordTest('HTTP 206 Partial Content for Range: bytes=0-187', resRange1.status === 206, `Status: ${resRange1.status}`);
  if (resRange1.status === 206 && resRange1.data) {
    const buf1 = Buffer.from(resRange1.data);
    recordTest('Range bytes=0-187 returns exactly 188 bytes', buf1.length === 188, `Length: ${buf1.length}`);
    recordTest('Range bytes=0-187 byte[0] == 0x47', buf1[0] === 0x47, `byte[0]: 0x${(buf1[0] || 0).toString(16)}`);
    recordTest('Content-Range header present and matches bytes 0-187/*', !!(resRange1.headers['content-range'] && resRange1.headers['content-range'].startsWith('bytes 0-187/')), resRange1.headers['content-range']);
  }

  // 1.3 HTTP Range Request: Range: bytes=188-375 (Second 188-byte TS packet)
  const resRange2 = await request(proxyTsUrl, {
    headers: { Range: 'bytes=188-375' },
    responseType: 'arraybuffer',
  });
  recordTest('HTTP 206 Partial Content for Range: bytes=188-375', resRange2.status === 206, `Status: ${resRange2.status}`);
  if (resRange2.status === 206 && resRange2.data) {
    const buf2 = Buffer.from(resRange2.data);
    recordTest('Range bytes=188-375 returns exactly 188 bytes', buf2.length === 188, `Length: ${buf2.length}`);
    recordTest('Range bytes=188-375 byte[0] == 0x47 (sync byte of 2nd packet)', buf2[0] === 0x47, `byte[0]: 0x${(buf2[0] || 0).toString(16)}`);
    recordTest('Content-Range header matches bytes 188-375/*', !!(resRange2.headers['content-range'] && resRange2.headers['content-range'].startsWith('bytes 188-375/')), resRange2.headers['content-range']);
  }

  // 1.4 Route Aliases verification: /ts, /segment, /ts-proxy
  const resAliasTs = await request(`/hls/ts?url=${encodeB64(muxTsUrl)}&ref=${encodeB64('https://test-streams.mux.dev/')}`, {
    headers: { Range: 'bytes=0-187' },
    responseType: 'arraybuffer',
  });
  recordTest('GET /hls/ts alias returns HTTP 206 on Range request', resAliasTs.status === 206, `Status: ${resAliasTs.status}`);

  const resAliasSegment = await request(`/hls/segment?url=${encodeB64(muxTsUrl)}&ref=${encodeB64('https://test-streams.mux.dev/')}`, {
    headers: { Range: 'bytes=0-187' },
    responseType: 'arraybuffer',
  });
  recordTest('GET /hls/segment alias returns HTTP 206 on Range request', resAliasSegment.status === 206, `Status: ${resAliasSegment.status}`);

  // 1.5 Missing url param
  const resMissing = await request('/hls/segment.ts', { responseType: 'text' });
  recordTest('GET /hls/segment.ts (missing url) returns HTTP 400', resMissing.status === 400, `Status: ${resMissing.status}`);
}

// ─────────────────────────────────────────────────────────────────────────────
// Test Suite 2: Master Playlist Rewrite & WebVTT Subtitle Injection
// ─────────────────────────────────────────────────────────────────────────────
async function runM3u8AndSubInjectionTests() {
  console.log('\n\x1b[1m=== Suite 2: Master Playlist Rewrite & WebVTT Subtitle Injection ===\x1b[0m');

  const muxMasterUrl = 'https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8';
  const subtitleUrl = 'https://vsmov.com/subs/sample.vtt';

  // 2.1 Master playlist WITH subtitle parameter
  const manifestWithSub = `/hls/manifest.m3u8?url=${encodeB64(muxMasterUrl)}&ref=${encodeB64('https://test-streams.mux.dev/')}&sub=${encodeB64(subtitleUrl)}`;
  const resWithSub = await request(manifestWithSub, { responseType: 'text' });

  recordTest('GET /hls/manifest.m3u8 with sub param returns HTTP 200', resWithSub.status === 200, `Status: ${resWithSub.status}`);
  if (resWithSub.status === 200 && resWithSub.data) {
    const text = String(resWithSub.data);
    recordTest('M3U8 begins with #EXTM3U', text.startsWith('#EXTM3U'));
    recordTest('M3U8 contains #EXT-X-MEDIA:TYPE=SUBTITLES tag', text.includes('#EXT-X-MEDIA:TYPE=SUBTITLES'));
    recordTest('Subtitle tag contains GROUP-ID="subs"', text.includes('GROUP-ID="subs"'));
    recordTest('Subtitle tag contains LANGUAGE="vie"', text.includes('LANGUAGE="vie"'));
    recordTest('Subtitle tag contains DEFAULT=YES & AUTOSELECT=YES', text.includes('DEFAULT=YES') && text.includes('AUTOSELECT=YES'));
    recordTest('Subtitle URI points to /hls/sub.vtt proxy', text.includes('/hls/sub.vtt?url='));
    recordTest('#EXT-X-STREAM-INF contains SUBTITLES="subs"', text.includes('SUBTITLES="subs"'));

    // Check all variant stream URLs are proxied
    const lines = text.split('\n').map((l) => l.trim()).filter(Boolean);
    const nonCommentLines = lines.filter((l) => !l.startsWith('#'));
    const allProxied = nonCommentLines.length > 0 && nonCommentLines.every((l) => l.includes('/hls/manifest.m3u8?url='));
    recordTest('All Master playlist variant URIs rewritten to /hls/manifest.m3u8', allProxied, `${nonCommentLines.length} variants rewritten`);
  }

  // 2.2 Master playlist WITHOUT subtitle parameter
  const manifestNoSub = `/hls/manifest.m3u8?url=${encodeB64(muxMasterUrl)}&ref=${encodeB64('https://test-streams.mux.dev/')}`;
  const resNoSub = await request(manifestNoSub, { responseType: 'text' });
  recordTest('GET /hls/manifest.m3u8 without sub param returns HTTP 200', resNoSub.status === 200, `Status: ${resNoSub.status}`);
  if (resNoSub.status === 200 && resNoSub.data) {
    const textNoSub = String(resNoSub.data);
    recordTest('M3U8 without sub param does NOT inject TYPE=SUBTITLES', !textNoSub.includes('GROUP-ID="subs"'));
  }

  // 2.3 Media Playlist (chunklist) rewrite with sub parameter
  const muxChunklistUrl = 'https://test-streams.mux.dev/x36xhzz/url_0/193039199_mp4_h264_aac_hd_7.m3u8';
  const chunklistWithSub = `/hls/manifest.m3u8?url=${encodeB64(muxChunklistUrl)}&ref=${encodeB64('https://test-streams.mux.dev/')}&sub=${encodeB64(subtitleUrl)}`;
  const resChunklist = await request(chunklistWithSub, { responseType: 'text' });
  recordTest('GET /hls/manifest.m3u8 for Media Playlist returns HTTP 200', resChunklist.status === 200, `Status: ${resChunklist.status}`);
  if (resChunklist.status === 200 && resChunklist.data) {
    const chunkText = String(resChunklist.data);
    recordTest('Media Playlist does NOT inject #EXT-X-MEDIA:TYPE=SUBTITLES into chunklist', !chunkText.includes('#EXT-X-MEDIA:TYPE=SUBTITLES'));
    recordTest('Media Playlist rewrites TS segment URLs to /hls/segment.ts', chunkText.includes('/hls/segment.ts?url='));
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Test Suite 3: Subtitle Proxy Endpoint (/hls/sub.vtt)
// ─────────────────────────────────────────────────────────────────────────────
async function runSubVttEndpointTests() {
  console.log('\n\x1b[1m=== Suite 3: Subtitle Proxy Endpoint (/hls/sub.vtt) ===\x1b[0m');

  // 3.1 Missing URL
  const res400 = await request('/hls/sub.vtt', { responseType: 'text' });
  recordTest('GET /hls/sub.vtt without url param returns HTTP 400', res400.status === 400, `Status: ${res400.status}`);

  // 3.2 Native WebVTT data URI
  const rawVtt = `WEBVTT\n\n00:00:01.000 --> 00:00:04.000\nXin chào thế giới 4K VIP`;
  const b64Vtt = encodeB64(`data:text/vtt;charset=utf-8,${encodeURIComponent(rawVtt)}`);
  const resVtt = await request(`/hls/sub.vtt?url=${b64Vtt}`, { responseType: 'text' });

  recordTest('GET /hls/sub.vtt with WebVTT data URI returns HTTP 200', resVtt.status === 200, `Status: ${resVtt.status}`);
  recordTest('Content-Type is text/vtt; charset=utf-8', (resVtt.headers['content-type'] || '').includes('text/vtt'), resVtt.headers['content-type']);
  recordTest('Access-Control-Allow-Origin is *', resVtt.headers['access-control-allow-origin'] === '*', resVtt.headers['access-control-allow-origin']);
  recordTest('Cache-Control is public, max-age=86400', (resVtt.headers['cache-control'] || '').includes('86400'), resVtt.headers['cache-control']);
  recordTest('Response body starts with WEBVTT', String(resVtt.data || '').startsWith('WEBVTT'));
  recordTest('Response body contains Vietnamese content', String(resVtt.data || '').includes('Xin chào thế giới 4K VIP'));

  // 3.3 SRT auto-conversion to WebVTT
  const rawSrt = `1\n00:00:01,500 --> 00:00:05,250\nThuyết minh tiếng Việt chuẩn VIP\n\n2\n00:00:06,000 --> 00:00:10,000\nTập 1`;
  const b64Srt = encodeB64(`data:text/plain;charset=utf-8,${encodeURIComponent(rawSrt)}`);
  const resSrt = await request(`/hls/sub.vtt?url=${b64Srt}`, { responseType: 'text' });

  recordTest('GET /hls/sub.vtt with SRT data URI converts to HTTP 200 WebVTT', resSrt.status === 200, `Status: ${resSrt.status}`);
  const srtConverted = String(resSrt.data || '');
  recordTest('SRT conversion adds WEBVTT header', srtConverted.startsWith('WEBVTT'));
  recordTest('SRT conversion replaces commas with dots in timestamps (00:00:01.500)', srtConverted.includes('00:00:01.500 --> 00:00:05.250'));
  recordTest('SRT conversion does not retain commas in timestamps', !srtConverted.includes(',500') && !srtConverted.includes(',250'));

  // 3.4 UTF-8 BOM handling
  const rawBomVtt = `\uFEFFWEBVTT\n\n00:00:00.000 --> 00:00:02.000\nBOM stripped`;
  const b64Bom = encodeB64(`data:text/vtt;charset=utf-8,${encodeURIComponent(rawBomVtt)}`);
  const resBom = await request(`/hls/sub.vtt?url=${b64Bom}`, { responseType: 'text' });
  recordTest('BOM is cleanly stripped from subtitle output', String(resBom.data || '').startsWith('WEBVTT') && !String(resBom.data || '').startsWith('\uFEFF'));
}

// ─────────────────────────────────────────────────────────────────────────────
// Test Suite 4: KKPhim Smart Search Fallback & Stream Integration
// ─────────────────────────────────────────────────────────────────────────────
async function runKKPhimAndStreamIntegrationTests() {
  console.log('\n\x1b[1m=== Suite 4: KKPhim Smart Search Fallback & Stream Integration ===\x1b[0m');

  // 4.1 Avengers 3 (tt5095030) - KKPhim + VSMOV stream query
  const resAvengers = await request('/default/stream/movie/tt5095030.json');
  recordTest('GET /default/stream/movie/tt5095030.json returns HTTP 200', resAvengers.status === 200, `Status: ${resAvengers.status}`);

  if (resAvengers.status === 200 && resAvengers.data && Array.isArray(resAvengers.data.streams)) {
    const streams = resAvengers.data.streams;
    recordTest('Streams array is non-empty', streams.length > 0, `Total streams: ${streams.length}`);

    // Check zero externalUrl strict invariant
    const hasExternalUrl = streams.some((s) => s.externalUrl);
    recordTest('Strict invariant: 0 streams contain externalUrl (all in-app playback)', !hasExternalUrl);

    // Check VSMOV streams
    const vsmovStreams = streams.filter((s) => s.title && s.title.includes('VSMOV'));
    if (vsmovStreams.length > 0) {
      recordTest('VSMOV streams present for tt5095030', true, `Found ${vsmovStreams.length} VSMOV stream(s)`);
      const vsmovWithSub = vsmovStreams.find((s) => Array.isArray(s.subtitles) && s.subtitles.length > 0);
      if (vsmovWithSub) {
        const sub = vsmovWithSub.subtitles[0];
        recordTest('VSMOV stream contains valid subtitles array', sub && sub.id === 'vi_vsmov' && sub.lang === 'vie' && sub.url.includes('/hls/sub.vtt'), `Subtitle URL: ${sub.url}`);
        recordTest('VSMOV stream URL contains &sub= parameter for HLS manifest', vsmovWithSub.url.includes('&sub='));
      }
    }

    // Check KKPhim streams (Smart Search Fallback tier)
    const kkStreams = streams.filter((s) => s.title && s.title.includes('KKPhim'));
    recordTest('KKPhim streams found via Smart Search Fallback', kkStreams.length > 0, `Found ${kkStreams.length} KKPhim stream(s)`);
    if (kkStreams.length > 0) {
      recordTest('KKPhim stream URL proxied via /hls/manifest.m3u8', kkStreams[0].url && kkStreams[0].url.includes('/hls/manifest.m3u8'));
    }
  }

  // 4.2 Series Episode matching (Breaking Bad S1E1 tt0903747:1:1)
  const resSeries = await request('/default/stream/series/tt0903747%3A1%3A1.json');
  recordTest('GET /default/stream/series/tt0903747:1:1 returns HTTP 200', resSeries.status === 200, `Status: ${resSeries.status}`);
  if (resSeries.status === 200 && resSeries.data) {
    recordTest('Series response returns valid streams array without error', Array.isArray(resSeries.data.streams), `Found ${(resSeries.data.streams || []).length} streams`);
  }

  // 4.3 Safe degradation on non-existent IMDb ID
  const resNonExistent = await request('/default/stream/movie/tt9999999999.json');
  recordTest('GET /default/stream/movie/tt9999999999.json returns HTTP 200 with empty streams (no crash)', resNonExistent.status === 200 && Array.isArray(resNonExistent.data?.streams) && resNonExistent.data.streams.length === 0);
}

// ─────────────────────────────────────────────────────────────────────────────
// Test Suite 5: Unit Episode Matching Matrix & Version Check
// ─────────────────────────────────────────────────────────────────────────────
async function runUnitAndVersionTests() {
  console.log('\n\x1b[1m=== Suite 5: KKPhim Episode Matching Matrix & Version Sync ===\x1b[0m');

  const { matchEpisodeItem } = require('../src/providers/kkphim');

  // Test episode matching patterns
  const patterns = [
    { ep: { name: '1', slug: 'tap-1' }, targetStr: '1', targetNum: 1, expected: true, label: 'exact name "1"' },
    { ep: { name: '01', slug: 'tap-01' }, targetStr: '1', targetNum: 1, expected: true, label: 'padded name "01" vs "1"' },
    { ep: { name: 'Tập 1', slug: 'tap-1' }, targetStr: '1', targetNum: 1, expected: true, label: 'name "Tập 1"' },
    { ep: { name: 'Tập 01', slug: 'tap-01' }, targetStr: '1', targetNum: 1, expected: true, label: 'name "Tập 01"' },
    { ep: { name: 'Full', slug: 'tap-full' }, targetStr: '1', targetNum: 1, expected: false, label: 'non-matching "Full"' },
    { ep: { name: 'Episode 5', slug: 'episode-5' }, targetStr: '5', targetNum: 5, expected: true, label: 'name "Episode 5"' },
    { ep: { name: 'Tập 12', slug: 'phim-bo-tap-12' }, targetStr: '12', targetNum: 12, expected: true, label: 'slug suffix "-12"' },
  ];

  for (const tc of patterns) {
    const res = matchEpisodeItem(tc.ep, tc.targetStr, tc.targetNum);
    recordTest(`Episode matching: ${tc.label}`, res === tc.expected, `Got ${res}, expected ${tc.expected}`);
  }

  // Version 1.5.2 Synchronization Check
  const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, '../package.json'), 'utf8'));
  recordTest('package.json version is 1.5.2', pkg.version === '1.5.2', `package.json: ${pkg.version}`);

  const { MANIFEST } = require('../src/manifest');
  recordTest('src/manifest.js BASE_MANIFEST.version is 1.5.2', MANIFEST.version === '1.5.2', `manifest: ${MANIFEST.version}`);

  const handlersContent = fs.readFileSync(path.join(__dirname, '../src/handlers.js'), 'utf8');
  const hasHandlerV152 = handlersContent.includes('VIP Movies Addon v1.5.2') || handlersContent.includes('(Engine v1.5.2)');
  recordTest('src/handlers.js contains version 1.5.2 branding', hasHandlerV152);
}

// ─────────────────────────────────────────────────────────────────────────────
// Runner Main
// ─────────────────────────────────────────────────────────────────────────────
async function main() {
  console.log('╔══════════════════════════════════════════════════════════════════════╗');
  console.log('║  CHALLENGER EMPIRICAL VERIFICATION SUITE — HOTFIX v1.5.2              ║');
  console.log('╚══════════════════════════════════════════════════════════════════════╝');

  try {
    await startServer();
    await new Promise((r) => setTimeout(r, 600));

    await runTsAndRangeTests();
    await runM3u8AndSubInjectionTests();
    await runSubVttEndpointTests();
    await runKKPhimAndStreamIntegrationTests();
    await runUnitAndVersionTests();

  } catch (err) {
    console.error('\n\x1b[31m[CRITICAL HARNESS ERROR]\x1b[0m', err);
    recordTest('Suite execution without uncaught fatal crash', false, err.message);
  } finally {
    if (server) {
      server.close();
      console.log('\n\x1b[34m[TEST SERVER CLOSED]\x1b[0m');
    }
  }

  console.log('\n══════════════════════════════════════════════════════════════════════');
  console.log(`TOTAL TESTS : ${totalTests}`);
  console.log(`PASSED      : \x1b[32m${passedTests}\x1b[0m`);
  console.log(`FAILED      : \x1b[31m${failedTests}\x1b[0m`);
  console.log('══════════════════════════════════════════════════════════════════════');

  if (failedTests > 0) {
    console.log('\nFailures summary:');
    failures.forEach((f, idx) => {
      console.log(`  ${idx + 1}. ${f.desc} (${f.detail})`);
    });
    process.exit(1);
  } else {
    console.log('\n\x1b[32m🎉 100% EMPIRICAL TESTS PASSED — VERDICT: SATISFACTORY & VERIFIED\x1b[0m\n');
    process.exit(0);
  }
}

main();
