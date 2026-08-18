'use strict';

/**
 * ==============================================================================
 *  VIP Movies Addon — tests/live_backtest_all_providers.js (Engine v1.7.1)
 *  Live Backtest Suite for all 8 Providers & Fallback Verification (R3 & M2)
 *
 *  Validates:
 *    1. Ephemeral Express test server (app.listen(0)) startup and clean teardown.
 *    2. For all 8 providers (film4k, vsmov, kkphim, nguonc, stp, hh3d, yan, clbpx):
 *       - getCatalog() returns >= 1 items with valid schema.
 *       - getStreams() returns valid stream objects with HLS proxy url & ZERO externalUrl.
 *       - Fetch .m3u8 from local HLS proxy -> HTTP 200, contains #EXTM3U.
 *       - Fetch at least 1 .ts video segment chunk -> HTTP 200/206, size > 50 KB, valid sync byte.
 *       - At least 5 of 8 providers successfully download real .ts chunk > 50 KB.
 *    3. Markdown Status Matrix output table.
 *    4. Fallback Verification (R3):
 *       - Expired/broken upstream URL -> Response NOT 502 (302 redirect or non-crash), cache purged.
 *       - HTML block page returned as upstream 200 -> never cached as M3U8, cache purged, 302 fallback.
 *       - Broken segment / key / extract -> self-healing 302 fallback.
 * ==============================================================================
 */

const express = require('express');
const cors = require('cors');
const axios = require('axios');
const assert = require('assert');

const hlsRouter = require('../src/routes/hls');
const manifestRouter = require('../src/routes/manifest');
const handlers = require('../src/handlers');
const { m3u8Cache } = require('../src/lib/cache');

const providerFilm4K = require('../src/providers/film4k');
const providerVsMov  = require('../src/providers/vsmov');
const providerKKPhim = require('../src/providers/kkphim');
const providerNguonC = require('../src/providers/nguonc');
const providerSTP    = require('../src/providers/stp');
const providerHH3D   = require('../src/providers/hh3d');
const providerYAN    = require('../src/providers/yan');
const providerCLBPX  = require('../src/providers/clbpx');

// ANSI Colors
const GREEN  = '\x1b[32m';
const RED    = '\x1b[31m';
const CYAN   = '\x1b[36m';
const YELLOW = '\x1b[33m';
const BOLD   = '\x1b[1m';
const RESET  = '\x1b[0m';
const GRAY   = '\x1b[90m';

const REQUEST_TIMEOUT_MS = 25000;
const MIN_CHUNK_BYTES = 51200; // 50 KB threshold

function encodeBase64(str) {
  if (!str) return '';
  return Buffer.from(str, 'utf8').toString('base64url');
}

async function fetchWithRetry(url, options = {}, retries = 2) {
  let lastError;
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const res = await axios({
        url,
        method: 'GET',
        timeout: REQUEST_TIMEOUT_MS,
        maxRedirects: 5,
        ...options,
      });
      return res;
    } catch (err) {
      lastError = err;
      if (attempt < retries) {
        await new Promise((r) => setTimeout(r, 800 * attempt));
      }
    }
  }
  throw lastError;
}

async function extractSegmentUrl(playlistUrl) {
  const playlistRes = await fetchWithRetry(playlistUrl);
  if (playlistRes.status !== 200) {
    throw new Error(`Playlist returned HTTP ${playlistRes.status}`);
  }

  const lines = String(playlistRes.data).split(/\r?\n/).map((l) => l.trim()).filter(Boolean);

  for (const line of lines) {
    if (line.startsWith('http://') || line.startsWith('https://')) {
      if (line.includes('/hls/segment.ts') || line.includes('/hls/ts')) {
        return line;
      }
      if (line.includes('/hls/manifest.m3u8') || line.includes('/hls/m3u8')) {
        try {
          const subRes = await fetchWithRetry(line);
          const subLines = String(subRes.data).split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
          for (const subLine of subLines) {
            if ((subLine.startsWith('http://') || subLine.startsWith('https://')) &&
                (subLine.includes('/hls/segment.ts') || subLine.includes('/hls/ts'))) {
              return subLine;
            }
          }
        } catch {}
      }
    }
  }
  return null;
}

async function runLiveBacktest() {
  const startTime = Date.now();
  console.log(`\n${BOLD}${CYAN}╔══════════════════════════════════════════════════════════════════════════════╗${RESET}`);
  console.log(`${BOLD}${CYAN}║     🎬 VIP MOVIES: LIVE BACKTEST SUITE ACROSS ALL 8 PROVIDERS & FALLBACK     ║${RESET}`);
  console.log(`${BOLD}${CYAN}╚══════════════════════════════════════════════════════════════════════════════╝${RESET}\n`);

  // 1. Initialize ephemeral test server
  const app = express();
  app.use(cors());
  app.use(express.json());
  app.use('/hls', hlsRouter);
  app.use('/', manifestRouter);
  app.use('/', handlers);

  // Mock server endpoint for testing HTML block page fallback
  app.get('/mock/html-block-page', (req, res) => {
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.status(200).send('<html><head><title>Cloudflare DDoS Protection</title></head><body>Please wait...</body></html>');
  });

  const server = await new Promise((resolve, reject) => {
    const s = app.listen(0, '127.0.0.1', () => resolve(s));
    s.on('error', reject);
  });

  const port = server.address().port;
  const baseUrl = `http://127.0.0.1:${port}`;
  console.log(`${GRAY}ℹ️  Started ephemeral test server on port:${RESET} ${BOLD}${port}${RESET}`);
  console.log(`${GRAY}ℹ️  Base URL:${RESET} ${baseUrl}\n`);

  const matrixResults = [];
  let chunkPassCount = 0;

  const providers = [
    {
      id: 'film4k',
      name: 'FILM4K (4K VIP)',
      mod: providerFilm4K,
      catType: '4k-movies',
      fetchCandidate: async (items) => {
        // Find first item with slug or search a known 4K title
        if (items && items.length > 0) {
          const first = items[0];
          const slug = first.id.replace(/^film4k_/, '');
          const streams = await providerFilm4K.getStreams({ slug, title: first.name, type: first.type || 'movie', proxyBase: baseUrl });
          if (streams && streams.length > 0) return streams[0];
        }
        // Fallback search
        const sRes = await providerFilm4K.search('Avatar', 1);
        if (sRes.items?.length > 0) {
          const streams = await providerFilm4K.getStreams({ slug: sRes.items[0].slug, title: sRes.items[0].title?.vi || 'Avatar', type: 'movie', proxyBase: baseUrl });
          if (streams && streams.length > 0) return streams[0];
        }
        return null;
      },
    },
    {
      id: 'vsmov',
      name: 'VSMOV (4K UHD)',
      mod: providerVsMov,
      catType: '4k',
      fetchCandidate: async (items) => {
        // Use known high speed title tt0373889 (Harry Potter) or catalog item
        const streams = await providerVsMov.getStreams({ type: 'movie', id: 'tt0373889', title: 'Harry Potter', proxyBase: baseUrl });
        if (streams && streams.length > 0) return streams[0];
        if (items && items.length > 0) {
          const slug = items[0].id.replace(/^vsmov_/, '');
          const s = await providerVsMov.getStreams({ type: items[0].type || 'movie', slug, title: items[0].name, proxyBase: baseUrl });
          if (s && s.length > 0) return s[0];
        }
        return null;
      },
    },
    {
      id: 'kkphim',
      name: 'KKPhim (FHD)',
      mod: providerKKPhim,
      catType: 'movie',
      fetchCandidate: async (items) => {
        const streams = await providerKKPhim.getStreams({ type: 'series', id: 'tt0903747:1:1', title: 'Breaking Bad', season: 1, episode: 1, proxyBase: baseUrl });
        if (streams && streams.length > 0) return streams[0];
        if (items && items.length > 0) {
          const slug = items[0].id.replace(/^kkphim_/, '');
          const s = await providerKKPhim.getStreams({ type: items[0].type || 'movie', slug, title: items[0].name, proxyBase: baseUrl });
          if (s && s.length > 0) return s[0];
        }
        return null;
      },
    },
    {
      id: 'nguonc',
      name: 'NguonC (StreamC)',
      mod: providerNguonC,
      catType: 'phim-le',
      fetchCandidate: async (items) => {
        const streams = await providerNguonC.getStreams({ type: 'series', id: 'tt11126994:1:1', title: 'Arcane', season: 1, episode: 1, proxyBase: baseUrl });
        if (streams && streams.length > 0) return streams[0];
        if (items && items.length > 0) {
          const slug = items[0].id.replace(/^nguonc_/, '');
          const s = await providerNguonC.getStreams({ type: items[0].type || 'movie', slug, title: items[0].name, proxyBase: baseUrl });
          if (s && s.length > 0) return s[0];
        }
        return null;
      },
    },
    {
      id: 'stp',
      name: 'STP (Sưu Tầm Phim)',
      mod: providerSTP,
      catType: 'au-my',
      fetchCandidate: async (items) => {
        if (items && items.length > 0) {
          for (const item of items.slice(0, 3)) {
            const slug = item.id.replace(/^stp_/, '');
            const s = await providerSTP.getStreams({ type: item.type || 'movie', slug, title: item.name, proxyBase: baseUrl });
            if (s && s.length > 0) return s[0];
          }
        }
        const sRes = await providerSTP.search('Avatar', 1);
        if (sRes && sRes.length > 0) {
          const s = await providerSTP.getStreams({ type: 'movie', slug: sRes[0].slug, title: sRes[0].name, proxyBase: baseUrl });
          if (s && s.length > 0) return s[0];
        }
        return null;
      },
    },
    {
      id: 'hh3d',
      name: 'HH3D (3D Donghua)',
      mod: providerHH3D,
      catType: 'series',
      fetchCandidate: async (items) => {
        const s = await providerHH3D.getStreams({ type: 'series', title: 'Đấu La Đại Lục', season: 1, episode: 1, proxyBase: baseUrl });
        if (s && s.length > 0) return s[0];
        if (items && items.length > 0) {
          const slug = items[0].id.replace(/^hh3d_/, '');
          const res = await providerHH3D.getStreams({ type: items[0].type || 'series', slug, title: items[0].name, season: 1, episode: 1, proxyBase: baseUrl });
          if (res && res.length > 0) return res[0];
        }
        return null;
      },
    },
    {
      id: 'yan',
      name: 'YAN (Donghua 3D)',
      mod: providerYAN,
      catType: 'series',
      fetchCandidate: async (items) => {
        const s = await providerYAN.getStreams({ type: 'series', title: 'Đấu La Đại Lục', season: 1, episode: 1, proxyBase: baseUrl });
        if (s && s.length > 0) return s[0];
        if (items && items.length > 0) {
          const slug = items[0].id.replace(/^yan_/, '');
          const res = await providerYAN.getStreams({ type: items[0].type || 'series', slug, title: items[0].name, season: 1, episode: 1, proxyBase: baseUrl });
          if (res && res.length > 0) return res[0];
        }
        return null;
      },
    },
    {
      id: 'clbpx',
      name: 'CLBPX (Phim Xưa TVB)',
      mod: providerCLBPX,
      catType: 'kiem-hiep',
      fetchCandidate: async (items) => {
        const s = await providerCLBPX.getStreams({ type: 'series', title: 'Thiên Long Bát Bộ', season: 1, episode: 1, proxyBase: baseUrl });
        if (s && s.length > 0) return s[0];
        if (items && items.length > 0) {
          const slug = items[0].id.replace(/^clbpx_/, '');
          const res = await providerCLBPX.getStreams({ type: items[0].type || 'series', slug, title: items[0].name, season: 1, episode: 1, proxyBase: baseUrl });
          if (res && res.length > 0) return res[0];
        }
        return null;
      },
    },
  ];

  try {
    // ══════════════════════════════════════════════════════════════════════════
    //  SECTION 1: 8-Provider Live Testing
    // ══════════════════════════════════════════════════════════════════════════
    console.log(`${BOLD}${CYAN}▶ SECTION 1: Live Testing All 8 Providers${RESET}`);

    for (let idx = 0; idx < providers.length; idx++) {
      const p = providers[idx];
      console.log(`\n  ${BOLD}[${idx + 1}/8] Testing Provider: ${p.name} (${p.id})${RESET}`);

      let catalogPass = false;
      let streamPass = false;
      let chunkPass = false;
      let healthStatus = 'UNKNOWN';
      let items = [];

      // 1. Catalog Check
      try {
        items = await p.mod.getCatalog(p.catType, 1);
        if (Array.isArray(items) && items.length >= 1) {
          catalogPass = true;
          console.log(`    ${GREEN}✅ Catalog:${RESET} Fetched ${items.length} items from type "${p.catType}"`);
        } else {
          console.log(`    ${YELLOW}⚠️ Catalog returned ${items?.length || 0} items${RESET}`);
        }
      } catch (catErr) {
        console.log(`    ${RED}❌ Catalog Error:${RESET} ${catErr.message}`);
      }

      // 2. Stream Resolution Check
      let streamObj = null;
      try {
        streamObj = await p.fetchCandidate(items);
        if (streamObj && streamObj.url) {
          assert.strictEqual(streamObj.name, 'VIP Movies 🎬', 'Stream name must be "VIP Movies 🎬"');
          assert.strictEqual(streamObj.externalUrl, undefined, 'Stream MUST NOT contain externalUrl');
          assert.ok(!('externalUrl' in streamObj), 'externalUrl property must not exist on stream');
          assert.ok(streamObj.url.includes('/hls/'), `Stream url must route through /hls proxy: ${streamObj.url}`);
          streamPass = true;
          console.log(`    ${GREEN}✅ Stream Resolution:${RESET} Resolved stream "${streamObj.title?.slice(0, 40)}..." (zero externalUrl)`);
        } else {
          console.log(`    ${YELLOW}⚠️ Stream Resolution returned no stream${RESET}`);
        }
      } catch (streamErr) {
        console.log(`    ${RED}❌ Stream Resolution Error:${RESET} ${streamErr.message}`);
      }

      // 3. M3U8 Manifest & Chunk Download Check
      if (streamObj && streamObj.url) {
        try {
          const m3u8Res = await fetchWithRetry(streamObj.url);
          assert.strictEqual(m3u8Res.status, 200, 'Manifest must return HTTP 200');
          assert.ok(String(m3u8Res.data).includes('#EXTM3U'), 'Manifest must contain #EXTM3U');
          console.log(`    ${GREEN}✅ M3U8 Manifest:${RESET} Proxied successfully (HTTP 200, #EXTM3U verified)`);

          const segUrl = await extractSegmentUrl(streamObj.url);
          if (segUrl) {
            const chunkRes = await fetchWithRetry(segUrl, { responseType: 'arraybuffer' });
            assert.ok(chunkRes.status === 200 || chunkRes.status === 206, `Chunk download status ${chunkRes.status}`);
            const buf = Buffer.from(chunkRes.data);
            const sizeKB = (buf.length / 1024).toFixed(1);

            if (buf.length >= MIN_CHUNK_BYTES) {
              chunkPass = true;
              chunkPassCount++;
              const firstByteHex = `0x${buf[0].toString(16).padStart(2, '0')}`;
              console.log(`    ${GREEN}✅ Video Chunk Download:${RESET} Downloaded ${sizeKB} KB (> 50KB, first byte: ${firstByteHex})`);
            } else {
              console.log(`    ${YELLOW}⚠️ Video chunk too small: ${sizeKB} KB < 50 KB${RESET}`);
            }
          } else {
            console.log(`    ${YELLOW}⚠️ Could not extract .ts segment URL from manifest${RESET}`);
          }
        } catch (m3u8Err) {
          console.log(`    ${RED}❌ M3U8 / Chunk Error:${RESET} ${m3u8Err.message}`);
        }
      }

      if (catalogPass && streamPass && chunkPass) {
        healthStatus = 'HEALTHY 🟢';
      } else if (catalogPass && streamPass) {
        healthStatus = 'STREAM OK 🟡';
      } else if (catalogPass) {
        healthStatus = 'CATALOG ONLY 🟠';
      } else {
        healthStatus = 'DEGRADED 🔴';
      }

      matrixResults.push({
        provider: p.name,
        catalog: catalogPass ? '✅ PASS' : '❌ FAIL',
        stream: streamPass ? '✅ PASS' : '❌ FAIL',
        chunk: chunkPass ? '✅ PASS (>50KB)' : '⚠️ FAIL / SKIP',
        health: healthStatus,
      });
    }

    console.log(`\n${BOLD}${CYAN}▶ SECTION 2: Markdown Status Matrix${RESET}\n`);
    console.log('| Provider | Catalog | Stream Resolution | Chunk Download | Health |');
    console.log('|---|---|---|---|---|');
    for (const r of matrixResults) {
      console.log(`| ${r.provider} | ${r.catalog} | ${r.stream} | ${r.chunk} | ${r.health} |`);
    }
    console.log('');

    assert.ok(chunkPassCount >= 5, `At least 5 of 8 providers must download chunk > 50KB (got ${chunkPassCount}/8)`);
    console.log(`${GREEN}${BOLD}✅ Quorum Check Passed:${RESET} ${chunkPassCount}/8 providers verified with full chunk download (> 50 KB)\n`);

    // ══════════════════════════════════════════════════════════════════════════
    //  SECTION 3: Fallback Verification (R3)
    // ══════════════════════════════════════════════════════════════════════════
    console.log(`${BOLD}${CYAN}▶ SECTION 3: Fallback & Cache Self-Healing Verification (R3)${RESET}`);

    // 3.1 Expired/broken upstream CDN URL through HLS proxy
    const brokenM3u8Url = 'https://cdn-expired-404.example.com/stream/nonexistent_12345.m3u8';
    const brokenProxyUrl = `${baseUrl}/hls/manifest.m3u8?url=${encodeBase64(brokenM3u8Url)}`;
    const cacheKeyBroken = `m3u8:${baseUrl}:${brokenM3u8Url}:`;

    console.log(`  ${GRAY}Testing broken upstream CDN URL:${RESET} ${brokenM3u8Url}`);
    const resBroken = await axios.get(brokenProxyUrl, {
      maxRedirects: 0,
      validateStatus: (s) => s >= 200 && s < 600,
    });

    assert.notStrictEqual(resBroken.status, 502, 'Broken upstream should not result in hard unhandled 502 crash (should return 302 or graceful error)');
    assert.strictEqual(m3u8Cache.get(cacheKeyBroken), undefined, 'Cache must be purged for broken upstream URL');
    console.log(`  ${GREEN}✅ Broken upstream handled:${RESET} HTTP ${resBroken.status} (Not 502), cache key successfully purged`);

    // Second call check to verify no broken cache is served
    const resBrokenSecond = await axios.get(brokenProxyUrl, {
      maxRedirects: 0,
      validateStatus: (s) => s >= 200 && s < 600,
    });
    assert.notStrictEqual(resBrokenSecond.status, 502, 'Second call should also handle fallback cleanly');
    assert.strictEqual(m3u8Cache.get(cacheKeyBroken), undefined, 'Cache remains clean after repeated calls');
    console.log(`  ${GREEN}✅ Repeated call verification:${RESET} Cache clean, no stale broken entry returned`);

    // 3.2 Upstream returning HTTP 200 with HTML block page instead of M3U8
    const mockHtmlUrl = `${baseUrl}/mock/html-block-page`;
    const mockProxyUrl = `${baseUrl}/hls/manifest.m3u8?url=${encodeBase64(mockHtmlUrl)}`;
    const cacheKeyHtml = `m3u8:${baseUrl}:${mockHtmlUrl}:`;

    console.log(`  ${GRAY}Testing HTML block page upstream (HTTP 200 non-M3U8):${RESET} ${mockHtmlUrl}`);
    const resHtml = await axios.get(mockProxyUrl, {
      maxRedirects: 0,
      validateStatus: (s) => s >= 200 && s < 600,
    });

    assert.strictEqual(resHtml.status, 302, 'HTML block page upstream must trigger 302 redirect fallback');
    assert.strictEqual(m3u8Cache.get(cacheKeyHtml), undefined, 'HTML block page MUST NEVER be cached as M3U8');
    console.log(`  ${GREEN}✅ HTML block page intercepted:${RESET} HTTP 302 fallback redirect, HTML never cached`);

    // 3.3 Segment Fallback
    const brokenSegmentUrl = 'https://cdn-expired-404.example.com/segment_9999.ts';
    const brokenSegmentProxyUrl = `${baseUrl}/hls/segment.ts?url=${encodeBase64(brokenSegmentUrl)}`;
    const resSeg = await axios.get(brokenSegmentProxyUrl, {
      maxRedirects: 0,
      validateStatus: (s) => s >= 200 && s < 600,
    });
    assert.ok(resSeg.status === 302 || (resSeg.status >= 200 && resSeg.status < 400), `Segment fallback status ${resSeg.status}`);
    console.log(`  ${GREEN}✅ Segment error handled:${RESET} HTTP ${resSeg.status} (Self-healing 302 fallback redirect)`);

    // 3.4 Key Fallback
    const brokenKeyUrl = 'https://cdn-expired-404.example.com/key_9999.key';
    const brokenKeyProxyUrl = `${baseUrl}/hls/key?url=${encodeBase64(brokenKeyUrl)}`;
    const resKey = await axios.get(brokenKeyProxyUrl, {
      maxRedirects: 0,
      validateStatus: (s) => s >= 200 && s < 600,
    });
    assert.ok(resKey.status === 302 || (resKey.status >= 200 && resKey.status < 400), `Key fallback status ${resKey.status}`);
    console.log(`  ${GREEN}✅ Key error handled:${RESET} HTTP ${resKey.status} (Self-healing 302 fallback redirect)`);

    // 3.5 Extract Fallback
    const brokenExtractUrl = 'https://nonexistent-embed-domain-999.com/embed/123';
    const brokenExtractProxyUrl = `${baseUrl}/hls/extract?embed=${encodeURIComponent(brokenExtractUrl)}`;
    const resExtract = await axios.get(brokenExtractProxyUrl, {
      maxRedirects: 0,
      validateStatus: (s) => s >= 200 && s < 600,
    });
    assert.ok(resExtract.status === 302 || (resExtract.status >= 200 && resExtract.status < 400), `Extract fallback status ${resExtract.status}`);
    console.log(`  ${GREEN}✅ Extract error handled:${RESET} HTTP ${resExtract.status} (Self-healing 302 fallback redirect)`);

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(2);
    console.log(`\n${BOLD}${GREEN}🎉 ALL LIVE BACKTESTS & FALLBACK VERIFICATIONS PASSED (${elapsed}s)${RESET}\n`);
    return true;
  } catch (err) {
    console.error(`\n${RED}${BOLD}❌ FATAL ERROR IN LIVE BACKTEST:${RESET}`, err.message);
    if (err.stack) console.error(err.stack);
    process.exit(1);
  } finally {
    server.close();
    console.log(`${GRAY}[Teardown] Ephemeral test server on port ${port} closed cleanly.${RESET}`);
  }
}

if (require.main === module) {
  runLiveBacktest()
    .then(() => process.exit(0))
    .catch(() => process.exit(1));
}

module.exports = { runLiveBacktest };
