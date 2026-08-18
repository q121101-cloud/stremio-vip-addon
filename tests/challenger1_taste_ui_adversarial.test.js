'use strict';

/**
 * ============================================================
 *  VIP Movies Stremio Addon
 *  Adversarial Verification Suite for Taste-Skill UI & Route Hydration
 *  Author: Challenger 1 (critic, specialist)
 * ============================================================
 */

const http = require('http');
const assert = require('assert');
const vm = require('vm');
const app = require('../src/index');
const {
  encodeConfig,
  decodeConfig,
  isConfigToken,
  DEFAULT_CONFIG,
  VALID_PROVIDERS,
  VALID_CATEGORIES,
} = require('../src/config');

async function runAdversarialTests() {
  console.log('\n================================================================================');
  console.log('⚔️  CHALLENGER 1: ADVERSARIAL EMPIRICAL TEST SUITE — TASTE-SKILL UI & HYDRATION');
  console.log('================================================================================\n');

  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;
  const baseUrl = `http://127.0.0.1:${port}`;

  let passed = 0;
  let failed = 0;
  const failures = [];

  function test(description, fn) {
    try {
      fn();
      console.log(`  ✅ [PASS] ${description}`);
      passed++;
    } catch (err) {
      console.error(`  ❌ [FAIL] ${description}\n     Error: ${err.message}`);
      failed++;
      failures.push({ description, error: err.message });
    }
  }

  async function testAsync(description, asyncFn) {
    try {
      await asyncFn();
      console.log(`  ✅ [PASS] ${description}`);
      passed++;
    } catch (err) {
      console.error(`  ❌ [FAIL] ${description}\n     Error: ${err.message}`);
      failed++;
      failures.push({ description, error: err.message });
    }
  }

  try {
    // ──────────────────────────────────────────────────────────────────────────
    // SUITE 1: Taste-Skill Anti-Slop Palette, Tokens & Typography Contract
    // ──────────────────────────────────────────────────────────────────────────
    console.log('--- SUITE 1: Design Tokens & Palette Specifications ---');

    const resRoot = await fetch(`${baseUrl}/`);
    const rootHtml = await resRoot.text();

    test('GET / returns HTTP 200', () => {
      assert.strictEqual(resRoot.status, 200);
    });

    test('Content-Type header is text/html; charset=utf-8', () => {
      assert.strictEqual(resRoot.headers.get('content-type'), 'text/html; charset=utf-8');
    });

    test('OLED True Black base background variable (--bg-oled: #0b0d13)', () => {
      assert(rootHtml.includes('--bg-oled: #0b0d13'), 'Missing --bg-oled: #0b0d13');
    });

    test('Theme color meta tag is #0b0d13', () => {
      assert(rootHtml.includes('<meta name="theme-color" content="#0b0d13" />'), 'Missing theme-color meta tag');
    });

    test('3-Orb dynamic ambient mesh glow present with correct classes and colors', () => {
      assert(rootHtml.includes('ambient-canvas'), 'Missing ambient-canvas');
      assert(rootHtml.includes('orb-indigo') && rootHtml.includes('#6366f1'), 'Missing orb-indigo / #6366f1');
      assert(rootHtml.includes('orb-pink') && rootHtml.includes('#ec4899'), 'Missing orb-pink / #ec4899');
      assert(rootHtml.includes('orb-cyan') && rootHtml.includes('#06b6d4'), 'Missing orb-cyan / #06b6d4');
      assert(rootHtml.includes('filter: blur(140px)'), 'Missing 140px blur on ambient orbs');
    });

    test('Modern font typography imports (Plus Jakarta Sans & JetBrains Mono)', () => {
      assert(rootHtml.includes('family=Plus+Jakarta+Sans'), 'Missing Plus Jakarta Sans font');
      assert(rootHtml.includes('family=JetBrains+Mono'), 'Missing JetBrains Mono font');
    });

    test('Spring-physics cubic-bezier timing function defined in CSS', () => {
      assert(
        rootHtml.includes('cubic-bezier(0.34, 1.56, 0.64, 1)'),
        'Missing cubic-bezier(0.34, 1.56, 0.64, 1)'
      );
    });

    test('Subtle 1px borders and multi-layer backdrop blur (28px - 32px)', () => {
      assert(rootHtml.includes('border: 1px solid var(--border-subtle)'), 'Missing 1px subtle card border');
      assert(rootHtml.includes('--glass-blur: blur(28px)'), 'Missing 28px glass blur');
      assert(rootHtml.includes('backdrop-filter: blur(32px)'), 'Missing 32px dock blur');
    });

    test('Exact glowing brand signature matches specification', () => {
      const expectedSignature = 'VIP Movies Addon v1.5.1 • Designed with Taste by <span class="brand-highlight">Q121101</span>';
      assert(rootHtml.includes(expectedSignature), `Footer signature does not match expected:\n${expectedSignature}`);
    });

    // ──────────────────────────────────────────────────────────────────────────
    // SUITE 2: 7-Provider Bento Grid & Hero Balancing (Taste-Skill Rule 4.7)
    // ──────────────────────────────────────────────────────────────────────────
    console.log('\n--- SUITE 2: Bento Grid 1 + 6 Layout & Provider Components ---');

    test('VSMOV 4K is styled as Flagship Hero Card spanning full grid width', () => {
      assert(
        rootHtml.includes('provider-card vsmov vsmov-hero') && rootHtml.includes('grid-column: 1 / -1'),
        'VSMOV 4K is not designated as full-width flagship hero tile in Bento grid'
      );
    });

    test('All 7 provider cards rendered with distinct IDs and accessibility roles', () => {
      const expectedProviders = ['vsmov', 'kkphim', 'nguonc', 'stp', 'hh3d', 'yan', 'clbpx'];
      for (const p of expectedProviders) {
        assert(rootHtml.includes(`id="card-${p}"`), `Missing card for provider: ${p}`);
        assert(rootHtml.includes(`role="checkbox"`), 'Missing role="checkbox" on cards');
      }
    });

    test('All 4 category pills rendered with action IDs', () => {
      const expectedCats = ['movie', 'series', 'cinema', 'anime'];
      for (const c of expectedCats) {
        assert(rootHtml.includes(`id="cat-${c}"`), `Missing category pill for: ${c}`);
      }
    });

    test('Batch action pill buttons present (selectAll and selectNone)', () => {
      assert(rootHtml.includes('onclick="selectAll()"'), 'Missing selectAll button');
      assert(rootHtml.includes('onclick="selectNone()"'), 'Missing selectNone button');
    });

    // ──────────────────────────────────────────────────────────────────────────
    // SUITE 3: Floating Action Dock & Deep Links
    // ──────────────────────────────────────────────────────────────────────────
    console.log('\n--- SUITE 3: Floating Action Dock & CTAs ---');

    test('Floating Action Dock rendered with Frosted Glass container', () => {
      assert(rootHtml.includes('class="floating-action-dock"'), 'Missing floating-action-dock');
      assert(rootHtml.includes('class="dock-container"'), 'Missing dock-container');
    });

    test('Dock contains 3 distinct action CTA buttons', () => {
      assert(rootHtml.includes('id="stremio-install-btn"'), 'Missing Stremio App install button');
      assert(rootHtml.includes('id="web-install-btn"'), 'Missing Stremio Web open button');
      assert(rootHtml.includes('id="dock-copy-btn"'), 'Missing Dock Copy Manifest button');
    });

    test('API Key input field present with autocomplete off and password masking', () => {
      assert(
        rootHtml.includes('id="apikey-input"') && rootHtml.includes('type="password"'),
        'Missing password-masked API Key input field'
      );
    });

    test('Toast notification markup present', () => {
      assert(rootHtml.includes('id="toast"'), 'Missing toast notification element');
    });

    // ──────────────────────────────────────────────────────────────────────────
    // SUITE 4: Route Hydration with Single & Combinatorial Token States
    // ──────────────────────────────────────────────────────────────────────────
    console.log('\n--- SUITE 4: Route Hydration Matrix ---');

    // Matrix Case A: VSMOV only
    await testAsync('State Hydration: VSMOV only + Anime category + Secret Key', async () => {
      const cfg = {
        providers: ['vsmov'],
        categories: ['anime'],
        apiKey: 'secret_key_vsmov_only',
      };
      const token = encodeConfig(cfg);
      const res = await fetch(`${baseUrl}/${token}`);
      assert.strictEqual(res.status, 200);
      const html = await res.text();

      // Card active states
      assert(html.includes('id="card-vsmov"') && html.includes('provider-card vsmov vsmov-hero active'), 'VSMOV card not active');
      assert(!html.includes('id="card-kkphim" class="provider-card kkphim active"'), 'KKPhim should be inactive');
      assert(!html.includes('id="card-nguonc" class="provider-card nguonc active"'), 'NguonC should be inactive');
      assert(!html.includes('id="card-stp" class="provider-card stp active"'), 'STP should be inactive');

      // Category active states
      assert(html.includes('id="cat-anime"') && html.includes('action-pill active" id="cat-anime"'), 'Anime cat not active');
      assert(!html.includes('action-pill active" id="cat-movie"'), 'Movie cat should be inactive');

      // API Key input
      assert(html.includes('value="secret_key_vsmov_only"'), 'API key not pre-hydrated in input');

      // Inline script state
      assert(html.includes('new Set(["vsmov"])'), 'Script _providers not initialized to ["vsmov"]');
      assert(html.includes('new Set(["anime"])'), 'Script _categories not initialized to ["anime"]');
      assert(html.includes('"secret_key_vsmov_only"'), 'Script _apiKey not initialized');
    });

    // Matrix Case B: KKPhim only + Series & Cinema
    await testAsync('State Hydration: KKPhim only + Series & Cinema', async () => {
      const cfg = {
        providers: ['kkphim'],
        categories: ['series', 'cinema'],
        apiKey: '',
      };
      const token = encodeConfig(cfg);
      const res = await fetch(`${baseUrl}/${token}`);
      assert.strictEqual(res.status, 200);
      const html = await res.text();

      assert(html.includes('provider-card kkphim active'), 'KKPhim card not active');
      assert(!html.includes('provider-card vsmov vsmov-hero active'), 'VSMOV should be inactive');
      assert(html.includes('action-pill active" id="cat-series"'), 'Series cat not active');
      assert(html.includes('action-pill active" id="cat-cinema"'), 'Cinema cat not active');
      assert(!html.includes('action-pill active" id="cat-movie"'), 'Movie cat should be inactive');
    });

    // Matrix Case C: CLBPX + STP + HH3D
    await testAsync('State Hydration: CLBPX + STP + HH3D multi-cluster', async () => {
      const cfg = {
        providers: ['clbpx', 'stp', 'hh3d'],
        categories: ['movie'],
        apiKey: 'vip-token-xyz',
      };
      const token = encodeConfig(cfg);
      const res = await fetch(`${baseUrl}/${token}/configure`);
      assert.strictEqual(res.status, 200);
      const html = await res.text();

      assert(html.includes('provider-card clbpx active'), 'CLBPX card not active');
      assert(html.includes('provider-card stp active'), 'STP card not active');
      assert(html.includes('provider-card hh3d active'), 'HH3D card not active');
      assert(!html.includes('provider-card vsmov vsmov-hero active'), 'VSMOV should be inactive');
    });

    // Matrix Case D: Query Parameter Hydration (?config=...)
    await testAsync('State Hydration: Query parameter (?config=...) on root route', async () => {
      const cfg = {
        providers: ['yan', 'nguonc'],
        categories: ['movie', 'series', 'anime'],
        apiKey: 'query_hydrated_token',
      };
      const token = encodeConfig(cfg);
      const res = await fetch(`${baseUrl}/?config=${token}`);
      assert.strictEqual(res.status, 200);
      const html = await res.text();

      assert(html.includes('provider-card yan active'), 'YAN card not active via query');
      assert(html.includes('provider-card nguonc active'), 'NguonC card not active via query');
      assert(html.includes('value="query_hydrated_token"'), 'API key not hydrated via query');
    });

    // ──────────────────────────────────────────────────────────────────────────
    // SUITE 5: Adversarial Attacks, Corrupted Tokens & XSS Defense
    // ──────────────────────────────────────────────────────────────────────────
    console.log('\n--- SUITE 5: Adversarial Attacks & Edge Cases ---');

    // Edge Case 1: Corrupted Base64 token on /:config
    await testAsync('Adversarial: Corrupted token gracefully falls back without 500 error', async () => {
      const corruptedTokens = [
        'invalid!!notbase64@@',
        'eyJmb28iOiJiYXIifQ', // {"foo":"bar"} - no valid providers
        '%%%%%%',
        'undefined',
        'null',
        '0000000000000000',
      ];

      for (const t of corruptedTokens) {
        const res = await fetch(`${baseUrl}/${encodeURIComponent(t)}`);
        assert.strictEqual(res.status, 200, `Corrupted token ${t} caused status ${res.status}`);
        const html = await res.text();
        assert(html.includes('VIP Movies'), `Corrupted token ${t} did not render configurator`);
        assert(html.includes('provider-card vsmov vsmov-hero active'), `Fallback did not activate default providers`);
      }
    });

    // Edge Case 2: XSS Injection in API Key
    await testAsync('Security: XSS Injection payload in API Key is safely escaped in HTML & JS', async () => {
      const xssPayload = '"><script>alert("XSS_ATTACK")</script><input name="test';
      const cfg = {
        providers: ['vsmov'],
        categories: ['movie'],
        apiKey: xssPayload,
      };
      const token = encodeConfig(cfg);
      const res = await fetch(`${baseUrl}/${token}`);
      assert.strictEqual(res.status, 200);
      const html = await res.text();

      assert(!html.includes('value=""><script>'), 'Unescaped XSS payload injected into HTML attribute');
      assert(html.includes('&quot;&gt;&lt;script&gt;alert(') || html.includes('&#039;') || html.includes('&quot;'), 'XSS payload not properly escaped in HTML attribute');
      assert(html.includes(JSON.stringify(xssPayload)), 'XSS payload in script is not safely serialized');
    });

    // Edge Case 3: Non-config reserved paths must NOT be hijacked by /:config
    await testAsync('Route Isolation: Reserved API endpoints are not intercepted by UI router', async () => {
      const endpoints = [
        { path: '/manifest.json', expectedType: 'application/json' },
        { path: '/health', expectedType: 'application/json' },
      ];

      for (const ep of endpoints) {
        const res = await fetch(`${baseUrl}${ep.path}`);
        assert.strictEqual(res.status, 200, `${ep.path} returned status ${res.status}`);
        assert(
          res.headers.get('content-type').includes(ep.expectedType),
          `${ep.path} Content-Type was ${res.headers.get('content-type')} instead of ${ep.expectedType}`
        );
      }
    });

    // Edge Case 4: Non-existent deep route returns 404 JSON
    await testAsync('Error Handling: Non-existent deep routes return clean 404 JSON', async () => {
      const res = await fetch(`${baseUrl}/some/deep/unknown/path/that/does/not/exist`);
      assert.strictEqual(res.status, 404);
      const json = await res.json();
      assert(json.error, '404 response missing error property');
    });

    // ──────────────────────────────────────────────────────────────────────────
    // SUITE 6: Responsive DOM & Viewport Compliance
    // ──────────────────────────────────────────────────────────────────────────
    console.log('\n--- SUITE 6: Responsive DOM & Viewport Compliance ---');

    test('Responsive viewport meta tag with viewport-fit=cover present', () => {
      assert(
        rootHtml.includes('name="viewport"') && rootHtml.includes('viewport-fit=cover'),
        'Missing viewport-fit=cover meta tag'
      );
    });

    test('CSS Media Query for mobile single-column grid (< 580px) present', () => {
      assert(
        rootHtml.includes('@media (max-width: 580px)') && rootHtml.includes('grid-template-columns: 1fr;'),
        'Missing mobile responsive grid query'
      );
    });

    test('CSS Media Query for dock button stack (< 700px) present', () => {
      assert(
        rootHtml.includes('@media (max-width: 700px)') && rootHtml.includes('.cta-button-group { grid-template-columns: 1fr;'),
        'Missing mobile dock button stack query'
      );
    });

    test('Layout wrapper has max-width constraint for desktop readability', () => {
      assert(rootHtml.includes('max-width: 740px;'), 'Missing 740px layout max-width constraint');
    });

    // ──────────────────────────────────────────────────────────────────────────
    // SUITE 7: Client Script VM Simulation & Full Round-Trip Token Fidelity
    // ──────────────────────────────────────────────────────────────────────────
    console.log('\n--- SUITE 7: Client-Side VM Simulation & Token Round-Trip ---');

    await testAsync('Client VM: Client-side encodeConfigClient perfectly matches Backend decodeConfig', async () => {
      const scriptMatch = rootHtml.match(/<script>([\s\S]*?)<\/script>/);
      assert(scriptMatch && scriptMatch[1], 'Could not extract <script> tag from HTML');

      const mockElements = {};
      function getOrCreateEl(id) {
        if (!mockElements[id]) {
          mockElements[id] = {
            id,
            value: '',
            textContent: '',
            href: '',
            classList: {
              classes: new Set(),
              add: function(c) { this.classes.add(c); },
              remove: function(c) { this.classes.delete(c); },
              toggle: function(c, force) {
                if (force === undefined) {
                  if (this.classes.has(c)) this.classes.delete(c); else this.classes.add(c);
                } else if (force) {
                  this.classes.add(c);
                } else {
                  this.classes.delete(c);
                }
              },
              contains: function(c) { return this.classes.has(c); },
            },
            setAttribute: function() {},
            addEventListener: function() {},
          };
        }
        return mockElements[id];
      }

      const mockCards = ['card-vsmov', 'card-kkphim', 'card-nguonc', 'card-stp', 'card-hh3d', 'card-yan', 'card-clbpx'].map(id => getOrCreateEl(id));

      const mockWindow = {
        location: { origin: 'http://127.0.0.1:7000' },
      };

      const mockDoc = {
        getElementById: (id) => getOrCreateEl(id),
        querySelectorAll: (selector) => {
          if (selector === '.provider-card') return mockCards;
          return [];
        },
        body: {
          appendChild: () => {},
          removeChild: () => {},
        },
      };

      const context = vm.createContext({
        window: mockWindow,
        document: mockDoc,
        btoa: (str) => Buffer.from(str, 'binary').toString('base64'),
        unescape: (s) => decodeURIComponent(s),
        encodeURIComponent: (s) => encodeURIComponent(s),
        JSON,
        Set,
        Array,
        console,
        navigator: { clipboard: null },
      });

      const scriptCode = scriptMatch[1];
      vm.runInContext(scriptCode, context);

      // Verify client script functions exist
      assert.strictEqual(typeof context.encodeConfigClient, 'function');
      assert.strictEqual(typeof context.toggleProvider, 'function');
      assert.strictEqual(typeof context.toggleCat, 'function');
      assert.strictEqual(typeof context.selectAll, 'function');
      assert.strictEqual(typeof context.selectNone, 'function');

      // Test 1: Test selectNone -> should keep only movie and vsmov, kkphim
      context.selectNone();
      const noneToken = context.encodeConfigClient(context._providers, context._categories, context._apiKey);
      const decodedNone = decodeConfig(noneToken);
      assert.deepStrictEqual(decodedNone.providers.sort(), ['kkphim', 'vsmov'].sort());
      assert.deepStrictEqual(decodedNone.categories.sort(), ['movie'].sort());

      // Test 2: Test toggleProvider('stp') -> adds stp
      context.toggleProvider('stp');
      const stpToken = context.encodeConfigClient(context._providers, context._categories, context._apiKey);
      const decodedStp = decodeConfig(stpToken);
      assert(decodedStp.providers.includes('stp'));

      // Test 3: Test selectAll -> all providers and categories
      context.selectAll();
      const allToken = context.encodeConfigClient(context._providers, context._categories, context._apiKey);
      const decodedAll = decodeConfig(allToken);
      assert.deepStrictEqual(decodedAll.providers.sort(), VALID_PROVIDERS.slice().sort());
      assert.deepStrictEqual(decodedAll.categories.sort(), VALID_CATEGORIES.slice().sort());

      // Test 4: Manifest query with the client generated token against live backend
      const resManifest = await fetch(`${baseUrl}/${allToken}/manifest.json`);
      assert.strictEqual(resManifest.status, 200);
      const manifestJson = await resManifest.json();
      assert(manifestJson.catalogs.length >= 22, `Expected at least 22 catalogs, got ${manifestJson.catalogs.length}`);
    });

  } finally {
    server.close();
  }

  console.log('\n================================================================================');
  console.log(`🏁 ADVERSARIAL TEST RESULTS: ${passed} PASSED, ${failed} FAILED (TOTAL: ${passed + failed})`);
  console.log('================================================================================\n');

  if (failed > 0) {
    console.error('FAILURES SUMMARY:');
    failures.forEach((f, idx) => console.error(`  ${idx + 1}. ${f.description} -> ${f.error}`));
    throw new Error(`Adversarial test suite failed with ${failed} failure(s)`);
  }
}

if (require.main === module) {
  runAdversarialTests().catch((err) => {
    console.error('Fatal error during test run:', err);
    process.exit(1);
  });
}

module.exports = { runAdversarialTests };
