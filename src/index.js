'use strict';

require('dotenv').config();
const path = require('path');
const express = require('express');
const cors = require('cors');

const { PORT } = require('./config');
const { getManifest } = require('./manifest');

const catalogRouter = require('./routes/catalog');
const metaRouter = require('./routes/meta');
const streamRouter = require('./routes/stream');
const hlsRouter = require('./routes/hls');

const app = express();

// Security & Cross-Origin Middleware
app.use(cors({ origin: '*', methods: ['GET', 'HEAD', 'OPTIONS'] }));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve Cyber-Glassmorphism Configurator Dashboard Static Assets
app.use(express.static(path.join(__dirname, 'public'), {
  maxAge: '1d',
  etag: true
}));

// Stremio Addon Manifest Routes
app.get('/manifest.json', (req, res) => {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 'public, max-age=3600');
  res.json(getManifest());
});

app.get(['/:config/manifest.json', '/c/:config/manifest.json'], (req, res) => {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 'public, max-age=3600');
  res.json(getManifest(req.params.config));
});

// Stremio Core Resource Routers
app.use(catalogRouter);
app.use(metaRouter);
app.use(streamRouter);
app.use(hlsRouter);

// Configurator Web UI Routes
const serveDashboard = (req, res) => {
  res.setHeader('Cache-Control', 'no-cache');
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
};

app.get('/', serveDashboard);
app.get('/configure', serveDashboard);
app.get(['/c/:config', '/:config/configure'], serveDashboard);

// Health Check API
app.get(['/health', '/api/health'], (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    version: '2.0.0'
  });
});

// Stremio Fallback 404 Handler for JSON requests
app.use((req, res, next) => {
  if (req.path.endsWith('.json')) {
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Access-Control-Allow-Origin', '*');
    if (req.path.includes('/catalog/')) return res.json({ metas: [] });
    if (req.path.includes('/stream/')) return res.json({ streams: [] });
    if (req.path.includes('/meta/')) return res.json({ meta: null });
  }
  next();
});

// General 404 Fallback Handler
app.use((req, res) => {
  if (req.accepts('json')) {
    return res.status(404).json({ error: 'Not Found' });
  }
  res.status(404).send('Not Found');
});

// Global Error Handler
app.use((err, req, res, next) => {
  console.error('[Server Unhandled Error]:', err.message);
  if (!res.headersSent) {
    res.status(500).json({ error: 'Internal Server Error', message: err.message });
  }
});

// Server Listen if run directly
if (require.main === module) {
  const server = app.listen(PORT, () => {
    console.log(`🚀 [VIP Movies Stremio Addon] Server listening on port ${PORT}`);
    console.log(`📡 Dashboard UI available at http://localhost:${PORT}/`);
    console.log(`📋 Manifest URL: http://localhost:${PORT}/manifest.json`);
  });

  const gracefulShutdown = () => {
    console.log('🛑 Shutting down server gracefully...');
    server.close(() => {
      process.exit(0);
    });
  };

  process.on('SIGINT', gracefulShutdown);
  process.on('SIGTERM', gracefulShutdown);
}

module.exports = app;
