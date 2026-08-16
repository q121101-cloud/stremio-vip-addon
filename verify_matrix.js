'use strict';
const axios = require('axios');

async function runMatrixTest() {
  process.env.PORT = '7321';
  // Start the server
  const app = require('./src/index.js');
  await new Promise(r => setTimeout(r, 1200));

  const BASE = 'http://localhost:7321';

  // Target movies/series across diverse genres to test
  const testCases = [
    { category: 'Phim Lẻ Mới', type: 'movie', slug: 'joe-dirt-2-ga-thua-cuoc-dep-trai', epName: null },
    { category: 'Phim Lẻ Hành Động', type: 'movie', slug: 'chuyen-cong-tac-ba-dao', epName: null },
    { category: 'Phim Lẻ Chiến Tranh', type: 'movie', slug: 'munich-bo-vuc-chien-tranh', epName: null },
    { category: 'Phim Bộ Anime / Manga', type: 'series', slug: 'one-piece', epName: '1' },
    { category: 'Phim Hoạt Hình Mới', type: 'series', slug: 'sayonara-lara', epName: '1' },
    { category: 'Phim Hoạt Hình 3D', type: 'series', slug: 'kabushikigaisha-magi-lumiere-2nd-season', epName: '1' },
    { category: 'Phim Cổ Trang Trung Quốc', type: 'series', slug: 'hoa-khai-cam-tu', epName: '1' },
    { category: 'Phim Tình Cảm / K-Drama', type: 'series', slug: 'tia-sang-cua-ngay-mai', epName: '1' },
    { category: 'Phim Huyền Huyễn', type: 'series', slug: 'that-nghiep-chuyen-sinh-phan-3', epName: '1' }
  ];

  const results = [];

  console.log('╔═══════════════════════════════════════════════════════════════════════════════════╗');
  console.log('║        🎬  KIỂM THỬ TOÀN DIỆN LUỒNG PHÁT HLS (.m3u8 & .ts) - VIP MOVIES           ║');
  console.log('╚═══════════════════════════════════════════════════════════════════════════════════╝\n');

  for (let i = 0; i < testCases.length; i++) {
    const tc = testCases[i];
    const streamId = tc.type === 'movie' ? `nguonc:${tc.slug}` : `nguonc:${tc.slug}:0:${tc.epName || '1'}`;
    console.log(`[${i + 1}/${testCases.length}] Đang kiểm tra: ${tc.category} (${tc.slug})...`);

    const resultItem = {
      index: i + 1,
      category: tc.category,
      type: tc.type,
      slug: tc.slug,
      filmName: '',
      streamCount: 0,
      m3u8Status: 'N/A',
      m3u8Type: 'N/A',
      segmentStatus: 'N/A',
      segmentType: 'N/A',
      segmentSizeKB: 0,
      result: 'FAILED',
      error: null
    };

    try {
      // 1. Get Stream
      const sRes = await axios.get(`${BASE}/stream/${tc.type}/${streamId}.json`, { timeout: 15000 });
      const streams = sRes.data?.streams || [];
      resultItem.streamCount = streams.length;

      if (streams.length === 0) {
        throw new Error('Không tìm thấy stream nào');
      }

      const proxyStream = streams.find(s => s.url && s.url.includes('/hls/extract'));
      if (!proxyStream) {
        throw new Error('Thiếu luồng HLS Proxy (/hls/extract)');
      }

      // 2. Fetch M3U8 Playlist
      const m3u8Res = await axios.get(proxyStream.url, { timeout: 15000 });
      resultItem.m3u8Status = m3u8Res.status;
      resultItem.m3u8Type = m3u8Res.headers['content-type'] || '';

      const m3u8Content = String(m3u8Res.data || '');
      if (m3u8Res.status !== 200 || !m3u8Content.includes('#EXTM3U')) {
        throw new Error(`Playlist M3U8 không hợp lệ (HTTP ${m3u8Res.status})`);
      }

      // 3. Extract 1st segment URL
      const lines = m3u8Content.split('\n');
      const segLine = lines.find(l => l.trim() && !l.startsWith('#'));
      if (!segLine) {
        throw new Error('Không tìm thấy dòng phân đoạn trong file M3U8');
      }

      // 4. Fetch 1st TS segment
      const segRes = await axios.get(segLine.trim(), {
        responseType: 'arraybuffer',
        timeout: 25000
      });

      resultItem.segmentStatus = segRes.status;
      resultItem.segmentType = segRes.headers['content-type'] || 'binary/octet-stream';
      resultItem.segmentSizeKB = Math.round(segRes.data.byteLength / 1024);

      if (segRes.status === 200 && segRes.data.byteLength > 0) {
        resultItem.result = 'PASSED';
        console.log(`   -> ✅ THÀNH CÔNG: M3U8 (200 OK) | Phân đoạn: ${resultItem.segmentSizeKB} KB (${resultItem.segmentType})`);
      } else {
        throw new Error(`Phân đoạn video trả về status ${segRes.status} hoặc rỗng`);
      }
    } catch (err) {
      resultItem.error = err.message;
      console.log(`   -> ❌ THẤT BẠI: ${err.message}`);
    }

    results.push(resultItem);
  }

  console.log('\n═══════════════════════════════════════════════════════════════════════════════════');
  console.log('                        BẢNG TỔNG HỢP KIỂM THỬ CHI TIẾT');
  console.log('═══════════════════════════════════════════════════════════════════════════════════');
  console.table(results.map(r => ({
    STT: r.index,
    'Thể loại': r.category,
    Slug: r.slug,
    'Streams': r.streamCount,
    'M3U8 Status': r.m3u8Status,
    'TS Segment': `${r.segmentStatus} (${r.segmentSizeKB} KB)`,
    'Định dạng': r.segmentType,
    'Kết quả': r.result === 'PASSED' ? '✅ ĐẠT' : '❌ LỖI'
  })));

  const allPassed = results.every(r => r.result === 'PASSED');
  if (allPassed) {
    console.log(`\n🎉 TẤT CẢ ${results.length}/${testCases.length} PHIM ĐỀU ĐẠT 100% CHUẨN PHÁT STREAM!`);
    process.exit(0);
  } else {
    console.error(`\n❌ CÓ PHIM BỊ LỖI!`);
    process.exit(1);
  }
}

runMatrixTest().catch(err => {
  console.error('\nFATAL:', err.message);
  process.exit(1);
});
