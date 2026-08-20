'use strict';

require('dotenv').config();
const express = require('express');
const cors    = require('cors');
const handlers = require('./handlers');

const app = express();
const PORT = process.env.PORT || 7000;

app.use(cors({ origin: '*' }));
app.use(express.json());

// Request logger
app.use((req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    const duration = Date.now() - start;
    if (!req.path.startsWith('/hls')) {
      console.log(`[${new Date().toISOString()}] ${req.method} ${req.originalUrl} → ${res.statusCode} (${duration}ms)`);
    }
  });
  next();
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
    providers: ['vsmov', 'kkphim', 'nguonc'],
  });
});

// Mount Stremio Handlers
app.use('/', handlers);

if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`====================================================`);
    console.log(`🚀 VIP Movies Addon (VSMOV 4K + KKPhim + NguonC)`);
    console.log(`📡 Local Server running at http://localhost:${PORT}`);
    console.log(`🔗 Manifest: http://localhost:${PORT}/manifest.json`);
    console.log(`====================================================`);
  });
}

module.exports = app;
