'use strict';

/**
 * ============================================================
 *  VIP Movies Addon — src/routes/hls.js (Engine v1.6.2)
 *  HLS Proxy Router: Anti-403, Full Segment & Key Rewriter, HTTP Range 206
 *
 *  Routes:
 *    GET /hls/extract?url=...&ref=...
 *    GET /hls/manifest.m3u8?url=...&ref=...  (and /m3u8, /m3u8-proxy)
 *    GET /hls/segment.ts?url=...&ref=...     (and /ts, /segment, /ts-proxy)
 *    GET /hls/key?url=...&ref=...            (and /key.key)
 *    GET /hls/sub.vtt?url=...&ref=...        (and /sub)
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
  { pattern: /kkphimplayer|phim1280|phimapi\.com|kkphim|opstream|vlcdn/i, referer: 'https://player.phimapi.com/', origin: 'https://player.phimapi.com' },
  { pattern: /vsmov|streamvsmov|p25\.streamvsmov/i,        referer: 'https://vsmov.com/',           origin: 'https://vsmov.com' },
  { pattern: /nguonc\.com/i,                               referer: 'https://phim.nguonc.com/',     origin: 'https://phim.nguonc.com' },
  { pattern: /streamc\.|amass2\.top/i,                     referer: 'https://embed15.streamc.xyz/', origin: 'https://embed15.streamc.xyz' },
  { pattern: /sieutamphim|suutamphim|tvhay/i,              referer: 'https://sieutamphim.pro/',     origin: 'https://sieutamphim.pro' },
  { pattern: /yanhh3d|yan|fbcdn\.cloud|defifa\.com/i,      referer: 'https://yanhh3d.pw/',          origin: 'https://yanhh3d.pw' },
  { pattern: /hh3d|hoathinh3d/i,                           referer: 'https://hh3d.tv/',             origin: 'https://hh3d.tv' },
  { pattern: /clbphimxua|clbpx/i,                          referer: 'https://clbphimxua.info/',     origin: 'https://clbphimxua.info' },
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

function resolveParamUrl(val) {
  if (!val || typeof val !== 'string') return null;
  const trimmed = val.trim();
  if (!trimmed) return null;
  if (trimmed.startsWith('http://') || trimmed.startsWith('https://') || trimmed.startsWith('data:')) return trimmed;
  const decoded = decodeB64(trimmed);
  if (decoded) {
    const trimmedDecoded = decoded.trim();
    if (!trimmedDecoded) return null;
    return trimmedDecoded;
  }
  return trimmed;
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
router.get(['/manifest.m3u8', '/m3u8', '/m3u8-proxy'], async (req, res) => {
  setCorsHeaders(res);
  res.setHeader('Content-Type', 'application/vnd.apple.mpegurl; charset=utf-8');
  res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');

  const targetUrl = resolveParamUrl(req.query.url || req.query.b64);
  if (!targetUrl) return res.status(400).send('Missing url');

  const subParam = resolveParamUrl(req.query.sub || req.query.subtitle || req.query.sub_url);
  const refParam = resolveParamUrl(req.query.ref || req.query.referer);
  const { referer: refererUrl, origin } = getRefererHeaders(targetUrl, refParam);
  const protoHost = `${req.headers['x-forwarded-proto'] || req.protocol}://${req.headers['x-forwarded-host'] || req.get('host')}`;

  const cacheKey = `m3u8:${protoHost}:${targetUrl}:${subParam || ''}`;
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

    let rawManifestData = String(r.data);
    let effectiveTargetUrl = targetUrl;

    // If upstream returned HTML webpage instead of M3U8 playlist, auto-extract M3U8 from embed/HTML
    if (!rawManifestData.includes('#EXTM3U')) {
      try {
        const extracted = await extractM3u8FromEmbed(targetUrl, refererUrl);
        if (extracted && extracted.m3u8Url) {
          const r2 = await axios({
            url: extracted.m3u8Url,
            method: 'GET',
            responseType: 'text',
            headers: {
              'User-Agent': HLS_UA,
              Referer: extracted.embedHost || refererUrl,
              Origin: origin,
              Accept: '*/*',
            },
            timeout: 15000,
            maxRedirects: 5,
          });
          if (String(r2.data).includes('#EXTM3U')) {
            rawManifestData = String(r2.data);
            effectiveTargetUrl = extracted.m3u8Url;
          }
        }
      } catch (extractErr) {
        console.warn('[HLS/manifest] De-embed fallback warning:', extractErr.message);
      }
    }

    let baseUrl;
    try { baseUrl = new URL(effectiveTargetUrl); } catch { return res.send(rawManifestData); }

    const encodedRef = Buffer.from(refererUrl).toString('base64url');
    let isNextSubPlaylist = false;
    let isNextSegment     = false;
    let isMasterPlaylist  = false;

    const rawLines = rawManifestData.split(/\r?\n/);
    const rewrittenLines = [];

    for (let i = 0; i < rawLines.length; i++) {
      const line = rawLines[i];
      const t = line.trim();
      if (!t) {
        rewrittenLines.push(line);
        continue;
      }

      if (t.startsWith('#')) {
        // Master Playlist variant streams
        if (t.startsWith('#EXT-X-STREAM-INF') || t.startsWith('#EXT-X-I-FRAME-STREAM-INF')) {
          isMasterPlaylist = true;
          isNextSubPlaylist = true;
          isNextSegment = false;
          let streamInfLine = t;
          if (subParam && !streamInfLine.includes('SUBTITLES=')) {
            streamInfLine = `${streamInfLine},SUBTITLES="subs"`;
          }
          if (streamInfLine.includes('URI=')) {
            streamInfLine = streamInfLine.replace(/URI=(?:"([^"]+)"|([^\s,]+))/, (_, qUri, unqUri) => {
              const uri = qUri || unqUri;
              const absUri = uri.startsWith('http') ? uri : new URL(uri, baseUrl.href).href;
              const b64Uri = Buffer.from(absUri).toString('base64url');
              return `URI="${protoHost}/hls/manifest.m3u8?url=${b64Uri}&ref=${encodedRef}"`;
            });
          }
          rewrittenLines.push(streamInfLine);
          continue;
        }

        // Media Playlist segments
        if (t.startsWith('#EXTINF')) {
          isNextSegment = true;
          isNextSubPlaylist = false;
          rewrittenLines.push(line);
          continue;
        }

        // Audio / Subtitles / Alternative Renditions
        if (t.startsWith('#EXT-X-MEDIA') && t.includes('URI=')) {
          isMasterPlaylist = true;
          const rewrittenMedia = t.replace(/URI=(?:"([^"]+)"|([^\s,]+))/, (_, qUri, unqUri) => {
            const uri = qUri || unqUri;
            const absUri = uri.startsWith('http') ? uri : new URL(uri, baseUrl.href).href;
            const b64Uri = Buffer.from(absUri).toString('base64url');
            if (t.includes('TYPE=SUBTITLES') && (absUri.includes('.vtt') || absUri.includes('.srt'))) {
              return `URI="${protoHost}/hls/sub.vtt?url=${b64Uri}&ref=${encodedRef}"`;
            }
            return `URI="${protoHost}/hls/manifest.m3u8?url=${b64Uri}&ref=${encodedRef}"`;
          });
          rewrittenLines.push(rewrittenMedia);
          continue;
        }

        // Decryption Key Files (#EXT-X-KEY / #EXT-X-SESSION-KEY)
        if ((t.startsWith('#EXT-X-KEY') || t.startsWith('#EXT-X-SESSION-KEY')) && t.includes('URI=')) {
          const rewrittenKey = t.replace(/URI=(?:"([^"]+)"|([^\s,]+))/, (_, qUri, unqUri) => {
            const uri = qUri || unqUri;
            const absUri = uri.startsWith('http') ? uri : new URL(uri, baseUrl.href).href;
            const b64Key = Buffer.from(absUri).toString('base64url');
            return `URI="${protoHost}/hls/key?url=${b64Key}&ref=${encodedRef}"`;
          });
          rewrittenLines.push(rewrittenKey);
          continue;
        }

        // fMP4 Initialization segment (#EXT-X-MAP)
        if (t.startsWith('#EXT-X-MAP') && t.includes('URI=')) {
          const rewrittenMap = t.replace(/URI=(?:"([^"]+)"|([^\s,]+))/, (_, qUri, unqUri) => {
            const uri = qUri || unqUri;
            const absUri = uri.startsWith('http') ? uri : new URL(uri, baseUrl.href).href;
            const b64Map = Buffer.from(absUri).toString('base64url');
            return `URI="${protoHost}/hls/segment.ts?url=${b64Map}&ref=${encodedRef}"`;
          });
          rewrittenLines.push(rewrittenMap);
          continue;
        }

        // Low-Latency HLS Preload hints & partial segments
        if ((t.startsWith('#EXT-X-PRELOAD-HINT') || t.startsWith('#EXT-X-PART')) && t.includes('URI=')) {
          const rewrittenPart = t.replace(/URI=(?:"([^"]+)"|([^\s,]+))/, (_, qUri, unqUri) => {
            const uri = qUri || unqUri;
            const absUri = uri.startsWith('http') ? uri : new URL(uri, baseUrl.href).href;
            const b64Part = Buffer.from(absUri).toString('base64url');
            return `URI="${protoHost}/hls/segment.ts?url=${b64Part}&ref=${encodedRef}"`;
          });
          rewrittenLines.push(rewrittenPart);
          continue;
        }

        rewrittenLines.push(line);
        continue;
      }

      // URI Line
      const absUrl = t.startsWith('http') ? t : new URL(t, baseUrl.href).href;
      const b64Url = Buffer.from(absUrl).toString('base64url');

      if (isNextSubPlaylist || absUrl.includes('.m3u8') || absUrl.includes('playlist')) {
        isNextSubPlaylist = false;
        rewrittenLines.push(`${protoHost}/hls/manifest.m3u8?url=${b64Url}&ref=${encodedRef}`);
        continue;
      }

      isNextSegment = false;
      rewrittenLines.push(`${protoHost}/hls/segment.ts?url=${b64Url}&ref=${encodedRef}`);
    }

    // Inject subtitle track into master playlist if subParam is provided and it is a Master Playlist
    if (subParam && isMasterPlaylist) {
      const b64Sub = Buffer.from(subParam).toString('base64url');
      const proxySubUrl = `${protoHost}/hls/sub.vtt?url=${b64Sub}&ref=${encodedRef}`;
      const subTag = `#EXT-X-MEDIA:TYPE=SUBTITLES,GROUP-ID="subs",NAME="Tiếng Việt (VSMOV VIP)",DEFAULT=YES,AUTOSELECT=YES,FORCED=NO,LANGUAGE="vie",URI="${proxySubUrl}"`;

      // Check if not already present
      const alreadyHasSub = rewrittenLines.some((l) => l.startsWith('#EXT-X-MEDIA:TYPE=SUBTITLES') && l.includes('GROUP-ID="subs"'));
      if (!alreadyHasSub) {
        // Find insert position: right after #EXTM3U or #EXT-X-VERSION
        let insertIdx = 1;
        for (let i = 0; i < rewrittenLines.length; i++) {
          const l = rewrittenLines[i].trim();
          if (l.startsWith('#EXTM3U') || l.startsWith('#EXT-X-VERSION')) {
            insertIdx = i + 1;
          }
        }
        rewrittenLines.splice(insertIdx, 0, subTag);
      }
    }

    const rewritten = rewrittenLines.join('\n');
    m3u8Cache.set(cacheKey, rewritten, 300);
    res.send(rewritten);
  } catch (err) {
    console.error('[HLS/manifest]', err.message, targetUrl.slice(0, 80));
    if (!res.headersSent) res.status(502).send('HLS Proxy Error: ' + err.message);
  }
});

// ─── GET /hls/segment.ts (and aliases /ts, /segment, /ts-proxy) ─
router.get(['/segment.ts', '/ts', '/segment', '/ts-proxy'], async (req, res) => {
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

// ─── GET /hls/sub.vtt (and alias /sub) ──────────────────────────
router.get(['/sub.vtt', '/sub'], async (req, res) => {
  setCorsHeaders(res);
  res.setHeader('Content-Type', 'text/vtt; charset=utf-8');
  res.setHeader('Cache-Control', 'public, max-age=86400');

  const rawUrl = req.query.url || req.query.b64 || req.query.sub || req.query.subtitle || req.query.sub_url;
  const targetUrl = resolveParamUrl(rawUrl);
  if (!targetUrl) {
    return res.status(400).send('Invalid or missing subtitle url');
  }

  const rawRef = req.query.ref || req.query.referer;
  const refParam = resolveParamUrl(rawRef);
  const referer = refParam || 'https://vsmov.com/';
  let origin = 'https://vsmov.com';
  try {
    origin = new URL(referer).origin;
  } catch {}

  try {
    let content = '';

    if (targetUrl.startsWith('data:')) {
      const commaIdx = targetUrl.indexOf(',');
      if (commaIdx !== -1) {
        const meta = targetUrl.slice(5, commaIdx);
        const rawData = targetUrl.slice(commaIdx + 1);
        if (meta.includes('base64')) {
          content = Buffer.from(rawData, 'base64').toString('utf8');
        } else {
          content = decodeURIComponent(rawData);
        }
      } else {
        content = targetUrl.slice(5);
      }
    } else {
      const upstreamRes = await axios({
        url: targetUrl,
        method: 'GET',
        responseType: 'text',
        headers: {
          'User-Agent': HLS_UA,
          Referer: referer,
          Origin: origin,
          Accept: '*/*',
        },
        timeout: 15000,
        maxRedirects: 5,
        validateStatus: (status) => status >= 200 && status < 400,
      });

      content = String(upstreamRes.data || '');
    }

    // Strip UTF-8 BOM
    if (content.charCodeAt(0) === 0xFEFF || content.startsWith('\uFEFF')) {
      content = content.slice(1);
    }
    // Normalize CRLF to LF
    content = content.replace(/\r\n/g, '\n').replace(/\r/g, '\n').trim();

    // Replace comma timestamps (00:00:00,000 -> 00:00:00.000)
    content = content.replace(/(\b\d{1,2}:\d{2}:\d{2}),(\d{3})/g, '$1.$2').replace(/(\b\d{1,2}:\d{2}),(\d{3})/g, '$1.$2');

    // Prepend WEBVTT header if not present
    if (!content.startsWith('WEBVTT')) {
      content = `WEBVTT\n\n${content}\n`;
    }

    return res.send(content);
  } catch (err) {
    console.error('[HLS/sub.vtt]', err.message, targetUrl.slice(0, 80));
    if (!res.headersSent) {
      const status = (err.response && err.response.status >= 400) ? err.response.status : 502;
      return res.status(status).send('Subtitle fetch failed: ' + err.message);
    }
  }
});

module.exports = router;
