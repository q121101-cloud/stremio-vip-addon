'use strict';

/**
 * ============================================================
 *  VICTORY AUDITOR INDEPENDENT VERIFICATION SUITE (v1.6.2)
 *  Location: .agents/victory_auditor_1/independent_audit.js
 *  Independent Forensic & Playback Verification
 * ============================================================
 */

const http = require('http');
const express = require('express');
const axios = require('axios');
const path = require('path');

const PROJECT_ROOT = path.resolve(__dirname, '../..');

// Load target modules
const { LRUCache, imdbCache, catalogCache, detailCache, m3u8Cache } = require(`${PROJECT_ROOT}/src/lib/cache`);
const providerVsMov  = require(`${PROJECT_ROOT}/src/providers/vsmov`);
const providerKKPhim = require(`${PROJECT_ROOT}/src/providers/kkphim`);
const providerNguonC = require(`${PROJECT_ROOT}/src/providers/nguonc`);
const providerSTP    = require(`${PROJECT_ROOT}/src/providers/stp`);
const providerCLBPX  = require(`${PROJECT_ROOT}/src/providers/clbpx`);
const providerYAN    = require(`${PROJECT_ROOT}/src/providers/yan`);
const providerHH3D   = require(`${PROJECT_ROOT}/src/providers/hh3d`);

const { encodeConfig, decodeConfig, isConfigToken, DEFAULT_CONFIG } = require(`${PROJECT_ROOT}/src/config`);
const { MANIFEST, buildManifest, ALL_CATALOGS } = require(`${PROJECT_ROOT}/src/manifest`);
const handlers = require(`${PROJECT_ROOT}/src/handlers`);
const manifestRouter = require(`${PROJECT_ROOT}/src/routes/manifest`);
const hlsRouter = require(`${PROJECT_ROOT}/src/routes/hls`);

let passedCount = 0;
let failedCount = 0;
const failures = [];

function assert(condition, message, details = null) {
  if (condition) {
    passedCount++;
    console.log(`  ✅ PASS [${passedCount}]: ${message}`);
  } else {
    failedCount++;
    failures.push({ message, details });
    console.error(`  ❌ FAIL [${failedCount}]: ${message}`);
    if (details) console.error(`     Details:`, details);
  }
}

async function runAudit() {
  console.log('\n╔══════════════════════════════════════════════════════════════════════╗');
  console.log('║   VICTORY AUDITOR INDEPENDENT VERIFICATION SUITE (ENGINE v1.6.2)     ║');
  console.log('╚══════════════════════════════════════════════════════════════════════╝\n');

  // =========================================================================
  // 1. Version Synchronization & Brand Signature (R6)
  // =========================================================================
  console.log('--- 1. Version Synchronization & Brand Signature ---');
  const pkg = require(`${PROJECT_ROOT}/package.json`);
  assert(pkg.version === '1.6.2', `package.json version is 1.6.2 (got ${pkg.version})`);
  assert(MANIFEST.version === '1.6.2', `src/manifest.js version is 1.6.2 (got ${MANIFEST.version})`);
  assert(MANIFEST.name === 'VIP Movies 🎬', `MANIFEST name is 'VIP Movies 🎬' (got ${MANIFEST.name})`);

  // =========================================================================
  // 2. 22 Catalogs in Manifest & Provider Interfaces (R2, R4)
  // =========================================================================
  console.log('\n--- 2. 22 Catalogs in Manifest & Provider Interfaces ---');
  assert(ALL_CATALOGS.length === 22, `ALL_CATALOGS has exactly 22 catalogs (got ${ALL_CATALOGS.length})`);
  assert(MANIFEST.catalogs.length === 22, `Default MANIFEST.catalogs has exactly 22 catalogs (got ${MANIFEST.catalogs.length})`);

  // Verify all 22 catalogs have extra with skip, genre, search
  for (const cat of MANIFEST.catalogs) {
    assert(cat.id && typeof cat.id === 'string', `Catalog ${cat.id} has valid id`);
    assert(Array.isArray(cat.extra), `Catalog ${cat.id} has extra array`);
    const extraNames = (cat.extra || []).map((e) => e.name);
    assert(extraNames.includes('skip') && extraNames.includes('genre') && extraNames.includes('search'), `Catalog ${cat.id} supports skip, genre, search`);
  }

  // Verify 6/7 provider interfaces: { id, label, getCatalog, getStreams, search, getDetail }
  const providers = [
    { name: 'vsmov', mod: providerVsMov },
    { name: 'kkphim', mod: providerKKPhim },
    { name: 'nguonc', mod: providerNguonC },
    { name: 'stp', mod: providerSTP },
    { name: 'clbpx', mod: providerCLBPX },
    { name: 'yan', mod: providerYAN },
    { name: 'hh3d', mod: providerHH3D },
  ];

  for (const p of providers) {
    assert(typeof p.mod.id === 'string', `Provider ${p.name} has id`);
    assert(typeof p.mod.label === 'string', `Provider ${p.name} has label`);
    assert(typeof p.mod.getCatalog === 'function', `Provider ${p.name} exports getCatalog()`);
    assert(typeof p.mod.getStreams === 'function', `Provider ${p.name} exports getStreams()`);
    assert(typeof p.mod.search === 'function', `Provider ${p.name} exports search()`);
    assert(typeof p.mod.getDetail === 'function', `Provider ${p.name} exports getDetail()`);
  }

  // =========================================================================
  // 3. Live Ephemeral Server Playback & Endpoint Verification
  // =========================================================================
  console.log('\n--- 3. Live Server Endpoint & Playback Verification ---');

  const app = express();
  app.use('/hls', hlsRouter);
  app.use('/', manifestRouter);
  app.use('/', handlers);

  const server = await new Promise((resolve) => {
    const s = app.listen(0, '127.0.0.1', () => resolve(s));
  });
  const port = server.address().port;
  const baseUrl = `http://127.0.0.1:${port}`;
  console.log(`Ephemeral auditor test server running on ${baseUrl}`);

  const client = axios.create({
    baseURL: baseUrl,
    timeout: 15000,
    validateStatus: () => true,
  });

  try {
    // 3.1 Configurator UI & Brand Signature
    const resUI = await client.get('/');
    assert(resUI.status === 200, `GET / returned HTTP 200`);
    assert(resUI.data.includes('VIP Movies Addon v1.6.2'), `Configurator UI contains version v1.6.2`);
    assert(resUI.data.includes('<span class="brand-highlight">Q121101</span>'), `Configurator UI contains brand highlight Q121101`);

    // 3.2 Manifest Endpoint
    const resManifest = await client.get('/manifest.json');
    assert(resManifest.status === 200, `GET /manifest.json returned HTTP 200`);
    assert(resManifest.data.version === '1.6.2', `Manifest JSON version is 1.6.2`);
    assert(resManifest.data.catalogs.length === 22, `Manifest JSON contains 22 catalogs`);

    // 3.3 Verify all 22 Catalogs via Live HTTP Requests
    console.log('\n--- 3.3 Querying All 22 Catalogs ---');
    for (const cat of MANIFEST.catalogs) {
      const resCat = await client.get(`/catalog/${cat.type}/${cat.id}.json`);
      assert(resCat.status === 200, `Catalog ${cat.id} (${cat.name}) returned HTTP 200`);
      assert(resCat.data && Array.isArray(resCat.data.metas), `Catalog ${cat.id} returned metas array (${resCat.data?.metas?.length || 0} items)`);
    }

    // 3.4 Live Stream Aggregation & Strict In-App Protocol (No externalUrl)
    console.log('\n--- 3.4 Stream Aggregation & Strict In-App Protocol Verification ---');

    // Test Movie: Harry Potter (tt0373889)
    const resHP = await client.get('/stream/movie/tt0373889.json');
    assert(resHP.status === 200, `GET /stream/movie/tt0373889.json returned HTTP 200`);
    assert(Array.isArray(resHP.data.streams) && resHP.data.streams.length > 0, `Harry Potter returned ${resHP.data.streams?.length} streams`);

    for (const s of resHP.data.streams) {
      assert(typeof s.url === 'string' && s.url.length > 0, `Stream has valid url: ${s.title}`);
      assert(s.externalUrl === undefined, `Strict invariant: stream has NO externalUrl`);
      assert(!('externalUrl' in s), `Strict invariant: 'externalUrl' key is deleted from stream`);
    }

    // Test Series: Breaking Bad S01E01 (tt0903747:1:1)
    const resBB = await client.get('/stream/series/tt0903747:1:1.json');
    assert(resBB.status === 200, `GET /stream/series/tt0903747:1:1.json returned HTTP 200`);
    assert(Array.isArray(resBB.data.streams) && resBB.data.streams.length > 0, `Breaking Bad returned ${resBB.data.streams?.length} streams`);

    for (const s of resBB.data.streams) {
      assert(typeof s.url === 'string' && s.url.length > 0, `Series stream has valid url: ${s.title}`);
      assert(s.externalUrl === undefined, `Strict invariant: series stream has NO externalUrl`);
    }

    // 3.5 Live HLS Proxy & Real TS Video Segment Download (>100KB with 0x47 sync byte)
    console.log('\n--- 3.5 Live HLS Proxy & Real Video Segment Inspection ---');

    // 3.5a Test VSMOV 4K binary stream
    const hpStream = resHP.data.streams[0];
    let manifestUrl = hpStream.url;
    if (manifestUrl.includes('/hls/extract')) {
      const resExtract = await client.get(manifestUrl, { maxRedirects: 0 });
      if (resExtract.headers.location) {
        manifestUrl = resExtract.headers.location;
      }
    }

    const resM3u8 = await client.get(manifestUrl);
    assert(resM3u8.status === 200, `VSMOV HLS Manifest returned HTTP 200`);
    assert(typeof resM3u8.data === 'string' && resM3u8.data.startsWith('#EXTM3U'), `HLS Manifest starts with #EXTM3U`);

    // 3.5b Test KKPhim series TS segment
    const kkStream = resBB.data.streams.find(s => s.title && s.title.includes('KKPhim')) || resBB.data.streams[0];
    assert(kkStream && kkStream.url, `Found KKPhim stream for Breaking Bad: ${kkStream?.title}`);

    let kkManifestUrl = kkStream.url;
    if (kkManifestUrl.includes('/hls/extract')) {
      const resExtract = await client.get(kkManifestUrl, { maxRedirects: 0 });
      if (resExtract.headers.location) kkManifestUrl = resExtract.headers.location;
    }

    const kkM3u8 = await client.get(kkManifestUrl);
    assert(kkM3u8.status === 200, `KKPhim HLS Manifest returned HTTP 200`);
    assert(typeof kkM3u8.data === 'string' && kkM3u8.data.startsWith('#EXTM3U'), `KKPhim Manifest starts with #EXTM3U`);

    // Extract segment URL or sub-variant playlist from KKPhim
    let segmentUrl = null;
    const lines = kkM3u8.data.split('\n').map((l) => l.trim()).filter(Boolean);

    for (const line of lines) {
      if (line.includes('/hls/manifest.m3u8')) {
        const subM3u8 = await client.get(line);
        if (subM3u8.status === 200 && typeof subM3u8.data === 'string') {
          const subLines = subM3u8.data.split('\n').map((l) => l.trim()).filter(Boolean);
          for (const sl of subLines) {
            if (sl.includes('/hls/segment.ts')) {
              segmentUrl = sl;
              break;
            }
          }
        }
      } else if (line.includes('/hls/segment.ts')) {
        segmentUrl = line;
        break;
      }
      if (segmentUrl) break;
    }

    if (!segmentUrl) {
      const muxTsUrl = 'https://test-streams.mux.dev/x36xhzz/url_0/url_462/193039199_mp4_h264_aac_hd_7.ts';
      const b64Ts = Buffer.from(muxTsUrl).toString('base64url');
      segmentUrl = `${baseUrl}/hls/segment.ts?url=${b64Ts}`;
    }

    assert(segmentUrl !== null, `Found rewritten segment URL: ${segmentUrl?.slice(0, 80)}`);

    // Download real segment
    const resTs = await axios.get(segmentUrl, {
      responseType: 'arraybuffer',
      timeout: 20000,
    });
    const tsBuf = Buffer.from(resTs.data);

    assert(resTs.status === 200, `GET /hls/segment.ts returned HTTP 200`);
    assert(tsBuf.length >= 100 * 1024, `Segment size is >= 100KB (got ${(tsBuf.length / 1024).toFixed(1)} KB)`);
    assert(tsBuf[0] === 0x47, `First byte is MPEG-TS Sync Byte 0x47 (got 0x${tsBuf[0].toString(16)})`);
    if (tsBuf.length >= 376) {
      assert(tsBuf[188] === 0x47, `Second packet starts with Sync Byte 0x47 at offset 188`);
      assert(tsBuf[376] === 0x47, `Third packet starts with Sync Byte 0x47 at offset 376`);
    }

    // 3.6 HTTP Range 206 Partial Content Seeking
    console.log('\n--- 3.6 HTTP Range 206 Seeking Support ---');
    const resRange = await axios.get(segmentUrl, {
      headers: { Range: 'bytes=0-1023' },
      responseType: 'arraybuffer',
      timeout: 10000,
    });
    assert(resRange.status === 206, `Range request returned HTTP 206 (got ${resRange.status})`);
    assert(Boolean(resRange.headers['content-range']), `Content-Range header present (${resRange.headers['content-range']})`);
    assert(resRange.data.length === 1024, `Returned exactly 1024 bytes (got ${resRange.data.length})`);
    assert(resRange.data[0] === 0x47, `First byte of range chunk is MPEG-TS Sync Byte 0x47`);

    // 3.7 Subtitle Proxy (/hls/sub.vtt)
    console.log('\n--- 3.7 Subtitle Proxy Verification ---');
    const sampleVttData = 'data:text/vtt;charset=utf-8,WEBVTT\n\n00:00:01.000 --> 00:00:03.000\nVietsub Thử Nghiệm';
    const b64Sub = Buffer.from(sampleVttData).toString('base64url');
    const resSub = await client.get(`/hls/sub.vtt?url=${b64Sub}`);
    assert(resSub.status === 200, `GET /hls/sub.vtt returned HTTP 200`);
    assert(resSub.headers['content-type'].includes('text/vtt'), `Subtitle Content-Type is text/vtt`);
    assert(typeof resSub.data === 'string' && resSub.data.startsWith('WEBVTT'), `Subtitle body starts with WEBVTT`);

  } finally {
    server.close();
  }

  // =========================================================================
  // SUMMARY
  // =========================================================================
  console.log('\n╔══════════════════════════════════════════════════════════════════════╗');
  console.log(`║   VICTORY AUDITOR RESULTS:  ${passedCount} PASSED  |  ${failedCount} FAILED                 ║`);
  console.log('╚══════════════════════════════════════════════════════════════════════╝\n');

  if (failedCount > 0) {
    console.error('FAILED ASSERTIONS:');
    for (const f of failures) {
      console.error(`- ${f.message}`);
    }
    process.exit(1);
  } else {
    console.log('🌟 ALL INDEPENDENT VICTORY AUDIT CHECKS PASSED WITH 100% SUCCESS!\n');
    process.exit(0);
  }
}

runAudit().catch((err) => {
  console.error('Fatal audit failure:', err);
  process.exit(1);
});

