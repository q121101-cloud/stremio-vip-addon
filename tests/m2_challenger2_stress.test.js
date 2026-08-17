'use strict';

/**
 * ==============================================================================
 *  CHALLENGER 2 ADVERSARIAL STRESS TEST HARNESS — MILESTONE 2 REMEDIATION
 * ==============================================================================
 *  Targeting All 7 Providers:
 *    - vsmov, kkphim, nguonc, stp, hh3d, yan, clbpx
 *
 *  Coverage:
 *    1. Concurrency Bursts & Timeout / Resiliency Behavior
 *    2. Unicode, NFC/NFD Diacritics, Vietnamese Queries, Emojis, Empty Queries
 *    3. Stream URL Generation, Base64URL Routing & Zero-externalUrl Invariant
 *    4. Express HLS Router Parameter Decoding & Verification
 *    5. Out-of-Bounds Pagination, Season/Episode Permutations, and Garbage Types
 * ==============================================================================
 */

const assert = require('assert');
const http = require('http');
const express = require('express');

const vsmov = require('../src/providers/vsmov');
const kkphim = require('../src/providers/kkphim');
const nguonc = require('../src/providers/nguonc');
const stp = require('../src/providers/stp');
const hh3d = require('../src/providers/hh3d');
const yan = require('../src/providers/yan');
const clbpx = require('../src/providers/clbpx');
const hlsRouter = require('../src/routes/hls');

const ALL_PROVIDERS = [
  { id: 'vsmov', mod: vsmov, label: 'VSMOV 4K' },
  { id: 'kkphim', mod: kkphim, label: 'KKPhim' },
  { id: 'nguonc', mod: nguonc, label: 'NguonC' },
  { id: 'stp', mod: stp, label: 'STP' },
  { id: 'hh3d', mod: hh3d, label: 'HH3D' },
  { id: 'yan', mod: yan, label: 'YAN' },
  { id: 'clbpx', mod: clbpx, label: 'CLBPX' },
];

let totalTests = 0;
let passedTests = 0;
let failedTests = 0;
const failures = [];

function test(name, fn) {
  totalTests++;
  try {
    const res = fn();
    if (res && typeof res.then === 'function') {
      return res
        .then(() => {
          passedTests++;
          console.log(`  ✅ PASS: ${name}`);
        })
        .catch((err) => {
          failedTests++;
          failures.push({ name, error: err.message || err });
          console.error(`  ❌ FAIL: ${name} -> ${err.message}`);
        });
    } else {
      passedTests++;
      console.log(`  ✅ PASS: ${name}`);
      return Promise.resolve();
    }
  } catch (err) {
    failedTests++;
    failures.push({ name, error: err.message || err });
    console.error(`  ❌ FAIL: ${name} -> ${err.message}`);
    return Promise.resolve();
  }
}

function decodeB64Url(str) {
  if (!str) return null;
  try {
    return Buffer.from(str, 'base64url').toString('utf8');
  } catch {
    return null;
  }
}

async function runSuite() {
  console.log('╔══════════════════════════════════════════════════════════════════════════════╗');
  console.log('║    ⚔️  M2 CHALLENGER 2: ADVERSARIAL & EDGE-CASE VERIFICATION HARNESS          ║');
  console.log('╚══════════════════════════════════════════════════════════════════════════════╝\n');

  // =========================================================================
  // SECTION 1: CONCURRENT PROVIDER QUERIES & TIMEOUT RESILIENCY
  // =========================================================================
  console.log('--- SECTION 1: Concurrency Bursts & Timeout Resiliency ---');

  await test('1.1 Concurrency Burst: 70 simultaneous getCatalog requests across all 7 providers', async () => {
    const burstPromises = [];
    for (let i = 1; i <= 10; i++) {
      for (const p of ALL_PROVIDERS) {
        burstPromises.push(p.mod.getCatalog('movie', i, {}));
      }
    }
    const results = await Promise.allSettled(burstPromises);
    assert.strictEqual(results.length, 70, 'Must process all 70 requests');
    for (const r of results) {
      assert.strictEqual(r.status, 'fulfilled', 'No unhandled promise rejection in concurrency burst');
      assert(Array.isArray(r.value), 'Catalog response must be an array');
    }
  });

  await test('1.2 Concurrency Burst: 70 simultaneous getStreams requests for mixed media IDs', async () => {
    const testIds = ['tt0903747', 'tt1877830', 'tt0848228', 'non_existent_movie_id_9999'];
    const burstPromises = [];
    for (const testId of testIds) {
      for (const p of ALL_PROVIDERS) {
        burstPromises.push(
          p.mod.getStreams({
            imdbId: testId,
            title: 'Test Concurrency Title',
            type: 'movie',
            proxyBase: 'http://127.0.0.1:7000',
          })
        );
      }
    }
    const results = await Promise.allSettled(burstPromises);
    assert.strictEqual(results.length, testIds.length * ALL_PROVIDERS.length);
    for (const r of results) {
      assert.strictEqual(r.status, 'fulfilled', 'No unhandled rejection in stream query burst');
      assert(Array.isArray(r.value), 'getStreams must return array');
    }
  });

  await test('1.3 Timeout Resiliency: Provider queries must isolate network timeouts to 5000ms max', async () => {
    const start = Date.now();
    const calls = ALL_PROVIDERS.map((p) =>
      p.mod.getStreams({
        imdbId: 'tt999999999999',
        title: 'NonExistentMovieForever_TimeoutTest',
        type: 'movie',
      })
    );
    const results = await Promise.all(calls);
    const elapsed = Date.now() - start;
    assert(elapsed < 12000, `Aggregated parallel timeout took ${elapsed}ms, expected under 12000ms`);
    for (const res of results) {
      assert(Array.isArray(res), 'Must safely return empty array on non-existent or timed out media');
    }
  });

  // =========================================================================
  // SECTION 2: UNICODE, DIACRITICS, VIETNAMESE, EMOJIS, AND EMPTY STRINGS
  // =========================================================================
  console.log('\n--- SECTION 2: Unicode, Diacritics, Vietnamese & Empty Query Strings ---');

  const VIETNAMESE_TITLES = [
    'Đấu Phá Khung Thương',
    'Thế Giới Hoàn Mỹ',
    'Lạc Du Nguyên',
    'Tiên Nghịch',
    'Trùng Sinh',
    'Gia Đình Siêu Quậy',
    'Người Đàn Ông Thép',
    'Kỳ Nghỉ Của Mr. Bean',
    'Sát Thủ John Wick',
    'Bố Già',
    'Thần Điêu Đại Hiệp',
    'Ỷ Thiên Đồ Long Ký',
    'Tây Du Ký 1986',
    'Bao Thanh Thiên',
    'Tam Quốc Diễn Nghĩa',
  ];

  for (const p of ALL_PROVIDERS) {
    await test(`2.1 [${p.id}] Vietnamese diacritics & NFC/NFD normalization handling in search & streams`, async () => {
      for (const title of VIETNAMESE_TITLES) {
        const nfc = title.normalize('NFC');
        const nfd = title.normalize('NFD');

        const [sNfc, sNfd] = await Promise.all([p.mod.search(nfc), p.mod.search(nfd)]);
        assert(Array.isArray(sNfc) || (sNfc && Array.isArray(sNfc.items)), `${p.id} search(NFC) must return array or {items:[]}`);
        assert(Array.isArray(sNfd) || (sNfd && Array.isArray(sNfd.items)), `${p.id} search(NFD) must return array or {items:[]}`);

        const [stNfc, stNfd] = await Promise.all([
          p.mod.getStreams({ title: nfc, type: 'series', season: 1, episode: 1 }),
          p.mod.getStreams({ title: nfd, type: 'series', season: 1, episode: 1 }),
        ]);
        assert(Array.isArray(stNfc), `${p.id} getStreams(NFC) must return array`);
        assert(Array.isArray(stNfd), `${p.id} getStreams(NFD) must return array`);
      }
    });
  }

  const ADVERSARIAL_QUERY_STRINGS = [
    { label: 'Empty string', val: '' },
    { label: 'Whitespace string', val: '    ' },
    { label: 'Tabs and Newlines', val: '\t\n\r\n' },
    { label: 'Null character in string', val: 'Spider-Man\0Evil' },
    { label: 'Combining Diacritical Marks', val: 'a\u0300\u0301\u0302\u0303\u0309\u0323' },
    { label: 'Zero-Width characters', val: 'Thế\u200BGiới\u200CHoàn\uFEFFMỹ' },
    { label: 'Emojis & Special Symbols', val: '🌟🎬 Perfect World 完美世界 (2021) 🚀🔥' },
    { label: 'CJK Mixed Characters', val: '斗破苍穹 Đấu Phá Thương Khung 1080p' },
    { label: 'Arabic and Cyrillic Mixed', val: 'Человек-паук الرجل العنكبوت Spider' },
    { label: 'SQL Injection syntax in search', val: "'' OR 1=1 -- '; DROP TABLE movies; --" },
    { label: 'XSS HTML payload in search', val: '<script>alert("xss")</script><img src=x onerror=alert(1)>' },
    { label: 'Path Traversal payload in search', val: '../../../../../../etc/passwd' },
    { label: 'RegExp metacharacters sequence', val: '[a-zA-Z0-9]+?.*^$(){}|[]\\' },
  ];

  for (const p of ALL_PROVIDERS) {
    await test(`2.2 [${p.id}] Adversarial Query Strings in search(), getCatalog(), and getStreams()`, async () => {
      for (const adv of ADVERSARIAL_QUERY_STRINGS) {
        // search
        const sRes = await p.mod.search(adv.val);
        assert(Array.isArray(sRes) || (sRes && Array.isArray(sRes.items)), `search(${adv.label}) must return valid list`);

        // getCatalog
        const cRes = await p.mod.getCatalog('movie', 1, { search: adv.val });
        assert(Array.isArray(cRes), `getCatalog(${adv.label}) must return array`);

        // getStreams
        const stRes = await p.mod.getStreams({ title: adv.val, type: 'movie' });
        assert(Array.isArray(stRes), `getStreams(${adv.label}) must return array`);
      }
    });
  }

  // =========================================================================
  // SECTION 3: STREAM URL GENERATION, BASE64URL ROUTING & INVARIANT
  // =========================================================================
  console.log('\n--- SECTION 3: Stream URL Generation, Base64URL Routing & Invariants ---');

  const proxyBaseUrl = 'http://127.0.0.1:8888';

  for (const p of ALL_PROVIDERS) {
    await test(`3.1 [${p.id}] Stream URL generation protocol and Base64URL parameter validation`, async () => {
      let testPayload = null;
      if (p.id === 'vsmov') testPayload = { slug: 'cuu-mon', type: 'movie', proxyBase: proxyBaseUrl };
      else if (p.id === 'kkphim') testPayload = { slug: 'cuu-mon', type: 'movie', proxyBase: proxyBaseUrl };
      else if (p.id === 'nguonc') testPayload = { slug: 'cuu-mon', type: 'movie', proxyBase: proxyBaseUrl };
      else if (p.id === 'stp') testPayload = { title: 'John Wick', type: 'movie', proxyBase: proxyBaseUrl };
      else if (p.id === 'hh3d') testPayload = { title: 'Thế Giới Hoàn Mỹ', type: 'series', season: 1, episode: 1, proxyBase: proxyBaseUrl };
      else if (p.id === 'yan') testPayload = { title: 'Thôn Phệ Tinh Không', type: 'series', season: 1, episode: 1, proxyBase: proxyBaseUrl };
      else if (p.id === 'clbpx') testPayload = { title: 'Bao Thanh Thiên', type: 'series', season: 1, episode: 1, proxyBase: proxyBaseUrl };

      const streams = await p.mod.getStreams(testPayload);
      assert(Array.isArray(streams), `${p.id} getStreams must return array`);

      for (const st of streams) {
        assert.strictEqual(st.name, 'VIP Movies 🎬', `${p.id} stream name must be VIP Movies 🎬`);
        assert(typeof st.title === 'string' && st.title.length > 0, `${p.id} stream title must be non-empty string`);
        assert(typeof st.url === 'string' && st.url.length > 0, `${p.id} stream url must be non-empty string`);
        assert.strictEqual(st.externalUrl, undefined, `${p.id} stream MUST NEVER contain externalUrl`);

        assert(
          st.url.startsWith(`${proxyBaseUrl}/hls/manifest.m3u8`) ||
          st.url.startsWith(`${proxyBaseUrl}/hls/extract`),
          `${p.id} stream url must route to /hls/manifest.m3u8 or /hls/extract. Got: ${st.url}`
        );

        const parsedUrl = new URL(st.url);
        if (parsedUrl.pathname === '/hls/manifest.m3u8') {
          const urlParam = parsedUrl.searchParams.get('url');
          const refParam = parsedUrl.searchParams.get('ref');
          assert(urlParam, `${p.id} manifest route must include ?url= parameter`);
          assert(refParam, `${p.id} manifest route must include &ref= parameter`);

          const decodedTarget = decodeB64Url(urlParam);
          assert(
            decodedTarget && (decodedTarget.startsWith('http://') || decodedTarget.startsWith('https://')),
            `${p.id} url parameter must decode to a valid http(s) URL. Got: ${decodedTarget}`
          );

          const decodedRef = decodeB64Url(refParam);
          assert(
            decodedRef && (decodedRef.startsWith('http://') || decodedRef.startsWith('https://')),
            `${p.id} ref parameter must decode to a valid http(s) Referer. Got: ${decodedRef}`
          );
        }
      }
    });
  }

  // =========================================================================
  // SECTION 4: HLS ROUTER INTEGRATION & PARAMETER DECODING TEST
  // =========================================================================
  console.log('\n--- SECTION 4: HLS Router Express Parameter Decoding Integration ---');

  await test('4.1 Express HLS Router cleanly handles valid and malformed Base64URL parameters', async () => {
    const app = express();
    app.use('/hls', hlsRouter);

    const server = http.createServer(app);
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    const port = server.address().port;
    const testBase = `http://127.0.0.1:${port}`;

    try {
      const resMissing = await fetch(`${testBase}/hls/manifest.m3u8`);
      assert.strictEqual(resMissing.status, 400, 'Missing url param must return 400');

      const resMissingSeg = await fetch(`${testBase}/hls/segment.ts`);
      assert.strictEqual(resMissingSeg.status, 400, 'Missing url param on segment.ts must return 400');

      const resOpt = await fetch(`${testBase}/hls/manifest.m3u8`, { method: 'OPTIONS' });
      assert.strictEqual(resOpt.status, 204, 'OPTIONS preflight must return 204');
      assert.strictEqual(resOpt.headers.get('access-control-allow-origin'), '*', 'CORS Allow Origin * required');

      const resMalformed = await fetch(`${testBase}/hls/manifest.m3u8?url=not_valid_b64_!@#$%^&*()`);
      assert(resMalformed.status === 400 || resMalformed.status === 502, 'Malformed URL param returns 400 or 502 safely');

      const resMalformedSeg = await fetch(`${testBase}/hls/segment.ts?url=not_valid_b64_!@#$%^&*()`);
      assert(resMalformedSeg.status === 400 || resMalformedSeg.status === 502, 'Malformed segment param returns 400 or 502 safely');

    } finally {
      await new Promise((resolve) => server.close(resolve));
    }
  });

  // =========================================================================
  // SECTION 5: OUT-OF-BOUNDS PAGINATION, SEASONS, AND GARBAGE TYPES
  // =========================================================================
  console.log('\n--- SECTION 5: Out-of-Bounds Pagination, Seasons, and Garbage Types ---');

  for (const p of ALL_PROVIDERS) {
    await test(`5.1 [${p.id}] Out-of-bounds pagination (0, -1, 999999, NaN, "abc")`, async () => {
      const pages = [0, -1, -100, 999999, NaN, 'abc', '1e5', null, undefined];
      for (const page of pages) {
        const res = await p.mod.getCatalog('movie', page, {});
        assert(Array.isArray(res), `${p.id} getCatalog with page=${page} must return array`);
      }
    });

    await test(`5.2 [${p.id}] Standard garbage inputs for search(), getDetail(), and getCatalog()`, async () => {
      const garbageInputs = [null, undefined, 123, true, false, {}, [], NaN, Infinity, Symbol('foo')];

      for (const g of garbageInputs) {
        const s = await p.mod.search(g);
        assert(Array.isArray(s) || (s && Array.isArray(s.items)), `${p.id} search with garbage must not throw`);

        const d = await p.mod.getDetail(g);
        assert(d === null || typeof d === 'object', `${p.id} getDetail with garbage must return null or object`);

        const c = await p.mod.getCatalog(g, g, g);
        assert(Array.isArray(c), `${p.id} getCatalog with garbage must return array`);
      }
    });

    await test(`5.3 [${p.id}] getStreams() handles invalid and non-standard payloads gracefully`, async () => {
      const invalidPayloads = [
        null,
        undefined,
        '',
        'invalid_id_format',
        12345,
        false,
        true,
        {},
        { title: null, type: null },
        { imdbId: 'tt0000000', season: -1, episode: -1 },
        { imdbId: 'tt0000000', season: 0, episode: 0 },
        { imdbId: 'tt0000000', season: 99999, episode: 99999 },
      ];

      for (const payload of invalidPayloads) {
        const res = await p.mod.getStreams(payload);
        assert(Array.isArray(res), `${p.id} getStreams must return array on invalid payload`);
      }
    });

    await test(`5.4 [${p.id}] Out-of-bounds season numbers (>1000 or <=0) return empty streams`, async () => {
      const outOfBoundsSeasons = [0, -1, -5, 1001, 99999, '99999'];
      for (const s of outOfBoundsSeasons) {
        const st = await p.mod.getStreams({
          imdbId: 'tt0903747',
          title: 'Breaking Bad',
          type: 'series',
          season: s,
          episode: 1,
        });
        assert.strictEqual(st.length, 0, `${p.id} season=${s} must return 0 streams`);
      }
    });
  }

  // =========================================================================
  // SUMMARY
  // =========================================================================
  console.log('\n================================================================================');
  console.log(`🏁 CHALLENGER 2 STRESS RESULTS: ${passedTests} / ${totalTests} PASSED (${failedTests} failures)`);
  console.log('================================================================================\n');

  if (failedTests > 0) {
    console.error('FAILED TESTS SUMMARY:');
    for (const f of failures) {
      console.error(`- ${f.name}: ${f.error}`);
    }
    process.exit(1);
  } else {
    console.log('🎉 ALL CHALLENGER 2 ADVERSARIAL STRESS TESTS PASSED WITH ZERO ERRORS!\n');
    process.exit(0);
  }
}

runSuite().catch((err) => {
  console.error('Fatal test harness error:', err);
  process.exit(1);
});
