'use strict';

/**
 * Re-export manifest helpers from src/routes/manifest and src/config/constants
 */
const constants = require('./config/constants');
const manifestRoute = require('./routes/manifest');

module.exports = {
  ...constants,
  MANIFEST: manifestRoute.buildManifest(constants.DEFAULT_CONFIG),
  buildManifest: manifestRoute.buildManifest,
  BASE_MANIFEST: manifestRoute.BASE_MANIFEST,
};
