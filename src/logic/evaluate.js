'use strict';

/**
 * BharatShield AI — Evaluation Script
 * -----------------------------------------------------------------------
 * Measures REAL performance via stratified k-fold cross-validation: the
 * model is retrained from scratch on each fold's training split and
 * scored only on the held-out fold it never saw. This is the honest way
 * to estimate how the model performs on messages it wasn't trained on —
 * evaluating on the training set itself (in-sample) would overstate
 * accuracy and is explicitly avoided here.
 *
 * Run: node evaluate.js
 * All numbers below are computed live, every run — nothing is hardcoded.
 * -----------------------------------------------------------------------
 */

const fs = require('fs');
const path = require('path');

const nb = require('./src/naive-bayes');
const lr = require('./src/logistic-regression');
const nn = require('./src/neural-network');
const { extractFeatures } = require('./src/text-preprocessor');
const { extractLinkFeatures } = require('./src/link-features');

function loadJson(relPath) {
  return JSON.parse(fs.readFileSync(path.join(__dirname, relPath), 'utf8'));
}

function shuffle(arr, seed) {
  // Deterministic shuffle (mulberry32 PRNG) so evaluation is reproducible run-to-run.
  let s = seed;
  function rand() {
    s |= 0; s = (s + 0x6D2B79F5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  const out = arr.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

function stratifiedFolds(items, labelFn, k, seed) {
  const byLabel = {};
  items.forEach((item) => {
    const l = labelFn(item);
    if (!byLabel[l]) byLabel[l] = [];
    byLabel[l].push(item);
  });
  const folds = Array.from({ length: k }, () => []);
  Object.values(byLabel).forEach((group) => {
    const shuffled = shuffle(group, seed);
    shuffled.forEach((item, i) => folds[i % k].push(item));
  });
  return folds;
}

function confusionCounts(predicted, actual, positiveLabel) {
  let tp = 0, tn = 0, fp = 0, fn = 0;
  for (let i = 0; i < predicted.length; i++) {
    const p = predicted[i] === positiveLabel;
    const a = actual[i] === positiveLabel;
    if (p && a) tp++;
    else if (!p && !a) tn++;
    else if (p && !a) fp++;
    else fn++;
  }
  return { tp, tn, fp, fn };
}

function metricsFromConfusion({ tp, tn, fp, fn }) {
  const total = tp + tn + fp + fn;
  const accuracy = total ? (tp + tn) / total : 0;
  const precision = (tp + fp) ? tp / (tp + fp) : 0;
  const recall = (tp + fn) ? tp / (tp + fn) : 0;
  const f1 = (precision + recall) ? (2 * precision * recall) / (precision + recall) : 0;
  const falsePositiveRate = (fp + tn) ? fp / (fp + tn) : 0;
  return { accuracy, precision, recall, f1, falsePositiveRate, ...{ tp, tn, fp, fn } };
}

function pct(x) { return (x * 100).toFixed(1) + '%'; }

// =========================================================================
// 1. MESSAGE MODEL — 5-fold stratified cross-validation
// =========================================================================
function evaluateMessageModel() {
  const data = loadJson('data/train-message-data.json').examples;
  const K = 5;
  const folds = stratifiedFolds(data, (e) => e.label, K, 42);

  let allPred = [];
  let allActual = [];

  for (let k = 0; k < K; k++) {
    const testSet = folds[k];
    const trainSet = folds.filter((_, i) => i !== k).flat();

    const trainTexts = trainSet.map((e) => e.text);
    const trainLabels = trainSet.map((e) => e.label);
    const foldModel = nb.train(trainTexts, trainLabels);

    // Fit calibration fresh on this fold's training split only.
    const calibX = [], calibY = [];
    trainSet.forEach((e) => {
      const { logScores } = nb.scoreAllClasses(foldModel, e.text);
      const fc = Math.max(1, extractFeatures(e.text).length);
      calibX.push([(logScores.scam - logScores.legit) / fc]);
      calibY.push(e.label === 'scam' ? 1 : 0);
    });
    const calibModel = lr.train(calibX, calibY, { learningRate: 0.5, epochs: 2000, l2: 0.01 });

    testSet.forEach((e) => {
      const { logScores } = nb.scoreAllClasses(foldModel, e.text);
      const fc = Math.max(1, extractFeatures(e.text).length);
      const prob = lr.predictProb(calibModel, [(logScores.scam - logScores.legit) / fc]);
      allPred.push(prob >= 0.5 ? 'scam' : 'legit');
      allActual.push(e.label);
    });
  }

  const confusion = confusionCounts(allPred, allActual, 'scam');
  const metrics = metricsFromConfusion(confusion);

  console.log('=== Message Model: 5-fold Cross-Validation (held-out data only) ===');
  console.log(`Total examples evaluated: ${allActual.length} (each scored only by folds that did not train on it)`);
  console.log(`Confusion matrix — TP=${confusion.tp} TN=${confusion.tn} FP=${confusion.fp} FN=${confusion.fn}`);
  console.log(`Accuracy:  ${pct(metrics.accuracy)}`);
  console.log(`Precision: ${pct(metrics.precision)} (of messages flagged as scam, how many really were)`);
  console.log(`Recall:    ${pct(metrics.recall)} (of real scam messages, how many were caught)`);
  console.log(`F1 score:  ${metrics.f1.toFixed(3)}`);
  console.log(`False positive rate: ${pct(metrics.falsePositiveRate)} (legit messages incorrectly flagged as scam)`);
  console.log('');
  return metrics;
}


// =========================================================================
// 2. NEURAL MESSAGE MODEL - 5-fold stratified cross-validation
// =========================================================================
function evaluateNeuralMessageModel() {
  const data = loadJson('data/train-message-data.json').examples;
  const K = 5;
  const folds = stratifiedFolds(data, (e) => e.label, K, 123);

  let allPred = [];
  let allActual = [];

  for (let k = 0; k < K; k++) {
    const testSet = folds[k];
    const trainSet = folds.filter((_, i) => i !== k).flat();
    const foldModel = nn.train(
      trainSet.map((e) => e.text),
      trainSet.map((e) => e.label),
      { maxVocab: 700, hiddenSize: 24, epochs: 12, learningRate: 0.035, l2: 0.0005, seed: 42 + k }
    );

    testSet.forEach((e) => {
      const prob = nn.predictProb(foldModel, e.text);
      allPred.push(prob >= 0.5 ? 'scam' : 'legit');
      allActual.push(e.label);
    });
  }

  const confusion = confusionCounts(allPred, allActual, 'scam');
  const metrics = metricsFromConfusion(confusion);

  console.log('=== Neural Message Model: 5-fold Cross-Validation (held-out data only) ===');
  console.log(`Total examples evaluated: ${allActual.length}`);
  console.log(`Confusion matrix - TP=${confusion.tp} TN=${confusion.tn} FP=${confusion.fp} FN=${confusion.fn}`);
  console.log(`Accuracy:  ${pct(metrics.accuracy)}`);
  console.log(`Precision: ${pct(metrics.precision)}`);
  console.log(`Recall:    ${pct(metrics.recall)}`);
  console.log(`F1 score:  ${metrics.f1.toFixed(3)}`);
  console.log(`False positive rate: ${pct(metrics.falsePositiveRate)}`);
  console.log('');
  return metrics;
}

// =========================================================================
// 3. LINK MODEL — 5-fold stratified cross-validation
// =========================================================================
function evaluateLinkModel() {
  const data = loadJson('data/train-link-data.json').examples;
  const K = 5;
  const folds = stratifiedFolds(data, (e) => e.label, K, 7);

  let allPred = [];
  let allActual = [];

  for (let k = 0; k < K; k++) {
    const testSet = folds[k];
    const trainSet = folds.filter((_, i) => i !== k).flat();

    const X = [], y = [];
    trainSet.forEach((e) => {
      try {
        const { features } = extractLinkFeatures(e.url);
        X.push(features); y.push(e.label);
      } catch (err) { /* skip unparseable — none expected in curated data */ }
    });
    const foldModel = lr.train(X, y, { learningRate: 0.3, epochs: 3000, l2: 0.01 });

    testSet.forEach((e) => {
      try {
        const { features } = extractLinkFeatures(e.url);
        const prob = lr.predictProb(foldModel, features);
        allPred.push(prob >= 0.5 ? 1 : 0);
        allActual.push(e.label);
      } catch (err) { /* skip */ }
    });
  }

  const confusion = confusionCounts(allPred, allActual, 1);
  const metrics = metricsFromConfusion(confusion);

  console.log('=== Link Model: 5-fold Cross-Validation (held-out data only) ===');
  console.log(`Total examples evaluated: ${allActual.length}`);
  console.log(`Confusion matrix — TP=${confusion.tp} TN=${confusion.tn} FP=${confusion.fp} FN=${confusion.fn}`);
  console.log(`Accuracy:  ${pct(metrics.accuracy)}`);
  console.log(`Precision: ${pct(metrics.precision)}`);
  console.log(`Recall:    ${pct(metrics.recall)}`);
  console.log(`F1 score:  ${metrics.f1.toFixed(3)}`);
  console.log(`False positive rate: ${pct(metrics.falsePositiveRate)}`);
  console.log('');
  return metrics;
}

// =========================================================================
// 4. CATEGORY MODEL — accuracy only, evaluated the same held-out way
// =========================================================================
function evaluateCategoryModel() {
  const data = loadJson('data/train-message-data.json').examples.filter((e) => e.label === 'scam' && e.category);
  const K = 5;
  const folds = stratifiedFolds(data, (e) => e.category, K, 99);

  let correct = 0, total = 0;
  for (let k = 0; k < K; k++) {
    const testSet = folds[k];
    const trainSet = folds.filter((_, i) => i !== k).flat();
    if (testSet.length === 0 || trainSet.length === 0) continue;
    const foldModel = nb.train(trainSet.map((e) => e.text), trainSet.map((e) => e.category));
    testSet.forEach((e) => {
      const { predictedClass } = nb.predict(foldModel, e.text);
      if (predictedClass === e.category) correct++;
      total++;
    });
  }
  const accuracy = total ? correct / total : 0;
  console.log('=== Category Model: 5-fold Cross-Validation (11-way classification) ===');
  console.log(`Total scam examples evaluated: ${total}`);
  console.log(`Category accuracy: ${pct(accuracy)}  (random-guess baseline for 11 categories ≈ 9.1%)`);
  console.log('');
  return { accuracy, total };
}

function main() {
  console.log('BharatShield AI — Model Evaluation (real, computed, not fabricated)');
  console.log('======================================================================\n');
  const msgMetrics = evaluateMessageModel();
  const neuralMsgMetrics = evaluateNeuralMessageModel();
  const linkMetrics = evaluateLinkModel();
  const catMetrics = evaluateCategoryModel();

  console.log('======================================================================');
  const messageCount = loadJson('data/train-message-data.json').examples.length;
  const linkCount = loadJson('data/train-link-data.json').examples.length;
  console.log(`NOTE: This is a prototype-scale labeled dataset (${messageCount} messages,`);
  console.log(`${linkCount} URLs). Cross-validation on this data gives a rough, honest`);
  console.log('signal of real-world performance — not a certified benchmark. Numbers');
  console.log('will move as the dataset grows; retrain with more labeled examples for');
  console.log('a more reliable estimate.');

  // Persist the last run's numbers so README.md can quote real, reproducible figures.
  const report = {
    generatedAt: new Date().toISOString(),
    message: msgMetrics,
    neuralMessage: neuralMsgMetrics,
    link: linkMetrics,
    category: catMetrics
  };
  fs.writeFileSync(path.join(__dirname, 'data', 'last-evaluation-report.json'), JSON.stringify(report, null, 2));
}

main();
