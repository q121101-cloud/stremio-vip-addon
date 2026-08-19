'use strict';

/**
 * ============================================================
 *  VIP Movies Addon — src/db/supabase.js
 *  Supabase PostgreSQL REST Client & Database Query Helpers
 * ============================================================
 */

require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

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
    console.log('[Supabase] PostgreSQL client successfully initialized.');
  } catch (err) {
    console.warn('[Supabase] Initialization warning:', err.message);
  }
}

/**
 * Check if Supabase client is connected and ready
 * @returns {boolean}
 */
function isReady() {
  return isSupabaseReady && supabase !== null;
}

/**
 * Get raw Supabase client
 */
function getClient() {
  return supabase;
}

/**
 * Retrieve cached item from Supabase cache_entries table
 * @param {string} namespace
 * @param {string} key
 * @returns {Promise<any|null>}
 */
async function getCachedValue(namespace, key) {
  if (!isReady()) return null;
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
  } catch {
    return null;
  }
}

/**
 * Upsert cached item in Supabase cache_entries table
 * @param {string} namespace
 * @param {string} key
 * @param {any} value
 * @param {number} [ttlSeconds=300]
 * @returns {Promise<boolean>}
 */
async function setCachedValue(namespace, key, value, ttlSeconds = 300) {
  if (!isReady() || value === undefined) return false;
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
  } catch {
    return false;
  }
}

/**
 * Delete a cached item
 * @param {string} namespace
 * @param {string} key
 * @returns {Promise<boolean>}
 */
async function deleteCachedValue(namespace, key) {
  if (!isReady()) return false;
  const fullKey = `${namespace}:${key}`;
  try {
    const { error } = await supabase
      .from('cache_entries')
      .delete()
      .eq('key', fullKey);
    return !error;
  } catch {
    return false;
  }
}

/**
 * Save IMDb -> Provider Slug mapping
 * @param {string} imdbId
 * @param {string} provider
 * @param {string} slug
 * @param {object} [meta={}]
 * @returns {Promise<boolean>}
 */
async function saveImdbMapping(imdbId, provider, slug, meta = {}) {
  if (!isReady() || !imdbId || !provider || !slug) return false;
  try {
    const { error } = await supabase
      .from('imdb_mappings')
      .upsert(
        {
          imdb_id: String(imdbId).toLowerCase().trim(),
          provider: String(provider).toLowerCase().trim(),
          slug: String(slug).trim(),
          title: meta.title || null,
          year: meta.year ? parseInt(meta.year, 10) : null,
          metadata: meta,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'imdb_id,provider' }
      );

    return !error;
  } catch {
    return false;
  }
}

/**
 * Retrieve IMDb mapping for a provider
 * @param {string} imdbId
 * @param {string} provider
 * @returns {Promise<{ slug: string, metadata: object }|null>}
 */
async function getImdbMapping(imdbId, provider) {
  if (!isReady() || !imdbId || !provider) return null;
  try {
    const { data, error } = await supabase
      .from('imdb_mappings')
      .select('slug, metadata')
      .eq('imdb_id', String(imdbId).toLowerCase().trim())
      .eq('provider', String(provider).toLowerCase().trim())
      .single();

    if (error || !data) return null;
    return data;
  } catch {
    return null;
  }
}

module.exports = {
  isReady,
  getClient,
  getCachedValue,
  setCachedValue,
  deleteCachedValue,
  saveImdbMapping,
  getImdbMapping,
};
