'use strict';

const { extractFeatures } = require('./text-preprocessor');

function sigmoid(x) {
  if (x >= 0) {
    const e = Math.exp(-x);
    return 1 / (1 + e);
  }
  const e = Math.exp(x);
  return e / (1 + e);
}

function relu(x) {
  return x > 0 ? x : 0;
}

function reluGrad(x) {
  return x > 0 ? 1 : 0;
}

function createSeededRandom(seed) {
  let state = seed >>> 0;
  return function random() {
    state = (1664525 * state + 1013904223) >>> 0;
    return state / 0x100000000;
  };
}

function buildVocabulary(texts, maxVocab) {
  const counts = new Map();
  texts.forEach((text) => {
    extractFeatures(text).forEach((feature) => {
      counts.set(feature, (counts.get(feature) || 0) + 1);
    });
  });

  return Array.from(counts.entries())
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, maxVocab)
    .map(([feature]) => feature);
}

function vectorize(text, featureIndex) {
  const vector = new Array(featureIndex.size).fill(0);
  extractFeatures(text).forEach((feature) => {
    const idx = featureIndex.get(feature);
    if (idx !== undefined) vector[idx] = 1;
  });
  return vector;
}

function forward(model, x) {
  const hiddenRaw = new Array(model.hiddenSize);
  const hidden = new Array(model.hiddenSize);

  for (let h = 0; h < model.hiddenSize; h++) {
    let sum = model.b1[h];
    for (let i = 0; i < model.inputSize; i++) sum += model.w1[h][i] * x[i];
    hiddenRaw[h] = sum;
    hidden[h] = relu(sum);
  }

  let outRaw = model.b2;
  for (let h = 0; h < model.hiddenSize; h++) outRaw += model.w2[h] * hidden[h];

  return { hiddenRaw, hidden, probability: sigmoid(outRaw) };
}

function train(texts, labels, opts = {}) {
  if (!Array.isArray(texts) || !Array.isArray(labels) || texts.length !== labels.length || texts.length === 0) {
    throw new Error('train() requires non-empty texts[] and labels[] of equal length.');
  }

  const maxVocab = opts.maxVocab || 700;
  const hiddenSize = opts.hiddenSize || 24;
  const epochs = opts.epochs || 18;
  const learningRate = opts.learningRate || 0.035;
  const l2 = opts.l2 || 0.0005;
  const random = createSeededRandom(opts.seed || 42);

  const vocabulary = buildVocabulary(texts, maxVocab);
  const featureIndex = new Map(vocabulary.map((feature, idx) => [feature, idx]));
  const inputSize = vocabulary.length;

  const w1 = Array.from({ length: hiddenSize }, () =>
    Array.from({ length: inputSize }, () => (random() - 0.5) * 0.08)
  );
  const b1 = new Array(hiddenSize).fill(0);
  const w2 = Array.from({ length: hiddenSize }, () => (random() - 0.5) * 0.08);

  const model = {
    type: 'dense-neural-network',
    inputSize,
    hiddenSize,
    vocabulary,
    w1,
    b1,
    w2,
    b2: 0,
    epochsRun: 0,
    finalLoss: null
  };

  const rows = texts.map((text, i) => ({
    x: vectorize(text, featureIndex),
    y: labels[i] === 'scam' ? 1 : 0
  }));

  for (let epoch = 0; epoch < epochs; epoch++) {
    let loss = 0;

    for (const row of rows) {
      const { hiddenRaw, hidden, probability } = forward(model, row.x);
      const error = probability - row.y;
      const safeProb = Math.min(Math.max(probability, 1e-9), 1 - 1e-9);
      loss += -(row.y * Math.log(safeProb) + (1 - row.y) * Math.log(1 - safeProb));

      for (let h = 0; h < hiddenSize; h++) {
        const oldW2 = model.w2[h];
        model.w2[h] -= learningRate * (error * hidden[h] + l2 * model.w2[h]);

        const hiddenError = error * oldW2 * reluGrad(hiddenRaw[h]);
        model.b1[h] -= learningRate * hiddenError;

        for (let i = 0; i < inputSize; i++) {
          if (row.x[i] === 0) continue;
          model.w1[h][i] -= learningRate * (hiddenError + l2 * model.w1[h][i]);
        }
      }

      model.b2 -= learningRate * error;
    }

    model.epochsRun = epoch + 1;
    model.finalLoss = loss / rows.length;
  }

  return model;
}

function predictProb(model, text) {
  const featureIndex = new Map(model.vocabulary.map((feature, idx) => [feature, idx]));
  const x = vectorize(text, featureIndex);
  return forward(model, x).probability;
}

module.exports = { train, predictProb, sigmoid };