'use strict';

const express = require('express');
const router = express.Router();
const { ML_ENABLED } = require('../services/aiService');

router.get('/', (req, res) => {
  res.status(200).json({
    status: 'ok',
    mode: ML_ENABLED ? 'ml-trained' : 'rule-based-fallback',
    time: new Date().toISOString()
  });
});

module.exports = router;
