'use strict';

/**
 * ============================================================
 *  VIP Movies Addon — tests/test_nguonc_direct.js
 *  Deep Diagnostic: NguonC API & Stream Extraction Test
 * ============================================================
 */

require('dotenv').config();
const axios = require('axios');
const nguoncProvider = require('../src/providers/nguonc');
const mapper = require('../src/mapper');

const GREEN = '\x1b[32m';
const CYAN = '\x1b[36m';
const YELLOW = '\x1b[33m';
const BOLD = '\x1b[1m';
const RESET = '\x1b[0m';

async function runDirectDiagnostic() {
  console.log(`${BOLD}${CYAN}╔══════════════════════════════════════════════════════════════╗${RESET}`);
  console.log(`${BOLD}${CYAN}║     🔍 NGUONC DEEP DIAGNOSTIC & M3U8 STREAM EXTRACTOR        ║${RESET}`);
  console.log(`${BOLD}${CYAN}╚══════════════════════════════════════════════════════════════╝${RESET}\n`);

  const testSlug = process.argv[2] || 'cuu-mon';
  console.log(`📌 Target Movie Slug: ${BOLD}${YELLOW}${testSlug}${RESET}\n`);

  try {
    console.log(`⏳ [Step 1] Fetching movie detail from NguonC API...`);
    const detailData = await nguoncProvider.getDetail(testSlug);

    if (!detailData || !detailData.movie) {
      throw new Error(`Could not fetch details for slug: "${testSlug}"`);
    }

    const movie = detailData.movie;
    const episodes = detailData.episodes || [];

    console.log(`\n${GREEN}✅ Successfully retrieved movie data:${RESET}`);
    console.log(`   - ${BOLD}Tên phim:${RESET} ${movie.name} (${movie.original_name || 'N/A'})`);
    console.log(`   - ${BOLD}Chất lượng / Ngôn ngữ:${RESET} ${movie.quality || 'HD'} / ${movie.language || 'Vietsub'}`);
    console.log(`   - ${BOLD}Tổng số tập:${RESET} ${movie.total_episodes || 'N/A'} (Hiện tại: ${movie.current_episode || 'N/A'})`);
    console.log(`   - ${BOLD}Số cụm server:${RESET} ${episodes.length}`);

    console.log(`\n${BOLD}${CYAN}📋 DANH SÁCH TẬP & LINK M3U8 TRÍCH XUẤT:${RESET}`);
    console.log(`──────────────────────────────────────────────────────────────────────────`);

    let extractedCount = 0;

    for (let sIdx = 0; sIdx < episodes.length; sIdx++) {
      const sGroup = episodes[sIdx];
      const serverName = sGroup.server_name || `Server #${sIdx + 1}`;
      const items = sGroup.items || sGroup.server_data || [];

      console.log(`\n${BOLD}${YELLOW}▶ ${serverName}${RESET} (${items.length} tập):`);

      for (let i = 0; i < items.length; i++) {
        const ep = items[i];
        const epName = ep.name || `Tập ${i + 1}`;
        const embedUrl = ep.embed || ep.link_embed;
        let m3u8Url = ep.m3u8 || ep.link_m3u8;

        console.log(`\n   🔹 ${BOLD}[${epName}]${RESET} (Slug: ${ep.slug})`);
        console.log(`      🔗 Embed URL: ${embedUrl || 'N/A'}`);

        // If no direct m3u8 in item, extract via StreamC de-embed engine
        if (!m3u8Url && embedUrl) {
          try {
            const extractRes = await mapper.extractM3u8FromEmbed(embedUrl, 'https://embed15.streamc.xyz/');
            if (extractRes && extractRes.m3u8Url) {
              m3u8Url = extractRes.m3u8Url;
            }
          } catch (extErr) {
            console.log(`      ⚠️  De-embed warning: ${extErr.message}`);
          }
        }

        if (m3u8Url) {
          console.log(`      ${GREEN}🎬 Live M3U8:${RESET} ${m3u8Url}`);
          extractedCount++;

          // Verify live playable status of the first extracted m3u8
          if (extractedCount === 1) {
            console.log(`      ⏳ Verifying HTTP status of M3U8...`);
            try {
              const m3u8Origin = new URL(m3u8Url).origin;
              const pingRes = await axios.get(m3u8Url, {
                headers: {
                  'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
                  'Referer': `${m3u8Origin}/`,
                  'Origin': m3u8Origin,
                },
                timeout: 8000,
              });

              if (pingRes.status === 200 && String(pingRes.data).includes('#EXTM3U')) {
                console.log(`      ${GREEN}✨ M3U8 VERIFIED LIVE (HTTP 200 OK - #EXTM3U valid)${RESET}`);
              } else {
                console.log(`      ⚠️  M3U8 status: ${pingRes.status}`);
              }
            } catch (pingErr) {
              console.log(`      ⚠️  Ping error: ${pingErr.message}`);
            }
          }
        } else {
          console.log(`      ❌ M3U8 URL: Chưa trích xuất được`);
        }
      }
    }

    console.log(`\n──────────────────────────────────────────────────────────────────────────`);
    console.log(`${GREEN}🏁 Hoàn tất chẩn đoán NguonC: Đã trích xuất thành công ${extractedCount} luồng M3U8!${RESET}\n`);

  } catch (err) {
    console.error(`\n❌ LỖI TRONG QUÁ TRÌNH CHẨN ĐOÁN:`, err.message);
    process.exit(1);
  }
}

runDirectDiagnostic();
