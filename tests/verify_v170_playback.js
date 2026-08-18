'use strict';

/**
 * ============================================================
 *  VIP Movies Addon — tests/verify_v170_playback.js (Engine v1.7.0)
 *  End-to-End Live Playback & Verification Suite
 *
 *  Coverage:
 *  1. Ephemeral Server Start & Catalog Verification (STP, CLBPX, YAN)
 *  2. KDrama & US-UK Resolution: Teach You A Lesson, A Shop for Killers, Avengers 3
 *  3. Strict Donghua Guard: YAN returns 0 streams for KDrama/Hollywood
 *  4. Real M3U8 & TS Video Segments Playback (>100KB, valid sync byte)
 *  5. HTTP Range 206 Seeking Support on live segment
 * ============================================================
 */

const axios = require('axios');
const app = require('../src/index');

const DEFAULT_TOKEN = 'default';
let passed = 0;
let failed = 0;
let warnings = 0;
const errors = [];

const GREEN  = '\x1b[32m✅\x1b[0m';
const RED    = '\x1b[31m❌\x1b[0m';
const YELLOW = '\x1b[33m⚠️\x1b[0m';
const CYAN   = '\x1b[36m🔵\x1b[0m';

function assert(condition, message) {
  if (condition) {
    console.log(`  ${GREEN} ${message}`);
    passed++;
  } else {
    console.log(`  ${RED} ${message}`);
    failed++;
    errors.push(message);
  }
}

function warn(message) {
  console.log(`  ${YELLOW} ${message}`);
  warnings++;
}

function encodeBase64(str) {
  return Buffer.from(str, 'utf8').toString('base64url');
}

async function get(url, opts = {}) {
  try {
    const res = await axios({
      url,
      method: 'GET',
      timeout: 25000,
      maxRedirects: 5,
      validateStatus: () => true,
      ...opts,
    });
    return res;
  } catch (err) {
    return { status: 0, data: null, headers: {}, error: err.message };
  }
}

async function run() {
  console.log('\n╔══════════════════════════════════════════════════════════════╗');
  console.log('║   🧪 VIP MOVIES ADDON v1.7.0 — E2E VERIFICATION SUITE       ║');
  console.log('╚══════════════════════════════════════════════════════════════╝\n');

  const server = app.listen(0);
  const port = server.address().port;
  const BASE = `http://127.0.0.1:${port}`;
  console.log(`${CYAN} Test server running at ${BASE}\n`);

  try {
    // ─────────────────────────────────────────────────────────────
    //  PHASE 1: Catalog Verification for New HTML Scrapers
    // ─────────────────────────────────────────────────────────────
    console.log('▶ PHASE 1: Catalog Scraping Verification (STP, CLBPX, YAN)');
    
    // STP Catalog
    const stpCatRes = await get(`${BASE}/${DEFAULT_TOKEN}/catalog/movie/stp-phim-le.json`);
    assert(stpCatRes.status === 200, 'GET /catalog/movie/stp-phim-le.json → HTTP 200');
    assert(Array.isArray(stpCatRes.data?.metas) && stpCatRes.data.metas.length > 0, `STP catalog returned ${stpCatRes.data?.metas?.length || 0} metas (> 0)`);
    if (stpCatRes.data?.metas?.length > 0) {
      assert(!!stpCatRes.data.metas[0].name, `STP item 1 name: "${stpCatRes.data.metas[0].name}"`);
    }

    // CLBPX Catalog
    const clbpxCatRes = await get(`${BASE}/${DEFAULT_TOKEN}/catalog/series/clbpx-hong-kong.json`);
    assert(clbpxCatRes.status === 200, 'GET /catalog/series/clbpx-hong-kong.json → HTTP 200');
    assert(Array.isArray(clbpxCatRes.data?.metas) && clbpxCatRes.data.metas.length > 0, `CLBPX catalog returned ${clbpxCatRes.data?.metas?.length || 0} metas (> 0)`);
    if (clbpxCatRes.data?.metas?.length > 0) {
      assert(!!clbpxCatRes.data.metas[0].name, `CLBPX item 1 name: "${clbpxCatRes.data.metas[0].name}"`);
    }

    // YAN Catalog
    const yanCatRes = await get(`${BASE}/${DEFAULT_TOKEN}/catalog/series/yan-dang-chieu.json`);
    assert(yanCatRes.status === 200, 'GET /catalog/series/yan-dang-chieu.json → HTTP 200');
    assert(Array.isArray(yanCatRes.data?.metas) && yanCatRes.data.metas.length > 0, `YAN catalog returned ${yanCatRes.data?.metas?.length || 0} metas (> 0)`);

    // ─────────────────────────────────────────────────────────────
    //  PHASE 2: KDrama & US-UK Resolution & Playback Check
    // ─────────────────────────────────────────────────────────────
    console.log('\n▶ PHASE 2: KDrama & US-UK Multi-Keyword Stream Resolution');

    // 2A: Teach You A Lesson S01E01 (KDrama)
    console.log('\n  [2A] Checking Teach You A Lesson S1E1 (KDrama)...');
    const tyalRes = await get(`${BASE}/${DEFAULT_TOKEN}/stream/series/koreandrama%3Ateach-you-a-lesson%3A1%3A1.json`);
    assert(tyalRes.status === 200, 'GET stream for Teach You A Lesson → HTTP 200');
    const tyalStreams = tyalRes.data?.streams || [];
    console.log(`  -> Found ${tyalStreams.length} stream(s) for Teach You A Lesson`);
    assert(tyalStreams.length > 0, 'Found active streams for Teach You A Lesson');
    
    // Check YAN Guard on KDrama
    const yanJunk = tyalStreams.filter(s => (s.title || '').includes('YAN'));
    assert(yanJunk.length === 0, 'STRICT DONGHUA GUARD: YAN returned 0 junk streams for KDrama Teach You A Lesson');

    // Verify In-App Invariants on streams
    for (const s of tyalStreams) {
      assert(!s.externalUrl, `Stream "${s.title.split('\n')[0]}" strictly has NO externalUrl`);
      assert(s.url && s.url.includes('/hls/'), `Stream "${s.title.split('\n')[0]}" uses HLS proxy URL`);
    }

    // 2B: A Shop for Killers S01E01 (KDrama)
    console.log('\n  [2B] Checking A Shop for Killers S1E1 (KDrama)...');
    const asfkRes = await get(`${BASE}/${DEFAULT_TOKEN}/stream/series/koreandrama%3Aa-shop-for-killers%3A1%3A1.json`);
    assert(asfkRes.status === 200, 'GET stream for A Shop for Killers → HTTP 200');
    const asfkStreams = asfkRes.data?.streams || [];
    console.log(`  -> Found ${asfkStreams.length} stream(s) for A Shop for Killers`);
    assert(asfkStreams.length > 0, 'Found active streams for A Shop for Killers');

    // 2C: Avengers 3 (Movie)
    console.log('\n  [2C] Checking Avengers 3 / Infinity War (tt5095030)...');
    const avgRes = await get(`${BASE}/${DEFAULT_TOKEN}/stream/movie/tt5095030.json`);
    assert(avgRes.status === 200, 'GET stream for Avengers 3 (tt5095030) → HTTP 200');
    const avgStreams = avgRes.data?.streams || [];
    console.log(`  -> Found ${avgStreams.length} stream(s) for Avengers 3`);
    assert(avgStreams.length > 0, 'Found active streams for Avengers 3');

    // ─────────────────────────────────────────────────────────────
    //  PHASE 3: Live Playback — M3U8 Parsing & 2 TS Chunks Download
    // ─────────────────────────────────────────────────────────────
    console.log('\n▶ PHASE 3: Live Playback — M3U8 Parsing & 2 TS Chunks Download');

    let testedSegmentUrl = null;
    const standardTsStream = tyalStreams.find(s => s.title.includes('KKPhim') || s.title.includes('NguonC')) || tyalStreams[0];
    if (standardTsStream && standardTsStream.url) {
      console.log(`  Testing live playback from: ${standardTsStream.title.split('\n')[0]}`);
      
      // Step 1: Fetch M3U8
      const m3u8Res = await get(standardTsStream.url);
      assert(m3u8Res.status === 200, `Fetch M3U8 manifest → HTTP 200`);
      const m3u8Body = String(m3u8Res.data || '');
      assert(m3u8Body.startsWith('#EXTM3U'), `Manifest body starts with #EXTM3U`);

      // Find segment URLs in manifest
      const lines = m3u8Body.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
      const segmentUrls = lines.filter(l => l.includes('/hls/segment.ts') || l.includes('/hls/ts'));
      const subVariantUrls = lines.filter(l => l.includes('/hls/manifest.m3u8') || l.includes('/hls/m3u8'));

      let targetSegmentUrls = segmentUrls;
      if (segmentUrls.length === 0 && subVariantUrls.length > 0) {
        console.log(`  Traversing master playlist to sub-variant: ${subVariantUrls[0]}`);
        const subRes = await get(subVariantUrls[0]);
        assert(subRes.status === 200, `Fetch Sub-variant M3U8 → HTTP 200`);
        const subBody = String(subRes.data || '');
        targetSegmentUrls = subBody.split(/\r?\n/).map(l => l.trim()).filter(l => l.includes('/hls/segment.ts') || l.includes('/hls/ts'));
      }

      console.log(`  Found ${targetSegmentUrls.length} rewritten segment URL(s) in playlist`);
      assert(targetSegmentUrls.length >= 2, `Playlist contains at least 2 TS segments (found ${targetSegmentUrls.length})`);

      // Download Segment 1
      if (targetSegmentUrls.length >= 1) {
        testedSegmentUrl = targetSegmentUrls[0];
        console.log(`  Downloading TS Segment 1...`);
        const seg1Res = await get(targetSegmentUrls[0], { responseType: 'arraybuffer' });
        assert(seg1Res.status === 200 || seg1Res.status === 206, `TS Segment 1 fetch → HTTP ${seg1Res.status}`);
        const buf1 = Buffer.from(seg1Res.data || []);
        console.log(`  -> Segment 1 size: ${(buf1.length / 1024).toFixed(1)} KB, byte[0]=0x${(buf1[0] || 0).toString(16)}`);
        assert(buf1.length > 100000, `TS Segment 1 size > 100KB (${(buf1.length / 1024).toFixed(1)} KB)`);
        assert(buf1[0] === 0x47 || buf1[0] === 0x89, `TS Segment 1 has valid stream sync byte (0x47 or 0x89 PNG)`);
      }

      // Download Segment 2
      if (targetSegmentUrls.length >= 2) {
        console.log(`  Downloading TS Segment 2...`);
        const seg2Res = await get(targetSegmentUrls[1], { responseType: 'arraybuffer' });
        assert(seg2Res.status === 200 || seg2Res.status === 206, `TS Segment 2 fetch → HTTP ${seg2Res.status}`);
        const buf2 = Buffer.from(seg2Res.data || []);
        console.log(`  -> Segment 2 size: ${(buf2.length / 1024).toFixed(1)} KB, byte[0]=0x${(buf2[0] || 0).toString(16)}`);
        assert(buf2.length > 100000, `TS Segment 2 size > 100KB (${(buf2.length / 1024).toFixed(1)} KB)`);
        assert(buf2[0] === 0x47 || buf2[0] === 0x89, `TS Segment 2 has valid stream sync byte (0x47 or 0x89 PNG)`);
      }
    }

    // ─────────────────────────────────────────────────────────────
    //  PHASE 4: HTTP Range 206 Seeking Verification on Live Segment
    // ─────────────────────────────────────────────────────────────
    console.log('\n▶ PHASE 4: HTTP Range 206 Seeking Verification on Live Segment');
    if (testedSegmentUrl) {
      console.log(`  Testing HTTP Range request on: ${testedSegmentUrl.slice(0, 70)}...`);
      const rangeRes = await get(testedSegmentUrl, {
        headers: { Range: 'bytes=0-1023' },
        responseType: 'arraybuffer',
      });
      assert(rangeRes.status === 206, `HTTP Range request → HTTP 206 Partial Content`);
      assert(!!rangeRes.headers['content-range'], `Content-Range header present: ${rangeRes.headers['content-range']}`);
      const rangeBuf = Buffer.from(rangeRes.data || []);
      assert(rangeBuf.length === 1024, `Range buffer length is exactly 1024 bytes (got ${rangeBuf.length})`);
    } else {
      warn('No live segment URL captured to test HTTP Range request');
    }

  } catch (err) {
    console.error(`\n${RED} Fatal test suite error:`, err.message);
    failed++;
    errors.push(`Fatal error: ${err.message}`);
  } finally {
    server.close();
  }

  // ─────────────────────────────────────────────────────────────
  //  SUMMARY
  // ─────────────────────────────────────────────────────────────
  console.log('\n══════════════════════════════════════════════════════════════');
  console.log('🏁 SUITE RESULTS SUMMARY');
  console.log('══════════════════════════════════════════════════════════════');
  console.log(`  ${GREEN} Passed  : ${passed}`);
  console.log(`  ${RED} Failed  : ${failed}`);
  if (warnings > 0) console.log(`  ${YELLOW} Warnings: ${warnings}`);

  if (failed > 0) {
    console.log('\nFailed assertions:');
    errors.forEach((e) => console.log(`  ✗ ${e}`));
    console.log('');
    process.exit(1);
  } else {
    console.log(`\n🎉 ALL ${passed} ASSERTIONS PASSED — ENGINE v1.7.0 FULLY VERIFIED!\n`);
    process.exit(0);
  }
}

run();
