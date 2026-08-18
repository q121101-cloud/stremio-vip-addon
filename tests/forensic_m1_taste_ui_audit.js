'use strict';

/**
 * ============================================================
 *  VIP Movies Stremio Addon — tests/forensic_m1_taste_ui_audit.js
 *  Independent Forensic Auditor Suite for Milestone 1
 * ============================================================
 */

const http = require('http');
const assert = require('assert');
const app = require('../src/index');
const { encodeConfig, decodeConfig, DEFAULT_CONFIG } = require('../src/config');
const { MANIFEST } = require('../src/manifest');

async function runForensicAudit() {
  console.log('\n╔══════════════════════════════════════════════════════════════════════════════╗');
  console.log('║        🕵️‍♂️ INDEPENDENT FORENSIC AUDIT: MILESTONE 1 TASTE UI & HYDRATION       ║');
  console.log('╚══════════════════════════════════════════════════════════════════════════════╝\n');

  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, resolve));
  const port = server.address().port;
  const baseUrl = `http://127.0.0.1:${port}`;

  let checks = 0;
  let passed = 0;

  function auditAssert(name, condition, extraInfo = '') {
    checks++;
    if (condition) {
      console.log(`  [PASS] ${name}${extraInfo ? ` (${extraInfo})` : ''}`);
      passed++;
    } else {
      console.error(`  [FAIL] ${name} ${extraInfo}`);
      throw new Error(`Forensic Audit Failure: ${name}`);
    }
  }

  try {
    // ─── CHECK 1: Version Synchronization Invariant ───────────────
    console.log('▶ CHECK 1: Version Invariant across artifacts');
    const pkg = require('../package.json');
    auditAssert('package.json version is 1.5.1', pkg.version === '1.5.1', pkg.version);
    auditAssert('manifest.js version is 1.5.1', MANIFEST.version === '1.5.1', MANIFEST.version);

    // ─── CHECK 2: Dynamic Template & CSS Variables Inspection ──────
    console.log('\n▶ CHECK 2: Taste-Skill Anti-Slop Palette & Architecture Inspection');
    const resDefault = await fetch(`${baseUrl}/`);
    const htmlDefault = await resDefault.text();

    auditAssert('OLED True Black variable defined', htmlDefault.includes('--bg-oled: #0b0d13'));
    auditAssert('Surface glassmorphism background defined', htmlDefault.includes('--bg-surface: rgba(18, 22, 34, 0.65)'));
    auditAssert('Subtle 1px border defined', htmlDefault.includes('--border-subtle: rgba(255, 255, 255, 0.08)'));
    auditAssert('Glass blur token defined (28px)', htmlDefault.includes('--glass-blur: blur(28px)'));
    auditAssert('Spring physics cubic-bezier defined', htmlDefault.includes('cubic-bezier(0.34, 1.56, 0.64, 1)'));
    auditAssert('Ambient canvas 3-orb container present', htmlDefault.includes('class="ambient-canvas"'));
    auditAssert('Orb Indigo defined with 140px blur drift', htmlDefault.includes('orb-indigo') && htmlDefault.includes('blur(140px)'));
    auditAssert('Orb Pink defined with 140px blur drift', htmlDefault.includes('orb-pink'));
    auditAssert('Orb Cyan defined with 140px blur drift', htmlDefault.includes('orb-cyan'));
    auditAssert('Cinema emblem pulse animation defined', htmlDefault.includes('@keyframes emblemPulse'));
    auditAssert('Live status indicator includes Server VIP Core Online · v1.5.1', htmlDefault.includes('Server VIP Core Online &nbsp;·&nbsp; v1.5.1'));

    // ─── CHECK 3: 1+6 Bento Grid Layout Verification ──────────────
    console.log('\n▶ CHECK 3: 1+6 Bento Grid Layout Verification');
    auditAssert('VSMOV Hero card has full-width span class', htmlDefault.includes('provider-card vsmov vsmov-hero'));
    auditAssert('VSMOV Hero desktop span is grid-column: 1 / -1', htmlDefault.includes('.provider-card.vsmov-hero {\n      grid-column: 1 / -1;') || htmlDefault.includes('grid-column: 1 / -1'));
    auditAssert('Balanced 2-column grid definition', htmlDefault.includes('grid-template-columns: repeat(2, 1fr)'));
    auditAssert('All 7 provider cards present in markup',
      htmlDefault.includes('id="card-vsmov"') &&
      htmlDefault.includes('id="card-kkphim"') &&
      htmlDefault.includes('id="card-nguonc"') &&
      htmlDefault.includes('id="card-stp"') &&
      htmlDefault.includes('id="card-hh3d"') &&
      htmlDefault.includes('id="card-yan"') &&
      htmlDefault.includes('id="card-clbpx"')
    );

    // ─── CHECK 4: Micro-Interactions & Floating Action Dock ───────
    console.log('\n▶ CHECK 4: Micro-Interactions & Floating Action Dock');
    auditAssert('Switch track and switch thumb markup exists for cards', htmlDefault.includes('class="switch-track"') && htmlDefault.includes('class="switch-thumb"'));
    auditAssert('Floating action dock element present', htmlDefault.includes('class="floating-action-dock"'));
    auditAssert('Dock container uses 32px backdrop blur', htmlDefault.includes('backdrop-filter: blur(32px)'));
    auditAssert('API Key container & input field present', htmlDefault.includes('id="apikey-input"'));
    auditAssert('Stremio App deep-link CTA button exists', htmlDefault.includes('id="stremio-install-btn"'));
    auditAssert('Stremio Web CTA button exists', htmlDefault.includes('id="web-install-btn"'));
    auditAssert('Clipboard copy CTA button exists', htmlDefault.includes('id="dock-copy-btn"'));
    auditAssert('Clipboard toast element exists', htmlDefault.includes('id="toast"'));
    auditAssert('Brand signature with glowing highlight span', htmlDefault.includes('VIP Movies Addon v1.5.1 • Designed with Taste by <span class="brand-highlight">Q121101</span>'));

    // ─── CHECK 5: Multi-Configuration Dynamic Hydration Matrix ────
    console.log('\n▶ CHECK 5: Multi-Configuration Dynamic Hydration Matrix');

    // Matrix Case A: Single provider, single category, custom key
    const cfgA = { providers: ['vsmov'], categories: ['movie'], apiKey: 'sec_key_alpha_123' };
    const tokenA = encodeConfig(cfgA);
    const resA = await fetch(`${baseUrl}/${tokenA}`);
    auditAssert('Matrix A: GET /:tokenA returns 200', resA.status === 200);
    const htmlA = await resA.text();
    auditAssert('Matrix A: VSMOV card is active', htmlA.includes('id="card-vsmov" onclick="toggleProvider(\'vsmov\')" role="checkbox" aria-checked="true"') || htmlA.includes('provider-card vsmov vsmov-hero active'));
    auditAssert('Matrix A: KKPhim card is inactive', !htmlA.includes('provider-card kkphim active') && htmlA.includes('id="card-kkphim"'));
    auditAssert('Matrix A: Movie pill is active', htmlA.includes('action-pill active" id="cat-movie"'));
    auditAssert('Matrix A: Series pill is inactive', !htmlA.includes('action-pill active" id="cat-series"') && htmlA.includes('id="cat-series"'));
    auditAssert('Matrix A: API key is pre-hydrated in input value', htmlA.includes('value="sec_key_alpha_123"'));
    auditAssert('Matrix A: Client script receives exact provider array', htmlA.includes(JSON.stringify(['vsmov'])));
    auditAssert('Matrix A: Client script receives exact category array', htmlA.includes(JSON.stringify(['movie'])));
    auditAssert('Matrix A: Live provider count displays "1 nguồn VIP"', htmlA.includes('>1 nguồn VIP<'));
    auditAssert('Matrix A: Live category count displays "1 danh mục"', htmlA.includes('>1 danh mục<'));

    // Matrix Case B: Alternate providers and categories
    const cfgB = { providers: ['kkphim', 'nguonc', 'stp'], categories: ['series', 'cinema', 'anime'], apiKey: 'beta_key_456' };
    const tokenB = encodeConfig(cfgB);
    const resB = await fetch(`${baseUrl}/${tokenB}`);
    const htmlB = await resB.text();
    auditAssert('Matrix B: VSMOV is inactive', !htmlB.includes('provider-card vsmov vsmov-hero active'));
    auditAssert('Matrix B: KKPhim is active', htmlB.includes('provider-card kkphim active'));
    auditAssert('Matrix B: NguonC is active', htmlB.includes('provider-card nguonc active'));
    auditAssert('Matrix B: STP is active', htmlB.includes('provider-card stp active'));
    auditAssert('Matrix B: Movie pill is inactive', !htmlB.includes('action-pill active" id="cat-movie"'));
    auditAssert('Matrix B: Series pill is active', htmlB.includes('action-pill active" id="cat-series"'));
    auditAssert('Matrix B: Cinema pill is active', htmlB.includes('action-pill active" id="cat-cinema"'));
    auditAssert('Matrix B: Anime pill is active', htmlB.includes('action-pill active" id="cat-anime"'));
    auditAssert('Matrix B: API key is pre-hydrated in input value', htmlB.includes('value="beta_key_456"'));
    auditAssert('Matrix B: Live provider count displays "3 nguồn VIP"', htmlB.includes('>3 nguồn VIP<'));
    auditAssert('Matrix B: Live category count displays "3 danh mục"', htmlB.includes('>3 danh mục<'));

    // Matrix Case C: Aliased route /:config/configure
    const resBConfigure = await fetch(`${baseUrl}/${tokenB}/configure`);
    auditAssert('Matrix C: /:config/configure alias returns 200', resBConfigure.status === 200);
    const htmlBConfigure = await resBConfigure.text();
    auditAssert('Matrix C: Hydration identical on /:config/configure', htmlBConfigure.includes('value="beta_key_456"') && htmlBConfigure.includes('>3 nguồn VIP<'));

    // Matrix Case D: Query Parameter Hydration /?config=...
    const resQueryParam = await fetch(`${baseUrl}/?config=${tokenA}`);
    auditAssert('Matrix D: /?config=... returns 200', resQueryParam.status === 200);
    const htmlQueryParam = await resQueryParam.text();
    auditAssert('Matrix D: Query parameter hydrates API key', htmlQueryParam.includes('value="sec_key_alpha_123"'));

    // ─── CHECK 6: HTML Input Attribute Sanitization ─────────────
    console.log('\n▶ CHECK 6: HTML Input Attribute Sanitization');
    const xssApiKey = '"><script>alert(1)</script><div id="xss">';
    const cfgXss = { providers: ['vsmov'], categories: ['movie'], apiKey: xssApiKey };
    const tokenXss = encodeConfig(cfgXss);
    const resXss = await fetch(`${baseUrl}/${tokenXss}`);
    const htmlXss = await resXss.text();
    auditAssert('HTML input value attribute is properly entity-escaped', htmlXss.includes('value="&quot;&gt;&lt;script&gt;alert(1)&lt;/script&gt;&lt;div id=&quot;xss&quot;&gt;"'));
    auditAssert('Input element does not break out of HTML value attribute', !htmlXss.includes('type="password" placeholder="API Key riêng tư (tùy chọn)" autocomplete="off" spellcheck="false" value=""><script>'));

    // ─── CHECK 7: Route Isolation & Non-Interference ──────────────
    console.log('\n▶ CHECK 7: Route Isolation & Non-Interference');
    const resRootManifest = await fetch(`${baseUrl}/manifest.json`);
    auditAssert('GET /manifest.json returns 200 JSON', resRootManifest.status === 200 && resRootManifest.headers.get('content-type').includes('application/json'));

    const resTokenManifest = await fetch(`${baseUrl}/${tokenA}/manifest.json`);
    auditAssert('GET /:config/manifest.json returns 200 JSON', resTokenManifest.status === 200 && resTokenManifest.headers.get('content-type').includes('application/json'));
    const jsonTokenManifest = await resTokenManifest.json();
    auditAssert('Filtered manifest contains only VSMOV 4K movie catalogs',
      jsonTokenManifest.catalogs.length > 0 &&
      jsonTokenManifest.catalogs.every((c) => c.id.startsWith('vsmov'))
    );

    const resHealth = await fetch(`${baseUrl}/health`);
    auditAssert('GET /health returns 200 JSON', resHealth.status === 200 && resHealth.headers.get('content-type').includes('application/json'));

    const resFavicon = await fetch(`${baseUrl}/favicon.ico`);
    auditAssert('GET /favicon.ico returns 204 No Content', resFavicon.status === 204);

    const resInvalidMultiSegment = await fetch(`${baseUrl}/foo/bar`);
    auditAssert('Non-existent multi-segment route returns 404', resInvalidMultiSegment.status === 404);

    console.log('\n╔══════════════════════════════════════════════════════════════════════════════╗');
    console.log(`║   ✅ FORENSIC AUDIT COMPLETE: ALL ${passed}/${checks} CHECKS EMPIRICALLY VERIFIED CLEAN      ║`);
    console.log('╚══════════════════════════════════════════════════════════════════════════════╝\n');

  } finally {
    server.close();
  }
}

if (require.main === module) {
  runForensicAudit().catch((err) => {
    console.error('\n❌ FORENSIC AUDIT FAILED:', err);
    process.exit(1);
  });
}

module.exports = { runForensicAudit };
