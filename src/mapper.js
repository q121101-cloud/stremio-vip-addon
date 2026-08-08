'use strict';

/**
 * ============================================================
 *  NguonC Stremio Addon - src/mapper.js
 *  Chuyển đổi dữ liệu từ NguonC API → chuẩn Stremio
 * ============================================================
 */

const { GENRES } = require('./manifest');

const ID_PREFIX = 'nguonc:';

// ─── Helpers ─────────────────────────────────────────────────

/**
 * Tạo Stremio ID từ slug của NguonC
 * @param {string} slug
 */
function makeId(slug) {
  return `${ID_PREFIX}${slug}`;
}

/**
 * Trích xuất slug từ Stremio ID
 * @param {string} id
 */
function extractSlug(id) {
  if (id.startsWith(ID_PREFIX)) {
    return id.slice(ID_PREFIX.length);
  }
  return id;
}

/**
 * Xác định type Stremio từ thông tin phim NguonC
 * - Nếu total_episodes > 1 → 'series'
 * - Nếu current_episode là 'FULL' hoặc total_episodes === 1 → 'movie'
 */
function detectType(film) {
  const totalEpisodes = film.total_episodes || 1;
  const currentEpisode = (film.current_episode || '').toUpperCase();

  // Phim lẻ: FULL hoặc chỉ có 1 tập
  if (currentEpisode === 'FULL' || totalEpisodes === 1) {
    return 'movie';
  }

  // Kiểm tra trong category nếu có
  if (film.category) {
    const formatGroup = findCategoryGroup(film.category, 'Định dạng');
    if (formatGroup) {
      const names = formatGroup.list.map((i) => i.name.toLowerCase());
      if (names.some((n) => n.includes('phim lẻ') || n.includes('phim le'))) {
        return 'movie';
      }
      if (names.some((n) => n.includes('phim bộ') || n.includes('phim bo'))) {
        return 'series';
      }
    }
  }

  return totalEpisodes > 1 ? 'series' : 'movie';
}

/**
 * Tìm group trong category theo tên group
 */
function findCategoryGroup(category, groupName) {
  if (!category) return null;
  for (const key of Object.keys(category)) {
    const entry = category[key];
    if (entry.group && entry.group.name === groupName) {
      return entry;
    }
  }
  return null;
}

/**
 * Lấy danh sách thể loại từ category object của NguonC
 * @param {object} category
 */
function extractGenres(category) {
  if (!category) return [];
  const genreGroup = findCategoryGroup(category, 'Thể loại');
  if (!genreGroup) return [];
  return genreGroup.list.map((item) => item.name).filter(Boolean);
}

/**
 * Lấy năm phát hành từ category object
 */
function extractYear(category) {
  if (!category) return null;
  const yearGroup = findCategoryGroup(category, 'Năm');
  if (!yearGroup || !yearGroup.list || !yearGroup.list.length) return null;
  const yearStr = yearGroup.list[0].name;
  const year = parseInt(yearStr, 10);
  return isNaN(year) ? null : year;
}

/**
 * Lấy quốc gia từ category object
 */
function extractCountry(category) {
  if (!category) return null;
  const countryGroup = findCategoryGroup(category, 'Quốc gia');
  if (!countryGroup || !countryGroup.list || !countryGroup.list.length) return null;
  return countryGroup.list.map((i) => i.name).join(', ');
}

// ─── Mapper chính ─────────────────────────────────────────────

/**
 * Map một item từ danh sách catalog của NguonC → Stremio Meta Preview
 * @param {object} item - Item từ API /films/...
 * @param {string} [forceType] - 'movie' | 'series' | null (tự detect)
 */
function mapCatalogItem(item, forceType = null) {
  const type = forceType || detectType(item);
  const id = makeId(item.slug);

  // Xây dựng badge thông tin (hiển thị trong poster)
  const badgeParts = [];
  if (item.quality) badgeParts.push(item.quality);
  if (item.language) badgeParts.push(item.language);
  if (item.current_episode && item.current_episode !== 'FULL') {
    badgeParts.push(item.current_episode);
  }

  return {
    id,
    type,
    name: item.name || item.original_name || 'Không rõ tên',
    poster: item.thumb_url || item.poster_url || null,
    posterShape: 'poster',
    background: item.poster_url || item.thumb_url || null,
    description: item.description || null,
    releaseInfo: item.current_episode !== 'FULL' ? item.current_episode : null,
    // Chú thích phụ (hiển thị trên Stremio)
    ...(badgeParts.length > 0 && { releaseInfo: badgeParts.join(' · ') }),
  };
}

/**
 * Map chi tiết phim từ NguonC → Stremio Meta Object đầy đủ
 * @param {object} movie - movie object từ API /film/{slug}
 * @param {string} [forceType]
 */
function mapDetailMeta(movie, forceType = null) {
  const type = forceType || detectType(movie);
  const id = makeId(movie.slug);
  const genres = extractGenres(movie.category);
  const year = extractYear(movie.category);
  const country = extractCountry(movie.category);

  const meta = {
    id,
    type,
    name: movie.name || movie.original_name || 'Không rõ tên',
    poster: movie.thumb_url || movie.poster_url || null,
    posterShape: 'poster',
    background: movie.poster_url || movie.thumb_url || null,
    description: movie.description || null,
    director: movie.director ? [movie.director] : [],
    cast: movie.casts
      ? movie.casts.split(',').map((s) => s.trim()).filter(Boolean)
      : [],
    genres: genres.length > 0 ? genres : [],
    runtime: movie.time || null,
    country: country || null,
    logo: null,
    links: [],
  };

  if (year) {
    meta.year = year;
    meta.releaseInfo = String(year);
  }

  // Thêm link đến trang gốc NguonC
  meta.links.push({
    name: 'Xem trên NguonC',
    category: 'Nguồn',
    url: `https://phim.nguonc.com/phim/${movie.slug}`,
  });

  // ─── Videos (chỉ dành cho series) ─────────────────────────
  if (type === 'series') {
    meta.videos = buildVideos(movie.slug, movie.episodes || []);
  }

  return meta;
}

/**
 * Xây dựng mảng videos từ danh sách episodes của NguonC
 * @param {string} slug - Slug phim
 * @param {Array} episodeServers - Mảng { server_name, items: [{ name, slug, embed }] }
 */
function buildVideos(slug, episodeServers) {
  if (!episodeServers || !episodeServers.length) return [];

  const videos = [];
  const seenEpisodes = new Set(); // tránh duplicate

  // Lấy server đầu tiên làm primary, các server khác làm alternative streams
  // Stremio video ID format: nguonc:{slug}:{serverIndex}:{epName}
  for (let sIdx = 0; sIdx < episodeServers.length; sIdx++) {
    const server = episodeServers[sIdx];
    const serverName = server.server_name || `Server ${sIdx + 1}`;
    const items = server.items || [];

    for (const ep of items) {
      const epName = ep.name || ep.slug || 'unknown';
      const epKey = epName; // deduplicate by ep name

      // Chỉ tạo video entry cho server đầu tiên
      // Server khác sẽ được lấy trong stream handler
      if (sIdx === 0 && !seenEpisodes.has(epKey)) {
        seenEpisodes.add(epKey);

        // Tạo released date giả dựa trên số tập để sort đúng thứ tự
        const epNum = parseEpNumber(epName);
        const released = generateReleasedDate(epNum);

        // ID video theo chuẩn: nguonc:{slug}:{serverIdx}:{epName}
        const videoId = `${ID_PREFIX}${slug}:${sIdx}:${encodeEpName(epName)}`;

        videos.push({
          id: videoId,
          title: formatEpisodeTitle(epName),
          released,
          season: 1,
          episode: epNum || undefined,
          thumbnail: null,
        });
      }
    }
  }

  return videos;
}

/**
 * Parse số tập từ tên tập
 * @param {string} epName - vd: "1", "10", "FULL", "tap-1"
 */
function parseEpNumber(epName) {
  const match = String(epName).match(/\d+/);
  return match ? parseInt(match[0], 10) : 0;
}

/**
 * Tạo ngày phát hành giả dựa trên số tập (để sort đúng thứ tự)
 * @param {number} epNum
 */
function generateReleasedDate(epNum) {
  // Base: 2020-01-01, mỗi tập cách nhau 1 tuần
  const base = new Date('2020-01-01T00:00:00.000Z');
  base.setDate(base.getDate() + (epNum - 1) * 7);
  return base.toISOString();
}

/**
 * Format tên tập hiển thị
 * @param {string} epName
 */
function formatEpisodeTitle(epName) {
  if (!epName) return 'Tập không xác định';
  const upper = epName.toUpperCase();
  if (upper === 'FULL') return '📽️ Full Movie';
  const num = parseInt(epName, 10);
  if (!isNaN(num)) return `Tập ${num}`;
  return `Tập ${epName}`;
}

/**
 * Encode tên tập để dùng trong ID (tránh ký tự đặc biệt)
 * @param {string} epName
 */
function encodeEpName(epName) {
  return encodeURIComponent(String(epName));
}

/**
 * Decode tên tập từ URL-encoded
 * @param {string} encoded
 */
function decodeEpName(encoded) {
  try {
    return decodeURIComponent(encoded);
  } catch {
    return encoded;
  }
}

/**
 * Parse stream ID thành các thành phần
 * Format: nguonc:{slug}:{serverIdx}:{epName}
 * @param {string} streamId
 */
function parseStreamId(streamId) {
  // Bỏ prefix 'nguonc:'
  const withoutPrefix = streamId.startsWith(ID_PREFIX)
    ? streamId.slice(ID_PREFIX.length)
    : streamId;

  // Split theo ':' nhưng epName có thể chứa ':' sau encode
  // Format: {slug}:{serverIdx}:{epName}
  const parts = withoutPrefix.split(':');

  if (parts.length < 3) {
    // Chỉ có slug → phim lẻ
    return { slug: parts[0], serverIdx: 0, epName: null };
  }

  // serverIdx là phần tử thứ 2
  const serverIdx = parseInt(parts[1], 10);
  const epNameEncoded = parts.slice(2).join(':');
  const epName = decodeEpName(epNameEncoded);

  return { slug: parts[0], serverIdx: isNaN(serverIdx) ? 0 : serverIdx, epName };
}

/**
 * Build danh sách streams từ episodes của NguonC
 * Trả về tất cả stream từ tất cả servers cho một tập phim
 *
 * @param {object} movie - movie detail object
 * @param {string|null} epName - tên tập (null = phim lẻ, lấy tập đầu)
 */
function buildStreams(movie, epName) {
  const streams = [];
  const episodes = movie.episodes || [];

  if (!episodes.length) return streams;

  for (let sIdx = 0; sIdx < episodes.length; sIdx++) {
    const server = episodes[sIdx];
    const serverName = server.server_name || `Server ${sIdx + 1}`;
    const items = server.items || [];

    let targetEp = null;

    if (epName === null || epName === undefined) {
      // Phim lẻ: lấy tập đầu tiên (thường là FULL)
      targetEp = items[0] || null;
    } else {
      // Phim bộ: tìm tập theo tên
      targetEp = items.find(
        (ep) =>
          ep.name === epName ||
          ep.slug === epName ||
          String(ep.name) === String(epName)
      );
    }

    if (!targetEp) continue;

    const embedUrl = targetEp.embed;
    if (!embedUrl) continue;

    // Trả về embed URL (Stremio hỗ trợ externalUrl cho embed)
    streams.push({
      name: `NguonC`,
      title: `🎬 ${serverName}`,
      externalUrl: embedUrl,
      behaviorHints: {
        notWebReady: false,
        bingeGroup: `nguonc-${movie.slug}`,
      },
    });
  }

  return streams;
}

module.exports = {
  makeId,
  extractSlug,
  detectType,
  mapCatalogItem,
  mapDetailMeta,
  buildStreams,
  parseStreamId,
  formatEpisodeTitle,
  buildVideos,
};
