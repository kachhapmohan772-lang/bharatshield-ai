'use strict';

/**
 * =========================================================================
 * BharatShield AI — Runtime Inference Engine (v2.0.0-ml)
 * =========================================================================
 * This is what the frontend/backend actually call. It loads the trained
 * model artifact (src/trained-model.json, produced by train.js) and runs
 * real statistical ML inference — Naive Bayes for message text, logistic
 * regression for links — rather than hand-written if/else rules.
 *
 * HONEST SCOPE NOTE (read this before assuming "AI" means something else):
 * These are classical, from-scratch-implemented supervised ML algorithms
 * (Multinomial Naive Bayes, Logistic Regression), trained on a labeled
 * prototype-scale dataset (see /data). They genuinely learn from examples
 * — every probability and every explanation below is computed from
 * parameters estimated during training, not authored by hand. They are
 * NOT a deep neural network or a large language model; that would need
 * far more labeled data and compute than a prototype has, and claiming
 * otherwise would misrepresent what is actually running. See README.md
 * for the full rationale and how to retrain/extend the model.
 *
 * CONTRACT (unchanged from the earlier rule-based version, so this can
 * be dropped into the existing frontend/backend without changes there):
 *   analyzeMessage(text) -> { riskLevel, riskScore, category, categoryId,
 *     confidence, signals[], explanationSummary, recommendedActions[],
 *     avoidActions[], verificationGuidance[], disclaimer, mode }
 *   analyzeLink(url)     -> same shape, plus { hostname, fullUrlChecked }
 * Both throw a typed Error (err.code) on invalid input.
 * =========================================================================
 */

const fs = require('fs');
const path = require('path');

const nb = require('./naive-bayes');
const lr = require('./logistic-regression');
const nn = require('./neural-network');
const { extractFeatures } = require('./text-preprocessor');
const { extractLinkFeatures, FEATURE_NAMES } = require('./link-features');
const hybridRouter = require('./hybrid-router');

// -----------------------------------------------------------------------
// Load the trained artifact once at module load time.
// -----------------------------------------------------------------------
const MODEL_PATH = path.join(__dirname, 'trained-model.json');
let model = null;
let loadError = null;
try {
  model = JSON.parse(fs.readFileSync(MODEL_PATH, 'utf8'));
} catch (e) {
  loadError = e;
}

function assertModelLoaded() {
  if (!model) {
    throw new Error(
      `Trained model not found at ${MODEL_PATH}. Run "node train.js" first to generate it. ` +
      `(${loadError ? loadError.message : 'unknown error'})`
    );
  }
}

function makeError(code, message) {
  const err = new Error(message);
  err.code = code;
  return err;
}

// -----------------------------------------------------------------------
// Risk level thresholds (same prototype defaults as documented in the
// project scope: LOW ≤24, MEDIUM ≤49, HIGH ≤74, CRITICAL >74). Kept
// configurable in one place, applied to the CALIBRATED probability.
// -----------------------------------------------------------------------
const THRESHOLDS = { low: 24, medium: 49, high: 74 };

function scoreToLevel(score) {
  if (score <= THRESHOLDS.low) return 'LOW';
  if (score <= THRESHOLDS.medium) return 'MEDIUM';
  if (score <= THRESHOLDS.high) return 'HIGH';
  return 'CRITICAL';
}

// -----------------------------------------------------------------------
// Category metadata: display names + category-specific safe-action
// guidance. This library of *response text* is intentionally separate
// from the ML model — the model's only job is deciding risk level and
// category; what to advise a user to do about a known category is a
// safety/product decision, not something to be statistically inferred.
// -----------------------------------------------------------------------
const CATEGORY_META = {
  otp_credential_theft: { name: 'OTP / Credential Theft' },
  fake_kyc: { name: 'Fake KYC / Account Suspension' },
  prize_lottery: { name: 'Prize / Lottery Scam' },
  phishing: { name: 'Phishing' },
  refund_scam: { name: 'Refund Scam' },
  courier_scam: { name: 'Courier / Delivery Scam' },
  fake_customer_care: { name: 'Fake Customer Care' },
  investment_scam: { name: 'Investment / Financial Scam' },
  job_scam: { name: 'Job Scam' },
  loan_scam: { name: 'Loan Scam' },
  payment_scam: { name: 'Payment / UPI Scam' }
};

const ACTIONS = {
  generic: {
    recommended: ["Verify through the organisation's official app or website — not through any link or number in this message.",
      'Take a moment before responding. Legitimate matters can wait a few minutes for you to check.'],
    avoid: ["Don't share your OTP, PIN, or password with anyone.", "Don't send money based only on this message."]
  },
  otp_credential_theft: {
    recommended: ['Do not share the OTP/PIN/password with anyone, including someone claiming to be from your bank.',
      "If you already shared it, contact your bank's official helpline immediately and freeze your card/account."],
    avoid: ['Never read out an OTP over a call.', 'Never type your PIN/password into a link sent to you.']
  },
  fake_kyc: {
    recommended: ["Open your bank's official app directly (not via this message) to check your KYC status.",
      'Visit your bank branch or call the number printed on your card/passbook if unsure.'],
    avoid: ["Don't click the link in the message to 'update KYC'.", "Don't share Aadhaar/PAN details through the message."]
  },
  prize_lottery: {
    recommended: ['Remember: you cannot win a contest you never entered.',
      "If curious, search the organisation's official site directly for any real promotion."],
    avoid: ["Don't pay any 'processing fee' to claim a prize.", "Don't click the claim link."]
  },
  phishing: {
    recommended: ["Do not open the link. Type the organisation's known website address directly into your browser instead.",
      'Check the sender ID/email address carefully for spelling differences.'],
    avoid: ["Don't enter login details on a page opened from this message.", "Don't download any file attached to it."]
  },
  refund_scam: {
    recommended: ['Check your bank statement or app directly for any real pending refund.',
      'Contact the merchant/bank using the number on their official website.'],
    avoid: ["Don't share your card/UPI PIN to 'receive' a refund — refunds never require your PIN."]
  },
  courier_scam: {
    recommended: ["Track your parcel only through the courier company's official app/website using your order ID."],
    avoid: ["Don't pay a 'customs fee' through a link sent by SMS/WhatsApp."]
  },
  fake_customer_care: {
    recommended: ["Look up the official helpline number from the company's verified app/website, not from a message."],
    avoid: ["Don't call numbers shared inside suspicious messages.", "Don't share OTP/screen-sharing access with anyone who calls you."]
  },
  investment_scam: {
    recommended: ['Verify any investment scheme with SEBI/RBI registration before investing.',
      'Talk to a trusted, independent financial advisor first.'],
    avoid: ["Don't transfer money for 'guaranteed' returns."]
  },
  job_scam: {
    recommended: ['Verify the company and job posting on its official careers page.'],
    avoid: ["Don't pay a 'registration' or 'training' fee for a job."]
  },
  loan_scam: {
    recommended: ['Apply for loans only through RBI-registered banks/NBFCs directly.'],
    avoid: ["Don't pay any upfront 'processing fee' for a loan."]
  },
  payment_scam: {
    recommended: ['Double-check the payee name and amount before approving any UPI request.'],
    avoid: ["Don't approve a 'collect request' you don't recognise."]
  }
};

const VERIFICATION_GUIDANCE = [
  'Use only official apps, verified websites, or the number printed on your bank card/statement — never a link or number from the message itself.',
  'When in doubt, wait. A genuine organisation will not penalise you for taking a few minutes to verify.',
  "You can report suspicious messages to India's National Cyber Crime helpline (1930) or cybercrime.gov.in."
];

const MESSAGE_DISCLAIMER = 'BharatShield provides an AI-assisted risk assessment produced by a trained statistical model. It is not a definitive determination of fraud, and it can make mistakes on messages unlike anything in its training data. Always verify important information through official channels.';
const LINK_DISCLAIMER = "BharatShield's link model only inspects the URL's structure and never visits the destination. A clean result is not proof of safety.";

// Friendly, human-readable meaning for tokens the model itself learned
// are predictive — used only to make top ML-selected evidence readable;
// the SELECTION of which tokens matter is entirely learned, this is
// purely a display label lookup for tokens that already have obvious
// English meaning.
const TOKEN_GLOSS = {
  otp: 'a one-time password request', pin: 'a PIN request', password: 'a password request',
  kyc: 'a KYC / account-verification claim', immediately: 'urgency pressure', urgent: 'urgency pressure',
  urgently: 'urgency pressure', blocked: 'a threat of account blocking', suspended: 'a threat of account suspension',
  won: 'an unexpected prize/reward claim', congratulations: 'an unexpected prize/reward claim',
  lottery: 'a lottery/prize claim', prize: 'a prize claim', refund: 'a refund claim',
  claim: 'a "claim now" call to action', link: 'a link the message wants you to click',
  click: 'a "click this link" instruction', fee: 'a request to pay a fee', pay: 'a payment request',
  loan: 'a loan offer', invest: 'an investment pitch', returns: 'a promised financial return',
  guaranteed: 'a "guaranteed" outcome claim (a common red flag)', customs: 'a customs/courier claim',
  parcel: 'a parcel/delivery claim', courier: 'a courier/delivery claim', helpline: 'a helpline/customer-care contact',
  today: 'a tight, same-day deadline', account: 'a claim about your account status'
};

function glossFor(token) {
  const base = token.split('_')[0];
  return TOKEN_GLOSS[base] || TOKEN_GLOSS[token] || null;
}

// -----------------------------------------------------------------------
// MESSAGE ANALYSIS
// -----------------------------------------------------------------------
function analyzeMessage(rawText) {
  assertModelLoaded();

  if (rawText === null || rawText === undefined) {
    throw makeError('EMPTY_INPUT', 'Please provide a message to analyze.');
  }
  const text = String(rawText);
  const trimmed = text.trim();
  if (trimmed.length === 0) throw makeError('EMPTY_INPUT', 'Please provide a message to analyze.');
  if (text.length > 5000) throw makeError('INPUT_TOO_LARGE', 'Message is too long (maximum 5000 characters).');

  // --- Binary inference: scam vs legit, via trained Naive Bayes ---
  const { logScores } = nb.scoreAllClasses(model.binaryModel, text);
  const messageFeatures = extractFeatures(text);
  const featureCount = Math.max(1, messageFeatures.length);
  const avgLogOdds = (logScores.scam - logScores.legit) / featureCount;

  // --- Calibration: learned Platt scaling turns the raw log-odds into
  // a well-spread probability instead of Naive Bayes' typically
  // overconfident near-0/near-1 raw output. ---
  const classicalProb = lr.predictProb(model.calibrationModel, [avgLogOdds]);
  const difficultyScore = hybridRouter.messageDifficultyScore({
    text,
    probabilityScam: classicalProb,
    features: messageFeatures,
    vocabulary: model.binaryModel.vocabulary
  });
  const route = hybridRouter.buildHybridRoute(difficultyScore, 'message', {
    neuralAvailable: Boolean(model.neuralMessageModel)
  });
  const neuralProb = route.neuralNetworkUsed ? nn.predictProb(model.neuralMessageModel, text) : null;
  const calibratedProb = neuralProb === null ? classicalProb : neuralProb;
  const riskScore = Math.max(0, Math.min(100, Math.round(calibratedProb * 100)));
  const riskLevel = scoreToLevel(riskScore);

  // --- Category inference: only meaningful once the binary model
  // leans toward "scam"; otherwise there is nothing to categorize. ---
  let categoryId = 'none';
  let categoryName = 'No specific category';
  let categoryConfidence = 0;
  if (calibratedProb >= 0.5) {
    const catResult = nb.predict(model.categoryModel, text);
    categoryId = catResult.predictedClass;
    categoryName = (CATEGORY_META[categoryId] && CATEGORY_META[categoryId].name) || categoryId;
    categoryConfidence = catResult.probability;
  }

  // --- Explainability: real per-token log-odds contributions from the
  // trained binary model — not template text. ---
  const explainSide = calibratedProb >= 0.5 ? ['scam', 'legit'] : ['legit', 'scam'];
  const rawContribs = nb.explainBinary(model.binaryModel, text, explainSide[0], explainSide[1], 8);
  const signals = rawContribs.map((c) => {
    const gloss = glossFor(c.token);
    return {
      id: c.token,
      name: c.token.replace(/_/g, ' '),
      severity: c.logOdds >= 2.5 ? 'high' : c.logOdds >= 1 ? 'medium' : 'low',
      weight: Math.round(c.logOdds * 10) / 10, // learned log-odds, not an authored weight
      evidence: c.token.replace(/_/g, ' '),
      meaning: gloss ? `This wording is associated with ${gloss}.` : `This wording was statistically associated with ${explainSide[0] === 'scam' ? 'scam' : 'legitimate'} messages in the training data.`,
      why: explainSide[0] === 'scam'
        ? 'The trained model learned this pattern appears disproportionately often in known scam messages.'
        : 'The trained model learned this pattern appears disproportionately often in known legitimate messages.',
      contextNote: null
    };
  });

  const confidenceLabel = calibratedProb > 0.85 || calibratedProb < 0.15
    ? 'high' : (calibratedProb > 0.65 || calibratedProb < 0.35 ? 'medium' : 'low');

  const actionSet = ACTIONS[categoryId] || ACTIONS.generic;
  const recommendedActions = Array.from(new Set([...actionSet.recommended, ...ACTIONS.generic.recommended])).slice(0, 4);
  const avoidActions = Array.from(new Set([...actionSet.avoid, ...ACTIONS.generic.avoid])).slice(0, 4);

  const explanationSummary = signals.length > 0
    ? `${riskLevel === 'CRITICAL' || riskLevel === 'HIGH' ? 'High-risk' : 'Some'} indicators were detected — the model's strongest signals were: ${signals.slice(0, 3).map((s) => s.name).join(', ')}.`
    : 'No strong statistical indicators were detected by the model. This does not guarantee the message is safe — always verify anything involving money or personal information.';

  return {
    mode: 'ml-naive-bayes',
    solver: route.actualSolver,
    route,
    difficultyScore,
    difficultyLevel: route.difficultyLevel,
    version: model.version,
    riskLevel,
    riskScore,
    category: categoryName,
    categoryId,
    categoryConfidence: Math.round(categoryConfidence * 100) / 100,
    confidence: confidenceLabel,
    modelProbabilityScam: Math.round(calibratedProb * 1000) / 1000,
    classicalModelProbabilityScam: Math.round(classicalProb * 1000) / 1000,
    neuralModelProbabilityScam: neuralProb === null ? null : Math.round(neuralProb * 1000) / 1000,
    signals,
    explanationSummary,
    recommendedActions,
    avoidActions,
    verificationGuidance: VERIFICATION_GUIDANCE.slice(),
    disclaimer: MESSAGE_DISCLAIMER
  };
}

// -----------------------------------------------------------------------
// LINK ANALYSIS
// -----------------------------------------------------------------------
function analyzeLink(rawUrl) {
  assertModelLoaded();

  const { features, hostname, fullUrlChecked, evidence } = extractLinkFeatures(rawUrl);
  const prob = lr.predictProb(model.linkModel, features);
  const riskScore = Math.max(0, Math.min(100, Math.round(prob * 100)));
  const riskLevel = scoreToLevel(riskScore);

  const contributions = lr.explain(model.linkModel, features, FEATURE_NAMES);
  const signals = contributions.map((c) => ({
    id: c.feature,
    name: humanizeFeatureName(c.feature),
    severity: c.contribution >= 0.8 ? 'high' : c.contribution >= 0.3 ? 'medium' : 'low',
    weight: Math.round(c.contribution * 100) / 100, // learned logistic-regression weight contribution
    evidence: String(evidence[c.feature] || ''),
    meaning: featureMeaning(c.feature),
    why: featureWhy(c.feature),
    contextNote: null
  }));

  const confidenceLabel = prob > 0.85 || prob < 0.15 ? 'high' : (prob > 0.65 || prob < 0.35 ? 'medium' : 'low');
  const difficultyScore = hybridRouter.linkDifficultyScore({
    probabilitySuspicious: prob,
    signals
  });
  const route = hybridRouter.buildHybridRoute(difficultyScore, 'link', { neuralAvailable: false });

  return {
    mode: 'ml-logistic-regression',
    solver: route.actualSolver,
    route,
    difficultyScore,
    difficultyLevel: route.difficultyLevel,
    version: model.version,
    riskLevel,
    riskScore,
    category: signals.length ? 'Suspicious link pattern' : 'No strong link risk pattern',
    confidence: confidenceLabel,
    modelProbabilitySuspicious: Math.round(prob * 1000) / 1000,
    signals,
    hostname,
    fullUrlChecked,
    explanationSummary: signals.length
      ? `The trained model flagged ${signals.length} suspicious pattern${signals.length > 1 ? 's' : ''} in this link's structure.`
      : "No strong suspicious patterns were found in this link's structure by the model. This does not confirm the destination is safe — BharatShield does not visit the link.",
    recommendedActions: ['Do not click this link.', "Go to the official app or type the organisation's known website address directly into your browser.",
      'If the link was shortened, ask the sender for the full, real destination before proceeding.'],
    avoidActions: ["Don't enter login details or OTP on a page opened from this link.", "Don't download anything from an unfamiliar link."],
    verificationGuidance: VERIFICATION_GUIDANCE.slice(),
    disclaimer: LINK_DISCLAIMER
  };
}

function humanizeFeatureName(feature) {
  const map = {
    not_https: 'Not using HTTPS', subdomain_count: 'Unusually many subdomains', has_punycode: 'Encoded (punycode) domain',
    has_at_symbol: "'@' symbol in the link", suspicious_tld: 'Uncommon domain ending', is_shortener: 'Shortened link',
    brand_token_mismatch: 'Possible brand impersonation pattern', hyphen_count: 'Many hyphens in domain',
    is_raw_ip: 'Raw IP address instead of a domain', domain_length: 'Unusually long domain name',
    has_suspicious_keyword: 'Security-themed wording in the domain'
  };
  return map[feature] || feature;
}
function featureMeaning(feature) {
  const map = {
    not_https: 'The link does not use a secure (HTTPS) connection.',
    subdomain_count: 'The domain has several subdomains stacked together.',
    has_punycode: 'The domain uses encoded characters that can visually impersonate another domain.',
    has_at_symbol: "The link contains an '@' symbol.",
    suspicious_tld: 'The domain ends in an inexpensive, frequently-abused ending.',
    is_shortener: 'This is a link-shortening service, hiding the real destination.',
    brand_token_mismatch: "The domain includes a known brand name but doesn't match that brand's official domain.",
    hyphen_count: 'The domain name contains an unusually high number of hyphens.',
    is_raw_ip: 'The link points directly to a numeric IP address instead of a named domain.',
    domain_length: 'The domain name is unusually long.',
    has_suspicious_keyword: 'The domain contains security-themed wording often used to look official.'
  };
  return map[feature] || 'The model learned this pattern is associated with risky links.';
}
function featureWhy(feature) {
  const map = {
    not_https: 'Reputable services almost always use HTTPS.',
    subdomain_count: 'Scammers stack subdomains so the real domain is hidden at the end.',
    has_punycode: 'This technique makes a fake domain look identical to a real one.',
    has_at_symbol: "Browsers ignore everything before '@', so attackers disguise the real destination this way.",
    suspicious_tld: "This alone isn't proof of harm, but it's over-represented in scam campaigns.",
    is_shortener: 'You cannot verify where a shortened link leads until after you click it.',
    brand_token_mismatch: 'Placing a trusted brand name inside an unrelated domain is a common phishing tactic.',
    hyphen_count: 'Long, hyphen-heavy domains are often auto-generated for phishing campaigns.',
    is_raw_ip: 'Legitimate consumer-facing services use named domains, not raw IP addresses.',
    domain_length: 'Very long domains are sometimes used to bury a real brand name among noise.',
    has_suspicious_keyword: 'Genuine services rarely need words like "secure" or "verify" in the domain itself.'
  };
  return map[feature] || 'The trained model learned this feature is statistically associated with risky links.';
}

module.exports = { analyzeMessage, analyzeLink, isModelLoaded: () => Boolean(model), modelVersion: () => model && model.version };
