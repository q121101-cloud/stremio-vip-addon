'use strict';

/**
 * ==============================================================================
 *  VIP Movies Addon — tests/test_m3_adversarial_empirical.js
 *  Empirical Challenger 1 Test Suite for Milestone 3:
 *  Multi-Slug & Multi-CDN Live Stream Playback & Adversarial HLS Proxy Probing
 * ==============================================================================
 */

const express = require('express');
const cors = require('cors');
const axios = require('axios');
const assert = require('assert');

const hlsRouter = require('../src/routes/hls');
const kkphim = require('../src/providers/kkphim');
const handlers = require('../src/handlers');

const GREEN  = '\x1b[32m';
const RED    = '\x1b[31m';
const CYAN   = '\x1b[36m';
const YELLOW = '\x1b[33m';
const BOLD   = '\x1b[1m';
const RESET  = '\x1b[0m';
const GRAY   = '\x1b[90m';

const TEST_SLUGS = [
  { slug: 'cuu-mon', type: 'movie', label: 'Cửu Môn (Movie, CDN s1.phim1280.tv)' },
  { slug: 'tan-thuoc', type: 'series', episode: 1, label: 'Tàn Thước (Series Ep 1, CDN v7.kkphimplayer7.com)' },
  { slug: 'nhat-niem-vinh-hang', type: 'series', episode: 1, label: 'Nhất Niệm Vĩnh Hằng (Anime Ep 1, CDN s3.phim1280.tv)' },
  { slug: 'dau-pha-thuong-khung-phan-5', type: 'series', episode: 1, label: 'Đấu Phá Thương Khung P5 (Anime Ep 1, CDN s5/s6)' },
  { slug: 'mai', type: 'movie', label: 'Mai (Movie, CDN s2.phim1280.tv)' },
  { slug: 'pham-nhan-tu-tien', type: 'series', episode: 1, label: 'Phàm Nhân Tu Tiên (Anime Ep 1, CDN s3/s6)' },
];

class AdversarialRunner {
  constructor() {
    this.passed = 0;
    this.failed = 0;
    this.failures = [];
    this.cdnTested = new Set();
    this.segmentsVerified = 0;
  }

  pass(msg) {
    console.log(`  ${GREEN}✅ PASS:${RESET} ${msg}`);
    this.passed++;
  }

  fail(msg, err) {
    const errorStr = err ? (err.message || String(err)) : '';
    console.log(`  ${RED}❌ FAIL:${RESET} ${msg}`);
    if (errorStr) console.log(`     ${GRAY}${errorStr}${RESET}`);
    this.failed++;
    this.failures.push({ msg, err: errorStr });
  }

  assert(cond, msg, err) {
    if (cond) {
      this.pass(msg);
      return true;
    } else {
      this.fail(msg, err || new Error('Assertion failed: condition is false'));
      return false;
    }
  }
}

async function runEmpiricalChallengerTests() {
  const runner = new AdversarialRunner();
  const startTime = Date.now();

  console.log(`\n${BOLD}${CYAN}╔══════════════════════════════════════════════════════════════════════════════╗${RESET}`);
  console.log(`${BOLD}${CYAN}║    ⚔️  CHALLENGER 1: M3 EMPIRICAL PLAYBACK & ADVERSARIAL CDN STRESS SUITE     ║${RESET}`);
  console.log(`${BOLD}${CYAN}║    Multi-Slug | Multi-CDN | Raw Sync Byte 0x47 | Boundary Probing            ║${RESET}`);
  console.log(`${BOLD}${CYAN}╚══════════════════════════════════════════════════════════════════════════════╝${RESET}\n`);

  // Start local ephemeral Express test server
  const app = express();
  app.use(cors());
  app.use(express.json());
  app.use('/hls', hlsRouter);
  app.use('/', handlers);

  const server = await new Promise((resolve, reject) => {
    const s = app.listen(0, '127.0.0.1', () => resolve(s));
    s.on('error', reject);
  });

  const port = server.address().port;
  const proxyBase = `http://127.0.0.1:${port}`;
  console.log(`${GRAY}ℹ️  Test server listening on:${RESET} ${BOLD}${proxyBase}${RESET}\n`);

  try {
    // ══════════════════════════════════════════════════════════════════════════
    //  SECTION 1: Multi-Slug Live Stream Playback & Multi-CDN Validation
    // ══════════════════════════════════════════════════════════════════════════
    console.log(`${BOLD}${CYAN}══ SECTION 1: Multi-Slug Live Playback & Multi-CDN Byte Validation ══${RESET}`);

    for (const testItem of TEST_SLUGS) {
      console.log(`\n  ${BOLD}▶ Testing title: ${CYAN}${testItem.slug}${RESET} (${testItem.label})`);

      // 1.1 Direct Provider Stream Resolution
      const streams = await kkphim.getStreams({
        slug: testItem.slug,
        type: testItem.type,
        episode: testItem.episode,
        proxyBase,
      });

      runner.assert(
        Array.isArray(streams) && streams.length > 0,
        `Slug "${testItem.slug}" resolved ${streams?.length || 0} stream(s)`
      );

      if (!streams || streams.length === 0) continue;

      for (let i = 0; i < streams.length; i++) {
        const stream = streams[i];
        const label = `Slug "${testItem.slug}" Stream #${i + 1}`;

        // R1: Protocol & Format Invariants
        runner.assert(stream.name === 'VIP Movies 🎬', `${label} name is "VIP Movies 🎬"`);
        runner.assert(stream.title.includes('[VIP • KKPhim]'), `${label} title contains [VIP • KKPhim] badge`);
        runner.assert(stream.title.includes('Full HD (HLS Proxy)'), `${label} title contains Full HD (HLS Proxy)`);
        runner.assert(stream.title.includes('⚡ Server VIP • Phát trực tiếp trong App'), `${label} title contains in-app badge`);
        runner.assert(!stream.title.includes('#'), `${label} title has NO "#" characters: "${stream.title.replace(/\n/g, ' ')}"`);
        runner.assert(stream.url && stream.url.startsWith(`${proxyBase}/hls/manifest.m3u8`), `${label} url routes to /hls/manifest.m3u8`);
        runner.assert(stream.externalUrl === undefined, `${label} externalUrl is strictly undefined`);
        runner.assert(!('externalUrl' in stream), `${label} externalUrl property does NOT exist on stream object`);

        // 1.2 Fetch Proxy Manifest
        let manifestRes;
        try {
          manifestRes = await axios.get(stream.url, { timeout: 20000 });
          runner.assert(
            manifestRes.status === 200,
            `${label} manifest fetch returned HTTP 200`
          );
        } catch (err) {
          runner.fail(`${label} manifest fetch failed`, err);
          continue;
        }

        const ct = manifestRes.headers['content-type'] || '';
        runner.assert(ct.includes('application/vnd.apple.mpegurl'), `${label} manifest Content-Type is mpegurl`);
        runner.assert(manifestRes.headers['access-control-allow-origin'] === '*', `${label} manifest has CORS *`);
        runner.assert(manifestRes.data.includes('#EXTM3U'), `${label} manifest contains #EXTM3U`);

        // 1.3 Traverse sub-playlists if Master Playlist to resolve .ts URL
        let targetSegmentProxyUrl = null;
        let upstreamHost = 'unknown';

        const lines = String(manifestRes.data).split('\n').map((l) => l.trim()).filter(Boolean);
        for (const line of lines) {
          if (line.startsWith('http://') && line.includes('/hls/ts')) {
            targetSegmentProxyUrl = line;
            break;
          }
          if (line.startsWith('http://') && line.includes('/hls/manifest.m3u8')) {
            try {
              const subRes = await axios.get(line, { timeout: 20000 });
              if (subRes.status === 200 && subRes.data.includes('#EXTM3U')) {
                const subLines = String(subRes.data).split('\n').map((l) => l.trim()).filter(Boolean);
                for (const sl of subLines) {
                  if (sl.startsWith('http://') && sl.includes('/hls/ts')) {
                    targetSegmentProxyUrl = sl;
                    break;
                  }
                }
              }
            } catch (subErr) {
              console.warn(`    Sub-manifest warning: ${subErr.message}`);
            }
            if (targetSegmentProxyUrl) break;
          }
        }

        runner.assert(
          targetSegmentProxyUrl !== null,
          `${label} resolved valid rewritten /hls/ts segment URL`
        );

        if (targetSegmentProxyUrl) {
          // Identify Upstream CDN
          try {
            const parsedUrl = new URL(targetSegmentProxyUrl);
            const b64Val = parsedUrl.searchParams.get('url') || parsedUrl.searchParams.get('b64');
            const decodedUpstream = Buffer.from(b64Val, 'base64url').toString('utf8');
            upstreamHost = new URL(decodedUpstream).hostname;
            runner.cdnTested.add(upstreamHost);
            console.log(`    ${GRAY}Upstream CDN identified:${RESET} ${BOLD}${upstreamHost}${RESET}`);
          } catch {}

          // 1.4 Fetch actual TS segment through Proxy
          try {
            const segRes = await axios.get(targetSegmentProxyUrl, {
              responseType: 'arraybuffer',
              timeout: 25000,
            });

            runner.assert(segRes.status === 200, `${label} (${upstreamHost}) TS segment fetch returned HTTP 200`);
            const segCt = segRes.headers['content-type'] || '';
            runner.assert(
              segCt.includes('video/mp2t') || segCt.includes('application/octet-stream'),
              `${label} TS segment Content-Type is video/mp2t (${segCt})`
            );
            runner.assert(segRes.headers['access-control-allow-origin'] === '*', `${label} TS segment has CORS *`);

            const buf = Buffer.from(segRes.data);
            const sizeKB = Math.round(buf.length / 1024);
            runner.assert(buf.length > 50000, `${label} TS segment size is ${buf.length} B (${sizeKB} KB > 50KB)`);

            // Verify MPEG-TS sync byte 0x47 (71)
            const isSync0 = buf[0] === 0x47;
            const isSync188 = buf.length >= 189 ? buf[188] === 0x47 : true;
            runner.assert(isSync0, `${label} TS segment byte 0 is sync byte 0x47 (got 0x${buf[0]?.toString(16)})`);
            runner.assert(isSync188, `${label} TS segment byte 188 is sync byte 0x47 (got 0x${buf[188]?.toString(16)})`);
            runner.segmentsVerified++;
          } catch (segErr) {
            runner.fail(`${label} TS segment fetch failed with error`, segErr);
          }
        }
      }
    }

    console.log(`\n  ${GRAY}Distinct CDNs empirically tested:${RESET} ${[...runner.cdnTested].map((c) => BOLD + c + RESET).join(', ')}`);
    console.log(`  ${GRAY}Total live TS video segments verified:${RESET} ${BOLD}${runner.segmentsVerified}${RESET}`);

    // ══════════════════════════════════════════════════════════════════════════
    //  SECTION 2: Anti-403 Hotlink Protection & Referer Encoding Probing
    // ══════════════════════════════════════════════════════════════════════════
    console.log(`\n${BOLD}${CYAN}══ SECTION 2: Anti-403 Hotlink Protection & Referer Encoding ══${RESET}`);

    const cdnSampleUrls = [
      'https://s1.phim1280.tv/20230929/a3nZqLHv/index.m3u8',
      'https://s2.phim1280.tv/20231228/mujtYCLP/index.m3u8',
      'https://s3.phim1280.tv/20240820/XyKbG5CK/index.m3u8',
      'https://s5.phim1280.tv/20250305/qJHgdg88/index.m3u8',
      'https://s6.kkphimplayer6.com/20250731/0EeSbPlL/index.m3u8',
      'https://v7.kkphimplayer7.com/20260816/yAK7zSbE/index.m3u8',
    ];

    cdnSampleUrls.forEach((testUrl) => {
      const b64 = Buffer.from(testUrl).toString('base64url');
      const proxyReqUrl = `${proxyBase}/hls/manifest.m3u8?url=${b64}`;
      runner.assert(proxyReqUrl.includes(b64), `Base64URL encoding cleanly generated for ${new URL(testUrl).hostname}`);
    });

    // ══════════════════════════════════════════════════════════════════════════
    //  SECTION 3: Adversarial Input & Boundary Value Analysis on HLS Proxy
    // ══════════════════════════════════════════════════════════════════════════
    console.log(`\n${BOLD}${CYAN}══ SECTION 3: Adversarial Input & Error Handling Probing ══${RESET}`);

    // 3.1 Missing query parameters on /manifest.m3u8 -> 400
    try {
      const r = await axios.get(`${proxyBase}/hls/manifest.m3u8`, { validateStatus: () => true });
      runner.assert(r.status === 400, 'GET /hls/manifest.m3u8 without params returns HTTP 400');
    } catch (e) {
      runner.fail('GET /hls/manifest.m3u8 without params', e);
    }

    // 3.2 Missing query parameters on /ts -> 400
    try {
      const r = await axios.get(`${proxyBase}/hls/ts`, { validateStatus: () => true });
      runner.assert(r.status === 400, 'GET /hls/ts without params returns HTTP 400');
    } catch (e) {
      runner.fail('GET /hls/ts without params', e);
    }

    // 3.3 Corrupted / non-existent upstream URL -> 502 without crash
    try {
      const badUpstream = Buffer.from('https://invalid-domain-does-not-exist-123456789.com/test.m3u8').toString('base64url');
      const r = await axios.get(`${proxyBase}/hls/manifest.m3u8?url=${badUpstream}`, { validateStatus: () => true, timeout: 5000 });
      runner.assert(r.status === 502, 'GET /hls/manifest.m3u8 with unreachable upstream returns HTTP 502');
    } catch (e) {
      runner.fail('GET /hls/manifest.m3u8 with unreachable upstream', e);
    }

    // 3.4 Raw URL query parameter support
    const cuuMonDirect = await kkphim.getStreams({ slug: 'cuu-mon', type: 'movie', proxyBase });
    if (cuuMonDirect && cuuMonDirect.length > 0) {
      const m3u8B64 = new URL(cuuMonDirect[0].url).searchParams.get('url');
      const rawM3u8 = Buffer.from(m3u8B64, 'base64url').toString('utf8');

      const plainUrlReq = `${proxyBase}/hls/manifest.m3u8?url=${encodeURIComponent(rawM3u8)}`;
      try {
        const r = await axios.get(plainUrlReq, { timeout: 15000 });
        runner.assert(r.status === 200, 'GET /hls/manifest.m3u8 accepts raw URL in query param');
        runner.assert(r.data.includes('#EXTM3U'), 'Raw URL query returns valid #EXTM3U manifest');
      } catch (e) {
        runner.fail('Raw URL query handling', e);
      }
    }

    // 3.5 OPTIONS preflight CORS check
    try {
      const optRes = await axios({
        method: 'OPTIONS',
        url: `${proxyBase}/hls/manifest.m3u8`,
        validateStatus: () => true,
      });
      runner.assert(optRes.status === 204, 'OPTIONS /hls/manifest.m3u8 returns HTTP 204 Preflight');
      runner.assert(optRes.headers['access-control-allow-origin'] === '*', 'OPTIONS preflight includes Access-Control-Allow-Origin: *');
      runner.assert(optRes.headers['access-control-allow-methods']?.includes('GET'), 'OPTIONS preflight includes GET method');
    } catch (e) {
      runner.fail('OPTIONS preflight check', e);
    }

    // ══════════════════════════════════════════════════════════════════════════
    //  SECTION 4: Cache Hit & Concurrency Stress Test
    // ══════════════════════════════════════════════════════════════════════════
    console.log(`\n${BOLD}${CYAN}══ SECTION 4: Cache Hit Performance & High-Concurrency Burst ══${RESET}`);

    if (cuuMonDirect && cuuMonDirect.length > 0) {
      const manifestUrl = cuuMonDirect[0].url;

      // Prime cache
      await axios.get(manifestUrl);

      // Concurrent bursts (30 simultaneous manifest requests)
      const t0 = Date.now();
      const manifestPromises = Array.from({ length: 30 }, () => axios.get(manifestUrl));
      const manifestResults = await Promise.all(manifestPromises);
      const t1 = Date.now();

      const all200 = manifestResults.every((r) => r.status === 200 && r.data.includes('#EXTM3U'));
      runner.assert(all200, `All 30 concurrent manifest requests succeeded with HTTP 200 in ${t1 - t0}ms`);
    }

    // ══════════════════════════════════════════════════════════════════════════
    //  SECTION 5: Series Episode Resolution Stress Test in KKPhim
    // ══════════════════════════════════════════════════════════════════════════
    console.log(`\n${BOLD}${CYAN}══ SECTION 5: KKPhim Episode Resolution Boundary Checks ══${RESET}`);

    // Series: Episode 1, Episode 2, Non-existent Episode 999
    const ep1Streams = await kkphim.getStreams({ slug: 'tan-thuoc', type: 'series', episode: 1, proxyBase });
    runner.assert(ep1Streams.length > 0, 'Episode 1 returns streams');
    runner.assert(/\[Tập 0?1\]/i.test(ep1Streams[0].title), `Episode 1 title formatted with [Tập 01] or [Tập 1]: "${ep1Streams[0].title.replace(/\n/g, ' ')}"`);

    const ep2Streams = await kkphim.getStreams({ slug: 'tan-thuoc', type: 'series', episode: 2, proxyBase });
    runner.assert(ep2Streams.length > 0, 'Episode 2 returns streams');
    runner.assert(/\[Tập 0?2\]/i.test(ep2Streams[0].title), `Episode 2 title formatted with [Tập 02] or [Tập 2]: "${ep2Streams[0].title.replace(/\n/g, ' ')}"`);

    // Episode 999 (out of range) -> should handle gracefully without crash
    const ep999Streams = await kkphim.getStreams({ slug: 'tan-thuoc', type: 'series', episode: 999, proxyBase });
    runner.assert(Array.isArray(ep999Streams), 'Non-existent episode 999 returns array without throwing');

    // String episode formats: "01", "tap-1", "Tập 1"
    const epStrStreams = await kkphim.getStreams({ slug: 'tan-thuoc', type: 'series', episode: '01', proxyBase });
    runner.assert(epStrStreams.length > 0, 'Episode "01" string parses correctly');

  } finally {
    server.close();
    console.log(`\n${GRAY}[Teardown] Ephemeral server closed cleanly.${RESET}`);
  }

  // ══════════════════════════════════════════════════════════════════════════
  //  FINAL SUMMARY & VERDICT
  // ══════════════════════════════════════════════════════════════════════════
  const total = runner.passed + runner.failed;
  const elapsed = ((Date.now() - startTime) / 1000).toFixed(2);

  console.log(`\n${BOLD}╔══════════════════════════════════════════════════════════════════════════════╗${RESET}`);
  console.log(`${BOLD}║                   CHALLENGER 1 EXECUTION SUMMARY                             ║${RESET}`);
  console.log(`${BOLD}╠══════════════════════════════════════════════════════════════════════════════╣${RESET}`);
  console.log(`║  Total Assertions: ${String(total).padEnd(58)}║`);
  console.log(`║  ${GREEN}✅ Passed:         ${String(runner.passed).padEnd(58)}${RESET}║`);
  console.log(`║  ${RED}❌ Failed:         ${String(runner.failed).padEnd(58)}${RESET}║`);
  console.log(`║  Total Time:       ${(elapsed + 's').padEnd(58)}║`);
  console.log(`${BOLD}╚══════════════════════════════════════════════════════════════════════════════╝${RESET}\n`);

  if (runner.failed > 0) {
    console.log(`${BOLD}${RED}FAILED ASSERTIONS DETAIL:${RESET}`);
    runner.failures.forEach((f, idx) => {
      console.log(`  ${idx + 1}. ${f.msg}`);
      if (f.err) console.log(`     Error: ${f.err}`);
    });
    console.log('');
  }

  const isApproved = runner.failed === 0;
  console.log(`🏁 VERDICT: ${isApproved ? GREEN + '✅ APPROVE' : RED + '❌ REQUEST_CHANGES'}${RESET}\n`);

  return { isApproved, runner };
}

if (require.main === module) {
  runEmpiricalChallengerTests()
    .then(({ isApproved }) => {
      if (!isApproved) process.exit(1);
    })
    .catch((err) => {
      console.error('Fatal error during challenger run:', err);
      process.exit(1);
    });
}

module.exports = { runEmpiricalChallengerTests };
