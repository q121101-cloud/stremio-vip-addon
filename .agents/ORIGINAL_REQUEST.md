# Original User Request

## Initial Request — 2026-08-18T09:06:28Z

Gói nâng cấp Engine v1.6.2 cho Stremio VIP Movies Addon: Sửa triệt để lỗi 404 HLS Proxy, kích hoạt hoàn toàn 22 danh mục catalog và luồng stream cho toàn bộ 6 nguồn (VSMOV 4K, KKPhim, NguonC, STP, CLBPX, YanHH3D), thiết lập vòng lặp kiểm thử phát video thực tế liên tục (Debug -> Fix -> Test) cho đến khi 100% các nguồn tải thành công m3u8 và video chunk .ts > 100KB.

Working directory: `/Users/quan/.gemini/antigravity/scratch/stremio-nguonc-addon`
Integrity mode: development

---

## Requirements

### R1. Sửa triệt để lỗi 404 HLS Proxy (`src/routes/hls.js`)
- **Phân giải đường dẫn tương đối (Relative Path Resolver)**:
  - Sử dụng `new URL(targetUrl, parentUrl).href` để chuyển đổi toàn bộ URL tương đối của phân đoạn `.ts`, playlist con và key từ upstream thành URL tuyệt đối trước khi bọc proxy.
- **Bảo toàn query params & token**:
  - Dùng chuẩn `Buffer.from(str, 'base64url')` cho cả encode và decode để tuyệt đối không làm mất các tham số bảo mật (`?token=...&sign=...`).
- **Cấu hình Header Referer/Origin động chuẩn xác cho từng CDN**:
  - KKPhim / Opstream / Vlcdn / Phim1280: `Referer: https://player.phimapi.com/` (hoặc origin của chính URL video).
  - NguonC: `Referer: https://phim.nguonc.com/`.
  - VSMOV: `Referer: https://vsmov.com/`.
  - STP: `Referer: https://sieutamphim.pro/`.
  - CLBPX: `Referer: https://clbphimxua.info/`.
  - YAN: `Referer: https://yanhh3d.pw/`.
- **Hỗ trợ tải phân đoạn `.ts` mượt mà**:
  - Thiết lập `responseType: 'stream'` / `'arraybuffer'`, `maxRedirects: 5`, hỗ trợ HTTP Range 206 cho playback seek.

### R2. Khai báo 22 danh mục Catalog vào Manifest (`src/manifest.js`)
- Đảm bảo đầy đủ 22 danh mục catalog của 6 cụm nguồn trong `ALL_CATALOGS` và `MANIFEST.catalogs`:
  - **VSMOV**: `vsmov-4k-sieu-net`, `vsmov-thuyet-minh`
  - **KKPhim**: `kkphim-phim-le`, `kkphim-phim-bo`, `kkphim-chieu-rap`, `kkphim-hoat-hinh`
  - **NguonC**: `nguonc-phim-le`, `nguonc-phim-bo`, `nguonc-chieu-rap`, `nguonc-moi-cap-nhat`
  - **STP**: `stp-dien-anh-au-my`, `stp-phim-le`, `stp-phim-bo`, `stp-phim-han-quoc` (hoặc `stp_movies_phimle`, `stp_series_phimbo`, `stp_movies_dacsac`)
  - **CLBPX**: `clbpx-kiem-hiep-xua`, `clbpx-phim-hong-kong`, `clbpx_series_tvb`, `clbpx_series_kiemhiep`, `clbpx_movies_xua`
  - **YANHH3D**: `yan-phim-le`, `yan-phim-bo`, `yan-dang-chieu`, `yan_series_3d`, `yan_series_donghua`
- Cấu hình đầy đủ `extra: [{ name: 'skip' }, { name: 'genre' }, { name: 'search' }]` cho từng catalog.

### R3. Điều hướng Catalog và Gom luồng Stream 6 Nguồn (`src/handlers.js`)
- **Điều hướng Catalog (`handleCatalog`)**:
  - Khớp chuẩn xác catalog ID tới đúng provider tương ứng (`vsmov`, `kkphim`, `nguonc`, `stp`, `clbpx`, `yan`).
- **Gom luồng Stream (`handleStream`)**:
  - Gọi song song cả 6 nguồn qua `Promise.allSettled()` với timeout độc lập 4500ms mỗi nguồn.
  - Chuẩn hóa định dạng hiển thị tên luồng Stremio/Nuvio:
    * `[VIP 1 • VSMOV] Vietsub / Lồng Tiếng / Thuyết Minh 4K (HLS Proxy)`
    * `[VIP 2 • KKPhim] Vietsub / Thuyết Minh Full HD (HLS Proxy)`
    * `[VIP 3 • NguonC] Vietsub / Thuyết Minh Full HD (HLS Proxy)`
    * `[VIP 4 • STP] Thuyết Minh HD (HLS Proxy)\n⚡ Server STP • sieutamphim.pro`
    * `[VIP 5 • CLBPX] Lồng Tiếng Cổ Điển (HLS Proxy)\n⚡ Server CLBPX • clbphimxua.info`
    * `[VIP 6 • YAN] 4K/FHD Donghua 3D (HLS Proxy)\n⚡ Server YAN • yanhh3d.pw`
  - Sắp xếp thứ tự ưu tiên hiển thị: 4K/UHD -> Vietsub -> Thuyết Minh -> Lồng Tiếng.
  - Tuyệt đối tuân thủ In-App Protocol (`url` HLS Proxy, nghiêm cấm `externalUrl`).

### R4. Hoàn thiện và Tối ưu 6 Provider Modules (`src/providers/`)
- Đảm bảo 6 provider (`vsmov.js`, `kkphim.js`, `nguonc.js`, `stp.js`, `clbpx.js`, `yan.js`) xuất chuẩn interface: `{ id, label, getCatalog, getStreams, search, getDetail }`.
- Tái sử dụng 100% utility từ `src/lib/utils.js` (`scoreMatch`, `safeSlug`, `safeKeyword`, `isSeasonMatch`, v.v.). Không tái định nghĩa duplicate functions.
- Cơ chế Fallback 3 tầng chống 404 cho phim lẻ & phim bộ (khớp tập linh hoạt `"1"`, `"01"`, `"Tập 1"`, `tap-1`). Trả về `[]` an toàn khi không tìm thấy nguồn.

### R5. Chu trình Tự Động Kiểm Thử & Tự Sửa Lỗi E2E (`tests/verify_all_providers_playback.js`)
- Xây dựng bài kiểm thử E2E liên tục kiểm tra thực tế:
  1. **Catalog Check**: Fetch các catalog của 6 nguồn -> HTTP 200 kèm danh sách `metas`.
  2. **Stream & TS Video Download Check** cho cả 6 nguồn:
     - VSMOV: Master M3U8 HTTP 200 + WebVTT subtitles proxy.
     - KKPhim: M3U8 HTTP 200 + tải phân đoạn `.ts` thật > 100KB với sync byte `0x47`.
     - NguonC: M3U8 HTTP 200 + tải phân đoạn `.ts` thật > 100KB với sync byte `0x47`.
     - STP: M3U8 HTTP 200 + tải phân đoạn `.ts` thật > 100KB với sync byte `0x47`.
     - CLBPX: M3U8 HTTP 200 + tải phân đoạn `.ts` thật > 100KB với sync byte `0x47`.
     - YAN: M3U8 HTTP 200 + tải phân đoạn `.ts` thật > 100KB với sync byte `0x47`.
- **Vòng lặp tự sửa lỗi (Self-Debug Loop)**: Nếu bất kỳ nguồn nào lỗi 404, phân tích phản hồi, tự động vá mã nguồn và chạy lại test cho đến khi 100% test cases ĐẠT.
- Chạy lại các bộ test hồi quy (`verify_playback.js`, `verify_hotfix_vsmov_kkphim.js`) đạt 100% PASS.

### R6. Versioning, Brand Signature & Deploy
- Đồng bộ version `1.6.2` trong `package.json`, `src/manifest.js`, và footer `src/handlers.js`:
  `VIP Movies Addon v1.6.2 • Designed with Taste by <span class="brand-highlight">Q121101</span>`
- Commit và push lên GitHub:
  ```bash
  git remote set-url origin https://<GITHUB_TOKEN>@github.com/q121101-cloud/stremio-vip-addon.git
  git add . && git commit -m "Engine v1.6.2: Fully Verified Playback for all 6 Providers (VSMOV, KKPhim, NguonC, STP, CLBPX, YAN) with 22 Active Catalogs"
  git push origin main
  git remote set-url origin https://github.com/q121101-cloud/stremio-vip-addon.git
  ```

---

## Acceptance Criteria

### Stream & Segment Playback (Mandatory)
- [ ] Tất cả 6 nguồn (VSMOV, KKPhim, NguonC, STP, CLBPX, YAN) trả về stream object chứa `url` hợp lệ (HLS Proxy) và KHÔNG có `externalUrl`.
- [ ] `GET /hls/manifest.m3u8` cho stream của các nguồn trả về HTTP 200 và bắt đầu bằng `#EXTM3U`.
- [ ] Phân đoạn `.ts` tải qua `/hls/segment.ts` trả về HTTP 200/206 với dung lượng > 100KB và bắt đầu bằng MPEG-TS sync byte `0x47`.
- [ ] Tất cả 22 catalog trả về HTTP 200 `{ metas: [...] }` không có mã lỗi 404.

### Test Suites & Zero Regression
- [ ] `node tests/verify_all_providers_playback.js` hoàn thành với 100% assertions PASS.
- [ ] `node tests/verify_playback.js` đạt 7/7 phases PASS.
- [ ] `node tests/verify_hotfix_vsmov_kkphim.js` đạt 27/27 PASS.
- [ ] `node --check src/index.js` đạt syntax sạch 100%.

### Deployment
- [ ] Version `1.6.2` đồng bộ trong `package.json`, `src/manifest.js`, `src/handlers.js`.
- [ ] `git push origin main` thành công lên repository.
