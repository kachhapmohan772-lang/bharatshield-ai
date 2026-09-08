'use strict';

/**
 * Import a balanced, sanitized sample from the UCI SMS Spam Collection.
 *
 * Source file format:
 *   ham<TAB>message
 *   spam<TAB>message
 *
 * Project format:
 *   { text, label: "legit" | "scam", category }
 */

const fs = require('fs');
const path = require('path');

const SOURCE_PATH = path.join(__dirname, 'data', 'external', 'sms-spam-collection', 'SMSSpamCollection');
const TARGET_PATH = path.join(__dirname, 'data', 'train-message-data.json');
const DEFAULT_LIMIT_PER_CLASS = 200;

function sanitizeText(text) {
  return text
    .replace(/https?:\/\/\S+/gi, '[link]')
    .replace(/\b[\w.%+-]+@[\w.-]+\.[a-z]{2,}\b/gi, '[email]')
    .replace(/\b(?:\+?\d[\d\s().-]{6,}\d)\b/g, '[number]')
    .replace(/\s+/g, ' ')
    .trim();
}

function loadSourceRows() {
  const raw = fs.readFileSync(SOURCE_PATH, 'utf8');
  return raw
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => {
      const tabIndex = line.indexOf('\t');
      if (tabIndex === -1) return null;

      const sourceLabel = line.slice(0, tabIndex);
      const text = sanitizeText(line.slice(tabIndex + 1));
      if (!text) return null;

      if (sourceLabel === 'spam') {
        return { text, label: 'scam', category: 'public_sms_spam' };
      }

      if (sourceLabel === 'ham') {
        return { text, label: 'legit', category: null };
      }

      return null;
    })
    .filter(Boolean);
}

function main() {
  const limitPerClass = Number(process.argv[2] || DEFAULT_LIMIT_PER_CLASS);
  if (!Number.isInteger(limitPerClass) || limitPerClass <= 0) {
    throw new Error('Usage: node import-sms-spam.js [positive limit per class]');
  }

  const target = JSON.parse(fs.readFileSync(TARGET_PATH, 'utf8'));
  const existingTexts = new Set(target.examples.map((row) => row.text.toLowerCase()));

  const rows = loadSourceRows();
  const selected = [];
  const counts = { scam: 0, legit: 0 };

  for (const row of rows) {
    if (counts[row.label] >= limitPerClass) continue;
    if (existingTexts.has(row.text.toLowerCase())) continue;

    selected.push(row);
    counts[row.label]++;
    existingTexts.add(row.text.toLowerCase());

    if (counts.scam >= limitPerClass && counts.legit >= limitPerClass) break;
  }

  target.examples.push(...selected);
  fs.writeFileSync(TARGET_PATH, `${JSON.stringify(target, null, 2)}\n`);

  console.log(`Imported ${selected.length} messages from UCI SMS Spam Collection.`);
  console.log(`Scam imported: ${counts.scam}`);
  console.log(`Legit imported: ${counts.legit}`);
  console.log(`Total training messages: ${target.examples.length}`);
}

main();
