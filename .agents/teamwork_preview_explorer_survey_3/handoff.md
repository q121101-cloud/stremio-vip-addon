# Handoff Report: Survey Explorer 3 (Stream Protocol, Proxy, UI/Manifest & Test Strategy)

## 1. Observation

### 1.1 Architecture & File Overview
Direct inspection of the codebase in `/Users/quan/.gemini/antigravity/scratch/stremio-nguonc-addon` reveals the following key components:
- `src/handlers.js` (654 lines): Main route handler containing `/stream/:type/:id.json`, `/catalog/:type/:id.json`, `/meta/:type/:id.json`, `/health`, and the complete Cyber-Glassmorphism Configurator Dashboard (GET `/`).
- `src/routes/hls.js` (288 lines): Express router handling `/hls/extract`, `/hls/manifest.m3u8`, `/hls/m3u8`, and `/hls/ts`.
- `src/manifest.js` (240 lines): Defines `BASE_MANIFEST` with `version: '1.4.0'`, `id: 'org.vipmovies.stremio.addon'`, `name: 'VIP Movies 🎬'`, catalog definitions across providers (`nguonc`, `kkphim`), and `buildManifest()` function.
- `src/routes/manifest.js` (153 lines): Dynamic manifest handler (`/manifest.json` and `/:config/manifest.json`).
- `package.json` (34 lines): Package metadata with `"name": "stremio-nguonc-addon"`, `"version": "1.4.0"`.
- `src/providers/`:
  - `nguonc.js` (314 lines)
  - `kkphim.js` (416 lines)
  - `vsmov.js` (247 lines)
- Test scripts: `src/test.js`, `test_all.js`, `e2e_test.js`, `verify_matrix.js`, `test_decoder.js`, `test_thuyetminh.js`, `quick_probe.js`.

---

### 1.2 Observed Stream Protocol State in Handlers and Providers
Inspection of stream generation in `src/handlers.js` and provider files reveals:

#### A. NguonC (`src/providers/nguonc.js:274-295`)
```javascript
// 1. HLS Proxy Stream
if (proxyBase) {
  streams.push({
    name: 'VIP Movies 🎬',
    title: `[VIP 1 • NguonC] ${serverName}${epLabel} Full HD (HLS Proxy)\n⚡ Server VIP • StreamC Proxy`,
    url: `${proxyBase}/hls/extract?b64=${encodedEmbed}`,
    behaviorHints: {
      notSupported: false,
      bingeGroup: `nguonc-${movie.slug || 'stream'}`,
    },
  });
}

// 2. Embed Player Fallback
streams.push({
  name: 'VIP Movies 🎬',
  title: `[VIP 1 • NguonC] ${serverName}${epLabel} Full HD\n📺 Embed Player (Dự phòng)`,
  url: targetEp.embed,
  externalUrl: targetEp.embed,
  behaviorHints: {
    notSupported: false,
    bingeGroup: `nguonc-${movie.slug || 'stream'}`,
  },
});
```

#### B. KKPhim (`src/providers/kkphim.js:313-343`)
```javascript
if (targetEp.link_m3u8) {
  const streamUrl = proxyBase
    ? `${proxyBase}/hls/manifest.m3u8?url=${encodeBase64(targetEp.link_m3u8)}&ref=${encodeBase64(baseRef)}`
    : targetEp.link_m3u8;

  streams.push({
    name: 'VIP Movies 🎬',
    title: `[VIP 2 • KKPhim] ${cleanServerName}${epLabel} Full HD (HLS Proxy)\n⚡ Server VIP • Ổn định 100%`,
    url: streamUrl,
    behaviorHints: {
      notSupported: false,
      bingeGroup: `kkphim-${movie.slug || 'stream'}`,
    },
  });
}

// Embed Fallback
if (targetEp.link_embed) {
  streams.push({
    name: 'VIP Movies 🎬',
    title: `[VIP 2 • KKPhim] ${cleanServerName}${epLabel} Full HD\n📺 Embed Player (Dự phòng)`,
    url: targetEp.link_embed,
    externalUrl: targetEp.link_embed,
    behaviorHints: {
      notSupported: false,
      bingeGroup: `kkphim-${movie.slug || 'stream'}`,
    },
  });
}
```

#### C. VsMov (`src/providers/vsmov.js:213-231`)
```javascript
if (proxyBase) {
  const b64    = Buffer.from(m3u8Url).toString('base64url');
  const b64Ref = Buffer.from(embedHost + '/').toString('base64url');
  streams.push({
    name:  PROVIDER_LABEL,
    title: `🇻🇳 Vietsub\n🔄 HLS Proxy`,
    url:   `${proxyBase}/hls/manifest.m3u8?b64=${b64}&ref=${b64Ref}`,
    behaviorHints: { notSupported: false },
  });
}

// Direct m3u8 fallback
streams.push({
  name:  PROVIDER_LABEL,
  title: `🇻🇳 Vietsub\n🌐 Direct HLS`,
  url:   m3u8Url,
  behaviorHints: { notSupported: false },
});
```

---

### 1.3 Observed Proxy Implementation (`src/routes/hls.js`)
- `GET /hls/extract`: Receives `embed` / `b64` / `url`, calls `extractM3u8FromEmbed(embedUrl)`, then returns 302 redirect to `${protoHost}/hls/manifest.m3u8?b64=${b64M3u8}&ref=${b64Ref}`.
- `GET /hls/manifest.m3u8` (and `/hls/m3u8`): Resolves `req.query.url` or `req.query.b64` (supports both raw URLs and base64url encoded strings). Rewrites child sub-playlists to `/hls/manifest.m3u8` and TS segment URLs to `/hls/ts?b64=...&ref=...`. Sets `Content-Type: application/vnd.apple.mpegurl; charset=utf-8` and CORS headers.
- `GET /hls/ts`: Streams MPEG-TS video binary, overrides `Content-Type: video/mp2t`, handles per-source `Referer` and `Origin` headers.

---

### 1.4 Observed UI State & Versioning
- `src/handlers.js:324-326`:
  ```html
  <div class="footer">
    VIP Movies Addon v1.4.0 &bull; Powered by <span class="brand-highlight">Q121101</span>
  </div>
  ```
- `src/handlers.js:230-231`:
  ```css
  .brand-highlight { font-weight:800;background:linear-gradient(135deg,#a855f7 0%,#ec4899 50%,#38bdf8 100%);-webkit-background-clip:text;-webkit-text-fill-color:transparent;filter:drop-shadow(0 0 8px rgba(236,72,153,0.6));letter-spacing:0.5px;padding:0 2px;display:inline-block;transition:all 0.3s ease; }
  .brand-highlight:hover { filter:drop-shadow(0 0 14px rgba(56,189,248,0.8));transform:scale(1.06); }
  ```
- `src/manifest.js:173`: `"version": "1.4.0"`
- `package.json:3`: `"version": "1.4.0"`
- Command `node --check src/index.js` (and all other files in `src/`) exited with code 0.
- Git status shows clean main branch tracking `origin/main` (`https://github.com/q121101-cloud/stremio-vip-addon.git`).

---

### 1.5 Observed Test Suite Discrepancies
- `test_all.js:17`: `if (mRes.status === 200 && mRes.data.version === '1.3.1')` (hardcoded old version 1.3.1).
- `e2e_test.js:147`: `if (m.data.version === '1.3.1')` (hardcoded old version 1.3.1).
- `src/test.js:70`: `assert(res.body.id === 'org.nguonc.stremio.addon', ...)` (hardcoded legacy ID vs `org.vipmovies.stremio.addon`).

---

## 2. Logic Chain & Gap Analysis

```
[Requirement R3 Specification]
  ├── In-App Direct Play: HLS Proxy (`url: "${baseUrl}/hls/manifest.m3u8?url=${b64Url}&ref=${b64Ref}"` and NO `externalUrl`)
  │     Title: `[VIP • ${Provider}] ${ServerName} (HLS Proxy)\n⚡ Phát trực tiếp trong App`
  └── External Web Browser Play: Embed Player (`externalUrl: "${linkEmbed}"` and NO `url`)
        Title: `[Dự phòng • ${Provider}] ${ServerName} (Embed Player)\n🌐 Bấm để mở xem ngoài trình duyệt web`
```

### Logic Step 1: Stream Property Exclusivity Violation
- **Observation**: In `nguonc.js` (lines 286-295) and `kkphim.js` (lines 330-341), the embed fallback stream object defines both `url: targetEp.embed` AND `externalUrl: targetEp.embed`.
- **Reasoning**: According to Stremio Stream Protocol specification, when `url` is present, the Stremio app will attempt to mount and stream the resource in its built-in ExoPlayer / libVLC player. An HTML iframe URL (e.g. `https://phim.nguonc.com/embed/...`) fails to play inside the native player. To force Stremio to offer the stream as an external browser open button, the object **must omit the `url` property entirely** and supply **only `externalUrl`**.
- **Conclusion**: Embed Player streams must have `externalUrl: "${linkEmbed}"` and must NOT have `url`. HLS Proxy streams must have `url: "${baseUrl}/hls/manifest.m3u8?url=${b64Url}&ref=${b64Ref}"` (or `/hls/extract` if lazy extraction) and must NOT have `externalUrl`.

### Logic Step 2: Stream Title Inconsistency
- **Observation**:
  - NguonC proxy: `[VIP 1 • NguonC] ${serverName}${epLabel} Full HD (HLS Proxy)\n⚡ Server VIP • StreamC Proxy`
  - NguonC embed: `[VIP 1 • NguonC] ${serverName}${epLabel} Full HD\n📺 Embed Player (Dự phòng)`
  - KKPhim proxy: `[VIP 2 • KKPhim] ${cleanServerName}${epLabel} Full HD (HLS Proxy)\n⚡ Server VIP • Ổn định 100%`
  - KKPhim embed: `[VIP 2 • KKPhim] ${cleanServerName}${epLabel} Full HD\n📺 Embed Player (Dự phòng)`
  - VsMov proxy: `🇻🇳 Vietsub\n🔄 HLS Proxy`
  - VsMov direct: `🇻🇳 Vietsub\n🌐 Direct HLS`
- **Reasoning**: R3 explicitly standardizes titles across all providers:
  - In-App Direct Play: `[VIP • ${Provider}] ${ServerName} (HLS Proxy)\n⚡ Phát trực tiếp trong App`
  - Embed Player: `[Dự phòng • ${Provider}] ${ServerName} (Embed Player)\n🌐 Bấm để mở xem ngoài trình duyệt web`
- **Conclusion**: Titles across all three providers (`KKPhim`, `NguonC`, `VsMov`) must be harmonized to follow this exact format.

### Logic Step 3: Stream Aggregator Error Isolation & Timeout Guard
- **Observation**: `src/handlers.js` currently uses `Promise.allSettled(providersToRun.map(provider => provider.getStreams(payload)))`.
- **Reasoning**: To fulfill R2 & Acceptance Criteria 4 ("If one provider times out or throws an error, the remaining providers still return their streams without crashing the response"), each provider invocation must be bound by a 5-second timeout safeguard either at the Axios client level (`timeout: 5000`) or wrapped in a `Promise.race([provider.getStreams(payload), timeoutPromise(5000)])`. Furthermore, `src/handlers.js` should sanitize/standardize stream outputs after aggregation to guarantee 100% Stremio protocol compliance.

### Logic Step 4: UI & Version Consistency (R4)
- **Observation**:
  - `src/handlers.js` contains the glowing brand footer `VIP Movies Addon v1.4.0 • Powered by <span class="brand-highlight">Q121101</span>` and Cyber-Glassmorphism theme.
  - `package.json` and `src/manifest.js` are at version `1.4.0`.
  - `node --check src/index.js` passes.
  - Legacy test files (`test_all.js`, `e2e_test.js`, `src/test.js`) still have assertions expecting v1.3.1.
- **Conclusion**: R4 UI and versioning in production code are satisfied. Test harness files must be updated to test v1.4.0.

---

## 3. Caveats

1. **Lazy vs Direct Extraction for NguonC**: NguonC provides embed URLs (e.g. `streamc.xyz`), which need m3u8 extraction. Using `/hls/extract?b64=${encodedEmbed}` returns a 302 redirect to `/hls/manifest.m3u8`. Stremio player follows 302 redirects properly. However, standardizing the parameter structure so `/hls/manifest.m3u8?url=${b64Url}&ref=${b64Ref}` can either extract directly or proxy smoothly provides maximum player compatibility.
2. **VsMov Scraping Resilience**: VsMov HTML structure changes over time. When VsMov does not return results or encounters a gateway issue, it must gracefully return `[]` within 5 seconds without stalling the other providers.
3. **No Caveats on UI or Manifest Structure**: The existing HTML dashboard in `src/handlers.js` and dynamic manifest routing in `src/routes/manifest.js` are fully aligned with R4.

---

## 4. Conclusion & Actionable Implementation Plan

### 4.1 Summary of Exact Changes Required for R3 & R4

| Component | Target File | Required Action |
|---|---|---|
| **Stream Formatter & Aggregator** | `src/handlers.js` | 1. Implement stream sanitization & formatting helper conforming to R3.<br>2. Enforce `url` (no `externalUrl`) for HLS Proxy; `externalUrl` (no `url`) for Embed Player.<br>3. Wrap provider promises with 5s timeout guards. |
| **NguonC Stream Generation** | `src/providers/nguonc.js` | 1. Format HLS Proxy title: `[VIP • NguonC] ${serverName}${epLabel} (HLS Proxy)\n⚡ Phát trực tiếp trong App`<br>2. Format Embed title: `[Dự phòng • NguonC] ${serverName}${epLabel} (Embed Player)\n🌐 Bấm để mở xem ngoài trình duyệt web`<br>3. Remove `url` from Embed Player stream object.<br>4. Set 5s axios timeout. |
| **KKPhim Stream Generation** | `src/providers/kkphim.js` | 1. Format HLS Proxy title: `[VIP • KKPhim] ${cleanServerName}${epLabel} (HLS Proxy)\n⚡ Phát trực tiếp trong App`<br>2. Format Embed title: `[Dự phòng • KKPhim] ${cleanServerName}${epLabel} (Embed Player)\n🌐 Bấm để mở xem ngoài trình duyệt web`<br>3. Remove `url` from Embed Player stream object.<br>4. Set 5s axios timeout. |
| **VsMov Stream Generation** | `src/providers/vsmov.js` | 1. Format HLS Proxy title: `[VIP • VsMov] 1080p Master (HLS Proxy)\n⚡ Phát trực tiếp trong App`<br>2. Format Embed title (if available): `[Dự phòng • VsMov] Embed Player (Embed Player)\n🌐 Bấm để mở xem ngoài trình duyệt web`<br>3. Ensure `url` parameter in proxy query: `url: "${proxyBase}/hls/manifest.m3u8?url=${b64Url}&ref=${b64Ref}"`<br>4. Set 5s axios timeout & graceful fallback to `[]`. |
| **HLS Proxy Router** | `src/routes/hls.js` | Ensure query params `url` and `b64`, `ref` and `referer` are interchangeably resolved, CORS headers present, `video/mp2t` forced for segments. |
| **Manifest & UI** | `src/manifest.js`, `src/handlers.js` | Maintain version `1.4.0`, Cyber-Glassmorphism UI, and glowing footer: `VIP Movies Addon v1.4.0 • Powered by <span class="brand-highlight">Q121101</span>`. |
| **Test Suite** | `test_all.js`, `e2e_test.js`, `src/test.js` | Update version checks to `1.4.0`, verify `url` vs `externalUrl` exclusivity on stream objects, and add test for Inception `tt1375666`. |

---

## 5. Verification Method

To independently verify the implementation:

### Command 1: Syntax Check
```bash
node --check src/index.js && node --check src/handlers.js && node --check src/routes/hls.js && node --check src/manifest.js && node --check src/routes/manifest.js && node --check src/api.js && node --check src/config.js && node --check src/mapper.js && node --check src/providers/kkphim.js && node --check src/providers/nguonc.js && node --check src/providers/vsmov.js
```
*Expected result*: Exits with code 0 and zero errors.

### Command 2: Stream Protocol Compliance & Multi-Provider Verification Test
Run node script to verify `/stream/movie/tt1375666.json`:
```bash
PORT=7322 node -e "
const app = require('./src/index.js');
setTimeout(async () => {
  const axios = require('axios');
  const res = await axios.get('http://127.0.0.1:7322/stream/movie/tt1375666.json');
  const streams = res.data.streams || [];
  console.log('Streams count:', streams.length);
  
  // Rule 1: HLS Proxy streams have url and NO externalUrl
  const hlsStreams = streams.filter(s => s.url);
  const invalidHls = hlsStreams.filter(s => 'externalUrl' in s);
  console.log('HLS streams count:', hlsStreams.length, 'Invalid HLS (has externalUrl):', invalidHls.length);
  
  // Rule 2: Embed Player streams have externalUrl and NO url
  const embedStreams = streams.filter(s => s.externalUrl);
  const invalidEmbed = embedStreams.filter(s => 'url' in s);
  console.log('Embed streams count:', embedStreams.length, 'Invalid Embed (has url):', invalidEmbed.length);
  
  if (invalidHls.length === 0 && invalidEmbed.length === 0 && streams.length > 0) {
    console.log('✅ ALL STREAM PROTOCOL RULES SATISFIED 100%');
  } else {
    console.error('❌ PROTOCOL VIOLATION DETECTED');
  }
  process.exit(0);
}, 1500);
"
```

### Invalidation Conditions
- If any stream object with `url` also has `externalUrl`.
- If any stream object with `externalUrl` also has `url`.
- If title format deviates from `[VIP • ${Provider}] ${ServerName} (HLS Proxy)\n⚡ Phát trực tiếp trong App` or `[Dự phòng • ${Provider}] ${ServerName} (Embed Player)\n🌐 Bấm để mở xem ngoài trình duyệt web`.
- If version is not `1.4.0` in `package.json` or `src/manifest.js`.
