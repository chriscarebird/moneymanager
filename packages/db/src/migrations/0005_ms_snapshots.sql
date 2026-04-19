-- Morgan Stanley equity snapshot history
-- Each MS upload creates an immutable snapshot (mirroring the DeGiro pattern).
-- uber_equity still holds the "current" view used by the dashboard.

CREATE TABLE IF NOT EXISTS ms_equity_snapshots (
  id            TEXT NOT NULL PRIMARY KEY,
  user_id       TEXT NOT NULL REFERENCES users(id),
  snapshot_date TEXT NOT NULL,  -- ISO 8601 date of the screenshot
  created_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);

CREATE INDEX IF NOT EXISTS idx_ms_snapshots_user
  ON ms_equity_snapshots (user_id, snapshot_date DESC);

CREATE TABLE IF NOT EXISTS ms_equity_snapshot_items (
  id                            TEXT    NOT NULL PRIMARY KEY,
  snapshot_id                   TEXT    NOT NULL REFERENCES ms_equity_snapshots(id),
  type                          TEXT    NOT NULL CHECK (type IN ('RSU', 'ESPP', 'Direct_Shares')),
  shares_held                   INTEGER NOT NULL DEFAULT 0,
  shares_available_to_transact  INTEGER NOT NULL DEFAULT 0,
  market_value_usd_cents        INTEGER NOT NULL DEFAULT 0,
  holding_period_active         INTEGER NOT NULL DEFAULT 0
    CHECK (holding_period_active IN (0, 1))
);

CREATE INDEX IF NOT EXISTS idx_ms_snapshot_items_snapshot
  ON ms_equity_snapshot_items (snapshot_id);
