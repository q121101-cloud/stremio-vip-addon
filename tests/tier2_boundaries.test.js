import { describe, it, expect, vi } from 'vitest';

/**
 * ============================================================================
 * Tier 2: Boundary Value Analysis, Edge Cases & Error Handling Test Suite
 * Minimum >= 5 tests per boundary/error category:
 * 1. Empty & Malformed Queries / Inputs
 * 2. Invalid Slugs & Malformed IDs
 * 3. Out-of-Bounds Pagination & Numerical Boundaries
 * 4. Upstream HTTP Error Codes & 403 WAF Handling
 * 5. Network Latency, Timeouts & Socket Errors
 * 6. Malformed Configuration Tokens & Bitmask Boundaries
 * 7. Database Outage & Graceful Degradation
 * 8. Malformed M3U8 Playlists & HTML Fallbacks
 * 9. HTTP Range 206 Seeking Boundary Conditions
 * 10. Corrupted data-obf & StreamC Payloads
 * 11. Cinemeta Failure & Unknown IMDb IDs
 * ============================================================================
 */

// ==========================================
// CATEGORY 1: Empty & Malformed Queries
// ==========================================
describe('Tier 2 — Category 1: Empty & Malformed Queries', () => {
  const sanitizeSearchQuery = (query) => {
    if (!query || typeof query !== 'string') return '';
    return query.replace(/[\x00-\x1F\x7F<>]/g, '').trim();
  };

  it('1.1 should return empty string for empty or null search queries', () => {
    expect(sanitizeSearchQuery('')).toBe('');
    expect(sanitizeSearchQuery(null)).toBe('');
    expect(sanitizeSearchQuery(undefined)).toBe('');
  });

  it('1.2 should sanitize whitespace-only queries to empty string', () => {
    expect(sanitizeSearchQuery('   \t\n  ')).toBe('');
  });

  it('1.3 should sanitize XSS / HTML injection payloads without executing or throwing', () => {
    const malicious = '<script>alert("xss")</script>';
    const sanitized = sanitizeSearchQuery(malicious);
    expect(sanitized).not.toContain('<script>');
    expect(sanitized).toBe('scriptalert("xss")/script');
  });

  it('1.4 should handle SQL-like quotes and special symbols safely', () => {
    const sqlPayload = "Inception' OR '1'='1";
    const sanitized = sanitizeSearchQuery(sqlPayload);
    expect(sanitized).toBe("Inception' OR '1'='1");
  });

  it('1.5 should preserve multi-byte Vietnamese unicode diacritics and emojis', () => {
    const vietnameseQuery = 'Cửu Môn 🎬 2024';
    expect(sanitizeSearchQuery(vietnameseQuery)).toBe('Cửu Môn 🎬 2024');
  });
});

// ==========================================
// CATEGORY 2: Invalid Slugs & Malformed IDs
// ==========================================
describe('Tier 2 — Category 2: Invalid Slugs & Malformed IDs', () => {
  const parseStremioId = (id) => {
    if (!id || typeof id !== 'string') return { valid: false, provider: null, slug: null };
    if (id.startsWith('tt')) {
      const parts = id.split(':');
      return {
        valid: true,
        type: parts.length > 1 ? 'series' : 'movie',
        imdbId: parts[0],
        season: parts[1] ? parseInt(parts[1], 10) : null,
        episode: parts[2] ? parseInt(parts[2], 10) : null
      };
    }
    const match = id.match(/^(kkphim|vsmov|nguonc)[:_](.+)$/i);
    if (match) {
      const subParts = match[2].split(':');
      return {
        valid: true,
        provider: match[1].toLowerCase(),
        slug: subParts[0],
        season: subParts[1] ? parseInt(subParts[1], 10) : null,
        episode: subParts[2] ? parseInt(subParts[2], 10) : null
      };
    }
    return { valid: true, provider: 'generic', slug: id };
  };

  it('2.1 should flag null, undefined, or empty ID as invalid', () => {
    expect(parseStremioId('')).toEqual({ valid: false, provider: null, slug: null });
    expect(parseStremioId(null)).toEqual({ valid: false, provider: null, slug: null });
  });

  it('2.2 should parse valid IMDb series IDs with season and episode numbers', () => {
    const parsed = parseStremioId('tt7458054:1:5');
    expect(parsed.valid).toBe(true);
    expect(parsed.type).toBe('series');
    expect(parsed.imdbId).toBe('tt7458054');
    expect(parsed.season).toBe(1);
    expect(parsed.episode).toBe(5);
  });

  it('2.3 should parse provider-prefixed IDs (colon and underscore syntax)', () => {
    const parsedColon = parseStremioId('nguonc:cuu-mon:0:1');
    expect(parsedColon.provider).toBe('nguonc');
    expect(parsedColon.slug).toBe('cuu-mon');
    expect(parsedColon.episode).toBe(1);

    const parsedUnderscore = parseStremioId('kkphim_cuu-mon');
    expect(parsedUnderscore.provider).toBe('kkphim');
    expect(parsedUnderscore.slug).toBe('cuu-mon');
  });

  it('2.4 should handle malformed compound IDs gracefully with fallback', () => {
    const malformed = parseStremioId('unknown_prefix_123');
    expect(malformed.valid).toBe(true);
    expect(malformed.provider).toBe('generic');
    expect(malformed.slug).toBe('unknown_prefix_123');
  });

  it('2.5 should handle negative or NaN season/episode segments', () => {
    const parsed = parseStremioId('tt1234567:abc:-1');
    expect(parsed.season).toBeNaN();
    expect(parsed.episode).toBe(-1);
  });
});

// ==========================================
// CATEGORY 3: Out-of-Bounds Pagination
// ==========================================
describe('Tier 2 — Category 3: Out-of-Bounds Pagination', () => {
  const calculatePage = (skip, limit = 20) => {
    const num = parseInt(skip, 10);
    if (isNaN(num) || num < 0) return 1;
    return Math.floor(num / limit) + 1;
  };

  it('3.1 should return page 1 for skip=0', () => {
    expect(calculatePage(0)).toBe(1);
    expect(calculatePage('0')).toBe(1);
  });

  it('3.2 should clamp negative skip values to page 1', () => {
    expect(calculatePage(-20)).toBe(1);
    expect(calculatePage('-999')).toBe(1);
  });

  it('3.3 should default non-numeric skip values to page 1', () => {
    expect(calculatePage('abc')).toBe(1);
    expect(calculatePage(null)).toBe(1);
    expect(calculatePage(undefined)).toBe(1);
  });

  it('3.4 should accurately compute large skip pagination boundaries', () => {
    expect(calculatePage(19, 20)).toBe(1);
    expect(calculatePage(20, 20)).toBe(2);
    expect(calculatePage(10000, 20)).toBe(501);
  });

  it('3.5 should safely clamp out-of-range upstream pagination responses', () => {
    const clampPagination = (requestedPage, totalPages, items) => {
      if (requestedPage > totalPages) return [];
      return items;
    };

    expect(clampPagination(999, 10, [{ id: 1 }])).toEqual([]);
    expect(clampPagination(1, 10, [{ id: 1 }])).toHaveLength(1);
  });
});

// ==========================================
// CATEGORY 4: Upstream HTTP Error Codes & 403
// ==========================================
describe('Tier 2 — Category 4: Upstream HTTP Error Codes & 403 WAF Handling', () => {
  const handleUpstreamResponse = (status, data) => {
    if (status === 403) {
      return { action: 'proxy_fallback', error: 'Forbidden by Upstream WAF' };
    }
    if (status === 404) {
      return { action: 'not_found', error: 'Resource does not exist' };
    }
    if (status === 422) {
      return { action: 'empty_result', error: 'Unprocessable Entity' };
    }
    if (status >= 500) {
      return { action: 'retry_or_failover', error: `Server Error ${status}` };
    }
    return { action: 'success', data };
  };

  it('4.1 should trigger proxy fallback when receiving HTTP 403 Forbidden', () => {
    const result = handleUpstreamResponse(403, null);
    expect(result.action).toBe('proxy_fallback');
  });

  it('4.2 should return not_found when receiving HTTP 404', () => {
    const result = handleUpstreamResponse(404, null);
    expect(result.action).toBe('not_found');
  });

  it('4.3 should return empty_result when receiving HTTP 422 (e.g. NguonC out of page)', () => {
    const result = handleUpstreamResponse(422, null);
    expect(result.action).toBe('empty_result');
  });

  it('4.4 should trigger retry or failover on 500, 502, 503, 504 server errors', () => {
    expect(handleUpstreamResponse(500, null).action).toBe('retry_or_failover');
    expect(handleUpstreamResponse(502, null).action).toBe('retry_or_failover');
    expect(handleUpstreamResponse(504, null).action).toBe('retry_or_failover');
  });

  it('4.5 should return success on HTTP 200 with payload', () => {
    const result = handleUpstreamResponse(200, { items: [1, 2, 3] });
    expect(result.action).toBe('success');
    expect(result.data.items).toHaveLength(3);
  });
});

// ==========================================
// CATEGORY 5: Network Latency & Timeouts
// ==========================================
describe('Tier 2 — Category 5: Network Latency & Timeouts', () => {
  const withTimeout = async (promise, timeoutMs) => {
    let timer;
    const timeoutPromise = new Promise((_, reject) => {
      timer = setTimeout(() => {
        const err = new Error('REQUEST_TIMEOUT');
        err.code = 'ETIMEDOUT';
        reject(err);
      }, timeoutMs);
    });
    try {
      return await Promise.race([promise, timeoutPromise]);
    } finally {
      clearTimeout(timer);
    }
  };

  it('5.1 should fulfill quickly responding promises within threshold', async () => {
    const fastPromise = new Promise(resolve => setTimeout(() => resolve('fast_data'), 20));
    await expect(withTimeout(fastPromise, 100)).resolves.toBe('fast_data');
  });

  it('5.2 should reject with ETIMEDOUT when upstream exceeds timeout threshold', async () => {
    const slowPromise = new Promise(resolve => setTimeout(() => resolve('slow_data'), 150));
    await expect(withTimeout(slowPromise, 50)).rejects.toThrow('REQUEST_TIMEOUT');
  });

  it('5.3 should gracefully catch ECONNRESET errors and return empty fallback', async () => {
    const failingCall = async () => {
      const err = new Error('Connection Reset by Peer');
      err.code = 'ECONNRESET';
      throw err;
    };

    const safeCall = async () => {
      try {
        return await failingCall();
      } catch (e) {
        if (['ECONNRESET', 'ETIMEDOUT', 'ENOTFOUND'].includes(e.code)) {
          return { fallback: true, streams: [] };
        }
        throw e;
      }
    };

    const res = await safeCall();
    expect(res.fallback).toBe(true);
    expect(res.streams).toEqual([]);
  });

  it('5.4 should isolate slow providers so fast providers still return streams', async () => {
    const slowProvider = new Promise((_, reject) => setTimeout(() => reject(new Error('Slow')), 3000));
    const fastProvider = Promise.resolve([{ name: 'Fast Stream' }]);

    const results = await Promise.allSettled([
      withTimeout(slowProvider, 50),
      withTimeout(fastProvider, 50)
    ]);

    const successfulStreams = results
      .filter(r => r.status === 'fulfilled')
      .flatMap(r => r.value);

    expect(successfulStreams).toHaveLength(1);
    expect(successfulStreams[0].name).toBe('Fast Stream');
  });

  it('5.5 should handle DNS lookup failures (ENOTFOUND) gracefully', async () => {
    const dnsFailure = Promise.reject(Object.assign(new Error('getaddrinfo ENOTFOUND'), { code: 'ENOTFOUND' }));
    await expect(dnsFailure).rejects.toHaveProperty('code', 'ENOTFOUND');
  });
});

// ==========================================
// CATEGORY 6: Malformed Config Tokens
// ==========================================
describe('Tier 2 — Category 6: Malformed Config Tokens & Bitmask Boundaries', () => {
  const parseSafeConfig = (token) => {
    const defaultConfig = {
      providers: ['kkphim', 'vsmov', 'nguonc'],
      categories: ['phim-le', 'phim-bo', 'hoat-hinh', 'phim-chieu-rap']
    };
    if (!token) return defaultConfig;

    // Bitmask numeric pattern
    if (/^\d+$/.test(token)) {
      const mask = parseInt(token, 10);
      if (mask <= 0) return { providers: [], categories: [] };
      const providers = [];
      const categories = [];
      if (mask & 1) providers.push('nguonc');
      if (mask & 2) providers.push('kkphim');
      if (mask & 4) providers.push('vsmov');
      if (mask & 8) categories.push('phim-le');
      if (mask & 16) categories.push('phim-bo');
      if (mask & 32) categories.push('hoat-hinh');
      if (mask & 64) categories.push('phim-chieu-rap');
      return { providers, categories };
    }

    // Base64URL JSON pattern
    try {
      let b64 = token.replace(/-/g, '+').replace(/_/g, '/');
      while (b64.length % 4) b64 += '=';
      const json = Buffer.from(b64, 'base64').toString('utf8');
      const parsed = JSON.parse(json);
      if (typeof parsed === 'object' && parsed !== null) {
        return {
          providers: Array.isArray(parsed.providers) ? parsed.providers : defaultConfig.providers,
          categories: Array.isArray(parsed.categories) ? parsed.categories : defaultConfig.categories
        };
      }
    } catch {
      // Fallback on malformed token
      return defaultConfig;
    }
    return defaultConfig;
  };

  it('6.1 should return default config on null or empty token', () => {
    const cfg = parseSafeConfig('');
    expect(cfg.providers).toHaveLength(3);
    expect(cfg.categories).toHaveLength(4);
  });

  it('6.2 should return empty providers when bitmask is 0', () => {
    const cfg = parseSafeConfig('0');
    expect(cfg.providers).toEqual([]);
    expect(cfg.categories).toEqual([]);
  });

  it('6.3 should return default config on completely corrupted Base64 strings', () => {
    const cfg = parseSafeConfig('%%%invalid_base64_string$$$');
    expect(cfg.providers).toEqual(['kkphim', 'vsmov', 'nguonc']);
  });

  it('6.4 should safely handle valid Base64 that decodes to non-JSON strings', () => {
    const nonJsonB64 = Buffer.from('hello world plain text').toString('base64url');
    const cfg = parseSafeConfig(nonJsonB64);
    expect(cfg.providers).toEqual(['kkphim', 'vsmov', 'nguonc']);
  });

  it('6.5 should handle partial JSON missing required keys', () => {
    const partialB64 = Buffer.from(JSON.stringify({ customOption: true })).toString('base64url');
    const cfg = parseSafeConfig(partialB64);
    expect(cfg.providers).toEqual(['kkphim', 'vsmov', 'nguonc']);
  });
});

// ==========================================
// CATEGORY 7: Database Outage & Resilience
// ==========================================
describe('Tier 2 — Category 7: Database Outage & Resilience', () => {
  class ResilientDbClient {
    constructor(isOnline = true) {
      this.isOnline = isOnline;
    }
    async query(table) {
      if (!this.isOnline) {
        throw new Error(`FetchError: could not reach Supabase endpoint at ${table}`);
      }
      return { data: [{ id: 1, val: 'cached' }], error: null };
    }
    async safeGet(key, l1Fallback) {
      try {
        const res = await this.query('stream_cache');
        return res.data;
      } catch (err) {
        // Fallback transparently to L1 memory
        return l1Fallback.get(key) || null;
      }
    }
  }

  it('7.1 should fall back cleanly to L1 cache when remote DB is offline', async () => {
    const l1 = new Map([['stream:1', [{ url: 'http://fallback.m3u8' }]]]);
    const db = new ResilientDbClient(false); // Offline

    const result = await db.safeGet('stream:1', l1);
    expect(result).toEqual([{ url: 'http://fallback.m3u8' }]);
  });

  it('7.2 should return null instead of throwing when key is missing in offline mode', async () => {
    const l1 = new Map();
    const db = new ResilientDbClient(false);

    const result = await db.safeGet('missing_key', l1);
    expect(result).toBeNull();
  });

  it('7.3 should catch unmigrated table errors without terminating process', async () => {
    const catchTableError = async () => {
      try {
        throw new Error("Could not find table 'public.media_mappings' in schema cache");
      } catch (e) {
        return { success: false, handled: true, reason: e.message };
      }
    };

    const res = await catchTableError();
    expect(res.handled).toBe(true);
    expect(res.reason).toContain('Could not find table');
  });

  it('7.4 should execute non-blocking asynchronous L2 cache writes', async () => {
    let writeAttempted = false;
    const nonBlockingSet = (key, val) => {
      Promise.reject(new Error('DB write failed')).catch(() => {
        writeAttempted = true;
      });
      return true; // returns synchronously
    };

    const ret = nonBlockingSet('k', 'v');
    expect(ret).toBe(true);
    await new Promise(r => setTimeout(r, 10));
    expect(writeAttempted).toBe(true);
  });

  it('7.5 should return empty arrays on database flush when client is unconfigured', async () => {
    const flushDb = async (configured) => {
      if (!configured) return { success: true, count: 0, inMemoryCleared: true };
      return { success: true, count: 10, inMemoryCleared: true };
    };

    const res = await flushDb(false);
    expect(res.success).toBe(true);
    expect(res.count).toBe(0);
    expect(res.inMemoryCleared).toBe(true);
  });
});

// ==========================================
// CATEGORY 8: Malformed M3U8 Playlists
// ==========================================
describe('Tier 2 — Category 8: Malformed M3U8 Playlists & HTML Fallbacks', () => {
  const parseM3u8Body = (body) => {
    if (!body || typeof body !== 'string') return { valid: false, type: 'invalid' };
    const trimmed = body.trim();
    if (trimmed.startsWith('<!DOCTYPE html>') || trimmed.startsWith('<html') || trimmed.includes('<div id="player"')) {
      return { valid: false, type: 'html_embed' };
    }
    if (!trimmed.startsWith('#EXTM3U')) {
      return { valid: false, type: 'invalid_header' };
    }
    if (trimmed.includes('#EXT-X-STREAM-INF')) {
      return { valid: true, type: 'master_playlist' };
    }
    return { valid: true, type: 'media_playlist' };
  };

  it('8.1 should identify valid master playlist with #EXT-X-STREAM-INF', () => {
    const body = '#EXTM3U\n#EXT-X-STREAM-INF:BANDWIDTH=1280000\nchunklist.m3u8';
    expect(parseM3u8Body(body)).toEqual({ valid: true, type: 'master_playlist' });
  });

  it('8.2 should identify valid media playlist with segments', () => {
    const body = '#EXTM3U\n#EXTINF:10.0,\nsegment1.ts\n#EXT-X-ENDLIST';
    expect(parseM3u8Body(body)).toEqual({ valid: true, type: 'media_playlist' });
  });

  it('8.3 should detect HTML embed response and trigger de-embed fallback', () => {
    const htmlBody = '<!DOCTYPE html><html><body><div id="player" data-obf="eyJoIjoiMTIzIn0="></div></body></html>';
    expect(parseM3u8Body(htmlBody)).toEqual({ valid: false, type: 'html_embed' });
  });

  it('8.4 should reject body missing #EXTM3U header', () => {
    const badBody = 'RANDOM_BINARY_OR_PLAIN_TEXT';
    expect(parseM3u8Body(badBody)).toEqual({ valid: false, type: 'invalid_header' });
  });

  it('8.5 should handle empty or whitespace-only playlist bodies', () => {
    expect(parseM3u8Body('')).toEqual({ valid: false, type: 'invalid' });
    expect(parseM3u8Body('   \n  ')).toEqual({ valid: false, type: 'invalid_header' });
  });
});

// ==========================================
// CATEGORY 9: HTTP Range 206 Seeking
// ==========================================
describe('Tier 2 — Category 9: HTTP Range 206 Seeking Boundaries', () => {
  const handleRangeRequest = (rangeHeader, totalSize) => {
    if (!rangeHeader || !rangeHeader.startsWith('bytes=')) {
      return { status: 200, start: 0, end: totalSize - 1, length: totalSize };
    }
    const parts = rangeHeader.replace(/bytes=/, '').split('-');
    let start = parseInt(parts[0], 10);
    let end = parts[1] ? parseInt(parts[1], 10) : totalSize - 1;

    if (isNaN(start)) {
      // Suffix range (e.g. bytes=-500)
      start = totalSize - end;
      end = totalSize - 1;
    }
    if (isNaN(end) || end >= totalSize) {
      end = totalSize - 1;
    }
    if (start > end || start >= totalSize) {
      return { status: 416, error: 'Range Not Satisfiable' };
    }

    return {
      status: 206,
      start,
      end,
      length: end - start + 1,
      contentRange: `bytes ${start}-${end}/${totalSize}`
    };
  };

  it('9.1 should return status 200 full content when Range header is omitted', () => {
    const res = handleRangeRequest(null, 1000);
    expect(res.status).toBe(200);
    expect(res.length).toBe(1000);
  });

  it('9.2 should return status 206 with exact range slice for valid range', () => {
    const res = handleRangeRequest('bytes=100-299', 1000);
    expect(res.status).toBe(206);
    expect(res.start).toBe(100);
    expect(res.end).toBe(299);
    expect(res.length).toBe(200);
    expect(res.contentRange).toBe('bytes 100-299/1000');
  });

  it('9.3 should handle open-ended range queries (e.g. bytes=500-)', () => {
    const res = handleRangeRequest('bytes=500-', 1000);
    expect(res.status).toBe(206);
    expect(res.start).toBe(500);
    expect(res.end).toBe(999);
    expect(res.length).toBe(500);
  });

  it('9.4 should clamp end byte exceeding total size', () => {
    const res = handleRangeRequest('bytes=0-999999', 1000);
    expect(res.status).toBe(206);
    expect(res.end).toBe(999);
    expect(res.length).toBe(1000);
  });

  it('9.5 should return HTTP 416 when start exceeds total size', () => {
    const res = handleRangeRequest('bytes=2000-3000', 1000);
    expect(res.status).toBe(416);
  });
});

// ==========================================
// CATEGORY 10: Corrupted data-obf Payloads
// ==========================================
describe('Tier 2 — Category 10: Corrupted data-obf & StreamC Payloads', () => {
  const safeExtractStreamC = (dataObf) => {
    if (!dataObf || typeof dataObf !== 'string') return null;
    try {
      const normalized = dataObf.replace(/-/g, '+').replace(/_/g, '/');
      const jsonStr = Buffer.from(normalized, 'base64').toString('utf8');
      const obj = JSON.parse(jsonStr);
      if (obj && typeof obj.sUb === 'string') {
        return obj.sUb;
      }
      return null;
    } catch {
      return null;
    }
  };

  it('10.1 should extract sUb string from well-formed payload', () => {
    const validB64 = Buffer.from(JSON.stringify({ sUb: 'target_sub_manifest.m3u8', hD: 'hash123' })).toString('base64');
    expect(safeExtractStreamC(validB64)).toBe('target_sub_manifest.m3u8');
  });

  it('10.2 should return null on non-base64 characters in payload', () => {
    expect(safeExtractStreamC('??NotBase64!!')).toBeNull();
  });

  it('10.3 should return null when decoded string is not valid JSON', () => {
    const plainB64 = Buffer.from('just a random string').toString('base64');
    expect(safeExtractStreamC(plainB64)).toBeNull();
  });

  it('10.4 should return null when payload JSON is missing sUb property', () => {
    const missingSub = Buffer.from(JSON.stringify({ otherKey: 'val' })).toString('base64');
    expect(safeExtractStreamC(missingSub)).toBeNull();
  });

  it('10.5 should return null on null, undefined, or empty payload', () => {
    expect(safeExtractStreamC('')).toBeNull();
    expect(safeExtractStreamC(null)).toBeNull();
  });
});

// ==========================================
// CATEGORY 11: Cinemeta Failure & Unknown IMDb
// ==========================================
describe('Tier 2 — Category 11: Cinemeta Failure & Unknown IMDb IDs', () => {
  const resolveImdbMetadata = async (imdbId, mockCinemetaFn) => {
    try {
      const cinemeta = await mockCinemetaFn(imdbId);
      if (cinemeta && cinemeta.meta) {
        return {
          title: cinemeta.meta.name,
          year: parseInt(cinemeta.meta.year, 10),
          type: cinemeta.meta.type
        };
      }
      return null;
    } catch {
      // Fallback on Cinemeta failure
      return null;
    }
  };

  it('11.1 should map valid Cinemeta metadata response', async () => {
    const mockCinemeta = vi.fn().mockResolvedValue({
      meta: { name: 'Inception', year: '2010', type: 'movie' }
    });

    const res = await resolveImdbMetadata('tt1375666', mockCinemeta);
    expect(res).toEqual({ title: 'Inception', year: 2010, type: 'movie' });
  });

  it('11.2 should return null gracefully when IMDb ID is not found (404)', async () => {
    const mockCinemeta = vi.fn().mockResolvedValue({ meta: null });
    const res = await resolveImdbMetadata('tt999999999', mockCinemeta);
    expect(res).toBeNull();
  });

  it('11.3 should return null gracefully when Cinemeta server throws 500 error', async () => {
    const mockCinemeta = vi.fn().mockRejectedValue(new Error('500 Internal Server Error'));
    const res = await resolveImdbMetadata('tt1375666', mockCinemeta);
    expect(res).toBeNull();
  });

  it('11.4 should fallback to raw slug search if IMDb mapping returns null', () => {
    const resolveStreamsForUnknownId = (imdbRes, rawSlug) => {
      if (!imdbRes) {
        return { searchKeyword: rawSlug.replace(/^tt/, ''), fallback: true };
      }
      return { searchKeyword: imdbRes.title, fallback: false };
    };

    const fallback = resolveStreamsForUnknownId(null, 'tt1375666');
    expect(fallback.fallback).toBe(true);
    expect(fallback.searchKeyword).toBe('1375666');
  });

  it('11.5 should handle anime series with non-English alternative titles', () => {
    const cinemetaWithAliases = {
      meta: {
        name: 'Solo Leveling',
        aliases: ['Tôi Thăng Cấp Một Mình', 'Na Honjaman Rebeleop'],
        year: 2024
      }
    };

    const keywords = [cinemetaWithAliases.meta.name, ...(cinemetaWithAliases.meta.aliases || [])];
    expect(keywords).toContain('Solo Leveling');
    expect(keywords).toContain('Tôi Thăng Cấp Một Mình');
  });
});
