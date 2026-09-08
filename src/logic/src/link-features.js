'use strict';

/**
 * BharatShield AI — URL Feature Extraction
 * Converts a URL into a fixed-length numeric feature vector for the
 * logistic regression model. Used identically at training time
 * (train.js) and inference time (ai-engine.js) — this file is the only
 * place these features are computed, so the two can never drift apart.
 */

const FEATURE_NAMES = [
  'not_https', 'subdomain_count', 'has_punycode', 'has_at_symbol',
  'suspicious_tld', 'is_shortener', 'brand_token_mismatch', 'hyphen_count',
  'is_raw_ip', 'domain_length', 'has_suspicious_keyword'
];

const SHORTENERS = ['bit.ly', 'tinyurl.com', 't.co', 'goo.gl', 'is.gd', 'cutt.ly', 'rebrand.ly'];
const SUSPICIOUS_TLDS = ['xyz', 'top', 'click', 'info', 'gq', 'tk', 'cf', 'work', 'loan', 'win'];
const SUSPICIOUS_KEYWORDS = ['secure', 'verify', 'login', 'update', 'confirm', 'account', 'security', 'kyc', 'authenticate'];

const BRAND_PATTERNS = [
  { brand: 'paytm', officialDomains: ['paytm.com'] },
  { brand: 'phonepe', officialDomains: ['phonepe.com'] },
  { brand: 'sbi', officialDomains: ['sbi.co.in', 'onlinesbi.com'] },
  { brand: 'hdfcbank', officialDomains: ['hdfcbank.com'] },
  { brand: 'icicibank', officialDomains: ['icicibank.com'] },
  { brand: 'axisbank', officialDomains: ['axisbank.com'] },
  { brand: 'rbi', officialDomains: ['rbi.org.in'] },
  { brand: 'amazon', officialDomains: ['amazon.in', 'amazon.com'] },
  { brand: 'flipkart', officialDomains: ['flipkart.com'] },
  { brand: 'irctc', officialDomains: ['irctc.co.in'] },
  { brand: 'incometax', officialDomains: ['incometax.gov.in'] },
  { brand: 'aadhaar', officialDomains: ['uidai.gov.in'] }
];

const CCTLD_SECOND_LEVEL = ['co.in', 'gov.in', 'org.in', 'net.in', 'ac.in', 'res.in', 'nic.in', 'edu.in', 'co.uk', 'org.uk', 'gov.uk'];

function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function getRegistrableDomain(hostname) {
  const labels = hostname.split('.');
  if (labels.length <= 2) return hostname;
  const lastTwo = labels.slice(-2).join('.');
  if (CCTLD_SECOND_LEVEL.includes(lastTwo)) return labels.slice(-3).join('.');
  return lastTwo;
}

function hostnameContainsToken(hostname, token) {
  const boundary = new RegExp(`(^|[.-])${escapeRegex(token)}([.-]|$)`, 'i');
  return boundary.test(hostname);
}

/**
 * Parses a raw URL string into a validated URL object.
 * Throws a typed error (err.code) on anything unsafe or unparseable —
 * callers decide how to present that, this function never guesses.
 */
function parseUrl(rawUrl) {
  if (rawUrl === null || rawUrl === undefined) {
    const err = new Error('Please provide a URL to analyze.');
    err.code = 'EMPTY_INPUT';
    throw err;
  }
  const input = String(rawUrl).trim();
  if (!input) {
    const err = new Error('Please provide a URL to analyze.');
    err.code = 'EMPTY_INPUT';
    throw err;
  }
  if (input.length > 2048) {
    const err = new Error('URL is too long.');
    err.code = 'INPUT_TOO_LARGE';
    throw err;
  }
  if (/^(javascript|data|file|vbscript):/i.test(input)) {
    const err = new Error('This URL scheme is not supported.');
    err.code = 'UNSAFE_SCHEME';
    throw err;
  }

  let normalized = input;
  if (!/^https?:\/\//i.test(normalized)) normalized = 'http://' + normalized;

  let urlObj;
  try {
    urlObj = new URL(normalized);
  } catch (e) {
    const err = new Error('This does not look like a valid URL.');
    err.code = 'INVALID_URL';
    throw err;
  }
  if (!urlObj.hostname || !urlObj.hostname.includes('.')) {
    const err = new Error('This does not look like a valid URL.');
    err.code = 'INVALID_URL';
    throw err;
  }

  return { urlObj, originalInput: input };
}

/**
 * Extracts the fixed feature vector (see FEATURE_NAMES) for a URL.
 * Also returns human-readable evidence per feature, used for the
 * explainability layer at inference time.
 */
function extractLinkFeatures(rawUrl) {
  const { urlObj, originalInput } = parseUrl(rawUrl);
  const hostname = urlObj.hostname.toLowerCase();

  const notHttps = urlObj.protocol !== 'https:' ? 1 : 0;
  const subdomainCount = Math.max(0, hostname.split('.').length - 2);
  const hasPunycode = /xn--/i.test(hostname) ? 1 : 0;
  const hasAtSymbol = originalInput.includes('@') ? 1 : 0;
  const tld = hostname.split('.').pop();
  const suspiciousTld = SUSPICIOUS_TLDS.includes(tld) ? 1 : 0;
  const shortenerMatch = SHORTENERS.find((s) => hostname === s || hostname.endsWith('.' + s));
  const isShortener = shortenerMatch ? 1 : 0;

  const registrable = getRegistrableDomain(hostname);
  const brandHit = BRAND_PATTERNS.find((b) => hostnameContainsToken(hostname, b.brand));
  const brandMismatch = (brandHit && !brandHit.officialDomains.includes(registrable)) ? 1 : 0;

  const hyphenCount = (hostname.match(/-/g) || []).length;
  const isRawIp = /^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(hostname) ? 1 : 0;
  const domainLength = hostname.length;
  const keywordHit = SUSPICIOUS_KEYWORDS.find((k) => hostnameContainsToken(hostname, k));
  const hasSuspiciousKeyword = keywordHit ? 1 : 0;

  const features = [
    notHttps, subdomainCount, hasPunycode, hasAtSymbol, suspiciousTld,
    isShortener, brandMismatch, hyphenCount, isRawIp, domainLength, hasSuspiciousKeyword
  ];

  const evidence = {
    not_https: urlObj.protocol,
    subdomain_count: hostname,
    has_punycode: hostname,
    has_at_symbol: '@',
    suspicious_tld: tld ? '.' + tld : '',
    is_shortener: shortenerMatch || '',
    brand_token_mismatch: brandHit ? `${brandHit.brand} vs ${hostname}` : '',
    hyphen_count: hostname,
    is_raw_ip: hostname,
    domain_length: hostname,
    has_suspicious_keyword: keywordHit || ''
  };

  return { features, hostname, fullUrlChecked: originalInput, evidence };
}

module.exports = { FEATURE_NAMES, extractLinkFeatures, parseUrl, getRegistrableDomain, hostnameContainsToken };
