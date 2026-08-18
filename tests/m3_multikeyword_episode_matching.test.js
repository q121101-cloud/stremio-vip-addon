'use strict';

/**
 * ============================================================
 *  VIP Movies Addon — tests/m3_multikeyword_episode_matching.test.js
 *  Comprehensive Unit & Adversarial Verification for:
 *  - generateSearchKeywords (Multi-Keyword Fallback)
 *  - matchEpisodeItem (Universal Episode Matching & False Positive Guards)
 *  - Provider integration in KKPhim and NguonC
 * ============================================================
 */

const assert = require('assert');
const { generateSearchKeywords, matchEpisodeItem, isDonghuaQuery } = require('../src/lib/utils');
const kkphim = require('../src/providers/kkphim');
const nguonc = require('../src/providers/nguonc');

let passed = 0;
let failed = 0;

function check(desc, fn) {
  try {
    fn();
    console.log(`  ✅ PASS: ${desc}`);
    passed++;
  } catch (err) {
    console.error(`  ❌ FAIL: ${desc}`);
    console.error(`     Error: ${err.message}`);
    failed++;
  }
}

async function asyncCheck(desc, fn) {
  try {
    await fn();
    console.log(`  ✅ PASS: ${desc}`);
    passed++;
  } catch (err) {
    console.error(`  ❌ FAIL: ${desc}`);
    console.error(`     Error: ${err.message}`);
    failed++;
  }
}

async function runTests() {
  console.log('\n╔══════════════════════════════════════════════════════════════╗');
  console.log('║   M3: MULTI-KEYWORD SEARCH & UNIVERSAL EPISODE MATCHING       ║');
  console.log('╚══════════════════════════════════════════════════════════════╝\n');

  // ════════════════════════════════════════════════════════════════
  // 1. generateSearchKeywords Tests
  // ════════════════════════════════════════════════════════════════
  console.log('--- 1. generateSearchKeywords Unit Tests ---');

  check('Basic title returns direct keyword', () => {
    const kws = generateSearchKeywords('Teach You A Lesson');
    assert(Array.isArray(kws), 'Must return array');
    assert(kws.includes('Teach You A Lesson'), 'Must include original title');
  });

  check('Title with English and Vietnamese aliases (Object argument)', () => {
    const kws = generateSearchKeywords({
      title: 'Teach You A Lesson',
      originalName: '살인자의 쇼핑몰',
      aliases: ['Bài Học Đáng Đời'],
      season: 1,
    });
    assert(kws.includes('Teach You A Lesson'), 'Includes English title');
    assert(kws.includes('Bài Học Đáng Đời'), 'Includes Vietnamese alias');
    assert(kws.includes('살인자의 쇼핑몰'), 'Includes original name');
  });

  check('Title with English and Vietnamese aliases (Positional arguments)', () => {
    const kws = generateSearchKeywords('Teach You A Lesson', '살인자의 쇼핑몰', ['Bài Học Đáng Đời'], 1);
    assert(kws.includes('Teach You A Lesson'), 'Includes English title');
    assert(kws.includes('Bài Học Đáng Đời'), 'Includes Vietnamese alias');
    assert(kws.includes('살in자의 쇼핑몰') || kws.includes('살인자의 쇼핑몰'), 'Includes original name');
  });

  check('Strips trailing 4-digit release years: Inception (2010)', () => {
    const kws = generateSearchKeywords('Inception (2010)');
    assert(kws.includes('Inception (2010)'), 'Includes raw title');
    assert(kws.includes('Inception'), 'Includes year-stripped title');
  });

  check('Strips Season indicators: Lanterns Season 1 -> Lanterns', () => {
    const kws = generateSearchKeywords('Lanterns Season 1');
    assert(kws.includes('Lanterns Season 1'), 'Includes full title');
    assert(kws.includes('Lanterns'), 'Includes season-stripped title');
  });

  check('Strips Vietnamese Phần notation: Cửa Hàng Sát Thủ (Phần 1)', () => {
    const kws = generateSearchKeywords({
      title: 'A Shop for Killers',
      aliases: ['Cửa Hàng Sát Thủ (Phần 1)'],
    });
    assert(kws.includes('A Shop for Killers'), 'Includes title');
    assert(kws.includes('Cửa Hàng Sát Thủ (Phần 1)'), 'Includes raw alias');
    assert(kws.includes('Cửa Hàng Sát Thủ'), 'Includes stripped Phần alias');
  });

  check('Cleans punctuation & special characters: 9-1-1 -> 9-1-1 and 9 1 1', () => {
    const kws = generateSearchKeywords('9-1-1');
    assert(kws.includes('9-1-1'), 'Includes raw 9-1-1');
    assert(kws.includes('9 1 1'), 'Includes clean punctuation 9 1 1');
  });

  check('Handles Avengers 3: Infinity War with colon and season/part variants', () => {
    const kws = generateSearchKeywords('Avengers: Infinity War (2018)', 'Avengers 3', ['Biệt Đội Siêu Anh Hùng 3']);
    assert(kws.includes('Avengers: Infinity War (2018)'));
    assert(kws.includes('Avengers: Infinity War'));
    assert(kws.includes('Avengers Infinity War'));
    assert(kws.includes('Avengers 3'));
    assert(kws.includes('Biệt Đội Siêu Anh Hùng 3'));
  });

  check('Strips S01, P1, Part 2, SS01 variants', () => {
    const kwsS01 = generateSearchKeywords('Dark S01');
    assert(kwsS01.includes('Dark'), 'Strips S01');

    const kwsP1 = generateSearchKeywords('Lupin P1');
    assert(kwsP1.includes('Lupin'), 'Strips P1');

    const kwsPart2 = generateSearchKeywords('Money Heist Part 2');
    assert(kwsPart2.includes('Money Heist'), 'Strips Part 2');
  });

  check('Handles invalid or empty inputs gracefully without throwing', () => {
    assert.deepStrictEqual(generateSearchKeywords(null), []);
    assert.deepStrictEqual(generateSearchKeywords(undefined), []);
    assert.deepStrictEqual(generateSearchKeywords(''), []);
    assert.deepStrictEqual(generateSearchKeywords(123), []);
    assert.deepStrictEqual(generateSearchKeywords({}), []);
  });

  // ════════════════════════════════════════════════════════════════
  // 2. matchEpisodeItem Tests
  // ════════════════════════════════════════════════════════════════
  console.log('\n--- 2. matchEpisodeItem Unit & Adversarial Tests ---');

  check('Matches direct number: "1" for ep 1', () => {
    assert.strictEqual(matchEpisodeItem({ name: '1', slug: 'tap-1' }, '1', 1), true);
    assert.strictEqual(matchEpisodeItem({ name: '1', slug: 'tap-1' }, 1), true);
  });

  check('Matches zero-padded formats: "01", "001", "Tập 01", "tap-01"', () => {
    assert.strictEqual(matchEpisodeItem({ name: '01', slug: 'tap-01' }, '1', 1), true);
    assert.strictEqual(matchEpisodeItem({ name: '001', slug: 'tap-001' }, '1', 1), true);
    assert.strictEqual(matchEpisodeItem({ name: 'Tập 01', slug: 'tap-01' }, '1', 1), true);
    assert.strictEqual(matchEpisodeItem({ name: 'Tập 1', slug: 'tap-1' }, '1', 1), true);
    assert.strictEqual(matchEpisodeItem({ name: 'Tap 01', slug: 'tap-01' }, '1', 1), true);
    assert.strictEqual(matchEpisodeItem({ name: 'Tập01', slug: 'tap-01' }, '1', 1), true);
  });

  check('Matches English formats: "Episode 1", "Episode 01", "Ep 1", "Ep. 01"', () => {
    assert.strictEqual(matchEpisodeItem({ name: 'Episode 1', slug: 'episode-1' }, '1', 1), true);
    assert.strictEqual(matchEpisodeItem({ name: 'Episode 01', slug: 'episode-01' }, '1', 1), true);
    assert.strictEqual(matchEpisodeItem({ name: 'Ep 1', slug: 'ep-1' }, '1', 1), true);
    assert.strictEqual(matchEpisodeItem({ name: 'Ep. 01', slug: 'ep-01' }, '1', 1), true);
  });

  check('Matches Full / Trọn bộ movie single item for target episode 1 or "Full"', () => {
    assert.strictEqual(matchEpisodeItem({ name: 'Full', slug: 'full' }, '1', 1), true);
    assert.strictEqual(matchEpisodeItem({ name: 'FULL', slug: 'full' }, '1', 1), true);
    assert.strictEqual(matchEpisodeItem({ name: 'Trọn Bộ', slug: 'tron-bo' }, '1', 1), true);
    assert.strictEqual(matchEpisodeItem({ name: 'Full', slug: 'full' }, 'full'), true);
  });

  check('Accurately matches double-digit episodes: Ep 10, 11, 12, 100', () => {
    assert.strictEqual(matchEpisodeItem({ name: 'Tập 10', slug: 'tap-10' }, '10', 10), true);
    assert.strictEqual(matchEpisodeItem({ name: 'Tập 11', slug: 'tap-11' }, '11', 11), true);
    assert.strictEqual(matchEpisodeItem({ name: 'Tập 100', slug: 'tap-100' }, '100', 100), true);
  });

  // CRITICAL FALSE POSITIVE GUARDS:
  check('CRITICAL GUARD: Episode 1 does NOT falsely match Episode 10, 11, 12, 21, 100', () => {
    assert.strictEqual(matchEpisodeItem({ name: '10', slug: 'tap-10' }, '1', 1), false, 'Ep 1 must NOT match Ep 10');
    assert.strictEqual(matchEpisodeItem({ name: 'Tập 10', slug: 'tap-10' }, '1', 1), false, 'Ep 1 must NOT match Tập 10');
    assert.strictEqual(matchEpisodeItem({ name: 'Tập 11', slug: 'tap-11' }, '1', 1), false, 'Ep 1 must NOT match Tập 11');
    assert.strictEqual(matchEpisodeItem({ name: 'Tập 12', slug: 'tap-12' }, '1', 1), false, 'Ep 1 must NOT match Tập 12');
    assert.strictEqual(matchEpisodeItem({ name: 'Tập 21', slug: 'tap-21' }, '1', 1), false, 'Ep 1 must NOT match Tập 21');
    assert.strictEqual(matchEpisodeItem({ name: 'Tập 100', slug: 'tap-100' }, '1', 1), false, 'Ep 1 must NOT match Tập 100');
    assert.strictEqual(matchEpisodeItem({ name: 'Episode 10', slug: 'episode-10' }, '1', 1), false, 'Ep 1 must NOT match Episode 10');
    assert.strictEqual(matchEpisodeItem({ name: 'film-tap-10', slug: 'film-tap-10' }, '1', 1), false, 'Ep 1 must NOT match film-tap-10');
  });

  check('CRITICAL GUARD: Episode 2 does NOT falsely match Episode 12, 20, 22', () => {
    assert.strictEqual(matchEpisodeItem({ name: '12', slug: 'tap-12' }, '2', 2), false);
    assert.strictEqual(matchEpisodeItem({ name: 'Tập 20', slug: 'tap-20' }, '2', 2), false);
    assert.strictEqual(matchEpisodeItem({ name: 'Tập 22', slug: 'tap-22' }, '2', 2), false);
  });

  check('Invalid episode numbers and null/empty items return false', () => {
    assert.strictEqual(matchEpisodeItem(null, '1', 1), false);
    assert.strictEqual(matchEpisodeItem({}, '1', 1), false);
    assert.strictEqual(matchEpisodeItem({ name: 'Tập 1' }, '-1', -1), false);
    assert.strictEqual(matchEpisodeItem({ name: 'Tập 1' }, null, null), false);
  });

  // ════════════════════════════════════════════════════════════════
  // 3. Provider Exports & Integration
  // ════════════════════════════════════════════════════════════════
  console.log('\n--- 3. Provider Integration Tests ---');

  check('KKPhim exports matchEpisodeItem and getStreams', () => {
    assert.strictEqual(typeof kkphim.matchEpisodeItem, 'function');
    assert.strictEqual(typeof kkphim.getStreams, 'function');
  });

  check('NguonC exports matchEpisodeItem and getStreams', () => {
    assert.strictEqual(typeof nguonc.matchEpisodeItem, 'function');
    assert.strictEqual(typeof nguonc.getStreams, 'function');
  });

  check('isDonghuaQuery detects Donghua / Anime vs Live-Action accurately', () => {
    assert.strictEqual(isDonghuaQuery('Phàm Nhân Tu Tiên', ['Hoạt Hình', '3D']), true);
    assert.strictEqual(isDonghuaQuery('Soul Land', ['Animation']), true);
    assert.strictEqual(isDonghuaQuery('Teach You A Lesson', ['Drama', 'Crime']), false);
    assert.strictEqual(isDonghuaQuery('A Shop for Killers', ['Action', 'Drama']), false);
  });

  console.log('\n══════════════════════════════════════════════════════════════');
  console.log(`🏁 M3 SUITE SUMMARY: ${passed} PASSED, ${failed} FAILED`);
  console.log('══════════════════════════════════════════════════════════════\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runTests().catch((err) => {
  console.error('Fatal test runner error:', err);
  process.exit(1);
});
