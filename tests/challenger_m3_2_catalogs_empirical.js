'use strict';

/**
 * ==============================================================================
 *  Challenger 2 Empirical Verification: 22 Standard K20 Catalogs & Routing
 *  
 *  Target Scope:
 *  1. Enumerate all 22 standard catalogs declared in src/manifest.js
 *  2. Query every catalog via Root (/catalog/:type/:id.json)
 *  3. Query every catalog via Config (/:config/catalog/:type/:id.json)
 *  4. Test search extra parameters (search=avatar, search=naruto, search=one+piece)
 *  5. Test pagination (skip=10, skip=24)
 *  6. Test 404 prevention and edge-case handling (invalid IDs, weird encodings)
 *  7. Concurrency stress testing across all 22 catalogs simultaneously
 * ==============================================================================
 */

const http = require('http');
const assert = require('assert');
const app = require('../src/index');
const { ALL_CATALOGS, MANIFEST, buildManifest } = require('../src/manifest');
const { DEFAULT_CONFIG, encodeConfig, getDefaultToken } = require('../src/config');

let server;
let baseUrl;
let totalPassed = 0;
let totalFailed = 0;
const failureList = [];

function check(desc, passed, detail = '') {
  if (passed) {
    totalPassed++;
    console.log(`  ✅ PASS: ${desc}`);
  } else {
    totalFailed++;
    console.error(`  ❌ FAIL: ${desc} ${detail ? '(' + detail + ')' : ''}`);
    failureList.push({ desc, detail });
  }
}

function fetchJson(path, options = {}) {
  return new Promise((resolve) => {
    const url = `${baseUrl}${path}`;
    const req = http.get(url, options, (res) => {
      let data = '';
      res.setEncoding('utf8');
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        let json = null;
        try {
          json = JSON.parse(data);
        } catch (e) {
          json = null;
        }
        resolve({
          status: res.statusCode,
          headers: res.headers,
          data: json,
          raw: data,
        });
      });
    });

    req.on('error', (err) => {
      resolve({
        status: 0,
        headers: {},
        data: null,
        error: err.message,
      });
    });

    req.setTimeout(15000, () => {
      req.destroy();
      resolve({
        status: 408,
        headers: {},
        data: null,
        error: 'Timeout',
      });
    });
  });
}

async function startServer() {
  return new Promise((resolve) => {
    server = app.listen(0, '127.0.0.1', () => {
      const port = server.address().port;
      baseUrl = `http://127.0.0.1:${port}`;
      console.log(`🚀 Ephemeral test server running at ${baseUrl}`);
      resolve();
    });
  });
}

async function stopServer() {
  return new Promise((resolve) => {
    if (server) {
      server.close(() => {
        console.log('🛑 Server stopped cleanly');
        resolve();
      });
    } else {
      resolve();
    }
  });
}

async function run() {
  console.log('╔══════════════════════════════════════════════════════════════════════╗');
  console.log('║   CHALLENGER 2: EMPIRICAL AUDIT OF 22 STANDARD K20 CATALOGS & SEARCH ║');
  console.log('╚══════════════════════════════════════════════════════════════════════╝\n');

  await startServer();

  const defaultToken = getDefaultToken();
  const customConfig = {
    providers: ['vsmov', 'kkphim', 'nguonc', 'stp', 'hh3d', 'yan', 'clbpx'],
    categories: ['movie', 'series', 'anime', 'cinema'],
  };
  const customToken = encodeConfig(customConfig);

  // ─────────────────────────────────────────────────────────────
  // PHASE 1: MANIFEST DECLARATIONS AND STRUCTURE AUDIT
  // ─────────────────────────────────────────────────────────────
  console.log('\n▶ PHASE 1: Manifest Declaration & Catalog Structure Audit');
  
  check('ALL_CATALOGS array has exactly 22 catalogs', ALL_CATALOGS.length === 22, `Found: ${ALL_CATALOGS.length}`);
  check('MANIFEST catalogs count is exactly 22', MANIFEST.catalogs.length === 22, `Found: ${MANIFEST.catalogs.length}`);

  const providerCounts = {};
  for (const cat of ALL_CATALOGS) {
    providerCounts[cat.provider] = (providerCounts[cat.provider] || 0) + 1;
    check(`Catalog ${cat.id} has valid type, name, and extra`,
      ['movie', 'series'].includes(cat.type) &&
      typeof cat.name === 'string' && cat.name.length > 0 &&
      Array.isArray(cat.extra) &&
      cat.extra.some((e) => e.name === 'search'),
      `Catalog: ${JSON.stringify(cat)}`
    );
  }

  check('VSMOV has 2 catalogs', providerCounts['vsmov'] === 2, `Got: ${providerCounts['vsmov']}`);
  check('KKPhim has 4 catalogs', providerCounts['kkphim'] === 4, `Got: ${providerCounts['kkphim']}`);
  check('NguonC has 4 catalogs', providerCounts['nguonc'] === 4, `Got: ${providerCounts['nguonc']}`);
  check('STP has 4 catalogs', providerCounts['stp'] === 4, `Got: ${providerCounts['stp']}`);
  check('HH3D has 3 catalogs', providerCounts['hh3d'] === 3, `Got: ${providerCounts['hh3d']}`);
  check('YAN has 3 catalogs', providerCounts['yan'] === 3, `Got: ${providerCounts['yan']}`);
  check('CLBPX has 2 catalogs', providerCounts['clbpx'] === 2, `Got: ${providerCounts['clbpx']}`);

  // ─────────────────────────────────────────────────────────────
  // PHASE 2: ROOT ROUTE QUERY FOR ALL 22 CATALOGS
  // ─────────────────────────────────────────────────────────────
  console.log('\n▶ PHASE 2: Querying all 22 Catalogs via Root Routes (/catalog/:type/:id.json)');

  for (let i = 0; i < ALL_CATALOGS.length; i++) {
    const cat = ALL_CATALOGS[i];
    const path = `/catalog/${cat.type}/${cat.id}.json`;
    const res = await fetchJson(path);

    const is200 = res.status === 200;
    const hasMetas = res.data && Array.isArray(res.data.metas);
    const metaCount = hasMetas ? res.data.metas.length : -1;
    const sampleItem = metaCount > 0 ? res.data.metas[0] : null;

    check(
      `[${i + 1}/22] Root: GET ${path} → HTTP 200 with metas array`,
      is200 && hasMetas,
      `Status: ${res.status}, metas: ${metaCount}`
    );

    if (sampleItem) {
      check(
        `[${i + 1}/22] Root: ${cat.id} sample meta has id, name, and type`,
        typeof sampleItem.id === 'string' &&
        typeof sampleItem.name === 'string' &&
        typeof sampleItem.type === 'string',
        `Sample: ${JSON.stringify(sampleItem)}`
      );
    }
  }

  // ─────────────────────────────────────────────────────────────
  // PHASE 3: CONFIG-PREFIXED ROUTE QUERY FOR ALL 22 CATALOGS
  // ─────────────────────────────────────────────────────────────
  console.log('\n▶ PHASE 3: Querying all 22 Catalogs via Config Routes (/:config/catalog/:type/:id.json)');

  for (let i = 0; i < ALL_CATALOGS.length; i++) {
    const cat = ALL_CATALOGS[i];
    const path = `/${customToken}/catalog/${cat.type}/${cat.id}.json`;
    const res = await fetchJson(path);

    const is200 = res.status === 200;
    const hasMetas = res.data && Array.isArray(res.data.metas);
    const metaCount = hasMetas ? res.data.metas.length : -1;

    check(
      `[${i + 1}/22] Config: GET ${path} → HTTP 200 with metas array`,
      is200 && hasMetas,
      `Status: ${res.status}, metas: ${metaCount}`
    );
  }

  // ─────────────────────────────────────────────────────────────
  // PHASE 4: CATALOG SEARCH EXTRA TESTING
  // ─────────────────────────────────────────────────────────────
  console.log('\n▶ PHASE 4: Search Extra Testing (avatar, naruto, one piece)');

  const testQueries = ['avatar', 'naruto', 'one piece'];
  const testCatalogsForSearch = [
    { type: 'movie', id: 'kkphim-movie-latest' },
    { type: 'movie', id: 'nguonc-movie-latest' },
    { type: 'movie', id: 'vsmov-4k' },
    { type: 'movie', id: 'stp-phim-le' },
    { type: 'series', id: 'hh3d-phim-bo' },
    { type: 'series', id: 'yan-phim-bo' },
    { type: 'series', id: 'clbpx-kiem-hiep' },
  ];

  for (const cat of testCatalogsForSearch) {
    for (const q of testQueries) {
      // 1. Plain extra format: search=query.json
      const plainPath = `/catalog/${cat.type}/${cat.id}/search=${encodeURIComponent(q)}.json`;
      const resPlain = await fetchJson(plainPath);

      check(
        `Search (Plain): GET ${plainPath} → HTTP 200`,
        resPlain.status === 200 && resPlain.data && Array.isArray(resPlain.data.metas),
        `Status: ${resPlain.status}, metas: ${resPlain.data?.metas?.length}`
      );

      // 2. Encoded extra parameter: search%3Dquery.json
      const encodedExtra = `search=${encodeURIComponent(q)}`;
      const encodedPath = `/catalog/${cat.type}/${cat.id}/${encodeURIComponent(encodedExtra)}.json`;
      const resEncoded = await fetchJson(encodedPath);

      check(
        `Search (URL-Encoded Extra): GET ${encodedPath} → HTTP 200`,
        resEncoded.status === 200 && resEncoded.data && Array.isArray(resEncoded.data.metas),
        `Status: ${resEncoded.status}, metas: ${resEncoded.data?.metas?.length}`
      );

      // 3. Config-prefixed search
      const configSearchPath = `/${customToken}/catalog/${cat.type}/${cat.id}/search=${encodeURIComponent(q)}.json`;
      const resConfigSearch = await fetchJson(configSearchPath);

      check(
        `Search (Config Prefixed): GET ${configSearchPath} → HTTP 200`,
        resConfigSearch.status === 200 && resConfigSearch.data && Array.isArray(resConfigSearch.data.metas),
        `Status: ${resConfigSearch.status}, metas: ${resConfigSearch.data?.metas?.length}`
      );
    }
  }

  // ─────────────────────────────────────────────────────────────
  // PHASE 5: PAGINATION TESTING (skip=10, skip=24)
  // ─────────────────────────────────────────────────────────────
  console.log('\n▶ PHASE 5: Pagination (Skip Extra) Testing');

  for (const cat of ALL_CATALOGS.slice(0, 7)) {
    const skip10Path = `/catalog/${cat.type}/${cat.id}/skip=10.json`;
    const res10 = await fetchJson(skip10Path);

    check(
      `Pagination skip=10: GET ${skip10Path} → HTTP 200`,
      res10.status === 200 && res10.data && Array.isArray(res10.data.metas),
      `Status: ${res10.status}`
    );

    const skip24Path = `/${customToken}/catalog/${cat.type}/${cat.id}/skip=24.json`;
    const res24 = await fetchJson(skip24Path);

    check(
      `Pagination skip=24 (Config): GET ${skip24Path} → HTTP 200`,
      res24.status === 200 && res24.data && Array.isArray(res24.data.metas),
      `Status: ${res24.status}`
    );
  }

  // ─────────────────────────────────────────────────────────────
  // PHASE 6: 404 PREVENTION & ADVERSARIAL EDGE CASES
  // ─────────────────────────────────────────────────────────────
  console.log('\n▶ PHASE 6: 404 Prevention & Adversarial Edge Cases');

  // 1. Non-existent catalog ID
  const invalidCatRes = await fetchJson('/catalog/movie/non-existent-catalog-xyz-999.json');
  check(
    'Non-existent catalog ID returns HTTP 200 with empty metas (no 404)',
    invalidCatRes.status === 200 && invalidCatRes.data && Array.isArray(invalidCatRes.data.metas) && invalidCatRes.data.metas.length === 0,
    `Status: ${invalidCatRes.status}, body: ${invalidCatRes.raw}`
  );

  // 2. Non-existent search query with 0 matches
  const impossibleSearchRes = await fetchJson('/catalog/movie/kkphim-movie-latest/search=xyzzy_unfindable_query_99999.json');
  check(
    'Search query with 0 results returns HTTP 200 with empty metas (no 404)',
    impossibleSearchRes.status === 200 && impossibleSearchRes.data && Array.isArray(impossibleSearchRes.data.metas) && impossibleSearchRes.data.metas.length === 0,
    `Status: ${impossibleSearchRes.status}`
  );

  // 3. Corrupted extra parameter
  const corruptExtraRes = await fetchJson('/catalog/movie/kkphim-movie-latest/&&&=invalid&==&&.json');
  check(
    'Corrupted extra parameter returns HTTP 200 gracefully',
    corruptExtraRes.status === 200 && corruptExtraRes.data && Array.isArray(corruptExtraRes.data.metas),
    `Status: ${corruptExtraRes.status}`
  );

  // 4. Invalid base64 config token in catalog route
  const invalidTokenRes = await fetchJson('/this-is-not-a-valid-token-!!!/catalog/movie/vsmov-4k.json');
  check(
    'Invalid config token falls back safely to default config and returns HTTP 200',
    invalidTokenRes.status === 200 && invalidTokenRes.data && Array.isArray(invalidTokenRes.data.metas),
    `Status: ${invalidTokenRes.status}`
  );

  // 5. Query string search fallback
  const querySearchRes = await fetchJson('/catalog/movie/kkphim-movie-latest.json?search=batman');
  check(
    'Query string search fallback returns HTTP 200 with metas',
    querySearchRes.status === 200 && querySearchRes.data && Array.isArray(querySearchRes.data.metas),
    `Status: ${querySearchRes.status}`
  );

  // ─────────────────────────────────────────────────────────────
  // PHASE 7: CONCURRENCY STRESS TEST (Parallel 22 Catalogs)
  // ─────────────────────────────────────────────────────────────
  console.log('\n▶ PHASE 7: Concurrency Stress Test (22 Catalogs Parallel Load)');

  const concurrentPromises = ALL_CATALOGS.map((cat, idx) => {
    const isConfig = idx % 2 === 0;
    const path = isConfig
      ? `/${customToken}/catalog/${cat.type}/${cat.id}.json`
      : `/catalog/${cat.type}/${cat.id}.json`;
    return fetchJson(path);
  });

  const concurrentResults = await Promise.all(concurrentPromises);
  const allSucceeded = concurrentResults.every((r) => r.status === 200 && r.data && Array.isArray(r.data.metas));

  check(
    'All 22 catalogs answered concurrently with HTTP 200 and valid JSON',
    allSucceeded,
    `Success count: ${concurrentResults.filter((r) => r.status === 200).length} / 22`
  );

  await stopServer();

  console.log('\n══════════════════════════════════════════════════════════════════════');
  console.log(`🏁 SUMMARY: ${totalPassed} PASSED, ${totalFailed} FAILED`);
  console.log('══════════════════════════════════════════════════════════════════════\n');

  if (totalFailed > 0) {
    console.error('Failures encountered:');
    failureList.forEach((f, i) => {
      console.error(` ${i + 1}. ${f.desc} - ${f.detail}`);
    });
    process.exit(1);
  } else {
    console.log('🎉 ALL EMPIRICAL VERIFICATIONS PASSED 100%!');
    process.exit(0);
  }
}

run().catch((err) => {
  console.error('Fatal error during test run:', err);
  process.exit(1);
});
