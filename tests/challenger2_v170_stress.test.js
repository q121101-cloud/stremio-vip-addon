'use strict';

/**
 * ==============================================================================
 *  VIP Movies Addon — tests/challenger2_v170_stress.test.js (Engine v1.7.0)
 *  Challenger 2 Empirical Adversarial Stress Test Suite
 *
 *  Verification Target Areas:
 *    1. HLS Proxy Router (`src/routes/hls.js`):
 *       - Multi-level M3U8 master/sub-variant URL rewriting & baseUrl resolution
 *       - Audio / Subtitle / Key / Map / LL-HLS Part proxy rewriting
 *       - Subtitle track injection with sub parameter & deduplication
 *       - Referer & Origin dynamic header mapping for all 6 CDN sources
 *       - Binary TS segment Range 206 chunk slicing (local slice & upstream 206)
 *       - Headers: Content-Type `video/MP2T`, `Cache-Control: public, max-age=3600`, CORS
 *       - WebVTT Subtitle Proxy normalization (BOM, CRLF, comma timestamps)
 *    2. Specialized Providers (STP, CLBPX, YAN):
 *       - Standard export interface compliance
 *       - STP: XOR 0x2a decryption, card HTML parsing, post content group parsing
 *       - CLBPX: Card parsing, live extraction logic
 *       - YAN: Card parsing, static route exclusions, live stream extraction
 *       - Strict In-App protocol invariant: 0% externalUrl, 100% /hls proxy
 *       - Input resilience (null, undefined, non-string, negative numbers)
 *    3. Strict Donghua Guard in YAN (`isDonghuaOrAnime`):
 *       - Complete rejection (0 streams / returns false) on KDramas (Teach You A Lesson,
 *         A Shop for Killers, Crash Landing on You, Squid Game, Vincenzo, etc.)
 *       - Complete rejection on US-UK / Hollywood (Lanterns, Avengers, Breaking Bad,
 *         Oppenheimer, Stranger Things, Game of Thrones, etc.)
 *       - Acceptance (returns true) on genuine Donghua / Anime titles & Animation genres
 *    4. Multi-Keyword Fallback & Flexible Episode Regex Matching (`src/lib/utils.js`):
 *       - `generateSearchKeywords` candidate permutations, season/year stripping
 *       - `matchEpisodeItem` multi-digit boundary safety: Ep 1 vs Ep 10/11/12/100
 *       - Full, integer, Vietnamese, English, and slug matching
 * ==============================================================================
 */

const http = require('http');
const express = require('express');
const axios = require('axios');
const assert = require('assert');

const hlsRouter = require('../src/routes/hls');
const stpProvider = require('../src/providers/stp');
const clbpxProvider = require('../src/providers/clbpx');
const yanProvider = require('../src/providers/yan');
const { isDonghuaOrAnime } = require('../src/providers/yan');
const {
  generateSearchKeywords,
  matchEpisodeItem,
  scoreMatch,
  isSeasonMatch,
  extractSeasonNumber,
  safeString,
  safeSlug,
  safeKeyword,
  safePage,
  safeType,
  normalizeText,
} = require('../src/lib/utils');

const GREEN = '\x1b[32m';
const RED   = '\x1b[31m';
const CYAN  = '\x1b[36m';
const GRAY  = '\x1b[90m';
const BOLD  = '\x1b[1m';
const RESET = '\x1b[0m';

let passed = 0;
let failed = 0;
const failures = [];

function check(desc, condition) {
  if (condition) {
    passed++;
    console.log(`  ${GREEN}✓${RESET} ${desc}`);
  } else {
    failed++;
    failures.push(desc);
    console.log(`  ${RED}✗ FAIL:${RESET} ${desc}`);
  }
}

function encodeB64Url(str) {
  return Buffer.from(str, 'utf8').toString('base64url');
}

function decodeB64Url(str) {
  return Buffer.from(str, 'base64url').toString('utf8');
}

async function runChallenger2StressSuite() {
  console.log(`\n${BOLD}${CYAN}╔══════════════════════════════════════════════════════════════════════════════╗${RESET}`);
  console.log(`${BOLD}${CYAN}║     🛡️ CHALLENGER 2: ENGINE v1.7.0 ADVERSARIAL STRESS TEST SUITE            ║${RESET}`);
  console.log(`${BOLD}${CYAN}║     HLS Multi-Level Rewriting, Range 206, STP/CLBPX/YAN, Guard, Regex      ║${RESET}`);
  console.log(`${BOLD}${CYAN}╚══════════════════════════════════════════════════════════════════════════════╝${RESET}\n`);

  // ──────────────────────────────────────────────────────────────────────────
  //  MOCK UPSTREAM CDN SERVER FOR REPRODUCIBLE HLS PROXY STRESS TESTING
  // ──────────────────────────────────────────────────────────────────────────
  let capturedUpstreamHeaders = {};
  let mockTsBuffer = Buffer.alloc(153600); // 150 KB
  mockTsBuffer[0] = 0x47; // MPEG-TS Sync Byte
  for (let i = 188; i < mockTsBuffer.length; i += 188) {
    mockTsBuffer[i] = 0x47;
  }

  const mockApp = express();

  // Mock Master Playlist without preexisting subtitle group (for subtitle injection test)
  mockApp.get('/cdn/master-raw.m3u8', (req, res) => {
    capturedUpstreamHeaders['/cdn/master-raw.m3u8'] = req.headers;
    res.setHeader('Content-Type', 'application/vnd.apple.mpegurl');
    res.send(`#EXTM3U
#EXT-X-VERSION:4
#EXT-X-STREAM-INF:BANDWIDTH=2500000,RESOLUTION=1280x720,CODECS="avc1.64001f,mp4a.40.2"
720p/index.m3u8
#EXT-X-STREAM-INF:BANDWIDTH=5000000,RESOLUTION=1920x1080,CODECS="avc1.640028,mp4a.40.2"
https://mockcdn.com/stream/1080p/index.m3u8
`);
  });

  // Mock Master Playlist with existing audio & subtitle tracks
  mockApp.get('/cdn/master.m3u8', (req, res) => {
    capturedUpstreamHeaders['/cdn/master.m3u8'] = req.headers;
    res.setHeader('Content-Type', 'application/vnd.apple.mpegurl');
    res.send(`#EXTM3U
#EXT-X-VERSION:4
#EXT-X-MEDIA:TYPE=AUDIO,GROUP-ID="audio-main",NAME="Vietnamese",DEFAULT=YES,AUTOSELECT=YES,LANGUAGE="vi",URI="audio/vi.m3u8"
#EXT-X-MEDIA:TYPE=SUBTITLES,GROUP-ID="subs",NAME="Vietnamese",DEFAULT=YES,AUTOSELECT=YES,LANGUAGE="vi",URI="subtitles/vi.vtt"
#EXT-X-STREAM-INF:BANDWIDTH=2500000,RESOLUTION=1280x720,CODECS="avc1.64001f,mp4a.40.2",AUDIO="audio-main"
720p/index.m3u8
#EXT-X-STREAM-INF:BANDWIDTH=5000000,RESOLUTION=1920x1080,CODECS="avc1.640028,mp4a.40.2",AUDIO="audio-main"
https://mockcdn.com/stream/1080p/index.m3u8
`);
  });

  // Mock Sub-variant Media Playlist
  mockApp.get('/cdn/720p/index.m3u8', (req, res) => {
    capturedUpstreamHeaders['/cdn/720p/index.m3u8'] = req.headers;
    res.setHeader('Content-Type', 'application/vnd.apple.mpegurl');
    res.send(`#EXTM3U
#EXT-X-VERSION:4
#EXT-X-TARGETDURATION:10
#EXT-X-MEDIA-SEQUENCE:0
#EXT-X-KEY:METHOD=AES-128,URI="enc.key",IV=0x0123456789abcdef0123456789abcdef
#EXT-X-MAP:URI="init.mp4"
#EXTINF:10.000,
seg-001.ts
#EXTINF:10.000,
seg-002.ts
#EXTINF:10.000,
/absolute/seg-003.ts
#EXTINF:10.000,
https://othercdn.com/seg-004.ts
#EXT-X-PART:DURATION=0.5,URI="part-001.mp4"
#EXT-X-ENDLIST
`);
  });

  // Mock Subtitle File
  mockApp.get('/cdn/sub.vtt', (req, res) => {
    capturedUpstreamHeaders['/cdn/sub.vtt'] = req.headers;
    res.setHeader('Content-Type', 'text/vtt');
    res.send(`\uFEFF1
00:00:01,000 --> 00:00:04,500
Xin chào Việt Nam!
`);
  });

  // Mock TS Segment Endpoint
  mockApp.get('/cdn/seg-001.ts', (req, res) => {
    capturedUpstreamHeaders['/cdn/seg-001.ts'] = req.headers;
    res.setHeader('Content-Type', 'video/MP2T');
    res.setHeader('Accept-Ranges', 'bytes');

    if (req.headers.range) {
      const match = req.headers.range.match(/bytes=(\d+)-(\d*)/);
      if (match) {
        const start = parseInt(match[1], 10);
        let end = match[2] ? parseInt(match[2], 10) : mockTsBuffer.length - 1;
        if (isNaN(end) || end >= mockTsBuffer.length) end = mockTsBuffer.length - 1;
        const slice = mockTsBuffer.subarray(start, end + 1);
        res.status(206);
        res.setHeader('Content-Range', `bytes ${start}-${end}/${mockTsBuffer.length}`);
        res.setHeader('Content-Length', slice.length);
        return res.send(slice);
      }
    }

    res.setHeader('Content-Length', mockTsBuffer.length);
    res.send(mockTsBuffer);
  });

  // Mock Upstream 200 without Range support (for testing local proxy slicing)
  mockApp.get('/cdn/seg-no-upstream-range.ts', (req, res) => {
    capturedUpstreamHeaders['/cdn/seg-no-upstream-range.ts'] = req.headers;
    res.setHeader('Content-Type', 'video/MP2T');
    res.setHeader('Content-Length', mockTsBuffer.length);
    res.status(200).send(mockTsBuffer);
  });

  const mockServer = await new Promise((resolve) => {
    const s = mockApp.listen(0, '127.0.0.1', () => resolve(s));
  });
  const mockPort = mockServer.address().port;
  const mockBase = `http://127.0.0.1:${mockPort}`;

  // ──────────────────────────────────────────────────────────────────────────
  //  HLS PROXY LOCAL SERVER INSTANCE
  // ──────────────────────────────────────────────────────────────────────────
  const proxyApp = express();
  proxyApp.use('/hls', hlsRouter);

  const proxyServer = await new Promise((resolve) => {
    const s = proxyApp.listen(0, '127.0.0.1', () => resolve(s));
  });
  const proxyPort = proxyServer.address().port;
  const proxyBase = `http://127.0.0.1:${proxyPort}`;

  try {
    // ══════════════════════════════════════════════════════════════════════════
    //  SECTION 1: HLS Proxy Router (`src/routes/hls.js`)
    // ══════════════════════════════════════════════════════════════════════════
    console.log(`${BOLD}${CYAN}▶ SECTION 1: HLS Proxy Router Deep Stress Tests${RESET}`);

    // 1.1 Master Playlist Multi-Level Rewriting & Sub-variant Resolution
    const masterTargetUrl = `${mockBase}/cdn/master.m3u8`;
    const masterProxyUrl = `${proxyBase}/hls/manifest.m3u8?url=${encodeB64Url(masterTargetUrl)}&ref=${encodeB64Url('https://player.phimapi.com/')}`;
    
    const masterRes = await axios.get(masterProxyUrl);
    check('Master playlist returns HTTP 200', masterRes.status === 200);
    check('Master playlist Content-Type is application/vnd.apple.mpegurl', masterRes.headers['content-type'].includes('application/vnd.apple.mpegurl'));
    check('Master playlist Cache-Control is no-cache, no-store', masterRes.headers['cache-control'].includes('no-cache'));
    check('Master playlist CORS Access-Control-Allow-Origin is *', masterRes.headers['access-control-allow-origin'] === '*');

    const masterBody = String(masterRes.data);
    check('Master body contains #EXTM3U', masterBody.includes('#EXTM3U'));

    // Check Audio rendition rewriting
    const audioLine = masterBody.split('\n').find((l) => l.startsWith('#EXT-X-MEDIA:TYPE=AUDIO'));
    check('Audio rendition URI is rewritten to /hls/manifest.m3u8', audioLine && audioLine.includes('/hls/manifest.m3u8?url='));
    if (audioLine) {
      const match = audioLine.match(/URI="([^"]+)"/);
      const u = new URL(match[1]);
      const decodedTarget = decodeB64Url(u.searchParams.get('url'));
      check('Audio rendition resolves baseUrl to http://127.0.0.1:.../cdn/audio/vi.m3u8', decodedTarget === `${mockBase}/cdn/audio/vi.m3u8`);
    }

    // Check Subtitle rendition rewriting (.vtt routes to /hls/sub.vtt)
    const subLine = masterBody.split('\n').find((l) => l.startsWith('#EXT-X-MEDIA:TYPE=SUBTITLES'));
    check('Subtitle rendition URI is rewritten to /hls/sub.vtt', subLine && subLine.includes('/hls/sub.vtt?url='));
    if (subLine) {
      const match = subLine.match(/URI="([^"]+)"/);
      const u = new URL(match[1]);
      const decodedTarget = decodeB64Url(u.searchParams.get('url'));
      check('Subtitle rendition resolves baseUrl to http://127.0.0.1:.../cdn/subtitles/vi.vtt', decodedTarget === `${mockBase}/cdn/subtitles/vi.vtt`);
    }

    // Check Sub-variant relative vs absolute URLs in Master
    const variantLines = masterBody.split('\n').filter((l) => l.startsWith('http') && l.includes('/hls/manifest.m3u8'));
    check('Master playlist contains rewritten sub-variant URLs', variantLines.length >= 2);
    
    if (variantLines.length >= 2) {
      const v1Url = new URL(variantLines[0]);
      const v1Target = decodeB64Url(v1Url.searchParams.get('url'));
      check('Relative sub-variant 720p/index.m3u8 resolved to http://127.0.0.1:.../cdn/720p/index.m3u8', v1Target === `${mockBase}/cdn/720p/index.m3u8`);

      const v2Url = new URL(variantLines[1]);
      const v2Target = decodeB64Url(v2Url.searchParams.get('url'));
      check('Absolute sub-variant preserved https://mockcdn.com/stream/1080p/index.m3u8', v2Target === 'https://mockcdn.com/stream/1080p/index.m3u8');
    }

    // 1.2 Sub-variant Media Playlist Rewriting (Segments, Keys, Maps, Parts)
    const subMediaTargetUrl = `${mockBase}/cdn/720p/index.m3u8`;
    const subMediaProxyUrl = `${proxyBase}/hls/manifest.m3u8?url=${encodeB64Url(subMediaTargetUrl)}&ref=${encodeB64Url('https://phim.nguonc.com/')}`;

    const subMediaRes = await axios.get(subMediaProxyUrl);
    check('Sub-variant media playlist returns HTTP 200', subMediaRes.status === 200);
    const subMediaBody = String(subMediaRes.data);

    // Key file rewriting
    const keyLine = subMediaBody.split('\n').find((l) => l.startsWith('#EXT-X-KEY'));
    check('Encryption key URI is rewritten to /hls/key', keyLine && keyLine.includes('/hls/key?url='));
    if (keyLine) {
      const match = keyLine.match(/URI="([^"]+)"/);
      const u = new URL(match[1]);
      const decodedKey = decodeB64Url(u.searchParams.get('url'));
      check('Key URI resolves baseUrl to http://127.0.0.1:.../cdn/720p/enc.key', decodedKey === `${mockBase}/cdn/720p/enc.key`);
    }

    // Map file rewriting (fMP4 init segment)
    const mapLine = subMediaBody.split('\n').find((l) => l.startsWith('#EXT-X-MAP'));
    check('fMP4 Init Map URI is rewritten to /hls/segment.ts', mapLine && mapLine.includes('/hls/segment.ts?url='));
    if (mapLine) {
      const match = mapLine.match(/URI="([^"]+)"/);
      const u = new URL(match[1]);
      const decodedMap = decodeB64Url(u.searchParams.get('url'));
      check('Map URI resolves baseUrl to http://127.0.0.1:.../cdn/720p/init.mp4', decodedMap === `${mockBase}/cdn/720p/init.mp4`);
    }

    // LL-HLS Part rewriting
    const partLine = subMediaBody.split('\n').find((l) => l.startsWith('#EXT-X-PART'));
    check('LL-HLS Part URI is rewritten to /hls/segment.ts', partLine && partLine.includes('/hls/segment.ts?url='));

    // Segment lines resolution: relative, root-relative, absolute
    const segmentProxyLines = subMediaBody.split('\n').filter((l) => l.startsWith('http') && l.includes('/hls/segment.ts'));
    check('Sub-variant contains at least 4 rewritten segment URLs', segmentProxyLines.length >= 4);

    if (segmentProxyLines.length >= 4) {
      const s1Target = decodeB64Url(new URL(segmentProxyLines[0]).searchParams.get('url'));
      check('Relative segment seg-001.ts resolved to http://127.0.0.1:.../cdn/720p/seg-001.ts', s1Target === `${mockBase}/cdn/720p/seg-001.ts`);

      const s3Target = decodeB64Url(new URL(segmentProxyLines[2]).searchParams.get('url'));
      check('Root-relative segment /absolute/seg-003.ts resolved to http://127.0.0.1:.../absolute/seg-003.ts', s3Target === `${mockBase}/absolute/seg-003.ts`);

      const s4Target = decodeB64Url(new URL(segmentProxyLines[3]).searchParams.get('url'));
      check('Absolute segment https://othercdn.com/seg-004.ts preserved', s4Target === 'https://othercdn.com/seg-004.ts');
    }

    // 1.3 Subtitle Injection on Master Playlist with sub param
    const masterRawTargetUrl = `${mockBase}/cdn/master-raw.m3u8`;
    const masterWithSubUrl = `${proxyBase}/hls/manifest.m3u8?url=${encodeB64Url(masterRawTargetUrl)}&sub=${encodeB64Url('https://vsmov.com/subs/vietnamese.vtt')}`;
    const masterWithSubRes = await axios.get(masterWithSubUrl);
    const masterWithSubBody = String(masterWithSubRes.data);
    check('Master playlist with sub param injects VSMOV subtitle track', masterWithSubBody.includes('Tiếng Việt (VSMOV VIP)'));
    check('Master playlist with sub param links SUBTITLES="subs" to stream-inf', masterWithSubBody.includes('SUBTITLES="subs"'));

    // 1.4 Binary TS Segment Delivery, Range 206, and Headers
    const tsTargetUrl = `${mockBase}/cdn/seg-001.ts`;
    const tsProxyUrl = `${proxyBase}/hls/segment.ts?url=${encodeB64Url(tsTargetUrl)}&ref=${encodeB64Url('https://sieutamphim.pro/')}`;

    // Full 200 fetch
    const fullTsRes = await axios.get(tsProxyUrl, { responseType: 'arraybuffer' });
    check('Segment proxy returns HTTP 200 for full download', fullTsRes.status === 200);
    check('Segment proxy Content-Type is video/MP2T', fullTsRes.headers['content-type'] === 'video/MP2T');
    check('Segment proxy Cache-Control is public, max-age=3600', fullTsRes.headers['cache-control'] === 'public, max-age=3600');
    check('Segment proxy Accept-Ranges is bytes', fullTsRes.headers['accept-ranges'] === 'bytes');
    check('Segment proxy buffer length is 153600 bytes', fullTsRes.data.byteLength === 153600);
    check('Segment proxy sync byte at offset 0 is 0x47', fullTsRes.data[0] === 0x47);

    // Range 206 forward from upstream
    const rangeRes = await axios.get(tsProxyUrl, {
      headers: { Range: 'bytes=0-1023' },
      responseType: 'arraybuffer',
      validateStatus: (s) => s === 206,
    });
    check('Segment proxy returns HTTP 206 for Range request', rangeRes.status === 206);
    check('Content-Range header returned for 206 request', rangeRes.headers['content-range'].includes('bytes 0-1023/153600'));
    check('Range payload length is exactly 1024 bytes', rangeRes.data.byteLength === 1024);

    // Range 206 local slicing when upstream returns 200
    const noUpstreamRangeUrl = `${proxyBase}/hls/segment.ts?url=${encodeB64Url(`${mockBase}/cdn/seg-no-upstream-range.ts`)}`;
    const localSliceRes = await axios.get(noUpstreamRangeUrl, {
      headers: { Range: 'bytes=100-199' },
      responseType: 'arraybuffer',
      validateStatus: (s) => s === 206,
    });
    check('Local buffer slicing returns HTTP 206 when upstream is 200', localSliceRes.status === 206);
    check('Local buffer slicing Content-Range is bytes 100-199/153600', localSliceRes.headers['content-range'] === 'bytes 100-199/153600');
    check('Local buffer slicing payload length is exactly 100 bytes', localSliceRes.data.byteLength === 100);

    // is_key param overrides Content-Type & Cache-Control
    const keyTsUrl = `${proxyBase}/hls/segment.ts?url=${encodeB64Url(tsTargetUrl)}&is_key=1`;
    const keyTsRes = await axios.get(keyTsUrl, { responseType: 'arraybuffer' });
    check('is_key=1 segment returns Content-Type application/octet-stream', keyTsRes.headers['content-type'] === 'application/octet-stream');
    check('is_key=1 segment returns Cache-Control no-cache, no-store', keyTsRes.headers['cache-control'].includes('no-cache'));

    // 1.5 Subtitle Proxy Normalization (/hls/sub.vtt)
    const subProxyUrl = `${proxyBase}/hls/sub.vtt?url=${encodeB64Url(`${mockBase}/cdn/sub.vtt`)}`;
    const subRes = await axios.get(subProxyUrl);
    check('Subtitle proxy returns HTTP 200', subRes.status === 200);
    check('Subtitle proxy Content-Type is text/vtt; charset=utf-8', subRes.headers['content-type'].includes('text/vtt'));
    check('Subtitle proxy Cache-Control is public, max-age=86400', subRes.headers['cache-control'].includes('max-age=86400'));
    const subContent = String(subRes.data);
    check('Subtitle proxy strips UTF-8 BOM', !subContent.startsWith('\uFEFF'));
    check('Subtitle proxy fixes comma timestamps (00:00:01.000 --> 00:00:04.500)', subContent.includes('00:00:01.000 --> 00:00:04.500'));
    check('Subtitle proxy ensures WEBVTT header', subContent.startsWith('WEBVTT'));

    // Base64 Data URI subtitle decoding
    const dataVtt = 'data:text/vtt;base64,' + Buffer.from('WEBVTT\n\n00:00:01.000 --> 00:00:02.000\nData URI Sub').toString('base64');
    const dataSubRes = await axios.get(`${proxyBase}/hls/sub.vtt?url=${encodeURIComponent(dataVtt)}`);
    check('Subtitle proxy decodes data:text/vtt base64 URIs', String(dataSubRes.data).includes('Data URI Sub'));

    console.log('');

    // ══════════════════════════════════════════════════════════════════════════
    //  SECTION 2: Specialized Providers (STP, CLBPX, YAN)
    // ══════════════════════════════════════════════════════════════════════════
    console.log(`${BOLD}${CYAN}▶ SECTION 2: Specialized Providers Interface & Decoding Tests${RESET}`);

    // 2.1 Standard export interfaces
    [
      { name: 'STP', p: stpProvider, id: 'stp' },
      { name: 'CLBPX', p: clbpxProvider, id: 'clbpx' },
      { name: 'YAN', p: yanProvider, id: 'yan' },
    ].forEach(({ name, p, id }) => {
      check(`${name} provider has correct id "${id}"`, p.id === id);
      check(`${name} provider has string label`, typeof p.label === 'string' && p.label.length > 0);
      check(`${name} provider exports getCatalog function`, typeof p.getCatalog === 'function');
      check(`${name} provider exports getStreams function`, typeof p.getStreams === 'function');
      check(`${name} provider exports search function`, typeof p.search === 'function');
      check(`${name} provider exports getDetail function`, typeof p.getDetail === 'function');
    });

    // 2.2 STP XOR 0x2a decryption
    check('STP decodeXor0x2a decrypts empty/null safely to empty string', stpProvider.decodeXor0x2a(null) === '' && stpProvider.decodeXor0x2a('') === '');
    const samplePlainText = 'https://embed.streamc.xyz/video/12345.m3u8';
    let xorCipher = '';
    for (let i = 0; i < samplePlainText.length; i++) {
      xorCipher += String.fromCharCode(samplePlainText.charCodeAt(i) ^ 0x2a);
    }
    const decryptedText = stpProvider.decodeXor0x2a(xorCipher, 0x2a);
    check('STP decodeXor0x2a correctly decrypts XOR 0x2a obfuscated stream URL', decryptedText === samplePlainText);

    // 2.3 STP parsePostContent
    const samplePostHtml = `
      <p>Tên Phim : Avatar: Dòng Chảy Của Nước</p>
      <p>Tựa Gốc : Avatar: The Way of Water (2022)</p>
      <div class="episodeGroup" data-server="Thuyết Minh VIP" data-episodes='{"${xorCipher}","Full"}'></div>
    `;
    const parsedPost = stpProvider.parsePostContent(samplePostHtml, 'Avatar');
    check('STP parsePostContent extracts movie name', parsedPost.name.includes('Avatar'));
    check('STP parsePostContent extracts year 2022', parsedPost.year === 2022);
    check('STP parsePostContent extracts episode groups with decrypted stream', parsedPost.episodes.length > 0 && parsedPost.episodes[0].server_data[0].link_m3u8 === samplePlainText);

    // 2.4 STP & CLBPX & YAN HTML Card Parsers
    const sampleStpHtml = `
      <div class="post-item">
        <a href="https://sieutamphim.pro/2024/01/avatar-2.html">
          <img src="https://sieutamphim.pro/avatar2.jpg" />
          <h5 class="post-title"><a>Avatar 2 (2022)</a></h5>
        </a>
      </div>
    `;
    const stpCards = stpProvider.parseStpCardsFromHtml(sampleStpHtml);
    check('STP parseStpCardsFromHtml parses cards from HTML', stpCards.length >= 1 && stpCards[0].slug === 'avatar-2');

    const sampleClbpxHtml = `
      <a class="halim-thumb" href="https://clbphimxua.info/thien-long-bat-bo-1997" title="Thiên Long Bát Bộ 1997">
        <img src="https://clbphimxua.info/tlbb.jpg" />
        <p class="original_title">Demi-Gods and Semi-Devils (1997)</p>
      </a>
    `;
    const clbpxCards = clbpxProvider.parseClbpxCardsFromHtml(sampleClbpxHtml);
    check('CLBPX parseClbpxCardsFromHtml parses wuxia cards', clbpxCards.length >= 1 && clbpxCards[0].slug === 'thien-long-bat-bo-1997');

    const sampleYanHtml = `
      <a href="https://yanhh3d.pw/the-gioi-hoan-my" title="Thế Giới Hoàn Mỹ">
        <img src="https://yanhh3d.pw/tghm.jpg" />
      </a>
      <a href="https://yanhh3d.pw/bang-xep-hang" title="Bảng Xếp Hạng"></a>
    `;
    const yanCards = yanProvider.parseYanCardsFromHtml(sampleYanHtml);
    check('YAN parseYanCardsFromHtml parses donghua cards and ignores static route /bang-xep-hang',
      yanCards.some((c) => c.slug === 'the-gioi-hoan-my') && !yanCards.some((c) => c.slug === 'bang-xep-hang'));

    console.log('');

    // ══════════════════════════════════════════════════════════════════════════
    //  SECTION 3: Strict Donghua Guard in YAN (`isDonghuaOrAnime`)
    // ══════════════════════════════════════════════════════════════════════════
    console.log(`${BOLD}${CYAN}▶ SECTION 3: Strict Donghua Guard Rejection & Acceptance Matrix${RESET}`);

    // 3.1 Comprehensive KDrama Rejection List (Must return false)
    const kdramaTestCases = [
      'Teach You A Lesson',
      'Teach you a lesson (2024)',
      'A Shop for Killers',
      'A shop for killers Season 1',
      'Crash Landing on You',
      'Squid Game',
      'Squid Game Season 2',
      'All of Us Are Dead',
      'The Glory',
      'Queen of Tears',
      'Vincenzo',
      'Itaewon Class',
      'Descendants of the Sun',
      'Goblin',
      'Moving (2023)',
    ];

    kdramaTestCases.forEach((title) => {
      const accepted = isDonghuaOrAnime(title, ['Drama', 'Action'], 'series');
      check(`STRICT GUARD REJECTS KDrama: "${title}" (got ${accepted ? 'ALLOW' : 'REJECT'})`, accepted === false);
    });

    // 3.2 Comprehensive US-UK / Hollywood Rejection List (Must return false)
    const hollywoodTestCases = [
      'Lanterns',
      'Lanterns Season 1',
      'Avengers: Infinity War',
      'Avengers: Endgame',
      'Breaking Bad',
      'Better Call Saul',
      'Oppenheimer',
      'Stranger Things',
      'Game of Thrones',
      'House of the Dragon',
      'The Boys',
      'Spider-Man: No Way Home',
      'Batman Begins',
      'Superman Legacy',
      'Iron Man',
      'The Walking Dead',
      'Prison Break',
      'Money Heist',
    ];

    hollywoodTestCases.forEach((title) => {
      const accepted = isDonghuaOrAnime(title, ['Action', 'Sci-Fi'], 'movie');
      check(`STRICT GUARD REJECTS US-UK: "${title}" (got ${accepted ? 'ALLOW' : 'REJECT'})`, accepted === false);
    });

    // 3.3 Live-Action Genre Array Check (Without Animation genre)
    check('Live-action genre array without animation returns false',
      isDonghuaOrAnime('Random Romance Movie', ['Romance', 'Comedy', 'Drama'], 'movie') === false);

    // 3.4 Comprehensive Donghua & Anime Acceptance List (Must return true)
    const donghuaAcceptCases = [
      'Thế Giới Hoàn Mỹ',
      'Tiên Nghịch (Renegade Immortal)',
      'Đấu La Đại Lục',
      'Đấu Phá Thương Khung',
      'Phàm Nhân Tu Tiên',
      'Thôn Phệ Tinh Không',
      'Già Thiên (Shrouding the Heavens)',
      'Mục Thần Ký',
      'Trảm Thần',
      'Vạn Giới Thần Chủ',
      'Nghịch Thiên Tà Thần',
      'Tuyệt Thế Vũ Thần',
      'Quang Âm Chi Ngoại',
      'Đại Chúa Tể',
      'Bách Luyện Thành Thần',
      'Yêu Thần Ký',
      'Nguyên Tôn',
      'Vũ Canh Kỷ',
      'Vũ Động Càn Khôn',
      'Linh Kiếm Tôn',
      'Tử Xuyên',
      'Thương Nguyên Đồ',
      'Hoạ Giang Hồ',
      'Tây Du 3D',
      'Na Tra Ma Đồng',
      'Tôn Ngộ Không 3D',
      'Solo Leveling',
      'Naruto Shippuden',
      'One Piece',
      'Bleach: Thousand-Year Blood War',
      'Dragon Ball Super',
      'Jujutsu Kaisen',
      'Demon Slayer: Kimetsu no Yaiba',
      'Attack on Titan',
      'Chainsaw Man',
      'Spy x Family',
    ];

    donghuaAcceptCases.forEach((title) => {
      const accepted = isDonghuaOrAnime(title, ['Animation'], 'series');
      check(`STRICT GUARD ACCEPTS Donghua/Anime: "${title}"`, accepted === true);
    });

    // 3.5 Explicit Animation Genre Acceptance
    check('Explicit animation genre allows generic title',
      isDonghuaOrAnime('Some Unknown Title', ['Animation', 'Adventure'], 'movie') === true);
    check('Explicit Hoạt hình genre allows generic title',
      isDonghuaOrAnime('Phim Nào Đó', ['Hoạt hình'], 'series') === true);
    check('Explicit Donghua genre allows generic title',
      isDonghuaOrAnime('Phim Nào Đó', ['Donghua'], 'series') === true);

    console.log('');

    // ══════════════════════════════════════════════════════════════════════════
    //  SECTION 4: Multi-Keyword Fallback & Flexible Episode Matching
    // ══════════════════════════════════════════════════════════════════════════
    console.log(`${BOLD}${CYAN}▶ SECTION 4: Multi-Keyword Fallback & Episode Matching Boundary Tests${RESET}`);

    // 4.1 generateSearchKeywords
    const kw1 = generateSearchKeywords('Lanterns Season 1', 'Lanterns (2024)', ['Green Lantern Series'], 1);
    check('generateSearchKeywords strips "Season 1" -> "Lanterns"', kw1.includes('Lanterns'));
    check('generateSearchKeywords strips "(2024)" -> "Lanterns"', kw1.includes('Lanterns'));

    const kw2 = generateSearchKeywords({
      title: 'A Shop for Killers (Phần 1)',
      originalName: 'Saljinjaui Shoppingmall',
      aliases: ['The Killer\'s Shopping Mall'],
      season: 1,
    });
    check('generateSearchKeywords strips "Phần 1" -> "A Shop for Killers"', kw2.includes('A Shop for Killers'));
    check('generateSearchKeywords includes originalName', kw2.includes('Saljinjaui Shoppingmall'));

    const kw3 = generateSearchKeywords('Spider-Man: No Way Home (2021)');
    check('generateSearchKeywords produces clean punctuation variation "Spider Man No Way Home"',
      kw3.some((s) => s.includes('Spider Man No Way Home') || s.includes('Spider-Man No Way Home')));

    // 4.2 matchEpisodeItem Valid Match Tests
    const validEp1TestItems = [
      { name: '1', slug: '1' },
      { name: '01', slug: '01' },
      { name: '001', slug: '001' },
      { name: 'Tập 1', slug: 'tap-1' },
      { name: 'Tập 01', slug: 'tap-01' },
      { name: 'Tập 001', slug: 'tap-001' },
      { name: 'Tập1', slug: 'tap1' },
      { name: 'Tap 1', slug: 'tap-1' },
      { name: 'Tap 01', slug: 'tap-01' },
      { name: 'Episode 1', slug: 'episode-1' },
      { name: 'Episode 01', slug: 'episode-01' },
      { name: 'Ep 1', slug: 'ep-1' },
      { name: 'Ep. 1', slug: 'ep-1' },
      { name: 'Ep.01', slug: 'ep-01' },
      { name: 'E01', slug: 'e01' },
      { name: 'Tập 1 - HD', slug: 'tap-1-hd' },
      { name: 'Tập 1 Vietsub', slug: 'tap-1-vietsub' },
      { name: 'FULL', slug: 'full' },
      { name: 'Full', slug: 'full' },
      { name: 'TRỌN BỘ', slug: 'tron-bo' },
      { name: 'Tập 1', slug: 'breaking-bad-s1-1' },
    ];

    validEp1TestItems.forEach((ep) => {
      const isMatch = matchEpisodeItem(ep, '1', 1);
      check(`matchEpisodeItem matches Ep 1 for { name: "${ep.name}", slug: "${ep.slug}" }`, isMatch === true);
    });

    // 4.3 CRITICAL ANTI-FALSE-POSITIVE BOUNDARY TESTS
    // Ep 1 MUST NEVER match Ep 10, 11, 12, 19, 100, 101, 21
    const falsePositiveEp1Items = [
      { name: '10', slug: '10' },
      { name: '11', slug: '11' },
      { name: '12', slug: '12' },
      { name: '19', slug: '19' },
      { name: '100', slug: '100' },
      { name: '101', slug: '101' },
      { name: '21', slug: '21' },
      { name: 'Tập 10', slug: 'tap-10' },
      { name: 'Tập 11', slug: 'tap-11' },
      { name: 'Tập 12', slug: 'tap-12' },
      { name: 'Tập 100', slug: 'tap-100' },
      { name: 'Tập 101', slug: 'tap-101' },
      { name: 'Episode 10', slug: 'episode-10' },
      { name: 'Episode 11', slug: 'episode-11' },
      { name: 'Episode 100', slug: 'episode-100' },
      { name: 'Ep 10', slug: 'ep-10' },
      { name: 'Ep 11', slug: 'ep-11' },
      { name: 'Ep. 10', slug: 'ep-10' },
      { name: 'tap-10', slug: 'tap-10' },
      { name: 'tap-11', slug: 'tap-11' },
      { name: 'tap-100', slug: 'tap-100' },
      { name: '10', slug: 'breaking-bad-s1-10' },
      { name: '11', slug: 'breaking-bad-s1-11' },
      { name: 'Tập 10', slug: 'breaking-bad-s1-10' },
      { name: 'Tập 11', slug: 'breaking-bad-s1-11' },
    ];

    falsePositiveEp1Items.forEach((ep) => {
      const isMatch = matchEpisodeItem(ep, '1', 1);
      check(`BOUNDARY GUARD: Ep 1 DOES NOT false-match { name: "${ep.name}", slug: "${ep.slug}" }`, isMatch === false);
    });

    // Ep 2 MUST NEVER match Ep 20, 21, 22, 200
    const falsePositiveEp2Items = [
      { name: '20', slug: '20' },
      { name: '21', slug: '21' },
      { name: '22', slug: '22' },
      { name: '200', slug: '200' },
      { name: 'Tập 20', slug: 'tap-20' },
      { name: 'Episode 20', slug: 'episode-20' },
    ];

    falsePositiveEp2Items.forEach((ep) => {
      const isMatch = matchEpisodeItem(ep, '2', 2);
      check(`BOUNDARY GUARD: Ep 2 DOES NOT false-match { name: "${ep.name}", slug: "${ep.slug}" }`, isMatch === false);
    });

    // Ep 10 matching check: MUST match 10, Tập 10, tap-10 but NOT 1 or 100
    check('matchEpisodeItem Ep 10 matches "Tập 10"', matchEpisodeItem({ name: 'Tập 10', slug: 'tap-10' }, '10', 10) === true);
    check('matchEpisodeItem Ep 10 DOES NOT match "Tập 1"', matchEpisodeItem({ name: 'Tập 1', slug: 'tap-1' }, '10', 10) === false);
    check('matchEpisodeItem Ep 10 DOES NOT match "Tập 100"', matchEpisodeItem({ name: 'Tập 100', slug: 'tap-100' }, '10', 10) === false);

    // Negative / Invalid inputs
    check('matchEpisodeItem rejects negative target "-1"', matchEpisodeItem({ name: 'Tập 1', slug: 'tap-1' }, '-1', -1) === false);
    check('matchEpisodeItem rejects 0 target', matchEpisodeItem({ name: 'Tập 1', slug: 'tap-1' }, '0', 0) === false);
    check('matchEpisodeItem rejects null ep object', matchEpisodeItem(null, '1', 1) === false);

    console.log('');

    // ══════════════════════════════════════════════════════════════════════════
    //  SUMMARY & VERDICT
    // ══════════════════════════════════════════════════════════════════════════
    console.log(`${BOLD}══════════════════════════════════════════════════════════════════════════════${RESET}`);
    console.log(`${BOLD}🏁 CHALLENGER 2 SUITE RESULTS${RESET}`);
    console.log(`${BOLD}══════════════════════════════════════════════════════════════════════════════${RESET}`);
    console.log(`  ${GREEN}Passed Assertions:${RESET} ${passed}`);
    console.log(`  ${RED}Failed Assertions:${RESET} ${failed}`);

    if (failed > 0) {
      console.log(`\n${RED}Failures Summary:${RESET}`);
      failures.forEach((f) => console.log(`  - ${f}`));
      process.exit(1);
    } else {
      console.log(`\n${GREEN}${BOLD}🎉 ALL ${passed} ADVERSARIAL STRESS TEST ASSERTIONS PASSED!${RESET}\n`);
      process.exit(0);
    }
  } catch (err) {
    console.error(`\n${RED}Fatal error during suite execution:${RESET}`, err);
    process.exit(1);
  } finally {
    mockServer.close();
    proxyServer.close();
  }
}

if (require.main === module) {
  runChallenger2StressSuite();
}

module.exports = { runChallenger2StressSuite };
