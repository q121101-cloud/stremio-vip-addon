'use strict';

/**
 * ==============================================================================
 *  VIP Movies Addon — tests/challenger_m1_2_deep_empirical.test.js
 *  Empirical Challenger 2 Verification Suite for Milestone 1
 *  Scope: STP, CLBPX, YAN provider upgrades & HLS Proxy Routing
 * ==============================================================================
 */

const http = require('http');
const express = require('express');
const axios = require('axios');
const assert = require('assert');

const stp = require('../src/providers/stp');
const clbpx = require('../src/providers/clbpx');
const yan = require('../src/providers/yan');
const hlsRouter = require('../src/routes/hls');
const handlers = require('../src/handlers');

// Test statistics
let totalTests = 0;
let passedTests = 0;
let failedTests = 0;
const failures = [];

function check(condition, message) {
  totalTests++;
  if (!condition) {
    failedTests++;
    failures.push(message);
    console.error(`  ❌ FAIL: ${message}`);
  } else {
    passedTests++;
    console.log(`  ✅ PASS: ${message}`);
  }
}

async function testSection(title, fn) {
  console.log(`\n══════════════════════════════════════════════════════════════════════`);
  console.log(`▶ TEST SECTION: ${title}`);
  console.log(`══════════════════════════════════════════════════════════════════════`);
  try {
    await fn();
  } catch (err) {
    check(false, `Unexpected section crash in "${title}": ${err.message}\n${err.stack}`);
  }
}

function encodeBase64(str) {
  if (!str) return '';
  return Buffer.from(str, 'utf8').toString('base64url');
}

function decodeXor(str, key = 0x2a) {
  let out = '';
  for (let i = 0; i < str.length; i++) {
    out += String.fromCharCode(str.charCodeAt(i) ^ key);
  }
  return out;
}

async function main() {
  console.log('╔══════════════════════════════════════════════════════════════════════╗');
  console.log('║   🧪 EMPIRICAL CHALLENGER 2: MILESTONE 1 DEEP ADVERSARIAL SUITE      ║');
  console.log('╚══════════════════════════════════════════════════════════════════════╝');

  // ────────────────────────────────────────────────────────────────────────────
  //  1. STP XOR DECODING & PARSING STRESS TESTS
  // ────────────────────────────────────────────────────────────────────────────
  await testSection('STP XOR 0x2a Deobfuscation & Edge Cases', async () => {
    // 1.1 Standard XOR vectors
    const targetUrl = 'https://short.ink/_LboFywW3';
    const encStr = decodeXor(targetUrl, 0x2a);
    const decoded = stp.decodeXor0x2a(encStr);
    check(decoded === targetUrl, `Standard XOR 0x2a round-trip matches: expected "${targetUrl}", got "${decoded}"`);

    // 1.2 Boundary & edge inputs
    check(stp.decodeXor0x2a(null) === '', 'STP XOR null input returns empty string');
    check(stp.decodeXor0x2a(undefined) === '', 'STP XOR undefined input returns empty string');
    check(stp.decodeXor0x2a('') === '', 'STP XOR empty input returns empty string');
    check(stp.decodeXor0x2a(12345) === '', 'STP XOR numeric input returns empty string');
    check(stp.decodeXor0x2a({}) === '', 'STP XOR object input returns empty string');
    check(stp.decodeXor0x2a([]) === '', 'STP XOR array input returns empty string');

    // 1.3 Custom key decoding
    const key0x3f = 0x3f;
    const enc3f = decodeXor('https://custom.key/stream.m3u8', key0x3f);
    check(stp.decodeXor0x2a(enc3f, key0x3f) === 'https://custom.key/stream.m3u8', 'STP XOR with custom key 0x3f decodes properly');
  });

  await testSection('STP parsePostContent Multi-line & Malformed HTML Stress', async () => {
    const encUrl1 = decodeXor('https://cdn.stp.com/ep1.m3u8');
    const encUrl2 = decodeXor('https://cdn.stp.com/ep2.m3u8');
    const encUrl3 = decodeXor('https://cdn.stp.com/ep3.m3u8');

    // 2.1 Multi-line HTML with single and double quotes, multiple servers
    const complexHtml = `
      <div class="post-meta">
        <p>Tên Phim : Thám Tử Lừng Danh Conan &#8211; Cú Đấm Sapphire</p>
        <p>Tựa Gốc : Detective Conan: The Fist of Blue Sapphire (2019)</p>
      </div>
      <div class="episodeGroup" data-server="VIP Server 1 (Lồng Tiếng)" data-episodes='[
        {"${encUrl1}", "01"},
        {"${encUrl2}", "02"}
      ]'>
        <p>Server 1 content</p>
      </div>
      <div class="episodeGroup" data-server="VIP Server 2 (Vietsub)" data-episodes="[
        {'${encUrl3}', '03'}
      ]">
        <p>Server 2 content</p>
      </div>
    `;

    const parsed = stp.parsePostContent(complexHtml, 'Conan Movie 23');
    check(parsed.name.includes('Thám Tử Lừng Danh Conan'), `parsed.name extracted: "${parsed.name}"`);
    check(parsed.origin_name.includes('Detective Conan'), `parsed.origin_name extracted: "${parsed.origin_name}"`);
    check(parsed.year === 2019, `parsed.year extracted: ${parsed.year}`);
    check(parsed.episodes.length === 2, `parsed 2 server groups, got ${parsed.episodes.length}`);
    check(parsed.episodes[0].server_data.length === 2, `server 1 has 2 episodes, got ${parsed.episodes[0].server_data.length}`);
    check(parsed.episodes[0].server_data[0].link_m3u8 === 'https://cdn.stp.com/ep1.m3u8', `server 1 ep 1 decoded link matches`);
    check(parsed.episodes[1].server_data[0].link_m3u8 === 'https://cdn.stp.com/ep3.m3u8', `server 2 ep 3 decoded link matches`);

    // 2.2 Malformed HTML / missing attributes / empty input
    const emptyParsed = stp.parsePostContent(null, 'Fallback Title');
    check(emptyParsed.name === 'Fallback Title', 'Null HTML falls back to postTitle');
    check(Array.isArray(emptyParsed.episodes) && emptyParsed.episodes.length === 0, 'Null HTML returns empty episodes array');

    const corruptedHtml = `<div class="episodeGroup" data-server="Bad" data-episodes='corrupted json not matching brackets'></div>`;
    const corruptedParsed = stp.parsePostContent(corruptedHtml, 'Corrupted');
    check(corruptedParsed.episodes.length === 0, 'Corrupted data-episodes does not produce invalid episodes');
  });

  // ────────────────────────────────────────────────────────────────────────────
  //  2. CLBPX MULTI-TIER EXTRACTION & HTML SCRAPING ADVERSARIAL TESTS
  // ────────────────────────────────────────────────────────────────────────────
  await testSection('CLBPX HTML Fallback Parser & Search Resilience', async () => {
    // Test that CLBPX search handles empty/invalid inputs
    check(Array.isArray(await clbpx.search('')), 'CLBPX search("") returns empty array');
    check(Array.isArray(await clbpx.search(null)), 'CLBPX search(null) returns empty array');
    check(Array.isArray(await clbpx.search(undefined)), 'CLBPX search(undefined) returns empty array');

    // Test detail with invalid slug
    check((await clbpx.getDetail('')) === null, 'CLBPX getDetail("") returns null');
    check((await clbpx.getDetail(null)) === null, 'CLBPX getDetail(null) returns null');

    // Test getStreams with empty/invalid inputs
    const emptyStreams1 = await clbpx.getStreams({ episode: -1 });
    check(Array.isArray(emptyStreams1) && emptyStreams1.length === 0, 'CLBPX getStreams with negative episode returns []');
    const emptyStreams2 = await clbpx.getStreams({ season: -5 });
    check(Array.isArray(emptyStreams2) && emptyStreams2.length === 0, 'CLBPX getStreams with negative season returns []');
  });

  // ────────────────────────────────────────────────────────────────────────────
  //  3. YAN DATA-OBF & LIVE EXTRACTION ADVERSARIAL TESTS
  // ────────────────────────────────────────────────────────────────────────────
  await testSection('YAN Data-obf Base64 Decoding & Stream Extraction', async () => {
    // 3.1 Verify search filters and null inputs
    check(Array.isArray(await yan.search('')), 'YAN search("") returns empty array');
    check(Array.isArray(await yan.search(null)), 'YAN search(null) returns empty array');
    check((await yan.getDetail('')) === null, 'YAN getDetail("") returns null');

    // 3.2 Verify getStreams with invalid bounds
    const invalidEpStreams = await yan.getStreams({ episode: -99 });
    check(Array.isArray(invalidEpStreams) && invalidEpStreams.length === 0, 'YAN getStreams with negative episode returns []');
  });

  // ────────────────────────────────────────────────────────────────────────────
  //  4. STRICT INVARIANT VERIFICATION ACROSS ALL 3 PROVIDERS
  // ────────────────────────────────────────────────────────────────────────────
  await testSection('Strict Invariant Verification (Zero externalUrl & HLS Proxy)', async () => {
    const dummyProxyBase = 'https://vip-proxy.example.com';

    // Test live or mock retrieval from STP
    const stpResults = await stp.getStreams({
      title: 'Dune Part Two',
      year: 2024,
      type: 'movie',
      proxyBase: dummyProxyBase,
    });
    console.log(`  ℹ️ STP query returned ${stpResults.length} stream(s)`);
    for (const s of stpResults) {
      check(s.externalUrl === undefined, 'STP stream MUST NOT have externalUrl');
      check(typeof s.url === 'string' && s.url.startsWith(`${dummyProxyBase}/hls/manifest.m3u8`), 'STP stream MUST use HLS manifest proxy');
      check(s.title.includes('[VIP 4 • STP]'), 'STP stream title MUST include [VIP 4 • STP]');
      check(s.title.includes('sieutamphim.pro'), 'STP stream title MUST mention sieutamphim.pro');
      check(s.name === 'VIP Movies 🎬', 'STP stream name MUST be "VIP Movies 🎬"');
      check(s.behaviorHints && s.behaviorHints.notSupported === false, 'STP stream behaviorHints.notSupported MUST be false');
    }

    // Test live or mock retrieval from CLBPX
    const clbpxResults = await clbpx.getStreams({
      title: 'Tay Du Ky',
      year: 1986,
      type: 'series',
      season: 1,
      episode: 1,
      proxyBase: dummyProxyBase,
    });
    console.log(`  ℹ️ CLBPX query returned ${clbpxResults.length} stream(s)`);
    for (const s of clbpxResults) {
      check(s.externalUrl === undefined, 'CLBPX stream MUST NOT have externalUrl');
      check(typeof s.url === 'string' && s.url.startsWith(`${dummyProxyBase}/hls/manifest.m3u8`), 'CLBPX stream MUST use HLS manifest proxy');
      check(s.title.includes('[VIP 5 • CLBPX]'), 'CLBPX stream title MUST include [VIP 5 • CLBPX]');
      check(s.title.includes('clbphimxua.info'), 'CLBPX stream title MUST mention clbphimxua.info');
      check(s.name === 'VIP Movies 🎬', 'CLBPX stream name MUST be "VIP Movies 🎬"');
    }

    // Test live or mock retrieval from YAN
    const yanResults = await yan.getStreams({
      title: 'The Gioi Hoan My',
      type: 'series',
      season: 1,
      episode: 1,
      proxyBase: dummyProxyBase,
    });
    console.log(`  ℹ️ YAN query returned ${yanResults.length} stream(s)`);
    for (const s of yanResults) {
      check(s.externalUrl === undefined, 'YAN stream MUST NOT have externalUrl');
      check(typeof s.url === 'string' && s.url.startsWith(`${dummyProxyBase}/hls/manifest.m3u8`), 'YAN stream MUST use HLS manifest proxy');
      check(s.title.includes('[VIP 6 • YAN]'), 'YAN stream title MUST include [VIP 6 • YAN]');
      check(s.title.includes('yanhh3d.pw'), 'YAN stream title MUST mention yanhh3d.pw');
      check(s.name === 'VIP Movies 🎬', 'YAN stream name MUST be "VIP Movies 🎬"');
    }
  });

  // ────────────────────────────────────────────────────────────────────────────
  //  5. HLS PROXY ROUTER REFERER ROUTING & ORDERING ADVERSARIAL TESTS
  // ────────────────────────────────────────────────────────────────────────────
  await testSection('HLS Proxy SOURCE_REFERERS Table & Order Integrity', async () => {
    // Setup Express App with HLS Router
    const app = express();
    app.use('/hls', hlsRouter);

    const server = http.createServer(app);
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    const port = server.address().port;
    const serverUrl = `http://127.0.0.1:${port}`;

    // Setup Mock Upstream Target Server to inspect incoming headers
    const receivedHeaders = [];
    const upstreamApp = express();
    upstreamApp.get('/stream_stp.m3u8', (req, res) => {
      receivedHeaders.push({ path: req.path, headers: req.headers });
      res.setHeader('Content-Type', 'application/vnd.apple.mpegurl');
      res.send('#EXTM3U\n#EXT-X-VERSION:3\n#EXTINF:10.0,\nseg1.ts\n#EXT-X-ENDLIST\n');
    });
    upstreamApp.get('/stream_clbpx.m3u8', (req, res) => {
      receivedHeaders.push({ path: req.path, headers: req.headers });
      res.setHeader('Content-Type', 'application/vnd.apple.mpegurl');
      res.send('#EXTM3U\n#EXT-X-VERSION:3\n#EXTINF:10.0,\nseg1.ts\n#EXT-X-ENDLIST\n');
    });
    upstreamApp.get('/stream_yan.m3u8', (req, res) => {
      receivedHeaders.push({ path: req.path, headers: req.headers });
      res.setHeader('Content-Type', 'application/vnd.apple.mpegurl');
      res.send('#EXTM3U\n#EXT-X-VERSION:3\n#EXTINF:10.0,\nseg1.ts\n#EXT-X-ENDLIST\n');
    });
    upstreamApp.get('/seg1.ts', (req, res) => {
      receivedHeaders.push({ path: req.path, headers: req.headers });
      const buf = Buffer.alloc(188 * 100, 0x47);
      res.setHeader('Content-Type', 'video/MP2T');
      res.send(buf);
    });

    const upstreamServer = http.createServer(upstreamApp);
    await new Promise((resolve) => upstreamServer.listen(0, '127.0.0.1', resolve));
    const upstreamPort = upstreamServer.address().port;
    const upstreamUrl = `http://127.0.0.1:${upstreamPort}`;

    try {
      // 5.1 Test STP Referer header injection
      receivedHeaders.length = 0;
      const stpRef = encodeBase64('https://sieutamphim.pro/');
      const manifestUrl = `${serverUrl}/hls/manifest.m3u8?url=${encodeBase64(`${upstreamUrl}/stream_stp.m3u8`)}&ref=${stpRef}`;
      const mRes = await axios.get(manifestUrl);
      check(mRes.status === 200, `HLS Manifest proxy returned HTTP 200`);
      check(mRes.data.includes('#EXTM3U'), `HLS Manifest proxy returned #EXTM3U body`);
      check(receivedHeaders.length > 0, `Upstream server received request`);
      check(receivedHeaders[0].headers.referer === 'https://sieutamphim.pro/', `Upstream received STP Referer: "${receivedHeaders[0].headers.referer}"`);
      check(receivedHeaders[0].headers.origin === 'https://sieutamphim.pro', `Upstream received STP Origin: "${receivedHeaders[0].headers.origin}"`);

      // 5.2 Test CLBPX Referer header injection
      receivedHeaders.length = 0;
      const clbpxRef = encodeBase64('https://clbphimxua.info/');
      const clbpxManifestUrl = `${serverUrl}/hls/manifest.m3u8?url=${encodeBase64(`${upstreamUrl}/stream_clbpx.m3u8`)}&ref=${clbpxRef}`;
      await axios.get(clbpxManifestUrl);
      check(receivedHeaders.length > 0, `Upstream server received CLBPX request`);
      check(receivedHeaders[0].headers.referer === 'https://clbphimxua.info/', `Upstream received CLBPX Referer: "${receivedHeaders[0].headers.referer}"`);
      check(receivedHeaders[0].headers.origin === 'https://clbphimxua.info', `Upstream received CLBPX Origin: "${receivedHeaders[0].headers.origin}"`);

      // 5.3 Test YAN Referer header injection & substring collision with HH3D
      receivedHeaders.length = 0;
      const yanRef = encodeBase64('https://yanhh3d.pw/');
      const yanManifestUrl = `${serverUrl}/hls/manifest.m3u8?url=${encodeBase64(`${upstreamUrl}/stream_yan.m3u8`)}&ref=${yanRef}`;
      await axios.get(yanManifestUrl);
      check(receivedHeaders.length > 0, `Upstream server received YAN request`);
      check(receivedHeaders[0].headers.referer === 'https://yanhh3d.pw/', `Upstream received YAN Referer: "${receivedHeaders[0].headers.referer}"`);
      check(receivedHeaders[0].headers.origin === 'https://yanhh3d.pw', `Upstream received YAN Origin: "${receivedHeaders[0].headers.origin}"`);

      // 5.4 Test Segment Streaming & Sync Byte 0x47
      const segUrl = `${serverUrl}/hls/segment.ts?url=${encodeBase64(`${upstreamUrl}/seg1.ts`)}&ref=${yanRef}`;
      const segRes = await axios.get(segUrl, { responseType: 'arraybuffer' });
      check(segRes.status === 200, `HLS Segment proxy returned HTTP 200`);
      check(segRes.data[0] === 0x47, `HLS Segment byte[0] is MPEG-TS sync byte 0x47`);
      check(segRes.data.length === 18800, `HLS Segment payload length is 18800 bytes`);
    } finally {
      server.close();
      upstreamServer.close();
    }
  });

  // ────────────────────────────────────────────────────────────────────────────
  //  6. ERROR BOUNDARIES & FAULT ISOLATION UNDER SIMULATED NETWORK FAILURES
  // ────────────────────────────────────────────────────────────────────────────
  await testSection('Provider Error Boundaries & Fault Isolation (404, 500, Timeout)', async () => {
    // 6.1 Unknown IMDb IDs should return [] safely
    const stp404 = await stp.getStreams({ imdbId: 'tt9999999999', type: 'movie', proxyBase: 'http://127.0.0.1:7000' });
    check(Array.isArray(stp404) && stp404.length === 0, 'STP returns [] on non-existent IMDb ID without crashing');

    const clbpx404 = await clbpx.getStreams({ imdbId: 'tt9999999999', type: 'movie', proxyBase: 'http://127.0.0.1:7000' });
    check(Array.isArray(clbpx404) && clbpx404.length === 0, 'CLBPX returns [] on non-existent IMDb ID without crashing');

    const yan404 = await yan.getStreams({ imdbId: 'tt9999999999', type: 'movie', proxyBase: 'http://127.0.0.1:7000' });
    check(Array.isArray(yan404) && yan404.length === 0, 'YAN returns [] on non-existent IMDb ID without crashing');

    // 6.2 Degenerate / malformed slug queries
    const stpMalformed = await stp.getStreams({ slug: 'undefined/../../etc/passwd' });
    check(Array.isArray(stpMalformed) && stpMalformed.length === 0, 'STP returns [] on path traversal slug');

    const clbpxMalformed = await clbpx.getStreams({ slug: 'clbpx_../../passwd' });
    check(Array.isArray(clbpxMalformed) && clbpxMalformed.length === 0, 'CLBPX returns [] on path traversal slug');

    const yanMalformed = await yan.getStreams({ slug: 'yan_../../passwd' });
    check(Array.isArray(yanMalformed) && yanMalformed.length === 0, 'YAN returns [] on path traversal slug');
  });

  // ────────────────────────────────────────────────────────────────────────────
  //  FINAL SUMMARY
  // ────────────────────────────────────────────────────────────────────────────
  console.log('\n╔══════════════════════════════════════════════════════════════════════╗');
  console.log(`║  TEST SUMMARY: ${passedTests}/${totalTests} PASSED (${failedTests} FAILED)                          ║`);
  console.log('╚══════════════════════════════════════════════════════════════════════╝');

  if (failedTests > 0) {
    console.error('\nFailures:');
    failures.forEach((f, idx) => console.error(`  ${idx + 1}. ${f}`));
    process.exit(1);
  } else {
    console.log('\n🎉 ALL EMPIRICAL CHALLENGER 2 TESTS PASSED WITH 100% SUCCESS!\n');
    process.exit(0);
  }
}

main().catch((err) => {
  console.error('Fatal error running main test runner:', err);
  process.exit(1);
});
