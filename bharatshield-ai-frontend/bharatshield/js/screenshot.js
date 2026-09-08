/**
 * BharatShield AI — Screenshot Analyzer page logic
 * OCR runs fully in-browser via Tesseract.js. If it fails to load or
 * times out, the user can type/correct the text manually — clearly
 * labelled as a fallback, never silently pretending OCR succeeded.
 */

(function () {
  const MAX_SIZE_BYTES = 8 * 1024 * 1024; // 8MB
  const uploadBox = document.getElementById("upload-box");
  const fileInput = document.getElementById("file-input");
  const previewSlot = document.getElementById("preview-slot");
  const errorSlot = document.getElementById("error-slot");
  const ocrPanel = document.getElementById("ocr-panel");
  const ocrText = document.getElementById("ocr-text");
  const ocrConfidenceNote = document.getElementById("ocr-confidence-note");
  const analyzeBtn = document.getElementById("analyze-btn");
  const clearBtn = document.getElementById("clear-btn");
  const loadingPanel = document.getElementById("loading-panel");
  const loadingStage = document.getElementById("loading-stage");

  let currentFile = null;

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
  function showWarn(message) {
    const box = document.createElement("div");
    box.className = "alert-box alert-warn";
    box.innerHTML = `<span>!</span><span></span>`;
    box.querySelector("span:last-child").textContent = message;
    ocrPanel.appendChild(box);
  }

  uploadBox.addEventListener("click", () => fileInput.click());
  uploadBox.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") fileInput.click(); });

  ["dragover", "dragenter"].forEach(evt => uploadBox.addEventListener(evt, (e) => {
    e.preventDefault(); uploadBox.classList.add("dragover");
  }));
  ["dragleave", "drop"].forEach(evt => uploadBox.addEventListener(evt, (e) => {
    e.preventDefault(); uploadBox.classList.remove("dragover");
  }));
  uploadBox.addEventListener("drop", (e) => {
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  });

  fileInput.addEventListener("change", () => {
    if (fileInput.files[0]) handleFile(fileInput.files[0]);
  });

  function handleFile(file) {
    clearError();
    if (!["image/png", "image/jpeg"].includes(file.type)) {
      showError("Unsupported file type. Please upload a PNG or JPG image.");
      return;
    }
    if (file.size > MAX_SIZE_BYTES) {
      showError("This file is too large. Please upload an image under 8 MB.");
      return;
    }
    currentFile = file;
    renderPreview(file);
    runOcr(file);
  }

  function renderPreview(file) {
    previewSlot.innerHTML = "";
    const wrap = document.createElement("div");
    wrap.className = "upload-preview";
    const img = document.createElement("img");
    img.src = URL.createObjectURL(file);
    img.alt = "Uploaded screenshot preview";
    const removeBtn = document.createElement("button");
    removeBtn.className = "upload-remove";
    removeBtn.setAttribute("aria-label", "Remove image");
    removeBtn.textContent = "✕";
    removeBtn.addEventListener("click", resetAll);
    wrap.appendChild(img);
    wrap.appendChild(removeBtn);
    previewSlot.appendChild(wrap);
  }

  function resetAll() {
    currentFile = null;
    previewSlot.innerHTML = "";
    ocrPanel.hidden = true;
    ocrText.value = "";
    ocrConfidenceNote.textContent = "";
    clearError();
    analyzeBtn.disabled = true;
    fileInput.value = "";
  }

  clearBtn.addEventListener("click", resetAll);

  async function runOcr(file) {
    ocrPanel.hidden = false;
    ocrText.value = "";
    ocrConfidenceNote.textContent = "Reading text from the image…";
    analyzeBtn.disabled = true;

    if (typeof Tesseract === "undefined") {
      ocrConfidenceNote.textContent = "";
      showWarn("On-device OCR could not load (offline or blocked). Please type the message text below manually.");
      analyzeBtn.disabled = false;
      return;
    }

    try {
      const { data } = await Tesseract.recognize(file, "eng", { logger: () => {} });
      const extracted = (data.text || "").trim();
      const confidence = data.confidence || 0;

      ocrText.value = extracted;
      if (!extracted) {
        ocrConfidenceNote.textContent = "Some text could not be read clearly. Please type it manually below.";
      } else if (confidence < 55) {
        ocrConfidenceNote.textContent = `Low OCR confidence (${Math.round(confidence)}%). Please review and correct the extracted text before analyzing.`;
      } else {
        ocrConfidenceNote.textContent = `Text extracted with ${Math.round(confidence)}% OCR confidence. Review it before analyzing if needed.`;
      }
      analyzeBtn.disabled = false;
    } catch (err) {
      ocrConfidenceNote.textContent = "";
      showWarn("OCR failed to read this image. Please type the message text below manually.");
      analyzeBtn.disabled = false;
    }
  }

  const STAGES = ["Reading submitted content…", "Checking suspicious signals…", "Analyzing context…", "Preparing safety guidance…"];

  async function runLoadingSequence() {
    loadingPanel.hidden = false;
    document.querySelector(".card").hidden = true;
    for (let i = 0; i < STAGES.length; i++) {
      loadingStage.textContent = STAGES[i];
      await new Promise(r => setTimeout(r, 320));
    }
  }

  analyzeBtn.addEventListener("click", async () => {
    clearError();
    const text = ocrText.value;
    const check = Utils.isValidMessage(text);
    if (!check.valid) { showError(check.reason); return; }

    await runLoadingSequence();
    try {
      const result = await MockAI.analyzeExtractedText(text);
      Storage.saveResult(result, { source: "screenshot" });
      window.location.href = "result.html";
    } catch (err) {
      loadingPanel.hidden = true;
      document.querySelector(".card").hidden = false;
      showError(err.message || "Something went wrong while analyzing. Please try again.");
    }
  });
})();
