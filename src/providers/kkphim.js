'use strict';

/**
 * ============================================================
 *  VIP Movies Addon — src/providers/kkphim.js
 *  KKPhim Provider via phimapi.com
 *
 *  getCatalog: GET https://phimapi.com/v1/api/danh-sach/${listSlug}
 *  getStreams:
 *    1. Tra cứu trực tiếp IMDb: GET https://phimapi.com/imdb/title/${imdbId}
 *    2. Fallback: tìm kiếm theo title
 *    3. Fetch episodes → extract link_m3u8 → HLS proxy
 * ============================================================
 */

const axios  = require('axios');
const { imdbCache, catalogCache } = require('../lib/cache');
const mapper = require('../mapper');

const PROVIDER_ID    = 'kkphim';
const PROVIDER_LABEL = 'KKPhim 🔮';
const BASE_API       = 'https://phimapi.com';
const KK_UA          = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36';

// ─── HTTP client ────────────────────────────────────────────────
const http = axios.create({
  baseURL: BASE_API,
  timeout: 12000,
  headers: {
    'User-Agent': KK_UA,
    Accept: 'application/json',
    'Accept-Language': 'vi-VN,vi;q=0.9',
  },
});

// ─── List slug mapping ──────────────────────────────────────────
const LIST_SLUG_MAP = {
  movie:  'phim-le',
  series: 'phim-bo',
  anime:  'hoat-hinh',
  cinema: 'phim-chieu-rap',
};

// ─── Helper: map KKPhim item → Stremio meta ────────────────────
function mapItem(item, type) {
  const stremioType = type || (item.type === 'single' ? 'movie' : 'series');
  return {
    id:          `kkphim:${item.slug}`,
    type:        stremioType,
    name:        item.name || item.origin_name || 'Unknown',
    poster:      item.thumb_url || item.poster_url || null,
    posterShape: 'poster',
    background:  item.poster_url || item.thumb_url || null,
    description: item.content ? String(item.content).replace(/<[^>]+>/g, '').slice(0, 200) : null,
  };
}

// ─────────────────────────────────────────────────────────────
/**
 * Lấy danh sách phim từ phimapi.com
 */
async function getCatalog(type, page = 1, extra = {}) {
  try {
    const { search } = extra;
    const cacheKey = `kkphim:catalog:${type}:${page}:${search || ''}`;
    const cached = catalogCache.get(cacheKey);
    if (cached) return cached;

    let items = [];

    if (search) {
      const r = await http.get('/v1/api/tim-kiem', { params: { keyword: search, page } });
      items = (r.data?.data?.items || []).map((i) => mapItem(i, type === 'series' ? 'series' : 'movie'));
    } else {
      const listSlug = LIST_SLUG_MAP[type] || 'phim-le';
      const r = await http.get(`/v1/api/danh-sach/${listSlug}`, { params: { page, limit: 20 } });
      const raw = r.data?.data?.items || [];
      const stremioType = (type === 'anime' || type === 'cinema') ? 'movie' : type;
      items = raw.map((i) => mapItem(i, stremioType));
    }

    catalogCache.set(cacheKey, items);
    return items;
  } catch (err) {
    console.error(`[KKPhim/getCatalog] type=${type} page=${page}`, err.message);
    return [];
  }
}

// ─────────────────────────────────────────────────────────────
/**
 * Lấy slug phim từ phimapi.com theo IMDb ID
 */
async function findSlugByImdb(imdbId) {
  const cacheKey = `kkphim:${imdbId}`;
  const cached = imdbCache.get(cacheKey);
  if (cached) { console.log(`[KKPhim] IMDb ${imdbId} → slug [CACHE]`); return cached; }

  try {
    // Method 1: Direct IMDb lookup
    const r = await http.get(`/imdb/title/${imdbId}`);
    const slug = r.data?.movie?.slug || r.data?.slug;
    if (slug) {
      imdbCache.set(cacheKey, slug, 86400);
      console.log(`[KKPhim] IMDb ${imdbId} → "${slug}" [IMDB DIRECT]`);
      return slug;
    }
  } catch (err) {
    console.warn(`[KKPhim] IMDb direct lookup failed for ${imdbId}: ${err.message}`);
  }

  return null;
}

/**
 * Tìm slug bằng title (fallback)
 */
async function findSlugByTitle(title, year) {
  try {
    const r = await http.get('/v1/api/tim-kiem', { params: { keyword: title } });
    const items = r.data?.data?.items || [];
    if (!items.length) return null;

    // Score matching
    const normalizeStr = (s) => (s || '').toLowerCase().replace(/[^\w\s]/g, '').trim();
    const titleNorm = normalizeStr(title);

    let best = null, bestScore = 0;
    for (const item of items) {
      const nameNorm = normalizeStr(item.name);
      const origNorm = normalizeStr(item.origin_name);

      let score = 0;
      if (nameNorm === titleNorm || origNorm === titleNorm) score = 1;
      else if (nameNorm.includes(titleNorm) || origNorm.includes(titleNorm)) score = 0.8;
      else if (titleNorm.includes(nameNorm) || titleNorm.includes(origNorm)) score = 0.7;

      if (year && (item.year == year || (item.name || '').includes(String(year)))) score += 0.1;
      if (score > bestScore) { bestScore = score; best = item; }
    }

    if (best && bestScore >= 0.6) {
      console.log(`[KKPhim] Title "${title}" → "${best.slug}" (score=${bestScore.toFixed(2)}) [SEARCH]`);
      return best.slug;
    }
    return null;
  } catch (err) {
    console.warn(`[KKPhim] Title search failed: ${err.message}`);
    return null;
  }
}

// ─────────────────────────────────────────────────────────────
/**
 * Lấy streams từ phimapi.com
 */
async function getStreams(imdbId, title, type, season, episode, proxyBase) {
  try {
    // 1. Tìm slug
    let slug = await findSlugByImdb(imdbId);
    if (!slug && title) slug = await findSlugByTitle(title);
    if (!slug) {
      console.warn(`[KKPhim/getStreams] No slug found for ${imdbId} / "${title}"`);
      return [];
    }

    // 2. Fetch film detail
    const r = await http.get(`/phim/${slug}`);
    const movie = r.data?.movie;
    const episodes = r.data?.episodes || [];
    if (!movie || !episodes.length) return [];

    const streams = [];
    const epNum = episode != null ? String(episode) : null;

    for (const server of episodes) {
      const serverName = server.server_name || 'Server';
      const serverData = server.server_data || [];

      let targetEp = null;
      if (epNum === null) {
        targetEp = serverData[0] || null;
      } else {
        targetEp = serverData.find(
          (ep) => ep.name === epNum || ep.slug === epNum || String(ep.name) === epNum
        );
      }

      if (!targetEp) continue;

      const isTM  = /thuy.{1,5}t minh|l.{1,5}ng ti.{1,5}ng/i.test(serverName);
      const isVS  = /vietsub/i.test(serverName);
      const flag  = isTM ? '🇻🇳 TM' : (isVS ? '🇻🇳 VS' : '🌐');
      const epLbl = targetEp.name && targetEp.name.toUpperCase() !== 'FULL' ? ` [${targetEp.name}]` : '';

      // Ưu tiên link_m3u8 trực tiếp
      if (targetEp.link_m3u8 && proxyBase) {
        const b64 = Buffer.from(targetEp.link_m3u8).toString('base64url');
        const b64Ref = Buffer.from('https://phimapi.com/').toString('base64url');
        streams.push({
          name:  PROVIDER_LABEL,
          title: `${flag} • ${serverName}${epLbl}\n🔄 HLS Proxy`,
          url:   `${proxyBase}/hls/manifest.m3u8?b64=${b64}&ref=${b64Ref}`,
          behaviorHints: { notSupported: false, bingeGroup: `kkphim-${slug}` },
        });
      }

      // Embed fallback
      if (targetEp.link_embed) {
        streams.push({
          name:        PROVIDER_LABEL,
          title:       `${flag} • ${serverName}${epLbl}\n📺 Embed`,
          url:         targetEp.link_embed,
          externalUrl: targetEp.link_embed,
          behaviorHints: { notSupported: false, bingeGroup: `kkphim-${slug}` },
        });
      }
    }

    console.log(`[KKPhim/getStreams] ${imdbId} → "${slug}" → ${streams.length} streams`);
    return streams;
  } catch (err) {
    console.error(`[KKPhim/getStreams] ${imdbId}`, err.message);
    return [];
  }
}

module.exports = {
  id:        PROVIDER_ID,
  label:     PROVIDER_LABEL,
  getCatalog,
  getStreams,
};
