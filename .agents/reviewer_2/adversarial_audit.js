'use strict';

const assert = require('assert');
const http = require('http');
const express = require('express');
const cors = require('cors');
const axios = require('axios');

// Import project modules
const vsmov = require('../../src/providers/vsmov');
const kkphim = require('../../src/providers/kkphim');
const hlsRouter = require('../../src/routes/hls');
const manifestRouter = require('../../src/routes/manifest');
const handlers = require('../../src/handlers');
const pkg = require('../../package.json');
const manifestModule = require('../../src/manifest');

console.log('═══════════════════════════════════════════════════════════════');
console.log('🔍 REVIEWER 2 ADVERSARIAL AUDIT & EMPIRICAL STRESS TEST SUITE');
console.log('═══════════════════════════════════════════════════════════════\n');

let passedAssertions = 0;
let totalAssertions = 0;

function check(desc, fn) {
  totalAssertions++;
  try {
    fn();
    passedAssertions++;
    console.log(`  ✅ PASS: ${desc}`);
  } catch (err) {
    console.error(`  ❌ FAIL: ${desc}`);
    console.error(`     Error: ${err.message}`);
    throw err;
  }
}

async function asyncCheck(desc, fn) {
  totalAssertions++;
  try {
    await fn();
    passedAssertions++;
    console.log(`  ✅ PASS: ${desc}`);
  } catch (err) {
    console.error(`  ❌ FAIL: ${desc}`);
    console.error(`     Error: ${err.message}`);
    throw err;
  }
}

async function runAudit() {
  // ─── 1. VERSION CONSISTENCY & UI INTEGRITY ────────────────────
  console.log('\n▶ SUITE 1: Version Consistency & UI Integrity');
  check('package.json version is 1.5.1', () => {
    assert.strictEqual(pkg.version, '1.5.1');
  });

  check('src/manifest.js MANIFEST version is 1.5.1', () => {
    assert.strictEqual(manifestModule.MANIFEST.version, '1.5.1');
  });

  const app = express();
  app.use(cors());
  app.use(express.json());
  app.use('/hls', hlsRouter);
  app.use('/', manifestRouter);
  app.use('/', handlers);

  const server = await new Promise((resolve) => {
    const s = app.listen(0, '127.0.0.1', () => resolve(s));
  });
  const port = server.address().port;
  const baseUrl = `http://127.0.0.1:${port}`;

  try {
    await asyncCheck('/health returns version 1.5.1', async () => {
      const res = await axios.get(`${baseUrl}/health`);
      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.data.version, '1.5.1');
      assert.strictEqual(res.data.status, 'ok');
    });

    await asyncCheck('Configurator UI page (GET /) includes v1.5.1 badge and brand footer', async () => {
      const res = await axios.get(`${baseUrl}/`);
      assert.strictEqual(res.status, 200);
      assert.ok(res.data.includes('v1.5.1'), 'Must include v1.5.1');
      assert.ok(res.data.includes('VIP Movies Addon v1.5.1 • Powered by <span class="brand-highlight">Q121101</span>'), 'Must include exact brand footer');
    });

    // ─── 2. VSMOV AUDIO CLASSIFICATION & ADVERSARIAL CASES ────────
    console.log('\n▶ SUITE 2: VSMOV Audio Classification & Stream Separation');
    const audioCases = [
      { input: 'Vietsub', expType: 'vietsub', expLabel: 'Vietsub', expBinge: 'vsmov-vietsub-4k-vip-1' },
      { input: 'VIP Vietsub #1', expType: 'vietsub', expLabel: 'Vietsub', expBinge: 'vsmov-vietsub-4k-vip-1' },
      { input: 'Vietsub 4K Ultra HD', expType: 'vietsub', expLabel: 'Vietsub', expBinge: 'vsmov-vietsub-4k-vip-1' },
      { input: 'Lồng Tiếng', expType: 'longtieng', expLabel: 'Lồng Tiếng', expBinge: 'vsmov-longtieng-4k-vip-1' },
      { input: 'Lồng tiếng HTV3', expType: 'longtieng', expLabel: 'Lồng Tiếng', expBinge: 'vsmov-longtieng-4k-vip-1' },
      { input: 'Long Tieng', expType: 'longtieng', expLabel: 'Lồng Tiếng', expBinge: 'vsmov-longtieng-4k-vip-1' },
      { input: 'Thuyết Minh', expType: 'thuyetminh', expLabel: 'Thuyết Minh', expBinge: 'vsmov-thuyetminh-4k-vip-1' },
      { input: 'Thuyết minh giọng Bắc', expType: 'thuyetminh', expLabel: 'Thuyết Minh', expBinge: 'vsmov-thuyetminh-4k-vip-1' },
      { input: 'Thuyet Minh', expType: 'thuyetminh', expLabel: 'Thuyết Minh', expBinge: 'vsmov-thuyetminh-4k-vip-1' },
      { input: 'Server VIP 1', expType: 'vietsub', expLabel: 'Vietsub', expBinge: 'vsmov-vietsub-4k-vip-1' },
      { input: '', expType: 'vietsub', expLabel: 'Vietsub', expBinge: 'vsmov-vietsub-4k-vip-1' },
      { input: null, expType: 'vietsub', expLabel: 'Vietsub', expBinge: 'vsmov-vietsub-4k-vip-1' },
    ];

    for (const ac of audioCases) {
      check(`classifyServerAudio("${ac.input}") -> ${ac.expLabel}`, () => {
        const res = vsmov.classifyServerAudio(ac.input);
        assert.strictEqual(res.type, ac.expType);
        assert.strictEqual(res.label, ac.expLabel);
        assert.strictEqual(res.bingeGroup, ac.expBinge);
      });
    }

    // ─── 3. KKPHIM MATCH EPISODE ITEM ADVERSARIAL STRESS TEST ──────
    console.log('\n▶ SUITE 3: KKPhim Flexible Episode Matcher Stress Test');
    const kkTestCases = [
      // Exact name matches
      { ep: { name: '1' }, targetStr: '1', targetNum: 1, expected: true, desc: 'name: "1"' },
      { ep: { name: '01' }, targetStr: '1', targetNum: 1, expected: true, desc: 'name: "01" (padded 2)' },
      { ep: { name: '001' }, targetStr: '1', targetNum: 1, expected: true, desc: 'name: "001" (padded 3)' },
      { ep: { name: 'Tập 1' }, targetStr: '1', targetNum: 1, expected: true, desc: 'name: "Tập 1"' },
      { ep: { name: 'Tập 01' }, targetStr: '1', targetNum: 1, expected: true, desc: 'name: "Tập 01"' },
      { ep: { name: 'Tập01' }, targetStr: '1', targetNum: 1, expected: true, desc: 'name: "Tập01"' },
      { ep: { name: 'Episode 1' }, targetStr: '1', targetNum: 1, expected: true, desc: 'name: "Episode 1"' },
      { ep: { name: 'EP 01' }, targetStr: '1', targetNum: 1, expected: true, desc: 'name: "EP 01"' },
      // Slug matches
      { ep: { slug: 'tap-1' }, targetStr: '1', targetNum: 1, expected: true, desc: 'slug: "tap-1"' },
      { ep: { slug: 'tap-01' }, targetStr: '1', targetNum: 1, expected: true, desc: 'slug: "tap-01"' },
      { ep: { slug: 'episode-1' }, targetStr: '1', targetNum: 1, expected: true, desc: 'slug: "episode-1"' },
      { ep: { slug: 'ep-01' }, targetStr: '1', targetNum: 1, expected: true, desc: 'slug: "ep-01"' },
      { ep: { slug: 'phim-bo-tap-1' }, targetStr: '1', targetNum: 1, expected: true, desc: 'slug: "phim-bo-tap-1"' },
      { ep: { slug: 'breaking-bad-1' }, targetStr: '1', targetNum: 1, expected: true, desc: 'slug: "breaking-bad-1"' },
      { ep: { slug: 'breaking-bad-01' }, targetStr: '1', targetNum: 1, expected: true, desc: 'slug: "breaking-bad-01"' },
      // Multi-digit episodes
      { ep: { name: '25', slug: 'tap-25' }, targetStr: '25', targetNum: 25, expected: true, desc: 'name: "25"' },
      { ep: { name: 'Tập 120', slug: 'tap-120' }, targetStr: '120', targetNum: 120, expected: true, desc: 'name: "Tập 120"' },
      // Mismatches
      { ep: { name: '2', slug: 'tap-2' }, targetStr: '1', targetNum: 1, expected: false, desc: 'name: "2" vs target 1 (Mismatch)' },
      { ep: { name: '10', slug: 'tap-10' }, targetStr: '1', targetNum: 1, expected: false, desc: 'name: "10" vs target 1 (Mismatch)' },
      { ep: null, targetStr: '1', targetNum: 1, expected: false, desc: 'null episode object' },
      { ep: {}, targetStr: '1', targetNum: 1, expected: false, desc: 'empty episode object' },
    ];

    for (const tc of kkTestCases) {
      check(`matchEpisodeItem (${tc.desc})`, () => {
        const match = kkphim.matchEpisodeItem(tc.ep, tc.targetStr, tc.targetNum);
        assert.strictEqual(match, tc.expected);
      });
    }

    // ─── 4. SUBTITLE PROXY ENDPOINT & SRT CONVERSION ──────────────
    console.log('\n▶ SUITE 4: Subtitle Proxy /hls/sub.vtt Endpoint & SRT Conversion');

    // Create a mock upstream server to test subtitle conversions cleanly
    const subApp = express();
    subApp.get('/utf8-bom.srt', (req, res) => {
      res.setHeader('Content-Type', 'text/plain; charset=utf-8');
      res.send('\uFEFF1\n00:00:01,234 --> 00:00:04,567\nXin chào thế giới\n\n2\n00:00:05,000 --> 00:00:08,000\nPhụ đề tiếng Việt\n');
    });
    subApp.get('/crlf.srt', (req, res) => {
      res.setHeader('Content-Type', 'text/plain; charset=utf-8');
      res.send('1\r\n00:01:10,000 --> 00:01:12,500\r\nCRLF Line Endings Test\r\n');
    });
    subApp.get('/native.vtt', (req, res) => {
      res.setHeader('Content-Type', 'text/vtt; charset=utf-8');
      res.send('WEBVTT\n\n1\n00:00:01.000 --> 00:00:03.000\nNative WebVTT text\n');
    });
    subApp.get('/error-500', (req, res) => {
      res.status(500).send('Internal Upstream Error');
    });

    const mockSubServer = await new Promise((resolve) => {
      const s = subApp.listen(0, '127.0.0.1', () => resolve(s));
    });
    const mockSubPort = mockSubServer.address().port;

    try {
      // 4.1 Missing URL
      await asyncCheck('/hls/sub.vtt returns 400 when url is missing', async () => {
        const res = await axios.get(`${baseUrl}/hls/sub.vtt`, { validateStatus: () => true });
        assert.strictEqual(res.status, 400);
      });

      // 4.2 /sub alias
      await asyncCheck('/hls/sub route alias returns 400 when url is missing', async () => {
        const res = await axios.get(`${baseUrl}/hls/sub`, { validateStatus: () => true });
        assert.strictEqual(res.status, 400);
      });

      // 4.3 SRT with BOM conversion & headers
      await asyncCheck('SRT with UTF-8 BOM converts to WebVTT with correct headers', async () => {
        const target = `http://127.0.0.1:${mockSubPort}/utf8-bom.srt`;
        const res = await axios.get(`${baseUrl}/hls/sub.vtt?url=${encodeURIComponent(target)}&ref=https://vsmov.com/`);
        assert.strictEqual(res.status, 200);
        assert.strictEqual(res.headers['access-control-allow-origin'], '*');
        assert.strictEqual(res.headers['content-type'], 'text/vtt; charset=utf-8');
        assert.strictEqual(res.headers['cache-control'], 'public, max-age=86400');
        assert.ok(res.data.startsWith('WEBVTT\n\n'), 'Must start with WEBVTT\\n\\n');
        assert.ok(!res.data.startsWith('\uFEFF'), 'BOM must be stripped');
        assert.ok(res.data.includes('00:00:01.234 --> 00:00:04.567'), 'Comma timestamps must convert to dot');
        assert.ok(res.data.includes('Xin chào thế giới'), 'Content preserved');
      });

      // 4.4 CRLF SRT conversion
      await asyncCheck('CRLF SRT converts correctly and normalizes newlines', async () => {
        const target = `http://127.0.0.1:${mockSubPort}/crlf.srt`;
        const b64Url = Buffer.from(target).toString('base64url');
        const res = await axios.get(`${baseUrl}/hls/sub.vtt?b64=${b64Url}`);
        assert.strictEqual(res.status, 200);
        assert.ok(res.data.startsWith('WEBVTT\n\n'));
        assert.ok(res.data.includes('00:01:10.000 --> 00:01:12.500'));
        assert.ok(!res.data.includes('\r\n'));
      });

      // 4.5 Native WebVTT passthrough
      await asyncCheck('Native WebVTT passes through without double-WEBVTT prefix', async () => {
        const target = `http://127.0.0.1:${mockSubPort}/native.vtt`;
        const res = await axios.get(`${baseUrl}/hls/sub.vtt?sub=${encodeURIComponent(target)}`);
        assert.strictEqual(res.status, 200);
        assert.ok(res.data.startsWith('WEBVTT'));
        const occurrences = (res.data.match(/WEBVTT/g) || []).length;
        assert.strictEqual(occurrences, 1, 'Must not duplicate WEBVTT header');
      });

      // 4.6 Upstream 500 error handling
      await asyncCheck('Upstream 500 returns error status without uncaught exception', async () => {
        const target = `http://127.0.0.1:${mockSubPort}/error-500`;
        const res = await axios.get(`${baseUrl}/hls/sub.vtt?url=${encodeURIComponent(target)}`, { validateStatus: () => true });
        assert.strictEqual(res.status, 500);
      });
    } finally {
      mockSubServer.close();
    }

    // ─── 5. LIVE PLAYBACK & PROTOCOL COMPLIANCE ───────────────────
    console.log('\n▶ SUITE 5: Live Playback & Protocol Compliance');

    // 5.1 Harry Potter tt0373889
    await asyncCheck('Harry Potter tt0373889 returns >= 2 VSMOV streams (Vietsub & Lồng Tiếng/Thuyết Minh)', async () => {
      const res = await axios.get(`${baseUrl}/stream/movie/tt0373889.json`, { timeout: 25000 });
      assert.strictEqual(res.status, 200);
      const vsmovStreams = res.data.streams.filter(s => s.title && s.title.includes('VSMOV'));
      assert.ok(vsmovStreams.length >= 2, `Expected >= 2 VSMOV streams, got ${vsmovStreams.length}`);
      
      const vietsub = vsmovStreams.find(s => /vietsub/i.test(s.title));
      const dub = vsmovStreams.find(s => /lồng tiếng|thuyết minh/i.test(s.title));
      assert.ok(vietsub, 'Must contain Vietsub stream');
      assert.ok(dub, 'Must contain Lồng Tiếng or Thuyết Minh stream');

      for (const st of res.data.streams) {
        assert.ok(st.url, 'Stream must have url');
        assert.strictEqual(st.externalUrl, undefined, 'Must not have externalUrl');
      }
    });

    // 5.2 KKPhim series episode tt0903747:1:1
    await asyncCheck('KKPhim series episode tt0903747:1:1 resolves valid HLS manifest without 404', async () => {
      const res = await axios.get(`${baseUrl}/stream/series/tt0903747:1:1.json`, { timeout: 25000 });
      assert.strictEqual(res.status, 200);
      const kk = res.data.streams.find(s => s.title && s.title.includes('KKPhim'));
      assert.ok(kk, 'Must find KKPhim series stream');
      assert.ok(kk.url, 'Stream must have url');

      const manifestRes = await axios.get(kk.url, { timeout: 25000 });
      assert.strictEqual(manifestRes.status, 200);
      assert.ok(manifestRes.data.includes('#EXTM3U'), 'Manifest must have #EXTM3U');
      assert.ok(!manifestRes.data.includes('404 Not Found'), 'Manifest must not be 404 error page');
    });

  } finally {
    server.close();
  }

  console.log('\n═══════════════════════════════════════════════════════════════');
  console.log(`🎉 ALL ${passedAssertions}/${totalAssertions} ADVERSARIAL & EMPIRICAL ASSERTIONS PASSED!`);
  console.log('═══════════════════════════════════════════════════════════════\n');
}

runAudit()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('Audit failed:', err);
    process.exit(1);
  });
