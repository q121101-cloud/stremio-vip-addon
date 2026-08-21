'use strict';

const express = require('express');
const router = express.Router();
const { handleUsenetStreamRequest } = require('../services/usenetStreamer');

/**
 * Route: GET /usenet/stream
 * Query params or body with metadata for Usenet NZB streaming
 */
router.get(['/usenet/stream', '/api/usenet/stream'], async (req, res) => {
  const metadataStr = req.query.meta;
  let metadata = {};
  if (metadataStr) {
    try {
      metadata = JSON.parse(Buffer.from(metadataStr, 'base64url').toString('utf8'));
    } catch (_) {}
  }
  await handleUsenetStreamRequest(req, res, metadata);
});

module.exports = router;
