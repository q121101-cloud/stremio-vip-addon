'use strict';

const nguonc = require('../../src/providers/nguonc');
const { imdbCache, detailCache } = require('../../src/lib/cache');

async function testNguonCLive() {
  imdbCache.clear();
  detailCache.clear();

  console.log('Testing nguonc.getStreams with fresh search (uncached)...');
  const streams = await nguonc.getStreams({
    type: 'movie',
    title: 'Inception',
    year: 2010,
    proxyBase: 'http://localhost:7000'
  });

  console.log('Returned streams length:', streams.length);
}

testNguonCLive().catch(console.error);
