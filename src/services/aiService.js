'use strict';

const riskEngine = require('./riskEngine');
const mlEngine = require('../logic/src/ai-engine');

const ML_ENABLED = mlEngine.isModelLoaded();

function addMetadata(result) {
  return {
    ...result,
    aiAssisted: false,
    mlAssisted: true
  };
}

async function analyzeMessage(text) {
  if (ML_ENABLED) {
    return addMetadata(mlEngine.analyzeMessage(text));
  }

  return {
    ...riskEngine.analyzeMessage(text),
    mode: 'rule-based-fallback',
    aiAssisted: false,
    mlAssisted: false,
    mlFallbackReason: 'Trained ML model is missing from src/logic/src/trained-model.json.'
  };
}

async function analyzeLink(url) {
  if (ML_ENABLED) {
    return addMetadata(mlEngine.analyzeLink(url));
  }

  return {
    ...riskEngine.analyzeLink(url),
    mode: 'rule-based-fallback',
    aiAssisted: false,
    mlAssisted: false,
    mlFallbackReason: 'Trained ML model is missing from src/logic/src/trained-model.json.'
  };
}

module.exports = { analyzeMessage, analyzeLink, ML_ENABLED };
