# Original User Request

## 2026-08-18T04:36:35Z

Nâng cấp Engine v1.6.0 cho Stremio VIP Movies Addon: Kiểm toán và sửa chữa toàn diện 3 provider đã tồn tại (STP, CLBPX, YAN) với domain chính xác theo đặc tả mới, xác minh khả năng trích xuất luồng phát trực tiếp, và triển khai bộ kiểm thử E2E đầy đủ cho cả 3 nguồn.

Working directory: `/Users/quan/.gemini/antigravity/scratch/stremio-nguonc-addon`
Integrity mode: development

> **Bối cảnh quan trọng**: 3 provider `stp.js`, `clbpx.js`, `yan.js` **đã tồn tại** trong `src/providers/` nhưng dùng domain cũ không còn hoạt động:
> - `stp.js`: dùng `suutamphim.org` → cần đổi sang `sieutamphim.pro`
> - `clbpx.js`: dùng `clbphimxua.com` → cần đổi sang `clbphimxua.info`
> - `yan.js`: dùng `yanhh3d.org` → cần đổi sang `yanhh3d.pw`
>
> Nhiệm vụ là **cập nhật domain, khám phá API thực tế, sửa logic bóc tách stream** cho đúng với cấu trúc response của từng domain mới.

---

## Requirements

### R1. Cập nhật domain và kiểm tra API thực tế cho 3 provider

Đọc kỹ code hiện tại của từng file, sau đó:

**STP** (`src/providers/stp.js`):
- Cập nhật `REFERER_HEADER` → `https://sieutamphim.pro/`
- Cập nhật `Origin` → `https://sieutamphim.pro`
- Thực hiện HTTP GET thực tế tới `https://sieutamphim.pro/` để xác định cấu trúc trang (API JSON hoặc HTML SSR), rồi cập nhật endpoint tìm kiếm và cấu trúc parse phù hợp.
- Stream label chuẩn: `[VIP 4 • STP] Thuyết Minh HD (HLS Proxy)\n⚡ Server STP • sieutamphim.pro`

**CLBPX** (`src/providers/clbpx.js`):
- Cập nhật `REFERER_HEADER` → `https://clbphimxua.info/`
- Cập nhật `Origin` → `https://clbphimxua.info`
- Thực hiện HTTP GET thực tế tới `https://clbphimxua.info/` để xác định cấu trúc, rồi cập nhật logic parse.
- Stream label chuẩn: `[VIP 5 • CLBPX] Lồng Tiếng Cổ Điển (HLS Proxy)\n⚡ Server CLBPX • clbphimxua.info`

**YAN** (`src/providers/yan.js`):
- Cập nhật `REFERER_HEADER` → `https://yanhh3d.pw/`
- Cập nhật `Origin` → `https://yanhh3d.pw`
- Thực hiện HTTP GET thực tế tới `https://yanhh3d.pw/` để xác định cấu trúc, rồi cập nhật logic parse.
- Stream label chuẩn: `[VIP 6 • YAN] 4K/FHD Donghua 3D (HLS Proxy)\n⚡ Server YAN • yanhh3d.pw`

**Bất biến cứng cho cả 3 provider**:
- Tuyệt đối không dùng `externalUrl` — chỉ dùng `url` (HLS Proxy)
- Import `scoreMatch` từ `src/lib/utils.js`, không tái khai báo
- **Chiến lược trích xuất stream đa tầng**: Thử API JSON → nếu không có thì scrape HTML (`axios` + regex/cheerio để tìm link `.m3u8`) → nếu vẫn thất bại thì `getStreams` trả về `[]` an toàn (không crash)

### R2. Cập nhật HLS Proxy Referer routing cho 3 domain mới

Trong `src/routes/hls.js`, bổ sung/cập nhật entries trong `SOURCE_REFERERS` để các domain mới được nhận diện đúng Referer khi proxy TS segment:
- `sieutamphim.pro` → `Referer: https://sieutamphim.pro/`
- `clbphimxua.info` → `Referer: https://clbphimxua.info/`
- `yanhh3d.pw` → `Referer: https://yanhh3d.pw/`

### R3. E2E Verification (`tests/verify_new_providers.js`)

Tạo bộ kiểm thử tự động cho 3 provider mới:
1. Server khởi động không lỗi, tất cả routes đăng ký thành công.
2. Endpoint `/hls/manifest.m3u8` với URL thực từ mỗi provider — HTTP 200 + body bắt đầu `#EXTM3U`.
3. Stream aggregator (`/default/stream/movie/<imdbId>.json`) không crash, trả về HTTP 200 (dù streams có thể rỗng nếu provider không có phim đó).
4. Nếu bất kỳ provider nào trả về stream thực: tải `.ts` segment qua `/hls/segment.ts` — HTTP 200/206, size > 10KB, sync byte `0x47`.
5. Tự vòng lặp debug-sửa-chạy lại cho đến khi 100% PASS.

**Đảm bảo zero regression**: Sau khi sửa, chạy lại:
- `node tests/verify_playback.js` → phải 7/7 PASS
- `node tests/verify_hotfix_vsmov_kkphim.js` → phải 27/27 PASS

### R4. Version Bump & GitHub Deploy

Cập nhật `version: "1.6.0"` trong `package.json`, `src/manifest.js`, và footer trong `src/handlers.js`:
`VIP Movies Addon v1.6.0 • Designed with Taste by <span class="brand-highlight">Q121101</span>`

Deploy:
```bash
git remote set-url origin https://<GITHUB_TOKEN>@github.com/q121101-cloud/stremio-vip-addon.git
git add . && git commit -m "Engine v1.6.0: Updated STP/CLBPX/YAN domains + HLS Proxy routing + E2E tests + Zero-Regression Guard"
git push origin main
git remote set-url origin https://github.com/q121101-cloud/stremio-vip-addon.git
```

---

## Acceptance Criteria

### Syntax & Runtime
- [ ] `node --check src/index.js` không có lỗi
- [ ] Server khởi động thành công (không crash)
- [ ] 3 provider files không tái khai báo `scoreMatch` hay hàm nào đã có trong `src/lib/utils.js`

### HLS Proxy
- [ ] `SOURCE_REFERERS` trong `hls.js` có entries cho `sieutamphim.pro`, `clbphimxua.info`, `yanhh3d.pw`

### E2E Test
- [ ] `node tests/verify_new_providers.js` exit code 0 (100% PASS)
- [ ] `node tests/verify_playback.js` vẫn 7/7 PASS (zero regression)
- [ ] `node tests/verify_hotfix_vsmov_kkphim.js` vẫn 27/27 PASS (zero regression)

### Deploy
- [ ] `package.json` version `1.6.0`
- [ ] `src/manifest.js` version `1.6.0`
- [ ] Footer `handlers.js` có chữ `v1.6.0`
- [ ] `git push origin main` thành công
