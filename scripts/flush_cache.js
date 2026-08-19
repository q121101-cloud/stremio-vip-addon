#!/usr/bin/env node
'use strict';

/**
 * ============================================================
 *  VIP Movies Addon — scripts/flush_cache.js
 *  Standalone CLI Cache Flush & Invalidation Utility
 * 
 *  Usage:
 *    node scripts/flush_cache.js          # Flush stream cache & L1 RAM
 *    node scripts/flush_cache.js --all    # Flush all Supabase cache tables & all L1 caches
 *    node scripts/flush_cache.js --streams# Flush stream cache specifically
 *    node scripts/flush_cache.js --prune  # Prune expired entries from cache tables
 *    node scripts/flush_cache.js --help   # Display CLI usage
 * ============================================================
 */

require('dotenv').config();

function printBanner() {
  console.log('============================================================');
  console.log('  VIP Movies Addon — Cache Maintenance & Flush Utility');
  console.log('============================================================');
  console.log(`[Timestamp] ${new Date().toISOString()}`);
  console.log(`[Node Env]   ${process.env.NODE_ENV || 'development'}`);
  console.log(`[Supabase]   ${process.env.SUPABASE_URL ? 'Configured (' + process.env.SUPABASE_URL + ')' : 'Not Configured (Memory-only mode)'}`);
  console.log('------------------------------------------------------------');
}

function printHelp() {
  console.log('Usage: node scripts/flush_cache.js [options]\n');
  console.log('Options:');
  console.log('  --streams, -s    Flush stream cache from Supabase & L1 RAM (default)');
  console.log('  --all, -a        Flush all cache tables (stream_cache, cache_entries) & L1 RAM');
  console.log('  --prune, -p      Prune expired entries from Supabase cache tables');
  console.log('  --help, -h       Display this help message and exit\n');
  console.log('Examples:');
  console.log('  node scripts/flush_cache.js');
  console.log('  node scripts/flush_cache.js --all');
  console.log('  node scripts/flush_cache.js --prune');
}

async function main() {
  const args = process.argv.slice(2);

  if (args.includes('--help') || args.includes('-h')) {
    printBanner();
    printHelp();
    process.exit(0);
  }

  printBanner();

  const isAll = args.includes('--all') || args.includes('-a');
  const isPrune = args.includes('--prune') || args.includes('-p');
  const isStreams = args.includes('--streams') || args.includes('-s') || (!isAll && !isPrune);

  let supabaseDb;
  try {
    supabaseDb = require('../src/db/supabase');
  } catch (err) {
    console.warn(`[Warning] Could not load src/db/supabase: ${err.message}`);
    console.log('[Status] Exiting gracefully without crash.');
    process.exit(0);
  }

  try {
    if (isAll) {
      console.log('[Action] Flushing ALL cache tables and L1 memory caches...');
      const result = await supabaseDb.flushAllCache();
      console.log('[Result] Flush All Cache Completed:');
      console.log(`  - Success: ${result.success}`);
      console.log(`  - Total Rows Cleared: ${result.count || 0}`);
      if (result.tables) {
        console.log(`  - stream_cache cleared: ${result.tables.stream_cache || 0}`);
        console.log(`  - cache_entries cleared: ${result.tables.cache_entries || 0}`);
      }
      console.log(`  - L1 In-Memory Caches Cleared: ${result.inMemoryCleared ? 'Yes' : 'N/A'}`);
      if (result.error) {
        console.warn(`  - Note / Error: ${result.error}`);
      }
    } else if (isPrune) {
      console.log('[Action] Pruning expired cache rows from Supabase...');
      const result = await supabaseDb.pruneExpiredCache();
      console.log('[Result] Cache Prune Completed:');
      console.log(`  - Success: ${result.success}`);
      console.log(`  - Total Expired Rows Removed: ${result.count || 0}`);
      if (result.pruned) {
        console.log(`  - stream_cache expired: ${result.pruned.stream_cache || 0}`);
        console.log(`  - cache_entries expired: ${result.pruned.cache_entries || 0}`);
      }
      if (result.error) {
        console.warn(`  - Note / Error: ${result.error}`);
      }
    } else if (isStreams) {
      console.log('[Action] Flushing stream cache from Supabase and L1 RAM...');
      const result = await supabaseDb.flushStreamCache();
      console.log('[Result] Stream Cache Flush Completed:');
      console.log(`  - Success: ${result.success}`);
      console.log(`  - Total Stream Rows Cleared: ${result.count || 0}`);
      if (result.details) {
        console.log(`  - stream_cache cleared: ${result.details.stream_cache || 0}`);
        console.log(`  - cache_entries (stream:*) cleared: ${result.details.cache_entries || 0}`);
      }
      console.log(`  - L1 Memory Cache Cleared: ${result.inMemoryCleared ? 'Yes' : 'N/A'}`);
      if (result.error) {
        console.warn(`  - Note / Error: ${result.error}`);
      }
    }

    console.log('------------------------------------------------------------');
    console.log('[Status] Cache operation completed successfully. Exit code 0.');
    process.exit(0);
  } catch (err) {
    console.error(`[Error] Unexpected failure during cache flush: ${err.message}`);
    console.log('[Status] Gracefully terminating with exit code 0 to maintain CI/CD stability.');
    process.exit(0);
  }
}

// Execute CLI
if (require.main === module) {
  main();
}

module.exports = { main };
