'use strict';

const kkphim = require('../../src/providers/kkphim');
const { imdbCache, detailCache } = require('../../src/lib/cache');

async function testKKPhimLive() {
  imdbCache.clear();
  detailCache.clear();

  console.log('Testing kkphim.getStreams with IMDb ID tt1375666...');
  const streams = await kkphim.getStreams({
    imdbId: 'tt1375666',
    title: 'Inception',
    year: 2010,
    type: 'movie',
    proxyBase: 'http://localhost:7000'
  });

  console.log('Returned kkphim streams length:', streams.length);
  if (streams.length > 0) {
    console.log('Sample stream:', JSON.stringify(streams[0], null, 2));
  }
}

testKKPhimLive().catch(console.error);
