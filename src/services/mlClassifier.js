'use strict';

const fs = require('fs');
const path = require('path');
const { tokenize, humanizeToken } = require('../ml/textPreprocess');
const { THRESHOLDS } = require('./riskEngine');

const MODEL_PATH = path.join(__dirname, '..', 'models', 'message-model.json');
const LABELS = ['safe', 'scam'];

function scoreToLevel(score) {
  if (score <= THRESHOLDS.low) return 'LOW';
  if (score <= THRESHOLDS.medium) return 'MEDIUM';
  if (score <= THRESHOLDS.high) return 'HIGH';
  return 'CRITICAL';
}

function loadModel() {
  try {
    return JSON.parse(fs.readFileSync(MODEL_PATH, 'utf8'));
  } catch (err) {
    return null;
  }
}

const model = loadModel();
const ML_ENABLED = Boolean(model);

function logSumExp(values) {
  const max = Math.max(...values);
  const sum = values.reduce((acc, value) => acc + Math.exp(value - max), 0);
  return max + Math.log(sum);
}

function normalizeLogScores(logScores) {
  const labels = Object.keys(logScores);
  const normalizer = logSumExp(labels.map((label) => logScores[label]));
  return Object.fromEntries(labels.map((label) => [label, Math.exp(logScores[label] - normalizer)]));
}

function tokenLogProbability(stats, token, vocabularySize) {
  const count = stats.tokenCounts[token] || 0;
  return Math.log((count + 1) / (stats.totalTokens + vocabularySize));
}

function classifyLabel(tokens) {
  const vocabularySize = Math.max(model.vocabulary.length, 1);
  const logScores = {};

  LABELS.forEach((label) => {
    const stats = model.labelStats[label];
    const prior = (stats.docCount + 1) / (model.totalDocuments + LABELS.length);
    logScores[label] = Math.log(prior);
    tokens.forEach((token) => {
      logScores[label] += tokenLogProbability(stats, token, vocabularySize);
    });
  });

  return normalizeLogScores(logScores);
}

function classifyCategory(tokens) {
  const categories = Object.values(model.categoryStats || {});
  if (!categories.length) return { id: 'suspicious_general', name: 'General suspicious activity', probability: 1 };

  const vocabularySize = Math.max(model.vocabulary.length, 1);
  const scamDocs = categories.reduce((sum, category) => sum + category.docCount, 0);
  const logScores = {};

  categories.forEach((category) => {
    const prior = (category.docCount + 1) / (scamDocs + categories.length);
    logScores[category.id] = Math.log(prior);
    tokens.forEach((token) => {
      logScores[category.id] += tokenLogProbability(category, token, vocabularySize);
    });
  });

  const probabilities = normalizeLogScores(logScores);
  const bestId = Object.keys(probabilities).sort((a, b) => probabilities[b] - probabilities[a])[0];
  const best = categories.find((category) => category.id === bestId);
  return { id: best.id, name: best.name, probability: probabilities[bestId] };
}

function learnedIndicators(tokens) {
  const uniqueTokens = [...new Set(tokens)].filter((token) => model.vocabulary.includes(token));
  const vocabularySize = Math.max(model.vocabulary.length, 1);
  const scamStats = model.labelStats.scam;
  const safeStats = model.labelStats.safe;

  return uniqueTokens
    .map((token) => ({
      token,
      text: humanizeToken(token),
      score: tokenLogProbability(scamStats, token, vocabularySize) - tokenLogProbability(safeStats, token, vocabularySize)
    }))
    .filter((item) => item.score > 0.35)
    .sort((a, b) => b.score - a.score)
    .slice(0, 5);
}

function predictMessage(text) {
  if (!ML_ENABLED) {
    const err = new Error('ML model is not trained yet. Run npm.cmd run train:ml first.');
    err.code = 'ML_MODEL_NOT_FOUND';
    throw err;
  }

  const tokens = tokenize(text);
  const probabilities = classifyLabel(tokens);
  const scamProbability = probabilities.scam || 0;
  const safeProbability = probabilities.safe || 0;
  const label = scamProbability >= safeProbability ? 'scam' : 'safe';
  const riskScore = Math.max(0, Math.min(100, Math.round(scamProbability * 100)));
  const riskLevel = scoreToLevel(riskScore);
  const category = label === 'scam' ? classifyCategory(tokens) : {
    id: 'none',
    name: 'No specific category',
    probability: safeProbability
  };
  const confidenceValue = Math.max(scamProbability, safeProbability);
  const confidence = confidenceValue >= 0.82 ? 'high' : confidenceValue >= 0.62 ? 'medium' : 'low';

  return {
    modelVersion: model.version,
    algorithm: model.algorithm,
    label,
    riskScore,
    riskLevel,
    categoryId: category.id,
    category: category.name,
    confidence,
    probabilities: {
      scam: Number(scamProbability.toFixed(4)),
      safe: Number(safeProbability.toFixed(4)),
      category: Number(category.probability.toFixed(4))
    },
    learnedIndicators: learnedIndicators(tokens),
    trainingExamples: model.totalDocuments,
    vocabularySize: model.vocabulary.length
  };
}

module.exports = { ML_ENABLED, predictMessage };
