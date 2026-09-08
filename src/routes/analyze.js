'use strict';

const express = require('express');
const router = express.Router();

const { analyzeLimiter } = require('../middleware/rateLimiter');
const { validateMessageBody, validateLinkBody, validateScreenshotBody } = require('../middleware/validateRequest');
const controller = require('../controllers/analyzeController');

// POST /api/analyze/message
router.post('/message', analyzeLimiter, validateMessageBody, controller.analyzeMessage);

// POST /api/analyze/link
router.post('/link', analyzeLimiter, validateLinkBody, controller.analyzeLink);

// POST /api/analyze/screenshot  (expects OCR'd text; see analyzeController for rationale)
router.post('/screenshot', analyzeLimiter, validateScreenshotBody, controller.analyzeScreenshot);

module.exports = router;
