-- RSU vesting event rows, auto-generated from each grant's formula.
-- These are purely forward-looking; they never affect historical snapshots.
-- The user can adjust income_tax_rate per event and mark events as vested
-- with actual price and shares received.

CREATE TABLE IF NOT EXISTS rsu_vesting_events (
  id                    TEXT    NOT NULL PRIMARY KEY,
  user_id               TEXT    NOT NULL REFERENCES users(id),
  grant_id              TEXT    NOT NULL REFERENCES uber_rsu_grants(grant_id),
  vesting_date          TEXT    NOT NULL,   -- ISO 8601 (YYYY-MM-DD)
  shares_vesting        INTEGER NOT NULL,

  -- User-editable predicted tax rate (default: Dutch income tax top rate 49.5%)
  income_tax_rate       REAL    NOT NULL DEFAULT 0.495,

  -- Filled in retrospectively when marking an event as vested
  price_usd_cents       INTEGER,            -- Uber share price at vest date
  actual_shares_received INTEGER,           -- net shares after MS tax withholding

  status TEXT NOT NULL DEFAULT 'upcoming'
    CHECK (status IN ('upcoming', 'vested', 'cancelled')),
  notes  TEXT,

  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);

CREATE INDEX IF NOT EXISTS idx_vesting_events_user_date
  ON rsu_vesting_events (user_id, vesting_date);

CREATE INDEX IF NOT EXISTS idx_vesting_events_grant
  ON rsu_vesting_events (grant_id);

CREATE UNIQUE INDEX IF NOT EXISTS idx_vesting_events_grant_date
  ON rsu_vesting_events (grant_id, vesting_date);
