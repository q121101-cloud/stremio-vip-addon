'use strict';

/**
 * ============================================================
 *  VIP Movies Addon — src/handlers.js
 *  Modular Route Router Re-export for Backward Compatibility
 * ============================================================
 */

const express = require('express');
const router  = express.Router();

const catalogRouter = require('./routes/catalog');
const metaRouter    = require('./routes/meta');
const streamRouter  = require('./routes/stream');

router.use('/', catalogRouter);
router.use('/', metaRouter);
router.use('/', streamRouter);

module.exports = router;
