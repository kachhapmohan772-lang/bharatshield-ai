/**
 * BharatShield AI — Message Analyzer page logic
 */

(function () {
  const EXAMPLES = {
    kyc: "Dear Customer, your KYC has expired and your account will be suspended within 24 hours. Update immediately: http://kyc-verify-secure.example.com",
    prize: "Congratulations! You have won ₹50,000 in the Flipkart Lucky Draw. Claim your prize immediately by clicking this link and paying a small processing fee.",
    courier: "Your parcel is held at customs. Pay a pending customs duty of ₹149 within 24 hours to release your delivery: http://courier-pay.example.top",
    otp: "Bank Alert: Your account will be blocked today. Share the OTP sent to your number immediately to keep it active. Do not tell anyone about this call.",
    legit: "Reminder: Your electricity bill of ₹1,240 is due on 15th August. Pay through the official app or website. Never share your OTP or password with anyone."
  };

  const form = document.getElementById("message-form");
  const textarea = document.getElementById("message-input");
  const charCount = document.getElementById("char-count");
  const errorSlot = document.getElementById("error-slot");
  const loadingPanel = document.getElementById("loading-panel");
  const loadingStage = document.getElementById("loading-stage");
  const analyzeBtn = document.getElementById("analyze-btn");

  const STAGES = ["Reading submitted content…", "Checking suspicious signals…", "Analyzing context…", "Preparing safety guidance…"];

  textarea.addEventListener("input", () => {
    charCount.textContent = `${textarea.value.length} / 5000`;
  });

  document.querySelectorAll(".example-chip").forEach(btn => {
    btn.addEventListener("click", () => {
      textarea.value = EXAMPLES[btn.dataset.example];
      charCount.textContent = `${textarea.value.length} / 5000`;
      textarea.focus();
      clearError();
    });
  });

  document.getElementById("clear-btn").addEventListener("click", () => {
    textarea.value = "";
    charCount.textContent = "0 / 5000";
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
      await new Promise(r => setTimeout(r, 350));
    }
  }

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    clearError();
    const text = textarea.value;
    const check = Utils.isValidMessage(text);
    if (!check.valid) { showError(check.reason); return; }

    analyzeBtn.disabled = true;
    await runLoadingSequence();

    try {
      const result = await MockAI.analyzeMessage(text);
      Storage.saveResult(result, { source: "message" });
      window.location.href = "result.html";
    } catch (err) {
      loadingPanel.hidden = true;
      form.hidden = false;
      analyzeBtn.disabled = false;
      showError(err.message || "Something went wrong while analyzing. Please try again.");
    }
  });
})();
