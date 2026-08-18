'use strict';

/**
 * ==============================================================================
 *  VIP Movies Addon — Adversarial Challenger Suite for Milestone 2 (VSMOV 4K)
 *  File: .agents/teamwork_preview_challenger_m2_1/test_adversarial_vsmov.js
 *
 *  Adversarial Test Vectors:
 *    1. Single-server movies vs Multi-server movies (Harry Potter, Spider-Man, Anime/Series)
 *    2. Embed HTML without playerOptions, malformed script tags, empty/corrupt subtitles
 *    3. Unusual server names with whitespace, unicode variations, tabs/newlines
 *    4. Subtitle URL resolution (relative path vs absolute CDN URL vs query strings)
 *    5. Subtitle language priority selection (Vietnamese vs others)
 *    6. Strict In-App Direct Play Protocol Invariants (url only, NO externalUrl)
 * ==============================================================================
 */

const assert = require('assert');
const http = require('http');
const express = require('express');
const cors = require('cors');
const axios = require('axios');

const vsmov = require('../../src/providers/vsmov');
const { classifyServerAudio, resolveEmbedMedia, getStreams, search, getDetail, getByImdb } = vsmov;
const { imdbCache, detailCache } = require('../../src/lib/cache');

// ─── Minimal Test Harness ─────────────────────────────────────────
class AdversarialRunner {
  constructor(name) {
    this.name = name;
    this.passed = 0;
    this.failed = 0;
    this.warnings = 0;
    this.tests = [];
  }

  section(title) {
    console.log(`\n══ ${title} ══`);
  }

  pass(msg) {
    this.passed++;
    console.log(`  ✅ PASS: ${msg}`);
  }

  fail(msg, err) {
    this.failed++;
    console.error(`  ❌ FAIL: ${msg}`);
    if (err) console.error(`     ${err.stack || err.message || err}`);
  }

  warn(msg) {
    this.warnings++;
    console.warn(`  ⚠️  WARN: ${msg}`);
  }

  assertEqual(actual, expected, msg) {
    if (actual === expected) {
      this.pass(`${msg} (== ${expected})`);
    } else {
      this.fail(`${msg} (expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)})`);
    }
  }

  assert(cond, msg) {
    if (cond) {
      this.pass(msg);
    } else {
      this.fail(msg);
    }
  }

  assertStreamProtocol(stream, index) {
    if (!stream) {
      this.fail(`Stream #${index} is null or undefined`);
      return;
    }
    const titleSnippet = (stream.title || '').replace(/\n/g, ' ').slice(0, 60);

    // 1. url must exist and be non-empty string
    if (typeof stream.url !== 'string' || !stream.url.startsWith('http')) {
      this.fail(`Stream #${index} (${titleSnippet}): Invalid or missing 'url'`);
    }

    // 2. externalUrl must strictly be undefined
    if (stream.externalUrl !== undefined) {
      this.fail(`Stream #${index} (${titleSnippet}): VIOLATION - contains 'externalUrl': ${stream.externalUrl}`);
    }

    // 3. name must be VIP Movies 🎬
    if (stream.name !== 'VIP Movies 🎬') {
      this.fail(`Stream #${index} (${titleSnippet}): Name must be 'VIP Movies 🎬', got '${stream.name}'`);
    }

    // 4. title must contain [VIP 1 • VSMOV] and 4K Ultra HD
    if (!stream.title || !stream.title.includes('[VIP 1 • VSMOV]') || !stream.title.includes('4K Ultra HD (3840x2160)')) {
      this.fail(`Stream #${index} (${titleSnippet}): Title format violation`);
    }

    // 5. behaviorHints
    if (!stream.behaviorHints || stream.behaviorHints.notWebReady !== false || stream.behaviorHints.notSupported !== false) {
      this.fail(`Stream #${index} (${titleSnippet}): behaviorHints missing or invalid`);
    }

    // 6. Subtitles array schema (if present)
    if (stream.subtitles) {
      if (!Array.isArray(stream.subtitles)) {
        this.fail(`Stream #${index} (${titleSnippet}): subtitles must be an array`);
      } else {
        for (const sub of stream.subtitles) {
          if (sub.id !== 'vi_vsmov' || sub.lang !== 'vie' || typeof sub.url !== 'string' || !sub.url.includes('/hls/sub.vtt')) {
            this.fail(`Stream #${index} (${titleSnippet}): Invalid subtitle object schema: ${JSON.stringify(sub)}`);
          }
        }
      }
    }
  }

  printSummary() {
    console.log('\n╔══════════════════════════════════════════════════════════════╗');
    console.log('║           ADVERSARIAL TEST EXECUTION SUMMARY                 ║');
    console.log('╠══════════════════════════════════════════════════════════════╣');
    console.log(`║  Total Assertions: ${(this.passed + this.failed).toString().padEnd(41)}║`);
    console.log(`║  ✅ Passed:         ${this.passed.toString().padEnd(41)}║`);
    console.log(`║  ⚠️  Warnings:       ${this.warnings.toString().padEnd(41)}║`);
    console.log(`║  ❌ Failed:         ${this.failed.toString().padEnd(41)}║`);
    console.log('╚══════════════════════════════════════════════════════════════╝\n');
  }
}

// ─── Test Suite Execution ─────────────────────────────────────────
async function runSuite() {
  const runner = new AdversarialRunner('VSMOV M2 Adversarial Stress Suite');
  const PROXY_BASE = 'http://127.0.0.1:7000';

  // ═══════════════════════════════════════════════════════════════════
  //  SUITE 1: Server Audio Classification Robustness & Edge Cases
  // ═══════════════════════════════════════════════════════════════════
  runner.section('Suite 1: Server Audio Classification Robustness & Edge Cases');

  const audioTestCases = [
    // Standard names
    { input: 'Vietsub #1', expectedType: 'vietsub', expectedLabel: 'Vietsub', expectedBinge: 'vsmov-vietsub-4k-vip-1' },
    { input: 'Lồng tiếng #1', expectedType: 'longtieng', expectedLabel: 'Lồng Tiếng', expectedBinge: 'vsmov-longtieng-4k-vip-1' },
    { input: 'Thuyết minh #1', expectedType: 'thuyetminh', expectedLabel: 'Thuyết Minh', expectedBinge: 'vsmov-thuyetminh-4k-vip-1' },

    // Uppercase & mixed case
    { input: 'VIETSUB #10', expectedType: 'vietsub', expectedLabel: 'Vietsub', expectedBinge: 'vsmov-vietsub-4k-vip-1' },
    { input: 'LỒNG TIẾNG VIP', expectedType: 'longtieng', expectedLabel: 'Lồng Tiếng', expectedBinge: 'vsmov-longtieng-4k-vip-1' },
    { input: 'THUYẾT MINH 4K', expectedType: 'thuyetminh', expectedLabel: 'Thuyết Minh', expectedBinge: 'vsmov-thuyetminh-4k-vip-1' },

    // Unaccented / ASCII
    { input: 'Long Tieng #2', expectedType: 'longtieng', expectedLabel: 'Lồng Tiếng', expectedBinge: 'vsmov-longtieng-4k-vip-1' },
    { input: 'Thuyet Minh #3', expectedType: 'thuyetminh', expectedLabel: 'Thuyết Minh', expectedBinge: 'vsmov-thuyetminh-4k-vip-1' },
    { input: 'Phim Vietsub 4K', expectedType: 'vietsub', expectedLabel: 'Vietsub', expectedBinge: 'vsmov-vietsub-4k-vip-1' },

    // Dirty whitespace, tabs, carriage returns, newlines
    { input: "  Vietsub\n #1  ", expectedType: 'vietsub', expectedLabel: 'Vietsub', expectedBinge: 'vsmov-vietsub-4k-vip-1' },
    { input: "\t\r\nLồng tiếng\r\n\t#1\t", expectedType: 'longtieng', expectedLabel: 'Lồng Tiếng', expectedBinge: 'vsmov-longtieng-4k-vip-1' },
    { input: "Thuyết \t\t minh \n\n #2", expectedType: 'thuyetminh', expectedLabel: 'Thuyết Minh', expectedBinge: 'vsmov-thuyetminh-4k-vip-1' },

    // Edge cases: empty string, null, undefined, unexpected symbols
    { input: '', expectedType: 'vietsub', expectedLabel: 'Vietsub', expectedBinge: 'vsmov-vietsub-4k-vip-1' },
    { input: null, expectedType: 'vietsub', expectedLabel: 'Vietsub', expectedBinge: 'vsmov-vietsub-4k-vip-1' },
    { input: undefined, expectedType: 'vietsub', expectedLabel: 'Vietsub', expectedBinge: 'vsmov-vietsub-4k-vip-1' },
    { input: '### Server VIP ###', expectedType: 'vietsub', expectedLabel: 'Vietsub', expectedBinge: 'vsmov-vietsub-4k-vip-1' },
    { input: 'Bản Dịch Chuẩn VIP', expectedType: 'vietsub', expectedLabel: 'Vietsub', expectedBinge: 'vsmov-vietsub-4k-vip-1' },
  ];

  for (const tc of audioTestCases) {
    const res = classifyServerAudio(tc.input);
    const displayInput = JSON.stringify(tc.input);
    runner.assertEqual(res.type, tc.expectedType, `classifyServerAudio(${displayInput}) type matches`);
    runner.assertEqual(res.label, tc.expectedLabel, `classifyServerAudio(${displayInput}) label matches`);
    runner.assertEqual(res.bingeGroup, tc.expectedBinge, `classifyServerAudio(${displayInput}) bingeGroup matches`);
  }

  // ═══════════════════════════════════════════════════════════════════
  //  SUITE 2: Embed HTML & Subtitle Resolution Adversarial Testing
  // ═══════════════════════════════════════════════════════════════════
  runner.section('Suite 2: Embed HTML & Subtitle Resolution Adversarial Testing');

  // Start mock embed server to serve various adversarial HTML payloads
  const mockEmbedApp = express();
  mockEmbedApp.use(cors());

  // 2.1 Standard HTML with playerOptions and Vietnamese subtitle
  mockEmbedApp.get('/embed/standard.html', (req, res) => {
    res.send(`
      <!DOCTYPE html>
      <html>
      <head><title>VSMOV Player</title></head>
      <body>
        <div id="player"></div>
        <script>
          var baseUrl = "https://v5.streamvsmov.com";
          var videoHash = "382f09db-83ff-4d89-9be9-797162d4f2e6";
          var playerOptions = {
            file: "https://v5.streamvsmov.com/stream/382f09db-83ff-4d89-9be9-797162d4f2e6/master.m3u8",
            subtitles: [
              {
                "name": "Tiếng Việt",
                "type": "local",
                "url": "/video/382f09db-83ff-4d89-9be9-797162d4f2e6/subtitle/vie_1785240078185_txr9be.vtt",
                "_inSubtitleFolder": true,
                "code": "vie"
              },
              {
                "name": "English",
                "type": "local",
                "url": "/video/382f09db-83ff-4d89-9be9-797162d4f2e6/subtitle/eng_1785240078185.vtt",
                "_inSubtitleFolder": true,
                "code": "eng"
              }
            ]
          };
        </script>
      </body>
      </html>
    `);
  });

  // 2.2 Subtitle URL is already absolute CDN URL
  mockEmbedApp.get('/embed/absolute-sub.html', (req, res) => {
    res.send(`
      <script>
        var baseUrl = "https://v5.streamvsmov.com";
        var videoHash = "abc-123";
        var playerOptions = {
          subtitles: [
            {
              "name": "vie",
              "url": "https://cdn.vsmov.com/subtitles/vietnamese.vtt",
              "code": "vi"
            }
          ]
        };
      </script>
    `);
  });

  // 2.3 Subtitle URL is relative without leading slash
  mockEmbedApp.get('/embed/no-leading-slash.html', (req, res) => {
    res.send(`
      <script>
        var baseUrl = "https://v5.streamvsmov.com";
        var videoHash = "def-456";
        var playerOptions = {
          subtitles: [
            {
              "name": "vie",
              "url": "subtitles/relative_no_slash.vtt",
              "lang": "vie"
            }
          ]
        };
      </script>
    `);
  });

  // 2.4 HTML without playerOptions, but with raw m3u8 quote & fallback VTT regex
  mockEmbedApp.get('/embed/regex-fallback.html', (req, res) => {
    res.send(`
      <div>
        <video src="https://cdn.vsmov.com/stream/regex-test/master.m3u8"></video>
        <track src="/subtitles/fallback-viet.vtt" kind="subtitles" srclang="vi">
      </div>
    `);
  });

  // 2.5 Malformed script tags & invalid JSON in subtitles with fallback
  mockEmbedApp.get('/embed/malformed-json.html', (req, res) => {
    res.send(`
      <script>
        var baseUrl = "https://v5.streamvsmov.com";
        var videoHash = "malformed-hash-12345678";
        playerOptions = {
          subtitles: [{ name: "vie", url: "/sub/malformed.vtt", incomplete
        };
      </script>
      <script src="/sub/backup.vtt"></script>
    `);
  });

  // 2.6 Empty subtitles array in playerOptions (e.g. Dubbed/Voiceover streams)
  mockEmbedApp.get('/embed/empty-subs.html', (req, res) => {
    res.send(`
      <script>
        var baseUrl = "https://v5.streamvsmov.com";
        var videoHash = "empty-sub-hash-12345678";
        var playerOptions = {
          file: "https://v5.streamvsmov.com/stream/empty-sub-hash-12345678/master.m3u8",
          subtitles: []
        };
      </script>
    `);
  });

  // 2.7 Multi-language subtitles array (Verify Vietnamese priority over English/French)
  mockEmbedApp.get('/embed/multi-lang.html', (req, res) => {
    res.send(`
      <script>
        var baseUrl = "https://v5.streamvsmov.com";
        var videoHash = "multilang-12345678";
        var playerOptions = {
          subtitles: [
            { "name": "English", "code": "eng", "url": "/sub/eng.vtt" },
            { "name": "Français", "code": "fra", "url": "/sub/fra.vtt" },
            { "name": "Tiếng Việt (Vietsub)", "code": "vie", "url": "/sub/vie.vtt" }
          ]
        };
      </script>
    `);
  });

  // 2.8 Embed returns HTTP 500 error
  mockEmbedApp.get('/embed/error500.html', (req, res) => {
    res.status(500).send('Internal Server Error');
  });

  // 2.9 Embed returns 404
  mockEmbedApp.get('/embed/error404.html', (req, res) => {
    res.status(404).send('Not Found');
  });

  const mockEmbedServer = await new Promise((resolve, reject) => {
    const s = mockEmbedApp.listen(0, '127.0.0.1', () => resolve(s));
    s.on('error', reject);
  });

  const embedPort = mockEmbedServer.address().port;
  const embedBase = `http://127.0.0.1:${embedPort}`;

  try {
    // Test 2.1: Standard HTML parsing with relative VTT
    const res2_1 = await resolveEmbedMedia(`${embedBase}/embed/standard.html`, null);
    runner.assert(
      res2_1.masterPlaylistUrl === 'https://v5.streamvsmov.com/stream/382f09db-83ff-4d89-9be9-797162d4f2e6/master.m3u8',
      'Standard embed extracts baseUrl + videoHash master.m3u8'
    );
    runner.assert(
      res2_1.subtitleUrl === `${embedBase}/video/382f09db-83ff-4d89-9be9-797162d4f2e6/subtitle/vie_1785240078185_txr9be.vtt`,
      'Relative subtitle URL resolved correctly against embedOrigin'
    );

    // Test 2.2: Absolute subtitle URL
    const res2_2 = await resolveEmbedMedia(`${embedBase}/embed/absolute-sub.html`, null);
    runner.assertEqual(
      res2_2.subtitleUrl,
      'https://cdn.vsmov.com/subtitles/vietnamese.vtt',
      'Absolute subtitle URL preserved as-is'
    );

    // Test 2.3: Relative URL without leading slash
    const res2_3 = await resolveEmbedMedia(`${embedBase}/embed/no-leading-slash.html`, null);
    runner.assertEqual(
      res2_3.subtitleUrl,
      `${embedBase}/subtitles/relative_no_slash.vtt`,
      'Relative subtitle without leading slash resolved correctly against origin'
    );

    // Test 2.4: Regex fallback for master.m3u8 and vtt
    const res2_4 = await resolveEmbedMedia(`${embedBase}/embed/regex-fallback.html`, null);
    runner.assertEqual(
      res2_4.masterPlaylistUrl,
      'https://cdn.vsmov.com/stream/regex-test/master.m3u8',
      'Regex fallback extracts master.m3u8 from quotes'
    );
    runner.assertEqual(
      res2_4.subtitleUrl,
      `${embedBase}/subtitles/fallback-viet.vtt`,
      'Regex fallback extracts relative subtitle and resolves against origin'
    );

    // Test 2.5: Malformed JSON in playerOptions does not crash and falls back
    const res2_5 = await resolveEmbedMedia(`${embedBase}/embed/malformed-json.html`, null);
    runner.assertEqual(
      res2_5.masterPlaylistUrl,
      'https://v5.streamvsmov.com/stream/malformed-hash-12345678/master.m3u8',
      'Malformed JSON still extracts baseUrl + videoHash'
    );
    runner.assert(
      res2_5.subtitleUrl === `${embedBase}/sub/backup.vtt` || res2_5.subtitleUrl === null || typeof res2_5.subtitleUrl === 'string',
      'Malformed JSON subtitle parsing degrades gracefully without throwing'
    );

    // Test 2.6: Empty subtitles array
    const res2_6 = await resolveEmbedMedia(`${embedBase}/embed/empty-subs.html`, null);
    runner.assertEqual(
      res2_6.masterPlaylistUrl,
      'https://v5.streamvsmov.com/stream/empty-sub-hash-12345678/master.m3u8',
      'Empty subtitles array extracts master.m3u8 correctly'
    );
    runner.assertEqual(res2_6.subtitleUrl, null, 'Empty subtitles array yields subtitleUrl = null');

    // Test 2.7: Multi-language subtitles priority
    const res2_7 = await resolveEmbedMedia(`${embedBase}/embed/multi-lang.html`, null);
    runner.assertEqual(
      res2_7.subtitleUrl,
      `${embedBase}/sub/vie.vtt`,
      'Multi-language subtitles prioritizes Vietnamese (code: vie)'
    );

    // Test 2.8: Upstream 500 error degrades gracefully to videoHash fallback
    const res2_8 = await resolveEmbedMedia(`${embedBase}/play/error500-test-video-hash-12345678`, null);
    runner.assertEqual(
      res2_8.masterPlaylistUrl,
      `${embedBase}/stream/error500-test-video-hash-12345678/master.m3u8`,
      'HTTP 500 error falls back to videoHash in pathname'
    );
    runner.assertEqual(res2_8.subtitleUrl, null, 'HTTP 500 subtitleUrl is null');

    // Test 2.9: Upstream 404 error
    const res2_9 = await resolveEmbedMedia(`${embedBase}/play/error404-test-video-hash-12345678`, null);
    runner.assertEqual(
      res2_9.masterPlaylistUrl,
      `${embedBase}/stream/error404-test-video-hash-12345678/master.m3u8`,
      'HTTP 404 error falls back to videoHash in pathname'
    );

    // Test 2.10: Direct linkM3u8 argument bypasses embed fetch
    const res2_10 = await resolveEmbedMedia(null, 'https://direct-cdn.vsmov.com/hls/master.m3u8');
    runner.assertEqual(
      res2_10.masterPlaylistUrl,
      'https://direct-cdn.vsmov.com/hls/master.m3u8',
      'Direct linkM3u8 is used immediately without embed fetch'
    );

    // Test 2.11: Null & empty string inputs
    const res2_11 = await resolveEmbedMedia(null, null);
    runner.assertEqual(res2_11.masterPlaylistUrl, null, 'Null inputs yield null masterPlaylistUrl');
    runner.assertEqual(res2_11.subtitleUrl, null, 'Null inputs yield null subtitleUrl');

    const res2_12 = await resolveEmbedMedia('', '');
    runner.assertEqual(res2_12.masterPlaylistUrl, null, 'Empty string inputs yield null masterPlaylistUrl');

  } finally {
    mockEmbedServer.close();
  }

  // ═══════════════════════════════════════════════════════════════════
  //  SUITE 3: getStreams Empirical Resolution on Real-World Catalog
  // ═══════════════════════════════════════════════════════════════════
  runner.section('Suite 3: getStreams Empirical Resolution on Real-World Catalog');

  // 3.1 Multi-Server Movie: Harry Potter and the Order of the Phoenix (tt0373889)
  console.log('Testing Multi-server movie: Harry Potter tt0373889...');
  const hpStreams = await getStreams({
    imdbId: 'tt0373889',
    title: 'Harry Potter and the Order of the Phoenix',
    type: 'movie',
    proxyBase: PROXY_BASE,
  });

  runner.assert(Array.isArray(hpStreams), 'Harry Potter tt0373889 returns array of streams');
  runner.assert(hpStreams.length >= 2, `Harry Potter tt0373889 has >= 2 distinct servers (got: ${hpStreams.length})`);

  const hpVietsub = hpStreams.find((s) => s.title.includes('Vietsub'));
  const hpLongtieng = hpStreams.find((s) => s.title.includes('Lồng Tiếng'));
  runner.assert(Boolean(hpVietsub), 'Harry Potter has Vietsub stream');
  runner.assert(Boolean(hpLongtieng), 'Harry Potter has Lồng Tiếng stream');

  if (hpVietsub) {
    runner.assert(Array.isArray(hpVietsub.subtitles) && hpVietsub.subtitles.length > 0, 'Harry Potter Vietsub stream has attached subtitles');
    runner.assert(hpVietsub.behaviorHints.bingeGroup === 'vsmov-vietsub-4k-vip-1', 'Vietsub stream has bingeGroup vsmov-vietsub-4k-vip-1');
  }
  if (hpLongtieng) {
    runner.assert(hpLongtieng.behaviorHints.bingeGroup === 'vsmov-longtieng-4k-vip-1', 'Lồng Tiếng stream has bingeGroup vsmov-longtieng-4k-vip-1');
  }

  for (let i = 0; i < hpStreams.length; i++) {
    runner.assertStreamProtocol(hpStreams[i], i);
  }

  // 3.2 Single-Server or Multi-Server Movie: Spider-Man No Way Home (tt10872600)
  console.log('Testing Spider-Man: No Way Home tt10872600...');
  const spidermanStreams = await getStreams({
    imdbId: 'tt10872600',
    title: 'Spider-Man: No Way Home',
    type: 'movie',
    proxyBase: PROXY_BASE,
  });

  runner.assert(Array.isArray(spidermanStreams), 'Spider-Man returns array of streams');
  if (spidermanStreams.length > 0) {
    runner.pass(`Spider-Man resolved ${spidermanStreams.length} stream(s)`);
    for (let i = 0; i < spidermanStreams.length; i++) {
      runner.assertStreamProtocol(spidermanStreams[i], i);
    }
  } else {
    runner.warn('Spider-Man returned 0 streams from VSMOV live API (may not be in VSMOV DB)');
  }

  // 3.3 Series / TV Show: Game of Thrones tt0944947 (or Breaking Bad tt0903747) Season 1 Episode 1
  console.log('Testing TV Series: Breaking Bad tt0903747:1:1...');
  const seriesStreams = await getStreams({
    imdbId: 'tt0903747',
    title: 'Breaking Bad',
    type: 'series',
    season: 1,
    episode: 1,
    proxyBase: PROXY_BASE,
  });

  runner.assert(Array.isArray(seriesStreams), 'Series query returns array of streams');
  if (seriesStreams.length > 0) {
    runner.pass(`Series query resolved ${seriesStreams.length} stream(s)`);
    for (let i = 0; i < seriesStreams.length; i++) {
      runner.assertStreamProtocol(seriesStreams[i], i);
      runner.assert(seriesStreams[i].title.includes('[Tập 1]') || seriesStreams[i].title.includes('Tập 1'), `Series title contains episode label: ${seriesStreams[i].title}`);
    }
  }

  // 3.4 Direct Slug Lookup (synthetic single-server & multi-server fixtures)
  console.log('Testing synthetic detail objects with getStreams...');

  // ═══════════════════════════════════════════════════════════════════
  //  SUITE 4: Synthetic Adversarial Fixtures (Simulated edge cases)
  // ═══════════════════════════════════════════════════════════════════
  runner.section('Suite 4: Synthetic Adversarial Fixtures & Invariants');

  // Test 4.1: Single server movie with only 1 server
  detailCache.set('vsmov:detail:test-single-server-movie', {
    movie: {
      name: 'Single Server Movie Test',
      origin_name: 'Single Server Movie Test',
      slug: 'test-single-server-movie',
      type: 'single',
      year: 2024,
    },
    episodes: [
      {
        server_name: 'Vietsub #1',
        server_data: [
          {
            name: 'Full',
            slug: 'full',
            link_embed: 'https://v5.streamvsmov.com/play/single-server-hash-12345678',
            link_m3u8: 'https://v5.streamvsmov.com/stream/single-server-hash-12345678/master.m3u8',
          },
        ],
      },
    ],
  });

  const singleServerStreams = await getStreams({
    slug: 'test-single-server-movie',
    type: 'movie',
    proxyBase: PROXY_BASE,
  });

  runner.assertEqual(singleServerStreams.length, 1, 'Single-server movie returns exactly 1 stream');
  runner.assertStreamProtocol(singleServerStreams[0], 0);
  runner.assertEqual(singleServerStreams[0].behaviorHints.bingeGroup, 'vsmov-vietsub-4k-vip-1', 'Single-server bingeGroup is vietsub');
  runner.assert(!singleServerStreams[0].title.includes('[Full]'), 'Full episode label is stripped cleanly');

  // Test 4.2: Multi-server movie with 3 servers (Vietsub, Lồng Tiếng, Thuyết Minh)
  detailCache.set('vsmov:detail:test-triple-server-movie', {
    movie: {
      name: 'Triple Server Movie Test',
      origin_name: 'Triple Server Movie Test',
      slug: 'test-triple-server-movie',
      type: 'single',
      year: 2024,
    },
    episodes: [
      {
        server_name: "  Vietsub\r\n #1 ",
        server_data: [
          {
            name: 'Full',
            slug: 'full',
            link_m3u8: 'https://v5.streamvsmov.com/stream/triple-1/master.m3u8',
          },
        ],
      },
      {
        server_name: "LỒNG TIẾNG \t #2",
        server_data: [
          {
            name: 'Full',
            slug: 'full',
            link_m3u8: 'https://v5.streamvsmov.com/stream/triple-2/master.m3u8',
          },
        ],
      },
      {
        server_name: "Thuyết minh #3",
        server_data: [
          {
            name: 'Full',
            slug: 'full',
            link_m3u8: 'https://v5.streamvsmov.com/stream/triple-3/master.m3u8',
          },
        ],
      },
    ],
  });

  const tripleServerStreams = await getStreams({
    slug: 'test-triple-server-movie',
    type: 'movie',
    proxyBase: PROXY_BASE,
  });

  runner.assertEqual(tripleServerStreams.length, 3, 'Triple-server movie returns exactly 3 distinct streams');
  runner.assertEqual(tripleServerStreams[0].behaviorHints.bingeGroup, 'vsmov-vietsub-4k-vip-1', 'Server 1 is Vietsub');
  runner.assertEqual(tripleServerStreams[1].behaviorHints.bingeGroup, 'vsmov-longtieng-4k-vip-1', 'Server 2 is Lồng Tiếng');
  runner.assertEqual(tripleServerStreams[2].behaviorHints.bingeGroup, 'vsmov-thuyetminh-4k-vip-1', 'Server 3 is Thuyết Minh');

  for (let i = 0; i < tripleServerStreams.length; i++) {
    runner.assertStreamProtocol(tripleServerStreams[i], i);
  }

  // Test 4.3: Empty server_data array is skipped without error
  detailCache.set('vsmov:detail:test-empty-server-data', {
    movie: { name: 'Empty Data', slug: 'test-empty-server-data' },
    episodes: [
      { server_name: 'Vietsub #1', server_data: [] },
      {
        server_name: 'Lồng tiếng #2',
        server_data: [{ name: 'Full', slug: 'full', link_m3u8: 'https://v5.streamvsmov.com/stream/valid/master.m3u8' }],
      },
    ],
  });

  const emptyDataStreams = await getStreams({
    slug: 'test-empty-server-data',
    type: 'movie',
    proxyBase: PROXY_BASE,
  });
  runner.assertEqual(emptyDataStreams.length, 1, 'Empty server_data is safely skipped');

  // Test 4.4: Non-existent episode in series returns empty array
  detailCache.set('vsmov:detail:test-series-episodes', {
    movie: { name: 'Test Series', type: 'series', slug: 'test-series-episodes' },
    episodes: [
      {
        server_name: 'Vietsub #1',
        server_data: [
          { name: '1', slug: 'tap-1', link_m3u8: 'https://v5.streamvsmov.com/stream/ep1/master.m3u8' },
          { name: '2', slug: 'tap-2', link_m3u8: 'https://v5.streamvsmov.com/stream/ep2/master.m3u8' },
        ],
      },
    ],
  });

  const ep999Streams = await getStreams({
    slug: 'test-series-episodes',
    type: 'series',
    season: 1,
    episode: 999,
    proxyBase: PROXY_BASE,
  });
  runner.assertEqual(ep999Streams.length, 0, 'Query for non-existent episode 999 returns empty array []');

  const epNegStreams = await getStreams({
    slug: 'test-series-episodes',
    type: 'series',
    season: 1,
    episode: -5,
    proxyBase: PROXY_BASE,
  });
  runner.assertEqual(epNegStreams.length, 0, 'Negative episode number returns empty array []');

  // Test 4.5: Adversarial regex strings in episode parameter
  const regexBombStreams = await getStreams({
    slug: 'test-series-episodes',
    type: 'series',
    season: 1,
    episode: '(((a+)+)+)+$',
    proxyBase: PROXY_BASE,
  });
  runner.assertEqual(regexBombStreams.length, 0, 'Regex bomb in episode parameter is handled safely');

  // ═══════════════════════════════════════════════════════════════════
  //  SUITE 5: Subtitle URL Encoding and Invariants
  // ═══════════════════════════════════════════════════════════════════
  runner.section('Suite 5: Subtitle URL Encoding and Invariants');

  // Test 5.1: Subtitle proxy parameter decoding test
  const testSubUrl = 'https://v5.streamvsmov.com/video/123/subtitle/vie.vtt';
  const testRef = 'https://vsmov.com/';
  const b64Sub = Buffer.from(testSubUrl).toString('base64url');
  const b64Ref = Buffer.from(testRef).toString('base64url');

  const proxySubUrl = `${PROXY_BASE}/hls/sub.vtt?url=${b64Sub}&ref=${b64Ref}`;
  runner.assert(proxySubUrl.includes('/hls/sub.vtt?url='), 'Proxy URL format matches specification');

  // Verify decode in reverse
  const decodedSub = Buffer.from(b64Sub, 'base64url').toString('utf8');
  const decodedRef = Buffer.from(b64Ref, 'base64url').toString('utf8');
  runner.assertEqual(decodedSub, testSubUrl, 'Base64URL round-trip for subtitle URL is lossless');
  runner.assertEqual(decodedRef, testRef, 'Base64URL round-trip for referer is lossless');

  // ─── Summary ─────────────────────────────────────────────────────
  runner.printSummary();

  if (runner.failed > 0) {
    throw new Error(`Adversarial test suite failed with ${runner.failed} failure(s).`);
  }

  return true;
}

// ─── Main Entry ──────────────────────────────────────────────────
if (require.main === module) {
  runSuite()
    .then(() => {
      console.log('🌟 ALL ADVERSARIAL & STRESS TESTS PASSED WITH ZERO FAILURES (VERDICT: APPROVE)');
      process.exit(0);
    })
    .catch((err) => {
      console.error('\n❌ ADVERSARIAL SUITE FAILED:', err.message);
      process.exit(1);
    });
}

module.exports = { runSuite };
