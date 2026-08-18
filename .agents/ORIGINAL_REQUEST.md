# Original User Request

## 2026-08-18T09:45:07Z

Đại tu toàn diện Engine v1.7.0 cho Stremio VIP Movies Addon: Sửa triệt để lỗi 404 HLS Proxy cho phim Hàn/Âu Mỹ bằng cơ chế phân giải URL cha đa tầng, viết lại HTML Cheerio Scraper thực tế cho STP/CLBPX/YAN, siết chặt thuật toán so khớp (Strict Matching Guard - chống gán nhầm Donghua vào KDrama/US-UK), và kiểm thử phát video thực tế liên tục (E2E Playback Verification).

Working directory: `/Users/quan/.gemini/antigravity/scratch/stremio-nguonc-addon`
Integrity mode: development

---

## Requirements

### R1. Đại tu toàn bộ Bộ định tuyến HLS Proxy (`src/routes/hls.js`)
- **Phân giải Đường dẫn 2 Tầng (Multi-Level M3U8 Parent Resolver)**:
  - Khi Master Playlist trả về Sub-variant Playlist: Bọc link Sub-variant vào `/hls/manifest.m3u8?url=${encodeBase64Url(subVariantAbsoluteUrl)}&ref=${refParam}`.
  - Khi Sub-variant Playlist trả về phân đoạn `.ts`: Dùng chính URL của Sub-variant đó làm gốc (`baseUrl`) để `new URL(segmentLine, subVariantUrl).href`.
- **Header Giả lập Trình duyệt Đầy đủ (Bypass CDN 403/404)**:
  - Cung cấp Header mặc định cho mọi request axios tải M3U8 và Segment:
    * `User-Agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36`
    * `Accept: */*`
    * `Accept-Language: vi,en-US;q=0.9,en;q=0.8`
    * `Connection: keep-alive`
  - Header Referer & Origin động:
    * KKPhim / Opstream / Vlcdn / Phim1280: `Referer: https://player.phimapi.com/` (hoặc origin của URL video)
    * NguonC: `Referer: https://phim.nguonc.com/`
    * VSMOV: `Referer: https://vsmov.com/`
    * STP: `Referer: https://sieutamphim.pro/`
    * CLBPX: `Referer: https://clbphimxua.info/`
    * YAN: `Referer: https://yanhh3d.pw/`
- **Tải Nhị phân An toàn (`/hls/segment.ts`)**:
  - Cấu hình `responseType: 'arraybuffer'`, `maxRedirects: 5`, `timeout: 15000`.
  - Gửi Header phản hồi: `Content-Type: video/MP2T`, `Access-Control-Allow-Origin: *`, `Cache-Control: public, max-age=3600`.

### R2. Viết lại HTML Cheerio Scraper thực tế cho STP, CLBPX, YAN (`src/providers/`)
- **[A] `src/providers/stp.js` (sieutamphim.pro)**:
  - `getCatalog`: Dùng axios + cheerio tải HTML trang chủ/danh mục của `https://sieutamphim.pro/` -> parse thẻ card phim (poster, title, slug/url) -> trả về mảng `metas` chuẩn Stremio.
  - `getStreams`: Tìm kiếm tại `https://sieutamphim.pro/?s=${encodeURIComponent(cleanTitle)}` -> cào trang tập phim -> trích xuất link `.m3u8` từ thẻ player/iframe hoặc script.
- **[B] `src/providers/clbpx.js` (clbphimxua.info)**:
  - `getCatalog`: Cào trực tiếp HTML danh mục phim TVB/Cổ trang từ `https://clbphimxua.info/`.
  - `getStreams`: Tìm kiếm phim -> cào link tập -> trích xuất direct `.m3u8` lồng tiếng.
- **[C] `src/providers/yan.js` (yanhh3d.pw)**:
  - `getCatalog`: Cào HTML trang chủ Donghua từ `https://yanhh3d.pw/`.
  - `getStreams`: **BẮT BUỘC kiểm tra thể loại/tiêu đề**: Nếu là phim người đóng (Live-Action), KDrama, US-UK thì bỏ qua ngay (`return []`). Chỉ xử lý phim có từ khóa hoạt hình / 3D / Donghua.

### R3. Tối ưu hóa tìm kiếm cho Phim Hàn & Âu Mỹ (KKPhim & NguonC)
- **Đa dạng hóa từ khóa tìm kiếm (Multi-Keyword Fallback)**:
  - Khi nhận request phim (ví dụ: `Lanterns`, `9-1-1`, `Teach You a Lesson`, `A Shop for Killers`):
    * Thử 1: Tìm theo tên tiếng Anh gốc (`meta.name` / `title`).
    * Thử 2: Tìm theo tên tiếng Việt (nếu có trong tiêu đề hoặc aliases).
    * Thử 3: Bỏ tất cả số mùa `Season 1`, `Phần 9`, `P1` và ký tự đặc biệt để tìm từ khóa chính.
- **Khớp số tập linh hoạt**: Khớp đúng mọi định dạng tập (`1`, `01`, `Tập 01`, `tap-1`, `Full`).

### R4. Bộ kiểm thử E2E thực tế trên Link Thật (`tests/verify_v170_playback.js`)
- Khởi động server test nội bộ và kiểm tra:
  1. **Test Catalog**: Gọi `GET /catalog/movie/stp_movies_phimle.json` và `GET /catalog/series/clbpx_series_tvb.json` -> Trả về HTTP 200 kèm danh sách `metas.length > 0`.
  2. **Test Phim Hàn / Âu Mỹ**:
     - *Teach You A Lesson* Tập 1 (KKPhim & NguonC).
     - *A Shop for Killers* Tập 1 (KKPhim & NguonC).
     - *Lanterns* hoặc *Avengers 3*.
  3. **Xác thực Playback**:
     - Fetch `/hls/manifest.m3u8` trả về HTTP 200.
     - Fetch trực tiếp 2 phân đoạn `/hls/segment.ts` đầu tiên, đạt HTTP 200 và dung lượng buffer > 100KB.
  4. **Xác thực YAN Guard**: Đảm bảo khi fetch stream cho phim Hàn *Teach You A Lesson*, YAN không trả về bất kỳ stream Donghua rác nào (`streams.length === 0` từ YAN).
- Tự động lặp lại chu trình sửa mã nguồn cho đến khi 100% bài test PASS.

### R5. Versioning, Brand Signature & Deploy
- Cập nhật version lên `1.7.0` trong `package.json`, `src/manifest.js`, và footer `src/handlers.js`:
  `VIP Movies Addon v1.7.0 • Designed with Taste by <span class="brand-highlight">Q121101</span>`
- Commit và push lên GitHub:
  ```bash
  git remote set-url origin https://<TOKEN>@github.com/q121101-cloud/stremio-vip-addon.git
  git add . && git commit -m "Engine v1.7.0: Complete Playback Overhaul - Resolved HLS Sub-variant 404, Implemented True HTML Scrapers for STP/CLBPX/YAN & Fixed False Positive Matching"
  git push origin main
  git remote set-url origin https://github.com/q121101-cloud/stremio-vip-addon.git
  ```

---

## Acceptance Criteria

### Playback & Matching Integrity
- [ ] Sub-variant playlists và các phân đoạn `.ts` của phim Hàn & Âu Mỹ phân giải đúng baseUrl, không bị lỗi 404.
- [ ] Phân đoạn `.ts` tải qua `/hls/segment.ts` trả về HTTP 200/206 với dung lượng > 100KB và bắt đầu bằng sync byte `0x47`.
- [ ] YAN provider không trả về stream cho phim người đóng (Live-Action / KDrama / Hollywood).
- [ ] STP và CLBPX cào catalog và trích xuất link M3U8 từ HTML thật với cheerio.

### Test Suites & Zero Regression
- [ ] `node tests/verify_v170_playback.js` hoàn thành với 100% assertions PASS.
- [ ] `node tests/verify_all_providers_playback.js` đạt 100% PASS.
- [ ] `npm test` đạt 50/50 PASS.
- [ ] `node --check src/index.js` không có lỗi cú pháp.

### Deployment
- [ ] Version `1.7.0` đồng bộ trong `package.json`, `src/manifest.js`, `src/handlers.js`.
- [ ] `git push origin main` thành công lên repository.
