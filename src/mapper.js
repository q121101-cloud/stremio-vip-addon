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

function extractYear(category) {
  if (!category) return null;
  const g = findCategoryGroup(category, 'Năm');
  if (!g || !g.list || !g.list.length) return null;
  const year = parseInt(g.list[0].name, 10);
  return isNaN(year) ? null : year;
}

function extractCountry(category) {
  if (!category) return null;
  const g = findCategoryGroup(category, 'Quốc gia');
  if (!g || !g.list || !g.list.length) return null;
  return g.list.map((i) => i.name).join(', ');
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
 * Extract m3u8 URL from embed page (async).
 * Decode mechanism: data-obf base64 JSON → sUb path → m3u8 URL
 */
async function extractM3u8FromEmbed(embedUrl) {
  const axios = require('axios');
  try {
    const embedHost = new URL(embedUrl).origin;
    const r = await axios.get(embedUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        Referer: 'https://phim.nguonc.com/',
        Origin:  'https://phim.nguonc.com',
      },
      timeout: 10000,
    });
    const html = r.data;
    const obfMatch = html.match(/data-obf="([^"]+)"/);
    if (!obfMatch) {
      const directM3u8 = html.match(/["'](https?:\/\/[^"']*\.m3u8[^"']*?)["']/);
      if (directM3u8) return { m3u8Url: directM3u8[1], embedHost };
      return null;
    }
    const outerJson = JSON.parse(Buffer.from(obfMatch[1], 'base64').toString('utf8'));
    const sUb = outerJson.sUb;
    if (!sUb) return null;
    return { m3u8Url: `${embedHost}/${sUb}`, embedHost };
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
  mapCatalogItem,
  mapDetailMeta,
  buildStreams,
  extractM3u8FromEmbed,
  parseStreamId,
  formatEpisodeTitle,
  buildVideos,
  scoreSimilarity,
};
