'use strict';

require('dotenv').config();

const config = {
  port: parseInt(process.env.PORT, 10) || 4000,
  nodeEnv: process.env.NODE_ENV || 'development',
  allowedOrigin: process.env.ALLOWED_ORIGIN || '*',
  aiApiKey: process.env.AI_API_KEY || '', // NEVER logged, NEVER sent to frontend
  aiModel: process.env.AI_MODEL || 'not-configured',
  rateLimitWindowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS, 10) || 60 * 1000,
  rateLimitMax: parseInt(process.env.RATE_LIMIT_MAX, 10) || 20
};

function isProduction() {
  return config.nodeEnv === 'production';
}

module.exports = { config, isProduction };
