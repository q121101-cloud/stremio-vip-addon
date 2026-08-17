'use strict';

/**
 * ============================================================
 *  VIP Movies Addon — src/providers/vsmov.js
 *  VsMov Scraper Provider (streamvsmov.com CDN)
 *
 *  Graceful Degradation: mọi lỗi đều trả [] — không block Stremio
 *
 *  Chiến lược:
 *  1. Search vsmov.com bằng title
 *  2. Fetch film page → extract embed URL
 *  3. Fetch embed → unpackDeanEdwards → scan m3u8 patterns
 *  4. Wrap qua HLS proxy
 * ============================================================
 */

const axios  = require('axios');
const { imdbCache } = require('../lib/cache');
const { unpackDeanEdwards } = require('../mapper');

const PROVIDER_ID    = 'vsmov';
const PROVIDER_LABEL = 'VsMov ⚡';
const BASE_URL       = 'https://vsmov.com';
const CDN_UA         = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36';

const http = axios.create({
  timeout: 12000,
  headers: {
    'User-Agent': CDN_UA,
    Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    'Accept-Language': 'vi-VN,vi;q=0.9,en;q=0.8',
  },
});

// ─── Helpers ───────────────────────────────────────────────────

/**
 * Scan HTML/JS text for m3u8 URLs using multiple patterns
 */
function scanM3u8(text) {
  if (!text) return null;
  const patterns = [
    /file\s*:\s*["']([^"']+\.m3u8[^"']*?)["']/i,
    /source\s*:\s*["']([^"']+\.m3u8[^"']*?)["']/i,
    /(?:url|src|link|hls|stream)\s*[:=]\s*["']([^"']+\.m3u8[^"']*?)["']/i,
    /["'](https?:\/\/[^"']*\.m3u8[^"']*?)["']/i,
    /["'](\/[^"']*\.m3u8[^"']*?)["']/i,
  ];
  for (const pat of patterns) {
    const m = text.match(pat);
    if (m) return m[1].replace(/\\\//g, '/');
  }
  return null;
}

/**
 * Extract embed URL from vsmov film page HTML
 */
function extractEmbedUrl(html, pageUrl) {
  // Pattern 1: <iframe src="...">
  const m1 = html.match(/<iframe[^>]+src=["']([^"']+)["']/i);
  if (m1 && m1[1].includes('http')) return m1[1];

  // Pattern 2: data-src
  const m2 = html.match(/data-src=["']([^"']+)["']/i);
  if (m2 && m2[1].includes('http')) return m2[1];

  // Pattern 3: player.init("...")
  const m3 = html.match(/player\.init\s*\(\s*["']([^"']+)["']/i);
  if (m3) return m3[1];

  return null;
}

/**
 * Search vsmov.com for a film by title
 * Returns the film page URL or null
 */
async function searchFilm(title) {
  try {
    const searchUrl = `${BASE_URL}/?s=${encodeURIComponent(title)}`;
    const r = await http.get(searchUrl, {
      headers: { Referer: BASE_URL + '/' },
    });

    const html = String(r.data);

    // Extract first search result link
    const m = html.match(/href=["'](https?:\/\/vsmov\.com\/[^"']+)["'][^>]*>[^<]*(?:film|phim|movie)/i)
      || html.match(/<h2[^>]*class="[^"]*title[^"]*"[^>]*>.*?<a[^>]+href=["']([^"']+)["']/is)
      || html.match(/class="[^"]*result[^"]*"[^>]*>.*?<a[^>]+href=["']([^"']+)["']/is);

    if (m) return m[1];

    // Try simpler: first article/post link
    const m2 = html.match(/<article[^>]*>[\s\S]*?<a[^>]+href=["'](https?:\/\/vsmov\.com\/[^"']+)["']/i);
    if (m2) return m2[1];

    return null;
  } catch (err) {
    console.warn(`[VsMov] Search failed for "${title}": ${err.message}`);
    return null;
  }
}

/**
 * Extract m3u8 from a vsmov film page
 */
async function extractFromFilmPage(pageUrl, referer) {
  try {
    const r = await http.get(pageUrl, {
      headers: { Referer: referer || BASE_URL + '/' },
    });
    const html = String(r.data);

    // 1. Direct m3u8 in page source
    let m3u8 = scanM3u8(html);
    if (m3u8) return { m3u8Url: m3u8.startsWith('http') ? m3u8 : BASE_URL + m3u8, embedHost: BASE_URL };

    // 2. Find embed URL → fetch embed
    const embedUrl = extractEmbedUrl(html, pageUrl);
    if (!embedUrl) return null;

    const embedHost = (() => { try { return new URL(embedUrl).origin; } catch { return BASE_URL; } })();

    const re = await http.get(embedUrl, {
      headers: { Referer: pageUrl, Origin: BASE_URL },
    });
    const embedHtml = String(re.data);

    // 3. Scan embed page
    m3u8 = scanM3u8(embedHtml);
    if (m3u8) {
      const full = m3u8.startsWith('http') ? m3u8 : new URL(m3u8, embedUrl).href;
      return { m3u8Url: full, embedHost };
    }

    // 4. Try P.A.C.K.E.R unpack
    if (embedHtml.includes('eval(function(p,a,c,k,e,')) {
      const unpacked = unpackDeanEdwards(embedHtml);
      if (unpacked) {
        m3u8 = scanM3u8(unpacked);
        if (m3u8) {
          const full = m3u8.startsWith('http') ? m3u8 : new URL(m3u8, embedUrl).href;
          return { m3u8Url: full, embedHost };
        }
      }
    }

    return null;
  } catch (err) {
    console.warn(`[VsMov] extractFromFilmPage failed: ${err.message}`);
    return null;
  }
}

// ─────────────────────────────────────────────────────────────
/**
 * getCatalog — HTML scraping (best-effort, không bắt buộc)
 */
async function getCatalog(type, page = 1, extra = {}) {
  // VsMov không có JSON API public → trả [] để không block catalog khác
  // Graceful degradation
  return [];
}

// ─────────────────────────────────────────────────────────────
/**
 * getStreams — cào link m3u8 từ vsmov.com
 */
async function getStreams(imdbId, title, type, season, episode, proxyBase) {
  try {
    // Check cache
    const cacheKey = `vsmov:${imdbId}`;
    let pageUrl = imdbCache.get(cacheKey);

    if (!pageUrl) {
      if (!title) return [];
      pageUrl = await searchFilm(title);
      if (!pageUrl) {
        console.warn(`[VsMov/getStreams] No page found for "${title}"`);
        return [];
      }
      imdbCache.set(cacheKey, pageUrl, 86400); // Cache 24h
      console.log(`[VsMov/getStreams] "${title}" → ${pageUrl} [FRESH]`);
    } else {
      console.log(`[VsMov/getStreams] IMDb ${imdbId} → ${pageUrl} [CACHE]`);
    }

    // Extract m3u8
    const result = await extractFromFilmPage(pageUrl, BASE_URL + '/');
    if (!result) {
      console.warn(`[VsMov/getStreams] Could not extract m3u8 from ${pageUrl}`);
      return [];
    }

    const { m3u8Url, embedHost } = result;
    const streams = [];

    if (proxyBase) {
      const b64    = Buffer.from(m3u8Url).toString('base64url');
      const b64Ref = Buffer.from(embedHost + '/').toString('base64url');
      streams.push({
        name:  PROVIDER_LABEL,
        title: `🇻🇳 Vietsub\n🔄 HLS Proxy`,
        url:   `${proxyBase}/hls/manifest.m3u8?b64=${b64}&ref=${b64Ref}`,
        behaviorHints: { notSupported: false },
      });
    }

    // Direct m3u8 fallback
    streams.push({
      name:  PROVIDER_LABEL,
      title: `🇻🇳 Vietsub\n🌐 Direct HLS`,
      url:   m3u8Url,
      behaviorHints: { notSupported: false },
    });

    console.log(`[VsMov/getStreams] ${imdbId} → ${streams.length} streams`);
    return streams;
  } catch (err) {
    // GRACEFUL DEGRADATION — không throw, không block Stremio
    console.error(`[VsMov/getStreams] ${imdbId} — graceful fail:`, err.message);
    return [];
  }
}

module.exports = {
  id:        PROVIDER_ID,
  label:     PROVIDER_LABEL,
  getCatalog,
  getStreams,
};
