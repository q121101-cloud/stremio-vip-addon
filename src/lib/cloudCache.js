'use strict';

/**
 * ============================================================
 *  VIP Movies Addon — src/lib/cloudCache.js (Engine v1.7.0 Cloud 0đ)
 *  Hybrid Cloud Caching Engine:
 *  - Tier 1: Ultra-fast In-Memory LRU Cache (<1ms)
 *  - Tier 2: Supabase PostgreSQL Persistent Cloud Cache (Metadata, Catalog, Stream URLs)
 *  - Tier 3: Cloudflare R2 Object Storage (M3U8 Playlists, Artwork/Posters)
 *  - Resilient Fallback: Self-healing architecture with zero downtime
 * ============================================================
 */

require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const { S3Client, PutObjectCommand, GetObjectCommand, HeadObjectCommand } = require('@aws-sdk/client-s3');

// ─── 1. Supabase PostgreSQL Client Setup ────────────────────────
let supabase = null;
let isSupabaseReady = false;

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;

if (SUPABASE_URL && SUPABASE_KEY) {
  try {
    supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
      auth: { persistSession: false },
    });
    isSupabaseReady = true;
    console.log('[CloudCache] Supabase PostgreSQL client initialized.');
  } catch (err) {
    console.warn('[CloudCache] Supabase init warning:', err.message);
  }
}

// ─── 2. Cloudflare R2 Object Storage Setup ──────────────────────
let r2Client = null;
let isR2Ready = false;

const R2_ACCESS_KEY_ID = process.env.CLOUDFLARE_R2_ACCESS_KEY_ID;
const R2_SECRET_KEY = process.env.CLOUDFLARE_R2_SECRET_ACCESS_KEY;
const R2_ENDPOINT = process.env.CLOUDFLARE_R2_ENDPOINT;
const R2_BUCKET = process.env.CLOUDFLARE_R2_BUCKET || 'stremio-vip-cache';

if (R2_ACCESS_KEY_ID && R2_SECRET_KEY && R2_ENDPOINT) {
  try {
    r2Client = new S3Client({
      region: 'auto',
      endpoint: R2_ENDPOINT,
      credentials: {
        accessKeyId: R2_ACCESS_KEY_ID,
        secretAccessKey: R2_SECRET_KEY,
      },
      forcePathStyle: true,
    });
    isR2Ready = true;
    console.log('[CloudCache] Cloudflare R2 S3 client initialized.');
  } catch (err) {
    console.warn('[CloudCache] Cloudflare R2 init warning:', err.message);
  }
}

// ─── 3. Supabase Cache Operations ───────────────────────────────

/**
 * Get cached item from Supabase
 * @param {string} namespace - e.g. 'catalog', 'detail', 'imdb', 'stream', 'm3u8'
 * @param {string} key
 * @returns {Promise<any|null>}
 */
async function getSupabaseCache(namespace, key) {
  if (!isSupabaseReady || !supabase) return null;
  const fullKey = `${namespace}:${key}`;
  try {
    const { data, error } = await supabase
      .from('cache_entries')
      .select('value, expires_at')
      .eq('key', fullKey)
      .gt('expires_at', new Date().toISOString())
      .single();

    if (error || !data) return null;
    return data.value;
  } catch (err) {
    // Fail silently to keep memory cache fast
    return null;
  }
}

/**
 * Save item into Supabase cache with TTL
 * @param {string} namespace
 * @param {string} key
 * @param {any} value
 * @param {number} ttlSeconds
 */
async function setSupabaseCache(namespace, key, value, ttlSeconds = 300) {
  if (!isSupabaseReady || !supabase || value === undefined) return;
  const fullKey = `${namespace}:${key}`;
  const expiresAt = new Date(Date.now() + ttlSeconds * 1000).toISOString();

  try {
    await supabase.from('cache_entries').upsert({
      key: fullKey,
      namespace: namespace || 'default',
      value: value,
      expires_at: expiresAt,
      updated_at: new Date().toISOString(),
    });
  } catch (err) {
    // Silent failover
  }
}

/**
 * Delete item from Supabase cache
 * @param {string} namespace
 * @param {string} key
 */
async function deleteSupabaseCache(namespace, key) {
  if (!isSupabaseReady || !supabase) return;
  const fullKey = `${namespace}:${key}`;
  try {
    await supabase.from('cache_entries').delete().eq('key', fullKey);
  } catch (err) {}
}

/**
 * Prune expired cache entries from Supabase
 */
async function pruneSupabaseCache() {
  if (!isSupabaseReady || !supabase) return 0;
  try {
    const { count, error } = await supabase
      .from('cache_entries')
      .delete({ count: 'exact' })
      .lt('expires_at', new Date().toISOString());
    return error ? 0 : (count || 0);
  } catch (err) {
    return 0;
  }
}

// ─── 4. Cloudflare R2 Storage Operations ────────────────────────

/**
 * Upload object to Cloudflare R2
 * @param {string} key
 * @param {string|Buffer} body
 * @param {string} contentType
 * @param {string} [bucket]
 */
async function putR2Object(key, body, contentType = 'application/vnd.apple.mpegurl', bucket = R2_BUCKET) {
  if (!isR2Ready || !r2Client) return false;
  try {
    await r2Client.send(
      new PutObjectCommand({
        Bucket: bucket,
        Key: key,
        Body: body,
        ContentType: contentType,
      })
    );
    return true;
  } catch (err) {
    return false;
  }
}

/**
 * Get object from Cloudflare R2
 * @param {string} key
 * @param {string} [bucket]
 * @returns {Promise<string|null>}
 */
async function getR2Object(key, bucket = R2_BUCKET) {
  if (!isR2Ready || !r2Client) return null;
  try {
    const res = await r2Client.send(
      new GetObjectCommand({
        Bucket: bucket,
        Key: key,
      })
    );
    if (!res || !res.Body) return null;
    return await res.Body.transformToString('utf-8');
  } catch (err) {
    return null;
  }
}

// ─── 5. Hybrid Cache Wrapper ────────────────────────────────────

/**
 * Creates a hybrid cache instance combining LRU in-memory + Supabase + R2
 */
class HybridCache {
  constructor(namespace, memoryCache, defaultTTL = 300) {
    this.namespace = namespace;
    this.memoryCache = memoryCache;
    this.defaultTTL = defaultTTL;
  }

  get(key) {
    // Fast synchronous in-memory read
    return this.memoryCache.get(key);
  }

  async getAsync(key) {
    // 1. Check in-memory LRU
    const memVal = this.memoryCache.get(key);
    if (memVal !== undefined) return memVal;

    // 2. Check Supabase Persistent Cache
    const cloudVal = await getSupabaseCache(this.namespace, key);
    if (cloudVal !== null && cloudVal !== undefined) {
      // Re-populate memory cache
      this.memoryCache.set(key, cloudVal, this.defaultTTL);
      return cloudVal;
    }

    return undefined;
  }

  set(key, value, ttl) {
    const finalTtl = ttl != null ? ttl : this.defaultTTL;
    // 1. In-memory set
    this.memoryCache.set(key, value, finalTtl);

    // 2. Asynchronous write-through to Supabase
    if (value !== undefined && value !== null) {
      setSupabaseCache(this.namespace, key, value, finalTtl).catch(() => {});
    }
  }

  del(key) {
    this.memoryCache.del(key);
    deleteSupabaseCache(this.namespace, key).catch(() => {});
  }

  clear() {
    this.memoryCache.clear();
  }

  prune() {
    return this.memoryCache.prune();
  }

  stats() {
    const memStats = this.memoryCache.stats();
    return {
      ...memStats,
      namespace: this.namespace,
      supabaseConnected: isSupabaseReady,
      r2Connected: isR2Ready,
    };
  }
}

// Periodic background cleanup of expired Supabase rows (every 30 mins)
if (isSupabaseReady) {
  setInterval(() => {
    pruneSupabaseCache().catch(() => {});
  }, 30 * 60 * 1000).unref();
}

module.exports = {
  supabase,
  isSupabaseReady: () => isSupabaseReady,
  r2Client,
  isR2Ready: () => isR2Ready,
  getSupabaseCache,
  setSupabaseCache,
  deleteSupabaseCache,
  pruneSupabaseCache,
  putR2Object,
  getR2Object,
  HybridCache,
};
