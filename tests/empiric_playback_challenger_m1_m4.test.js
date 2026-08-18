'use strict';

/**
 * ==============================================================================
 *  Challenger 1: Deep Empirical Stress & Adversarial Playback Verification Suite
 *  Stremio VIP Movies Addon Engine v1.5.0
 * ==============================================================================
 */

const express = require('express');
const cors = require('cors');
const axios = require('axios');
const assert = require('assert');
const utils = require('../src/lib/utils');
const manifest = require('../src/manifest');
const config = require('../src/config');
const hlsRouter = require('../src/routes/hls');
const manifestRouter = require('../src/routes/manifest');
const handlers = require('../src/handlers');

const providers = {
  vsmov: require('../src/providers/vsmov'),
  kkphim: require('../src/providers/kkphim'),
  nguonc: require('../src/providers/nguonc'),
  stp: require('../src/providers/stp'),
  hh3d: require('../src/providers/hh3d'),
  yan: require('../src/providers/yan'),
  clbpx: require('../src/providers/clbpx'),
};

const TIMEOUT = 25000;

async function runEmpiricalChallenge() {
  console.log('════════════════════════════════════════════════════════════════════');
  console.log('🧪 EMPIRICAL CHALLENGER 1: COMPREHENSIVE PLAYBACK & CONTRACT AUDIT');
  console.log('════════════════════════════════════════════════════════════════════\n');

  let passedChecks = 0;
  let totalChecks = 0;

  function recordCheck(name, passed, detail = '') {
    totalChecks++;
    if (passed) {
      passedChecks++;
      console.log(`  ✅ [PASS] ${name}${detail ? ` (${detail})` : ''}`);
    } else {
      console.error(`  ❌ [FAIL] ${name}${detail ? ` (${detail})` : ''}`);
      throw new Error(`Assertion failed: ${name}`);
    }
  }

  // 1. CANONICAL UTILS VERIFICATION
  console.log('▶ Check 1: Canonical Helpers in src/lib/utils.js');
  const requiredUtils = [
    'scoreMatch', 'normalizeText', 'escapeRegExp',
    'safeExtra', 'safeSlug', 'safeKeyword', 'safePage',
    'extractSeasonNumber', 'isSeasonMatch'
  ];
  for (const fn of requiredUtils) {
    recordCheck(`utils.${fn} is exported as a function`, typeof utils[fn] === 'function');
  }

  // 2. CHECK PROVIDERS EXPORT CONTRACT
  console.log('\n▶ Check 2: All 7 Providers Standard Interface Export');
  for (const [pName, pMod] of Object.entries(providers)) {
    recordCheck(`Provider ${pName} exports getStreams`, typeof pMod.getStreams === 'function');
    recordCheck(`Provider ${pName} exports getCatalog`, typeof pMod.getCatalog === 'function');
  }

  // 3. START EPHEMERAL TEST SERVER
  console.log('\n▶ Check 3: Ephemeral Server Startup & Lifecycle');
  const app = express();
  app.use(cors());
  app.use(express.json());
  app.use('/hls', hlsRouter);
  app.use('/', manifestRouter);
  app.use('/', handlers);

  const server = await new Promise((resolve, reject) => {
    const s = app.listen(0, '127.0.0.1', () => resolve(s));
    s.on('error', reject);
  });
  const port = server.address().port;
  const baseUrl = `http://127.0.0.1:${port}`;
  recordCheck(`Ephemeral server bound to port ${port}`, port > 0);

  try {
    // 4. MANIFEST AND 22 K20 CATALOGS CHECK
    console.log('\n▶ Check 4: Manifest & 22 Catalogs Declaration');
    const mRes = await axios.get(`${baseUrl}/manifest.json`, { timeout: TIMEOUT });
    recordCheck('GET /manifest.json returns 200', mRes.status === 200);
    recordCheck('Manifest version is 1.5.0', mRes.data.version === '1.5.0');
    recordCheck('Manifest has exactly 22 standard catalogs', Array.isArray(mRes.data.catalogs) && mRes.data.catalogs.length === 22, `Found ${mRes.data.catalogs?.length}`);

    const expectedCatalogs = [
      'vsmov-4k', 'vsmov-thuyet-minh',
      'kkphim-movie-latest', 'kkphim-series-latest', 'kkphim-cinema-latest', 'kkphim-anime-latest',
      'nguonc-movie-latest', 'nguonc-series-latest', 'nguonc-cinema-latest', 'nguonc-anime-latest',
      'stp-au-my', 'stp-phim-le', 'stp-phim-bo', 'stp-han-quoc',
      'hh3d-phim-le', 'hh3d-phim-bo', 'hh3d-tien-hiep',
      'yan-phim-le', 'yan-phim-bo', 'yan-dang-chieu',
      'clbpx-kiem-hiep', 'clbpx-hong-kong'
    ];
    for (const catId of expectedCatalogs) {
      const found = mRes.data.catalogs.some((c) => c.id === catId);
      recordCheck(`Manifest contains catalog "${catId}"`, found);
    }

    // 5. STREAM RESOLUTION AND IN-APP STREAM EXCLUSIVITY FOR MOVIES & SERIES
    console.log('\n▶ Check 5: Stream Resolution & In-App Exclusivity (No externalUrl)');
    const testIds = [
      { type: 'movie', id: 'kkphim:cuu-mon' },
      { type: 'movie', id: 'tt1375666' }, // Inception
      { type: 'series', id: 'tt0903747:1:1' }, // Breaking Bad S01E01
    ];

    let testStreamUrls = [];

    for (const item of testIds) {
      const sRes = await axios.get(`${baseUrl}/stream/${item.type}/${item.id}.json`, { timeout: TIMEOUT });
      recordCheck(`GET /stream/${item.type}/${item.id}.json returns 200`, sRes.status === 200);
      recordCheck(`Response has streams array for ${item.id}`, Array.isArray(sRes.data?.streams));

      if (sRes.data.streams && sRes.data.streams.length > 0) {
        for (const s of sRes.data.streams) {
          recordCheck(`Stream name is "VIP Movies 🎬"`, s.name === 'VIP Movies 🎬');
          recordCheck(`Stream has valid "url"`, typeof s.url === 'string' && s.url.length > 0);
          recordCheck(`Stream STRICTLY has NO "externalUrl"`, s.externalUrl === undefined && !('externalUrl' in s));
          recordCheck(`Stream behaviorHints.notSupported is false`, s.behaviorHints?.notSupported === false);
          testStreamUrls.push(s.url);
        }
      }
    }

    recordCheck('Aggregated at least 3 valid streams across test cases', testStreamUrls.length >= 3, `Count: ${testStreamUrls.length}`);

    // 6. HLS PLAYLIST REWRITING & RECURSIVE SUB-MANIFEST TRAVERSAL
    console.log('\n▶ Check 6: HLS Manifest Rewriter & Variant Traversal');
    let targetSegmentUrls = [];

    for (const streamUrl of testStreamUrls.slice(0, 3)) {
      const plRes = await axios.get(streamUrl, { timeout: TIMEOUT });
      recordCheck(`Manifest fetch returned 200 for ${streamUrl.slice(0, 60)}...`, plRes.status === 200);
      recordCheck('CORS header Access-Control-Allow-Origin is *', plRes.headers['access-control-allow-origin'] === '*');
      recordCheck('Manifest contains #EXTM3U', typeof plRes.data === 'string' && plRes.data.includes('#EXTM3U'));

      // Check lines for segment or sub-variant
      const lines = String(plRes.data).split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
      for (const line of lines) {
        if (line.startsWith('http://') && (line.includes('/hls/segment.ts') || line.includes('/hls/ts'))) {
          targetSegmentUrls.push(line);
          break;
        }
        if (line.startsWith('http://') && line.includes('/hls/manifest.m3u8')) {
          // Master playlist sub-variant
          const subRes = await axios.get(line, { timeout: TIMEOUT });
          recordCheck(`Sub-variant fetch returned 200`, subRes.status === 200);
          recordCheck(`Sub-variant contains #EXTM3U`, subRes.data.includes('#EXTM3U'));
          const subLines = String(subRes.data).split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
          for (const sl of subLines) {
            if (sl.startsWith('http://') && (sl.includes('/hls/segment.ts') || sl.includes('/hls/ts'))) {
              targetSegmentUrls.push(sl);
              break;
            }
          }
          if (targetSegmentUrls.length > 0) break;
        }
      }
    }

    recordCheck('Resolved at least one proxy segment URL', targetSegmentUrls.length > 0, `Found: ${targetSegmentUrls.length}`);

    // 7. REAL BINARY SEGMENT DOWNLOAD (>50KB, MPEG-TS SYNC BYTE 0x47, 188-BYTE ALIGNMENT)
    console.log('\n▶ Check 7: Real Binary Segment Download & MPEG-TS Packet Verification');
    const segUrl = targetSegmentUrls[0];
    const segRes = await axios.get(segUrl, {
      responseType: 'arraybuffer',
      timeout: TIMEOUT,
    });

    recordCheck('Segment download HTTP 200', segRes.status === 200);
    recordCheck('Segment CORS header is *', segRes.headers['access-control-allow-origin'] === '*');
    const segContentType = (segRes.headers['content-type'] || '').toLowerCase();
    recordCheck(
      'Segment Content-Type is video/mp2t or application/octet-stream',
      segContentType.includes('video/mp2t') || segContentType.includes('octet-stream')
    );

    const segBuffer = Buffer.from(segRes.data);
    const sizeKB = (segBuffer.length / 1024).toFixed(2);
    recordCheck('Binary segment buffer size > 50,000 bytes', segBuffer.length > 50000, `Actual: ${segBuffer.length} bytes (${sizeKB} KB)`);

    // Verify MPEG-TS sync byte 0x47
    let syncValid = false;
    if (segBuffer[0] === 0x47) {
      syncValid = true;
      if (segBuffer.length >= 189) {
        recordCheck('MPEG-TS byte 188 matches sync byte 0x47 (packet alignment)', segBuffer[188] === 0x47);
      }
      if (segBuffer.length >= 377) {
        recordCheck('MPEG-TS byte 376 matches sync byte 0x47 (packet alignment)', segBuffer[376] === 0x47);
      }
    } else {
      // Check for obfuscated wrapper
      for (let i = 0; i < Math.min(segBuffer.length - 376, 4096); i++) {
        if (segBuffer[i] === 0x47 && segBuffer[i + 188] === 0x47 && segBuffer[i + 376] === 0x47) {
          syncValid = true;
          recordCheck(`MPEG-TS sync pattern 0x47 detected at offset ${i}`, true);
          break;
        }
      }
    }
    recordCheck('MPEG-TS sync byte 0x47 confirmed in segment stream', syncValid);

    // 8. HTTP RANGE SEEKING TEST (206 PARTIAL CONTENT)
    console.log('\n▶ Check 8: HTTP Range 206 Partial Content');
    const rangeRes = await axios.get(segUrl, {
      headers: { Range: 'bytes=0-2047' },
      responseType: 'arraybuffer',
      timeout: TIMEOUT,
      validateStatus: (s) => s >= 200 && s < 400,
    });
    recordCheck('Range request returns HTTP 200 or 206', rangeRes.status === 200 || rangeRes.status === 206, `Status: ${rangeRes.status}`);
    if (rangeRes.status === 206) {
      recordCheck('Range 0-2047 returns exactly 2048 bytes', rangeRes.data.byteLength === 2048, `Got ${rangeRes.data.byteLength}`);
      recordCheck('Content-Range header present', typeof rangeRes.headers['content-range'] === 'string');
    }

    // 9. ADVERSARIAL HLS PROXY ERROR RESILIENCE
    console.log('\n▶ Check 9: Adversarial HLS Proxy Fault Tolerance');
    // Missing query params -> 400
    const missingParamRes = await axios.get(`${baseUrl}/hls/manifest.m3u8`, { validateStatus: () => true });
    recordCheck('HLS manifest with missing params returns 400', missingParamRes.status === 400);

    const missingSegRes = await axios.get(`${baseUrl}/hls/segment.ts`, { validateStatus: () => true });
    recordCheck('HLS segment with missing params returns 400', missingSegRes.status === 400);

    // Corrupted base64 -> 400
    const badB64Res = await axios.get(`${baseUrl}/hls/manifest.m3u8?url=!!!invalid_base64!!!`, { validateStatus: () => true });
    recordCheck('HLS manifest with corrupted base64 returns 400/500 gracefully without server crash', badB64Res.status >= 400 && badB64Res.status < 600);

    // 10. 404 ROUTING PREVENTION & DYNAMIC CONFIGURATION
    console.log('\n▶ Check 10: 404 Prevention Across Dynamic Configurations & Search Routes');
    const token = config.encodeConfig({ providers: ['vsmov', 'kkphim', 'nguonc'], categories: ['movie', 'series'] });

    const routesToTest = [
      `/manifest.json`,
      `/${token}/manifest.json`,
      `/catalog/movie/vsmov-4k.json`,
      `/${token}/catalog/movie/vsmov-4k.json`,
      `/catalog/movie/kkphim-movie-latest/search=batman.json`,
      `/${token}/catalog/movie/kkphim-movie-latest/search=batman.json`,
      `/catalog/movie/nonexistent-catalog-xyz.json`,
      `/${token}/catalog/movie/nonexistent-catalog-xyz.json`,
      `/meta/movie/nonexistent:movie:123.json`,
      `/${token}/meta/movie/nonexistent:movie:123.json`,
      `/stream/movie/tt0000000nonexistent.json`,
      `/${token}/stream/movie/tt0000000nonexistent.json`,
    ];

    for (const r of routesToTest) {
      const res = await axios.get(`${baseUrl}${r}`, { validateStatus: () => true, timeout: TIMEOUT });
      recordCheck(`Route ${r} returns HTTP 200 (no 404)`, res.status === 200, `Status: ${res.status}`);
    }

  } finally {
    server.close();
    console.log('\n[Teardown] Ephemeral test server closed.');
  }

  console.log('\n════════════════════════════════════════════════════════════════════');
  console.log(`🏆 SUMMARY: ${passedChecks}/${totalChecks} CHECKS PASSED (100% EMPIRICAL SUCCESS)`);
  console.log('════════════════════════════════════════════════════════════════════\n');
  return true;
}

if (require.main === module) {
  runEmpiricalChallenge()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('\nEMPIRICAL CHALLENGE FAILED:', err);
      process.exit(1);
    });
}

module.exports = { runEmpiricalChallenge };
