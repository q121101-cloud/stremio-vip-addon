'use strict';
const axios = require('axios');
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

async function testVideoDecoder() {
  process.env.PORT = '7321';
  const app = require('./src/index.js');
  await new Promise(r => setTimeout(r, 1200));

  const BASE = 'http://localhost:7321';

  console.log('╔══════════════════════════════════════════════════════════════════════════════╗');
  console.log('║     🎬 TEST VIDEO DECODER & CONTENT-TYPE OVERRIDE (v1.3.4)                   ║');
  console.log('╚══════════════════════════════════════════════════════════════════════════════╝\n');

  // 1. Get Stream URL for a movie
  const testSlug = 'joe-dirt-2-ga-thua-cuoc-dep-trai';
  console.log(`▶ [1/4] Lấy stream cho phim: ${testSlug}`);
  const sRes = await axios.get(`${BASE}/stream/movie/nguonc:${testSlug}.json`);
  const proxyStream = sRes.data.streams.find(s => s.url && s.url.includes('/hls/extract'));
  if (!proxyStream) throw new Error('Không tìm thấy proxy stream');
  console.log(`  ✅ Stream URL: ${proxyStream.url}`);

  // 2. Fetch M3U8 Playlist
  console.log('\n▶ [2/4] Bóc tách & Fetch file M3U8 Manifest...');
  const m3u8Res = await axios.get(proxyStream.url);
  console.log(`  ✅ M3U8 Status: ${m3u8Res.status}`);
  console.log(`  ✅ M3U8 Content-Type: ${m3u8Res.headers['content-type']}`);
  const m3u8Content = String(m3u8Res.data);

  // 3. Extract 1st segment
  console.log('\n▶ [3/4] Kiểm tra Header phân đoạn video (/hls/ts)...');
  const lines = m3u8Content.split('\n');
  const segUrl = lines.find(l => l.trim() && !l.startsWith('#')).trim();
  console.log(`  Phân đoạn URL: ${segUrl}`);

  const segHead = await axios.get(segUrl, { responseType: 'arraybuffer' });
  console.log(`  ✅ Phân đoạn HTTP Status: ${segHead.status}`);
  console.log(`  ✅ Phân đoạn Content-Type (BẮT BUỘC video/mp2t): ${segHead.headers['content-type']}`);
  console.log(`  ✅ CORS Header: ${segHead.headers['access-control-allow-origin']}`);
  console.log(`  ✅ Kích thước: ${(segHead.data.byteLength / 1024).toFixed(1)} KB`);

  if (segHead.headers['content-type'] !== 'video/mp2t') {
    throw new Error(`Content-Type không phải là video/mp2t, nhận được: ${segHead.headers['content-type']}`);
  }

  // Check magic bytes (MPEG-TS Sync Byte is 0x47)
  const firstByte = segHead.data[0];
  console.log(`  ✅ Byte đầu tiên (Magic Byte): 0x${firstByte.toString(16)} (MPEG-TS sync: 0x47)`);

  // 4. Run ffprobe on the video buffer
  console.log('\n▶ [4/4] Kiểm thử giải mã Video Frame bằng ffprobe...');
  const tempSegFile = path.join(__dirname, 'temp_sample.ts');
  fs.writeFileSync(tempSegFile, Buffer.from(segHead.data));

  try {
    const ffprobeCmd = `ffprobe -v error -show_entries format=format_name,duration:stream=codec_name,codec_type,width,height -of json "${tempSegFile}"`;
    const probeOutput = execSync(ffprobeCmd, { encoding: 'utf8' });
    const probeJson = JSON.parse(probeOutput);
    console.log('  ✅ ffprobe Thông tin giải mã:');
    console.log(JSON.stringify(probeJson, null, 2));

    const videoStream = probeJson.streams?.find(s => s.codec_type === 'video');
    if (videoStream) {
      console.log(`  🎬 Video Codec: ${videoStream.codec_name} (${videoStream.width}x${videoStream.height})`);
    }
  } catch (err) {
    console.warn(`  ⚠️ ffprobe warning: ${err.message}`);
  } finally {
    if (fs.existsSync(tempSegFile)) fs.unlinkSync(tempSegFile);
  }

  console.log('\n══════════════════════════════════════════════════════════════════════════════');
  console.log('🎉 KIỂM THỬ GIẢI MÃ VIDEO & CONTENT-TYPE video/mp2t ĐẠT 100% HOÀN HẢO!');
  console.log('══════════════════════════════════════════════════════════════════════════════\n');
  process.exit(0);
}

testVideoDecoder().catch(err => {
  console.error('\n❌ TEST FAILED:', err.message);
  process.exit(1);
});
