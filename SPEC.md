# InvestPilot — Product Specification

## Overview

InvestPilot is a personal investment advisor Progressive Web App (PWA) designed for a single household (2 users). It tracks a DeGiro ETF portfolio and Morgan Stanley Uber equity, provides AI-powered rebalancing advice, and manages RSU vesting schedules.

## Tech Stack

- **Frontend**: React 19 + TypeScript, Vite, Tailwind CSS v4, PWA (Workbox)
- **Backend**: Node.js, Hono (lightweight)
- **Database**: SQLite via Turso (libsql) — 2 users, keep it simple
- **AI**: Anthropic Claude API
- **Auth**: Simple password-based, 2 users only, server-side sessions
- **Hosting**: Vercel

## Project Structure

```
investpilot/
├── apps/
│   ├── web/          # React PWA frontend
│   └── api/          # Hono API backend
├── packages/
│   ├── core/         # Shared types, business logic, calculations
│   ├── db/           # Turso/libsql schema, migrations, queries
│   └── ai/           # Claude API prompts, parsers, advisory modes
├── SPEC.md
├── CLAUDE.md
└── package.json      # Workspace root (pnpm)
```

## Architecture Rules

- All business logic in `packages/core` — frontend and API import from there
- Claude API calls ONLY happen server-side (in `apps/api` or `packages/ai`)
- Never store API keys in frontend code
- Screenshot parsing returns structured data that user confirms before saving
- All financial calculations must have unit tests with known expected values
- Vesting schedules are computed from grant parameters, never manually entered

## Coding Conventions

- TypeScript strict mode, no `any` types
- Functional components with hooks, no class components
- Named exports only (no default exports)
- Use Zod for all runtime validation (API inputs, parsed data)
- All money values stored as integers (cents/smallest unit) to avoid floating point
- All dates stored as ISO 8601 strings in UTC
- API responses follow `{ data, error, meta }` envelope pattern
- Use `async/await`, no raw promises or callbacks

## Data Model

### User

```typescript
{
  id: string;
  name: string;
  settings: Record<string, unknown>;
}
```

### Portfolio_Snapshot

```typescript
{
  id: string;
  date: string; // ISO 8601
  source: 'screenshot' | 'manual';
  raw_image_url: string | null;
  holdings: Holding[];
}
```

### Holding

```typescript
{
  snapshot_id: string;
  asset_type: 'ETF' | 'Stock';
  name: string;
  isin: string;
  quantity: number;
  price: number; // integer cents
  value: number; // integer cents
  exchange: string;
}
```

### Target_Allocation

```typescript
{
  id: string;
  asset_class: string;
  etf_isin: string;
  etf_name: string;
  target_pct: number;
  exchange: string;
  is_free_etf: boolean;
  active: boolean;
}
```

### Uber_Equity

```typescript
{
  type: 'RSU' | 'ESPP' | 'Direct_Shares';
  shares_held: number;
  shares_available_to_transact: number;
  market_value_usd: number; // integer cents
  holding_period_active: boolean;
}
```

### Uber_RSU_Grant

```typescript
{
  grant_id: string;
  total_rsus: number;
  vesting_commencement_date: string; // ISO 8601
  vesting_formula: string;
  date_of_grant: string; // ISO 8601
  source_document_url: string | null;
  status: 'active' | 'fully_vested' | 'forfeited';
}
```

### Pending_Transfer

```typescript
{
  id: string;
  source: string;
  destination: string;
  amount_usd: number | null; // integer cents
  amount_eur: number | null; // integer cents
  fx_rate: number | null;
  status: 'pending' | 'completed';
  date_initiated: string; // ISO 8601
  date_completed: string | null; // ISO 8601
}
```

### Cash_Balance

```typescript
{
  id: string;
  amount: number; // integer cents
  currency: string;
  date_updated: string; // ISO 8601
  notes: string | null;
}
```

### Transaction_History

```typescript
{
  id: string;
  date: string; // ISO 8601
  action: 'buy' | 'sell';
  asset: string;
  quantity: number;
  price: number; // integer cents
  fee: number; // integer cents
  exchange: string;
}
```

### Advice_Log

```typescript
{
  id: string;
  date: string; // ISO 8601
  type: 'RSU' | 'rebalance' | 'strategy' | 'DCA';
  recommendation_text: string;
  was_followed: boolean | null;
}
```

### Notification

```typescript
{
  id: string;
  type: string;
  scheduled_date: string; // ISO 8601
  sent: boolean;
  message: string;
}
```

### DeGiro_ETF_List

```typescript
{
  isin: string;
  name: string;
  exchange: string;
  is_core_selection: boolean;
  typical_spread_bps: number | null;
  avg_daily_volume: number | null;
}
```

### DeGiro_Monthly_Trade_Tracker

```typescript
{
  id: string;
  isin: string;
  month: string; // YYYY-MM
  transactions: Array<{
    direction: 'buy' | 'sell';
    amount: number; // integer cents
    was_free: boolean;
  }>;
}
```

## Reference Portfolio (as of 2026-03-01)

### DeGiro ETF Portfolio (~€24,300 EUR)

| ETF                              | Symbol | ISIN         | Qty | Price (€) | Value (€) |
| -------------------------------- | ------ | ------------ | --- | --------- | --------- |
| Vanguard FTSE All-World UCITS    | VWRL   | IE00B3RBWM25 | 112 | 137.28    | 15,375    |
| Vanguard S&P 500 UCITS           | VUSA   | IE00B3XXRP09 | 27  | 105.46    | 2,847     |
| iShares MSCI World Small Cap     | IUSN   | IE00BF4RFH31 | 339 | 7.80      | 2,644     |
| Vanguard Global Aggregate Bond   | VAGE   | IE00BG47KB92 | 59  | 20.40     | 1,204     |
| iShares AEX UCITS (Dist)         | IAEX   | IE00B0M62Y33 | 12  | 95.77     | 1,149     |
| Invesco EQQQ NASDAQ-100          | EQQQ   | IE0032077012 | 2   | 490.10    | 980       |
| BNPPE Bloomberg Europe Defensive | BJL8   | LU3047998896 | 10  | 10.41     | 104       |

### Morgan Stanley Uber Equity

| Type            | Shares | Value (USD) | Available to Transact |
| --------------- | ------ | ----------- | --------------------- |
| Direct Shares   | 32     | $2,214      | 32                    |
| ESPP (non-qual) | 178    | $12,314     | 178                   |
| RSUs (unvested) | 335    | $23,175     | 0                     |
| Total           | 545    | $37,703     | 210                   |

### Active RSU Grant

| Field                | Value                              |
| -------------------- | ---------------------------------- |
| Grant ID             | U121543                            |
| Total RSUs           | 502                                |
| Vesting commencement | 2024-11-16                         |
| Formula              | 3/48 at month 3, then 1/48 monthly |

## Key Commands

```bash
pnpm install          # Install all dependencies
pnpm dev              # Start dev server (frontend + API)
pnpm build            # Production build
pnpm test             # Run all tests
pnpm test:unit        # Unit tests only
pnpm lint             # ESLint + Prettier check
pnpm db:migrate       # Run database migrations
pnpm db:seed          # Seed with reference portfolio data
```

## Development Phases

- **Phase 1A**: Project scaffolding and monorepo setup
- **Phase 1B**: Core calculations (vesting, concentration, rebalancing, fair use)
- **Phase 2**: Database layer and API endpoints
- **Phase 3**: Frontend UI components
- **Phase 4**: AI advisory features
- **Phase 5**: PWA polish, notifications, production deployment
