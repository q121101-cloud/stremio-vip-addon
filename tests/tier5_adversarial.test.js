'use strict';

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
const axios = require('axios');
const { getManifest, parseConfig, encodeConfig, ALL_CATALOGS, DEFAULT_CONFIG, GENRES } = require('../src/manifest');
const { handleCatalog, parseExtra, slugify, cleanDescription } = require('../src/routes/catalog');
const { handleMeta, resolveCinemetaMeta, resolveRawSlugMeta } = require('../src/routes/meta');
const { kkphimProvider, GENRE_MAP } = require('../src/providers/kkphim');
const { vsmovProvider } = require('../src/providers/vsmov');
const { nguoncProvider } = require('../src/providers/nguonc');
const { cache, flushCache } = require('../src/db/cache');

/**
 * ============================================================================
 * Tier 5: Adversarial & Stress Testing Test Suite
 * Empirical Challenger Verification for Milestone M1
 * 
 * Focus Areas:
 * 1. Combinatorial Bitmask Permutations (0 <= B <= 65535) & Corrupted Base64URL JSON
 * 2. Catalog Routing, Astronomical/Negative Skips, Vietnamese Diacritics & Malformed Extra
 * 3. Meta Video Array Construction, Episode Number Extraction, Uniqueness & Fallback Cascade
 * 4. Error Hardening & Zero-Crash Guarantees under Hostile Inputs
 * 5. Forensic Bug Discovery (Meta nested response bug & Raw Slug cascade short-circuit)
 * ============================================================================
 */

function createMockRes() {
  const headers = {};
  let statusCode = 200;
  let sentData = null;

  return {
    setHeader: (k, v) => { headers[k] = v; },
    status: (code) => { statusCode = code; return this; },
    json: (data) => { sentData = data; return sentData; },
    _getHeaders: () => headers,
    _getStatusCode: () => statusCode,
    _getData: () => sentData
  };
}

describe('Tier 5 — Adversarial Category 1: Bitmask Permutations (0 <= B <= 65535) & Config Hardening', () => {

  it('1.1 should exhaustively validate all 65,536 bitmask integer permutations without throwing', () => {
    let validManifestCount = 0;

    for (let mask = 0; mask <= 65535; mask++) {
      const maskStr = String(mask);
      const parsed = parseConfig(maskStr);

      // Verify structure integrity
      expect(Array.isArray(parsed.providers)).toBe(true);
      expect(parsed.providers.length).toBeGreaterThan(0);
      expect(Array.isArray(parsed.categories)).toBe(true);
      expect(parsed.categories.length).toBeGreaterThan(0);
      expect(typeof parsed.proxyQuality).toBe('string');
      expect(typeof parsed.preferredAudio).toBe('string');

      // Verify provider items are strictly known providers
      for (const p of parsed.providers) {
        expect(['nguonc', 'kkphim', 'vsmov']).toContain(p);
      }

      // Verify category items are strictly known categories
      for (const c of parsed.categories) {
        expect(['phim-moi', 'phim-le', 'phim-bo', 'hoat-hinh', 'phim-chieu-rap']).toContain(c);
      }

      // Sample manifest generation for representative bitmasks
      if (mask % 256 === 0 || mask === 0 || mask === 7 || mask === 3847 || mask === 65535) {
        const manifest = getManifest(maskStr);
        expect(manifest).toBeDefined();
        expect(manifest.id).toBe('community.vipmovies.addon');
        expect(manifest.version).toBe('2.0.0');
        expect(manifest.resources).toEqual(['catalog', 'meta', 'stream']);
        expect(manifest.types).toEqual(['movie', 'series']);
        expect(Array.isArray(manifest.catalogs)).toBe(true);
        expect(manifest.behaviorHints.configurable).toBe(true);
        validManifestCount++;
      }
    }

    expect(validManifestCount).toBeGreaterThan(250);
  });

  it('1.2 should correctly decode distinct provider single-bit and multi-bit masks', () => {
    expect(parseConfig('0').providers).toEqual(DEFAULT_CONFIG.providers);
    expect(parseConfig('1').providers).toEqual(['nguonc']);
    expect(parseConfig('2').providers).toEqual(['kkphim']);
    expect(parseConfig('3').providers).toEqual(['nguonc', 'kkphim']);
    expect(parseConfig('4').providers).toEqual(['vsmov']);
    expect(parseConfig('5').providers).toEqual(['nguonc', 'vsmov']);
    expect(parseConfig('6').providers).toEqual(['kkphim', 'vsmov']);
    expect(parseConfig('7').providers).toEqual(['nguonc', 'kkphim', 'vsmov']);
  });

  it('1.3 should correctly decode distinct category bits with default provider fallback', () => {
    // Bit 8 (256): phim-le
    const c8 = parseConfig('256');
    expect(c8.categories).toEqual(['phim-le']);
    expect(c8.providers).toEqual(DEFAULT_CONFIG.providers);

    // Bit 9 (512): phim-bo
    const c9 = parseConfig('512');
    expect(c9.categories).toEqual(['phim-bo']);

    // Bit 10 (1024): hoat-hinh
    const c10 = parseConfig('1024');
    expect(c10.categories).toEqual(['hoat-hinh']);

    // Bit 11 (2048): phim-chieu-rap
    const c11 = parseConfig('2048');
    expect(c11.categories).toEqual(['phim-chieu-rap']);

    // Bit 7 (128): phim-moi
    const c7 = parseConfig('128');
    expect(c7.categories).toEqual(['phim-moi']);

    // Combination of phim-le + phim-bo (256 + 512 = 768)
    const cCombo = parseConfig('768');
    expect(cCombo.categories).toEqual(['phim-le', 'phim-bo']);
  });

  it('1.4 should gracefully handle malformed, corrupted, or hostile Base64URL payloads', () => {
    const maliciousPayloads = [
      '',
      '   ',
      'default',
      'default.json',
      'invalid_base64_???@@@',
      'null',
      'undefined',
      '123.456',
      '-999',
      'NaN',
      '{}',
      '[]',
      Buffer.from('not-a-json').toString('base64url'),
      Buffer.from('{"providers": "not-an-array"}').toString('base64url'),
      Buffer.from('{"providers": []}').toString('base64url'),
      Buffer.from('{"categories": null}').toString('base64url'),
      Buffer.from('{"providers": [123, true, null]}').toString('base64url'),
      Buffer.from('{"__proto__": {"polluted": true}}').toString('base64url'),
      Buffer.from('{"constructor": {"prototype": {"isAdmin": true}}}').toString('base64url'),
      Buffer.from('{"proxyQuality": 9999}').toString('base64url'),
      'a'.repeat(50000)
    ];

    for (const payload of maliciousPayloads) {
      const cfg = parseConfig(payload);
      expect(cfg).toBeDefined();
      expect(Array.isArray(cfg.providers)).toBe(true);
      expect(Array.isArray(cfg.categories)).toBe(true);
      expect(cfg.providers.length).toBeGreaterThan(0);
      expect(cfg.categories.length).toBeGreaterThan(0);

      const manifest = getManifest(payload);
      expect(manifest).toBeDefined();
      expect(manifest.id).toBe('community.vipmovies.addon');
      expect(manifest.catalogs).toBeInstanceOf(Array);
    }
  });

  it('1.5 should verify encodeConfig and parseConfig round-trip idempotency', () => {
    const testConfigs = [
      DEFAULT_CONFIG,
      { providers: ['vsmov'], categories: ['phim-le', 'phim-chieu-rap'], proxyQuality: '1080p', preferredAudio: 'vietsub' },
      { providers: ['kkphim', 'nguonc'], categories: ['hoat-hinh'], proxyQuality: '720p', preferredAudio: 'thuyetminh' },
      { providers: ['nguonc'], categories: ['phim-moi', 'phim-bo'], proxyQuality: 'auto', preferredAudio: 'longtieng' }
    ];

    for (const original of testConfigs) {
      const encoded = encodeConfig(original);
      expect(typeof encoded).toBe('string');
      expect(encoded).not.toContain('+');
      expect(encoded).not.toContain('/');
      expect(encoded).not.toContain('=');

      const decoded = parseConfig(encoded);
      expect(decoded.providers).toEqual(original.providers);
      expect(decoded.categories).toEqual(original.categories);
      expect(decoded.proxyQuality).toBe(original.proxyQuality);
      expect(decoded.preferredAudio).toBe(original.preferredAudio);
    }
  });

  it('1.6 should ensure catalogs in getManifest only contain active providers and categories', () => {
    const singleProviderConfig = encodeConfig({
      providers: ['vsmov'],
      categories: ['phim-le']
    });

    const manifest = getManifest(singleProviderConfig);
    expect(manifest.name).toContain('VSMOV 4K');
    expect(manifest.name).not.toContain('KKPhim');
    expect(manifest.name).not.toContain('NguonC');

    for (const cat of manifest.catalogs) {
      expect(cat.id).toMatch(/^vsmov/);
      expect(cat.provider).toBeUndefined();
      expect(cat.category).toBeUndefined();
    }
    expect(manifest.catalogs.length).toBe(2);
  });
});

describe('Tier 5 — Adversarial Category 2: Catalog Filtering, Boundary Skips & Vietnamese Genre Stress', () => {

  beforeEach(() => {
    cache.flushAll();
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('2.1 should calculate page accurately for boundary, negative, and astronomical skips', async () => {
    const mockMetas = [{ id: 'kkphim_test', name: 'Test Movie', type: 'movie' }];
    const spy = vi.spyOn(kkphimProvider, 'getCatalog').mockResolvedValue({ metas: mockMetas });

    const skipTestCases = [
      { skipStr: '-100', expectedPage: 1 },
      { skipStr: '-1', expectedPage: 1 },
      { skipStr: '0', expectedPage: 1 },
      { skipStr: '19', expectedPage: 1 },
      { skipStr: '20', expectedPage: 2 },
      { skipStr: '39', expectedPage: 2 },
      { skipStr: '40', expectedPage: 3 },
      { skipStr: '999999', expectedPage: 50000 },
      { skipStr: '10000000', expectedPage: 500001 },
      { skipStr: 'not_a_number', expectedPage: 1 },
      { skipStr: 'NaN', expectedPage: 1 },
      { skipStr: 'null', expectedPage: 1 },
      { skipStr: 'undefined', expectedPage: 1 },
      { skipStr: '12.85', expectedPage: 1 }
    ];

    for (const tc of skipTestCases) {
      cache.flushAll();
      spy.mockClear();

      const req = {
        params: { type: 'movie', id: 'kkphim-phim-le', extra: `skip=${tc.skipStr}` },
        query: {}
      };
      const res = createMockRes();

      await handleCatalog(req, res);
      const data = res._getData();
      expect(data).toBeDefined();
      expect(data.metas).toEqual(mockMetas);
      expect(spy).toHaveBeenCalled();
      expect(spy.mock.calls[0][1].page).toBe(tc.expectedPage);
    }
  });

  it('2.2 should correctly process all 21 Vietnamese standard genres with exact slugification', () => {
    for (const genre of GENRES) {
      const slug = slugify(genre);
      expect(slug).toBeDefined();
      expect(typeof slug).toBe('string');
      expect(slug.length).toBeGreaterThan(0);
      expect(slug).not.toMatch(/[\u0300-\u036f]/);
      expect(slug).not.toContain('đ');
      expect(slug).not.toContain(' ');

      if (GENRE_MAP[genre]) {
        expect(GENRE_MAP[genre]).toBe(slug);
      }
    }
  });

  it('2.3 should stress-test unusual, composite, and decomposed Vietnamese genres', async () => {
    const spy = vi.spyOn(kkphimProvider, 'getByGenre').mockResolvedValue({ metas: [] });

    const unusualGenres = [
      'Hành Động & Phiêu Lưu 2024',
      'Tâm Lý - Xã Hội Đen (18+)',
      'Phim Chiếu Rạp Bom Tấn 4K',
      'Hoạt Hình 3D Trung Quốc Vietsub',
      'Hành Động', // NFD decomposed form of Hành Động
      'Cổ Trang Kiếm Hiệp Võ Thuật',
      'Trinh Thám / Hình Sự Bí Ẩn',
      '✨ Phim Hot Đặc Sắc 🎬',
      'Khoa Học & Viễn Tưởng (Sci-Fi)'
    ];

    for (const genre of unusualGenres) {
      cache.flushAll();
      spy.mockClear();

      const encodedGenre = encodeURIComponent(genre);
      const req = {
        params: { type: 'movie', id: 'kkphim-phim-moi', extra: `genre=${encodedGenre}&skip=0` },
        query: {}
      };
      const res = createMockRes();

      await handleCatalog(req, res);
      expect(res._getData()).toEqual({ metas: [] });
      expect(spy).toHaveBeenCalled();
      expect(spy.mock.calls[0][0]).toBe(genre);
    }
  });

  it('2.4 should handle hostile extra string formats and URI encoding errors gracefully', async () => {
    const hostileExtras = [
      '',
      '.json',
      'genre=&skip=',
      'search=&&&genre=&&&',
      'skip=20.json',
      'genre=%E0%A4%A&skip=20',
      'search=%ZZ%invalid',
      'search=' + 'A'.repeat(5000),
      'search=<script>alert("xss")</script>',
      'search=\' OR 1=1 --'
    ];

    for (const extraStr of hostileExtras) {
      cache.flushAll();
      const req = {
        params: { type: 'movie', id: 'kkphim-phim-le', extra: extraStr },
        query: {}
      };
      const res = createMockRes();

      await expect(handleCatalog(req, res)).resolves.not.toThrow();
      const data = res._getData();
      expect(data).toBeDefined();
      expect(Array.isArray(data.metas)).toBe(true);
    }
  });

  it('2.5 should enforce strict provider isolation based on configuration token', async () => {
    const kkphimSpy = vi.spyOn(kkphimProvider, 'getCatalog').mockResolvedValue({ metas: [{ id: 'kk_1' }] });
    const vsmovSpy = vi.spyOn(vsmovProvider, 'getCatalog').mockResolvedValue({ metas: [{ id: 'vsmov_1' }] });
    const nguoncSpy = vi.spyOn(nguoncProvider, 'getCatalog').mockResolvedValue({ metas: [{ id: 'nguonc_1' }] });

    const vsmovOnlyConfig = encodeConfig({ providers: ['vsmov'], categories: ['phim-le'] });

    // 1. Requesting KKPhim catalog with VSMOV-only config -> immediate empty metas without calling provider
    const req1 = { params: { config: vsmovOnlyConfig, type: 'movie', id: 'kkphim-phim-le' }, query: {} };
    const res1 = createMockRes();
    await handleCatalog(req1, res1);
    expect(res1._getData()).toEqual({ metas: [] });
    expect(kkphimSpy).not.toHaveBeenCalled();

    // 2. Requesting NguonC catalog with VSMOV-only config -> immediate empty metas without calling provider
    const req2 = { params: { config: vsmovOnlyConfig, type: 'movie', id: 'nguonc-phim-le' }, query: {} };
    const res2 = createMockRes();
    await handleCatalog(req2, res2);
    expect(res2._getData()).toEqual({ metas: [] });
    expect(nguoncSpy).not.toHaveBeenCalled();

    // 3. Requesting VSMOV catalog with VSMOV-only config -> succeeds
    const req3 = { params: { config: vsmovOnlyConfig, type: 'movie', id: 'vsmov-phim-le' }, query: {} };
    const res3 = createMockRes();
    await handleCatalog(req3, res3);
    expect(vsmovSpy).toHaveBeenCalled();
    expect(res3._getData()).toEqual({ metas: [{ id: 'vsmov_1' }] });
  });

  it('2.6 should verify parseExtra and cleanDescription utility robustness', () => {
    expect(parseExtra('')).toEqual({});
    expect(parseExtra(null)).toEqual({});
    expect(parseExtra('skip=20.json')).toEqual({ skip: '20' });
    expect(parseExtra('genre=Hành%20Động&skip=40')).toEqual({ genre: 'Hành Động', skip: '40' });

    expect(cleanDescription('')).toBe('');
    expect(cleanDescription(null)).toBe('');
    expect(cleanDescription('<p>Hello <b>World</b> &amp; &lt;Friends&gt; &quot;Test&quot; &#39;Quote&#39; &nbsp;</p>'))
      .toBe('Hello World & <Friends> "Test" \'Quote\'');
  });

  it('2.7 should return HTTP 200 with empty metas when upstream provider throws error', async () => {
    cache.flushAll();
    vi.spyOn(kkphimProvider, 'getCatalog').mockRejectedValueOnce(new Error('Simulated upstream socket timeout'));

    const req = { params: { type: 'movie', id: 'kkphim-phim-le-err-test' }, query: {} };
    const res = createMockRes();

    await handleCatalog(req, res);
    expect(res._getStatusCode()).toBe(200);
    expect(res._getData()).toEqual({ metas: [] });
  });
});

describe('Tier 5 — Adversarial Category 3: Meta Video Array Construction, Numbering & Cascade', () => {

  beforeEach(() => {
    cache.flushAll();
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('3.1 should verify KKPhim series video array construction, numbering extraction and uniqueness', async () => {
    const rawKkphimSeriesResponse = {
      status: true,
      movie: {
        _id: 'kk_series_1',
        name: 'Trùng Sinh Chi Môn',
        slug: 'trung-sinh-chi-mon',
        origin_name: 'Be Reborn',
        type: 'series',
        thumb_url: 'thumb.jpg',
        poster_url: 'poster.jpg',
        year: 2022,
        category: [{ name: 'Hành Động', slug: 'hanh-dong' }]
      },
      episodes: [
        {
          server_name: 'Server #1 (Vietsub)',
          server_data: [
            { name: 'Tập 01', slug: 'tap-01', link_m3u8: 'https://cdn.example.com/ep1.m3u8' },
            { name: 'Tập 02', slug: 'tap-02', link_m3u8: 'https://cdn.example.com/ep2.m3u8' },
            { name: 'Tập 03 (Special)', slug: 'tap-03', link_m3u8: 'https://cdn.example.com/ep3.m3u8' },
            { name: 'Tập 100', slug: 'tap-100', link_m3u8: 'https://cdn.example.com/ep100.m3u8' }
          ]
        },
        {
          server_name: 'Server #2 (Thuyết Minh)',
          server_data: [
            { name: 'Tập 1', slug: 'tap-1', link_m3u8: 'https://cdn.example.com/tm_ep1.m3u8' },
            { name: 'Tập 2', slug: 'tap-2', link_m3u8: 'https://cdn.example.com/tm_ep2.m3u8' }
          ]
        }
      ]
    };

    vi.spyOn(kkphimProvider, 'request').mockResolvedValue(rawKkphimSeriesResponse);

    const detail = await kkphimProvider.getDetail('series', 'trung-sinh-chi-mon');
    expect(detail.meta).toBeDefined();
    expect(detail.meta.type).toBe('series');
    expect(Array.isArray(detail.meta.videos)).toBe(true);
    expect(detail.meta.videos.length).toBe(4);

    const videos = detail.meta.videos;
    const seenIds = new Set();

    for (const v of videos) {
      expect(seenIds.has(v.id)).toBe(false);
      seenIds.add(v.id);

      expect(v.id).toMatch(/^kkphim:trung-sinh-chi-mon:1:\d+$/);
      expect(v.season).toBe(1);
      expect(typeof v.episode).toBe('number');
      expect(v.episode).toBeGreaterThanOrEqual(1);
      expect(typeof v.title).toBe('string');
      expect(v.released).toBeDefined();
    }

    expect(videos[0].episode).toBe(1);
    expect(videos[1].episode).toBe(2);
    expect(videos[2].episode).toBe(3);
    expect(videos[3].episode).toBe(100);
  });

  it('3.2 should verify VSMOV 4K series video array construction and numbering', async () => {
    const rawVsmovSeriesResponse = {
      movie: {
        name: 'Trò Chơi Vương Quyền',
        slug: 'game-of-thrones',
        origin_name: 'Game of Thrones',
        type: 'series',
        poster_url: 'https://vsmov.com/poster.jpg',
        thumb_url: 'https://vsmov.com/thumb.jpg',
        year: 2011,
        category: ['Chiến Tranh', 'Hành Động']
      },
      episodes: [
        {
          server_name: 'VSMOV VIP 4K',
          server_data: [
            { name: '1', slug: '1', link_embed: 'https://vsmov.com/video/uuid-1' },
            { name: '2', slug: '2', link_embed: 'https://vsmov.com/video/uuid-2' },
            { name: 'Tập 3', slug: 'tap-3', link_embed: 'https://vsmov.com/video/uuid-3' }
          ]
        }
      ]
    };

    vi.spyOn(vsmovProvider, 'request').mockResolvedValue(rawVsmovSeriesResponse);

    const detail = await vsmovProvider.getDetail('series', 'game-of-thrones');
    expect(detail.meta).toBeDefined();
    expect(detail.meta.type).toBe('series');
    expect(Array.isArray(detail.meta.videos)).toBe(true);
    expect(detail.meta.videos.length).toBe(3);

    const videos = detail.meta.videos;
    expect(videos[0].id).toBe('vsmov:game-of-thrones:1:1');
    expect(videos[0].episode).toBe(1);
    expect(videos[0].title).toBe('Tập 1');

    expect(videos[1].id).toBe('vsmov:game-of-thrones:1:2');
    expect(videos[1].episode).toBe(2);
    expect(videos[1].title).toBe('Tập 2');

    expect(videos[2].id).toBe('vsmov:game-of-thrones:1:3');
    expect(videos[2].episode).toBe(3);
    expect(videos[2].title).toBe('Tập 3');
  });

  it('3.3 should verify NguonC series video array construction and numbering', async () => {
    const rawNguoncSeriesResponse = {
      status: 'success',
      movie: {
        name: 'Tây Du Ký 1986',
        slug: 'tay-du-ky-1986',
        original_name: 'Journey to the West',
        total_episodes: 25,
        current_episode: 'Tập 25',
        poster_url: 'https://nguonc.com/poster.jpg',
        thumb_url: 'https://nguonc.com/thumb.jpg',
        year: 1986,
        episodes: [
          {
            server_name: 'NguonC StreamC',
            items: [
              { name: '01', slug: '01', embed: 'https://embed14.streamc.xyz/embed/1' },
              { name: '02', slug: '02', embed: 'https://embed14.streamc.xyz/embed/2' },
              { name: 'Tập 25', slug: 'tap-25', embed: 'https://embed14.streamc.xyz/embed/25' }
            ]
          }
        ]
      }
    };

    vi.spyOn(nguoncProvider, 'request').mockResolvedValue(rawNguoncSeriesResponse);

    const detail = await nguoncProvider.getDetail('series', 'tay-du-ky-1986');
    expect(detail.meta).toBeDefined();
    expect(detail.meta.type).toBe('series');
    expect(Array.isArray(detail.meta.videos)).toBe(true);
    expect(detail.meta.videos.length).toBe(3);

    const videos = detail.meta.videos;
    expect(videos[0].id).toBe('nguonc:tay-du-ky-1986:1:1');
    expect(videos[0].episode).toBe(1);

    expect(videos[1].id).toBe('nguonc:tay-du-ky-1986:1:2');
    expect(videos[1].episode).toBe(2);

    expect(videos[2].id).toBe('nguonc:tay-du-ky-1986:1:25');
    expect(videos[2].episode).toBe(25);
  });

  it('3.4 should ensure single movie detail does not contain a videos array', async () => {
    vi.spyOn(kkphimProvider, 'request').mockResolvedValue({
      status: true,
      movie: {
        _id: 'kk_movie_1',
        name: 'Inception',
        slug: 'inception',
        type: 'single',
        year: 2010
      },
      episodes: []
    });

    const detail = await kkphimProvider.getDetail('movie', 'inception');
    expect(detail.meta).toBeDefined();
    expect(detail.meta.type).toBe('movie');
    expect(detail.meta.videos).toBeUndefined();
  });

  it('3.5 should verify handleMeta ID routing and Cinemeta lookup', async () => {
    const mockCinemeta = {
      id: 'tt1375666',
      name: 'Inception',
      type: 'movie',
      year: 2010
    };
    vi.spyOn(axios, 'get').mockResolvedValueOnce({ data: { meta: mockCinemeta } });

    const req = { params: { type: 'movie', id: 'tt1375666' } };
    const res = createMockRes();

    await handleMeta(req, res);
    expect(res._getData()).toEqual({ meta: mockCinemeta });
  });

  it('3.6 should ensure handleMeta returns { meta: null } when provider returns { meta: null }', async () => {
    // When KKPhim returns { meta: null } for an unknown slug:
    vi.spyOn(kkphimProvider, 'getDetail').mockResolvedValueOnce({ meta: null });

    const req = { params: { type: 'movie', id: 'kkphim_nonexistent-movie' } };
    const res = createMockRes();

    await handleMeta(req, res);
    const data = res._getData();

    expect(data).toEqual({ meta: null });
  });

  it('3.7 should correctly cascade raw slug lookup across VSMOV -> KKPhim -> NguonC', async () => {
    // VSMOV returns { meta: null }
    vi.spyOn(vsmovProvider, 'getDetail').mockResolvedValueOnce({ meta: null });
    // KKPhim returns { meta: null }
    vi.spyOn(kkphimProvider, 'getDetail').mockResolvedValueOnce({ meta: null });
    // NguonC finds the movie
    const mockNguoncMeta = { id: 'nguonc_hit-movie', name: 'Hit Movie', type: 'movie' };
    vi.spyOn(nguoncProvider, 'getDetail').mockResolvedValueOnce({ meta: mockNguoncMeta });

    const req = { params: { type: 'movie', id: 'hit-movie' } };
    const res = createMockRes();

    await handleMeta(req, res);
    const data = res._getData();

    expect(data).toEqual({ meta: mockNguoncMeta });
  });
});
