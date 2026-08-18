'use strict';

const axios = require('axios');
const stp = require('../../src/providers/stp');
const clbpx = require('../../src/providers/clbpx');
const yan = require('../../src/providers/yan');

const stpHttp = axios.create({
  headers: {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    'Referer': 'https://sieutamphim.pro/',
  },
  timeout: 8000
});

async function runSurvey() {
  console.log('====================================================');
  console.log('1. INVESTIGATING STP (sieutamphim.pro)');
  console.log('====================================================');

  // Test STP search
  try {
    const sRes = await stpHttp.get('https://sieutamphim.pro/?s=batman');
    console.log('STP Search HTTP status:', sRes.status, 'HTML bytes:', sRes.data.length);
    const parsed = stp.parseStpCardsFromHtml(sRes.data);
    console.log('STP parsed cards count for "batman":', parsed.length);
    if (parsed.length > 0) {
      console.log('Sample parsed card:', JSON.stringify(parsed[0], null, 2));
      const detailUrl = parsed[0].post_url;
      console.log('Fetching post URL:', detailUrl);
      const postRes = await stpHttp.get(detailUrl);
      console.log('Detail post HTTP status:', postRes.status, 'HTML bytes:', postRes.data.length);
      const parsedPost = stp.parsePostContent(postRes.data, parsed[0].name);
      console.log('Parsed post content: name =', parsedPost.name, 'episodes groups count =', parsedPost.episodes.length);
      if (parsedPost.episodes.length > 0) {
        console.log('First group server:', parsedPost.episodes[0].server_name, 'items:', parsedPost.episodes[0].server_data.length);
        if (parsedPost.episodes[0].server_data.length > 0) {
          console.log('First ep stream URL:', parsedPost.episodes[0].server_data[0].link_m3u8);
        }
      }
    }
  } catch (err) {
    console.error('STP direct test error:', err.message);
  }

  // Test STP getStreams via API
  try {
    const streams = await stp.getStreams({ title: 'Batman', year: 2022, proxyBase: 'http://localhost:7000' });
    console.log('STP getStreams for "Batman": count =', streams.length);
    if (streams.length > 0) {
      console.log('First stream title:', streams[0].title);
      console.log('First stream url:', streams[0].url);
    }
  } catch (err) {
    console.error('STP getStreams error:', err.message);
  }

  console.log('\n====================================================');
  console.log('2. INVESTIGATING CLBPX (clbphimxua.info)');
  console.log('====================================================');

  const clbpxHttp = axios.create({
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Referer': 'https://clbphimxua.info/',
    },
    timeout: 8000
  });

  try {
    const sRes = await clbpxHttp.get('https://clbphimxua.info/?s=thien+long');
    console.log('CLBPX Search HTTP status:', sRes.status, 'HTML bytes:', sRes.data.length);
    const parsed = clbpx.parseClbpxCardsFromHtml(sRes.data);
    console.log('CLBPX parsed cards count for "thien long":', parsed.length);
    if (parsed.length > 0) {
      console.log('Sample parsed card:', JSON.stringify(parsed[0], null, 2));
      const slug = parsed[0].slug;
      console.log('Attempting extractClbpxLiveStreams for slug:', slug);
      const liveStreams = await clbpx.extractClbpxLiveStreams(slug, 1);
      console.log('extractClbpxLiveStreams returned:', liveStreams.length, 'servers');
      if (liveStreams.length > 0) {
        console.log('Server 0 data:', JSON.stringify(liveStreams[0], null, 2));
      }
    }
  } catch (err) {
    console.error('CLBPX direct test error:', err.message);
  }

  // Test CLBPX getStreams
  try {
    const streams = await clbpx.getStreams({ title: 'Thiên Long Bát Bộ', proxyBase: 'http://localhost:7000' });
    console.log('CLBPX getStreams for "Thiên Long Bát Bộ": count =', streams.length);
    if (streams.length > 0) {
      console.log('First stream title:', streams[0].title);
      console.log('First stream url:', streams[0].url);
    }
  } catch (err) {
    console.error('CLBPX getStreams error:', err.message);
  }

  console.log('\n====================================================');
  console.log('3. INVESTIGATING YAN (yanhh3d.pw)');
  console.log('====================================================');

  const yanHttp = axios.create({
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Referer': 'https://yanhh3d.pw/',
    },
    timeout: 8000
  });

  try {
    const sRes = await yanHttp.get('https://yanhh3d.pw/search', { params: { keysearch: 'The Gioi Hoan My' } });
    console.log('YAN Search HTTP status:', sRes.status, 'HTML bytes:', sRes.data.length);
    const parsed = yan.parseYanCardsFromHtml(sRes.data);
    console.log('YAN parsed cards count for "The Gioi Hoan My":', parsed.length);
    if (parsed.length > 0) {
      console.log('Sample parsed card:', JSON.stringify(parsed[0], null, 2));
      const slug = parsed[0].slug;
      console.log('Attempting extractYanLiveStreams for slug:', slug, 'tap 1');
      const liveStreams = await yan.extractYanLiveStreams(slug, 1);
      console.log('extractYanLiveStreams count:', liveStreams.length);
      if (liveStreams.length > 0) {
        console.log('First live stream:', JSON.stringify(liveStreams[0], null, 2));
      }
    }
  } catch (err) {
    console.error('YAN direct test error:', err.message);
  }

  console.log('\n====================================================');
  console.log('4. YAN DONGHUA GUARD AUDIT');
  console.log('====================================================');
  const guardCases = [
    { title: 'Teach You A Lesson', type: 'series', genres: ['Drama', 'Crime'] },
    { title: 'A Shop for Killers', type: 'series', genres: ['Action', 'Drama'] },
    { title: 'Lanterns', type: 'series', genres: ['Sci-Fi', 'Mystery'] },
    { title: 'Breaking Bad', type: 'series', genres: ['Crime', 'Drama'] },
    { title: 'Crash Landing on You', type: 'series', genres: ['Romance', 'Comedy'] },
    { title: 'Squid Game', type: 'series', genres: ['Action', 'Thriller'] },
    { title: 'Avengers: Endgame', type: 'movie', genres: ['Action', 'Sci-Fi'] },
    { title: 'Oppenheimer', type: 'movie', genres: ['Biography', 'Drama', 'History'] },
    { title: 'Thế Giới Hoàn Mỹ', type: 'series', genres: ['Animation', 'Action', 'Fantasy'] },
    { title: 'Tiên Nghịch', type: 'series', genres: ['Animation', 'Action'] },
    { title: 'Đấu Phá Thương Khung', type: 'series', genres: ['Animation', 'Adventure'] },
    { title: 'Solo Leveling', type: 'series', genres: ['Animation', 'Action'] },
  ];

  for (const gc of guardCases) {
    const isAllowed = yan.isDonghuaOrAnime(gc.title, gc.genres, gc.type);
    const streams = await yan.getStreams({ ...gc, proxyBase: 'http://localhost:7000' });
    console.log(`[Guard] "${gc.title}" (genres: ${gc.genres.join(', ')}) -> isDonghuaOrAnime: ${isAllowed}, stream count: ${streams.length}`);
  }
}

runSurvey();
