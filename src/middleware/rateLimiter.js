'use strict';

const rateLimit = require('express-rate-limit');
const { config } = require('../config/env');
const { failure } = require('../utils/response');

/**
 * Applies to analysis endpoints only (not /api/health).
 * Prototype defaults: 20 requests/minute per IP — generous enough for a
 * live demo, tight enough to blunt basic abuse/flooding.
 */
const analyzeLimiter = rateLimit({
  windowMs: config.rateLimitWindowMs,
  max: config.rateLimitMax,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => {
    failure(res, 429, 'RATE_LIMITED', 'Too many requests. Please wait a moment and try again.');
  }
});

module.exports = { analyzeLimiter };
