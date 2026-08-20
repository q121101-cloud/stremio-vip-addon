'use strict';

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
const axios = require('axios');

// Modules under adversarial challenge
const BaseProvider = require('../src/providers/base');
const { KKPhimProvider, kkphimProvider, GENRE_MAP } = require('../src/providers/kkphim');
const { VSMOVProvider, vsmovProvider } = require('../src/providers/vsmov');
const { NguonCProvider, nguoncProvider } = require('../src/providers/nguonc');
const { handleCatalog, parseExtra, slugify, cleanDescription } = require('../src/routes/catalog');
const { handleMeta, resolveRawSlugMeta } = require('../src/routes/meta');
const { parseConfig, encodeConfig, getManifest } = require('../src/manifest');
const { cache, flushCache } = require('../src/db/cache');

describe('Adversarial & Empirical Stress Test Suite (Milestone M1 Providers)', () => {

  beforeEach(() => {
    flushCache();
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // =========================================================================
  // 1. EXTREME INPUTS & BOUNDARY ATTACKS (BaseProvider & Normalizers)
  // =========================================================================
  describe('1. Extreme Inputs & Boundary Attacks', () => {

    describe('1.1 BaseProvider.cleanSlug adversarial inputs', () => {
      const base = new BaseProvider({ id: 'testprov', name: 'testprov' });

      it('handles null, undefined, non-strings, numbers, objects, arrays gracefully', () => {
        expect(base.cleanSlug(null)).toBe('');
        expect(base.cleanSlug(undefined)).toBe('');
        expect(base.cleanSlug(12345)).toBe('');
        expect(base.cleanSlug({})).toBe('');
        expect(base.cleanSlug(['kkphim_test'])).toBe('');
        expect(base.cleanSlug(true)).toBe('');
      });

      it('handles extreme 10,000-character strings without crashing or regex DoS', () => {
        const longSlug = 'kkphim_' + 'a'.repeat(10000);
        const startTime = Date.now();
        const cleaned = base.cleanSlug(longSlug);
        const duration = Date.now() - startTime;

        expect(cleaned).toBe('a'.repeat(10000));
        expect(duration).toBeLessThan(100); // Must execute rapidly, no ReDoS
      });

      it('handles SQL injection, HTML tags, and special characters safely', () => {
        const sqlAttack = "kkphim_'; DROP TABLE movies; --";
        expect(base.cleanSlug(sqlAttack)).toBe("'; DROP TABLE movies; --");

        const xssAttack = 'kkphim_<script>alert("xss")</script>';
        expect(base.cleanSlug(xssAttack)).toBe('<script>alert("xss")</script>');

        const colonCluster = 'kkphim:slug:1:2:3:4:5:extra';
        expect(base.cleanSlug(colonCluster)).toBe('slug');
      });

      it('strips all recognized provider prefixes (kkphim, vsmov, nguonc, testprov)', () => {
        expect(base.cleanSlug('kkphim_mai-2024')).toBe('mai-2024');
        expect(base.cleanSlug('kkphim:mai-2024:1:1')).toBe('mai-2024');
        expect(base.cleanSlug('vsmov_avatar-2')).toBe('avatar-2');
        expect(base.cleanSlug('vsmov:avatar-2:1:1')).toBe('avatar-2');
        expect(base.cleanSlug('nguonc_lat-mat-7')).toBe('lat-mat-7');
        expect(base.cleanSlug('nguonc:lat-mat-7:1:1')).toBe('lat-mat-7');
        expect(base.cleanSlug('testprov_custom-slug')).toBe('custom-slug');
      });
    });

    describe('1.2 BaseProvider.normalizeSlug with complex Vietnamese diacritics & edge cases', () => {
      const base = new BaseProvider({ id: 'base' });

      it('handles complex Vietnamese diacritics and special characters correctly', () => {
        const input = 'Đường Đua Rực Lửa: Nghìn Lẻ Một Đêm (2024) [4K Ultra HD]';
        const expected = 'duong-dua-ruc-lua-nghin-le-mot-dem-2024-4k-ultra-hd';
        expect(base.normalizeSlug(input)).toBe(expected);

        const allVowels = 'áàảãạ ăắằẳẵặ âấầẩẫậ éèẻẽẹ êếềểễệ íìỉĩị óòỏõọ ôốồổỗộ ơớờởỡợ úùủũụ ưứừửữự ýỳỷỹỵ đ';
        const normalizedVowels = base.normalizeSlug(allVowels);
        expect(normalizedVowels).not.toMatch(/[áàảãạăắằẳẵặâấầẩẫậéèẻẽẹêếềểễệíìỉĩịóòỏõọôốồổỗộơớờởỡợúùủũụưứừửữựýỳỷỹỵđ]/);
        expect(normalizedVowels.includes('d')).toBe(true);
      });

      it('handles unicode diacritic stripping on empty, non-string, or emoji-filled strings', () => {
        expect(base.normalizeSlug('')).toBe('');
        expect(base.normalizeSlug(null)).toBe('');
        expect(base.normalizeSlug(undefined)).toBe('');
        expect(base.normalizeSlug('🎬🔥🍿🌟 VIP Phim')).toBe('vip-phim');
        expect(base.normalizeSlug('   --- multi --- space ---   ')).toBe('----multi-----space----');
      });
    });

    describe('1.3 BaseProvider.extractSeasonEpisode adversarial parsing', () => {
      const base = new BaseProvider({ id: 'base' });

      it('correctly parses compound Stremio IDs with various formats', () => {
        expect(base.extractSeasonEpisode('tt1234567:1:5')).toEqual({ season: 1, episode: 5 });
        expect(base.extractSeasonEpisode('kkphim:cuu-mon:2:12')).toEqual({ season: 2, episode: 12 });
        expect(base.extractSeasonEpisode('vsmov:one-piece:1:1080')).toEqual({ season: 1, episode: 1080 });
      });

      it('correctly parses standard textual season/episode codes', () => {
        expect(base.extractSeasonEpisode('S02E08')).toEqual({ season: 2, episode: 8 });
        expect(base.extractSeasonEpisode('s1e24')).toEqual({ season: 1, episode: 24 });
        expect(base.extractSeasonEpisode('Tập 45')).toEqual({ season: 1, episode: 45 });
        expect(base.extractSeasonEpisode('Ep 100')).toEqual({ season: 1, episode: 100 });
        expect(base.extractSeasonEpisode('tap 7')).toEqual({ season: 1, episode: 7 });
        expect(base.extractSeasonEpisode('15')).toEqual({ season: 1, episode: 15 });
      });

      it('falls back safely to { season: 1, episode: 1 } for corrupt or extreme values', () => {
        expect(base.extractSeasonEpisode('')).toEqual({ season: 1, episode: 1 });
        expect(base.extractSeasonEpisode(null)).toEqual({ season: 1, episode: 1 });
        expect(base.extractSeasonEpisode('random-movie-title')).toEqual({ season: 1, episode: 1 });
        expect(base.extractSeasonEpisode(':::')).toEqual({ season: 1, episode: 1 });
        expect(base.extractSeasonEpisode('invalid:string:nan:abc')).toEqual({ season: 1, episode: 1 });
      });
    });

    describe('1.4 BaseProvider.buildProxyStreamUrl', () => {
      const base = new BaseProvider({ id: 'base' });

      it('returns direct stream URL when proxyBase is empty', () => {
        const streamUrl = 'https://cdn.example.com/hls/master.m3u8';
        expect(base.buildProxyStreamUrl(streamUrl, 'https://ref.com', '')).toBe(streamUrl);
        expect(base.buildProxyStreamUrl('', 'https://ref.com', 'https://proxy.com')).toBe('');
      });

      it('builds base64url encoded proxy URLs with referer, origin, and sub params', () => {
        const streamUrl = 'https://cdn.example.com/stream.m3u8';
        const referer = 'https://player.phimapi.com/';
        const origin = 'https://player.phimapi.com';
        const sub = 'https://cdn.example.com/sub.vtt';
        const proxyBase = 'https://addon.domain.vn';

        const proxyUrl = base.buildProxyStreamUrl(streamUrl, referer, proxyBase, origin, sub);
        expect(proxyUrl).toContain('https://addon.domain.vn/hls/manifest.m3u8?');
        expect(proxyUrl).toContain(`url=${Buffer.from(streamUrl).toString('base64url')}`);
        expect(proxyUrl).toContain(`ref=${Buffer.from(referer).toString('base64url')}`);
        expect(proxyUrl).toContain(`origin=${Buffer.from(origin).toString('base64url')}`);
        expect(proxyUrl).toContain(`sub=${Buffer.from(sub).toString('base64url')}`);
      });
    });
  });

  // =========================================================================
  // 2. CONCURRENCY SIMULATION & ERROR PROPAGATION (All Providers)
  // =========================================================================
  describe('2. High Concurrency Simulation & Error Resilience', () => {

    it('2.1 handles 100 concurrent getCatalog requests across providers under mixed latency', async () => {
      const spyGet = vi.spyOn(axios, 'get');
      spyGet.mockImplementation(async (url) => {
        const delay = Math.floor(Math.random() * 20) + 5; // 5ms - 25ms random jitter
        await new Promise(r => setTimeout(r, delay));

        if (url.includes('phimapi.com')) {
          return {
            data: {
              status: true,
              data: {
                items: [{ slug: 'phim-kk', name: 'KK Movie', year: 2024, type: 'single' }],
                APP_DOMAIN_CDN_IMAGE: 'https://img.kk.com'
              }
            }
          };
        }
        if (url.includes('vsmov.com')) {
          return {
            data: {
              items: [{ slug: 'phim-vsmov', name: 'VSMOV Movie', year: 2024, type: 'single' }]
            }
          };
        }
        if (url.includes('nguonc.com')) {
          return {
            data: {
              items: [{ slug: 'phim-nguonc', name: 'NguonC Movie', year: 2024, total_episodes: 1 }]
            }
          };
        }
        return { data: {} };
      });

      const promises = [];
      for (let i = 0; i < 100; i++) {
        const p1 = kkphimProvider.getCatalog('kkphim-phim-le', { page: (i % 5) + 1 });
        const p2 = vsmovProvider.getCatalog('vsmov-4k', { page: (i % 5) + 1 });
        const p3 = nguoncProvider.getCatalog('nguonc-phim-le', { page: (i % 5) + 1 });
        promises.push(p1, p2, p3);
      }

      const results = await Promise.all(promises);
      expect(results.length).toBe(300);

      // Verify all resolved cleanly with non-empty metas
      for (const res of results) {
        expect(res).toBeDefined();
        expect(Array.isArray(res.metas)).toBe(true);
        expect(res.metas.length).toBeGreaterThan(0);
      }
    });

    it('2.2 withstands 50% chaotic failure injection during concurrent getStreams without crashing', async () => {
      const spyGet = vi.spyOn(axios, 'get');
      let callCount = 0;

      spyGet.mockImplementation(async (url) => {
        callCount++;
        // Inject random HTTP errors on half of requests
        if (callCount % 2 === 0) {
          const errors = [
            { message: 'ETIMEDOUT', response: { status: 408 } },
            { message: 'ECONNRESET', response: { status: 502 } },
            { message: 'Internal Server Error', response: { status: 500 } },
            { message: 'Cloudflare Forbidden', response: { status: 403 } }
          ];
          const err = new Error(errors[callCount % errors.length].message);
          err.response = errors[callCount % errors.length].response;
          throw err;
        }

        // Return successful payload
        if (url.includes('phimapi.com')) {
          return {
            data: {
              status: true,
              movie: { slug: 'test-kk', name: 'Test KK', type: 'single', quality: 'FHD' },
              episodes: [{ server_name: 'VIP Vietsub', server_data: [{ name: 'Full', link_m3u8: 'https://cdn.kk.com/stream.m3u8' }] }]
            }
          };
        }
        if (url.includes('vsmov.com')) {
          return {
            data: {
              movie: { slug: 'test-vsmov', name: 'Test VSMOV', type: 'single', quality: '4K UHD' },
              episodes: [{ server_name: 'VIP 4K', server_data: [{ name: 'Full', link_embed: 'https://streamvsmov.com/video/a1b2c3d4-e5f6-7890-abcd-ef1234567890' }] }]
            }
          };
        }
        return { data: {} };
      });

      const promises = [];
      for (let i = 0; i < 30; i++) {
        promises.push(kkphimProvider.getStreams({ id: 'test-kk', type: 'movie' }));
        promises.push(vsmovProvider.getStreams({ id: 'test-vsmov', type: 'movie' }));
        promises.push(nguoncProvider.getStreams({ id: 'test-nguonc', type: 'movie' }));
      }

      // Must not throw unhandled rejection
      const results = await Promise.allSettled(promises);
      expect(results.length).toBe(90);

      results.forEach((res) => {
        expect(res.status).toBe('fulfilled');
        expect(Array.isArray(res.value)).toBe(true);
      });
    });
  });

  // =========================================================================
  // 3. STREAMC DE-OBFUSCATION RESILIENCE (NguonCProvider)
  // =========================================================================
  describe('3. StreamC De-obfuscation Resilience & Corner Cases', () => {

    it('3.1 successfully de-obfuscates valid Base64 JSON data-obf attribute', async () => {
      const embedPayload = {
        sUb: 'hls/streamc-test/index.m3u8',
        hD: 'hls/streamc-test/1080p.m3u8'
      };
      const b64Data = Buffer.from(JSON.stringify(embedPayload)).toString('base64');
      const mockHtml = `
        <!DOCTYPE html>
        <html>
        <head><title>StreamC Player</title></head>
        <body>
          <div id="player" data-obf="${b64Data}"></div>
        </body>
        </html>
      `;

      vi.spyOn(axios, 'get').mockResolvedValueOnce({ data: mockHtml });

      const extracted = await nguoncProvider.extractStreamC('https://streamc.xyz/embed/abc12345');
      expect(extracted).not.toBeNull();
      expect(extracted.m3u8Url).toBe('https://streamc.xyz/hls/streamc-test/index.m3u8');
      expect(extracted.referer).toBe('https://streamc.xyz/');
      expect(extracted.origin).toBe('https://streamc.xyz');
    });

    it('3.2 falls back gracefully when data-obf contains corrupted / non-JSON Base64', async () => {
      const corruptHtml = `
        <div id="player" data-obf="not_valid_base64_!@#$%"></div>
        <script>var raw = "https://fallback.streamc.xyz/direct/video.m3u8";</script>
      `;

      vi.spyOn(axios, 'get').mockResolvedValueOnce({ data: corruptHtml });

      const extracted = await nguoncProvider.extractStreamC('https://streamc.xyz/embed/corrupt');
      expect(extracted).not.toBeNull();
      expect(extracted.m3u8Url).toBe('https://fallback.streamc.xyz/direct/video.m3u8');
    });

    it('3.3 handles Dean Edwards packed JavaScript de-obfuscation', async () => {
      const packedCode = `
        eval(function(p,a,c,k,e,d){e=function(c){return c.toString(36)};if(!''.replace(/^/,String)){while(c--){d[c.toString(a)]=k[c]||c.toString(a)}k=[function(e){return d[e]}];e=function(){return'\\\\w+'};c=1};while(c--){if(k[c]){p=p.replace(new RegExp('\\\\b'+e(c)+'\\\\b','g'),k[c])}}return p}('var 0="eyJoIjoiYXV0aF9zdHJlYW0ubTN1OCJ9";',2,2,'sourceUrl|eyJoIjoiYXV0aF9zdHJlYW0ubTN1OCJ9'.split('|'),0,{}))
      `;
      const htmlWithPacked = `
        <html>
        <script type="text/javascript">
          ${packedCode}
        </script>
        </html>
      `;

      vi.spyOn(axios, 'get').mockResolvedValueOnce({ data: htmlWithPacked });

      const extracted = await nguoncProvider.extractStreamC('https://streamc.xyz/embed/packed123');
      expect(extracted).not.toBeNull();
      expect(extracted.m3u8Url).toContain('eyJoIjoi');
    });

    it('3.4 returns null safely when HTML has zero video links or non-string response', async () => {
      vi.spyOn(axios, 'get').mockResolvedValueOnce({ data: '<html><body>No video here</body></html>' });
      const extracted = await nguoncProvider.extractStreamC('https://streamc.xyz/embed/empty');
      expect(extracted).toBeNull();

      vi.spyOn(axios, 'get').mockResolvedValueOnce({ data: Buffer.from([0x00, 0x01, 0x02]) });
      const binaryResult = await nguoncProvider.extractStreamC('https://streamc.xyz/embed/binary');
      expect(binaryResult).toBeNull();
    });

    it('3.5 NguonC getStreams provides proxy fallback when extractStreamC returns null', async () => {
      vi.spyOn(nguoncProvider, 'getDetail').mockResolvedValueOnce({
        movie: {
          slug: 'test-fallback-nguonc',
          name: 'NguonC Fallback Movie',
          total_episodes: 1,
          current_episode: 'Full',
          episodes: [
            {
              server_name: 'VIP 1',
              items: [{ name: 'Full', slug: 'full', embed: 'https://streamc.xyz/embed/failed-deobf' }]
            }
          ]
        }
      });

      vi.spyOn(nguoncProvider, 'extractStreamC').mockResolvedValueOnce(null);

      const streams = await nguoncProvider.getStreams({
        id: 'test-fallback-nguonc',
        type: 'movie',
        proxyBase: 'https://my-proxy.com'
      });

      expect(streams.length).toBe(1);
      expect(streams[0].url).toContain('https://my-proxy.com/hls/manifest.m3u8');
      const b64Embed = Buffer.from('https://streamc.xyz/embed/failed-deobf').toString('base64url');
      expect(streams[0].url).toContain(`url=${b64Embed}`);
    });
  });

  // =========================================================================
  // 4. VSMOV 4K UUID EXTRACTION & AUDIO SEPARATION (VSMOVProvider)
  // =========================================================================
  describe('4. VSMOV UUID Extraction & Multi-Audio Track Separation', () => {

    describe('4.1 deriveMasterM3u8 extraction under diverse patterns', () => {
      it('correctly extracts UUID and derives 4K master.m3u8 from standard embed URLs', () => {
        const standardUrl = 'https://streamvsmov.com/video/a1b2c3d4-e5f6-7890-abcd-ef1234567890';
        expect(vsmovProvider.deriveMasterM3u8(standardUrl)).toBe(
          'https://streamvsmov.com/stream/a1b2c3d4-e5f6-7890-abcd-ef1234567890/master.m3u8'
        );
      });

      it('handles uppercase UUIDs, query strings, and hashes in embed URLs', () => {
        const upperUrl = 'https://embed.vsmov.com/video/A1B2C3D4-E5F6-7890-ABCD-EF1234567890?autostart=true#t=10';
        expect(vsmovProvider.deriveMasterM3u8(upperUrl)).toBe(
          'https://embed.vsmov.com/stream/A1B2C3D4-E5F6-7890-ABCD-EF1234567890/master.m3u8'
        );
      });

      it('preserves direct .m3u8 URLs as-is', () => {
        const directM3u8 = 'https://cdn.vsmov.com/4k/playlist.m3u8';
        expect(vsmovProvider.deriveMasterM3u8(directM3u8)).toBe(directM3u8);
      });

      it('returns null on invalid / non-matching embed URLs', () => {
        expect(vsmovProvider.deriveMasterM3u8('')).toBeNull();
        expect(vsmovProvider.deriveMasterM3u8(null)).toBeNull();
        expect(vsmovProvider.deriveMasterM3u8('https://streamvsmov.com/play/not-a-uuid')).toBeNull();
      });
    });

    describe('4.2 Subtitle track extraction resilience', () => {
      it('extracts and resolves relative WebVTT subtitle URLs when playerOptions is valid JSON', async () => {
        const embedHtml = `
          <script>
            var playerOptions = {"file": "/stream/123/master.m3u8", "subtitles": [{"file": "/subs/vi.vtt", "label": "Tiếng Việt", "code": "vie", "url": "/subs/vi.vtt"}, {"file": "https://subcdn.com/en.vtt", "label": "English", "code": "eng", "url": "https://subcdn.com/en.vtt"}]};
          </script>
        `;

        vi.spyOn(axios, 'get').mockResolvedValueOnce({ data: embedHtml });

        const subs = await vsmovProvider.extractSubtitles('https://embed.vsmov.com/video/uuid-123');
        expect(subs.length).toBe(2);
        expect(subs[0]).toEqual({
          id: 'vie',
          lang: 'Tiếng Việt (VSMOV VIP)',
          url: 'https://embed.vsmov.com/subs/vi.vtt'
        });
        expect(subs[1]).toEqual({
          id: 'eng',
          lang: 'Phụ Đề',
          url: 'https://subcdn.com/en.vtt'
        });
      });

      it('handles corrupt JSON in playerOptions without crashing', async () => {
        const corruptHtml = `
          <script>
            var playerOptions = { unclosed: json, invalid: };
          </script>
        `;
        vi.spyOn(axios, 'get').mockResolvedValueOnce({ data: corruptHtml });
        const subs = await vsmovProvider.extractSubtitles('https://embed.vsmov.com/video/corrupt');
        expect(subs).toEqual([]);
      });
    });

    describe('4.3 Audio track separation & multi-server parsing in getStreams', () => {
      it('correctly classifies Vietsub, Thuyết Minh, and Lồng Tiếng audio streams with distinct bingeGroups', async () => {
        vi.spyOn(vsmovProvider, 'getDetail').mockResolvedValueOnce({
          movie: {
            slug: 'oppenheimer-2023',
            name: 'Oppenheimer',
            type: 'single',
            quality: '4K UHD'
          },
          episodes: [
            {
              server_name: 'VIP 1 • Vietsub 4K',
              server_data: [{ name: 'Full', link_embed: 'https://streamvsmov.com/video/11111111-1111-1111-1111-111111111111' }]
            },
            {
              server_name: 'VIP 2 • Thuyết Minh 4K',
              server_data: [{ name: 'Full', link_embed: 'https://streamvsmov.com/video/22222222-2222-2222-2222-222222222222' }]
            },
            {
              server_name: 'VIP 3 • Lồng Tiếng 4K',
              server_data: [{ name: 'Full', link_embed: 'https://streamvsmov.com/video/33333333-3333-3333-3333-333333333333' }]
            }
          ]
        });

        vi.spyOn(vsmovProvider, 'extractSubtitles').mockResolvedValue([]);

        const streams = await vsmovProvider.getStreams({
          id: 'vsmov_oppenheimer-2023',
          type: 'movie'
        });

        expect(streams.length).toBe(3);

        // Stream 1: Vietsub
        expect(streams[0].title).toContain('Vietsub');
        expect(streams[0].behaviorHints.bingeGroup).toBe('vsmov-4k-vietsub-movie');
        expect(streams[0].url).toContain('/11111111-1111-1111-1111-111111111111/master.m3u8');

        // Stream 2: Thuyết Minh
        expect(streams[1].title).toContain('Thuyết Minh');
        expect(streams[1].behaviorHints.bingeGroup).toBe('vsmov-4k-thuyetminh-movie');
        expect(streams[1].url).toContain('/22222222-2222-2222-2222-222222222222/master.m3u8');

        // Stream 3: Lồng Tiếng
        expect(streams[2].title).toContain('Lồng Tiếng');
        expect(streams[2].behaviorHints.bingeGroup).toBe('vsmov-4k-longtieng-movie');
        expect(streams[2].url).toContain('/33333333-3333-3333-3333-333333333333/master.m3u8');
      });
    });
  });

  // =========================================================================
  // 5. KKPHIM AUDIO CLASSIFICATION & SERIES RESOLUTION
  // =========================================================================
  describe('5. KKPhim Stream Resolution & Episode Matching', () => {

    it('5.1 correctly resolves episode numbers for multi-server series', async () => {
      vi.spyOn(kkphimProvider, 'request').mockResolvedValueOnce({
        status: true,
        movie: {
          slug: 'queen-of-tears',
          name: 'Nữ Hoàng Nước Mắt',
          type: 'series',
          quality: 'FHD 1080p'
        },
        episodes: [
          {
            server_name: 'Vietsub #1',
            server_data: [
              { name: 'Tập 1', link_m3u8: 'https://cdn.kk.com/ep1.m3u8' },
              { name: 'Tập 2', link_m3u8: 'https://cdn.kk.com/ep2.m3u8' }
            ]
          },
          {
            server_name: 'Thuyết Minh #2',
            server_data: [
              { name: 'Tập 1', link_m3u8: 'https://cdn.kk.com/tm-ep1.m3u8' },
              { name: 'Tập 2', link_m3u8: 'https://cdn.kk.com/tm-ep2.m3u8' }
            ]
          }
        ]
      });

      const streams = await kkphimProvider.getStreams({
        id: 'kkphim:queen-of-tears:1:2',
        type: 'series',
        season: 1,
        episode: 2
      });

      expect(streams.length).toBe(2);
      expect(streams[0].title).toContain('Tập 2');
      expect(streams[0].title).toContain('Vietsub');
      expect(streams[0].url).toContain('https://cdn.kk.com/ep2.m3u8');

      expect(streams[1].title).toContain('Tập 2');
      expect(streams[1].title).toContain('Thuyết Minh');
      expect(streams[1].url).toContain('https://cdn.kk.com/tm-ep2.m3u8');
    });

    it('5.2 extracts stream from link_embed when link_m3u8 is absent', async () => {
      vi.spyOn(kkphimProvider, 'request').mockResolvedValueOnce({
        status: true,
        movie: {
          slug: 'movie-embed-only',
          name: 'Movie Embed Only',
          type: 'single',
          quality: '1080p'
        },
        episodes: [
          {
            server_name: 'Server Embed',
            server_data: [
              { name: 'Full', link_embed: 'https://player.phimapi.com/player/?url=https%3A%2F%2Fcdn.example.com%2Fdirect.m3u8' }
            ]
          }
        ]
      });

      const streams = await kkphimProvider.getStreams({
        id: 'movie-embed-only',
        type: 'movie'
      });

      expect(streams.length).toBe(1);
      expect(streams[0].url).toBe('https://cdn.example.com/direct.m3u8');
    });
  });

  // =========================================================================
  // 6. ROUTE INTEGRATION & ADVERSARIAL DISPATCH
  // =========================================================================
  describe('6. Catalog & Meta Route Hardening', () => {

    it('6.1 handleCatalog returns HTTP 200 with { metas: [] } when provider crashes violently', async () => {
      vi.spyOn(kkphimProvider, 'getCatalog').mockRejectedValueOnce(new Error('Fatal segmentation fault in upstream parser'));

      const req = {
        params: { id: 'kkphim-phim-le', type: 'movie' },
        query: {},
        headers: {}
      };
      let jsonPayload = null;
      const res = {
        setHeader: vi.fn(),
        json: (data) => { jsonPayload = data; }
      };

      await handleCatalog(req, res);
      expect(jsonPayload).toEqual({ metas: [] });
    });

    it('6.2 verifies resolveRawSlugMeta and handleMeta return null/empty meta when slug is not found', async () => {
      vi.spyOn(vsmovProvider, 'request').mockResolvedValueOnce(null);
      vi.spyOn(kkphimProvider, 'request').mockResolvedValueOnce(null);
      vi.spyOn(nguoncProvider, 'request').mockResolvedValueOnce(null);

      const resMeta = await resolveRawSlugMeta('movie', 'nonexistent-slug');
      expect(resMeta).toBeNull();

      const req = {
        params: { id: 'nonexistent-slug.json', type: 'movie' },
        query: {},
        headers: {}
      };
      let jsonPayload = null;
      const res = {
        setHeader: vi.fn(),
        json: (data) => { jsonPayload = data; }
      };

      await handleMeta(req, res);
      expect(jsonPayload).toEqual({ meta: null });
    });

    it('6.3 parseConfig handles extreme garbage and corrupted tokens gracefully', () => {
      expect(parseConfig('')).toEqual(expect.objectContaining({ providers: expect.any(Array) }));
      expect(parseConfig(null)).toEqual(expect.objectContaining({ providers: expect.any(Array) }));
      expect(parseConfig('!@#$%^&*()')).toEqual(expect.objectContaining({ providers: expect.any(Array) }));
      expect(parseConfig('{}')).toEqual(expect.objectContaining({ providers: expect.any(Array) }));
      expect(parseConfig('999999999')).toEqual(expect.objectContaining({ providers: expect.any(Array) }));
    });
  });
});
