/**
 * BharatShield AI — Navigation
 * Injects a consistent header + footer into every page via
 * <div id="site-header"></div> and <div id="site-footer"></div>,
 * and highlights the active nav link.
 */

(function () {
  const NAV_LINKS = [
    { href: "index.html", label: "Home" },
    { href: "message.html", label: "Check Message" },
    { href: "link.html", label: "Check Link" },
    { href: "screenshot.html", label: "Check Screenshot" },
    { href: "safety.html", label: "Safety Center" },
    { href: "about.html", label: "About" }
  ];

  function currentPage() {
    const path = window.location.pathname.split("/").pop();
    return path === "" ? "index.html" : path;
  }

  function buildHeader() {
    const header = document.getElementById("site-header");
    if (!header) return;
    const active = currentPage();

    header.innerHTML = "";
    const bar = document.createElement("div");
    bar.className = "nav-bar";

    const brand = document.createElement("a");
    brand.href = "index.html";
    brand.className = "brand";
    brand.innerHTML = `<span class="brand-mark" aria-hidden="true">◈</span><span class="brand-text">BharatShield<span class="brand-ai">AI</span></span>`;

    const toggle = document.createElement("button");
    toggle.className = "nav-toggle";
    toggle.setAttribute("aria-label", "Open navigation menu");
    toggle.setAttribute("aria-expanded", "false");
    toggle.innerHTML = `<span></span><span></span><span></span>`;

    const nav = document.createElement("nav");
    nav.className = "nav-links";
    nav.setAttribute("aria-label", "Primary");
    NAV_LINKS.forEach(link => {
      const a = document.createElement("a");
      a.href = link.href;
      a.textContent = link.label;
      if (link.href === active) {
        a.classList.add("active");
        a.setAttribute("aria-current", "page");
      }
      nav.appendChild(a);
    });

    toggle.addEventListener("click", () => {
      const isOpen = nav.classList.toggle("open");
      toggle.setAttribute("aria-expanded", String(isOpen));
      toggle.classList.toggle("open", isOpen);
    });

    bar.appendChild(brand);
    bar.appendChild(nav);
    bar.appendChild(toggle);
    header.appendChild(bar);
  }

  function buildFooter() {
    const footer = document.getElementById("site-footer");
    if (!footer) return;
    footer.innerHTML = `
      <div class="footer-inner">
        <div class="footer-brand">
          <span class="brand-mark" aria-hidden="true">◈</span> BharatShield AI
          <p>Detect. Understand. Protect.</p>
        </div>
        <div class="footer-links">
          <a href="safety.html">Safety Center</a>
          <a href="about.html">About</a>
          <a href="privacy.html">Privacy &amp; Disclaimer</a>
        </div>
        <div class="footer-note">
          <p>Prototype build — rule-based analysis, not a certified fraud detector. Always verify through official channels.</p>
          <p>National Cyber Crime Helpline: <strong>1930</strong> · cybercrime.gov.in</p>
        </div>
      </div>`;
  }

  document.addEventListener("DOMContentLoaded", () => {
    buildHeader();
    buildFooter();
  });
})();
