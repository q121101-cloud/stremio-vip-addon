'use strict';

/**
 * ==============================================================================
 *  VIP Movies Addon — tests/challenger_v170_empirical_stress.test.js
 *  Empirical & Adversarial Stress-Test Suite for Engine v1.7.0 Overhaul
 *
 *  Coverage:
 *  1. HLS Proxy Unit & Network Resilience (Rewriting, BaseURL resolution, Headers, Range slicing)
 *  2. Providers Deep Stress: STP (XOR 0x2a, HTML parsing), CLBPX (HTML parsing), YAN (HTML parsing)
 *  3. Strict Donghua Guard: 100% Rejection of KDrama & Hollywood/US-UK titles
 *  4. Multi-Keyword Fallback & Universal Episode Matching (False-Positive guards)
 *  5. Full In-App Protocol Invariant & Live E2E Verification
 * ==============================================================================
 */

const axios = require('axios');
const http = require('http');
const app = require('../src/index');
const hlsRouter = require('../src/routes/hls');
const {
  generateSearchKeywords,
  matchEpisodeItem,
  scoreMatch,
  safeSlug,
  safeKeyword,
  safePage,
  safeType,
  isSeasonMatch,
  isDonghuaQuery,
} = require('../src/lib/utils');
const stp = require('../src/providers/stp');
const clbpx = require('../src/providers/clbpx');
const yan = require('../src/providers/yan');

let totalPassed = 0;
let totalFailed = 0;
const failureDetails = [];

const GREEN = '\x1b[32m✔\x1b[0m';
const RED   = '\x1b[31m✖\x1b[0m';
const CYAN  = '\x1b[36mℹ\x1b[0m';

function expect(condition, desc) {
  if (condition) {
    console.log(`  ${GREEN} ${desc}`);
    totalPassed++;
  } else {
    console.error(`  ${RED} FAIL: ${desc}`);
    totalFailed++;
    failureDetails.push(desc);
  }
}

function encodeB64(str) {
  return Buffer.from(str, 'utf8').toString('base64url');
}

async function run() {
  console.log('\n╔════════════════════════════════════════════════════════════════════════╗');
  console.log('║   🔥 CHALLENGER 1: ENGINE v1.7.0 EMPIRICAL & ADVERSARIAL STRESS SUITE   ║');
  console.log('╚════════════════════════════════════════════════════════════════════════╝\n');

  // Start live ephemeral test server
  const server = app.listen(0);
  const port = server.address().port;
  const BASE = `http://127.0.0.1:${port}`;
  console.log(`${CYAN} Test server listening on ${BASE}\n`);

  try {
    // ══════════════════════════════════════════════════════════════════════════
    //  SECTION 1: HLS PROXY MULTI-LEVEL RESOLUTION & RANGE 206 SLICING
    // ══════════════════════════════════════════════════════════════════════════
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('▶ SECTION 1: HLS Proxy Manifest Rewriting, Headers & Range 206 Slicing');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

    // 1.1: Master M3U8 Rewriting with Sub-variant and Subtitles
    {
      const mockMasterM3U8 = `#EXTM3U
#EXT-X-VERSION:3
#EXT-X-STREAM-INF:BANDWIDTH=3500000,RESOLUTION=1920x1080
3500kb/hls/index.m3u8
#EXT-X-STREAM-INF:BANDWIDTH=1500000,RESOLUTION=1280x720,URI="720p/index.m3u8"
#EXT-X-MEDIA:TYPE=SUBTITLES,GROUP-ID="subs",NAME="Vietnamese",URI="subs/vie.vtt"
#EXT-X-KEY:METHOD=AES-128,URI="enc.key"
`;
      // Create mock upstream HTTP server for master manifest
      const mockMasterServer = http.createServer((req, res) => {
        res.writeHead(200, { 'Content-Type': 'application/vnd.apple.mpegurl' });
        res.end(mockMasterM3U8);
      });
      await new Promise(r => mockMasterServer.listen(0, r));
      const mockMasterPort = mockMasterServer.address().port;
      const upstreamMasterUrl = `http://127.0.0.1:${mockMasterPort}/master.m3u8`;

      const proxyRes = await axios.get(`${BASE}/hls/manifest.m3u8`, {
        params: { url: encodeB64(upstreamMasterUrl), ref: encodeB64('https://phim.nguonc.com/') }
      });

      expect(proxyRes.status === 200, 'Master M3U8 proxy returns HTTP 200');
      expect(proxyRes.headers['content-type'].includes('application/vnd.apple.mpegurl'), 'Content-Type is apple mpegurl');
      expect(proxyRes.headers['access-control-allow-origin'] === '*', 'CORS * header is present');

      const body = String(proxyRes.data);
      expect(body.includes('/hls/manifest.m3u8?url='), 'Sub-variant variant stream rewritten to /hls/manifest.m3u8');
      expect(body.includes('/hls/sub.vtt?url='), 'Subtitle rendition rewritten to /hls/sub.vtt');
      expect(body.includes('/hls/key?url='), 'Decryption key rewritten to /hls/key');

      mockMasterServer.close();
    }

    // 1.2: Sub-Variant M3U8 Rewriting with Relative Segment baseUrl resolution
    {
      const mockSubM3U8 = `#EXTM3U
#EXT-X-VERSION:3
#EXT-X-TARGETDURATION:10
#EXTINF:10.000,
segment_000.ts
#EXTINF:10.000,
../segments/segment_001.ts
#EXTINF:10.000,
/root_segment_002.ts
#EXTINF:10.000,
https://cdn.example.com/segment_003.ts
`;
      const mockSubServer = http.createServer((req, res) => {
        res.writeHead(200, { 'Content-Type': 'application/vnd.apple.mpegurl' });
        res.end(mockSubM3U8);
      });
      await new Promise(r => mockSubServer.listen(0, r));
      const mockSubPort = mockSubServer.address().port;
      const upstreamSubUrl = `http://127.0.0.1:${mockSubPort}/subfolder/variant.m3u8`;

      const proxyRes = await axios.get(`${BASE}/hls/manifest.m3u8`, {
        params: { url: encodeB64(upstreamSubUrl), ref: encodeB64('https://player.phimapi.com/') }
      });

      expect(proxyRes.status === 200, 'Sub-variant M3U8 proxy returns HTTP 200');
      const body = String(proxyRes.data);
      const lines = body.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
      const segLines = lines.filter(l => l.includes('/hls/segment.ts'));

      expect(segLines.length === 4, `All 4 segments rewritten to /hls/segment.ts (found ${segLines.length})`);

      // Verify baseUrl resolution on relative paths
      const seg1UrlParam = new URL(segLines[0]).searchParams.get('url');
      const decodedSeg1 = Buffer.from(seg1UrlParam, 'base64url').toString('utf8');
      expect(decodedSeg1 === `http://127.0.0.1:${mockSubPort}/subfolder/segment_000.ts`, 'Relative segment resolved against subfolder baseUrl');

      const seg2UrlParam = new URL(segLines[1]).searchParams.get('url');
      const decodedSeg2 = Buffer.from(seg2UrlParam, 'base64url').toString('utf8');
      expect(decodedSeg2 === `http://127.0.0.1:${mockSubPort}/segments/segment_001.ts`, 'Parent relative segment (../) resolved correctly');

      mockSubServer.close();
    }

    // 1.3: Binary Segment Proxy (/hls/segment.ts) with Range 206 Local Buffer Slicing
    {
      const dummyTsBuffer = Buffer.alloc(4096);
      dummyTsBuffer.fill(0x47, 0, 188);
      dummyTsBuffer.fill(0xAA, 188, 4096);

      const mockTsServer = http.createServer((req, res) => {
        // Upstream returns 200 full buffer (ignores range)
        res.writeHead(200, {
          'Content-Type': 'video/MP2T',
          'Content-Length': dummyTsBuffer.length
        });
        res.end(dummyTsBuffer);
      });
      await new Promise(r => mockTsServer.listen(0, r));
      const mockTsPort = mockTsServer.address().port;
      const upstreamTsUrl = `http://127.0.0.1:${mockTsPort}/segment_test.ts`;

      // Test 1.3a: Full Segment 200
      const fullRes = await axios.get(`${BASE}/hls/segment.ts`, {
        params: { url: encodeB64(upstreamTsUrl) },
        responseType: 'arraybuffer'
      });
      expect(fullRes.status === 200, 'Segment returns HTTP 200 on full download');
      expect(fullRes.headers['content-type'] === 'video/MP2T', 'Content-Type is video/MP2T');
      expect(fullRes.headers['cache-control'].includes('max-age=3600'), 'Cache-Control has max-age=3600');
      expect(fullRes.headers['accept-ranges'] === 'bytes', 'Accept-Ranges is bytes');
      expect(fullRes.data.length === 4096, 'Full segment buffer length is 4096');

      // Test 1.3b: Range 206 Slicing [0-99]
      const range1Res = await axios.get(`${BASE}/hls/segment.ts`, {
        params: { url: encodeB64(upstreamTsUrl) },
        headers: { Range: 'bytes=0-99' },
        responseType: 'arraybuffer'
      });
      expect(range1Res.status === 206, 'Range bytes=0-99 returns HTTP 206');
      expect(range1Res.headers['content-range'] === 'bytes 0-99/4096', 'Content-Range is bytes 0-99/4096');
      expect(range1Res.data.length === 100, 'Sliced buffer length is 100');
      expect(range1Res.data[0] === 0x47, 'MPEG-TS sync byte 0x47 preserved in sliced range');

      // Test 1.3c: Range 206 Slicing [100-199]
      const range2Res = await axios.get(`${BASE}/hls/segment.ts`, {
        params: { url: encodeB64(upstreamTsUrl) },
        headers: { Range: 'bytes=100-199' },
        responseType: 'arraybuffer'
      });
      expect(range2Res.status === 206, 'Range bytes=100-199 returns HTTP 206');
      expect(range2Res.headers['content-range'] === 'bytes 100-199/4096', 'Content-Range is bytes 100-199/4096');
      expect(range2Res.data.length === 100, 'Sliced buffer length is 100');

      mockTsServer.close();
    }

    // 1.4: Subtitle WebVTT Proxy (/hls/sub.vtt)
    {
      const rawSrt = `1
00:00:01,000 --> 00:00:04,000
Xin chào Việt Nam!

2
00:00:05,500 --> 00:00:08,000
Chào mừng đến với VIP Movies Addon.
`;
      const mockSubServer = http.createServer((req, res) => {
        res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end(rawSrt);
      });
      await new Promise(r => mockSubServer.listen(0, r));
      const mockSubPort = mockSubServer.address().port;
      const upstreamSubUrl = `http://127.0.0.1:${mockSubPort}/sub.srt`;

      const subRes = await axios.get(`${BASE}/hls/sub.vtt`, {
        params: { url: encodeB64(upstreamSubUrl) }
      });
      expect(subRes.status === 200, 'Subtitle proxy returns HTTP 200');
      expect(subRes.headers['content-type'].includes('text/vtt'), 'Content-Type is text/vtt');
      const vttContent = String(subRes.data);
      expect(vttContent.startsWith('WEBVTT'), 'Converted subtitle starts with WEBVTT header');
      expect(vttContent.includes('00:00:01.000 --> 00:00:04.000'), 'Comma timestamps converted to dot timestamps');
      expect(vttContent.includes('Xin chào Việt Nam!'), 'Vietnamese Unicode diacritics preserved');

      mockSubServer.close();
    }


    // ══════════════════════════════════════════════════════════════════════════
    //  SECTION 2: PROVIDERS STRESS (STP, CLBPX, YAN)
    // ══════════════════════════════════════════════════════════════════════════
    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('▶ SECTION 2: Provider Deep Stress (STP, CLBPX, YAN)');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

    // 2.1: STP XOR 0x2a Decode & Card Parser
    {
      const sampleUrl = 'https://example.com/hls/index.m3u8';
      let encoded = '';
      for (let i = 0; i < sampleUrl.length; i++) {
        encoded += String.fromCharCode(sampleUrl.charCodeAt(i) ^ 0x2a);
      }
      const decoded = stp.decodeXor0x2a(encoded);
      expect(decoded === sampleUrl, 'STP XOR 0x2a decodes obfuscated URLs correctly');
      expect(stp.decodeXor0x2a(null) === '', 'STP XOR 0x2a handles null safely');
      expect(stp.decodeXor0x2a('') === '', 'STP XOR 0x2a handles empty string safely');

      // Test HTML Card Parser
      const mockStpHtml = `
        <div class="post-item">
          <a href="https://sieutamphim.pro/2026/01/avatar-3-2026.html" title="Avatar 3: Hỏa Tro">
            <img data-src="https://sieutamphim.pro/images/avatar3.jpg" />
            <h5 class="post-title"><a>Avatar 3 &#8211; Status: HD</a></h5>
          </a>
        </div>
      `;
      const cards = stp.parseStpCardsFromHtml(mockStpHtml);
      expect(Array.isArray(cards) && cards.length >= 1, 'STP parseStpCardsFromHtml extracts cards');
      if (cards.length > 0) {
        expect(cards[0].slug === 'avatar-3-2026', 'STP card slug extracted correctly');
        expect(cards[0].name.includes('Avatar 3'), 'STP card title cleaned properly');
      }

      // Test Post Content Parser with episodeGroup
      const mockPostHtml = `
        <div class="episodeGroup" data-server="Server VIP 1" data-episodes='[{"${encoded}","1"},{"${encoded}","2"}]'></div>
      `;
      const parsedPost = stp.parsePostContent(mockPostHtml, 'Avatar 3');
      expect(parsedPost.episodes.length === 1, 'STP parsePostContent extracts episodeGroup');
      expect(parsedPost.episodes[0].server_data.length === 2, 'STP parsePostContent decodes 2 episodes');
      expect(parsedPost.episodes[0].server_data[0].link_m3u8 === sampleUrl, 'STP episode link matches decoded URL');
    }

    // 2.2: CLBPX Card Parser
    {
      const mockClbpxHtml = `
        <a class="halim-thumb" href="https://clbphimxua.info/anh-hung-xa-dieu-1983" title="Anh Hùng Xạ Điêu 1983">
          <img src="https://clbphimxua.info/images/ahxd.jpg" />
          <p class="original_title">The Legend of the Condor Heroes</p>
        </a>
      `;
      const cards = clbpx.parseClbpxCardsFromHtml(mockClbpxHtml);
      expect(Array.isArray(cards) && cards.length >= 1, 'CLBPX parseClbpxCardsFromHtml extracts cards');
      if (cards.length > 0) {
        expect(cards[0].slug === 'anh-hung-xa-dieu-1983', 'CLBPX card slug extracted correctly');
        expect(cards[0].origin_name === 'The Legend of the Condor Heroes', 'CLBPX original title extracted');
      }
    }

    // 2.3: YAN Card Parser
    {
      const mockYanHtml = `
        <a href="https://yanhh3d.pw/the-gioi-hoan-my" title="Thế Giới Hoàn Mỹ">
          <img src="https://yanhh3d.pw/images/tghm.jpg" />
        </a>
        <a href="https://yanhh3d.pw/moi-cap-nhat" title="Mới Cập Nhật"></a>
      `;
      const cards = yan.parseYanCardsFromHtml(mockYanHtml);
      expect(cards.length === 1, 'YAN parser ignores static routes (moi-cap-nhat) and returns 1 card');
      expect(cards[0].slug === 'the-gioi-hoan-my', 'YAN card slug extracted correctly');
    }


    // ══════════════════════════════════════════════════════════════════════════
    //  SECTION 3: STRICT DONGHUA GUARD IN YAN (100% ZERO-STREAM REJECTION)
    // ══════════════════════════════════════════════════════════════════════════
    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('▶ SECTION 3: Strict Donghua Guard in YAN (isDonghuaOrAnime & getStreams)');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

    // 3.1: KDrama titles rejection
    const kdramaTitles = [
      'Teach You A Lesson',
      'A Shop for Killers',
      'Crash Landing on You',
      'Squid Game',
      'The Glory',
      'Queen of Tears',
      'Vincenzo',
      'Itaewon Class',
      'Descendants of the Sun',
      'Goblin',
      'Moving',
      'All of Us Are Dead',
    ];

    for (const title of kdramaTitles) {
      const allowed = yan.isDonghuaOrAnime(title, ['Drama', 'Action'], 'series');
      expect(allowed === false, `STRICT GUARD: KDrama "${title}" is REJECTED (false)`);
    }

    // 3.2: Hollywood & US-UK titles rejection
    const hollywoodTitles = [
      'Lanterns',
      'Avengers: Endgame',
      'Breaking Bad',
      'Oppenheimer',
      'Stranger Things',
      'Game of Thrones',
      'House of the Dragon',
      'The Boys',
      'Better Call Saul',
      'The Walking Dead',
      'Prison Break',
      'Money Heist',
    ];

    for (const title of hollywoodTitles) {
      const allowed = yan.isDonghuaOrAnime(title, ['Action', 'Sci-Fi'], 'movie');
      expect(allowed === false, `STRICT GUARD: Hollywood "${title}" is REJECTED (false)`);
    }

    // 3.3: True Donghua & Anime titles acceptance
    const donghuaTitles = [
      'Thế Giới Hoàn Mỹ',
      'Tiên Nghịch',
      'Đấu La Đại Lục',
      'Đấu Phá Thương Khung',
      'Phàm Nhân Tu Tiên',
      'Thôn Phệ Tinh Không',
      'Già Thiên',
      'Mục Thần Ký',
      'Trảm Thần',
      'Solo Leveling',
      'One Piece',
      'Naruto',
      'Jujutsu Kaisen',
      'Demon Slayer',
      'Attack on Titan',
    ];

    for (const title of donghuaTitles) {
      const allowed = yan.isDonghuaOrAnime(title, [], 'series');
      expect(allowed === true, `STRICT GUARD: Genuine Donghua/Anime "${title}" is ACCEPTED (true)`);
    }

    // 3.4: Empirical getStreams call to YAN for Teach You A Lesson & Avengers
    {
      const yanTyalStreams = await yan.getStreams({ title: 'Teach You A Lesson', type: 'series', episode: 1 });
      expect(Array.isArray(yanTyalStreams) && yanTyalStreams.length === 0, 'YAN getStreams returns 0 streams for Teach You A Lesson');

      const yanAvgStreams = await yan.getStreams({ title: 'Avengers: Infinity War', type: 'movie' });
      expect(Array.isArray(yanAvgStreams) && yanAvgStreams.length === 0, 'YAN getStreams returns 0 streams for Avengers');

      const yanShopStreams = await yan.getStreams({ title: 'A Shop for Killers', type: 'series', episode: 1 });
      expect(Array.isArray(yanShopStreams) && yanShopStreams.length === 0, 'YAN getStreams returns 0 streams for A Shop for Killers');
    }


    // ══════════════════════════════════════════════════════════════════════════
    //  SECTION 4: MULTI-KEYWORD FALLBACK & EPISODE MATCHING GUARD
    // ══════════════════════════════════════════════════════════════════════════
    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('▶ SECTION 4: Multi-Keyword Search Fallback & False-Positive Episode Guard');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

    // 4.1: Keyword Generation
    {
      const kw1 = generateSearchKeywords('Lanterns (Season 1)', 'Lanterns', ['Đèn Lồng Xanh']);
      expect(kw1.includes('Lanterns'), 'Generated keywords contain stripped title "Lanterns"');

      const kw2 = generateSearchKeywords('A Shop for Killers (Phần 1)', 'A Shop for Killers', []);
      expect(kw2.includes('A Shop for Killers'), 'Generated keywords strip "(Phần 1)" correctly');

      const kw3 = generateSearchKeywords('9-1-1: Lone Star', '9-1-1: Lone Star', []);
      expect(kw3.some(k => k.includes('9 1 1 Lone Star')), 'Generated keywords normalize punctuation "9 1 1 Lone Star"');

      const kw4 = generateSearchKeywords('Inception (2010)', 'Inception', []);
      expect(kw4.includes('Inception'), 'Generated keywords strip trailing release year');
    }

    // 4.2: Episode Matcher — False-Positive Guards (Ep 1 matching Ep 10, 11, 100, etc.)
    {
      const ep10 = { name: 'Tập 10', slug: 'tap-10' };
      const ep11 = { name: 'Tập 11', slug: 'tap-11' };
      const ep12 = { name: 'Episode 12', slug: 'episode-12' };
      const ep100 = { name: 'Tập 100', slug: 'tap-100' };
      const ep21 = { name: 'Tap 21', slug: 'tap-21' };

      expect(matchEpisodeItem(ep10, '1', 1) === false, 'FALSE-POSITIVE GUARD: Target Ep 1 does NOT match "Tập 10"');
      expect(matchEpisodeItem(ep11, '1', 1) === false, 'FALSE-POSITIVE GUARD: Target Ep 1 does NOT match "Tập 11"');
      expect(matchEpisodeItem(ep12, '1', 1) === false, 'FALSE-POSITIVE GUARD: Target Ep 1 does NOT match "Episode 12"');
      expect(matchEpisodeItem(ep100, '1', 1) === false, 'FALSE-POSITIVE GUARD: Target Ep 1 does NOT match "Tập 100"');
      expect(matchEpisodeItem(ep21, '1', 1) === false, 'FALSE-POSITIVE GUARD: Target Ep 1 does NOT match "Tap 21"');

      const ep20 = { name: 'Tập 20', slug: 'tap-20' };
      const ep22 = { name: 'Tập 22', slug: 'tap-22' };
      expect(matchEpisodeItem(ep20, '2', 2) === false, 'FALSE-POSITIVE GUARD: Target Ep 2 does NOT match "Tập 20"');
      expect(matchEpisodeItem(ep22, '2', 2) === false, 'FALSE-POSITIVE GUARD: Target Ep 2 does NOT match "Tập 22"');
    }

    // 4.3: Episode Matcher — True-Positive Matches
    {
      const validEp1Items = [
        { name: '1', slug: '1' },
        { name: '01', slug: '01' },
        { name: 'Tập 1', slug: 'tap-1' },
        { name: 'Tập 01', slug: 'tap-01' },
        { name: 'Tap 1', slug: 'tap-1' },
        { name: 'Tap 01', slug: 'tap-01' },
        { name: 'Episode 1', slug: 'episode-1' },
        { name: 'Episode 01', slug: 'episode-01' },
        { name: 'Ep 1', slug: 'ep-1' },
        { name: 'Ep. 1', slug: 'ep-01' },
        { name: 'E01', slug: 'e01' },
        { name: 'Full', slug: 'full' },
        { name: 'Trọn Bộ', slug: 'tron-bo' },
      ];

      for (const item of validEp1Items) {
        expect(matchEpisodeItem(item, '1', 1) === true, `TRUE-POSITIVE: Target Ep 1 matches "${item.name}" (${item.slug})`);
      }
    }

    // 4.4: Out of bounds & Negative Episode Guards
    {
      const ep1 = { name: 'Tập 1', slug: 'tap-1' };
      expect(matchEpisodeItem(ep1, '-1', -1) === false, 'NEGATIVE GUARD: Target Ep -1 returns false');
      expect(matchEpisodeItem(ep1, '0', 0) === false, 'ZERO GUARD: Target Ep 0 returns false');
      expect(matchEpisodeItem(ep1, '-99', -99) === false, 'NEGATIVE GUARD: Target Ep -99 returns false');
    }


    // ══════════════════════════════════════════════════════════════════════════
    //  SECTION 5: FULL IN-APP PROTOCOL INVARIANT & LIVE STREAM INTEGRITY
    // ══════════════════════════════════════════════════════════════════════════
    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('▶ SECTION 5: In-App Protocol Invariant & Live Stream Aggregation');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

    // Test live stream aggregation for Harry Potter Movie (tt0373889)
    const hpRes = await axios.get(`${BASE}/default/stream/movie/tt0373889.json`);
    expect(hpRes.status === 200, 'GET /stream/movie/tt0373889.json returns HTTP 200');
    const hpStreams = hpRes.data?.streams || [];
    expect(hpStreams.length > 0, `Harry Potter returned ${hpStreams.length} stream(s) (> 0)`);

    for (const stream of hpStreams) {
      expect(stream.url && typeof stream.url === 'string', `Stream "${stream.title.split('\n')[0]}" has valid url`);
      expect(stream.externalUrl === undefined, `Stream "${stream.title.split('\n')[0]}" has STRICTLY NO externalUrl`);
      expect(stream.name === 'VIP Movies 🎬', `Stream has official VIP Movies 🎬 brand name`);
    }

  } catch (err) {
    console.error(`\n${RED} Uncaught error during stress execution:`, err.message);
    totalFailed++;
    failureDetails.push(`Uncaught error: ${err.message}`);
  } finally {
    server.close();
  }

  // ══════════════════════════════════════════════════════════════════════════
  //  FINAL SUMMARY
  // ══════════════════════════════════════════════════════════════════════════
  console.log('\n════════════════════════════════════════════════════════════════════════');
  console.log('📊 CHALLENGER 1 STRESS TEST RESULTS');
  console.log('════════════════════════════════════════════════════════════════════════');
  console.log(`  ${GREEN} Passed Assertions : ${totalPassed}`);
  console.log(`  ${RED} Failed Assertions : ${totalFailed}`);

  if (totalFailed > 0) {
    console.log('\nList of Failures:');
    failureDetails.forEach(f => console.log(`  - ${f}`));
    process.exit(1);
  } else {
    console.log(`\n🎉 ALL ${totalPassed} STRESS ASSERTIONS PASSED EMPIRICALLY WITH 100% ACCURACY!\n`);
    process.exit(0);
  }
}

run();
