'use strict';

const axios = require('axios');

async function debugPlayerPhp() {
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
  const cfgMatch = html.match(/var\s+halim_cfg\s*=\s*(\{[\s\S]*?\});/i);

  if (jsonEpMatch && cfgMatch) {
    const jsonEpisodes = JSON.parse(jsonEpMatch[1]);
    const cfg = JSON.parse(cfgMatch[1]);
    const target = jsonEpisodes.flat()[0];

    const playerUrl = cfg.player_url || 'https://clbphimxua.info/wp-content/themes/halimmovies/player.php';
    console.log('Sending AJAX GET to:', playerUrl, 'with params:', {
      episode_slug: target.episodeSlug,
      server_id: String(target.serverId),
      post_id: target.postId || cfg.post_id,
    });

    const pRes = await http.get(playerUrl, {
      params: {
        episode_slug: target.episodeSlug,
        server_id: String(target.serverId),
        post_id: target.postId || cfg.post_id,
      },
      headers: {
        'X-Requested-With': 'XMLHttpRequest',
        Referer: url,
      },
    });
    console.log('pRes data:', typeof pRes.data, pRes.data);

    // Also check halim-ajax.php or POST requests if Halim uses POST
    const ajaxUrl = 'https://clbphimxua.info/wp-admin/admin-ajax.php';
    try {
      const formRes = await http.post('https://clbphimxua.info/wp-content/themes/halimmovies/player.php', new URLSearchParams({
        episode_slug: target.episodeSlug,
        server_id: String(target.serverId),
        post_id: target.postId || cfg.post_id,
      }).toString(), {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
          'X-Requested-With': 'XMLHttpRequest',
          Referer: url,
        }
      });
      console.log('POST player.php data:', formRes.data);
    } catch(e) {
      console.log('POST error:', e.message);
    }
  }
}

debugPlayerPhp();
