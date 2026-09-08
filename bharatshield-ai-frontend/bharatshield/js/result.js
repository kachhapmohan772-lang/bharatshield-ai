/**
 * BharatShield AI — Result Page
 * Renders the stored analysis result. Everything is built with
 * textContent / createElement — never innerHTML with user content —
 * so a message containing script-like text is always shown as plain text.
 */

(function () {
  const root = document.getElementById("result-root");
  const stored = Storage.getResult();

  if (!stored || !stored.result) {
    renderEmptyState();
    return;
  }

  const { result, meta } = stored;
  renderResult(result, meta);

  function renderEmptyState() {
    root.innerHTML = "";
    const box = Utils.el("div", { class: "card center" });
    box.appendChild(Utils.el("h2", { text: "No analysis found" }));
    box.appendChild(Utils.el("p", { text: "Run a check first from Message, Link, or Screenshot analyzer." }));
    const actions = Utils.el("div", { class: "result-actions" });
    const btn = Utils.el("a", { class: "btn btn-primary", text: "Check a Message" });
    btn.href = "message.html";
    actions.appendChild(btn);
    box.appendChild(actions);
    root.appendChild(box);
  }

  function renderResult(r, meta) {
    root.innerHTML = "";

    // ---- Risk hero ----
    const levelClass = Utils.riskBadgeClass(r.riskLevel);
    const hero = Utils.el("div", { class: `risk-hero ${levelClass}` });
    hero.appendChild(Utils.el("div", { class: "risk-icon", text: Utils.riskIcon(r.riskLevel) }));
    hero.appendChild(Utils.el("div", { class: "risk-level-label", text: `${r.riskLevel} RISK · ${Utils.riskLabelHindi(r.riskLevel)}` }));
    hero.appendChild(Utils.el("div", { class: "risk-score", text: Utils.formatScore(r.riskScore) }));
    if (r.category) {
      hero.appendChild(Utils.el("div", { class: "risk-category", text: `Possible category: ${r.category}` }));
    }
    if (r.confidence) {
      hero.appendChild(Utils.el("div", { class: "risk-category", text: `Confidence: ${r.confidence}` }));
    }
    root.appendChild(hero);

    // ---- Analysis source badge (transparency) ----
    const sourceLabel = r.source === "backend" ? "Analyzed by backend API" : "Analyzed locally (backend offline — using in-browser fallback)";
    const sourceBadge = Utils.el("div", { class: "center", text: sourceLabel });
    sourceBadge.style.fontFamily = "var(--font-mono)";
    sourceBadge.style.fontSize = "0.75rem";
    sourceBadge.style.color = "var(--text-faint)";
    sourceBadge.style.marginBottom = "24px";
    root.appendChild(sourceBadge);

    renderHybridRouting(r);

    // ---- Why suspicious ----
    const whySection = Utils.el("div", { class: "result-section" });
    whySection.appendChild(Utils.el("h3", { text: "Why this result?" }));
    const summaryBox = Utils.el("div", { class: "card" });
    summaryBox.appendChild(Utils.el("p", { text: r.explanationSummary }));
    whySection.appendChild(summaryBox);
    root.appendChild(whySection);

  function renderHybridRouting(r) {
    if (typeof r.difficultyScore !== "number" && !r.route) return;

    const route = r.route || {};
    const preferred = route.preferredSolver || "classical-ml";
    const actual = route.actualSolver || r.solver || "classical-ml";
    const difficulty = r.difficultyLevel || route.difficultyLevel || "unknown";
    const score = typeof r.difficultyScore === "number" ? r.difficultyScore : route.difficultyScore;

    const section = Utils.el("div", { class: "result-section" });
    section.appendChild(Utils.el("h3", { text: "AI routing" }));

    const card = Utils.el("div", { class: "card hybrid-card" });
    const metrics = Utils.el("div", { class: "hybrid-metrics" });
    metrics.appendChild(metricTile("Difficulty", `${score}/100`, difficulty));
    metrics.appendChild(metricTile("Preferred solver", solverLabel(preferred), preferred));
    metrics.appendChild(metricTile("Used solver", solverLabel(actual), actual));
    card.appendChild(metrics);

    if (route.fallbackReason) {
      card.appendChild(Utils.el("p", { class: "hybrid-note", text: route.fallbackReason }));
    }

    section.appendChild(card);
    root.appendChild(section);
  }

  function metricTile(label, value, detail) {
    const tile = Utils.el("div", { class: "hybrid-tile" });
    tile.appendChild(Utils.el("span", { class: "hybrid-label", text: label }));
    tile.appendChild(Utils.el("strong", { class: "hybrid-value", text: value }));
    if (detail) tile.appendChild(Utils.el("span", { class: "hybrid-detail", text: detail }));
    return tile;
  }

  function solverLabel(solver) {
    if (solver === "neural-network") return "Neural network";
    if (solver === "classical-ml") return "Classical ML";
    return solver;
  }

    // ---- Signals / Evidence ----
    if (r.signals && r.signals.length > 0) {
      const sigSection = Utils.el("div", { class: "result-section" });
      sigSection.appendChild(Utils.el("h3", { text: "Signals detected (evidence)" }));
      const list = Utils.el("div", { class: "signal-list" });
      r.signals.forEach(sig => {
        const item = Utils.el("div", { class: "signal-item" });
        const head = Utils.el("div", { class: "signal-head" });
        head.appendChild(Utils.el("span", { class: "signal-name", text: sig.name }));
        head.appendChild(Utils.el("span", { class: "signal-weight", text: `+${sig.weight}` }));
        item.appendChild(head);
        item.appendChild(Utils.el("p", { class: "signal-why", text: sig.meaning }));
        item.appendChild(Utils.el("p", { class: "signal-why", text: sig.why }));
        if (sig.contextNote) item.appendChild(Utils.el("p", { class: "signal-why", text: `Note: ${sig.contextNote}` }));
        if (sig.evidence) item.appendChild(Utils.el("span", { class: "signal-evidence", text: `"${sig.evidence}"` }));
        list.appendChild(item);
      });
      sigSection.appendChild(list);
      root.appendChild(sigSection);
    }

    // ---- Original content reviewed ----
    if (r.originalText) {
      const origSection = Utils.el("div", { class: "result-section" });
      origSection.appendChild(Utils.el("h3", { text: "Content reviewed" }));
      const box = Utils.el("div", { class: "card" });
      const pre = Utils.el("p", { text: r.originalText });
      pre.style.whiteSpace = "pre-wrap";
      pre.style.fontFamily = "var(--font-mono)";
      pre.style.fontSize = "0.85rem";
      box.appendChild(pre);
      origSection.appendChild(box);
      root.appendChild(origSection);
    } else if (r.fullUrlChecked) {
      const origSection = Utils.el("div", { class: "result-section" });
      origSection.appendChild(Utils.el("h3", { text: "Link reviewed" }));
      const box = Utils.el("div", { class: "card" });
      box.appendChild(Utils.el("p", { text: r.fullUrlChecked }));
      origSection.appendChild(box);
      root.appendChild(origSection);
    }

    // ---- What to do ----
    const doSection = Utils.el("div", { class: "result-section" });
    doSection.appendChild(Utils.el("h3", { text: "✓ What should you do?" }));
    const doCard = Utils.el("div", { class: "card" });
    const doList = Utils.el("ul", { class: "action-list do" });
    (r.recommendedActions || []).forEach(a => doList.appendChild(Utils.el("li", { text: a })));
    doCard.appendChild(doList);
    doSection.appendChild(doCard);
    root.appendChild(doSection);

    // ---- What to avoid ----
    const avoidSection = Utils.el("div", { class: "result-section" });
    avoidSection.appendChild(Utils.el("h3", { text: "✕ Do not" }));
    const avoidCard = Utils.el("div", { class: "card" });
    const avoidList = Utils.el("ul", { class: "action-list avoid" });
    (r.avoidActions || []).forEach(a => avoidList.appendChild(Utils.el("li", { text: a })));
    avoidCard.appendChild(avoidList);
    avoidSection.appendChild(avoidCard);
    root.appendChild(avoidSection);

    // ---- Verification guidance ----
    if (r.verificationGuidance && r.verificationGuidance.length) {
      const verifySection = Utils.el("div", { class: "result-section" });
      verifySection.appendChild(Utils.el("h3", { text: "How to verify safely" }));
      const card = Utils.el("div", { class: "card" });
      const list = Utils.el("ul", { class: "action-list do" });
      r.verificationGuidance.forEach(v => list.appendChild(Utils.el("li", { text: v })));
      card.appendChild(list);
      verifySection.appendChild(card);
      root.appendChild(verifySection);
    }

    // ---- Disclaimer ----
    const disclaimer = Utils.el("div", { class: "disclaimer-bar mt-lg" });
    disclaimer.appendChild(Utils.el("span", { class: "icon", text: "ⓘ" }));
    disclaimer.appendChild(Utils.el("span", { text: r.disclaimer || "This is an AI-assisted risk assessment, not a definitive determination of fraud." }));
    root.appendChild(disclaimer);

    // ---- Actions ----
    const actions = Utils.el("div", { class: "result-actions" });
    const backLink = { message: "message.html", link: "link.html", screenshot: "screenshot.html" }[meta && meta.source] || "message.html";
    const analyzeAnother = Utils.el("a", { class: "btn btn-primary", text: "Analyze Another" });
    analyzeAnother.href = backLink;
    const home = Utils.el("a", { class: "btn btn-secondary", text: "Back to Home" });
    home.href = "index.html";
    actions.appendChild(analyzeAnother);
    actions.appendChild(home);
    root.appendChild(actions);
  }
})();
