'use strict';

const axios = require('axios');

async function testYanDetailPage() {
  const http = axios.create({
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
      'Referer': 'https://yanhh3d.pw/',
    },
    timeout: 8000
  });

  const res = await http.get('https://yanhh3d.pw/the-gioi-hoan-my-thuyet-minh-tieng-viet');
  const html = res.data;
  const epMatches = [...html.matchAll(/href=["'](https?:\/\/(?:www\.)?yanhh3d\.pw\/(?:sever\d+\/)?([^"'\s]+?\/tap-(\d+)))["']/gi)];
  console.log('Episode links found in detail:', epMatches.length);
  for (const em of epMatches) {
    console.log('Link:', em[1], 'epNum:', em[3]);
  }

  // Also check other links on the page (e.g. relative or list-episodes)
  const allLinks = [...html.matchAll(/href=["']([^"']+)["']/gi)].map(m => m[1]).filter(u => u.includes('tap-'));
  console.log('All tap links on page:', allLinks);
}

testYanDetailPage();
