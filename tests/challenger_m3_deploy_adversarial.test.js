/**
 * challenger_m3_deploy_adversarial.test.js
 * Empirical Challenger M3 Deploy Verification & Adversarial Stress Harness
 */

const http = require('http');
const assert = require('assert');
const fs = require('fs');
const path = require('path');

const packageJson = require('../package.json');
const { MANIFEST, buildManifest } = require('../src/manifest');
const stp = require('../src/providers/stp');
const clbpx = require('../src/providers/clbpx');
const yan = require('../src/providers/yan');
const vsmov = require('../src/providers/vsmov');
const kkphim = require('../src/providers/kkphim');
const nguonc = require('../src/providers/nguonc');
const hh3d = require('../src/providers/hh3d');
const app = require('../src/index');

// Helper to make HTTP request
function httpRequest(url, options = {}) {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const reqOpts = {
      hostname: parsed.hostname,
      port: parsed.port,
      path: parsed.pathname + parsed.search,
      method: options.method || 'GET',
      headers: options.headers || {},
      timeout: options.timeout || 10000,
    };

    const req = http.request(reqOpts, (res) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => {
        const body = Buffer.concat(chunks);
        resolve({
          statusCode: res.statusCode,
          headers: res.headers,
          body,
          text: () => body.toString('utf-8'),
          json: () => JSON.parse(body.toString('utf-8')),
        });
      });
    });

    req.on('error', reject);
    req.on('timeout', () => {
      req.destroy();
      reject(new Error(`Request timeout: ${url}`));
    });

    if (options.body) {
      req.write(options.body);
    }
    req.end();
  });
}

async function runEmpiricalSuite() {
  console.log('╔══════════════════════════════════════════════════════════════════════════════╗');
  console.log('║   🛡️ EMPIRICAL CHALLENGER M3 DEPLOY ADVERSARIAL & STRESS HARNESS            ║');
  console.log('║   Target: Engine v1.6.0 Stremio VIP Movies Addon Deployment                  ║');
  console.log('╚══════════════════════════════════════════════════════════════════════════════╝\n');

  let passed = 0;
  let failed = 0;

  function record(name, condition, extraInfo = '') {
    if (condition) {
      passed++;
      console.log(`  ✅ [PASS ${passed}] ${name} ${extraInfo ? '(' + extraInfo + ')' : ''}`);
    } else {
      failed++;
      console.error(`  ❌ [FAIL ${failed}] ${name} ${extraInfo ? '(' + extraInfo + ')' : ''}`);
    }
  }

  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;
  const baseUrl = `http://127.0.0.1:${port}`;
  console.log(`📡 Ephemeral Test Server active at ${baseUrl}\n`);

  try {
    // ═════════════════════════════════════════════════════════════════════
    // PHASE 1: Version 1.6.2 Conformance Across All Modules
    // ═════════════════════════════════════════════════════════════════════
    console.log('▶ PHASE 1: Version 1.6.2 Uniformity & Manifest Integrity');
    
    // 1.1 package.json
    record('package.json version is 1.6.2', packageJson.version === '1.6.2', `version: ${packageJson.version}`);
    
    // 1.2 MANIFEST
    record('MANIFEST version is 1.6.2', MANIFEST.version === '1.6.2', `version: ${MANIFEST.version}`);
    
    // 1.3 buildManifest
    const cfgManifest = buildManifest({ providers: ['stp', 'clbpx', 'yan'], categories: ['movie', 'series', 'anime'] });
    record('buildManifest version is 1.6.2', cfgManifest.version === '1.6.2');

    // 1.4 GET /health
    const healthRes = await httpRequest(`${baseUrl}/health`);
    const healthJson = healthRes.json();
    record('GET /health returns HTTP 200', healthRes.statusCode === 200);
    record('GET /health reports status ok', healthJson.status === 'ok');
    record('GET /health reports version 1.6.2', healthJson.version === '1.6.2', `got: ${healthJson.version}`);

    // 1.5 GET /manifest.json
    const manifestRes = await httpRequest(`${baseUrl}/manifest.json`);
    const manifestJson = manifestRes.json();
    record('GET /manifest.json returns HTTP 200', manifestRes.statusCode === 200);
    record('GET /manifest.json reports version 1.6.2', manifestJson.version === '1.6.2');
    record('GET /manifest.json has 22 catalogs', Array.isArray(manifestJson.catalogs) && manifestJson.catalogs.length === 22, `count: ${manifestJson.catalogs.length}`);

    // 1.6 GET / (HTML UI)
    const uiRes = await httpRequest(`${baseUrl}/`);
    const uiHtml = uiRes.text();
    record('GET / returns HTTP 200', uiRes.statusCode === 200);
    record('GET / contains v1.6.2 in status badge', uiHtml.includes('v1.6.2'));
    record('GET / contains exact required footer branding', uiHtml.includes('VIP Movies Addon v1.6.2 • Designed with Taste by <span class="brand-highlight">Q121101</span>'));

    // ═════════════════════════════════════════════════════════════════════
    // PHASE 2: Provider Interface, Branding & Invariant Strict Audit
    // ═════════════════════════════════════════════════════════════════════
    console.log('\n▶ PHASE 2: Provider Invariant & Branding Conformance');

    const providerList = [
      { p: stp, id: 'stp', brand: '[VIP 4 • STP] Thuyết Minh HD (HLS Proxy)\n⚡ Server STP • sieutamphim.pro' },
      { p: clbpx, id: 'clbpx', brand: '[VIP 5 • CLBPX] Lồng Tiếng Cổ Điển (HLS Proxy)\n⚡ Server CLBPX • clbphimxua.info' },
      { p: yan, id: 'yan', brand: '[VIP 6 • YAN] 4K/FHD Donghua 3D (HLS Proxy)\n⚡ Server YAN • yanhh3d.pw' },
      { p: vsmov, id: 'vsmov' },
      { p: kkphim, id: 'kkphim' },
      { p: nguonc, id: 'nguonc' },
      { p: hh3d, id: 'hh3d' },
    ];

    for (const item of providerList) {
      const p = item.p;
      record(`Provider [${item.id}] exports required interface`, 
        typeof p.id === 'string' &&
        typeof p.label === 'string' &&
        typeof p.search === 'function' &&
        typeof p.getDetail === 'function' &&
        typeof p.getCatalog === 'function' &&
        typeof p.getStreams === 'function'
      );
    }

    // Check SOURCE_REFERERS in routes/hls.js
    const hlsFilePath = path.join(__dirname, '../src/routes/hls.js');
    const hlsSource = fs.readFileSync(hlsFilePath, 'utf8');
    record('src/routes/hls.js contains sieutamphim.pro referer', hlsSource.includes('sieutamphim.pro'));
    record('src/routes/hls.js contains clbphimxua.info referer', hlsSource.includes('clbphimxua.info'));
    record('src/routes/hls.js contains yanhh3d.pw referer', hlsSource.includes('yanhh3d.pw'));

    // Check utils.js scoreMatch reuse (no re-declaration)
    for (const filename of ['stp.js', 'clbpx.js', 'yan.js']) {
      const src = fs.readFileSync(path.join(__dirname, '../src/providers', filename), 'utf8');
      const hasRedeclared = src.includes('function scoreMatch') || src.includes('const scoreMatch = (');
      const hasImport = src.includes("require('../lib/utils')") || src.includes('require("../lib/utils")');
      record(`Provider ${filename} imports scoreMatch without re-declaration`, !hasRedeclared && hasImport);
    }

    // ═════════════════════════════════════════════════════════════════════
    // PHASE 3: Live Provider Tests & Strict Invariant Checks
    // ═════════════════════════════════════════════════════════════════════
    console.log('\n▶ PHASE 3: Live Provider Functional & Branding Verification');

    // 3.1 STP Live
    const stpCatalog = await stp.getCatalog('movie', 1);
    record('STP live getCatalog returns array > 0', Array.isArray(stpCatalog) && stpCatalog.length > 0, `got ${stpCatalog.length}`);
    const stpStreams = await stp.getStreams({
      type: 'movie',
      id: 'tt0373889',
      proxyBase: `${baseUrl}`,
    });
    record('STP getStreams returns array with no crash', Array.isArray(stpStreams));
    if (stpStreams.length > 0) {
      record('STP stream has NO externalUrl property', !stpStreams.some(s => s.externalUrl !== undefined));
      record('STP stream URL uses proxyBase /hls/manifest.m3u8', stpStreams[0].url.startsWith(`${baseUrl}/hls/manifest.m3u8`));
      record('STP stream has correct brand name', stpStreams[0].name === '[VIP 4 • STP] Thuyết Minh HD (HLS Proxy)\n⚡ Server STP • sieutamphim.pro', `got: ${stpStreams[0].name}`);
    }

    // 3.2 CLBPX Live
    const clbpxCatalog = await clbpx.getCatalog('movie', 1);
    record('CLBPX live getCatalog returns array > 0', Array.isArray(clbpxCatalog) && clbpxCatalog.length > 0, `got ${clbpxCatalog.length}`);
    const clbpxStreams = await clbpx.getStreams({
      type: 'movie',
      id: 'tt0373889',
      proxyBase: `${baseUrl}`,
    });
    record('CLBPX getStreams returns array with no crash', Array.isArray(clbpxStreams));
    if (clbpxStreams.length > 0) {
      record('CLBPX stream has NO externalUrl property', !clbpxStreams.some(s => s.externalUrl !== undefined));
      record('CLBPX stream URL uses proxyBase /hls/manifest.m3u8', clbpxStreams[0].url.startsWith(`${baseUrl}/hls/manifest.m3u8`));
      record('CLBPX stream has correct brand name', clbpxStreams[0].name === '[VIP 5 • CLBPX] Lồng Tiếng Cổ Điển (HLS Proxy)\n⚡ Server CLBPX • clbphimxua.info', `got: ${clbpxStreams[0].name}`);
    }

    // 3.3 YAN Live
    const yanCatalog = await yan.getCatalog('series', 1);
    record('YAN live getCatalog returns array > 0', Array.isArray(yanCatalog) && yanCatalog.length > 0, `got ${yanCatalog.length}`);
    const yanStreams = await yan.getStreams({
      type: 'movie',
      id: 'tt0373889',
      proxyBase: `${baseUrl}`,
    });
    record('YAN getStreams returns array with no crash', Array.isArray(yanStreams));
    if (yanStreams.length > 0) {
      record('YAN stream has NO externalUrl property', !yanStreams.some(s => s.externalUrl !== undefined));
      record('YAN stream URL uses proxyBase /hls/manifest.m3u8', yanStreams[0].url.startsWith(`${baseUrl}/hls/manifest.m3u8`));
      record('YAN stream has correct brand name', yanStreams[0].name === '[VIP 6 • YAN] 4K/FHD Donghua 3D (HLS Proxy)\n⚡ Server YAN • yanhh3d.pw', `got: ${yanStreams[0].name}`);
    }

    // ═════════════════════════════════════════════════════════════════════
    // PHASE 4: Adversarial Input Fuzzing & Fault Tolerance Stress
    // ═════════════════════════════════════════════════════════════════════
    console.log('\n▶ PHASE 4: Adversarial Input Fuzzing & Fault Tolerance');

    // 4.1 Fuzzing getStreams with hostile/malformed payloads
    const hostilePayloads = [
      {},
      { type: null, id: null },
      { type: 'unknown_type', id: '123' },
      { type: 'movie', id: 'tt9999999999' },
      { type: 'series', id: 'tt9999999999:999:999' },
      { type: 'movie', id: "'; DROP TABLE films; --" },
      { type: 'movie', id: '<script>alert("xss")</script>' },
      { type: 'movie', id: '🚀🔥👽💥🎉' },
      { type: 'series', id: 'invalid_series_id_without_colons' },
      { type: 'series', id: 'tt0903747:abc:xyz' },
    ];

    for (let i = 0; i < hostilePayloads.length; i++) {
      const payload = hostilePayloads[i];
      let pStp, pClbpx, pYan;
      try {
        pStp = await stp.getStreams(payload);
        pClbpx = await clbpx.getStreams(payload);
        pYan = await yan.getStreams(payload);
      } catch (err) {
        // Should not throw unhandled exception
        record(`Adversarial getStreams payload #${i + 1} did not crash`, false, err.message);
        continue;
      }
      record(`Adversarial getStreams payload #${i + 1} handled safely`, 
        Array.isArray(pStp) && Array.isArray(pClbpx) && Array.isArray(pYan)
      );
    }

    // 4.2 Fuzzing search with hostile/empty inputs
    const hostileQueries = ['', ' ', '   ', null, undefined, 12345, '🔥', '<xml>', '" OR 1=1 --'];
    for (const q of hostileQueries) {
      try {
        const s1 = await stp.search(q);
        const s2 = await clbpx.search(q);
        const s3 = await yan.search(q);
        record(`search("${q}") returns safe array`, Array.isArray(s1) && Array.isArray(s2) && Array.isArray(s3));
      } catch (err) {
        record(`search("${q}") threw exception`, false, err.message);
      }
    }

    // 4.3 Fuzzing getCatalog with boundary pages
    const boundaryPages = [0, -1, -99, 1, 99999];
    for (const page of boundaryPages) {
      try {
        const c1 = await stp.getCatalog('movie', page);
        const c2 = await clbpx.getCatalog('movie', page);
        const c3 = await yan.getCatalog('movie', page);
        record(`getCatalog('movie', ${page}) returns array safely`, Array.isArray(c1) && Array.isArray(c2) && Array.isArray(c3));
      } catch (err) {
        record(`getCatalog('movie', ${page}) threw exception`, false, err.message);
      }
    }

    // ═════════════════════════════════════════════════════════════════════
    // PHASE 5: HLS Proxy Router Adversarial Attack & Error Resilience
    // ═════════════════════════════════════════════════════════════════════
    console.log('\n▶ PHASE 5: HLS Proxy Router Attack & Error Resilience');

    // 5.1 Missing parameters
    const r1 = await httpRequest(`${baseUrl}/hls/manifest.m3u8`);
    record('/hls/manifest.m3u8 with missing url returns 400', r1.statusCode === 400);

    const r2 = await httpRequest(`${baseUrl}/hls/segment.ts`);
    record('/hls/segment.ts with missing url returns 400', r2.statusCode === 400);

    const r3 = await httpRequest(`${baseUrl}/hls/sub.vtt`);
    record('/hls/sub.vtt with missing url returns 400', r3.statusCode === 400);

    const r4 = await httpRequest(`${baseUrl}/hls/key`);
    record('/hls/key with missing url returns 400', r4.statusCode === 400);

    // 5.2 Invalid / Corrupted base64
    const r5 = await httpRequest(`${baseUrl}/hls/manifest.m3u8?url=???invalid_base64_!!!`);
    record('/hls/manifest.m3u8 with invalid base64 returns 400 or 502 without crash', [400, 502].includes(r5.statusCode));

    const r6 = await httpRequest(`${baseUrl}/hls/segment.ts?url=???invalid_base64_!!!`);
    record('/hls/segment.ts with invalid base64 returns 400 or 502 without crash', [400, 502].includes(r6.statusCode));

    // 5.3 Non-existent unreachable domain
    const badDomainB64 = Buffer.from('http://non-existent-domain-test-xyz-9876543210.com/stream.m3u8').toString('base64');
    const r7 = await httpRequest(`${baseUrl}/hls/manifest.m3u8?url=${badDomainB64}`);
    record('/hls/manifest.m3u8 with unreachable upstream returns 502/504 without crashing server', [502, 504].includes(r7.statusCode));

    // 5.4 Segment Range header fuzzing
    const sampleTsB64 = Buffer.from('https://test-streams.mux.dev/x36xhzz/url_0/url_462/193039199_mp4_h264_aac_hd_7.ts').toString('base64');
    const r8 = await httpRequest(`${baseUrl}/hls/segment.ts?url=${sampleTsB64}`, {
      headers: { Range: 'bytes=999999999-999999998' } // invalid range
    });
    record('/hls/segment.ts with invalid Range header handles gracefully (HTTP 200, 206, or 416)', [200, 416, 206].includes(r8.statusCode));

    // ═════════════════════════════════════════════════════════════════════
    // PHASE 6: Concurrency Burst & High-Load Stability
    // ═════════════════════════════════════════════════════════════════════
    console.log('\n▶ PHASE 6: Concurrency Burst & High-Load Stability');

    const burstRequests = [];
    const burstUrls = [
      `${baseUrl}/health`,
      `${baseUrl}/manifest.json`,
      `${baseUrl}/`,
      `${baseUrl}/catalog/movie/stp-movie-latest.json`,
      `${baseUrl}/catalog/movie/clbpx-movie-latest.json`,
      `${baseUrl}/catalog/series/yan-donghua-latest.json`,
      `${baseUrl}/default/stream/movie/tt0373889.json`,
      `${baseUrl}/default/stream/movie/tt999999999.json`,
      `${baseUrl}/default/stream/series/tt0903747:1:1.json`,
      `${baseUrl}/manifest.json`,
      `${baseUrl}/health`,
      `${baseUrl}/catalog/movie/vsmov-movie-latest.json`,
      `${baseUrl}/catalog/series/kkphim-series-latest.json`,
      `${baseUrl}/default/stream/movie/tt5095030.json`,
      `${baseUrl}/hls/manifest.m3u8?url=invalid`,
    ];

    for (let i = 0; i < burstUrls.length; i++) {
      burstRequests.push(httpRequest(burstUrls[i]));
    }

    const burstResults = await Promise.all(burstRequests);
    const allResponded = burstResults.every(r => r && typeof r.statusCode === 'number');
    record(`Burst test executed 15 concurrent requests with 100% response rate`, allResponded, `count: ${burstResults.length}`);

    const serverStillHealthy = await httpRequest(`${baseUrl}/health`);
    record(`Server is still fully responsive after burst load`, serverStillHealthy.statusCode === 200);

  } finally {
    server.close();
    console.log('\n[Teardown] Test server shut down cleanly.');
  }

  console.log('\n═══════════════════════════════════════════════════════════════════════');
  console.log(`  TOTAL TESTS: ${passed + failed} | PASSED: ${passed} | FAILED: ${failed}`);
  console.log('═══════════════════════════════════════════════════════════════════════\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runEmpiricalSuite().catch((err) => {
  console.error('Fatal unhandled error in empirical test suite:', err);
  process.exit(1);
});
