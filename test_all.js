'use strict';
const axios = require('axios');

async function runFullTestSuite() {
  process.env.PORT = '7321';
  const app = require('./src/index.js');
  await new Promise(r => setTimeout(r, 1000));

  const BASE = 'http://localhost:7321';
  console.log('╔══════════════════════════════════════════════════════╗');
  console.log('║   🎬 VIP MOVIES ADDON v1.3.1 - FULL E2E TEST SUITE   ║');
  console.log('╚══════════════════════════════════════════════════════╝\n');

  // Test 1: Manifest
  console.log('▶ [1/5] Checking Manifest & Config...');
  const mRes = await axios.get(`${BASE}/manifest.json`);
  if (mRes.status === 200 && mRes.data.version === '1.3.1') {
    console.log(`  ✅ Manifest OK (v${mRes.data.version}, ${mRes.data.catalogs.length} catalogs)`);
  } else {
    throw new Error('Manifest check failed');
  }

  // Helper to test stream flow for a given item
  async function testFilmStream(label, type, streamId) {
    console.log(`\n▶ Testing ${label} (ID: ${streamId})...`);
    const sRes = await axios.get(`${BASE}/stream/${type}/${streamId}.json`);
    const streams = sRes.data.streams || [];
    if (streams.length === 0) throw new Error(`No streams for ${streamId}`);

    const extractStream = streams.find(s => s.url && s.url.includes('/hls/extract'));
    if (!extractStream) throw new Error(`No /hls/extract stream found for ${streamId}`);
    console.log(`  ✅ /stream OK (${streams.length} streams returned)`);

    // Fetch M3U8
    const m3u8Res = await axios.get(extractStream.url, { timeout: 15000 });
    if (m3u8Res.status !== 200 || !String(m3u8Res.data).includes('#EXTM3U')) {
      throw new Error(`Invalid M3U8 playlist (Status: ${m3u8Res.status})`);
    }
    console.log(`  ✅ M3U8 Playlist OK (${m3u8Res.headers['content-type']})`);

    // Fetch 1st segment
    const segLine = String(m3u8Res.data).split('\n').find(l => l.trim() && !l.startsWith('#'));
    if (!segLine) throw new Error('No segment line in M3U8');

    const segRes = await axios.get(segLine.trim(), { responseType: 'arraybuffer', timeout: 20000 });
    if (segRes.status !== 200 || segRes.data.byteLength === 0) {
      throw new Error(`Failed to fetch segment (Status: ${segRes.status})`);
    }
    console.log(`  ✅ Segment Playback OK (Status: ${segRes.status}, Size: ${(segRes.data.byteLength / 1024).toFixed(1)} KB, Content-Type: ${segRes.headers['content-type']})`);
  }

  // Test 2: Movie (Phim Lẻ)
  const movieCat = await axios.get(`${BASE}/catalog/movie/nguonc-movie-latest.json`);
  const firstMovie = movieCat.data.metas[0];
  await testFilmStream(`[2/5] Phim Lẻ: "${firstMovie.name}"`, 'movie', firstMovie.id);

  // Test 3: Series (Phim Bộ)
  const seriesCat = await axios.get(`${BASE}/catalog/series/nguonc-series-latest.json`);
  const firstSeries = seriesCat.data.metas[0];
  const metaRes = await axios.get(`${BASE}/meta/series/${firstSeries.id}.json`);
  const videos = metaRes.data.meta?.videos || [];
  const epId = videos.length > 0 ? videos[0].id : `${firstSeries.id}:0:1`;
  await testFilmStream(`[3/5] Phim Bộ: "${firstSeries.name}"`, 'series', epId);

  // Test 4: Anime / Hoạt hình
  const animeRes = await axios.get(`${BASE}/catalog/series/nguonc-series-latest/genre=Ho%E1%BA%A1t%20H%C3%ACnh.json`);
  const firstAnime = animeRes.data.metas[0] || { id: 'nguonc:sayonara-lara', name: 'Sayonara Lara' };
  const animeMetaRes = await axios.get(`${BASE}/meta/series/${firstAnime.id}.json`);
  const animeVideos = animeMetaRes.data.meta?.videos || [];
  const animeEpId = animeVideos.length > 0 ? animeVideos[0].id : `${firstAnime.id}:0:1`;
  await testFilmStream(`[4/5] Hoạt Hình / Anime: "${firstAnime.name}"`, 'series', animeEpId);

  // Test 5: Cổ Trang
  const coTrangRes = await axios.get(`${BASE}/catalog/series/nguonc-series-latest/genre=C%E1%BB%95%20Trang.json`);
  const firstCoTrang = coTrangRes.data.metas[0] || { id: 'nguonc:tay-du-ky', name: 'Tây Du Ký' };
  const coTrangMetaRes = await axios.get(`${BASE}/meta/series/${firstCoTrang.id}.json`);
  const coTrangVideos = coTrangMetaRes.data.meta?.videos || [];
  const coTrangEpId = coTrangVideos.length > 0 ? coTrangVideos[0].id : `${firstCoTrang.id}:0:1`;
  await testFilmStream(`[5/5] Cổ Trang: "${firstCoTrang.name}"`, 'series', coTrangEpId);

  console.log('\n════════════════════════════════════════════════════════');
  console.log('🏆 ALL 5 E2E TESTS PASSED 100% - STREAMING ENGINE IS ROCK SOLID!');
  console.log('════════════════════════════════════════════════════════\n');
  process.exit(0);
}

runFullTestSuite().catch(err => {
  console.error('\n❌ TEST SUITE FAILED:', err.message);
  process.exit(1);
});
