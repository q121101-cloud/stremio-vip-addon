'use strict';

const NodeCache = require('node-cache');
const { CACHE_TTL } = require('../config');

// In-Memory L1 Cache instance
const cache = new NodeCache({
  stdTTL: CACHE_TTL.MEMORY_STREAM || 300,
  checkperiod: 120,
  useClones: false
});

/**
 * Safe get wrapper
 * @param {string} key
 * @returns {any|null}
 */
function getCache(key) {
  try {
    return cache.get(key) || null;
  } catch (err) {
    console.warn(`[Cache Get Error] ${key}:`, err.message);
    return null;
  }
}

/**
 * Safe set wrapper
 * @param {string} key
 * @param {any} value
 * @param {number} [ttl] - TTL in seconds
 * @returns {boolean}
 */
function setCache(key, value, ttl) {
  try {
    if (ttl !== undefined) {
      return cache.set(key, value, ttl);
    }
    return cache.set(key, value);
  } catch (err) {
    console.warn(`[Cache Set Error] ${key}:`, err.message);
    return false;
  }
}

/**
 * Safe delete wrapper
 * @param {string} key
 * @returns {number}
 */
function delCache(key) {
  try {
    return cache.del(key);
  } catch (err) {
    console.warn(`[Cache Del Error] ${key}:`, err.message);
    return 0;
  }
}

/**
 * Flush all cached items
 */
function flushCache() {
  try {
    cache.flushAll();
    return true;
  } catch (err) {
    console.warn('[Cache Flush Error]:', err.message);
    return false;
  }
}

module.exports = {
  cache,
  NodeCache,
  getCache,
  setCache,
  delCache,
  flushCache
};
