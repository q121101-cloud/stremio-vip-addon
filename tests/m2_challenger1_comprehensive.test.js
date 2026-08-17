'use strict';

/**
 * ==============================================================================
 *  VIP Movies Addon — tests/m2_challenger1_comprehensive.test.js
 *  Adversarial Challenge Test Suite for Milestone 2 (Multi-Provider Architecture R2)
 *
 *  Adversarially tests all 7 providers:
 *    - vsmov.js
 *    - kkphim.js
 *    - nguonc.js
 *    - stp.js
 *    - hh3d.js
 *    - yan.js
 *    - clbpx.js
 *
 *  Validates:
 *    1. Edge Cases: Negative episode indices (-1, -100, "-1", "-999").
 *    2. Edge Cases: Out-of-bounds series seasons (0, -1, 99999).
 *    3. Edge Cases: Out-of-bounds episode indices (999999).
 *    4. Edge Cases: Malformed IDs (null, undefined, "", 123, {}, [], ":::", "tt", "kkphim:", "vsmov_///").
 *    5. Edge Cases: Non-existent titles, XSS payloads, regex bombs, 20k-character strings.
 *    6. Method Signature & Type Robustness across search, getDetail, getCatalog, getStreams.
 *    7. Strict Stream Invariant: NO stream object EVER emits `externalUrl`.
 *    8. Full Aggregator & Live Playback / Network Resolution across all 7 providers.
 * ==============================================================================
 */

const assert = require('assert');
const express = require('express');
const cors = require('cors');
const axios = require('axios');

const vsmov = require('../src/providers/vsmov');
const kkphim = require('../src/providers/kkphim');
const nguonc = require('../src/providers/nguonc');
const stp = require('../src/providers/stp');
const hh3d = require('../src/providers/hh3d');
const yan = require('../src/providers/yan');
const clbpx = require('../src/providers/clbpx');

const hlsRouter = require('../src/routes/hls');
const manifestRouter = require('../src/routes/manifest');
const handlersRouter = require('../src/handlers');

const PROVIDERS = [
  { id: 'vsmov', name: 'VSMOV 4K', mod: vsmov, sampleMovie: 'cuu-mon', sampleSeries: 'tap-lam-nguoi-xau-phan-4' },
  { id: 'kkphim', name: 'KKPhim', mod: kkphim, sampleMovie: 'cuu-mon', sampleSeries: 'breaking-bad' },
  { id: 'nguonc', name: 'NguonC', mod: nguonc, sampleMovie: 'cuu-mon', sampleSeries: 'breaking-bad' },
  { id: 'stp', name: 'STP', mod: stp, sampleMovie: 'squid-game', sampleSeries: 'squid-game' },
  { id: 'hh3d', name: 'HH3D', mod: hh3d, sampleMovie: 'the-gioi-hoan-my', sampleSeries: 'the-gioi-hoan-my' },
  { id: 'yan', name: 'YAN', mod: yan, sampleMovie: 'dau-pha-thuong-khung', sampleSeries: 'dau-pha-thuong-khung' },
  { id: 'clbpx', name: 'CLBPX', mod: clbpx, sampleMovie: 'thien-long-bat-bo', sampleSeries: 'thien-long-bat-bo' },
];

let totalTests = 0;
let passedTests = 0;
const failures = [];

async function it(title, fn) {
  totalTests++;
  try {
    await fn();
    console.log(`  ✅ PASS: ${title}`);
    passedTests++;
  } catch (err) {
    console.error(`  ❌ FAIL: ${title}`);
    console.error(`     Error: ${err.message}`);
    failures.push({ title, error: err.message, stack: err.stack });
  }
}

function verifyStreamInvariants(streams, contextName) {
  assert.ok(Array.isArray(streams), `${contextName}: streams must be an array`);
  for (let i = 0; i < streams.length; i++) {
    const s = streams[i];
    assert.ok(s && typeof s === 'object', `${contextName}[${i}]: stream item must be an object`);
    assert.strictEqual(s.externalUrl, undefined, `${contextName}[${i}]: STRICT INVARIANT VIOLATION: externalUrl must be undefined`);
    assert.ok(!('externalUrl' in s), `${contextName}[${i}]: STRICT INVARIANT VIOLATION: 'externalUrl' property must not exist on stream object`);
    assert.ok(typeof s.url === 'string' && s.url.length > 0, `${contextName}[${i}]: stream.url must be a non-empty string`);
    assert.ok(s.url.startsWith('http://') || s.url.startsWith('https://'), `${contextName}[${i}]: stream.url must be an absolute http(s) URL`);
    assert.ok(typeof s.name === 'string' && s.name.length > 0, `${contextName}[${i}]: stream.name must be non-empty string`);
    assert.ok(typeof s.title === 'string' && s.title.length > 0, `${contextName}[${i}]: stream.title must be non-empty string`);
    assert.ok(s.behaviorHints && typeof s.behaviorHints === 'object', `${contextName}[${i}]: stream.behaviorHints must be an object`);
  }
}

async function runEmpiricalChallenge() {
  console.log('\n==============================================================================');
  console.log('⚡ ADVERSARIAL CHALLENGER 1: M2 MULTI-PROVIDER ARCHITECTURE R2 VERIFICATION');
  console.log('==============================================================================\n');

  // ────────────────────────────────────────────────────────────────────────────
  //  SECTION 1: Standard Interface & Export Invariants
  // ────────────────────────────────────────────────────────────────────────────
  console.log('--- SECTION 1: Standard Interface & Export Invariants across all 7 providers ---');
  for (const { id, name, mod } of PROVIDERS) {
    await it(`${name} (${id}): exports valid standard interface`, async () => {
      assert.strictEqual(mod.id, id);
      assert.ok(typeof mod.label === 'string' && mod.label.length > 0);
      assert.strictEqual(typeof mod.search, 'function');
      assert.strictEqual(typeof mod.getDetail, 'function');
      assert.strictEqual(typeof mod.getCatalog, 'function');
      assert.strictEqual(typeof mod.getStreams, 'function');
    });
  }

  // ────────────────────────────────────────────────────────────────────────────
  //  SECTION 2: Negative & Malformed Episode Indices
  // ────────────────────────────────────────────────────────────────────────────
  console.log('\n--- SECTION 2: Negative & Malformed Episode Indices ---');
  const negativeEpisodeCases = [-1, -10, -999, '-1', '-100', '-0', 'ep-1', 'tap--1', '-NaN'];

  for (const { id, name, mod } of PROVIDERS) {
    for (const negEp of negativeEpisodeCases) {
      await it(`${name} (${id}): rejects negative episode index (${negEp}) safely with 0 streams`, async () => {
        const streams = await mod.getStreams({
          imdbId: 'tt0903747',
          title: 'Breaking Bad',
          type: 'series',
          season: 1,
          episode: negEp,
          proxyBase: 'http://127.0.0.1:7000',
        });
        assert.ok(Array.isArray(streams), 'Must return array');
        assert.strictEqual(streams.length, 0, `Negative episode ${negEp} must NOT match any stream`);
        verifyStreamInvariants(streams, `${name} negative episode ${negEp}`);
      });
    }
  }

  // ────────────────────────────────────────────────────────────────────────────
  //  SECTION 3: Out-of-Bounds Series Seasons & Episode Indices
  // ────────────────────────────────────────────────────────────────────────────
  console.log('\n--- SECTION 3: Out-of-Bounds Seasons & Episode Numbers ---');
  const outOfBoundsCases = [
    { season: 99999, episode: 1 },
    { season: 0, episode: 1 },
    { season: -5, episode: 1 },
    { season: 1, episode: 999999 },
    { season: 50, episode: 50000 },
  ];

  for (const { id, name, mod } of PROVIDERS) {
    for (const { season, episode } of outOfBoundsCases) {
      await it(`${name} (${id}): out-of-bounds season=${season} episode=${episode} returns [] safely`, async () => {
        const streams = await mod.getStreams({
          imdbId: 'tt0903747',
          title: 'Breaking Bad',
          type: 'series',
          season,
          episode,
          proxyBase: 'http://127.0.0.1:7000',
        });
        assert.ok(Array.isArray(streams), 'Must return array');
        assert.strictEqual(streams.length, 0, `Out of bounds season=${season}, ep=${episode} must return 0 streams`);
        verifyStreamInvariants(streams, `${name} OOB`);
      });
    }
  }

  // ────────────────────────────────────────────────────────────────────────────
  //  SECTION 4: Malformed IDs & Injection Payloads
  // ────────────────────────────────────────────────────────────────────────────
  console.log('\n--- SECTION 4: Malformed IDs & Injection Payloads ---');
  const malformedIds = [
    null,
    undefined,
    '',
    '   ',
    ':::',
    '::1:1',
    ':1:1',
    'tt',
    'ttabc',
    'tt000000000000000000000',
    'unknown_prefix:123',
    'kkphim:',
    'vsmov:',
    'nguonc:',
    'stp:',
    'hh3d:',
    'yan:',
    'clbpx:',
    'vsmov_///',
    '../../etc/passwd',
    '<script>alert(1)</script>',
    'SELECT * FROM users;',
    '${process.exit(1)}',
    '%00%00%00',
    '\u0000\u0000',
  ];

  for (const { id, name, mod } of PROVIDERS) {
    for (const mId of malformedIds) {
      await it(`${name} (${id}): handles malformed ID "${String(mId).slice(0, 20)}" without crashing`, async () => {
        // Test as object payload
        const s1 = await mod.getStreams({
          imdbId: mId,
          slug: mId,
          type: 'movie',
          proxyBase: 'http://127.0.0.1:7000',
        });
        assert.ok(Array.isArray(s1), 'Payload object must return array');
        verifyStreamInvariants(s1, `${name} malformed ID`);

        // Test as string positional
        if (typeof mId === 'string') {
          const s2 = await mod.getStreams(mId, null, 'movie', null, null, 'http://127.0.0.1:7000');
          assert.ok(Array.isArray(s2), 'String positional must return array');
          verifyStreamInvariants(s2, `${name} malformed string ID`);
        }
      });
    }
  }

  // ────────────────────────────────────────────────────────────────────────────
  //  SECTION 5: Non-Existent Titles, Regex Bombs, & Extreme Length Inputs
  // ────────────────────────────────────────────────────────────────────────────
  console.log('\n--- SECTION 5: Non-Existent Titles, Regex Bombs, & Extreme Inputs ---');
  const adversarialTitles = [
    '__definitely_non_existent_movie_title_xyz_987654321__',
    '(*+?)',
    '[a-z]+',
    '{1,999999}',
    '((((((((((a))))))))))',
    '(?=.*[a-z])(?=.*[A-Z])',
    '🎬🍿🎥🔥⚡',
    '!@#$%^&*()_+=-~`[]{}|;:,.<>?',
    'a'.repeat(5000), // 5,000 characters
  ];

  for (const { id, name, mod } of PROVIDERS) {
    for (const title of adversarialTitles) {
      await it(`${name} (${id}): non-existent/adversarial title "${title.slice(0, 25)}..." returns [] safely`, async () => {
        const streams = await mod.getStreams({
          title,
          type: 'movie',
          proxyBase: 'http://127.0.0.1:7000',
        });
        assert.ok(Array.isArray(streams), 'Must return array');
        assert.strictEqual(streams.length, 0, 'Adversarial title should return 0 streams');
        verifyStreamInvariants(streams, `${name} adversarial title`);
      });
    }
  }

  // ────────────────────────────────────────────────────────────────────────────
  //  SECTION 6: Robustness across search(), getDetail(), and getCatalog()
  // ────────────────────────────────────────────────────────────────────────────
  console.log('\n--- SECTION 6: Robustness of search(), getDetail(), and getCatalog() ---');
  const garbageInputs = [null, undefined, 123, {}, [], false, true, NaN, Symbol('test')];

  for (const { id, name, mod } of PROVIDERS) {
    await it(`${name} (${id}): search() handles garbage inputs gracefully`, async () => {
      for (const g of garbageInputs) {
        const res = await mod.search(g);
        assert.ok(res !== null && res !== undefined, 'search must not return null/undefined');
        // search returns array or { items: [] }
        const items = Array.isArray(res) ? res : res.items;
        assert.ok(Array.isArray(items), 'search items must be an array');
      }
    });

    await it(`${name} (${id}): getDetail() handles garbage inputs gracefully`, async () => {
      for (const g of garbageInputs) {
        const res = await mod.getDetail(g);
        assert.strictEqual(res, null, 'getDetail on invalid slug must return null');
      }
    });

    await it(`${name} (${id}): getCatalog() handles garbage inputs gracefully`, async () => {
      for (const g of garbageInputs) {
        const res = await mod.getCatalog(g, -1, g);
        assert.ok(Array.isArray(res), 'getCatalog must return an array');
      }
    });
  }

  // ────────────────────────────────────────────────────────────────────────────
  //  SECTION 7: Zero externalUrl Invariant under Real Movie & Series Resolution
  // ────────────────────────────────────────────────────────────────────────────
  console.log('\n--- SECTION 7: Zero externalUrl Invariant under Real Media Resolution ---');
  
  // Real movie & series test cases across providers
  const mediaQueries = [
    { title: 'Spider-Man', year: 2021, type: 'movie', imdbId: 'tt10872600' },
    { title: 'Inception', year: 2010, type: 'movie', imdbId: 'tt1375666' },
    { title: 'Breaking Bad', year: 2008, type: 'series', imdbId: 'tt0903747', season: 1, episode: 1 },
    { title: 'Solo Leveling', year: 2024, type: 'series', imdbId: 'tt21209876', season: 1, episode: 1 },
    { title: 'Thế Giới Hoàn Mỹ', year: 2021, type: 'series', season: 1, episode: 1 },
  ];

  for (const { id, name, mod } of PROVIDERS) {
    for (const query of mediaQueries) {
      await it(`${name} (${id}): real stream resolution for "${query.title}" complies with 0 externalUrl`, async () => {
        const streams = await mod.getStreams({
          ...query,
          proxyBase: 'http://127.0.0.1:7000',
        });
        assert.ok(Array.isArray(streams), 'Streams must be array');
        if (streams.length > 0) {
          verifyStreamInvariants(streams, `${name} [${query.title}]`);
          console.log(`     -> ${name} resolved ${streams.length} stream(s) for "${query.title}" with 0 externalUrl`);
        }
      });
    }
  }

  // ────────────────────────────────────────────────────────────────────────────
  //  SECTION 8: End-to-End Aggregator Server & Playback Verification
  // ────────────────────────────────────────────────────────────────────────────
  console.log('\n--- SECTION 8: End-to-End Aggregator Express Server Test ---');
  
  const app = express();
  app.use(cors());
  app.use(express.json());
  app.use('/hls', hlsRouter);
  app.use('/', manifestRouter);
  app.use('/', handlersRouter);

  const server = await new Promise((resolve, reject) => {
    const s = app.listen(0, '127.0.0.1', () => resolve(s));
    s.on('error', reject);
  });

  const port = server.address().port;
  const baseUrl = `http://127.0.0.1:${port}`;

  try {
    await it('E2E: /health endpoint reports all 7 providers active and healthy', async () => {
      const res = await axios.get(`${baseUrl}/health`);
      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.data.status, 'ok');
      assert.ok(Array.isArray(res.data.providers));
      assert.strictEqual(res.data.providers.length, 7);
      const expectedProviders = ['vsmov', 'kkphim', 'nguonc', 'stp', 'hh3d', 'yan', 'clbpx'];
      for (const ep of expectedProviders) {
        assert.ok(res.data.providers.includes(ep), `Health check must list provider ${ep}`);
      }
    });

    await it('E2E: /manifest.json returns valid Stremio v1.4.0/v1.5.0 manifest with catalogs', async () => {
      const res = await axios.get(`${baseUrl}/manifest.json`);
      assert.strictEqual(res.status, 200);
      assert.ok(res.data.id);
      assert.ok(Array.isArray(res.data.catalogs) && res.data.catalogs.length > 0);
    });

    await it('E2E: Stream aggregator on malformed IDs returns HTTP 200 with { streams: [] } (never 404/500)', async () => {
      const badRoutes = [
        `${baseUrl}/stream/movie/invalid_movie_id_9999.json`,
        `${baseUrl}/stream/series/tt0000000:999:999.json`,
        `${baseUrl}/stream/series/tt0903747:1:-1.json`,
        `${baseUrl}/stream/series/kkphim:cuu-mon:1:-5.json`,
      ];
      for (const url of badRoutes) {
        const res = await axios.get(url);
        assert.strictEqual(res.status, 200, `URL ${url} must return HTTP 200`);
        assert.ok(Array.isArray(res.data.streams), `URL ${url} must return streams array`);
        verifyStreamInvariants(res.data.streams, `Aggregator ${url}`);
      }
    });

    await it('E2E: Stream aggregator on real movie aggregates streams with 100% zero externalUrl', async () => {
      const res = await axios.get(`${baseUrl}/stream/movie/kkphim:cuu-mon.json`);
      assert.strictEqual(res.status, 200);
      assert.ok(Array.isArray(res.data.streams) && res.data.streams.length > 0);
      verifyStreamInvariants(res.data.streams, 'Aggregator real movie');
      console.log(`     -> Aggregator returned ${res.data.streams.length} stream(s) for movie`);
    });

    await it('E2E: Stream aggregator on real series aggregates streams with 100% zero externalUrl', async () => {
      const res = await axios.get(`${baseUrl}/stream/series/tt0903747:1:1.json`);
      assert.strictEqual(res.status, 200);
      assert.ok(Array.isArray(res.data.streams) && res.data.streams.length > 0);
      verifyStreamInvariants(res.data.streams, 'Aggregator real series');
      console.log(`     -> Aggregator returned ${res.data.streams.length} stream(s) for series`);
    });
  } finally {
    server.close();
  }

  // ────────────────────────────────────────────────────────────────────────────
  //  FINAL SUMMARY
  // ────────────────────────────────────────────────────────────────────────────
  console.log('\n==============================================================================');
  console.log(`🏁 ADVERSARIAL CHALLENGER 1 RESULTS: ${passedTests} / ${totalTests} PASSED`);
  console.log('==============================================================================\n');

  if (failures.length > 0) {
    console.error(`💥 ${failures.length} CHALLENGES FAILED:`);
    failures.forEach((f, idx) => {
      console.error(`  [${idx + 1}] ${f.title}: ${f.error}`);
    });
    process.exit(1);
  }
}

if (require.main === module) {
  runEmpiricalChallenge()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('Fatal challenge error:', err);
      process.exit(1);
    });
}

module.exports = { runEmpiricalChallenge };
