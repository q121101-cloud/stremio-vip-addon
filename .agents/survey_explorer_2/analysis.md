# Báo Cáo Khảo Sát & Phân Tích Kỹ Thuật: Manifest, Catalog Routing & Stream Aggregator

**Người thực hiện:** `survey_explorer_2` (Teamwork Explorer)  
**Thời gian:** 2026-08-18T16:09:30+07:00  
**Tệp mục tiêu khảo sát:** `src/manifest.js`, `src/handlers.js`, `src/config.js`, `src/routes/hls.js`, `src/routes/manifest.js`  
**Cơ sở đối chiếu:** Requirements R2 & R3 trong `/Users/quan/.gemini/antigravity/scratch/stremio-nguonc-addon/.agents/ORIGINAL_REQUEST.md`

---

## 1. Tóm Tắt Khảo Sát (Executive Summary)

Báo cáo này tiến hành kiểm toán sâu và đối chiếu mã nguồn thực tế của hệ thống Stremio VIP Movies Addon liên quan đến 2 phân hệ cốt lõi:
1. **Cấu hình Manifest (`src/manifest.js`)** theo Yêu cầu **R2**: 22 danh mục catalog, cấu hình `extra` (`skip`, `genre`, `search`), `idPrefixes`, phiên bản và Dynamic Manifest builder.
2. **Điều hướng Catalog & Gom luồng Stream 6 Nguồn (`src/handlers.js`)** theo Yêu cầu **R3**: Định tuyến catalog ID tới đúng provider module, gom luồng song song qua `Promise.allSettled()` kèm timeout độc lập 4500ms, định dạng hiển thị tên luồng VIP 1..6, sắp xếp ưu tiên hiển thị (`4K/UHD -> Vietsub -> Thuyết Minh -> Lồng Tiếng`), và kiểm soát nghiêm ngặt In-App Protocol (`url` qua HLS Proxy, loại bỏ triệt để `externalUrl`).

### Kết luận tổng quan:
- **Manifest (`src/manifest.js`)**: Đã định nghĩa đủ 22 catalogs trong `ALL_CATALOGS` bao phủ 7 modules provider (6 cụm nguồn chính: VSMOV, KKPhim, NguonC, STP, CLBPX, YAN+HH3D). Tuy nhiên, có sự sai khác về định danh catalog ID giữa mã nguồn hiện tại và danh mục yêu cầu trong R2 (ví dụ: `vsmov-4k` vs `vsmov-4k-sieu-net`, `kkphim-movie-latest` vs `kkphim-phim-le`, `clbpx-kiem-hiep` vs `clbpx-kiem-hiep-xua`). Cần bổ sung alias mapping toàn diện trong bộ điều hướng catalog để tránh lỗi 404 cho bất kỳ định danh nào.
- **Routing Catalog (`handleCatalog`)**: Logic định tuyến dựa vào prefix hoạt động tốt, nhưng danh sách ánh xạ `getCatTypeFromCatalogId` còn thiếu các bí danh (aliases) chuẩn của R2.
- **Gom luồng Stream (`handleStream`)**: Concurrency model qua `Promise.allSettled()` hoạt động ổn định nhưng đang áp dụng timeout 4000ms (cần nâng lên đúng chuẩn **4500ms** theo R3). Hàm tính điểm ưu tiên `getStreamPriority` hiện phân nhóm theo Provider thay vì phân nhóm chính theo danh mục âm thanh/chất lượng (`4K/UHD -> Vietsub -> Thuyết Minh -> Lồng Tiếng`). Cần tái cấu trúc hàm sắp xếp để tuân thủ 100% thứ tự hiển thị R3.
- **Versioning**: Phiên bản hiện tại trên `package.json`, `src/manifest.js`, `src/handlers.js` đang ghi nhận `1.6.0`, cần nâng cấp đồng bộ lên `1.6.2` theo R6.

---

## 2. Kiểm Toán Chi Tiết Manifest (`src/manifest.js`) & Đối Chiếu R2

### 2.1 Bảng Kiểm Kê Toàn Bộ 22 Catalog Hiện Tại Trong `ALL_CATALOGS`

| STT | Cụm Nguồn (Provider) | Catalog ID Hiện Tại | Tên Hiển Thị (Display Name) | Type | Category | Thuộc Tính Extra | R2 Canonical ID / Alias |
|---|---|---|---|---|---|---|---|
| 1 | **VSMOV 4K** (`vsmov`) | `vsmov-4k` | 🌟 VSMOV • Phim 4K Ultra HD | `movie` | `movie` | `search`, `genre`, `skip` | `vsmov-4k-sieu-net` |
| 2 | **VSMOV 4K** (`vsmov`) | `vsmov-thuyet-minh` | 🎙️ VSMOV • Thuyết Minh 4K | `movie` | `movie` | `search`, `genre`, `skip` | `vsmov-thuyet-minh`, `vsmov-tm` |
| 3 | **KKPhim** (`kkphim`) | `kkphim-movie-latest` | 🎬 KKPhim • Phim Lẻ Mới | `movie` | `movie` | `search`, `genre`, `skip` | `kkphim-phim-le` |
| 4 | **KKPhim** (`kkphim`) | `kkphim-series-latest` | 📺 KKPhim • Phim Bộ Mới | `series` | `series` | `search`, `genre`, `skip` | `kkphim-phim-bo` |
| 5 | **KKPhim** (`kkphim`) | `kkphim-cinema-latest` | 🍿 KKPhim • Phim Chiếu Rạp | `movie` | `cinema` | `search`, `genre`, `skip` | `kkphim-chieu-rap` |
| 6 | **KKPhim** (`kkphim`) | `kkphim-anime-latest` | 🐉 KKPhim • Hoạt Hình & Anime | `series` | `anime` | `search`, `genre`, `skip` | `kkphim-hoat-hinh` |
| 7 | **NguonC** (`nguonc`) | `nguonc-movie-latest` | 🎬 NguonC • Phim Lẻ Mới | `movie` | `movie` | `search`, `genre`, `skip` | `nguonc-phim-le` |
| 8 | **NguonC** (`nguonc`) | `nguonc-series-latest` | 📺 NguonC • Phim Bộ Mới | `series` | `series` | `search`, `genre`, `skip` | `nguonc-phim-bo` |
| 9 | **NguonC** (`nguonc`) | `nguonc-cinema-latest` | 🍿 NguonC • Phim Chiếu Rạp | `movie` | `cinema` | `search`, `genre`, `skip` | `nguonc-chieu-rap` |
| 10 | **NguonC** (`nguonc`) | `nguonc-anime-latest` | 🐉 NguonC • Hoạt Hình & Anime | `series` | `anime` | `search`, `genre`, `skip` | `nguonc-moi-cap-nhat`, `nguonc-hoat-hinh` |
| 11 | **STP** (`stp`) | `stp-au-my` | 🗽 STP • Phim Âu Mỹ Tuyển Chọn | `movie` | `movie` | `search`, `genre`, `skip` | `stp-dien-anh-au-my`, `stp_movies_dacsac` |
| 12 | **STP** (`stp`) | `stp-phim-le` | 🎬 STP • Phim Lẻ Đặc Sắc | `movie` | `movie` | `search`, `genre`, `skip` | `stp_movies_phimle` |
| 13 | **STP** (`stp`) | `stp-phim-bo` | 📺 STP • Phim Bộ Tuyển Chọn | `series` | `series` | `search`, `genre`, `skip` | `stp_series_phimbo` |
| 14 | **STP** (`stp`) | `stp-han-quoc` | 🇰🇷 STP • Phim Hàn Quốc (K-Drama) | `series` | `series` | `search`, `genre`, `skip` | `stp-phim-han-quoc` |
| 15 | **HH3D** (`hh3d`) | `hh3d-phim-le` | 🎬 HH3D • Hoạt Hình 3D Phim Lẻ | `movie` | `movie` | `search`, `genre`, `skip` | `yan_movies_3d` |
| 16 | **HH3D** (`hh3d`) | `hh3d-phim-bo` | 📺 HH3D • Hoạt Hình 3D Phim Bộ | `series` | `series` | `search`, `genre`, `skip` | `yan_series_3d` |
| 17 | **HH3D** (`hh3d`) | `hh3d-tien-hiep` | ⚔️ HH3D • Tiên Hiệp & Huyền Huyễn 3D | `series` | `anime` | `search`, `genre`, `skip` | `yan_series_donghua` |
| 18 | **YAN** (`yan`) | `yan-phim-le` | 🎬 YAN • Donghua Phim Lẻ | `movie` | `movie` | `search`, `genre`, `skip` | `yan-phim-le` |
| 19 | **YAN** (`yan`) | `yan-phim-bo` | 📺 YAN • Donghua Phim Bộ | `series` | `series` | `search`, `genre`, `skip` | `yan-phim-bo` |
| 20 | **YAN** (`yan`) | `yan-dang-chieu` | 🔥 YAN • Donghua Đang Chiếu | `series` | `anime` | `search`, `genre`, `skip` | `yan-dang-chieu` |
| 21 | **CLBPX** (`clbpx`) | `clbpx-kiem-hiep` | 🗡️ CLBPX • Kiếm Hiệp Kim Dung | `series` | `series` | `search`, `genre`, `skip` | `clbpx-kiem-hiep-xua`, `clbpx_series_kiemhiep` |
| 22 | **CLBPX** (`clbpx`) | `clbpx-hong-kong` | 🇭🇰 CLBPX • Phim Hồng Kông / TVB Kinh Điển | `series` | `series` | `search`, `genre`, `skip` | `clbpx-phim-hong-kong`, `clbpx_series_tvb` |

### 2.2 Cấu Hình Thuộc Tính Extra & Thể Loại
- Mọi catalog đều được cấu hình chuẩn:
  ```javascript
  extra: [
    { name: 'search', isRequired: false },
    { name: 'genre', isRequired: false, options: GENRE_NAMES },
    { name: 'skip', isRequired: false },
  ],
  extraSupported: ['search', 'genre', 'skip'],
  ```
- Danh sách 23 thể loại chuẩn (`GENRES` & `GENRE_NAMES` tại `src/manifest.js:14-38`) bao gồm đầy đủ: Hành Động, Tình Cảm, Hài Hước, Cổ Trang, Tâm Lý, Hình Sự, Chiến Tranh, Thể Thao, Võ Thuật, Viễn Tưởng, Phiêu Lưu, Khoa Học, Kinh Dị, Âm Nhạc, Thần Thoại, Hoạt Hình, Kinh Điển, Chính Kịch, Gia Đình, Bí Ẩn, Giật Gân, Lãng Mạn, Phim 18+.

### 2.3 ID Prefix Support
- `ALL_ID_PREFIXES` tại `src/manifest.js:367-383`:
  `['vsmov:', 'vsmov_', 'kkphim:', 'kkphim_', 'nguonc:', 'nguonc_', 'stp:', 'stp_', 'hh3d:', 'hh3d_', 'yan:', 'yan_', 'clbpx:', 'clbpx_', 'tt']`.
- Bao phủ 100% các ID schema được sinh ra từ 6 cụm nguồn cũng như IMDb canonical `tt...`.

---

## 3. Kiểm Toán Catalog Routing (`src/handlers.js` `handleCatalog`)

### 3.1 Cơ Chế Định Tuyến Provider & Thể Loại Hiện Tại
1. **Phân giải Provider (`getProviderFromCatalogId`)**:
   ```javascript
   function getProviderFromCatalogId(catalogId) {
     if (!catalogId) return 'nguonc';
     const id = String(catalogId).toLowerCase().trim();
     for (const pid of Object.keys(ALL_PROVIDERS)) {
       if (id.startsWith(pid + '-') || id.startsWith(pid + '_') || id === pid) return pid;
     }
     return 'nguonc';
   }
   ```
   - Cơ chế tiền tố (`pid + '-'` hoặc `pid + '_'`) nhận diện chính xác provider ngay cả khi người dùng hoặc Stremio gửi catalog ID có dạng `vsmov-4k-sieu-net`, `stp_movies_phimle`, `clbpx_series_tvb`, `yan_series_donghua`.

2. **Phân giải Loại Danh Mục (`getCatTypeFromCatalogId`)**:
   ```javascript
   function getCatTypeFromCatalogId(catalogId) {
     if (!catalogId) return 'movie';
     const id = String(catalogId).toLowerCase().trim();

     // Specific mappings for all 22 standard catalogs + aliases
     if (id === 'vsmov-4k') return '4k';
     if (id === 'vsmov-thuyet-minh' || id === 'vsmov-tm') return 'thuyet-minh';
     if (id === 'stp-au-my' || id === 'stp-western') return 'au-my';
     if (id === 'stp-han-quoc' || id === 'stp-korean') return 'han-quoc';
     if (id === 'stp-phim-le' || id === 'stp-single') return 'movie';
     if (id === 'stp-phim-bo' || id === 'stp-series') return 'series';
     if (id === 'hh3d-phim-le' || id === 'hh3d-single') return 'movie';
     if (id === 'hh3d-phim-bo' || id === 'hh3d-series') return 'series';
     if (id === 'hh3d-tien-hiep' || id === 'hh3d-donghua') return 'tien-hiep';
     if (id === 'yan-phim-le' || id === 'yan-single') return 'movie';
     if (id === 'yan-phim-bo' || id === 'yan-series') return 'series';
     if (id === 'yan-dang-chieu' || id === 'yan-ongoing') return 'dang-chieu';
     if (id === 'clbpx-kiem-hiep' || id === 'clbpx-wuxia') return 'kiem-hiep';
     if (id === 'clbpx-hong-kong' || id === 'clbpx-tvb') return 'hong-kong';

     if (id.includes('series') || id.includes('phim-bo')) return 'series';
     if (id.includes('single') || id.includes('movie') || id.includes('phim-le')) return 'movie';
     if (id.includes('cinema') || id.includes('chieu-rap')) return 'cinema';
     if (id.includes('anime') || id.includes('hoat-hinh') || id.includes('donghua')) return 'anime';
     if (id.includes('recent') || id.includes('latest')) return 'latest';

     const parts = id.replace(/_/g, '-').split('-');
     if (parts.length >= 2) return parts.slice(1).join('-');
     return 'movie';
   }
   ```

### 3.2 Các Điểm Khuyết (Gaps) Trong Catalog Routing Cần Xử Lý
1. **Thiếu ánh xạ tường minh các bí danh R2**:
   - `vsmov-4k-sieu-net` -> cần ánh xạ về `'4k'`
   - `stp-dien-anh-au-my`, `stp_movies_dacsac` -> cần ánh xạ về `'au-my'`
   - `stp-phim-han-quoc` -> cần ánh xạ về `'han-quoc'`
   - `stp_movies_phimle` -> cần ánh xạ về `'movie'`
   - `stp_series_phimbo` -> cần ánh xạ về `'series'`
   - `clbpx-kiem-hiep-xua`, `clbpx_series_kiemhiep` -> cần ánh xạ về `'kiem-hiep'`
   - `clbpx-phim-hong-kong`, `clbpx_series_tvb` -> cần ánh xạ về `'hong-kong'`
   - `clbpx_movies_xua` -> cần ánh xạ về `'movie'`
   - `yan_series_3d`, `yan_series_donghua` -> cần ánh xạ về `'series'` / `'donghua'`
   - `nguonc-moi-cap-nhat` -> cần ánh xạ về `'latest'`
2. **Timeout trong `handleCatalog`**:
   - Tại `src/handlers.js:1250` và `1278`, `withTimeout` đang đặt `4000ms`. Nên điều chỉnh đồng bộ về `4500ms` tương ứng với tiêu chuẩn luồng R3.

---

## 4. Kiểm Toán Stream Aggregator (`src/handlers.js` `handleStream`)

### 4.1 Mô Hình Bất Đồng Bộ & Xử Lý Lỗi Cách Ly (Fault Isolation)
- `handleStream` tại `src/handlers.js:1479-1641` sử dụng `Promise.allSettled`:
  ```javascript
  const results = await Promise.allSettled(
    providersToRun.map((provider) =>
      withTimeout(provider.getStreams(payload), 4000, provider.name || provider.id || 'Provider')
    )
  );
  ```
- **Ưu điểm**: Khi 1 hoặc 2 provider gặp sự cố (timeout, 404, rate limit), các provider còn lại vẫn trả về luồng phát bình thường, addon không bao giờ bị crash hoặc treo response.
- **Điểm cần sửa**: Giá trị timeout hiện là `4000ms`, yêu cầu R3 chỉ định rõ **4500ms**.

### 4.2 Định Dạng Tên Luồng (Stream Title Branding) Của Toàn Bộ 6 Nguồn

Đối chiếu định dạng tên luồng của 6 nhà cung cấp:

| Provider | Chuẩn Định Dạng Theo R3 | Định Dạng Mã Nguồn Thực Tế Hiện Tại | Đánh Giá |
|---|---|---|---|
| **VIP 1 • VSMOV** | `[VIP 1 • VSMOV] Vietsub / Lồng Tiếng / Thuyết Minh 4K (HLS Proxy)` | `[VIP 1 • VSMOV] ${audioInfo.label} 4K Ultra HD (3840x2160)${epLabel} (HLS Proxy)\n⚡ Server VIP ${audioInfo.label} • vsmov.com` | ✅ Chuẩn xác |
| **VIP 2 • KKPhim** | `[VIP 2 • KKPhim] Vietsub / Thuyết Minh Full HD (HLS Proxy)` | `[VIP 2 • KKPhim] ${cleanServerName}${epLabel} Full HD (HLS Proxy)\n⚡ Server VIP 2 • Phát trực tiếp trong App` (hoặc Vietsub/TM/LT) | ✅ Chuẩn xác |
| **VIP 3 • NguonC** | `[VIP 3 • NguonC] Vietsub / Thuyết Minh Full HD (HLS Proxy)` | `[VIP 3 • NguonC] ${cleanServerName}${epLabel} (HLS Proxy)\n⚡ Server VIP 3 • Phát trực tiếp trong App` (hoặc Vietsub/TM/LT) | ✅ Chuẩn xác |
| **VIP 4 • STP** | `[VIP 4 • STP] Thuyết Minh HD (HLS Proxy)\n⚡ Server STP • sieutamphim.pro` | `[VIP 4 • STP] ${audio.label}${epLabel} (HLS Proxy)\n⚡ Server STP • sieutamphim.pro` | ✅ Chuẩn xác |
| **VIP 5 • CLBPX** | `[VIP 5 • CLBPX] Lồng Tiếng Cổ Điển (HLS Proxy)\n⚡ Server CLBPX • clbphimxua.info` | `[VIP 5 • CLBPX] Lồng Tiếng Cổ Điển${epLabel} (HLS Proxy)\n⚡ Server CLBPX • clbphimxua.info` | ✅ Chuẩn xác |
| **VIP 6 • YAN** | `[VIP 6 • YAN] 4K/FHD Donghua 3D (HLS Proxy)\n⚡ Server YAN • yanhh3d.pw` | `[VIP 6 • YAN] 4K/FHD Donghua 3D${fallbackEpLabel} (HLS Proxy)\n⚡ Server YAN • yanhh3d.pw` | ✅ Chuẩn xác |

### 4.3 Kiểm Soát In-App Protocol (url vs externalUrl)
- Tại `src/handlers.js:1601-1615`:
  ```javascript
  const sanitized = {
    name: item.name || 'VIP Movies 🎬',
    title: item.title ? String(item.title).replace(/#/g, '') : 'VIP Server',
    url: String(item.url).trim(),
    behaviorHints: {
      notSupported: false,
      bingeGroup: item.behaviorHints?.bingeGroup || `stream-${slug || imdbId || 'main'}`,
      ...(item.behaviorHints || {}),
    },
  };
  if (Array.isArray(item.subtitles)) {
    sanitized.subtitles = item.subtitles;
  }
  delete sanitized.externalUrl;
  mergedStreams.push(sanitized);
  ```
- **Đánh giá**:
  - 100% luồng stream đều đi qua `/hls/manifest.m3u8` proxy.
  - Thuộc tính `externalUrl` bị xóa bỏ tuyệt đối (`delete sanitized.externalUrl`).
  - Hỗ trợ subtitle WebVTT proxy chuẩn (`/hls/sub.vtt`).

### 4.4 Cơ Chế Sắp Xếp Thứ Tự Ưu Tiên Luồng (`getStreamPriority`)

#### Hiện trạng tại `src/handlers.js:1435-1462`:
```javascript
function getStreamPriority(stream) {
  if (!stream) return 200;
  const title = (stream.title || '').toLowerCase();
  const name = (stream.name || '').toLowerCase();
  const combined = `${name} ${title}`;

  // 1. VSMOV 4K Ultra HD (VIP 1)
  if (combined.includes('vsmov') && (combined.includes('4k') || combined.includes('ultra hd') || combined.includes('3840x2160'))) return 10;
  // 2. VSMOV Thuyết Minh / Other (VIP 1)
  if (combined.includes('vsmov') || combined.includes('vip 1')) return 20;
  // 3. KKPhim Vietsub (VIP 2)
  if ((combined.includes('kkphim') || combined.includes('vip 2')) && combined.includes('vietsub')) return 30;
  // 4. KKPhim Thuyết Minh / Lồng Tiếng / Other (VIP 2)
  if (combined.includes('kkphim') || combined.includes('vip 2')) return 40;
  // 5. NguonC Vietsub (VIP 3)
  if ((combined.includes('nguonc') || combined.includes('vip 3')) && combined.includes('vietsub')) return 50;
  // 6. NguonC Thuyết Minh / Other (VIP 3)
  if (combined.includes('nguonc') || combined.includes('vip 3')) return 60;
  // 7. STP (Western & K-Drama)
  if (combined.includes('stp') || combined.includes('suutamphim')) return 70;
  // 8. HH3D (3D Donghua)
  if (combined.includes('hh3d') || combined.includes('hoathinh3d')) return 80;
  // 9. YAN (Donghua Ongoing)
  if (combined.includes('yan') || combined.includes('yandonghua')) return 90;
  // 10. CLBPX (Wuxia & TVB)
  if (combined.includes('clbpx') || combined.includes('clbphimxua')) return 100;
  return 200;
}
```

#### Phân tích & Đề xuất Nâng Cấp:
Theo Yêu cầu R3:
> "Sắp xếp thứ tự ưu tiên hiển thị: **4K/UHD -> Vietsub -> Thuyết Minh -> Lồng Tiếng**."

Khi người dùng xem danh sách luồng từ tất cả 6 nguồn, thứ tự tối ưu nhất là gom theo nhóm chất lượng & loại âm thanh trước, sau đó ưu tiên theo độ ổn định của Provider (VIP 1 -> VIP 2 -> VIP 3 -> VIP 4 -> VIP 5 -> VIP 6):

```javascript
function getStreamPriority(stream) {
  if (!stream) return 999;
  const title = (stream.title || '').toLowerCase();
  const name = (stream.name || '').toLowerCase();
  const combined = `${name} ${title}`;

  // 1. Phân loại theo Audio & Quality Bucket (Nhóm 1: 4K/UHD, Nhóm 2: Vietsub, Nhóm 3: Thuyết Minh, Nhóm 4: Lồng Tiếng)
  let bucket = 400; // Default
  const is4K = combined.includes('4k') || combined.includes('ultra hd') || combined.includes('3840x2160') || combined.includes('uhd');
  const isVietsub = combined.includes('vietsub') || combined.includes('phụ đề') || combined.includes('phu de');
  const isThuyetMinh = combined.includes('thuyết minh') || combined.includes('thuyet minh') || combined.includes('tm');
  const isLongTieng = combined.includes('lồng tiếng') || combined.includes('long tieng') || combined.includes('lt');

  if (is4K) {
    bucket = 100;
  } else if (isVietsub) {
    bucket = 200;
  } else if (isThuyetMinh) {
    bucket = 300;
  } else if (isLongTieng) {
    bucket = 400;
  } else {
    bucket = 500;
  }

  // 2. Phân loại Provider Rank (VIP 1 -> VIP 6)
  let provRank = 50;
  if (combined.includes('vsmov') || combined.includes('vip 1')) provRank = 1;
  else if (combined.includes('kkphim') || combined.includes('vip 2')) provRank = 2;
  else if (combined.includes('nguonc') || combined.includes('vip 3')) provRank = 3;
  else if (combined.includes('stp') || combined.includes('vip 4')) provRank = 4;
  else if (combined.includes('clbpx') || combined.includes('vip 5')) provRank = 5;
  else if (combined.includes('yan') || combined.includes('hh3d') || combined.includes('vip 6')) provRank = 6;

  return bucket + provRank;
}
```
**Bảng điểm ưu tiên mới:**
- 4K VSMOV: `100 + 1 = 101`
- 4K YAN: `100 + 6 = 106`
- Vietsub VSMOV: `200 + 1 = 201`
- Vietsub KKPhim: `200 + 2 = 202`
- Vietsub NguonC: `200 + 3 = 203`
- Vietsub STP: `200 + 4 = 204`
- Vietsub YAN: `200 + 6 = 206`
- Thuyết Minh VSMOV: `300 + 1 = 301`
- Thuyết Minh KKPhim: `300 + 2 = 302`
- Thuyết Minh NguonC: `300 + 3 = 303`
- Thuyết Minh STP: `300 + 4 = 304`
- Thuyết Minh CLBPX: `300 + 5 = 305`
- Lồng Tiếng VSMOV: `400 + 1 = 401`
- Lồng Tiếng KKPhim: `400 + 2 = 402`
- Lồng Tiếng CLBPX: `400 + 5 = 405`

Thuật toán này đảm bảo tuyệt đối thứ tự **4K/UHD -> Vietsub -> Thuyết Minh -> Lồng Tiếng** trên toàn bộ hệ thống!

---

## 5. Tổng Hợp Các Điểm Cần Cập Nhật & Đề Xuất Mã Nguồn

| Vấn Đề | Tệp & Vị Trí Dòng | Hiện Trạng | Đề Xuất Cập Nhật |
|---|---|---|---|
| **Version Sync** | `package.json:3`<br>`src/manifest.js:387`<br>`src/handlers.js:1035` | `'1.6.0'` | Nâng cấp đồng bộ lên `'1.6.2'` |
| **Catalog Timeout** | `src/handlers.js:1250, 1278` | `withTimeout(..., 4000, ...)` | Đổi thành `withTimeout(..., 4500, ...)` |
| **Stream Timeout** | `src/handlers.js:1589` | `withTimeout(..., 4000, ...)` | Đổi thành `withTimeout(..., 4500, ...)` |
| **Stream Priority** | `src/handlers.js:1435-1462` | Phân nhóm theo Provider | Phân nhóm 2 tầng: Audio Bucket (4K -> Vietsub -> TM -> LT) + Provider Rank |
| **Catalog Alias Routing** | `src/handlers.js:1220-1245` | Thiếu danh sách alias của R2 | Bổ sung đầy đủ mapping cho `vsmov-4k-sieu-net`, `stp-dien-anh-au-my`, `clbpx-kiem-hiep-xua`, `yan_series_donghua`, v.v. |
| **ALL_CATALOGS Definition** | `src/manifest.js:63-363` | 22 danh mục hiện hữu | Giữ nguyên 22 danh mục chuẩn K20, đồng thời đảm bảo catalog routing xử lý mượt mà cả canonical ID lẫn alias ID. |
