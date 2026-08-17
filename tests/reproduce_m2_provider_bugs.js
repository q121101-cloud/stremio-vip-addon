'use strict';

/**
 * ==============================================================================
 *  VIP Movies Addon — tests/reproduce_m2_provider_bugs.js
 *  Empirical Bug Reproduction Script for Milestone 2 Multi-Provider Architecture
 * ==============================================================================
 */

const assert = require('assert');
const stp = require('../src/providers/stp');
const hh3d = require('../src/providers/hh3d');
const yan = require('../src/providers/yan');
const clbpx = require('../src/providers/clbpx');
const kkphim = require('../src/providers/kkphim');
const nguonc = require('../src/providers/nguonc');
const vsmov = require('../src/providers/vsmov');

async function main() {
  console.log('--- REPRODUCING M2 PROVIDER BUGS ---\n');

  // BUG 1: Blind search fallback returning wrong movie streams for non-existent/adversarial titles
  console.log('1. Testing Blind Search Fallback in Specialized Providers:');
  const bogusTitle = '(*+?)';
  
  const stpStreams = await stp.getStreams({ title: bogusTitle, type: 'movie', proxyBase: 'http://localhost:7000' });
  console.log(`   STP streams for "${bogusTitle}": ${stpStreams.length} stream(s) returned (Expected 0)`);
  
  const hh3dStreams = await hh3d.getStreams({ title: bogusTitle, type: 'series', proxyBase: 'http://localhost:7000' });
  console.log(`   HH3D streams for "${bogusTitle}": ${hh3dStreams.length} stream(s) returned (Expected 0)`);
  
  const yanStreams = await yan.getStreams({ title: bogusTitle, type: 'series', proxyBase: 'http://localhost:7000' });
  console.log(`   YAN streams for "${bogusTitle}": ${yanStreams.length} stream(s) returned (Expected 0)`);

  const clbpxStreams = await clbpx.getStreams({ title: bogusTitle, type: 'series', proxyBase: 'http://localhost:7000' });
  console.log(`   CLBPX streams for "${bogusTitle}": ${clbpxStreams.length} stream(s) returned (Expected 0)`);

  // BUG 2: TypeError when passing extra = null to getCatalog
  console.log('\n2. Testing getCatalog(type, page, null) TypeError:');
  try {
    await vsmov.getCatalog('4k', 1, null);
    console.log('   vsmov.getCatalog(4k, 1, null): Did not throw');
  } catch (err) {
    console.log(`   vsmov.getCatalog(4k, 1, null) threw: ${err.message}`);
  }

  // BUG 3: TypeError when passing non-string slug to getDetail
  console.log('\n3. Testing getDetail(123) TypeError:');
  try {
    await kkphim.getDetail(123);
    console.log('   kkphim.getDetail(123): Did not throw');
  } catch (err) {
    console.log(`   kkphim.getDetail(123) threw: ${err.message}`);
  }

  // BUG 4: Out-of-bounds Season queries returning Season 1 Episode 1
  console.log('\n4. Testing Out-of-bounds Season (season=99999, episode=1):');
  const kkStreams = await kkphim.getStreams({
    imdbId: 'tt0903747',
    title: 'Breaking Bad',
    type: 'series',
    season: 99999,
    episode: 1,
    proxyBase: 'http://localhost:7000',
  });
  console.log(`   KKPhim streams for Breaking Bad Season 99999 Ep 1: ${kkStreams.length} stream(s) returned (Expected 0)`);

  console.log('\n--- Bug reproduction complete ---');
}

main().catch(console.error);
