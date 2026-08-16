'use strict';
const axios = require('axios');
const http = require('http');

async function testStream() {
  // Require app from src/index.js
  process.env.PORT = '7321';
  const app = require('./src/index.js');
  
  // Wait 1s for server to start
  await new Promise(r => setTimeout(r, 1000));
  
  const BASE = 'http://localhost:7321';
  console.log('--- 1. Testing Manifest ---');
  const manifestRes = await axios.get(`${BASE}/manifest.json`);
  console.log('Manifest Version:', manifestRes.data.version);
  console.log('Manifest Name:', manifestRes.data.name);

  console.log('\n--- 2. Fetching Catalog to find a film ---');
  const catRes = await axios.get(`${BASE}/catalog/movie/nguonc-movie-latest.json`);
  const movies = catRes.data.metas || [];
  console.log(`Found ${movies.length} movies in catalog.`);
  if (movies.length === 0) {
    throw new Error('No movies found in catalog');
  }
  const testMovie = movies[0];
  console.log(`Testing with movie: "${testMovie.name}" (${testMovie.id})`);

  console.log('\n--- 3. Calling /stream endpoint ---');
  const streamRes = await axios.get(`${BASE}/stream/movie/${testMovie.id}.json`);
  const streams = streamRes.data.streams || [];
  console.log(`Received ${streams.length} stream objects.`);
  console.log(JSON.stringify(streams, null, 2));

  const proxyStream = streams.find(s => s.url && s.url.includes('/hls/extract'));
  if (!proxyStream) {
    throw new Error('No HLS extract stream found in streams array!');
  }
  console.log(`Target Stream URL: ${proxyStream.url}`);

  console.log('\n--- 4. Requesting M3U8 Playlist via /hls/extract ---');
  const m3u8Res = await axios.get(proxyStream.url, {
    maxRedirects: 5,
    timeout: 15000,
    validateStatus: s => s < 500
  });

  console.log(`M3U8 HTTP Status: ${m3u8Res.status}`);
  console.log(`M3U8 Content-Type: ${m3u8Res.headers['content-type']}`);
  const m3u8Body = String(m3u8Res.data || '');
  console.log(`M3U8 Playlist Preview (first 500 chars):\n${m3u8Body.slice(0, 500)}...\n`);

  if (m3u8Res.status !== 200) {
    throw new Error(`M3U8 request returned status ${m3u8Res.status}`);
  }
  if (!m3u8Body.includes('#EXTM3U')) {
    throw new Error('M3U8 response does not contain #EXTM3U header!');
  }

  console.log('\n--- 5. Requesting 1st Video Segment (.ts) ---');
  const lines = m3u8Body.split('\n');
  const segLine = lines.find(l => l.trim() && !l.startsWith('#'));
  if (!segLine) {
    throw new Error('Could not find any segment line in m3u8 playlist!');
  }
  const segUrl = segLine.trim();
  console.log(`Segment URL: ${segUrl}`);

  const segRes = await axios.get(segUrl, {
    responseType: 'arraybuffer',
    timeout: 20000,
    validateStatus: s => s < 500
  });

  console.log(`Segment HTTP Status: ${segRes.status}`);
  console.log(`Segment Content-Type: ${segRes.headers['content-type']}`);
  console.log(`Segment Byte Length: ${segRes.data.byteLength} bytes (${(segRes.data.byteLength / 1024).toFixed(2)} KB)`);

  if (segRes.status !== 200) {
    throw new Error(`Segment request failed with status ${segRes.status}`);
  }
  if (segRes.data.byteLength === 0) {
    throw new Error('Segment data is empty (0 bytes)!');
  }

  console.log('\n=========================================');
  console.log('🎉 E2E STREAM TEST COMPLETED SUCCESSFULLY 100%!');
  console.log('=========================================');
  process.exit(0);
}

testStream().catch(err => {
  console.error('\n❌ E2E TEST FAILED:', err.message);
  if (err.response) {
    console.error('Status:', err.response.status);
    console.error('Data:', err.response.data);
  }
  process.exit(1);
});
