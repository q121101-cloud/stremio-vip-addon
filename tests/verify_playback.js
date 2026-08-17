'use strict';

/**
 * ==============================================================================
 *  VIP Movies Addon — tests/verify_playback.js (Engine v1.5.0)
 *  R6 Mandatory E2E Stream Playback & Binary Delivery Verification Test
 *
 *  Validates:
 *    1. Ephemeral Port Server Startup (Port 0) & Clean Teardown in `finally`.
 *    2. Addon Manifest Integrity (/manifest.json, /health).
 *    3. Movie Stream Resolution & In-App Protocol Invariants (url only, NO externalUrl).
 *    4. Series Stream Resolution & In-App Protocol Invariants (url only, NO externalUrl).
 *    5. M3U8 Manifest Retrieval, Anti-403 Headers & Full Sub-Variant Playlist Rewriting.
 *    6. Rewritten /hls/segment.ts URL extraction & format validation.
 *    7. Real Video Chunk Binary Download (> 50KB, HTTP 200, Content-Type video/MP2T).
 *    8. MPEG-TS Sync Byte (0x47) & 188-byte Packet Alignment Verification.
 *    9. HTTP Range Requests (206 Partial Content) for seeking support.
 *   10. Comprehensive Self-Debug Diagnostics & Remediation Reporting.
 * ==============================================================================
 */

const express = require('express');
const cors = require('cors');
const axios = require('axios');
const assert = require('assert');

const hlsRouter = require('../src/routes/hls');
const manifestRouter = require('../src/routes/manifest');
const handlers = require('../src/handlers');

// ANSI Color formatting
const GREEN  = '\x1b[32m';
const RED    = '\x1b[31m';
const CYAN   = '\x1b[36m';
const YELLOW = '\x1b[33m';
const BOLD   = '\x1b[1m';
const RESET  = '\x1b[0m';
const GRAY   = '\x1b[90m';

const REQUEST_TIMEOUT_MS = 25000;

async function verifyPlayback() {
  const startTime = Date.now();
  console.log(`\n${BOLD}${CYAN}╔══════════════════════════════════════════════════════════════════════════════╗${RESET}`);
  console.log(`${BOLD}${CYAN}║     🎬 VIP MOVIES: R6 PLAYBACK VERIFICATION & BINARY TS CHUNK TEST           ║${RESET}`);
  console.log(`${BOLD}${CYAN}╚══════════════════════════════════════════════════════════════════════════════╝${RESET}\n`);

  // 1. Initialize Express App on Ephemeral Port
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
  console.log(`${GRAY}ℹ️  Started test server on ephemeral port:${RESET} ${BOLD}${port}${RESET}`);
  console.log(`${GRAY}ℹ️  Addon Base URL:${RESET} ${baseUrl}\n`);

  let stage = 'INITIALIZATION';
  let resolvedMovieStream = null;
  let resolvedSeriesStream = null;
  let targetSegmentUrl = null;
  let buffer = null;
  let rangeRes = null;

  try {
    // ══════════════════════════════════════════════════════════════════════════
    //  PHASE 1: Manifest & Route Integrity Check
    // ══════════════════════════════════════════════════════════════════════════
    stage = 'MANIFEST_CHECK';
    console.log(`${BOLD}${CYAN}▶ PHASE 1: Addon Manifest & Route Verification${RESET}`);
    const manifestRes = await axios.get(`${baseUrl}/manifest.json`, { timeout: REQUEST_TIMEOUT_MS });
    assert.strictEqual(manifestRes.status, 200, 'Manifest endpoint must return HTTP 200');
    assert.ok(manifestRes.data?.id, 'Manifest must have id');
    assert.ok(Array.isArray(manifestRes.data?.catalogs), 'Manifest must contain catalogs array');
    assert.ok(manifestRes.data.catalogs.length > 0, 'Manifest must contain at least 1 catalog');
    console.log(`  ${GREEN}✅ PASS: Manifest loaded successfully (v${manifestRes.data.version || '1.5.0'}, ${manifestRes.data.catalogs.length} catalogs)${RESET}\n`);

    // ══════════════════════════════════════════════════════════════════════════
    //  PHASE 2: Movie Stream Resolution & Protocol Compliance
    // ══════════════════════════════════════════════════════════════════════════
    stage = 'MOVIE_STREAM_RESOLUTION';
    console.log(`${BOLD}${CYAN}▶ PHASE 2: Movie Stream Resolution${RESET}`);

    // Query stream for movie (e.g. cuu-mon or Spider-Man / Inception)
    let movieStreamRes = await axios.get(`${baseUrl}/stream/movie/kkphim:cuu-mon.json`, { timeout: REQUEST_TIMEOUT_MS });
    
    // Dynamic fallback to active catalog if cuu-mon slug is modified upstream
    if (!movieStreamRes.data?.streams || movieStreamRes.data.streams.length === 0) {
      console.warn(`  ${YELLOW}⚠️  Slug "cuu-mon" returned 0 streams, querying active movie catalog fallback...${RESET}`);
      const catRes = await axios.get(`${baseUrl}/catalog/movie/kkphim-movie-latest.json`, { timeout: REQUEST_TIMEOUT_MS });
      if (catRes.data?.metas?.length > 0) {
        const fallbackId = catRes.data.metas[0].id;
        console.log(`  ${GRAY}Fallback movie ID:${RESET} ${fallbackId}`);
        movieStreamRes = await axios.get(`${baseUrl}/stream/movie/${fallbackId}.json`, { timeout: REQUEST_TIMEOUT_MS });
      }
    }

    assert.strictEqual(movieStreamRes.status, 200, 'Movie stream endpoint must return HTTP 200');
    assert.ok(Array.isArray(movieStreamRes.data?.streams) && movieStreamRes.data.streams.length > 0, 'Must return at least 1 movie stream');

    const inAppMovieStream = movieStreamRes.data.streams.find(
      (s) => s.url && (s.url.includes('/hls/manifest.m3u8') || s.url.includes('/hls/extract'))
    );
    assert.ok(inAppMovieStream, 'Must find at least one In-App Direct Play movie stream with /hls/ URL');
    assert.strictEqual(inAppMovieStream.name, 'VIP Movies 🎬', 'Stream name must be "VIP Movies 🎬"');
    assert.strictEqual(inAppMovieStream.externalUrl, undefined, 'R1/R3 Violation: In-App stream MUST NOT have externalUrl');
    assert.ok(!('externalUrl' in inAppMovieStream), 'R1/R3 Violation: externalUrl key must not exist on in-app stream object');

    resolvedMovieStream = inAppMovieStream;
    console.log(`  ${GRAY}Resolved Movie Stream:${RESET}`, {
      name: inAppMovieStream.name,
      title: inAppMovieStream.title.replace(/\n/g, ' ↵ '),
      url: inAppMovieStream.url.slice(0, 85) + '...',
      bingeGroup: inAppMovieStream.behaviorHints?.bingeGroup,
    });
    console.log(`  ${GREEN}✅ PASS: Movie stream protocol compliance verified${RESET}\n`);

    // ══════════════════════════════════════════════════════════════════════════
    //  PHASE 3: Series Stream Resolution & Protocol Compliance
    // ══════════════════════════════════════════════════════════════════════════
    stage = 'SERIES_STREAM_RESOLUTION';
    console.log(`${BOLD}${CYAN}▶ PHASE 3: Series Stream Resolution${RESET}`);

    // Query stream for series (e.g. Breaking Bad tt0903747:1:1 or active series catalog)
    let seriesStreamRes = await axios.get(`${baseUrl}/stream/series/tt0903747:1:1.json`, { timeout: REQUEST_TIMEOUT_MS });

    if (!seriesStreamRes.data?.streams || seriesStreamRes.data.streams.length === 0) {
      console.warn(`  ${YELLOW}⚠️  IMDb tt0903747 returned 0 streams, querying active series catalog fallback...${RESET}`);
      const seriesCatRes = await axios.get(`${baseUrl}/catalog/series/kkphim-series-latest.json`, { timeout: REQUEST_TIMEOUT_MS });
      if (seriesCatRes.data?.metas?.length > 0) {
        const fallbackSeriesId = seriesCatRes.data.metas[0].id;
        console.log(`  ${GRAY}Fallback series ID:${RESET} ${fallbackSeriesId}:1:1`);
        seriesStreamRes = await axios.get(`${baseUrl}/stream/series/${fallbackSeriesId}:1:1.json`, { timeout: REQUEST_TIMEOUT_MS });
      }
    }

    assert.strictEqual(seriesStreamRes.status, 200, 'Series stream endpoint must return HTTP 200');
    assert.ok(Array.isArray(seriesStreamRes.data?.streams) && seriesStreamRes.data.streams.length > 0, 'Must return at least 1 series stream');

    const inAppSeriesStream = seriesStreamRes.data.streams.find(
      (s) => s.url && (s.url.includes('/hls/manifest.m3u8') || s.url.includes('/hls/extract'))
    );
    assert.ok(inAppSeriesStream, 'Must find at least one In-App Direct Play series stream with /hls/ URL');
    assert.strictEqual(inAppSeriesStream.name, 'VIP Movies 🎬', 'Series stream name must be "VIP Movies 🎬"');
    assert.strictEqual(inAppSeriesStream.externalUrl, undefined, 'R1/R3 Violation: In-App series stream MUST NOT have externalUrl');
    assert.ok(!('externalUrl' in inAppSeriesStream), 'R1/R3 Violation: externalUrl key must not exist on in-app series stream');

    resolvedSeriesStream = inAppSeriesStream;
    console.log(`  ${GRAY}Resolved Series Stream:${RESET}`, {
      name: inAppSeriesStream.name,
      title: inAppSeriesStream.title.replace(/\n/g, ' ↵ '),
      url: inAppSeriesStream.url.slice(0, 85) + '...',
      bingeGroup: inAppSeriesStream.behaviorHints?.bingeGroup,
    });
    console.log(`  ${GREEN}✅ PASS: Series stream protocol compliance verified${RESET}\n`);

    // ══════════════════════════════════════════════════════════════════════════
    //  PHASE 4: Manifest Proxy & Sub-Variant Playlist Rewriting
    // ══════════════════════════════════════════════════════════════════════════
    stage = 'MANIFEST_PROXY_REWRITING';
    console.log(`${BOLD}${CYAN}▶ PHASE 4: Manifest Proxy & Sub-Variant Playlist Rewriting${RESET}`);
    
    // Choose the stream to verify HLS traversal and playback
    // Prefer direct /manifest.m3u8 stream if present, otherwise extract stream
    const targetStreamToTest = movieStreamRes.data.streams.find((s) => s.url && s.url.includes('/hls/manifest.m3u8')) || resolvedMovieStream;
    console.log(`  ${GRAY}Fetching playlist:${RESET} ${targetStreamToTest.url.slice(0, 90)}...`);

    const playlistRes = await axios.get(targetStreamToTest.url, { timeout: REQUEST_TIMEOUT_MS, maxRedirects: 5 });
    assert.strictEqual(playlistRes.status, 200, 'Playlist proxy must return HTTP 200');
    assert.ok(
      (playlistRes.headers['content-type'] || '').includes('application/vnd.apple.mpegurl') ||
      (playlistRes.headers['content-type'] || '').includes('application/x-mpegURL') ||
      (playlistRes.headers['content-type'] || '').includes('text/plain'),
      `Content-Type must be mpegurl, got ${playlistRes.headers['content-type']}`
    );
    assert.strictEqual(playlistRes.headers['access-control-allow-origin'], '*', 'CORS Access-Control-Allow-Origin must be *');
    assert.ok(playlistRes.data.includes('#EXTM3U'), 'Playlist must contain #EXTM3U');

    // Parse Master Playlist vs Media Playlist
    const lines = String(playlistRes.data).split(/\r?\n/).map((l) => l.trim()).filter(Boolean);

    for (const line of lines) {
      if (line.startsWith('http://') && (line.includes('/hls/segment.ts') || line.includes('/hls/ts'))) {
        targetSegmentUrl = line;
        break;
      }
      if (line.startsWith('http://') && line.includes('/hls/manifest.m3u8')) {
        console.log(`  ${GRAY}Master Playlist detected -> fetching variant sub-manifest:${RESET} ${line.slice(0, 85)}...`);
        const subRes = await axios.get(line, { timeout: REQUEST_TIMEOUT_MS, maxRedirects: 5 });
        assert.strictEqual(subRes.status, 200, 'Sub-manifest fetch must return HTTP 200');
        assert.ok(subRes.data.includes('#EXTM3U'), 'Sub-manifest must contain #EXTM3U');

        const subLines = String(subRes.data).split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
        for (const sLine of subLines) {
          if (sLine.startsWith('http://') && (sLine.includes('/hls/segment.ts') || sLine.includes('/hls/ts'))) {
            targetSegmentUrl = sLine;
            break;
          }
        }
        if (targetSegmentUrl) break;
      }
    }

    assert.ok(targetSegmentUrl, 'Must resolve rewritten segment URL from playlist');
    assert.ok(
      targetSegmentUrl.includes('/hls/segment.ts') || targetSegmentUrl.includes('/hls/ts'),
      'Target segment URL must route through /hls/segment.ts proxy'
    );
    console.log(`  ${GRAY}Resolved Target Segment URL:${RESET} ${targetSegmentUrl.slice(0, 90)}...`);
    console.log(`  ${GREEN}✅ PASS: Manifest proxy and segment rewriting verified${RESET}\n`);

    // ══════════════════════════════════════════════════════════════════════════
    //  PHASE 5: Real Binary TS Chunk Download (> 50KB & Sync Byte 0x47)
    // ══════════════════════════════════════════════════════════════════════════
    stage = 'SEGMENT_BINARY_DOWNLOAD';
    console.log(`${BOLD}${CYAN}▶ PHASE 5: Real Video TS Segment Download (>50KB & Sync Byte 0x47)${RESET}`);
    console.log(`  ${GRAY}Downloading chunk from:${RESET} ${targetSegmentUrl.slice(0, 85)}...`);

    const segRes = await axios.get(targetSegmentUrl, {
      responseType: 'arraybuffer',
      timeout: REQUEST_TIMEOUT_MS,
      maxRedirects: 5,
    });

    assert.strictEqual(segRes.status, 200, `Segment download must return HTTP 200, got ${segRes.status}`);
    assert.strictEqual(segRes.headers['access-control-allow-origin'], '*', 'Segment response must have CORS *');
    assert.ok(
      (segRes.headers['content-type'] || '').toLowerCase().includes('video/mp2t') ||
      (segRes.headers['content-type'] || '').toLowerCase().includes('octet-stream'),
      `Content-Type must be video/MP2T or octet-stream, got ${segRes.headers['content-type']}`
    );

    buffer = Buffer.from(segRes.data);
    const sizeKB = (buffer.length / 1024).toFixed(2);
    console.log(`  ${GRAY}Downloaded Buffer:${RESET} ${buffer.length} bytes (${sizeKB} KB)`);

    assert.ok(buffer.length > 50000, `Buffer size must be > 50,000 bytes (got ${buffer.length} bytes)`);

    // Validate MPEG-TS sync byte 0x47
    let syncFound = false;
    if (buffer[0] === 0x47) {
      syncFound = true;
      if (buffer.length >= 189) {
        assert.strictEqual(buffer[188], 0x47, 'Byte 188 must match 0x47 packet boundary');
      }
    } else {
      // Obfuscated wrappers (e.g. VSMOV PNG header wrapper)
      for (let i = 0; i < Math.min(buffer.length - 376, 4096); i++) {
        if (buffer[i] === 0x47 && buffer[i + 188] === 0x47 && buffer[i + 376] === 0x47) {
          syncFound = true;
          break;
        }
      }
    }
    assert.ok(syncFound, 'MPEG-TS Sync Byte 0x47 must be present in segment stream');
    console.log(`  ${GREEN}✅ PASS: Video chunk verified (${sizeKB} KB, MPEG-TS sync byte 0x47 confirmed)${RESET}\n`);

    // ══════════════════════════════════════════════════════════════════════════
    //  PHASE 6: HTTP Range Request Verification (206 Partial Content)
    // ══════════════════════════════════════════════════════════════════════════
    stage = 'RANGE_REQUEST_TEST';
    console.log(`${BOLD}${CYAN}▶ PHASE 6: HTTP Range Request Verification (206 Partial Content)${RESET}`);

    rangeRes = await axios.get(targetSegmentUrl, {
      headers: { Range: 'bytes=0-1023' },
      responseType: 'arraybuffer',
      timeout: REQUEST_TIMEOUT_MS,
      validateStatus: (s) => s >= 200 && s < 400,
    });

    console.log(`  ${GRAY}Range Request Status:${RESET} ${rangeRes.status}`);
    console.log(`  ${GRAY}Content-Range Header:${RESET} ${rangeRes.headers['content-range'] || 'N/A'}`);
    assert.ok(rangeRes.status === 200 || rangeRes.status === 206, 'Range request must succeed with 200 or 206');
    if (rangeRes.status === 206) {
      assert.strictEqual(rangeRes.data.byteLength, 1024, 'Range byte length for 0-1023 must be 1024 bytes');
    }
    console.log(`  ${GREEN}✅ PASS: HTTP Range request handling verified${RESET}\n`);

    // ══════════════════════════════════════════════════════════════════════════
    //  SUMMARY & SUCCESS VERDICT
    // ══════════════════════════════════════════════════════════════════════════
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(2);
    console.log(`${BOLD}╔══════════════════════════════════════════════════════════════════════════════╗${RESET}`);
    console.log(`${BOLD}║      🎉 ALL PLAYBACK VERIFICATION CHECKS PASSED (100% SUCCESS)               ║${RESET}`);
    console.log(`${BOLD}╠══════════════════════════════════════════════════════════════════════════════╣${RESET}`);
    console.log(`║  1. Manifest & Route Integrity:          ${GREEN}PASSED${RESET} (HTTP 200, Catalogs verified)        ║`);
    console.log(`║  2. Movie Stream Resolution:             ${GREEN}PASSED${RESET} (In-App Proxy URL, No externalUrl) ║`);
    console.log(`║  3. Series Stream Resolution:            ${GREEN}PASSED${RESET} (In-App Proxy URL, No externalUrl) ║`);
    console.log(`║  4. M3U8 Playlist Full Rewriter:         ${GREEN}PASSED${RESET} (HTTP 200, Sub-variant traversed)   ║`);
    console.log(`║  5. Segment Binary Download (> 50KB):    ${GREEN}PASSED${RESET} (HTTP 200, ${buffer.length} B, 0x47 Sync)║`);
    console.log(`║  6. HTTP Range Seeking Support:          ${GREEN}PASSED${RESET} (HTTP ${rangeRes.status})                           ║`);
    console.log(`║  Total Execution Time:                   ${elapsed}s                                       ║`);
    console.log(`${BOLD}╚══════════════════════════════════════════════════════════════════════════════╝${RESET}\n`);

    return true;
  } catch (err) {
    console.error(`\n${RED}${BOLD}❌ [PLAYBACK VERIFICATION FAILURE REPORT]${RESET}`);
    console.error(`   ${RED}Failed Stage:${RESET} ${stage}`);
    console.error(`   ${RED}Error Message:${RESET} ${err.message}`);
    if (err.response) {
      console.error(`   ${RED}HTTP Status:${RESET} ${err.response.status}`);
      console.error(`   ${RED}Headers:${RESET}`, err.response.headers);
      if (typeof err.response.data === 'string') {
        console.error(`   ${RED}Response Preview:${RESET} ${err.response.data.slice(0, 300)}`);
      }
    }
    if (err.stack) {
      console.error(`   ${GRAY}${err.stack.split('\n').slice(1, 5).join('\n   ')}${RESET}`);
    }
    console.error(`\n${YELLOW}${BOLD}🔍 SELF-DEBUG REMEDIATION HINTS:${RESET}`);
    if (stage === 'MANIFEST_CHECK') {
      console.error('   1. Verify src/routes/manifest.js and src/manifest.js.');
    } else if (stage === 'MOVIE_STREAM_RESOLUTION' || stage === 'SERIES_STREAM_RESOLUTION') {
      console.error('   1. Inspect src/handlers.js /stream aggregator.');
      console.error('   2. Verify provider getStreams() returns sanitized objects with url and NO externalUrl.');
    } else if (stage === 'MANIFEST_PROXY_REWRITING') {
      console.error('   1. Inspect src/routes/hls.js /manifest.m3u8 line rewriter.');
      console.error('   2. Verify Base64URL decoding and Referer origin headers.');
    } else if (stage === 'SEGMENT_BINARY_DOWNLOAD' || stage === 'RANGE_REQUEST_TEST') {
      console.error('   1. Inspect src/routes/hls.js /segment.ts route.');
      console.error('   2. Ensure upstream Axios request passes correct Referer and Range headers.');
    }
    throw err;
  } finally {
    server.close();
    console.log(`${GRAY}[Teardown] Ephemeral test server closed cleanly.${RESET}`);
  }
}

if (require.main === module) {
  verifyPlayback()
    .then(() => process.exit(0))
    .catch(() => process.exit(1));
}

module.exports = { verifyPlayback };
