'use strict';

/**
 * ============================================================
 *  VIP Movies Stremio Addon — src/index.js (Engine v1.8.0)
 *  Application Entrypoint
 * ============================================================
 */

require('dotenv').config();
const app = require('./server');
const { startPeriodicIndexer } = require('./workers/indexer');
const { ADDON_VERSION } = require('./config/constants');

const PORT = parseInt(process.env.PORT || '7000', 10);
const HOST = process.env.HOST || '0.0.0.0';

let server = null;

if (require.main === module) {
  server = app.listen(PORT, HOST, () => {
    const addonUrl = `http://localhost:${PORT}`;
    console.log('');
    console.log('╔══════════════════════════════════════════════════════════════╗');
    console.log(`║     🚀  VIP Movies Addon v${ADDON_VERSION} Running on Port ${PORT}       ║`);
    console.log('╚══════════════════════════════════════════════════════════════╝');
    console.log(`  🌐 Dashboard:   ${addonUrl}`);
    console.log(`  📋 Manifest:    ${addonUrl}/manifest.json`);
    console.log(`  ⚡ HLS Proxy:   ${addonUrl}/hls/manifest.m3u8`);
    console.log(`  💚 Health:      ${addonUrl}/health`);
    console.log('');

    // Start background indexing worker
    startPeriodicIndexer(30);
  });

  const shutdown = (signal) => {
    console.log(`\n[Server] Received ${signal} — Gracefully shutting down...`);
    if (server) {
      server.close(() => {
        console.log('[Server] HTTP server closed cleanly.');
        process.exit(0);
      });
    } else {
      process.exit(0);
    }
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT',  () => shutdown('SIGINT'));
}

module.exports = app;
