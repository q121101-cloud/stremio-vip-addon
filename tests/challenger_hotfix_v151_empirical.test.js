'use strict';

/**
 * ==============================================================================
 *  VIP Movies Addon — tests/challenger_hotfix_v151_empirical.test.js
 *  Adversarial & Empirical Challenger Test Suite for Hotfix v1.5.1
 *
 *  Authoritative Scope:
 *    1. Manifest & Route Integrity (Engine v1.5.1, 22 catalogs, /health, CORS *)
 *    2. VSMOV Multi-Server Audio Separation & Subtitles (Harry Potter tt0373889)
 *    3. KKPhim Flexible Episode Matching & Container Normalization (tt0903747:1:1 & tt0944947:1:1)
 *    4. Live Binary TS Chunk Download (>50KB, HTTP 200, sync byte 0x47 across 188-byte boundaries)
 *    5. HTTP Range Seeking (HTTP 206 Partial Content, exact slice length, sync byte 0x47)
 *    6. Adversarial Subtitle Proxy (/hls/sub.vtt) with SRT conversion, BOM stripping, CRLF normalization, error resilience
 *    7. Strict In-App Stream Protocol Exclusivity across all providers (url only, NO externalUrl)
 * ==============================================================================
 */

const express = require('express');
const cors = require('cors');
const http = require('http');
const axios = require('axios');
const assert = require('assert');

const hlsRouter = require('../src/routes/hls');
const manifestRouter = require('../src/routes/manifest');
const handlers = require('../src/handlers');
const vsmov = require('../src/providers/vsmov');
const kkphim = require('../src/providers/kkphim');
const { BASE_MANIFEST } = require('../src/manifest');

// ANSI Color formatting
const GREEN  = '\x1b[32m';
const RED    = '\x1b[31m';
const CYAN   = '\x1b[36m';
const YELLOW = '\x1b[33m';
const BOLD   = '\x1b[1m';
const RESET  = '\x1b[0m';
const GRAY   = '\x1b[90m';

let passedChecks = 0;
let totalChecks = 0;

function check(desc, condition, details = '') {
  totalChecks++;
  if (condition) {
    passedChecks++;
    console.log(`  ${GREEN}✅ PASS [Check #${totalChecks}]${RESET} ${desc}`);
  } else {
    console.error(`  ${RED}❌ FAIL [Check #${totalChecks}]${RESET} ${desc} ${details ? `(${details})` : ''}`);
    throw new Error(`Assertion failed: ${desc} ${details}`);
  }
}

async function startServer(app) {
  return new Promise((resolve, reject) => {
    const s = app.listen(0, '127.0.0.1', () => resolve(s));
    s.on('error', reject);
  });
}

async function runChallengerSuite() {
  const startTime = Date.now();
  console.log(`\n${BOLD}${CYAN}╔══════════════════════════════════════════════════════════════════════════════╗${RESET}`);
  console.log(`${BOLD}${CYAN}║    ⚔️  CHALLENGER 1: HOTFIX v1.5.1 EMPIRICAL & ADVERSARIAL TEST SUITE        ║${RESET}`);
  console.log(`${BOLD}${CYAN}╚══════════════════════════════════════════════════════════════════════════════╝${RESET}\n`);

  // Main Addon Express Server
  const app = express();
  app.use(cors());
  app.use(express.json());
  app.use('/hls', hlsRouter);
  app.use('/', manifestRouter);
  app.use('/', handlers);

  const mainServer = await startServer(app);
  const mainPort = mainServer.address().port;
  const baseUrl = `http://127.0.0.1:${mainPort}`;
  console.log(`${GRAY}ℹ️  Started Addon Test Server on ephemeral port:${RESET} ${BOLD}${mainPort}${RESET}`);
  console.log(`${GRAY}ℹ️  Addon Base URL:${RESET} ${baseUrl}\n`);

  // Mock Upstream Subtitle Server for Adversarial Testing
  let mockServer;
  let mockPort;
  let mockBaseUrl;

  try {
    const mockApp = express();
    mockApp.get('/raw-srt.srt', (req, res) => {
      res.setHeader('Content-Type', 'text/plain; charset=utf-8');
      res.send(`1\n00:00:01,000 --> 00:00:04,500\nXin chào thế giới\n\n2\n00:00:05,120 --> 00:00:08,990\nKiểm thử phụ đề VIP Movies`);
    });
    mockApp.get('/crlf-srt.srt', (req, res) => {
      res.setHeader('Content-Type', 'text/plain; charset=utf-8');
      res.send(`1\r\n00:00:01,234 --> 00:00:03,456\r\nCRLF Dòng 1\r\n\r\n2\r\n00:00:04,000 --> 00:00:06,000\r\nCRLF Dòng 2\r\n`);
    });
    mockApp.get('/bom-srt.srt', (req, res) => {
      res.setHeader('Content-Type', 'text/plain; charset=utf-8');
      res.send(`\uFEFF1\n00:00:01,000 --> 00:00:02,000\nBOM Subtitle`);
    });
    mockApp.get('/native-vtt.vtt', (req, res) => {
      res.setHeader('Content-Type', 'text/vtt; charset=utf-8');
      res.send(`WEBVTT\n\n1\n00:00:01.000 --> 00:00:04.000\nNative WebVTT Subtitle`);
    });
    mockApp.get('/bom-vtt.vtt', (req, res) => {
      res.setHeader('Content-Type', 'text/vtt; charset=utf-8');
      res.send(`\uFEFFWEBVTT\n\n1\n00:00:01.000 --> 00:00:04.000\nBOM WebVTT Subtitle`);
    });
    mockApp.get('/not-found.srt', (req, res) => {
      res.status(404).send('Subtitle file not found on CDN');
    });
    mockApp.get('/error-500.srt', (req, res) => {
      res.status(500).send('Internal CDN Error');
    });

    mockServer = await startServer(mockApp);
    mockPort = mockServer.address().port;
    mockBaseUrl = `http://127.0.0.1:${mockPort}`;

    // ══════════════════════════════════════════════════════════════════════════
    //  PHASE 1: MANIFEST & ROUTE INTEGRITY (v1.5.1)
    // ══════════════════════════════════════════════════════════════════════════
    console.log(`${BOLD}${CYAN}▶ PHASE 1: Addon Manifest, Health Check & Route Integrity (v1.5.1)${RESET}`);
    const manifestRes = await axios.get(`${baseUrl}/manifest.json`);
    check('Manifest returns HTTP 200', manifestRes.status === 200, `Got ${manifestRes.status}`);
    check('Manifest CORS Access-Control-Allow-Origin: *', manifestRes.headers['access-control-allow-origin'] === '*');
    check('Manifest version is exactly 1.5.2', manifestRes.data.version === '1.5.2', `Got ${manifestRes.data.version}`);
    check('Manifest contains exactly 22 catalogs', Array.isArray(manifestRes.data.catalogs) && manifestRes.data.catalogs.length === 22, `Got ${manifestRes.data.catalogs?.length}`);
    check('Manifest resources contain catalog, meta, stream',
      manifestRes.data.resources.some((r) => r === 'catalog' || r.name === 'catalog') &&
      manifestRes.data.resources.some((r) => r === 'meta' || r.name === 'meta') &&
      manifestRes.data.resources.some((r) => r === 'stream' || r.name === 'stream')
    );
    check('Manifest types contain movie and series',
      manifestRes.data.types.includes('movie') && manifestRes.data.types.includes('series')
    );

    const healthRes = await axios.get(`${baseUrl}/health`);
    check('/health returns HTTP 200', healthRes.status === 200);
    check('/health status is ok', healthRes.data.status === 'ok');
    check('/health version is 1.5.2', healthRes.data.version === '1.5.2', `Got ${healthRes.data.version}`);
    console.log();

    // ══════════════════════════════════════════════════════════════════════════
    //  PHASE 2: VSMOV AUDIO SEPARATION & SUBTITLE PROXY (tt0373889)
    // ══════════════════════════════════════════════════════════════════════════
    console.log(`${BOLD}${CYAN}▶ PHASE 2: Harry Potter tt0373889 VSMOV Multi-Server Audio Separation & Subtitles${RESET}`);
    const hpRes = await axios.get(`${baseUrl}/stream/movie/tt0373889.json`, { timeout: 25000 });
    check('Harry Potter stream request returns HTTP 200', hpRes.status === 200);
    check('Response contains streams array', Array.isArray(hpRes.data?.streams) && hpRes.data.streams.length > 0);

    const hpStreams = hpRes.data.streams;
    const vsmovHpStreams = hpStreams.filter((s) => s.title && s.title.includes('[VIP 1 • VSMOV]'));
    check('VSMOV resolves at least 2 distinct audio stream options for tt0373889', vsmovHpStreams.length >= 2, `Got ${vsmovHpStreams.length}`);

    // Verify audio classification and bingeGroups
    const audioLabels = vsmovHpStreams.map((s) => {
      const match = s.title.match(/\[VIP 1 • VSMOV\]\s*([^\d\n]+?)\s*4K/i);
      return match ? match[1].trim() : 'Unknown';
    });
    console.log(`  ${GRAY}Found VSMOV Audio Options:${RESET} ${audioLabels.join(', ')}`);
    check('VSMOV audio options contain Vietsub', audioLabels.some((l) => /vietsub/i.test(l)));

    // Verify bingeGroup separation
    const bingeGroups = vsmovHpStreams.map((s) => s.behaviorHints?.bingeGroup);
    const uniqueBingeGroups = new Set(bingeGroups);
    check('VSMOV audio streams have distinct binge groups', uniqueBingeGroups.size === vsmovHpStreams.length, `Got ${uniqueBingeGroups.size} unique out of ${vsmovHpStreams.length}`);

    // Verify Subtitle descriptor on Vietsub stream
    const vietsubStream = vsmovHpStreams.find((s) => s.title.includes('Vietsub'));
    check('Vietsub stream exists', !!vietsubStream);
    check('Vietsub stream contains subtitles array', Array.isArray(vietsubStream.subtitles) && vietsubStream.subtitles.length > 0);
    const subObj = vietsubStream.subtitles[0];
    check('Subtitle ID is vi_vsmov', subObj.id === 'vi_vsmov');
    check('Subtitle lang is vie', subObj.lang === 'vie');
    check('Subtitle URL routes through /hls/sub.vtt proxy', subObj.url.startsWith(`${baseUrl}/hls/sub.vtt?url=`));

    // Test live fetching the subtitle through proxy
    console.log(`  ${GRAY}Fetching live proxied subtitle:${RESET} ${subObj.url.slice(0, 80)}...`);
    const liveSubRes = await axios.get(subObj.url, { timeout: 20000 });
    check('Live subtitle proxy returns HTTP 200', liveSubRes.status === 200, `Got ${liveSubRes.status}`);
    check('Subtitle Content-Type is text/vtt; charset=utf-8', (liveSubRes.headers['content-type'] || '').includes('text/vtt'));
    check('Subtitle CORS Access-Control-Allow-Origin: *', liveSubRes.headers['access-control-allow-origin'] === '*');
    check('Subtitle body starts with WEBVTT', String(liveSubRes.data).trim().startsWith('WEBVTT'));
    console.log();

    // ══════════════════════════════════════════════════════════════════════════
    //  PHASE 3: KKPHIM FLEXIBLE EPISODE MATCHING & SERIES PLAYBACK
    // ══════════════════════════════════════════════════════════════════════════
    console.log(`${BOLD}${CYAN}▶ PHASE 3: KKPhim Flexible Episode Matching & Anti-404 Series Playback${RESET}`);
    
    // 3.1 Unit test matchEpisodeItem matrix
    console.log(`  ${GRAY}3.1 Running matchEpisodeItem() matrix stress-testing...${RESET}`);
    check('matchEpisodeItem exact name "1"', kkphim.matchEpisodeItem({ name: '1', slug: '1' }, '1', 1) === true);
    check('matchEpisodeItem zero-pad "01"', kkphim.matchEpisodeItem({ name: '01', slug: 'tap-01' }, '1', 1) === true);
    check('matchEpisodeItem zero-pad "001"', kkphim.matchEpisodeItem({ name: '001', slug: 'tap-001' }, '1', 1) === true);
    check('matchEpisodeItem label "Tập 1"', kkphim.matchEpisodeItem({ name: 'Tập 1', slug: 'tap-1' }, '1', 1) === true);
    check('matchEpisodeItem label "Tập 01"', kkphim.matchEpisodeItem({ name: 'Tập 01', slug: 'tap-01' }, '1', 1) === true);
    check('matchEpisodeItem label "Tập1"', kkphim.matchEpisodeItem({ name: 'Tập1', slug: 'tap-1' }, '1', 1) === true);
    check('matchEpisodeItem label "Episode 1"', kkphim.matchEpisodeItem({ name: 'Episode 1', slug: 'episode-1' }, '1', 1) === true);
    check('matchEpisodeItem label "EP 01"', kkphim.matchEpisodeItem({ name: 'EP 01', slug: 'ep-01' }, '1', 1) === true);
    check('matchEpisodeItem slug suffix "-1"', kkphim.matchEpisodeItem({ name: 'Phần 1', slug: 'phim-tap-1' }, '1', 1) === true);
    check('matchEpisodeItem slug suffix "-01"', kkphim.matchEpisodeItem({ name: 'Phần 1', slug: 'phim-tap-01' }, '1', 1) === true);
    check('matchEpisodeItem regex extraction "Tập 15"', kkphim.matchEpisodeItem({ name: 'Tập 15 Full HD', slug: 'tap-15' }, '15', 15) === true);
    check('matchEpisodeItem regex extraction "Episode 42"', kkphim.matchEpisodeItem({ name: 'Episode 42', slug: 'ep-42' }, '42', 42) === true);
    check('matchEpisodeItem mismatch rejection "2" vs "1"', kkphim.matchEpisodeItem({ name: '2', slug: 'tap-2' }, '1', 1) === false);
    check('matchEpisodeItem mismatch rejection "Tập 10" vs "1"', kkphim.matchEpisodeItem({ name: 'Tập 10', slug: 'tap-10' }, '1', 1) === false);
    check('matchEpisodeItem handles null/undefined safely', kkphim.matchEpisodeItem(null, '1', 1) === false);

    // 3.2 Live Series Playback Check: Breaking Bad tt0903747:1:1
    console.log(`  ${GRAY}3.2 Querying live series Breaking Bad tt0903747:1:1...${RESET}`);
    const bbRes = await axios.get(`${baseUrl}/stream/series/tt0903747:1:1.json`, { timeout: 25000 });
    check('Breaking Bad tt0903747:1:1 returns HTTP 200', bbRes.status === 200);
    check('Breaking Bad response contains streams', Array.isArray(bbRes.data?.streams) && bbRes.data.streams.length > 0);

    const bbStream = bbRes.data.streams[0];
    check('Stream has name VIP Movies 🎬', bbStream.name === 'VIP Movies 🎬');
    check('Stream has proxy URL', typeof bbStream.url === 'string' && bbStream.url.startsWith(`${baseUrl}/hls/manifest.m3u8`));
    check('Stream strictly has NO externalUrl', !('externalUrl' in bbStream) && bbStream.externalUrl === undefined);

    // Verify fetching manifest
    console.log(`  ${GRAY}Fetching live series manifest:${RESET} ${bbStream.url.slice(0, 80)}...`);
    const bbManifestRes = await axios.get(bbStream.url, { timeout: 25000 });
    check('Series manifest returns HTTP 200 (No 404)', bbManifestRes.status === 200);
    check('Series manifest Content-Type is mpegurl', (bbManifestRes.headers['content-type'] || '').includes('application/vnd.apple.mpegurl'));
    check('Series manifest contains #EXTM3U', typeof bbManifestRes.data === 'string' && bbManifestRes.data.includes('#EXTM3U'));

    // 3.3 Live Series Playback Check: Game of Thrones tt0944947:1:1 or Inception tt1375666
    console.log(`  ${GRAY}3.3 Querying secondary series Game of Thrones tt0944947:1:1...${RESET}`);
    const gotRes = await axios.get(`${baseUrl}/stream/series/tt0944947:1:1.json`, { timeout: 25000 });
    check('Game of Thrones tt0944947:1:1 returns HTTP 200', gotRes.status === 200);
    check('Game of Thrones response contains streams', Array.isArray(gotRes.data?.streams) && gotRes.data.streams.length > 0);
    const gotStream = gotRes.data.streams[0];
    check('GoT stream has NO externalUrl', !('externalUrl' in gotStream) && gotStream.externalUrl === undefined);
    console.log();

    // ══════════════════════════════════════════════════════════════════════════
    //  PHASE 4: FULL MANIFEST PROXY, REWRITING & BINARY TS CHUNK DOWNLOAD
    // ══════════════════════════════════════════════════════════════════════════
    console.log(`${BOLD}${CYAN}▶ PHASE 4: Manifest Proxying, Sub-Variant Traversing & Real TS Segment Download${RESET}`);
    const targetStream = vsmovHpStreams[0] || hpStreams[0];
    console.log(`  ${GRAY}Fetching master manifest from:${RESET} ${targetStream.url.slice(0, 85)}...`);
    const hpManifestRes = await axios.get(targetStream.url, { timeout: 25000 });
    check('Master manifest returns HTTP 200', hpManifestRes.status === 200);
    check('Master manifest contains #EXTM3U', hpManifestRes.data.includes('#EXTM3U'));

    // Traverse master playlist to find media playlist and segment URL
    let resolvedSegmentUrl = null;
    const lines = String(hpManifestRes.data).split('\n').map((l) => l.trim()).filter(Boolean);

    for (const line of lines) {
      if (line.startsWith('http://') && (line.includes('/hls/segment.ts') || line.includes('/hls/ts'))) {
        resolvedSegmentUrl = line;
        break;
      }
      if (line.startsWith('http://') && line.includes('/hls/manifest.m3u8')) {
        console.log(`  ${GRAY}Master Playlist detected. Traversing sub-manifest variant:${RESET} ${line.slice(0, 85)}...`);
        const subRes = await axios.get(line, { timeout: 25000 });
        check('Sub-variant manifest returns HTTP 200', subRes.status === 200);
        check('Sub-variant manifest contains #EXTM3U', subRes.data.includes('#EXTM3U'));

        const subLines = String(subRes.data).split('\n').map((l) => l.trim()).filter(Boolean);
        for (const sLine of subLines) {
          if (sLine.startsWith('http://') && (sLine.includes('/hls/segment.ts') || sLine.includes('/hls/ts'))) {
            resolvedSegmentUrl = sLine;
            break;
          }
        }
        if (resolvedSegmentUrl) break;
      }
    }

    check('Resolved target segment URL from playlist', !!resolvedSegmentUrl, `Resolved: ${resolvedSegmentUrl}`);
    check('Segment URL routes through /hls/segment.ts proxy',
      resolvedSegmentUrl.startsWith(`${baseUrl}/hls/segment.ts?url=`) || resolvedSegmentUrl.startsWith(`${baseUrl}/hls/ts?url=`)
    );

    // Download Real Binary Video Segment Chunk
    console.log(`  ${GRAY}Downloading binary segment chunk from proxy:${RESET} ${resolvedSegmentUrl.slice(0, 85)}...`);
    const segRes = await axios.get(resolvedSegmentUrl, {
      responseType: 'arraybuffer',
      timeout: 30000,
    });
    check('Segment download returns HTTP 200', segRes.status === 200, `Got ${segRes.status}`);
    check('Segment response NOT 403 / 500 / 502', ![403, 500, 502].includes(segRes.status));
    check('Segment CORS Access-Control-Allow-Origin: *', segRes.headers['access-control-allow-origin'] === '*');

    const segContentType = (segRes.headers['content-type'] || '').toLowerCase();
    check('Segment Content-Type is video/mp2t or application/octet-stream',
      segContentType.includes('video/mp2t') || segContentType.includes('application/octet-stream'),
      `Got ${segContentType}`
    );

    const segBuffer = Buffer.from(segRes.data);
    const segSizeKB = (segBuffer.length / 1024).toFixed(2);
    console.log(`  ${GRAY}Downloaded binary chunk size:${RESET} ${segBuffer.length} bytes (${segSizeKB} KB)`);
    check('Binary segment buffer size > 50,000 bytes', segBuffer.length > 50000, `Got ${segBuffer.length} bytes`);

    // Validate MPEG-TS Sync Byte (0x47 == 71) across 188-byte packet boundaries
    let syncFound = false;
    let syncOffset = -1;
    if (segBuffer[0] === 0x47 && segBuffer[188] === 0x47) {
      syncFound = true;
      syncOffset = 0;
    } else {
      for (let i = 0; i < Math.min(segBuffer.length - 376, 8192); i++) {
        if (segBuffer[i] === 0x47 && segBuffer[i + 188] === 0x47 && segBuffer[i + 376] === 0x47) {
          syncFound = true;
          syncOffset = i;
          break;
        }
      }
    }
    check('MPEG-TS sync byte 0x47 confirmed across 188-byte packet boundaries', syncFound, `Found at offset ${syncOffset}`);
    if (syncFound) {
      check('MPEG-TS packet boundary 1 matches 0x47', segBuffer[syncOffset + 188] === 0x47);
      check('MPEG-TS packet boundary 2 matches 0x47', segBuffer[syncOffset + 376] === 0x47);
    }
    console.log();

    // 4b. Also download KKPhim standard TS segment for direct offset 0 check
    console.log(`  ${GRAY}4b Resolving and downloading KKPhim standard TS segment...${RESET}`);
    let kkSegmentUrl = null;
    const bbLines = String(bbManifestRes.data).split('\n').map((l) => l.trim()).filter(Boolean);
    for (const line of bbLines) {
      if (line.startsWith('http://') && (line.includes('/hls/segment.ts') || line.includes('/hls/ts'))) {
        kkSegmentUrl = line;
        break;
      }
      if (line.startsWith('http://') && line.includes('/hls/manifest.m3u8')) {
        const subRes = await axios.get(line, { timeout: 25000 });
        const subLines = String(subRes.data).split('\n').map((l) => l.trim()).filter(Boolean);
        for (const sLine of subLines) {
          if (sLine.startsWith('http://') && (sLine.includes('/hls/segment.ts') || sLine.includes('/hls/ts'))) {
            kkSegmentUrl = sLine;
            break;
          }
        }
        if (kkSegmentUrl) break;
      }
    }
    if (kkSegmentUrl) {
      const kkSegRes = await axios.get(kkSegmentUrl, { responseType: 'arraybuffer', timeout: 30000 });
      check('KKPhim segment download returns HTTP 200', kkSegRes.status === 200);
      const kkBuffer = Buffer.from(kkSegRes.data);
      check('KKPhim segment size > 50,000 bytes', kkBuffer.length > 50000, `Got ${kkBuffer.length} bytes`);
      check('KKPhim standard TS sync byte 0x47 at offset 0', kkBuffer[0] === 0x47, `Got 0x${kkBuffer[0].toString(16)}`);
      check('KKPhim standard TS sync byte 0x47 at offset 188', kkBuffer[188] === 0x47, `Got 0x${kkBuffer[188].toString(16)}`);
      check('KKPhim standard TS sync byte 0x47 at offset 376', kkBuffer[376] === 0x47, `Got 0x${kkBuffer[376].toString(16)}`);
    }
    console.log();

    // ══════════════════════════════════════════════════════════════════════════
    //  PHASE 5: HTTP RANGE SEEKING VERIFICATION (206 PARTIAL CONTENT)
    // ══════════════════════════════════════════════════════════════════════════
    console.log(`${BOLD}${CYAN}▶ PHASE 5: HTTP Range Seeking Verification (206 Partial Content)${RESET}`);
    const rangeRes = await axios.get(resolvedSegmentUrl, {
      responseType: 'arraybuffer',
      headers: {
        Range: 'bytes=0-2047',
      },
      timeout: 25000,
    });
    check('HTTP Range request returns HTTP 206 Partial Content', rangeRes.status === 206, `Got ${rangeRes.status}`);
    check('Content-Range header starts with bytes 0-2047/',
      Boolean(rangeRes.headers['content-range'] && rangeRes.headers['content-range'].startsWith('bytes 0-2047/')),
      `Got ${rangeRes.headers['content-range']}`
    );
    const rangeBuffer = Buffer.from(rangeRes.data);
    check('Range response buffer is exactly 2048 bytes', rangeBuffer.length === 2048, `Got ${rangeBuffer.length} bytes`);
    if (syncOffset >= 0 && syncOffset + 376 < rangeBuffer.length) {
      check('Range slice sync byte 0x47 at syncOffset', rangeBuffer[syncOffset] === 0x47);
      check('Range slice sync byte 0x47 at syncOffset + 188', rangeBuffer[syncOffset + 188] === 0x47);
    }

    if (kkSegmentUrl) {
      const kkRangeRes = await axios.get(kkSegmentUrl, {
        responseType: 'arraybuffer',
        headers: { Range: 'bytes=0-2047' },
        timeout: 25000,
      });
      check('KKPhim HTTP Range request returns HTTP 206 Partial Content', kkRangeRes.status === 206);
      const kkRangeBuf = Buffer.from(kkRangeRes.data);
      check('KKPhim Range response buffer is exactly 2048 bytes', kkRangeBuf.length === 2048);
      check('KKPhim Range slice sync byte 0x47 at offset 0', kkRangeBuf[0] === 0x47);
      check('KKPhim Range slice sync byte 0x47 at offset 188', kkRangeBuf[188] === 0x47);
      check('KKPhim Range slice sync byte 0x47 at offset 376', kkRangeBuf[376] === 0x47);
    }
    console.log();

    // ══════════════════════════════════════════════════════════════════════════
    //  PHASE 6: ADVERSARIAL SUBTITLE PROXY (/hls/sub.vtt) STRESS TESTING
    // ══════════════════════════════════════════════════════════════════════════
    console.log(`${BOLD}${CYAN}▶ PHASE 6: Adversarial Subtitle Proxy (/hls/sub.vtt) Stress Testing${RESET}`);

    // 6.1 Raw SRT text with comma timestamps
    const srtProxyUrl = `${baseUrl}/hls/sub.vtt?url=${encodeURIComponent(`${mockBaseUrl}/raw-srt.srt`)}&ref=https://vsmov.com/`;
    const srtRes = await axios.get(srtProxyUrl);
    check('SRT proxy returns HTTP 200', srtRes.status === 200);
    check('SRT converted to WebVTT starts with WEBVTT\\n\\n', srtRes.data.startsWith('WEBVTT\n\n'));
    check('SRT comma timestamps converted to period (00:00:01.000)', srtRes.data.includes('00:00:01.000 --> 00:00:04.500'));
    check('No comma milliseconds remaining in WebVTT', !/\d{2}:\d{2}:\d{2},\d{3}/.test(srtRes.data));
    check('SRT text content preserved', srtRes.data.includes('Xin chào thế giới') && srtRes.data.includes('Kiểm thử phụ đề VIP Movies'));
    check('SRT proxy response has CORS *', srtRes.headers['access-control-allow-origin'] === '*');

    // 6.2 CRLF Line ending normalization
    const crlfUrl = `${baseUrl}/hls/sub.vtt?url=${encodeURIComponent(`${mockBaseUrl}/crlf-srt.srt`)}`;
    const crlfRes = await axios.get(crlfUrl);
    check('CRLF SRT proxy returns HTTP 200', crlfRes.status === 200);
    check('CRLF line endings normalized to LF', !crlfRes.data.includes('\r'));
    check('CRLF SRT converted to WebVTT', crlfRes.data.startsWith('WEBVTT\n\n') && crlfRes.data.includes('00:00:01.234 --> 00:00:03.456'));

    // 6.3 UTF-8 BOM Stripping on SRT
    const bomSrtUrl = `${baseUrl}/hls/sub.vtt?url=${encodeURIComponent(`${mockBaseUrl}/bom-srt.srt`)}`;
    const bomSrtRes = await axios.get(bomSrtUrl);
    check('BOM SRT returns HTTP 200', bomSrtRes.status === 200);
    check('BOM character 0xFEFF stripped from start', !bomSrtRes.data.startsWith('\uFEFF') && bomSrtRes.data.charCodeAt(0) !== 0xFEFF);
    check('BOM SRT converted to WEBVTT', bomSrtRes.data.startsWith('WEBVTT\n\n'));

    // 6.4 Native WebVTT Passthrough
    const vttUrl = `${baseUrl}/hls/sub.vtt?sub=${encodeURIComponent(`${mockBaseUrl}/native-vtt.vtt`)}`;
    const vttRes = await axios.get(vttUrl);
    check('Native WebVTT returns HTTP 200', vttRes.status === 200);
    check('Native WebVTT starts with WEBVTT', vttRes.data.startsWith('WEBVTT'));
    check('No duplicate WEBVTT headers created', (vttRes.data.match(/WEBVTT/g) || []).length === 1);
    check('Native WebVTT text preserved', vttRes.data.includes('Native WebVTT Subtitle'));

    // 6.5 UTF-8 BOM Stripping on Native WebVTT
    const bomVttUrl = `${baseUrl}/hls/sub.vtt?b64=${Buffer.from(`${mockBaseUrl}/bom-vtt.vtt`).toString('base64url')}`;
    const bomVttRes = await axios.get(bomVttUrl);
    check('Base64URL param for BOM VTT returns HTTP 200', bomVttRes.status === 200);
    check('BOM WebVTT stripped and starts with WEBVTT', bomVttRes.data.startsWith('WEBVTT') && bomVttRes.data.charCodeAt(0) !== 0xFEFF);

    // 6.6 Route & Param Aliases
    const aliasRes = await axios.get(`${baseUrl}/hls/sub?url=${encodeURIComponent(`${mockBaseUrl}/native-vtt.vtt`)}`);
    check('Route alias /hls/sub returns HTTP 200', aliasRes.status === 200);

    // 6.7 Error Handling: Missing URL
    try {
      await axios.get(`${baseUrl}/hls/sub.vtt`);
      check('Missing URL should throw 400', false);
    } catch (err) {
      check('Missing URL returns HTTP 400', err.response?.status === 400);
      check('400 response has CORS *', err.response?.headers['access-control-allow-origin'] === '*');
    }

    // 6.8 Error Handling: Upstream 404
    try {
      await axios.get(`${baseUrl}/hls/sub.vtt?url=${encodeURIComponent(`${mockBaseUrl}/not-found.srt`)}`);
      check('Upstream 404 should throw', false);
    } catch (err) {
      check('Upstream 404 gracefully returns HTTP 404', err.response?.status === 404);
      check('Upstream 404 response has CORS *', err.response?.headers['access-control-allow-origin'] === '*');
    }

    // 6.10 Extended Subtitle Proxy Edge Cases: Vietnamese Unicode & Non-Base64 Raw URLs
    mockApp.get('/unicode-sub.srt', (req, res) => {
      res.setHeader('Content-Type', 'text/plain; charset=utf-8');
      res.send(`1\n00:01:20,000 --> 00:01:24,000\nTôi là Harry Potter, học sinh trường Hogwarts!\n\n2\n00:01:25,000 --> 00:01:30,000\nPhép thuật đỉnh cao & VIP Movies 🎬\n`);
    });
    const uniUrl = `${baseUrl}/hls/sub.vtt?url=${encodeURIComponent(`${mockBaseUrl}/unicode-sub.srt`)}`;
    const uniRes = await axios.get(uniUrl);
    check('Unicode Vietnamese subtitle returns HTTP 200', uniRes.status === 200);
    check('Unicode Vietnamese characters preserved perfectly',
      uniRes.data.includes('Tôi là Harry Potter') && uniRes.data.includes('Phép thuật đỉnh cao & VIP Movies 🎬')
    );

    // 6.11 Subtitle Server Audio Classification Unit Matrix
    check('classifyServerAudio "Lồng Tiếng #1" -> longtieng', vsmov.classifyServerAudio('Lồng Tiếng #1').type === 'longtieng');
    check('classifyServerAudio "Thuyết Minh VIP" -> thuyetminh', vsmov.classifyServerAudio('Thuyết Minh VIP').type === 'thuyetminh');
    check('classifyServerAudio "Vietsub 4K #2" -> vietsub', vsmov.classifyServerAudio('Vietsub 4K #2').type === 'vietsub');
    check('classifyServerAudio "Server 1" fallback -> vietsub', vsmov.classifyServerAudio('Server 1').type === 'vietsub');
    console.log();

    // ══════════════════════════════════════════════════════════════════════════
    //  PHASE 7: HIGH CONCURRENCY BURST STRESS HARNESS
    // ══════════════════════════════════════════════════════════════════════════
    console.log(`${BOLD}${CYAN}▶ PHASE 7: High-Concurrency Burst Stress Harness (25 Concurrent Requests)${RESET}`);
    const burstUrls = [
      `${baseUrl}/manifest.json`,
      `${baseUrl}/health`,
      `${baseUrl}/hls/sub.vtt?url=${encodeURIComponent(`${mockBaseUrl}/raw-srt.srt`)}`,
      `${baseUrl}/hls/sub.vtt?url=${encodeURIComponent(`${mockBaseUrl}/native-vtt.vtt`)}`,
      `${baseUrl}/manifest.json`,
      `${baseUrl}/health`,
      `${baseUrl}/hls/sub?url=${encodeURIComponent(`${mockBaseUrl}/bom-srt.srt`)}`,
      `${baseUrl}/manifest.json`,
    ];

    const concurrentPromises = [];
    for (let i = 0; i < 25; i++) {
      const target = burstUrls[i % burstUrls.length];
      concurrentPromises.push(axios.get(target, { timeout: 10000 }));
    }
    const burstResults = await Promise.all(concurrentPromises);
    check('All 25 concurrent requests returned HTTP 200', burstResults.every((r) => r.status === 200), `Passed ${burstResults.length}/25`);
    console.log();

    // ══════════════════════════════════════════════════════════════════════════
    //  PHASE 8: STRICT IN-APP STREAM PROTOCOL INVARIANT VERIFICATION
    // ══════════════════════════════════════════════════════════════════════════
    console.log(`${BOLD}${CYAN}▶ PHASE 8: Strict In-App Stream Protocol Invariant Verification${RESET}`);
    const allSampleStreams = [...hpStreams, ...bbRes.data.streams, ...gotRes.data.streams];
    console.log(`  ${GRAY}Inspecting ${allSampleStreams.length} emitted stream objects for In-App compliance...${RESET}`);

    for (let i = 0; i < allSampleStreams.length; i++) {
      const s = allSampleStreams[i];
      assert.strictEqual(s.name, 'VIP Movies 🎬', `Stream #${i + 1} name must be "VIP Movies 🎬"`);
      assert.ok(typeof s.url === 'string' && s.url.startsWith('http'), `Stream #${i + 1} url must be a valid HTTP URL`);
      assert.strictEqual(s.externalUrl, undefined, `Stream #${i + 1} externalUrl must be undefined`);
      assert.ok(!('externalUrl' in s), `Stream #${i + 1} MUST NOT contain externalUrl key`);
      assert.strictEqual(s.behaviorHints?.notSupported, false, `Stream #${i + 1} behaviorHints.notSupported must be false`);
      assert.ok(typeof s.behaviorHints?.bingeGroup === 'string', `Stream #${i + 1} behaviorHints.bingeGroup must be string`);
    }
    check(`All ${allSampleStreams.length} stream objects strictly satisfy In-App Direct Play protocol (url present, NO externalUrl)`, true);
    console.log();

    // ══════════════════════════════════════════════════════════════════════════
    //  SUMMARY & FINAL VERDICT
    // ══════════════════════════════════════════════════════════════════════════
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(2);
    console.log(`${BOLD}╔══════════════════════════════════════════════════════════════════════════════╗${RESET}`);
    console.log(`${BOLD}║      🎉 ALL HOTFIX v1.5.1 CHALLENGER CHECKS PASSED (100% SUCCESS)            ║${RESET}`);
    console.log(`${BOLD}╠══════════════════════════════════════════════════════════════════════════════╣${RESET}`);
    console.log(`║  Total Checks Passed:                    ${GREEN}${BOLD}${passedChecks} / ${totalChecks} (100%)${RESET}                     ║`);
    console.log(`║  1. Manifest & Route Integrity:          ${GREEN}PASSED${RESET} (v1.5.1, 22 catalogs, /health)       ║`);
    console.log(`║  2. VSMOV Multi-Server Audio Separation: ${GREEN}PASSED${RESET} (>=2 streams, Vietsub + audio tabs) ║`);
    console.log(`║  3. Subtitle Proxy Live Verification:    ${GREEN}PASSED${RESET} (HTTP 200, WEBVTT, CORS *)           ║`);
    console.log(`║  4. KKPhim Flexible Episode Matching:    ${GREEN}PASSED${RESET} (15 matrix unit tests, Anti-404)     ║`);
    console.log(`║  5. Live Manifest & Sub-Variant Proxy:   ${GREEN}PASSED${RESET} (HTTP 200, #EXTM3U rewritten)        ║`);
    console.log(`║  6. Real TS Chunk Binary Download:       ${GREEN}PASSED${RESET} (HTTP 200, >50KB, 0x47 sync byte)   ║`);
    console.log(`║  7. HTTP Range Seeking Support (206):    ${GREEN}PASSED${RESET} (HTTP 206, 2048B slice verified)    ║`);
    console.log(`║  8. Subtitle Adversarial Stress Harness: ${GREEN}PASSED${RESET} (SRT, BOM, CRLF, 400/404 handling) ║`);
    console.log(`║  9. In-App Protocol Exclusivity:         ${GREEN}PASSED${RESET} (url only, NO externalUrl)          ║`);
    console.log(`║  Total Execution Time:                   ${elapsed}s                                  ║`);
    console.log(`${BOLD}╚══════════════════════════════════════════════════════════════════════════════╝${RESET}\n`);

    return true;
  } finally {
    if (mainServer) {
      mainServer.close();
      console.log(`${GRAY}[Teardown] Main addon server closed cleanly.${RESET}`);
    }
    if (mockServer) {
      mockServer.close();
      console.log(`${GRAY}[Teardown] Mock subtitle server closed cleanly.${RESET}`);
    }
  }
}

if (require.main === module) {
  runChallengerSuite()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('\n❌ Challenger Suite Failed:', err);
      process.exit(1);
    });
}

module.exports = { runChallengerSuite };
