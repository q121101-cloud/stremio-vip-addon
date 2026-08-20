'use strict';

require('dotenv').config();

const PORT = parseInt(process.env.PORT, 10) || 7000;
const NODE_ENV = process.env.NODE_ENV || 'development';
const IS_PROD = NODE_ENV === 'production';
const IS_VERCEL = !!(process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME);
const IS_RENDER = !!process.env.RENDER;

// Provider Base URLs & Default Configurations
const PROVIDERS = {
  KKPHIM: {
    BASE_URL: process.env.KKPHIM_BASE_URL || 'https://phimapi.com',
    CDN_IMAGE: process.env.KKPHIM_CDN_IMAGE || 'https://phimimg.com',
    DEFAULT_REFERER: 'https://player.phimapi.com/'
  },
  VSMOV: {
    BASE_URL: process.env.VSMOV_BASE_URL || 'https://vsmov.com/api',
    STREAM_BASE: 'https://streamvsmov.com',
    DEFAULT_REFERER: 'https://vsmov.com/'
  },
  NGUONC: {
    BASE_URL: process.env.NGUONC_BASE_URL || 'https://phim.nguonc.com/api',
    DEFAULT_REFERER: 'https://phim.nguonc.com/'
  },
  CINEMETA: {
    BASE_URL: process.env.CINEMETA_BASE_URL || 'https://v3-cinemeta.strem.io'
  }
};

// Request Timeouts (in ms)
const TIMEOUTS = {
  DEFAULT: parseInt(process.env.TIMEOUT_DEFAULT, 10) || 5000,
  STREAM: parseInt(process.env.TIMEOUT_STREAM, 10) || 3000, // Strict timeout for provider stream calls
  CATALOG: parseInt(process.env.TIMEOUT_CATALOG, 10) || 5000,
  DETAIL: parseInt(process.env.TIMEOUT_DETAIL, 10) || 5000,
  CINEMETA: parseInt(process.env.TIMEOUT_CINEMETA, 10) || 4000
};

// Database & Caching
const SUPABASE = {
  URL: process.env.SUPABASE_URL || '',
  ANON_KEY: process.env.SUPABASE_ANON_KEY || process.env.SUPABASE_PUBLISHABLE_KEY || '',
  SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY || ''
};

const CACHE_TTL = {
  MEMORY_STREAM: 300,        // 5 minutes (L1)
  MEMORY_CATALOG: 900,       // 15 minutes (L1)
  MEMORY_META: 3600,         // 1 hour (L1)
  MEMORY_CINEMETA: 86400,    // 24 hours (L1)
  DB_STREAM_HOURS: 12,       // 12 hours (L2)
  DB_MAPPING_DAYS: 7         // 7 days (L2)
};

// Stremio Addon Metadata
const MANIFEST = {
  ID: 'community.vipmovies.addon',
  VERSION: '2.0.0',
  NAME: 'VIP Movies 🎬 (VSMOV 4K + KKPhim + NguonC)',
  DESCRIPTION: 'Addon xem phim Đa Nguồn VIP: VSMOV 4K Ultra HD, KKPhim & NguonC Vietsub / Thuyết Minh siêu tốc.'
};

// Bitmask Configuration Values
const BITMASK = {
  PROVIDERS: {
    nguonc: 1 << 0, // 1
    kkphim: 1 << 1, // 2
    vsmov:  1 << 2  // 4
  },
  CATEGORIES: {
    'phim-le':        1 << 8,  // 256
    'phim-bo':        1 << 9,  // 512
    'hoat-hinh':      1 << 10, // 1024
    'phim-chieu-rap': 1 << 11  // 2048
  },
  DEFAULT_MASK: (1 | 2 | 4) | (256 | 512 | 1024 | 2048) // 3847
};

/**
 * Dynamic resolution of the external public base URL for HLS Proxy endpoints.
 * @param {import('express').Request} [req]
 * @returns {string}
 */
function getProxyBase(req) {
  if (process.env.PROXY_URL) {
    return process.env.PROXY_URL.replace(/\/+$/, '');
  }
  if (req) {
    const proto = req.headers?.['x-forwarded-proto'] || req.protocol || 'http';
    const host = req.headers?.['x-forwarded-host'] || (req.get ? req.get('host') : req.headers?.host);
    if (host) {
      return `${proto}://${host}`.replace(/\/+$/, '');
    }
  }
  if (process.env.RENDER_EXTERNAL_URL) {
    return process.env.RENDER_EXTERNAL_URL.replace(/\/+$/, '');
  }
  if (process.env.VERCEL_URL) {
    return `https://${process.env.VERCEL_URL}`.replace(/\/+$/, '');
  }
  return `http://localhost:${PORT}`;
}

const config = {
  PORT,
  NODE_ENV,
  IS_PROD,
  IS_VERCEL,
  IS_RENDER,
  PROXY_URL: process.env.PROXY_URL || '',
  RENDER_EXTERNAL_URL: process.env.RENDER_EXTERNAL_URL || '',
  RENDER_BACKEND_URL: process.env.RENDER_BACKEND_URL || '',
  PROVIDERS,
  TIMEOUTS,
  SUPABASE,
  CACHE_TTL,
  MANIFEST,
  BITMASK,
  getProxyBase
};

module.exports = {
  ...config,
  config
};
