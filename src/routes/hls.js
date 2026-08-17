'use strict';

/**
 * ============================================================
 *  VIP Movies Addon — src/routes/hls.js (Engine v1.5.0)
 *  HLS Proxy Router: Anti-403, Full Segment & Key Rewriter, HTTP Range 206
 *
 *  Routes:
 *    GET /hls/extract?url=...&ref=...
 *    GET /hls/manifest.m3u8?url=...&ref=...  (and /m3u8)
 *    GET /hls/segment.ts?url=...&ref=...     (and /ts, /segment)
 *    GET /hls/key?url=...&ref=...            (and /key.key)
 * ============================================================
 */

const express = require('express');
const router  = express.Router();
const axios   = require('axios');

const { extractM3u8FromEmbed } = require('../mapper');
const { m3u8Cache }            = require('../lib/cache');

// ─── Constants ─────────────────────────────────────────────────
const HLS_UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';

const SOURCE_REFERERS = [
  { pattern: /kkphimplayer|phim1280|phimapi\.com|kkphim/i, referer: 'https://player.phimapi.com/', origin: 'https://player.phimapi.com' },
  { pattern: /vsmov|streamvsmov|p25\.streamvsmov/i,        referer: 'https://vsmov.com/',           origin: 'https://vsmov.com' },
  { pattern: /nguonc\.com/i,                               referer: 'https://phim.nguonc.com/',     origin: 'https://phim.nguonc.com' },
  { pattern: /streamc\.|amass2\.top/i,                     referer: 'https://embed15.streamc.xyz/', origin: 'https://embed15.streamc.xyz' },
  { pattern: /suutamphim|tvhay/i,                          referer: 'https://suutamphim.org/',      origin: 'https://suutamphim.org' },
  { pattern: /hh3d|hoathinh3d/i,                           referer: 'https://hh3d.tv/',             origin: 'https://hh3d.tv' },
  { pattern: /yanhh3d|yan/i,                               referer: 'https://yanhh3d.org/',         origin: 'https://yanhh3d.org' },
  { pattern: /clbphimxua|clbpx/i,                          referer: 'https://clbphimxua.com/',      origin: 'https://clbphimxua.com' },
];

const DEFAULT_REFERER = 'https://phim.nguonc.com/';

/**
 * Determine Referer & Origin from URL or dynamic ref parameter
 */
function getRefererHeaders(targetUrl, refParam) {
  if (refParam) {
    try {
      let parsedRef = refParam.trim();
      if (!parsedRef.startsWith('http://') && !parsedRef.startsWith('https://')) {
        parsedRef = `https://${parsedRef}`;
      }
      const origin = new URL(parsedRef).origin;
      return { referer: parsedRef, origin };
    } catch {}
  }

  for (const src of SOURCE_REFERERS) {
    if (src.pattern.test(targetUrl)) {
      return { referer: src.referer, origin: src.origin };
    }
  }

  try {
    const origin = new URL(targetUrl).origin;
    return { referer: `${origin}/`, origin };
  } catch {
    return { referer: DEFAULT_REFERER, origin: 'https://phim.nguonc.com' };
  }
}

/**
 * Set CORS headers on response
 */
function setCorsHeaders(res) {
  res.setHeader('Access-Control-Allow-Origin',  '*');
  res.setHeader('Access-Control-Allow-Headers', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
}

/**
 * Decode Base64URL / Base64 -> plain URL string
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
 * Resolve parameter URL from raw string or base64url/base64
 */
function resolveParamUrl(val) {
  if (!val || typeof val !== 'string') return null;
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

// ─── GET /hls/extract ───────────────────────────────────────────
router.get('/extract', async (req, res) => {
  setCorsHeaders(res);
  const embedUrl = resolveParamUrl(req.query.embed || req.query.b64 || req.query.url);
  if (!embedUrl) return res.status(400).send('Missing embed url');

  const protoHost = `${req.headers['x-forwarded-proto'] || req.protocol}://${req.headers['x-forwarded-host'] || req.get('host')}`;

  try {
    const result = await extractM3u8FromEmbed(embedUrl);
    if (!result || !result.m3u8Url) {
      console.warn('[HLS/extract] Could not extract m3u8 from:', embedUrl.slice(0, 80));
      return res.status(502).send('Could not extract stream URL from embed');
    }

    const { m3u8Url } = result;
    const b64M3u8 = Buffer.from(m3u8Url).toString('base64url');
    const b64Ref  = Buffer.from(embedUrl).toString('base64url');

    const proxyUrl = `${protoHost}/hls/manifest.m3u8?url=${b64M3u8}&ref=${b64Ref}`;
    res.redirect(302, proxyUrl);
  } catch (err) {
    console.error('[HLS/extract]', err.message);
    if (!res.headersSent) res.status(502).send('Extract error: ' + err.message);
  }
});

// ─── GET /hls/manifest.m3u8 ─────────────────────────────────────
router.get(['/manifest.m3u8', '/m3u8'], async (req, res) => {
  setCorsHeaders(res);
  res.setHeader('Content-Type', 'application/vnd.apple.mpegurl; charset=utf-8');
  res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');

  const targetUrl = resolveParamUrl(req.query.url || req.query.b64);
  if (!targetUrl) return res.status(400).send('Missing url');

  const refParam = resolveParamUrl(req.query.ref || req.query.referer);
  const { referer: refererUrl, origin } = getRefererHeaders(targetUrl, refParam);
  const protoHost = `${req.headers['x-forwarded-proto'] || req.protocol}://${req.headers['x-forwarded-host'] || req.get('host')}`;

  const cacheKey = `m3u8:${protoHost}:${targetUrl}`;
  const cached = m3u8Cache.get(cacheKey);
  if (cached) {
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

    const rewritten = String(r.data).split(/\r?\n/).map((line) => {
      const t = line.trim();
      if (!t) return line;

      if (t.startsWith('#')) {
        // Master Playlist variant streams
        if (t.startsWith('#EXT-X-STREAM-INF') || t.startsWith('#EXT-X-I-FRAME-STREAM-INF')) {
          isNextSubPlaylist = true;
          isNextSegment = false;
          if (t.includes('URI=')) {
            return t.replace(/URI=(?:"([^"]+)"|([^\s,]+))/, (_, qUri, unqUri) => {
              const uri = qUri || unqUri;
              const absUri = uri.startsWith('http') ? uri : new URL(uri, baseUrl.href).href;
              const b64Uri = Buffer.from(absUri).toString('base64url');
              return `URI="${protoHost}/hls/manifest.m3u8?url=${b64Uri}&ref=${encodedRef}"`;
            });
          }
          return line;
        }

        // Media Playlist segments
        if (t.startsWith('#EXTINF')) {
          isNextSegment = true;
          isNextSubPlaylist = false;
          return line;
        }

        // Audio / Subtitles / Alternative Renditions
        if (t.startsWith('#EXT-X-MEDIA') && t.includes('URI=')) {
          return t.replace(/URI=(?:"([^"]+)"|([^\s,]+))/, (_, qUri, unqUri) => {
            const uri = qUri || unqUri;
            const absUri = uri.startsWith('http') ? uri : new URL(uri, baseUrl.href).href;
            const b64Uri = Buffer.from(absUri).toString('base64url');
            return `URI="${protoHost}/hls/manifest.m3u8?url=${b64Uri}&ref=${encodedRef}"`;
          });
        }

        // Decryption Key Files (#EXT-X-KEY / #EXT-X-SESSION-KEY)
        if ((t.startsWith('#EXT-X-KEY') || t.startsWith('#EXT-X-SESSION-KEY')) && t.includes('URI=')) {
          return t.replace(/URI=(?:"([^"]+)"|([^\s,]+))/, (_, qUri, unqUri) => {
            const uri = qUri || unqUri;
            const absUri = uri.startsWith('http') ? uri : new URL(uri, baseUrl.href).href;
            const b64Key = Buffer.from(absUri).toString('base64url');
            return `URI="${protoHost}/hls/key?url=${b64Key}&ref=${encodedRef}"`;
          });
        }

        // fMP4 Initialization segment (#EXT-X-MAP)
        if (t.startsWith('#EXT-X-MAP') && t.includes('URI=')) {
          return t.replace(/URI=(?:"([^"]+)"|([^\s,]+))/, (_, qUri, unqUri) => {
            const uri = qUri || unqUri;
            const absUri = uri.startsWith('http') ? uri : new URL(uri, baseUrl.href).href;
            const b64Map = Buffer.from(absUri).toString('base64url');
            return `URI="${protoHost}/hls/segment.ts?url=${b64Map}&ref=${encodedRef}"`;
          });
        }

        // Low-Latency HLS Preload hints & partial segments
        if ((t.startsWith('#EXT-X-PRELOAD-HINT') || t.startsWith('#EXT-X-PART')) && t.includes('URI=')) {
          return t.replace(/URI=(?:"([^"]+)"|([^\s,]+))/, (_, qUri, unqUri) => {
            const uri = qUri || unqUri;
            const absUri = uri.startsWith('http') ? uri : new URL(uri, baseUrl.href).href;
            const b64Part = Buffer.from(absUri).toString('base64url');
            return `URI="${protoHost}/hls/segment.ts?url=${b64Part}&ref=${encodedRef}"`;
          });
        }

        return line;
      }

      // URI Line
      const absUrl = t.startsWith('http') ? t : new URL(t, baseUrl.href).href;
      const b64Url = Buffer.from(absUrl).toString('base64url');

      if (isNextSubPlaylist || absUrl.includes('.m3u8') || absUrl.includes('playlist')) {
        isNextSubPlaylist = false;
        return `${protoHost}/hls/manifest.m3u8?url=${b64Url}&ref=${encodedRef}`;
      }

      isNextSegment = false;
      return `${protoHost}/hls/segment.ts?url=${b64Url}&ref=${encodedRef}`;
    }).join('\n');

    m3u8Cache.set(cacheKey, rewritten, 300);
    res.send(rewritten);
  } catch (err) {
    console.error('[HLS/manifest]', err.message, targetUrl.slice(0, 80));
    if (!res.headersSent) res.status(502).send('HLS Proxy Error: ' + err.message);
  }
});

// ─── GET /hls/segment.ts (and aliases /ts, /segment) ────────────
router.get(['/segment.ts', '/ts', '/segment'], async (req, res) => {
  setCorsHeaders(res);
  res.setHeader('Content-Type', req.query.is_key ? 'application/octet-stream' : 'video/MP2T');
  res.setHeader('Cache-Control', req.query.is_key ? 'no-cache, no-store' : 'public, max-age=31536000, immutable');

  const targetUrl = resolveParamUrl(req.query.url || req.query.b64);
  if (!targetUrl) return res.status(400).send('Missing url');

  const refParam = resolveParamUrl(req.query.ref || req.query.referer);
  const { referer: refererUrl, origin } = getRefererHeaders(targetUrl, refParam);

  const upstreamHeaders = {
    'User-Agent': HLS_UA,
    Referer: refererUrl,
    Origin: origin,
    Accept: '*/*',
  };

  // HTTP Range forwarding for seek support
  if (req.headers.range) {
    upstreamHeaders['Range'] = req.headers.range;
  }

  try {
    const upstreamRes = await axios({
      url: targetUrl,
      method: 'GET',
      responseType: 'stream',
      headers: upstreamHeaders,
      timeout: 25000,
      maxRedirects: 5,
      validateStatus: (status) => status >= 200 && status < 400,
    });

    res.status(upstreamRes.status);

    if (upstreamRes.headers['content-range']) {
      res.setHeader('Content-Range', upstreamRes.headers['content-range']);
    }
    if (upstreamRes.headers['content-length']) {
      res.setHeader('Content-Length', upstreamRes.headers['content-length']);
    }
    if (upstreamRes.headers['accept-ranges']) {
      res.setHeader('Accept-Ranges', upstreamRes.headers['accept-ranges']);
    } else {
      res.setHeader('Accept-Ranges', 'bytes');
    }

    upstreamRes.data.pipe(res);
    upstreamRes.data.on('error', (err) => {
      console.error('[HLS/segment] Stream error:', err.message);
      if (!res.headersSent) res.status(502).end();
    });
  } catch (err) {
    console.error('[HLS/segment]', err.message, targetUrl.slice(0, 80));
    if (!res.headersSent) res.status(502).send('HLS Segment Error');
  }
});

// ─── GET /hls/key (and alias /key.key) ──────────────────────────
router.get(['/key', '/key.key'], async (req, res) => {
  setCorsHeaders(res);
  res.setHeader('Content-Type', 'application/octet-stream');
  res.setHeader('Cache-Control', 'no-cache, no-store');

  const targetUrl = resolveParamUrl(req.query.url || req.query.b64);
  if (!targetUrl) return res.status(400).send('Missing url');

  const refParam = resolveParamUrl(req.query.ref || req.query.referer);
  const { referer: refererUrl, origin } = getRefererHeaders(targetUrl, refParam);

  try {
    const r = await axios({
      url: targetUrl,
      method: 'GET',
      responseType: 'arraybuffer',
      headers: {
        'User-Agent': HLS_UA,
        Referer: refererUrl,
        Origin: origin,
        Accept: '*/*',
      },
      timeout: 15000,
      maxRedirects: 5,
    });

    if (r.headers['content-length']) {
      res.setHeader('Content-Length', r.headers['content-length']);
    }
    res.send(Buffer.from(r.data));
  } catch (err) {
    console.error('[HLS/key]', err.message, targetUrl.slice(0, 80));
    if (!res.headersSent) res.status(502).send('Key proxy error');
  }
});

module.exports = router;
