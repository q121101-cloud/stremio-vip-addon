# Original User Request

## Initial Request — 2026-08-18T03:33:42Z

Hotfix v1.5.2 cho Stremio VIP Movies Addon: Bổ sung nạp phụ đề WebVTT/SRT từ VSMOV 4K trực tiếp vào stream object Stremio và master M3U8; đồng thời xây dựng cơ chế tìm kiếm thông minh đa tầng (Smart Search Fallback) chống lỗi 404 do lệch slug phìm cho KKPhim.

Working directory: `/Users/quan/.gemini/antigravity/scratch/stremio-nguonc-addon`
Integrity mode: development

## Requirements

### R1. VSMOV WebVTT Subtitle Injection (`src/providers/vsmov.js`, `src/routes/hls.js`)
- Trích xuất link phụ đề tiếng Việt từ dữ liệu tập phìm VSMOV (dạng `.vtt` hoặc `.srt`).
- Proxy phụ đề qua endpoint `/hls/sub.vtt` với headers: `Content-Type: text/vtt; charset=utf-8`, `Access-Control-Allow-Origin: *`, `Cache-Control: public, max-age=86400`. Nếu nguồn là SRT, tự động convert sang WebVTT chuẩn.
- Gắn mảng `subtitles: [{ id: "vi_vsmov", lang: "vie", url: proxySubUrl, title: "Tiếng Việt (VSMOV VIP)" }]` vào stream object trả về cho Stremio.
- Chèn tag `#EXT-X-MEDIA:TYPE=SUBTITLES` vào đầu Master M3U8 khi rewrite để ExoPlayer/VLC/Nuvio tự động nhận diện phụ đề.

### R2. KKPhim Smart Search Fallback (`src/providers/kkphim.js`)
- Xây dựng cơ chế tra cứu đa tầng chống lỗi 404:
  - **Tầng 1**: Tra cứu trực tiếp theo IMDb ID.
  - **Tầng 2**: Nếu thất bại, tìm kiếm theo tên phìm từ Cinemeta (`/v1/api/tim-kiem?keyword=...`), chấm điểm bằng `scoreMatch`, lấy slug khớp cao nhất.
  - **Tầng 3**: Nếu tất cả thất bại, trả về mảng rỗng `[]` an toàn — không crash, không gửi stream 404.
- Thuật toán khớp số tập linh hoạt cho phìm bộ: `"1"`, `"01"`, `"Tập 1"`, `tap-1`, `tap-01`.

### R3. E2E Verification (`tests/verify_hotfix_vsmov_kkphim.js`)
- Kiểm thử tự động 3 ca thực tế:
  1. **Avengers 3** (`tt5095030`): VSMOV có mảng `subtitles` hợp lệ; `/hls/sub.vtt` trả về HTTP 200 + nội dung WebVTT. KKPhim tự fallback search và trả về stream M3U8 hợp lệ (không 404).
  2. **Phìm bộ KKPhim** (Tập 1): Khớp chính xác link M3U8 của Tập 1 via `/hls/manifest.m3u8` HTTP 200.
  3. **Tải phân đoạn `.ts`** thực tế: HTTP 200/206, payload > 50KB, MPEG-TS sync byte `0x47`.
- Tự động vòng lặp sửa lỗi cho đến khi 100% PASS.

### R4. Versioning & GitHub Deployment
- Cập nhật `version: "1.5.2"` trong `package.json` và `src/manifest.js`.
- Commit và push:
  `git add . && git commit -m "Hotfix v1.5.2: Injected VSMOV 4K WebVTT Subtitles into HLS/Stremio & Added KKPhim Smart-Search Fallback against 404" && git push origin main`

## Acceptance Criteria

- [ ] VSMOV stream object chứa mảng `subtitles` hợp lệ với `lang: "vie"` và URL proxy.
- [ ] `GET /hls/sub.vtt?url=...` trả về HTTP 200, `Content-Type: text/vtt`, `Access-Control-Allow-Origin: *`, nội dung bắt đầu bằng `WEBVTT`.
- [ ] KKPhim `tt5095030` (Avengers 3) trả về stream M3U8 hợp lệ (HTTP 200, không 404) sau khi qua Smart Search Fallback.
- [ ] KKPhim phìm bộ Tập 1 khớp đúng M3U8 (HTTP 200, `#EXTM3U` header confirmed).
- [ ] Tải phân đoạn `.ts` thực tế > 50KB, MPEG-TS sync byte `0x47` xác nhận.
- [ ] `node --check src/index.js` pass, `tests/verify_playback.js` 7/7 phases pass.
- [ ] `git push origin main` thành công, version `1.5.2` đồng bộ.
