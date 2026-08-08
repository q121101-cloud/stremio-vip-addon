# 🎬 NguonC Stremio Addon

> **Xem phim Vietsub, thuyết minh chất lượng cao từ [phim.nguonc.com](https://phim.nguonc.com) trực tiếp trên Stremio & Nuvio App**

[![Node.js](https://img.shields.io/badge/Node.js-18%2B-green)](https://nodejs.org)
[![Stremio](https://img.shields.io/badge/Stremio-v4-purple)](https://stremio.com)
[![Nuvio](https://img.shields.io/badge/Nuvio-compatible-blue)](https://nuvio.app)
[![License](https://img.shields.io/badge/License-MIT-yellow)](LICENSE)

---

## ✨ Tính Năng

| Tính năng | Mô tả |
|-----------|-------|
| 🎥 **Phim Lẻ** | Xem phim lẻ Vietsub, thuyết minh HD |
| 📺 **Phim Bộ** | Phim bộ đa tập với danh sách tập đầy đủ |
| 🔍 **Tìm kiếm** | Tìm kiếm phim theo tên tiếng Việt / tiếng Anh |
| 🏷️ **Lọc thể loại** | 20+ thể loại: Hành Động, Tình Cảm, Kinh Dị... |
| ⚡ **Cache thông minh** | Memory cache 5-10 phút giảm tải API |
| 🛡️ **CORS đầy đủ** | `Access-Control-Allow-Origin: *` toàn bộ endpoint |
| 🔄 **Auto Retry** | Tự động thử lại khi API bị chậm/lỗi |
| 🌐 **Multi-server** | Hỗ trợ nhiều server phát (Vietsub #1, #2...) |

---

## 🚀 Cài Đặt Nhanh

### Yêu cầu
- **Node.js** v18.0.0 trở lên
- **npm** v8+

### Bước 1: Clone / Download

```bash
# Clone repository
git clone https://github.com/your-username/stremio-nguonc-addon.git
cd stremio-nguonc-addon

# Hoặc download thủ công và giải nén
```

### Bước 2: Cài dependencies

```bash
npm install
```

### Bước 3: Cấu hình (tuỳ chọn)

```bash
# Sao chép file cấu hình mẫu
cp .env.example .env

# Chỉnh sửa PORT nếu cần (mặc định: 7000)
nano .env
```

### Bước 4: Chạy server

```bash
# Chạy production
npm start

# Chạy development (tự reload khi sửa code)
npm run dev
```

---

## 📡 Cài Đặt vào Stremio / Nuvio

### Phương pháp 1: Deep Link (nhanh nhất)

Sau khi server đang chạy, mở trình duyệt và truy cập:

```
http://localhost:7000
```

Nhấn nút **"⚡ Cài đặt vào Stremio"**

### Phương pháp 2: Thủ công qua URL Manifest

1. Mở **Stremio** → **Addon** → **Community Addons**
2. Nhấn vào ô "Enter addon URL..."
3. Paste URL sau:

```
http://localhost:7000/manifest.json
```

4. Nhấn **Install**

### Phương pháp 3: Nuvio App

Trong **Nuvio**, vào **Settings** → **Addons** → **Add Custom Addon**, nhập URL manifest.

> **💡 Tip:** Nếu cài từ xa (server deploy), thay `localhost:7000` bằng IP hoặc domain của server bạn.

---

## 🔗 API Endpoints

| Endpoint | Mô tả |
|----------|-------|
| `GET /` | Trang chủ addon với nút cài đặt |
| `GET /manifest.json` | Manifest của addon (Stremio standard) |
| `GET /catalog/movie/nguonc-movie-latest.json` | Danh sách phim lẻ mới |
| `GET /catalog/series/nguonc-series-latest.json` | Danh sách phim bộ mới |
| `GET /catalog/:type/:id/:extra.json` | Catalog với bộ lọc extra |
| `GET /meta/:type/:id.json` | Chi tiết phim |
| `GET /stream/:type/:id.json` | Luồng phát |
| `GET /health` | Health check + thống kê cache |

### Ví dụ Extra Params (Catalog)

```
# Tìm kiếm
/catalog/movie/nguonc-movie-latest/search=kungfu.json

# Lọc thể loại
/catalog/movie/nguonc-movie-latest/genre=Hành Động.json

# Phân trang (skip=0 → page 1, skip=10 → page 2, ...)
/catalog/movie/nguonc-movie-latest/skip=10.json

# Kết hợp
/catalog/series/nguonc-series-latest/genre=Kinh Dị&skip=20.json
```

---

## 🆔 Cấu Trúc ID

| Loại | Format | Ví dụ |
|------|--------|-------|
| Phim lẻ | `nguonc:{slug}` | `nguonc:nu-hiep-ruy-bang` |
| Phim bộ | `nguonc:{slug}` | `nguonc:pham-nhan-tu-tien` |
| Video tập | `nguonc:{slug}:{serverIdx}:{epName}` | `nguonc:pham-nhan-tu-tien:0:1` |

---

## 📁 Cấu Trúc Thư Mục

```
stremio-nguonc-addon/
├── src/
│   ├── index.js        # Entry point Express server
│   ├── manifest.js     # Stremio Manifest + danh sách thể loại
│   ├── api.js          # Layer gọi API NguonC + cache
│   ├── mapper.js       # Chuyển đổi dữ liệu NguonC → Stremio
│   ├── handlers.js     # Express route handlers
│   └── test.js         # Integration tests
├── package.json
├── .env.example
├── .gitignore
└── README.md
```

---

## ⚙️ Cấu Hình

| Biến môi trường | Mặc định | Mô tả |
|-----------------|----------|-------|
| `PORT` | `7000` | Port HTTP server |
| `HOST` | `0.0.0.0` | Bind address |
| `NODE_ENV` | `development` | Môi trường chạy |

---

## 🧪 Chạy Tests

```bash
# Terminal 1: Khởi động server
npm start

# Terminal 2: Chạy tests
node src/test.js
```

Kết quả mẫu:

```
╔══════════════════════════════════════════════════════╗
║         🧪  NguonC Addon - Integration Tests         ║
╚══════════════════════════════════════════════════════╝

📋 TEST 1: Manifest
  ✅ Status 200
  ✅ CORS header: Access-Control-Allow-Origin: *
  ✅ Manifest ID đúng
  ...

╔══════════════════════════════════════════════════════╗
║  Kết quả: 28 passed, 0 failed                        ║
║  🎉 Tất cả tests đều PASS!                           ║
╚══════════════════════════════════════════════════════╝
```

---

## 🌍 Deploy lên Server (Production)

### Option 1: PM2 (khuyến nghị)

```bash
npm install -g pm2
PORT=7000 pm2 start src/index.js --name "nguonc-addon"
pm2 save
pm2 startup
```

### Option 2: Docker

```dockerfile
FROM node:18-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY src/ ./src/
ENV PORT=7000 NODE_ENV=production
EXPOSE 7000
CMD ["node", "src/index.js"]
```

```bash
docker build -t nguonc-addon .
docker run -d -p 7000:7000 --name nguonc-addon nguonc-addon
```

### Option 3: Railway / Render / Fly.io

- Đặt `PORT` trong environment variables
- Dùng `npm start` làm start command
- Railway sẽ tự detect Node.js

---

## 📝 Ghi Chú Kỹ Thuật

### Về Stream Links

NguonC sử dụng **embed links** (từ `streamc.xyz`) thay vì direct M3U8. Stremio/Nuvio có thể phát các embed link này qua `externalUrl` field trong stream response.

Nếu bạn cần direct M3U8, bạn cần thêm middleware để resolve embed → M3U8 (không được đề cập trong API docs NguonC).

### Về Type Detection

NguonC không phân biệt rõ ràng movie/series trong API catalog. Addon này detect type dựa trên:
- `total_episodes === 1` hoặc `current_episode === 'FULL'` → `movie`
- `total_episodes > 1` → `series`
- Dữ liệu trong `category.Định dạng` (nếu có)

### Cache Strategy

| Data | TTL |
|------|-----|
| Catalog (latest, genre, country) | 5 phút |
| Film detail | 10 phút |
| Search results | 2 phút |

---

## 🤝 Đóng Góp

Pull requests & issues luôn được chào đón!

---

## ⚠️ Disclaimer

Addon này chỉ là bridge kết nối đến nội dung từ phim.nguonc.com. Mọi nội dung thuộc về chủ sở hữu gốc. Addon được phát triển với mục đích học tập và nghiên cứu.

---

## 📄 Giấy Phép

MIT © 2024 NguonC Stremio Addon Contributors
