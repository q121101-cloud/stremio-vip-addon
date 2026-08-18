'use strict';

/**
 * ============================================================
 *  VIP Movies Addon — src/providers/index.js
 *  Central Provider Index & Multi-Keyword Provider Aggregator
 * ============================================================
 */

const film4k = require('./film4k');
const vsmov  = require('./vsmov');
const kkphim = require('./kkphim');
const nguonc = require('./nguonc');
const stp    = require('./stp');
const hh3d   = require('./hh3d');
const yan    = require('./yan');
const clbpx  = require('./clbpx');
const { generateSearchKeywords, matchEpisodeItem } = require('../lib/utils');

const ALL_PROVIDERS = {
  film4k,
  vsmov,
  kkphim,
  nguonc,
  stp,
  hh3d,
  yan,
  clbpx,
};

module.exports = {
  ...ALL_PROVIDERS,
  ALL_PROVIDERS,
  generateSearchKeywords,
  matchEpisodeItem,
};
