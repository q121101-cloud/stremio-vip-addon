'use strict';

/**
 * ==============================================================================
 *  VIP Movies Addon — tests/challenger_m3_2_concurrency_and_edge.test.js
 *  Challenger 2 Empirical Verification & Adversarial Stress Suite for Milestone 3
 *
 *  Objectives Covered:
 *    1. Concurrency & Ephemeral Port Resilience (In-Process + Multi-Process)
 *    2. Port Collision Prevention & Clean Teardown Verification
 *    3. Edge Case Error Conditions (Malformed M3U8, Bad Base64, CDN Simulation)
 *    4. Provider Resilience (Edge Cases, Fallbacks, Bounds)
 * ==============================================================================
 */

const assert = require('assert');
const { spawn, fork } = require('child_process');
const path = require('path');
const http = require('http');
const express = require('express');
const cors = require('cors');
const axios = require('axios');

const { runKKPhimPlaybackE2E } = require('./test_kkphim_playback');
const hlsRouter = require('../src/routes/hls');
const kkphim = require('../src/providers/kkphim');
const handlers = require('../src/handlers');

// Test reporting counters
let totalTests = 0;
let passedTests = 0;
let failedTests = 0;
const failures = [];

function pass(name, detail = '') {
  totalTests++;
  passedTests++;
  console.log(`  \x1b[32m✔ PASS\x1b[0m: ${name} ${detail ? `\x1b[90m(${detail})\x1b[0m` : ''}`);
}

function fail(name, err) {
  totalTests++;
  failedTests++;
  const msg = err ? (err.message || String(err)) : 'Assertion failed';
  console.error(`  \x1b[31m✖ FAIL\x1b[0m: ${name}`);
  console.error(`         \x1b[31m${msg}\x1b[0m`);
  failures.push({ name, error: msg, stack: err?.stack });
}

async function runTest(name, fn) {
  try {
    await fn();
    pass(name);
  } catch (err) {
    fail(name, err);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// SUITE 1: Concurrency & Ephemeral Port Resilience
// ─────────────────────────────────────────────────────────────────────────────
async function suite1ConcurrencyAndPorts() {
  console.log('\n\x1b[1m\x1b[36m══ SUITE 1: Concurrency & Ephemeral Port Resilience ══\x1b[0m');

  // Test 1.1: 5 In-Process Concurrent Executions of runKKPhimPlaybackE2E
  await runTest('1.1 Concurrently execute 5 in-process instances of runKKPhimPlaybackE2E()', async () => {
    const CONCURRENCY = 5;
    const start = Date.now();
    const promises = [];

    for (let i = 0; i < CONCURRENCY; i++) {
      promises.push(runKKPhimPlaybackE2E());
    }

    const results = await Promise.all(promises);
    assert.strictEqual(results.length, CONCURRENCY);
    results.forEach((r, idx) => {
      assert.strictEqual(r, true, `Instance ${idx + 1} must return true`);
    });
    console.log(`     \x1b[90m→ All ${CONCURRENCY} in-process instances completed in ${Date.now() - start}ms\x1b[0m`);
  });

  // Test 1.2: 5 Multi-Process Concurrent Executions via CLI spawn
  await runTest('1.2 Concurrently execute 5 OS subprocesses of test_kkphim_playback.js', async () => {
    const NUM_PROCESSES = 5;
    const scriptPath = path.resolve(__dirname, 'test_kkphim_playback.js');
    const start = Date.now();

    const spawnPromise = (id) => new Promise((resolve, reject) => {
      const child = spawn(process.execPath, [scriptPath], {
        stdio: ['ignore', 'pipe', 'pipe'],
      });
      let stdout = '';
      let stderr = '';

      child.stdout.on('data', (d) => { stdout += d.toString(); });
      child.stderr.on('data', (d) => { stderr += d.toString(); });

      child.on('close', (code) => {
        if (code === 0) {
          // Strip ANSI escape codes
          const cleanStdout = stdout.replace(/\x1B\[[0-9;]*[mK]/g, '');
          const match = cleanStdout.match(/Started local test server on ephemeral port:\s*(\d+)/);
          const port = match ? match[1] : null;
          resolve({ id, code, port, stdout });
        } else {
          reject(new Error(`Subprocess ${id} exited with code ${code}.\nStderr: ${stderr}`));
        }
      });
      child.on('error', reject);
    });

    const promises = Array.from({ length: NUM_PROCESSES }, (_, i) => spawnPromise(i + 1));
    const results = await Promise.all(promises);

    const ports = results.map((r) => r.port).filter(Boolean);
    const uniquePorts = new Set(ports);

    assert.strictEqual(results.length, NUM_PROCESSES, 'All child processes must finish successfully');
    assert.strictEqual(uniquePorts.size, NUM_PROCESSES, `All ${NUM_PROCESSES} child processes must use unique ephemeral ports, got: ${Array.from(uniquePorts).join(', ')}`);
    console.log(`     \x1b[90m→ Spawned ${NUM_PROCESSES} distinct processes on ports: [${Array.from(uniquePorts).join(', ')}] in ${Date.now() - start}ms\x1b[0m`);
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// SUITE 2: Teardown, Cleanup & Port Release
// ─────────────────────────────────────────────────────────────────────────────
async function suite2TeardownAndCleanup() {
  console.log('\n\x1b[1m\x1b[36m══ SUITE 2: Teardown, Cleanup & Port Release Verification ══\x1b[0m');

  // Test 2.1: Clean Teardown on Normal Express Lifecycle
  await runTest('2.1 Verify express server on port 0 closes and releases port immediately', async () => {
    const app = express();
    app.use('/hls', hlsRouter);

    let server = await new Promise((res, rej) => {
      const s = app.listen(0, '127.0.0.1', () => res(s));
      s.on('error', rej);
    });

    const port = server.address().port;
    assert.ok(port > 0, 'Must bind to valid ephemeral port');

    // Make an active HTTP request to ensure sockets are open
    const res = await axios.get(`http://127.0.0.1:${port}/hls/manifest.m3u8`, {
      validateStatus: () => true,
    });
    assert.strictEqual(res.status, 400); // Missing param expected

    // Close server and close all active sockets
    await new Promise((res) => server.close(res));

    // Verify port is no longer reachable
    try {
      await axios.get(`http://127.0.0.1:${port}/hls/manifest.m3u8`, { timeout: 1000 });
      assert.fail('Server should be unreachable after close()');
    } catch (err) {
      const isRefusedOrReset = ['ECONNREFUSED', 'ECONNRESET', 'socket hang up', 'ERR_BAD_RESPONSE'].some(
        (code) => err.code === code || err.message.includes(code)
      );
      assert.ok(
        isRefusedOrReset,
        `Expected connection failure after teardown, got: ${err.code || err.message}`
      );
    }
  });

  // Test 2.2: Teardown in Finally Block on Exception
  await runTest('2.2 Verify finally block closes server even when exception is thrown inside runner', async () => {
    let capturedPort = null;
    let errorCaught = false;

    try {
      const app = express();
      app.use('/hls', hlsRouter);

      const server = await new Promise((res, rej) => {
        const s = app.listen(0, '127.0.0.1', () => res(s));
        s.on('error', rej);
      });

      capturedPort = server.address().port;

      try {
        // Intentionally throw inside test body
        throw new Error('Simulated runner failure during test');
      } finally {
        server.close();
      }
    } catch (err) {
      errorCaught = true;
      assert.strictEqual(err.message, 'Simulated runner failure during test');
    }

    assert.ok(errorCaught, 'Error must be caught');
    assert.ok(capturedPort > 0, 'Port must have been captured');

    // Verify socket closed
    try {
      await axios.get(`http://127.0.0.1:${capturedPort}/hls/manifest.m3u8`, { timeout: 1000 });
      assert.fail('Server socket must be closed by finally block');
    } catch (err) {
      const isRefusedOrReset = ['ECONNREFUSED', 'ECONNRESET', 'socket hang up', 'ERR_BAD_RESPONSE'].some(
        (code) => err.code === code || err.message.includes(code)
      );
      assert.ok(
        isRefusedOrReset,
        `Port ${capturedPort} must be released (got ${err.code || err.message})`
      );
    }
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// SUITE 3: Edge Case Error Conditions & HLS Proxy Robustness
// ─────────────────────────────────────────────────────────────────────────────
async function suite3EdgeCaseErrors() {
  console.log('\n\x1b[1m\x1b[36m══ SUITE 3: Edge Case Error Conditions (Malformed M3U8, Bad Base64, Upstream CDN Simulation) ══\x1b[0m');

  const app = express();
  app.use(cors());
  app.use('/hls', hlsRouter);
  app.use('/', handlers);

  const server = await new Promise((res, rej) => {
    const s = app.listen(0, '127.0.0.1', () => res(s));
    s.on('error', rej);
  });
  const port = server.address().port;
  const baseUrl = `http://127.0.0.1:${port}`;

  try {
    // 3.1 Bad & Malformed Base64 Parameters
    await runTest('3.1.1 Manifest: Empty URL parameter returns HTTP 400', async () => {
      const res = await axios.get(`${baseUrl}/hls/manifest.m3u8?url=`, { validateStatus: () => true });
      assert.strictEqual(res.status, 400);
      assert.strictEqual(res.headers['access-control-allow-origin'], '*');
    });

    await runTest('3.1.2 Manifest: Corrupt Base64 string does not crash process and returns HTTP 400 or 502', async () => {
      const corruptStrings = [
        '!!!invalid_base64_symbols!!!',
        '==bad==padding==',
        '   ',
        '%00%00%00',
        'undefined',
        'null',
      ];

      for (const str of corruptStrings) {
        const res = await axios.get(`${baseUrl}/hls/manifest.m3u8?url=${encodeURIComponent(str)}`, {
          validateStatus: () => true,
        });
        assert.ok([400, 502].includes(res.status), `Status must be 400 or 502, got ${res.status} for "${str}"`);
        assert.strictEqual(res.headers['access-control-allow-origin'], '*');
      }
    });

    await runTest('3.1.3 Segment /ts: Corrupt Base64 string returns HTTP 400 or 502', async () => {
      const res = await axios.get(`${baseUrl}/hls/ts?url=invalid_base64_payload`, { validateStatus: () => true });
      assert.ok([400, 502].includes(res.status));
      assert.strictEqual(res.headers['access-control-allow-origin'], '*');
    });

    await runTest('3.1.4 Raw URL fallback: HLS routes accept raw http:// / https:// URLs without Base64', async () => {
      // Create a small mock upstream server
      let mockServerHit = false;
      const mockM3U8 = '#EXTM3U\n#EXT-X-VERSION:3\n#EXTINF:10.0,\nseg1.ts\n#EXT-X-ENDLIST';

      const mockUpstream = http.createServer((mReq, mRes) => {
        mockServerHit = true;
        mRes.writeHead(200, { 'Content-Type': 'application/vnd.apple.mpegurl' });
        mRes.end(mockM3U8);
      });
      const upstreamPort = await new Promise((res) => {
        mockUpstream.listen(0, '127.0.0.1', () => res(mockUpstream.address().port));
      });

      try {
        const rawUrl = `http://127.0.0.1:${upstreamPort}/playlist.m3u8`;
        const res = await axios.get(`${baseUrl}/hls/manifest.m3u8?url=${encodeURIComponent(rawUrl)}`, {
          validateStatus: () => true,
        });
        assert.strictEqual(res.status, 200);
        assert.ok(mockServerHit, 'Mock upstream must have been hit');
        assert.ok(res.data.includes('#EXTM3U'));
        assert.ok(res.data.includes('/hls/ts?url='));
      } finally {
        mockUpstream.close();
      }
    });

    // 3.2 Upstream CDN Error Simulation
    await runTest('3.2.1 Upstream CDN returns HTTP 403: Proxy handles gracefully and returns HTTP 502', async () => {
      const mock403 = http.createServer((mReq, mRes) => {
        mRes.writeHead(403, { 'Content-Type': 'text/plain' });
        mRes.end('Forbidden');
      });
      const mPort = await new Promise((res) => mock403.listen(0, '127.0.0.1', () => res(mock403.address().port)));

      try {
        const target = Buffer.from(`http://127.0.0.1:${mPort}/forbidden.m3u8`).toString('base64url');
        const res = await axios.get(`${baseUrl}/hls/manifest.m3u8?url=${target}`, { validateStatus: () => true });
        assert.strictEqual(res.status, 502);
        assert.strictEqual(res.headers['access-control-allow-origin'], '*');
      } finally {
        mock403.close();
      }
    });

    await runTest('3.2.2 Upstream CDN returns HTTP 404: Proxy handles gracefully and returns HTTP 502', async () => {
      const mock404 = http.createServer((mReq, mRes) => {
        mRes.writeHead(404, { 'Content-Type': 'text/plain' });
        mRes.end('Not Found');
      });
      const mPort = await new Promise((res) => mock404.listen(0, '127.0.0.1', () => res(mock404.address().port)));

      try {
        const target = Buffer.from(`http://127.0.0.1:${mPort}/notfound.m3u8`).toString('base64url');
        const res = await axios.get(`${baseUrl}/hls/manifest.m3u8?url=${target}`, { validateStatus: () => true });
        assert.strictEqual(res.status, 502);
        assert.strictEqual(res.headers['access-control-allow-origin'], '*');
      } finally {
        mock404.close();
      }
    });

    await runTest('3.2.3 Upstream CDN times out / hangs: Proxy does not hang indefinitely', async () => {
      // Mock server that never responds
      const hangingServer = http.createServer((mReq, mRes) => {
        // intentionally do not respond
      });
      const mPort = await new Promise((res) => hangingServer.listen(0, '127.0.0.1', () => res(hangingServer.address().port)));

      try {
        const target = Buffer.from(`http://127.0.0.1:${mPort}/slow.m3u8`).toString('base64url');
        const start = Date.now();
        // Manifest route axios timeout is 15s
        const res = await axios.get(`${baseUrl}/hls/manifest.m3u8?url=${target}`, {
          validateStatus: () => true,
          timeout: 20000,
        });
        const elapsed = Date.now() - start;
        assert.strictEqual(res.status, 502);
        assert.ok(elapsed < 18000, `Must timeout within reasonable window, took ${elapsed}ms`);
      } finally {
        hangingServer.close();
      }
    });

    await runTest('3.2.4 Upstream Connection Refused (ECONNREFUSED): Proxy returns HTTP 502', async () => {
      // Port that is definitely closed
      const target = Buffer.from('http://127.0.0.1:59999/dead.m3u8').toString('base64url');
      const res = await axios.get(`${baseUrl}/hls/manifest.m3u8?url=${target}`, { validateStatus: () => true });
      assert.strictEqual(res.status, 502);
      assert.strictEqual(res.headers['access-control-allow-origin'], '*');
    });

    // 3.3 Advanced M3U8 Playlist Rewriting Edge Cases
    await runTest('3.3.1 Complex Manifest: Windows CRLF (\\r\\n) and varied tags rewritten accurately', async () => {
      const complexM3u8 = [
        '#EXTM3U',
        '#EXT-X-VERSION:4',
        '#EXT-X-MEDIA:TYPE=AUDIO,GROUP-ID="audio",NAME="Vietnamese",DEFAULT=YES,URI="audio/vi.m3u8"',
        '#EXT-X-MEDIA:TYPE=SUBTITLES,GROUP-ID="subs",NAME="Vietnamese",URI="subs/vi.vtt"',
        '#EXT-X-STREAM-INF:BANDWIDTH=1500000,RESOLUTION=1280x720,AUDIO="audio",SUBTITLES="subs"',
        '720p/index.m3u8',
        '#EXT-X-STREAM-INF:BANDWIDTH=3000000,RESOLUTION=1920x1080',
        'https://cdn2.example.com/1080p/index.m3u8?auth=token123',
      ].join('\r\n');

      let receivedHeaders = null;
      const mockUpstream = http.createServer((mReq, mRes) => {
        receivedHeaders = mReq.headers;
        mRes.writeHead(200, { 'Content-Type': 'application/vnd.apple.mpegurl' });
        mRes.end(complexM3u8);
      });
      const uPort = await new Promise((res) => mockUpstream.listen(0, '127.0.0.1', () => res(mockUpstream.address().port)));

      try {
        const upstreamBase = `http://127.0.0.1:${uPort}/master.m3u8`;
        const b64Target = Buffer.from(upstreamBase).toString('base64url');
        const b64Ref = Buffer.from('https://player.phimapi.com/').toString('base64url');

        const res = await axios.get(`${baseUrl}/hls/manifest.m3u8?url=${b64Target}&ref=${b64Ref}`, {
          validateStatus: () => true,
        });

        assert.strictEqual(res.status, 200);
        assert.strictEqual(res.headers['content-type'], 'application/vnd.apple.mpegurl; charset=utf-8');
        assert.strictEqual(res.headers['access-control-allow-origin'], '*');
        assert.strictEqual(receivedHeaders['referer'], 'https://player.phimapi.com/');
        assert.strictEqual(receivedHeaders['origin'], 'https://player.phimapi.com');

        const body = res.data;
        assert.ok(body.includes('#EXTM3U'));
        // Verify audio URI rewritten
        assert.ok(body.includes('URI="http://127.0.0.1:'), 'Audio URI must be rewritten to proxy');
        // Verify sub-playlist lines rewritten
        const lines = body.split('\n').map((l) => l.trim()).filter(Boolean);
        const manifestLinks = lines.filter((l) => l.startsWith('http://') && l.includes('/hls/manifest.m3u8'));
        assert.ok(manifestLinks.length >= 2, `Must rewrite relative and absolute sub-manifests, got ${manifestLinks.length}`);
      } finally {
        mockUpstream.close();
      }
    });

    await runTest('3.3.2 Media Playlist: Segments, AES-128 Keys, and Preload Hints rewritten', async () => {
      const mediaM3u8 = [
        '#EXTM3U',
        '#EXT-X-VERSION:4',
        '#EXT-X-TARGETDURATION:10',
        '#EXT-X-KEY:METHOD=AES-128,URI="keys/enc.key",IV=0x1234567890abcdef',
        '#EXT-X-MAP:URI="init.mp4"',
        '#EXTINF:9.000,',
        'seg001.ts',
        '#EXTINF:9.000,',
        'https://cdn3.example.com/seg002.ts?sig=xyz',
        '#EXT-X-PRELOAD-HINT:TYPE=PART,URI="preload.ts"',
        '#EXT-X-ENDLIST',
      ].join('\n');

      const mockUpstream = http.createServer((mReq, mRes) => {
        mRes.writeHead(200, { 'Content-Type': 'application/vnd.apple.mpegurl' });
        mRes.end(mediaM3u8);
      });
      const uPort = await new Promise((res) => mockUpstream.listen(0, '127.0.0.1', () => res(mockUpstream.address().port)));

      try {
        const upstreamBase = `http://127.0.0.1:${uPort}/media/index.m3u8`;
        const b64Target = Buffer.from(upstreamBase).toString('base64url');

        const res = await axios.get(`${baseUrl}/hls/manifest.m3u8?url=${b64Target}`, {
          validateStatus: () => true,
        });

        assert.strictEqual(res.status, 200);
        const body = res.data;

        // Verify KEY URI rewritten with is_key=1
        assert.ok(body.includes('/hls/ts?url='), 'Must rewrite key/segments to /hls/ts');
        assert.ok(body.includes('is_key=1'), 'AES-128 Key URI must include is_key=1 parameter');

        // Verify MAP URI rewritten
        assert.ok(body.includes('#EXT-X-MAP:URI="http'), 'MAP URI must be rewritten');

        // Verify segment lines rewritten
        const lines = body.split('\n').map((l) => l.trim()).filter(Boolean);
        const segLinks = lines.filter((l) => l.startsWith('http://') && l.includes('/hls/ts?url='));
        assert.strictEqual(segLinks.length, 2, 'Both segments must be rewritten to /hls/ts proxy');
      } finally {
        mockUpstream.close();
      }
    });

    await runTest('3.3.3 Segment Delivery /ts: Streaming binary chunk and MIME types', async () => {
      // Mock video segment server
      const fakeTsBuffer = Buffer.alloc(65536, 0x47); // 64KB with TS sync byte
      const fakeKeyBuffer = Buffer.alloc(16, 0xAA);   // 16-byte AES key

      const mockTsServer = http.createServer((mReq, mRes) => {
        if (mReq.url.includes('enc.key')) {
          mRes.writeHead(200, { 'Content-Type': 'application/octet-stream' });
          mRes.end(fakeKeyBuffer);
        } else {
          mRes.writeHead(200, { 'Content-Type': 'video/mp2t' });
          mRes.end(fakeTsBuffer);
        }
      });
      const uPort = await new Promise((res) => mockTsServer.listen(0, '127.0.0.1', () => res(mockTsServer.address().port)));

      try {
        // Test TS segment fetch
        const tsUrl = `http://127.0.0.1:${uPort}/segment0.ts`;
        const b64Ts = Buffer.from(tsUrl).toString('base64url');
        const tsRes = await axios.get(`${baseUrl}/hls/ts?url=${b64Ts}`, {
          responseType: 'arraybuffer',
          validateStatus: () => true,
        });

        assert.strictEqual(tsRes.status, 200);
        assert.strictEqual(tsRes.headers['content-type'], 'video/mp2t');
        assert.strictEqual(tsRes.headers['access-control-allow-origin'], '*');
        const recvTs = Buffer.from(tsRes.data);
        assert.strictEqual(recvTs.length, 65536);
        assert.strictEqual(recvTs[0], 0x47);

        // Test AES key fetch with is_key=1
        const keyUrl = `http://127.0.0.1:${uPort}/enc.key`;
        const b64Key = Buffer.from(keyUrl).toString('base64url');
        const keyRes = await axios.get(`${baseUrl}/hls/ts?url=${b64Key}&is_key=1`, {
          responseType: 'arraybuffer',
          validateStatus: () => true,
        });

        assert.strictEqual(keyRes.status, 200);
        assert.strictEqual(keyRes.headers['content-type'], 'application/octet-stream');
        assert.strictEqual(keyRes.headers['access-control-allow-origin'], '*');
        const recvKey = Buffer.from(keyRes.data);
        assert.strictEqual(recvKey.length, 16);
      } finally {
        mockTsServer.close();
      }
    });

    // 3.4 KKPhim Provider Edge Cases
    await runTest('3.4.1 KKPhim: Nonexistent IMDb ID & slug return empty streams without throwing', async () => {
      const nonExistentStreams = await kkphim.getStreams({
        imdbId: 'tt9999999999',
        slug: 'this-slug-does-not-exist-xyz123',
        type: 'movie',
        proxyBase: baseUrl,
      });

      assert.ok(Array.isArray(nonExistentStreams), 'Must return array');
      assert.strictEqual(nonExistentStreams.length, 0, 'Must return empty array on nonexistent media');
    });

    await runTest('3.4.2 KKPhim: Series episode out-of-range fallback behavior', async () => {
      // Testing series episode matching with a known series slug or movie
      const streams = await kkphim.getStreams({
        slug: 'cuu-mon',
        type: 'series',
        episode: 99999, // Out of bounds
        proxyBase: baseUrl,
      });

      assert.ok(Array.isArray(streams), 'Must return array');
    });

  } finally {
    server.close();
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// MAIN EXECUTION
// ─────────────────────────────────────────────────────────────────────────────
async function main() {
  console.log('\n\x1b[1m\x1b[35m╔══════════════════════════════════════════════════════════════════════════════╗\x1b[0m');
  console.log('\x1b[1m\x1b[35m║  CHALLENGER 2 EMPIRICAL TEST SUITE: CONCURRENCY, PORTS & EDGE ERROR HANDLING ║\x1b[0m');
  console.log('\x1b[1m\x1b[35m╚══════════════════════════════════════════════════════════════════════════════╝\x1b[0m');

  const startAll = Date.now();

  try {
    await suite1ConcurrencyAndPorts();
    await suite2TeardownAndCleanup();
    await suite3EdgeCaseErrors();
  } catch (globalErr) {
    console.error('\x1b[31m[CRITICAL SUITE ERROR]\x1b[0m', globalErr);
  }

  const totalTime = ((Date.now() - startAll) / 1000).toFixed(2);

  console.log('\n\x1b[1m══════════════════════════════════════════════════════════════════════════════\x1b[0m');
  console.log(`\x1b[1mTOTAL EMPIRICAL ASSERTIONS: ${totalTests}\x1b[0m`);
  console.log(`\x1b[32m✔ PASSED:\x1b[0m ${passedTests}`);
  console.log(`\x1b[31m✖ FAILED:\x1b[0m ${failedTests}`);
  console.log(`\x1b[90mExecution Time: ${totalTime}s\x1b[0m`);
  console.log('\x1b[1m══════════════════════════════════════════════════════════════════════════════\x1b[0m\n');

  if (failedTests > 0) {
    console.error('\x1b[31mFailure Summary:\x1b[0m');
    failures.forEach((f, i) => {
      console.error(` ${i + 1}. [${f.name}]: ${f.error}`);
    });
    process.exit(1);
  } else {
    console.log('\x1b[32m\x1b[1m🎉 ALL CHALLENGER 2 EMPIRICAL TESTS PASSED WITH 100% SUCCESS!\x1b[0m\n');
    process.exit(0);
  }
}

if (require.main === module) {
  main();
}

module.exports = { main };
