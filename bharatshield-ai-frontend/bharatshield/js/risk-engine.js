/**
 * BharatShield AI — Risk Engine
 * -----------------------------------------------------------------------
 * PROTOTYPE NOTICE:
 * This is a RULE-BASED PROTOTYPE, not a trained AI/ML model.
 * It looks for known scam signals using patterns and weighted scoring.
 * It cannot catch every scam and can occasionally misjudge legitimate
 * content. It is one input to help a person decide — not proof of fraud.
 *
 * A future version can plug a real NLP/LLM layer in behind the same
 * analyzeMessage()/analyzeLink() function signatures (see mock-ai.js).
 * -----------------------------------------------------------------------
 */

const RiskEngine = (() => {

  // ---------------------------------------------------------------------
  // 1. SIGNAL DEFINITIONS
  // Every signal has: id, name, weight (base severity), meaning, why it
  // matters, and the pattern(s) used to detect it.
  // Weights are prototype defaults — tune with real testing later.
  // ---------------------------------------------------------------------
  const SIGNALS = {
    urgency: {
      name: "Urgency pressure",
      weight: 12,
      meaning: "The message pushes you to act immediately, without time to think.",
      why: "Scammers create urgency so you skip careful verification.",
      patterns: [/\bimmediately\b/i, /\burgent(ly)?\b/i, /\bact now\b/i, /\bwithin\s+(24|12|6|2|1)\s*hours?\b/i,
        /\bexpir(es|ing|ed)?\s*(today|soon|shortly)\b/i, /\blast warning\b/i, /\bfinal notice\b/i, /\btoday only\b/i]
    },
    fearThreat: {
      name: "Fear / threat language",
      weight: 14,
      meaning: "The message threatens a negative consequence — blocking, legal trouble, arrest.",
      why: "Fear pushes people to comply before verifying whether the threat is real.",
      patterns: [/\bblock(ed)?\b/i, /\bsuspend(ed)?\b/i, /\blegal action\b/i, /\bpolice case\b/i, /\barrest(ed)?\b/i,
        /\bF\.?I\.?R\.?\b/, /\bpenalty\b/i, /\bfine of\b/i, /\bdigital arrest\b/i]
    },
    financialReward: {
      name: "Unexpected reward / prize",
      weight: 14,
      meaning: "The message offers money, a prize, or a reward you did not apply for.",
      why: "An unexpected windfall is one of the oldest scam hooks — it lowers your guard.",
      patterns: [/\byou\s*(have\s*)?won\b/i, /\bcongratulations\b/i, /\blottery\b/i, /\blucky draw\b/i,
        /\bclaim your prize\b/i, /\bcashback of ₹?\d/i, /\breward of ₹?\d/i]
    },
    paymentRequest: {
      name: "Payment / fee request",
      weight: 16,
      meaning: "The message asks you to pay, transfer, or deposit money.",
      why: "Legitimate refunds or prizes never require you to pay a 'processing fee' first.",
      patterns: [/\bpay(ment)?\s*(now|immediately)?\b.*₹/i, /\btransfer\s+₹?\d/i, /\bprocessing fee\b/i,
        /\bsend\s+₹?\d/i, /\bdeposit\s+₹?\d/i, /\bpay\s+a\s+small\s+fee\b/i]
    },
    otpRequest: {
      name: "OTP request",
      weight: 22,
      meaning: "The message asks you to share a one-time password (OTP).",
      why: "No genuine bank, company, or government body ever needs your OTP over call/message — it exists specifically so only you can authorise a transaction.",
      patterns: [/\bshare\s+(your\s+)?otp\b/i, /\bsend\s+(your\s+)?otp\b/i, /\bprovide\s+(your\s+)?otp\b/i,
        /\botp\s+is\s+required\b/i, /\btell\s+(us|me)\s+the\s+otp\b/i],
      negationPatterns: [/\bnever\s+share\s+(your\s+)?otp\b/i, /\bdo\s*n['o]t\s+share\s+(your\s+)?otp\b/i,
        /\bdo\s*n['o]t\s+share\s+otp\s+with\s+anyone\b/i, /\bnobody\s+will\s+ask\s+.*otp\b/i]
    },
    pinRequest: {
      name: "PIN request",
      weight: 22,
      meaning: "The message asks for your ATM/UPI PIN.",
      why: "Your PIN authorises money movement — it should never be shared, ever, with anyone.",
      patterns: [/\bshare\s+(your\s+)?(atm\s+)?pin\b/i, /\bsend\s+(your\s+)?(upi\s+)?pin\b/i, /\benter\s+your\s+pin\b/i],
      negationPatterns: [/\bnever\s+share\s+(your\s+)?pin\b/i, /\bdo\s*n['o]t\s+share\s+(your\s+)?pin\b/i]
    },
    passwordRequest: {
      name: "Password request",
      weight: 20,
      meaning: "The message asks for your account password or login credentials.",
      why: "Legitimate organisations never ask you to send your password over SMS, WhatsApp, or email.",
      patterns: [/\bshare\s+(your\s+)?password\b/i, /\bsend\s+(your\s+)?password\b/i, /\blogin\s+details\b/i,
        /\bverify\s+your\s+password\b/i],
      negationPatterns: [/\bnever\s+share\s+(your\s+)?password\b/i, /\bdo\s*n['o]t\s+share\s+(your\s+)?password\b/i]
    },
    kycWarning: {
      name: "KYC / account-suspension warning",
      weight: 16,
      meaning: "The message claims your KYC is incomplete or your account will be suspended.",
      why: "'Update your KYC or lose access' is one of the most common Indian phishing scripts.",
      patterns: [/\bkyc\b/i, /\bupdate\s+your\s+(bank\s+)?details\b/i, /\baccount\s+will\s+be\s+(blocked|suspended|deactivated)\b/i,
        /\bre-?kyc\b/i]
    },
    suspiciousLink: {
      name: "Embedded link",
      weight: 14,
      meaning: "The message contains a link you are asked to click.",
      why: "Combined with urgency or a credential request, a link is often the delivery mechanism for phishing.",
      patterns: [/https?:\/\/\S+/i, /www\.\S+/i, /\bclick\s+(here|this\s+link|below)\b/i, /\bbit\.ly\/\S+/i, /\btinyurl\.com\/\S+/i]
    },
    impersonation: {
      name: "Organisation impersonation",
      weight: 12,
      meaning: "The message claims to be from a bank, government body, or well-known company.",
      why: "Impersonating a trusted name is how scammers borrow credibility they haven't earned.",
      patterns: [/\bofficial\s+(notice|message|communication)\b/i, /\bon\s+behalf\s+of\b/i, /\bincome\s+tax\s+department\b/i,
        /\brbi\b/i, /\bcustoms\s+department\b/i, /\bcbi\b/i]
    },
    refundClaim: {
      name: "Refund claim",
      weight: 10,
      meaning: "The message says a refund or cashback is pending for you.",
      why: "Fake refund messages are used to lure you into 'processing' steps that ask for banking details.",
      patterns: [/\brefund\s+(of\s+)?₹?\d*\s*is\s+pending\b/i, /\bclaim\s+your\s+refund\b/i, /\brefund\s+initiated\b/i]
    },
    courierClaim: {
      name: "Parcel / courier claim",
      weight: 10,
      meaning: "The message claims a parcel or courier delivery needs action from you.",
      why: "Fake courier/customs-duty messages are a common way to extract a small 'fee' payment.",
      patterns: [/\bparcel\s+is\s+held\b/i, /\bcustoms\s+duty\b/i, /\bdelivery\s+(pending|failed)\b/i, /\bcourier\s+.*\bpay\b/i]
    },
    customerCareImpersonation: {
      name: "Fake customer-care contact",
      weight: 10,
      meaning: "The message provides a 'customer care' or 'helpline' number to contact.",
      why: "Fraudsters plant fake helpline numbers on search engines and messages, then use the call to extract details.",
      patterns: [/\bcustomer\s+care\b/i, /\btoll\s*free\b/i, /\bhelpline\s+number\b/i]
    },
    investmentClaim: {
      name: "Guaranteed-return investment claim",
      weight: 16,
      meaning: "The message promises guaranteed or unusually high investment returns.",
      why: "No legitimate investment can guarantee high returns — this is a hallmark of Ponzi/investment fraud.",
      patterns: [/\bguaranteed\s+returns?\b/i, /\bdouble\s+your\s+money\b/i, /\b\d{2,}%\s+returns?\b/i, /\btrading\s+profit\s+guaranteed\b/i]
    },
    jobScam: {
      name: "Unrealistic job offer",
      weight: 12,
      meaning: "The message offers easy, high-paying work with little effort or vetting.",
      why: "Legitimate jobs don't recruit via bulk WhatsApp messages or ask for an upfront registration fee.",
      patterns: [/\bwork\s+from\s+home\b.*\bearn\b/i, /\bearn\s+₹?\d+\s+per\s+day\b/i, /\bno\s+interview\s+required\b/i,
        /\bregistration\s+fee\b/i]
    },
    loanScam: {
      name: "Instant loan offer",
      weight: 12,
      meaning: "The message offers an instant loan, often with an upfront fee.",
      why: "Genuine lenders don't approve loans over WhatsApp or demand a fee before disbursal.",
      patterns: [/\binstant\s+loan\b/i, /\bloan\s+approved\b/i, /\bpre-?approved\s+loan\b/i]
    },
    secrecyRequest: {
      name: "Request for secrecy",
      weight: 14,
      meaning: "The message asks you to keep the interaction confidential.",
      why: "Asking you not to tell anyone — especially your bank — is a classic manipulation tactic to prevent you from getting a second opinion.",
      patterns: [/\bdo\s*n['o]t\s+tell\s+anyone\b/i, /\bkeep\s+this\s+confidential\b/i, /\bdo\s*n['o]t\s+inform\s+your\s+bank\b/i]
    },
    platformShift: {
      name: "Request to move to another platform",
      weight: 8,
      meaning: "The message asks you to continue the conversation on WhatsApp/Telegram or a personal number.",
      why: "Moving off official channels makes it harder to trace or report the interaction.",
      patterns: [/\bcontact\s+us\s+on\s+whatsapp\b/i, /\bjoin\s+(our\s+)?telegram\b/i, /\bmessage\s+me\s+on\s+whatsapp\b/i]
    }
  };

  // ---------------------------------------------------------------------
  // 2. CATEGORY MAPPING
  // Category is chosen from the combination of signals with the
  // highest combined weight for that category's signal set.
  // ---------------------------------------------------------------------
  const CATEGORIES = [
    { id: "otp_credential_theft", name: "OTP / Credential Theft", signals: ["otpRequest", "pinRequest", "passwordRequest"] },
    { id: "fake_kyc", name: "Fake KYC / Account Suspension", signals: ["kycWarning", "fearThreat", "impersonation"] },
    { id: "prize_lottery", name: "Prize / Lottery Scam", signals: ["financialReward", "paymentRequest"] },
    { id: "phishing", name: "Phishing", signals: ["suspiciousLink", "otpRequest", "passwordRequest", "impersonation"] },
    { id: "refund_scam", name: "Refund Scam", signals: ["refundClaim", "paymentRequest"] },
    { id: "courier_scam", name: "Courier / Delivery Scam", signals: ["courierClaim", "paymentRequest"] },
    { id: "fake_customer_care", name: "Fake Customer Care", signals: ["customerCareImpersonation", "impersonation"] },
    { id: "investment_scam", name: "Investment / Financial Scam", signals: ["investmentClaim", "paymentRequest"] },
    { id: "job_scam", name: "Job Scam", signals: ["jobScam", "paymentRequest"] },
    { id: "loan_scam", name: "Loan Scam", signals: ["loanScam", "paymentRequest"] },
    { id: "payment_scam", name: "Payment / UPI Scam", signals: ["paymentRequest", "urgency"] }
  ];

  // ---------------------------------------------------------------------
  // 3. SAFE-ACTION LIBRARY (category-specific where possible)
  // ---------------------------------------------------------------------
  const ACTIONS = {
    generic: {
      recommended: [
        "Verify through the organisation's official app or website — not through any link or number in this message.",
        "Take a moment before responding. Legitimate matters can wait a few minutes for you to check."
      ],
      avoid: ["Don't share your OTP, PIN, or password with anyone.", "Don't send money based only on this message."]
    },
    otp_credential_theft: {
      recommended: ["Do not share the OTP/PIN/password with anyone, including someone claiming to be from your bank.",
        "If you already shared it, contact your bank's official helpline immediately and freeze your card/account."],
      avoid: ["Never read out an OTP over a call.", "Never type your PIN/password into a link sent to you."]
    },
    fake_kyc: {
      recommended: ["Open your bank's official app directly (not via this message) to check your KYC status.",
        "Visit your bank branch or call the number printed on your card/passbook if unsure."],
      avoid: ["Don't click the link in the message to 'update KYC'.", "Don't share Aadhaar/PAN details through the message."]
    },
    prize_lottery: {
      recommended: ["Remember: you cannot win a contest you never entered.",
        "If curious, search the organisation's official site directly for any real promotion."],
      avoid: ["Don't pay any 'processing fee' to claim a prize.", "Don't click the claim link."]
    },
    phishing: {
      recommended: ["Do not open the link. Type the organisation's known website address directly into your browser instead.",
        "Check the sender ID/email address carefully for spelling differences."],
      avoid: ["Don't enter login details on a page opened from this message.", "Don't download any file attached to it."]
    },
    refund_scam: {
      recommended: ["Check your bank statement or app directly for any real pending refund.",
        "Contact the merchant/bank using the number on their official website."],
      avoid: ["Don't share your card/UPI PIN to 'receive' a refund — refunds never require your PIN."]
    },
    courier_scam: {
      recommended: ["Track your parcel only through the courier company's official app/website using your order ID.",
        "If a customs fee is genuinely due, it will be reflected in that official tracking, not asked for via SMS link."],
      avoid: ["Don't pay a 'customs fee' through a link sent by SMS/WhatsApp."]
    },
    fake_customer_care: {
      recommended: ["Look up the official helpline number from the company's verified app/website, not from a search result or message."],
      avoid: ["Don't call numbers shared inside suspicious messages.", "Don't share OTP/screen-sharing access with anyone who calls you."]
    },
    investment_scam: {
      recommended: ["Verify any investment scheme with SEBI/RBI registration before investing.",
        "Talk to a trusted, independent financial advisor first."],
      avoid: ["Don't transfer money for 'guaranteed' returns.", "Don't join investment groups promising fixed daily profit."]
    },
    job_scam: {
      recommended: ["Verify the company and job posting on its official careers page.",
        "Genuine employers do not usually ask for money before hiring."],
      avoid: ["Don't pay a 'registration' or 'training' fee for a job.", "Don't share ID documents before verifying the employer."]
    },
    loan_scam: {
      recommended: ["Apply for loans only through RBI-registered banks/NBFCs directly.",
        "Check the lender's registration on the RBI website."],
      avoid: ["Don't pay any upfront 'processing fee' for a loan.", "Don't share bank login details to 'process' a loan."]
    },
    payment_scam: {
      recommended: ["Double-check the payee name and amount before approving any UPI request.",
        "Remember: receiving money never requires you to enter your UPI PIN."],
      avoid: ["Don't approve a 'collect request' you don't recognise.", "Don't send money to 'verify' your account."]
    }
  };

  const VERIFICATION_GUIDANCE = [
    "Use only official apps, verified websites, or the number printed on your bank card/statement — never a link or number from the message itself.",
    "When in doubt, wait. A genuine organisation will not penalise you for taking a few minutes to verify.",
    "You can report suspicious messages to India's National Cyber Crime helpline (1930) or cybercrime.gov.in."
  ];

  // ---------------------------------------------------------------------
  // 4. SCORING
  // ---------------------------------------------------------------------
  const THRESHOLDS = { low: 24, medium: 49, high: 74 }; // upper bounds; >high => CRITICAL

  function scoreToLevel(score) {
    if (score <= THRESHOLDS.low) return "LOW";
    if (score <= THRESHOLDS.medium) return "MEDIUM";
    if (score <= THRESHOLDS.high) return "HIGH";
    return "CRITICAL";
  }

  function pickCategory(detectedSignalIds) {
    if (detectedSignalIds.length === 0) return { id: "none", name: "No specific category" };
    let best = null;
    let bestScore = 0;
    for (const cat of CATEGORIES) {
      const overlap = cat.signals.filter(s => detectedSignalIds.includes(s));
      const weightSum = overlap.reduce((sum, s) => sum + SIGNALS[s].weight, 0);
      // Prefer categories where more of their defining signals matched
      const score = weightSum * (overlap.length / cat.signals.length);
      if (overlap.length > 0 && score > bestScore) {
        bestScore = score;
        best = cat;
      }
    }
    return best ? { id: best.id, name: best.name } : { id: "suspicious_general", name: "General suspicious activity" };
  }

  // ---------------------------------------------------------------------
  // 5. MESSAGE ANALYSIS
  // ---------------------------------------------------------------------
  function analyzeMessage(rawText) {
    const text = (rawText || "").toString();
    const trimmed = text.trim();

    if (trimmed.length === 0) {
      return { error: "EMPTY_INPUT", message: "Please paste a message to analyze." };
    }

    const detected = [];
    let score = 0;

    for (const [id, sig] of Object.entries(SIGNALS)) {
      let matched = false;
      let evidence = "";
      for (const pattern of sig.patterns) {
        const m = text.match(pattern);
        if (m) { matched = true; evidence = m[0]; break; }
      }
      if (!matched) continue;

      // Context / negation adjustment (reduces false positives)
      let weight = sig.weight;
      let contextNote = null;
      if (sig.negationPatterns) {
        const isNegated = sig.negationPatterns.some(np => np.test(text));
        if (isNegated) {
          weight = Math.round(weight * 0.15); // treat as awareness/warning context, not a request
          contextNote = "Detected in what looks like a warning/educational context, so its weight was reduced.";
        }
      }

      detected.push({
        id,
        name: sig.name,
        severity: weight >= 18 ? "high" : weight >= 10 ? "medium" : "low",
        weight,
        evidence,
        meaning: sig.meaning,
        why: sig.why,
        contextNote
      });
      score += weight;
    }

    // small combination bonus: multiple high-severity signals together are worse than the sum suggests
    const highCount = detected.filter(d => d.severity === "high" && !d.contextNote).length;
    if (highCount >= 2) score += 8;

    score = Math.max(0, Math.min(100, Math.round(score)));
    const level = scoreToLevel(score);
    const detectedIds = detected.filter(d => !d.contextNote).map(d => d.id);
    const category = pickCategory(detectedIds);

    const actionSet = ACTIONS[category.id] || ACTIONS.generic;
    const recommendedActions = [...new Set([...actionSet.recommended, ...ACTIONS.generic.recommended])].slice(0, 4);
    const avoidActions = [...new Set([...actionSet.avoid, ...ACTIONS.generic.avoid])].slice(0, 4);

    const explanationSummary = buildExplanationSummary(detected, level);

    return {
      mode: "rule-based-prototype",
      riskLevel: level,
      riskScore: score,
      category: category.name,
      categoryId: category.id,
      confidence: detected.length === 0 ? "low" : (detected.length >= 3 ? "high" : "medium"),
      signals: detected,
      explanationSummary,
      recommendedActions,
      avoidActions,
      verificationGuidance: VERIFICATION_GUIDANCE,
      originalText: text,
      disclaimer: "BharatShield provides an AI-assisted risk assessment based on known scam patterns. It is not a definitive determination of fraud. Always verify important information through official channels."
    };
  }

  function buildExplanationSummary(detected, level) {
    const real = detected.filter(d => !d.contextNote);
    if (real.length === 0) {
      return "No strong scam indicators were detected in this message. This does not guarantee the message is safe — always verify anything involving money or personal information.";
    }
    const top = real.sort((a, b) => b.weight - a.weight).slice(0, 3).map(d => d.name.toLowerCase());
    const list = top.length === 1 ? top[0] : top.slice(0, -1).join(", ") + " and " + top[top.length - 1];
    return `${level === "CRITICAL" || level === "HIGH" ? "High-risk" : "Some"} indicators were detected because the message shows signs of ${list}.`;
  }

  // ---------------------------------------------------------------------
  // 6. LINK ANALYSIS (safe, static — never fetches the URL)
  // ---------------------------------------------------------------------
  const SHORTENERS = ["bit.ly", "tinyurl.com", "t.co", "goo.gl", "is.gd", "cutt.ly", "rebrand.ly"];
  const SUSPICIOUS_TLDS = ["xyz", "top", "click", "info", "gq", "tk", "cf", "work", "loan", "win"];
  const SENSITIVE_BRAND_WORDS = ["paytm", "phonepe", "gpay", "googlepay", "sbi", "hdfc", "icici", "axis", "rbi",
    "kyc", "upi", "bank", "amazon", "flipkart", "irctc", "income tax", "aadhaar"];

  function analyzeLink(rawUrl) {
    const input = (rawUrl || "").toString().trim();
    if (!input) return { error: "EMPTY_INPUT", message: "Please enter a URL to analyze." };

    let urlObj;
    let normalized = input;
    if (!/^https?:\/\//i.test(normalized)) normalized = "http://" + normalized;

    try {
      urlObj = new URL(normalized);
    } catch (e) {
      return { error: "INVALID_URL", message: "This does not look like a valid URL." };
    }

    const signals = [];
    let score = 0;
    const hostname = urlObj.hostname.toLowerCase();
    const fullUrl = input.toLowerCase();

    function add(id, name, weight, meaning, why, evidence) {
      signals.push({ id, name, severity: weight >= 18 ? "high" : weight >= 10 ? "medium" : "low", weight, meaning, why, evidence });
      score += weight;
    }

    if (urlObj.protocol !== "https:") {
      add("no_https", "Not using HTTPS", 14, "The link does not use a secure (HTTPS) connection.",
        "Reputable services almost always use HTTPS. Its absence is a weak but real warning sign.", urlObj.protocol);
    }

    const subdomainCount = hostname.split(".").length - 2;
    if (subdomainCount >= 2) {
      add("excess_subdomains", "Unusually many subdomains", 14, "The domain has several subdomains stacked together.",
        "Scammers stack subdomains like 'sbi.login.verify-example.com' so the real domain (verify-example.com) is hidden at the end.", hostname);
    }

    if (/xn--/i.test(hostname)) {
      add("punycode", "Encoded (punycode) domain", 20, "The domain uses encoded characters that can visually impersonate another domain.",
        "This technique is used to make a fake domain look identical to a real one.", hostname);
    }

    if (/@/.test(input)) {
      add("at_symbol", "'@' symbol in the link", 22, "The link contains an '@' symbol.",
        "Browsers ignore everything before '@', so attackers use it to disguise the real destination.", "@");
    }

    const tld = hostname.split(".").pop();
    if (SUSPICIOUS_TLDS.includes(tld)) {
      add("suspicious_tld", "Uncommon domain ending", 10, `The domain ends in '.${tld}', which is inexpensive and frequently abused.`,
        "This alone isn't proof of harm, but it's over-represented in scam campaigns.", "." + tld);
    }

    const shortener = SHORTENERS.find(s => hostname.includes(s));
    if (shortener) {
      add("shortener", "Shortened link", 10, "This is a link-shortening service, so the real destination is hidden.",
        "You cannot verify where a shortened link leads until after you click it.", shortener);
    }

    const brandHit = SENSITIVE_BRAND_WORDS.find(b => hostname.replace(/-/g, "").includes(b.replace(/\s/g, "")));
    if (brandHit && !hostname.endsWith(`${brandHit}.com`) && !hostname.endsWith(`${brandHit}.co.in`)) {
      add("brand_impersonation", "Possible brand impersonation pattern", 20,
        `The domain includes the name '${brandHit}' but does not appear to be that organisation's actual domain.`,
        "Placing a trusted brand name inside an unrelated domain is a common phishing tactic.", hostname);
    }

    const hyphenCount = (hostname.match(/-/g) || []).length;
    if (hyphenCount >= 3) {
      add("many_hyphens", "Many hyphens in domain", 8, "The domain name contains an unusually high number of hyphens.",
        "Long, hyphen-heavy domains are often auto-generated for phishing campaigns.", hostname);
    }

    if (/\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}/.test(hostname)) {
      add("ip_address", "Raw IP address instead of a domain", 18, "The link points directly to a numeric IP address instead of a named domain.",
        "Legitimate consumer-facing services use named domains, not raw IP addresses.", hostname);
    }

    score = Math.max(0, Math.min(100, Math.round(score)));
    const level = scoreToLevel(score);

    const recommendedActions = ["Do not click this link.", "Go to the official app or type the organisation's known website address directly into your browser.",
      "If the link was shortened, ask the sender for the full, real destination before proceeding."];
    const avoidActions = ["Don't enter login details or OTP on a page opened from this link.", "Don't download anything from an unfamiliar link."];

    return {
      mode: "rule-based-prototype",
      riskLevel: level,
      riskScore: score,
      category: signals.length ? "Suspicious link pattern" : "No strong link risk pattern",
      confidence: signals.length === 0 ? "low" : (signals.length >= 3 ? "high" : "medium"),
      signals,
      hostname,
      fullUrlChecked: input,
      explanationSummary: signals.length
        ? `This link shows ${signals.length} suspicious pattern${signals.length > 1 ? "s" : ""} worth checking before you trust it.`
        : "No strong suspicious patterns were found in this link's structure. This does not confirm the destination is safe — BharatShield does not visit the link.",
      recommendedActions,
      avoidActions,
      verificationGuidance: VERIFICATION_GUIDANCE,
      disclaimer: "BharatShield only inspects the link's text structure and never visits the destination. A clean result is not proof of safety."
    };
  }

  return { analyzeMessage, analyzeLink, SIGNALS, CATEGORIES, THRESHOLDS };
})();
