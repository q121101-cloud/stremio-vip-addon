'use strict';

const express = require('express');
const axios = require('axios');
const { getProxyBase, TIMEOUTS } = require('../config');

const router = express.Router();

const DEFAULT_USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

/**
 * Universal CORS middleware for all HLS proxy routes
 */
router.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Range, Origin, Referer, Accept, User-Agent, Content-Type');
  res.setHeader('Access-Control-Expose-Headers', 'Content-Length, Content-Range, Accept-Ranges, ETag, Cache-Control');
  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }
  next();
});

/**
 * Encodes a string or URL to URL-safe Base64 (base64url)
 * @param {string} str
 * @returns {string}
 */
function encodeParam(str) {
  if (!str || typeof str !== 'string') return '';
  return Buffer.from(str, 'utf8')
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

/**
 * Resilient Base64 / Base64URL / URI-encoded parameter decoder
 * @param {string} param
 * @returns {string}
 */
function decodeParam(param) {
  if (!param || typeof param !== 'string') return '';
  const trimmed = param.trim();

  // Already a plain HTTP/HTTPS URL or root-relative path
  if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
    return trimmed;
  }

  // Attempt Base64 / Base64URL decoding
  try {
    let normalized = trimmed.replace(/-/g, '+').replace(/_/g, '/');
    while (normalized.length % 4 !== 0) {
      normalized += '=';
    }
    const decoded = Buffer.from(normalized, 'base64').toString('utf8');
    if (
      decoded.startsWith('http://') ||
      decoded.startsWith('https://') ||
      decoded.startsWith('/') ||
      decoded.includes('://')
    ) {
      return decoded;
    }
  } catch (_) {}

  // Attempt URI decoding
  try {
    const uriDecoded = decodeURIComponent(trimmed);
    if (uriDecoded.startsWith('http://') || uriDecoded.startsWith('https://')) {
      return uriDecoded;
    }
  } catch (_) {}

  return trimmed;
}

/**
 * Resolves a relative or absolute target URI against a base URL (RFC 3986)
 * @param {string} targetUri
 * @param {string} baseUrl
 * @returns {string}
 */
function resolveUrl(targetUri, baseUrl) {
  if (!targetUri || typeof targetUri !== 'string') return '';
  const trimmed = targetUri.trim();

  if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
    return trimmed;
  }

  if (trimmed.startsWith('//')) {
    try {
      const baseProto = baseUrl ? new URL(baseUrl).protocol : 'https:';
      return `${baseProto}${trimmed}`;
    } catch (_) {
      return `https:${trimmed}`;
    }
  }

  try {
    return new URL(trimmed, baseUrl).href;
  } catch (_) {
    return trimmed;
  }
}

/**
 * Checks if a hostname belongs to private / loopback / cloud metadata IP ranges (SSRF protection)
 * @param {string} hostname
 * @returns {boolean}
 */
function isPrivateHost(hostname) {
  if (!hostname) return true;
  const h = hostname.toLowerCase().trim();
  if (
    h === 'localhost' ||
    h === '127.0.0.1' ||
    h === '::1' ||
    h === '[::1]' ||
    h === '0.0.0.0' ||
    h === '169.254.169.254'
  ) {
    return true;
  }
  if (/^127\.\d+\.\d+\.\d+$/.test(h)) return true;
  if (/^10\.\d+\.\d+\.\d+$/.test(h)) return true;
  if (/^192\.168\.\d+\.\d+$/.test(h)) return true;
  if (/^172\.(1[6-9]|2\d|3[0-1])\.\d+\.\d+$/.test(h)) return true;
  if (/^169\.254\.\d+\.\d+$/.test(h)) return true;
  if (h.endsWith('.local') || h.endsWith('.internal')) return true;
  return false;
}

/**
 * Validates and sanitizes target stream URLs against malicious input & SSRF
 * @param {string} rawUrl
 * @param {boolean} [allowPrivate=false]
 * @returns {{ valid: boolean, url?: string, error?: string }}
 */
function validateTargetUrl(rawUrl, allowPrivate = false) {
  if (!rawUrl || typeof rawUrl !== 'string') {
    return { valid: false, error: "Missing required 'url' parameter" };
  }

  const decoded = decodeParam(rawUrl);
  if (!decoded || !/^https?:\/\//i.test(decoded)) {
    return {
      valid: false,
      error: 'Invalid target URL scheme. Only HTTP and HTTPS URLs are permitted.'
    };
  }

  try {
    const parsed = new URL(decoded);
    if (!['http:', 'https:'].includes(parsed.protocol)) {
      return { valid: false, error: 'Invalid URL protocol' };
    }
    if (!allowPrivate && isPrivateHost(parsed.hostname)) {
      return {
        valid: false,
        error: 'Target URL destination is not permitted (private / loopback address blocked)'
      };
    }
    return { valid: true, url: decoded };
  } catch (_) {
    return { valid: false, error: 'Malformed target URL format' };
  }
}

/**
 * Synthesizes dynamic Referer, Origin, and User-Agent headers to bypass CDN 403 anti-hotlink filters
 * @param {string} targetUrl
 * @param {string} [customRef]
 * @param {string} [customOrigin]
 * @returns {{ 'User-Agent': string, 'Referer': string, 'Origin'?: string, 'Accept': string }}
 */
function getRefererHeaders(targetUrl, customRef, customOrigin) {
  let referer = customRef ? decodeParam(customRef) : '';
  let origin = customOrigin ? decodeParam(customOrigin) : '';

  if (!referer) {
    if (/streamc\.xyz|amass/i.test(targetUrl)) {
      try {
        const u = new URL(targetUrl);
        referer = `${u.origin}/`;
        origin = u.origin;
      } catch (_) {
        referer = 'https://phim.nguonc.com/';
        origin = 'https://phim.nguonc.com';
      }
    } else if (/phimapi|vlcdn|phim1280/i.test(targetUrl)) {
      referer = 'https://player.phimapi.com/';
      origin = 'https://player.phimapi.com';
    } else if (/vsmov|streamvsmov/i.test(targetUrl)) {
      referer = 'https://vsmov.com/';
      origin = 'https://vsmov.com';
    } else {
      try {
        const u = new URL(targetUrl);
        referer = `${u.origin}/`;
        origin = u.origin;
      } catch (_) {
        referer = 'https://phim.nguonc.com/';
        origin = 'https://phim.nguonc.com';
      }
    }
  }

  if (!origin && referer) {
    try {
      origin = new URL(referer).origin;
    } catch (_) {}
  }

  const headers = {
    'User-Agent': DEFAULT_USER_AGENT,
    'Referer': referer,
    'Accept': '*/*'
  };

  if (origin) {
    headers['Origin'] = origin;
  }

  return headers;
}

/**
 * Builds a fully qualified proxy URL for manifest, segment, key, or subtitle endpoints
 * @param {string} type - 'manifest' | 'segment' | 'key' | 'sub'
 * @param {string} targetUrl - Upstream resource URL
 * @param {Object} [options] - { proxyBase, ref, origin, sub }
 * @returns {string}
 */
function buildProxyUrl(type, targetUrl, options = {}) {
  const proxyBase = (options.proxyBase || '').replace(/\/+$/, '');
  const b64Url = encodeParam(targetUrl);
  const b64Ref = options.ref ? encodeParam(options.ref) : '';
  const b64Origin = options.origin ? encodeParam(options.origin) : '';
  const b64Sub = options.sub ? encodeParam(options.sub) : '';

  let endpoint = 'manifest.m3u8';
  if (type === 'segment' || type === 'ts') endpoint = 'segment.ts';
  else if (type === 'key') endpoint = 'key';
  else if (type === 'sub' || type === 'vtt' || type === 'subtitle') endpoint = 'sub.vtt';

  let url = `${proxyBase}/hls/${endpoint}?url=${b64Url}`;
  if (b64Ref) url += `&ref=${b64Ref}`;
  if (b64Origin) url += `&origin=${b64Origin}`;
  if (b64Sub && endpoint === 'manifest.m3u8') url += `&sub=${b64Sub}`;
  return url;
}

/**
 * Evaluates HTTP Range request header against resource size (RFC 7233)
 * @param {string|null} rangeHeader - e.g. "bytes=100-299"
 * @param {number} totalSize - Total resource size in bytes
 * @returns {{ status: number, start?: number, end?: number, length?: number, contentRange?: string, error?: string }}
 */
function handleRangeRequest(rangeHeader, totalSize) {
  if (!rangeHeader || typeof rangeHeader !== 'string' || !rangeHeader.startsWith('bytes=')) {
    return { status: 200, start: 0, end: totalSize - 1, length: totalSize };
  }

  const parts = rangeHeader.replace(/^bytes=/, '').trim().split('-');
  let start = parseInt(parts[0], 10);
  let end = parts[1] !== '' && parts[1] !== undefined ? parseInt(parts[1], 10) : totalSize - 1;

  if (isNaN(start)) {
    // Suffix range (e.g. bytes=-500)
    const suffix = parseInt(parts[1], 10);
    if (isNaN(suffix) || suffix <= 0) {
      return { status: 416, error: 'Range Not Satisfiable' };
    }
    start = Math.max(0, totalSize - suffix);
    end = totalSize - 1;
  }

  if (isNaN(end) || end >= totalSize) {
    end = totalSize - 1;
  }

  if (start > end || start >= totalSize || start < 0) {
    return { status: 416, error: 'Range Not Satisfiable' };
  }

  return {
    status: 206,
    start,
    end,
    length: end - start + 1,
    contentRange: `bytes ${start}-${end}/${totalSize}`
  };
}

/**
 * Unpacks Dean Edwards JavaScript obfuscation (eval(function(p,a,c,k,e,d)...))
 * @param {string} packed
 * @returns {string}
 */
function unpackDeanEdwards(packed) {
  if (!packed || typeof packed !== 'string') return '';
  const match = packed.match(
    /eval\(function\(p,a,c,k,e,d\)[\s\S]*?\}\('([\s\S]*?)',(\d+),(\d+),'([\s\S]*?)'\.split\('\|'\)/
  );
  if (!match) return packed;

  let [, p, a, c, k] = match;
  a = parseInt(a, 10);
  c = parseInt(c, 10);
  const keyArray = k.split('|');
  const eFunc = (cVal) =>
    (cVal < a ? '' : eFunc(Math.floor(cVal / a))) +
    ((cVal = cVal % a) > 35 ? String.fromCharCode(cVal + 29) : cVal.toString(36));

  while (c--) {
    if (keyArray[c]) {
      p = p.replace(new RegExp('\\b' + eFunc(c) + '\\b', 'g'), keyArray[c]);
    }
  }
  return p;
}

/**
 * Extracts embedded M3U8 stream URL from HTML embed responses (NguonC / StreamC fallback)
 * @param {string} html
 * @param {string} [pageOrigin='']
 * @returns {string|null}
 */
function extractM3u8FromHtml(html, pageOrigin = '') {
  if (!html || typeof html !== 'string') return null;

  // 1. data-obf attribute Base64 JSON
  const obfMatch = html.match(/data-obf=["']([^"']+)["']/i);
  if (obfMatch) {
    try {
      const decoded = JSON.parse(Buffer.from(obfMatch[1], 'base64').toString('utf8'));
      if (decoded.sUb) {
        return decoded.sUb.startsWith('http')
          ? decoded.sUb
          : `${pageOrigin ? pageOrigin.replace(/\/+$/, '') : ''}/${decoded.sUb.replace(/^\/+/, '')}`;
      }
      if (decoded.hD) {
        return decoded.hD.startsWith('http')
          ? decoded.hD
          : `${pageOrigin ? pageOrigin.replace(/\/+$/, '') : ''}/${decoded.hD.replace(/^\/+/, '')}`;
      }
    } catch (_) {}
  }

  // 2. Dean Edwards unpacked code
  if (html.includes('eval(function(p,a,c,k,e,d)')) {
    try {
      const unpacked = unpackDeanEdwards(html);
      const subMatch = unpacked.match(/["'](eyJoIjoi[^"']+)["']/);
      if (subMatch) {
        return `${pageOrigin ? pageOrigin.replace(/\/+$/, '') : ''}/${subMatch[1]}`;
      }
      const m3u8Match = unpacked.match(/(https?:\/\/[^"'\s\)]+\.m3u8[^"'\s\)]*)/i);
      if (m3u8Match) return m3u8Match[1];
    } catch (_) {}
  }

  // 3. Direct regex match
  const directMatch = html.match(/(https?:\/\/[^"'\s\)<>]+\.m3u8[^"'\s\)<>]*)/i);
  if (directMatch) return directMatch[1];

  return null;
}

/**
 * Core M3U8 Manifest Rewriter Engine
 * Transforms upstream variant playlists, media segment URIs, AES keys, and fMP4 init maps into proxied endpoints.
 * @param {string} m3u8Body - Raw M3U8 content
 * @param {string|Object} baseUrlOrOptions - Effective base URL or options object
 * @param {string} [proxyBase] - Public Addon base URL
 * @param {string} [customRef] - Upstream Referer
 * @param {string} [customOrigin] - Upstream Origin
 * @param {string} [customSub] - Subtitle track URL
 * @returns {string}
 */
function rewriteM3U8(m3u8Body, baseUrlOrOptions, proxyBase = '', customRef = '', customOrigin = '', customSub = '') {
  if (!m3u8Body || typeof m3u8Body !== 'string') return '';

  let baseUrl = baseUrlOrOptions;
  if (typeof baseUrlOrOptions === 'object' && baseUrlOrOptions !== null) {
    baseUrl = baseUrlOrOptions.baseUrl || '';
    proxyBase = baseUrlOrOptions.proxyBase || proxyBase;
    customRef = baseUrlOrOptions.ref || customRef;
    customOrigin = baseUrlOrOptions.origin || customOrigin;
    customSub = baseUrlOrOptions.sub || customSub;
  }

  proxyBase = (proxyBase || '').replace(/\/+$/, '');
  const lines = m3u8Body.split(/\r?\n/);
  const rewrittenLines = [];

  const isMaster = lines.some(
    (l) =>
      l.startsWith('#EXT-X-STREAM-INF') ||
      l.startsWith('#EXT-X-MEDIA:') ||
      l.startsWith('#EXT-X-I-FRAME-STREAM-INF')
  );

  const b64Ref = customRef ? encodeParam(customRef) : '';
  const b64Origin = customOrigin ? encodeParam(customOrigin) : '';
  const b64Sub = customSub ? encodeParam(customSub) : '';

  const buildQuery = (absUrl, includeSub = false) => {
    let q = `?url=${encodeParam(absUrl)}`;
    if (b64Ref) q += `&ref=${b64Ref}`;
    if (b64Origin) q += `&origin=${b64Origin}`;
    if (includeSub && b64Sub) q += `&sub=${b64Sub}`;
    return q;
  };

  let hasInjectedSub = false;
  let isNextLineVariant = false;

  for (let i = 0; i < lines.length; i++) {
    let line = lines[i].trim();
    if (!line) {
      rewrittenLines.push(line);
      continue;
    }

    // Inject Subtitle rendition into Master Playlist if provided
    if (isMaster && customSub && !hasInjectedSub && line.startsWith('#EXT-X-STREAM-INF')) {
      rewrittenLines.push(
        `#EXT-X-MEDIA:TYPE=SUBTITLES,GROUP-ID="subs",NAME="Tiếng Việt (VIP)",DEFAULT=YES,AUTOSELECT=YES,FORCED=NO,LANGUAGE="vie",URI="${proxyBase}/hls/sub.vtt?url=${b64Sub}${b64Ref ? '&ref=' + b64Ref : ''}${b64Origin ? '&origin=' + b64Origin : ''}"`
      );
      hasInjectedSub = true;
    }

    // Process Tags
    if (line.startsWith('#')) {
      // 1. Rewrite #EXT-X-KEY (AES-128 Decryption Keys)
      if (line.startsWith('#EXT-X-KEY:')) {
        line = line.replace(/URI="([^"]+)"/, (m, uri) => {
          const abs = resolveUrl(uri, baseUrl);
          return `URI="${proxyBase}/hls/key${buildQuery(abs)}"`;
        });
        rewrittenLines.push(line);
        continue;
      }

      // 2. Rewrite #EXT-X-MAP (fMP4 Initialization Segments)
      if (line.startsWith('#EXT-X-MAP:')) {
        line = line.replace(/URI="([^"]+)"/, (m, uri) => {
          const abs = resolveUrl(uri, baseUrl);
          return `URI="${proxyBase}/hls/segment.ts${buildQuery(abs)}"`;
        });
        rewrittenLines.push(line);
        continue;
      }

      // 3. Rewrite #EXT-X-MEDIA (Renditions: Audio, Subtitles)
      if (line.startsWith('#EXT-X-MEDIA:')) {
        line = line.replace(/URI="([^"]+)"/, (m, uri) => {
          const abs = resolveUrl(uri, baseUrl);
          const isVtt = abs.includes('.vtt') || line.includes('TYPE=SUBTITLES');
          const ep = isVtt ? 'sub.vtt' : 'manifest.m3u8';
          return `URI="${proxyBase}/hls/${ep}${buildQuery(abs)}"`;
        });
        rewrittenLines.push(line);
        continue;
      }

      // 4. Variant Stream Descriptor (#EXT-X-STREAM-INF)
      if (line.startsWith('#EXT-X-STREAM-INF')) {
        if (customSub && !line.includes('SUBTITLES=')) {
          line += ',SUBTITLES="subs"';
        }
        isNextLineVariant = true;
        rewrittenLines.push(line);
        continue;
      }

      // 5. Other tags
      rewrittenLines.push(line);
      continue;
    }

    // Process URI Lines
    if (isMaster || isNextLineVariant || line.includes('.m3u8')) {
      // Variant Playlist URI in Master Manifest
      const abs = resolveUrl(line, baseUrl);
      rewrittenLines.push(`${proxyBase}/hls/manifest.m3u8${buildQuery(abs, true)}`);
      isNextLineVariant = false;
    } else {
      // Media Video Segment URI (.ts, .m4s, .mp4, etc.)
      const abs = resolveUrl(line, baseUrl);
      rewrittenLines.push(`${proxyBase}/hls/segment.ts${buildQuery(abs)}`);
    }
  }

  return rewrittenLines.join('\n');
}

/**
 * Controller: GET /hls/manifest.m3u8
 * Fetches target M3U8, rewrites internal child manifests and segment links to proxy endpoints.
 */
async function handleManifest(req, res) {
  const rawUrl = req.query.url;
  const validation = validateTargetUrl(rawUrl);
  if (!validation.valid) {
    return res.status(400).json({ error: validation.error });
  }

  const targetUrl = validation.url;
  const customRef = req.query.ref ? decodeParam(req.query.ref) : '';
  const customOrigin = req.query.origin ? decodeParam(req.query.origin) : '';
  const customSub = req.query.sub ? decodeParam(req.query.sub) : '';
  const proxyBase = getProxyBase(req);

  const headers = getRefererHeaders(targetUrl, customRef, customOrigin);

  try {
    const upstreamRes = await axios.get(targetUrl, {
      headers,
      timeout: TIMEOUTS.DETAIL || 5000,
      responseType: 'text',
      maxRedirects: 5
    });

    const effectiveBaseUrl = upstreamRes.request?.res?.responseUrl || upstreamRes.config?.url || targetUrl;
    let body = upstreamRes.data;

    // Detect HTML embed & de-obfuscate fallback
    if (
      typeof body === 'string' &&
      (body.includes('<!DOCTYPE html>') || body.includes('<div id="player"') || body.includes('data-obf='))
    ) {
      const pageOrigin = new URL(effectiveBaseUrl).origin;
      const extractedM3u8 = extractM3u8FromHtml(body, pageOrigin);
      if (extractedM3u8) {
        const retryHeaders = getRefererHeaders(extractedM3u8, customRef, customOrigin);
        const retryRes = await axios.get(extractedM3u8, {
          headers: retryHeaders,
          timeout: TIMEOUTS.DETAIL || 5000,
          responseType: 'text',
          maxRedirects: 5
        });
        body = retryRes.data;
      }
    }

    if (typeof body !== 'string' || !body.includes('#EXTM3U')) {
      return res.status(502).json({ error: 'Upstream response is not a valid M3U8 manifest' });
    }

    const rewritten = rewriteM3U8(body, effectiveBaseUrl, proxyBase, customRef, customOrigin, customSub);
    res.setHeader('Content-Type', 'application/vnd.apple.mpegurl; charset=utf-8');
    res.setHeader('Cache-Control', 'public, max-age=60');
    return res.status(200).send(rewritten);
  } catch (err) {
    if (err.response?.status === 403) {
      return res.status(403).json({ error: 'Upstream CDN 403 Forbidden', message: err.message });
    }
    if (err.code === 'ECONNABORTED' || err.code === 'ETIMEDOUT') {
      return res.status(504).json({ error: 'Upstream manifest request timed out', message: err.message });
    }
    return res.status(err.response?.status || 502).json({
      error: 'Manifest Proxy Error',
      message: err.message
    });
  }
}

/**
 * Controller: GET /hls/segment.ts
 * Reverse proxies video chunks with dynamic header spoofing, zero-RAM stream piping, Range 206, and client abort teardown.
 */
async function handleSegment(req, res) {
  const rawUrl = req.query.url;
  const validation = validateTargetUrl(rawUrl);
  if (!validation.valid) {
    return res.status(400).json({ error: validation.error });
  }

  const targetUrl = validation.url;
  const customRef = req.query.ref ? decodeParam(req.query.ref) : '';
  const customOrigin = req.query.origin ? decodeParam(req.query.origin) : '';

  const headers = getRefererHeaders(targetUrl, customRef, customOrigin);

  if (req.headers.range) {
    headers['Range'] = req.headers.range;
  }

  const controller = new AbortController();
  req.on('close', () => {
    controller.abort();
  });

  try {
    const upstreamRes = await axios.get(targetUrl, {
      headers,
      timeout: 15000,
      responseType: 'stream',
      maxRedirects: 5,
      signal: controller.signal,
      validateStatus: (status) => (status >= 200 && status < 400) || status === 416
    });

    if (upstreamRes.status === 416) {
      res.setHeader('Accept-Ranges', 'bytes');
      if (upstreamRes.headers['content-range']) {
        res.setHeader('Content-Range', upstreamRes.headers['content-range']);
      }
      return res.status(416).send('Range Not Satisfiable');
    }

    res.status(upstreamRes.status);

    const contentType = upstreamRes.headers['content-type'] || 'video/MP2T';
    res.setHeader('Content-Type', contentType);
    res.setHeader('Accept-Ranges', 'bytes');

    if (upstreamRes.headers['content-range']) {
      res.setHeader('Content-Range', upstreamRes.headers['content-range']);
    }
    if (upstreamRes.headers['content-length']) {
      res.setHeader('Content-Length', upstreamRes.headers['content-length']);
    }
    res.setHeader('Cache-Control', 'public, max-age=86400, immutable');

    upstreamRes.data.pipe(res);

    req.on('close', () => {
      if (upstreamRes.data && typeof upstreamRes.data.destroy === 'function') {
        upstreamRes.data.destroy();
      }
    });
  } catch (err) {
    if (err.code === 'ERR_CANCELED' || controller.signal.aborted) {
      return;
    }
    if (!res.headersSent) {
      if (err.code === 'ECONNABORTED' || err.code === 'ETIMEDOUT') {
        return res.status(504).json({ error: 'Upstream video segment request timed out' });
      }
      return res.status(err.response?.status || 502).json({
        error: 'Segment Proxy Error',
        message: err.message
      });
    }
  }
}

/**
 * Controller: GET /hls/key
 * Reverse proxies AES-128 decryption keys with header spoofing
 */
async function handleKey(req, res) {
  const rawUrl = req.query.url;
  const validation = validateTargetUrl(rawUrl);
  if (!validation.valid) {
    return res.status(400).json({ error: validation.error });
  }

  const targetUrl = validation.url;
  const customRef = req.query.ref ? decodeParam(req.query.ref) : '';
  const customOrigin = req.query.origin ? decodeParam(req.query.origin) : '';

  const headers = getRefererHeaders(targetUrl, customRef, customOrigin);

  try {
    const upstreamRes = await axios.get(targetUrl, {
      headers,
      timeout: TIMEOUTS.DEFAULT || 5000,
      responseType: 'arraybuffer'
    });

    res.setHeader('Content-Type', 'application/octet-stream');
    res.setHeader('Cache-Control', 'public, max-age=86400');
    return res.status(200).send(Buffer.from(upstreamRes.data));
  } catch (err) {
    return res.status(err.response?.status || 502).json({
      error: 'Decryption Key Proxy Error',
      message: err.message
    });
  }
}

/**
 * Controller: GET /hls/sub.vtt
 * Reverse proxies WebVTT subtitle files with header spoofing
 */
async function handleSub(req, res) {
  const rawUrl = req.query.url;
  const validation = validateTargetUrl(rawUrl);
  if (!validation.valid) {
    return res.status(400).json({ error: validation.error });
  }

  const targetUrl = validation.url;
  const customRef = req.query.ref ? decodeParam(req.query.ref) : '';
  const customOrigin = req.query.origin ? decodeParam(req.query.origin) : '';

  const headers = getRefererHeaders(targetUrl, customRef, customOrigin);

  try {
    const upstreamRes = await axios.get(targetUrl, {
      headers,
      timeout: TIMEOUTS.DEFAULT || 5000,
      responseType: 'text'
    });

    res.setHeader('Content-Type', 'text/vtt; charset=utf-8');
    res.setHeader('Cache-Control', 'public, max-age=86400');
    return res.status(200).send(upstreamRes.data);
  } catch (err) {
    return res.status(err.response?.status || 502).json({
      error: 'Subtitle Proxy Error',
      message: err.message
    });
  }
}

// Route Mounts (Support both root and /hls prefixes, plus /playlist.m3u8 alias from alternate clients)
router.get(
  [
    '/manifest.m3u8',
    '/stream.m3u8',
    '/master.m3u8',
    '/index.m3u8',
    '/playlist.m3u8',
    '/hls/manifest.m3u8',
    '/hls/stream.m3u8',
    '/hls/master.m3u8',
    '/hls/index.m3u8',
    '/hls/playlist.m3u8'
  ],
  handleManifest
);

router.get(
  [
    '/segment.ts',
    '/segment',
    '/segment.m4s',
    '/segment.mp4',
    '/proxy/ts',
    '/hls/segment.ts',
    '/hls/segment',
    '/hls/segment.m4s',
    '/hls/segment.mp4',
    '/hls/proxy/ts'
  ],
  handleSegment
);

router.get(['/key', '/key.key', '/hls/key', '/hls/key.key'], handleKey);

router.get(['/sub.vtt', '/sub', '/hls/sub.vtt', '/hls/sub'], handleSub);

module.exports = router;
module.exports.router = router;
module.exports.default = router;

// Helper Functions & Controllers for Direct Unit Testing
module.exports.handleManifest = handleManifest;
module.exports.handleSegment = handleSegment;
module.exports.handleKey = handleKey;
module.exports.handleSub = handleSub;
module.exports.rewriteM3U8 = rewriteM3U8;
module.exports.rewriteManifest = rewriteM3U8;
module.exports.rewriteM3u8Content = rewriteM3U8;
module.exports.resolveUrl = resolveUrl;
module.exports.decodeParam = decodeParam;
module.exports.decodeUrlParam = decodeParam;
module.exports.decodeB64 = decodeParam;
module.exports.decodeBase64Url = decodeParam;
module.exports.encodeParam = encodeParam;
module.exports.encodeUrlParam = encodeParam;
module.exports.encodeB64 = encodeParam;
module.exports.encodeBase64Url = encodeParam;
module.exports.buildProxyUrl = buildProxyUrl;
module.exports.getRefererHeaders = getRefererHeaders;
module.exports.resolveUpstreamHeaders = getRefererHeaders;
module.exports.getSpoofedHeaders = getRefererHeaders;
module.exports.handleRangeRequest = handleRangeRequest;
module.exports.extractM3u8FromHtml = extractM3u8FromHtml;
module.exports.unpackDeanEdwards = unpackDeanEdwards;
module.exports.validateTargetUrl = validateTargetUrl;
module.exports.isPrivateHost = isPrivateHost;
