'use strict';

function renderDashboard({ resolvedConfig, baseUrl, currentToken, currentManifestUrl, stremioUrl, webInstallUrl }) {
  const isProvActive = (id) => (resolvedConfig.providers || []).includes(id);
  const isCatActive  = (cat) => (resolvedConfig.categories || []).includes(cat);

  return `<!DOCTYPE html>
<html lang="vi" class="dark">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover" />
  <title>VIP Movies 🎬 — Bảng Cấu Hình 3 Nguồn VIP (VSMOV, KKPhim, NguonC)</title>
  <meta name="description" content="Trung tâm cấu hình đa nguồn phim 4K Ultra HD, Vietsub &amp; Thuyết minh cho Stremio &amp; Nuvio." />
  <meta name="theme-color" content="#07090e" />
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  <link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@300;400;500;600;700;800&family=JetBrains+Mono:wght@400;500;600;700&family=Outfit:wght@400;500;600;700;800&display=swap" rel="stylesheet" />
  <style>
    :root {
      --bg-space: #07090e;
      --bg-surface: rgba(15, 20, 34, 0.75);
      --border-subtle: rgba(255, 255, 255, 0.08);
      --border-hover: rgba(255, 255, 255, 0.2);
      --border-focus: rgba(99, 102, 241, 0.65);
      --text-primary: #f8fafc;
      --text-secondary: #94a3b8;
      --text-muted: #64748b;
      --cyan: #06b6d4;
      --cyan-glow: rgba(6, 182, 212, 0.4);
      --rose: #f43f5e;
      --rose-glow: rgba(244, 63, 94, 0.4);
      --indigo: #6366f1;
      --indigo-glow: rgba(99, 102, 241, 0.4);
      --emerald: #10b981;
      --radius-sm: 12px;
      --radius-md: 18px;
      --radius-lg: 26px;
      --radius-full: 9999px;
      --glass-blur: blur(32px);
      --spring-physics: 0.35s cubic-bezier(0.34, 1.56, 0.64, 1);
      --smooth-ease: 0.22s cubic-bezier(0.16, 1, 0.3, 1);
    }
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    html, body {
      background-color: var(--bg-space);
      color: var(--text-primary);
      font-family: 'Plus Jakarta Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      min-height: 100dvh;
      line-height: 1.55;
      -webkit-font-smoothing: antialiased;
      overflow-x: hidden;
    }
    body { padding: 40px 16px 175px; position: relative; }
    .ambient-canvas {
      position: fixed; inset: 0; pointer-events: none; z-index: 0; overflow: hidden;
      background-image: radial-gradient(rgba(255, 255, 255, 0.04) 1px, transparent 1px);
      background-size: 36px 36px;
    }
    .ambient-orb {
      position: absolute; border-radius: 50%; filter: blur(140px); opacity: 0.25;
      animation: ambientDrift 24s ease-in-out infinite alternate; will-change: transform;
    }
    .orb-cyan { width: 560px; height: 560px; top: -140px; left: -120px; background: radial-gradient(circle, #06b6d4 0%, #3b82f6 70%, transparent); }
    .orb-rose { width: 600px; height: 600px; bottom: -160px; right: -140px; background: radial-gradient(circle, #f43f5e 0%, #a855f7 65%, transparent); }
    .orb-indigo { width: 480px; height: 480px; top: 40%; left: 50%; transform: translate(-50%, -50%); background: radial-gradient(circle, #6366f1 0%, #06b6d4 65%, transparent); }
    @keyframes ambientDrift {
      0% { transform: translate(0, 0) scale(1); }
      50% { transform: translate(30px, 40px) scale(1.08); }
      100% { transform: translate(-30px, -20px) scale(0.92); }
    }
    .layout-wrapper { position: relative; z-index: 1; max-width: 820px; margin: 0 auto; }
    .hero-header { text-align: center; margin-bottom: 34px; }
    .cinema-emblem {
      display: inline-flex; align-items: center; justify-content: center; width: 68px; height: 68px;
      background: linear-gradient(135deg, #06b6d4 0%, #6366f1 50%, #f43f5e 100%);
      border-radius: 22px; font-size: 2.1rem; box-shadow: 0 14px 36px rgba(99, 102, 241, 0.45);
      margin-bottom: 16px;
    }
    .hero-title {
      font-family: 'Outfit', sans-serif; font-size: 2.3rem; font-weight: 800; letter-spacing: -0.04em;
      background: linear-gradient(135deg, #ffffff 0%, #e2e8f0 50%, #c084fc 100%);
      -webkit-background-clip: text; -webkit-text-fill-color: transparent; margin-bottom: 8px;
    }
    .hero-subtitle { font-size: 0.94rem; color: var(--text-secondary); max-width: 60ch; margin: 0 auto 16px; }
    .telemetry-row {
      display: inline-flex; align-items: center; gap: 8px; padding: 6px 16px;
      background: rgba(15, 20, 34, 0.65); border: 1px solid var(--border-subtle);
      border-radius: var(--radius-full); font-size: 0.76rem; font-family: 'JetBrains Mono', monospace;
      color: var(--text-secondary);
    }
    .status-dot-pulse { width: 7px; height: 7px; border-radius: 50%; background: var(--emerald); box-shadow: 0 0 10px var(--emerald); }
    .bento-grid { display: flex; flex-direction: column; gap: 20px; }
    .taste-card {
      background: var(--bg-surface); border: 1px solid var(--border-subtle); border-radius: var(--radius-lg);
      padding: 24px; backdrop-filter: var(--glass-blur); box-shadow: 0 18px 45px rgba(0, 0, 0, 0.4);
    }
    .card-header-bar { display: flex; align-items: center; justify-content: space-between; margin-bottom: 18px; }
    .card-title-text { font-family: 'Outfit', sans-serif; font-size: 1.15rem; font-weight: 700; color: var(--text-primary); }
    .mini-preset-btn {
      font-size: 0.76rem; font-weight: 600; padding: 4px 10px; border-radius: var(--radius-full);
      background: rgba(255, 255, 255, 0.06); border: 1px solid var(--border-subtle); color: var(--text-secondary); cursor: pointer;
    }
    .mini-preset-btn:hover { background: rgba(255, 255, 255, 0.12); color: var(--text-primary); }
    .providers-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; }
    @media (max-width: 720px) { .providers-grid { grid-template-columns: 1fr; } }
    .provider-card {
      background: rgba(255, 255, 255, 0.03); border: 1px solid var(--border-subtle); border-radius: var(--radius-md);
      padding: 16px; cursor: pointer; user-select: none; transition: all var(--spring-physics);
      display: flex; flex-direction: column; justify-content: space-between; min-height: 140px;
    }
    .provider-card:hover { border-color: var(--border-hover); transform: translateY(-2px); }
    .provider-card.active { border-color: var(--border-focus); background: rgba(255, 255, 255, 0.05); }
    .provider-card.active.vsmov  { border-color: rgba(6, 182, 212, 0.7); box-shadow: 0 0 16px rgba(6, 182, 212, 0.25); }
    .provider-card.active.kkphim { border-color: rgba(244, 63, 94, 0.7); box-shadow: 0 0 16px rgba(244, 63, 94, 0.25); }
    .provider-card.active.nguonc { border-color: rgba(99, 102, 241, 0.7); box-shadow: 0 0 16px rgba(99, 102, 241, 0.25); }
    .provider-top { display: flex; align-items: center; justify-content: space-between; margin-bottom: 10px; }
    .switch-track {
      width: 40px; height: 22px; background: rgba(255, 255, 255, 0.12); border-radius: var(--radius-full);
      position: relative; transition: all var(--smooth-ease);
    }
    .switch-thumb {
      position: absolute; top: 2px; left: 2px; width: 18px; height: 18px; background: #fff;
      border-radius: 50%; transition: transform var(--spring-physics);
    }
    .provider-card.active .switch-thumb { transform: translateX(18px); }
    .provider-card.active.vsmov  .switch-track { background: var(--cyan); }
    .provider-card.active.kkphim .switch-track { background: var(--rose); }
    .provider-card.active.nguonc .switch-track { background: var(--indigo); }
    .provider-name { font-size: 1rem; font-weight: 700; margin-bottom: 4px; }
    .provider-desc { font-size: 0.76rem; color: var(--text-secondary); line-height: 1.35; margin-bottom: 10px; }
    .tag-row { display: flex; flex-wrap: wrap; gap: 5px; }
    .tag-badge { font-size: 0.68rem; font-weight: 600; padding: 2px 7px; border-radius: var(--radius-full); font-family: 'JetBrains Mono', monospace; }
    .tag-cyan { background: rgba(6, 182, 212, 0.15); color: #67e8f9; }
    .tag-rose { background: rgba(244, 63, 94, 0.15); color: #fda4af; }
    .tag-indigo { background: rgba(99, 102, 241, 0.15); color: #a5b4fc; }
    .categories-wrap { display: flex; flex-wrap: wrap; gap: 10px; }
    .cat-pill {
      display: inline-flex; align-items: center; gap: 6px; padding: 8px 16px; border-radius: var(--radius-full);
      background: rgba(255, 255, 255, 0.04); border: 1px solid var(--border-subtle); color: var(--text-secondary);
      font-size: 0.84rem; font-weight: 600; cursor: pointer; transition: all var(--spring-physics);
    }
    .cat-pill:hover { background: rgba(255, 255, 255, 0.08); color: var(--text-primary); transform: translateY(-1px); }
    .cat-pill.active { background: rgba(99, 102, 241, 0.25); border-color: rgba(99, 102, 241, 0.6); color: #ffffff; }
    .simulator-box { background: rgba(10, 14, 24, 0.85); border: 1px solid var(--border-subtle); border-radius: var(--radius-md); padding: 14px; }
    .sim-top-bar { display: flex; align-items: center; justify-content: space-between; margin-bottom: 10px; }
    .sim-stream-item {
      display: flex; align-items: center; justify-content: space-between; padding: 8px 12px;
      background: rgba(255, 255, 255, 0.03); border: 1px solid rgba(255, 255, 255, 0.06); border-radius: var(--radius-sm); margin-bottom: 6px;
    }
    .manifest-box {
      background: rgba(0, 0, 0, 0.45); border: 1px solid var(--border-subtle); border-radius: var(--radius-md);
      padding: 14px; cursor: pointer; transition: all var(--smooth-ease);
    }
    .manifest-url-string { font-family: 'JetBrains Mono', monospace; font-size: 0.8rem; color: #38bdf8; word-break: break-all; }
    .taste-footer { text-align: center; margin-top: 36px; font-size: 0.8rem; color: var(--text-muted); font-family: 'JetBrains Mono', monospace; }
    .floating-action-dock {
      position: fixed; bottom: 20px; left: 50%; transform: translateX(-50%); width: calc(100% - 32px); max-width: 820px; z-index: 100;
    }
    .dock-container {
      background: rgba(14, 18, 30, 0.92); border: 1px solid rgba(255, 255, 255, 0.15); border-radius: var(--radius-lg);
      padding: 14px 18px; backdrop-filter: blur(36px); box-shadow: 0 20px 50px rgba(0, 0, 0, 0.7);
    }
    .dock-status-bar { display: flex; align-items: center; justify-content: space-between; margin-bottom: 10px; font-size: 0.82rem; }
    .cta-button-group { display: grid; grid-template-columns: 1.4fr 1fr 0.9fr 0.9fr; gap: 8px; }
    @media (max-width: 680px) { .cta-button-group { grid-template-columns: 1fr 1fr; } }
    .cta-btn {
      display: inline-flex; align-items: center; justify-content: center; gap: 6px; padding: 11px 14px;
      border-radius: var(--radius-sm); font-weight: 700; font-size: 0.84rem; text-decoration: none; cursor: pointer; border: none; font-family: inherit;
    }
    .cta-btn-primary { background: linear-gradient(135deg, #06b6d4 0%, #6366f1 50%, #f43f5e 100%); color: #ffffff; }
    .cta-btn-secondary { background: rgba(255, 255, 255, 0.06); color: var(--text-primary); border: 1px solid var(--border-subtle); }
    .cta-btn-qr { background: rgba(6, 182, 212, 0.12); color: #38bdf8; border: 1px solid rgba(6, 182, 212, 0.3); }
    .cta-btn-copy { background: rgba(167, 139, 250, 0.12); color: #c084fc; border: 1px solid rgba(167, 139, 250, 0.3); }
    .qr-modal-backdrop {
      position: fixed; inset: 0; background: rgba(0, 0, 0, 0.8); backdrop-filter: blur(20px); z-index: 200;
      display: flex; align-items: center; justify-content: center; padding: 16px; opacity: 0; pointer-events: none; transition: opacity var(--smooth-ease);
    }
    .qr-modal-backdrop.active { opacity: 1; pointer-events: auto; }
    .qr-modal-card { background: #0f1422; border: 1px solid var(--border-hover); border-radius: var(--radius-lg); padding: 24px; text-align: center; max-width: 360px; }
    .qr-img-wrap { background: #fff; padding: 10px; border-radius: var(--radius-md); display: inline-block; margin: 14px 0; }
    .clipboard-toast {
      position: fixed; bottom: 120px; left: 50%; transform: translateX(-50%) translateY(20px);
      background: rgba(15, 20, 34, 0.95); border: 1px solid rgba(52, 211, 153, 0.4); color: #34d399;
      padding: 10px 20px; border-radius: var(--radius-full); font-size: 0.82rem; font-weight: 600; opacity: 0; pointer-events: none; transition: all var(--smooth-ease);
    }
    .clipboard-toast.show { transform: translateX(-50%) translateY(0); opacity: 1; }
  </style>
</head>
<body>
  <div class="ambient-canvas">
    <div class="ambient-orb orb-cyan"></div>
    <div class="ambient-orb orb-rose"></div>
    <div class="ambient-orb orb-indigo"></div>
  </div>

  <main class="layout-wrapper">
    <header class="hero-header">
      <div class="cinema-emblem">🎬</div>
      <h1 class="hero-title">VIP Movies Hub</h1>
      <p class="hero-subtitle">Bảng cấu hình 3 Nguồn Phim VIP: <strong>VSMOV 4K, KKPhim &amp; NguonC</strong> cho Stremio / Nuvio</p>
      <div class="telemetry-row">
        <span class="status-dot-pulse"></span>
        <span>3 Nguồn VIP Sẵn Sàng</span>
        <span>•</span>
        <span>HLS Zero-Copy Stream</span>
        <span>•</span>
        <span>Khớp Chuẩn IMDb</span>
      </div>
    </header>

    <div class="bento-grid">
      <!-- Providers -->
      <section class="taste-card">
        <div class="card-header-bar">
          <h2 class="card-title-text">⚡ 3 Nguồn Phát VIP Cốt Lõi</h2>
          <div>
            <button class="mini-preset-btn" onclick="selectAllProviders()">Bật Tất Cả</button>
            <button class="mini-preset-btn" onclick="deselectAllProviders()">Chỉ VSMOV 4K</button>
          </div>
        </div>
        <div class="providers-grid">
          <!-- VSMOV (VIP 1) -->
          <div class="provider-card vsmov ${isProvActive('vsmov') ? 'active' : ''}" id="card-vsmov" onclick="toggleProvider('vsmov')" role="checkbox" aria-checked="${isProvActive('vsmov') ? 'true' : 'false'}" tabindex="0">
            <div class="provider-top">
              <span style="font-size:1.3rem;">🌟</span>
              <div class="switch-track"><div class="switch-thumb"></div></div>
            </div>
            <div>
              <div class="provider-name">VSMOV 4K (VIP 1)</div>
              <div class="provider-desc">vsmov.com — Phim 4K Ultra HD, Vietsub &amp; Thuyết Minh</div>
            </div>
            <div class="tag-row">
              <span class="tag-badge tag-cyan">4K Ultra HD</span>
              <span class="tag-badge tag-rose">Vietsub WebVTT</span>
            </div>
          </div>

          <!-- KKPhim (VIP 2) -->
          <div class="provider-card kkphim ${isProvActive('kkphim') ? 'active' : ''}" id="card-kkphim" onclick="toggleProvider('kkphim')" role="checkbox" aria-checked="${isProvActive('kkphim') ? 'true' : 'false'}" tabindex="0">
            <div class="provider-top">
              <span style="font-size:1.3rem;">🎬</span>
              <div class="switch-track"><div class="switch-thumb"></div></div>
            </div>
            <div>
              <div class="provider-name">KKPhim (VIP 2)</div>
              <div class="provider-desc">phimapi.com — Phim Lẻ, Phim Bộ &amp; Chiếu Rạp Full HD</div>
            </div>
            <div class="tag-row">
              <span class="tag-badge tag-rose">1080p FHD</span>
              <span class="tag-badge tag-indigo">Chiếu Rạp</span>
            </div>
          </div>

          <!-- NguonC (VIP 3) -->
          <div class="provider-card nguonc ${isProvActive('nguonc') ? 'active' : ''}" id="card-nguonc" onclick="toggleProvider('nguonc')" role="checkbox" aria-checked="${isProvActive('nguonc') ? 'true' : 'false'}" tabindex="0">
            <div class="provider-top">
              <span style="font-size:1.3rem;">📺</span>
              <div class="switch-track"><div class="switch-thumb"></div></div>
            </div>
            <div>
              <div class="provider-name">NguonC (VIP 3)</div>
              <div class="provider-desc">phim.nguonc.com — StreamC CDN, Vietsub &amp; Thuyết Minh</div>
            </div>
            <div class="tag-row">
              <span class="tag-badge tag-indigo">StreamC CDN</span>
              <span class="tag-badge tag-cyan">Vietsub HD</span>
            </div>
          </div>
        </div>
      </section>

      <!-- Categories -->
      <section class="taste-card">
        <div class="card-header-bar">
          <h2 class="card-title-text">🏷️ Thể Loại &amp; Danh Mục</h2>
        </div>
        <div class="categories-wrap">
          <div class="cat-pill ${isCatActive('movie') ? 'active' : ''}" id="cat-movie" onclick="toggleCategory('movie')" role="checkbox" aria-checked="${isCatActive('movie') ? 'true' : 'false'}" tabindex="0">🎬 Phim Lẻ</div>
          <div class="cat-pill ${isCatActive('series') ? 'active' : ''}" id="cat-series" onclick="toggleCategory('series')" role="checkbox" aria-checked="${isCatActive('series') ? 'true' : 'false'}" tabindex="0">📺 Phim Bộ</div>
          <div class="cat-pill ${isCatActive('cinema') ? 'active' : ''}" id="cat-cinema" onclick="toggleCategory('cinema')" role="checkbox" aria-checked="${isCatActive('cinema') ? 'true' : 'false'}" tabindex="0">🍿 Chiếu Rạp</div>
          <div class="cat-pill ${isCatActive('anime') ? 'active' : ''}" id="cat-anime" onclick="toggleCategory('anime')" role="checkbox" aria-checked="${isCatActive('anime') ? 'true' : 'false'}" tabindex="0">🐉 Hoạt Hình &amp; Anime</div>
        </div>
      </section>

      <!-- Simulator -->
      <section class="taste-card">
        <div class="card-header-bar">
          <h2 class="card-title-text">📺 Mô Phỏng Luồng Phát Trong Stremio</h2>
        </div>
        <div class="simulator-box" id="sim-stream-list"></div>
      </section>

      <!-- Manifest Box -->
      <section class="taste-card">
        <div class="card-header-bar">
          <h2 class="card-title-text">🔗 Link Cài Đặt Cá Nhân Hóa</h2>
        </div>
        <div class="manifest-box" onclick="copyManifest()">
          <div class="manifest-url-string" id="manifest-preview">${currentManifestUrl}</div>
        </div>
      </section>
    </div>

    <footer class="taste-footer">
      VIP Movies Engine v2.0.0 • Multi-Source 4K Architecture by Q121101
    </footer>
  </main>

  <div class="floating-action-dock">
    <div class="dock-container">
      <div class="dock-status-bar">
        <span>Đang bật: <strong id="provider-count">${resolvedConfig.providers.length} nguồn VIP</strong> · <strong id="category-count">${resolvedConfig.categories.length} danh mục</strong></span>
        <span style="color:#34d399; font-weight:600;">● Tự động đồng bộ</span>
      </div>
      <div class="cta-button-group">
        <a class="cta-btn cta-btn-primary" id="stremio-install-btn" href="${stremioUrl}">⚡ Cài Vào Stremio</a>
        <a class="cta-btn cta-btn-secondary" id="web-install-btn" href="${webInstallUrl}" target="_blank" rel="noopener noreferrer">🌐 Stremio Web</a>
        <button class="cta-btn cta-btn-qr" onclick="openQrModal()">📱 Quét QR TV</button>
        <button class="cta-btn cta-btn-copy" onclick="copyManifest()">📋 Sao Chép Link</button>
      </div>
    </div>
  </div>

  <div class="qr-modal-backdrop" id="qr-modal" onclick="closeQrModal(event)">
    <div class="qr-modal-card" onclick="event.stopPropagation()">
      <h3 style="font-family:Outfit,sans-serif; font-size:1.2rem; font-weight:700; margin-bottom:6px;">Quét Mã Cài Đặt TV</h3>
      <p style="font-size:0.8rem; color:var(--text-secondary);">Mở camera điện thoại hoặc TV để quét mã cài đặt</p>
      <div class="qr-img-wrap">
        <img id="qr-img-element" src="https://api.qrserver.com/v1/create-qr-code/?size=220x220&data=${encodeURIComponent(stremioUrl)}" alt="QR Code" style="display:block; width:200px; height:200px;" />
      </div>
      <button class="mini-preset-btn" onclick="closeQrModal()" style="padding:8px 18px; margin-top:8px;">Đóng Cửa Sổ</button>
    </div>
  </div>

  <div class="clipboard-toast" id="toast">✅ Đã sao chép link Manifest!</div>

  <script>
    var _baseUrl = window.location.origin;
    var _allProvidersList = ['vsmov', 'kkphim', 'nguonc'];
    var _allCategoriesList = ['movie', 'series', 'cinema', 'anime'];
    var _providers = new Set(${JSON.stringify(resolvedConfig.providers)});
    var _categories = new Set(${JSON.stringify(resolvedConfig.categories)});

    function encodeConfigClient(providers, categories) {
      var cfg = { providers: Array.from(providers).sort(), categories: Array.from(categories).sort() };
      try {
        return btoa(unescape(encodeURIComponent(JSON.stringify(cfg)))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
      } catch(e) { return ''; }
    }

    function updateSimulator() {
      var listEl = document.getElementById('sim-stream-list');
      if (!listEl) return;
      var html = '';
      if (_providers.has('vsmov')) {
        html += '<div class="sim-stream-item"><div><strong>[VIP 1 • VSMOV] Vietsub 4K Ultra HD</strong><div style="font-size:0.75rem; color:var(--text-muted);">⚡ vsmov.com • HLS Zero-Copy</div></div><span class="tag-badge tag-cyan">4K UHD</span></div>';
      }
      if (_providers.has('kkphim')) {
        html += '<div class="sim-stream-item"><div><strong>[VIP 2 • KKPhim] Vietsub Full HD</strong><div style="font-size:0.75rem; color:var(--text-muted);">⚡ phimapi.com • Phát trực tiếp trong App</div></div><span class="tag-badge tag-rose">1080p FHD</span></div>';
      }
      if (_providers.has('nguonc')) {
        html += '<div class="sim-stream-item"><div><strong>[VIP 3 • NguonC] Vietsub &amp; Thuyết Minh</strong><div style="font-size:0.75rem; color:var(--text-muted);">⚡ phim.nguonc.com • StreamC Direct</div></div><span class="tag-badge tag-indigo">StreamC</span></div>';
      }
      if (!html) html = '<div style="text-align:center; padding:12px; font-size:0.8rem; color:var(--text-muted);">Chưa chọn nguồn phát nào</div>';
      listEl.innerHTML = html;
    }

    function updateState() {
      var token = encodeConfigClient(_providers, _categories);
      var manifestUrl = _baseUrl + '/' + token + '/manifest.json';
      var stremioDeep = _baseUrl.replace(/^https?:\/\//, 'stremio://') + '/' + token + '/manifest.json';
      var webUrl = 'https://web.stremio.com/#/addons?addon=' + encodeURIComponent(manifestUrl);

      document.getElementById('manifest-preview').textContent = manifestUrl;
      document.getElementById('stremio-install-btn').href = stremioDeep;
      document.getElementById('web-install-btn').href = webUrl;
      document.getElementById('provider-count').textContent = _providers.size + ' nguồn VIP';
      document.getElementById('category-count').textContent = _categories.size + ' danh mục';

      var qrImg = document.getElementById('qr-img-element');
      if (qrImg) qrImg.src = 'https://api.qrserver.com/v1/create-qr-code/?size=220x220&data=' + encodeURIComponent(stremioDeep);

      if (window.history && window.history.replaceState) {
        window.history.replaceState(null, '', '/' + token + '/');
      }
      updateSimulator();
    }

    function toggleProvider(p) {
      if (_providers.has(p)) {
        if (_providers.size <= 1) { showToast('⚠️ Cần giữ lại ít nhất 1 nguồn phát!'); return; }
        _providers.delete(p);
        var el = document.getElementById('card-' + p);
        if (el) { el.classList.remove('active'); el.setAttribute('aria-checked', 'false'); }
      } else {
        _providers.add(p);
        var el = document.getElementById('card-' + p);
        if (el) { el.classList.add('active'); el.setAttribute('aria-checked', 'true'); }
      }
      updateState();
    }

    function toggleCategory(c) {
      if (_categories.has(c)) {
        if (_categories.size <= 1) { showToast('⚠️ Cần giữ lại ít nhất 1 thể loại!'); return; }
        _categories.delete(c);
        var el = document.getElementById('cat-' + c);
        if (el) { el.classList.remove('active'); el.setAttribute('aria-checked', 'false'); }
      } else {
        _categories.add(c);
        var el = document.getElementById('cat-' + c);
        if (el) { el.classList.add('active'); el.setAttribute('aria-checked', 'true'); }
      }
      updateState();
    }

    function selectAllProviders() {
      _allProvidersList.forEach(function(p) {
        _providers.add(p);
        var el = document.getElementById('card-' + p);
        if (el) { el.classList.add('active'); el.setAttribute('aria-checked', 'true'); }
      });
      updateState();
    }

    function deselectAllProviders() {
      _allProvidersList.forEach(function(p) {
        if (p !== 'vsmov') {
          _providers.delete(p);
          var el = document.getElementById('card-' + p);
          if (el) { el.classList.remove('active'); el.setAttribute('aria-checked', 'false'); }
        }
      });
      _providers.add('vsmov');
      var vsmovEl = document.getElementById('card-vsmov');
      if (vsmovEl) { vsmovEl.classList.add('active'); vsmovEl.setAttribute('aria-checked', 'true'); }
      updateState();
    }

    function openQrModal() { document.getElementById('qr-modal').classList.add('active'); }
    function closeQrModal() { document.getElementById('qr-modal').classList.remove('active'); }

    function copyManifest() {
      var url = document.getElementById('manifest-preview').textContent;
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(url).then(function() { showToast('✅ Đã sao chép link Manifest!'); }).catch(function() { fallbackCopy(url); });
      } else { fallbackCopy(url); }
    }

    function fallbackCopy(text) {
      var ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed'; ta.style.opacity = '0';
      document.body.appendChild(ta); ta.select();
      try { document.execCommand('copy'); showToast('✅ Đã sao chép link Manifest!'); } catch(e) {}
      document.body.removeChild(ta);
    }

    var _toastTimer = null;
    function showToast(msg) {
      var t = document.getElementById('toast');
      if (!t) return;
      t.textContent = msg; t.classList.add('show');
      if (_toastTimer) clearTimeout(_toastTimer);
      _toastTimer = setTimeout(function() { t.classList.remove('show'); }, 2500);
    }

    updateSimulator();
  </script>
</body>
</html>`;
}

module.exports = {
  renderDashboard,
};
