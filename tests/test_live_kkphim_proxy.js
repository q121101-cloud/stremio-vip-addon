'use strict';

const express = require('express');
const axios = require('axios');
const assert = require('assert');
const hlsRouter = require('../src/routes/hls');
const kkphim = require('../src/providers/kkphim');

async function testLiveKKPhim() {
  console.log('Testing live KKPhim resolution & HLS proxy playback...');

  const app = express();
  app.use('/hls', hlsRouter);

  const server = await new Promise((resolve) => {
    const s = app.listen(0, '127.0.0.1', () => resolve(s));
  });
  const port = server.address().port;
  const proxyBase = `http://127.0.0.1:${port}`;

  try {
    // 1. Get streams for cuu-mon or a real slug
    const streams = await kkphim.getStreams({ slug: 'cuu-mon', proxyBase });
    console.log(`Resolved ${streams.length} stream(s) for cuu-mon`);
    assert.ok(streams.length > 0, 'Must have at least 1 stream');

    const stream = streams[0];
    console.log('Stream object:', {
      name: stream.name,
      title: stream.title,
      url: stream.url,
      hasExternalUrl: 'externalUrl' in stream,
    });
    assert.strictEqual(stream.name, 'VIP Movies 🎬');
    assert.ok(stream.title.includes('[VIP • KKPhim]'));
    assert.ok(stream.url.startsWith(proxyBase + '/hls/manifest.m3u8'));
    assert.strictEqual(stream.externalUrl, undefined);

    // 2. Fetch rewritten manifest
    console.log('Fetching manifest from proxy:', stream.url);
    const manifestRes = await axios.get(stream.url);
    assert.strictEqual(manifestRes.status, 200);
    assert.strictEqual(manifestRes.headers['content-type'], 'application/vnd.apple.mpegurl; charset=utf-8');
    assert.ok(manifestRes.data.includes('#EXTM3U'), 'Manifest must include #EXTM3U');
    console.log('Manifest snippet:\n', manifestRes.data.slice(0, 300));

    // 3. Find sub-manifest or TS segment
    const lines = manifestRes.data.split('\n').map((l) => l.trim()).filter(Boolean);
    let targetSegmentUrl = null;

    for (const line of lines) {
      if (line.startsWith('http://') && line.includes('/hls/ts')) {
        targetSegmentUrl = line;
        break;
      }
      if (line.startsWith('http://') && line.includes('/hls/manifest.m3u8')) {
        // Master playlist -> fetch sub playlist
        console.log('Fetching sub-manifest:', line);
        const subRes = await axios.get(line);
        assert.strictEqual(subRes.status, 200);
        const subLines = subRes.data.split('\n').map((l) => l.trim()).filter(Boolean);
        for (const sLine of subLines) {
          if (sLine.startsWith('http://') && sLine.includes('/hls/ts')) {
            targetSegmentUrl = sLine;
            break;
          }
        }
        break;
      }
    }

    assert.ok(targetSegmentUrl, 'Found target TS segment URL');
    console.log('Fetching video segment from proxy:', targetSegmentUrl);

    // 4. Fetch binary segment buffer
    const segRes = await axios.get(targetSegmentUrl, {
      responseType: 'arraybuffer',
      timeout: 15000,
    });
    assert.strictEqual(segRes.status, 200);
    assert.strictEqual(segRes.headers['access-control-allow-origin'], '*');
    assert.strictEqual(segRes.headers['content-type'], 'video/mp2t');
    assert.ok(segRes.data.length > 50000, `Segment buffer size must be > 50KB, got ${segRes.data.length} bytes`);
    console.log(`Successfully received valid TS segment: ${segRes.data.length} bytes (HTTP 200)`);

    console.log('🎉 Live KKPhim stream + HLS proxy verification PASSED 100%!');
  } finally {
    server.close();
  }
}

testLiveKKPhim().catch((e) => {
  console.error('Live test failed:', e);
  process.exit(1);
});
