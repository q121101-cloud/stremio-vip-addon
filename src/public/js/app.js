'use strict';

/**
 * VIP Movies Stremio Addon Configurator Application
 */
(function () {
  // Application State
  const state = {
    providers: ['vsmov', 'kkphim', 'nguonc'],
    categories: ['phim-moi', 'phim-le', 'phim-bo', 'hoat-hinh', 'phim-chieu-rap'],
    proxyQuality: 'auto',
    preferredAudio: 'vietsub',
    selectedMedia: 'movie_cuumon'
  };

  // DOM Element References (Safe for Node.js test environment)
  const dom = {
    get toggleVsmov() { return typeof document !== 'undefined' ? document.getElementById('toggle-vsmov') : null; },
    get toggleKkphim() { return typeof document !== 'undefined' ? document.getElementById('toggle-kkphim') : null; },
    get toggleNguonc() { return typeof document !== 'undefined' ? document.getElementById('toggle-nguonc') : null; },
    get categoryChips() { return typeof document !== 'undefined' ? document.querySelectorAll('.chip-btn') : []; },
    get audioButtons() { return typeof document !== 'undefined' ? document.querySelectorAll('#audio-pref .segment-btn') : []; },
    get mediaSelect() { return typeof document !== 'undefined' ? document.getElementById('simulator-media-select') : null; },
    get streamList() { return typeof document !== 'undefined' ? document.getElementById('stream-simulator-list') : null; },
    get manifestInput() { return typeof document !== 'undefined' ? document.getElementById('manifest-url-input') : null; },
    get btnCopy() { return typeof document !== 'undefined' ? document.getElementById('btn-copy-manifest') : null; },
    get btnInstall() { return typeof document !== 'undefined' ? document.getElementById('btn-install-stremio') : null; },
    get btnOpenQr() { return typeof document !== 'undefined' ? document.getElementById('btn-open-qr-modal') : null; },
    get modalCopyBtn() { return typeof document !== 'undefined' ? document.getElementById('modal-copy-btn') : null; }
  };

  // Mock Media Fixtures for Stream Simulator Preview
  const MOCK_MEDIA = {
    movie_cuumon: {
      type: 'movie',
      title: 'Cửu Môn (Nine Gates)',
      streams: [
        {
          provider: 'vsmov',
          title: '[VIP 1 • VSMOV] 4K Ultra HD (Vietsub)',
          subtitle: 'Full • Server 4K Master\n⚡ 3840x2160 · WebVTT Subs · Multi-Audio',
          quality: '4K UHD',
          audio: 'Vietsub + Thuyết Minh'
        },
        {
          provider: 'kkphim',
          title: '[VIP 2 • KKPhim] 1080p FHD (Vietsub)',
          subtitle: 'Full • Server Vietsub #1\n⚡ Direct HLS Playback',
          quality: '1080p FHD',
          audio: 'Vietsub'
        },
        {
          provider: 'nguonc',
          title: '[VIP 3 • NguonC] 1080p StreamC (Anti-403 Proxy)',
          subtitle: 'Full • Server VIP StreamC\n🛡️ Reverse Proxy Active',
          quality: '1080p',
          audio: 'Vietsub',
          proxy: true
        }
      ]
    },
    series_toanchuc: {
      type: 'series',
      title: "Toàn Chức Cao Thủ - Tập 1 (The King's Avatar)",
      streams: [
        {
          provider: 'vsmov',
          title: '[VIP 1 • VSMOV] 4K Ultra HD (Vietsub)',
          subtitle: 'Tập 1 • Server 4K Master\n⚡ 3840x2160 · WebVTT Subs',
          quality: '4K UHD',
          audio: 'Vietsub'
        },
        {
          provider: 'vsmov',
          title: '[VIP 1 • VSMOV] 4K Ultra HD (Thuyết Minh)',
          subtitle: 'Tập 1 • Server 4K Master\n⚡ 3840x2160 · Thuyết Minh VIP',
          quality: '4K UHD',
          audio: 'Thuyết Minh'
        },
        {
          provider: 'kkphim',
          title: '[VIP 2 • KKPhim] 1080p FHD (Vietsub)',
          subtitle: 'Tập 1 • Server Vietsub #1\n⚡ Direct HLS Playback',
          quality: '1080p FHD',
          audio: 'Vietsub'
        }
      ]
    },
    imdb_whilesleeping: {
      type: 'series',
      title: 'Khi Nàng Say Giấc - Tập 1 (IMDb tt7458054)',
      streams: [
        {
          provider: 'vsmov',
          title: '[VIP 1 • VSMOV] 4K Ultra HD (Vietsub)',
          subtitle: 'Tập 1 • IMDb tt7458054 Matched\n⚡ 3840x2160 · WebVTT Subs',
          quality: '4K UHD',
          audio: 'Vietsub'
        },
        {
          provider: 'kkphim',
          title: '[VIP 2 • KKPhim] 1080p FHD (Vietsub)',
          subtitle: 'Tập 1 • PhimAPI Matched\n⚡ Direct HLS Playback',
          quality: '1080p FHD',
          audio: 'Vietsub'
        },
        {
          provider: 'nguonc',
          title: '[VIP 3 • NguonC] 1080p StreamC (Anti-403 Proxy)',
          subtitle: 'Tập 1 • StreamC CDN\n🛡️ Reverse Proxy Active',
          quality: '1080p',
          audio: 'Vietsub',
          proxy: true
        }
      ]
    },
    movie_avatar2: {
      type: 'movie',
      title: 'Avatar: Dòng Chảy Của Nước (Avatar 2 - Phim 4K Rạp)',
      streams: [
        {
          provider: 'vsmov',
          title: '[VIP 1 • VSMOV] 4K Ultra HD (Vietsub + Thuyết Minh)',
          subtitle: 'Full • Server 4K Master\n⚡ 3840x2160 60FPS · WebVTT Subs',
          quality: '4K UHD',
          audio: 'Vietsub + Thuyết Minh'
        },
        {
          provider: 'kkphim',
          title: '[VIP 2 • KKPhim] 1080p FHD (Vietsub)',
          subtitle: 'Full • Bản Chiếu Rạp FHD\n⚡ Direct HLS Playback',
          quality: '1080p FHD',
          audio: 'Vietsub'
        }
      ]
    }
  };

  /**
   * Encodes state object into Base64URL string
   */
  function encodeBase64Url(obj) {
    try {
      const json = JSON.stringify(obj);
      return btoa(unescape(encodeURIComponent(json)))
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=+$/, '');
    } catch (_) {
      return '';
    }
  }

  /**
   * Decodes Base64URL string into state object
   */
  function decodeBase64Url(str) {
    try {
      let b64 = str.replace(/-/g, '+').replace(/_/g, '/');
      while (b64.length % 4) b64 += '=';
      const json = decodeURIComponent(escape(atob(b64)));
      return JSON.parse(json);
    } catch (_) {
      return null;
    }
  }

  /**
   * Calculates 16-bit bitmask from active state
   */
  function computeBitmask() {
    let mask = 0;
    if (state.providers.includes('nguonc')) mask |= 1;
    if (state.providers.includes('kkphim')) mask |= 2;
    if (state.providers.includes('vsmov')) mask |= 4;
    if (state.categories.includes('phim-le')) mask |= 8;
    if (state.categories.includes('phim-bo')) mask |= 16;
    if (state.categories.includes('hoat-hinh')) mask |= 32;
    if (state.categories.includes('phim-chieu-rap')) mask |= 64;
    if (state.categories.includes('phim-moi')) mask |= 128;
    return mask;
  }

  /**
   * Builds the current public Manifest URL and Stremio Deep Link
   */
  function buildManifestUrls() {
    const origin = (typeof window !== 'undefined' && window.location.origin) || 'http://localhost:7000';
    const host = (typeof window !== 'undefined' && window.location.host) || 'localhost:7000';
    const token = encodeBase64Url({
      providers: state.providers,
      categories: state.categories,
      proxyQuality: state.proxyQuality,
      preferredAudio: state.preferredAudio
    });

    const httpsUrl = `${origin}/c/${token}/manifest.json`;
    const stremioDeepLink = `stremio://${host}/c/${token}/manifest.json`;

    return { token, httpsUrl, stremioDeepLink };
  }

  /**
   * Syncs UI state into DOM and re-renders stream simulator
   */
  function syncUI() {
    // 1. Checkbox states
    if (dom.toggleVsmov) dom.toggleVsmov.checked = state.providers.includes('vsmov');
    if (dom.toggleKkphim) dom.toggleKkphim.checked = state.providers.includes('kkphim');
    if (dom.toggleNguonc) dom.toggleNguonc.checked = state.providers.includes('nguonc');

    // 2. Category chips
    if (dom.categoryChips) {
      dom.categoryChips.forEach(chip => {
        const cat = chip.getAttribute('data-category');
        if (state.categories.includes(cat)) {
          chip.classList.add('active');
        } else {
          chip.classList.remove('active');
        }
      });
    }

    // 3. Audio preference buttons
    if (dom.audioButtons) {
      dom.audioButtons.forEach(btn => {
        const audio = btn.getAttribute('data-audio');
        if (state.preferredAudio === audio) {
          btn.classList.add('active');
        } else {
          btn.classList.remove('active');
        }
      });
    }

    // 4. Update manifest URL input
    const { token, httpsUrl } = buildManifestUrls();
    if (dom.manifestInput) {
      dom.manifestInput.value = httpsUrl;
    }

    // 5. Update browser hash
    try {
      history.replaceState(null, '', `#c=${token}`);
    } catch (_) {}

    // 6. Update QR Code if modal script loaded
    if (window.QRModal && typeof window.QRModal.renderQR === 'function') {
      window.QRModal.renderQR(httpsUrl);
    }

    // 7. Render Stream Simulator
    renderSimulator();
  }

  /**
   * Renders simulated stream cards
   */
  function renderSimulator() {
    if (!dom.streamList) return;

    if (state.providers.length === 0) {
      dom.streamList.innerHTML = `
        <div class="empty-warning-banner">
          <span class="warn-icon">⚠️</span>
          <span>Vui lòng kích hoạt ít nhất 1 nhà cung cấp để xem stream!</span>
        </div>
      `;
      return;
    }

    const currentMedia = MOCK_MEDIA[state.selectedMedia] || MOCK_MEDIA.movie_cuumon;
    const activeStreams = currentMedia.streams.filter(s => {
      // Provider filter
      if (!state.providers.includes(s.provider)) return false;
      // Audio filter
      if (state.preferredAudio === 'thuyet-minh' && !s.audio.includes('Thuyết Minh')) return false;
      if (state.preferredAudio === 'vietsub' && !s.audio.includes('Vietsub')) return false;
      return true;
    });

    if (activeStreams.length === 0) {
      dom.streamList.innerHTML = `
        <div class="empty-warning-banner">
          <span class="warn-icon">🔍</span>
          <span>Không có luồng phù hợp với bộ lọc âm thanh hiện tại.</span>
        </div>
      `;
      return;
    }

    dom.streamList.innerHTML = activeStreams.map(s => {
      const is4K = s.quality.includes('4K');
      const qualityClass = is4K ? 'tag-quality-4k' : 'tag-quality-1080p';

      return `
        <div class="stream-card ${s.provider}">
          <div class="stream-card-left">
            <div class="stream-title">${s.title}</div>
            <div class="stream-subtitle">${s.subtitle}</div>
            <div class="stream-tags">
              <span class="stream-tag ${qualityClass}">${s.quality}</span>
              <span class="stream-tag tag-audio-sub">${s.audio}</span>
              ${s.proxy ? '<span class="stream-tag tag-proxy">🛡️ Anti-403 Proxy</span>' : '<span class="stream-tag tag-proxy">⚡ Direct HLS</span>'}
            </div>
          </div>
        </div>
      `;
    }).join('');
  }

  /**
   * Copies text to clipboard and triggers feedback toast
   */
  function copyToClipboard(text, message = 'Đã sao chép Manifest URL vào bộ nhớ tạm!') {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(() => {
        showToast(message);
      }).catch(() => {
        fallbackCopy(text, message);
      });
    } else {
      fallbackCopy(text, message);
    }
  }

  function fallbackCopy(text, message) {
    const input = document.createElement('textarea');
    input.value = text;
    document.body.appendChild(input);
    input.select();
    try {
      document.execCommand('copy');
      showToast(message);
    } catch (_) {}
    document.body.removeChild(input);
  }

  function showToast(msg) {
    const container = document.getElementById('toast-container');
    if (!container) return;
    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.innerHTML = `<span>✨</span> <span>${msg}</span>`;
    container.appendChild(toast);
    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transform = 'translateY(10px)';
      toast.style.transition = 'all 0.3s ease';
      setTimeout(() => toast.remove(), 300);
    }, 2500);
  }

  // Event Bindings
  function bindEvents() {
    // Provider Toggles
    const updateProvider = (provider, isChecked) => {
      if (isChecked && !state.providers.includes(provider)) {
        state.providers.push(provider);
      } else if (!isChecked) {
        state.providers = state.providers.filter(p => p !== provider);
      }
      syncUI();
    };

    if (dom.toggleVsmov) dom.toggleVsmov.addEventListener('change', e => updateProvider('vsmov', e.target.checked));
    if (dom.toggleKkphim) dom.toggleKkphim.addEventListener('change', e => updateProvider('kkphim', e.target.checked));
    if (dom.toggleNguonc) dom.toggleNguonc.addEventListener('change', e => updateProvider('nguonc', e.target.checked));

    // Category Chips
    if (dom.categoryChips) {
      dom.categoryChips.forEach(chip => {
        chip.addEventListener('click', () => {
          const cat = chip.getAttribute('data-category');
          if (state.categories.includes(cat)) {
            if (state.categories.length > 1) {
              state.categories = state.categories.filter(c => c !== cat);
            } else {
              showToast('Phải chọn ít nhất 1 danh mục!');
              return;
            }
          } else {
            state.categories.push(cat);
          }
          syncUI();
        });
      });
    }

    // Audio Buttons
    if (dom.audioButtons) {
      dom.audioButtons.forEach(btn => {
        btn.addEventListener('click', () => {
          state.preferredAudio = btn.getAttribute('data-audio') || 'vietsub';
          syncUI();
        });
      });
    }

    // Media Selector
    if (dom.mediaSelect) {
      dom.mediaSelect.addEventListener('change', e => {
        state.selectedMedia = e.target.value;
        renderSimulator();
      });
    }

    // 1-Click Install Button
    if (dom.btnInstall) {
      dom.btnInstall.addEventListener('click', () => {
        const { stremioDeepLink } = buildManifestUrls();
        window.location.href = stremioDeepLink;
      });
    }

    // Copy Manifest Buttons
    if (dom.btnCopy) {
      dom.btnCopy.addEventListener('click', () => {
        const { httpsUrl } = buildManifestUrls();
        copyToClipboard(httpsUrl);
      });
    }

    if (dom.modalCopyBtn) {
      dom.modalCopyBtn.addEventListener('click', () => {
        const { httpsUrl } = buildManifestUrls();
        copyToClipboard(httpsUrl);
      });
    }

    // Open QR Modal
    if (dom.btnOpenQr) {
      dom.btnOpenQr.addEventListener('click', () => {
        const { httpsUrl } = buildManifestUrls();
        if (window.QRModal) {
          window.QRModal.open(httpsUrl);
        }
      });
    }
  }

  // Pre-populate configuration from URL hash if available
  function initFromUrl() {
    try {
      const hash = window.location.hash || '';
      const match = hash.match(/#c=([A-Za-z0-9_-]+)/);
      if (match && match[1]) {
        const parsed = decodeBase64Url(match[1]);
        if (parsed) {
          if (Array.isArray(parsed.providers) && parsed.providers.length) state.providers = parsed.providers;
          if (Array.isArray(parsed.categories) && parsed.categories.length) state.categories = parsed.categories;
          if (parsed.proxyQuality) state.proxyQuality = parsed.proxyQuality;
          if (parsed.preferredAudio) state.preferredAudio = parsed.preferredAudio;
        }
      }
    } catch (_) {}
  }

  // Initialize
  if (typeof document !== 'undefined') {
    document.addEventListener('DOMContentLoaded', () => {
      initFromUrl();
      bindEvents();
      syncUI();
    });
  }

  // Export for testing in Node.js environment if needed
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
      state,
      MOCK_MEDIA,
      encodeBase64Url,
      decodeBase64Url,
      computeBitmask,
      buildManifestUrls
    };
  }
})();
