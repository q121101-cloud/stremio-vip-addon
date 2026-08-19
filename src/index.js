'use strict';

/**
 * ============================================================
 *  VIP Movies Stremio Addon — src/index.js (Engine v2.0.0 K20)
 *  Application Entrypoint
 * ============================================================
 */

require('dotenv').config();
const app = require('./server');
const { syncLatestMovies } = require('./workers/indexer');

const PORT = process.env.PORT || 7000;

if (require.main === module) {
  const server = app.listen(PORT, () => {
    console.log(`[Stremio VIP Addon] K20 Engine chạy tại cổng ${PORT}`);
    // Trigger sync on startup
    syncLatestMovies().catch(() => {});
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
