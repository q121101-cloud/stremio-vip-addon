'use strict';

/**
 * Test Fixtures & Mock Responses for VIP Movies Test Suite
 */

const FIXTURES = {
  cinemeta: {
    inception: {
      imdbId: 'tt1375666',
      type: 'movie',
      meta: {
        id: 'tt1375666',
        type: 'movie',
        name: 'Inception',
        year: '2010',
        releaseInfo: '2010',
        genres: ['Action', 'Adventure', 'Sci-Fi'],
        aliases: ['Inception (2010)'],
        poster: 'https://images.metahub.space/poster/medium/tt1375666/img',
        background: 'https://images.metahub.space/background/medium/tt1375666/img',
        description: 'A thief who steals corporate secrets through the use of dream-sharing technology...',
      },
    },
    breakingBad: {
      imdbId: 'tt0903747',
      type: 'series',
      meta: {
        id: 'tt0903747',
        type: 'series',
        name: 'Breaking Bad',
        year: '2008–2013',
        releaseInfo: '2008–2013',
        genres: ['Crime', 'Drama', 'Thriller'],
        aliases: ['Breaking Bad (TV Series)'],
        poster: 'https://images.metahub.space/poster/medium/tt0903747/img',
        background: 'https://images.metahub.space/background/medium/tt0903747/img',
        description: 'A chemistry teacher diagnosed with inoperable lung cancer turns to manufacturing methamphetamine...',
      },
    },
    onePiece: {
      imdbId: 'tt0388629',
      type: 'series',
      meta: {
        id: 'tt0388629',
        type: 'series',
        name: 'One Piece',
        year: '1999–',
        releaseInfo: '1999–',
        genres: ['Animation', 'Action', 'Adventure'],
        poster: 'https://images.metahub.space/poster/medium/tt0388629/img',
        description: 'Follows the adventures of Monkey D. Luffy and his pirate crew...',
      },
    },
  },

  kkphim: {
    movieDetail: {
      status: true,
      msg: 'done',
      movie: {
        id: '64a1b2c3d4e5f6',
        name: 'Kẻ Đánh Cắp Giấc Mơ',
        origin_name: 'Inception',
        slug: 'ke-danh-cap-giac-mo',
        year: 2010,
        type: 'single',
        quality: 'FHD',
        lang: 'Vietsub + Thuyết Minh',
        poster_url: 'https://phimimg.com/upload/vod/20240101-1/inception-poster.jpg',
        thumb_url: 'https://phimimg.com/upload/vod/20240101-1/inception-thumb.jpg',
        content: '<p>A dream within a dream...</p>',
      },
      episodes: [
        {
          server_name: 'Vietsub #1',
          server_data: [
            {
              name: 'Full',
              slug: 'full',
              filename: 'Inception.2010.Vietsub',
              link_m3u8: 'https://s1.phimapi.com/20240101/inception/index.m3u8',
              link_embed: 'https://embed.phimapi.com/v/inception-vietsub',
            },
          ],
        },
        {
          server_name: 'Thuyết Minh #1',
          server_data: [
            {
              name: 'Full',
              slug: 'full',
              filename: 'Inception.2010.ThuyetMinh',
              link_m3u8: 'https://s2.phimapi.com/20240101/inception-tm/index.m3u8',
              link_embed: 'https://embed.phimapi.com/v/inception-thuyetminh',
            },
          ],
        },
        {
          server_name: 'Lồng Tiếng #1',
          server_data: [
            {
              name: 'Full',
              slug: 'full',
              filename: 'Inception.2010.LongTieng',
              link_m3u8: 'https://s3.phimapi.com/20240101/inception-lt/index.m3u8',
              link_embed: 'https://embed.phimapi.com/v/inception-longtieng',
            },
          ],
        },
      ],
    },
    seriesDetail: {
      status: true,
      msg: 'done',
      movie: {
        name: 'Biến Chất',
        origin_name: 'Breaking Bad',
        slug: 'bien-chat',
        year: 2008,
        type: 'series',
        quality: 'FHD',
        lang: 'Vietsub',
        poster_url: 'https://phimimg.com/upload/vod/breaking-bad-poster.jpg',
        thumb_url: 'https://phimimg.com/upload/vod/breaking-bad-thumb.jpg',
      },
      episodes: [
        {
          server_name: 'Vietsub #1',
          server_data: [
            {
              name: '1',
              slug: 'tap-1',
              link_m3u8: 'https://s1.phimapi.com/breaking-bad/ep1/index.m3u8',
              link_embed: 'https://embed.phimapi.com/v/bb-ep1',
            },
            {
              name: '2',
              slug: 'tap-2',
              link_m3u8: 'https://s1.phimapi.com/breaking-bad/ep2/index.m3u8',
              link_embed: 'https://embed.phimapi.com/v/bb-ep2',
            },
          ],
        },
      ],
    },
  },

  nguonc: {
    movieDetail: {
      status: 'success',
      movie: {
        id: 'nguonc-inc-1',
        name: 'Kẻ Đánh Cắp Giấc Mơ',
        original_name: 'Inception',
        slug: 'ke-danh-cap-giac-mo',
        total_episodes: 1,
        current_episode: 'Full',
        quality: 'HD',
        language: 'Vietsub',
        thumb_url: 'https://phim.nguonc.com/thumbs/inception.jpg',
        poster_url: 'https://phim.nguonc.com/posters/inception.jpg',
        description: 'Trộm thông tin trong giấc mơ...',
        episodes: [
          {
            server_name: 'NguonC Server Vietsub',
            items: [
              {
                name: 'Full',
                slug: 'full',
                embed: 'https://streamc.online/embed/inception-vietsub',
                m3u8: 'https://streamc.online/hls/inception/index.m3u8',
              },
            ],
          },
          {
            server_name: 'NguonC Server Thuyết Minh',
            items: [
              {
                name: 'Full',
                slug: 'full',
                embed: 'https://streamc.online/embed/inception-thuyetminh',
                m3u8: 'https://streamc.online/hls/inception-tm/index.m3u8',
              },
            ],
          },
        ],
      },
    },
  },

  vsmov: {
    sampleM3u8: 'https://streamvs.com/live/1080p/master.m3u8',
    sampleEmbedHost: 'https://vsmov.com',
  },
};

module.exports = { FIXTURES };
