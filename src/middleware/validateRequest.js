'use strict';

const { failure } = require('../utils/response');

const MAX_MESSAGE_LEN = 5000;
const MAX_URL_LEN = 2048;

function validateMessageBody(req, res, next) {
  const body = req.body;
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return failure(res, 400, 'INVALID_BODY', 'Request body must be a JSON object.');
  }
  const allowedKeys = ['text'];
  const extraKeys = Object.keys(body).filter((k) => !allowedKeys.includes(k));
  if (extraKeys.length) {
    return failure(res, 400, 'UNEXPECTED_FIELDS', `Unexpected field(s): ${extraKeys.join(', ')}`);
  }
  if (typeof body.text !== 'string' || !body.text.trim()) {
    return failure(res, 400, 'INVALID_INPUT', 'Please provide a valid "text" field.');
  }
  if (body.text.length > MAX_MESSAGE_LEN) {
    return failure(res, 400, 'INPUT_TOO_LARGE', `Message must be under ${MAX_MESSAGE_LEN} characters.`);
  }
  next();
}

function validateLinkBody(req, res, next) {
  const body = req.body;
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return failure(res, 400, 'INVALID_BODY', 'Request body must be a JSON object.');
  }
  const allowedKeys = ['url'];
  const extraKeys = Object.keys(body).filter((k) => !allowedKeys.includes(k));
  if (extraKeys.length) {
    return failure(res, 400, 'UNEXPECTED_FIELDS', `Unexpected field(s): ${extraKeys.join(', ')}`);
  }
  if (typeof body.url !== 'string' || !body.url.trim()) {
    return failure(res, 400, 'INVALID_INPUT', 'Please provide a valid "url" field.');
  }
  if (body.url.length > MAX_URL_LEN) {
    return failure(res, 400, 'INPUT_TOO_LARGE', 'URL is too long.');
  }
  // reject dangerous schemes outright (javascript:, data:, file:, etc.)
  if (/^(javascript|data|file|vbscript):/i.test(body.url.trim())) {
    return failure(res, 400, 'UNSAFE_SCHEME', 'This URL scheme is not supported.');
  }
  next();
}

function validateScreenshotBody(req, res, next) {
  // Screenshot OCR happens client-side (Tesseract.js in the browser);
  // the backend receives already-extracted text and reuses message validation.
  return validateMessageBody(req, res, next);
}

module.exports = { validateMessageBody, validateLinkBody, validateScreenshotBody };
