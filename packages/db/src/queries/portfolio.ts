import type { Client } from '@libsql/client';
import type { PortfolioSnapshot, Holding } from '@investpilot/core';

/**
 * Query helpers for portfolio_snapshots and holdings tables.
 * Phase 2 implementation — these are typed stubs.
 */

/**
 * Get all portfolio snapshots for a user (most recent first).
 *
 * @param client - libsql client
 * @param userId - User ID
 * @returns Array of snapshots (without holdings — use getSnapshotWithHoldings for full data)
 */
export async function getSnapshots(
  client: Client,
  userId: string,
): Promise<Omit<PortfolioSnapshot, 'holdings'>[]> {
  // TODO Phase 2: implement
  const result = await client.execute({
    sql: `
      SELECT id, date, source, raw_image_url
      FROM portfolio_snapshots
      WHERE user_id = ?
      ORDER BY date DESC
    `,
    args: [userId],
  });

  return result.rows.map((row) => ({
    id: row['id'] as string,
    date: row['date'] as string,
    source: row['source'] as 'screenshot' | 'manual',
    rawImageUrl: (row['raw_image_url'] as string | null) ?? null,
  }));
}

/**
 * Get a snapshot with its holdings.
 *
 * @param client - libsql client
 * @param snapshotId - Snapshot ID
 * @returns Full snapshot with holdings or null
 */
export async function getSnapshotWithHoldings(
  client: Client,
  snapshotId: string,
): Promise<PortfolioSnapshot | null> {
  // TODO Phase 2: implement
  const snapshotResult = await client.execute({
    sql: 'SELECT id, date, source, raw_image_url FROM portfolio_snapshots WHERE id = ?',
    args: [snapshotId],
  });

  const row = snapshotResult.rows[0];
  if (!row) return null;

  const holdingsResult = await client.execute({
    sql: `
      SELECT asset_type, name, isin, quantity, price_cents, value_cents, exchange
      FROM holdings
      WHERE snapshot_id = ?
      ORDER BY value_cents DESC
    `,
    args: [snapshotId],
  });

  const holdings: Holding[] = holdingsResult.rows.map((h) => ({
    snapshotId,
    assetType: h['asset_type'] as 'ETF' | 'Stock',
    name: h['name'] as string,
    isin: h['isin'] as string,
    quantity: h['quantity'] as number,
    priceCents: h['price_cents'] as number,
    valueCents: h['value_cents'] as number,
    exchange: h['exchange'] as string,
  }));

  return {
    id: row['id'] as string,
    date: row['date'] as string,
    source: row['source'] as 'screenshot' | 'manual',
    rawImageUrl: (row['raw_image_url'] as string | null) ?? null,
    holdings,
  };
}

/**
 * Get the most recent snapshot for a user.
 *
 * @param client - libsql client
 * @param userId - User ID
 * @returns Latest snapshot with holdings, or null if no snapshots
 */
export async function getLatestSnapshot(
  client: Client,
  userId: string,
): Promise<PortfolioSnapshot | null> {
  // TODO Phase 2: implement
  const result = await client.execute({
    sql: `
      SELECT id FROM portfolio_snapshots
      WHERE user_id = ?
      ORDER BY date DESC
      LIMIT 1
    `,
    args: [userId],
  });

  const row = result.rows[0];
  if (!row) return null;

  return getSnapshotWithHoldings(client, row['id'] as string);
}

/**
 * Get portfolio value history — date + total value for each snapshot (oldest first).
 * Used for the historical growth chart.
 */
export async function getSnapshotValueHistory(
  client: Client,
  userId: string,
): Promise<{ date: string; totalValueCents: number }[]> {
  const result = await client.execute({
    sql: `
      SELECT ps.date, COALESCE(SUM(h.value_cents), 0) AS total_value_cents
      FROM portfolio_snapshots ps
      LEFT JOIN holdings h ON h.snapshot_id = ps.id
      WHERE ps.user_id = ?
      GROUP BY ps.id, ps.date
      ORDER BY ps.date ASC
    `,
    args: [userId],
  });

  return result.rows.map((row) => ({
    date: row['date'] as string,
    totalValueCents: Number(row['total_value_cents']),
  }));
}

/**
 * Insert a new portfolio snapshot with its holdings.
 *
 * @param client - libsql client
 * @param snapshot - Snapshot to insert
 * @param userId - Owner user ID
 */
export async function insertSnapshot(
  client: Client,
  snapshot: PortfolioSnapshot,
  userId: string,
): Promise<void> {
  // TODO Phase 2: implement with transaction
  await client.execute({
    sql: `
      INSERT INTO portfolio_snapshots (id, user_id, date, source, raw_image_url)
      VALUES (?, ?, ?, ?, ?)
    `,
    args: [snapshot.id, userId, snapshot.date, snapshot.source, snapshot.rawImageUrl ?? null],
  });

  for (const holding of snapshot.holdings) {
    await client.execute({
      sql: `
        INSERT INTO holdings (snapshot_id, asset_type, name, isin, quantity, price_cents, value_cents, exchange)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `,
      args: [
        snapshot.id,
        holding.assetType,
        holding.name,
        holding.isin,
        holding.quantity,
        holding.priceCents,
        holding.valueCents,
        holding.exchange,
      ],
    });
  }
}
