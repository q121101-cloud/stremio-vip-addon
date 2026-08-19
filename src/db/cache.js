'use strict';

/**
 * ============================================================
 *  VIP Movies Addon — src/db/cache.js
 *  L1 (Memory LRU) + L2 (Supabase PostgreSQL) Tiered Cache Architecture
 * ============================================================
 */

const supabaseDb = require('./supabase');
const { TTL } = require('../config/constants');

// ─── 1. In-Memory LRU Cache Class (<1ms Access) ───────────────
class LRUCache {
  /**
   * @param {number} maxSize
   * @param {number} defaultTTL - Seconds
   */
  constructor(maxSize = 1000, defaultTTL = 300) {
    this.maxSize    = maxSize;
    this.defaultTTL = defaultTTL * 1000; // ms
    this._map       = new Map();
    this._hits      = 0;
    this._misses    = 0;
    this._evictions = 0;
  }

  get(key) {
    const entry = this._map.get(key);
    if (!entry) {
      this._misses++;
      return undefined;
    }

    if (Date.now() > entry.expiresAt) {
      this._map.delete(key);
      this._misses++;
      return undefined;
    }

    this._map.delete(key);
    this._map.set(key, entry);
    this._hits++;
    return entry.value;
  }

  set(key, value, ttlSeconds) {
    const ttlMs = (ttlSeconds != null ? ttlSeconds : this.defaultTTL / 1000) * 1000;
    if (this._map.has(key)) this._map.delete(key);

    if (this._map.size >= this.maxSize) {
      const oldestKey = this._map.keys().next().value;
      this._map.delete(oldestKey);
      this._evictions++;
    }

    this._map.set(key, {
      value,
      expiresAt: Date.now() + ttlMs,
    });
  }

  del(key) {
    this._map.delete(key);
  }

  clear() {
    this._map.clear();
    this._hits      = 0;
    this._misses    = 0;
    this._evictions = 0;
  }

  get size() {
    return this._map.size;
  }

  get stats() {
    return {
      size: this._map.size,
      hits: this._hits,
      misses: this._misses,
      evictions: this._evictions,
    };
  }
}

// ─── 2. Tiered Cache (L1 Memory + L2 Supabase) ─────────────────
class TieredCache {
  /**
   * @param {string} namespace - e.g. 'catalog', 'detail', 'meta', 'stream'
   * @param {number} maxSize
   * @param {number} defaultTTL - Seconds
   */
  constructor(namespace, maxSize = 1000, defaultTTL = 300) {
    this.namespace = namespace;
    this.l1 = new LRUCache(maxSize, defaultTTL);
    this.defaultTTL = defaultTTL;
  }

  /**
   * Synchronous L1 lookup (instantaneous < 1ms)
   * @param {string} key
   * @returns {any|undefined}
   */
  getSync(key) {
    return this.l1.get(key);
  }

  /**
   * Asynchronous Tiered lookup (L1 -> L2 Supabase)
   * @param {string} key
   * @returns {Promise<any|undefined>}
   */
  async get(key) {
    const l1Hit = this.l1.get(key);
    if (l1Hit !== undefined) {
      return l1Hit;
    }

    // L1 Miss: Check L2 Supabase
    if (supabaseDb.isReady()) {
      try {
        const l2Hit = await supabaseDb.getCachedValue(this.namespace, key);
        if (l2Hit !== null && l2Hit !== undefined) {
          // Populate L1 for future instant lookups
          this.l1.set(key, l2Hit, this.defaultTTL);
          return l2Hit;
        }
      } catch {}
    }

    return undefined;
  }

  /**
   * Write-through Cache (L1 + background L2 Supabase)
   * @param {string} key
   * @param {any} value
   * @param {number} [ttlSeconds]
   */
  set(key, value, ttlSeconds) {
    if (value === undefined) return;
    const ttl = ttlSeconds != null ? ttlSeconds : this.defaultTTL;

    // L1 Write (Immediate)
    this.l1.set(key, value, ttl);

    // L2 Write (Background async)
    if (supabaseDb.isReady()) {
      supabaseDb.setCachedValue(this.namespace, key, value, ttl).catch(() => {});
    }
  }

  /**
   * Delete key in both tiers
   * @param {string} key
   */
  del(key) {
    this.l1.del(key);
    if (supabaseDb.isReady()) {
      supabaseDb.deleteCachedValue(this.namespace, key).catch(() => {});
    }
  }

  clear() {
    this.l1.clear();
  }

  get stats() {
    return {
      namespace: this.namespace,
      l1: this.l1.stats,
      l2Ready: supabaseDb.isReady(),
    };
  }
}

// ─── 3. Standard Singleton Cache Instances ────────────────────
const catalogCache     = new TieredCache('catalog', 500, TTL.CATALOG);
const detailCache      = new TieredCache('detail', 1000, TTL.DETAIL);
const metaCache        = new TieredCache('meta', 1000, TTL.META);
const streamCache      = new TieredCache('stream', 1000, TTL.STREAM);
const imdbCache        = new TieredCache('imdb', 2000, TTL.IMDB_MAPPING);
const cinemetaCache    = new TieredCache('cinemeta', 2000, TTL.CINEMETA);
const hlsManifestCache = new TieredCache('hls_manifest', 500, TTL.HLS_MANIFEST);

module.exports = {
  LRUCache,
  TieredCache,
  catalogCache,
  detailCache,
  metaCache,
  streamCache,
  imdbCache,
  cinemetaCache,
  hlsManifestCache,
};
