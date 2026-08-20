'use strict';

const { createClient } = require('@supabase/supabase-js');
const { getCache, setCache, delCache } = require('./cache');
const { SUPABASE, CACHE_TTL } = require('../config');

// Circuit Breaker State for Fault Isolation
const CIRCUIT_BREAKER = {
  failureCount: 0,
  maxFailures: 3,
  cooldownMs: 60000, // 60 seconds
  nextRetryTime: 0,
  isOpen() {
    if (this.failureCount >= this.maxFailures) {
      if (Date.now() < this.nextRetryTime) {
        return true;
      }
      // Half-open transition: allow next attempt
      return false;
    }
    return false;
  },
  recordSuccess() {
    this.failureCount = 0;
    this.nextRetryTime = 0;
  },
  recordFailure(err) {
    this.failureCount += 1;
    if (this.failureCount >= this.maxFailures) {
      this.nextRetryTime = Date.now() + this.cooldownMs;
      console.warn(`[Supabase Circuit Breaker] Breaker tripped to OPEN (${this.failureCount} errors). Bypassing DB for ${this.cooldownMs / 1000}s. Last error: ${err?.message}`);
    }
  },
  reset() {
    this.failureCount = 0;
    this.nextRetryTime = 0;
  }
};

let supabaseClient = null;
let isConfiguredFlag = false;

// Initialize Supabase Client Safely
try {
  if (SUPABASE.URL && (SUPABASE.SERVICE_ROLE_KEY || SUPABASE.ANON_KEY)) {
    const key = SUPABASE.SERVICE_ROLE_KEY || SUPABASE.ANON_KEY;
    new URL(SUPABASE.URL); // Validate URL format
    supabaseClient = createClient(SUPABASE.URL, key, {
      auth: { persistSession: false, autoRefreshToken: false }
    });
    isConfiguredFlag = true;
  }
} catch (err) {
  console.warn(`[Supabase Init Error] Invalid configuration: ${err.message}. Operating in pure L1 mode.`);
  supabaseClient = null;
  isConfiguredFlag = false;
}

/**
 * Check if Supabase client is configured.
 * @returns {boolean}
 */
function isConfigured() {
  return isConfiguredFlag && supabaseClient !== null;
}

/**
 * Check if Supabase is configured and circuit breaker is healthy.
 * @returns {boolean}
 */
function isSupabaseAvailable() {
  return isConfigured() && !CIRCUIT_BREAKER.isOpen();
}

/**
 * Helper to wrap any async DB call with strict timeout and circuit breaker protection.
 * @template T
 * @param {() => Promise<T>} fn
 * @param {number} [timeoutMs=1500]
 * @returns {Promise<T|null>}
 */
async function safeDbCall(fn, timeoutMs = 1500) {
  if (!isSupabaseAvailable()) return null;

  let timer = null;
  try {
    const timeoutPromise = new Promise((_, reject) => {
      timer = setTimeout(() => {
        reject(new Error(`Database operation timed out after ${timeoutMs}ms`));
      }, timeoutMs);
      if (typeof timer?.unref === 'function') timer.unref();
    });

    const result = await Promise.race([Promise.resolve().then(() => fn()), timeoutPromise]);
    CIRCUIT_BREAKER.recordSuccess();
    return result;
  } catch (err) {
    CIRCUIT_BREAKER.recordFailure(err);
    console.warn(`[Supabase DB Error]: ${err.message}`);
    return null;
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/**
 * Multi-tier get: L1 (RAM) -> L2 (Supabase).
 * If found in L2, repopulates L1.
 * @param {string} cacheKey
 * @returns {Promise<Array<Object>|null>}
 */
async function getStreamCache(cacheKey) {
  if (!cacheKey) return null;

  // 1. Check L1 Memory Cache (<1ms)
  const l1Data = getCache(cacheKey);
  if (l1Data) {
    return l1Data;
  }

  // 2. Check L2 Supabase PostgreSQL (~30-50ms)
  const l2Data = await safeDbCall(async () => {
    const { data, error } = await supabaseClient
      .from('stremio_stream_cache')
      .select('streams, expires_at')
      .eq('cache_key', cacheKey)
      .single();

    if (error || !data) return null;

    // Check expiration
    if (data.expires_at && new Date(data.expires_at).getTime() < Date.now()) {
      return null;
    }

    return Array.isArray(data.streams) ? data.streams : null;
  });

  // 3. Repopulate L1 Cache if found in L2
  if (l2Data) {
    setCache(cacheKey, l2Data, CACHE_TTL.MEMORY_STREAM || 300);
    return l2Data;
  }

  return null;
}

/**
 * Multi-tier set: writes to L1 (RAM) and async upserts to L2 (Supabase).
 * @param {string} cacheKey
 * @param {Array<Object>} streams
 * @param {Object} [meta={}]
 * @param {number} [ttlHours=CACHE_TTL.DB_STREAM_HOURS]
 * @returns {Promise<boolean>}
 */
async function setStreamCache(cacheKey, streams, meta = {}, ttlHours = CACHE_TTL.DB_STREAM_HOURS || 12) {
  if (!cacheKey || !Array.isArray(streams)) return false;

  // 1. Write to L1 Memory Cache
  setCache(cacheKey, streams, CACHE_TTL.MEMORY_STREAM || 300);

  // 2. Upsert to L2 Supabase
  const result = await safeDbCall(async () => {
    const expiresAt = new Date(Date.now() + ttlHours * 3600 * 1000).toISOString();
    const payload = {
      cache_key: cacheKey,
      media_id: meta.mediaId || cacheKey.split(':').slice(2).join(':') || cacheKey,
      type: meta.type || (cacheKey.includes(':series:') ? 'series' : 'movie'),
      provider: meta.provider || 'all',
      streams: streams,
      expires_at: expiresAt
    };

    const { error } = await supabaseClient
      .from('stremio_stream_cache')
      .upsert(payload, { onConflict: 'cache_key' });

    if (error) throw error;
    return true;
  });

  return result !== null ? !!result : true;
}

/**
 * Multi-tier get for IMDb mapping: L1 (RAM) -> L2 (Supabase).
 * @param {string} imdbId
 * @returns {Promise<Object|null>}
 */
async function getImdbMapping(imdbId) {
  if (!imdbId) return null;
  const l1Key = `imdb_mapping:${imdbId}`;

  // 1. Check L1 Memory Cache
  const l1Data = getCache(l1Key);
  if (l1Data) return l1Data;

  // 2. Check L2 Supabase
  const l2Data = await safeDbCall(async () => {
    const { data, error } = await supabaseClient
      .from('stremio_imdb_mappings')
      .select('*')
      .eq('imdb_id', imdbId)
      .single();

    if (error || !data) return null;

    if (data.expires_at && new Date(data.expires_at).getTime() < Date.now()) {
      return null;
    }

    return data;
  });

  // 3. Repopulate L1 Cache if found
  if (l2Data) {
    setCache(l1Key, l2Data, CACHE_TTL.MEMORY_META || 3600);
    return l2Data;
  }

  return null;
}

/**
 * Multi-tier set for IMDb mapping.
 * @param {string} imdbId
 * @param {Object} mappingData
 * @param {number} [ttlDays=CACHE_TTL.DB_MAPPING_DAYS]
 * @returns {Promise<boolean>}
 */
async function setImdbMapping(imdbId, mappingData, ttlDays = CACHE_TTL.DB_MAPPING_DAYS || 7) {
  if (!imdbId || !mappingData) return false;
  const l1Key = `imdb_mapping:${imdbId}`;

  // 1. Write to L1 Cache
  setCache(l1Key, mappingData, CACHE_TTL.MEMORY_META || 3600);

  // 2. Upsert to L2 Supabase
  const result = await safeDbCall(async () => {
    const expiresAt = new Date(Date.now() + ttlDays * 86400 * 1000).toISOString();
    const payload = {
      imdb_id: imdbId,
      type: mappingData.type || 'movie',
      title: mappingData.title || '',
      original_title: mappingData.originalTitle || null,
      year: mappingData.year || null,
      slug_kkphim: mappingData.slugKkphim || null,
      slug_vsmov: mappingData.slugVsmov || null,
      slug_nguonc: mappingData.slugNguonc || null,
      aliases: mappingData.aliases || [],
      metadata: mappingData.metadata || {},
      expires_at: expiresAt
    };

    const { error } = await supabaseClient
      .from('stremio_imdb_mappings')
      .upsert(payload, { onConflict: 'imdb_id' });

    if (error) throw error;
    return true;
  });

  return result !== null ? !!result : true;
}

/**
 * Deletes stream cache entries by key, provider, or expired status.
 * @param {Object} options
 * @param {string} [options.cacheKey]
 * @param {string} [options.provider]
 * @param {boolean} [options.expiredOnly]
 * @returns {Promise<{ count: number }>}
 */
async function deleteStreamCache({ cacheKey, provider, expiredOnly } = {}) {
  if (cacheKey) {
    delCache(cacheKey);
  }

  const result = await safeDbCall(async () => {
    let query = supabaseClient.from('stremio_stream_cache').delete({ count: 'exact' });

    if (cacheKey) {
      query = query.eq('cache_key', cacheKey);
    }
    if (provider && provider !== 'all') {
      query = query.eq('provider', provider);
    }
    if (expiredOnly) {
      query = query.lt('expires_at', new Date().toISOString());
    }

    const { count, error } = await query;
    if (error) throw error;
    return { count: count || 0 };
  });

  return result || { count: 0 };
}

/**
 * Flushes all stream and mapping caches from database.
 * @param {boolean} [expiredOnly=false]
 * @returns {Promise<{ streamCount: number, mappingCount: number }>}
 */
async function flushDatabaseCache(expiredOnly = false) {
  const result = await safeDbCall(async () => {
    let streamQuery = supabaseClient.from('stremio_stream_cache').delete({ count: 'exact' });
    let mappingQuery = supabaseClient.from('stremio_imdb_mappings').delete({ count: 'exact' });

    if (expiredOnly) {
      const now = new Date().toISOString();
      streamQuery = streamQuery.lt('expires_at', now);
      mappingQuery = mappingQuery.lt('expires_at', now);
    } else {
      // Matches all non-empty rows
      streamQuery = streamQuery.neq('cache_key', '');
      mappingQuery = mappingQuery.neq('imdb_id', '');
    }

    const [streamRes, mappingRes] = await Promise.all([streamQuery, mappingQuery]);

    return {
      streamCount: streamRes?.count || 0,
      mappingCount: mappingRes?.count || 0
    };
  });

  return result || { streamCount: 0, mappingCount: 0 };
}

module.exports = {
  supabaseClient,
  isConfigured,
  isSupabaseAvailable,
  CIRCUIT_BREAKER,
  safeDbCall,
  getStreamCache,
  setStreamCache,
  getImdbMapping,
  setImdbMapping,
  deleteStreamCache,
  flushDatabaseCache
};
