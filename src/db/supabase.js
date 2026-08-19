'use strict';

/**
 * ============================================================
 *  VIP Movies Addon — src/db/supabase.js
 *  Supabase PostgreSQL REST Client & Media/Stream DB Helpers
 * ============================================================
 */

require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.SUPABASE_URL || '';
const supabaseKey = process.env.SUPABASE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || '';

const supabase = (supabaseUrl && supabaseKey) 
  ? createClient(supabaseUrl, supabaseKey, { auth: { persistSession: false } }) 
  : null;

if (supabase) {
  console.log('[Supabase] PostgreSQL client successfully initialized.');
}

function isReady() {
  return supabase !== null;
}

function getClient() {
  return supabase;
}

// ─── 1. Media Mappings Query Helpers (media_mappings table) ────

/**
 * Retrieve cross-provider media mapping by IMDb ID
 * @param {string} imdbId
 * @returns {Promise<object|null>}
 */
async function getMediaMapping(imdbId) {
  if (!supabase || !imdbId) return null;
  try {
    const cleanId = String(imdbId).toLowerCase().trim();
    const { data, error } = await supabase
      .from('media_mappings')
      .select('*')
      .eq('imdb_id', cleanId)
      .maybeSingle();

    if (error) throw error;
    return data;
  } catch (err) {
    console.error('[Supabase Error] getMediaMapping:', err.message);
    return null;
  }
}

/**
 * Upsert cross-provider media mapping into media_mappings
 * @param {object} payload
 * @returns {Promise<object|null>}
 */
async function upsertMediaMapping(payload) {
  if (!supabase || !payload || !payload.imdb_id) return null;
  try {
    const cleanId = String(payload.imdb_id).toLowerCase().trim();
    const formatted = {
      ...payload,
      imdb_id: cleanId,
      updated_at: new Date().toISOString(),
    };
    const { data, error } = await supabase
      .from('media_mappings')
      .upsert(formatted, { onConflict: 'imdb_id' });

    if (error) throw error;
    return data;
  } catch (err) {
    console.error('[Supabase Error] upsertMediaMapping:', err.message);
    return null;
  }
}

const saveMediaMapping = upsertMediaMapping;

// ─── 2. Persistent Stream Cache Query Helpers (stream_cache table) ───

/**
 * Retrieve cached streams from stream_cache table
 * @param {string} streamKey - Format: "{imdb_id}:{season}:{episode}"
 * @returns {Promise<Array|null>}
 */
async function getL2StreamCache(streamKey) {
  if (!supabase || !streamKey) return null;
  try {
    const { data, error } = await supabase
      .from('stream_cache')
      .select('streams, expires_at')
      .eq('stream_key', streamKey)
      .maybeSingle();

    if (error || !data) return null;
    if (new Date(data.expires_at).getTime() <= Date.now()) {
      return null;
    }
    return Array.isArray(data.streams) ? data.streams : null;
  } catch (err) {
    console.error('[Supabase Error] getL2StreamCache:', err.message);
    return null;
  }
}

const getStreamCache = getL2StreamCache;

/**
 * Save streams into stream_cache table
 * @param {string} streamKey
 * @param {Array} streams
 * @param {number} [ttlSeconds=600]
 */
async function setL2StreamCache(streamKey, streams, ttlSeconds = 600) {
  if (!supabase || !streamKey || !streams) return;
  try {
    const expiresAt = new Date(Date.now() + (ttlSeconds || 600) * 1000).toISOString();
    await supabase
      .from('stream_cache')
      .upsert(
        {
          stream_key: streamKey,
          streams,
          expires_at: expiresAt,
          created_at: new Date().toISOString(),
        },
        { onConflict: 'stream_key' }
      );
  } catch (err) {
    console.error('[Supabase Error] setL2StreamCache:', err.message);
  }
}

const setStreamCache = setL2StreamCache;

// ─── 3. General Cache Entries (cache_entries fallback table) ────

async function getCachedValue(namespace, key) {
  if (!supabase || !namespace || !key) return null;
  const fullKey = `${namespace}:${key}`;
  try {
    const { data, error } = await supabase
      .from('cache_entries')
      .select('value, expires_at')
      .eq('key', fullKey)
      .gt('expires_at', new Date().toISOString())
      .maybeSingle();

    if (error || !data) return null;
    return data.value;
  } catch (err) {
    return null;
  }
}

async function setCachedValue(namespace, key, value, ttlSeconds = 300) {
  if (!supabase || value === undefined) return false;
  const fullKey = `${namespace}:${key}`;
  try {
    const expiresAt = new Date(Date.now() + ttlSeconds * 1000).toISOString();
    const { error } = await supabase
      .from('cache_entries')
      .upsert(
        {
          key: fullKey,
          value: value,
          expires_at: expiresAt,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'key' }
      );

    return !error;
  } catch (err) {
    return false;
  }
}

async function deleteCachedValue(namespace, key) {
  if (!supabase) return false;
  const fullKey = `${namespace}:${key}`;
  try {
    const { error } = await supabase
      .from('cache_entries')
      .delete()
      .eq('key', fullKey);
    return !error;
  } catch (err) {
    return false;
  }
}

// ─── 4. Cache Purge & Maintenance Helpers ─────────────────────

/**
 * Purge stale/dirty stream entries from Supabase (stream_cache & cache_entries) and L1 memory cache.
 * Completely safe and silent when Supabase is unconfigured or unreachable.
 * @returns {Promise<{ success: boolean, count: number, details?: object, error?: string, inMemoryCleared?: boolean, unconfigured?: boolean }>}
 */
async function flushStreamCache() {
  let inMemoryCleared = false;

  // 1. Clear In-Memory L1 Cache
  try {
    const cache = require('./cache');
    if (cache.l1Cache && typeof cache.l1Cache.clear === 'function') {
      cache.l1Cache.clear();
      inMemoryCleared = true;
    }
    if (cache.streamCache && typeof cache.streamCache.clear === 'function') {
      cache.streamCache.clear();
    }
  } catch (err) {
    // Ignore memory cache clearing errors
  }

  // 2. Clear Supabase L2 stream_cache & stream:* cache_entries
  if (!supabase) {
    return {
      success: true,
      count: 0,
      inMemoryCleared,
      unconfigured: true,
      message: 'Supabase client unconfigured or unavailable. L1 memory cache cleared.',
    };
  }

  try {
    let streamCacheCount = 0;
    let cacheEntriesCount = 0;

    // Delete from stream_cache table
    try {
      const { data, count, error } = await supabase
        .from('stream_cache')
        .delete({ count: 'exact' })
        .not('stream_key', 'is', null);

      if (error) {
        console.error('[Supabase Error] flushStreamCache (stream_cache):', error.message);
      } else {
        streamCacheCount = count != null ? count : (Array.isArray(data) ? data.length : 0);
      }
    } catch (err) {
      console.error('[Supabase Error] flushStreamCache (stream_cache exception):', err.message);
    }

    // Delete stream entries from cache_entries table (keys starting with 'stream:')
    try {
      const { data, count, error } = await supabase
        .from('cache_entries')
        .delete({ count: 'exact' })
        .like('key', 'stream:%');

      if (error) {
        console.error('[Supabase Error] flushStreamCache (cache_entries):', error.message);
      } else {
        cacheEntriesCount = count != null ? count : (Array.isArray(data) ? data.length : 0);
      }
    } catch (err) {
      console.error('[Supabase Error] flushStreamCache (cache_entries exception):', err.message);
    }

    const totalCount = streamCacheCount + cacheEntriesCount;
    return {
      success: true,
      count: totalCount,
      inMemoryCleared,
      details: {
        stream_cache: streamCacheCount,
        cache_entries: cacheEntriesCount,
        inMemory: inMemoryCleared,
      },
    };
  } catch (err) {
    console.error('[Supabase Error] flushStreamCache:', err.message);
    return {
      success: false,
      count: 0,
      inMemoryCleared,
      error: err.message,
    };
  }
}

const clearStreamCache = flushStreamCache;

/**
 * Purge all cached tables (stream_cache and cache_entries) and L1 in-memory caches.
 * @returns {Promise<{ success: boolean, count: number, tables?: object, inMemoryCleared?: boolean, error?: string, unconfigured?: boolean }>}
 */
async function flushAllCache() {
  let inMemoryCleared = false;

  // 1. Clear All In-Memory Caches
  try {
    const cache = require('./cache');
    const allCaches = [
      cache.l1Cache,
      cache.catalogCache,
      cache.detailCache,
      cache.metaCache,
      cache.streamCache,
      cache.imdbCache,
      cache.cinemetaCache,
      cache.hlsManifestCache,
    ];
    for (const c of allCaches) {
      if (c && typeof c.clear === 'function') {
        c.clear();
      }
    }
    inMemoryCleared = true;
  } catch (err) {
    // Ignore memory cache clearing errors
  }

  // 2. Clear Supabase Tables
  if (!supabase) {
    return {
      success: true,
      count: 0,
      inMemoryCleared,
      unconfigured: true,
      message: 'Supabase client unconfigured or unavailable. L1 memory caches cleared.',
    };
  }

  try {
    let streamCacheCount = 0;
    let cacheEntriesCount = 0;

    // Purge stream_cache
    try {
      const { data, count, error } = await supabase
        .from('stream_cache')
        .delete({ count: 'exact' })
        .not('stream_key', 'is', null);

      if (error) {
        console.error('[Supabase Error] flushAllCache (stream_cache):', error.message);
      } else {
        streamCacheCount = count != null ? count : (Array.isArray(data) ? data.length : 0);
      }
    } catch (err) {
      console.error('[Supabase Error] flushAllCache (stream_cache exception):', err.message);
    }

    // Purge cache_entries
    try {
      const { data, count, error } = await supabase
        .from('cache_entries')
        .delete({ count: 'exact' })
        .not('key', 'is', null);

      if (error) {
        console.error('[Supabase Error] flushAllCache (cache_entries):', error.message);
      } else {
        cacheEntriesCount = count != null ? count : (Array.isArray(data) ? data.length : 0);
      }
    } catch (err) {
      console.error('[Supabase Error] flushAllCache (cache_entries exception):', err.message);
    }

    const totalCount = streamCacheCount + cacheEntriesCount;
    return {
      success: true,
      count: totalCount,
      tables: {
        stream_cache: streamCacheCount,
        cache_entries: cacheEntriesCount,
      },
      inMemoryCleared,
    };
  } catch (err) {
    console.error('[Supabase Error] flushAllCache:', err.message);
    return {
      success: false,
      count: 0,
      inMemoryCleared,
      error: err.message,
    };
  }
}

const flushCache = flushAllCache;

/**
 * Prune expired entries from Supabase cache tables where expires_at < NOW().
 * @returns {Promise<{ success: boolean, count: number, pruned?: object, error?: string, unconfigured?: boolean }>}
 */
async function pruneExpiredCache() {
  if (!supabase) {
    return {
      success: true,
      count: 0,
      unconfigured: true,
      message: 'Supabase client unconfigured or unavailable.',
    };
  }

  try {
    const nowIso = new Date().toISOString();
    let streamCachePruned = 0;
    let cacheEntriesPruned = 0;

    // Prune expired from stream_cache
    try {
      const { data, count, error } = await supabase
        .from('stream_cache')
        .delete({ count: 'exact' })
        .lt('expires_at', nowIso);

      if (error) {
        console.error('[Supabase Error] pruneExpiredCache (stream_cache):', error.message);
      } else {
        streamCachePruned = count != null ? count : (Array.isArray(data) ? data.length : 0);
      }
    } catch (err) {
      console.error('[Supabase Error] pruneExpiredCache (stream_cache exception):', err.message);
    }

    // Prune expired from cache_entries
    try {
      const { data, count, error } = await supabase
        .from('cache_entries')
        .delete({ count: 'exact' })
        .lt('expires_at', nowIso);

      if (error) {
        console.error('[Supabase Error] pruneExpiredCache (cache_entries):', error.message);
      } else {
        cacheEntriesPruned = count != null ? count : (Array.isArray(data) ? data.length : 0);
      }
    } catch (err) {
      console.error('[Supabase Error] pruneExpiredCache (cache_entries exception):', err.message);
    }

    const totalPruned = streamCachePruned + cacheEntriesPruned;
    return {
      success: true,
      count: totalPruned,
      pruned: {
        stream_cache: streamCachePruned,
        cache_entries: cacheEntriesPruned,
      },
    };
  } catch (err) {
    console.error('[Supabase Error] pruneExpiredCache:', err.message);
    return {
      success: false,
      count: 0,
      error: err.message,
    };
  }
}

const pruneCache = pruneExpiredCache;

module.exports = {
  supabase,
  isReady,
  getClient,
  getMediaMapping,
  upsertMediaMapping,
  saveMediaMapping,
  getL2StreamCache,
  setL2StreamCache,
  getStreamCache,
  setStreamCache,
  getCachedValue,
  setCachedValue,
  deleteCachedValue,
  flushStreamCache,
  clearStreamCache,
  flushAllCache,
  flushCache,
  pruneExpiredCache,
  pruneCache,
};
