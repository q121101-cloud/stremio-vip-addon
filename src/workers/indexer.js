'use strict';

/**
 * ============================================================
 *  VIP Movies Addon — src/workers/indexer.js
 *  Periodic Catalog Pre-warmer & NguonC Stealth Proxy Forwarder
 * ============================================================
 */

const express = require('express');
const axios = require('axios');
let cron = null;
try {
  cron = require('node-cron');
} catch {}
const { upsertMediaMapping } = require('../db/supabase');

const router = express.Router();

const STEALTH_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  'Accept': 'application/json, text/plain, */*',
  'Accept-Language': 'vi-VN,vi;q=0.9,en-US;q=0.8',
  'Referer': 'https://phim.nguonc.com/',
  'Origin': 'https://phim.nguonc.com',
};

// 1. ENDPOINT PROXY TRUNG CHUYỂN CHO NGUONC (Giúp Vercel vượt lỗi 403)
async function handleNguonCProxy(req, res) {
  const { url } = req.query;
  if (!url) return res.status(400).json({ error: 'Missing url query' });

  try {
    const response = await axios.get(url, {
      headers: STEALTH_HEADERS,
      timeout: 6000,
    });
    return res.json(response.data);
  } catch (err) {
    return res.status(err.response?.status || 500).json({
      error: 'Proxy Fetch Failed',
      message: err.message,
    });
  }
}

router.get(['/api/proxy/nguonc', '/proxy/nguonc', '/api/nguonc-proxy'], handleNguonCProxy);

// 2. WORKER CÀO PHIM ĐỒNG BỘ ĐỊNH KỲ VÀO SUPABASE (Chạy mỗi 15 phút)
async function syncLatestMovies() {
  console.log('[Indexer Worker] Bắt đầu đồng bộ danh mục phim mới...');
  try {
    // Cào KKPhim
    const kkRes = await axios.get('https://phimapi.com/danh-sach/phim-moi-cap-nhat?page=1', { timeout: 5000 });
    const kkItems = kkRes.data?.items || [];

    for (const item of kkItems) {
      if (!item.slug) continue;
      try {
        // Chi tiết phim
        const detailRes = await axios.get(`https://phimapi.com/phim/${item.slug}`, { timeout: 5000 });
        const movie = detailRes.data?.movie;

        if (movie && (movie.imdb_id || movie.tmdb?.id)) {
          await upsertMediaMapping({
            imdb_id: movie.imdb_id || `tmdb_${movie.tmdb?.id}`,
            tmdb_id: movie.tmdb?.id?.toString() || null,
            type: movie.type === 'series' ? 'series' : 'movie',
            title: movie.name,
            original_title: movie.origin_name,
            year: movie.year,
            slug_kkphim: movie.slug,
          });
        }
      } catch {}
    }
    console.log(`[Indexer Worker] Đồng bộ thành công ${kkItems.length} phim KKPhim vào Supabase.`);
  } catch (err) {
    console.error('[Indexer Worker Error]:', err.message);
  }
}

// Lên lịch cron: Chạy mỗi 15 phút
if (process.env.NODE_ENV !== 'test') {
  cron.schedule('*/15 * * * *', () => {
    syncLatestMovies().catch(() => {});
  });
}

module.exports = {
  workerRouter: router,
  router,
  handleNguonCProxy,
  syncLatestMovies,
};
