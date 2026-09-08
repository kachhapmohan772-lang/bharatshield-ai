/**
 * BharatShield AI — Analysis Client (frontend ↔ backend bridge)
 * -----------------------------------------------------------------------
 * This file is the ONLY place the rest of the app talks to for analysis.
 *
 * It first tries the real backend API (see /bharatshield-backend). If the
 * backend is unreachable — offline demo, backend not started, network
 * error — it transparently falls back to the local, in-browser RiskEngine
 * so the app never breaks during a live demo.
 *
 * NEVER put a real AI API key in this file — frontend JS is public.
 * The backend is where any real AI key/provider call must live.
 * -----------------------------------------------------------------------
 */

const MockAI = (() => {
  // Point this at your running backend. Leave as-is for local dev
  // (`npm start` in bharatshield-backend runs on port 4000 by default).
  const API_BASE = window.BHARATSHIELD_API_BASE || "http://localhost:4000/api";
  const REQUEST_TIMEOUT_MS = 4000;
  const ARTIFICIAL_DELAY_MS = 300; // only used for the local fallback path

  function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  async function callBackend(path, body) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    try {
      const res = await fetch(`${API_BASE}${path}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal: controller.signal
      });
      const payload = await res.json();
      if (!res.ok || !payload.success) {
        // Known validation error from the backend (e.g. empty input) —
        // surface it as-is rather than falling back, so the user sees
        // the real reason instead of a silently different local result.
        const err = new Error(payload?.error?.message || "Backend rejected the request.");
        err.code = payload?.error?.code || "BACKEND_ERROR";
        err.isBackendValidationError = true;
        throw err;
      }
      return { ...payload.data, source: "backend" };
    } finally {
      clearTimeout(timeout);
    }
  }

  async function analyzeMessage(text) {
    try {
      return await callBackend("/analyze/message", { text });
    } catch (err) {
      if (err.isBackendValidationError) throw err;
      console.warn("BharatShield: backend unreachable, using local rule engine.", err.message);
      await delay(ARTIFICIAL_DELAY_MS);
      return { ...RiskEngine.analyzeMessage(text), source: "local-fallback" };
    }
  }

  async function analyzeLink(url) {
    try {
      return await callBackend("/analyze/link", { url });
    } catch (err) {
      if (err.isBackendValidationError) throw err;
      console.warn("BharatShield: backend unreachable, using local rule engine.", err.message);
      await delay(ARTIFICIAL_DELAY_MS);
      return { ...RiskEngine.analyzeLink(url), source: "local-fallback" };
    }
  }

  /**
   * Screenshot analysis: OCR happens in screenshot.js via Tesseract.js
   * (in-browser OCR). This just sends the extracted text through the
   * same message pipeline — backend first, local fallback second.
   */
  async function analyzeExtractedText(text) {
    try {
      return await callBackend("/analyze/screenshot", { text });
    } catch (err) {
      if (err.isBackendValidationError) throw err;
      console.warn("BharatShield: backend unreachable, using local rule engine.", err.message);
      await delay(ARTIFICIAL_DELAY_MS);
      return { ...RiskEngine.analyzeMessage(text), source: "local-fallback" };
    }
  }

  return { analyzeMessage, analyzeLink, analyzeExtractedText };
})();
