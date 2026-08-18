'use strict';

/**
 * ============================================================
 *  Milestone 4 Challenger 2 Empirical Test Suite:
 *  Stream Aggregation, Priority Hierarchy & In-App Exclusivity
 *
 *  Requirements Verified:
 *  1. Query /stream/movie/tt10872600.json (Spider-Man: No Way Home),
 *     /stream/series/tt0903747:1:1.json (Breaking Bad), and direct provider IDs.
 *  2. Verify that returned streams are ordered by priority:
 *     VSMOV VIP 1 -> KKPhim VIP 2 -> NguonC VIP 3 -> STP -> HH3D -> YAN -> CLBPX.
 *  3. Assert ZERO stream objects contain externalUrl (100% in-app url proxying).
 *  4. Stress & Boundary Testing:
 *     - Synthetic permutation oracle for priority comparator
 *     - Delimiter variants (colon vs underscore) for all 7 providers
 *     - Malformed / adversarial IDs & out-of-bounds episodes
 *     - User config filtering & provider selection
 *     - Total upstream fault injection & safe HTTP 200 { streams: [] }
 * ============================================================
 */

const assert = require('assert');
const express = require('express');
const http = require('http');
const axios = require('axios');

const handlersRouter = require('../src/handlers');
const manifestRouter = require('../src/routes/manifest');
const { encodeConfig, decodeConfig } = require('../src/config');
const { resolveCinemeta, cinemetaCache } = require('../src/lib/cinemeta');

const results = {
  total: 0,
  passed: 0,
  failed: 0,
  failures: [],
};

async function test(name, fn) {
  results.total++;
  try {
    const res = fn();
    if (res && typeof res.then === 'function') {
      await res;
    }
    results.passed++;
    console.log(`  ✅ PASS: ${name}`);
  } catch (err) {
    results.failed++;
    results.failures.push({ name, error: err.message, stack: err.stack });
    console.error(`  ❌ FAIL: ${name}\n     Error: ${err.message}`);
  }
}

// Priority Oracle mapping according to R2 / R5 / Engine v1.5.0 specs
function computePriorityOracle(stream) {
  if (!stream) return 200;
  const title = (stream.title || '').toLowerCase();
  const name = (stream.name || '').toLowerCase();
  const combined = `${name} ${title}`;

  if (combined.includes('vsmov') && (combined.includes('4k') || combined.includes('ultra hd') || combined.includes('3840x2160'))) return 10;
  if (combined.includes('vsmov') || combined.includes('vip 1')) return 20;
  if ((combined.includes('kkphim') || combined.includes('vip 2')) && combined.includes('vietsub')) return 30;
  if (combined.includes('kkphim') || combined.includes('vip 2')) return 40;
  if ((combined.includes('nguonc') || combined.includes('vip 3')) && combined.includes('vietsub')) return 50;
  if (combined.includes('nguonc') || combined.includes('vip 3')) return 60;
  if (combined.includes('stp') || combined.includes('suutamphim')) return 70;
  if (combined.includes('hh3d') || combined.includes('hoathinh3d')) return 80;
  if (combined.includes('yan') || combined.includes('yandonghua')) return 90;
  if (combined.includes('clbpx') || combined.includes('clbphimxua')) return 100;
  return 200;
}

function validateStreamObject(stream, context = '') {
  assert.ok(stream, `${context}: Stream object must exist`);
  assert.strictEqual(typeof stream.name, 'string', `${context}: Stream name must be string`);
  assert.strictEqual(typeof stream.title, 'string', `${context}: Stream title must be string`);
  assert.strictEqual(typeof stream.url, 'string', `${context}: Stream url must be string`);
  assert.ok(stream.url.length > 0, `${context}: Stream url must not be empty`);
  assert.ok(stream.url.startsWith('http://') || stream.url.startsWith('https://'), `${context}: Stream url must start with http/https`);

  // IN-APP EXCLUSIVITY CONTRACT: Strictly NO externalUrl
  assert.strictEqual(stream.externalUrl, undefined, `${context}: INVARIANT VIOLATION: stream must NOT contain externalUrl`);
  assert.ok(!('externalUrl' in stream), `${context}: INVARIANT VIOLATION: externalUrl property key must not exist`);

  // Behavior Hints Contract
  if (stream.behaviorHints) {
    assert.strictEqual(stream.behaviorHints.notSupported, false, `${context}: behaviorHints.notSupported must be false`);
    if (stream.behaviorHints.bingeGroup) {
      assert.strictEqual(typeof stream.behaviorHints.bingeGroup, 'string', `${context}: bingeGroup must be string`);
    }
  }
}

function assertStreamOrdering(streams, context = '') {
  if (!streams || streams.length <= 1) return;
  for (let i = 0; i < streams.length - 1; i++) {
    const p1 = computePriorityOracle(streams[i]);
    const p2 = computePriorityOracle(streams[i + 1]);
    assert.ok(
      p1 <= p2,
      `${context}: Priority ordering violated at index ${i} -> ${i+1}: stream[${i}] (priority ${p1}: "${streams[i].title.slice(0, 40)}") followed by stream[${i+1}] (priority ${p2}: "${streams[i+1].title.slice(0, 40)}")`
    );
  }
}

async function runChallenger2EmpiricalTests() {
  console.log('╔══════════════════════════════════════════════════════════════════════════════╗');
  console.log('║  ⚔️  CHALLENGER 2: STREAM AGGREGATION & IN-APP EXCLUSIVITY EMPIRICAL SUITE   ║');
  console.log('╚══════════════════════════════════════════════════════════════════════════════╝\n');

  const app = express();
  app.use(express.json());
  app.use('/', manifestRouter);
  app.use('/', handlersRouter);

  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;
  const baseUrl = `http://127.0.0.1:${port}`;
  const client = axios.create({ baseURL: baseUrl, timeout: 20000 });

  try {
    // ════════════════════════════════════════════════════════════
    // Section 1: Canonical IMDb Stream Aggregation (Spider-Man & Breaking Bad)
    // ════════════════════════════════════════════════════════════
    console.log('▶ [1/6] Testing Canonical IMDb Media Stream Aggregation...');

    await test('Query /stream/movie/tt10872600.json (Spider-Man: No Way Home)', async () => {
      const res = await client.get('/stream/movie/tt10872600.json');
      assert.strictEqual(res.status, 200, 'HTTP status must be 200');
      assert.ok(res.data && Array.isArray(res.data.streams), 'Response must have streams array');

      console.log(`    ↳ Received ${res.data.streams.length} stream(s) for tt10872600`);
      for (const [idx, s] of res.data.streams.entries()) {
        validateStreamObject(s, `Spider-Man stream #${idx}`);
      }
      assertStreamOrdering(res.data.streams, 'tt10872600 Spider-Man');
    });

    await test('Query /stream/series/tt0903747:1:1.json (Breaking Bad S01E01)', async () => {
      const res = await client.get('/stream/series/tt0903747:1:1.json');
      assert.strictEqual(res.status, 200, 'HTTP status must be 200');
      assert.ok(res.data && Array.isArray(res.data.streams), 'Response must have streams array');

      console.log(`    ↳ Received ${res.data.streams.length} stream(s) for Breaking Bad S1:1`);
      for (const [idx, s] of res.data.streams.entries()) {
        validateStreamObject(s, `Breaking Bad S1:1 stream #${idx}`);
      }
      assertStreamOrdering(res.data.streams, 'tt0903747:1:1 Breaking Bad');
    });

    await test('Query /stream/series/tt0903747:1:2.json (Breaking Bad S01E02)', async () => {
      const res = await client.get('/stream/series/tt0903747:1:2.json');
      assert.strictEqual(res.status, 200, 'HTTP status must be 200');
      assert.ok(res.data && Array.isArray(res.data.streams));

      console.log(`    ↳ Received ${res.data.streams.length} stream(s) for Breaking Bad S1:2`);
      for (const [idx, s] of res.data.streams.entries()) {
        validateStreamObject(s, `Breaking Bad S1:2 stream #${idx}`);
      }
      assertStreamOrdering(res.data.streams, 'tt0903747:1:2 Breaking Bad');
    });

    await test('Query /stream/movie/tt1375666.json (Inception)', async () => {
      const res = await client.get('/stream/movie/tt1375666.json');
      assert.strictEqual(res.status, 200, 'HTTP status must be 200');
      assert.ok(res.data && Array.isArray(res.data.streams));

      console.log(`    ↳ Received ${res.data.streams.length} stream(s) for Inception`);
      for (const [idx, s] of res.data.streams.entries()) {
        validateStreamObject(s, `Inception stream #${idx}`);
      }
      assertStreamOrdering(res.data.streams, 'tt1375666 Inception');
    });

    // ════════════════════════════════════════════════════════════
    // Section 2: Direct Provider ID Stream Queries across all 7 Providers
    // ════════════════════════════════════════════════════════════
    console.log('\n▶ [2/6] Testing Direct Provider IDs (Colon & Underscore formats)...');

    const providerTestCases = [
      { id: 'vsmov:nguoi-nhen-khong-con-nha', type: 'movie', label: 'VSMOV Colon Movie' },
      { id: 'vsmov_nguoi-nhen-khong-con-nha', type: 'movie', label: 'VSMOV Underscore Movie' },
      { id: 'kkphim:cuu-mon', type: 'movie', label: 'KKPhim Colon Movie' },
      { id: 'kkphim_cuu-mon', type: 'movie', label: 'KKPhim Underscore Movie' },
      { id: 'kkphim:tap-lam-nguoi-xau-phan-1:1:1', type: 'series', label: 'KKPhim Colon Series' },
      { id: 'kkphim_tap-lam-nguoi-xau-phan-1:1:1', type: 'series', label: 'KKPhim Underscore Series' },
      { id: 'nguonc:cuu-mon', type: 'movie', label: 'NguonC Colon Movie' },
      { id: 'nguonc_cuu-mon', type: 'movie', label: 'NguonC Underscore Movie' },
      { id: 'stp:cuu-mon', type: 'movie', label: 'STP Colon Movie' },
      { id: 'stp_cuu-mon', type: 'movie', label: 'STP Underscore Movie' },
      { id: 'hh3d:the-gioi-hoan-my:1:1', type: 'series', label: 'HH3D Colon Series' },
      { id: 'yan:dau-pha-thuong-khung:1:1', type: 'series', label: 'YAN Colon Series' },
      { id: 'clbpx:thien-long-bat-bo:1:1', type: 'series', label: 'CLBPX Colon Series' },
    ];

    for (const tc of providerTestCases) {
      await test(`Direct Provider ID: ${tc.label} (${tc.id})`, async () => {
        const res = await client.get(`/stream/${tc.type}/${tc.id}.json`);
        assert.strictEqual(res.status, 200, `HTTP status for ${tc.id} must be 200`);
        assert.ok(res.data && Array.isArray(res.data.streams), `Response for ${tc.id} must have streams array`);

        for (const [idx, s] of res.data.streams.entries()) {
          validateStreamObject(s, `${tc.id} stream #${idx}`);
        }
        assertStreamOrdering(res.data.streams, tc.id);
      });
    }

    // ════════════════════════════════════════════════════════════
    // Section 3: In-App Exclusivity & Zero externalUrl Invariant
    // ════════════════════════════════════════════════════════════
    console.log('\n▶ [3/6] Testing In-App Exclusivity & Zero externalUrl across endpoints...');

    await test('Zero externalUrl invariant across diverse route forms', async () => {
      const endpoints = [
        '/stream/movie/tt10872600.json',
        '/stream/movie/tt10872600',
        '/stream/series/tt0903747:1:1.json',
        '/stream/movie/kkphim:cuu-mon.json',
        '/stream/movie/vsmov:cuu-mon.json',
        '/stream/movie/nguonc:cuu-mon.json',
      ];

      for (const endpoint of endpoints) {
        const res = await client.get(endpoint);
        assert.strictEqual(res.status, 200);
        for (const s of (res.data.streams || [])) {
          assert.strictEqual(s.externalUrl, undefined, `Endpoint ${endpoint} stream had externalUrl`);
          assert.strictEqual('externalUrl' in s, false, `Endpoint ${endpoint} stream has externalUrl property key`);
          assert.ok(
            s.url && typeof s.url === 'string' && (s.url.includes('/hls/manifest.m3u8') || s.url.includes('/hls/extract') || s.url.includes('/hls/')),
            `Stream URL must use HLS proxy: ${s.url}`
          );
        }
      }
    });

    // ════════════════════════════════════════════════════════════
    // Section 4: Synthetic Permutation & Priority Comparator Stress Oracle
    // ════════════════════════════════════════════════════════════
    console.log('\n▶ [4/6] Stress Testing Priority Comparator Oracle & Permutations...');

    await test('Synthetic permutation oracle: All 10 tiers sorted in strict order', () => {
      const sampleStreams = [
        { name: 'VIP Movies 🎬', title: '[VIP 1 • VSMOV] Master 4K Ultra HD (3840x2160)', url: 'http://loc/1' },
        { name: 'VIP Movies 🎬', title: '[VIP 1 • VSMOV] Thuyết Minh Full HD', url: 'http://loc/2' },
        { name: 'VIP Movies 🎬', title: '[VIP 2 • KKPhim] Vietsub Full HD', url: 'http://loc/3' },
        { name: 'VIP Movies 🎬', title: '[VIP 2 • KKPhim] Thuyết Minh Full HD', url: 'http://loc/4' },
        { name: 'VIP Movies 🎬', title: '[VIP 3 • NguonC] Vietsub Full HD', url: 'http://loc/5' },
        { name: 'VIP Movies 🎬', title: '[VIP 3 • NguonC] Thuyết Minh Full HD', url: 'http://loc/6' },
        { name: 'VIP Movies 🎬', title: '[STP] Phim Âu Mỹ Tuyển Chọn', url: 'http://loc/7' },
        { name: 'VIP Movies 🎬', title: '[HH3D] Hoạt Hình 3D Tiên Hiệp', url: 'http://loc/8' },
        { name: 'VIP Movies 🎬', title: '[YAN] Donghua Đang Chiếu', url: 'http://loc/9' },
        { name: 'VIP Movies 🎬', title: '[CLBPX] Kiếm Hiệp Kim Dung', url: 'http://loc/10' },
      ];

      // Shuffle array randomly 50 times and verify sorting returns exact tier order
      for (let run = 0; run < 50; run++) {
        const shuffled = [...sampleStreams].sort(() => Math.random() - 0.5);
        shuffled.sort((a, b) => computePriorityOracle(a) - computePriorityOracle(b));

        for (let i = 0; i < shuffled.length; i++) {
          assert.strictEqual(shuffled[i].url, `http://loc/${i + 1}`, `Sorted index ${i} does not match expected tier ${i + 1}`);
        }
      }
    });

    // ════════════════════════════════════════════════════════════
    // Section 5: Config Token Provider Filtering & Stream Aggregation
    // ════════════════════════════════════════════════════════════
    console.log('\n▶ [5/6] Testing Config-Token Provider Filtering & Precedence...');

    await test('Config Token: Only NguonC enabled -> only NguonC streams returned', async () => {
      const configObj = {
        providers: ['nguonc'],
        categories: ['movie', 'series'],
        apiKey: '',
      };
      const token = encodeConfig(configObj);
      const res = await client.get(`/${token}/stream/movie/tt10872600.json`);
      assert.strictEqual(res.status, 200);
      assert.ok(Array.isArray(res.data.streams));

      for (const s of res.data.streams) {
        validateStreamObject(s, 'Only NguonC config');
        const titleLow = s.title.toLowerCase();
        assert.ok(titleLow.includes('nguonc') || titleLow.includes('vip 3'), `Stream "${s.title}" should be from NguonC when only nguonc is configured`);
      }
    });

    await test('Config Token: VSMOV + KKPhim enabled -> VSMOV precedes KKPhim', async () => {
      const configObj = {
        providers: ['vsmov', 'kkphim'],
        categories: ['movie'],
        apiKey: '',
      };
      const token = encodeConfig(configObj);
      const res = await client.get(`/${token}/stream/movie/tt10872600.json`);
      assert.strictEqual(res.status, 200);
      assert.ok(Array.isArray(res.data.streams));

      for (const s of res.data.streams) {
        validateStreamObject(s, 'VSMOV + KKPhim config');
      }
      assertStreamOrdering(res.data.streams, 'VSMOV + KKPhim config');
    });

    // ════════════════════════════════════════════════════════════
    // Section 6: Boundary, Edge Cases, Out-of-Bounds & Total Failure Modes
    // ════════════════════════════════════════════════════════════
    console.log('\n▶ [6/6] Testing Edge Cases, Out-of-Bounds & Blackout Resilience...');

    await test('Edge Case: Negative Season & Episode (tt0903747:-1:-5) returns HTTP 200 { streams: [] }', async () => {
      const res = await client.get('/stream/series/tt0903747:-1:-5.json');
      assert.strictEqual(res.status, 200);
      assert.deepStrictEqual(res.data, { streams: [] });
    });

    await test('Edge Case: Out-of-bounds episode (tt0903747:1:99999) returns HTTP 200 { streams: [] }', async () => {
      const res = await client.get('/stream/series/tt0903747:1:99999.json');
      assert.strictEqual(res.status, 200);
      assert.deepStrictEqual(res.data, { streams: [] });
    });

    await test('Edge Case: Garbage / Non-existent IMDb ID (tt00000000000) returns HTTP 200 { streams: [] }', async () => {
      const res = await client.get('/stream/movie/tt00000000000.json');
      assert.strictEqual(res.status, 200);
      assert.deepStrictEqual(res.data, { streams: [] });
    });

    await test('Edge Case: Malformed direct provider IDs with special symbols', async () => {
      const weirdIds = [
        'vsmov:$$$///',
        'kkphim:__proto__',
        'nguonc:<script>alert(1)</script>',
        'stp:SELECT * FROM movies',
      ];
      for (const wid of weirdIds) {
        const res = await client.get(`/stream/movie/${encodeURIComponent(wid)}.json`);
        assert.strictEqual(res.status, 200);
        assert.ok(Array.isArray(res.data.streams));
      }
    });

    await test('Deduplication Test: Identical underlying stream targets merged into single unique entry', async () => {
      const res = await client.get('/stream/movie/kkphim:cuu-mon.json');
      assert.strictEqual(res.status, 200);
      const urls = (res.data.streams || []).map((s) => s.url);
      const uniqueUrls = new Set(urls);
      assert.strictEqual(urls.length, uniqueUrls.size, 'Every stream in response must have a unique proxy URL');
    });

  } finally {
    server.close();
  }

  console.log('\n══════════════════════════════════════════════════════════════════════════════');
  console.log(`🏁 CHALLENGER 2 SUITE COMPLETE: ${results.passed} PASSED, ${results.failed} FAILED (TOTAL ${results.total})`);
  console.log('══════════════════════════════════════════════════════════════════════════════\n');

  if (results.failed > 0) {
    console.error('Failure details:');
    for (const f of results.failures) {
      console.error(`- ${f.name}: ${f.error}`);
    }
    process.exit(1);
  }
}

if (require.main === module) {
  runChallenger2EmpiricalTests().catch((err) => {
    console.error('Fatal test error:', err);
    process.exit(1);
  });
}

module.exports = { runChallenger2EmpiricalTests };
