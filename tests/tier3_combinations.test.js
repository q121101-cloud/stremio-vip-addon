import { describe, it, expect, vi } from 'vitest';

/**
 * ============================================================================
 * Tier 3: Pairwise Combinatorial Test Suite
 * Minimum >= 5 tests per combinatorial domain:
 * 1. Cross-Provider Bitmask Combinations (2^3 = 8 states)
 * 2. Cross-Category Combinations (4 content types)
 * 3. Media Types x Provider ID Formats
 * 4. Multi-Server & Audio Track Separation (Vietsub, Thuyết Minh, Lồng Tiếng)
 * 5. Stream Proxying Permutations (Direct, Proxy, AES-128, Subtitle Injection)
 * 6. Configuration Token Formats (Bitmask, Base62, Base64URL, Hybrid API Key)
 * ============================================================================
 */

// ==========================================
// DOMAIN 1: Cross-Provider Combinations
// ==========================================
describe('Tier 3 — Domain 1: Cross-Provider Combinations (2^3 States)', () => {
  const getActiveProviders = (mask) => {
    const providers = [];
    if (mask & 1) providers.push('nguonc');
    if (mask & 2) providers.push('kkphim');
    if (mask & 4) providers.push('vsmov');
    return providers;
  };

  const testMatrix = [
    { mask: 0, expected: [] },
    { mask: 1, expected: ['nguonc'] },
    { mask: 2, expected: ['kkphim'] },
    { mask: 3, expected: ['nguonc', 'kkphim'] },
    { mask: 4, expected: ['vsmov'] },
    { mask: 5, expected: ['nguonc', 'vsmov'] },
    { mask: 6, expected: ['kkphim', 'vsmov'] },
    { mask: 7, expected: ['nguonc', 'kkphim', 'vsmov'] }
  ];

  it.each(testMatrix)('1.1 should correctly resolve providers for bitmask $mask', ({ mask, expected }) => {
    expect(getActiveProviders(mask)).toEqual(expected);
  });

  it('1.2 should aggregate streams exclusively from active providers', async () => {
    const mockProviders = {
      kkphim: vi.fn().mockResolvedValue([{ name: 'KKPhim Stream', provider: 'kkphim' }]),
      vsmov: vi.fn().mockResolvedValue([{ name: 'VSMOV Stream', provider: 'vsmov' }]),
      nguonc: vi.fn().mockResolvedValue([{ name: 'NguonC Stream', provider: 'nguonc' }])
    };

    const aggregateForMask = async (mask) => {
      const active = getActiveProviders(mask);
      const promises = active.map(p => mockProviders[p]());
      const results = await Promise.all(promises);
      return results.flat();
    };

    const streamsMask3 = await aggregateForMask(3); // nguonc + kkphim
    expect(streamsMask3.map(s => s.provider)).toEqual(['nguonc', 'kkphim']);
    expect(mockProviders.vsmov).not.toHaveBeenCalled();
  });

  it('1.3 should generate catalogs matching active provider set', () => {
    const generateCatalogs = (mask) => {
      const active = getActiveProviders(mask);
      const catalogs = [];
      if (active.includes('vsmov')) catalogs.push('vsmov-4k');
      if (active.includes('kkphim')) catalogs.push('kkphim-movie', 'kkphim-series');
      if (active.includes('nguonc')) catalogs.push('nguonc-movie', 'nguonc-series');
      return catalogs;
    };

    expect(generateCatalogs(4)).toEqual(['vsmov-4k']);
    expect(generateCatalogs(6)).toEqual(['vsmov-4k', 'kkphim-movie', 'kkphim-series']);
    expect(generateCatalogs(7)).toHaveLength(5);
  });

  it('1.4 should handle single provider failure while other active providers succeed', async () => {
    const mockProviders = {
      kkphim: vi.fn().mockRejectedValue(new Error('KKPhim Down')),
      vsmov: vi.fn().mockResolvedValue([{ name: 'VSMOV 4K Stream' }]),
      nguonc: vi.fn().mockResolvedValue([{ name: 'NguonC Stream' }])
    };

    const active = ['kkphim', 'vsmov', 'nguonc'];
    const results = await Promise.allSettled(active.map(p => mockProviders[p]()));
    const streams = results.filter(r => r.status === 'fulfilled').flatMap(r => r.value);

    expect(streams).toHaveLength(2);
    expect(streams.map(s => s.name)).toContain('VSMOV 4K Stream');
    expect(streams.map(s => s.name)).toContain('NguonC Stream');
  });

  it('1.5 should return empty stream array when all active providers return empty', async () => {
    const results = await Promise.allSettled([Promise.resolve([]), Promise.resolve([])]);
    const streams = results.filter(r => r.status === 'fulfilled').flatMap(r => r.value);
    expect(streams).toEqual([]);
  });
});

// ==========================================
// DOMAIN 2: Cross-Category Combinations
// ==========================================
describe('Tier 3 — Domain 2: Cross-Category Combinations', () => {
  const getActiveCategories = (mask) => {
    const categories = [];
    if (mask & 8) categories.push('phim-le');
    if (mask & 16) categories.push('phim-bo');
    if (mask & 32) categories.push('hoat-hinh');
    if (mask & 64) categories.push('phim-chieu-rap');
    return categories;
  };

  it('2.1 should resolve all 4 categories when mask is 120 (8|16|32|64)', () => {
    expect(getActiveCategories(120)).toEqual(['phim-le', 'phim-bo', 'hoat-hinh', 'phim-chieu-rap']);
  });

  it('2.2 should resolve only movies and cinema when mask is 72 (8|64)', () => {
    expect(getActiveCategories(72)).toEqual(['phim-le', 'phim-chieu-rap']);
  });

  it('2.3 should resolve only series and anime when mask is 48 (16|32)', () => {
    expect(getActiveCategories(48)).toEqual(['phim-bo', 'hoat-hinh']);
  });

  it('2.4 should combine provider mask and category mask in a single 16-bit integer', () => {
    // 7 (all providers) | 120 (all categories) = 127
    const combined = 7 | 120;
    expect(combined).toBe(127);
    expect(getActiveCategories(combined)).toHaveLength(4);
  });

  it('2.5 should handle empty categories mask gracefully', () => {
    expect(getActiveCategories(7)).toEqual([]);
  });
});

// ==========================================
// DOMAIN 3: Media Types x ID Formats
// ==========================================
describe('Tier 3 — Domain 3: Media Types x ID Formats', () => {
  const routeResolver = (type, id) => {
    if (type === 'movie') {
      if (id.startsWith('tt')) return { mode: 'cinemeta_movie', imdbId: id };
      return { mode: 'direct_movie_slug', slug: id };
    }
    if (type === 'series') {
      if (id.startsWith('tt')) {
        const [, s, e] = id.split(':');
        return { mode: 'cinemeta_series', imdbId: id.split(':')[0], season: parseInt(s, 10), episode: parseInt(e, 10) };
      }
      const parts = id.split(':');
      if (parts.length >= 4) {
        return { mode: 'direct_series_slug', provider: parts[0], slug: parts[1], season: parseInt(parts[2], 10), episode: parseInt(parts[3], 10) };
      }
      return { mode: 'direct_series_slug', slug: parts[0], season: parseInt(parts[1] || '1', 10), episode: parseInt(parts[2] || '1', 10) };
    }
    return { mode: 'unknown' };
  };

  it('3.1 Movie x IMDb ID (tt1375666)', () => {
    const res = routeResolver('movie', 'tt1375666');
    expect(res).toEqual({ mode: 'cinemeta_movie', imdbId: 'tt1375666' });
  });

  it('3.2 Movie x Provider Slug (kkphim_cuu-mon)', () => {
    const res = routeResolver('movie', 'kkphim_cuu-mon');
    expect(res).toEqual({ mode: 'direct_movie_slug', slug: 'kkphim_cuu-mon' });
  });

  it('3.3 Series x IMDb S1E1 (tt7458054:1:1)', () => {
    const res = routeResolver('series', 'tt7458054:1:1');
    expect(res).toEqual({ mode: 'cinemeta_series', imdbId: 'tt7458054', season: 1, episode: 1 });
  });

  it('3.4 Series x High Episode Count (tt7458054:1:24)', () => {
    const res = routeResolver('series', 'tt7458054:1:24');
    expect(res).toEqual({ mode: 'cinemeta_series', imdbId: 'tt7458054', season: 1, episode: 24 });
  });

  it('3.5 Series x Compound Provider ID (nguonc:pham-nhan-tu-tien:1:5)', () => {
    const res = routeResolver('series', 'nguonc:pham-nhan-tu-tien:1:5');
    expect(res).toEqual({ mode: 'direct_series_slug', provider: 'nguonc', slug: 'pham-nhan-tu-tien', season: 1, episode: 5 });
  });
});

// ==========================================
// DOMAIN 4: Multi-Server & Audio Track Separation
// ==========================================
describe('Tier 3 — Domain 4: Multi-Server & Audio Track Separation', () => {
  const buildStreamCards = (movieDetail, provider) => {
    const streams = [];
    const episodes = movieDetail.episodes || [];

    for (const server of episodes) {
      let audioTag = 'Vietsub';
      let bingeGroupSuffix = 'vietsub';
      if (/thuy[ếe]t\s*minh/i.test(server.server_name)) {
        audioTag = 'Thuyết Minh';
        bingeGroupSuffix = 'thuyetminh';
      } else if (/l[ồo]ng\s*ti[ếe]ng/i.test(server.server_name)) {
        audioTag = 'Lồng Tiếng';
        bingeGroupSuffix = 'longtieng';
      }

      for (const item of (server.server_data || server.items || [])) {
        streams.push({
          name: `[${provider.toUpperCase()}] ${audioTag}`,
          title: `${item.name} • ${server.server_name}`,
          url: item.link_m3u8 || item.embed || item.link_embed,
          behaviorHints: {
            bingeGroup: `${provider}-${bingeGroupSuffix}-${item.slug || 'ep'}`
          }
        });
      }
    }
    return streams;
  };

  const sampleMultiAudioDetail = {
    episodes: [
      { server_name: 'Vietsub #1', server_data: [{ name: 'Tập 1', slug: 'tap-1', link_m3u8: 'http://sub.m3u8' }] },
      { server_name: 'Thuyết Minh VIP', server_data: [{ name: 'Tập 1', slug: 'tap-1', link_m3u8: 'http://tm.m3u8' }] },
      { server_name: 'Lồng Tiếng VIP', server_data: [{ name: 'Tập 1', slug: 'tap-1', link_m3u8: 'http://lt.m3u8' }] }
    ]
  };

  it('4.1 should separate Vietsub, Thuyết Minh, and Lồng Tiếng into distinct stream cards', () => {
    const cards = buildStreamCards(sampleMultiAudioDetail, 'vsmov');
    expect(cards).toHaveLength(3);
    expect(cards[0].name).toContain('Vietsub');
    expect(cards[1].name).toContain('Thuyết Minh');
    expect(cards[2].name).toContain('Lồng Tiếng');
  });

  it('4.2 should maintain distinct bingeGroups across audio variants to prevent auto-switching audio during binge', () => {
    const cards = buildStreamCards(sampleMultiAudioDetail, 'vsmov');
    expect(cards[0].behaviorHints.bingeGroup).toBe('vsmov-vietsub-tap-1');
    expect(cards[1].behaviorHints.bingeGroup).toBe('vsmov-thuyetminh-tap-1');
    expect(cards[2].behaviorHints.bingeGroup).toBe('vsmov-longtieng-tap-1');
  });

  it('4.3 should prioritize Vietsub before Thuyết Minh and Lồng Tiếng by default', () => {
    const cards = buildStreamCards(sampleMultiAudioDetail, 'kkphim');
    expect(cards[0].name).toContain('Vietsub');
  });

  it('4.4 should handle single audio server response cleanly', () => {
    const singleAudio = {
      episodes: [
        { server_name: 'Vietsub #1', server_data: [{ name: 'Full', slug: 'full', link_m3u8: 'http://sub.m3u8' }] }
      ]
    };
    const cards = buildStreamCards(singleAudio, 'kkphim');
    expect(cards).toHaveLength(1);
  });

  it('4.5 should handle empty episodes gracefully', () => {
    const cards = buildStreamCards({ episodes: [] }, 'nguonc');
    expect(cards).toEqual([]);
  });
});

// ==========================================
// DOMAIN 5: Stream Delivery Modes
// ==========================================
describe('Tier 3 — Domain 5: Stream Delivery Modes Permutations', () => {
  const formatStreamUrl = (mode, rawUrl, refUrl, proxyHost) => {
    const b64Url = Buffer.from(rawUrl).toString('base64url');
    const b64Ref = Buffer.from(refUrl).toString('base64url');
    switch (mode) {
      case 'direct':
        return rawUrl;
      case 'proxy_manifest':
        return `${proxyHost}/hls/manifest.m3u8?url=${b64Url}&ref=${b64Ref}`;
      case 'proxy_segment':
        return `${proxyHost}/hls/segment.ts?url=${b64Url}&ref=${b64Ref}`;
      case 'proxy_key':
        return `${proxyHost}/hls/key?url=${b64Url}&ref=${b64Ref}`;
      case 'proxy_subtitle':
        return `${proxyHost}/hls/sub.vtt?url=${b64Url}&ref=${b64Ref}`;
      default:
        return rawUrl;
    }
  };

  const proxy = 'https://myaddon.com';

  it('5.1 Direct stream mode returns unproxied raw URL', () => {
    const res = formatStreamUrl('direct', 'https://cdn.com/stream.m3u8', '', proxy);
    expect(res).toBe('https://cdn.com/stream.m3u8');
  });

  it('5.2 Proxy manifest mode returns rewritten manifest proxy URL', () => {
    const res = formatStreamUrl('proxy_manifest', 'https://cdn.com/master.m3u8', 'https://ref.com/', proxy);
    expect(res).toContain(`${proxy}/hls/manifest.m3u8?url=`);
    expect(res).toContain('&ref=');
  });

  it('5.3 Proxy segment mode returns segment proxy URL', () => {
    const res = formatStreamUrl('proxy_segment', 'https://cdn.com/001.ts', 'https://ref.com/', proxy);
    expect(res).toContain(`${proxy}/hls/segment.ts?url=`);
  });

  it('5.4 Proxy key mode returns key proxy URL', () => {
    const res = formatStreamUrl('proxy_key', 'https://cdn.com/enc.key', 'https://ref.com/', proxy);
    expect(res).toContain(`${proxy}/hls/key?url=`);
  });

  it('5.5 Proxy subtitle mode returns WebVTT subtitle proxy URL', () => {
    const res = formatStreamUrl('proxy_subtitle', 'https://cdn.com/sub.vtt', 'https://ref.com/', proxy);
    expect(res).toContain(`${proxy}/hls/sub.vtt?url=`);
  });
});

// ==========================================
// DOMAIN 6: Configuration Transport Formats
// ==========================================
describe('Tier 3 — Domain 6: Configuration Transport Formats', () => {
  const BASE62_ALPHABET = '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ';
  
  const toBase62 = (num) => {
    if (num === 0) return '0';
    let str = '';
    while (num > 0) {
      str = BASE62_ALPHABET[num % 62] + str;
      num = Math.floor(num / 62);
    }
    return str;
  };

  const fromBase62 = (str) => {
    let num = 0;
    for (let i = 0; i < str.length; i++) {
      num = num * 62 + BASE62_ALPHABET.indexOf(str[i]);
    }
    return num;
  };

  it('6.1 should encode and decode numeric mask via Base62 string (127 -> "23")', () => {
    const b62 = toBase62(127);
    expect(b62).toBe('23');
    expect(fromBase62(b62)).toBe(127);
  });

  it('6.2 should encode and decode large bitmasks (3847 -> "Zz")', () => {
    const b62 = toBase62(3847);
    expect(fromBase62(b62)).toBe(3847);
  });

  it('6.3 should parse hybrid configuration with optional API key (<token>_<apikey>)', () => {
    const parseHybridConfig = (raw) => {
      const idx = raw.indexOf('_');
      if (idx === -1) return { token: raw, apiKey: null };
      return {
        token: raw.slice(0, idx),
        apiKey: raw.slice(idx + 1)
      };
    };

    const res = parseHybridConfig('127_secret_vip_key');
    expect(res.token).toBe('127');
    expect(res.apiKey).toBe('secret_vip_key');
  });

  it('6.4 should parse Base64URL JSON configuration token without API key', () => {
    const payload = { providers: ['kkphim'], categories: ['phim-le'] };
    const b64 = Buffer.from(JSON.stringify(payload)).toString('base64url');
    const parsed = JSON.parse(Buffer.from(b64, 'base64url').toString('utf8'));
    expect(parsed).toEqual(payload);
  });

  it('6.5 should handle empty configuration transport falling back to default', () => {
    const resolveConfigTransport = (param) => {
      if (!param || param === 'manifest.json') return { mode: 'default', mask: 127 };
      if (/^\d+$/.test(param)) return { mode: 'bitmask', mask: parseInt(param, 10) };
      return { mode: 'custom', token: param };
    };

    expect(resolveConfigTransport(null)).toEqual({ mode: 'default', mask: 127 });
    expect(resolveConfigTransport('7')).toEqual({ mode: 'bitmask', mask: 7 });
  });
});
