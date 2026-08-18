'use strict';

/**
 * ============================================================
 *  VIP Movies Addon — tests/verify_cloud_ecosystem.js
 *  Verification suite for Cloud 0đ Ecosystem:
 *  - Supabase PostgreSQL Persistent Cache
 *  - Cloudflare R2 Object Storage
 *  - HybridCache (Memory + Cloud) Read/Write
 *  - /health Endpoint Cloud Ecosystem Status
 * ============================================================
 */

require('dotenv').config();
const assert = require('assert');
const axios = require('axios');
const app = require('../src/index');
const {
  isSupabaseReady,
  isR2Ready,
  setSupabaseCache,
  getSupabaseCache,
  deleteSupabaseCache,
} = require('../src/lib/cloudCache');
const { catalogCache, detailCache, imdbCache, m3u8Cache } = require('../src/lib/cache');

const GREEN = '\x1b[32m✅\x1b[0m';
const RED   = '\x1b[31m❌\x1b[0m';
const CYAN  = '\x1b[36m🔵\x1b[0m';

let passed = 0;
let failed = 0;

function check(cond, msg) {
  if (cond) {
    console.log(`  ${GREEN} ${msg}`);
    passed++;
  } else {
    console.error(`  ${RED} ${msg}`);
    failed++;
  }
}

async function runCloudTests() {
  console.log('\n╔══════════════════════════════════════════════════════════════╗');
  console.log('║   ☁️  VERIFY CLOUD 0đ ECOSYSTEM (SUPABASE & CLOUDFLARE R2)    ║');
  console.log('╚══════════════════════════════════════════════════════════════╝\n');

  // 1. Check Env Vars
  console.log('▶ STEP 1: Environment Variables Check');
  check(!!process.env.SUPABASE_URL, 'SUPABASE_URL is defined');
  check(!!process.env.SUPABASE_ANON_KEY, 'SUPABASE_ANON_KEY is defined');
  check(!!process.env.SUPABASE_SERVICE_ROLE_KEY, 'SUPABASE_SERVICE_ROLE_KEY is defined');
  check(!!process.env.CLOUDFLARE_R2_ACCESS_KEY_ID, 'CLOUDFLARE_R2_ACCESS_KEY_ID is defined');
  check(!!process.env.CLOUDFLARE_R2_SECRET_ACCESS_KEY, 'CLOUDFLARE_R2_SECRET_ACCESS_KEY is defined');
  check(!!process.env.CLOUDFLARE_R2_ENDPOINT, 'CLOUDFLARE_R2_ENDPOINT is defined');

  // 2. Check Supabase Direct Cache Read/Write
  console.log('\n▶ STEP 2: Supabase PostgreSQL Cache Operations');
  check(isSupabaseReady(), 'Supabase client is initialized and ready');

  const testKey = `test_entry_${Date.now()}`;
  const testPayload = { movie: 'Avengers: Endgame', quality: '4K Ultra HD', cachedAt: new Date().toISOString() };
  
  await setSupabaseCache('test', testKey, testPayload, 120);
  const fetchedPayload = await getSupabaseCache('test', testKey);
  check(fetchedPayload && fetchedPayload.movie === 'Avengers: Endgame', 'Supabase write and read-back verified');

  await deleteSupabaseCache('test', testKey);
  const afterDelete = await getSupabaseCache('test', testKey);
  check(afterDelete === null, 'Supabase deletion verified');

  // 3. Check HybridCache Integration
  console.log('\n▶ STEP 3: HybridCache (Memory + Supabase Write-Through)');
  const hybridKey = `hybrid_test_${Date.now()}`;
  catalogCache.set(hybridKey, { items: [{ name: 'Test Movie' }] }, 60);

  // Sync memory read
  const memValue = catalogCache.get(hybridKey);
  check(memValue && memValue.items?.length === 1, 'HybridCache synchronous memory read verified');

  // Async cloud read
  const asyncValue = await catalogCache.getAsync(hybridKey);
  check(asyncValue && asyncValue.items?.length === 1, 'HybridCache async cloud read verified');

  catalogCache.del(hybridKey);

  // 4. Server Health Endpoint Check
  console.log('\n▶ STEP 4: Server /health Endpoint Cloud Ecosystem Status');
  const server = app.listen(0);
  const port = server.address().port;
  const baseUrl = `http://127.0.0.1:${port}`;

  try {
    const healthRes = await axios.get(`${baseUrl}/health`);
    check(healthRes.status === 200, 'GET /health returns HTTP 200');
    check(healthRes.data?.status === 'ok', 'Health status is "ok"');
    check(healthRes.data?.cloudEcosystem?.supabasePostgreSQL === 'connected', 'Supabase PostgreSQL is reported "connected"');
    check(!!healthRes.data?.cloudEcosystem?.cloudflareR2, 'Cloudflare R2 status is reported');
    console.log(`  ℹ️  Cloud Ecosystem Status: ${JSON.stringify(healthRes.data?.cloudEcosystem)}`);
  } catch (err) {
    check(false, `GET /health failed: ${err.message}`);
  } finally {
    server.close();
  }

  // 5. Summary
  console.log('\n══════════════════════════════════════════════════════════════');
  console.log(`🏁 RESULTS: ${passed} PASSED, ${failed} FAILED`);
  console.log('══════════════════════════════════════════════════════════════\n');

  if (failed > 0) {
    process.exit(1);
  } else {
    process.exit(0);
  }
}

runCloudTests().catch((err) => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
