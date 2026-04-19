import { randomUUID } from 'crypto';
import type { Client } from '@libsql/client';
import type { UberEquityType } from '@investpilot/core';

export interface MSEquitySnapshotItem {
  id: string;
  snapshotId: string;
  type: UberEquityType;
  sharesHeld: number;
  sharesAvailableToTransact: number;
  marketValueUsdCents: number;
  holdingPeriodActive: boolean;
}

export interface MSEquitySnapshot {
  id: string;
  userId: string;
  snapshotDate: string;
  createdAt: string;
  items: MSEquitySnapshotItem[];
}

export interface MSSnapshotHistoryPoint {
  date: string;
  totalUsdCents: number;
}

export interface MSEquityInput {
  type: UberEquityType;
  sharesHeld: number;
  sharesAvailableToTransact: number;
  marketValueUsdCents: number;
  holdingPeriodActive: boolean;
}

/**
 * Save a new MS equity snapshot (one row per equity type).
 * Returns the new snapshot id.
 */
export async function insertMSSnapshot(
  client: Client,
  userId: string,
  snapshotDate: string,
  items: MSEquityInput[],
): Promise<string> {
  const snapshotId = randomUUID();

  await client.execute({
    sql: `INSERT INTO ms_equity_snapshots (id, user_id, snapshot_date) VALUES (?, ?, ?)`,
    args: [snapshotId, userId, snapshotDate],
  });

  for (const item of items) {
    await client.execute({
      sql: `
        INSERT INTO ms_equity_snapshot_items
          (id, snapshot_id, type, shares_held, shares_available_to_transact,
           market_value_usd_cents, holding_period_active)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `,
      args: [
        randomUUID(),
        snapshotId,
        item.type,
        item.sharesHeld,
        item.sharesAvailableToTransact,
        item.marketValueUsdCents,
        item.holdingPeriodActive ? 1 : 0,
      ],
    });
  }

  return snapshotId;
}

/**
 * Return (date, totalUsdCents) pairs for the MS equity value history chart,
 * ordered oldest-first.
 */
export async function getMSSnapshotHistory(
  client: Client,
  userId: string,
): Promise<MSSnapshotHistoryPoint[]> {
  const result = await client.execute({
    sql: `
      SELECT s.snapshot_date AS date,
             COALESCE(SUM(i.market_value_usd_cents), 0) AS total_usd_cents
      FROM ms_equity_snapshots s
      LEFT JOIN ms_equity_snapshot_items i ON i.snapshot_id = s.id
      WHERE s.user_id = ?
      GROUP BY s.id, s.snapshot_date
      ORDER BY s.snapshot_date ASC
    `,
    args: [userId],
  });

  return result.rows.map((row) => ({
    date: row['date'] as string,
    totalUsdCents: row['total_usd_cents'] as number,
  }));
}

/**
 * Return the items from the most recent MS snapshot for a user.
 */
export async function getLatestMSSnapshot(
  client: Client,
  userId: string,
): Promise<MSEquitySnapshotItem[]> {
  const result = await client.execute({
    sql: `
      SELECT i.id, i.snapshot_id, i.type, i.shares_held,
             i.shares_available_to_transact, i.market_value_usd_cents,
             i.holding_period_active
      FROM ms_equity_snapshot_items i
      JOIN ms_equity_snapshots s ON s.id = i.snapshot_id
      WHERE s.user_id = ?
        AND s.snapshot_date = (
          SELECT MAX(snapshot_date) FROM ms_equity_snapshots WHERE user_id = ?
        )
      ORDER BY i.type
    `,
    args: [userId, userId],
  });

  return result.rows.map((row) => ({
    id: row['id'] as string,
    snapshotId: row['snapshot_id'] as string,
    type: row['type'] as UberEquityType,
    sharesHeld: row['shares_held'] as number,
    sharesAvailableToTransact: row['shares_available_to_transact'] as number,
    marketValueUsdCents: row['market_value_usd_cents'] as number,
    holdingPeriodActive: (row['holding_period_active'] as number) === 1,
  }));
}
