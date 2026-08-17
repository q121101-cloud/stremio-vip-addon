'use strict';

/**
 * ============================================================
 *  VIP Movies Addon — src/lib/cache.js
 *  LRU In-Memory Cache (không cần thêm dependency)
 *
 *  Đặc điểm:
 *  - Thuật toán LRU dùng Map (giữ insertion order)
 *  - TTL per entry (tự hết hạn sau N giây)
 *  - Max size eviction (xóa entry cũ nhất khi đầy)
 *  - Thread-safe với Node.js single-thread model
 * ============================================================
 */

class LRUCache {
  /**
   * @param {number} maxSize  - Số entry tối đa
   * @param {number} defaultTTL - TTL mặc định (giây)
   */
  constructor(maxSize = 1000, defaultTTL = 300) {
    this.maxSize    = maxSize;
    this.defaultTTL = defaultTTL * 1000; // convert to ms
    this._map       = new Map(); // key → { value, expiresAt }
    this._hits      = 0;
    this._misses    = 0;
    this._evictions = 0;
  }

  /**
   * Lấy giá trị từ cache
   * @param {string} key
   * @returns {any|undefined} — undefined nếu miss hoặc expired
   */
  get(key) {
    const entry = this._map.get(key);
    if (!entry) { this._misses++; return undefined; }

    // Check expiry
    if (Date.now() > entry.expiresAt) {
      this._map.delete(key);
      this._misses++;
      return undefined;
    }

    // LRU: move to end (most recently used)
    this._map.delete(key);
    this._map.set(key, entry);
    this._hits++;
    return entry.value;
  }

  /**
   * Lưu giá trị vào cache
   * @param {string} key
   * @param {any}    value
   * @param {number} [ttl] - TTL riêng (giây). Dùng defaultTTL nếu không truyền.
   */
  set(key, value, ttl) {
    const ttlMs = (ttl != null ? ttl : this.defaultTTL / 1000) * 1000;

    // Nếu key đã tồn tại, xóa trước để re-insert về cuối (LRU)
    if (this._map.has(key)) this._map.delete(key);

    // Evict LRU entry nếu đầy
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

  /**
   * Xóa một entry
   * @param {string} key
   */
  del(key) {
    this._map.delete(key);
  }

  /**
   * Xóa tất cả entries
   */
  clear() {
    this._map.clear();
    this._hits      = 0;
    this._misses    = 0;
    this._evictions = 0;
  }

  /**
   * Số entry hiện tại (bao gồm cả expired chưa được dọn)
   */
  get size() { return this._map.size; }

  /**
   * Dọn dẹp các entry đã expired
   * Gọi định kỳ để giải phóng memory
   */
  prune() {
    const now = Date.now();
    let count = 0;
    for (const [key, entry] of this._map) {
      if (now > entry.expiresAt) {
        this._map.delete(key);
        count++;
      }
    }
    return count;
  }

  /**
   * Thống kê cache
   */
  stats() {
    const total = this._hits + this._misses;
    return {
      size:      this._map.size,
      maxSize:   this.maxSize,
      hits:      this._hits,
      misses:    this._misses,
      evictions: this._evictions,
      hitRate:   total > 0 ? ((this._hits / total) * 100).toFixed(1) + '%' : '0%',
    };
  }
}

// ─── Shared Cache Instances ────────────────────────────────────

/**
 * IMDb ID ↔ Phim Slug mapping cache
 * TTL: 24 giờ — Giảm 90% số request tìm kiếm lặp lại
 * Max: 5.000 IMDb IDs
 */
const imdbCache = new LRUCache(5000, 86400);

/**
 * m3u8 Playlist content cache
 * TTL: 10 phút — Instant Playback cho lần xem lại
 * Max: 500 playlists
 */
const m3u8Cache = new LRUCache(500, 600);

/**
 * Catalog API response cache
 * TTL: 5 phút
 * Max: 200 entries
 */
const catalogCache = new LRUCache(200, 300);

/**
 * Film detail cache
 * TTL: 10 phút
 * Max: 1.000 slugs
 */
const detailCache = new LRUCache(1000, 600);

// Tự động dọn dẹp expired entries mỗi 5 phút
setInterval(() => {
  const pruned = [
    imdbCache.prune(),
    m3u8Cache.prune(),
    catalogCache.prune(),
    detailCache.prune(),
  ].reduce((a, b) => a + b, 0);
  if (pruned > 0) {
    console.log(`[Cache] Pruned ${pruned} expired entries`);
  }
}, 5 * 60 * 1000).unref(); // .unref() để không giữ process sống

module.exports = {
  LRUCache,
  imdbCache,
  m3u8Cache,
  catalogCache,
  detailCache,
};
