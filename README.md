# BullHawk

A full-stack stock advisor and paper-trading simulator for Indian (NSE/BSE) and global markets — explainable buy/sell/hold signals, portfolio tracking, broker sync (Zerodha/Upstox), goals, mutual funds, IPOs, tax estimation, and a community layer.

## Architecture

- **Frontend**: Next.js 16 (App Router) + React 19, Tailwind CSS. Lives in [`frontend/`](frontend).
- **Backend**: Express + TypeScript, Prisma ORM over PostgreSQL. Lives in [`backend/`](backend).
- **Background jobs**: in-process `setInterval` loops (no queue broker — see [`backend/src/jobs/scheduler.ts`](backend/src/jobs/scheduler.ts)) for the market scanner, price alerts, and portfolio signal notifications.

## The decision engine

Every BUY/SELL/HOLD/WAIT call comes from a single explainable scoring function: [`computeDecision()`](backend/src/lib/engine/decision.ts). It blends 7 weighted pillars (see [`backend/src/config/scoring.ts`](backend/src/config/scoring.ts)) into a 0–100 score:

| Pillar | Weight | Signal |
|---|---|---|
| Trend | 20% | SMA20/50/200 crossovers |
| Momentum | 15% | RSI(14), MACD |
| Volume | 10% | Volume vs. 20-day average |
| Fundamentals | 20% | ROE, growth, debt-to-equity, free cash flow |
| News Sentiment | 10% | Lexicon-based headline analysis |
| Stock Risk | 10% | Volatility, beta, debt (100 = low risk) |
| Market & Sector | 15% | Broad market risk + sector performance |

Safety overrides can force a `WAIT` regardless of score: insufficient data quality, elevated market risk (≥75) overriding a BUY, or a technical downtrend overriding a BUY. Every pillar carries its own evidence list so the UI can explain *why*, not just *what*.

Full test coverage for this and the other pure engine modules (finance/XIRR, sentiment, horizon, market risk) lives in `*.test.ts` files next to their source — see [Testing](#testing).

## The two-wallet design

Every account gets two independent paper-trading wallets — one INR, one USD — so you can practice both Indian and global-market trading. New accounts start at ₹0 / $0; add funds via Payments → Deposit (simulated unless Razorpay keys are configured).

## Getting started

### Prerequisites
- Node.js 20+
- A PostgreSQL database (local or hosted)

### Backend
```bash
cd backend
npm install
cp .env.example .env   # fill in DATABASE_URL, SESSION_SECRET, ENCRYPTION_KEY at minimum
npm run dev             # http://localhost:5000
```

### Frontend
```bash
cd frontend
npm install
npm run dev             # http://localhost:3000
```

Both can also be launched via `.claude/launch.json` if you're using Claude Code.

## Scripts

| | Backend | Frontend |
|---|---|---|
| Dev server | `npm run dev` | `npm run dev` |
| Type-check | `npm run typecheck` | `npm run typecheck` |
| Tests | `npm test` | — |
| Lint | — | `npm run lint` |
| Build | `npm run build` | `npm run build` |

## Testing

```bash
cd backend
npm test
```

71 tests cover the pure engine/finance modules (`decision.ts`, `finance.ts`, `sentiment.ts`, `horizon.ts`, `marketRisk.ts`) — the logic every signal and financial calculation in the app depends on. There is currently no integration-test layer for the Express routes or a frontend test suite; see the open items below.

## CI

[`.github/workflows/ci.yml`](.github/workflows/ci.yml) runs on every push to `main` and every PR: backend type-check + tests, frontend type-check + lint (lint is advisory only for now — the repo has a pre-existing `no-explicit-any` backlog unrelated to any single change).

## Environment variables

See [`backend/.env.example`](backend/.env.example) for the full list. Every external integration (brokers, payments, email, news, AI) is feature-detected at runtime — if its keys are absent, that feature reports itself as unconfigured instead of faking data.

Key ones:
- `DATABASE_URL` — PostgreSQL connection string (required)
- `SESSION_SECRET` — required in production; auto-generated ephemeral value in dev
- `ENCRYPTION_KEY` — required before any broker token can be stored (AES-256-GCM at rest)
- `ZERODHA_API_KEY` / `ZERODHA_API_SECRET`, `UPSTOX_API_KEY` / `UPSTOX_API_SECRET` — broker OAuth
- `RAZORPAY_KEY_ID` / `RAZORPAY_KEY_SECRET` — real payments (omit for simulated-only deposits)

## Known gaps / open items

- No integration tests for Express routes, no frontend test suite.
- No Decimal/fixed-point handling for money fields (stored as `Float` in Prisma) — no observed bug from this, but it's a real precision risk at scale; deliberately not changed without a dedicated migration effort (see git history / conversation notes for the tradeoff discussion).
- Zerodha's OAuth callback validates CSRF `state` for Upstox but not Zerodha (Kite Connect doesn't echo a plain `state` param — it would need the documented `redirect_params` mechanism to get real protection back). Flagged, not yet fixed.
- No structured logging or error tracking — `console.log`/`console.error` only.
- No compliance/KYC review for real-money broker integration (current broker connect is simulated by default; real trading requires configuring live API keys).

## License

Proprietary — all rights reserved.
