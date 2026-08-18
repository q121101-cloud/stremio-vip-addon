# Comprehensive Architecture, Test Infrastructure, Versioning, UI Branding & Deployment Analysis

## Executive Summary
This survey provides an in-depth architectural and empirical analysis for **Hotfix v1.5.1** of the Stremio VIP Movies Addon. We investigated:
1. **Existing test infrastructure in `tests/` and test runner setup**: Structure, helpers, Stremio Protocol Exclusivity assertions, fixtures, and execution methods.
2. **Requirements for `tests/verify_vsmov_sub_audio.js`**: Ephemeral server lifecycle, Harry Potter (`tt0373889`) resolution, distinct multi-server audio tab extraction (`Vietsub`, `Lồng Tiếng`, `Thuyết Minh`), Subtitle extraction from VSMOV player data (`playerOptions.subtitles`), subtitle proxy routing via `/hls/sub.vtt`, and In-App protocol compliance.
3. **Versioning & UI Branding**: Synchronization to `1.5.1` across `package.json`, `src/manifest.js`, `src/handlers.js`, `src/index.js`, and preserving the Cyber-Glassmorphism signature `VIP Movies Addon v1.5.1 • Powered by <span class="brand-highlight">Q121101</span>`.
4. **Git repository status and deployment pipeline**: Working tree status, remote origin configuration, and deployment command verification.

---

## 1. Existing Test Infrastructure & Runner Setup

### 1.1 Test Runner Architecture & Execution Strategy
- **Runner Configuration**:
  - `package.json` scripts define `"test": "node src/test.js"`, which runs 50 integration assertions against an ephemeral Express instance (`app.listen(0)`).
  - Standalone test suites in `tests/` (47 files) can be executed directly using Node.js without external runner dependencies (e.g. `node tests/e2e.test.js`, `node tests/empiric_playback_challenger_m1_m4.test.js`).
- **Core Test Framework Helper (`tests/helpers.js`)**:
  - **`TestRunner` Class** (lines 15–162): Implements section-based logging, assertion counting (`passed`, `failed`, `warned`, `skipped`), formatted summary tables, and failure diagnostic traces.
  - **Key Assertion Methods**:
    - `assert(condition, label, customErr)`
    - `assertEqual(actual, expected, label)`
    - `assertIncludes(str, sub, label)`
    - `assertStreamProtocol(stream, index)` (lines 91–140): Validates Stremio Stream Exclusivity Contract:
      - **In-App Direct Play (HLS Proxy)**: MUST have `url` (non-empty string) and `externalUrl` MUST be strictly `undefined`.
      - **External Embed Player**: MUST have `externalUrl` and `url` MUST be strictly `undefined`.
  - **`startTestServer(port)`** (lines 167–174): Launches the Express app (`src/index.js`) on a designated port (`app.listen(port, '127.0.0.1')`) and returns `{ app, server, baseUrl, port }`.
- **Test Fixtures (`tests/fixtures.js`)**:
  - Contains standardized mock metadata and payload fixtures for Cinemeta (`tt1375666` Inception, `tt0903747` Breaking Bad, `tt0388629` One Piece), KKPhim, NguonC, and VSMOV.

---

## 2. Requirements Analysis for `tests/verify_vsmov_sub_audio.js`

### 2.1 Test Workflow & Lifecycle
1. **Server Instantiation**:
   - Must boot the application on an ephemeral port (`app.listen(0, '127.0.0.1')` or `startTestServer(0)`).
   - Capture dynamic port and format base URL `http://127.0.0.1:${port}`.
2. **Movie Stream Query**:
   - Send HTTP GET to `${BASE_URL}/stream/movie/tt0373889.json` (Harry Potter and the Order of the Phoenix).
   - Filter stream objects where `stream.name === 'VIP Movies 🎬'` and `stream.title` originates from VSMOV (`[VIP 1 • VSMOV]`).
3. **Multi-Server Audio Option Assertions**:
   - Verify that at least 2 distinct audio stream options are present:
     - **Vietsub Option**:
       - `name`: `"VIP Movies 🎬"`
       - `title`: `[VIP 1 • VSMOV] Vietsub 4K Ultra HD (3840x2160) (HLS Proxy)\n⚡ Server VIP Vietsub • vsmov.com`
     - **Lồng Tiếng / Thuyết Minh Option**:
       - `name`: `"VIP Movies 🎬"`
       - `title` (Lồng Tiếng): `[VIP 1 • VSMOV] Lồng Tiếng 4K Ultra HD (3840x2160) (HLS Proxy)\n⚡ Server VIP Lồng Tiếng • vsmov.com`
       - `title` (Thuyết Minh): `[VIP 1 • VSMOV] Thuyết Minh 4K Ultra HD (3840x2160) (HLS Proxy)\n⚡ Server VIP Thuyết Minh • vsmov.com`
4. **In-App Stream Protocol Compliance**:
   - `assertStreamProtocol` passes on all returned streams.
   - For all HLS proxy streams: `stream.url` exists and is a non-empty string; `stream.externalUrl === undefined`.
5. **Subtitle Extraction & Proxy Verification**:
   - Vietsub stream object contains a `subtitles` array:
     ```json
     "subtitles": [
       {
         "id": "vi_vsmov",
         "lang": "vie",
         "url": "http://127.0.0.1:<PORT>/hls/sub.vtt?url=<BASE64_SUB_URL>&ref=<BASE64_REF_URL>"
       }
     ]
     ```
   - Make an HTTP GET request to the proxy subtitle URL (`/hls/sub.vtt?url=...`).
   - Validate assertions:
     - HTTP Status: `200`
     - Header `Content-Type`: `text/vtt; charset=utf-8` (or includes `text/vtt`)
     - Header `Access-Control-Allow-Origin`: `*`
     - Header `Cache-Control`: `public, max-age=86400`
     - Body Content: Starts with or contains `WEBVTT` header.
6. **Series Stream Query**:
   - Send HTTP GET to `${BASE_URL}/stream/series/tt0903747:1:1.json` or series ID.
   - Validate successful stream response and protocol compliance.
7. **Clean Teardown**:
   - Ensure the ephemeral server is gracefully closed (`server.close()`).

### 2.2 Empirical Findings on VSMOV API & Player Subtitles
During empirical investigation of Harry Potter (`tt0373889`), the live VSMOV API and player responses revealed:
- `vsmov.getByImdb('tt0373889')` returns `episodes` with 2 server groups:
  1. `episodes[0]`: `server_name = 'Vietsub\n                        #1'`, embed: `https://v5.streamvsmov.com/video/382f09db-83ff-4d89-9be9-797162d4f2e6`
  2. `episodes[1]`: `server_name = 'Lồng tiếng #1'`, embed: `https://v5.streamvsmov.com/video/9f623219-003a-4628-a72d-91461d3a1716`
- When inspecting the Vietsub embed HTML (`https://v5.streamvsmov.com/video/382f09db-...`), the player configuration contains:
  ```js
  const playerOptions = {
      subtitles: [
          {
              name: "vie 1785240078185 txr9be",
              type: "local",
              url: "/video/382f09db-83ff-4d89-9be9-797162d4f2e6/subtitle/vie_1785240078185_txr9be.vtt",
              code: "vie"
          },
          ...
      ]
  };
  ```
- Subtitle relative URL resolves to `https://v5.streamvsmov.com/video/382f09db-83ff-4d89-9be9-797162d4f2e6/subtitle/vie_1785240078185_txr9be.vtt`.
- Upstream subtitle response returns `200 OK` with valid `WEBVTT` text.

---

## 3. Versioning & UI Branding Analysis

### 3.1 Version Sync Checklist (Target: v1.5.1)
All files requiring version alignment:
1. **`package.json`** (line 3):
   - `"version": "1.5.0"` → `"version": "1.5.1"`
2. **`src/manifest.js`**:
   - Header comment (line 5): `(v1.5.0)` → `(v1.5.1)`
   - `BASE_MANIFEST.version` (line 387): `'1.5.0'` → `'1.5.1'`
3. **`src/handlers.js`**:
   - Header comment (line 5): `(Engine v1.5.0)` → `(Engine v1.5.1)`
   - Live Badge (line 314): `Hệ thống Trực tuyến &nbsp;·&nbsp; v1.5.0` → `Hệ thống Trực tuyến &nbsp;·&nbsp; v1.5.1`
   - UI Footer Brand Signature (line 436):
     ```html
     VIP Movies Addon v1.5.1 &bull; Powered by <span class="brand-highlight">Q121101</span>
     ```
   - Note: `/health` handler (line 994) uses `MANIFEST.version`, so updating `src/manifest.js` automatically propagates to `/health`.
4. **`src/index.js`**:
   - Header comment (line 5): `(Engine v1.5.0)` → `(Engine v1.5.1)`
   - Terminal Banner (line 105): `'║      🎬  VIP Movies Stremio Addon  Engine v1.5.1     ║'`
5. **`src/config.js`**, **`src/routes/hls.js`**, **`src/providers/*.js`**:
   - Update header comments to `(Engine v1.5.1)` / `(v1.5.1)`.

### 3.2 UI Branding Preservation
- The Cyber-Glassmorphism UI in `src/handlers.js` has a strict brand footer requirement:
  - Exact HTML structure: `VIP Movies Addon v1.5.1 &bull; Powered by <span class="brand-highlight">Q121101</span>`
  - The CSS class `.brand-highlight` provides gradient text styling (`background: linear-gradient(135deg, #a855f7 0%, #06b6d4 100%)`).
  - This markup must be preserved verbatim.

---

## 4. Git Repository & Deployment Pipeline Status

### 4.1 Git Repository Verification
- **Branch**: `main`
- **Remote Origin URL**: `https://github.com/q121101-cloud/stremio-vip-addon.git`
- **User Config**:
  - `user.name`: `NguonC Addon`
  - `user.email`: `addon@nguonc.local`
- **Last Commit**: `27fcb9e` ("Engine v1.5.0: Production-Ready 7-Source Swarm with 22 Catalogs & E2E Verified 4K Playback via Teamwork Preview").

### 4.2 Target Deployment Command
```bash
git add . && git commit -m "Hotfix v1.5.1: Split VSMOV into distinct Vietsub, Long Tieng & Thuyet Minh 4K streams with Subtitle Proxy" && git push origin main
```

---

## 5. Implementation Roadmap & Verification Gates

| Phase | Target Files | Key Actions |
|---|---|---|
| **Phase 1: VSMOV Provider & Subtitle Extraction** | `src/providers/vsmov.js` | 1. Parse all server tabs (`Vietsub`, `Lồng Tiếng`, `Thuyết Minh`) without collapsing.<br>2. Format titles: `[VIP 1 • VSMOV] Vietsub 4K Ultra HD (3840x2160) (HLS Proxy)\n⚡ Server VIP Vietsub • vsmov.com`.<br>3. Extract `playerOptions.subtitles` from embed player HTML, resolve absolute URL, build proxy URL `${proxyBase}/hls/sub.vtt?url=${b64Sub}&ref=${b64Ref}`, and attach `subtitles: [{ id: 'vi_vsmov', lang: 'vie', url: proxySubUrl }]`. |
| **Phase 2: Subtitle Proxy Endpoint** | `src/routes/hls.js` | 1. Implement `GET /hls/sub.vtt`.<br>2. Fetch upstream with headers `Referer: https://vsmov.com/`, `Origin: https://vsmov.com`, Chrome UA.<br>3. Send headers: `Content-Type: text/vtt; charset=utf-8`, `Access-Control-Allow-Origin: *`, `Cache-Control: public, max-age=86400`.<br>4. Auto-convert SRT to WebVTT if upstream is SRT. |
| **Phase 3: Versioning & Branding** | `package.json`, `src/manifest.js`, `src/handlers.js`, `src/index.js` | 1. Bump version to `1.5.1`.<br>2. Verify Cyber-Glassmorphism UI signature `VIP Movies Addon v1.5.1 • Powered by <span class="brand-highlight">Q121101</span>`. |
| **Phase 4: E2E Verification Suite** | `tests/verify_vsmov_sub_audio.js` | 1. Start ephemeral server.<br>2. Test `tt0373889` (Harry Potter) and series.<br>3. Validate >=2 distinct VSMOV streams.<br>4. Validate `/hls/sub.vtt` response, headers, WEBVTT body.<br>5. Assert 100% pass. |
| **Phase 5: Deployment** | Git repository | Run standard deployment commands. |
