'use strict';

/**
 * ============================================================
 *  VIP Movies Addon — src/dashboard.js
 *  Ultra-Futuristic Cyber-Glassmorphism Configurator Dashboard
 *  Designed with Taste-Skill Anti-Slop Principles
 * ============================================================
 */

function escapeHtml(str) {
  if (!str) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function renderDashboard({ resolvedConfig, baseUrl, currentToken, currentManifestUrl, stremioUrl, webInstallUrl }) {
  const isProvActive = (id) => (resolvedConfig.providers || []).includes(id);
  const isCatActive  = (cat) => (resolvedConfig.categories || []).includes(cat);

  return `<!DOCTYPE html>
<html lang="vi" class="dark">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover" />
  <title>VIP Movies &amp; Sports Hub 🎬 — Stremio Addon Engine</title>
  <meta name="description" content="Trung tâm cấu hình đa nguồn phim 4K Ultra HD, Vietsub, Thuyết minh và Thể thao trực tiếp cho Stremio &amp; Nuvio." />
  <meta name="theme-color" content="#07090e" />
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  <link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@300;400;500;600;700;800&family=JetBrains+Mono:wght@400;500;600;700&family=Outfit:wght@400;500;600;700;800&display=swap" rel="stylesheet" />
  <style>
    :root {
      --bg-space: #07090e;
      --bg-surface: rgba(15, 20, 34, 0.75);
      --bg-surface-elevated: rgba(22, 30, 52, 0.88);
      --bg-surface-hover: rgba(30, 41, 70, 0.95);
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
      --emerald-glow: rgba(16, 185, 129, 0.4);
      --amber: #f59e0b;
      --purple: #a855f7;
      
      --radius-sm: 12px;
      --radius-md: 18px;
      --radius-lg: 26px;
      --radius-full: 9999px;
      
      --glass-blur: blur(32px);
      --spring-physics: 0.35s cubic-bezier(0.34, 1.56, 0.64, 1);
      --smooth-ease: 0.22s cubic-bezier(0.16, 1, 0.3, 1);
    }
    
    *, *::before, *::after {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
    }
    
    html, body {
      background-color: var(--bg-space);
      color: var(--text-primary);
      font-family: 'Plus Jakarta Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      min-height: 100dvh;
      line-height: 1.55;
      -webkit-font-smoothing: antialiased;
      overflow-x: hidden;
    }
    
    body {
      padding: 40px 16px 175px;
      position: relative;
    }
    
    /* Taste-Skill Ambient Space Aurora & Cyber Grid */
    .ambient-canvas {
      position: fixed;
      inset: 0;
      pointer-events: none;
      z-index: 0;
      overflow: hidden;
      background-image: 
        radial-gradient(rgba(255, 255, 255, 0.04) 1px, transparent 1px),
        linear-gradient(to bottom, rgba(7, 9, 14, 0.6), #07090e);
      background-size: 36px 36px, 100% 100%;
    }
    
    .ambient-orb {
      position: absolute;
      border-radius: 50%;
      filter: blur(140px);
      opacity: 0.26;
      animation: ambientDrift 24s ease-in-out infinite alternate;
      will-change: transform;
    }
    
    .orb-cyan {
      width: 580px; height: 580px;
      top: -140px; left: -120px;
      background: radial-gradient(circle, #06b6d4 0%, #3b82f6 70%, transparent);
      animation-duration: 22s;
    }
    
    .orb-rose {
      width: 620px; height: 620px;
      bottom: -160px; right: -140px;
      background: radial-gradient(circle, #f43f5e 0%, #a855f7 65%, transparent);
      opacity: 0.22;
      animation-delay: -7s;
      animation-duration: 26s;
    }
    
    .orb-indigo {
      width: 500px; height: 500px;
      top: 35%; left: 45%;
      transform: translate(-50%, -50%);
      background: radial-gradient(circle, #6366f1 0%, #06b6d4 65%, transparent);
      opacity: 0.18;
      animation-delay: -12s;
      animation-duration: 20s;
    }
    
    .orb-emerald {
      width: 420px; height: 420px;
      bottom: 20%; left: -80px;
      background: radial-gradient(circle, #10b981 0%, #06b6d4 60%, transparent);
      opacity: 0.15;
      animation-delay: -18s;
      animation-duration: 25s;
    }
    
    @keyframes ambientDrift {
      0% { transform: translate(0, 0) scale(1); }
      50% { transform: translate(36px, 44px) scale(1.08); }
      100% { transform: translate(-30px, -26px) scale(0.92); }
    }
    
    /* Layout Container */
    .layout-wrapper {
      position: relative;
      z-index: 1;
      max-width: 820px;
      margin: 0 auto;
    }
    
    /* Hero Header */
    .hero-header {
      text-align: center;
      margin-bottom: 34px;
    }
    
    .hero-badge-wrap {
      display: inline-flex;
      align-items: center;
      gap: 12px;
      margin-bottom: 16px;
    }
    
    .cinema-emblem {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      position: relative;
      width: 68px; height: 68px;
      background: linear-gradient(135deg, #06b6d4 0%, #6366f1 50%, #f43f5e 100%);
      border-radius: 22px;
      font-size: 2.1rem;
      box-shadow: 0 14px 36px rgba(99, 102, 241, 0.45), inset 0 1px 0 rgba(255, 255, 255, 0.35);
    }
    
    .cinema-emblem::after {
      content: '';
      position: absolute;
      inset: -4px;
      border-radius: 26px;
      border: 1.5px solid rgba(6, 182, 212, 0.4);
      animation: emblemPulse 3.5s ease-in-out infinite;
    }
    
    @keyframes emblemPulse {
      0%, 100% { opacity: 0.4; transform: scale(1); }
      50% { opacity: 0.95; transform: scale(1.06); }
    }
    
    .hero-title {
      font-family: 'Outfit', sans-serif;
      font-size: 2.35rem;
      font-weight: 800;
      letter-spacing: -0.04em;
      line-height: 1.15;
      background: linear-gradient(135deg, #ffffff 0%, #e2e8f0 50%, #c084fc 100%);
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
      margin-bottom: 8px;
    }
    
    .hero-subtitle {
      font-size: 0.94rem;
      color: var(--text-secondary);
      font-weight: 500;
      letter-spacing: -0.01em;
      max-width: 62ch;
      margin: 0 auto 16px;
      line-height: 1.5;
    }
    
    .telemetry-row {
      display: inline-flex;
      align-items: center;
      flex-wrap: wrap;
      justify-content: center;
      gap: 8px;
      padding: 6px 16px;
      background: rgba(15, 20, 34, 0.65);
      border: 1px solid var(--border-subtle);
      border-radius: var(--radius-full);
      backdrop-filter: var(--glass-blur);
      font-size: 0.76rem;
      font-weight: 600;
      color: var(--text-secondary);
      font-family: 'JetBrains Mono', monospace;
    }
    
    .status-dot-pulse {
      width: 7px; height: 7px;
      border-radius: 50%;
      background: var(--emerald);
      box-shadow: 0 0 10px var(--emerald);
      animation: dotPulse 2s infinite;
    }
    
    @keyframes dotPulse {
      0%, 100% { opacity: 1; transform: scale(1); }
      50% { opacity: 0.4; transform: scale(0.85); }
    }
    
    /* Bento Grid Layout */
    .bento-grid {
      display: flex;
      flex-direction: column;
      gap: 20px;
    }
    
    .taste-card {
      background: var(--bg-surface);
      border: 1px solid var(--border-subtle);
      border-radius: var(--radius-lg);
      padding: 24px;
      backdrop-filter: var(--glass-blur);
      box-shadow: 0 18px 45px rgba(0, 0, 0, 0.4), inset 0 1px 0 rgba(255, 255, 255, 0.08);
      position: relative;
      overflow: hidden;
      transition: border-color var(--smooth-ease), box-shadow var(--smooth-ease);
    }
    
    .taste-card:hover {
      border-color: var(--border-hover);
      box-shadow: 0 22px 55px rgba(0, 0, 0, 0.5), inset 0 1px 0 rgba(255, 255, 255, 0.12);
    }
    
    .card-header-bar {
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-bottom: 18px;
    }
    
    .card-title-group {
      display: flex;
      align-items: center;
      gap: 10px;
    }
    
    .card-title-icon {
      font-size: 1.25rem;
    }
    
    .card-title-text {
      font-family: 'Outfit', sans-serif;
      font-size: 1.15rem;
      font-weight: 700;
      letter-spacing: -0.02em;
      color: var(--text-primary);
    }
    
    .card-action-links {
      display: flex;
      gap: 8px;
    }
    
    .mini-preset-btn {
      font-size: 0.76rem;
      font-weight: 600;
      padding: 4px 10px;
      border-radius: var(--radius-full);
      background: rgba(255, 255, 255, 0.06);
      border: 1px solid var(--border-subtle);
      color: var(--text-secondary);
      cursor: pointer;
      transition: all var(--smooth-ease);
    }
    
    .mini-preset-btn:hover {
      background: rgba(255, 255, 255, 0.12);
      color: var(--text-primary);
      border-color: var(--border-hover);
    }
    
    /* 4 VIP Provider Cards Grid */
    .providers-grid {
      display: grid;
      grid-template-columns: repeat(2, 1fr);
      gap: 14px;
    }
    
    @media (max-width: 640px) {
      .providers-grid {
        grid-template-columns: 1fr;
      }
    }
    
    .provider-card {
      background: rgba(255, 255, 255, 0.03);
      border: 1px solid var(--border-subtle);
      border-radius: var(--radius-md);
      padding: 18px;
      cursor: pointer;
      user-select: none;
      position: relative;
      overflow: hidden;
      transition: all var(--spring-physics);
      display: flex;
      flex-direction: column;
      justify-content: space-between;
      min-height: 140px;
    }
    
    .provider-card::before {
      content: '';
      position: absolute;
      inset: 0;
      opacity: 0;
      transition: opacity var(--smooth-ease);
      pointer-events: none;
    }
    
    .provider-card.vsmov::before  { background: radial-gradient(circle at 85% 15%, var(--cyan-glow), transparent 70%); }
    .provider-card.kkphim::before { background: radial-gradient(circle at 85% 15%, var(--rose-glow), transparent 70%); }
    .provider-card.nguonc::before { background: radial-gradient(circle at 85% 15%, var(--indigo-glow), transparent 70%); }
    .provider-card.sports::before { background: radial-gradient(circle at 85% 15%, var(--emerald-glow), transparent 70%); }
    
    .provider-card:hover {
      border-color: var(--border-hover);
      transform: translateY(-2px);
      box-shadow: 0 12px 30px rgba(0, 0, 0, 0.4);
    }
    
    .provider-card:hover::before { opacity: 1; }
    
    .provider-card:active {
      transform: translateY(0) scale(0.98);
    }
    
    .provider-card.active {
      border-color: var(--border-focus);
      background: rgba(255, 255, 255, 0.05);
      box-shadow: 0 0 0 1px rgba(99, 102, 241, 0.25), 0 16px 36px rgba(0, 0, 0, 0.45);
    }
    
    .provider-card.active.vsmov  { border-color: rgba(6, 182, 212, 0.65); box-shadow: 0 0 0 1px rgba(6, 182, 212, 0.35), 0 16px 36px rgba(0, 0, 0, 0.45); }
    .provider-card.active.kkphim { border-color: rgba(244, 63, 94, 0.65); box-shadow: 0 0 0 1px rgba(244, 63, 94, 0.35), 0 16px 36px rgba(0, 0, 0, 0.45); }
    .provider-card.active.nguonc { border-color: rgba(99, 102, 241, 0.65); box-shadow: 0 0 0 1px rgba(99, 102, 241, 0.35), 0 16px 36px rgba(0, 0, 0, 0.45); }
    .provider-card.active.sports { border-color: rgba(16, 185, 129, 0.65); box-shadow: 0 0 0 1px rgba(16, 185, 129, 0.35), 0 16px 36px rgba(0, 0, 0, 0.45); }
    .provider-card.active::before { opacity: 1; }
    
    .provider-top {
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-bottom: 12px;
    }
    
    .provider-badge-icon {
      width: 42px; height: 42px;
      border-radius: 12px;
      background: rgba(255, 255, 255, 0.06);
      border: 1px solid rgba(255, 255, 255, 0.1);
      display: inline-flex;
      align-items: center;
      justify-content: center;
      font-size: 1.35rem;
    }
    
    /* Spring Switch Track */
    .switch-track {
      width: 44px; height: 24px;
      background: rgba(255, 255, 255, 0.12);
      border-radius: var(--radius-full);
      position: relative;
      transition: background var(--smooth-ease), border-color var(--smooth-ease), box-shadow var(--smooth-ease);
      border: 1px solid rgba(255, 255, 255, 0.15);
      flex-shrink: 0;
    }
    
    .switch-thumb {
      position: absolute;
      top: 2px; left: 2px;
      width: 18px; height: 18px;
      background: rgba(255, 255, 255, 0.6);
      border-radius: 50%;
      transition: transform var(--spring-physics), background var(--smooth-ease);
    }
    
    .provider-card.active.vsmov  .switch-track { background: var(--cyan); box-shadow: 0 0 14px var(--cyan-glow); }
    .provider-card.active.kkphim .switch-track { background: var(--rose); box-shadow: 0 0 14px var(--rose-glow); }
    .provider-card.active.nguonc .switch-track { background: var(--indigo); box-shadow: 0 0 14px var(--indigo-glow); }
    .provider-card.active.sports .switch-track { background: var(--emerald); box-shadow: 0 0 14px var(--emerald-glow); }
    
    .provider-card.active .switch-thumb {
      transform: translateX(20px);
      background: #ffffff;
    }
    
    .provider-name {
      font-size: 1.05rem;
      font-weight: 700;
      letter-spacing: -0.02em;
      color: var(--text-primary);
      margin-bottom: 4px;
    }
    
    .provider-desc {
      font-size: 0.78rem;
      color: var(--text-secondary);
      line-height: 1.4;
      margin-bottom: 12px;
    }
    
    .tag-row {
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
    }
    
    .tag-badge {
      font-size: 0.7rem;
      font-weight: 600;
      padding: 3px 8px;
      border-radius: var(--radius-full);
      font-family: 'JetBrains Mono', monospace;
      letter-spacing: -0.01em;
    }
    
    .tag-cyan    { background: rgba(6, 182, 212, 0.15); color: #67e8f9; border: 1px solid rgba(6, 182, 212, 0.3); }
    .tag-rose    { background: rgba(244, 63, 94, 0.15); color: #fda4af; border: 1px solid rgba(244, 63, 94, 0.3); }
    .tag-indigo  { background: rgba(99, 102, 241, 0.15); color: #a5b4fc; border: 1px solid rgba(99, 102, 241, 0.3); }
    .tag-emerald { background: rgba(16, 185, 129, 0.15); color: #6ee7b7; border: 1px solid rgba(16, 185, 129, 0.3); }
    .tag-amber   { background: rgba(245, 158, 11, 0.15); color: #fcd34d; border: 1px solid rgba(245, 158, 11, 0.3); }
    
    /* Category Filter Pills */
    .categories-wrap {
      display: flex;
      flex-wrap: wrap;
      gap: 10px;
    }
    
    .cat-pill {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      padding: 9px 16px;
      border-radius: var(--radius-full);
      background: rgba(255, 255, 255, 0.04);
      border: 1px solid var(--border-subtle);
      color: var(--text-secondary);
      font-size: 0.86rem;
      font-weight: 600;
      cursor: pointer;
      user-select: none;
      transition: all var(--spring-physics);
    }
    
    .cat-pill:hover {
      background: rgba(255, 255, 255, 0.08);
      color: var(--text-primary);
      border-color: var(--border-hover);
      transform: translateY(-1.5px);
    }
    
    .cat-pill.active {
      background: linear-gradient(135deg, rgba(99, 102, 241, 0.25), rgba(6, 182, 212, 0.25));
      border-color: rgba(99, 102, 241, 0.6);
      color: #ffffff;
      box-shadow: 0 4px 16px rgba(99, 102, 241, 0.25);
    }
    
    .cat-pill .pill-dot {
      width: 6px; height: 6px;
      border-radius: 50%;
      background: rgba(255, 255, 255, 0.3);
      transition: background var(--smooth-ease), box-shadow var(--smooth-ease);
    }
    
    .cat-pill.active .pill-dot {
      background: var(--cyan);
      box-shadow: 0 0 8px var(--cyan);
    }
    
    /* Interactive Stream Simulator */
    .simulator-box {
      background: rgba(10, 14, 24, 0.85);
      border: 1px solid var(--border-subtle);
      border-radius: var(--radius-md);
      padding: 16px;
    }
    
    .sim-top-bar {
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-bottom: 12px;
      padding-bottom: 8px;
      border-bottom: 1px solid rgba(255, 255, 255, 0.06);
    }
    
    .sim-badge {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      font-size: 0.75rem;
      font-family: 'JetBrains Mono', monospace;
      color: #38bdf8;
      font-weight: 600;
    }
    
    .sim-streams-list {
      display: flex;
      flex-direction: column;
      gap: 8px;
    }
    
    .sim-stream-item {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 10px 14px;
      border-radius: var(--radius-sm);
      background: rgba(255, 255, 255, 0.03);
      border: 1px solid rgba(255, 255, 255, 0.06);
      transition: all var(--smooth-ease);
    }
    
    .sim-stream-item:hover {
      background: rgba(255, 255, 255, 0.06);
      border-color: rgba(255, 255, 255, 0.15);
    }
    
    .sim-stream-left {
      display: flex;
      align-items: center;
      gap: 10px;
    }
    
    .sim-stream-icon {
      font-size: 1.1rem;
    }
    
    .sim-stream-title {
      font-size: 0.82rem;
      font-weight: 600;
      color: var(--text-primary);
    }
    
    .sim-stream-sub {
      font-size: 0.72rem;
      color: var(--text-muted);
      font-family: 'JetBrains Mono', monospace;
    }
    
    .sim-quality-pill {
      font-size: 0.68rem;
      font-weight: 700;
      padding: 2px 7px;
      border-radius: var(--radius-full);
      font-family: 'JetBrains Mono', monospace;
    }
    
    /* Manifest URL Card */
    .manifest-box {
      background: rgba(0, 0, 0, 0.45);
      border: 1px solid var(--border-subtle);
      border-radius: var(--radius-md);
      padding: 14px 16px;
      cursor: pointer;
      transition: all var(--smooth-ease);
    }
    
    .manifest-box:hover {
      border-color: var(--border-hover);
      background: rgba(0, 0, 0, 0.6);
    }
    
    .manifest-top {
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-bottom: 8px;
      font-size: 0.75rem;
      font-weight: 600;
      color: var(--text-secondary);
      font-family: 'JetBrains Mono', monospace;
    }
    
    .copy-pill-hint {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      color: #c084fc;
      background: rgba(192, 132, 252, 0.12);
      padding: 2px 8px;
      border-radius: var(--radius-full);
      font-size: 0.7rem;
    }
    
    .manifest-url-string {
      font-family: 'JetBrains Mono', monospace;
      font-size: 0.82rem;
      color: #38bdf8;
      word-break: break-all;
      line-height: 1.4;
    }
    
    /* Brand Signature Footer */
    .taste-footer {
      text-align: center;
      margin-top: 36px;
      font-size: 0.8rem;
      color: var(--text-muted);
      font-family: 'JetBrains Mono', monospace;
    }
    
    .brand-highlight {
      color: var(--text-secondary);
      font-weight: 600;
    }
    
    /* Floating Action Dock */
    .floating-action-dock {
      position: fixed;
      bottom: 20px;
      left: 50%;
      transform: translateX(-50%);
      width: calc(100% - 32px);
      max-width: 820px;
      z-index: 100;
    }
    
    .dock-container {
      background: rgba(14, 18, 30, 0.92);
      border: 1px solid rgba(255, 255, 255, 0.15);
      border-radius: var(--radius-lg);
      padding: 16px 20px;
      backdrop-filter: blur(36px);
      box-shadow: 0 24px 60px rgba(0, 0, 0, 0.75), inset 0 1px 0 rgba(255, 255, 255, 0.18);
    }
    
    .dock-status-bar {
      display: flex;
      align-items: center;
      justify-content: space-between;
      flex-wrap: wrap;
      gap: 10px;
      margin-bottom: 12px;
    }
    
    .dock-status-text {
      font-size: 0.84rem;
      color: var(--text-secondary);
      font-weight: 500;
    }
    
    .dock-status-text strong {
      color: var(--text-primary);
    }
    
    .dock-live-tag {
      display: flex;
      align-items: center;
      gap: 6px;
      font-size: 0.76rem;
      color: #34d399;
      font-weight: 600;
    }
    
    .cta-button-group {
      display: grid;
      grid-template-columns: 1.3fr 1fr 0.9fr 0.9fr;
      gap: 8px;
    }
    
    @media (max-width: 720px) {
      .cta-button-group {
        grid-template-columns: 1fr 1fr;
      }
    }
    
    @media (max-width: 460px) {
      .cta-button-group {
        grid-template-columns: 1fr;
      }
    }
    
    .cta-btn {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 7px;
      padding: 12px 14px;
      border-radius: var(--radius-sm);
      font-weight: 700;
      font-size: 0.84rem;
      text-decoration: none;
      transition: all var(--smooth-ease);
      cursor: pointer;
      border: none;
      font-family: inherit;
      white-space: nowrap;
    }
    
    .cta-btn-primary {
      background: linear-gradient(135deg, #06b6d4 0%, #6366f1 50%, #f43f5e 100%);
      color: #ffffff;
      border: 1px solid rgba(255, 255, 255, 0.25);
      box-shadow: 0 8px 24px rgba(99, 102, 241, 0.45);
      position: relative;
      overflow: hidden;
    }
    
    .cta-btn-primary::after {
      content: '';
      position: absolute;
      top: -50%; left: -50%;
      width: 200%; height: 200%;
      background: linear-gradient(60deg, transparent 30%, rgba(255, 255, 255, 0.22) 50%, transparent 70%);
      transform: rotate(25deg);
      transition: transform 0.65s ease;
    }
    
    .cta-btn-primary:hover::after {
      transform: rotate(25deg) translate(30%, 30%);
    }
    
    .cta-btn-primary:hover {
      transform: translateY(-2px);
      box-shadow: 0 14px 34px rgba(99, 102, 241, 0.6);
      filter: brightness(1.06);
    }
    
    .cta-btn-secondary {
      background: rgba(255, 255, 255, 0.06);
      color: var(--text-primary);
      border: 1px solid var(--border-subtle);
    }
    
    .cta-btn-secondary:hover {
      background: rgba(255, 255, 255, 0.12);
      border-color: var(--border-hover);
      transform: translateY(-1.5px);
    }
    
    .cta-btn-qr {
      background: rgba(6, 182, 212, 0.12);
      color: #38bdf8;
      border: 1px solid rgba(6, 182, 212, 0.3);
    }
    
    .cta-btn-qr:hover {
      background: rgba(6, 182, 212, 0.22);
      border-color: rgba(6, 182, 212, 0.5);
      transform: translateY(-1.5px);
    }
    
    .cta-btn-copy {
      background: rgba(167, 139, 250, 0.12);
      color: #c084fc;
      border: 1px solid rgba(167, 139, 250, 0.3);
    }
    
    .cta-btn-copy:hover {
      background: rgba(167, 139, 250, 0.22);
      border-color: rgba(167, 139, 250, 0.5);
      transform: translateY(-1.5px);
    }
    
    /* QR Code Modal */
    .qr-modal-backdrop {
      position: fixed;
      inset: 0;
      background: rgba(0, 0, 0, 0.8);
      backdrop-filter: blur(20px);
      z-index: 200;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 16px;
      opacity: 0;
      pointer-events: none;
      transition: opacity var(--smooth-ease);
    }
    
    .qr-modal-backdrop.active {
      opacity: 1;
      pointer-events: auto;
    }
    
    .qr-modal-card {
      background: #0f1422;
      border: 1px solid var(--border-hover);
      border-radius: var(--radius-lg);
      padding: 28px;
      max-width: 380px;
      width: 100%;
      text-align: center;
      box-shadow: 0 30px 80px rgba(0, 0, 0, 0.8), inset 0 1px 0 rgba(255, 255, 255, 0.15);
      transform: scale(0.92);
      transition: transform var(--spring-physics);
    }
    
    .qr-modal-backdrop.active .qr-modal-card {
      transform: scale(1);
    }
    
    .qr-img-wrap {
      background: #ffffff;
      padding: 12px;
      border-radius: var(--radius-md);
      display: inline-block;
      margin: 16px 0;
      box-shadow: 0 10px 25px rgba(0, 0, 0, 0.4);
    }
    
    .qr-img-wrap img {
      display: block;
      width: 220px;
      height: 220px;
    }
    
    .qr-close-btn {
      margin-top: 14px;
      padding: 10px 20px;
      border-radius: var(--radius-full);
      background: rgba(255, 255, 255, 0.08);
      border: 1px solid var(--border-subtle);
      color: var(--text-primary);
      font-weight: 600;
      font-size: 0.82rem;
      cursor: pointer;
      transition: all var(--smooth-ease);
    }
    
    .qr-close-btn:hover {
      background: rgba(255, 255, 255, 0.16);
      border-color: var(--border-hover);
    }
    
    /* Toast Notification */
    .clipboard-toast {
      position: fixed;
      bottom: 130px;
      left: 50%;
      transform: translateX(-50%) translateY(24px);
      background: rgba(15, 20, 34, 0.95);
      border: 1px solid rgba(52, 211, 153, 0.45);
      color: #34d399;
      backdrop-filter: blur(20px);
      padding: 11px 24px;
      border-radius: var(--radius-full);
      font-size: 0.84rem;
      font-weight: 600;
      box-shadow: 0 14px 36px rgba(0, 0, 0, 0.65);
      display: flex;
      align-items: center;
      gap: 8px;
      opacity: 0;
      pointer-events: none;
      transition: transform var(--spring-physics), opacity var(--smooth-ease);
      z-index: 150;
    }
    
    .clipboard-toast.show {
      transform: translateX(-50%) translateY(0);
      opacity: 1;
    }
  </style>
</head>
<body>

  <!-- Ambient Aurora & Cyber Grid -->
  <div class="ambient-canvas" aria-hidden="true">
    <div class="ambient-orb orb-cyan"></div>
    <div class="ambient-orb orb-rose"></div>
    <div class="ambient-orb orb-indigo"></div>
    <div class="ambient-orb orb-emerald"></div>
  </div>

  <main class="layout-wrapper">
    <!-- Hero Header -->
    <header class="hero-header">
      <div class="hero-badge-wrap">
        <div class="cinema-emblem" aria-hidden="true">🎬</div>
      </div>
      <h1 class="hero-title">VIP Movies &amp; Sports Hub</h1>
      <p class="hero-subtitle">
        Thiết lập kho phim 4K Ultra HD, Vietsub, Thuyết Minh và Thể Thao Live đỉnh cao cho ứng dụng <strong>Stremio &amp; Nuvio</strong>.
      </p>
      <div class="telemetry-row">
        <span class="status-dot-pulse" aria-hidden="true"></span>
        <span>4 Nguồn VIP Tốc Độ Cao</span>
        <span>•</span>
        <span>HLS Zero-Copy Stream</span>
        <span>•</span>
        <span>100% Khớp IMDb</span>
      </div>
    </header>

    <!-- Bento Grid Container -->
    <div class="bento-grid">

      <!-- Bento 1: 4 Nguồn Phát VIP Core -->
      <section class="taste-card" aria-labelledby="heading-providers">
        <div class="card-header-bar">
          <div class="card-title-group">
            <span class="card-title-icon">⚡</span>
            <h2 class="card-title-text" id="heading-providers">4 Nguồn Phát Cốt Lõi (Core VIP Nodes)</h2>
          </div>
          <div class="card-action-links">
            <button class="mini-preset-btn" onclick="selectAllProviders()">Bật Tất Cả</button>
            <button class="mini-preset-btn" onclick="deselectAllProviders()">Chỉ VSMOV 4K</button>
          </div>
        </div>

        <div class="providers-grid">
          <!-- VSMOV (VIP 1) -->
          <div class="provider-card vsmov ${isProvActive('vsmov') ? 'active' : ''}" id="card-vsmov" onclick="toggleProvider('vsmov')" role="checkbox" aria-checked="${isProvActive('vsmov') ? 'true' : 'false'}" tabindex="0">
            <div class="provider-top">
              <div class="provider-badge-icon">🌟</div>
              <div class="switch-track" aria-hidden="true"><div class="switch-thumb"></div></div>
            </div>
            <div>
              <div class="provider-name">VSMOV 4K (VIP 1)</div>
              <div class="provider-desc">vsmov.com — Phim 4K Ultra HD (3840x2160), Vietsub WebVTT &amp; Thuyết Minh</div>
            </div>
            <div class="tag-row">
              <span class="tag-badge tag-cyan">4K Ultra HD</span>
              <span class="tag-badge tag-rose">Vietsub WebVTT</span>
              <span class="tag-badge tag-amber">Lồng Tiếng</span>
            </div>
          </div>

          <!-- KKPhim (VIP 2) -->
          <div class="provider-card kkphim ${isProvActive('kkphim') ? 'active' : ''}" id="card-kkphim" onclick="toggleProvider('kkphim')" role="checkbox" aria-checked="${isProvActive('kkphim') ? 'true' : 'false'}" tabindex="0">
            <div class="provider-top">
              <div class="provider-badge-icon">🎬</div>
              <div class="switch-track" aria-hidden="true"><div class="switch-thumb"></div></div>
            </div>
            <div>
              <div class="provider-name">KKPhim (VIP 2)</div>
              <div class="provider-desc">kkphimplayer — Kho Phim Lẻ, Phim Bộ &amp; Chiếu Rạp Mới Nhất</div>
            </div>
            <div class="tag-row">
              <span class="tag-badge tag-rose">Full HD</span>
              <span class="tag-badge tag-indigo">Chiếu Rạp</span>
              <span class="tag-badge tag-amber">Thuyết Minh</span>
            </div>
          </div>

          <!-- NguonC (VIP 3) -->
          <div class="provider-card nguonc ${isProvActive('nguonc') ? 'active' : ''}" id="card-nguonc" onclick="toggleProvider('nguonc')" role="checkbox" aria-checked="${isProvActive('nguonc') ? 'true' : 'false'}" tabindex="0">
            <div class="provider-top">
              <div class="provider-badge-icon">📺</div>
              <div class="switch-track" aria-hidden="true"><div class="switch-thumb"></div></div>
            </div>
            <div>
              <div class="provider-name">NguonC (VIP 3)</div>
              <div class="provider-desc">phim.nguonc.com — StreamC CDN, Vietsub &amp; Thuyết Minh Đầy Đủ</div>
            </div>
            <div class="tag-row">
              <span class="tag-badge tag-indigo">StreamC Direct</span>
              <span class="tag-badge tag-cyan">Vietsub HD</span>
              <span class="tag-badge tag-emerald">Anti-403 Proxy</span>
            </div>
          </div>

          <!-- Sports Live -->
          <div class="provider-card sports ${isProvActive('sports') ? 'active' : ''}" id="card-sports" onclick="toggleProvider('sports')" role="checkbox" aria-checked="${isProvActive('sports') ? 'true' : 'false'}" tabindex="0">
            <div class="provider-top">
              <div class="provider-badge-icon">⚽</div>
              <div class="switch-track" aria-hidden="true"><div class="switch-thumb"></div></div>
            </div>
            <div>
              <div class="provider-name">Thể Thao Live (BLV)</div>
              <div class="provider-desc">Xôi Lạc, SoCoLive, Cà Khịa — Bóng Đá Trực Tiếp &amp; Esports Có BLV</div>
            </div>
            <div class="tag-row">
              <span class="tag-badge tag-emerald">Live 4K/HD</span>
              <span class="tag-badge tag-rose">BLV Tiếng Việt</span>
              <span class="tag-badge tag-amber">Xôi Lạc / SoCo</span>
            </div>
          </div>
        </div>
      </section>

      <!-- Bento 2: Thể Loại & Định Dạng -->
      <section class="taste-card" aria-labelledby="heading-categories">
        <div class="card-header-bar">
          <div class="card-title-group">
            <span class="card-title-icon">🏷️</span>
            <h2 class="card-title-text" id="heading-categories">Thể Loại &amp; Định Dạng (Content Channels)</h2>
          </div>
        </div>
        <div class="categories-wrap">
          <div class="cat-pill ${isCatActive('movie') ? 'active' : ''}" id="cat-movie" onclick="toggleCategory('movie')" role="checkbox" aria-checked="${isCatActive('movie') ? 'true' : 'false'}" tabindex="0">
            <span class="pill-dot"></span>
            <span>🎬 Phim Lẻ (Movies)</span>
          </div>
          <div class="cat-pill ${isCatActive('series') ? 'active' : ''}" id="cat-series" onclick="toggleCategory('series')" role="checkbox" aria-checked="${isCatActive('series') ? 'true' : 'false'}" tabindex="0">
            <span class="pill-dot"></span>
            <span>📺 Phim Bộ (Series)</span>
          </div>
          <div class="cat-pill ${isCatActive('cinema') ? 'active' : ''}" id="cat-cinema" onclick="toggleCategory('cinema')" role="checkbox" aria-checked="${isCatActive('cinema') ? 'true' : 'false'}" tabindex="0">
            <span class="pill-dot"></span>
            <span>🍿 Chiếu Rạp (Cinema)</span>
          </div>
          <div class="cat-pill ${isCatActive('anime') ? 'active' : ''}" id="cat-anime" onclick="toggleCategory('anime')" role="checkbox" aria-checked="${isCatActive('anime') ? 'true' : 'false'}" tabindex="0">
            <span class="pill-dot"></span>
            <span>🐉 Hoạt Hình &amp; Anime</span>
          </div>
          <div class="cat-pill ${isCatActive('tv') ? 'active' : ''}" id="cat-tv" onclick="toggleCategory('tv')" role="checkbox" aria-checked="${isCatActive('tv') ? 'true' : 'false'}" tabindex="0">
            <span class="pill-dot"></span>
            <span>⚽ Thể Thao Live (TV)</span>
          </div>
        </div>
      </section>

      <!-- Bento 3: Trình Mô Phỏng Phát Luồng Stremio Trực Quan -->
      <section class="taste-card" aria-labelledby="heading-simulator">
        <div class="card-header-bar">
          <div class="card-title-group">
            <span class="card-title-icon">📺</span>
            <h2 class="card-title-text" id="heading-simulator">Mô Phỏng Luồng Phát Trong Stremio (Live Simulator)</h2>
          </div>
        </div>
        <div class="simulator-box">
          <div class="sim-top-bar">
            <span class="sim-badge">● STREMIO STREAM LIST PREVIEW</span>
            <span style="font-size:0.75rem; color:var(--text-muted); font-family:'JetBrains Mono',monospace;">Tự động cập nhật theo cấu hình</span>
          </div>
          <div class="sim-streams-list" id="sim-stream-list">
            <!-- Rendered by JS -->
          </div>
        </div>
      </section>

      <!-- Bento 4: Liên Kết Cài Đặt & QR Code -->
      <section class="taste-card" aria-labelledby="heading-manifest">
        <div class="card-header-bar">
          <div class="card-title-group">
            <span class="card-title-icon">🔗</span>
            <h2 class="card-title-text" id="heading-manifest">Liên Kết Manifest Cài Đặt Cá Nhân Hóa</h2>
          </div>
        </div>
        <div class="manifest-box" id="manifest-box" onclick="copyManifest()" role="button" tabindex="0" title="Bấm để sao chép link Manifest">
          <div class="manifest-top">
            <span>MANIFEST URL</span>
            <span class="copy-pill-hint">📋 Bấm để Sao Chép</span>
          </div>
          <div class="manifest-url-string" id="manifest-preview">${currentManifestUrl}</div>
        </div>
      </section>
    </div>

    <!-- Brand Signature Footer -->
    <footer class="taste-footer">
      VIP Movies Addon Engine v1.5.2 • High-Performance Media Pipeline by <span class="brand-highlight">Q121101</span>
    </footer>
  </main>

  <!-- Floating Action Dock -->
  <div class="floating-action-dock">
    <div class="dock-container">
      <div class="dock-status-bar">
        <div class="dock-status-text">
          Đang kích hoạt: <strong id="provider-count">${resolvedConfig.providers.length} nguồn VIP</strong> &nbsp;·&nbsp; <strong id="category-count">${resolvedConfig.categories.length} danh mục</strong>
        </div>
        <div class="dock-live-tag">
          <span class="status-dot-pulse"></span>
          Cấu hình tự động đồng bộ tức thì
        </div>
      </div>

      <div class="cta-button-group">
        <a class="cta-btn cta-btn-primary" id="stremio-install-btn" href="${stremioUrl}">
          <span>⚡</span> Cài Vào Stremio App
        </a>
        <a class="cta-btn cta-btn-secondary" id="web-install-btn" href="${webInstallUrl}" target="_blank" rel="noopener noreferrer">
          <span>🌐</span> Mở Stremio Web
        </a>
        <button class="cta-btn cta-btn-qr" onclick="openQrModal()">
          <span>📱</span> Quét Mã QR TV
        </button>
        <button class="cta-btn cta-btn-copy" onclick="copyManifest()">
          <span>📋</span> Sao Chép Link
        </button>
      </div>
    </div>
  </div>

  <!-- QR Code Modal Backdrop -->
  <div class="qr-modal-backdrop" id="qr-modal" onclick="closeQrModal(event)">
    <div class="qr-modal-card" onclick="event.stopPropagation()">
      <h3 style="font-family:'Outfit',sans-serif; font-size:1.25rem; font-weight:700; margin-bottom:6px;">Quét Mã Cài Đặt Smart TV</h3>
      <p style="font-size:0.8rem; color:var(--text-secondary);">Mở camera điện thoại hoặc ứng dụng quét mã trên TV để cài đặt ngay</p>
      <div class="qr-img-wrap">
        <img id="qr-img-element" src="https://api.qrserver.com/v1/create-qr-code/?size=240x240&data=${encodeURIComponent(stremioUrl)}" alt="Stremio QR Code" />
      </div>
      <button class="qr-close-btn" onclick="closeQrModal()">Đóng Cửa Sổ</button>
    </div>
  </div>

  <!-- Toast Notification -->
  <div class="clipboard-toast" id="toast" aria-live="polite">
    <span>✅</span> Đã sao chép link Manifest vào Clipboard!
  </div>

  <script>
    var _baseUrl = window.location.origin;
    var _allProvidersList = ['vsmov', 'kkphim', 'nguonc', 'sports'];
    var _allCategoriesList = ['movie', 'series', 'cinema', 'anime', 'tv'];
    var _providers = new Set(${JSON.stringify(resolvedConfig.providers)});
    var _categories = new Set(${JSON.stringify(resolvedConfig.categories)});

    // Futuristic Audio Feedback (Web Audio API Synthesizer)
    var audioCtx = null;
    function playTactileClick() {
      try {
        if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        if (audioCtx.state === 'suspended') audioCtx.resume();
        var osc = audioCtx.createOscillator();
        var gain = audioCtx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(650, audioCtx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(180, audioCtx.currentTime + 0.04);
        gain.gain.setValueAtTime(0.06, audioCtx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.04);
        osc.connect(gain);
        gain.connect(audioCtx.destination);
        osc.start();
        osc.stop(audioCtx.currentTime + 0.045);
      } catch(e) {}
    }

    function encodeConfigClient(providers, categories) {
      var cfg = {
        providers: Array.from(providers).sort(),
        categories: Array.from(categories).sort()
      };
      try {
        return btoa(unescape(encodeURIComponent(JSON.stringify(cfg))))
          .replace(/\+/g, '-')
          .replace(/\//g, '_')
          .replace(/=+$/, '');
      } catch(e) {
        return '';
      }
    }

    function updateSimulator() {
      var listEl = document.getElementById('sim-stream-list');
      if (!listEl) return;
      var html = '';

      if (_providers.has('vsmov')) {
        html += '<div class="sim-stream-item"><div class="sim-stream-left"><span class="sim-stream-icon">🌟</span><div><div class="sim-stream-title">[VIP 1 • VSMOV] Vietsub 4K Ultra HD (3840x2160)</div><div class="sim-stream-sub">⚡ Server VIP Vietsub • vsmov.com • HLS Zero-Copy</div></div></div><span class="sim-quality-pill tag-cyan">4K UHD</span></div>';
      }

      if (_providers.has('kkphim')) {
        html += '<div class="sim-stream-item"><div class="sim-stream-left"><span class="sim-stream-icon">🎬</span><div><div class="sim-stream-title">[VIP 2 • KKPhim] Vietsub Full HD [Tập 01]</div><div class="sim-stream-sub">⚡ Server VIP 2 • Phát trực tiếp trong App</div></div></div><span class="sim-quality-pill tag-rose">1080p FHD</span></div>';
      }

      if (_providers.has('nguonc')) {
        html += '<div class="sim-stream-item"><div class="sim-stream-left"><span class="sim-stream-icon">📺</span><div><div class="sim-stream-title">[VIP 3 • NguonC] Vietsub &amp; Thuyết Minh Full HD</div><div class="sim-stream-sub">⚡ Server VIP 3 • StreamC Vượt Chặn Cloudflare</div></div></div><span class="sim-quality-pill tag-indigo">StreamC</span></div>';
      }

      if (_providers.has('sports')) {
        html += '<div class="sim-stream-item"><div class="sim-stream-left"><span class="sim-stream-icon">⚽</span><div><div class="sim-stream-title">🔴 [Xôi Lạc Live] Ngoại Hạng Anh &amp; Cúp C1 (Kênh 1 HD)</div><div class="sim-stream-sub">⚡ Thể Thao Live • Bình Luận Viên Tiếng Việt</div></div></div><span class="sim-quality-pill tag-emerald">LIVE BLV</span></div>';
      }

      if (!html) {
        html = '<div style="text-align:center; padding:16px; font-size:0.8rem; color:var(--text-muted);">Chưa chọn nguồn phát nào</div>';
      }

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
      if (qrImg) {
        qrImg.src = 'https://api.qrserver.com/v1/create-qr-code/?size=240x240&data=' + encodeURIComponent(stremioDeep);
      }

      if (window.history && window.history.replaceState) {
        window.history.replaceState(null, '', '/' + token + '/');
      }

      updateSimulator();
    }

    function toggleProvider(p) {
      playTactileClick();
      if (_providers.has(p)) {
        if (_providers.size <= 1) {
          showToast('⚠️ Cần giữ lại ít nhất 1 nguồn phát!');
          return;
        }
        _providers.delete(p);
        var el = document.getElementById('card-' + p);
        if (el) {
          el.classList.remove('active');
          el.setAttribute('aria-checked', 'false');
        }
      } else {
        _providers.add(p);
        var el = document.getElementById('card-' + p);
        if (el) {
          el.classList.add('active');
          el.setAttribute('aria-checked', 'true');
        }
      }
      updateState();
    }

    function toggleCategory(c) {
      playTactileClick();
      if (_categories.has(c)) {
        if (_categories.size <= 1) {
          showToast('⚠️ Cần giữ lại ít nhất 1 thể loại!');
          return;
        }
        _categories.delete(c);
        var el = document.getElementById('cat-' + c);
        if (el) {
          el.classList.remove('active');
          el.setAttribute('aria-checked', 'false');
        }
      } else {
        _categories.add(c);
        var el = document.getElementById('cat-' + c);
        if (el) {
          el.classList.add('active');
          el.setAttribute('aria-checked', 'true');
        }
      }
      updateState();
    }

    function selectAllProviders() {
      playTactileClick();
      _allProvidersList.forEach(function(p) {
        _providers.add(p);
        var el = document.getElementById('card-' + p);
        if (el) {
          el.classList.add('active');
          el.setAttribute('aria-checked', 'true');
        }
      });
      updateState();
    }

    function deselectAllProviders() {
      playTactileClick();
      _allProvidersList.forEach(function(p) {
        if (p !== 'vsmov') {
          _providers.delete(p);
          var el = document.getElementById('card-' + p);
          if (el) {
            el.classList.remove('active');
            el.setAttribute('aria-checked', 'false');
          }
        }
      });
      _providers.add('vsmov');
      var vsmovEl = document.getElementById('card-vsmov');
      if (vsmovEl) {
        vsmovEl.classList.add('active');
        vsmovEl.setAttribute('aria-checked', 'true');
      }
      updateState();
    }

    function openQrModal() {
      playTactileClick();
      document.getElementById('qr-modal').classList.add('active');
    }

    function closeQrModal() {
      document.getElementById('qr-modal').classList.remove('active');
    }

    function copyManifest() {
      playTactileClick();
      var url = document.getElementById('manifest-preview').textContent;
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(url).then(function() {
          showToast('✅ Đã sao chép link Manifest vào Clipboard!');
        }).catch(function() {
          fallbackCopy(url);
        });
      } else {
        fallbackCopy(url);
      }
    }

    function fallbackCopy(text) {
      var ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      try {
        document.execCommand('copy');
        showToast('✅ Đã sao chép link Manifest!');
      } catch(e) {
        showToast('❌ Không thể sao chép tự động');
      }
      document.body.removeChild(ta);
    }

    var _toastTimer = null;
    function showToast(msg) {
      var t = document.getElementById('toast');
      if (!t) return;
      t.textContent = msg;
      t.classList.add('show');
      if (_toastTimer) clearTimeout(_toastTimer);
      _toastTimer = setTimeout(function() {
        t.classList.remove('show');
      }, 2500);
    }

    // Keyboard Accessibility
    document.querySelectorAll('.provider-card, .cat-pill').forEach(function(el) {
      el.addEventListener('keydown', function(e) {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          el.click();
        }
      });
    });

    // Initial Simulator render
    updateSimulator();
  </script>
</body>
</html>`;
}

module.exports = {
  renderDashboard,
};
