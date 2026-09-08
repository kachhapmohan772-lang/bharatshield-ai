'use strict';

const { failure } = require('../utils/response');
const { logError } = require('../utils/logger');
const { isProduction } = require('../config/env');

function notFoundHandler(req, res) {
  failure(res, 404, 'NOT_FOUND', 'This endpoint does not exist.');
}

// eslint-disable-next-line no-unused-vars
function errorHandler(err, req, res, next) {
  logError({
    requestId: req.requestId,
    path: req.path,
    code: err.code || 'INTERNAL_ERROR',
    message: err.message
  });

  if (err.type === 'entity.too.large') {
    return failure(res, 413, 'PAYLOAD_TOO_LARGE', 'Request body is too large.');
  }
  if (err.type === 'entity.parse.failed') {
    return failure(res, 400, 'INVALID_JSON', 'Request body is not valid JSON.');
  }

  const knownCodes = ['EMPTY_INPUT', 'INPUT_TOO_LARGE', 'INVALID_URL'];
  if (knownCodes.includes(err.code)) {
    return failure(res, 400, err.code, err.message);
  }

  // Never leak stack traces or internals to the client.
  return failure(res, 500, 'INTERNAL_ERROR', isProduction()
    ? 'Something went wrong. Please try again.'
    : `Something went wrong: ${err.message}`);
}

module.exports = { notFoundHandler, errorHandler };
