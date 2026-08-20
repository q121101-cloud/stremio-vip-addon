#!/usr/bin/env node
'use strict';

require('dotenv').config();
const { flushCache: flushL1Cache } = require('../src/db/cache');
const {
  isConfigured,
  isSupabaseAvailable,
  deleteStreamCache,
  flushDatabaseCache,
  supabaseClient
} = require('../src/db/supabase');

function printHelp() {
  console.log(`
===================================================================
🎬 VIP Movies Stremio Addon — Cache Maintenance CLI Utility
===================================================================

Usage:
  node scripts/flush_cache.js [OPTIONS]

Options:
  --all                 Flush all L1 memory cache and all L2 Supabase records
  --expired             Flush only expired records (expires_at < NOW())
  --provider <name>     Flush stream cache for specific provider (kkphim, vsmov, nguonc)
  --dry-run             Simulate deletion and show matching record counts without deleting
  --help, -h            Show this help message

Examples:
  node scripts/flush_cache.js --all
  node scripts/flush_cache.js --expired
  node scripts/flush_cache.js --provider kkphim
  node scripts/flush_cache.js --all --dry-run
===================================================================
`);
}

function parseArgs(args = process.argv.slice(2)) {
  const flags = {
    all: false,
    expired: false,
    provider: null,
    dryRun: false,
    help: false
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--help' || arg === '-h') {
      flags.help = true;
    } else if (arg === '--all') {
      flags.all = true;
    } else if (arg === '--expired') {
      flags.expired = true;
    } else if (arg === '--dry-run') {
      flags.dryRun = true;
    } else if (arg === '--provider') {
      flags.provider = args[i + 1] || null;
      i++;
    } else if (arg.startsWith('--provider=')) {
      flags.provider = arg.split('=')[1] || null;
    }
  }
  return flags;
}

async function main(customArgs) {
  const startTime = Date.now();
  const args = customArgs !== undefined ? customArgs : process.argv.slice(2);
  const flags = parseArgs(args);

  if (flags.help || args.length === 0) {
    printHelp();
    return { success: true, action: 'help' };
  }

  console.log('🚀 [Cache Flush CLI] Starting cache maintenance routine...');
  console.log(`⚙️  Flags: all=${flags.all}, expired=${flags.expired}, provider=${flags.provider || 'none'}, dryRun=${flags.dryRun}`);

  // 1. Flush L1 Memory Cache
  let l1Flushed = false;
  if (!flags.dryRun) {
    l1Flushed = flushL1Cache();
    console.log(`🧹 [L1 Cache] In-memory NodeCache flushed: ${l1Flushed ? 'SUCCESS' : 'FAILED'}`);
  } else {
    console.log('🔍 [L1 Cache] [DRY RUN] In-memory NodeCache would be flushed.');
  }

  // 2. Check Supabase Connectivity
  const dbConfigured = isConfigured();
  const dbAvailable = isSupabaseAvailable();

  if (!dbConfigured || !dbAvailable) {
    console.warn('⚠️  [L2 Cache] Supabase is unconfigured or unreachable. L2 operations skipped.');
    const elapsed = Date.now() - startTime;
    console.log(`\n✅ Summary: L1 flushed. Total elapsed: ${elapsed}ms\n`);
    return {
      success: true,
      l1Flushed: !flags.dryRun ? l1Flushed : true,
      l2Available: false,
      streamDeleted: 0,
      mappingDeleted: 0,
      elapsed
    };
  }

  try {
    let streamDeleted = 0;
    let mappingDeleted = 0;

    if (flags.dryRun) {
      console.log('🔍 [L2 Cache] Calculating affected records (DRY RUN)...');
      let streamQuery = supabaseClient.from('stremio_stream_cache').select('*', { count: 'exact', head: true });
      let mappingQuery = supabaseClient.from('stremio_imdb_mappings').select('*', { count: 'exact', head: true });

      if (flags.expired) {
        const now = new Date().toISOString();
        streamQuery = streamQuery.lt('expires_at', now);
        mappingQuery = mappingQuery.lt('expires_at', now);
      } else if (flags.provider) {
        streamQuery = streamQuery.eq('provider', flags.provider);
        mappingQuery = null; // Mappings are not provider-specific
      }

      const streamRes = await streamQuery;
      streamDeleted = streamRes?.count || 0;

      if (mappingQuery) {
        const mappingRes = await mappingQuery;
        mappingDeleted = mappingRes?.count || 0;
      }

      console.log(`📊 [L2 Cache Results - DRY RUN]:`);
      console.log(`   - stremio_stream_cache: ${streamDeleted} records would be deleted.`);
      console.log(`   - stremio_imdb_mappings: ${mappingDeleted} records would be deleted.`);
    } else {
      if (flags.provider) {
        console.log(`🧹 [L2 Cache] Deleting streams for provider: ${flags.provider}...`);
        const res = await deleteStreamCache({ provider: flags.provider });
        streamDeleted = res.count;
      } else {
        console.log(`🧹 [L2 Cache] Purging database cache (expiredOnly=${flags.expired})...`);
        const res = await flushDatabaseCache(flags.expired);
        streamDeleted = res.streamCount;
        mappingDeleted = res.mappingCount;
      }

      console.log(`📊 [L2 Cache Results]:`);
      console.log(`   - stremio_stream_cache: ${streamDeleted} records deleted.`);
      console.log(`   - stremio_imdb_mappings: ${mappingDeleted} records deleted.`);
    }

    const elapsed = Date.now() - startTime;
    console.log(`\n✨ Cache maintenance completed in ${elapsed}ms.`);
    return {
      success: true,
      l1Flushed: !flags.dryRun ? l1Flushed : true,
      l2Available: true,
      streamDeleted,
      mappingDeleted,
      elapsed
    };

  } catch (err) {
    console.error(`❌ [Cache Flush CLI Error] Fatal error during execution: ${err.message}`);
    if (require.main === module) {
      process.exit(1);
    }
    throw err;
  }
}

if (require.main === module) {
  main().then(() => process.exit(0)).catch(() => process.exit(1));
}

module.exports = { parseArgs, main, printHelp };
