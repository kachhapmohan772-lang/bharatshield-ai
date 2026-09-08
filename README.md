# BharatShield AI — Backend

Secure Node.js + Express API that powers message, link, and screenshot risk
analysis. It is the single source of truth for the risk score — the frontend
only displays whatever this server returns.

## Architecture

```
Frontend (fetch)
   ↓ HTTPS
Express app (helmet + CORS)
   ↓
Request context (request ID, timing, safe logging)
   ↓
Body parser (200kb limit)
   ↓
Route  →  Rate limiter (20 req/min/IP)  →  Input validation
   ↓
Controller
   ↓
AI Service  →  (MOCK mode today: rule engine only)
   ↓                (AI mode: real provider call, validated, safe fallback)
Risk Engine (authoritative scoring)
   ↓
Consistent JSON envelope  →  Frontend
```

## Why Node + Express

Chosen over Python/FastAPI for this prototype because:
- The frontend is already vanilla JS — sharing language/mental model speeds
  development and keeps the risk-engine logic easy to mirror on both sides.
- Express has a minimal footprint and is easy for a beginner/intermediate
  developer to read end-to-end (a Step 7 requirement).
- npm's ecosystem (`helmet`, `express-rate-limit`, `cors`) covers this
  project's security needs without heavy configuration.

## Endpoints

See **API_DOCS.md** for full request/response schemas.

| Method | Path                     | Purpose                          |
|--------|--------------------------|-----------------------------------|
| GET    | /api/health              | Liveness + mode check             |
| POST   | /api/analyze/message     | Analyze free text                 |
| POST   | /api/analyze/link        | Analyze a URL's structure         |
| POST   | /api/analyze/screenshot  | Analyze OCR'd screenshot text     |

## How to run

```bash
cd bharatshield-backend
npm install
cp .env.example .env      # edit if needed — safe defaults work out of the box
npm start                 # starts on http://localhost:4000
```

Development mode with auto-restart on file changes:
```bash
npm run dev
```

Run the test suite:
```bash
npm test
```

## ML logic layer

The backend now uses the bundled logic package at `src/logic` for analysis.
Message checks run through a trained Naive Bayes model, and link checks run
through a trained Logistic Regression model. The frontend does not need to
change; it still calls the same `/api/analyze/*` endpoints.

Useful commands:
```bash
npm run train:ml      # retrain from src/logic/data/*.json
npm run evaluate:ml   # measure model accuracy
npm run test:logic    # run logic-layer tests
```

## Connecting the frontend

The frontend (`bharatshield/js/mock-ai.js`) calls this API at
`http://localhost:4000/api` by default. Start this backend before opening the
frontend for full functionality — but the frontend keeps working even if the
backend is offline, via an automatic in-browser fallback (clearly labelled on
the result screen as "Analyzed locally").

To point the frontend at a different backend URL (e.g. a deployed instance),
set this before the frontend's scripts load:
```html
<script>window.BHARATSHIELD_API_BASE = "https://your-backend.example.com/api";</script>
```

## Security measures implemented

- **Helmet** — sets standard security headers.
- **CORS** — restricted via `ALLOWED_ORIGIN`; defaults to permissive for local dev only.
- **Rate limiting** — 20 requests/minute/IP on all analyze endpoints (configurable).
- **Strict input validation** — rejects unexpected fields, oversized payloads,
  invalid URLs, and dangerous URL schemes (`javascript:`, `data:`, `file:`).
- **Body size cap** — 200 KB, blocks payload-flooding abuse.
- **No stack traces or internals** ever returned to the client — see `errorHandler.js`.
- **Safe logging** — `utils/logger.js` never logs message/URL bodies or secrets.
- **Server holds all authority** — the risk score is always computed server-side;
  the frontend cannot submit or influence a score directly.
- **No API key in this codebase.** `AI_API_KEY` is read from `.env` only, and the
  service runs in MOCK (rule-based) mode whenever it's unset.

## Development vs Production mode

| | MOCK (default) | AI-assisted (future) |
|---|---|---|
| Trigger | `AI_API_KEY` unset | `AI_API_KEY` set + provider call implemented in `aiService.js` |
| Detection | Rule engine only | Rule engine + validated AI output, rules-only fallback on any AI failure |
| Cost | Free | Provider API cost |

`aiService.js` already contains the isolation pattern (system instructions kept
separate from untrusted user content) and a response validator
(`validateAiResponse`) so wiring a real provider later doesn't require
touching the controller, routes, or frontend.

## What is intentionally NOT in this prototype

- No database — there's no user history/accounts requirement yet (Step 7
  "Database Decision": not needed for this MVP; add SQLite/Postgres only if
  history becomes a real feature).
- No raw image upload endpoint — OCR runs client-side (Tesseract.js) so
  screenshots never leave the user's browser as image data.
- No authentication — this is a stateless, anonymous analysis API.

## Privacy

This server does not persist message/link/screenshot content anywhere. Each
request is processed in memory and discarded once the response is sent. Logs
contain only metadata (request ID, path, status, timing) — never the
submitted text/URL.

## Disclaimer

BharatShield provides an AI-assisted risk assessment and is not a definitive
determination of fraud. This is a rule-based prototype, not a certified
fraud-detection system.
