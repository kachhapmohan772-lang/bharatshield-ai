'use strict';

/**
 * BharatShield AI — Training Pipeline
 * -----------------------------------------------------------------------
 * Run this to (re)train every model from the labeled data in /data and
 * write the learned parameters to src/trained-model.json. The runtime
 * engine (src/ai-engine.js) only ever reads that file — it never trains
 * on the fly — mirroring a real ML deployment: train offline, serve a
 * frozen, versioned artifact at inference time.
 *
 * Run: node train.js
 * -----------------------------------------------------------------------
 */

const fs = require('fs');
const path = require('path');

const nb = require('./src/naive-bayes');
const lr = require('./src/logistic-regression');
const nn = require('./src/neural-network');
const { extractLinkFeatures } = require('./src/link-features');
const { extractFeatures } = require('./src/text-preprocessor');

function loadJson(relPath) {
  return JSON.parse(fs.readFileSync(path.join(__dirname, relPath), 'utf8'));
}

function main() {
  console.log('=== BharatShield AI — Training Pipeline ===\n');

  // -----------------------------------------------------------------
  // 1. Binary message model (scam vs legit) — Naive Bayes
  // -----------------------------------------------------------------
  const messageData = loadJson('data/train-message-data.json').examples;
  const texts = messageData.map((e) => e.text);
  const binaryLabels = messageData.map((e) => e.label);

  console.log(`[1/6] Training binary Naive Bayes on ${texts.length} messages...`);
  const binaryModel = nb.train(texts, binaryLabels);
  console.log(`      Vocabulary size: ${binaryModel.vocabSize} tokens`);
  console.log(`      Classes: ${binaryModel.classes.join(', ')} (priors: ${binaryModel.classes.map((c) => `${c}=${Math.exp(binaryModel.logPriors[c]).toFixed(2)}`).join(', ')})\n`);

  // -----------------------------------------------------------------
  // 2. Category model (scam sub-type) — Naive Bayes, scam rows only
  // -----------------------------------------------------------------
  const scamRows = messageData.filter((e) => e.label === 'scam' && e.category);
  const categoryTexts = scamRows.map((e) => e.text);
  const categoryLabels = scamRows.map((e) => e.category);

  console.log(`[2/6] Training category Naive Bayes on ${categoryTexts.length} scam messages across ${new Set(categoryLabels).size} categories...`);
  const categoryModel = nb.train(categoryTexts, categoryLabels);
  console.log(`      Categories: ${categoryModel.classes.join(', ')}\n`);

  // -----------------------------------------------------------------
  // 3. Calibration model — learned Platt scaling on top of raw NB
  //    log-odds, so risk scores spread meaningfully across 0-100
  //    instead of Naive Bayes' typically overconfident near-0/near-1
  //    outputs. This itself is a small trained logistic regression
  //    (1 input feature: average per-token log-odds).
  // -----------------------------------------------------------------
  console.log('[3/6] Fitting calibration model (Platt scaling) on raw log-odds...');
  const calibX = [];
  const calibY = [];
  for (let i = 0; i < texts.length; i++) {
    const { logScores } = nb.scoreAllClasses(binaryModel, texts[i]);
    const featureCount = Math.max(1, extractFeatures(texts[i]).length);
    const avgLogOdds = (logScores.scam - logScores.legit) / featureCount;
    calibX.push([avgLogOdds]);
    calibY.push(binaryLabels[i] === 'scam' ? 1 : 0);
  }
  const calibrationModel = lr.train(calibX, calibY, { learningRate: 0.5, epochs: 3000, l2: 0.001 });
  console.log(`      Calibration weight=${calibrationModel.weights[0].toFixed(3)}, bias=${calibrationModel.bias.toFixed(3)}, final loss=${calibrationModel.finalLoss.toFixed(4)}\n`);

  // -----------------------------------------------------------------
  // 4. Link risk model — Logistic Regression on engineered URL features
  // -----------------------------------------------------------------
  const linkData = loadJson('data/train-link-data.json').examples;
  const linkX = [];
  const linkY = [];
  let linkSkipped = 0;
  for (const row of linkData) {
    try {
      const { features } = extractLinkFeatures(row.url);
      linkX.push(features);
      linkY.push(row.label);
    } catch (e) {
      linkSkipped++;
    }
  }
  console.log(`[4/6] Training message neural network on ${texts.length} messages...`);
  const neuralMessageModel = nn.train(texts, binaryLabels, { maxVocab: 700, hiddenSize: 24, epochs: 18, learningRate: 0.035, l2: 0.0005, seed: 42 });
  console.log(`      Hidden units: ${neuralMessageModel.hiddenSize}, vocabulary: ${neuralMessageModel.inputSize}, final loss=${neuralMessageModel.finalLoss.toFixed(4)}\n`);

  console.log(`[5/6] Training logistic regression on ${linkX.length} URLs (${linkSkipped} skipped as unparseable)...`);
  const linkModel = lr.train(linkX, linkY, { learningRate: 0.3, epochs: 4000, l2: 0.01 });
  console.log(`      Final training loss: ${linkModel.finalLoss.toFixed(4)}\n`);

  // -----------------------------------------------------------------
  // 6. Serialize everything the runtime engine needs
  // -----------------------------------------------------------------
  const artifact = {
    version: '2.0.0-ml',
    trainedAt: new Date().toISOString(),
    meta: {
      messageTrainingExamples: texts.length,
      categoryTrainingExamples: categoryTexts.length,
      linkTrainingExamples: linkX.length,
      neuralMessageTrainingExamples: texts.length
    },
    binaryModel,
    categoryModel,
    calibrationModel,
    neuralMessageModel,
    linkModel
  };

  const outPath = path.join(__dirname, 'src', 'trained-model.json');
  fs.writeFileSync(outPath, JSON.stringify(artifact));
  console.log(`[6/6] Trained model artifact written to ${path.relative(__dirname, outPath)}`);
  console.log(`\nDone. Run "node evaluate.js" next to measure real accuracy on held-out data.`);
}

main();
