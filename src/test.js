'use strict';

/**
 * ============================================================
 *  NguonC Stremio Addon - src/test.js
 *  Script kiểm tra tất cả các endpoint của addon
 *  Chạy: node src/test.js
 * ============================================================
 */

const http = require('http');
const app = require('./index');

let BASE_URL = `http://127.0.0.1:${process.env.PORT || 7000}`;
let ephemeralServer = null;
let passed = 0;
let failed = 0;

// ─── Helper: HTTP GET ─────────────────────────────────────────
function get(path) {
  return new Promise((resolve, reject) => {
    const url = `${BASE_URL}${path}`;
    http
      .get(url, (res) => {
        let data = '';
        res.on('data', (chunk) => (data += chunk));
        res.on('end', () => {
          try {
            resolve({
              status: res.statusCode,
              headers: res.headers,
              body: JSON.parse(data),
            });
          } catch {
            resolve({ status: res.statusCode, headers: res.headers, body: data });
          }
        });
      })
      .on('error', reject);
  });
}

// ─── Helper: Assert ───────────────────────────────────────────
function assert(condition, message) {
  if (condition) {
    console.log(`  ✅ ${message}`);
    passed++;
  } else {
    console.log(`  ❌ FAIL: ${message}`);
    failed++;
  }
}

// ─── Tests ────────────────────────────────────────────────────
async function runTests() {
  // Start ephemeral server if port 7000 isn't already our target
  ephemeralServer = await new Promise((resolve) => {
    const s = app.listen(0, '127.0.0.1', () => resolve(s));
  });
  const port = ephemeralServer.address().port;
  BASE_URL = `http://127.0.0.1:${port}`;

  console.log('');
  console.log('╔══════════════════════════════════════════════════════╗');
  console.log('║         🧪  VIP Movies Addon - Integration Tests     ║');
  console.log('╚══════════════════════════════════════════════════════╝');
  console.log(`📡 Base URL: ${BASE_URL}`);
  console.log('');

  // ── TEST 1: Manifest ────────────────────────────────────────
  console.log('📋 TEST 1: Manifest');
  try {
    const res = await get('/manifest.json');
    assert(res.status === 200, `Status 200 (got ${res.status})`);
    assert(
      res.headers['access-control-allow-origin'] === '*',
      'CORS header: Access-Control-Allow-Origin: *'
    );
    assert(res.body.id === 'org.vipmovies.stremio.addon' || res.body.id === 'org.nguonc.stremio.addon', `Manifest ID đúng`);
    assert(Array.isArray(res.body.resources), 'resources là mảng');
    const resourceNames = res.body.resources.map((r) => (typeof r === 'string' ? r : r?.name));
    assert(resourceNames.includes('catalog'), 'resources có catalog');
    assert(resourceNames.includes('meta'), 'resources có meta');
    assert(resourceNames.includes('stream'), 'resources có stream');
    assert(Array.isArray(res.body.types), 'types là mảng');
    assert(res.body.types.includes('movie'), 'types có movie');
    assert(res.body.types.includes('series'), 'types có series');
    assert(Array.isArray(res.body.catalogs), 'catalogs là mảng');
    assert(res.body.catalogs.length >= 2, 'Có ít nhất 2 catalog');
    assert(Array.isArray(res.body.idPrefixes), 'idPrefixes là mảng');
    assert(res.body.idPrefixes.some((p) => p.includes('nguonc')), 'idPrefixes có "nguonc"');
  } catch (err) {
    console.log(`  ❌ Lỗi: ${err.message}`);
    failed++;
  }

  // ── TEST 2: Catalog - Movie ─────────────────────────────────
  console.log('\n📋 TEST 2: Catalog Movie (latest)');
  try {
    const res = await get('/catalog/movie/nguonc-movie-latest.json');
    assert(res.status === 200, `Status 200`);
    assert(res.body.metas !== undefined, 'Response có field "metas"');
    assert(Array.isArray(res.body.metas), '"metas" là mảng');
    if (res.body.metas.length > 0) {
      const first = res.body.metas[0];
      assert(first.id && (first.id.includes('nguonc') || first.id.includes('vsmov') || first.id.includes('kkphim')), 'ID có provider prefix');
      assert(first.type === 'movie', 'Type là "movie"');
      assert(first.name, 'Có trường name');
      assert(first.poster, 'Có trường poster');
    }
  } catch (err) {
    console.log(`  ❌ Lỗi: ${err.message}`);
    failed++;
  }

  // ── TEST 3: Catalog - Series ────────────────────────────────
  console.log('\n📋 TEST 3: Catalog Series (latest)');
  try {
    const res = await get('/catalog/series/nguonc-series-latest.json');
    assert(res.status === 200, `Status 200`);
    assert(Array.isArray(res.body.metas), '"metas" là mảng');
    if (res.body.metas.length > 0) {
      const first = res.body.metas[0];
      assert(first.id && (first.id.includes('nguonc') || first.id.includes('vsmov') || first.id.includes('kkphim')), 'ID có provider prefix');
      assert(first.type === 'series', 'Type là "series"');
    }
  } catch (err) {
    console.log(`  ❌ Lỗi: ${err.message}`);
    failed++;
  }

  // ── TEST 4: Catalog - Search ────────────────────────────────
  console.log('\n📋 TEST 4: Catalog - Tìm kiếm');
  try {
    const keyword = encodeURIComponent('search=phim');
    const res = await get(`/catalog/movie/nguonc-movie-latest/${keyword}.json`);
    assert(res.status === 200, `Status 200`);
    assert(Array.isArray(res.body.metas), '"metas" là mảng');
    console.log(`  ℹ️  Tìm thấy ${res.body.metas.length} phim lẻ`);
  } catch (err) {
    console.log(`  ❌ Lỗi: ${err.message}`);
    failed++;
  }

  // ── TEST 5: Catalog - Genre ─────────────────────────────────
  console.log('\n📋 TEST 5: Catalog - Lọc theo thể loại');
  try {
    const extra = encodeURIComponent('genre=Hành Động');
    const res = await get(`/catalog/movie/nguonc-movie-latest/${extra}.json`);
    assert(res.status === 200, `Status 200`);
    assert(Array.isArray(res.body.metas), '"metas" là mảng');
    console.log(`  ℹ️  Tìm thấy ${res.body.metas.length} phim hành động`);
  } catch (err) {
    console.log(`  ❌ Lỗi: ${err.message}`);
    failed++;
  }

  // ── TEST 6: Meta - Phim lẻ ──────────────────────────────────
  console.log('\n📋 TEST 6: Meta - Phim lẻ (nu-hiep-ruy-bang)');
  try {
    const res = await get('/meta/movie/nguonc:nu-hiep-ruy-bang.json');
    assert(res.status === 200, `Status 200`);
    assert(res.body.meta, 'Response có "meta"');
    if (res.body.meta) {
      assert(res.body.meta.id === 'nguonc:nu-hiep-ruy-bang', 'Meta ID đúng');
      assert(res.body.meta.name, 'Có tên phim');
      assert(res.body.meta.type === 'movie', 'Type là "movie"');
      console.log(`  ℹ️  Phim: ${res.body.meta.name}`);
    }
  } catch (err) {
    console.log(`  ❌ Lỗi: ${err.message}`);
    failed++;
  }

  // ── TEST 7: Meta - Phim bộ ──────────────────────────────────
  console.log('\n📋 TEST 7: Meta - Phim bộ (pham-nhan-tu-tien)');
  try {
    const res = await get('/meta/series/nguonc:pham-nhan-tu-tien.json');
    assert(res.status === 200, `Status 200`);
    assert(res.body.meta, 'Response có "meta"');
    if (res.body.meta) {
      assert(res.body.meta.id === 'nguonc:pham-nhan-tu-tien', 'Meta ID đúng');
      assert(Array.isArray(res.body.meta.videos), 'Có danh sách videos');
      if (res.body.meta.videos.length > 0) {
        const firstVideo = res.body.meta.videos[0];
        assert(firstVideo.id.includes('nguonc:'), 'Video ID có prefix nguonc:');
        assert(firstVideo.title, 'Video có title');
        assert(firstVideo.released, 'Video có released date');
        console.log(
          `  ℹ️  Tổng ${res.body.meta.videos.length} tập, VD: "${firstVideo.title}"`
        );
      }
    }
  } catch (err) {
    console.log(`  ❌ Lỗi: ${err.message}`);
    failed++;
  }

  // ── TEST 8: Stream - Phim lẻ ────────────────────────────────
  console.log('\n📋 TEST 8: Stream - Phim lẻ');
  try {
    const res = await get('/stream/movie/nguonc:nu-hiep-ruy-bang.json');
    assert(res.status === 200, `Status 200`);
    assert(Array.isArray(res.body.streams), '"streams" là mảng');
    if (res.body.streams.length > 0) {
      const s = res.body.streams[0];
      assert(s.name, 'Stream có name');
      assert(s.externalUrl || s.url, 'Stream có URL');
      console.log(`  ℹ️  ${res.body.streams.length} stream(s), URL: ${(s.externalUrl || s.url || '').substring(0, 60)}...`);
    } else {
      console.log('  ⚠️  Không có stream (có thể API thay đổi)');
    }
  } catch (err) {
    console.log(`  ❌ Lỗi: ${err.message}`);
    failed++;
  }

  // ── TEST 9: Stream - Phim bộ ────────────────────────────────
  console.log('\n📋 TEST 9: Stream - Phim bộ (tập 1)');
  try {
    const videoId = encodeURIComponent('nguonc:pham-nhan-tu-tien:0:1');
    const res = await get(`/stream/series/${videoId}.json`);
    assert(res.status === 200, `Status 200`);
    assert(Array.isArray(res.body.streams), '"streams" là mảng');
    if (res.body.streams.length > 0) {
      const s = res.body.streams[0];
      console.log(`  ℹ️  ${res.body.streams.length} stream(s) cho tập 1`);
      console.log(`     Server: "${s.title}"`);
    }
  } catch (err) {
    console.log(`  ❌ Lỗi: ${err.message}`);
    failed++;
  }

  // ── TEST 10: Health check ────────────────────────────────────
  console.log('\n📋 TEST 10: Health Check');
  try {
    const res = await get('/health');
    assert(res.status === 200, `Status 200`);
    assert(res.body.status === 'ok', 'Status là "ok"');
    assert(res.body.version, 'Có version');
    console.log(`  ℹ️  Version: ${res.body.version}`);
  } catch (err) {
    console.log(`  ❌ Lỗi: ${err.message}`);
    failed++;
  }

  // ─── Kết quả ─────────────────────────────────────────────────
  console.log('');
  console.log('╔══════════════════════════════════════════════════════╗');
  console.log(`║  Kết quả: ${passed} passed, ${failed} failed`.padEnd(55) + '║');
  if (failed === 0) {
    console.log('║  🎉 Tất cả tests đều PASS!                           ║');
  } else {
    console.log(`║  ⚠️  Có ${failed} test(s) thất bại.`.padEnd(55) + '║');
  }
  if (ephemeralServer) {
    try { ephemeralServer.close(); } catch {}
  }

  process.exit(failed > 0 ? 1 : 0);
}

// Chờ server khởi động (nếu chạy cùng lúc)
setTimeout(runTests, 1000);
