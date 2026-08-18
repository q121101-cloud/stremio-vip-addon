'use strict';

const axios = require('axios');

async function testPages() {
  const http = axios.create({
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    },
    timeout: 8000
  });

  console.log('--- Inspecting CLBPX detail and episode pages ---');
  try {
    const res = await http.get('https://clbphimxua.info/thien-long-bat-bo-kieu-phong-truyen-2', {
      headers: { Referer: 'https://clbphimxua.info/' }
    });
    console.log('CLBPX detail status:', res.status, 'len:', res.data.length);
    // Find all links to watch pages
    const watchLinks = [...res.data.matchAll(/href=[\x22\x27](https?:\/\/(?:www\.)?clbphimxua\.info\/[^"'\s]+)[\x22\x27]/gi)]
      .map(m => m[1])
      .filter(u => u.includes('xem') || u.includes('tap') || u.includes('sv') || u.includes('full'));
    console.log('CLBPX watch links found:', watchLinks);

    if (watchLinks.length > 0) {
      const wRes = await http.get(watchLinks[0], { headers: { Referer: 'https://clbphimxua.info/' } });
      console.log('CLBPX watch page status:', wRes.status, 'len:', wRes.data.length);
      console.log('Has halim_cfg:', wRes.data.includes('halim_cfg'));
      console.log('Has jsonEpisodes:', wRes.data.includes('jsonEpisodes'));
      console.log('Has iframe:', wRes.data.includes('<iframe'));
      const iframes = [...wRes.data.matchAll(/<iframe[^>]+src=[\x22\x27]([^"'\s]+)[\x22\x27]/gi)].map(m => m[1]);
      console.log('CLBPX iframes in watch page:', iframes);
      const scripts = [...wRes.data.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/gi)].map(m => m[1]).filter(s => s.includes('player') || s.includes('halim') || s.includes('episode'));
      console.log('CLBPX relevant scripts count:', scripts.length);
      if (scripts.length > 0) {
        console.log('Sample script:', scripts[0].slice(0, 500));
      }
    }
  } catch (e) {
    console.error('CLBPX error:', e.message);
  }

  console.log('\n--- Inspecting YAN detail and episode pages ---');
  try {
    const res = await http.get('https://yanhh3d.pw/the-gioi-hoan-my-thuyet-minh-tieng-viet', {
      headers: { Referer: 'https://yanhh3d.pw/' }
    });
    console.log('YAN detail status:', res.status, 'len:', res.data.length);
    const links = [...res.data.matchAll(/href=[\x22\x27](https?:\/\/(?:www\.)?yanhh3d\.pw\/[^"'\s]+)[\x22\x27]/gi)]
      .map(m => m[1])
      .filter(u => u.includes('tap') || u.includes('ep') || u.includes('xem'));
    console.log('YAN episode links found in detail:', links.slice(0, 10));

    // Let's test a known YAN episode page
    const epUrl = links[0] || 'https://yanhh3d.pw/the-gioi-hoan-my-thuyet-minh-tieng-viet/tap-1';
    console.log('Fetching YAN episode url:', epUrl);
    const epRes = await http.get(epUrl, { headers: { Referer: 'https://yanhh3d.pw/' } });
    console.log('YAN episode status:', epRes.status, 'len:', epRes.data.length);
    const svButtons = [...epRes.data.matchAll(/<[^>]+(?:sv_|server|data-src|embed)[^>]*>/gi)].map(m => m[0]);
    console.log('YAN server/embed tags count:', svButtons.length);
    console.log('Sample YAN tags:', svButtons.slice(0, 5));
  } catch (e) {
    console.error('YAN error:', e.message);
  }
}

testPages();
