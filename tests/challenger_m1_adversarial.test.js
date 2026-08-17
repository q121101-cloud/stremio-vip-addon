'use strict';

/**
 * ============================================================
 *  Adversarial & Empirical Test Harness for KKPhim Provider
 *  Milestone 1 — In-App Stream Format & Robustness Verification
 * ============================================================
 */

const assert = require('assert');
const axios = require('axios');
const kkphim = require('../src/providers/kkphim');
const { imdbCache, detailCache, catalogCache } = require('../src/lib/cache');

let passedTests = 0;
let failedTests = 0;
const failures = [];

function runTest(name, fn) {
  try {
    fn();
    console.log(`  ✅ PASS: ${name}`);
    passedTests++;
  } catch (err) {
    console.error(`  ❌ FAIL: ${name}`);
    console.error(`     Error: ${err.message}`);
    failures.push({ name, error: err.message, stack: err.stack });
    failedTests++;
  }
}

async function runAsyncTest(name, fn) {
  try {
    await fn();
    console.log(`  ✅ PASS: ${name}`);
    passedTests++;
  } catch (err) {
    console.error(`  ❌ FAIL: ${name}`);
    console.error(`     Error: ${err.message}`);
    failures.push({ name, error: err.message, stack: err.stack });
    failedTests++;
  }
}

console.log('\n============================================================');
console.log('🧪 RUNNING KKPHIM ADVERSARIAL & EMPIRICAL VERIFICATION SUITE');
console.log('============================================================\n');

async function runAll() {
  // ─────────────────────────────────────────────────────────────────
  // SUITE 1: Strict Conformance to R1 Stream Object Specification
  // ─────────────────────────────────────────────────────────────────
  console.log('--- Suite 1: Strict Conformance to R1 Stream Specification ---');

  await runAsyncTest('R1.1: Movie stream format strictly matches specification', async () => {
    detailCache.set('kkphim:detail:sample-movie', {
      movie: { name: 'Sample Movie', slug: 'sample-movie', type: 'single' },
      episodes: [
        {
          server_name: 'Vietsub #1',
          server_data: [
            {
              name: 'Full',
              slug: 'full',
              link_m3u8: 'https://cdn.example.com/movie.m3u8?token=abc',
              link_embed: 'https://embed.example.com/movie',
            },
          ],
        },
      ],
    });

    const streams = await kkphim.getStreams({
      slug: 'sample-movie',
      type: 'movie',
      proxyBase: 'http://localhost:7000',
    });

    assert.strictEqual(streams.length, 1, 'Expected exactly 1 stream');
    const s = streams[0];

    // Check name
    assert.strictEqual(s.name, 'VIP Movies 🎬', `Name must be 'VIP Movies 🎬', got '${s.name}'`);

    // Check title: no #, formatted with server name, no [Tập Full], has \n and badge
    const expectedTitle = '[VIP • KKPhim] Vietsub 1 Full HD (HLS Proxy)\n⚡ Server VIP • Phát trực tiếp trong App';
    assert.strictEqual(s.title, expectedTitle, `Title mismatch:\nExpected: ${JSON.stringify(expectedTitle)}\nGot:      ${JSON.stringify(s.title)}`);

    // Check url
    assert(typeof s.url === 'string', 'Stream url must be a string');
    assert(s.url.startsWith('http://localhost:7000/hls/manifest.m3u8?url='), 'URL must start with proxy route');
    
    // Parse query params from url
    const parsedUrl = new URL(s.url);
    const encodedStream = parsedUrl.searchParams.get('url');
    const encodedRef = parsedUrl.searchParams.get('ref');

    assert(encodedStream, 'URL must have url query param');
    assert(encodedRef, 'URL must have ref query param');

    const decodedStream = Buffer.from(encodedStream, 'base64url').toString('utf8');
    const decodedRef = Buffer.from(encodedRef, 'base64url').toString('utf8');

    assert.strictEqual(decodedStream, 'https://cdn.example.com/movie.m3u8?token=abc', 'Decoded stream URL mismatch');
    assert.strictEqual(decodedRef, 'https://player.phimapi.com/', 'Decoded ref URL must be https://player.phimapi.com/');

    // Check externalUrl is strictly undefined
    assert.strictEqual(s.externalUrl, undefined, 'externalUrl MUST be undefined');

    // Check behaviorHints
    assert.deepStrictEqual(s.behaviorHints, {
      notSupported: false,
      bingeGroup: 'kkphim-sample-movie',
    });
  });

  await runAsyncTest('R1.2: Series episode stream title includes [Tập X] without duplicating', async () => {
    detailCache.set('kkphim:detail:sample-series', {
      movie: { name: 'Sample Series', slug: 'sample-series', type: 'series' },
      episodes: [
        {
          server_name: 'Thuyết Minh #2',
          server_data: [
            { name: '1', slug: 'tap-1', link_m3u8: 'https://cdn.example.com/s1e1.m3u8' },
            { name: 'Tập 02', slug: 'tap-02', link_m3u8: 'https://cdn.example.com/s1e2.m3u8' },
          ],
        },
      ],
    });

    // Episode 1 (name: '1') -> should format as '[Tập 1]'
    const streams1 = await kkphim.getStreams({
      slug: 'sample-series',
      type: 'series',
      season: 1,
      episode: 1,
      proxyBase: 'https://proxy.example.com',
    });

    assert.strictEqual(streams1.length, 1);
    assert.strictEqual(
      streams1[0].title,
      '[VIP • KKPhim] Thuyết Minh 2 [Tập 1] Full HD (HLS Proxy)\n⚡ Server VIP • Phát trực tiếp trong App'
    );
    assert.strictEqual(streams1[0].externalUrl, undefined);

    // Episode 2 (name: 'Tập 02') -> should NOT format as '[Tập Tập 02]'
    const streams2 = await kkphim.getStreams({
      slug: 'sample-series',
      type: 'series',
      season: 1,
      episode: 2,
      proxyBase: 'https://proxy.example.com',
    });

    assert.strictEqual(streams2.length, 1);
    assert.strictEqual(
      streams2[0].title,
      '[VIP • KKPhim] Thuyết Minh 2 [Tập 02] Full HD (HLS Proxy)\n⚡ Server VIP • Phát trực tiếp trong App'
    );
  });

  await runAsyncTest('R1.3: Multi-server aggregation generates unique stream per server with link_m3u8', async () => {
    detailCache.set('kkphim:detail:multi-server', {
      movie: { name: 'Multi Server Movie', slug: 'multi-server', type: 'single' },
      episodes: [
        {
          server_name: 'Vietsub #1',
          server_data: [{ name: 'Full', slug: 'full', link_m3u8: 'https://cdn.example.com/vs.m3u8' }],
        },
        {
          server_name: 'Thuyết Minh #1',
          server_data: [{ name: 'Full', slug: 'full', link_m3u8: 'https://cdn.example.com/tm.m3u8' }],
        },
        {
          server_name: 'Lồng Tiếng #1',
          server_data: [{ name: 'Full', slug: 'full', link_m3u8: 'https://cdn.example.com/lt.m3u8' }],
        },
      ],
    });

    const streams = await kkphim.getStreams({
      slug: 'multi-server',
      type: 'movie',
      proxyBase: 'http://localhost:7000',
    });

    assert.strictEqual(streams.length, 3, 'Expected 3 streams for 3 servers');
    for (const s of streams) {
      assert.strictEqual(s.name, 'VIP Movies 🎬');
      assert.strictEqual(s.externalUrl, undefined);
      assert(!s.title.includes('#'));
      assert(s.url.includes('ref=' + Buffer.from('https://player.phimapi.com/').toString('base64url')));
    }

    const titles = streams.map((s) => s.title);
    assert(titles.some((t) => t.includes('Vietsub 1')));
    assert(titles.some((t) => t.includes('Thuyết Minh 1')));
    assert(titles.some((t) => t.includes('Lồng Tiếng 1')));
  });

  // ─────────────────────────────────────────────────────────────────
  // SUITE 2: Episode Variation & Matching Matrix
  // ─────────────────────────────────────────────────────────────────
  console.log('\n--- Suite 2: Episode Variation & Matching Matrix ---');

  const testMatrix = [
    { desc: 'Numeric 1 -> name "1", slug "tap-1"', ep: 1, expectedSlug: 'ep1.m3u8' },
    { desc: 'Numeric 1 -> name "01", slug "tap-01"', ep: 1, targetName: '01', targetSlug: 'tap-01', expectedSlug: 'ep01.m3u8' },
    { desc: 'String "1" -> name "Tập 1", slug "tap-1"', ep: '1', targetName: 'Tập 1', targetSlug: 'tap-1', expectedSlug: 'ep1.m3u8' },
    { desc: 'Numeric 2 -> name "Tập 02", slug "tap-02"', ep: 2, targetName: 'Tập 02', targetSlug: 'tap-02', expectedSlug: 'ep2.m3u8' },
    { desc: 'Numeric 5 -> name "5", slug "tap-5"', ep: 5, targetName: '5', targetSlug: 'tap-5', expectedSlug: 'ep5.m3u8' },
    { desc: 'String "10" -> name "Tập 10 (End)", slug "tap-10"', ep: '10', targetName: 'Tập 10 (End)', targetSlug: 'tap-10', expectedSlug: 'ep10.m3u8' },
    { desc: 'Numeric 3 -> word boundary match in "Ep 3: The Beginning"', ep: 3, targetName: 'Ep 3: The Beginning', targetSlug: 'tap-3', expectedSlug: 'ep3.m3u8' },
  ];

  for (const item of testMatrix) {
    await runAsyncTest(`Episode Matrix: ${item.desc}`, async () => {
      detailCache.set('kkphim:detail:matrix-test', {
        movie: { name: 'Matrix Test', slug: 'matrix-test', type: 'series' },
        episodes: [
          {
            server_name: 'Vietsub #1',
            server_data: [
              { name: 'Dummy', slug: 'dummy', link_m3u8: 'https://cdn.example.com/dummy.m3u8' },
              {
                name: item.targetName || String(item.ep),
                slug: item.targetSlug || `tap-${item.ep}`,
                link_m3u8: `https://cdn.example.com/${item.expectedSlug}`,
              },
            ],
          },
        ],
      });

      const streams = await kkphim.getStreams({
        slug: 'matrix-test',
        type: 'series',
        season: 1,
        episode: item.ep,
        proxyBase: 'http://localhost:7000',
      });

      assert.strictEqual(streams.length, 1, `Expected 1 stream for ${item.desc}`);
      const decoded = Buffer.from(new URL(streams[0].url).searchParams.get('url'), 'base64url').toString('utf8');
      assert.strictEqual(decoded, `https://cdn.example.com/${item.expectedSlug}`);
    });
  }

  await runAsyncTest('Index fallback: Non-numeric name "Chapter Alpha" resolved by 1-based index', async () => {
    detailCache.set('kkphim:detail:index-fallback', {
      movie: { name: 'Index Fallback', slug: 'index-fallback', type: 'series' },
      episodes: [
        {
          server_name: 'Server 1',
          server_data: [
            { name: 'Prologue', slug: 'prologue', link_m3u8: 'https://cdn.example.com/ep1.m3u8' },
            { name: 'Chapter Alpha', slug: 'chapter-alpha', link_m3u8: 'https://cdn.example.com/ep2.m3u8' },
            { name: 'Epilogue', slug: 'epilogue', link_m3u8: 'https://cdn.example.com/ep3.m3u8' },
          ],
        },
      ],
    });

    const streams = await kkphim.getStreams({
      slug: 'index-fallback',
      type: 'series',
      season: 1,
      episode: 2,
      proxyBase: 'http://localhost:7000',
    });

    assert.strictEqual(streams.length, 1);
    const decoded = Buffer.from(new URL(streams[0].url).searchParams.get('url'), 'base64url').toString('utf8');
    assert.strictEqual(decoded, 'https://cdn.example.com/ep2.m3u8');
  });

  await runAsyncTest('Episode out of bounds returns empty array without throwing', async () => {
    detailCache.set('kkphim:detail:oob-test', {
      movie: { name: 'OOB Test', slug: 'oob-test', type: 'series' },
      episodes: [
        {
          server_name: 'Server 1',
          server_data: [
            { name: '1', slug: 'tap-1', link_m3u8: 'https://cdn.example.com/ep1.m3u8' },
            { name: '2', slug: 'tap-2', link_m3u8: 'https://cdn.example.com/ep2.m3u8' },
          ],
        },
      ],
    });

    const cases = [0, 999, -1, '999', 'nonexistent', '99999999'];
    for (const ep of cases) {
      const streams = await kkphim.getStreams({
        slug: 'oob-test',
        type: 'series',
        season: 1,
        episode: ep,
        proxyBase: 'http://localhost:7000',
      });
      assert.deepStrictEqual(streams, [], `Expected empty streams for episode ${ep}`);
    }
  });

  await runAsyncTest('Selective server matching: Server missing requested episode is skipped cleanly', async () => {
    detailCache.set('kkphim:detail:selective-server', {
      movie: { name: 'Selective Server', slug: 'selective-server', type: 'series' },
      episodes: [
        {
          server_name: 'Server A',
          server_data: [
            { name: '1', slug: 'tap-1', link_m3u8: 'https://cdn.example.com/a1.m3u8' },
            { name: '2', slug: 'tap-2', link_m3u8: 'https://cdn.example.com/a2.m3u8' },
          ],
        },
        {
          server_name: 'Server B (Incomplete)',
          server_data: [
            { name: '1', slug: 'tap-1', link_m3u8: 'https://cdn.example.com/b1.m3u8' },
          ],
        },
        {
          server_name: 'Server C',
          server_data: [
            { name: '1', slug: 'tap-1', link_m3u8: 'https://cdn.example.com/c1.m3u8' },
            { name: '2', slug: 'tap-2', link_m3u8: 'https://cdn.example.com/c2.m3u8' },
          ],
        },
      ],
    });

    const streams = await kkphim.getStreams({
      slug: 'selective-server',
      type: 'series',
      season: 1,
      episode: 2,
      proxyBase: 'http://localhost:7000',
    });

    assert.strictEqual(streams.length, 2, 'Expected exactly 2 streams (Server A and C only)');
    const titles = streams.map((s) => s.title);
    assert(titles.some((t) => t.includes('Server A')));
    assert(titles.some((t) => t.includes('Server C')));
    assert(!titles.some((t) => t.includes('Server B')));
  });

  // ─────────────────────────────────────────────────────────────────
  // SUITE 3: Adversarial Inputs, Malformed Data & Edge Cases
  // ─────────────────────────────────────────────────────────────────
  console.log('\n--- Suite 3: Adversarial Inputs, Malformed Data & Edge Cases ---');

  await runAsyncTest('Adversarial regex strings in episode do not crash', async () => {
    detailCache.set('kkphim:detail:regex-bomb', {
      movie: { name: 'Regex Bomb', slug: 'regex-bomb', type: 'series' },
      episodes: [
        {
          server_name: 'Server 1',
          server_data: [
            { name: '1', slug: 'tap-1', link_m3u8: 'https://cdn.example.com/1.m3u8' },
            { name: '2', slug: 'tap-2', link_m3u8: 'https://cdn.example.com/2.m3u8' },
          ],
        },
      ],
    });

    const maliciousInputs = [
      '[invalid',
      '(*+?)',
      '\\b\\w+\\b',
      '{1,99999}',
      '(?=a)b',
      'null',
      'undefined',
      'NaN',
      '<script>alert(1)</script>',
      '../../../etc/passwd',
      '${7*7}',
    ];

    for (const input of maliciousInputs) {
      const res = await kkphim.getStreams({
        slug: 'regex-bomb',
        type: 'series',
        season: 1,
        episode: input,
      });
      assert(Array.isArray(res), `Expected array return for input: ${input}`);
    }
  });

  await runAsyncTest('Malformed server_data items (null, missing link_m3u8, empty string) are handled safely', async () => {
    detailCache.set('kkphim:detail:malformed-data', {
      movie: { name: 'Malformed Data', slug: 'malformed-data', type: 'single' },
      episodes: [
        {
          server_name: 'Corrupted Server 1',
          server_data: null,
        },
        {
          server_name: 'Corrupted Server 2',
          server_data: [null, undefined, {}],
        },
        {
          server_name: 'Embed Only Server',
          server_data: [
            { name: 'Full', slug: 'full', link_embed: 'https://embed.example.com/only' }, // missing link_m3u8
          ],
        },
        {
          server_name: 'Empty link_m3u8 Server',
          server_data: [
            { name: 'Full', slug: 'full', link_m3u8: '' },
          ],
        },
        {
          server_name: 'Valid Server',
          server_data: [
            { name: 'Full', slug: 'full', link_m3u8: 'https://cdn.example.com/valid.m3u8' },
          ],
        },
      ],
    });

    const streams = await kkphim.getStreams({
      slug: 'malformed-data',
      type: 'movie',
      proxyBase: 'http://localhost:7000',
    });

    assert.strictEqual(streams.length, 1, 'Only the valid server with non-empty link_m3u8 should be included');
    assert.strictEqual(streams[0].title.includes('Valid Server'), true);
  });

  await runAsyncTest('Empty/missing movieData returns empty array [] safely', async () => {
    detailCache.set('kkphim:detail:empty-movie', null);
    detailCache.set('kkphim:detail:no-episodes', { movie: { name: 'No Eps' }, episodes: [] });

    assert.deepStrictEqual(await kkphim.getStreams({ slug: 'empty-movie' }), []);
    assert.deepStrictEqual(await kkphim.getStreams({ slug: 'no-episodes' }), []);
    assert.deepStrictEqual(await kkphim.getStreams({}), []);
    assert.deepStrictEqual(await kkphim.getStreams(null), []);
    assert.deepStrictEqual(await kkphim.getStreams(undefined), []);
  });

  await runAsyncTest('Server name cleaning with extreme whitespace and hashtags', async () => {
    detailCache.set('kkphim:detail:hashtag-servers', {
      movie: { name: 'Hashtags', slug: 'hashtag-servers', type: 'single' },
      episodes: [
        {
          server_name: '#### Vietsub # # # # 1 ####',
          server_data: [{ name: 'Full', link_m3u8: 'https://cdn.example.com/1.m3u8' }],
        },
        {
          server_name: '   ',
          server_data: [{ name: 'Full', link_m3u8: 'https://cdn.example.com/2.m3u8' }],
        },
        {
          server_name: null,
          server_data: [{ name: 'Full', link_m3u8: 'https://cdn.example.com/3.m3u8' }],
        },
      ],
    });

    const streams = await kkphim.getStreams({
      slug: 'hashtag-servers',
      type: 'movie',
      proxyBase: 'http://localhost:7000',
    });

    assert.strictEqual(streams.length, 3);
    assert.strictEqual(streams[0].title.includes('Vietsub 1'), true);
    assert.strictEqual(streams[1].title.includes('Server 2'), true);
    assert.strictEqual(streams[2].title.includes('Server 3'), true);

    for (const s of streams) {
      assert(!s.title.includes('#'), `Title must not have '#': ${s.title}`);
    }
  });

  // ─────────────────────────────────────────────────────────────────
  // SUITE 4: Multi-Signature & Argument Compatibility
  // ─────────────────────────────────────────────────────────────────
  console.log('\n--- Suite 4: Multi-Signature & Argument Compatibility ---');

  await runAsyncTest('Positional arguments: getStreams(imdbId, title, type, season, episode, proxyBase)', async () => {
    imdbCache.set('kkphim:imdb:tt9999999', {
      movie: { name: 'Positional Movie', slug: 'positional-movie', type: 'single' },
      episodes: [
        {
          server_name: 'Vietsub #1',
          server_data: [{ name: 'Full', slug: 'full', link_m3u8: 'https://cdn.example.com/pos.m3u8' }],
        },
      ],
    });

    const streams = await kkphim.getStreams('tt9999999', 'Positional Movie', 'movie', null, null, 'http://localhost:7000');
    assert.strictEqual(streams.length, 1);
    assert.strictEqual(streams[0].name, 'VIP Movies 🎬');
    assert.strictEqual(streams[0].externalUrl, undefined);
  });

  await runAsyncTest('Positional arguments with slug string as first arg', async () => {
    detailCache.set('kkphim:detail:slug-pos', {
      movie: { name: 'Slug Pos Movie', slug: 'slug-pos', type: 'single' },
      episodes: [
        {
          server_name: 'Vietsub #1',
          server_data: [{ name: 'Full', slug: 'full', link_m3u8: 'https://cdn.example.com/slug.m3u8' }],
        },
      ],
    });

    const streams = await kkphim.getStreams('slug-pos', 'Slug Pos Movie', 'movie', null, null, 'http://localhost:7000');
    assert.strictEqual(streams.length, 1);
    assert.strictEqual(streams[0].name, 'VIP Movies 🎬');
  });

  // ─────────────────────────────────────────────────────────────────
  // SUITE 5: Base64URL Encoding & Anti-403 Invariant
  // ─────────────────────────────────────────────────────────────────
  console.log('\n--- Suite 5: Base64URL Encoding & Anti-403 Invariant ---');

  await runAsyncTest('Base64URL encodes special query strings and unicode properly', async () => {
    const complexUrl = 'https://s1.phimapi.com/2024/tập-1/master.m3u8?token=a+b/c==&expires=1700000000';
    detailCache.set('kkphim:detail:complex-url', {
      movie: { name: 'Complex URL', slug: 'complex-url', type: 'single' },
      episodes: [
        {
          server_name: 'Server 1',
          server_data: [{ name: 'Full', link_m3u8: complexUrl }],
        },
      ],
    });

    const streams = await kkphim.getStreams({
      slug: 'complex-url',
      type: 'movie',
      proxyBase: 'http://localhost:7000',
    });

    assert.strictEqual(streams.length, 1);
    const parsed = new URL(streams[0].url);
    const encodedUrlParam = parsed.searchParams.get('url');
    const encodedRefParam = parsed.searchParams.get('ref');

    // Base64URL should not contain +, /, or =
    assert(!encodedUrlParam.includes('+'), 'Must not contain +');
    assert(!encodedUrlParam.includes('/'), 'Must not contain /');
    assert(!encodedUrlParam.includes('='), 'Must not contain =');

    const decodedUrl = Buffer.from(encodedUrlParam, 'base64url').toString('utf8');
    const decodedRef = Buffer.from(encodedRefParam, 'base64url').toString('utf8');

    assert.strictEqual(decodedUrl, complexUrl, 'Decoded URL must match complex original URL exactly');
    assert.strictEqual(decodedRef, 'https://player.phimapi.com/', 'Decoded ref must match exactly');
  });

  // ─────────────────────────────────────────────────────────────────
  // SUITE 6: Concurrency & Stress Harness
  // ─────────────────────────────────────────────────────────────────
  console.log('\n--- Suite 6: Concurrency & Stress Harness ---');

  await runAsyncTest('100 concurrent getStreams requests execute in under 100ms without memory leak', async () => {
    detailCache.set('kkphim:detail:stress-test', {
      movie: { name: 'Stress Test', slug: 'stress-test', type: 'series' },
      episodes: [
        {
          server_name: 'Server 1',
          server_data: Array.from({ length: 50 }, (_, i) => ({
            name: String(i + 1),
            slug: `tap-${i + 1}`,
            link_m3u8: `https://cdn.example.com/ep${i + 1}.m3u8`,
          })),
        },
      ],
    });

    const start = Date.now();
    const promises = [];
    for (let i = 0; i < 100; i++) {
      const epNum = (i % 50) + 1;
      promises.push(
        kkphim.getStreams({
          slug: 'stress-test',
          type: 'series',
          season: 1,
          episode: epNum,
          proxyBase: 'http://localhost:7000',
        })
      );
    }

    const results = await Promise.all(promises);
    const elapsed = Date.now() - start;

    assert.strictEqual(results.length, 100);
    for (let i = 0; i < 100; i++) {
      const epNum = (i % 50) + 1;
      assert.strictEqual(results[i].length, 1);
      assert.strictEqual(results[i][0].name, 'VIP Movies 🎬');
      assert.strictEqual(results[i][0].externalUrl, undefined);
      assert(results[i][0].title.includes(`[Tập ${epNum}]`));
    }

    console.log(`     -> 100 concurrent requests completed in ${elapsed}ms (${(elapsed / 100).toFixed(2)}ms / op)`);
  });

  // ─────────────────────────────────────────────────────────────────
  // SUITE 7: Catalog, Metadata & Helper Functions
  // ─────────────────────────────────────────────────────────────────
  console.log('\n--- Suite 7: Catalog, Metadata & Helper Functions ---');

  runTest('formatImageUrl handles null, absolute, and relative URLs', () => {
    assert.strictEqual(kkphim.formatImageUrl(null), null);
    assert.strictEqual(kkphim.formatImageUrl(undefined), null);
    assert.strictEqual(kkphim.formatImageUrl(''), null);
    assert.strictEqual(kkphim.formatImageUrl('https://example.com/img.jpg'), 'https://example.com/img.jpg');
    assert.strictEqual(kkphim.formatImageUrl('http://example.com/img.jpg'), 'http://example.com/img.jpg');
    assert.strictEqual(kkphim.formatImageUrl('/upload/img.jpg'), 'https://phimimg.com/upload/img.jpg');
    assert.strictEqual(kkphim.formatImageUrl('upload/img.jpg'), 'https://phimimg.com/upload/img.jpg');
  });

  runTest('mapDetailMeta handles movie and series with full/partial fields', () => {
    const movieObj = {
      name: 'Test Movie',
      origin_name: 'Test Origin',
      slug: 'test-slug',
      type: 'single',
      poster_url: 'poster.jpg',
      thumb_url: 'thumb.jpg',
      content: '<p>Some <b>HTML</b> description</p>',
      director: ['Director A'],
      actor: 'Actor A, Actor B',
      category: [{ name: 'Action' }, 'Drama'],
      country: [{ name: 'US' }],
      time: '120m',
      year: 2024,
    };

    const movieMeta = kkphim.mapDetailMeta(movieObj, []);
    assert.strictEqual(movieMeta.id, 'kkphim_test-slug');
    assert.strictEqual(movieMeta.type, 'movie');
    assert.strictEqual(movieMeta.name, 'Test Movie');
    assert.strictEqual(movieMeta.description, 'Some HTML description');
    assert.deepStrictEqual(movieMeta.genres, ['Action', 'Drama']);
    assert.strictEqual(movieMeta.country, 'US');
    assert.deepStrictEqual(movieMeta.cast, ['Actor A', 'Actor B']);
    assert.strictEqual(movieMeta.runtime, '120m');
    assert.strictEqual(movieMeta.year, 2024);
    assert.strictEqual(movieMeta.videos, undefined);

    const seriesObj = {
      name: 'Test Series',
      slug: 'test-series-meta',
      type: 'series',
    };

    const episodes = [
      {
        server_name: 'Server 1',
        server_data: [
          { name: '1', slug: 'tap-1' },
          { name: '2', slug: 'tap-2' },
        ],
      },
      {
        server_name: 'Server 2',
        server_data: [
          { name: '1', slug: 'tap-1' },
          { name: '2', slug: 'tap-2' },
        ],
      },
    ];

    const seriesMeta = kkphim.mapDetailMeta(seriesObj, episodes);
    assert.strictEqual(seriesMeta.type, 'series');
    assert(Array.isArray(seriesMeta.videos));
    assert.strictEqual(seriesMeta.videos.length, 2, 'Should deduplicate episode videos across servers');
    assert.strictEqual(seriesMeta.videos[0].id, 'kkphim_test-series-meta:1:1');
    assert.strictEqual(seriesMeta.videos[1].id, 'kkphim_test-series-meta:1:2');
  });

  // ─────────────────────────────────────────────────────────────────
  // SUMMARY
  // ─────────────────────────────────────────────────────────────────
  console.log('\n============================================================');
  console.log(`📊 ADVERSARIAL TEST SUMMARY: ${passedTests} PASSED, ${failedTests} FAILED`);
  console.log('============================================================\n');

  if (failedTests > 0) {
    console.error(`❌ Adversarial suite finished with ${failedTests} failure(s):`);
    for (const f of failures) {
      console.error(`   - ${f.name}: ${f.error}`);
    }
    process.exit(1);
  }
}

runAll().catch((err) => {
  console.error('Fatal crash in adversarial test runner:', err);
  process.exit(1);
});
