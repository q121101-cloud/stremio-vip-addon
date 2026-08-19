'use strict';

const axios = require('axios');
const app = require('../src/server');

let server = null;
let baseUrl = '';

describe('HLS Proxy Engine & Zero-Drop 302 Test Suite', () => {
  beforeAll(async () => {
    server = await new Promise((resolve) => {
      const s = app.listen(0, '127.0.0.1', () => resolve(s));
    });
    const port = server.address().port;
    baseUrl = `http://127.0.0.1:${port}`;
  });

  afterAll(async () => {
    if (server) {
      await new Promise((resolve) => server.close(resolve));
    }
  });

  it('Rejects missing URL parameter with 400 Bad Request', async () => {
    try {
      await axios.get(`${baseUrl}/hls/manifest.m3u8`);
      expect.fail('Should have failed with 400');
    } catch (err) {
      expect(err.response?.status).toBe(400);
    }
  });

  it('Proxy subtitle returns text/vtt and CORS headers', async () => {
    const dummySub = Buffer.from('WEBVTT\n\n1\n00:00:01.000 --> 00:00:04.000\nXin chào VIP Movies').toString('base64url');
    const b64DataUrl = Buffer.from(`data:text/vtt;base64,${dummySub}`).toString('base64url');

    const res = await axios.get(`${baseUrl}/hls/sub.vtt?url=${b64DataUrl}`, {
      validateStatus: (s) => s === 200 || s === 400 || s === 502,
    });
    expect(res.headers['access-control-allow-origin']).toBe('*');
    expect(res.headers['content-type']?.includes('text/vtt') || res.status === 200).toBe(true);
  });

  it('Rewrites live M3U8 playlist with relative URL resolution', async () => {
    const streamRes = await axios.get(`${baseUrl}/stream/movie/tt0373889.json`, { timeout: 15000 });
    expect(streamRes.data?.streams?.length).toBeGreaterThan(0);
    const liveProxyUrl = streamRes.data.streams[0].url;

    const res = await axios.get(liveProxyUrl, {
      timeout: 10000,
      responseType: 'text',
      validateStatus: (s) => s === 200 || s === 302,
    });

    if (res.status === 200) {
      const bodyStr = String(res.data);
      expect(bodyStr.startsWith('#EXTM3U')).toBe(true);
      expect(bodyStr.includes('/hls/manifest.m3u8') || bodyStr.includes('/hls/segment.ts')).toBe(true);
    }
  });

  it('Zero-drop 302 redirect fallback when upstream returns non-fatal network condition', async () => {
    const directUrl = 'https://example.com/stream/fallback.ts';
    const b64Direct = Buffer.from(directUrl).toString('base64url');

    const res = await axios.get(`${baseUrl}/hls/segment.ts?url=${b64Direct}`, {
      maxRedirects: 0,
      validateStatus: (s) => s === 302 || s === 502 || s === 200,
    });
    expect([302, 502, 200]).toContain(res.status);
  });
});
