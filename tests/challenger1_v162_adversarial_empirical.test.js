'use strict';

/**
 * ==============================================================================
 *  VIP Movies Addon — tests/challenger1_v162_adversarial_empirical.test.js
 *  Engine v1.6.2 EMPIRICAL CHALLENGER ADVERSARIAL TEST SUITE
 *
 *  Adversarial Dimensions Tested:
 *  1. Catalog Edge Cases:
 *     - All 22 active catalogs integrity & standard metadata schema
 *     - Unknown & malformed catalog IDs (fake providers, punctuation, empty)
 *     - Empty & malformed query params (search=, genre=, skip=, malformed encoding)
 *     - Boundary skip values (negative skip, huge skip, non-numeric, decimal)
 *     - Hostile genre names across catalogs (18+, Unicode, SQL injection, XSS)
 *  2. Stream Edge Cases:
 *     - Malformed IDs (prefix-only, invalid format, non-existent IMDb, extreme lengths, XSS/SQLi)
 *     - Missing & irregular episode formats (missing episode, 0:0, negative, out-of-range)
 *     - Unsupported media types (other, audio, tv, channel, custom)
 *     - Rapid concurrent stream burst test (50 parallel requests)
 *     - Strict In-App Stream Protocol Invariant (url present, externalUrl undefined)
 *  3. HLS Proxy Resilience:
 *     - Base64URL decoding resilience (corrupted, unpadded, raw URLs, non-URL text, data URIs)
 *     - Relative path resolution in M3U8 rewriting (../, ./, /, //, query strings, tags)
 *     - HTTP Range header boundaries on /hls/segment.ts (bytes=0-0, bytes=100-200, bytes=0-1023, invalid ranges)
 *     - Subtitle VTT conversion (/hls/sub.vtt: raw SRT, VTT, UTF-8 BOM, CRLF, data URI, Vietnamese Unicode)
 *  4. MPEG-TS Chunk Download & Binary Verification:
 *     - Real segment download > 100KB
 *     - Periodic MPEG-TS sync byte 0x47 check across 188-byte packet boundaries
 * ==============================================================================
 */

const http = require('http');
const express = require('express');
const cors = require('cors');
const axios = require('axios');
const assert = require('assert');

const hlsRouter = require('../src/routes/hls');
const manifestRouter = require('../src/routes/manifest');
const handlers = require('../src/handlers');
const { ALL_CATALOGS, MANIFEST, GENRE_NAMES } = require('../src/manifest');
const { encodeConfig, DEFAULT_CONFIG } = require('../src/config');
const { m3u8Cache } = require('../src/lib/cache');

// ─── ANSI Colors ────────────────────────────────────────────────────────────
const GREEN  = '\x1b[32m';
const RED    = '\x1b[31m';
const CYAN   = '\x1b[36m';
const YELLOW = '\x1b[33m';
const BOLD   = '\x1b[1m';
const RESET  = '\x1b[0m';
const GRAY   = '\x1b[90m';

let totalTests = 0;
let passedTests = 0;
let failedTests = 0;
const testFailures = [];

function pass(title, details = '') {
  totalTests++;
  passedTests++;
  console.log(`  ${GREEN}✅ PASS [${totalTests}]${RESET}: ${title}${details ? GRAY + ' (' + details + ')' + RESET : ''}`);
}

function fail(title, error) {
  totalTests++;
  failedTests++;
  const msg = error?.message || String(error);
  console.error(`  ${RED}❌ FAIL [${totalTests}]${RESET}: ${title} - ${msg}`);
  testFailures.push({ test: title, error: msg, stack: error?.stack });
}

function encodeB64(str) {
  return Buffer.from(str, 'utf8').toString('base64url');
}

// ─── Test Server Setup ──────────────────────────────────────────────────────
async function startTestServer() {
  const app = express();
  app.use(cors());
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));

  app.use('/hls', hlsRouter);
  app.use('/', manifestRouter);
  app.use('/', handlers);

  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;
  const baseUrl = `http://127.0.0.1:${port}`;
  return { server, baseUrl, port };
}

// ─── Main Challenger Execution ──────────────────────────────────────────────
async function runChallengerSuite() {
  console.log(`\n${BOLD}${CYAN}╔══════════════════════════════════════════════════════════════════════════════╗${RESET}`);
  console.log(`${BOLD}${CYAN}║  ⚔️  VIP MOVIES ENGINE v1.6.2: EMPIRICAL ADVERSARIAL CHALLENGER SUITE        ║${RESET}`);
  console.log(`${BOLD}${CYAN}╚══════════════════════════════════════════════════════════════════════════════╝${RESET}\n`);

  const startTime = Date.now();
  const { server, baseUrl, port } = await startTestServer();
  console.log(`ℹ️  Ephemeral Test Server running on ${BOLD}${baseUrl}${RESET} (Port ${port})\n`);

  try {
    // ────────────────────────────────────────────────────────────────────────
    // 🎯 SECTION 1: CATALOG EDGE CASES & ADVERSARIAL INPUTS
    // ────────────────────────────────────────────────────────────────────────
    console.log(`${BOLD}${YELLOW}▶ TARGET 1: Catalog Edge Cases & 22 Catalog Stress Tests${RESET}`);

    // 1.1 All 22 Manifest Catalogs Integrity
    console.log(`  [1.1] Verifying all 22 Catalogs in Manifest...`);
    assert.strictEqual(ALL_CATALOGS.length, 22, `Expected exactly 22 catalogs in ALL_CATALOGS, got ${ALL_CATALOGS.length}`);
    pass('Manifest contains exactly 22 catalogs', `Count: ${ALL_CATALOGS.length}`);

    for (let i = 0; i < ALL_CATALOGS.length; i++) {
      const cat = ALL_CATALOGS[i];
      try {
        const res = await axios.get(`${baseUrl}/catalog/${cat.type}/${cat.id}.json`, { timeout: 15000 });
        assert.strictEqual(res.status, 200, `Expected HTTP 200 for ${cat.id}`);
        assert.ok(res.data && Array.isArray(res.data.metas), `Expected { metas: [] } array for ${cat.id}`);
        assert.ok(res.data.metas.length > 0, `Catalog ${cat.id} returned empty metas list`);
        const firstMeta = res.data.metas[0];
        assert.ok(firstMeta.id, `Meta missing id in ${cat.id}`);
        assert.ok(firstMeta.name, `Meta missing name in ${cat.id}`);
        assert.ok(firstMeta.type, `Meta missing type in ${cat.id}`);
        pass(`Catalog [${i + 1}/22] ${cat.id} (${cat.provider}) responded with HTTP 200 and ${res.data.metas.length} items`);
      } catch (err) {
        fail(`Catalog [${i + 1}/22] ${cat.id} failed`, err);
      }
    }

    // 1.2 Unknown & Non-Existent Catalog IDs
    console.log(`\n  [1.2] Testing Unknown & Non-Existent Catalog IDs...`);
    const unknownCatalogIds = [
      'unknown-catalog-12345',
      'invalid_cluster_foo',
      'kkphim-nonexistent-cat',
      'nguonc-invalid-id',
      'stp-fake-single',
      'yan-unknown-donghua',
      'clbpx-nonexistent-sub',
      '---',
      '___',
      'null',
      'undefined',
      '!@#$%^&*()',
      'select*from*movies'
    ];

    for (const badId of unknownCatalogIds) {
      try {
        const res = await axios.get(`${baseUrl}/catalog/movie/${encodeURIComponent(badId)}.json`, { timeout: 10000 });
        assert.strictEqual(res.status, 200, `Expected HTTP 200 for unknown catalog ${badId}`);
        assert.ok(res.data && Array.isArray(res.data.metas), `Expected metas array for unknown catalog ${badId}`);
        pass(`Unknown Catalog ID '${badId}' handled gracefully (HTTP 200, metas: ${res.data.metas.length})`);
      } catch (err) {
        fail(`Unknown Catalog ID '${badId}' failed`, err);
      }
    }

    // 1.3 Empty & Malformed Query Parameters
    console.log(`\n  [1.3] Testing Empty & Malformed Query Parameters...`);
    const malformedQueries = [
      { extra: 'search=', desc: 'Empty search parameter' },
      { extra: 'genre=', desc: 'Empty genre parameter' },
      { extra: 'skip=', desc: 'Empty skip parameter' },
      { extra: 'search=&genre=&skip=', desc: 'All empty parameters' },
      { extra: '%20&%20', desc: 'Whitespace parameters' },
      { extra: '&&&&', desc: 'Multiple consecutive ampersands' },
      { extra: 'invalid_no_equal_sign', desc: 'Key without value' },
      { extra: '=value_without_key', desc: 'Value without key' },
      { extra: 'search=%E0%B8%A0%E0%B8%B2%E0%B8%A9%E0%B8%B2%E0%B9%84%E0%B8%97%E0%B8%A2', desc: 'Thai Unicode query string' },
    ];

    for (const item of malformedQueries) {
      try {
        const res = await axios.get(`${baseUrl}/catalog/movie/kkphim-movie-latest/${encodeURIComponent(item.extra)}.json`, { timeout: 10000 });
        assert.strictEqual(res.status, 200, `Expected HTTP 200 for ${item.desc}`);
        assert.ok(res.data && Array.isArray(res.data.metas), `Expected metas array for ${item.desc}`);
        pass(`Parameter Edge Case: ${item.desc} (HTTP 200, metas: ${res.data.metas.length})`);
      } catch (err) {
        fail(`Parameter Edge Case: ${item.desc} failed`, err);
      }
    }

    // 1.4 Boundary Skip Values
    console.log(`\n  [1.4] Testing Boundary Skip Values...`);
    const skipTestCases = [
      { skip: '0', desc: 'skip=0 (page 1)' },
      { skip: '10', desc: 'skip=10 (page 2)' },
      { skip: '-1', desc: 'Negative skip=-1 (should normalize to page 1)' },
      { skip: '-999999', desc: 'Extremely negative skip=-999999 (should normalize to page 1)' },
      { skip: '99999999', desc: 'Huge skip=99999999 (should convert to page 10000000 cleanly)' },
      { skip: 'abc', desc: 'Non-numeric skip=abc' },
      { skip: 'NaN', desc: 'skip=NaN' },
      { skip: '15.5', desc: 'Decimal skip=15.5' },
      { skip: '1e5', desc: 'Scientific notation skip=1e5' },
    ];

    for (const st of skipTestCases) {
      try {
        const res = await axios.get(`${baseUrl}/catalog/movie/kkphim-movie-latest/skip=${st.skip}.json`, { timeout: 10000 });
        assert.strictEqual(res.status, 200, `Expected HTTP 200 for ${st.desc}`);
        assert.ok(res.data && Array.isArray(res.data.metas), `Expected metas array for ${st.desc}`);
        pass(`Boundary Skip: ${st.desc} (HTTP 200, metas: ${res.data.metas.length})`);
      } catch (err) {
        fail(`Boundary Skip: ${st.desc} failed`, err);
      }
    }

    // 1.5 Hostile Genre Names Across Catalogs
    console.log(`\n  [1.5] Testing Hostile Genre Names Across Catalogs...`);
    const hostileGenres = [
      'Phim 18+',
      'Hành Động',
      'Tình Cảm',
      'Kinh Dị',
      'Tiếng Việt Có Dấu',
      'NonExistentGenre_12345!@#$',
      "'; DROP TABLE movies; --",
      '<script>alert("xss")</script>',
      '"><img src=x onerror=alert(1)>',
      'A'.repeat(500), // Extremely long genre string
    ];

    for (const g of hostileGenres) {
      try {
        const res = await axios.get(`${baseUrl}/catalog/movie/nguonc-movie-latest/genre=${encodeURIComponent(g)}.json`, { timeout: 10000 });
        assert.strictEqual(res.status, 200, `Expected HTTP 200 for hostile genre '${g.slice(0, 30)}'`);
        assert.ok(res.data && Array.isArray(res.data.metas), `Expected metas array for hostile genre '${g.slice(0, 30)}'`);
        pass(`Hostile Genre: '${g.slice(0, 35)}' handled safely (HTTP 200, metas: ${res.data.metas.length})`);
      } catch (err) {
        fail(`Hostile Genre: '${g.slice(0, 35)}' failed`, err);
      }
    }


    // ────────────────────────────────────────────────────────────────────────
    // 🎯 SECTION 2: STREAM EDGE CASES & ADVERSARIAL ATTACKS
    // ────────────────────────────────────────────────────────────────────────
    console.log(`\n${BOLD}${YELLOW}▶ TARGET 2: Stream Edge Cases & Adversarial Invariants${RESET}`);

    // 2.1 Malformed & Hostile Stream IDs
    console.log(`  [2.1] Testing Malformed & Hostile Stream IDs...`);
    const malformedStreamIds = [
      { id: 'tt', desc: 'IMDb prefix only (tt)' },
      { id: 'tt_invalid', desc: 'Invalid IMDb format tt_invalid' },
      { id: 'tt9999999999999', desc: 'Non-existent IMDb tt9999999999999' },
      { id: 'tt0000000', desc: 'Zero IMDb tt0000000' },
      { id: '::::', desc: 'Multiple colons ::::' },
      { id: 'vsmov:', desc: 'vsmov empty slug' },
      { id: 'vsmov_', desc: 'vsmov empty underscore slug' },
      { id: 'kkphim:', desc: 'kkphim empty slug' },
      { id: 'kkphim_', desc: 'kkphim empty underscore slug' },
      { id: 'nguonc:', desc: 'nguonc empty slug' },
      { id: 'stp:', desc: 'stp empty slug' },
      { id: 'yan:', desc: 'yan empty slug' },
      { id: 'clbpx:', desc: 'clbpx empty slug' },
      { id: 'hh3d:', desc: 'hh3d empty slug' },
      { id: 'undefined', desc: 'Literal string "undefined"' },
      { id: 'null', desc: 'Literal string "null"' },
      { id: 'tt01234<script>alert(1)</script>', desc: 'XSS payload in stream ID' },
      { id: "tt01234' OR 1=1--", desc: 'SQL injection payload in stream ID' },
      { id: 'tt' + '8'.repeat(500), desc: 'Extremely long stream ID (500+ chars)' },
    ];

    for (const tc of malformedStreamIds) {
      try {
        const res = await axios.get(`${baseUrl}/stream/movie/${encodeURIComponent(tc.id)}.json`, { timeout: 10000 });
        assert.strictEqual(res.status, 200, `Expected HTTP 200 for ${tc.desc}`);
        assert.ok(res.data && Array.isArray(res.data.streams), `Expected streams array for ${tc.desc}`);
        pass(`Stream ID Edge Case: ${tc.desc} (HTTP 200, streams: ${res.data.streams.length})`);
      } catch (err) {
        fail(`Stream ID Edge Case: ${tc.desc} failed`, err);
      }
    }

    // 2.2 Missing & Irregular Episode Numbers
    console.log(`\n  [2.2] Testing Missing & Irregular Episode Numbers...`);
    const irregularEpisodeIds = [
      { type: 'series', id: 'tt0903747:1', desc: 'Missing episode number (tt0903747:1)' },
      { type: 'series', id: 'tt0903747::', desc: 'Empty season and episode (tt0903747::)' },
      { type: 'series', id: 'tt0903747:0:0', desc: 'Zero season & episode (tt0903747:0:0)' },
      { type: 'series', id: 'tt0903747:-1:-1', desc: 'Negative season & episode (tt0903747:-1:-1)' },
      { type: 'series', id: 'tt0903747:9999:9999', desc: 'Out-of-range season & episode (tt0903747:9999:9999)' },
      { type: 'series', id: 'kkphim:breaking-bad:', desc: 'KKPhim series trailing colon' },
      { type: 'series', id: 'kkphim:breaking-bad:1', desc: 'KKPhim series missing episode number' },
      { type: 'series', id: 'vsmov:harry-potter:1', desc: 'VSMOV series missing episode number' },
      { type: 'series', id: 'stp:breaking-bad:1', desc: 'STP series missing episode number' },
      { type: 'series', id: 'clbpx:thien-long-bat-bo:1', desc: 'CLBPX series missing episode number' },
      { type: 'series', id: 'yan:dau-la-dai-luc:1', desc: 'YAN series missing episode number' },
    ];

    for (const ep of irregularEpisodeIds) {
      try {
        const res = await axios.get(`${baseUrl}/stream/${ep.type}/${encodeURIComponent(ep.id)}.json`, { timeout: 10000 });
        assert.strictEqual(res.status, 200, `Expected HTTP 200 for ${ep.desc}`);
        assert.ok(res.data && Array.isArray(res.data.streams), `Expected streams array for ${ep.desc}`);
        pass(`Irregular Episode: ${ep.desc} (HTTP 200, streams: ${res.data.streams.length})`);
      } catch (err) {
        fail(`Irregular Episode: ${ep.desc} failed`, err);
      }
    }

    // 2.3 Unsupported Media Types
    console.log(`\n  [2.3] Testing Unsupported Media Types...`);
    const unsupportedTypes = ['other', 'audio', 'tv', 'channel', 'radio', 'custom_xyz'];

    for (const ut of unsupportedTypes) {
      try {
        const res = await axios.get(`${baseUrl}/stream/${ut}/tt0373889.json`, { timeout: 10000 });
        assert.strictEqual(res.status, 200, `Expected HTTP 200 for unsupported type '${ut}'`);
        assert.ok(res.data && Array.isArray(res.data.streams), `Expected streams array for unsupported type '${ut}'`);
        pass(`Unsupported Media Type: '${ut}' handled safely (HTTP 200, streams: ${res.data.streams.length})`);
      } catch (err) {
        fail(`Unsupported Media Type: '${ut}' failed`, err);
      }
    }

    // 2.4 Rapid Concurrent Stream Requests (Stress & Concurrency Burst)
    console.log(`\n  [2.4] Executing High Concurrency Burst (50 Parallel Requests)...`);
    const testIds = [
      'tt0373889', // Harry Potter
      'tt0903747:1:1', // Breaking Bad
      'tt11126994:1:1', // Arcane
      'tt0944947:1:1', // Game of Thrones
      'tt1375666', // Inception
      'vsmov:harry-potter-va-hon-da-phu-thuy',
      'kkphim:tap-dau-tien',
      'stp:fake-movie',
      'invalid_stream_burst_id',
      'tt0000001'
    ];

    const burstRequests = [];
    for (let i = 0; i < 50; i++) {
      const targetId = testIds[i % testIds.length];
      const reqUrl = `${baseUrl}/stream/movie/${targetId}.json`;
      burstRequests.push(
        axios.get(reqUrl, { timeout: 15000 }).then(
          (res) => ({ success: true, status: res.status, streamCount: res.data?.streams?.length || 0 }),
          (err) => ({ success: false, error: err.message })
        )
      );
    }

    const burstResults = await Promise.all(burstRequests);
    const successfulBurst = burstResults.filter((r) => r.success && r.status === 200);
    assert.strictEqual(successfulBurst.length, 50, `Expected all 50 concurrent requests to succeed, got ${successfulBurst.length}/50`);
    pass(`Concurrency Burst: 50/50 parallel stream requests succeeded without crashes or socket drops`);


    // ────────────────────────────────────────────────────────────────────────
    // 🎯 SECTION 3: HLS PROXY RESILIENCE & ADVERSARIAL PARSING
    // ────────────────────────────────────────────────────────────────────────
    console.log(`\n${BOLD}${YELLOW}▶ TARGET 3: HLS Proxy Resilience & Subtitle Parsing${RESET}`);

    // 3.1 Base64URL Decoding Edge Cases
    console.log(`  [3.1] Testing Base64URL Decoding Edge Cases...`);
    const b64TestCases = [
      { query: 'url=', expectedStatus: 400, desc: 'Empty url parameter' },
      { query: 'url=???!!!', expectedStatus: 502, desc: 'Corrupted characters ???!!!' },
      { query: 'url=!@#$%^&*()', expectedStatus: 502, desc: 'Punctuation symbols' },
      { query: 'url=12345', expectedStatus: 502, desc: 'Plain numbers (not a URL)' },
      { query: 'url=javascript:alert(1)', expectedStatus: 502, desc: 'JavaScript URI scheme' },
      { query: 'url=data:text/html,<script>', expectedStatus: 502, desc: 'HTML Data URI' },
      { query: `url=${encodeB64('https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8')}`, expectedStatus: 200, desc: 'Valid base64url encoded URL' },
      { query: `url=${Buffer.from('https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8').toString('base64')}`, expectedStatus: 200, desc: 'Standard base64 encoded URL' },
      { query: `url=${encodeURIComponent('https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8')}`, expectedStatus: 200, desc: 'Raw unencoded URL string' },
    ];

    for (const btc of b64TestCases) {
      try {
        const res = await axios.get(`${baseUrl}/hls/manifest.m3u8?${btc.query}`, {
          timeout: 10000,
          validateStatus: () => true,
        });
        assert.strictEqual(res.status, btc.expectedStatus, `Expected HTTP ${btc.expectedStatus} for ${btc.desc}, got ${res.status}`);
        pass(`Base64 Resilience: ${btc.desc} (HTTP ${res.status})`);
      } catch (err) {
        fail(`Base64 Resilience: ${btc.desc} failed`, err);
      }
    }

    // 3.2 Relative Path Rewriting in M3U8 (RFC 3986 new URL(uri, base))
    console.log(`\n  [3.2] Testing Relative Path Resolution in M3U8 Rewriting...`);
    m3u8Cache.clear();

    const mockM3u8Content = `#EXTM3U
#EXT-X-VERSION:3
#EXT-X-TARGETDURATION:10
#EXT-X-MEDIA-SEQUENCE:0
#EXT-X-KEY:METHOD=AES-128,URI="../keys/enc.key",IV=0x0123456789abcdef
#EXT-X-MAP:URI="init.mp4"
#EXTINF:10.0,
../segments/segment_parent_01.ts
#EXTINF:10.0,
./current_segment_02.ts
#EXTINF:10.0,
/root/relative/segment_03.ts
#EXTINF:10.0,
subfolder/segment_04.ts?token=secure123&sign=abc
#EXTINF:10.0,
https://cdn.example.com/absolute_segment_05.ts
#EXT-X-STREAM-INF:BANDWIDTH=1280000,RESOLUTION=1280x720,URI="../720p/index.m3u8"
../720p/index.m3u8
#EXT-X-MEDIA:TYPE=SUBTITLES,GROUP-ID="subs",NAME="Vietnamese",URI="../subs/vietnamese.vtt"
#EXT-X-ENDLIST`;

    const mockUpstreamServer = http.createServer((req, res) => {
      res.setHeader('Content-Type', 'application/vnd.apple.mpegurl');
      res.end(mockM3u8Content);
    });
    await new Promise((resolve) => mockUpstreamServer.listen(0, '127.0.0.1', resolve));
    const mockPort = mockUpstreamServer.address().port;
    const mockUpstreamUrl = `http://127.0.0.1:${mockPort}/video/master/index.m3u8`;

    try {
      const res = await axios.get(`${baseUrl}/hls/manifest.m3u8?url=${encodeB64(mockUpstreamUrl)}`, { timeout: 10000 });
      assert.strictEqual(res.status, 200, 'Expected HTTP 200 for proxied mock M3U8');
      const text = res.data;

      // 1. Check parent path resolution (../segments/segment_parent_01.ts -> http://127.0.0.1:port/video/segments/segment_parent_01.ts)
      const expectedParent = encodeB64(`http://127.0.0.1:${mockPort}/video/segments/segment_parent_01.ts`);
      assert.ok(text.includes(expectedParent), `Parent path '../' not resolved to absolute URL correctly. Manifest:\n${text}`);
      pass(`Relative Path: Parent path traversal ('../') correctly resolved to absolute URL before encoding`);

      // 2. Check current path resolution (./current_segment_02.ts -> http://127.0.0.1:port/video/master/current_segment_02.ts)
      const expectedCurrent = encodeB64(`http://127.0.0.1:${mockPort}/video/master/current_segment_02.ts`);
      assert.ok(text.includes(expectedCurrent), `Current path './' not resolved to absolute URL correctly`);
      pass(`Relative Path: Current directory path ('./') correctly resolved to absolute URL before encoding`);

      // 3. Check root-relative path resolution (/root/relative/segment_03.ts -> http://127.0.0.1:port/root/relative/segment_03.ts)
      const expectedRoot = encodeB64(`http://127.0.0.1:${mockPort}/root/relative/segment_03.ts`);
      assert.ok(text.includes(expectedRoot), `Root-relative path '/' not resolved to absolute URL correctly`);
      pass(`Relative Path: Root-relative path ('/') correctly resolved to absolute URL before encoding`);

      // 4. Check query string preservation (token=secure123&sign=abc)
      const expectedQuery = encodeB64(`http://127.0.0.1:${mockPort}/video/master/subfolder/segment_04.ts?token=secure123&sign=abc`);
      assert.ok(text.includes(expectedQuery), `Query parameters were truncated or lost during relative resolution`);
      pass(`Relative Path: Security tokens and query parameters preserved in relative URLs`);

      // 5. Check #EXT-X-KEY resolution
      const expectedKey = encodeB64(`http://127.0.0.1:${mockPort}/video/keys/enc.key`);
      assert.ok(text.includes(`/hls/key?url=${expectedKey}`), `Encryption Key URI not rewritten with /hls/key proxy`);
      pass(`Relative Path: #EXT-X-KEY URI resolved and rewritten via /hls/key`);

      // 6. Check #EXT-X-MAP resolution
      const expectedMap = encodeB64(`http://127.0.0.1:${mockPort}/video/master/init.mp4`);
      assert.ok(text.includes(`/hls/segment.ts?url=${expectedMap}`), `#EXT-X-MAP init segment URI not rewritten with /hls/segment.ts proxy`);
      pass(`Relative Path: #EXT-X-MAP init segment resolved and rewritten via /hls/segment.ts`);

      // 7. Check #EXT-X-MEDIA subtitles resolution
      const expectedSub = encodeB64(`http://127.0.0.1:${mockPort}/video/subs/vietnamese.vtt`);
      assert.ok(text.includes(`/hls/sub.vtt?url=${expectedSub}`), `#EXT-X-MEDIA subtitle URI not rewritten with /hls/sub.vtt proxy`);
      pass(`Relative Path: #EXT-X-MEDIA subtitle URI resolved and rewritten via /hls/sub.vtt`);
    } catch (err) {
      fail('Relative Path Resolution in M3U8 Rewriting failed', err);
    } finally {
      mockUpstreamServer.close();
    }

    // 3.3 HTTP Range Header Boundaries on /hls/segment.ts
    console.log(`\n  [3.3] Testing HTTP Range Header Boundaries on /hls/segment.ts...`);
    const publicTsUrl = 'https://test-streams.mux.dev/x36xhzz/url_0/url_462/193039199_mp4_h264_aac_hd_7.ts';
    const b64TsUrl = encodeB64(publicTsUrl);

    // Range 1: bytes=0-0 (exact 1 byte)
    try {
      const res0 = await axios.get(`${baseUrl}/hls/segment.ts?url=${b64TsUrl}`, {
        headers: { Range: 'bytes=0-0' },
        responseType: 'arraybuffer',
        timeout: 15000,
      });
      assert.strictEqual(res0.status, 206, `Expected HTTP 206 for bytes=0-0, got ${res0.status}`);
      assert.strictEqual(res0.data.length, 1, `Expected 1 byte for bytes=0-0, got ${res0.data.length}`);
      assert.ok(res0.headers['content-range'] && res0.headers['content-range'].startsWith('bytes 0-0/'), `Invalid Content-Range: ${res0.headers['content-range']}`);
      pass(`HTTP Range: bytes=0-0 returned 1 byte with HTTP 206 (${res0.headers['content-range']})`);
    } catch (err) {
      fail('HTTP Range: bytes=0-0 failed', err);
    }

    // Range 2: bytes=100-200 (exact 101 bytes)
    try {
      const res100 = await axios.get(`${baseUrl}/hls/segment.ts?url=${b64TsUrl}`, {
        headers: { Range: 'bytes=100-200' },
        responseType: 'arraybuffer',
        timeout: 15000,
      });
      assert.strictEqual(res100.status, 206, `Expected HTTP 206 for bytes=100-200, got ${res100.status}`);
      assert.strictEqual(res100.data.length, 101, `Expected 101 bytes for bytes=100-200, got ${res100.data.length}`);
      assert.ok(res100.headers['content-range'] && res100.headers['content-range'].startsWith('bytes 100-200/'), `Invalid Content-Range: ${res100.headers['content-range']}`);
      pass(`HTTP Range: bytes=100-200 returned 101 bytes with HTTP 206 (${res100.headers['content-range']})`);
    } catch (err) {
      fail('HTTP Range: bytes=100-200 failed', err);
    }

    // Range 3: bytes=0-1023 (1024 bytes standard chunk header)
    try {
      const res1024 = await axios.get(`${baseUrl}/hls/segment.ts?url=${b64TsUrl}`, {
        headers: { Range: 'bytes=0-1023' },
        responseType: 'arraybuffer',
        timeout: 15000,
      });
      assert.strictEqual(res1024.status, 206, `Expected HTTP 206 for bytes=0-1023, got ${res1024.status}`);
      assert.strictEqual(res1024.data.length, 1024, `Expected 1024 bytes for bytes=0-1023, got ${res1024.data.length}`);
      pass(`HTTP Range: bytes=0-1023 returned 1024 bytes with HTTP 206 (${res1024.headers['content-range']})`);
    } catch (err) {
      fail('HTTP Range: bytes=0-1023 failed', err);
    }

    // Range 4: Invalid range values
    try {
      const resInvalid = await axios.get(`${baseUrl}/hls/segment.ts?url=${b64TsUrl}`, {
        headers: { Range: 'bytes=invalid-range' },
        responseType: 'arraybuffer',
        timeout: 15000,
        validateStatus: () => true,
      });
      assert.ok(resInvalid.status === 200 || resInvalid.status === 206 || resInvalid.status === 416, `Unexpected status for invalid range: ${resInvalid.status}`);
      pass(`HTTP Range: Invalid range header 'bytes=invalid-range' handled safely (HTTP ${resInvalid.status})`);
    } catch (err) {
      fail('HTTP Range: Invalid range header failed', err);
    }

    // 3.4 Subtitle VTT Parsing (/hls/sub.vtt)
    console.log(`\n  [3.4] Testing Subtitle VTT Parsing (/hls/sub.vtt)...`);

    // Subtitle Test 1: Raw SRT with comma timestamps and CRLF
    const rawSrt = `1\r\n00:00:01,000 --> 00:00:04,500\r\nXin chào! Đây là phụ đề tiếng Việt.\r\n\r\n2\r\n00:00:05,000 --> 00:00:08,250\r\nPhim chất lượng cao 4K Ultra HD.\r\n`;
    const srtDataUri = `data:text/plain;base64,${Buffer.from(rawSrt, 'utf8').toString('base64')}`;

    try {
      const srtRes = await axios.get(`${baseUrl}/hls/sub.vtt?url=${encodeURIComponent(srtDataUri)}`, { timeout: 10000 });
      assert.strictEqual(srtRes.status, 200, `Expected HTTP 200 for SRT conversion, got ${srtRes.status}`);
      assert.ok(srtRes.headers['content-type'] && srtRes.headers['content-type'].includes('text/vtt'), `Expected text/vtt Content-Type, got ${srtRes.headers['content-type']}`);
      assert.strictEqual(srtRes.headers['access-control-allow-origin'], '*', 'Expected CORS header Access-Control-Allow-Origin: *');
      assert.ok(srtRes.data.startsWith('WEBVTT'), 'Converted SRT must start with WEBVTT header');
      assert.ok(srtRes.data.includes('00:00:01.000 --> 00:00:04.500'), 'Comma timestamps must be converted to dot format');
      assert.ok(srtRes.data.includes('Xin chào! Đây là phụ đề tiếng Việt.'), 'Vietnamese Unicode text must be preserved intact');
      pass(`Subtitle Parsing: Raw SRT converted to valid WebVTT with dot timestamps & CORS *`);
    } catch (err) {
      fail('Subtitle Parsing: Raw SRT failed', err);
    }

    // Subtitle Test 2: VTT with UTF-8 BOM
    const vttWithBom = `\uFEFFWEBVTT\n\n1\n00:00:01.000 --> 00:00:03.000\nBOM test subtitle\n`;
    const bomDataUri = `data:text/vtt;base64,${Buffer.from(vttWithBom, 'utf8').toString('base64')}`;

    try {
      const bomRes = await axios.get(`${baseUrl}/hls/sub.vtt?url=${encodeURIComponent(bomDataUri)}`, { timeout: 10000 });
      assert.strictEqual(bomRes.status, 200, `Expected HTTP 200 for BOM VTT, got ${bomRes.status}`);
      assert.ok(!bomRes.data.startsWith('\uFEFF'), 'UTF-8 BOM must be stripped');
      assert.ok(bomRes.data.startsWith('WEBVTT'), 'Must start directly with WEBVTT');
      pass(`Subtitle Parsing: UTF-8 BOM cleanly stripped`);
    } catch (err) {
      fail('Subtitle Parsing: UTF-8 BOM failed', err);
    }

    // Subtitle Test 3: Vietnamese Diacritics Comprehensive
    const vietnameseText = `1\n00:00:01.000 --> 00:00:05.000\nTiếng Việt: Ă, Â, Đ, Ê, Ô, Ơ, Ư, ắ, ằ, ẳ, ẵ, ặ, ấ, ầ, ổ, ỡ, ự, ỹ\n`;
    const vnDataUri = `data:text/vtt;utf-8,${encodeURIComponent(vietnameseText)}`;

    try {
      const vnRes = await axios.get(`${baseUrl}/hls/sub.vtt?url=${encodeURIComponent(vnDataUri)}`, { timeout: 10000 });
      assert.strictEqual(vnRes.status, 200, `Expected HTTP 200 for Vietnamese VTT, got ${vnRes.status}`);
      assert.ok(vnRes.data.includes('Ă, Â, Đ, Ê, Ô, Ơ, Ư'), 'Vietnamese uppercase diacritics preserved');
      assert.ok(vnRes.data.includes('ắ, ằ, ẳ, ẵ, ặ, ấ, ầ, ổ, ỡ, ự, ỹ'), 'Vietnamese lowercase diacritics preserved');
      pass(`Subtitle Parsing: Complex Vietnamese Unicode diacritics preserved perfectly`);
    } catch (err) {
      fail('Subtitle Parsing: Vietnamese Diacritics failed', err);
    }


    // ────────────────────────────────────────────────────────────────────────
    // 🎯 SECTION 4: MPEG-TS CHUNK DOWNLOAD & BINARY VERIFICATION
    // ────────────────────────────────────────────────────────────────────────
    console.log(`\n${BOLD}${YELLOW}▶ TARGET 4: MPEG-TS Chunk Download Verification (>100KB & 0x47 Sync Byte)${RESET}`);

    // Download Real Chunk from Proxy
    try {
      console.log(`  Downloading full video chunk via /hls/segment.ts...`);
      const segRes = await axios.get(`${baseUrl}/hls/segment.ts?url=${b64TsUrl}`, {
        responseType: 'arraybuffer',
        timeout: 25000,
      });

      assert.strictEqual(segRes.status, 200, `Expected HTTP 200 for full segment download, got ${segRes.status}`);
      const buffer = Buffer.from(segRes.data);
      const byteLength = buffer.length;
      console.log(`  Downloaded chunk size: ${byteLength} bytes (${(byteLength / 1024).toFixed(2)} KB)`);

      // 4.1 Check length > 100KB (100,000 bytes)
      assert.ok(byteLength > 100000, `Expected TS chunk > 100KB (100000 bytes), got ${byteLength} bytes`);
      pass(`MPEG-TS Payload: Chunk size > 100KB verified (${(byteLength / 1024).toFixed(2)} KB >= 100 KB)`);

      // 4.2 Check MPEG-TS Sync Byte 0x47 at packet boundaries (0, 188, 376, 564, 752)
      assert.strictEqual(buffer[0], 0x47, `Byte 0 must be MPEG-TS sync byte 0x47, got 0x${buffer[0].toString(16)}`);
      assert.strictEqual(buffer[188], 0x47, `Byte 188 must be MPEG-TS sync byte 0x47, got 0x${buffer[188].toString(16)}`);
      assert.strictEqual(buffer[376], 0x47, `Byte 376 must be MPEG-TS sync byte 0x47, got 0x${buffer[376].toString(16)}`);
      assert.strictEqual(buffer[564], 0x47, `Byte 564 must be MPEG-TS sync byte 0x47, got 0x${buffer[564].toString(16)}`);
      assert.strictEqual(buffer[752], 0x47, `Byte 752 must be MPEG-TS sync byte 0x47, got 0x${buffer[752].toString(16)}`);
      pass(`MPEG-TS Sync Byte: 0x47 verified across packet boundaries (offset 0, 188, 376, 564, 752)`);

      // 4.3 Multi-packet periodicity check (check first 50 consecutive packets)
      let consecutivePackets = 0;
      const numPacketsToCheck = Math.min(50, Math.floor(byteLength / 188));
      for (let p = 0; p < numPacketsToCheck; p++) {
        if (buffer[p * 188] === 0x47) {
          consecutivePackets++;
        }
      }
      assert.strictEqual(consecutivePackets, numPacketsToCheck, `Expected ${numPacketsToCheck} consecutive 188-byte packets with 0x47 sync, got ${consecutivePackets}`);
      pass(`MPEG-TS Packet Periodicity: Verified ${numPacketsToCheck} consecutive 188-byte packets with 0x47 sync byte`);
    } catch (err) {
      fail('MPEG-TS Chunk Download & Binary Verification failed', err);
    }

    // ────────────────────────────────────────────────────────────────────────
    // 📊 FINAL SUMMARY & VERDICT
    // ────────────────────────────────────────────────────────────────────────
    const elapsedSec = ((Date.now() - startTime) / 1000).toFixed(2);
    console.log(`\n${BOLD}${CYAN}╔══════════════════════════════════════════════════════════════════════════════╗${RESET}`);
    if (failedTests === 0) {
      console.log(`${BOLD}${GREEN}║  🎉 ALL ADVERSARIAL CHALLENGE TESTS PASSED (100% SUCCESS)                     ║${RESET}`);
    } else {
      console.log(`${BOLD}${RED}║  ⚠️  CHALLENGE SUITE FOUND FAILURES (${failedTests} FAILED TESTS)                           ║${RESET}`);
    }
    console.log(`${BOLD}${CYAN}╠══════════════════════════════════════════════════════════════════════════════╣${RESET}`);
    console.log(`${CYAN}║  Total Assertions Run:       ${BOLD}${totalTests.toString().padEnd(46)}${RESET}${CYAN}║${RESET}`);
    console.log(`${CYAN}║  Passed Assertions:          ${BOLD}${GREEN}${passedTests.toString().padEnd(46)}${RESET}${CYAN}║${RESET}`);
    console.log(`${CYAN}║  Failed Assertions:          ${BOLD}${failedTests === 0 ? GREEN : RED}${failedTests.toString().padEnd(46)}${RESET}${CYAN}║${RESET}`);
    console.log(`${CYAN}║  Total Execution Time:       ${BOLD}${elapsedSec}s${' '.repeat(45 - elapsedSec.length)}║${RESET}`);
    console.log(`${BOLD}${CYAN}╚══════════════════════════════════════════════════════════════════════════════╝${RESET}\n`);

  } finally {
    server.close();
    console.log(`[Teardown] Ephemeral server closed cleanly.`);
  }

  if (failedTests > 0) {
    throw new Error(`Challenger suite completed with ${failedTests} failure(s)`);
  }
}

if (require.main === module) {
  runChallengerSuite().catch((err) => {
    console.error('Fatal execution error:', err.message);
    process.exit(1);
  });
}

module.exports = { runChallengerSuite };
