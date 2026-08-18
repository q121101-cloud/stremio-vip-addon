'use strict';

/**
 * ============================================================
 *  Verification of Multi-Keyword Fallback with Live Provider Calls
 * ============================================================
 */

const assert = require('assert');
const kkphim = require('../src/providers/kkphim');
const nguonc = require('../src/providers/nguonc');
const { generateSearchKeywords, matchEpisodeItem } = require('../src/lib/utils');

async function testLiveQueries() {
  console.log('Testing generateSearchKeywords across target series:\n');

  const targets = [
    { title: 'Teach You A Lesson', aliases: ['Bài Học Đáng Đời'], type: 'series', season: 1, episode: 1 },
    { title: 'A Shop for Killers', aliases: ['Cửa Hàng Sát Thủ', 'A Shop for Killers (Phần 1)'], type: 'series', season: 1, episode: 1 },
    { title: 'Lanterns', aliases: ['Lanterns: Season 1'], type: 'series', season: 1, episode: 1 },
    { title: '9-1-1', aliases: ['9-1-1 Phần 1'], type: 'series', season: 1, episode: 1 },
    { title: 'Avengers: Infinity War', aliases: ['Avengers 3', 'Biệt Đội Siêu Anh Hùng 3'], type: 'movie' },
  ];

  for (const t of targets) {
    const kws = generateSearchKeywords({
      title: t.title,
      aliases: t.aliases,
      season: t.season,
    });
    console.log(`🎯 "${t.title}": generated ${kws.length} keyword variations:`);
    console.log(`   ${JSON.stringify(kws)}\n`);
  }

  // Live queries to KKPhim
  console.log('--- Testing Live KKPhim Search & Episode Matching ---');
  for (const t of targets.slice(0, 2)) {
    console.log(`Querying KKPhim for "${t.title}"...`);
    const streams = await kkphim.getStreams({
      title: t.title,
      aliases: t.aliases,
      type: t.type,
      season: t.season,
      episode: t.episode,
      proxyBase: 'http://localhost:7000',
    });
    console.log(`  -> Found ${streams.length} stream(s) for "${t.title}"`);
    if (streams.length > 0) {
      console.log(`     Sample: ${streams[0].title.replace(/\n/g, ' ')}`);
      assert(streams[0].url.startsWith('http://localhost:7000/hls/manifest.m3u8'));
      assert(streams[0].externalUrl === undefined);
    }
  }

  // Live queries to NguonC
  console.log('\n--- Testing Live NguonC Search & Episode Matching ---');
  for (const t of targets.slice(0, 2)) {
    console.log(`Querying NguonC for "${t.title}"...`);
    const streams = await nguonc.getStreams({
      title: t.title,
      aliases: t.aliases,
      type: t.type,
      season: t.season,
      episode: t.episode,
      proxyBase: 'http://localhost:7000',
    });
    console.log(`  -> Found ${streams.length} stream(s) for "${t.title}"`);
    if (streams.length > 0) {
      console.log(`     Sample: ${streams[0].title.replace(/\n/g, ' ')}`);
      assert(streams[0].url.startsWith('http://localhost:7000/hls/'));
      assert(streams[0].externalUrl === undefined);
    }
  }

  console.log('\n🎉 All live query tests completed successfully!');
}

testLiveQueries().catch((err) => {
  console.error('Live query test error:', err);
  process.exit(1);
});
