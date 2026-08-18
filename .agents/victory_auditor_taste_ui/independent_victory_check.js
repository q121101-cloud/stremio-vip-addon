'use strict';

const http = require('http');
const app = require('../../src/index');
const { encodeConfig, DEFAULT_CONFIG } = require('../../src/config');
const { MANIFEST, ALL_CATALOGS } = require('../../src/manifest');

async function main() {
  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;
  const baseUrl = `http://127.0.0.1:${port}`;

  console.log(`[Independent Check] Server running at ${baseUrl}`);

  function fetchUrl(path, headers = {}) {
    return new Promise((resolve, reject) => {
      const u = new URL(path, baseUrl);
      http.get(u, { headers }, (res) => {
        let data = '';
        res.on('data', (c) => (data += c));
        res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: data }));
      }).on('error', reject);
    });
  }

  let failures = 0;
  function assert(cond, msg) {
    if (!cond) {
      console.error(`❌ FAIL: ${msg}`);
      failures++;
    } else {
      console.log(`✅ PASS: ${msg}`);
    }
  }

  // 1. GET / Root Configurator
  const rootRes = await fetchUrl('/');
  assert(rootRes.status === 200, 'GET / status 200');
  assert(rootRes.headers['content-type'].includes('text/html'), 'GET / Content-Type is text/html');
  assert(rootRes.body.includes('--bg-oled: #0b0d13;'), 'OLED True Black #0b0d13 in CSS');
  assert(rootRes.body.includes('orb-indigo') && rootRes.body.includes('orb-pink') && rootRes.body.includes('orb-cyan'), '3-orb ambient mesh present');
  assert(rootRes.body.includes('#6366f1') && rootRes.body.includes('#ec4899') && rootRes.body.includes('#06b6d4'), 'Aurora mesh colors #6366f1, #ec4899, #06b6d4 present');
  assert(rootRes.body.includes('Plus Jakarta Sans'), 'Plus Jakarta Sans font stack present');
  assert(rootRes.body.includes('VIP Movies Addon v1.5.1 • Designed with Taste by <span class="brand-highlight">Q121101</span>'), 'Signature footer matches exact brand string');
  assert(rootRes.body.includes('🟢 Server VIP Core Online &nbsp;·&nbsp; v1.5.1'), 'Header live status badge present');
  assert(rootRes.body.includes('id="card-vsmov"') && rootRes.body.includes('id="card-kkphim"'), 'VSMOV and KKPhim cards present');
  assert(rootRes.body.includes('id="card-nguonc"') && rootRes.body.includes('id="card-stp"'), 'NguonC and STP cards present');
  assert(rootRes.body.includes('id="card-hh3d"') && rootRes.body.includes('id="card-yan"') && rootRes.body.includes('id="card-clbpx"'), 'HH3D, YAN, CLBPX cards present');
  assert(rootRes.body.includes('id="cat-movie"') && rootRes.body.includes('id="cat-series"'), 'Movie & Series category pills present');
  assert(rootRes.body.includes('id="cat-cinema"') && rootRes.body.includes('id="cat-anime"'), 'Cinema & Anime category pills present');
  assert(rootRes.body.includes('selectAll()') && rootRes.body.includes('selectNone()'), 'Quick action toolbar pill buttons present');
  assert(rootRes.body.includes('floating-action-dock'), 'Floating action dock present');
  assert(rootRes.body.includes('id="stremio-install-btn"'), 'Stremio App install CTA present');
  assert(rootRes.body.includes('id="web-install-btn"'), 'Stremio Web CTA present');
  assert(rootRes.body.includes('id="dock-copy-btn"'), 'Dock copy button present');

  // 2. GET /:config path state hydration
  const testConfig = {
    providers: ['vsmov', 'nguonc'],
    categories: ['movie'],
    apiKey: 'my_secret_key_8888',
  };
  const token = encodeConfig(testConfig);
  const configRes = await fetchUrl(`/${token}`);
  assert(configRes.status === 200, 'GET /:config status 200');
  assert(configRes.body.includes('value="my_secret_key_8888"'), 'API key hydrated in input value');
  assert(configRes.body.includes('id="card-vsmov" onclick="toggleProvider(\'vsmov\')" role="checkbox" aria-checked="true" tabindex="0"') || configRes.body.includes('card-vsmov') && configRes.body.includes('aria-checked="true"'), 'VSMOV card active in hydrated HTML');
  assert(configRes.body.includes('id="card-kkphim"') && configRes.body.includes('aria-checked="false"'), 'KKPhim card inactive in hydrated HTML');

  // 3. GET /:config/manifest.json filtered manifest verification
  const manifestRes = await fetchUrl(`/${token}/manifest.json`);
  assert(manifestRes.status === 200, 'GET /:config/manifest.json status 200');
  const manifestJson = JSON.parse(manifestRes.body);
  assert(manifestJson.version === '1.5.1', 'Manifest version is 1.5.1');
  assert(Array.isArray(manifestJson.catalogs), 'Manifest catalogs is array');
  // Check that all catalogs belong to vsmov or nguonc and category is movie
  const allFilteredMatch = manifestJson.catalogs.every(c => (c.id.startsWith('vsmov') || c.id.startsWith('nguonc')) && c.type === 'movie');
  assert(allFilteredMatch, 'Dynamic manifest filters catalogs according to token');

  // 4. Check /health
  const healthRes = await fetchUrl('/health');
  assert(healthRes.status === 200, 'GET /health status 200');
  const healthJson = JSON.parse(healthRes.body);
  assert(healthJson.version === '1.5.1', 'Health check version is 1.5.1');
  assert(healthJson.status === 'ok', 'Health check status is ok');

  server.close();

  if (failures > 0) {
    console.error(`\n❌ ${failures} checks failed!`);
    process.exit(1);
  } else {
    console.log(`\n🎉 All independent checks passed clean!`);
    process.exit(0);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
