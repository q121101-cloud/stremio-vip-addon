'use strict';

/**
 * ============================================================
 *  VIP Movies Addon — src/providers/sports.js
 *  Live Sports Streaming Provider (Xôi Lạc, Cà Khịa, SoCoLive, CoLa TV)
 * ============================================================
 */

const axios = require("axios");

const PROVIDER_ID = "sports";
const PROVIDER_LABEL = "Thể Thao Live";
const BASE_SOURCE = "https://sc.k-20.xyz";

const SPORTS_HUBS = [
  {
    id: "sports:hub:all",
    type: "tv",
    name: "🔴 [Tất Cả] Tổng Hợp Thể Thao Live",
    poster: "https://phim.k-20.xyz/logo.png",
    posterShape: "poster",
    background: "https://phim.k-20.xyz/logo.png",
    description: "🔴 Tổng hợp toàn bộ luồng phát trực tiếp bóng đá & thể thao từ mọi nguồn (Xôi Lạc, SoCoLive, Cà Khịa, CoLa TV) kèm bình luận tiếng Việt."
  },
  {
    id: "sports:hub:xoilac",
    type: "tv",
    name: "🔴 [Xôi Lạc] Thể Thao Trực Tiếp",
    poster: "https://phim.k-20.xyz/logo.png",
    posterShape: "poster",
    background: "https://phim.k-20.xyz/logo.png",
    description: "🔴 Các luồng trực tiếp bóng đá từ Xôi Lạc TV (Kênh HD & BLV Tiếng Việt)"
  },
  {
    id: "sports:hub:socolive",
    type: "tv",
    name: "🔴 [SoCoLive] Thể Thao Trực Tiếp",
    poster: "https://phim.k-20.xyz/logo.png",
    posterShape: "poster",
    background: "https://phim.k-20.xyz/logo.png",
    description: "🔴 Các luồng trực tiếp bóng đá & thể thao từ SoCoLive (BLV Tiếng Việt)"
  },
  {
    id: "sports:hub:cakhia",
    type: "tv",
    name: "🔴 [Cà Khịa] Thể Thao Trực Tiếp",
    poster: "https://phim.k-20.xyz/logo.png",
    posterShape: "poster",
    background: "https://phim.k-20.xyz/logo.png",
    description: "🔴 Các luồng trực tiếp bóng đá từ Cà Khịa TV (BLV Tiếng Việt)"
  },
  {
    id: "sports:hub:cola",
    type: "tv",
    name: "🔴 [CoLa TV] Thể Thao Trực Tiếp",
    poster: "https://phim.k-20.xyz/logo.png",
    posterShape: "poster",
    background: "https://phim.k-20.xyz/logo.png",
    description: "🔴 Các luồng trực tiếp bóng đá VIP từ CoLa TV"
  }
];

async function getCatalog(type, page = 1, extra = {}) {
  try {
    const res = await axios.get(`${BASE_SOURCE}/catalog/tv/sports-live.json`, { timeout: 6000 });
    if (Array.isArray(res.data?.metas) && res.data.metas.length > 0) {
      return res.data.metas;
    }
  } catch (err) {
    console.warn("[Sports/getCatalog] Using local hubs fallback:", err.message);
  }
  return SPORTS_HUBS;
}

async function getDetail(id) {
  const found = SPORTS_HUBS.find((h) => h.id === id);
  if (found) {
    return {
      movie: found,
      episodes: []
    };
  }
  return {
    movie: {
      id,
      type: "tv",
      name: "🔴 Thể Thao Trực Tiếp Live",
      poster: "https://phim.k-20.xyz/logo.png",
      background: "https://phim.k-20.xyz/logo.png",
      description: "🔴 Luồng thể thao trực tiếp với bình luận tiếng Việt."
    },
    episodes: []
  };
}

async function getStreams(query) {
  let id = null;
  if (typeof query === "string") id = query;
  else if (typeof query === "object" && query !== null) {
    id = query.slug || query.imdbId || query.id;
  }
  if (!id || !String(id).startsWith("sports:")) return [];

  try {
    const streamUrl = `${BASE_SOURCE}/stream/tv/${encodeURIComponent(id)}.json`;
    const res = await axios.get(streamUrl, { timeout: 8000 });
    const rawStreams = res.data?.streams || [];
    return rawStreams.map((s) => ({
      name: s.name || "🔴 Thể Thao Live",
      title: s.title || "Luồng trực tiếp HD\n⚡ Phát trực tiếp trong App",
      url: s.url,
      behaviorHints: s.behaviorHints || { isLive: true, saveToLibrary: false, notWebReady: false }
    }));
  } catch (err) {
    console.error(`[Sports/getStreams] Failed for ${id}:`, err.message);
    return [];
  }
}

module.exports = {
  id: PROVIDER_ID,
  label: PROVIDER_LABEL,
  getCatalog,
  getDetail,
  getStreams,
};
