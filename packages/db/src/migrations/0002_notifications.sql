-- InvestPilot Migration 0002
-- Expands notification types, adds push subscriptions, trading windows, alert suppressions.

-- ── Recreate notifications with expanded type list ────────────────────────────
-- SQLite does not support ALTER TABLE ... MODIFY CONSTRAINT.
-- Strategy: rename old table, create new one, copy data, drop old.

ALTER TABLE notifications RENAME TO notifications_old;

CREATE TABLE IF NOT EXISTS notifications (
  id              TEXT    PRIMARY KEY,
  user_id         TEXT    NOT NULL REFERENCES users(id),
  type            TEXT    NOT NULL CHECK (type IN (
                    'rsu_vesting',
                    'rebalance_due',
                    'transfer_reminder',
                    'monthly_review',
                    'trading_window_open',
                    'trading_window_missing',
                    'market_dip',
                    'monthly_investment',
                    'transfer_followup',
                    'transfer_arrived',
                    'dca_scheduled',
                    'portfolio_drift',
                    'quarterly_review'
                  )),
  scheduled_date  TEXT    NOT NULL,  -- ISO 8601
  sent            INTEGER NOT NULL DEFAULT 0 CHECK (sent IN (0, 1)),
  message         TEXT    NOT NULL
);

INSERT INTO notifications SELECT * FROM notifications_old;
DROP TABLE notifications_old;

-- ── Push Subscriptions ────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS push_subscriptions (
  id          TEXT    PRIMARY KEY,
  user_id     TEXT    NOT NULL REFERENCES users(id),
  endpoint    TEXT    NOT NULL UNIQUE,
  p256dh      TEXT    NOT NULL,
  auth        TEXT    NOT NULL,
  created_at  TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);

CREATE INDEX IF NOT EXISTS idx_push_subscriptions_user
  ON push_subscriptions (user_id);

-- ── Trading Windows ───────────────────────────────────────────────────────────
-- Stores upcoming Uber trading window dates per user per quarter.

CREATE TABLE IF NOT EXISTS trading_windows (
  id              TEXT    PRIMARY KEY,
  user_id         TEXT    NOT NULL REFERENCES users(id),
  quarter         TEXT    NOT NULL,  -- e.g. "2026-Q1"
  open_date       TEXT    NOT NULL,  -- ISO 8601 date
  close_date      TEXT,              -- ISO 8601 date (optional)
  state           TEXT    NOT NULL DEFAULT 'scheduled'
                  CHECK (state IN (
                    'scheduled',
                    'open',
                    'advice_ready',
                    'sold',
                    'transfer_pending',
                    'transfer_arrived',
                    'complete'
                  )),
  advice_json     TEXT,              -- serialised AdviceResponse
  shares_sold     INTEGER,
  proceeds_usd_cents  INTEGER,
  transfer_id     TEXT    REFERENCES pending_transfers(id),
  created_at      TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
  updated_at      TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
  UNIQUE (user_id, quarter)
);

-- ── Alert Suppressions ────────────────────────────────────────────────────────
-- Prevents the same alert type firing more than once within a cooldown window.

CREATE TABLE IF NOT EXISTS alert_suppressions (
  id                TEXT    PRIMARY KEY,
  user_id           TEXT    NOT NULL REFERENCES users(id),
  alert_type        TEXT    NOT NULL,
  suppressed_until  TEXT    NOT NULL,  -- ISO 8601
  reason            TEXT,
  created_at        TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
  UNIQUE (user_id, alert_type)
);

-- ── Advice Log expansion (add stale flag) ────────────────────────────────────
-- Add a stale flag and prices_json to advice_log for ALERTS.md requirement.
-- (SQLite doesn't support ADD COLUMN with CHECK, but plain ADD COLUMN is fine.)

ALTER TABLE advice_log ADD COLUMN stale INTEGER NOT NULL DEFAULT 0;
ALTER TABLE advice_log ADD COLUMN prices_json TEXT;

-- Record this migration
INSERT OR IGNORE INTO migrations (name) VALUES ('0002_notifications');
