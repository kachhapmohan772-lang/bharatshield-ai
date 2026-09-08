/**
 * BharatShield AI — Utilities
 * Small, dependency-free helper functions shared across pages.
 */

const Utils = (() => {

  /** Safely set text content (never innerHTML) for untrusted user content */
  function setText(el, text) {
    if (!el) return;
    el.textContent = text;
  }

  /** Create a DOM element with attributes + text content, no HTML injection */
  function el(tag, opts = {}) {
    const node = document.createElement(tag);
    if (opts.class) node.className = opts.class;
    if (opts.text !== undefined) node.textContent = opts.text;
    if (opts.attrs) {
      for (const [k, v] of Object.entries(opts.attrs)) node.setAttribute(k, v);
    }
    return node;
  }

  function riskBadgeClass(level) {
    return {
      LOW: "risk-low",
      MEDIUM: "risk-medium",
      HIGH: "risk-high",
      CRITICAL: "risk-critical"
    }[level] || "risk-medium";
  }

  function riskIcon(level) {
    return {
      LOW: "✓",
      MEDIUM: "!",
      HIGH: "⚠",
      CRITICAL: "⛔"
    }[level] || "!";
  }

  function riskLabelHindi(level) {
    return {
      LOW: "कम जोखिम",
      MEDIUM: "मध्यम जोखिम",
      HIGH: "उच्च जोखिम",
      CRITICAL: "अत्यधिक जोखिम"
    }[level] || "";
  }

  function isValidMessage(text) {
    if (!text || !text.trim()) return { valid: false, reason: "Please paste a message to analyze." };
    if (text.trim().length < 5) return { valid: false, reason: "This message looks too short to analyze meaningfully." };
    if (text.length > 5000) return { valid: false, reason: "This message is too long. Please paste up to 5000 characters." };
    return { valid: true };
  }

  function isLikelyUrl(input) {
    if (!input || !input.trim()) return { valid: false, reason: "Please enter a link to analyze." };
    const candidate = /^https?:\/\//i.test(input) ? input : "http://" + input;
    try {
      new URL(candidate);
      return { valid: true };
    } catch (e) {
      return { valid: false, reason: "This does not look like a valid link." };
    }
  }

  function formatScore(score) {
    return `${score} / 100`;
  }

  return { setText, el, riskBadgeClass, riskIcon, riskLabelHindi, isValidMessage, isLikelyUrl, formatScore };
})();
