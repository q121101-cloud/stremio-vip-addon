'use strict';

/**
 * ============================================================
 *  VIP Movies Addon — tests/test_kkphim_challenger_m1_2.js
 *  Empirical Challenger 2 Verification Suite for Milestone 1
 *  Target: src/providers/kkphim.js (KKPhim In-App Stream Format)
 * ============================================================
 */

const assert = require('assert');
const express = require('express');
const axios = require('axios');
const kkphim = require('../src/providers/kkphim');
const { imdbCache, detailCache, catalogCache } = require('../src/lib/cache');
const handlers = require('../src/handlers');

let totalTests = 0;
let passedTests = 0;
let failedTests = 0;
const failures = [];

function recordPass(name) {
  totalTests++;
  passedTests++;
  console.log(`  ✅ PASS: ${name}`);
}

function recordFail(name, err) {
  totalTests++;
  failedTests++;
  console.error(`  ❌ FAIL: ${name}`);
  console.error(`     Error: ${err.message}`);
  failures.push({ name, error: err.message, stack: err.stack });
}

async function testStep(name, fn) {
  try {
    await fn();
    recordPass(name);
  } catch (err) {
    recordFail(name, err);
  }
}

const EXPECTED_BASE_REF = 'https://player.phimapi.com/';
const EXPECTED_REF_B64 = Buffer.from(EXPECTED_BASE_REF, 'utf8').toString('base64url');

/**
 * Strict stream invariant verification helper
 */
function verifyKKPhimStreamInvariants(stream, proxyBase = 'http://localhost:7000') {
  // Invariant 1: Branded Name
  assert.strictEqual(stream.name, 'VIP Movies 🎬', `Stream name must be 'VIP Movies 🎬', got '${stream.name}'`);

  // Invariant 2: Strictly NO externalUrl under any circumstances (Milestone 1 requirement)
  assert.strictEqual(stream.externalUrl, undefined, `Stream MUST NOT have externalUrl, got '${stream.externalUrl}'`);

  // Invariant 3: Valid In-App HLS Proxy URL
  assert(typeof stream.url === 'string' && stream.url.length > 0, `Stream must have a valid non-empty url string`);
  assert(stream.url.startsWith(`${proxyBase}/hls/manifest.m3u8?url=`), `Stream url must start with proxy route, got '${stream.url}'`);

  // Invariant 4: URL encodes baseRef: https://player.phimapi.com/
  assert(stream.url.includes(`&ref=${EXPECTED_REF_B64}`), `Stream url must contain encoded baseRef '${EXPECTED_REF_B64}', url: ${stream.url}`);

  // Invariant 5: Decoded ref param strictly matches https://player.phimapi.com/
  const urlObj = new URL(stream.url);
  const refParam = urlObj.searchParams.get('ref');
  assert(refParam, 'Stream URL must have ref query parameter');
  const decodedRef = Buffer.from(refParam, 'base64url').toString('utf8');
  assert.strictEqual(decodedRef, EXPECTED_BASE_REF, `Decoded ref must strictly equal '${EXPECTED_BASE_REF}', got '${decodedRef}'`);

  // Invariant 6: Decoded url param is non-empty m3u8
  const m3u8Param = urlObj.searchParams.get('url');
  assert(m3u8Param, 'Stream URL must have url query parameter');
  const decodedM3u8 = Buffer.from(m3u8Param, 'base64url').toString('utf8');
  assert(decodedM3u8.startsWith('http'), `Decoded target stream must start with http, got '${decodedM3u8}'`);

  // Invariant 7: Title format & brand tag
  assert(typeof stream.title === 'string' && stream.title.length > 0, 'Stream title must be a non-empty string');
  assert(stream.title.includes('[VIP • KKPhim]'), `Stream title must include '[VIP • KKPhim]', got '${stream.title}'`);
  assert(!stream.title.includes('#'), `Stream title must NOT contain '#', got '${stream.title}'`);
  assert(stream.title.includes('Full HD (HLS Proxy)\n⚡ Server VIP • Phát trực tiếp trong App'), `Stream title must have standard suffix, got '${stream.title}'`);

  // Invariant 8: Behavior hints
  assert(stream.behaviorHints, 'Stream must have behaviorHints');
  assert.strictEqual(stream.behaviorHints.notSupported, false, 'behaviorHints.notSupported must be false');
  assert(typeof stream.behaviorHints.bingeGroup === 'string' && stream.behaviorHints.bingeGroup.length > 0, 'behaviorHints.bingeGroup must be non-empty');
}

(async () => {
  console.log('\n============================================================');
  console.log('🧪 KKPHIM EMPIRICAL CHALLENGER VERIFICATION SUITE');
  console.log('============================================================\n');

  // ═════════════════════════════════════════════════════════════
  // SUITE 1: MOVIE STREAMS (type: 'movie', type: 'single', 1 ep)
  // ═════════════════════════════════════════════════════════════
  console.log('--- Suite 1: Movie Streams & Multi-Server Verification ---');

  await testStep('Movie with 3 servers (Vietsub #1, Thuyết Minh #2, Lồng Tiếng #3) produces 3 HLS streams with clean titles', async () => {
    detailCache.clear();
    const slug = 'ke-danh-cap-giac-mo';
    detailCache.set(`kkphim:detail:${slug}`, {
      movie: {
        name: 'Kẻ Đánh Cắp Giấc Mơ',
        origin_name: 'Inception',
        slug,
        type: 'single',
      },
      episodes: [
        {
          server_name: 'Vietsub #1',
          server_data: [
            { name: 'Full', slug: 'full', link_m3u8: 'https://s1.phimapi.com/inception/full.m3u8', link_embed: 'https://embed.phimapi.com/v/inc-vs' }
          ]
        },
        {
          server_name: 'Thuyết Minh #2  ',
          server_data: [
            { name: 'FULL', slug: 'full', link_m3u8: 'https://s2.phimapi.com/inception/tm.m3u8', link_embed: 'https://embed.phimapi.com/v/inc-tm' }
          ]
        },
        {
          server_name: 'Lồng Tiếng #3',
          server_data: [
            { name: '', slug: 'full', link_m3u8: 'https://s3.phimapi.com/inception/lt.m3u8', link_embed: 'https://embed.phimapi.com/v/inc-lt' }
          ]
        }
      ]
    });

    const streams = await kkphim.getStreams({
      slug,
      type: 'movie',
      proxyBase: 'http://localhost:7000'
    });

    assert.strictEqual(streams.length, 3, `Expected 3 streams, got ${streams.length}`);

    for (const s of streams) {
      verifyKKPhimStreamInvariants(s, 'http://localhost:7000');
    }

    assert.strictEqual(streams[0].title, '[VIP • KKPhim] Vietsub 1 Full HD (HLS Proxy)\n⚡ Server VIP • Phát trực tiếp trong App');
    assert.strictEqual(streams[1].title, '[VIP • KKPhim] Thuyết Minh 2 Full HD (HLS Proxy)\n⚡ Server VIP • Phát trực tiếp trong App');
    assert.strictEqual(streams[2].title, '[VIP • KKPhim] Lồng Tiếng 3 Full HD (HLS Proxy)\n⚡ Server VIP • Phát trực tiếp trong App');
  });

  await testStep('Movie with custom episode name "Bản Mở Rộng" formats title label correctly', async () => {
    detailCache.clear();
    const slug = 'avatar-extended';
    detailCache.set(`kkphim:detail:${slug}`, {
      movie: { name: 'Avatar', slug, type: 'single' },
      episodes: [
        {
          server_name: 'Server #VIP',
          server_data: [
            { name: 'Bản Mở Rộng', slug: 'ban-mo-rong', link_m3u8: 'https://s1.phimapi.com/avatar/extended.m3u8' }
          ]
        }
      ]
    });

    const streams = await kkphim.getStreams({
      slug,
      type: 'movie',
      proxyBase: 'http://localhost:7000'
    });

    assert.strictEqual(streams.length, 1);
    verifyKKPhimStreamInvariants(streams[0]);
    assert.strictEqual(streams[0].title, '[VIP • KKPhim] Server VIP [Tập Bản Mở Rộng] Full HD (HLS Proxy)\n⚡ Server VIP • Phát trực tiếp trong App');
  });

  await testStep('Movie with episode name already having "Tập" prefix (e.g. "Tập Full HD") does not duplicate "Tập"', async () => {
    detailCache.clear();
    const slug = 'test-ep-label';
    detailCache.set(`kkphim:detail:${slug}`, {
      movie: { name: 'Test', slug, type: 'single' },
      episodes: [
        {
          server_name: 'VIP Server',
          server_data: [
            { name: 'Tập Đặc Biệt', slug: 'tap-dac-biet', link_m3u8: 'https://s1.phimapi.com/test/special.m3u8' }
          ]
        }
      ]
    });

    const streams = await kkphim.getStreams({
      slug,
      type: 'movie',
      proxyBase: 'http://localhost:7000'
    });

    assert.strictEqual(streams.length, 1);
    verifyKKPhimStreamInvariants(streams[0]);
    assert.strictEqual(streams[0].title, '[VIP • KKPhim] VIP Server [Tập Đặc Biệt] Full HD (HLS Proxy)\n⚡ Server VIP • Phát trực tiếp trong App');
  });

  // ═════════════════════════════════════════════════════════════
  // SUITE 2: SERIES STREAMS & EPISODE RESOLUTION MATRIX
  // ═════════════════════════════════════════════════════════════
  console.log('\n--- Suite 2: Series Streams & Episode Resolution Matrix ---');

  const seriesTestMatrix = [
    { desc: 'Episode 1: exact numeric match name "1"', epInput: 1, mockName: '1', mockSlug: 'tap-1', expectedM3u8: 'https://cdn.example.com/ep1.m3u8' },
    { desc: 'Episode 1: string "1" match name "01"', epInput: '1', mockName: '01', mockSlug: 'tap-01', expectedM3u8: 'https://cdn.example.com/ep01.m3u8' },
    { desc: 'Episode 2: numeric 2 match name "Tập 2"', epInput: 2, mockName: 'Tập 2', mockSlug: 'tap-2', expectedM3u8: 'https://cdn.example.com/ep2.m3u8' },
    { desc: 'Episode 2: numeric 2 match name "Tập 02"', epInput: 2, mockName: 'Tập 02', mockSlug: 'tap-02', expectedM3u8: 'https://cdn.example.com/ep02.m3u8' },
    { desc: 'Episode 5: numeric 5 match slug "tap-5" with long Vietnamese name "Tập 05: Đại Chiến"', epInput: 5, mockName: 'Tập 05: Đại Chiến', mockSlug: 'tap-5', expectedM3u8: 'https://cdn.example.com/ep5.m3u8' },
    { desc: 'Episode 12: numeric 12 match extracted digits from "Tập 12 (Tập Cuối)"', epInput: 12, mockName: 'Tập 12 (Tập Cuối)', mockSlug: 'tap-cuoi', expectedM3u8: 'https://cdn.example.com/ep12.m3u8' },
    { desc: 'Episode 3: numeric 3 match word boundary regex in "Ep 3 Finale"', epInput: 3, mockName: 'Ep 3 Finale', mockSlug: 'ep-3', expectedM3u8: 'https://cdn.example.com/ep3.m3u8' },
    { desc: 'Episode 2: 1-based index fallback when names are purely textual "Chapter Two: The Red Door"', epInput: 2, mockName: 'Chapter Two: The Red Door', mockSlug: 'the-red-door', expectedM3u8: 'https://cdn.example.com/ep2-fallback.m3u8' },
  ];

  for (const tc of seriesTestMatrix) {
    await testStep(`Series Resolution: ${tc.desc}`, async () => {
      detailCache.clear();
      const slug = 'test-series';
      detailCache.set(`kkphim:detail:${slug}`, {
        movie: { name: 'Test Series', slug, type: 'series' },
        episodes: [
          {
            server_name: 'Vietsub #1',
            server_data: [
              { name: 'Dummy Ep 0', slug: 'tap-dummy', link_m3u8: 'https://cdn.example.com/dummy.m3u8' },
              { name: tc.mockName, slug: tc.mockSlug, link_m3u8: tc.expectedM3u8 }
            ]
          }
        ]
      });

      const streams = await kkphim.getStreams({
        slug,
        type: 'series',
        season: 1,
        episode: tc.epInput,
        proxyBase: 'http://localhost:7000'
      });

      assert.strictEqual(streams.length, 1, `Expected 1 stream for episode input ${tc.epInput}`);
      verifyKKPhimStreamInvariants(streams[0]);

      const expectedB64Url = Buffer.from(tc.expectedM3u8, 'utf8').toString('base64url');
      assert(streams[0].url.includes(`url=${expectedB64Url}`), `Stream URL should contain encoded link for ${tc.expectedM3u8}`);
    });
  }

  await testStep('Series multi-server: returns matched episode across all 3 servers', async () => {
    detailCache.clear();
    const slug = 'game-of-thrones';
    detailCache.set(`kkphim:detail:${slug}`, {
      movie: { name: 'Game of Thrones', slug, type: 'series' },
      episodes: [
        {
          server_name: 'Vietsub #1',
          server_data: [
            { name: '1', slug: 'tap-1', link_m3u8: 'https://s1.phimapi.com/got/s1e1.m3u8' }
          ]
        },
        {
          server_name: 'Thuyết Minh #1',
          server_data: [
            { name: '1', slug: 'tap-1', link_m3u8: 'https://s2.phimapi.com/got/s1e1-tm.m3u8' }
          ]
        },
        {
          server_name: 'Lồng Tiếng #1',
          server_data: [
            { name: '1', slug: 'tap-1', link_m3u8: 'https://s3.phimapi.com/got/s1e1-lt.m3u8' }
          ]
        }
      ]
    });

    const streams = await kkphim.getStreams({
      slug,
      type: 'series',
      season: 1,
      episode: 1,
      proxyBase: 'http://localhost:7000'
    });

    assert.strictEqual(streams.length, 3, `Expected 3 streams across 3 servers for episode 1`);
    for (const s of streams) {
      verifyKKPhimStreamInvariants(s);
      assert(s.title.includes('[Tập 1]'), `Title should include '[Tập 1]', got: ${s.title}`);
    }
  });

  await testStep('Series (multi-episode) out-of-bounds episode (e.g. ep 999) returns [] gracefully', async () => {
    detailCache.clear();
    const slug = 'multi-ep-series';
    detailCache.set(`kkphim:detail:${slug}`, {
      movie: { name: 'Multi Ep Series', slug, type: 'series' },
      episodes: [
        {
          server_name: 'Vietsub #1',
          server_data: [
            { name: '1', slug: 'tap-1', link_m3u8: 'https://cdn.example.com/ep1.m3u8' },
            { name: '2', slug: 'tap-2', link_m3u8: 'https://cdn.example.com/ep2.m3u8' }
          ]
        }
      ]
    });

    const streams = await kkphim.getStreams({
      slug,
      type: 'series',
      season: 1,
      episode: 999,
      proxyBase: 'http://localhost:7000'
    });

    assert.deepStrictEqual(streams, [], 'Expected empty array for out-of-bounds episode in multi-episode series');
  });

  await testStep('Series single-item heuristic: 1-episode series with ep 999 triggers isMovie fallback', async () => {
    detailCache.clear();
    const slug = 'single-ep-series';
    detailCache.set(`kkphim:detail:${slug}`, {
      movie: { name: 'Single Ep Series', slug, type: 'series' },
      episodes: [
        {
          server_name: 'Vietsub #1',
          server_data: [
            { name: '1', slug: 'tap-1', link_m3u8: 'https://cdn.example.com/ep1.m3u8' }
          ]
        }
      ]
    });

    const streams = await kkphim.getStreams({
      slug,
      type: 'series',
      season: 1,
      episode: 999,
      proxyBase: 'http://localhost:7000'
    });

    // In current implementation line 360, (episodes.length === 1 && server_data.length === 1) evaluates isMovie = true
    assert.strictEqual(streams.length, 1);
    verifyKKPhimStreamInvariants(streams[0]);
  });

  // ═════════════════════════════════════════════════════════════
  // SUITE 3: EMPTY SERVER DATA & MISSING FIELDS RESILIENCE
  // ═════════════════════════════════════════════════════════════
  console.log('\n--- Suite 3: Empty Server Data & Edge Field Handling ---');

  await testStep('Server with empty server_data: [] or null is gracefully skipped', async () => {
    detailCache.clear();
    const slug = 'test-empty-servers';
    detailCache.set(`kkphim:detail:${slug}`, {
      movie: { name: 'Test Movie', slug, type: 'single' },
      episodes: [
        { server_name: 'Empty Server 1', server_data: [] },
        {
          server_name: 'Valid Server 2',
          server_data: [{ name: 'Full', slug: 'full', link_m3u8: 'https://cdn.example.com/valid.m3u8' }]
        },
        { server_name: 'Null Server Data', server_data: null }
      ]
    });

    const streams = await kkphim.getStreams({
      slug,
      type: 'movie',
      proxyBase: 'http://localhost:7000'
    });

    assert.strictEqual(streams.length, 1, `Expected 1 stream from the only valid server, got ${streams.length}`);
    verifyKKPhimStreamInvariants(streams[0]);
    assert(streams[0].title.includes('Valid Server 2'));
  });

  await testStep('Server with missing or empty link_m3u8 (embed only or empty) is safely skipped', async () => {
    detailCache.clear();
    const slug = 'test-embed-only';
    detailCache.set(`kkphim:detail:${slug}`, {
      movie: { name: 'Embed Only Movie', slug, type: 'single' },
      episodes: [
        {
          server_name: 'Embed Only Server',
          server_data: [
            { name: 'Full', slug: 'full', link_embed: 'https://embed.phimapi.com/v/only-embed' } // NO link_m3u8
          ]
        },
        {
          server_name: 'Empty link_m3u8 Server',
          server_data: [
            { name: 'Full', slug: 'full', link_m3u8: '', link_embed: 'https://embed.phimapi.com/v/empty-m3u8' }
          ]
        },
        {
          server_name: 'Good Server',
          server_data: [
            { name: 'Full', slug: 'full', link_m3u8: 'https://s1.phimapi.com/good.m3u8' }
          ]
        }
      ]
    });

    const streams = await kkphim.getStreams({
      slug,
      type: 'movie',
      proxyBase: 'http://localhost:7000'
    });

    assert.strictEqual(streams.length, 1, `Expected 1 stream (only the one with valid link_m3u8)`);
    verifyKKPhimStreamInvariants(streams[0]);
    assert(streams[0].title.includes('Good Server'));
  });

  await testStep('Server with missing or messy server_name falls back to "Server {idx + 1}"', async () => {
    detailCache.clear();
    const slug = 'test-no-server-name';
    detailCache.set(`kkphim:detail:${slug}`, {
      movie: { name: 'No Server Name Movie', slug, type: 'single' },
      episodes: [
        {
          server_name: null,
          server_data: [{ name: 'Full', slug: 'full', link_m3u8: 'https://s1.phimapi.com/ep1.m3u8' }]
        },
        {
          server_name: '',
          server_data: [{ name: 'Full', slug: 'full', link_m3u8: 'https://s2.phimapi.com/ep2.m3u8' }]
        },
        {
          server_name: '   ###   ',
          server_data: [{ name: 'Full', slug: 'full', link_m3u8: 'https://s3.phimapi.com/ep3.m3u8' }]
        }
      ]
    });

    const streams = await kkphim.getStreams({
      slug,
      type: 'movie',
      proxyBase: 'http://localhost:7000'
    });

    assert.strictEqual(streams.length, 3);
    assert.strictEqual(streams[0].title, '[VIP • KKPhim] Server 1 Full HD (HLS Proxy)\n⚡ Server VIP • Phát trực tiếp trong App');
    assert.strictEqual(streams[1].title, '[VIP • KKPhim] Server 2 Full HD (HLS Proxy)\n⚡ Server VIP • Phát trực tiếp trong App');
    assert.strictEqual(streams[2].title, '[VIP • KKPhim] Server 3 Full HD (HLS Proxy)\n⚡ Server VIP • Phát trực tiếp trong App');
  });

  // ═════════════════════════════════════════════════════════════
  // SUITE 4: MALFORMED API PAYLOADS & EXCEPTION RESILIENCE
  // ═════════════════════════════════════════════════════════════
  console.log('\n--- Suite 4: Malformed API Payloads & Fault Resilience ---');

  const malformedPayloads = [
    { name: 'null movie and episodes', payload: { movie: null, episodes: null } },
    { name: 'episodes is non-array string', payload: { movie: { slug: 'test' }, episodes: 'invalid' } },
    { name: 'episodes is empty array', payload: { movie: { slug: 'test' }, episodes: [] } },
    { name: 'episodes contains null elements', payload: { movie: { slug: 'test' }, episodes: [null, undefined] } },
    { name: 'server_data contains null/empty items', payload: { movie: { slug: 'test' }, episodes: [{ server_name: 'VIP', server_data: [null, {}] }] } },
  ];

  for (const mp of malformedPayloads) {
    await testStep(`Malformed payload handling: ${mp.name}`, async () => {
      detailCache.clear();
      const slug = `test-malformed-${totalTests}`;
      detailCache.set(`kkphim:detail:${slug}`, mp.payload);

      const streams = await kkphim.getStreams({
        slug,
        type: 'movie',
        proxyBase: 'http://localhost:7000'
      });

      assert(Array.isArray(streams), 'getStreams MUST always return an array');
      assert.deepStrictEqual(streams, [], 'Malformed payload should resolve safely to empty array');
    });
  }

  await testStep('Invalid invocation arguments (null, undefined, non-object, empty string) return [] safely', async () => {
    assert.deepStrictEqual(await kkphim.getStreams(null), []);
    assert.deepStrictEqual(await kkphim.getStreams(undefined), []);
    assert.deepStrictEqual(await kkphim.getStreams({}), []);
    assert.deepStrictEqual(await kkphim.getStreams(''), []);
    assert.deepStrictEqual(await kkphim.getStreams(12345), []);
  });

  // ═════════════════════════════════════════════════════════════
  // SUITE 5: PROTOCOL INVARIANT STRESS & BASE_REF CHECK
  // ═════════════════════════════════════════════════════════════
  console.log('\n--- Suite 5: Protocol Invariant Stress & baseRef Strictness ---');

  await testStep('Verify baseRef is exactly "https://player.phimapi.com/" across 25 dynamic stream resolutions', async () => {
    detailCache.clear();
    for (let i = 0; i < 25; i++) {
      const slug = `dynamic-film-${i}`;
      detailCache.set(`kkphim:detail:${slug}`, {
        movie: { name: `Film ${i}`, slug, type: 'single' },
        episodes: [
          {
            server_name: `Server ${i}`,
            server_data: [{ name: 'Full', slug: 'full', link_m3u8: `https://cdn${i}.phimapi.com/live/${i}.m3u8` }]
          }
        ]
      });

      const streams = await kkphim.getStreams({
        slug,
        type: 'movie',
        proxyBase: 'https://vip-movies.example.com'
      });

      assert.strictEqual(streams.length, 1);
      verifyKKPhimStreamInvariants(streams[0], 'https://vip-movies.example.com');

      // Double-check decoded ref
      const url = new URL(streams[0].url);
      const ref = Buffer.from(url.searchParams.get('ref'), 'base64url').toString('utf8');
      assert.strictEqual(ref, 'https://player.phimapi.com/');
    }
  });

  await testStep('Strict NO externalUrl: verify 100 generated streams never have externalUrl property defined', async () => {
    detailCache.clear();
    for (let i = 0; i < 100; i++) {
      const slug = `stress-film-${i}`;
      detailCache.set(`kkphim:detail:${slug}`, {
        movie: { name: `Stress Film ${i}`, slug, type: 'single' },
        episodes: [
          {
            server_name: `VIP ${i}`,
            server_data: [
              {
                name: 'Full',
                slug: 'full',
                link_m3u8: `https://s${i}.phimapi.com/film${i}.m3u8`,
                link_embed: `https://embed${i}.phimapi.com/v/film${i}` // embed present in upstream payload!
              }
            ]
          }
        ]
      });

      const streams = await kkphim.getStreams({
        slug,
        type: 'movie',
        proxyBase: 'http://localhost:7000'
      });

      assert.strictEqual(streams.length, 1);
      assert.strictEqual(streams[0].externalUrl, undefined, `Stream MUST NOT expose externalUrl even when link_embed is present in upstream!`);
      assert('url' in streams[0], 'Stream MUST have url property');
    }
  });

  // ═════════════════════════════════════════════════════════════
  // SUITE 6: EXPRESS ROUTE & HIGH-CONCURRENCY PIPELINE INTEGRATION
  // ═════════════════════════════════════════════════════════════
  console.log('\n--- Suite 6: Express Route Integration & Concurrency Stress ---');

  await testStep('Express /stream/movie/:id.json resolves KKPhim stream with in-app format', async () => {
    // Populate cache for Inception
    imdbCache.set('kkphim:imdb:tt1375666', {
      movie: {
        name: 'Kẻ Đánh Cắp Giấc Mơ',
        origin_name: 'Inception',
        slug: 'ke-danh-cap-giac-mo',
        type: 'single',
      },
      episodes: [
        {
          server_name: 'Vietsub #1',
          server_data: [{ name: 'Full', slug: 'full', link_m3u8: 'https://s1.phimapi.com/inception/full.m3u8' }]
        }
      ]
    });

    const app = express();
    app.use('/', handlers);

    const server = await new Promise((resolve) => {
      const s = app.listen(0, () => resolve(s));
    });
    const port = server.address().port;
    const baseUrl = `http://localhost:${port}`;

    try {
      const res = await axios.get(`${baseUrl}/stream/movie/tt1375666.json`, { timeout: 5000 });
      assert.strictEqual(res.status, 200);
      assert(res.data && Array.isArray(res.data.streams));

      const kkStreams = res.data.streams.filter(s => s.title.includes('KKPhim'));
      assert(kkStreams.length >= 1, 'Expected at least 1 KKPhim stream');

      for (const s of kkStreams) {
        verifyKKPhimStreamInvariants(s, baseUrl);
      }
    } finally {
      await new Promise((resolve) => server.close(resolve));
    }
  });

  await testStep('Express /stream/series/:id.json resolves KKPhim series episode stream with in-app format', async () => {
    imdbCache.set('kkphim:imdb:tt0903747', {
      movie: {
        name: 'Biến Chất',
        origin_name: 'Breaking Bad',
        slug: 'bien-chat',
        type: 'series',
      },
      episodes: [
        {
          server_name: 'Vietsub #1',
          server_data: [
            { name: '1', slug: 'tap-1', link_m3u8: 'https://s1.phimapi.com/breaking-bad/s1e1.m3u8' },
            { name: '2', slug: 'tap-2', link_m3u8: 'https://s1.phimapi.com/breaking-bad/s1e2.m3u8' }
          ]
        }
      ]
    });

    const app = express();
    app.use('/', handlers);

    const server = await new Promise((resolve) => {
      const s = app.listen(0, () => resolve(s));
    });
    const port = server.address().port;
    const baseUrl = `http://localhost:${port}`;

    try {
      const res = await axios.get(`${baseUrl}/stream/series/tt0903747:1:1.json`, { timeout: 5000 });
      assert.strictEqual(res.status, 200);
      assert(res.data && Array.isArray(res.data.streams));

      const kkStreams = res.data.streams.filter(s => s.title.includes('KKPhim'));
      assert(kkStreams.length >= 1, 'Expected at least 1 KKPhim stream for S1E1');

      for (const s of kkStreams) {
        verifyKKPhimStreamInvariants(s, baseUrl);
        assert(s.title.includes('[Tập 1]'), `Title should include [Tập 1], got ${s.title}`);
      }
    } finally {
      await new Promise((resolve) => server.close(resolve));
    }
  });

  await testStep('High-concurrency stress: 50 concurrent KKPhim getStreams requests maintain integrity', async () => {
    detailCache.clear();
    const tasks = [];
    for (let i = 0; i < 50; i++) {
      const slug = `concurrent-stress-${i}`;
      detailCache.set(`kkphim:detail:${slug}`, {
        movie: { name: `Film ${i}`, slug, type: 'single' },
        episodes: [
          {
            server_name: 'Vietsub #1',
            server_data: [{ name: 'Full', slug: 'full', link_m3u8: `https://cdn.example.com/${slug}.m3u8` }]
          }
        ]
      });

      tasks.push(kkphim.getStreams({
        slug,
        type: 'movie',
        proxyBase: 'http://localhost:7000'
      }));
    }

    const results = await Promise.all(tasks);
    assert.strictEqual(results.length, 50);

    for (let i = 0; i < 50; i++) {
      const sArr = results[i];
      assert.strictEqual(sArr.length, 1);
      verifyKKPhimStreamInvariants(sArr[0]);
      const expectedM3u8B64 = Buffer.from(`https://cdn.example.com/concurrent-stress-${i}.m3u8`).toString('base64url');
      assert(sArr[0].url.includes(`url=${expectedM3u8B64}`));
    }
  });

  // ═════════════════════════════════════════════════════════════
  // SUMMARY
  // ═════════════════════════════════════════════════════════════
  console.log('\n╔══════════════════════════════════════════════════════════════╗');
  console.log('║                   CHALLENGER 2 SUMMARY                       ║');
  console.log('╠══════════════════════════════════════════════════════════════╣');
  console.log(`║  Total Tests Executed: ${String(totalTests).padEnd(38)}║`);
  console.log(`║  ✅ Passed:             ${String(passedTests).padEnd(38)}║`);
  console.log(`║  ❌ Failed:             ${String(failedTests).padEnd(38)}║`);
  console.log('╚══════════════════════════════════════════════════════════════╝\n');

  if (failedTests > 0) {
    console.error('❌ Failures detected:');
    failures.forEach((f, idx) => {
      console.error(`  ${idx + 1}. [${f.name}]: ${f.error}`);
    });
    process.exit(1);
  } else {
    console.log('🎉 ALL EMPIRICAL CHALLENGE TESTS PASSED PERFECTLY!\n');
    process.exit(0);
  }
})();
