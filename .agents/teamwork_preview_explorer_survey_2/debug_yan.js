'use strict';

const axios = require('axios');

async function debugYan() {
  const http = axios.create({
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
      'Referer': 'https://yanhh3d.pw/',
    },
    timeout: 8000
  });

  // Let's test a real anime on yanhh3d.pw
  try {
    const sRes = await http.get('https://yanhh3d.pw/the-gioi-hoan-my-thuyet-minh-tieng-viet');
    console.log('Detail page status:', sRes.status, 'len:', sRes.data.length);
    // Find all links to episode pages
    const epLinks = [...sRes.data.matchAll(/href=[\x22\x27](https?:\/\/(?:www\.)?yanhh3d\.pw\/[^"'\s]*tap[^"'\s]*)[\x22\x27]/gi)].map(m => m[1]);
    console.log('Episode links count:', epLinks.length);
    console.log('Sample ep links:', epLinks.slice(0, 5));

    if (epLinks.length > 0) {
      const epUrl = epLinks[epLinks.length - 1]; // e.g. tap-1 or tap-282
      console.log('Fetching episode page:', epUrl);
      const epRes = await http.get(epUrl);
      console.log('Episode page status:', epRes.status, 'len:', epRes.data.length);
      const html = epRes.data;

      // Check for server buttons / iframes / embeds
      const serverElements = [...html.matchAll(/<button[^>]*class=[\x22\x27][^\x22\x27]*server[^\x22\x27]*[\x22\x27][^>]*>[\s\S]*?<\/button>/gi)].map(m => m[0]);
      console.log('Server buttons:', serverElements);

      const dataSrcMatches = [...html.matchAll(/data-src=[\x22\x27](https?:\/\/[^"'\s]+)[\x22\x27]/gi)].map(m => m[1]);
      console.log('data-src matches:', dataSrcMatches);

      const iframes = [...html.matchAll(/<iframe[^>]+src=[\x22\x27](https?:\/\/[^"'\s]+)[\x22\x27]/gi)].map(m => m[1]);
      console.log('iframes:', iframes);

      const svMatches = [...html.matchAll(/id=[\x22\x27]sv_([^"'\s]+)[\x22\x27][^>]*data-src=[\x22\x27](https?:\/\/[^"'\s]+)[\x22\x27]/gi)];
      console.log('svMatches count:', svMatches.length);
      for (const sm of svMatches) {
        console.log('svMatch id:', sm[1], 'src:', sm[2]);
        try {
          const sRes = await http.get(sm[2], { headers: { Referer: epUrl } });
          console.log('Embed status:', sRes.status, 'len:', sRes.data.length);
          console.log('Embed snippet:\n', String(sRes.data).slice(0, 500));
        } catch(e) {
          console.error('Embed fetch error:', e.message);
        }
      }
    }
  } catch(e) {
    console.error('YAN debug error:', e.message);
  }
}

debugYan();
