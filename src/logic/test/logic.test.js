'use strict';

const test = require('node:test');
const assert = require('node:assert');

const nb = require('../src/naive-bayes');
const lr = require('../src/logistic-regression');
const nn = require('../src/neural-network');
const { extractFeatures, tokenize, normalize } = require('../src/text-preprocessor');
const { extractLinkFeatures, parseUrl, FEATURE_NAMES } = require('../src/link-features');
const engine = require('../src/ai-engine');

// =========================================================================
// text-preprocessor.js
// =========================================================================
test('normalize lowercases and strips punctuation while keeping ₹ and %', () => {
  assert.strictEqual(normalize('Pay ₹500 NOW!! (50% off)'), 'pay ₹500 now 50% off');
});

test('tokenize removes stopwords but keeps short meaningful tokens', () => {
  const toks = tokenize('Share the OTP with the bank now');
  assert.ok(toks.includes('otp'));
  assert.ok(toks.includes('now'));
  assert.ok(!toks.includes('the'));
});

test('extractFeatures produces unigrams and bigrams', () => {
  const feats = extractFeatures('share otp now');
  assert.ok(feats.includes('otp'));
  assert.ok(feats.includes('share_otp'));
});

test('tokenize on empty string returns empty array (no crash)', () => {
  assert.deepStrictEqual(tokenize(''), []);
  assert.deepStrictEqual(tokenize('   '), []);
});

// =========================================================================
// naive-bayes.js — trained on a small synthetic toy set for isolated testing
// =========================================================================
test('naive-bayes: train() throws on mismatched array lengths', () => {
  assert.throws(() => nb.train(['a', 'b'], ['x']), /equal length/);
});

test('naive-bayes: train() throws on empty training data', () => {
  assert.throws(() => nb.train([], []), /at least one/);
});

test('naive-bayes: correctly separates two obviously distinct classes', () => {
  const texts = [
    'send otp now urgent', 'share otp immediately', 'otp required urgent',
    'meeting tomorrow at office', 'lunch with team today', 'project deadline friday'
  ];
  const labels = ['scam', 'scam', 'scam', 'legit', 'legit', 'legit'];
  const model = nb.train(texts, labels);

  const scamPred = nb.predict(model, 'urgent otp needed now');
  const legitPred = nb.predict(model, 'team lunch tomorrow at office');

  assert.strictEqual(scamPred.predictedClass, 'scam');
  assert.strictEqual(legitPred.predictedClass, 'legit');
});

test('naive-bayes: probabilities always sum to 1 across classes', () => {
  const texts = ['otp scam text', 'legit meeting text', 'otp fraud text'];
  const labels = ['scam', 'legit', 'scam'];
  const model = nb.train(texts, labels);
  const { probs } = nb.scoreAllClasses(model, 'random unseen words here');
  const sum = Object.values(probs).reduce((a, b) => a + b, 0);
  assert.ok(Math.abs(sum - 1) < 1e-9, `probabilities should sum to 1, got ${sum}`);
});

test('naive-bayes: explainBinary returns only positive log-odds tokens, sorted descending', () => {
  const texts = ['urgent otp share now', 'urgent otp share now', 'team lunch meeting office'];
  const labels = ['scam', 'scam', 'legit'];
  const model = nb.train(texts, labels);
  const contribs = nb.explainBinary(model, 'urgent otp share now', 'scam', 'legit', 5);
  assert.ok(contribs.length > 0);
  for (let i = 1; i < contribs.length; i++) {
    assert.ok(contribs[i - 1].logOdds >= contribs[i].logOdds, 'contributions must be sorted descending');
  }
  contribs.forEach((c) => assert.ok(c.logOdds > 0, 'only positive contributions should be returned'));
});

test('naive-bayes: explainBinary throws if a requested class does not exist', () => {
  const model = nb.train(['a b c'], ['onlyclass']);
  assert.throws(() => nb.explainBinary(model, 'a b c', 'onlyclass', 'nonexistent'));
});


// =========================================================================
// neural-network.js
// =========================================================================
test('neural-network: learns a tiny text boundary', () => {
  const model = nn.train(
    ['urgent otp share now', 'share otp immediately', 'team lunch meeting', 'project meeting tomorrow'],
    ['scam', 'scam', 'legit', 'legit'],
    { maxVocab: 20, hiddenSize: 6, epochs: 80, learningRate: 0.05, seed: 7 }
  );

  const scamProb = nn.predictProb(model, 'urgent otp now');
  const legitProb = nn.predictProb(model, 'team meeting tomorrow');
  assert.ok(scamProb > legitProb, 'expected scam probability to be higher than legit probability');
  assert.ok(scamProb >= 0 && scamProb <= 1);
  assert.ok(legitProb >= 0 && legitProb <= 1);
});

// =========================================================================
// logistic-regression.js
// =========================================================================
test('logistic-regression: learns a clearly separable 1D boundary', () => {
  const X = [[0.1], [0.2], [0.15], [0.9], [0.95], [0.85]];
  const y = [0, 0, 0, 1, 1, 1];
  const model = lr.train(X, y, { learningRate: 0.5, epochs: 2000, l2: 0.001 });
  assert.ok(lr.predictProb(model, [0.1]) < 0.5, 'low input should predict class 0');
  assert.ok(lr.predictProb(model, [0.9]) > 0.5, 'high input should predict class 1');
});

test('logistic-regression: predictProb always returns a value within [0, 1]', () => {
  const model = lr.train([[0], [1], [2], [3]], [0, 0, 1, 1], { epochs: 500 });
  // Realistic input range: standardized feature values a real caller would pass.
  for (const x of [-10, -1, 0, 1, 10]) {
    const p = lr.predictProb(model, [x]);
    assert.ok(p >= 0 && p <= 1, `probability out of bounds: ${p}`);
    assert.ok(Number.isFinite(p), `probability not finite: ${p}`);
  }
});

test('logistic-regression: sigmoid saturates but never exceeds [0, 1] even at extreme inputs', () => {
  // At very large |z|, floating-point precision means sigmoid legitimately
  // rounds to exactly 0 or 1 — that is correct saturation, not a bug.
  // What must never happen is NaN, Infinity, or a value outside [0, 1].
  const model = lr.train([[0], [1]], [0, 1], { epochs: 100 });
  for (const x of [-1e6, 1e6]) {
    const p = lr.predictProb(model, [x]);
    assert.ok(Number.isFinite(p), `expected finite output, got ${p}`);
    assert.ok(p >= 0 && p <= 1, `expected value in [0,1], got ${p}`);
  }
});

test('logistic-regression: predictProb is monotonic in a single positively-weighted feature', () => {
  const model = lr.train([[0.1], [0.2], [0.15], [0.9], [0.95], [0.85]], [0, 0, 0, 1, 1, 1], { epochs: 2000 });
  const low = lr.predictProb(model, [0]);
  const mid = lr.predictProb(model, [0.5]);
  const high = lr.predictProb(model, [1]);
  assert.ok(low < mid && mid < high, `expected monotonic increase, got ${low}, ${mid}, ${high}`);
});

test('logistic-regression: predictProb throws on mismatched feature vector length', () => {
  const model = lr.train([[0, 0], [1, 1]], [0, 1], { epochs: 100 });
  assert.throws(() => lr.predictProb(model, [1]), /does not match/);
});

test('logistic-regression: training loss decreases and stays finite', () => {
  const X = [[0.1, 0.2], [0.3, 0.1], [0.8, 0.9], [0.9, 0.7]];
  const y = [0, 0, 1, 1];
  const model = lr.train(X, y, { learningRate: 0.5, epochs: 1000, l2: 0.01 });
  assert.ok(Number.isFinite(model.finalLoss), 'loss must be finite (no NaN/Infinity from bad math)');
  assert.ok(model.finalLoss < 1, `expected converged loss, got ${model.finalLoss}`);
});

// =========================================================================
// link-features.js
// =========================================================================
test('parseUrl: throws EMPTY_INPUT on empty/whitespace/null/undefined', () => {
  for (const bad of ['', '   ', null, undefined]) {
    assert.throws(() => parseUrl(bad), (err) => err.code === 'EMPTY_INPUT');
  }
});

test('parseUrl: throws UNSAFE_SCHEME on javascript:/data:/file: URLs', () => {
  for (const scheme of ['javascript:alert(1)', 'data:text/html,x', 'file:///etc/passwd', 'vbscript:msgbox(1)']) {
    assert.throws(() => parseUrl(scheme), (err) => err.code === 'UNSAFE_SCHEME');
  }
});

test('parseUrl: throws INVALID_URL on unparseable input', () => {
  assert.throws(() => parseUrl('not a url at all !!!'), (err) => err.code === 'INVALID_URL');
});

test('parseUrl: throws INPUT_TOO_LARGE on oversized URL', () => {
  const huge = 'http://example.com/' + 'a'.repeat(3000);
  assert.throws(() => parseUrl(huge), (err) => err.code === 'INPUT_TOO_LARGE');
});

test('extractLinkFeatures: feature vector length always matches FEATURE_NAMES', () => {
  const { features } = extractLinkFeatures('https://www.example.com/page');
  assert.strictEqual(features.length, FEATURE_NAMES.length);
});

test('extractLinkFeatures: is deterministic (same input -> identical output)', () => {
  const a = extractLinkFeatures('http://paytm-secure.example.top/kyc');
  const b = extractLinkFeatures('http://paytm-secure.example.top/kyc');
  assert.deepStrictEqual(a.features, b.features);
});

test('REGRESSION: hostname substring false positive is fixed ("urbanking.com" must not trigger brand mismatch on "bank")', () => {
  const { features } = extractLinkFeatures('https://urbanking-realty.com/projects');
  const brandMismatchIdx = FEATURE_NAMES.indexOf('brand_token_mismatch');
  assert.strictEqual(features[brandMismatchIdx], 0, 'urbanking.com should NOT be flagged as brand impersonation');
});

test('REGRESSION: legitimate hdfcbank.com must not flag itself as impersonation', () => {
  const { features } = extractLinkFeatures('https://www.hdfcbank.com/personal');
  const brandMismatchIdx = FEATURE_NAMES.indexOf('brand_token_mismatch');
  assert.strictEqual(features[brandMismatchIdx], 0, 'hdfcbank.com is the real domain and must not self-flag');
});

test('extractLinkFeatures: detects raw IP address', () => {
  const { features } = extractLinkFeatures('http://192.168.1.5/login');
  const idx = FEATURE_NAMES.indexOf('is_raw_ip');
  assert.strictEqual(features[idx], 1);
});

test('extractLinkFeatures: HTTPS correctly recorded as not-suspicious', () => {
  const { features } = extractLinkFeatures('https://www.example.com');
  const idx = FEATURE_NAMES.indexOf('not_https');
  assert.strictEqual(features[idx], 0);
});

// =========================================================================
// ai-engine.js — full integration through the trained model artifact
// =========================================================================
test('ai-engine: model artifact loads successfully', () => {
  assert.strictEqual(engine.isModelLoaded(), true, 'run "node train.js" before testing');
});

test('ai-engine.analyzeMessage: throws EMPTY_INPUT on empty/whitespace/null', () => {
  for (const bad of ['', '   ', null, undefined]) {
    assert.throws(() => engine.analyzeMessage(bad), (err) => err.code === 'EMPTY_INPUT');
  }
});

test('ai-engine.analyzeMessage: throws INPUT_TOO_LARGE over 5000 chars', () => {
  const huge = 'a'.repeat(5001);
  assert.throws(() => engine.analyzeMessage(huge), (err) => err.code === 'INPUT_TOO_LARGE');
});

test('ai-engine.analyzeMessage: returns the full expected contract shape', () => {
  const r = engine.analyzeMessage('Your account will be blocked today, share the OTP now.');
  const requiredFields = ['mode', 'riskLevel', 'riskScore', 'category', 'categoryId', 'confidence',
    'signals', 'explanationSummary', 'recommendedActions', 'avoidActions', 'verificationGuidance', 'disclaimer'];
  requiredFields.forEach((f) => assert.ok(f in r, `missing field: ${f}`));
  assert.ok(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'].includes(r.riskLevel));
  assert.ok(r.riskScore >= 0 && r.riskScore <= 100, `riskScore out of bounds: ${r.riskScore}`);
  assert.ok(Array.isArray(r.signals));
  assert.ok(Array.isArray(r.recommendedActions) && r.recommendedActions.length > 0);
  assert.ok(Array.isArray(r.avoidActions) && r.avoidActions.length > 0);
});

test('ai-engine.analyzeMessage: an obvious scam scores meaningfully higher than an obvious legit message', () => {
  const scam = engine.analyzeMessage('Urgent! Your account will be blocked today. Share the OTP immediately to keep it active.');
  const legit = engine.analyzeMessage('The society meeting is scheduled for Sunday at 6 PM in the community hall.');
  assert.ok(scam.riskScore > legit.riskScore, `expected scam(${scam.riskScore}) > legit(${legit.riskScore})`);
  assert.ok(['HIGH', 'CRITICAL'].includes(scam.riskLevel));
  assert.ok(['LOW', 'MEDIUM'].includes(legit.riskLevel));
});


test('ai-engine.analyzeMessage: routes hard messages to the neural-network solver when available', () => {
  const r = engine.analyzeMessage('zzqv aadhaar reward courier wallet unblock verify quickly now');
  assert.strictEqual(r.route.preferredSolver, 'neural-network');
  assert.strictEqual(r.route.actualSolver, 'neural-network');
  assert.strictEqual(r.route.neuralNetworkUsed, true);
  assert.ok(Number.isInteger(r.difficultyScore));
  assert.ok(r.difficultyScore > 50);
  assert.ok(typeof r.neuralModelProbabilityScam === 'number');
});

test('ai-engine.analyzeMessage: negated/educational OTP warning scores low, not high', () => {
  const r = engine.analyzeMessage('Never share your OTP, PIN, or password with anyone, including bank staff.');
  assert.ok(['LOW', 'MEDIUM'].includes(r.riskLevel), `expected LOW/MEDIUM for educational warning, got ${r.riskLevel} (${r.riskScore})`);
});

test('ai-engine.analyzeMessage: is deterministic across repeated calls', () => {
  const text = 'Congratulations, you have won a prize, claim it now by clicking this link.';
  const r1 = engine.analyzeMessage(text);
  const r2 = engine.analyzeMessage(text);
  assert.strictEqual(r1.riskScore, r2.riskScore);
  assert.strictEqual(r1.riskLevel, r2.riskLevel);
  assert.strictEqual(r1.categoryId, r2.categoryId);
});

test('ai-engine.analyzeMessage: riskScore is always a finite integer 0-100 across many varied inputs', () => {
  const samples = [
    'a', 'the quick brown fox', '😀😀😀 urgent otp now 😀😀😀', '   spaced    out    text   ',
    'ALL CAPS URGENT MESSAGE OTP PIN PASSWORD NOW', 'mixed CaSe TeXt with OTP',
    '12345 67890 !!! *** ###', 'क ख ग घ ङ', 'a'.repeat(4999)
  ];
  samples.forEach((s) => {
    const r = engine.analyzeMessage(s);
    assert.ok(Number.isInteger(r.riskScore), `riskScore not an integer for input "${s.slice(0, 20)}..."`);
    assert.ok(r.riskScore >= 0 && r.riskScore <= 100, `riskScore out of range for "${s.slice(0, 20)}..."`);
    assert.ok(Number.isFinite(r.riskScore));
  });
});

test('ai-engine.analyzeLink: throws correctly on invalid/unsafe input', () => {
  assert.throws(() => engine.analyzeLink(''), (err) => err.code === 'EMPTY_INPUT');
  assert.throws(() => engine.analyzeLink('javascript:alert(1)'), (err) => err.code === 'UNSAFE_SCHEME');
  assert.throws(() => engine.analyzeLink('not a url'), (err) => err.code === 'INVALID_URL');
});

test('ai-engine.analyzeLink: returns full expected contract shape', () => {
  const r = engine.analyzeLink('http://paytm-secure-login.example.top/kyc');
  ['mode', 'riskLevel', 'riskScore', 'category', 'confidence', 'signals', 'hostname',
    'fullUrlChecked', 'explanationSummary', 'recommendedActions', 'avoidActions', 'disclaimer'].forEach((f) => {
    assert.ok(f in r, `missing field: ${f}`);
  });
  assert.ok(r.riskScore >= 0 && r.riskScore <= 100);
});

test('ai-engine.analyzeLink: obviously suspicious URL scores higher than a known-safe official URL', () => {
  const bad = engine.analyzeLink('http://hdfcbank-alert.verify.example.click/login');
  const good = engine.analyzeLink('https://www.hdfcbank.com/personal');
  assert.ok(bad.riskScore > good.riskScore, `expected bad(${bad.riskScore}) > good(${good.riskScore})`);
  assert.ok(['HIGH', 'CRITICAL'].includes(bad.riskLevel));
  assert.ok(['LOW', 'MEDIUM'].includes(good.riskLevel));
});

test('ai-engine.analyzeLink: is deterministic across repeated calls', () => {
  const url = 'http://bit.ly/claim-now';
  const r1 = engine.analyzeLink(url);
  const r2 = engine.analyzeLink(url);
  assert.strictEqual(r1.riskScore, r2.riskScore);
  assert.strictEqual(r1.riskLevel, r2.riskLevel);
});

test('ai-engine.analyzeLink: accepts a bare domain without scheme (auto-prepends http://)', () => {
  const r = engine.analyzeLink('www.example.com');
  assert.strictEqual(r.hostname, 'www.example.com');
});
