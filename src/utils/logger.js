'use strict';

/**
 * Minimal structured logger. Never logs message/URL bodies, OTPs, PINs,
 * passwords, or the AI API key — only metadata useful for debugging.
 */

const REDACT_KEYS = ['password', 'otp', 'pin', 'aiApiKey', 'apiKey', 'authorization', 'text', 'url'];

function redact(obj) {
  if (!obj || typeof obj !== 'object') return obj;
  const clone = {};
  for (const [k, v] of Object.entries(obj)) {
    clone[k] = REDACT_KEYS.includes(k) ? '[redacted]' : v;
  }
  return clone;
}

function logRequest({ requestId, method, path, status, durationMs }) {
  console.log(JSON.stringify({
    ts: new Date().toISOString(), requestId, method, path, status, durationMs
  }));
}

function logError({ requestId, path, code, message }) {
  console.error(JSON.stringify({
    ts: new Date().toISOString(), level: 'error', requestId, path, code, message
  }));
}

module.exports = { redact, logRequest, logError };
