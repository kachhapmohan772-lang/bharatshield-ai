# BharatShield AI — Logic / Algorithm Layer (v2.0.0-ml)

This package is **only** the detection brain — no UI, no server/networking
code. It is real, trained machine learning: **Multinomial Naive Bayes** for
message text and **Logistic Regression** for links, both implemented from
scratch in plain JavaScript (zero external ML dependencies) and trained on
a labeled dataset instead of hand-written if/else rules.

It keeps the exact same output contract as the earlier rule-based version,
so it drops into the existing frontend/backend without either of those
needing to change:

```js
const engine = require('./src/ai-engine');
engine.analyzeMessage(text);  // -> { riskLevel, riskScore, category, signals[], ... }
engine.analyzeLink(url);      // -> same shape, plus { hostname, fullUrlChecked }
```

## Why this counts as real AI/ML — and what it honestly isn't

You asked specifically for this to *think* and *learn*, not just pattern-match
against a fixed list of if/else rules. Here's exactly what changed and why:

| | Old version (v1) | This version (v2, ML) |
|---|---|---|
| How risk is decided | Hand-written regex rules with manually assigned weights | Statistical parameters **learned from labeled examples** via probability estimation (Naive Bayes) and gradient descent (Logistic Regression) |
| Generalization | Only catches text matching an authored pattern | Generalizes to reworded, unseen scam text it was never explicitly told about — see the "novel wording" test results below |
| "Why" explanation | Fixed template text per rule | Computed live from the trained model's own learned log-odds/weights — the explanation *is* the model's actual reasoning, not a lookup table |
| Improves with more data | No — you'd have to write new regex | Yes — add labeled rows to `/data/*.json` and re-run `npm run train` |

**What this is not, and I'm not going to pretend otherwise:** this is not a
deep neural network and not a large language model. Naive Bayes and
Logistic Regression are classical, well-understood supervised ML
algorithms — chosen deliberately because:

1. **Data reality.** This prototype has ~105 labeled messages and 60 labeled
   URLs. A neural network / transformer needs thousands to millions of
   labeled examples to generalize; trained on 105 examples it would simply
   memorize them and fail on anything new. Naive Bayes is specifically
   well-suited to small labeled datasets like this one.
2. **Explainability requirement.** BharatShield's entire premise is "show
   the evidence, not just a verdict." Naive Bayes and logistic regression
   are directly interpretable — every prediction can be decomposed into
   exactly which words/features pushed it toward which class, and by how
   much. A neural net would need a separate, approximate explainability
   technique bolted on afterward.
3. **No infrastructure dependency.** Runs anywhere Node runs, no GPU, no
   external API, no model download.

If/when a much larger labeled dataset becomes available, the same
`analyzeMessage()`/`analyzeLink()` contract can be re-implemented behind a
larger model (e.g. a fine-tuned transformer via a real ML platform) without
touching the frontend or backend integration at all — that's the entire
point of keeping this as an isolated Logic/Algorithm layer.

## How it actually learns (the training pipeline)

```
/data/train-message-data.json  ─┐
/data/train-link-data.json     ─┼──►  train.js  ──►  src/trained-model.json
                                 │      (learns parameters
                                 │       from labeled examples)
                                 ▼
                          evaluate.js
                    (measures real accuracy on
                     data the model never trained on)
```

1. **`train.js`** reads the labeled datasets and fits three models:
   - A binary Naive Bayes model: scam vs. legit, learned from word/phrase
     frequency statistics in each class (with Laplace smoothing).
   - A category Naive Bayes model: which scam type (OTP theft, fake KYC,
     prize scam, ...), trained only on the scam-labeled rows.
   - A Logistic Regression model for links: 11 engineered numeric URL
     features (HTTPS use, subdomain count, brand-impersonation pattern,
     etc.), with weights fitted by gradient descent.
   - A small **calibration model** (Platt scaling — itself a trained
     logistic regression) that turns Naive Bayes' typically overconfident
     raw output into a well-spread 0–100 risk score.
   All learned parameters are written to `src/trained-model.json`.

2. **`src/ai-engine.js`** loads that file once and does inference only —
   it never trains on the fly, mirroring how real ML systems are deployed
   (train offline, serve a frozen versioned artifact).

3. **`evaluate.js`** measures real accuracy via **5-fold stratified
   cross-validation** — each fold's model is retrained from scratch on the
   other folds and tested only on data it has never seen. This is the
   honest way to estimate real-world performance; testing on the training
   set itself would overstate accuracy, which this deliberately avoids.

### Retraining with more data

Add labeled rows to `data/train-message-data.json` or
`data/train-link-data.json` (same shape as the existing rows), then:

```bash
npm run train      # relearns all parameters, writes a new trained-model.json
npm run evaluate    # re-measures real accuracy on the updated data
npm test             # re-runs all correctness/regression tests
```

## Real measured performance (not fabricated — reproduce it yourself)

Run `npm run evaluate` to see this computed live. Latest run on this dataset:

| Model | Accuracy | Precision | Recall | F1 | False positive rate |
|---|---|---|---|---|---|
| Message (scam vs legit) | 93.3% | 93.2% | 97.1% | 0.951 | 14.3% |
| Link (suspicious vs safe) | 96.7% | 100% | 93.3% | 0.966 | 0.0% |
| Category (11-way, scam only) | 82.9% | — | — | — | (random baseline ≈ 9.1%) |

**Read this honestly:** these numbers come from 5-fold cross-validation on
a *small, prototype-scale* dataset (105 messages, 60 URLs) — they are a
genuine, reproducible signal that the model is learning real patterns
(well above chance), not a certified benchmark. The 14.3% false-positive
rate on messages is a real limitation worth knowing about before treating
any single "HIGH RISK" result as certain — exactly why every response
still carries a "verify through official channels" disclaimer rather than
a bare verdict. Expect these numbers to improve as the labeled dataset
grows.

### Demonstrated generalization to unseen wording (not memorization)

None of these exact sentences exist in the training data — this is what
"learning a pattern" vs. "matching a fixed rule" looks like in practice:

| Input (reworded, not in training data) | Risk level | Score |
|---|---|---|
| "Hi beta, your Aadhaar card KYC needs updating else mobile SIM will stop working from tomorrow" | MEDIUM | 42 |
| "Dear valued customer, we noticed unusual activity, kindly verify your identity by sharing the code sent to your phone" | HIGH | 68 |
| "Hey, are we still meeting for coffee tomorrow around 5?" | LOW | 12 |
| "FINAL NOTICE: pay outstanding electricity dues within 6 hours or face disconnection, click link to pay" | CRITICAL | 79 |
| "The quarterly board meeting has been moved to next Thursday at 11am" | LOW | 6 |

## Correctness (the "no bugs" requirement)

`npm test` runs **39 automated tests** — all passing — covering:

- Every module in isolation (preprocessing, Naive Bayes, logistic
  regression, URL feature extraction) with edge cases: empty input, null/
  undefined, oversized input, unsafe URL schemes, malformed URLs.
- **Two real bugs found and fixed** while hardening the earlier rule-based
  URL logic, now covered by explicit regression tests so they can't silently
  return:
  1. Naive substring brand-matching used to false-flag unrelated domains
     (e.g. `urbanking.com` was wrongly flagged for containing "bank"). Fixed
     by requiring the brand to appear as its own hyphen/dot-bounded token,
     and verified with `test/logic.test.js: "REGRESSION: hostname substring
     false positive..."`.
  2. The same naive matching could flag a brand's *own real domain* as
     impersonating itself (e.g. `hdfcbank.com` matching "bank"-like
     substrings). Fixed by checking the matched brand against a short list
     of that brand's actual official domains before flagging, verified by
     `test/logic.test.js: "REGRESSION: legitimate hdfcbank.com..."`.
- Full-pipeline integration tests through `ai-engine.js`: contract shape,
  score bounds (always a finite integer 0–100), determinism (same input
  always produces the same output), and relative sanity (an obvious scam
  scores meaningfully higher than an obvious legitimate message).

Run it yourself:
```bash
npm test
```

## File map

```
bharatshield-logic/
├── data/
│   ├── train-message-data.json      (105 labeled messages)
│   ├── train-link-data.json         (60 labeled URLs)
│   └── last-evaluation-report.json  (written by evaluate.js each run)
├── src/
│   ├── text-preprocessor.js         (tokenization, shared by train + inference)
│   ├── naive-bayes.js               (from-scratch Naive Bayes: train/predict/explain)
│   ├── logistic-regression.js       (from-scratch logistic regression: train/predict/explain)
│   ├── link-features.js             (URL → numeric feature vector, shared by train + inference)
│   ├── ai-engine.js                 (runtime: loads trained-model.json, exposes analyzeMessage/analyzeLink)
│   └── trained-model.json           (learned parameters — generated by train.js, not hand-written)
├── train.js                         (run this to (re)train all models)
├── evaluate.js                      (run this to measure real accuracy via cross-validation)
├── test/logic.test.js               (39 automated correctness/regression tests)
├── package.json
└── README.md
```

## Known limitations (stated honestly, not hidden)

- **Small training set.** 105 messages / 60 URLs is enough to prove the
  approach genuinely learns and generalizes, but real deployment should
  grow this dataset substantially — accuracy will improve with more data.
- **English only.** The text model has no Hindi/Hinglish training examples
  yet; Devanagari or heavily-Hinglish text will mostly fall back to "no
  strong indicators," i.e. it can under-detect rather than over-detect —
  add labeled Hindi/Hinglish rows to extend this.
- **11 fixed scam categories.** Text that resembles a scam pattern but
  doesn't cleanly fit one of the trained categories gets assigned the
  closest match, which can occasionally be the wrong category even when
  the risk level itself is correctly high.
- **14.3% false-positive rate on messages** (measured, see above) — this
  is exactly why results are framed as "risk indicators detected," never
  as a certain verdict.
- **Concatenated typosquats without a separator** (e.g. `securehdfcbank.xyz`
  with no hyphen) can evade the brand-impersonation feature, by design —
  the alternative (unbounded substring matching) was the exact bug this
  version fixes. This is a documented false-negative trade-off, not an
  oversight: **LOW risk is never presented as a safety guarantee.**

## Responsible AI notes

- Every result includes a disclaimer and verification guidance — never a
  bare "this is a scam" verdict, in line with BharatShield's core design
  principle (RISK → WHY → EVIDENCE → ACTION).
- Confidence is reported honestly (`low`/`medium`/`high`) based on how far
  the calibrated probability sits from the 50/50 decision boundary — the
  model does not claim certainty it doesn't have.
- User-submitted text is only ever treated as data to classify — nothing
  in this layer executes, evaluates, or "obeys" text found inside a
  message or URL.
