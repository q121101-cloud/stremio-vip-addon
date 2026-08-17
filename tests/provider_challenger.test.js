'use strict';

/**
 * ============================================================
 *  VIP Movies Addon — tests/provider_challenger.test.js
 *  Milestone 2 Challenger Empirical Test Harness (Sequential)
 * ============================================================
 */

const assert = require('assert');
const axios = require('axios');
const kkphim = require('../src/providers/kkphim');
const nguonc = require('../src/providers/nguonc');
const vsmov = require('../src/providers/vsmov');
const { resolveCinemeta, getCachedCinemeta, cinemetaCache } = require('../src/lib/cinemeta');
const { imdbCache, catalogCache, detailCache } = require('../src/lib/cache');
const express = require('express');
const handlers = require('../src/handlers');

let passedTests = 0;
let failedTests = 0;
const failures = [];

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

async function main() {
  console.log('\n============================================================');
  console.log('🚀 STARTING EMPIRICAL CHALLENGER TEST HARNESS');
  console.log('============================================================\n');

  // ─── SUITE 1: Year Matching & Search Scoring Invariants ─────────
  console.log('--- Suite 1: Year Matching & Search Scoring Invariants ---');

  await runAsyncTest('KKPhim year matching disambiguates duplicate titles (e.g. Dune 1984 vs Dune 2021)', async () => {
    imdbCache.clear();
    detailCache.clear();

    const originalRequest = axios.Axios.prototype.request;

    try {
      let requestedSlug = null;
      axios.Axios.prototype.request = async function (configOrUrl, maybeConfig) {
        const config = typeof configOrUrl === 'string' ? { url: configOrUrl, ...(maybeConfig || {}) } : configOrUrl;
        const fullUrl = String(config.url || '');

        if (fullUrl.includes('/imdb/title/')) {
          const err = new Error('Not found');
          err.response = { status: 404 };
          throw err;
        }
        if (fullUrl.includes('/v1/api/tim-kiem') || fullUrl.includes('tim-kiem')) {
          return {
            data: {
              data: {
                items: [
                  { name: 'Xứ Cát', origin_name: 'Dune', slug: 'xu-cat-1984', year: 1984, type: 'single' },
                  { name: 'Dune: Hành Tinh Cát', origin_name: 'Dune: Part One', slug: 'dune-hanh-tinh-cat-2021', year: 2021, type: 'single' },
                  { name: 'Dune: Hành Tinh Cát - Phần Hai', origin_name: 'Dune: Part Two', slug: 'dune-hanh-tinh-cat-phan-hai-2024', year: 2024, type: 'single' },
                ],
              },
            },
          };
        }
        if (fullUrl.includes('/phim/')) {
          const slug = fullUrl.split('/phim/')[1];
          requestedSlug = slug;
          return {
            data: {
              movie: { name: 'Dune', slug, year: 2021, type: 'single' },
              episodes: [
                {
                  server_name: 'Vietsub #1',
                  server_data: [{ name: 'Full', slug: 'full', link_m3u8: 'https://cdn.example.com/dune.m3u8', link_embed: 'https://embed.example.com/dune' }],
                },
              ],
            },
          };
        }
        return originalRequest.call(this, config);
      };

      // Query with year 2021
      const streams2021 = await kkphim.getStreams({
        title: 'Dune',
        year: 2021,
        type: 'movie',
        proxyBase: 'http://localhost:7000',
      });

      assert.strictEqual(requestedSlug, 'dune-hanh-tinh-cat-2021', `Expected slug 'dune-hanh-tinh-cat-2021' for year 2021, got ${requestedSlug}`);
      assert(streams2021.length > 0, 'Expected non-empty streams for Dune 2021');

      // Query with year 1984
      requestedSlug = null;
      imdbCache.clear();
      detailCache.clear();
      const streams1984 = await kkphim.getStreams({
        title: 'Dune',
        year: 1984,
        type: 'movie',
        proxyBase: 'http://localhost:7000',
      });

      assert.strictEqual(requestedSlug, 'xu-cat-1984', `Expected slug 'xu-cat-1984' for year 1984, got ${requestedSlug}`);
      assert(streams1984.length > 0, 'Expected non-empty streams for Dune 1984');
    } finally {
      axios.Axios.prototype.request = originalRequest;
    }
  });

  await runAsyncTest('NguonC year matching correctly prioritizes exact year over mismatch', async () => {
    imdbCache.clear();
    detailCache.clear();

    const originalRequest = axios.Axios.prototype.request;
    try {
      let requestedSlug = null;
      axios.Axios.prototype.request = async function (configOrUrl, maybeConfig) {
        const config = typeof configOrUrl === 'string' ? { url: configOrUrl, ...(maybeConfig || {}) } : configOrUrl;
        const fullUrl = String(config.url || '');

        if (fullUrl.includes('/films/search')) {
          return {
            data: {
              items: [
                { name: 'Người Nhện (2002)', original_name: 'Spider-Man', slug: 'spider-man-2002', category: { 3: { list: [{ name: '2002' }] } } },
                { name: 'Người Nhện: Trở Về Nhà (2017)', original_name: 'Spider-Man: Homecoming', slug: 'spider-man-homecoming-2017', category: { 3: { list: [{ name: '2017' }] } } },
              ],
            },
          };
        }
        if (fullUrl.includes('/film/')) {
          const slug = fullUrl.split('/film/')[1];
          requestedSlug = slug;
          return {
            data: {
              movie: {
                name: 'Spider-Man',
                slug,
                episodes: [
                  {
                    server_name: 'Vietsub #1',
                    items: [{ name: 'Full', slug: 'full', embed: 'https://embed.nguonc.com/spider' }],
                  },
                ],
              },
            },
          };
        }
        return originalRequest.call(this, config);
      };

      const streams = await nguonc.getStreams({
        title: 'Spider-Man',
        year: 2002,
        type: 'movie',
        proxyBase: 'http://localhost:7000',
      });

      assert.strictEqual(requestedSlug, 'spider-man-2002', `Expected 'spider-man-2002', got '${requestedSlug}'`);
      assert(streams.length > 0, 'Expected streams returned');
    } finally {
      axios.Axios.prototype.request = originalRequest;
    }
  });

  // ─── SUITE 2: Episode Variation Matching ─────────────────────────
  console.log('\n--- Suite 2: Episode Variation Matching ---');

  const episodeVariations = [
    { input: 1, epData: { name: '1', slug: 'tap-1' }, desc: 'Numeric 1 -> name "1", slug "tap-1"' },
    { input: 1, epData: { name: '01', slug: 'tap-01' }, desc: 'Numeric 1 -> name "01", slug "tap-01"' },
    { input: '1', epData: { name: 'Tập 1', slug: 'tap-1' }, desc: 'String "1" -> name "Tập 1", slug "tap-1"' },
    { input: 2, epData: { name: 'Tập 02', slug: 'tap-02' }, desc: 'Numeric 2 -> name "Tập 02", slug "tap-02"' },
    { input: 5, epData: { name: '5', slug: 'tap-5' }, desc: 'Numeric 5 -> exact name "5"' },
    { input: '10', epData: { name: 'Tập 10 (End)', slug: 'tap-10' }, desc: 'String "10" -> slug "tap-10" with name "Tập 10 (End)"' },
    { input: 3, epData: { name: 'Ep 3: The Beginning', slug: 'tap-3' }, desc: 'Numeric 3 -> name matching word boundary "\\b3\\b"' },
  ];

  for (const { input, epData, desc } of episodeVariations) {
    await runAsyncTest(`KKPhim resolves episode variation: ${desc}`, async () => {
      imdbCache.clear();
      detailCache.clear();
      const originalRequest = axios.Axios.prototype.request;

      try {
        axios.Axios.prototype.request = async function (configOrUrl, maybeConfig) {
          const config = typeof configOrUrl === 'string' ? { url: configOrUrl, ...(maybeConfig || {}) } : configOrUrl;
          const fullUrl = String(config.url || '');

          if (fullUrl.includes('/phim/')) {
            return {
              data: {
                movie: { name: 'Breaking Bad', slug: 'breaking-bad', type: 'series' },
                episodes: [
                  {
                    server_name: 'Vietsub #1',
                    server_data: [
                      { name: 'Dummy 0', slug: 'tap-dummy', link_m3u8: 'https://cdn.example.com/0.m3u8', link_embed: 'https://embed.example.com/0' },
                      { ...epData, link_m3u8: `https://cdn.example.com/${epData.slug}.m3u8`, link_embed: `https://embed.example.com/${epData.slug}` },
                    ],
                  },
                ],
              },
            };
          }
          return originalRequest.call(this, config);
        };

        const streams = await kkphim.getStreams({
          slug: 'breaking-bad',
          type: 'series',
          season: 1,
          episode: input,
          proxyBase: 'http://localhost:7000',
        });

        assert(streams.length > 0, `Expected at least 1 stream for episode ${input}`);
        const hlsStream = streams.find(s => s.url);
        assert(hlsStream, 'Expected HLS stream');
        assert(hlsStream.url.includes(Buffer.from(`https://cdn.example.com/${epData.slug}.m3u8`).toString('base64url')), 'Stream URL should contain matched episode m3u8');
      } finally {
        axios.Axios.prototype.request = originalRequest;
      }
    });

    await runAsyncTest(`NguonC resolves episode variation: ${desc}`, async () => {
      imdbCache.clear();
      detailCache.clear();
      const originalRequest = axios.Axios.prototype.request;

      try {
        axios.Axios.prototype.request = async function (configOrUrl, maybeConfig) {
          const config = typeof configOrUrl === 'string' ? { url: configOrUrl, ...(maybeConfig || {}) } : configOrUrl;
          const fullUrl = String(config.url || '');

          if (fullUrl.includes('/film/')) {
            return {
              data: {
                movie: {
                  name: 'Breaking Bad',
                  slug: 'breaking-bad',
                  episodes: [
                    {
                      server_name: 'Vietsub #1',
                      items: [
                        { name: 'Dummy 0', slug: 'tap-dummy', embed: 'https://embed.nguonc.com/0' },
                        { ...epData, embed: `https://embed.nguonc.com/${epData.slug}` },
                      ],
                    },
                  ],
                },
              },
            };
          }
          return originalRequest.call(this, config);
        };

        const streams = await nguonc.getStreams({
          slug: 'breaking-bad',
          type: 'series',
          season: 1,
          episode: input,
          proxyBase: 'http://localhost:7000',
        });

        assert(streams.length > 0, `Expected at least 1 stream for episode ${input}`);
        const hlsStream = streams.find(s => s.url);
        assert(hlsStream, 'Expected HLS stream');
        assert(hlsStream.url.includes(Buffer.from(`https://embed.nguonc.com/${epData.slug}`).toString('base64url')), 'Stream url should contain base64 encoded embed');
      } finally {
        axios.Axios.prototype.request = originalRequest;
      }
    });
  }

  await runAsyncTest('Episode resolution fallback to 1-based index when names/slugs are non-standard', async () => {
    imdbCache.clear();
    detailCache.clear();
    const originalRequest = axios.Axios.prototype.request;

    try {
      axios.Axios.prototype.request = async function (configOrUrl, maybeConfig) {
        const config = typeof configOrUrl === 'string' ? { url: configOrUrl, ...(maybeConfig || {}) } : configOrUrl;
        const fullUrl = String(config.url || '');

        if (fullUrl.includes('/phim/')) {
          return {
            data: {
              movie: { name: 'Attack on Titan', slug: 'attack-on-titan', type: 'series' },
              episodes: [
                {
                  server_name: 'Vietsub #1',
                  server_data: [
                    { name: 'To You, in 2000 Years', slug: 'to-you-in-2000-years', link_m3u8: 'https://cdn.example.com/ep1.m3u8', link_embed: 'https://embed.example.com/ep1' },
                    { name: 'That Day', slug: 'that-day', link_m3u8: 'https://cdn.example.com/ep2.m3u8', link_embed: 'https://embed.example.com/ep2' },
                  ],
                },
              ],
            },
          };
        }
        return originalRequest.call(this, config);
      };

      const streams = await kkphim.getStreams({
        slug: 'attack-on-titan',
        type: 'series',
        season: 1,
        episode: 2,
        proxyBase: 'http://localhost:7000',
      });

      assert(streams.length > 0, 'Expected index-based fallback to return ep 2');
      const hls = streams.find(s => s.url);
      assert(hls.url.includes(Buffer.from('https://cdn.example.com/ep2.m3u8').toString('base64url')));
    } finally {
      axios.Axios.prototype.request = originalRequest;
    }
  });

  await runAsyncTest('Out-of-bounds episode request returns [] gracefully without throwing', async () => {
    imdbCache.clear();
    detailCache.clear();
    const originalRequest = axios.Axios.prototype.request;

    try {
      axios.Axios.prototype.request = async function (configOrUrl, maybeConfig) {
        const config = typeof configOrUrl === 'string' ? { url: configOrUrl, ...(maybeConfig || {}) } : configOrUrl;
        const fullUrl = String(config.url || '');

        if (fullUrl.includes('/phim/')) {
          return {
            data: {
              movie: { name: 'Short Series', slug: 'short-series', type: 'series' },
              episodes: [
                {
                  server_name: 'Vietsub #1',
                  server_data: [
                    { name: '1', slug: 'tap-1', link_m3u8: 'https://cdn.example.com/ep1.m3u8', link_embed: 'https://embed.example.com/ep1' },
                  ],
                },
              ],
            },
          };
        }
        return originalRequest.call(this, config);
      };

      const kkStreams = await kkphim.getStreams({
        slug: 'short-series',
        type: 'series',
        season: 1,
        episode: 999,
        proxyBase: 'http://localhost:7000',
      });
      assert.deepStrictEqual(kkStreams, [], 'Expected empty array for out-of-bounds episode');
    } finally {
      axios.Axios.prototype.request = originalRequest;
    }
  });

  // ─── SUITE 3: Server Name Formatting & Labeling ──────────────────
  console.log('\n--- Suite 3: Server Name Formatting & Multi-Server Support ---');

  await runAsyncTest('KKPhim formats stream labels with VIP 2 prefix and zero externalUrl', async () => {
    imdbCache.clear();
    detailCache.clear();
    const originalRequest = axios.Axios.prototype.request;

    try {
      axios.Axios.prototype.request = async function (configOrUrl, maybeConfig) {
        const config = typeof configOrUrl === 'string' ? { url: configOrUrl, ...(maybeConfig || {}) } : configOrUrl;
        const fullUrl = String(config.url || '');

        if (fullUrl.includes('/phim/')) {
          return {
            data: {
              movie: { name: 'Test Movie', slug: 'test-movie', type: 'single' },
              episodes: [
                {
                  server_name: 'Vietsub #1',
                  server_data: [{ name: 'Full', slug: 'full', link_m3u8: 'https://cdn.example.com/v1.m3u8', link_embed: 'https://embed.example.com/v1' }],
                },
                {
                  server_name: 'Thuyết Minh #2',
                  server_data: [{ name: 'Full', slug: 'full', link_m3u8: 'https://cdn.example.com/tm2.m3u8', link_embed: 'https://embed.example.com/tm2' }],
                },
                {
                  server_name: 'Lồng Tiếng #3',
                  server_data: [{ name: 'Full', slug: 'full', link_m3u8: 'https://cdn.example.com/lt3.m3u8', link_embed: 'https://embed.example.com/lt3' }],
                },
              ],
            },
          };
        }
        return originalRequest.call(this, config);
      };

      const streams = await kkphim.getStreams({
        slug: 'test-movie',
        type: 'movie',
        proxyBase: 'http://localhost:7000',
      });

      assert.strictEqual(streams.length, 3, `Expected 3 in-app streams, got ${streams.length}`);

      const titles = streams.map(s => s.title);
      assert(titles.some(t => t.includes('[VIP 2 • KKPhim] Vietsub Full HD (HLS Proxy)')), 'Should format Vietsub Full HD');
      assert(titles.some(t => t.includes('[VIP 2 • KKPhim] Thuyết Minh Full HD (HLS Proxy)')), 'Should format Thuyết Minh Full HD');
      assert(titles.some(t => t.includes('[VIP 2 • KKPhim] Lồng Tiếng Full HD (HLS Proxy)')), 'Should format Lồng Tiếng Full HD');

      for (const s of streams) {
        assert.strictEqual(s.externalUrl, undefined, 'Strict zero externalUrl');
      }
    } finally {
      axios.Axios.prototype.request = originalRequest;
    }
  });

  await runAsyncTest('NguonC formats stream labels with VIP 3 prefix and zero externalUrl', async () => {
    imdbCache.clear();
    detailCache.clear();
    const originalRequest = axios.Axios.prototype.request;

    try {
      axios.Axios.prototype.request = async function (configOrUrl, maybeConfig) {
        const config = typeof configOrUrl === 'string' ? { url: configOrUrl, ...(maybeConfig || {}) } : configOrUrl;
        const fullUrl = String(config.url || '');

        if (fullUrl.includes('/film/')) {
          return {
            data: {
              movie: {
                name: 'Test Movie NguonC',
                slug: 'test-movie-nguonc',
                episodes: [
                  {
                    server_name: 'Vietsub #1',
                    items: [{ name: 'Full', slug: 'full', embed: 'https://embed.nguonc.com/v1' }],
                  },
                  {
                    server_name: 'Thuyết Minh #1',
                    items: [{ name: 'Full', slug: 'full', embed: 'https://embed.nguonc.com/tm1' }],
                  },
                ],
              },
            },
          };
        }
        return originalRequest.call(this, config);
      };

      const streams = await nguonc.getStreams({
        slug: 'test-movie-nguonc',
        type: 'movie',
        proxyBase: 'http://localhost:7000',
      });

      assert.strictEqual(streams.length, 2, `Expected 2 in-app streams, got ${streams.length}`);

      const titles = streams.map(s => s.title);
      assert(titles.some(t => t.includes('[VIP 3 • NguonC] Vietsub Full HD (HLS Proxy)')), 'Should format Vietsub Full HD');
      assert(titles.some(t => t.includes('[VIP 3 • NguonC] Thuyết Minh Full HD (HLS Proxy)')), 'Should format Thuyết Minh Full HD');

      for (const s of streams) {
        assert.strictEqual(s.externalUrl, undefined, 'Strict zero externalUrl');
      }
    } finally {
      axios.Axios.prototype.request = originalRequest;
    }
  });

  // ─── SUITE 4: Timeout Resilience ────────────────────────────────
  console.log('\n--- Suite 4: Timeout Resilience ---');
  await runAsyncTest('Providers have 5-second axios timeout configured', async () => {
    const fs = require('fs');
    const kkphimCode = fs.readFileSync(require.resolve('../src/providers/kkphim'), 'utf8');
    const nguoncCode = fs.readFileSync(require.resolve('../src/providers/nguonc'), 'utf8');
    const vsmovCode = fs.readFileSync(require.resolve('../src/providers/vsmov'), 'utf8');

    assert(kkphimCode.includes('timeout: 5000'), 'KKPhim must have timeout: 5000');
    assert(nguoncCode.includes('timeout: 5000'), 'NguonC must have timeout: 5000');
    assert(vsmovCode.includes('timeout: 5000'), 'VsMov must have timeout: 5000');
  });

  // ─── SUITE 5: Live End-to-End Aggregation ───────────────────────
  console.log('\n--- Suite 5: Live End-to-End Aggregation ---');
  await runAsyncTest('Live Stream API resolves Inception (tt1375666) with zero externalUrl', async () => {
    const app = express();
    app.use('/', handlers);

    const server = await new Promise((resolve) => {
      const s = app.listen(0, () => resolve(s));
    });

    const port = server.address().port;
    const baseUrl = `http://127.0.0.1:${port}`;

    try {
      const res = await axios.get(`${baseUrl}/stream/movie/tt1375666.json`, { timeout: 15000 });
      assert.strictEqual(res.status, 200, 'HTTP status should be 200');
      assert(res.data && Array.isArray(res.data.streams), 'Response should contain streams array');

      const streams = res.data.streams;
      console.log(`     -> Total resolved live streams for Inception (tt1375666): ${streams.length}`);

      for (const s of streams) {
        assert(s.name === 'VIP Movies 🎬', `Stream name must be 'VIP Movies 🎬', got '${s.name}'`);
        assert(s.title && s.title.length > 0, 'Stream must have non-empty title');
        assert(s.url && s.url.includes('/hls/'), 'Stream url must be an HLS proxy route');
        assert.strictEqual(s.externalUrl, undefined, 'STRICT INVARIANT: No externalUrl');
      }
    } finally {
      await new Promise((resolve) => server.close(resolve));
    }
  });

  // ─── SUMMARY ───────────────────────────────────────────────────
  console.log('\n============================================================');
  console.log(`🏁 TEST RUN FINISHED: ${passedTests} passed, ${failedTests} failed`);
  console.log('============================================================\n');

  if (failedTests > 0) {
    console.error(`💥 FAILURES (${failedTests}):`);
    failures.forEach((f, idx) => {
      console.error(`\n[${idx + 1}] ${f.name}`);
      console.error(f.stack || f.error);
    });
    process.exit(1);
  } else {
    console.log('🎉 ALL EMPIRICAL CHALLENGER TESTS PASSED WITH ZERO FAILURES!\n');
    process.exit(0);
  }
}

main().catch((err) => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
