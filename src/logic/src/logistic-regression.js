'use strict';

/**
 * BharatShield AI — Logistic Regression (from scratch)
 * -----------------------------------------------------------------------
 * Used for link/URL risk classification over engineered numeric features
 * (has_https, subdomain_count, has_at_symbol, ...). Weights are learned
 * via batch gradient descent on labeled examples — genuinely fitted
 * parameters, not manually chosen thresholds.
 *
 * Why logistic regression here (not Naive Bayes): URL risk signals are
 * naturally numeric/boolean features rather than free text, and logistic
 * regression is the standard, well-understood model for that setting —
 * it outputs a calibrated probability and each learned weight is a
 * directly interpretable contribution per feature.
 * -----------------------------------------------------------------------
 */

function sigmoid(z) {
  // Numerically stable sigmoid (avoids overflow for large |z|).
  if (z >= 0) {
    const e = Math.exp(-z);
    return 1 / (1 + e);
  }
  const e = Math.exp(z);
  return e / (1 + e);
}

/**
 * @param {number[][]} X - training feature matrix, each row one example
 * @param {number[]} y - labels, 0 or 1, same length as X
 * @param {object} opts - { learningRate, epochs, l2 }
 * @returns {object} model - { weights, bias, featureMeans, featureStds, epochsRun, finalLoss }
 */
function train(X, y, opts = {}) {
  if (!Array.isArray(X) || !Array.isArray(y) || X.length !== y.length || X.length === 0) {
    throw new Error('train() requires non-empty X (matrix) and y (labels) of equal length.');
  }
  const learningRate = opts.learningRate ?? 0.5;
  const epochs = opts.epochs ?? 2000;
  const l2 = opts.l2 ?? 0.01;

  const n = X.length;
  const d = X[0].length;

  // Standardize features (zero mean, unit variance) — makes gradient
  // descent converge reliably regardless of each feature's raw scale
  // (e.g. "domain length" ranges 0-60, while "has_https" is 0/1).
  const featureMeans = new Array(d).fill(0);
  const featureStds = new Array(d).fill(1);
  for (let j = 0; j < d; j++) {
    let sum = 0;
    for (let i = 0; i < n; i++) sum += X[i][j];
    featureMeans[j] = sum / n;
  }
  for (let j = 0; j < d; j++) {
    let sumSq = 0;
    for (let i = 0; i < n; i++) sumSq += (X[i][j] - featureMeans[j]) ** 2;
    const variance = sumSq / n;
    featureStds[j] = Math.sqrt(variance) || 1; // avoid divide-by-zero for constant features
  }

  const Xs = X.map((row) => row.map((v, j) => (v - featureMeans[j]) / featureStds[j]));

  let weights = new Array(d).fill(0);
  let bias = 0;
  let finalLoss = null;

  for (let epoch = 0; epoch < epochs; epoch++) {
    const gradW = new Array(d).fill(0);
    let gradB = 0;
    let loss = 0;

    for (let i = 0; i < n; i++) {
      let z = bias;
      for (let j = 0; j < d; j++) z += weights[j] * Xs[i][j];
      const pred = sigmoid(z);
      const err = pred - y[i];

      for (let j = 0; j < d; j++) gradW[j] += err * Xs[i][j];
      gradB += err;

      const clampedPred = Math.min(Math.max(pred, 1e-12), 1 - 1e-12);
      loss += -(y[i] * Math.log(clampedPred) + (1 - y[i]) * Math.log(1 - clampedPred));
    }

    for (let j = 0; j < d; j++) {
      const reg = l2 * weights[j]; // L2 regularization, not applied to bias
      weights[j] -= learningRate * (gradW[j] / n + reg);
    }
    bias -= learningRate * (gradB / n);

    finalLoss = loss / n;
  }

  return { weights, bias, featureMeans, featureStds, epochsRun: epochs, finalLoss };
}

function predictProb(model, features) {
  if (features.length !== model.weights.length) {
    throw new Error(`Feature vector length ${features.length} does not match trained model (${model.weights.length}).`);
  }
  const standardized = features.map((v, j) => (v - model.featureMeans[j]) / model.featureStds[j]);
  let z = model.bias;
  for (let j = 0; j < standardized.length; j++) z += model.weights[j] * standardized[j];
  return sigmoid(z);
}

/** Per-feature contribution to the prediction, for explainability. */
function explain(model, features, featureNames) {
  const standardized = features.map((v, j) => (v - model.featureMeans[j]) / model.featureStds[j]);
  return featureNames
    .map((name, j) => ({ feature: name, contribution: model.weights[j] * standardized[j], rawValue: features[j] }))
    .filter((f) => f.contribution > 0.01)
    .sort((a, b) => b.contribution - a.contribution);
}

module.exports = { train, predictProb, explain, sigmoid };
