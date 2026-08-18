'use strict';
const axios = require('axios');

async function main() {
  const urls = [
    'https://v5.streamvsmov.com/video/382f09db-83ff-4d89-9be9-797162d4f2e6',
    'https://v5.streamvsmov.com/video/9f623219-003a-4628-a72d-91461d3a1716'
  ];
  for (const url of urls) {
    console.log('\n==============================');
    console.log('Fetching embed:', url);
    try {
      const res = await axios.get(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
          'Referer': 'https://vsmov.com/',
          'Origin': 'https://vsmov.com'
        },
        timeout: 10000
      });
      console.log('Status:', res.status);
      const html = String(res.data);
      console.log('HTML length:', html.length);
      console.log('HTML preview:\n', html.slice(0, 800));

      const scripts = html.match(/<script[\s\S]*?<\/script>/gi) || [];
      console.log(`Found ${scripts.length} script tags`);
      for (const s of scripts) {
        if (s.includes('player') || s.includes('m3u8') || s.includes('sub') || s.includes('jwplayer') || s.includes('Artplayer') || s.includes('tracks')) {
          console.log('--- Interesting Script ---\n', s.slice(0, 1000));
        }
      }
    } catch (err) {
      console.error('Error fetching', url, err.message);
    }
  }
}

main();
