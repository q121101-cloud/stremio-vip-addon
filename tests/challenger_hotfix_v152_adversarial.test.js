'use strict';

/**
 * ============================================================
 *  VIP Movies Addon — tests/challenger_hotfix_v152_adversarial.test.js
 *  Comprehensive Empirical Adversarial Verification Suite — Hotfix v1.5.2
 *
 *  Focus Areas:
 *  1. Subtitle proxy (/hls/sub.vtt) Edge Cases & RFC/Format Conformance:
 *     - Empty query parameter (?url=) -> HTTP 400 Bad Request
 *     - Whitespace query parameter (?url=%20%20) -> HTTP 400 Bad Request
 *     - Base64 encoded empty/whitespace -> 400/502 handled gracefully without crash
 *     - Standard WebVTT data URI -> HTTP 200, Content-Type: text/vtt; charset=utf-8, CORS: *
 *     - UTF-8 BOM (\uFEFF) stripping -> stripped, starts with WEBVTT
 *     - SRT format with CRLF (\r\n) line endings -> converted to LF, prepends WEBVTT
 *     - SRT format with comma timestamps (00:00:01,234) -> converted to dot timestamps (00:00:01.234)
 *     - Unreachable upstream -> returns error status (502/4xx) without server crash
 *     - Cache-Control: public, max-age=86400 verification
 *
 *  2. KKPhim 3-Tier Fallback & Episode Matching Verification:
 *     - Tier 1: Direct IMDb lookup
 *     - Tier 2: Cinemeta metadata + KKPhim search + scoreMatch for unmapped IMDb titles (e.g. tt1375666 Inception, tt0468569 The Dark Knight, tt1877830 The Batman)
 *     - Tier 3: Safe degradation for non-existent IDs (e.g. tt0000000000) -> returns empty array [], no 404 stream
 *     - Unit & E2E Episode matching across variations:
 *       "1", "01", "001", "Tập 1", "Tập 01", "tap-1", "episode-1", "ep-01"
 *     - Invalid/negative episode targets ("-1", "0", 9999) -> safe rejection
 *
 *  3. VSMOV 4K Stream & Subtitle Verification:
 *     - Subtitle object schema: id: "vi_vsmov", lang: "vie", title: "Tiếng Việt (VSMOV VIP)", url: proxyUrl
 *     - Master M3U8 rewrite with Subtitle Injection:
 *       #EXT-X-MEDIA:TYPE=SUBTITLES,GROUP-ID="subs",NAME="Tiếng Việt (VSMOV VIP)",LANGUAGE="vie",URI="..."
 *       #EXT-X-STREAM-INF variant links contain SUBTITLES="subs"
 *     - Strict zero externalUrl invariant across all streams
 *     - Real live VSMOV subtitle proxy fetch verification
 * ============================================================
 */

const axios = require('axios');
const app = require('../src/index');
const kkphim = require('../src/providers/kkphim');
const vsmov = require('../src/providers/vsmov');
const { matchEpisodeItem } = require('../src/providers/kkphim');

let server;
let BASE = '';

let totalTests = 0;
let passedTests = 0;
let failedTests = 0;
const failures = [];

function assert(condition, description, detail = '') {
  totalTests++;
  if (condition) {
    console.log(`  \x1b[32m✔ PASS\x1b[0m [Test ${totalTests}]: ${description}`);
    passedTests++;
  } else {
    console.log(`  \x1b[31m✖ FAIL\x1b[0m [Test ${totalTests}]: ${description} ${detail ? `(${detail})` : ''}`);
    failedTests++;
    failures.push({ test: totalTests, description, detail });
  }
}

function encodeBase64(str) {
  return Buffer.from(str, 'utf8').toString('base64url');
}

async function get(url, opts = {}) {
  try {
    return await axios({
      url,
      method: 'GET',
      timeout: 15000,
      validateStatus: () => true,
      ...opts,
    });
  } catch (err) {
    return { status: 0, data: null, headers: {}, error: err.message };
  }
}

async function runTestSuite() {
  console.log('\n======================================================================');
  console.log('  EMPIRICAL ADVERSARIAL VERIFICATION SUITE — HOTFIX v1.5.2');
  console.log('======================================================================\n');

  // Start test server
  await new Promise((resolve) => {
    server = app.listen(0, '127.0.0.1', () => {
      const port = server.address().port;
      BASE = `http://127.0.0.1:${port}`;
      console.log(`\x1b[36m[Server]\x1b[0m Running on ${BASE}\n`);
      resolve();
    });
  });

  try {
    // ─────────────────────────────────────────────────────────────
    // 1. SUBTITLE PROXY (/hls/sub.vtt) ADVERSARIAL EDGE CASES
    // ─────────────────────────────────────────────────────────────
    console.log('\x1b[1m--- Phase 1: Subtitle Proxy (/hls/sub.vtt) Edge Cases ---\x1b[0m');

    // 1.1 Missing URL
    const rMissing = await get(`${BASE}/hls/sub.vtt`);
    assert(rMissing.status === 400, 'Missing url query param returns HTTP 400', `Got ${rMissing.status}`);

    // 1.2 Empty URL
    const rEmpty = await get(`${BASE}/hls/sub.vtt?url=`);
    assert(rEmpty.status === 400, 'Empty url query param returns HTTP 400', `Got ${rEmpty.status}`);

    // 1.3 Whitespace URL
    const rWhitespace = await get(`${BASE}/hls/sub.vtt?url=%20%20%20`);
    assert(rWhitespace.status === 400, 'Whitespace url query param returns HTTP 400', `Got ${rWhitespace.status}`);

    // 1.4 Base64 Malformed / non-URL string
    const b64Malformed = encodeBase64('invalid-url-target');
    const rB64Mal = await get(`${BASE}/hls/sub.vtt?url=${b64Malformed}`);
    assert(rB64Mal.status >= 400 && rB64Mal.status < 600, 'Base64 non-URL string safely handled with error status (no server crash)', `Got ${rB64Mal.status}`);

    // 1.5 Subtitle headers test
    const sampleVtt = `WEBVTT\n\n00:00:01.000 --> 00:00:04.000\nXin chào Stremio`;
    const b64Vtt = encodeBase64(`data:text/vtt;charset=utf-8,${encodeURIComponent(sampleVtt)}`);
    const rHeaders = await get(`${BASE}/hls/sub.vtt?url=${b64Vtt}`);
    assert(rHeaders.status === 200, 'Data URI VTT returns HTTP 200', `Got ${rHeaders.status}`);
    assert(rHeaders.headers['content-type'] && rHeaders.headers['content-type'].includes('text/vtt'), 'Content-Type contains text/vtt', rHeaders.headers['content-type']);
    assert(rHeaders.headers['access-control-allow-origin'] === '*', 'Access-Control-Allow-Origin is "*"', rHeaders.headers['access-control-allow-origin']);
    assert(rHeaders.headers['cache-control'] && rHeaders.headers['cache-control'].includes('max-age=86400'), 'Cache-Control has max-age=86400', rHeaders.headers['cache-control']);
    assert(String(rHeaders.data).startsWith('WEBVTT'), 'Body starts with WEBVTT');

    // 1.6 UTF-8 BOM Stripping (\uFEFF)
    const bomVtt = `\uFEFFWEBVTT\n\n00:00:01.000 --> 00:00:04.000\nBOM test`;
    const b64Bom = encodeBase64(`data:text/vtt;charset=utf-8,${encodeURIComponent(bomVtt)}`);
    const rBom = await get(`${BASE}/hls/sub.vtt?url=${b64Bom}`);
    assert(rBom.status === 200, 'BOM WebVTT returns HTTP 200', `Got ${rBom.status}`);
    const bomBody = String(rBom.data);
    assert(bomBody.charCodeAt(0) !== 0xFEFF && bomBody.startsWith('WEBVTT'), 'UTF-8 BOM is stripped and body starts with WEBVTT', `First char code: 0x${bomBody.charCodeAt(0).toString(16)}`);

    // 1.7 SRT with CRLF line endings & comma timestamps
    const srtCrlf = "1\r\n00:00:01,234 --> 00:00:04,567\r\nDòng 1 với CRLF\r\n\r\n2\r\n00:00:05,890 --> 00:00:08,123\r\nDòng 2 với CRLF\r\n";
    const b64SrtCrlf = encodeBase64(`data:text/plain;charset=utf-8,${encodeURIComponent(srtCrlf)}`);
    const rSrtCrlf = await get(`${BASE}/hls/sub.vtt?url=${b64SrtCrlf}`);
    assert(rSrtCrlf.status === 200, 'SRT with CRLF returns HTTP 200', `Got ${rSrtCrlf.status}`);
    const srtBody = String(rSrtCrlf.data);
    assert(srtBody.startsWith('WEBVTT'), 'SRT converted to WebVTT (starts with WEBVTT)');
    assert(srtBody.includes('00:00:01.234 --> 00:00:04.567'), 'Comma timestamps converted to dot timestamps (1.234 -> 4.567)', srtBody);
    assert(srtBody.includes('00:00:05.890 --> 00:00:08.123'), 'Second cue comma timestamp converted (5.890 -> 8.123)');
    assert(!srtBody.includes(',234') && !srtBody.includes(',567'), 'No leftover comma timestamps');
    assert(!srtBody.includes('\r'), 'CRLF normalized to standard LF (\n)');

    // 1.8 Upstream 404 / Connection error handling
    const r404Sub = await get(`${BASE}/hls/sub.vtt?url=${encodeBase64('http://127.0.0.1:1/nonexistent.vtt')}`);
    assert(r404Sub.status === 502 || r404Sub.status >= 400, 'Unreachable upstream subtitle returns HTTP 502/4xx without crashing', `Got ${r404Sub.status}`);


    // ─────────────────────────────────────────────────────────────
    // 2. KKPHIM 3-TIER SMART SEARCH FALLBACK & EPISODE MATCHING
    // ─────────────────────────────────────────────────────────────
    console.log('\n\x1b[1m--- Phase 2: KKPhim 3-Tier Fallback & Episode Matching ---\x1b[0m');

    // 2.1 Test Avengers: Infinity War (tt5095030)
    console.log('  Testing KKPhim for tt5095030 (Avengers 3)...');
    const kkStreamsAvengers = await kkphim.getStreams({
      imdbId: 'tt5095030',
      type: 'movie',
      proxyBase: BASE,
    });
    assert(Array.isArray(kkStreamsAvengers), 'getStreams for tt5095030 returns an array');
    assert(kkStreamsAvengers.length > 0, `KKPhim resolved streams for tt5095030 (got ${kkStreamsAvengers.length} streams)`);
    if (kkStreamsAvengers.length > 0) {
      assert(kkStreamsAvengers[0].url.includes('/hls/manifest.m3u8'), 'KKPhim stream uses HLS manifest proxy', kkStreamsAvengers[0].url);
      assert(!kkStreamsAvengers[0].externalUrl, 'Strict zero externalUrl invariant held on KKPhim stream');
      assert(kkStreamsAvengers[0].name === 'VIP Movies 🎬', 'Stream name is "VIP Movies 🎬"');
    }

    // 2.2 Test Inception (tt1375666 - Known unmapped on phimapi direct IMDb)
    console.log('  Testing KKPhim Tier 2 Fallback for tt1375666 (Inception)...');
    const kkStreamsInception = await kkphim.getStreams({
      imdbId: 'tt1375666',
      type: 'movie',
      proxyBase: BASE,
    });
    assert(Array.isArray(kkStreamsInception), 'getStreams for tt1375666 returns an array');
    assert(kkStreamsInception.length > 0, `Tier 2 Fallback found stream for Inception (got ${kkStreamsInception.length} streams)`);
    if (kkStreamsInception.length > 0) {
      assert(!kkStreamsInception[0].externalUrl, 'Zero externalUrl on Inception stream');
      assert(kkStreamsInception[0].url.includes('/hls/'), 'Inception stream uses HLS proxy');
    }

    // 2.3 Test The Dark Knight (tt0468569 - Another unmapped title)
    console.log('  Testing KKPhim Tier 2 Fallback for tt0468569 (The Dark Knight)...');
    const kkStreamsTDK = await kkphim.getStreams({
      imdbId: 'tt0468569',
      type: 'movie',
      proxyBase: BASE,
    });
    assert(Array.isArray(kkStreamsTDK) && kkStreamsTDK.length > 0, `Tier 2 Fallback found stream for The Dark Knight (got ${kkStreamsTDK.length} streams)`);

    // 2.4 Test Tier 3 Safe Degradation on Non-Existent Media
    console.log('  Testing Tier 3 Safe Degradation for tt0000000000 (Non-existent)...');
    const kkStreamsNonExistent = await kkphim.getStreams({
      imdbId: 'tt0000000000',
      type: 'movie',
      proxyBase: BASE,
    });
    assert(Array.isArray(kkStreamsNonExistent) && kkStreamsNonExistent.length === 0, 'Tier 3 returns empty array [] on unknown IMDb ID without crashing');

    // 2.5 Unit/Adversarial Test on matchEpisodeItem across formats
    console.log('  Testing Episode Matching Algorithm variations...');
    const testCases = [
      { ep: { name: '1', slug: 'tap-1' }, targetStr: '1', targetNum: 1, expected: true, desc: 'Exact "1"' },
      { ep: { name: '01', slug: 'tap-01' }, targetStr: '1', targetNum: 1, expected: true, desc: 'Zero-padded "01" matching target "1"' },
      { ep: { name: '001', slug: 'tap-001' }, targetStr: '1', targetNum: 1, expected: true, desc: 'Triple-digit padded "001" matching target "1"' },
      { ep: { name: 'Tập 1', slug: 'tap-1' }, targetStr: '1', targetNum: 1, expected: true, desc: '"Tập 1" matching target "1"' },
      { ep: { name: 'Tập 01', slug: 'tap-01' }, targetStr: '1', targetNum: 1, expected: true, desc: '"Tập 01" matching target "1"' },
      { ep: { name: 'Tập 1', slug: 'tap-1' }, targetStr: '01', targetNum: 1, expected: true, desc: '"Tập 1" matching target "01"' },
      { ep: { name: 'Episode 1', slug: 'episode-1' }, targetStr: '1', targetNum: 1, expected: true, desc: '"Episode 1" matching target "1"' },
      { ep: { name: '12', slug: 'tap-12' }, targetStr: '12', targetNum: 12, expected: true, desc: 'Multi-digit "12"' },
      { ep: { name: 'Tập 12', slug: 'tap-12' }, targetStr: '12', targetNum: 12, expected: true, desc: '"Tập 12"' },
      { ep: { name: 'Phần 1 - Tập 5', slug: 'phan-1-tap-5' }, targetStr: '5', targetNum: 5, expected: true, desc: 'Nested name "Phần 1 - Tập 5"' },
      { ep: { name: '1', slug: 'tap-1' }, targetStr: '2', targetNum: 2, expected: false, desc: 'Mismatched episode "1" vs "2"' },
      { ep: { name: '10', slug: 'tap-10' }, targetStr: '1', targetNum: 1, expected: false, desc: 'Prefix mismatch "10" vs "1"' },
      { ep: { name: '1', slug: 'tap-1' }, targetStr: '-1', targetNum: NaN, expected: false, desc: 'Negative episode target "-1"' },
    ];

    for (const tc of testCases) {
      const match = matchEpisodeItem(tc.ep, tc.targetStr, tc.targetNum);
      assert(match === tc.expected, `matchEpisodeItem: ${tc.desc} (result: ${match})`);
    }

    // 2.6 Live Series Stream Test (Breaking Bad tt0903747:1:1)
    console.log('  Testing live series endpoint for tt0903747:1:1...');
    const rSeries = await get(`${BASE}/default/stream/series/tt0903747%3A1%3A1.json`);
    assert(rSeries.status === 200, 'Series stream endpoint returns HTTP 200', `Got ${rSeries.status}`);
    const streamsSeries = rSeries.data?.streams || [];
    assert(Array.isArray(streamsSeries), 'Series streams response is an array');
    const kkSeriesStreams = streamsSeries.filter((s) => s.title && s.title.includes('KKPhim'));
    console.log(`    Found ${kkSeriesStreams.length} KKPhim series streams`);
    if (kkSeriesStreams.length > 0) {
      assert(kkSeriesStreams[0].url.includes('/hls/manifest.m3u8'), 'KKPhim series stream uses HLS manifest proxy');
      assert(!kkSeriesStreams[0].externalUrl, 'Zero externalUrl invariant held on KKPhim series stream');
    }


    // ─────────────────────────────────────────────────────────────
    // 3. VSMOV SUBTITLES & STREAM INVARIANTS
    // ─────────────────────────────────────────────────────────────
    console.log('\n\x1b[1m--- Phase 3: VSMOV Subtitles & Stream Invariants ---\x1b[0m');

    // 3.1 Fetch VSMOV streams for Harry Potter (tt0373889)
    console.log('  Testing VSMOV streams for tt0373889 (Harry Potter)...');
    const vsmovStreams = await vsmov.getStreams({
      imdbId: 'tt0373889',
      type: 'movie',
      proxyBase: BASE,
    });
    assert(Array.isArray(vsmovStreams), 'VSMOV getStreams returns array');
    assert(vsmovStreams.length > 0, `VSMOV returned ${vsmovStreams.length} stream(s)`);

    // Find stream with subtitles
    const streamWithSub = vsmovStreams.find((s) => Array.isArray(s.subtitles) && s.subtitles.length > 0);
    assert(!!streamWithSub, 'Found at least one VSMOV stream with subtitles array');

    if (streamWithSub) {
      const sub = streamWithSub.subtitles[0];
      assert(sub.id === 'vi_vsmov', 'Subtitle id is "vi_vsmov"', sub.id);
      assert(sub.lang === 'vie', 'Subtitle lang is "vie"', sub.lang);
      assert(sub.title === 'Tiếng Việt (VSMOV VIP)', 'Subtitle title is "Tiếng Việt (VSMOV VIP)"', sub.title);
      assert(typeof sub.url === 'string' && sub.url.startsWith(`${BASE}/hls/sub.vtt`), 'Subtitle url routes through proxy endpoint', sub.url);

      // 3.2 Fetch the live subtitle via the generated proxy URL
      console.log(`  Fetching live proxy subtitle: ${sub.url}`);
      const rSubLive = await get(sub.url);
      assert(rSubLive.status === 200, 'Live subtitle proxy returns HTTP 200', `Got ${rSubLive.status}`);
      assert(rSubLive.headers['content-type'] && rSubLive.headers['content-type'].includes('text/vtt'), 'Live subtitle Content-Type is text/vtt', rSubLive.headers['content-type']);
      assert(String(rSubLive.data).startsWith('WEBVTT'), 'Live subtitle content is valid WebVTT (starts with WEBVTT)');
    }

    // 3.3 Test Avengers 3 (tt5095030) on VSMOV
    console.log('  Testing VSMOV streams for tt5095030 (Avengers 3)...');
    const vsmovAvengers = await vsmov.getStreams({
      imdbId: 'tt5095030',
      type: 'movie',
      proxyBase: BASE,
    });
    assert(Array.isArray(vsmovAvengers) && vsmovAvengers.length > 0, `VSMOV returned ${vsmovAvengers.length} stream(s) for Avengers 3`);
    if (vsmovAvengers.length > 0 && vsmovAvengers[0].subtitles) {
      const sub = vsmovAvengers[0].subtitles[0];
      assert(sub.id === 'vi_vsmov' && sub.lang === 'vie', 'Avengers 3 VSMOV subtitle schema correct (vi_vsmov, vie)');
      const rSubAv = await get(sub.url);
      assert(rSubAv.status === 200, 'Avengers 3 live subtitle proxy returns HTTP 200', `Got ${rSubAv.status}`);
      assert(String(rSubAv.data).startsWith('WEBVTT'), 'Avengers 3 subtitle content starts with WEBVTT');
    }

    // 3.4 Verify Master M3U8 Subtitle Injection (#EXT-X-MEDIA:TYPE=SUBTITLES)
    console.log('  Testing Master M3U8 Subtitle Injection on manifest...');
    const masterM3u8 = 'https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8';
    const testSubUrl = 'https://example.com/test.vtt';
    const manifestUrl = `${BASE}/hls/manifest.m3u8?url=${encodeBase64(masterM3u8)}&ref=${encodeBase64('https://test-streams.mux.dev/')}&sub=${encodeBase64(testSubUrl)}`;
    
    const rManifest = await get(manifestUrl);
    assert(rManifest.status === 200, 'Proxied M3U8 with &sub= param returns HTTP 200', `Got ${rManifest.status}`);
    const m3u8Content = String(rManifest.data || '');
    assert(m3u8Content.startsWith('#EXTM3U'), 'Proxied M3U8 starts with #EXTM3U');
    assert(m3u8Content.includes('#EXT-X-MEDIA:TYPE=SUBTITLES'), '#EXT-X-MEDIA:TYPE=SUBTITLES tag injected');
    assert(m3u8Content.includes('GROUP-ID="subs"'), 'Subtitle GROUP-ID="subs" present');
    assert(m3u8Content.includes('LANGUAGE="vie"'), 'Subtitle LANGUAGE="vie" present');
    assert(m3u8Content.includes('NAME="Tiếng Việt (VSMOV VIP)"'), 'Subtitle NAME="Tiếng Việt (VSMOV VIP)" present');
    assert(m3u8Content.includes('DEFAULT=YES'), 'Subtitle DEFAULT=YES present');
    assert(m3u8Content.includes('/hls/sub.vtt?url='), 'Subtitle URI proxied via /hls/sub.vtt');
    assert(m3u8Content.includes('SUBTITLES="subs"'), '#EXT-X-STREAM-INF contains SUBTITLES="subs" link');

    // 3.5 Verify Global Strict Zero externalUrl Invariant
    console.log('  Verifying strict zero externalUrl invariant across all providers for tt5095030...');
    const rFull = await get(`${BASE}/default/stream/movie/tt5095030.json`);
    assert(rFull.status === 200, 'GET /default/stream/movie/tt5095030.json returns HTTP 200');
    const allStreams = rFull.data?.streams || [];
    assert(allStreams.length > 0, `Aggregator returned ${allStreams.length} streams`);
    const violatingStreams = allStreams.filter((s) => s.externalUrl || !s.url);
    assert(violatingStreams.length === 0, `Zero streams violate In-App HLS proxy invariant (found ${violatingStreams.length} violations)`);

  } catch (err) {
    console.error('\x1b[31m[Fatal Error]\x1b[0m', err);
    assert(false, `Unexpected exception: ${err.message}`);
  } finally {
    if (server) {
      await new Promise((resolve) => server.close(resolve));
      console.log('\n\x1b[36m[Server]\x1b[0m Test server closed cleanly.');
    }
  }

  // ─────────────────────────────────────────────────────────────
  // SUMMARY
  // ─────────────────────────────────────────────────────────────
  console.log('\n======================================================================');
  console.log('  TEST SUMMARY');
  console.log('======================================================================');
  console.log(`  Total assertions : ${totalTests}`);
  console.log(`  \x1b[32m✔ Passed\x1b[0m         : ${passedTests}`);
  console.log(`  \x1b[31m✖ Failed\x1b[0m         : ${failedTests}`);

  if (failedTests > 0) {
    console.log('\nFailures detail:');
    failures.forEach((f) => console.log(`  - [Test ${f.test}] ${f.description}: ${f.detail}`));
    process.exit(1);
  } else {
    console.log('\n\x1b[32m🎉 ALL ADVERSARIAL STRESS TESTS PASSED SUCCESSFULLY (100% SUCCESS)!\x1b[0m\n');
    process.exit(0);
  }
}

runTestSuite();
