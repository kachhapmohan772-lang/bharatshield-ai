'use strict';

const aiService = require('../services/aiService');
const { success, failure } = require('../utils/response');

async function analyzeMessage(req, res, next) {
  try {
    const result = await aiService.analyzeMessage(req.body.text);
    return success(res, result);
  } catch (err) {
    if (err.code === 'EMPTY_INPUT' || err.code === 'INPUT_TOO_LARGE') {
      return failure(res, 400, err.code, err.message);
    }
    return next(err);
  }
}

async function analyzeLink(req, res, next) {
  try {
    const result = await aiService.analyzeLink(req.body.url);
    return success(res, result);
  } catch (err) {
    if (['EMPTY_INPUT', 'INPUT_TOO_LARGE', 'INVALID_URL'].includes(err.code)) {
      return failure(res, 400, err.code, err.message);
    }
    return next(err);
  }
}

async function analyzeScreenshot(req, res, next) {
  // Text was already extracted client-side via in-browser OCR (Tesseract.js).
  // The backend never receives or stores the raw image in this MVP.
  try {
    const result = await aiService.analyzeMessage(req.body.text);
    return success(res, { ...result, sourceType: 'screenshot-ocr-text' });
  } catch (err) {
    if (err.code === 'EMPTY_INPUT' || err.code === 'INPUT_TOO_LARGE') {
      return failure(res, 400, err.code, err.message);
    }
    return next(err);
  }
}

module.exports = { analyzeMessage, analyzeLink, analyzeScreenshot };
