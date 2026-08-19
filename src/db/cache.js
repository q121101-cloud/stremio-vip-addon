'use strict';

/**
 * ============================================================
 *  VIP Movies Addon — src/db/cache.js
 *  L1 (Memory LRU) + L2 (Supabase PostgreSQL) Tiered Cache Architecture
 * ============================================================
 */

const { getL2StreamCache, setL2StreamCache, getCachedValue, setCachedValue, deleteCachedValue, isReady } = require('./supabase');
const { TTL } = require('../config/constants');

// ─── 1. In-Memory LRU Cache Class (<1ms Access) ───────────────
class LRUCache {
  /**
   * @param {number|object} optionsOrMaxSize
   * @param {number} [defaultTTL=300] - Seconds
   */
  constructor(optionsOrMaxSize = 1000, defaultTTL = 300) {
    if (typeof optionsOrMaxSize === 'object' && optionsOrMaxSize !== null) {
      this.maxSize = optionsOrMaxSize.max || 1000;
      this.defaultTTL = optionsOrMaxSize.ttl ? optionsOrMaxSize.ttl : defaultTTL * 1000;
    } else {
      this.maxSize = optionsOrMaxSize || 1000;
      this.defaultTTL = defaultTTL * 1000; // ms
    }
    this._map = new Map();
    this._hits = 0;
    this._misses = 0;
    this._evictions = 0;
  }

  has(key) {
    const entry = this._map.get(key);
    if (!entry) return false;
    if (Date.now() > entry.expiresAt) {
      this._map.delete(key);
      return false;
    }
    return true;
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

  set(key, value, ttlSecondsOrOpts) {
    let ttlMs = this.defaultTTL;
    if (typeof ttlSecondsOrOpts === 'number') {
      ttlMs = ttlSecondsOrOpts * 1000;
    } else if (typeof ttlSecondsOrOpts === 'object' && ttlSecondsOrOpts?.ttl) {
      ttlMs = ttlSecondsOrOpts.ttl;
    }

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
    this._hits = 0;
    this._misses = 0;
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

// ─── 2. L1 RAM Cache for Streams (1000 items, 10 min TTL) ─────
const l1Cache = new LRUCache({
  max: 1000,
  ttl: 1000 * 60 * 10,
});

/**
 * Retrieve cached streams (L1 RAM -> L2 Supabase)
 * @param {string} streamKey
 * @returns {Promise<Array|null>}
 */
async function getCache(streamKey) {
  // Check L1 RAM Cache
  if (l1Cache.has(streamKey)) {
    return l1Cache.get(streamKey);
  }

  // Check L2 Supabase Stream Cache
  const l2Data = await getL2StreamCache(streamKey);
  if (l2Data) {
    l1Cache.set(streamKey, l2Data); // Populate L1 on hit
    return l2Data;
  }

  return null;
}

/**
 * Set stream cache (L1 RAM + L2 Supabase)
 * @param {string} streamKey
 * @param {Array} streams
 * @param {number} [ttlSeconds=14400] - 4 hours default
 */
async function setCache(streamKey, streams, ttlSeconds = 14400) {
  l1Cache.set(streamKey, streams, { ttl: 1000 * 60 * 10 });
  await setL2StreamCache(streamKey, streams, ttlSeconds);
}

// ─── 3. Tiered Cache Class (L1 Memory + L2 Supabase) ──────────
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

  getSync(key) {
    return this.l1.get(key);
  }

  async get(key) {
    const l1Hit = this.l1.get(key);
    if (l1Hit !== undefined) {
      return l1Hit;
    }

    if (isReady()) {
      try {
        let l2Hit = null;
        if (this.namespace === 'stream') {
          l2Hit = await getL2StreamCache(key);
        }
        if (!l2Hit) {
          l2Hit = await getCachedValue(this.namespace, key);
        }

        if (l2Hit !== null && l2Hit !== undefined) {
          this.l1.set(key, l2Hit, this.defaultTTL);
          return l2Hit;
        }
      } catch {}
    }

    return undefined;
  }

  set(key, value, ttlSeconds) {
    if (value === undefined) return;
    const ttl = ttlSeconds != null ? ttlSeconds : this.defaultTTL;

    this.l1.set(key, value, ttl);

    if (isReady()) {
      if (this.namespace === 'stream' && Array.isArray(value)) {
        setL2StreamCache(key, value, ttl).catch(() => {});
      }
      setCachedValue(this.namespace, key, value, ttl).catch(() => {});
    }
  }

  del(key) {
    this.l1.del(key);
    if (isReady()) {
      deleteCachedValue(this.namespace, key).catch(() => {});
    }
  }

  clear() {
    this.l1.clear();
  }

  get stats() {
    return {
      namespace: this.namespace,
      l1: this.l1.stats,
      l2Ready: isReady(),
    };
  }
}

// ─── 4. Standard Singleton Cache Instances ────────────────────
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
  l1Cache,
  getCache,
  setCache,
  catalogCache,
  detailCache,
  metaCache,
  streamCache,
  imdbCache,
  cinemetaCache,
  hlsManifestCache,
};
