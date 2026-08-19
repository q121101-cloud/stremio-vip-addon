'use strict';

/**
 * ============================================================
 *  VIP Movies Addon — src/workers/indexer.js
 *  Periodic Background Indexer & 403 Bypass Proxy Worker
 * ============================================================
 */

const axios = require('axios');
const providerVsMov  = require('../providers/vsmov');
const providerKKPhim = require('../providers/kkphim');
const providerNguonC = require('../providers/nguonc');
const { catalogCache, metaCache, imdbCache } = require('../db/cache');
const { saveImdbMapping } = require('../db/supabase');
const { USER_AGENT_CHROME } = require('../config/constants');

let isIndexerRunning = false;
let indexerIntervalTimer = null;

/**
 * Single indexer run: pre-warm latest catalogs and cache metadata
 */
async function runIndexCycle() {
  if (isIndexerRunning) return;
  isIndexerRunning = true;
  const startTime = Date.now();
  console.log('[Indexer] Starting periodic indexing cycle...');

  try {
    // 1. Warm NguonC latest
    try {
      const nguoncMovies = await providerNguonC.getCatalog('movie', 'nguonc-movie-latest', {}, 1);
      if (Array.isArray(nguoncMovies)) {
        console.log(`[Indexer] NguonC indexed ${nguoncMovies.length} latest movies`);
      }
    } catch (e) {
      console.warn('[Indexer] NguonC warm warning:', e.message);
    }

    // 2. Warm KKPhim latest
    try {
      const kkphimMovies = await providerKKPhim.getCatalog('movie', 'kkphim-movie-latest', {}, 1);
      if (Array.isArray(kkphimMovies)) {
        console.log(`[Indexer] KKPhim indexed ${kkphimMovies.length} latest movies`);
      }
    } catch (e) {
      console.warn('[Indexer] KKPhim warm warning:', e.message);
    }

    // 3. Warm VSMOV 4K
    try {
      const vsmovMovies = await providerVsMov.getCatalog('4k', 'vsmov-4k', {}, 1);
      if (Array.isArray(vsmovMovies)) {
        console.log(`[Indexer] VSMOV indexed ${vsmovMovies.length} 4K movies`);
      }
    } catch (e) {
      console.warn('[Indexer] VSMOV warm warning:', e.message);
    }

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(2);
    console.log(`[Indexer] Indexing cycle completed in ${elapsed}s.`);
  } catch (err) {
    console.error('[Indexer] Error during indexing cycle:', err.message);
  } finally {
    isIndexerRunning = false;
  }
}

/**
 * Start periodic indexing timer
 * @param {number} [intervalMinutes=30]
 */
function startPeriodicIndexer(intervalMinutes = 30) {
  if (indexerIntervalTimer) clearInterval(indexerIntervalTimer);
  const ms = Math.max(5, intervalMinutes) * 60 * 1000;
  
  // Delay first run by 15s after startup to avoid blocking server boot
  setTimeout(() => {
    runIndexCycle().catch(() => {});
  }, 15000);

  indexerIntervalTimer = setInterval(() => {
    runIndexCycle().catch(() => {});
  }, ms);

  console.log(`[Indexer] Periodic worker scheduled (every ${intervalMinutes} mins).`);
}

/**
 * Handle proxy request to bypass 403 for NguonC
 */
async function handleNguonCProxy(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(204).end();

  let targetUrl = req.query.url;
  if (!targetUrl && req.query.path) {
    let cleanPath = String(req.query.path).trim();
    if (!cleanPath.startsWith('/')) cleanPath = `/${cleanPath}`;
    targetUrl = `https://phim.nguonc.com/api${cleanPath}`;
  }

  if (!targetUrl) {
    return res.status(400).json({ error: 'Missing target url or path query parameter' });
  }

  try {
    const upstream = await axios.get(targetUrl, {
      timeout: 7000,
      headers: {
        'User-Agent': USER_AGENT_CHROME,
        'Referer': 'https://phim.nguonc.com/',
        'Origin': 'https://phim.nguonc.com',
        'Accept': 'application/json, text/plain, */*',
        'Sec-Fetch-Dest': 'empty',
        'Sec-Fetch-Mode': 'cors',
        'Sec-Fetch-Site': 'same-origin',
        'Accept-Language': 'vi-VN,vi;q=0.9,en-US;q=0.8',
      },
    });

    res.setHeader('Content-Type', upstream.headers['content-type'] || 'application/json; charset=utf-8');
    return res.status(upstream.status).send(upstream.data);
  } catch (err) {
    const status = err.response?.status || 502;
    return res.status(status).json({
      error: 'Proxy forwarding failed',
      message: err.message,
      target: targetUrl,
    });
  }
}

module.exports = {
  runIndexCycle,
  startPeriodicIndexer,
  handleNguonCProxy,
};
