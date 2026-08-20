'use strict';

const axios = require('axios');
const { imdbCache } = require('./cache');

const KNOWN_TITLE_LOCALIZATIONS = {
  'tt7458054':  ['khi nang say giac', 'while you were sleeping'],
  'tt34809853': ['day cho em mot bai hoc', 'teach you a lesson'],
  'tt26450613': ['cua hang sat thu', 'a shop for killers'],
  'tt10919420': ['tro choi con muc', 'squid game'],
  'tt11151336': ['ha canh noi anh', 'crash landing on you'],
  'tt10857164': ['tang lop itaewon', 'itaewon class'],
};

async function resolveCinemeta(imdbId, type = 'movie') {
  if (!imdbId) return null;
  const cleanId = String(imdbId).split(':')[0];
  const cacheKey = `cinemeta:${cleanId}`;

  const cached = imdbCache.get(cacheKey);
  if (cached) return cached;

  const knownAliases = KNOWN_TITLE_LOCALIZATIONS[cleanId] || [];

  try {
    const metaType = type === 'series' ? 'series' : 'movie';
    const url = `https://v3-cinemeta.strem.io/meta/${metaType}/${cleanId}.json`;
    const res = await axios.get(url, { timeout: 4000 });
    const meta = res.data?.meta;

    if (!meta) {
      return {
        imdbId: cleanId,
        title: cleanId,
        year: null,
        genres: [],
        aliases: knownAliases,
      };
    }

    const title = meta.name || meta.title || cleanId;
    const year = parseInt(meta.year, 10) || null;
    const genres = Array.isArray(meta.genres) ? meta.genres : [];
    const aliases = Array.from(new Set([
      title.toLowerCase(),
      ...knownAliases,
    ]));

    const result = {
      imdbId: cleanId,
      title,
      year,
      genres,
      aliases,
    };

    imdbCache.set(cacheKey, result);
    return result;
  } catch (err) {
    return {
      imdbId: cleanId,
      title: cleanId,
      year: null,
      genres: [],
      aliases: knownAliases,
    };
  }
}

module.exports = {
  resolveCinemeta,
  KNOWN_TITLE_LOCALIZATIONS,
};
