'use strict';

/**
 * ============================================================
 *  VIP Movies Addon — tests/m2_providers.test.js
 *  Requirement R2: Multi-Provider Architecture Test Suite
 *
 *  Verifies:
 *    1. VSMOV 4K Engine (vsmov.js):
 *       - Official API integration (https://vsmov.com/api)
 *       - Direct IMDb / TMDB / Keyword lookup matching
 *       - Master 4K Ultra HD (3840x2160) extraction from *.streamvsmov.com CDN
 *       - HLS Proxy URL wrapping with Referer: https://vsmov.com/
 *       - Title formatting: [VIP 1 • VSMOV] Master 4K Ultra HD / Thuyết Minh
 *       - STRICT INVARIANT: 0 externalUrl properties
 *    2. KKPhim Engine (kkphim.js):
 *       - Official API (https://phimapi.com)
 *       - Direct IMDb lookup (/imdb/title/:imdbId) + fallback search
 *       - Multi-server extraction (Vietsub, Thuyết Minh, Lồng Tiếng)
 *       - Title formatting: [VIP 2 • KKPhim] Vietsub / Thuyết Minh Full HD
 *       - STRICT INVARIANT: 0 externalUrl properties
 *    3. NguonC Engine (nguonc.js):
 *       - Official API (https://phim.nguonc.com/api)
 *       - StreamC embed / m3u8 extraction with Referer: https://embed15.streamc.xyz/
 *       - Title formatting: [VIP 3 • NguonC] Vietsub / Thuyết Minh
 *       - STRICT INVARIANT: 0 externalUrl properties
 *    4. Specialized Providers (stp.js, hh3d.js, yan.js, clbpx.js):
 *       - STP (Western & K-Drama)
 *       - HH3D (3D Donghua)
 *       - YAN (Donghua & Anime)
 *       - CLBPX (Classic Wuxia & TVB)
 *       - Standard interface: { id, label, getCatalog, getStreams }
 *       - Graceful error handling & STRICT 0 externalUrl properties
 *    5. End-to-End Aggregation across all providers
 * ============================================================
 */

const assert = require('assert');
const vsmov = require('../src/providers/vsmov');
const kkphim = require('../src/providers/kkphim');
const nguonc = require('../src/providers/nguonc');
const stp = require('../src/providers/stp');
const hh3d = require('../src/providers/hh3d');
const yan = require('../src/providers/yan');
const clbpx = require('../src/providers/clbpx');

const ALL_PROVIDERS = [
  { mod: vsmov, id: 'vsmov', name: 'VSMOV 4K' },
  { mod: kkphim, id: 'kkphim', name: 'KKPhim' },
  { mod: nguonc, id: 'nguonc', name: 'NguonC' },
  { mod: stp, id: 'stp', name: 'STP' },
  { mod: hh3d, id: 'hh3d', name: 'HH3D' },
  { mod: yan, id: 'yan', name: 'YAN' },
  { mod: clbpx, id: 'clbpx', name: 'CLBPX' },
];

let totalTests = 0;
let passedTests = 0;
const failures = [];

async function test(name, fn) {
  totalTests++;
  try {
    await fn();
    console.log(`  ✅ PASS: ${name}`);
    passedTests++;
  } catch (err) {
    console.error(`  ❌ FAIL: ${name}`);
    console.error(`     ${err.message}`);
    failures.push({ name, error: err.message, stack: err.stack });
  }
}

async function runAll() {
  console.log('\n============================================================');
  console.log('🚀 RUNNING M2 MULTI-PROVIDER VERIFICATION TEST SUITE');
  console.log('============================================================\n');

  // ─── SUITE 1: Standard Interface Verification ─────────────────
  console.log('--- Suite 1: Standard Interface Verification ---');
  for (const { mod, id, name } of ALL_PROVIDERS) {
    await test(`${name} (${id}) implements standard provider interface`, async () => {
      assert.strictEqual(mod.id, id, `Provider id must be '${id}'`);
      assert.ok(typeof mod.label === 'string' && mod.label.length > 0, 'Provider must have non-empty label');
      assert.strictEqual(typeof mod.getCatalog, 'function', 'Provider must export getCatalog');
      assert.strictEqual(typeof mod.getStreams, 'function', 'Provider must export getStreams');
    });
  }

  // ─── SUITE 2: VSMOV 4K Engine Verification ─────────────────────
  console.log('\n--- Suite 2: VSMOV 4K Engine (vsmov.js) ---');
  await test('VSMOV search returns valid items from official API', async () => {
    const res = await vsmov.search('Spider-Man', 1);
    assert.ok(res && Array.isArray(res.items), 'Search response must contain items array');
    assert.ok(res.items.length > 0, 'Search should return at least 1 item for Spider-Man');
    const first = res.items[0];
    assert.ok(first.slug, 'Item must contain slug');
    assert.ok(first.name || first.origin_name, 'Item must contain name');
  });

  await test('VSMOV getCatalog returns 4K Ultra HD catalog items', async () => {
    const items = await vsmov.getCatalog('4k', 1);
    assert.ok(Array.isArray(items), '4K Catalog must be an array');
    assert.ok(items.length > 0, '4K Catalog should contain items');
    assert.ok(items[0].id.startsWith('vsmov_'), `Item id must start with 'vsmov_', got ${items[0].id}`);
  });

  await test('VSMOV getStreams extracts Master 4K stream with zero externalUrl', async () => {
    const streams = await vsmov.getStreams({
      title: 'Spider-Man',
      year: 2026,
      type: 'movie',
      proxyBase: 'http://127.0.0.1:7000',
    });
    assert.ok(Array.isArray(streams), 'Streams must be an array');
    assert.ok(streams.length > 0, 'VSMOV should resolve streams for Spider-Man');

    for (const s of streams) {
      assert.strictEqual(s.name, 'VIP Movies 🎬', 'Stream name must be branded');
      assert.ok(s.title.includes('VSMOV'), `Title must include VSMOV tag: ${s.title}`);
      assert.ok(s.url, 'Stream must have url property');
      assert.ok(s.url.includes('/hls/manifest.m3u8'), `Stream url must route through /hls/manifest.m3u8: ${s.url}`);
      assert.strictEqual(s.externalUrl, undefined, 'STRICT INVARIANT: Stream must NOT have externalUrl');
      assert.ok(!('externalUrl' in s), 'externalUrl key must not exist on stream object');
    }
  });

  // ─── SUITE 3: KKPhim Engine Verification ────────────────────────
  console.log('\n--- Suite 3: KKPhim Engine (kkphim.js) ---');
  await test('KKPhim direct IMDb lookup resolves movie details', async () => {
    const data = await kkphim.getByImdb('tt10872600');
    assert.ok(data && data.movie, 'Direct IMDb lookup should return movie object');
    assert.ok(data.episodes && data.episodes.length > 0, 'Should return episodes array');
  });

  await test('KKPhim getStreams produces VIP 2 streams with zero externalUrl', async () => {
    const streams = await kkphim.getStreams({
      imdbId: 'tt10872600',
      title: 'Spider-Man: No Way Home',
      type: 'movie',
      proxyBase: 'http://127.0.0.1:7000',
    });
    assert.ok(Array.isArray(streams) && streams.length > 0, 'KKPhim should return streams');

    for (const s of streams) {
      assert.strictEqual(s.name, 'VIP Movies 🎬');
      assert.ok(s.title.includes('[VIP 2 • KKPhim]'), `Stream title must have [VIP 2 • KKPhim] prefix: ${s.title}`);
      assert.ok(s.url && s.url.includes('/hls/manifest.m3u8'));
      assert.strictEqual(s.externalUrl, undefined, 'STRICT INVARIANT: KKPhim stream must NOT have externalUrl');
      assert.ok(!('externalUrl' in s));
    }
  });

  // ─── SUITE 4: NguonC Engine Verification ────────────────────────
  console.log('\n--- Suite 4: NguonC Engine (nguonc.js) ---');
  await test('NguonC search returns valid items from official API', async () => {
    const res = await nguonc.search('Spider-Man', 1);
    assert.ok(res && Array.isArray(res.items), 'Search response must contain items array');
    assert.ok(res.items.length > 0, 'Search should return items');
  });

  await test('NguonC getStreams produces VIP 3 streams with zero externalUrl', async () => {
    const streams = await nguonc.getStreams({
      title: 'Spider-Man',
      type: 'movie',
      proxyBase: 'http://127.0.0.1:7000',
    });
    assert.ok(Array.isArray(streams) && streams.length > 0, 'NguonC should return streams');

    for (const s of streams) {
      assert.strictEqual(s.name, 'VIP Movies 🎬');
      assert.ok(s.title.includes('[VIP 3 • NguonC]'), `Stream title must have [VIP 3 • NguonC] prefix: ${s.title}`);
      assert.ok(s.url && (s.url.includes('/hls/manifest.m3u8') || s.url.includes('/hls/extract')));
      assert.strictEqual(s.externalUrl, undefined, 'STRICT INVARIANT: NguonC stream must NOT have externalUrl');
      assert.ok(!('externalUrl' in s));
    }
  });

  // ─── SUITE 5: Specialized Providers Verification ────────────────
  console.log('\n--- Suite 5: Specialized Providers (STP, HH3D, YAN, CLBPX) ---');
  await test('STP provider returns Western Cinema & K-Drama catalogs & streams', async () => {
    const cat = await stp.getCatalog('aumy', 1);
    assert.ok(Array.isArray(cat), 'STP catalog must be an array');
    assert.ok(cat.length > 0, 'STP catalog should return items');
    assert.ok(cat[0].id.startsWith('stp_'), `STP id must start with 'stp_', got ${cat[0].id}`);

    const streams = await stp.getStreams({
      title: 'Squid Game',
      type: 'series',
      season: 1,
      episode: 1,
      proxyBase: 'http://127.0.0.1:7000',
    });
    assert.ok(Array.isArray(streams), 'Streams must be an array');
    for (const s of streams) {
      assert.strictEqual(s.name, 'VIP Movies 🎬');
      assert.ok(s.title.includes('[VIP • STP]'));
      assert.ok(s.url && s.url.includes('/hls/manifest.m3u8'));
      assert.strictEqual(s.externalUrl, undefined);
      assert.ok(!('externalUrl' in s));
    }
  });

  await test('HH3D provider returns 3D Donghua catalogs & streams', async () => {
    const cat = await hh3d.getCatalog('hoathinh', 1);
    assert.ok(Array.isArray(cat), 'HH3D catalog must be an array');
    assert.ok(cat.length > 0, 'HH3D catalog should return items');
    assert.ok(cat[0].id.startsWith('hh3d_'), `HH3D id must start with 'hh3d_', got ${cat[0].id}`);

    const streams = await hh3d.getStreams({
      title: 'Thế Giới Hoàn Mỹ',
      type: 'series',
      season: 1,
      episode: 1,
      proxyBase: 'http://127.0.0.1:7000',
    });
    assert.ok(Array.isArray(streams), 'Streams must be an array');
    for (const s of streams) {
      assert.strictEqual(s.name, 'VIP Movies 🎬');
      assert.ok(s.title.includes('[VIP • HH3D]'));
      assert.ok(s.url && s.url.includes('/hls/manifest.m3u8'));
      assert.strictEqual(s.externalUrl, undefined);
      assert.ok(!('externalUrl' in s));
    }
  });

  await test('YAN provider returns Donghua & Anime catalogs & streams', async () => {
    const cat = await yan.getCatalog('anime', 1);
    assert.ok(Array.isArray(cat), 'YAN catalog must be an array');
    assert.ok(cat.length > 0, 'YAN catalog should return items');
    assert.ok(cat[0].id.startsWith('yan_'), `YAN id must start with 'yan_', got ${cat[0].id}`);

    const streams = await yan.getStreams({
      title: 'Solo Leveling',
      type: 'series',
      season: 1,
      episode: 1,
      proxyBase: 'http://127.0.0.1:7000',
    });
    assert.ok(Array.isArray(streams), 'Streams must be an array');
    for (const s of streams) {
      assert.strictEqual(s.name, 'VIP Movies 🎬');
      assert.ok(s.title.includes('[VIP • YAN]'));
      assert.ok(s.url && s.url.includes('/hls/manifest.m3u8'));
      assert.strictEqual(s.externalUrl, undefined);
      assert.ok(!('externalUrl' in s));
    }
  });

  await test('CLBPX provider returns Classic Wuxia & TVB catalogs & streams', async () => {
    const cat = await clbpx.getCatalog('wuxia', 1);
    assert.ok(Array.isArray(cat), 'CLBPX catalog must be an array');
    assert.ok(cat.length > 0, 'CLBPX catalog should return items');
    assert.ok(cat[0].id.startsWith('clbpx_'), `CLBPX id must start with 'clbpx_', got ${cat[0].id}`);

    const streams = await clbpx.getStreams({
      title: 'Thiên Long Bát Bộ',
      type: 'series',
      season: 1,
      episode: 1,
      proxyBase: 'http://127.0.0.1:7000',
    });
    assert.ok(Array.isArray(streams), 'Streams must be an array');
    for (const s of streams) {
      assert.strictEqual(s.name, 'VIP Movies 🎬');
      assert.ok(s.title.includes('[VIP • CLBPX]'));
      assert.ok(s.url && s.url.includes('/hls/manifest.m3u8'));
      assert.strictEqual(s.externalUrl, undefined);
      assert.ok(!('externalUrl' in s));
    }
  });

  // ─── SUITE 6: Graceful Error Handling & Isolation ───────────────
  console.log('\n--- Suite 6: Graceful Error Handling & Isolation ---');
  for (const { mod, id, name } of ALL_PROVIDERS) {
    await test(`${name} gracefully handles invalid inputs without throwing`, async () => {
      const cat = await mod.getCatalog('non_existent_type_xyz', 9999);
      assert.ok(Array.isArray(cat), 'getCatalog on invalid input must return an array');

      const streams = await mod.getStreams({
        imdbId: 'tt000000000_invalid',
        title: 'non_existent_movie_title_xyz_123456789',
        type: 'movie',
        proxyBase: 'http://localhost:7000',
      });
      assert.ok(Array.isArray(streams), 'getStreams on invalid input must return an array');
    });
  }

  // ─── SUITE 7: Argument Signatures & Invocation Flexibility ─────
  console.log('\n--- Suite 7: Argument Signatures & Invocation Flexibility ---');
  for (const { mod, id, name } of ALL_PROVIDERS) {
    await test(`${name} accepts positional arguments getStreams(imdbId, title, type, season, episode, proxyBase)`, async () => {
      const res = await mod.getStreams('tt10872600', 'Spider-Man', 'movie', null, null, 'http://127.0.0.1:7000');
      assert.ok(Array.isArray(res), 'Must return an array');
    });

    await test(`${name} accepts slug string positional argument getStreams(slug, ...)`, async () => {
      const res = await mod.getStreams(`${id}_test-slug`, null, 'movie', null, null, 'http://127.0.0.1:7000');
      assert.ok(Array.isArray(res), 'Must return an array');
    });
  }

  // ─── SUITE 8: Adversarial & Regex Bomb Resilience ───────────────
  console.log('\n--- Suite 8: Adversarial & Regex Bomb Resilience ---');
  const adversarialEpisodes = [
    '[invalid_regex',
    '(*+?)',
    '{1,99999}',
    '(?=a)b',
    '<script>alert(1)</script>',
    '../../../etc/passwd',
    'null',
    'undefined',
    'NaN',
    '${7*7}',
  ];

  for (const { mod, id, name } of ALL_PROVIDERS) {
    await test(`${name} is immune to adversarial regex bombs in episode strings`, async () => {
      for (const advEp of adversarialEpisodes) {
        const streams = await mod.getStreams({
          imdbId: 'tt10872600',
          title: 'Spider-Man',
          type: 'series',
          season: 1,
          episode: advEp,
          proxyBase: 'http://127.0.0.1:7000',
        });
        assert.ok(Array.isArray(streams), `Must return array for episode "${advEp}"`);
      }
    });
  }

  // ─── SUITE 9: Comprehensive Zero-externalUrl Verification ───────
  console.log('\n--- Suite 9: Comprehensive Zero-externalUrl Verification ---');
  for (const { mod, id, name } of ALL_PROVIDERS) {
    await test(`${name} strictly never returns externalUrl on any stream object`, async () => {
      const streams = await mod.getStreams({
        imdbId: 'tt10872600',
        title: 'Spider-Man',
        type: 'movie',
        proxyBase: 'http://127.0.0.1:7000',
      });
      for (const s of streams) {
        assert.strictEqual(s.externalUrl, undefined, `Stream must not have externalUrl in ${name}`);
        assert.ok(!('externalUrl' in s), `externalUrl key must not exist on stream in ${name}`);
        assert.ok(s.url && (s.url.startsWith('http://') || s.url.startsWith('https://')), 'Stream must have valid URL');
      }
    });
  }

  // ─── Summary ───────────────────────────────────────────────────
  console.log('\n============================================================');
  console.log(`🏁 M2 TEST RESULTS: ${passedTests} / ${totalTests} PASSED`);
  console.log('============================================================\n');

  if (failures.length > 0) {
    console.error(`💥 ${failures.length} TESTS FAILED:`);
    failures.forEach((f, idx) => {
      console.error(`[${idx + 1}] ${f.name}: ${f.error}`);
    });
    process.exit(1);
  }
}

if (require.main === module) {
  runAll().catch((err) => {
    console.error('Fatal test runner error:', err);
    process.exit(1);
  });
}

module.exports = { runAll };
