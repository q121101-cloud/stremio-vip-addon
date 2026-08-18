'use strict';

const axios = require('axios');

async function debugClbpx() {
  const http = axios.create({
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    },
    timeout: 8000
  });

  const url = 'https://clbphimxua.info/xem-phim-thien-long-bat-bo-kieu-phong-truyen-2/full-sv1.html';
  const res = await http.get(url, { headers: { Referer: 'https://clbphimxua.info/' } });
  const html = res.data;

  const jsonEpMatch = html.match(/var\s+jsonEpisodes\s*=\s*(\[\[[\s\S]*?\]\]);/i);
  console.log('jsonEpMatch exists:', !!jsonEpMatch);
  if (jsonEpMatch) {
    console.log('jsonEpisodes raw:', jsonEpMatch[1]);
  }

  const cfgMatch = html.match(/var\s+halim_cfg\s*=\s*(\{[\s\S]*?\});/i);
  console.log('cfgMatch exists:', !!cfgMatch);
  if (cfgMatch) {
    console.log('halim_cfg raw:', cfgMatch[1]);
  }

  // Let's call player.php manually with the parsed values
  if (jsonEpMatch && cfgMatch) {
    const jsonEpisodes = JSON.parse(jsonEpMatch[1]);
    const cfg = JSON.parse(cfgMatch[1]);
    const target = jsonEpisodes.flat()[0];
    console.log('Target episode object:', target);

    const playerUrl = cfg.player_url || 'https://clbphimxua.info/wp-content/themes/halimmovies/player.php';
    console.log('Fetching player.php from:', playerUrl);
    try {
      const pRes = await http.get(playerUrl, {
        params: {
          episode_slug: target.episodeSlug || 'full',
          server_id: String(target.serverId || '1'),
          post_id: target.postId || cfg.post_id,
        },
        headers: {
          'X-Requested-With': 'XMLHttpRequest',
          Referer: url,
        },
      });
      console.log('player.php status:', pRes.status, 'len:', pRes.data.length);
      console.log('player.php content:\n', pRes.data);
      const ifrMatch = pRes.data.match(/<iframe[^>]+src=[\x22\x27](https?:\/\/[^"'\s]+)[\x22\x27]/i);
      if (ifrMatch) {
        const embedUrl = ifrMatch[1];
        console.log('Fetching embed URL:', embedUrl);
        const embedRes = await http.get(embedUrl, {
          headers: { Referer: url }
        });
        console.log('embed status:', embedRes.status, 'len:', embedRes.data.length);
        console.log('embed preview:\n', embedRes.data.slice(0, 1000));
      }
    } catch (e) {
      console.error('player.php error:', e.message);
    }
  }
}

debugClbpx();
