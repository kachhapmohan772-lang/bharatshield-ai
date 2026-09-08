'use strict';

/**
 * BharatShield AI — Text Preprocessor
 * Shared by training (train.js) and inference (ai-engine.js) so the exact
 * same tokenization is used in both places. This is important: an ML
 * model trained on one feature representation and served with another is
 * one of the most common real-world sources of silent, hard-to-find bugs.
 */

// Small stopword list — deliberately conservative. We keep short but
// meaningful tokens ("otp", "pin", "kyc", "now", "won", "won't") because
// they carry real signal in scam text; classic long stopword lists are
// tuned for general English prose, not this domain.
const STOPWORDS = new Set([
  'a', 'an', 'the', 'is', 'are', 'was', 'were', 'be', 'been', 'am',
  'this', 'that', 'these', 'those', 'and', 'or', 'but', 'of', 'in', 'on',
  'at', 'to', 'for', 'with', 'as', 'by', 'it', 'its', 'we', 'you', 'your',
  'i', 'my', 'me', 'he', 'she', 'they', 'them', 'his', 'her', 'their'
]);

function normalize(text) {
  return String(text)
    .toLowerCase()
    // Keep letters, digits, the rupee sign, %, and whitespace; drop other punctuation.
    .replace(/[^\p{L}\p{N}₹%\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function tokenize(text) {
  const normalized = normalize(text);
  if (!normalized) return [];
  return normalized.split(' ').filter((tok) => tok.length > 0 && !STOPWORDS.has(tok));
}

/** Unigrams + bigrams. Bigrams capture short scam phrases ("share otp",
 * "account blocked") that unigrams alone lose. */
function tokensToFeatures(tokens) {
  const features = tokens.slice();
  for (let i = 0; i < tokens.length - 1; i++) {
    features.push(tokens[i] + '_' + tokens[i + 1]);
  }
  return features;
}

function extractFeatures(text) {
  return tokensToFeatures(tokenize(text));
}

module.exports = { normalize, tokenize, tokensToFeatures, extractFeatures, STOPWORDS };
