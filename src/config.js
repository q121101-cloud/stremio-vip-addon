'use strict';

/**
 * Re-export config compressor & constants for backward compatibility
 */
const constants = require('./config/constants');
const compressor = require('./config/compressor');

module.exports = {
  ...constants,
  ...compressor,
};
