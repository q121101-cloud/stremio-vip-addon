'use strict';

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
const axios = require('axios');
const { Readable } = require('stream');

// Target module under test
const {
  router,
  handleManifest,
  handleSegment,
  handleKey,
  handleSub,
  rewriteM3U8,
  rewriteManifest,
  rewriteM3u8Content,
  resolveUrl,
  decodeParam,
  decodeUrlParam,
  decodeB64,
  decodeBase64Url,
  encodeParam,
  encodeUrlParam,
  encodeB64,
  encodeBase64Url,
  buildProxyUrl,
  getRefererHeaders,
  resolveUpstreamHeaders,
  getSpoofedHeaders,
  handleRangeRequest,
  extractM3u8FromHtml,
  unpackDeanEdwards,
  validateTargetUrl,
  isPrivateHost
} = require('../src/routes/hls');

describe('Adversarial & Empirical Stress Test Suite (Milestone M2 HLS Proxy)', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // =========================================================================
  // 1. MALFORMED & FUZZED M3U8 MANIFEST REWRITING
  // =========================================================================
  describe('1. Malformed & Fuzzed M3U8 Manifest Rewriting', () => {
    const proxyBase = 'https://addon.domain.com';
    const baseUrl = 'https://s1.phim1280.tv/2024/film/master.m3u8';
    const ref = 'https://player.phimapi.com/';
    const origin = 'https://player.phimapi.com';

    it('1.1 handles empty, non-string, whitespace-only, and single-tag manifests without crashing', () => {
      expect(rewriteM3U8('', baseUrl, proxyBase)).toBe('');
      expect(rewriteM3U8(null, baseUrl, proxyBase)).toBe('');
      expect(rewriteM3U8(undefined, baseUrl, proxyBase)).toBe('');
      expect(rewriteM3U8(12345, baseUrl, proxyBase)).toBe('');
      expect(rewriteM3U8({}, baseUrl, proxyBase)).toBe('');
      expect(rewriteM3U8('   \n\n\r\n   ', baseUrl, proxyBase)).toBe('\n\n\n');
      expect(rewriteM3U8('#EXTM3U', baseUrl, proxyBase)).toBe('#EXTM3U');
    });

    it('1.2 handles massive 50,000-line manifests rapidly without ReDoS or memory blowout', () => {
      const segmentCount = 25000;
      const lines = ['#EXTM3U', '#EXT-X-VERSION:3', '#EXT-X-TARGETDURATION:10'];
      for (let i = 0; i < segmentCount; i++) {
        lines.push(`#EXTINF:10.0,`);
        lines.push(`segment_${i}.ts?token=auth_${i}`);
      }
      lines.push('#EXT-X-ENDLIST');
      const largeManifest = lines.join('\n');

      const start = Date.now();
      const rewritten = rewriteM3U8(largeManifest, baseUrl, proxyBase, ref, origin);
      const duration = Date.now() - start;

      expect(duration).toBeLessThan(1000); // Must rewrite 25k segments in under 1 second
      expect(rewritten).toContain(`${proxyBase}/hls/segment.ts?url=`);
      const linesOut = rewritten.split('\n');
      const lastSegLine = linesOut[linesOut.length - 2];
      const match = lastSegLine.match(/url=([^&]+)/);
      expect(match).toBeTruthy();
      expect(decodeParam(match[1])).toContain('segment_24999.ts');
      expect(rewritten.endsWith('#EXT-X-ENDLIST')).toBe(true);
    });

    it('1.3 handles lines with 20,000 characters and nested query strings safely', () => {
      const longQuery = 'a'.repeat(20000);
      const longManifest = `#EXTM3U\n#EXTINF:10.0,\nseg001.ts?payload=${longQuery}\n#EXT-X-ENDLIST`;

      const rewritten = rewriteM3U8(longManifest, baseUrl, proxyBase, ref, origin);
      expect(rewritten).toContain(`${proxyBase}/hls/segment.ts?url=`);
      const match = rewritten.match(/url=([^&\n]+)/);
      expect(match).toBeTruthy();
      const decoded = decodeParam(match[1]);
      expect(decoded).toContain(longQuery);
    });

    it('1.4 preserves miscellaneous HLS tags, comments, and discontinuity markers untouched', () => {
      const fuzzedManifest = `#EXTM3U
#EXT-X-VERSION:7
#EXT-X-INDEPENDENT-SEGMENTS
#EXT-X-PLAYLIST-TYPE:VOD
## Custom CDN Comment Line With Special Symbols: <>&"'!@#$%^&*()
#EXT-X-DATERANGE:ID="ad-1",START-DATE="2026-08-20T17:00:00.000Z",DURATION=30.0,PLANNED-DURATION=30.0
#EXT-X-DISCONTINUITY
#EXT-X-PROGRAM-DATE-TIME:2026-08-20T17:00:00.000Z
#EXTINF:6.000,
seg_001.ts
#EXT-X-DISCONTINUITY
#EXTINF:6.000,
seg_002.ts
#EXT-X-ENDLIST`;

      const rewritten = rewriteM3U8(fuzzedManifest, baseUrl, proxyBase, ref, origin);
      expect(rewritten).toContain('#EXT-X-INDEPENDENT-SEGMENTS');
      expect(rewritten).toContain('#EXT-X-PLAYLIST-TYPE:VOD');
      expect(rewritten).toContain('## Custom CDN Comment Line With Special Symbols: <>&"\'!@#$%^&*()');
      expect(rewritten).toContain('#EXT-X-DATERANGE:ID="ad-1"');
      expect(rewritten).toContain('#EXT-X-DISCONTINUITY');
      expect(rewritten).toContain('#EXT-X-PROGRAM-DATE-TIME:2026-08-20T17:00:00.000Z');
      expect(rewritten).toContain(`${proxyBase}/hls/segment.ts?url=`);
    });

    it('1.5 handles mixed line endings (CRLF and LF) per RFC 8216 seamlessly', () => {
      const crlfManifest = "#EXTM3U\r\n#EXT-X-VERSION:3\r\n#EXTINF:10.0,\r\nseg1.ts\r\n#EXT-X-ENDLIST";
      const mixedManifest = "#EXTM3U\r\n#EXT-X-VERSION:3\n#EXTINF:10.0,\r\nseg1.ts\n#EXT-X-ENDLIST";

      const resCrlf = rewriteM3U8(crlfManifest, baseUrl, proxyBase);
      expect(resCrlf).toContain(`${proxyBase}/hls/segment.ts?url=`);
      expect(resCrlf.split('\n').length).toBe(5);

      const resMixed = rewriteM3U8(mixedManifest, baseUrl, proxyBase);
      expect(resMixed).toContain(`${proxyBase}/hls/segment.ts?url=`);
      expect(resMixed.split('\n').length).toBe(5);
    });

    it('1.6 handles unclosed or malformed attributes in EXT-X-KEY and EXT-X-MAP tags gracefully', () => {
      const brokenKeyManifest = `#EXTM3U
#EXT-X-KEY:METHOD=NONE
#EXT-X-KEY:METHOD=AES-128,URI="https://cdn.example.com/valid.key",IV=0x1
#EXT-X-KEY:METHOD=AES-128,URI=unquoted_key.key
#EXTINF:10.0,
seg1.ts`;

      const rewritten = rewriteM3U8(brokenKeyManifest, baseUrl, proxyBase, ref);
      expect(rewritten).toContain('#EXT-X-KEY:METHOD=NONE');
      expect(rewritten).toContain(`URI="${proxyBase}/hls/key?url=`);
      expect(rewritten).toContain('IV=0x1');
      expect(rewritten).toContain('unquoted_key.key');
    });
  });

  // =========================================================================
  // 2. URL RESOLUTION DEEP DRILL (RFC 3986)
  // =========================================================================
  describe('2. URL Resolution Deep Drill (RFC 3986 Edge Cases)', () => {
    const base = 'https://cdn.example.com:8443/vod/2024/stream/manifest.m3u8?token=xyz123#frag';

    it('2.1 resolves deep parent path traversals (../, ../../, ../../../) correctly', () => {
      expect(resolveUrl('seg1.ts', base)).toBe('https://cdn.example.com:8443/vod/2024/stream/seg1.ts');
      expect(resolveUrl('./seg1.ts', base)).toBe('https://cdn.example.com:8443/vod/2024/stream/seg1.ts');
      expect(resolveUrl('../audio/track1.m3u8', base)).toBe('https://cdn.example.com:8443/vod/2024/audio/track1.m3u8');
      expect(resolveUrl('../../shared/init.mp4', base)).toBe('https://cdn.example.com:8443/vod/shared/init.mp4');
      expect(resolveUrl('../../../global/common.ts', base)).toBe('https://cdn.example.com:8443/global/common.ts');
      expect(resolveUrl('../../../../../root.ts', base)).toBe('https://cdn.example.com:8443/root.ts');
    });

    it('2.2 resolves absolute paths (/), protocol-relative (//), and full URLs accurately', () => {
      expect(resolveUrl('/absolute/path/chunk.ts', base)).toBe('https://cdn.example.com:8443/absolute/path/chunk.ts');
      expect(resolveUrl('//cdn2.another.com/cdn/chunk.ts', base)).toBe('https://cdn2.another.com/cdn/chunk.ts');
      expect(resolveUrl('http://insecure.cdn.com/seg.ts', base)).toBe('http://insecure.cdn.com/seg.ts');
      expect(resolveUrl('https://secure.cdn.com/seg.ts', base)).toBe('https://secure.cdn.com/seg.ts');
    });

    it('2.3 preserves query parameters and encoded characters in target URIs', () => {
      const resolved = resolveUrl('chunk_001.ts?sig=123%2B456%3D&expires=99999', base);
      expect(resolved).toBe('https://cdn.example.com:8443/vod/2024/stream/chunk_001.ts?sig=123%2B456%3D&expires=99999');
    });

    it('2.4 handles Vietnamese diacritics and spaces in paths safely', () => {
      const resolved = resolveUrl('Tập 1 - Thuyết Minh.m3u8', 'https://cdn.vsmov.com/phim/');
      expect(resolved).toBe('https://cdn.vsmov.com/phim/T%E1%BA%ADp%201%20-%20Thuy%E1%BA%BFt%20Minh.m3u8');
    });

    it('2.5 handles malformed base URLs and edge cases gracefully without throwing', () => {
      expect(resolveUrl('seg1.ts', 'not-a-valid-url')).toBe('seg1.ts');
      expect(resolveUrl('seg1.ts', '')).toBe('seg1.ts');
      expect(resolveUrl('', base)).toBe('');
      expect(resolveUrl(null, base)).toBe('');
      expect(resolveUrl(undefined, base)).toBe('');
    });
  });

  // =========================================================================
  // 3. MASTER PLAYLIST WITH MULTIPLE AUDIO, SUBTITLE & VIDEO TRACKS
  // =========================================================================
  describe('3. Multi-Track Renditions & Master Playlist Rewriting', () => {
    const proxyBase = 'https://stremio.addon.vn';
    const baseUrl = 'https://cdn.vsmov.com/4k/movie/master.m3u8';
    const ref = 'https://vsmov.com/';
    const origin = 'https://vsmov.com';

    const complexMaster = `#EXTM3U
#EXT-X-VERSION:6
#EXT-X-INDEPENDENT-SEGMENTS

# Audio Renditions
#EXT-X-MEDIA:TYPE=AUDIO,GROUP-ID="audio-aac",NAME="Tiếng Việt (Thuyết Minh)",DEFAULT=YES,AUTOSELECT=YES,LANGUAGE="vie",URI="audio/vie_tm.m3u8"
#EXT-X-MEDIA:TYPE=AUDIO,GROUP-ID="audio-aac",NAME="Tiếng Việt (Lồng Tiếng)",DEFAULT=NO,AUTOSELECT=YES,LANGUAGE="vie",URI="audio/vie_lt.m3u8"
#EXT-X-MEDIA:TYPE=AUDIO,GROUP-ID="audio-aac",NAME="English Original (Dolby Atmos)",DEFAULT=NO,AUTOSELECT=NO,LANGUAGE="eng",URI="audio/eng.m3u8"

# Subtitle Renditions
#EXT-X-MEDIA:TYPE=SUBTITLES,GROUP-ID="subs",NAME="Tiếng Việt (Vietsub)",DEFAULT=YES,AUTOSELECT=YES,LANGUAGE="vie",URI="subs/vie.vtt"
#EXT-X-MEDIA:TYPE=SUBTITLES,GROUP-ID="subs",NAME="English SDH",DEFAULT=NO,AUTOSELECT=NO,LANGUAGE="eng",URI="subs/eng.vtt"

# Closed Captions
#EXT-X-MEDIA:TYPE=CLOSED-CAPTIONS,GROUP-ID="cc",NAME="CC1",INSTREAM-ID="CC1",DEFAULT=NO

# Video Stream Variants
#EXT-X-STREAM-INF:BANDWIDTH=15000000,AVERAGE-BANDWIDTH=12000000,RESOLUTION=3840x2160,CODECS="hvc1.2.4.L153.B0,mp4a.40.2",AUDIO="audio-aac",SUBTITLES="subs"
4k/index.m3u8
#EXT-X-STREAM-INF:BANDWIDTH=8000000,AVERAGE-BANDWIDTH=6500000,RESOLUTION=1920x1080,CODECS="avc1.640028,mp4a.40.2",AUDIO="audio-aac",SUBTITLES="subs"
1080p/index.m3u8
#EXT-X-STREAM-INF:BANDWIDTH=4000000,AVERAGE-BANDWIDTH=3000000,RESOLUTION=1280x720,CODECS="avc1.4d401f,mp4a.40.2",AUDIO="audio-aac",SUBTITLES="subs"
720p/index.m3u8

# I-Frame Only Playlist (Trick-Play Seeking)
#EXT-X-I-FRAME-STREAM-INF:BANDWIDTH=1000000,RESOLUTION=3840x2160,URI="4k/iframe.m3u8"`;

    it('3.1 rewrites all audio renditions to /hls/manifest.m3u8 with encoded parameters', () => {
      const rewritten = rewriteM3U8(complexMaster, baseUrl, proxyBase, ref, origin);
      const lines = rewritten.split('\n');

      const audioLines = lines.filter((l) => l.startsWith('#EXT-X-MEDIA:TYPE=AUDIO'));
      expect(audioLines.length).toBe(3);

      for (const line of audioLines) {
        expect(line).toContain(`URI="${proxyBase}/hls/manifest.m3u8?url=`);
        expect(line).toContain('&ref=');
        expect(line).toContain('&origin=');
      }

      const match1 = audioLines[0].match(/url=([^&"]+)/);
      expect(decodeParam(match1[1])).toBe('https://cdn.vsmov.com/4k/movie/audio/vie_tm.m3u8');
    });

    it('3.2 rewrites all subtitle renditions to /hls/sub.vtt with encoded parameters', () => {
      const rewritten = rewriteM3U8(complexMaster, baseUrl, proxyBase, ref, origin);
      const lines = rewritten.split('\n');

      const subLines = lines.filter((l) => l.startsWith('#EXT-X-MEDIA:TYPE=SUBTITLES'));
      expect(subLines.length).toBe(2);

      for (const line of subLines) {
        expect(line).toContain(`URI="${proxyBase}/hls/sub.vtt?url=`);
      }

      const matchSub = subLines[0].match(/url=([^&"]+)/);
      expect(decodeParam(matchSub[1])).toBe('https://cdn.vsmov.com/4k/movie/subs/vie.vtt');
    });

    it('3.3 preserves CLOSED-CAPTIONS tags without URI unmodified', () => {
      const rewritten = rewriteM3U8(complexMaster, baseUrl, proxyBase, ref, origin);
      expect(rewritten).toContain('#EXT-X-MEDIA:TYPE=CLOSED-CAPTIONS,GROUP-ID="cc",NAME="CC1",INSTREAM-ID="CC1",DEFAULT=NO');
    });

    it('3.4 rewrites all video stream variants to /hls/manifest.m3u8', () => {
      const rewritten = rewriteM3U8(complexMaster, baseUrl, proxyBase, ref, origin);
      const lines = rewritten.split('\n');

      const variantLines = lines.filter((l) => l.startsWith(`${proxyBase}/hls/manifest.m3u8`));
      expect(variantLines.length).toBe(3);

      const urls = variantLines.map((l) => decodeParam(l.match(/url=([^&]+)/)[1]));
      expect(urls).toEqual([
        'https://cdn.vsmov.com/4k/movie/4k/index.m3u8',
        'https://cdn.vsmov.com/4k/movie/1080p/index.m3u8',
        'https://cdn.vsmov.com/4k/movie/720p/index.m3u8'
      ]);
    });

    it('3.5 injects custom VIP subtitle track into master without colliding with existing tracks', () => {
      const customSub = 'https://external-subtitles.org/custom_vietnamese.vtt';
      const rewritten = rewriteM3U8(complexMaster, baseUrl, proxyBase, ref, origin, customSub);

      expect(rewritten).toContain('NAME="Tiếng Việt (VIP)"');
      expect(rewritten).toContain(`${proxyBase}/hls/sub.vtt?url=`);
      expect(rewritten).toContain(encodeParam(customSub));
    });
  });

  // =========================================================================
  // 4. HTTP RANGE 206 EXHAUSTIVE BOUNDARY & EDGE CASE VALIDATION
  // =========================================================================
  describe('4. HTTP Range 206 Exhaustive Boundary & Edge Cases', () => {
    const totalSize = 10000000; // Exactly 10,000,000 bytes (10MB)

    it('4.1 handles single-byte request bytes=0-0 (first byte)', () => {
      const res = handleRangeRequest('bytes=0-0', totalSize);
      expect(res.status).toBe(206);
      expect(res.start).toBe(0);
      expect(res.end).toBe(0);
      expect(res.length).toBe(1);
      expect(res.contentRange).toBe(`bytes 0-0/${totalSize}`);
    });

    it('4.2 handles single-byte request at exact EOF bytes=9999999-9999999 (last byte)', () => {
      const res = handleRangeRequest('bytes=9999999-9999999', totalSize);
      expect(res.status).toBe(206);
      expect(res.start).toBe(9999999);
      expect(res.end).toBe(9999999);
      expect(res.length).toBe(1);
      expect(res.contentRange).toBe(`bytes 9999999-9999999/${totalSize}`);
    });

    it('4.3 handles open-ended range bytes=100- from 100 to end of file', () => {
      const res = handleRangeRequest('bytes=100-', totalSize);
      expect(res.status).toBe(206);
      expect(res.start).toBe(100);
      expect(res.end).toBe(9999999);
      expect(res.length).toBe(9999900);
      expect(res.contentRange).toBe(`bytes 100-9999999/${totalSize}`);
    });

    it('4.4 handles suffix range bytes=-50 (last 50 bytes of file)', () => {
      const res = handleRangeRequest('bytes=-50', totalSize);
      expect(res.status).toBe(206);
      expect(res.start).toBe(9999950);
      expect(res.end).toBe(9999999);
      expect(res.length).toBe(50);
      expect(res.contentRange).toBe(`bytes 9999950-9999999/${totalSize}`);
    });

    it('4.5 handles full-range open-ended bytes=0- seamlessly', () => {
      const res = handleRangeRequest('bytes=0-', totalSize);
      expect(res.status).toBe(206);
      expect(res.start).toBe(0);
      expect(res.end).toBe(9999999);
      expect(res.length).toBe(totalSize);
      expect(res.contentRange).toBe(`bytes 0-9999999/${totalSize}`);
    });

    it('4.6 clamps oversized end byte (bytes=500-999999999999) to totalSize - 1', () => {
      const res = handleRangeRequest('bytes=500-999999999999', totalSize);
      expect(res.status).toBe(206);
      expect(res.start).toBe(500);
      expect(res.end).toBe(9999999);
      expect(res.length).toBe(10000000 - 500);
      expect(res.contentRange).toBe(`bytes 500-9999999/${totalSize}`);
    });

    it('4.7 returns 416 Range Not Satisfiable when start byte exceeds totalSize (bytes=10000000-)', () => {
      const res = handleRangeRequest('bytes=10000000-', totalSize);
      expect(res.status).toBe(416);
      expect(res.error).toBe('Range Not Satisfiable');
    });

    it('4.8 returns 416 when start > end (bytes=5000-2000)', () => {
      const res = handleRangeRequest('bytes=5000-2000', totalSize);
      expect(res.status).toBe(416);
    });

    it('4.9 returns 416 on negative or invalid suffix ranges (bytes=-0, bytes=--50)', () => {
      const res1 = handleRangeRequest('bytes=-0', totalSize);
      expect(res1.status).toBe(416);

      const res2 = handleRangeRequest('bytes=--50', totalSize);
      expect(res2.status).toBe(416);
    });

    it('4.10 falls back to 200 full content for missing, non-byte, or malformed Range headers', () => {
      expect(handleRangeRequest(null, totalSize).status).toBe(200);
      expect(handleRangeRequest(undefined, totalSize).status).toBe(200);
      expect(handleRangeRequest('', totalSize).status).toBe(200);
      expect(handleRangeRequest('items=0-10', totalSize).status).toBe(200);
      expect(handleRangeRequest('random_junk_header', totalSize).status).toBe(200);
    });
  });

  // =========================================================================
  // 5. SSRF, SECURITY & ADVERSARIAL TARGET URL VALIDATION
  // =========================================================================
  describe('5. SSRF, Security & Adversarial Target URL Validation', () => {
    it('5.1 rejects all RFC 1918 Private IPv4 address variations', () => {
      const privateUrls = [
        'http://10.0.0.1/video.m3u8',
        'http://10.255.255.254/video.ts',
        'http://172.16.0.1/video.m3u8',
        'http://172.31.255.255/video.ts',
        'http://192.168.0.1/video.m3u8',
        'http://192.168.1.254/video.ts',
        'http://127.0.0.1:3000/api',
        'http://127.0.1.1:8080/manifest.m3u8',
        'http://0.0.0.0:7000/internal',
        'http://169.254.169.254/latest/meta-data/'
      ];

      for (const url of privateUrls) {
        const validation = validateTargetUrl(url);
        expect(validation.valid).toBe(false);
        expect(validation.error).toContain('private / loopback');
      }
    });

    it('5.2 rejects IPv6 loopback addresses (::1, [::1])', () => {
      expect(isPrivateHost('::1')).toBe(true);
      expect(isPrivateHost('[::1]')).toBe(true);
    });

    it('5.3 rejects internal and local domains (.local, .internal)', () => {
      expect(isPrivateHost('server.local')).toBe(true);
      expect(isPrivateHost('metadata.google.internal')).toBe(true);
      expect(isPrivateHost('database.corp.internal')).toBe(true);
    });

    it('5.4 rejects dangerous schemes (file, gopher, javascript, data, ftp)', () => {
      expect(validateTargetUrl('file:///etc/passwd').valid).toBe(false);
      expect(validateTargetUrl('data:text/html,<script>alert(1)</script>').valid).toBe(false);
      expect(validateTargetUrl('javascript:alert(document.cookie)').valid).toBe(false);
      expect(validateTargetUrl('gopher://127.0.0.1:70/').valid).toBe(false);
      expect(validateTargetUrl('ftp://ftp.example.com/movie.mp4').valid).toBe(false);
    });

    it('5.5 permits valid public CDN hosts (phimapi.com, vsmov.com, streamc.xyz, cloudflare, etc.)', () => {
      const publicUrls = [
        'https://s1.phim1280.tv/20240101/index.m3u8',
        'https://embed14.streamc.xyz/stream/abc.m3u8',
        'https://streamvsmov.com/4k/movie.m3u8',
        'https://vip.vlcdn.net/hls/test.m3u8',
        'https://cloudflare.com/video.m3u8'
      ];

      for (const url of publicUrls) {
        const v = validateTargetUrl(url);
        expect(v.valid).toBe(true);
        expect(v.url).toBe(url);
      }
    });
  });

  // =========================================================================
  // 6. HIGH-CONCURRENCY CONTROLLER STRESS & STREAMING RESILIENCE
  // =========================================================================
  describe('6. High-Concurrency Controller Stress & Streaming Resilience', () => {
    function mockReqRes(query = {}, headers = {}) {
      const req = {
        query,
        headers,
        protocol: 'https',
        get: (h) => (h === 'host' ? 'addon.stremio.vn' : req.headers[h.toLowerCase()]),
        on: vi.fn(),
        emit: vi.fn()
      };
      const res = {
        statusCode: 200,
        headers: {},
        body: null,
        headersSent: false,
        status: vi.fn((code) => {
          res.statusCode = code;
          return res;
        }),
        setHeader: vi.fn((key, value) => {
          res.headers[key.toLowerCase()] = value;
          return res;
        }),
        send: vi.fn((data) => {
          res.body = data;
          res.headersSent = true;
          return res;
        }),
        json: vi.fn((data) => {
          res.body = data;
          res.headersSent = true;
          return res;
        }),
        end: vi.fn(() => {
          res.headersSent = true;
          return res;
        })
      };
      return { req, res };
    }

    it('6.1 handles 100 concurrent manifest rewrite requests cleanly without state leakage', async () => {
      const sampleManifest = `#EXTM3U\n#EXT-X-STREAM-INF:BANDWIDTH=1000\nvariant.m3u8`;
      vi.spyOn(axios, 'get').mockImplementation(async (url) => ({
        data: sampleManifest,
        status: 200,
        request: { res: { responseUrl: url } }
      }));

      const promises = [];
      for (let i = 0; i < 100; i++) {
        const targetUrl = `https://s1.phim1280.tv/vod/movie_${i}/index.m3u8`;
        const { req, res } = mockReqRes({ url: encodeParam(targetUrl) });
        promises.push(
          handleManifest(req, res).then(() => {
            expect(res.status).toHaveBeenCalledWith(200);
            expect(res.body).toContain(`/hls/manifest.m3u8?url=`);
            const decoded = decodeParam(res.body.match(/url=([^&]+)/)[1]);
            expect(decoded).toBe(`https://s1.phim1280.tv/vod/movie_${i}/variant.m3u8`);
          })
        );
      }

      await Promise.all(promises);
    });

    it('6.2 handles video chunk streaming piping with backpressure and client abort simulation', async () => {
      let aborted = false;
      const mockStream = new Readable({
        read() {
          if (!aborted) {
            this.push(Buffer.from('G@TS_CHUNK_BINARY_PAYLOAD_TEST'));
            this.push(null);
          }
        }
      });
      mockStream.destroy = vi.fn(() => {
        aborted = true;
      });
      mockStream.pipe = vi.fn();

      let closeCallback;
      const { req, res } = mockReqRes(
        { url: 'https://vip.vlcdn.net/hls/seg100.ts' },
        { range: 'bytes=0-30' }
      );
      req.on = vi.fn((event, cb) => {
        if (event === 'close') closeCallback = cb;
      });

      vi.spyOn(axios, 'get').mockResolvedValueOnce({
        status: 206,
        headers: {
          'content-type': 'video/MP2T',
          'content-length': '30',
          'content-range': 'bytes 0-29/5000000'
        },
        data: mockStream
      });

      await handleSegment(req, res);

      expect(res.status).toHaveBeenCalledWith(206);
      expect(res.setHeader).toHaveBeenCalledWith('Content-Type', 'video/MP2T');
      expect(res.setHeader).toHaveBeenCalledWith('Content-Range', 'bytes 0-29/5000000');
      expect(mockStream.pipe).toHaveBeenCalledWith(res);

      // Simulate client abrupt seek disconnect
      closeCallback();
      expect(mockStream.destroy).toHaveBeenCalled();
    });

    it('6.3 handles AES-128 key retrieval with binary octet-stream header and cache-control', async () => {
      const keyBuffer = Buffer.from('0123456789ABCDEF');
      vi.spyOn(axios, 'get').mockResolvedValueOnce({
        status: 200,
        data: keyBuffer
      });

      const { req, res } = mockReqRes({ url: 'https://s1.phim1280.tv/enc.key' });
      await handleKey(req, res);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.setHeader).toHaveBeenCalledWith('Content-Type', 'application/octet-stream');
      expect(res.setHeader).toHaveBeenCalledWith('Cache-Control', 'public, max-age=86400');
      expect(Buffer.isBuffer(res.body)).toBe(true);
      expect(res.body.equals(keyBuffer)).toBe(true);
    });

    it('6.4 handles WebVTT subtitle streaming with utf-8 text content-type', async () => {
      const vttContent = `WEBVTT\n\n1\n00:00:00.000 --> 00:00:03.000\nPhụ đề tiếng Việt chuẩn 4K`;
      vi.spyOn(axios, 'get').mockResolvedValueOnce({
        status: 200,
        data: vttContent
      });

      const { req, res } = mockReqRes({ url: 'https://vsmov.com/subs/vietnamese.vtt' });
      await handleSub(req, res);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.setHeader).toHaveBeenCalledWith('Content-Type', 'text/vtt; charset=utf-8');
      expect(res.body).toBe(vttContent);
    });

    it('6.5 forwards upstream 403 Forbidden with proper JSON error payload', async () => {
      const err403 = new Error('Request failed with status code 403');
      err403.response = { status: 403 };
      vi.spyOn(axios, 'get').mockRejectedValueOnce(err403);

      const { req, res } = mockReqRes({ url: 'https://s1.phim1280.tv/blocked.m3u8' });
      await handleManifest(req, res);

      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.body.error).toContain('403 Forbidden');
    });

    it('6.6 forwards upstream network timeouts with HTTP 504 Gateway Timeout', async () => {
      const timeoutErr = new Error('Connection timed out');
      timeoutErr.code = 'ECONNABORTED';
      vi.spyOn(axios, 'get').mockRejectedValueOnce(timeoutErr);

      const { req, res } = mockReqRes({ url: 'https://s1.phim1280.tv/timeout.m3u8' });
      await handleManifest(req, res);

      expect(res.status).toHaveBeenCalledWith(504);
      expect(res.body.error).toContain('timed out');
    });
  });
});
