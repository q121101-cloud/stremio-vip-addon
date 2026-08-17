'use strict';

const assert = require('assert');
const express = require('express');
const http = require('http');
const axios = require('axios');

const handlers = require('../../src/handlers');
const { resolveCinemeta, getCachedCinemeta, cinemetaCache } = require('../../src/lib/cinemeta');

async function runAdversarialTests() {
  console.log('══ REVIEWER 1 ADVERSARIAL STRESS TEST SUITE ══');

  const app = express();
  app.use(express.json());
  app.use('/', handlers);

  const server = http.createServer(app);
  server.keepAliveTimeout = 30000;
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;
  const client = axios.create({
    baseURL: `http://127.0.0.1:${port}`,
    timeout: 15000,
    validateStatus: () => true,
    httpAgent: new http.Agent({ keepAlive: false }),
  });

  let passed = 0;
  let failed = 0;

  function check(name, cond) {
    if (cond) {
      console.log(`  ✅ PASS: ${name}`);
      passed++;
    } else {
      console.error(`  ❌ FAIL: ${name}`);
      failed++;
    }
  }

  try {
    // 1. Edge Case: Empty / Strange Stream IDs
    const r1 = await client.get('/stream/movie/.json');
    check('Empty stream ID returns 200 with empty array', r1.status === 200 && Array.isArray(r1.data?.streams) && r1.data.streams.length === 0);

    const r2 = await client.get('/stream/movie/tt:invalid:parts.json');
    check('Malformed IMDb delimiter returns 200 with empty array', r2.status === 200 && Array.isArray(r2.data?.streams));

    const r3 = await client.get('/stream/series/tt0903747:-5:0.json');
    check('Negative season/episode returns 200 without crash', r3.status === 200 && Array.isArray(r3.data?.streams));

    // 2. In-App Exclusivity & No externalUrl check on real/mock streams
    const r4 = await client.get('/stream/movie/tt1375666.json');
    check('Inception stream status 200', r4.status === 200);
    if (r4.data?.streams?.length > 0) {
      const allCompliant = r4.data.streams.every((s) => {
        return s.name === 'VIP Movies 🎬' &&
               typeof s.title === 'string' &&
               typeof s.url === 'string' &&
               !('externalUrl' in s) &&
               s.externalUrl === undefined;
      });
      check('All returned streams strictly satisfy In-App Exclusivity (url present, externalUrl absent)', allCompliant);
    }

    // 3. Cinemeta edge cases
    const c1 = await resolveCinemeta('movie', 'tt00000000000');
    check('Non-existent IMDb returns null', c1 === null);

    const c2 = await resolveCinemeta('series', 'tt0903747:999:999');
    check('Series with excessive season/ep resolves base IMDb', c2 !== null && c2.name === 'Breaking Bad');

    const c3 = await resolveCinemeta('movie', undefined);
    check('Undefined ID to Cinemeta returns null', c3 === null);

    const c4 = await resolveCinemeta('movie', 'not-an-imdb-id');
    check('Non-IMDb slug to Cinemeta returns null', c4 === null);

    // 4. Deduplication check
    const r5 = await client.get('/stream/movie/tt1375666.json');
    const urls = r5.data?.streams?.map((s) => s.url) || [];
    const uniqueUrls = new Set(urls);
    check('Zero duplicate stream URLs in output', urls.length === uniqueUrls.size);

    // 5. 404 / 500 Prevention on invalid route variations
    const r6 = await client.get('/stream/movie/totally-invalid-slug-xyz-999');
    check('Extension-less invalid slug returns 200 { streams: [] }', r6.status === 200 && r6.data?.streams?.length === 0);

    const r7 = await client.get('/invalid_config_token_123/stream/movie/totally-invalid-slug-xyz-999.json');
    check('Invalid config token + invalid slug returns 200 { streams: [] }', r7.status === 200 && r7.data?.streams?.length === 0);

  } finally {
    server.close();
  }

  console.log(`\nAdversarial Test Summary: ${passed} passed, ${failed} failed\n`);
  if (failed > 0) process.exit(1);
}

runAdversarialTests().catch((e) => {
  console.error(e);
  process.exit(1);
});
