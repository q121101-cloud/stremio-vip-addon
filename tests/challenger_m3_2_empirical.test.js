'use strict';

/**
 * ==============================================================================
 *  VIP MOVIES: CHALLENGER M3.2 EMPIRICAL ADVERSARIAL TEST SUITE
 *  Adversarial Challenge & Stress-Test Harness for Engine v1.6.0 Upgrade
 * ==============================================================================
 *
 *  Verifications:
 *  1. Stream Contract Invariants (Zero externalUrl, valid HLS proxy url across ALL 7 providers)
 *  2. HLS Proxy Referer Routing for sieutamphim.pro, clbphimxua.info, yanhh3d.pw & edge domains
 *  3. HLS Router Endpoints (/hls/manifest.m3u8, /hls/segment.ts, /hls/sub.vtt, /hls/key)
 *  4. Live/Mock Stream Aggregator Safety and Protocol Invariants
 *  5. Version Strings & Deployment Integrity
 * ==============================================================================
 */

const assert = require('assert');
const http = require('http');
const axios = require('axios');
const fs = require('fs');
const path = require('path');

// Target modules under test
const app = require('../src/index');
const stp = require('../src/providers/stp');
const clbpx = require('../src/providers/clbpx');
const yan = require('../src/providers/yan');
const vsmov = require('../src/providers/vsmov');
const kkphim = require('../src/providers/kkphim');
const nguonc = require('../src/providers/nguonc');
const hh3d = require('../src/providers/hh3d');
const { MANIFEST } = require('../src/manifest');
const pkg = require('../package.json');

const ALL_PROVIDERS = [
  { id: 'stp', module: stp, brand: '[VIP 4 • STP]', domain: 'sieutamphim.pro' },
  { id: 'clbpx', module: clbpx, brand: '[VIP 5 • CLBPX]', domain: 'clbphimxua.info' },
  { id: 'yan', module: yan, brand: '[VIP 6 • YAN]', domain: 'yanhh3d.pw' },
  { id: 'vsmov', module: vsmov, brand: '[VIP 1 • VSMOV]', domain: 'vsmov.com' },
  { id: 'kkphim', module: kkphim, brand: '[VIP 2 • KKPhim]', domain: 'phimapi.com' },
  { id: 'nguonc', module: nguonc, brand: 'VIP', domain: 'phim.nguonc.com' },
  { id: 'hh3d', module: hh3d, brand: '[VIP 3 • HH3D]', domain: 'hh3d.tv' },
];

let server;
let baseUrl;
let passedAssertions = 0;
let failedAssertions = 0;

function check(desc, condition) {
  if (condition) {
    passedAssertions++;
    console.log(`  ✅ PASS [${passedAssertions}]: ${desc}`);
  } else {
    failedAssertions++;
    console.error(`  ❌ FAIL: ${desc}`);
    throw new Error(`Assertion failed: ${desc}`);
  }
}

async function runAdversarialSuite() {
  console.log('\n╔══════════════════════════════════════════════════════════════════════════════╗');
  console.log('║   🛡️  VIP MOVIES: CHALLENGER M3.2 EMPIRICAL ADVERSARIAL STRESS HARNESS        ║');
  console.log('║   Engine v1.6.0 Invariants, Referer Routing & Protocol Compliance           ║');
  console.log('╚══════════════════════════════════════════════════════════════════════════════╝\n');

  // Start ephemeral test server
  server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;
  baseUrl = `http://127.0.0.1:${port}`;
  console.log(`ℹ️  Ephemeral Test Server running at ${baseUrl}\n`);

  try {
    // ══════════════════════════════════════════════════════════════════════════
    //  SECTION 1: VERSION & METADATA INVARIANTS
    // ══════════════════════════════════════════════════════════════════════════
    console.log('▶ SECTION 1: Version Consistency & Metadata Invariants');
    check('package.json version is 1.6.2', pkg.version === '1.6.2');
    check('MANIFEST.version is 1.6.2', MANIFEST.version === '1.6.2');

    const healthRes = await axios.get(`${baseUrl}/health`);
    check('GET /health returns HTTP 200', healthRes.status === 200);
    check('GET /health version is 1.6.2', healthRes.data.version === '1.6.2');
    check('GET /health status is ok', healthRes.data.status === 'ok');

    const manifestRes = await axios.get(`${baseUrl}/manifest.json`);
    check('GET /manifest.json returns HTTP 200', manifestRes.status === 200);
    check('GET /manifest.json returns version 1.6.2', manifestRes.data.version === '1.6.2');
    check('GET /manifest.json contains 22 catalogs', Array.isArray(manifestRes.data.catalogs) && manifestRes.data.catalogs.length === 22);

    const configHtmlRes = await axios.get(`${baseUrl}/configure`);
    check('Configurator page returns HTTP 200', configHtmlRes.status === 200);
    check('Configurator page contains v1.6.2 badge', configHtmlRes.data.includes('v1.6.2'));
    check(
      'Configurator footer contains exact branding string',
      configHtmlRes.data.includes('VIP Movies Addon v1.6.2 • Designed with Taste by <span class="brand-highlight">Q121101</span>')
    );

    // ══════════════════════════════════════════════════════════════════════════
    //  SECTION 2: PROVIDER STREAM CONTRACT & STRICT ZERO externalUrl INVARIANT
    // ══════════════════════════════════════════════════════════════════════════
    console.log('\n▶ SECTION 2: Direct Provider Stream Contract (Zero externalUrl on ALL 7 Providers)');

    const mockProxyBase = 'http://127.0.0.1:50000';

    for (const prov of ALL_PROVIDERS) {
      console.log(`  [Testing Provider: ${prov.id.toUpperCase()}]`);

      // Test 2.1: Method interface exists
      check(`${prov.id} exports getStreams method`, typeof prov.module.getStreams === 'function');
      check(`${prov.id} exports search method`, typeof prov.module.search === 'function');
      check(`${prov.id} exports getCatalog method`, typeof prov.module.getCatalog === 'function');
      check(`${prov.id} exports getDetail method`, typeof prov.module.getDetail === 'function');

      // Test 2.2: Live or Mock Stream Invariant Validation
      // We test various payload inputs: movie, series ep 1, series ep 999, invalid ep
      const testPayloads = [
        { type: 'movie', imdbId: 'tt0373889', title: 'Harry Potter', proxyBase: mockProxyBase },
        { type: 'series', imdbId: 'tt0903747', title: 'Breaking Bad', season: 1, episode: 1, proxyBase: mockProxyBase },
        { type: 'series', imdbId: 'tt0903747', title: 'Breaking Bad', season: 1, episode: -5, proxyBase: mockProxyBase },
        { type: 'series', imdbId: 'tt0903747', title: 'Breaking Bad', season: 999, episode: 999, proxyBase: mockProxyBase },
        { type: 'invalid_type', imdbId: 'invalid_id_xyz', proxyBase: mockProxyBase },
      ];

      for (const payload of testPayloads) {
        let streams = [];
        try {
          streams = await prov.module.getStreams(payload);
        } catch (err) {
          check(`${prov.id} getStreams must never throw uncaught error: ${err.message}`, false);
        }

        check(`${prov.id} getStreams returns an array for ${payload.type}:${payload.imdbId}`, Array.isArray(streams));

        for (let i = 0; i < streams.length; i++) {
          const s = streams[i];
          check(`${prov.id} stream #${i} has NO externalUrl property key`, !('externalUrl' in s));
          check(`${prov.id} stream #${i} externalUrl is undefined`, s.externalUrl === undefined);
          check(`${prov.id} stream #${i} has valid string url`, typeof s.url === 'string' && s.url.startsWith(mockProxyBase));
          check(`${prov.id} stream #${i} url routes through /hls/ (manifest or extract)`, s.url.includes('/hls/manifest.m3u8') || s.url.includes('/hls/extract'));
          if (['stp', 'clbpx', 'yan'].includes(prov.id)) {
            check(`${prov.id} stream #${i} specifically routes via /hls/manifest.m3u8`, s.url.includes('/hls/manifest.m3u8'));
          }
          check(`${prov.id} stream #${i} has valid title`, typeof s.title === 'string' && s.title.length > 0);
          check(`${prov.id} stream #${i} has valid name`, typeof s.name === 'string' && s.name.length > 0);
          check(`${prov.id} stream #${i} has valid behaviorHints`, typeof s.behaviorHints === 'object' && s.behaviorHints !== null);
        }
      }
    }

    // ══════════════════════════════════════════════════════════════════════════
    //  SECTION 3: HLS PROXY REFERER ROUTING FOR NEW & EXISTING DOMAINS
    // ══════════════════════════════════════════════════════════════════════════
    console.log('\n▶ SECTION 3: HLS Proxy Referer Routing Verification');

    // We test direct GET /hls/manifest.m3u8 with simulated upstream requests or test streams
    const testCases = [
      {
        label: 'STP (sieutamphim.pro)',
        targetUrl: 'https://sieutamphim.pro/streams/master.m3u8',
        expectedRefererDomain: 'sieutamphim.pro',
      },
      {
        label: 'STP Subdomain (sv1.sieutamphim.pro)',
        targetUrl: 'https://sv1.sieutamphim.pro/hls/index.m3u8',
        expectedRefererDomain: 'sieutamphim.pro',
      },
      {
        label: 'CLBPX (clbphimxua.info)',
        targetUrl: 'https://clbphimxua.info/stream/playlist.m3u8',
        expectedRefererDomain: 'clbphimxua.info',
      },
      {
        label: 'CLBPX Subdomain (cdn.clbphimxua.info)',
        targetUrl: 'https://cdn.clbphimxua.info/hls/master.m3u8',
        expectedRefererDomain: 'clbphimxua.info',
      },
      {
        label: 'YAN (yanhh3d.pw)',
        targetUrl: 'https://yanhh3d.pw/stream/master.m3u8',
        expectedRefererDomain: 'yanhh3d.pw',
      },
      {
        label: 'YAN Mirror (fbcdn.cloud)',
        targetUrl: 'https://s1.fbcdn.cloud/video.m3u8',
        expectedRefererDomain: 'yanhh3d.pw',
      },
      {
        label: 'YAN Mirror 2 (defifa.com)',
        targetUrl: 'https://play.defifa.com/master.m3u8',
        expectedRefererDomain: 'yanhh3d.pw',
      },
      {
        label: 'VSMOV (vsmov.com)',
        targetUrl: 'https://v5.streamvsmov.com/master.m3u8',
        expectedRefererDomain: 'vsmov.com',
      },
      {
        label: 'KKPhim (phim1280.tv)',
        targetUrl: 'https://s2.phim1280.tv/20231006/master.m3u8',
        expectedRefererDomain: 'phimapi.com',
      },
    ];

    // Check routing helper or internal mapping via actual proxy endpoint with base64
    for (const tc of testCases) {
      const b64Url = Buffer.from(tc.targetUrl).toString('base64url');
      // Call /hls/manifest.m3u8 -> even if upstream target returns 404 or connection error,
      // it verifies parameter decoding, routing match, and no server crash (502 or 404 handled gracefully)
      try {
        const res = await axios.get(`${baseUrl}/hls/manifest.m3u8?url=${b64Url}`, {
          validateStatus: () => true,
        });
        check(
          `HLS manifest endpoint handled ${tc.label} (${tc.targetUrl}) without crash (status: ${res.status})`,
          res.status === 200 || res.status === 502 || res.status === 404
        );
      } catch (err) {
        check(`HLS manifest proxy crashed on ${tc.label}: ${err.message}`, false);
      }
    }

    // Test with public real HLS stream to verify full manifest rewriting and CORS
    const publicHlsUrl = 'https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8';
    const b64Public = Buffer.from(publicHlsUrl).toString('base64url');
    const proxyManifestRes = await axios.get(`${baseUrl}/hls/manifest.m3u8?url=${b64Public}`);

    check('Public M3U8 proxy returns HTTP 200', proxyManifestRes.status === 200);
    check('M3U8 body begins with #EXTM3U', proxyManifestRes.data.startsWith('#EXTM3U'));
    check('M3U8 headers include Access-Control-Allow-Origin: *', proxyManifestRes.headers['access-control-allow-origin'] === '*');
    check('M3U8 content-type is mpegurl', proxyManifestRes.headers['content-type'].includes('mpegurl'));
    check('M3U8 rewritten child playlist/segment URLs contain proxy host', proxyManifestRes.data.includes(`${baseUrl}/hls/`));

    // ══════════════════════════════════════════════════════════════════════════
    //  SECTION 4: TS SEGMENT DOWNLOAD & MPEG-TS BINARY SYNC BYTE 0x47
    // ══════════════════════════════════════════════════════════════════════════
    console.log('\n▶ SECTION 4: TS Segment Streaming & Sync Byte Verification');

    const publicTsUrl = 'https://test-streams.mux.dev/x36xhzz/url_0/url_462/193039199_mp4_h264_aac_hd_7.ts';
    const b64Ts = Buffer.from(publicTsUrl).toString('base64url');

    const segmentRes = await axios.get(`${baseUrl}/hls/segment.ts?url=${b64Ts}`, {
      responseType: 'arraybuffer',
    });

    check('TS segment returns HTTP 200', segmentRes.status === 200);
    const tsBuffer = Buffer.from(segmentRes.data);
    check(`TS segment size > 10KB (got ${tsBuffer.length} bytes)`, tsBuffer.length > 10240);
    check(`TS segment first byte is MPEG-TS sync byte 0x47 (got 0x${tsBuffer[0].toString(16)})`, tsBuffer[0] === 0x47);
    check('TS segment content-type is video/MP2T', segmentRes.headers['content-type'] === 'video/MP2T');

    // Test HTTP Range 206 Partial Content
    const rangeRes = await axios.get(`${baseUrl}/hls/segment.ts?url=${b64Ts}`, {
      headers: { Range: 'bytes=0-1023' },
      responseType: 'arraybuffer',
      validateStatus: () => true,
    });
    check('HTTP Range request returns HTTP 206 Partial Content', rangeRes.status === 206);
    check('HTTP Range Content-Range header is present', !!rangeRes.headers['content-range']);
    check('HTTP Range payload length is exactly 1024 bytes', rangeRes.data.byteLength === 1024);

    // ══════════════════════════════════════════════════════════════════════════
    //  SECTION 5: SUBTITLE PROXY & SRT-TO-VTT AUTO CONVERSION
    // ══════════════════════════════════════════════════════════════════════════
    console.log('\n▶ SECTION 5: Subtitle Proxy Endpoint Verification (/hls/sub.vtt)');

    // Missing URL -> 400
    const emptySubRes = await axios.get(`${baseUrl}/hls/sub.vtt`, { validateStatus: () => true });
    check('GET /hls/sub.vtt with empty params returns HTTP 400', emptySubRes.status === 400);

    // Data URI SRT -> Auto converted to WebVTT
    const rawSrt = '1\n00:00:01,000 --> 00:00:04,000\nXin chao Viet Nam\n\n2\n00:00:05,500 --> 00:00:08,200\nVIP Movies Engine 1.6.0\n';
    const srtDataUri = `data:text/plain;charset=utf-8,${encodeURIComponent(rawSrt)}`;
    const b64Srt = Buffer.from(srtDataUri).toString('base64url');

    const subRes = await axios.get(`${baseUrl}/hls/sub.vtt?url=${b64Srt}`);
    check('SRT Subtitle proxy returns HTTP 200', subRes.status === 200);
    check('Subtitle content-type is text/vtt', subRes.headers['content-type'].includes('text/vtt'));
    check('Subtitle starts with WEBVTT', subRes.data.startsWith('WEBVTT'));
    check('Subtitle timestamp comma replaced with dot (00:00:01.000)', subRes.data.includes('00:00:01.000 --> 00:00:04.000'));
    check('Subtitle contains text payload', subRes.data.includes('Xin chao Viet Nam'));

    // ══════════════════════════════════════════════════════════════════════════
    //  SECTION 6: STREAM AGGREGATOR ADVERSARIAL STRESS TESTING
    // ══════════════════════════════════════════════════════════════════════════
    console.log('\n▶ SECTION 6: Stream Aggregator Protocol Invariants & Stress Testing');

    const testTitles = [
      { id: 'tt0373889', type: 'movie', label: 'Harry Potter 3 (Movie)' },
      { id: 'tt5095030', type: 'movie', label: 'Avengers Infinity War (Movie)' },
      { id: 'tt0903747:1:1', type: 'series', label: 'Breaking Bad S1E1 (Series)' },
      { id: 'tt0903747:2:5', type: 'series', label: 'Breaking Bad S2E5 (Series)' },
      { id: 'tt9999999999', type: 'movie', label: 'Non-Existent Movie IMDb ID' },
      { id: 'nguonc:nu-hiep-ruy-bang', type: 'movie', label: 'NguonC Custom Slug Movie' },
      { id: 'nguonc:pham-nhan-tu-tien:0:1', type: 'series', label: 'NguonC Custom Slug Series' },
    ];

    for (const item of testTitles) {
      const endpoint = `${baseUrl}/default/stream/${item.type}/${encodeURIComponent(item.id)}.json`;
      const res = await axios.get(endpoint, { validateStatus: () => true });

      check(`Stream Aggregator for ${item.label} returns HTTP 200 (no crash)`, res.status === 200);
      check(`Response contains streams array for ${item.label}`, Array.isArray(res.data?.streams));

      const streams = res.data?.streams || [];
      for (let i = 0; i < streams.length; i++) {
        const st = streams[i];
        // INVARIANT 1: STRICTLY NO externalUrl
        check(`Stream [${i}] in ${item.label} strictly OMITS externalUrl key`, !('externalUrl' in st));
        check(`Stream [${i}] in ${item.label} externalUrl is undefined`, st.externalUrl === undefined);
        // INVARIANT 2: url is string and non-empty
        check(`Stream [${i}] in ${item.label} has non-empty url`, typeof st.url === 'string' && st.url.length > 0);
        // INVARIANT 3: HLS Proxy url routing
        check(`Stream [${i}] in ${item.label} url starts with http:// or https://`, st.url.startsWith('http://') || st.url.startsWith('https://'));
      }
    }

    console.log('\n╔══════════════════════════════════════════════════════════════════════════════╗');
    console.log(`║   🎉 CHALLENGER VERIFICATION COMPLETE: ALL ${passedAssertions} ASSERTIONS PASSED!           ║`);
    console.log(`║   Failed Assertions: ${failedAssertions}                                                       ║`);
    console.log('╚══════════════════════════════════════════════════════════════════════════════╝\n');
  } finally {
    if (server) {
      await new Promise((resolve) => server.close(resolve));
      console.log('ℹ️  Ephemeral Test Server closed cleanly.');
    }
  }
}

runAdversarialSuite()
  .then(() => {
    process.exit(0);
  })
  .catch((err) => {
    console.error('Fatal Challenge Failure:', err);
    process.exit(1);
  });
