'use strict';

/**
 * ============================================================
 *  VIP Movies Addon — test/mapper.test.js
 *  Unit & Regression Tests for Mapper & Embed Extraction Engine
 * ============================================================
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
const axios = require('axios');
const mapper = require('../src/mapper');

const {
  makeId,
  extractSlug,
  detectType,
  findCategoryGroup,
  extractGenres,
  extractYear,
  extractCountry,
  cleanTitle,
  toSlug,
  extractSeasonEpisode,
  formatEpisodeTitle,
  mapCatalogItem,
  mapDetailMeta,
  buildVideos,
  buildStreams,
  scoreSimilarity,
  unpackDeanEdwards,
  isM3u8Url,
  normalizeServerName,
  encodeBase64,
  decodeBase64,
  resolveParamUrl,
  extractM3u8FromEmbed,
  parseStreamId,
} = mapper;

describe('Mapper & Stream Extraction Engine', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ─────────────────────────────────────────────────────────────
  // 1. ID & Slug Helpers
  // ─────────────────────────────────────────────────────────────
  describe('1. ID & Slug Helpers', () => {
    it('makeId and extractSlug roundtrip correctly', () => {
      expect(makeId('cuu-mon')).toBe('nguonc:cuu-mon');
      expect(extractSlug('nguonc:cuu-mon')).toBe('cuu-mon');
      expect(extractSlug('cuu-mon')).toBe('cuu-mon');
    });

    it('parseStreamId parses simple and complex stream identifiers', () => {
      expect(parseStreamId('nguonc:cuu-mon:0:tap-1')).toEqual({
        slug: 'cuu-mon',
        serverIdx: 0,
        epName: 'tap-1',
      });
      expect(parseStreamId('nguonc:cuu-mon:2:T%E1%BA%ADp%201')).toEqual({
        slug: 'cuu-mon',
        serverIdx: 2,
        epName: 'Tập 1',
      });
      expect(parseStreamId('cuu-mon')).toEqual({
        slug: 'cuu-mon',
        serverIdx: 0,
        epName: null,
      });
    });

    it('toSlug normalizes Vietnamese accented text correctly', () => {
      expect(toSlug('Cửu Môn Trấn')).toBe('cuu-mon-tran');
      expect(toSlug('Đấu Phá Thương Khung (Phần 5)')).toBe('dau-pha-thuong-khung-phan-5');
      expect(toSlug('')).toBe('');
      expect(toSlug(null)).toBe('');
    });

    it('cleanTitle strips noise and brackets', () => {
      expect(cleanTitle('[Vietsub] Inception (2010) [1080p]')).toBe('Inception');
      expect(cleanTitle('Harry Potter: Phần 1 (2001)')).toBe('Harry Potter Phần 1');
      expect(cleanTitle('')).toBe('');
    });
  });

  // ─────────────────────────────────────────────────────────────
  // 2. Metadata & Classification Helpers
  // ─────────────────────────────────────────────────────────────
  describe('2. Metadata & Classification Helpers', () => {
    it('detectType classifies movies and series accurately', () => {
      expect(detectType({ total_episodes: 1, current_episode: 'Full' })).toBe('movie');
      expect(detectType({ total_episodes: 16, current_episode: 'Tập 5' })).toBe('series');
      expect(detectType({
        category: {
          1: { group: { name: 'Định dạng' }, list: [{ name: 'Phim lẻ' }] },
        },
      })).toBe('movie');
      expect(detectType({
        category: {
          1: { group: { name: 'Định dạng' }, list: [{ name: 'Phim bộ' }] },
        },
      })).toBe('series');
    });

    it('extractGenres extracts genre list from categories', () => {
      const cat = {
        1: { group: { name: 'Thể loại' }, list: [{ name: 'Hành Động' }, { name: 'Phiêu Lưu' }] },
      };
      expect(extractGenres(cat)).toEqual(['Hành Động', 'Phiêu Lưu']);
      expect(extractGenres(null)).toEqual([]);
    });

    it('extractYear extracts 4-digit years from numbers, strings, and objects', () => {
      expect(extractYear(2024)).toBe(2024);
      expect(extractYear('2023')).toBe(2023);
      expect(extractYear('Phim Hay (2021)')).toBe(2021);
      expect(extractYear({ year: 2020 })).toBe(2020);
      expect(extractYear({ name: '2019' })).toBe(2019);
      expect(extractYear(1700)).toBeNull();
      expect(extractYear(null)).toBeNull();
    });

    it('extractCountry extracts country name', () => {
      const cat = {
        1: { group: { name: 'Quốc gia' }, list: [{ name: 'Hàn Quốc' }] },
      };
      expect(extractCountry(cat)).toBe('Hàn Quốc');
      expect(extractCountry(null)).toBeNull();
    });

    it('extractSeasonEpisode extracts season and episode accurately', () => {
      expect(extractSeasonEpisode('S02E05')).toEqual({ season: 2, episode: 5 });
      expect(extractSeasonEpisode('Season 3 Episode 12')).toEqual({ season: 3, episode: 12 });
      expect(extractSeasonEpisode('Tập 8')).toEqual({ season: 1, episode: 8 });
      expect(extractSeasonEpisode('Ep 10')).toEqual({ season: 1, episode: 10 });
      expect(extractSeasonEpisode('Full')).toEqual({ season: null, episode: null });
    });

    it('formatEpisodeTitle formats episode titles cleanly', () => {
      expect(formatEpisodeTitle('1')).toBe('Tập 1');
      expect(formatEpisodeTitle('FULL')).toBe('📽️ Full Movie');
      expect(formatEpisodeTitle('Special')).toBe('Tập Special');
      expect(formatEpisodeTitle('')).toBe('Tập không xác định');
    });

    it('scoreSimilarity calculates string bigram similarity coefficient', () => {
      expect(scoreSimilarity('Inception', 'Inception')).toBe(1);
      expect(scoreSimilarity('Harry Potter', 'Harry Potter 2')).toBeGreaterThan(0.7);
      expect(scoreSimilarity('Iron Man', 'Titanic')).toBeLessThan(0.3);
      expect(scoreSimilarity('', 'Test')).toBe(0);
    });

    it('isM3u8Url and normalizeServerName work correctly', () => {
      expect(isM3u8Url('https://cdn.com/stream/master.m3u8')).toBe(true);
      expect(isM3u8Url('https://cdn.com/hls/playlist')).toBe(true);
      expect(isM3u8Url('https://cdn.com/embed.php?hash=123')).toBe(false);

      expect(normalizeServerName('Server #1 (VIP)')).toBe('Server 1 (VIP)');
      expect(normalizeServerName('')).toBe('Server 1');
    });
  });

  // ─────────────────────────────────────────────────────────────
  // 3. Stremio Meta & Video Builders
  // ─────────────────────────────────────────────────────────────
  describe('3. Stremio Meta & Video Builders', () => {
    it('mapCatalogItem maps film item to Stremio meta preview', () => {
      const item = {
        name: 'Cửu Môn Trấn',
        slug: 'cuu-mon-tran',
        thumb_url: 'https://img.com/thumb.jpg',
        poster_url: 'https://img.com/poster.jpg',
        quality: 'FHD',
        language: 'Vietsub',
        current_episode: 'Tập 12',
        total_episodes: 16,
      };
      const mapped = mapCatalogItem(item);
      expect(mapped.id).toBe('nguonc:cuu-mon-tran');
      expect(mapped.type).toBe('series');
      expect(mapped.name).toBe('Cửu Môn Trấn');
      expect(mapped.poster).toBe('https://img.com/thumb.jpg');
      expect(mapped.releaseInfo).toBe('FHD · Vietsub · Tập 12');
    });

    it('mapDetailMeta maps full movie details to Stremio meta object', () => {
      const movie = {
        name: 'Inception',
        slug: 'inception',
        thumb_url: 'https://img.com/thumb.jpg',
        description: 'A mind-bending thriller',
        director: 'Christopher Nolan',
        casts: 'Leonardo DiCaprio, Joseph Gordon-Levitt',
        time: '148 phút',
        category: {
          1: { group: { name: 'Thể loại' }, list: [{ name: 'Khoa Học Viễn Tưởng' }] },
          2: { group: { name: 'Năm' }, list: [{ name: '2010' }] },
          3: { group: { name: 'Quốc gia' }, list: [{ name: 'Mỹ' }] },
        },
        total_episodes: 1,
        current_episode: 'Full',
      };
      const meta = mapDetailMeta(movie);
      expect(meta.id).toBe('nguonc:inception');
      expect(meta.type).toBe('movie');
      expect(meta.director).toEqual(['Christopher Nolan']);
      expect(meta.cast).toEqual(['Leonardo DiCaprio', 'Joseph Gordon-Levitt']);
      expect(meta.genres).toEqual(['Khoa Học Viễn Tưởng']);
      expect(meta.year).toBe(2010);
      expect(meta.country).toBe('Mỹ');
    });

    it('buildVideos builds series episode list with IDs', () => {
      const servers = [
        {
          server_name: 'VIP Vietsub',
          items: [
            { name: '1', slug: 'tap-1' },
            { name: '2', slug: 'tap-2' },
          ],
        },
      ];
      const videos = buildVideos('series-a', servers);
      expect(videos).toHaveLength(2);
      expect(videos[0].id).toBe('nguonc:series-a:0:1');
      expect(videos[0].title).toBe('Tập 1');
      expect(videos[1].id).toBe('nguonc:series-a:0:2');
      expect(videos[1].title).toBe('Tập 2');
    });

    it('buildStreams builds streams with proxyBase and fallback embed URL', () => {
      const movie = {
        slug: 'test-movie',
        episodes: [
          {
            server_name: 'VIP 1 #Vietsub',
            items: [{ name: '1', slug: 'tap-1', embed: 'https://embed.streamc.xyz/embed.php?hash=abc' }],
          },
        ],
      };
      const streams = buildStreams(movie, '1', 'https://proxy.example.com');
      expect(streams).toHaveLength(2);
      expect(streams[0].name).toBe('NguonC 🎬');
      expect(streams[0].url).toContain('https://proxy.example.com/hls/extract?embed=');
      expect(streams[1].url).toBe('https://embed.streamc.xyz/embed.php?hash=abc');
      expect(streams[1].externalUrl).toBe('https://embed.streamc.xyz/embed.php?hash=abc');
    });
  });

  // ─────────────────────────────────────────────────────────────
  // 4. Base64 & Parameter Resolution
  // ─────────────────────────────────────────────────────────────
  describe('4. Base64 & Parameter Resolution', () => {
    it('encodeBase64 and decodeBase64 handle UTF-8 and base64url strings', () => {
      const str = 'https://embed14.streamc.xyz/stream/123/master.m3u8?t=456';
      const encoded = encodeBase64(str);
      expect(encoded).not.toContain('+');
      expect(encoded).not.toContain('/');
      expect(decodeBase64(encoded)).toBe(str);
    });

    it('decodeBase64 handles standard base64 and invalid inputs safely', () => {
      const stdB64 = Buffer.from('Hello World').toString('base64');
      expect(decodeBase64(stdB64)).toBe('Hello World');
      expect(decodeBase64('')).toBe('');
      expect(decodeBase64(null)).toBe('');
    });

    it('resolveParamUrl handles plain URLs, base64, base64url, and data URIs', () => {
      const direct = 'https://streamc.xyz/live.m3u8';
      expect(resolveParamUrl(direct)).toBe(direct);

      const b64 = Buffer.from('https://streamc.xyz/live.m3u8').toString('base64url');
      expect(resolveParamUrl(b64)).toBe(direct);

      const dataUri = 'data:text/vtt;base64,V0VCVlRUCg==';
      expect(resolveParamUrl(dataUri)).toBe(dataUri);

      expect(resolveParamUrl('')).toBeNull();
      expect(resolveParamUrl(null)).toBeNull();
    });
  });

  // ─────────────────────────────────────────────────────────────
  // 5. Dean Edwards P.A.C.K.E.R Unpacker
  // ─────────────────────────────────────────────────────────────
  describe('5. Dean Edwards P.A.C.K.E.R Unpacker', () => {
    it('unpacks standard Dean Edwards packed script correctly', () => {
      // Packed script: eval(function(p,a,c,k,e,d){...}('0 1="2";',3,3,'var|source|https://stream.m3u8'.split('|')))
      const packed = `eval(function(p,a,c,k,e,d){while(c--)if(k[c])p=p.replace(new RegExp('\\\\b'+c.toString(a)+'\\\\b','g'),k[c]);return p}('0 1="2";',3,3,'var|source|https://stream.m3u8'.split('|'),0,{}))`;
      const unpacked = unpackDeanEdwards(packed);
      expect(unpacked).toContain('var source="https://stream.m3u8";');
    });

    it('handles base62 / alphanumeric word replacement in packer', () => {
      const packed = `eval(function(p,a,c,k,e,d){e=function(c){return(c<a?'':e(parseInt(c/a)))+((c=c%a)>35?String.fromCharCode(c+29):c.toString(36))};if(!''.replace(/^/,String)){while(c--)d[e(c)]=k[c]||e(c);k=[function(e){return d[e]}];e=function(){return'\\\\w+'};c=1};while(c--)if(k[c])p=p.replace(new RegExp('\\\\b'+e(c)+'\\\\b','g'),k[c]);return p}('1 0="2";',3,3,'videoUrl|const|https://cdn.xyz/master.m3u8'.split('|'),0,{}))`;
      const unpacked = unpackDeanEdwards(packed);
      expect(unpacked).toContain('const videoUrl="https://cdn.xyz/master.m3u8";');
    });

    it('returns null safely for non-packed or malformed scripts', () => {
      expect(unpackDeanEdwards('console.log("hello world");')).toBeNull();
      expect(unpackDeanEdwards(null)).toBeNull();
      expect(unpackDeanEdwards('')).toBeNull();
      expect(unpackDeanEdwards('eval(function(p,a,c,k,e,d){...}(malformed))')).toBeNull();
    });
  });

  // ─────────────────────────────────────────────────────────────
  // 6. extractM3u8FromEmbed (StreamC, data-obf, Regexes, Errors)
  // ─────────────────────────────────────────────────────────────
  describe('6. extractM3u8FromEmbed: StreamC data-obf, Fallbacks & Error Recovery', () => {
    it('returns direct .m3u8 URL immediately without making HTTP request', async () => {
      const direct = 'https://cdn.streamc.xyz/stream/123/master.m3u8';
      const getSpy = vi.spyOn(axios, 'get');
      const result = await extractM3u8FromEmbed(direct);
      expect(result).toEqual({
        m3u8Url: direct,
        embedHost: 'https://cdn.streamc.xyz',
      });
      expect(getSpy).not.toHaveBeenCalled();
    });

    it('extracts M3U8 from StreamC data-obf Base64 JSON payload (standard format)', async () => {
      const embedUrl = 'https://embed14.streamc.xyz/embed.php?hash=8ee47a1a5a6a4a055ace332760ab1225';
      const innerSubPayload = Buffer.from(
        JSON.stringify({ h: '8ee47a1a5a6a4a055ace332760ab1225', t: 'token123' })
      ).toString('base64');
      const outerPayload = Buffer.from(
        JSON.stringify({ sUb: innerSubPayload, hD: '8ee47a1a5a6a4a055ace332760ab1225' })
      ).toString('base64');

      const mockHtml = `
        <!DOCTYPE html>
        <html>
        <head><title>StreamC Player</title></head>
        <body>
          <div id="player" data-obf="${outerPayload}"></div>
        </body>
        </html>
      `;

      vi.spyOn(axios, 'get').mockResolvedValueOnce({
        data: mockHtml,
        status: 200,
      });

      const result = await extractM3u8FromEmbed(embedUrl);
      expect(result).toBeDefined();
      expect(result.embedHost).toBe('https://embed14.streamc.xyz');
      expect(result.m3u8Url).toBe(`https://embed14.streamc.xyz/${innerSubPayload}`);
    });

    it('extracts M3U8 from data-obf with absolute URL in sUb or alternative keys', async () => {
      const embedUrl = 'https://embed15.streamc.xyz/embed.php?hash=xyz789';
      const outerPayload = Buffer.from(
        JSON.stringify({ sUb: 'https://cdn.streamc.xyz/streams/xyz789/master.m3u8' })
      ).toString('base64');

      const mockHtml = `<div id="player" data-obf='${outerPayload}'></div>`;
      vi.spyOn(axios, 'get').mockResolvedValueOnce({ data: mockHtml, status: 200 });

      const result = await extractM3u8FromEmbed(embedUrl);
      expect(result.m3u8Url).toBe('https://cdn.streamc.xyz/streams/xyz789/master.m3u8');
    });

    it('extracts M3U8 from data-obf with hash / hD fallback when sUb is omitted', async () => {
      const embedUrl = 'https://embed16.streamc.xyz/embed.php?hash=hash999';
      const outerPayload = Buffer.from(JSON.stringify({ hD: 'hash999' })).toString('base64');
      const mockHtml = `<div id="player" data-obf="${outerPayload}"></div>`;
      vi.spyOn(axios, 'get').mockResolvedValueOnce({ data: mockHtml, status: 200 });

      const result = await extractM3u8FromEmbed(embedUrl);
      expect(result.m3u8Url).toBe('https://embed16.streamc.xyz/stream/hash999/master.m3u8');
    });

    it('extracts M3U8 from Dean Edwards packed script in embed HTML', async () => {
      const embedUrl = 'https://player.custom-embed.com/play/123';
      const packedScript = `eval(function(p,a,c,k,e,d){while(c--)if(k[c])p=p.replace(new RegExp('\\\\b'+c.toString(a)+'\\\\b','g'),k[c]);return p}('0 1="2";',3,3,'var|file|https://cdn.stream.com/live/index.m3u8'.split('|'),0,{}))`;
      const mockHtml = `<html><body><script>${packedScript}</script></body></html>`;

      vi.spyOn(axios, 'get').mockResolvedValueOnce({ data: mockHtml, status: 200 });

      const result = await extractM3u8FromEmbed(embedUrl);
      expect(result).toBeDefined();
      expect(result.m3u8Url).toBe('https://cdn.stream.com/live/index.m3u8');
    });

    it('extracts M3U8 using fallback regex patterns (baseUrl + videoHash)', async () => {
      const embedUrl = 'https://embed.streamc.xyz/embed.php?id=test';
      const mockHtml = `
        <script>
          const baseUrl = "https://cdn.streamc.xyz";
          const videoHash = "vhash_alpha_beta";
        </script>
      `;
      vi.spyOn(axios, 'get').mockResolvedValueOnce({ data: mockHtml, status: 200 });

      const result = await extractM3u8FromEmbed(embedUrl);
      expect(result.m3u8Url).toBe('https://cdn.streamc.xyz/stream/vhash_alpha_beta/master.m3u8');
    });

    it('extracts M3U8 using fallback regex (file / source / url parameters with escaped slashes)', async () => {
      const embedUrl = 'https://embed.streamc.xyz/embed.php?id=test2';
      const mockHtml = `<script>var playerConfig = { "file": "https:\\/\\/cdn.node.xyz\\/hls\\/master.m3u8" };</script>`;
      vi.spyOn(axios, 'get').mockResolvedValueOnce({ data: mockHtml, status: 200 });

      const result = await extractM3u8FromEmbed(embedUrl);
      expect(result.m3u8Url).toBe('https://cdn.node.xyz/hls/master.m3u8');
    });

    it('handles network errors, HTTP 404/500, and empty HTML gracefully without throwing', async () => {
      vi.spyOn(axios, 'get').mockRejectedValueOnce(new Error('Network Timeout'));
      const res1 = await extractM3u8FromEmbed('https://embed.error.com');
      expect(res1).toBeNull();

      vi.spyOn(axios, 'get').mockResolvedValueOnce({ data: '', status: 200 });
      const res2 = await extractM3u8FromEmbed('https://embed.empty.com');
      expect(res2).toBeNull();

      expect(await extractM3u8FromEmbed(null)).toBeNull();
      expect(await extractM3u8FromEmbed('')).toBeNull();
    });
  });
});
