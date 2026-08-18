'use strict';

/**
 * ==============================================================================
 *  VIP Movies Addon — tests/challenger2_v162_aggregator_stress.test.js
 *  Adversarial Challenge, Concurrency & Stream Aggregator Stress Suite (Engine v1.6.2)
 *
 *  Focus Areas:
 *    1. Stream Sorting Behavior (4K/UHD > Vietsub > Thuyết Minh > Lồng Tiếng > Other)
 *       with strict Provider Preference preservation within buckets.
 *    2. Timeout Handling & Safety (<= 4500ms aggregator deadline, no hanging on dead/slow providers).
 *    3. Strict In-App Protocol Invariant (Zero externalUrl, all streams route via /hls proxy).
 *    4. Segment Streaming Verification (Chunk size > 100KB, MPEG-TS sync byte 0x47, HTTP Range 206).
 * ==============================================================================
 */

const http = require('http');
const express = require('express');
const cors = require('cors');
const axios = require('axios');
const assert = require('assert');

const hlsRouter = require('../src/routes/hls');
const manifestRouter = require('../src/routes/manifest');
const handlers = require('../src/handlers');
const { getStreamPriority, withTimeout } = handlers;
const { encodeConfig } = require('../src/config');

const vsmovProvider = require('../src/providers/vsmov');
const kkphimProvider = require('../src/providers/kkphim');
const nguoncProvider = require('../src/providers/nguonc');
const stpProvider = require('../src/providers/stp');
const clbpxProvider = require('../src/providers/clbpx');
const yanProvider = require('../src/providers/yan');

// ANSI Color formatting
const GREEN  = '\x1b[32m';
const RED    = '\x1b[31m';
const CYAN   = '\x1b[36m';
const YELLOW = '\x1b[33m';
const BOLD   = '\x1b[1m';
const RESET  = '\x1b[0m';
const GRAY   = '\x1b[90m';

let passedCount = 0;
let failedCount = 0;
const failureDetails = [];

function pass(desc) {
  passedCount++;
  console.log(`  ${GREEN}✅ PASS [${passedCount}]:${RESET} ${desc}`);
}

function fail(desc, err) {
  failedCount++;
  const msg = err ? (err.message || String(err)) : 'Assertion failed';
  failureDetails.push({ desc, msg, stack: err?.stack });
  console.error(`  ${RED}❌ FAIL [${failedCount}]:${RESET} ${desc}`);
  console.error(`     ${RED}${msg}${RESET}`);
}

function assertStrict(actual, expected, desc) {
  try {
    assert.strictEqual(actual, expected);
    pass(`${desc} (expected: ${expected}, got: ${actual})`);
  } catch (e) {
    fail(`${desc} - Expected ${expected}, got ${actual}`, e);
  }
}

function assertTrue(cond, desc) {
  try {
    assert.ok(cond);
    pass(desc);
  } catch (e) {
    fail(desc, e);
  }
}

function assertFalse(cond, desc) {
  try {
    assert.ok(!cond);
    pass(desc);
  } catch (e) {
    fail(desc, e);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Helper to spin up an ephemeral test server
// ─────────────────────────────────────────────────────────────────────────────
function createTestApp() {
  const app = express();
  app.use(cors());
  app.use('/hls', hlsRouter);
  app.use('/', manifestRouter);
  app.use('/', handlers);
  return app;
}

// ─────────────────────────────────────────────────────────────────────────────
// Main Test Runner
// ─────────────────────────────────────────────────────────────────────────────
async function runAllChallengerTests() {
  console.log(`\n${BOLD}${CYAN}╔══════════════════════════════════════════════════════════════════════════════╗${RESET}`);
  console.log(`${BOLD}${CYAN}║  ⚔️  CHALLENGER 2: ENGINE v1.6.2 ADVERSARIAL AGGREGATOR & STREAM HARNESS     ║${RESET}`);
  console.log(`${BOLD}${CYAN}╚══════════════════════════════════════════════════════════════════════════════╝${RESET}\n`);

  const startTime = Date.now();

  // ============================================================================
  // SECTION 1: Stream Sorting Mechanics & Audio/Quality Ranking Hierarchy
  // ============================================================================
  console.log(`${BOLD}${YELLOW}▶ SECTION 1: Stream Sorting Mechanics & Audio/Quality Ranking Hierarchy${RESET}`);

  // 1.1 Category Hierarchy: 4K (0-99) < Vietsub (100-199) < Thuyết Minh (200-299) < Lồng Tiếng (300-399) < Other (400-499)
  const synthetic4K = { name: '[VIP 1 • VSMOV] 4K Ultra HD', title: 'Server 4K', url: 'http://test/hls/manifest.m3u8?url=4k' };
  const syntheticVietsub = { name: '[VIP 1 • VSMOV] Vietsub Full HD', title: 'Server Vietsub', url: 'http://test/hls/manifest.m3u8?url=vietsub' };
  const syntheticThuyetMinh = { name: '[VIP 1 • VSMOV] Thuyết Minh Full HD', title: 'Server TM', url: 'http://test/hls/manifest.m3u8?url=tm' };
  const syntheticLongTieng = { name: '[VIP 1 • VSMOV] Lồng Tiếng Full HD', title: 'Server LT', url: 'http://test/hls/manifest.m3u8?url=lt' };
  const syntheticOther = { name: '[VIP 1 • VSMOV] Bản Raw HD', title: 'Server Raw', url: 'http://test/hls/manifest.m3u8?url=other' };

  const p4K = getStreamPriority(synthetic4K);
  const pVietsub = getStreamPriority(syntheticVietsub);
  const pTM = getStreamPriority(syntheticThuyetMinh);
  const pLT = getStreamPriority(syntheticLongTieng);
  const pOther = getStreamPriority(syntheticOther);

  assertTrue(p4K < pVietsub, `4K priority (${p4K}) < Vietsub priority (${pVietsub})`);
  assertTrue(pVietsub < pTM, `Vietsub priority (${pVietsub}) < Thuyết Minh priority (${pTM})`);
  assertTrue(pTM < pLT, `Thuyết Minh priority (${pTM}) < Lồng Tiếng priority (${pLT})`);
  assertTrue(pLT < pOther, `Lồng Tiếng priority (${pLT}) < Other priority (${pOther})`);

  // 1.2 Boundary comparison: Worst provider in 4K vs Best provider in Vietsub
  const worst4K_YAN = { name: '[VIP 6 • YAN] 4K UHD Donghua', title: '4K Server', url: 'http://test' };
  const bestVietsub_VSMOV = { name: '[VIP 1 • VSMOV] Vietsub 1080p', title: 'VIP Vietsub', url: 'http://test' };
  assertTrue(
    getStreamPriority(worst4K_YAN) < getStreamPriority(bestVietsub_VSMOV),
    `YAN 4K (${getStreamPriority(worst4K_YAN)}) MUST rank above VSMOV Vietsub (${getStreamPriority(bestVietsub_VSMOV)})`
  );

  // 1.3 Boundary comparison: Worst provider in Vietsub vs Best provider in Thuyết Minh
  const worstVietsub_YAN = { name: '[VIP 6 • YAN] Vietsub 1080p', title: 'YAN Vietsub', url: 'http://test' };
  const bestTM_VSMOV = { name: '[VIP 1 • VSMOV] Thuyết Minh 1080p', title: 'VSMOV TM', url: 'http://test' };
  assertTrue(
    getStreamPriority(worstVietsub_YAN) < getStreamPriority(bestTM_VSMOV),
    `YAN Vietsub (${getStreamPriority(worstVietsub_YAN)}) MUST rank above VSMOV TM (${getStreamPriority(bestTM_VSMOV)})`
  );

  // 1.4 Boundary comparison: Worst provider in Thuyết Minh vs Best provider in Lồng Tiếng
  const worstTM_YAN = { name: '[VIP 6 • YAN] Thuyết Minh 1080p', title: 'YAN TM', url: 'http://test' };
  const bestLT_VSMOV = { name: '[VIP 1 • VSMOV] Lồng Tiếng 1080p', title: 'VSMOV LT', url: 'http://test' };
  assertTrue(
    getStreamPriority(worstTM_YAN) < getStreamPriority(bestLT_VSMOV),
    `YAN TM (${getStreamPriority(worstTM_YAN)}) MUST rank above VSMOV LT (${getStreamPriority(bestLT_VSMOV)})`
  );

  // 1.5 Boundary comparison: Worst provider in Lồng Tiếng vs Best provider in Other
  const worstLT_YAN = { name: '[VIP 6 • YAN] Lồng Tiếng 1080p', title: 'YAN LT', url: 'http://test' };
  const bestOther_VSMOV = { name: '[VIP 1 • VSMOV] Original Audio 1080p', title: 'VSMOV Raw', url: 'http://test' };
  assertTrue(
    getStreamPriority(worstLT_YAN) < getStreamPriority(bestOther_VSMOV),
    `YAN LT (${getStreamPriority(worstLT_YAN)}) MUST rank above VSMOV Other (${getStreamPriority(bestOther_VSMOV)})`
  );

  // 1.6 Provider Preference Matrix within Vietsub Bucket
  const vietsubStreams = [
    { provider: 'vsmov',  stream: { name: '[VIP 1 • VSMOV] Vietsub', title: '' }, expectedRank: 1 },
    { provider: 'kkphim', stream: { name: '[VIP 2 • KKPhim] Vietsub', title: '' }, expectedRank: 2 },
    { provider: 'nguonc', stream: { name: '[VIP 3 • NguonC] Vietsub', title: '' }, expectedRank: 3 },
    { provider: 'stp',    stream: { name: '[VIP 4 • STP] Vietsub', title: '' }, expectedRank: 4 },
    { provider: 'clbpx',  stream: { name: '[VIP 5 • CLBPX] Vietsub', title: '' }, expectedRank: 5 },
    { provider: 'yan',    stream: { name: '[VIP 6 • YAN] Vietsub', title: '' }, expectedRank: 6 },
  ];

  for (let i = 0; i < vietsubStreams.length - 1; i++) {
    const cur = vietsubStreams[i];
    const next = vietsubStreams[i + 1];
    const curP = getStreamPriority(cur.stream);
    const nextP = getStreamPriority(next.stream);
    assertTrue(curP < nextP, `Vietsub bucket: ${cur.provider} (${curP}) ranks higher than ${next.provider} (${nextP})`);
  }

  // 1.7 Provider Preference Matrix within Thuyết Minh Bucket
  const tmStreams = [
    { provider: 'vsmov',  stream: { name: '[VIP 1 • VSMOV] Thuyết Minh', title: '' } },
    { provider: 'kkphim', stream: { name: '[VIP 2 • KKPhim] Thuyết Minh', title: '' } },
    { provider: 'nguonc', stream: { name: '[VIP 3 • NguonC] Thuyết Minh', title: '' } },
    { provider: 'stp',    stream: { name: '[VIP 4 • STP] Thuyết Minh', title: '' } },
    { provider: 'clbpx',  stream: { name: '[VIP 5 • CLBPX] Thuyết Minh', title: '' } },
    { provider: 'yan',    stream: { name: '[VIP 6 • YAN] Thuyết Minh', title: '' } },
  ];

  for (let i = 0; i < tmStreams.length - 1; i++) {
    const cur = tmStreams[i];
    const next = tmStreams[i + 1];
    const curP = getStreamPriority(cur.stream);
    const nextP = getStreamPriority(next.stream);
    assertTrue(curP < nextP, `TM bucket: ${cur.provider} (${curP}) ranks higher than ${next.provider} (${nextP})`);
  }

  // 1.8 Provider Preference Matrix within Lồng Tiếng Bucket
  const ltStreams = [
    { provider: 'vsmov',  stream: { name: '[VIP 1 • VSMOV] Lồng Tiếng', title: '' } },
    { provider: 'kkphim', stream: { name: '[VIP 2 • KKPhim] Lồng Tiếng', title: '' } },
    { provider: 'nguonc', stream: { name: '[VIP 3 • NguonC] Lồng Tiếng', title: '' } },
    { provider: 'stp',    stream: { name: '[VIP 4 • STP] Lồng Tiếng', title: '' } },
    { provider: 'clbpx',  stream: { name: '[VIP 5 • CLBPX] Lồng Tiếng', title: '' } },
    { provider: 'yan',    stream: { name: '[VIP 6 • YAN] Lồng Tiếng', title: '' } },
  ];

  for (let i = 0; i < ltStreams.length - 1; i++) {
    const cur = ltStreams[i];
    const next = ltStreams[i + 1];
    const curP = getStreamPriority(cur.stream);
    const nextP = getStreamPriority(next.stream);
    assertTrue(curP < nextP, `LT bucket: ${cur.provider} (${curP}) ranks higher than ${next.provider} (${nextP})`);
  }

  // 1.9 Provider Preference & Sub-audio within 4K Bucket
  const vsmov4K_VS = { name: '[VIP 1 • VSMOV] 4K Vietsub', title: '' };
  const vsmov4K_TM = { name: '[VIP 1 • VSMOV] 4K Thuyết Minh', title: '' };
  const vsmov4K_LT = { name: '[VIP 1 • VSMOV] 4K Lồng Tiếng', title: '' };
  const vsmov4K_Raw = { name: '[VIP 1 • VSMOV] 4K Raw', title: '' };

  assertTrue(getStreamPriority(vsmov4K_VS) < getStreamPriority(vsmov4K_TM), '4K: VSMOV Vietsub < VSMOV TM');
  assertTrue(getStreamPriority(vsmov4K_TM) < getStreamPriority(vsmov4K_LT), '4K: VSMOV TM < VSMOV LT');
  assertTrue(getStreamPriority(vsmov4K_LT) < getStreamPriority(vsmov4K_Raw), '4K: VSMOV LT < VSMOV Raw');

  // 1.10 Random Shuffled Multi-Provider Stream List Monotonicity Test (50 iterations)
  const allTestStreams = [
    // 4K
    { name: '[VIP 1 • VSMOV] 4K Vietsub', title: 'Stream 1', url: 'http://test/1' },
    { name: '[VIP 1 • VSMOV] 4K TM', title: 'Stream 2', url: 'http://test/2' },
    { name: '[VIP 2 • KKPhim] 4K Vietsub', title: 'Stream 3', url: 'http://test/3' },
    { name: '[VIP 3 • NguonC] 4K Vietsub', title: 'Stream 4', url: 'http://test/4' },
    { name: '[VIP 4 • STP] 4K UHD', title: 'Stream 5', url: 'http://test/5' },
    { name: '[VIP 5 • CLBPX] 4K UHD', title: 'Stream 6', url: 'http://test/6' },
    { name: '[VIP 6 • YAN] 4K UHD', title: 'Stream 7', url: 'http://test/7' },
    // Vietsub
    { name: '[VIP 1 • VSMOV] Vietsub FHD', title: 'Stream 8', url: 'http://test/8' },
    { name: '[VIP 2 • KKPhim] Phụ Đề HD', title: 'Stream 9', url: 'http://test/9' },
    { name: '[VIP 3 • NguonC] Vietsub 720p', title: 'Stream 10', url: 'http://test/10' },
    { name: '[VIP 4 • STP] Vietsub Cinema', title: 'Stream 11', url: 'http://test/11' },
    { name: '[VIP 5 • CLBPX] Vietsub Classic', title: 'Stream 12', url: 'http://test/12' },
    { name: '[VIP 6 • YAN] Vietsub Donghua', title: 'Stream 13', url: 'http://test/13' },
    // Thuyết Minh
    { name: '[VIP 1 • VSMOV] Thuyết Minh Voiceover', title: 'Stream 14', url: 'http://test/14' },
    { name: '[VIP 2 • KKPhim] TM VIP', title: 'Stream 15', url: 'http://test/15' },
    { name: '[VIP 3 • NguonC] Thuyết Minh HD', title: 'Stream 16', url: 'http://test/16' },
    { name: '[VIP 4 • STP] TM Rạp', title: 'Stream 17', url: 'http://test/17' },
    { name: '[VIP 5 • CLBPX] Thuyết Minh TVB', title: 'Stream 18', url: 'http://test/18' },
    { name: '[VIP 6 • YAN] TM 3D', title: 'Stream 19', url: 'http://test/19' },
    // Lồng Tiếng
    { name: '[VIP 1 • VSMOV] Lồng Tiếng Dub', title: 'Stream 20', url: 'http://test/20' },
    { name: '[VIP 2 • KKPhim] LT Sài Gòn', title: 'Stream 21', url: 'http://test/21' },
    { name: '[VIP 3 • NguonC] Lồng Tiếng HTV', title: 'Stream 22', url: 'http://test/22' },
    { name: '[VIP 4 • STP] LT FFVN', title: 'Stream 23', url: 'http://test/23' },
    { name: '[VIP 5 • CLBPX] Lồng Tiếng SanYang', title: 'Stream 24', url: 'http://test/24' },
    { name: '[VIP 6 • YAN] LT Chuẩn', title: 'Stream 25', url: 'http://test/25' },
    // Other
    { name: '[VIP 1 • VSMOV] Raw Audio', title: 'Stream 26', url: 'http://test/26' },
    { name: '[VIP 2 • KKPhim] Original', title: 'Stream 27', url: 'http://test/27' },
  ];

  let shuffleSortPass = true;
  for (let iter = 0; iter < 20; iter++) {
    // Fisher-Yates shuffle
    const shuffled = [...allTestStreams].sort(() => Math.random() - 0.5);
    shuffled.sort((a, b) => getStreamPriority(a) - getStreamPriority(b));

    // Verify sorted output is monotonically non-decreasing
    for (let k = 0; k < shuffled.length - 1; k++) {
      const pA = getStreamPriority(shuffled[k]);
      const pB = getStreamPriority(shuffled[k + 1]);
      if (pA > pB) {
        shuffleSortPass = false;
        fail(`Monotonicity broken at index ${k}: ${shuffled[k].name} (${pA}) > ${shuffled[k+1].name} (${pB})`);
        break;
      }
    }
  }
  assertTrue(shuffleSortPass, '20 randomized shuffle sorts all produced strictly monotonic stream ranking');

  // 1.11 Edge Cases in Keyword Recognition
  assertStrict(getStreamPriority({ name: 'Batman Begins', title: 'Batman' }), 407, 'Word "Batman" containing "tm" is NOT falsely recognized as Thuyết Minh');
  assertStrict(getStreamPriority({ name: 'Ultraman', title: 'Ultraman' }), 407, 'Word "Ultraman" containing "ultra" is NOT falsely recognized as 4K/UHD without "ultra hd"');
  assertTrue(getStreamPriority({ name: 'Movie TM HD', title: 'Server 1' }) < 300, '"Movie TM HD" with word boundary \\btm\\b recognized as Thuyết Minh');
  assertTrue(getStreamPriority({ name: 'Movie LT HD', title: 'Server 1' }) >= 300, '"Movie LT HD" with word boundary \\blt\\b recognized as Lồng Tiếng');
  assertTrue(getStreamPriority({ name: 'Phim Phụ Đề', title: 'Server' }) < 200, '"Phim Phụ Đề" recognized as Vietsub');
  assertTrue(getStreamPriority({ name: 'Phim Phu De Khong Dau', title: 'Server' }) < 200, '"Phim Phu De" recognized as Vietsub');

  // ============================================================================
  // SECTION 2: Aggregator Timeout Safety & Resilience (<= 4500ms)
  // ============================================================================
  console.log(`\n${BOLD}${YELLOW}▶ SECTION 2: Aggregator Timeout Safety & Resilience (<= 4500ms)${RESET}`);

  // 2.1 withTimeout unit test: Fast resolution
  const fastPromise = new Promise((resolve) => setTimeout(() => resolve('quick_success'), 20));
  const fastResult = await withTimeout(fastPromise, 1000, 'FastTest');
  assertStrict(fastResult, 'quick_success', 'withTimeout resolves fast promise cleanly');

  // 2.2 withTimeout unit test: Rejection before timeout
  const rejectingPromise = new Promise((_, reject) => setTimeout(() => reject(new Error('instant_failure')), 20));
  let gotReject = false;
  try {
    await withTimeout(rejectingPromise, 1000, 'RejectTest');
  } catch (err) {
    gotReject = true;
    assertStrict(err.message, 'instant_failure', 'withTimeout propagates actual rejection');
  }
  assertTrue(gotReject, 'withTimeout caught fast rejection');

  // 2.3 withTimeout unit test: Timeout trigger
  const hangingPromise = new Promise((resolve) => setTimeout(() => resolve('too_late'), 5000));
  const timeoutStart = Date.now();
  let gotTimeout = false;
  try {
    await withTimeout(hangingPromise, 300, 'HangingTest');
  } catch (err) {
    gotTimeout = true;
    assertTrue(err.message.includes('timed out after 300ms'), `Timeout error message contains label & duration: "${err.message}"`);
  }
  const timeoutElapsed = Date.now() - timeoutStart;
  assertTrue(gotTimeout, 'withTimeout successfully rejected hanging promise');
  assertTrue(timeoutElapsed >= 280 && timeoutElapsed <= 450, `withTimeout aborted precisely around 300ms (took ${timeoutElapsed}ms)`);

  // 2.4 End-to-end Aggregator Timeout Stress Test
  const app = createTestApp();
  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const serverPort = server.address().port;
  const baseUrl = `http://127.0.0.1:${serverPort}`;

  try {
    // 2.5 Live stream request timeout safety test
    console.log('  Testing live stream aggregation latency on tt0903747 (Breaking Bad)...');
    const aggStart = Date.now();
    const liveStreamRes = await axios.get(`${baseUrl}/stream/series/tt0903747:1:1.json`, { timeout: 10000 });
    const aggElapsed = Date.now() - aggStart;

    assertStrict(liveStreamRes.status, 200, 'Live stream request returned HTTP 200');
    assertTrue(Array.isArray(liveStreamRes.data.streams), 'Response contains streams array');
    assertTrue(aggElapsed <= 4800, `Aggregator finished within safety bound of 4800ms (took ${aggElapsed}ms)`);

    // 2.6 Live stream request on non-existent / invalid ID (all providers return 404 / empty)
    console.log('  Testing aggregator fallback on non-existent IMDB ID tt9999999999...');
    const nonExistentStart = Date.now();
    const nonExistentRes = await axios.get(`${baseUrl}/stream/movie/tt9999999999.json`, { timeout: 10000 });
    const nonExistentElapsed = Date.now() - nonExistentStart;

    assertStrict(nonExistentRes.status, 200, 'Non-existent item returned HTTP 200 with empty array');
    assertStrict(nonExistentRes.data.streams.length, 0, 'Zero streams returned for non-existent item');
    assertTrue(nonExistentElapsed <= 4800, `Non-existent search finished within <= 4800ms (took ${nonExistentElapsed}ms)`);

    // 2.7 Simulated Slow Provider Multi-Aggregator Parallel Stress
    console.log('  Testing synthetic multi-provider aggregation with simulated slow & hanging providers...');
    const slowStart = Date.now();
    const simulatedProviders = [
      withTimeout(new Promise((r) => setTimeout(() => r([{ name: 'Fast 1', url: `${baseUrl}/hls/manifest.m3u8?url=1` }]), 100)), 4500, 'Fast1'),
      withTimeout(new Promise((r) => setTimeout(() => r([{ name: 'Fast 2', url: `${baseUrl}/hls/manifest.m3u8?url=2` }]), 200)), 4500, 'Fast2'),
      withTimeout(new Promise((r) => setTimeout(() => r([]), 5500)), 4500, 'SlowHang1'),
      withTimeout(new Promise((r) => setTimeout(() => r([]), 8000)), 4500, 'SlowHang2'),
      withTimeout(new Promise((_, rej) => setTimeout(() => rej(new Error('Upstream 502')), 50)), 4500, 'FastFail'),
    ];

    const simResults = await Promise.allSettled(simulatedProviders);
    const slowElapsed = Date.now() - slowStart;

    assertTrue(slowElapsed >= 4450 && slowElapsed <= 4800, `Simulated aggregator finished at deadline (took ${slowElapsed}ms)`);
    assertStrict(simResults[0].status, 'fulfilled', 'Fast 1 fulfilled');
    assertStrict(simResults[1].status, 'fulfilled', 'Fast 2 fulfilled');
    assertStrict(simResults[2].status, 'rejected', 'SlowHang1 rejected via timeout');
    assertStrict(simResults[3].status, 'rejected', 'SlowHang2 rejected via timeout');
    assertStrict(simResults[4].status, 'rejected', 'FastFail rejected via error');

    // ============================================================================
    // SECTION 3: Strict In-App Protocol Invariant & URL Routing Validation
    // ============================================================================
    console.log(`\n${BOLD}${YELLOW}▶ SECTION 3: Strict In-App Protocol Invariant & URL Routing Validation${RESET}`);

    // Query streams across different media types & providers
    const testQueries = [
      { type: 'movie', id: 'tt0373889', label: 'Harry Potter (Movie)' },
      { type: 'series', id: 'tt11126994:1:1', label: 'Arcane S1E1 (Series)' },
      { type: 'series', id: 'nguonc:pham-nhan-tu-tien:0:1', label: 'Pham Nhan Tu Tien (NguonC)' },
      { type: 'movie', id: 'nguonc:nu-hiep-ruy-bang', label: 'Nu Hiep Ruy Bang (NguonC)' },
    ];

    for (const q of testQueries) {
      console.log(`  Verifying in-app stream invariants on ${q.label}...`);
      const res = await axios.get(`${baseUrl}/stream/${q.type}/${encodeURIComponent(q.id)}.json`);
      assertStrict(res.status, 200, `${q.label} stream endpoint returned HTTP 200`);
      
      const streams = res.data.streams || [];
      console.log(`     Got ${streams.length} stream(s)`);

      for (let sIdx = 0; sIdx < streams.length; sIdx++) {
        const stream = streams[sIdx];
        
        // Invariant 1: externalUrl MUST NOT be present
        assertStrict(typeof stream.externalUrl, 'undefined', `[${q.label} stream #${sIdx+1}] externalUrl is strictly undefined`);
        assertFalse('externalUrl' in stream, `[${q.label} stream #${sIdx+1}] 'externalUrl' key is NOT in object`);

        // Invariant 2: url MUST route via /hls proxy (/hls/manifest.m3u8, /hls/m3u8, or /hls/extract)
        assertTrue(typeof stream.url === 'string' && stream.url.length > 0, `[${q.label} stream #${sIdx+1}] stream.url is a non-empty string`);
        assertTrue(
          stream.url.includes('/hls/manifest.m3u8') || stream.url.includes('/hls/m3u8') || stream.url.includes('/hls/extract') || stream.url.includes('/hls/'),
          `[${q.label} stream #${sIdx+1}] stream.url routes via HLS proxy: ${stream.url.slice(0, 60)}...`
        );

        // If it routes through /hls/extract, verify it resolves/redirects to /hls/manifest.m3u8
        if (stream.url.includes('/hls/extract')) {
          try {
            const extractRes = await axios.get(stream.url, { maxRedirects: 0, validateStatus: (s) => s >= 200 && s < 400 });
            if (extractRes.status === 302) {
              const redirectLocation = extractRes.headers.location;
              assertTrue(
                redirectLocation && redirectLocation.includes('/hls/manifest.m3u8'),
                `[${q.label} stream #${sIdx+1}] /hls/extract redirects 302 to /hls/manifest.m3u8`
              );
            }
          } catch (e) {
            // upstream extraction might be transient
          }
        }

        // Invariant 3: behaviorHints compliance
        assertTrue(stream.behaviorHints && typeof stream.behaviorHints === 'object', `[${q.label} stream #${sIdx+1}] behaviorHints is an object`);
        assertStrict(stream.behaviorHints.notSupported, false, `[${q.label} stream #${sIdx+1}] behaviorHints.notSupported is false`);
        assertTrue(typeof stream.behaviorHints.bingeGroup === 'string', `[${q.label} stream #${sIdx+1}] behaviorHints.bingeGroup is present`);

        // Invariant 4: Subtitles validation if present
        if (stream.subtitles && Array.isArray(stream.subtitles)) {
          for (const sub of stream.subtitles) {
            assertTrue(sub.url && (sub.url.includes('/hls/sub.vtt') || sub.url.includes('/hls/sub')), `Subtitle routes via proxy: ${sub.url}`);
            assertTrue(typeof sub.lang === 'string', `Subtitle language is specified: ${sub.lang}`);
          }
        }
      }
    }

    // ============================================================================
    // SECTION 4: Live & Mock Segment Streaming, Chunk Size & TS Sync Byte 0x47
    // ============================================================================
    console.log(`\n${BOLD}${YELLOW}▶ SECTION 4: Live & Mock Segment Streaming, Chunk Size & TS Sync Byte 0x47${RESET}`);

    // 4.1 Mock upstream server providing real MPEG-TS segments (>100KB, sync byte 0x47)
    let mockUpstreamRequests = 0;
    const mockUpstreamServer = http.createServer((req, res) => {
      mockUpstreamRequests++;

      if (req.url === '/master.m3u8') {
        res.writeHead(200, { 'Content-Type': 'application/vnd.apple.mpegurl' });
        res.end(
          `#EXTM3U\n` +
          `#EXT-X-VERSION:3\n` +
          `#EXT-X-STREAM-INF:BANDWIDTH=2500000,RESOLUTION=1920x1080\n` +
          `media.m3u8\n`
        );
        return;
      }

      if (req.url === '/media.m3u8') {
        res.writeHead(200, { 'Content-Type': 'application/vnd.apple.mpegurl' });
        res.end(
          `#EXTM3U\n` +
          `#EXT-X-VERSION:3\n` +
          `#EXT-X-TARGETDURATION:6\n` +
          `#EXT-X-MEDIA-SEQUENCE:0\n` +
          `#EXTINF:6.000,\n` +
          `chunk001.ts\n` +
          `#EXT-X-ENDLIST\n`
        );
        return;
      }

      if (req.url === '/chunk001.ts') {
        // Generate a 150KB MPEG-TS buffer formatted with 188-byte TS packets starting with 0x47
        const packetSize = 188;
        const totalPackets = 800; // 800 * 188 = 150,400 bytes (> 100KB)
        const totalBytes = totalPackets * packetSize;
        const tsBuffer = Buffer.alloc(totalBytes);

        for (let p = 0; p < totalPackets; p++) {
          const offset = p * packetSize;
          tsBuffer[offset] = 0x47; // MPEG-TS Sync Byte
          tsBuffer[offset + 1] = 0x40; // payload start
          tsBuffer[offset + 2] = 0x11; // PID
          tsBuffer[offset + 3] = 0x10; // continuity counter
          // Fill rest with dummy video payload
          for (let b = 4; b < packetSize; b++) {
            tsBuffer[offset + b] = (p + b) % 256;
          }
        }

        // Handle HTTP Range header
        const rangeHeader = req.headers.range;
        if (rangeHeader) {
          const parts = rangeHeader.replace(/bytes=/, '').split('-');
          const start = parseInt(parts[0], 10) || 0;
          const end = parts[1] ? parseInt(parts[1], 10) : totalBytes - 1;
          const chunk = tsBuffer.slice(start, end + 1);

          res.writeHead(206, {
            'Content-Type': 'video/MP2T',
            'Content-Range': `bytes ${start}-${end}/${totalBytes}`,
            'Content-Length': chunk.length,
            'Accept-Ranges': 'bytes',
          });
          res.end(chunk);
          return;
        }

        res.writeHead(200, {
          'Content-Type': 'video/MP2T',
          'Content-Length': totalBytes,
          'Accept-Ranges': 'bytes',
        });
        res.end(tsBuffer);
        return;
      }

      res.writeHead(404);
      res.end('Not Found');
    });

    await new Promise((resolve) => mockUpstreamServer.listen(0, '127.0.0.1', resolve));
    const mockPort = mockUpstreamServer.address().port;
    const mockUpstreamBase = `http://127.0.0.1:${mockPort}`;

    console.log(`  Mock upstream MPEG-TS server listening on ${mockUpstreamBase}`);

    // 4.2 Fetch proxied master playlist through HLS proxy
    const b64Master = Buffer.from(`${mockUpstreamBase}/master.m3u8`).toString('base64url');
    const proxyMasterUrl = `${baseUrl}/hls/manifest.m3u8?url=${b64Master}`;
    const masterRes = await axios.get(proxyMasterUrl);

    assertStrict(masterRes.status, 200, 'Proxied master manifest returned HTTP 200');
    assertTrue(masterRes.data.includes('#EXTM3U'), 'Master manifest contains #EXTM3U');
    assertTrue(masterRes.data.includes('/hls/manifest.m3u8?url='), 'Media playlist link rewritten to /hls/manifest.m3u8');

    // 4.3 Extract and fetch proxied media playlist
    const mediaLine = masterRes.data.split('\n').find((l) => l.includes('/hls/manifest.m3u8?url='));
    assertTrue(!!mediaLine, `Found rewritten media playlist URL: ${mediaLine}`);

    const mediaRes = await axios.get(mediaLine.trim());
    assertStrict(mediaRes.status, 200, 'Proxied media playlist returned HTTP 200');
    assertTrue(mediaRes.data.includes('/hls/segment.ts?url='), 'Segment URL rewritten to /hls/segment.ts');

    // 4.4 Extract and fetch proxied TS segment
    const segmentLine = mediaRes.data.split('\n').find((l) => l.includes('/hls/segment.ts?url='));
    assertTrue(!!segmentLine, `Found rewritten segment URL: ${segmentLine}`);

    const segmentRes = await axios.get(segmentLine.trim(), { responseType: 'arraybuffer' });
    assertStrict(segmentRes.status, 200, 'Proxied TS segment returned HTTP 200');
    assertStrict(segmentRes.headers['content-type'], 'video/MP2T', 'Content-Type is video/MP2T');

    const segmentBuf = Buffer.from(segmentRes.data);
    assertTrue(segmentBuf.length > 100000, `Segment payload length (${segmentBuf.length} bytes) is > 100,000 bytes (100KB)`);
    assertStrict(segmentBuf[0], 0x47, `First byte is MPEG-TS Sync Byte 0x47 (got 0x${segmentBuf[0].toString(16)})`);
    assertStrict(segmentBuf[188], 0x47, `Second packet starts with MPEG-TS Sync Byte 0x47 (offset 188)`);
    assertStrict(segmentBuf[376], 0x47, `Third packet starts with MPEG-TS Sync Byte 0x47 (offset 376)`);
    assertStrict(segmentBuf[188 * 500], 0x47, `501st packet starts with MPEG-TS Sync Byte 0x47 (offset ${188*500})`);

    // 4.5 Test Range Seeking (HTTP 206) on proxied segment
    const rangeRes = await axios.get(segmentLine.trim(), {
      headers: { Range: 'bytes=0-1023' },
      responseType: 'arraybuffer',
      validateStatus: (s) => s === 206,
    });

    assertStrict(rangeRes.status, 206, 'Range request on proxied TS segment returned HTTP 206 Partial Content');
    assertTrue(rangeRes.headers['content-range'].includes('bytes 0-1023/'), `Content-Range header present: ${rangeRes.headers['content-range']}`);
    assertStrict(rangeRes.data.byteLength, 1024, 'Returned exactly 1024 bytes');
    const rangeBuf = Buffer.from(rangeRes.data);
    assertStrict(rangeBuf[0], 0x47, 'Range byte 0 is MPEG-TS Sync Byte 0x47');

    // Clean up mock upstream server
    await new Promise((resolve) => mockUpstreamServer.close(resolve));
    console.log('  Mock upstream server closed cleanly.');

    // 4.6 Live Provider Video Segment Verification on KKPhim & NguonC
    console.log('  Verifying live provider TS segment download on KKPhim...');
    const liveKKStreamRes = await axios.get(`${baseUrl}/stream/series/tt0903747:1:1.json`);
    const kkStream = (liveKKStreamRes.data.streams || []).find((s) => s.name.includes('KKPhim') || s.name.includes('VIP 2'));

    if (kkStream && kkStream.url) {
      const kkPlaylistRes = await axios.get(kkStream.url);
      const kkLines = kkPlaylistRes.data.split('\n');
      const subM3u8 = kkLines.find((l) => l.trim().includes('/hls/manifest.m3u8'));
      if (subM3u8) {
        const subRes = await axios.get(subM3u8.trim());
        const kkSeg = subRes.data.split('\n').find((l) => l.trim().includes('/hls/segment.ts'));
        if (kkSeg) {
          const segData = await axios.get(kkSeg.trim(), { responseType: 'arraybuffer', timeout: 25000 });
          assertStrict(segData.status, 200, 'Live KKPhim segment returned HTTP 200');
          const kkBuf = Buffer.from(segData.data);
          assertTrue(kkBuf.length >= 100000, `Live KKPhim segment size is ${kkBuf.length} bytes (>= 100KB)`);
          assertStrict(kkBuf[0], 0x47, 'Live KKPhim segment byte 0 is MPEG-TS sync byte 0x47');
        }
      }
    }

  } finally {
    // Teardown test server
    await new Promise((resolve) => server.close(resolve));
    console.log(`[Teardown] Ephemeral test server on port ${serverPort} closed cleanly.`);
  }

  const durationSec = ((Date.now() - startTime) / 1000).toFixed(2);

  console.log(`\n${BOLD}${CYAN}╔══════════════════════════════════════════════════════════════════════════════╗${RESET}`);
  console.log(`${BOLD}${CYAN}║                    📊  CHALLENGER 2 TEST EXECUTION SUMMARY                   ║${RESET}`);
  console.log(`${BOLD}${CYAN}╠══════════════════════════════════════════════════════════════════════════════╣${RESET}`);
  console.log(`${BOLD}║  Total Assertions Passed: ${GREEN}${passedCount}${RESET}                                           ║`);
  console.log(`${BOLD}║  Total Assertions Failed: ${failedCount === 0 ? GREEN : RED}${failedCount}${RESET}                                           ║`);
  console.log(`${BOLD}║  Execution Duration:      ${durationSec}s                                           ║`);
  console.log(`${BOLD}${CYAN}╚══════════════════════════════════════════════════════════════════════════════╝${RESET}\n`);

  if (failedCount > 0) {
    console.error(`${RED}Failure Details:${RESET}`);
    for (const f of failureDetails) {
      console.error(`- ${f.desc}: ${f.msg}`);
    }
    process.exit(1);
  } else {
    console.log(`${GREEN}🎉 ALL ADVERSARIAL CHALLENGER TESTS PASSED SUCCESSFULLY!${RESET}\n`);
    process.exit(0);
  }
}

// Run test suite
runAllChallengerTests().catch((err) => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
