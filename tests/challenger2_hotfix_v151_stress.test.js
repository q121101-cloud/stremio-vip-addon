'use strict';

/**
 * ==============================================================================
 *  VIP Movies Addon — tests/challenger2_hotfix_v151_stress.test.js
 *  Adversarial Challenge, Stress Testing & Concurrency Validation Suite
 *  Target: Hotfix v1.5.1
 *
 *  Scope:
 *    1. KKPhim Flexible Episode Matcher Edge Cases & Precision Testing
 *    2. KKPhim Episode Container Normalization (server_data, episode_data, items, episodes)
 *    3. KKPhim CDN Referer & Base64URL Security Preservation
 *    4. Subtitle Proxy (/hls/sub.vtt) Concurrency Stress (100 parallel requests)
 *    5. Subtitle Parameter Matrix (b64, url, sub, ref, referer, Base64URL vs plaintext)
 *    6. Anti-Hotlinking Referer & Origin Upstream Verification
 *    7. Subtitle Body Transformation (SRT conversion, UTF-8 BOM stripping, UTF-8 Vietnamese)
 *    8. Error Resilience & Malformed Inputs
 * ==============================================================================
 */

const http = require('http');
const express = require('express');
const cors = require('cors');
const axios = require('axios');
const assert = require('assert');

const kkphim = require('../src/providers/kkphim');
const vsmov = require('../src/providers/vsmov');
const hlsRouter = require('../src/routes/hls');
const manifestRouter = require('../src/routes/manifest');
const handlers = require('../src/handlers');

// ANSI Color formatting
const GREEN  = '\x1b[32m';
const RED    = '\x1b[31m';
const CYAN   = '\x1b[36m';
const YELLOW = '\x1b[33m';
const BOLD   = '\x1b[1m';
const RESET  = '\x1b[0m';
const GRAY   = '\x1b[90m';

let passedAssertions = 0;
let failedAssertions = 0;

function pass(msg) {
  passedAssertions++;
  console.log(`  ${GREEN}✅ PASS:${RESET} ${msg}`);
}

function fail(msg, err) {
  failedAssertions++;
  console.error(`  ${RED}❌ FAIL:${RESET} ${msg}`);
  if (err) console.error(`     ${RED}${err.message || err}${RESET}`);
}

function assertStrict(actual, expected, desc) {
  try {
    assert.strictEqual(actual, expected);
    pass(`${desc} (expected ${expected}, got ${actual})`);
  } catch (e) {
    fail(`${desc} - Expected ${expected}, got ${actual}`, e);
  }
}

function assertTrue(cond, desc) {
  try {
    assert.ok(cond);
    pass(desc);
  } catch (e) {
    fail(desc, e);
  }
}

function assertFalse(cond, desc) {
  try {
    assert.ok(!cond);
    pass(desc);
  } catch (e) {
    fail(desc, e);
  }
}

async function runChallenger2TestSuite() {
  const startTime = Date.now();
  console.log(`\n${BOLD}${CYAN}╔══════════════════════════════════════════════════════════════════════════════╗${RESET}`);
  console.log(`${BOLD}${CYAN}║  ⚔️ CHALLENGER 2: HOTFIX v1.5.1 STRESS & ADVERSARIAL VERIFICATION SUITE   ║${RESET}`);
  console.log(`${BOLD}${CYAN}╚══════════════════════════════════════════════════════════════════════════════╝${RESET}\n`);

  // ══════════════════════════════════════════════════════════════════════════
  //  SECTION 1: KKPHIM FLEXIBLE EPISODE MATCHING SYNTHETIC & EDGE CASES
  // ══════════════════════════════════════════════════════════════════════════
  console.log(`${BOLD}${CYAN}▶ SECTION 1: KKPhim Flexible Episode Matcher — Synthetic & Edge-Case Formats${RESET}`);

  const matchEpisodeItem = kkphim.matchEpisodeItem;
  assertTrue(typeof matchEpisodeItem === 'function', 'matchEpisodeItem is exported from src/providers/kkphim.js');

  // Test Matrix 1.1: Integer Matching (targetEp = "1", targetEpNum = 1)
  const integerItemsForEp1 = [
    { name: '1', slug: '1' },
    { name: '01', slug: '01' },
    { name: '001', slug: '001' },
    { name: '1', slug: 'tap-1' },
    { name: '01', slug: 'tap-01' },
    { name: '001', slug: 'tap-001' },
  ];

  for (const item of integerItemsForEp1) {
    assertTrue(
      matchEpisodeItem(item, '1', 1),
      `Matches target episode 1 on name="${item.name}", slug="${item.slug}"`
    );
  }

  // Test Matrix 1.2: Two-digit & Multi-digit Integers (targetEp = "12", targetEpNum = 12)
  const integerItemsForEp12 = [
    { name: '12', slug: '12' },
    { name: '012', slug: '012' },
    { name: '12', slug: 'tap-12' },
    { name: '12', slug: 'episode-12' },
    { name: 'Tập 12', slug: 'tap-12' },
  ];

  for (const item of integerItemsForEp12) {
    assertTrue(
      matchEpisodeItem(item, '12', 12),
      `Matches target episode 12 on name="${item.name}", slug="${item.slug}"`
    );
  }

  // Test Matrix 1.3: Vietnamese Prefixes & Decorator Suffixes (targetEp = "1", targetEpNum = 1)
  const vnPrefixItemsForEp1 = [
    { name: 'Tập 1', slug: 'tap-1' },
    { name: 'Tập 01', slug: 'tap-01' },
    { name: 'Tập 001', slug: 'tap-001' },
    { name: 'Tập1', slug: 'tap-1' },
    { name: 'Tập01', slug: 'tap-01' },
    { name: 'Tập 1 - HD', slug: 'tap-1-hd' },
    { name: 'Tập 1 Vietsub', slug: 'tap-1-vietsub' },
    { name: 'Tập 01 - Full HD', slug: 'tap-01-full-hd' },
    { name: 'TẬP 1', slug: 'tap-1' },
    { name: 'tập 01', slug: 'tap-01' },
    { name: 'Tập 1 (Bản Đẹp)', slug: 'tap-1-ban-dep' },
  ];

  for (const item of vnPrefixItemsForEp1) {
    assertTrue(
      matchEpisodeItem(item, '1', 1),
      `Matches Vietnamese prefix variant: name="${item.name}", slug="${item.slug}"`
    );
  }

  // Test Matrix 1.4: Slug Suffixes & Complex Series Slugs (targetEp = "1", targetEpNum = 1)
  const slugItemsForEp1 = [
    { name: '', slug: 'tap-1' },
    { name: '', slug: 'tap-01' },
    { name: '', slug: 'tap-001' },
    { name: 'Breaking Bad', slug: 'breaking-bad-s1-1' },
    { name: 'Breaking Bad', slug: 'breaking-bad-s1-01' },
    { name: 'Show', slug: '-1' },
    { name: 'Show', slug: '-01' },
    { name: 'Show', slug: 'show-tap-1' },
    { name: 'Show', slug: 'show-tap-01' },
    { name: 'Show', slug: 'show_1' },
  ];

  for (const item of slugItemsForEp1) {
    assertTrue(
      matchEpisodeItem(item, '1', 1),
      `Matches slug variant: name="${item.name}", slug="${item.slug}"`
    );
  }

  // Test Matrix 1.5: English Labels (targetEp = "1", targetEpNum = 1)
  const englishItemsForEp1 = [
    { name: 'Episode 1', slug: 'episode-1' },
    { name: 'EP 01', slug: 'ep-01' },
    { name: 'Episode 01', slug: 'episode-01' },
    { name: 'EP 1', slug: 'ep-1' },
    { name: 'Ep 1', slug: 'ep-1' },
    { name: 'Ep 01', slug: 'ep-01' },
    { name: 'Episode 1 - 1080p', slug: 'episode-1-1080p' },
  ];

  for (const item of englishItemsForEp1) {
    assertTrue(
      matchEpisodeItem(item, '1', 1),
      `Matches English label variant: name="${item.name}", slug="${item.slug}"`
    );
  }

  // Test Matrix 1.6: False Positive Prevention (Adversarial Anti-Collisions)
  // Searching for episode "1" must NEVER match episodes 10, 11, 12, 21, 100, etc.
  const falsePositiveItemsForEp1 = [
    { name: '10', slug: '10' },
    { name: '11', slug: '11' },
    { name: '12', slug: '12' },
    { name: '21', slug: '21' },
    { name: '100', slug: '100' },
    { name: 'Tập 10', slug: 'tap-10' },
    { name: 'Tập 11', slug: 'tap-11' },
    { name: 'Tập 12', slug: 'tap-12' },
    { name: 'Episode 10', slug: 'episode-10' },
    { name: 'Episode 11', slug: 'episode-11' },
    { name: 'EP 12', slug: 'ep-12' },
    { name: 'Series S1', slug: 'breaking-bad-s1-10' },
    { name: 'Series S1', slug: 'breaking-bad-s1-11' },
  ];

  for (const item of falsePositiveItemsForEp1) {
    assertFalse(
      matchEpisodeItem(item, '1', 1),
      `Anti-Collision: Episode 1 does NOT match item name="${item.name}", slug="${item.slug}"`
    );
  }

  // Searching for episode "2" must NEVER match episode 12 or 20 or 22
  const falsePositiveItemsForEp2 = [
    { name: '12', slug: 'tap-12' },
    { name: '20', slug: 'tap-20' },
    { name: '22', slug: 'tap-22' },
    { name: 'Tập 12', slug: 'tap-12' },
  ];

  for (const item of falsePositiveItemsForEp2) {
    assertFalse(
      matchEpisodeItem(item, '2', 2),
      `Anti-Collision: Episode 2 does NOT match item name="${item.name}", slug="${item.slug}"`
    );
  }

  // Test Matrix 1.7: Degenerate & Malformed Inputs
  assertFalse(matchEpisodeItem(null, '1', 1), 'Handles null episode gracefully');
  assertFalse(matchEpisodeItem(undefined, '1', 1), 'Handles undefined episode gracefully');
  assertFalse(matchEpisodeItem({}, '1', 1), 'Handles empty episode object gracefully');
  assertFalse(matchEpisodeItem({ name: '', slug: '' }, '1', 1), 'Handles empty string name/slug gracefully');
  assertFalse(matchEpisodeItem({ name: null, slug: null }, '1', 1), 'Handles null name/slug gracefully');

  // ══════════════════════════════════════════════════════════════════════════
  //  SECTION 2: KKPHIM DATA CONTAINER NORMALIZATION & GETSTREAMS INTEGRATION
  // ══════════════════════════════════════════════════════════════════════════
  console.log(`\n${BOLD}${CYAN}▶ SECTION 2: KKPhim Data Container Normalization & Provider Resolution${RESET}`);

  // Test Matrix 2.1: Test getStreams with all 4 container keys (server_data, episode_data, items, episodes)
  const containerVariants = [
    {
      label: 'server_data container',
      serverObj: {
        server_name: 'Vietsub #1',
        server_data: [
          { name: '1', slug: 'tap-1', link_m3u8: 'https://s2.phim1280.tv/2023/ep1.m3u8' },
          { name: '2', slug: 'tap-2', link_m3u8: 'https://s2.phim1280.tv/2023/ep2.m3u8' },
        ],
      },
    },
    {
      label: 'episode_data container',
      serverObj: {
        server_name: 'Lồng Tiếng #1',
        episode_data: [
          { name: 'Tập 01', slug: 'tap-01', link_m3u8: 'https://s2.phim1280.tv/2023/ep1_lt.m3u8' },
          { name: 'Tập 02', slug: 'tap-02', link_m3u8: 'https://s2.phim1280.tv/2023/ep2_lt.m3u8' },
        ],
      },
    },
    {
      label: 'items container',
      serverObj: {
        server_name: 'Thuyết Minh #1',
        items: [
          { name: 'Episode 1', slug: 'breaking-bad-s1-1', link_m3u8: 'https://s2.phim1280.tv/2023/ep1_tm.m3u8' },
          { name: 'Episode 2', slug: 'breaking-bad-s1-2', link_m3u8: 'https://s2.phim1280.tv/2023/ep2_tm.m3u8' },
        ],
      },
    },
    {
      label: 'episodes container',
      serverObj: {
        server_name: 'Server VIP 4',
        episodes: [
          { name: 'Tập 1 - HD', slug: 'tap-1-hd', link_m3u8: 'https://s2.phim1280.tv/2023/ep1_vip.m3u8' },
          { name: 'Tập 2 - HD', slug: 'tap-2-hd', link_m3u8: 'https://s2.phim1280.tv/2023/ep2_vip.m3u8' },
        ],
      },
    },
  ];

  // Intercept KKPhim cache or mock response to test getStreams logic directly
  const { imdbCache } = require('../src/lib/cache');

  imdbCache.set('kkphim:imdb:tt9999991', {
    movie: { slug: 'test-series-matrix', type: 'series', name: 'Test Series Matrix' },
    episodes: containerVariants.map((c) => c.serverObj),
  }, 3600);

  const resolvedStreamsEp1 = await kkphim.getStreams({
    imdbId: 'tt9999991',
    type: 'series',
    season: 1,
    episode: 1,
    proxyBase: 'http://127.0.0.1:7000',
  });

  assertStrict(resolvedStreamsEp1.length, 4, 'Resolved all 4 streams across 4 different container types for Episode 1');

  for (const s of resolvedStreamsEp1) {
    assertStrict(s.name, 'VIP Movies 🎬', 'Stream name is "VIP Movies 🎬"');
    assertStrict(s.externalUrl, undefined, 'externalUrl is undefined');
    assertFalse('externalUrl' in s, 'externalUrl key does not exist');
    assertTrue(s.url.startsWith('http://127.0.0.1:7000/hls/manifest.m3u8?url='), 'Proxy manifest URL format correct');
    assertTrue(s.url.includes('&ref='), 'Preserves Base64URL encoded ref parameter');

    // Decode URL and Ref to verify preservation
    const urlObj = new URL(s.url);
    const b64Url = urlObj.searchParams.get('url');
    const b64Ref = urlObj.searchParams.get('ref');
    const decodedUrl = Buffer.from(b64Url, 'base64url').toString('utf8');
    const decodedRef = Buffer.from(b64Ref, 'base64url').toString('utf8');

    assertTrue(decodedUrl.startsWith('https://s2.phim1280.tv/2023/ep1'), `Decoded URL points to correct episode 1 stream: ${decodedUrl}`);
    assertStrict(decodedRef, 'https://player.phimapi.com/', 'Decoded Referer is https://player.phimapi.com/');
  }

  // Test Matrix 2.2: Episode 2 Resolution
  const resolvedStreamsEp2 = await kkphim.getStreams({
    imdbId: 'tt9999991',
    type: 'series',
    season: 1,
    episode: 2,
    proxyBase: 'http://127.0.0.1:7000',
  });

  assertStrict(resolvedStreamsEp2.length, 4, 'Resolved all 4 streams across 4 different container types for Episode 2');
  for (const s of resolvedStreamsEp2) {
    const urlObj = new URL(s.url);
    const decodedUrl = Buffer.from(urlObj.searchParams.get('url'), 'base64url').toString('utf8');
    assertTrue(decodedUrl.startsWith('https://s2.phim1280.tv/2023/ep2'), `Decoded URL points to correct episode 2 stream: ${decodedUrl}`);
  }

  // Test Matrix 2.3: 1-Based Index Fallback
  imdbCache.set('kkphim:imdb:tt9999992', {
    movie: { slug: 'test-fallback-index', type: 'series', name: 'Test Fallback Index' },
    episodes: [{
      server_name: 'Vietsub Nonstandard',
      server_data: [
        { name: 'Phần mở đầu', slug: 'intro', link_m3u8: 'https://s2.phim1280.tv/2023/intro.m3u8' },
        { name: 'Cao trào', slug: 'climax', link_m3u8: 'https://s2.phim1280.tv/2023/climax.m3u8' },
      ],
    }],
  }, 3600);

  const fallbackStreams = await kkphim.getStreams({
    imdbId: 'tt9999992',
    type: 'series',
    season: 1,
    episode: 1,
    proxyBase: 'http://127.0.0.1:7000',
  });

  assertStrict(fallbackStreams.length, 1, 'Resolved 1 stream using 1-based index fallback');
  const fallbackDecodedUrl = Buffer.from(new URL(fallbackStreams[0].url).searchParams.get('url'), 'base64url').toString('utf8');
  assertStrict(fallbackDecodedUrl, 'https://s2.phim1280.tv/2023/intro.m3u8', 'Fallback matches index 0 for episode 1');

  // Test Matrix 2.4: Out of bounds episode request
  const outOfBoundsStreams = await kkphim.getStreams({
    imdbId: 'tt9999992',
    type: 'series',
    season: 1,
    episode: 99,
    proxyBase: 'http://127.0.0.1:7000',
  });
  assertStrict(outOfBoundsStreams.length, 0, 'Out of bounds episode 99 returns 0 streams (clean empty array, no error)');

  // ══════════════════════════════════════════════════════════════════════════
  //  SECTION 3: SUBTITLE PROXY (/hls/sub.vtt) HIGH CONCURRENCY & STRESS
  // ══════════════════════════════════════════════════════════════════════════
  console.log(`\n${BOLD}${CYAN}▶ SECTION 3: Subtitle Proxy (/hls/sub.vtt) — High Concurrency & Stress Testing${RESET}`);

  // Setup Mock Upstream Subtitle Server
  const capturedUpstreamRequests = [];
  const mockSrtData = `1
00:00:01,000 --> 00:00:04,500
Xin chào thế giới phim ảnh!

2
00:00:05,200 --> 00:00:09,800
Đây là phụ đề tiếng Việt chuẩn UTF-8 có dấu: Ứ Ử Ữ Ợ Đ.
`;

  const mockVttData = `WEBVTT

1
00:00:01.000 --> 00:00:04.500
Hello World from Native WebVTT!

2
00:00:05.200 --> 00:00:09.800
Enjoy the 4K Ultra HD streaming experience.
`;

  const mockUpstreamServer = http.createServer((req, res) => {
    capturedUpstreamRequests.push({
      url: req.url,
      headers: req.headers,
      timestamp: Date.now(),
    });

    const parsedUrl = new URL(req.url, 'http://127.0.0.1');

    // Simulate jitter latency between 5ms and 30ms
    const delay = Math.floor(Math.random() * 25) + 5;
    setTimeout(() => {
      if (parsedUrl.pathname === '/sub/vietnamese.srt') {
        res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end(mockSrtData);
      } else if (parsedUrl.pathname === '/sub/bom_vietnamese.srt') {
        res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end('\uFEFF' + mockSrtData);
      } else if (parsedUrl.pathname === '/sub/english.vtt') {
        res.writeHead(200, { 'Content-Type': 'text/vtt; charset=utf-8' });
        res.end(mockVttData);
      } else if (parsedUrl.pathname === '/sub/crlf.srt') {
        res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end(mockSrtData.replace(/\n/g, '\r\n'));
      } else if (parsedUrl.pathname === '/sub/slow.srt') {
        setTimeout(() => {
          res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
          res.end(mockSrtData);
        }, 100);
      } else if (parsedUrl.pathname === '/sub/not_found.srt') {
        res.writeHead(404, { 'Content-Type': 'text/plain' });
        res.end('Subtitle Not Found');
      } else if (parsedUrl.pathname === '/sub/error_500.srt') {
        res.writeHead(500, { 'Content-Type': 'text/plain' });
        res.end('Internal Server Error');
      } else {
        res.writeHead(200, { 'Content-Type': 'text/plain' });
        res.end('OK');
      }
    }, delay);
  });

  await new Promise((resolve) => mockUpstreamServer.listen(0, '127.0.0.1', resolve));
  const upstreamPort = mockUpstreamServer.address().port;
  const upstreamBase = `http://127.0.0.1:${upstreamPort}`;

  // Start Express Addon Server
  const app = express();
  app.use(cors());
  app.use(express.json());
  app.use('/hls', hlsRouter);
  app.use('/', manifestRouter);
  app.use('/', handlers);

  const server = await new Promise((resolve, reject) => {
    const s = app.listen(0, '127.0.0.1', () => resolve(s));
    s.on('error', reject);
  });

  const addonPort = server.address().port;
  const addonBase = `http://127.0.0.1:${addonPort}`;

  try {
    // ══════════════════════════════════════════════════════════════════════════
    //  STRESS TEST: 100 Concurrent Parallel Requests to /hls/sub.vtt
    // ══════════════════════════════════════════════════════════════════════════
    console.log(`  ${GRAY}Firing 100 concurrent requests to /hls/sub.vtt with mixed workloads...${RESET}`);

    const srtPlainUrl = `${upstreamBase}/sub/vietnamese.srt`;
    const bomSrtUrl   = `${upstreamBase}/sub/bom_vietnamese.srt`;
    const vttPlainUrl = `${upstreamBase}/sub/english.vtt`;
    const crlfSrtUrl  = `${upstreamBase}/sub/crlf.srt`;

    const b64SrtUrl = Buffer.from(srtPlainUrl).toString('base64url');
    const b64BomUrl = Buffer.from(bomSrtUrl).toString('base64url');
    const b64VttUrl = Buffer.from(vttPlainUrl).toString('base64url');
    const b64RefVsmov = Buffer.from('https://vsmov.com/').toString('base64url');
    const b64RefPhimapi = Buffer.from('https://player.phimapi.com/').toString('base64url');

    const requestPromises = [];
    const NUM_CONCURRENT = 100;

    for (let i = 0; i < NUM_CONCURRENT; i++) {
      let reqUrl;
      const mod = i % 5;
      if (mod === 0) {
        // Plaintext URL + plaintext ref
        reqUrl = `${addonBase}/hls/sub.vtt?url=${encodeURIComponent(srtPlainUrl)}&ref=https://vsmov.com/`;
      } else if (mod === 1) {
        // Base64URL url + Base64URL ref (VSMOV)
        reqUrl = `${addonBase}/hls/sub.vtt?url=${b64SrtUrl}&ref=${b64RefVsmov}`;
      } else if (mod === 2) {
        // Base64URL BOM SRT + Base64URL ref (KKPhim)
        reqUrl = `${addonBase}/hls/sub.vtt?url=${b64BomUrl}&ref=${b64RefPhimapi}`;
      } else if (mod === 3) {
        // /hls/sub alias with query param 'sub' (Native WebVTT)
        reqUrl = `${addonBase}/hls/sub?sub=${encodeURIComponent(vttPlainUrl)}&referer=https://vsmov.com/`;
      } else {
        // CRLF SRT with query param 'b64'
        const b64Crlf = Buffer.from(crlfSrtUrl).toString('base64url');
        reqUrl = `${addonBase}/hls/sub.vtt?b64=${b64Crlf}`;
      }

      requestPromises.push(axios.get(reqUrl, { timeout: 15000 }));
    }

    const results = await Promise.allSettled(requestPromises);
    const fulfilled = results.filter((r) => r.status === 'fulfilled');
    const rejected = results.filter((r) => r.status === 'rejected');

    assertStrict(fulfilled.length, NUM_CONCURRENT, `All ${NUM_CONCURRENT} concurrent requests succeeded with HTTP 200`);
    assertStrict(rejected.length, 0, 'Zero rejected or dropped requests under 100 concurrent load');

    // Verify properties across all fulfilled responses
    let allWebVTT = true;
    let allCors = true;
    let allVttContentType = true;
    let allValidTimestamps = true;
    let allNoBom = true;

    for (const res of fulfilled) {
      const data = String(res.value.data);
      if (!data.startsWith('WEBVTT')) allWebVTT = false;
      if (data.charCodeAt(0) === 0xFEFF || data.startsWith('\uFEFF')) allNoBom = false;
      if (res.value.headers['access-control-allow-origin'] !== '*') allCors = false;
      if (!res.value.headers['content-type']?.includes('text/vtt')) allVttContentType = false;
      if (data.includes('00:00:01,000')) allValidTimestamps = false;
    }

    assertTrue(allWebVTT, '100% of concurrent responses begin with "WEBVTT"');
    assertTrue(allCors, '100% of concurrent responses include CORS "Access-Control-Allow-Origin: *"');
    assertTrue(allVttContentType, '100% of concurrent responses return "Content-Type: text/vtt; charset=utf-8"');
    assertTrue(allValidTimestamps, '100% of SRT comma timestamps converted to dot timestamps');
    assertTrue(allNoBom, '100% of responses cleanly strip UTF-8 BOM');

    // ══════════════════════════════════════════════════════════════════════════
    //  SECTION 4: ANTI-HOTLINKING REFERER & ORIGIN PRESERVATION
    // ══════════════════════════════════════════════════════════════════════════
    console.log(`\n${BOLD}${CYAN}▶ SECTION 4: Anti-Hotlinking Referer & Origin Preservation Matrix${RESET}`);

    // Test 4.1: VSMOV Referer & Origin Preservation
    capturedUpstreamRequests.length = 0; // Clear history
    await axios.get(`${addonBase}/hls/sub.vtt?url=${encodeURIComponent(srtPlainUrl)}&ref=https://vsmov.com/`);
    const lastVsmovReq = capturedUpstreamRequests[capturedUpstreamRequests.length - 1];
    assertStrict(lastVsmovReq.headers['referer'], 'https://vsmov.com/', 'Upstream received Referer: https://vsmov.com/');
    assertStrict(lastVsmovReq.headers['origin'], 'https://vsmov.com', 'Upstream received Origin: https://vsmov.com');
    assertTrue(lastVsmovReq.headers['user-agent']?.includes('Chrome'), 'Upstream received Chrome User-Agent');

    // Test 4.2: KKPhim Referer & Origin Preservation
    capturedUpstreamRequests.length = 0;
    await axios.get(`${addonBase}/hls/sub.vtt?url=${encodeURIComponent(srtPlainUrl)}&ref=https://player.phimapi.com/`);
    const lastKkphimReq = capturedUpstreamRequests[capturedUpstreamRequests.length - 1];
    assertStrict(lastKkphimReq.headers['referer'], 'https://player.phimapi.com/', 'Upstream received Referer: https://player.phimapi.com/');
    assertStrict(lastKkphimReq.headers['origin'], 'https://player.phimapi.com', 'Upstream received Origin: https://player.phimapi.com');

    // Test 4.3: Base64URL Encoded Referer Parameter
    capturedUpstreamRequests.length = 0;
    const b64CustomRef = Buffer.from('https://custom-cdn.net/player/v1/').toString('base64url');
    await axios.get(`${addonBase}/hls/sub.vtt?url=${encodeURIComponent(srtPlainUrl)}&ref=${b64CustomRef}`);
    const lastCustomReq = capturedUpstreamRequests[capturedUpstreamRequests.length - 1];
    assertStrict(lastCustomReq.headers['referer'], 'https://custom-cdn.net/player/v1/', 'Decodes and forwards custom Base64URL referer');
    assertStrict(lastCustomReq.headers['origin'], 'https://custom-cdn.net', 'Computes correct origin from custom Base64URL referer');

    // Test 4.4: Default Fallback Referer when no ref param provided
    capturedUpstreamRequests.length = 0;
    await axios.get(`${addonBase}/hls/sub.vtt?url=${encodeURIComponent(srtPlainUrl)}`);
    const lastDefaultReq = capturedUpstreamRequests[capturedUpstreamRequests.length - 1];
    assertStrict(lastDefaultReq.headers['referer'], 'https://vsmov.com/', 'Defaults to https://vsmov.com/ referer for subtitle proxy');
    assertStrict(lastDefaultReq.headers['origin'], 'https://vsmov.com', 'Defaults to https://vsmov.com origin');

    // ══════════════════════════════════════════════════════════════════════════
    //  SECTION 5: SUBTITLE BODY TRANSFORMATION & VIETNAMESE UTF-8 FIDELITY
    // ══════════════════════════════════════════════════════════════════════════
    console.log(`\n${BOLD}${CYAN}▶ SECTION 5: Subtitle Body Transformation & UTF-8 Vietnamese Diacritics${RESET}`);

    // Test 5.1: SRT with full Vietnamese character set
    const srtRes = await axios.get(`${addonBase}/hls/sub.vtt?url=${encodeURIComponent(srtPlainUrl)}`);
    assertTrue(srtRes.data.includes('Xin chào thế giới phim ảnh!'), 'Preserves Vietnamese text: "Xin chào thế giới phim ảnh!"');
    assertTrue(srtRes.data.includes('Ứ Ử Ữ Ợ Đ'), 'Preserves Vietnamese upper diacritics: "Ứ Ử Ữ Ợ Đ"');
    assertTrue(srtRes.data.includes('00:00:01.000 --> 00:00:04.500'), 'Properly formatted WebVTT cue 1 timestamp');
    assertTrue(srtRes.data.includes('00:00:05.200 --> 00:00:09.800'), 'Properly formatted WebVTT cue 2 timestamp');
    assertFalse(srtRes.data.includes('00:00:01,000'), 'No comma in cue 1 timestamp');
    assertFalse(srtRes.data.includes('00:00:05,200'), 'No comma in cue 2 timestamp');

    // Test 5.2: UTF-8 BOM Stripping
    const bomRes = await axios.get(`${addonBase}/hls/sub.vtt?url=${encodeURIComponent(bomSrtUrl)}`);
    assertStrict(bomRes.data.charCodeAt(0), 87, 'First character is "W" (ASCII 87), not BOM (0xFEFF)');
    assertTrue(bomRes.data.startsWith('WEBVTT\n\n'), 'Starts strictly with "WEBVTT\\n\\n"');

    // Test 5.3: Native WebVTT passthrough (no redundant double WEBVTT headers)
    const vttRes = await axios.get(`${addonBase}/hls/sub.vtt?url=${encodeURIComponent(vttPlainUrl)}`);
    const headerOccurrences = (vttRes.data.match(/^WEBVTT/gm) || []).length;
    assertStrict(headerOccurrences, 1, 'Only 1 WEBVTT header present (no duplicate prepend on native WebVTT)');

    // ══════════════════════════════════════════════════════════════════════════
    //  SECTION 6: ERROR RESILIENCE & MALFORMED PARAMETERS
    // ══════════════════════════════════════════════════════════════════════════
    console.log(`\n${BOLD}${CYAN}▶ SECTION 6: Error Resilience & Malformed Inputs${RESET}`);

    // Missing URL -> 400
    try {
      await axios.get(`${addonBase}/hls/sub.vtt`);
      fail('Expected 400 for missing url');
    } catch (err) {
      assertStrict(err.response?.status, 400, 'Missing url query param returns HTTP 400');
    }

    // Upstream 404 -> 404
    try {
      await axios.get(`${addonBase}/hls/sub.vtt?url=${encodeURIComponent(upstreamBase + '/sub/not_found.srt')}`);
      fail('Expected 404 on upstream not found');
    } catch (err) {
      assertStrict(err.response?.status, 404, 'Upstream 404 returns HTTP 404');
    }

    // Upstream 500 -> 500
    try {
      await axios.get(`${addonBase}/hls/sub.vtt?url=${encodeURIComponent(upstreamBase + '/sub/error_500.srt')}`);
      fail('Expected 500 on upstream server error');
    } catch (err) {
      assertStrict(err.response?.status, 500, 'Upstream 500 returns HTTP 500');
    }

    // Malformed base64url string
    const malformedRes = await axios.get(`${addonBase}/hls/sub.vtt?url=%%%invalid%%%`, { validateStatus: () => true });
    assertTrue(malformedRes.status >= 400, `Malformed base64 returns error HTTP code (got ${malformedRes.status})`);

    // ══════════════════════════════════════════════════════════════════════════
    //  SECTION 7: LIVE MULTI-PROVIDER & SUBTITLE AGGREGATOR END-TO-END CHECK
    // ══════════════════════════════════════════════════════════════════════════
    console.log(`\n${BOLD}${CYAN}▶ SECTION 7: Live Multi-Provider & Subtitle Aggregator Check${RESET}`);

    // Verify /stream/movie/tt0373889.json
    const aggRes = await axios.get(`${addonBase}/stream/movie/tt0373889.json`, { timeout: 25000 });
    assertStrict(aggRes.status, 200, 'Stream aggregator returns HTTP 200');
    assertTrue(Array.isArray(aggRes.data?.streams) && aggRes.data.streams.length > 0, 'Aggregator returns non-empty streams');

    for (const [idx, s] of aggRes.data.streams.entries()) {
      assertStrict(s.name, 'VIP Movies 🎬', `Stream #${idx + 1} name is "VIP Movies 🎬"`);
      assertStrict(s.externalUrl, undefined, `Stream #${idx + 1} has no externalUrl`);
      assertFalse('externalUrl' in s, `Stream #${idx + 1} strictly omits externalUrl key`);
      assertTrue(typeof s.url === 'string' && s.url.includes('/hls/'), `Stream #${idx + 1} routes through in-app HLS proxy (${s.url})`);

      if (Array.isArray(s.subtitles) && s.subtitles.length > 0) {
        for (const sub of s.subtitles) {
          assertStrict(sub.id, 'vi_vsmov', 'Subtitle id is "vi_vsmov"');
          assertStrict(sub.lang, 'vie', 'Subtitle lang is "vie"');
          assertTrue(sub.url.startsWith(`${addonBase}/hls/sub.vtt?url=`), 'Subtitle URL routes via /hls/sub.vtt');
        }
      }
    }

  } finally {
    server.close();
    mockUpstreamServer.close();
    console.log(`\n${GRAY}[Teardown] Ephemeral addon server and mock upstream closed cleanly.${RESET}`);
  }

  // ══════════════════════════════════════════════════════════════════════════
  //  FINAL SUMMARY & VERDICT
  // ══════════════════════════════════════════════════════════════════════════
  const elapsed = ((Date.now() - startTime) / 1000).toFixed(2);
  console.log(`\n${BOLD}╔══════════════════════════════════════════════════════════════════════════════╗${RESET}`);
  console.log(`${BOLD}║          🏁 CHALLENGER 2 EMPIRICAL TEST HARNESS EXECUTION SUMMARY            ║${RESET}`);
  console.log(`${BOLD}╠══════════════════════════════════════════════════════════════════════════════╣${RESET}`);
  console.log(`║  Total Assertions Checked:       ${BOLD}${passedAssertions + failedAssertions}${RESET}`);
  console.log(`║  ✅ Passed Assertions:           ${GREEN}${BOLD}${passedAssertions}${RESET}`);
  console.log(`║  ❌ Failed Assertions:           ${failedAssertions > 0 ? RED + BOLD : GREEN}${failedAssertions}${RESET}`);
  console.log(`║  Execution Time:                 ${elapsed}s`);
  console.log(`${BOLD}╚══════════════════════════════════════════════════════════════════════════════╝${RESET}\n`);

  if (failedAssertions > 0) {
    console.error(`${RED}${BOLD}❌ VERDICT: CHALLENGE FAILED (${failedAssertions} assertions failed)${RESET}`);
    process.exit(1);
  } else {
    console.log(`${GREEN}${BOLD}🎉 VERDICT: ALL CHALLENGER 2 STRESS TESTS PASSED (100% SUCCESS)${RESET}`);
    process.exit(0);
  }
}

if (require.main === module) {
  runChallenger2TestSuite().catch((err) => {
    console.error('Fatal execution error:', err);
    process.exit(1);
  });
}

module.exports = { runChallenger2TestSuite };
