'use strict';

/**
 * BharatShield AI — Multinomial Naive Bayes (from scratch)
 * -----------------------------------------------------------------------
 * A real, trained statistical machine-learning classifier — not a set of
 * hand-written if/else rules. Parameters (word likelihoods per class,
 * class priors) are estimated from labeled training data via maximum
 * likelihood with Laplace (add-one) smoothing, then used to compute a
 * posterior probability for unseen text via Bayes' theorem.
 *
 * Why Naive Bayes for this project (documented honestly, see README):
 *   - It performs well on small labeled text datasets, which is the
 *     realistic amount of data a prototype has. Deep learning / LLM
 *     fine-tuning needs orders of magnitude more labeled examples and
 *     compute than a prototype can provide — using one here would be
 *     dishonest theatre, not a better model.
 *   - It is inherently explainable: every prediction can be decomposed
 *     into the exact per-word contribution that pushed it toward or away
 *     from a class, via log-likelihood ratios — which maps directly onto
 *     BharatShield's "show the evidence" requirement.
 *   - It is fast enough to train and run entirely client- or server-side
 *     with zero external ML infrastructure.
 * -----------------------------------------------------------------------
 */

const { extractFeatures } = require('./text-preprocessor');

const LAPLACE_ALPHA = 1; // additive smoothing constant

/**
 * Train a multinomial Naive Bayes model.
 * @param {string[]} texts - raw training documents
 * @param {string[]} labels - class label per document (same length as texts)
 * @returns {object} model - serializable trained parameters
 */
function train(texts, labels) {
  if (!Array.isArray(texts) || !Array.isArray(labels) || texts.length !== labels.length) {
    throw new Error('train() requires texts[] and labels[] of equal length.');
  }
  if (texts.length === 0) {
    throw new Error('train() requires at least one training example.');
  }

  const classes = Array.from(new Set(labels));
  const classDocCount = {};
  const classWordCount = {}; // total feature-token count per class (for denominator)
  const classWordFreq = {}; // { class: { feature: count } }
  const vocabulary = new Set();

  classes.forEach((c) => {
    classDocCount[c] = 0;
    classWordCount[c] = 0;
    classWordFreq[c] = Object.create(null);
  });

  for (let i = 0; i < texts.length; i++) {
    const cls = labels[i];
    classDocCount[cls] += 1;
    const features = extractFeatures(texts[i]);
    for (const f of features) {
      vocabulary.add(f);
      classWordFreq[cls][f] = (classWordFreq[cls][f] || 0) + 1;
      classWordCount[cls] += 1;
    }
  }

  const totalDocs = texts.length;
  const vocabSize = vocabulary.size;

  const logPriors = {};
  classes.forEach((c) => {
    logPriors[c] = Math.log(classDocCount[c] / totalDocs);
  });

  // Precompute log P(word|class) for every vocabulary word, for every
  // class, with Laplace smoothing — this is the "learned" part of the
  // model: these are empirical conditional probabilities, not authored.
  const logLikelihoods = {}; // { class: { feature: logProb } }
  classes.forEach((c) => {
    logLikelihoods[c] = Object.create(null);
    const denom = classWordCount[c] + LAPLACE_ALPHA * vocabSize;
    vocabulary.forEach((f) => {
      const count = classWordFreq[c][f] || 0;
      logLikelihoods[c][f] = Math.log((count + LAPLACE_ALPHA) / denom);
    });
  });

  return {
    classes,
    vocabulary: Array.from(vocabulary),
    logPriors,
    logLikelihoods,
    classWordCount,
    vocabSize,
    trainedOn: totalDocs,
    alpha: LAPLACE_ALPHA
  };
}

/**
 * Compute unnormalized log-posterior for every class, then softmax into
 * a proper probability distribution that sums to 1.
 */
function scoreAllClasses(model, text) {
  const features = extractFeatures(text);
  const logScores = {};

  model.classes.forEach((c) => {
    let logScore = model.logPriors[c];
    const denom = model.classWordCount[c] + model.alpha * model.vocabSize;
    const unseenLogProb = Math.log(model.alpha / denom); // for OOV features
    for (const f of features) {
      const known = Object.prototype.hasOwnProperty.call(model.logLikelihoods[c], f);
      logScore += known ? model.logLikelihoods[c][f] : unseenLogProb;
    }
    logScores[c] = logScore;
  });

  // Softmax for numerically stable probability conversion.
  const maxLog = Math.max(...Object.values(logScores));
  const exps = {};
  let sumExp = 0;
  model.classes.forEach((c) => {
    exps[c] = Math.exp(logScores[c] - maxLog);
    sumExp += exps[c];
  });
  const probs = {};
  model.classes.forEach((c) => { probs[c] = exps[c] / sumExp; });

  return { logScores, probs };
}

function predict(model, text) {
  const { probs } = scoreAllClasses(model, text);
  let bestClass = model.classes[0];
  let bestProb = -Infinity;
  model.classes.forEach((c) => {
    if (probs[c] > bestProb) { bestProb = probs[c]; bestClass = c; }
  });
  return { predictedClass: bestClass, probability: bestProb, probs };
}

/**
 * Explainability: for a binary (2-class) model, return the tokens from
 * this document that contributed most strongly toward the predicted
 * class, ranked by log-odds ratio [log P(word|class) - log P(word|other)].
 * This is a standard, well-understood Naive Bayes interpretability
 * technique — not an approximation bolted on afterward.
 */
function explainBinary(model, text, positiveClass, negativeClass, topN = 6) {
  if (!model.classes.includes(positiveClass) || !model.classes.includes(negativeClass)) {
    throw new Error('explainBinary requires both classes to exist in the model.');
  }
  const features = extractFeatures(text);
  const seen = new Set();
  const contributions = [];

  for (const f of features) {
    if (seen.has(f)) continue; // report each distinct token once
    seen.add(f);
    const posKnown = Object.prototype.hasOwnProperty.call(model.logLikelihoods[positiveClass], f);
    const negKnown = Object.prototype.hasOwnProperty.call(model.logLikelihoods[negativeClass], f);
    if (!posKnown && !negKnown) continue; // never seen in training at all — no evidence value
    const posDenom = model.classWordCount[positiveClass] + model.alpha * model.vocabSize;
    const negDenom = model.classWordCount[negativeClass] + model.alpha * model.vocabSize;
    const posLog = posKnown ? model.logLikelihoods[positiveClass][f] : Math.log(model.alpha / posDenom);
    const negLog = negKnown ? model.logLikelihoods[negativeClass][f] : Math.log(model.alpha / negDenom);
    contributions.push({ token: f, logOdds: posLog - negLog });
  }

  contributions.sort((a, b) => b.logOdds - a.logOdds);
  return contributions.slice(0, topN).filter((c) => c.logOdds > 0);
}

module.exports = { train, scoreAllClasses, predict, explainBinary };
