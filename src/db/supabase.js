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
};
