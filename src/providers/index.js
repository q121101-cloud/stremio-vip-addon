'use strict';

/**
 * ============================================================
 *  VIP Movies Addon — src/providers/index.js
 *  Central Provider Index & Multi-Keyword Provider Aggregator
 * ============================================================
 */

const vsmov  = require('./vsmov');
const kkphim = require('./kkphim');
const nguonc = require('./nguonc');
const { generateSearchKeywords, matchEpisodeItem } = require('../lib/utils');

const ALL_PROVIDERS = {
  vsmov,
  kkphim,
  nguonc,
};

module.exports = {
  ...ALL_PROVIDERS,
  ALL_PROVIDERS,
  generateSearchKeywords,
  matchEpisodeItem,
};
