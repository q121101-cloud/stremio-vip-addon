'use strict';

/**
 * ============================================================
 *  Reviewer 1 Live Real-World KKPhim CDN Verification
 * ============================================================
 */

const express = require('express');
const axios = require('axios');
const http = require('http');
const assert = require('assert');

const hlsRouter = require('../../src/routes/hls');
const kkphim = require('../../src/providers/kkphim');

async function main() {
  console.log('=== Starting Real-World Live KKPhim CDN Verification ===\n');

  const app = express();
  app.use('/hls', hlsRouter);
  const APP_PORT = 7893;
  const appServer = http.createServer(app);
  await new Promise((resolve) => appServer.listen(APP_PORT, '127.0.0.1', resolve));

  const proxyBase = `http://127.0.0.1:${APP_PORT}`;

  try {
    // 1. Get streams for cuu-mon
    console.log('1. Fetching streams from KKPhim for slug "cuu-mon"...');
    const streams = await kkphim.getStreams({
      slug: 'cuu-mon',
      type: 'movie',
      proxyBase,
    });

    console.log(`Received ${streams.length} streams:`);
    streams.forEach((s, idx) => {
      console.log(`   [${idx + 1}] ${s.title}`);
      console.log(`       URL: ${s.url}`);
    });

    assert(Array.isArray(streams) && streams.length > 0, 'Must return at least 1 stream');
    const firstStream = streams[0];
    assert(firstStream.url.startsWith(proxyBase + '/hls/manifest.m3u8'), 'Stream URL must route to /hls/manifest.m3u8');
    assert(!firstStream.externalUrl, 'Must NOT contain externalUrl');

    // 2. Fetch Manifest through proxy
    console.log('\n2. Requesting manifest through local HLS proxy...');
    const manifestRes = await axios.get(firstStream.url, { timeout: 15000 });
    console.log(`Manifest Response Status: ${manifestRes.status}`);
    console.log(`Manifest Content-Type: ${manifestRes.headers['content-type']}`);
    console.log(`Manifest CORS Header: ${manifestRes.headers['access-control-allow-origin']}`);

    assert.strictEqual(manifestRes.status, 200);
    assert(manifestRes.headers['content-type'].includes('application/vnd.apple.mpegurl'));
    assert.strictEqual(manifestRes.headers['access-control-allow-origin'], '*');
    assert(manifestRes.data.includes('#EXTM3U'), 'Manifest content must contain #EXTM3U');

    const manifestLines = manifestRes.data.split('\n').map((l) => l.trim()).filter(Boolean);
    console.log(`Manifest line count: ${manifestLines.length}`);

    // If master playlist, fetch subplaylist
    let mediaPlaylistContent = manifestRes.data;
    const subPlaylistLine = manifestLines.find((l) => l.startsWith(proxyBase + '/hls/manifest.m3u8'));
    if (subPlaylistLine) {
      console.log(`\nDetected Master Playlist. Fetching sub-playlist: ${subPlaylistLine.slice(0, 80)}...`);
      const subRes = await axios.get(subPlaylistLine, { timeout: 15000 });
      assert.strictEqual(subRes.status, 200);
      assert(subRes.data.includes('#EXTM3U'), 'Subplaylist must contain #EXTM3U');
      mediaPlaylistContent = subRes.data;
    }

    // 3. Extract TS segment URL
    const mediaLines = mediaPlaylistContent.split('\n').map((l) => l.trim()).filter(Boolean);
    const tsProxyUrl = mediaLines.find((l) => l.startsWith(proxyBase + '/hls/ts?url='));
    assert(tsProxyUrl !== undefined, 'Media playlist must contain rewritten /hls/ts URLs');

    console.log(`\n3. Requesting rewritten TS video segment: ${tsProxyUrl.slice(0, 80)}...`);
    const tsRes = await axios.get(tsProxyUrl, {
      responseType: 'arraybuffer',
      timeout: 25000,
    });

    console.log(`TS Segment Status: ${tsRes.status}`);
    console.log(`TS Segment Content-Type: ${tsRes.headers['content-type']}`);
    console.log(`TS Segment Content-Length: ${tsRes.headers['content-length'] || tsRes.data.length} bytes`);
    console.log(`TS Segment CORS: ${tsRes.headers['access-control-allow-origin']}`);

    assert.strictEqual(tsRes.status, 200, 'Segment fetch must be HTTP 200 (NO 403 Forbidden)');
    assert.strictEqual(tsRes.headers['content-type'], 'video/mp2t', 'Content-Type must be video/mp2t');
    assert.strictEqual(tsRes.headers['access-control-allow-origin'], '*');
    assert(tsRes.data.length > 50000, `Segment buffer must be realistic video data (>50KB), got ${tsRes.data.length} bytes`);

    // Verify MPEG-TS sync byte 0x47
    const firstByte = tsRes.data[0];
    console.log(`First byte (hex): 0x${firstByte.toString(16)} (expected 0x47 for MPEG-TS sync byte)`);
    assert.strictEqual(firstByte, 0x47, 'Valid MPEG-TS container sync byte 0x47');

    console.log('\n🎉 Real KKPhim live CDN playback successfully verified!');
  } finally {
    await new Promise((resolve) => appServer.close(resolve));
  }
}

main().catch((err) => {
  console.error('Fatal live test error:', err);
  process.exit(1);
});
