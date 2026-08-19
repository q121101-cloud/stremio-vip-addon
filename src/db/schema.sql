-- ============================================================
-- VIP Movies Addon — src/db/schema.sql
-- Enterprise Database Schema for Media Mappings & Stream Cache
-- ============================================================

-- 1. Media Mappings Table (Pre-indexed cross-provider links)
CREATE TABLE IF NOT EXISTS media_mappings (
    imdb_id TEXT PRIMARY KEY,
    tmdb_id TEXT,
    type TEXT NOT NULL, -- 'movie' or 'series'
    title TEXT NOT NULL,
    original_title TEXT,
    year INT,
    slug_kkphim TEXT,
    slug_nguonc TEXT,
    slug_vsmov TEXT,
    episodes_data JSONB DEFAULT '{}'::jsonb, -- Indexed provider episode links
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_media_mappings_tmdb ON media_mappings(tmdb_id);
CREATE INDEX IF NOT EXISTS idx_media_mappings_title ON media_mappings(title);

-- 2. Stream Cache Table (L2 Persistent Stream Storage)
CREATE TABLE IF NOT EXISTS stream_cache (
    stream_key TEXT PRIMARY KEY, -- format: "{imdb_id}:{season}:{episode}"
    streams JSONB NOT NULL,
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_stream_cache_expires ON stream_cache(expires_at);

-- 3. General Generic Key-Value Cache Table (Fallback)
CREATE TABLE IF NOT EXISTS cache_entries (
    key TEXT PRIMARY KEY,
    value JSONB NOT NULL,
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_cache_entries_expires ON cache_entries(expires_at);
