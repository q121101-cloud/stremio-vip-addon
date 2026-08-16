/**
 * Multi-Genre E2E Test Suite
 * Tests all 4 genres: Cổ trang, K-Drama, Hollywood, Anime
 */
'use strict';
const axios = require('axios');
const B = 'http://localhost:7321';
const HLS_REFERER = 'https://phim.nguonc.com/';

// Color codes
const GREEN = '\x1b[32m'; const RED = '\x1b[31m'; const YELLOW = '\x1b[33m';
const CYAN = '\x1b[36m'; const RESET = '\x1b[0m'; const BOLD = '\x1b[1m';

let passed = 0, failed = 0, warned = 0;

function ok(label) { console.log(`  ${GREEN}✅ PASS${RESET} ${label}`); passed++; }
function fail(label) { console.log(`  ${RED}❌ FAIL${RESET} ${label}`); failed++; }
function warn(label) { console.log(`  ${YELLOW}⚠️  WARN${RESET} ${label}`); warned++; }
function info(label) { console.log(`  ${CYAN}ℹ️ ${RESET} ${label}`); }

async function findSlugByKeyword(keyword, filterSeries) {
  try {
    const r = await axios.get('https://phim.nguonc.com/api/films/search', {
      params: {keyword, page:1},
      headers: {'User-Agent':'Mozilla/5.0'},
      timeout: 8000
    });
    const items = r.data.items || [];
    const filtered = items.filter(i => {
      const ep = (i.current_episode||'').toUpperCase();
      if (filterSeries) return i.total_episodes > 1 && ep !== 'FULL';
      return ep === 'FULL' || i.total_episodes === 1;
    });
    return filtered[0] || items[0] || null;
  } catch { return null; }
}

async function getStreamAndTest(slug, type, epNameOrIdx, testLabel) {
  console.log(`\n${BOLD}${CYAN}══ ${testLabel} ══${RESET}`);
  info(`slug=${slug}  type=${type}  ep=${epNameOrIdx || 'FULL'}`);

  // Build Stremio ID
  let id = `nguonc:${slug}`;
  if (type === 'series' && epNameOrIdx) {
    id = `nguonc:${slug}:0:${encodeURIComponent(String(epNameOrIdx))}`;
  }

  // 1. Call /stream endpoint
  let streams;
  try {
    const sr = await axios.get(`${B}/stream/${type}/${id}.json`, {timeout: 40000});
    streams = sr.data.streams || [];
    if (streams.length > 0) ok(`/stream returned ${streams.length} streams`);
    else { fail('/stream returned 0 streams'); return; }
  } catch(e) {
    fail(`/stream failed: ${e.message}`);
    return;
  }

  // 2. Find direct & proxy streams
  const directS = streams.find(s => s.url && !s.url.includes('/hls/'));
  const proxyS  = streams.find(s => s.url && s.url.includes('/hls/'));

  info(`Direct streams: ${streams.filter(s=>s.url&&!s.url.includes('/hls/')).length}`);
  info(`Proxy streams:  ${streams.filter(s=>s.url&&s.url.includes('/hls/')).length}`);

  // 3. Test Direct CDN m3u8
  if (directS) {
    info(`Direct URL: ${directS.url.slice(0,80)}`);
    try {
      const referer = directS.behaviorHints?.proxyHeaders?.request?.Referer || HLS_REFERER;
      const mr = await axios.get(directS.url, {
        headers: { 'User-Agent': 'Mozilla/5.0', Referer: referer },
        timeout: 10000
      });
      const ct = mr.headers['content-type'] || '';
      const isM3u8 = ct.includes('mpegurl') || ct.includes('x-mpegurl') || String(mr.data).startsWith('#EXTM3U');
      if (mr.status === 200 && isM3u8) ok(`Direct CDN → HTTP 200 | Content-Type: ${ct}`);
      else if (mr.status === 200) warn(`Direct CDN → HTTP 200 but not M3U8 (${ct})`);
      else fail(`Direct CDN → HTTP ${mr.status}`);
    } catch(e) {
      if (e.response?.status === 403) warn(`Direct CDN → HTTP 403 (need proxy) — will test proxy`);
      else warn(`Direct CDN → ${e.message}`);
    }
  } else warn('No direct stream found');

  // 4. Test Proxy m3u8
  if (proxyS) {
    info(`Proxy URL: ${proxyS.url.slice(0,80)}`);
    try {
      const pr = await axios.get(proxyS.url, {timeout: 20000});
      const ct = pr.headers['content-type'] || '';
      const body = String(pr.data || '');
      const isM3u8 = ct.includes('mpegurl') || body.startsWith('#EXTM3U');
      if (pr.status === 200 && isM3u8) ok(`Proxy m3u8 → HTTP 200 | Content-Type: ${ct}`);
      else if (pr.status === 200) warn(`Proxy m3u8 → HTTP 200 but unexpected CT: ${ct}`);
      else fail(`Proxy m3u8 → HTTP ${pr.status}`);

      // 5. Test first segment via /hls/ts proxy
      const lines = body.split('\n');
      const segLine = lines.find(l => l.trim() && !l.startsWith('#') && l.includes('/hls/ts'));
      if (segLine) {
        info(`First proxy segment: ${segLine.slice(0,80)}`);
        try {
          const tr = await axios.get(segLine.trim(), {
            responseType: 'arraybuffer',
            timeout: 20000
          });
          const ct2 = tr.headers['content-type'] || '';
          const isVideo = ct2.includes('video') || ct2.includes('octet') || tr.data.byteLength > 1000;
          if (tr.status === 200 && isVideo)
            ok(`Proxy segment → HTTP 200 | ${ct2} | ${(tr.data.byteLength/1024).toFixed(1)}KB`);
          else if (tr.status === 200)
            warn(`Proxy segment → HTTP 200 but ${ct2} (${tr.data.byteLength} bytes)`);
          else fail(`Proxy segment → HTTP ${tr.status}`);
        } catch(e) { fail(`Proxy segment → ${e.message}`); }
      } else {
        // Try to get segment from the body directly (non-proxy URL)
        const rawSeg = lines.find(l => l.trim() && !l.startsWith('#'));
        if (rawSeg) {
          info(`First raw segment: ${rawSeg.slice(0,80)}`);
          try {
            const tr = await axios.get(rawSeg.trim(), {
              responseType: 'arraybuffer',
              headers: { 'User-Agent': 'Mozilla/5.0', Referer: HLS_REFERER },
              timeout: 15000
            });
            const ct2 = tr.headers['content-type'] || '';
            if (tr.status === 200) ok(`Raw segment → HTTP 200 | ${ct2} | ${(tr.data.byteLength/1024).toFixed(1)}KB`);
            else fail(`Raw segment → HTTP ${tr.status}`);
          } catch(e) { warn(`Raw segment → ${e.message}`); }
        }
      }
    } catch(e) { fail(`Proxy m3u8 → ${e.message}`); }
  } else warn('No proxy stream found');
}

async function main() {
  console.log(`\n${BOLD}╔════════════════════════════════════════════════════════╗${RESET}`);
  console.log(`${BOLD}║   🎬 VIP Movies Addon v1.3.1 — Multi-Genre E2E Test   ║${RESET}`);
  console.log(`${BOLD}╚════════════════════════════════════════════════════════╝${RESET}\n`);

  // ── Test 0: Manifest & Routes ─────────────────────────
  console.log(`${BOLD}${CYAN}══ [0] Manifest & Core Routes ══${RESET}`);
  const m = await axios.get(`${B}/manifest.json`).catch(e=>{fail('manifest: '+e.message);return null;});
  if (m) {
    if (m.data.version === '1.3.1') ok(`version = ${m.data.version}`);
    else fail(`version = ${m.data.version} (expected 1.3.1)`);
    ok(`catalogs: ${m.data.catalogs.length}`);
    const hasStream = m.data.resources.some(r => (r.name||r) === 'stream');
    if (hasStream) ok('stream resource declared'); else fail('stream resource missing');
  }

  const hlsM = await axios.get(`${B}/hls/m3u8`).catch(e=>e.response);
  if (hlsM?.status === 400) ok('/hls/m3u8 route exists (400 when no url)');
  else fail('/hls/m3u8 route missing or wrong status: ' + hlsM?.status);

  const hlsT = await axios.get(`${B}/hls/ts`).catch(e=>e.response);
  if (hlsT?.status === 400) ok('/hls/ts route exists (400 when no url)');
  else fail('/hls/ts route missing or wrong status: ' + hlsT?.status);

  // ── Genre 1: Phim Cổ Trang / Tiên Hiệp TQ ────────────
  const ancient = await findSlugByKeyword('tu tien', true)
    || await findSlugByKeyword('tieu dao', true)
    || {slug: 'ta-dao-thanh-than', name: 'Tà Đạo Thành Thần'};
  await getStreamAndTest(ancient.slug, 'series', '1',
    `[1] Phim Cổ Trang TQ: ${ancient.name}`);

  // ── Genre 2: K-Drama ─────────────────────────────────
  const kdrama = await findSlugByKeyword('han quoc tap', true)
    || await findSlugByKeyword('tinh yeu', true)
    || {slug: 'queen-of-tears', name: 'Nữ Hoàng Nước Mắt'};
  await getStreamAndTest(kdrama.slug, 'series', '1',
    `[2] K-Drama Hàn Quốc: ${kdrama.name}`);

  // ── Genre 3: Phim Hollywood (Movie Full) ─────────────
  const hollywood = await findSlugByKeyword('hanh dong my', false)
    || await findSlugByKeyword('chien tranh', false)
    || {slug: 'nu-hiep-ruy-bang', name: 'Nữ Hiệp Ruy Băng'};
  await getStreamAndTest(hollywood.slug, 'movie', null,
    `[3] Hollywood / Chiếu Rạp: ${hollywood.name}`);

  // ── Genre 4: Hoạt Hình / Anime ────────────────────────
  const anime = await findSlugByKeyword('hoat hinh trung quoc tap', true)
    || await findSlugByKeyword('anime', true)
    || {slug: 'dragon-ball-super', name: 'Dragon Ball Super'};
  await getStreamAndTest(anime.slug, 'series', '1',
    `[4] Hoạt Hình / Anime: ${anime.name}`);

  // ── Summary ─────────────────────────────────────────
  console.log(`\n${BOLD}╔════════════════════════════════════════════════════════╗${RESET}`);
  console.log(`${BOLD}║              TEST SUITE SUMMARY                        ║${RESET}`);
  console.log(`${BOLD}╠════════════════════════════════════════════════════════╣${RESET}`);
  console.log(`  ${GREEN}✅ PASSED: ${passed}${RESET}`);
  console.log(`  ${YELLOW}⚠️  WARNED: ${warned}${RESET}`);
  console.log(`  ${RED}❌ FAILED: ${failed}${RESET}`);
  console.log(`${BOLD}╚════════════════════════════════════════════════════════╝${RESET}\n`);

  if (failed > 0) process.exit(1);
}

main().catch(e => { console.error('\nFATAL:', e.message); process.exit(1); });
