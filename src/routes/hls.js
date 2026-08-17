'use strict';

/**
 * ============================================================
 *  VIP Movies Addon — src/routes/hls.js
 *  HLS Proxy Router (tách từ index.js)
 *
 *  Routes:
 *    GET /hls/extract?b64=<embed_url_base64url>
 *    GET /hls/manifest.m3u8?b64=<m3u8_url>&ref=<referer>
 *    GET /hls/ts?b64=<segment_url>&ref=<referer>
 *
 *  Features:
 *  - Base64URL encoding (không bị URL mangling)
 *  - Per-source Referer injection
 *  - CORS headers bắt buộc trên mọi response
 *  - MIME override: video/mp2t cho mọi segment
 * ============================================================
 */

const express = require('express');
const router  = express.Router();
const axios   = require('axios');

const { extractM3u8FromEmbed } = require('../mapper');
const { m3u8Cache }            = require('../lib/cache');

// ─── Constants ─────────────────────────────────────────────────
const HLS_UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';

/**
 * Per-source Referer mapping
 * Detect nguồn từ URL → inject Referer phù hợp
 */
const SOURCE_REFERERS = [
  { pattern: /kkphimplayer|phim1280|phimapi\.com|kkphim/i, referer: 'https://player.phimapi.com/', origin: 'https://player.phimapi.com' },
  { pattern: /nguonc\.com/i,                               referer: 'https://phim.nguonc.com/',     origin: 'https://phim.nguonc.com' },
  { pattern: /vsmov|streamvs/i,                            referer: 'https://vsmov.com/',           origin: 'https://vsmov.com' },
  { pattern: /streamc\./i,                                 referer: 'https://streamc.online/',      origin: 'https://streamc.online' },
];

const DEFAULT_REFERER = 'https://phim.nguonc.com/';

/**
 * Xác định Referer & Origin từ URL hoặc ref param
 */
function getRefererHeaders(targetUrl, refParam) {
  // Ưu tiên dynamic ref param nếu có
  if (refParam) {
    try {
      let parsedRef = refParam;
      if (!parsedRef.startsWith('http://') && !parsedRef.startsWith('https://')) {
        parsedRef = `https://${parsedRef}`;
      }
      const origin = new URL(parsedRef).origin;
      return { referer: parsedRef, origin };
    } catch {}
  }

  // Detect từ target URL
  for (const src of SOURCE_REFERERS) {
    if (src.pattern.test(targetUrl)) {
      return { referer: src.referer, origin: src.origin };
    }
  }

  // Default
  try {
    const origin = new URL(targetUrl).origin;
    return { referer: origin + '/', origin };
  } catch {
    return { referer: DEFAULT_REFERER, origin: 'https://phim.nguonc.com' };
  }
}

/**
 * Bắt buộc CORS headers cho mọi HLS response
 */
function setCorsHeaders(res) {
  res.setHeader('Access-Control-Allow-Origin',  '*');
  res.setHeader('Access-Control-Allow-Headers', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
}

/**
 * Decode Base64URL / Base64 → string an toàn
 */
function decodeB64(str) {
  if (!str) return null;
  try {
    const decodedUrl = Buffer.from(str, 'base64url').toString('utf8');
    if (decodedUrl && (decodedUrl.startsWith('http://') || decodedUrl.startsWith('https://') || decodedUrl.includes('://'))) {
      return decodedUrl;
    }
    const decodedStd = Buffer.from(str, 'base64').toString('utf8');
    if (decodedStd && (decodedStd.startsWith('http://') || decodedStd.startsWith('https://') || decodedStd.includes('://'))) {
      return decodedStd;
    }
    return decodedUrl || null;
  } catch {
    return null;
  }
}

/**
 * Resolve target URL from raw or base64 param
 */
function resolveParamUrl(val) {
  if (!val) return null;
  if (typeof val !== 'string') return null;
  const trimmed = val.trim();
  if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) return trimmed;
  const decoded = decodeB64(trimmed);
  if (decoded && (decoded.startsWith('http://') || decoded.startsWith('https://'))) {
    return decoded;
  }
  return decoded || trimmed;
}

// ─── OPTIONS preflight ──────────────────────────────────────────
router.options('*', (req, res) => {
  setCorsHeaders(res);
  res.status(204).end();
});

// ─────────────────────────────────────────────────────────────
//  GET /hls/extract?url=<embed_url_base64url>
//  Lazy extraction: fetch embed → extract m3u8 → redirect to /hls/manifest.m3u8
// ─────────────────────────────────────────────────────────────
router.get('/extract', async (req, res) => {
  setCorsHeaders(res);
  let embedUrl = resolveParamUrl(req.query.embed || req.query.b64 || req.query.url);
  if (!embedUrl) return res.status(400).send('Missing embed url');

  const protoHost = `${req.headers['x-forwarded-proto'] || req.protocol}://${req.headers['x-forwarded-host'] || req.get('host')}`;

  try {
    const result = await extractM3u8FromEmbed(embedUrl);
    if (!result) {
      console.warn('[HLS/extract] Could not extract m3u8 from:', embedUrl.slice(0, 80));
      return res.status(502).send('Could not extract stream URL from embed');
    }

    const { m3u8Url } = result;
    const b64M3u8 = Buffer.from(m3u8Url).toString('base64url');
    const b64Ref  = Buffer.from(embedUrl).toString('base64url');

    const proxyUrl = `${protoHost}/hls/manifest.m3u8?url=${b64M3u8}&ref=${b64Ref}`;
    console.log(`[HLS/extract] ${embedUrl.slice(0, 60)} → ${m3u8Url.slice(0, 60)}`);
    res.redirect(302, proxyUrl);
  } catch (err) {
    console.error('[HLS/extract]', err.message);
    if (!res.headersSent) res.status(502).send('Extract error: ' + err.message);
  }
});

// ─────────────────────────────────────────────────────────────
//  GET /hls/manifest.m3u8?url=<url>&ref=<referer>
//  Rewrite playlist proxy (Master → sub-playlist, sub-playlist → TS)
// ─────────────────────────────────────────────────────────────
router.get(['/manifest.m3u8', '/m3u8'], async (req, res) => {
  setCorsHeaders(res);
  res.setHeader('Content-Type', 'application/vnd.apple.mpegurl; charset=utf-8');

  const targetUrl = resolveParamUrl(req.query.url || req.query.b64);
  if (!targetUrl) return res.status(400).send('Missing url');

  const refParam  = resolveParamUrl(req.query.ref || req.query.referer);
  const { referer: refererUrl, origin } = getRefererHeaders(targetUrl, refParam);
  const protoHost = `${req.headers['x-forwarded-proto'] || req.protocol}://${req.headers['x-forwarded-host'] || req.get('host')}`;

  // Check m3u8 cache
  const cacheKey = `m3u8:${protoHost}:${targetUrl}`;
  const cached   = m3u8Cache.get(cacheKey);

  if (cached) {
    console.log(`[HLS/manifest] Cache HIT: ${targetUrl.slice(0, 60)}`);
    return res.send(cached);
  }

  try {
    const r = await axios({
      url: targetUrl,
      method: 'GET',
      responseType: 'text',
      headers: {
        'User-Agent': HLS_UA,
        Referer: refererUrl,
        Origin: origin,
        Accept: '*/*',
      },
      timeout: 15000,
      maxRedirects: 5,
    });

    let baseUrl;
    try { baseUrl = new URL(targetUrl); } catch { return res.send(r.data); }

    const encodedRef = Buffer.from(refererUrl).toString('base64url');
    let isNextSubPlaylist = false;
    let isNextSegment     = false;

    const rewritten = String(r.data).split('\n').map((line) => {
      const t = line.trim();
      if (!t) return line;

      if (t.startsWith('#')) {
        if (t.startsWith('#EXT-X-STREAM-INF') || t.startsWith('#EXT-X-I-FRAME-STREAM-INF')) {
          isNextSubPlaylist = true;
          isNextSegment = false;
          return line;
        }
        if (t.startsWith('#EXTINF')) {
          isNextSegment = true;
          isNextSubPlaylist = false;
          return line;
        }
        if (t.startsWith('#EXT-X-MEDIA') && t.includes('URI=')) {
          return t.replace(/URI=(?:"([^"]+)"|([^\s,]+))/, (_, qUri, unqUri) => {
            const uri = qUri || unqUri;
            const absUri = uri.startsWith('http') ? uri : new URL(uri, baseUrl.href).href;
            const b64Uri = Buffer.from(absUri).toString('base64url');
            return `URI="${protoHost}/hls/manifest.m3u8?url=${b64Uri}&ref=${encodedRef}"`;
          });
        }
        if ((t.startsWith('#EXT-X-KEY') || t.startsWith('#EXT-X-SESSION-KEY')) && t.includes('URI=')) {
          return t.replace(/URI=(?:"([^"]+)"|([^\s,]+))/, (_, qUri, unqUri) => {
            const uri = qUri || unqUri;
            const absUri = uri.startsWith('http') ? uri : new URL(uri, baseUrl.href).href;
            const b64Key = Buffer.from(absUri).toString('base64url');
            return `URI="${protoHost}/hls/ts?url=${b64Key}&ref=${encodedRef}&is_key=1"`;
          });
        }
        if (t.startsWith('#EXT-X-MAP') && t.includes('URI=')) {
          return t.replace(/URI=(?:"([^"]+)"|([^\s,]+))/, (_, qUri, unqUri) => {
            const uri = qUri || unqUri;
            const absUri = uri.startsWith('http') ? uri : new URL(uri, baseUrl.href).href;
            const b64Map = Buffer.from(absUri).toString('base64url');
            return `URI="${protoHost}/hls/ts?url=${b64Map}&ref=${encodedRef}"`;
          });
        }
        if (t.startsWith('#EXT-X-PRELOAD-HINT') && t.includes('URI=')) {
          return t.replace(/URI=(?:"([^"]+)"|([^\s,]+))/, (_, qUri, unqUri) => {
            const uri = qUri || unqUri;
            const absUri = uri.startsWith('http') ? uri : new URL(uri, baseUrl.href).href;
            const b64Hint = Buffer.from(absUri).toString('base64url');
            return `URI="${protoHost}/hls/ts?url=${b64Hint}&ref=${encodedRef}"`;
          });
        }
        if (t.startsWith('#EXT-X-PART') && t.includes('URI=')) {
          return t.replace(/URI=(?:"([^"]+)"|([^\s,]+))/, (_, qUri, unqUri) => {
            const uri = qUri || unqUri;
            const absUri = uri.startsWith('http') ? uri : new URL(uri, baseUrl.href).href;
            const b64Part = Buffer.from(absUri).toString('base64url');
            return `URI="${protoHost}/hls/ts?url=${b64Part}&ref=${encodedRef}"`;
          });
        }
        return line;
      }

      // URI line
      const absUrl = t.startsWith('http') ? t : new URL(t, baseUrl.href).href;
      const b64Url = Buffer.from(absUrl).toString('base64url');

      if (isNextSubPlaylist || absUrl.includes('.m3u8') || absUrl.includes('playlist')) {
        isNextSubPlaylist = false;
        return `${protoHost}/hls/manifest.m3u8?url=${b64Url}&ref=${encodedRef}`;
      }

      isNextSegment = false;
      return `${protoHost}/hls/ts?url=${b64Url}&ref=${encodedRef}`;
    }).join('\n');

    // Cache rewritten playlist
    m3u8Cache.set(cacheKey, rewritten);
    res.send(rewritten);
  } catch (err) {
    console.error('[HLS/manifest]', err.message, targetUrl.slice(0, 80));
    if (!res.headersSent) res.status(502).send('HLS Proxy Error: ' + err.message);
  }
});

// ─────────────────────────────────────────────────────────────
//  GET /hls/ts?url=<segment_url>&ref=<referer>
//  Segment pipe proxy — stream binary data
// ─────────────────────────────────────────────────────────────
router.get('/ts', async (req, res) => {
  setCorsHeaders(res);

  const isKey = req.query.is_key === '1';
  if (isKey) {
    res.setHeader('Content-Type', 'application/octet-stream');
  } else {
    res.setHeader('Content-Type', 'video/mp2t');
  }

  const targetUrl = resolveParamUrl(req.query.url || req.query.b64);
  if (!targetUrl) return res.status(400).send('Missing url');

  const refParam  = resolveParamUrl(req.query.ref || req.query.referer);
  const { referer: refererUrl, origin } = getRefererHeaders(targetUrl, refParam);

  const isKeyUrl = isKey || targetUrl.includes('.key');
  if (isKeyUrl && !isKey) {
    res.setHeader('Content-Type', 'application/octet-stream');
  }

  res.setHeader('Cache-Control', 'public, max-age=86400');

  try {
    const r = await axios({
      url: targetUrl,
      method: 'GET',
      responseType: 'stream',
      headers: {
        'User-Agent': HLS_UA,
        Referer: refererUrl,
        Origin: origin,
        Accept: '*/*',
      },
      timeout: 25000,
      maxRedirects: 5,
    });

    if (r.headers['content-length']) {
      res.setHeader('Content-Length', r.headers['content-length']);
    }

    r.data.pipe(res);
    r.data.on('error', (e) => {
      console.error('[HLS/ts] Stream error:', e.message);
      if (!res.headersSent) res.status(502).end();
    });
  } catch (err) {
    console.error('[HLS/ts]', err.message, targetUrl.slice(0, 80));
    if (!res.headersSent) res.status(502).send('HLS Segment Error');
  }
});

module.exports = router;
