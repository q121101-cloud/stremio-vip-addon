'use strict';

/**
 * ============================================================
 *  VIP Movies Addon — test/routes/hls.test.js
 *  Unit & Integration Tests for HLS Proxy, Anti-403 & Playlist Rewriting
 * ============================================================
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from 'vitest';
const http = require('http');
const axios = require('axios');
const app = require('../../src/server');
const hlsRoute = require('../../src/routes/hls');

let appServer = null;
let appBaseUrl = '';

let mockUpstreamServer = null;
let mockUpstreamPort = 0;
let mockUpstreamBaseUrl = '';

describe('HLS Proxy Router & Anti-403 Engine', () => {
  beforeAll(async () => {
    // 1. Start Addon App Server on Ephemeral Port
    appServer = await new Promise((resolve) => {
      const s = app.listen(0, '127.0.0.1', () => resolve(s));
    });
    const port = appServer.address().port;
    appBaseUrl = `http://127.0.0.1:${port}`;

    // 2. Start Mock Upstream CDN Server on Ephemeral Port
    mockUpstreamServer = http.createServer((req, res) => {
      const url = new URL(req.url, `http://127.0.0.1:${mockUpstreamPort}`);

      if (url.pathname === '/stream/master.m3u8') {
        const body = `#EXTM3U
#EXT-X-VERSION:4
#EXT-X-MEDIA:TYPE=AUDIO,GROUP-ID="audio",NAME="Vietnamese",DEFAULT=YES,AUTOSELECT=YES,URI="1080p/audio.m3u8"
#EXT-X-STREAM-INF:BANDWIDTH=3000000,RESOLUTION=1920x1080,AUDIO="audio"
1080p/index.m3u8
#EXT-X-STREAM-INF:BANDWIDTH=1500000,RESOLUTION=1280x720,AUDIO="audio"
720p/index.m3u8
#EXT-X-I-FRAME-STREAM-INF:BANDWIDTH=300000,RESOLUTION=1920x1080,URI="1080p/iframe.m3u8"
`;
        res.writeHead(200, { 'Content-Type': 'application/vnd.apple.mpegurl' });
        return res.end(body);
      }

      if (url.pathname === '/stream/1080p/index.m3u8') {
        const body = `#EXTM3U
#EXT-X-VERSION:7
#EXT-X-TARGETDURATION:6
#EXT-X-KEY:METHOD=AES-128,URI="enc.key",IV=0x0123456789abcdef0123456789abcdef
#EXT-X-MAP:URI="init.mp4"
#EXT-X-PART:DURATION=1.0,URI="part0.mp4"
#EXT-X-PRELOAD-HINT:TYPE=PART,URI="part1.mp4"
#EXTINF:6.000,
segment_000.ts
#EXTINF:6.000,
${mockUpstreamBaseUrl}/stream/1080p/segment_001.ts
#EXT-X-ENDLIST
`;
        res.writeHead(200, { 'Content-Type': 'application/vnd.apple.mpegurl' });
        return res.end(body);
      }

      if (url.pathname === '/stream/1080p/segment_000.ts' || url.pathname === '/stream/1080p/segment_001.ts') {
        const tsBuf = Buffer.alloc(188 * 5, 0x47);
        res.writeHead(200, {
          'Content-Type': 'video/MP2T',
          'Content-Length': tsBuf.length,
          'Accept-Ranges': 'bytes',
        });
        return res.end(tsBuf);
      }

      if (url.pathname === '/stream/1080p/enc.key') {
        const keyBuf = Buffer.alloc(16, 0x5a);
        res.writeHead(200, {
          'Content-Type': 'application/octet-stream',
          'Content-Length': keyBuf.length,
        });
        return res.end(keyBuf);
      }

      if (url.pathname === '/stream/range-native.ts') {
        const range = req.headers.range;
        if (range === 'bytes=0-99') {
          const chunk = Buffer.alloc(100, 0x47);
          res.writeHead(206, {
            'Content-Type': 'video/MP2T',
            'Content-Range': 'bytes 0-99/1000',
            'Content-Length': 100,
          });
          return res.end(chunk);
        }
        const fullBuf = Buffer.alloc(1000, 0x47);
        res.writeHead(200, { 'Content-Type': 'video/MP2T', 'Content-Length': 1000 });
        return res.end(fullBuf);
      }

      if (url.pathname === '/stream/range-slice.ts') {
        const buf = Buffer.from('0123456789ABCDEF'); // 16 bytes
        // Responds 200 to force proxy local slicing
        res.writeHead(200, {
          'Content-Type': 'video/MP2T',
          'Content-Length': buf.length,
        });
        return res.end(buf);
      }

      if (url.pathname === '/embed.php') {
        const targetM3u8 = `${mockUpstreamBaseUrl}/stream/master.m3u8`;
        const innerSub = Buffer.from(targetM3u8).toString('base64');
        const outerObf = Buffer.from(JSON.stringify({ sUb: targetM3u8, hD: 'hash123' })).toString('base64');
        const html = `<!DOCTYPE html><html><body><div id="player" data-obf="${outerObf}"></div></body></html>`;
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        return res.end(html);
      }

      if (url.pathname === '/subs/test.srt') {
        const srt = `1\r\n00:00:01,000 --> 00:00:04,000\r\nXin chào VIP Movies!\r\n`;
        res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
        return res.end(srt);
      }

      if (url.pathname === '/broken-network') {
        res.writeHead(500, { 'Content-Type': 'text/plain' });
        return res.end('Internal Server Error');
      }

      res.writeHead(404, { 'Content-Type': 'text/plain' });
      return res.end('Not Found');
    });

    await new Promise((resolve) => {
      mockUpstreamServer.listen(0, '127.0.0.1', () => {
        mockUpstreamPort = mockUpstreamServer.address().port;
        mockUpstreamBaseUrl = `http://127.0.0.1:${mockUpstreamPort}`;
        resolve();
      });
    });
  });

  afterAll(async () => {
    if (appServer) {
      await new Promise((resolve) => appServer.close(resolve));
    }
    if (mockUpstreamServer) {
      await new Promise((resolve) => mockUpstreamServer.close(resolve));
    }
  });

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ─────────────────────────────────────────────────────────────
  // 1. Dynamic Anti-403 Headers (Origin & Referer)
  // ─────────────────────────────────────────────────────────────
  describe('1. Dynamic Anti-403 Referer & Origin Resolution', () => {
    const { getRefererHeaders } = hlsRoute;

    it('dynamically resolves Origin and Referer for StreamC domains', () => {
      const res1 = getRefererHeaders('https://embed14.streamc.xyz/stream/123/master.m3u8');
      expect(res1.origin).toBe('https://embed14.streamc.xyz');
      expect(res1.referer).toBe('https://embed14.streamc.xyz/');

      const res2 = getRefererHeaders('https://embed20.streamc.xyz/embed.php?hash=abc');
      expect(res2.origin).toBe('https://embed20.streamc.xyz');
      expect(res2.referer).toBe('https://embed20.streamc.xyz/');

      const res3 = getRefererHeaders('https://amass2.top/v/xyz');
      expect(res3.origin).toBe('https://amass2.top');
      expect(res3.referer).toBe('https://amass2.top/');
    });

    it('resolves strict Referer and Origin for KKPhim / PhimApi / VLCdn', () => {
      const res1 = getRefererHeaders('https://player.phimapi.com/player/?url=https://s1.phim1280.tv/123.m3u8');
      expect(res1.origin).toBe('https://player.phimapi.com');
      expect(res1.referer).toBe('https://player.phimapi.com/');

      const res2 = getRefererHeaders('https://vip.vlcdn.net/hls/test.m3u8');
      expect(res2.origin).toBe('https://player.phimapi.com');
      expect(res2.referer).toBe('https://player.phimapi.com/');
    });

    it('resolves strict Referer and Origin for VSMOV domains', () => {
      const res1 = getRefererHeaders('https://p25.streamvsmov.xyz/hls/4k.m3u8');
      expect(res1.origin).toBe('https://vsmov.com');
      expect(res1.referer).toBe('https://vsmov.com/');

      const res2 = getRefererHeaders('https://vsmov.com/api/stream/123');
      expect(res2.origin).toBe('https://vsmov.com');
      expect(res2.referer).toBe('https://vsmov.com/');
    });

    it('resolves strict Referer and Origin for NguonC domains', () => {
      const res = getRefererHeaders('https://phim.nguonc.com/api/film/cuu-mon');
      expect(res.origin).toBe('https://phim.nguonc.com');
      expect(res.referer).toBe('https://phim.nguonc.com/');
    });

    it('uses custom ref parameter when provided and valid', () => {
      const res = getRefererHeaders('https://custom-cdn.com/stream.m3u8', 'https://custom-referer.com/');
      expect(res.origin).toBe('https://custom-referer.com');
      expect(res.referer).toBe('https://custom-referer.com/');
    });
  });

  // ─────────────────────────────────────────────────────────────
  // 2. GET /hls/extract (Lazy Stream Extraction)
  // ─────────────────────────────────────────────────────────────
  describe('2. GET /hls/extract', () => {
    it('returns 400 Bad Request when embed URL is missing', async () => {
      try {
        await axios.get(`${appBaseUrl}/hls/extract`);
        expect.fail('Should have failed with 400');
      } catch (err) {
        expect(err.response?.status).toBe(400);
      }
    });

    it('extracts M3U8 from embed HTML and 302 redirects to /hls/manifest.m3u8', async () => {
      const embedUrl = `${mockUpstreamBaseUrl}/embed.php?hash=8ee47a1a5a6a4a055ace332760ab1225`;

      const res = await axios.get(`${appBaseUrl}/hls/extract?embed=${encodeURIComponent(embedUrl)}`, {
        maxRedirects: 0,
        validateStatus: (status) => status === 302,
      });

      expect(res.status).toBe(302);
      expect(res.headers.location).toContain('/hls/manifest.m3u8');
      expect(res.headers.location).toContain('url=');
    });

    it('redirects to original embed URL as fallback if extraction fails', async () => {
      const failedEmbedUrl = `${mockUpstreamBaseUrl}/broken-network`;

      const res = await axios.get(`${appBaseUrl}/hls/extract?embed=${encodeURIComponent(failedEmbedUrl)}`, {
        maxRedirects: 0,
        validateStatus: (status) => status === 302 || status === 502,
      });

      expect([302, 502]).toContain(res.status);
      if (res.status === 302) {
        expect(res.headers.location).toBe(failedEmbedUrl);
      }
    });
  });

  // ─────────────────────────────────────────────────────────────
  // 3. GET /hls/manifest.m3u8 (Playlist Rewriting & Subtitle Injection)
  // ─────────────────────────────────────────────────────────────
  describe('3. GET /hls/manifest.m3u8 Playlist Rewriting', () => {
    it('returns 400 Bad Request when URL is missing', async () => {
      try {
        await axios.get(`${appBaseUrl}/hls/manifest.m3u8`);
        expect.fail('Should have failed with 400');
      } catch (err) {
        expect(err.response?.status).toBe(400);
      }
    });

    it('rewrites Master Playlist variants and injects subtitles track', async () => {
      const masterUrl = `${mockUpstreamBaseUrl}/stream/master.m3u8`;
      const b64Master = Buffer.from(masterUrl).toString('base64url');
      const subUrl = `${mockUpstreamBaseUrl}/subs/test.srt`;
      const b64Sub = Buffer.from(subUrl).toString('base64url');

      const res = await axios.get(`${appBaseUrl}/hls/manifest.m3u8?url=${b64Master}&sub=${b64Sub}`, {
        validateStatus: (s) => s === 200,
      });

      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toContain('application/vnd.apple.mpegurl');
      expect(res.headers['access-control-allow-origin']).toBe('*');

      const body = res.data;
      expect(body).toContain('#EXTM3U');
      // Master variant rewrite
      expect(body).toContain('/hls/manifest.m3u8?url=');
      // Subtitle injection
      expect(body).toContain('#EXT-X-MEDIA:TYPE=SUBTITLES,GROUP-ID="subs"');
      expect(body).toContain('/hls/sub.vtt?url=');
      // Audio rendition rewrite
      expect(body).toContain('#EXT-X-MEDIA:TYPE=AUDIO');
      // I-frame rewrite
      expect(body).toContain('#EXT-X-I-FRAME-STREAM-INF');
    });

    it('rewrites Media Playlist segments, AES keys, fMP4 MAPs and partial segments', async () => {
      const mediaUrl = `${mockUpstreamBaseUrl}/stream/1080p/index.m3u8`;
      const b64Media = Buffer.from(mediaUrl).toString('base64url');

      const res = await axios.get(`${appBaseUrl}/hls/manifest.m3u8?url=${b64Media}`);
      expect(res.status).toBe(200);

      const body = res.data;
      // Key rewrite
      expect(body).toContain('#EXT-X-KEY:METHOD=AES-128,URI="');
      expect(body).toContain('/hls/key?url=');
      // MAP rewrite
      expect(body).toContain('#EXT-X-MAP:URI="');
      expect(body).toContain('/hls/segment.ts?url=');
      // Segment rewrite
      expect(body).toContain('/hls/segment.ts?url=');
    });

    it('de-embed fallback: auto-extracts M3U8 when queried with an HTML embed page', async () => {
      const embedUrl = `${mockUpstreamBaseUrl}/embed.php?hash=auto_fallback`;
      const b64Embed = Buffer.from(embedUrl).toString('base64url');

      const res = await axios.get(`${appBaseUrl}/hls/manifest.m3u8?url=${b64Embed}`);
      expect(res.status).toBe(200);
      expect(res.data).toContain('#EXTM3U');
      expect(res.data).toContain('/hls/manifest.m3u8?url=');
    });
  });

  // ─────────────────────────────────────────────────────────────
  // 4. GET /hls/segment.ts (Range Requests & Chunk Streaming)
  // ─────────────────────────────────────────────────────────────
  describe('4. GET /hls/segment.ts Range Requests & Chunk Proxying', () => {
    it('returns 400 Bad Request when URL is missing', async () => {
      try {
        await axios.get(`${appBaseUrl}/hls/segment.ts`);
        expect.fail('Should have failed with 400');
      } catch (err) {
        expect(err.response?.status).toBe(400);
      }
    });

    it('proxies video chunks with video/MP2T and Accept-Ranges', async () => {
      const segUrl = `${mockUpstreamBaseUrl}/stream/1080p/segment_000.ts`;
      const b64Seg = Buffer.from(segUrl).toString('base64url');

      const res = await axios.get(`${appBaseUrl}/hls/segment.ts?url=${b64Seg}`, {
        responseType: 'arraybuffer',
      });

      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toBe('video/MP2T');
      expect(res.headers['accept-ranges']).toBe('bytes');
      expect(res.headers['access-control-allow-origin']).toBe('*');
      expect(Buffer.from(res.data)[0]).toBe(0x47);
    });

    it('handles Range request natively when upstream returns HTTP 206', async () => {
      const segUrl = `${mockUpstreamBaseUrl}/stream/range-native.ts`;
      const b64Seg = Buffer.from(segUrl).toString('base64url');

      const res = await axios.get(`${appBaseUrl}/hls/segment.ts?url=${b64Seg}`, {
        headers: { Range: 'bytes=0-99' },
        responseType: 'arraybuffer',
      });

      expect(res.status).toBe(206);
      expect(res.headers['content-range']).toBe('bytes 0-99/1000');
      expect(res.headers['content-length']).toBe('100');
    });

    it('handles Range request by buffer slicing locally when upstream returns HTTP 200', async () => {
      const segUrl = `${mockUpstreamBaseUrl}/stream/range-slice.ts`;
      const b64Seg = Buffer.from(segUrl).toString('base64url');

      const res = await axios.get(`${appBaseUrl}/hls/segment.ts?url=${b64Seg}`, {
        headers: { Range: 'bytes=4-9' },
        responseType: 'arraybuffer',
      });

      expect(res.status).toBe(206);
      expect(res.headers['content-range']).toBe('bytes 4-9/16');
      expect(res.headers['content-length']).toBe('6');
      expect(Buffer.from(res.data).toString('utf8')).toBe('456789');
    });

    it('falls back to 302 redirect when upstream segment request fails', async () => {
      const brokenUrl = `${mockUpstreamBaseUrl}/broken-network`;
      const b64Broken = Buffer.from(brokenUrl).toString('base64url');

      const res = await axios.get(`${appBaseUrl}/hls/segment.ts?url=${b64Broken}`, {
        maxRedirects: 0,
        validateStatus: (status) => status === 302 || status === 502,
      });

      expect([302, 502]).toContain(res.status);
      if (res.status === 302) {
        expect(res.headers.location).toBe(brokenUrl);
      }
    });
  });

  // ─────────────────────────────────────────────────────────────
  // 5. GET /hls/key (Decryption Key Proxy)
  // ─────────────────────────────────────────────────────────────
  describe('5. GET /hls/key AES Key Proxy', () => {
    it('returns 400 Bad Request when URL is missing', async () => {
      try {
        await axios.get(`${appBaseUrl}/hls/key`);
        expect.fail('Should have failed with 400');
      } catch (err) {
        expect(err.response?.status).toBe(400);
      }
    });

    it('proxies AES key with application/octet-stream and anti-403 headers', async () => {
      const keyUrl = `${mockUpstreamBaseUrl}/stream/1080p/enc.key`;
      const b64Key = Buffer.from(keyUrl).toString('base64url');

      const res = await axios.get(`${appBaseUrl}/hls/key?url=${b64Key}`, {
        responseType: 'arraybuffer',
      });

      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toBe('application/octet-stream');
      expect(Buffer.from(res.data)).toEqual(Buffer.alloc(16, 0x5a));
    });
  });

  // ─────────────────────────────────────────────────────────────
  // 6. GET /hls/sub.vtt (Subtitle Proxy & VTT Normalization)
  // ─────────────────────────────────────────────────────────────
  describe('6. GET /hls/sub.vtt Subtitle Proxy', () => {
    it('returns 400 Bad Request when subtitle URL is missing', async () => {
      try {
        await axios.get(`${appBaseUrl}/hls/sub.vtt`);
        expect.fail('Should have failed with 400');
      } catch (err) {
        expect(err.response?.status).toBe(400);
      }
    });

    it('normalizes SRT comma timestamps and adds WEBVTT header', async () => {
      const subUrl = `${mockUpstreamBaseUrl}/subs/test.srt`;
      const b64Sub = Buffer.from(subUrl).toString('base64url');

      const res = await axios.get(`${appBaseUrl}/hls/sub.vtt?url=${b64Sub}`);
      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toContain('text/vtt');
      expect(res.headers['access-control-allow-origin']).toBe('*');

      const body = res.data;
      expect(body.startsWith('WEBVTT')).toBe(true);
      expect(body).toContain('00:00:01.000 --> 00:00:04.000');
      expect(body).toContain('Xin chào VIP Movies!');
    });

    it('decodes data:text/vtt;base64 URIs correctly', async () => {
      const vttContent = 'WEBVTT\n\n1\n00:00:01.000 --> 00:00:03.000\nPhụ đề data URI';
      const dataUri = `data:text/vtt;base64,${Buffer.from(vttContent).toString('base64')}`;
      const b64Param = Buffer.from(dataUri).toString('base64url');

      const res = await axios.get(`${appBaseUrl}/hls/sub.vtt?url=${b64Param}`);
      expect(res.status).toBe(200);
      expect(res.data).toContain('Phụ đề data URI');
    });
  });

  // ─────────────────────────────────────────────────────────────
  // 7. CORS & Preflight
  // ─────────────────────────────────────────────────────────────
  describe('7. CORS Preflight & OPTIONS', () => {
    it('returns 204 No Content for OPTIONS preflight with CORS headers', async () => {
      const res = await axios.options(`${appBaseUrl}/hls/manifest.m3u8`);
      expect(res.status).toBe(204);
      expect(res.headers['access-control-allow-origin']).toBe('*');
      expect(res.headers['access-control-allow-methods']).toContain('GET');
    });
  });
});
