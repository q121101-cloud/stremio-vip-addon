# Forensic Audit Report — Milestone 2 (`src/providers/vsmov.js`)

**Work Product**: `/Users/quan/.gemini/antigravity/scratch/stremio-nguonc-addon/src/providers/vsmov.js`  
**Profile**: General Project  
**Integrity Mode**: Development Mode (per `ORIGINAL_REQUEST.md`)  
**Verdict**: **CLEAN**

---

## 1. Observation

Direct observations and tool outputs from forensic inspection of `src/providers/vsmov.js`:

### 1.1 Source Code Implementation Analysis
- **Server Audio Classification** (`src/providers/vsmov.js`, lines 68–94):
  ```javascript
  function classifyServerAudio(serverName) {
    const name = String(serverName || '')
      .replace(/[\r\n]+/g, ' ')
      .replace(/#/g, '')
      .replace(/\s+/g, ' ')
      .trim();

    if (/l.{1,5}ng\s*ti.{1,5}ng/i.test(name) || /long\s*tieng/i.test(name)) {
      return {
        type: 'longtieng',
        label: 'Lồng Tiếng',
        bingeGroup: 'vsmov-longtieng-4k-vip-1',
      };
    }
    if (/thuy.{1,5}t\s*minh/i.test(name) || /thuyet\s*minh/i.test(name)) {
      return {
        type: 'thuyetminh',
        label: 'Thuyết Minh',
        bingeGroup: 'vsmov-thuyetminh-4k-vip-1',
      };
    }
    return {
      type: 'vietsub',
      label: 'Vietsub',
      bingeGroup: 'vsmov-vietsub-4k-vip-1',
    };
  }
  ```
  *Finding*: Genuine regex matching against raw server tab strings. No hardcoded movie IDs, slugs, or artificial tab lists.

- **Embed Player HTML & Subtitle Scraping** (`src/providers/vsmov.js`, lines 99–211):
  ```javascript
  async function resolveEmbedMedia(linkEmbed, linkM3u8) {
    ...
    const res = await http.get(linkEmbed, { timeout: 3000 });
    const html = String(res.data);
    ...
    const mSub = html.match(/subtitles\s*:\s*(\[[^\]]*\])/i);
    if (mSub && mSub[1]) {
      try {
        const parsed = JSON.parse(mSub[1]);
        if (Array.isArray(parsed) && parsed.length > 0) {
          const viSub = parsed.find(
            (s) =>
              s &&
              (s.code === 'vie' ||
                s.code === 'vi' ||
                s.lang === 'vie' ||
                s.lang === 'vi' ||
                (s.name && /vie|tiếng việt|viet/i.test(s.name)))
          ) || parsed[0];

          if (viSub && viSub.url) {
            subtitleUrl = String(viSub.url).trim();
          }
        }
      } catch {}
    }
  ```
  *Finding*: Genuine HTTP request to embed player endpoint, real regex extraction of `subtitles: [...]` JSON payload with language fallback and relative-to-absolute URL resolution.

- **Stream Object Construction & Subtitle Proxy Attachment** (`src/providers/vsmov.js`, lines 564–594):
  ```javascript
  const b64MasterUrl = encodeBase64(masterPlaylistUrl);
  const streamUrl = `${proxyBase || ''}/hls/manifest.m3u8?url=${b64MasterUrl}&ref=${b64Ref}`;
  const epLabel = formatEpisodeLabel(targetEp.name);

  const audioInfo = classifyServerAudio(rawServerName);

  // STRICT INVARIANT: url only, STRICTLY NO externalUrl
  const streamObj = {
    name: 'VIP Movies 🎬',
    title: `[VIP 1 • VSMOV] ${audioInfo.label} 4K Ultra HD (3840x2160)${epLabel} (HLS Proxy)\n⚡ Server VIP ${audioInfo.label} • vsmov.com`,
    url: streamUrl,
    behaviorHints: {
      notWebReady: false,
      notSupported: false,
      bingeGroup: audioInfo.bingeGroup,
    },
  };

  if (subtitleUrl) {
    const b64Sub = encodeBase64(subtitleUrl);
    const proxySubUrl = `${proxyBase || ''}/hls/sub.vtt?url=${b64Sub}&ref=${b64Ref}`;
    streamObj.subtitles = [
      {
        id: 'vi_vsmov',
        lang: 'vie',
        url: proxySubUrl,
      },
    ];
  }
  ```
  *Finding*: Correct base64url encoding, proper subtitle object structure matching Stremio Addon SDK specifications, exact title formatting per R1, and strict In-App stream protocol compliance (`url` present, `externalUrl` completely absent).

### 1.2 Static Forensics & Grep Scans
- Grep for test-specific constants/IDs (`tt0373889`, `tt1375666`, etc.) in `src/`: 0 matches found.
- Pre-populated artifacts search (`find . -maxdepth 3 \( -name '*.log' -o -name '*result*' -o -name '*output*' \)`): 0 files found.
- Syntax verification: `node --check src/index.js && node --check src/providers/vsmov.js && node --check src/routes/hls.js && node --check src/handlers.js` exited with code 0 (clean).

### 1.3 Empirical Execution Results
- **E2E Verification Suite** (`node tests/verify_vsmov_sub_audio.js`):
  - Total Assertions: 61, Passed: 61, Failed: 0 (100% PASS).
  - Validated live VSMOV stream extraction for Harry Potter `tt0373889` yielding 2 distinct streams (`Vietsub` and `Lồng Tiếng`), with valid `/hls/sub.vtt` live proxying returning HTTP 200 and `WEBVTT` header.
- **Provider Test Suite** (`node tests/m2_providers.test.js`):
  - Total Assertions: 53, Passed: 53, Failed: 0 (100% PASS).
- **Challenger Empirical Suite** (`node tests/m2_challenger_empirical.test.js`):
  - Total Assertions: 129, Passed: 129, Failed: 0 (100% PASS).
- **Live Scraping Test**:
  - Live query against `https://vsmov.com/api/phim/harry-potter-va-menh-lenh-phuong-hoang` resolved real server tabs `Vietsub #1` and `Lồng tiếng #1`.
  - Embed scraper against `https://v5.streamvsmov.com/video/382f09db-83ff-4d89-9be9-797162d4f2e6` returned real live `masterPlaylistUrl` (`https://v5.streamvsmov.com/stream/382f09db-83ff-4d89-9be9-797162d4f2e6/master.m3u8`) and live `subtitleUrl` (`https://v5.streamvsmov.com/video/382f09db-83ff-4d89-9be9-797162d4f2e6/subtitle/vie_1785240078185_txr9be.vtt`).

---

## 2. Logic Chain

1. **Premise 1 (Authentic Audio Parsing)**: Observation 1.1 demonstrates that `classifyServerAudio` uses general Vietnamese diacritic and ASCII regexes (`/l.{1,5}ng\s*ti.{1,5}ng/i`, `/thuy.{1,5}t\s*minh/i`) to dynamically classify any server tab name without hardcoding or movie-specific checks.
2. **Premise 2 (Genuine Embed & Subtitle Scraping)**: Observations 1.1 and 1.3 show that `resolveEmbedMedia` performs genuine HTTP GET requests to the embed player, parses the HTML DOM/JavaScript context to extract real `baseUrl`, `videoHash`, and `playerOptions.subtitles` arrays, and resolves relative paths to absolute URLs.
3. **Premise 3 (In-App Protocol & Subtitle Formatting)**: Observation 1.1 confirms that `src/providers/vsmov.js` formats stream objects strictly using `url: streamUrl` (omitting `externalUrl`), applies exact title patterns `[VIP 1 • VSMOV] <Audio> 4K Ultra HD (3840x2160)${epLabel} (HLS Proxy)\n⚡ Server VIP <Audio> • vsmov.com`, and attaches valid `subtitles: [{ id: 'vi_vsmov', lang: 'vie', url: proxySubUrl }]`.
4. **Premise 4 (Zero Hardcoding / Cheating)**: Observation 1.2 confirms that no test IDs, mock facades, pre-populated logs, or fake test shortcuts exist in the codebase.
5. **Deductive Conclusion**: Since all four premises hold true and 100% of empirical test assertions pass against live endpoints and ephemeral servers, the work product is genuine, robust, and completely free of integrity violations.

---

## 3. Caveats

- Upstream VSMOV embed server URLs may periodically rotate domains (e.g. `v5.streamvsmov.com`, `v14.streamvsmov.com`, `s1.streamvsmov.com`); the implementation dynamically respects `new URL(linkEmbed).origin` and regex baseUrl extraction, which mitigates domain drift.
- No other caveats.

---

## 4. Conclusion

**Verdict**: **`CLEAN`**

The Milestone 2 code changes in `src/providers/vsmov.js` fulfill all requirements of the project specification and user request (§R1). The implementation is authentic, rigorous, fully compliant with In-App streaming protocols, and free of any mocks, facades, or hardcoded cheating.

---

## 5. Verification Method

To independently verify this forensic audit:

1. **Syntax Check**:
   ```bash
   node --check src/providers/vsmov.js
   ```
2. **Run E2E Multi-Server & Subtitle Verification**:
   ```bash
   node tests/verify_vsmov_sub_audio.js
   ```
3. **Run Comprehensive M2 Provider Tests**:
   ```bash
   node tests/m2_providers.test.js
   node tests/m2_challenger_empirical.test.js
   ```
4. **Empirical Subtitle & Server Tab Test**:
   ```bash
   node -e "
   const vsmov = require('./src/providers/vsmov');
   vsmov.getStreams({ type: 'movie', title: 'Harry Potter and the Order of the Phoenix', year: 2007, imdbId: 'tt0373889', proxyBase: 'http://localhost:7000' })
     .then(streams => console.log('VSMOV Streams:', JSON.stringify(streams, null, 2)));
   "
   ```
