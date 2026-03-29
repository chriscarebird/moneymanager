# CLAUDE.md — InvestPilot Development Guide

This file provides guidance for Claude Code when working on the InvestPilot project.

## Project Overview

InvestPilot is a personal investment advisor PWA for 2 users. It tracks a DeGiro ETF portfolio and Morgan Stanley Uber equity, provides AI-powered rebalancing advice, and manages RSU vesting schedules.

## Repository Structure

```
investpilot/
├── apps/
│   ├── web/          # React 19 PWA frontend (Vite, Tailwind CSS v4)
│   └── api/          # Hono API backend (Node.js)
├── packages/
│   ├── core/         # Shared types, business logic, calculations
│   ├── db/           # Turso/libsql schema, migrations, queries
│   └── ai/           # Claude API prompts, parsers, advisory modes
├── SPEC.md           # Full product specification
├── CLAUDE.md         # This file
└── package.json      # Workspace root (pnpm)
```

## Essential Commands

```bash
pnpm install          # Install all dependencies
pnpm dev              # Start dev server (frontend + API in parallel)
pnpm build            # Production build (packages first, then apps)
pnpm test             # Run all tests
pnpm test:unit        # Unit tests only
pnpm lint             # ESLint + Prettier check
pnpm db:migrate       # Run database migrations
pnpm db:seed          # Seed with reference portfolio data
```

## Coding Conventions

### TypeScript

- Strict mode everywhere — `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`
- **No `any` types** — ESLint rule enforces this
- Named exports only — no default exports anywhere
- Use Zod for all runtime validation (API inputs, parsed data from Claude)

### Money Handling

- All money values stored as **integers in cents** (smallest currency unit)
- Examples: €137.28 → `13728`, $2,214 → `221400`
- Never use floating point for financial calculations
- Apply conversion only at the display layer

### Dates

- All dates stored as **ISO 8601 strings in UTC**: `"2026-03-01T00:00:00Z"`
- Use `new Date().toISOString()` for current timestamp

### API Design

- All responses follow the envelope pattern:
  ```typescript
  { data: T | null; error: string | null; meta?: Record<string, unknown> }
  ```
- Use `async/await` — no raw promises or `.then()` chains

### React

- Functional components with hooks only — no class components
- Named exports only
- Keep components focused — extract logic to hooks

## Architecture Rules

1. **Business logic lives in `packages/core`** — both frontend and API import from there
2. **Claude API calls are server-side only** — never in frontend code
3. **Never expose API keys to the browser** — use env vars on the server
4. **Screenshot parsing is always confirmed by the user** before data is saved to DB
5. **All financial calculations must have unit tests** with known expected values
6. **Vesting schedules are computed from grant parameters** — never manually entered

## Package Naming

- `@investpilot/core` — shared types and calculations
- `@investpilot/db` — database layer
- `@investpilot/ai` — Claude AI client

## Environment Variables

See `.env.example` for all required variables. Key ones:

- `ANTHROPIC_API_KEY` — Claude API key (server-side only)
- `TURSO_DATABASE_URL` + `TURSO_AUTH_TOKEN` — Turso database
- `USER1_PASSWORD` + `USER2_PASSWORD` — hashed passwords for 2 users
- `SESSION_SECRET` — JWT signing secret

## Database Notes

- SQLite via Turso (libsql) — simple setup for 2-user personal app
- Schema in `packages/db/src/migrations/0001_initial.sql`
- Run migrations: `pnpm db:migrate`
- Seed reference data: `pnpm db:seed`

## Authentication

- Two hardcoded users: "user1" and "user2"
- Passwords bcrypt-hashed and compared at login
- Sessions via signed HTTP-only JWT cookies (7-day expiry)
- This is intentionally simple — it's a personal app

## Development Phases

- **Phase 1A** ✅ Project scaffolding and monorepo setup
- **Phase 1B** Core calculations (vesting, concentration, rebalancing, fair use)
- **Phase 2** Database layer and API endpoints
- **Phase 3** Frontend UI components
- **Phase 4** AI advisory features
- **Phase 5** PWA polish, notifications, production deployment

## Testing Strategy

- Unit tests for all calculations in `packages/core` (vitest)
- Integration tests for API routes
- Use known financial values as test inputs — verify exact cent amounts
- Test RSU vesting with the reference grant (U121543)

## Common Pitfalls

- Don't use floating point for money — always work in integer cents
- Don't call the Anthropic API from frontend code — route through the API
- Don't hardcode passwords — read from env vars
- Don't store API keys in git — use `.env` (gitignored)
- Vesting commencement date ≠ grant date — these are different fields
