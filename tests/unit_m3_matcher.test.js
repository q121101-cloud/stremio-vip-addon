'use strict';

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
const axios = require('axios');
const { cache, flushCache } = require('../src/db/cache');
const { CinemetaService, cinemetaService, KNOWN_TITLE_LOCALIZATIONS } = require('../src/services/cinemeta');
const {
  stripDiacritics,
  convertRomanNumerals,
  normalizeTitle,
  cleanSearchKeywords,
  generateSearchVariants,
  levenshteinDistance,
  normalizedLevenshtein,
  diceCoefficient,
  tokenizeWords,
  tokenSetRatio,
  calculateTitleSimilarity,
  parseEpisodeNumber,
  findTargetEpisodeItem,
  scoreCandidate,
  findBestMatch,
  ROMAN_MAP,
  VIETNAMESE_STOPWORDS
} = require('../src/services/matcher');
const {
  getStreamCache,
  setStreamCache,
  getImdbMapping,
  setImdbMapping,
  deleteStreamCache,
  flushDatabaseCache,
  isConfigured,
  isSupabaseAvailable,
  CIRCUIT_BREAKER,
  safeDbCall,
  supabaseClient
} = require('../src/db/supabase');
const { parseArgs, main } = require('../scripts/flush_cache');

describe('Milestone M3 Unit Test Suite: Universal Cinemeta Matcher & Multi-Tier Caching', () => {

  beforeEach(() => {
    flushCache();
    vi.restoreAllMocks();
    CIRCUIT_BREAKER.reset();
  });

  afterEach(() => {
    flushCache();
    vi.restoreAllMocks();
  });

  // ==========================================
  // SECTION 1: Cinemeta Service & Compound ID Parser
  // ==========================================
  describe('1. Cinemeta Service & Compound ID Parser', () => {

    it('1.1 should deconstruct movie and compound series IDs accurately', () => {
      const movie = cinemetaService.parseId('tt1375666', 'movie');
      expect(movie).toEqual({
        imdbId: 'tt1375666',
        type: 'movie',
        season: 1,
        episode: 1,
        isCompound: false
      });

      const seriesCompound = cinemetaService.parseId('tt7458054:2:10');
      expect(seriesCompound).toEqual({
        imdbId: 'tt7458054',
        type: 'series',
        season: 2,
        episode: 10,
        isCompound: true
      });

      const shortCompound = cinemetaService.parseId('tt7458054:5');
      expect(shortCompound).toEqual({
        imdbId: 'tt7458054',
        type: 'series',
        season: 1,
        episode: 5,
        isCompound: true
      });

      const withJsonSuffix = cinemetaService.parseId('tt1375666.json');
      expect(withJsonSuffix?.imdbId).toBe('tt1375666');

      // Clamping zero / negative indices
      const clamped = cinemetaService.parseId('tt7458054:0:0');
      expect(clamped?.season).toBe(1);
      expect(clamped?.episode).toBe(1);

      expect(cinemetaService.parseId(null)).toBeNull();
      expect(cinemetaService.parseId('')).toBeNull();
      expect(cinemetaService.parseId('kkphim:cuu-mon')).toBeNull();
      expect(cinemetaService.parseId('invalid_id')).toBeNull();
    });

    it('1.2 should extract release years from diverse metadata formats', () => {
      expect(cinemetaService.extractYear({ year: 2024 })).toBe(2024);
      expect(cinemetaService.extractYear({ year: '2010' })).toBe(2010);
      expect(cinemetaService.extractYear({ releaseInfo: '2008–2013' })).toBe(2008);
      expect(cinemetaService.extractYear({ releaseInfo: '2019-2022' })).toBe(2019);
      expect(cinemetaService.extractYear({ released: '2019-11-20T00:00:00.000Z' })).toBe(2019);
      expect(cinemetaService.extractYear({ first_aired: '1999-05-10' })).toBe(1999);
      expect(cinemetaService.extractYear({})).toBeUndefined();
      expect(cinemetaService.extractYear(null)).toBeUndefined();
      expect(cinemetaService.extractYear({ year: 'N/A' })).toBeUndefined();
    });

    it('1.3 should normalize genres and IMDb ratings', () => {
      expect(cinemetaService.extractGenres({ genres: ['Action', 'Sci-Fi'] })).toEqual(['Action', 'Sci-Fi']);
      expect(cinemetaService.extractGenres({ genre: 'Drama, Romance' })).toEqual(['Drama', 'Romance']);
      expect(cinemetaService.extractGenres({ genre: ['Animation', 'Comedy'] })).toEqual(['Animation', 'Comedy']);
      expect(cinemetaService.extractGenres({})).toEqual([]);
      expect(cinemetaService.extractGenres(null)).toEqual([]);

      expect(cinemetaService.extractRating({ imdbRating: '8.8' })).toBe(8.8);
      expect(cinemetaService.extractRating({ imdbRating: 9.5 })).toBe(9.5);
      expect(cinemetaService.extractRating({ imdbRating: 'N/A' })).toBeNull();
      expect(cinemetaService.extractRating({})).toBeNull();
      expect(cinemetaService.extractRating(null)).toBeNull();
    });

    it('1.4 should fetch Cinemeta metadata and populate L1 cache', async () => {
      const mockMeta = {
        id: 'tt1375666',
        type: 'movie',
        name: 'Inception',
        year: '2010',
        genres: ['Action', 'Sci-Fi'],
        imdbRating: '8.8',
        description: 'A thief who steals corporate secrets...',
        poster: 'https://images.metahub.space/poster/tt1375666.jpg'
      };

      const getSpy = vi.spyOn(axios, 'get').mockResolvedValueOnce({
        data: { meta: mockMeta }
      });

      const meta = await cinemetaService.getMeta('movie', 'tt1375666');
      expect(meta).toBeDefined();
      expect(meta?.name).toBe('Inception');
      expect(meta?.year).toBe(2010);
      expect(meta?.imdbRating).toBe(8.8);

      // Verify cached in L1
      const cached = cache.get('cinemeta:meta:movie:tt1375666');
      expect(cached).toEqual(meta);

      // Second call should hit L1 without calling axios
      const secondCall = await cinemetaService.getMeta('movie', 'tt1375666');
      expect(secondCall?.name).toBe('Inception');
      expect(getSpy).toHaveBeenCalledTimes(1);
    });

    it('1.5 should deduplicate concurrent single-flight requests', async () => {
      const mockMeta = { id: 'tt0903747', name: 'Breaking Bad', year: 2008, type: 'series' };
      const getSpy = vi.spyOn(axios, 'get').mockImplementation(async () => {
        await new Promise((r) => setTimeout(r, 50));
        return { data: { meta: mockMeta } };
      });

      // Launch 10 simultaneous requests
      const promises = Array(10).fill(0).map(() => cinemetaService.getMeta('series', 'tt0903747'));
      const results = await Promise.all(promises);

      expect(results.length).toBe(10);
      results.forEach((r) => expect(r?.name).toBe('Breaking Bad'));
      expect(getSpy).toHaveBeenCalledTimes(1);
    });

    it('1.6 should gracefully fallback to static dictionary on 404 or empty response', async () => {
      vi.spyOn(axios, 'get').mockRejectedValueOnce(new Error('Request failed with status code 404'));

      // tt7458054 is While You Were Sleeping in KNOWN_TITLE_LOCALIZATIONS
      const meta = await cinemetaService.getMeta('series', 'tt7458054');
      expect(meta).toBeDefined();
      expect(meta?.name).toBe('While You Were Sleeping');
      expect(meta?.aliases).toContain('Khi Nàng Say Giấc');
      expect(meta?.year).toBe(2017);
    });

    it('1.7 should construct full MatcherMetadata object', async () => {
      vi.spyOn(axios, 'get').mockResolvedValueOnce({
        data: {
          meta: {
            id: 'tt1375666',
            name: 'Inception',
            year: 2010,
            genres: ['Action', 'Adventure', 'Sci-Fi'],
            imdbRating: 8.8,
            aliases: ['Inception: The IMAX Experience']
          }
        }
      });

      const matcherMeta = await cinemetaService.getMetadataForMatcher('movie', 'tt1375666');
      expect(matcherMeta).toBeDefined();
      expect(matcherMeta?.title).toBe('Inception');
      expect(matcherMeta?.vietnameseTitle).toBe('Kẻ Đánh Cắp Giấc Mơ');
      expect(matcherMeta?.aliases).toContain('Kẻ Đánh Cắp Giấc Mơ');
      expect(matcherMeta?.aliases).toContain('Inception: The IMAX Experience');
      expect(matcherMeta?.season).toBe(1);
      expect(matcherMeta?.episode).toBe(1);
    });

    it('1.8 should return null for non-existent IDs without unhandled errors', async () => {
      vi.spyOn(axios, 'get').mockRejectedValueOnce(new Error('500 Internal Server Error'));
      const meta = await cinemetaService.getMeta('movie', 'tt9999999999');
      expect(meta).toBeNull();
    });
  });

  // ==========================================
  // SECTION 2: Vietnamese Title Normalization & Fuzzy Algorithms
  // ==========================================
  describe('2. Vietnamese Title Normalization & Fuzzy Algorithms', () => {

    it('2.1 should strip diacritics including đ/Đ, tone marks, and typographic quotes', () => {
      expect(stripDiacritics('Kẻ Đánh Cắp Giấc Mơ')).toBe('Ke Danh Cap Giac Mo');
      expect(stripDiacritics('Đào, Phở và Piano')).toBe('Dao, Pho va Piano');
      expect(stripDiacritics('“Người Nhện: Không Còn Nhà”')).toBe('"Nguoi Nhen: Khong Con Nha"');
      expect(stripDiacritics('Phần 1 – Tập 5')).toBe('Phan 1 - Tap 5');
      expect(stripDiacritics('Cửu Môn ‘Bản Đẹp’')).toBe("Cuu Mon 'Ban Dep'");
      expect(stripDiacritics('')).toBe('');
      expect(stripDiacritics(null)).toBe('');
    });

    it('2.2 should exhaustively verify all Vietnamese tone letters stripping', () => {
      const allVowelsWithTones = 'aáàảãạăắằẳẵặâấầẩẫậeéèẻẽẹêếềểễệiíìỉĩịoóòỏõọôốồổỗộơớờởỡợuúùủũụưứừửữựyýỳỷỹỵđĐ';
      const stripped = stripDiacritics(allVowelsWithTones);
      expect(stripped).toBe('aaaaaaaaaaaaaaaaaaeeeeeeeeeeeeiiiiiioooooooooooooooooouuuuuuuuuuuuyyyyyydD');
    });

    it('2.3 should convert Roman numerals contextually', () => {
      expect(convertRomanNumerals('Taxi Driver II')).toBe('Taxi Driver 2');
      expect(convertRomanNumerals('Rocky IV')).toBe('Rocky 4');
      expect(convertRomanNumerals('Phần III')).toBe('Phần 3');
      expect(convertRomanNumerals('Mùa I Tập 5')).toBe('Mùa 1 Tập 5');
      expect(convertRomanNumerals('Phần I - Tập 1')).toBe('Phần 1 - Tập 1');
      expect(convertRomanNumerals('Avatar : II')).toBe('Avatar : 2');
      expect(convertRomanNumerals('Avatar: VIII')).toBe('Avatar: 8');
      expect(convertRomanNumerals('Star Wars: Episode IX')).toBe('Star Wars: Episode 9');
      expect(convertRomanNumerals('Final Fantasy X')).toBe('Final Fantasy 10');
      expect(convertRomanNumerals('Chapter XX')).toBe('Chapter 20');

      // English words with Roman letters must NOT be corrupted
      expect(convertRomanNumerals('I Am Legend')).toBe('I Am Legend');
      expect(convertRomanNumerals('Idea and Innovation')).toBe('Idea and Innovation');
      expect(convertRomanNumerals('Video of Six Dogs')).toBe('Video of Six Dogs');
      expect(convertRomanNumerals('')).toBe('');
      expect(convertRomanNumerals(null)).toBe('');
    });

    it('2.4 should normalize title into clean slug', () => {
      expect(normalizeTitle('Kẻ Đánh Cắp Giấc Mơ')).toBe('ke-danh-cap-giac-mo');
      expect(normalizeTitle('Taxi Driver II: Special Edition')).toBe('taxi-driver-2-special-edition');
      expect(normalizeTitle('Đại Chiến Titan (Phần 3)')).toBe('dai-chien-titan-phan-3');
      expect(normalizeTitle('Avatar: Dòng Chảy Của Nước')).toBe('avatar-dong-chay-cua-nuoc');
      expect(normalizeTitle('')).toBe('');
      expect(normalizeTitle(null)).toBe('');
    });

    it('2.5 should clean search keywords by stripping years and Vietnamese stopwords', () => {
      expect(cleanSearchKeywords('Inception (2010)')).toBe('inception');
      expect(cleanSearchKeywords('Phim Bố Già Vietsub Thuyết Minh HD (2021)')).toBe('bo gia');
      expect(cleanSearchKeywords('Trò Chơi Con Mực Trọn Bộ 4K Full')).toBe('tro choi con muc');
      expect(cleanSearchKeywords('Xem Phim Hoạt Hình Anime Đôrêmon Lồng Tiếng [2020]')).toBe('doremon');
      expect(cleanSearchKeywords('')).toBe('');
    });

    it('2.6 should generate search query candidate variants', () => {
      const meta = {
        id: 'tt7458054',
        name: 'While You Were Sleeping',
        aliases: ['Khi Nang Say Giac']
      };

      const variants = generateSearchVariants(meta);
      expect(variants).toContain('While You Were Sleeping');
      expect(variants).toContain('Khi Nàng Say Giấc');
      expect(variants).toContain('Khi Nang Say Giac');
      expect(variants.length).toBeGreaterThanOrEqual(3);

      expect(generateSearchVariants(null)).toEqual([]);
    });

    it('2.7 should compute Levenshtein, Sørensen-Dice, and Token Set Ratio correctly', () => {
      // Levenshtein
      expect(levenshteinDistance('kitten', 'sitting')).toBe(3);
      expect(levenshteinDistance('', 'hello')).toBe(5);
      expect(levenshteinDistance('hello', '')).toBe(5);
      expect(normalizedLevenshtein('test', 'test')).toBe(1.0);
      expect(normalizedLevenshtein('', '')).toBe(1.0);

      // Dice
      const dice = diceCoefficient('inception', 'inception');
      expect(dice).toBe(1.0);
      expect(diceCoefficient('abc', 'xyz')).toBe(0.0);
      expect(diceCoefficient('', 'hello')).toBe(0.0);

      // Token Set Ratio (Subset title match)
      const subsetScore = tokenSetRatio('While You Were Sleeping', 'Khi Nang Say Giac - While You Were Sleeping Vietsub');
      expect(subsetScore).toBe(1.0);

      const titleSim = calculateTitleSimilarity('While You Were Sleeping', 'Khi Nang Say Giac - While You Were Sleeping');
      expect(titleSim).toBeGreaterThanOrEqual(0.9);
      expect(calculateTitleSimilarity('', 'abc')).toBe(0.0);
    });

    it('2.8 should score candidate matches and select best candidate above threshold', () => {
      const cinemetaMeta = {
        id: 'tt7458054',
        name: 'While You Were Sleeping',
        year: 2017,
        type: 'series'
      };

      const candidates = [
        { name: 'Khi Nàng Say Giấc', slug: 'khi-nang-say-giac', year: 2017, type: 'series' },
        { name: 'Trong Giấc Mơ', slug: 'trong-giac-mo', year: 2010, type: 'movie' },
        { name: 'Batman Begins', slug: 'batman-begins', year: 2005, type: 'movie' }
      ];

      const match = findBestMatch(cinemetaMeta, candidates, 0.70);
      expect(match).toBeDefined();
      expect(match?.meta.slug).toBe('khi-nang-say-giac');
      expect(match?.score).toBeGreaterThanOrEqual(0.70);

      // Direct IMDb match gives 1.0
      const directMatchScore = scoreCandidate(cinemetaMeta, { name: 'Random Title', imdbId: 'tt7458054' });
      expect(directMatchScore).toBe(1.0);

      // Type mismatch penalty
      const movieCandidate = { name: 'While You Were Sleeping', year: 2017, type: 'movie' };
      const seriesCandidate = { name: 'While You Were Sleeping', year: 2017, type: 'series' };
      expect(scoreCandidate(cinemetaMeta, seriesCandidate)).toBeGreaterThan(scoreCandidate(cinemetaMeta, movieCandidate));

      // findBestMatch with empty array or no matching candidate
      expect(findBestMatch(cinemetaMeta, [])).toBeNull();
      expect(findBestMatch(cinemetaMeta, [{ name: 'Unrelated Movie', year: 1980, type: 'movie' }], 0.95)).toBeNull();
    });
  });

  // ==========================================
  // SECTION 3: Series Episode and Season Parsing
  // ==========================================
  describe('3. Series Episode and Season Parsing', () => {

    it('3.1 should parse all Vietnamese and standard episode formats', () => {
      expect(parseEpisodeNumber('Tập 5')).toEqual({ season: 1, episode: 5, isSpecial: false, isFull: false });
      expect(parseEpisodeNumber('Tap 05')).toEqual({ season: 1, episode: 5, isSpecial: false, isFull: false });
      expect(parseEpisodeNumber('Ep 12 (Vietsub)')).toEqual({ season: 1, episode: 12, isSpecial: false, isFull: false });
      expect(parseEpisodeNumber('Phần 2 - Tập 3')).toEqual({ season: 2, episode: 3, isSpecial: false, isFull: false });
      expect(parseEpisodeNumber('Mùa 3 Tập 15')).toEqual({ season: 3, episode: 15, isSpecial: false, isFull: false });
      expect(parseEpisodeNumber('S02E08')).toEqual({ season: 2, episode: 8, isSpecial: false, isFull: false });
      expect(parseEpisodeNumber('s01e01')).toEqual({ season: 1, episode: 1, isSpecial: false, isFull: false });
      expect(parseEpisodeNumber('Tập Full')).toEqual({ season: 1, episode: 1, isSpecial: false, isFull: true });
      expect(parseEpisodeNumber('Full HD')).toEqual({ season: 1, episode: 1, isSpecial: false, isFull: true });
      expect(parseEpisodeNumber('Tập Đặc Biệt 2')).toEqual({ season: 0, episode: 2, isSpecial: true, isFull: false });
      expect(parseEpisodeNumber('OVA 1')).toEqual({ season: 0, episode: 1, isSpecial: true, isFull: false });
      expect(parseEpisodeNumber('Ngoại truyện 3')).toEqual({ season: 0, episode: 3, isSpecial: true, isFull: false });
      expect(parseEpisodeNumber('Tập 1 - 2')).toEqual({ season: 1, episode: 1, rangeEnd: 2, isSpecial: false, isFull: false });
      expect(parseEpisodeNumber('Ep 05-08')).toEqual({ season: 1, episode: 5, rangeEnd: 8, isSpecial: false, isFull: false });
      expect(parseEpisodeNumber('07')).toEqual({ season: 1, episode: 7, isSpecial: false, isFull: false });
      expect(parseEpisodeNumber('')).toEqual({ season: 1, episode: 1, isSpecial: false, isFull: false });
      expect(parseEpisodeNumber(null)).toEqual({ season: 1, episode: 1, isSpecial: false, isFull: false });
    });

    it('3.2 should locate target episode item in server array with fallbacks', () => {
      const serverData = [
        { name: 'Tập 1', slug: 'tap-1', link_m3u8: 'http://ep1.m3u8' },
        { name: 'Tập 2', slug: 'tap-2', link_m3u8: 'http://ep2.m3u8' },
        { name: 'Tập 3 - 4', slug: 'tap-3-4', link_m3u8: 'http://ep3-4.m3u8' },
        { name: 'Phần 2 - Tập 1', slug: 'p2-tap-1', link_m3u8: 'http://p2-ep1.m3u8' }
      ];

      // Exact episode match
      expect(findTargetEpisodeItem(serverData, 1, 2, 'series')?.slug).toBe('tap-2');

      // Range match: episode 4 should match 'Tập 3 - 4'
      expect(findTargetEpisodeItem(serverData, 1, 4, 'series')?.slug).toBe('tap-3-4');

      // Exact season 2 episode 1 match
      expect(findTargetEpisodeItem(serverData, 2, 1, 'series')?.slug).toBe('p2-tap-1');

      // 1-based index fallback
      expect(findTargetEpisodeItem(serverData, 1, 3, 'series')?.slug).toBe('tap-3-4');

      // Movie full match
      const movieData = [
        { name: 'Bản Cam', slug: 'ban-cam' },
        { name: 'Full HD Vietsub', slug: 'full-hd' }
      ];
      expect(findTargetEpisodeItem(movieData, 1, 1, 'movie')?.slug).toBe('full-hd');

      // Null / empty server data
      expect(findTargetEpisodeItem([], 1, 1)).toBeNull();
      expect(findTargetEpisodeItem(null, 1, 1)).toBeNull();
    });
  });

  // ==========================================
  // SECTION 4: Supabase Client & Multi-Tier Caching
  // ==========================================
  describe('4. Supabase Client & Multi-Tier Caching', () => {

    it('4.1 should return streams from L1 in <1ms without DB lookup', async () => {
      const testKey = 'stream:movie:tt1375666';
      const mockStreams = [{ name: 'VSMOV 4K', title: 'Inception 4K', url: 'https://vsmov.com/live.m3u8' }];

      await setStreamCache(testKey, mockStreams);

      const start = Date.now();
      const cached = await getStreamCache(testKey);
      const duration = Date.now() - start;

      expect(duration).toBeLessThan(10);
      expect(cached).toEqual(mockStreams);
    });

    it('4.2 should save and retrieve IMDb mappings across L1 cache', async () => {
      const mapping = {
        type: 'movie',
        title: 'Inception',
        year: 2010,
        slugKkphim: 'ke-danh-cap-giac-mo',
        slugVsmov: 'inception-2010',
        slugNguonc: 'ke-danh-cap-giac-mo-2010',
        aliases: ['Kẻ Đánh Cắp Giấc Mơ']
      };

      await setImdbMapping('tt1375666', mapping);
      const retrieved = await getImdbMapping('tt1375666');

      expect(retrieved).toBeDefined();
      expect(retrieved?.title).toBe('Inception');
      expect(retrieved?.slugKkphim).toBe('ke-danh-cap-giac-mo');
    });

    it('4.3 should trip Circuit Breaker after max failures and bypass DB', async () => {
      expect(CIRCUIT_BREAKER.isOpen()).toBe(false);

      // Record 3 consecutive failures
      CIRCUIT_BREAKER.recordFailure(new Error('Connection timeout'));
      CIRCUIT_BREAKER.recordFailure(new Error('Connection refused'));
      CIRCUIT_BREAKER.recordFailure(new Error('500 Internal Server Error'));

      expect(CIRCUIT_BREAKER.isOpen()).toBe(true);
      expect(isSupabaseAvailable()).toBe(false);

      // safeDbCall should immediately return null when breaker is open
      const res = await safeDbCall(async () => {
        throw new Error('Should not be executed');
      });
      expect(res).toBeNull();
    });

    it('4.4 should handle delete and flush without throwing errors', async () => {
      await setStreamCache('stream:movie:tt999', [{ url: 'http://test.m3u8' }]);
      const delRes = await deleteStreamCache({ cacheKey: 'stream:movie:tt999' });
      expect(delRes).toBeDefined();

      const flushRes = await flushDatabaseCache();
      expect(flushRes).toBeDefined();
      expect(flushRes).toHaveProperty('streamCount');
      expect(flushRes).toHaveProperty('mappingCount');
    });

    it('4.5 should enforce safe timeout limit for slow queries', async () => {
      const slowQuery = () => new Promise((resolve) => setTimeout(() => resolve({ ok: true }), 2000));
      const res = await safeDbCall(slowQuery, 100);
      expect(res).toBeNull();
    });

    it('4.6 should clean up timer in finally block on fast-failing query without unhandled rejection', async () => {
      const unhandledRejections = [];
      const onUnhandled = (reason) => unhandledRejections.push(reason);
      process.on('unhandledRejection', onUnhandled);

      try {
        const fastFailQuery = () => Promise.reject(new Error('Immediate DB connection failure'));
        const res = await safeDbCall(fastFailQuery, 50);
        expect(res).toBeNull();

        // Wait past the timeout duration to verify no orphaned timer fired
        await new Promise((resolve) => setTimeout(resolve, 100));
        expect(unhandledRejections).toHaveLength(0);
      } finally {
        process.removeListener('unhandledRejection', onUnhandled);
      }
    });
  });

  // ==========================================
  // SECTION 5: Cache Maintenance CLI Utility
  // ==========================================
  describe('5. Cache Maintenance CLI Utility (scripts/flush_cache.js)', () => {

    it('5.1 should parse CLI flags correctly', () => {
      expect(parseArgs(['--all'])).toEqual({
        all: true,
        expired: false,
        provider: null,
        dryRun: false,
        help: false
      });

      expect(parseArgs(['--expired', '--dry-run'])).toEqual({
        all: false,
        expired: true,
        provider: null,
        dryRun: true,
        help: false
      });

      expect(parseArgs(['--provider', 'kkphim'])).toEqual({
        all: false,
        expired: false,
        provider: 'kkphim',
        dryRun: false,
        help: false
      });

      expect(parseArgs(['--provider=vsmov'])).toEqual({
        all: false,
        expired: false,
        provider: 'vsmov',
        dryRun: false,
        help: false
      });

      expect(parseArgs(['--help'])).toEqual({
        all: false,
        expired: false,
        provider: null,
        dryRun: false,
        help: true
      });

      expect(parseArgs(['-h'])).toEqual({
        all: false,
        expired: false,
        provider: null,
        dryRun: false,
        help: true
      });
    });

    it('5.2 should execute main() with help flag without errors', async () => {
      const res = await main(['--help']);
      expect(res).toEqual({ success: true, action: 'help' });
    });

    it('5.3 should execute main() with dry-run mode cleanly', async () => {
      const res = await main(['--all', '--dry-run']);
      expect(res.success).toBe(true);
    });

    it('5.4 should execute main() with provider filter cleanly', async () => {
      const res = await main(['--provider=kkphim', '--dry-run']);
      expect(res.success).toBe(true);
    });
  });
});
