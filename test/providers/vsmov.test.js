'use strict';

/**
 * ============================================================
 *  VIP Movies Addon — test/providers/vsmov.test.js
 *  Unit & Mock Tests for VSMOV 4K Provider Client
 * ============================================================
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
const axios = require('axios');
const vsmov = require('../../src/providers/vsmov');
const { imdbCache, catalogCache, detailCache } = require('../../src/lib/cache');

describe('VSMOV 4K Provider Client', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    imdbCache.clear();
    catalogCache.clear();
    detailCache.clear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    imdbCache.clear();
    catalogCache.clear();
    detailCache.clear();
  });

  // ─────────────────────────────────────────────────────────────
  // 1. Module Exports & Identification
  // ─────────────────────────────────────────────────────────────
  describe('1. Module Exports & Identification', () => {
    it('exports proper provider instance and methods', () => {
      expect(vsmov.name).toBe('vsmov');
      expect(vsmov.baseUrl).toBe('https://vsmov.com');
      expect(vsmov.apiBase).toBe('https://vsmov.com/api');
      expect(typeof vsmov.search).toBe('function');
      expect(typeof vsmov.getDetail).toBe('function');
      expect(typeof vsmov.getByImdb).toBe('function');
      expect(typeof vsmov.getByTmdb).toBe('function');
      expect(typeof vsmov.getCatalog).toBe('function');
      expect(typeof vsmov.getStreams).toBe('function');
    });
  });

  // ─────────────────────────────────────────────────────────────
  // 2. search
  // ─────────────────────────────────────────────────────────────
  describe('2. search', () => {
    it('returns empty items when keyword is empty', async () => {
      const res = await vsmov.search('');
      expect(res).toEqual({ items: [], totalPages: 0 });
    });

    it('searches /search and returns parsed items and totalPages', async () => {
      const mockItems = [
        { name: 'Avatar 4K', slug: 'avatar-4k', quality: '4K', year: 2009 },
      ];

      const axiosSpy = vi.spyOn(axios.Axios.prototype, 'request').mockResolvedValueOnce({
        status: 200,
        data: {
          items: mockItems,
          paginate: { total_page: 3 },
        },
      });

      const res = await vsmov.search('Avatar', 1);
      expect(res.items).toHaveLength(1);
      expect(res.items[0].name).toBe('Avatar 4K');
      expect(res.totalPages).toBe(3);
      expect(axiosSpy.mock.calls[0][0].url).toContain('/search');
    });

    it('catches search errors and returns empty result', async () => {
      vi.spyOn(axios.Axios.prototype, 'request').mockRejectedValueOnce(new Error('Search Fail'));
      const res = await vsmov.search('Error Search');
      expect(res).toEqual({ items: [], totalPages: 0 });
    });
  });

  // ─────────────────────────────────────────────────────────────
  // 3. getDetail
  // ─────────────────────────────────────────────────────────────
  describe('3. getDetail', () => {
    it('returns null for empty or invalid slug', async () => {
      expect(await vsmov.getDetail('')).toBeNull();
      expect(await vsmov.getDetail(null)).toBeNull();
    });

    it('fetches /phim/:slug and caches result in detailCache', async () => {
      const mockMovie = { name: 'Dune Part Two', slug: 'dune-part-two', year: 2024 };
      const mockEpisodes = [
        {
          server_name: 'VIP Vietsub 4K',
          server_data: [{ name: 'Full', link_m3u8: 'https://vsmov.cdn/dune2.m3u8' }],
        },
      ];

      const axiosSpy = vi.spyOn(axios.Axios.prototype, 'request').mockResolvedValueOnce({
        status: 200,
        data: {
          movie: mockMovie,
          episodes: mockEpisodes,
        },
      });

      const res = await vsmov.getDetail('dune-part-two');
      expect(res).toBeDefined();
      expect(res.movie.name).toBe('Dune Part Two');
      expect(res.episodes).toHaveLength(1);
      expect(axiosSpy).toHaveBeenCalledTimes(1);

      // Cache hit
      const cached = await vsmov.getDetail('dune-part-two');
      expect(cached).toEqual(res);
      expect(axiosSpy).toHaveBeenCalledTimes(1);
    });

    it('returns null when upstream returns error', async () => {
      vi.spyOn(axios.Axios.prototype, 'request').mockRejectedValueOnce(new Error('Detail 404'));
      expect(await vsmov.getDetail('non-existent-slug')).toBeNull();
    });
  });

  // ─────────────────────────────────────────────────────────────
  // 4. getByImdb & getByTmdb
  // ─────────────────────────────────────────────────────────────
  describe('4. getByImdb & getByTmdb', () => {
    it('getByImdb returns null for empty imdbId', async () => {
      expect(await vsmov.getByImdb('')).toBeNull();
      expect(await vsmov.getByImdb(null)).toBeNull();
    });

    it('getByImdb finds movie by direct IMDb search matching item.imdb.id', async () => {
      const mockSearchRes = {
        items: [
          {
            name: 'Oppenheimer',
            slug: 'oppenheimer',
            imdb: { id: 'tt15398776' },
          },
        ],
      };

      const mockDetailRes = {
        movie: { name: 'Oppenheimer', slug: 'oppenheimer', year: 2023 },
        episodes: [{ server_name: '4K VIP', server_data: [] }],
      };

      vi.spyOn(axios.Axios.prototype, 'request')
        .mockResolvedValueOnce({ status: 200, data: mockSearchRes }) // search
        .mockResolvedValueOnce({ status: 200, data: mockDetailRes }); // getDetail

      const detail = await vsmov.getByImdb('tt15398776');
      expect(detail).toBeDefined();
      expect(detail.movie.name).toBe('Oppenheimer');
    });

    it('getByImdb falls back to title search matching item.imdb.id', async () => {
      const mockSearch1 = { items: [] }; // search by imdb returns empty
      const mockSearch2 = {
        items: [
          { name: 'Inception', slug: 'inception', imdb: { id: 'tt1375666' } },
        ],
      };
      const mockDetailRes = {
        movie: { name: 'Inception', slug: 'inception', year: 2010 },
        episodes: [{ server_name: '4K VIP', server_data: [] }],
      };

      vi.spyOn(axios.Axios.prototype, 'request')
        .mockResolvedValueOnce({ status: 200, data: mockSearch1 })
        .mockResolvedValueOnce({ status: 200, data: mockSearch2 })
        .mockResolvedValueOnce({ status: 200, data: mockDetailRes });

      const detail = await vsmov.getByImdb('tt1375666', 'Inception');
      expect(detail).toBeDefined();
      expect(detail.movie.slug).toBe('inception');
    });

    it('getByTmdb matches movie by tmdb.id', async () => {
      expect(await vsmov.getByTmdb(null)).toBeNull();

      const mockSearch = {
        items: [
          { name: 'Movie TMDB', slug: 'movie-tmdb', tmdb: { id: '12345' } },
        ],
      };
      const mockDetail = {
        movie: { name: 'Movie TMDB', slug: 'movie-tmdb' },
        episodes: [],
      };

      vi.spyOn(axios.Axios.prototype, 'request')
        .mockResolvedValueOnce({ status: 200, data: mockSearch })
        .mockResolvedValueOnce({ status: 200, data: mockDetail });

      const detail = await vsmov.getByTmdb('12345');
      expect(detail).toBeDefined();
      expect(detail.movie.slug).toBe('movie-tmdb');
    });
  });

  // ─────────────────────────────────────────────────────────────
  // 5. getCatalog
  // ─────────────────────────────────────────────────────────────
  describe('5. getCatalog', () => {
    it('handles search mode in getCatalog', async () => {
      vi.spyOn(axios.Axios.prototype, 'request').mockResolvedValueOnce({
        status: 200,
        data: {
          items: [{ name: 'Search Hit', slug: 'search-hit', quality: '4K' }],
        },
      });

      const items = await vsmov.getCatalog('4k', 1, { search: 'Search Hit' });
      expect(items).toHaveLength(1);
      expect(items[0].id).toBe('vsmov_search-hit');
      expect(items[0].releaseInfo).toContain('4K Ultra HD');
    });

    it('handles series catalog /danh-sach/phim-bo', async () => {
      const axiosSpy = vi.spyOn(axios.Axios.prototype, 'request').mockResolvedValueOnce({
        status: 200,
        data: {
          items: [{ name: 'Series 1', slug: 'series-1', type: 'series' }],
        },
      });

      const items = await vsmov.getCatalog('series', 1);
      expect(items).toHaveLength(1);
      expect(items[0].type).toBe('series');
      expect(axiosSpy.mock.calls[0][0].url).toContain('/danh-sach/phim-bo');
    });

    it('returns empty array on catalog fetch error', async () => {
      vi.spyOn(axios.Axios.prototype, 'request').mockRejectedValueOnce(new Error('Catalog Network Fail'));
      const items = await vsmov.getCatalog('4k', 1);
      expect(items).toEqual([]);
    });
  });

  // ─────────────────────────────────────────────────────────────
  // 6. getStreams
  // ─────────────────────────────────────────────────────────────
  describe('6. getStreams', () => {
    it('returns 4K streams for movie with Vietsub / Thuyết Minh / Lồng Tiếng classification', async () => {
      const mockDetail = {
        movie: { name: 'Dune 2', slug: 'dune-2', year: 2024 },
        episodes: [
          {
            server_name: 'VIP 1 Vietsub #4K',
            server_data: [
              {
                name: 'Full',
                link_m3u8: 'https://vsmov.cdn/dune2_sub.m3u8',
                link_embed: 'https://vsmov.com/embed/dune2',
              },
            ],
          },
          {
            server_name: 'VIP 2 Thuyết Minh #4K',
            server_data: [
              {
                name: 'Full',
                link_m3u8: 'https://vsmov.cdn/dune2_tm.m3u8',
              },
            ],
          },
          {
            server_name: 'VIP 3 Lồng Tiếng #4K',
            server_data: [
              {
                name: 'Full',
                link_m3u8: 'https://vsmov.cdn/dune2_lt.m3u8',
              },
            ],
          },
        ],
      };

      vi.spyOn(axios.Axios.prototype, 'request').mockResolvedValueOnce({
        status: 200,
        data: mockDetail,
      });

      const streams = await vsmov.getStreams({
        slug: 'dune-2',
        type: 'movie',
        proxyBase: 'https://my-addon.com',
      });

      expect(streams).toHaveLength(3);
      expect(streams[0].name).toBe('VIP Movies 🎬');
      expect(streams[0].server).toContain('VSMOV 4K (Vietsub)');
      expect(streams[0].quality).toBe('3840x2160');
      expect(streams[0].title).toContain('Vietsub 4K Ultra HD');
      expect(streams[0].url).toContain('https://my-addon.com/hls/manifest.m3u8');
      expect(streams[0].behaviorHints.bingeGroup).toBe('vsmov-vietsub-4k-vip-1');

      expect(streams[1].server).toContain('VSMOV 4K (Thuyết Minh)');
      expect(streams[1].behaviorHints.bingeGroup).toBe('vsmov-thuyetminh-4k-vip-1');

      expect(streams[2].server).toContain('VSMOV 4K (Lồng Tiếng)');
      expect(streams[2].behaviorHints.bingeGroup).toBe('vsmov-longtieng-4k-vip-1');
    });

    it('extracts subtitles from embed HTML when link_embed contains subtitle track', async () => {
      const mockDetail = {
        movie: { name: 'Movie with Subs', slug: 'movie-subs', year: 2024 },
        episodes: [
          {
            server_name: 'VIP 1 Vietsub',
            server_data: [
              {
                name: 'Full',
                link_embed: 'https://vsmov.com/embed/subs123',
              },
            ],
          },
        ],
      };

      const embedHtml = `<html><body><script>
        var player = {
          file: "https://vsmov.cdn/master.m3u8",
          tracks: [{ file: "https://vsmov.cdn/sub.vtt", kind: "captions" }]
        };
      </script></body></html>`;

      vi.spyOn(axios.Axios.prototype, 'request')
        .mockResolvedValueOnce({ status: 200, data: mockDetail }) // getDetail
        .mockResolvedValueOnce({ status: 200, data: embedHtml }); // embed HTML fetch

      const streams = await vsmov.getStreams({
        slug: 'movie-subs',
        type: 'movie',
        proxyBase: 'https://my-addon.com',
      });

      expect(streams).toHaveLength(1);
      expect(streams[0].subtitles).toBeDefined();
      expect(streams[0].subtitles).toHaveLength(1);
      expect(streams[0].subtitles[0].id).toBe('vi_vsmov');
      expect(streams[0].subtitles[0].lang).toBe('vie');
      expect(streams[0].subtitles[0].url).toContain('/hls/sub.vtt');
    });

    it('resolves series episodes with flexible numbering and bingeGroup with episode number', async () => {
      const mockDetail = {
        movie: { name: 'Series 4K', slug: 'series-4k', type: 'series', year: 2024 },
        episodes: [
          {
            server_name: 'Vietsub 4K',
            server_data: [
              { name: '1', slug: 'tap-1', link_m3u8: 'https://vsmov.cdn/ep1.m3u8' },
              { name: '2', slug: 'tap-2', link_m3u8: 'https://vsmov.cdn/ep2.m3u8' },
            ],
          },
        ],
      };

      vi.spyOn(axios.Axios.prototype, 'request').mockResolvedValueOnce({
        status: 200,
        data: mockDetail,
      });

      const streams = await vsmov.getStreams({
        slug: 'series-4k',
        type: 'series',
        season: 1,
        episode: 2,
        proxyBase: 'https://my-addon.com',
      });

      expect(streams).toHaveLength(1);
      expect(streams[0].title).toContain('[Tập 2]');
      expect(streams[0].behaviorHints.bingeGroup).toBe('vsmov-vietsub-4k-vip-1-ep2');
    });

    it('returns empty array on unexpected error or missing media', async () => {
      vi.spyOn(axios.Axios.prototype, 'request').mockRejectedValueOnce(new Error('VSMOV Crash'));
      const streams = await vsmov.getStreams({
        slug: 'crash-media',
        type: 'movie',
      });
      expect(streams).toEqual([]);
    });
  });
});
