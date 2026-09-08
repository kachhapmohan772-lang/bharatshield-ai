# BharatShield AI — API Documentation

Base URL (local dev): `http://localhost:4000`

All responses use one consistent envelope:

**Success**
```json
{ "success": true, "data": { ... } }
```

**Error**
```json
{ "success": false, "error": { "code": "INVALID_INPUT", "message": "..." } }
```

No endpoint ever returns a raw stack trace, internal file path, or secret.

---

## GET /api/health

Returns whether the server is running and which mode it's in.

**Response `200`**
```json
{ "status": "ok", "mode": "ml-trained", "time": "2026-08-11T10:21:28.382Z" }
```
`mode` is `"ml-trained"` when the bundled trained model is loaded. If the model
artifact is missing, the backend falls back to the older rule-based engine.

---

## POST /api/analyze/message

Analyzes free text (SMS/WhatsApp/email) for scam signals.

**Request**
```json
{ "text": "Your account will be blocked today. Share the OTP immediately." }
```

| Field | Type   | Required | Limit             |
|-------|--------|----------|-------------------|
| text  | string | yes      | 1–5000 characters |

**Response `200`** (`data` shape)
```json
{
  "riskLevel": "HIGH",
  "riskScore": 82,
  "category": "OTP / Credential Theft",
  "categoryId": "otp_credential_theft",
  "confidence": "high",
  "signals": [ { "id": "otpRequest", "name": "OTP request", "severity": "high", "weight": 22, "evidence": "...", "meaning": "...", "why": "..." } ],
  "explanationSummary": "...",
  "recommendedActions": ["..."],
  "avoidActions": ["..."],
  "verificationGuidance": ["..."],
  "disclaimer": "...",
  "aiAssisted": false
}
```

**Errors**
| Status | Code               | Cause                                  |
|--------|--------------------|-----------------------------------------|
| 400    | INVALID_BODY       | Body isn't a JSON object                |
| 400    | UNEXPECTED_FIELDS  | Body has fields other than `text`       |
| 400    | INVALID_INPUT      | `text` missing/empty                    |
| 400    | INPUT_TOO_LARGE    | `text` over 5000 characters             |
| 429    | RATE_LIMITED       | Too many requests from this IP          |

---

## POST /api/analyze/link

Analyzes a URL's **structure only** — the server never fetches, visits, or crawls it.

**Request**
```json
{ "url": "http://paytm.secure-login.example.top/kyc" }
```

| Field | Type   | Required | Limit         |
|-------|--------|----------|---------------|
| url   | string | yes      | ≤ 2048 chars  |

**Response `200`** (`data` shape) — same envelope as message analysis, plus `hostname` and `fullUrlChecked`.

**Errors**
| Status | Code               | Cause                                    |
|--------|--------------------|-------------------------------------------|
| 400    | INVALID_INPUT      | `url` missing/empty                       |
| 400    | INVALID_URL        | Not a parseable URL                       |
| 400    | UNSAFE_SCHEME      | `javascript:`, `data:`, `file:`, etc.     |
| 400    | INPUT_TOO_LARGE    | URL over 2048 characters                  |
| 429    | RATE_LIMITED       | Too many requests from this IP            |

---

## POST /api/analyze/screenshot

Analyzes text **already extracted client-side** via in-browser OCR (Tesseract.js
in the frontend). The backend does not receive or store the raw image in this
prototype — this keeps sensitive images off the server entirely.

**Request** — identical shape to `/api/analyze/message`:
```json
{ "text": "text extracted from the screenshot" }
```

**Response** — same as `/api/analyze/message`, with `"sourceType": "screenshot-ocr-text"` added.

> **Future extension:** a raw-image upload endpoint (`multipart/form-data`, MIME/size
> validation, server-side OCR, temporary-file deletion) can be added here without
> changing this contract — the frontend would simply stop doing OCR itself.

---

## Rate limiting

All `/api/analyze/*` endpoints are limited per IP (default: **20 requests / 60 seconds**,
configurable via `RATE_LIMIT_MAX` / `RATE_LIMIT_WINDOW_MS`). Exceeding the limit returns:

```json
{ "success": false, "error": { "code": "RATE_LIMITED", "message": "Too many requests. Please wait a moment and try again." } }
```

## Authentication

None in this prototype — it's a stateless, anonymous analysis API. If user accounts/history
are added later, authenticated endpoints should sit behind a separate `/api/auth/*` flow.

## CORS

Controlled by `ALLOWED_ORIGIN` in `.env`. Defaults to `*` for local development;
set to your exact frontend origin(s) in production.
