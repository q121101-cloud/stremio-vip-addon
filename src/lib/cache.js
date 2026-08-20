'use strict';

const NodeCache = require('node-cache');

// Standard In-Memory Caches with optimal TTL
const imdbCache = new NodeCache({ stdTTL: 86400 * 7, checkperiod: 3600 });    // 7 days for IMDb mapping
const catalogCache = new NodeCache({ stdTTL: 1800, checkperiod: 300 });        // 30 mins for catalogs
const detailCache = new NodeCache({ stdTTL: 3600 * 6, checkperiod: 600 });     // 6 hours for movie details
const streamCache = new NodeCache({ stdTTL: 900, checkperiod: 120 });          // 15 mins for streams

module.exports = {
  imdbCache,
  catalogCache,
  detailCache,
  streamCache,
};
