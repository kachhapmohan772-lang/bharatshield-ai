'use strict';

const NEURAL_ROUTE_THRESHOLD = 50;

function clampScore(value) {
  return Math.max(0, Math.min(100, Math.round(value)));
}

function difficultyLevel(score) {
  if (score < 35) return 'easy';
  if (score <= NEURAL_ROUTE_THRESHOLD) return 'moderate';
  return 'hard';
}

function buildHybridRoute(difficultyScore, inputType, options = {}) {
  const useNeuralRoute = difficultyScore > NEURAL_ROUTE_THRESHOLD;
  const neuralAvailable = Boolean(options.neuralAvailable);
  const neuralNetworkUsed = useNeuralRoute && neuralAvailable;

  return {
    inputType,
    difficultyScore,
    difficultyLevel: difficultyLevel(difficultyScore),
    threshold: NEURAL_ROUTE_THRESHOLD,
    preferredSolver: useNeuralRoute ? 'neural-network' : 'classical-ml',
    actualSolver: neuralNetworkUsed ? 'neural-network' : 'classical-ml',
    neuralNetworkUsed,
    fallbackReason: useNeuralRoute && !neuralAvailable
      ? 'Neural-network solver is not trained yet, so BharatShield safely used the current ML model.'
      : null
  };
}

function messageDifficultyScore({ text, probabilityScam, features, vocabulary }) {
  const known = new Set(vocabulary || []);
  const unknownCount = features.filter((feature) => !known.has(feature)).length;
  const unknownRatio = features.length ? unknownCount / features.length : 1;
  const uncertainty = 1 - Math.abs(probabilityScam - 0.5) * 2;
  const shortTextPenalty = text.trim().length < 25 ? 0.15 : 0;

  return clampScore((uncertainty * 70) + (unknownRatio * 20) + (shortTextPenalty * 100));
}

function linkDifficultyScore({ probabilitySuspicious, signals }) {
  const uncertainty = 1 - Math.abs(probabilitySuspicious - 0.5) * 2;
  const weakEvidencePenalty = signals.length === 0 ? 0.2 : 0;

  return clampScore((uncertainty * 80) + (weakEvidencePenalty * 100));
}

module.exports = {
  NEURAL_ROUTE_THRESHOLD,
  buildHybridRoute,
  messageDifficultyScore,
  linkDifficultyScore
};