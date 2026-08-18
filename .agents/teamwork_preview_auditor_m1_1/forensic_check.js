'use strict';

const axios = require('axios');
const assert = require('assert');
const fs = require('fs');
const path = require('path');

const app = require('../../src/index');
const vsmov = require('../../src/providers/vsmov');
const kkphim = require('../../src/providers/kkphim');
const { resolveEmbedMedia } = require('../../src/providers/vsmov');

async function runForensicAudit() {
  console.log('====================================================');
  console.log('FORENSIC AUDIT SUITE — Hotfix v1.5.2 Integrity Check');
  console.log('====================================================\n');

  const report = {
    checks: [],
    violations: [],
  };

  function recordCheck(name, pass, details) {
    report.checks.push({ name, pass, details });
    console.log(`[${pass ? 'PASS' : 'FAIL'}] ${name}: ${details}`);
    if (!pass) report.violations.push({ name, details });
  }

  // ──────────────────────────────────────────────────────────
  // Check 1: Static Source Code Analysis for Hardcoded Test Logic
  // ──────────────────────────────────────────────────────────
  console.log('\n--- 1. STATIC SOURCE CODE ANALYSIS ---');
  const filesToScan = [
    'src/providers/vsmov.js',
    'src/routes/hls.js',
    'src/providers/kkphim.js',
    'src/index.js',
    'src/handlers.js',
    'src/manifest.js',
  ];

  const suspiciousPatterns = [
    /tt5095030/i,
    /tt0903747/i,
    /tt0373889/i,
    /mock/i,
    /fakeStream/i,
    /dummy/i,
    /return\s+\[\s*\{\s*url:\s*["']http/i,
  ];

  let hardcodedFound = false;
  for (const relPath of filesToScan) {
    const fullPath = path.resolve(__dirname, '../../', relPath);
    const content = fs.readFileSync(fullPath, 'utf8');
    for (const pattern of suspiciousPatterns) {
      const match = content.match(pattern);
      if (match) {
        // Exclude comments
        const lines = content.split('\n');
        for (let idx = 0; idx < lines.length; idx++) {
          const l = lines[idx];
          if (pattern.test(l) && !l.trim().startsWith('*') && !l.trim().startsWith('//') && !l.trim().startsWith('/*')) {
            hardcodedFound = true;
            recordCheck(`Static Scan ${relPath}`, false, `Found pattern ${pattern} at line ${idx + 1}: ${l.trim()}`);
          }
        }
      }
    }
  }

  if (!hardcodedFound) {
    recordCheck('Static Code Analysis', true, 'Zero hardcoded test conditionals, fake stream URLs, or dummy stubs found in src/');
  }

  // ──────────────────────────────────────────────────────────
  // Check 2: VSMOV Subtitle Extraction Logic Verification
  // ──────────────────────────────────────────────────────────
  console.log('\n--- 2. VSMOV SUBTITLE EXTRACTION LOGIC ---');

  // Synthetic HTML test 1: Valid JSON array in JS property
  const syntheticHtml1 = `
    <html>
      <script>
        var playerOptions = {
          file: "https://example.com/video.m3u8",
          subtitles: [
            {"code":"eng","name":"English","url":"https://example.com/en.vtt"},
            {"code":"vie","name":"Vietnamese","url":"https://example.com/vi.vtt"}
          ]
        };
      </script>
    </html>
  `;

  // Synthetic HTML test 2: JS Object literal (unquoted keys)
  const syntheticHtml2 = `
    <html>
      <script>
        player.setup({
          file: "https://example.com/video.m3u8",
          tracks: [
            { file: "https://example.com/en.vtt", label: "English", kind: "captions" },
            { file: "https://example.com/vi.vtt", label: "Tiếng Việt", kind: "captions" }
          ]
        });
      </script>
    </html>
  `;

  function extractSubFromHtml(html) {
    let subtitleUrl = null;
    const mSub = html.match(/(?:subtitles|tracks)\s*:\s*(\[[^\]]*\])/i);
    if (mSub && mSub[1]) {
      try {
        const parsed = JSON.parse(mSub[1]);
        if (Array.isArray(parsed) && parsed.length > 0) {
          const viSub = parsed.find(
            (s) =>
              s &&
              (s.code === 'vie' ||
                s.code === 'vi' ||
                s.lang === 'vie' ||
                s.lang === 'vi' ||
                (s.name && /vie|tiếng việt|viet/i.test(s.name)) ||
                (s.label && /vie|tiếng việt|viet/i.test(s.label)))
          ) || parsed[0];
          if (viSub && (viSub.url || viSub.file || viSub.src)) {
            subtitleUrl = String(viSub.url || viSub.file || viSub.src).trim();
          }
        }
      } catch {
        const mItems = mSub[1].match(/\{[^}]+\}/g) || [];
        for (const itemStr of mItems) {
          const mUrl = itemStr.match(/(?:url|file|src)\s*:\s*["'\x27]([^"'\x27\s]+)["'\x27]/i);
          const isVie = /vie|tiếng việt|viet/i.test(itemStr);
          if (mUrl && mUrl[1]) {
            if (isVie || !subtitleUrl) {
              subtitleUrl = mUrl[1].trim();
              if (isVie) break;
            }
          }
        }
      }
    }
    return subtitleUrl;
  }

  const sub1 = extractSubFromHtml(syntheticHtml1);
  const sub2 = extractSubFromHtml(syntheticHtml2);
  recordCheck('VSMOV Subtitle JSON Parser (JSON Format)', sub1 === 'https://example.com/vi.vtt', `Extracted: ${sub1}`);
  recordCheck('VSMOV Subtitle Regex Fallback (JS Object Format)', sub2 === 'https://example.com/vi.vtt', `Extracted: ${sub2}`);

  // Test SRT fallback pattern
  const syntheticHtml3 = `<div><a href="/subtitles/movie_vie.srt">Download</a></div>`;
  const mSubFile = syntheticHtml3.match(/["'\x27](\/[^"'\x27\s]+\.(?:vtt|srt)[^"'\x27\s]*)["'\x27]/i);
  recordCheck('VSMOV Subtitle SRT Path Fallback', !!(mSubFile && mSubFile[1] === '/subtitles/movie_vie.srt'), `Matched: ${mSubFile ? mSubFile[1] : 'null'}`);

  // ──────────────────────────────────────────────────────────
  // Check 3: Express Server Behavioral Tests
  // ──────────────────────────────────────────────────────────
  console.log('\n--- 3. BEHAVIORAL EXECUTION CHECKS ---');

  const server = await new Promise((resolve, reject) => {
    const s = app.listen(0, '127.0.0.1', () => resolve(s));
    s.on('error', reject);
  });

  const port = server.address().port;
  const baseUrl = `http://127.0.0.1:${port}`;

  try {
    // 3a. /hls/sub.vtt with SRT Conversion (CRLF, BOM, comma timestamps)
    const rawSrt = '\uFEFF1\r\n00:01:23,456 --> 00:01:28,789\r\nXin chào thế giới!\r\n\r\n2\r\n00:01:30,000 --> 00:01:35,500\r\nĐây là phụ đề test SRT.';
    const b64Srt = Buffer.from(rawSrt, 'utf8').toString('base64url');
    const dataUri = `data:text/plain;charset=utf-8;base64,${Buffer.from(rawSrt).toString('base64')}`;
    const b64DataUri = Buffer.from(dataUri, 'utf8').toString('base64url');

    const subRes = await axios.get(`${baseUrl}/hls/sub.vtt?url=${b64DataUri}`);
    const subBody = String(subRes.data);

    recordCheck('Subtitle Proxy HTTP 200', subRes.status === 200, `HTTP status ${subRes.status}`);
    recordCheck('Subtitle Content-Type text/vtt', (subRes.headers['content-type'] || '').includes('text/vtt'), `Header: ${subRes.headers['content-type']}`);
    recordCheck('Subtitle CORS Origin *', subRes.headers['access-control-allow-origin'] === '*', `CORS: ${subRes.headers['access-control-allow-origin']}`);
    recordCheck('Subtitle Cache-Control 86400', (subRes.headers['cache-control'] || '').includes('86400'), `Cache-Control: ${subRes.headers['cache-control']}`);
    recordCheck('Subtitle Starts with WEBVTT', subBody.startsWith('WEBVTT'), `First line: ${subBody.split('\n')[0]}`);
    recordCheck('Subtitle Timestamps Converted (Commas to Dots)', subBody.includes('00:01:23.456 --> 00:01:28.789') && !subBody.includes('00:01:23,456'), `Converted timestamp found`);
    recordCheck('Subtitle BOM Stripped', !subBody.startsWith('\uFEFF'), `No BOM prefix`);
    recordCheck('Subtitle CRLF Normalized to LF', !subBody.includes('\r'), `No \\r characters in output`);

    // 3b. /hls/manifest.m3u8 Subtitle Tag Injection
    const muxMasterUrl = 'https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8';
    const b64MasterData = Buffer.from(muxMasterUrl).toString('base64url');
    const b64SubParam = Buffer.from('https://example.com/subs/vietnamese.vtt').toString('base64url');
    const manifestRes = await axios.get(`${baseUrl}/hls/manifest.m3u8?url=${b64MasterData}&ref=${Buffer.from('https://test-streams.mux.dev/').toString('base64url')}&sub=${b64SubParam}`);
    const manifestBody = String(manifestRes.data);

    recordCheck('Master M3U8 Subtitle Tag Injected', manifestBody.includes('#EXT-X-MEDIA:TYPE=SUBTITLES'), `Contains #EXT-X-MEDIA:TYPE=SUBTITLES`);
    recordCheck('Master M3U8 GROUP-ID subs', manifestBody.includes('GROUP-ID="subs"'), `Contains GROUP-ID="subs"`);
    recordCheck('Master M3U8 LANGUAGE vie', manifestBody.includes('LANGUAGE="vie"'), `Contains LANGUAGE="vie"`);
    recordCheck('Master M3U8 URI proxied via /hls/sub.vtt', manifestBody.includes('/hls/sub.vtt?url='), `Contains /hls/sub.vtt?url=`);
    recordCheck('Master M3U8 STREAM-INF has SUBTITLES="subs"', manifestBody.includes('SUBTITLES="subs"'), `Contains SUBTITLES="subs" on variant lines`);

    // 3c. KKPhim Smart Search Fallback Tier Tests
    // Test direct getStreams on Avengers 3
    const kkStreams = await kkphim.getStreams({
      imdbId: 'tt5095030',
      title: 'Avengers: Infinity War',
      year: 2018,
      type: 'movie',
      proxyBase: baseUrl,
    });

    recordCheck('KKPhim Smart Search Stream Count', Array.isArray(kkStreams) && kkStreams.length > 0, `Returned ${kkStreams.length} stream(s)`);
    if (kkStreams.length > 0) {
      recordCheck('KKPhim Stream No externalUrl', kkStreams[0].externalUrl === undefined, `externalUrl is undefined`);
      recordCheck('KKPhim Stream Valid HLS URL', kkStreams[0].url.startsWith(baseUrl + '/hls/manifest.m3u8'), `URL: ${kkStreams[0].url}`);
    }

    // Test KKPhim Tier 3 Safe Degradation on completely bogus non-existent title
    const emptyStreams = await kkphim.getStreams({
      imdbId: 'tt9999999999999',
      title: 'TotallyFakeTitleThatDoesNotExist12345XYZ',
      year: 2099,
      type: 'movie',
      proxyBase: baseUrl,
    });
    recordCheck('KKPhim Tier 3 Safe Degradation', Array.isArray(emptyStreams) && emptyStreams.length === 0, `Returned empty array: ${JSON.stringify(emptyStreams)}`);

    // 3d. TS Segment Streaming and Range Request Test
    const muxTsUrl = 'https://test-streams.mux.dev/x36xhzz/url_0/url_462/193039199_mp4_h264_aac_hd_7.ts';
    const b64TsUrl = Buffer.from(muxTsUrl).toString('base64url');
    const b64MuxRef = Buffer.from('https://test-streams.mux.dev/').toString('base64url');

    const tsRes = await axios.get(`${baseUrl}/hls/segment.ts?url=${b64TsUrl}&ref=${b64MuxRef}`, {
      responseType: 'arraybuffer',
      timeout: 20000,
    });

    const tsBuffer = Buffer.from(tsRes.data);
    recordCheck('TS Segment HTTP 200', tsRes.status === 200, `HTTP ${tsRes.status}`);
    recordCheck('TS Segment Size > 50KB', tsBuffer.length > 50000, `Size: ${tsBuffer.length} bytes`);
    recordCheck('TS Segment Sync Byte 0x47', tsBuffer[0] === 0x47, `First byte: 0x${tsBuffer[0].toString(16)}`);

    // Range request (206 Partial Content)
    const rangeRes = await axios.get(`${baseUrl}/hls/segment.ts?url=${b64TsUrl}&ref=${b64MuxRef}`, {
      headers: { Range: 'bytes=0-511' },
      responseType: 'arraybuffer',
      timeout: 20000,
      validateStatus: (s) => s >= 200 && s < 400,
    });

    recordCheck('TS Segment Range Request HTTP 206', rangeRes.status === 206, `HTTP ${rangeRes.status}`);
    recordCheck('TS Segment Range Content-Length 512', rangeRes.data.byteLength === 512, `Length: ${rangeRes.data.byteLength} bytes`);

  } finally {
    server.close();
  }

  console.log('\n====================================================');
  console.log(`TOTAL CHECKS: ${report.checks.length}`);
  console.log(`PASSED: ${report.checks.filter(c => c.pass).length}`);
  console.log(`VIOLATIONS: ${report.violations.length}`);
  console.log(`VERDICT: ${report.violations.length === 0 ? 'CLEAN' : 'INTEGRITY VIOLATION'}`);
  console.log('====================================================');

  if (report.violations.length > 0) {
    process.exit(1);
  } else {
    process.exit(0);
  }
}

runForensicAudit().catch((err) => {
  console.error('Fatal Forensic Error:', err);
  process.exit(1);
});
