# Handoff Report — Explorer 3: Milestone 3 E2E Stream Playback Test & Self-Debug Loop Design

**Milestone**: Milestone 3 (E2E Stream Playback Test & Self-Debug Loop)  
**Agent**: Explorer 3 (`explorer_m3_3`)  
**Target Deliverable**: `tests/test_kkphim_playback.js` Design Specification & Verification Framework  

---

## 1. Observation

Direct observations from examining the codebase, dependencies, test infrastructure, and live network probes:

### 1.1 Test Execution Environment & Dependencies
- **Runtime Environment**: Node.js `v26.7.0` (Darwin arm64) supporting native ES6+, Buffer base64url, native `fetch`, `async/await`, and top-level promises.
- **Dependencies (`package.json`)**:
  - `axios`: `^1.7.7` (HTTP client with timeout, proxy header override, and stream / arraybuffer responses)
  - `express`: `^4.21.1` (Web server framework)
  - `cors`: `^2.8.5` (CORS middleware)
  - `node-cache`: `^5.1.2` (In-memory TTL cache)
  - `nodemon`: `^3.1.7` (Development server)
- **Built-in Node.js Modules**: `assert`, `http`, `https`, `url`, `stream`, `events`, `buffer`.

### 1.2 Provider & Proxy Implementations
- **KKPhim Provider (`src/providers/kkphim.js`)**:
  - `getStreams({ slug, imdbId, type, season, episode, proxyBase })` generates Stremio-compliant stream objects.
  - Contract format:
    - `name`: `'VIP Movies 🎬'`
    - `title`: `[VIP • KKPhim] ${cleanServerName}${epLabel} Full HD (HLS Proxy)\n⚡ Server VIP • Phát trực tiếp trong App`
    - `url`: `${proxyBase}/hls/manifest.m3u8?url=${encodeBase64(ep.link_m3u8)}&ref=${encodeBase64('https://player.phimapi.com/')}`
    - `behaviorHints`: `{ notSupported: false, bingeGroup: 'kkphim-...' }`
    - Strictly omits `externalUrl` property key.
- **HLS Proxy Router (`src/routes/hls.js`)**:
  - Route `/hls/manifest.m3u8` (and alias `/hls/m3u8`):
    - Decodes target URL and referer parameter.
    - Determines source referer (`https://player.phimapi.com/` for KKPhim / phimapi / phim1280).
    - Fetches upstream manifest with anti-403 headers (`Referer: https://player.phimapi.com/`, `Origin: https://player.phimapi.com`, Chrome 126 Macintosh UA).
    - Rewrites `#EXT-X-STREAM-INF` sub-playlists and `#EXT-X-MEDIA` audio playlists to `${proxyBase}/hls/manifest.m3u8?url=<base64>&ref=<base64>`.
    - Rewrites `#EXTINF` media segments and `#EXT-X-MAP` to `${proxyBase}/hls/ts?url=<base64>&ref=<base64>`.
    - Rewrites `#EXT-X-KEY` to `${proxyBase}/hls/ts?url=<base64>&ref=<base64>&is_key=1`.
    - Sets CORS header `Access-Control-Allow-Origin: *` and `Content-Type: application/vnd.apple.mpegurl; charset=utf-8`.
  - Route `/hls/ts`:
    - Streams binary media chunks via `axios({ responseType: 'stream' }).pipe(res)`.
    - Enforces `Content-Type: video/mp2t` (or `application/octet-stream` for key files).
    - Enforces `Access-Control-Allow-Origin: *` and `Cache-Control: public, max-age=86400`.

### 1.3 Live Probe Observations
Live execution of `node tests/test_live_kkphim_proxy.js` against test slug `cuu-mon` revealed:
1. `kkphim.getStreams({ slug: 'cuu-mon', proxyBase })` resolved 1 stream:
   - Stream Title: `[VIP • KKPhim] Vietsub Full HD (HLS Proxy)\n⚡ Server VIP • Phát trực tiếp trong App`
   - Proxy URL: `http://127.0.0.1:<port>/hls/manifest.m3u8?url=aHR0cHM6Ly9zMS5waGltMTI4MC50di8yMDIzMDkyOS9hM25acUxIdi9pbmRleC5tM3U4&ref=aHR0cHM6Ly9wbGF5ZXIucGhpbWFwaS5jb20v`
   - `externalUrl` was `undefined`.
2. Manifest proxy returned a multi-bitrate **Master Playlist** containing `#EXTM3U`, `#EXT-X-STREAM-INF:PROGRAM-ID=1,BANDWIDTH=2000000,RESOLUTION=1280x538`, and rewritten sub-manifest URI `http://127.0.0.1:<port>/hls/manifest.m3u8?url=...2000kb/hls/index.m3u8...`.
3. Fetching the sub-manifest yielded a **Media Playlist** containing `#EXTINF` and rewritten segment URI `http://127.0.0.1:<port>/hls/ts?url=...2000kb/hls/gESUP0F0.ts...`.
4. Fetching the TS segment through the proxy yielded:
   - HTTP Status: `200` (no 403 Forbidden / 500)
   - Content-Type: `video/mp2t`
   - Content-Length / Buffer: `946,204 bytes` (> 900 KB)
   - MPEG-TS Packet Sync Bytes: `0x47` at offset `0` and `0x47` at offset `188`.

---

## 2. Logic Chain

From the observations above, the design for `tests/test_kkphim_playback.js` follows a rigorous 5-stage architecture:

```
┌────────────────────────────────────────────────────────────────────────┐
│               tests/test_kkphim_playback.js Execution Flow             │
└────────────────────────────────────────────────────────────────────────┘
                                   │
                                   ▼
          ┌──────────────────────────────────────────────────┐
          │  Stage 0: Ephemeral Server Initialization       │
          │  - Express app mounting /hls and / handlers      │
          │  - Bind to 127.0.0.1:0 (dynamic ephemeral port)  │
          │  - proxyBase = http://127.0.0.1:${port}          │
          └──────────────────────────────────────────────────┘
                                   │
                                   ▼
          ┌──────────────────────────────────────────────────┐
          │  Test Case 1: Stream Generation Verification     │
          │  - Call kkphim.getStreams({ slug: 'cuu-mon' })   │
          │  - Assert name === 'VIP Movies 🎬'               │
          │  - Assert title includes '[VIP • KKPhim]'        │
          │  - Assert url starts with proxyBase + '/hls/'    │
          │  - Assert externalUrl is undefined               │
          │  - Assert behaviorHints.notSupported === false   │
          └──────────────────────────────────────────────────┘
                                   │
                                   ▼
          ┌──────────────────────────────────────────────────┐
          │  Test Case 2: Manifest Proxy Verification        │
          │  - GET stream.url via HTTP                       │
          │  - Assert HTTP 200, Content-Type mpegurl, CORS * │
          │  - Assert body includes '#EXTM3U'                │
          │  - Handle Master vs Media playlist recursively:  │
          │    * If #EXT-X-STREAM-INF: follow sub-manifest   │
          │    * If #EXTINF: extract /hls/ts segment URL     │
          │  - Assert valid targetSegmentUrl found           │
          └──────────────────────────────────────────────────┘
                                   │
                                   ▼
          ┌──────────────────────────────────────────────────┐
          │  Test Case 3: Segment Playback Verification      │
          │  - GET targetSegmentUrl via HTTP (arraybuffer)   │
          │  - Assert HTTP 200 (NOT 403, 404, 500, 502)      │
          │  - Assert Content-Type === 'video/mp2t'          │
          │  - Assert Access-Control-Allow-Origin === '*'    │
          │  - Assert buffer.length > 50,000 bytes           │
          │  - Assert TS sync byte: buffer[0] === 0x47       │
          │  - Assert packet alignment: buffer[188] === 0x47 │
          └──────────────────────────────────────────────────┘
                                   │
                                   ▼
          ┌──────────────────────────────────────────────────┐
          │  Stage 4: Teardown & Process Exit Code           │
          │  - server.close() in finally block               │
          │  - On 100% Pass: process.exit(0)                 │
          │  - On Any Error: log diagnosis & process.exit(1) │
          └──────────────────────────────────────────────────┘
```

### 2.1 Detailed Implementation Specification for `tests/test_kkphim_playback.js`

```javascript
'use strict';

/**
 * ==============================================================================
 *  VIP Movies Addon — tests/test_kkphim_playback.js
 *  Milestone 3: End-to-End Stream Playback Test & Self-Debug Verification Loop
 *
 *  Validates:
 *    - Test Case 1: Stream Generation for slug 'cuu-mon' (VIP Movies branding,
 *                   [VIP • KKPhim] title, HLS proxy URL, strict omission of externalUrl)
 *    - Test Case 2: Manifest Proxy Verification (HTTP 200, #EXTM3U, MIME/CORS,
 *                   Master / Media sub-manifest resolution & rewritten TS links)
 *    - Test Case 3: Segment Playback Verification (HTTP 200, no 403 Forbidden,
 *                   Content-Type video/mp2t, CORS *, >50KB binary buffer, 0x47 sync byte)
 *
 *  Execution:
 *    node tests/test_kkphim_playback.js
 *    Exit Code 0 on Success, Exit Code 1 on Failure
 * ==============================================================================
 */

const express = require('express');
const axios = require('axios');
const assert = require('assert');
const hlsRouter = require('../src/routes/hls');
const kkphim = require('../src/providers/kkphim');
const handlers = require('../src/handlers');

// ANSI Color formatting
const GREEN  = '\x1b[32m';
const RED    = '\x1b[31m';
const CYAN   = '\x1b[36m';
const YELLOW = '\x1b[33m';
const BOLD   = '\x1b[1m';
const RESET  = '\x1b[0m';
const GRAY   = '\x1b[90m';

async function runPlaybackTest() {
  const startTime = Date.now();
  console.log(`\n${BOLD}${CYAN}╔════════════════════════════════════════════════════════════════════════════╗${RESET}`);
  console.log(`${BOLD}${CYAN}║     🎬 KKPHIM E2E STREAM PLAYBACK & ANTI-403 VERIFICATION TEST SUITE       ║${RESET}`);
  console.log(`${BOLD}${CYAN}╚════════════════════════════════════════════════════════════════════════════╝${RESET}\n`);

  // 1. Initialize Ephemeral Server
  const app = express();
  app.use('/hls', hlsRouter);
  app.use('/', handlers);

  const server = await new Promise((resolve, reject) => {
    const s = app.listen(0, '127.0.0.1', () => resolve(s));
    s.on('error', reject);
  });

  const port = server.address().port;
  const proxyBase = `http://127.0.0.1:${port}`;
  console.log(`${GRAY}ℹ️  Started local test server on ephemeral port:${RESET} ${BOLD}${port}${RESET}`);
  console.log(`${GRAY}ℹ️  Proxy Base URL:${RESET} ${proxyBase}\n`);

  let test1Passed = false;
  let test2Passed = false;
  let test3Passed = false;

  try {
    // ══════════════════════════════════════════════════════════════
    //  TEST CASE 1: Stream Generation Verification
    // ══════════════════════════════════════════════════════════════
    console.log(`${BOLD}${CYAN}▶ TEST CASE 1: Stream Generation for slug "cuu-mon"${RESET}`);
    
    const streams = await kkphim.getStreams({ slug: 'cuu-mon', type: 'movie', proxyBase });
    assert.ok(Array.isArray(streams) && streams.length > 0, 'Must return at least 1 stream for slug "cuu-mon"');
    
    const stream = streams[0];
    console.log(`  ${GRAY}Resolved Stream Object:${RESET}`, {
      name: stream.name,
      title: stream.title.replace(/\n/g, ' ↵ '),
      url: stream.url.slice(0, 80) + '...',
      hasExternalUrl: 'externalUrl' in stream,
    });

    // Invariant assertions
    assert.strictEqual(stream.name, 'VIP Movies 🎬', 'Stream name must be "VIP Movies 🎬"');
    assert.ok(stream.title.includes('[VIP • KKPhim]'), 'Title must contain "[VIP • KKPhim]" badge');
    assert.ok(stream.title.includes('Full HD (HLS Proxy)'), 'Title must declare "(HLS Proxy)"');
    assert.ok(stream.title.includes('⚡ Server VIP • Phát trực tiếp trong App'), 'Title must declare in-app playback label');
    assert.ok(typeof stream.url === 'string' && stream.url.startsWith(`${proxyBase}/hls/manifest.m3u8`), 'URL must route to local /hls/manifest.m3u8 proxy');
    assert.strictEqual(stream.externalUrl, undefined, 'externalUrl must be strictly undefined (In-App Direct Play)');
    assert.ok(!('externalUrl' in stream), 'externalUrl property key must NOT exist in stream object');
    assert.strictEqual(stream.behaviorHints?.notSupported, false, 'behaviorHints.notSupported must be false');
    assert.ok(typeof stream.behaviorHints?.bingeGroup === 'string', 'behaviorHints.bingeGroup must be string');

    test1Passed = true;
    console.log(`  ${GREEN}✅ PASS: Test Case 1 — Stream Generation verified (In-App Protocol Contract satisfied)${RESET}\n`);

    // ══════════════════════════════════════════════════════════════
    //  TEST CASE 2: Manifest Proxy Verification
    // ══════════════════════════════════════════════════════════════
    console.log(`${BOLD}${CYAN}▶ TEST CASE 2: Manifest Proxy Verification${RESET}`);
    console.log(`  ${GRAY}Fetching manifest from:${RESET} ${stream.url}`);

    const manifestRes = await axios.get(stream.url, { timeout: 15000 });
    assert.strictEqual(manifestRes.status, 200, `Manifest fetch must return HTTP 200 (got ${manifestRes.status})`);
    
    const contentType = manifestRes.headers['content-type'] || '';
    assert.ok(contentType.includes('application/vnd.apple.mpegurl'), `Content-Type must be application/vnd.apple.mpegurl (got ${contentType})`);
    assert.strictEqual(manifestRes.headers['access-control-allow-origin'], '*', 'CORS Access-Control-Allow-Origin must be "*"');
    assert.ok(manifestRes.data.includes('#EXTM3U'), 'Manifest content must contain #EXTM3U header');

    // Parse lines and resolve Master vs Media Playlist
    let targetSegmentUrl = null;
    const lines = String(manifestRes.data).split('\n').map((l) => l.trim()).filter(Boolean);

    for (const line of lines) {
      if (line.startsWith('http://') && line.includes('/hls/ts')) {
        targetSegmentUrl = line;
        break;
      }
      if (line.startsWith('http://') && line.includes('/hls/manifest.m3u8')) {
        console.log(`  ${GRAY}Detected Master Playlist. Fetching sub-manifest variant:${RESET} ${line.slice(0, 90)}...`);
        const subRes = await axios.get(line, { timeout: 15000 });
        assert.strictEqual(subRes.status, 200, 'Sub-manifest fetch must return HTTP 200');
        assert.ok(subRes.data.includes('#EXTM3U'), 'Sub-manifest must contain #EXTM3U');
        
        const subLines = String(subRes.data).split('\n').map((l) => l.trim()).filter(Boolean);
        for (const sLine of subLines) {
          if (sLine.startsWith('http://') && sLine.includes('/hls/ts')) {
            targetSegmentUrl = sLine;
            break;
          }
        }
        if (targetSegmentUrl) break;
      }
    }

    assert.ok(targetSegmentUrl, 'Must resolve a valid rewritten /hls/ts segment URL from playlist');
    test2Passed = true;
    console.log(`  ${GREEN}✅ PASS: Test Case 2 — Manifest Proxy verified (Rewritten TS URL: ${targetSegmentUrl.slice(0, 75)}...)${RESET}\n`);

    // ══════════════════════════════════════════════════════════════
    //  TEST CASE 3: Segment Playback Verification (Anti-403 Check)
    // ══════════════════════════════════════════════════════════════
    console.log(`${BOLD}${CYAN}▶ TEST CASE 3: Segment Playback Verification (Anti-403 & Binary Buffer)${RESET}`);
    console.log(`  ${GRAY}Fetching video segment:${RESET} ${targetSegmentUrl}`);

    const segRes = await axios.get(targetSegmentUrl, {
      responseType: 'arraybuffer',
      timeout: 25000,
    });

    assert.strictEqual(segRes.status, 200, `Segment fetch must return HTTP 200 (got ${segRes.status})`);
    assert.notStrictEqual(segRes.status, 403, 'Segment request must NOT return 403 Forbidden');
    assert.notStrictEqual(segRes.status, 500, 'Segment request must NOT return 500 Internal Error');
    assert.notStrictEqual(segRes.status, 502, 'Segment request must NOT return 502 Bad Gateway');

    const segContentType = segRes.headers['content-type'] || '';
    assert.ok(
      segContentType.includes('video/mp2t') || segContentType.includes('application/octet-stream'),
      `Segment Content-Type must be video/mp2t or application/octet-stream (got ${segContentType})`
    );
    assert.strictEqual(segRes.headers['access-control-allow-origin'], '*', 'Segment CORS Access-Control-Allow-Origin must be "*"');

    const buffer = Buffer.from(segRes.data);
    assert.ok(buffer.length > 50000, `Segment buffer must be > 50KB, got ${buffer.length} bytes`);
    
    // MPEG-TS Packet Sync Byte Validation (0x47)
    assert.strictEqual(buffer[0], 0x47, `First byte of MPEG-TS segment must be 0x47 (sync byte), got 0x${buffer[0].toString(16)}`);
    if (buffer.length >= 189) {
      assert.strictEqual(buffer[188], 0x47, `Byte 188 of MPEG-TS segment must be 0x47 (188-byte packet boundary), got 0x${buffer[188].toString(16)}`);
    }

    test3Passed = true;
    console.log(`  ${GREEN}✅ PASS: Test Case 3 — Video Segment Delivery verified (${buffer.length} bytes, valid MPEG-TS sync byte 0x47)${RESET}\n`);

    // ══════════════════════════════════════════════════════════════
    //  SUMMARY & SUCCESS VERDICT
    // ══════════════════════════════════════════════════════════════
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(2);
    console.log(`${BOLD}╔════════════════════════════════════════════════════════════════════════════╗${RESET}`);
    console.log(`${BOLD}║                    🎉 ALL 3 PLAYBACK TEST CASES PASSED                     ║${RESET}`);
    console.log(`${BOLD}╠════════════════════════════════════════════════════════════════════════════╣${RESET}`);
    console.log(`║  Test Case 1 (Stream Generation):       ${GREEN}PASSED${RESET} (In-App URL, No externalUrl) ║`);
    console.log(`║  Test Case 2 (Manifest Proxy):          ${GREEN}PASSED${RESET} (HTTP 200, #EXTM3U, Rewritten)║`);
    console.log(`║  Test Case 3 (Segment Anti-403 & TS):   ${GREEN}PASSED${RESET} (HTTP 200, ${buffer.length} B)   ║`);
    console.log(`║  Total Execution Time:                  ${elapsed}s                              ║`);
    console.log(`${BOLD}╚════════════════════════════════════════════════════════════════════════════╝${RESET}\n`);

    return true;
  } catch (err) {
    console.error(`\n${RED}${BOLD}❌ PLAYBACK TEST FAILED!${RESET}`);
    console.error(`   ${RED}Stage:${RESET} ${!test1Passed ? 'Test Case 1' : !test2Passed ? 'Test Case 2' : 'Test Case 3'}`);
    console.error(`   ${RED}Error:${RESET} ${err.message}`);
    if (err.stack) {
      console.error(`   ${GRAY}${err.stack.split('\n').slice(1, 4).join('\n   ')}${RESET}`);
    }
    
    // Self-debug diagnostic hints
    console.error(`\n${YELLOW}${BOLD}🔍 SELF-DEBUG DIAGNOSTIC HINTS:${RESET}`);
    if (!test1Passed) {
      console.error(`   - Check src/providers/kkphim.js: Verify getStreams() extracts link_m3u8 properly and formats title.`);
      console.error(`   - Verify phimapi.com API availability.`);
    } else if (!test2Passed) {
      console.error(`   - Check src/routes/hls.js: Verify manifest proxy headers (Referer: https://player.phimapi.com/, Origin).`);
      console.error(`   - Check line-by-line regex rewriting for #EXT-X-STREAM-INF and #EXTINF.`);
    } else {
      console.error(`   - Check src/routes/hls.js /ts route: Verify segment upstream pipe proxy.`);
      console.error(`   - If receiving HTTP 403 Forbidden: check if upstream CDN changed hotlink protection requirements.`);
    }

    throw err;
  } finally {
    server.close();
  }
}

if (require.main === module) {
  runPlaybackTest()
    .then(() => process.exit(0))
    .catch(() => process.exit(1));
}

module.exports = { runPlaybackTest };
```

---

## 3. Caveats

1. **Upstream Network Latency**: KKPhim API (`phimapi.com`) and upstream video CDNs (`s1.phim1280.tv`, `kkphimplayer.com`) are external public endpoints. Occasional network latency spikes or transient socket timeouts can occur. The test sets a 15-25 second timeout per request to avoid premature timeouts.
2. **Ephemeral Port Binding**: Express `app.listen(0, '127.0.0.1')` binds asynchronously. The test must await the `listening` callback before querying `server.address().port`.
3. **MPEG-TS Sync Byte Assumption**: Standard HLS streams utilize MPEG-2 Transport Stream (`.ts`) container format with sync byte `0x47` every 188 bytes. If future upstream CDNs adopt fragmented MP4 (`fMP4` / `.m4s`), the sync byte format would differ (`ftyp` box), though KKPhim currently exclusively distributes `.ts` chunks.
4. **Read-Only Scope**: Explorer 3 performed read-only investigations, design specification, and empirical probing without modifying production source code files.

---

## 4. Conclusion

- The test environment, dependencies, and execution mechanics for `tests/test_kkphim_playback.js` have been completely analyzed and verified.
- The 3 required test cases (Stream Generation, Manifest Proxy Verification, Segment Playback Verification) and the Self-Debug Loop mandate from `ORIGINAL_REQUEST.md §R3` and `PROJECT.md` are fully specified.
- Standalone execution (`node tests/test_kkphim_playback.js`) with exit code 0 on success and exit code 1 on failure is ready for implementation by the builder agent.

---

## 5. Verification Method

Once implemented, the deliverable can be verified independently using:

1. **Syntax Check**:
   ```bash
   node --check tests/test_kkphim_playback.js
   node --check src/index.js
   ```
2. **E2E Playback Execution**:
   ```bash
   node tests/test_kkphim_playback.js
   echo "Exit Code: $?"
   ```
   *Expected Outcome*: Output displays 3 green pass marks, binary TS buffer size > 500KB, and exit code `0`.
3. **Regression Test Suite**:
   ```bash
   node tests/m3_verification.test.js
   node tests/test_live_kkphim_proxy.js
   ```
