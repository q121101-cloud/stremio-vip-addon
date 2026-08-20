'use strict';

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
const axios = require('axios');
const express = require('express');
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

describe('Milestone M2 Unit Test Suite: Anti-403 HLS Streaming Reverse Proxy & M3U8 Rewriter', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ==========================================
  // SECTION 1: Parameter Encoding & Decoding
  // ==========================================
  describe('1. Base64 & Base64URL Parameter Encoding/Decoding', () => {
    it('1.1 should decode standard Base64 string with padding', () => {
      const original = 'https://s1.phim1280.tv/20230929/cuumon/index.m3u8';
      const encoded = Buffer.from(original).toString('base64');
      expect(decodeParam(encoded)).toBe(original);
      expect(decodeUrlParam(encoded)).toBe(original);
      expect(decodeB64(encoded)).toBe(original);
      expect(decodeBase64Url(encoded)).toBe(original);
    });

    it('1.2 should decode Base64URL string without padding and with -_ chars', () => {
      const original = 'https://embed14.streamc.xyz/stream/abc-def_ghi/index.m3u8?token=xyz';
      const encoded = Buffer.from(original).toString('base64url');
      expect(decodeParam(encoded)).toBe(original);
    });

    it('1.3 should pass through raw plain HTTP/HTTPS URLs directly', () => {
      const rawHttp = 'http://streamvsmov.com/4k/movie.m3u8';
      const rawHttps = 'https://phim.nguonc.com/embed/film123';
      expect(decodeParam(rawHttp)).toBe(rawHttp);
      expect(decodeParam(rawHttps)).toBe(rawHttps);
    });

    it('1.4 should decode URL-encoded string starting with https', () => {
      const raw = 'https%3A%2F%2Fplayer.phimapi.com%2Fvideo.m3u8';
      expect(decodeParam(raw)).toBe('https://player.phimapi.com/video.m3u8');
    });

    it('1.5 should handle empty, null, and non-string inputs safely without throwing', () => {
      expect(decodeParam('')).toBe('');
      expect(decodeParam(null)).toBe('');
      expect(decodeParam(undefined)).toBe('');
      expect(decodeParam(123)).toBe('');
    });

    it('1.6 should encode strings to URL-safe Base64 without + / or =', () => {
      const str = 'https://s1.phim1280.tv/test?a=1&b=2+3/4==';
      const encoded = encodeParam(str);
      expect(encoded).not.toContain('+');
      expect(encoded).not.toContain('/');
      expect(encoded).not.toContain('=');
      expect(encodeUrlParam(str)).toBe(encoded);
      expect(encodeB64(str)).toBe(encoded);
      expect(encodeBase64Url(str)).toBe(encoded);
      expect(decodeParam(encoded)).toBe(str);
    });

    it('1.7 should build proxy URLs accurately for manifest, segment, key, and sub', () => {
      const base = 'https://myaddon.com';
      const target = 'https://cdn.example.com/hls/video.m3u8';
      const ref = 'https://player.phimapi.com/';
      const origin = 'https://player.phimapi.com';

      const manifestUrl = buildProxyUrl('manifest', target, { proxyBase: base, ref, origin });
      expect(manifestUrl).toContain(`${base}/hls/manifest.m3u8?url=`);
      expect(manifestUrl).toContain('&ref=');
      expect(manifestUrl).toContain('&origin=');

      const segUrl = buildProxyUrl('segment', 'https://cdn.example.com/hls/001.ts', { proxyBase: base, ref });
      expect(segUrl).toContain(`${base}/hls/segment.ts?url=`);

      const keyUrl = buildProxyUrl('key', 'https://cdn.example.com/hls/enc.key', { proxyBase: base, ref });
      expect(keyUrl).toContain(`${base}/hls/key?url=`);

      const subUrl = buildProxyUrl('sub', 'https://cdn.example.com/hls/sub.vtt', { proxyBase: base, ref });
      expect(subUrl).toContain(`${base}/hls/sub.vtt?url=`);
    });
  });

  // ==========================================
  // SECTION 2: URL Resolution (RFC 3986)
  // ==========================================
  describe('2. URL Resolution (RFC 3986 Compliance)', () => {
    const base = 'https://cdn.streamc.xyz/vod/2024/cuumon/master.m3u8';

    it('2.1 should resolve sibling relative filenames', () => {
      expect(resolveUrl('variant_1080p.m3u8', base)).toBe('https://cdn.streamc.xyz/vod/2024/cuumon/variant_1080p.m3u8');
      expect(resolveUrl('segment_001.ts', base)).toBe('https://cdn.streamc.xyz/vod/2024/cuumon/segment_001.ts');
    });

    it('2.2 should resolve parent directory paths (../)', () => {
      expect(resolveUrl('../audio/track1.m3u8', base)).toBe('https://cdn.streamc.xyz/vod/2024/audio/track1.m3u8');
      expect(resolveUrl('../../shared/init.mp4', base)).toBe('https://cdn.streamc.xyz/vod/shared/init.mp4');
    });

    it('2.3 should resolve root-relative paths (/)', () => {
      expect(resolveUrl('/static/chunks/seg1.ts', base)).toBe('https://cdn.streamc.xyz/static/chunks/seg1.ts');
    });

    it('2.4 should resolve protocol-relative URLs (//)', () => {
      expect(resolveUrl('//edge2.streamc.xyz/seg1.ts', base)).toBe('https://edge2.streamc.xyz/seg1.ts');
    });

    it('2.5 should preserve query parameters and authentication tokens on relative paths', () => {
      const resolved = resolveUrl('chunk.ts?auth=secret123&exp=999999', base);
      expect(resolved).toBe('https://cdn.streamc.xyz/vod/2024/cuumon/chunk.ts?auth=secret123&exp=999999');
    });

    it('2.6 should leave already absolute URLs untouched', () => {
      const abs = 'https://storage.googleapis.com/bucket/seg.ts';
      expect(resolveUrl(abs, base)).toBe(abs);
    });

    it('2.7 should handle empty or invalid base gracefully', () => {
      expect(resolveUrl('', base)).toBe('');
      expect(resolveUrl('segment.ts', '')).toBe('segment.ts');
    });
  });

  // ==========================================
  // SECTION 3: Dynamic Anti-403 Header Spoofing
  // ==========================================
  describe('3. Dynamic Anti-403 Referer, Origin, & User-Agent Spoofing', () => {
    it('3.1 should generate dynamic Referer and Origin for StreamC hosts', () => {
      const headers = getRefererHeaders('https://embed14.streamc.xyz/stream/index.m3u8');
      expect(headers.Referer).toBe('https://embed14.streamc.xyz/');
      expect(headers.Origin).toBe('https://embed14.streamc.xyz');
      expect(headers['User-Agent']).toContain('Mozilla/5.0');
      expect(headers.Accept).toBe('*/*');
    });

    it('3.2 should generate dynamic Referer and Origin for amass.xyz hosts', () => {
      const headers = getRefererHeaders('https://vip.amass.xyz/hls/stream.m3u8');
      expect(headers.Referer).toBe('https://vip.amass.xyz/');
      expect(headers.Origin).toBe('https://vip.amass.xyz');
    });

    it('3.3 should generate player.phimapi.com Referer for KKPhim and phim1280 CDN hosts', () => {
      const h1 = getRefererHeaders('https://s1.phim1280.tv/20230929/cuumon/index.m3u8');
      expect(h1.Referer).toBe('https://player.phimapi.com/');
      expect(h1.Origin).toBe('https://player.phimapi.com');

      const h2 = getRefererHeaders('https://vip.vlcdn.net/hls/video.m3u8');
      expect(h2.Referer).toBe('https://player.phimapi.com/');
      expect(h2.Origin).toBe('https://player.phimapi.com');
    });

    it('3.4 should generate vsmov.com Referer for VSMOV 4K stream domains', () => {
      const headers = getRefererHeaders('https://streamvsmov.com/hls/4k_master.m3u8');
      expect(headers.Referer).toBe('https://vsmov.com/');
      expect(headers.Origin).toBe('https://vsmov.com');
    });

    it('3.5 should prioritize explicit custom Referer and Origin when provided', () => {
      const customRef = 'https://custom-player.org/embed/123';
      const customOrigin = 'https://custom-player.org';
      const headers = getRefererHeaders('https://cdn.unknown.com/stream.m3u8', customRef, customOrigin);
      expect(headers.Referer).toBe(customRef);
      expect(headers.Origin).toBe(customOrigin);
    });

    it('3.6 should auto-derive Origin from custom Referer if Origin is omitted', () => {
      const headers = getRefererHeaders('https://cdn.unknown.com/stream.m3u8', 'https://my-portal.vn/watch/456');
      expect(headers.Referer).toBe('https://my-portal.vn/watch/456');
      expect(headers.Origin).toBe('https://my-portal.vn');
    });

    it('3.7 should verify alias functions point to getRefererHeaders', () => {
      expect(resolveUpstreamHeaders).toBe(getRefererHeaders);
      expect(getSpoofedHeaders).toBe(getRefererHeaders);
    });
  });

  // ==========================================
  // SECTION 4: Master Playlist Rewriter
  // ==========================================
  describe('4. Master Playlist Rewriter Engine', () => {
    const proxyBase = 'https://addon.domain.com';
    const baseUrl = 'https://s1.phim1280.tv/2024/film/';
    const ref = 'https://player.phimapi.com/';
    const origin = 'https://player.phimapi.com';

    const sampleMaster = `#EXTM3U
#EXT-X-VERSION:3
#EXT-X-STREAM-INF:BANDWIDTH=3000000,RESOLUTION=1920x1080
1080p/index.m3u8
#EXT-X-STREAM-INF:BANDWIDTH=1500000,RESOLUTION=1280x720
720p/index.m3u8
#EXT-X-STREAM-INF:BANDWIDTH=800000,RESOLUTION=854x480
480p/index.m3u8`;

    it('4.1 should rewrite all variant playlist lines to proxy manifest endpoints', () => {
      const rewritten = rewriteM3U8(sampleMaster, baseUrl, proxyBase, ref, origin);
      const lines = rewritten.split('\n');

      expect(lines[0]).toBe('#EXTM3U');
      expect(lines[1]).toBe('#EXT-X-VERSION:3');
      expect(lines[2]).toBe('#EXT-X-STREAM-INF:BANDWIDTH=3000000,RESOLUTION=1920x1080');

      // Variant 1080p line
      expect(lines[3]).toContain(`${proxyBase}/hls/manifest.m3u8?url=`);
      expect(lines[3]).toContain('&ref=');
      expect(lines[3]).toContain('&origin=');

      // Decode rewritten URL to verify target resolution
      const urlMatch = lines[3].match(/url=([^&]+)/);
      expect(decodeParam(urlMatch[1])).toBe('https://s1.phim1280.tv/2024/film/1080p/index.m3u8');
    });

    it('4.2 should support options object signature rewriteM3U8(body, { baseUrl, proxyBase, ref, origin })', () => {
      const rewritten = rewriteM3U8(sampleMaster, { baseUrl, proxyBase, ref, origin });
      expect(rewritten).toContain(`${proxyBase}/hls/manifest.m3u8?url=`);
      expect(rewriteManifest).toBe(rewriteM3U8);
      expect(rewriteM3u8Content).toBe(rewriteM3U8);
    });

    it('4.3 should rewrite #EXT-X-MEDIA audio and subtitle renditions in master playlist', () => {
      const masterWithMedia = `#EXTM3U
#EXT-X-MEDIA:TYPE=AUDIO,GROUP-ID="audio",NAME="Vietnamese",DEFAULT=YES,URI="audio/vie.m3u8"
#EXT-X-MEDIA:TYPE=SUBTITLES,GROUP-ID="subs",NAME="English",URI="sub/en.vtt"
#EXT-X-STREAM-INF:BANDWIDTH=2000000,AUDIO="audio",SUBTITLES="subs"
video.m3u8`;

      const rewritten = rewriteM3U8(masterWithMedia, baseUrl, proxyBase, ref, origin);
      expect(rewritten).toContain(`URI="${proxyBase}/hls/manifest.m3u8?url=`);
      expect(rewritten).toContain(`URI="${proxyBase}/hls/sub.vtt?url=`);
    });

    it('4.4 should inject external subtitle rendition into master playlist when customSub is provided', () => {
      const subUrl = 'https://vsmov.com/subs/vie.vtt';
      const rewritten = rewriteM3U8(sampleMaster, baseUrl, proxyBase, ref, origin, subUrl);

      expect(rewritten).toContain('#EXT-X-MEDIA:TYPE=SUBTITLES,GROUP-ID="subs",NAME="Tiếng Việt (VIP)"');
      expect(rewritten).toContain(`${proxyBase}/hls/sub.vtt?url=`);
      expect(rewritten).toContain('SUBTITLES="subs"');
    });

    it('4.5 should return empty string when input is invalid or falsy', () => {
      expect(rewriteM3U8('', baseUrl, proxyBase)).toBe('');
      expect(rewriteM3U8(null, baseUrl, proxyBase)).toBe('');
      expect(rewriteM3U8(undefined, baseUrl, proxyBase)).toBe('');
    });
  });

  // ==========================================
  // SECTION 5: Media Playlist Rewriter
  // ==========================================
  describe('5. Media Playlist Segment Rewriter Engine', () => {
    const proxyBase = 'https://addon.domain.com';
    const baseUrl = 'https://embed14.streamc.xyz/stream/123/chunklist/';
    const ref = 'https://embed14.streamc.xyz/';
    const origin = 'https://embed14.streamc.xyz';

    const sampleMedia = `#EXTM3U
#EXT-X-VERSION:3
#EXT-X-TARGETDURATION:10
#EXT-X-MEDIA-SEQUENCE:0
#EXTINF:10.000,
segment_000.ts
#EXTINF:9.500,
segment_001.ts?token=abc
#EXTINF:10.000,
../shared/segment_002.ts
#EXT-X-ENDLIST`;

    it('5.1 should rewrite all segment lines to /hls/segment.ts with resolved URLs', () => {
      const rewritten = rewriteM3U8(sampleMedia, baseUrl, proxyBase, ref, origin);
      const lines = rewritten.split('\n');

      expect(lines[0]).toBe('#EXTM3U');
      expect(lines[2]).toBe('#EXT-X-TARGETDURATION:10');
      expect(lines[4]).toBe('#EXTINF:10.000,');

      // Segment 0
      expect(lines[5]).toContain(`${proxyBase}/hls/segment.ts?url=`);
      const seg0 = decodeParam(lines[5].match(/url=([^&]+)/)[1]);
      expect(seg0).toBe('https://embed14.streamc.xyz/stream/123/chunklist/segment_000.ts');

      // Segment 1 (with query parameters)
      const seg1 = decodeParam(lines[7].match(/url=([^&]+)/)[1]);
      expect(seg1).toBe('https://embed14.streamc.xyz/stream/123/chunklist/segment_001.ts?token=abc');

      // Segment 2 (parent relative path)
      const seg2 = decodeParam(lines[9].match(/url=([^&]+)/)[1]);
      expect(seg2).toBe('https://embed14.streamc.xyz/stream/123/shared/segment_002.ts');

      expect(lines[10]).toBe('#EXT-X-ENDLIST');
    });

    it('5.2 should rewrite media segments with unusual file extensions (.m4s, .mp4, opaque strings)', () => {
      const fmp4Media = `#EXTM3U
#EXT-X-TARGETDURATION:6
#EXTINF:6.0,
chunk_1080p_001.m4s
#EXTINF:6.0,
https://cdn2.example.com/opaque_stream_chunk_002`;

      const rewritten = rewriteM3U8(fmp4Media, baseUrl, proxyBase, ref, origin);
      expect(rewritten).toContain(`${proxyBase}/hls/segment.ts?url=`);
    });
  });

  // ==========================================
  // SECTION 6: Encryption Keys & Init Maps
  // ==========================================
  describe('6. AES-128 Encryption Keys (#EXT-X-KEY) & fMP4 Init Maps (#EXT-X-MAP)', () => {
    const proxyBase = 'https://addon.domain.com';
    const baseUrl = 'https://cdn.example.com/hls/live/';
    const ref = 'https://player.example.com/';

    it('6.1 should rewrite #EXT-X-KEY URI to /hls/key proxy endpoint', () => {
      const encryptedM3u8 = `#EXTM3U
#EXT-X-KEY:METHOD=AES-128,URI="https://cdn.example.com/keys/enc.key",IV=0x1234567890ABCDEF1234567890ABCDEF
#EXTINF:10.0,
segment_001.ts`;

      const rewritten = rewriteM3U8(encryptedM3u8, baseUrl, proxyBase, ref);
      expect(rewritten).toContain(`URI="${proxyBase}/hls/key?url=`);
      expect(rewritten).toContain('IV=0x1234567890ABCDEF1234567890ABCDEF');

      const keyUrlMatch = rewritten.match(/URI="([^"]+)"/);
      const decodedKey = decodeParam(keyUrlMatch[1].match(/url=([^&"]+)/)[1]);
      expect(decodedKey).toBe('https://cdn.example.com/keys/enc.key');
    });

    it('6.2 should resolve relative key URIs against baseUrl', () => {
      const encryptedM3u8 = `#EXTM3U
#EXT-X-KEY:METHOD=AES-128,URI="key.php?id=99",IV=0x0001
#EXTINF:10.0,
segment_001.ts`;

      const rewritten = rewriteM3U8(encryptedM3u8, baseUrl, proxyBase, ref);
      const keyUrlMatch = rewritten.match(/URI="([^"]+)"/);
      const decodedKey = decodeParam(keyUrlMatch[1].match(/url=([^&"]+)/)[1]);
      expect(decodedKey).toBe('https://cdn.example.com/hls/live/key.php?id=99');
    });

    it('6.3 should rewrite #EXT-X-MAP fMP4 initialization segment URIs to /hls/segment.ts', () => {
      const fmp4M3u8 = `#EXTM3U
#EXT-X-MAP:URI="init.mp4",BYTERANGE="1234@0"
#EXTINF:5.0,
chunk_001.m4s`;

      const rewritten = rewriteM3U8(fmp4M3u8, baseUrl, proxyBase, ref);
      expect(rewritten).toContain(`URI="${proxyBase}/hls/segment.ts?url=`);
      expect(rewritten).toContain('BYTERANGE="1234@0"');

      const mapUrlMatch = rewritten.match(/URI="([^"]+)"/);
      const decodedMap = decodeParam(mapUrlMatch[1].match(/url=([^&"]+)/)[1]);
      expect(decodedMap).toBe('https://cdn.example.com/hls/live/init.mp4');
    });
  });

  // ==========================================
  // SECTION 7: HTTP Range 206 Seeking
  // ==========================================
  describe('7. HTTP Range 206 Partial Content Evaluation', () => {
    const totalSize = 5242880; // 5MB

    it('7.1 should return status 200 with full content length when Range header is missing', () => {
      const res = handleRangeRequest(null, totalSize);
      expect(res.status).toBe(200);
      expect(res.start).toBe(0);
      expect(res.end).toBe(totalSize - 1);
      expect(res.length).toBe(totalSize);
    });

    it('7.2 should return status 206 with exact range slice for valid Range header', () => {
      const res = handleRangeRequest('bytes=100-299', totalSize);
      expect(res.status).toBe(206);
      expect(res.start).toBe(100);
      expect(res.end).toBe(299);
      expect(res.length).toBe(200);
      expect(res.contentRange).toBe(`bytes 100-299/${totalSize}`);
    });

    it('7.3 should handle open-ended range headers (bytes=1048576-)', () => {
      const res = handleRangeRequest('bytes=1048576-', totalSize);
      expect(res.status).toBe(206);
      expect(res.start).toBe(1048576);
      expect(res.end).toBe(totalSize - 1);
      expect(res.length).toBe(totalSize - 1048576);
      expect(res.contentRange).toBe(`bytes 1048576-${totalSize - 1}/${totalSize}`);
    });

    it('7.4 should handle suffix range headers (bytes=-1000)', () => {
      const res = handleRangeRequest('bytes=-1000', totalSize);
      expect(res.status).toBe(206);
      expect(res.start).toBe(totalSize - 1000);
      expect(res.end).toBe(totalSize - 1);
      expect(res.length).toBe(1000);
    });

    it('7.5 should clamp end byte that exceeds total resource size', () => {
      const res = handleRangeRequest('bytes=0-999999999', totalSize);
      expect(res.status).toBe(206);
      expect(res.start).toBe(0);
      expect(res.end).toBe(totalSize - 1);
      expect(res.length).toBe(totalSize);
    });

    it('7.6 should return status 416 Range Not Satisfiable when start byte exceeds total size', () => {
      const res = handleRangeRequest('bytes=6000000-7000000', totalSize);
      expect(res.status).toBe(416);
      expect(res.error).toBe('Range Not Satisfiable');
    });

    it('7.7 should return status 416 when start > end', () => {
      const res = handleRangeRequest('bytes=500-100', totalSize);
      expect(res.status).toBe(416);
    });
  });

  // ==========================================
  // SECTION 8: HTML Embed Fallback & De-obfuscation
  // ==========================================
  describe('8. HTML Embed Fallback & De-obfuscation (NguonC / StreamC)', () => {
    it('8.1 should extract sUb M3U8 from data-obf base64 JSON', () => {
      const payload = { sUb: 'hls/master.m3u8', hD: 'hls/hd.m3u8' };
      const b64Json = Buffer.from(JSON.stringify(payload)).toString('base64');
      const html = `<!DOCTYPE html><html><body><div id="player" data-obf="${b64Json}"></div></body></html>`;

      const extracted = extractM3u8FromHtml(html, 'https://embed14.streamc.xyz');
      expect(extracted).toBe('https://embed14.streamc.xyz/hls/master.m3u8');
    });

    it('8.2 should unpack Dean Edwards packed JavaScript to find stream URL', () => {
      // Packed form of: var stream = "https://cdn.example.com/hls/packed_stream.m3u8";
      const packed = `eval(function(p,a,c,k,e,d){e=function(c){return c.toString(36)};if(!''.replace(/^/,String)){while(c--){d[c.toString(a)]=k[c]||c.toString(a)}k=[function(e){return d[e]}];e=function(){return'\\\\w+'};c=1};while(c--){if(k[c]){p=p.replace(new RegExp('\\\\b'+e(c)+'\\\\b','g'),k[c])}}return p}('2 0="1://3.4.5/6/7.8";',9,9,'stream|https|var|cdn|example|com|hls|packed_stream|m3u8'.split('|'),0,{}))`;

      const unpacked = unpackDeanEdwards(packed);
      expect(unpacked).toContain('https://cdn.example.com/hls/packed_stream.m3u8');

      const extracted = extractM3u8FromHtml(packed, 'https://cdn.example.com');
      expect(extracted).toBe('https://cdn.example.com/hls/packed_stream.m3u8');
    });

    it('8.3 should extract direct regex match for M3U8 from arbitrary HTML', () => {
      const html = `<script>const source = "https://streamvsmov.com/4k/movie.m3u8";</script>`;
      const extracted = extractM3u8FromHtml(html);
      expect(extracted).toBe('https://streamvsmov.com/4k/movie.m3u8');
    });

    it('8.4 should return null when no stream is present in HTML', () => {
      const html = `<!DOCTYPE html><html><body><h1>Error 404 Not Found</h1></body></html>`;
      expect(extractM3u8FromHtml(html)).toBeNull();
      expect(extractM3u8FromHtml('')).toBeNull();
    });
  });

  // ==========================================
  // SECTION 9: SSRF & URL Validation
  // ==========================================
  describe('9. SSRF & Target URL Security Validation', () => {
    it('9.1 should approve valid public HTTPS and HTTP streaming URLs', () => {
      const v1 = validateTargetUrl('https://s1.phim1280.tv/stream/index.m3u8');
      expect(v1.valid).toBe(true);
      expect(v1.url).toBe('https://s1.phim1280.tv/stream/index.m3u8');

      const v2 = validateTargetUrl('http://streamvsmov.com/4k.m3u8');
      expect(v2.valid).toBe(true);
    });

    it('9.2 should reject localhost and 127.0.0.1 addresses', () => {
      expect(validateTargetUrl('http://localhost:7000/internal').valid).toBe(false);
      expect(validateTargetUrl('http://127.0.0.1:8080/admin').valid).toBe(false);
      expect(validateTargetUrl('http://127.0.1.1/secret').valid).toBe(false);
      expect(isPrivateHost('localhost')).toBe(true);
      expect(isPrivateHost('127.0.0.1')).toBe(true);
    });

    it('9.3 should reject Cloud metadata IP 169.254.169.254', () => {
      const v = validateTargetUrl('http://169.254.169.254/latest/meta-data');
      expect(v.valid).toBe(false);
      expect(isPrivateHost('169.254.169.254')).toBe(true);
    });

    it('9.4 should reject RFC 1918 private IPv4 subnets (10.x, 192.168.x, 172.16-31.x)', () => {
      expect(validateTargetUrl('http://10.0.0.1/stream.m3u8').valid).toBe(false);
      expect(validateTargetUrl('http://192.168.1.100/video.ts').valid).toBe(false);
      expect(validateTargetUrl('http://172.16.0.5/hls.m3u8').valid).toBe(false);
      expect(validateTargetUrl('http://172.31.255.255/hls.m3u8').valid).toBe(false);
    });

    it('9.5 should reject non-HTTP schemes (file://, ftp://, gopher://, javascript:)', () => {
      expect(validateTargetUrl('file:///etc/passwd').valid).toBe(false);
      expect(validateTargetUrl('ftp://server.com/file').valid).toBe(false);
      expect(validateTargetUrl('javascript:alert(1)').valid).toBe(false);
    });

    it('9.6 should reject empty or missing url parameters', () => {
      expect(validateTargetUrl('').valid).toBe(false);
      expect(validateTargetUrl(null).valid).toBe(false);
      expect(validateTargetUrl(undefined).valid).toBe(false);
    });
  });

  // ==========================================
  // SECTION 10: Express Controller Handlers
  // ==========================================
  describe('10. Express Controller Handlers & Route Integration', () => {
    // Helper to mock Express req & res
    function mockReqRes(query = {}, headers = {}, params = {}) {
      const req = {
        query,
        headers,
        params,
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

    // 10.1 Manifest Controller
    describe('handleManifest', () => {
      it('10.1.1 should return HTTP 400 for missing or invalid url parameter', async () => {
        const { req, res } = mockReqRes({});
        await handleManifest(req, res);
        expect(res.status).toHaveBeenCalledWith(400);
        expect(res.body.error).toContain('Missing required');
      });

      it('10.1.2 should return HTTP 400 when target url points to private IP', async () => {
        const { req, res } = mockReqRes({ url: 'http://127.0.0.1:8080/stream.m3u8' });
        await handleManifest(req, res);
        expect(res.status).toHaveBeenCalledWith(400);
        expect(res.body.error).toContain('private / loopback');
      });

      it('10.1.3 should fetch upstream M3U8, rewrite it, and return HTTP 200 with Apple MPEGURL header', async () => {
        const upstreamM3u8 = `#EXTM3U\n#EXT-X-STREAM-INF:BANDWIDTH=2000000\nvariant.m3u8`;
        vi.spyOn(axios, 'get').mockResolvedValueOnce({
          data: upstreamM3u8,
          status: 200,
          request: { res: { responseUrl: 'https://s1.phim1280.tv/2024/index.m3u8' } }
        });

        const targetUrl = 'https://s1.phim1280.tv/2024/index.m3u8';
        const b64Url = encodeParam(targetUrl);
        const { req, res } = mockReqRes({ url: b64Url, ref: encodeParam('https://player.phimapi.com/') });

        await handleManifest(req, res);

        expect(res.status).toHaveBeenCalledWith(200);
        expect(res.setHeader).toHaveBeenCalledWith('Content-Type', 'application/vnd.apple.mpegurl; charset=utf-8');
        expect(res.setHeader).toHaveBeenCalledWith('Cache-Control', 'public, max-age=60');
        expect(res.body).toContain('/hls/manifest.m3u8?url=');
      });

      it('10.1.4 should de-obfuscate HTML embed response and fetch inner M3U8 stream', async () => {
        const b64Obf = Buffer.from(JSON.stringify({ sUb: 'stream/index.m3u8' })).toString('base64');
        const htmlEmbed = `<!DOCTYPE html><html><body><div id="player" data-obf="${b64Obf}"></div></body></html>`;
        const innerM3u8 = `#EXTM3U\n#EXTINF:10.0,\nseg1.ts`;

        vi.spyOn(axios, 'get')
          .mockResolvedValueOnce({
            data: htmlEmbed,
            status: 200,
            request: { res: { responseUrl: 'https://embed14.streamc.xyz/play/123' } }
          })
          .mockResolvedValueOnce({
            data: innerM3u8,
            status: 200,
            request: { res: { responseUrl: 'https://embed14.streamc.xyz/stream/index.m3u8' } }
          });

        const { req, res } = mockReqRes({ url: 'https://embed14.streamc.xyz/play/123' });
        await handleManifest(req, res);

        expect(res.status).toHaveBeenCalledWith(200);
        expect(res.body).toContain('/hls/segment.ts?url=');
      });

      it('10.1.5 should return HTTP 502 when upstream body is not a valid M3U8 manifest', async () => {
        vi.spyOn(axios, 'get').mockResolvedValueOnce({
          data: '<html>Random error page without EXTM3U</html>',
          status: 200,
          request: { res: { responseUrl: 'https://cdn.example.com/bad.m3u8' } }
        });

        const { req, res } = mockReqRes({ url: 'https://cdn.example.com/bad.m3u8' });
        await handleManifest(req, res);

        expect(res.status).toHaveBeenCalledWith(502);
        expect(res.body.error).toContain('not a valid M3U8 manifest');
      });

      it('10.1.6 should return HTTP 504 on upstream timeout', async () => {
        const timeoutErr = new Error('timeout of 5000ms exceeded');
        timeoutErr.code = 'ETIMEDOUT';
        vi.spyOn(axios, 'get').mockRejectedValueOnce(timeoutErr);

        const { req, res } = mockReqRes({ url: 'https://cdn.example.com/timeout.m3u8' });
        await handleManifest(req, res);

        expect(res.status).toHaveBeenCalledWith(504);
        expect(res.body.error).toContain('timed out');
      });

      it('10.1.7 should forward HTTP 403 on upstream 403 WAF block', async () => {
        const forbiddenErr = new Error('Forbidden');
        forbiddenErr.response = { status: 403 };
        vi.spyOn(axios, 'get').mockRejectedValueOnce(forbiddenErr);

        const { req, res } = mockReqRes({ url: 'https://cdn.example.com/waf_blocked.m3u8' });
        await handleManifest(req, res);

        expect(res.status).toHaveBeenCalledWith(403);
        expect(res.body.error).toContain('403 Forbidden');
      });
    });

    // 10.2 Segment Controller
    describe('handleSegment', () => {
      it('10.2.1 should return HTTP 400 for missing url parameter', async () => {
        const { req, res } = mockReqRes({});
        await handleSegment(req, res);
        expect(res.status).toHaveBeenCalledWith(400);
      });

      it('10.2.2 should stream video chunks with zero-RAM piping and Range headers', async () => {
        const mockStream = new Readable({
          read() {
            this.push(Buffer.from('G@video_ts_chunk'));
            this.push(null);
          }
        });
        mockStream.pipe = vi.fn();

        vi.spyOn(axios, 'get').mockResolvedValueOnce({
          status: 206,
          headers: {
            'content-type': 'video/MP2T',
            'content-length': '16',
            'content-range': 'bytes 0-15/1000'
          },
          data: mockStream
        });

        const { req, res } = mockReqRes(
          { url: 'https://cdn.example.com/001.ts' },
          { range: 'bytes=0-15' }
        );

        await handleSegment(req, res);

        expect(res.status).toHaveBeenCalledWith(206);
        expect(res.setHeader).toHaveBeenCalledWith('Content-Type', 'video/MP2T');
        expect(res.setHeader).toHaveBeenCalledWith('Accept-Ranges', 'bytes');
        expect(res.setHeader).toHaveBeenCalledWith('Content-Range', 'bytes 0-15/1000');
        expect(res.setHeader).toHaveBeenCalledWith('Content-Length', '16');
        expect(mockStream.pipe).toHaveBeenCalledWith(res);
      });

      it('10.2.3 should handle upstream HTTP 416 Range Not Satisfiable', async () => {
        vi.spyOn(axios, 'get').mockResolvedValueOnce({
          status: 416,
          headers: { 'content-range': 'bytes */1000' },
          data: Readable.from([])
        });

        const { req, res } = mockReqRes(
          { url: 'https://cdn.example.com/001.ts' },
          { range: 'bytes=5000-6000' }
        );

        await handleSegment(req, res);

        expect(res.status).toHaveBeenCalledWith(416);
        expect(res.body).toBe('Range Not Satisfiable');
      });

      it('10.2.4 should clean up upstream stream when client aborts request', async () => {
        const mockStream = new Readable({ read() {} });
        mockStream.destroy = vi.fn();
        mockStream.pipe = vi.fn();

        let closeHandler;
        const { req, res } = mockReqRes({ url: 'https://cdn.example.com/001.ts' });
        req.on = vi.fn((event, cb) => {
          if (event === 'close') closeHandler = cb;
        });

        vi.spyOn(axios, 'get').mockResolvedValueOnce({
          status: 200,
          headers: { 'content-type': 'video/MP2T' },
          data: mockStream
        });

        await handleSegment(req, res);

        // Simulate client seeking / aborting
        expect(closeHandler).toBeDefined();
        closeHandler();
        expect(mockStream.destroy).toHaveBeenCalled();
      });
    });

    // 10.3 Key Controller
    describe('handleKey', () => {
      it('10.3.1 should return HTTP 400 for missing url parameter', async () => {
        const { req, res } = mockReqRes({});
        await handleKey(req, res);
        expect(res.status).toHaveBeenCalledWith(400);
      });

      it('10.3.2 should proxy binary AES-128 decryption key with application/octet-stream', async () => {
        const mockKeyBytes = Buffer.from([0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07, 0x08, 0x09, 0x0a, 0x0b, 0x0c, 0x0d, 0x0e, 0x0f, 0x10]);
        vi.spyOn(axios, 'get').mockResolvedValueOnce({
          status: 200,
          data: mockKeyBytes
        });

        const { req, res } = mockReqRes({ url: 'https://cdn.example.com/enc.key' });
        await handleKey(req, res);

        expect(res.status).toHaveBeenCalledWith(200);
        expect(res.setHeader).toHaveBeenCalledWith('Content-Type', 'application/octet-stream');
        expect(Buffer.isBuffer(res.body)).toBe(true);
        expect(res.body.length).toBe(16);
      });
    });

    // 10.4 Subtitle Controller
    describe('handleSub', () => {
      it('10.4.1 should return HTTP 400 for missing url parameter', async () => {
        const { req, res } = mockReqRes({});
        await handleSub(req, res);
        expect(res.status).toHaveBeenCalledWith(400);
      });

      it('10.4.2 should proxy WebVTT subtitles with text/vtt charset=utf-8', async () => {
        const vttContent = `WEBVTT\n\n1\n00:00:01.000 --> 00:00:04.000\nChào mừng bạn đến với Stremio!`;
        vi.spyOn(axios, 'get').mockResolvedValueOnce({
          status: 200,
          data: vttContent
        });

        const { req, res } = mockReqRes({ url: 'https://cdn.example.com/sub.vtt' });
        await handleSub(req, res);

        expect(res.status).toHaveBeenCalledWith(200);
        expect(res.setHeader).toHaveBeenCalledWith('Content-Type', 'text/vtt; charset=utf-8');
        expect(res.body).toBe(vttContent);
      });
    });
  });
});
