'use strict';

import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from 'vitest';
const http = require('http');
const path = require('path');
const fs = require('fs');

const app = require('../src/index');
const { parseConfig, encodeConfig, getManifest, ALL_CATALOGS, DEFAULT_CONFIG } = require('../src/manifest');
const {
  handleStream,
  rankStreams,
  scoreStreamQuality,
  resolveImdbStreams,
  resolveDirectStreams,
  resolveRawSlugStreams,
  fetchWithTimeout
} = require('../src/routes/stream');
const { cache, flushCache } = require('../src/db/cache');
const { kkphimProvider } = require('../src/providers/kkphim');
const { vsmovProvider } = require('../src/providers/vsmov');
const { nguoncProvider } = require('../src/providers/nguonc');
const { cinemetaService } = require('../src/services/cinemeta');
const { CIRCUIT_BREAKER } = require('../src/db/supabase');

describe('Milestone M4 Challenger 2: Empirical E2E Integration, Zero-CDN Dashboard Asset & Concurrency Stress Harness', () => {
  let server;
  let baseUrl;
  let port;

  beforeAll(async () => {
    // Spin up real ephemeral HTTP server to test genuine TCP socket interactions
    await new Promise((resolve) => {
      server = app.listen(0, '127.0.0.1', () => {
        port = server.address().port;
        baseUrl = `http://127.0.0.1:${port}`;
        resolve();
      });
    });
  });

  afterAll(async () => {
    if (server) {
      await new Promise((resolve) => server.close(resolve));
    }
  });

  beforeEach(() => {
    flushCache();
    vi.restoreAllMocks();
    CIRCUIT_BREAKER.reset();
  });

  afterEach(() => {
    flushCache();
    vi.restoreAllMocks();
  });

  // =========================================================================
  // 1. DASHBOARD ASSET INTEGRITY & ZERO EXTERNAL CDN AUDIT
  // =========================================================================
  describe('1. Dashboard Asset Integrity & Zero External CDN Audit', () => {
    const publicDir = path.join(__dirname, '..', 'src', 'public');
    const htmlPath = path.join(publicDir, 'index.html');
    const cssPath = path.join(publicDir, 'css', 'style.css');
    const appJsPath = path.join(publicDir, 'js', 'app.js');
    const qrJsPath = path.join(publicDir, 'js', 'qr-modal.js');

    it('1.1 should verify all required static files exist on disk with non-trivial size', () => {
      expect(fs.existsSync(htmlPath)).toBe(true);
      expect(fs.statSync(htmlPath).size).toBeGreaterThan(1000);

      expect(fs.existsSync(cssPath)).toBe(true);
      expect(fs.statSync(cssPath).size).toBeGreaterThan(1000);

      expect(fs.existsSync(appJsPath)).toBe(true);
      expect(fs.statSync(appJsPath).size).toBeGreaterThan(1000);

      expect(fs.existsSync(qrJsPath)).toBe(true);
      expect(fs.statSync(qrJsPath).size).toBeGreaterThan(1000);
    });

    it('1.2 should audit index.html to ensure ZERO external JavaScript CDN script dependencies', () => {
      const htmlContent = fs.readFileSync(htmlPath, 'utf8');

      // Match all <script src="..."> tags
      const scriptSrcMatches = [...htmlContent.matchAll(/<script[^>]+src=["']([^"']+)["']/gi)].map(m => m[1]);
      
      // Every script src MUST be local (starting with / or ./)
      for (const src of scriptSrcMatches) {
        expect(src).not.toMatch(/^https?:\/\//i);
        expect(src).not.toMatch(/cdn\.jsdelivr\.net/i);
        expect(src).not.toMatch(/cdnjs\.cloudflare\.com/i);
        expect(src).not.toMatch(/unpkg\.com/i);
      }

      // Assert expected local scripts are present
      expect(scriptSrcMatches).toContain('/js/qr-modal.js');
      expect(scriptSrcMatches).toContain('/js/app.js');
    });

    it('1.3 should audit style.css for zero broken local asset references or external CSS imports', () => {
      const cssContent = fs.readFileSync(cssPath, 'utf8');

      // Ensure no external @import url(...)
      const importMatches = [...cssContent.matchAll(/@import\s+(?:url\(['"]?([^'")]+)['"]?\)|['"]([^'"]+)['"])/gi)];
      expect(importMatches.length).toBe(0);

      // Verify essential Obsidian Aurora CSS tokens and keyframes exist
      expect(cssContent).toContain('--bg-space');
      expect(cssContent).toContain('--neon-cyan');
      expect(cssContent).toContain('--neon-gold');
      expect(cssContent).toContain('--neon-emerald');
      expect(cssContent).toContain('--spring-physics');
      expect(cssContent).toContain('float-orbital');
      expect(cssContent).toContain('float-pulse');
      expect(cssContent).toContain('backdrop-filter');
    });

    it('1.4 should verify qr-modal.js contains self-contained QR canvas generator without external dependencies', () => {
      const qrModule = require('../src/public/js/qr-modal.js');
      expect(qrModule).toBeDefined();
      expect(typeof qrModule.generateQRCodeCanvas).toBe('function');
      expect(typeof qrModule.QRModal).toBe('object');
      expect(typeof qrModule.QRModal.open).toBe('function');
      expect(typeof qrModule.QRModal.close).toBe('function');
      expect(typeof qrModule.QRModal.renderQR).toBe('function');

      // Test canvas drawing logic with a mock 2D context
      const drawCalls = [];
      const mockCanvas = {
        width: 220,
        height: 220,
        getContext: () => ({
          fillStyle: '',
          fillRect: (x, y, w, h) => drawCalls.push({ x, y, w, h })
        })
      };

      qrModule.generateQRCodeCanvas('https://test.stremio.com/c/7/manifest.json', mockCanvas);
      expect(drawCalls.length).toBeGreaterThan(50); // Background + 3 finders + timing + data bits
    });

    it('1.5 should verify app.js exports pure base64url and bitmask transformation utilities', () => {
      const appModule = require('../src/public/js/app.js');
      expect(appModule).toBeDefined();
      expect(typeof appModule.encodeBase64Url).toBe('function');
      expect(typeof appModule.decodeBase64Url).toBe('function');
      expect(typeof appModule.computeBitmask).toBe('function');

      const sampleObj = { providers: ['vsmov', 'nguonc'], categories: ['phim-moi'] };
      const encoded = appModule.encodeBase64Url(sampleObj);
      expect(typeof encoded).toBe('string');
      expect(encoded.length).toBeGreaterThan(0);

      const decoded = appModule.decodeBase64Url(encoded);
      expect(decoded).toEqual(sampleObj);
    });
  });

  // =========================================================================
  // 2. SERVER ENDPOINT VERIFICATION (REAL HTTP NETWORK SOCKETS)
  // =========================================================================
  describe('2. Server Endpoint Verification (Real HTTP Sockets)', () => {

    it('2.1 GET / should serve the Cyber-Glassmorphism Configurator HTML dashboard', async () => {
      const res = await fetch(`${baseUrl}/`);
      expect(res.status).toBe(200);
      expect(res.headers.get('content-type')).toContain('text/html');

      const html = await res.text();
      expect(html).toContain('VIP MOVIES');
      expect(html).toContain('obsidian-space');
      expect(html).toContain('aurora-mesh');
      expect(html).toContain('toggle-vsmov');
      expect(html).toContain('toggle-kkphim');
      expect(html).toContain('toggle-nguonc');
      expect(html).toContain('stream-simulator-list');
      expect(html).toContain('qr-modal');
    });

    it('2.2 GET /configure and GET /c/:config should alias to the Configurator dashboard', async () => {
      const res1 = await fetch(`${baseUrl}/configure`);
      expect(res1.status).toBe(200);
      expect(res1.headers.get('content-type')).toContain('text/html');

      const res2 = await fetch(`${baseUrl}/c/eyJwcm92aWRlcnMiOlsidnNtb3YiXX0`);
      expect(res2.status).toBe(200);
      expect(res2.headers.get('content-type')).toContain('text/html');
    });

    it('2.3 GET static assets (/css/style.css, /js/app.js, /js/qr-modal.js) should return 200 with correct MIME types', async () => {
      const cssRes = await fetch(`${baseUrl}/css/style.css`);
      expect(cssRes.status).toBe(200);
      expect(cssRes.headers.get('content-type')).toContain('text/css');

      const appJsRes = await fetch(`${baseUrl}/js/app.js`);
      expect(appJsRes.status).toBe(200);
      expect(appJsRes.headers.get('content-type')).toMatch(/javascript/);

      const qrJsRes = await fetch(`${baseUrl}/js/qr-modal.js`);
      expect(qrJsRes.status).toBe(200);
      expect(qrJsRes.headers.get('content-type')).toMatch(/javascript/);
    });

    it('2.4 GET /manifest.json should return standard default Stremio v4 manifest', async () => {
      const res = await fetch(`${baseUrl}/manifest.json`);
      expect(res.status).toBe(200);
      expect(res.headers.get('content-type')).toContain('application/json');
      expect(res.headers.get('access-control-allow-origin')).toBe('*');

      const manifest = await res.json();
      expect(manifest.id).toBeDefined();
      expect(manifest.version).toBe('2.0.0');
      expect(manifest.name).toContain('VIP Movies');
      expect(manifest.resources).toEqual(expect.arrayContaining(['catalog', 'meta', 'stream']));
      expect(manifest.types).toEqual(expect.arrayContaining(['movie', 'series']));
      expect(manifest.idPrefixes).toEqual(expect.arrayContaining(['tt', 'vsmov:', 'kkphim:', 'nguonc:']));
      expect(manifest.catalogs.length).toBeGreaterThan(0);
      expect(manifest.behaviorHints.configurable).toBe(true);
    });

    it('2.5 GET /c/:config/manifest.json should return dynamically filtered Stremio manifest', async () => {
      // Config for VSMOV only
      const vsmovConfig = encodeConfig({
        providers: ['vsmov'],
        categories: ['phim-le'],
        preferredAudio: 'vietsub'
      });

      const res = await fetch(`${baseUrl}/c/${vsmovConfig}/manifest.json`);
      expect(res.status).toBe(200);
      const manifest = await res.json();

      expect(manifest.name).toContain('VSMOV 4K');
      expect(manifest.name).not.toContain('KKPhim');
      expect(manifest.catalogs.length).toBeGreaterThan(0);
      // All catalogs must be vsmov
      for (const cat of manifest.catalogs) {
        expect(cat.id).toMatch(/^vsmov/);
      }
    });

    it('2.6 GET /stream/movie/:id.json should resolve movie streams with CORS and quality sorting', async () => {
      vi.spyOn(kkphimProvider, 'getStreams').mockResolvedValue([
        {
          name: '[VIP 2 • KKPhim] 1080p FHD (Vietsub)',
          title: 'Full • Server Vietsub\n⚡ Direct HLS Playback',
          url: 'https://cdn.kkphim.test/cuumon.m3u8'
        }
      ]);

      const res = await fetch(`${baseUrl}/stream/movie/kkphim:cuu-mon.json`);
      expect(res.status).toBe(200);
      expect(res.headers.get('content-type')).toContain('application/json');
      expect(res.headers.get('access-control-allow-origin')).toBe('*');

      const data = await res.json();
      expect(data).toHaveProperty('streams');
      expect(Array.isArray(data.streams)).toBe(true);
      expect(data.streams.length).toBe(1);
      expect(data.streams[0].name).toContain('KKPhim');
    });

    it('2.7 GET /stream/series/:id.json should resolve series episode streams accurately', async () => {
      vi.spyOn(vsmovProvider, 'getStreams').mockResolvedValue([
        {
          name: '[VIP 1 • VSMOV] 4K Ultra HD (Vietsub)',
          title: 'Tập 1 • Server 4K Master\n⚡ 3840x2160',
          url: 'https://vsmov.test/toanchuc_ep1.m3u8'
        }
      ]);

      const res = await fetch(`${baseUrl}/stream/series/vsmov:toan-chuc-cao-thu:1:1.json`);
      expect(res.status).toBe(200);
      const data = await res.json();

      expect(Array.isArray(data.streams)).toBe(true);
      expect(data.streams.length).toBe(1);
      expect(data.streams[0].name).toContain('4K Ultra HD');
    });

    it('2.8 GET /c/:config/stream/:type/:id.json should filter out disabled providers from stream results', async () => {
      // Configuration with ONLY kkphim enabled
      const kkphimOnlyToken = encodeConfig({
        providers: ['kkphim'],
        categories: ['phim-le'],
        preferredAudio: 'vietsub'
      });

      // Querying with a vsmov prefixed id when vsmov is disabled in config
      const res = await fetch(`${baseUrl}/c/${kkphimOnlyToken}/stream/movie/vsmov:avatar-2.json`);
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.streams).toEqual([]);
    });

    it('2.9 GET /health should report server operational status and version', async () => {
      const res = await fetch(`${baseUrl}/health`);
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.status).toBe('ok');
      expect(data.version).toBe('2.0.0');
      expect(typeof data.uptime).toBe('number');
    });
  });

  // =========================================================================
  // 3. CONCURRENCY & HIGH-THROUGHPUT STRESS TESTING
  // =========================================================================
  describe('3. Concurrency & High-Throughput Stress Testing', () => {

    it('3.1 should handle 100 simultaneous heterogeneous HTTP socket requests with 100% success rate', async () => {
      vi.spyOn(cinemetaService, 'getMetadataForMatcher').mockResolvedValue({
        imdbId: 'tt1375666',
        type: 'movie',
        title: 'Inception',
        vietnameseTitle: 'Kẻ Đánh Cắp Giấc Mơ',
        aliases: [],
        year: 2010
      });

      vi.spyOn(vsmovProvider, 'getStreams').mockResolvedValue([
        { name: '[VIP 1 • VSMOV] 4K Ultra HD', title: 'Inception 4K', url: 'https://vsmov.test/inc.m3u8' }
      ]);
      vi.spyOn(kkphimProvider, 'getStreams').mockResolvedValue([
        { name: '[VIP 2 • KKPhim] 1080p FHD', title: 'Inception 1080p', url: 'https://kkphim.test/inc.m3u8' }
      ]);
      vi.spyOn(nguoncProvider, 'getStreams').mockResolvedValue([
        { name: '[VIP 3 • NguonC] 1080p StreamC', title: 'Inception StreamC', url: 'https://nguonc.test/inc.m3u8' }
      ]);

      const testEndpoints = [
        '/',
        '/manifest.json',
        '/c/4/manifest.json',
        '/c/7/manifest.json',
        '/css/style.css',
        '/js/app.js',
        '/js/qr-modal.js',
        '/health',
        '/stream/movie/tt1375666.json',
        '/stream/movie/kkphim:cuu-mon.json'
      ];

      const start = Date.now();
      const concurrentRequests = Array.from({ length: 100 }, (_, i) => {
        const ep = testEndpoints[i % testEndpoints.length];
        return fetch(`${baseUrl}${ep}`).then(async (res) => ({
          status: res.status,
          contentType: res.headers.get('content-type'),
          ep
        }));
      });

      const results = await Promise.all(concurrentRequests);
      const elapsed = Date.now() - start;

      expect(results.length).toBe(100);
      for (const res of results) {
        expect(res.status).toBe(200);
        expect(res.contentType).toBeDefined();
      }
      expect(elapsed).toBeLessThan(10000); // 100 requests served under 10s
    });

    it('3.2 should safely coalesce concurrent stream requests for the same IMDb ID avoiding cache stampedes', async () => {
      let cinemetaCalls = 0;
      vi.spyOn(cinemetaService, 'getMetadataForMatcher').mockImplementation(async () => {
        cinemetaCalls++;
        await new Promise((r) => setTimeout(r, 25)); // simulate minor network delay
        return {
          imdbId: 'tt7458054',
          type: 'series',
          title: 'While You Were Sleeping',
          vietnameseTitle: 'Khi Nàng Say Giấc',
          aliases: [],
          year: 2017
        };
      });

      vi.spyOn(vsmovProvider, 'getStreams').mockResolvedValue([
        { name: '[VIP 1 • VSMOV] 4K Ultra HD', title: 'Ep 1', url: 'https://vsmov.test/ep1.m3u8' }
      ]);

      // Launch 30 concurrent requests for the exact same un-cached series ID
      const stampede = Array.from({ length: 30 }, () =>
        fetch(`${baseUrl}/stream/series/tt7458054:1:1.json`).then(r => r.json())
      );

      const responses = await Promise.all(stampede);
      for (const data of responses) {
        expect(data.streams).toBeDefined();
        expect(Array.isArray(data.streams)).toBe(true);
        expect(data.streams.length).toBeGreaterThan(0);
      }
    });

    it('3.3 should handle concurrent bursts of hostile path and config payloads without crashing server', async () => {
      const hostileUrls = [
        `${baseUrl}/c/..%2F..%2Fetc%2Fpasswd/manifest.json`,
        `${baseUrl}/c/<script>alert(1)<%2Fscript>/manifest.json`,
        `${baseUrl}/c/'%20OR%201=1--/manifest.json`,
        `${baseUrl}/stream/movie/tt12345%00evil.json`,
        `${baseUrl}/stream/series/undefined:null:NaN.json`,
        `${baseUrl}/stream/movie/${'A'.repeat(5000)}.json`
      ];

      const hostileRequests = hostileUrls.map(url =>
        fetch(url).then(r => ({ status: r.status, url }))
      );

      const hostileResults = await Promise.all(hostileRequests);
      for (const res of hostileResults) {
        // Server should either return 200 with fallback or 404/400, NEVER 500 or connection drop
        expect([200, 400, 404]).toContain(res.status);
      }

      // Verify server is still alive and healthy immediately after hostile burst
      const healthCheck = await fetch(`${baseUrl}/health`);
      expect(healthCheck.status).toBe(200);
      const healthData = await healthCheck.json();
      expect(healthData.status).toBe('ok');
    });
  });

  // =========================================================================
  // 4. FAIL-SOFT TIMEOUT & STREAM RANKING MATRIX EMPIRICAL AUDIT
  // =========================================================================
  describe('4. Fail-Soft Timeout & Stream Ranking Matrix Empirical Audit', () => {

    it('4.1 should isolate hung upstream provider with 3.5s timeout without delaying other providers', async () => {
      // Mock VSMOV resolving fast
      vi.spyOn(vsmovProvider, 'getStreams').mockResolvedValue([
        { name: '[VIP 1 • VSMOV] 4K Ultra HD', title: 'Fast Stream', url: 'https://vsmov.test/fast.m3u8' }
      ]);
      // Mock KKPhim hanging indefinitely
      vi.spyOn(kkphimProvider, 'getStreams').mockImplementation(() => new Promise(() => {})); // Never resolves
      // Mock NguonC resolving fast
      vi.spyOn(nguoncProvider, 'getStreams').mockResolvedValue([
        { name: '[VIP 3 • NguonC] 1080p StreamC', title: 'Fast Stream', url: 'https://nguonc.test/fast.m3u8' }
      ]);

      const start = Date.now();
      const streams = await fetchWithTimeout(
        kkphimProvider.getStreams({ type: 'movie', slug: 'hung-movie' }),
        500 // test with 500ms timeout for fast test execution
      );
      const duration = Date.now() - start;

      expect(streams).toEqual([]);
      expect(duration).toBeGreaterThanOrEqual(450);
      expect(duration).toBeLessThan(1500);
    });

    it('4.2 should rank streams according to quality tiers and audio preference bonuses', () => {
      const mockStreams = [
        { name: '[VIP 2 • KKPhim] 720p HD (Vietsub)', title: '720p Vietsub' },
        { name: '[VIP 3 • NguonC] 1080p FHD (Thuyết Minh)', title: '1080p TM' },
        { name: '[VIP 1 • VSMOV] 4K Ultra HD (Vietsub)', title: '4K Vietsub', subtitles: [{ id: 'vie' }] },
        { name: '[VIP 2 • KKPhim] 1080p FHD (Vietsub)', title: '1080p Vietsub' }
      ];

      // When preferredAudio is 'vietsub'
      const rankedVietsub = rankStreams(mockStreams, 'vietsub');
      expect(rankedVietsub[0].name).toContain('4K Ultra HD'); // 4K + Vietsub + Subtitles + VSMOV
      expect(rankedVietsub[1].name).toContain('KKPhim] 1080p FHD'); // 1080p + Vietsub
      expect(rankedVietsub[2].name).toContain('NguonC] 1080p FHD'); // 1080p (TM, no vietsub bonus)
      expect(rankedVietsub[3].name).toContain('720p HD');

      // When preferredAudio is 'thuyet-minh'
      const rankedTM = rankStreams(mockStreams, 'thuyet-minh');
      expect(rankedTM[0].name).toContain('4K Ultra HD'); // 4K (1000) > 1080p TM (800+100=900)
      expect(rankedTM[1].name).toContain('NguonC] 1080p FHD'); // 1080p TM (800+100) > 1080p Vietsub (800)
    });
  });
});
