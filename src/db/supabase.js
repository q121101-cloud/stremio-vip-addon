'use strict';

/**
 * ============================================================
 *  VIP Movies Addon — src/db/supabase.js
 *  Supabase PostgreSQL REST Client & Media/Stream DB Helpers
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

function isReady() {
  return isSupabaseReady && supabase !== null;
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
  if (!isReady() || !imdbId) return null;
  const cleanId = String(imdbId).toLowerCase().trim();
  try {
    const { data, error } = await supabase
      .from('media_mappings')
      .select('*')
      .eq('imdb_id', cleanId)
      .single();

    if (error || !data) return null;
    return data;
  } catch {
    return null;
  }
}

/**
 * Upsert cross-provider media mapping into media_mappings
 * @param {object} mediaData
 * @returns {Promise<boolean>}
 */
async function saveMediaMapping(mediaData) {
  if (!isReady() || !mediaData || !mediaData.imdb_id) return false;
  try {
    const cleanId = String(mediaData.imdb_id).toLowerCase().trim();
    const payload = {
      imdb_id: cleanId,
      tmdb_id: mediaData.tmdb_id ? String(mediaData.tmdb_id).trim() : null,
      type: mediaData.type || 'movie',
      title: mediaData.title || '',
      original_title: mediaData.original_title || null,
      year: mediaData.year ? parseInt(mediaData.year, 10) : null,
      slug_kkphim: mediaData.slug_kkphim || null,
      slug_nguonc: mediaData.slug_nguonc || null,
      slug_vsmov: mediaData.slug_vsmov || null,
      episodes_data: mediaData.episodes_data || {},
      updated_at: new Date().toISOString(),
    };

    const { error } = await supabase
      .from('media_mappings')
      .upsert(payload, { onConflict: 'imdb_id' });

    return !error;
  } catch {
    return false;
  }
}

// ─── 2. Persistent Stream Cache Query Helpers (stream_cache table) ───

/**
 * Retrieve cached streams from stream_cache table
 * @param {string} streamKey - Format: "{imdb_id}:{season}:{episode}"
 * @returns {Promise<Array|null>}
 */
async function getStreamCache(streamKey) {
  if (!isReady() || !streamKey) return null;
  try {
    const { data, error } = await supabase
      .from('stream_cache')
      .select('streams, expires_at')
      .eq('stream_key', streamKey)
      .gt('expires_at', new Date().toISOString())
      .single();

    if (error || !data || !Array.isArray(data.streams)) return null;
    return data.streams;
  } catch {
    return null;
  }
}

/**
 * Save streams into stream_cache table
 * @param {string} streamKey
 * @param {Array} streams
 * @param {number} [ttlSeconds=600]
 * @returns {Promise<boolean>}
 */
async function setStreamCache(streamKey, streams, ttlSeconds = 600) {
  if (!isReady() || !streamKey || !Array.isArray(streams) || streams.length === 0) return false;
  try {
    const expiresAt = new Date(Date.now() + ttlSeconds * 1000).toISOString();
    const { error } = await supabase
      .from('stream_cache')
      .upsert(
        {
          stream_key: streamKey,
          streams: streams,
          expires_at: expiresAt,
          created_at: new Date().toISOString(),
        },
        { onConflict: 'stream_key' }
      );

    return !error;
  } catch {
    return false;
  }
}

// ─── 3. General Cache Entries (cache_entries fallback table) ────

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

module.exports = {
  isReady,
  getClient,
  getMediaMapping,
  saveMediaMapping,
  getStreamCache,
  setStreamCache,
  getCachedValue,
  setCachedValue,
  deleteCachedValue,
};
