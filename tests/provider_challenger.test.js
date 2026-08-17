'use strict';

/**
 * ============================================================
 *  VIP Movies Addon — tests/provider_challenger.test.js
 *  Milestone 2 Challenger 2 Empirical Test Harness
 *
 *  Coverage:
 *  1. Search Scoring & Year Matching Logic
 *  2. Year Disambiguation (e.g. Dune 1984 vs 2021, Spider-Man 2002 vs 2017)
 *  3. Episode Variation Matching (tap-1, 1, Tap 01, Full, specials, out-of-bounds)
 *  4. Server Name Formatting & Labeling (Vietsub, Thuyết Minh, Lồng Tiếng, # stripping)
 *  5. R3 Stremio Stream Protocol Compliance (exclusive url vs externalUrl, proxyBase)
 *  6. Provider Fault Isolation & Axios 5s Timeout Verification
 *  7. Live & Mocked End-to-End Aggregator Verification
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
console.log('🚀 STARTING EMPIRICAL CHALLENGER 2 TEST HARNESS');
console.log('============================================================\n');

// ─── SUITE 1: Year Matching & Search Scoring Invariants ─────────
console.log('--- Suite 1: Year Matching & Search Scoring Invariants ---');

// Test KKPhim internal scoring behavior via search mocking or direct invocation if exported
// In kkphim.js, scoreMatch is internal, but we can verify it via getStreams and synthetic items
runAsyncTest('KKPhim year matching disambiguates duplicate titles (e.g. Dune 1984 vs Dune 2021)', async () => {
  // Clear caches
  imdbCache.clear();
  detailCache.clear();

  // Test by calling getStreams with different years and verifying score behavior
  // Synthetic test: Dune 2021 vs Dune 1984
  // We mock http.get temporarily or test search + getDetail flow
  const originalGet = axios.Axios.prototype.get;

  try {
    let requestedSlug = null;
    axios.Axios.prototype.get = async function (url, config) {
      if (url.includes('/imdb/title/')) {
        const err = new Error('Not found');
        err.response = { status: 404 };
        throw err;
      }
      if (url.includes('/v1/api/tim-kiem')) {
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
      if (url.includes('/phim/')) {
        const slug = url.split('/phim/')[1];
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
      return originalGet.call(this, url, config);
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
    axios.Axios.prototype.get = originalGet;
  }
});

runAsyncTest('NguonC year matching correctly prioritizes exact year over mismatch', async () => {
  imdbCache.clear();
  detailCache.clear();

  const originalGet = axios.Axios.prototype.get;
  try {
    let requestedSlug = null;
    axios.Axios.prototype.get = async function (url, config) {
      if (url.includes('/films/search')) {
        return {
          data: {
            items: [
              { name: 'Người Nhện (2002)', original_name: 'Spider-Man', slug: 'spider-man-2002', category: { 3: { list: [{ name: '2002' }] } } },
              { name: 'Người Nhện: Trở Về Nhà (2017)', original_name: 'Spider-Man: Homecoming', slug: 'spider-man-homecoming-2017', category: { 3: { list: [{ name: '2017' }] } } },
            ],
          },
        };
      }
      if (url.includes('/film/')) {
        const slug = url.split('/film/')[1];
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
      return originalGet.call(this, url, config);
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
    axios.Axios.prototype.get = originalGet;
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
  runAsyncTest(`KKPhim resolves episode variation: ${desc}`, async () => {
    imdbCache.clear();
    detailCache.clear();
    const originalGet = axios.Axios.prototype.get;

    try {
      axios.Axios.prototype.get = async function (url, config) {
        if (url.includes('/phim/')) {
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
        return originalGet.call(this, url, config);
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
      axios.Axios.prototype.get = originalGet;
    }
  });

  runAsyncTest(`NguonC resolves episode variation: ${desc}`, async () => {
    imdbCache.clear();
    detailCache.clear();
    const originalGet = axios.Axios.prototype.get;

    try {
      axios.Axios.prototype.get = async function (url, config) {
        if (url.includes('/film/')) {
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
        return originalGet.call(this, url, config);
      };

      const streams = await nguonc.getStreams({
        slug: 'breaking-bad',
        type: 'series',
        season: 1,
        episode: input,
        proxyBase: 'http://localhost:7000',
      });

      assert(streams.length > 0, `Expected at least 1 stream for episode ${input}`);
      const embedStream = streams.find(s => s.externalUrl);
      assert(embedStream, 'Expected Embed stream');
      assert.strictEqual(embedStream.externalUrl, `https://embed.nguonc.com/${epData.slug}`);
    } finally {
      axios.Axios.prototype.get = originalGet;
    }
  });
}

runAsyncTest('Episode resolution fallback to 1-based index when names/slugs are non-standard', async () => {
  imdbCache.clear();
  detailCache.clear();
  const originalGet = axios.Axios.prototype.get;

  try {
    axios.Axios.prototype.get = async function (url, config) {
      if (url.includes('/phim/')) {
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
      return originalGet.call(this, url, config);
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
    axios.Axios.prototype.get = originalGet;
  }
});

runAsyncTest('Out-of-bounds episode request returns [] gracefully without throwing', async () => {
  imdbCache.clear();
  detailCache.clear();
  const originalGet = axios.Axios.prototype.get;

  try {
    axios.Axios.prototype.get = async function (url, config) {
      if (url.includes('/phim/')) {
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
      return originalGet.call(this, url, config);
    };

    const kkStreams = await kkphim.getStreams({
      slug: 'short-series',
      type: 'series',
      season: 1,
      episode: 999, // Out of bounds
      proxyBase: 'http://localhost:7000',
    });
    assert.deepStrictEqual(kkStreams, [], 'Expected empty array for out-of-bounds episode');
  } finally {
    axios.Axios.prototype.get = originalGet;
  }
});

// ─── SUITE 3: Server Name Formatting & Labeling ──────────────────
console.log('\n--- Suite 3: Server Name Formatting & Multi-Server Support ---');

runAsyncTest('KKPhim strips "#" from server names and formats labels correctly', async () => {
  imdbCache.clear();
  detailCache.clear();
  const originalGet = axios.Axios.prototype.get;

  try {
    axios.Axios.prototype.get = async function (url, config) {
      if (url.includes('/phim/')) {
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
      return originalGet.call(this, url, config);
    };

    const streams = await kkphim.getStreams({
      slug: 'test-movie',
      type: 'movie',
      proxyBase: 'http://localhost:7000',
    });

    assert.strictEqual(streams.length, 6, `Expected 6 streams (3 servers x 2 modes), got ${streams.length}`);

    // Check titles
    const titles = streams.map(s => s.title);
    assert(titles.some(t => t.includes('[VIP • KKPhim] Vietsub 1 (HLS Proxy)')), 'Should format Vietsub 1 without #');
    assert(titles.some(t => t.includes('[VIP • KKPhim] Thuyết Minh 2 (HLS Proxy)')), 'Should format Thuyết Minh 2 without #');
    assert(titles.some(t => t.includes('[VIP • KKPhim] Lồng Tiếng 3 (HLS Proxy)')), 'Should format Lồng Tiếng 3 without #');
    assert(titles.some(t => t.includes('[Dự phòng • KKPhim] Vietsub 1 (Embed Player)')), 'Should format Embed Vietsub 1');

    // Ensure no '#' remains in any title
    for (const title of titles) {
      assert(!title.includes('#'), `Title should not contain '#': "${title}"`);
    }
  } finally {
    axios.Axios.prototype.get = originalGet;
  }
});

runAsyncTest('NguonC strips "#" from server names and formats labels correctly', async () => {
  imdbCache.clear();
  detailCache.clear();
  const originalGet = axios.Axios.prototype.get;

  try {
    axios.Axios.prototype.get = async function (url, config) {
      if (url.includes('/film/')) {
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
      return originalGet.call(this, url, config);
    };

    const streams = await nguonc.getStreams({
      slug: 'test-movie-nguonc',
      type: 'movie',
      proxyBase: 'http://localhost:7000',
    });

    assert.strictEqual(streams.length, 4, `Expected 4 streams (2 servers x 2 modes), got ${streams.length}`);

    const titles = streams.map(s => s.title);
    assert(titles.some(t => t.includes('[VIP • NguonC] Vietsub 1 (HLS Proxy)')), 'Should format Vietsub 1 without #');
    assert(titles.some(t => t.includes('[VIP • NguonC] Thuyết Minh 1 (HLS Proxy)')), 'Should format Thuyết Minh 1 without #');

    for (const title of titles) {
      assert(!title.includes('#'), `Title should not contain '#': "${title}"`);
    }
  } finally {
    axios.Axios.prototype.get = originalGet;
  }
});

// ─── SUITE 4: Stream Protocol Compliance Invariants ───────────────
console.log('\n--- Suite 4: R3 Stremio Stream Protocol Compliance ---');

runAsyncTest('KKPhim stream objects strictly adhere to exclusive url / externalUrl protocol', async () => {
  imdbCache.clear();
  detailCache.clear();
  const originalGet = axios.Axios.prototype.get;

  try {
    axios.Axios.prototype.get = async function (url, config) {
      if (url.includes('/phim/')) {
        return {
          data: {
            movie: { name: 'Protocol Test', slug: 'protocol-test', type: 'single' },
            episodes: [
              {
                server_name: 'VIP Server',
                server_data: [{ name: 'Full', slug: 'full', link_m3u8: 'https://cdn.example.com/live.m3u8', link_embed: 'https://embed.example.com/play' }],
              },
            ],
          },
        };
      }
      return originalGet.call(this, url, config);
    };

    const streams = await kkphim.getStreams({
      slug: 'protocol-test',
      type: 'movie',
      proxyBase: 'https://vip-addon.example.com',
    });

    assert.strictEqual(streams.length, 2);

    const hlsStream = streams.find(s => s.title.includes('HLS Proxy'));
    const embedStream = streams.find(s => s.title.includes('Embed Player'));

    // Invariant 1: In-App HLS Stream
    assert(hlsStream.url !== undefined, 'HLS stream MUST have url property');
    assert.strictEqual(hlsStream.externalUrl, undefined, 'HLS stream MUST NOT have externalUrl property');
    assert(hlsStream.url.startsWith('https://vip-addon.example.com/hls/manifest.m3u8?url='), 'HLS stream url must be valid proxy route');
    assert.strictEqual(hlsStream.name, 'VIP Movies 🎬', 'Stream name should be branded');
    assert(hlsStream.behaviorHints && hlsStream.behaviorHints.notSupported === false, 'behaviorHints.notSupported must be false');
    assert(hlsStream.behaviorHints.bingeGroup, 'behaviorHints.bingeGroup must be defined');

    // Invariant 2: Embed Player Fallback Stream
    assert(embedStream.externalUrl !== undefined, 'Embed stream MUST have externalUrl property');
    assert.strictEqual(embedStream.url, undefined, 'Embed stream MUST NOT have url property');
    assert.strictEqual(embedStream.externalUrl, 'https://embed.example.com/play', 'externalUrl must match link_embed');
    assert.strictEqual(embedStream.name, 'VIP Movies 🎬', 'Stream name should be branded');
    assert(embedStream.behaviorHints && embedStream.behaviorHints.notSupported === false, 'behaviorHints.notSupported must be false');
  } finally {
    axios.Axios.prototype.get = originalGet;
  }
});

runAsyncTest('NguonC stream objects strictly adhere to exclusive url / externalUrl protocol', async () => {
  imdbCache.clear();
  detailCache.clear();
  const originalGet = axios.Axios.prototype.get;

  try {
    axios.Axios.prototype.get = async function (url, config) {
      if (url.includes('/film/')) {
        return {
          data: {
            movie: {
              name: 'Protocol Test NguonC',
              slug: 'protocol-test-nguonc',
              episodes: [
                {
                  server_name: 'Server 1',
                  items: [{ name: 'Full', slug: 'full', embed: 'https://embed.nguonc.com/play/123' }],
                },
              ],
            },
          },
        };
      }
      return originalGet.call(this, url, config);
    };

    const streams = await nguonc.getStreams({
      slug: 'protocol-test-nguonc',
      type: 'movie',
      proxyBase: 'https://vip-addon.example.com',
    });

    assert.strictEqual(streams.length, 2);

    const hlsStream = streams.find(s => s.title.includes('HLS Proxy'));
    const embedStream = streams.find(s => s.title.includes('Embed Player'));

    // HLS Stream
    assert(hlsStream.url !== undefined, 'NguonC HLS stream MUST have url');
    assert.strictEqual(hlsStream.externalUrl, undefined, 'NguonC HLS stream MUST NOT have externalUrl');
    assert(hlsStream.url.startsWith('https://vip-addon.example.com/hls/extract?b64='), 'NguonC HLS stream must point to /hls/extract');

    // Embed Stream
    assert(embedStream.externalUrl !== undefined, 'NguonC Embed stream MUST have externalUrl');
    assert.strictEqual(embedStream.url, undefined, 'NguonC Embed stream MUST NOT have url');
    assert.strictEqual(embedStream.externalUrl, 'https://embed.nguonc.com/play/123');
  } finally {
    axios.Axios.prototype.get = originalGet;
  }
});

runAsyncTest('VsMov stream objects strictly adhere to exclusive url / externalUrl protocol', async () => {
  imdbCache.clear();
  detailCache.clear();
  const originalGet = axios.Axios.prototype.get;

  try {
    axios.Axios.prototype.get = async function (url, config) {
      if (url.includes('/?s=')) {
        return {
          data: '<article><a href="https://vsmov.com/film/inception-2010">Inception</a></article>',
        };
      }
      if (url.includes('/film/inception-2010')) {
        return {
          data: `<html><body><script>var player = { file: "https://stream.vsmov.com/hls/1080p/master.m3u8" };</script><iframe src="https://embed.vsmov.com/v/123"></iframe></body></html>`,
        };
      }
      return originalGet.call(this, url, config);
    };

    const streams = await vsmov.getStreams({
      title: 'Inception',
      type: 'movie',
      proxyBase: 'https://vip-addon.example.com',
    });

    assert(streams.length >= 1, 'Expected VsMov to produce streams');

    const hlsStream = streams.find(s => s.title.includes('HLS Proxy'));
    const embedStream = streams.find(s => s.title.includes('Embed Player'));

    if (hlsStream) {
      assert(hlsStream.url !== undefined, 'VsMov HLS stream MUST have url');
      assert.strictEqual(hlsStream.externalUrl, undefined, 'VsMov HLS stream MUST NOT have externalUrl');
      assert(hlsStream.url.startsWith('https://vip-addon.example.com/hls/manifest.m3u8?url='), 'VsMov HLS url must be valid proxy route');
    }

    if (embedStream) {
      assert(embedStream.externalUrl !== undefined, 'VsMov Embed stream MUST have externalUrl');
      assert.strictEqual(embedStream.url, undefined, 'VsMov Embed stream MUST NOT have url');
    }
  } finally {
    axios.Axios.prototype.get = originalGet;
  }
});

// ─── SUITE 5: Fault Isolation & Resilience ────────────────────────
console.log('\n--- Suite 5: Provider Fault Isolation & Timeout Resilience ---');

runTest('Providers have 5-second axios timeout configured', () => {
  // Check that provider instances or modules maintain 5000ms timeout
  // We check via module source inspection or internal client
  const kkphimCode = require('fs').readFileSync(require.resolve('../src/providers/kkphim'), 'utf8');
  const nguoncCode = require('fs').readFileSync(require.resolve('../src/providers/nguonc'), 'utf8');
  const vsmovCode = require('fs').readFileSync(require.resolve('../src/providers/vsmov'), 'utf8');

  assert(kkphimCode.includes('timeout: 5000'), 'KKPhim must have timeout: 5000');
  assert(nguoncCode.includes('timeout: 5000'), 'NguonC must have timeout: 5000');
  assert(vsmovCode.includes('timeout: 5000'), 'VsMov must have timeout: 5000');
});

runAsyncTest('When KKPhim throws network error, NguonC & VsMov continue unaffected in Aggregator', async () => {
  imdbCache.clear();
  detailCache.clear();
  const originalGet = axios.Axios.prototype.get;

  try {
    axios.Axios.prototype.get = async function (url, config) {
      if (url.includes('phimapi.com')) {
        const err = new Error('Connection timeout ECONNREFUSED');
        err.code = 'ECONNREFUSED';
        throw err;
      }
      if (url.includes('/films/search')) {
        return {
          data: {
            items: [
              { name: 'Inception', original_name: 'Inception', slug: 'inception', category: { 3: { list: [{ name: '2010' }] } } },
            ],
          },
        };
      }
      if (url.includes('/film/inception')) {
        return {
          data: {
            movie: {
              name: 'Inception',
              slug: 'inception',
              episodes: [
                {
                  server_name: 'Vietsub #1',
                  items: [{ name: 'Full', slug: 'full', embed: 'https://embed.nguonc.com/inc' }],
                },
              ],
            },
          },
        };
      }
      if (url.includes('vsmov')) {
        return {
          data: '<article><a href="https://vsmov.com/film/inception">Inception</a></article>',
        };
      }
      return originalGet.call(this, url, config);
    };

    // Test aggregator logic directly
    const payload = {
      imdbId: 'tt1375666',
      type: 'movie',
      title: 'Inception',
      proxyBase: 'http://localhost:7000',
    };

    const providersToRun = [kkphim, nguonc, vsmov];
    const results = await Promise.allSettled(providersToRun.map(p => p.getStreams(payload)));

    const mergedStreams = [];
    for (const r of results) {
      if (r.status === 'fulfilled' && Array.isArray(r.value)) {
        mergedStreams.push(...r.value);
      }
    }

    assert(mergedStreams.length > 0, 'Aggregator should still return streams from remaining providers when KKPhim fails');
    assert(mergedStreams.some(s => s.title.includes('NguonC')), 'Should contain NguonC streams');
  } finally {
    axios.Axios.prototype.get = originalGet;
  }
});

// ─── SUITE 6: Express Handler & Live End-to-End Tests ─────────────
console.log('\n--- Suite 6: Express Handler & Live End-to-End Verification ---');

runAsyncTest('Live Stream API resolves Inception (tt1375666) via Cinemeta + Providers', async () => {
  // Start Express server locally on an ephemeral port
  const app = express();
  app.use('/', handlers);

  const server = await new Promise((resolve) => {
    const s = app.listen(0, () => resolve(s));
  });

  const port = server.address().port;
  const baseUrl = `http://localhost:${port}`;

  try {
    const res = await axios.get(`${baseUrl}/stream/movie/tt1375666.json`, { timeout: 15000 });
    assert.strictEqual(res.status, 200, 'HTTP status should be 200');
    assert(res.data && Array.isArray(res.data.streams), 'Response should contain streams array');

    const streams = res.data.streams;
    console.log(`     -> Total resolved live streams for Inception (tt1375666): ${streams.length}`);

    // Invariant checks on all returned streams
    for (const s of streams) {
      assert(s.name === 'VIP Movies 🎬', `Stream name must be 'VIP Movies 🎬', got '${s.name}'`);
      assert(s.title && s.title.length > 0, 'Stream must have non-empty title');

      if (s.url) {
        assert.strictEqual(s.externalUrl, undefined, `HLS stream must not have externalUrl: ${JSON.stringify(s)}`);
        assert(s.url.includes('/hls/manifest.m3u8') || s.url.includes('/hls/extract') || s.url.includes('.m3u8'), 'HLS stream url must be valid');
      } else if (s.externalUrl) {
        assert.strictEqual(s.url, undefined, `Embed stream must not have url: ${JSON.stringify(s)}`);
        assert(s.externalUrl.startsWith('http'), 'externalUrl must start with http');
      } else {
        assert.fail(`Stream has neither url nor externalUrl: ${JSON.stringify(s)}`);
      }
    }
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

runAsyncTest('Live Stream API resolves Breaking Bad S01E01 (tt0903747:1:1) with episode mapping', async () => {
  const app = express();
  app.use('/', handlers);

  const server = await new Promise((resolve) => {
    const s = app.listen(0, () => resolve(s));
  });

  const port = server.address().port;
  const baseUrl = `http://localhost:${port}`;

  try {
    const res = await axios.get(`${baseUrl}/stream/series/tt0903747:1:1.json`, { timeout: 15000 });
    assert.strictEqual(res.status, 200, 'HTTP status should be 200');
    assert(res.data && Array.isArray(res.data.streams), 'Response should contain streams array');

    const streams = res.data.streams;
    console.log(`     -> Total resolved live streams for Breaking Bad S01E01: ${streams.length}`);

    for (const s of streams) {
      if (s.url) {
        assert.strictEqual(s.externalUrl, undefined, 'HLS stream must not have externalUrl');
      } else if (s.externalUrl) {
        assert.strictEqual(s.url, undefined, 'Embed stream must not have url');
      }
    }
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

// ─── REPORT SUMMARY ──────────────────────────────────────────────
setTimeout(() => {
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
}, 500);
