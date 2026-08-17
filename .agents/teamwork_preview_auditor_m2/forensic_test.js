'use strict';

/**
 * Forensic Integrity & Behavioral Deep-Dive Test for Milestone 2 Providers
 * Modules: src/providers/kkphim.js, src/providers/nguonc.js, src/providers/vsmov.js
 */

const assert = require('assert');
const axios = require('axios');

const kkphim = require('../../src/providers/kkphim');
const nguonc = require('../../src/providers/nguonc');
const vsmov  = require('../../src/providers/vsmov');
const mapper = require('../../src/mapper');

const results = [];

function record(name, pass, msg = '') {
  results.push({ name, pass, msg });
  console.log(`[${pass ? 'PASS' : 'FAIL'}] ${name} ${msg ? '— ' + msg : ''}`);
}

async function runForensicAudit() {
  console.log('=== STARTING FORENSIC INTEGRITY AUDIT ===\n');

  // --- CHECK 1: Static Analysis & No Hardcoded Bypass Strings ---
  console.log('--- Phase 1: Hardcoded Test Strings / Cheating Checks ---');
  const fs = require('fs');
  const kkContent = fs.readFileSync(require.resolve('../../src/providers/kkphim'), 'utf8');
  const nguonContent = fs.readFileSync(require.resolve('../../src/providers/nguonc'), 'utf8');
  const vsContent = fs.readFileSync(require.resolve('../../src/providers/vsmov'), 'utf8');

  const testIds = ['tt1375666', 'tt0903747', 'tt0499549', 'tt0816692', 'tt0388629'];
  let hardcodedIdFound = false;

  for (const id of testIds) {
    if (kkContent.includes(id)) {
      record(`KKPhim hardcoded ID check (${id})`, false, `Found hardcoded ${id}`);
      hardcodedIdFound = true;
    }
    if (nguonContent.includes(id)) {
      record(`NguonC hardcoded ID check (${id})`, false, `Found hardcoded ${id}`);
      hardcodedIdFound = true;
    }
    if (vsContent.includes(id)) {
      record(`VsMov hardcoded ID check (${id})`, false, `Found hardcoded ${id}`);
      hardcodedIdFound = true;
    }
  }

  if (!hardcodedIdFound) {
    record('Zero hardcoded test IMDb IDs in provider sources', true, 'Clean: No hardcoded test IDs');
  }

  // --- CHECK 2: Module Exports & Method Signatures ---
  console.log('\n--- Phase 2: Interface Contract Verification ---');
  record('KKPhim exports id, label, getStreams', Boolean(kkphim.id === 'kkphim' && typeof kkphim.getStreams === 'function'));
  record('NguonC exports id, label, getStreams', Boolean(nguonc.id === 'nguonc' && typeof nguonc.getStreams === 'function'));
  record('VsMov exports id, label, getStreams', Boolean(vsmov.id === 'vsmov' && typeof vsmov.getStreams === 'function'));

  // --- CHECK 3: Check Provider Dependencies on mapper.js ---
  console.log('\n--- Phase 3: Provider Dependencies & Runtime Integrity ---');
  record('mapper.js exports extractYear', typeof mapper.extractYear === 'function', `typeof mapper.extractYear is ${typeof mapper.extractYear}`);
  record('mapper.js exports unpackDeanEdwards', typeof mapper.unpackDeanEdwards === 'function', `typeof mapper.unpackDeanEdwards is ${typeof mapper.unpackDeanEdwards}`);

  // --- CHECK 4: Live / Real Provider Calls & Timeout Configuration ---
  console.log('\n--- Phase 4: Endpoint & Network Behavioral Verification ---');
  
  // Test KKPhim search & detail
  try {
    const kkSearch = await kkphim.search('Inception', 2);
    record('KKPhim search API (phimapi.com)', Array.isArray(kkSearch), `Returned ${kkSearch.length} items`);
  } catch (err) {
    record('KKPhim search API (phimapi.com)', false, err.message);
  }

  // Test NguonC search
  try {
    const ncSearch = await nguonc.search('Inception', 1);
    record('NguonC search API (phim.nguonc.com)', Boolean(ncSearch && Array.isArray(ncSearch.items)), `Returned ${ncSearch?.items?.length || 0} items`);
  } catch (err) {
    record('NguonC search API (phim.nguonc.com)', false, err.message);
  }

  // Test VsMov getStreams
  try {
    const vsStreams = await vsmov.getStreams({ title: 'Inception', type: 'movie', proxyBase: 'http://localhost:7000' });
    record('VsMov getStreams execution', Array.isArray(vsStreams), `Returned ${vsStreams.length} streams`);
  } catch (err) {
    record('VsMov getStreams execution', false, err.message);
  }

  // --- CHECK 5: Stremio Protocol Conformance for Returned Streams ---
  console.log('\n--- Phase 5: Stremio Stream Protocol Conformance (R3) ---');
  // Synthetic detail object to test getStreams protocol compliance in isolation
  const mockKKData = {
    movie: { slug: 'test-film', name: 'Test Film' },
    episodes: [
      {
        server_name: 'Vietsub #1',
        server_data: [
          { name: '1', link_m3u8: 'https://cdn.example.com/test.m3u8', link_embed: 'https://embed.example.com/test' }
        ]
      }
    ]
  };

  const { imdbCache: ic, detailCache: dc } = require('../../src/lib/cache');
  ic.set('kkphim:imdb:tt9999991', mockKKData, 60);

  const testKKStreams = await kkphim.getStreams({
    imdbId: 'tt9999991',
    proxyBase: 'http://localhost:7000'
  });

  let kkProtocolValid = true;
  for (const s of testKKStreams) {
    const hasUrl = 'url' in s && s.url;
    const hasExt = 'externalUrl' in s && s.externalUrl;
    if ((hasUrl && hasExt) || (!hasUrl && !hasExt)) {
      kkProtocolValid = false;
    }
  }
  record('KKPhim Stremio Protocol Stream Exclusivity (HLS vs Embed)', kkProtocolValid && testKKStreams.length === 2, `Generated ${testKKStreams.length} stream(s)`);

  // --- SUMMARY ---
  console.log('\n=== FORENSIC AUDIT RESULTS ===');
  const failures = results.filter(r => !r.pass);
  console.log(`Total Checks: ${results.length}`);
  console.log(`Passed:       ${results.length - failures.length}`);
  console.log(`Failed:       ${failures.length}`);
  
  if (failures.length > 0) {
    console.log('\nFailures Detail:');
    failures.forEach(f => console.log(` - ${f.name}: ${f.msg}`));
  }
}

runForensicAudit().catch(err => {
  console.error('Fatal audit error:', err);
});
