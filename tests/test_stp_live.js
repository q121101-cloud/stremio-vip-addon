'use strict';

/**
 * ============================================================
 *  VIP Movies Addon — tests/test_stp_live.js
 *  Dedicated Live Verification Suite for STP (Sưu Tầm Phim)
 * ============================================================
 */

require('dotenv').config();
const axios = require('axios');
const http = require('http');
const app = require('../src/index');
const stpProvider = require('../src/providers/stp');

const GREEN = '\x1b[32m';
const RED = '\x1b[31m';
const CYAN = '\x1b[36m';
const YELLOW = '\x1b[33m';
const BOLD = '\x1b[1m';
const RESET = '\x1b[0m';

let passedCount = 0;
let failedCount = 0;

function assert(condition, message) {
  if (condition) {
    console.log(`  ${GREEN}✅ ${message}${RESET}`);
    passedCount++;
  } else {
    console.error(`  ${RED}❌ FAILED: ${message}${RESET}`);
    failedCount++;
  }
}

async function runStpLiveTest() {
  console.log(`${BOLD}${CYAN}╔══════════════════════════════════════════════════════════════╗${RESET}`);
  console.log(`${BOLD}${CYAN}║      🎬 STP (SƯU TẦM PHIM) LIVE VERIFICATION SUITE           ║${RESET}`);
  console.log(`${BOLD}${CYAN}╚══════════════════════════════════════════════════════════════╝${RESET}\n`);

  // Start local server for HLS Proxy testing
  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;
  const proxyBase = `http://127.0.0.1:${port}`;
  console.log(`🔵 Local test server running at ${proxyBase}\n`);

  try {
    // ─── 1. Live Search Tests ("Shin" and "Cửu Môn") ────────────
    console.log(`${BOLD}${YELLOW}▶ TEST 1: Live Search Engine ("Shin" & "Cửu Môn")${RESET}`);
    
    console.log(`   ⏳ Searching keyword "Shin"...`);
    const shinResults = await stpProvider.search('Shin', 1);
    assert(Array.isArray(shinResults) && shinResults.length > 0, `Search "Shin" returned ${shinResults.length} items (> 0)`);
    if (shinResults.length > 0) {
      console.log(`      Sample item: "${shinResults[0].name}" (slug: ${shinResults[0].slug})`);
      assert(Boolean(shinResults[0].slug), `Search item has valid slug: ${shinResults[0].slug}`);
    }

    console.log(`\n   ⏳ Searching keyword "Cửu Môn"...`);
    const cuuMonResults = await stpProvider.search('Cửu Môn', 1);
    assert(Array.isArray(cuuMonResults) && cuuMonResults.length > 0, `Search "Cửu Môn" returned ${cuuMonResults.length} items (> 0)`);
    if (cuuMonResults.length > 0) {
      console.log(`      Sample item: "${cuuMonResults[0].name}" (slug: ${cuuMonResults[0].slug})`);
      assert(Boolean(cuuMonResults[0].slug), `Search item has valid slug: ${cuuMonResults[0].slug}`);
    }

    // ─── 2. Fetch Detail & Extract Streams (Movie & Series) ─────
    console.log(`\n${BOLD}${YELLOW}▶ TEST 2: Movie & Series Stream Resolution${RESET}`);

    console.log(`   ⏳ Resolving movie streams (Shin Cậu Bé Bút Chì)...`);
    const movieStreams = await stpProvider.getStreams({
      type: 'movie',
      id: 'stp-shin-movie',
      title: 'Shin Cậu Bé Bút Chì',
      proxyBase,
    });
    assert(Array.isArray(movieStreams) && movieStreams.length > 0, `Resolved ${movieStreams.length} stream(s) for movie Shin`);
    if (movieStreams.length > 0) {
      console.log(`      First stream title: "${movieStreams[0].title.split('\n')[0]}"`);
      assert(Boolean(movieStreams[0].url), `Stream contains proxy url`);
      assert(!movieStreams[0].externalUrl, `STRICT INVARIANT: Stream has NO externalUrl`);
    }

    console.log(`\n   ⏳ Resolving series streams (Cửu Môn / Episode 1)...`);
    const seriesStreams = await stpProvider.getStreams({
      type: 'series',
      id: 'stp-cuu-mon-series',
      title: 'Cửu Môn',
      season: 1,
      episode: 1,
      proxyBase,
    });
    assert(Array.isArray(seriesStreams) && seriesStreams.length > 0, `Resolved ${seriesStreams.length} stream(s) for series Cửu Môn`);
    if (seriesStreams.length > 0) {
      console.log(`      First stream title: "${seriesStreams[0].title.split('\n')[0]}"`);
      assert(Boolean(seriesStreams[0].url), `Stream contains proxy url`);
      assert(!seriesStreams[0].externalUrl, `STRICT INVARIANT: Stream has NO externalUrl`);
    }

    // ─── 3. Manifest Verification & Video Chunk Download ─────────
    console.log(`\n${BOLD}${YELLOW}▶ TEST 3: Manifest Verification & Video Chunk Download${RESET}`);

    const targetStream = movieStreams[0] || seriesStreams[0];
    if (!targetStream || !targetStream.url) {
      throw new Error('No valid target stream found for playback test');
    }

    console.log(`   ⏳ Fetching M3U8 Manifest: ${targetStream.url.slice(0, 100)}...`);
    const manifestRes = await axios.get(targetStream.url, { timeout: 10000 });
    assert(manifestRes.status === 200, `Manifest returned HTTP 200 OK`);
    assert(manifestRes.data && manifestRes.data.includes('#EXTM3U'), `Manifest body contains valid #EXTM3U header`);

    let manifestContent = manifestRes.data;
    let segmentUrl = null;

    // Check if master playlist containing sub-variants
    if (manifestContent.includes('#EXT-X-STREAM-INF') || manifestContent.includes('/hls/manifest.m3u8')) {
      const subVariantMatch = manifestContent.match(/http:\/\/127\.0\.0\.1:\d+\/hls\/manifest\.m3u8\?[^\s\r\n]+/i);
      if (subVariantMatch) {
        console.log(`   ⏳ Traversing Master Playlist to sub-variant...`);
        const subRes = await axios.get(subVariantMatch[0], { timeout: 10000 });
        assert(subRes.status === 200, `Sub-variant manifest returned HTTP 200 OK`);
        manifestContent = subRes.data;
      }
    }

    // Find rewritten segment URL
    const segMatches = manifestContent.match(/http:\/\/127\.0\.0\.1:\d+\/hls\/segment\.ts\?[^\s\r\n]+/gi) || [];
    assert(segMatches.length > 0, `Found ${segMatches.length} rewritten video TS segments in playlist`);

    if (segMatches.length > 0) {
      segmentUrl = segMatches[0];
      console.log(`   ⏳ Downloading first video chunk (> 50 KB)...`);
      const segRes = await axios.get(segmentUrl, { responseType: 'arraybuffer', timeout: 15000 });
      const segBuf = Buffer.from(segRes.data);

      assert(segRes.status === 200 || segRes.status === 206, `Video chunk fetch returned HTTP ${segRes.status}`);
      const sizeKB = (segBuf.length / 1024).toFixed(1);
      assert(segBuf.length > 50 * 1024, `Video chunk payload size: ${sizeKB} KB (> 50 KB)`);
      
      const firstByte = segBuf[0];
      const isValidSync = firstByte === 0x47 || firstByte === 0x89;
      assert(isValidSync, `Video chunk media sync byte verified (0x${firstByte.toString(16).toUpperCase()})`);
    }

    console.log(`\n══════════════════════════════════════════════════════════════`);
    console.log(`${BOLD}🏁 SUMMARY: ${GREEN}${passedCount} PASSED${RESET}, ${failedCount > 0 ? RED : GREEN}${failedCount} FAILED${RESET}`);
    console.log(`══════════════════════════════════════════════════════════════\n`);

    if (failedCount > 0) {
      process.exit(1);
    }
  } catch (err) {
    console.error(`\n❌ ERROR DURING STP VERIFICATION:`, err.message);
    process.exit(1);
  } finally {
    server.close();
  }
}

runStpLiveTest();
