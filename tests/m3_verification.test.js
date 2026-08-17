'use strict';

/**
 * ============================================================
 *  Milestone 3 Comprehensive Verification Test Suite
 *  Tests all M3 deliverables and invariants without external network dependencies.
 * ============================================================
 */

const assert = require('assert');
const mapper = require('../src/mapper');
const { DEFAULT_CONFIG, VALID_PROVIDERS, encodeConfig, decodeConfig, isConfigToken, getDefaultToken } = require('../src/config');
const { resolveCinemeta, getCachedCinemeta, cinemetaCache } = require('../src/lib/cinemeta');
const { imdbCache, detailCache, catalogCache } = require('../src/lib/cache');
const { MANIFEST, buildManifest } = require('../src/manifest');
const packageJson = require('../package.json');
const kkphim = require('../src/providers/kkphim');
const nguonc = require('../src/providers/nguonc');
const vsmov = require('../src/providers/vsmov');
const handlers = require('../src/handlers');
const express = require('express');

let passed = 0;
let failed = 0;

function check(desc, fn) {
  try {
    fn();
    console.log(`  ✅ PASS: ${desc}`);
    passed++;
  } catch (err) {
    console.error(`  ❌ FAIL: ${desc}`);
    console.error(`     Error: ${err.message}`);
    failed++;
  }
}

async function asyncCheck(desc, fn) {
  try {
    await fn();
    console.log(`  ✅ PASS: ${desc}`);
    passed++;
  } catch (err) {
    console.error(`  ❌ FAIL: ${desc}`);
    console.error(`     Error: ${err.message}`);
    failed++;
  }
}

async function runM3Verification() {
  console.log('\n╔══════════════════════════════════════════════════════════════╗');
  console.log('║      MILESTONE 3 STREAM STANDARDIZATION & AGGREGATION        ║');
  console.log('╚══════════════════════════════════════════════════════════════╝\n');

  // ── 1. src/mapper.js Helper Functions & Exports ──────────────────
  console.log('--- 1. src/mapper.js Functions & Exports ---');

  const requiredExports = [
    'extractYear',
    'unpackDeanEdwards',
    'cleanTitle',
    'toSlug',
    'extractSeasonEpisode',
    'isM3u8Url',
    'normalizeServerName',
    'encodeBase64',
    'decodeBase64',
    'makeId',
    'extractSlug',
    'detectType',
    'findCategoryGroup',
    'extractGenres',
    'extractCountry',
    'mapCatalogItem',
    'mapDetailMeta',
    'buildStreams',
    'extractM3u8FromEmbed',
    'parseStreamId',
    'formatEpisodeTitle',
    'buildVideos',
    'scoreSimilarity',
  ];

  for (const exp of requiredExports) {
    check(`mapper exports '${exp}' as a function`, () => {
      assert.strictEqual(typeof mapper[exp], 'function', `'${exp}' must be an exported function`);
    });
  }

  check('extractYear handles various input formats', () => {
    assert.strictEqual(mapper.extractYear(2010), 2010);
    assert.strictEqual(mapper.extractYear('2010'), 2010);
    assert.strictEqual(mapper.extractYear('Inception (2010)'), 2010);
    assert.strictEqual(mapper.extractYear('Breaking Bad (2008–2013)'), 2008);
    assert.strictEqual(mapper.extractYear({ 3: { group: { name: 'Năm' }, list: [{ name: '2002' }] } }), 2002);
    assert.strictEqual(mapper.extractYear({ year: 2024 }), 2024);
    assert.strictEqual(mapper.extractYear({ name: 'Film 1999' }), 1999);
    assert.strictEqual(mapper.extractYear(null), null);
    assert.strictEqual(mapper.extractYear('No Year Here'), null);
    assert.strictEqual(mapper.extractYear(123), null); // Out of 1800-2100 range
  });

  check('cleanTitle removes years, brackets, and cleans delimiters', () => {
    assert.strictEqual(mapper.cleanTitle('Inception (2010) [1080p]'), 'Inception');
    assert.strictEqual(mapper.cleanTitle('Spider-Man: Homecoming_2017'), 'Spider Man Homecoming');
  });

  check('toSlug converts Vietnamese string to URL-safe slug', () => {
    assert.strictEqual(mapper.toSlug('Tà Đạo Thành Thần'), 'ta-dao-thanh-than');
    assert.strictEqual(mapper.toSlug('Người Đàn Ông Thép (2013)'), 'nguoi-dan-ong-thep-2013');
  });

  check('extractSeasonEpisode parses S01E02 and Tap 1 variations', () => {
    assert.deepStrictEqual(mapper.extractSeasonEpisode('S02E05'), { season: 2, episode: 5 });
    assert.deepStrictEqual(mapper.extractSeasonEpisode('Season 3 Episode 12'), { season: 3, episode: 12 });
    assert.deepStrictEqual(mapper.extractSeasonEpisode('Tập 08'), { season: 1, episode: 8 });
    assert.deepStrictEqual(mapper.extractSeasonEpisode('Ep 14'), { season: 1, episode: 14 });
    assert.deepStrictEqual(mapper.extractSeasonEpisode(''), { season: null, episode: null });
  });

  check('isM3u8Url correctly detects HLS URLs', () => {
    assert.strictEqual(mapper.isM3u8Url('https://example.com/live/master.m3u8'), true);
    assert.strictEqual(mapper.isM3u8Url('https://example.com/hls/segment'), true);
    assert.strictEqual(mapper.isM3u8Url('https://example.com/playlist/test'), true);
    assert.strictEqual(mapper.isM3u8Url('https://example.com/video.mp4'), false);
  });

  check('normalizeServerName strips # and cleans whitespace', () => {
    assert.strictEqual(mapper.normalizeServerName('Vietsub #1'), 'Vietsub 1');
    assert.strictEqual(mapper.normalizeServerName('Server  #2 - VIP'), 'Server 2 - VIP');
    assert.strictEqual(mapper.normalizeServerName(null), 'Server 1');
  });

  check('encodeBase64 & decodeBase64 are mutually invertible', () => {
    const original = 'https://phim.nguonc.com/embed/test?v=1&lang=vi';
    const encoded = mapper.encodeBase64(original);
    const decoded = mapper.decodeBase64(encoded);
    assert.strictEqual(decoded, original);
  });

  check('unpackDeanEdwards safely decodes packed script', () => {
    const packed = `eval(function(p,a,c,k,e,d){e=function(c){return c};if(!''.replace(/^/,String)){while(c--){d[c]=k[c]||c}k=[function(e){return d[e]}];e=function(){return'\\\\w+'};c=1};while(c--){if(k[c]){p=p.replace(new RegExp('\\\\b'+e(c)+'\\\\b','g'),k[c])}}return p}('0.1("2");',3,3,'console|log|hello'.split('|')))`;
    const unpacked = mapper.unpackDeanEdwards(packed);
    assert(unpacked && unpacked.includes('console.log("hello")'), `Unpacked result: ${unpacked}`);
    assert.strictEqual(mapper.unpackDeanEdwards('not packed js'), null);
    assert.strictEqual(mapper.unpackDeanEdwards(null), null);
  });

  // ── 2. src/config.js Configuration Engine ────────────────────────
  console.log('\n--- 2. src/config.js Configuration Engine ---');

  check('DEFAULT_CONFIG.providers activates all providers', () => {
    assert.deepStrictEqual(DEFAULT_CONFIG.providers, ['vsmov', 'kkphim', 'nguonc', 'stp', 'hh3d', 'yan', 'clbpx']);
  });

  check('encodeConfig & decodeConfig preserve provider choices and defaults', () => {
    const encoded = encodeConfig({ providers: ['kkphim'], categories: ['movie'] });
    const decoded = decodeConfig(encoded);
    assert.deepStrictEqual(decoded.providers, ['kkphim']);
    assert.deepStrictEqual(decoded.categories, ['movie']);

    // Malformed token fallback
    const fallback = decodeConfig('invalid-base64!@#$');
    assert.deepStrictEqual(fallback.providers, ['vsmov', 'kkphim', 'nguonc', 'stp', 'hh3d', 'yan', 'clbpx']);
  });

  // ── 3. src/lib/cinemeta.js Normalization & Caching ─────────────────
  console.log('\n--- 3. src/lib/cinemeta.js Normalization & Caching ---');

  await asyncCheck('resolveCinemeta normalizes uppercase IDs and caches 24h', async () => {
    cinemetaCache.clear();
    // Prime cache with lowercased key
    cinemetaCache.set('cinemeta:movie:tt1375666', {
      imdbId: 'tt1375666',
      type: 'movie',
      name: 'Inception',
      year: 2010,
      genres: ['Action', 'Adventure'],
      aliases: [],
    }, 86400);

    // Call with uppercase TT1375666
    const resUpper = await resolveCinemeta('movie', 'TT1375666');
    assert(resUpper !== null, 'Uppercase TT1375666 must resolve via normalized cache');
    assert.strictEqual(resUpper.imdbId, 'tt1375666');
    assert.strictEqual(resUpper.name, 'Inception');
    assert.strictEqual(resUpper.year, 2010);

    // Sync lookup
    const syncUpper = getCachedCinemeta('movie', 'TT1375666:1:1');
    assert(syncUpper !== null, 'getCachedCinemeta must resolve uppercase TT1375666:1:1');
    assert.strictEqual(syncUpper.name, 'Inception');

    // Invalid non-IMDb ID rejection
    assert.strictEqual(await resolveCinemeta('movie', 'nguonc:slug'), null);
    assert.strictEqual(await resolveCinemeta('movie', 'ttABC'), null);
    assert.strictEqual(await resolveCinemeta('movie', '12345'), null);
  });

  // ── 4. Versioning in package.json and src/manifest.js ─────────────
  console.log('\n--- 4. Versioning ---');

  check('package.json version is 1.5.0', () => {
    assert.strictEqual(packageJson.version, '1.5.0');
  });

  check('src/manifest.js version is 1.5.0', () => {
    assert.strictEqual(MANIFEST.version, '1.5.0');
  });

  // ── 5. src/handlers.js Stream Aggregator & R3 Protocol ───────────
  console.log('\n--- 5. src/handlers.js Stream Aggregator & Protocol Standardization ---');

  const streamRouteLayer = handlers.stack.find((l) => l.route && l.route.path === '/stream/:type/:id.json');
  check('Stream aggregator route is registered', () => {
    assert(streamRouteLayer !== undefined, 'Route /stream/:type/:id.json must be registered in handlers router');
  });

  await asyncCheck('Stream aggregator enforces R3 protocol exclusivity and aggregates multiple providers', async () => {
    const streamHandler = streamRouteLayer.route.stack[0].handle;

    // Seed mock details in caches for Inception
    cinemetaCache.set('cinemeta:movie:tt1375666', {
      imdbId: 'tt1375666',
      type: 'movie',
      name: 'Inception',
      year: 2010,
      genres: ['Action'],
      aliases: [],
    }, 86400);

    imdbCache.set('kkphim:imdb:tt1375666', {
      movie: { name: 'Inception', slug: 'inception', year: 2010, type: 'single' },
      episodes: [
        {
          server_name: 'Vietsub #1',
          server_data: [{ name: 'Full', slug: 'full', link_m3u8: 'https://cdn.example.com/kk-inc.m3u8', link_embed: 'https://embed.example.com/kk-inc' }],
        },
      ],
    }, 86400);

    imdbCache.set('nguonc:imdb:tt1375666', 'ke-danh-cap-giac-mo', 86400);
    detailCache.set('nguonc:detail:ke-danh-cap-giac-mo', {
      movie: {
        name: 'Kẻ Đánh Cắp Giấc Mơ',
        original_name: 'Inception',
        slug: 'ke-danh-cap-giac-mo',
        episodes: [
          {
            server_name: 'Server #1 - Vietsub',
            items: [{ name: 'Full', slug: 'full', embed: 'https://embed.nguonc.com/inc' }],
          },
        ],
      },
    }, 86400);

    const mockReq = {
      params: { type: 'movie', id: 'tt1375666' },
      query: {},
      addonConfig: { providers: ['nguonc', 'kkphim', 'vsmov'], categories: ['movie', 'series'] },
      protocol: 'http',
      headers: { host: 'localhost:7000' },
      get: (h) => (h === 'host' ? 'localhost:7000' : undefined),
    };

    let responseData = null;
    let statusCode = 200;
    const mockRes = {
      setHeader: () => {},
      status: (code) => { statusCode = code; return mockRes; },
      json: (data) => { responseData = data; return mockRes; },
    };

    await streamHandler(mockReq, mockRes);

    assert.strictEqual(statusCode, 200);
    assert(responseData && Array.isArray(responseData.streams), 'Response must contain streams array');
    assert(responseData.streams.length >= 2, `Expected >= 2 streams, got ${responseData.streams.length}`);

    // Verify R3 Protocol for every aggregated stream
    for (let i = 0; i < responseData.streams.length; i++) {
      const s = responseData.streams[i];
      assert.strictEqual(s.name, 'VIP Movies 🎬', `Stream #${i + 1} name branding`);
      assert(!s.title.includes('#'), `Stream #${i + 1} title must not contain '#': "${s.title}"`);

      if (s.url) {
        assert.strictEqual(s.externalUrl, undefined, `Stream #${i + 1} is HLS Proxy: externalUrl MUST be undefined`);
        assert(s.url.startsWith('http://localhost:7000/hls/'), `Stream #${i + 1} url must point to proxy route`);
      } else if (s.externalUrl) {
        assert.strictEqual(s.url, undefined, `Stream #${i + 1} is Embed Player: url MUST be undefined`);
        assert(s.externalUrl.startsWith('http'), `Stream #${i + 1} externalUrl must be valid URL`);
      } else {
        assert.fail(`Stream #${i + 1} has neither url nor externalUrl`);
      }

      assert(s.behaviorHints && s.behaviorHints.notSupported === false, `Stream #${i + 1} behaviorHints.notSupported must be false`);
      assert(typeof s.behaviorHints.bingeGroup === 'string', `Stream #${i + 1} behaviorHints.bingeGroup must be string`);
    }
  });

  await asyncCheck('Stream aggregator isolates provider error and does not throw', async () => {
    const streamHandler = streamRouteLayer.route.stack[0].handle;

    const mockReq = {
      params: { type: 'movie', id: 'tt0000000_failing' },
      query: {},
      addonConfig: { providers: ['nguonc', 'kkphim', 'vsmov'] },
      protocol: 'http',
      headers: { host: 'localhost:7000' },
      get: (h) => (h === 'host' ? 'localhost:7000' : undefined),
    };

    let responseData = null;
    let statusCode = 200;
    const mockRes = {
      setHeader: () => {},
      status: (code) => { statusCode = code; return mockRes; },
      json: (data) => { responseData = data; return mockRes; },
    };

    await streamHandler(mockReq, mockRes);
    assert.strictEqual(statusCode, 200);
    assert(responseData && Array.isArray(responseData.streams) && responseData.streams.length === 0, 'Unknown ID returns { streams: [] } with HTTP 200');
  });

  console.log('\n══════════════════════════════════════════════════════════════');
  console.log(`🏁 M3 VERIFICATION SUMMARY: ${passed} PASSED, ${failed} FAILED`);
  console.log('══════════════════════════════════════════════════════════════\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runM3Verification().catch((err) => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
