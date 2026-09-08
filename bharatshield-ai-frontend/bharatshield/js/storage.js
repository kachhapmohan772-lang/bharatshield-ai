/**
 * BharatShield AI — Storage
 * Uses sessionStorage only (cleared when the tab closes) to pass a result
 * from an analyzer page to result.html. Nothing is sent to any server.
 * No OTP/PIN/password values are ever stored — only the analysis result.
 */

const Storage = (() => {
  const KEY = "bharatshield_last_result";

  function saveResult(result, meta) {
    try {
      sessionStorage.setItem(KEY, JSON.stringify({ result, meta, savedAt: Date.now() }));
      return true;
    } catch (e) {
      console.error("BharatShield storage error:", e);
      return false;
    }
  }

  function getResult() {
    try {
      const raw = sessionStorage.getItem(KEY);
      return raw ? JSON.parse(raw) : null;
    } catch (e) {
      return null;
    }
  }

  function clearResult() {
    sessionStorage.removeItem(KEY);
  }

  return { saveResult, getResult, clearResult };
})();
