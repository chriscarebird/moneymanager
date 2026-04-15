-- InvestPilot Migration 0004
-- Adds isin column to transaction_history for P&L tracking by ISIN.
-- SQLite ADD COLUMN is safe — no table recreation needed.

ALTER TABLE transaction_history ADD COLUMN isin TEXT NOT NULL DEFAULT '';

-- Record this migration
INSERT OR IGNORE INTO migrations (name) VALUES ('0004_add_isin_to_transactions');
