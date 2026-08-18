'use strict';

/**
 * ============================================================
 *  VIP Movies Stremio Addon — tests/verify_taste_ui.js
 *  Verification suite for Taste-Skill Anti-Slop UI & Route Hydration
 * ============================================================
 */

const http = require('http');
const assert = require('assert');
const app = require('../src/index');
const { encodeConfig, decodeConfig, DEFAULT_CONFIG } = require('../src/config');

async function runTests() {
  console.log('\n╔══════════════════════════════════════════════════════════════════════════════╗');
  console.log('║  🎬 VIP MOVIES: TASTE-SKILL CYBER-GLASSMORHISM UI & HYDRATION TEST SUITE    ║');
  console.log('╚══════════════════════════════════════════════════════════════════════════════╝\n');

  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, resolve));
  const port = server.address().port;
  const baseUrl = `http://127.0.0.1:${port}`;

  let passed = 0;
  let total = 0;

  function check(desc, condition) {
    total++;
    if (condition) {
      console.log(`  ✅ PASS: ${desc}`);
      passed++;
    } else {
      console.error(`  ❌ FAIL: ${desc}`);
      throw new Error(`Assertion failed: ${desc}`);
    }
  }

  try {
    // ─── Test 1: GET / (Root Configurator) ──────────────────────────
    console.log('▶ PHASE 1: Root Configurator (GET /)');
    const resRoot = await fetch(`${baseUrl}/`);
    check('GET / returns HTTP 200', resRoot.status === 200);
    check('Content-Type is text/html; charset=utf-8', resRoot.headers.get('content-type') === 'text/html; charset=utf-8');
    const htmlRoot = await resRoot.text();

    check('OLED True Black base background defined', htmlRoot.includes('--bg-oled: #0b0d13'));
    check('3-Orb dynamic ambient mesh glow present', htmlRoot.includes('orb-indigo') && htmlRoot.includes('orb-pink') && htmlRoot.includes('orb-cyan'));
    check('140px blur on ambient orbs', htmlRoot.includes('filter: blur(140px)'));
    check('Plus Jakarta Sans font stack loaded', htmlRoot.includes('Plus+Jakarta+Sans'));
    check('JetBrains Mono font stack loaded', htmlRoot.includes('JetBrains+Mono'));
    check('Cinema Emblem 🎬 with emblemPulse animation', htmlRoot.includes('cinema-emblem') && htmlRoot.includes('emblemPulse'));
    check('Live status pill includes Server VIP Core Online · v1.5.2', htmlRoot.includes('Server VIP Core Online') && htmlRoot.includes('v1.5.2'));
    check('All 4 category pills present', htmlRoot.includes('id="cat-movie"') && htmlRoot.includes('id="cat-series"') && htmlRoot.includes('id="cat-cinema"') && htmlRoot.includes('id="cat-anime"'));
    check('Batch select pills present', htmlRoot.includes('selectAll()') && htmlRoot.includes('selectNone()'));
    check('VSMOV 4K flagship hero card with 1+6 Bento grid layout', htmlRoot.includes('provider-card vsmov vsmov-hero') && htmlRoot.includes('grid-column: 1 / -1'));
    check('All 7 provider cards rendered', htmlRoot.includes('id="card-vsmov"') && htmlRoot.includes('id="card-kkphim"') && htmlRoot.includes('id="card-nguonc"') && htmlRoot.includes('id="card-stp"') && htmlRoot.includes('id="card-hh3d"') && htmlRoot.includes('id="card-yan"') && htmlRoot.includes('id="card-clbpx"'));
    check('Spring-physics micro-switches cubic-bezier', htmlRoot.includes('cubic-bezier(0.34, 1.56, 0.64, 1)'));
    check('Floating action dock with 32px blur', htmlRoot.includes('floating-action-dock') && htmlRoot.includes('blur(32px)'));
    check('Stremio App deep-link CTA present', htmlRoot.includes('id="stremio-install-btn"'));
    check('Stremio Web CTA present', htmlRoot.includes('id="web-install-btn"'));
    check('Manifest copy button present in dock', htmlRoot.includes('id="dock-copy-btn"'));
    check('Personalized manifest card present', htmlRoot.includes('id="manifest-box"') && htmlRoot.includes('id="manifest-preview"'));
    check('Exact brand signature in footer', htmlRoot.includes('VIP Movies Addon v1.5.2 • Designed with Taste by <span class="brand-highlight">Q121101</span>'));

    // ─── Test 2: GET /configure Alias ──────────────────────────────
    console.log('\n▶ PHASE 2: Configurator Alias (GET /configure)');
    const resConfigure = await fetch(`${baseUrl}/configure`);
    check('GET /configure returns HTTP 200', resConfigure.status === 200);

    // ─── Test 3: GET /:config (Path Token Hydration) ───────────────
    console.log('\n▶ PHASE 3: Path Token Route & State Hydration (GET /:config)');
    const customConfig = {
      providers: ['vsmov', 'stp', 'clbpx'],
      categories: ['movie', 'series'],
      apiKey: 'test-vip-token-999',
    };
    const customToken = encodeConfig(customConfig);
    const resToken = await fetch(`${baseUrl}/${customToken}`);
    check('GET /:config returns HTTP 200', resToken.status === 200);
    const htmlToken = await resToken.text();

    check('API key pre-hydrated in input field', htmlToken.includes('value="test-vip-token-999"'));
    check('VSMOV 4K card pre-hydrated active', htmlToken.includes('provider-card vsmov vsmov-hero active'));
    check('STP card pre-hydrated active', htmlToken.includes('provider-card stp active'));
    check('CLBPX card pre-hydrated active', htmlToken.includes('provider-card clbpx active'));
    check('KKPhim card pre-hydrated inactive', !htmlToken.includes('provider-card kkphim active') && htmlToken.includes('provider-card kkphim '));
    check('NguonC card pre-hydrated inactive', !htmlToken.includes('provider-card nguonc active') && htmlToken.includes('provider-card nguonc '));
    check('Movie category pill pre-hydrated active', htmlToken.includes('action-pill active" id="cat-movie"'));
    check('Series category pill pre-hydrated active', htmlToken.includes('action-pill active" id="cat-series"'));
    check('Cinema category pill pre-hydrated inactive', !htmlToken.includes('action-pill active" id="cat-cinema"'));
    check('Anime category pill pre-hydrated inactive', !htmlToken.includes('action-pill active" id="cat-anime"'));
    check('Client script initialized with custom providers Set', htmlToken.includes(JSON.stringify(customConfig.providers)));
    check('Client script initialized with custom categories Set', htmlToken.includes(JSON.stringify(customConfig.categories)));

    // ─── Test 4: GET /:config/configure ────────────────────────────
    console.log('\n▶ PHASE 4: Path Token Configure Alias (GET /:config/configure)');
    const resTokenConfigure = await fetch(`${baseUrl}/${customToken}/configure`);
    check('GET /:config/configure returns HTTP 200', resTokenConfigure.status === 200);

    // ─── Test 5: Query String Config Hydration (GET /?config=...) ───
    console.log('\n▶ PHASE 5: Query Parameter Hydration (GET /?config=...)');
    const resQuery = await fetch(`${baseUrl}/?config=${customToken}`);
    check('GET /?config=... returns HTTP 200', resQuery.status === 200);
    const htmlQuery = await resQuery.text();
    check('API key pre-hydrated via query parameter', htmlQuery.includes('value="test-vip-token-999"'));

    // ─── Test 6: Non-Config Path Segment Passthrough ───────────────
    console.log('\n▶ PHASE 6: Non-Config Route Isolation & Passthrough');
    const resManifest = await fetch(`${baseUrl}/manifest.json`);
    check('GET /manifest.json returns HTTP 200 JSON', resManifest.status === 200 && resManifest.headers.get('content-type').includes('application/json'));
    const manifestJson = await resManifest.json();
    check('Manifest ID matches org.vipmovies.stremio.addon', manifestJson.id === 'org.vipmovies.stremio.addon');
    check('Manifest Version is 1.5.2', manifestJson.version === '1.5.2');

    const resConfigManifest = await fetch(`${baseUrl}/${customToken}/manifest.json`);
    check('GET /:config/manifest.json returns HTTP 200 JSON', resConfigManifest.status === 200 && resConfigManifest.headers.get('content-type').includes('application/json'));
    const configManifestJson = await resConfigManifest.json();
    check('Filtered manifest contains only catalogs from active providers & categories', configManifestJson.catalogs.length > 0);

    const resHealth = await fetch(`${baseUrl}/health`);
    check('GET /health returns HTTP 200 JSON', resHealth.status === 200);

    console.log('\n╔══════════════════════════════════════════════════════════════════════════════╗');
    console.log(`║      🎉 ALL ${passed}/${total} TASTE-SKILL UI & HYDRATION TESTS PASSED (100% SUCCESS)        ║`);
    console.log('╚══════════════════════════════════════════════════════════════════════════════╝\n');

  } finally {
    server.close();
  }
}

if (require.main === module) {
  runTests().catch((err) => {
    console.error('Test failed with error:', err);
    process.exit(1);
  });
}

module.exports = { runTests };
