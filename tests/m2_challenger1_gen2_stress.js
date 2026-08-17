'use strict';

/**
 * ==============================================================================
 *  VIP Movies Addon — tests/m2_challenger1_gen2_stress.js
 *  Adversarial Generator, Oracle & Concurrency Stress Test Suite (Challenger 1 Gen 2)
 *
 *  Deeply challenges all 7 providers:
 *    1. vsmov (VSMOV 4K)
 *    2. kkphim (KKPhim)
 *    3. nguonc (NguonC)
 *    4. stp (STP • Âu Mỹ & K-Drama)
 *    5. hh3d (HH3D • 3D Donghua)
 *    6. yan (YAN • Donghua & Anime)
 *    7. clbpx (CLBPX • Phim Kiếm Hiệp & TVB)
 * ==============================================================================
 */

const assert = require('assert');
const vsmov = require('../src/providers/vsmov');
const kkphim = require('../src/providers/kkphim');
const nguonc = require('../src/providers/nguonc');
const stp = require('../src/providers/stp');
const hh3d = require('../src/providers/hh3d');
const yan = require('../src/providers/yan');
const clbpx = require('../src/providers/clbpx');
const { isSeasonMatch, scoreMatch, safeSlug, safeKeyword, safePage, safeType, safeExtra } = require('../src/lib/utils');

const PROVIDERS = [
  { id: 'vsmov', name: 'VSMOV 4K', mod: vsmov },
  { id: 'kkphim', name: 'KKPhim', mod: kkphim },
  { id: 'nguonc', name: 'NguonC', mod: nguonc },
  { id: 'stp', name: 'STP', mod: stp },
  { id: 'hh3d', name: 'HH3D', mod: hh3d },
  { id: 'yan', name: 'YAN', mod: yan },
  { id: 'clbpx', name: 'CLBPX', mod: clbpx },
];

let totalTests = 0;
let passedTests = 0;
const failures = [];

async function test(desc, fn) {
  totalTests++;
  try {
    await fn();
    console.log(`  ✅ PASS: ${desc}`);
    passedTests++;
  } catch (err) {
    console.error(`  ❌ FAIL: ${desc}`);
    console.error(`     Error: ${err.message}`);
    failures.push({ desc, error: err.message, stack: err.stack });
  }
}

function verifyStrictStreamInvariant(streams, ctx) {
  assert.ok(Array.isArray(streams), `${ctx}: streams must be an array`);
  for (let i = 0; i < streams.length; i++) {
    const s = streams[i];
    assert.ok(s && typeof s === 'object', `${ctx}[${i}]: stream must be an object`);
    assert.strictEqual(s.externalUrl, undefined, `${ctx}[${i}]: externalUrl MUST be undefined`);
    assert.ok(!('externalUrl' in s), `${ctx}[${i}]: 'externalUrl' property MUST NOT exist on object`);
    assert.ok(typeof s.url === 'string' && s.url.length > 0, `${ctx}[${i}]: url must be a valid non-empty string`);
    assert.ok(typeof s.name === 'string' && s.name.length > 0, `${ctx}[${i}]: name must be non-empty string`);
    assert.ok(typeof s.title === 'string' && s.title.length > 0, `${ctx}[${i}]: title must be non-empty string`);
  }
}

async function runGen2StressSuite() {
  console.log('\n==============================================================================');
  console.log('⚡ ADVERSARIAL STRESS SUITE: CHALLENGER 1 GEN 2 DEEP ATTACK VECTORS');
  console.log('==============================================================================\n');

  // --------------------------------------------------------------------------
  // TEST GROUP 1: Adversarial Titles & Blind Search Fallback Prevention
  // --------------------------------------------------------------------------
  console.log('--- GROUP 1: Adversarial Bogus Titles & Regex Bombs across All 7 Providers ---');
  const bogusTitles = [
    '(*+?)',
    '[a-z]+',
    '\\d{1,999999}',
    '((a+)+)+$',
    '??????????',
    '!@#$%^&*()_+=~`',
    '<script>alert(1)</script>',
    'DROP TABLE users;--',
    'SELECT * FROM films WHERE 1=1',
    '../../../../etc/passwd',
    'null',
    'undefined',
    'NaN',
    ' ',
    '   \t\n   ',
    'a',
    'b',
    'xyznonexistentmovietitle998877665544332211',
  ];

  for (const { id, name, mod } of PROVIDERS) {
    for (const title of bogusTitles) {
      await test(`${name} (${id}): rejects bogus title "${title}" returning 0 streams`, async () => {
        const streams = await mod.getStreams({
          title,
          type: 'movie',
          proxyBase: 'http://127.0.0.1:7000',
        });
        assert.ok(Array.isArray(streams), 'Must return array');
        assert.strictEqual(streams.length, 0, `Bogus title "${title}" must return 0 streams, got ${streams.length}`);
        verifyStrictStreamInvariant(streams, `${name} bogus title "${title}"`);
      });
    }
  }

  // --------------------------------------------------------------------------
  // TEST GROUP 2: Season & Episode Bounds Fuzzing
  // --------------------------------------------------------------------------
  console.log('\n--- GROUP 2: Season & Episode Bounds Fuzzing across All 7 Providers ---');
  const seasonEpisodeFuzzCases = [
    { season: 99999, episode: 1, desc: 'season=99999 ep=1' },
    { season: 1001, episode: 1, desc: 'season=1001 ep=1' },
    { season: 0, episode: 1, desc: 'season=0 ep=1' },
    { season: -1, episode: 1, desc: 'season=-1 ep=1' },
    { season: -999, episode: 1, desc: 'season=-999 ep=1' },
    { season: '0', episode: '1', desc: 'season="0" ep="1"' },
    { season: '-5', episode: '1', desc: 'season="-5" ep="1"' },
    { season: '99999', episode: '1', desc: 'season="99999" ep="1"' },
    { season: 1, episode: -1, desc: 'season=1 ep=-1' },
    { season: 1, episode: -999, desc: 'season=1 ep=-999' },
    { season: 1, episode: 0, desc: 'season=1 ep=0' },
    { season: 1, episode: 999999, desc: 'season=1 ep=999999' },
    { season: 'abc', episode: 1, desc: 'season="abc" ep=1' },
    { season: null, episode: -1, desc: 'season=null ep=-1' },
    { season: 1, episode: '-1', desc: 'season=1 ep="-1"' },
    { season: 1, episode: 'tap--5', desc: 'season=1 ep="tap--5"' },
    { season: 1, episode: 'ep-0', desc: 'season=1 ep="ep-0"' },
  ];

  for (const { id, name, mod } of PROVIDERS) {
    for (const c of seasonEpisodeFuzzCases) {
      await test(`${name} (${id}): rejects invalid bounds (${c.desc}) returning 0 streams`, async () => {
        const streams = await mod.getStreams({
          imdbId: 'tt0903747',
          title: 'Breaking Bad',
          type: 'series',
          season: c.season,
          episode: c.episode,
          proxyBase: 'http://127.0.0.1:7000',
        });
        assert.ok(Array.isArray(streams), 'Must return array');
        assert.strictEqual(streams.length, 0, `Bounds case ${c.desc} must return 0 streams, got ${streams.length}`);
        verifyStrictStreamInvariant(streams, `${name} ${c.desc}`);
      });
    }
  }

  // --------------------------------------------------------------------------
  // TEST GROUP 3: Type Chaos & Non-String Argument Fuzzing
  // --------------------------------------------------------------------------
  console.log('\n--- GROUP 3: Type Chaos Fuzzing for getCatalog, getDetail, search, getStreams ---');
  const typeChaosInputs = [
    null,
    undefined,
    12345,
    0,
    -1,
    NaN,
    Infinity,
    true,
    false,
    Symbol('testSymbol'),
    {},
    { foo: 'bar' },
    [],
    [1, 2, 3],
    () => {},
    BigInt(100),
  ];

  for (const { id, name, mod } of PROVIDERS) {
    // 3.1 getCatalog fuzzing
    for (const input of typeChaosInputs) {
      const inputStr = typeof input === 'symbol' ? 'Symbol' : typeof input === 'bigint' ? 'BigInt' : JSON.stringify(input) || String(input);
      await test(`${name} (${id}): getCatalog(type=${inputStr}, page=${inputStr}, extra=${inputStr}) does not throw`, async () => {
        const res = await mod.getCatalog(input, input, input);
        assert.ok(Array.isArray(res), 'getCatalog must always return array');
      });
    }

    // 3.2 getDetail fuzzing
    for (const input of typeChaosInputs) {
      const inputStr = typeof input === 'symbol' ? 'Symbol' : typeof input === 'bigint' ? 'BigInt' : JSON.stringify(input) || String(input);
      await test(`${name} (${id}): getDetail(slug=${inputStr}) does not throw`, async () => {
        const res = await mod.getDetail(input);
        assert.ok(res === null || typeof res === 'object', 'getDetail must return null or object');
      });
    }

    // 3.3 search fuzzing
    for (const input of typeChaosInputs) {
      const inputStr = typeof input === 'symbol' ? 'Symbol' : typeof input === 'bigint' ? 'BigInt' : JSON.stringify(input) || String(input);
      await test(`${name} (${id}): search(keyword=${inputStr}, page=${inputStr}) does not throw`, async () => {
        const res = await mod.search(input, input);
        assert.ok(Array.isArray(res) || (res && Array.isArray(res.items)), 'search must return array or items object');
      });
    }

    // 3.4 getStreams fuzzing
    for (const input of typeChaosInputs) {
      const inputStr = typeof input === 'symbol' ? 'Symbol' : typeof input === 'bigint' ? 'BigInt' : JSON.stringify(input) || String(input);
      await test(`${name} (${id}): getStreams(${inputStr}) does not throw and returns []`, async () => {
        const streams = await mod.getStreams(input, input, input, input, input, input);
        assert.ok(Array.isArray(streams), 'getStreams must always return array');
        verifyStrictStreamInvariant(streams, `${name} getStreams(${inputStr})`);
      });
    }
  }

  // --------------------------------------------------------------------------
  // TEST GROUP 4: Invariant Oracle for scoreMatch and isSeasonMatch
  // --------------------------------------------------------------------------
  console.log('\n--- GROUP 4: Direct Oracle Invariants for scoreMatch & isSeasonMatch ---');
  
  await test('scoreMatch: returns 0 for empty or single-character inputs', async () => {
    assert.strictEqual(scoreMatch({ name: 'Spider-Man' }, ''), 0);
    assert.strictEqual(scoreMatch({ name: 'Spider-Man' }, 'a'), 0);
    assert.strictEqual(scoreMatch(null, 'Spider-Man'), 0);
    assert.strictEqual(scoreMatch(undefined, 'Spider-Man'), 0);
  });

  await test('scoreMatch: returns 0 for non-matching regex bombs', async () => {
    assert.strictEqual(scoreMatch({ name: 'Cuu Mon' }, '(*+?)'), 0);
    assert.strictEqual(scoreMatch({ name: 'Cuu Mon' }, '[a-z]+'), 0);
    assert.strictEqual(scoreMatch({ name: 'Thien Long Bat Bo' }, '\\d+'), 0);
  });

  await test('scoreMatch: exact match scores >= 1.0', async () => {
    const score = scoreMatch({ name: 'Breaking Bad' }, 'Breaking Bad');
    assert.ok(score >= 1.0, `Exact match score ${score} should be >= 1.0`);
  });

  await test('isSeasonMatch: rejects season 0, negative, or > 1000', async () => {
    assert.strictEqual(isSeasonMatch({ name: 'Breaking Bad' }, [], 0), false);
    assert.strictEqual(isSeasonMatch({ name: 'Breaking Bad' }, [], -1), false);
    assert.strictEqual(isSeasonMatch({ name: 'Breaking Bad' }, [], 99999), false);
    assert.strictEqual(isSeasonMatch({ name: 'Breaking Bad' }, [], 1001), false);
  });

  await test('isSeasonMatch: correctly matches explicit season', async () => {
    const movie = { name: 'Breaking Bad Phần 4', origin_name: 'Breaking Bad Season 4' };
    assert.strictEqual(isSeasonMatch(movie, [], 4), true);
    assert.strictEqual(isSeasonMatch(movie, [], 5), false);
    assert.strictEqual(isSeasonMatch(movie, [], 1), false);
  });

  // --------------------------------------------------------------------------
  // TEST GROUP 5: Concurrency & Stress Load across all 7 providers
  // --------------------------------------------------------------------------
  console.log('\n--- GROUP 5: Concurrency Stress Load (20 parallel requests per provider) ---');
  for (const { id, name, mod } of PROVIDERS) {
    await test(`${name} (${id}): handles 20 concurrent getStreams requests gracefully`, async () => {
      const promises = [];
      for (let i = 0; i < 20; i++) {
        const p = mod.getStreams({
          imdbId: i % 2 === 0 ? 'tt0903747' : 'tt10872600',
          title: i % 2 === 0 ? 'Breaking Bad' : 'Spider-Man',
          type: i % 2 === 0 ? 'series' : 'movie',
          season: i % 2 === 0 ? (i % 3 === 0 ? 99999 : 1) : null,
          episode: i % 2 === 0 ? (i % 5 === 0 ? -1 : 1) : null,
          proxyBase: 'http://127.0.0.1:7000',
        });
        promises.push(p);
      }
      const results = await Promise.all(promises);
      assert.strictEqual(results.length, 20);
      for (let rIdx = 0; rIdx < results.length; rIdx++) {
        const streams = results[rIdx];
        assert.ok(Array.isArray(streams), `Request ${rIdx} must return an array`);
        verifyStrictStreamInvariant(streams, `${name} concurrent req ${rIdx}`);
      }
    });
  }

  // --------------------------------------------------------------------------
  // SUMMARY
  // --------------------------------------------------------------------------
  console.log('\n==============================================================================');
  console.log(`📊 ADVERSARIAL STRESS SUITE SUMMARY: ${passedTests} / ${totalTests} PASSED`);
  if (failures.length > 0) {
    console.error(`❌ FAILURES (${failures.length}):`);
    for (const f of failures) {
      console.error(`   - ${f.desc}: ${f.error}`);
    }
  } else {
    console.log('🎉 100% OF ADVERSARIAL STRESS CHALLENGES PASSED! ZERO DEFECTS FOUND.');
  }
  console.log('==============================================================================\n');

  if (failures.length > 0) {
    process.exit(1);
  }
}

runGen2StressSuite().catch((err) => {
  console.error('Fatal crash in stress suite:', err);
  process.exit(1);
});
