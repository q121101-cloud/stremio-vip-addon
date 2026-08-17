'use strict';

/**
 * ============================================================================
 *  VIP Movies Addon — Milestone 2 Empirical Challenger Test Suite (HLS Proxy)
 *  Target: src/routes/hls.js
 *
 *  Exhaustive Adversarial Test Dimensions:
 *  1. Master Playlist Rewriting (STREAM-INF, I-FRAME-STREAM-INF, MEDIA audio/subtitles)
 *  2. Media Playlist Rewriting (EXTINF, relative/absolute TS segments)
 *  3. DRM / Encryption Key Rewriting (#EXT-X-KEY, #EXT-X-SESSION-KEY, is_key=1)
 *  4. Advanced HLS Tags (#EXT-X-MAP init segments, #EXT-X-PRELOAD-HINT, #EXT-X-PART)
 *  5. Byte-Range Segment Rewriting (#EXT-X-BYTERANGE)
 *  6. Upstream Anti-403 Header Injection (KKPhim CDNs, NguonC, VsMov, StreamC, dynamic ref)
 *  7. CORS & Preflight Enforcement (OPTIONS *, GET /manifest.m3u8, GET /ts)
 *  8. MIME Type Enforcement (application/vnd.apple.mpegurl, video/mp2t, application/octet-stream)
 *  9. Query Parameter Encoding (Base64URL, standard Base64, raw URLs, query strings preservation)
 * 10. Fault Handling & Resiliency (Upstream 403/404/500/timeout, invalid b64, missing params)
 * 11. Cache Hit & Forwarded Headers Validation
 * 12. Nested Sub-Playlists, Multiple Variants & Subtitle Renditions
 * ============================================================================
 */

const assert = require('assert');
const { Readable } = require('stream');
const axios = require('axios');
const { m3u8Cache } = require('../src/lib/cache');

// Track and capture all upstream axios requests
let recordedAxiosCalls = [];
let mockAxiosHandler = null;

// Use axios adapter to cleanly intercept all axios requests
axios.defaults.adapter = async function (config) {
  recordedAxiosCalls.push(config);

  if (mockAxiosHandler) {
    return await mockAxiosHandler(config);
  }

  return {
    status: 200,
    statusText: 'OK',
    headers: {},
    config,
    data: '',
  };
};

// Import hlsRouter
const hlsRouter = require('../src/routes/hls');

let passedTests = 0;
let failedTests = 0;
const failures = [];

function test(name, fn) {
  try {
    fn();
    console.log(`  ✅ PASS: ${name}`);
    passedTests++;
  } catch (err) {
    console.error(`  ❌ FAIL: ${name}`);
    console.error(`     Error: ${err.message}`);
    failures.push({ name, error: err.message, stack: err.stack });
    failedTests++;
  }
}

async function asyncTest(name, fn) {
  try {
    await fn();
    console.log(`  ✅ PASS: ${name}`);
    passedTests++;
  } catch (err) {
    console.error(`  ❌ FAIL: ${name}`);
    console.error(`     Error: ${err.message}`);
    failures.push({ name, error: err.message, stack: err.stack });
    failedTests++;
  }
}

/**
 * In-memory Mock Response Builder for Express Router Dispatching
 */
function createMockRes() {
  const headers = {};
  let statusCode = 200;
  let sentData = null;
  let headersSent = false;
  let streamBuffers = [];

  const res = {
    statusCode: 200,
    get headersSent() { return headersSent; },
    setHeader(k, v) {
      headers[k.toLowerCase()] = v;
    },
    getHeader(k) {
      return headers[k.toLowerCase()];
    },
    getHeaders() {
      return { ...headers };
    },
    status(code) {
      statusCode = code;
      res.statusCode = code;
      return res;
    },
    send(data) {
      headersSent = true;
      sentData = data;
      return res;
    },
    json(data) {
      headersSent = true;
      sentData = data;
      return res;
    },
    redirect(statusOrUrl, maybeUrl) {
      headersSent = true;
      if (typeof statusOrUrl === 'number') {
        statusCode = statusOrUrl;
        sentData = maybeUrl;
      } else {
        statusCode = 302;
        sentData = statusOrUrl;
      }
      headers['location'] = sentData;
      return res;
    },
    end(data) {
      headersSent = true;
      if (data) {
        if (Buffer.isBuffer(data)) streamBuffers.push(data);
        else streamBuffers.push(Buffer.from(data));
      }
      if (streamBuffers.length > 0) {
        sentData = Buffer.concat(streamBuffers);
      }
      return res;
    },
    write(chunk) {
      headersSent = true;
      if (chunk) {
        if (Buffer.isBuffer(chunk)) streamBuffers.push(chunk);
        else streamBuffers.push(Buffer.from(chunk));
      }
      return true;
    },
    on(event, handler) {
      return res;
    },
    once(event, handler) { return res; },
    emit(event, ...args) {},
  };

  return {
    res,
    getResponse: () => {
      if (!sentData && streamBuffers.length > 0) {
        sentData = Buffer.concat(streamBuffers);
      }
      return {
        status: statusCode,
        headers: { ...headers },
        data: sentData,
      };
    },
  };
}

/**
 * Dispatch HTTP requests directly into hlsRouter
 */
function dispatchHls(reqOptions) {
  return new Promise((resolve, reject) => {
    const { res, getResponse } = createMockRes();
    const urlStr = reqOptions.url || '/manifest.m3u8';
    const parsedUrl = new URL(urlStr, 'http://localhost:7000');
    const query = {};
    for (const [k, v] of parsedUrl.searchParams.entries()) {
      query[k] = v;
    }

    const req = {
      method: (reqOptions.method || 'GET').toUpperCase(),
      url: parsedUrl.pathname + parsedUrl.search,
      path: parsedUrl.pathname,
      query,
      headers: {
        host: 'localhost:7000',
        ...(reqOptions.headers || {}),
      },
      protocol: 'http',
      get(name) {
        return this.headers[name.toLowerCase()];
      },
    };

    // Execute through router
    hlsRouter.handle(req, res, (err) => {
      if (err) return reject(err);
      resolve(getResponse());
    });

    setTimeout(() => {
      resolve(getResponse());
    }, 40);
  });
}

async function runEmpiricalHlsChallenger() {
  console.log('╔═════════════════════════════════════════════════════════════════════════════╗');
  console.log('║   ⚔️  VIP MOVIES ADDON — M2 EMPIRICAL CHALLENGER: HLS PROXY ANTI-403         ║');
  console.log('║   Empirical verification of src/routes/hls.js with Mock CDN & Adversarial   ║');
  console.log('╚═════════════════════════════════════════════════════════════════════════════╝\n');

  m3u8Cache.clear();

  // Mock CDN responses
  const MOCK_MASTER_M3U8 = `#EXTM3U
#EXT-X-VERSION:4
#EXT-X-MEDIA:TYPE=AUDIO,GROUP-ID="audio-aac",NAME="Vietnamese",DEFAULT=YES,AUTOSELECT=YES,URI="audio/vi.m3u8"
#EXT-X-MEDIA:TYPE=SUBTITLES,GROUP-ID="subs",NAME="Vietnamese",DEFAULT=YES,URI="subs/vi.m3u8"
#EXT-X-STREAM-INF:BANDWIDTH=1500000,RESOLUTION=1280x720,AUDIO="audio-aac",SUBTITLES="subs"
720p/index.m3u8
#EXT-X-STREAM-INF:BANDWIDTH=3000000,RESOLUTION=1920x1080,AUDIO="audio-aac",SUBTITLES="subs"
https://cdn.mockphimapi.com/hls/1080p/index.m3u8
#EXT-X-I-FRAME-STREAM-INF:BANDWIDTH=200000,URI="iframes/720p.m3u8"`;

  const MOCK_SUB_M3U8 = `#EXTM3U
#EXT-X-VERSION:4
#EXT-X-TARGETDURATION:10
#EXT-X-MEDIA-SEQUENCE:0
#EXT-X-KEY:METHOD=AES-128,URI="enc.key",IV=0x0123456789ABCDEF0123456789ABCDEF
#EXT-X-MAP:URI="init.mp4",BYTERANGE="720@0"
#EXTINF:9.009,
segment_0.ts
#EXT-X-BYTERANGE:500000@0
#EXTINF:9.009,
segment_1.ts
#EXTINF:9.009,
https://cdn.mockphimapi.com/720p/segment_2.ts?token=secure123&exp=9999999
#EXT-X-PART:DURATION=0.33334,URI="part_0.ts"
#EXT-X-PRELOAD-HINT:TYPE=PART,URI="part_1.ts"
#EXT-X-ENDLIST`;

  const DUMMY_TS_BYTES = Buffer.alloc(1024, 0x47);
  const DUMMY_KEY_BYTES = Buffer.alloc(16, 0xAA);

  // Setup default mock axios handler
  mockAxiosHandler = async (config) => {
    const url = config.url || '';

    // Validate URL syntax like actual axios/node-http
    try {
      new URL(url);
    } catch {
      const err = new Error(`Invalid URL: ${url}`);
      err.code = 'ERR_INVALID_URL';
      throw err;
    }

    if (url.includes('/403-forbidden')) {
      const err = new Error('Request failed with status code 403');
      err.response = { status: 403, statusText: 'Forbidden', data: '403 Hotlinking Forbidden' };
      throw err;
    }

    if (url.includes('/500-error')) {
      const err = new Error('Request failed with status code 500');
      err.response = { status: 500, statusText: 'Internal Error', data: '500 Server Error' };
      throw err;
    }

    if (url.includes('/master.m3u8')) {
      return {
        status: 200,
        statusText: 'OK',
        data: MOCK_MASTER_M3U8,
        headers: { 'content-type': 'application/vnd.apple.mpegurl' },
        config,
      };
    }

    if (url.includes('/sub.m3u8') || url.includes('/720p/index.m3u8')) {
      return {
        status: 200,
        statusText: 'OK',
        data: MOCK_SUB_M3U8,
        headers: { 'content-type': 'application/vnd.apple.mpegurl' },
        config,
      };
    }

    if (url.includes('.ts') || url.includes('init.mp4') || url.includes('part_')) {
      if (config.responseType === 'stream') {
        const stream = Readable.from([DUMMY_TS_BYTES]);
        return {
          status: 200,
          statusText: 'OK',
          data: stream,
          headers: { 'content-type': 'image/png', 'content-length': '1024' },
          config,
        };
      }
      return {
        status: 200,
        statusText: 'OK',
        data: DUMMY_TS_BYTES,
        headers: { 'content-type': 'image/png', 'content-length': '1024' },
        config,
      };
    }

    if (url.includes('enc.key')) {
      if (config.responseType === 'stream') {
        const stream = Readable.from([DUMMY_KEY_BYTES]);
        return {
          status: 200,
          statusText: 'OK',
          data: stream,
          headers: { 'content-type': 'application/octet-stream', 'content-length': '16' },
          config,
        };
      }
      return {
        status: 200,
        statusText: 'OK',
        data: DUMMY_KEY_BYTES,
        headers: { 'content-type': 'application/octet-stream' },
        config,
      };
    }

    // Default fallback
    return {
      status: 200,
      statusText: 'OK',
      data: '#EXTM3U\n#EXT-X-TARGETDURATION:10\n#EXTINF:10,\nseg.ts\n#EXT-X-ENDLIST',
      headers: { 'content-type': 'application/vnd.apple.mpegurl' },
      config,
    };
  };

  // ════════════════════════════════════════════════════════════════
  //  SECTION 1: CORS & PREFLIGHT VERIFICATION
  // ════════════════════════════════════════════════════════════════
  console.log('--- Section 1: CORS & Preflight Verification ---');

  await asyncTest('OPTIONS preflight wildcard request returns 204 with CORS headers', async () => {
    const res = await dispatchHls({
      method: 'OPTIONS',
      url: '/manifest.m3u8',
    });
    assert.strictEqual(res.status, 204, 'OPTIONS should return 204 No Content');
    assert.strictEqual(res.headers['access-control-allow-origin'], '*', 'Access-Control-Allow-Origin must be *');
    assert.strictEqual(res.headers['access-control-allow-headers'], '*', 'Access-Control-Allow-Headers must be *');
    assert(res.headers['access-control-allow-methods'].includes('GET'), 'Access-Control-Allow-Methods includes GET');
  });

  // ════════════════════════════════════════════════════════════════
  //  SECTION 2: MASTER PLAYLIST REWRITING
  // ════════════════════════════════════════════════════════════════
  console.log('\n--- Section 2: Master Playlist Rewriting & Tag Parsing ---');

  await asyncTest('Master playlist rewrites stream variants, i-frames, audio, and subtitles to proxy URLs', async () => {
    m3u8Cache.clear();
    recordedAxiosCalls = [];

    const masterTargetUrl = 'https://sv1.kkphimplayer1.com/hls/master.m3u8';
    const b64MasterUrl = Buffer.from(masterTargetUrl).toString('base64url');
    const b64Ref = Buffer.from('https://player.phimapi.com/').toString('base64url');

    const res = await dispatchHls({
      method: 'GET',
      url: `/manifest.m3u8?url=${b64MasterUrl}&ref=${b64Ref}`,
    });

    assert.strictEqual(res.status, 200, 'HTTP status is 200');
    assert.strictEqual(res.headers['access-control-allow-origin'], '*', 'CORS origin is *');
    assert(res.headers['content-type'].includes('application/vnd.apple.mpegurl'), 'Content-Type is mpegurl');

    const body = String(res.data);
    assert(body.startsWith('#EXTM3U'), 'Body starts with #EXTM3U');

    // Check #EXT-X-MEDIA audio rewrite
    const audioLine = body.split('\n').find(l => l.includes('#EXT-X-MEDIA:TYPE=AUDIO'));
    assert(audioLine, 'Audio media tag line exists');
    const audioUriMatch = audioLine.match(/URI="([^"]+)"/);
    assert(audioUriMatch, 'Audio media tag has rewritten URI');
    assert(audioUriMatch[1].startsWith('http://localhost:7000/hls/manifest.m3u8?url='), 'Audio URI routes to /hls/manifest.m3u8');
    const decodedAudioUrl = Buffer.from(new URL(audioUriMatch[1]).searchParams.get('url'), 'base64url').toString('utf8');
    assert.strictEqual(decodedAudioUrl, 'https://sv1.kkphimplayer1.com/hls/audio/vi.m3u8', 'Relative audio URL resolved against base');

    // Check #EXT-X-MEDIA subtitles rewrite
    const subsLine = body.split('\n').find(l => l.includes('#EXT-X-MEDIA:TYPE=SUBTITLES'));
    assert(subsLine, 'Subtitles media tag line exists');
    const subsUriMatch = subsLine.match(/URI="([^"]+)"/);
    assert(subsUriMatch, 'Subtitles media tag has rewritten URI');
    assert(subsUriMatch[1].startsWith('http://localhost:7000/hls/manifest.m3u8?url='), 'Subtitles URI routes to /hls/manifest.m3u8');
    const decodedSubsUrl = Buffer.from(new URL(subsUriMatch[1]).searchParams.get('url'), 'base64url').toString('utf8');
    assert.strictEqual(decodedSubsUrl, 'https://sv1.kkphimplayer1.com/hls/subs/vi.m3u8', 'Relative subtitles URL resolved against base');

    // Check #EXT-X-STREAM-INF variant 1 (relative: 720p/index.m3u8)
    assert(body.includes('#EXT-X-STREAM-INF:BANDWIDTH=1500000,RESOLUTION=1280x720'), 'Contains 720p stream inf');
    const lines = body.split('\n');
    const idx720 = lines.findIndex(l => l.includes('1280x720'));
    const line720Url = lines[idx720 + 1];
    assert(line720Url.startsWith('http://localhost:7000/hls/manifest.m3u8?url='), '720p variant URI routes to /hls/manifest.m3u8');
    const decoded720Url = Buffer.from(new URL(line720Url).searchParams.get('url'), 'base64url').toString('utf8');
    assert.strictEqual(decoded720Url, 'https://sv1.kkphimplayer1.com/hls/720p/index.m3u8', 'Relative 720p variant URL resolved against base');

    // Check #EXT-X-STREAM-INF variant 2 (absolute: https://cdn.mockphimapi.com/hls/1080p/index.m3u8)
    const idx1080 = lines.findIndex(l => l.includes('1920x1080'));
    const line1080Url = lines[idx1080 + 1];
    assert(line1080Url.startsWith('http://localhost:7000/hls/manifest.m3u8?url='), '1080p variant URI routes to /hls/manifest.m3u8');
    const decoded1080Url = Buffer.from(new URL(line1080Url).searchParams.get('url'), 'base64url').toString('utf8');
    assert.strictEqual(decoded1080Url, 'https://cdn.mockphimapi.com/hls/1080p/index.m3u8', 'Absolute 1080p variant URL preserved');

    // Check referer parameter preserved on all rewritten links
    assert(line720Url.includes(`ref=${b64Ref}`), '720p variant URL contains encoded ref');
    assert(line1080Url.includes(`ref=${b64Ref}`), '1080p variant URL contains encoded ref');
  });

  // ════════════════════════════════════════════════════════════════
  //  SECTION 3: MEDIA SUB-PLAYLIST REWRITING (KEYS, MAPS, TS)
  // ════════════════════════════════════════════════════════════════
  console.log('\n--- Section 3: Media Sub-Playlist, Key, Map & Segment Rewriting ---');

  await asyncTest('Media sub-playlist rewrites segments, AES-128 keys, init maps, and low-latency parts', async () => {
    m3u8Cache.clear();
    recordedAxiosCalls = [];

    const subTargetUrl = 'https://sv1.kkphimplayer1.com/hls/720p/index.m3u8';
    const b64SubUrl = Buffer.from(subTargetUrl).toString('base64url');
    const b64Ref = Buffer.from('https://player.phimapi.com/').toString('base64url');

    const res = await dispatchHls({
      method: 'GET',
      url: `/manifest.m3u8?url=${b64SubUrl}&ref=${b64Ref}`,
    });
    assert.strictEqual(res.status, 200);
    const body = String(res.data);

    // 1. Check #EXT-X-KEY rewrite with is_key=1
    const keyMatch = body.match(/#EXT-X-KEY:METHOD=AES-128,URI="([^"]+)",IV=/);
    assert(keyMatch, '#EXT-X-KEY URI exists and is rewritten');
    assert(keyMatch[1].startsWith('http://localhost:7000/hls/ts?url='), '#EXT-X-KEY routes to /hls/ts');
    assert(keyMatch[1].includes('is_key=1'), '#EXT-X-KEY URL includes is_key=1 parameter');
    const decodedKeyUrl = Buffer.from(new URL(keyMatch[1]).searchParams.get('url'), 'base64url').toString('utf8');
    assert.strictEqual(decodedKeyUrl, 'https://sv1.kkphimplayer1.com/hls/720p/enc.key', 'AES key URL resolved');

    // 2. Check #EXT-X-MAP rewrite
    const mapMatch = body.match(/#EXT-X-MAP:URI="([^"]+)",BYTERANGE="720@0"/);
    assert(mapMatch, '#EXT-X-MAP URI exists and is rewritten');
    assert(mapMatch[1].startsWith('http://localhost:7000/hls/ts?url='), '#EXT-X-MAP routes to /hls/ts');
    const decodedMapUrl = Buffer.from(new URL(mapMatch[1]).searchParams.get('url'), 'base64url').toString('utf8');
    assert.strictEqual(decodedMapUrl, 'https://sv1.kkphimplayer1.com/hls/720p/init.mp4', 'Init map URL resolved');

    // 3. Check relative segment (segment_0.ts)
    assert(body.includes('http://localhost:7000/hls/ts?url='), 'Contains rewritten segment URLs');
    const lines = body.split('\n');
    const seg0Idx = lines.findIndex(l => l.includes('#EXTINF:9.009,'));
    const seg0Url = lines[seg0Idx + 1];
    assert(seg0Url.startsWith('http://localhost:7000/hls/ts?url='), 'segment_0.ts routes to /hls/ts');
    const decodedSeg0 = Buffer.from(new URL(seg0Url).searchParams.get('url'), 'base64url').toString('utf8');
    assert.strictEqual(decodedSeg0, 'https://sv1.kkphimplayer1.com/hls/720p/segment_0.ts', 'Relative segment_0.ts resolved against base');

    // 4. Check byte-range segment (segment_1.ts)
    const seg1Idx = lines.findIndex(l => l.includes('#EXT-X-BYTERANGE:500000@0'));
    const seg1Url = lines[seg1Idx + 2]; // #EXTINF is at seg1Idx+1, URI is at seg1Idx+2
    assert(seg1Url.startsWith('http://localhost:7000/hls/ts?url='), 'Byte-range segment routes to /hls/ts');
    const decodedSeg1 = Buffer.from(new URL(seg1Url).searchParams.get('url'), 'base64url').toString('utf8');
    assert.strictEqual(decodedSeg1, 'https://sv1.kkphimplayer1.com/hls/720p/segment_1.ts', 'Byte-range segment URL resolved');

    // 5. Check absolute segment with query params (https://cdn.mockphimapi.com/720p/segment_2.ts?token=secure123&exp=9999999)
    const seg2Line = lines.find(l => {
      if (!l.startsWith('http://localhost:7000')) return false;
      const dec = Buffer.from(new URL(l).searchParams.get('url'), 'base64url').toString('utf8');
      return dec.includes('segment_2.ts');
    });
    assert(seg2Line, 'segment_2.ts found in rewritten playlist');
    const decodedSeg2 = Buffer.from(new URL(seg2Line).searchParams.get('url'), 'base64url').toString('utf8');
    assert.strictEqual(decodedSeg2, 'https://cdn.mockphimapi.com/720p/segment_2.ts?token=secure123&exp=9999999', 'Query params preserved');

    // 6. Check #EXT-X-PART and #EXT-X-PRELOAD-HINT
    const partMatch = body.match(/#EXT-X-PART:DURATION=0.33334,URI="([^"]+)"/);
    assert(partMatch, '#EXT-X-PART URI rewritten');
    assert(partMatch[1].startsWith('http://localhost:7000/hls/ts?url='), 'Part URI routes to /hls/ts');

    const hintMatch = body.match(/#EXT-X-PRELOAD-HINT:TYPE=PART,URI="([^"]+)"/);
    assert(hintMatch, '#EXT-X-PRELOAD-HINT URI rewritten');
    assert(hintMatch[1].startsWith('http://localhost:7000/hls/ts?url='), 'Preload hint URI routes to /hls/ts');
  });

  // ════════════════════════════════════════════════════════════════
  //  SECTION 4: UPSTREAM ANTI-403 HEADER INJECTION
  // ════════════════════════════════════════════════════════════════
  console.log('\n--- Section 4: Upstream Anti-403 Header Injection Invariants ---');

  await asyncTest('Upstream headers match KKPhim anti-403 specs (Referer, Origin, Chrome 126 Macintosh UA)', async () => {
    m3u8Cache.clear();
    recordedAxiosCalls = [];

    const targetUrl = 'https://sv1.kkphimplayer1.com/hls/master.m3u8';
    const b64Url = Buffer.from(targetUrl).toString('base64url');
    // Pass KKPhim referer
    const b64Ref = Buffer.from('https://player.phimapi.com/').toString('base64url');

    await dispatchHls({
      method: 'GET',
      url: `/manifest.m3u8?url=${b64Url}&ref=${b64Ref}`,
    });

    assert.strictEqual(recordedAxiosCalls.length, 1, 'Axios received 1 request');
    const reqConfig = recordedAxiosCalls[0];

    // Assert User-Agent
    assert.strictEqual(
      reqConfig.headers['User-Agent'],
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
      'User-Agent matches Chrome 126 Mac UA'
    );

    // Assert Referer and Origin
    assert.strictEqual(reqConfig.headers['Referer'], 'https://player.phimapi.com/', 'Referer header matches https://player.phimapi.com/');
    assert.strictEqual(reqConfig.headers['Origin'], 'https://player.phimapi.com', 'Origin header matches https://player.phimapi.com');
  });

  await asyncTest('Automatic regex detection for KKPhim CDN patterns when ref is omitted', async () => {
    const kkphimCdnUrls = [
      'https://s1.kkphimplayer1.com/hls/master.m3u8',
      'https://cdn.phim1280.tv/hls/master.m3u8',
      'https://sv1.phimapi.com/hls/master.m3u8',
      'https://vip.kkphim.net/stream/master.m3u8',
    ];

    for (const url of kkphimCdnUrls) {
      m3u8Cache.clear();
      recordedAxiosCalls = [];

      const b64 = Buffer.from(url).toString('base64url');
      await dispatchHls({
        method: 'GET',
        url: `/manifest.m3u8?url=${b64}`,
      });

      assert(recordedAxiosCalls.length > 0, `Axios called for ${url}`);
      const lastReq = recordedAxiosCalls[recordedAxiosCalls.length - 1];

      assert.strictEqual(lastReq.headers['Referer'], 'https://player.phimapi.com/', `Referer for ${url} pattern matches`);
      assert.strictEqual(lastReq.headers['Origin'], 'https://player.phimapi.com', `Origin for ${url} pattern matches`);
    }
  });

  await asyncTest('NguonC, VsMov and StreamC CDN domain pattern detection', async () => {
    const patterns = [
      { url: 'https://phim.nguonc.com/hls/master.m3u8', expectedRef: 'https://phim.nguonc.com/', expectedOrigin: 'https://phim.nguonc.com' },
      { url: 'https://streamvs.com/hls/master.m3u8',    expectedRef: 'https://vsmov.com/',       expectedOrigin: 'https://vsmov.com' },
      { url: 'https://streamc.online/hls/master.m3u8', expectedRef: 'https://streamc.online/',  expectedOrigin: 'https://streamc.online' },
    ];

    for (const { url, expectedRef, expectedOrigin } of patterns) {
      m3u8Cache.clear();
      recordedAxiosCalls = [];

      const b64 = Buffer.from(url).toString('base64url');
      await dispatchHls({
        method: 'GET',
        url: `/manifest.m3u8?url=${b64}`,
      });

      const lastReq = recordedAxiosCalls[recordedAxiosCalls.length - 1];
      assert.strictEqual(lastReq.headers['Referer'], expectedRef, `Referer for ${url}`);
      assert.strictEqual(lastReq.headers['Origin'], expectedOrigin, `Origin for ${url}`);
    }
  });

  // ════════════════════════════════════════════════════════════════
  //  SECTION 5: SEGMENT STREAMING & MIME TYPE OVERRIDES
  // ════════════════════════════════════════════════════════════════
  console.log('\n--- Section 5: Segment Streaming & MIME Type Overrides ---');

  await asyncTest('Segment proxy /hls/ts streams binary data and forces video/mp2t MIME type despite upstream image/png', async () => {
    recordedAxiosCalls = [];

    const segTargetUrl = 'https://sv1.kkphimplayer1.com/hls/720p/segment_0.ts';
    const b64Seg = Buffer.from(segTargetUrl).toString('base64url');
    const b64Ref = Buffer.from('https://player.phimapi.com/').toString('base64url');

    const res = await dispatchHls({
      method: 'GET',
      url: `/ts?url=${b64Seg}&ref=${b64Ref}`,
    });

    assert.strictEqual(res.status, 200, 'HTTP 200');
    assert.strictEqual(res.headers['access-control-allow-origin'], '*', 'CORS *');
    assert.strictEqual(res.headers['content-type'], 'video/mp2t', 'Forced MIME type video/mp2t (overriding image/png)');
    assert.strictEqual(res.headers['cache-control'], 'public, max-age=86400', 'Cache-Control 24h');
    assert(Buffer.isBuffer(res.data), 'res.data is a buffer');
    assert.strictEqual(res.data.length, 1024, 'Binary payload intact (1024 bytes)');
    assert.strictEqual(res.data[0], 0x47, 'First byte is MPEG-TS sync byte 0x47');

    // Verify upstream received correct headers
    assert.strictEqual(recordedAxiosCalls.length, 1);
    const req = recordedAxiosCalls[0];
    assert.strictEqual(req.headers['Referer'], 'https://player.phimapi.com/');
    assert.strictEqual(req.headers['Origin'], 'https://player.phimapi.com');
    assert.strictEqual(req.headers['User-Agent'], 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36');
  });

  await asyncTest('Key proxy /hls/ts with is_key=1 returns application/octet-stream', async () => {
    recordedAxiosCalls = [];

    const keyTargetUrl = 'https://sv1.kkphimplayer1.com/hls/720p/enc.key';
    const b64Key = Buffer.from(keyTargetUrl).toString('base64url');

    const res = await dispatchHls({
      method: 'GET',
      url: `/ts?url=${b64Key}&is_key=1`,
    });

    assert.strictEqual(res.status, 200, 'HTTP 200');
    assert.strictEqual(res.headers['access-control-allow-origin'], '*', 'CORS *');
    assert.strictEqual(res.headers['content-type'], 'application/octet-stream', 'Key MIME type application/octet-stream');
    assert(Buffer.isBuffer(res.data), 'res.data is a Buffer');
    assert.strictEqual(res.data.length, 16, 'AES-128 key length 16 bytes');
  });

  // ════════════════════════════════════════════════════════════════
  //  SECTION 6: PARAMETER ENCODINGS & COMPATIBILITY
  // ════════════════════════════════════════════════════════════════
  console.log('\n--- Section 6: Parameter Encodings & Query Formats ---');

  await asyncTest('Accepts both Base64URL, standard Base64, and raw plaintext URLs in ?url and ?b64', async () => {
    const targetUrl = 'https://sv1.kkphimplayer1.com/hls/master.m3u8';

    // 1. Base64URL
    m3u8Cache.clear();
    const b64Url = Buffer.from(targetUrl).toString('base64url');
    const res1 = await dispatchHls({ method: 'GET', url: `/manifest.m3u8?url=${b64Url}` });
    assert.strictEqual(res1.status, 200, 'Base64URL works');

    // 2. Standard Base64
    m3u8Cache.clear();
    const stdB64 = Buffer.from(targetUrl).toString('base64');
    const res2 = await dispatchHls({ method: 'GET', url: `/manifest.m3u8?url=${encodeURIComponent(stdB64)}` });
    assert.strictEqual(res2.status, 200, 'Standard Base64 works');

    // 3. Raw plaintext URL in ?url parameter
    m3u8Cache.clear();
    const res3 = await dispatchHls({ method: 'GET', url: `/manifest.m3u8?url=${encodeURIComponent(targetUrl)}` });
    assert.strictEqual(res3.status, 200, 'Raw plaintext URL works');

    // 4. ?b64 parameter alias
    m3u8Cache.clear();
    const res4 = await dispatchHls({ method: 'GET', url: `/manifest.m3u8?b64=${b64Url}` });
    assert.strictEqual(res4.status, 200, '?b64 parameter alias works');

    // 5. Alternate route /m3u8
    m3u8Cache.clear();
    const res5 = await dispatchHls({ method: 'GET', url: `/m3u8?url=${b64Url}` });
    assert.strictEqual(res5.status, 200, '/hls/m3u8 alternate route works');
  });

  // ════════════════════════════════════════════════════════════════
  //  SECTION 7: ADVERSARIAL RESILIENCY & ERROR HANDLING
  // ════════════════════════════════════════════════════════════════
  console.log('\n--- Section 7: Adversarial Resiliency & Error Handling ---');

  await asyncTest('Missing url parameter returns HTTP 400 Bad Request', async () => {
    const resManifest = await dispatchHls({ method: 'GET', url: '/manifest.m3u8' });
    assert.strictEqual(resManifest.status, 400, 'Expected status 400 for manifest without url');
    assert.strictEqual(resManifest.headers['access-control-allow-origin'], '*', 'CORS on 400');

    const resTs = await dispatchHls({ method: 'GET', url: '/ts' });
    assert.strictEqual(resTs.status, 400, 'Expected status 400 for ts without url');
    assert.strictEqual(resTs.headers['access-control-allow-origin'], '*', 'CORS on 400');
  });

  await asyncTest('Upstream 403 Forbidden returns HTTP 502 without crashing server', async () => {
    m3u8Cache.clear();
    const targetUrl = 'https://sv1.kkphimplayer1.com/403-forbidden';
    const b64 = Buffer.from(targetUrl).toString('base64url');

    const resManifest = await dispatchHls({ method: 'GET', url: `/manifest.m3u8?url=${b64}` });
    assert.strictEqual(resManifest.status, 502, 'Expected status 502 for upstream 403 manifest');

    const resTs = await dispatchHls({ method: 'GET', url: `/ts?url=${b64}` });
    assert.strictEqual(resTs.status, 502, 'Expected status 502 for upstream 403 segment');
  });

  await asyncTest('Upstream 500 Internal Error returns HTTP 502 without crashing server', async () => {
    m3u8Cache.clear();
    const targetUrl = 'https://sv1.kkphimplayer1.com/500-error';
    const b64 = Buffer.from(targetUrl).toString('base64url');

    const res = await dispatchHls({ method: 'GET', url: `/manifest.m3u8?url=${b64}` });
    assert.strictEqual(res.status, 502, 'Expected status 502 for upstream 500');
  });

  await asyncTest('Malformed base64 / non-url input handled gracefully with error status', async () => {
    m3u8Cache.clear();
    const res = await dispatchHls({ method: 'GET', url: '/manifest.m3u8?url=!!!not-base64-nor-valid-url!!!' });
    assert(res.status === 400 || res.status === 502, `Returned graceful error code ${res.status}`);
  });

  await asyncTest('m3u8 caching returns cached content on identical request without second upstream fetch', async () => {
    m3u8Cache.clear();
    recordedAxiosCalls = [];

    const masterTargetUrl = 'https://sv1.kkphimplayer1.com/hls/master.m3u8';
    const b64MasterUrl = Buffer.from(masterTargetUrl).toString('base64url');

    const res1 = await dispatchHls({ method: 'GET', url: `/manifest.m3u8?url=${b64MasterUrl}` });
    assert.strictEqual(res1.status, 200);
    assert.strictEqual(recordedAxiosCalls.length, 1, 'First request hit upstream');

    const res2 = await dispatchHls({ method: 'GET', url: `/manifest.m3u8?url=${b64MasterUrl}` });
    assert.strictEqual(res2.status, 200);
    assert.strictEqual(recordedAxiosCalls.length, 1, 'Second request served from cache (0 new upstream requests)');
    assert.strictEqual(res1.data, res2.data, 'Cached response data matches original');
  });

  await asyncTest('Forwarded headers (x-forwarded-proto & x-forwarded-host) respected for reverse proxies', async () => {
    m3u8Cache.clear();
    const masterTargetUrl = 'https://sv1.kkphimplayer1.com/hls/master.m3u8';
    const b64MasterUrl = Buffer.from(masterTargetUrl).toString('base64url');

    const res = await dispatchHls({
      method: 'GET',
      url: `/manifest.m3u8?url=${b64MasterUrl}`,
      headers: {
        'x-forwarded-proto': 'https',
        'x-forwarded-host': 'my-custom-proxy.stream.io',
      },
    });

    assert.strictEqual(res.status, 200);
    const body = String(res.data);
    assert(body.includes('https://my-custom-proxy.stream.io/hls/manifest.m3u8?url='), 'Rewrites URL with forwarded host and https protocol');
    assert(body.includes('https://my-custom-proxy.stream.io/hls/manifest.m3u8?url='), 'Rewrites media tags with forwarded host and https protocol');
  });

  // ════════════════════════════════════════════════════════════════
  //  SECTION 8: ADVANCED STRESS & EDGE CASES
  // ════════════════════════════════════════════════════════════════
  console.log('\n--- Section 8: Advanced Stress & Edge Cases ---');

  await asyncTest('Rewrites multi-audio, multi-subtitle renditions with unquoted and quoted URIs', async () => {
    m3u8Cache.clear();
    const complexMaster = `#EXTM3U
#EXT-X-VERSION:7
#EXT-X-MEDIA:TYPE=AUDIO,GROUP-ID="audio",NAME="English",DEFAULT=YES,URI="audio/en.m3u8"
#EXT-X-MEDIA:TYPE=AUDIO,GROUP-ID="audio",NAME="Vietnamese",URI="audio/vi.m3u8"
#EXT-X-MEDIA:TYPE=SUBTITLES,GROUP-ID="subs",NAME="English",URI="subs/en.vtt"
#EXT-X-MEDIA:TYPE=SUBTITLES,GROUP-ID="subs",NAME="Vietnamese",URI=subs/vi.vtt
#EXT-X-STREAM-INF:BANDWIDTH=800000,RESOLUTION=640x360,AUDIO="audio",SUBTITLES="subs"
360p.m3u8
#EXT-X-STREAM-INF:BANDWIDTH=2500000,RESOLUTION=1280x720,AUDIO="audio",SUBTITLES="subs"
720p.m3u8`;

    mockAxiosHandler = async (cfg) => {
      return {
        status: 200,
        statusText: 'OK',
        data: complexMaster,
        headers: { 'content-type': 'application/vnd.apple.mpegurl' },
        config: cfg,
      };
    };

    const b64 = Buffer.from('https://cdn.mockphimapi.com/movie/master.m3u8').toString('base64url');
    const res = await dispatchHls({ method: 'GET', url: `/manifest.m3u8?url=${b64}` });
    assert.strictEqual(res.status, 200);

    const body = String(res.data);
    const audioLines = body.split('\n').filter(l => l.includes('#EXT-X-MEDIA:TYPE=AUDIO'));
    assert.strictEqual(audioLines.length, 2, 'Two audio renditions rewritten');
    assert(audioLines[0].includes('http://localhost:7000/hls/manifest.m3u8?url='), 'Audio en rewritten');
    assert(audioLines[1].includes('http://localhost:7000/hls/manifest.m3u8?url='), 'Audio vi rewritten');

    const subLines = body.split('\n').filter(l => l.includes('#EXT-X-MEDIA:TYPE=SUBTITLES'));
    assert.strictEqual(subLines.length, 2, 'Two subtitle renditions rewritten');
    assert(subLines[0].includes('http://localhost:7000/hls/manifest.m3u8?url='), 'Sub en rewritten');
    assert(subLines[1].includes('http://localhost:7000/hls/manifest.m3u8?url='), 'Sub vi (unquoted) rewritten');
  });

  await asyncTest('Rewrites DRM Session Key (#EXT-X-SESSION-KEY) tag properly', async () => {
    m3u8Cache.clear();
    const drmMaster = `#EXTM3U
#EXT-X-VERSION:7
#EXT-X-SESSION-KEY:METHOD=AES-128,URI="session.key",IV=0x1234
#EXT-X-STREAM-INF:BANDWIDTH=1000000
stream.m3u8`;

    mockAxiosHandler = async (cfg) => {
      return {
        status: 200,
        statusText: 'OK',
        data: drmMaster,
        headers: { 'content-type': 'application/vnd.apple.mpegurl' },
        config: cfg,
      };
    };

    const b64 = Buffer.from('https://cdn.mockphimapi.com/drm/master.m3u8').toString('base64url');
    const res = await dispatchHls({ method: 'GET', url: `/manifest.m3u8?url=${b64}` });
    assert.strictEqual(res.status, 200);

    const body = String(res.data);
    const sessionKeyLine = body.split('\n').find(l => l.includes('#EXT-X-SESSION-KEY'));
    assert(sessionKeyLine, 'Session key line found');
    assert(sessionKeyLine.includes('http://localhost:7000/hls/ts?url='), 'Session key routes to /hls/ts');
    assert(sessionKeyLine.includes('is_key=1'), 'Session key includes is_key=1');
  });

  await asyncTest('Dynamic ref query parameter overrides domain pattern and handles protocol prepend', async () => {
    m3u8Cache.clear();
    recordedAxiosCalls = [];

    // URL matches kkphim pattern, but ref specifies custom-player.tv without protocol
    const targetUrl = 'https://s1.kkphimplayer1.com/hls/master.m3u8';
    const b64 = Buffer.from(targetUrl).toString('base64url');
    const customRef = 'custom-player.tv/watch';
    const b64Ref = Buffer.from(customRef).toString('base64url');

    await dispatchHls({ method: 'GET', url: `/manifest.m3u8?url=${b64}&ref=${b64Ref}` });

    assert.strictEqual(recordedAxiosCalls.length, 1);
    const req = recordedAxiosCalls[0];
    assert.strictEqual(req.headers['Referer'], 'https://custom-player.tv/watch', 'Referer has https prepended');
    assert.strictEqual(req.headers['Origin'], 'https://custom-player.tv', 'Origin extracted from dynamic ref');
  });

  await asyncTest('Resolves complex relative paths with dot segments (../../segments/01.ts)', async () => {
    m3u8Cache.clear();
    const dotSegmentPlaylist = `#EXTM3U
#EXT-X-VERSION:3
#EXTINF:10.0,
../../segments/chunk_01.ts
#EXTINF:10.0,
../other/chunk_02.ts
#EXT-X-ENDLIST`;

    mockAxiosHandler = async (cfg) => {
      return {
        status: 200,
        statusText: 'OK',
        data: dotSegmentPlaylist,
        headers: { 'content-type': 'application/vnd.apple.mpegurl' },
        config: cfg,
      };
    };

    const b64 = Buffer.from('https://cdn.example.com/hls/deep/nested/index.m3u8').toString('base64url');
    const res = await dispatchHls({ method: 'GET', url: `/manifest.m3u8?url=${b64}` });
    assert.strictEqual(res.status, 200);

    const body = String(res.data);
    const lines = body.split('\n');
    const chunk1Line = lines.find(l => l.includes('http://localhost:7000/hls/ts?url='));
    assert(chunk1Line, 'Chunk 1 line found');
    const decodedUrl = Buffer.from(new URL(chunk1Line).searchParams.get('url'), 'base64url').toString('utf8');
    assert.strictEqual(decodedUrl, 'https://cdn.example.com/hls/segments/chunk_01.ts', 'Dot segments resolved properly');
  });

  await asyncTest('Key rotation with multiple #EXT-X-KEY tags throughout media playlist', async () => {
    m3u8Cache.clear();
    const keyRotationPlaylist = `#EXTM3U
#EXT-X-VERSION:5
#EXT-X-KEY:METHOD=AES-128,URI="key1.key",IV=0x1111
#EXTINF:10.0,
seg1.ts
#EXT-X-KEY:METHOD=AES-128,URI="key2.key",IV=0x2222
#EXTINF:10.0,
seg2.ts
#EXT-X-KEY:METHOD=NONE
#EXTINF:10.0,
seg3.ts
#EXT-X-ENDLIST`;

    mockAxiosHandler = async (cfg) => {
      return {
        status: 200,
        statusText: 'OK',
        data: keyRotationPlaylist,
        headers: { 'content-type': 'application/vnd.apple.mpegurl' },
        config: cfg,
      };
    };

    const b64 = Buffer.from('https://cdn.example.com/vod/index.m3u8').toString('base64url');
    const res = await dispatchHls({ method: 'GET', url: `/manifest.m3u8?url=${b64}` });
    assert.strictEqual(res.status, 200);

    const body = String(res.data);
    const keyLines = body.split('\n').filter(l => l.startsWith('#EXT-X-KEY'));
    assert.strictEqual(keyLines.length, 3, 'All 3 KEY tags preserved');
    
    // Check first key
    assert(keyLines[0].includes('is_key=1'), 'First key has is_key=1');
    const key1Match = keyLines[0].match(/URI="([^"]+)"/);
    assert(key1Match, 'First key URI matched');
    const dec1 = Buffer.from(new URL(key1Match[1]).searchParams.get('url'), 'base64url').toString('utf8');
    assert.strictEqual(dec1, 'https://cdn.example.com/vod/key1.key', 'First key resolved correctly');

    // Check second key
    assert(keyLines[1].includes('is_key=1'), 'Second key has is_key=1');
    const key2Match = keyLines[1].match(/URI="([^"]+)"/);
    assert(key2Match, 'Second key URI matched');
    const dec2 = Buffer.from(new URL(key2Match[1]).searchParams.get('url'), 'base64url').toString('utf8');
    assert.strictEqual(dec2, 'https://cdn.example.com/vod/key2.key', 'Second key resolved correctly');

    assert.strictEqual(keyLines[2], '#EXT-X-KEY:METHOD=NONE', 'METHOD=NONE unchanged');
  });

  await asyncTest('/hls/extract route resolves embed URL and redirects 302 to /hls/manifest.m3u8', async () => {
    const embedUrl = 'https://embed.nguonc.com/play/12345';
    const b64Embed = Buffer.from(embedUrl).toString('base64url');

    mockAxiosHandler = async (cfg) => {
      if (cfg.url === embedUrl) {
        return {
          status: 200,
          statusText: 'OK',
          data: '<html><body><script>var player = { file: "https://streamc.online/hls/12345.m3u8" };</script></body></html>',
          headers: { 'content-type': 'text/html' },
          config: cfg,
        };
      }
      return {
        status: 200,
        statusText: 'OK',
        data: '',
        headers: {},
        config: cfg,
      };
    };

    const res = await dispatchHls({
      method: 'GET',
      url: `/extract?b64=${b64Embed}`,
    });

    assert.strictEqual(res.status, 302, 'HTTP 302 redirect');
    assert(res.headers['location'], 'Location header present');
    assert(res.headers['location'].startsWith('http://localhost:7000/hls/manifest.m3u8?url='), 'Redirects to /hls/manifest.m3u8');
    assert(res.headers['location'].includes(`ref=${b64Embed}`), 'Includes b64 embed as ref');
    const targetM3u8B64 = new URL(res.headers['location']).searchParams.get('url');
    const decodedM3u8 = Buffer.from(targetM3u8B64, 'base64url').toString('utf8');
    assert.strictEqual(decodedM3u8, 'https://streamc.online/hls/12345.m3u8', 'Decoded m3u8 matches extracted stream');
  });

  console.log('\n================================================================');
  console.log(`📊 SUMMARY: ${passedTests} PASSED, ${failedTests} FAILED`);
  const isApproved = failedTests === 0;
  console.log(`EMPIRICAL CHALLENGER VERDICT: ${isApproved ? '✅ APPROVE' : '❌ REQUEST_CHANGES'}`);
  console.log('================================================================\n');

  return { isApproved, passedTests, failedTests, failures };
}

if (require.main === module) {
  runEmpiricalHlsChallenger()
    .then(({ isApproved }) => {
      if (!isApproved) process.exit(1);
    })
    .catch(err => {
      console.error('Fatal error during challenger test execution:', err);
      process.exit(1);
    });
}

module.exports = { runEmpiricalHlsChallenger };
