-- InvestPilot Initial Migration
-- Version: 0001_initial
-- All money values stored as INTEGER (cents). Dates as TEXT (ISO 8601 UTC).

-- ── Migration tracking ────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS migrations (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  name        TEXT    NOT NULL UNIQUE,
  applied_at  TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);

-- ── Users ─────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS users (
  id                        TEXT    PRIMARY KEY,
  name                      TEXT    NOT NULL UNIQUE,
  -- Settings stored as JSON
  settings_json             TEXT    NOT NULL DEFAULT '{}'
);

INSERT OR IGNORE INTO users (id, name, settings_json) VALUES
  ('user1', 'user1', '{"cashBufferEurCents":50000,"concentrationLimitPct":20,"preferredExchange":"XETRA","baseCurrency":"EUR"}'),
  ('user2', 'user2', '{"cashBufferEurCents":50000,"concentrationLimitPct":20,"preferredExchange":"XETRA","baseCurrency":"EUR"}');

-- ── Portfolio Snapshots ───────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS portfolio_snapshots (
  id              TEXT    PRIMARY KEY,
  user_id         TEXT    NOT NULL REFERENCES users(id),
  date            TEXT    NOT NULL,  -- ISO 8601
  source          TEXT    NOT NULL CHECK (source IN ('screenshot', 'manual')),
  raw_image_url   TEXT,
  created_at      TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);

CREATE INDEX IF NOT EXISTS idx_portfolio_snapshots_user_date
  ON portfolio_snapshots (user_id, date DESC);

-- ── Holdings ──────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS holdings (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  snapshot_id     TEXT    NOT NULL REFERENCES portfolio_snapshots(id) ON DELETE CASCADE,
  asset_type      TEXT    NOT NULL CHECK (asset_type IN ('ETF', 'Stock')),
  name            TEXT    NOT NULL,
  isin            TEXT    NOT NULL,
  quantity        INTEGER NOT NULL,  -- number of shares (× 1 for whole shares)
  price_cents     INTEGER NOT NULL,  -- price per share in EUR cents
  value_cents     INTEGER NOT NULL,  -- total value in EUR cents
  exchange        TEXT    NOT NULL DEFAULT ''
);

CREATE INDEX IF NOT EXISTS idx_holdings_snapshot
  ON holdings (snapshot_id);

-- ── Target Allocations ────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS target_allocations (
  id              TEXT    PRIMARY KEY,
  user_id         TEXT    NOT NULL REFERENCES users(id),
  asset_class     TEXT    NOT NULL,
  etf_isin        TEXT    NOT NULL,
  etf_name        TEXT    NOT NULL,
  target_pct      REAL    NOT NULL CHECK (target_pct >= 0 AND target_pct <= 100),
  exchange        TEXT    NOT NULL DEFAULT 'XETRA',
  is_free_etf     INTEGER NOT NULL DEFAULT 0 CHECK (is_free_etf IN (0, 1)),
  active          INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1))
);

-- ── Uber Equity ───────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS uber_equity (
  id                              INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id                         TEXT    NOT NULL REFERENCES users(id),
  type                            TEXT    NOT NULL CHECK (type IN ('RSU', 'ESPP', 'Direct_Shares')),
  shares_held                     INTEGER NOT NULL DEFAULT 0,
  shares_available_to_transact    INTEGER NOT NULL DEFAULT 0,
  market_value_usd_cents          INTEGER NOT NULL DEFAULT 0,
  holding_period_active           INTEGER NOT NULL DEFAULT 0 CHECK (holding_period_active IN (0, 1)),
  updated_at                      TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_uber_equity_user_type
  ON uber_equity (user_id, type);

-- ── Uber RSU Grants ───────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS uber_rsu_grants (
  grant_id                    TEXT    PRIMARY KEY,
  user_id                     TEXT    NOT NULL REFERENCES users(id),
  total_rsus                  INTEGER NOT NULL,
  vesting_commencement_date   TEXT    NOT NULL,  -- ISO 8601
  vesting_formula             TEXT    NOT NULL,
  date_of_grant               TEXT    NOT NULL,  -- ISO 8601
  source_document_url         TEXT,
  status                      TEXT    NOT NULL DEFAULT 'active'
                              CHECK (status IN ('active', 'fully_vested', 'forfeited'))
);

-- ── Pending Transfers ─────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS pending_transfers (
  id                  TEXT    PRIMARY KEY,
  user_id             TEXT    NOT NULL REFERENCES users(id),
  source              TEXT    NOT NULL,
  destination         TEXT    NOT NULL,
  amount_usd_cents    INTEGER,
  amount_eur_cents    INTEGER,
  fx_rate             REAL,
  status              TEXT    NOT NULL DEFAULT 'pending'
                      CHECK (status IN ('pending', 'completed')),
  date_initiated      TEXT    NOT NULL,  -- ISO 8601
  date_completed      TEXT               -- ISO 8601
);

-- ── Cash Balances ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS cash_balances (
  id              TEXT    PRIMARY KEY,
  user_id         TEXT    NOT NULL REFERENCES users(id),
  amount_cents    INTEGER NOT NULL DEFAULT 0,  -- EUR cents
  date_updated    TEXT    NOT NULL,            -- ISO 8601
  notes           TEXT
);

-- ── Transaction History ───────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS transaction_history (
  id              TEXT    PRIMARY KEY,
  user_id         TEXT    NOT NULL REFERENCES users(id),
  date            TEXT    NOT NULL,  -- ISO 8601
  action          TEXT    NOT NULL CHECK (action IN ('buy', 'sell')),
  asset           TEXT    NOT NULL,
  quantity        INTEGER NOT NULL,
  price_cents     INTEGER NOT NULL,  -- EUR cents per share
  fee_cents       INTEGER NOT NULL DEFAULT 0,
  exchange        TEXT    NOT NULL DEFAULT ''
);

CREATE INDEX IF NOT EXISTS idx_transaction_history_user_date
  ON transaction_history (user_id, date DESC);

-- ── Advice Log ────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS advice_log (
  id                      TEXT    PRIMARY KEY,
  user_id                 TEXT    NOT NULL REFERENCES users(id),
  date                    TEXT    NOT NULL,  -- ISO 8601
  type                    TEXT    NOT NULL CHECK (type IN ('RSU', 'rebalance', 'strategy', 'DCA')),
  recommendation_text     TEXT    NOT NULL,
  was_followed            INTEGER          CHECK (was_followed IN (0, 1, NULL))
);

CREATE INDEX IF NOT EXISTS idx_advice_log_user_date
  ON advice_log (user_id, date DESC);

-- ── Notifications ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS notifications (
  id              TEXT    PRIMARY KEY,
  user_id         TEXT    NOT NULL REFERENCES users(id),
  type            TEXT    NOT NULL CHECK (type IN ('rsu_vesting', 'rebalance_due', 'transfer_reminder', 'monthly_review')),
  scheduled_date  TEXT    NOT NULL,  -- ISO 8601
  sent            INTEGER NOT NULL DEFAULT 0 CHECK (sent IN (0, 1)),
  message         TEXT    NOT NULL
);

-- ── DeGiro ETF List ───────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS degiro_etf_list (
  isin                TEXT    PRIMARY KEY,
  name                TEXT    NOT NULL,
  exchange            TEXT    NOT NULL DEFAULT '',
  is_core_selection   INTEGER NOT NULL DEFAULT 0 CHECK (is_core_selection IN (0, 1)),
  typical_spread_bps  INTEGER,   -- basis points
  avg_daily_volume    INTEGER    -- shares
);

-- ── DeGiro Monthly Trade Tracker ──────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS degiro_monthly_trade_tracker (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id     TEXT    NOT NULL REFERENCES users(id),
  isin        TEXT    NOT NULL,
  month       TEXT    NOT NULL,  -- YYYY-MM
  UNIQUE (user_id, isin, month)
);

CREATE TABLE IF NOT EXISTS degiro_monthly_trade_transactions (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  tracker_id      INTEGER NOT NULL REFERENCES degiro_monthly_trade_tracker(id) ON DELETE CASCADE,
  direction       TEXT    NOT NULL CHECK (direction IN ('buy', 'sell')),
  amount_cents    INTEGER NOT NULL,  -- EUR cents
  was_free        INTEGER NOT NULL DEFAULT 0 CHECK (was_free IN (0, 1))
);

-- Record this migration
INSERT OR IGNORE INTO migrations (name) VALUES ('0001_initial');
