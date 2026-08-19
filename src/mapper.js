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
  if (!film) return 'movie';
  const currentEpisode = (film.current_episode || '').toUpperCase();
  if (currentEpisode === 'FULL') return 'movie';

  if (film.category) {
    const formatGroup = findCategoryGroup(film.category, 'Định dạng');
    if (formatGroup && formatGroup.list) {
      const names = formatGroup.list.map((i) => (i.name || '').toLowerCase());
      if (names.some((n) => n.includes('phim bộ') || n.includes('phim bo'))) return 'series';
      if (names.some((n) => n.includes('phim lẻ') || n.includes('phim le'))) return 'movie';
    }
  }

  const totalEpisodes = film.total_episodes;
  if (typeof totalEpisodes === 'number' && totalEpisodes > 1) return 'series';
  if (typeof totalEpisodes === 'number' && totalEpisodes === 1) return 'movie';
  if (film.episodes && Array.isArray(film.episodes) && film.episodes.length > 0) {
    const totalItems = film.episodes.reduce((acc, s) => acc + (s.items ? s.items.length : 0), 0);
    if (totalItems > 1) return 'series';
  }
  return 'movie';
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
  if (!str || typeof str !== 'string') return '';
  try {
    const raw = str.trim();
    // Try base64url first
    const urlDecoded = Buffer.from(raw, 'base64url').toString('utf8');
    if (urlDecoded && (urlDecoded.includes('://') || urlDecoded.startsWith('{') || urlDecoded.length > 0)) {
      return urlDecoded;
    }
    // Try standard base64
    const stdDecoded = Buffer.from(raw.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8');
    return stdDecoded || '';
  } catch {
    return '';
  }
}

function resolveParamUrl(val) {
  if (!val || typeof val !== 'string') return null;
  const trimmed = val.trim();
  if (!trimmed) return null;
  if (trimmed.startsWith('http://') || trimmed.startsWith('https://') || trimmed.startsWith('data:')) return trimmed;
  const decoded = decodeBase64(trimmed);
  if (decoded) {
    const trimmedDecoded = decoded.trim();
    if (trimmedDecoded.startsWith('http://') || trimmedDecoded.startsWith('https://') || trimmedDecoded.startsWith('data:')) {
      return trimmedDecoded;
    }
  }
  return trimmed;
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
 * Example: eval(function(p,a,c,k,e,d)...) or (p,a,c,k,e,r)
 */
function unpackDeanEdwards(packed) {
  if (!packed || typeof packed !== 'string') return null;
  const match = packed.match(/eval\s*\(\s*function\s*\(\s*p\s*,\s*a\s*,\s*c\s*,\s*k\s*,\s*e\s*,\s*[rd]\s*\)\s*\{[\s\S]+?\}\s*\(\s*['"]([\s\S]+?)['"]\s*,\s*(\d+)\s*,\s*(\d+)\s*,\s*['"]([\s\S]+?)['"]\.split\(\s*['"]\|['"]\s*\)/);
  if (!match) return null;

  try {
    const payload = match[1];
    const radix = parseInt(match[2], 10);
    const count = parseInt(match[3], 10);
    const symtab = match[4].split('|');

    if (isNaN(radix) || isNaN(count) || radix < 2 || radix > 62) {
      return null;
    }

    const encode = (c) => {
      const a = (c < radix ? '' : encode(Math.floor(c / radix))) + ((c = c % radix) > 35 ? String.fromCharCode(c + 29) : c.toString(36));
      return a;
    };

    const d = {};
    for (let c = 0; c < count; c++) {
      const key = encode(c);
      d[key] = symtab[c] || key;
    }

    let unpacked = payload.replace(/\b\w+\b/g, (w) => (Object.prototype.hasOwnProperty.call(d, w) ? d[w] : w));
    unpacked = unpacked.replace(/\\'/g, "'").replace(/\\"/g, '"');
    return unpacked;
  } catch {
    return null;
  }
}

/**
 * Extract m3u8 URL from embed page (async).
 * Supports Vietsub, Thuyết Minh, Lồng Tiếng, StreamC, and all upstream CDNs.
 */
async function extractM3u8FromEmbed(embedUrl, customReferer = null) {
  if (!embedUrl || typeof embedUrl !== 'string') return null;

  try {
    // 1. Direct .m3u8 link check
    if (embedUrl.includes('.m3u8')) {
      let directHost = '';
      try { directHost = new URL(embedUrl).origin; } catch {}
      return { m3u8Url: embedUrl, embedHost: directHost };
    }

    const axios = require('axios');
    let embedHost = '';
    try { embedHost = new URL(embedUrl).origin; } catch {}

    const referer = customReferer || (embedHost ? `${embedHost}/` : 'https://phim.nguonc.com/');

    const r = await axios.get(embedUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
        Referer: referer,
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'vi,en-US;q=0.9,en;q=0.8',
      },
      timeout: 10000,
      validateStatus: (status) => status >= 200 && status < 400,
    });

    const html = String(r.data || '');
    if (!html) return null;

    // 2. Check data-obf base64 JSON payload (NguonC / StreamC standard)
    const obfMatch = html.match(/data-obf=["']([^"']+)["']/i);
    if (obfMatch) {
      try {
        const rawBase64 = obfMatch[1].trim().replace(/-/g, '+').replace(/_/g, '/');
        const outerJson = JSON.parse(Buffer.from(rawBase64, 'base64').toString('utf8'));
        if (outerJson && typeof outerJson === 'object') {
          const targetSub = outerJson.sUb || outerJson.sub || outerJson.m3u8 || outerJson.url || outerJson.file || outerJson.source || outerJson.stream;
          if (targetSub && typeof targetSub === 'string') {
            const fullUrl = targetSub.startsWith('http') ? targetSub : `${embedHost}/${targetSub.replace(/^\//, '')}`;
            return { m3u8Url: fullUrl, embedHost };
          } else if (outerJson.hD || outerJson.hd || outerJson.hash) {
            const vHash = outerJson.hD || outerJson.hd || outerJson.hash;
            return { m3u8Url: `${embedHost}/stream/${vHash}/master.m3u8`, embedHost };
          }
        }
      } catch {}
    }

    // Helper regex scanner across text
    const scanPatterns = (text) => {
      if (!text) return null;
      const cleanText = text.replace(/\\\//g, '/');

      // Pattern 0: baseUrl + videoHash
      const mBase = cleanText.match(/["'`\x27]?baseUrl["'`\x27]?\s*[:=]\s*["'`\x27]([^"'`\x27]+)["'`\x27]/i);
      const mHash = cleanText.match(/["'`\x27]?(?:videoHash|hash|fileId)["'`\x27]?\s*[:=]\s*["'`\x27]([^"'`\x27]+)["'`\x27]/i);
      if (mBase && mHash) {
        return `${mBase[1].replace(/\/+$/, '')}/stream/${mHash[1]}/master.m3u8`;
      }

      // Pattern 1: JSON/JS properties: file, source, src, url, link, hls, stream
      const mProp = cleanText.match(/["'`\x27]?(?:file|source|src|url|link|hls|stream)["'`\x27]?\s*[:=]\s*["'`\x27]([^"'`\x27]+\.m3u8[^"'`\x27]*)["'`\x27]/i);
      if (mProp) return mProp[1];

      // Pattern 2: General absolute http(s) m3u8 URL
      const mAbs = cleanText.match(/["'`\x27](https?:\/\/[^"'`\x27\s<>]+\.m3u8[^"'`\x27\s<>]*?)["'`\x27]/i);
      if (mAbs) return mAbs[1];

      // Pattern 3: Relative m3u8 URL starting with /
      const mRel = cleanText.match(/["'`\x27](\/[^"'`\x27\s<>]+\.m3u8[^"'`\x27\s<>]*?)["'`\x27]/i);
      if (mRel) return mRel[1];

      // Pattern 4: Unquoted regex match
      const mRaw = cleanText.match(/https?:\/\/[a-zA-Z0-9_\-\./%]+\.m3u8[a-zA-Z0-9_\-\./%?=&]*/i);
      if (mRaw) return mRaw[0];

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
      const finalM3u8 = candidate.startsWith('http') ? candidate : (embedHost ? new URL(candidate, embedHost).href : candidate);
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
  resolveParamUrl,
};
