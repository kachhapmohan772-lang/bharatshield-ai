'use strict';

const helmet = require('helmet');
const cors = require('cors');
const { config } = require('../config/env');

function applySecurity(app) {
  app.disable('x-powered-by');

  app.use(helmet({
    contentSecurityPolicy: false // frontend is served separately; API-only server
  }));

  app.use(cors({
    origin: config.allowedOrigin === '*' ? true : config.allowedOrigin.split(',').map((o) => o.trim()),
    methods: ['GET', 'POST'],
    allowedHeaders: ['Content-Type']
  }));
}

module.exports = { applySecurity };
