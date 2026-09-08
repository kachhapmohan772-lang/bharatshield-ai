'use strict';

const crypto = require('crypto');
const { logRequest } = require('../utils/logger');

function requestContext(req, res, next) {
  req.requestId = crypto.randomUUID();
  const start = Date.now();
  res.on('finish', () => {
    logRequest({
      requestId: req.requestId,
      method: req.method,
      path: req.path,
      status: res.statusCode,
      durationMs: Date.now() - start
    });
  });
  next();
}

module.exports = requestContext;
