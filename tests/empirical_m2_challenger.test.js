'use strict';

/**
 * ============================================================
 *  VIP Movies Addon — tests/empirical_m2_challenger.test.js
 *  Milestone 2 Challenger 2 Empirical Test Suite
 * ============================================================
 */

const assert = require('assert');
const axios = require('axios');
const mapper = require('../src/mapper');
const kkphim = require('../src/providers/kkphim');
const nguonc = require('../src/providers/nguonc');
const vsmov = require('../src/providers/vsmov');
const { DEFAULT_CONFIG, VALID_PROVIDERS } = require('../src/config');
const { resolveCinemeta, getCachedCinemeta, cinemetaCache } = require('../src/lib/cinemeta');
const { imdbCache, catalogCache, detailCache } = require('../src/lib/cache');
const handlers = require('../src/handlers');
const express = require('express');

const results = {
  passed: 0,
  failed: 0,
  tests: [],
};

function test(name, fn) {
  try {
    fn();
    results.passed++;
    results.tests.push({ name, status: 'PASS' });
    console.log(`✅ PASS: ${name}`);
  } catch (err) {
    results.failed++;
    results.tests.push({ name, status: 'FAIL', error: err.message, stack: err.stack });
    console.error(`❌ FAIL: ${name}`);
    console.error(`   Error: ${err.message}`);
  }
}

async function asyncTest(name, fn) {
  try {
    await fn();
    results.passed++;
    results.tests.push({ name, status: 'PASS' });
    console.log(`✅ PASS: ${name}`);
  } catch (err) {
    results.failed++;
    results.tests.push({ name, status: 'FAIL', error: err.message, stack: err.stack });
    console.error(`❌ FAIL: ${name}`);
    console.error(`   Error: ${err.message}`);
  }
}

async function run() {
  console.log('====================================================');
  console.log('🧪 RUNNING MILSTONE 2 CHALLENGER 2 EMPIRICAL TESTS');
  console.log('====================================================\n');

  // ── TEST 1: Mapper Export Integrity Check ────────────────────────
  console.log('--- 1. Mapper Module Export Invariants ---');

  test('mapper.extractYear must be an exported function', () => {
    assert.strictEqual(typeof mapper.extractYear, 'function', 'mapper.extractYear is undefined or not exported');
  });

  test('mapper.unpackDeanEdwards must be an exported function', () => {
    assert.strictEqual(typeof mapper.unpackDeanEdwards, 'function', 'mapper.unpackDeanEdwards is undefined or not exported');
  });

  // ── TEST 2: DEFAULT_CONFIG Providers Activation ──────────────────
  console.log('\n--- 2. Default Configuration Provider Activation ---');

  test('DEFAULT_CONFIG must activate all 3 providers (nguonc, kkphim, vsmov)', () => {
    assert(Array.isArray(DEFAULT_CONFIG.providers), 'DEFAULT_CONFIG.providers must be an array');
    const required = ['nguonc', 'kkphim', 'vsmov'];
    for (const p of required) {
      assert(DEFAULT_CONFIG.providers.includes(p), `DEFAULT_CONFIG.providers is missing '${p}'! Current: [${DEFAULT_CONFIG.providers.join(', ')}]`);
    }
  });

  // ── TEST 3: Year Matching & Disambiguation ────────────────────────
  console.log('\n--- 3. Provider Year Matching & Disambiguation ---');

  // Synthetic provider scoring test
  // In nguonc & kkphim, let's verify how year scoring works for exact vs mismatch
  test('NguonC year extraction from category or name regex', () => {
    const itemWithCat = {
      name: 'Người Nhện',
      category: {
        3: { group: { name: 'Năm' }, list: [{ name: '2002' }] }
      }
    };
    if (typeof mapper.extractYear === 'function') {
      const year = mapper.extractYear(itemWithCat.category);
      assert.strictEqual(year, 2002, `Expected 2002, got ${year}`);
    } else {
      assert.fail('mapper.extractYear is not a function');
    }
  });

  // ── TEST 4: KKPhim Live API Query ────────────────────────────────
  console.log('\n--- 4. KKPhim Live Endpoints & Streams ---');

  await asyncTest('KKPhim searches and extracts streams for Inception (2010)', async () => {
    const streams = await kkphim.getStreams({
      title: 'Inception',
      year: 2010,
      type: 'movie',
      proxyBase: 'http://localhost:7000',
    });

    assert(Array.isArray(streams), 'Streams must be an array');
    console.log(`   -> KKPhim returned ${streams.length} streams for Inception`);
    assert(streams.length > 0, 'KKPhim should return active streams for Inception');

    for (const s of streams) {
      assert.strictEqual(s.name, 'VIP Movies 🎬', 'Stream name branding');
      assert(s.title.includes('[VIP • KKPhim]') || s.title.includes('[Dự phòng • KKPhim]'), 'Stream title branding');
      assert(!s.title.includes('#'), `Stream title must not contain '#' symbol: "${s.title}"`);

      // Protocol check
      if (s.url) {
        assert.strictEqual(s.externalUrl, undefined, 'HLS stream MUST NOT have externalUrl');
        assert(s.url.startsWith('http://localhost:7000/hls/manifest.m3u8?url='), 'HLS stream must use proxy route');
      } else if (s.externalUrl) {
        assert.strictEqual(s.url, undefined, 'Embed stream MUST NOT have url');
        assert(s.externalUrl.startsWith('http'), 'externalUrl must be valid URL');
      } else {
        assert.fail('Stream has neither url nor externalUrl');
      }
    }
  });

  // ── TEST 5: NguonC Live API Query ────────────────────────────────
  console.log('\n--- 5. NguonC Live Endpoints & Streams ---');

  await asyncTest('NguonC searches and extracts streams for Inception (2010)', async () => {
    const streams = await nguonc.getStreams({
      title: 'Inception',
      year: 2010,
      type: 'movie',
      proxyBase: 'http://localhost:7000',
    });

    assert(Array.isArray(streams), 'Streams must be an array');
    console.log(`   -> NguonC returned ${streams.length} streams for Inception`);
    assert(streams.length > 0, 'NguonC should return active streams for Inception');

    for (const s of streams) {
      assert.strictEqual(s.name, 'VIP Movies 🎬', 'Stream name branding');
      assert(s.title.includes('[VIP • NguonC]') || s.title.includes('[Dự phòng • NguonC]'), 'Stream title branding');
      assert(!s.title.includes('#'), `Stream title must not contain '#' symbol: "${s.title}"`);

      // Protocol check
      if (s.url) {
        assert.strictEqual(s.externalUrl, undefined, 'HLS stream MUST NOT have externalUrl');
        assert(s.url.startsWith('http://localhost:7000/hls/extract?b64='), 'HLS stream must use proxy route');
      } else if (s.externalUrl) {
        assert.strictEqual(s.url, undefined, 'Embed stream MUST NOT have url');
        assert(s.externalUrl.startsWith('http'), 'externalUrl must be valid URL');
      } else {
        assert.fail('Stream has neither url nor externalUrl');
      }
    }
  });

  // ── TEST 6: Episode Variations & Series Resolution ───────────────
  console.log('\n--- 6. Series Episode Variations ---');

  await asyncTest('KKPhim resolves series episode (Breaking Bad S01E01)', async () => {
    const streams = await kkphim.getStreams({
      title: 'Breaking Bad',
      year: 2008,
      type: 'series',
      season: 1,
      episode: 1,
      proxyBase: 'http://localhost:7000',
    });

    console.log(`   -> KKPhim returned ${streams.length} streams for Breaking Bad S01E01`);
    assert(streams.length > 0, 'KKPhim should return streams for Breaking Bad S01E01');
    for (const s of streams) {
      assert(!s.title.includes('#'), `Title must not contain '#': "${s.title}"`);
    }
  });

  // ── TEST 7: Aggregator Live Query tt1375666 (Inception) ───────────
  console.log('\n--- 7. Stream Aggregator Live Endpoint tt1375666 ---');

  await asyncTest('GET /stream/movie/tt1375666.json returns streams from multiple providers', async () => {
    const app = express();
    app.use('/', handlers);

    const server = await new Promise((resolve) => {
      const s = app.listen(0, () => resolve(s));
    });
    const port = server.address().port;

    try {
      const res = await axios.get(`http://localhost:${port}/stream/movie/tt1375666.json`, { timeout: 15000 });
      assert.strictEqual(res.status, 200);
      assert(res.data && Array.isArray(res.data.streams), 'Response must have streams array');

      const streams = res.data.streams;
      console.log(`   -> Total aggregated streams: ${streams.length}`);

      const providerLabels = new Set();
      for (const s of streams) {
        if (s.title.includes('KKPhim')) providerLabels.add('KKPhim');
        if (s.title.includes('NguonC')) providerLabels.add('NguonC');
        if (s.title.includes('VsMov')) providerLabels.add('VsMov');

        // Protocol compliance
        if (s.url) {
          assert.strictEqual(s.externalUrl, undefined, 'HLS stream must not have externalUrl');
        } else if (s.externalUrl) {
          assert.strictEqual(s.url, undefined, 'Embed stream must not have url');
        }
      }

      console.log(`   -> Providers present in response: [${Array.from(providerLabels).join(', ')}]`);
      assert(providerLabels.size >= 2, `Expected at least 2 active providers in default /stream response, got ${providerLabels.size}: [${Array.from(providerLabels).join(', ')}]`);
    } finally {
      await new Promise((resolve) => server.close(resolve));
    }
  });

  console.log('\n====================================================');
  console.log(`📊 SUMMARY: ${results.passed} PASSED, ${results.failed} FAILED`);
  console.log('====================================================\n');

  if (results.failed > 0) {
    process.exit(1);
  } else {
    process.exit(0);
  }
}

run().catch((err) => {
  console.error('Fatal test runner error:', err);
  process.exit(1);
});
