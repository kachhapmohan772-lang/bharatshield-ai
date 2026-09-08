# BharatShield AI — Frontend Prototype

**Detect. Understand. Protect.**

An AI-assisted digital-safety frontend that helps ordinary users check suspicious
messages, links, and screenshots before they click, share an OTP, or send money.

This package is the **frontend only** — pure HTML5, CSS3, and vanilla JavaScript.
No build tools, no frameworks, no backend required to run it.

## Features

- **Message Analyzer** — paste SMS/WhatsApp/email text, get a risk score with an
  explanation of every signal detected.
- **Link Analyzer** — paste a URL; only its *structure* is inspected (HTTPS use,
  subdomains, brand-impersonation patterns, shorteners, etc.) — the link is never
  visited or opened.
- **Screenshot Analyzer** — upload an image; text is extracted in-browser via
  Tesseract.js (OCR) and run through the same analysis as Message Check, with a
  manual-correction fallback if OCR fails or has low confidence.
- **Result screen** — Risk Level → Why → Evidence → Recommended actions → Things
  to avoid → Verification guidance, all generated dynamically from structured data.
- **Safety Center, About, and Privacy pages.**

## Folder structure

```
bharatshield/
├── index.html
├── message.html
├── link.html
├── screenshot.html
├── result.html
├── safety.html
├── about.html
├── privacy.html
├── css/
│   ├── style.css        (design tokens, layout, header/footer, buttons)
│   ├── components.css   (hero, analyzer forms, result screen, upload box)
│   └── responsive.css   (mobile/tablet/desktop breakpoints)
├── js/
│   ├── risk-engine.js   (rule-based detection + scoring — the "brain")
│   ├── mock-ai.js        (abstraction layer other code calls into)
│   ├── message.js / link.js / screenshot.js / result.js  (page logic)
│   ├── navigation.js     (shared header/footer + mobile nav)
│   ├── storage.js        (sessionStorage bridge between pages)
│   └── utilities.js      (validation + safe DOM helpers)
└── README.md
```

## How to run

No installation needed — it's static HTML.

1. Download/unzip the `bharatshield` folder.
2. Open `index.html` directly in a modern browser (Chrome, Edge, Firefox), **or**
   for the Screenshot Analyzer's OCR to work reliably, serve it locally:
   ```
   cd bharatshield
   python3 -m http.server 8080
   ```
   then visit `http://localhost:8080`.

## How the risk engine works (prototype)

`js/risk-engine.js` looks for ~18 known scam signals (urgency, OTP/PIN/password
requests, KYC warnings, prize claims, impersonation, suspicious links, etc.),
each with a configurable weight. Detected weights are summed into a 0–100 score,
mapped to LOW / MEDIUM / HIGH / CRITICAL, and the signal combination determines
the most likely scam category (Phishing, Fake KYC, OTP theft, Courier scam...).
Simple negation handling (e.g. *"never share your OTP"*) reduces false positives
on educational/warning-style text.

**This is a rule-based prototype, not a trained AI model.** It is built so a real
backend + NLP/LLM model can later sit behind the exact same `analyzeMessage()` /
`analyzeLink()` function signatures in `mock-ai.js`, without touching any UI code.

## Current limitations

- No backend — everything runs client-side; nothing is sent to a server.
- English-only analysis in this build (Hindi/Hinglish signal patterns can be
  added to the same `SIGNALS` object in `risk-engine.js`).
- OCR accuracy depends on image quality; low-confidence extractions prompt the
  user to review/correct text manually.
- Rule-based detection can miss novel or highly-worded-around scams (false
  negatives) and can occasionally flag legitimate content (false positives).

## Privacy & security notes

- No `eval()`, no `innerHTML` with user-provided content — all dynamic content
  is rendered via `textContent`/`createElement` (see `result.js`).
- No API keys are used or exposed anywhere in this frontend.
- Only the most recent analysis result is kept, in `sessionStorage`, cleared
  when the tab closes. OTPs/PINs/passwords are never stored even if pasted.

## Disclaimer

BharatShield provides an AI-assisted risk assessment and is not a definitive
determination of fraud. Always verify important information through official
channels. National Cyber Crime Helpline (India): **1930** · cybercrime.gov.in
