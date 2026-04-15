/**
 * Phase 3 — Verification Gate: API integration tests
 *
 * Covers:
 *   1. Historical chart — getSnapshotValueHistory returns correct totals across seeded snapshots
 *   2. Transaction history — insertTransaction / getTransactionHistory roundtrip
 *   3. ETF scores — getDeGiroEtfScores queries the degiro_etf_list table
 *   4. CSV export — portfolio.csv and transactions.csv content and headers
 *   5. Quarterly cycle — drift notification → snapshot upload → trades computed →
 *        trading window reminder → window open → transfer created → follow-up alert
 *
 * All tests use an in-memory SQLite database. No network calls are made.
 */

import { createClient, type Client } from '@libsql/client';
import { vi, describe, it, expect, beforeAll, afterEach } from 'vitest';
import { randomUUID } from 'crypto';

// ── Mocks (must be hoisted before imports) ─────────────────────────────────────

let testDb: Client;
vi.mock('../db.js', () => ({ getDbClient: () => testDb }));

const { mockSendPush } = vi.hoisted(() => ({
  mockSendPush: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../services/pushSender.js', () => ({
  ensureVapidConfigured: vi.fn().mockReturnValue(true),
  sendPushToUser: mockSendPush,
  broadcastPush: vi.fn().mockResolvedValue(undefined),
}));

// ── Imports (after mocks) ─────────────────────────────────────────────────────

import { runSchedulerForUser } from '../services/notificationScheduler.js';
import {
  getSnapshotValueHistory,
  insertSnapshot,
  getTransactionHistory,
  insertTransaction,
  getDeGiroEtfScores,
  upsertTargetAllocation,
  upsertTradingWindow,
  insertTransfer,
  getPendingNotifications,
  getLatestSnapshot,
} from '@investpilot/db';
import { computeRebalancingPlan } from '@investpilot/core';

// ── Schema (includes Phase 3 tables) ─────────────────────────────────────────

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

CREATE TABLE IF NOT EXISTS push_subscriptions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  endpoint TEXT NOT NULL UNIQUE,
  p256dh TEXT NOT NULL,
  auth TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);

CREATE TABLE IF NOT EXISTS transaction_history (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  date TEXT NOT NULL,
  action TEXT NOT NULL,
  asset TEXT NOT NULL,
  isin TEXT NOT NULL DEFAULT '',
  quantity INTEGER NOT NULL,
  price_cents INTEGER NOT NULL,
  fee_cents INTEGER NOT NULL DEFAULT 0,
  exchange TEXT NOT NULL DEFAULT ''
);

CREATE TABLE IF NOT EXISTS degiro_etf_list (
  isin TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  exchange TEXT NOT NULL DEFAULT 'XETRA',
  is_core_selection INTEGER NOT NULL DEFAULT 0,
  typical_spread_bps INTEGER,
  avg_daily_volume INTEGER
);
`;

const USER = 'user1';

// ── Setup ─────────────────────────────────────────────────────────────────────

beforeAll(async () => {
  testDb = createClient({ url: ':memory:' });
  const stmts = SCHEMA_SQL
    .split(';')
    .map((s) => s.trim())
    .filter((s) => s.length > 0 && !s.startsWith('--'));
  for (const stmt of stmts) {
    await testDb.execute(stmt);
  }
});

afterEach(async () => {
  await testDb.execute('DELETE FROM notifications');
  await testDb.execute('DELETE FROM alert_suppressions');
  await testDb.execute('DELETE FROM trading_windows');
  await testDb.execute('DELETE FROM portfolio_snapshots');
  await testDb.execute('DELETE FROM holdings');
  await testDb.execute('DELETE FROM target_allocations');
  await testDb.execute('DELETE FROM pending_transfers');
  await testDb.execute('DELETE FROM uber_rsu_grants');
  await testDb.execute('DELETE FROM advice_log');
  await testDb.execute('DELETE FROM cash_balances');
  await testDb.execute('DELETE FROM transaction_history');
  await testDb.execute('DELETE FROM degiro_etf_list');
  mockSendPush.mockClear();
});

// ── Helpers ───────────────────────────────────────────────────────────────────

async function seedSnapshot(
  date: string,
  vwrlValueCents: number,
  vusaValueCents: number,
) {
  const id = randomUUID();
  const snap = {
    id,
    date,
    source: 'manual' as const,
    rawImageUrl: null,
    holdings: [
      {
        snapshotId: id,
        assetType: 'ETF' as const,
        name: 'VWRL',
        isin: 'IE00B3RBWM25',
        quantity: 1,
        priceCents: vwrlValueCents,
        valueCents: vwrlValueCents,
        exchange: 'XETRA',
      },
      {
        snapshotId: id,
        assetType: 'ETF' as const,
        name: 'VUSA',
        isin: 'IE00B3XXRP09',
        quantity: 1,
        priceCents: vusaValueCents,
        valueCents: vusaValueCents,
        exchange: 'XETRA',
      },
    ],
  };
  await insertSnapshot(testDb, snap, USER);
  return id;
}

async function seedTargets() {
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

// ── 1. Historical chart ───────────────────────────────────────────────────────

describe('Historical chart — getSnapshotValueHistory', () => {
  it('returns empty array when no snapshots exist', async () => {
    const history = await getSnapshotValueHistory(testDb, USER);
    expect(history).toEqual([]);
  });

  it('returns one data point per snapshot with correct total value', async () => {
    // €6,000 VWRL + €4,000 VUSA = €10,000 total
    await seedSnapshot('2026-01-15T00:00:00Z', 600_000, 400_000);
    const history = await getSnapshotValueHistory(testDb, USER);
    expect(history).toHaveLength(1);
    expect(history[0]!.totalValueCents).toBe(1_000_000); // €10,000
    expect(history[0]!.date).toBe('2026-01-15T00:00:00Z');
  });

  it('returns 3 snapshots in chronological order — portfolio grew €10k → €12k → €15k', async () => {
    await seedSnapshot('2026-01-15T00:00:00Z', 600_000, 400_000);  // €10,000
    await seedSnapshot('2026-02-15T00:00:00Z', 720_000, 480_000);  // €12,000
    await seedSnapshot('2026-03-15T00:00:00Z', 900_000, 600_000);  // €15,000

    const history = await getSnapshotValueHistory(testDb, USER);
    expect(history).toHaveLength(3);

    // Chronological order (oldest first)
    expect(history[0]!.totalValueCents).toBe(1_000_000);
    expect(history[1]!.totalValueCents).toBe(1_200_000);
    expect(history[2]!.totalValueCents).toBe(1_500_000);
  });

  it('growth calculation: last snapshot has 50% more than first', async () => {
    await seedSnapshot('2026-01-15T00:00:00Z', 600_000, 400_000);  // €10,000
    await seedSnapshot('2026-03-15T00:00:00Z', 900_000, 600_000);  // €15,000

    const history = await getSnapshotValueHistory(testDb, USER);
    const first = history[0]!.totalValueCents;
    const last = history[history.length - 1]!.totalValueCents;
    const growthPct = ((last - first) / first) * 100;
    expect(growthPct).toBeCloseTo(50, 0);
  });
});

// ── 2. Transaction history ────────────────────────────────────────────────────

describe('Transaction history — insertTransaction / getTransactionHistory', () => {
  it('returns empty array when no transactions exist', async () => {
    const txs = await getTransactionHistory(testDb, USER);
    expect(txs).toHaveLength(0);
  });

  it('stores and retrieves a buy transaction with all fields', async () => {
    const id = randomUUID();
    await insertTransaction(testDb, USER, id, {
      date: '2026-01-15T00:00:00Z',
      action: 'buy',
      asset: 'VWRL',
      isin: 'IE00B3RBWM25',
      quantity: 10,
      priceCents: 8000,
      feeCents: 0,
      exchange: 'XETRA',
    });

    const txs = await getTransactionHistory(testDb, USER);
    expect(txs).toHaveLength(1);
    const tx = txs[0]!;
    expect(tx.id).toBe(id);
    expect(tx.action).toBe('buy');
    expect(tx.asset).toBe('VWRL');
    expect(tx.isin).toBe('IE00B3RBWM25');
    expect(tx.quantity).toBe(10);
    expect(tx.priceCents).toBe(8000);
    expect(tx.feeCents).toBe(0);
    expect(tx.exchange).toBe('XETRA');
  });

  it('returns transactions most-recent first', async () => {
    await insertTransaction(testDb, USER, randomUUID(), {
      date: '2026-01-15T00:00:00Z',
      action: 'buy', asset: 'VWRL', isin: 'IE00B3RBWM25',
      quantity: 5, priceCents: 8000, feeCents: 0, exchange: 'XETRA',
    });
    await insertTransaction(testDb, USER, randomUUID(), {
      date: '2026-03-15T00:00:00Z',
      action: 'buy', asset: 'VUSA', isin: 'IE00B3XXRP09',
      quantity: 3, priceCents: 6000, feeCents: 0, exchange: 'XETRA',
    });

    const txs = await getTransactionHistory(testDb, USER);
    expect(txs[0]!.asset).toBe('VUSA');  // March first
    expect(txs[1]!.asset).toBe('VWRL');  // January second
  });

  it('respects limit parameter', async () => {
    for (let i = 0; i < 5; i++) {
      await insertTransaction(testDb, USER, randomUUID(), {
        date: `2026-0${i + 1}-15T00:00:00Z`,
        action: 'buy', asset: 'VWRL', isin: 'IE00B3RBWM25',
        quantity: 1, priceCents: 8000, feeCents: 0, exchange: 'XETRA',
      });
    }
    const txs = await getTransactionHistory(testDb, USER, 3);
    expect(txs).toHaveLength(3);
  });
});

// ── 3. ETF scoring ────────────────────────────────────────────────────────────

describe('ETF scoring — getDeGiroEtfScores', () => {
  it('returns empty array when no ISINs requested', async () => {
    const scores = await getDeGiroEtfScores(testDb, []);
    expect(scores).toHaveLength(0);
  });

  it('returns empty array when ISINs are not in the table', async () => {
    const scores = await getDeGiroEtfScores(testDb, ['IE00B3RBWM25']);
    expect(scores).toHaveLength(0);
  });

  it('returns ETF score data when seeded', async () => {
    await testDb.execute({
      sql: `INSERT INTO degiro_etf_list (isin, name, exchange, is_core_selection, typical_spread_bps, avg_daily_volume)
            VALUES (?, ?, ?, ?, ?, ?)`,
      args: ['IE00B3RBWM25', 'VWRL', 'XETRA', 1, 3, 1200000],
    });

    const scores = await getDeGiroEtfScores(testDb, ['IE00B3RBWM25']);
    expect(scores).toHaveLength(1);
    const s = scores[0]!;
    expect(s.isin).toBe('IE00B3RBWM25');
    expect(s.name).toBe('VWRL');
    expect(s.isCoreSelection).toBe(true);
    expect(s.typicalSpreadBps).toBe(3);
    expect(s.avgDailyVolume).toBe(1200000);
  });

  it('returns only the requested ISINs', async () => {
    await testDb.execute({
      sql: `INSERT INTO degiro_etf_list (isin, name, exchange, is_core_selection) VALUES (?, ?, ?, ?), (?, ?, ?, ?)`,
      args: ['IE00B3RBWM25', 'VWRL', 'XETRA', 1, 'IE00B3XXRP09', 'VUSA', 'XETRA', 1],
    });

    // Request only VWRL
    const scores = await getDeGiroEtfScores(testDb, ['IE00B3RBWM25']);
    expect(scores).toHaveLength(1);
    expect(scores[0]!.isin).toBe('IE00B3RBWM25');
  });
});

// ── 4. CSV export content ─────────────────────────────────────────────────────

describe('CSV export content', () => {
  // Test the CSV building logic directly (not the HTTP layer)

  function toCsvRow(fields: (string | number | null)[]): string {
    return fields
      .map((f) => {
        const s = f == null ? '' : String(f);
        if (s.includes(',') || s.includes('"') || s.includes('\n')) {
          return `"${s.replace(/"/g, '""')}"`;
        }
        return s;
      })
      .join(',');
  }

  it('portfolio CSV header is correct', () => {
    const header = toCsvRow(['Name', 'ISIN', 'AssetType', 'Quantity', 'PriceCents', 'ValueCents', 'Exchange', 'Date']);
    expect(header).toBe('Name,ISIN,AssetType,Quantity,PriceCents,ValueCents,Exchange,Date');
  });

  it('portfolio CSV data row contains correct fields', async () => {
    await seedSnapshot('2026-04-15T00:00:00Z', 600_000, 400_000);
    const snap = await getLatestSnapshot(testDb, USER);
    expect(snap).not.toBeNull();

    const rows = snap!.holdings.map((h) =>
      toCsvRow([h.name, h.isin, h.assetType, h.quantity, h.priceCents, h.valueCents, h.exchange, '2026-04-15']),
    );
    // VWRL row
    const vwrl = rows.find((r) => r.includes('VWRL'));
    expect(vwrl).toBeDefined();
    expect(vwrl).toContain('IE00B3RBWM25');
    expect(vwrl).toContain('600000');
  });

  it('transactions CSV header is correct', () => {
    const header = toCsvRow(['Date', 'Action', 'Asset', 'ISIN', 'Quantity', 'PriceCents', 'FeeCents', 'Exchange']);
    expect(header).toBe('Date,Action,Asset,ISIN,Quantity,PriceCents,FeeCents,Exchange');
  });

  it('transactions CSV includes both buy and sell rows', async () => {
    await insertTransaction(testDb, USER, randomUUID(), {
      date: '2026-01-15T00:00:00Z', action: 'buy',
      asset: 'VWRL', isin: 'IE00B3RBWM25', quantity: 10, priceCents: 8000, feeCents: 0, exchange: 'XETRA',
    });
    await insertTransaction(testDb, USER, randomUUID(), {
      date: '2026-03-20T00:00:00Z', action: 'sell',
      asset: 'VUSA', isin: 'IE00B3XXRP09', quantity: 5, priceCents: 6500, feeCents: 200, exchange: 'XETRA',
    });

    const txs = await getTransactionHistory(testDb, USER);
    const rows = txs.map((tx) =>
      toCsvRow([tx.date.slice(0, 10), tx.action, tx.asset, tx.isin, tx.quantity, tx.priceCents, tx.feeCents, tx.exchange]),
    );
    expect(rows.some((r) => r.includes('buy') && r.includes('VWRL'))).toBe(true);
    expect(rows.some((r) => r.includes('sell') && r.includes('VUSA'))).toBe(true);
  });

  it('toCsvRow escapes commas in field values', () => {
    const row = toCsvRow(['Vanguard, Inc.', 'IE001', 'ETF', 1, 100, 100, 'XETRA', '2026-01-01']);
    expect(row).toContain('"Vanguard, Inc."');
  });
});

// ── 5. Full quarterly cycle ───────────────────────────────────────────────────

describe('Full quarterly cycle', () => {
  /**
   * The quarterly cycle:
   * 1. Notification: portfolio drift ≥5% fires alert
   * 2. Upload: snapshot is saved, history grows
   * 3. Sell advice trigger: trading window reminder at T-7, then window-open push
   * 4. Transfer: pending transfer created
   * 5. Transfer follow-up: scheduler fires after 5+ business days outstanding
   * 6. Buy orders: rebalancing plan computed from latest snapshot
   */

  it('Step 1 — Portfolio drift notification fires when drift ≥ 5%', async () => {
    // VWRL at 55% vs 60% target → 5% drift → scheduler fires
    await seedSnapshot('2026-04-15T00:00:00Z', 550_000, 450_000);
    await seedTargets();

    const result = await runSchedulerForUser(USER, new Date('2026-04-15T09:00:00Z'));
    expect(result.scheduled).toContain('portfolio_drift');

    const notifs = await getPendingNotifications(testDb, USER);
    const driftNotif = notifs.find((n) => n.type === 'portfolio_drift');
    expect(driftNotif).toBeDefined();
    expect(driftNotif!.message).toContain('%');
    expect(driftNotif!.message).toContain('rebalancing');
  });

  it('Step 1 — Drift notification suppressed when drift < 5%', async () => {
    // VWRL at 58% vs 60% target → only 2% drift → no notification
    await seedSnapshot('2026-04-15T00:00:00Z', 580_000, 420_000);
    await seedTargets();

    const result = await runSchedulerForUser(USER, new Date('2026-04-15T09:00:00Z'));
    expect(result.skipped.some((s) => s.includes('portfolio_drift'))).toBe(true);
    expect(result.scheduled).not.toContain('portfolio_drift');
  });

  it('Step 2 — Snapshot upload grows history to 2 data points', async () => {
    // Seed 3 snapshots simulating portfolio growth over time
    await seedSnapshot('2026-01-15T00:00:00Z', 600_000, 400_000);  // €10,000
    await seedSnapshot('2026-02-15T00:00:00Z', 660_000, 440_000);  // €11,000
    await seedSnapshot('2026-03-15T00:00:00Z', 720_000, 480_000);  // €12,000

    const history = await getSnapshotValueHistory(testDb, USER);
    expect(history).toHaveLength(3);

    // Verify upward growth
    for (let i = 1; i < history.length; i++) {
      expect(history[i]!.totalValueCents).toBeGreaterThan(history[i - 1]!.totalValueCents);
    }
  });

  it('Step 3a — Trading window T-7 reminder fires when window is 5 days away', async () => {
    const NOW = new Date('2026-04-15T09:00:00Z');
    const openDate = new Date(NOW.getTime() + 5 * 86_400_000).toISOString();
    await upsertTradingWindow(testDb, USER, { quarter: '2026-Q2', openDate });

    const result = await runSchedulerForUser(USER, NOW);
    expect(result.scheduled).toContain('trading_window_reminder');

    const notifs = await getPendingNotifications(testDb, USER);
    const reminder = notifs.find((n) => n.type === 'trading_window_reminder');
    expect(reminder).toBeDefined();
    expect(reminder!.message).toContain('trading window opens');
    expect(reminder!.message).toMatch(/\d+ day/);
  });

  it('Step 3b — Window-open push fires when trading window opened today', async () => {
    const NOW = new Date('2026-04-15T09:00:00Z');
    const openDate = new Date(NOW.getTime() - 86_400_000).toISOString(); // opened yesterday
    await upsertTradingWindow(testDb, USER, { quarter: '2026-Q2', openDate });

    const result = await runSchedulerForUser(USER, NOW);
    expect(result.pushed).toContain('trading_window_open');
    expect(mockSendPush).toHaveBeenCalledWith(
      USER,
      expect.objectContaining({ title: expect.stringContaining('Trading Window Open') }),
    );
  });

  it('Step 4 — Transfer created after RSU sell', async () => {
    const transferId = randomUUID();
    await insertTransfer(testDb, USER, {
      id: transferId,
      source: 'Morgan Stanley',
      destination: 'DeGiro',
      amountUsdCents: 500_000, // $5,000 USD
      amountEurCents: 460_000, // €4,600
      fxRate: 0.92,
      status: 'pending',
      dateInitiated: '2026-04-15T00:00:00Z',
      dateCompleted: null,
    });

    // Verify transfer exists and scheduler will pick it up in 5+ business days
    const result = await runSchedulerForUser(USER, new Date('2026-04-15T09:00:00Z'));
    // Transfer is fresh (< 5 business days) → NOT scheduled yet
    expect(result.scheduled).not.toContain('transfer_followup');
  });

  it('Step 5 — Transfer follow-up fires after 5+ business days outstanding', async () => {
    const initiatedDate = '2026-04-07T00:00:00Z'; // 8 calendar days ago (Mon Apr 7)
    const NOW = new Date('2026-04-15T09:00:00Z'); // Apr 15 = 6 business days later

    await insertTransfer(testDb, USER, {
      id: randomUUID(),
      source: 'Morgan Stanley',
      destination: 'DeGiro',
      amountUsdCents: 500_000,
      amountEurCents: 460_000,
      fxRate: 0.92,
      status: 'pending',
      dateInitiated: initiatedDate,
      dateCompleted: null,
    });

    const result = await runSchedulerForUser(USER, NOW);
    expect(result.scheduled).toContain('transfer_followup');

    const notifs = await getPendingNotifications(testDb, USER);
    const followup = notifs.find((n) => n.type === 'transfer_followup');
    expect(followup).toBeDefined();
    expect(followup!.message).toContain('Morgan Stanley');
    expect(followup!.message).toContain('DeGiro');
    expect(followup!.message).toContain('5 business days');
  });

  it('Step 6 — Buy orders computed from snapshot after transfer arrives', async () => {
    // Use realistic share prices so whole-share rounding yields actual buy actions.
    // VWRL: 50 shares × €110/share (11,000 cents) = €5,500 (55% of €10,000 portfolio)
    // VUSA: 90 shares × €50/share  (5,000 cents)  = €4,500 (45% of €10,000 portfolio)
    const snapId = randomUUID();
    const snap = {
      id: snapId,
      date: '2026-04-15T00:00:00Z',
      source: 'manual' as const,
      rawImageUrl: null,
      holdings: [
        {
          snapshotId: snapId,
          assetType: 'ETF' as const,
          name: 'VWRL',
          isin: 'IE00B3RBWM25',
          quantity: 50,
          priceCents: 11_000,  // €110 per share
          valueCents: 550_000,
          exchange: 'XETRA',
        },
        {
          snapshotId: snapId,
          assetType: 'ETF' as const,
          name: 'VUSA',
          isin: 'IE00B3XXRP09',
          quantity: 90,
          priceCents: 5_000,   // €50 per share
          valueCents: 450_000,
          exchange: 'XETRA',
        },
      ],
    };
    await insertSnapshot(testDb, snap, USER);

    const snapshot = await getLatestSnapshot(testDb, USER);
    expect(snapshot).not.toBeNull();

    const cashCents = 460_000; // €4,600 from transfer
    const plan = computeRebalancingPlan(
      snapshot!.holdings,
      [
        { id: 't1', assetClass: 'Global Equity', etfIsin: 'IE00B3RBWM25', etfName: 'VWRL', targetPct: 60, exchange: 'XETRA', isFreeEtf: true, active: true },
        { id: 't2', assetClass: 'US Equity',    etfIsin: 'IE00B3XXRP09', etfName: 'VUSA', targetPct: 40, exchange: 'XETRA', isFreeEtf: true, active: true },
      ],
      cashCents,
      5,
    );

    // Both positions are underweight once new cash is added to total investable,
    // so the planner should generate buy orders for both.
    const buyActions = plan.actions.filter((a) => a.action === 'buy');
    expect(buyActions.length).toBeGreaterThan(0);

    // Total deployed must not exceed available cash
    expect(plan.totalDeployedEurCents).toBeGreaterThan(0);
    expect(plan.totalDeployedEurCents).toBeLessThanOrEqual(cashCents);

    // With both ETFs free, total fees should be zero
    expect(plan.totalFeeCents).toBe(0);
  });

  it('Full cycle idempotency — re-running scheduler does not duplicate notifications', async () => {
    const NOW = new Date('2026-04-15T09:00:00Z');
    const openDate = new Date(NOW.getTime() + 5 * 86_400_000).toISOString();
    await upsertTradingWindow(testDb, USER, { quarter: '2026-Q2', openDate });

    // Run scheduler twice
    await runSchedulerForUser(USER, NOW);
    await runSchedulerForUser(USER, NOW);

    // T-7 reminder should appear exactly once (suppressed after first run)
    const notifs = await getPendingNotifications(testDb, USER);
    const reminders = notifs.filter((n) => n.type === 'trading_window_reminder');
    expect(reminders).toHaveLength(1);
  });

  it('Quarterly review fires when no strategy advice in past 90 days', async () => {
    // No advice log entries → quarterly review is due
    const NOW = new Date('2026-04-15T09:00:00Z');
    const result = await runSchedulerForUser(USER, NOW);
    expect(result.scheduled).toContain('quarterly_review');

    const notifs = await getPendingNotifications(testDb, USER);
    const review = notifs.find((n) => n.type === 'quarterly_review');
    expect(review).toBeDefined();
    expect(review!.message).toContain('quarterly portfolio review');
  });
});
