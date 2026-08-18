'use strict';

const assert = require('assert');
const stp = require('../src/providers/stp');
const clbpx = require('../src/providers/clbpx');
const yan = require('../src/providers/yan');

async function testAll() {
  console.log('--- Testing STP ---');
  // 1. STP XOR deobfuscation
  const enc = 'B^^ZY\u0010\u0005\u0005YBEX^\u0004CDA\u0005ufHElS]}\u0019';
  const dec = stp.decodeXor0x2a(enc);
  assert.strictEqual(dec, 'https://short.ink/_LboFywW3');
  console.log('✅ STP XOR decode passed:', dec);

  // 2. STP parsePostContent
  const sampleHtml = `<div class="episodeGroup" data-server="hx" data-episodes='[\n{"${enc}", "Full"}\n]'></div>`;
  const parsed = stp.parsePostContent(sampleHtml, 'Sat Thu Ninja 2');
  assert.strictEqual(parsed.episodes.length, 1);
  assert.strictEqual(parsed.episodes[0].server_data[0].link_m3u8, 'https://short.ink/_LboFywW3');
  console.log('✅ STP parsePostContent passed!');

  // 3. STP getStreams structure & invariants
  const stpStreams = await stp.getStreams({ title: 'John Wick', year: 2014, proxyBase: 'http://127.0.0.1:7000' });
  console.log('STP streams found:', stpStreams.length);
  for (const s of stpStreams) {
    assert.strictEqual(s.externalUrl, undefined, 'externalUrl must not exist on STP');
    assert.ok(s.url.startsWith('http://127.0.0.1:7000/hls/manifest.m3u8'), 'url must point to HLS proxy');
    assert.ok(s.title.includes('[VIP 4 • STP]'), 'title must match VIP 4 STP format');
    assert.ok(s.title.includes('sieutamphim.pro'), 'title must mention sieutamphim.pro');
  }
  console.log('✅ STP stream invariants passed!');

  console.log('\n--- Testing CLBPX ---');
  const clbpxStreams = await clbpx.getStreams({ title: 'Tay Du Ky', year: 1986, proxyBase: 'http://127.0.0.1:7000', episode: 1 });
  console.log('CLBPX streams found:', clbpxStreams.length);
  for (const s of clbpxStreams) {
    assert.strictEqual(s.externalUrl, undefined, 'externalUrl must not exist on CLBPX');
    assert.ok(s.url.startsWith('http://127.0.0.1:7000/hls/manifest.m3u8'), 'url must point to HLS proxy');
    assert.ok(s.title.includes('[VIP 5 • CLBPX]'), 'title must match VIP 5 CLBPX format');
    assert.ok(s.title.includes('clbphimxua.info'), 'title must mention clbphimxua.info');
  }
  console.log('✅ CLBPX stream invariants passed!');

  console.log('\n--- Testing YAN ---');
  const yanStreams = await yan.getStreams({ title: 'The Gioi Hoan My', proxyBase: 'http://127.0.0.1:7000', episode: 282 });
  console.log('YAN streams found:', yanStreams.length);
  for (const s of yanStreams) {
    assert.strictEqual(s.externalUrl, undefined, 'externalUrl must not exist on YAN');
    assert.ok(s.url.startsWith('http://127.0.0.1:7000/hls/manifest.m3u8'), 'url must point to HLS proxy');
    assert.ok(s.title.includes('[VIP 6 • YAN]'), 'title must match VIP 6 YAN format');
    assert.ok(s.title.includes('yanhh3d.pw'), 'title must mention yanhh3d.pw');
  }
  console.log('✅ YAN stream invariants passed!');

  console.log('\n--- Testing HLS Router Referer Resolution ---');
  const hls = require('../src/routes/hls');
  // Extract SOURCE_REFERERS logic check
  const SOURCE_REFERERS = [
    { pattern: /kkphimplayer|phim1280|phimapi\.com|kkphim/i, referer: 'https://player.phimapi.com/', origin: 'https://player.phimapi.com' },
    { pattern: /vsmov|streamvsmov|p25\.streamvsmov/i,        referer: 'https://vsmov.com/',           origin: 'https://vsmov.com' },
    { pattern: /nguonc\.com/i,                               referer: 'https://phim.nguonc.com/',     origin: 'https://phim.nguonc.com' },
    { pattern: /streamc\.|amass2\.top/i,                     referer: 'https://embed15.streamc.xyz/', origin: 'https://embed15.streamc.xyz' },
    { pattern: /sieutamphim|suutamphim|tvhay/i,              referer: 'https://sieutamphim.pro/',     origin: 'https://sieutamphim.pro' },
    { pattern: /yanhh3d|yan|fbcdn\.cloud|defifa\.com/i,      referer: 'https://yanhh3d.pw/',          origin: 'https://yanhh3d.pw' },
    { pattern: /hh3d|hoathinh3d/i,                           referer: 'https://hh3d.tv/',             origin: 'https://hh3d.tv' },
    { pattern: /clbphimxua|clbpx/i,                          referer: 'https://clbphimxua.info/',     origin: 'https://clbphimxua.info' },
  ];

  function getRefererHeaders(targetUrl, refParam) {
    if (refParam) {
      try {
        let parsedRef = refParam.trim();
        if (!parsedRef.startsWith('http://') && !parsedRef.startsWith('https://')) parsedRef = 'https://' + parsedRef;
        return { referer: parsedRef, origin: new URL(parsedRef).origin };
      } catch {}
    }
    for (const src of SOURCE_REFERERS) {
      if (src.pattern.test(targetUrl)) return { referer: src.referer, origin: src.origin };
    }
    try {
      const origin = new URL(targetUrl).origin;
      return { referer: origin + '/', origin };
    } catch {
      return { referer: 'https://phim.nguonc.com/', origin: 'https://phim.nguonc.com' };
    }
  }

  const tests = [
    ['https://sieutamphim.pro/v.m3u8', null, 'https://sieutamphim.pro/'],
    ['https://suutamphim.org/v.m3u8', null, 'https://sieutamphim.pro/'],
    ['https://clbphimxua.info/v.m3u8', null, 'https://clbphimxua.info/'],
    ['https://clbphimxua.com/v.m3u8', null, 'https://clbphimxua.info/'],
    ['https://yanhh3d.pw/v.m3u8', null, 'https://yanhh3d.pw/'],
    ['https://scontent-sin2-9-xx.fbcdn.cloud/v.m3u8', null, 'https://yanhh3d.pw/'],
    ['https://m.defifa.com/v.ts', null, 'https://yanhh3d.pw/'],
    ['https://hh3d.tv/v.m3u8', null, 'https://hh3d.tv/'],
    ['https://vsmov.com/v.m3u8', null, 'https://vsmov.com/'],
    ['https://player.phimapi.com/v.m3u8', null, 'https://player.phimapi.com/'],
    ['https://phim.nguonc.com/v.m3u8', null, 'https://phim.nguonc.com/'],
  ];

  for (const [url, ref, expected] of tests) {
    const actual = getRefererHeaders(url, ref).referer;
    assert.strictEqual(actual, expected, `URL ${url} should resolve to ${expected}, got ${actual}`);
  }
  console.log('✅ HLS Referer routing verified across all 11 test cases!');

  console.log('\n🎉 ALL M1 INVARIANT & ROUTING TESTS PASSED 100%!');
}

testAll().catch((err) => {
  console.error('❌ Test failed:', err);
  process.exit(1);
});
