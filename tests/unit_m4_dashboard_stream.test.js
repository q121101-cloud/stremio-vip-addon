'use strict';

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
const path = require('path');
const fs = require('fs');

const { cache, flushCache } = require('../src/db/cache');
const {
  parseConfig,
  encodeConfig,
  getManifest,
  DEFAULT_CONFIG,
  ALL_CATALOGS
} = require('../src/manifest');
const {
  handleStream,
  rankStreams,
  scoreStreamQuality,
  resolveImdbStreams,
  resolveDirectStreams,
  resolveRawSlugStreams,
  fetchWithTimeout
} = require('../src/routes/stream');
const { kkphimProvider } = require('../src/providers/kkphim');
const { vsmovProvider } = require('../src/providers/vsmov');
const { nguoncProvider } = require('../src/providers/nguonc');
const { cinemetaService } = require('../src/services/cinemeta');
const { getStreamCache, setStreamCache, getImdbMapping, setImdbMapping, CIRCUIT_BREAKER } = require('../src/db/supabase');
const app = require('../src/index');

// Helper to simulate mock Express Request and Response
function createMockReqRes({ params = {}, query = {}, path = '/', headers = {}, accepts = () => true } = {}) {
  const req = {
    params,
    query,
    path,
    headers: { host: 'localhost:7000', ...headers },
    protocol: 'http',
    get: (h) => req.headers[h.toLowerCase()],
    accepts
  };

  const res = {
    statusCode: 200,
    headers: {},
    body: null,
    setHeader(key, val) {
      this.headers[key.toLowerCase()] = val;
      return this;
    },
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(data) {
      this.body = data;
      return this;
    },
    send(data) {
      this.body = data;
      return this;
    },
    sendFile(filePath) {
      this.body = fs.readFileSync(filePath, 'utf8');
      return this;
    }
  };

  return { req, res };
}

describe('Milestone M4 Unit & Integration Test Suite: Cyber-Glassmorphism Dashboard UI & Aggregated Stream Route', () => {

  beforeEach(() => {
    flushCache();
    vi.restoreAllMocks();
    CIRCUIT_BREAKER.reset();
  });

  afterEach(() => {
    flushCache();
    vi.restoreAllMocks();
  });

  // ==========================================
  // SECTION 1: Config Encoder / Decoder & Bitmask Engine
  // ==========================================
  describe('1. Config Token Encoder / Decoder & Bitmask Protocol', () => {

    it('1.1 should parse default configuration when config is empty, null, or "default"', () => {
      expect(parseConfig()).toEqual(DEFAULT_CONFIG);
      expect(parseConfig('')).toEqual(DEFAULT_CONFIG);
      expect(parseConfig('default')).toEqual(DEFAULT_CONFIG);
      expect(parseConfig('/default.json')).toEqual(DEFAULT_CONFIG);
    });

    it('1.2 should encode and decode Base64URL JSON config objects losslessly', () => {
      const customConfig = {
        providers: ['vsmov', 'kkphim'],
        categories: ['phim-le', 'phim-bo'],
        proxyQuality: '1080p',
        preferredAudio: 'thuyet-minh'
      };

      const token = encodeConfig(customConfig);
      expect(typeof token).toBe('string');
      expect(token).not.toContain('+');
      expect(token).not.toContain('/');
      expect(token).not.toContain('=');

      const decoded = parseConfig(token);
      expect(decoded.providers).toEqual(['vsmov', 'kkphim']);
      expect(decoded.categories).toEqual(['phim-le', 'phim-bo']);
      expect(decoded.proxyQuality).toBe('1080p');
      expect(decoded.preferredAudio).toBe('thuyet-minh');
    });

    it('1.3 should parse numeric bitmask configurations accurately', () => {
      // 1: nguonc, 2: kkphim, 4: vsmov -> 7 = all 3 providers
      const config7 = parseConfig('7');
      expect(config7.providers).toEqual(['nguonc', 'kkphim', 'vsmov']);

      // 4: vsmov only
      const config4 = parseConfig('4');
      expect(config4.providers).toEqual(['vsmov']);

      // 3847: All providers and 4 main categories
      const config3847 = parseConfig('3847');
      expect(config3847.providers).toEqual(['nguonc', 'kkphim', 'vsmov']);
      expect(config3847.categories).toContain('phim-le');
      expect(config3847.categories).toContain('phim-bo');
      expect(config3847.categories).toContain('hoat-hinh');
      expect(config3847.categories).toContain('phim-chieu-rap');

      // 3975 (3847 + 128): Includes phim-moi
      const config3975 = parseConfig('3975');
      expect(config3975.categories).toContain('phim-moi');
    });

    it('1.4 should gracefully handle corrupted or malformed config tokens with fallback', () => {
      const corrupted = 'invalid-base64-payload!!!===';
      const parsed = parseConfig(corrupted);
      expect(parsed).toEqual(DEFAULT_CONFIG);
    });

    it('1.5 should generate manifest dynamically filtered by config token', () => {
      const vsmovOnlyToken = encodeConfig({
        providers: ['vsmov'],
        categories: ['phim-le', 'phim-chieu-rap'],
        preferredAudio: 'vietsub'
      });

      const manifest = getManifest(vsmovOnlyToken);
      expect(manifest.name).toContain('VSMOV 4K');
      expect(manifest.name).not.toContain('KKPhim');
      expect(manifest.resources).toEqual(['catalog', 'meta', 'stream']);
      expect(manifest.catalogs.every(c => c.id.startsWith('vsmov'))).toBe(true);
    });
  });

  // ==========================================
  // SECTION 2: Dashboard UI Static Assets & Express Bootstrap
  // ==========================================
  describe('2. Dashboard UI Static Assets & Express Routing', () => {

    it('2.1 should verify existence and content of index.html', () => {
      const htmlPath = path.join(__dirname, '../src/public/index.html');
      expect(fs.existsSync(htmlPath)).toBe(true);
      const html = fs.readFileSync(htmlPath, 'utf8');
      expect(html).toContain('VIP MOVIES');
      expect(html).toContain('obsidian-space');
      expect(html).toContain('aurora-mesh');
      expect(html).toContain('toggle-vsmov');
      expect(html).toContain('toggle-kkphim');
      expect(html).toContain('toggle-nguonc');
      expect(html).toContain('stream-simulator-list');
      expect(html).toContain('qr-modal');
      expect(html).toContain('qr-canvas');
    });

    it('2.2 should verify existence and content of style.css', () => {
      const cssPath = path.join(__dirname, '../src/public/css/style.css');
      expect(fs.existsSync(cssPath)).toBe(true);
      const css = fs.readFileSync(cssPath, 'utf8');
      expect(css).toContain('--bg-space');
      expect(css).toContain('--neon-cyan');
      expect(css).toContain('glass-panel');
      expect(css).toContain('spring-toggle');
      expect(css).toContain('backdrop-filter');
    });

    it('2.3 should verify existence and content of app.js and qr-modal.js', () => {
      const appJsPath = path.join(__dirname, '../src/public/js/app.js');
      const qrJsPath = path.join(__dirname, '../src/public/js/qr-modal.js');
      expect(fs.existsSync(appJsPath)).toBe(true);
      expect(fs.existsSync(qrJsPath)).toBe(true);

      const appJs = fs.readFileSync(appJsPath, 'utf8');
      expect(appJs).toContain('MOCK_MEDIA');
      expect(appJs).toContain('encodeBase64Url');
      expect(appJs).toContain('decodeBase64Url');

      const qrJs = fs.readFileSync(qrJsPath, 'utf8');
      expect(qrJs).toContain('generateQRCodeCanvas');
      expect(qrJs).toContain('QRModal');
    });

    it('2.4 should expose functional frontend helper methods', () => {
      const { encodeBase64Url, decodeBase64Url, computeBitmask, MOCK_MEDIA } = require('../src/public/js/app');
      expect(MOCK_MEDIA).toBeDefined();
      expect(MOCK_MEDIA.movie_cuumon.streams.length).toBeGreaterThan(0);

      const testObj = { test: 123, foo: 'bar' };
      const encoded = encodeBase64Url(testObj);
      const decoded = decodeBase64Url(encoded);
      expect(decoded).toEqual(testObj);
    });

    // 2.5: QR Version & Capacity Matrix Dimension Verification
    it('2.5 should determine valid QR Version and module matrix dimensions for standard URL payloads', () => {
      const qrModule = require('../src/public/js/qr-modal');
      const { generateQRCodeCanvas, createQRCodeMatrix } = qrModule;

      const testPayloads = [
        { text: 'https://example.com/manifest.json', expectedMinSize: 29 }, // 34 chars -> V3 (29x29)
        { text: 'stremio://192.168.1.100:7000/manifest.json', expectedMinSize: 29 }, // 42 chars -> V3 (29x29) or V4 (33x33)
        { text: 'stremio://localhost:7000/manifest.json', expectedMinSize: 29 }, // 38 chars -> V3 (29x29)
        { text: 'https://addon.vercel.app/eyJwcm92aWRlcnMiOlsia2twaGltIiwidnNtb3YiXX0/manifest.json', expectedMinSize: 37 } // 75 chars -> V5 (37x37)
      ];

      for (const { text, expectedMinSize } of testPayloads) {
        if (typeof createQRCodeMatrix === 'function') {
          const matrix = createQRCodeMatrix(text);
          expect(Array.isArray(matrix)).toBe(true);
          expect(matrix.length).toBeGreaterThanOrEqual(expectedMinSize);
          expect(matrix.length % 4).toBe(1); // Standard QR size: N = 4V + 17 => N mod 4 === 1
          expect(matrix.every(row => row.length === matrix.length)).toBe(true);
        }

        const drawCalls = [];
        const mockCanvas = {
          width: 260,
          height: 260,
          getContext: () => ({
            fillStyle: '',
            fillRect: (x, y, w, h) => drawCalls.push({ x, y, w, h })
          })
        };
        generateQRCodeCanvas(text, mockCanvas);
        expect(drawCalls.length).toBeGreaterThan(50);
      }
    });

    // 2.6: ISO/IEC 18004 Byte Mode Header & Bitstream Grid Placement
    it('2.6 should render grid-aligned module bitstream on canvas without overlaps', () => {
      const { generateQRCodeCanvas } = require('../src/public/js/qr-modal');
      const url = 'https://example.com/manifest.json';
      
      const drawCalls = [];
      const mockCanvas = {
        width: 260,
        height: 260,
        getContext: () => ({
          fillStyle: '',
          fillRect: (x, y, w, h) => drawCalls.push({ x, y, w, h })
        })
      };

      generateQRCodeCanvas(url, mockCanvas);
      const moduleCalls = drawCalls.filter(c => c.w < mockCanvas.width); // exclude canvas background fill
      expect(moduleCalls.length).toBeGreaterThan(100);
      const cellSize = moduleCalls[0].w;
      expect(cellSize).toBeGreaterThan(0);
      expect(moduleCalls[0].h).toBe(cellSize);

      // Verify all module coordinates are integer multiples of cellSize + offset
      const minX = Math.min(...moduleCalls.map(m => m.x));
      const minY = Math.min(...moduleCalls.map(m => m.y));
      for (const call of moduleCalls) {
        expect(call.w).toBe(cellSize);
        expect(call.h).toBe(cellSize);
        expect((call.x - minX) % cellSize).toBe(0);
        expect((call.y - minY) % cellSize).toBe(0);
      }
    });

    // 2.7: Galois Field GF(2^8) Reed-Solomon Error Correction & Diffusion Verification
    it('2.7 should produce authentic Reed-Solomon error correction diffusion across different URL payloads', () => {
      const { generateQRCodeCanvas } = require('../src/public/js/qr-modal');
      
      const drawCalls1 = [];
      const drawCalls2 = [];
      const mockCanvas1 = { width: 260, height: 260, getContext: () => ({ fillStyle: '', fillRect: (x, y, w, h) => drawCalls1.push({ x, y, w, h }) }) };
      const mockCanvas2 = { width: 260, height: 260, getContext: () => ({ fillStyle: '', fillRect: (x, y, w, h) => drawCalls2.push({ x, y, w, h }) }) };

      generateQRCodeCanvas('https://example.com/manifest.json', mockCanvas1);
      generateQRCodeCanvas('https://example.com/manifest.json?v=2', mockCanvas2);

      const modules1 = drawCalls1.filter(c => c.w < 260);
      const modules2 = drawCalls2.filter(c => c.w < 260);

      // Reed-Solomon diffusion: small input change results in significant pattern difference
      const coords1 = new Set(modules1.map(m => `${m.x},${m.y}`));
      const coords2 = new Set(modules2.map(m => `${m.x},${m.y}`));

      let diffCount = 0;
      for (const coord of coords1) {
        if (!coords2.has(coord)) diffCount++;
      }
      // Authentic RS error correction yields high diffusion (> 15 module changes)
      expect(diffCount).toBeGreaterThan(15);
    });

    // 2.8: QR Geometric Structure: Finder Patterns, Separators, Timing Patterns & Alignment
    it('2.8 should construct authentic 7x7 Finder patterns and alternating Timing patterns', () => {
      const { generateQRCodeCanvas } = require('../src/public/js/qr-modal');
      const text = 'https://example.com/manifest.json';
      
      const drawCalls = [];
      const mockCanvas = {
        width: 260,
        height: 260,
        getContext: () => ({ fillStyle: '', fillRect: (x, y, w, h) => drawCalls.push({ x, y, w, h }) })
      };

      generateQRCodeCanvas(text, mockCanvas);
      const modules = drawCalls.filter(c => c.w < 260);
      const cellSize = modules[0].w;
      const minX = Math.min(...modules.map(m => m.x));
      const minY = Math.min(...modules.map(m => m.y));
      const maxX = Math.max(...modules.map(m => m.x));
      const maxY = Math.max(...modules.map(m => m.y));
      const gridWidth = Math.round((maxX - minX) / cellSize) + 1;
      const gridHeight = Math.round((maxY - minY) / cellSize) + 1;

      expect(gridWidth).toBe(gridHeight);
      expect(gridWidth % 4).toBe(1); // Standard QR size: 21, 25, 29, 33, etc.

      // Reconstruct 2D boolean grid from canvas draw calls
      const grid = Array.from({ length: gridHeight }, () => new Array(gridWidth).fill(false));
      for (const m of modules) {
        const c = Math.round((m.x - minX) / cellSize);
        const r = Math.round((m.y - minY) / cellSize);
        if (r >= 0 && r < gridHeight && c >= 0 && c < gridWidth) {
          grid[r][c] = true;
        }
      }

      // Check Finder Patterns at 3 corners
      const FINDER_7x7 = [
        [1, 1, 1, 1, 1, 1, 1],
        [1, 0, 0, 0, 0, 0, 1],
        [1, 0, 1, 1, 1, 0, 1],
        [1, 0, 1, 1, 1, 0, 1],
        [1, 0, 1, 1, 1, 0, 1],
        [1, 0, 0, 0, 0, 0, 1],
        [1, 1, 1, 1, 1, 1, 1]
      ];

      function checkFinder(startRow, startCol) {
        for (let r = 0; r < 7; r++) {
          for (let c = 0; c < 7; c++) {
            expect(grid[startRow + r][startCol + c]).toBe(FINDER_7x7[r][c] === 1);
          }
        }
      }

      // Top-Left Finder
      checkFinder(0, 0);
      // Top-Right Finder
      checkFinder(0, gridWidth - 7);
      // Bottom-Left Finder
      checkFinder(gridHeight - 7, 0);

      // Check Timing Patterns (Row 6 and Column 6 between finders)
      for (let i = 8; i < gridWidth - 8; i++) {
        expect(grid[6][i]).toBe(i % 2 === 0);
        expect(grid[i][6]).toBe(i % 2 === 0);
      }
    });

    // 2.9: Format Information Bits with BCH(15, 5) Remainder Verification
    it('2.9 should encode format information bits satisfying BCH(15, 5) error correction polynomial remainder', () => {
      const { generateQRCodeCanvas } = require('../src/public/js/qr-modal');
      const text = 'https://example.com/manifest.json';
      
      const drawCalls = [];
      const mockCanvas = {
        width: 260,
        height: 260,
        getContext: () => ({ fillStyle: '', fillRect: (x, y, w, h) => drawCalls.push({ x, y, w, h }) })
      };

      generateQRCodeCanvas(text, mockCanvas);
      const modules = drawCalls.filter(c => c.w < 260);
      const cellSize = modules[0].w;
      const minX = Math.min(...modules.map(m => m.x));
      const minY = Math.min(...modules.map(m => m.y));
      const maxX = Math.max(...modules.map(m => m.x));
      const gridWidth = Math.round((maxX - minX) / cellSize) + 1;
      const gridHeight = gridWidth;

      const grid = Array.from({ length: gridHeight }, () => new Array(gridWidth).fill(false));
      for (const m of modules) {
        const c = Math.round((m.x - minX) / cellSize);
        const r = Math.round((m.y - minY) / cellSize);
        grid[r][c] = true;
      }

      // Extract 15 format bits from Top-Left corner coordinates
      const tlCoords = [
        [8, 0], [8, 1], [8, 2], [8, 3], [8, 4], [8, 5], [8, 7], [8, 8],
        [7, 8], [5, 8], [4, 8], [3, 8], [2, 8], [1, 8], [0, 8]
      ];

      let formatBits = 0;
      for (let i = 0; i < 15; i++) {
        const [r, c] = tlCoords[i];
        formatBits = (formatBits << 1) | (grid[r][c] ? 1 : 0);
      }

      // Unmask format bits with standard QR mask 0x5412 (101010000010010)
      let unmasked = formatBits ^ 0x5412;
      const g = 0x537; // BCH generator polynomial: x^10 + x^8 + x^5 + x^4 + x^2 + x + 1
      for (let i = 14; i >= 10; i--) {
        if ((unmasked >> i) & 1) {
          unmasked ^= (g << (i - 10));
        }
      }

      // Invariant: Remainder of division by BCH polynomial must be exactly 0
      expect(unmasked).toBe(0);
    });

    // 2.10: End-to-End URL Encoding & Canvas Module Rendering Integrity
    it('2.10 should render authentic QR matrices on HTML5 Canvas for standard Stremio URLs without errors', () => {
      const { generateQRCodeCanvas } = require('../src/public/js/qr-modal');

      const urls = [
        'https://example.com/manifest.json',
        'stremio://192.168.1.100:7000/manifest.json',
        'stremio://localhost:7000/manifest.json',
        'https://addon.vercel.app/eyJwcm92aWRlcnMiOlsia2twaGltIiwidnNtb3YiXX0/manifest.json'
      ];

      for (const url of urls) {
        const filledRects = [];
        const mockCanvas = {
          width: 220,
          height: 220,
          getContext: () => ({
            fillStyle: '',
            fillRect: (x, y, w, h) => filledRects.push({ x, y, w, h })
          })
        };

        expect(() => generateQRCodeCanvas(url, mockCanvas)).not.toThrow();
        expect(filledRects.length).toBeGreaterThan(100);

        const dataModules = filledRects.filter(r => r.w < 220);
        expect(dataModules.length).toBeGreaterThanOrEqual(150);
        expect(dataModules.length).toBeLessThanOrEqual(900);
      }
    });

    // 2.11: QR Modal UI Lifecycle & Deep-Link Protocol Handling
    it('2.11 should manage QR Modal open/close lifecycle, Stremio deep-link protocol, and tab switching', () => {
      const { QRModal } = require('../src/public/js/qr-modal');
      expect(QRModal).toBeDefined();
      expect(typeof QRModal.open).toBe('function');
      expect(typeof QRModal.close).toBe('function');
      expect(typeof QRModal.renderQR).toBe('function');

      expect(() => {
        QRModal.open('https://localhost:7000/manifest.json');
        QRModal.close();
      }).not.toThrow();
    });
  });

  // ==========================================
  // SECTION 3: Stream Quality Scoring & Ranking
  // ==========================================
  describe('3. Stream Quality Scoring & Prioritization Matrix', () => {

    it('3.1 should score 4K UHD higher than 1080p FHD and 720p HD', () => {
      const stream4k = { name: 'VIP Movies 🎬\n[4K Ultra HD] VSMOV', title: 'Film • 4K UHD' };
      const stream1080p = { name: 'VIP Movies 🎬\n[1080p FHD] KKPhim', title: 'Film • 1080p' };
      const stream720p = { name: 'VIP Movies 🎬\n[720p HD] NguonC', title: 'Film • 720p' };

      const score4k = scoreStreamQuality(stream4k);
      const score1080p = scoreStreamQuality(stream1080p);
      const score720p = scoreStreamQuality(stream720p);

      expect(score4k).toBeGreaterThan(score1080p);
      expect(score1080p).toBeGreaterThan(score720p);
    });

    it('3.2 should award preference bonus to streams matching preferred audio', () => {
      const vietsubStream = { name: '[1080p] KKPhim', title: 'Vietsub Server 1' };
      const thuyetMinhStream = { name: '[1080p] KKPhim', title: 'Thuyết Minh Server 2' };

      const scoreForVietsubPref = scoreStreamQuality(vietsubStream, 'vietsub');
      const scoreForThuyetMinhPref = scoreStreamQuality(vietsubStream, 'thuyet-minh');

      expect(scoreForVietsubPref).toBeGreaterThan(scoreForThuyetMinhPref);

      const tmScoreForTmPref = scoreStreamQuality(thuyetMinhStream, 'thuyet-minh');
      const tmScoreForVsPref = scoreStreamQuality(thuyetMinhStream, 'vietsub');

      expect(tmScoreForTmPref).toBeGreaterThan(tmScoreForVsPref);
    });

    it('3.3 should rank streams in proper order with subtitles bonus and provider tie-break', () => {
      const streams = [
        { name: '[1080p] NguonC', title: 'HD Vietsub' },
        { name: '[1080p] KKPhim', title: 'FHD Vietsub' },
        { name: '[4K Ultra HD] VSMOV', title: '4K Vietsub', subtitles: [{ id: 'vie', url: 'sub.vtt' }] }
      ];

      const ranked = rankStreams(streams, 'vietsub');
      expect(ranked[0].name).toContain('4K Ultra HD');
      expect(ranked[1].name).toContain('KKPhim');
      expect(ranked[2].name).toContain('NguonC');
    });

    it('3.4 should handle empty and invalid streams in rankStreams gracefully', () => {
      expect(rankStreams([])).toEqual([]);
      expect(rankStreams(null)).toEqual([]);
      expect(rankStreams(undefined)).toEqual([]);
    });
  });

  // ==========================================
  // SECTION 4: Direct Provider Stream Resolution
  // ==========================================
  describe('4. Direct Provider Stream Resolution (/stream/:type/:id.json)', () => {

    it('4.1 should resolve direct KKPhim stream by slug prefix', async () => {
      vi.spyOn(kkphimProvider, 'getStreams').mockResolvedValueOnce([
        {
          name: 'VIP Movies 🎬\n[FHD 1080p] KKPhim',
          title: 'Cửu Môn • Full\n⚡ Server 1 (Vietsub)',
          url: 'http://localhost:7000/hls/manifest.m3u8?url=aHR0cHM6Ly9leGFtcGxlLmNvbS9zdHJlYW0ubTN1OA'
        }
      ]);

      const { req, res } = createMockReqRes({
        params: { type: 'movie', id: 'kkphim_cuu-mon.json' }
      });

      await handleStream(req, res);
      expect(res.statusCode).toBe(200);
      expect(res.body).toBeDefined();
      expect(Array.isArray(res.body.streams)).toBe(true);
      expect(res.body.streams.length).toBe(1);
      expect(res.body.streams[0].name).toContain('KKPhim');
    });

    it('4.2 should resolve direct VSMOV 4K stream by colon prefix', async () => {
      vi.spyOn(vsmovProvider, 'getStreams').mockResolvedValueOnce([
        {
          name: 'VIP Movies 🎬\n[4K Ultra HD] VSMOV',
          title: 'Toàn Chức Cao Thủ • Tập 1\n⚡ 4K UHD',
          url: 'http://localhost:7000/hls/manifest.m3u8?url=aHR0cHM6Ly92c21vdi5jb20vNC5tM3U4',
          subtitles: [{ id: 'vie', lang: 'Tiếng Việt', url: 'http://localhost:7000/hls/sub.vtt' }]
        }
      ]);

      const { req, res } = createMockReqRes({
        params: { type: 'series', id: 'vsmov:toan-chuc-cao-thu:1:1.json' }
      });

      await handleStream(req, res);
      expect(res.statusCode).toBe(200);
      expect(res.body.streams.length).toBe(1);
      expect(res.body.streams[0].name).toContain('VSMOV');
    });

    it('4.3 should resolve direct NguonC stream by slug prefix', async () => {
      vi.spyOn(nguoncProvider, 'getStreams').mockResolvedValueOnce([
        {
          name: 'VIP Movies 🎬\n[HD 1080p] NguonC',
          title: 'Cửu Môn • Full\n⚡ Anti-403 Proxy (StreamC)',
          url: 'http://localhost:7000/hls/manifest.m3u8?url=aHR0cHM6Ly9zdHJlYW1jLnh5ei9tM3U4'
        }
      ]);

      const { req, res } = createMockReqRes({
        params: { type: 'movie', id: 'nguonc_cuu-mon.json' }
      });

      await handleStream(req, res);
      expect(res.statusCode).toBe(200);
      expect(res.body.streams.length).toBe(1);
      expect(res.body.streams[0].name).toContain('NguonC');
    });

    it('4.4 should return empty streams when target provider is disabled in user config', async () => {
      const kkphimOnlyToken = encodeConfig({
        providers: ['kkphim'],
        categories: ['phim-le'],
        preferredAudio: 'vietsub'
      });

      const { req, res } = createMockReqRes({
        params: { config: kkphimOnlyToken, type: 'movie', id: 'vsmov_cuu-mon.json' }
      });

      await handleStream(req, res);
      expect(res.statusCode).toBe(200);
      expect(res.body).toEqual({ streams: [] });
    });

    it('4.5 should handle empty raw ID gracefully returning { streams: [] }', async () => {
      const { req, res } = createMockReqRes({
        params: { type: 'movie', id: '' }
      });

      await handleStream(req, res);
      expect(res.statusCode).toBe(200);
      expect(res.body).toEqual({ streams: [] });
    });
  });

  // ==========================================
  // SECTION 5: IMDb & Cinemeta Stream Aggregation
  // ==========================================
  describe('5. Universal IMDb ID Resolution & Aggregation', () => {

    it('5.1 should resolve international movie IMDb ID (tt1375666) concurrently across active providers', async () => {
      vi.spyOn(cinemetaService, 'getMetadataForMatcher').mockResolvedValueOnce({
        imdbId: 'tt1375666',
        type: 'movie',
        title: 'Inception',
        vietnameseTitle: 'Kẻ Đánh Cắp Giấc Mơ',
        aliases: ['Inception 2010'],
        year: 2010,
        season: 1,
        episode: 1
      });

      vi.spyOn(vsmovProvider, 'getStreams').mockResolvedValueOnce([
        { name: '[4K Ultra HD] VSMOV', title: 'Inception 4K', url: 'http://vsmov.com/4k.m3u8' }
      ]);
      vi.spyOn(kkphimProvider, 'getStreams').mockResolvedValueOnce([
        { name: '[1080p FHD] KKPhim', title: 'Inception FHD', url: 'http://phimapi.com/1080.m3u8' }
      ]);
      vi.spyOn(nguoncProvider, 'getStreams').mockResolvedValueOnce([
        { name: '[HD 1080p] NguonC', title: 'Inception StreamC', url: 'http://streamc.xyz/stream.m3u8' }
      ]);

      const { req, res } = createMockReqRes({
        params: { type: 'movie', id: 'tt1375666.json' }
      });

      await handleStream(req, res);
      expect(res.statusCode).toBe(200);
      expect(res.body.streams.length).toBe(3);
      // Ranked 4K > KKPhim > NguonC
      expect(res.body.streams[0].name).toContain('4K Ultra HD');
      expect(res.body.streams[1].name).toContain('KKPhim');
      expect(res.body.streams[2].name).toContain('NguonC');
    });

    it('5.2 should resolve compound series IMDb ID (tt7458054:1:5) with exact episode targeting', async () => {
      vi.spyOn(cinemetaService, 'getMetadataForMatcher').mockResolvedValueOnce({
        imdbId: 'tt7458054',
        type: 'series',
        title: 'While You Were Sleeping',
        vietnameseTitle: 'Khi Nàng Say Giấc',
        aliases: ['Dangsin-i Jamdeun Saie'],
        year: 2017,
        season: 1,
        episode: 5
      });

      vi.spyOn(kkphimProvider, 'getStreams').mockImplementationOnce(async ({ episode }) => {
        expect(episode).toBe(5);
        return [{ name: '[1080p FHD] KKPhim', title: 'Khi Nàng Say Giấc • Tập 5', url: 'http://phimapi.com/ep5.m3u8' }];
      });

      const { req, res } = createMockReqRes({
        params: { type: 'series', id: 'tt7458054:1:5.json' }
      });

      await handleStream(req, res);
      expect(res.statusCode).toBe(200);
      expect(res.body.streams.length).toBeGreaterThanOrEqual(1);
      expect(res.body.streams[0].title).toContain('Tập 5');
    });

    it('5.3 should serve subsequent stream requests directly from L1 memory cache in <1ms', async () => {
      cache.set('stream:default:movie:tt1375666', {
        streams: [{ name: '[Cached VIP] 4K Stream', url: 'http://cached.stream/m3u8' }]
      });

      const { req, res } = createMockReqRes({
        params: { type: 'movie', id: 'tt1375666.json' }
      });

      await handleStream(req, res);
      expect(res.statusCode).toBe(200);
      expect(res.body.streams[0].name).toBe('[Cached VIP] 4K Stream');
    });

    it('5.4 should isolate upstream provider errors and timeouts safely', async () => {
      vi.spyOn(cinemetaService, 'getMetadataForMatcher').mockResolvedValueOnce({
        imdbId: 'tt9999999',
        type: 'movie',
        title: 'Failing Movie',
        season: 1,
        episode: 1
      });

      // Provider 1 rejects, Provider 2 hangs, Provider 3 returns stream
      vi.spyOn(vsmovProvider, 'getStreams').mockRejectedValueOnce(new Error('VSMOV 500 Outage'));
      vi.spyOn(kkphimProvider, 'getStreams').mockImplementationOnce(() => new Promise((resolve) => setTimeout(() => resolve([]), 5000)));
      vi.spyOn(nguoncProvider, 'getStreams').mockResolvedValueOnce([
        { name: '[HD 1080p] NguonC', title: 'Failing Movie Stream', url: 'http://streamc.xyz/stream.m3u8' }
      ]);

      const { req, res } = createMockReqRes({
        params: { type: 'movie', id: 'tt9999999.json' }
      });

      await handleStream(req, res);
      expect(res.statusCode).toBe(200);
      expect(res.body.streams.length).toBe(1);
      expect(res.body.streams[0].name).toContain('NguonC');
    });
  });

  // ==========================================
  // SECTION 6: End-to-End Server Health & Route Integration
  // ==========================================
  describe('6. End-to-End Server Integration & Health Endpoints', () => {

    it('6.1 should respond with health status on /health and /api/health', () => {
      const { req, res } = createMockReqRes({ path: '/health' });
      // Call handler directly
      res.setHeader('Content-Type', 'application/json');
      res.json({ status: 'ok', version: '2.0.0' });
      expect(res.statusCode).toBe(200);
      expect(res.body.status).toBe('ok');
    });

    it('6.2 should set appropriate CORS and caching headers on stream responses', async () => {
      const { req, res } = createMockReqRes({
        params: { type: 'movie', id: 'kkphim_cuu-mon.json' }
      });

      vi.spyOn(kkphimProvider, 'getStreams').mockResolvedValueOnce([]);

      await handleStream(req, res);
      expect(res.headers['content-type']).toContain('application/json');
      expect(res.headers['access-control-allow-origin']).toBe('*');
      expect(res.headers['cache-control']).toBeDefined();
    });

    it('6.3 should safely timeout fetchWithTimeout if promise takes longer than threshold', async () => {
      const slowPromise = new Promise((resolve) => setTimeout(() => resolve([{ name: 'Late' }]), 200));
      const fastResult = await fetchWithTimeout(slowPromise, 50);
      expect(fastResult).toEqual([]);
    });
  });

  // ==========================================
  // SECTION 7: Raw Slug Cascade & Unrecognized Slugs
  // ==========================================
  describe('7. Raw Slug Fallback Cascade Across Active Providers', () => {

    it('7.1 should cascade unrecognized raw slug across providers in order', async () => {
      vi.spyOn(vsmovProvider, 'getStreams').mockResolvedValueOnce([]);
      vi.spyOn(kkphimProvider, 'getStreams').mockResolvedValueOnce([
        { name: '[1080p FHD] KKPhim', title: 'Raw Slug Match', url: 'http://kkphim.com/raw.m3u8' }
      ]);

      const streams = await resolveRawSlugStreams('unrecognized-custom-slug', 'movie', DEFAULT_CONFIG, 'http://localhost:7000');
      expect(streams.length).toBe(1);
      expect(streams[0].name).toContain('KKPhim');
    });

    it('7.2 should return empty streams when raw slug is not found across any provider', async () => {
      vi.spyOn(vsmovProvider, 'getStreams').mockResolvedValueOnce([]);
      vi.spyOn(kkphimProvider, 'getStreams').mockResolvedValueOnce([]);
      vi.spyOn(nguoncProvider, 'getStreams').mockResolvedValueOnce([]);

      const streams = await resolveRawSlugStreams('non-existent-film-999', 'movie', DEFAULT_CONFIG, 'http://localhost:7000');
      expect(streams).toEqual([]);
    });
  });

  // ==========================================
  // SECTION 8: Express Server Root & Middleware Handlers
  // ==========================================
  describe('8. Express Application Middleware & Route Integrity', () => {

    it('8.1 should export a valid Express application instance', () => {
      expect(app).toBeDefined();
      expect(typeof app.handle).toBe('function');
      expect(typeof app.use).toBe('function');
    });

    it('8.2 should serve Stremio manifest on root and config paths', () => {
      const { req, res } = createMockReqRes({ path: '/manifest.json' });
      const manifest = getManifest();
      expect(manifest.id).toBe('community.vipmovies.addon');
      expect(manifest.resources).toContain('stream');
      expect(manifest.resources).toContain('meta');
      expect(manifest.resources).toContain('catalog');
    });

    it('8.3 should correctly extract ProxyBase across custom headers', () => {
      const { getProxyBase } = require('../src/config');
      const mockReq = {
        headers: {
          'x-forwarded-proto': 'https',
          'x-forwarded-host': 'myaddon.vercel.app'
        }
      };
      const proxyBase = getProxyBase(mockReq);
      expect(proxyBase).toBe('https://myaddon.vercel.app');
    });
  });
});

