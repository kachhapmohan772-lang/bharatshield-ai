'use strict';

const STOP_WORDS = new Set([
  'a', 'an', 'and', 'are', 'as', 'at', 'be', 'by', 'for', 'from', 'has', 'have',
  'in', 'is', 'it', 'of', 'on', 'or', 'that', 'the', 'this', 'to', 'us', 'with',
  'you', 'your'
]);

function normalizeText(input) {
  return (input || '')
    .toString()
    .toLowerCase()
    .replace(/https?:\/\/\S+/g, ' url ')
    .replace(/www\.\S+/g, ' url ')
    .replace(/rs\.?|rupees?|inr|₹/g, ' rs ')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function tokenize(input) {
  const normalized = normalizeText(input);
  if (!normalized) return [];

  const words = normalized
    .split(' ')
    .filter((word) => word.length > 1 && !STOP_WORDS.has(word));

  const bigrams = [];
  for (let i = 0; i < words.length - 1; i += 1) {
    bigrams.push(`bi:${words[i]}_${words[i + 1]}`);
  }

  return [...words, ...bigrams];
}

function humanizeToken(token) {
  return token.replace(/^bi:/, '').replace(/_/g, ' ');
}

module.exports = { normalizeText, tokenize, humanizeToken };
