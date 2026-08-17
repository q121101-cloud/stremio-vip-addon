'use strict';

/**
 * ============================================================
 *  VIP Movies Addon — src/providers/vsmov.js
 *  VsMov Scraper Provider (Multi-Gateway Scraper & Master M3U8 Extraction)
 *
 *  Features:
 *  - 5-second axios timeout for high resilience & zero blocking
 *  - Multi-gateway scraper: https://vsmov.com, https://streamvsmov.com, https://vsmov.net
 *  - 1080p master.m3u8 stream extraction
 *  - R3 Stremio Stream Protocol compliance:
 *    * In-App Direct Play: HLS Proxy (url only, NO externalUrl)
 *    * External Web Browser Play: Embed Player (externalUrl only, NO url)
 *  - Graceful degradation: all errors return [] safely
 * ============================================================
 */

const axios = require('axios');
const { imdbCache } = require('../lib/cache');
const { unpackDeanEdwards } = require('../mapper');

const PROVIDER_ID    = 'vsmov';
const PROVIDER_LABEL = 'VsMov';
const GATEWAYS       = [
  'https://vsmov.com',
  'https://streamvsmov.com',
  'https://vsmov.net',
];
const CDN_UA         = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36';

// ─── Axios Client (5s Timeout) ───────────────────────────────────
const http = axios.create({
  timeout: 5000,
  headers: {
    'User-Agent': CDN_UA,
    Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    'Accept-Language': 'vi-VN,vi;q=0.9,en;q=0.8',
  },
});

// ─── Helpers ───────────────────────────────────────────────────

/**
 * Scan HTML/JS text for 1080p and master.m3u8 URLs using multiple patterns
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

  const allMatches = [];
  for (const pat of patterns) {
    const globalPat = new RegExp(pat.source, pat.flags.includes('g') ? pat.flags : pat.flags + 'g');
    let m;
    while ((m = globalPat.exec(text)) !== null) {
      if (m[1]) {
        const clean = m[1].replace(/\\\//g, '/');
        allMatches.push(clean);
      }
    }
  }

  if (allMatches.length > 0) {
    // Ưu tiên link 1080p hoặc master.m3u8 chất lượng cao
    const master = allMatches.find((url) => /master\.m3u8|1080p|fullhd/i.test(url));
    if (master) return master;
    return allMatches[0];
  }

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
  if (!html) return null;
  // Pattern 1: <iframe src="...">
  const m1 = html.match(/<iframe[^>]+src=["']([^"']+)["']/i);
  if (m1 && m1[1].includes('http')) return m1[1];

  // Pattern 2: data-src
  const m2 = html.match(/data-src=["']([^"']+)["']/i);
  if (m2 && m2[1].includes('http')) return m2[1];

  // Pattern 3: player.init("...")
  const m3 = html.match(/player\.init\s*\(\s*["']([^"']+)["']/i);
  if (m3 && m3[1]) return m3[1];

  // Pattern 4: src="//..."
  const m4 = html.match(/<iframe[^>]+src=["'](\/\/[^"']+)["']/i);
  if (m4 && m4[1]) return 'https:' + m4[1];

  return null;
}

/**
 * Search vsmov across multi-gateways for a film by title
 * Returns { pageUrl, gateway } or null
 */
async function searchFilm(title) {
  if (!title) return null;
  for (const gw of GATEWAYS) {
    try {
      const searchUrl = `${gw}/?s=${encodeURIComponent(title)}`;
      const r = await http.get(searchUrl, {
        headers: { Referer: gw + '/' },
      });

      const html = String(r.data);

      // Extract search result link
      const m = html.match(/href=["'](https?:\/\/(?:[a-zA-Z0-9-]+\.)?vsmov\.[a-z]+\/[^"']+)["'][^>]*>[^<]*(?:film|phim|movie)/i)
        || html.match(/<h2[^>]*class="[^"]*title[^"]*"[^>]*>.*?<a[^>]+href=["']([^"']+)["']/is)
        || html.match(/class="[^"]*result[^"]*"[^>]*>.*?<a[^>]+href=["']([^"']+)["']/is);

      if (m) return { pageUrl: m[1], gateway: gw };

      const m2 = html.match(/<article[^>]*>[\s\S]*?<a[^>]+href=["'](https?:\/\/(?:[a-zA-Z0-9-]+\.)?vsmov\.[a-z]+\/[^"']+)["']/i);
      if (m2) return { pageUrl: m2[1], gateway: gw };
    } catch (err) {
      console.warn(`[VsMov] Search failed on gateway ${gw}: ${err.message}`);
    }
  }
  return null;
}

/**
 * Extract m3u8 and embed from a vsmov film page
 */
async function extractFromFilmPage(pageUrl, gateway = GATEWAYS[0]) {
  try {
    const r = await http.get(pageUrl, {
      headers: { Referer: gateway + '/' },
    });
    const html = String(r.data);

    // 1. Direct m3u8 in page source
    let m3u8 = scanM3u8(html);
    if (m3u8) {
      const full = m3u8.startsWith('http')
        ? m3u8
        : (m3u8.startsWith('//') ? 'https:' + m3u8 : gateway + m3u8);
      return { m3u8Url: full, embedHost: gateway, embedUrl: pageUrl };
    }

    // 2. Find embed URL → fetch embed page
    let embedUrl = extractEmbedUrl(html, pageUrl);
    if (!embedUrl) return null;
    if (embedUrl.startsWith('//')) embedUrl = 'https:' + embedUrl;

    const embedHost = (() => {
      try { return new URL(embedUrl).origin; } catch { return gateway; }
    })();

    const re = await http.get(embedUrl, {
      headers: { Referer: pageUrl, Origin: gateway },
    });
    const embedHtml = String(re.data);

    // 3. Scan embed page
    m3u8 = scanM3u8(embedHtml);
    if (m3u8) {
      const full = m3u8.startsWith('http')
        ? m3u8
        : (m3u8.startsWith('//') ? 'https:' + m3u8 : new URL(m3u8, embedUrl).href);
      return { m3u8Url: full, embedHost, embedUrl };
    }

    // 4. Try P.A.C.K.E.R unpack
    if (embedHtml.includes('eval(function(p,a,c,k,e,')) {
      const unpacked = unpackDeanEdwards(embedHtml);
      if (unpacked) {
        m3u8 = scanM3u8(unpacked);
        if (m3u8) {
          const full = m3u8.startsWith('http')
            ? m3u8
            : (m3u8.startsWith('//') ? 'https:' + m3u8 : new URL(m3u8, embedUrl).href);
          return { m3u8Url: full, embedHost, embedUrl };
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
 * getCatalog — Graceful fallback
 */
async function getCatalog(type, page = 1, extra = {}) {
  return [];
}

// ─────────────────────────────────────────────────────────────
/**
 * getStreams — Trích xuất luồng từ VsMov với multi-gateway & 5s timeout
 */
async function getStreams(arg1, title, type, season, episode, proxyBase) {
  let imdbId = arg1;
  let slug = null;

  if (typeof arg1 === 'object' && arg1 !== null) {
    imdbId    = arg1.imdbId || null;
    title     = arg1.title || null;
    type      = arg1.type || 'movie';
    season    = arg1.season != null ? arg1.season : null;
    episode   = arg1.episode != null ? arg1.episode : null;
    slug      = arg1.slug || null;
    proxyBase = arg1.proxyBase || '';
  }

  try {
    const cacheKey = `vsmov:${imdbId || title || slug}`;
    let pageInfo = imdbCache.get(cacheKey);

    if (!pageInfo) {
      if (!title) return [];
      pageInfo = await searchFilm(title);
      if (!pageInfo || !pageInfo.pageUrl) {
        console.warn(`[VsMov/getStreams] No page found for "${title}"`);
        return [];
      }
      imdbCache.set(cacheKey, pageInfo, 86400); // Cache 24h
      console.log(`[VsMov/getStreams] "${title}" → ${pageInfo.pageUrl} [FRESH]`);
    } else {
      console.log(`[VsMov/getStreams] Cache hit: ${pageInfo.pageUrl || pageInfo}`);
    }

    const pageUrl = typeof pageInfo === 'string' ? pageInfo : pageInfo.pageUrl;
    const gateway = typeof pageInfo === 'object' ? pageInfo.gateway : GATEWAYS[0];

    const result = await extractFromFilmPage(pageUrl, gateway || GATEWAYS[0]);
    if (!result || !result.m3u8Url) {
      console.warn(`[VsMov/getStreams] Could not extract m3u8 from ${pageUrl}`);
      return [];
    }

    const { m3u8Url, embedHost, embedUrl } = result;
    const streams = [];

    // 1. In-App Direct Play (HLS Proxy) — MUST NOT have externalUrl
    if (proxyBase) {
      const b64Url = Buffer.from(m3u8Url).toString('base64url');
      const b64Ref = Buffer.from((embedHost || GATEWAYS[0]) + '/').toString('base64url');
      streams.push({
        name: 'VIP Movies 🎬',
        title: `[VIP • VsMov] Vietsub Full HD (HLS Proxy)\n⚡ Phát trực tiếp trong App`,
        url: `${proxyBase}/hls/manifest.m3u8?url=${b64Url}&ref=${b64Ref}`,
        behaviorHints: {
          notSupported: false,
          bingeGroup: `vsmov-${slug || imdbId || 'stream'}`,
        },
      });
    }

    // 2. External Web Browser Play (Embed Player Fallback) — MUST NOT have url
    if (embedUrl) {
      streams.push({
        name: 'VIP Movies 🎬',
        title: `[Dự phòng • VsMov] Vietsub Full HD (Embed Player)\n🌐 Bấm để mở xem ngoài trình duyệt web`,
        externalUrl: embedUrl,
        behaviorHints: {
          notSupported: false,
          bingeGroup: `vsmov-${slug || imdbId || 'stream'}`,
        },
      });
    }

    console.log(`[VsMov/getStreams] ${imdbId || title} → ${streams.length} streams`);
    return streams;
  } catch (err) {
    // GRACEFUL DEGRADATION — không throw, không block Stremio
    console.error(`[VsMov/getStreams] ${imdbId || title} — graceful fail:`, err.message);
    return [];
  }
}

module.exports = {
  id: PROVIDER_ID,
  label: PROVIDER_LABEL,
  getCatalog,
  getStreams,
};
