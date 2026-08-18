'use strict';
const axios = require('axios');

async function checkSubtitles() {
  const slugs = [
    'harry-potter-va-menh-lenh-phuong-hoang',
    'avatar-dong-chay-cua-nuoc',
    'oppenheimer',
    'ke-trom-mat-trang-4',
    'deadpool-va-wolverine'
  ];

  for (const slug of slugs) {
    try {
      const apiRes = await axios.get(`https://vsmov.com/api/phim/${slug}`, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
          'Referer': 'https://vsmov.com/',
          'Origin': 'https://vsmov.com'
        },
        timeout: 8000
      });
      const data = apiRes.data;
      console.log(`\n=== Film: ${slug} ===`);
      const episodes = data.episodes || [];
      for (const server of episodes) {
        console.log(`Server: ${server.server_name}`);
        const firstEp = server.server_data?.[0];
        if (firstEp && firstEp.link_embed) {
          const embedRes = await axios.get(firstEp.link_embed, {
            headers: {
              'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
              'Referer': 'https://vsmov.com/',
              'Origin': 'https://vsmov.com'
            },
            timeout: 8000
          });
          const html = String(embedRes.data);
          const m = html.match(/playerOptions\s*=\s*({[\s\S]*?});/);
          if (m) {
            console.log('playerOptions match:');
            try {
              // Extract subtitles property
              const subMatch = m[1].match(/subtitles\s*:\s*(\[[^\]]*\])/);
              if (subMatch) {
                console.log('  subtitles field:', subMatch[1]);
              }
            } catch(e) {
              console.log('  parse err:', e.message);
            }
          }
        }
      }
    } catch(e) {
      console.log(`Error with ${slug}:`, e.message);
    }
  }
}

checkSubtitles();
