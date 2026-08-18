'use strict';

/**
 * ============================================================
 *  Adversarial Comprehensive Reviewer 2 Verification Suite
 *  Stremio VIP Movies Addon Engine v1.5.0
 * ============================================================
 */

const assert = require('assert');
const http = require('http');
const axios = require('axios');
const app = require('../src/index');
const { MANIFEST, ALL_CATALOGS } = require('../src/manifest');
const { decodeConfig, encodeConfig, isConfigToken, DEFAULT_CONFIG } = require('../src/config');
const { scoreMatch, normalizeText, escapeRegExp, safeExtra, safeSlug, safeKeyword, safePage, extractSeasonNumber, isSeasonMatch } = require('../src/lib/utils');

let server;
let baseUrl;

async function startServer() {
  return new Promise((resolve) => {
    server = app.listen(0, '127.0.0.1', () => {
      const port = server.address().port;
      baseUrl = `http://127.0.0.1:${port}`;
      resolve();
    });
  });
}

async function stopServer() {
  return new Promise((resolve) => {
    if (server) server.close(resolve);
    else resolve();
  });
}

let passed = 0;
let failed = 0;

function report(name, condition, msg = '') {
  if (condition) {
    console.log(`  ✅ PASS: ${name}`);
    passed++;
  } else {
    console.error(`  ❌ FAIL: ${name} — ${msg}`);
    failed++;
  }
}

function decodeB64Url(str) {
  try {
    return Buffer.from(str, 'base64url').toString('utf8');
  } catch {
    return '';
  }
}

async function run() {
  console.log('╔══════════════════════════════════════════════════════════════╗');
  console.log('║   ADVERSARIAL REVIEWER 2 DEEP VERIFICATION SUITE (v1.5.0)     ║');
  console.log('╚══════════════════════════════════════════════════════════════╝\n');

  await startServer();

  try {
    // ══════════════════════════════════════════════════════════════
    //  SECTION 1: HLS PROXY & REWRITING ADVERSARIAL TESTS
    // ══════════════════════════════════════════════════════════════
    console.log('══ SECTION 1: HLS Proxy & Manifest/Segment Rewriting ══');

    const sampleMasterM3u8 = `#EXTM3U
#EXT-X-VERSION:3
#EXT-X-INDEPENDENT-SEGMENTS
#EXT-X-MEDIA:TYPE=AUDIO,GROUP-ID="audio",NAME="Vietnamese",DEFAULT=YES,AUTOSELECT=YES,LANGUAGE="vi",URI="audio/vi.m3u8"
#EXT-X-KEY:METHOD=AES-128,URI="https://cdn.example.com/keys/key.bin",IV=0x12345678901234567890123456789012
#EXT-X-MAP:URI="init.mp4"
#EXT-X-STREAM-INF:BANDWIDTH=5000000,RESOLUTION=1920x1080,CODECS="avc1.640028,mp4a.40.2",AUDIO="audio"
1080p/index.m3u8
#EXT-X-STREAM-INF:BANDWIDTH=2500000,RESOLUTION=1280x720,URI="720p/index.m3u8"
#EXT-X-PRELOAD-HINT:TYPE=PART,URI="part-0.mp4"
`;

    // Create a mock upstream server for testing M3U8 rewriting
    const mockUpstream = http.createServer((req, res) => {
      if (req.url === '/master.m3u8') {
        res.writeHead(200, { 'Content-Type': 'application/vnd.apple.mpegurl' });
        res.end(sampleMasterM3u8);
      } else if (req.url.startsWith('/audio/vi.m3u8')) {
        res.writeHead(200, { 'Content-Type': 'application/vnd.apple.mpegurl' });
        res.end('#EXTM3U\n#EXTINF:10.0,\nseg-audio-1.ts\n#EXT-X-ENDLIST\n');
      } else if (req.url.startsWith('/seg-1.ts') || req.url.startsWith('/video.ts')) {
        const range = req.headers.range;
        const totalSize = 100000;
        const fakeBuffer = Buffer.alloc(totalSize);
        fakeBuffer.fill(0x47); // Sync byte
        if (range) {
          const parts = range.replace(/bytes=/, '').split('-');
          const start = parseInt(parts[0], 10);
          const end = parts[1] ? parseInt(parts[1], 10) : totalSize - 1;
          const chunk = fakeBuffer.slice(start, end + 1);
          res.writeHead(206, {
            'Content-Range': `bytes ${start}-${end}/${totalSize}`,
            'Accept-Ranges': 'bytes',
            'Content-Length': chunk.length,
            'Content-Type': 'video/mp2t',
          });
          res.end(chunk);
        } else {
          res.writeHead(200, {
            'Content-Length': totalSize,
            'Accept-Ranges': 'bytes',
            'Content-Type': 'video/mp2t',
          });
          res.end(fakeBuffer);
        }
      } else {
        res.writeHead(404);
        res.end('Not Found');
      }
    });

    await new Promise((resolve) => mockUpstream.listen(0, '127.0.0.1', resolve));
    const mockPort = mockUpstream.address().port;
    const mockBase = `http://127.0.0.1:${mockPort}`;

    // Test proxying the mock master playlist
    const encUrl = Buffer.from(`${mockBase}/master.m3u8`).toString('base64url');
    const encRef = Buffer.from('https://player.phimapi.com/').toString('base64url');

    const manifestRes = await axios.get(`${baseUrl}/hls/manifest.m3u8?url=${encUrl}&ref=${encRef}`);
    report('Manifest endpoint returns HTTP 200', manifestRes.status === 200);
    report('Manifest Content-Type is MPEGURL', manifestRes.headers['content-type'].includes('application/vnd.apple.mpegurl'));
    report('CORS Access-Control-Allow-Origin is *', manifestRes.headers['access-control-allow-origin'] === '*');

    const body = manifestRes.data;

    // Verify rewritten lines by extracting URLs and checking decoded targets
    const mediaAudioMatch = body.match(/#EXT-X-MEDIA:[^\n]*URI="([^"]+)"/);
    const audioProxyUrl = mediaAudioMatch ? new URL(mediaAudioMatch[1]) : null;
    const audioTarget = audioProxyUrl ? decodeB64Url(audioProxyUrl.searchParams.get('url')) : '';
    report('Rewrote AUDIO rendition URI to proxy pointing to audio/vi.m3u8', audioTarget.includes('/audio/vi.m3u8'));

    const keyMatch = body.match(/#EXT-X-KEY:[^\n]*URI="([^"]+)"/);
    const keyProxyUrl = keyMatch ? new URL(keyMatch[1]) : null;
    const keyTarget = keyProxyUrl ? decodeB64Url(keyProxyUrl.searchParams.get('url')) : '';
    report('Rewrote KEY URI to /hls/key pointing to key.bin', keyTarget.includes('/keys/key.bin') && keyProxyUrl.pathname.includes('/hls/key'));

    const mapMatch = body.match(/#EXT-X-MAP:URI="([^"]+)"/);
    const mapProxyUrl = mapMatch ? new URL(mapMatch[1]) : null;
    const mapTarget = mapProxyUrl ? decodeB64Url(mapProxyUrl.searchParams.get('url')) : '';
    report('Rewrote fMP4 MAP URI to /hls/segment.ts pointing to init.mp4', mapTarget.includes('/init.mp4') && mapProxyUrl.pathname.includes('/hls/segment.ts'));

    const preloadMatch = body.match(/#EXT-X-PRELOAD-HINT:[^,\n]+,URI="([^"]+)"/);
    const preloadProxyUrl = preloadMatch ? new URL(preloadMatch[1]) : null;
    const preloadTarget = preloadProxyUrl ? decodeB64Url(preloadProxyUrl.searchParams.get('url')) : '';
    report('Rewrote PRELOAD-HINT URI to /hls/segment.ts pointing to part-0.mp4', preloadTarget.includes('/part-0.mp4') && preloadProxyUrl.pathname.includes('/hls/segment.ts'));

    const lines = body.split('\n').map((l) => l.trim());
    const variant1080Line = lines.find((l) => l.startsWith('http') && l.includes('/hls/manifest.m3u8'));
    const variant1080Url = variant1080Line ? new URL(variant1080Line) : null;
    const variant1080Target = variant1080Url ? decodeB64Url(variant1080Url.searchParams.get('url')) : '';
    report('Rewrote variant stream line (1080p/index.m3u8) to /hls/manifest.m3u8', variant1080Target.includes('/1080p/index.m3u8'));

    const streamInf720Match = body.match(/#EXT-X-STREAM-INF:[^\n]*URI="([^"]+)"/);
    const streamInf720Url = streamInf720Match ? new URL(streamInf720Match[1]) : null;
    const streamInf720Target = streamInf720Url ? decodeB64Url(streamInf720Url.searchParams.get('url')) : '';
    report('Rewrote URI= in #EXT-X-STREAM-INF (720p/index.m3u8)', streamInf720Target.includes('/720p/index.m3u8'));

    // 1.2 Test Segment Download & Range 206
    const segUrl = Buffer.from(`${mockBase}/seg-1.ts`).toString('base64url');
    const segRes = await axios.get(`${baseUrl}/hls/segment.ts?url=${segUrl}&ref=${encRef}`, {
      responseType: 'arraybuffer',
    });
    report('Segment full download returns HTTP 200', segRes.status === 200);
    report('Segment length is 100000 bytes', segRes.data.length === 100000);
    report('Segment starts with MPEG-TS sync byte 0x47', segRes.data[0] === 0x47);
    report('Segment Content-Type is video/MP2T', segRes.headers['content-type'].toLowerCase().includes('video/mp2t'));

    // 1.3 Test HTTP Range header forwarding
    const rangeRes = await axios.get(`${baseUrl}/hls/segment.ts?url=${segUrl}&ref=${encRef}`, {
      headers: { Range: 'bytes=0-1023' },
      responseType: 'arraybuffer',
      validateStatus: (s) => s === 206,
    });
    report('Segment range request returns HTTP 206 Partial Content', rangeRes.status === 206);
    report('Range response size is 1024 bytes', rangeRes.data.length === 1024);
    report('Range response has Content-Range header', rangeRes.headers['content-range'] === 'bytes 0-1023/100000');

    // 1.4 Test OPTIONS Preflight on HLS endpoints
    const optionsRes = await axios.options(`${baseUrl}/hls/manifest.m3u8`);
    report('OPTIONS preflight returns HTTP 204 with CORS', optionsRes.status === 204 && optionsRes.headers['access-control-allow-origin'] === '*');

    mockUpstream.close();

    // ══════════════════════════════════════════════════════════════
    //  SECTION 2: FAIL-SAFE STREAM AGGREGATION & ADVERSARIAL INPUTS
    // ══════════════════════════════════════════════════════════════
    console.log('\n══ SECTION 2: Fail-Safe Stream Aggregator & Adversarial Inputs ══');

    const adversarialIds = [
      'tt0000000000',
      'tt9999999999:1:1',
      'tt9999999999:999:999',
      'tt:invalid:format',
      'tt1234567:-1:-1',
      'vsmov_nonexistent_slug_123',
      'kkphim:random_slug_456',
      'nguonc_nonexistent_xyz',
      'stp:nonexistent_slug_789',
      'hh3d:nonexistent_slug_abc',
      'yan:nonexistent_slug_def',
      'clbpx:nonexistent_slug_ghi',
      '../../etc/passwd',
      'null',
      'undefined',
      '<script>alert(1)</script>',
      'DROP TABLE streams;--',
      '%00%00%00',
      'phim-bo-rat-dai-12345-khong-ton-tai',
    ];

    for (const testId of adversarialIds) {
      const res = await axios.get(`${baseUrl}/stream/movie/${encodeURIComponent(testId)}.json`);
      report(`Stream query with ID "${testId.slice(0, 20)}" returns HTTP 200`, res.status === 200);
      report(`Stream response has streams array`, Array.isArray(res.data.streams));
      // Invariant: strictly no externalUrl
      for (const s of res.data.streams) {
        if (s.externalUrl) {
          report(`Stream contains illegal externalUrl`, false, JSON.stringify(s));
        }
      }
    }

    // ══════════════════════════════════════════════════════════════
    //  SECTION 3: 22 K20 CATALOGS & DYNAMIC ROUTING ADVERSARIAL TESTS
    // ══════════════════════════════════════════════════════════════
    console.log('\n══ SECTION 3: 22 Catalogs & Routing Robustness ══');

    report('Total catalog count in manifest definition is 22', ALL_CATALOGS.length === 22);

    // Test all 22 catalogs without and with /:config prefix
    const testConfig = encodeConfig({
      providers: ['vsmov', 'kkphim', 'nguonc', 'stp', 'hh3d', 'yan', 'clbpx'],
      categories: ['movie', 'series', 'anime', 'cinema'],
    });

    for (const cat of ALL_CATALOGS) {
      const urlNormal = `${baseUrl}/catalog/${cat.type}/${cat.id}.json`;
      const urlConfig = `${baseUrl}/${testConfig}/catalog/${cat.type}/${cat.id}.json`;

      const resNormal = await axios.get(urlNormal);
      report(`Catalog GET ${cat.id}.json returns HTTP 200`, resNormal.status === 200 && Array.isArray(resNormal.data.metas));

      const resConfig = await axios.get(urlConfig);
      report(`Catalog GET /:config/${cat.id}.json returns HTTP 200`, resConfig.status === 200 && Array.isArray(resConfig.data.metas));
    }

    // Test malformed catalog / search routes
    const malformedRoutes = [
      `/catalog/movie/kkphim-movie-latest/search=.json`,
      `/catalog/movie/kkphim-movie-latest/search=%20%20%20.json`,
      `/catalog/movie/kkphim-movie-latest/skip=-999.json`,
      `/catalog/movie/kkphim-movie-latest/skip=999999999.json`,
      `/catalog/movie/kkphim-movie-latest/genre=undefined&skip=null.json`,
      `/catalog/movie/kkphim-movie-latest/&&&&===&&&.json`,
      `/catalog/movie/nonexistent-cat-xyz.json`,
      `/catalog/series/search/search=spiderman.json`,
    ];

    for (const r of malformedRoutes) {
      const res = await axios.get(`${baseUrl}${r}`);
      report(`Malformed route ${r.slice(0, 35)}... returns HTTP 200`, res.status === 200 && Array.isArray(res.data.metas));
    }

    // ══════════════════════════════════════════════════════════════
    //  SECTION 4: UTILS & LOGIC INTEGRITY TESTS
    // ══════════════════════════════════════════════════════════════
    console.log('\n══ SECTION 4: Utils & Matching Logic Integrity ══');

    report('scoreMatch handles null/undefined gracefully', scoreMatch(null, null) === 0);
    report('scoreMatch handles exact match', scoreMatch({ name: 'Spider-Man' }, 'Spider-Man') >= 1.0);
    report('scoreMatch handles Vietnamese diacritics', scoreMatch({ name: 'Người Nhện: Không Còn Nhà' }, 'Nguoi Nhen Khong Con Nha') >= 0.7);
    report('scoreMatch penalizes year mismatch', scoreMatch({ name: 'Batman', year: 1989 }, 'Batman', 2022) < scoreMatch({ name: 'Batman', year: 2022 }, 'Batman', 2022));

    report('extractSeasonNumber extracts "Season 2"', extractSeasonNumber('Breaking Bad Season 2') === 2);
    report('extractSeasonNumber extracts "Phần 3"', extractSeasonNumber('Thế Giới Hoàn Mỹ Phần 3') === 3);
    report('extractSeasonNumber extracts "SS4"', extractSeasonNumber('Demon Slayer SS4') === 4);
    report('extractSeasonNumber returns null for no season', extractSeasonNumber('Inception') === null);

    report('isSeasonMatch matches single movies with null season', isSeasonMatch({ type: 'single' }, [], null) === true);
    report('isSeasonMatch rejects mismatched season', isSeasonMatch({ name: 'Show Season 1' }, [], 2) === false);

    // ══════════════════════════════════════════════════════════════
    //  SECTION 5: INTEGRITY & ANTI-CHEATING AUDIT
    // ══════════════════════════════════════════════════════════════
    console.log('\n══ SECTION 5: Code Integrity & Anti-Cheating Audit ══');

    const fs = require('fs');
    const path = require('path');

    const srcFiles = [
      'src/index.js',
      'src/handlers.js',
      'src/routes/hls.js',
      'src/routes/manifest.js',
      'src/manifest.js',
      'src/config.js',
      'src/lib/utils.js',
      'src/lib/cache.js',
      'src/lib/cinemeta.js',
      'src/mapper.js',
      'src/providers/vsmov.js',
      'src/providers/kkphim.js',
      'src/providers/nguonc.js',
      'src/providers/stp.js',
      'src/providers/hh3d.js',
      'src/providers/yan.js',
      'src/providers/clbpx.js',
    ];

    let hasHardcodedMocks = false;
    for (const rel of srcFiles) {
      const full = path.join(__dirname, '..', rel);
      const code = fs.readFileSync(full, 'utf8');
      if (/mockStream|fakeVideo|dummyResponse|if\s*\(\s*imdbId\s*===\s*['"]tt/i.test(code)) {
        console.error(`  ⚠️ Potential hardcoded mock pattern found in ${rel}`);
        hasHardcodedMocks = true;
      }
    }
    report('No hardcoded mock responses or cheating shortcuts in source code', !hasHardcodedMocks);

    // Check version sync in package.json & manifest.js
    const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'package.json'), 'utf8'));
    report('package.json version is 1.5.0', pkg.version === '1.5.0');
    report('manifest.js version is 1.5.0', MANIFEST.version === '1.5.0');

  } catch (err) {
    console.error('Fatal test error:', err);
    failed++;
  } finally {
    await stopServer();
  }

  console.log('\n══════════════════════════════════════════════════════════════');
  console.log(`🏁 ADVERSARIAL SUITE SUMMARY: ${passed} PASSED, ${failed} FAILED`);
  console.log('══════════════════════════════════════════════════════════════');

  if (failed > 0) process.exit(1);
}

run();
