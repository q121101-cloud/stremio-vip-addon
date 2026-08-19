'use strict';

/**
 * ============================================================
 *  VIP Movies Addon — test/routes/stream.test.js
 *  Deterministic Unit & Integration Test Suite for Stream Aggregator
 * ============================================================
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from 'vitest';
const axios = require('axios');
const app = require('../../src/server');
const kkphim = require('../../src/providers/kkphim');
const nguonc = require('../../src/providers/nguonc');
const vsmov = require('../../src/providers/vsmov');
const dbCache = require('../../src/db/cache');
const supabaseDb = require('../../src/db/supabase');
const cinemeta = require('../../src/lib/cinemeta');

let appServer = null;
let appBaseUrl = '';

describe('Stream Aggregation & Episode Matching Router (/stream)', () => {
  beforeAll(async () => {
    appServer = await new Promise((resolve) => {
      const s = app.listen(0, '127.0.0.1', () => resolve(s));
    });
    const port = appServer.address().port;
    appBaseUrl = `http://127.0.0.1:${port}`;
  });

  afterAll(async () => {
    if (appServer) {
      await new Promise((resolve) => appServer.close(resolve));
    }
  });

  beforeEach(() => {
    vi.restoreAllMocks();
    if (dbCache.l1Cache && typeof dbCache.l1Cache.clear === 'function') dbCache.l1Cache.clear();
    if (dbCache.streamCache && typeof dbCache.streamCache.clear === 'function') dbCache.streamCache.clear();

    // Default fast offline mocks for metadata/search to avoid live network delay
    vi.spyOn(supabaseDb, 'getMediaMapping').mockResolvedValue(null);
    vi.spyOn(supabaseDb, 'upsertMediaMapping').mockResolvedValue({});
    vi.spyOn(cinemeta, 'resolveCinemeta').mockResolvedValue(null);
    vi.spyOn(kkphim, 'search').mockResolvedValue([]);
    vi.spyOn(nguonc, 'search').mockResolvedValue([]);
    vi.spyOn(vsmov, 'search').mockResolvedValue({ items: [] });
    vi.spyOn(kkphim, 'getDetail').mockResolvedValue(null);
    vi.spyOn(nguonc, 'getDetail').mockResolvedValue(null);
    vi.spyOn(vsmov, 'getDetail').mockResolvedValue(null);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    if (dbCache.l1Cache && typeof dbCache.l1Cache.clear === 'function') dbCache.l1Cache.clear();
    if (dbCache.streamCache && typeof dbCache.streamCache.clear === 'function') dbCache.streamCache.clear();
  });

  // ─────────────────────────────────────────────────────────────
  // 1. Multi-Provider Aggregation & VIP Prioritization
  // ─────────────────────────────────────────────────────────────
  describe('1. Multi-Provider Aggregation & VIP Prioritization', () => {
    it('aggregates streams from all 3 active providers, sorts by VIP priority (4K > Vietsub > TM > LT), and applies HLS proxy', async () => {
      const vsmovMockStreams = [
        {
          name: 'VIP Movies 🎬',
          server: 'VSMOV 4K (Vietsub)',
          quality: '3840x2160',
          title: '[VIP 1 • VSMOV] Vietsub 4K Ultra HD (3840x2160) (HLS Proxy)\n⚡ Server VIP Vietsub • vsmov.com',
          url: 'https://vsmov.cdn/4k_vietsub.m3u8',
          behaviorHints: { notWebReady: false },
          subtitles: [{ id: 'vi_vsmov', lang: 'vie', url: 'http://127.0.0.1/hls/sub.vtt', title: 'Tiếng Việt' }],
        },
        {
          name: 'VIP Movies 🎬',
          server: 'VSMOV 4K (Thuyết Minh)',
          quality: '3840x2160',
          title: '[VIP 1 • VSMOV] Thuyết Minh 4K Ultra HD (3840x2160) (HLS Proxy)\n⚡ Server VIP Thuyết Minh • vsmov.com',
          url: 'https://vsmov.cdn/4k_tm.m3u8',
          behaviorHints: { notWebReady: false },
        },
      ];

      const kkphimMockStreams = [
        {
          name: 'VIP Movies 🎬',
          title: '[VIP 2 • KKPhim] Vietsub Full HD (HLS Proxy)\n⚡ Server VIP 2 • Phát trực tiếp trong App',
          url: 'https://kkphim.cdn/fhd_vietsub.m3u8',
          behaviorHints: { notWebReady: false, bingeGroup: 'kkphim-inception' },
        },
        {
          name: 'VIP Movies 🎬',
          title: '[VIP 2 • KKPhim] Thuyết Minh Full HD (HLS Proxy)\n⚡ Server VIP 2 • Phát trực tiếp trong App',
          url: 'https://kkphim.cdn/fhd_tm.m3u8',
          behaviorHints: { notWebReady: false, bingeGroup: 'kkphim-inception' },
        },
      ];

      const nguoncMockStreams = [
        {
          name: 'VIP Movies 🎬',
          serverName: 'Server #1',
          title: '[VIP 3 • NguonC] Vietsub Full HD (HLS Proxy)\n⚡ Server NguonC • Phát trực tiếp trong App',
          url: 'https://streamc.xyz/fhd_nguonc.m3u8',
          quality: '1080p',
          behaviorHints: { notWebReady: false, bingeGroup: 'nguonc-server1' },
        },
      ];

      vi.spyOn(vsmov, 'getStreams').mockResolvedValueOnce(vsmovMockStreams);
      vi.spyOn(kkphim, 'getStreams').mockResolvedValueOnce(kkphimMockStreams);
      vi.spyOn(nguonc, 'getStreams').mockResolvedValueOnce(nguoncMockStreams);

      const res = await axios.get(`${appBaseUrl}/stream/movie/tt1375666.json`);

      expect(res.status).toBe(200);
      expect(res.data).toBeDefined();
      expect(Array.isArray(res.data.streams)).toBe(true);
      expect(res.data.streams).toHaveLength(5);

      const streams = res.data.streams;

      // 1. VSMOV 4K Vietsub (Rank 10)
      expect(streams[0].title).toContain('4K Ultra HD');
      expect(streams[0].title).toContain('Vietsub');
      expect(streams[0].url).toContain('/hls/manifest.m3u8');
      expect(streams[0].subtitles).toBeDefined();

      // 2. VSMOV 4K Thuyết Minh (Rank 11)
      expect(streams[1].title).toContain('4K Ultra HD');
      expect(streams[1].title).toContain('Thuyết Minh');

      // 3. KKPhim Vietsub FHD (Rank 102)
      expect(streams[2].title).toContain('KKPhim');
      expect(streams[2].title).toContain('Vietsub');

      // 4. NguonC Vietsub FHD (Rank 103)
      expect(streams[3].title).toContain('NguonC');
      expect(streams[3].title).toContain('Vietsub');

      // 5. KKPhim Thuyết Minh FHD (Rank 202)
      expect(streams[4].title).toContain('KKPhim');
      expect(streams[4].title).toContain('Thuyết Minh');
    });

    it('deduplicates streams with identical streaming URLs', async () => {
      const duplicateUrl = `${appBaseUrl}/hls/manifest.m3u8?url=common_manifest`;
      vi.spyOn(vsmov, 'getStreams').mockResolvedValueOnce([
        { title: '[VIP 1] Stream A', url: duplicateUrl },
      ]);
      vi.spyOn(kkphim, 'getStreams').mockResolvedValueOnce([
        { title: '[VIP 2] Stream B', url: duplicateUrl },
      ]);
      vi.spyOn(nguonc, 'getStreams').mockResolvedValueOnce([]);

      const res = await axios.get(`${appBaseUrl}/stream/movie/tt1375666.json`);
      expect(res.status).toBe(200);
      expect(res.data.streams).toHaveLength(1);
    });
  });

  // ─────────────────────────────────────────────────────────────
  // 2. Partial & Total Provider Failure Tolerance
  // ─────────────────────────────────────────────────────────────
  describe('2. Provider Failure & Timeout Isolation', () => {
    it('partial failure: single provider 500 error does not block remaining 2 providers (returns HTTP 200)', async () => {
      vi.spyOn(vsmov, 'getStreams').mockRejectedValueOnce(new Error('VSMOV 500 Internal Error'));
      vi.spyOn(kkphim, 'getStreams').mockResolvedValueOnce([
        { title: '[VIP 2 • KKPhim] Vietsub Full HD', url: 'https://kkphim.cdn/s.m3u8' },
      ]);
      vi.spyOn(nguonc, 'getStreams').mockResolvedValueOnce([
        { title: '[VIP 3 • NguonC] Full HD', url: 'https://nguonc.cdn/s.m3u8' },
      ]);

      const res = await axios.get(`${appBaseUrl}/stream/movie/tt1375666.json`);
      expect(res.status).toBe(200);
      expect(res.data.streams).toHaveLength(2);
      expect(res.data.streams[0].title).toContain('KKPhim');
      expect(res.data.streams[1].title).toContain('NguonC');
    });

    it('partial failure: two providers fail, remaining 1 provider returns valid streams (HTTP 200)', async () => {
      vi.spyOn(vsmov, 'getStreams').mockRejectedValueOnce(new Error('VSMOV Down'));
      vi.spyOn(kkphim, 'getStreams').mockRejectedValueOnce(new Error('KKPhim Down'));
      vi.spyOn(nguonc, 'getStreams').mockResolvedValueOnce([
        { title: '[VIP 3 • NguonC] Backup Stream', url: 'https://nguonc.cdn/backup.m3u8' },
      ]);

      const res = await axios.get(`${appBaseUrl}/stream/movie/tt1375666.json`);
      expect(res.status).toBe(200);
      expect(res.data.streams).toHaveLength(1);
      expect(res.data.streams[0].title).toContain('NguonC');
    });

    it('total failure: all providers fail or return empty -> returns { streams: [] } with HTTP 200 (no crash)', async () => {
      vi.spyOn(vsmov, 'getStreams').mockRejectedValueOnce(new Error('All Down 1'));
      vi.spyOn(kkphim, 'getStreams').mockRejectedValueOnce(new Error('All Down 2'));
      vi.spyOn(nguonc, 'getStreams').mockRejectedValueOnce(new Error('All Down 3'));

      const res = await axios.get(`${appBaseUrl}/stream/movie/tt1375666.json`);
      expect(res.status).toBe(200);
      expect(res.data).toEqual({ streams: [] });
    });

    it('timeout bounding: provider hanging > 3000ms is cleanly aborted by withTimeout without blocking other providers', async () => {
      // VSMOV hangs for 5000ms
      vi.spyOn(vsmov, 'getStreams').mockImplementationOnce(() => {
        return new Promise((resolve) => setTimeout(() => resolve([{ title: 'Late Stream', url: 'http://late.com' }]), 5000));
      });

      // KKPhim and NguonC return fast
      vi.spyOn(kkphim, 'getStreams').mockResolvedValueOnce([
        { title: '[VIP 2 • KKPhim] Fast Stream', url: 'https://kkphim.cdn/fast.m3u8' },
      ]);
      vi.spyOn(nguonc, 'getStreams').mockResolvedValueOnce([]);

      const start = Date.now();
      const res = await axios.get(`${appBaseUrl}/stream/movie/tt1375666.json`);
      const elapsed = Date.now() - start;

      expect(res.status).toBe(200);
      expect(res.data.streams).toHaveLength(1);
      expect(res.data.streams[0].title).toContain('KKPhim');
      expect(elapsed).toBeLessThan(4500);
    });
  });

  // ─────────────────────────────────────────────────────────────
  // 3. Multi-Format ID Parsing & Episode Resolution
  // ─────────────────────────────────────────────────────────────
  describe('3. Multi-Format ID Parsing & Episode Resolution', () => {
    it('parses standard IMDb series format (tt7458054:1:2) with season 1, episode 2', async () => {
      vi.spyOn(vsmov, 'getStreams').mockResolvedValueOnce([]);
      const kkphimSpy = vi.spyOn(kkphim, 'getStreams').mockResolvedValueOnce([
        { title: '[VIP 2 • KKPhim] Tập 2', url: 'https://cdn.com/ep2.m3u8' },
      ]);
      vi.spyOn(nguonc, 'getStreams').mockResolvedValueOnce([]);

      const res = await axios.get(`${appBaseUrl}/stream/series/tt7458054:1:2.json`);
      expect(res.status).toBe(200);
      expect(res.data.streams).toHaveLength(1);

      expect(kkphimSpy).toHaveBeenCalled();
      const payload = kkphimSpy.mock.calls[0][0];
      expect(payload.imdbId).toBe('tt7458054');
      expect(payload.season).toBe(1);
      expect(payload.episode).toBe(2);
      expect(payload.title).toBe('While You Were Sleeping'); // Resolved from KNOWN_TITLE_LOCALIZATIONS
    });

    it('parses KKPhim prefixed series format (kkphim_slug:1:2)', async () => {
      const kkphimSpy = vi.spyOn(kkphim, 'getStreams').mockResolvedValueOnce([
        { title: '[VIP 2] Episode 2', url: 'https://cdn.com/kk_ep2.m3u8' },
      ]);
      vi.spyOn(vsmov, 'getStreams').mockResolvedValueOnce([]);
      vi.spyOn(nguonc, 'getStreams').mockResolvedValueOnce([]);

      const res = await axios.get(`${appBaseUrl}/stream/series/kkphim_while-you-were-sleeping:1:2.json`);
      expect(res.status).toBe(200);
      expect(res.data.streams).toHaveLength(1);

      const payload = kkphimSpy.mock.calls[0][0];
      expect(payload.slug).toBe('while-you-were-sleeping');
      expect(payload.season).toBe(1);
      expect(payload.episode).toBe(2);
    });

    it('parses NguonC prefixed format (nguonc_cuu-mon:0:tap-2) and URI decodes episode digits', async () => {
      vi.spyOn(vsmov, 'getStreams').mockResolvedValueOnce([]);
      vi.spyOn(kkphim, 'getStreams').mockResolvedValueOnce([]);
      const nguoncSpy = vi.spyOn(nguonc, 'getStreams').mockResolvedValueOnce([
        { title: '[VIP 3] Tập 2', url: 'https://cdn.com/nc_ep2.m3u8' },
      ]);

      const res = await axios.get(`${appBaseUrl}/stream/series/nguonc_cuu-mon:0:tap-2.json`);
      expect(res.status).toBe(200);
      expect(res.data.streams).toHaveLength(1);

      const payload = nguoncSpy.mock.calls[0][0];
      expect(payload.slug).toBe('cuu-mon');
      expect(payload.episode).toBe(2);
    });

    it('parses VSMOV prefixed series format (vsmov_slug:1:2)', async () => {
      const vsmovSpy = vi.spyOn(vsmov, 'getStreams').mockResolvedValueOnce([
        { title: '[VIP 1] 4K Ep 2', url: 'https://vsmov.cdn/4k_ep2.m3u8' },
      ]);
      vi.spyOn(kkphim, 'getStreams').mockResolvedValueOnce([]);
      vi.spyOn(nguonc, 'getStreams').mockResolvedValueOnce([]);

      const res = await axios.get(`${appBaseUrl}/stream/series/vsmov_custom-series:1:2.json`);
      expect(res.status).toBe(200);
      expect(res.data.streams).toHaveLength(1);

      const payload = vsmovSpy.mock.calls[0][0];
      expect(payload.slug).toBe('custom-series');
      expect(payload.season).toBe(1);
      expect(payload.episode).toBe(2);
    });

    it('parses raw slug format (raw-slug:1:3)', async () => {
      const kkphimSpy = vi.spyOn(kkphim, 'getStreams').mockResolvedValueOnce([
        { title: 'Ep 3', url: 'https://cdn.com/raw_ep3.m3u8' },
      ]);
      vi.spyOn(vsmov, 'getStreams').mockResolvedValueOnce([]);
      vi.spyOn(nguonc, 'getStreams').mockResolvedValueOnce([]);

      const res = await axios.get(`${appBaseUrl}/stream/series/raw-slug:1:3.json`);
      expect(res.status).toBe(200);
      expect(res.data.streams).toHaveLength(1);

      const payload = kkphimSpy.mock.calls[0][0];
      expect(payload.season).toBe(1);
      expect(payload.episode).toBe(3);
    });
  });

  // ─────────────────────────────────────────────────────────────
  // 4. Title Resolution & Cinemeta Fallback Hierarchy
  // ─────────────────────────────────────────────────────────────
  describe('4. Title Resolution Hierarchy & Fallback', () => {
    it('resolves title via KNOWN_TITLE_LOCALIZATIONS for known Asian series (tt7458054)', async () => {
      const kkSpy = vi.spyOn(kkphim, 'getStreams').mockResolvedValueOnce([]);
      vi.spyOn(vsmov, 'getStreams').mockResolvedValueOnce([]);
      vi.spyOn(nguonc, 'getStreams').mockResolvedValueOnce([]);

      await axios.get(`${appBaseUrl}/stream/series/tt7458054:1:1.json`);
      expect(kkSpy).toHaveBeenCalled();
      const p = kkSpy.mock.calls[0][0];
      expect(p.title).toBe('While You Were Sleeping');
      expect(p.aliases).toContain('Khi Nàng Say Giấc');
    });

    it('falls back to Cinemeta resolution when IMDb ID is not in dictionary', async () => {
      vi.spyOn(cinemeta, 'resolveCinemeta').mockResolvedValueOnce({
        name: 'The Dark Knight',
        year: 2008,
        aliases: ['Kỵ Sĩ Bóng Đêm'],
      });

      const kkSpy = vi.spyOn(kkphim, 'getStreams').mockResolvedValueOnce([]);
      vi.spyOn(vsmov, 'getStreams').mockResolvedValueOnce([]);
      vi.spyOn(nguonc, 'getStreams').mockResolvedValueOnce([]);

      await axios.get(`${appBaseUrl}/stream/movie/tt0468569.json`);
      expect(kkSpy).toHaveBeenCalled();
      const p = kkSpy.mock.calls[0][0];
      expect(p.title).toBe('The Dark Knight');
      expect(p.year).toBe(2008);
      expect(p.aliases).toContain('Kỵ Sĩ Bóng Đêm');
    });

    it('upserts discovered mappings into Supabase for future queries', async () => {
      const upsertSpy = vi.spyOn(supabaseDb, 'upsertMediaMapping').mockResolvedValueOnce({});
      vi.spyOn(cinemeta, 'resolveCinemeta').mockResolvedValueOnce({
        name: 'Interstellar',
        year: 2014,
      });

      vi.spyOn(kkphim, 'search').mockResolvedValueOnce([{ name: 'Interstellar', slug: 'interstellar', year: 2014 }]);
      vi.spyOn(kkphim, 'getStreams').mockResolvedValueOnce([]);
      vi.spyOn(vsmov, 'getStreams').mockResolvedValueOnce([]);
      vi.spyOn(nguonc, 'getStreams').mockResolvedValueOnce([]);

      await axios.get(`${appBaseUrl}/stream/movie/tt0816692.json`);
      expect(upsertSpy).toHaveBeenCalled();
      expect(upsertSpy.mock.calls[0][0].imdb_id).toBe('tt0816692');
      expect(upsertSpy.mock.calls[0][0].title).toBe('Interstellar');
    });
  });

  // ─────────────────────────────────────────────────────────────
  // 5. Profile Bitmask Isolation
  // ─────────────────────────────────────────────────────────────
  describe('5. Profile Bitmask & Token Isolation', () => {
    it('/c/1/stream/... queries ONLY NguonC (bitmask 1)', async () => {
      const vsmovSpy = vi.spyOn(vsmov, 'getStreams');
      const kkphimSpy = vi.spyOn(kkphim, 'getStreams');
      const nguoncSpy = vi.spyOn(nguonc, 'getStreams').mockResolvedValueOnce([
        { title: '[VIP 3 • NguonC] Only Stream', url: 'https://nguonc.cdn/s.m3u8' },
      ]);

      const res = await axios.get(`${appBaseUrl}/c/1/stream/movie/tt1375666.json`);
      expect(res.status).toBe(200);
      expect(res.data.streams).toHaveLength(1);
      expect(vsmovSpy).not.toHaveBeenCalled();
      expect(kkphimSpy).not.toHaveBeenCalled();
      expect(nguoncSpy).toHaveBeenCalledTimes(1);
    });

    it('/c/2/stream/... queries ONLY KKPhim (bitmask 2)', async () => {
      const vsmovSpy = vi.spyOn(vsmov, 'getStreams');
      const kkphimSpy = vi.spyOn(kkphim, 'getStreams').mockResolvedValueOnce([
        { title: '[VIP 2 • KKPhim] Only Stream', url: 'https://kkphim.cdn/s.m3u8' },
      ]);
      const nguoncSpy = vi.spyOn(nguonc, 'getStreams');

      const res = await axios.get(`${appBaseUrl}/c/2/stream/movie/tt1375666.json`);
      expect(res.status).toBe(200);
      expect(res.data.streams).toHaveLength(1);
      expect(vsmovSpy).not.toHaveBeenCalled();
      expect(kkphimSpy).toHaveBeenCalledTimes(1);
      expect(nguoncSpy).not.toHaveBeenCalled();
    });

    it('/c/4/stream/... queries ONLY VSMOV (bitmask 4)', async () => {
      const vsmovSpy = vi.spyOn(vsmov, 'getStreams').mockResolvedValueOnce([
        { title: '[VIP 1 • VSMOV] 4K Only Stream', url: 'https://vsmov.cdn/s.m3u8' },
      ]);
      const kkphimSpy = vi.spyOn(kkphim, 'getStreams');
      const nguoncSpy = vi.spyOn(nguonc, 'getStreams');

      const res = await axios.get(`${appBaseUrl}/c/4/stream/movie/tt1375666.json`);
      expect(res.status).toBe(200);
      expect(res.data.streams).toHaveLength(1);
      expect(vsmovSpy).toHaveBeenCalledTimes(1);
      expect(kkphimSpy).not.toHaveBeenCalled();
      expect(nguoncSpy).not.toHaveBeenCalled();
    });

    it('/c/7/stream/... queries ALL 3 providers (bitmask 7)', async () => {
      const vsmovSpy = vi.spyOn(vsmov, 'getStreams').mockResolvedValueOnce([]);
      const kkphimSpy = vi.spyOn(kkphim, 'getStreams').mockResolvedValueOnce([]);
      const nguoncSpy = vi.spyOn(nguonc, 'getStreams').mockResolvedValueOnce([]);

      const res = await axios.get(`${appBaseUrl}/c/7/stream/movie/tt1375666.json`);
      expect(res.status).toBe(200);
      expect(vsmovSpy).toHaveBeenCalledTimes(1);
      expect(kkphimSpy).toHaveBeenCalledTimes(1);
      expect(nguoncSpy).toHaveBeenCalledTimes(1);
    });
  });

  // ─────────────────────────────────────────────────────────────
  // 6. Caching Behavior & Isolation
  // ─────────────────────────────────────────────────────────────
  describe('6. Caching Behavior & Profile Key Isolation', () => {
    it('caches valid non-empty streams and serves subsequent request from cache', async () => {
      const vsmovSpy = vi.spyOn(vsmov, 'getStreams').mockResolvedValueOnce([
        { title: '[VIP 1] Cached Stream', url: 'https://cdn.com/cached.m3u8' },
      ]);
      vi.spyOn(kkphim, 'getStreams').mockResolvedValueOnce([]);
      vi.spyOn(nguonc, 'getStreams').mockResolvedValueOnce([]);

      // 1st request -> uncached
      const res1 = await axios.get(`${appBaseUrl}/stream/movie/tt1375666.json`);
      expect(res1.status).toBe(200);
      expect(res1.data.streams).toHaveLength(1);
      expect(vsmovSpy).toHaveBeenCalledTimes(1);

      // 2nd request -> cache hit
      const res2 = await axios.get(`${appBaseUrl}/stream/movie/tt1375666.json`);
      expect(res2.status).toBe(200);
      expect(res2.data.streams).toHaveLength(1);
      expect(res2.data.streams[0].title).toContain('Cached Stream');
      expect(vsmovSpy).toHaveBeenCalledTimes(1); // Not called again
    });

    it('does NOT cache empty stream results ({ streams: [] }) or error states', async () => {
      vi.spyOn(vsmov, 'getStreams').mockResolvedValueOnce([]);
      vi.spyOn(kkphim, 'getStreams').mockResolvedValueOnce([]);
      vi.spyOn(nguonc, 'getStreams').mockResolvedValueOnce([]);

      // 1st request returns empty
      const res1 = await axios.get(`${appBaseUrl}/stream/movie/tt9999999.json`);
      expect(res1.status).toBe(200);
      expect(res1.data.streams).toEqual([]);

      // Mock provider returning stream on retry
      vi.spyOn(vsmov, 'getStreams').mockResolvedValueOnce([
        { title: '[VIP 1] New Stream', url: 'https://cdn.com/new.m3u8' },
      ]);
      vi.spyOn(kkphim, 'getStreams').mockResolvedValueOnce([]);
      vi.spyOn(nguonc, 'getStreams').mockResolvedValueOnce([]);

      // 2nd request should execute live query instead of returning cached empty array
      const res2 = await axios.get(`${appBaseUrl}/stream/movie/tt9999999.json`);
      expect(res2.status).toBe(200);
      expect(res2.data.streams).toHaveLength(1);
      expect(res2.data.streams[0].title).toContain('New Stream');
    });

    it('isolates cache keys across different profile bitmasks (/c/1/ vs /c/7/)', async () => {
      // 1. Query with bitmask 1 (NguonC only)
      vi.spyOn(nguonc, 'getStreams').mockResolvedValueOnce([
        { title: '[VIP 3] NguonC Stream', url: 'https://nguonc.cdn/s.m3u8' },
      ]);
      const resNguonC = await axios.get(`${appBaseUrl}/c/1/stream/movie/tt1375666.json`);
      expect(resNguonC.data.streams).toHaveLength(1);

      // 2. Query with bitmask 7 (All providers)
      vi.spyOn(vsmov, 'getStreams').mockResolvedValueOnce([
        { title: '[VIP 1] VSMOV 4K Stream', url: 'https://vsmov.cdn/4k.m3u8' },
      ]);
      vi.spyOn(kkphim, 'getStreams').mockResolvedValueOnce([
        { title: '[VIP 2] KKPhim Stream', url: 'https://kkphim.cdn/fhd.m3u8' },
      ]);
      vi.spyOn(nguonc, 'getStreams').mockResolvedValueOnce([
        { title: '[VIP 3] NguonC Stream', url: 'https://nguonc.cdn/s.m3u8' },
      ]);

      const resAll = await axios.get(`${appBaseUrl}/c/7/stream/movie/tt1375666.json`);
      expect(resAll.data.streams).toHaveLength(3);
    });
  });

  // ─────────────────────────────────────────────────────────────
  // 7. Stremio Protocol Compliance
  // ─────────────────────────────────────────────────────────────
  describe('7. Protocol Compliance & Response Headers', () => {
    it('sets proper CORS, Content-Type, and Cache-Control headers', async () => {
      vi.spyOn(vsmov, 'getStreams').mockResolvedValueOnce([]);
      vi.spyOn(kkphim, 'getStreams').mockResolvedValueOnce([]);
      vi.spyOn(nguonc, 'getStreams').mockResolvedValueOnce([]);

      const res = await axios.get(`${appBaseUrl}/stream/movie/tt1375666.json`);
      expect(res.headers['content-type']).toContain('application/json');
      expect(res.headers['access-control-allow-origin']).toBe('*');
      expect(res.headers['cache-control']).toContain('max-age=300');
    });

    it('enforces url and externalUrl mutual exclusivity on stream objects', async () => {
      vi.spyOn(vsmov, 'getStreams').mockResolvedValueOnce([
        { title: 'URL Stream', url: 'https://cdn.com/test.m3u8' },
        { title: 'External URL Stream', externalUrl: 'https://external.com/play' },
      ]);
      vi.spyOn(kkphim, 'getStreams').mockResolvedValueOnce([]);
      vi.spyOn(nguonc, 'getStreams').mockResolvedValueOnce([]);

      const res = await axios.get(`${appBaseUrl}/stream/movie/tt1375666.json`);
      expect(res.status).toBe(200);

      for (const s of res.data.streams) {
        if (s.url) {
          expect(s.externalUrl).toBeUndefined();
        }
        if (s.externalUrl) {
          expect(s.url).toBeUndefined();
        }
      }
    });

    it('provides bingeGroup in behaviorHints for series autoplay compatibility', async () => {
      vi.spyOn(kkphim, 'getStreams').mockResolvedValueOnce([
        {
          title: '[VIP 2 • KKPhim] Tập 1',
          url: 'https://cdn.com/s1e1.m3u8',
          behaviorHints: { notWebReady: false, bingeGroup: 'kkphim-cloy' },
        },
      ]);
      vi.spyOn(vsmov, 'getStreams').mockResolvedValueOnce([]);
      vi.spyOn(nguonc, 'getStreams').mockResolvedValueOnce([]);

      const res = await axios.get(`${appBaseUrl}/stream/series/tt10730822:1:1.json`);
      expect(res.status).toBe(200);
      expect(res.data.streams[0].behaviorHints).toBeDefined();
      expect(res.data.streams[0].behaviorHints.bingeGroup).toBe('kkphim-cloy');
    });
  });
});
