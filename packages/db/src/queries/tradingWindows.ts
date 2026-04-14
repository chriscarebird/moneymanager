import type { Client } from '@libsql/client';
import { randomUUID } from 'crypto';

export type TradingWindowState =
  | 'scheduled'
  | 'open'
  | 'advice_ready'
  | 'sold'
  | 'transfer_pending'
  | 'transfer_arrived'
  | 'complete';

export interface TradingWindow {
  id: string;
  userId: string;
  quarter: string; // e.g. "2026-Q1"
  openDate: string; // ISO 8601 date
  closeDate: string | null;
  state: TradingWindowState;
  adviceJson: string | null;
  sharesSold: number | null;
  proceedsUsdCents: number | null;
  transferId: string | null;
  createdAt: string;
  updatedAt: string;
}

function rowToWindow(row: Record<string, unknown>): TradingWindow {
  return {
    id: row['id'] as string,
    userId: row['user_id'] as string,
    quarter: row['quarter'] as string,
    openDate: row['open_date'] as string,
    closeDate: row['close_date'] as string | null,
    state: row['state'] as TradingWindowState,
    adviceJson: row['advice_json'] as string | null,
    sharesSold: row['shares_sold'] as number | null,
    proceedsUsdCents: row['proceeds_usd_cents'] as number | null,
    transferId: row['transfer_id'] as string | null,
    createdAt: row['created_at'] as string,
    updatedAt: row['updated_at'] as string,
  };
}

export async function getTradingWindows(
  client: Client,
  userId: string,
): Promise<TradingWindow[]> {
  const result = await client.execute({
    sql: `
      SELECT id, user_id, quarter, open_date, close_date, state,
             advice_json, shares_sold, proceeds_usd_cents, transfer_id,
             created_at, updated_at
      FROM trading_windows
      WHERE user_id = ?
      ORDER BY open_date DESC
    `,
    args: [userId],
  });
  return result.rows.map((r) => rowToWindow(r as Record<string, unknown>));
}

export async function getNextTradingWindow(
  client: Client,
  userId: string,
): Promise<TradingWindow | null> {
  const result = await client.execute({
    sql: `
      SELECT id, user_id, quarter, open_date, close_date, state,
             advice_json, shares_sold, proceeds_usd_cents, transfer_id,
             created_at, updated_at
      FROM trading_windows
      WHERE user_id = ? AND state NOT IN ('complete')
      ORDER BY open_date ASC
      LIMIT 1
    `,
    args: [userId],
  });
  if (result.rows.length === 0) return null;
  return rowToWindow(result.rows[0] as Record<string, unknown>);
}

export async function upsertTradingWindow(
  client: Client,
  userId: string,
  data: {
    quarter: string;
    openDate: string;
    closeDate?: string | null;
  },
): Promise<string> {
  const id = randomUUID();
  const now = new Date().toISOString();
  await client.execute({
    sql: `
      INSERT INTO trading_windows (id, user_id, quarter, open_date, close_date, state, updated_at)
      VALUES (?, ?, ?, ?, ?, 'scheduled', ?)
      ON CONFLICT (user_id, quarter) DO UPDATE SET
        open_date = excluded.open_date,
        close_date = excluded.close_date,
        updated_at = excluded.updated_at
    `,
    args: [id, userId, data.quarter, data.openDate, data.closeDate ?? null, now],
  });
  // Return the actual ID (may have been existing)
  const result = await client.execute({
    sql: 'SELECT id FROM trading_windows WHERE user_id = ? AND quarter = ?',
    args: [userId, data.quarter],
  });
  return result.rows[0]!['id'] as string;
}

export async function updateTradingWindowState(
  client: Client,
  windowId: string,
  state: TradingWindowState,
  extra?: {
    adviceJson?: string;
    sharesSold?: number;
    proceedsUsdCents?: number;
    transferId?: string;
  },
): Promise<void> {
  const now = new Date().toISOString();
  await client.execute({
    sql: `
      UPDATE trading_windows
      SET state = ?,
          advice_json = COALESCE(?, advice_json),
          shares_sold = COALESCE(?, shares_sold),
          proceeds_usd_cents = COALESCE(?, proceeds_usd_cents),
          transfer_id = COALESCE(?, transfer_id),
          updated_at = ?
      WHERE id = ?
    `,
    args: [
      state,
      extra?.adviceJson ?? null,
      extra?.sharesSold ?? null,
      extra?.proceedsUsdCents ?? null,
      extra?.transferId ?? null,
      now,
      windowId,
    ],
  });
}
