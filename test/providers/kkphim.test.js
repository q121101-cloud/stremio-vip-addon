'use strict';

/**
 * ============================================================
 *  VIP Movies Addon — test/providers/kkphim.test.js
 *  Unit & Mock Tests for KKPhim Provider Client
 * ============================================================
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
const axios = require('axios');
const kkphim = require('../../src/providers/kkphim');
const { imdbCache, catalogCache, detailCache } = require('../../src/lib/cache');

describe('KKPhim Provider Client', () => {
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
  // 1. Module Exports & Constants
  // ─────────────────────────────────────────────────────────────
  describe('1. Module Exports & Identification', () => {
    it('exports proper provider metadata and functions', () => {
      expect(kkphim.id).toBe('kkphim');
      expect(kkphim.label).toBe('KKPhim');
      expect(typeof kkphim.getByImdb).toBe('function');
      expect(typeof kkphim.search).toBe('function');
      expect(typeof kkphim.getDetail).toBe('function');
      expect(typeof kkphim.getCatalog).toBe('function');
      expect(typeof kkphim.getStreams).toBe('function');
      expect(typeof kkphim.mapDetailMeta).toBe('function');
      expect(typeof kkphim.formatImageUrl).toBe('function');
    });
  });

  // ─────────────────────────────────────────────────────────────
  // 2. formatImageUrl
  // ─────────────────────────────────────────────────────────────
  describe('2. formatImageUrl', () => {
    it('returns null for empty/null/undefined url', () => {
      expect(kkphim.formatImageUrl(null)).toBeNull();
      expect(kkphim.formatImageUrl('')).toBeNull();
      expect(kkphim.formatImageUrl(undefined)).toBeNull();
    });

    it('preserves absolute http and https URLs', () => {
      expect(kkphim.formatImageUrl('https://example.com/img.jpg')).toBe('https://example.com/img.jpg');
      expect(kkphim.formatImageUrl('http://example.com/img.png')).toBe('http://example.com/img.png');
    });

    it('prefixes relative URLs with phimimg.com CDN', () => {
      expect(kkphim.formatImageUrl('/uploads/poster.jpg')).toBe('https://phimimg.com/uploads/poster.jpg');
      expect(kkphim.formatImageUrl('uploads/poster.jpg')).toBe('https://phimimg.com/uploads/poster.jpg');
    });
  });

  // ─────────────────────────────────────────────────────────────
  // 3. getByImdb
  // ─────────────────────────────────────────────────────────────
  describe('3. getByImdb', () => {
    it('returns null when imdbId is missing or empty', async () => {
      expect(await kkphim.getByImdb('')).toBeNull();
      expect(await kkphim.getByImdb(null)).toBeNull();
    });

    it('fetches movie detail via /imdb/title/:id and caches result', async () => {
      const mockMovie = { name: 'Inception', slug: 'inception', year: 2010 };
      const mockEpisodes = [{ server_name: 'Vietsub', server_data: [{ name: 'Full', link_m3u8: 'https://cdn.com/inc.m3u8' }] }];

      const axiosSpy = vi.spyOn(axios.Axios.prototype, 'request').mockResolvedValueOnce({
        status: 200,
        data: {
          status: true,
          movie: mockMovie,
          episodes: mockEpisodes,
        },
      });

      const res = await kkphim.getByImdb('tt1375666');
      expect(res).toBeDefined();
      expect(res.movie.name).toBe('Inception');
      expect(res.episodes).toHaveLength(1);
      expect(axiosSpy).toHaveBeenCalledTimes(1);

      // Second call should hit in-memory imdbCache
      const cachedRes = await kkphim.getByImdb('tt1375666');
      expect(cachedRes).toEqual(res);
      expect(axiosSpy).toHaveBeenCalledTimes(1); // No new network call
    });

    it('handles alternative response structure data.item and data.item.episodes', async () => {
      const mockMovie = { name: 'Interstellar', slug: 'interstellar', year: 2014 };
      const mockEpisodes = [{ server_name: 'Vietsub', server_data: [] }];

      vi.spyOn(axios.Axios.prototype, 'request').mockResolvedValueOnce({
        status: 200,
        data: {
          data: {
            item: {
              ...mockMovie,
              episodes: mockEpisodes,
            },
          },
        },
      });

      const res = await kkphim.getByImdb('tt0816692');
      expect(res).toBeDefined();
      expect(res.movie.name).toBe('Interstellar');
      expect(res.episodes).toHaveLength(1);
    });

    it('returns null on upstream 404 or network error without crashing', async () => {
      vi.spyOn(axios.Axios.prototype, 'request').mockRejectedValueOnce(new Error('Request failed with status code 404'));
      const res = await kkphim.getByImdb('tt9999999');
      expect(res).toBeNull();
    });
  });

  // ─────────────────────────────────────────────────────────────
  // 4. search
  // ─────────────────────────────────────────────────────────────
  describe('4. search', () => {
    it('returns empty array when keyword is empty', async () => {
      const res = await kkphim.search('');
      expect(res).toEqual([]);
    });

    it('searches /v1/api/tim-kiem and maps returned items', async () => {
      vi.spyOn(axios.Axios.prototype, 'request').mockResolvedValueOnce({
        status: 200,
        data: {
          data: {
            items: [
              {
                name: 'Hạ Cánh Nơi Anh',
                origin_name: 'Crash Landing on You',
                slug: 'ha-canh-noi-anh',
                year: 2019,
                poster_url: '/posters/cloy.jpg',
                thumb_url: '/thumbs/cloy.jpg',
                type: 'series',
                quality: 'FHD',
                lang: 'Vietsub',
                episode_current: 'Tập 16',
              },
            ],
          },
        },
      });

      const items = await kkphim.search('Crash Landing on You', 5);
      expect(items).toHaveLength(1);
      expect(items[0].name).toBe('Hạ Cánh Nơi Anh');
      expect(items[0].slug).toBe('ha-canh-noi-anh');
      expect(items[0].poster_url).toBe('https://phimimg.com/posters/cloy.jpg');
      expect(items[0].type).toBe('series');
    });

    it('catches network errors gracefully and returns empty array', async () => {
      vi.spyOn(axios.Axios.prototype, 'request').mockRejectedValueOnce(new Error('Search timeout'));
      const res = await kkphim.search('Error Keyword');
      expect(res).toEqual([]);
    });
  });

  // ─────────────────────────────────────────────────────────────
  // 5. getDetail
  // ─────────────────────────────────────────────────────────────
  describe('5. getDetail', () => {
    it('returns null for empty slug', async () => {
      expect(await kkphim.getDetail('')).toBeNull();
      expect(await kkphim.getDetail(null)).toBeNull();
    });

    it('fetches /phim/:slug and caches result in detailCache', async () => {
      const mockMovie = { name: 'Squid Game', slug: 'squid-game', year: 2021 };
      const mockEpisodes = [{ server_name: 'Vietsub #1', server_data: [{ name: '1', slug: 'tap-1', link_m3u8: 'https://cdn.com/sg1.m3u8' }] }];

      const axiosSpy = vi.spyOn(axios.Axios.prototype, 'request').mockResolvedValueOnce({
        status: 200,
        data: {
          movie: mockMovie,
          episodes: mockEpisodes,
        },
      });

      const res = await kkphim.getDetail('squid-game');
      expect(res).toBeDefined();
      expect(res.movie.name).toBe('Squid Game');
      expect(res.episodes).toHaveLength(1);
      expect(axiosSpy).toHaveBeenCalledTimes(1);

      // Cache hit
      const cached = await kkphim.getDetail('squid-game');
      expect(cached).toEqual(res);
      expect(axiosSpy).toHaveBeenCalledTimes(1);
    });

    it('handles error response by returning null', async () => {
      vi.spyOn(axios.Axios.prototype, 'request').mockRejectedValueOnce(new Error('Detail 500'));
      expect(await kkphim.getDetail('invalid-slug')).toBeNull();
    });
  });

  // ─────────────────────────────────────────────────────────────
  // 6. getCatalog
  // ─────────────────────────────────────────────────────────────
  describe('6. getCatalog', () => {
    it('handles search mode via extra.search', async () => {
      vi.spyOn(axios.Axios.prototype, 'request').mockResolvedValueOnce({
        status: 200,
        data: {
          data: {
            items: [{ name: 'Search Hit', slug: 'search-hit', quality: 'HD' }],
          },
        },
      });

      const items = await kkphim.getCatalog('movie', 1, { search: 'Search Hit' });
      expect(items).toHaveLength(1);
      expect(items[0].id).toBe('kkphim_search-hit');
      expect(items[0].name).toBe('Search Hit');
    });

    it('handles genre filter via /v1/api/the-loai/:genre', async () => {
      const axiosSpy = vi.spyOn(axios.Axios.prototype, 'request').mockResolvedValueOnce({
        status: 200,
        data: {
          data: {
            items: [{ name: 'Action Movie', slug: 'action-movie', quality: 'HD' }],
          },
        },
      });

      const items = await kkphim.getCatalog('movie', 1, { genre: 'hanh-dong' });
      expect(items).toHaveLength(1);
      expect(items[0].name).toBe('Action Movie');
      expect(axiosSpy.mock.calls[0][0].url).toContain('/v1/api/the-loai/hanh-dong');
    });

    it('handles country filter via /v1/api/quoc-gia/:country', async () => {
      const axiosSpy = vi.spyOn(axios.Axios.prototype, 'request').mockResolvedValueOnce({
        status: 200,
        data: {
          data: {
            items: [{ name: 'Korean Drama', slug: 'korean-drama', quality: 'HD' }],
          },
        },
      });

      const items = await kkphim.getCatalog('series', 1, { country: 'han-quoc' });
      expect(items).toHaveLength(1);
      expect(items[0].name).toBe('Korean Drama');
      expect(axiosSpy.mock.calls[0][0].url).toContain('/v1/api/quoc-gia/han-quoc');
    });

    it('handles phim-moi-cap-nhat endpoint', async () => {
      const axiosSpy = vi.spyOn(axios.Axios.prototype, 'request').mockResolvedValueOnce({
        status: 200,
        data: {
          items: [{ name: 'Latest Film', slug: 'latest-film', quality: 'HD' }],
        },
      });

      const items = await kkphim.getCatalog('phim-moi-cap-nhat', 1);
      expect(items).toHaveLength(1);
      expect(items[0].name).toBe('Latest Film');
      expect(axiosSpy.mock.calls[0][0].url).toContain('/danh-sach/phim-moi-cap-nhat');
    });

    it('handles standard list types (phim-le, phim-bo, hoat-hinh, tv-shows)', async () => {
      const axiosSpy = vi.spyOn(axios.Axios.prototype, 'request').mockResolvedValueOnce({
        status: 200,
        data: {
          data: {
            items: [{ name: 'Series 1', slug: 'series-1', type: 'series' }],
          },
        },
      });

      const items = await kkphim.getCatalog('phim-bo', 1);
      expect(items).toHaveLength(1);
      expect(items[0].type).toBe('series');
      expect(axiosSpy.mock.calls[0][0].url).toContain('/v1/api/danh-sach/phim-bo');
    });

    it('returns empty array on catalog fetch error', async () => {
      vi.spyOn(axios.Axios.prototype, 'request').mockRejectedValueOnce(new Error('Catalog Network Fail'));
      const items = await kkphim.getCatalog('phim-le', 1);
      expect(items).toEqual([]);
    });
  });

  // ─────────────────────────────────────────────────────────────
  // 7. getStreams
  // ─────────────────────────────────────────────────────────────
  describe('7. getStreams', () => {
    it('returns streams for movie via direct IMDb lookup', async () => {
      vi.spyOn(axios.Axios.prototype, 'request').mockResolvedValueOnce({
        status: 200,
        data: {
          movie: { name: 'Inception', slug: 'inception', year: 2010 },
          episodes: [
            {
              server_name: '#Vietsub',
              server_data: [{ name: 'Full', link_m3u8: 'https://cdn.example.com/inception.m3u8' }],
            },
            {
              server_name: '#Thuyết Minh',
              server_data: [{ name: 'Full', link_m3u8: 'https://cdn.example.com/inception_tm.m3u8' }],
            },
          ],
        },
      });

      const streams = await kkphim.getStreams({
        imdbId: 'tt1375666',
        type: 'movie',
        proxyBase: 'https://my-addon.com',
      });

      expect(streams).toHaveLength(2);
      expect(streams[0].name).toBe('VIP Movies 🎬');
      expect(streams[0].title).toContain('Vietsub Full HD');
      expect(streams[0].url).toContain('https://my-addon.com/hls/manifest.m3u8');
      expect(streams[0].behaviorHints.bingeGroup).toBe('kkphim-inception');

      expect(streams[1].title).toContain('Thuyết Minh Full HD');
    });

    it('returns streams for series episode with flexible episode name matching', async () => {
      vi.spyOn(axios.Axios.prototype, 'request').mockResolvedValueOnce({
        status: 200,
        data: {
          movie: { name: 'While You Were Sleeping', slug: 'while-you-were-sleeping', year: 2017 },
          episodes: [
            {
              server_name: 'Vietsub #1',
              server_data: [
                { name: '1', slug: 'tap-01', link_m3u8: 'https://cdn.example.com/ep1.m3u8' },
                { name: '2', slug: 'tap-02', link_m3u8: 'https://cdn.example.com/ep2.m3u8' },
                { name: '3', slug: 'tap-03', link_m3u8: 'https://cdn.example.com/ep3.m3u8' },
              ],
            },
          ],
        },
      });

      const streams = await kkphim.getStreams({
        slug: 'while-you-were-sleeping',
        type: 'series',
        season: 1,
        episode: 2,
        proxyBase: 'https://my-addon.com',
      });

      expect(streams).toHaveLength(1);
      expect(streams[0].title).toContain('[Tập 2]');
      expect(streams[0].url).toContain('/hls/manifest.m3u8');
    });

    it('falls back to index-based episode resolution if naming does not match', async () => {
      vi.spyOn(axios.Axios.prototype, 'request').mockResolvedValueOnce({
        status: 200,
        data: {
          movie: { name: 'Special Series', slug: 'special-series', year: 2022 },
          episodes: [
            {
              server_name: 'Lồng Tiếng #1',
              server_data: [
                { name: 'Hồi 1', link_m3u8: 'https://cdn.example.com/hoi1.m3u8' },
                { name: 'Hồi 2', link_m3u8: 'https://cdn.example.com/hoi2.m3u8' },
              ],
            },
          ],
        },
      });

      const streams = await kkphim.getStreams({
        slug: 'special-series',
        type: 'series',
        season: 1,
        episode: 2,
      });

      expect(streams).toHaveLength(1);
      expect(streams[0].title).toContain('Lồng Tiếng Full HD');
      expect(streams[0].title).toContain('Hồi 2');
    });

    it('returns empty array when target episode number is out of bounds', async () => {
      vi.spyOn(axios.Axios.prototype, 'request').mockResolvedValueOnce({
        status: 200,
        data: {
          movie: { name: 'Series Out of Bounds', slug: 'series-oob', year: 2022 },
          episodes: [
            {
              server_name: 'Server 1',
              server_data: [{ name: '1', link_m3u8: 'https://cdn.com/1.m3u8' }],
            },
          ],
        },
      });

      const streamsOob = await kkphim.getStreams({
        slug: 'series-oob',
        type: 'series',
        season: 1,
        episode: 999,
      });
      expect(streamsOob).toEqual([]);
    });

    it('returns empty array when no movie or episodes are found', async () => {
      vi.spyOn(axios.Axios.prototype, 'request').mockResolvedValueOnce({
        status: 200,
        data: { movie: null, episodes: [] },
      });

      const streams = await kkphim.getStreams({
        slug: 'empty-media',
        type: 'movie',
      });
      expect(streams).toEqual([]);
    });
  });

  // ─────────────────────────────────────────────────────────────
  // 8. mapDetailMeta
  // ─────────────────────────────────────────────────────────────
  describe('8. mapDetailMeta', () => {
    it('maps movie metadata properly for Stremio catalog', () => {
      const movie = {
        name: 'Chi Tiết Phim',
        origin_name: 'Detailed Movie',
        slug: 'chi-tiet-phim',
        poster_url: '/posters/movie.jpg',
        thumb_url: '/thumbs/movie.jpg',
        content: '<p>Tóm tắt phim nội dung hay.</p>',
        director: ['Đạo Diễn A'],
        actor: 'Diễn Viên 1, Diễn Viên 2',
        category: [{ name: 'Hành Động' }, { name: 'Viễn Tưởng' }],
        country: [{ name: 'Âu Mỹ' }],
        time: '120 phút',
        year: 2023,
      };

      const meta = kkphim.mapDetailMeta(movie, [], 'movie');
      expect(meta.id).toBe('kkphim_chi-tiet-phim');
      expect(meta.type).toBe('movie');
      expect(meta.name).toBe('Chi Tiết Phim');
      expect(meta.description).toBe('Tóm tắt phim nội dung hay.');
      expect(meta.cast).toEqual(['Diễn Viên 1', 'Diễn Viên 2']);
      expect(meta.genres).toEqual(['Hành Động', 'Viễn Tưởng']);
      expect(meta.country).toBe('Âu Mỹ');
      expect(meta.year).toBe(2023);
    });

    it('maps series metadata with videos list', () => {
      const movie = {
        name: 'Bộ Phim Dài Tập',
        slug: 'bo-phim-dai-tap',
        type: 'series',
        year: 2024,
      };
      const episodes = [
        {
          server_name: 'Vietsub',
          server_data: [
            { name: '1', slug: 'tap-1' },
            { name: '2', slug: 'tap-2' },
          ],
        },
      ];

      const meta = kkphim.mapDetailMeta(movie, episodes);
      expect(meta.type).toBe('series');
      expect(meta.videos).toHaveLength(2);
      expect(meta.videos[0].id).toBe('kkphim_bo-phim-dai-tap:1:1');
      expect(meta.videos[0].title).toBe('Tập 1');
      expect(meta.videos[1].id).toBe('kkphim_bo-phim-dai-tap:1:2');
    });
  });
});
