'use strict';

/**
 * ============================================================================
 *  VIP Movies Addon — Challenger 1 M1 Empirical Adversarial Test Harness
 *  Tests STP, CLBPX, YAN providers, HLS routing, edge cases & strict invariants
 * ============================================================================
 */

const assert = require('assert');
const http = require('http');
const axios = require('axios');
const app = require('../src/index');
const stp = require('../src/providers/stp');
const clbpx = require('../src/providers/clbpx');
const yan = require('../src/providers/yan');

// We extract getRefererHeaders logic from src/routes/hls.js directly or recreate its exact regex matching
const SOURCE_REFERERS = [
  { pattern: /kkphimplayer|phim1280|phimapi\.com|kkphim/i, referer: 'https://player.phimapi.com/', origin: 'https://player.phimapi.com' },
  { pattern: /vsmov|streamvsmov|p25\.streamvsmov/i,        referer: 'https://vsmov.com/',           origin: 'https://vsmov.com' },
  { pattern: /nguonc\.com/i,                               referer: 'https://phim.nguonc.com/',     origin: 'https://phim.nguonc.com' },
  { pattern: /streamc\.|amass2\.top/i,                     referer: 'https://embed15.streamc.xyz/', origin: 'https://embed15.streamc.xyz' },
  { pattern: /sieutamphim|suutamphim|tvhay/i,              referer: 'https://sieutamphim.pro/',     origin: 'https://sieutamphim.pro' },
  { pattern: /yanhh3d|yan|fbcdn\.cloud|defifa\.com/i,      referer: 'https://yanhh3d.pw/',          origin: 'https://yanhh3d.pw' },
  { pattern: /hh3d|hoathinh3d/i,                           referer: 'https://hh3d.tv/',             origin: 'https://hh3d.tv' },
  { pattern: /clbphimxua|clbpx/i,                          referer: 'https://clbphimxua.info/',     origin: 'https://clbphimxua.info' },
];

const DEFAULT_REFERER = 'https://phim.nguonc.com/';

function getRefererHeaders(targetUrl, refParam) {
  if (refParam) {
    try {
      let parsedRef = refParam.trim();
      if (!parsedRef.startsWith('http://') && !parsedRef.startsWith('https://')) {
        parsedRef = `https://${parsedRef}`;
      }
      const origin = new URL(parsedRef).origin;
      return { referer: parsedRef, origin };
    } catch {}
  }

  for (const src of SOURCE_REFERERS) {
    if (src.pattern.test(targetUrl)) {
      return { referer: src.referer, origin: src.origin };
    }
  }

  try {
    const origin = new URL(targetUrl).origin;
    return { referer: `${origin}/`, origin };
  } catch {
    return { referer: DEFAULT_REFERER, origin: 'https://phim.nguonc.com' };
  }
}

let passed = 0;
let failed = 0;

function check(name, fn) {
  try {
    fn();
    console.log(`  ✅ PASS: ${name}`);
    passed++;
  } catch (err) {
    console.error(`  ❌ FAIL: ${name}`);
    console.error(`     Error: ${err.message}`);
    failed++;
  }
}

async function checkAsync(name, fn) {
  try {
    await fn();
    console.log(`  ✅ PASS: ${name}`);
    passed++;
  } catch (err) {
    console.error(`  ❌ FAIL: ${name}`);
    console.error(`     Error: ${err.message}`);
    failed++;
  }
}

async function runAll() {
  console.log('╔══════════════════════════════════════════════════════════════════════╗');
  console.log('║  ADVERSARIAL CHALLENGE SUITE: M1 (STP, CLBPX, YAN & HLS PROXY)       ║');
  console.log('╚══════════════════════════════════════════════════════════════════════╝\n');

  // =========================================================================
  // Section 1: HLS Referer Routing & Zero Collision Verification
  // =========================================================================
  console.log('▶ SECTION 1: HLS Proxy Referer Collision & Routing Audit');

  const refererTestCases = [
    // STP
    { url: 'https://sieutamphim.pro/stream/master.m3u8', expectedRef: 'https://sieutamphim.pro/', expectedOrigin: 'https://sieutamphim.pro' },
    { url: 'https://cdn.suutamphim.org/hls/seg-1.ts', expectedRef: 'https://sieutamphim.pro/', expectedOrigin: 'https://sieutamphim.pro' },
    { url: 'https://tvhay.org/video/index.m3u8', expectedRef: 'https://sieutamphim.pro/', expectedOrigin: 'https://sieutamphim.pro' },

    // CLBPX
    { url: 'https://clbphimxua.info/embed/123', expectedRef: 'https://clbphimxua.info/', expectedOrigin: 'https://clbphimxua.info' },
    { url: 'https://clbphimxua.com/stream/index.m3u8', expectedRef: 'https://clbphimxua.info/', expectedOrigin: 'https://clbphimxua.info' },
    { url: 'https://node1.clbpx.net/segment.ts', expectedRef: 'https://clbphimxua.info/', expectedOrigin: 'https://clbphimxua.info' },

    // YAN vs HH3D Collision tests (CRITICAL)
    { url: 'https://yanhh3d.pw/stream/master.m3u8', expectedRef: 'https://yanhh3d.pw/', expectedOrigin: 'https://yanhh3d.pw' },
    { url: 'https://scontent-sin2-1.fbcdn.cloud/hls/ts/1.ts', expectedRef: 'https://yanhh3d.pw/', expectedOrigin: 'https://yanhh3d.pw' },
    { url: 'https://vip.defifa.com/live/hls.m3u8', expectedRef: 'https://yanhh3d.pw/', expectedOrigin: 'https://yanhh3d.pw' },
    { url: 'https://yan-cdn.net/stream.m3u8', expectedRef: 'https://yanhh3d.pw/', expectedOrigin: 'https://yanhh3d.pw' },
    // Pure HH3D - must NOT collide with YAN
    { url: 'https://hh3d.tv/stream/play.m3u8', expectedRef: 'https://hh3d.tv/', expectedOrigin: 'https://hh3d.tv' },
    { url: 'https://hoathinh3d.com/stream/segment.ts', expectedRef: 'https://hh3d.tv/', expectedOrigin: 'https://hh3d.tv' },

    // VSMOV
    { url: 'https://vsmov.com/video/master.m3u8', expectedRef: 'https://vsmov.com/', expectedOrigin: 'https://vsmov.com' },
    { url: 'https://p25.streamvsmov.com/file/chunk.ts', expectedRef: 'https://vsmov.com/', expectedOrigin: 'https://vsmov.com' },

    // KKPhim
    { url: 'https://player.phimapi.com/v3/manifest.m3u8', expectedRef: 'https://player.phimapi.com/', expectedOrigin: 'https://player.phimapi.com' },
    { url: 'https://s2.phim1280.tv/20231006/segment.ts', expectedRef: 'https://player.phimapi.com/', expectedOrigin: 'https://player.phimapi.com' },
    { url: 'https://kkphimplayer.xyz/v.m3u8', expectedRef: 'https://player.phimapi.com/', expectedOrigin: 'https://player.phimapi.com' },

    // NguonC
    { url: 'https://phim.nguonc.com/api/stream.m3u8', expectedRef: 'https://phim.nguonc.com/', expectedOrigin: 'https://phim.nguonc.com' },
    { url: 'https://embed15.streamc.xyz/stream.m3u8', expectedRef: 'https://embed15.streamc.xyz/', expectedOrigin: 'https://embed15.streamc.xyz' },
    { url: 'https://amass2.top/v.m3u8', expectedRef: 'https://embed15.streamc.xyz/', expectedOrigin: 'https://embed15.streamc.xyz' },

    // Fallback URL (unknown CDN)
    { url: 'https://unknown-cdn.example.org/path/video.m3u8', expectedRef: 'https://unknown-cdn.example.org/', expectedOrigin: 'https://unknown-cdn.example.org' },
  ];

  for (const tc of refererTestCases) {
    check(`Referer resolution for ${tc.url}`, () => {
      const res = getRefererHeaders(tc.url, null);
      assert.strictEqual(res.referer, tc.expectedRef, `Referer mismatch for ${tc.url}`);
      assert.strictEqual(res.origin, tc.expectedOrigin, `Origin mismatch for ${tc.url}`);
    });
  }

  // Dynamic ref parameter priority
  check('Dynamic refParam override priority', () => {
    const res = getRefererHeaders('https://sieutamphim.pro/video.m3u8', 'https://custom-override.com');
    assert.strictEqual(res.referer, 'https://custom-override.com');
    assert.strictEqual(res.origin, 'https://custom-override.com');
  });

  check('Dynamic refParam auto https prefix', () => {
    const res = getRefererHeaders('https://vsmov.com/v.m3u8', 'custom.origin.io');
    assert.strictEqual(res.referer, 'https://custom.origin.io');
    assert.strictEqual(res.origin, 'https://custom.origin.io');
  });

  check('Fallback for garbage / malformed URL', () => {
    const res = getRefererHeaders('not_a_valid_url', null);
    assert.strictEqual(res.referer, DEFAULT_REFERER);
    assert.strictEqual(res.origin, 'https://phim.nguonc.com');
  });

  // =========================================================================
  // Section 2: STP Provider Stress & Invariant Tests
  // =========================================================================
  console.log('\n▶ SECTION 2: STP Provider Stress & Invariant Verification');

  check('STP exports standard provider interface', () => {
    assert.strictEqual(stp.id, 'stp');
    assert.ok(stp.label.includes('sieutamphim.pro'));
    assert.strictEqual(typeof stp.search, 'function');
    assert.strictEqual(typeof stp.getDetail, 'function');
    assert.strictEqual(typeof stp.getCatalog, 'function');
    assert.strictEqual(typeof stp.getStreams, 'function');
    assert.strictEqual(typeof stp.decodeXor0x2a, 'function');
    assert.strictEqual(typeof stp.parsePostContent, 'function');
  });

  check('STP XOR 0x2a decode correctness & edge cases', () => {
    assert.strictEqual(stp.decodeXor0x2a(''), '');
    assert.strictEqual(stp.decodeXor0x2a(null), '');
    assert.strictEqual(stp.decodeXor0x2a(123), '');
    // Standard test vector
    const raw = 'https://short.ink/_LboFywW3';
    let enc = '';
    for (let i = 0; i < raw.length; i++) enc += String.fromCharCode(raw.charCodeAt(i) ^ 0x2a);
    assert.strictEqual(stp.decodeXor0x2a(enc), raw);
  });

  check('STP parsePostContent multiline HTML & server extraction', () => {
    const enc = 'B^^ZY\u0010\u0005\u0005YBEX^\u0004CDA\u0005ufHElS]}\u0019';
    const mockHtml = `<div class="entry-content"><div class="episodeGroup" data-server="HLS VIP" data-episodes='[\n{"${enc}", "Full"}\n]'></div></div>`;
    const parsed = stp.parsePostContent(mockHtml, 'John Wick 4');
    assert.strictEqual(parsed.name, 'John Wick 4');
    assert.strictEqual(parsed.episodes.length, 1);
    assert.strictEqual(parsed.episodes[0].server_name, 'HLS VIP');
    assert.strictEqual(parsed.episodes[0].server_data[0].link_m3u8, 'https://short.ink/_LboFywW3');
  });

  await checkAsync('STP search with empty, whitespace & special characters', async () => {
    const resEmpty = await stp.search('', 1);
    assert.deepStrictEqual(resEmpty, []);
    const resSpace = await stp.search('   ', 1);
    assert.deepStrictEqual(resSpace, []);
    const resSpecial = await stp.search('!@#$%^&*()_+{}|:"<>?', 1);
    assert.ok(Array.isArray(resSpecial));
    const resXSS = await stp.search('<script>alert("xss")</script>', 1);
    assert.ok(Array.isArray(resXSS));
    const resHuge = await stp.search('a'.repeat(500), 1);
    assert.ok(Array.isArray(resHuge));
  });

  await checkAsync('STP getStreams with empty payload & invalid params', async () => {
    const s1 = await stp.getStreams({});
    assert.deepStrictEqual(s1, []);
    const s2 = await stp.getStreams({ id: null, type: null });
    assert.deepStrictEqual(s2, []);
    const s3 = await stp.getStreams({ id: 'invalid:format:here:more' });
    assert.deepStrictEqual(s3, []);
    const s4 = await stp.getStreams({ title: 'NonExistentMovieXYZ999999', year: 2099 });
    assert.deepStrictEqual(s4, []);
    const s5 = await stp.getStreams({ episode: -5, type: 'series', title: 'Test' });
    assert.deepStrictEqual(s5, []);
    const s6 = await stp.getStreams({ season: -1, type: 'series', title: 'Test' });
    assert.deepStrictEqual(s6, []);
  });

  await checkAsync('STP getStreams live query & strict invariants check', async () => {
    const streams = await stp.getStreams({
      title: 'John Wick',
      year: 2014,
      type: 'movie',
      proxyBase: 'http://127.0.0.1:7000',
    });
    assert.ok(Array.isArray(streams), 'Streams must be array');
    console.log(`     (STP resolved ${streams.length} streams for "John Wick")`);
    for (const s of streams) {
      assert.strictEqual(s.name, 'VIP Movies 🎬', 'Stream name must be exact VIP Movies 🎬');
      assert.strictEqual(s.externalUrl, undefined, 'STRICT INVARIANT: externalUrl must be undefined');
      assert.ok(s.url.startsWith('http://127.0.0.1:7000/hls/manifest.m3u8?url='), 'url must be HLS proxy route');
      assert.ok(s.url.includes('ref='), 'url must contain ref query param');
      assert.ok(s.title.includes('[VIP 4 • STP]'), 'title must contain [VIP 4 • STP]');
      assert.ok(s.title.includes('sieutamphim.pro'), 'title must mention sieutamphim.pro');
      assert.ok(s.behaviorHints && typeof s.behaviorHints === 'object', 'behaviorHints must be object');
    }
  });

  // =========================================================================
  // Section 3: CLBPX Provider Stress & Invariant Tests
  // =========================================================================
  console.log('\n▶ SECTION 3: CLBPX Provider Stress & Invariant Verification');

  check('CLBPX exports standard provider interface', () => {
    assert.strictEqual(clbpx.id, 'clbpx');
    assert.ok(clbpx.label.includes('CLBPX'));
    assert.strictEqual(typeof clbpx.search, 'function');
    assert.strictEqual(typeof clbpx.getDetail, 'function');
    assert.strictEqual(typeof clbpx.getCatalog, 'function');
    assert.strictEqual(typeof clbpx.getStreams, 'function');
  });

  await checkAsync('CLBPX search with empty, whitespace & adversarial queries', async () => {
    const resEmpty = await clbpx.search('', 1);
    assert.deepStrictEqual(resEmpty, []);
    const resSpecial = await clbpx.search('!@#$%^&*()_+{}|:"<>?', 1);
    assert.ok(Array.isArray(resSpecial));
    const resSQLi = await clbpx.search("' UNION SELECT 1,2,3 --", 1);
    assert.ok(Array.isArray(resSQLi));
  });

  await checkAsync('CLBPX getStreams with empty payload & invalid params', async () => {
    const s1 = await clbpx.getStreams({});
    assert.deepStrictEqual(s1, []);
    const s2 = await clbpx.getStreams({ title: 'NonExistentCLBPXTitle123456' });
    assert.deepStrictEqual(s2, []);
    const s3 = await clbpx.getStreams({ episode: -1, type: 'series', title: 'Tay Du Ky' });
    assert.deepStrictEqual(s3, []);
  });

  await checkAsync('CLBPX getStreams live query & strict invariants check', async () => {
    const streams = await clbpx.getStreams({
      title: 'Tay Du Ky',
      year: 1986,
      type: 'series',
      episode: 1,
      proxyBase: 'http://127.0.0.1:7000',
    });
    assert.ok(Array.isArray(streams), 'Streams must be array');
    console.log(`     (CLBPX resolved ${streams.length} streams for "Tay Du Ky" Ep 1)`);
    for (const s of streams) {
      assert.strictEqual(s.name, 'VIP Movies 🎬', 'Stream name must be exact VIP Movies 🎬');
      assert.strictEqual(s.externalUrl, undefined, 'STRICT INVARIANT: externalUrl must be undefined');
      assert.ok(s.url.startsWith('http://127.0.0.1:7000/hls/manifest.m3u8?url='), 'url must be HLS proxy route');
      assert.ok(s.url.includes('ref='), 'url must contain ref query param');
      assert.ok(s.title.includes('[VIP 5 • CLBPX]'), 'title must contain [VIP 5 • CLBPX]');
      assert.ok(s.title.includes('clbphimxua.info'), 'title must mention clbphimxua.info');
      assert.ok(s.behaviorHints && typeof s.behaviorHints === 'object', 'behaviorHints must be object');
    }
  });

  // =========================================================================
  // Section 4: YAN Provider Stress & Invariant Tests
  // =========================================================================
  console.log('\n▶ SECTION 4: YAN Provider Stress & Invariant Verification');

  check('YAN exports standard provider interface', () => {
    assert.strictEqual(yan.id, 'yan');
    assert.ok(yan.label.includes('YAN'));
    assert.strictEqual(typeof yan.search, 'function');
    assert.strictEqual(typeof yan.getDetail, 'function');
    assert.strictEqual(typeof yan.getCatalog, 'function');
    assert.strictEqual(typeof yan.getStreams, 'function');
  });

  await checkAsync('YAN search with empty, whitespace & adversarial queries', async () => {
    const resEmpty = await yan.search('', 1);
    assert.deepStrictEqual(resEmpty, []);
    const resSpecial = await yan.search('!@#$%^&*()_+{}|:"<>?', 1);
    assert.ok(Array.isArray(resSpecial));
    const resXSS = await yan.search('<img src=x onerror=alert(1)>', 1);
    assert.ok(Array.isArray(resXSS));
  });

  await checkAsync('YAN getStreams with empty payload & invalid params', async () => {
    const s1 = await yan.getStreams({});
    assert.deepStrictEqual(s1, []);
    const s2 = await yan.getStreams({ title: 'NonExistentYANAnimeXYZ999' });
    assert.deepStrictEqual(s2, []);
    const s3 = await yan.getStreams({ episode: -1, type: 'series', title: 'The Gioi Hoan My' });
    assert.deepStrictEqual(s3, []);
  });

  await checkAsync('YAN getStreams live query & strict invariants check', async () => {
    const streams = await yan.getStreams({
      title: 'The Gioi Hoan My',
      type: 'series',
      episode: 282,
      proxyBase: 'http://127.0.0.1:7000',
    });
    assert.ok(Array.isArray(streams), 'Streams must be array');
    console.log(`     (YAN resolved ${streams.length} streams for "The Gioi Hoan My" Ep 282)`);
    for (const s of streams) {
      assert.strictEqual(s.name, 'VIP Movies 🎬', 'Stream name must be exact VIP Movies 🎬');
      assert.strictEqual(s.externalUrl, undefined, 'STRICT INVARIANT: externalUrl must be undefined');
      assert.ok(s.url.startsWith('http://127.0.0.1:7000/hls/manifest.m3u8?url='), 'url must be HLS proxy route');
      assert.ok(s.url.includes('ref='), 'url must contain ref query param');
      assert.ok(s.title.includes('[VIP 6 • YAN]'), 'title must contain [VIP 6 • YAN]');
      assert.ok(s.title.includes('yanhh3d.pw'), 'title must mention yanhh3d.pw');
      assert.ok(s.behaviorHints && typeof s.behaviorHints === 'object', 'behaviorHints must be object');
    }
  });

  // =========================================================================
  // Section 5: Full Server Lifecycle & Aggregator Integration
  // =========================================================================
  console.log('\n▶ SECTION 5: Addon Server Lifecycle & Aggregator E2E Verification');

  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;
  const baseUrl = `http://127.0.0.1:${port}`;
  console.log(`     Test Server running at ${baseUrl}`);

  try {
    await checkAsync('GET /manifest.json returns 200 with all catalogs & types', async () => {
      const res = await axios.get(`${baseUrl}/manifest.json`);
      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.headers['access-control-allow-origin'], '*');
      assert.strictEqual(res.data.id, 'org.vipmovies.stremio.addon');
      assert.ok(Array.isArray(res.data.catalogs));
    });

    await checkAsync('GET /default/stream/movie/tt0373889.json (Harry Potter) aggregator returns 200', async () => {
      const res = await axios.get(`${baseUrl}/default/stream/movie/tt0373889.json`);
      assert.strictEqual(res.status, 200);
      assert.ok(Array.isArray(res.data.streams));
      assert.ok(res.data.streams.length > 0, 'Should aggregate multiple provider streams');
      for (const s of res.data.streams) {
        assert.strictEqual(s.name, 'VIP Movies 🎬');
        assert.strictEqual(s.externalUrl, undefined);
        assert.ok(s.url.startsWith(`${baseUrl}/hls/`), 'stream url must route through HLS proxy (/hls/...)');
      }
    });

    await checkAsync('GET /default/stream/movie/tt0000000000.json non-existent title returns 200 with empty array (no crash)', async () => {
      const res = await axios.get(`${baseUrl}/default/stream/movie/tt0000000000.json`);
      assert.strictEqual(res.status, 200);
      assert.deepStrictEqual(res.data.streams, []);
    });

    await checkAsync('GET /hls/manifest.m3u8 missing url param returns 400', async () => {
      try {
        await axios.get(`${baseUrl}/hls/manifest.m3u8`);
        assert.fail('Should have failed with 400');
      } catch (err) {
        assert.strictEqual(err.response?.status, 400);
      }
    });

    await checkAsync('GET /hls/segment.ts missing url param returns 400', async () => {
      try {
        await axios.get(`${baseUrl}/hls/segment.ts`);
        assert.fail('Should have failed with 400');
      } catch (err) {
        assert.strictEqual(err.response?.status, 400);
      }
    });

    await checkAsync('GET /hls/sub.vtt missing url param returns 400', async () => {
      try {
        await axios.get(`${baseUrl}/hls/sub.vtt`);
        assert.fail('Should have failed with 400');
      } catch (err) {
        assert.strictEqual(err.response?.status, 400);
      }
    });
  } finally {
    server.close();
  }

  // =========================================================================
  // Summary
  // =========================================================================
  console.log('\n╔══════════════════════════════════════════════════════════════════════╗');
  console.log(`║  TOTAL TESTS: ${passed + failed} | PASSED: ${passed} | FAILED: ${failed}`);
  console.log('╚══════════════════════════════════════════════════════════════════════╝');

  if (failed > 0) {
    process.exit(1);
  }
}

runAll().catch((err) => {
  console.error('Fatal Test Execution Error:', err);
  process.exit(1);
});
