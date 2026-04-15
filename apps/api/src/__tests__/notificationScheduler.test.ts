/**
 * Phase 2C — Notification Scheduler integration tests.
 *
 * Uses an in-memory SQLite database (no Turso required).
 * Mocks pushSender so no real Web Push calls are made.
 *
 * Covers:
 *   1. T-7 reminder fires when window opens in 0–7 days
 *   2. Window-open alert fires + push sent when window is open today
 *   3. Missing-window fallback when no window configured
 *   4. Monthly reminder fires on 1st of month (not on other days)
 *   5. Portfolio drift > 5% → notification scheduled
 *   6. Portfolio drift < 5% → notification skipped
 *   7. Suppression prevents duplicate alerts
 */

import { createClient, type Client } from '@libsql/client';
import { vi, describe, it, expect, beforeAll, afterEach } from 'vitest';
import { randomUUID } from 'crypto';

// ── Mocks (hoisted before imports) ──────────────────────────────────────────

// Replace the real DB singleton with our in-memory client
let testDb: Client;
vi.mock('../db.js', () => ({ getDbClient: () => testDb }));

// vi.hoisted ensures this runs at hoist time so it's available inside vi.mock factories
const { mockSendPush } = vi.hoisted(() => ({
  mockSendPush: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../services/pushSender.js', () => ({
  ensureVapidConfigured: vi.fn().mockReturnValue(true),
  sendPushToUser: mockSendPush,
  broadcastPush: vi.fn().mockResolvedValue(undefined),
}));

// Import scheduler AFTER mocks are registered
import { runSchedulerForUser } from '../services/notificationScheduler.js';
import {
  getPendingNotifications,
  upsertAlertSuppression,
  insertSnapshot,
  upsertTargetAllocation,
  upsertTradingWindow,
} from '@investpilot/db';

// ── Minimal schema (no CHECK constraints on notification type for test flexibility) ──

const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  settings_json TEXT NOT NULL DEFAULT '{}'
);
INSERT OR IGNORE INTO users (id, name) VALUES ('user1', 'user1'), ('user2', 'user2');

CREATE TABLE IF NOT EXISTS portfolio_snapshots (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  date TEXT NOT NULL,
  source TEXT NOT NULL DEFAULT 'manual',
  raw_image_url TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);

CREATE TABLE IF NOT EXISTS holdings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  snapshot_id TEXT NOT NULL,
  asset_type TEXT NOT NULL DEFAULT 'ETF',
  name TEXT NOT NULL,
  isin TEXT NOT NULL,
  quantity INTEGER NOT NULL,
  price_cents INTEGER NOT NULL,
  value_cents INTEGER NOT NULL,
  exchange TEXT NOT NULL DEFAULT 'XETRA'
);

CREATE TABLE IF NOT EXISTS target_allocations (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  asset_class TEXT NOT NULL DEFAULT 'Equity',
  etf_isin TEXT NOT NULL,
  etf_name TEXT NOT NULL,
  target_pct REAL NOT NULL,
  exchange TEXT NOT NULL DEFAULT 'XETRA',
  is_free_etf INTEGER NOT NULL DEFAULT 1,
  active INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS notifications (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  type TEXT NOT NULL,
  scheduled_date TEXT NOT NULL,
  sent INTEGER NOT NULL DEFAULT 0,
  message TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS alert_suppressions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  alert_type TEXT NOT NULL,
  suppressed_until TEXT NOT NULL,
  reason TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
  UNIQUE (user_id, alert_type)
);

CREATE TABLE IF NOT EXISTS trading_windows (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  quarter TEXT NOT NULL,
  open_date TEXT NOT NULL,
  close_date TEXT,
  state TEXT NOT NULL DEFAULT 'scheduled',
  advice_json TEXT,
  shares_sold INTEGER,
  proceeds_usd_cents INTEGER,
  transfer_id TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
  UNIQUE (user_id, quarter)
);

CREATE TABLE IF NOT EXISTS pending_transfers (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  source TEXT NOT NULL,
  destination TEXT NOT NULL,
  amount_usd_cents INTEGER,
  amount_eur_cents INTEGER,
  fx_rate REAL,
  status TEXT NOT NULL DEFAULT 'pending',
  date_initiated TEXT NOT NULL,
  date_completed TEXT
);

CREATE TABLE IF NOT EXISTS uber_rsu_grants (
  grant_id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  total_rsus INTEGER NOT NULL,
  vesting_commencement_date TEXT NOT NULL,
  vesting_formula TEXT NOT NULL,
  date_of_grant TEXT NOT NULL,
  source_document_url TEXT,
  status TEXT NOT NULL DEFAULT 'active'
);

CREATE TABLE IF NOT EXISTS advice_log (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  date TEXT NOT NULL,
  type TEXT NOT NULL,
  recommendation_text TEXT NOT NULL,
  was_followed INTEGER,
  stale INTEGER NOT NULL DEFAULT 0,
  prices_json TEXT
);

CREATE TABLE IF NOT EXISTS cash_balances (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  amount_cents INTEGER NOT NULL DEFAULT 0,
  date_updated TEXT NOT NULL,
  notes TEXT
);

CREATE TABLE IF NOT EXISTS degiro_monthly_trade_tracker (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL,
  isin TEXT NOT NULL,
  month TEXT NOT NULL,
  UNIQUE (user_id, isin, month)
);

CREATE TABLE IF NOT EXISTS degiro_monthly_trade_transactions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tracker_id INTEGER NOT NULL,
  direction TEXT NOT NULL,
  amount_cents INTEGER NOT NULL,
  was_free INTEGER NOT NULL DEFAULT 0
);
`;

const USER = 'user1';

// ── Setup ─────────────────────────────────────────────────────────────────────

beforeAll(async () => {
  testDb = createClient({ url: ':memory:' });

  // Execute each statement separately (libsql doesn't support multi-statement execute)
  const stmts = SCHEMA_SQL
    .split(';')
    .map((s) => s.trim())
    .filter((s) => s.length > 0 && !s.startsWith('--'));

  for (const stmt of stmts) {
    await testDb.execute(stmt);
  }
});

afterEach(async () => {
  // Clear mutable tables between tests to keep them independent
  await testDb.execute('DELETE FROM notifications');
  await testDb.execute('DELETE FROM alert_suppressions');
  await testDb.execute('DELETE FROM trading_windows');
  await testDb.execute('DELETE FROM portfolio_snapshots');
  await testDb.execute('DELETE FROM holdings');
  await testDb.execute('DELETE FROM target_allocations');
  await testDb.execute('DELETE FROM pending_transfers');
  await testDb.execute('DELETE FROM uber_rsu_grants');
  await testDb.execute('DELETE FROM advice_log');
  mockSendPush.mockClear();
});

// ── Helpers ───────────────────────────────────────────────────────────────────

async function getNotificationsOfType(type: string) {
  const all = await getPendingNotifications(testDb, USER);
  return all.filter((n) => n.type === type);
}

/** Insert a trading window with given open date (ISO string) and state. */
async function seedTradingWindow(openDate: string, state = 'scheduled') {
  await upsertTradingWindow(testDb, USER, { quarter: '2026-Q2', openDate });
  if (state !== 'scheduled') {
    await testDb.execute({
      sql: 'UPDATE trading_windows SET state = ? WHERE user_id = ? AND quarter = ?',
      args: [state, USER, '2026-Q2'],
    });
  }
}

/** Insert a portfolio snapshot with two holdings at given percentages (total = €10,000). */
async function seedPortfolio(vwrlPct: number, vusaPct: number) {
  const total = 1_000_000; // €10,000 in cents
  const snap = {
    id: randomUUID(),
    date: new Date().toISOString(),
    source: 'manual' as const,
    rawImageUrl: null,
    holdings: [
      {
        snapshotId: 'snap',
        assetType: 'ETF' as const,
        name: 'VWRL',
        isin: 'IE00B3RBWM25',
        quantity: 1,
        priceCents: Math.round((vwrlPct / 100) * total),
        valueCents: Math.round((vwrlPct / 100) * total),
        exchange: 'XETRA',
      },
      {
        snapshotId: 'snap',
        assetType: 'ETF' as const,
        name: 'VUSA',
        isin: 'IE00B3XXRP09',
        quantity: 1,
        priceCents: Math.round((vusaPct / 100) * total),
        valueCents: Math.round((vusaPct / 100) * total),
        exchange: 'XETRA',
      },
    ],
  };
  // Fix snapshotId in holdings
  snap.holdings.forEach((h) => { h.snapshotId = snap.id; });
  await insertSnapshot(testDb, snap, USER);

  // Targets: VWRL 60%, VUSA 40%
  await upsertTargetAllocation(testDb, USER, {
    assetClass: 'Global Equity',
    etfIsin: 'IE00B3RBWM25',
    etfName: 'VWRL',
    targetPct: 60,
    exchange: 'XETRA',
    isFreeEtf: true,
    active: true,
  });
  await upsertTargetAllocation(testDb, USER, {
    assetClass: 'US Equity',
    etfIsin: 'IE00B3XXRP09',
    etfName: 'VUSA',
    targetPct: 40,
    exchange: 'XETRA',
    isFreeEtf: true,
    active: true,
  });
}

// ── 1. T-7 trading window reminder ───────────────────────────────────────────

describe('T-7 trading window reminder', () => {
  it('schedules trading_window_reminder when window opens in 3 days', async () => {
    const now = new Date('2026-04-15T10:00:00Z');
    const openIn3 = new Date(now.getTime() + 3 * 86_400_000).toISOString().slice(0, 10);
    await seedTradingWindow(openIn3);

    const result = await runSchedulerForUser(USER, now);

    expect(result.scheduled).toContain('trading_window_reminder');
    const notifs = await getNotificationsOfType('trading_window_reminder');
    expect(notifs).toHaveLength(1);
    expect(notifs[0]?.message).toMatch(/3 day/);
  });

  it('schedules reminder when window opens in exactly 7 days (boundary)', async () => {
    const now = new Date('2026-04-15T10:00:00Z');
    const openIn7 = new Date(now.getTime() + 7 * 86_400_000).toISOString().slice(0, 10);
    await seedTradingWindow(openIn7);

    const result = await runSchedulerForUser(USER, now);

    expect(result.scheduled).toContain('trading_window_reminder');
  });

  it('does NOT schedule reminder when window opens in 8 days (outside window)', async () => {
    const now = new Date('2026-04-15T10:00:00Z');
    const openIn8 = new Date(now.getTime() + 8 * 86_400_000).toISOString().slice(0, 10);
    await seedTradingWindow(openIn8);

    const result = await runSchedulerForUser(USER, now);

    expect(result.scheduled).not.toContain('trading_window_reminder');
    const notifs = await getNotificationsOfType('trading_window_reminder');
    expect(notifs).toHaveLength(0);
  });

  it('reminder is suppressed after first fire (idempotent)', async () => {
    const now = new Date('2026-04-15T10:00:00Z');
    const openIn3 = new Date(now.getTime() + 3 * 86_400_000).toISOString().slice(0, 10);
    await seedTradingWindow(openIn3);

    // First run schedules
    await runSchedulerForUser(USER, now);
    // Second run skips (suppressed)
    const result2 = await runSchedulerForUser(USER, now);

    expect(result2.scheduled).not.toContain('trading_window_reminder');
    // Still only 1 notification in DB (INSERT OR IGNORE deduplication)
    const notifs = await getNotificationsOfType('trading_window_reminder');
    expect(notifs).toHaveLength(1);
  });

  it('notification scheduled_date is at 08:00 UTC (= 09:00 CET)', async () => {
    const now = new Date('2026-04-15T10:00:00Z');
    const openIn3 = new Date(now.getTime() + 3 * 86_400_000).toISOString().slice(0, 10);
    await seedTradingWindow(openIn3);

    await runSchedulerForUser(USER, now);

    const notifs = await getNotificationsOfType('trading_window_reminder');
    const scheduledHour = new Date(notifs[0]!.scheduledDate).getUTCHours();
    expect(scheduledHour).toBe(8); // 09:00 CET = 08:00 UTC
  });
});

// ── 2. Window-open alert ──────────────────────────────────────────────────────

describe('Window-open alert', () => {
  it('fires push and schedules notification when window opened yesterday', async () => {
    const now = new Date('2026-04-15T10:00:00Z');
    const yesterday = new Date(now.getTime() - 86_400_000).toISOString().slice(0, 10);
    await seedTradingWindow(yesterday, 'scheduled'); // still in 'scheduled' state

    const result = await runSchedulerForUser(USER, now);

    expect(result.pushed).toContain('trading_window_open');
    expect(mockSendPush).toHaveBeenCalledOnce();
    expect(mockSendPush).toHaveBeenCalledWith(
      USER,
      expect.objectContaining({
        title: expect.stringContaining('Trading Window'),
        url: '/?tab=advisor',
      }),
    );
  });

  it('does NOT fire for already-open (non-scheduled) window', async () => {
    const now = new Date('2026-04-15T10:00:00Z');
    const yesterday = new Date(now.getTime() - 86_400_000).toISOString().slice(0, 10);
    await seedTradingWindow(yesterday, 'open'); // already advanced past 'scheduled'

    const result = await runSchedulerForUser(USER, now);

    expect(result.pushed).not.toContain('trading_window_open');
    expect(mockSendPush).not.toHaveBeenCalled();
  });
});

// ── 3. Missing-window fallback ────────────────────────────────────────────────

describe('Missing-window fallback', () => {
  it('schedules trading_window_missing when no window configured', async () => {
    const now = new Date('2026-04-15T10:00:00Z');

    const result = await runSchedulerForUser(USER, now);

    expect(result.scheduled).toContain('trading_window_missing');
    const notifs = await getNotificationsOfType('trading_window_missing');
    expect(notifs).toHaveLength(1);
    expect(notifs[0]?.message).toContain('trading window');
  });
});

// ── 4. Monthly reminder ───────────────────────────────────────────────────────

describe('Monthly investment reminder', () => {
  it('fires on the 1st of the month', async () => {
    // April 1st 2026 at 10:00 UTC
    const firstOfMonth = new Date('2026-04-01T10:00:00Z');

    const result = await runSchedulerForUser(USER, firstOfMonth);

    expect(result.pushed).toContain('monthly_investment');
    expect(mockSendPush).toHaveBeenCalledWith(
      USER,
      expect.objectContaining({ url: expect.stringContaining('dca') }),
    );
  });

  it('is skipped on any other day of the month', async () => {
    const midMonth = new Date('2026-04-15T10:00:00Z');

    const result = await runSchedulerForUser(USER, midMonth);

    expect(result.skipped).toContain('monthly_investment');
    expect(result.pushed).not.toContain('monthly_investment');
  });

  it('is skipped when trading_window_open was recently suppressed', async () => {
    const firstOfMonth = new Date('2026-04-01T10:00:00Z');
    // Simulate that the trading window alert fired within the last 7 days
    await upsertAlertSuppression(
      testDb,
      USER,
      'trading_window_open',
      Date.now() + 30 * 86_400_000, // still active
      'window opened',
    );

    const result = await runSchedulerForUser(USER, firstOfMonth);

    expect(result.pushed).not.toContain('monthly_investment');
  });
});

// ── 5. Portfolio drift > 5% ───────────────────────────────────────────────────

describe('Portfolio drift detection', () => {
  it('schedules portfolio_drift when drift is 10% (well above threshold)', async () => {
    const now = new Date('2026-04-15T10:00:00Z');
    // VWRL at 50% (target 60%) and VUSA at 50% (target 40%) → 10% drift
    await seedPortfolio(50, 50);

    const result = await runSchedulerForUser(USER, now);

    expect(result.scheduled).toContain('portfolio_drift');
    const notifs = await getNotificationsOfType('portfolio_drift');
    expect(notifs).toHaveLength(1);
    expect(notifs[0]?.message).toMatch(/10\.0%/);
  });

  it('schedules portfolio_drift at exactly 5% drift (>= threshold)', async () => {
    const now = new Date('2026-04-15T10:00:00Z');
    // VWRL at 55% (target 60%) → drift = 5.0%
    await seedPortfolio(55, 45);

    const result = await runSchedulerForUser(USER, now);

    expect(result.scheduled).toContain('portfolio_drift');
  });

  it('skips portfolio_drift when drift is below 5%', async () => {
    const now = new Date('2026-04-15T10:00:00Z');
    // VWRL at 58% (target 60%) → drift = 2%
    await seedPortfolio(58, 42);

    const result = await runSchedulerForUser(USER, now);

    expect(result.skipped.some((s) => s.includes('portfolio_drift'))).toBe(true);
    const notifs = await getNotificationsOfType('portfolio_drift');
    expect(notifs).toHaveLength(0);
  });

  it('skips portfolio_drift when suppressed (14-day cooldown)', async () => {
    const now = new Date('2026-04-15T10:00:00Z');
    await seedPortfolio(50, 50); // 10% drift
    await upsertAlertSuppression(
      testDb,
      USER,
      'portfolio_drift',
      Date.now() + 14 * 86_400_000,
      'drift 10.0%',
    );

    const result = await runSchedulerForUser(USER, now);

    expect(result.skipped).toContain('portfolio_drift');
    const notifs = await getNotificationsOfType('portfolio_drift');
    expect(notifs).toHaveLength(0);
  });

  it('skips when no portfolio snapshot exists', async () => {
    const now = new Date('2026-04-15T10:00:00Z');
    // No snapshot seeded

    const result = await runSchedulerForUser(USER, now);

    expect(result.skipped.some((s) => s.includes('portfolio_drift'))).toBe(true);
  });

  it('drift notification contains correct percentage in message', async () => {
    const now = new Date('2026-04-15T10:00:00Z');
    await seedPortfolio(50, 50); // 10% drift

    await runSchedulerForUser(USER, now);

    const notifs = await getNotificationsOfType('portfolio_drift');
    expect(notifs[0]?.message).toContain('10.0%');
    expect(notifs[0]?.message).toContain('rebalancing');
  });
});

// ── 6. Scheduler is idempotent ────────────────────────────────────────────────

describe('Scheduler idempotency', () => {
  it('running scheduler twice does not duplicate notifications', async () => {
    const now = new Date('2026-04-15T10:00:00Z');
    await seedPortfolio(50, 50); // 10% drift

    await runSchedulerForUser(USER, now);
    await runSchedulerForUser(USER, now);

    // INSERT OR IGNORE means no duplicates even if called twice
    const notifs = await getNotificationsOfType('portfolio_drift');
    expect(notifs.length).toBeLessThanOrEqual(1);
  });
});
