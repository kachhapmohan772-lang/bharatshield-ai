/**
 * BharatShield AI — Link Analyzer page logic
 */

(function () {
  const EXAMPLES = {
    phish: "http://paytm.secure-login-verify.example.top/kyc",
    shortener: "http://bit.ly/3xample-offer",
    ip: "http://192.168.45.12/account/login",
    legit: "https://www.sbi.co.in/web/personal-banking"
  };

  const form = document.getElementById("link-form");
  const input = document.getElementById("link-input");
  const errorSlot = document.getElementById("error-slot");
  const loadingPanel = document.getElementById("loading-panel");
  const loadingStage = document.getElementById("loading-stage");
  const analyzeBtn = document.getElementById("analyze-btn");

  const STAGES = ["Reading link structure…", "Checking domain patterns…", "Comparing against known impersonation patterns…", "Preparing result…"];

  document.querySelectorAll(".example-chip").forEach(btn => {
    btn.addEventListener("click", () => {
      input.value = EXAMPLES[btn.dataset.example];
      input.focus();
      clearError();
    });
  });

  document.getElementById("clear-btn").addEventListener("click", () => {
    input.value = "";
    clearError();
  });

  function clearError() { errorSlot.innerHTML = ""; }

  function showError(message) {
    errorSlot.innerHTML = "";
    const box = document.createElement("div");
    box.className = "alert-box alert-error";
    box.setAttribute("role", "alert");
    box.innerHTML = `<span>⚠</span><span></span>`;
    box.querySelector("span:last-child").textContent = message;
    errorSlot.appendChild(box);
  }

  async function runLoadingSequence() {
    loadingPanel.hidden = false;
    form.hidden = true;
    for (let i = 0; i < STAGES.length; i++) {
      loadingStage.textContent = STAGES[i];
      await new Promise(r => setTimeout(r, 320));
    }
  }

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    clearError();
    const url = input.value.trim();
    const check = Utils.isLikelyUrl(url);
    if (!check.valid) { showError(check.reason); return; }

    analyzeBtn.disabled = true;
    await runLoadingSequence();

    try {
      const result = await MockAI.analyzeLink(url);
      if (result.error) {
        loadingPanel.hidden = true;
        form.hidden = false;
        analyzeBtn.disabled = false;
        showError(result.message);
        return;
      }
      Storage.saveResult(result, { source: "link" });
      window.location.href = "result.html";
    } catch (err) {
      loadingPanel.hidden = true;
      form.hidden = false;
      analyzeBtn.disabled = false;
      showError(err.message || "Something went wrong while analyzing. Please try again.");
    }
  });
})();
