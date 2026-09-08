'use strict';

const fs = require('fs');
const path = require('path');
const { tokenize } = require('../ml/textPreprocess');

const PROJECT_ROOT = path.resolve(__dirname, '..');
const DATA_PATH = path.join(PROJECT_ROOT, 'data', 'message-training-data.json');
const MODEL_DIR = path.join(PROJECT_ROOT, 'models');
const MODEL_PATH = path.join(MODEL_DIR, 'message-model.json');
const LABELS = ['safe', 'scam'];

function emptyLabelStats() {
  return {
    docCount: 0,
    totalTokens: 0,
    tokenCounts: {}
  };
}

function increment(map, key, amount = 1) {
  map[key] = (map[key] || 0) + amount;
}

function validateExample(example, index) {
  if (!example || typeof example !== 'object') {
    throw new Error(`Training example ${index} must be an object.`);
  }
  if (typeof example.text !== 'string' || !example.text.trim()) {
    throw new Error(`Training example ${index} needs non-empty text.`);
  }
  if (!LABELS.includes(example.label)) {
    throw new Error(`Training example ${index} has unsupported label: ${example.label}`);
  }
  if (example.label === 'scam' && (!example.categoryId || !example.category)) {
    throw new Error(`Scam example ${index} needs categoryId and category.`);
  }
}

function train(examples) {
  const labelStats = Object.fromEntries(LABELS.map((label) => [label, emptyLabelStats()]));
  const categoryStats = {};
  const vocabulary = new Set();

  examples.forEach((example, index) => {
    validateExample(example, index);
    const tokens = tokenize(example.text);
    const label = example.label;

    labelStats[label].docCount += 1;
    labelStats[label].totalTokens += tokens.length;
    tokens.forEach((token) => {
      vocabulary.add(token);
      increment(labelStats[label].tokenCounts, token);
    });

    if (label === 'scam') {
      const id = example.categoryId;
      if (!categoryStats[id]) {
        categoryStats[id] = {
          id,
          name: example.category,
          docCount: 0,
          totalTokens: 0,
          tokenCounts: {}
        };
      }
      categoryStats[id].docCount += 1;
      categoryStats[id].totalTokens += tokens.length;
      tokens.forEach((token) => increment(categoryStats[id].tokenCounts, token));
    }
  });

  return {
    version: new Date().toISOString(),
    algorithm: 'multinomial-naive-bayes',
    labels: LABELS,
    vocabulary: Array.from(vocabulary).sort(),
    totalDocuments: examples.length,
    labelStats,
    categoryStats,
    notes: [
      'Seed model for local ML classification.',
      'Add more labelled examples to src/data/message-training-data.json, then run npm.cmd run train:ml.'
    ]
  };
}

function main() {
  const raw = fs.readFileSync(DATA_PATH, 'utf8');
  const examples = JSON.parse(raw);
  const model = train(examples);

  fs.mkdirSync(MODEL_DIR, { recursive: true });
  fs.writeFileSync(MODEL_PATH, JSON.stringify(model, null, 2) + '\n');
  console.log(`Trained ${model.algorithm} model with ${model.totalDocuments} examples.`);
  console.log(`Vocabulary size: ${model.vocabulary.length}`);
  console.log(`Model written to ${MODEL_PATH}`);
}

if (require.main === module) {
  main();
}

module.exports = { train };
