'use strict';

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
const axios = require('axios');

// Modules under test
const { PORT, TIMEOUTS, BITMASK, getProxyBase } = require('../src/config');
const { cache, getCache, setCache, delCache, flushCache } = require('../src/db/cache');
const BaseProvider = require('../src/providers/base');
const { KKPhimProvider, kkphimProvider, GENRE_MAP } = require('../src/providers/kkphim');
const { VSMOVProvider, vsmovProvider } = require('../src/providers/vsmov');
const { NguonCProvider, nguoncProvider } = require('../src/providers/nguonc');
const { getManifest, parseConfig, encodeConfig, ALL_CATALOGS, DEFAULT_CONFIG } = require('../src/manifest');
const { parseExtra, slugify, cleanDescription, handleCatalog } = require('../src/routes/catalog');
const { handleMeta, resolveCinemetaMeta, resolveRawSlugMeta } = require('../src/routes/meta');

describe('Milestone M1 Unit Test Suite: Multi-Provider Stream Resolvers & Catalogs', () => {

  beforeEach(() => {
    flushCache();
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ==========================================
  // SECTION 1: Config & Environment Resolution
  // ==========================================
  describe('1. Configuration & getProxyBase Resolution', () => {
    it('1.1 should have valid default config constants', () => {
      expect(PORT).toBeGreaterThan(0);
      expect(TIMEOUTS.STREAM).toBe(3000);
      expect(TIMEOUTS.DEFAULT).toBe(5000);
      expect(BITMASK.PROVIDERS.nguonc).toBe(1);
      expect(BITMASK.PROVIDERS.kkphim).toBe(2);
      expect(BITMASK.PROVIDERS.vsmov).toBe(4);
    });

    it('1.2 should resolve proxyBase prioritizing PROXY_URL environment variable', () => {
      const orig = process.env.PROXY_URL;
      process.env.PROXY_URL = 'https://custom-proxy.example.com/';
      const resolved = getProxyBase();
      expect(resolved).toBe('https://custom-proxy.example.com');
      process.env.PROXY_URL = orig;
    });

    it('1.3 should resolve proxyBase from Express req headers (x-forwarded-proto & x-forwarded-host)', () => {
      const orig = process.env.PROXY_URL;
      delete process.env.PROXY_URL;
      const req = {
        headers: {
          'x-forwarded-proto': 'https',
          'x-forwarded-host': 'addon.stremio.vn'
        }
      };
      const resolved = getProxyBase(req);
      expect(resolved).toBe('https://addon.stremio.vn');
      process.env.PROXY_URL = orig;
    });

    it('1.4 should resolve proxyBase fallback to localhost and port', () => {
      const origProxy = process.env.PROXY_URL;
      const origRender = process.env.RENDER_EXTERNAL_URL;
      const origVercel = process.env.VERCEL_URL;
      delete process.env.PROXY_URL;
      delete process.env.RENDER_EXTERNAL_URL;
      delete process.env.VERCEL_URL;

      const resolved = getProxyBase();
      expect(resolved).toBe(`http://localhost:${PORT}`);

      process.env.PROXY_URL = origProxy;
      process.env.RENDER_EXTERNAL_URL = origRender;
      process.env.VERCEL_URL = origVercel;
    });
  });

  // ==========================================
  // SECTION 2: L1 In-Memory Cache
  // ==========================================
  describe('2. In-Memory Cache (NodeCache L1)', () => {
    it('2.1 should set and retrieve cached items', () => {
      setCache('test:key1', { foo: 'bar' }, 60);
      const val = getCache('test:key1');
      expect(val).toEqual({ foo: 'bar' });
    });

    it('2.2 should delete cached items', () => {
      setCache('test:key2', 'hello', 60);
      expect(getCache('test:key2')).toBe('hello');
      delCache('test:key2');
      expect(getCache('test:key2')).toBeNull();
    });

    it('2.3 should flush all cached items', () => {
      setCache('test:k1', 1);
      setCache('test:k2', 2);
      flushCache();
      expect(getCache('test:k1')).toBeNull();
      expect(getCache('test:k2')).toBeNull();
    });
  });

  // ==========================================
  // SECTION 3: BaseProvider Class & Helpers
  // ==========================================
  describe('3. BaseProvider Architecture & Utilities', () => {
    class TestProvider extends BaseProvider {
      constructor() {
        super({ id: 'testp', name: 'testp', displayName: 'Test Provider', baseUrl: 'https://api.test.com' });
      }
    }
    const provider = new TestProvider();

    it('3.1 should clean provider prefixes and colons from IDs', () => {
      expect(provider.cleanSlug('testp_matrix')).toBe('matrix');
      expect(provider.cleanSlug('testp:matrix:1:5')).toBe('matrix');
      expect(provider.cleanSlug('kkphim_cuu-mon')).toBe('cuu-mon');
      expect(provider.cleanSlug('vsmov_toan-chuc')).toBe('toan-chuc');
      expect(provider.cleanSlug('nguonc_avatar')).toBe('avatar');
      expect(provider.cleanSlug('raw-slug')).toBe('raw-slug');
    });

    it('3.2 should prefix slug with provider namespace', () => {
      expect(provider.prefixId('avatar-2024')).toBe('testp_avatar-2024');
      expect(provider.prefixId('testp_avatar-2024')).toBe('testp_avatar-2024');
    });

    it('3.3 should normalize Vietnamese strings into ASCII slugs', () => {
      expect(provider.normalizeSlug('Hành Động & Phiêu Lưu 2024!')).toBe('hanh-dong-phieu-luu-2024');
      expect(provider.normalizeSlug('Đường Bá Hổ')).toBe('duong-ba-ho');
    });

    it('3.4 should format relative and absolute image paths', () => {
      expect(provider.formatImageUrl('https://img.com/p.jpg')).toBe('https://img.com/p.jpg');
      expect(provider.formatImageUrl('upload/vod/p.jpg', 'https://cdn.img.com')).toBe('https://cdn.img.com/upload/vod/p.jpg');
      expect(provider.formatImageUrl(null)).toBeUndefined();
    });

    it('3.5 should extract season and episode numbers from compound IDs and strings', () => {
      expect(provider.extractSeasonEpisode('tt123456:2:8')).toEqual({ season: 2, episode: 8 });
      expect(provider.extractSeasonEpisode('kkphim:slug:1:12')).toEqual({ season: 1, episode: 12 });
      expect(provider.extractSeasonEpisode('S03E15')).toEqual({ season: 3, episode: 15 });
      expect(provider.extractSeasonEpisode('Tập 24')).toEqual({ season: 1, episode: 24 });
      expect(provider.extractSeasonEpisode('Ep 5')).toEqual({ season: 1, episode: 5 });
      expect(provider.extractSeasonEpisode('Full')).toEqual({ season: 1, episode: 1 });
    });

    it('3.6 should build Anti-403 HLS Proxy URL with base64url encoding', () => {
      const streamUrl = 'https://s1.cdn.com/stream/index.m3u8';
      const ref = 'https://player.com/';
      const proxyBase = 'https://addon.example.com';
      const proxyUrl = provider.buildProxyStreamUrl(streamUrl, ref, proxyBase, 'https://origin.com', 'https://sub.vtt');

      expect(proxyUrl).toContain('https://addon.example.com/hls/manifest.m3u8?url=');
      expect(proxyUrl).toContain('&ref=');
      expect(proxyUrl).toContain('&origin=');
      expect(proxyUrl).toContain('&sub=');

      // Verify base64url decoding
      const urlParams = new URL(proxyUrl);
      const b64Url = urlParams.searchParams.get('url');
      const decodedUrl = Buffer.from(b64Url, 'base64url').toString('utf8');
      expect(decodedUrl).toBe(streamUrl);
    });

    it('3.7 should handle request failures fail-soft (returns null on 404 or network failure)', async () => {
      vi.spyOn(axios, 'get').mockRejectedValueOnce({ response: { status: 404 } });
      const res = await provider.request('/non-existent');
      expect(res).toBeNull();
    });
  });

  // ==========================================
  // SECTION 4: KKPhim Provider Client
  // ==========================================
  describe('4. KKPhim Provider Client', () => {
    it('4.1 should normalize raw catalog item to Stremio Meta', () => {
      const raw = {
        name: 'Thần Điêu Đại Hiệp',
        origin_name: 'The Return of the Condor Heroes',
        slug: 'than-dieu-dai-hiep',
        type: 'series',
        poster_url: 'uploads/poster.jpg',
        thumb_url: 'uploads/thumb.jpg',
        year: 2006,
        quality: '1080p',
        lang: 'Vietsub',
        category: [{ name: 'Kiếm Hiệp' }, { name: 'Cổ Trang' }]
      };
      const meta = kkphimProvider.normalizeMetaItem(raw, 'series', 'https://phimimg.com');

      expect(meta.id).toBe('kkphim_than-dieu-dai-hiep');
      expect(meta.type).toBe('series');
      expect(meta.name).toBe('Thần Điêu Đại Hiệp');
      expect(meta.poster).toBe('https://phimimg.com/uploads/poster.jpg');
      expect(meta.releaseInfo).toContain('1080p');
      expect(meta.genres).toContain('Kiếm Hiệp');
    });

    it('4.2 should fetch categorical catalog (phim-le, phim-bo, hoat-hinh)', async () => {
      const mockResponse = {
        status: 'success',
        data: {
          items: [
            { slug: 'phim-1', name: 'Phim 1', type: 'single', poster_url: 'p1.jpg' }
          ],
          APP_DOMAIN_CDN_IMAGE: 'https://phimimg.com'
        }
      };
      vi.spyOn(kkphimProvider, 'request').mockResolvedValueOnce(mockResponse);

      const res = await kkphimProvider.getCatalog('kkphim-phim-le', { skip: 0 });
      expect(res.metas).toHaveLength(1);
      expect(res.metas[0].id).toBe('kkphim_phim-1');
      expect(res.metas[0].poster).toBe('https://phimimg.com/p1.jpg');
    });

    it('4.3 should fetch genre filtered catalog with GENRE_MAP translation', async () => {
      const mockResponse = {
        status: 'success',
        data: {
          items: [{ slug: 'hanh-dong-1', name: 'Phim Hành Động 1', type: 'single' }],
          APP_DOMAIN_CDN_IMAGE: 'https://phimimg.com'
        }
      };
      const reqSpy = vi.spyOn(kkphimProvider, 'request').mockResolvedValueOnce(mockResponse);

      const res = await kkphimProvider.getCatalog('kkphim-phim-le', { genre: 'Hành Động' });
      expect(reqSpy).toHaveBeenCalledWith('/v1/api/the-loai/hanh-dong?page=1&limit=20');
      expect(res.metas).toHaveLength(1);
    });

    it('4.4 should execute search and return mapped metas', async () => {
      const mockSearch = {
        status: 'success',
        data: {
          items: [{ slug: 'diep-van', name: 'Diệp Vấn', type: 'single' }],
          APP_DOMAIN_CDN_IMAGE: 'https://phimimg.com'
        }
      };
      vi.spyOn(kkphimProvider, 'request').mockResolvedValueOnce(mockSearch);

      const res = await kkphimProvider.search('Diệp Vấn');
      expect(res.metas).toHaveLength(1);
      expect(res.metas[0].id).toBe('kkphim_diep-van');
    });

    it('4.5 should return empty array when searching with empty string', async () => {
      const res = await kkphimProvider.search('   ');
      expect(res.metas).toEqual([]);
    });

    it('4.6 should fetch detail and build multi-episode videos array for series', async () => {
      const mockDetail = {
        status: true,
        movie: {
          slug: 'kiem-lai',
          name: 'Kiếm Lai',
          type: 'series',
          category: [{ name: 'Hoạt Hình' }]
        },
        episodes: [
          {
            server_name: 'Vietsub',
            server_data: [
              { name: 'Tập 01', slug: 'tap-01' },
              { name: 'Tập 02', slug: 'tap-02' }
            ]
          }
        ]
      };
      vi.spyOn(kkphimProvider, 'request').mockResolvedValueOnce(mockDetail);

      const { meta } = await kkphimProvider.getDetail('series', 'kkphim_kiem-lai');
      expect(meta.id).toBe('kkphim_kiem-lai');
      expect(meta.type).toBe('series');
      expect(meta.videos).toHaveLength(2);
      expect(meta.videos[0].id).toBe('kkphim:kiem-lai:1:1');
      expect(meta.videos[1].id).toBe('kkphim:kiem-lai:1:2');
    });

    it('4.7 should resolve multi-server streams with audio tags and direct HLS links', async () => {
      const mockDetail = {
        status: true,
        movie: {
          slug: 'kiem-lai',
          name: 'Kiếm Lai',
          quality: '1080p'
        },
        episodes: [
          {
            server_name: 'Vietsub #1',
            server_data: [
              { name: 'Tập 1', slug: 'tap-1', link_m3u8: 'https://cdn1.com/tap1.m3u8' }
            ]
          },
          {
            server_name: 'Thuyết Minh VIP',
            server_data: [
              { name: 'Tập 1', slug: 'tap-1', link_m3u8: 'https://cdn2.com/tap1.m3u8' }
            ]
          }
        ]
      };
      vi.spyOn(kkphimProvider, 'request').mockResolvedValueOnce(mockDetail);

      const streams = await kkphimProvider.getStreams({
        type: 'series',
        id: 'kkphim:kiem-lai:1:1',
        proxyBase: 'https://addon.proxy'
      });

      expect(streams).toHaveLength(2);
      expect(streams[0].title).toContain('Vietsub');
      expect(streams[0].url).toContain('https://addon.proxy/hls/manifest.m3u8?url=');
      expect(streams[0].behaviorHints.bingeGroup).toBe('kkphim-vietsub-ep-1');
      expect(streams[1].title).toContain('Thuyết Minh');
      expect(streams[1].behaviorHints.bingeGroup).toBe('kkphim-thuyetminh-ep-1');
    });
  });

  // ==========================================
  // SECTION 5: VSMOV 4K Provider Client
  // ==========================================
  describe('5. VSMOV 4K Provider Client', () => {
    it('5.1 should fetch 4K catalogs and format meta with 4K UHD tags', async () => {
      const mockList = {
        items: [
          {
            slug: 'dune-part-two',
            name: 'Dune: Hành Tinh Cát - Phần Hai',
            type: 'single',
            poster_url: 'https://vsmov.com/dune.jpg',
            year: 2024
          }
        ]
      };
      vi.spyOn(vsmovProvider, 'request').mockResolvedValueOnce(mockList);

      const res = await vsmovProvider.getCatalog('vsmov-4k');
      expect(res.metas).toHaveLength(1);
      expect(res.metas[0].id).toBe('vsmov_dune-part-two');
      expect(res.metas[0].releaseInfo).toContain('4K UHD');
    });

    it('5.2 should gracefully return empty array for unsupported catalogs (hoat-hinh)', async () => {
      const res = await vsmovProvider.getCatalog('hoat-hinh');
      expect(res.metas).toEqual([]);
    });

    it('5.3 should search VSMOV with empty keyword guard', async () => {
      const emptyRes = await vsmovProvider.search('');
      expect(emptyRes.metas).toEqual([]);

      const mockSearch = {
        items: [
          {
            slug: 'oppenheimer',
            name: 'Oppenheimer',
            imdb: { id: 'tt15398776' },
            tmdb: { id: 872585 }
          }
        ]
      };
      vi.spyOn(vsmovProvider, 'request').mockResolvedValueOnce(mockSearch);

      const res = await vsmovProvider.search('Oppenheimer');
      expect(res.metas).toHaveLength(1);
      expect(res.metas[0].imdbId).toBe('tt15398776');
      expect(res.metas[0].tmdbId).toBe('872585');
    });

    it('5.4 should derive master 4K M3U8 from embed video UUID', () => {
      const embedUrl = 'https://v14.streamvsmov.com/video/a1b2c3d4-e5f6-7890-abcd-ef1234567890';
      const masterUrl = vsmovProvider.deriveMasterM3u8(embedUrl);
      expect(masterUrl).toBe('https://v14.streamvsmov.com/stream/a1b2c3d4-e5f6-7890-abcd-ef1234567890/master.m3u8');
    });

    it('5.5 should extract WebVTT subtitles from embed HTML playerOptions', async () => {
      const html = `
        <script>
          const playerOptions = {
            "subtitles": [
              { "name": "vie", "url": "/video/uuid/sub.vtt", "code": "vie" }
            ]
          };
        </script>
      `;
      vi.spyOn(axios, 'get').mockResolvedValueOnce({ data: html });

      const subs = await vsmovProvider.extractSubtitles('https://v14.streamvsmov.com/video/uuid');
      expect(subs).toHaveLength(1);
      expect(subs[0].id).toBe('vie');
      expect(subs[0].url).toBe('https://v14.streamvsmov.com/video/uuid/sub.vtt');
    });

    it('5.6 should resolve 4K streams with proxied WebVTT subtitles', async () => {
      const mockDetail = {
        movie: {
          slug: 'dune-2',
          name: 'Dune: Part Two',
          type: 'single'
        },
        episodes: [
          {
            server_name: 'Vietsub #1',
            server_data: [
              {
                name: 'Full',
                slug: 'full',
                link_embed: 'https://v14.streamvsmov.com/video/a1b2c3d4-e5f6-7890-abcd-ef1234567890'
              }
            ]
          }
        ]
      };
      vi.spyOn(vsmovProvider, 'request').mockResolvedValueOnce(mockDetail);
      vi.spyOn(vsmovProvider, 'extractSubtitles').mockResolvedValueOnce([
        { id: 'vie', lang: 'Tiếng Việt', url: 'https://v14.streamvsmov.com/sub.vtt' }
      ]);

      const streams = await vsmovProvider.getStreams({
        type: 'movie',
        id: 'vsmov_dune-2',
        proxyBase: 'https://addon.proxy'
      });

      expect(streams).toHaveLength(1);
      expect(streams[0].name).toContain('4K Ultra HD');
      expect(streams[0].url).toContain('https://addon.proxy/hls/manifest.m3u8?url=');
      expect(streams[0].subtitles).toHaveLength(1);
      expect(streams[0].subtitles[0].url).toContain('https://addon.proxy/hls/sub.vtt?url=');
    });
  });

  // ==========================================
  // SECTION 6: NguonC Provider Client
  // ==========================================
  describe('6. NguonC Provider Client & StreamC De-obfuscation', () => {
    it('6.1 should unpack Dean Edwards obfuscated JavaScript', () => {
      const packed = "eval(function(p,a,c,k,e,d){while(c--)if(k[c])p=p.replace(new RegExp('\\\\b'+c.toString(a)+'\\\\b','g'),k[c]);return p;}('0 1=\"2\";',3,3,'var|greeting|hello'.split('|')))";
      const unpacked = nguoncProvider.unpackDeanEdwards(packed);
      expect(unpacked).toContain('var greeting="hello"');
    });

    it('6.2 should de-obfuscate StreamC data-obf Base64 JSON payload', async () => {
      const payload = {
        sUb: 'eyJoIjoiOGVlNDdhMWE1YTZhNGEwNTVhY2UzMzI3NjBhYjEyMjUiLCJ0IjoidG9rZW4xMjMifQ==',
        hD: '8ee47a1a5a6a4a055ace332760ab1225'
      };
      const b64DataObf = Buffer.from(JSON.stringify(payload)).toString('base64');
      const html = `<div id="player" data-obf="${b64DataObf}"></div>`;

      vi.spyOn(axios, 'get').mockResolvedValueOnce({ data: html });

      const extracted = await nguoncProvider.extractStreamC('https://embed14.streamc.xyz/embed.php?hash=8ee47a1a5a6a4a055ace332760ab1225');
      expect(extracted).not.toBeNull();
      expect(extracted.m3u8Url).toBe(`https://embed14.streamc.xyz/${payload.sUb}`);
      expect(extracted.referer).toBe('https://embed14.streamc.xyz/');
    });

    it('6.3 should fetch NguonC catalog and handle pagination gracefully', async () => {
      const mockList = {
        items: [
          {
            slug: 'cuu-mon',
            name: 'Cửu Môn',
            total_episodes: 1,
            current_episode: 'FULL',
            poster_url: 'poster.jpg'
          }
        ]
      };
      vi.spyOn(nguoncProvider, 'request').mockResolvedValueOnce(mockList);

      const res = await nguoncProvider.getCatalog('nguonc-movie-latest', { skip: 0 });
      expect(res.metas).toHaveLength(1);
      expect(res.metas[0].id).toBe('nguonc_cuu-mon');
      expect(res.metas[0].type).toBe('movie');
    });

    it('6.4 should return empty array on 422 page boundary', async () => {
      vi.spyOn(nguoncProvider, 'request').mockRejectedValueOnce({ response: { status: 422 } });
      const res = await nguoncProvider.getCatalog('nguonc-movie-latest', { skip: 9999 });
      expect(res.metas).toEqual([]);
    });

    it('6.5 should resolve NguonC stream through Anti-403 HLS Proxy', async () => {
      const mockFilm = {
        status: 'success',
        movie: {
          slug: 'cuu-mon',
          name: 'Cửu Môn',
          total_episodes: 1,
          current_episode: 'FULL',
          episodes: [
            {
              server_name: 'Vietsub #1',
              items: [
                {
                  name: 'Full',
                  slug: 'full',
                  embed: 'https://embed14.streamc.xyz/embed.php?hash=abc1234'
                }
              ]
            }
          ]
        }
      };
      vi.spyOn(nguoncProvider, 'request').mockResolvedValueOnce(mockFilm);
      vi.spyOn(nguoncProvider, 'extractStreamC').mockResolvedValueOnce({
        m3u8Url: 'https://embed14.streamc.xyz/sub_payload_token',
        referer: 'https://embed14.streamc.xyz/',
        origin: 'https://embed14.streamc.xyz'
      });

      const streams = await nguoncProvider.getStreams({
        type: 'movie',
        id: 'nguonc_cuu-mon',
        proxyBase: 'https://addon.proxy'
      });

      expect(streams).toHaveLength(1);
      expect(streams[0].name).toContain('NguonC');
      expect(streams[0].url).toContain('https://addon.proxy/hls/manifest.m3u8?url=');
      expect(streams[0].behaviorHints.bingeGroup).toBe('nguonc-hd-vietsub-movie');
    });
  });

  // ==========================================
  // SECTION 7: Dynamic Manifest Generator
  // ==========================================
  describe('7. Stremio v4 Dynamic Manifest Generator', () => {
    it('7.1 should generate valid default manifest matching Stremio protocol specifications', () => {
      const manifest = getManifest();
      expect(manifest.id).toBe('community.vipmovies.addon');
      expect(manifest.version).toBe('2.0.0');
      expect(manifest.resources).toEqual(['catalog', 'meta', 'stream']);
      expect(manifest.types).toEqual(['movie', 'series']);
      expect(manifest.idPrefixes).toContain('tt');
      expect(manifest.idPrefixes).toContain('vsmov:');
      expect(manifest.idPrefixes).toContain('kkphim:');
      expect(manifest.idPrefixes).toContain('nguonc:');
      expect(manifest.catalogs.length).toBeGreaterThan(0);
    });

    it('7.2 should parse bitmask configuration tokens', () => {
      // Mask 4 = VSMOV only
      const configVsmov = parseConfig('4');
      expect(configVsmov.providers).toEqual(['vsmov']);

      // Mask 3 = NguonC (1) + KKPhim (2)
      const configNguonKk = parseConfig('3');
      expect(configNguonKk.providers).toEqual(['nguonc', 'kkphim']);
    });

    it('7.3 should parse Base64URL JSON configuration tokens', () => {
      const customConfig = {
        providers: ['vsmov'],
        categories: ['phim-le']
      };
      const token = encodeConfig(customConfig);
      const parsed = parseConfig(token);

      expect(parsed.providers).toEqual(['vsmov']);
      expect(parsed.categories).toEqual(['phim-le']);
    });

    it('7.4 should dynamically filter catalogs based on custom configuration', () => {
      const token = encodeConfig({
        providers: ['vsmov'],
        categories: ['phim-le']
      });
      const manifest = getManifest(token);

      expect(manifest.name).toContain('VSMOV 4K');
      expect(manifest.name).not.toContain('KKPhim');
      expect(manifest.catalogs.every(c => c.id.startsWith('vsmov'))).toBe(true);
    });
  });

  // ==========================================
  // SECTION 8: Catalog Route Handler
  // ==========================================
  describe('8. Catalog Route Handler', () => {
    it('8.1 should parse extra query strings correctly', () => {
      const extra = parseExtra('genre=H%C3%A0nh%20%C4%90%E1%BB%99ng&skip=40.json');
      expect(extra.genre).toBe('Hành Động');
      expect(extra.skip).toBe('40');
    });

    it('8.2 should slugify Vietnamese diacritic names', () => {
      expect(slugify('Hành Động')).toBe('hanh-dong');
      expect(slugify('Chiến Tranh')).toBe('chien-tranh');
      expect(slugify('Tình Cảm')).toBe('tinh-cam');
    });

    it('8.3 should handle KKPhim catalog request and return JSON response', async () => {
      vi.spyOn(kkphimProvider, 'getCatalog').mockResolvedValueOnce({
        metas: [{ id: 'kkphim_test', name: 'Test Movie', type: 'movie' }]
      });

      const req = {
        params: { type: 'movie', id: 'kkphim-phim-le.json' },
        query: {},
        headers: {}
      };
      const res = {
        setHeader: vi.fn(),
        json: vi.fn()
      };

      await handleCatalog(req, res);

      expect(res.setHeader).toHaveBeenCalledWith('Content-Type', 'application/json; charset=utf-8');
      expect(res.setHeader).toHaveBeenCalledWith('Access-Control-Allow-Origin', '*');
      expect(res.json).toHaveBeenCalledWith({
        metas: [{ id: 'kkphim_test', name: 'Test Movie', type: 'movie' }]
      });
    });

    it('8.4 should return empty metas gracefully on error without crashing', async () => {
      vi.spyOn(kkphimProvider, 'getCatalog').mockRejectedValueOnce(new Error('Network error'));

      const req = {
        params: { type: 'movie', id: 'kkphim-phim-le.json' },
        query: {},
        headers: {}
      };
      const res = {
        setHeader: vi.fn(),
        json: vi.fn()
      };

      await handleCatalog(req, res);
      expect(res.json).toHaveBeenCalledWith({ metas: [] });
    });
  });

  // ==========================================
  // SECTION 9: Meta Route Handler
  // ==========================================
  describe('9. Meta Route Handler', () => {
    it('9.1 should resolve Cinemeta metadata for IMDb ID (tt...)', async () => {
      const mockCinemeta = {
        meta: {
          id: 'tt1234567',
          type: 'movie',
          name: 'Canonical Title',
          year: 2023
        }
      };
      vi.spyOn(axios, 'get').mockResolvedValueOnce({ data: mockCinemeta });

      const meta = await resolveCinemetaMeta('movie', 'tt1234567');
      expect(meta.id).toBe('tt1234567');
      expect(meta.name).toBe('Canonical Title');
    });

    it('9.2 should handle KKPhim meta request', async () => {
      vi.spyOn(kkphimProvider, 'getDetail').mockResolvedValueOnce({
        meta: { id: 'kkphim_cuu-mon', name: 'Cửu Môn', type: 'movie' }
      });

      const req = {
        params: { type: 'movie', id: 'kkphim_cuu-mon.json' },
        headers: {}
      };
      const res = {
        setHeader: vi.fn(),
        json: vi.fn()
      };

      await handleMeta(req, res);
      expect(res.json).toHaveBeenCalledWith({
        meta: { id: 'kkphim_cuu-mon', name: 'Cửu Môn', type: 'movie' }
      });
    });

    it('9.3 should handle VSMOV meta request', async () => {
      vi.spyOn(vsmovProvider, 'getDetail').mockResolvedValueOnce({
        meta: { id: 'vsmov_dune-2', name: 'Dune: Part Two', type: 'movie' }
      });

      const req = {
        params: { type: 'movie', id: 'vsmov_dune-2.json' },
        headers: {}
      };
      const res = {
        setHeader: vi.fn(),
        json: vi.fn()
      };

      await handleMeta(req, res);
      expect(res.json).toHaveBeenCalledWith({
        meta: { id: 'vsmov_dune-2', name: 'Dune: Part Two', type: 'movie' }
      });
    });

    it('9.4 should handle NguonC meta request', async () => {
      vi.spyOn(nguoncProvider, 'getDetail').mockResolvedValueOnce({
        meta: { id: 'nguonc_avatar', name: 'Avatar', type: 'movie' }
      });

      const req = {
        params: { type: 'movie', id: 'nguonc_avatar.json' },
        headers: {}
      };
      const res = {
        setHeader: vi.fn(),
        json: vi.fn()
      };

      await handleMeta(req, res);
      expect(res.json).toHaveBeenCalledWith({
        meta: { id: 'nguonc_avatar', name: 'Avatar', type: 'movie' }
      });
    });

    it('9.5 should return { meta: null } on missing ID or unknown slug', async () => {
      vi.spyOn(vsmovProvider, 'getDetail').mockResolvedValueOnce(null);
      vi.spyOn(kkphimProvider, 'getDetail').mockResolvedValueOnce(null);
      vi.spyOn(nguoncProvider, 'getDetail').mockResolvedValueOnce(null);

      const req = {
        params: { type: 'movie', id: 'unknown_slug.json' },
        headers: {}
      };
      const res = {
        setHeader: vi.fn(),
        json: vi.fn()
      };

      await handleMeta(req, res);
      expect(res.json).toHaveBeenCalledWith({ meta: null });
    });

    it('9.6 should return { meta: null } when provider returns { meta: null } without double nesting', async () => {
      vi.spyOn(kkphimProvider, 'getDetail').mockResolvedValueOnce({ meta: null });

      const req = {
        params: { type: 'movie', id: 'kkphim_notfound.json' },
        headers: {}
      };
      const res = {
        setHeader: vi.fn(),
        json: vi.fn()
      };

      await handleMeta(req, res);
      expect(res.json).toHaveBeenCalledWith({ meta: null });
    });

    it('9.7 should cascade raw slug lookup across VSMOV -> KKPhim -> NguonC correctly', async () => {
      vi.spyOn(vsmovProvider, 'getDetail').mockResolvedValueOnce({ meta: null });
      vi.spyOn(kkphimProvider, 'getDetail').mockResolvedValueOnce({ meta: null });
      vi.spyOn(nguoncProvider, 'getDetail').mockResolvedValueOnce({
        meta: { id: 'nguonc_slug', name: 'NguonC Found', type: 'movie' }
      });

      const req = {
        params: { type: 'movie', id: 'some-raw-slug.json' },
        headers: {}
      };
      const res = {
        setHeader: vi.fn(),
        json: vi.fn()
      };

      await handleMeta(req, res);
      expect(res.json).toHaveBeenCalledWith({
        meta: { id: 'nguonc_slug', name: 'NguonC Found', type: 'movie' }
      });
    });
  });

});
