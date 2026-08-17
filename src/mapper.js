'use strict';

/**
 * ============================================================
 *  NguonC Stremio Addon - src/mapper.js  (v1.3.1)
 *  Chuyển đổi dữ liệu từ NguonC API → chuẩn Stremio
 * ============================================================
 */

const ID_PREFIX = 'nguonc:';

function makeId(slug) { return `${ID_PREFIX}${slug}`; }
function extractSlug(id) {
  return id.startsWith(ID_PREFIX) ? id.slice(ID_PREFIX.length) : id;
}

function findCategoryGroup(category, groupName) {
  if (!category) return null;
  for (const key of Object.keys(category)) {
    const entry = category[key];
    if (entry && entry.group && entry.group.name === groupName) return entry;
  }
  return null;
}

function detectType(film) {
  const totalEpisodes = film.total_episodes || 1;
  const currentEpisode = (film.current_episode || '').toUpperCase();
  if (currentEpisode === 'FULL' || totalEpisodes === 1) return 'movie';
  if (film.category) {
    const formatGroup = findCategoryGroup(film.category, 'Định dạng');
    if (formatGroup) {
      const names = formatGroup.list.map((i) => i.name.toLowerCase());
      if (names.some((n) => n.includes('phim lẻ') || n.includes('phim le'))) return 'movie';
      if (names.some((n) => n.includes('phim bộ') || n.includes('phim bo'))) return 'series';
    }
  }
  return totalEpisodes > 1 ? 'series' : 'movie';
}

function extractGenres(category) {
  if (!category) return [];
  const g = findCategoryGroup(category, 'Thể loại');
  if (!g) return [];
  return g.list.map((item) => item.name).filter(Boolean);
}

function extractYear(val) {
  if (!val && val !== 0) return null;
  if (typeof val === 'number') {
    return val >= 1800 && val <= 2100 ? val : null;
  }
  if (typeof val === 'string') {
    const match = val.match(/\b(19\d\d|20\d\d)\b/);
    if (match) return parseInt(match[1], 10);
    const num = parseInt(val, 10);
    return !isNaN(num) && num >= 1800 && num <= 2100 ? num : null;
  }
  if (typeof val === 'object') {
    const g = findCategoryGroup(val, 'Năm');
    if (g && g.list && g.list.length) {
      const year = parseInt(g.list[0].name, 10);
      if (!isNaN(year) && year >= 1800 && year <= 2100) return year;
    }
    if (val.year) {
      return extractYear(val.year);
    }
    if (val.name) {
      const m = String(val.name).match(/\b(19\d\d|20\d\d)\b/);
      if (m) return parseInt(m[1], 10);
    }
    if (val.releaseInfo) {
      return extractYear(val.releaseInfo);
    }
  }
  return null;
}

function extractCountry(category) {
  if (!category) return null;
  const g = findCategoryGroup(category, 'Quốc gia');
  if (!g || !g.list || !g.list.length) return null;
  return g.list.map((i) => i.name).join(', ');
}

function cleanTitle(title) {
  if (!title || typeof title !== 'string') return '';
  return title
    .replace(/[\[\(].*?[\]\)]/g, ' ')
    .replace(/[\-_:\.\/]/g, ' ')
    .replace(/\b(19\d\d|20\d\d)\b/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function toSlug(str) {
  if (!str || typeof str !== 'string') return '';
  return str
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[đĐ]/g, 'd')
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function extractSeasonEpisode(str) {
  if (!str) return { season: null, episode: null };
  const s = String(str);
  const mSe = s.match(/s(\d+)\s*e(\d+)/i) || s.match(/season\s*(\d+).*?episode\s*(\d+)/i);
  if (mSe) {
    return { season: parseInt(mSe[1], 10), episode: parseInt(mSe[2], 10) };
  }
  const mEp = s.match(/(?:t[aậ]p|ep|episode)\s*(\d+)/i) || s.match(/\b(\d+)\b/);
  if (mEp) {
    return { season: 1, episode: parseInt(mEp[1], 10) };
  }
  return { season: null, episode: null };
}

function isM3u8Url(url) {
  if (!url || typeof url !== 'string') return false;
  return url.includes('.m3u8') || url.includes('/hls/') || url.includes('playlist');
}

function normalizeServerName(serverName, defaultName = 'Server 1') {
  if (!serverName || typeof serverName !== 'string') return defaultName;
  return serverName.replace(/#/g, '').replace(/\s+/g, ' ').trim() || defaultName;
}

function encodeBase64(str) {
  if (!str) return '';
  return Buffer.from(str, 'utf8').toString('base64url');
}

function decodeBase64(str) {
  if (!str) return '';
  try {
    return Buffer.from(str, 'base64url').toString('utf8');
  } catch {
    return '';
  }
}

function mapCatalogItem(item, forceType = null) {
  const type = forceType || detectType(item);
  const id = makeId(item.slug);
  const badgeParts = [];
  if (item.quality) badgeParts.push(item.quality);
  if (item.language) badgeParts.push(item.language);
  if (item.current_episode && item.current_episode !== 'FULL') badgeParts.push(item.current_episode);
  return {
    id, type,
    name: item.name || item.original_name || 'Không rõ tên',
    poster: item.thumb_url || item.poster_url || null,
    posterShape: 'poster',
    background: item.poster_url || item.thumb_url || null,
    description: item.description || null,
    ...(badgeParts.length > 0 && { releaseInfo: badgeParts.join(' · ') }),
  };
}

function mapDetailMeta(movie, forceType = null) {
  const type = forceType || detectType(movie);
  const id = makeId(movie.slug);
  const genres = extractGenres(movie.category);
  const year = extractYear(movie.category);
  const country = extractCountry(movie.category);

  const meta = {
    id, type,
    name: movie.name || movie.original_name || 'Không rõ tên',
    poster: movie.thumb_url || movie.poster_url || null,
    posterShape: 'poster',
    background: movie.poster_url || movie.thumb_url || null,
    description: movie.description || null,
    director: movie.director ? [movie.director] : [],
    cast: movie.casts ? movie.casts.split(',').map((s) => s.trim()).filter(Boolean) : [],
    genres: genres.length > 0 ? genres : [],
    runtime: movie.time || null,
    country: country || null,
    logo: null,
    links: [{
      name: 'Xem trên NguonC', category: 'Nguồn',
      url: `https://phim.nguonc.com/phim/${movie.slug}`,
    }],
  };

  if (year) { meta.year = year; meta.releaseInfo = String(year); }
  if (type === 'series') meta.videos = buildVideos(movie.slug, movie.episodes || []);

  return meta;
}

function buildVideos(slug, episodeServers) {
  if (!episodeServers || !episodeServers.length) return [];
  const videos = [];
  const seen = new Set();
  for (let sIdx = 0; sIdx < episodeServers.length; sIdx++) {
    const items = episodeServers[sIdx].items || [];
    for (const ep of items) {
      const epName = ep.name || ep.slug || 'unknown';
      if (sIdx === 0 && !seen.has(epName)) {
        seen.add(epName);
        const epNum = parseEpNumber(epName);
        const base = new Date('2020-01-01T00:00:00.000Z');
        base.setDate(base.getDate() + (epNum - 1) * 7);
        videos.push({
          id: `${ID_PREFIX}${slug}:${sIdx}:${encodeURIComponent(String(epName))}`,
          title: formatEpisodeTitle(epName),
          released: base.toISOString(),
          season: 1, episode: epNum || undefined, thumbnail: null,
        });
      }
    }
  }
  return videos;
}

function parseEpNumber(epName) {
  const match = String(epName).match(/\d+/);
  return match ? parseInt(match[0], 10) : 0;
}

function formatEpisodeTitle(epName) {
  if (!epName) return 'Tập không xác định';
  if (epName.toUpperCase() === 'FULL') return '📽️ Full Movie';
  const num = parseInt(epName, 10);
  return !isNaN(num) ? `Tập ${num}` : `Tập ${epName}`;
}

function parseStreamId(streamId) {
  const withoutPrefix = streamId.startsWith(ID_PREFIX) ? streamId.slice(ID_PREFIX.length) : streamId;
  const parts = withoutPrefix.split(':');
  if (parts.length < 3) return { slug: parts[0], serverIdx: 0, epName: null };
  const serverIdx = parseInt(parts[1], 10);
  const epName = (() => { try { return decodeURIComponent(parts.slice(2).join(':')); } catch { return parts.slice(2).join(':'); } })();
  return { slug: parts[0], serverIdx: isNaN(serverIdx) ? 0 : serverIdx, epName };
}

/**
 * Unpack Dean Edwards P.A.C.K.E.R encoded scripts
 * Example: eval(function(p,a,c,k,e,d)...)
 */
function unpackDeanEdwards(packed) {
  if (!packed || typeof packed !== 'string') return null;
  const match = packed.match(/eval\s*\(\s*function\s*\(\s*p\s*,\s*a\s*,\s*c\s*,\s*k\s*,\s*e\s*,\s*[rd]\s*\)\s*\{[\s\S]+?\}\s*\(\s*['"]([\s\S]+?)['"]\s*,\s*(\d+)\s*,\s*(\d+)\s*,\s*['"]([\s\S]+?)['"]\.split\(\s*['"]\|['"]\s*\)/);
  if (!match) return null;

  try {
    let payload = match[1];
    const radix = parseInt(match[2], 10);
    const count = parseInt(match[3], 10);
    const symtab = match[4].split('|');

    const encode = (c) => {
      const a = (c < radix ? '' : encode(Math.floor(c / radix))) + ((c = c % radix) > 35 ? String.fromCharCode(c + 29) : c.toString(36));
      return a;
    };

    const d = {};
    for (let c = 0; c < count; c++) {
      const key = encode(c);
      d[key] = symtab[c] || key;
    }

    const unpacked = payload.replace(/\b\w+\b/g, (w) => (Object.prototype.hasOwnProperty.call(d, w) ? d[w] : w));
    return unpacked;
  } catch (err) {
    return null;
  }
}

/**
 * Extract m3u8 URL from embed page (async).
 * Supports Vietsub, Thuyết Minh, Lồng Tiếng, and all upstream CDNs.
 */
async function extractM3u8FromEmbed(embedUrl) {
  if (!embedUrl) return null;

  try {
    // 1. Direct .m3u8 link check
    if (embedUrl.includes('.m3u8')) {
      return { m3u8Url: embedUrl, embedHost: new URL(embedUrl).origin };
    }

    const axios = require('axios');
    const embedHost = new URL(embedUrl).origin;
    const r = await axios.get(embedUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
        Referer: 'https://phim.nguonc.com/',
        Origin: 'https://phim.nguonc.com',
      },
      timeout: 10000,
    });

    const html = String(r.data);

    // 2. Check data-obf base64 JSON payload (NguonC / StreamC standard)
    const obfMatch = html.match(/data-obf="([^"]+)"/);
    if (obfMatch) {
      try {
        const outerJson = JSON.parse(Buffer.from(obfMatch[1], 'base64').toString('utf8'));
        if (outerJson && outerJson.sUb) {
          const sUb = outerJson.sUb;
          const fullUrl = sUb.startsWith('http') ? sUb : `${embedHost}/${sUb.replace(/^\//, '')}`;
          return { m3u8Url: fullUrl, embedHost };
        }
      } catch {}
    }

    // Helper regex scanner across text
    const scanPatterns = (text) => {
      if (!text) return null;

      // Pattern 1: file: "..."
      const mFile = text.match(/file\s*:\s*["']([^"']+\.m3u8[^"']*)["']/i);
      if (mFile) return mFile[1];

      // Pattern 2: source: "..."
      const mSource = text.match(/source\s*:\s*["']([^"']+\.m3u8[^"']*)["']/i);
      if (mSource) return mSource[1];

      // Pattern 3: (url|src|link|hls|stream) = "..." or : "..."
      const mVar = text.match(/(?:url|src|link|source|hls|stream)\s*[:=]\s*["']([^"']+\.m3u8[^"']*)["']/i);
      if (mVar) return mVar[1];

      // Pattern 4: General absolute http(s) m3u8 URL
      const mAbs = text.match(/["'](https?:\/\/[^"']*\.m3u8[^"']*?)["']/i);
      if (mAbs) return mAbs[1];

      // Pattern 5: Relative m3u8 URL starting with /
      const mRel = text.match(/["'](\/[^"']*\.m3u8[^"']*?)["']/i);
      if (mRel) return mRel[1];

      return null;
    };

    // 3. Scan raw HTML with multi-patterns
    let candidate = scanPatterns(html);

    // 4. If not found, attempt Dean Edwards P.A.C.K.E.R unpacker
    if (!candidate && html.includes('eval(function(p,a,c,k,e,')) {
      const unpacked = unpackDeanEdwards(html);
      if (unpacked) {
        candidate = scanPatterns(unpacked);
      }
    }

    if (candidate) {
      // Decode escaped slashes (e.g., https:\/\/...)
      candidate = candidate.replace(/\\\//g, '/');
      const finalM3u8 = candidate.startsWith('http') ? candidate : new URL(candidate, embedHost).href;
      return { m3u8Url: finalM3u8, embedHost };
    }

    return null;
  } catch (err) {
    console.warn(`[Extractor] ${err.message} for ${embedUrl}`);
    return null;
  }
}

/**
 * Build streams — SYNCHRONOUS, instant response (< 5ms).
 *
 * LAZY EXTRACTION: /hls/extract?embed=... will fetch+extract m3u8 at play time.
 * This avoids timeout on /stream endpoint.
 */
function buildStreams(movie, epName, proxyBase = '') {
  const streams  = [];
  const episodes = movie.episodes || [];
  if (!episodes.length) return streams;

  for (let sIdx = 0; sIdx < episodes.length; sIdx++) {
    const server     = episodes[sIdx];
    const serverName = server.server_name || `Server ${sIdx + 1}`;
    const items      = server.items || [];

    let targetEp = null;
    if (epName === null || epName === undefined) {
      targetEp = items[0] || null;
    } else {
      targetEp = items.find(
        (ep) => ep.name === epName || ep.slug === epName || String(ep.name) === String(epName)
      );
    }

    if (!targetEp || !targetEp.embed) continue;

    const isTM   = /thuy.{1,5}t minh|l.{1,5}ng ti.{1,5}ng/i.test(serverName);
    const isVS   = /vietsub/i.test(serverName);
    const flag   = isTM ? '🇻🇳 Thuyết Minh' : (isVS ? '🇻🇳 Vietsub' : '🌐');
    const epLabel = targetEp.name && targetEp.name.toUpperCase() !== 'FULL'
      ? ` [${targetEp.name}]` : '';

    if (proxyBase) {
      streams.push({
        name:  'NguonC 🎬',
        title: `${flag} • ${serverName}${epLabel}\n🔄 HLS Proxy`,
        url:   `${proxyBase}/hls/extract?embed=${encodeURIComponent(targetEp.embed)}`,
        behaviorHints: { notSupported: false, bingeGroup: `nguonc-${movie.slug}` },
      });
    }

    // Embed fallback always included
    streams.push({
      name:        'NguonC 🎬',
      title:       `${flag} • ${serverName}${epLabel}\n📺 Embed Player`,
      url:         targetEp.embed,
      externalUrl: targetEp.embed,
      behaviorHints: { notSupported: false, bingeGroup: `nguonc-${movie.slug}` },
    });
  }

  return streams;
}

function scoreSimilarity(a, b) {
  if (!a || !b) return 0;
  a = a.toLowerCase().trim(); b = b.toLowerCase().trim();
  if (a === b) return 1;
  if (a.length < 2 || b.length < 2) return 0;
  const bigrams = new Map();
  for (let i = 0; i < a.length - 1; i++) {
    const bg = a.slice(i, i+2); bigrams.set(bg, (bigrams.get(bg)||0) + 1);
  }
  let intersect = 0;
  for (let i = 0; i < b.length - 1; i++) {
    const bg = b.slice(i, i+2); const cnt = bigrams.get(bg)||0;
    if (cnt > 0) { intersect++; bigrams.set(bg, cnt-1); }
  }
  return (2 * intersect) / (a.length + b.length - 2);
}

module.exports = {
  makeId,
  extractSlug,
  detectType,
  findCategoryGroup,
  extractGenres,
  extractYear,
  extractCountry,
  mapCatalogItem,
  mapDetailMeta,
  buildStreams,
  extractM3u8FromEmbed,
  parseStreamId,
  formatEpisodeTitle,
  buildVideos,
  scoreSimilarity,
  unpackDeanEdwards,
  cleanTitle,
  toSlug,
  extractSeasonEpisode,
  isM3u8Url,
  normalizeServerName,
  encodeBase64,
  decodeBase64,
};
