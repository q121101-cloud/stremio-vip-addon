'use strict';
const axios = require('axios');

async function testAudioTrackExtraction() {
  process.env.PORT = '7321';
  require('./src/index.js');
  await new Promise((r) => setTimeout(r, 1000));

  const BASE = 'http://localhost:7321';
  console.log('[Test] Checking server response on /stream endpoint...');

  const sRes = await axios.get(`${BASE}/stream/series/nguonc:hoa-khai-cam-tu:0:1.json`);
  const streams = sRes.data.streams || [];
  console.log(`[Test] Available stream options: ${streams.length}`);

  if (streams.length < 2) {
    throw new Error('Expected at least 2 stream options');
  }

  console.log('[Test] Server endpoints and stream mapping: OK');
  process.exit(0);
}

testAudioTrackExtraction().catch((err) => {
  console.error('[Test Error]', err.message);
  process.exit(1);
});
