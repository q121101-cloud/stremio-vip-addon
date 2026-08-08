#!/usr/bin/env bash
# ============================================================
#  push-to-github.sh
#  Script tự động tạo GitHub repo và push code lên
#  
#  Cách dùng:
#    chmod +x push-to-github.sh
#    GH_TOKEN=ghp_xxxxxxxxxxxx ./push-to-github.sh
#
#  Hoặc đặt token trước rồi chạy:
#    export GH_TOKEN=ghp_xxxxxxxxxxxx
#    ./push-to-github.sh
# ============================================================

set -e  # Dừng ngay nếu có lỗi

# ─── Kiểm tra token ──────────────────────────────────────────
if [ -z "$GH_TOKEN" ]; then
  echo "❌ Lỗi: Biến môi trường GH_TOKEN chưa được đặt."
  echo ""
  echo "  Cách lấy token:"
  echo "  1. Vào https://github.com/settings/tokens/new"
  echo "  2. Chọn scopes: repo, workflow"
  echo "  3. Copy token và chạy lại:"
  echo "     GH_TOKEN=ghp_xxxx ./push-to-github.sh"
  exit 1
fi

REPO_NAME="stremio-nguonc-addon"

echo "🔐 Đang xác thực với GitHub CLI..."
echo "$GH_TOKEN" | gh auth login --with-token

echo ""
echo "👤 Đã đăng nhập với tài khoản:"
GH_USER=$(gh api user --jq '.login')
echo "   GitHub Username: $GH_USER"

echo ""
echo "📦 Đang tạo repository public: $REPO_NAME ..."
gh repo create "$REPO_NAME" \
  --public \
  --description "Stremio Addon for NguonC - Xem phim Vietsub, thuyết minh từ phim.nguonc.com. Tương thích Stremio v4 & Nuvio App." \
  --homepage "https://${REPO_NAME}.onrender.com" \
  2>&1 || true  # Bỏ qua nếu repo đã tồn tại

echo ""
echo "🔗 Đang cấu hình remote origin..."
REMOTE_URL="https://github.com/${GH_USER}/${REPO_NAME}.git"

# Dùng token trong URL để push không cần interactive auth
REMOTE_WITH_TOKEN="https://${GH_TOKEN}@github.com/${GH_USER}/${REPO_NAME}.git"

git remote remove origin 2>/dev/null || true
git remote add origin "$REMOTE_WITH_TOKEN"

echo ""
echo "🚀 Đang push code lên GitHub..."
git push -u origin main

# Đặt lại remote URL không chứa token (bảo mật)
git remote set-url origin "$REMOTE_URL"

REPO_URL="https://github.com/${GH_USER}/${REPO_NAME}"

echo ""
echo "╔══════════════════════════════════════════════════════════╗"
echo "║  ✅  ĐÃ PUSH CODE LÊN GITHUB THÀNH CÔNG!               ║"
echo "╠══════════════════════════════════════════════════════════╣"
echo "║                                                          ║"
echo "║  🔗 Repository URL:                                      ║"
echo "║     $REPO_URL"
echo "║                                                          ║"
echo "╠══════════════════════════════════════════════════════════╣"
echo "║  🌐 HƯỚNG DẪN DEPLOY LÊN RENDER.COM                    ║"
echo "╠══════════════════════════════════════════════════════════╣"
echo "║                                                          ║"
echo "║  1. Vào https://render.com → New → Web Service          ║"
echo "║  2. Kết nối GitHub account & chọn repo:                 ║"
echo "║     $REPO_NAME"
echo "║  3. Cấu hình:                                           ║"
echo "║     • Name:        stremio-nguonc-addon                 ║"
echo "║     • Environment: Node                                  ║"
echo "║     • Build Cmd:   npm install                           ║"
echo "║     • Start Cmd:   npm start                             ║"
echo "║     • Plan:        Free                                  ║"
echo "║  4. Click 'Create Web Service'                           ║"
echo "║  5. Sau deploy, URL manifest sẽ là:                     ║"
echo "║     https://stremio-nguonc-addon.onrender.com/manifest.json"
echo "║                                                          ║"
echo "╚══════════════════════════════════════════════════════════╝"
echo ""
echo "💡 Tip: Thêm URL manifest vào Stremio hoặc Nuvio App!"
echo "   Render Free tier có thể sleep sau 15 phút idle."
echo "   Dùng UptimeRobot để ping mỗi 5 phút để tránh sleep."
