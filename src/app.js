'use strict';

const express = require('express');
const path = require('path');
const { applySecurity } = require('./middleware/security');
const requestContext = require('./middleware/requestContext');
const { notFoundHandler, errorHandler } = require('./middleware/errorHandler');

const healthRoutes = require('./routes/health');
const analyzeRoutes = require('./routes/analyze');

function createApp() {
  const app = express();

  applySecurity(app);
  app.use(requestContext);

  // Body parsing with a strict size cap — protects against oversized payload abuse.
  app.use(express.json({ limit: '200kb' }));

  app.use('/api/health', healthRoutes);
  app.use('/api/analyze', analyzeRoutes);
  
  app.use(express.static(path.join(__dirname, '../bharatshield-ai-frontend/bharatshield')));

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}

module.exports = createApp;
