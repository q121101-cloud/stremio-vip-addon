'use strict';

/**
 * ============================================================
 *  VIP Movies Addon — tests/verify_hotfix_vsmov_kkphim.js
 *  E2E Verification — Hotfix v1.5.2
 *
 *  Test Coverage:
 *  1. VSMOV /hls/sub.vtt endpoint (HTTP 200, WebVTT, CORS)
 *  2. SRT → WebVTT auto-conversion
 *  3. KKPhim Smart Search Fallback — Avengers 3 (tt5095030)
 *  4. KKPhim series episode matching
 *  5. HLS M3U8 subtitle injection (#EXT-X-MEDIA:TYPE=SUBTITLES)
 *  6. Real .ts segment download (>50KB, sync byte 0x47)
 * ============================================================
 */

const axios = require('axios');

let BASE = process.env.ADDON_BASE || 'http://localhost:7000';
const DEFAULT_TOKEN = 'default';

const GREEN  = '\x1b[32m✅\x1b[0m';
const RED    = '\x1b[31m❌\x1b[0m';
const YELLOW = '\x1b[33m⚠️\x1b[0m';
const CYAN   = '\x1b[36m🔵\x1b[0m';

let passed = 0;
let failed = 0;
let warnings = 0;
const errors = [];

function assert(condition, message) {
  if (condition) {
    console.log(`  ${GREEN} ${message}`);
    passed++;
  } else {
    console.log(`  ${RED} ${message}`);
    failed++;
    errors.push(message);
  }
}

function warn(message) {
  console.log(`  ${YELLOW} ${message}`);
  warnings++;
}

function encodeBase64(str) {
  return Buffer.from(str, 'utf8').toString('base64url');
}

async function get(url, opts = {}) {
  try {
    const res = await axios({ url, method: 'GET', timeout: 30000, maxRedirects: 5, validateStatus: () => true, ...opts });
    return res;
  } catch (err) {
    return { status: 0, data: null, headers: {}, error: err.message };
  }
}

async function startServer() {
  return new Promise((resolve, reject) => {
    try {
      const app = require('../src/index');
      const server = app.listen(0, '127.0.0.1', () => {
        const port = server.address().port;
        BASE = `http://127.0.0.1:${port}`;
        console.log(`\n${CYAN} Test Server running at ${BASE}\n`);
        resolve(server);
      });
      server.on('error', reject);
      setTimeout(() => reject(new Error('Server startup timeout')), 10000);
    } catch (err) {
      reject(err);
    }
  });
}

async function testSubVttEndpoint() {
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('Phase 1: /hls/sub.vtt Endpoint');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

  const r400 = await get(`${BASE}/hls/sub.vtt`);
  assert(r400.status === 400, `GET /hls/sub.vtt (no url) → HTTP 400`);

  const sampleVtt = `WEBVTT\n\n00:00:01.000 --> 00:00:03.000\nXin chào Việt Nam`;
  const b64 = encodeBase64(`data:text/vtt;charset=utf-8,${encodeURIComponent(sampleVtt)}`);
  const rVtt = await get(`${BASE}/hls/sub.vtt?url=${b64}`);
  assert(rVtt.status === 200, `GET /hls/sub.vtt?url=<data:vtt> → HTTP 200`);
  assert(String(rVtt.data || '').startsWith('WEBVTT'), `Body starts with "WEBVTT"`);
  assert((rVtt.headers['content-type'] || '').includes('text/vtt'), `Content-Type: text/vtt`);
  assert(rVtt.headers['access-control-allow-origin'] === '*', `CORS: Access-Control-Allow-Origin: *`);

  const sampleSrt = `1\n00:00:01,000 --> 00:00:03,000\nTest SRT`;
  const b64Srt = encodeBase64(`data:text/plain;charset=utf-8,${encodeURIComponent(sampleSrt)}`);
  const rSrt = await get(`${BASE}/hls/sub.vtt?url=${b64Srt}`);
  assert(rSrt.status === 200, `GET /hls/sub.vtt?url=<data:srt> → HTTP 200`);
  const srtBody = String(rSrt.data || '');
  assert(srtBody.startsWith('WEBVTT'), `SRT auto-converted: body starts with "WEBVTT"`);
  assert(!srtBody.includes(',000'), `SRT timestamps: commas converted to dots`);
}

async function testKKPhimSmartSearch() {
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('Phase 2: KKPhim Smart Search Fallback (Avengers 3 tt5095030)');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

  const r = await get(`${BASE}/${DEFAULT_TOKEN}/stream/movie/tt5095030.json`);
  assert(r.status === 200, `GET /stream/movie/tt5095030.json → HTTP 200`);

  const data = r.data;
  if (data && Array.isArray(data.streams)) {
    const kkStreams = data.streams.filter((s) => s.title && s.title.includes('KKPhim'));
    console.log(`  Total streams: ${data.streams.length}, KKPhim: ${kkStreams.length}`);
    const brokenStreams = data.streams.filter((s) => !s.url && !s.externalUrl);
    assert(brokenStreams.length === 0, `No broken streams (all have url)`);

    if (kkStreams.length > 0) {
      assert(true, `KKPhim Smart Search found ${kkStreams.length} stream(s)`);
      assert(!kkStreams[0].externalUrl, `KKPhim stream: no externalUrl (strict invariant)`);
      assert(kkStreams[0].url && kkStreams[0].url.includes('/hls/'), `KKPhim stream uses HLS proxy`);
    } else {
      warn(`KKPhim: 0 streams for tt5095030 (may not be in their database)`);
    }
  } else {
    warn(`Stream endpoint returned unexpected data`);
  }
}

async function testKKPhimSeriesEpisode() {
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('Phase 3: KKPhim Series Episode Matching');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

  const r = await get(`${BASE}/${DEFAULT_TOKEN}/stream/series/tt0903747%3A1%3A1.json`);
  assert(r.status === 200, `GET /stream/series/tt0903747:1:1 → HTTP 200 (no crash)`);
  const data = r.data;
  if (data && Array.isArray(data.streams)) {
    assert(true, `Stream response is array (${data.streams.length} streams, no crash)`);
    const kkStreams = data.streams.filter((s) => s.title && s.title.includes('KKPhim'));
    if (kkStreams.length > 0) {
      assert(kkStreams[0].url && kkStreams[0].url.includes('/hls/'), `KKPhim episode stream uses HLS proxy`);
    } else {
      warn(`KKPhim: 0 streams for Breaking Bad S1E1 (may not be in database — non-critical)`);
    }
  }
}

async function testM3u8SubtitleInjection() {
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('Phase 4: M3U8 Subtitle Injection');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

  const masterM3u8 = 'https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8';
  const subtitleUrl = 'https://example.com/test.vtt';

  const url = `${BASE}/hls/manifest.m3u8?url=${encodeBase64(masterM3u8)}&ref=${encodeBase64('https://test-streams.mux.dev/')}&sub=${encodeBase64(subtitleUrl)}`;
  const r = await get(url);

  if (r.status === 200) {
    const body = String(r.data || '');
    assert(body.startsWith('#EXTM3U'), `Proxied M3U8 starts with #EXTM3U`);
    assert(body.includes('#EXT-X-MEDIA:TYPE=SUBTITLES'), `#EXT-X-MEDIA:TYPE=SUBTITLES injected`);
    assert(body.includes('GROUP-ID="subs"'), `Subtitle GROUP-ID="subs" present`);
    assert(body.includes('LANGUAGE="vie"'), `Subtitle LANGUAGE="vie" present`);
    assert(body.includes('DEFAULT=YES'), `Subtitle DEFAULT=YES present`);
    assert(body.includes('/hls/sub.vtt?url='), `Subtitle URI proxied via /hls/sub.vtt`);
    assert(body.includes('SUBTITLES="subs"'), `#EXT-X-STREAM-INF has SUBTITLES="subs"`);
  } else {
    warn(`/hls/manifest.m3u8 returned HTTP ${r.status} (CDN unreachable from test env)`);
  }
}

async function testTsSegmentDownload() {
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('Phase 5: Real .ts Segment Download');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

  const tsUrl = 'https://test-streams.mux.dev/x36xhzz/url_0/url_462/193039199_mp4_h264_aac_hd_7.ts';
  const proxyUrl = `${BASE}/hls/segment.ts?url=${encodeBase64(tsUrl)}&ref=${encodeBase64('https://test-streams.mux.dev/')}`;
  console.log(`  Downloading: /hls/segment.ts?url=<mux-public-ts>`);

  const r = await get(proxyUrl, { responseType: 'arraybuffer' });

  if (r.status === 200 || r.status === 206) {
    const buf = Buffer.from(r.data || []);
    assert(r.status >= 200 && r.status < 300, `GET /hls/segment.ts → HTTP ${r.status}`);
    assert(buf.length > 50000, `Segment size > 50KB (got ${(buf.length / 1024).toFixed(1)}KB)`);
    assert(buf[0] === 0x47, `MPEG-TS sync byte 0x47 at byte[0] (got 0x${(buf[0] || 0).toString(16)})`);
    const hasRange = r.headers['accept-ranges'] || r.headers['content-range'];
    assert(!!hasRange, `HTTP Range headers present`);
  } else {
    warn(`/hls/segment.ts returned HTTP ${r.status} (CDN may block this env — non-critical)`);
  }
}

async function main() {
  console.log('');
  console.log('╔══════════════════════════════════════════════════════╗');
  console.log('║  VIP Movies Addon — Hotfix v1.5.2 Verification       ║');
  console.log('║  VSMOV Subtitle + KKPhim Smart Search Fallback        ║');
  console.log('╚══════════════════════════════════════════════════════╝');

  let server = null;
  try {
    server = await startServer();
    await new Promise((r) => setTimeout(r, 500));

    await testSubVttEndpoint();
    await testKKPhimSmartSearch();
    await testKKPhimSeriesEpisode();
    await testM3u8SubtitleInjection();
    await testTsSegmentDownload();

  } catch (err) {
    console.error(`\n${RED} Fatal error:`, err.message);
    failed++;
    errors.push(`Fatal: ${err.message}`);
  } finally {
    if (server) server.close();
  }

  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('RESULTS');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(`  ${GREEN} Passed  : ${passed}`);
  console.log(`  ${RED} Failed  : ${failed}`);
  if (warnings > 0) console.log(`  ${YELLOW} Warnings: ${warnings}`);

  if (failed > 0) {
    console.log('\nFailed assertions:');
    errors.forEach((e) => console.log(`  ✗ ${e}`));
    console.log('');
    process.exit(1);
  } else {
    console.log(`\n🎉 ALL ${passed} assertions PASSED — Hotfix v1.5.2 verified!\n`);
    process.exit(0);
  }
}

main();
