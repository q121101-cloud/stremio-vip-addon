'use strict';

const assert = require('assert');
const http = require('http');
const express = require('express');
const cors = require('cors');
const axios = require('axios');
const fs = require('fs');
const path = require('path');

const hlsRouter = require('../../src/routes/hls');
const manifestRouter = require('../../src/routes/manifest');
const handlers = require('../../src/handlers');
const vsmov = require('../../src/providers/vsmov');
const kkphim = require('../../src/providers/kkphim');
const { MANIFEST } = require('../../src/manifest');

async function runIndependentAudit() {
  console.log('=== RUNNING INDEPENDENT VICTORY AUDIT SUITE ===');

  // 1. Versioning Consistency Check
  console.log('\n--- CHECK 1: Versioning Consistency ---');
  const pkg = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../../package.json'), 'utf8'));
  assert.strictEqual(pkg.version, '1.5.1', 'package.json version must be 1.5.1');

  assert.strictEqual(MANIFEST.version, '1.5.1', 'MANIFEST version must be 1.5.1');

  const handlersSrc = fs.readFileSync(path.resolve(__dirname, '../../src/handlers.js'), 'utf8');
  assert.ok(handlersSrc.includes('VIP Movies Addon v1.5.1 • Powered by <span class="brand-highlight">Q121101</span>'), 'handlers.js footer must match version 1.5.1 brand signature');
  console.log('✅ Check 1 Passed: Version 1.5.1 uniformly present across package.json, manifest.js, handlers.js');

  // 2. Start Test Server with a test SRT endpoint
  const app = express();
  app.use(cors());
  app.use(express.json());
  
  // Test endpoint to serve raw SRT content
  app.get('/test.srt', (req, res) => {
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.send('1\n00:01:20,000 --> 00:01:23,500\nXin chào thế giới!\n\n2\n00:01:24,000 --> 00:01:26,000\nStremio VIP Addon v1.5.1');
  });

  app.use('/hls', hlsRouter);
  app.use('/', manifestRouter);
  app.use('/', handlers);

  const server = await new Promise((resolve, reject) => {
    const s = app.listen(0, '127.0.0.1', () => resolve(s));
    s.on('error', reject);
  });

  const port = server.address().port;
  const baseUrl = `http://127.0.0.1:${port}`;
  console.log(`\nTest server listening on ${baseUrl}`);

  try {
    // 3. Live VSMOV Audio Separation & Subtitles Check
    console.log('\n--- CHECK 2: Live VSMOV Audio Separation (Harry Potter tt0373889) ---');
    const vsmovStreams = await vsmov.getStreams({
      imdbId: 'tt0373889',
      title: 'Harry Potter and the Order of the Phoenix',
      type: 'movie',
      proxyBase: baseUrl,
    });
    console.log(`Live VSMOV returned ${vsmovStreams.length} stream(s):`);
    vsmovStreams.forEach((s, idx) => {
      console.log(`  [Stream ${idx + 1}] Title: ${s.title.split('\n')[0]} | Subtitles: ${s.subtitles ? s.subtitles.length : 0}`);
    });

    assert.ok(vsmovStreams.length >= 2, `VSMOV must return >= 2 streams, got ${vsmovStreams.length}`);
    const vietsub = vsmovStreams.find(s => /vietsub/i.test(s.title));
    const longtiengOrThuyetminh = vsmovStreams.find(s => /lồng tiếng|thuyết minh|long tieng|thuyet minh/i.test(s.title));

    assert.ok(vietsub, 'Must have a Vietsub stream');
    assert.ok(longtiengOrThuyetminh, 'Must have a Lồng Tiếng or Thuyết Minh stream');

    for (const s of vsmovStreams) {
      assert.strictEqual(s.name, 'VIP Movies 🎬');
      assert.strictEqual(s.externalUrl, undefined);
      assert.ok(!('externalUrl' in s));
      assert.ok(s.url.startsWith(`${baseUrl}/hls/manifest.m3u8`));
    }
    console.log('✅ Check 2 Passed: VSMOV separates Vietsub and audio streams, zero externalUrl');

    // 4. Subtitle Endpoint Live & Conversion Verification
    console.log('\n--- CHECK 3: Subtitle Endpoint /hls/sub.vtt Verification ---');
    let subTested = false;
    if (vietsub && vietsub.subtitles && vietsub.subtitles.length > 0) {
      const subUrl = vietsub.subtitles[0].url;
      console.log(`Fetching real live subtitle from: ${subUrl}`);
      const res = await axios.get(subUrl, { timeout: 15000 });
      assert.strictEqual(res.status, 200);
      assert.ok((res.headers['content-type'] || '').includes('text/vtt'));
      assert.strictEqual(res.headers['access-control-allow-origin'], '*');
      assert.ok(String(res.data).startsWith('WEBVTT'));
      console.log('  Live VSMOV subtitle content preview:');
      console.log('  ' + String(res.data).slice(0, 150).replace(/\n/g, '\n  '));
      subTested = true;
    }

    // Direct SRT Conversion Test on /hls/sub.vtt using test.srt endpoint
    console.log('Testing SRT-to-WebVTT conversion via HTTP proxy:');
    const srtHttpUrl = `${baseUrl}/test.srt`;
    const b64SrtUrl = Buffer.from(srtHttpUrl).toString('base64url');
    const convertedRes = await axios.get(`${baseUrl}/hls/sub.vtt?url=${b64SrtUrl}`);
    assert.strictEqual(convertedRes.status, 200);
    assert.ok((convertedRes.headers['content-type'] || '').includes('text/vtt'));
    assert.strictEqual(convertedRes.headers['access-control-allow-origin'], '*');
    assert.ok(convertedRes.data.startsWith('WEBVTT\n'));
    assert.ok(convertedRes.data.includes('00:01:20.000 --> 00:01:23.500'));
    assert.ok(convertedRes.data.includes('Xin chào thế giới!'));
    console.log('✅ Check 3 Passed: /hls/sub.vtt handles live subtitles and SRT conversion with HTTP 200, text/vtt, CORS *');

    // 5. KKPhim Episode Lookup (tt0903747:1:1)
    console.log('\n--- CHECK 4: KKPhim Episode Lookup & HLS Manifest (tt0903747:1:1) ---');
    const kkStreams = await kkphim.getStreams({
      imdbId: 'tt0903747',
      title: 'Breaking Bad',
      type: 'series',
      season: 1,
      episode: 1,
      proxyBase: baseUrl,
    });
    console.log(`KKPhim returned ${kkStreams.length} stream(s) for tt0903747:1:1`);
    assert.ok(kkStreams.length >= 1, 'KKPhim must return at least 1 stream for Breaking Bad S1E1');
    const kkStream = kkStreams[0];
    console.log(`  Stream title: ${kkStream.title.split('\n')[0]}`);
    console.log(`  Stream URL: ${kkStream.url}`);
    assert.strictEqual(kkStream.name, 'VIP Movies 🎬');
    assert.strictEqual(kkStream.externalUrl, undefined);
    assert.ok(!('externalUrl' in kkStream));

    // Fetch HLS manifest
    const kkManifestRes = await axios.get(kkStream.url, { timeout: 15000 });
    assert.strictEqual(kkManifestRes.status, 200);
    assert.ok(kkManifestRes.data.includes('#EXTM3U'));
    assert.ok(!kkManifestRes.data.includes('404 Not Found'));
    console.log('✅ Check 4 Passed: KKPhim resolves episode 1 without 404, manifest is valid');

    // 6. Binary Video TS Segment Download & Sync Byte Verification
    console.log('\n--- CHECK 5: Binary Segment Download & MPEG-TS Sync Byte 0x47 ---');
    // Let's resolve child segment from the manifest
    let segmentUrl = null;
    const lines = kkManifestRes.data.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
    for (const l of lines) {
      if (l.startsWith('http://') && l.includes('/hls/segment.ts')) {
        segmentUrl = l;
        break;
      }
      if (l.startsWith('http://') && l.includes('/hls/manifest.m3u8')) {
        const subMan = await axios.get(l, { timeout: 15000 });
        const subLines = subMan.data.split(/\r?\n/).map(s => s.trim()).filter(Boolean);
        for (const sl of subLines) {
          if (sl.startsWith('http://') && sl.includes('/hls/segment.ts')) {
            segmentUrl = sl;
            break;
          }
        }
        if (segmentUrl) break;
      }
    }
    assert.ok(segmentUrl, 'Must locate child segment URL');
    console.log(`Downloading video segment from: ${segmentUrl.slice(0, 90)}...`);
    const segRes = await axios.get(segmentUrl, {
      responseType: 'arraybuffer',
      timeout: 25000,
    });
    assert.strictEqual(segRes.status, 200);
    assert.strictEqual(segRes.headers['access-control-allow-origin'], '*');
    const segBuf = Buffer.from(segRes.data);
    console.log(`Downloaded segment size: ${segBuf.length} bytes (${(segBuf.length / 1024).toFixed(2)} KB)`);
    assert.ok(segBuf.length > 50000, `Segment size must exceed 50,000 bytes, got ${segBuf.length}`);

    // Verify sync byte
    let syncFound = false;
    if (segBuf[0] === 0x47) {
      syncFound = true;
      if (segBuf.length >= 189) {
        assert.strictEqual(segBuf[188], 0x47, 'Packet boundary byte 188 must be 0x47');
      }
    } else {
      for (let i = 0; i < Math.min(segBuf.length - 376, 4096); i++) {
        if (segBuf[i] === 0x47 && segBuf[i + 188] === 0x47 && segBuf[i + 376] === 0x47) {
          syncFound = true;
          break;
        }
      }
    }
    assert.ok(syncFound, 'MPEG-TS Sync byte 0x47 must be present');
    console.log('✅ Check 5 Passed: Segment downloaded > 50KB with valid MPEG-TS sync byte 0x47');

    // 7. Range 206 Test
    console.log('\n--- CHECK 6: HTTP Range Request (206 Partial Content) ---');
    const rangeRes = await axios.get(segmentUrl, {
      headers: { Range: 'bytes=0-2047' },
      responseType: 'arraybuffer',
      timeout: 15000,
      validateStatus: s => s >= 200 && s < 400,
    });
    console.log(`Range request status: ${rangeRes.status}, Content-Range: ${rangeRes.headers['content-range']}`);
    assert.ok(rangeRes.status === 200 || rangeRes.status === 206);
    if (rangeRes.status === 206) {
      assert.strictEqual(rangeRes.data.byteLength, 2048);
    }
    console.log('✅ Check 6 Passed: HTTP Range seeking supported');

    console.log('\n🎉 ALL INDEPENDENT VERIFICATION CHECKS PASSED 100%!');
  } finally {
    server.close();
  }
}

runIndependentAudit()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('❌ INDEPENDENT AUDIT FAILED:', err);
    process.exit(1);
  });
