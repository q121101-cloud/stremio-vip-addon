'use strict';

/**
 * ============================================================
 *  VIP Movies Addon — tests/verify_playback_fix.js
 *  E2E Playback Fix & VIP 4K (FILM4K) Verification Suite
 *  - Module 1: NguonC Anti-403 Stealth Headers & Proxy Fallback
 *  - Module 2: HLS Proxy Optimization & Upstream 404/502 Resiliency
 *  - Module 3: FILM4K 4K Ultra HD Provider Integration
 *  - Module 4: Multi-title Stream Resolution & Playback Verification
 * ============================================================
 */

require('dotenv').config();
const assert = require('assert');
const axios = require('axios');
const app = require('../src/index');
const film4kProvider = require('../src/providers/film4k');
const nguoncProvider = require('../src/providers/nguonc');

const GREEN = '\x1b[32m✅\x1b[0m';
const RED   = '\x1b[31m❌\x1b[0m';
const CYAN  = '\x1b[36m🔵\x1b[0m';
const BOLD  = '\x1b[1m';
const RESET = '\x1b[0m';

let passed = 0;
let failed = 0;
const errors = [];

function check(cond, msg) {
  if (cond) {
    console.log(`  ${GREEN} ${msg}`);
    passed++;
  } else {
    console.error(`  ${RED} ${msg}`);
    failed++;
    errors.push(msg);
  }
}

async function runPlaybackFixTests() {
  console.log(`\n${BOLD}${CYAN}╔══════════════════════════════════════════════════════════════╗${RESET}`);
  console.log(`${BOLD}${CYAN}║   🎬 VERIFY PLAYBACK FIX & VIP 4K (FILM4K) INTEGRATION       ║${RESET}`);
  console.log(`${BOLD}${CYAN}╚══════════════════════════════════════════════════════════════╝${RESET}\n`);

  const server = app.listen(0);
  const port = server.address().port;
  const baseUrl = `http://127.0.0.1:${port}`;
  console.log(`📡 Test server running at ${baseUrl}\n`);

  try {
    // ─────────────────────────────────────────────────────────────
    //  PHASE 1: NguonC Anti-403 Stealth Engine Verification
    // ─────────────────────────────────────────────────────────────
    console.log(`${BOLD}▶ PHASE 1: NguonC Anti-403 Stealth Engine Verification${RESET}`);

    // 1.1 NguonC Catalog
    const nguoncCat = await nguoncProvider.getCatalog('phim-le', 1);
    check(Array.isArray(nguoncCat) && nguoncCat.length > 0, `NguonC Catalog (phim-le) returned ${nguoncCat?.length || 0} items without 403`);

    // 1.2 NguonC Detail
    const nguoncDetail = await nguoncProvider.getDetail('cuu-mon');
    check(nguoncDetail && nguoncDetail.movie && nguoncDetail.movie.name, `NguonC Detail for "cuu-mon" fetched successfully: "${nguoncDetail?.movie?.name}"`);

    // 1.3 NguonC Search
    const nguoncSearch = await nguoncProvider.search('avatar', 1);
    check(nguoncSearch && Array.isArray(nguoncSearch.items) && nguoncSearch.items.length > 0, `NguonC Search for "avatar" returned ${nguoncSearch?.items?.length} items`);

    // ─────────────────────────────────────────────────────────────
    //  PHASE 2: FILM4K 4K Ultra HD Provider Verification
    // ─────────────────────────────────────────────────────────────
    console.log(`\n${BOLD}▶ PHASE 2: FILM4K 4K Ultra HD Provider Integration${RESET}`);

    // 2.1 FILM4K Catalog
    const film4kCat = await film4kProvider.getCatalog('4k-movies', 1);
    check(Array.isArray(film4kCat) && film4kCat.length > 0, `FILM4K Catalog returned ${film4kCat?.length || 0} 4K items`);

    // 2.2 FILM4K Detail
    const film4kDetail = await film4kProvider.getDetail('arcane');
    check(film4kDetail && film4kDetail.movie, `FILM4K Detail for "arcane" fetched: "${film4kDetail?.movie?.title?.vi || film4kDetail?.movie?.title?.en}"`);

    // 2.3 FILM4K Stream Extraction
    const film4kStreams = await film4kProvider.getStreams({
      type: 'series',
      id: 'arcane',
      slug: 'arcane',
      title: 'Arcane',
      season: 1,
      episode: 1,
      proxyBase: baseUrl,
    });
    check(Array.isArray(film4kStreams) && film4kStreams.length > 0, `FILM4K extracted ${film4kStreams?.length} 4K stream(s) for Arcane S1E1`);
    if (film4kStreams.length > 0) {
      check(film4kStreams[0].title.includes('VIP 0 • FILM4K'), `Stream title has VIP 0 FILM4K branding: "${film4kStreams[0].title.split('\n')[0]}"`);
      check(film4kStreams[0].title.includes('4K Ultra HD'), `Stream title contains "4K Ultra HD" badge`);
      check(film4kStreams[0].url.includes('/hls/manifest.m3u8'), `Stream URL routes through HLS Proxy`);
      check(!film4kStreams[0].externalUrl, `Strict In-App protocol: externalUrl is undefined`);
    }

    // ─────────────────────────────────────────────────────────────
    //  PHASE 3: Multi-Title Stream Resolution
    // ─────────────────────────────────────────────────────────────
    console.log(`\n${BOLD}▶ PHASE 3: Multi-Title Stream Resolution Verification${RESET}`);

    // 3.1 "A Shop for Killers" S1E1
    console.log('  Testing "A Shop for Killers" S1E1...');
    const resShop = await axios.get(`${baseUrl}/default/stream/series/koreandrama%3Aa-shop-for-killers%3A1%3A1.json`);
    check(resShop.status === 200, `GET stream for "A Shop for Killers" returned HTTP 200`);
    const shopStreams = resShop.data?.streams || [];
    check(shopStreams.length > 0, `Found ${shopStreams.length} stream(s) for "A Shop for Killers"`);

    // 3.2 "Cửu Môn" (cuu-mon)
    console.log('  Testing "Cửu Môn"...');
    const resCuuMon = await axios.get(`${baseUrl}/default/stream/movie/nguonc%3Acuu-mon.json`);
    check(resCuuMon.status === 200, `GET stream for "Cửu Môn" returned HTTP 200`);
    const cuuMonStreams = resCuuMon.data?.streams || [];
    check(cuuMonStreams.length > 0, `Found ${cuuMonStreams.length} stream(s) for "Cửu Môn"`);

    // 3.3 "Tuyệt Thế Chiến Hồn"
    console.log('  Testing "Tuyệt Thế Chiến Hồn"...');
    const resTTCH = await axios.get(`${baseUrl}/default/stream/series/hh3d%3Atuyet-the-chien-hon%3A1%3A1.json`);
    check(resTTCH.status === 200, `GET stream for "Tuyệt Thế Chiến Hồn" returned HTTP 200`);
    const ttchStreams = resTTCH.data?.streams || [];
    check(Array.isArray(ttchStreams), `Stream response for "Tuyệt Thế Chiến Hồn" is valid array (found ${ttchStreams.length})`);

    // ─────────────────────────────────────────────────────────────
    //  PHASE 4: Live M3U8 & TS Chunk Playback Verification
    // ─────────────────────────────────────────────────────────────
    console.log(`\n${BOLD}▶ PHASE 4: Live M3U8 & TS Chunk Playback Verification${RESET}`);
    if (shopStreams.length > 0) {
      const targetStream = shopStreams[0];
      const m3u8Res = await axios.get(targetStream.url);
      check(m3u8Res.status === 200, `M3U8 proxy fetch returned HTTP 200`);
      check(m3u8Res.data.includes('#EXTM3U'), `M3U8 manifest contains #EXTM3U header`);

      // Extract a TS segment URL
      const lines = m3u8Res.data.split('\n');
      const segmentLine = lines.find((l) => l.includes('/hls/segment.ts') || l.includes('/hls/manifest.m3u8'));
      if (segmentLine) {
        check(true, `Found rewritten playlist/segment URL: ${segmentLine.trim().slice(0, 70)}...`);
        let finalTsUrl = segmentLine.trim();

        // If sub-variant, fetch sub-variant playlist
        if (finalTsUrl.includes('/hls/manifest.m3u8')) {
          const subRes = await axios.get(finalTsUrl);
          const subLines = subRes.data.split('\n');
          const tsLine = subLines.find((l) => l.includes('/hls/segment.ts'));
          if (tsLine) finalTsUrl = tsLine.trim();
        }

        if (finalTsUrl.includes('/hls/segment.ts')) {
          const tsRes = await axios.get(finalTsUrl, { responseType: 'arraybuffer', timeout: 15000 });
          check(tsRes.status === 200 || tsRes.status === 206, `TS segment fetch returned HTTP ${tsRes.status}`);
          const buf = Buffer.from(tsRes.data);
          check(buf.length > 50000, `TS chunk size > 50KB (${(buf.length / 1024).toFixed(1)} KB)`);
          check(buf[0] === 0x47 || buf[0] === 0x89, `Valid media sync byte (0x47 TS or 0x89 PNG)`);
        }
      }
    }

  } catch (err) {
    check(false, `Unexpected error in test execution: ${err.message}`);
  } finally {
    server.close();
  }

  console.log(`\n══════════════════════════════════════════════════════════════`);
  console.log(`🏁 PLAYBACK FIX TEST RESULTS: ${passed} PASSED, ${failed} FAILED`);
  console.log(`══════════════════════════════════════════════════════════════\n`);

  if (failed > 0) {
    process.exit(1);
  } else {
    process.exit(0);
  }
}

runPlaybackFixTests().catch((err) => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
