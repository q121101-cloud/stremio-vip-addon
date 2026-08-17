'use strict';

/**
 * ==============================================================================
 *  VIP Movies Addon — tests/test_kkphim_playback.js
 *  Milestone 3: End-to-End Stream Playback Test & Self-Debug Verification Loop
 *
 *  Validates 100% In-App Direct Playback for KKPhim provider:
 *    - Test Case 1 (Stream Generation):
 *        * Resolves test slug 'cuu-mon' via provider and Express stream endpoint.
 *        * Strictly asserts 'VIP Movies 🎬' name, [VIP • KKPhim] in-app title,
 *          local /hls/manifest.m3u8 proxy URL, and strictly NO externalUrl.
 *    - Test Case 2 (Manifest Proxy Verification):
 *        * Fetches HLS proxy manifest with anti-403 headers (Referer/Origin).
 *        * Validates HTTP 200, Content-Type mpegurl, CORS Access-Control-Allow-Origin: *,
 *          #EXTM3U tag, and Master/Media sub-playlist rewriting to /hls/ts.
 *    - Test Case 3 (Segment Playback Verification):
 *        * Downloads video chunk through /hls/ts segment proxy.
 *        * Validates HTTP 200 (No 403 Forbidden / 500 / 502), CORS *, video/mp2t MIME,
 *          binary buffer > 50KB, and standard MPEG-TS sync byte 0x47 at offset 0 & 188.
 *    - Self-Debug Loop:
 *        * Diagnostic failure reporting with actionable hints on any anomaly.
 *    - Server Lifecycle:
 *        * Ephemeral port binding (127.0.0.1:0) and clean teardown in finally block.
 * ==============================================================================
 */

const express = require('express');
const cors = require('cors');
const axios = require('axios');
const assert = require('assert');

const hlsRouter = require('../src/routes/hls');
const kkphim = require('../src/providers/kkphim');
const handlers = require('../src/handlers');

// ANSI Color formatting for clear test output
const GREEN  = '\x1b[32m';
const RED    = '\x1b[31m';
const CYAN   = '\x1b[36m';
const YELLOW = '\x1b[33m';
const BOLD   = '\x1b[1m';
const RESET  = '\x1b[0m';
const GRAY   = '\x1b[90m';

const TARGET_SLUG = 'cuu-mon';
const REQUEST_TIMEOUT_MS = 25000;

/**
 * Main E2E Playback Test Function
 */
async function runKKPhimPlaybackE2E() {
  const startTime = Date.now();
  console.log(`\n${BOLD}${CYAN}╔══════════════════════════════════════════════════════════════════════════════╗${RESET}`);
  console.log(`${BOLD}${CYAN}║     🎬 VIP MOVIES: KKPHIM E2E STREAM PLAYBACK & SELF-DEBUG VERIFICATION     ║${RESET}`);
  console.log(`${BOLD}${CYAN}╚══════════════════════════════════════════════════════════════════════════════╝${RESET}\n`);

  // 1. Initialize Express App on Ephemeral Port
  const app = express();
  app.use(cors());
  app.use(express.json());
  app.use('/hls', hlsRouter);
  app.use('/', handlers);

  const server = await new Promise((resolve, reject) => {
    const s = app.listen(0, '127.0.0.1', () => resolve(s));
    s.on('error', reject);
  });

  const port = server.address().port;
  const proxyBase = `http://127.0.0.1:${port}`;
  console.log(`${GRAY}ℹ️  Started local test server on ephemeral port:${RESET} ${BOLD}${port}${RESET}`);
  console.log(`${GRAY}ℹ️  Proxy Base URL:${RESET} ${proxyBase}\n`);

  let test1Passed = false;
  let test2Passed = false;
  let test3Passed = false;

  try {
    // ══════════════════════════════════════════════════════════════════════════
    //  TEST CASE 1: Stream Generation & In-App Protocol Compliance
    // ══════════════════════════════════════════════════════════════════════════
    console.log(`${BOLD}${CYAN}▶ TEST CASE 1: Stream Generation for slug "${TARGET_SLUG}"${RESET}`);

    // Test direct provider stream resolution
    let providerStreams = await kkphim.getStreams({
      slug: TARGET_SLUG,
      type: 'movie',
      proxyBase,
    });

    // Fallback if specific slug is modified upstream
    if (!providerStreams || providerStreams.length === 0) {
      console.warn(`${YELLOW}[Self-Debug] Target slug "${TARGET_SLUG}" returned 0 streams, querying active catalog...${RESET}`);
      const cat = await kkphim.getCatalog('phim-moi-cap-nhat', 1);
      if (cat && cat.length > 0) {
        const fallbackSlug = cat[0].id.replace(/^kkphim_/, '');
        console.log(`${YELLOW}[Self-Debug] Retrying with active catalog slug "${fallbackSlug}"...${RESET}`);
        providerStreams = await kkphim.getStreams({ slug: fallbackSlug, type: 'movie', proxyBase });
      }
    }

    assert.ok(
      Array.isArray(providerStreams) && providerStreams.length > 0,
      'Test Case 1 Failed: Direct provider call must return at least 1 stream'
    );

    // Test HTTP endpoint stream aggregator
    const streamEndpointRes = await axios.get(
      `${proxyBase}/stream/movie/kkphim:${TARGET_SLUG}.json`,
      { timeout: REQUEST_TIMEOUT_MS }
    );
    assert.strictEqual(
      streamEndpointRes.status,
      200,
      `Stream endpoint must return HTTP 200, got ${streamEndpointRes.status}`
    );
    assert.ok(
      Array.isArray(streamEndpointRes.data?.streams) && streamEndpointRes.data.streams.length > 0,
      'Stream endpoint response must contain non-empty streams array'
    );

    const targetStream = streamEndpointRes.data.streams.find(
      (s) => s.title && s.title.includes('[VIP • KKPhim]')
    );
    assert.ok(targetStream, 'Must contain a stream with title containing "[VIP • KKPhim]"');

    console.log(`  ${GRAY}Resolved Stream Object:${RESET}`, {
      name: targetStream.name,
      title: targetStream.title.replace(/\n/g, ' ↵ '),
      url: targetStream.url.slice(0, 85) + '...',
      hasExternalUrl: 'externalUrl' in targetStream,
      bingeGroup: targetStream.behaviorHints?.bingeGroup,
    });

    // Verify R1 Protocol Requirements & Invariants
    assert.strictEqual(targetStream.name, 'VIP Movies 🎬', 'Stream name must be "VIP Movies 🎬"');
    assert.ok(targetStream.title.includes('[VIP • KKPhim]'), 'Title must contain "[VIP • KKPhim]" badge');
    assert.ok(targetStream.title.includes('Full HD (HLS Proxy)'), 'Title must declare "(HLS Proxy)"');
    assert.ok(targetStream.title.includes('⚡ Server VIP • Phát trực tiếp trong App'), 'Title must declare in-app playback badge');
    assert.ok(!targetStream.title.includes('#'), 'Title must not contain "#" character');

    // Strict Stremio In-App Protocol Exclusivity
    assert.ok(
      typeof targetStream.url === 'string' && targetStream.url.startsWith(`${proxyBase}/hls/manifest.m3u8`),
      'Stream URL must route through local /hls/manifest.m3u8 proxy'
    );
    assert.strictEqual(targetStream.externalUrl, undefined, 'R1 Violation: externalUrl MUST be undefined');
    assert.ok(!('externalUrl' in targetStream), 'R1 Violation: externalUrl property key MUST NOT exist on stream object');
    assert.strictEqual(targetStream.behaviorHints?.notSupported, false, 'behaviorHints.notSupported must be false');
    assert.ok(typeof targetStream.behaviorHints?.bingeGroup === 'string', 'behaviorHints.bingeGroup must be string');

    test1Passed = true;
    console.log(`  ${GREEN}✅ PASS: Test Case 1 — Stream Generation verified (100% In-App Protocol Compliance)${RESET}\n`);

    // ══════════════════════════════════════════════════════════════════════════
    //  TEST CASE 2: Manifest Proxy Verification & Anti-403 Rewriting
    // ══════════════════════════════════════════════════════════════════════════
    console.log(`${BOLD}${CYAN}▶ TEST CASE 2: Manifest Proxy Verification & Anti-403 Rewriting${RESET}`);
    console.log(`  ${GRAY}Fetching manifest from proxy:${RESET} ${targetStream.url}`);

    const manifestRes = await axios.get(targetStream.url, { timeout: REQUEST_TIMEOUT_MS });
    assert.strictEqual(
      manifestRes.status,
      200,
      `Manifest proxy must return HTTP 200, got ${manifestRes.status}`
    );

    const contentType = manifestRes.headers['content-type'] || '';
    assert.ok(
      contentType.includes('application/vnd.apple.mpegurl'),
      `Manifest Content-Type must be application/vnd.apple.mpegurl, got ${contentType}`
    );
    assert.strictEqual(
      manifestRes.headers['access-control-allow-origin'],
      '*',
      'Manifest must include CORS header Access-Control-Allow-Origin: *'
    );
    assert.ok(
      typeof manifestRes.data === 'string' && manifestRes.data.includes('#EXTM3U'),
      'Manifest content must contain "#EXTM3U" header'
    );

    console.log(`  ${GRAY}Manifest snippet (first 180 chars):${RESET}\n    ${manifestRes.data.slice(0, 180).replace(/\n/g, '\n    ')}`);

    // Parse Master Playlist vs Media Playlist and resolve target .ts segment URL
    let targetSegmentUrl = null;
    const lines = String(manifestRes.data).split('\n').map((l) => l.trim()).filter(Boolean);

    for (const line of lines) {
      if (line.startsWith('http://') && line.includes('/hls/ts')) {
        targetSegmentUrl = line;
        break;
      }
      if (line.startsWith('http://') && line.includes('/hls/manifest.m3u8')) {
        console.log(`  ${GRAY}Master Playlist detected. Traversing sub-manifest variant:${RESET} ${line.slice(0, 85)}...`);
        const subRes = await axios.get(line, { timeout: REQUEST_TIMEOUT_MS });
        assert.strictEqual(subRes.status, 200, `Sub-manifest fetch must return HTTP 200, got ${subRes.status}`);
        assert.ok(
          (subRes.headers['content-type'] || '').includes('application/vnd.apple.mpegurl'),
          'Sub-manifest Content-Type must be application/vnd.apple.mpegurl'
        );
        assert.ok(subRes.data.includes('#EXTM3U'), 'Sub-manifest content must contain #EXTM3U');

        const subLines = String(subRes.data).split('\n').map((l) => l.trim()).filter(Boolean);
        for (const sLine of subLines) {
          if (sLine.startsWith('http://') && sLine.includes('/hls/ts')) {
            targetSegmentUrl = sLine;
            break;
          }
        }
        if (targetSegmentUrl) break;
      }
    }

    assert.ok(targetSegmentUrl, 'Test Case 2 Failed: Could not resolve rewritten /hls/ts segment URL from playlist');
    assert.ok(
      targetSegmentUrl.startsWith(`${proxyBase}/hls/ts?url=`),
      `Segment URL must route through ${proxyBase}/hls/ts?url=..., got ${targetSegmentUrl.slice(0, 60)}`
    );

    test2Passed = true;
    console.log(`  ${GREEN}✅ PASS: Test Case 2 — Manifest Proxy verified (Resolved Segment URL: ${targetSegmentUrl.slice(0, 80)}...)${RESET}\n`);

    // ══════════════════════════════════════════════════════════════════════════
    //  TEST CASE 3: Segment Playback & MPEG-TS Binary Delivery Verification
    // ══════════════════════════════════════════════════════════════════════════
    console.log(`${BOLD}${CYAN}▶ TEST CASE 3: Segment Playback Verification (Anti-403 & MPEG-TS Binary Buffer)${RESET}`);
    console.log(`  ${GRAY}Fetching video segment through proxy:${RESET} ${targetSegmentUrl.slice(0, 85)}...`);

    const segRes = await axios.get(targetSegmentUrl, {
      responseType: 'arraybuffer',
      timeout: REQUEST_TIMEOUT_MS,
    });

    assert.strictEqual(
      segRes.status,
      200,
      `Segment fetch must return HTTP 200 (got ${segRes.status})`
    );
    assert.notStrictEqual(segRes.status, 403, 'Segment request must NOT return 403 Forbidden');
    assert.notStrictEqual(segRes.status, 500, 'Segment request must NOT return 500 Internal Server Error');
    assert.notStrictEqual(segRes.status, 502, 'Segment request must NOT return 502 Bad Gateway');

    const segContentType = segRes.headers['content-type'] || '';
    assert.ok(
      segContentType.includes('video/mp2t') || segContentType.includes('application/octet-stream'),
      `Segment Content-Type must be video/mp2t or application/octet-stream, got ${segContentType}`
    );
    assert.strictEqual(
      segRes.headers['access-control-allow-origin'],
      '*',
      'Segment response must include CORS header Access-Control-Allow-Origin: *'
    );

    const buffer = Buffer.from(segRes.data);
    const sizeKB = Math.round(buffer.length / 1024);
    console.log(`  ${GRAY}Received binary segment buffer:${RESET} ${buffer.length} bytes (${sizeKB} KB)`);

    assert.ok(
      buffer.length > 50000,
      `Test Case 3 Failed: Segment buffer size must be > 50KB, got ${buffer.length} bytes (${sizeKB} KB)`
    );

    // Standard MPEG-TS Sync Byte (0x47 == 71) Validation
    assert.strictEqual(
      buffer[0],
      0x47,
      `Test Case 3 Failed: First byte of MPEG-TS segment must be 0x47 (sync byte), got 0x${buffer[0].toString(16)}`
    );

    if (buffer.length >= 189) {
      assert.strictEqual(
        buffer[188],
        0x47,
        `Test Case 3 Failed: Byte 188 of MPEG-TS segment must be 0x47 (188-byte packet boundary), got 0x${buffer[188].toString(16)}`
      );
    }

    test3Passed = true;
    console.log(`  ${GREEN}✅ PASS: Test Case 3 — Segment Binary Delivery verified (Valid MPEG-TS Sync Byte 0x47 & ${sizeKB} KB Buffer)${RESET}\n`);

    // ══════════════════════════════════════════════════════════════════════════
    //  SUMMARY & SUCCESS VERDICT
    // ══════════════════════════════════════════════════════════════════════════
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(2);
    console.log(`${BOLD}╔══════════════════════════════════════════════════════════════════════════════╗${RESET}`);
    console.log(`${BOLD}║            🎉 ALL 3 KKPHIM PLAYBACK TEST CASES PASSED (100% VERIFIED)        ║${RESET}`);
    console.log(`${BOLD}╠══════════════════════════════════════════════════════════════════════════════╣${RESET}`);
    console.log(`║  Test Case 1 (Stream Generation):        ${GREEN}PASSED${RESET} (In-App Proxy URL, No externalUrl)║`);
    console.log(`║  Test Case 2 (Manifest Proxy Rewriting): ${GREEN}PASSED${RESET} (HTTP 200, #EXTM3U, CORS *)      ║`);
    console.log(`║  Test Case 3 (Segment Binary Delivery):  ${GREEN}PASSED${RESET} (HTTP 200, ${buffer.length} B, 0x47 Sync)║`);
    console.log(`║  Total Execution Time:                   ${elapsed}s                                  ║`);
    console.log(`${BOLD}╚══════════════════════════════════════════════════════════════════════════════╝${RESET}\n`);

    return true;
  } catch (err) {
    console.error(`\n${RED}${BOLD}❌ [SELF-DEBUG FAILURE REPORT]${RESET}`);
    console.error(`   ${RED}Failed Stage:${RESET} ${!test1Passed ? 'Test Case 1 (Stream Generation)' : !test2Passed ? 'Test Case 2 (Manifest Proxy)' : 'Test Case 3 (Segment Playback)'}`);
    console.error(`   ${RED}Error Message:${RESET} ${err.message}`);

    if (err.response) {
      console.error(`   ${RED}HTTP Status:${RESET} ${err.response.status}`);
      console.error(`   ${RED}Response Headers:${RESET}`, err.response.headers);
      if (typeof err.response.data === 'string') {
        console.error(`   ${RED}Response Preview:${RESET} ${err.response.data.slice(0, 300)}`);
      }
    }

    if (err.stack) {
      console.error(`   ${GRAY}${err.stack.split('\n').slice(1, 5).join('\n   ')}${RESET}`);
    }

    console.error(`\n${YELLOW}${BOLD}🔍 SELF-DEBUG REMEDIATION HINTS:${RESET}`);
    if (!test1Passed) {
      console.error(`   1. Inspect src/providers/kkphim.js: getStreams() must format name: 'VIP Movies 🎬' and url.`);
      console.error(`   2. Verify phimapi.com endpoint connectivity.`);
    } else if (!test2Passed) {
      console.error(`   1. Inspect src/routes/hls.js: check getRefererHeaders() injection for upstream CDNs.`);
      console.error(`   2. Verify manifest line rewriter for #EXT-X-STREAM-INF and .m3u8 URIs.`);
    } else {
      console.error(`   1. Inspect src/routes/hls.js: check /ts route stream pipe logic.`);
      console.error(`   2. Check if upstream CDN is returning HTTP 403 hotlink protection.`);
    }

    throw err;
  } finally {
    server.close();
    console.log(`${GRAY}[Teardown] Ephemeral test server on port ${port} closed cleanly.${RESET}`);
  }
}

// Direct CLI execution support
if (require.main === module) {
  runKKPhimPlaybackE2E()
    .then(() => {
      process.exit(0);
    })
    .catch(() => {
      process.exit(1);
    });
}

module.exports = { runKKPhimPlaybackE2E };
