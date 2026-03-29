/**
 * SQLite schema definitions for InvestPilot.
 * These strings are used both as documentation and for schema validation.
 * The canonical schema is in migrations/0001_initial.sql.
 *
 * Money: stored as INTEGER (cents). €137.28 → 13728. $2,214 → 221400.
 * Dates: stored as TEXT in ISO 8601 UTC. "2026-03-01T00:00:00Z"
 */

export const SCHEMA_TABLES = [
  'users',
  'portfolio_snapshots',
  'holdings',
  'target_allocations',
  'uber_equity',
  'uber_rsu_grants',
  'pending_transfers',
  'cash_balances',
  'transaction_history',
  'advice_log',
  'notifications',
  'degiro_etf_list',
  'degiro_monthly_trade_tracker',
  'degiro_monthly_trade_transactions',
  'migrations',
] as const;

export type SchemaTable = (typeof SCHEMA_TABLES)[number];
