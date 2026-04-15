-- InvestPilot Migration 0003
-- Adds trading_window_reminder to the notifications type constraint.
-- SQLite requires table recreation to change a CHECK constraint.

ALTER TABLE notifications RENAME TO notifications_v2;

CREATE TABLE IF NOT EXISTS notifications (
  id              TEXT    PRIMARY KEY,
  user_id         TEXT    NOT NULL REFERENCES users(id),
  type            TEXT    NOT NULL CHECK (type IN (
                    'rsu_vesting',
                    'rebalance_due',
                    'transfer_reminder',
                    'monthly_review',
                    'trading_window_open',
                    'trading_window_reminder',
                    'trading_window_missing',
                    'market_dip',
                    'monthly_investment',
                    'transfer_followup',
                    'transfer_arrived',
                    'dca_scheduled',
                    'portfolio_drift',
                    'quarterly_review'
                  )),
  scheduled_date  TEXT    NOT NULL,
  sent            INTEGER NOT NULL DEFAULT 0 CHECK (sent IN (0, 1)),
  message         TEXT    NOT NULL
);

INSERT INTO notifications SELECT * FROM notifications_v2;
DROP TABLE notifications_v2;

-- Record this migration
INSERT OR IGNORE INTO migrations (name) VALUES ('0003_add_notification_types');
