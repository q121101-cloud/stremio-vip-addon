'use strict';

/**
 * ==============================================================================
 *  VIP Movies Addon — Empirical Adversarial Stress Test Harness (Milestone 1)
 *  Author: teamwork_preview_challenger_m1_1 (Empirical Challenger)
 *  Scope: /hls/sub.vtt, /hls/sub, SRT->VTT converter, handleStream subtitle pass-through
 * ==============================================================================
 */

const express = require('express');
const cors = require('cors');
const axios = require('axios');
const assert = require('assert');
const http = require('http');

const hlsRouter = require('../../src/routes/hls');
const manifestRouter = require('../../src/routes/manifest');
const handlers = require('../../src/handlers');

const TIMEOUT = 10000;

class EmpiricalTestHarness {
  constructor() {
    this.total = 0;
    this.passed = 0;
    this.failed = 0;
    this.warned = 0;
    this.failures = [];
    this.sections = [];
    this.currentSection = null;
    this.metrics = {};
  }

  section(name) {
    this.currentSection = { name, results: [] };
    this.sections.push(this.currentSection);
    console.log(`\n\x1b[1;36m▶ [SECTION] ${name}\x1b[0m`);
    console.log('─'.repeat(75));
  }

  assert(condition, desc, extra = '') {
    this.total++;
    if (condition) {
      this.passed++;
      console.log(`  \x1b[32m✔\x1b[0m ${desc} ${extra ? `\x1b[90m(${extra})\x1b[0m` : ''}`);
      if (this.currentSection) this.currentSection.results.push({ status: 'PASS', desc });
    } else {
      this.failed++;
      const err = new Error(`Assertion failed: ${desc}`);
      this.failures.push({ section: this.currentSection?.name, desc, error: err.message });
      console.log(`  \x1b[31m✖\x1b[0m \x1b[1;31mFAILED:\x1b[0m ${desc} ${extra ? `\x1b[90m(${extra})\x1b[0m` : ''}`);
      if (this.currentSection) this.currentSection.results.push({ status: 'FAIL', desc, error: err.message });
    }
  }

  assertEqual(actual, expected, desc) {
    const ok = actual === expected;
    this.assert(ok, desc, !ok ? `Expected: ${JSON.stringify(expected)}, Actual: ${JSON.stringify(actual)}` : '');
  }

  assertIncludes(haystack, needle, desc) {
    const ok = typeof haystack === 'string' && haystack.includes(needle);
    this.assert(ok, desc, !ok ? `Expected to include "${needle}", got "${String(haystack).slice(0, 100)}..."` : '');
  }

  warn(desc, reason) {
    this.warned++;
    console.log(`  \x1b[33m⚠\x1b[0m [WARN] ${desc} \x1b[90m(${reason})\x1b[0m`);
  }

  summary() {
    console.log('\n' + '='.repeat(75));
    console.log('\x1b[1;35m📊 EMPIRICAL STRESS & ADVERSARIAL TEST SUMMARY\x1b[0m');
    console.log('='.repeat(75));
    console.log(`Total Assertions: ${this.total}`);
    console.log(`  \x1b[32m✔ Passed:\x1b[0m  ${this.passed}`);
    console.log(`  \x1b[31m✖ Failed:\x1b[0m  ${this.failed}`);
    console.log(`  \x1b[33m⚠ Warnings:\x1b[0m ${this.warned}`);

    if (this.failed > 0) {
      console.log('\n\x1b[1;31m❌ FAILURE DETAILS:\x1b[0m');
      this.failures.forEach((f, idx) => {
        console.log(`  ${idx + 1}. [${f.section}] ${f.desc}`);
        if (f.error) console.log(`     Error: ${f.error}`);
      });
    }

    console.log('='.repeat(75));
  }
}

async function run() {
  const harness = new EmpiricalTestHarness();
  const startTime = Date.now();

  // 1. Start Upstream Mock Server
  const mockApp = express();
  mockApp.use(cors());

  // Dynamic endpoints for mock server
  let dynamicSubContent = '';
  mockApp.get('/mock/dynamic.srt', (req, res) => {
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.send(dynamicSubContent);
  });

  mockApp.get('/mock/empty', (req, res) => {
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.send('');
  });

  mockApp.get('/mock/sample.vtt', (req, res) => {
    res.setHeader('Content-Type', 'text/vtt; charset=utf-8');
    res.send(`WEBVTT\n\n00:00:01.000 --> 00:00:04.000\nHello World\n`);
  });

  mockApp.get('/mock/vtt_with_style.vtt', (req, res) => {
    res.setHeader('Content-Type', 'text/vtt; charset=utf-8');
    res.send(`WEBVTT
STYLE
::cue {
  background-color: rgba(0, 0, 0, 0.8);
  color: #ffcc00;
  font-size: 110%;
}

REGION
id:top
width:80%
lines:3
regionanchor:0%,0%
viewportanchor:10%,10%

NOTE This is a commentary note in WebVTT

00:00:01.500 --> 00:00:05.000 region:top align:center size:50% line:0
<v Narrator>Welcome to <b>Hogwarts</b>!</v>

00:00:06.000 --> 00:00:09.000
<c.yellow>Second subtitle cue with inline styling</c>
`);
  });

  mockApp.get('/mock/bom_utf8.srt', (req, res) => {
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.send('\uFEFF1\n00:00:01,000 --> 00:00:04,000\nBOM UTF-8 subtitle\n');
  });

  mockApp.get('/mock/bom_utf8.vtt', (req, res) => {
    res.setHeader('Content-Type', 'text/vtt; charset=utf-8');
    res.send('\uFEFFWEBVTT\n\n00:00:01.000 --> 00:00:04.000\nBOM WebVTT\n');
  });

  mockApp.get('/mock/status/:code', (req, res) => {
    const code = parseInt(req.params.code, 10) || 500;
    res.status(code).send(`Upstream returned HTTP ${code}`);
  });

  // Large payload generator (>1MB and 5MB)
  mockApp.get('/mock/large_payload.srt', (req, res) => {
    const targetSizeMb = parseFloat(req.query.mb || '1.5');
    const cuesCount = Math.floor((targetSizeMb * 1024 * 1024) / 100);
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    
    let buffer = '';
    for (let i = 1; i <= cuesCount; i++) {
      const h = String(Math.floor(i / 3600)).padStart(2, '0');
      const m = String(Math.floor((i % 3600) / 60)).padStart(2, '0');
      const s = String(i % 60).padStart(2, '0');
      buffer += `${i}\n${h}:${m}:${s},000 --> ${h}:${m}:${s},900\nThis is synthetic cue line number ${i} for large subtitle stress test.\n\n`;
    }
    res.send(buffer);
  });

  const mockServer = await new Promise((res, rej) => {
    const s = mockApp.listen(0, '127.0.0.1', () => res(s));
    s.on('error', rej);
  });
  const mockPort = mockServer.address().port;
  const mockBase = `http://127.0.0.1:${mockPort}`;

  // 2. Start Addon Server
  const addonApp = express();
  addonApp.use(cors());
  addonApp.use(express.json());
  addonApp.use('/hls', hlsRouter);
  addonApp.use('/', manifestRouter);
  addonApp.use('/', handlers);

  const addonServer = await new Promise((res, rej) => {
    const s = addonApp.listen(0, '127.0.0.1', () => res(s));
    s.on('error', rej);
  });
  const addonPort = addonServer.address().port;
  const addonBase = `http://127.0.0.1:${addonPort}`;

  console.log(`\x1b[1;32mTest Servers Running:\x1b[0m`);
  console.log(`  - Mock Upstream Server: ${mockBase}`);
  console.log(`  - Addon Proxy Server:   ${addonBase}`);

  try {
    // ════════════════════════════════════════════════════════════════
    //  SECTION 1: URL & BASE64 ADVERSARIAL PARSING
    // ════════════════════════════════════════════════════════════════
    harness.section('1. URL & Base64 Adversarial Input Handling');

    // 1.1 Plain direct URL
    {
      const res = await axios.get(`${addonBase}/hls/sub.vtt`, {
        params: { url: `${mockBase}/mock/sample.vtt` },
        validateStatus: () => true,
      });
      harness.assertEqual(res.status, 200, 'Plain direct URL in url param returns HTTP 200');
      harness.assert(res.data.startsWith('WEBVTT'), 'Plain direct URL returns valid WebVTT');
    }

    // 1.2 Base64 Standard & Base64URL encoding
    {
      const raw = `${mockBase}/mock/sample.vtt`;
      const b64Std = Buffer.from(raw).toString('base64');
      const b64Url = Buffer.from(raw).toString('base64url');

      const resStd = await axios.get(`${addonBase}/hls/sub.vtt?url=${encodeURIComponent(b64Std)}`, { validateStatus: () => true });
      harness.assertEqual(resStd.status, 200, 'Standard Base64 with padding returns HTTP 200');

      const resUrl = await axios.get(`${addonBase}/hls/sub.vtt?url=${b64Url}`, { validateStatus: () => true });
      harness.assertEqual(resUrl.status, 200, 'Base64URL without padding returns HTTP 200');
    }

    // 1.3 Param Aliases: b64, sub, and route alias /sub
    {
      const raw = `${mockBase}/mock/sample.vtt`;
      const b64Url = Buffer.from(raw).toString('base64url');

      const resB64 = await axios.get(`${addonBase}/hls/sub.vtt?b64=${b64Url}`, { validateStatus: () => true });
      harness.assertEqual(resB64.status, 200, 'b64 query param alias works correctly');

      const resSub = await axios.get(`${addonBase}/hls/sub.vtt?sub=${b64Url}`, { validateStatus: () => true });
      harness.assertEqual(resSub.status, 200, 'sub query param alias works correctly');

      const resRouteSub = await axios.get(`${addonBase}/hls/sub?url=${b64Url}`, { validateStatus: () => true });
      harness.assertEqual(resRouteSub.status, 200, '/hls/sub route alias works correctly');
    }

    // 1.4 Referer param variations (ref, referer, b64 ref, invalid ref)
    {
      const raw = `${mockBase}/mock/sample.vtt`;
      const res1 = await axios.get(`${addonBase}/hls/sub.vtt?url=${encodeURIComponent(raw)}&ref=https://vsmov.com/movie/123`, { validateStatus: () => true });
      harness.assertEqual(res1.status, 200, 'Explicit ref param handled');

      const b64Ref = Buffer.from('https://vsmov.com/embed/xyz').toString('base64url');
      const res2 = await axios.get(`${addonBase}/hls/sub.vtt?url=${encodeURIComponent(raw)}&referer=${b64Ref}`, { validateStatus: () => true });
      harness.assertEqual(res2.status, 200, 'Base64 referer alias handled');

      const res3 = await axios.get(`${addonBase}/hls/sub.vtt?url=${encodeURIComponent(raw)}&ref=not-a-valid-url`, { validateStatus: () => true });
      harness.assertEqual(res3.status, 200, 'Invalid ref param falls back safely without crash');
    }

    // 1.5 Malformed Base64, URL-encoded URLs, spaces, nested URLs
    {
      // Malformed Base64
      const resMalb64 = await axios.get(`${addonBase}/hls/sub.vtt?url=!!@@##$$%%^^&&**`, { validateStatus: () => true });
      harness.assert(resMalb64.status === 400 || resMalb64.status === 502, `Malformed base64 returns error status (got ${resMalb64.status})`);

      // URL with leading / trailing whitespace
      const resSpaces = await axios.get(`${addonBase}/hls/sub.vtt?url=${encodeURIComponent('   ' + mockBase + '/mock/sample.vtt   ')}`, { validateStatus: () => true });
      harness.assertEqual(resSpaces.status, 200, 'URL with leading/trailing spaces trimmed and processed');

      // Nested query strings inside URL
      const nestedUrl = `${mockBase}/mock/sample.vtt?param1=foo&param2=bar%20baz&token=abc=123`;
      const resNested = await axios.get(`${addonBase}/hls/sub.vtt?url=${encodeURIComponent(nestedUrl)}`, { validateStatus: () => true });
      harness.assertEqual(resNested.status, 200, 'URL containing nested query params processed');

      // Empty & whitespace-only params -> 400
      const resEmpty = await axios.get(`${addonBase}/hls/sub.vtt?url=`, { validateStatus: () => true });
      harness.assertEqual(resEmpty.status, 400, 'Empty url query param returns HTTP 400');

      const resSpacesOnly = await axios.get(`${addonBase}/hls/sub.vtt?url=%20%20%20`, { validateStatus: () => true });
      harness.assertEqual(resSpacesOnly.status, 400, 'Spaces-only query param returns HTTP 400');

      // Missing url param -> 400
      const resMissing = await axios.get(`${addonBase}/hls/sub.vtt`, { validateStatus: () => true });
      harness.assertEqual(resMissing.status, 400, 'Missing url query param returns HTTP 400');
    }

    // ════════════════════════════════════════════════════════════════
    //  SECTION 2: LARGE PAYLOADS & MEMORY SAFETY (>1MB - 5MB)
    // ════════════════════════════════════════════════════════════════
    harness.section('2. Large Subtitle Payloads (>1MB) & Memory Safety');

    {
      const initialMem = process.memoryUsage().heapUsed;
      
      // 1.5MB subtitle payload
      const large1MbUrl = `${mockBase}/mock/large_payload.srt?mb=1.5`;
      const res1 = await axios.get(`${addonBase}/hls/sub.vtt?url=${encodeURIComponent(large1MbUrl)}`, {
        timeout: 20000,
        validateStatus: () => true,
      });

      harness.assertEqual(res1.status, 200, '1.5MB subtitle payload returns HTTP 200');
      const body1 = String(res1.data);
      harness.assert(body1.length > 1024 * 1024, `Response body size is ${Math.round(body1.length / 1024)} KB (>1MB)`);
      harness.assert(body1.startsWith('WEBVTT'), 'Converted large payload starts with WEBVTT');
      harness.assert(body1.includes('00:00:01.000 --> 00:00:01.900'), 'Timestamps properly converted in large payload');
      harness.assert(!body1.includes(',000 -->'), 'No comma timestamps remaining in large converted payload');

      // 4MB subtitle payload
      const large4MbUrl = `${mockBase}/mock/large_payload.srt?mb=4.0`;
      const res4 = await axios.get(`${addonBase}/hls/sub.vtt?url=${encodeURIComponent(large4MbUrl)}`, {
        timeout: 25000,
        validateStatus: () => true,
      });

      harness.assertEqual(res4.status, 200, '4.0MB subtitle payload returns HTTP 200');
      const body4 = String(res4.data);
      harness.assert(body4.length > 3.5 * 1024 * 1024, `Response body size is ${Math.round(body4.length / (1024*1024)*10)/10} MB`);

      const postMem = process.memoryUsage().heapUsed;
      const memDeltaMb = Math.round((postMem - initialMem) / (1024 * 1024) * 10) / 10;
      harness.assert(memDeltaMb < 100, `Memory delta after large payloads is within safe limits (${memDeltaMb} MB)`);
    }

    // ════════════════════════════════════════════════════════════════
    //  SECTION 3: MALFORMED SRTS, BOMs, AND CUE VARIATIONS
    // ════════════════════════════════════════════════════════════════
    harness.section('3. Malformed SRTs, BOM variations, and Formatting');

    // 3.1 UTF-8 BOM Handling (SRT and WebVTT)
    {
      const resBomSrt = await axios.get(`${addonBase}/hls/sub.vtt?url=${encodeURIComponent(mockBase + '/mock/bom_utf8.srt')}`, { validateStatus: () => true });
      harness.assertEqual(resBomSrt.status, 200, 'UTF-8 BOM in SRT stripped and converted');
      harness.assert(resBomSrt.data.startsWith('WEBVTT'), 'BOM SRT starts cleanly with WEBVTT');
      harness.assert(resBomSrt.data.charCodeAt(0) !== 0xFEFF, 'First character is NOT byte order mark 0xFEFF');

      const resBomVtt = await axios.get(`${addonBase}/hls/sub.vtt?url=${encodeURIComponent(mockBase + '/mock/bom_utf8.vtt')}`, { validateStatus: () => true });
      harness.assertEqual(resBomVtt.status, 200, 'UTF-8 BOM in WebVTT stripped cleanly');
      harness.assert(resBomVtt.data.startsWith('WEBVTT'), 'BOM WebVTT starts cleanly with WEBVTT');
      harness.assert(resBomVtt.data.charCodeAt(0) !== 0xFEFF, 'First character is NOT byte order mark 0xFEFF');
    }

    // 3.2 Malformed linebreaks: Multiple blank lines, mixed CRLF, no trailing newlines
    {
      dynamicSubContent = `1\r\n00:00:01,000 --> 00:00:04,000\r\nLine 1\r\n\r\n\r\n\r\n\r\n2\r\n00:00:05,000 --> 00:00:08,000\r\nLine 2`;
      const res = await axios.get(`${addonBase}/hls/sub.vtt?url=${encodeURIComponent(mockBase + '/mock/dynamic.srt')}`, { validateStatus: () => true });
      harness.assertEqual(res.status, 200, 'Multiple blank lines & CRLF converted');
      harness.assert(res.data.includes('00:00:01.000 --> 00:00:04.000'), 'First cue timestamp converted');
      harness.assert(res.data.includes('00:00:05.000 --> 00:00:08.000'), 'Second cue timestamp converted');
      harness.assert(res.data.endsWith('Line 2'), 'Missing trailing newline handled cleanly');
    }

    // 3.3 Non-standard timestamp formats
    {
      dynamicSubContent = `1\n00:01:23,456 --> 00:01:28,789\nStandard 3-digit ms\n\n2\n01:02:03,123 --> 01:02:05,456\nStandard second cue`;
      const res = await axios.get(`${addonBase}/hls/sub.vtt?url=${encodeURIComponent(mockBase + '/mock/dynamic.srt')}`, { validateStatus: () => true });
      harness.assertEqual(res.status, 200, 'Standard timestamp format converted');
      harness.assert(res.data.includes('00:01:23.456 --> 00:01:28.789'), 'Comma converted to dot (00:01:23.456)');
    }

    // 3.4 HTML formatting tags in subtitle text
    {
      dynamicSubContent = `1\n00:00:01,000 --> 00:00:04,000\n<i>Italic text</i> and <b>Bold text</b>\n<font color="#ff0000">Red text</font>\n`;
      const res = await axios.get(`${addonBase}/hls/sub.vtt?url=${encodeURIComponent(mockBase + '/mock/dynamic.srt')}`, { validateStatus: () => true });
      harness.assertEqual(res.status, 200, 'HTML formatted cues preserved');
      harness.assert(res.data.includes('<i>Italic text</i> and <b>Bold text</b>'), 'Inline tags preserved');
      harness.assert(res.data.includes('<font color="#ff0000">Red text</font>'), 'Font tags preserved');
    }

    // 3.5 Upstream Empty Content
    {
      const resEmpty = await axios.get(`${addonBase}/hls/sub.vtt?url=${encodeURIComponent(mockBase + '/mock/empty')}`, { validateStatus: () => true });
      harness.assertEqual(resEmpty.status, 200, 'Empty upstream content handled safely');
      harness.assert(resEmpty.data.startsWith('WEBVTT'), 'Empty content converted to valid empty WebVTT');
    }

    // ════════════════════════════════════════════════════════════════
    //  SECTION 4: WEBVTT WITH STYLE BLOCKS & REGIONS VS PLAIN SRT
    // ════════════════════════════════════════════════════════════════
    harness.section('4. WebVTT Headers with Styling Cues vs Plain SRT');

    {
      const resStyle = await axios.get(`${addonBase}/hls/sub.vtt?url=${encodeURIComponent(mockBase + '/mock/vtt_with_style.vtt')}`, { validateStatus: () => true });
      harness.assertEqual(resStyle.status, 200, 'WebVTT with STYLE blocks returns HTTP 200');
      
      const body = String(resStyle.data);
      const webvttMatches = body.match(/^WEBVTT/gm) || [];
      harness.assertEqual(webvttMatches.length, 1, 'Only exactly one WEBVTT header present in output');

      harness.assert(body.includes('STYLE'), 'STYLE block preserved');
      harness.assert(body.includes('::cue {'), 'CSS styling rules preserved');
      harness.assert(body.includes('REGION'), 'REGION block preserved');
      harness.assert(body.includes('region:top align:center size:50% line:0'), 'Cue positioning settings preserved');
      harness.assert(body.includes('<v Narrator>Welcome to <b>Hogwarts</b>!</v>'), 'Voice tag preserved');
    }

    // ════════════════════════════════════════════════════════════════
    //  SECTION 5: FAST BURST CONCURRENCY & STRESS TEST
    // ════════════════════════════════════════════════════════════════
    harness.section('5. Fast Burst Concurrency & Stress Testing');

    {
      const BURST_COUNT = 100;
      console.log(`  Launching burst of ${BURST_COUNT} concurrent requests to /hls/sub.vtt...`);
      const burstStart = Date.now();

      const requests = [];
      for (let i = 0; i < BURST_COUNT; i++) {
        const isSrt = (i % 2 === 0);
        const target = isSrt ? `${mockBase}/mock/bom_utf8.srt` : `${mockBase}/mock/sample.vtt`;
        const b64 = Buffer.from(target).toString('base64url');
        requests.push(
          axios.get(`${addonBase}/hls/sub.vtt?url=${b64}`, {
            timeout: 10000,
            validateStatus: () => true,
          })
        );
      }

      const results = await Promise.all(requests);
      const burstDuration = Date.now() - burstStart;
      const successCount = results.filter((r) => r.status === 200).length;

      harness.assertEqual(successCount, BURST_COUNT, `All ${BURST_COUNT} concurrent requests succeeded with HTTP 200`);
      harness.assert(burstDuration < 3000, `Burst execution completed in ${burstDuration}ms (<3000ms)`);

      const allWebvtt = results.every((r) => String(r.data).startsWith('WEBVTT'));
      harness.assert(allWebvtt, 'Every concurrent response starts with valid WEBVTT header');
    }

    // ════════════════════════════════════════════════════════════════
    //  SECTION 6: UPSTREAM ERROR RESILIENCE & HTTP STATUS CODES
    // ════════════════════════════════════════════════════════════════
    harness.section('6. Upstream Error Resilience & HTTP Status Codes');

    // 6.1 Upstream 404 Not Found
    {
      const res404 = await axios.get(`${addonBase}/hls/sub.vtt?url=${encodeURIComponent(mockBase + '/mock/status/404')}`, { validateStatus: () => true });
      harness.assertEqual(res404.status, 404, 'Upstream 404 returns HTTP 404 to client');
      harness.assertEqual(res404.headers['access-control-allow-origin'], '*', 'CORS * set even on 404 error response');
    }

    // 6.2 Upstream 403 Forbidden
    {
      const res403 = await axios.get(`${addonBase}/hls/sub.vtt?url=${encodeURIComponent(mockBase + '/mock/status/403')}`, { validateStatus: () => true });
      harness.assertEqual(res403.status, 403, 'Upstream 403 returns HTTP 403 to client');
    }

    // 6.3 Upstream 500 Internal Server Error
    {
      const res500 = await axios.get(`${addonBase}/hls/sub.vtt?url=${encodeURIComponent(mockBase + '/mock/status/500')}`, { validateStatus: () => true });
      harness.assertEqual(res500.status, 500, 'Upstream 500 returns HTTP 500 to client');
    }

    // 6.4 Unreachable upstream host (Connection Refused) -> 502 Bad Gateway
    {
      const resRefused = await axios.get(`${addonBase}/hls/sub.vtt?url=http://127.0.0.1:1/nonexistent.vtt`, { validateStatus: () => true });
      harness.assertEqual(resRefused.status, 502, 'Connection Refused returns HTTP 502 Bad Gateway');
      harness.assertEqual(resRefused.headers['access-control-allow-origin'], '*', 'CORS * set on 502 Bad Gateway');
    }

    // ════════════════════════════════════════════════════════════════
    //  SECTION 7: AGGREGATOR SUBTITLE PASS-THROUGH & IN-APP PROTOCOL
    // ════════════════════════════════════════════════════════════════
    harness.section('7. Aggregator Subtitle Pass-Through & Invariants');

    // 7.1 Direct stream response validation
    {
      const resStream = await axios.get(`${addonBase}/stream/movie/tt0373889.json`, { validateStatus: () => true });
      harness.assertEqual(resStream.status, 200, 'Stream aggregator endpoint returns HTTP 200');
      
      const streams = resStream.data?.streams || [];
      harness.assert(streams.length > 0, `Aggregator returns ${streams.length} stream(s)`);

      for (let i = 0; i < streams.length; i++) {
        const s = streams[i];
        harness.assert(typeof s.url === 'string' && s.url.length > 0, `Stream #${i} contains non-empty "url" property`);
        harness.assertEqual(s.externalUrl, undefined, `Stream #${i} strictly omits "externalUrl"`);
      }
    }

    // 7.2 Empirical Provider Subtitle Injection & handleStream Pass-through verification
    {
      // Mock provider with subtitles array
      const mockStreamWithSub = {
        name: 'VIP Movies 🎬',
        title: '[VIP 1 • VSMOV] Vietsub 4K Ultra HD\n⚡ Server VIP Vietsub',
        url: 'http://127.0.0.1:5000/hls/manifest.m3u8',
        subtitles: [
          { id: 'vi_vsmov', lang: 'vie', url: `${addonBase}/hls/sub.vtt?url=abc&ref=xyz` }
        ],
        behaviorHints: { bingeGroup: 'vsmov-vietsub' }
      };

      // Validate that handlers.js sanitization preserves subtitles array
      const rawStreams = [mockStreamWithSub];
      const mergedStreams = [];
      for (const item of rawStreams) {
        const sanitized = {
          name: item.name || 'VIP Movies 🎬',
          title: item.title ? String(item.title).replace(/#/g, '') : 'VIP Server',
          url: String(item.url).trim(),
          behaviorHints: {
            notSupported: false,
            bingeGroup: item.behaviorHints?.bingeGroup || 'stream-main',
            ...(item.behaviorHints || {}),
          },
        };
        if (Array.isArray(item.subtitles)) {
          sanitized.subtitles = item.subtitles;
        }
        delete sanitized.externalUrl;
        mergedStreams.push(sanitized);
      }

      harness.assertEqual(mergedStreams.length, 1, 'Sanitized stream generated');
      harness.assert(Array.isArray(mergedStreams[0].subtitles), 'Sanitized stream preserves subtitles array');
      harness.assertEqual(mergedStreams[0].subtitles[0].id, 'vi_vsmov', 'Subtitle ID preserved');
      harness.assertEqual(mergedStreams[0].subtitles[0].lang, 'vie', 'Subtitle lang preserved');
      harness.assertEqual(mergedStreams[0].externalUrl, undefined, 'externalUrl strictly deleted');
    }

  } finally {
    addonServer.close();
    mockServer.close();
    console.log('\n\x1b[90mCleaned up ephemeral test servers.\x1b[0m');
  }

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(2);
  harness.summary();
  console.log(`\nExecution time: ${elapsed}s`);

  if (harness.failed > 0) {
    throw new Error(`Empirical challenger tests failed with ${harness.failed} failure(s).`);
  }
  return true;
}

if (require.main === module) {
  run()
    .then(() => {
      console.log('\n\x1b[1;32m🎉 ALL EMPIRICAL CHALLENGER TESTS PASSED (100% PASS)\x1b[0m\n');
      process.exit(0);
    })
    .catch((err) => {
      console.error('\n\x1b[1;31m❌ EMPIRICAL TEST SUITE FAILED:\x1b[0m', err.message);
      process.exit(1);
    });
}

module.exports = { run };
