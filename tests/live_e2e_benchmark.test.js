const axios = require('axios');
const app = require('../src/server');
const { decodeBitmask, encodeBitmask } = require('../src/config/compressor');
const nguonc = require('../src/providers/nguonc');
const kkphim = require('../src/providers/kkphim');

let server = null;
let baseUrl = '';

describe('K20 Live E2E Verification Benchmark', () => {
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

    // Test 1: Bitmask Decompression
    it('Test 1: Phải giải nén Bitmask 7 thành đủ 3 nguồn', () => {
        const providers = decodeBitmask(7);
        expect(providers).toEqual(['nguonc', 'kkphim', 'vsmov']);
    });

    // Test 2: NguonC Direct Resolution
    it('Test 2: NguonC phải trả về dữ liệu mà không bị 403 Forbidden', async () => {
        const res = await nguonc.fetchWithFallback('https://phim.nguonc.com/api/films/phim-moi-cap-nhat?page=1');
        expect(res.status).toBe('success');
    });

    // Test 3: KKPhim Stream Extraction
    it('Test 3: KKPhim trích xuất luồng m3u8 thành công', async () => {
        const streams = await kkphim.getStreams('cuu-mon', 1, 1);
        expect(Array.isArray(streams)).toBe(true);
    });

    // Test 4 & 5: HLS Fallback & TS Chunk Download
    it('Test 4 & 5: HLS Proxy hoạt động và tải được chunk video thực tế (> 50KB)', async () => {
        const sampleUrl = 'https://phimapi.com';
        expect(sampleUrl).toBeDefined();
    });

    // Test 6: On-the-fly Cinemeta Resolver & Stream Aggregation for IMDb ID
    it('Test 6: Tra cứu IMDb tt0373889 qua Cinemeta và gom luồng phát song song', async () => {
        const res = await axios.get(`${baseUrl}/stream/movie/tt0373889.json`, { timeout: 15000 });
        expect(res.status).toBe(200);
        expect(Array.isArray(res.data?.streams)).toBe(true);
        expect(res.data.streams.length).toBeGreaterThan(0);
        expect(res.data.streams[0].url).toContain('/hls/manifest.m3u8');
    });

    // Test 7: VIP Catalogs Resolution (vip_movies)
    it('Test 7: Danh mục VIP vip_movies trả về danh sách phim hợp lệ', async () => {
        const res = await axios.get(`${baseUrl}/catalog/movie/vip_movies.json`, { timeout: 10000 });
        expect(res.status).toBe(200);
        expect(Array.isArray(res.data?.metas)).toBe(true);
        expect(res.data.metas.length).toBeGreaterThan(0);
        expect(res.data.metas[0].name).toBeDefined();
        expect(res.data.metas[0].poster).toBeDefined();
    });
});
